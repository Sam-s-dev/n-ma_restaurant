import { conflict, forbidden, unauthorized } from '../../core/errors';
import { query, queryOne } from '../../db/pool';
import { withTransaction } from '../../db/transaction';
import { hashPassword, verifyPassword } from '../../utils/password';
import { hashToken } from '../../utils/tokens';
import { issueSession, revokeAllSessions, type IssuedSession } from './session.service';
import type {
  AcceptInvitationInput,
  ChangePasswordInput,
  LoginInput,
  RegisterInput,
} from './auth.schemas';

export interface AuthenticatedProfile {
  user: {
    id: string;
    email: string;
    fullName: string;
    phone: string | null;
    isOwner: boolean;
  };
  restaurant: {
    id: string;
    name: string;
    status: string;
    currencyCode: string;
    currencySymbol: string;
    currencyDecimals: number;
    logoMediaId: string | null;
  };
}

const PROFILE_SQL = `
  SELECT u.id, u.email, u.full_name, u.phone, u.is_owner,
         r.id AS restaurant_id, r.name AS restaurant_name, r.status,
         r.currency_code, r.currency_symbol, r.currency_decimals, r.logo_media_id
    FROM users u
    JOIN restaurants r ON r.id = u.restaurant_id
   WHERE u.id = $1`;

interface ProfileRow {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  is_owner: boolean;
  restaurant_id: string;
  restaurant_name: string;
  status: string;
  currency_code: string;
  currency_symbol: string;
  currency_decimals: number;
  logo_media_id: string | null;
}

function toProfile(row: ProfileRow): AuthenticatedProfile {
  return {
    user: {
      id: row.id,
      email: row.email,
      fullName: row.full_name,
      phone: row.phone,
      isOwner: row.is_owner,
    },
    restaurant: {
      id: row.restaurant_id,
      name: row.restaurant_name,
      status: row.status,
      currencyCode: row.currency_code,
      currencySymbol: row.currency_symbol,
      currencyDecimals: row.currency_decimals,
      logoMediaId: row.logo_media_id,
    },
  };
}

export async function getProfile(userId: string): Promise<AuthenticatedProfile> {
  const row = await queryOne<ProfileRow>(PROFILE_SQL, [userId]);
  if (!row) throw unauthorized('Compte introuvable.');
  return toProfile(row);
}

/**
 * §2.b — Inscription : crée le restaurant en statut « pending » et son
 * premier utilisateur (propriétaire). Aucune session n'est délivrée :
 * la connexion reste bloquée tant que le Super Admin n'a pas activé
 * le compte (§2.a).
 */
export async function register(input: RegisterInput): Promise<{
  restaurantId: string;
  userId: string;
  status: string;
  message: string;
}> {
  const existing = await queryOne('SELECT 1 FROM users WHERE email = $1', [input.email]);
  if (existing) throw conflict('Cette adresse e-mail est déjà utilisée.');

  return withTransaction(async (tx) => {
    const restaurant = await tx.queryOne<{ id: string; status: string }>(
      `INSERT INTO restaurants
         (name, address, phone, currency_code, currency_symbol, currency_decimals, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending')
       RETURNING id, status`,
      [
        input.restaurantName,
        input.address ?? null,
        input.restaurantPhone ?? null,
        input.currencyCode,
        input.currencySymbol,
        input.currencyDecimals,
      ],
    );
    if (!restaurant) throw new Error('Création du restaurant impossible.');

    const passwordHash = await hashPassword(input.password);
    const user = await tx.queryOne<{ id: string }>(
      `INSERT INTO users (restaurant_id, email, password_hash, full_name, phone, is_owner)
       VALUES ($1, $2, $3, $4, $5, true)
       RETURNING id`,
      [restaurant.id, input.email, passwordHash, input.fullName, input.phone ?? null],
    );
    if (!user) throw new Error('Création de l’utilisateur impossible.');

    // Catégories de menu par défaut, pour que l'espace ne soit pas vide (§5).
    await tx.query(
      `INSERT INTO menu_categories (restaurant_id, name, position)
       VALUES ($1, 'Entrées', 1), ($1, 'Plats', 2), ($1, 'Boissons', 3), ($1, 'Desserts', 4)`,
      [restaurant.id],
    );

    return {
      restaurantId: restaurant.id,
      userId: user.id,
      status: restaurant.status,
      message:
        'Votre espace a été créé. Il doit être activé par l’administrateur de la plateforme avant la première connexion.',
    };
  });
}

export async function login(
  input: LoginInput,
  userAgent?: string,
): Promise<IssuedSession & { profile: AuthenticatedProfile }> {
  const row = await queryOne<
    ProfileRow & { password_hash: string; is_active: boolean; status_reason: string | null }
  >(
    `SELECT u.id, u.email, u.full_name, u.phone, u.is_owner, u.password_hash, u.is_active,
            r.id AS restaurant_id, r.name AS restaurant_name, r.status, r.status_reason,
            r.currency_code, r.currency_symbol, r.currency_decimals, r.logo_media_id
       FROM users u
       JOIN restaurants r ON r.id = u.restaurant_id
      WHERE u.email = $1`,
    [input.email],
  );

  // Message identique dans les deux cas : on n'indique pas si l'e-mail existe.
  const genericFailure = unauthorized('E-mail ou mot de passe incorrect.');
  if (!row) {
    // Comparaison factice pour garder un temps de réponse constant.
    await verifyPassword(input.password, '$2b$12$0000000000000000000000000000000000000000000000000000');
    throw genericFailure;
  }

  const valid = await verifyPassword(input.password, row.password_hash);
  if (!valid) throw genericFailure;

  if (!row.is_active) throw forbidden('Votre compte a été désactivé par votre gérant.');

  // §2.a — un restaurant non activé ne peut pas se connecter.
  if (row.status === 'pending') {
    throw forbidden('Votre restaurant est en attente d’activation par l’administrateur.');
  }
  if (row.status === 'disabled') {
    throw forbidden(
      row.status_reason
        ? `Accès suspendu : ${row.status_reason}`
        : 'L’accès de votre restaurant a été suspendu. Contactez l’administrateur.',
    );
  }

  await query('UPDATE users SET last_login_at = now() WHERE id = $1', [row.id]);

  const session = await issueSession({
    subjectType: 'user',
    subjectId: row.id,
    restaurantId: row.restaurant_id,
    ...(userAgent ? { userAgent } : {}),
  });

  return { ...session, profile: toProfile(row) };
}

export async function changePassword(
  userId: string,
  input: ChangePasswordInput,
): Promise<void> {
  const row = await queryOne<{ password_hash: string }>(
    'SELECT password_hash FROM users WHERE id = $1',
    [userId],
  );
  if (!row) throw unauthorized();

  const valid = await verifyPassword(input.currentPassword, row.password_hash);
  if (!valid) throw unauthorized('Mot de passe actuel incorrect.');

  const passwordHash = await hashPassword(input.newPassword);
  await query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, userId]);

  // Toutes les autres sessions sont invalidées.
  await revokeAllSessions('user', userId);
}

/**
 * §2.b — Un invité rejoint le restaurant avec exactement les mêmes droits
 * que celui qui l'a invité.
 */
export async function acceptInvitation(
  input: AcceptInvitationInput,
  userAgent?: string,
): Promise<IssuedSession & { profile: AuthenticatedProfile }> {
  const invitation = await queryOne<{
    id: string;
    restaurant_id: string;
    email: string;
    status: string;
  }>(
    `SELECT i.id, i.restaurant_id, i.email, r.status
       FROM user_invitations i
       JOIN restaurants r ON r.id = i.restaurant_id
      WHERE i.token_hash = $1
        AND i.accepted_at IS NULL
        AND i.revoked_at IS NULL
        AND i.expires_at > now()`,
    [hashToken(input.token)],
  );

  if (!invitation) throw unauthorized('Invitation invalide, déjà utilisée ou expirée.');
  if (invitation.status !== 'active') {
    throw forbidden('Ce restaurant n’est pas actif, l’invitation ne peut pas être acceptée.');
  }

  const taken = await queryOne('SELECT 1 FROM users WHERE email = $1', [invitation.email]);
  if (taken) throw conflict('Un compte existe déjà avec cette adresse e-mail.');

  const userId = await withTransaction(async (tx) => {
    const passwordHash = await hashPassword(input.password);
    const user = await tx.queryOne<{ id: string }>(
      `INSERT INTO users (restaurant_id, email, password_hash, full_name, phone, is_owner)
       VALUES ($1, $2, $3, $4, $5, false)
       RETURNING id`,
      [
        invitation.restaurant_id,
        invitation.email,
        passwordHash,
        input.fullName,
        input.phone ?? null,
      ],
    );
    if (!user) throw new Error('Création de l’utilisateur impossible.');

    await tx.query('UPDATE user_invitations SET accepted_at = now() WHERE id = $1', [
      invitation.id,
    ]);
    return user.id;
  });

  const session = await issueSession({
    subjectType: 'user',
    subjectId: userId,
    restaurantId: invitation.restaurant_id,
    ...(userAgent ? { userAgent } : {}),
  });

  return { ...session, profile: await getProfile(userId) };
}

/** Consultation publique d'une invitation avant de remplir le formulaire. */
export async function inspectInvitation(token: string): Promise<{
  email: string;
  restaurantName: string;
  expiresAt: string;
}> {
  const row = await queryOne<{ email: string; name: string; expires_at: Date }>(
    `SELECT i.email, r.name, i.expires_at
       FROM user_invitations i
       JOIN restaurants r ON r.id = i.restaurant_id
      WHERE i.token_hash = $1
        AND i.accepted_at IS NULL
        AND i.revoked_at IS NULL
        AND i.expires_at > now()`,
    [hashToken(token)],
  );
  if (!row) throw unauthorized('Invitation invalide ou expirée.');
  return {
    email: row.email,
    restaurantName: row.name,
    expiresAt: row.expires_at.toISOString(),
  };
}

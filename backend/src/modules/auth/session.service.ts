import { query, queryOne } from '../../db/pool';
import { unauthorized } from '../../core/errors';
import {
  generateOpaqueToken,
  hashToken,
  refreshTokenExpiry,
  signAccessToken,
  type SubjectType,
} from '../../utils/tokens';

export interface IssuedSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
}

/** Crée un couple access + refresh token et persiste le refresh (hashé). */
export async function issueSession(params: {
  subjectType: SubjectType;
  subjectId: string;
  restaurantId?: string;
  userAgent?: string;
}): Promise<IssuedSession> {
  const accessToken = signAccessToken({
    sub: params.subjectId,
    typ: params.subjectType,
    ...(params.restaurantId ? { rid: params.restaurantId } : {}),
  });

  const { token, hash } = generateOpaqueToken();
  const expiresAt = refreshTokenExpiry();

  await query(
    `INSERT INTO refresh_tokens (subject_type, subject_id, token_hash, expires_at, user_agent)
     VALUES ($1, $2, $3, $4, $5)`,
    [params.subjectType, params.subjectId, hash, expiresAt, params.userAgent ?? null],
  );

  return { accessToken, refreshToken: token, expiresAt: expiresAt.toISOString() };
}

/**
 * Rotation du refresh token : l'ancien est révoqué à l'usage. Un jeton
 * rejoué (déjà révoqué) est donc rejeté.
 */
export async function rotateSession(
  refreshToken: string,
  userAgent?: string,
): Promise<IssuedSession & { subjectType: SubjectType; subjectId: string }> {
  const hash = hashToken(refreshToken);

  const row = await queryOne<{
    id: string;
    subject_type: SubjectType;
    subject_id: string;
  }>(
    `SELECT id, subject_type, subject_id
       FROM refresh_tokens
      WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()`,
    [hash],
  );

  if (!row) throw unauthorized('Session expirée, veuillez vous reconnecter.');

  await query('UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1', [row.id]);

  let restaurantId: string | undefined;
  if (row.subject_type === 'user') {
    const user = await queryOne<{ restaurant_id: string; is_active: boolean; status: string }>(
      `SELECT u.restaurant_id, u.is_active, r.status
         FROM users u JOIN restaurants r ON r.id = u.restaurant_id
        WHERE u.id = $1`,
      [row.subject_id],
    );
    if (!user || !user.is_active) throw unauthorized('Compte inaccessible.');
    if (user.status !== 'active') throw unauthorized('Restaurant non actif.');
    restaurantId = user.restaurant_id;
  } else {
    const admin = await queryOne<{ is_active: boolean }>(
      'SELECT is_active FROM super_admins WHERE id = $1',
      [row.subject_id],
    );
    if (!admin || !admin.is_active) throw unauthorized('Compte inaccessible.');
  }

  const session = await issueSession({
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    ...(restaurantId ? { restaurantId } : {}),
    ...(userAgent ? { userAgent } : {}),
  });

  return { ...session, subjectType: row.subject_type, subjectId: row.subject_id };
}

export async function revokeSession(refreshToken: string): Promise<void> {
  await query(
    'UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL',
    [hashToken(refreshToken)],
  );
}

/** Utilisé lors d'un changement de mot de passe ou d'une désactivation. */
export async function revokeAllSessions(
  subjectType: SubjectType,
  subjectId: string,
): Promise<void> {
  await query(
    `UPDATE refresh_tokens SET revoked_at = now()
      WHERE subject_type = $1 AND subject_id = $2 AND revoked_at IS NULL`,
    [subjectType, subjectId],
  );
}

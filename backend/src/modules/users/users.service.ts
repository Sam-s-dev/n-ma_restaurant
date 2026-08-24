import { badRequest, conflict, notFound } from '../../core/errors';
import { buildUpdate } from '../../core/sqlBuilder';
import { query, queryOne } from '../../db/pool';
import { generateOpaqueToken } from '../../utils/tokens';
import { revokeAllSessions } from '../auth/session.service';
import type { InviteUserInput, UpdateMemberInput } from './users.schemas';

export interface Member {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  isOwner: boolean;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

interface MemberRow {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  is_owner: boolean;
  is_active: boolean;
  last_login_at: Date | null;
  created_at: Date;
}

const toMember = (row: MemberRow): Member => ({
  id: row.id,
  email: row.email,
  fullName: row.full_name,
  phone: row.phone,
  isOwner: row.is_owner,
  isActive: row.is_active,
  lastLoginAt: row.last_login_at?.toISOString() ?? null,
  createdAt: row.created_at.toISOString(),
});

export async function listMembers(restaurantId: string): Promise<Member[]> {
  const rows = await query<MemberRow>(
    `SELECT id, email, full_name, phone, is_owner, is_active, last_login_at, created_at
       FROM users WHERE restaurant_id = $1
      ORDER BY is_owner DESC, full_name`,
    [restaurantId],
  );
  return rows.map(toMember);
}

export async function updateMember(
  restaurantId: string,
  memberId: string,
  actorId: string,
  input: UpdateMemberInput,
): Promise<Member> {
  const target = await queryOne<{ is_owner: boolean }>(
    'SELECT is_owner FROM users WHERE id = $1 AND restaurant_id = $2',
    [memberId, restaurantId],
  );
  if (!target) throw notFound('Utilisateur');

  if (input.isActive === false) {
    if (memberId === actorId) throw badRequest('Vous ne pouvez pas désactiver votre propre compte.');
    if (target.is_owner) throw badRequest('Le compte propriétaire ne peut pas être désactivé.');
  }

  const { setClause, values, nextIndex } = buildUpdate(input, {
    fullName: 'full_name',
    phone: 'phone',
    isActive: 'is_active',
  });

  const row = await queryOne<MemberRow>(
    `UPDATE users SET ${setClause}
      WHERE id = $${nextIndex} AND restaurant_id = $${nextIndex + 1}
      RETURNING id, email, full_name, phone, is_owner, is_active, last_login_at, created_at`,
    [...values, memberId, restaurantId],
  );
  if (!row) throw notFound('Utilisateur');

  if (input.isActive === false) await revokeAllSessions('user', memberId);

  return toMember(row);
}

export interface Invitation {
  id: string;
  email: string;
  expiresAt: string;
  createdAt: string;
  invitedBy: string | null;
  /** Communiqué une seule fois, à la création : il n'est jamais restocké en clair. */
  token?: string;
}

/**
 * §2.b — Le gérant invite un collègue qui aura exactement les mêmes droits.
 * L'envoi du lien est laissé à l'application (partage WhatsApp / SMS) :
 * pas de dépendance à un service d'e-mail pour cette version.
 */
export async function inviteUser(
  restaurantId: string,
  invitedBy: string,
  input: InviteUserInput,
): Promise<Invitation> {
  const existingUser = await queryOne('SELECT 1 FROM users WHERE email = $1', [input.email]);
  if (existingUser) throw conflict('Un compte existe déjà avec cette adresse e-mail.');

  // Une invitation en attente pour ce même e-mail est remplacée.
  await query(
    `UPDATE user_invitations SET revoked_at = now()
      WHERE restaurant_id = $1 AND email = $2 AND accepted_at IS NULL AND revoked_at IS NULL`,
    [restaurantId, input.email],
  );

  const { token, hash } = generateOpaqueToken();
  const expiresAt = new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000);

  const row = await queryOne<{ id: string; created_at: Date }>(
    `INSERT INTO user_invitations (restaurant_id, email, token_hash, invited_by, expires_at)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, created_at`,
    [restaurantId, input.email, hash, invitedBy, expiresAt],
  );
  if (!row) throw new Error('Création de l’invitation impossible.');

  return {
    id: row.id,
    email: input.email,
    expiresAt: expiresAt.toISOString(),
    createdAt: row.created_at.toISOString(),
    invitedBy,
    token,
  };
}

export async function listInvitations(restaurantId: string): Promise<Invitation[]> {
  const rows = await query<{
    id: string;
    email: string;
    expires_at: Date;
    created_at: Date;
    invited_by: string | null;
  }>(
    `SELECT id, email, expires_at, created_at, invited_by
       FROM user_invitations
      WHERE restaurant_id = $1 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now()
      ORDER BY created_at DESC`,
    [restaurantId],
  );

  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    expiresAt: row.expires_at.toISOString(),
    createdAt: row.created_at.toISOString(),
    invitedBy: row.invited_by,
  }));
}

export async function revokeInvitation(restaurantId: string, invitationId: string): Promise<void> {
  const row = await queryOne(
    `UPDATE user_invitations SET revoked_at = now()
      WHERE id = $1 AND restaurant_id = $2 AND accepted_at IS NULL AND revoked_at IS NULL
      RETURNING id`,
    [invitationId, restaurantId],
  );
  if (!row) throw notFound('Invitation');
}

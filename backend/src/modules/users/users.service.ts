import { badRequest, conflict, notFound } from '../../core/errors';
import { ROLE_LABELS, type Role } from '../../core/permissions';
import { notify } from '../notifications/notifications.service';
import { buildUpdate } from '../../core/sqlBuilder';
import { query, queryOne } from '../../db/pool';
import { withTransaction, type Tx } from '../../db/transaction';
import { round2 } from '../../utils/money';
import { hashPassword } from '../../utils/password';
import { generateOpaqueToken } from '../../utils/tokens';
import { revokeAllSessions } from '../auth/session.service';
import type { CreateMemberInput, InviteUserInput, UpdateMemberInput } from './users.schemas';

export interface Member {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  isOwner: boolean;
  role: Role;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  /** Fiche employé rattachée ; absente pour un compte créé avant le lien. */
  employee: { id: string; position: string } | null;
}

interface MemberRow {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  is_owner: boolean;
  role: Role;
  is_active: boolean;
  last_login_at: Date | null;
  created_at: Date;
  employee_id: string | null;
  employee_position: string | null;
}

const MEMBER_SELECT = `
  SELECT u.id, u.email, u.full_name, u.phone, u.is_owner, u.role, u.is_active,
         u.last_login_at, u.created_at,
         e.id AS employee_id, e.position AS employee_position
    FROM users u
    LEFT JOIN employees e ON e.user_id = u.id`;

const toMember = (row: MemberRow): Member => ({
  id: row.id,
  email: row.email,
  fullName: row.full_name,
  phone: row.phone,
  isOwner: row.is_owner,
  role: row.role,
  isActive: row.is_active,
  lastLoginAt: row.last_login_at?.toISOString() ?? null,
  createdAt: row.created_at.toISOString(),
  employee: row.employee_id
    ? { id: row.employee_id, position: row.employee_position ?? '' }
    : null,
});

export async function listMembers(restaurantId: string): Promise<Member[]> {
  const rows = await query<MemberRow>(
    `${MEMBER_SELECT} WHERE u.restaurant_id = $1
      ORDER BY u.is_owner DESC, u.role = 'manager' DESC, u.full_name`,
    [restaurantId],
  );
  return rows.map(toMember);
}

async function getMember(restaurantId: string, memberId: string): Promise<Member> {
  const row = await queryOne<MemberRow>(
    `${MEMBER_SELECT} WHERE u.id = $1 AND u.restaurant_id = $2`,
    [memberId, restaurantId],
  );
  if (!row) throw notFound('Utilisateur');
  return toMember(row);
}

/** Rattache un compte à une fiche employé qui n'en a pas encore. */
async function linkEmployee(
  tx: Tx,
  restaurantId: string,
  employeeId: string,
  userId: string,
): Promise<void> {
  const employee = await tx.queryOne<{ user_id: string | null; is_active: boolean }>(
    'SELECT user_id, is_active FROM employees WHERE id = $1 AND restaurant_id = $2 FOR UPDATE',
    [employeeId, restaurantId],
  );
  if (!employee) throw notFound('Employé');
  if (!employee.is_active) throw conflict('Cet employé ne fait plus partie du personnel.');
  if (employee.user_id && employee.user_id !== userId) {
    throw conflict('Cet employé a déjà un compte dans l’application.');
  }
  await tx.query(
    'UPDATE employees SET user_id = NULL WHERE user_id = $1 AND restaurant_id = $2',
    [userId, restaurantId],
  );
  await tx.query('UPDATE employees SET user_id = $1 WHERE id = $2', [userId, employeeId]);
}

/**
 * §2.b — Le gérant crée directement le compte d'un collègue, avec le rôle
 * qui correspond à son poste. Le statut de propriétaire reste attaché au
 * créateur de l'espace, seul compte impossible à désactiver.
 *
 * Le compte naît toujours rattaché à une fiche employé : celle qui existe
 * déjà, ou une nouvelle créée dans la même transaction. Ainsi personne n'a
 * accès à l'application sans salaire ni pointage.
 */
export async function createMember(
  restaurantId: string,
  input: CreateMemberInput,
): Promise<Member> {
  // L'adresse est unique sur toute la plateforme (contrainte `users.email`) :
  // on le vérifie ici pour renvoyer un message clair plutôt qu'une erreur
  // de contrainte, et sans révéler à quel restaurant appartient l'adresse.
  const existing = await queryOne<{ id: string }>('SELECT id FROM users WHERE email = $1', [
    input.email,
  ]);
  if (existing) {
    throw conflict('Cette adresse e-mail est déjà utilisée par un compte.');
  }

  const pending = await queryOne<{ id: string }>(
    `SELECT id FROM user_invitations
      WHERE restaurant_id = $1 AND email = $2
        AND accepted_at IS NULL AND revoked_at IS NULL`,
    [restaurantId, input.email],
  );
  // Une invitation en attente pour la même adresse n'a plus lieu d'être.
  if (pending) {
    await query('UPDATE user_invitations SET revoked_at = now() WHERE id = $1', [pending.id]);
  }

  const passwordHash = await hashPassword(input.password);

  const userId = await withTransaction(async (tx) => {
    const row = await tx.queryOne<{ id: string }>(
      `INSERT INTO users (restaurant_id, email, password_hash, full_name, phone, role)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [restaurantId, input.email, passwordHash, input.fullName, input.phone ?? null, input.role],
    );
    if (!row) throw new Error('Création du compte impossible.');

    if (input.employeeId) {
      await linkEmployee(tx, restaurantId, input.employeeId, row.id);
    } else if (input.employee) {
      await tx.query(
        `INSERT INTO employees
           (restaurant_id, full_name, position, phone, hire_date, monthly_salary, user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          restaurantId,
          input.fullName,
          input.employee.position,
          input.phone ?? null,
          input.employee.hireDate,
          round2(input.employee.monthlySalary),
          row.id,
        ],
      );
    }
    return row.id;
  });

  return getMember(restaurantId, userId);
}

/**
 * Retire l'accès d'un collègue. Le compte est supprimé s'il n'a rien
 * saisi ; sinon il est désactivé, pour que les ventes et les dépenses
 * gardent le nom de celui qui les a enregistrées.
 */
export async function removeMember(
  restaurantId: string,
  memberId: string,
  actorId: string,
): Promise<void> {
  if (memberId === actorId) throw badRequest('Vous ne pouvez pas supprimer votre propre compte.');

  const target = await queryOne<{ is_owner: boolean }>(
    'SELECT is_owner FROM users WHERE id = $1 AND restaurant_id = $2',
    [memberId, restaurantId],
  );
  if (!target) throw notFound('Utilisateur');
  if (target.is_owner) throw badRequest('Le compte propriétaire ne peut pas être supprimé.');

  await revokeAllSessions('user', memberId);

  try {
    const removed = await queryOne('DELETE FROM users WHERE id = $1 RETURNING id', [memberId]);
    if (!removed) throw notFound('Utilisateur');
  } catch (error) {
    // Des écritures pointent sur ce compte : on le désactive pour ne pas
    // effacer l'auteur d'une vente ou d'une dépense.
    if ((error as { code?: string }).code === '23503') {
      await query('UPDATE users SET is_active = false WHERE id = $1', [memberId]);
      return;
    }
    throw error;
  }
}

export async function updateMember(
  restaurantId: string,
  memberId: string,
  actorId: string,
  input: UpdateMemberInput,
): Promise<Member> {
  const target = await queryOne<{ is_owner: boolean; role: Role }>(
    'SELECT is_owner, role FROM users WHERE id = $1 AND restaurant_id = $2',
    [memberId, restaurantId],
  );
  if (!target) throw notFound('Utilisateur');

  if (input.isActive === false) {
    if (memberId === actorId) throw badRequest('Vous ne pouvez pas désactiver votre propre compte.');
    if (target.is_owner) throw badRequest('Le compte propriétaire ne peut pas être désactivé.');
  }

  const roleChanges = input.role !== undefined && input.role !== target.role;
  if (roleChanges) {
    // Sans ces deux garde-fous, un restaurant pourrait se retrouver sans
    // aucun gérant, et plus personne pour rétablir les droits.
    if (memberId === actorId) throw badRequest('Vous ne pouvez pas changer votre propre rôle.');
    if (target.is_owner) throw badRequest('Le créateur de l’espace reste gérant.');
  }

  const { employeeId, ...fields } = input;
  const hasFields = Object.values(fields).some((value) => value !== undefined);
  if (!hasFields && !employeeId) throw badRequest('Aucun champ à mettre à jour.');

  await withTransaction(async (tx) => {
    if (hasFields) {
      const { setClause, values, nextIndex } = buildUpdate(fields, {
        fullName: 'full_name',
        phone: 'phone',
        isActive: 'is_active',
        role: 'role',
      });
      await tx.query(
        `UPDATE users SET ${setClause}
          WHERE id = $${nextIndex} AND restaurant_id = $${nextIndex + 1}`,
        [...values, memberId, restaurantId],
      );
    }
    if (employeeId) await linkEmployee(tx, restaurantId, employeeId, memberId);
  });

  // Un nouveau rôle oblige à se reconnecter : l'application recharge alors
  // les écrans auxquels la personne a droit. Le serveur, lui, applique le
  // changement dès la requête suivante.
  if (input.isActive === false || roleChanges) await revokeAllSessions('user', memberId);

  const member = await getMember(restaurantId, memberId);

  if (roleChanges) {
    await notify({
      restaurantId,
      to: { userIds: [memberId] },
      kind: 'member.role_changed',
      title: 'Votre rôle a changé',
      body: `Vous êtes désormais ${ROLE_LABELS[member.role].toLowerCase()}. Vos écrans ont été mis à jour.`,
      route: 'settings',
      entityId: memberId,
    });
  }

  return member;
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
 * §2.b — Le gérant invite un collègue, avec le rôle qu'il aura en arrivant.
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
    `INSERT INTO user_invitations (restaurant_id, email, token_hash, invited_by, expires_at, role)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, created_at`,
    [restaurantId, input.email, hash, invitedBy, expiresAt, input.role],
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

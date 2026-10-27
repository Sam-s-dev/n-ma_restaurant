import { badRequest, conflict, notFound } from '../../core/errors';
import { buildUpdate } from '../../core/sqlBuilder';
import { query, queryOne } from '../../db/pool';
import { withTransaction, type Tx } from '../../db/transaction';
import { round2 } from '../../utils/money';
import { reverseMovements } from '../cash/cash.service';
import { insertExpense } from '../expenses/expenses.service';
import { notify } from '../notifications/notifications.service';
import type {
  BulkAttendanceInput,
  CreateEmployeeInput,
  CreateEmployeeNoteInput,
  ListEmployeesInput,
  MarkAttendanceInput,
  PaySalaryInput,
  UpdateEmployeeInput,
} from './staff.schemas';

// -------------------------------------------------------------------------
// Fiches employés (§4)
// -------------------------------------------------------------------------

export interface Employee {
  id: string;
  fullName: string;
  position: string;
  phone: string | null;
  hireDate: string;
  monthlySalary: number;
  isActive: boolean;
  endDate: string | null;
  photoMediaId: string | null;
  photoUrl: string | null;
  note: string | null;
  /** Compte de l'application rattaché à cet employé, s'il en a un. */
  account: { userId: string; email: string; role: string; isActive: boolean } | null;
  salary?: SalaryBalance;
}

export interface SalaryBalance {
  monthlySalary: number;
  monthsElapsed: number;
  totalAccrued: number;
  totalPaid: number;
  balanceDue: number;
  lastPaymentAt: string | null;
}

interface EmployeeRow {
  id: string;
  full_name: string;
  position: string;
  phone: string | null;
  hire_date: string;
  monthly_salary: number;
  is_active: boolean;
  end_date: string | null;
  photo_media_id: string | null;
  note: string | null;
  user_id: string | null;
  user_email: string | null;
  user_role: string | null;
  user_active: boolean | null;
}

const toEmployee = (row: EmployeeRow): Employee => ({
  id: row.id,
  fullName: row.full_name,
  position: row.position,
  phone: row.phone,
  hireDate: row.hire_date,
  monthlySalary: row.monthly_salary,
  isActive: row.is_active,
  endDate: row.end_date,
  photoMediaId: row.photo_media_id,
  photoUrl: row.photo_media_id ? `/api/media/${row.photo_media_id}` : null,
  note: row.note,
  account: row.user_id
    ? {
        userId: row.user_id,
        email: row.user_email ?? '',
        role: row.user_role ?? '',
        isActive: row.user_active ?? false,
      }
    : null,
});

const SELECT = `
  SELECT e.id, e.full_name, e.position, e.phone, e.hire_date, e.monthly_salary,
         e.is_active, e.end_date, e.photo_media_id, e.note,
         e.user_id, u.email AS user_email, u.role AS user_role, u.is_active AS user_active
    FROM employees e
    LEFT JOIN users u ON u.id = e.user_id`;

export async function listEmployees(
  restaurantId: string,
  input: ListEmployeesInput,
): Promise<Employee[]> {
  const conditions = ['e.restaurant_id = $1'];
  const params: unknown[] = [restaurantId];

  if (!input.includeInactive) conditions.push('e.is_active');
  if (input.withoutAccount) conditions.push('e.user_id IS NULL');
  if (input.search) {
    params.push(`%${input.search}%`);
    conditions.push(`(e.full_name ILIKE $${params.length} OR e.position ILIKE $${params.length})`);
  }

  const rows = await query<EmployeeRow>(
    `${SELECT} WHERE ${conditions.join(' AND ')} ORDER BY e.is_active DESC, e.full_name`,
    params,
  );
  return rows.map(toEmployee);
}

export async function getEmployee(restaurantId: string, id: string): Promise<Employee> {
  const row = await queryOne<EmployeeRow>(`${SELECT} WHERE e.id = $1 AND e.restaurant_id = $2`, [
    id,
    restaurantId,
  ]);
  if (!row) throw notFound('Employé');
  return { ...toEmployee(row), salary: await getSalaryBalance(restaurantId, id) };
}

export async function createEmployee(
  restaurantId: string,
  input: CreateEmployeeInput,
): Promise<Employee> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO employees
       (restaurant_id, full_name, position, phone, hire_date, monthly_salary, photo_media_id, note)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [
      restaurantId,
      input.fullName,
      input.position,
      input.phone ?? null,
      input.hireDate,
      round2(input.monthlySalary),
      input.photoMediaId ?? null,
      input.note ?? null,
    ],
  );
  if (!row) throw new Error('Création de l’employé impossible.');
  return getEmployee(restaurantId, row.id);
}

export async function updateEmployee(
  restaurantId: string,
  id: string,
  input: UpdateEmployeeInput,
): Promise<Employee> {
  const payload = {
    ...input,
    ...(input.monthlySalary !== undefined ? { monthlySalary: round2(input.monthlySalary) } : {}),
  };

  const { setClause, values, nextIndex } = buildUpdate(payload, {
    fullName: 'full_name',
    position: 'position',
    phone: 'phone',
    hireDate: 'hire_date',
    monthlySalary: 'monthly_salary',
    photoMediaId: 'photo_media_id',
    note: 'note',
    isActive: 'is_active',
    endDate: 'end_date',
  });

  const row = await queryOne<{ id: string }>(
    `UPDATE employees SET ${setClause}
      WHERE id = $${nextIndex} AND restaurant_id = $${nextIndex + 1} RETURNING id`,
    [...values, id, restaurantId],
  );
  if (!row) throw notFound('Employé');
  return getEmployee(restaurantId, id);
}

export async function deleteEmployee(restaurantId: string, id: string): Promise<void> {
  // Retirer la fiche laisserait un compte actif sans employé derrière : on
  // demande de couper l'accès d'abord, là où il a été donné.
  const linked = await queryOne<{ user_active: boolean }>(
    `SELECT u.is_active AS user_active
       FROM employees e JOIN users u ON u.id = e.user_id
      WHERE e.id = $1 AND e.restaurant_id = $2`,
    [id, restaurantId],
  );
  if (linked?.user_active) {
    throw conflict(
      'Cet employé a un compte dans l’application. Retirez d’abord son accès (Paramètres → L’équipe).',
    );
  }

  const paid = await queryOne<{ count: number }>(
    'SELECT count(*)::int AS count FROM salary_payments WHERE employee_id = $1',
    [id],
  );

  // Un employé déjà payé conserve son historique : on le désactive.
  if ((paid?.count ?? 0) > 0) {
    const row = await queryOne(
      `UPDATE employees SET is_active = false, end_date = COALESCE(end_date, CURRENT_DATE)
        WHERE id = $1 AND restaurant_id = $2 RETURNING id`,
      [id, restaurantId],
    );
    if (!row) throw notFound('Employé');
    return;
  }

  const row = await queryOne(
    'DELETE FROM employees WHERE id = $1 AND restaurant_id = $2 RETURNING id',
    [id, restaurantId],
  );
  if (!row) throw notFound('Employé');
}

// -------------------------------------------------------------------------
// Pointage (§4)
// -------------------------------------------------------------------------

export interface Attendance {
  id: string;
  employeeId: string;
  employeeName?: string;
  day: string;
  status: string;
  arrivalTime: string | null;
  note: string | null;
}

interface AttendanceRow {
  id: string;
  employee_id: string;
  employee_name?: string;
  day: string;
  status: string;
  arrival_time: string | null;
  note: string | null;
}

const toAttendance = (row: AttendanceRow): Attendance => ({
  id: row.id,
  employeeId: row.employee_id,
  ...(row.employee_name !== undefined ? { employeeName: row.employee_name } : {}),
  day: row.day,
  status: row.status,
  // PostgreSQL renvoie « 08:45:00 » : les secondes n'intéressent personne.
  arrivalTime: row.arrival_time ? row.arrival_time.slice(0, 5) : null,
  note: row.note,
});

const UPSERT_ATTENDANCE = `
  INSERT INTO attendances (restaurant_id, employee_id, day, status, arrival_time, note, created_by)
  SELECT $1, $2, $3, $4, $5, $6, $7
   WHERE EXISTS (SELECT 1 FROM employees WHERE id = $2 AND restaurant_id = $1)
  ON CONFLICT (employee_id, day)
  DO UPDATE SET status = EXCLUDED.status, arrival_time = EXCLUDED.arrival_time,
                note = EXCLUDED.note
  RETURNING id, employee_id, day, status, arrival_time, note`;

const ATTENDANCE_LABELS: Record<string, string> = {
  late: 'en retard',
  absent: 'absent',
};

/**
 * Un retard ou une absence pointés sont signalés à l'intéressé, s'il a un
 * compte : il le découvre sur le moment plutôt qu'au jour de la paie.
 */
async function notifyAttendance(
  tx: Tx,
  restaurantId: string,
  actorId: string,
  attendance: Attendance,
): Promise<void> {
  const label = ATTENDANCE_LABELS[attendance.status];
  if (!label) return;

  const employee = await tx.queryOne<{ user_id: string | null }>(
    'SELECT user_id FROM employees WHERE id = $1 AND restaurant_id = $2',
    [attendance.employeeId, restaurantId],
  );
  if (!employee?.user_id) return;

  await notify(
    {
      restaurantId,
      to: { userIds: [employee.user_id] },
      exceptUserId: actorId,
      kind: `attendance.${attendance.status}`,
      title: attendance.status === 'late' ? 'Retard noté' : 'Absence notée',
      body: `Vous avez été pointé ${label} le ${attendance.day}${
        attendance.arrivalTime ? ` (arrivée à ${attendance.arrivalTime})` : ''
      }${attendance.note ? ` : « ${attendance.note} »` : '.'}`,
      route: 'settings',
      entityId: attendance.id,
    },
    tx,
  );
}

export async function markAttendance(
  restaurantId: string,
  employeeId: string,
  userId: string,
  input: MarkAttendanceInput,
): Promise<Attendance> {
  return withTransaction(async (tx) => {
    const row = await tx.queryOne<AttendanceRow>(UPSERT_ATTENDANCE, [
      restaurantId,
      employeeId,
      input.day,
      input.status,
      input.arrivalTime ?? null,
      input.note ?? null,
      userId,
    ]);
    if (!row) throw notFound('Employé');

    const attendance = toAttendance(row);
    await notifyAttendance(tx, restaurantId, userId, attendance);
    return attendance;
  });
}

/** Pointage de toute l'équipe en une fois, pour la journée. */
export async function markAttendanceBulk(
  restaurantId: string,
  userId: string,
  input: BulkAttendanceInput,
): Promise<Attendance[]> {
  return withTransaction(async (tx) => {
    const results: Attendance[] = [];
    for (const entry of input.entries) {
      const row = await tx.queryOne<AttendanceRow>(UPSERT_ATTENDANCE, [
        restaurantId,
        entry.employeeId,
        input.day,
        entry.status,
        entry.arrivalTime ?? null,
        entry.note ?? null,
        userId,
      ]);
      if (!row) throw badRequest(`Employé inconnu dans ce restaurant : ${entry.employeeId}`);

      const attendance = toAttendance(row);
      await notifyAttendance(tx, restaurantId, userId, attendance);
      results.push(attendance);
    }
    return results;
  });
}

/** Feuille de présence sur une période, tous employés confondus. */
export async function listAttendances(
  restaurantId: string,
  from: string,
  to: string,
  employeeId?: string,
): Promise<Attendance[]> {
  const conditions = ['a.restaurant_id = $1', 'a.day BETWEEN $2::date AND $3::date'];
  const params: unknown[] = [restaurantId, from, to];

  if (employeeId) {
    params.push(employeeId);
    conditions.push(`a.employee_id = $${params.length}`);
  }

  const rows = await query<AttendanceRow>(
    `SELECT a.id, a.employee_id, e.full_name AS employee_name, a.day, a.status,
            a.arrival_time::text AS arrival_time, a.note
       FROM attendances a
       JOIN employees e ON e.id = a.employee_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY a.day DESC, e.full_name`,
    params,
  );

  return rows.map(toAttendance);
}

// -------------------------------------------------------------------------
// Activités d'un employé
// -------------------------------------------------------------------------

export interface EmployeeActivity {
  id: string;
  /** Une note écrite par le gérant, ou un pointage hors présence normale. */
  source: 'note' | 'attendance';
  kind: string;
  day: string;
  note: string | null;
  arrivalTime: string | null;
  createdByName: string | null;
  createdAt: string;
}

const NOTE_TITLES: Record<string, string> = {
  late: 'Retard noté',
  absence: 'Absence notée',
  warning: 'Avertissement',
  praise: 'Félicitations',
  note: 'Note ajoutée à votre fiche',
};

export async function addEmployeeNote(
  restaurantId: string,
  employeeId: string,
  userId: string,
  input: CreateEmployeeNoteInput,
): Promise<EmployeeActivity> {
  return withTransaction(async (tx) => {
    const employee = await tx.queryOne<{ user_id: string | null }>(
      'SELECT user_id FROM employees WHERE id = $1 AND restaurant_id = $2',
      [employeeId, restaurantId],
    );
    if (!employee) throw notFound('Employé');

    const row = await tx.queryOne<{ id: string; occurred_on: string; created_at: Date }>(
      `INSERT INTO employee_notes (restaurant_id, employee_id, kind, note, occurred_on, created_by)
       VALUES ($1, $2, $3, $4, COALESCE($5::date, CURRENT_DATE), $6)
       RETURNING id, occurred_on, created_at`,
      [restaurantId, employeeId, input.kind, input.note, input.occurredOn ?? null, userId],
    );
    if (!row) throw new Error('Enregistrement de la note impossible.');

    await notify(
      {
        restaurantId,
        to: { userIds: [employee.user_id] },
        exceptUserId: userId,
        kind: `employee.${input.kind}`,
        title: NOTE_TITLES[input.kind] ?? 'Note ajoutée à votre fiche',
        body: input.note,
        route: 'settings',
        entityId: row.id,
      },
      tx,
    );

    const author = await tx.queryOne<{ full_name: string }>(
      'SELECT full_name FROM users WHERE id = $1',
      [userId],
    );

    return {
      id: row.id,
      source: 'note',
      kind: input.kind,
      day: row.occurred_on,
      note: input.note,
      arrivalTime: null,
      createdByName: author?.full_name ?? null,
      createdAt: row.created_at.toISOString(),
    };
  });
}

/**
 * Historique d'un employé : les notes du gérant et les pointages qui
 * sortent de l'ordinaire (retards, absences, congés), du plus récent au plus
 * ancien. Les présences normales n'y figurent pas : elles noieraient le reste.
 */
export async function listEmployeeActivity(
  restaurantId: string,
  employeeId: string,
  limit = 100,
): Promise<EmployeeActivity[]> {
  const employee = await queryOne('SELECT 1 FROM employees WHERE id = $1 AND restaurant_id = $2', [
    employeeId,
    restaurantId,
  ]);
  if (!employee) throw notFound('Employé');

  const rows = await query<{
    id: string;
    source: 'note' | 'attendance';
    kind: string;
    day: string;
    note: string | null;
    arrival_time: string | null;
    created_by_name: string | null;
    created_at: Date;
  }>(
    `SELECT * FROM (
       SELECT n.id, 'note' AS source, n.kind, n.occurred_on AS day, n.note,
              NULL::text AS arrival_time, u.full_name AS created_by_name, n.created_at
         FROM employee_notes n
         LEFT JOIN users u ON u.id = n.created_by
        WHERE n.employee_id = $1 AND n.restaurant_id = $2
       UNION ALL
       SELECT a.id, 'attendance', a.status, a.day, a.note,
              a.arrival_time::text, u.full_name, a.created_at
         FROM attendances a
         LEFT JOIN users u ON u.id = a.created_by
        WHERE a.employee_id = $1 AND a.restaurant_id = $2 AND a.status <> 'present'
     ) activity
     ORDER BY day DESC, created_at DESC
     LIMIT $3`,
    [employeeId, restaurantId, limit],
  );

  return rows.map((row) => ({
    id: row.id,
    source: row.source,
    kind: row.kind,
    day: row.day,
    note: row.note,
    arrivalTime: row.arrival_time ? row.arrival_time.slice(0, 5) : null,
    createdByName: row.created_by_name,
    createdAt: row.created_at.toISOString(),
  }));
}

// -------------------------------------------------------------------------
// Salaires (§4, §10)
// -------------------------------------------------------------------------

export async function getSalaryBalance(
  restaurantId: string,
  employeeId: string,
): Promise<SalaryBalance> {
  const row = await queryOne<{
    monthly_salary: number;
    months_elapsed: number;
    total_accrued: number;
    total_paid: number;
    balance_due: number;
    last_payment_at: Date | null;
  }>(
    `SELECT monthly_salary, months_elapsed, total_accrued, total_paid, balance_due, last_payment_at
       FROM v_employee_salary_balances
      WHERE restaurant_id = $1 AND employee_id = $2`,
    [restaurantId, employeeId],
  );

  if (!row) throw notFound('Employé');

  return {
    monthlySalary: row.monthly_salary,
    monthsElapsed: row.months_elapsed,
    totalAccrued: row.total_accrued,
    totalPaid: row.total_paid,
    balanceDue: row.balance_due,
    lastPaymentAt: row.last_payment_at?.toISOString() ?? null,
  };
}

export interface SalaryPayment {
  id: string;
  amount: number;
  periodMonth: string;
  paymentMethod: string;
  note: string | null;
  paidAt: string;
  expenseId: string | null;
  expenseReference: string | null;
}

export async function listSalaryPayments(
  restaurantId: string,
  employeeId: string,
): Promise<SalaryPayment[]> {
  const rows = await query<{
    id: string;
    amount: number;
    period_month: string;
    payment_method: string;
    note: string | null;
    paid_at: Date;
    expense_id: string | null;
    expense_reference: string | null;
  }>(
    `SELECT sp.id, sp.amount, sp.period_month, sp.payment_method, sp.note, sp.paid_at,
            sp.expense_id, e.reference AS expense_reference
       FROM salary_payments sp
       LEFT JOIN expenses e ON e.id = sp.expense_id
      WHERE sp.restaurant_id = $1 AND sp.employee_id = $2
      ORDER BY sp.paid_at DESC`,
    [restaurantId, employeeId],
  );

  return rows.map((row) => ({
    id: row.id,
    amount: row.amount,
    periodMonth: row.period_month,
    paymentMethod: row.payment_method,
    note: row.note,
    paidAt: row.paid_at.toISOString(),
    expenseId: row.expense_id,
    expenseReference: row.expense_reference,
  }));
}

/**
 * §10 — Paiement de salaire : − Caisse, tracé dans le module Personnel.
 * Une dépense de catégorie « salary » est créée en même temps pour que la
 * sortie d'argent apparaisse aussi dans le module Dépenses.
 */
export async function paySalary(
  restaurantId: string,
  employeeId: string,
  userId: string,
  input: PaySalaryInput,
): Promise<{ payment: SalaryPayment; balance: SalaryBalance }> {
  const paymentId = await withTransaction(async (tx) => {
    const employee = await tx.queryOne<{ full_name: string; is_active: boolean }>(
      'SELECT full_name, is_active FROM employees WHERE id = $1 AND restaurant_id = $2',
      [employeeId, restaurantId],
    );
    if (!employee) throw notFound('Employé');

    const periodMonth = `${input.periodMonth}-01`;
    const paidAt = input.paidAt ?? new Date();
    const amount = round2(input.amount);
    const description = `Salaire ${employee.full_name} — ${input.periodMonth}`;

    const expenseId = await insertExpense(tx, {
      restaurantId,
      userId,
      amount,
      category: 'salary',
      description,
      expenseDate: paidAt.toISOString().slice(0, 10),
      paymentMethod: input.paymentMethod,
      employeeId,
      cashCategory: 'salary',
    });

    const payment = await tx.queryOne<{ id: string }>(
      `INSERT INTO salary_payments
         (restaurant_id, employee_id, amount, period_month, payment_method, note, paid_at,
          expense_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        restaurantId,
        employeeId,
        amount,
        periodMonth,
        input.paymentMethod,
        input.note ?? null,
        paidAt,
        expenseId,
        userId,
      ],
    );
    if (!payment) throw new Error('Enregistrement du paiement impossible.');
    return payment.id;
  });

  const payments = await listSalaryPayments(restaurantId, employeeId);
  const payment = payments.find((p) => p.id === paymentId);
  if (!payment) throw new Error('Paiement introuvable après enregistrement.');

  return { payment, balance: await getSalaryBalance(restaurantId, employeeId) };
}

/** Annulation d'un paiement de salaire (erreur de saisie). */
export async function cancelSalaryPayment(
  restaurantId: string,
  employeeId: string,
  paymentId: string,
  userId: string,
  reason: string,
): Promise<SalaryBalance> {
  await withTransaction(async (tx) => {
    const payment = await tx.queryOne<{ id: string; expense_id: string | null }>(
      `SELECT id, expense_id FROM salary_payments
        WHERE id = $1 AND employee_id = $2 AND restaurant_id = $3 FOR UPDATE`,
      [paymentId, employeeId, restaurantId],
    );
    if (!payment) throw notFound('Paiement de salaire');

    if (payment.expense_id) {
      const expense = await tx.queryOne<{ cancelled_at: Date | null; reference: string }>(
        'SELECT cancelled_at, reference FROM expenses WHERE id = $1',
        [payment.expense_id],
      );
      if (expense?.cancelled_at) throw conflict('Ce paiement est déjà annulé.');

      await reverseMovements(tx, {
        restaurantId,
        sourceType: 'expense',
        sourceId: payment.expense_id,
        label: `Annulation salaire ${expense?.reference ?? ''} — ${reason}`,
        createdBy: userId,
      });

      await tx.query(
        'UPDATE expenses SET cancelled_at = now(), cancel_reason = $1 WHERE id = $2',
        [reason, payment.expense_id],
      );
    }

    await tx.query('DELETE FROM salary_payments WHERE id = $1', [paymentId]);
  });

  return getSalaryBalance(restaurantId, employeeId);
}

/** Vue d'ensemble des salaires dus, pour le tableau de bord. */
export async function salaryOverview(restaurantId: string): Promise<{
  totalMonthlyPayroll: number;
  totalBalanceDue: number;
  employees: number;
}> {
  const row = await queryOne<{
    payroll: number;
    balance_due: number;
    employees: number;
  }>(
    `SELECT COALESCE(sum(e.monthly_salary), 0)                          AS payroll,
            COALESCE(sum(GREATEST(b.balance_due, 0)), 0)                AS balance_due,
            count(*)::int                                               AS employees
       FROM employees e
       JOIN v_employee_salary_balances b
         ON b.employee_id = e.id AND b.restaurant_id = e.restaurant_id
      WHERE e.restaurant_id = $1 AND e.is_active`,
    [restaurantId],
  );

  return {
    totalMonthlyPayroll: row?.payroll ?? 0,
    totalBalanceDue: row?.balance_due ?? 0,
    employees: row?.employees ?? 0,
  };
}

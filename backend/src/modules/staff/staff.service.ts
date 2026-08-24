import { badRequest, conflict, notFound } from '../../core/errors';
import { buildUpdate } from '../../core/sqlBuilder';
import { query, queryOne } from '../../db/pool';
import { withTransaction } from '../../db/transaction';
import { round2 } from '../../utils/money';
import { reverseMovements } from '../cash/cash.service';
import { insertExpense } from '../expenses/expenses.service';
import type {
  BulkAttendanceInput,
  CreateEmployeeInput,
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
});

const SELECT = `
  SELECT id, full_name, position, phone, hire_date, monthly_salary,
         is_active, end_date, photo_media_id, note
    FROM employees`;

export async function listEmployees(
  restaurantId: string,
  input: ListEmployeesInput,
): Promise<Employee[]> {
  const conditions = ['restaurant_id = $1'];
  const params: unknown[] = [restaurantId];

  if (!input.includeInactive) conditions.push('is_active');
  if (input.search) {
    params.push(`%${input.search}%`);
    conditions.push(`(full_name ILIKE $${params.length} OR position ILIKE $${params.length})`);
  }

  const rows = await query<EmployeeRow>(
    `${SELECT} WHERE ${conditions.join(' AND ')} ORDER BY is_active DESC, full_name`,
    params,
  );
  return rows.map(toEmployee);
}

export async function getEmployee(restaurantId: string, id: string): Promise<Employee> {
  const row = await queryOne<EmployeeRow>(`${SELECT} WHERE id = $1 AND restaurant_id = $2`, [
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
  note: string | null;
}

export async function markAttendance(
  restaurantId: string,
  employeeId: string,
  userId: string,
  input: MarkAttendanceInput,
): Promise<Attendance> {
  const employee = await queryOne('SELECT 1 FROM employees WHERE id = $1 AND restaurant_id = $2', [
    employeeId,
    restaurantId,
  ]);
  if (!employee) throw notFound('Employé');

  const row = await queryOne<{
    id: string;
    employee_id: string;
    day: string;
    status: string;
    note: string | null;
  }>(
    `INSERT INTO attendances (restaurant_id, employee_id, day, status, note, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (employee_id, day)
     DO UPDATE SET status = EXCLUDED.status, note = EXCLUDED.note
     RETURNING id, employee_id, day, status, note`,
    [restaurantId, employeeId, input.day, input.status, input.note ?? null, userId],
  );
  if (!row) throw new Error('Enregistrement du pointage impossible.');

  return {
    id: row.id,
    employeeId: row.employee_id,
    day: row.day,
    status: row.status,
    note: row.note,
  };
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
      const row = await tx.queryOne<{
        id: string;
        employee_id: string;
        day: string;
        status: string;
        note: string | null;
      }>(
        `INSERT INTO attendances (restaurant_id, employee_id, day, status, note, created_by)
         SELECT $1, $2, $3, $4, $5, $6
          WHERE EXISTS (SELECT 1 FROM employees WHERE id = $2 AND restaurant_id = $1)
         ON CONFLICT (employee_id, day)
         DO UPDATE SET status = EXCLUDED.status, note = EXCLUDED.note
         RETURNING id, employee_id, day, status, note`,
        [restaurantId, entry.employeeId, input.day, entry.status, entry.note ?? null, userId],
      );
      if (!row) throw badRequest(`Employé inconnu dans ce restaurant : ${entry.employeeId}`);
      results.push({
        id: row.id,
        employeeId: row.employee_id,
        day: row.day,
        status: row.status,
        note: row.note,
      });
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

  const rows = await query<{
    id: string;
    employee_id: string;
    employee_name: string;
    day: string;
    status: string;
    note: string | null;
  }>(
    `SELECT a.id, a.employee_id, e.full_name AS employee_name, a.day, a.status, a.note
       FROM attendances a
       JOIN employees e ON e.id = a.employee_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY a.day DESC, e.full_name`,
    params,
  );

  return rows.map((row) => ({
    id: row.id,
    employeeId: row.employee_id,
    employeeName: row.employee_name,
    day: row.day,
    status: row.status,
    note: row.note,
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

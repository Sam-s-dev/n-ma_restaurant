import { authed, queryString } from '../authed';

/** §4 — Personnel : fiches, pointage, salaires. */
export type AttendanceStatus = 'present' | 'absent' | 'leave';

export interface SalaryBalance {
  monthlySalary: number;
  monthsElapsed: number;
  totalAccrued: number;
  totalPaid: number;
  balanceDue: number;
  lastPaymentAt: string | null;
}

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

export interface Attendance {
  id: string;
  employeeId: string;
  employeeName?: string;
  day: string;
  status: AttendanceStatus;
  note: string | null;
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

export interface SalaryOverview {
  totalMonthlyPayroll: number;
  totalBalanceDue: number;
  employees: number;
}

export const ATTENDANCE_LABELS: Record<AttendanceStatus, string> = {
  present: 'Présent',
  absent: 'Absent',
  leave: 'Congé',
};

export async function listEmployees(
  filters: { search?: string; includeInactive?: boolean } = {},
): Promise<Employee[]> {
  const { items } = await authed<{ items: Employee[] }>(
    `/api/staff${queryString({
      search: filters.search,
      includeInactive: filters.includeInactive ? 'true' : undefined,
    })}`,
  );
  return items;
}

export function getEmployee(id: string): Promise<Employee> {
  return authed<Employee>(`/api/staff/${id}`);
}

export function createEmployee(payload: {
  fullName: string;
  position: string;
  hireDate: string;
  monthlySalary?: number;
  phone?: string | null;
  note?: string | null;
}): Promise<Employee> {
  return authed<Employee>('/api/staff', { method: 'POST', body: payload });
}

export function updateEmployee(
  id: string,
  payload: {
    fullName?: string;
    position?: string;
    phone?: string | null;
    monthlySalary?: number;
    note?: string | null;
    isActive?: boolean;
  },
): Promise<Employee> {
  return authed<Employee>(`/api/staff/${id}`, { method: 'PATCH', body: payload });
}

/** Désactive l'employé s'il a déjà été payé, le supprime sinon. */
export function deleteEmployee(id: string): Promise<void> {
  return authed<void>(`/api/staff/${id}`, { method: 'DELETE' });
}

export async function listAttendances(from: string, to: string): Promise<Attendance[]> {
  const { items } = await authed<{ items: Attendance[] }>(
    `/api/staff/attendances${queryString({ from, to })}`,
  );
  return items;
}

/** Pointage collectif d'une journée, enregistré en une fois. */
export async function markAttendances(
  day: string,
  entries: Array<{ employeeId: string; status: AttendanceStatus }>,
): Promise<Attendance[]> {
  const { items } = await authed<{ items: Attendance[] }>('/api/staff/attendances', {
    method: 'POST',
    body: { day, entries },
  });
  return items;
}

export function fetchSalaryDetail(
  id: string,
): Promise<{ balance: SalaryBalance; payments: SalaryPayment[] }> {
  return authed<{ balance: SalaryBalance; payments: SalaryPayment[] }>(`/api/staff/${id}/salary`);
}

/** §10 — Paiement de salaire : − Caisse, tracé aussi dans les dépenses. */
export function paySalary(
  id: string,
  payload: { amount: number; periodMonth: string; paymentMethod?: string; note?: string },
): Promise<{ payment: SalaryPayment; balance: SalaryBalance }> {
  return authed<{ payment: SalaryPayment; balance: SalaryBalance }>(
    `/api/staff/${id}/salary/payments`,
    { method: 'POST', body: payload },
  );
}

export function cancelSalaryPayment(
  employeeId: string,
  paymentId: string,
  reason: string,
): Promise<SalaryBalance> {
  return authed<SalaryBalance>(`/api/staff/${employeeId}/salary/payments/${paymentId}/cancel`, {
    method: 'POST',
    body: { reason },
  });
}

export function fetchSalaryOverview(): Promise<SalaryOverview> {
  return authed<SalaryOverview>('/api/staff/salaries/overview');
}

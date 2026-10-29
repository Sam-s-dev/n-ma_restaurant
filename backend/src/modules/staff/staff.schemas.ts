import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue au format AAAA-MM-JJ.');

const employeeFields = {
  fullName: z.string().trim().min(2).max(120),
  position: z.string().trim().min(2).max(80),
  phone: z
    .string()
    .trim()
    .min(4)
    .max(30)
    .regex(/^[0-9+\s().-]+$/, 'Numéro de téléphone invalide.')
    .nullable()
    .optional(),
  hireDate: isoDate,
  monthlySalary: z.coerce.number().min(0).max(9_999_999_999),
  photoMediaId: z.string().uuid().nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
};

export const createEmployeeSchema = z.object({
  ...employeeFields,
  monthlySalary: employeeFields.monthlySalary.default(0),
});

// Sans valeur par défaut : Zod 4 l'appliquerait à un champ absent, et
// corriger le nom d'un employé remettrait son salaire à zéro.
export const updateEmployeeSchema = z.object(employeeFields).partial().extend({
  isActive: z.boolean().optional(),
  endDate: isoDate.nullable().optional(),
});

export const ATTENDANCE_STATUSES = ['present', 'late', 'absent', 'leave'] as const;

const arrivalTime = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Heure attendue au format HH:MM.')
  .nullable()
  .optional();

const attendanceEntry = {
  status: z.enum(ATTENDANCE_STATUSES),
  /** Heure d'arrivée, utile surtout pour un retard. */
  arrivalTime,
  note: z.string().trim().max(255).nullable().optional(),
};

const arrivalMatchesStatus = (data: { status: string; arrivalTime?: string | null }) =>
  !data.arrivalTime || data.status === 'present' || data.status === 'late';

/** §4 — pointage : présent, en retard, absent ou en congé, par jour. */
export const markAttendanceSchema = z
  .object({ day: isoDate, ...attendanceEntry })
  .refine(arrivalMatchesStatus, {
    message: 'Une heure d’arrivée n’a de sens que pour une présence ou un retard.',
    path: ['arrivalTime'],
  });

export const bulkAttendanceSchema = z.object({
  day: isoDate,
  entries: z
    .array(
      z
        .object({ employeeId: z.string().uuid(), ...attendanceEntry })
        .refine(arrivalMatchesStatus, {
          message: 'Une heure d’arrivée n’a de sens que pour une présence ou un retard.',
          path: ['arrivalTime'],
        }),
    )
    .min(1)
    .max(200),
});

export const NOTE_KINDS = ['late', 'absence', 'warning', 'praise', 'note'] as const;

/** Activité notée sur la fiche d'un employé : retard, avertissement… */
export const createEmployeeNoteSchema = z.object({
  kind: z.enum(NOTE_KINDS),
  note: z.string().trim().min(1, 'Décrivez ce qui s’est passé.').max(1000),
  occurredOn: isoDate.optional(),
});

export const attendanceRangeSchema = z.object({
  from: isoDate,
  to: isoDate,
});

/** §4 / §10 — paiement de salaire : − Caisse, historique côté employé. */
export const paySalarySchema = z.object({
  amount: z.coerce.number().positive().max(9_999_999_999),
  periodMonth: z
    .string()
    .regex(/^\d{4}-\d{2}$/, 'Mois attendu au format AAAA-MM.'),
  paymentMethod: z.enum(['cash', 'mobile_money', 'card', 'bank_transfer']).default('cash'),
  note: z.string().trim().max(255).optional(),
  paidAt: z.coerce.date().optional(),
});

export const listEmployeesSchema = z.object({
  search: z.string().trim().min(1).max(120).optional(),
  includeInactive: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .default(false),
  /** Employés sans compte : ceux à qui l'on peut en créer un. */
  withoutAccount: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .default(false),
});

export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;
export type MarkAttendanceInput = z.infer<typeof markAttendanceSchema>;
export type BulkAttendanceInput = z.infer<typeof bulkAttendanceSchema>;
export type PaySalaryInput = z.infer<typeof paySalarySchema>;
export type CreateEmployeeNoteInput = z.infer<typeof createEmployeeNoteSchema>;
export type ListEmployeesInput = z.infer<typeof listEmployeesSchema>;

import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue au format AAAA-MM-JJ.');

export const createEmployeeSchema = z.object({
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
  monthlySalary: z.coerce.number().min(0).max(9_999_999_999).default(0),
  photoMediaId: z.string().uuid().nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
});

export const updateEmployeeSchema = createEmployeeSchema.partial().extend({
  isActive: z.boolean().optional(),
  endDate: isoDate.nullable().optional(),
});

/** §4 — pointage : présent / absent par jour. */
export const markAttendanceSchema = z.object({
  day: isoDate,
  status: z.enum(['present', 'absent', 'leave']),
  note: z.string().trim().max(255).nullable().optional(),
});

export const bulkAttendanceSchema = z.object({
  day: isoDate,
  entries: z
    .array(
      z.object({
        employeeId: z.string().uuid(),
        status: z.enum(['present', 'absent', 'leave']),
        note: z.string().trim().max(255).nullable().optional(),
      }),
    )
    .min(1)
    .max(200),
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
});

export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;
export type MarkAttendanceInput = z.infer<typeof markAttendanceSchema>;
export type BulkAttendanceInput = z.infer<typeof bulkAttendanceSchema>;
export type PaySalaryInput = z.infer<typeof paySalarySchema>;
export type ListEmployeesInput = z.infer<typeof listEmployeesSchema>;

import { z } from 'zod';

const tableFields = {
  name: z.string().trim().min(1, 'Donnez un nom à la table.').max(40),
  area: z.string().trim().max(40).nullable().optional(),
  position: z.coerce.number().int().min(0).max(999),
  isActive: z.boolean(),
};

export const createTableSchema = z.object({
  ...tableFields,
  position: tableFields.position.default(0),
});

// Sans valeurs par défaut : Zod 4 les appliquerait aux champs absents.
export const updateTableSchema = z.object(tableFields).partial();

/** Crée d'un coup « Table 1 » à « Table N », pour démarrer en dix secondes. */
export const createTablesBatchSchema = z.object({
  count: z.coerce.number().int().min(1).max(60),
  area: z.string().trim().max(40).nullable().optional(),
});

export const kitchenSettingsSchema = z
  .object({
    warnMinutes: z.coerce.number().int().min(1).max(180),
    lateMinutes: z.coerce.number().int().min(2).max(240),
  })
  .refine((data) => data.lateMinutes > data.warnMinutes, {
    message: 'Le seuil « en retard » doit dépasser le seuil « attention ».',
    path: ['lateMinutes'],
  });

export const openBillSchema = z.object({
  label: z.string().trim().max(60).nullable().optional(),
  guests: z.coerce.number().int().min(1).max(99).default(1),
});

export const sendItemsSchema = z.object({
  items: z
    .array(
      z.object({
        dishId: z.string().uuid(),
        quantity: z.coerce.number().int().min(1).max(99),
        note: z.string().trim().max(200).nullable().optional(),
      }),
    )
    .min(1, 'Ajoutez au moins un plat.')
    .max(60),
});

export const payBillSchema = z
  .object({
    paymentMethod: z.enum(['cash', 'mobile_money', 'card', 'credit']),
    customerId: z.string().uuid().optional(),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .refine((data) => data.paymentMethod !== 'credit' || Boolean(data.customerId), {
    message: 'Une addition à crédit exige un client.',
    path: ['customerId'],
  });

export const reasonSchema = z.object({
  reason: z.string().trim().min(3, 'Indiquez le motif.').max(300),
});

export const listBillsSchema = z.object({
  status: z.enum(['open', 'bill_requested', 'active', 'paid']).default('active'),
});

export type CreateTableInput = z.infer<typeof createTableSchema>;
export type UpdateTableInput = z.infer<typeof updateTableSchema>;
export type SendItemsInput = z.infer<typeof sendItemsSchema>;
export type PayBillInput = z.infer<typeof payBillSchema>;

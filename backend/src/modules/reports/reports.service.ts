import ExcelJS from 'exceljs';
import { notFound } from '../../core/errors';
import { query, queryOne } from '../../db/pool';
import { round2 } from '../../utils/money';
import { topDishes } from '../sales/sales.service';

/** Période inclusive, au format AAAA-MM-JJ. */
export interface Period {
  from: string;
  to: string;
}

export interface PeriodReport {
  period: Period;
  restaurant: {
    name: string;
    address: string | null;
    phone: string | null;
    logoUrl: string | null;
    currencySymbol: string;
    currencyDecimals: number;
  };
  sales: {
    count: number;
    revenue: number;
    cashed: number;
    onCredit: number;
    byMethod: Array<{ method: string; count: number; total: number }>;
    cancelledCount: number;
    cancelledTotal: number;
  };
  creditRepayments: number;
  expenses: { total: number; byCategory: Array<{ category: string; total: number }> };
  /** Ventes de la période moins ses dépenses (achats, salaires, factures…). */
  result: number;
  capital: { in: number; out: number };
  outstandingCredits: number;
  topDishes: Array<{ dishName: string; quantity: number; revenue: number }>;
  sessions: { count: number; withDifference: number; totalCashDifference: number };
}

const SALES_WINDOW = `sold_at >= $2::date AND sold_at < ($3::date + interval '1 day')`;

export async function periodReport(restaurantId: string, period: Period): Promise<PeriodReport> {
  const params = [restaurantId, period.from, period.to];

  const restaurant = await queryOne<{
    name: string;
    address: string | null;
    phone: string | null;
    logo_media_id: string | null;
    currency_symbol: string;
    currency_decimals: number;
  }>(
    'SELECT name, address, phone, logo_media_id, currency_symbol, currency_decimals FROM restaurants WHERE id = $1',
    [restaurantId],
  );
  if (!restaurant) throw notFound('Restaurant');

  const [sales, byMethod, expenses, repayments, capital, outstanding, sessions, dishes] =
    await Promise.all([
      queryOne<{
        count: number;
        revenue: number;
        cashed: number;
        on_credit: number;
        cancelled_count: number;
        cancelled_total: number;
      }>(
        `SELECT count(*) FILTER (WHERE status <> 'cancelled')::int AS count,
                COALESCE(sum(total_amount) FILTER (WHERE status <> 'cancelled'), 0) AS revenue,
                COALESCE(sum(total_amount) FILTER (WHERE status = 'paid'), 0)       AS cashed,
                COALESCE(sum(total_amount) FILTER (WHERE status = 'credit'), 0)     AS on_credit,
                count(*) FILTER (WHERE status = 'cancelled')::int                   AS cancelled_count,
                COALESCE(sum(total_amount) FILTER (WHERE status = 'cancelled'), 0)  AS cancelled_total
           FROM sales WHERE restaurant_id = $1 AND ${SALES_WINDOW}`,
        params,
      ),
      query<{ method: string; count: number; total: number }>(
        `SELECT payment_method AS method, count(*)::int AS count, COALESCE(sum(total_amount), 0) AS total
           FROM sales
          WHERE restaurant_id = $1 AND ${SALES_WINDOW} AND status <> 'cancelled'
          GROUP BY 1 ORDER BY total DESC`,
        params,
      ),
      query<{ category: string; total: number }>(
        `SELECT category, COALESCE(sum(amount), 0) AS total
           FROM expenses
          WHERE restaurant_id = $1 AND cancelled_at IS NULL
            AND expense_date BETWEEN $2::date AND $3::date
          GROUP BY 1 ORDER BY total DESC`,
        params,
      ),
      queryOne<{ total: number }>(
        `SELECT COALESCE(sum(CASE WHEN direction = 'in' THEN amount ELSE -amount END), 0) AS total
           FROM cash_movements
          WHERE restaurant_id = $1 AND category = 'credit_payment'
            AND occurred_at >= $2::date AND occurred_at < ($3::date + interval '1 day')`,
        params,
      ),
      queryOne<{ cap_in: number; cap_out: number }>(
        `SELECT COALESCE(sum(amount) FILTER (WHERE direction = 'in'), 0)  AS cap_in,
                COALESCE(sum(amount) FILTER (WHERE direction = 'out'), 0) AS cap_out
           FROM cash_movements
          WHERE restaurant_id = $1 AND category = 'capital'
            AND occurred_at >= $2::date AND occurred_at < ($3::date + interval '1 day')`,
        params,
      ),
      queryOne<{ total: number }>(
        `SELECT COALESCE(sum(amount_left), 0) AS total
           FROM credits WHERE restaurant_id = $1 AND status IN ('open', 'partially_paid')`,
        [restaurantId],
      ),
      queryOne<{ count: number; with_difference: number; total_difference: number }>(
        `SELECT count(*)::int AS count,
                count(*) FILTER (WHERE cash_difference <> 0)::int AS with_difference,
                COALESCE(sum(cash_difference), 0) AS total_difference
           FROM cash_sessions
          WHERE restaurant_id = $1 AND status = 'closed'
            AND closed_at >= $2::date AND closed_at < ($3::date + interval '1 day')`,
        params,
      ),
      topDishes(restaurantId, period.from, period.to, 5),
    ]);

  const expensesTotal = round2(expenses.reduce((total, row) => total + row.total, 0));
  const revenue = round2(sales?.revenue ?? 0);

  return {
    period,
    restaurant: {
      name: restaurant.name,
      address: restaurant.address,
      phone: restaurant.phone,
      logoUrl: restaurant.logo_media_id ? `/api/media/${restaurant.logo_media_id}` : null,
      currencySymbol: restaurant.currency_symbol,
      currencyDecimals: restaurant.currency_decimals,
    },
    sales: {
      count: sales?.count ?? 0,
      revenue,
      cashed: round2(sales?.cashed ?? 0),
      onCredit: round2(sales?.on_credit ?? 0),
      byMethod: byMethod.map((row) => ({ ...row, total: round2(row.total) })),
      cancelledCount: sales?.cancelled_count ?? 0,
      cancelledTotal: round2(sales?.cancelled_total ?? 0),
    },
    creditRepayments: round2(repayments?.total ?? 0),
    expenses: {
      total: expensesTotal,
      byCategory: expenses.map((row) => ({ category: row.category, total: round2(row.total) })),
    },
    result: round2(revenue - expensesTotal),
    capital: { in: round2(capital?.cap_in ?? 0), out: round2(capital?.cap_out ?? 0) },
    outstandingCredits: round2(outstanding?.total ?? 0),
    topDishes: dishes.map((dish) => ({
      dishName: dish.dishName,
      quantity: Number(dish.quantity),
      revenue: round2(Number(dish.revenue)),
    })),
    sessions: {
      count: sessions?.count ?? 0,
      withDifference: sessions?.with_difference ?? 0,
      totalCashDifference: round2(sessions?.total_difference ?? 0),
    },
  };
}

// -------------------------------------------------------------------------
// Classeur Excel
// -------------------------------------------------------------------------

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Espèces',
  mobile_money: 'Mobile Money',
  card: 'Carte',
  credit: 'Crédit',
  bank_transfer: 'Virement',
};
const SALE_STATUS: Record<string, string> = { paid: 'Encaissée', credit: 'À crédit', cancelled: 'Annulée' };
const EXPENSE_LABELS: Record<string, string> = {
  stock_purchase: 'Achat de stock',
  salary: 'Salaire',
  bill: 'Facture',
  maintenance: 'Entretien',
  other: 'Autre',
};
const CASH_CATEGORIES: Record<string, string> = {
  sale: 'Vente',
  credit_payment: 'Remboursement',
  expense: 'Dépense',
  salary: 'Salaire',
  adjustment: 'Correction',
  capital: 'Apport / retrait',
};
const CREDIT_STATUS: Record<string, string> = {
  open: 'En cours',
  partially_paid: 'Partiellement payée',
  paid: 'Soldée',
  cancelled: 'Annulée',
};

const label = (labels: Record<string, string>, value: string | null) =>
  value ? (labels[value] ?? value) : '';

interface SheetSpec {
  name: string;
  columns: Array<{ header: string; key: string; width: number; money?: boolean; date?: boolean }>;
  rows: Array<Record<string, unknown>>;
}

/**
 * Un onglet par sujet, des montants en vrais nombres (le comptable peut
 * additionner), des dates en vraies dates. L'en-tête reste figé au défilement.
 */
function addSheet(workbook: ExcelJS.Workbook, spec: SheetSpec, currency: string): void {
  const sheet = workbook.addWorksheet(spec.name, { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = spec.columns.map((column) => ({
    header: column.header,
    key: column.key,
    width: column.width,
    style: column.money
      ? { numFmt: `#,##0 "${currency}"` }
      : column.date
        ? { numFmt: 'dd/mm/yyyy hh:mm' }
        : {},
  }));
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE63946' } };
  spec.rows.forEach((row) => sheet.addRow(row));
}

export async function exportWorkbook(restaurantId: string, period: Period): Promise<Buffer> {
  const params = [restaurantId, period.from, period.to];
  const report = await periodReport(restaurantId, period);
  const currency = report.restaurant.currencySymbol;

  const [sales, expenses, movements, credits, salaries, sessions] = await Promise.all([
    query(
      `SELECT s.reference, s.sold_at, s.payment_method, s.status, cu.full_name AS customer,
              s.total_amount, u.full_name AS author, s.cancel_reason
         FROM sales s
         LEFT JOIN customers cu ON cu.id = s.customer_id
         LEFT JOIN users u ON u.id = s.created_by
        WHERE s.restaurant_id = $1 AND s.sold_at >= $2::date AND s.sold_at < ($3::date + interval '1 day')
        ORDER BY s.sold_at`,
      params,
    ),
    query(
      `SELECT e.reference, e.expense_date, e.category, e.description, e.amount, e.payment_method,
              si.name AS product, e.quantity, e.cancelled_at, u.full_name AS author
         FROM expenses e
         LEFT JOIN stock_items si ON si.id = e.stock_item_id
         LEFT JOIN users u ON u.id = e.created_by
        WHERE e.restaurant_id = $1 AND e.expense_date BETWEEN $2::date AND $3::date
        ORDER BY e.expense_date, e.created_at`,
      params,
    ),
    query(
      `SELECT m.occurred_at, m.direction, m.amount, m.category, m.label, m.payment_method,
              u.full_name AS author
         FROM cash_movements m
         LEFT JOIN users u ON u.id = m.created_by
        WHERE m.restaurant_id = $1 AND m.occurred_at >= $2::date AND m.occurred_at < ($3::date + interval '1 day')
        ORDER BY m.occurred_at`,
      params,
    ),
    // Les créances en cours, quelle que soit leur date : c'est ce qu'on doit au restaurant aujourd'hui.
    query(
      `SELECT cu.full_name AS customer, cu.phone, s.reference, c.opened_at, c.due_date,
              c.amount_due, c.amount_paid, c.amount_left, c.status
         FROM credits c
         JOIN customers cu ON cu.id = c.customer_id
         JOIN sales s ON s.id = c.sale_id
        WHERE c.restaurant_id = $1
          AND (c.status IN ('open', 'partially_paid')
               OR (c.opened_at >= $2::date AND c.opened_at < ($3::date + interval '1 day')))
        ORDER BY c.opened_at`,
      params,
    ),
    query(
      `SELECT e.full_name AS employee, e.position, p.period_month, p.amount, p.payment_method, p.paid_at
         FROM salary_payments p
         JOIN employees e ON e.id = p.employee_id
        WHERE p.restaurant_id = $1 AND p.paid_at >= $2::date AND p.paid_at < ($3::date + interval '1 day')
        ORDER BY p.paid_at`,
      params,
    ),
    query(
      `SELECT s.reference, s.opened_at, op.full_name AS opened_by, s.closed_at, cl.full_name AS closed_by,
              s.opening_float, s.counted_cash, s.expected_cash, s.cash_difference,
              s.counted_mobile_money, s.expected_mobile_money, s.mobile_money_difference,
              s.close_note, s.corrected_at
         FROM cash_sessions s
         LEFT JOIN users op ON op.id = s.opened_by
         LEFT JOIN users cl ON cl.id = s.closed_by
        WHERE s.restaurant_id = $1 AND s.opened_at >= $2::date AND s.opened_at < ($3::date + interval '1 day')
        ORDER BY s.opened_at`,
      params,
    ),
  ]);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'N’ma Restaurant';
  workbook.created = new Date();

  addSheet(
    workbook,
    {
      name: 'Synthèse',
      columns: [
        { header: 'Indicateur', key: 'label', width: 42 },
        { header: 'Valeur', key: 'value', width: 22, money: true },
      ],
      rows: [
        { label: `Restaurant : ${report.restaurant.name}` },
        { label: `Période : du ${period.from} au ${period.to}` },
        { label: 'Nombre de ventes', value: report.sales.count },
        { label: 'Chiffre d’affaires', value: report.sales.revenue },
        { label: 'dont encaissé', value: report.sales.cashed },
        { label: 'dont à crédit', value: report.sales.onCredit },
        { label: 'Remboursements de créances reçus', value: report.creditRepayments },
        { label: 'Dépenses', value: report.expenses.total },
        ...report.expenses.byCategory.map((row) => ({
          label: `   ${label(EXPENSE_LABELS, row.category)}`,
          value: row.total,
        })),
        { label: 'Résultat (ventes − dépenses)', value: report.result },
        { label: 'Apports du gérant', value: report.capital.in },
        { label: 'Retraits du gérant', value: report.capital.out },
        { label: 'Créances en cours (aujourd’hui)', value: report.outstandingCredits },
        { label: 'Clôtures de caisse', value: report.sessions.count },
        { label: 'Écart de caisse cumulé', value: report.sessions.totalCashDifference },
      ],
    },
    currency,
  );
  addSheet(
    workbook,
    {
      name: 'Ventes',
      columns: [
        { header: 'Ticket', key: 'reference', width: 18 },
        { header: 'Date', key: 'date', width: 18, date: true },
        { header: 'Règlement', key: 'method', width: 14 },
        { header: 'Statut', key: 'status', width: 12 },
        { header: 'Client', key: 'customer', width: 22 },
        { header: 'Montant', key: 'amount', width: 14, money: true },
        { header: 'Encaissé par', key: 'author', width: 20 },
        { header: 'Motif d’annulation', key: 'reason', width: 28 },
      ],
      rows: sales.map((row) => ({
        reference: row.reference,
        date: row.sold_at,
        method: label(PAYMENT_LABELS, row.payment_method as string),
        status: label(SALE_STATUS, row.status as string),
        customer: row.customer ?? '',
        amount: row.total_amount,
        author: row.author ?? '',
        reason: row.cancel_reason ?? '',
      })),
    },
    currency,
  );
  addSheet(
    workbook,
    {
      name: 'Dépenses',
      columns: [
        { header: 'Référence', key: 'reference', width: 18 },
        { header: 'Date', key: 'date', width: 12 },
        { header: 'Catégorie', key: 'category', width: 16 },
        { header: 'Description', key: 'description', width: 34 },
        { header: 'Montant', key: 'amount', width: 14, money: true },
        { header: 'Règlement', key: 'method', width: 14 },
        { header: 'Produit', key: 'product', width: 18 },
        { header: 'Quantité', key: 'quantity', width: 10 },
        { header: 'Annulée', key: 'cancelled', width: 10 },
        { header: 'Saisi par', key: 'author', width: 20 },
      ],
      rows: expenses.map((row) => ({
        reference: row.reference,
        date: row.expense_date,
        category: label(EXPENSE_LABELS, row.category as string),
        description: row.description,
        amount: row.amount,
        method: label(PAYMENT_LABELS, row.payment_method as string),
        product: row.product ?? '',
        quantity: row.quantity ?? '',
        cancelled: row.cancelled_at ? 'Oui' : '',
        author: row.author ?? '',
      })),
    },
    currency,
  );
  addSheet(
    workbook,
    {
      name: 'Caisse',
      columns: [
        { header: 'Date', key: 'date', width: 18, date: true },
        { header: 'Entrée', key: 'in', width: 14, money: true },
        { header: 'Sortie', key: 'out', width: 14, money: true },
        { header: 'Nature', key: 'category', width: 16 },
        { header: 'Libellé', key: 'label', width: 40 },
        { header: 'Mode', key: 'method', width: 14 },
        { header: 'Par', key: 'author', width: 20 },
      ],
      rows: movements.map((row) => ({
        date: row.occurred_at,
        in: row.direction === 'in' ? row.amount : null,
        out: row.direction === 'out' ? row.amount : null,
        category: label(CASH_CATEGORIES, row.category as string),
        label: row.label,
        method: label(PAYMENT_LABELS, row.payment_method as string | null),
        author: row.author ?? '',
      })),
    },
    currency,
  );
  addSheet(
    workbook,
    {
      name: 'Créances',
      columns: [
        { header: 'Client', key: 'customer', width: 22 },
        { header: 'Téléphone', key: 'phone', width: 16 },
        { header: 'Ticket', key: 'reference', width: 18 },
        { header: 'Ouverte le', key: 'opened', width: 18, date: true },
        { header: 'Échéance', key: 'due', width: 12 },
        { header: 'Dû', key: 'due_amount', width: 14, money: true },
        { header: 'Payé', key: 'paid', width: 14, money: true },
        { header: 'Reste', key: 'left', width: 14, money: true },
        { header: 'Statut', key: 'status', width: 18 },
      ],
      rows: credits.map((row) => ({
        customer: row.customer,
        phone: row.phone ?? '',
        reference: row.reference,
        opened: row.opened_at,
        due: row.due_date ?? '',
        due_amount: row.amount_due,
        paid: row.amount_paid,
        left: row.amount_left,
        status: label(CREDIT_STATUS, row.status as string),
      })),
    },
    currency,
  );
  addSheet(
    workbook,
    {
      name: 'Salaires',
      columns: [
        { header: 'Employé', key: 'employee', width: 24 },
        { header: 'Poste', key: 'position', width: 16 },
        { header: 'Mois', key: 'month', width: 10 },
        { header: 'Montant', key: 'amount', width: 14, money: true },
        { header: 'Règlement', key: 'method', width: 14 },
        { header: 'Versé le', key: 'paid', width: 18, date: true },
      ],
      rows: salaries.map((row) => ({
        employee: row.employee,
        position: row.position,
        month: String(row.period_month).slice(0, 7),
        amount: row.amount,
        method: label(PAYMENT_LABELS, row.payment_method as string),
        paid: row.paid_at,
      })),
    },
    currency,
  );
  addSheet(
    workbook,
    {
      name: 'Clôtures',
      columns: [
        { header: 'Session', key: 'reference', width: 18 },
        { header: 'Ouverte le', key: 'opened', width: 18, date: true },
        { header: 'Par', key: 'openedBy', width: 18 },
        { header: 'Clôturée le', key: 'closed', width: 18, date: true },
        { header: 'Par', key: 'closedBy', width: 18 },
        { header: 'Fond de caisse', key: 'float', width: 14, money: true },
        { header: 'Espèces attendues', key: 'expected', width: 16, money: true },
        { header: 'Espèces comptées', key: 'counted', width: 16, money: true },
        { header: 'Écart espèces', key: 'difference', width: 14, money: true },
        { header: 'Écart Mobile Money', key: 'mmDifference', width: 16, money: true },
        { header: 'Motif', key: 'note', width: 30 },
        { header: 'Écart corrigé', key: 'corrected', width: 12 },
      ],
      rows: sessions.map((row) => ({
        reference: row.reference,
        opened: row.opened_at,
        openedBy: row.opened_by ?? '',
        closed: row.closed_at ?? '',
        closedBy: row.closed_by ?? '',
        float: row.opening_float,
        expected: row.expected_cash,
        counted: row.counted_cash,
        difference: row.cash_difference,
        mmDifference: row.mobile_money_difference,
        note: row.close_note ?? '',
        corrected: row.corrected_at ? 'Oui' : '',
      })),
    },
    currency,
  );

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

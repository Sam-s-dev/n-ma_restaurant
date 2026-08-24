import { query, queryOne } from '../../db/pool';
import { round2 } from '../../utils/money';
import { getBalance } from '../cash/cash.service';
import { totalOutstanding } from '../credits/credits.service';
import { lowStockAlerts } from '../stock/stock.service';
import { salaryOverview } from '../staff/staff.service';

export interface DashboardSummary {
  cash: { balance: number; totalIn: number; totalOut: number };
  today: { sales: number; salesCount: number; expenses: number; net: number };
  month: { sales: number; expenses: number; net: number };
  credits: { totalOutstanding: number; openCount: number };
  stock: { totalValue: number; lowCount: number };
  staff: { employees: number; presentToday: number; salaryBalanceDue: number };
  menu: { dishes: number; outOfStock: number };
}

/**
 * Écran d'accueil de l'application : reprend le tableau §10 du cahier des
 * charges (caisse, ventes, créances, stock, personnel) en une seule requête
 * par domaine.
 */
export async function getSummary(restaurantId: string): Promise<DashboardSummary> {
  const [cash, outstanding, lowStock, staff] = await Promise.all([
    getBalance(restaurantId),
    totalOutstanding(restaurantId),
    lowStockAlerts(restaurantId),
    salaryOverview(restaurantId),
  ]);

  const activity = await queryOne<{
    today_sales: number;
    today_sales_count: number;
    today_expenses: number;
    month_sales: number;
    month_expenses: number;
    open_credits: number;
    stock_value: number;
    dishes: number;
    out_of_stock: number;
    present_today: number;
  }>(
    `SELECT
       (SELECT COALESCE(sum(total_amount), 0) FROM sales
         WHERE restaurant_id = $1 AND status <> 'cancelled'
           AND sold_at >= date_trunc('day', now()))                       AS today_sales,
       (SELECT count(*)::int FROM sales
         WHERE restaurant_id = $1 AND status <> 'cancelled'
           AND sold_at >= date_trunc('day', now()))                       AS today_sales_count,
       (SELECT COALESCE(sum(amount), 0) FROM expenses
         WHERE restaurant_id = $1 AND cancelled_at IS NULL
           AND expense_date = CURRENT_DATE)                               AS today_expenses,
       (SELECT COALESCE(sum(total_amount), 0) FROM sales
         WHERE restaurant_id = $1 AND status <> 'cancelled'
           AND sold_at >= date_trunc('month', now()))                     AS month_sales,
       (SELECT COALESCE(sum(amount), 0) FROM expenses
         WHERE restaurant_id = $1 AND cancelled_at IS NULL
           AND expense_date >= date_trunc('month', CURRENT_DATE))         AS month_expenses,
       (SELECT count(*)::int FROM credits
         WHERE restaurant_id = $1 AND status IN ('open', 'partially_paid')) AS open_credits,
       (SELECT COALESCE(sum(quantity * purchase_price), 0) FROM stock_items
         WHERE restaurant_id = $1 AND NOT is_archived)                    AS stock_value,
       (SELECT count(*)::int FROM dishes
         WHERE restaurant_id = $1 AND NOT is_archived)                    AS dishes,
       (SELECT count(*)::int FROM dishes
         WHERE restaurant_id = $1 AND NOT is_archived AND NOT is_available) AS out_of_stock,
       (SELECT count(*)::int FROM attendances
         WHERE restaurant_id = $1 AND day = CURRENT_DATE AND status = 'present') AS present_today`,
    [restaurantId],
  );

  const todaySales = activity?.today_sales ?? 0;
  const todayExpenses = activity?.today_expenses ?? 0;
  const monthSales = activity?.month_sales ?? 0;
  const monthExpenses = activity?.month_expenses ?? 0;

  return {
    cash: { balance: cash.balance, totalIn: cash.totalIn, totalOut: cash.totalOut },
    today: {
      sales: todaySales,
      salesCount: activity?.today_sales_count ?? 0,
      expenses: todayExpenses,
      net: round2(todaySales - todayExpenses),
    },
    month: {
      sales: monthSales,
      expenses: monthExpenses,
      net: round2(monthSales - monthExpenses),
    },
    credits: { totalOutstanding: outstanding, openCount: activity?.open_credits ?? 0 },
    stock: { totalValue: activity?.stock_value ?? 0, lowCount: lowStock.length },
    staff: {
      employees: staff.employees,
      presentToday: activity?.present_today ?? 0,
      salaryBalanceDue: staff.totalBalanceDue,
    },
    menu: { dishes: activity?.dishes ?? 0, outOfStock: activity?.out_of_stock ?? 0 },
  };
}

/** Courbe entrées / sorties sur les N derniers jours. */
export async function getDailyTrend(
  restaurantId: string,
  days = 14,
): Promise<Array<{ day: string; totalIn: number; totalOut: number; net: number }>> {
  return query(
    `SELECT to_char(d.day, 'YYYY-MM-DD')          AS day,
            COALESCE(s.total_in, 0)               AS "totalIn",
            COALESCE(s.total_out, 0)              AS "totalOut",
            COALESCE(s.net, 0)                    AS net
       FROM generate_series(CURRENT_DATE - ($2::int - 1), CURRENT_DATE, interval '1 day') AS d(day)
       LEFT JOIN v_daily_cash_summary s
              ON s.day = d.day::date AND s.restaurant_id = $1
      ORDER BY d.day`,
    [restaurantId, days],
  );
}

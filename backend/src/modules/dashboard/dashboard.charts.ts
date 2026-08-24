import { query } from '../../db/pool';

/**
 * Séries destinées aux graphiques du tableau de bord.
 *
 * Tout est renvoyé par un seul appel : sur l'offre gratuite de Render,
 * chaque requête supplémentaire ajoute une latence visible au chargement
 * de l'écran d'accueil. Les six séries sont indépendantes, elles partent
 * donc en parallèle côté serveur.
 *
 * Fuseau : la Guinée est à UTC+0 (Africa/Conakry), les dates sont donc
 * découpées en UTC, comme la vue `v_daily_cash_summary`.
 */
export interface DashboardCharts {
  range: { days: number; from: string; to: string };
  /** Une entrée par jour, jours sans activité inclus (sinon la courbe ment). */
  daily: DailyPoint[];
  /** Chiffre d'affaires par heure : fait ressortir les coups de feu. */
  hourly: HourlyPoint[];
  /** Chiffre d'affaires par jour de semaine (lundi = 1). */
  weekday: WeekdayPoint[];
  expensesByCategory: CategorySlice[];
  paymentMix: PaymentSlice[];
  topDishes: TopDish[];
  lowStock: LowStockItem[];
  topDebtors: Debtor[];
}

export interface DailyPoint {
  day: string;
  revenue: number;
  salesCount: number;
  expenses: number;
  net: number;
  cashIn: number;
  cashOut: number;
}

export interface HourlyPoint {
  hour: number;
  revenue: number;
  count: number;
}

export interface WeekdayPoint {
  weekday: number;
  revenue: number;
  count: number;
}

export interface CategorySlice {
  category: string;
  total: number;
  count: number;
}

export interface PaymentSlice {
  paymentMethod: string;
  total: number;
  count: number;
}

export interface TopDish {
  dishName: string;
  quantity: number;
  revenue: number;
}

export interface LowStockItem {
  id: string;
  name: string;
  unit: string;
  quantity: number;
  alertThreshold: number;
}

export interface Debtor {
  id: string;
  fullName: string;
  phone: string | null;
  totalDue: number;
}

/** Borne basse de la période, incluse : aujourd'hui − (days − 1). */
const FROM = `(CURRENT_DATE - ($2::int - 1))`;

export async function getCharts(restaurantId: string, days: number): Promise<DashboardCharts> {
  const args = [restaurantId, days];

  const [daily, hourly, weekday, expensesByCategory, paymentMix, topDishes, lowStock, topDebtors] =
    await Promise.all([
      dailySeries(args),
      hourlySeries(args),
      weekdaySeries(args),
      expenseSlices(args),
      paymentSlices(args),
      topDishSeries(args),
      lowStockItems(restaurantId),
      debtors(restaurantId),
    ]);

  return {
    range: {
      days,
      from: daily[0]?.day ?? '',
      to: daily[daily.length - 1]?.day ?? '',
    },
    daily,
    hourly,
    weekday,
    expensesByCategory,
    paymentMix,
    topDishes,
    lowStock,
    topDebtors,
  };
}

/**
 * Recette, dépenses et flux de caisse jour par jour.
 *
 * Recette ≠ encaissements : une vente à crédit compte dans la recette mais
 * n'entre pas en caisse (§8). Les deux séries sont renvoyées pour que le
 * gérant voie l'écart.
 */
function dailySeries(args: unknown[]): Promise<DailyPoint[]> {
  return query<DailyPoint>(
    `WITH days AS (
       SELECT generate_series(${FROM}, CURRENT_DATE, interval '1 day')::date AS day
     ),
     sales_agg AS (
       SELECT (sold_at AT TIME ZONE 'UTC')::date AS day,
              sum(total_amount) AS revenue,
              count(*)::int     AS sales_count
         FROM sales
        WHERE restaurant_id = $1 AND status <> 'cancelled'
          AND (sold_at AT TIME ZONE 'UTC')::date >= ${FROM}
        GROUP BY 1
     ),
     expenses_agg AS (
       SELECT expense_date AS day, sum(amount) AS expenses
         FROM expenses
        WHERE restaurant_id = $1 AND cancelled_at IS NULL
          AND expense_date >= ${FROM}
        GROUP BY 1
     )
     SELECT to_char(d.day, 'YYYY-MM-DD')                                AS day,
            COALESCE(s.revenue, 0)                                      AS revenue,
            COALESCE(s.sales_count, 0)                                  AS "salesCount",
            COALESCE(e.expenses, 0)                                     AS expenses,
            COALESCE(s.revenue, 0) - COALESCE(e.expenses, 0)            AS net,
            COALESCE(c.total_in, 0)                                     AS "cashIn",
            COALESCE(c.total_out, 0)                                    AS "cashOut"
       FROM days d
       LEFT JOIN sales_agg    s ON s.day = d.day
       LEFT JOIN expenses_agg e ON e.day = d.day
       LEFT JOIN v_daily_cash_summary c ON c.day = d.day AND c.restaurant_id = $1
      ORDER BY d.day`,
    args,
  );
}

/** Les 24 heures sont toujours présentes : la barre à zéro fait sens ici. */
function hourlySeries(args: unknown[]): Promise<HourlyPoint[]> {
  return query<HourlyPoint>(
    `SELECT h.hour::int                  AS hour,
            COALESCE(s.revenue, 0)       AS revenue,
            COALESCE(s.count, 0)::int    AS count
       FROM generate_series(0, 23) AS h(hour)
       LEFT JOIN (
         SELECT date_part('hour', sold_at AT TIME ZONE 'UTC')::int AS hour,
                sum(total_amount) AS revenue,
                count(*)          AS count
           FROM sales
          WHERE restaurant_id = $1 AND status <> 'cancelled'
            AND (sold_at AT TIME ZONE 'UTC')::date >= ${FROM}
          GROUP BY 1
       ) s ON s.hour = h.hour
      ORDER BY h.hour`,
    args,
  );
}

/** `isodow` : 1 = lundi … 7 = dimanche, l'ordre attendu en français. */
function weekdaySeries(args: unknown[]): Promise<WeekdayPoint[]> {
  return query<WeekdayPoint>(
    `SELECT w.dow::int                   AS weekday,
            COALESCE(s.revenue, 0)       AS revenue,
            COALESCE(s.count, 0)::int    AS count
       FROM generate_series(1, 7) AS w(dow)
       LEFT JOIN (
         SELECT date_part('isodow', sold_at AT TIME ZONE 'UTC')::int AS dow,
                sum(total_amount) AS revenue,
                count(*)          AS count
           FROM sales
          WHERE restaurant_id = $1 AND status <> 'cancelled'
            AND (sold_at AT TIME ZONE 'UTC')::date >= ${FROM}
          GROUP BY 1
       ) s ON s.dow = w.dow
      ORDER BY w.dow`,
    args,
  );
}

function expenseSlices(args: unknown[]): Promise<CategorySlice[]> {
  return query<CategorySlice>(
    `SELECT category,
            sum(amount)   AS total,
            count(*)::int AS count
       FROM expenses
      WHERE restaurant_id = $1 AND cancelled_at IS NULL
        AND expense_date >= ${FROM}
      GROUP BY category
      ORDER BY total DESC`,
    args,
  );
}

/**
 * Répartition des ventes par mode de règlement — crédit compris, ce que ne
 * montre pas `/api/cash/breakdown` qui ne lit que les entrées de caisse.
 */
function paymentSlices(args: unknown[]): Promise<PaymentSlice[]> {
  return query<PaymentSlice>(
    `SELECT payment_method AS "paymentMethod",
            sum(total_amount) AS total,
            count(*)::int     AS count
       FROM sales
      WHERE restaurant_id = $1 AND status <> 'cancelled'
        AND (sold_at AT TIME ZONE 'UTC')::date >= ${FROM}
      GROUP BY payment_method
      ORDER BY total DESC`,
    args,
  );
}

function topDishSeries(args: unknown[]): Promise<TopDish[]> {
  return query<TopDish>(
    `SELECT si.dish_name        AS "dishName",
            sum(si.quantity)    AS quantity,
            sum(si.line_total)  AS revenue
       FROM sale_items si
       JOIN sales s ON s.id = si.sale_id
      WHERE si.restaurant_id = $1 AND s.status <> 'cancelled'
        AND (s.sold_at AT TIME ZONE 'UTC')::date >= ${FROM}
      GROUP BY si.dish_name
      ORDER BY revenue DESC
      LIMIT 6`,
    args,
  );
}

/** Alertes de stock (§6) : les cinq produits les plus critiques. */
function lowStockItems(restaurantId: string): Promise<LowStockItem[]> {
  return query<LowStockItem>(
    `SELECT id, name, unit, quantity, alert_threshold AS "alertThreshold"
       FROM stock_items
      WHERE restaurant_id = $1 AND NOT is_archived AND quantity <= alert_threshold
      ORDER BY (quantity - alert_threshold), name
      LIMIT 5`,
    [restaurantId],
  );
}

/** Créances (§8) : les cinq clients qui doivent le plus. */
function debtors(restaurantId: string): Promise<Debtor[]> {
  return query<Debtor>(
    `SELECT customer_id AS id, full_name AS "fullName", phone, total_due AS "totalDue"
       FROM v_customer_debts
      WHERE restaurant_id = $1 AND total_due > 0
      ORDER BY total_due DESC
      LIMIT 5`,
    [restaurantId],
  );
}

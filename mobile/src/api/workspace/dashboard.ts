import { authed, queryString } from '../authed';

/** Synthèse §10 : caisse, ventes, créances, stock, personnel, menu. */
export interface DashboardSummary {
  cash: { balance: number; totalIn: number; totalOut: number };
  today: { sales: number; salesCount: number; expenses: number; net: number };
  month: { sales: number; expenses: number; net: number };
  credits: { totalOutstanding: number; openCount: number };
  stock: { totalValue: number; lowCount: number };
  staff: { employees: number; presentToday: number; salaryBalanceDue: number };
  menu: { dishes: number; outOfStock: number };
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

export interface DashboardCharts {
  range: { days: number; from: string; to: string };
  daily: DailyPoint[];
  hourly: HourlyPoint[];
  weekday: WeekdayPoint[];
  expensesByCategory: CategorySlice[];
  paymentMix: PaymentSlice[];
  topDishes: TopDish[];
  lowStock: LowStockItem[];
  topDebtors: Debtor[];
}

export function fetchSummary(): Promise<DashboardSummary> {
  return authed<DashboardSummary>('/api/dashboard/summary');
}

/** Toutes les séries des graphiques en un appel (voir dashboard.charts.ts). */
export function fetchCharts(days: number): Promise<DashboardCharts> {
  return authed<DashboardCharts>(`/api/dashboard/charts${queryString({ days })}`);
}

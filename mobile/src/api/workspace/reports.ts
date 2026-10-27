import { authed, authedBlob, queryString } from '../authed';

/** Synthèse d'une période, base du rapport PDF. */
export interface PeriodReport {
  period: { from: string; to: string };
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
  result: number;
  capital: { in: number; out: number };
  outstandingCredits: number;
  topDishes: Array<{ dishName: string; quantity: number; revenue: number }>;
  sessions: { count: number; withDifference: number; totalCashDifference: number };
}

export function fetchPeriodReport(from: string, to: string): Promise<PeriodReport> {
  return authed<PeriodReport>(`/api/reports/summary${queryString({ from, to })}`);
}

/** Le classeur Excel de la période, à enregistrer ou à transmettre au comptable. */
export function downloadWorkbook(from: string, to: string): Promise<Blob> {
  return authedBlob(`/api/reports/export.xlsx${queryString({ from, to })}`);
}

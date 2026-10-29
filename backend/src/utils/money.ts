/** Arrondi monétaire à 2 décimales, stable sur les flottants JS. */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Montant lisible dans une notification : « 85 000 FG ». */
export function formatAmount(value: number, symbol: string): string {
  const digits = Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${digits} ${symbol}`;
}

/** Arrondi des quantités de stock à 3 décimales (kg, litres...). */
export function round3(value: number): number {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

/** Premier jour du mois, au format 'YYYY-MM-DD'. */
export function firstOfMonth(input: string | Date): string {
  const date = typeof input === 'string' ? new Date(`${input.slice(0, 10)}T00:00:00Z`) : input;
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

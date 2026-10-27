import type { PeriodReport } from '../api/workspace/reports';
import { PAYMENT_LABELS } from '../api/workspace/sales';
import { formatFullDate } from './date';
import { formatMoney } from './money';
import { embedLogo, escapeHtml, printDocument } from './receiptPdf';

const EXPENSE_LABELS: Record<string, string> = {
  stock_purchase: 'Achats de stock',
  salary: 'Salaires',
  bill: 'Factures',
  maintenance: 'Entretien',
  other: 'Autres',
};

/**
 * Rapport de la période en A4 : ce que le gérant imprime en fin de mois,
 * ou envoie au comptable avec le classeur Excel.
 */
async function buildPeriodReportHtml(report: PeriodReport): Promise<string> {
  const currency = {
    symbol: report.restaurant.currencySymbol,
    decimals: report.restaurant.currencyDecimals,
  };
  const money = (value: number) => escapeHtml(formatMoney(value, currency));
  const logo = await embedLogo(report.restaurant.logoUrl);

  const rows = (items: Array<[string, string]>) =>
    items.map(([label, value]) => `<tr><td>${escapeHtml(label)}</td><td class="r">${value}</td></tr>`).join('');

  const kpi = (label: string, value: string, tone = '') =>
    `<div class="kpi ${tone}"><div class="kpi-label">${escapeHtml(label)}</div><div class="kpi-value">${value}</div></div>`;

  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8" />
<style>
  @page { size: A4; margin: 16mm; }
  body { font-family: -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; color: #1d1d1f; font-size: 12px; }
  header { display: flex; align-items: center; gap: 14px; border-bottom: 3px solid #E63946; padding-bottom: 12px; }
  header img { width: 56px; height: 56px; border-radius: 12px; object-fit: cover; }
  h1 { font-size: 20px; margin: 0; }
  .muted { color: #6e6e73; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .04em; color: #E63946; margin: 22px 0 8px; }
  .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-top: 16px; }
  .kpi { background: #f5f5f7; border-radius: 10px; padding: 10px 12px; }
  .kpi-label { color: #6e6e73; font-size: 10px; text-transform: uppercase; letter-spacing: .04em; }
  .kpi-value { font-size: 16px; font-weight: 700; margin-top: 4px; }
  .good .kpi-value { color: #2E9E5B; } .bad .kpi-value { color: #E63946; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 6px 0; border-bottom: 1px solid #ececee; }
  .r { text-align: right; font-variant-numeric: tabular-nums; }
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
  footer { margin-top: 28px; color: #6e6e73; font-size: 10px; text-align: center; }
</style></head><body>
  <header>
    ${logo ? `<img src="${logo}" alt="" />` : ''}
    <div>
      <h1>${escapeHtml(report.restaurant.name)}</h1>
      <div class="muted">Rapport du ${escapeHtml(formatFullDate(report.period.from))} au ${escapeHtml(
        formatFullDate(report.period.to),
      )}</div>
    </div>
  </header>

  <div class="kpis">
    ${kpi('Chiffre d’affaires', money(report.sales.revenue))}
    ${kpi('Dépenses', money(report.expenses.total))}
    ${kpi('Résultat', money(report.result), report.result >= 0 ? 'good' : 'bad')}
    ${kpi('Créances en cours', money(report.outstandingCredits))}
  </div>

  <div class="cols">
    <div>
      <h2>Ventes</h2>
      <table>${rows([
        ['Nombre de ventes', String(report.sales.count)],
        ['Encaissé', money(report.sales.cashed)],
        ['À crédit', money(report.sales.onCredit)],
        ...report.sales.byMethod.map(
          (row): [string, string] => [
            `${PAYMENT_LABELS[row.method] ?? row.method} (${row.count})`,
            money(row.total),
          ],
        ),
        ['Remboursements de créances reçus', money(report.creditRepayments)],
        [`Ventes annulées (${report.sales.cancelledCount})`, money(report.sales.cancelledTotal)],
      ])}</table>
    </div>
    <div>
      <h2>Dépenses</h2>
      <table>${rows(
        report.expenses.byCategory.length > 0
          ? report.expenses.byCategory.map(
              (row): [string, string] => [EXPENSE_LABELS[row.category] ?? row.category, money(row.total)],
            )
          : [['Aucune dépense sur la période', '—']],
      )}</table>
    </div>
  </div>

  <div class="cols">
    <div>
      <h2>Plats vedettes</h2>
      <table>${rows(
        report.topDishes.length > 0
          ? report.topDishes.map(
              (dish): [string, string] => [`${dish.dishName} (${dish.quantity})`, money(dish.revenue)],
            )
          : [['Aucune vente sur la période', '—']],
      )}</table>
    </div>
    <div>
      <h2>Caisse</h2>
      <table>${rows([
        ['Clôtures', String(report.sessions.count)],
        ['Clôtures avec écart', String(report.sessions.withDifference)],
        ['Écart cumulé', money(report.sessions.totalCashDifference)],
        ['Apports du gérant', money(report.capital.in)],
        ['Retraits du gérant', money(report.capital.out)],
      ])}</table>
    </div>
  </div>

  <footer>Résultat = chiffre d’affaires − dépenses de la période (achats, salaires, factures…). Établi avec N’ma Restaurant.</footer>
</body></html>`;
}

export async function printPeriodReport(report: PeriodReport): Promise<void> {
  const html = await buildPeriodReportHtml(report);
  await printDocument(html, {
    title: `Rapport ${report.period.from} – ${report.period.to}`,
  });
}

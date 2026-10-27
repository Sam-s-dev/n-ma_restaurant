import type { CashSession } from '../api/workspace/sessions';
import { PAYMENT_LABELS } from '../api/workspace/sales';
import { formatDateTime } from './date';
import { formatMoney } from './money';
import type { Currency } from './money';
import { escapeHtml, printDocument } from './receiptPdf';

/**
 * Ticket Z : le récapitulatif imprimé d'une clôture de caisse, au format
 * des imprimantes à tickets. Il reprend les chiffres figés à la clôture,
 * pas ceux d'aujourd'hui : une vente annulée demain ne le modifie pas.
 */
function buildZReportHtml(session: CashSession, restaurantName: string, currency: Currency): string {
  const money = (value: number | null | undefined) => formatMoney(value ?? 0, currency);
  const signed = (value: number | null | undefined) =>
    `${(value ?? 0) > 0 ? '+' : ''}${money(value)}`;
  const summary = session.summary;

  const line = (label: string, value: string, strong = false) =>
    `<tr${strong ? ' class="strong"' : ''}><td>${escapeHtml(label)}</td><td class="r">${escapeHtml(value)}</td></tr>`;

  const salesByMethod = summary
    ? Object.entries(summary.sales.byMethod)
        .map(([method, entry]) =>
          line(`${PAYMENT_LABELS[method] ?? method} (${entry.count})`, money(entry.total)),
        )
        .join('')
    : '';

  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8" />
<style>
  @page { margin: 6mm; }
  body { font-family: 'Courier New', monospace; font-size: 11px; color: #111; margin: 0; }
  h1 { font-size: 14px; text-align: center; margin: 0 0 2px; }
  .c { text-align: center; } .r { text-align: right; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 2px 0; vertical-align: top; }
  .strong td { font-weight: bold; }
  hr { border: 0; border-top: 1px dashed #555; margin: 6px 0; }
  .section { font-weight: bold; margin-top: 6px; text-transform: uppercase; font-size: 10px; }
</style></head><body>
  <h1>${escapeHtml(restaurantName)}</h1>
  <div class="c">TICKET Z · ${escapeHtml(session.reference)}</div>
  <hr />
  <table>
    ${line('Ouverture', `${formatDateTime(session.openedAt)} · ${session.openedByName ?? '—'}`)}
    ${line('Clôture', `${session.closedAt ? formatDateTime(session.closedAt) : '—'} · ${session.closedByName ?? '—'}`)}
  </table>
  ${
    summary
      ? `<div class="section">Ventes</div>
  <table>
    ${line(`Ventes (${summary.sales.count})`, money(summary.sales.total), true)}
    ${salesByMethod}
    ${summary.cancelledSales.count > 0 ? line(`Annulées (${summary.cancelledSales.count})`, money(summary.cancelledSales.total)) : ''}
  </table>
  <div class="section">Autres mouvements</div>
  <table>
    ${line('Remboursements reçus', money(summary.creditRepayments))}
    ${line('Dépenses', `−${money(summary.expenses)}`)}
    ${summary.salaries ? line('Salaires', `−${money(summary.salaries)}`) : ''}
    ${summary.capitalIn ? line('Apports', money(summary.capitalIn)) : ''}
    ${summary.capitalOut ? line('Retraits', `−${money(summary.capitalOut)}`) : ''}
    ${summary.adjustments ? line('Corrections', signed(summary.adjustments)) : ''}
  </table>`
      : ''
  }
  <div class="section">Espèces</div>
  <table>
    ${line('Fond de caisse', money(session.openingFloat))}
    ${line('Attendu', money(session.expectedCash))}
    ${line('Compté', money(session.countedCash))}
    ${line('Écart', signed(session.cashDifference), true)}
  </table>
  ${
    session.countedMobileMoney !== null
      ? `<div class="section">Mobile Money</div>
  <table>
    ${line('Attendu', money(session.expectedMobileMoney))}
    ${line('Relevé', money(session.countedMobileMoney))}
    ${line('Écart', signed(session.mobileMoneyDifference), true)}
  </table>`
      : ''
  }
  ${session.closeNote ? `<hr /><div>Motif : ${escapeHtml(session.closeNote)}</div>` : ''}
  ${session.correctedAt ? `<div>Écart corrigé par ${escapeHtml(session.correctedByName ?? '—')}</div>` : ''}
  <hr />
  <div class="c">Imprimé le ${escapeHtml(formatDateTime(new Date().toISOString()))}</div>
</body></html>`;
}

export function printZReport(session: CashSession, restaurantName: string, currency: Currency) {
  return printDocument(buildZReportHtml(session, restaurantName, currency), {
    title: `Ticket Z ${session.reference}`,
    ticket: true,
  });
}

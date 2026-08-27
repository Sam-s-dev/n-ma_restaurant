import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { API_URL } from '../api/client';
import { PAYMENT_LABELS } from '../api/workspace/sales';
import type { Receipt } from '../api/workspace/sales';
import { formatMoney } from './money';
import { formatDateTime } from './date';

/**
 * Ticket de caisse au format PDF, imprimable.
 *
 * Le ticket est composé en HTML puis rendu en PDF par le moteur du système
 * (WebView sur téléphone, moteur d'impression du navigateur sur ordinateur).
 * C'est la seule façon d'obtenir un vrai document — partageable, archivable,
 * imprimable sur une imprimante thermique — sans embarquer une bibliothèque
 * de composition PDF de plusieurs mégaoctets.
 *
 * Largeur de page : 80 mm, le format des imprimantes à tickets. Sur une
 * imprimante A4 le ticket sort centré en haut de page, ce qui reste
 * parfaitement lisible.
 */

/** Largeur d'un rouleau thermique standard, en points PostScript (72 dpi). */
const TICKET_WIDTH_PT = 226; // 80 mm
const TICKET_HEIGHT_PT = 800;

/**
 * Le logo est incorporé au document en base64.
 *
 * Une simple URL obligerait le moteur d'impression à aller la chercher sur
 * le réseau au moment du rendu : sur une connexion lente, le PDF sortirait
 * sans logo. En cas d'échec, on renvoie `null` et l'en-tête retombe sur
 * les initiales du restaurant.
 */
async function embedLogo(logoUrl: string | null): Promise<string | null> {
  if (!logoUrl) return null;

  try {
    const response = await fetch(`${API_URL}${logoUrl}`);
    if (!response.ok) return null;

    const blob = await response.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');
}

export async function buildReceiptHtml(data: Receipt): Promise<string> {
  const { restaurant, sale } = data;
  const currency = {
    symbol: restaurant.currencySymbol,
    decimals: restaurant.currencyDecimals,
  };
  const money = (value: number) => formatMoney(value, currency);

  const logo = await embedLogo(restaurant.logoUrl);

  const lines = (sale.items ?? [])
    .map(
      (item) => `
        <tr>
          <td class="qty">${item.quantity}×</td>
          <td class="name">${escapeHtml(item.dishName)}</td>
          <td class="amount">${escapeHtml(money(item.lineTotal))}</td>
        </tr>`,
    )
    .join('');

  const meta = [
    ['Ticket', sale.reference],
    ['Date', formatDateTime(sale.soldAt)],
    ['Règlement', PAYMENT_LABELS[sale.paymentMethod] ?? sale.paymentMethod],
    ...(sale.customerName ? [['Client', sale.customerName]] : []),
    ...(sale.createdByName ? [['Servi par', sale.createdByName]] : []),
  ]
    .map(
      ([label, value]) =>
        `<div class="meta-row"><span>${escapeHtml(label as string)}</span><span>${escapeHtml(
          value as string,
        )}</span></div>`,
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Ticket ${escapeHtml(sale.reference)}</title>
<style>
  /* Pas de police externe : le moteur d'impression n'a pas toujours accès
     au réseau, et une police manquante décalerait toute la mise en page. */
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 14px 16px 22px;
    width: 100%;
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    color: #17161A;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .header { text-align: center; }
  .logo { width: 58px; height: 58px; object-fit: contain; margin-bottom: 6px; }
  .initials {
    width: 52px; height: 52px; margin: 0 auto 6px; border-radius: 12px;
    background: #E63946; color: #fff; font-weight: 700; font-size: 19px;
    display: flex; align-items: center; justify-content: center;
  }
  .name { font-size: 15px; font-weight: 700; letter-spacing: .6px; text-transform: uppercase; }
  .contact { font-size: 10px; color: #6B6B75; line-height: 1.45; }
  .rule { border-top: 1px dashed #B9B9C0; margin: 12px 0; }
  .meta-row { display: flex; justify-content: space-between; font-size: 10px; line-height: 1.6; }
  .meta-row span:first-child { color: #6B6B75; }
  .meta-row span:last-child { font-weight: 600; text-align: right; }
  table { width: 100%; border-collapse: collapse; }
  td { font-size: 11px; padding: 2px 0; vertical-align: top; }
  td.qty { width: 26px; font-weight: 700; color: #6B6B75; }
  td.name { padding-right: 6px; }
  td.amount { text-align: right; white-space: nowrap; font-weight: 600; }
  .total { display: flex; justify-content: space-between; align-items: baseline; }
  .total .label { font-size: 12px; font-weight: 700; letter-spacing: 1px; }
  .total .value { font-size: 17px; font-weight: 700; color: #E63946; }
  .notice { margin-top: 10px; padding: 7px 9px; border-radius: 6px; font-size: 10px; text-align: center; }
  .credit { background: #FFF4E3; color: #B5700F; }
  .cancelled { background: #FDECEE; color: #C22232; font-weight: 700; letter-spacing: 1px; }
  .note { margin-top: 8px; font-size: 10px; color: #6B6B75; text-align: center; }
  .thanks { margin-top: 14px; font-size: 10px; color: #6B6B75; text-align: center; }
  @page { margin: 0; }
</style>
</head>
<body>
  <div class="header">
    ${
      logo
        ? `<img class="logo" src="${logo}" alt="" />`
        : `<div class="initials">${escapeHtml(initialsOf(restaurant.name))}</div>`
    }
    <div class="name">${escapeHtml(restaurant.name)}</div>
    ${restaurant.address ? `<div class="contact">${escapeHtml(restaurant.address)}</div>` : ''}
    ${restaurant.phone ? `<div class="contact">${escapeHtml(restaurant.phone)}</div>` : ''}
  </div>

  <div class="rule"></div>
  ${meta}
  <div class="rule"></div>

  <table>${lines}</table>

  <div class="rule"></div>
  <div class="total">
    <span class="label">TOTAL</span>
    <span class="value">${escapeHtml(money(sale.totalAmount))}</span>
  </div>

  ${
    sale.credit
      ? `<div class="notice credit">Réglé à crédit — reste dû : ${escapeHtml(
          money(sale.credit.amountLeft),
        )}${sale.credit.dueDate ? ` (échéance ${escapeHtml(sale.credit.dueDate)})` : ''}</div>`
      : ''
  }
  ${
    sale.status === 'cancelled'
      ? `<div class="notice cancelled">VENTE ANNULÉE${
          sale.cancelReason ? `<br />${escapeHtml(sale.cancelReason)}` : ''
        }</div>`
      : ''
  }
  ${sale.note ? `<div class="note">${escapeHtml(sale.note)}</div>` : ''}

  <div class="thanks">Merci de votre visite</div>
</body>
</html>`;
}

/**
 * Ouvre la boîte d'impression du système.
 *
 * Sur navigateur, `Print.printAsync` imprimerait la page affichée et non le
 * ticket : on compose donc le document dans un cadre invisible, dont on
 * déclenche l'impression. La boîte d'impression du navigateur propose
 * « Enregistrer au format PDF », ce qui couvre les deux besoins.
 */
export async function printReceipt(data: Receipt): Promise<void> {
  const html = await buildReceiptHtml(data);

  if (Platform.OS === 'web') {
    printHtmlInFrame(html);
    return;
  }

  await Print.printAsync({ html, width: TICKET_WIDTH_PT, height: TICKET_HEIGHT_PT });
}

/**
 * Produit le PDF et propose de le partager (WhatsApp, e-mail, fichiers).
 *
 * Sur navigateur il n'existe pas de partage de fichier fiable : on retombe
 * sur la boîte d'impression, où « Enregistrer au format PDF » donne le même
 * document.
 */
export async function shareReceiptPdf(data: Receipt): Promise<void> {
  const html = await buildReceiptHtml(data);

  if (Platform.OS === 'web') {
    printHtmlInFrame(html);
    return;
  }

  const { uri } = await Print.printToFileAsync({
    html,
    width: TICKET_WIDTH_PT,
    height: TICKET_HEIGHT_PT,
  });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: `Ticket ${data.sale.reference}`,
      UTI: 'com.adobe.pdf',
    });
    return;
  }

  // Aucun partage disponible : l'impression reste possible.
  await Print.printAsync({ uri });
}

/**
 * Cadre invisible dédié à l'impression. Un `window.open` serait bloqué par
 * les bloqueurs de fenêtres sur certains navigateurs, même déclenché par un
 * clic ; un iframe passe toujours.
 */
function printHtmlInFrame(html: string): void {
  const doc = globalThis.document;
  if (!doc) return;

  const frame = doc.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.position = 'fixed';
  frame.style.right = '0';
  frame.style.bottom = '0';
  frame.style.width = '0';
  frame.style.height = '0';
  frame.style.border = '0';

  frame.onload = () => {
    const view = frame.contentWindow;
    if (!view) return;
    view.focus();
    view.print();
    // Le retrait est différé : Safari referme la boîte d'impression si le
    // cadre disparaît pendant qu'elle est ouverte.
    setTimeout(() => frame.remove(), 60_000);
  };

  doc.body.appendChild(frame);
  frame.srcdoc = html;
}

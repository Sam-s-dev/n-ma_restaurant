import QRCode from 'qrcode';
import { escapeHtml, printDocument } from './receiptPdf';

/**
 * QR code en SVG, dessiné ici même : aucun service extérieur ne voit le
 * lien, et l'image reste nette à l'écran comme sur une affiche imprimée.
 */
export function qrSvg(text: string, size = 240): string {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const count = modules.size;
  const margin = 2;
  const total = count + margin * 2;
  let path = '';
  for (let y = 0; y < count; y += 1) {
    for (let x = 0; x < count; x += 1) {
      if (modules.get(y, x)) path += `M${x + margin} ${y + margin}h1v1h-1z`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${size}" height="${size}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${path}" fill="#17161A"/></svg>`;
}

/** Affiche A4 à poser sur les tables ou au comptoir. */
export function printOrderPoster(restaurantName: string, url: string): Promise<void> {
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Commander</title>
<style>
  body { font-family: Helvetica, Arial, sans-serif; text-align: center; color: #17161A; padding: 48px 32px; }
  h1 { font-size: 34px; margin: 0 0 8px; }
  p { font-size: 18px; color: #6B6B75; margin: 0 0 32px; }
  .qr svg { width: 340px; height: 340px; }
  .url { font-size: 16px; margin-top: 24px; font-weight: bold; color: #E63946; word-break: break-all; }
  .foot { font-size: 12px; color: #9A9AA3; margin-top: 48px; }
</style></head><body>
  <h1>${escapeHtml(restaurantName)}</h1>
  <p>Scannez pour commander : livraison ou à emporter</p>
  <div class="qr">${qrSvg(url, 340)}</div>
  <div class="url">${escapeHtml(url)}</div>
  <div class="foot">Paiement à la livraison · Espèces ou Mobile Money</div>
</body></html>`;
  return printDocument(html, { title: `Affiche — ${restaurantName}` });
}

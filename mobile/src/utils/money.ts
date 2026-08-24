/**
 * Mise en forme des montants.
 *
 * Le franc guinéen n'a pas de subdivision en usage : les montants
 * s'affichent sans décimale, avec une espace fine insécable comme
 * séparateur de milliers (« 1 250 000 FG »). Le format reste toutefois
 * piloté par les paramètres du restaurant, pour qu'un passage à l'euro
 * ou au dollar ne demande aucune modification de code.
 */
export interface Currency {
  symbol: string;
  decimals: number;
}

/** Devise par défaut, utilisée avant le chargement du profil. */
export const GNF: Currency = { symbol: 'FG', decimals: 0 };

/** Espace fine insécable : le montant ne se coupe jamais en fin de ligne. */
const THIN_SPACE = ' ';

function groupDigits(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, THIN_SPACE);
}

/** « 1 250 000 FG ». */
export function formatMoney(value: number, currency: Currency = GNF): string {
  return `${formatNumber(value, currency.decimals)}${THIN_SPACE}${currency.symbol}`;
}

/** Le nombre seul, sans symbole — pour les axes et les champs de saisie. */
export function formatNumber(value: number, decimals = 0): string {
  const safe = Number.isFinite(value) ? value : 0;
  const negative = safe < 0;
  const fixed = Math.abs(safe).toFixed(decimals);
  const [whole = '0', fraction] = fixed.split('.');

  const body = fraction ? `${groupDigits(whole)},${fraction}` : groupDigits(whole);
  return negative ? `−${body}` : body;
}

/**
 * Version courte pour les axes de graphiques, où « 1 250 000 » ne tient pas :
 * « 1,3 M », « 450 k ». Le seuil est bas (10 000) car les prix guinéens se
 * comptent en dizaines de milliers.
 */
export function formatCompact(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '−' : '';

  if (abs >= 1_000_000_000) return `${sign}${trim(abs / 1_000_000_000)} Md`;
  if (abs >= 1_000_000) return `${sign}${trim(abs / 1_000_000)} M`;
  if (abs >= 10_000) return `${sign}${trim(abs / 1000)} k`;
  return `${sign}${groupDigits(Math.round(abs).toString())}`;
}

/** Une décimale au maximum, et jamais « 1,0 ». */
function trim(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded)
    ? rounded.toString()
    : rounded.toString().replace('.', ',');
}

/**
 * Lit un montant saisi au clavier. Accepte la virgule décimale et les
 * espaces de groupement que l'utilisateur recopie parfois depuis l'écran.
 */
export function parseAmount(text: string): number | null {
  const cleaned = text.replace(/[\s  ]/g, '').replace(',', '.');
  if (cleaned === '') return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

/** Quantités de stock : jusqu'à 3 décimales, sans zéros inutiles. */
export function formatQuantity(value: number, unit?: string): string {
  const rounded = Math.round(value * 1000) / 1000;
  const text = Number.isInteger(rounded)
    ? groupDigits(rounded.toString())
    : rounded.toString().replace('.', ',');
  return unit ? `${text} ${unit}` : text;
}

/** Part d'un total, bornée pour éviter les NaN quand le total est nul. */
export function percentOf(value: number, total: number): number {
  if (!total) return 0;
  return Math.max(0, Math.min(100, (value / total) * 100));
}

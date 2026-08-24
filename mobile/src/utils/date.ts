/**
 * Dates en français, sans dépendance externe.
 *
 * Toutes les dates « métier » (jour d'une dépense, jour de pointage) sont
 * manipulées en chaînes `AAAA-MM-JJ` : c'est le format attendu par l'API et
 * il évite les décalages d'un jour que provoque un `new Date()` interprété
 * dans le fuseau du téléphone.
 */
export const MONTHS = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
] as const;

export const MONTHS_SHORT = [
  'janv.',
  'févr.',
  'mars',
  'avr.',
  'mai',
  'juin',
  'juil.',
  'août',
  'sept.',
  'oct.',
  'nov.',
  'déc.',
] as const;

/** Lundi en tête, comme `isodow` côté PostgreSQL. */
export const WEEKDAYS_SHORT = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'] as const;
export const WEEKDAYS = [
  'lundi',
  'mardi',
  'mercredi',
  'jeudi',
  'vendredi',
  'samedi',
  'dimanche',
] as const;

/** Aujourd'hui au format `AAAA-MM-JJ`, dans le fuseau du téléphone. */
export function todayISO(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Mois courant au format `AAAA-MM`, attendu par le paiement de salaire. */
export function currentMonthISO(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
}

/** Décale une date `AAAA-MM-JJ` de N jours (négatif pour reculer). */
export function shiftDays(iso: string, days: number): string {
  const date = parseISODate(iso);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** « 24 août ». */
export function formatDay(iso: string): string {
  const date = parseISODate(iso);
  return `${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

/** « 24/08 » — pour les axes, où la place manque. */
export function formatDayShort(iso: string): string {
  const date = parseISODate(iso);
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}`;
}

/** « 24 août 2026 ». */
export function formatFullDate(iso: string): string {
  const date = parseISODate(iso);
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/** « Lundi 24 août », en tête d'écran. */
export function formatWeekdayDate(iso: string): string {
  const date = parseISODate(iso);
  const weekday = WEEKDAYS[(date.getDay() + 6) % 7] ?? '';
  const capitalized = weekday.charAt(0).toUpperCase() + weekday.slice(1);
  return `${capitalized} ${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

/** Horodatage ISO complet → « 24 août, 13:42 ». */
export function formatDateTime(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) return '—';
  return `${date.getDate()} ${MONTHS_SHORT[date.getMonth()]}, ${pad(date.getHours())}:${pad(
    date.getMinutes(),
  )}`;
}

/** Horodatage ISO complet → « 13:42 ». */
export function formatTime(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) return '—';
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** « Aujourd'hui », « Hier », sinon la date courte. */
export function formatRelativeDay(iso: string): string {
  const today = todayISO();
  if (iso === today) return 'Aujourd’hui';
  if (iso === shiftDays(today, -1)) return 'Hier';
  return formatDay(iso);
}

/** Nombre de jours de retard, négatif si l'échéance est à venir. */
export function daysOverdue(dueDate: string): number {
  const due = parseISODate(dueDate).getTime();
  const today = parseISODate(todayISO()).getTime();
  return Math.round((today - due) / 86_400_000);
}

/** « 2026-08 » → « août 2026 ». */
export function formatMonth(monthISO: string): string {
  const [year, month] = monthISO.split('-');
  const index = Number(month) - 1;
  return `${MONTHS[index] ?? month} ${year}`;
}

function pad(value: number): string {
  return value.toString().padStart(2, '0');
}

/** Midi local : la date reste la bonne quel que soit le fuseau. */
function parseISODate(iso: string): Date {
  const [year, month, day] = iso.slice(0, 10).split('-').map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1, 12, 0, 0);
}

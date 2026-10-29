import { Platform } from 'react-native';

/**
 * Adresses du mini-site, lues dans la barre d'adresse du navigateur :
 *   /r/<adresse-du-restaurant>   la carte et la commande
 *   /suivi/<code>                 le suivi d'une commande
 *
 * Le client n'installe rien et n'a pas de compte : le lien partagé sur
 * WhatsApp ou le QR code de la table l'amène directement ici.
 */
export type PublicRoute = { kind: 'menu'; slug: string } | { kind: 'track'; code: string };

export function parsePublicPath(pathname: string): PublicRoute | null {
  const menu = /^\/r\/([a-z0-9-]{3,40})\/?$/i.exec(pathname);
  if (menu) return { kind: 'menu', slug: menu[1]!.toLowerCase() };
  const track = /^\/suivi\/([A-Za-z0-9_-]{10,20})\/?$/.exec(pathname);
  if (track) return { kind: 'track', code: track[1]! };
  return null;
}

export function pathOf(route: PublicRoute): string {
  return route.kind === 'menu' ? `/r/${route.slug}` : `/suivi/${route.code}`;
}

/** La page publique demandée, ou `null` pour l'application habituelle. */
export function currentPublicRoute(): PublicRoute | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  return parsePublicPath(window.location.pathname);
}

/**
 * Adresse de la version web, pour construire les liens à partager. Sur le
 * web, c'est celle où l'on se trouve ; dans l'application installée, celle
 * fixée au moment de la compilation.
 */
const DEFAULT_WEB_URL = 'https://n-ma-restaurant-1.onrender.com';

export function webAppUrl(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') return window.location.origin;
  return (process.env.EXPO_PUBLIC_WEB_URL ?? DEFAULT_WEB_URL).replace(/\/+$/, '');
}

export function publicMenuUrl(slug: string): string {
  return `${webAppUrl()}/r/${slug}`;
}

export function trackingUrl(code: string): string {
  return `${webAppUrl()}/suivi/${code}`;
}

/**
 * Commandes passées depuis ce téléphone : le client qui ferme la page les
 * retrouve en rouvrant le lien du restaurant, sans compte. Seul le code de
 * suivi est gardé ; l'état est toujours relu sur le serveur.
 */
export interface RememberedOrder {
  code: string;
  slug: string;
  reference: string;
  createdAt: string;
}

const ORDERS_KEY = 'nma.orders';
const MAX_REMEMBERED = 20;

export function rememberedOrders(slug?: string): RememberedOrder[] {
  try {
    const all = JSON.parse(readLocal(ORDERS_KEY) ?? '[]') as RememberedOrder[];
    return Array.isArray(all) ? all.filter((order) => !slug || order.slug === slug) : [];
  } catch {
    return [];
  }
}

export function rememberOrder(order: RememberedOrder): void {
  const others = rememberedOrders().filter((item) => item.code !== order.code);
  writeLocal(ORDERS_KEY, JSON.stringify([order, ...others].slice(0, MAX_REMEMBERED)));
}

/** Petites préférences du client (nom, téléphone) : jamais indispensables. */
export function readLocal(key: string): string | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeLocal(key: string, value: string): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
  } catch {
    // Navigation privée, stockage bloqué : le client ressaisira, voilà tout.
  }
}

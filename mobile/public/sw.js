/*
 * Service worker de N'ma Restaurant (version web installable).
 *
 * Il rend l'application installable sur Android, ordinateur et iPhone, et
 * accélère son ouverture : le code et les images de l'application, dont le
 * nom change à chaque version, sont gardés en cache ; la page elle-même est
 * toujours redemandée au réseau d'abord, pour qu'une mise à jour arrive dès
 * la réouverture.
 *
 * Les appels à l'API ne passent jamais par le cache : une vente ou un solde
 * de caisse doivent être exacts, pas « les derniers connus ».
 */

const CACHE = 'nma-shell-v1';
const SHELL = ['/', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

/** Fichiers dont le nom contient une empreinte : ils ne changent jamais. */
function isImmutable(url) {
  return url.pathname.startsWith('/_expo/static/') || url.pathname.startsWith('/assets/');
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // L'API est sur un autre domaine : on ne s'en mêle pas.
  if (url.origin !== self.location.origin) return;

  // Page : réseau d'abord, la dernière version connue si l'on est hors ligne.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put('/', copy));
          return response;
        })
        .catch(() => caches.match('/')),
    );
    return;
  }

  // Code, polices et images de l'application : le cache d'abord.
  if (isImmutable(url)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
  }
});

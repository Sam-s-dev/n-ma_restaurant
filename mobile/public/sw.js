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

const CACHE = 'nma-shell-v3';
const MEDIA_CACHE = 'nma-media-v1';
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
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE && key !== MEDIA_CACHE).map((key) => caches.delete(key))),
      )
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

  // Photos des plats et logo : une image ne change jamais sous le même
  // identifiant. Gardées, elles s'affichent aussi pendant une coupure.
  if (url.pathname.startsWith('/api/media/')) {
    event.respondWith(
      caches.open(MEDIA_CACHE).then((cache) =>
        cache.match(request).then(
          (cached) =>
            cached ||
            fetch(request).then((response) => {
              if (response.ok || response.type === 'opaque') cache.put(request, response.clone());
              return response;
            }),
        ),
      ),
    );
    return;
  }

  // Le reste de l'API est sur un autre domaine : on ne s'en mêle pas.
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

/*
 * Notifications sur le téléphone, application fermée.
 *
 * Le serveur envoie un titre, un texte et la page à ouvrir. Toucher le
 * message ramène l'application au premier plan sur cette page, ou l'ouvre.
 */
self.addEventListener('push', (event) => {
  let message = { title: 'N’ma Restaurant', body: '', url: '/', tag: undefined };
  try {
    message = { ...message, ...event.data.json() };
  } catch {
    if (event.data) message.body = event.data.text();
  }
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      // L'application est à l'écran : elle annonce déjà la notification avec
      // son propre son. Inutile de la doubler — sauf sur iPhone, où Apple
      // coupe l'abonnement d'un site qui reçoit un message sans l'afficher.
      const iphone = /iPhone|iPad|iPod/.test(self.navigator.userAgent);
      const onScreen = windows.some((client) => client.visibilityState === 'visible' && client.focused);
      if (onScreen && !iphone) return undefined;
      return self.registration.showNotification(message.title, {
        body: message.body,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: message.tag,
        renotify: Boolean(message.tag),
        data: { url: message.url },
        vibrate: [120, 60, 120],
      });
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/', self.location.origin);

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((client) => new URL(client.url).origin === self.location.origin);
      if (open) {
        // L'application est déjà ouverte : elle change d'écran sans se recharger.
        open.postMessage({ type: 'nma:navigate', url: target.pathname + target.search });
        return open.focus();
      }
      return self.clients.openWindow(target.href);
    }),
  );
});

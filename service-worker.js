// VisaFlow service worker: offline-first. The app shell is precached; other GET requests are cached as they are used.
// Bump VERSION whenever a file changes so installed copies update.
const VERSION = 'visaflow-v2.0.0';
const CACHE = `${VERSION}`;
const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/app.css',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './icons/favicon-32.png',
  './icons/apple-touch-icon.png',
  './js/app.js',
  './js/config.js',
  './js/core/utils.js',
  './js/core/ui.js',
  './js/core/constants.js',
  './js/core/print.js',
  './js/db/idb.js',
  './js/services/auth.js',
  './js/services/catalog-seed.js',
  './js/services/data.js',
  './js/services/backup.js',
  './js/modules/forms.js',
  './js/modules/dashboard.js',
  './js/modules/cases.js',
  './js/modules/clients.js',
  './js/modules/documents.js',
  './js/modules/calendar.js',
  './js/modules/money.js',
  './js/modules/partners.js',
  './js/modules/reports.js',
  './js/modules/catalog.js',
  './js/modules/settings.js',
];
const ICONS_CDN = 'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Remove caches from older versions of this app only.
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('visaflow-') && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  if (!sameOrigin && !url.href.startsWith(ICONS_CDN.split('/font/')[0])) return;

  // Pages and app files: network first, so updates arrive; fall back to the cache when offline.
  if (sameOrigin) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        const res = await fetch(req, { cache: 'no-cache' });
        if (res.ok) cache.put(req, res.clone());
        return res;
      } catch {
        const cached = await cache.match(req, { ignoreSearch: true });
        if (cached) return cached;
        if (req.mode === 'navigate') return cache.match('./index.html');
        return Response.error();
      }
    })());
    return;
  }

  // Icon font and CSS from the CDN: cache first.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req);
    if (cached) return cached;
    try {
      const res = await fetch(req);
      if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
      return res;
    } catch {
      return Response.error();
    }
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

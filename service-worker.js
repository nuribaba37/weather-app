const CACHE_PREFIX = 'weather-app-';
const CACHE_VERSION = `${CACHE_PREFIX}v15-verified-location`;
const APP_SHELL = [
  './',
  './index.html',
  './style.css?v=20260825-1',
  './app.js?v=20260825-1',
  './manifest.webmanifest',
  './favicon.svg',
  './docs/preview.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './data/il-ilce-with-loc.json',
  './js/api.js',
  './js/chart.js',
  './js/i18n.js',
  './js/search.js',
  './js/storage.js',
  './js/theme-init.js?v=20260825-1',
  './js/utils.js',
  './js/weather-codes.js',
  './js/weather-alerts.js',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_VERSION).then(cache => cache.addAll(APP_SHELL)));
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_VERSION)
          .map(key => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(event.request).then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then(cache => cache.put(event.request, copy));
        }
        return response;
      }).catch(async () => {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        if (event.request.mode === 'navigate') return caches.match('./index.html');
        return new Response('', { status: 504, statusText: 'Offline' });
      }),
    );
  }
});

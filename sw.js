const CACHE_NAME = 'maison-pique-v6';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css?v=1.3.0',
  './lumen.css?v=1.3.0',
  './manifest.webmanifest?v=1.3.0',
  './manifest-lumen.webmanifest?v=1.3.0',
  './js/app.js?v=1.3.0',
  './js/engine.js?v=1.3.0',
  './audio/hakimi/click-01.mp3?v=1.3.0',
  './audio/hakimi/click-02.mp3?v=1.3.0',
  './audio/hakimi/click-03.mp3?v=1.3.0',
  './audio/hakimi/click-04.mp3?v=1.3.0',
  './audio/hakimi/click-05.mp3?v=1.3.0',
  './audio/hakimi/click-06.mp3?v=1.3.0',
  './audio/hakimi/drop-01.mp3?v=1.3.0',
  './audio/hakimi/drop-02.mp3?v=1.3.0',
  './audio/hakimi/drop-03.mp3?v=1.3.0',
  './audio/hakimi/drop-04.mp3?v=1.3.0',
  './audio/hakimi/drop-05.mp3?v=1.3.0',
  './assets/favicon.svg',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/apple-touch-icon.png',
  './fonts/cormorant-garamond-400.woff2',
  './fonts/cormorant-garamond-500.woff2',
  './fonts/cormorant-garamond-600.woff2',
  './fonts/cormorant-garamond-500-italic.woff2',
  './fonts/jost-300.woff2',
  './fonts/jost-400.woff2',
  './fonts/jost-500.woff2',
  './fonts/maison-serif-sc.woff2?v=1.3.0',
  './fonts/maison-serif-sc-extra.woff2?v=1.3.0',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(request, request.mode === 'navigate' ? { cache: 'no-cache' } : undefined)
      .then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        if (request.mode === 'navigate') {
          const shell = await caches.match('./index.html');
          if (shell) return shell;
        }
        return new Response('Offline', { status: 503, statusText: 'Offline' });
      }),
  );
});

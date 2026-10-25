const CACHE_NAME = 'maison-pique-v9';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css?v=1.5.1',
  './lumen.css?v=1.5.1',
  './manifest.webmanifest?v=1.5.1',
  './manifest-lumen.webmanifest?v=1.5.1',
  './js/app.js?v=1.5.1',
  './js/engine.js?v=1.5.1',
  './audio/hakimi/phrase-01.mp3?v=1.5.1',
  './audio/hakimi/phrase-02.mp3?v=1.5.1',
  './audio/hakimi/phrase-03.mp3?v=1.5.1',
  './audio/hakimi/phrase-04.mp3?v=1.5.1',
  './audio/hakimi/phrase-05.mp3?v=1.5.1',
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
  './fonts/maison-serif-sc.woff2?v=1.5.1',
  './fonts/maison-serif-sc-extra.woff2?v=1.5.1',
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

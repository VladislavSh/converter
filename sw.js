const VERSION = 'flux-v4';
const SHELL = [
  './',
  'index.html',
  'css/style.css',
  'js/currencies.js',
  'js/app.js',
  'icons/icon.svg',
  'icons/maskable.svg',
  'manifest.webmanifest'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Rate APIs: always network (the app caches rates itself)
  if (/exchangerate\.fun|er-api\.com|coingecko\.com/.test(url.host)) return;

  // Flags & fonts: stale-while-revalidate
  if (/flagcdn\.com|fonts\.(googleapis|gstatic)\.com/.test(url.host)) {
    e.respondWith(
      caches.open(VERSION + '-rt').then(async cache => {
        const hit = await cache.match(req);
        const net = fetch(req).then(res => { if (res.ok || res.type === 'opaque') cache.put(req, res.clone()); return res; }).catch(() => hit);
        return hit || net;
      })
    );
    return;
  }

  // App shell: network first, fall back to cache (so updates arrive quickly)
  if (url.origin === location.origin) {
    e.respondWith(
      fetch(req)
        .then(res => { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); return res; })
        .catch(() => caches.match(req).then(r => r || caches.match('index.html')))
    );
  }
});

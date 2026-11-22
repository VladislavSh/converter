// Offline support. Only same-origin files are cached; the rate APIs always go
// to the network (the app keeps the last rates itself). No third-party hosts.
const VERSION = 'flux-1.5.0'; // keep in sync with APP_VERSION in js/app.js
const SHELL = [
  './',
  'index.html',
  'css/style.css',
  'js/theme-init.js',
  'js/currencies.js',
  'js/app.js',
  'fonts/manrope-latin-wght-normal.woff2',
  'fonts/manrope-cyrillic-wght-normal.woff2',
  'icons/icon.svg',
  'icons/maskable.svg',
  'manifest.webmanifest'
];

self.addEventListener('install', e => {
  // fetch the shell fresh (not from the HTTP cache) so a new version never installs stale files
  e.waitUntil(
    caches.open(VERSION)
      .then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== VERSION + '-flags').map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const putOk = (cacheName, req, res) => {
  if (res && res.ok && res.type === 'basic') {
    const copy = res.clone();
    caches.open(cacheName).then(c => c.put(req, copy));
  }
  return res;
};

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // rate APIs etc. — straight to network

  // Flags never change: cache first
  if (url.pathname.includes('/icons/flags/')) {
    e.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => putOk(VERSION + '-flags', req, res)))
    );
    return;
  }

  // App shell: network first so updates arrive quickly, cache when offline.
  // cache: 'no-cache' revalidates with the server instead of trusting the
  // browser's HTTP cache (GitHub Pages lets it keep files for 10 minutes).
  e.respondWith(
    fetch(req, { cache: 'no-cache' })
      .then(res => putOk(VERSION, req, res))
      .catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('index.html')))
  );
});

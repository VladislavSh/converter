// Offline support. Only same-origin files are cached; the rate APIs always go
// to the network (the app keeps the last rates itself). No third-party hosts.
const VERSION = 'flux-1.6.0'; // keep in sync with APP_VERSION in js/config.js
const FLAGS = 'flux-flags'; // flag images never change, so this cache survives releases
const SHELL = [
  './',
  'index.html',
  'css/style.css',
  'js/config.js',
  'js/core/currency-list.js',
  'js/core/expression.js',
  'js/core/format.js',
  'js/core/names.js',
  'js/core/pasted-amount.js',
  'js/core/purchase.js',
  'js/core/rates.js',
  'js/core/state.js',
  'js/data/currencies.js',
  'js/i18n.js',
  'js/main.js',
  'js/services/rates-api.js',
  'js/services/storage.js',
  'js/services/sw-update.js',
  'js/theme-init.js',
  'js/ui/badge.js',
  'js/ui/converter.js',
  'js/ui/dom.js',
  'js/ui/picker.js',
  'js/ui/purchase.js',
  'js/ui/shell.js',
  'fonts/manrope-latin-wght-normal.woff2',
  'fonts/manrope-cyrillic-wght-normal.woff2',
  'icons/icon.svg',
  'icons/maskable.svg',
  'icons/flags/us.svg',
  'icons/flags/cn.svg',
  'icons/flags/uz.svg',
  'icons/flags/ru.svg',
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
      // Cache Storage is shared by every site on this origin (all GitHub Pages
      // projects of one account), so only this app's own old caches are removed.
      .then(keys => Promise.all(keys
        .filter(key => key.startsWith('flux-') && key !== VERSION && key !== FLAGS)
        .map(key => caches.delete(key))))
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

  // Flags: cache first
  if (url.pathname.includes('/icons/flags/')) {
    e.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => putOk(FLAGS, req, res)))
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

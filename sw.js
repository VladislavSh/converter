// Offline support. Only same-origin files are cached; the rate APIs always go
// to the network (the app keeps the last rates itself). No third-party hosts.
const PREFIX = 'cartrate-';
const VERSION = `${PREFIX}1.27.0`; // keep in sync with APP_VERSION in js/config.js
const FLAGS = `${PREFIX}flags`; // flag images never change, so this cache survives releases
const SHELL = [
  './',
  'index.html',
  'css/style.css',
  'js/boot-guard.js',
  'js/config.js',
  'js/core/bank-rates.js',
  'js/core/currency-list.js',
  'js/core/deep-link.js',
  'js/core/expression.js',
  'js/core/format.js',
  'js/core/keypad.js',
  'js/core/install.js',
  'js/core/names.js',
  'js/core/pasted-amount.js',
  'js/core/purchase.js',
  'js/core/rate-sources.js',
  'js/core/rates.js',
  'js/core/share-text.js',
  'js/core/state.js',
  'js/core/swipe.js',
  'js/core/gestures.js',
  'js/data/currencies.js',
  'js/i18n.js',
  'js/install-early.js',
  'js/main.js',
  'js/services/bank-rates-api.js',
  'js/services/rates-api.js',
  'js/services/storage.js',
  'js/services/sw-update.js',
  'js/services/url-sync.js',
  'js/theme-init.js',
  'js/ui/badge.js',
  'js/ui/clipboard-hint.js',
  'js/ui/pull-refresh.js',
  'js/ui/banks.js',
  'js/ui/converter.js',
  'js/ui/dom.js',
  'js/ui/keypad.js',
  'js/ui/picker.js',
  'js/ui/purchase.js',
  'js/ui/rates.js',
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

self.addEventListener('install', event => {
  // Fetch the shell fresh (not from the HTTP cache) so a new version never installs stale files
  event.waitUntil(
    caches.open(VERSION)
      .then(cache => cache.addAll(SHELL.map(url => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

/**
 * A cache left by a release that used other cache names: every entry in it is
 * a file of this app. Cache Storage is shared by all sites on the origin (all
 * GitHub Pages projects of one account), so other sites' caches never match.
 */
const isOwnLeftover = async name => {
  const requests = await (await caches.open(name)).keys();
  return requests.length > 0 && requests.every(request => request.url.startsWith(self.registration.scope));
};

const removeOldCaches = async () => {
  for (const name of await caches.keys()) {
    if (name === VERSION || name === FLAGS) continue;
    if (name.startsWith(PREFIX) || await isOwnLeftover(name)) await caches.delete(name);
  }
};

self.addEventListener('activate', event => {
  event.waitUntil(removeOldCaches().then(() => self.clients.claim()));
});

// Keeps a copy of a good same-origin response and passes the response on
const remember = (cacheName, key, response) => {
  if (response && response.ok && response.type === 'basic') {
    const copy = response.clone();
    caches.open(cacheName).then(cache => cache.put(key, copy));
  }
  return response;
};

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== location.origin) return; // rate APIs: straight to the network

  // The page itself. Links to calculations differ only in the query
  // (?mode=…&amount=…), so every one of them is the same cached page.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request, { cache: 'no-cache' })
        .then(response => remember(VERSION, './', response))
        .catch(() => caches.match('./').then(hit => hit || caches.match('index.html')))
    );
    return;
  }

  // Flags: cache first
  if (url.pathname.includes('/icons/flags/')) {
    event.respondWith(
      caches.match(request).then(hit => hit || fetch(request).then(response => remember(FLAGS, request, response)))
    );
    return;
  }

  // Scripts, styles, fonts: network first so updates arrive quickly, the cache
  // when offline. 'no-cache' revalidates with the server instead of trusting
  // the browser's HTTP cache (GitHub Pages lets it keep files for 10 minutes).
  event.respondWith(
    fetch(request, { cache: 'no-cache' })
      .then(response => remember(VERSION, request, response))
      .catch(() => caches.match(request, { ignoreSearch: true }))
  );
});

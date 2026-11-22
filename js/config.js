// App-wide constants. APP_VERSION must match VERSION in sw.js and the ?v=
// query in index.html (tests/project.test.js checks this).
export const APP_NAME = 'CartRate';
export const APP_VERSION = '1.10.0';

export const STORAGE_KEYS = Object.freeze({
  state: 'cartrate_state',
  rates: 'cartrate_rates',
  updatedFlag: 'cartrate_updated',
  retryFlag: 'cartrate_retry' // sessionStorage; also written by js/boot-guard.js
});

// The only hosts the app talks to (see the Content-Security-Policy in index.html)
export const RATE_SOURCES = Object.freeze({
  fiatPrimary: { name: 'exchangerate.fun', url: 'https://api.exchangerate.fun/latest?base=USD' },
  fiatFallback: { name: 'open.er-api.com', url: 'https://open.er-api.com/v6/latest/USD' },
  crypto: {
    name: 'CoinGecko',
    url: ids => `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`
  }
});

export const TIMING = Object.freeze({
  fetchTimeoutMs: 8000,
  ratesStaleMs: 10 * 60e3,
  ratesPollMs: 15 * 60e3,
  updatePollMs: 30 * 60e3,
  splashMinMs: 1400,
  splashMaxMs: 7000,
  splashMaxCachedMs: 1800,
  toastMs: 2200,
  urlSyncMs: 300
});

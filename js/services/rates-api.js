// Network access for the market rates. These three public APIs and the two
// banks (services/bank-rates-api.js) are the only hosts the app ever contacts;
// responses are validated in core/rates.js and core/bank-rates.js.
import { RATE_SOURCES, TIMING } from '../config.js';
import { CRYPTO } from '../data/currencies.js';
import { cleanRates, cryptoRatesFromPrices, mergeRates } from '../core/rates.js';

export async function fetchJson(url, timeoutMs = TIMING.fetchTimeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, cache: 'no-store', credentials: 'omit' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchFiat() {
  for (const source of [RATE_SOURCES.fiatPrimary, RATE_SOURCES.fiatFallback]) {
    try {
      const rates = cleanRates((await fetchJson(source.url))?.rates);
      if (rates.EUR) return { rates, source: source.name };
    } catch { /* try the next source */ }
  }
  throw new Error('No fiat rates available');
}

async function fetchCrypto() {
  const payload = await fetchJson(RATE_SOURCES.crypto.url(CRYPTO.map(c => c.id).join(',')));
  const rates = cryptoRatesFromPrices(payload, CRYPTO);
  if (!Object.keys(rates).length) throw new Error('No crypto rates available');
  return rates;
}

/**
 * @param {{rates: object, ts: number, source: string}|null} previous
 * @returns {Promise<{snapshot: object|null, fresh: boolean}>} `fresh` is true
 *   only when the fiat rates were updated; `snapshot` is null when nothing new arrived.
 */
export async function loadLatestRates(previous) {
  const [fiat, crypto] = await Promise.allSettled([fetchFiat(), fetchCrypto()]);
  const cryptoRates = crypto.status === 'fulfilled' ? crypto.value : null;

  if (fiat.status === 'fulfilled') {
    const rates = mergeRates(fiat.value.rates, cryptoRates, previous?.rates, CRYPTO.map(c => c.code));
    return { snapshot: { rates, ts: Date.now(), source: fiat.value.source }, fresh: true };
  }
  if (cryptoRates && previous) {
    return { snapshot: { ...previous, rates: { ...previous.rates, ...cryptoRates } }, fresh: false };
  }
  return { snapshot: null, fresh: false };
}

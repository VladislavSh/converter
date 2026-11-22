// Exchange-rate tables: { CODE: units of that currency per 1 USD }.
// Everything that comes from the network or from storage passes through
// cleanRates() before it can reach the rest of the app.

const CODE_RE = /^[A-Z]{3,5}$/;

export const isCurrencyCode = code => typeof code === 'string' && CODE_RE.test(code);

const isRate = value => typeof value === 'number' && Number.isFinite(value) && value > 0;

/** Keeps only `CODE: positive number` pairs. */
export function cleanRates(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [code, value] of Object.entries(raw)) {
    if (isCurrencyCode(code) && isRate(value)) out[code] = value;
  }
  return out;
}

/** @returns {number|null} null when either currency is missing from the table */
export function convert(table, value, from, to) {
  if (!table || !Number.isFinite(value)) return null;
  const fromRate = table[from];
  const toRate = table[to];
  if (!isRate(fromRate) || !isRate(toRate)) return null;
  return value / fromRate * toRate;
}

/**
 * CoinGecko answers { coinId: { usd: price } }; we need units per 1 USD.
 * @param {{code: string, id: string}[]} coins
 */
export function cryptoRatesFromPrices(payload, coins) {
  const out = {};
  if (!payload || typeof payload !== 'object') return out;
  for (const { code, id } of coins) {
    const price = payload[id]?.usd;
    if (isRate(price)) out[code] = 1 / price;
  }
  return out;
}

/**
 * Builds a fresh table from a fiat response. When the crypto request failed,
 * the previous crypto rates are kept rather than dropped.
 */
export function mergeRates(fiat, crypto, previous, cryptoCodes = []) {
  const merged = { ...cleanRates(fiat), USD: 1 };
  if (crypto) {
    Object.assign(merged, cleanRates(crypto));
  } else if (previous) {
    for (const code of cryptoCodes) {
      if (!merged[code] && isRate(previous[code])) merged[code] = previous[code];
    }
  }
  return merged;
}

/** Validates a snapshot read from storage; returns a clean copy or null. */
export function restoreSnapshot(raw) {
  if (!raw || typeof raw !== 'object' || !Number.isFinite(raw.ts)) return null;
  const rates = cleanRates(raw.rates);
  if (!rates.USD) return null;
  return { rates, ts: raw.ts, source: typeof raw.source === 'string' ? raw.source.slice(0, 40) : '' };
}

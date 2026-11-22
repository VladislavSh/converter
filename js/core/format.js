// Number formatting. Intl.NumberFormat objects are cached: building one is
// far more expensive than using it, and the UI formats on every keystroke.
import { isCrypto } from '../data/currencies.js';

const formatters = new Map();

function formatter(locale, options) {
  const key = `${locale}|${JSON.stringify(options)}`;
  let fmt = formatters.get(key);
  if (!fmt) {
    fmt = new Intl.NumberFormat(locale, options);
    formatters.set(key, fmt);
  }
  return fmt;
}

function amountOptions(abs, code) {
  if (abs === 0) return { maximumFractionDigits: 0 };
  if (abs >= 1) return { maximumFractionDigits: isCrypto(code) ? (abs >= 1000 ? 2 : 6) : 2 };
  return { maximumSignificantDigits: isCrypto(code) ? 6 : 4 };
}

/**
 * Converter amounts: 2 decimals for fiat, more precision for crypto and for
 * values below 1. `plain` gives a machine-readable number (no grouping, dot).
 */
export function formatAmount(value, code, { locale = 'ru-RU', plain = false } = {}) {
  if (value == null || !Number.isFinite(value)) return '';
  const options = amountOptions(Math.abs(value), code);
  return plain
    ? formatter('en-US', { ...options, useGrouping: false }).format(value)
    : formatter(locale, options).format(value);
}

/** A number as text for an input field: no grouping, no exponent, up to 8 decimals. */
export function plainNumber(value) {
  if (value == null || !Number.isFinite(value)) return '';
  return value.toFixed(8).replace(/\.?0+$/, '');
}

/** Money in the purchase calculator: always 2 decimals, whole numbers for UZS. */
export function formatMoney(value, code, locale = 'ru-RU') {
  if (value == null || !Number.isFinite(value)) return '';
  const digits = code === 'UZS' ? 0 : 2;
  return formatter(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}

/** A plain number with at most `maxFraction` decimals (weights, yuan thresholds). */
export function formatNumber(value, locale = 'ru-RU', maxFraction = 2) {
  if (value == null || !Number.isFinite(value)) return '';
  return formatter(locale, { maximumFractionDigits: maxFraction }).format(value);
}

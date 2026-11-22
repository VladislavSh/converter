// Human-readable currency names, symbols and flags.
import { CRYPTO_BY_CODE, FIAT_EXTRA, FIAT_NAMES, FLAG_OVERRIDE, ISO_FIAT, isCrypto } from '../data/currencies.js';

/**
 * ISO country code of the currency's flag ("us" for USD), or '' when there is
 * none: crypto and supranational codes such as XAU.
 */
export function flagCountry(code) {
  if (isCrypto(code)) return '';
  const country = FLAG_OVERRIDE[code] ?? (code.startsWith('X') ? '' : code.slice(0, 2).toLowerCase());
  return /^[a-z]{2}$/.test(country) ? country : '';
}

/** A currency the app knows: listed crypto or a fiat currency. */
export const isKnownCurrency = code => isCrypto(code) || isKnownFiat(code);

const displayNamesCache = new Map();

function displayNames(lang) {
  if (!displayNamesCache.has(lang)) {
    let names = null;
    try { names = new Intl.DisplayNames([lang], { type: 'currency' }); } catch { /* old browser */ }
    displayNamesCache.set(lang, names);
  }
  return displayNamesCache.get(lang);
}

/** The name from the browser's Intl data, or null when it has none (it then returns the code). */
function intlName(code, lang) {
  try {
    const name = displayNames(lang)?.of(code);
    return name && name !== code ? name : null;
  } catch {
    return null;
  }
}

const capitalize = text => (text ? text.charAt(0).toUpperCase() + text.slice(1) : text);

export function currencyName(code, lang = 'ru') {
  if (isCrypto(code)) {
    const { name } = CRYPTO_BY_CODE[code];
    return name[lang] || name.en;
  }
  if (Object.hasOwn(FIAT_EXTRA, code)) return FIAT_EXTRA[code][lang] || FIAT_EXTRA[code].en;
  const name = intlName(code, lang);
  if (name) return capitalize(name);
  if (Object.hasOwn(FIAT_NAMES, code)) return FIAT_NAMES[code][lang] || FIAT_NAMES[code].en;
  return code;
}

/**
 * A fiat currency. Filters crypto and junk codes out of API responses. The ISO
 * list decides first, so the answer is the same on every phone; Intl adds the
 * few codes the rate APIs have beyond it.
 */
export function isKnownFiat(code) {
  if (typeof code !== 'string' || isCrypto(code)) return false;
  return ISO_FIAT.has(code) || Object.hasOwn(FIAT_EXTRA, code) || intlName(code, 'en') != null;
}

/** Short symbol for the badge when there is no flag: "$", "₽", or two letters. */
export function currencySymbol(code) {
  try {
    const part = new Intl.NumberFormat('en', { style: 'currency', currency: code, currencyDisplay: 'narrowSymbol' })
      .formatToParts(0)
      .find(p => p.type === 'currency');
    if (part && part.value !== code && part.value.length <= 3) return part.value;
  } catch { /* not an ISO currency */ }
  return code.slice(0, 2);
}

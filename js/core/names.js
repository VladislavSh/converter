// Human-readable currency names, symbols and flags.
import { CRYPTO_BY_CODE, FIAT_EXTRA, FLAG_OVERRIDE, isCrypto } from '../data/currencies.js';

/**
 * ISO country code of the currency's flag ("us" for USD), or '' when there is
 * none: crypto and supranational codes such as XAU.
 */
export function flagCountry(code) {
  if (isCrypto(code)) return '';
  const country = FLAG_OVERRIDE[code] ?? (code.startsWith('X') ? '' : code.slice(0, 2).toLowerCase());
  return /^[a-z]{2}$/.test(country) ? country : '';
}

/** A currency the app can name: listed crypto or a fiat code Intl knows. */
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

function intlName(code, lang) {
  try { return displayNames(lang)?.of(code) ?? code; } catch { return code; }
}

const capitalize = text => (text ? text.charAt(0).toUpperCase() + text.slice(1) : text);

export function currencyName(code, lang = 'ru') {
  if (isCrypto(code)) {
    const { name } = CRYPTO_BY_CODE[code];
    return name[lang] || name.en;
  }
  if (Object.hasOwn(FIAT_EXTRA, code)) return FIAT_EXTRA[code][lang] || FIAT_EXTRA[code].en;
  return capitalize(intlName(code, lang));
}

/** A fiat currency we can name. Filters crypto and junk codes out of API responses. */
export function isKnownFiat(code) {
  if (isCrypto(code)) return false;
  if (Object.hasOwn(FIAT_EXTRA, code)) return true;
  return intlName(code, 'en') !== code;
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

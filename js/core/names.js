// Human-readable currency names and symbols.
import { CRYPTO_BY_CODE, FIAT_EXTRA, isCrypto } from '../data/currencies.js';

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

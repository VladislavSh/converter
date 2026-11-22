// Reads an amount out of text copied from a shop page or a chat:
// "¥1,299.00", "45,5 ¥", "12 990 сум", "US $5.99", "券后 ¥23.8 起".
// Pure functions — the clipboard itself is handled in the UI.
import { evaluate } from './expression.js';
import { plainNumber } from './format.js';
import { isCurrencyCode } from './rates.js';
import { PRICE_CURRENCIES } from './state.js';

const MAX_TEXT = 300;
const MAX_VALUE = 1e15;

// A word or code is matched only on its own: "сумма" is not "сум", "рубеж" is
// not "руб", "USDT" is not "USD". Digits may touch it: "5.99USD", "1500р".
const L = '(?<![a-zа-яё])';
const R = '(?![a-zа-яё])';
const marker = source => new RegExp(source.replaceAll('{L}', L).replaceAll('{R}', R), 'iu');

// Checked in order, so the specific dollars come before the bare "$" and
// Belarusian roubles before roubles. A bare "¥" is read as yuan: this app is
// used with Chinese marketplaces.
const MARKERS = [
  [marker('{L}hk\\s?\\$|{L}hkd{R}'), 'HKD'],
  [marker('{L}au?\\s?\\$|{L}aud{R}'), 'AUD'],
  [marker('{L}ca?\\s?\\$|{L}cad{R}'), 'CAD'],
  [marker('{L}s\\s?\\$|{L}sgd{R}'), 'SGD'],
  [marker('{L}бел(?:орусск[а-яё]*)?\\.?\\s*руб|{L}byn{R}'), 'BYN'],
  [marker('[¥元圆块]|{L}(?:cny|rmb|cnh|yuan|renminbi){R}|{L}юан|{L}жэньминьби'), 'CNY'],
  [marker('\\$|{L}usd{R}|{L}долл|{L}бакс|{L}dollars?{R}'), 'USD'],
  [marker('{L}uzs{R}|{L}сум(?:ов|ах|ам|а|ы)?{R}|{L}сўм|{L}so[\'’ʻ‘`]?m{R}'), 'UZS'],
  [marker('{L}tjs{R}|{L}сомони'), 'TJS'],
  [marker('{L}kgs{R}|{L}сом(?:ов|а|ы)?{R}'), 'KGS'],
  [marker('₽|{L}(?:rub|rur|rubles?|roubles?){R}|{L}руб(?:л(?:ь|я|ей|ям|ями|ях))?\\.?{R}|(?<=\\d\\s?)р\\.?{R}'), 'RUB'],
  [marker('€|{L}eur{R}|{L}евро{R}|{L}euros?{R}'), 'EUR'],
  [marker('₸|{L}kzt{R}|{L}тенге{R}|{L}тг\\.?{R}'), 'KZT'],
  [marker('£|{L}gbp{R}|{L}фунт'), 'GBP'],
  [marker('円|{L}jpy{R}|{L}[ий]ен[аыу]?{R}'), 'JPY'],
  [marker('₺|{L}лир[аыу]?{R}'), 'TRY'],
  [marker('₩|{L}krw{R}|{L}вон[аыу]?{R}'), 'KRW'],
  [marker('₹|{L}inr{R}|{L}рупи'), 'INR'],
  [marker('₴|{L}uah{R}|{L}грн\\.?{R}|{L}гривн'), 'UAH'],
  [marker('₾|{L}gel{R}|{L}лари{R}'), 'GEL'],
  [marker('֏|{L}amd{R}|{L}драм'), 'AMD'],
  [marker('₼|{L}azn{R}|{L}манат'), 'AZN'],
  [marker('{L}aed{R}|{L}дирхам'), 'AED'],
  [marker('฿|{L}thb{R}|{L}бат(?:ов|а)?{R}'), 'THB'],
  [marker('₫|{L}vnd{R}|{L}донг'), 'VND'],
  [marker('zł|{L}pln{R}|{L}злот'), 'PLN'],
  [marker('{L}chf{R}|{L}франк'), 'CHF']
];
const MARKER_CODES = new Set(MARKERS.map(([, code]) => code));

// "15 тыс.", "1,2 млн", "120 ming", "15к" / "15k", "1.2万": the number is multiplied.
// "15 кг" is not "15 thousand": the letter after "к" is checked.
const MULTIPLIERS = [
  [/^\s?(?:тыс(?:яч[аи]?)?\.?|ming|[kк](?![a-zа-яё])|千)/iu, 1e3],
  [/^\s?万/u, 1e4],
  [/^\s?(?:млн\.?|миллион(?:а|ов)?|mln|million|mio)(?![a-zа-яё])/iu, 1e6],
  [/^\s?(?:млрд\.?|миллиард(?:а|ов)?|bln|billion)(?![a-zа-яё])/iu, 1e9]
];

// Either thousands grouped by spaces/apostrophes ("12 990,50"), or digits with dots and commas
const NUMBER = /\d{1,3}(?:[ \u00A0\u202F'’]\d{3})+(?!\d)(?:[.,]\d+)?|\d+(?:[.,]\d+)*/g;

/**
 * Text as copied → text as parsed: full-width digits and signs (１２９９, ￥),
 * every kind of space (no-break, thin) is made ordinary, invisible ones go.
 */
export function normalizePasted(text) {
  return String(text ?? '').slice(0, MAX_TEXT * 2).normalize('NFKC')
    .replace(/[\u00A0\u2007\u2009\u200A\u202F\u205F\u3000]/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .slice(0, MAX_TEXT);
}

/**
 * Turns one number token into a value, working out which separator is the
 * decimal one. @returns {number|null}
 */
export function parseNumberToken(token) {
  let digits = String(token).replace(/[ \u00A0\u202F'’]/g, '');
  const dots = digits.split('.').length - 1;
  const commas = digits.split(',').length - 1;

  if (dots && commas) {
    // Both present: the last one is the decimal separator ("1,299.00", "1.299,00")
    const decimal = digits.lastIndexOf('.') > digits.lastIndexOf(',') ? '.' : ',';
    if ((decimal === '.' ? dots : commas) > 1) return null;
    digits = digits.split(decimal === '.' ? ',' : '.').join('').replace(decimal, '.');
  } else if (dots + commas > 1) {
    // One kind, repeated: thousands groups ("1,299,000"); anything else is not a number
    const groups = digits.split(dots ? '.' : ',');
    if (!groups.slice(1).every(group => group.length === 3)) return null;
    digits = groups.join('');
  } else if (dots + commas === 1) {
    // A single separator is ambiguous. Exactly three digits after 1–3 leading
    // ones ("1,299", "12.500") is a thousands group — prices do not have three
    // decimals; "0,125" and everything else is a decimal fraction.
    const [whole, fraction] = digits.split(dots ? '.' : ',');
    const thousands = fraction.length === 3 && whole.length <= 3 && whole !== '0' && token === digits;
    digits = thousands ? whole + fraction : `${whole}.${fraction}`;
  }

  const value = Number(digits);
  return Number.isFinite(value) && value >= 0 && value < MAX_VALUE ? value : null;
}

function findCurrency(text, isKnown) {
  // An explicit ISO code wins ("KZT 5 000", "5.99USD"), as long as the app knows the currency
  for (const match of text.matchAll(/(?<![A-Za-z])[A-Z]{3,5}(?![A-Za-z])/g)) {
    if (isCurrencyCode(match[0]) && isKnown(match[0])) return { code: match[0], index: match.index };
  }
  for (const [pattern, code] of MARKERS) {
    const match = pattern.exec(text);
    if (match) return { code, index: match.index };
  }
  return null;
}

/** "15 тыс." after a number: by how much it is multiplied (1 when not). */
function multiplierAfter(text, end) {
  const rest = text.slice(end, end + 16);
  for (const [pattern, factor] of MULTIPLIERS) if (pattern.test(rest)) return factor;
  return 1;
}

/**
 * @param {string} text  clipboard contents
 * @param {(code: string) => boolean} [isKnown]  whether the app has this currency
 * @returns {{value: number, currency: string|null}|null} null when there is no amount
 */
export function parsePastedAmount(text, isKnown = code => MARKER_CODES.has(code)) {
  const source = normalizePasted(text);
  const numbers = [...source.matchAll(NUMBER)]
    .map(match => ({ value: parseNumberToken(match[0]), start: match.index, end: match.index + match[0].length }))
    .filter(number => number.value != null);
  if (!numbers.length) return null;

  const currency = findCurrency(source, isKnown);
  let chosen = numbers[0];
  if (currency) {
    // Several numbers ("2 шт × ¥45.50"): the amount is the one next to the currency
    const distance = number => Math.min(Math.abs(number.start - currency.index), Math.abs(number.end - currency.index));
    chosen = numbers.reduce((best, number) => (distance(number) < distance(best) ? number : best));
  }
  const value = Math.round(chosen.value * multiplierAfter(source, chosen.end) * 1e8) / 1e8;
  if (!(value < MAX_VALUE)) return null;
  return { value, currency: currency && isKnown(currency.code) ? currency.code : null };
}

/**
 * What the clipboard holds, worth offering to paste: an amount with a
 * currency, or a short text that is only a number. Phone numbers, dates and
 * order numbers are not.
 * @param {string} text  the clipboard
 * @param {(code: string) => boolean} isKnown
 * @returns {{value: number, currency: string|null, excerpt: string}|null}
 */
export function clipboardOffer(text, isKnown) {
  const source = normalizePasted(text).trim();
  if (!source || source.length > 200) return null;
  const pasted = parsePastedAmount(source, isKnown);
  if (!pasted || !(pasted.value > 0)) return null;
  const bareNumber = /^[\d\s.,'’]+$/.test(source) && source.length <= 20;
  if (!pasted.currency && !bareNumber) return null;
  const line = source.split('\n').map(part => part.trim()).find(part => /\d/.test(part)) ?? source;
  return { ...pasted, excerpt: line.length > 32 ? `${line.slice(0, 31)}…` : line };
}

/** A short fingerprint of the clipboard, so that its text itself is never stored. */
export function textFingerprint(text) {
  let hash = 0x811c9dc5;
  for (const ch of normalizePasted(text).trim()) {
    hash ^= ch.codePointAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

/**
 * Converter: the pasted amount replaces the current one. A recognised
 * currency becomes the source and is added to the list if it was not there.
 * @returns {{currency: string, added: boolean}}
 */
export function applyPastedAmount(state, pasted, hasRate) {
  let added = false;
  const { currency } = pasted;
  if (currency && currency !== state.base && hasRate(currency)) {
    if (!state.list.includes(currency)) {
      state.list.push(currency);
      added = true;
    }
    state.base = currency;
  }
  state.input = plainNumber(pasted.value);
  return { currency: state.base, added };
}

/**
 * Purchase: the price field takes yuan, dollars or sum. Those switch the
 * price currency; any other recognised currency is converted into the current
 * one. @returns {{price: string, currency: string, convertedFrom: string|null}}
 */
export function pastedPrice(pasted, shop, convert) {
  const { value, currency } = pasted;
  if (currency && currency !== shop.priceCur) {
    if (PRICE_CURRENCIES.includes(currency)) {
      return { price: plainNumber(value), currency, convertedFrom: null };
    }
    const converted = convert(value, currency, shop.priceCur);
    if (converted != null) {
      return { price: plainNumber(Math.round(converted * 100) / 100), currency: shop.priceCur, convertedFrom: currency };
    }
  }
  return { price: plainNumber(value), currency: shop.priceCur, convertedFrom: null };
}

/**
 * "Purchase" was opened: the amount typed on the main screen becomes the item
 * price. Once per edit — after that the price is the user's own again, and
 * going back and forth between the tabs does not overwrite it.
 * @returns {{value: number, price: string, currency: string, convertedFrom: string|null}|null}
 *   null when there is nothing new to take
 */
export function takeConverterAmount(state, convert) {
  if (!state.amountFresh) return null;
  const value = evaluate(state.input);
  if (!(value > 0)) {
    state.amountFresh = false;
    return null;
  }
  const result = pastedPrice({ value, currency: state.base }, state.shop, convert);
  // No rate yet for a currency the price field does not take: wait for the
  // rates rather than turn "8000 RUB" into "8000 CNY".
  if (result.currency !== state.base && !result.convertedFrom) return null;
  state.amountFresh = false;
  Object.assign(state.shop, { price: result.price, priceCur: result.currency });
  return { value, ...result };
}

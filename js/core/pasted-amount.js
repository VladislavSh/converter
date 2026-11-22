// Reads an amount out of text copied from a shop page or a chat:
// "¥1,299.00", "45,5 ¥", "12 990 сум", "US $5.99", "券后 ¥23.8 起".
// Pure functions — the clipboard itself is handled in the UI.
import { evaluate } from './expression.js';
import { plainNumber } from './format.js';
import { isCurrencyCode } from './rates.js';
import { PRICE_CURRENCIES } from './state.js';

const MAX_TEXT = 300;
const MAX_VALUE = 1e15;

// Checked in order, so the specific dollars come before the bare "$".
// A bare "¥" is read as yuan: this app is used with Chinese marketplaces.
// Russian words are matched without \b (it only knows Latin letters) and so
// that "сумма" (amount) is not taken for "сум", nor "Европа" for "евро".
const MARKERS = [
  [/\bHK\s?\$|\bHKD\b/i, 'HKD'],
  [/\b(?:AU|A)\s?\$|\bAUD\b/i, 'AUD'],
  [/\b(?:CA|C)\s?\$|\bCAD\b/i, 'CAD'],
  [/\bS\s?\$|\bSGD\b/i, 'SGD'],
  [/[¥￥元圆]|\bCNY\b|\bRMB\b|юан|\byuan/i, 'CNY'],
  [/\$|\bUSD\b|долл|\bdollar/i, 'USD'],
  [/\bUZS\b|сум(?:ов|ах|а|ы)?(?![а-яё])|сўм|\bso['’ʻ`]m/i, 'UZS'],
  [/₽|\bRUB\b|\bRUR\b|руб/i, 'RUB'],
  [/€|\bEUR\b|евро(?![а-яё])|\beuro/i, 'EUR'],
  [/₸|\bKZT\b|тенге|(?:^|[^а-яё])тг(?![а-яё])/i, 'KZT'],
  [/£|\bGBP\b/i, 'GBP'],
  [/円|\bJPY\b|(?:^|[^а-яё])иен/i, 'JPY'],
  [/₺|\bTRY\b/i, 'TRY'],
  [/₩|\bKRW\b/i, 'KRW'],
  [/₹|\bINR\b/i, 'INR'],
  [/₴|\bUAH\b|грн/i, 'UAH']
];
const MARKER_CODES = new Set(MARKERS.map(([, code]) => code));

// Either thousands grouped by spaces/apostrophes ("12 990,50"), or digits with dots and commas
const NUMBER = /\d{1,3}(?:[ \u00A0\u202F'’]\d{3})+(?!\d)(?:[.,]\d+)?|\d+(?:[.,]\d+)*/g;

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
  // An explicit ISO code wins ("KZT 5 000"), as long as the app knows the currency
  for (const match of text.matchAll(/\b[A-Z]{3,5}\b/g)) {
    if (isCurrencyCode(match[0]) && isKnown(match[0])) return { code: match[0], index: match.index };
  }
  for (const [pattern, code] of MARKERS) {
    const match = pattern.exec(text);
    if (match) return { code, index: match.index };
  }
  return null;
}

/**
 * @param {string} text  clipboard contents
 * @param {(code: string) => boolean} [isKnown]  whether the app has this currency
 * @returns {{value: number, currency: string|null}|null} null when there is no amount
 */
export function parsePastedAmount(text, isKnown = code => MARKER_CODES.has(code)) {
  const source = String(text ?? '').slice(0, MAX_TEXT);
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
  return { value: chosen.value, currency: currency && isKnown(currency.code) ? currency.code : null };
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

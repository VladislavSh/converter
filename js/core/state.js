// Persistent app state: defaults, validation of whatever is in storage, and
// migrations between versions. buildState() is pure — storage and browser
// details are passed in — so it can be tested in Node.
import { DEFAULT_LIST } from '../data/currencies.js';
import { isCurrencyCode } from './rates.js';
import { parseNumber } from './purchase.js';

export const STATE_VERSION = 7;

export const SHOP_DEFAULTS = Object.freeze({
  price: '', priceCur: 'CNY', card: 'USD',
  svcPct: '3', freeBelow: '200', svcMin: '0', bankPct: '0', bufPct: '2',
  dlOn: false, dlMethod: 'air', dlWeight: '', dlUnit: 'kg',
  dlAir: '10', dlAuto: '6', dlStep: '0.1', dlPayCard: false
});

/** Currencies an item price can be entered in (the options of the price select). */
export const PRICE_CURRENCIES = Object.freeze(['CNY', 'USD', 'UZS']);

const SHOP_ENUMS = {
  priceCur: PRICE_CURRENCIES,
  card: ['USD', 'UZS'],
  dlMethod: ['air', 'auto'],
  dlUnit: ['g', 'kg'],
  dlStep: ['0.1', '0.5', '1', '0']
};
const SHOP_FLAGS = ['dlOn', 'dlPayCard'];
const MAX_TEXT = 60;

// The default list before v7; those two extra entries are dropped on upgrade.
const LEGACY_DEFAULT_LIST = ['USD', 'CNY', 'UZS', 'EUR', 'RUB', 'BTC'];

const isPlainObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const cleanText = (value, fallback) => (typeof value === 'string' ? value.slice(0, MAX_TEXT) : fallback);

function cleanList(raw) {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter(isCurrencyCode))];
}

function cleanShop(raw) {
  const src = isPlainObject(raw) ? raw : {};
  const shop = {};
  for (const [key, fallback] of Object.entries(SHOP_DEFAULTS)) {
    if (SHOP_FLAGS.includes(key)) shop[key] = key in src ? src[key] === true : fallback;
    else if (key in SHOP_ENUMS) shop[key] = SHOP_ENUMS[key].includes(src[key]) ? src[key] : fallback;
    else shop[key] = cleanText(src[key], fallback);
  }
  return shop;
}

const resetFeeRule = shop => Object.assign(shop, { svcPct: '3', freeBelow: '200', svcMin: '0' });

function migrate(state, fromVersion) {
  // v3: the fee became "percent / free threshold / minimum" (Alipay, WeChat Pay: 3% above 200 ¥)
  if (fromVersion < 3) resetFeeRule(state.shop);
  // v5: delivery got an on/off switch and starts switched off
  if (fromVersion < 5) state.shop.dlOn = false;
  // v6: the "3%, min 2 ¥" preset was wrong — there is no such minimum
  if (fromVersion < 6 && parseNumber(state.shop.svcMin) === 2 && parseNumber(state.shop.freeBelow) === 0) {
    resetFeeRule(state.shop);
  }
  // v7: the main screen starts with USD, CNY, UZS, RUB. Currencies the user
  // added themselves are kept after them.
  if (fromVersion < 7) {
    const added = state.list.filter(code => !LEGACY_DEFAULT_LIST.includes(code) && !DEFAULT_LIST.includes(code));
    state.list = [...DEFAULT_LIST, ...added];
  }
}

/**
 * @param {unknown} saved  parsed JSON from storage (or null on first launch)
 * @param {{language?: string, prefersLight?: boolean}} env
 */
export function buildState(saved, { language = 'ru', prefersLight = false } = {}) {
  const src = isPlainObject(saved) ? saved : null;
  const raw = src ?? {};

  const state = {
    v: STATE_VERSION,
    theme: raw.theme === 'light' || raw.theme === 'dark' ? raw.theme : (prefersLight ? 'light' : 'dark'),
    lang: raw.lang === 'ru' || raw.lang === 'en' ? raw.lang : (/^(ru|uk|be|kk|uz)/i.test(language) ? 'ru' : 'en'),
    view: raw.view === 'shop' ? 'shop' : 'convert',
    list: cleanList(raw.list),
    base: isCurrencyCode(raw.base) ? raw.base : DEFAULT_LIST[0],
    input: cleanText(raw.input, '100'),
    shop: cleanShop(raw.shop)
  };

  if (src) migrate(state, Number.isInteger(raw.v) && raw.v > 0 ? raw.v : 1);
  if (!state.list.length) state.list = [...DEFAULT_LIST];
  if (!state.list.includes(state.base)) {
    // The typed amount belonged to a currency that is gone: "50 EUR" must not
    // silently become "50 USD", so start again from the default amount.
    state.base = state.list[0];
    state.input = '100';
  }
  return state;
}

// Persistent app state: defaults, validation of whatever is in storage, and
// migrations between versions. buildState() is pure — storage and browser
// details are passed in — so it can be tested in Node.
import { DEFAULT_LIST } from '../data/currencies.js';
import {
  DEFAULT_SOURCE, currentSourceId
} from './rate-sources.js';
import { isCurrencyCode } from './rates.js';
import { parseNumber } from './purchase.js';

export const STATE_VERSION = 13;

/** The tabs: converter, purchase, banks. */
export const VIEWS = Object.freeze(['convert', 'shop', 'banks']);

// The fee defaults are for a card linked in Pinduoduo itself: 3%, at least 2 ¥
export const SHOP_DEFAULTS = Object.freeze({
  price: '', priceCur: 'CNY', card: 'USD',
  svcPct: '3', freeBelow: '0', svcMin: '2', bankPct: '0', bufPct: '2',
  dlOn: false, dlMethod: 'air', dlWeight: '', dlUnit: 'kg',
  // Published cargo rates China → Uzbekistan (air 9.9 $/kg, road 6 $/kg); all editable
  dlAir: '9.9', dlAuto: '6', dlStep: '0.1',
  // Oversized parcels: volumetric weight = L × W × H (cm) / divisor, counted
  // only for parcels heavier than dlVolFree kg (the carrier's rule: up to 15 kg
  // the box size does not matter)
  dlBig: false, dlLen: '', dlWid: '', dlHei: '', dlDiv: '6000', dlVolFree: '15'
});

/** Currencies an item price can be entered in (the options of the price select). */
export const PRICE_CURRENCIES = Object.freeze(['CNY', 'USD', 'UZS']);
/** Pinduoduo prices are in yuan: the price currency on start and whenever the price is reset. */
export const ORDER_CURRENCY = 'CNY';

/** Purchase-form fields with a fixed set of values. */
export const SHOP_ENUMS = {
  priceCur: PRICE_CURRENCIES,
  card: ['USD', 'UZS'],
  dlMethod: ['air', 'auto'],
  dlUnit: ['g', 'kg'],
  dlStep: ['0.1', '0.5', '1', '0']
};
const SHOP_FLAGS = ['dlOn', 'dlBig'];
const MAX_TEXT = 60;

// The default list before v7; those two extra entries are dropped on upgrade.
const LEGACY_DEFAULT_LIST = ['USD', 'CNY', 'UZS', 'EUR', 'RUB', 'BTC'];

const isPlainObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/** Whether a value read from storage has the shape of this app's saved state. */
export const isSavedState = value =>
  isPlainObject(value) && Number.isInteger(value.v) && Array.isArray(value.list) && isPlainObject(value.shop);
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

const FEE_KEYS = ['svcPct', 'freeBelow', 'svcMin'];
const feeRule = shop => FEE_KEYS.map(key => parseNumber(shop[key])).join(',');
const resetFeeRule = shop => { for (const key of FEE_KEYS) shop[key] = SHOP_DEFAULTS[key]; };
// The presets offered before v8; whoever still has one of them gets the new default.
const EARLIER_FEE_PRESETS = ['3,200,0', '3,0,0'];

function migrate(state, fromVersion) {
  // v3: the fee became "percent / free threshold / minimum"
  if (fromVersion < 3) resetFeeRule(state.shop);
  // v5: delivery got an on/off switch and starts switched off
  if (fromVersion < 5) state.shop.dlOn = false;
  // v7: the main screen starts with USD, CNY, UZS, RUB. Currencies the user
  // added themselves are kept after them.
  if (fromVersion < 7) {
    const added = state.list.filter(code => !LEGACY_DEFAULT_LIST.includes(code) && !DEFAULT_LIST.includes(code));
    state.list = [...DEFAULT_LIST, ...added];
  }
  // v8: the default rule is the one of a card linked in Pinduoduo (3%, at least
  // 2 ¥). A rule the user typed in themselves is left alone.
  if (fromVersion < 8 && EARLIER_FEE_PRESETS.includes(feeRule(state.shop))) resetFeeRule(state.shop);
  // v10: the air rate went from 10 to 9.9 $/kg; a rate typed by hand stays
  if (fromVersion < 10 && parseNumber(state.shop.dlAir) === 10) state.shop.dlAir = SHOP_DEFAULTS.dlAir;
  // v13: Kapitalbank from bank.uz became the default source; whoever still had
  // the old default (the market rates) moves to it, any other choice stays
  if (fromVersion < 13 && state.rateSource === 'market') state.rateSource = DEFAULT_SOURCE;
}

/**
 * Switches delivery off and forgets the parcel (its weight and sizes); the
 * rates and the rounding stay.
 */
export function clearDelivery(shop) {
  Object.assign(shop, { dlOn: false, dlWeight: '', dlBig: false, dlLen: '', dlWid: '', dlHei: '' });
}

/**
 * Delivery starts switched off every time the app opens: a parcel belongs to
 * one purchase, and most prices are checked without it. A link to a
 * calculation with delivery (applied after this) switches it back on.
 */
export function startWithoutDelivery(state) {
  clearDelivery(state.shop);
}

/** The order starts in yuan every time the app opens; a link with another currency is applied after this. */
export function startOrderInYuan(state) {
  state.shop.priceCur = ORDER_CURRENCY;
}

/**
 * Up to 1.10.0 a phone whose browser could not name the sum dropped UZS from
 * the list on every start (the list in the address bar was checked against the
 * browser's names). It is put back once, at its usual place. This runs after
 * the link in the address bar is applied, which would otherwise drop it again.
 * @param {number|null} savedVersion  the version of the state found in storage
 * @returns {boolean} whether the sum was put back
 */
export function restoreDroppedSum(state, savedVersion) {
  if (!Number.isInteger(savedVersion) || savedVersion >= 9 || state.list.includes('UZS')) return false;
  state.list.splice(Math.min(DEFAULT_LIST.indexOf('UZS'), state.list.length), 0, 'UZS');
  return true;
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
    view: VIEWS.includes(raw.view) ? raw.view : 'convert',
    list: cleanList(raw.list),
    base: isCurrencyCode(raw.base) ? raw.base : DEFAULT_LIST[0],
    input: cleanText(raw.input, '100'),
    // the amount was typed on the main screen and "Purchase" has not taken it yet
    amountFresh: raw.amountFresh === true,
    // where the rates come from: 'market' (exchangerate.fun), 'nbuApi' or 'kapitalApi' (bank.uz).
    // A bank of an earlier version becomes the same bank from bank.uz; the Central
    // Bank and the sources of one's own are gone: the default source instead.
    rateSource: currentSourceId(raw.rateSource),
    shop: cleanShop(raw.shop)
  };

  const fromVersion = src ? (Number.isInteger(raw.v) && raw.v > 0 ? raw.v : 1) : STATE_VERSION;
  if (src) migrate(state, fromVersion);
  if (!state.list.length) state.list = [...DEFAULT_LIST];
  if (!state.list.includes(state.base)) {
    // The typed amount belonged to a currency that is gone: "50 EUR" must not
    // silently become "50 USD", so start again from the default amount.
    state.base = state.list[0];
    state.input = '100';
    state.amountFresh = false;
  }
  return state;
}

// Links to a calculation. The whole state of the open tab fits in the query:
//   ?mode=converter&amount=100&from=USD&list=USD,CNY,UZS,RUB
//   ?mode=purchase&price=450&cur=CNY&card=USD&fee=3&free=0&min=2&bank=0&buffer=2&delivery=off
// With a bank from bank.uz as the rate source both get &src=kapitalApi (or
// &src=nbuApi); the market rates add nothing.
// Everything in a link is untrusted: each parameter is validated on its own
// and a bad one is simply ignored.
import { adoptLinkedSource, sourceParams } from './rate-sources.js';
import { evaluate, sanitizeExpression } from './expression.js';
import { isCurrencyCode } from './rates.js';
import { SHOP_ENUMS } from './state.js';

const VIEW_BY_MODE = { converter: 'convert', purchase: 'shop', banks: 'banks' };
const MODE_BY_VIEW = { convert: 'converter', shop: 'purchase', banks: 'banks' };
const MAX_CURRENCIES = 30;
const MAX_TEXT = 60;
const MAX_QUERY = 2000;
const DEFAULT_AMOUNT = '100';

// Purchase form: link parameter → field of state.shop
const SHOP_AMOUNTS = {
  price: 'price', fee: 'svcPct', free: 'freeBelow', min: 'svcMin', bank: 'bankPct', buffer: 'bufPct',
  weight: 'dlWeight', air: 'dlAir', road: 'dlAuto',
  len: 'dlLen', wid: 'dlWid', hei: 'dlHei', vdiv: 'dlDiv', vfree: 'dlVolFree'
};
const SHOP_CHOICES = { cur: 'priceCur', card: 'card', unit: 'dlUnit', step: 'dlStep' };

/**
 * An amount or expression from the link.
 * @returns {string|undefined} '' clears the field, undefined = absent or invalid
 */
function amountParam(params, name) {
  if (!params.has(name)) return undefined;
  const raw = params.get(name).trim();
  if (raw === '') return '';
  const clean = sanitizeExpression(raw);
  // Same length means nothing had to be thrown away
  if (raw.length > MAX_TEXT || clean.length !== raw.length || evaluate(clean) == null) return undefined;
  return clean;
}

const codeParam = (params, name) => (params.get(name) ?? '').trim().toUpperCase();

function applyConverter(state, params, isKnown) {
  const usable = code => isCurrencyCode(code) && isKnown(code);
  const previousBase = state.base;

  const list = [...new Set((params.get('list') ?? '').split(',').map(code => code.trim().toUpperCase()).filter(usable))];
  if (list.length) state.list = list.slice(0, MAX_CURRENCIES);

  const from = codeParam(params, 'from');
  if (usable(from)) {
    if (!state.list.includes(from)) state.list.unshift(from);
    state.base = from;
  }
  if (!state.list.includes(state.base)) state.base = state.list[0];

  const amount = amountParam(params, 'amount');
  if (amount !== undefined) state.input = amount;
  // The old amount was typed in another currency and means nothing in the new one
  else if (state.base !== previousBase) state.input = DEFAULT_AMOUNT;
}

function applyPurchase(shop, params) {
  for (const [param, field] of Object.entries(SHOP_AMOUNTS)) {
    const value = amountParam(params, param);
    if (value !== undefined) shop[field] = value;
  }
  for (const [param, field] of Object.entries(SHOP_CHOICES)) {
    const raw = (params.get(param) ?? '').trim();
    const value = SHOP_ENUMS[field].find(option => option.toLowerCase() === raw.toLowerCase());
    if (value !== undefined && raw !== '') shop[field] = value;
  }
  const big = params.get('big');
  if (big === '1' || big === '0') shop.dlBig = big === '1';

  const delivery = params.get('delivery');
  if (delivery === 'air' || delivery === 'road') {
    shop.dlOn = true;
    shop.dlMethod = delivery === 'air' ? 'air' : 'auto';
  } else if (delivery === 'off') {
    // The same as turning the switch off in the form: nothing of it is kept
    Object.assign(shop, { dlOn: false, dlWeight: '', dlBig: false, dlLen: '', dlWid: '', dlHei: '' });
  }
}

/**
 * Applies a link to the state in place.
 * @param {string} search  location.search
 * @param {(code: string) => boolean} [isKnown]  whether the app has this currency
 * @returns {boolean} true when the link named a mode and was applied
 */
export function applyDeepLink(state, search, isKnown = () => true) {
  let params;
  try {
    params = new URLSearchParams(String(search ?? '').slice(0, MAX_QUERY));
  } catch {
    return false;
  }
  const mode = params.get('mode');
  if (!Object.hasOwn(VIEW_BY_MODE, mode)) return false;

  state.view = VIEW_BY_MODE[mode];
  if (state.view === 'convert') applyConverter(state, params, isKnown);
  else if (state.view === 'shop') applyPurchase(state.shop, params);
  // The numbers of a link are only the same with the rate it was made with
  adoptLinkedSource(state, params, isKnown);
  return true;
}

/** The query string that reproduces the open tab, e.g. "mode=converter&amount=100&…". */
export function buildQuery(state) {
  const params = new URLSearchParams();
  if (state.view === 'banks') {
    params.set('mode', MODE_BY_VIEW.banks);
  } else if (state.view === 'shop') {
    const shop = state.shop;
    params.set('mode', MODE_BY_VIEW.shop);
    params.set('price', shop.price);
    params.set('cur', shop.priceCur);
    params.set('card', shop.card);
    params.set('fee', shop.svcPct);
    params.set('free', shop.freeBelow);
    params.set('min', shop.svcMin);
    params.set('bank', shop.bankPct);
    params.set('buffer', shop.bufPct);
    if (shop.dlOn) {
      params.set('delivery', shop.dlMethod === 'auto' ? 'road' : 'air');
      params.set('weight', shop.dlWeight);
      params.set('unit', shop.dlUnit);
      params.set('air', shop.dlAir);
      params.set('road', shop.dlAuto);
      params.set('step', shop.dlStep);
      params.set('big', shop.dlBig ? '1' : '0');
      if (shop.dlBig) {
        params.set('len', shop.dlLen);
        params.set('wid', shop.dlWid);
        params.set('hei', shop.dlHei);
        params.set('vdiv', shop.dlDiv);
        params.set('vfree', shop.dlVolFree);
      }
    } else {
      params.set('delivery', 'off');
    }
  } else {
    params.set('mode', MODE_BY_VIEW.convert);
    params.set('amount', state.input);
    params.set('from', state.base);
    params.set('list', state.list.join(','));
  }
  for (const [key, value] of sourceParams(state)) params.set(key, value);
  // commas and colons are legal in a query and read better unescaped
  return params.toString().replace(/%2C/g, ',').replace(/%3A/g, ':');
}

/** A full link to the current calculation. */
export const buildLink = (state, baseUrl = '') => `${baseUrl}?${buildQuery(state)}`;

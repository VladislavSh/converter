// The user's own exchange rates: "Kapitalbank: 1 USD = 12 950 UZS", "Malika
// market: 1 USD = 12 800 UZS". They are saved under a name; one of them can be
// switched on, and then every calculation uses it instead of the market rate.
// Pure functions — no DOM, no storage.
import { evaluate } from './expression.js';
import { formatAmount, plainNumber } from './format.js';
import { convert, isCurrencyCode } from './rates.js';

export const MAX_CUSTOM_RATES = 12;
export const MAX_RATE_NAME = 30;
const TABLE_BASE = 'USD'; // rate tables hold "units per 1 USD"
const ID_RE = /^r\d{1,4}$/;

/** A rate typed by the user ("12 950", "12950,5", "100/8") as a positive number, or null. */
export function rateValue(text) {
  const value = typeof text === 'number' ? text : evaluate(text);
  return value != null && Number.isFinite(value) && value > 0 && value < 1e15 ? value : null;
}

const cleanName = name => (typeof name === 'string' ? name : '')
  .replace(/\p{Cc}/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_RATE_NAME);

const defaultName = (from, to) => `${from} → ${to}`;

/** One saved rate in its stored shape, or null when anything about it is off. */
function cleanEntry(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const { id, from, to } = raw;
  const value = rateValue(raw.rate);
  if (typeof id !== 'string' || !ID_RE.test(id)) return null;
  if (!isCurrencyCode(from) || !isCurrencyCode(to) || from === to || value == null) return null;
  return { id, name: cleanName(raw.name) || defaultName(from, to), from, to, rate: plainNumber(value) };
}

/** Whatever was in storage → a valid list (possibly empty). */
export function cleanCustomRates(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const list = [];
  for (const item of raw) {
    const entry = cleanEntry(item);
    if (!entry || seen.has(entry.id) || list.length >= MAX_CUSTOM_RATES) continue;
    seen.add(entry.id);
    list.push(entry);
  }
  return list;
}

/** The rate that is switched on, or null when the market rates are used. */
export function activeCustomRate(state) {
  return (state.customRates ?? []).find(entry => entry.id === state.rateId) ?? null;
}

/**
 * The market table with one pair replaced by the user's rate.
 *
 * "1 USD = 12 950 UZS" re-prices the sum against everything: dollars turn
 * into sums at exactly that rate, and yuan turn into sums through the market
 * yuan-to-dollar rate and then that rate — which is how money really moves
 * when dollars are bought at a bank or at a market stall.
 */
export function withCustomRate(table, custom) {
  if (!table || !custom) return table;
  const value = rateValue(custom.rate);
  const { from, to } = custom;
  if (value == null || from === to || !(table[from] > 0) || !(table[to] > 0)) return table;
  // The table's own base cannot move, so there the other side is re-priced
  return to === TABLE_BASE
    ? { ...table, [from]: table[to] / value }
    : { ...table, [to]: table[from] * value };
}

/**
 * How far the user's rate is from the market one, in percent: +1.2 means one
 * unit of `from` buys 1.2% more of `to`. @returns {number|null} null without market rates
 */
export function rateDifference(table, custom) {
  const value = rateValue(custom.rate);
  const market = convert(table, 1, custom.from, custom.to);
  if (value == null || market == null) return null;
  return (value / market - 1) * 100;
}

/** "1 USD = 12 950 UZS" */
export function describeCustomRate(custom, locale = 'ru-RU') {
  return `1 ${custom.from} = ${formatAmount(rateValue(custom.rate), custom.to, { locale })} ${custom.to}`;
}

function freeId(list) {
  for (let n = 1; ; n++) {
    if (!list.some(entry => entry.id === `r${n}`)) return `r${n}`;
  }
}

/**
 * Adds a rate (no `draft.id`) or changes a saved one. A new rate is switched
 * on straight away: it was added to be used.
 * @param {{id?: string, name?: string, from: string, to: string, rate: string|number}} draft
 * @returns {{ok: true, id: string}|{ok: false, error: 'pair'|'rate'|'full'|'missing'}}
 */
export function saveCustomRate(state, draft) {
  const list = state.customRates ?? (state.customRates = []);
  const { from, to } = draft;
  if (!isCurrencyCode(from) || !isCurrencyCode(to) || from === to) return { ok: false, error: 'pair' };
  const value = rateValue(draft.rate);
  if (value == null) return { ok: false, error: 'rate' };
  const fields = { name: cleanName(draft.name) || defaultName(from, to), from, to, rate: plainNumber(value) };

  if (draft.id) {
    const entry = list.find(item => item.id === draft.id);
    if (!entry) return { ok: false, error: 'missing' };
    Object.assign(entry, fields);
    return { ok: true, id: entry.id };
  }
  if (list.length >= MAX_CUSTOM_RATES) return { ok: false, error: 'full' };
  const id = freeId(list);
  list.push({ id, ...fields });
  state.rateId = id;
  return { ok: true, id };
}

/**
 * Switches on a rate offered by name ("CBU" for USD → UZS): the saved rate of
 * that name and pair is updated to today's value, or a new one is saved.
 * @returns {{ok: true, id: string}|{ok: false, error: string}}
 */
export function useNamedRate(state, { name, from, to, rate }) {
  const same = (state.customRates ?? []).find(entry => entry.name === cleanName(name) && entry.from === from && entry.to === to);
  if (!same) return saveCustomRate(state, { name, from, to, rate });
  const outcome = saveCustomRate(state, { id: same.id, name, from, to, rate });
  if (outcome.ok) state.rateId = same.id;
  return outcome;
}

/** Deletes a saved rate; if it was switched on, the market rates come back. */
export function removeCustomRate(state, id) {
  const list = state.customRates ?? [];
  const index = list.findIndex(entry => entry.id === id);
  if (index < 0) return false;
  list.splice(index, 1);
  if (state.rateId === id) state.rateId = '';
  return true;
}

/** Switches a saved rate on; '' goes back to the market rates. */
export function selectCustomRate(state, id) {
  const known = id === '' || (state.customRates ?? []).some(entry => entry.id === id);
  if (known) state.rateId = id;
  return known;
}

// ---------- links: ?…&xr=USD-UZS-12950&xrname=Kapitalbank ----------

const PARAM_RE = /^([A-Z]{3,5})-([A-Z]{3,5})-(\d+(?:\.\d+)?)$/;

/** The value of the "xr" link parameter for a rate. */
export const customRateParam = custom => `${custom.from}-${custom.to}-${custom.rate}`;

/**
 * Switches on the rate a link was made with, so the link shows the same
 * numbers. A rate the user already has is reused; otherwise it is saved under
 * the name from the link. Without a valid rate the market rates are used.
 * @returns {boolean} whether a rate from the link is now switched on
 */
export function adoptLinkedRate(state, param, name, isKnown = () => true) {
  state.rateId = '';
  const match = PARAM_RE.exec(String(param ?? '').trim().toUpperCase());
  if (!match) return false;
  const [, from, to, rate] = match;
  const value = rateValue(Number(rate));
  if (value == null || from === to || !isKnown(from) || !isKnown(to)) return false;

  const same = (state.customRates ?? []).find(entry =>
    entry.from === from && entry.to === to && rateValue(entry.rate) === value);
  if (same) {
    state.rateId = same.id;
    return true;
  }
  return saveCustomRate(state, { name, from, to, rate: value }).ok;
}

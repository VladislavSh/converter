// Rate sources: where the exchange rates of every calculation come from.
//   market — the rates from the network (core/rates.js), always there;
//   cbu    — the official rates of the Central Bank of Uzbekistan;
//   nbu    — the National Bank's sell prices (what buying a currency costs);
//   sN     — a source of the user's own: a name and the rates of several
//            currencies in one quote currency ("Kapitalbank: 1 USD = 12 950,
//            1 CNY = 1 800 sums").
// A source replaces the market rates of the currencies it has; the others keep
// theirs. Pure functions — no DOM, no storage.
import { evaluate } from './expression.js';
import { formatAmount, plainNumber } from './format.js';
import { isCurrencyCode } from './rates.js';

export const BANK_SOURCES = Object.freeze(['cbu', 'nbu']);
export const MAX_SOURCES = 12;
export const MAX_SOURCE_RATES = 20;
export const MAX_SOURCE_NAME = 30;
export const DEFAULT_QUOTE = 'UZS';
const TABLE_BASE = 'USD'; // rate tables hold "units per 1 USD"
const ID_RE = /^s\d{1,4}$/;

/** A rate typed by the user ("12 950", "12950,5", "100/8") as a positive number, or null. */
export function rateValue(text) {
  const value = typeof text === 'number' ? text : evaluate(text);
  return value != null && Number.isFinite(value) && value > 0 && value < 1e15 ? value : null;
}

const cleanName = name => (typeof name === 'string' ? name : '')
  .replace(/\p{Cc}/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_SOURCE_NAME);

/** "USD, CNY → UZS" for a source saved without a name. */
const defaultName = (rates, quote) => `${rates.slice(0, 3).map(entry => entry.code).join(', ')} → ${quote}`;

/** Valid rates of a source: known codes, not the quote itself, each once, positive values. */
function cleanRates(raw, quote) {
  if (!Array.isArray(raw)) return [];
  const rates = [];
  for (const item of raw) {
    if (rates.length >= MAX_SOURCE_RATES) break;
    const code = item?.code;
    const value = rateValue(item?.rate);
    if (!isCurrencyCode(code) || code === quote || value == null || rates.some(entry => entry.code === code)) continue;
    rates.push({ code, rate: plainNumber(value) });
  }
  return rates;
}

/** Whatever was in storage → valid sources of the user's own (possibly none). */
export function cleanSources(raw) {
  if (!Array.isArray(raw)) return [];
  const sources = [];
  for (const item of raw) {
    if (sources.length >= MAX_SOURCES) break;
    if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !ID_RE.test(item.id)) continue;
    if (!isCurrencyCode(item.quote) || sources.some(other => other.id === item.id)) continue;
    const rates = cleanRates(item.rates, item.quote);
    if (!rates.length) continue;
    sources.push({ id: item.id, name: cleanName(item.name) || defaultName(rates, item.quote), quote: item.quote, rates });
  }
  return sources;
}

/** Whether the id names a source that exists: market, a bank, or one of the user's. */
export const isSourceId = (state, id) =>
  id === 'market' || BANK_SOURCES.includes(id) || (state.sources ?? []).some(source => source.id === id);

/**
 * A bank's board as a source quoted in sums. The Central Bank quotes some
 * currencies per 10 units; the National Bank's source is its sell price.
 * @returns {{quote: string, rates: {code: string, rate: number}[], date: string, ts: number}|null}
 */
export function bankSource(bank, board) {
  if (!board?.rates?.length) return null;
  const rates = bank === 'cbu'
    ? board.rates.map(entry => ({ code: entry.code, rate: entry.rate / entry.nominal }))
    : board.rates.filter(entry => entry.sell != null).map(entry => ({ code: entry.code, rate: entry.sell / entry.nominal }));
  return rates.length ? { quote: DEFAULT_QUOTE, rates, date: board.date, ts: board.ts } : null;
}

/**
 * The source the calculations use now.
 * @param {{cbu?: object|null, nbu?: object|null}} banks  the loaded bank boards
 * @returns {{id: string, kind: 'market'|'bank'|'own', source: object|null, missing: boolean}}
 *   missing: a bank was chosen but its rates are not loaded (the market ones are used meanwhile)
 */
export function resolveSource(state, banks = {}) {
  const id = state.rateSource;
  if (BANK_SOURCES.includes(id)) {
    const source = bankSource(id, banks[id]);
    return { id, kind: 'bank', source, missing: !source };
  }
  const own = (state.sources ?? []).find(source => source.id === id);
  if (own) return { id, kind: 'own', source: own, missing: false };
  return { id: 'market', kind: 'market', source: null, missing: false };
}

/**
 * The market table with the source's rates put in.
 *
 * The quote currency is re-priced first: if the source has a dollar rate
 * ("1 USD = 12 950 UZS"), the sum is worth exactly that. Every other currency
 * of the source is then placed against the quote ("1 CNY = 1 800 UZS"), and
 * currencies the source does not have keep their market rates.
 */
export function sourceTable(market, source) {
  if (!market || !source?.rates?.length) return market;
  const { quote } = source;
  if (!(market[quote] > 0)) return market;
  const table = { ...market };
  if (quote !== TABLE_BASE) {
    const dollar = rateValue(source.rates.find(entry => entry.code === TABLE_BASE)?.rate);
    if (dollar != null) table[quote] = dollar;
  }
  for (const { code, rate } of source.rates) {
    const value = rateValue(rate);
    if (value == null || code === quote || code === TABLE_BASE || !isCurrencyCode(code)) continue;
    table[code] = table[quote] / value;
  }
  return table;
}

/** "1 USD = 12 950 UZS · 1 CNY = 1 800 UZS · +3" */
export function sourceSummary(source, locale = 'ru-RU', max = 2) {
  if (!source?.rates?.length) return '';
  const shown = source.rates.slice(0, max)
    .map(({ code, rate }) => `1 ${code} = ${formatAmount(rateValue(rate), source.quote, { locale })} ${source.quote}`);
  const more = source.rates.length - shown.length;
  return [...shown, ...(more > 0 ? [`+${more}`] : [])].join(' · ');
}

function freeId(list) {
  for (let n = 1; ; n++) {
    if (!list.some(source => source.id === `s${n}`)) return `s${n}`;
  }
}

/**
 * Adds a source of the user's own (no `draft.id`) or changes a saved one. Rows
 * with an empty rate are skipped. A new source is switched on straight away:
 * it was added to be used.
 * @param {{id?: string, name?: string, quote: string, rates: {code: string, rate: string|number}[]}} draft
 * @returns {{ok: true, id: string}|{ok: false, error: 'quote'|'pair'|'duplicate'|'rate'|'empty'|'full'|'missing', row?: number}}
 */
export function saveSource(state, draft) {
  const list = state.sources ?? (state.sources = []);
  const { quote } = draft;
  if (!isCurrencyCode(quote)) return { ok: false, error: 'quote' };
  const rates = [];
  const rows = Array.isArray(draft.rates) ? draft.rates : [];
  for (const [row, item] of rows.entries()) {
    const text = typeof item?.rate === 'number' ? String(item.rate) : String(item?.rate ?? '').trim();
    if (text === '') continue;
    if (!isCurrencyCode(item.code)) return { ok: false, error: 'pair', row };
    if (item.code === quote) return { ok: false, error: 'pair', row };
    if (rates.some(entry => entry.code === item.code)) return { ok: false, error: 'duplicate', row };
    const value = rateValue(item.rate);
    if (value == null) return { ok: false, error: 'rate', row };
    if (rates.length < MAX_SOURCE_RATES) rates.push({ code: item.code, rate: plainNumber(value) });
  }
  if (!rates.length) return { ok: false, error: 'empty' };
  const fields = { name: cleanName(draft.name) || defaultName(rates, quote), quote, rates };

  if (draft.id) {
    const source = list.find(item => item.id === draft.id);
    if (!source) return { ok: false, error: 'missing' };
    Object.assign(source, fields);
    return { ok: true, id: source.id };
  }
  if (list.length >= MAX_SOURCES) return { ok: false, error: 'full' };
  const id = freeId(list);
  list.push({ id, ...fields });
  state.rateSource = id;
  return { ok: true, id };
}

/** Deletes a source of the user's own; if it was in use, the market rates come back. */
export function removeSource(state, id) {
  const list = state.sources ?? [];
  const index = list.findIndex(source => source.id === id);
  if (index < 0) return false;
  list.splice(index, 1);
  if (state.rateSource === id) state.rateSource = 'market';
  return true;
}

/** Switches the calculations to a source. */
export function selectSource(state, id) {
  if (!isSourceId(state, id)) return false;
  state.rateSource = id;
  return true;
}

// ---------- links ----------
//   &src=cbu  ·  &src=own&srcname=Kapitalbank&srcq=UZS&srcr=USD:12950,CNY:1800

const RATE_PAIR_RE = /^([A-Z]{3,5}):(\d+(?:\.\d+)?)$/;
const LEGACY_RE = /^([A-Z]{3,5})-([A-Z]{3,5})-(\d+(?:\.\d+)?)$/; // &xr=USD-UZS-12950 from 1.9–1.12

/** The link parameters that bring the source in use along. */
export function sourceParams(state) {
  const { id, kind, source } = resolveSource(state);
  if (kind === 'market') return [];
  if (kind === 'bank') return [['src', id]];
  return [
    ['src', 'own'],
    ['srcname', source.name],
    ['srcq', source.quote],
    ['srcr', source.rates.map(({ code, rate }) => `${code}:${rate}`).join(',')]
  ];
}

const sameRates = (a, b) => a.length === b.length &&
  a.every(entry => b.some(other => other.code === entry.code && rateValue(other.rate) === rateValue(entry.rate)));

/**
 * Switches on the source a link was made with, so it shows the same numbers. A
 * source of one's own that is already saved (same rates) is reused, otherwise
 * it is saved under the name from the link. A link without a source, or with
 * a broken one, means the market rates.
 * @param {URLSearchParams} params
 * @returns {boolean} whether a source other than the market is now in use
 */
export function adoptLinkedSource(state, params, isKnown = () => true) {
  state.rateSource = 'market';
  const known = code => isCurrencyCode(code) && isKnown(code);
  const src = params.get('src');
  if (BANK_SOURCES.includes(src)) {
    state.rateSource = src;
    return true;
  }

  let draft = null;
  if (src === 'own') {
    const quote = String(params.get('srcq') ?? '').trim().toUpperCase();
    const rates = String(params.get('srcr') ?? '').toUpperCase().split(',').slice(0, MAX_SOURCE_RATES)
      .map(pair => RATE_PAIR_RE.exec(pair.trim()))
      .filter(match => match && known(match[1]))
      .map(match => ({ code: match[1], rate: Number(match[2]) }));
    if (known(quote) && rates.length) draft = { name: params.get('srcname'), quote, rates };
  } else {
    const legacy = LEGACY_RE.exec(String(params.get('xr') ?? '').trim().toUpperCase());
    if (legacy && known(legacy[1]) && known(legacy[2])) {
      draft = { name: params.get('xrname'), quote: legacy[2], rates: [{ code: legacy[1], rate: Number(legacy[3]) }] };
    }
  }
  if (!draft) return false;

  const clean = cleanRates(draft.rates, draft.quote);
  const same = (state.sources ?? []).find(source => source.quote === draft.quote && sameRates(source.rates, clean));
  if (same) {
    state.rateSource = same.id;
    return true;
  }
  return saveSource(state, draft).ok;
}

// ---------- 1.9–1.12: single custom rates ----------

// Rates saved by the "Use" buttons of the Banks tab; the bank sources replace them
const BANK_PAIR_NAMES = { 'ЦБ': 'cbu', CBU: 'cbu', 'НБУ, продажа': 'nbu', 'NBU, sell': 'nbu' };

/**
 * Turns the single custom rates of earlier versions ({name, from, to, rate})
 * into sources of one currency each, keeping the one in use.
 * @returns {{sources: object[], rateSource: string}}
 */
export function sourcesFromPairs(pairs, activeId) {
  const sources = [];
  let rateSource = 'market';
  for (const pair of Array.isArray(pairs) ? pairs : []) {
    if (!pair || !isCurrencyCode(pair.from) || !isCurrencyCode(pair.to) || pair.from === pair.to) continue;
    const bank = Object.hasOwn(BANK_PAIR_NAMES, pair.name) ? BANK_PAIR_NAMES[pair.name] : null;
    if (bank) {
      if (pair.id === activeId) rateSource = bank;
      continue;
    }
    const value = rateValue(pair.rate);
    if (value == null || sources.length >= MAX_SOURCES) continue;
    const rates = [{ code: pair.from, rate: plainNumber(value) }];
    const id = `s${sources.length + 1}`;
    sources.push({ id, name: cleanName(pair.name) || defaultName(rates, pair.to), quote: pair.to, rates });
    if (pair.id === activeId) rateSource = id;
  }
  return { sources, rateSource };
}

// Rate sources: where the exchange rates of every calculation come from.
//   market — the rates from the network (core/rates.js), always there;
//   cbu    — the official rates of the Central Bank of Uzbekistan;
//   nbu    — the National Bank's buy and sell prices in its branches;
//   kapital — Kapitalbank's buy and sell prices, typed in from the bank's page
//            (its site gives them to no other site, so they cannot be loaded);
//   nbuApi, kapitalApi — the National Bank's and Kapitalbank's buy and sell
//            prices from bank.uz, loaded through our own rates server: they
//            come by themselves and from any country;
//   sN     — a source of the user's own: a name and the rates of several
//            currencies in one quote currency ("Exchange office: 1 USD = 12 950,
//            1 CNY = 1 800 sums").
// The banks with buy and sell prices are counted by one side of them:
// "buy" (what the bank pays for a currency) unless "sell" is chosen. The
// market rate and the Central Bank's rate are one number for both.
// A source replaces the market rates of the currencies it has; the others keep
// theirs. Pure functions — no DOM, no storage.
import { evaluate } from './expression.js';
import { formatAmount, plainNumber } from './format.js';
import { isCurrencyCode } from './rates.js';

export const KAPITAL = 'kapital';
export const NBU_API = 'nbuApi';
export const KAPITAL_API = 'kapitalApi';
/** The sources loaded from the network; each is a board in the Banks tab. */
export const BANK_SOURCES = Object.freeze(['cbu', 'nbu', NBU_API, KAPITAL_API]);
/** The built-in sources after the market one, in the order of the lists: each bank's two side by side. */
export const BUILTIN_SOURCES = Object.freeze(['cbu', 'nbu', NBU_API, KAPITAL, KAPITAL_API]);
export const RATE_SIDES = Object.freeze(['buy', 'sell']);
export const DEFAULT_SIDE = 'buy';
const TWO_SIDED = Object.freeze(['nbu', NBU_API, KAPITAL, KAPITAL_API]);
/** Whether a source has separate buy and sell prices. */
export const isTwoSided = id => TWO_SIDED.includes(id);
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

/** An optional rate: '' or nothing = not given (null), otherwise as rateValue. */
const optionalRate = value => (value == null || String(value).trim() === '' ? null : rateValue(value));

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

/** Names compare without case and surrounding spaces: "Капиталбанк" = " капиталбанк ". */
const sameName = (a, b) => cleanName(a).toLocaleLowerCase('ru') === cleanName(b).toLocaleLowerCase('ru');

// What the built-in Kapitalbank source answers to: a source of one's own with
// one of these names becomes it.
const KAPITAL_NAMES = ['Капиталбанк', 'Капитал банк', 'Kapitalbank', 'Kapital bank', 'Kapital'];
export const isKapitalName = name => KAPITAL_NAMES.some(other => sameName(other, name));

/** One side of a buy/sell pair; when only the other side is given, that one. */
export function sideRate(entry, side = DEFAULT_SIDE) {
  const [wanted, other] = side === 'sell' ? [entry?.sell, entry?.buy] : [entry?.buy, entry?.sell];
  return optionalRate(wanted) ?? optionalRate(other);
}

/** "22.11.2026" for a date. */
export function todayText(date = new Date()) {
  const two = number => String(number).padStart(2, '0');
  return `${two(date.getDate())}.${two(date.getMonth() + 1)}.${date.getFullYear()}`;
}
const DATE_RE = /^\d{2}\.\d{2}\.\d{4}$/;

/**
 * Kapitalbank's rates as stored: {date, rates: [{code, buy, sell}]} in sums,
 * buy and sell as plain numbers in text ('' = not given), at least one of them.
 */
export function cleanKapital(raw) {
  const rates = [];
  for (const item of Array.isArray(raw?.rates) ? raw.rates : []) {
    if (rates.length >= MAX_SOURCE_RATES) break;
    const code = item?.code;
    if (!isCurrencyCode(code) || code === DEFAULT_QUOTE || rates.some(entry => entry.code === code)) continue;
    const buy = optionalRate(item.buy);
    const sell = optionalRate(item.sell);
    if (buy == null && sell == null) continue;
    rates.push({ code, buy: buy == null ? '' : plainNumber(buy), sell: sell == null ? '' : plainNumber(sell) });
  }
  const date = typeof raw?.date === 'string' && DATE_RE.test(raw.date) ? raw.date : '';
  return { date, rates };
}

/** Kapitalbank as a source for the calculations, by one side of its prices; null without rates. */
export function kapitalSource(kapital, side = DEFAULT_SIDE) {
  const rates = (kapital?.rates ?? [])
    .map(entry => ({ code: entry.code, rate: sideRate(entry, side) }))
    .filter(entry => entry.rate != null);
  return rates.length ? { quote: DEFAULT_QUOTE, rates, date: kapital.date ?? '' } : null;
}

/**
 * Saves Kapitalbank's rates typed in from the bank's page. A row needs a buy or
 * a sell price (or both); empty rows are skipped. The date is today's.
 * @param {{code: string, buy: string, sell: string}[]} rows
 * @returns {{ok: true}|{ok: false, error: 'pair'|'duplicate'|'rate'|'empty', row?: number}}
 */
export function saveKapital(state, rows, today = todayText()) {
  const rates = [];
  for (const [row, item] of (Array.isArray(rows) ? rows : []).entries()) {
    const buyText = String(item?.buy ?? '').trim();
    const sellText = String(item?.sell ?? '').trim();
    if (!buyText && !sellText) continue;
    if (!isCurrencyCode(item.code) || item.code === DEFAULT_QUOTE) return { ok: false, error: 'pair', row };
    if (rates.some(entry => entry.code === item.code)) return { ok: false, error: 'duplicate', row };
    const buy = optionalRate(buyText);
    const sell = optionalRate(sellText);
    if ((buyText && buy == null) || (sellText && sell == null)) return { ok: false, error: 'rate', row };
    if (rates.length < MAX_SOURCE_RATES) {
      rates.push({ code: item.code, buy: buy == null ? '' : plainNumber(buy), sell: sell == null ? '' : plainNumber(sell) });
    }
  }
  if (!rates.length) return { ok: false, error: 'empty' };
  state.kapital = { date: today, rates };
  return { ok: true };
}

/**
 * Up to 1.23 Kapitalbank could only be a source of one's own (the quick-start
 * link made one). It becomes the built-in source: its single rate per currency
 * was typed from the bank's page and is above the Central Bank's, so it is the
 * bank's sell price; the buy side waits to be filled in.
 * @returns {boolean} whether there was such a source
 */
export function adoptOwnKapital(state) {
  const index = (state.sources ?? []).findIndex(source => isKapitalName(source.name) && source.quote === DEFAULT_QUOTE);
  if (index < 0) return false;
  const [own] = state.sources.splice(index, 1);
  if (!state.kapital?.rates?.length) {
    state.kapital = cleanKapital({ date: '', rates: own.rates.map(({ code, rate }) => ({ code, buy: '', sell: rate })) });
  }
  if (state.rateSource === own.id) state.rateSource = KAPITAL;
  return true;
}

/**
 * One source per name. Two sources called the same (a link opened by an
 * earlier version added a second "Капиталбанк") are merged: the one in use
 * stays, otherwise the newest one.
 * @returns {{sources: object[], rateSource: string}}
 */
export function mergeSameNames(sources, rateSource) {
  const kept = [];
  let inUse = rateSource;
  for (const source of sources) {
    const index = kept.findIndex(other => sameName(other.name, source.name));
    if (index < 0) {
      kept.push(source);
    } else if (kept[index].id === rateSource) {
      if (inUse === source.id) inUse = kept[index].id;
    } else {
      if (inUse === kept[index].id) inUse = source.id;
      kept[index] = source;
    }
  }
  return { sources: kept, rateSource: inUse };
}

/** Whether the id names a source that exists: market, a bank, or one of the user's. */
export const isSourceId = (state, id) =>
  id === 'market' || BUILTIN_SOURCES.includes(id) || (state.sources ?? []).some(source => source.id === id);

/**
 * A bank's board as a source quoted in sums. The Central Bank quotes some
 * currencies per 10 units; the National Bank is counted by one side of its prices.
 * @returns {{quote: string, rates: {code: string, rate: number}[], date: string, ts: number}|null}
 */
export function bankSource(bank, board, side = DEFAULT_SIDE) {
  if (!board?.rates?.length) return null;
  const rates = bank === 'cbu'
    ? board.rates.map(entry => ({ code: entry.code, rate: entry.rate / entry.nominal }))
    : board.rates
      .map(entry => ({ code: entry.code, value: sideRate(entry, side), nominal: entry.nominal || 1 }))
      .filter(entry => entry.value != null)
      .map(entry => ({ code: entry.code, rate: entry.value / entry.nominal }));
  return rates.length ? { quote: DEFAULT_QUOTE, rates, date: board.date, ts: board.ts } : null;
}

/**
 * The source the calculations use now.
 * @param {{cbu?: object|null, nbu?: object|null}} banks  the loaded bank boards
 * @param {'buy'|'sell'} [side]  which prices of a bank with two of them
 * @returns {{id: string, kind: 'market'|'bank'|'own', source: object|null, missing: boolean, side: string, twoSided: boolean}}
 *   missing: a bank was chosen but its rates are not there (the market ones are used meanwhile)
 */
export function resolveSource(state, banks = {}, side = state.rateSide ?? DEFAULT_SIDE) {
  const id = state.rateSource;
  const twoSided = isTwoSided(id);
  if (BANK_SOURCES.includes(id) || id === KAPITAL) {
    const source = id === KAPITAL ? kapitalSource(state.kapital, side) : bankSource(id, banks[id], side);
    return { id, kind: 'bank', source, missing: !source, side, twoSided };
  }
  const own = (state.sources ?? []).find(source => source.id === id);
  if (own) return { id, kind: 'own', source: own, missing: false, side, twoSided: false };
  return { id: 'market', kind: 'market', source: null, missing: false, side, twoSided: false };
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
 * @returns {{ok: true, id: string}|{ok: false, error: 'quote'|'pair'|'duplicate'|'rate'|'empty'|'name'|'full'|'missing', row?: number}}
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
  // Two sources with one name could not be told apart in the lists; Kapitalbank is built in
  if (isKapitalName(fields.name) || list.some(other => other.id !== draft.id && sameName(other.name, fields.name))) {
    return { ok: false, error: 'name' };
  }

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
//   &src=cbu  ·  &src=own&srcname=Exchange&srcq=UZS&srcr=USD:12950,CNY:1800
//   &src=kapital&kr=USD:11950:12050,EUR:13100:13400&kd=22.11.2026 (code:buy:sell, a side may be empty)

const RATE_PAIR_RE = /^([A-Z]{3,5}):(\d+(?:\.\d+)?)$/;
const KAPITAL_PAIR_RE = /^([A-Z]{3,5}):(\d+(?:\.\d+)?)?:(\d+(?:\.\d+)?)?$/;
const LEGACY_RE = /^([A-Z]{3,5})-([A-Z]{3,5})-(\d+(?:\.\d+)?)$/; // &xr=USD-UZS-12950 from 1.9–1.12

/** The link parameters that bring the source in use along. */
export function sourceParams(state) {
  const { id, kind, source } = resolveSource(state);
  if (kind === 'market') return [];
  if (id === KAPITAL) {
    // The rates go along: the bank's page is not something the other phone can load
    const { rates = [], date = '' } = state.kapital ?? {};
    if (!rates.length) return [['src', KAPITAL]];
    return [
      ['src', KAPITAL],
      ['kr', rates.map(({ code, buy, sell }) => `${code}:${buy}:${sell}`).join(',')],
      ...(date ? [['kd', date]] : [])
    ];
  }
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
  if (src === KAPITAL) {
    const rates = String(params.get('kr') ?? '').toUpperCase().split(',').slice(0, MAX_SOURCE_RATES)
      .map(pair => KAPITAL_PAIR_RE.exec(pair.trim()))
      .filter(match => match && known(match[1]))
      .map(match => ({ code: match[1], buy: match[2] ?? '', sell: match[3] ?? '' }));
    const linked = cleanKapital({ date: String(params.get('kd') ?? '').trim(), rates });
    if (linked.rates.length) state.kapital = linked; // the link's numbers, as the sender saw them
    state.rateSource = KAPITAL;
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
  // A Kapitalbank source of one's own from an earlier link: the built-in one, by its sell price
  if (isKapitalName(draft.name) && draft.quote === DEFAULT_QUOTE && clean.length) {
    state.kapital = cleanKapital({ date: '', rates: clean.map(({ code, rate }) => ({ code, buy: '', sell: rate })) });
    state.rateSource = KAPITAL;
    return true;
  }
  // A source with this name is the one the link means: its rates are brought up to date
  const named = (state.sources ?? []).find(source => sameName(source.name, draft.name || ''));
  if (named) {
    const outcome = saveSource(state, { ...draft, id: named.id, name: named.name });
    state.rateSource = outcome.ok ? named.id : 'market';
    return outcome.ok;
  }
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

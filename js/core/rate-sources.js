// Rate sources: where the exchange rates of every calculation come from.
//   market     — the rates from the network (core/rates.js, exchangerate.fun),
//                always there;
//   nbuApi,
//   kapitalApi — the National Bank's and Kapitalbank's buy and sell prices from
//                bank.uz, loaded through our own rates server: they come by
//                themselves and from any country.
// The banks are counted by their sell prices (what the bank charges for a
// currency, the higher one); only the converter's rows show both sums.
// A source replaces the market rates of the currencies it has; the others keep
// theirs (Kapitalbank has no yuan on bank.uz, so the yuan stays a market rate,
// re-priced through the bank's dollar). Pure functions — no DOM, no storage.
import { evaluate } from './expression.js';
import { isCurrencyCode } from './rates.js';

export const NBU_API = 'nbuApi';
export const KAPITAL_API = 'kapitalApi';
/** The sources loaded from the network; each is a board in the Banks tab. */
export const BANK_SOURCES = Object.freeze([NBU_API, KAPITAL_API]);
/** The built-in sources after the market one, in the order of the lists. */
export const BUILTIN_SOURCES = BANK_SOURCES;
export const RATE_SIDES = Object.freeze(['buy', 'sell']);
export const DEFAULT_SIDE = 'sell';
/** Where the rates come from on first launch: Kapitalbank's prices from bank.uz. */
export const DEFAULT_SOURCE = KAPITAL_API;
/** Whether a source has separate buy and sell prices: both banks do, the market does not. */
export const isTwoSided = id => BANK_SOURCES.includes(id);
export const DEFAULT_QUOTE = 'UZS';
const TABLE_BASE = 'USD'; // rate tables hold "units per 1 USD"

// Sources of earlier versions and what replaces them: the same bank from
// bank.uz; the Central Bank and the sources of one's own are gone.
const REPLACED = Object.freeze({ nbu: NBU_API, kapital: KAPITAL_API });

/** A rate ("12 950", "12950,5", 12950) as a positive number, or null. */
export function rateValue(text) {
  const value = typeof text === 'number' ? text : evaluate(text);
  return value != null && Number.isFinite(value) && value > 0 && value < 1e15 ? value : null;
}

/** An optional rate: '' or nothing = not given (null), otherwise as rateValue. */
const optionalRate = value => (value == null || String(value).trim() === '' ? null : rateValue(value));

/** One side of a buy/sell pair; when only the other side is given, that one. */
export function sideRate(entry, side = DEFAULT_SIDE) {
  const [wanted, other] = side === 'sell' ? [entry?.sell, entry?.buy] : [entry?.buy, entry?.sell];
  return optionalRate(wanted) ?? optionalRate(other);
}

/** Whether the id names a source that exists: the market or a bank. */
export const isSourceId = id => id === 'market' || BUILTIN_SOURCES.includes(id);

/**
 * A saved or linked source id as one that exists now: a bank of an earlier
 * version becomes the same bank from bank.uz, anything else unknown → fallback.
 */
export function currentSourceId(id, fallback = DEFAULT_SOURCE) {
  if (isSourceId(id)) return id;
  return Object.hasOwn(REPLACED, id) ? REPLACED[id] : fallback;
}

/**
 * A bank's board as a source quoted in sums, by one side of its prices.
 * @returns {{quote: string, rates: {code: string, rate: number}[], date: string, ts: number}|null}
 */
export function bankSource(board, side = DEFAULT_SIDE) {
  if (!board?.rates?.length) return null;
  const rates = board.rates
    .map(entry => ({ code: entry.code, value: sideRate(entry, side), nominal: entry.nominal || 1 }))
    .filter(entry => entry.value != null)
    .map(entry => ({ code: entry.code, rate: entry.value / entry.nominal }));
  return rates.length ? { quote: DEFAULT_QUOTE, rates, date: board.date, ts: board.ts } : null;
}

/**
 * The source the calculations use now.
 * @param {{nbuApi?: object|null, kapitalApi?: object|null}} banks  the loaded bank boards
 * @param {'buy'|'sell'} [side]  which prices of the bank
 * @returns {{id: string, kind: 'market'|'bank', source: object|null, missing: boolean, side: string, twoSided: boolean}}
 *   missing: a bank was chosen but its rates are not there (the market ones are used meanwhile)
 */
export function resolveSource(state, banks = {}, side = DEFAULT_SIDE) {
  const id = state.rateSource;
  if (BANK_SOURCES.includes(id)) {
    const source = bankSource(banks[id], side);
    return { id, kind: 'bank', source, missing: !source, side, twoSided: true };
  }
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

/** Switches the calculations to a source. */
export function selectSource(state, id) {
  if (!isSourceId(id)) return false;
  state.rateSource = id;
  return true;
}

// ---------- links: &src=kapitalApi ----------

/** The link parameters that bring the source in use along; none for the market rates. */
export function sourceParams(state) {
  const { id, kind } = resolveSource(state);
  return kind === 'market' ? [] : [['src', id]];
}

/**
 * Switches on the source a link was made with, so it shows the same numbers.
 * A link without a source means the market rates; a bank of an earlier version
 * (&src=nbu, &src=kapital) opens the same bank from bank.uz; the Central Bank
 * and sources of one's own (&src=cbu, &src=own) open the market rates.
 * @param {URLSearchParams} params
 * @returns {boolean} whether a source other than the market is now in use
 */
export function adoptLinkedSource(state, params) {
  state.rateSource = currentSourceId(params.get('src'), 'market');
  return state.rateSource !== 'market';
}

// Exchange rates of Uzbek banks for the "Banks" tab: the buy/sell boards of the
// National Bank and Kapitalbank that our rates server takes from bank.uz.
// Everything from the network or from storage passes through these functions.
// Pure — no DOM, no network.
import { BANK_SOURCES } from './rate-sources.js';
import { isCurrencyCode } from './rates.js';

const MAX_RATES = 150;
const MAX_VALUE = 1e12;
// Shown first, after the user's own currencies; the rest behind "Show all"
const USUAL = ['USD', 'EUR', 'RUB', 'CNY', 'KZT', 'GBP', 'JPY', 'TRY', 'KRW', 'AED'];

/** A positive number from "12004.48", "12 004,48" or 12004.48, else null. */
export function bankNumber(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const number = typeof value === 'number' ? value : Number(value.replace(/[\s\u00A0]/g, '').replace(',', '.'));
  return Number.isFinite(number) && number > 0 && number < MAX_VALUE ? number : null;
}

/** "21.11.2026" from "21.11.2026" or "2026-11-21…", else ''. */
export function bankDate(value) {
  if (typeof value !== 'string') return '';
  const text = value.trim();
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(text.slice(0, 10))) return text.slice(0, 10);
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  return iso ? `${iso[3]}.${iso[2]}.${iso[1]}` : '';
}

const pick = (item, names) => names.map(name => item?.[name]).find(value => value != null && value !== '');

/**
 * A board of buy and sell prices in sums. The field names are read flexibly
 * (buy / sell, buy_price / sell_price…); a currency the bank does not trade
 * today may have only one of them.
 * @returns {{date: string, rates: {code: string, nominal: number, buy: number|null, sell: number|null}[]}|null}
 */
function parseBoard(payload) {
  const list = Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : null;
  if (!list) return null;
  const rates = [];
  let date = '';
  for (const item of list.slice(0, MAX_RATES)) {
    const code = String(pick(item, ['code', 'Ccy', 'currency']) ?? '').trim().toUpperCase();
    const buy = bankNumber(pick(item, ['nbu_buy_price', 'buy', 'buy_price']));
    const sell = bankNumber(pick(item, ['nbu_cell_price', 'nbu_sell_price', 'sell', 'sell_price']));
    if (!isCurrencyCode(code) || code === 'UZS' || (buy == null && sell == null) || rates.some(entry => entry.code === code)) continue;
    rates.push({ code, nominal: 1, buy, sell });
    date ||= bankDate(pick(item, ['date', 'Date']));
  }
  return rates.length ? { date, rates } : null;
}

/**
 * A board from our rates server (bank.uz behind it):
 * {ok, bankUpdatedAt: "2026-11-22T20:31:00+05:00", rates: [{code, name, buy, sell}]}.
 * When bank.uz is down the server keeps the last good rates (ok: false), so
 * they are still shown — with the date the bank set them, not the date of the call.
 * @returns {{date: string, rates: {code: string, nominal: number, buy: number|null, sell: number|null}[]}|null}
 */
export function parseRatesApi(payload) {
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.rates)) return null;
  const board = parseBoard(payload.rates);
  return board ? { ...board, date: bankDate(payload.bankUpdatedAt) || bankDate(payload.updatedAt) } : null;
}

/** A cached bank board read back from storage, checked again; null when unusable. */
function restoreBoard(raw) {
  if (!raw || typeof raw !== 'object' || !Number.isFinite(raw.ts) || !Array.isArray(raw.rates)) return null;
  const rates = [];
  for (const entry of raw.rates.slice(0, MAX_RATES)) {
    if (!isCurrencyCode(entry?.code) || rates.some(other => other.code === entry.code)) continue;
    const nominal = bankNumber(entry.nominal) ?? 1;
    const buy = bankNumber(entry.buy);
    const sell = bankNumber(entry.sell);
    if (buy != null || sell != null) rates.push({ code: entry.code, nominal, buy, sell });
  }
  return rates.length ? { ts: raw.ts, date: bankDate(raw.date), rates } : null;
}

/** @returns {Record<string, object|null>} a board (or null) for every bank: {nbuApi, kapitalApi} */
export function restoreBankCache(raw) {
  return Object.fromEntries(BANK_SOURCES.map(bank => [bank, restoreBoard(raw?.[bank])]));
}

/**
 * Which currencies of a board to show: the user's own list first, then the
 * usual ones; everything when expanded.
 * @returns {{codes: string[], hidden: number}}
 */
export function shownBankCodes(rates, userList = [], expanded = false) {
  const available = rates.map(entry => entry.code);
  const first = [...new Set([...userList, ...USUAL])].filter(code => available.includes(code));
  const codes = expanded ? [...first, ...available.filter(code => !first.includes(code))] : first;
  return { codes, hidden: available.length - codes.length };
}

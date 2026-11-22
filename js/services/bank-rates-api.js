// Rates of Uzbek banks for the "Banks" tab, from our own rates server: the
// National Bank's and Kapitalbank's boards from bank.uz. Each bank is loaded on
// its own: one that is slow never holds the other back.
import { RATE_SOURCES } from '../config.js';
import { parseRatesApi } from '../core/bank-rates.js';
import { fetchJson } from './rates-api.js';

/**
 * @param {'nbuApi'|'kapitalApi'} bank
 * @returns {Promise<object|null>} the board with its time stamp, or null when the bank did not answer
 */
export async function loadBankBoard(bank) {
  try {
    const board = parseRatesApi(await fetchJson(RATE_SOURCES[bank].url));
    return board ? { ...board, ts: Date.now() } : null;
  } catch {
    return null;
  }
}

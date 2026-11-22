// Rates of Uzbek banks for the "Banks" tab. The National Bank's site answers
// only from inside Uzbekistan, so each bank is loaded on its own: one that is
// slow or unreachable never holds the other back.
import { RATE_SOURCES } from '../config.js';
import { parseCbu, parseNbu } from '../core/bank-rates.js';
import { fetchJson } from './rates-api.js';

const PARSERS = { cbu: parseCbu, nbu: parseNbu };

/**
 * @param {'cbu'|'nbu'} bank
 * @returns {Promise<object|null>} the board with its time stamp, or null when the bank did not answer
 */
export async function loadBankBoard(bank) {
  try {
    const board = PARSERS[bank](await fetchJson(RATE_SOURCES[bank].url));
    return board ? { ...board, ts: Date.now() } : null;
  } catch {
    return null;
  }
}

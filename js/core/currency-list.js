// Operations on the user's currency list and the "source" currency — the one
// the amount is typed in. They mutate the state object and report what happened.
import { evaluate } from './expression.js';
import { formatAmount } from './format.js';
import { isCurrencyCode } from './rates.js';

/**
 * Makes `code` the source and carries the current amount over, so switching
 * USD → UZS turns "100" into its UZS equivalent.
 * @returns {boolean} true when the source changed
 */
export function switchSource(state, code, convert) {
  if (code === state.base || !state.list.includes(code)) return false;
  const value = evaluate(state.input);
  const converted = value == null ? null : convert(value, state.base, code);
  state.base = code;
  state.input = converted == null ? '' : formatAmount(converted, code, { plain: true });
  return true;
}

/**
 * Adds the currency, or removes it if it is already in the list.
 * @returns {'added'|'removed'|'last'|'invalid'} 'last' = refused, one must remain
 */
export function toggleCurrency(state, code, convert) {
  if (!isCurrencyCode(code)) return 'invalid';
  const index = state.list.indexOf(code);
  if (index < 0) {
    state.list.push(code);
    return 'added';
  }
  if (state.list.length === 1) return 'last';
  if (state.base === code) {
    switchSource(state, state.list[index === 0 ? 1 : 0], convert);
  }
  state.list.splice(index, 1);
  return 'removed';
}

/** Moves a currency up (-1) or down (+1) in the list. */
export function moveCurrency(state, code, delta) {
  const from = state.list.indexOf(code);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= state.list.length || to === from) return false;
  state.list.splice(to, 0, state.list.splice(from, 1)[0]);
  return true;
}

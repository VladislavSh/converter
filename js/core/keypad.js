// The on-screen calculator keypad: what each key does to the text of a field.
// Pure functions — the keypad itself is in ui/keypad.js.
//
// The keys keep the text a calculation the app can evaluate: one decimal
// separator per number, no "×+" or "+×", no "05", brackets that close only
// what is open. A key that would break that does nothing.

export const KEYPAD_MAX_LENGTH = 60; // what the app keeps of a typed amount (core/state.js)

/** Keys that change the text ("equals" and "done" are handled by the keypad). */
export const EDIT_KEYS = Object.freeze([
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
  'dot', '+', '-', '×', '÷', '%', 'paren', 'back', 'clear'
]);

const BINARY = ['+', '×', '÷']; // operators that need a number on both sides
const isDigit = ch => typeof ch === 'string' && ch.length === 1 && ch >= '0' && ch <= '9';
const isSeparator = ch => ch === '.' || ch === ',';
const isNumberChar = ch => isDigit(ch) || isSeparator(ch) || ch === ' ';
/** The text so far ends with something a number could follow an operator after. */
const endsValue = ch => isDigit(ch) || isSeparator(ch) || ch === ')' || ch === '%';
const count = (text, ch) => text.split(ch).length - 1;

function trailingNumber(text) {
  let i = text.length;
  while (i > 0 && isNumberChar(text[i - 1])) i--;
  return text.slice(i);
}

function leadingNumber(text) {
  let i = 0;
  while (i < text.length && isNumberChar(text[i])) i++;
  return text.slice(0, i);
}

const position = (value, max) => (Number.isInteger(value) ? Math.min(Math.max(value, 0), max) : max);

/** The edited text, or null when the result would be too long. */
function result(before, insert, after) {
  const value = before + insert + after;
  if (insert && value.length > KEYPAD_MAX_LENGTH) return null;
  return { value, caret: before.length + insert.length };
}

/**
 * Applies one key to the text of a field.
 * @param {{value: string, start?: number, end?: number}} field  the text and its selection (the caret when start = end)
 * @param {string} key  one of EDIT_KEYS
 * @param {{decimal?: string}} [options]  the decimal separator to type: "," (Russian) or "."
 * @returns {{value: string, caret: number}|null} null when the key changes nothing
 */
export function applyKey({ value, start, end }, key, { decimal = ',' } = {}) {
  const text = typeof value === 'string' ? value : '';
  let from = position(start, text.length);
  let to = position(end ?? from, text.length);
  if (to < from) [from, to] = [to, from];

  if (key === 'clear') return text === '' ? null : { value: '', caret: 0 };
  if (key === 'back') {
    if (from !== to) return result(text.slice(0, from), '', text.slice(to));
    if (from === 0) return null;
    return result(text.slice(0, from - 1), '', text.slice(from));
  }

  // The whole amount is selected when the field gets the focus: a digit
  // replaces it, while an operator, % or a bracket continues it.
  const continues = key === '-' || key === '%' || key === 'paren' || BINARY.includes(key);
  if (continues && text !== '' && from === 0 && to === text.length) from = to = text.length;

  let before = text.slice(0, from);
  const after = text.slice(to);
  const prev = before.slice(-1);
  let insert;

  if (isDigit(key)) {
    // "0" then "5" is "5", not "05"
    if (trailingNumber(before) === '0' && !isNumberChar(after[0])) before = before.slice(0, -1);
    // "(2+3)5" means "(2+3)×5"
    insert = prev === ')' || prev === '%' ? `×${key}` : key;
  } else if (key === 'dot') {
    if ([...trailingNumber(before) + leadingNumber(after)].some(isSeparator)) return null;
    if (isDigit(prev)) insert = decimal;
    else insert = prev === ')' || prev === '%' ? `×0${decimal}` : `0${decimal}`;
  } else if (BINARY.includes(key)) {
    // A second operator replaces the first: "5×" then "+" is "5+"
    const operand = before.replace(/[-+×÷]+$/, '');
    if (operand === '' || operand.endsWith('(')) return null;
    before = operand;
    insert = key;
  } else if (key === '-') {
    // A minus may follow × ÷ ( or start the text: "2×-3", "-5"
    if (prev === '-') return null;
    if (prev === '+') before = before.slice(0, -1);
    insert = '-';
  } else if (key === '%') {
    if (!isDigit(prev) && prev !== ')') return null;
    insert = '%';
  } else if (key === 'paren') {
    // One key for both brackets: it closes an open one after a number, opens one otherwise
    const open = count(before, '(') - count(before, ')');
    if (open > 0 && endsValue(prev)) insert = ')';
    else insert = endsValue(prev) ? '×(' : '(';
  } else {
    return null;
  }
  return result(before, insert, after);
}

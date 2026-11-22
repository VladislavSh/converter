// Arithmetic for amount fields: numbers, + - * / % ^ and parentheses.
// A hand-written recursive-descent parser: user input is never run as code.

const NOT_ALLOWED = /[^0-9.,+\-*/×÷%^()\s]/g;
const MAX_LENGTH = 120;

/**
 * Drops every character an amount field must not contain. Letters people use
 * for multiplication ("120x3") and the typographic minus are kept as operators.
 */
export const sanitizeExpression = text => String(text ?? '')
  .replace(/[xXхХ]/g, '×')
  .replace(/−/g, '-')
  .replace(NOT_ALLOWED, '')
  .slice(0, MAX_LENGTH);

const normalize = text => String(text ?? '')
  .replace(/[\s\u00A0\u202F]/g, '')
  .replace(/,/g, '.')
  .replace(/[×xх]/gi, '*')
  .replace(/÷/g, '/')
  .replace(/−/g, '-');

/**
 * Evaluates an expression. A single trailing operator ("120*", "5+") is
 * tolerated so the result does not disappear while the user is still typing.
 * @returns {number|null} null when the text is empty or not a valid expression
 */
export function evaluate(text) {
  const src = normalize(text);
  if (!src || src.length > MAX_LENGTH) return null;
  let pos = 0;
  const peek = () => src[pos];
  const isLast = () => pos === src.length - 1;

  function number() {
    const match = /^(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/i.exec(src.slice(pos));
    if (!match) throw new SyntaxError('number expected');
    pos += match[0].length;
    return parseFloat(match[0]);
  }

  function factor() {
    const ch = peek();
    if (ch === '-') { pos++; return -factor(); }
    if (ch === '+') { pos++; return factor(); }
    let value;
    if (ch === '(') {
      pos++;
      value = sum();
      if (peek() === ')') pos++; // an unclosed bracket is fine while typing
    } else {
      value = number();
    }
    if (peek() === '%') { pos++; value /= 100; }
    if (peek() === '^' && !isLast()) { pos++; value = Math.pow(value, factor()); }
    return value;
  }

  function product() {
    let value = factor();
    while ((peek() === '*' || peek() === '/') && !isLast()) {
      const op = src[pos++];
      const right = factor();
      value = op === '*' ? value * right : value / right;
    }
    return value;
  }

  function sum() {
    let value = product();
    while ((peek() === '+' || peek() === '-') && !isLast()) {
      const op = src[pos++];
      const right = product();
      value = op === '+' ? value + right : value - right;
    }
    return value;
  }

  try {
    const value = sum();
    const rest = src.slice(pos);
    if (rest && !/^[+\-*/^]$/.test(rest)) return null;
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

/** True when the text is a calculation rather than a plain (possibly negative) number. */
export const isExpression = text =>
  /[+\-*/^%×÷()]/.test(String(text ?? '').replace(/^\s*-/, ''));

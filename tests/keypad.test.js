import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EDIT_KEYS, KEYPAD_MAX_LENGTH, applyKey } from '../js/core/keypad.js';
import { evaluate, sanitizeExpression } from '../js/core/expression.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Presses keys one after another with the caret at the end, as a user mostly does. */
function type(keys, start = '', options) {
  let value = start;
  for (const key of keys) {
    const next = applyKey({ value, start: value.length, end: value.length }, key, options);
    if (next) value = next.value;
  }
  return value;
}
// "12+3" → ['1', '2', '+', '3']; "." stands for the decimal key, "()" for the bracket key
const keys = text => [...text.replace(/\(\)/g, 'P')].map(ch => ({ '.': 'dot', P: 'paren', '−': '-' }[ch] ?? ch));
const press = (value, start, end, key, options) => applyKey({ value, start, end }, key, options);

test('digits are typed at the caret', () => {
  assert.equal(type(keys('120')), '120');
  assert.deepEqual(press('12', 1, 1, '5'), { value: '152', caret: 2 }, 'in the middle');
  assert.deepEqual(press('12', 0, 0, '9'), { value: '912', caret: 1 }, 'at the start');
});

test('no leading zeros: "0" then a digit replaces the zero', () => {
  assert.equal(type(keys('05')), '5');
  assert.equal(type(keys('007')), '7');
  assert.equal(type(keys('5+07')), '5+7');
  assert.equal(type(keys('10')), '10', 'a zero after a digit stays');
  assert.equal(type(keys('0.05')), '0,05', 'and so does a zero after the separator');
});

test('decimal separator: one per number, "0," when no digit comes before it', () => {
  assert.equal(type(keys('.')), '0,');
  assert.equal(type(keys('1.5')), '1,5');
  assert.equal(type(keys('1.5.2')), '1,52', 'a second separator in one number does nothing');
  assert.equal(type(keys('1.5+.')), '1,5+0,', 'the next number may have its own');
  assert.equal(type(keys('1.5+2.25')), '1,5+2,25');
  assert.equal(type(keys('1.5'), '', { decimal: '.' }), '1.5', 'English uses a dot');
  assert.equal(press('12,5', 1, 1, 'dot'), null, 'the caret is inside a number that has one');
  assert.equal(press('1 000', 5, 5, 'dot').value, '1 000,', 'a number with a thousands space');
});

test('operators: no operator first, the second one replaces the first', () => {
  for (const op of ['+', '×', '÷', '%']) assert.equal(type([op]), '', `"${op}" cannot start a calculation`);
  assert.equal(type(keys('5+×')), '5×');
  assert.equal(type(keys('5×÷+')), '5+');
  assert.equal(type(keys('5×-')), '5×-', 'a minus after × makes a negative number');
  assert.equal(type(keys('5×-+')), '5+', 'and a plus replaces both');
  assert.equal(type(keys('5+-')), '5-', 'a minus replaces a plus');
  assert.equal(type(keys('5--')), '5-');
  assert.equal(type(keys('-')), '-', 'a negative number at the start');
  assert.equal(type(keys('--')), '-');
});

test('percent only after a number or a bracket', () => {
  assert.equal(type(keys('50%')), '50%');
  assert.equal(type(keys('50%%')), '50%');
  assert.equal(type(keys('5+%')), '5+');
  assert.equal(type(keys('50%5')), '50%×5', 'a number after % multiplies');
});

test('one bracket key: opens, then closes what is open', () => {
  assert.equal(type(keys('()')), '(');
  assert.equal(type(keys('()5')), '(5');
  assert.equal(type(keys('()5()')), '(5)');
  assert.equal(type(keys('()5()()')), '(5)×(', 'nothing open: a new bracket, multiplied');
  assert.equal(type(keys('5()')), '5×(');
  assert.equal(type(keys('2×()')), '2×(');
  assert.equal(type(keys('()()')), '((');
  assert.equal(type(keys('()2+3()4')), '(2+3)×4', 'a digit after ) multiplies');
  assert.equal(type(keys('()+')), '(', 'no operator right after (');
  assert.equal(type(keys('()-')), '(-');
});

test('backspace and clear', () => {
  assert.deepEqual(press('123', 3, 3, 'back'), { value: '12', caret: 2 });
  assert.deepEqual(press('123', 1, 1, 'back'), { value: '23', caret: 0 });
  assert.equal(press('123', 0, 0, 'back'), null, 'nothing before the caret');
  assert.deepEqual(press('12345', 1, 3, 'back'), { value: '145', caret: 1 }, 'a selection is deleted');
  assert.deepEqual(press('', 0, 0, 'back'), null);
  assert.deepEqual(press('120*3', 2, 2, 'clear'), { value: '', caret: 0 });
  assert.equal(press('', 0, 0, 'clear'), null);
});

test('the amount selected on focus: a digit replaces it, an operator continues it', () => {
  assert.deepEqual(press('100', 0, 3, '7'), { value: '7', caret: 1 });
  assert.deepEqual(press('100', 0, 3, 'dot'), { value: '0,', caret: 2 });
  assert.deepEqual(press('100', 0, 3, '×'), { value: '100×', caret: 4 });
  assert.deepEqual(press('100', 0, 3, '-'), { value: '100-', caret: 4 });
  assert.deepEqual(press('100', 0, 3, '%'), { value: '100%', caret: 4 });
  assert.deepEqual(press('100', 0, 3, 'paren'), { value: '100×(', caret: 5 });
  assert.deepEqual(press('100', 0, 3, 'back'), { value: '', caret: 0 });
  assert.deepEqual(press('100', 1, 3, '5'), { value: '15', caret: 2 }, 'a part of it is simply replaced');
});

test('an operator typed in the middle keeps the rest', () => {
  assert.deepEqual(press('12', 1, 1, '+'), { value: '1+2', caret: 2 });
  assert.deepEqual(press('1+2', 2, 2, '×'), { value: '1×2', caret: 2 }, 'replaces the operator before the caret');
});

test('the text never grows past the limit', () => {
  const full = '9'.repeat(KEYPAD_MAX_LENGTH);
  for (const key of ['1', '+', '-', 'dot', 'paren', '%']) assert.equal(press(full, full.length, full.length, key), null, key);
  assert.equal(press(full, full.length, full.length, 'back').value.length, KEYPAD_MAX_LENGTH - 1, 'but can always shrink');
  assert.equal(press(full, 0, full.length, '5').value, '5', 'and can be replaced');
});

test('unknown keys and odd input change nothing', () => {
  for (const key of ['', 'equals', 'done', 'x', '12', '=', null, undefined]) assert.equal(press('5', 1, 1, key), null, String(key));
  assert.deepEqual(applyKey({ value: undefined }, '5'), { value: '5', caret: 1 });
  assert.deepEqual(applyKey({ value: '12' }, '3'), { value: '123', caret: 3 }, 'no selection given: the end');
  assert.deepEqual(applyKey({ value: '12', start: 99, end: 99 }, '3'), { value: '123', caret: 3 }, 'past the end: the end');
  assert.deepEqual(applyKey({ value: '12', start: 99, end: -5 }, '3'), { value: '3', caret: 1 }, 'clamped to the whole text, which is replaced');
});

test('what is typed is calculated the way it reads', () => {
  const cases = [
    ['120×3+15', 375],
    ['()2+3()×4', 20],
    ['2×()3+4', 14, 'an unclosed bracket is tolerated'],
    ['50%', 0.5],
    ['200×10%', 20],
    ['0.1+0.2', 0.3],
    ['-7×-2', 14],
    ['100÷8', 12.5],
    ['89.9×2', 179.8],
    ['1000-250.5', 749.5],
    ['5+', 5, 'a trailing operator is tolerated while typing']
  ];
  for (const [typed, expected, message] of cases) {
    const value = type(keys(typed));
    assert.ok(Math.abs(evaluate(value) - expected) < 1e-9, `${typed} → ${value} = ${evaluate(value)} ${message ?? ''}`);
  }
  assert.equal(evaluate(type(keys('9÷0'))), null, 'division by zero is no number, not Infinity');
});

// ---------- random typing ----------

// A small deterministic generator, so a failure can be reproduced
function random(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}
const pick = (rnd, list) => list[Math.floor(rnd() * list.length)];
// Digits come up more often, as in real typing
const WEIGHTED = [...EDIT_KEYS.filter(key => key !== 'clear'), '1', '2', '5', '0', '9', 'dot', 'back'];

test('random typing at the end always leaves a well-formed calculation', () => {
  const rnd = random(20261122);
  for (let run = 0; run < 3000; run++) {
    let value = '';
    const pressed = [];
    for (let n = Math.floor(rnd() * 40); n >= 0; n--) {
      const key = pick(rnd, WEIGHTED);
      pressed.push(key);
      const next = applyKey({ value, start: value.length, end: value.length }, key);
      if (!next) continue;
      value = next.value;
      assert.equal(next.caret, value.length);

      const where = `after ${pressed.join(' ')}: "${value}"`;
      assert.ok(value.length <= KEYPAD_MAX_LENGTH, where);
      assert.equal(sanitizeExpression(value), value, `only allowed characters ${where}`);
      assert.doesNotMatch(value, /^[+×÷%)]/, `no operator first ${where}`);
      assert.doesNotMatch(value, /[-+×÷][+×÷%)]|[-+]-|\([+×÷%)]/, `no operator pairs ${where}`);
      assert.doesNotMatch(value, /(^|[^\d.,])0\d/, `no leading zeros ${where}`);
      for (const number of value.match(/[\d.,]+/g) ?? []) {
        assert.ok((number.match(/[.,]/g) ?? []).length <= 1, `one separator per number ${where}`);
      }
      let depth = 0;
      for (const ch of value) {
        depth += ch === '(' ? 1 : ch === ')' ? -1 : 0;
        assert.ok(depth >= 0, `no ) without ( ${where}`);
      }
      const result = evaluate(value);
      assert.ok(result === null || Number.isFinite(result), where);
    }
  }
});

test('random typing anywhere, with selections, never breaks the field', () => {
  const rnd = random(7);
  for (let run = 0; run < 3000; run++) {
    let value = '';
    for (let n = Math.floor(rnd() * 40); n >= 0; n--) {
      const a = Math.floor(rnd() * (value.length + 1));
      const b = rnd() < 0.8 ? a : Math.floor(rnd() * (value.length + 1));
      const next = applyKey({ value, start: a, end: b }, pick(rnd, EDIT_KEYS), { decimal: rnd() < 0.5 ? ',' : '.' });
      if (!next) continue;
      assert.ok(next.caret >= 0 && next.caret <= next.value.length);
      value = next.value;
      assert.ok(value.length <= KEYPAD_MAX_LENGTH);
      assert.equal(sanitizeExpression(value), value);
      assert.doesNotThrow(() => evaluate(value));
    }
  }
});

// ---------- the keypad on the page ----------

test('every key on the page does something, and every edit key is on the page', () => {
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const start = html.indexOf('<div class="keypad" id="keypad"');
  assert.ok(start > 0, 'the keypad is on the page');
  const pad = html.slice(start, html.indexOf('<div class="toast"', start));
  const onPage = [...pad.matchAll(/data-key="([^"]+)"/g)].map(m => m[1]);
  for (const key of onPage) assert.ok(EDIT_KEYS.includes(key) || key === 'equals' || key === 'done', `unknown key on the page: ${key}`);
  for (const key of EDIT_KEYS) assert.ok(onPage.includes(key), `no button for ${key}`);
  assert.equal(new Set(onPage).size, onPage.length, 'each key once');
  assert.equal([...pad.matchAll(/class="key\b/g)].length, 20, 'a 4 × 5 grid');
});

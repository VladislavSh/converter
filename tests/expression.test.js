import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, isExpression, sanitizeExpression } from '../js/core/expression.js';

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ≉ ${expected}`);

test('plain numbers', () => {
  assert.equal(evaluate('100'), 100);
  assert.equal(evaluate('0'), 0);
  assert.equal(evaluate('12.5'), 12.5);
  assert.equal(evaluate('12,5'), 12.5, 'comma is a decimal separator');
  assert.equal(evaluate('.5'), 0.5);
  assert.equal(evaluate('5.'), 5);
  assert.equal(evaluate('-7'), -7);
  assert.equal(evaluate('1 000 000'), 1000000, 'spaces are ignored');
  assert.equal(evaluate('1 000'), 1000, 'non-breaking spaces are ignored');
});

test('arithmetic and precedence', () => {
  assert.equal(evaluate('120*3+15'), 375);
  assert.equal(evaluate('2+3*4'), 14);
  assert.equal(evaluate('(2+3)*4'), 20);
  assert.equal(evaluate('10/4'), 2.5);
  assert.equal(evaluate('10-2-3'), 5, 'subtraction is left-associative');
  assert.equal(evaluate('100/10/2'), 5, 'division is left-associative');
  assert.equal(evaluate('2^3'), 8);
  assert.equal(evaluate('2^3^2'), 512, 'power is right-associative');
  assert.equal(evaluate('-2^2'), -4);
  assert.equal(evaluate('2*-3'), -6);
  close(evaluate('89.9*2'), 179.8);
  close(evaluate('0.1+0.2'), 0.3);
});

test('typographic operators from the on-screen keys', () => {
  assert.equal(evaluate('6×7'), 42);
  assert.equal(evaluate('84÷2'), 42);
  assert.equal(evaluate('50−8'), 42);
});

test('percent divides by 100', () => {
  assert.equal(evaluate('50%'), 0.5);
  assert.equal(evaluate('200*10%'), 20);
});

test('a trailing operator is tolerated while typing', () => {
  assert.equal(evaluate('120*'), 120);
  assert.equal(evaluate('5+'), 5);
  assert.equal(evaluate('5-'), 5);
  assert.equal(evaluate('5/'), 5);
  assert.equal(evaluate('5^'), 5);
  assert.equal(evaluate('(5+3'), 8, 'an unclosed bracket too');
});

test('invalid input gives null, never a wrong number', () => {
  for (const bad of ['', '   ', '+', '*5', '5+*', '5+(', '()', '5)', '1.2.3', 'abc', '5+3)', null, undefined]) {
    assert.equal(evaluate(bad), null, `"${bad}"`);
  }
  assert.equal(evaluate('5/0'), null, 'division by zero');
  assert.equal(evaluate('9'.repeat(400)), null, 'absurdly long input');
});

test('nothing is ever executed', () => {
  globalThis.__pwned = false;
  assert.equal(evaluate('globalThis.__pwned=true'), null);
  assert.equal(evaluate('(()=>1)()'), null);
  assert.equal(globalThis.__pwned, false);
  delete globalThis.__pwned;
});

test('isExpression tells a calculation from a number', () => {
  assert.equal(isExpression('100'), false);
  assert.equal(isExpression('-100'), false, 'a negative number is not a calculation');
  assert.equal(isExpression('12,5'), false);
  assert.equal(isExpression('100+5'), true);
  assert.equal(isExpression('100*'), true);
  assert.equal(isExpression('(5'), true);
  assert.equal(isExpression('50%'), true);
  assert.equal(isExpression('5.+1'), true, 'a dot before the operator does not hide it');
  assert.equal(isExpression('1 000,5'), false);
  assert.equal(isExpression(''), false);
});

test('pasted "x" and typographic minus stay operators instead of vanishing', () => {
  assert.equal(sanitizeExpression('120x3'), '120×3');
  assert.equal(sanitizeExpression('120Х3'), '120×3', 'Cyrillic letter too');
  assert.equal(sanitizeExpression('100−20'), '100-20');
  assert.equal(evaluate(sanitizeExpression('120x3')), 360, 'not 1203');
  assert.equal(evaluate(sanitizeExpression('100−20')), 80, 'not 10020');
});

test('sanitizeExpression keeps only digits, separators and operators', () => {
  assert.equal(sanitizeExpression('12a3<b>+4'), '123+4');
  assert.equal(sanitizeExpression('1 000,50 × 2'), '1 000,50 × 2');
  assert.equal(sanitizeExpression('<script>alert(1)</script>'), '(1)/');
  assert.equal(sanitizeExpression(null), '');
  assert.equal(sanitizeExpression('1'.repeat(500)).length, 120, 'length is capped');
});

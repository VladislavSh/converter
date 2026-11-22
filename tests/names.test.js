// Some phones' browsers ship Intl data that cannot name rarer currencies:
// Intl.DisplayNames returns the code itself ("UZS"). Up to 1.10.0 the app
// then dropped the sum from the list and from the currency picker. These tests
// run the app's code against such a browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_LIST, FIAT_NAMES, ISO_FIAT, POPULAR } from '../js/data/currencies.js';

const RealDisplayNames = Intl.DisplayNames;
// Knows only the dollar and the euro, as a stripped-down browser might
class PoorDisplayNames {
  constructor(locales, options) { this.real = new RealDisplayNames(locales, options); }
  of(code) { return code === 'USD' || code === 'EUR' ? this.real.of(code) : code; }
}

Intl.DisplayNames = PoorDisplayNames;
// A separate copy of the modules, built while Intl is the poor one
const names = await import('../js/core/names.js?poor-intl');
const { applyDeepLink } = await import('../js/core/deep-link.js?poor-intl');
const { buildState, restoreDroppedSum } = await import('../js/core/state.js?poor-intl');

test.after(() => { Intl.DisplayNames = RealDisplayNames; });

test('the sum is a known currency even where the browser cannot name it', () => {
  for (const code of ['UZS', 'KZT', 'KGS', 'TJS', 'CNY', 'RUB']) {
    assert.equal(names.isKnownFiat(code), true, code);
    assert.equal(names.isKnownCurrency(code), true, code);
  }
  assert.equal(names.isKnownFiat('BTC'), false, 'crypto is not fiat');
  assert.equal(names.isKnownCurrency('BTC'), true);
  for (const junk of ['XYZ', 'ABCD', 'uzs', '', null, undefined, 42]) assert.equal(names.isKnownFiat(junk), false, String(junk));
});

test('popular currencies keep their names; others show their code, never "undefined"', () => {
  assert.equal(names.currencyName('UZS', 'ru'), 'Узбекский сум');
  assert.equal(names.currencyName('UZS', 'en'), 'Uzbekistani Som');
  assert.equal(names.currencyName('CNY', 'ru'), 'Китайский юань');
  assert.equal(names.currencyName('USD', 'en'), 'US Dollar', 'what the browser knows comes from the browser');
  assert.equal(names.currencyName('MNT', 'ru'), 'MNT', 'a rare one without a name of ours');
  assert.equal(names.currencyName('BTC', 'ru'), 'Биткоин');
});

test('opening the app with the list in the address bar keeps the sum', () => {
  const state = buildState(null);
  applyDeepLink(state, '?mode=converter&amount=100&from=UZS&list=USD,CNY,UZS,RUB,KZT', names.isKnownCurrency);
  assert.deepEqual(state.list, ['USD', 'CNY', 'UZS', 'RUB', 'KZT']);
  assert.equal(state.base, 'UZS');
});

test('the sum is put back once for those who lost it', () => {
  const lost = buildState({ v: 8, list: ['USD', 'CNY', 'RUB'], base: 'USD', input: '100', shop: {} });
  // the old address bar still has the list without it
  applyDeepLink(lost, '?mode=converter&amount=100&from=USD&list=USD,CNY,RUB', names.isKnownCurrency);
  assert.equal(restoreDroppedSum(lost, 8), true);
  assert.deepEqual(lost.list, ['USD', 'CNY', 'UZS', 'RUB'], 'at its usual place');

  const short = { list: ['CNY'] };
  restoreDroppedSum(short, 7);
  assert.deepEqual(short.list, ['CNY', 'UZS'], 'a short list gets it at the end');

  const fine = { list: ['UZS', 'USD'] };
  assert.equal(restoreDroppedSum(fine, 8), false, 'already there');
  assert.deepEqual(fine.list, ['UZS', 'USD']);
  assert.equal(restoreDroppedSum({ list: ['USD'] }, 9), false, 'removed after the fix: the user chose that');
  assert.equal(restoreDroppedSum({ list: ['USD'] }, null), false, 'first launch or a shared link: nothing to repair');
});

test('the built-in data covers what the app shows first', () => {
  for (const code of new Set([...DEFAULT_LIST, ...POPULAR])) {
    assert.ok(ISO_FIAT.has(code), `${code} is in the ISO list`);
    assert.ok(FIAT_NAMES[code]?.ru && FIAT_NAMES[code]?.en, `${code} has names of ours`);
  }
  for (const code of ISO_FIAT) assert.match(code, /^[A-Z]{3}$/);
  assert.ok(ISO_FIAT.size > 150);
});

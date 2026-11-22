import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanRates, convert, cryptoRatesFromPrices, isCurrencyCode, mergeRates, restoreSnapshot } from '../js/core/rates.js';
import { formatAmount, formatMoney, formatNumber } from '../js/core/format.js';
import { currencyName, currencySymbol, isKnownFiat } from '../js/core/names.js';

const TABLE = { USD: 1, CNY: 7, UZS: 12000, RUB: 80, BTC: 0.00002 };
// Intl uses non-breaking spaces for grouping; compare on plain spaces
const plain = text => text.replace(/[  ]/g, ' ');

test('isCurrencyCode accepts only 3–5 capital letters', () => {
  for (const ok of ['USD', 'USDT', 'DOGEX']) assert.equal(isCurrencyCode(ok), true, ok);
  for (const bad of ['usd', 'US', 'TOOLONG', 'U$D', '<b>', '', null, 5, 'USD ']) assert.equal(isCurrencyCode(bad), false, String(bad));
});

test('cleanRates drops everything that is not CODE: positive number', () => {
  const dirty = {
    USD: 1, EUR: 0.9, ZERO: 0, NEG: -1, NANX: NaN, INF: Infinity, STR: '5', NUL: null,
    '<img src=x onerror=alert(1)>': 3, 'EVIL"onmouseover="x': 2, lower: 1, __proto__: { hacked: 1 }
  };
  assert.deepEqual(cleanRates(dirty), { USD: 1, EUR: 0.9 });
  for (const junk of [null, undefined, 'x', 5, []]) assert.deepEqual(cleanRates(junk), {});
});

test('convert goes through USD', () => {
  assert.equal(convert(TABLE, 100, 'USD', 'UZS'), 1200000);
  assert.equal(convert(TABLE, 700, 'CNY', 'USD'), 100);
  assert.equal(convert(TABLE, 7, 'CNY', 'RUB'), 80);
  assert.equal(convert(TABLE, 50, 'RUB', 'RUB'), 50);
  assert.equal(convert(TABLE, 0, 'USD', 'CNY'), 0);
});

test('convert returns null instead of a wrong number', () => {
  assert.equal(convert(TABLE, 100, 'USD', 'XXX'), null, 'unknown target');
  assert.equal(convert(TABLE, 100, 'XXX', 'USD'), null, 'unknown source');
  assert.equal(convert(null, 100, 'USD', 'CNY'), null, 'no table');
  assert.equal(convert(TABLE, NaN, 'USD', 'CNY'), null);
  assert.equal(convert(TABLE, null, 'USD', 'CNY'), null);
  assert.equal(convert({ USD: 1, BAD: 0 }, 1, 'USD', 'BAD'), null, 'zero rate');
});

test('cryptoRatesFromPrices inverts USD prices and skips junk', () => {
  const coins = [{ code: 'BTC', id: 'bitcoin' }, { code: 'ETH', id: 'ethereum' }, { code: 'TON', id: 'the-open-network' }];
  const rates = cryptoRatesFromPrices({ bitcoin: { usd: 50000 }, ethereum: { usd: 'oops' }, other: { usd: 1 } }, coins);
  assert.deepEqual(rates, { BTC: 1 / 50000 });
  assert.deepEqual(cryptoRatesFromPrices(null, coins), {});
});

test('mergeRates pins USD to 1 and keeps old crypto when the crypto request failed', () => {
  assert.deepEqual(mergeRates({ EUR: 0.9, USD: 5 }, { BTC: 0.00002 }, null), { EUR: 0.9, USD: 1, BTC: 0.00002 });
  assert.deepEqual(
    mergeRates({ EUR: 0.9 }, null, { BTC: 0.00003, ETH: 0.0004, JUNK: 9 }, ['BTC', 'ETH']),
    { EUR: 0.9, USD: 1, BTC: 0.00003, ETH: 0.0004 }
  );
  assert.deepEqual(mergeRates({ EUR: 0.9 }, null, null, ['BTC']), { EUR: 0.9, USD: 1 });
});

test('restoreSnapshot validates what is in storage', () => {
  const good = restoreSnapshot({ rates: { USD: 1, CNY: 7, '<x>': 1 }, ts: 1700000000000, source: 'test' });
  assert.deepEqual(good, { rates: { USD: 1, CNY: 7 }, ts: 1700000000000, source: 'test' });
  for (const bad of [null, 'x', {}, { rates: { USD: 1 } }, { rates: { CNY: 7 }, ts: 1 }, { rates: null, ts: 1 }, { rates: { USD: 1 }, ts: 'now' }]) {
    assert.equal(restoreSnapshot(bad), null, JSON.stringify(bad));
  }
});

test('formatAmount: fiat gets 2 decimals, small and crypto values keep precision', () => {
  assert.equal(plain(formatAmount(1195170.114, 'UZS')), '1 195 170,11');
  assert.equal(formatAmount(100, 'USD'), '100');
  assert.equal(formatAmount(0, 'USD'), '0');
  assert.equal(formatAmount(0.012345, 'USD'), '0,01235');
  assert.equal(formatAmount(0.00166099123, 'BTC'), '0,00166099');
  assert.equal(formatAmount(1.23456789, 'BTC'), '1,234568');
  assert.equal(formatAmount(1234.5, 'USD', { locale: 'en-US' }), '1,234.5');
  assert.equal(formatAmount(null, 'USD'), '');
  assert.equal(formatAmount(NaN, 'USD'), '');
});

test('formatAmount plain is machine-readable and round-trips', () => {
  assert.equal(formatAmount(1195170.114, 'UZS', { plain: true }), '1195170.11');
  assert.equal(formatAmount(0.0000165, 'BTC', { plain: true }), '0.0000165');
  assert.equal(Number(formatAmount(8207.55, 'RUB', { plain: true })), 8207.55);
});

test('formatMoney: always 2 decimals, whole sums', () => {
  assert.equal(formatMoney(7, 'USD'), '7,00');
  assert.equal(formatMoney(0.6034, 'USD'), '0,60');
  assert.equal(plain(formatMoney(367815.4, 'UZS')), '367 815');
  assert.equal(formatMoney(4, 'USD', 'en-US'), '4.00');
  assert.equal(formatMoney(null, 'USD'), '');
});

test('formatNumber trims trailing zeros', () => {
  assert.equal(formatNumber(200, 'ru-RU', 2), '200');
  assert.equal(formatNumber(0.4, 'ru-RU', 3), '0,4');
  assert.equal(formatNumber(1.2345, 'ru-RU', 3), '1,235');
});

test('currency names, known fiat and symbols', () => {
  assert.equal(currencyName('USD', 'ru'), 'Доллар США');
  assert.equal(currencyName('CNY', 'en'), 'Chinese Yuan');
  assert.equal(currencyName('BTC', 'ru'), 'Биткоин');
  assert.equal(currencyName('CNH', 'en'), 'Chinese Yuan (Offshore)');
  assert.equal(isKnownFiat('UZS'), true);
  assert.equal(isKnownFiat('BTC'), false, 'crypto is not fiat');
  assert.equal(isKnownFiat('ZZZ'), false, 'unknown codes are filtered out');
  assert.equal(currencySymbol('USD'), '$');
  assert.equal(currencySymbol('RUB'), '₽');
});

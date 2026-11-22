import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bankDate, bankNumber, parseCbu, parseNbu, restoreBankCache, shownBankCodes
} from '../js/core/bank-rates.js';
import { activeCustomRate, useNamedRate, withCustomRate } from '../js/core/custom-rates.js';
import { applyDeepLink, buildQuery } from '../js/core/deep-link.js';
import { convert } from '../js/core/rates.js';
import { buildState } from '../js/core/state.js';

// Real items from https://cbu.uz/ru/arkhiv-kursov-valyut/json/ (21.11.2026), names trimmed
const CBU = [
  { id: 68, Code: '840', Ccy: 'USD', CcyNm_RU: 'Доллар США', Nominal: '1', Rate: '12004.48', Diff: '32.84', Date: '21.11.2026' },
  { id: 56, Code: '643', Ccy: 'RUB', CcyNm_RU: 'Российский рубль', Nominal: '1', Rate: '146.56', Diff: '0.23', Date: '21.11.2026' },
  { id: 15, Code: '156', Ccy: 'CNY', CcyNm_RU: 'Юань', Nominal: '1', Rate: '1797.29', Diff: '1.55', Date: '21.11.2026' },
  { id: 36, Code: '398', Ccy: 'KZT', CcyNm_RU: 'Тенге', Nominal: '1', Rate: '26.35', Diff: '-0.29', Date: '21.11.2026' },
  { id: 71, Code: '704', Ccy: 'VND', CcyNm_RU: 'Донг', Nominal: '10', Rate: '4.65', Diff: '0', Date: '21.11.2026' }
];

test('numbers and dates from the banks', () => {
  assert.equal(bankNumber('12004.48'), 12004.48);
  assert.equal(bankNumber('12 004,48'), 12004.48);
  assert.equal(bankNumber(12950), 12950);
  for (const bad of ['', '0', '-5', 'abc', null, undefined, {}, '1e13', NaN]) assert.equal(bankNumber(bad), null, String(bad));
  assert.equal(bankDate('21.11.2026'), '21.11.2026');
  assert.equal(bankDate('2026-11-22 09:00:00'), '22.11.2026');
  assert.equal(bankDate('вчера'), '');
  assert.equal(bankDate(42), '');
});

test('Central Bank: official rates, the change for the day, quotes per 10 units', () => {
  const board = parseCbu(CBU);
  assert.equal(board.date, '21.11.2026');
  assert.deepEqual(board.rates[0], { code: 'USD', nominal: 1, rate: 12004.48, diff: 32.84 });
  assert.deepEqual(board.rates.find(entry => entry.code === 'KZT').diff, -0.29);
  const dong = board.rates.find(entry => entry.code === 'VND');
  assert.deepEqual([dong.nominal, dong.rate], [10, 4.65], 'the sum price of 10 dong');
});

test('Central Bank: junk is dropped, never shown', () => {
  assert.equal(parseCbu(null), null);
  assert.equal(parseCbu({ error: 'x' }), null);
  assert.equal(parseCbu([]), null);
  const board = parseCbu([
    { Ccy: '<img>', Rate: '1' }, { Ccy: 'usd', Rate: '1' }, { Ccy: 'EUR', Rate: '0' }, { Ccy: 'GBP', Rate: 'много' },
    { Ccy: 'UZS', Rate: '1' }, { Ccy: 'USD', Rate: '12000', Diff: 'x' }, { Ccy: 'USD', Rate: '1' }, null
  ]);
  assert.deepEqual(board.rates, [{ code: 'USD', nominal: 1, rate: 12000, diff: 0 }], 'only the first valid USD');
});

test('National Bank: buy and sell, whatever the fields are called', () => {
  const classic = parseNbu([
    { title: 'АҚШ доллари', code: 'USD', cb_price: '12004.48', nbu_buy_price: '11950', nbu_cell_price: '12060', date: '22.11.2026' },
    { title: 'Евро', code: 'EUR', cb_price: '13155', nbu_buy_price: '13000', nbu_cell_price: '', date: '22.11.2026' }
  ]);
  assert.equal(classic.date, '22.11.2026');
  assert.deepEqual(classic.rates, [
    { code: 'USD', nominal: 1, buy: 11950, sell: 12060 },
    { code: 'EUR', nominal: 1, buy: 13000, sell: null }
  ], 'a currency the bank does not sell today keeps its buy price');

  const other = parseNbu({ data: [{ currency: 'cny', buy: 1780, sell: '1 810', date: '2026-11-22' }] });
  assert.deepEqual(other.rates, [{ code: 'CNY', nominal: 1, buy: 1780, sell: 1810 }]);
  assert.equal(other.date, '22.11.2026');

  assert.equal(parseNbu('<html>blocked</html>'), null, 'an HTML error page');
  assert.equal(parseNbu([{ code: 'USD' }, { code: '<b>', buy: 1 }]), null, 'no prices, no valid code');
});

test('the cached boards come back only when valid', () => {
  const cbu = { ...parseCbu(CBU), ts: 1 };
  const restored = restoreBankCache({ cbu, nbu: { ts: 2, date: '22.11.2026', rates: [{ code: 'USD', buy: 11950, sell: 12060 }] } });
  assert.deepEqual(restored.cbu.rates, cbu.rates);
  assert.deepEqual(restored.nbu.rates, [{ code: 'USD', nominal: 1, buy: 11950, sell: 12060 }]);

  assert.deepEqual(restoreBankCache(null), { cbu: null, nbu: null });
  assert.deepEqual(restoreBankCache('junk'), { cbu: null, nbu: null });
  const hostile = restoreBankCache({
    cbu: { ts: 1, rates: [{ code: '<script>', rate: 1 }, { code: 'USD', rate: -1 }, { code: 'RUB', rate: 146, diff: 'x' }] },
    nbu: { ts: 'yesterday', rates: [{ code: 'USD', buy: 1, sell: 2 }] }
  });
  assert.deepEqual(hostile.cbu.rates, [{ code: 'RUB', nominal: 1, rate: 146, diff: 0 }]);
  assert.equal(hostile.nbu, null, 'no valid time stamp');
});

test('which currencies are shown: the user\'s list, the usual ones, then everything', () => {
  const rates = parseCbu(CBU).rates;
  assert.deepEqual(shownBankCodes(rates, ['USD', 'CNY', 'UZS', 'RUB']), { codes: ['USD', 'CNY', 'RUB', 'KZT'], hidden: 1 });
  assert.deepEqual(shownBankCodes(rates, ['VND']).codes, ['VND', 'USD', 'RUB', 'CNY', 'KZT'], 'an added currency comes first');
  assert.deepEqual(shownBankCodes(rates, [], true), { codes: ['USD', 'RUB', 'CNY', 'KZT', 'VND'], hidden: 0 });
});

test('"Use": a bank rate becomes the rate of every calculation, updated rather than duplicated', () => {
  const state = buildState(null);
  assert.deepEqual(useNamedRate(state, { name: 'ЦБ', from: 'USD', to: 'UZS', rate: 12004.48 }), { ok: true, id: 'r1' });
  assert.equal(activeCustomRate(state).rate, '12004.48');

  state.rateId = ''; // back to the market rates
  useNamedRate(state, { name: 'ЦБ', from: 'USD', to: 'UZS', rate: 12037.32 }); // the next day
  assert.equal(state.customRates.length, 1, 'the same name and pair is updated');
  assert.equal(state.rateId, 'r1');
  assert.equal(activeCustomRate(state).rate, '12037.32');

  useNamedRate(state, { name: 'ЦБ', from: 'CNY', to: 'UZS', rate: 1797.29 });
  useNamedRate(state, { name: 'НБУ, продажа', from: 'USD', to: 'UZS', rate: 12060 });
  assert.deepEqual(state.customRates.map(entry => `${entry.name} ${entry.from}`), ['ЦБ USD', 'ЦБ CNY', 'НБУ, продажа USD']);

  const table = withCustomRate({ USD: 1, CNY: 7, UZS: 12000 }, activeCustomRate(state));
  assert.equal(convert(table, 100, 'USD', 'UZS'), 1206000, 'calculations now run on the NBU sell price');
  assert.equal(useNamedRate(state, { name: 'ЦБ', from: 'USD', to: 'UZS', rate: 0 }).ok, false);
});

test('the Banks tab has its own link', () => {
  const state = buildState(null);
  state.view = 'banks';
  assert.equal(buildQuery(state), 'mode=banks');
  const opened = buildState(null);
  assert.equal(applyDeepLink(opened, '?mode=banks&amount=5&price=7'), true);
  assert.equal(opened.view, 'banks');
  assert.equal(opened.input, '100', 'other parameters do not leak into the converter');
  assert.equal(opened.shop.price, '', 'or into the purchase');
  assert.equal(buildState({ v: 10, view: 'banks', list: ['USD'], shop: {} }).view, 'banks', 'the tab is remembered');
});

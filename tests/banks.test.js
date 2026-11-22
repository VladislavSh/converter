import test from 'node:test';
import assert from 'node:assert/strict';
import { bankDate, bankNumber, parseRatesApi, restoreBankCache, shownBankCodes } from '../js/core/bank-rates.js';
import { KAPITAL_API, NBU_API, bankSource, resolveSource, selectSource, sourceTable } from '../js/core/rate-sources.js';
import { applyDeepLink, buildQuery } from '../js/core/deep-link.js';
import { convert } from '../js/core/rates.js';
import { buildState } from '../js/core/state.js';

// The National Bank's board as our rates server gives it (bank.uz, 22.11.2026)
const NBU_ANSWER = {
  bankUpdatedAt: '2026-11-22T20:31:00+05:00',
  rates: [
    { code: 'EUR', buy: 13000, sell: 13230 }, { code: 'KZT', buy: 16, sell: 28 }, { code: 'RUB', buy: 115, sell: 150 },
    { code: 'USD', buy: 11980, sell: 12060 }, { code: 'GBP', buy: 15520, sell: 15970 }, { code: 'CHF', buy: 14050, sell: 14500 },
    { code: 'JPY', buy: 65, sell: 80 }, { code: 'CNY', buy: 1640, sell: 1855 }
  ]
};

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

test('the cached boards come back only when valid', () => {
  const nbuApi = { ...parseRatesApi(NBU_ANSWER), ts: 1 };
  const restored = restoreBankCache({ nbuApi, kapitalApi: { ts: 2, date: '22.11.2026', rates: [{ code: 'USD', buy: 11970, sell: 12050 }] } });
  assert.deepEqual(restored.nbuApi.rates, nbuApi.rates);
  assert.deepEqual(restored.kapitalApi.rates, [{ code: 'USD', nominal: 1, buy: 11970, sell: 12050 }]);

  const empty = { nbuApi: null, kapitalApi: null };
  assert.deepEqual(restoreBankCache(null), empty);
  assert.deepEqual(restoreBankCache('junk'), empty);
  assert.deepEqual(Object.keys(restoreBankCache({ cbu: { ts: 1, rates: [{ code: 'USD', rate: 1 }] } })), ['nbuApi', 'kapitalApi'],
    'the Central Bank board of earlier versions is dropped');
  const hostile = restoreBankCache({
    nbuApi: { ts: 1, rates: [{ code: '<script>', buy: 1 }, { code: 'USD', buy: -1, sell: 'x' }, { code: 'RUB', buy: 115, sell: null }] },
    kapitalApi: { ts: 'yesterday', rates: [{ code: 'USD', buy: 1, sell: 2 }] }
  });
  assert.deepEqual(hostile.nbuApi.rates, [{ code: 'RUB', nominal: 1, buy: 115, sell: null }]);
  assert.equal(hostile.kapitalApi, null, 'no valid time stamp');
});

test('which currencies are shown: the user\'s list, the usual ones, then everything', () => {
  const { rates } = parseRatesApi(NBU_ANSWER);
  assert.deepEqual(shownBankCodes(rates, ['USD', 'CNY', 'UZS', 'RUB']), { codes: ['USD', 'CNY', 'RUB', 'EUR', 'KZT', 'GBP', 'JPY'], hidden: 1 });
  assert.deepEqual(shownBankCodes(rates, ['CHF']).codes.slice(0, 2), ['CHF', 'USD'], 'an added currency comes first');
  assert.equal(shownBankCodes(rates, [], true).hidden, 0);
});

test('a bank is a whole source: all its rates go into the calculations at once, by the sell price', () => {
  const MARKET = { USD: 1, CNY: 7, UZS: 12000, RUB: 80, EUR: 0.9 };
  const banks = { nbuApi: { ...parseRatesApi(NBU_ANSWER), ts: 1 }, kapitalApi: null };
  const state = buildState(null);
  assert.equal(selectSource(state, NBU_API), true);
  const { kind, source, missing } = resolveSource(state, banks);
  assert.deepEqual([kind, missing, source.quote, source.date], ['bank', false, 'UZS', '22.11.2026']);

  const cv = (value, from, to) => convert(sourceTable(MARKET, source), value, from, to);
  assert.equal(cv(100, 'USD', 'UZS'), 1206000, 'buying dollars at the bank');
  assert.ok(Math.abs(cv(1, 'CNY', 'UZS') - 1855) < 1e-6, 'the NBU yuan');
  const buy = bankSource(banks.nbuApi, 'buy');
  assert.equal(convert(sourceTable(MARKET, buy), 100, 'USD', 'UZS'), 1198000, 'the buy side when asked');
  const oneSide = bankSource({ ts: 1, date: '', rates: [{ code: 'EUR', nominal: 1, buy: 14000, sell: null }] });
  assert.deepEqual(oneSide.rates, [{ code: 'EUR', rate: 14000 }], 'only a buy price: that one, also for sell');

  // Kapitalbank not loaded yet → the market rates meanwhile
  selectSource(state, KAPITAL_API);
  assert.equal(resolveSource(state, banks).missing, true);
});

test('the Banks tab has its own link', () => {
  const state = buildState(null);
  state.view = 'banks';
  assert.equal(buildQuery(state), 'mode=banks&src=kapitalApi', 'the default source goes along');
  state.rateSource = 'market';
  assert.equal(buildQuery(state), 'mode=banks');
  const opened = buildState(null);
  assert.equal(applyDeepLink(opened, '?mode=banks&amount=5&price=7'), true);
  assert.equal(opened.view, 'banks');
  assert.equal(opened.input, '100', 'other parameters do not leak into the converter');
  assert.equal(opened.shop.price, '', 'or into the purchase');
  assert.equal(buildState({ v: 10, view: 'banks', list: ['USD'], shop: {} }).view, 'banks', 'the tab is remembered');
});

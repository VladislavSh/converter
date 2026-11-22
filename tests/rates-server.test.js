// Our own rates server (github.com/VladislavSh/CurrecyRater): the National Bank's
// and Kapitalbank's buy and sell prices from bank.uz, as two sources of their own.
import test from 'node:test';
import assert from 'node:assert/strict';
import { RATE_SOURCES } from '../js/config.js';
import { parseRatesApi, restoreBankCache } from '../js/core/bank-rates.js';
import {
  BANK_SOURCES, BUILTIN_SOURCES, KAPITAL_API, NBU_API, adoptLinkedSource, isTwoSided,
  resolveSource, selectSource, sourceParams, sourceTable
} from '../js/core/rate-sources.js';
import { convert } from '../js/core/rates.js';
import { buildState } from '../js/core/state.js';
import { MESSAGES } from '../js/i18n.js';

// A real answer of https://212-47-58-193.sslip.io/api/rates/kapitalbank (22.11.2026), trimmed
const KAPITAL_ANSWER = {
  id: 'kapitalbank',
  name: 'Kapitalbank',
  source: 'https://bank.uz/currency/bank/kapitalbank',
  ok: true,
  updatedAt: '2026-11-22T17:40:12.4145041+00:00',
  checkedAt: '2026-11-22T17:40:12.4145041+00:00',
  bankUpdatedAt: '2026-11-22T20:31:00+05:00',
  rates: [
    { code: 'USD', name: 'Доллар США', buy: 11970, sell: 12050 },
    { code: 'EUR', name: 'Евро', buy: 12820, sell: 13310 },
    { code: 'RUB', name: 'Российский рубль', buy: 118, sell: 143 }
  ]
};

test('a server board: buy and sell, dated by the bank', () => {
  const board = parseRatesApi(KAPITAL_ANSWER);
  assert.equal(board.date, '22.11.2026', 'the bank\'s own date, not the time of the call');
  assert.deepEqual(board.rates[0], { code: 'USD', nominal: 1, buy: 11970, sell: 12050 });
  assert.equal(board.rates.length, 3);
});

test('a server board with stale rates is still shown; junk is not', () => {
  // bank.uz was down: the server keeps the last good rates and says so
  const stale = parseRatesApi({ ...KAPITAL_ANSWER, ok: false, error: 'timeout', bankUpdatedAt: undefined });
  assert.equal(stale.rates.length, 3);
  assert.equal(stale.date, '22.11.2026', 'without the bank\'s date — the date the server got them');

  for (const junk of [null, 'html', [], {}, { rates: 'x' }, { rates: [] }, { rates: [{ code: '<b>', buy: 1 }] }]) {
    assert.equal(parseRatesApi(junk), null, JSON.stringify(junk));
  }
  // what the server answers with on 404 / 429 / 503 (ProblemDetails) is not a board
  assert.equal(parseRatesApi({ title: 'Too Many Requests', status: 429 }), null);
});

test('the server sources are built in, two-sided and loaded together', () => {
  assert.ok(BANK_SOURCES.includes(NBU_API) && BANK_SOURCES.includes(KAPITAL_API));
  assert.deepEqual(BUILTIN_SOURCES, [NBU_API, KAPITAL_API], 'the only banks');
  assert.ok(isTwoSided(NBU_API) && isTwoSided(KAPITAL_API));
  for (const id of [NBU_API, KAPITAL_API]) {
    assert.ok(RATE_SOURCES[id].url.startsWith('https://'), `${id}: HTTPS only, or the browser blocks it`);
    assert.match(RATE_SOURCES[id].page, /^https:\/\/bank\.uz\//);
  }
  assert.equal(new URL(RATE_SOURCES.nbuApi.url).host, new URL(RATE_SOURCES.kapitalApi.url).host, 'one server');
});

test('calculations by a server source: sell by default, buy when asked', () => {
  const MARKET = { USD: 1, EUR: 0.9, RUB: 80, UZS: 12000 };
  const banks = { kapitalApi: { ...parseRatesApi(KAPITAL_ANSWER), ts: 1 } };
  const state = buildState(null);
  assert.equal(selectSource(state, KAPITAL_API), true);

  const buy = resolveSource(state, banks, 'buy');
  assert.deepEqual([buy.kind, buy.missing, buy.twoSided, buy.source.date], ['bank', false, true, '22.11.2026']);
  assert.equal(convert(sourceTable(MARKET, buy.source), 100, 'USD', 'UZS'), 1197000);

  const sell = resolveSource(state, banks, 'sell');
  assert.equal(convert(sourceTable(MARKET, sell.source), 100, 'USD', 'UZS'), 1205000);

  // not loaded yet: the market rates meanwhile
  selectSource(state, NBU_API);
  assert.equal(resolveSource(state, banks).missing, true);
});

test('a server source survives a reload and travels in a link by name', () => {
  const state = buildState(null);
  selectSource(state, NBU_API);
  assert.equal(buildState(JSON.parse(JSON.stringify(state))).rateSource, NBU_API);
  assert.deepEqual(sourceParams(state), [['src', NBU_API]], 'the other phone loads the rates itself');

  const opened = buildState(null);
  assert.equal(adoptLinkedSource(opened, new URLSearchParams(`src=${KAPITAL_API}`)), true);
  assert.equal(opened.rateSource, KAPITAL_API);
});

test('cached server boards come back only when valid', () => {
  const kapitalApi = { ...parseRatesApi(KAPITAL_ANSWER), ts: 5 };
  const restored = restoreBankCache({ kapitalApi, nbuApi: { ts: 'later', rates: kapitalApi.rates } });
  assert.deepEqual(restored.kapitalApi.rates, kapitalApi.rates);
  assert.equal(restored.nbuApi, null, 'no valid time stamp');
});

test('the server sources have names in both languages', () => {
  for (const lang of ['ru', 'en']) {
    assert.match(MESSAGES[lang].bankNbuApi, /bank\.uz/);
    assert.match(MESSAGES[lang].bankKapitalApi, /bank\.uz/);
  }
});

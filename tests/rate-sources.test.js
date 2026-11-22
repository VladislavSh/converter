// The rate sources: the market rates (exchangerate.fun) and the National Bank's
// and Kapitalbank's buy and sell prices from bank.uz. Nothing else.
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyDeepLink, buildQuery } from '../js/core/deep-link.js';
import {
  BUILTIN_SOURCES, DEFAULT_SOURCE, KAPITAL_API, NBU_API, adoptLinkedSource, currentSourceId, isSourceId,
  isTwoSided, rateValue, resolveSource, selectSource, sideRate, sourceParams, sourceTable
} from '../js/core/rate-sources.js';
import { convert } from '../js/core/rates.js';
import { converterShareText } from '../js/core/share-text.js';
import { buildState, startOrderInYuan } from '../js/core/state.js';
import { translate } from '../js/i18n.js';

// Round market rates: 1 USD = 7 CNY = 12 000 UZS = 80 RUB
const MARKET = { USD: 1, CNY: 7, UZS: 12000, RUB: 80 };
const near = (actual, expected, message) =>
  assert.ok(Math.abs(actual - expected) < 1e-6, `${message ?? ''} ${actual} ≉ ${expected}`);
const plain = text => text?.replace(/[  ]/g, ' ');
const with3 = table => (value, from, to) => convert(table, value, from, to);
const BANK = { quote: 'UZS', rates: [{ code: 'USD', rate: 12950 }, { code: 'CNY', rate: 1800 }, { code: 'RUB', rate: 150 }] };

test('only three sources: the market and the two banks from bank.uz', () => {
  assert.deepEqual(BUILTIN_SOURCES, [NBU_API, KAPITAL_API]);
  assert.equal(DEFAULT_SOURCE, KAPITAL_API);
  for (const id of ['market', NBU_API, KAPITAL_API]) assert.equal(isSourceId(id), true, id);
  for (const id of ['cbu', 'nbu', 'kapital', 's1', '', undefined]) assert.equal(isSourceId(id), false, String(id));
  assert.equal(isTwoSided(KAPITAL_API), true);
  assert.equal(isTwoSided('market'), false);
});

test('a rate is read the way amounts are', () => {
  assert.equal(rateValue('12 950'), 12950);
  assert.equal(rateValue('12950,5'), 12950.5);
  assert.equal(rateValue(12950), 12950);
  for (const bad of ['', '0', '-5', 'abc', null, NaN]) assert.equal(rateValue(bad), null, String(bad));
});

test('a buy/sell pair gives the side asked for (sell by default), or the other one when that is all there is', () => {
  assert.equal(sideRate({ buy: 11950, sell: 12050 }), 12050, 'sell by default');
  assert.equal(sideRate({ buy: 11950, sell: 12050 }, 'buy'), 11950);
  assert.equal(sideRate({ buy: null, sell: 12050 }, 'buy'), 12050);
  assert.equal(sideRate({ buy: 11950, sell: null }, 'sell'), 11950);
  assert.equal(sideRate({ buy: null, sell: null }), null);
});

test('the source\'s rates go into every conversion; other currencies keep the market ones', () => {
  const cv = with3(sourceTable(MARKET, BANK));
  assert.equal(cv(100, 'USD', 'UZS'), 1295000, 'the dollar of the source');
  near(cv(1, 'CNY', 'UZS'), 1800, 'its yuan');
  near(cv(1, 'RUB', 'UZS'), 150, 'its rouble');
  near(cv(1, 'USD', 'CNY'), 12950 / 1800, 'dollar to yuan through the source\'s sum');
  assert.equal(MARKET.UZS, 12000, 'the market table itself is untouched');
});

test('a currency the bank does not quote (the yuan at Kapitalbank) is the market one, through the bank\'s dollar', () => {
  const noYuan = { quote: 'UZS', rates: [{ code: 'USD', rate: 12050 }] };
  const cv = with3(sourceTable(MARKET, noYuan));
  assert.equal(cv(1, 'USD', 'UZS'), 12050);
  near(cv(1, 'USD', 'CNY'), 7, 'the market dollar-to-yuan rate stays');
  near(cv(1, 'CNY', 'UZS'), 12050 / 7, 'so a yuan costs the bank\'s dollar divided by 7');
});

test('without a dollar rate the sum keeps its market value; junk changes nothing', () => {
  const cv = with3(sourceTable(MARKET, { quote: 'UZS', rates: [{ code: 'CNY', rate: 1800 }] }));
  assert.equal(cv(1, 'USD', 'UZS'), 12000);
  near(cv(1, 'CNY', 'UZS'), 1800);
  assert.equal(sourceTable(MARKET, null), MARKET);
  assert.equal(sourceTable(null, BANK), null, 'no rates loaded');
});

test('the source in use', () => {
  const state = buildState(null);
  assert.deepEqual(resolveSource(state), { id: KAPITAL_API, kind: 'bank', source: null, missing: true, side: 'sell', twoSided: true },
    'not loaded yet: the market rates meanwhile');
  assert.equal(selectSource(state, 'market'), true);
  assert.deepEqual(resolveSource(state), { id: 'market', kind: 'market', source: null, missing: false, side: 'sell', twoSided: false });
  assert.equal(selectSource(state, 'cbu'), false, 'the Central Bank is gone');
  assert.equal(state.rateSource, 'market');
});

test('saved sources of earlier versions: the same bank from bank.uz, the rest the default', () => {
  assert.equal(currentSourceId('nbu'), NBU_API);
  assert.equal(currentSourceId('kapital'), KAPITAL_API);
  assert.equal(currentSourceId('cbu'), KAPITAL_API);
  assert.equal(currentSourceId('s3'), KAPITAL_API);
  assert.equal(currentSourceId('market'), 'market');

  const old = buildState({
    v: 13, list: ['USD', 'UZS'], shop: {}, rateSource: 's1',
    sources: [{ id: 's1', name: 'Обменник', quote: 'UZS', rates: [{ code: 'USD', rate: '12990' }] }],
    kapital: { date: '22.11.2026', rates: [{ code: 'USD', buy: '11950', sell: '12050' }] }
  });
  assert.equal(old.rateSource, KAPITAL_API, 'a source of one\'s own → the default');
  assert.equal('sources' in old, false, 'the sources of one\'s own are gone');
  assert.equal('kapital' in old, false, 'and the typed-in Kapitalbank rates');
  assert.equal(buildState({ v: 13, rateSource: 'nbu' }).rateSource, NBU_API);
  assert.equal(buildState({ v: 13, rateSource: 'market' }).rateSource, 'market', 'the market rates stay when chosen');
});

test('a link carries a bank by name; the market rates add nothing', () => {
  const state = buildState(null);
  assert.deepEqual(sourceParams(state), [['src', KAPITAL_API]]);
  assert.match(buildQuery(state), /&src=kapitalApi$/);
  selectSource(state, 'market');
  assert.deepEqual(sourceParams(state), []);

  const opened = buildState(null);
  assert.equal(adoptLinkedSource(opened, new URLSearchParams(`src=${NBU_API}`)), true);
  assert.equal(opened.rateSource, NBU_API);
});

test('links of earlier versions: a bank opens it from bank.uz, the rest the market rates', () => {
  const open = search => {
    const state = buildState(null);
    applyDeepLink(state, `?mode=converter&amount=5${search}`);
    return state.rateSource;
  };
  assert.equal(open(''), 'market', 'no source in the link: the sender used the market rates');
  assert.equal(open('&src=nbu'), NBU_API);
  assert.equal(open('&src=kapital&kr=USD:11950:12050'), KAPITAL_API);
  for (const gone of ['&src=cbu', '&src=own&srcname=X&srcq=UZS&srcr=USD:12950', '&xr=USD-UZS-12950', '&src=evil']) {
    assert.equal(open(gone), 'market', gone);
  }
});

test('a shared calculation names its source', () => {
  const ru = (key, vars) => translate('ru', key, vars);
  const state = buildState(null);
  const note = ru('shareSourceBank', { name: 'Капиталбанк · bank.uz, продажа,', date: '22.11.2026' });
  assert.equal(note, 'Курсы: Капиталбанк · bank.uz, продажа, на 22.11.2026');
  const text = plain(converterShareText({ state, convert: with3(MARKET), t: ru, locale: 'ru-RU', rateNote: note, url: 'u' }));
  assert.match(text, /\n\n📌 Курсы: Капиталбанк · bank\.uz, продажа, на 22\.11\.2026\n\n🔗/);
  const market = converterShareText({ state, convert: with3(MARKET), t: ru, locale: 'ru-RU', rateNote: null, url: 'u' });
  assert.equal(market.includes('📌'), false);
});

test('the order starts in yuan; a link with another currency wins', () => {
  const state = buildState({ v: 12, list: ['USD'], shop: { priceCur: 'USD', price: '5' } });
  startOrderInYuan(state);
  assert.equal(state.shop.priceCur, 'CNY');
  applyDeepLink(state, '?mode=purchase&price=12&cur=USD');
  assert.equal(state.shop.priceCur, 'USD');
});

test('the side names read well in both languages', () => {
  for (const lang of ['ru', 'en']) {
    for (const key of ['sideBuy', 'sideSell', 'sideBoth', 'shareSourceNoDate', 'srcMissingHint']) {
      assert.ok(translate(lang, key, { name: 'X' }).length > 1, `${lang}.${key}`);
    }
  }
});

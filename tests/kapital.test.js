import test from 'node:test';
import assert from 'node:assert/strict';
import { applyDeepLink, buildQuery } from '../js/core/deep-link.js';
import {
  KAPITAL, cleanKapital, isSourceId, kapitalSource, resolveSource, saveKapital, saveSource,
  sideRate, sourceParams, sourceTable, todayText
} from '../js/core/rate-sources.js';
import { convert } from '../js/core/rates.js';
import { buildState, startOrderInYuan } from '../js/core/state.js';
import { translate } from '../js/i18n.js';

// Round market rates: 1 USD = 7 CNY = 12 000 UZS
const MARKET = { USD: 1, CNY: 7, UZS: 12000, RUB: 80 };
const fresh = () => buildState(null);
const ROWS = [
  { code: 'USD', buy: '11 950', sell: '12050' },
  { code: 'CNY', buy: '1650', sell: '' },
  { code: 'RUB', buy: '', sell: '' }
];

test('a buy/sell pair gives the side asked for, or the other one when that is all there is', () => {
  assert.equal(sideRate({ buy: '11950', sell: '12050' }), 11950, 'buy by default');
  assert.equal(sideRate({ buy: '11950', sell: '12050' }, 'sell'), 12050);
  assert.equal(sideRate({ buy: '', sell: '12050' }, 'buy'), 12050);
  assert.equal(sideRate({ buy: 11950, sell: null }, 'sell'), 11950);
  assert.equal(sideRate({ buy: '', sell: '' }), null);
});

test('Kapitalbank\'s rates are typed in, checked and dated', () => {
  const state = fresh();
  assert.deepEqual(state.kapital, { date: '', rates: [] }, 'empty at first');
  assert.equal(isSourceId(state, KAPITAL), true, 'always in the list');
  assert.deepEqual(saveKapital(state, ROWS, '22.11.2026'), { ok: true });
  assert.deepEqual(state.kapital, {
    date: '22.11.2026',
    rates: [{ code: 'USD', buy: '11950', sell: '12050' }, { code: 'CNY', buy: '1650', sell: '' }]
  }, 'an empty row is skipped, one side is enough');

  assert.deepEqual(saveKapital(state, [{ code: 'USD', buy: 'abc', sell: '' }]), { ok: false, error: 'rate', row: 0 });
  assert.deepEqual(saveKapital(state, [{ code: 'UZS', buy: '1', sell: '' }]), { ok: false, error: 'pair', row: 0 });
  assert.deepEqual(saveKapital(state, [ROWS[0], ROWS[0]]), { ok: false, error: 'duplicate', row: 1 });
  assert.deepEqual(saveKapital(state, [{ code: 'USD', buy: '', sell: '' }]), { ok: false, error: 'empty' });
  assert.equal(state.kapital.date, '22.11.2026', 'a refused save changes nothing');
  assert.match(todayText(new Date(2026, 10, 2)), /^02\.11\.2026$/);
});

test('calculations by Kapitalbank: buy prices by default, sell when chosen', () => {
  const state = fresh();
  saveKapital(state, ROWS, '22.11.2026');
  state.rateSource = KAPITAL;
  const buy = resolveSource(state);
  assert.deepEqual([buy.kind, buy.side, buy.twoSided, buy.missing], ['bank', 'buy', true, false]);
  assert.equal(convert(sourceTable(MARKET, buy.source), 100, 'USD', 'UZS'), 1195000);
  assert.equal(convert(sourceTable(MARKET, buy.source), 1, 'CNY', 'UZS'), 1650);

  const sell = resolveSource(state, {}, 'sell');
  assert.equal(convert(sourceTable(MARKET, sell.source), 100, 'USD', 'UZS'), 1205000);
  assert.ok(Math.abs(convert(sourceTable(MARKET, sell.source), 1, 'CNY', 'UZS') - 1650) < 1e-6, 'no sell price for the yuan: its buy price');

  state.kapital = { date: '', rates: [] };
  assert.equal(resolveSource(state).missing, true, 'no rates: the market ones meanwhile');
  assert.equal(kapitalSource(state.kapital), null);
});

test('the market rate and the Central Bank have one rate for both sides', () => {
  const state = fresh();
  assert.equal(resolveSource(state).twoSided, false);
  state.rateSource = 'cbu';
  assert.equal(resolveSource(state).twoSided, false);
  state.rateSource = 'nbu';
  assert.equal(resolveSource(state).twoSided, true);
});

test('a "Капиталбанк" source of one\'s own from an earlier version becomes the built-in one', () => {
  const saved = {
    v: 11, list: ['USD', 'UZS'], shop: {}, rateSource: 's2',
    sources: [
      { id: 's1', name: 'Обменник', quote: 'UZS', rates: [{ code: 'USD', rate: '12990' }] },
      { id: 's2', name: 'Капиталбанк', quote: 'UZS', rates: [{ code: 'USD', rate: '12050' }, { code: 'EUR', rate: '13310' }] }
    ]
  };
  const state = buildState(saved);
  assert.deepEqual(state.sources.map(source => source.name), ['Обменник'], 'no second Kapitalbank in the list');
  assert.equal(state.rateSource, KAPITAL, 'still in use');
  assert.deepEqual(state.kapital.rates, [{ code: 'USD', buy: '', sell: '12050' }, { code: 'EUR', buy: '', sell: '13310' }]);

  assert.deepEqual(saveSource(fresh(), { name: ' kapitalbank ', quote: 'UZS', rates: [{ code: 'USD', rate: '1' }] }),
    { ok: false, error: 'name' }, 'the name is taken by the built-in source');
});

test('a link carries Kapitalbank with its rates, and the converter\'s side', () => {
  const state = fresh();
  saveKapital(state, ROWS, '22.11.2026');
  state.rateSource = KAPITAL;
  state.rateSide = 'sell';
  assert.deepEqual(sourceParams(state), [['src', 'kapital'], ['kr', 'USD:11950:12050,CNY:1650:'], ['kd', '22.11.2026']]);
  const query = buildQuery(state);
  assert.match(query, /&side=sell/);
  assert.match(query, /&src=kapital&kr=USD:11950:12050,CNY:1650:&kd=22\.11\.2026$/);

  const other = fresh();
  applyDeepLink(other, `?${query}`);
  assert.equal(other.rateSource, KAPITAL);
  assert.equal(other.rateSide, 'sell');
  assert.deepEqual(other.kapital, state.kapital, 'the same numbers on the other phone');

  const buyLink = fresh();
  buyLink.rateSide = 'sell';
  applyDeepLink(buyLink, '?mode=converter&amount=5&from=USD&list=USD,UZS');
  assert.equal(buyLink.rateSide, 'buy', 'a link without a side means buy');

  const shop = fresh();
  shop.view = 'shop';
  shop.rateSide = 'sell';
  assert.doesNotMatch(buildQuery(shop), /side=/, 'the order has no side');
});

test('the quick-start link of earlier versions opens the built-in Kapitalbank', () => {
  const state = fresh();
  applyDeepLink(state, '?mode=banks&src=own&srcname=%D0%9A%D0%B0%D0%BF%D0%B8%D1%82%D0%B0%D0%BB%D0%B1%D0%B0%D0%BD%D0%BA&srcq=UZS&srcr=USD:12050,EUR:13310');
  assert.equal(state.rateSource, KAPITAL);
  assert.deepEqual(state.sources, [], 'no source of one\'s own is made');
  assert.deepEqual(state.kapital.rates, [{ code: 'USD', buy: '', sell: '12050' }, { code: 'EUR', buy: '', sell: '13310' }]);
});

test('broken Kapitalbank data from storage or a link is cleaned', () => {
  assert.deepEqual(cleanKapital({ date: 'yesterday', rates: [{ code: 'usd', buy: '1' }, { code: 'USD', buy: '-1', sell: 'x' }, null] }), { date: '', rates: [] });
  const state = fresh();
  applyDeepLink(state, '?mode=banks&src=kapital&kr=USD:abc:,ZZZZZZ:1:2');
  assert.equal(state.rateSource, KAPITAL, 'the bank is chosen');
  assert.deepEqual(state.kapital.rates, [], 'nothing broken is kept');
});

test('the order starts in yuan; a link with another currency wins', () => {
  const state = buildState({ v: 12, list: ['USD'], shop: { priceCur: 'USD', price: '5' } });
  startOrderInYuan(state);
  assert.equal(state.shop.priceCur, 'CNY');
  applyDeepLink(state, '?mode=purchase&price=12&cur=USD');
  assert.equal(state.shop.priceCur, 'USD');
});

test('the side names and the share line read well in both languages', () => {
  for (const lang of ['ru', 'en']) {
    for (const key of ['sideBuy', 'sideSell', 'bankKapital', 'kapitalTitle', 'shareSourceNoDate']) {
      assert.ok(translate(lang, key, { name: 'X' }).length > 1, `${lang}.${key}`);
    }
  }
  assert.equal(translate('ru', 'shareSourceBank', { name: 'Капиталбанк, покупка,', date: '22.11.2026' }), 'Курсы: Капиталбанк, покупка, на 22.11.2026');
});

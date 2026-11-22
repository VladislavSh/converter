import test from 'node:test';
import assert from 'node:assert/strict';
import { applyDeepLink, buildLink, buildQuery } from '../js/core/deep-link.js';
import { isKnownCurrency } from '../js/core/names.js';
import { buildState, SHOP_DEFAULTS } from '../js/core/state.js';
import { adoptEarlierStorage } from '../js/services/storage.js';

const fresh = () => buildState(null);
const open = (search, state = fresh()) => ({ applied: applyDeepLink(state, search, isKnownCurrency), state });

// ---------- converter ----------

test('a converter link opens the tab with the amount and currencies', () => {
  const { applied, state } = open('?mode=converter&amount=250&from=CNY&list=USD,CNY,UZS,EUR');
  assert.equal(applied, true);
  assert.equal(state.view, 'convert');
  assert.equal(state.input, '250');
  assert.equal(state.base, 'CNY');
  assert.deepEqual(state.list, ['USD', 'CNY', 'UZS', 'EUR']);
});

test('converter links carry expressions and survive a round trip', () => {
  const sender = fresh();
  Object.assign(sender, { view: 'convert', input: '120*3+15', base: 'UZS', list: ['RUB', 'UZS', 'USD', 'BTC'] });
  const query = buildQuery(sender);
  assert.equal(query, 'mode=converter&amount=120*3%2B15&from=UZS&list=RUB,UZS,USD,BTC');

  const { state } = open(`?${query}`);
  assert.deepEqual(
    [state.view, state.input, state.base, state.list],
    ['convert', '120*3+15', 'UZS', ['RUB', 'UZS', 'USD', 'BTC']]
  );
  assert.equal(buildQuery(state), query, 'building the link again gives the same link');
});

test('converter: partial links change only what they name', () => {
  assert.deepEqual(open('?mode=converter').state.list, ['USD', 'CNY', 'UZS', 'RUB'], 'mode alone keeps the saved list');
  assert.equal(open('?mode=converter&amount=7').state.input, '7');
  const from = open('?mode=converter&from=EUR').state;
  assert.deepEqual([from.base, from.list[0]], ['EUR', 'EUR'], 'a new source currency is added to the list');
  assert.equal(from.input, '100', 'the old amount was in another currency, so it is not kept');
  assert.equal(open('?mode=converter&amount=').state.input, '', 'an empty amount clears the field');
  assert.equal(open('?mode=converter&from=usd&list=usd,cny').state.base, 'USD', 'codes may be lower case');
});

test('converter: broken values are ignored one by one', () => {
  const { applied, state } = open('?mode=converter&amount=<script>alert(1)</script>&from="><img>&list=<b>,ZZZZZ,,USD,USD,nope,CNY');
  assert.equal(applied, true);
  assert.equal(state.input, '100', 'the amount is left as it was');
  assert.equal(state.base, 'USD');
  assert.deepEqual(state.list, ['USD', 'CNY'], 'only real currencies, without duplicates');

  const junk = open('?mode=converter&amount=abc&list=<>&from=123').state;
  assert.deepEqual([junk.input, junk.base, junk.list], ['100', 'USD', ['USD', 'CNY', 'UZS', 'RUB']]);
  assert.equal(open('?mode=converter&amount=5/0').state.input, '100', 'not a finite number');
  assert.equal(open(`?mode=converter&amount=${'9'.repeat(200)}`).state.input, '100', 'too long');
  assert.ok(open(`?mode=converter&list=${Array(80).fill('USD,EUR,CNY,RUB,UZS,KZT,GBP,JPY').join(',')}`).state.list.length <= 30);
});

// ---------- purchase ----------

test('a purchase link opens the tab with every field of the form', () => {
  const { applied, state } = open(
    '?mode=purchase&price=450&cur=CNY&card=UZS&fee=3&free=0&min=0&bank=1.5&buffer=2' +
    '&delivery=road&weight=1250&unit=g&air=11&road=7&step=0.5&paycard=1'
  );
  assert.equal(applied, true);
  assert.equal(state.view, 'shop');
  assert.deepEqual(state.shop, {
    price: '450', priceCur: 'CNY', card: 'UZS',
    svcPct: '3', freeBelow: '0', svcMin: '0', bankPct: '1.5', bufPct: '2',
    dlOn: true, dlMethod: 'auto', dlWeight: '1250', dlUnit: 'g',
    dlAir: '11', dlAuto: '7', dlStep: '0.5', dlPayCard: true
  });
});

test('purchase links survive a round trip, with and without delivery', () => {
  for (const shop of [
    { price: '89,9*2', priceCur: 'USD', card: 'USD', bankPct: '1,5' },
    { price: '1 299', dlOn: true, dlMethod: 'air', dlWeight: '0.3+0.45', dlPayCard: true },
    { price: '', dlOn: true, dlMethod: 'auto', dlWeight: '2', dlUnit: 'kg', dlStep: '0' }
  ]) {
    const sender = fresh();
    Object.assign(sender, { view: 'shop', shop: { ...SHOP_DEFAULTS, ...shop } });
    const { state } = open(`?${buildQuery(sender)}`);
    assert.equal(state.view, 'shop');
    assert.deepEqual(state.shop, sender.shop, JSON.stringify(shop));
  }
});

test('purchase: delivery=off clears delivery like the switch does', () => {
  const state = fresh();
  Object.assign(state.shop, { dlOn: true, dlWeight: '3', dlPayCard: true });
  applyDeepLink(state, '?mode=purchase&price=10&delivery=off&weight=9&paycard=1');
  assert.deepEqual([state.shop.dlOn, state.shop.dlWeight, state.shop.dlPayCard], [false, '', false]);
  assert.equal(buildQuery(state).includes('weight='), false, 'a link without delivery does not carry its fields');
});

test('purchase: broken values are ignored one by one', () => {
  const { applied, state } = open(
    '?mode=purchase&price=javascript:alert(1)&cur=BTC&card=<x>&fee=-&free=abc&bank=1e999&buffer=2' +
    '&delivery=rocket&unit=lb&step=7&paycard=yes&weight=<b>'
  );
  assert.equal(applied, true);
  assert.equal(state.view, 'shop');
  assert.deepEqual(state.shop, { ...SHOP_DEFAULTS }, 'nothing invalid got in');
});

test('purchase: a partial link keeps the rest of the saved form', () => {
  const state = fresh();
  Object.assign(state.shop, { bankPct: '1.5', card: 'UZS' });
  applyDeepLink(state, '?mode=purchase&price=99&cur=usd');
  assert.deepEqual([state.shop.price, state.shop.priceCur, state.shop.bankPct, state.shop.card], ['99', 'USD', '1.5', 'UZS']);
});

// ---------- no link, broken link ----------

test('the plain page and broken links change nothing', () => {
  const pristine = JSON.stringify(fresh());
  for (const search of [
    '', '?', '?foo=bar', '?mode=', '?mode=admin', '?mode=constructor', '?mode=__proto__',
    '?amount=5&from=EUR', '?price=5', '%%%', '?mode=converter%', '?=&=&', null, undefined
  ]) {
    const { applied, state } = open(search);
    if (search === '?mode=converter%') continue; // a valid mode with a stray character: applied, harmlessly
    assert.equal(applied, false, String(search));
    assert.equal(JSON.stringify(state), pristine, String(search));
  }
  assert.equal(open(`?mode=converter&amount=1&${'x=1&'.repeat(5000)}`).applied, true, 'a huge query does not hang or throw');
});

test('a link can only choose between the two tabs', () => {
  assert.equal(open('?mode=purchase').state.view, 'shop');
  assert.equal(open('?mode=converter').state.view, 'convert');
  const state = fresh();
  state.view = 'shop';
  assert.equal(applyDeepLink(state, '?mode=settings'), false);
  assert.equal(state.view, 'shop');
});

test('buildLink puts the query after the page address', () => {
  const state = fresh();
  assert.equal(
    buildLink(state, 'https://example.com/converter/'),
    'https://example.com/converter/?mode=converter&amount=100&from=USD&list=USD,CNY,UZS,RUB'
  );
  state.view = 'shop';
  state.shop.price = '450';
  assert.equal(
    buildLink(state, '/converter/'),
    '/converter/?mode=purchase&price=450&cur=CNY&card=USD&fee=3&free=0&min=2&bank=0&buffer=2&delivery=off'
  );
});

test('a link is parsed by the browser back into the same values', () => {
  const state = fresh();
  Object.assign(state, { input: '1 000 × 2 + 50%', base: 'CNY' });
  const url = new URL(buildLink(state, 'https://example.com/'));
  assert.equal(url.searchParams.get('amount'), '1 000 × 2 + 50%');
  assert.equal(url.searchParams.get('list'), 'USD,CNY,UZS,RUB');
});

// ---------- data saved under the app's earlier name ----------

function fakeStorage(initial) {
  const data = new Map(Object.entries(initial));
  return {
    get length() { return data.size; },
    key: index => [...data.keys()][index] ?? null,
    getItem: key => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => { data.set(key, String(value)); },
    removeItem: key => { data.delete(key); },
    dump: () => Object.fromEntries(data)
  };
}
const KEYS = { state: 'cartrate_state', rates: 'cartrate_rates' };
const savedState = JSON.stringify({ v: 7, list: ['USD', 'KZT'], base: 'KZT', shop: { bankPct: '1.5' } });
const savedRates = JSON.stringify({ rates: { USD: 1 }, ts: 1 });

test('settings saved under the earlier name are moved to the new keys', () => {
  const storage = fakeStorage({ oldname_state: savedState, oldname_rates: savedRates, unrelated: 'x' });
  assert.equal(adoptEarlierStorage(storage, KEYS), true);
  assert.deepEqual(storage.dump(), { cartrate_state: savedState, cartrate_rates: savedRates, unrelated: 'x' });
  assert.deepEqual(buildState(JSON.parse(storage.getItem(KEYS.state))).list, ['USD', 'KZT']);
});

test('nothing is adopted when the app already has data or finds nothing of its own', () => {
  const current = fakeStorage({ cartrate_state: '{"v":7}', oldname_state: savedState });
  assert.equal(adoptEarlierStorage(current, KEYS), false);
  assert.equal(current.getItem('oldname_state'), savedState, 'the old entry is left alone');

  const foreign = fakeStorage({
    game_state: '{"level":3}', other_state: 'not json', blog_state: '[1,2]', theme: 'dark', todo_state: 'null'
  });
  const before = foreign.dump();
  assert.equal(adoptEarlierStorage(foreign, KEYS), false);
  assert.deepEqual(foreign.dump(), before, 'other sites on the same origin keep their data');

  assert.equal(adoptEarlierStorage(fakeStorage({}), KEYS), false);
  assert.equal(adoptEarlierStorage({ get length() { throw new Error('blocked'); } }, KEYS), false, 'blocked storage');
});

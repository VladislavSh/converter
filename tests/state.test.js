import test from 'node:test';
import assert from 'node:assert/strict';
import { buildState, SHOP_DEFAULTS, STATE_VERSION, startWithoutDelivery } from '../js/core/state.js';
import { applyDeepLink } from '../js/core/deep-link.js';
import { moveCurrency, reorderCurrency, switchSource, toggleCurrency } from '../js/core/currency-list.js';
import { convert } from '../js/core/rates.js';

const TABLE = { USD: 1, CNY: 7, UZS: 12000, RUB: 80 };
const cv = (value, from, to) => convert(TABLE, value, from, to);

test('first launch: dollar, yuan, sum and rouble', () => {
  const state = buildState(null);
  assert.deepEqual(state.list, ['USD', 'CNY', 'UZS', 'RUB']);
  assert.equal(state.base, 'USD');
  assert.equal(state.input, '100');
  assert.equal(state.view, 'convert');
  assert.equal(state.v, STATE_VERSION);
  assert.deepEqual(state.shop, { ...SHOP_DEFAULTS });
});

test('theme and language follow the device until the user chooses', () => {
  assert.equal(buildState(null, { prefersLight: true }).theme, 'light');
  assert.equal(buildState(null, { prefersLight: false }).theme, 'dark');
  assert.equal(buildState(null, { language: 'uz-UZ' }).lang, 'ru');
  assert.equal(buildState(null, { language: 'en-US' }).lang, 'en');
  const chosen = buildState({ v: STATE_VERSION, theme: 'dark', lang: 'en' }, { prefersLight: true, language: 'ru' });
  assert.equal(chosen.theme, 'dark');
  assert.equal(chosen.lang, 'en');
});

test('a current state is restored as it was saved', () => {
  const saved = {
    v: STATE_VERSION, theme: 'light', lang: 'en', view: 'shop',
    list: ['UZS', 'USD', 'KZT'], base: 'KZT', input: '120*3', amountFresh: true,
    sources: [{ id: 's1', name: 'Bank', quote: 'UZS', rates: [{ code: 'USD', rate: '12950' }, { code: 'CNY', rate: '1800' }] }],
    rateSource: 's1',
    shop: { ...SHOP_DEFAULTS, price: '45,5', card: 'UZS', dlOn: true, dlMethod: 'auto', dlWeight: '0.34' }
  };
  assert.deepEqual(buildState(structuredClone(saved)), saved);
});

test('upgrade to v7 drops EUR and BTC from the old default list', () => {
  const state = buildState({ v: 6, list: ['USD', 'CNY', 'UZS', 'EUR', 'RUB', 'BTC'], base: 'EUR', input: '50' });
  assert.deepEqual(state.list, ['USD', 'CNY', 'UZS', 'RUB']);
  assert.equal(state.base, 'USD', 'the source moves to a currency that is still listed');
  assert.equal(state.input, '100', '50 EUR must not silently become 50 USD');
});

test('upgrade to v7 keeps the amount when its currency stays', () => {
  const state = buildState({ v: 6, list: ['USD', 'CNY', 'UZS', 'EUR', 'RUB', 'BTC'], base: 'UZS', input: '250000' });
  assert.deepEqual([state.base, state.input], ['UZS', '250000']);
});

test('upgrade to v7 keeps currencies the user added themselves', () => {
  const state = buildState({ v: 6, list: ['KZT', 'USD', 'EUR', 'TRY', 'BTC'], base: 'KZT' });
  assert.deepEqual(state.list, ['USD', 'CNY', 'UZS', 'RUB', 'KZT', 'TRY']);
  assert.equal(state.base, 'KZT');
});

const rule = state => [state.shop.svcPct, state.shop.freeBelow, state.shop.svcMin];

test('older fee settings are migrated', () => {
  const v2 = buildState({ v: 2, shop: { svcPct: '5', svcFix: '10', ship: '8', dlOn: true } });
  assert.deepEqual(rule(v2), ['3', '0', '2']);
  assert.equal(v2.shop.dlOn, false, 'delivery starts switched off');
  assert.equal('svcFix' in v2.shop, false, 'retired fields are gone');
  assert.equal('ship' in v2.shop, false);

  const custom = buildState({ v: 5, shop: { svcPct: '4', freeBelow: '100', svcMin: '1' } });
  assert.deepEqual(rule(custom), ['4', '100', '1'], 'own settings survive');
});

test('upgrade to v8: the fee rule becomes "3%, at least 2 ¥" unless the user set their own', () => {
  const wechat = buildState({ v: 7, shop: { svcPct: '3', freeBelow: '200', svcMin: '0' } });
  assert.deepEqual(rule(wechat), ['3', '0', '2'], 'the earlier default');
  const always = buildState({ v: 7, shop: { svcPct: '3,0', freeBelow: '', svcMin: '0' } });
  assert.deepEqual(rule(always), ['3', '0', '2'], 'the earlier "3% always" preset, however it was typed');

  const own = buildState({ v: 7, shop: { svcPct: '2.5', freeBelow: '200', svcMin: '0' } });
  assert.deepEqual(rule(own), ['2.5', '200', '0'], 'a rule typed by hand is kept');
  const none = buildState({ v: 7, shop: { svcPct: '0', freeBelow: '0', svcMin: '0' } });
  assert.deepEqual(rule(none), ['0', '0', '0'], '"no fee" is kept');

  // Choosing the WeChat rule again after the upgrade sticks
  const chosen = buildState({ v: 8, shop: { svcPct: '3', freeBelow: '200', svcMin: '0' } });
  assert.deepEqual(rule(chosen), ['3', '200', '0']);
});

test('the "amount was just typed" mark survives a reload and nothing else sets it', () => {
  assert.equal(buildState(null).amountFresh, false);
  assert.equal(buildState({ v: 8, amountFresh: true }).amountFresh, true);
  assert.equal(buildState({ v: 8, amountFresh: 'yes' }).amountFresh, false);
  const gone = buildState({ v: 8, list: ['USD', 'CNY'], base: 'EUR', input: '50', amountFresh: true });
  assert.equal(gone.amountFresh, false, 'the amount was reset, so there is nothing to carry over');
});

test('corrupted or hostile storage never reaches the app', () => {
  const state = buildState({
    v: STATE_VERSION,
    theme: 'pink', lang: 'xx', view: '<script>',
    list: ['USD', 'USD', '<img src=x onerror=alert(1)>', 'usd', 42, null, 'CNY'],
    base: '"><b>',
    input: { toString: () => 'x' },
    shop: { price: ['1'], priceCur: 'XXX', card: 'BTC', dlOn: 'yes', dlMethod: 'rocket', dlUnit: 'lb', dlStep: '7', dlPayCard: 1, extra: 'x' }
  });
  assert.equal(state.theme, 'dark');
  assert.equal(state.lang, 'ru');
  assert.equal(state.view, 'convert');
  assert.deepEqual(state.list, ['USD', 'CNY'], 'duplicates and junk codes are dropped');
  assert.equal(state.base, 'USD');
  assert.equal(state.input, '100');
  assert.deepEqual(state.shop, { ...SHOP_DEFAULTS });
});

test('junk instead of a state object means a clean start', () => {
  for (const junk of ['text', 42, [], true]) {
    assert.deepEqual(buildState(junk).list, ['USD', 'CNY', 'UZS', 'RUB'], JSON.stringify(junk));
  }
  assert.deepEqual(buildState({ v: STATE_VERSION, list: [] }).list, ['USD', 'CNY', 'UZS', 'RUB'], 'an empty list is refilled');
});

test('long strings from storage are cut', () => {
  const state = buildState({ v: STATE_VERSION, input: '9'.repeat(5000), shop: { price: '1'.repeat(5000) } });
  assert.equal(state.input.length, 60);
  assert.equal(state.shop.price.length, 60);
});

test('switchSource carries the amount into the new currency', () => {
  const state = { list: ['USD', 'CNY', 'UZS'], base: 'USD', input: '100' };
  assert.equal(switchSource(state, 'UZS', cv), true);
  assert.deepEqual([state.base, state.input], ['UZS', '1200000']);
  assert.equal(switchSource(state, 'USD', cv), true);
  assert.deepEqual([state.base, state.input], ['USD', '100'], 'and back without drift');
});

test('switchSource: expressions, empty input and refusals', () => {
  const expr = { list: ['USD', 'CNY'], base: 'USD', input: '10*2' };
  switchSource(expr, 'CNY', cv);
  assert.equal(expr.input, '140', 'the result of the expression is converted');

  const empty = { list: ['USD', 'CNY'], base: 'USD', input: '' };
  switchSource(empty, 'CNY', cv);
  assert.deepEqual([empty.base, empty.input], ['CNY', '']);

  const same = { list: ['USD', 'CNY'], base: 'USD', input: '5' };
  assert.equal(switchSource(same, 'USD', cv), false, 'already the source');
  assert.equal(switchSource(same, 'RUB', cv), false, 'not in the list');
  assert.deepEqual(same, { list: ['USD', 'CNY'], base: 'USD', input: '5' });

  const offline = { list: ['USD', 'CNY'], base: 'USD', input: '5' };
  switchSource(offline, 'CNY', () => null);
  assert.deepEqual([offline.base, offline.input], ['CNY', ''], 'no rate: the field is cleared, not left with a wrong number');
});

test('toggleCurrency adds, removes and never empties the list', () => {
  const state = { list: ['USD', 'CNY'], base: 'USD', input: '100' };
  assert.equal(toggleCurrency(state, 'RUB', cv), 'added');
  assert.deepEqual(state.list, ['USD', 'CNY', 'RUB']);
  assert.equal(toggleCurrency(state, 'CNY', cv), 'removed');
  assert.deepEqual(state.list, ['USD', 'RUB']);
  assert.equal(toggleCurrency(state, '<x>', cv), 'invalid');
  assert.equal(toggleCurrency(state, 'RUB', cv), 'removed');
  assert.equal(toggleCurrency(state, 'USD', cv), 'last');
  assert.deepEqual(state.list, ['USD']);
});

test('removing the source currency hands the amount to a neighbour', () => {
  const first = { list: ['USD', 'CNY', 'UZS'], base: 'USD', input: '100' };
  assert.equal(toggleCurrency(first, 'USD', cv), 'removed');
  assert.deepEqual(first, { list: ['CNY', 'UZS'], base: 'CNY', input: '700' });

  const middle = { list: ['USD', 'CNY', 'UZS'], base: 'CNY', input: '700' };
  toggleCurrency(middle, 'CNY', cv);
  assert.deepEqual(middle, { list: ['USD', 'UZS'], base: 'USD', input: '100' });
});

test('moveCurrency reorders within bounds', () => {
  const state = { list: ['USD', 'CNY', 'UZS'] };
  assert.equal(moveCurrency(state, 'UZS', -1), true);
  assert.deepEqual(state.list, ['USD', 'UZS', 'CNY']);
  assert.equal(moveCurrency(state, 'USD', 1), true);
  assert.deepEqual(state.list, ['UZS', 'USD', 'CNY']);
  assert.equal(moveCurrency(state, 'UZS', -1), false, 'already first');
  assert.equal(moveCurrency(state, 'CNY', 1), false, 'already last');
  assert.equal(moveCurrency(state, 'RUB', 1), false, 'not in the list');
  assert.deepEqual(state.list, ['UZS', 'USD', 'CNY']);
});

test('reorderCurrency puts a currency at any place, as dragging does', () => {
  const state = { list: ['USD', 'CNY', 'UZS', 'RUB'] };
  assert.equal(reorderCurrency(state, 'RUB', 0), true);
  assert.deepEqual(state.list, ['RUB', 'USD', 'CNY', 'UZS'], 'last to first');
  assert.equal(reorderCurrency(state, 'RUB', 3), true);
  assert.deepEqual(state.list, ['USD', 'CNY', 'UZS', 'RUB'], 'and back');
  assert.equal(reorderCurrency(state, 'USD', 2), true);
  assert.deepEqual(state.list, ['CNY', 'UZS', 'USD', 'RUB'], 'down two places');
  for (const [code, to] of [['USD', 2], ['USD', -1], ['USD', 4], ['USD', 1.5], ['EUR', 0], ['USD', '1']]) {
    assert.equal(reorderCurrency(state, code, to), false, `${code} → ${to}`);
  }
  assert.deepEqual(state.list, ['CNY', 'UZS', 'USD', 'RUB'], 'refusals change nothing');
});

test('delivery starts switched off on every start, a link with delivery switches it on', () => {
  const saved = buildState({}, {});
  Object.assign(saved.shop, { dlOn: true, dlWeight: '1.2', dlBig: true, dlLen: '40', dlAir: '9.5' });
  const state = buildState(JSON.parse(JSON.stringify(saved)), {});
  startWithoutDelivery(state);
  assert.equal(state.shop.dlOn, false);
  assert.equal(state.shop.dlWeight, '');
  assert.equal(state.shop.dlBig, false);
  assert.equal(state.shop.dlLen, '');
  assert.equal(state.shop.dlAir, '9.5', 'the rates stay');

  applyDeepLink(state, '?mode=purchase&price=100&cur=CNY&delivery=air&weight=2', () => true);
  assert.equal(state.shop.dlOn, true);
  assert.equal(state.shop.dlWeight, '2');
});

test('switchSource with keepAmount changes only the currency', () => {
  const state = { list: ['USD', 'CNY', 'UZS'], base: 'USD', input: '100' };
  assert.equal(switchSource(state, 'UZS', cv, { keepAmount: true }), true);
  assert.deepEqual([state.base, state.input], ['UZS', '100']);
  const expr = { list: ['USD', 'CNY'], base: 'USD', input: '10*2' };
  switchSource(expr, 'CNY', cv, { keepAmount: true });
  assert.deepEqual([expr.base, expr.input], ['CNY', '10*2'], 'an expression stays as typed');
  assert.equal(switchSource(expr, 'CNY', cv, { keepAmount: true }), false, 'already the source');
});

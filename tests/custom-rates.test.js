import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_CUSTOM_RATES, activeCustomRate, adoptLinkedRate, cleanCustomRates, customRateParam, describeCustomRate,
  rateDifference, rateValue, removeCustomRate, saveCustomRate, selectCustomRate, withCustomRate
} from '../js/core/custom-rates.js';
import { applyDeepLink, buildLink, buildQuery } from '../js/core/deep-link.js';
import { calcPurchase } from '../js/core/purchase.js';
import { convert } from '../js/core/rates.js';
import { converterShareText, purchaseShareText } from '../js/core/share-text.js';
import { buildState, SHOP_DEFAULTS } from '../js/core/state.js';
import { translate } from '../js/i18n.js';

// Round market rates: 1 USD = 7 CNY = 12 000 UZS = 80 RUB
const MARKET = { USD: 1, CNY: 7, UZS: 12000, RUB: 80 };
const close = (actual, expected, message) =>
  assert.ok(Math.abs(actual - expected) < 1e-6, `${message ?? ''} ${actual} ≉ ${expected}`);
const plain = text => text?.replace(/[\u00A0\u202F]/g, ' ');
const ru = (key, vars) => translate('ru', key, vars);

const BANK = { name: 'Капиталбанк', from: 'USD', to: 'UZS', rate: '12 950' };
const fresh = () => buildState(null);

test('a rate is read the way amounts are', () => {
  assert.equal(rateValue('12950'), 12950);
  assert.equal(rateValue('12 950'), 12950);
  assert.equal(rateValue('12950,5'), 12950.5);
  assert.equal(rateValue('100/8'), 12.5, 'a calculation is allowed');
  assert.equal(rateValue(0.5), 0.5);
  for (const bad of ['', '0', '-5', 'abc', '5+(', null, undefined, NaN, Infinity]) assert.equal(rateValue(bad), null, String(bad));
});

test('saving a new rate names it, stores a clean number and switches it on', () => {
  const state = fresh();
  assert.deepEqual(saveCustomRate(state, BANK), { ok: true, id: 'r1' });
  assert.deepEqual(state.customRates, [{ id: 'r1', name: 'Капиталбанк', from: 'USD', to: 'UZS', rate: '12950' }]);
  assert.equal(state.rateId, 'r1');
  assert.equal(activeCustomRate(state).name, 'Капиталбанк');

  saveCustomRate(state, { name: '   ', from: 'CNY', to: 'UZS', rate: '1800' });
  assert.equal(state.customRates[1].name, 'CNY → UZS', 'no name: the pair is the name');
  assert.equal(state.rateId, 'r2', 'the newest one is in use');
});

test('a rate with a wrong pair or value is refused and nothing changes', () => {
  const state = fresh();
  assert.deepEqual(saveCustomRate(state, { ...BANK, to: 'USD' }), { ok: false, error: 'pair' });
  assert.deepEqual(saveCustomRate(state, { ...BANK, from: 'usd' }), { ok: false, error: 'pair' });
  assert.deepEqual(saveCustomRate(state, { ...BANK, rate: '0' }), { ok: false, error: 'rate' });
  assert.deepEqual(saveCustomRate(state, { ...BANK, rate: 'много' }), { ok: false, error: 'rate' });
  assert.deepEqual(saveCustomRate(state, { ...BANK, id: 'r9' }), { ok: false, error: 'missing' });
  assert.deepEqual(state.customRates, []);
  assert.equal(state.rateId, '');
});

test('a saved rate can be renamed and changed; the choice stays as it was', () => {
  const state = fresh();
  saveCustomRate(state, BANK);
  saveCustomRate(state, { name: 'Малика', from: 'USD', to: 'UZS', rate: '12800' });
  assert.equal(state.rateId, 'r2');

  assert.deepEqual(saveCustomRate(state, { id: 'r1', name: 'КБ, касса', from: 'USD', to: 'UZS', rate: '13 010,5' }), { ok: true, id: 'r1' });
  assert.deepEqual(state.customRates[0], { id: 'r1', name: 'КБ, касса', from: 'USD', to: 'UZS', rate: '13010.5' });
  assert.equal(state.customRates.length, 2);
  assert.equal(state.rateId, 'r2', 'editing does not switch rates');
});

test('choosing and deleting', () => {
  const state = fresh();
  saveCustomRate(state, BANK);
  saveCustomRate(state, { name: 'Малика', from: 'USD', to: 'UZS', rate: '12800' });

  assert.equal(selectCustomRate(state, 'r1'), true);
  assert.equal(state.rateId, 'r1');
  assert.equal(selectCustomRate(state, 'r7'), false, 'no such rate');
  assert.equal(state.rateId, 'r1');
  assert.equal(selectCustomRate(state, ''), true, 'back to the market');
  assert.equal(activeCustomRate(state), null);

  selectCustomRate(state, 'r2');
  assert.equal(removeCustomRate(state, 'r1'), true);
  assert.equal(state.rateId, 'r2', 'deleting another rate keeps the choice');
  assert.equal(removeCustomRate(state, 'r2'), true);
  assert.equal(state.rateId, '', 'deleting the rate in use brings the market back');
  assert.equal(removeCustomRate(state, 'r2'), false);

  saveCustomRate(state, BANK);
  assert.equal(state.customRates[0].id, 'r1', 'a freed id is reused');
});

test('the list is limited', () => {
  const state = fresh();
  for (let n = 1; n <= MAX_CUSTOM_RATES; n++) assert.equal(saveCustomRate(state, { ...BANK, rate: String(12000 + n) }).ok, true);
  assert.deepEqual(saveCustomRate(state, BANK), { ok: false, error: 'full' });
  assert.equal(state.customRates.length, MAX_CUSTOM_RATES);
});

test('the user\'s rate replaces the market one for its pair, in both directions', () => {
  const table = withCustomRate(MARKET, { ...BANK, rate: '12950' });
  assert.equal(convert(table, 100, 'USD', 'UZS'), 1295000);
  close(convert(table, 1295000, 'UZS', 'USD'), 100);
  assert.equal(convert(table, 100, 'USD', 'CNY'), 700, 'other pairs keep the market rate');
  close(convert(table, 700, 'CNY', 'UZS'), 1295000, 'yuan → sum goes through the dollar at the user\'s rate');
  assert.equal(MARKET.UZS, 12000, 'the market table itself is untouched');
});

test('any pair can be set, whichever way round it is typed', () => {
  // "1 CNY = 1 800 UZS": the sum is re-priced, the dollar-yuan rate is not
  const yuan = withCustomRate(MARKET, { from: 'CNY', to: 'UZS', rate: '1800' });
  assert.equal(convert(yuan, 100, 'CNY', 'UZS'), 180000);
  assert.equal(convert(yuan, 1, 'USD', 'UZS'), 12600, '7 ¥ × 1 800');
  assert.equal(convert(yuan, 1, 'USD', 'CNY'), 7);

  // "1 UZS = 0.00008 USD" is the same as "1 USD = 12 500 UZS"
  const reversed = withCustomRate(MARKET, { from: 'UZS', to: 'USD', rate: '0.00008' });
  close(convert(reversed, 1, 'USD', 'UZS'), 12500);
  assert.equal(convert(reversed, 1, 'USD', 'CNY'), 7);

  const roubles = withCustomRate(MARKET, { from: 'RUB', to: 'UZS', rate: '160' });
  assert.equal(convert(roubles, 1000, 'RUB', 'UZS'), 160000);
});

test('a rate that cannot be applied leaves the market table as it is', () => {
  assert.equal(withCustomRate(MARKET, null), MARKET);
  assert.equal(withCustomRate(MARKET, { from: 'USD', to: 'KZT', rate: '500' }), MARKET, 'no market rate for the currency yet');
  assert.equal(withCustomRate(MARKET, { from: 'USD', to: 'UZS', rate: '0' }), MARKET);
  assert.equal(withCustomRate(MARKET, { from: 'USD', to: 'USD', rate: '2' }), MARKET);
  assert.equal(withCustomRate(null, BANK), null, 'no rates loaded');
});

test('difference from the market and the rate in words', () => {
  close(rateDifference(MARKET, { ...BANK, rate: '12600' }), 5, '12 600 against 12 000');
  close(rateDifference(MARKET, { ...BANK, rate: '11400' }), -5);
  assert.equal(rateDifference(MARKET, { ...BANK, rate: '12000' }), 0);
  assert.equal(rateDifference(MARKET, { from: 'USD', to: 'KZT', rate: '500' }), null);
  assert.equal(plain(describeCustomRate({ ...BANK, rate: '12950' })), '1 USD = 12 950 UZS');
  assert.equal(describeCustomRate({ ...BANK, rate: '12950.5' }, 'en-US'), '1 USD = 12,950.5 UZS');
});

test('the purchase is counted with the rate in use', () => {
  const table = withCustomRate(MARKET, { ...BANK, rate: '13000' });
  const cv = (value, from, to) => convert(table, value, from, to);
  const market = (value, from, to) => convert(MARKET, value, from, to);
  const shop = { ...SHOP_DEFAULTS, price: '700', bufPct: '0', svcPct: '0' };

  // A dollar card is charged the same; only the sums needed to buy those dollars change
  assert.equal(calcPurchase(shop, market).topup, 100);
  assert.equal(calcPurchase(shop, market).topupAlt, 1200000);
  assert.equal(calcPurchase(shop, cv).topup, 100);
  assert.equal(calcPurchase(shop, cv).topupAlt, 1300000);
  // A sum card: the order itself is converted at the user's rate
  assert.equal(calcPurchase({ ...shop, card: 'UZS' }, cv).topup, 1300000);
});

test('storage: only well-formed rates come back', () => {
  const good = { id: 'r1', name: 'Капиталбанк', from: 'USD', to: 'UZS', rate: '12950' };
  assert.deepEqual(cleanCustomRates([good]), [good]);
  assert.deepEqual(cleanCustomRates('x'), []);
  assert.deepEqual(cleanCustomRates([
    null, 'r1', { ...good, id: '<b>' }, { ...good, id: 'r2', from: 'usd' }, { ...good, id: 'r3', to: 'USD' },
    { ...good, id: 'r4', rate: '0' }, { ...good, id: 'r5', rate: 'alert(1)' }, good, { ...good, name: 'дубль' }
  ]), [good], 'junk, duplicates of an id and invalid entries are dropped');

  const [tidied] = cleanCustomRates([{ id: 'r1', name: `  <img\nsrc=x>  ${'я'.repeat(80)}`, from: 'USD', to: 'UZS', rate: '12 950,50' }]);
  assert.equal(tidied.name.length, 30, 'a long name is cut');
  assert.equal(/[\n\r\t]/.test(tidied.name), false, 'no line breaks in a name');
  assert.equal(tidied.rate, '12950.5');
  assert.equal(cleanCustomRates([{ ...good, name: 42 }])[0].name, 'USD → UZS');
  assert.equal(cleanCustomRates(Array.from({ length: 40 }, (_, n) => ({ ...good, id: `r${n + 1}` }))).length, MAX_CUSTOM_RATES);
});

test('state: rates and the choice survive a reload; a choice of a missing rate does not', () => {
  const saved = fresh();
  saveCustomRate(saved, BANK);
  const restored = buildState(structuredClone(saved));
  assert.deepEqual(restored.customRates, saved.customRates);
  assert.equal(restored.rateId, 'r1');

  assert.equal(buildState({ ...structuredClone(saved), rateId: 'r5' }).rateId, '');
  assert.equal(buildState({ ...structuredClone(saved), customRates: 'junk' }).rateId, '');
  assert.deepEqual(fresh().customRates, []);
  assert.equal(fresh().rateId, '');
});

// ---------- links ----------

test('a link carries the rate it was made with', () => {
  const sender = fresh();
  saveCustomRate(sender, BANK);
  assert.equal(customRateParam(activeCustomRate(sender)), 'USD-UZS-12950');
  const query = buildQuery(sender);
  assert.match(query, /&xr=USD-UZS-12950&xrname=/);
  assert.equal(new URLSearchParams(query).get('xrname'), 'Капиталбанк');

  const receiver = fresh();
  assert.equal(applyDeepLink(receiver, `?${query}`), true);
  assert.deepEqual(receiver.customRates, sender.customRates, 'saved under the same name');
  assert.equal(receiver.rateId, 'r1');

  sender.view = 'shop';
  assert.match(buildLink(sender, '/'), /^\/\?mode=purchase&.*&xr=USD-UZS-12950&xrname=/);
  selectCustomRate(sender, '');
  assert.equal(buildQuery(sender).includes('xr'), false, 'market rates: nothing extra in the link');
});

test('opening the same link twice does not pile up copies of the rate', () => {
  const state = fresh();
  const link = '?mode=converter&amount=100&from=USD&xr=USD-UZS-12950&xrname=Bank';
  applyDeepLink(state, link);
  applyDeepLink(state, link);
  assert.equal(state.customRates.length, 1);
  assert.equal(state.rateId, 'r1');

  // The user renamed it: their name stays
  state.customRates[0].name = 'Мой банк';
  applyDeepLink(state, link);
  assert.deepEqual(state.customRates.map(entry => entry.name), ['Мой банк']);
});

test('a link without a rate, or with a broken one, means the market rates', () => {
  const state = fresh();
  saveCustomRate(state, BANK);
  applyDeepLink(state, '?mode=converter&amount=100&from=USD');
  assert.equal(state.rateId, '', 'the numbers of a market link need the market rates');
  assert.equal(state.customRates.length, 1, 'the saved rate itself is kept');

  for (const bad of ['USD-UZS', 'USD-USD-2', 'USD-UZS-0', 'USD-UZS-abc', 'USD-UZS-1e5', 'usd_uzs_12950', '<script>-UZS-1', 'USD-UZS-12950-1', 'USD-UZS--5']) {
    selectCustomRate(state, 'r1');
    applyDeepLink(state, `?mode=converter&xr=${encodeURIComponent(bad)}`);
    assert.equal(state.rateId, '', bad);
    assert.equal(state.customRates.length, 1, bad);
  }

  applyDeepLink(state, '?mode=converter&xr=USD-ZZZ-5', code => code !== 'ZZZ');
  assert.equal(state.rateId, '', 'a currency the app does not have');

  // Without a mode the link is not applied at all, and the choice is not touched
  selectCustomRate(state, 'r1');
  assert.equal(applyDeepLink(state, '?xr=USD-UZS-1'), false);
  assert.equal(state.rateId, 'r1');
});

test('a hostile name in a link is only ever text', () => {
  const state = fresh();
  applyDeepLink(state, `?mode=converter&xr=USD-UZS-12950&xrname=${encodeURIComponent('<img src=x onerror=alert(1)>'.repeat(5))}`);
  assert.equal(state.customRates[0].name.length, 30);
  applyDeepLink(state, '?mode=converter&xr=CNY-UZS-1800');
  assert.equal(state.customRates[1].name, 'CNY → UZS', 'no name in the link');
});

test('a full list does not grow from a link', () => {
  const state = fresh();
  for (let n = 1; n <= MAX_CUSTOM_RATES; n++) saveCustomRate(state, { ...BANK, rate: String(12000 + n) });
  assert.equal(adoptLinkedRate(state, 'USD-UZS-13500', 'new'), false);
  assert.equal(state.customRates.length, MAX_CUSTOM_RATES);
  assert.equal(state.rateId, '');
  assert.equal(adoptLinkedRate(state, 'USD-UZS-12003', 'known'), true, 'a rate that is already saved is simply chosen');
  assert.equal(state.rateId, 'r3');
});

// ---------- sharing ----------

test('the shared text names the rate and its numbers match it', () => {
  const state = fresh();
  saveCustomRate(state, BANK);
  const custom = activeCustomRate(state);
  const table = withCustomRate(MARKET, custom);
  const cv = (value, from, to) => convert(table, value, from, to);

  const text = plain(converterShareText({ state, convert: cv, t: ru, locale: 'ru-RU', customRate: custom, url: 'u' }));
  assert.match(text, /🇺🇿 1 295 000 UZS — курс 12 950\n/);
  assert.match(text, /\n\n📌 Курс «Капиталбанк»: 1 USD = 12 950 UZS\n\n🔗/);

  state.view = 'shop';
  state.shop.price = '700';
  const bought = plain(purchaseShareText({ result: calcPurchase(state.shop, cv), convert: cv, t: ru, locale: 'ru-RU', customRate: custom, url: 'u' }));
  assert.match(bought, /\n📌 Курс «Капиталбанк»: 1 USD = 12 950 UZS\n\n🔗/);
  assert.match(bought, /💳 Пополнить карту: 106,00 USD ≈ 1 372 700 UZS\n/, '106 × 12 950');

  const market = plain(converterShareText({ state: fresh(), convert: (v, f, t) => convert(MARKET, v, f, t), t: ru, locale: 'ru-RU', customRate: null, url: 'u' }));
  assert.equal(market.includes('📌'), false);
});

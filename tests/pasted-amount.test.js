import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyPastedAmount, parseNumberToken, parsePastedAmount, pastedPrice, takeConverterAmount
} from '../js/core/pasted-amount.js';
import { plainNumber } from '../js/core/format.js';
import { convert } from '../js/core/rates.js';
import { SHOP_DEFAULTS } from '../js/core/state.js';

const TABLE = { USD: 1, CNY: 7, UZS: 12000, RUB: 80, EUR: 0.9, KZT: 500 };
const cv = (value, from, to) => convert(TABLE, value, from, to);
const hasRate = code => code in TABLE;
const parse = text => parsePastedAmount(text, hasRate);

test('number tokens: which separator is the decimal one', () => {
  const cases = {
    '45': 45, '45.5': 45.5, '45,5': 45.5, '89.90': 89.9, '0,125': 0.125, '0.125': 0.125,
    '1,299.00': 1299, '1.299,00': 1299, '1,299,000': 1299000, '1.299.000': 1299000,
    '1,299': 1299, '12.500': 12500, '1234,567': 1234.567, '12,34': 12.34,
    '12 990': 12990, '12 990,50': 12990.5, '1 234 567.89': 1234567.89, "1'299.90": 1299.9,
    '12\u00A0990': 12990
  };
  for (const [token, expected] of Object.entries(cases)) {
    assert.equal(parseNumberToken(token), expected, `"${token}"`);
  }
  for (const bad of ['1.2.3', '1,22,3', '12.34.56']) assert.equal(parseNumberToken(bad), null, `"${bad}"`);
});

test('prices as marketplaces and chats show them', () => {
  const cases = [
    ['¥45.50', 45.5, 'CNY'], ['￥1,299.00', 1299, 'CNY'], ['45,5 ¥', 45.5, 'CNY'], ['89.9元', 89.9, 'CNY'],
    ['券后 ¥23.8 起', 23.8, 'CNY'], ['CNY 120', 120, 'CNY'], ['120 юаней', 120, 'CNY'], ['RMB 35.00', 35, 'CNY'],
    ['$12.99', 12.99, 'USD'], ['US $5.99', 5.99, 'USD'], ['12.99 USD', 12.99, 'USD'], ['15 долларов', 15, 'USD'],
    ['12 990 сум', 12990, 'UZS'], ["150 000 so'm", 150000, 'UZS'], ['UZS 1 200 000', 1200000, 'UZS'], ['25000 сумов', 25000, 'UZS'],
    ['1 500 ₽', 1500, 'RUB'], ['1500 руб.', 1500, 'RUB'], ['1 234,56 рублей', 1234.56, 'RUB'],
    ['€20', 20, 'EUR'], ['19,99 евро', 19.99, 'EUR'], ['5 000 тг', 5000, 'KZT'], ['KZT 5000', 5000, 'KZT']
  ];
  for (const [text, value, currency] of cases) {
    assert.deepEqual(parse(text), { value, currency }, `"${text}"`);
  }
});

test('a bare number has no currency', () => {
  assert.deepEqual(parse('45.5'), { value: 45.5, currency: null });
  assert.deepEqual(parse('  1 299,00  '), { value: 1299, currency: null });
  assert.deepEqual(parse('Цена: 250'), { value: 250, currency: null });
});

test('words that only look like a currency are ignored', () => {
  assert.deepEqual(parse('Сумма: 1500'), { value: 1500, currency: null }, '"сумма" is not "сум"');
  assert.deepEqual(parse('Европа 20'), { value: 20, currency: null }, '"Европа" is not "евро"');
  assert.deepEqual(parse('SALE 99'), { value: 99, currency: null }, 'an unknown capital word is not a code');
  assert.deepEqual(parse('USA $5'), { value: 5, currency: 'USD' }, 'not an Australian dollar');
});

test('with several numbers the amount is the one next to the currency', () => {
  assert.deepEqual(parse('2 шт × ¥45.50'), { value: 45.5, currency: 'CNY' });
  assert.deepEqual(parse('Заказ 1 на сумму 12 990 сум'), { value: 12990, currency: 'UZS' });
  assert.deepEqual(parse('$19.99 за 3 штуки'), { value: 19.99, currency: 'USD' });
  assert.deepEqual(parse('¥23.8 45'), { value: 23.8, currency: 'CNY' }, 'two numbers are not glued together');
});

test('a currency the app has no rate for is not reported', () => {
  assert.deepEqual(parsePastedAmount('£30', hasRate), { value: 30, currency: null });
  assert.deepEqual(parsePastedAmount('£30'), { value: 30, currency: 'GBP' }, 'known by default');
});

test('text without an amount gives null', () => {
  for (const nothing of ['', '   ', 'привет', '¥', null, undefined, 'https://example.com/item']) {
    assert.equal(parse(nothing), null, `"${nothing}"`);
  }
});

test('hostile or huge clipboard text is harmless', () => {
  assert.deepEqual(parse('<img src=x onerror=alert(1)> 5'), { value: 1, currency: null }, 'only a number ever comes out');
  assert.equal(parse('9'.repeat(40)), null, 'absurd magnitude');
  assert.deepEqual(parse(`${'a'.repeat(5000)} ¥45`), null, 'only the beginning of a long text is read');
  const result = parse('¥45.5"><script>');
  assert.deepEqual(Object.keys(result).sort(), ['currency', 'value']);
  assert.equal(typeof result.value, 'number');
});

test('plainNumber: text for an input field', () => {
  assert.equal(plainNumber(1299), '1299');
  assert.equal(plainNumber(45.5), '45.5');
  assert.equal(plainNumber(0.1 + 0.2), '0.3', 'no float noise');
  assert.equal(plainNumber(0.0000001), '0.0000001', 'no exponent');
  assert.equal(plainNumber(0), '0');
  assert.equal(plainNumber(NaN), '');
});

test('converter: the pasted amount replaces the current one', () => {
  const state = { list: ['USD', 'CNY', 'UZS'], base: 'USD', input: '100' };
  assert.deepEqual(applyPastedAmount(state, { value: 45.5, currency: null }, hasRate), { currency: 'USD', added: false });
  assert.deepEqual(state, { list: ['USD', 'CNY', 'UZS'], base: 'USD', input: '45.5' });
});

test('converter: a recognised currency becomes the source', () => {
  const state = { list: ['USD', 'CNY', 'UZS'], base: 'USD', input: '100' };
  assert.deepEqual(applyPastedAmount(state, { value: 1299, currency: 'CNY' }, hasRate), { currency: 'CNY', added: false });
  assert.deepEqual(state, { list: ['USD', 'CNY', 'UZS'], base: 'CNY', input: '1299' });
});

test('converter: a new currency is added to the list', () => {
  const state = { list: ['USD', 'CNY'], base: 'USD', input: '100' };
  assert.deepEqual(applyPastedAmount(state, { value: 20, currency: 'EUR' }, hasRate), { currency: 'EUR', added: true });
  assert.deepEqual(state, { list: ['USD', 'CNY', 'EUR'], base: 'EUR', input: '20' });
});

test('converter: a currency without a rate does not change the source', () => {
  const state = { list: ['USD', 'CNY'], base: 'USD', input: '100' };
  assert.deepEqual(applyPastedAmount(state, { value: 30, currency: 'GBP' }, hasRate), { currency: 'USD', added: false });
  assert.deepEqual(state, { list: ['USD', 'CNY'], base: 'USD', input: '30' });
});

test('purchase: yuan, dollars and sum switch the price currency', () => {
  const shop = { ...SHOP_DEFAULTS, priceCur: 'CNY' };
  assert.deepEqual(pastedPrice({ value: 45.5, currency: null }, shop, cv), { price: '45.5', currency: 'CNY', convertedFrom: null });
  assert.deepEqual(pastedPrice({ value: 45.5, currency: 'CNY' }, shop, cv), { price: '45.5', currency: 'CNY', convertedFrom: null });
  assert.deepEqual(pastedPrice({ value: 12.99, currency: 'USD' }, shop, cv), { price: '12.99', currency: 'USD', convertedFrom: null });
  assert.deepEqual(pastedPrice({ value: 150000, currency: 'UZS' }, shop, cv), { price: '150000', currency: 'UZS', convertedFrom: null });
});

test('purchase: another currency is converted into the price currency', () => {
  const shop = { ...SHOP_DEFAULTS, priceCur: 'CNY' };
  assert.deepEqual(pastedPrice({ value: 1600, currency: 'RUB' }, shop, cv), { price: '140', currency: 'CNY', convertedFrom: 'RUB' });
  assert.deepEqual(pastedPrice({ value: 100, currency: 'RUB' }, shop, cv), { price: '8.75', currency: 'CNY', convertedFrom: 'RUB' });
  assert.deepEqual(
    pastedPrice({ value: 1600, currency: 'RUB' }, shop, () => null),
    { price: '1600', currency: 'CNY', convertedFrom: null },
    'without rates the number is pasted as it is'
  );
});

// ---------- the amount typed on the main screen goes into "Purchase" ----------

const typed = (base, input, shop = {}) => ({ base, input, amountFresh: true, shop: { ...SHOP_DEFAULTS, ...shop } });

test('the typed amount becomes the item price in its own currency', () => {
  const yuan = typed('CNY', '450', { price: '12', priceCur: 'USD' });
  assert.deepEqual(takeConverterAmount(yuan, cv), { value: 450, price: '450', currency: 'CNY', convertedFrom: null });
  assert.deepEqual([yuan.shop.price, yuan.shop.priceCur], ['450', 'CNY']);
  assert.equal(yuan.amountFresh, false);

  const dollars = typed('USD', '12,99');
  takeConverterAmount(dollars, cv);
  assert.deepEqual([dollars.shop.price, dollars.shop.priceCur], ['12.99', 'USD']);

  const sum = typed('UZS', '1 500 000');
  takeConverterAmount(sum, cv);
  assert.deepEqual([sum.shop.price, sum.shop.priceCur], ['1500000', 'UZS']);
});

test('a calculation is carried over as its result', () => {
  const state = typed('CNY', '89.9*2+15');
  takeConverterAmount(state, cv);
  assert.equal(state.shop.price, '194.8');
});

test('a currency the price field does not take is converted into the current one', () => {
  const state = typed('RUB', '1600');
  assert.deepEqual(takeConverterAmount(state, cv), { value: 1600, price: '140', currency: 'CNY', convertedFrom: 'RUB' });
  assert.deepEqual([state.shop.price, state.shop.priceCur], ['140', 'CNY']);

  const waiting = typed('RUB', '1600', { price: '30' });
  assert.equal(takeConverterAmount(waiting, () => null), null, 'no rates yet');
  assert.equal(waiting.shop.price, '30', '"1600 RUB" must not turn into "1600 CNY"');
  assert.equal(waiting.amountFresh, true, 'it is taken once the rates are there');
  takeConverterAmount(waiting, cv);
  assert.equal(waiting.shop.price, '140');
});

test('the price is taken once: going between the tabs does not overwrite it again', () => {
  const state = typed('CNY', '450');
  takeConverterAmount(state, cv);
  state.shop.price = '500'; // corrected by hand in "Purchase"
  assert.equal(takeConverterAmount(state, cv), null);
  assert.equal(state.shop.price, '500');

  state.input = '700'; // typed again on the main screen
  state.amountFresh = true;
  takeConverterAmount(state, cv);
  assert.equal(state.shop.price, '700');
});

test('nothing is carried over without a new, positive amount', () => {
  const untouched = { ...typed('USD', '100', { price: '30' }), amountFresh: false };
  assert.equal(takeConverterAmount(untouched, cv), null, 'the amount the app started with is not a price');
  assert.equal(untouched.shop.price, '30');

  for (const input of ['', '0', '5+(', '-20']) {
    const state = typed('CNY', input, { price: '30' });
    assert.equal(takeConverterAmount(state, cv), null, JSON.stringify(input));
    assert.equal(state.shop.price, '30');
    assert.equal(state.amountFresh, false);
  }
});

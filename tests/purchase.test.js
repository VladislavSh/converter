import test from 'node:test';
import assert from 'node:assert/strict';
import { formatMoney } from '../js/core/format.js';
import { calcDelivery, calcPurchase, parseNumber, paymentFee, roundWeightUp } from '../js/core/purchase.js';
import { convert } from '../js/core/rates.js';
import { SHOP_DEFAULTS } from '../js/core/state.js';

// Round numbers so every expected value can be checked by hand:
// 1 USD = 7 CNY = 12 000 UZS
const TABLE = { USD: 1, CNY: 7, UZS: 12000 };
const cv = (value, from, to) => convert(TABLE, value, from, to);
const noRates = () => null;
const shop = overrides => ({ ...SHOP_DEFAULTS, ...overrides });
const close = (actual, expected, message) =>
  assert.ok(Math.abs(actual - expected) < 1e-6, `${message ?? ''} ${actual} ≉ ${expected}`);

const ALIPAY = { percent: 3, freeBelow: 200, minimum: 0 };

test('parseNumber reads fields the same way as the amount', () => {
  assert.equal(parseNumber('3'), 3);
  assert.equal(parseNumber('2,5'), 2.5);
  assert.equal(parseNumber('2.5'), 2.5);
  assert.equal(parseNumber('1 000'), 1000, 'a thousands space must not cut the number to 1');
  assert.equal(parseNumber('2+1'), 3, 'the fields allow operators, so they are calculated');
  for (const zero of ['', 'abc', '-5', null, undefined, NaN]) assert.equal(parseNumber(zero), 0, String(zero));
});

test('payment fee: free up to 200 ¥ inclusive, then 3% of the whole amount', () => {
  assert.equal(paymentFee(45.5, ALIPAY), 0);
  assert.equal(paymentFee(200, ALIPAY), 0, 'exactly 200 ¥ is still free');
  close(paymentFee(200.01, ALIPAY), 6.0003, 'one fen over: 3% of everything');
  assert.equal(paymentFee(450, ALIPAY), 13.5);
  assert.equal(paymentFee(0, ALIPAY), 0);
  assert.equal(paymentFee(-10, ALIPAY), 0);
});

test('payment fee: other rules', () => {
  assert.equal(paymentFee(100, { percent: 3, freeBelow: 0, minimum: 0 }), 3, 'no threshold');
  assert.equal(paymentFee(100, { percent: 0, freeBelow: 0, minimum: 5 }), 0, 'zero percent means no fee at all');
  assert.equal(paymentFee(30, { percent: 3, freeBelow: 0, minimum: 2 }), 2, 'minimum applies');
  assert.equal(paymentFee(100, { percent: 3, freeBelow: 0, minimum: 2 }), 3, 'minimum does not cap');
});

// The rule the app ships with (WeChat Pay / Alipay with a foreign card):
// a payment of up to 200 ¥ INCLUSIVE costs nothing extra — there is no fixed
// "+2 ¥" — and above 200 ¥ the fee is 3% of the whole payment.
test('fee around the 200 ¥ threshold, to the fen', () => {
  const cases = [
    // price,  fee,     order total, shown fee, shown total
    ['100',    0,       100,         null,      '100,00'],
    ['199',    0,       199,         null,      '199,00'],
    ['199.99', 0,       199.99,      null,      '199,99'],
    ['200',    0,       200,         null,      '200,00'],
    ['200.01', 6.0003,  206.0103,    '6,00',    '206,01'],
    ['201',    6.03,    207.03,      '6,03',    '207,03'],
    ['1000',   30,      1030,        '30,00',   '1 030,00']
  ];
  for (const [price, fee, total, shownFee, shownTotal] of cases) {
    const r = calcPurchase(shop({ price, bufPct: '0' }), cv);
    close(r.fee.feeCny, fee, `fee for ${price} ¥`);
    close(r.orderTotal, total, `total for ${price} ¥`);
    if (fee === 0) {
      assert.equal(r.fee.feeCny, 0, `${price} ¥: exactly zero, not a rounding leftover`);
      assert.equal(r.orderTotal, Number(price), `${price} ¥: nothing is added below the threshold`);
    } else {
      assert.equal(formatMoney(r.feeInCurrency, 'CNY').replace(/\u00A0/g, ' '), shownFee);
    }
    assert.equal(formatMoney(r.orderTotal, 'CNY').replace(/[\u00A0\u202F]/g, ' '), shownTotal);
  }
});

test('the threshold is compared with the calculated price, not with its text', () => {
  const fee = price => calcPurchase(shop({ price }), cv).fee.feeCny;
  assert.equal(fee('100+100'), 0, '200 exactly');
  assert.equal(fee('40*5'), 0);
  assert.equal(fee('199,99'), 0, 'comma as the decimal separator');
  assert.ok(fee('100+100.01') > 0, '200.01');
  assert.ok(fee('200,01') > 0);
  close(fee('67*3'), 6.03, '201');
});

test('a card linked directly in Pinduoduo: 3% of any amount', () => {
  const direct = { freeBelow: '0', svcMin: '0' };
  close(calcPurchase(shop({ price: '100', ...direct }), cv).fee.feeCny, 3);
  close(calcPurchase(shop({ price: '199', ...direct }), cv).fee.feeCny, 5.97);
  close(calcPurchase(shop({ price: '200', ...direct }), cv).fee.feeCny, 6);
  close(calcPurchase(shop({ price: '201', ...direct }), cv).fee.feeCny, 6.03);
  // where "about 2 yuan on a small order" comes from: 3% of 67 ¥
  close(calcPurchase(shop({ price: '67', ...direct }), cv).fee.feeCny, 2.01);
});

test('weight is rounded up to the step', () => {
  assert.equal(roundWeightUp(0.34, 0.1), 0.4);
  assert.equal(roundWeightUp(0.3, 0.1), 0.3, 'an exact step is not bumped by float noise');
  assert.equal(roundWeightUp(0.7, 0.1), 0.7);
  assert.equal(roundWeightUp(1.2, 0.1), 1.2);
  assert.equal(roundWeightUp(1.25, 0.1), 1.3);
  assert.equal(roundWeightUp(0.34, 0.5), 0.5);
  assert.equal(roundWeightUp(1.01, 1), 2);
  assert.equal(roundWeightUp(0.34, 0), 0.34, 'no rounding');
});

test('delivery: air and road, grams and kilograms', () => {
  const air = calcDelivery(shop({ dlOn: true, dlWeight: '0.34' }));
  assert.equal(air.billedKg, 0.4);
  close(air.cost, 4);
  close(air.otherCost, 2.4);

  const road = calcDelivery(shop({ dlOn: true, dlMethod: 'auto', dlUnit: 'g', dlWeight: '1250' }));
  assert.equal(road.kg, 1.25);
  assert.equal(road.billedKg, 1.3);
  close(road.cost, 7.8);
  close(road.otherCost, 13);

  const sum = calcDelivery(shop({ dlOn: true, dlWeight: '0.3+0.45' }));
  assert.equal(sum.billedKg, 0.8, 'the weight field accepts expressions');
});

test('delivery counts nothing when it is off or has no weight', () => {
  assert.equal(calcDelivery(shop({ dlOn: false, dlWeight: '5' })).cost, 0);
  assert.equal(calcDelivery(shop({ dlOn: true, dlWeight: '' })).cost, 0);
  assert.equal(calcDelivery(shop({ dlOn: true, dlWeight: '-3' })).cost, 0);
  assert.equal(calcDelivery(shop({ dlOn: true, dlWeight: 'abc' })).cost, 0);
});

test('goods only, under the fee threshold', () => {
  const r = calcPurchase(shop({ price: '150' }), cv);
  assert.equal(r.fee.feeCny, 0);
  close(r.orderInCard, 150 / 7);
  close(r.charged, 150 / 7);
  assert.equal(r.topup, 22, '21.43 + 2% = 21.86 → 22');
  assert.equal(r.topupAlt, 264000, 'the other currency shows the same top-up');
  assert.equal(r.split, null);
  assert.equal(r.summary.showParts, false);
  close(r.summary.leftover, 22 - 150 / 7);
});

test('goods only, over the threshold, with a bank fee', () => {
  const r = calcPurchase(shop({ price: '450', bankPct: '1.5' }), cv);
  assert.equal(r.fee.feeCny, 13.5);
  assert.equal(r.orderTotal, 463.5);
  close(r.bankFee, 463.5 / 7 * 0.015);
  close(r.charged, 463.5 / 7 * 1.015);
  assert.equal(r.topup, 69);
  assert.deepEqual({ parts: r.split.parts }, { parts: 3 }, '450 ¥ fits in three payments of up to 200 ¥');
  close(r.split.saved, 13.5 / 7);
});

test('a threshold typed with a space is not misread', () => {
  const r = calcPurchase(shop({ price: '900', freeBelow: '1 000' }), cv);
  assert.equal(r.fee.freeBelow, 1000);
  assert.equal(r.fee.feeCny, 0, '900 ¥ is under a 1 000 ¥ threshold');
});

test('the minimum fee is reported as such', () => {
  const r = calcPurchase(shop({ price: '30', freeBelow: '0', svcMin: '2' }), cv);
  assert.equal(r.fee.feeCny, 2);
  assert.equal(r.fee.isMinimum, true);
  assert.equal(r.orderTotal, 32);
  assert.equal(calcPurchase(shop({ price: '450', freeBelow: '0', svcMin: '2' }), cv).fee.isMinimum, false);
});

test('delivery only, paid separately: nothing to top up', () => {
  const r = calcPurchase(shop({ dlOn: true, dlWeight: '0.34' }), cv);
  assert.equal(r.hasGoods, false);
  assert.equal(r.hasTopup, false);
  assert.equal(r.topup, null);
  assert.equal(r.deliverySeparate, true);
  assert.deepEqual(r.summary, { showParts: true, needUsd: 4, needUzs: 48000, exactUsd: 4, leftover: 0 });
});

test('delivery only, paid with a USD card: exact amount, no rate buffer', () => {
  const r = calcPurchase(shop({ dlOn: true, dlWeight: '0.34', dlPayCard: true }), cv);
  assert.equal(r.deliveryOnCard, true);
  assert.equal(r.buffer, 0, 'iPost bills in USD, a USD card converts nothing');
  assert.equal(r.topup, 4);
  assert.equal(r.summary, null);
});

test('goods and delivery, delivery paid separately: the lines add up', () => {
  const r = calcPurchase(shop({ price: '150', dlOn: true, dlWeight: '0.34' }), cv);
  assert.equal(r.topup, 22);
  assert.equal(r.summary.showParts, true);
  assert.equal(r.summary.needUsd, 22 + 4, 'top-up + delivery = total needed');
  assert.equal(r.summary.needUzs, 26 * 12000);
  close(r.summary.exactUsd, 150 / 7 + 4);
  close(r.summary.leftover, 22 - 150 / 7);
});

test('goods and delivery on one USD card', () => {
  const r = calcPurchase(shop({ price: '150', dlOn: true, dlWeight: '0.34', dlPayCard: true }), cv);
  close(r.charged, 150 / 7 + 4);
  close(r.buffer, 150 / 7 * 0.02, 'the buffer covers the goods only');
  assert.equal(r.topup, 26);
  assert.equal(r.deliverySeparate, false);
});

test('goods and delivery on one UZS card: both are converted, both get the buffer', () => {
  const r = calcPurchase(shop({ price: '150', card: 'UZS', dlOn: true, dlWeight: '0.34', dlPayCard: true }), cv);
  const charged = 150 / 7 * 12000 + 48000;
  close(r.charged, charged);
  close(r.buffer, charged * 0.02);
  assert.equal(r.topup, 312000, 'rounded up to 1 000 sum');
  assert.equal(r.topup % 1000, 0);
});

test('switching delivery off removes it from every total', () => {
  const on = calcPurchase(shop({ price: '150', dlOn: true, dlWeight: '2', dlPayCard: true }), cv);
  const off = calcPurchase(shop({ price: '150', dlOn: false, dlWeight: '2', dlPayCard: true }), cv);
  assert.ok(on.topup > off.topup);
  assert.equal(off.topup, 22);
  assert.equal(off.deliveryOnCard, false);
  assert.equal(off.deliverySeparate, false);
  assert.equal(off.delivery.cost, 0);
});

test('a price in dollars still uses the yuan fee rule', () => {
  const r = calcPurchase(shop({ price: '100', priceCur: 'USD', bufPct: '0' }), cv);
  close(r.fee.priceCny, 700);
  close(r.fee.feeCny, 21);
  close(r.feeInCurrency, 3);
  close(r.orderTotal, 103);
  assert.equal(r.topup, 103);
  assert.equal(r.summary, null, 'no buffer and no delivery: nothing to explain');
});

test('price and card both in sum', () => {
  const r = calcPurchase(shop({ price: '1000000', priceCur: 'UZS', card: 'UZS' }), cv);
  close(r.orderTotal, 1030000, '583.33 ¥ → 3% fee');
  assert.equal(r.topup, 1051000, '1 030 000 + 2% = 1 050 600 → 1 051 000');
  assert.equal(r.altCurrency, 'USD');
});

test('an exact amount is not bumped up by rounding noise', () => {
  assert.equal(calcPurchase(shop({ price: '70', bufPct: '0' }), cv).topup, 10);
  assert.equal(calcPurchase(shop({ price: '210', svcPct: '0', bufPct: '0' }), cv).topup, 30);
});

test('empty, zero, negative and junk prices produce no goods', () => {
  for (const price of ['', '0', '-50', 'abc', '5+(']) {
    const r = calcPurchase(shop({ price }), cv);
    assert.equal(r.hasGoods, false, `"${price}"`);
    assert.equal(r.topup, null, `"${price}"`);
    assert.equal(r.summary, null, `"${price}"`);
  }
});

test('without rates nothing is invented', () => {
  const r = calcPurchase(shop({ price: '150', dlOn: true, dlWeight: '1', dlPayCard: true }), noRates);
  assert.equal(r.hasGoods, false);
  assert.equal(r.topup, null);
  assert.equal(r.topupAlt, null);
  assert.equal(r.deliveryOnCard, false, 'cannot be put on the card without a rate');
  assert.equal(r.delivery.cost, 10, 'delivery itself is in USD and needs no rate');
  assert.equal(r.summary.needUsd, 10);
  assert.equal(r.summary.needUzs, null);
});

test('every reported number is finite or null', () => {
  const inputs = [
    shop({ price: '150' }), shop({ price: '99999999', bankPct: '100', bufPct: '100' }),
    shop({ price: '0.01', card: 'UZS' }), shop({ price: '1e3', dlOn: true, dlWeight: '0.001', dlStep: '0' })
  ];
  for (const input of inputs) {
    const r = calcPurchase(input, cv);
    for (const key of ['price', 'orderTotal', 'bankFee', 'charged', 'buffer', 'withBuffer']) {
      assert.ok(Number.isFinite(r[key]), `${key} = ${r[key]}`);
    }
    assert.ok(r.topup === null || Number.isFinite(r.topup));
    assert.ok(r.topup === null || r.topup >= r.charged, 'the top-up always covers the charge');
  }
});

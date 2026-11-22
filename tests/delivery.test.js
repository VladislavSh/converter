// Delivery from China, oversized parcels included. The volume rule follows the
// carrier's published one: up to 15 kg a single parcel is billed by its actual
// weight whatever the box size; heavier, by the greater of actual and
// volumetric weight (L × W × H in cm / 6000 — their own example: a 60×50×40 cm
// box "was charged by volume, up to 20 kg").
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyDeepLink, buildQuery } from '../js/core/deep-link.js';
import { calcDelivery, calcPurchase, parcelVolume } from '../js/core/purchase.js';
import { convert } from '../js/core/rates.js';
import { buildState, SHOP_DEFAULTS } from '../js/core/state.js';

const close = (actual, expected, message) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${message ?? ''} ${actual} ≉ ${expected}`);
const box = overrides => ({ ...SHOP_DEFAULTS, dlOn: true, dlBig: true, dlLen: '60', dlWid: '50', dlHei: '40', ...overrides });

test('the defaults are the published rates and rule, and all of them can be changed', () => {
  assert.deepEqual(
    [SHOP_DEFAULTS.dlAir, SHOP_DEFAULTS.dlAuto, SHOP_DEFAULTS.dlDiv, SHOP_DEFAULTS.dlVolFree, SHOP_DEFAULTS.dlBig],
    ['9.9', '6', '6000', '15', false]
  );
  const air = calcDelivery({ ...SHOP_DEFAULTS, dlOn: true, dlWeight: '2' });
  close(air.cost, 19.8, '2 kg by air at 9.9');
  close(air.otherCost, 12, 'by road at 6');
  close(calcDelivery({ ...SHOP_DEFAULTS, dlOn: true, dlWeight: '2', dlAir: '12,5' }).cost, 25, 'a rate of one\'s own');
});

test('volume and volumetric weight of a box', () => {
  const volume = parcelVolume(box());
  close(volume.volumeM3, 0.12);
  close(volume.volumetricKg, 20, '60 × 50 × 40 / 6000');
  close(parcelVolume(box({ dlDiv: '5000' })).volumetricKg, 24, 'another divisor');
  close(parcelVolume(box({ dlLen: '60,5' })).volumetricKg, 60.5 * 50 * 40 / 6000, 'decimals with a comma');
  assert.equal(parcelVolume(box({ dlBig: false })), null, 'oversize off: the sizes are ignored');
  for (const missing of [{ dlLen: '' }, { dlWid: '0' }, { dlHei: 'abc' }, { dlDiv: '0' }, { dlHei: '-5' }]) {
    assert.equal(parcelVolume(box(missing)), null, JSON.stringify(missing));
  }
});

test('up to 15 kg the box size does not matter', () => {
  const light = calcDelivery(box({ dlWeight: '4' }));
  assert.equal(light.billedKg, 4, 'their example: 4 kg in a 60×50×40 box pays for 4 kg');
  assert.equal(light.volume.ignored, true);
  assert.equal(light.volume.byVolume, false);
  close(light.cost, 4 * 9.9);
  assert.equal(calcDelivery(box({ dlWeight: '15' })).billedKg, 15, 'exactly 15 kg is still by actual weight');
});

test('heavier than 15 kg: the greater of actual and volumetric weight', () => {
  const bulky = calcDelivery(box({ dlWeight: '16' }));
  assert.equal(bulky.volume.byVolume, true);
  assert.equal(bulky.billedKg, 20, '16 kg in a box worth 20 kg pays for 20');
  close(bulky.cost, 20 * 9.9);
  close(bulky.otherCost, 20 * 6, 'the other method is compared on the same weight');

  const heavy = calcDelivery(box({ dlWeight: '25' }));
  assert.equal(heavy.billedKg, 25, 'heavier than its volume: actual weight');
  assert.deepEqual([heavy.volume.byVolume, heavy.volume.ignored], [false, false]);

  assert.equal(calcDelivery(box({ dlWeight: '16', dlUnit: 'g' })).billedKg, 0.1, '16 g is light, the box does not count');
});

test('the threshold and divisor are adjustable', () => {
  assert.equal(calcDelivery(box({ dlWeight: '4', dlVolFree: '0' })).billedKg, 20, 'no threshold: volume always counts');
  assert.equal(calcDelivery(box({ dlWeight: '16', dlVolFree: '30' })).billedKg, 16, 'a higher threshold');
  assert.equal(calcDelivery(box({ dlWeight: '16', dlDiv: '5000' })).billedKg, 24);
  assert.equal(calcDelivery(box({ dlWeight: '16', dlLen: '61', dlStep: '0.5' })).billedKg, 20.5, 'volumetric weight is rounded up too');
});

test('an oversized parcel in the whole purchase', () => {
  const cv = (value, from, to) => convert({ USD: 1, CNY: 7, UZS: 12000 }, value, from, to);
  const r = calcPurchase(box({ price: '700', dlWeight: '16', svcPct: '0', bufPct: '0' }), cv);
  close(r.delivery.cost, 198, '20 kg × 9.9');
  assert.equal(r.topup, 100, 'the card is topped up for the goods');
  close(r.summary.needUsd, 100 + 198, 'and delivery is added to the total needed');
});

test('older settings: the air rate moves to 9.9 unless it was typed by hand', () => {
  assert.equal(buildState({ v: 9, list: ['USD'], shop: { dlAir: '10' } }).shop.dlAir, '9.9');
  assert.equal(buildState({ v: 9, list: ['USD'], shop: { dlAir: '11' } }).shop.dlAir, '11');
  assert.equal(buildState({ v: 10, list: ['USD'], shop: { dlAir: '10' } }).shop.dlAir, '10', 'chosen after the change');
  const old = buildState({ v: 9, list: ['USD'], shop: { dlOn: true } }).shop;
  assert.deepEqual([old.dlBig, old.dlDiv, old.dlVolFree], [false, '6000', '15'], 'new fields get their defaults');
});

test('links carry the oversize settings; turning delivery off clears the parcel', () => {
  const sender = buildState(null);
  sender.view = 'shop';
  Object.assign(sender.shop, box({ dlWeight: '16', dlDiv: '5000' }));
  const query = buildQuery(sender);
  assert.match(query, /&big=1&len=60&wid=50&hei=40&vdiv=5000&vfree=15/);
  const receiver = buildState(null);
  applyDeepLink(receiver, `?${query}`);
  assert.deepEqual(receiver.shop, sender.shop);

  applyDeepLink(receiver, '?mode=purchase&delivery=off');
  assert.deepEqual(
    [receiver.shop.dlBig, receiver.shop.dlLen, receiver.shop.dlWid, receiver.shop.dlHei],
    [false, '', '', '']
  );
  assert.equal(receiver.shop.dlDiv, '5000', 'settings stay');
  sender.shop.dlBig = false;
  assert.equal(buildQuery(sender).includes('len='), false, 'no sizes in the link while oversize is off');
});

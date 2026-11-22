// Purchase calculator: what an order on a Chinese marketplace really costs
// and how much to put on the card. Pure functions — no DOM, no formatting.
import { evaluate } from './expression.js';

const EPSILON = 1e-9;

/**
 * Reads a non-negative number from a form field. The fields accept the same
 * input as the amount ("2,5", "1 000", "2+1"), so they are parsed the same way.
 * Anything else counts as 0.
 */
export function parseNumber(text) {
  const value = evaluate(text);
  return value != null && value >= 0 ? value : 0;
}

/**
 * Fee added for paying with a foreign card, counted per payment.
 * - A card linked in Pinduoduo itself: a percent of the amount, but not less
 *   than `minimum` yuan (3%, at least 2 ¥).
 * - Alipay / WeChat Pay: a payment up to `freeBelow` yuan inclusive is free;
 *   above it the percent applies to the WHOLE amount, not just the excess.
 */
export function paymentFee(amountCny, { percent, freeBelow, minimum }) {
  if (!(amountCny > 0) || percent <= 0) return 0;
  if (freeBelow > 0 && amountCny <= freeBelow) return 0;
  return Math.max(amountCny * percent / 100, minimum);
}

/** Rounds a weight UP to the carrier's step: 0.34 kg → 0.4 kg at a 100 g step. */
export function roundWeightUp(kg, stepKg) {
  if (!(stepKg > 0)) return kg;
  return Math.round(Math.ceil(kg / stepKg - EPSILON) * stepKg * 1000) / 1000;
}

/**
 * Volume of an oversized parcel and its volumetric weight, or null when the
 * dimensions are not filled in (or oversize is off).
 * @returns {{volumeM3: number, volumetricKg: number, divisor: number, freeKg: number}|null}
 */
export function parcelVolume(shop) {
  if (!shop.dlBig) return null;
  const [length, width, height] = [shop.dlLen, shop.dlWid, shop.dlHei].map(parseNumber);
  const divisor = parseNumber(shop.dlDiv);
  if (!(length > 0 && width > 0 && height > 0 && divisor > 0)) return null;
  const cm3 = length * width * height;
  return { volumeM3: cm3 / 1e6, volumetricKg: cm3 / divisor, divisor, freeKg: parseNumber(shop.dlVolFree) };
}

/**
 * Delivery from China, billed in USD per kg. Costs are 0 while delivery is off.
 * An oversized parcel is billed by the greater of its actual and volumetric
 * weight — unless it weighs no more than `dlVolFree` kg, then the box size does
 * not count at all.
 */
export function calcDelivery(shop) {
  const airRate = parseNumber(shop.dlAir);
  const autoRate = parseNumber(shop.dlAuto);
  const method = shop.dlMethod === 'auto' ? 'auto' : 'air';
  const rate = method === 'air' ? airRate : autoRate;
  const otherRate = method === 'air' ? autoRate : airRate;
  const result = {
    on: Boolean(shop.dlOn), method, airRate, autoRate, rate, otherRate,
    kg: 0, billedKg: 0, cost: 0, otherCost: 0, volume: null
  };
  if (!result.on) return result;

  const weight = evaluate(shop.dlWeight) || 0;
  const kg = Math.max(0, shop.dlUnit === 'g' ? weight / 1000 : weight);
  if (!(kg > 0)) return result;

  let chargeKg = kg;
  let volume = parcelVolume(shop);
  if (volume) {
    const counted = kg > volume.freeKg;
    const larger = volume.volumetricKg > kg + EPSILON;
    volume = { ...volume, counted, byVolume: counted && larger, ignored: !counted && larger };
    if (volume.byVolume) chargeKg = volume.volumetricKg;
  }
  const billedKg = roundWeightUp(chargeKg, parseFloat(shop.dlStep) || 0);
  return { ...result, kg, billedKg, cost: billedKg * rate, otherCost: billedKg * otherRate, volume };
}

/**
 * @param {object} shop  the purchase form (see SHOP_DEFAULTS in core/state.js)
 * @param {(value: number, from: string, to: string) => number|null} convert
 */
export function calcPurchase(shop, convert) {
  const currency = shop.priceCur;
  const card = shop.card;
  const altCurrency = card === 'USD' ? 'UZS' : 'USD';
  const feeRule = {
    percent: parseNumber(shop.svcPct),
    freeBelow: parseNumber(shop.freeBelow),
    minimum: parseNumber(shop.svcMin)
  };
  const bankPercent = parseNumber(shop.bankPct);
  const bufferPercent = parseNumber(shop.bufPct);
  const delivery = calcDelivery(shop);

  // The order: item price plus the payment-service fee (the rule is in yuan)
  const price = Math.max(0, evaluate(shop.price) || 0);
  const priceCny = currency === 'CNY' ? price : convert(price, currency, 'CNY');
  const feeCny = priceCny == null ? 0 : paymentFee(priceCny, feeRule);
  const fee = currency === 'CNY' ? feeCny : (convert(feeCny, 'CNY', currency) || 0);
  const orderTotal = price + fee;
  const orderInCard = orderTotal > 0 ? convert(orderTotal, currency, card) : null;
  const hasGoods = orderInCard != null && orderInCard > 0;

  // Goods are converted by the payment system, so they get the bank fee and
  // a buffer against a worse rate.
  const goodsInCard = hasGoods ? orderInCard : 0;
  const bankFee = goodsInCard * bankPercent / 100;
  const goodsCharged = goodsInCard + bankFee;
  const goodsBuffer = goodsCharged * bufferPercent / 100;

  // Delivery is paid apart from the order: to the carrier, in USD
  const deliverySeparate = delivery.cost > 0;

  const charged = goodsCharged;
  const buffer = goodsBuffer;
  const withBuffer = charged + buffer;
  const hasTopup = hasGoods;
  const step = card === 'UZS' ? 1000 : 1;
  const topup = hasTopup ? Math.ceil(withBuffer / step - EPSILON) * step : null;

  // Several payments, each within the free threshold, avoid the fee entirely
  let split = null;
  if (feeCny > 0 && feeRule.freeBelow > 0 && priceCny > feeRule.freeBelow) {
    const saved = convert(feeCny, 'CNY', card);
    if (saved != null) split = { parts: Math.ceil(priceCny / feeRule.freeBelow), saved };
  }

  // What the user needs in total: the card top-up plus delivery paid apart.
  let summary = null;
  if (deliverySeparate || (hasTopup && withBuffer > charged + EPSILON)) {
    const separateUsd = deliverySeparate ? delivery.cost : 0;
    const needUsd = (hasTopup ? convert(topup, card, 'USD') || 0 : 0) + separateUsd;
    summary = {
      showParts: deliverySeparate,
      needUsd,
      needUzs: convert(needUsd, 'USD', 'UZS'),
      exactUsd: (hasTopup ? convert(charged, card, 'USD') || 0 : 0) + separateUsd,
      leftover: hasTopup ? topup - charged : 0
    };
  }

  const rawFeeCny = priceCny > 0 ? priceCny * feeRule.percent / 100 : 0;
  return {
    currency, card, altCurrency, bankPercent, bufferPercent,
    fee: {
      ...feeRule,
      priceCny: priceCny ?? 0,
      feeCny,
      rawFeeCny,
      isMinimum: feeCny > 0 && feeRule.minimum > 0 && rawFeeCny < feeRule.minimum
    },
    price, feeInCurrency: fee, orderTotal, orderInCard, hasGoods,
    bankFee, goodsCharged,
    delivery, deliverySeparate,
    charged, buffer, withBuffer, hasTopup, topup,
    topupAlt: hasTopup ? convert(topup, card, altCurrency) : null,
    split, summary
  };
}

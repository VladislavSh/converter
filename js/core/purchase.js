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

/** iPost delivery, billed in USD per kg. Costs are 0 while delivery is off. */
export function calcDelivery(shop) {
  const airRate = parseNumber(shop.dlAir);
  const autoRate = parseNumber(shop.dlAuto);
  const method = shop.dlMethod === 'auto' ? 'auto' : 'air';
  const rate = method === 'air' ? airRate : autoRate;
  const otherRate = method === 'air' ? autoRate : airRate;
  const result = {
    on: Boolean(shop.dlOn), method, airRate, autoRate, rate, otherRate,
    kg: 0, billedKg: 0, cost: 0, otherCost: 0
  };
  if (!result.on) return result;

  const weight = evaluate(shop.dlWeight) || 0;
  const kg = Math.max(0, shop.dlUnit === 'g' ? weight / 1000 : weight);
  if (!(kg > 0)) return result;

  const billedKg = roundWeightUp(kg, parseFloat(shop.dlStep) || 0);
  return { ...result, kg, billedKg, cost: billedKg * rate, otherCost: billedKg * otherRate };
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

  // Delivery is a fixed USD bill: a USD card pays it as is; only a UZS card
  // converts it, and only then does the rate buffer apply.
  const deliveryInCard = delivery.cost > 0 ? convert(delivery.cost, 'USD', card) : null;
  const deliveryOnCard = Boolean(shop.dlPayCard) && delivery.cost > 0 && deliveryInCard > 0;
  const deliverySeparate = delivery.cost > 0 && !deliveryOnCard;
  const deliveryPart = deliveryOnCard ? deliveryInCard : 0;
  const deliveryBuffer = deliveryOnCard && card !== 'USD' ? deliveryPart * bufferPercent / 100 : 0;

  const charged = goodsCharged + deliveryPart;
  const buffer = goodsBuffer + deliveryBuffer;
  const withBuffer = charged + buffer;
  const hasTopup = hasGoods || deliveryOnCard;
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
    delivery, deliveryOnCard, deliverySeparate, deliveryPart,
    charged, buffer, withBuffer, hasTopup, topup,
    topupAlt: hasTopup ? convert(topup, card, altCurrency) : null,
    split, summary
  };
}

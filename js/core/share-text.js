// Text of a shared calculation, laid out for a chat (Telegram and the like):
// short lines, one emoji per block, the link last on a line of its own so the
// messenger makes it clickable. Pure functions — sharing itself is in ui/dom.js.
import { isCrypto } from '../data/currencies.js';
import { evaluate } from './expression.js';
import { formatAmount, formatMoney, formatNumber } from './format.js';
import { flagCountry } from './names.js';

const MAX_ROWS = 12;
const REGIONAL_INDICATOR_A = 0x1F1E6;

/** Flag emoji of the currency's country, a coin for crypto. */
export function flagEmoji(code) {
  if (isCrypto(code)) return '🪙';
  const country = flagCountry(code);
  if (!country) return '💱';
  return String.fromCodePoint(...[...country].map(letter => REGIONAL_INDICATOR_A + letter.charCodeAt(0) - 97));
}

const dateTime = (timestamp, locale) => new Date(timestamp).toLocaleString(locale, {
  day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
});

const linkBlock = (t, url) => ['', `🔗 ${t('shareOpen')}`, url];

/** Which source the numbers come from, when it is not the market. */
const sourceLine = rateNote => (rateNote ? [`📌 ${rateNote}`] : []);

/**
 * @returns {string|null} null when there is nothing to share (no amount or no rates)
 */
export function converterShareText({ state, convert, t, locale, ratesAt, rateNote, url }) {
  const { base } = state;
  const value = evaluate(state.input);
  if (value == null) return null;
  const format = (number, code) => formatAmount(number, code, { locale });

  const rows = [];
  for (const code of state.list.filter(item => item !== base).slice(0, MAX_ROWS)) {
    const converted = convert(value, base, code);
    const one = convert(1, base, code);
    if (converted == null || one == null) continue;
    // "1 USD = 0,0000166 BTC" is unreadable — tiny rates are flipped around
    const rate = one < 0.01
      ? `1 ${code} = ${format(1 / one, base)} ${base}`
      : t('shareRate', { rate: format(one, code) });
    rows.push(`${flagEmoji(code)} ${format(converted, code)} ${code} — ${rate}`);
  }
  if (!rows.length) return null;

  const lines = [`${flagEmoji(base)} ${format(value, base)} ${base} =`, '', ...rows];
  const notes = [
    ...sourceLine(rateNote),
    ...(Number.isFinite(ratesAt) ? [`🕒 ${t('shareRatesFrom', { when: dateTime(ratesAt, locale) })}`] : [])
  ];
  if (notes.length) lines.push('', ...notes);
  return [...lines, ...linkBlock(t, url)].join('\n');
}

/**
 * The lines of the purchase breakdown as plain text, shared by the screen and
 * the share message. @returns {{label: string, value: string, strong: boolean}[]}
 */
export function breakdownLines(result, { t, locale }) {
  const money = (value, code) => `${formatMoney(value, code, locale)} ${code}`;
  const percent = value => formatNumber(value, locale, 2); // "1,5" in Russian, "1.5" in English
  const { currency, card, fee } = result;
  const lines = [];
  const add = (label, value, strong = false) => lines.push({ label, value, strong });

  if (result.hasGoods) {
    add(t('shGoods'), money(result.price, currency));
    if (result.feeInCurrency > 0) {
      add(fee.isMinimum ? t('shSvcLineMin') : t('shSvcLinePct', { p: percent(fee.percent) }), `+${money(result.feeInCurrency, currency)}`);
    } else if (fee.percent > 0 && fee.freeBelow > 0) {
      add(t('shSvcLine'), t('shFreeLbl', { lim: formatNumber(fee.freeBelow, locale, 2) }));
    }
    const inCard = currency === card ? '' : ` ≈ ${money(result.orderInCard, card)}`;
    add(t('shOrder'), `${money(result.orderTotal, currency)}${inCard}`, true);
    if (result.bankPercent > 0) add(t('shBankLine', { p: percent(result.bankPercent) }), `+${money(result.bankFee, card)}`);
  }
  if (result.hasTopup) {
    add(t('shCharged'), `≈ ${money(result.charged, card)}`, true);
    if (result.buffer > 0) add(t('shBufLine', { p: percent(result.bufferPercent) }), `+${money(result.buffer, card)}`);
  }
  return lines;
}

/**
 * @param {object} options.result  what calcPurchase() returned
 * @returns {string|null} null when there is nothing to share (no price and no delivery)
 */
export function purchaseShareText({ result, convert, t, locale, rateNote, url }) {
  const { delivery, card, summary } = result;
  if (!result.hasTopup && !(delivery.cost > 0)) return null;
  const money = (value, code) => `${formatMoney(value, code, locale)} ${code}`;

  const lines = [
    result.hasGoods
      ? `🛒 ${t('sharePurchase', { price: money(result.price, result.currency) })}`
      : `🚚 ${t('dlTitle')}`,
    ''
  ];
  for (const line of breakdownLines(result, { t, locale })) lines.push(`${line.label}: ${line.value}`);
  if (result.deliverySeparate) {
    lines.push(`🚚 ${t('shareDelivery', {
      method: t(delivery.method === 'air' ? 'dlAir' : 'dlAuto').toLowerCase(),
      weight: `${formatNumber(delivery.billedKg, locale, 3)} ${t('dlKg')}`,
      cost: money(delivery.cost, 'USD')
    })}`);
  }

  lines.push('');
  if (result.hasTopup) {
    const alt = result.topupAlt == null ? '' : ` ≈ ${money(result.topupAlt, result.altCurrency)}`;
    lines.push(`💳 ${t('shTopup')}: ${money(result.topup, card)}${alt}`);
  }
  if (summary?.showParts) {
    const inSum = summary.needUzs == null ? '' : ` ≈ ${money(summary.needUzs, 'UZS')}`;
    lines.push(`🧾 ${t('sumTotal')}: ${money(summary.needUsd, 'USD')}${inSum}`);
  }

  const usdCny = convert(1, 'USD', 'CNY');
  const cnyUzs = convert(1, 'CNY', 'UZS');
  const rates = [
    usdCny == null ? '' : `1 USD = ${formatMoney(usdCny, 'CNY', locale)} CNY`,
    cnyUzs == null ? '' : `1 CNY = ${formatMoney(cnyUzs, 'CNY', locale)} UZS`
  ].filter(Boolean);
  if (rates.length) lines.push(`📊 ${rates.join(' · ')}`);
  lines.push(...sourceLine(rateNote));

  return [...lines, ...linkBlock(t, url)].join('\n');
}

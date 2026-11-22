import test from 'node:test';
import assert from 'node:assert/strict';
import { applyDeepLink, buildLink } from '../js/core/deep-link.js';
import { calcPurchase } from '../js/core/purchase.js';
import { convert } from '../js/core/rates.js';
import { breakdownLines, converterShareText, flagEmoji, purchaseShareText } from '../js/core/share-text.js';
import { buildState, SHOP_DEFAULTS } from '../js/core/state.js';
import { translate } from '../js/i18n.js';

// 1 USD = 7 CNY = 12 000 UZS = 80 RUB: every number below can be checked by hand
const TABLE = { USD: 1, CNY: 7, UZS: 12000, RUB: 80, BTC: 0.00002 };
const cv = (value, from, to) => convert(TABLE, value, from, to);
const ru = (key, vars) => translate('ru', key, vars);
const en = (key, vars) => translate('en', key, vars);
const BASE = 'https://example.com/converter/';
// Intl groups digits with non-breaking spaces; compare on ordinary ones
const plain = text => text?.replace(/[\u00A0\u202F]/g, ' ');

function converterText(overrides = {}, t = ru, locale = 'ru-RU') {
  const state = Object.assign(buildState(null), overrides);
  return plain(converterShareText({ state, convert: cv, t, locale, url: buildLink(state, BASE) }));
}

function purchaseText(shop, t = ru, locale = 'ru-RU') {
  const state = buildState(null);
  Object.assign(state, { view: 'shop', shop: { ...SHOP_DEFAULTS, dlAir: '10', ...shop } });
  return plain(purchaseShareText({ result: calcPurchase(state.shop, cv), convert: cv, t, locale, url: buildLink(state, BASE) }));
}

test('flag emoji for currencies', () => {
  assert.equal(flagEmoji('USD'), '🇺🇸');
  assert.equal(flagEmoji('CNY'), '🇨🇳');
  assert.equal(flagEmoji('UZS'), '🇺🇿');
  assert.equal(flagEmoji('EUR'), '🇪🇺');
  assert.equal(flagEmoji('BTC'), '🪙');
  assert.equal(flagEmoji('XAU'), '💱', 'no country: a neutral sign');
});

test('converter: the whole message', () => {
  assert.equal(converterText(), [
    '🇺🇸 100 USD =',
    '',
    '🇨🇳 700 CNY — курс 7',
    '🇺🇿 1 200 000 UZS — курс 12 000',
    '🇷🇺 8 000 RUB — курс 80',
    '',
    '🔗 Открыть расчёт в CartRate:',
    'https://example.com/converter/?mode=converter&amount=100&from=USD&list=USD,CNY,UZS,RUB'
  ].join('\n'));
});

test('converter: expressions are shared as their result, tiny rates are flipped', () => {
  const text = converterText({ input: '10*5', base: 'CNY', list: ['CNY', 'USD', 'BTC'] });
  assert.match(text, /^🇨🇳 50 CNY =\n/);
  assert.match(text, /🇺🇸 7,14 USD — курс 0,1429/);
  assert.match(text, /🪙 0,000142857 BTC — 1 BTC = 350 000 CNY/);
  assert.match(text, /amount=10\*5&from=CNY&list=CNY,USD,BTC$/, 'the link keeps what was typed');
});

test('converter: the date of the rates and the language', () => {
  const state = buildState(null);
  const at = new Date(2026, 10, 22, 6, 30).getTime();
  const text = plain(converterShareText({ state, convert: cv, t: en, locale: 'en-US', ratesAt: at, url: 'u' }));
  assert.match(text, /🕒 Rates from 11\/22, 06:30 AM/);
  assert.match(text, /🇨🇳 700 CNY — rate 7\n/);
  assert.match(text, /🔗 Open the calculation in CartRate:\nu$/);
});

test('converter: nothing to share without an amount or without rates', () => {
  assert.equal(converterText({ input: '' }), undefined);
  assert.equal(converterText({ input: '5+(' }), undefined);
  assert.equal(converterText({ list: ['USD'] }), undefined, 'a single currency');
  const state = buildState(null);
  assert.equal(converterShareText({ state, convert: () => null, t: ru, locale: 'ru-RU', url: 'u' }), null, 'no rates');
});

test('purchase: the whole message with the shipped fee rule', () => {
  assert.equal(purchaseText({ price: '150' }), [
    '🛒 Покупка на 150,00 CNY',
    '',
    'Товар: 150,00 CNY',
    'Комиссия оплаты (3%): +4,50 CNY',
    'Итого заказ: 154,50 CNY ≈ 22,07 USD',
    'Спишется с карты: ≈ 22,07 USD',
    'Запас на курс (2%): +0,44 USD',
    '',
    '💳 Пополнить карту: 23,00 USD ≈ 276 000 UZS',
    '📊 1 USD = 7,00 CNY · 1 CNY = 1 714,29 UZS',
    '',
    '🔗 Открыть расчёт в CartRate:',
    'https://example.com/converter/?mode=purchase&price=150&cur=CNY&card=USD&fee=3&free=0&min=2&bank=0&buffer=2&delivery=off'
  ].join('\n'));
});

test('purchase: the fee line names the minimum or the free threshold', () => {
  const small = purchaseText({ price: '30' });
  assert.match(small, /\nКомиссия оплаты \(минимум\): \+2,00 CNY\n/);
  assert.match(small, /\nИтого заказ: 32,00 CNY ≈ 4,57 USD\n/);

  const wechat = purchaseText({ price: '150', freeBelow: '200', svcMin: '0' });
  assert.match(wechat, /\nКомиссия оплаты: 0, до 200 ¥ бесплатно\n/);
  assert.match(wechat, /\n💳 Пополнить карту: 22,00 USD ≈ 264 000 UZS\n/);
  assert.match(wechat, /fee=3&free=200&min=0/);
});

test('purchase: fee, bank fee and delivery paid separately', () => {
  const text = purchaseText({ price: '450', bankPct: '1.5', dlOn: true, dlWeight: '0.34' });
  assert.match(text, /^🛒 Покупка на 450,00 CNY\n/);
  assert.match(text, /\nКомиссия оплаты \(3%\): \+13,50 CNY\n/);
  assert.match(text, /\nИтого заказ: 463,50 CNY ≈ 66,21 USD\n/);
  assert.match(text, /\nКомиссия банка \(1,5%\): \+0,99 USD\n/);
  assert.match(text, /\n🚚 Доставка, авиа, 0,4 кг: 4,00 USD \(оплата отдельно\)\n/);
  assert.match(text, /\n💳 Пополнить карту: 69,00 USD ≈ 828 000 UZS\n/);
  assert.match(text, /\n🧾 Всего понадобится: 73,00 USD ≈ 876 000 UZS\n/, '69 + 4');
  assert.match(text, /delivery=air&weight=0\.34&unit=kg&air=10&road=6&step=0\.1&big=0$/);
});

test('purchase: delivery alone, and English', () => {
  const text = purchaseText({ dlOn: true, dlMethod: 'auto', dlUnit: 'g', dlWeight: '1250' }, en, 'en-US');
  assert.match(text, /^🚚 Delivery\n/);
  assert.match(text, /\n🚚 Delivery, road, 1\.3 kg: 7\.80 USD \(paid separately\)\n/);
  assert.match(text, /\n🧾 Total needed: 7\.80 USD ≈ 93,600 UZS\n/);
  assert.equal(text.includes('💳'), false, 'nothing to top up');
});

test('purchase: nothing to share without a price and delivery', () => {
  assert.equal(purchaseText({ price: '' }), undefined);
  assert.equal(purchaseText({ price: '0' }), undefined);
  assert.equal(purchaseText({ price: '150', dlOn: true, dlWeight: '' }).includes('🚚'), false);
});

test('the message is ready for a chat: short lines, a link that opens the same numbers', () => {
  const shop = { price: '450', bankPct: '1.5', card: 'UZS', dlOn: true, dlWeight: '2' };
  const text = purchaseText(shop);
  const lines = text.split('\n');
  assert.ok(lines.slice(0, -1).every(line => line.length <= 60), 'every line of text fits a phone screen');
  assert.equal(/<[a-z]|\*\*|__|`/i.test(text), false, 'plain text: no markup a messenger could mangle');
  assert.equal(lines.at(-2), '🔗 Открыть расчёт в CartRate:');

  const link = lines.at(-1);
  assert.match(link, /^https:\/\/example\.com\/converter\/\?mode=purchase&/);
  assert.equal(/\s/.test(link), false, 'the link has no spaces, so it stays clickable');
  const opened = buildState(null);
  assert.equal(applyDeepLink(opened, new URL(link).search), true);
  assert.deepEqual(opened.shop, { ...SHOP_DEFAULTS, dlAir: '10', ...shop }, 'the link reproduces the calculation');
});

test('the screen and the message show the same breakdown', () => {
  const result = calcPurchase({ ...SHOP_DEFAULTS, price: '450', bankPct: '1.5' }, cv);
  const lines = breakdownLines(result, { t: ru, locale: 'ru-RU' });
  assert.deepEqual(lines.map(line => line.label), [
    'Товар', 'Комиссия оплаты (3%)', 'Итого заказ', 'Комиссия банка (1,5%)', 'Спишется с карты', 'Запас на курс (2%)'
  ]);
  assert.deepEqual(lines.filter(line => line.strong).map(line => line.label), ['Итого заказ', 'Спишется с карты']);
  const text = purchaseText({ price: '450', bankPct: '1.5' });
  for (const line of lines) assert.ok(text.includes(`${line.label}: ${plain(line.value)}`), line.label);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { applyDeepLink, buildQuery } from '../js/core/deep-link.js';
import {
  MAX_SOURCES, MAX_SOURCE_RATES, adoptLinkedSource, mergeSameNames, cleanSources, isSourceId, rateValue, removeSource,
  resolveSource, saveSource, selectSource, sourceParams, sourceSummary, sourceTable, sourcesFromPairs
} from '../js/core/rate-sources.js';
import { convert } from '../js/core/rates.js';
import { converterShareText } from '../js/core/share-text.js';
import { buildState } from '../js/core/state.js';
import { translate } from '../js/i18n.js';

// Round market rates: 1 USD = 7 CNY = 12 000 UZS = 80 RUB
const MARKET = { USD: 1, CNY: 7, UZS: 12000, RUB: 80 };
const near = (actual, expected, message) =>
  assert.ok(Math.abs(actual - expected) < 1e-6, `${message ?? ''} ${actual} ≉ ${expected}`);
const plain = text => text?.replace(/[\u00A0\u202F]/g, ' ');
const fresh = () => buildState(null);
const BANK = { name: 'Капиталбанк', quote: 'UZS', rates: [{ code: 'USD', rate: '12 950' }, { code: 'CNY', rate: '1800' }, { code: 'RUB', rate: '150' }] };
const with3 = table => (value, from, to) => convert(table, value, from, to);

test('a rate is read the way amounts are', () => {
  assert.equal(rateValue('12 950'), 12950);
  assert.equal(rateValue('12950,5'), 12950.5);
  assert.equal(rateValue('100/8'), 12.5);
  for (const bad of ['', '0', '-5', 'abc', null, NaN]) assert.equal(rateValue(bad), null, String(bad));
});

test('a source of one\'s own holds several currencies and is switched on when added', () => {
  const state = fresh();
  assert.deepEqual(saveSource(state, BANK), { ok: true, id: 's1' });
  assert.deepEqual(state.sources, [{
    id: 's1', name: 'Капиталбанк', quote: 'UZS',
    rates: [{ code: 'USD', rate: '12950' }, { code: 'CNY', rate: '1800' }, { code: 'RUB', rate: '150' }]
  }]);
  assert.equal(state.rateSource, 's1');

  saveSource(state, { name: ' ', quote: 'UZS', rates: [{ code: 'USD', rate: '12800' }, { code: 'CNY', rate: '' }] });
  assert.equal(state.sources[1].name, 'USD → UZS', 'no name: the currencies are the name');
  assert.deepEqual(state.sources[1].rates, [{ code: 'USD', rate: '12800' }], 'an empty row is skipped');
});

test('a source with a mistake is refused, pointing at the row', () => {
  const state = fresh();
  const rows = rates => ({ name: 'x', quote: 'UZS', rates });
  assert.deepEqual(saveSource(state, rows([{ code: 'USD', rate: '1' }, { code: 'UZS', rate: '1' }])), { ok: false, error: 'pair', row: 1 });
  assert.deepEqual(saveSource(state, rows([{ code: 'USD', rate: '1' }, { code: 'USD', rate: '2' }])), { ok: false, error: 'duplicate', row: 1 });
  assert.deepEqual(saveSource(state, rows([{ code: 'USD', rate: 'много' }])), { ok: false, error: 'rate', row: 0 });
  assert.deepEqual(saveSource(state, rows([{ code: 'USD', rate: '0' }])), { ok: false, error: 'rate', row: 0 });
  assert.deepEqual(saveSource(state, rows([{ code: 'USD', rate: '' }])), { ok: false, error: 'empty' });
  assert.deepEqual(saveSource(state, { quote: 'uzs', rates: [{ code: 'USD', rate: '1' }] }), { ok: false, error: 'quote' });
  assert.deepEqual(saveSource(state, { ...BANK, id: 's9' }), { ok: false, error: 'missing' });
  assert.deepEqual(state.sources, []);
  assert.equal(state.rateSource, 'market');
});

test('editing, choosing and deleting sources', () => {
  const state = fresh();
  saveSource(state, BANK);
  saveSource(state, { name: 'Малика', quote: 'UZS', rates: [{ code: 'USD', rate: '12800' }] });
  assert.equal(state.rateSource, 's2');

  saveSource(state, { id: 's1', name: 'КБ', quote: 'UZS', rates: [{ code: 'USD', rate: '13000' }, { code: 'KZT', rate: '25' }] });
  assert.deepEqual(state.sources[0].rates.map(entry => entry.code), ['USD', 'KZT'], 'currencies added and removed');
  assert.equal(state.rateSource, 's2', 'editing does not switch');

  for (const id of ['market', 'cbu', 'nbu', 's1']) assert.equal(selectSource(state, id), true, id);
  assert.equal(selectSource(state, 's7'), false);
  assert.equal(selectSource(state, 'evil'), false);
  assert.equal(state.rateSource, 's1');

  assert.equal(removeSource(state, 's1'), true);
  assert.equal(state.rateSource, 'market', 'deleting the source in use brings the market back');
  assert.equal(removeSource(state, 'cbu'), false, 'banks cannot be deleted');
  saveSource(state, BANK);
  assert.equal(state.sources.at(-1).id, 's1', 'a freed id is reused');
});

test('limits: sources and currencies per source', () => {
  const state = fresh();
  for (let n = 0; n < MAX_SOURCES; n++) assert.equal(saveSource(state, { ...BANK, name: `Банк ${n}` }).ok, true);
  assert.deepEqual(saveSource(state, { ...BANK, name: 'Ещё один' }), { ok: false, error: 'full' });
  const codes = ['AED', 'AMD', 'AUD', 'AZN', 'BYN', 'CAD', 'CHF', 'CNY', 'EUR', 'GBP', 'GEL', 'INR', 'JPY', 'KGS', 'KRW', 'KZT', 'PLN', 'RUB', 'THB', 'TJS', 'TRY', 'USD'];
  const many = fresh();
  saveSource(many, { name: 'all', quote: 'UZS', rates: codes.map(code => ({ code, rate: '1' })) });
  assert.equal(many.sources[0].rates.length, MAX_SOURCE_RATES);
});

test('the source\'s rates go into every conversion; other currencies keep the market ones', () => {
  const table = sourceTable(MARKET, cleanSources([{ id: 's1', ...BANK }])[0]);
  const cv = with3(table);
  assert.equal(cv(100, 'USD', 'UZS'), 1295000, 'the dollar of the source');
  near(cv(1, 'CNY', 'UZS'), 1800, 'its yuan');
  near(cv(1, 'RUB', 'UZS'), 150, 'its rouble');
  near(cv(1, 'USD', 'CNY'), 12950 / 1800, 'dollar to yuan through the source\'s sum');
  near(cv(1295000, 'UZS', 'USD'), 100, 'and back');
  assert.equal(MARKET.UZS, 12000, 'the market table itself is untouched');
});

test('without a dollar rate the sum keeps its market value', () => {
  const yuanOnly = { quote: 'UZS', rates: [{ code: 'CNY', rate: '1800' }] };
  const cv = with3(sourceTable(MARKET, yuanOnly));
  assert.equal(cv(1, 'USD', 'UZS'), 12000, 'the dollar stays at the market rate');
  near(cv(1, 'CNY', 'UZS'), 1800);
  near(cv(1, 'USD', 'CNY'), 12000 / 1800, 'so the yuan moves against the dollar');
});

test('a source quoted in another currency, and currencies the market does not have', () => {
  const inDollars = { quote: 'USD', rates: [{ code: 'CNY', rate: '0.14' }, { code: 'UZS', rate: '0.00008' }] };
  const cv = with3(sourceTable(MARKET, inDollars));
  near(cv(1, 'USD', 'UZS'), 12500);
  near(cv(1, 'CNY', 'USD'), 0.14);

  const extra = sourceTable(MARKET, { quote: 'UZS', rates: [{ code: 'USD', rate: '12000' }, { code: 'VND', rate: '0.465' }] });
  near(convert(extra, 1, 'VND', 'UZS'), 0.465, 'a currency only the source has');
  assert.equal(sourceTable(MARKET, { quote: 'XYZ', rates: [{ code: 'USD', rate: '1' }] }), MARKET, 'a quote the market lacks');
  assert.equal(sourceTable(MARKET, null), MARKET);
  assert.equal(sourceTable(null, BANK), null, 'no rates loaded');
});

test('the source in use, and a short summary of it', () => {
  const state = fresh();
  assert.deepEqual(resolveSource(state), { id: 'market', kind: 'market', source: null, missing: false });
  saveSource(state, BANK);
  assert.equal(resolveSource(state).kind, 'own');
  state.rateSource = 'gone';
  assert.equal(resolveSource(state).kind, 'market', 'an unknown id falls back to the market');
  assert.equal(plain(sourceSummary(state.sources[0])), '1 USD = 12 950 UZS · 1 CNY = 1 800 UZS · +1');
  assert.equal(plain(sourceSummary(state.sources[0], 'ru-RU', 1)), '1 USD = 12 950 UZS · +2');
  assert.equal(sourceSummary(null), '');
});

test('storage: only well-formed sources come back', () => {
  const good = { id: 's1', name: 'КБ', quote: 'UZS', rates: [{ code: 'USD', rate: '12950' }] };
  assert.deepEqual(cleanSources([good]), [good]);
  assert.deepEqual(cleanSources('junk'), []);
  assert.deepEqual(cleanSources([
    null, { ...good, id: '<b>' }, { ...good, id: 's2', quote: 'uzs' }, { ...good, id: 's3', rates: [] },
    { ...good, id: 's4', rates: [{ code: 'UZS', rate: '1' }] }, good, { ...good, name: 'дубль' }
  ]), [good], 'junk, an empty source, a rate to itself and a repeated id are dropped');
  const [tidy] = cleanSources([{ id: 's1', name: `<img>\n${'я'.repeat(80)}`, quote: 'UZS', rates: [{ code: 'USD', rate: '12 950,5' }, { code: 'USD', rate: '1' }, { code: 'EUR', rate: 'x' }] }]);
  assert.equal(tidy.name.length, 30);
  assert.deepEqual(tidy.rates, [{ code: 'USD', rate: '12950.5' }]);
});

test('state: the chosen source survives a reload, an unknown one does not', () => {
  const saved = fresh();
  saveSource(saved, BANK);
  assert.equal(buildState(structuredClone(saved)).rateSource, 's1');
  assert.equal(buildState({ ...structuredClone(saved), rateSource: 'cbu' }).rateSource, 'cbu');
  assert.equal(buildState({ ...structuredClone(saved), rateSource: 's9' }).rateSource, 'market');
  assert.equal(isSourceId(saved, 'nbu'), true);
  assert.equal(fresh().rateSource, 'market');
});

// ---------- links ----------

test('a link carries the source: a bank by name, one\'s own with its rates', () => {
  const state = fresh();
  selectSource(state, 'cbu');
  assert.deepEqual(sourceParams(state), [['src', 'cbu']]);
  assert.match(buildQuery(state), /&src=cbu$/);

  saveSource(state, BANK);
  const query = buildQuery(state);
  assert.match(query, /&src=own&srcname=.+&srcq=UZS&srcr=USD:12950,CNY:1800,RUB:150$/);
  const receiver = fresh();
  applyDeepLink(receiver, `?${query}`);
  assert.deepEqual(receiver.sources, state.sources, 'saved under the same name');
  assert.equal(receiver.rateSource, 's1');
  applyDeepLink(receiver, `?${query}`);
  assert.equal(receiver.sources.length, 1, 'opening it again does not pile up copies');

  selectSource(state, 'market');
  assert.equal(buildQuery(state).includes('src='), false);
});

test('links without a source, or with a broken one, mean the market rates', () => {
  const state = fresh();
  saveSource(state, BANK);
  applyDeepLink(state, '?mode=converter&amount=100');
  assert.equal(state.rateSource, 'market');
  assert.equal(state.sources.length, 1, 'the saved source itself is kept');

  for (const bad of ['src=evil', 'src=own', 'src=own&srcq=UZS', 'src=own&srcq=UZS&srcr=USD',
    'src=own&srcq=UZS&srcr=UZS:1', 'src=own&srcq=UZS&srcr=USD:-5', 'src=own&srcq=UZS&srcr=<b>:1']) {
    selectSource(state, 's1');
    applyDeepLink(state, `?mode=converter&${bad}`);
    assert.equal(state.rateSource, 'market', bad);
    assert.equal(state.sources.length, 1, bad);
  }

  const params = new URLSearchParams('src=own&srcq=UZS&srcr=USD:12950,ZZZ:5');
  assert.equal(adoptLinkedSource(state, params, code => code !== 'ZZZ'), true, 'an unknown currency is dropped, the rest is used');
  assert.deepEqual(state.sources.at(-1).rates, [{ code: 'USD', rate: '12950' }]);
});

test('links made by 1.9–1.12 (&xr=USD-UZS-12950) still open with their rate', () => {
  const state = fresh();
  applyDeepLink(state, '?mode=converter&xr=USD-UZS-12950&xrname=%D0%9A%D0%91');
  assert.deepEqual(state.sources, [{ id: 's1', name: 'КБ', quote: 'UZS', rates: [{ code: 'USD', rate: '12950' }] }]);
  assert.equal(state.rateSource, 's1');
});

// ---------- 1.9–1.12: single custom rates ----------

test('single custom rates of earlier versions become sources; bank ones become the banks', () => {
  const pairs = [
    { id: 'r1', name: 'Капиталбанк', from: 'USD', to: 'UZS', rate: '12990' },
    { id: 'r2', name: 'ЦБ', from: 'USD', to: 'UZS', rate: '12004.48' },
    { id: 'r3', name: 'Обменник', from: 'CNY', to: 'UZS', rate: '1800' },
    { id: 'r4', name: 'broken', from: 'USD', to: 'USD', rate: '1' }
  ];
  assert.deepEqual(sourcesFromPairs(pairs, 'r3'), {
    sources: [
      { id: 's1', name: 'Капиталбанк', quote: 'UZS', rates: [{ code: 'USD', rate: '12990' }] },
      { id: 's2', name: 'Обменник', quote: 'UZS', rates: [{ code: 'CNY', rate: '1800' }] }
    ],
    rateSource: 's2'
  });
  assert.equal(sourcesFromPairs(pairs, 'r2').rateSource, 'cbu', 'the "ЦБ" rate becomes the Central Bank source');
  assert.equal(sourcesFromPairs([{ id: 'r1', name: 'НБУ, продажа', from: 'USD', to: 'UZS', rate: '1' }], 'r1').rateSource, 'nbu');

  const upgraded = buildState({ v: 10, list: ['USD'], shop: {}, customRates: pairs, rateId: 'r1' });
  assert.deepEqual(upgraded.sources.map(source => source.name), ['Капиталбанк', 'Обменник']);
  assert.equal(upgraded.rateSource, 's1');
  assert.equal('customRates' in upgraded, false, 'the old field is gone');
});

test('a shared calculation names its source', () => {
  const ru = (key, vars) => translate('ru', key, vars);
  const state = fresh();
  const note = ru('shareSourceOwn', { name: 'Капиталбанк', rates: '1 USD = 12 950 UZS' });
  const text = plain(converterShareText({ state, convert: with3(MARKET), t: ru, locale: 'ru-RU', rateNote: note, url: 'u' }));
  assert.match(text, /\n\n📌 Курсы «Капиталбанк»: 1 USD = 12 950 UZS\n\n🔗/);
  assert.match(ru('shareSourceBank', { name: 'ЦБ Узбекистана', date: '21.11.2026' }), /^Курсы: ЦБ Узбекистана на 21\.11\.2026$/);
  const market = converterShareText({ state, convert: with3(MARKET), t: ru, locale: 'ru-RU', rateNote: null, url: 'u' });
  assert.equal(market.includes('📌'), false);
});

// ---------- one source per name ----------

test('a second source with a taken name is refused, renaming onto one too', () => {
  const state = fresh();
  saveSource(state, BANK);
  assert.deepEqual(saveSource(state, { ...BANK, name: '  капиталбанк ' }), { ok: false, error: 'name' }, 'case and spaces do not matter');
  saveSource(state, { name: 'Малика', quote: 'UZS', rates: [{ code: 'USD', rate: '12800' }] });
  assert.deepEqual(saveSource(state, { id: 's2', name: 'Капиталбанк', quote: 'UZS', rates: [{ code: 'USD', rate: '1' }] }), { ok: false, error: 'name' });
  assert.equal(saveSource(state, { id: 's1', ...BANK, rates: [{ code: 'USD', rate: '13000' }] }).ok, true, 'a source keeps its own name when edited');
  assert.deepEqual(state.sources.map(source => source.name), ['Капиталбанк', 'Малика']);
});

test('a link with a source the user already has by name updates it instead of adding a copy', () => {
  const state = fresh();
  saveSource(state, { name: 'Капиталбанк', quote: 'UZS', rates: [{ code: 'USD', rate: '12990' }] });
  selectSource(state, 'market');
  applyDeepLink(state, '?mode=banks&src=own&srcname=%D0%9A%D0%B0%D0%BF%D0%B8%D1%82%D0%B0%D0%BB%D0%B1%D0%B0%D0%BD%D0%BA&srcq=UZS&srcr=USD:12050,EUR:13310');
  assert.equal(state.sources.length, 1, 'still one "Капиталбанк"');
  assert.deepEqual(state.sources[0].rates, [{ code: 'USD', rate: '12050' }, { code: 'EUR', rate: '13310' }], 'with the rates from the link');
  assert.equal(state.rateSource, 's1');
});

test('sources already doubled by name are merged: the one in use stays, else the newest', () => {
  const kb = (id, rate) => ({ id, name: 'Капиталбанк', quote: 'UZS', rates: [{ code: 'USD', rate }] });
  const other = { id: 's2', name: 'Малика', quote: 'UZS', rates: [{ code: 'USD', rate: '12800' }] };

  const newest = mergeSameNames([kb('s1', '12990'), other, kb('s3', '12050')], 'market');
  assert.deepEqual(newest.sources.map(source => source.id), ['s3', 's2'], 'the newer "Капиталбанк" takes the place of the older');
  assert.equal(newest.rateSource, 'market');

  const used = mergeSameNames([kb('s1', '12990'), other, kb('s3', '12050')], 's1');
  assert.deepEqual(used.sources.map(source => source.id), ['s1', 's2'], 'the one in use is kept');
  assert.equal(used.rateSource, 's1');

  const usedNewer = mergeSameNames([kb('s1', '12990'), kb('s3', '12050')], 's3');
  assert.deepEqual([usedNewer.sources.map(source => source.id), usedNewer.rateSource], [['s3'], 's3']);

  const restored = buildState({ v: 11, list: ['USD'], shop: {}, sources: [kb('s1', '12990'), other, kb('s3', '12050')], rateSource: 's1' });
  assert.deepEqual(restored.sources.map(source => source.id), ['s1', 's2'], 'on start, from storage');
  assert.equal(restored.rateSource, 's1');
});

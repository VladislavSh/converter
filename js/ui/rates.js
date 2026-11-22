// "Rate" bar under the tabs and its sheet: which source every calculation
// uses — the market rates, a bank (the Central Bank, the National Bank) or a
// source of the user's own with the rates of several currencies. The logic is
// in core/rate-sources.js.
import {
  BANK_SOURCES, DEFAULT_QUOTE, MAX_SOURCES, MAX_SOURCE_RATES,
  removeSource, saveSource, selectSource, sourceSummary
} from '../core/rate-sources.js';
import { sanitizeExpression } from '../core/expression.js';
import { formatAmount } from '../core/format.js';
import { $, $$, ICONS, createSheet, escapeHtml } from './dom.js';

// Offered in the form besides the currencies of the main list
const USUAL_CURRENCIES = ['USD', 'CNY', 'RUB', 'EUR', 'KZT', 'UZS'];
const ERROR_TEXTS = {
  quote: 'srcQuoteError', pair: 'srcPairError', duplicate: 'srcDupError',
  rate: 'rateValueError', empty: 'srcEmptyError', full: 'srcFullError'
};

export function createRatesView(app, { onChange }) {
  const el = {
    bar: $('#rate-bar'),
    barName: $('#rate-bar-name'),
    barValue: $('#rate-bar-value'),
    title: $('#rate-title'),
    pick: $('#rate-pick'),
    list: $('#rate-list'),
    add: $('#rate-add'),
    form: $('#rate-form'),
    name: $('#rate-name'),
    quote: $('#rate-quote'),
    rows: $('#rate-rows'),
    addRow: $('#rate-add-row'),
    fill: $('#rate-fill'),
    error: $('#rate-error'),
    cancel: $('#rate-cancel')
  };
  const sheet = createSheet($('#rate-sheet'), $('#app'));
  let editingId = ''; // '' while a new source is being added

  const own = () => app.state.sources;
  const hasRate = code => app.marketConvert(1, 'USD', code) != null;

  const sourceName = id => app.sourceName(id);

  /** "Official rates for 21.11.2026", "Loading…" or "Not loaded". */
  function bankNote(bank) {
    const board = app.banks[bank];
    if (board) return app.t(bank === 'cbu' ? 'srcCbuNote' : 'srcNbuNote', { date: board.date });
    return app.t(app.bankStatus[bank] === 'loading' ? 'bankLoading' : 'srcNotLoaded');
  }

  // ---------- the bar ----------

  function renderBar() {
    const info = app.rateSource();
    el.bar.classList.toggle('is-custom', info.kind !== 'market');
    el.barName.textContent = sourceName(info.id);
    let value = '';
    if (info.kind === 'bank') value = info.missing ? app.t('srcNotLoaded') : app.t('srcOnDate', { date: info.source.date });
    else if (info.kind === 'own') value = sourceSummary(info.source, app.locale(), 1);
    el.barValue.textContent = value;
  }

  // ---------- the list ----------

  function itemHtml({ id, name, note, editable }) {
    const active = app.state.rateSource === id;
    return `
      <li class="rate-item${active ? ' is-on' : ''}">
        <button type="button" class="rate-item__main" role="radio" aria-checked="${active}" data-id="${id}">
          <span class="check">${ICONS.check}</span>
          <span class="rate-item__txt">
            <span class="rate-item__name">${escapeHtml(name)}</span>
            <span class="rate-item__note">${escapeHtml(note)}</span>
          </span>
        </button>
        ${editable ? `
          <button type="button" class="rate-item__act" data-edit="${id}" aria-label="${escapeHtml(app.t('srcEditOne', { name }))}">${ICONS.edit}</button>
          <button type="button" class="rate-item__act" data-delete="${id}" aria-label="${escapeHtml(app.t('srcDeleteOne', { name }))}">${ICONS.trash}</button>` : ''}
      </li>`;
  }

  function renderList() {
    el.list.innerHTML = [
      itemHtml({ id: 'market', name: sourceName('market'), note: app.t('rateMarketNote') }),
      ...BANK_SOURCES.map(bank => itemHtml({ id: bank, name: sourceName(bank), note: bankNote(bank) })),
      ...own().map(source => itemHtml({
        id: source.id, name: source.name, note: sourceSummary(source, app.locale(), 3), editable: true
      }))
    ].join('');
    el.add.hidden = own().length >= MAX_SOURCES;
  }

  function showList() {
    editingId = '';
    el.form.hidden = true;
    el.pick.hidden = false;
    el.title.textContent = app.t('ratesTitle');
    renderList();
  }

  // ---------- the form: a name, a quote currency and rows of rates ----------

  const rowEls = () => $$('[data-row]', el.rows);
  const quote = () => el.quote.value;

  function currencyOptions(chosen) {
    return [...new Set([chosen, ...USUAL_CURRENCIES, ...app.state.list])]
      .filter(code => code && (code === chosen || !app.rates || hasRate(code)))
      .map(code => `<option value="${code}"${code === chosen ? ' selected' : ''}>${code}</option>`)
      .join('');
  }

  /** The market rate as a hint inside each empty field. */
  function marketHint(code) {
    const market = app.marketConvert(1, code, quote());
    return market == null ? '0' : formatAmount(market, quote(), { plain: true });
  }

  function refreshRows() {
    for (const row of rowEls()) {
      $('.src-row__quote', row).textContent = quote();
      $('.src-row__rate', row).placeholder = marketHint($('.src-row__code', row).value);
    }
    el.addRow.hidden = rowEls().length >= MAX_SOURCE_RATES;
  }

  /** The next currency to offer: one of the usual ones not used yet. */
  function nextCode() {
    const used = rowEls().map(row => $('.src-row__code', row).value);
    return [...USUAL_CURRENCIES, ...app.state.list].find(code => code !== quote() && !used.includes(code)) ?? 'USD';
  }

  function addRow(code = nextCode(), rate = '') {
    const row = document.createElement('div');
    row.className = 'src-row';
    row.dataset.row = '';
    row.innerHTML = `
      <span class="src-row__sign">1</span>
      <select class="src-row__code" aria-label="${escapeHtml(app.t('srcCurrency'))}">${currencyOptions(code)}</select>
      <span class="src-row__sign">=</span>
      <input class="src-row__rate" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" aria-label="${escapeHtml(app.t('rateValue'))}">
      <span class="src-row__quote"></span>
      <button type="button" class="src-row__remove" data-remove aria-label="${escapeHtml(app.t('srcRemoveRow'))}">${ICONS.close}</button>`;
    $('.src-row__rate', row).value = rate;
    el.rows.append(row);
    refreshRows();
    return row;
  }

  const readRows = () => rowEls().map(row => ({ code: $('.src-row__code', row).value, rate: $('.src-row__rate', row).value }));

  function showError(key, vars = {}, row = -1) {
    el.error.textContent = key ? app.t(key, { n: MAX_SOURCES, ...vars }) : '';
    el.error.hidden = !key;
    rowEls().forEach((item, index) => item.classList.toggle('is-error', index === row));
  }

  /** @param {object} [source] a saved source to change; none = a new one */
  function showForm(source) {
    editingId = source?.id ?? '';
    el.name.value = source?.name ?? '';
    el.quote.innerHTML = currencyOptions(source?.quote ?? DEFAULT_QUOTE);
    el.rows.innerHTML = '';
    if (source) source.rates.forEach(entry => addRow(entry.code, entry.rate));
    else ['USD', 'CNY'].filter(code => code !== quote()).forEach(code => addRow(code));
    showError('');
    el.title.textContent = app.t(source ? 'srcEditTitle' : 'srcNewTitle');
    el.pick.hidden = true;
    el.form.hidden = false;
    // On touch screens the keyboard would cover half the form before it is read
    if (matchMedia('(hover: hover)').matches) el.name.focus({ preventScroll: true });
  }

  function submitForm() {
    const outcome = saveSource(app.state, {
      id: editingId || undefined, name: el.name.value, quote: quote(), rates: readRows()
    });
    if (!outcome.ok) {
      const row = outcome.row ?? -1;
      showError(ERROR_TEXTS[outcome.error] ?? 'rateValueError', { code: quote() }, row);
      (rowEls()[row]?.querySelector('.src-row__rate') ?? el.rows.querySelector('.src-row__rate'))?.focus();
      return;
    }
    const created = !editingId;
    app.save();
    onChange();
    if (created) {
      // A new source is switched on straight away: back to the numbers
      sheet.close();
      app.toast(app.t('srcSavedOn', { name: sourceName(outcome.id) }));
    } else {
      showList();
      app.toast(app.t('srcSaved'));
    }
  }

  // ---------- events ----------

  el.bar.addEventListener('click', () => {
    showList();
    sheet.open();
  });

  el.list.addEventListener('click', event => {
    const edit = event.target.closest('[data-edit]');
    const remove = event.target.closest('[data-delete]');
    const choose = event.target.closest('[data-id]');
    if (edit) {
      showForm(own().find(source => source.id === edit.dataset.edit));
    } else if (remove) {
      if (!removeSource(app.state, remove.dataset.delete)) return;
      app.save();
      onChange();
      renderList();
      app.toast(app.t('srcDeleted'));
      $('[data-id="market"]', el.list).focus();
    } else if (choose) {
      if (!selectSource(app.state, choose.dataset.id)) return;
      app.save();
      onChange();
      sheet.close();
    }
  });
  // A radio group: arrows move between the sources
  el.list.addEventListener('keydown', event => {
    const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[event.key];
    if (!step || !event.target.matches('[data-id]')) return;
    event.preventDefault();
    const radios = $$('[data-id]', el.list);
    radios[(radios.indexOf(event.target) + step + radios.length) % radios.length].focus();
  });

  el.add.addEventListener('click', () => showForm());
  el.cancel.addEventListener('click', showList);
  el.form.addEventListener('submit', event => {
    event.preventDefault();
    submitForm();
  });
  el.quote.addEventListener('change', () => {
    showError('');
    refreshRows();
  });
  el.addRow.addEventListener('click', () => {
    $('.src-row__rate', addRow()).focus();
  });
  el.rows.addEventListener('click', event => {
    const remove = event.target.closest('[data-remove]');
    if (!remove) return;
    remove.closest('[data-row]').remove();
    if (!rowEls().length) addRow();
    showError('');
    refreshRows();
  });
  el.rows.addEventListener('change', event => {
    if (event.target.matches('.src-row__code')) {
      showError('');
      refreshRows();
    }
  });
  el.rows.addEventListener('input', event => {
    if (!event.target.matches('.src-row__rate')) return;
    const clean = sanitizeExpression(event.target.value);
    if (clean !== event.target.value) event.target.value = clean;
    event.target.closest('[data-row]').classList.remove('is-error');
  });
  // Empty fields take today's market rate, to be corrected by hand
  el.fill.addEventListener('click', () => {
    for (const row of rowEls()) {
      const input = $('.src-row__rate', row);
      const market = app.marketConvert(1, $('.src-row__code', row).value, quote());
      if (!input.value.trim() && market != null) input.value = formatAmount(market, quote(), { plain: true });
    }
    showError('');
  });

  /** Called when rates arrive, the language changes or the source changes. */
  function render() {
    renderBar();
    if (sheet.isOpen() && el.form.hidden) renderList();
  }

  /** Opens the sheet on the form: a new source, or one to change (from the Rates tab). */
  function openNewSource() {
    sheet.open();
    showForm();
  }
  function openSource(id) {
    const source = own().find(item => item.id === id);
    if (!source) return;
    sheet.open();
    showForm(source);
  }

  return { render, add: openNewSource, edit: openSource };
}

// "Rate" bar under the tabs and its sheet: which source every calculation
// uses — the market rates, a bank (the Central Bank, the National Bank,
// Kapitalbank) or a source of the user's own with the rates of several
// currencies. Kapitalbank's buy and sell prices are typed in here too. The
// logic is in core/rate-sources.js.
import { RATE_SOURCES } from '../config.js';
import {
  BUILTIN_SOURCES, DEFAULT_QUOTE, DEFAULT_SIDE, KAPITAL, MAX_SOURCES, MAX_SOURCE_RATES,
  removeSource, saveKapital, saveSource, selectSource, sourceSummary
} from '../core/rate-sources.js';
import { sanitizeExpression } from '../core/expression.js';
import { formatAmount } from '../core/format.js';
import { $, $$, ICONS, createSheet, escapeHtml } from './dom.js';

// Offered in the form besides the currencies of the main list
const USUAL_CURRENCIES = ['USD', 'CNY', 'RUB', 'EUR', 'KZT', 'UZS'];
const ERROR_TEXTS = {
  quote: 'srcQuoteError', pair: 'srcPairError', duplicate: 'srcDupError',
  rate: 'rateValueError', empty: 'srcEmptyError', full: 'srcFullError', name: 'srcNameError'
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
    cancel: $('#rate-cancel'),
    nameField: $('#rate-name-field'),
    quoteField: $('#rate-quote-field'),
    kapitalHint: $('#kapital-hint'),
    kapitalSite: $('#kapital-site'),
    pairHead: $('#rate-pair-head')
  };
  el.kapitalSite.href = RATE_SOURCES.kapital.page;
  const sheet = createSheet($('#rate-sheet'), $('#app'));
  let editingId = ''; // '' while a new source is being added
  let kapitalMode = false; // the form holds Kapitalbank's buy and sell prices

  const own = () => app.state.sources;
  const hasRate = code => app.marketConvert(1, 'USD', code) != null;

  const sourceName = id => app.sourceName(id);

  // ---------- the bar ----------

  function renderBar() {
    // The order is counted by the sell prices; the converter shows both sums
    const info = app.rateSource(DEFAULT_SIDE);
    el.bar.classList.toggle('is-custom', info.kind !== 'market');
    el.barName.textContent = sourceName(info.id);
    const parts = [];
    if (info.kind === 'bank') {
      if (info.missing) parts.push(app.t(info.id === KAPITAL ? 'srcKapitalEmpty' : 'srcNotLoaded'));
      else if (info.source.date) parts.push(app.t('srcOnDate', { date: info.source.date }));
      if (info.twoSided && !info.missing) {
        parts.push(app.t(app.state.view === 'shop' ? 'sideSell' : 'sideBoth').toLocaleLowerCase(app.locale()));
      }
    } else if (info.kind === 'own') {
      parts.push(sourceSummary(info.source, app.locale(), 1));
    }
    el.barValue.textContent = parts.join(' · ');
  }

  // ---------- the list ----------

  function itemHtml({ id, name, note, editable, editOnly }) {
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
        ${editOnly ? `
          <button type="button" class="rate-item__act" data-edit="${id}" aria-label="${escapeHtml(app.t('srcEditOne', { name }))}">${ICONS.edit}</button>` : ''}
        ${editable ? `
          <button type="button" class="rate-item__act" data-edit="${id}" aria-label="${escapeHtml(app.t('srcEditOne', { name }))}">${ICONS.edit}</button>
          <button type="button" class="rate-item__act" data-delete="${id}" aria-label="${escapeHtml(app.t('srcDeleteOne', { name }))}">${ICONS.trash}</button>` : ''}
      </li>`;
  }

  function renderList() {
    el.list.innerHTML = [
      itemHtml({ id: 'market', name: sourceName('market'), note: app.t('rateMarketNote') }),
      ...BUILTIN_SOURCES.map(id => itemHtml({ id, name: sourceName(id), note: app.sourceNote(id), editOnly: id === KAPITAL })),
      ...own().map(source => itemHtml({
        id: source.id, name: source.name, note: sourceSummary(source, app.locale(), 3), editable: true
      }))
    ].join('');
    el.add.hidden = own().length >= MAX_SOURCES;
  }

  /** The form shows a source of one's own (name, quote, one rate per row) or Kapitalbank (buy and sell). */
  function setMode(kapital) {
    kapitalMode = kapital;
    el.nameField.hidden = kapital;
    el.quoteField.hidden = kapital;
    el.kapitalHint.hidden = !kapital;
    el.pairHead.hidden = !kapital;
    el.fill.hidden = kapital; // market numbers are not the bank's
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
  const quote = () => (kapitalMode ? DEFAULT_QUOTE : el.quote.value);

  function currencyOptions(chosen) {
    return [...new Set([chosen, ...USUAL_CURRENCIES, ...app.state.list])]
      .filter(code => code && (code === chosen || !app.rates || hasRate(code)))
      .filter(code => !kapitalMode || code === chosen || code !== DEFAULT_QUOTE) // Kapitalbank quotes in sums
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
      const hint = marketHint($('.src-row__code', row).value);
      const quoteLabel = $('.src-row__quote', row);
      if (quoteLabel) quoteLabel.textContent = quote();
      for (const input of $$('.src-row__rate, .src-row__sell', row)) input.placeholder = hint;
    }
    el.addRow.hidden = rowEls().length >= MAX_SOURCE_RATES;
  }

  /** The next currency to offer: one of the usual ones not used yet. */
  function nextCode() {
    const used = rowEls().map(row => $('.src-row__code', row).value);
    return [...USUAL_CURRENCIES, ...app.state.list].find(code => code !== quote() && !used.includes(code)) ?? 'USD';
  }

  function addRow(code = nextCode(), rate = '', sell = '') {
    const row = document.createElement('div');
    row.className = kapitalMode ? 'src-row src-row--pair' : 'src-row';
    row.dataset.row = '';
    if (kapitalMode) {
      const field = (cls, key) => `<input class="${cls}" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" aria-label="${escapeHtml(app.t(key))}">`;
      row.innerHTML = `
        <select class="src-row__code" aria-label="${escapeHtml(app.t('srcCurrency'))}">${currencyOptions(code)}</select>
        ${field('src-row__rate', 'sideBuy')}
        ${field('src-row__sell', 'sideSell')}
        <button type="button" class="src-row__remove" data-remove aria-label="${escapeHtml(app.t('srcRemoveRow'))}">${ICONS.close}</button>`;
      $('.src-row__rate', row).value = rate;
      $('.src-row__sell', row).value = sell;
      el.rows.append(row);
      refreshRows();
      return row;
    }
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

  const readRows = () => rowEls().map(row => ({
    code: $('.src-row__code', row).value,
    rate: $('.src-row__rate', row).value,
    buy: $('.src-row__rate', row).value,
    sell: $('.src-row__sell', row)?.value ?? ''
  }));

  function showError(key, vars = {}, row = -1) {
    el.error.textContent = key ? app.t(key, { n: MAX_SOURCES, ...vars }) : '';
    el.error.hidden = !key;
    rowEls().forEach((item, index) => item.classList.toggle('is-error', index === row));
  }

  /** @param {object} [source] a saved source to change; none = a new one */
  function showForm(source) {
    setMode(false);
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

  /** Kapitalbank's buy and sell prices, typed in from the bank's page. */
  function showKapitalForm() {
    setMode(true);
    editingId = KAPITAL;
    el.rows.innerHTML = '';
    const { rates } = app.state.kapital;
    if (rates.length) rates.forEach(entry => addRow(entry.code, entry.buy, entry.sell));
    else ['USD', 'EUR', 'RUB', 'CNY'].forEach(code => addRow(code));
    showError('');
    el.title.textContent = app.t('kapitalTitle');
    el.pick.hidden = true;
    el.form.hidden = false;
  }

  function submitKapital() {
    const outcome = saveKapital(app.state, readRows());
    if (!outcome.ok) {
      const row = outcome.row ?? -1;
      showError(ERROR_TEXTS[outcome.error] ?? 'rateValueError', { code: DEFAULT_QUOTE }, row);
      (rowEls()[row]?.querySelector('.src-row__rate') ?? el.rows.querySelector('.src-row__rate'))?.focus();
      return;
    }
    // Entered to be used: the calculations switch to the bank
    app.state.rateSource = KAPITAL;
    app.save();
    onChange();
    sheet.close();
    app.toast(app.t('srcSavedOn', { name: sourceName(KAPITAL) }));
  }

  function submitForm() {
    if (kapitalMode) {
      submitKapital();
      return;
    }
    const outcome = saveSource(app.state, {
      id: editingId || undefined, name: el.name.value, quote: quote(), rates: readRows()
    });
    if (!outcome.ok) {
      const row = outcome.row ?? -1;
      showError(ERROR_TEXTS[outcome.error] ?? 'rateValueError', { code: quote() }, row);
      if (outcome.error === 'name') el.name.focus();
      else (rowEls()[row]?.querySelector('.src-row__rate') ?? el.rows.querySelector('.src-row__rate'))?.focus();
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
      if (edit.dataset.edit === KAPITAL) showKapitalForm();
      else showForm(own().find(source => source.id === edit.dataset.edit));
    } else if (remove) {
      if (!removeSource(app.state, remove.dataset.delete)) return;
      app.save();
      onChange();
      renderList();
      app.toast(app.t('srcDeleted'));
      $('[data-id="market"]', el.list).focus();
    } else if (choose) {
      // Kapitalbank without rates: they are entered first
      if (choose.dataset.id === KAPITAL && !app.state.kapital.rates.length) {
        showKapitalForm();
        return;
      }
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
    if (!event.target.matches('.src-row__rate, .src-row__sell')) return;
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
    if (id === KAPITAL) {
      sheet.open();
      showKapitalForm();
      return;
    }
    const source = own().find(item => item.id === id);
    if (!source) return;
    sheet.open();
    showForm(source);
  }

  return { render, add: openNewSource, edit: openSource };
}

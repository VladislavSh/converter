// "Rates" tab: pick a source from the list and see its rates — the market
// rate or the National Bank and Kapitalbank from bank.uz (their buy and sell
// prices side by side, through our rates server). One button makes the shown
// source the one every calculation uses (core/rate-sources.js). The boards are
// loaded by main.js with the market rates.
import { RATE_SOURCES } from '../config.js';
import { shownBankCodes } from '../core/bank-rates.js';
import { BANK_SOURCES, BUILTIN_SOURCES, isSourceId, selectSource } from '../core/rate-sources.js';
import { formatAmount, formatNumber } from '../core/format.js';
import { currencyName, isKnownFiat } from '../core/names.js';
import { badgeHtml } from './badge.js';
import { $, $$, ICONS, createSheet, escapeHtml } from './dom.js';

const FOCUS_DELAY_MS = 260; // after the sheet's opening transition

export function createBanksView(app, { onSourceChange }) {
  const el = {
    view: $('#view-banks'),
    picker: $('#src-picker'),
    pickerName: $('#src-picker-name'),
    options: $('#src-options'),
    sub: $('#src-sub'),
    link: $('#src-link'),
    use: $('#src-use'),
    rates: $('#src-rates'),
    more: $('#bank-more')
  };
  const sheet = createSheet($('#src-sheet'), $('#app'));
  let picked = null; // the source chosen in the list; null = the one in use
  let lastInUse = app.state.rateSource;
  let expanded = false;

  const money = (value, code = 'UZS') => formatAmount(value, code, { locale: app.locale() });
  const shownId = () => (picked && isSourceId(picked) ? picked : app.state.rateSource);
  const unit = entry => (entry.nominal > 1 ? `${formatNumber(entry.nominal, app.locale(), 0)} ${entry.code}` : entry.code);
  const nameCell = entry => `<span class="bank-row__cur">${badgeHtml(entry.code)}<span class="bank-row__name"><b>${escapeHtml(unit(entry))}</b><small>${escapeHtml(currencyName(entry.code, app.state.lang))}</small></span></span>`;
  const valueRow = (entry, valueHtml) => `<li class="bank-row">${nameCell(entry)}<span class="bank-row__value">${valueHtml}</span></li>`;

  const pairHeader = () => `<li class="bank-row bank-row--pair bank-row--head" aria-hidden="true"><span></span><span class="bank-row__value">${escapeHtml(app.t('bankBuy'))}</span><span class="bank-row__value">${escapeHtml(app.t('bankSell'))}</span></li>`;

  function pairRow(entry) {
    const cell = value => (value == null ? '—' : money(value));
    return `<li class="bank-row bank-row--pair">${nameCell(entry)}
      <span class="bank-row__value"><b>${cell(entry.buy)}</b></span>
      <span class="bank-row__value"><b>${cell(entry.sell)}</b></span></li>`;
  }

  // ---------- choosing the source: a button and a sheet with the list ----------

  /** One line under a source's name: how fresh its rates are, or what is in it. */
  const noteFor = id => app.sourceNote(id);

  function optionHtml(id) {
    const shown = id === shownId();
    const tag = id === app.state.rateSource ? `<span class="rate-item__tag">${escapeHtml(app.t('srcInUseTag'))}</span>` : '';
    return `
      <li class="rate-item${shown ? ' is-on' : ''}">
        <button type="button" class="rate-item__main" role="radio" aria-checked="${shown}" data-pick="${id}" tabindex="${shown ? 0 : -1}">
          <span class="check">${ICONS.check}</span>
          <span class="rate-item__txt">
            <span class="rate-item__name">${escapeHtml(app.sourceName(id))}</span>
            <span class="rate-item__note">${escapeHtml(noteFor(id))}</span>
          </span>
          ${tag}
        </button>
      </li>`;
  }

  function renderPicker() {
    el.pickerName.textContent = app.sourceName(shownId());
    el.options.innerHTML = ['market', ...BUILTIN_SOURCES].map(optionHtml).join('');
  }

  function openPicker() {
    renderPicker();
    sheet.open();
    // The keyboard and screen readers start on the source that is shown
    setTimeout(() => $('[aria-checked="true"]', el.options)?.focus({ preventScroll: true }), FOCUS_DELAY_MS);
  }

  // ---------- the rates of the shown source ----------

  /** @returns {{sub: string, rows: string, hidden: number, link?: string}} */
  function sourceView(id) {
    const { t } = app;
    if (id === 'market') {
      if (!app.rates) return { sub: t('ratesNone'), rows: '', hidden: 0 };
      const entries = Object.keys(app.rates.rates).filter(code => code !== 'UZS' && isKnownFiat(code)).map(code => ({ code, nominal: 1 }));
      const { codes, hidden } = shownBankCodes(entries, app.state.list, expanded);
      const when = new Date(app.rates.ts).toLocaleString(app.locale(), { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
      const rows = codes.map(code => {
        const value = app.marketConvert(1, code, 'UZS');
        return valueRow({ code, nominal: 1 }, `<b>${value == null ? '—' : money(value)}</b>`);
      }).join('');
      return { sub: t('srcMarketSub', { when }), rows, hidden };
    }
    if (BANK_SOURCES.includes(id)) {
      const board = app.banks[id];
      const status = app.bankStatus[id];
      const link = RATE_SOURCES[id].page;
      if (!board) {
        return { sub: status === 'loading' ? t('bankLoading') : t('bankApiFailed'), rows: '', hidden: 0, link };
      }
      const sub = t('bankApiSub', { date: board.date || new Date(board.ts).toLocaleDateString(app.locale()) }) +
        (status === 'failed' ? ` · ${t('bankStale')}` : '');
      const { codes, hidden } = shownBankCodes(board.rates, app.state.list, expanded);
      const entry = code => board.rates.find(item => item.code === code);
      return { sub, rows: pairHeader() + codes.map(code => pairRow(entry(code))).join(''), hidden, link };
    }
    return { sub: '', rows: '', hidden: 0 };
  }

  function render() {
    // When the source in use changes (chosen here or elsewhere), the list shows it
    if (app.state.rateSource !== lastInUse) {
      lastInUse = app.state.rateSource;
      picked = null;
    }
    const id = shownId();
    renderPicker();
    const view = sourceView(id);
    el.sub.textContent = view.sub;
    el.rates.innerHTML = view.rows;
    el.link.hidden = !view.link;
    if (view.link) el.link.href = view.link;
    el.use.innerHTML = id === app.state.rateSource
      ? `<span class="bank__use is-on">${ICONS.check}${escapeHtml(app.t('bankInUse'))}</span>`
      : `<button type="button" class="bank__use" data-source="${id}">${escapeHtml(app.t('bankUseAll'))}</button>`;
    el.more.hidden = !expanded && view.hidden === 0;
    el.more.querySelector('span').textContent = expanded ? app.t('bankLess') : app.t('bankMore', { n: view.hidden });
  }

  el.picker.addEventListener('click', openPicker);
  el.options.addEventListener('click', event => {
    const option = event.target.closest('[data-pick]');
    if (!option) return;
    picked = option.dataset.pick;
    expanded = false;
    sheet.close();
    render();
  });
  // A radio group: arrows move between the sources, Home / End jump to the ends
  el.options.addEventListener('keydown', event => {
    const radios = $$('[data-pick]', el.options);
    const index = radios.indexOf(event.target);
    if (index < 0) return;
    const next = { ArrowDown: index + 1, ArrowRight: index + 1, ArrowUp: index - 1, ArrowLeft: index - 1, Home: 0, End: radios.length - 1 }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    radios[(next + radios.length) % radios.length].focus();
  });
  el.more.addEventListener('click', () => {
    expanded = !expanded;
    render();
  });
  el.view.addEventListener('click', event => {
    const button = event.target.closest('[data-source]');
    if (!button || !selectSource(app.state, button.dataset.source)) return;
    app.save();
    onSourceChange();
    app.toast(app.t('srcSavedOn', { name: app.sourceName(button.dataset.source) }));
  });

  return { render };
}

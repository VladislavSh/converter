// "Rates" tab: pick a source from the list and see its rates — the market
// rates, the Central Bank, the National Bank or a source of one's own. One
// button makes the shown source the one every calculation uses
// (core/rate-sources.js). The boards are loaded by main.js with the market rates.
import { RATE_SOURCES } from '../config.js';
import { shownBankCodes } from '../core/bank-rates.js';
import { BANK_SOURCES, isSourceId, selectSource } from '../core/rate-sources.js';
import { formatAmount, formatNumber } from '../core/format.js';
import { currencyName, isKnownFiat } from '../core/names.js';
import { badgeHtml } from './badge.js';
import { $, ICONS, escapeHtml } from './dom.js';

export function createBanksView(app, { onSourceChange, onAddSource, onEditSource }) {
  const el = {
    view: $('#view-banks'),
    select: $('#src-select'),
    sub: $('#src-sub'),
    link: $('#src-link'),
    edit: $('#src-edit'),
    use: $('#src-use'),
    rates: $('#src-rates'),
    more: $('#bank-more'),
    add: $('#src-add')
  };
  let picked = null; // the source chosen in the list; null = the one in use
  let lastInUse = app.state.rateSource;
  let expanded = false;

  const money = (value, code = 'UZS') => formatAmount(value, code, { locale: app.locale() });
  const shownId = () => (picked && isSourceId(app.state, picked) ? picked : app.state.rateSource);
  const unit = entry => (entry.nominal > 1 ? `${formatNumber(entry.nominal, app.locale(), 0)} ${entry.code}` : entry.code);
  const nameCell = entry => `<span class="bank-row__cur">${badgeHtml(entry.code)}<span class="bank-row__name"><b>${escapeHtml(unit(entry))}</b><small>${escapeHtml(currencyName(entry.code, app.state.lang))}</small></span></span>`;
  const valueRow = (entry, valueHtml) => `<li class="bank-row">${nameCell(entry)}<span class="bank-row__value">${valueHtml}</span></li>`;

  function cbuRow(entry) {
    const arrow = entry.diff > 0 ? '▲' : '▼';
    const diff = entry.diff ? `<small class="${entry.diff > 0 ? 'is-up' : 'is-down'}">${arrow} ${money(Math.abs(entry.diff))}</small>` : '';
    return valueRow(entry, `<b>${money(entry.rate)}</b>${diff}`);
  }

  function nbuRow(entry) {
    const cell = value => (value == null ? '—' : money(value));
    return `<li class="bank-row bank-row--pair">${nameCell(entry)}
      <span class="bank-row__value"><b>${cell(entry.buy)}</b></span>
      <span class="bank-row__value"><b>${cell(entry.sell)}</b></span></li>`;
  }

  // ---------- the list of sources ----------

  function renderSelect() {
    const ids = ['market', ...BANK_SOURCES, ...app.state.sources.map(source => source.id)];
    const label = id => {
      const name = id === 'market' ? `${app.sourceName(id)} — ${app.t('srcMarketTag')}` : app.sourceName(id);
      return id === app.state.rateSource ? `✓ ${name}` : name;
    };
    el.select.innerHTML = ids.map(id => `<option value="${id}">${escapeHtml(label(id))}</option>`).join('');
    el.select.value = shownId();
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
        return { sub: status === 'loading' ? t('bankLoading') : t(id === 'nbu' ? 'bankNbuFailed' : 'bankFailed'), rows: '', hidden: 0, link };
      }
      const sub = t(id === 'cbu' ? 'bankCbuSub' : 'bankNbuSub', { date: board.date || new Date(board.ts).toLocaleDateString(app.locale()) }) +
        (status === 'failed' ? ` · ${t('bankStale')}` : '');
      const { codes, hidden } = shownBankCodes(board.rates, app.state.list, expanded);
      const entry = code => board.rates.find(item => item.code === code);
      const header = id === 'nbu'
        ? `<li class="bank-row bank-row--pair bank-row--head" aria-hidden="true"><span></span><span class="bank-row__value">${escapeHtml(t('bankBuy'))}</span><span class="bank-row__value">${escapeHtml(t('bankSell'))}</span></li>`
        : '';
      return { sub, rows: header + codes.map(code => (id === 'cbu' ? cbuRow : nbuRow)(entry(code))).join(''), hidden, link };
    }
    const own = app.state.sources.find(source => source.id === id);
    if (!own) return { sub: '', rows: '', hidden: 0 };
    const suffix = own.quote === 'UZS' ? '' : ` ${own.quote}`;
    const rows = own.rates.map(({ code, rate }) => valueRow({ code, nominal: 1 }, `<b>${money(Number(rate), own.quote)}${suffix}</b>`)).join('');
    return { sub: t('srcOwnSub', { quote: own.quote }), rows, hidden: 0 };
  }

  function render() {
    // When the source in use changes (chosen here or elsewhere), the list shows it
    if (app.state.rateSource !== lastInUse) {
      lastInUse = app.state.rateSource;
      picked = null;
    }
    const id = shownId();
    renderSelect();
    const view = sourceView(id);
    el.sub.textContent = view.sub;
    el.rates.innerHTML = view.rows;
    el.link.hidden = !view.link;
    if (view.link) el.link.href = view.link;
    el.edit.hidden = BANK_SOURCES.includes(id) || id === 'market';
    el.use.innerHTML = id === app.state.rateSource
      ? `<span class="bank__use is-on">${ICONS.check}${escapeHtml(app.t('bankInUse'))}</span>`
      : `<button type="button" class="bank__use" data-source="${id}">${escapeHtml(app.t('bankUseAll'))}</button>`;
    el.more.hidden = !expanded && view.hidden === 0;
    el.more.querySelector('span').textContent = expanded ? app.t('bankLess') : app.t('bankMore', { n: view.hidden });
  }

  el.select.addEventListener('change', () => {
    picked = el.select.value;
    expanded = false;
    render();
  });
  el.more.addEventListener('click', () => {
    expanded = !expanded;
    render();
  });
  el.edit.addEventListener('click', () => onEditSource(shownId()));
  el.add.addEventListener('click', () => onAddSource());
  el.view.addEventListener('click', event => {
    const button = event.target.closest('[data-source]');
    if (!button || !selectSource(app.state, button.dataset.source)) return;
    app.save();
    onSourceChange();
    app.toast(app.t('srcSavedOn', { name: app.sourceName(button.dataset.source) }));
  });

  return { render };
}

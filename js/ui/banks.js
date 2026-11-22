// "Banks" tab: the official rates of the Central Bank of Uzbekistan and the
// buy/sell board of the National Bank. Each bank is a rate source: one button
// makes all its rates the ones every calculation uses (core/rate-sources.js).
// The boards themselves are loaded by main.js together with the market rates.
import { RATE_SOURCES } from '../config.js';
import { shownBankCodes } from '../core/bank-rates.js';
import { selectSource } from '../core/rate-sources.js';
import { formatAmount, formatNumber } from '../core/format.js';
import { currencyName } from '../core/names.js';
import { badgeHtml } from './badge.js';
import { $, ICONS, escapeHtml } from './dom.js';

export function createBanksView(app, { onSourceChange }) {
  const el = {
    view: $('#view-banks'),
    more: $('#bank-more'),
    cbu: { sub: $('#bank-cbu-sub'), use: $('#bank-cbu-use'), rates: $('#bank-cbu-rates'), link: $('#bank-cbu-link') },
    nbu: { sub: $('#bank-nbu-sub'), use: $('#bank-nbu-use'), rates: $('#bank-nbu-rates'), link: $('#bank-nbu-link') }
  };
  el.cbu.link.href = RATE_SOURCES.cbu.page;
  el.nbu.link.href = RATE_SOURCES.nbu.page;
  let expanded = false;

  const money = value => formatAmount(value, 'UZS', { locale: app.locale() });
  const unit = entry => (entry.nominal === 1 ? entry.code : `${formatNumber(entry.nominal, app.locale(), 0)} ${entry.code}`);
  const nameCell = entry => `<span class="bank-row__cur">${badgeHtml(entry.code)}<span class="bank-row__name"><b>${escapeHtml(unit(entry))}</b><small>${escapeHtml(currencyName(entry.code, app.state.lang))}</small></span></span>`;

  function cbuRow(entry) {
    const arrow = entry.diff > 0 ? '▲' : '▼';
    const diff = entry.diff ? `<small class="${entry.diff > 0 ? 'is-up' : 'is-down'}">${arrow} ${money(Math.abs(entry.diff))}</small>` : '';
    return `<li class="bank-row">${nameCell(entry)}<span class="bank-row__value"><b>${money(entry.rate)}</b>${diff}</span></li>`;
  }

  function nbuRow(entry) {
    const cell = value => (value == null ? '—' : money(value));
    return `<li class="bank-row bank-row--pair">${nameCell(entry)}
      <span class="bank-row__value"><b>${cell(entry.buy)}</b></span>
      <span class="bank-row__value"><b>${cell(entry.sell)}</b></span></li>`;
  }

  /** "Calculate with these rates", or a mark that they are in use. */
  function useHtml(bank) {
    if (app.state.rateSource === bank) return `<span class="bank__use is-on">${ICONS.check}${escapeHtml(app.t('bankInUse'))}</span>`;
    return `<button type="button" class="bank__use" data-source="${bank}">${escapeHtml(app.t('bankUseAll'))}</button>`;
  }

  /** @returns {number} how many currencies stay hidden until "Show all" */
  function renderBoard(bank, row, header) {
    const board = app.banks[bank];
    const part = el[bank];
    const status = app.bankStatus[bank];
    if (!board) {
      part.sub.textContent = status === 'loading' ? app.t('bankLoading') : app.t(bank === 'nbu' ? 'bankNbuFailed' : 'bankFailed');
      part.use.innerHTML = '';
      part.rates.innerHTML = '';
      return 0;
    }
    const when = board.date || new Date(board.ts).toLocaleDateString(app.locale());
    part.sub.textContent = app.t(bank === 'cbu' ? 'bankCbuSub' : 'bankNbuSub', { date: when }) +
      (status === 'failed' ? ` · ${app.t('bankStale')}` : '');
    part.use.innerHTML = useHtml(bank);
    const { codes, hidden } = shownBankCodes(board.rates, app.state.list, expanded);
    part.rates.innerHTML = header + codes.map(code => row(board.rates.find(entry => entry.code === code))).join('');
    return hidden;
  }

  function render() {
    const nbuHeader = `<li class="bank-row bank-row--pair bank-row--head" aria-hidden="true"><span></span>
      <span class="bank-row__value">${escapeHtml(app.t('bankBuy'))}</span><span class="bank-row__value">${escapeHtml(app.t('bankSell'))}</span></li>`;
    const hidden = Math.max(renderBoard('cbu', cbuRow, ''), renderBoard('nbu', nbuRow, nbuHeader));
    el.more.hidden = !expanded && hidden === 0;
    el.more.querySelector('span').textContent = expanded ? app.t('bankLess') : app.t('bankMore', { n: hidden });
  }

  el.more.addEventListener('click', () => {
    expanded = !expanded;
    render();
  });
  el.view.addEventListener('click', event => {
    const button = event.target.closest('[data-source]');
    if (!button || !selectSource(app.state, button.dataset.source)) return;
    app.save();
    onSourceChange();
    app.toast(app.t('srcSavedOn', { name: app.t(button.dataset.source === 'cbu' ? 'bankCbu' : 'bankNbuSell') }));
  });

  return { render };
}

// "Banks" tab: the official rates of the Central Bank of Uzbekistan and the
// buy/sell board of the National Bank. "Use" makes one of them the rate the
// calculations run on (a saved rate of the user's own, see core/custom-rates.js).
import { RATE_SOURCES, STORAGE_KEYS, TIMING } from '../config.js';
import { restoreBankCache, shownBankCodes } from '../core/bank-rates.js';
import { MAX_CUSTOM_RATES, activeCustomRate, useNamedRate } from '../core/custom-rates.js';
import { formatAmount, formatNumber } from '../core/format.js';
import { currencyName } from '../core/names.js';
import { loadBankBoard } from '../services/bank-rates-api.js';
import { readJson, writeJson } from '../services/storage.js';
import { badgeHtml } from './badge.js';
import { $, escapeHtml } from './dom.js';

export function createBanksView(app, { onRateChange }) {
  const el = {
    cbuSub: $('#bank-cbu-sub'),
    cbuRates: $('#bank-cbu-rates'),
    cbuLink: $('#bank-cbu-link'),
    nbuSub: $('#bank-nbu-sub'),
    nbuRates: $('#bank-nbu-rates'),
    nbuLink: $('#bank-nbu-link'),
    more: $('#bank-more')
  };
  el.cbuLink.href = RATE_SOURCES.cbu.page;
  el.nbuLink.href = RATE_SOURCES.nbu.page;

  let boards = restoreBankCache(readJson(STORAGE_KEYS.banks));
  const failed = { cbu: false, nbu: false };
  const loading = { cbu: false, nbu: false };
  let expanded = false;

  const money = value => formatAmount(value, 'UZS', { locale: app.locale() });

  /** The name a bank rate gets among the user's rates, and whether it is the one in use. */
  const rateName = bank => app.t(bank === 'cbu' ? 'bankCbuRate' : 'bankNbuRate');
  function inUse(bank, code) {
    const custom = activeCustomRate(app.state);
    return Boolean(custom) && custom.name === rateName(bank) && custom.from === code && custom.to === 'UZS';
  }

  function useButton(bank, code, perUnit) {
    if (perUnit == null) return '<span class="bank-row__use"></span>';
    if (inUse(bank, code)) return `<span class="bank-row__use is-on">${escapeHtml(app.t('bankInUse'))}</span>`;
    const label = app.t('bankUseAria', { bank: rateName(bank), rate: `1 ${code} = ${money(perUnit)} UZS` });
    return `<button type="button" class="bank-row__use" data-use="${bank}" data-code="${code}" data-rate="${perUnit}" aria-label="${escapeHtml(label)}">${escapeHtml(app.t('bankUse'))}</button>`;
  }

  const unit = entry => (entry.nominal === 1 ? entry.code : `${formatNumber(entry.nominal, app.locale(), 0)} ${entry.code}`);
  const nameCell = entry => `<span class="bank-row__cur">${badgeHtml(entry.code)}<span class="bank-row__name"><b>${escapeHtml(unit(entry))}</b><small>${escapeHtml(currencyName(entry.code, app.state.lang))}</small></span></span>`;

  function cbuRow(entry) {
    const arrow = entry.diff > 0 ? '▲' : entry.diff < 0 ? '▼' : '';
    const diff = entry.diff ? `<small class="${entry.diff > 0 ? 'is-up' : 'is-down'}">${arrow} ${money(Math.abs(entry.diff))}</small>` : '';
    return `<li class="bank-row">${nameCell(entry)}
      <span class="bank-row__value"><b>${money(entry.rate)}</b>${diff}</span>
      ${useButton('cbu', entry.code, entry.rate / entry.nominal)}</li>`;
  }

  function nbuRow(entry) {
    const cell = value => (value == null ? '—' : money(value));
    return `<li class="bank-row bank-row--pair">${nameCell(entry)}
      <span class="bank-row__value"><b>${cell(entry.buy)}</b></span>
      <span class="bank-row__value"><b>${cell(entry.sell)}</b></span>
      ${useButton('nbu', entry.code, entry.sell)}</li>`;
  }

  function renderBoard(bank, row, list, sub, header) {
    const board = boards[bank];
    if (!board) {
      sub.textContent = loading[bank] ? app.t('bankLoading') : app.t(bank === 'nbu' ? 'bankNbuFailed' : 'bankFailed');
      list.innerHTML = '';
      return 0;
    }
    const when = board.date || new Date(board.ts).toLocaleDateString(app.locale());
    sub.textContent = app.t(bank === 'cbu' ? 'bankCbuSub' : 'bankNbuSub', { date: when }) +
      (failed[bank] && !loading[bank] ? ` · ${app.t('bankStale')}` : '');
    const { codes, hidden } = shownBankCodes(board.rates, app.state.list, expanded);
    list.innerHTML = header + codes.map(code => row(board.rates.find(entry => entry.code === code))).join('');
    return hidden;
  }

  function render() {
    const nbuHeader = `<li class="bank-row bank-row--pair bank-row--head" aria-hidden="true"><span></span>
      <span class="bank-row__value">${escapeHtml(app.t('bankBuy'))}</span><span class="bank-row__value">${escapeHtml(app.t('bankSell'))}</span><span></span></li>`;
    const hidden = Math.max(
      renderBoard('cbu', cbuRow, el.cbuRates, el.cbuSub, ''),
      renderBoard('nbu', nbuRow, el.nbuRates, el.nbuSub, boards.nbu ? nbuHeader : '')
    );
    el.more.hidden = !expanded && hidden === 0;
    el.more.querySelector('span').textContent = expanded ? app.t('bankLess') : app.t('bankMore', { n: hidden });
  }

  /** Loads one bank's board; keeps the cached one when the bank does not answer. */
  async function refreshBank(bank, force) {
    const board = boards[bank];
    if (loading[bank] || (!force && board && Date.now() - board.ts < TIMING.ratesStaleMs)) return;
    loading[bank] = true;
    render();
    const fresh = await loadBankBoard(bank);
    loading[bank] = false;
    failed[bank] = !fresh;
    if (fresh) {
      boards = { ...boards, [bank]: fresh };
      writeJson(STORAGE_KEYS.banks, boards);
    }
    render();
  }

  /** Each bank is shown as soon as it answers: a slow one never holds the other back. */
  const refresh = ({ force = false } = {}) => Promise.all(['cbu', 'nbu'].map(bank => refreshBank(bank, force)));

  el.more.addEventListener('click', () => {
    expanded = !expanded;
    render();
  });
  $('#view-banks').addEventListener('click', event => {
    const button = event.target.closest('[data-use]');
    if (!button) return;
    const bank = button.dataset.use;
    const outcome = useNamedRate(app.state, {
      name: rateName(bank), from: button.dataset.code, to: 'UZS', rate: Number(button.dataset.rate)
    });
    if (!outcome.ok) {
      app.toast(app.t(outcome.error === 'full' ? 'rateFullError' : 'rateValueError', { n: MAX_CUSTOM_RATES }));
      return;
    }
    app.save();
    onRateChange();
    render();
    app.toast(app.t('rateSavedOn', { name: rateName(bank) }));
  });

  return { render, refresh };
}

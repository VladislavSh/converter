// Bottom sheet for editing the currency list: search, add/remove, and
// reordering on the "Selected" tab.
import { CRYPTO, POPULAR } from '../data/currencies.js';
import { currencyName, isKnownFiat } from '../core/names.js';
import { moveCurrency, toggleCurrency } from '../core/currency-list.js';
import { badgeHtml } from './badge.js';
import { $, $$, ICONS, escapeHtml } from './dom.js';

const FOCUS_DELAY_MS = 250; // after the opening transition

export function createPickerView(app, { onListChange }) {
  const el = {
    app: $('#app'),
    sheet: $('#sheet'),
    search: $('#search'),
    list: $('#picker'),
    tabs: $$('.tab', $('#sheet'))
  };
  let tab = 'all';
  let opener = null;

  const isOpen = () => el.sheet.classList.contains('is-open');

  function matcher(query) {
    if (!query) return () => true;
    return code => code.toLowerCase().includes(query) ||
      currencyName(code, 'ru').toLowerCase().includes(query) ||
      currencyName(code, 'en').toLowerCase().includes(query);
  }

  /** @returns {[title: string, codes: string[]][]} */
  function sections() {
    const { state, t } = app;
    if (tab === 'selected') return [['', state.list]];

    const known = app.rates ? Object.keys(app.rates.rates).filter(isKnownFiat) : [...POPULAR];
    const popular = POPULAR.filter(code => known.includes(code));
    const collator = new Intl.Collator(app.locale());
    const other = known
      .filter(code => !POPULAR.includes(code))
      .map(code => [code, currencyName(code, state.lang)])
      .sort((a, b) => collator.compare(a[1], b[1]))
      .map(([code]) => code);

    const out = [];
    if (tab !== 'crypto') out.push([t('popular'), popular]);
    if (tab !== 'fiat') out.push([t('crypto'), CRYPTO.map(c => c.code)]);
    if (tab !== 'crypto') out.push([t('otherFiat'), other]);
    return out;
  }

  function moveButtons(code) {
    const { list } = app.state;
    const index = list.indexOf(code);
    const button = (delta, label, icon, disabled) =>
      `<button type="button" data-move="${delta}" aria-label="${escapeHtml(app.t(label, { code }))}"${disabled ? ' disabled' : ''}>${icon}</button>`;
    return `<span class="pick__move">${button(-1, 'moveUp', ICONS.up, index === 0)}${button(1, 'moveDown', ICONS.down, index === list.length - 1)}</span>`;
  }

  function itemHtml(code) {
    const selected = app.state.list.includes(code);
    return `
      <li class="pick${selected ? ' is-on' : ''}" data-code="${code}" role="checkbox" aria-checked="${selected}" tabindex="0">
        ${badgeHtml(code)}
        <span class="pick__txt">
          <span class="pick__code">${code}</span>
          <span class="pick__name">${escapeHtml(currencyName(code, app.state.lang))}</span>
        </span>
        ${tab === 'selected' ? moveButtons(code) : ''}
        <span class="check">${ICONS.check}</span>
      </li>`;
  }

  function render() {
    const matches = matcher(el.search.value.trim().toLowerCase());
    const html = sections()
      .map(([title, codes]) => [title, codes.filter(matches)])
      .filter(([, codes]) => codes.length)
      .map(([title, codes]) =>
        (title ? `<li class="picker__section" role="presentation">${escapeHtml(title)}</li>` : '') +
        codes.map(itemHtml).join(''))
      .join('');
    el.list.innerHTML = html || `<li class="picker__empty" role="presentation">${escapeHtml(app.t('nothing'))}</li>`;
  }

  function open() {
    opener = document.activeElement;
    el.search.value = '';
    render();
    el.list.scrollTop = 0;
    el.sheet.classList.add('is-open');
    el.sheet.setAttribute('aria-hidden', 'false');
    el.app.inert = true; // keep focus and screen readers inside the dialog
    // On touch screens focusing the search would pop the keyboard over the list
    const target = matchMedia('(hover: hover)').matches ? el.search : $('[data-close].icon-btn', el.sheet);
    setTimeout(() => { if (isOpen()) target.focus({ preventScroll: true }); }, FOCUS_DELAY_MS);
  }

  function close() {
    if (!isOpen()) return;
    el.sheet.classList.remove('is-open');
    el.sheet.setAttribute('aria-hidden', 'true');
    el.app.inert = false;
    opener?.focus?.({ preventScroll: true });
    opener = null;
  }

  function toggle(item) {
    const code = item.dataset.code;
    const outcome = toggleCurrency(app.state, code, app.convert);
    if (outcome === 'last') {
      app.toast(app.t('keepOne'));
      return;
    }
    if (outcome === 'invalid') return;
    app.save();
    if (tab === 'selected') {
      // The removed currency leaves this tab; focus goes to the row that took its place
      const index = $$('.pick', el.list).indexOf(item);
      render();
      const rows = $$('.pick', el.list);
      rows[Math.min(index, rows.length - 1)]?.focus();
    } else {
      const selected = outcome === 'added';
      item.classList.toggle('is-on', selected);
      item.setAttribute('aria-checked', String(selected));
    }
    onListChange();
  }

  function move(code, delta) {
    if (!moveCurrency(app.state, code, delta)) return;
    app.save();
    render();
    onListChange();
    // Keep the keyboard on the same arrow, or on its twin when it became disabled
    const row = $(`.pick[data-code="${code}"]`, el.list);
    const same = $(`[data-move="${delta}"]`, row);
    (same.disabled ? $(`[data-move="${-delta}"]`, row) : same).focus();
  }

  el.sheet.addEventListener('click', event => {
    if (event.target.closest('[data-close]')) close();
  });
  el.search.addEventListener('input', render);
  el.tabs.forEach(button => button.addEventListener('click', () => {
    tab = button.dataset.tab;
    el.tabs.forEach(other => {
      const active = other === button;
      other.classList.toggle('is-active', active);
      other.setAttribute('aria-pressed', String(active));
    });
    render();
    el.list.scrollTop = 0;
  }));
  el.list.addEventListener('click', event => {
    const item = event.target.closest('.pick');
    if (!item) return;
    const arrow = event.target.closest('[data-move]');
    if (arrow) move(item.dataset.code, Number(arrow.dataset.move));
    else toggle(item);
  });
  el.list.addEventListener('keydown', event => {
    if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('.pick')) {
      event.preventDefault();
      toggle(event.target);
    }
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && isOpen()) close();
  });

  return { open, close, render: () => { if (isOpen()) render(); } };
}

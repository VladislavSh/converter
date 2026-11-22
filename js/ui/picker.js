// Bottom sheet for editing the currency list: search, add/remove, and
// reordering on the "Selected" tab by dragging a row by its handle.
import { CRYPTO, POPULAR } from '../data/currencies.js';
import { currencyName, isKnownFiat } from '../core/names.js';
import { moveCurrency, reorderCurrency, toggleCurrency } from '../core/currency-list.js';
import { badgeHtml } from './badge.js';
import { $, $$, ICONS, escapeHtml } from './dom.js';

const FOCUS_DELAY_MS = 250; // after the opening transition
const AUTOSCROLL_EDGE_PX = 56; // dragging this close to the list's edge scrolls it
const AUTOSCROLL_STEP_PX = 9; // per frame

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
  let dragging = false;

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

  const dragHandle = code =>
    `<button type="button" class="pick__drag" data-drag aria-label="${escapeHtml(app.t('reorder', { code }))}">${ICONS.grip}</button>`;

  function itemHtml(code) {
    const selected = app.state.list.includes(code);
    return `
      <li class="pick${selected ? ' is-on' : ''}" data-code="${code}" role="checkbox" aria-checked="${selected}" tabindex="0">
        ${tab === 'selected' ? dragHandle(code) : ''}
        ${badgeHtml(code)}
        <span class="pick__txt">
          <span class="pick__code">${code}</span>
          <span class="pick__name">${escapeHtml(currencyName(code, app.state.lang))}</span>
        </span>
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
    const hint = tab === 'selected' && app.state.list.length > 1
      ? `<li class="picker__hint" role="presentation">${escapeHtml(app.t('reorderHint'))}</li>`
      : '';
    el.list.innerHTML = html ? hint + html : `<li class="picker__empty" role="presentation">${escapeHtml(app.t('nothing'))}</li>`;
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

  /** After the order changed: save, redraw, keep the keyboard on the same handle. */
  function reordered(code) {
    app.save();
    render();
    onListChange();
    $(`.pick[data-code="${code}"] [data-drag]`, el.list)?.focus({ preventScroll: true });
  }

  // ---------- dragging in "Selected" ----------

  function startDrag(event, handle) {
    if (event.button !== 0 || dragging) return;
    const row = handle.closest('.pick');
    const rows = $$('.pick', el.list);
    const from = rows.indexOf(row);
    if (rows.length < 2 || from < 0) return;
    event.preventDefault(); // no text selection, no scrolling of the list by this touch
    dragging = true;

    const pitch = rows[1].offsetTop - rows[0].offsetTop; // the height of a row with its gap
    const startY = event.clientY;
    const startScroll = el.list.scrollTop;
    let pointerY = startY;
    let to = from;
    let frame = 0;
    row.classList.add('is-dragging');
    el.list.classList.add('is-sorting');
    try { handle.setPointerCapture(event.pointerId); } catch { /* the pointer is already gone */ }

    // The dragged row follows the finger; the rows it passes make room for it
    function layout() {
      const offset = pointerY - startY + el.list.scrollTop - startScroll;
      to = Math.min(rows.length - 1, Math.max(0, from + Math.round(offset / pitch)));
      row.style.transform = `translateY(${offset}px)`;
      rows.forEach((other, index) => {
        if (other === row) return;
        let shift = 0;
        if (from < to && index > from && index <= to) shift = -pitch;
        else if (from > to && index >= to && index < from) shift = pitch;
        other.style.transform = shift ? `translateY(${shift}px)` : '';
      });
    }

    // Near the top or bottom edge the list scrolls, so a long list can be crossed
    function tick() {
      const box = el.list.getBoundingClientRect();
      if (pointerY < box.top + AUTOSCROLL_EDGE_PX) el.list.scrollTop -= AUTOSCROLL_STEP_PX;
      else if (pointerY > box.bottom - AUTOSCROLL_EDGE_PX) el.list.scrollTop += AUTOSCROLL_STEP_PX;
      layout();
      frame = requestAnimationFrame(tick);
    }

    const move = moveEvent => { pointerY = moveEvent.clientY; };
    function finish() {
      cancelAnimationFrame(frame);
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', finish);
      handle.removeEventListener('pointercancel', finish);
      handle.removeEventListener('lostpointercapture', finish);
      row.classList.remove('is-dragging');
      el.list.classList.remove('is-sorting');
      rows.forEach(other => { other.style.transform = ''; });
      dragging = false;
      const code = row.dataset.code;
      // The search may hide some rows: the place is taken from the row dropped onto
      const target = rows[to].dataset.code;
      if (to !== from && reorderCurrency(app.state, code, app.state.list.indexOf(target))) reordered(code);
    }

    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', finish);
    handle.addEventListener('pointercancel', finish);
    handle.addEventListener('lostpointercapture', finish);
    frame = requestAnimationFrame(tick);
  }

  // ---------- events ----------

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
  el.list.addEventListener('pointerdown', event => {
    const handle = event.target.closest('[data-drag]');
    if (handle) startDrag(event, handle);
  });
  el.list.addEventListener('click', event => {
    const item = event.target.closest('.pick');
    // The handle is for dragging: a tap on it must not remove the currency
    if (!item || event.target.closest('[data-drag]')) return;
    toggle(item);
  });
  el.list.addEventListener('keydown', event => {
    const handle = event.target.closest('[data-drag]');
    if (handle) {
      const delta = { ArrowUp: -1, ArrowDown: 1 }[event.key];
      if (!delta) return;
      event.preventDefault();
      const code = handle.closest('.pick').dataset.code;
      if (moveCurrency(app.state, code, delta)) reordered(code);
      return;
    }
    if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('.pick')) {
      event.preventDefault();
      toggle(event.target);
    }
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && isOpen()) close();
  });

  return { open, close, render: () => { if (isOpen() && !dragging) render(); } };
}

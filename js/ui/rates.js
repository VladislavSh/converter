// "Rate" bar under the tabs and its sheet: which source every calculation
// uses — the market rates (exchangerate.fun) or a bank from bank.uz (the
// National Bank, Kapitalbank). The logic is in core/rate-sources.js.
import { BUILTIN_SOURCES, DEFAULT_SIDE, selectSource } from '../core/rate-sources.js';
import { $, $$, ICONS, createSheet, escapeHtml } from './dom.js';

export function createRatesView(app, { onChange }) {
  const el = {
    bar: $('#rate-bar'),
    barName: $('#rate-bar-name'),
    barValue: $('#rate-bar-value'),
    list: $('#rate-list')
  };
  const sheet = createSheet($('#rate-sheet'), $('#app'));

  // ---------- the bar ----------

  function renderBar() {
    // The order is counted by the sell prices; the converter shows both sums
    const info = app.rateSource(DEFAULT_SIDE);
    el.bar.classList.toggle('is-custom', info.kind !== 'market');
    el.barName.textContent = app.sourceName(info.id);
    const parts = [];
    if (info.kind === 'bank') {
      if (info.missing) parts.push(app.t('srcNotLoaded'));
      else {
        if (info.source.date) parts.push(app.t('srcOnDate', { date: info.source.date }));
        parts.push(app.t(app.state.view === 'shop' ? 'sideSell' : 'sideBoth').toLocaleLowerCase(app.locale()));
      }
    }
    el.barValue.textContent = parts.join(' · ');
  }

  // ---------- the list ----------

  function itemHtml(id) {
    const active = app.state.rateSource === id;
    return `
      <li class="rate-item${active ? ' is-on' : ''}">
        <button type="button" class="rate-item__main" role="radio" aria-checked="${active}" data-id="${id}">
          <span class="check">${ICONS.check}</span>
          <span class="rate-item__txt">
            <span class="rate-item__name">${escapeHtml(app.sourceName(id))}</span>
            <span class="rate-item__note">${escapeHtml(app.sourceNote(id))}</span>
          </span>
        </button>
      </li>`;
  }

  function renderList() {
    el.list.innerHTML = ['market', ...BUILTIN_SOURCES].map(itemHtml).join('');
  }

  // ---------- events ----------

  el.bar.addEventListener('click', () => {
    renderList();
    sheet.open();
  });

  el.list.addEventListener('click', event => {
    const choose = event.target.closest('[data-id]');
    if (!choose || !selectSource(app.state, choose.dataset.id)) return;
    app.save();
    onChange();
    sheet.close();
  });
  // A radio group: arrows move between the sources
  el.list.addEventListener('keydown', event => {
    const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[event.key];
    if (!step || !event.target.matches('[data-id]')) return;
    event.preventDefault();
    const radios = $$('[data-id]', el.list);
    radios[(radios.indexOf(event.target) + step + radios.length) % radios.length].focus();
  });

  /** Called when rates arrive, the language changes or the source changes. */
  function render() {
    renderBar();
    if (sheet.isOpen()) renderList();
  }

  return { render };
}

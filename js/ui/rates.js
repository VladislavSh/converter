// "Rate" bar under the tabs and its sheet: the market rates or one of the
// user's own, saved under a name ("Kapitalbank", "Malika market"). The rate
// that is switched on is used by both tabs.
import {
  MAX_CUSTOM_RATES, activeCustomRate, describeCustomRate, rateDifference, rateValue,
  removeCustomRate, saveCustomRate, selectCustomRate
} from '../core/custom-rates.js';
import { sanitizeExpression } from '../core/expression.js';
import { formatAmount, formatNumber } from '../core/format.js';
import { $, $$, ICONS, createSheet, escapeHtml } from './dom.js';

// Offered in the form besides the currencies of the main list
const USUAL_CURRENCIES = ['USD', 'UZS', 'CNY', 'RUB'];
const MIN_DIFFERENCE = 0.05; // percent; closer than that reads as "same as the market"

export function createRatesView(app, { onChange }) {
  const el = {
    bar: $('#rate-bar'),
    barName: $('#rate-bar-name'),
    barValue: $('#rate-bar-value'),
    sheet: $('#rate-sheet'),
    title: $('#rate-title'),
    pick: $('#rate-pick'),
    list: $('#rate-list'),
    add: $('#rate-add'),
    form: $('#rate-form'),
    name: $('#rate-name'),
    from: $('#rate-from'),
    to: $('#rate-to'),
    value: $('#rate-value'),
    market: $('#rate-market'),
    useMarket: $('#rate-use-market'),
    error: $('#rate-error'),
    cancel: $('#rate-cancel')
  };
  const sheet = createSheet(el.sheet, $('#app'));
  let editingId = ''; // '' while a new rate is being added

  const rates = () => app.state.customRates;

  // ---------- the bar ----------

  function renderBar() {
    const custom = activeCustomRate(app.state);
    el.bar.classList.toggle('is-custom', Boolean(custom));
    el.barName.textContent = custom ? custom.name : app.t('rateMarket');
    el.barValue.textContent = custom ? describeCustomRate(custom, app.locale()) : '';
  }

  // ---------- the list ----------

  /** "1 USD = 12 950 UZS · 1,1% above the market" */
  function rateNote(custom) {
    const text = describeCustomRate(custom, app.locale());
    const difference = app.rates ? rateDifference(app.rates.rates, custom) : null;
    if (difference == null) return text;
    if (Math.abs(difference) < MIN_DIFFERENCE) return `${text} · ${app.t('rateSame')}`;
    const percent = formatNumber(Math.abs(difference), app.locale(), Math.abs(difference) < 10 ? 1 : 0);
    return `${text} · ${app.t(difference > 0 ? 'rateAbove' : 'rateBelow', { p: percent })}`;
  }

  function itemHtml({ id, name, note, actions }) {
    const active = app.state.rateId === id;
    return `
      <li class="rate-item${active ? ' is-on' : ''}">
        <button type="button" class="rate-item__main" role="radio" aria-checked="${active}" data-id="${id}">
          <span class="check">${ICONS.check}</span>
          <span class="rate-item__txt">
            <span class="rate-item__name">${escapeHtml(name)}</span>
            <span class="rate-item__note">${escapeHtml(note)}</span>
          </span>
        </button>
        ${actions ? `
          <button type="button" class="rate-item__act" data-edit="${id}" aria-label="${escapeHtml(app.t('rateEditOne', { name }))}">${ICONS.edit}</button>
          <button type="button" class="rate-item__act" data-delete="${id}" aria-label="${escapeHtml(app.t('rateDeleteOne', { name }))}">${ICONS.trash}</button>` : ''}
      </li>`;
  }

  function renderList() {
    el.list.innerHTML = [
      itemHtml({ id: '', name: app.t('rateMarket'), note: app.t('rateMarketNote'), actions: false }),
      ...rates().map(custom => itemHtml({ id: custom.id, name: custom.name, note: rateNote(custom), actions: true }))
    ].join('');
    el.add.hidden = rates().length >= MAX_CUSTOM_RATES;
  }

  function showList() {
    editingId = '';
    el.form.hidden = true;
    el.pick.hidden = false;
    el.title.textContent = app.t('ratesTitle');
    renderList();
  }

  // ---------- the form ----------

  const hasRate = code => app.marketConvert(1, 'USD', code) != null;

  function fillCurrencies(select, chosen) {
    const codes = [...new Set([chosen, ...USUAL_CURRENCIES, ...app.state.list])]
      .filter(code => code === chosen || !app.rates || hasRate(code));
    select.innerHTML = codes.map(code => `<option value="${code}">${code}</option>`).join('');
    select.value = chosen;
  }

  const marketRate = () => app.marketConvert(1, el.from.value, el.to.value);

  function renderMarketHint() {
    const market = marketRate();
    const known = market != null && el.from.value !== el.to.value;
    el.market.textContent = known
      ? app.t('rateMarketNow', { rate: `1 ${el.from.value} = ${formatAmount(market, el.to.value, { locale: app.locale() })} ${el.to.value}` })
      : '';
    el.useMarket.hidden = !known;
  }

  function showError(key) {
    el.error.textContent = key ? app.t(key, { n: MAX_CUSTOM_RATES }) : '';
    el.error.hidden = !key;
  }

  /** @param {object} [custom] a saved rate to change; none = a new one */
  function showForm(custom) {
    editingId = custom?.id ?? '';
    // A new rate starts as "dollar in sums", or the first two listed currencies
    const [first, second] = app.state.list;
    const from = custom?.from ?? (hasRate('USD') || !app.rates ? 'USD' : first);
    const to = custom?.to ?? (from !== 'UZS' && (hasRate('UZS') || !app.rates) ? 'UZS' : (second ?? first));
    el.name.value = custom?.name ?? '';
    fillCurrencies(el.from, from);
    fillCurrencies(el.to, to);
    el.value.value = custom?.rate ?? '';
    showError('');
    renderMarketHint();
    el.title.textContent = app.t(custom ? 'rateEditTitle' : 'rateNewTitle');
    el.pick.hidden = true;
    el.form.hidden = false;
    // On touch screens the keyboard would cover half the form before it is read
    if (matchMedia('(hover: hover)').matches) el.name.focus({ preventScroll: true });
  }

  function submitForm() {
    const outcome = saveCustomRate(app.state, {
      id: editingId || undefined,
      name: el.name.value,
      from: el.from.value,
      to: el.to.value,
      rate: el.value.value
    });
    if (!outcome.ok) {
      showError({ pair: 'ratePairError', rate: 'rateValueError', full: 'rateFullError' }[outcome.error] ?? 'rateValueError');
      (outcome.error === 'pair' ? el.to : el.value).focus();
      return;
    }
    const created = !editingId;
    app.save();
    onChange();
    renderBar();
    if (created) {
      // A new rate is switched on straight away: back to the numbers
      sheet.close();
      app.toast(app.t('rateSavedOn', { name: activeCustomRate(app.state).name }));
    } else {
      showList();
      app.toast(app.t('rateSaved'));
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
      showForm(rates().find(custom => custom.id === edit.dataset.edit));
    } else if (remove) {
      if (!removeCustomRate(app.state, remove.dataset.delete)) return;
      app.save();
      onChange();
      renderBar();
      renderList();
      app.toast(app.t('rateDeleted'));
      $('[data-id=""]', el.list).focus();
    } else if (choose) {
      if (!selectCustomRate(app.state, choose.dataset.id)) return;
      app.save();
      onChange();
      renderBar();
      sheet.close();
    }
  });
  // A radio group: arrows move between the rates
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
  for (const select of [el.from, el.to]) {
    select.addEventListener('change', () => {
      showError('');
      renderMarketHint();
    });
  }
  el.value.addEventListener('input', () => {
    const clean = sanitizeExpression(el.value.value);
    if (clean !== el.value.value) el.value.value = clean;
    if (rateValue(clean) != null) showError('');
  });
  el.useMarket.addEventListener('click', () => {
    const market = marketRate();
    if (market == null) return;
    el.value.value = formatAmount(market, el.to.value, { plain: true });
    showError('');
    el.value.focus();
  });

  /** Called when rates arrive or the language changes. */
  function render() {
    renderBar();
    if (!sheet.isOpen()) return;
    if (el.form.hidden) renderList();
    else renderMarketHint();
  }

  return { render };
}

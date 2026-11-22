// Main screen: one amount in the "source" currency, shown in all the others.
// With a bank that has buy and sell prices every row shows both sums at once.
import { evaluate, isExpression, sanitizeExpression } from '../core/expression.js';
import { formatAmount, plainNumber } from '../core/format.js';
import { currencyName } from '../core/names.js';
import { switchSource } from '../core/currency-list.js';
import { DEFAULT_SIDE, RATE_SIDES } from '../core/rate-sources.js';
import { applyPastedAmount, parsePastedAmount } from '../core/pasted-amount.js';
import { converterShareText } from '../core/share-text.js';
import { badgeHtml } from './badge.js';
import { $, $$, ICONS, copyText, escapeHtml, replayAnimation, setTicking } from './dom.js';

// Long amounts get a smaller type size instead of being cut off: [max length, size]
const HERO_SIZES = [[7, 'xl'], [10, 'l'], [14, 'm'], [Infinity, 's']];
const RESULT_SIZES = [[11, 'l'], [15, 'm'], [Infinity, 's']];
const SIDE_SIZES = [[9, 'l'], [12, 'm'], [Infinity, 's']]; // half a row each
const sizeFor = (length, sizes) => sizes.find(([max]) => length <= max)[1];

export function createConverterView(app, { onEditList, keypad }) {
  const el = {
    hero: $('#hero'),
    tabs: $('#src-tabs'),
    name: $('#src-name'),
    input: $('#amount'),
    expr: $('#amount-expr'),
    results: $('#results'),
    edit: $('#manage-btn'),
    share: $('#conv-share')
  };
  let builtFor = '';

  const format = (value, code) => formatAmount(value, code, { locale: app.locale() });

  function rateText(code, side = DEFAULT_SIDE) {
    const { base } = app.state;
    const one = app.convert(1, base, code, side);
    if (one == null) return '';
    // "1 USD = 0,0000166 BTC" is unreadable — flip tiny rates around
    return one < 0.01
      ? `1 ${code} = ${format(1 / one, base)} ${base}`
      : `1 ${base} = ${format(one, code)}`; // the row itself names the currency
  }

  /** One price of a bank in a row: "Покупка / 8,35 / 1 USD = 11 970". */
  const sideHtml = side => `
    <span class="res__side res__side--${side}" data-side="${side}">
      <small>${escapeHtml(app.t(side === 'sell' ? 'sideSell' : 'sideBuy'))}</small>
      <b data-role="value">—</b>
      <span class="res__rate" data-role="rate"></span>
    </span>`;

  function resultHtml(code, index, twoSided) {
    const { t } = app;
    const name = escapeHtml(currencyName(code, app.state.lang));
    const body = twoSided
      ? `
            <span class="res__head"><span class="res__name">${name}</span><i>${code}</i></span>
            <span class="res__sides">${RATE_SIDES.map(sideHtml).join('')}</span>`
      : `
            <span class="res__value"><b data-role="value">—</b><i>${code}</i></span>
            <span class="res__meta">
              <span class="res__name">${name}</span>
              <span class="res__rate" data-role="rate"></span>
            </span>`;
    return `
      <li class="res${twoSided ? ' res--two' : ''}" data-code="${code}" style="--i:${index}">
        <button type="button" class="res__main" data-act="use" title="${escapeHtml(t('useAsSource', { code }))}">
          ${badgeHtml(code)}
          <span class="res__body">${body}
          </span>
        </button>
        <button type="button" class="res__copy" data-act="copy" aria-label="${escapeHtml(t('copyValue', { code }))}" title="${escapeHtml(t('copyValue', { code }))}">${ICONS.copy}</button>
      </li>`;
  }

  /** Rebuilds the currency chips and result rows; only when list, source or language change. */
  function buildStructure(twoSided) {
    const { state, t } = app;
    el.tabs.innerHTML = state.list.map(code => {
      const active = code === state.base;
      return `<button type="button" class="src-tab" role="radio" aria-checked="${active}" tabindex="${active ? 0 : -1}" data-code="${code}">${badgeHtml(code)}<span>${code}</span></button>`;
    }).join('');

    const targets = state.list.filter(code => code !== state.base);
    el.results.innerHTML = targets.length
      ? targets.map((code, index) => resultHtml(code, index, twoSided)).join('')
      : `<li class="results__empty">${escapeHtml(t('needSecond'))}</li>`;
    replayAnimation(el.results, 'is-built'); // the rows rise in, one after another

    el.name.textContent = currencyName(state.base, state.lang);
    el.input.setAttribute('aria-label', t('amountLabel', { code: state.base }));
  }

  /** Scrolls the chip row (never the page) so the selected chip is visible. */
  function revealActiveTab() {
    const active = $('[aria-checked="true"]', el.tabs);
    if (!active) return;
    const left = active.offsetLeft;
    const right = left + active.offsetWidth;
    if (left < el.tabs.scrollLeft) el.tabs.scrollLeft = left - 16;
    else if (right > el.tabs.scrollLeft + el.tabs.clientWidth) el.tabs.scrollLeft = right - el.tabs.clientWidth + 16;
  }

  function updateValues() {
    const { state } = app;
    const value = evaluate(state.input);
    const calculating = isExpression(state.input);

    if (document.activeElement !== el.input) {
      el.input.value = calculating || value == null ? state.input : format(value, state.base);
    }
    el.input.dataset.size = sizeFor(el.input.value.length, HERO_SIZES);
    el.expr.textContent = calculating && value != null ? `= ${format(value, state.base)}` : '';

    const amountIn = (code, side) => {
      const converted = value == null ? null : app.convert(value, state.base, code, side);
      return converted == null ? '—' : format(converted, code);
    };

    for (const row of $$('.res', el.results)) {
      const code = row.dataset.code;
      if (!row.classList.contains('res--two')) {
        const text = amountIn(code);
        setTicking($('[data-role="value"]', row), text);
        $('.res__value', row).dataset.size = sizeFor(text.length + code.length, RESULT_SIZES);
        $('[data-role="rate"]', row).textContent = rateText(code);
        continue;
      }
      // Both prices of the bank; a currency it does not quote has one price only
      const rates = RATE_SIDES.map(side => rateText(code, side));
      row.classList.toggle('is-same', rates[0] === rates[1]);
      for (const [i, side] of RATE_SIDES.entries()) {
        const cell = $(`[data-side="${side}"]`, row);
        const text = amountIn(code, side);
        const valueEl = $('[data-role="value"]', cell);
        setTicking(valueEl, text);
        valueEl.dataset.size = sizeFor(text.length, SIDE_SIZES);
        $('[data-role="rate"]', cell).textContent = rates[i];
      }
    }
  }

  function render() {
    const { state } = app;
    const info = app.rateSource();
    const twoSided = info.twoSided && !info.missing;
    const key = `${state.lang}|${state.base}|${state.list.join(',')}|${twoSided}`;
    if (key !== builtFor) {
      buildStructure(twoSided);
      builtFor = key;
    }
    updateValues();
    revealActiveTab(); // also after the tab was hidden while the chips were built
  }

  /** @param {{keepAmount?: boolean}} [options] keepAmount: only the currency changes (the chips) */
  function setSource(code, options) {
    if (!switchSource(app.state, code, app.convert, options)) return;
    app.save();
    if (document.activeElement === el.input) el.input.value = app.state.input;
    render();
    replayAnimation(el.hero, 'is-switched');
  }

  /** The source chip is re-created on every switch, so focus has to be put back. */
  function focusActiveTab() {
    $('[aria-checked="true"]', el.tabs)?.focus({ preventScroll: true });
  }

  function commitInput() {
    const clean = sanitizeExpression(el.input.value);
    if (clean !== el.input.value) el.input.value = clean;
    app.state.input = clean;
    app.state.amountFresh = true; // "Purchase" takes it as the item price when opened
    app.save();
    updateValues();
  }

  // --- source currency chips (a radio group: arrows move the selection) ---
  // A chip changes only the currency of the amount: «100» stays 100, now in
  // another currency. A tap on a result row converts the amount instead.
  el.tabs.addEventListener('click', event => {
    const tab = event.target.closest('.src-tab');
    if (!tab) return;
    setSource(tab.dataset.code, { keepAmount: true });
    focusActiveTab();
  });
  el.tabs.addEventListener('keydown', event => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const { list, base } = app.state;
    setSource(list[(list.indexOf(base) + step + list.length) % list.length], { keepAmount: true });
    focusActiveTab();
  });

  // --- amount field ---
  el.input.addEventListener('focus', () => {
    el.input.value = app.state.input; // show what was typed, not the formatted number
    el.input.dataset.size = sizeFor(el.input.value.length, HERO_SIZES);
    el.input.select();
  });
  // Keep the selection made on focus: the click's mouseup would otherwise clear it
  el.input.addEventListener('mousedown', () => {
    if (document.activeElement !== el.input) {
      el.input.addEventListener('mouseup', event => event.preventDefault(), { once: true });
    }
  });
  el.input.addEventListener('blur', updateValues);
  el.input.addEventListener('input', commitInput);
  el.input.addEventListener('keydown', event => {
    if (event.key !== 'Enter') return;
    const value = evaluate(app.state.input);
    if (value != null) {
      app.state.input = formatAmount(value, app.state.base, { plain: true });
      app.save();
    }
    el.input.blur();
    updateValues(); // do not depend on the blur event to show the result
  });

  // --- pasting an amount copied elsewhere: "¥1,299.00", "12 990 сум" ---
  const hasRate = code => app.convert(1, 'USD', code) != null;

  /** The pasted amount replaces the current one; a recognised currency becomes the source. */
  function replaceWithPasted(pasted) {
    applyPastedAmount(app.state, pasted, hasRate);
    app.state.amountFresh = true;
    app.save();
    if (document.activeElement === el.input) el.input.value = app.state.input;
    render();
    replayAnimation(el.hero, 'is-switched');
    const { base } = app.state;
    app.toast(app.t('pasted', { text: `${format(pasted.value, base)} ${base}` }));
  }

  // The system paste (long press, Ctrl+V) goes through the same parser
  el.input.addEventListener('paste', event => {
    const text = event.clipboardData?.getData('text') ?? '';
    app.markClipboard(text);
    const pasted = parsePastedAmount(text, hasRate);
    // A calculation ("120*3+15") is pasted as typed; the input handler cleans it up
    if (!pasted || (!pasted.currency && isExpression(text.trim()))) return;
    event.preventDefault();
    if (pasted.currency && pasted.currency !== app.state.base) {
      replaceWithPasted(pasted);
      return;
    }
    // Same currency: insert at the caret, so "100+" followed by a paste keeps working
    el.input.setRangeText(plainNumber(pasted.value), el.input.selectionStart, el.input.selectionEnd, 'end');
    commitInput();
  });

  // --- on touch screens the calculator keypad types here instead of the phone's keyboard ---
  keypad.attach(el.input, {
    label: () => app.t('amountLabel', { code: app.state.base }),
    format: value => format(value, app.state.base),
    plain: value => formatAmount(value, app.state.base, { plain: true })
  });

  // --- results: tap a row to type in that currency, or copy its value ---
  el.results.addEventListener('click', async event => {
    const button = event.target.closest('[data-act]');
    if (!button) return;
    const code = button.closest('.res').dataset.code;
    if (button.dataset.act === 'use') {
      setSource(code);
      focusActiveTab();
      return;
    }
    const value = evaluate(app.state.input);
    const converted = value == null ? null : app.convert(value, app.state.base, code);
    if (converted == null) return;
    const text = formatAmount(converted, code, { plain: true });
    const copied = await copyText(text);
    // Of a row with two sums the sell one is copied, the one orders are counted by
    const row = button.closest('.res');
    const side = row.matches('.res--two:not(.is-same)') ? ` · ${app.t('sideSell').toLocaleLowerCase(app.locale())}` : '';
    app.toast(copied ? app.t('copied', { text: `${text} ${code}${side}` }) : app.t('copyFailed'));
  });

  el.edit.addEventListener('click', () => onEditList());

  // --- share the calculation: the amounts, the rates and a link back to it ---
  el.share.addEventListener('click', () => {
    const text = converterShareText({
      state: app.state,
      convert: app.convert,
      t: app.t,
      locale: app.locale(),
      ratesAt: app.rates?.ts,
      rateNote: app.rateNote(),
      url: app.link()
    });
    if (text) app.share(text);
    else app.toast(app.t('shareEmpty'));
  });

  return { render, applyPasted: replaceWithPasted };
}

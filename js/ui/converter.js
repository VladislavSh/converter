// Main screen: one amount in the "source" currency, shown in all the others.
import { evaluate, isExpression, sanitizeExpression } from '../core/expression.js';
import { formatAmount, plainNumber } from '../core/format.js';
import { currencyName } from '../core/names.js';
import { switchSource } from '../core/currency-list.js';
import { applyPastedAmount, parsePastedAmount } from '../core/pasted-amount.js';
import { converterShareText } from '../core/share-text.js';
import { badgeHtml } from './badge.js';
import { $, $$, ICONS, copyText, escapeHtml, readClipboardText, replayAnimation } from './dom.js';

// Long amounts get a smaller type size instead of being cut off: [max length, size]
const HERO_SIZES = [[7, 'xl'], [10, 'l'], [14, 'm'], [Infinity, 's']];
const RESULT_SIZES = [[11, 'l'], [15, 'm'], [Infinity, 's']];
const sizeFor = (length, sizes) => sizes.find(([max]) => length <= max)[1];

export function createConverterView(app, { onEditList, keypad }) {
  const el = {
    hero: $('#hero'),
    tabs: $('#src-tabs'),
    name: $('#src-name'),
    input: $('#amount'),
    paste: $('#amount-paste'),
    expr: $('#amount-expr'),
    results: $('#results'),
    edit: $('#manage-btn'),
    share: $('#conv-share')
  };
  let builtFor = '';

  const format = (value, code) => formatAmount(value, code, { locale: app.locale() });

  function rateText(code) {
    const { base } = app.state;
    const one = app.convert(1, base, code);
    if (one == null) return '';
    // "1 USD = 0,0000166 BTC" is unreadable — flip tiny rates around
    return one < 0.01
      ? `1 ${code} = ${format(1 / one, base)} ${base}`
      : `1 ${base} = ${format(one, code)}`; // the row itself names the currency
  }

  function resultHtml(code) {
    const { t } = app;
    return `
      <li class="res" data-code="${code}">
        <button type="button" class="res__main" data-act="use" title="${escapeHtml(t('useAsSource', { code }))}">
          ${badgeHtml(code)}
          <span class="res__body">
            <span class="res__value"><b data-role="value">—</b><i>${code}</i></span>
            <span class="res__meta">
              <span class="res__name">${escapeHtml(currencyName(code, app.state.lang))}</span>
              <span class="res__rate" data-role="rate"></span>
            </span>
          </span>
        </button>
        <button type="button" class="res__copy" data-act="copy" aria-label="${escapeHtml(t('copyValue', { code }))}" title="${escapeHtml(t('copyValue', { code }))}">${ICONS.copy}</button>
      </li>`;
  }

  /** Rebuilds the currency chips and result rows; only when list, source or language change. */
  function buildStructure() {
    const { state, t } = app;
    el.tabs.innerHTML = state.list.map(code => {
      const active = code === state.base;
      return `<button type="button" class="src-tab" role="radio" aria-checked="${active}" tabindex="${active ? 0 : -1}" data-code="${code}">${badgeHtml(code)}<span>${code}</span></button>`;
    }).join('');

    const targets = state.list.filter(code => code !== state.base);
    el.results.innerHTML = targets.length
      ? targets.map(resultHtml).join('')
      : `<li class="results__empty">${escapeHtml(t('needSecond'))}</li>`;

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

    for (const row of $$('.res', el.results)) {
      const code = row.dataset.code;
      const converted = value == null ? null : app.convert(value, state.base, code);
      const text = converted == null ? '—' : format(converted, code);
      $('[data-role="value"]', row).textContent = text;
      $('.res__value', row).dataset.size = sizeFor(text.length + code.length, RESULT_SIZES);
      $('[data-role="rate"]', row).textContent = rateText(code);
    }
  }

  function render() {
    const { state } = app;
    const key = `${state.lang}|${state.base}|${state.list.join(',')}`;
    if (key !== builtFor) {
      buildStructure();
      builtFor = key;
    }
    updateValues();
    revealActiveTab(); // also after the tab was hidden while the chips were built
  }

  function setSource(code) {
    if (!switchSource(app.state, code, app.convert)) return;
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
  el.tabs.addEventListener('click', event => {
    const tab = event.target.closest('.src-tab');
    if (!tab) return;
    setSource(tab.dataset.code);
    focusActiveTab();
  });
  el.tabs.addEventListener('keydown', event => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const { list, base } = app.state;
    setSource(list[(list.indexOf(base) + step + list.length) % list.length]);
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

  el.paste.addEventListener('click', async () => {
    const text = await readClipboardText();
    app.markClipboard(text);
    if (text == null) {
      app.toast(app.t('pasteDenied'));
      el.input.focus();
      return;
    }
    const pasted = parsePastedAmount(text, hasRate);
    if (pasted) replaceWithPasted(pasted);
    else app.toast(app.t('pasteEmpty'));
  });

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
    app.toast(copied ? app.t('copied', { text: `${text} ${code}` }) : app.t('copyFailed'));
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

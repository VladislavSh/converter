// On-screen calculator keypad for amount fields on touch screens. The phone's
// own keyboard is kept away (inputmode="none") and this one types into the
// field instead: digits, + − × ÷, %, brackets and "=" to calculate. What each
// key does to the text is in core/keypad.js.
import { evaluate, isExpression } from '../core/expression.js';
import { formatNumber, plainNumber } from '../core/format.js';
import { applyKey } from '../core/keypad.js';
import { $, replayAnimation } from './dom.js';

const REPEAT_DELAY_MS = 450; // holding ⌫: first repeat after this
const REPEAT_EVERY_MS = 70;
const SLIDE_MS = 300; // the opening transition in the stylesheet
const GAP_PX = 12; // between the field and the keypad

export function createKeypad(app) {
  const el = {
    pad: $('#keypad'),
    label: $('#keypad-label'),
    preview: $('#keypad-preview'),
    dot: $('#keypad [data-key="dot"]'),
    back: $('#keypad [data-key="back"]')
  };
  // Phones and tablets. With a mouse and a real keyboard it would only be in the way.
  const enabled = matchMedia('(pointer: coarse)').matches;
  document.body.classList.toggle('uses-keypad', enabled);

  const fields = new Map(); // input → its options
  let current = null; // the field the keypad types into
  let repeatTimer = 0;

  const decimalSign = () => formatNumber(1.5, app.locale(), 1).replace(/\d/g, '');
  const optionsOf = input => fields.get(input) ?? {};

  function labelFor(input) {
    return optionsOf(input).label?.()
      ?? document.querySelector(`label[for="${input.id}"]`)?.textContent.trim()
      ?? input.getAttribute('aria-label')
      ?? '';
  }

  /** "= 1 234,56" while the field holds a calculation. */
  function renderPreview() {
    el.preview.classList.remove('is-error');
    if (!current) return;
    const value = evaluate(current.value);
    const format = optionsOf(current).format ?? (number => formatNumber(number, app.locale(), 6));
    el.preview.textContent = isExpression(current.value) && value != null ? `= ${format(value)}` : '';
  }

  function showError() {
    el.preview.textContent = app.t('keypadError');
    replayAnimation(el.preview, 'is-error');
  }

  /** Scrolls the page so the field is not hidden behind the keypad. */
  function keepVisible() {
    if (!current) return;
    const limit = window.innerHeight - el.pad.offsetHeight - GAP_PX;
    const box = current.getBoundingClientRect();
    if (box.bottom > limit) window.scrollBy({ top: box.bottom - limit, behavior: 'smooth' });
    else if (box.top < GAP_PX) window.scrollBy({ top: box.top - GAP_PX, behavior: 'smooth' });
  }

  const measure = () => document.documentElement.style.setProperty('--keypad-h', `${el.pad.offsetHeight}px`);

  function open(input) {
    current = input;
    el.label.textContent = labelFor(input);
    el.dot.textContent = decimalSign();
    renderPreview();
    el.pad.classList.add('is-open');
    el.pad.setAttribute('aria-hidden', 'false');
    document.body.classList.add('has-keypad');
    measure();
    setTimeout(keepVisible, SLIDE_MS);
  }

  function close() {
    stopRepeat();
    current = null;
    el.pad.classList.remove('is-open');
    el.pad.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('has-keypad');
  }

  /** Puts new text into the field the same way typing would. */
  function write(input, value, caret) {
    input.value = value;
    input.setSelectionRange(caret, caret);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    renderPreview();
  }

  /** "=": the calculation is replaced by its result. */
  function calculate(input) {
    const value = evaluate(input.value);
    if (value == null) {
      if (input.value.trim()) showError();
      return;
    }
    if (!isExpression(input.value)) return; // already a plain number
    const text = (optionsOf(input).plain ?? plainNumber)(value);
    write(input, text, text.length);
  }

  /** @returns {boolean} whether the key changed anything */
  function press(key) {
    const input = current;
    if (!input) return false;
    if (key === 'done') {
      input.blur();
      return true;
    }
    if (document.activeElement !== input) input.focus({ preventScroll: true });
    if (key === 'equals') {
      calculate(input);
      return true;
    }
    const next = applyKey(
      { value: input.value, start: input.selectionStart, end: input.selectionEnd },
      key,
      { decimal: decimalSign() }
    );
    if (!next) return false;
    write(input, next.value, next.caret);
    return true;
  }

  // ⌫ deletes on press and keeps deleting while held
  function stopRepeat() {
    clearTimeout(repeatTimer);
    repeatTimer = 0;
  }
  function startRepeat() {
    stopRepeat();
    const tick = () => { repeatTimer = press('back') ? setTimeout(tick, REPEAT_EVERY_MS) : 0; };
    repeatTimer = setTimeout(tick, REPEAT_DELAY_MS);
  }

  // A key must never take the focus from the field: the field would lose its
  // caret and the keypad would close.
  const keepFocus = event => { if (event.target.closest('[data-key]')) event.preventDefault(); };
  el.pad.addEventListener('pointerdown', event => {
    keepFocus(event);
    if (event.button === 0 && event.target.closest('[data-key="back"]')) {
      press('back');
      startRepeat();
    }
  });
  el.pad.addEventListener('mousedown', keepFocus);
  el.back.addEventListener('pointerleave', stopRepeat);
  window.addEventListener('pointerup', stopRepeat);
  window.addEventListener('pointercancel', stopRepeat);

  el.pad.addEventListener('click', event => {
    const button = event.target.closest('[data-key]');
    if (!button) return;
    // ⌫ already acted on press; a keyboard or screen-reader "click" (detail 0) has no press
    if (button.dataset.key === 'back' && event.detail !== 0) return;
    press(button.dataset.key);
  });
  // Focus that left both the field and the keypad (a screen reader moved it on)
  el.pad.addEventListener('focusout', event => {
    if (current && event.relatedTarget !== current && !el.pad.contains(event.relatedTarget)) close();
  });
  window.addEventListener('resize', () => { if (current) measure(); });

  /**
   * Makes a text field use the keypad on touch screens.
   * @param {HTMLInputElement} input
   * @param {{label?: () => string, format?: (n: number) => string, plain?: (n: number) => string}} [options]
   *   label: the title above the keys; format: the "= result" preview; plain: the text "=" puts in the field
   */
  function attach(input, options = {}) {
    fields.set(input, options);
    if (!enabled) return;
    input.inputMode = 'none'; // no system keyboard on top of this one
    input.addEventListener('focus', () => open(input));
    input.addEventListener('blur', event => {
      // A key took the focus (screen readers do that): press() gives it back
      if (event.relatedTarget && el.pad.contains(event.relatedTarget)) return;
      if (current === input) close();
    });
    input.addEventListener('input', () => { if (current === input) renderPreview(); });
  }

  return { attach, enabled };
}

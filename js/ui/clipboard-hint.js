// Offers to paste an amount the user has just copied (in a shop app, a chat):
// when the app comes back to the screen, the clipboard is read — only when the
// browser already allows it, never with a permission prompt — and a bar shows
// what was understood: «¥1,299.00» → 1 299 CNY. Nothing leaves the device;
// only a fingerprint of the text is kept, so one copy is offered once.
import { STORAGE_KEYS } from '../config.js';
import { formatAmount } from '../core/format.js';
import { clipboardOffer, textFingerprint } from '../core/pasted-amount.js';
import { $ } from './dom.js';

export function createClipboardHint(app, { onApply }) {
  const el = {
    bar: $('#clip-hint'),
    from: $('#clip-hint-from'),
    value: $('#clip-hint-value'),
    apply: $('#clip-hint-apply'),
    close: $('#clip-hint-close')
  };
  let offer = null; // {value, currency, excerpt, text}
  let checking = false;

  const handledPrint = () => {
    try { return localStorage.getItem(STORAGE_KEYS.clipboard) ?? ''; } catch { return ''; }
  };
  const rememberHandled = text => {
    try { localStorage.setItem(STORAGE_KEYS.clipboard, textFingerprint(text)); } catch { /* storage blocked */ }
  };
  const hasRate = code => app.marketConvert(1, 'USD', code) != null;

  /** Reading without asking: only where the user has already allowed it. */
  async function readAllowed() {
    if (!navigator.clipboard?.readText || !navigator.permissions?.query) return false;
    try {
      return (await navigator.permissions.query({ name: 'clipboard-read' })).state === 'granted';
    } catch {
      return false; // Safari, Firefox: reading needs a tap on "Paste"
    }
  }

  function hide() {
    offer = null;
    el.bar.hidden = true;
  }

  function render() {
    if (!offer) return;
    const locale = app.locale();
    el.from.textContent = app.t('clipHintFrom', { text: offer.excerpt });
    el.value.textContent = offer.currency
      ? `${formatAmount(offer.value, offer.currency, { locale })} ${offer.currency}`
      : `${formatAmount(offer.value, 'USD', { locale })} · ${app.t('clipHintNoCurrency')}`;
  }

  /** Looks at the clipboard; shows the bar when it holds a new amount. */
  async function check() {
    if (checking || document.hidden || !(await readAllowed())) return;
    checking = true;
    try {
      const text = await navigator.clipboard.readText();
      const found = clipboardOffer(text, hasRate);
      if (!found || textFingerprint(text) === handledPrint()) {
        hide();
        return;
      }
      offer = { ...found, text };
      render();
      el.bar.hidden = false;
    } catch {
      // not focused yet, or refused this time: the next return to the app tries again
    } finally {
      checking = false;
    }
  }

  /** The user pasted this text some other way: it is not offered again. */
  function markHandled(text) {
    if (!text) return;
    rememberHandled(text);
    if (offer && textFingerprint(offer.text) === textFingerprint(text)) hide();
  }

  el.apply.addEventListener('click', () => {
    if (!offer) return;
    const { value, currency, text } = offer;
    rememberHandled(text);
    hide();
    onApply({ value, currency });
  });
  el.close.addEventListener('click', () => {
    if (offer) rememberHandled(offer.text);
    hide();
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
  window.addEventListener('focus', check);

  return { check, markHandled, render };
}

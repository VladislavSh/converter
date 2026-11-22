// Offers to paste an amount the user has just copied (in a shop app, a chat):
// when the app comes back to the screen, the clipboard is read — only when the
// browser already allows it — and a bar shows what was understood:
// «¥1,299.00» → 1 299 CNY. Until access is granted, the same bar asks for it
// once ("Allow"); the browser's own prompt appears only after that tap.
// Nothing leaves the device; only a fingerprint of the text is kept, so one
// copy is offered once.
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
  let asking = false; // the bar asks for clipboard access instead of offering an amount
  let checking = false;

  const handledPrint = () => {
    try { return localStorage.getItem(STORAGE_KEYS.clipboard) ?? ''; } catch { return ''; }
  };
  const rememberHandled = text => {
    try { localStorage.setItem(STORAGE_KEYS.clipboard, textFingerprint(text)); } catch { /* storage blocked */ }
  };
  const hasRate = code => app.marketConvert(1, 'USD', code) != null;

  /** 'granted' | 'prompt' | 'denied' | 'unsupported' (Safari, Firefox: no way to ask ahead) */
  async function access() {
    if (!navigator.clipboard?.readText || !navigator.permissions?.query) return 'unsupported';
    try {
      return (await navigator.permissions.query({ name: 'clipboard-read' })).state;
    } catch {
      return 'unsupported';
    }
  }
  const askDeclined = () => {
    try { return localStorage.getItem(STORAGE_KEYS.clipboardAsk) === 'no'; } catch { return true; }
  };
  const declineAsk = () => {
    try { localStorage.setItem(STORAGE_KEYS.clipboardAsk, 'no'); } catch { /* storage blocked */ }
  };

  function hide() {
    offer = null;
    asking = false;
    el.bar.hidden = true;
  }

  function render() {
    if (asking) {
      el.from.textContent = app.t('clipAskNote');
      el.value.textContent = app.t('clipAskTitle');
      el.apply.textContent = app.t('clipAskAllow');
      return;
    }
    if (!offer) return;
    el.apply.textContent = app.t('paste');
    const locale = app.locale();
    el.from.textContent = app.t('clipHintFrom', { text: offer.excerpt });
    el.value.textContent = offer.currency
      ? `${formatAmount(offer.value, offer.currency, { locale })} ${offer.currency}`
      : `${formatAmount(offer.value, 'USD', { locale })} · ${app.t('clipHintNoCurrency')}`;
  }

  /** Shows what the clipboard holds, if it is a new amount. @returns {boolean} whether it did */
  function offerText(text) {
    const found = clipboardOffer(text, hasRate);
    if (!found || textFingerprint(text) === handledPrint()) {
      hide();
      return false;
    }
    asking = false;
    offer = { ...found, text };
    render();
    el.bar.hidden = false;
    return true;
  }

  /** Looks at the clipboard; shows the bar when it holds a new amount (or asks for access once). */
  async function check() {
    if (checking || document.hidden) return;
    checking = true;
    try {
      const state = await access();
      if (state === 'granted') {
        offerText(await navigator.clipboard.readText());
      } else if (state === 'prompt' && !askDeclined()) {
        offer = null;
        asking = true;
        render();
        el.bar.hidden = false;
      }
    } catch {
      // not focused yet, or refused this time: the next return to the app tries again
    } finally {
      checking = false;
    }
  }

  /** "Allow": the browser asks, and on a yes the clipboard is looked at right away. */
  async function allow() {
    hide();
    let text = null;
    try { text = await navigator.clipboard.readText(); } catch { /* refused */ }
    if (text == null) {
      declineAsk();
      app.toast(app.t('pasteDenied'));
      return;
    }
    if (!offerText(text)) app.toast(app.t('clipAskDone'));
  }

  /** The user pasted this text some other way: it is not offered again. */
  function markHandled(text) {
    if (!text) return;
    rememberHandled(text);
    if (offer && textFingerprint(offer.text) === textFingerprint(text)) hide();
  }

  el.apply.addEventListener('click', () => {
    if (asking) {
      allow();
      return;
    }
    if (!offer) return;
    const { value, currency, text } = offer;
    rememberHandled(text);
    hide();
    onApply({ value, currency });
  });
  el.close.addEventListener('click', () => {
    if (asking) declineAsk(); // asked once, not again
    if (offer) rememberHandled(offer.text);
    hide();
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
  window.addEventListener('focus', check);

  return { check, markHandled, render };
}

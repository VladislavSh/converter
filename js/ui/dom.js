// Small DOM helpers shared by the views.

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = text => String(text ?? '').replace(/[&<>"']/g, ch => HTML_ESCAPES[ch]);

export const ICONS = Object.freeze({
  copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7"/></svg>',
  up: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 14l6-6 6 6"/></svg>',
  down: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 10l6 6 6-6"/></svg>'
});

/** A short message at the bottom of the screen; a new one replaces the old. */
export function createToast(element, durationMs) {
  let timer;
  return message => {
    element.textContent = message;
    element.classList.add('is-show');
    clearTimeout(timer);
    timer = setTimeout(() => element.classList.remove('is-show'), durationMs);
  };
}

/** @returns {Promise<boolean>} whether the text reached the clipboard */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Reads the clipboard. Must be called from a tap or click; the browser may ask
 * for permission (Android) or show its own "Paste" bubble (iPhone).
 * @returns {Promise<string|null>} null when access is unavailable or refused
 */
export async function readClipboardText() {
  try {
    return await navigator.clipboard.readText();
  } catch {
    return null;
  }
}

/**
 * Shares text through the system share sheet, or copies it where there is none
 * (most desktop browsers). Must be called from a tap or click.
 * @returns {Promise<'shared'|'copied'|'cancelled'|'failed'>}
 */
export async function shareText(text) {
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ text });
      return 'shared';
    } catch (error) {
      if (error?.name === 'AbortError') return 'cancelled'; // the user closed the sheet
      // anything else (not allowed, unsupported data): fall back to copying
    }
  }
  return (await copyText(text)) ? 'copied' : 'failed';
}

/** Restarts a CSS animation tied to a class. */
export function replayAnimation(element, className) {
  element.classList.remove(className);
  void element.offsetWidth; // force a reflow so the animation starts over
  element.classList.add(className);
}

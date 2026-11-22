// Small DOM helpers shared by the views.

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = text => String(text ?? '').replace(/[&<>"']/g, ch => HTML_ESCAPES[ch]);

export const ICONS = Object.freeze({
  copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7"/></svg>',
  grip: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4ZM13.5 6.5l4 4"/></svg>',
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>'
});

const SHEET_FOCUS_DELAY_MS = 250; // after the opening transition

/**
 * A bottom sheet (dialog). While it is open the page behind is inert; it
 * closes on its backdrop, on any [data-close] inside it and on Escape, and
 * gives the focus back to what opened it.
 * @param {HTMLElement} sheet  the .sheet element
 * @param {HTMLElement} page   what to make inert while the sheet is open
 */
export function createSheet(sheet, page) {
  let opener = null;
  const isOpen = () => sheet.classList.contains('is-open');

  function open() {
    if (isOpen()) return;
    opener = document.activeElement;
    sheet.classList.add('is-open');
    sheet.setAttribute('aria-hidden', 'false');
    page.inert = true;
    setTimeout(() => {
      if (isOpen() && !sheet.contains(document.activeElement)) $('[data-close].icon-btn', sheet)?.focus({ preventScroll: true });
    }, SHEET_FOCUS_DELAY_MS);
  }

  function close() {
    if (!isOpen()) return;
    sheet.classList.remove('is-open');
    sheet.setAttribute('aria-hidden', 'true');
    page.inert = false;
    opener?.focus?.({ preventScroll: true });
    opener = null;
  }

  sheet.addEventListener('click', event => {
    if (event.target.closest('[data-close]')) close();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') close();
  });
  return { open, close, isOpen };
}

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

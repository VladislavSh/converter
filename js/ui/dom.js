// Small DOM helpers shared by the views.
import { gestureAxis, sheetShouldClose } from '../core/gestures.js';

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
const FLICK_STALE_MS = 100; // a finger that stopped before letting go is not flicking
const BOTTOM_SHEET = '(max-width: 699px)'; // wider screens show a dialog in the middle (css)

/**
 * Lets a bottom sheet be dragged down with a finger: it follows the finger and
 * closes when let go a third of the way down or flicked; otherwise it springs
 * back. Content scrolled away from its top scrolls first; the currency grips
 * keep their own dragging.
 */
function dragToClose(sheet, close) {
  const panel = $('.sheet__panel', sheet);
  const backdrop = $('.sheet__backdrop', sheet);
  const bottomSheet = matchMedia(BOTTOM_SHEET);
  let drag = null; // {x, y, axis, height, lastY, lastT, velocity}

  const scrolledDown = target => {
    for (let node = target; node; node = node.parentElement) {
      if (node.scrollTop > 0) return true;
      if (node === panel) return false;
    }
    return false;
  };

  panel.addEventListener('touchstart', event => {
    drag = null;
    if (!bottomSheet.matches || event.touches.length !== 1) return;
    if (event.target.closest('.pick__drag') || scrolledDown(event.target)) return;
    const point = event.touches[0];
    drag = {
      x: point.clientX, y: point.clientY, axis: null, height: panel.offsetHeight,
      lastY: point.clientY, lastT: event.timeStamp, velocity: 0
    };
  }, { passive: true });

  panel.addEventListener('touchmove', event => {
    if (!drag) return;
    const point = event.touches[0];
    const dy = point.clientY - drag.y;
    if (!drag.axis) {
      drag.axis = gestureAxis(point.clientX - drag.x, dy);
      if (!drag.axis) return;
      if (drag.axis !== 'down') { // up: the content scrolls; sideways: a list of chips
        drag = null;
        return;
      }
      sheet.classList.add('is-dragging'); // the panel follows the finger, no easing
    }
    if (event.cancelable) event.preventDefault();
    const dt = event.timeStamp - drag.lastT;
    if (dt > 0) drag.velocity = (point.clientY - drag.lastY) / dt;
    drag.lastY = point.clientY;
    drag.lastT = event.timeStamp;
    const offset = Math.max(0, dy);
    panel.style.transform = `translate(-50%, ${offset}px)`;
    backdrop.style.opacity = String(1 - Math.min(1, offset / drag.height));
  }, { passive: false });

  const release = event => {
    if (!drag) return;
    const { axis, y, lastY, lastT, height } = drag;
    const velocity = event.timeStamp - lastT > FLICK_STALE_MS ? 0 : drag.velocity;
    drag = null;
    if (axis !== 'down') return;
    // Back to the stylesheet: it animates from where the finger left the panel
    sheet.classList.remove('is-dragging');
    panel.style.transform = '';
    backdrop.style.opacity = '';
    if (event.type === 'touchend' && sheetShouldClose({ dy: lastY - y, velocity, height })) close();
  };
  panel.addEventListener('touchend', release, { passive: true });
  panel.addEventListener('touchcancel', release, { passive: true });
}

/**
 * A bottom sheet (dialog). While it is open the page behind is inert; it
 * closes on its backdrop, on any [data-close] inside it, on Escape and when
 * dragged down, and gives the focus back to what opened it.
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
  dragToClose(sheet, close);
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

/**
 * Puts new text into an element; when the text really changed, the element
 * gives a short "tick" (core of the number animations). Same text: nothing moves.
 */
export function setTicking(element, text) {
  if (element.textContent === text) return;
  const had = element.textContent !== '';
  element.textContent = text;
  if (had) replayAnimation(element, 'is-tick');
}

/** Restarts a CSS animation tied to a class. */
export function replayAnimation(element, className) {
  element.classList.remove(className);
  void element.offsetWidth; // force a reflow so the animation starts over
  element.classList.add(className);
}

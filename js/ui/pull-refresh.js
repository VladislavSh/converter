// Pulling the page down from its very top refreshes every rate source, as in
// apps. The browser's own pull-to-refresh is switched off in the styles
// (overscroll-behavior), so this one takes its place — also in the installed
// app, which has none. A round indicator follows the finger; past the mark it
// turns the accent colour (and the phone ticks), and letting go refreshes.
import { PULL, gestureAxis, pullDistance } from '../core/gestures.js';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * @param {{indicator: HTMLElement, canStart: () => boolean, onRefresh: () => Promise<unknown>}} options
 *   canStart: false while something covers the page (a sheet, the keypad, the splash)
 */
export function createPullToRefresh({ indicator, canStart, onRefresh }) {
  let pull = null; // {x, y, axis, armed}
  let busy = false;

  function place(distance) {
    indicator.style.setProperty('--pull', `${distance}px`);
    indicator.style.setProperty('--progress', Math.min(1, distance / PULL.trigger).toFixed(3));
  }
  function hide() {
    indicator.classList.remove('is-pulling', 'is-armed', 'is-refreshing');
    indicator.style.removeProperty('--pull');
    indicator.style.removeProperty('--progress');
  }

  window.addEventListener('touchstart', event => {
    pull = null;
    if (busy || event.touches.length !== 1 || window.scrollY > 0 || !canStart()) return;
    const point = event.touches[0];
    pull = { x: point.clientX, y: point.clientY, axis: null, armed: false };
  }, { passive: true });

  window.addEventListener('touchmove', event => {
    if (!pull) return;
    const point = event.touches[0];
    const dy = point.clientY - pull.y;
    if (!pull.axis) {
      pull.axis = gestureAxis(point.clientX - pull.x, dy);
      if (!pull.axis) return;
      if (pull.axis !== 'down' || window.scrollY > 0) { // sideways is a tab swipe, up is a scroll
        pull = null;
        return;
      }
      indicator.classList.add('is-pulling');
    }
    if (event.cancelable) event.preventDefault(); // no bounce of the page under the finger
    const distance = pullDistance(dy);
    const armed = distance >= PULL.trigger;
    if (armed !== pull.armed) {
      pull.armed = armed;
      indicator.classList.toggle('is-armed', armed);
      if (armed && navigator.userActivation?.hasBeenActive) navigator.vibrate?.(8);
    }
    place(distance);
  }, { passive: false });

  async function finish(event) {
    if (!pull) return;
    const { axis, armed } = pull;
    pull = null;
    if (axis !== 'down') return;
    indicator.classList.remove('is-pulling'); // from here on it moves by itself
    if (!armed || event.type !== 'touchend') {
      hide();
      return;
    }
    busy = true;
    indicator.classList.add('is-refreshing');
    place(PULL.trigger);
    try {
      await Promise.all([onRefresh(), wait(PULL.minSpinMs)]);
    } finally {
      busy = false;
      hide();
    }
  }
  window.addEventListener('touchend', finish, { passive: true });
  window.addEventListener('touchcancel', finish, { passive: true });
}

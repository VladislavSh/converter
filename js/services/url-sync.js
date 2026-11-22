// Keeps the address bar in step with the open calculation, so the page URL is
// always a link to what is on screen (see core/deep-link.js for the format).
import { TIMING } from '../config.js';
import { buildLink } from '../core/deep-link.js';

/**
 * @returns {() => void} call it after every state change. Writes are delayed
 * and merged: browsers limit how often the history may be rewritten.
 */
export function createUrlSync(state) {
  let timer;
  const write = () => {
    try {
      const next = buildLink(state, location.pathname);
      if (next !== location.pathname + location.search) {
        history.replaceState(history.state, '', next + location.hash);
      }
    } catch { /* sandboxed page or history rate limit: the link is a nicety */ }
  };
  return () => {
    clearTimeout(timer);
    timer = setTimeout(write, TIMING.urlSyncMs);
  };
}

/** An absolute link to the current calculation, for sharing. */
export const currentLink = state => buildLink(state, location.origin + location.pathname);

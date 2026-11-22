// localStorage with the failures swallowed: private mode, a full quota or
// corrupted JSON must never break the app — it just starts from defaults.
import { isSavedState } from '../core/state.js';

export function readJson(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
}

export function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function takeSessionFlag(key) {
  try {
    const set = sessionStorage.getItem(key) !== null;
    if (set) sessionStorage.removeItem(key);
    return set;
  } catch {
    return false;
  }
}

export function setSessionFlag(key) {
  try { sessionStorage.setItem(key, '1'); } catch { /* ignore */ }
}

const STATE_SUFFIX = '_state';
const RATES_SUFFIX = '_rates';

/**
 * The app used to keep its data under keys with another prefix. On the first
 * launch after the rename the old entries are moved to the current keys, so
 * the currency list and purchase settings survive. The old state is found by
 * its shape rather than by name; whatever else is in storage is left alone.
 * @param {Storage} storage
 * @param {{state: string, rates: string}} keys  the current keys
 * @returns {boolean} whether anything was moved
 */
export function adoptEarlierStorage(storage, keys) {
  try {
    if (storage.getItem(keys.state) !== null) return false;
    const names = Array.from({ length: storage.length }, (_, index) => storage.key(index));
    for (const name of names) {
      if (!name?.endsWith(STATE_SUFFIX) || name === keys.state) continue;
      const raw = storage.getItem(name);
      let value = null;
      try { value = JSON.parse(raw); } catch { /* not ours */ }
      if (!isSavedState(value)) continue;

      const ratesName = name.slice(0, -STATE_SUFFIX.length) + RATES_SUFFIX;
      const rates = storage.getItem(ratesName);
      storage.setItem(keys.state, raw);
      if (rates !== null && storage.getItem(keys.rates) === null) storage.setItem(keys.rates, rates);
      storage.removeItem(name);
      storage.removeItem(ratesName);
      return true;
    }
  } catch { /* storage unavailable */ }
  return false;
}

/** Removes a sessionStorage entry; does nothing when storage is blocked. */
export function clearSessionFlag(key) {
  try {
    sessionStorage.removeItem(key);
  } catch { /* storage blocked */ }
}

// localStorage with the failures swallowed: private mode, a full quota or
// corrupted JSON must never break the app — it just starts from defaults.

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

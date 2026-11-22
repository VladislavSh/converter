// Entry point: builds the state, creates the views and keeps rates fresh.
import { APP_VERSION, STORAGE_KEYS, TIMING } from './config.js';
import { applyDeepLink } from './core/deep-link.js';
import { isKnownCurrency } from './core/names.js';
import { convert, restoreSnapshot } from './core/rates.js';
import { buildState } from './core/state.js';
import { localeOf, translate } from './i18n.js';
import { loadLatestRates } from './services/rates-api.js';
import { adoptEarlierStorage, readJson, takeSessionFlag, writeJson } from './services/storage.js';
import { registerServiceWorker } from './services/sw-update.js';
import { createUrlSync, currentLink } from './services/url-sync.js';
import { installFlagFallback } from './ui/badge.js';
import { createConverterView } from './ui/converter.js';
import { $, createToast, shareText } from './ui/dom.js';
import { createPickerView } from './ui/picker.js';
import { createPurchaseView } from './ui/purchase.js';
import { createShell } from './ui/shell.js';

try { adoptEarlierStorage(localStorage, STORAGE_KEYS); } catch { /* storage blocked */ }

const state = buildState(readJson(STORAGE_KEYS.state), {
  language: navigator.language,
  prefersLight: matchMedia('(prefers-color-scheme: light)').matches
});
// A link to a calculation (?mode=…) wins over what was saved on this device
applyDeepLink(state, location.search, isKnownCurrency);
let snapshot = restoreSnapshot(readJson(STORAGE_KEYS.rates));

const syncUrl = createUrlSync(state);
const toast = createToast($('#toast'), TIMING.toastMs);

// What every view gets: the state plus a few services. Views never touch
// storage, the network or the address bar themselves.
const app = {
  state,
  get rates() { return snapshot; },
  t: (key, vars) => translate(state.lang, key, vars),
  locale: () => localeOf(state.lang),
  convert: (value, from, to) => (snapshot ? convert(snapshot.rates, value, from, to) : null),
  save: () => {
    writeJson(STORAGE_KEYS.state, state);
    syncUrl();
  },
  toast,
  /** A link that opens the current tab with the same numbers. */
  link: () => currentLink(state),
  /** Opens the system share sheet, or copies the text where there is none. */
  share: async text => {
    const outcome = await shareText(text);
    if (outcome === 'copied') toast(translate(state.lang, 'shareCopied'));
    else if (outcome === 'failed') toast(translate(state.lang, 'copyFailed'));
  }
};

installFlagFallback();
const shell = createShell(app, {
  onRefresh: () => refreshRates({ manual: true }),
  onLanguageChange: renderAll,
  // the converter may have been built while its tab was hidden (zero widths)
  onViewChange: view => { if (view === 'convert') converter.render(); }
});
const picker = createPickerView(app, { onListChange: () => converter.render() });
const converter = createConverterView(app, { onEditList: () => picker.open() });
const purchase = createPurchaseView(app);

function renderAll() {
  converter.render();
  purchase.render();
}

let refreshing = false;
async function refreshRates({ manual = false } = {}) {
  if (refreshing) return;
  refreshing = true;
  shell.setRefreshing(true);
  const firstLoad = !snapshot;
  if (firstLoad) shell.setStatus('loading');
  let fresh = false;
  try {
    const result = await loadLatestRates(snapshot);
    fresh = result.fresh;
    if (result.snapshot) {
      snapshot = result.snapshot;
      writeJson(STORAGE_KEYS.rates, snapshot);
    }
  } catch {
    // loadLatestRates reports failures through `fresh`; this is a last resort
  } finally {
    refreshing = false;
    shell.setRefreshing(false);
  }
  shell.setStatus(fresh ? 'ok' : 'error');
  renderAll();
  // An open currency list is rebuilt only when rates arrive for the first time
  // (it then learns every currency); later refreshes would drop focus and scroll.
  if (firstLoad && snapshot) picker.render();
  if (manual) app.toast(app.t(fresh ? 'ratesRefreshed' : 'ratesFailed'));
}

// ---------- boot ----------
app.save(); // persist migrations right away
shell.applyTheme();
shell.setView(state.view);
shell.applyTexts();
shell.setStatus(snapshot ? (navigator.onLine ? 'ok' : 'offline') : 'loading');
renderAll();

if (takeSessionFlag(STORAGE_KEYS.updatedFlag)) {
  setTimeout(() => app.toast(app.t('updatedTo', { v: APP_VERSION })), TIMING.splashMaxCachedMs);
}

// The splash stays for a moment even when rates arrive instantly, and never
// longer than the limit when the network is slow.
const startedAt = performance.now();
let splashGone = false;
function dismissSplash() {
  if (splashGone) return;
  splashGone = true;
  const wait = Math.max(0, TIMING.splashMinMs - (performance.now() - startedAt));
  setTimeout(() => {
    shell.hideSplash();
    document.body.classList.add('is-ready');
  }, wait);
}
const splashLimit = setTimeout(dismissSplash, snapshot ? TIMING.splashMaxCachedMs : TIMING.splashMaxMs);
refreshRates().finally(() => {
  clearTimeout(splashLimit);
  dismissSplash();
});

window.addEventListener('online', () => refreshRates());
window.addEventListener('offline', () => shell.setStatus('offline'));
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && (!snapshot || Date.now() - snapshot.ts > TIMING.ratesStaleMs)) refreshRates();
});
setInterval(() => { if (!document.hidden) refreshRates(); }, TIMING.ratesPollMs);

registerServiceWorker();

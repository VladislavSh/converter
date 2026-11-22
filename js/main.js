// Entry point: builds the state, creates the views and keeps every rate source
// fresh — the market rates and both banks, on start and on every refresh.
import { APP_VERSION, RATE_SOURCES, STORAGE_KEYS, TIMING } from './config.js';
import { restoreBankCache } from './core/bank-rates.js';
import { applyDeepLink } from './core/deep-link.js';
import { isKnownCurrency } from './core/names.js';
import { KAPITAL, resolveSource, sourceSummary, sourceTable } from './core/rate-sources.js';
import { convert, restoreSnapshot } from './core/rates.js';
import { buildState, restoreDroppedSum, startOrderInYuan, startWithoutDelivery } from './core/state.js';
import { localeOf, translate } from './i18n.js';
import { loadBankBoard } from './services/bank-rates-api.js';
import { loadLatestRates } from './services/rates-api.js';
import { adoptEarlierStorage, clearSessionFlag, readJson, takeSessionFlag, writeJson } from './services/storage.js';
import { registerServiceWorker } from './services/sw-update.js';
import { createUrlSync, currentLink } from './services/url-sync.js';
import { installFlagFallback } from './ui/badge.js';
import { createBanksView } from './ui/banks.js';
import { createClipboardHint } from './ui/clipboard-hint.js';
import { createConverterView } from './ui/converter.js';
import { createKeypad } from './ui/keypad.js';
import { $, createToast, shareText } from './ui/dom.js';
import { createPickerView } from './ui/picker.js';
import { createPullToRefresh } from './ui/pull-refresh.js';
import { createPurchaseView } from './ui/purchase.js';
import { createRatesView } from './ui/rates.js';
import { createShell } from './ui/shell.js';

const BANKS = ['cbu', 'nbu'];

try { adoptEarlierStorage(localStorage, STORAGE_KEYS); } catch { /* storage blocked */ }

const saved = readJson(STORAGE_KEYS.state);
const state = buildState(saved, {
  language: navigator.language,
  prefersLight: matchMedia('(prefers-color-scheme: light)').matches
});
startWithoutDelivery(state);
startOrderInYuan(state);
// A link to a calculation (?mode=…) wins over what was saved on this device
applyDeepLink(state, location.search, isKnownCurrency);
restoreDroppedSum(state, Number.isInteger(saved?.v) ? saved.v : null);
let snapshot = restoreSnapshot(readJson(STORAGE_KEYS.rates));
let banks = restoreBankCache(readJson(STORAGE_KEYS.banks));
const bankStatus = { cbu: 'idle', nbu: 'idle' }; // 'loading' | 'ok' | 'failed'

// The table calculations run on: the market rates with the chosen source's
// rates put in, by the buy or the sell prices of a bank that has both. One
// table per side, rebuilt only when the market rates or that source change.
const tablesInUse = {};
function ratesInUse(side) {
  if (!snapshot) return null;
  const { kind, source } = resolveSource(state, banks, side);
  const key = `${snapshot.ts}|${state.rateSource}|${kind === 'bank' && source?.ts ? source.ts : JSON.stringify(source)}`;
  if (tablesInUse[side]?.key !== key) tablesInUse[side] = { key, table: sourceTable(snapshot.rates, source) };
  return tablesInUse[side].table;
}

const syncUrl = createUrlSync(state);
const toast = createToast($('#toast'), TIMING.toastMs);
const t = (key, vars) => translate(state.lang, key, vars);

// What every view gets: the state plus a few services. Views never touch
// storage, the network or the address bar themselves.
const app = {
  state,
  get rates() { return snapshot; },
  /** The bank boards as loaded: {cbu, nbu}, each null until it arrives. */
  get banks() { return banks; },
  get bankStatus() { return bankStatus; },
  t,
  locale: () => localeOf(state.lang),
  /**
   * With the chosen rate source; null while there are no rates.
   * @param {'buy'|'sell'} [side]  a bank's buy or sell prices; the converter's choice by default
   */
  convert: (value, from, to, side = state.rateSide) => convert(ratesInUse(side), value, from, to),
  /** Always by the market rates, to compare a source of one's own with. */
  marketConvert: (value, from, to) => (snapshot ? convert(snapshot.rates, value, from, to) : null),
  /** The source in use: {id, kind, source, missing, side, twoSided}. */
  rateSource: (side = state.rateSide) => resolveSource(state, banks, side),
  /** What a source is called: the market one by the service it comes from. */
  sourceName: id => {
    if (id === 'market') return snapshot?.source || RATE_SOURCES.fiatPrimary.name;
    if (id === 'cbu') return t('bankCbu');
    if (id === 'nbu') return t('bankNbu');
    if (id === KAPITAL) return t('bankKapital');
    return state.sources.find(source => source.id === id)?.name ?? '';
  },
  /** One line under a source's name in the lists: how fresh it is, or what is in it. */
  sourceNote: id => {
    if (id === 'market') return t('rateMarketNote');
    if (id === KAPITAL) {
      const { rates, date } = state.kapital;
      if (!rates.length) return t('srcKapitalEmpty');
      return date ? t('srcKapitalNote', { date }) : t('srcKapitalNoDate');
    }
    if (BANKS.includes(id)) {
      const board = banks[id];
      if (!board) return t(bankStatus[id] === 'loading' ? 'bankLoading' : 'srcNotLoaded');
      return t(id === 'cbu' ? 'srcCbuNote' : 'srcNbuNote', { date: board.date });
    }
    const own = state.sources.find(source => source.id === id);
    return own ? sourceSummary(own, localeOf(state.lang), 3) : '';
  },
  /**
   * One line for a shared calculation, when its numbers are not the market ones.
   * @param {'buy'|'sell'} [side]  which prices of a bank with two of them were used
   */
  rateNote: (side = state.rateSide) => {
    const { kind, id, source, missing, twoSided } = resolveSource(state, banks, side);
    if (kind === 'market' || missing) return null;
    if (kind === 'bank') {
      // "Курсы: Капиталбанк, покупка, на 22.11.2026 (1 USD = 11 950 UZS · …)"
      const sideWord = t(side === 'sell' ? 'sideSell' : 'sideBuy').toLocaleLowerCase(localeOf(state.lang));
      const name = twoSided ? `${app.sourceName(id)}, ${sideWord},` : app.sourceName(id);
      const line = source.date ? t('shareSourceBank', { name, date: source.date }) : t('shareSourceNoDate', { name: name.replace(/,$/, '') });
      return id === KAPITAL ? `${line} (${sourceSummary(source, localeOf(state.lang), 3)})` : line;
    }
    return t('shareSourceOwn', { name: source.name, rates: sourceSummary(source, localeOf(state.lang), 3) });
  },
  save: () => {
    writeJson(STORAGE_KEYS.state, state);
    syncUrl();
  },
  toast,
  /** Text the user pasted some other way: the clipboard bar does not offer it again. */
  markClipboard: text => clipHint?.markHandled(text),
  /** A link that opens the current tab with the same numbers. */
  link: () => currentLink(state),
  /** Opens the system share sheet, or copies the text where there is none. */
  share: async text => {
    const outcome = await shareText(text);
    if (outcome === 'copied') toast(t('shareCopied'));
    else if (outcome === 'failed') toast(t('copyFailed'));
  }
};

installFlagFallback();
const keypad = createKeypad(app);
const shell = createShell(app, {
  onRefresh: () => refreshRates({ manual: true }),
  onLanguageChange: renderAll,
  // the converter may have been built while its tab was hidden (zero widths)
  onViewChange: view => {
    if (view === 'convert') converter.render();
    else if (view === 'shop') purchase.takeAmount(); // the amount typed on the main screen becomes the price
    rateSources.render(); // the bar names the buy or the sell side of the tab
  }
});
const picker = createPickerView(app, { onListChange: () => converter.render() });
const converter = createConverterView(app, { onEditList: () => picker.open(), keypad, onSideChange: () => renderAll() });
const purchase = createPurchaseView(app, { keypad });
const rateSources = createRatesView(app, { onChange: renderAll });
const bankView = createBanksView(app, {
  onSourceChange: renderAll,
  onAddSource: () => rateSources.add(),
  onEditSource: id => rateSources.edit(id)
});

// An amount just copied elsewhere is offered on return; it goes where the user is
const clipHint = createClipboardHint(app, {
  onApply: pasted => (state.view === 'shop' ? purchase.applyPasted(pasted) : converter.applyPasted(pasted))
});

// Pulling the page down from its top refreshes every source, like the button
createPullToRefresh({
  indicator: $('#ptr'),
  canStart: () => document.body.classList.contains('is-ready')
    && !document.body.classList.contains('has-keypad')
    && !document.querySelector('.sheet.is-open'),
  onRefresh: () => refreshRates({ manual: true })
});

function renderAll() {
  clipHint.render();
  converter.render();
  purchase.render();
  rateSources.render();
  bankView.render();
}

/**
 * Loads one bank's board. Each bank is shown as soon as it answers; one that
 * is slow or unreachable (the National Bank answers only inside Uzbekistan)
 * never holds the others back. A bank that does not answer keeps its last board.
 */
async function refreshBank(bank, force) {
  const board = banks[bank];
  if (bankStatus[bank] === 'loading' || (!force && board && Date.now() - board.ts < TIMING.ratesStaleMs)) return;
  bankStatus[bank] = 'loading';
  renderAll();
  const fresh = await loadBankBoard(bank);
  bankStatus[bank] = fresh ? 'ok' : 'failed';
  if (fresh) {
    banks = { ...banks, [bank]: fresh };
    writeJson(STORAGE_KEYS.banks, banks);
  }
  renderAll();
}

let refreshing = false;
/**
 * Every source at once: the market rates and both banks.
 * @param {{manual?: boolean, all?: boolean}} [options]  manual: the refresh
 *   button (reports the outcome); all: reload the banks even if just loaded
 */
async function refreshRates({ manual = false, all = manual } = {}) {
  const bankLoads = Promise.all(BANKS.map(bank => refreshBank(bank, all)));
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
  if (manual) {
    await bankLoads;
    const banksOk = BANKS.filter(bank => bankStatus[bank] === 'ok').length;
    app.toast(t(fresh ? 'ratesRefreshedAll' : 'ratesFailed', { n: banksOk, total: BANKS.length }));
  }
}

// ---------- boot ----------
app.save(); // persist migrations right away
shell.applyTheme();
shell.setView(state.view);
shell.applyTexts();
shell.setStatus(snapshot ? (navigator.onLine ? 'ok' : 'offline') : 'loading');
renderAll();

if (takeSessionFlag(STORAGE_KEYS.updatedFlag)) {
  setTimeout(() => app.toast(t('updatedTo', { v: APP_VERSION })), TIMING.splashMaxCachedMs);
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
    document.body.classList.add('is-ready', 'is-entering'); // the cards rise in, one after another
    setTimeout(() => document.body.classList.remove('is-entering'), TIMING.enterMs);
    clearSessionFlag(STORAGE_KEYS.retryFlag); // the app started: js/boot-guard.js may retry again next time
  }, wait);
}
const splashLimit = setTimeout(dismissSplash, snapshot ? TIMING.splashMaxCachedMs : TIMING.splashMaxMs);
// Every source is loaded fresh on start, whatever was cached
refreshRates({ all: true }).finally(() => {
  clearTimeout(splashLimit);
  dismissSplash();
  clipHint.check(); // a price copied before the app was opened
});

window.addEventListener('online', () => refreshRates());
window.addEventListener('offline', () => shell.setStatus('offline'));
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && (!snapshot || Date.now() - snapshot.ts > TIMING.ratesStaleMs)) refreshRates();
});
setInterval(() => { if (!document.hidden) refreshRates(); }, TIMING.ratesPollMs);

registerServiceWorker();

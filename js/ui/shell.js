// App chrome: theme, language, rates status line, the two view tabs, splash
// screen, footer and installing the app to the home screen.
import { APP_NAME, APP_VERSION, RATE_SOURCES, STORAGE_KEYS } from '../config.js';
import { APP_DISPLAY_MODES, INSTALL_STEPS, installPlatform, isInstalled, showInstallButton } from '../core/install.js';
import { VIEWS } from '../core/state.js';
import { stepView, swipeStep } from '../core/swipe.js';
import { $, $$, createSheet } from './dom.js';

const THEME_COLORS = { light: '#F4F5FB', dark: '#0B0B14' };
const SPLASH_FADE_MS = 700;
const INSTALLABLE_EVENT = 'cartrate:installable'; // sent by js/install-early.js
// How long a tap on "Install" waits for the browser's offer. A browser lets a
// page open its install dialog only within about 5 s of the tap.
const PROMPT_WAIT_MS = 3000;

export function createShell(app, { onRefresh, onLanguageChange, onViewChange }) {
  const el = {
    splash: $('#splash'),
    metaTheme: $('#meta-theme'),
    theme: $('#theme-btn'),
    lang: $('#lang-btn'),
    langLabel: $('#lang-label'),
    status: $('#status'),
    statusText: $('#status-text'),
    refresh: $('#refresh-btn'),
    tabs: $$('.view-tab'),
    views: { convert: $('#view-convert'), shop: $('#view-shop'), banks: $('#view-banks') },
    installButtons: $$('[data-install]'),
    installSteps: $('#install-steps'),
    source: $('#source-text'),
    version: $('#version-text')
  };
  let statusKind = 'loading';

  function applyTheme() {
    const { theme } = app.state;
    document.documentElement.dataset.theme = theme;
    el.metaTheme.setAttribute('content', THEME_COLORS[theme]);
  }

  /** Fills every static text; views render their own dynamic parts. */
  function applyTexts() {
    const { t } = app;
    document.documentElement.lang = app.state.lang;
    document.title = `${APP_NAME} — ${t('subtitle').toLowerCase()}`;
    $$('[data-i18n]').forEach(node => { node.textContent = t(node.dataset.i18n); });
    $$('[data-i18n-ph]').forEach(node => { node.placeholder = t(node.dataset.i18nPh); });
    $$('[data-i18n-aria]').forEach(node => { node.setAttribute('aria-label', t(node.dataset.i18nAria)); });
    el.langLabel.textContent = app.state.lang.toUpperCase();
    el.source.textContent = t('sources', {
      list: [RATE_SOURCES.fiatPrimary.name, RATE_SOURCES.fiatFallback.name, RATE_SOURCES.crypto.name].join(', ')
    });
    el.version.textContent = t('version', { v: APP_VERSION });
    renderInstallSteps();
    setStatus();
  }

  /** @param {'loading'|'ok'|'offline'|'error'} [kind] omitted = repaint the current one */
  function setStatus(kind = statusKind) {
    statusKind = kind;
    const { t } = app;
    const snapshot = app.rates;
    let mood = 'ok';
    let text;
    if (!snapshot) {
      mood = kind === 'loading' ? 'loading' : 'error';
      text = t(kind === 'loading' ? 'loading' : 'ratesNone');
    } else {
      const when = new Date(snapshot.ts).toLocaleString(app.locale(), {
        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
      });
      if (kind === 'offline' || (kind === 'error' && !navigator.onLine)) {
        mood = 'offline';
        text = t('ratesOffline', { when });
      } else if (kind === 'error') {
        mood = 'error';
        text = t('ratesStale', { when });
      } else {
        text = t('ratesUpdated', { when });
      }
    }
    el.status.dataset.mood = mood;
    el.statusText.textContent = text;
  }

  function setView(view) {
    app.state.view = VIEWS.includes(view) ? view : 'convert';
    document.body.dataset.view = app.state.view; // the Banks tab hides the "Rate" bar
    el.tabs.forEach(tab => {
      const active = tab.dataset.view === app.state.view;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', String(active));
    });
    for (const [name, node] of Object.entries(el.views)) node.hidden = name !== app.state.view;
  }

  function setRefreshing(on) {
    el.refresh.classList.toggle('is-spinning', on);
  }

  function hideSplash() {
    if (!el.splash.isConnected) return;
    el.splash.classList.add('is-hidden');
    setTimeout(() => el.splash.remove(), SPLASH_FADE_MS);
  }

  el.theme.addEventListener('click', () => {
    app.state.theme = app.state.theme === 'dark' ? 'light' : 'dark';
    applyTheme();
    app.save();
  });
  el.lang.addEventListener('click', () => {
    app.state.lang = app.state.lang === 'ru' ? 'en' : 'ru';
    applyTexts();
    app.save();
    onLanguageChange();
  });
  el.refresh.addEventListener('click', () => onRefresh());
  /** Opens a tab; it slides in from the side it is on. */
  function goTo(view) {
    if (view === app.state.view || !VIEWS.includes(view)) return;
    const direction = Math.sign(VIEWS.indexOf(view) - VIEWS.indexOf(app.state.view));
    setView(view);
    const node = el.views[view];
    node.classList.remove('view-enter-next', 'view-enter-prev');
    void node.offsetWidth; // restart the animation
    node.classList.add(direction > 0 ? 'view-enter-next' : 'view-enter-prev');
    app.save();
    onViewChange(app.state.view);
  }
  el.tabs.forEach(tab => tab.addEventListener('click', () => goTo(tab.dataset.view)));

  // Swiping the page left or right goes to the next or the previous tab. Not
  // from places that scroll sideways or take text, not while the keypad is
  // up, and not from the screen edges, where the system's back gesture is.
  const NO_SWIPE = 'input, textarea, select, .src-tabs, .presets, .keypad, [data-no-swipe]';
  const swipeArea = $('main');
  let touch = null;
  swipeArea.addEventListener('touchstart', event => {
    const point = event.touches[0];
    touch = event.touches.length === 1 && !event.target.closest(NO_SWIPE)
      ? { x: point.clientX, y: point.clientY, time: event.timeStamp }
      : null;
  }, { passive: true });
  swipeArea.addEventListener('touchend', event => {
    if (!touch) return;
    const point = event.changedTouches[0];
    const step = swipeStep({
      dx: point.clientX - touch.x, dy: point.clientY - touch.y, dt: event.timeStamp - touch.time,
      startX: touch.x, width: window.innerWidth
    });
    touch = null;
    if (!step || document.body.classList.contains('has-keypad') || String(getSelection?.() ?? '')) return;
    const next = stepView(VIEWS, app.state.view, step);
    if (next) goTo(next);
  }, { passive: true });
  swipeArea.addEventListener('touchcancel', () => { touch = null; }, { passive: true });

  // ---------- installing to the home screen ----------
  // Chrome, Edge and other Chromium browsers: the button opens the browser's
  // own install dialog. The steps by hand are shown only where a page cannot
  // ask for that (Safari on iPhone, Firefox) or the browser declined to.
  const platform = installPlatform(navigator);
  const installGuide = createSheet($('#install-sheet'), $('#app'));
  const promptSupported = 'onbeforeinstallprompt' in window;
  let installing = false;

  /**
   * The browser's install offer, caught by js/install-early.js. Right after the
   * page opens it may still be on its way, so it is waited for a moment.
   */
  function installOffer() {
    if (window.cartrateInstallPrompt || !promptSupported) return Promise.resolve(window.cartrateInstallPrompt ?? null);
    app.toast(app.t('installWait'));
    return new Promise(resolve => {
      const done = () => {
        clearTimeout(timer);
        window.removeEventListener(INSTALLABLE_EVENT, done);
        resolve(window.cartrateInstallPrompt ?? null);
      };
      const timer = setTimeout(done, PROMPT_WAIT_MS);
      window.addEventListener(INSTALLABLE_EVENT, done);
    });
  }

  function renderInstallSteps() {
    el.installSteps.replaceChildren(...INSTALL_STEPS[platform].map(key => {
      const step = document.createElement('li');
      step.textContent = app.t(key);
      return step;
    }));
  }

  // Whether the app is installed on this device is remembered, so that after
  // installing, "Install" disappears from the browser tab too — not only from
  // the installed app. The installed app and the browser share this storage.
  const standalone = isInstalled({
    standaloneDisplay: APP_DISPLAY_MODES.some(mode => matchMedia(`(display-mode: ${mode})`).matches),
    iosStandalone: navigator.standalone
  });
  const rememberInstalled = installed => {
    try {
      if (installed) localStorage.setItem(STORAGE_KEYS.installed, '1');
      else localStorage.removeItem(STORAGE_KEYS.installed);
    } catch { /* storage blocked: the button simply follows the browser */ }
  };
  const rememberedInstalled = () => {
    try { return localStorage.getItem(STORAGE_KEYS.installed) === '1'; } catch { return false; }
  };
  function refreshInstall() {
    const visible = showInstallButton({
      standalone, offered: Boolean(window.cartrateInstallPrompt), remembered: rememberedInstalled()
    });
    el.installButtons.forEach(button => { button.hidden = !visible; });
  }
  const installed = () => {
    rememberInstalled(true);
    refreshInstall();
  };

  if (standalone) rememberInstalled(true);
  // The browser offers installation only while the app is not on the device
  if (window.cartrateInstallPrompt) rememberInstalled(false);
  window.addEventListener(INSTALLABLE_EVENT, () => {
    rememberInstalled(false);
    refreshInstall();
  });
  refreshInstall();

  // Chrome on Android also knows when this app is already on the home screen
  // (manifest "related_applications"): then there is nothing to install.
  navigator.getInstalledRelatedApps?.()
    .then(apps => { if (apps.length) installed(); })
    .catch(() => {});

  window.addEventListener('appinstalled', () => {
    window.cartrateInstallPrompt = null;
    installed();
    installGuide.close();
  });
  el.installButtons.forEach(button => button.addEventListener('click', async () => {
    if (installing) return;
    installing = true;
    try {
      const offer = await installOffer();
      if (!offer) {
        installGuide.open();
        return;
      }
      window.cartrateInstallPrompt = null; // an offer can be shown only once
      try {
        await offer.prompt();
      } catch {
        installGuide.open(); // the browser refused to show its dialog
        return;
      }
      const choice = await offer.userChoice.catch(() => null);
      if (choice?.outcome === 'accepted') installed();
    } finally {
      installing = false;
    }
  }));

  return { applyTheme, applyTexts, setStatus, setView, goTo, setRefreshing, hideSplash };
}

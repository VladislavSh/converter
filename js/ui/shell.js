// App chrome: theme, language, rates status line, the two view tabs, splash
// screen, footer and the "Install" button.
import { APP_NAME, APP_VERSION, RATE_SOURCES } from '../config.js';
import { $, $$ } from './dom.js';

const THEME_COLORS = { light: '#F4F5FB', dark: '#0B0B14' };
const SPLASH_FADE_MS = 700;

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
    views: { convert: $('#view-convert'), shop: $('#view-shop') },
    install: $('#install-btn'),
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
    app.state.view = view === 'shop' ? 'shop' : 'convert';
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
  el.tabs.forEach(tab => tab.addEventListener('click', () => {
    setView(tab.dataset.view);
    app.save();
    onViewChange(app.state.view);
  }));

  // "Install" appears only when the browser offers installation
  let installPrompt = null;
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installPrompt = event;
    el.install.hidden = false;
  });
  window.addEventListener('appinstalled', () => { el.install.hidden = true; });
  el.install.addEventListener('click', async () => {
    if (!installPrompt) return;
    const prompt = installPrompt;
    installPrompt = null;
    el.install.hidden = true;
    prompt.prompt();
    await prompt.userChoice.catch(() => {});
  });

  return { applyTheme, applyTexts, setStatus, setView, setRefreshing, hideSplash };
}

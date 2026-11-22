// Checks that hold the project together: translations, versions, the offline
// file list, and the "nothing but our own files and three rate APIs" rule.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, posix, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { APP_NAME, APP_VERSION, RATE_SOURCES, STORAGE_KEYS } from '../js/config.js';
import { DEFAULT_LIST, FLAG_OVERRIDE, POPULAR } from '../js/data/currencies.js';
import { LANGS, MESSAGES, translate } from '../js/i18n.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => readFileSync(join(ROOT, path), 'utf8');
const walk = dir => readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap(entry =>
  (entry.isDirectory() ? walk(posix.join(dir, entry.name)) : [posix.join(dir, entry.name)]));

const html = read('index.html');
const sw = read('sw.js');
const jsFiles = walk('js');
const jsSources = Object.fromEntries(jsFiles.map(file => [file, read(file)]));
const allJs = Object.values(jsSources).join('\n');

// ---------- translations ----------

test('both languages have exactly the same keys', () => {
  assert.deepEqual(LANGS, Object.keys(MESSAGES));
  assert.deepEqual(Object.keys(MESSAGES.en).sort(), Object.keys(MESSAGES.ru).sort());
});

test('placeholders match between languages', () => {
  const holes = text => [...text.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();
  for (const key of Object.keys(MESSAGES.ru)) {
    assert.deepEqual(holes(MESSAGES.en[key]), holes(MESSAGES.ru[key]), key);
  }
});

test('every key used in index.html exists', () => {
  const used = [...html.matchAll(/data-i18n(?:-ph|-aria)?="([^"]+)"/g)].map(m => m[1]);
  assert.ok(used.length > 40, 'the page is translated through data-i18n attributes');
  for (const key of used) assert.ok(key in MESSAGES.ru, `missing translation: ${key}`);
});

test('every key passed to t() exists', () => {
  // The first argument of a call: everything up to the first top-level "," or ")"
  const firstArgument = text => {
    let depth = 0;
    let quote = '';
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (quote) { if (ch === quote && text[i - 1] !== '\\') quote = ''; continue; }
      if (ch === "'" || ch === '"' || ch === '`') quote = ch;
      else if (ch === '(') depth++;
      else if ((ch === ')' || ch === ',') && depth === 0) return text.slice(0, i);
      else if (ch === ')') depth--;
    }
    return text;
  };
  const used = new Set();
  for (const call of allJs.matchAll(/\bt\(/g)) {
    const argument = firstArgument(allJs.slice(call.index + 2, call.index + 300))
      .replace(/[=!]==?\s*'[^']*'/g, ''); // strings it is merely compared against
    for (const literal of argument.matchAll(/'([A-Za-z][A-Za-z0-9]*)'/g)) used.add(literal[1]);
  }
  assert.ok(used.size > 40);
  for (const key of used) assert.ok(key in MESSAGES.ru, `missing translation: ${key}`);
});

test('no translation is left unused', () => {
  for (const key of Object.keys(MESSAGES.ru)) {
    const inHtml = new RegExp(`data-i18n(?:-ph|-aria)?="${key}"`).test(html);
    const inJs = allJs.replace(jsSources['js/i18n.js'], '').includes(`'${key}'`);
    assert.ok(inHtml || inJs, `unused translation: ${key}`);
  }
});

test('translate fills placeholders and falls back safely', () => {
  assert.equal(translate('ru', 'version', { v: '1.2.3' }), 'Версия 1.2.3');
  assert.equal(translate('en', 'copied', { text: '5 USD' }), 'Copied: 5 USD');
  assert.equal(translate('xx', 'close'), 'Закрыть', 'unknown language → Russian');
  assert.equal(translate('ru', 'noSuchKey'), 'noSuchKey', 'unknown key → the key itself');
  assert.equal(translate('ru', 'version', {}), 'Версия {v}', 'a missing value is left visible, not "undefined"');
});

// ---------- versions ----------

test('the version is the same everywhere', () => {
  assert.match(APP_VERSION, /^\d+\.\d+\.\d+$/);
  assert.equal(sw.match(/const VERSION = `\$\{PREFIX\}([^`]+)`/)[1], APP_VERSION, 'sw.js');
  assert.equal(JSON.parse(read('package.json')).version, APP_VERSION, 'package.json');
  const queries = [...html.matchAll(/\?v=([\d.]+)/g)].map(m => m[1]);
  assert.ok(queries.length >= 3);
  for (const version of queries) assert.equal(version, APP_VERSION, 'index.html ?v=');
});

// ---------- offline file list ----------

const shell = [...sw.match(/const SHELL = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map(m => m[1]);

test('every file the service worker precaches exists', () => {
  for (const file of shell) {
    if (file === './') continue;
    assert.ok(existsSync(join(ROOT, file)), `sw.js lists a missing file: ${file} (the install would fail)`);
  }
});

test('every script, style and font the page needs is precached', () => {
  const needed = [...jsFiles, ...walk('css'), ...walk('fonts').filter(f => f.endsWith('.woff2')), 'index.html', 'manifest.webmanifest'];
  for (const file of needed) assert.ok(shell.includes(file), `not available offline: ${file}`);
});

/** Runs sw.js against a fake Cache Storage and returns its event handlers. */
function loadServiceWorker(stored) {
  const scope = 'https://example.github.io/converter/';
  const handlers = {};
  const cacheStorage = {
    keys: async () => Object.keys(stored),
    open: async name => ({ keys: async () => (stored[name] ?? []).map(url => ({ url })) }),
    delete: async name => delete stored[name]
  };
  const context = vm.createContext({
    self: {
      addEventListener: (type, handler) => { handlers[type] = handler; },
      registration: { scope },
      clients: { claim: async () => {} },
      skipWaiting: async () => {}
    },
    caches: cacheStorage,
    location: new URL(scope),
    URL
  });
  vm.runInContext(sw, context);
  return handlers;
}

test('the service worker removes its own old caches and nobody else\'s', async () => {
  // Cache Storage is shared by all GitHub Pages projects of one account
  const app = 'https://example.github.io/converter/';
  const stored = {
    [`cartrate-${APP_VERSION}`]: [`${app}index.html`],
    'cartrate-flags': [`${app}icons/flags/us.svg`],
    'cartrate-1.0.0': [`${app}index.html`],
    'earlier-name-1.6.0': [`${app}index.html`, `${app}js/main.js`],
    'another-site-v1': ['https://example.github.io/blog/index.html'],
    'mixed-cache': [`${app}index.html`, 'https://example.github.io/blog/app.js'],
    'empty-cache': []
  };
  let done;
  loadServiceWorker(stored).activate({ waitUntil: promise => { done = promise; } });
  await done;
  assert.deepEqual(Object.keys(stored).sort(), [
    'another-site-v1', 'cartrate-flags', `cartrate-${APP_VERSION}`, 'empty-cache', 'mixed-cache'
  ].sort());
});

test('every script parses', () => {
  for (const file of [...jsFiles, 'sw.js']) {
    assert.doesNotThrow(
      () => execFileSync(process.execPath, ['--check', join(ROOT, file)], { stdio: 'pipe' }),
      `syntax error in ${file}`
    );
  }
});

test('the app is called CartRate everywhere a name is shown', () => {
  assert.equal(APP_NAME, 'CartRate');
  assert.match(html, /<title>CartRate — /);
  assert.match(html, /<h1 class="brand__title">CartRate<\/h1>/);
  const manifest = JSON.parse(read('manifest.webmanifest'));
  assert.equal(manifest.short_name, 'CartRate');
  assert.match(manifest.name, /^CartRate/);
  assert.equal(JSON.parse(read('package.json')).name, 'cartrate');
  for (const key of Object.values(STORAGE_KEYS)) assert.match(key, /^cartrate_/);
  // theme-init.js runs before the modules and cannot import the key
  assert.ok(read('js/theme-init.js').includes(`'${STORAGE_KEYS.state}'`));
  // the same for the start-up guard and its retry counter
  assert.ok(read('js/boot-guard.js').includes(`'${STORAGE_KEYS.retryFlag}'`));
});

test('every import points to an existing file', () => {
  for (const [file, source] of Object.entries(jsSources)) {
    for (const match of source.matchAll(/from '(\.[^']+)'/g)) {
      const target = posix.join(posix.dirname(file), match[1]);
      assert.ok(existsSync(join(ROOT, target)), `${file} imports missing ${match[1]}`);
    }
  }
});

test('every element the scripts look up exists in index.html', () => {
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]));
  for (const [file, source] of Object.entries(jsSources)) {
    for (const match of source.matchAll(/\$\('#([\w-]+)'/g)) {
      assert.ok(ids.has(match[1]), `${file} looks for #${match[1]}, which is not in index.html`);
    }
  }
});

test('flags for the default and popular currencies are bundled', () => {
  for (const code of new Set([...DEFAULT_LIST, ...POPULAR])) {
    const country = FLAG_OVERRIDE[code] ?? code.slice(0, 2).toLowerCase();
    assert.ok(existsSync(join(ROOT, 'icons/flags', `${country}.svg`)), `no flag for ${code}`);
  }
});

// ---------- privacy and security ----------

const ALLOWED_HOSTS = [
  RATE_SOURCES.fiatPrimary.url, RATE_SOURCES.fiatFallback.url, RATE_SOURCES.crypto.url('x'),
  RATE_SOURCES.cbu.url, RATE_SOURCES.nbu.url
].map(url => new URL(url).host);

test('the app talks only to the rate APIs and the two banks', () => {
  const sources = { 'index.html': html, 'sw.js': sw, ...jsSources, ...Object.fromEntries(walk('css').map(f => [f, read(f)])) };
  for (const [file, source] of Object.entries(sources)) {
    for (const match of source.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)) {
      const host = match[1].toLowerCase();
      if (host === 'www.w3.org') continue; // SVG namespace, never requested
      assert.ok(ALLOWED_HOSTS.includes(host), `${file} mentions ${host}`);
    }
  }
});

test('the Content-Security-Policy allows exactly those hosts and no inline scripts', () => {
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  const directive = name => csp.split(';').map(d => d.trim()).find(d => d.startsWith(`${name} `)) ?? '';
  assert.equal(directive('default-src'), "default-src 'self'");
  assert.equal(directive('script-src'), "script-src 'self'");
  assert.equal(directive('object-src'), "object-src 'none'");
  const connect = directive('connect-src').split(' ').slice(1).filter(s => s !== "'self'").map(u => new URL(u).host);
  assert.deepEqual(connect.sort(), [...ALLOWED_HOSTS].sort());
});

test('no inline scripts or event handlers (the CSP would block them)', () => {
  assert.equal(/<script(?![^>]*\bsrc=)[^>]*>/.test(html), false, 'inline <script>');
  assert.equal(/\son[a-z]+\s*=/i.test(html), false, 'inline handler in index.html');
  assert.equal(/\bon(?:error|load|click)\s*=\s*["'\\]/.test(allJs), false, 'inline handler in generated HTML');
});

test('nothing is evaluated as code and no tracker is included', () => {
  assert.equal(/\beval\s*\(|new Function\s*\(|document\.write\s*\(/.test(allJs), false);
  assert.equal(/analytics|goatcounter|gtag|metrika|sendBeacon/i.test(allJs + html), false);
});

test('scripts stay inside the js folder tree', () => {
  for (const file of jsFiles) assert.ok(!relative('js', file).startsWith('..'));
});

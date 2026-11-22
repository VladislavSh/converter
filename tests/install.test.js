import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { APP_DISPLAY_MODES, INSTALL_STEPS, installPlatform, isInstalled, showInstallButton } from '../js/core/install.js';
import { MESSAGES } from '../js/i18n.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

test('the instructions fit the device', () => {
  const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1';
  const android = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36';
  const windows = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36';
  const mac = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15';
  assert.equal(installPlatform({ userAgent: iphone, platform: 'iPhone', maxTouchPoints: 5 }), 'ios');
  assert.equal(installPlatform({ userAgent: android, platform: 'Linux armv81', maxTouchPoints: 5 }), 'android');
  assert.equal(installPlatform({ userAgent: windows, platform: 'Win32', maxTouchPoints: 0 }), 'desktop');
  assert.equal(installPlatform({ userAgent: mac, platform: 'MacIntel', maxTouchPoints: 0 }), 'desktop');
  assert.equal(installPlatform({ userAgent: mac, platform: 'MacIntel', maxTouchPoints: 5 }), 'ios', 'an iPad says it is a Mac');
  assert.equal(installPlatform(), 'desktop', 'nothing known');
});

test('every platform has steps and every step has a text', () => {
  assert.deepEqual(Object.keys(INSTALL_STEPS).sort(), ['android', 'desktop', 'ios']);
  for (const steps of Object.values(INSTALL_STEPS)) {
    assert.ok(steps.length >= 2);
    for (const key of steps) {
      assert.ok(MESSAGES.ru[key], `no Russian text for ${key}`);
      assert.ok(MESSAGES.en[key], `no English text for ${key}`);
    }
  }
});

test('an installed app does not offer to install itself', () => {
  assert.equal(isInstalled({ standaloneDisplay: true }), true);
  assert.equal(isInstalled({ iosStandalone: true }), true, 'iPhone home-screen app');
  assert.equal(isInstalled({ standaloneDisplay: false, iosStandalone: false }), false);
  assert.equal(isInstalled({ iosStandalone: undefined }), false, 'browsers without that property');
  assert.equal(isInstalled(), false);
});

test('the manifest and the page offer icons phones can use', () => {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.webmanifest'), 'utf8'));
  for (const icon of manifest.icons) assert.ok(existsSync(join(ROOT, icon.src)), `missing icon: ${icon.src}`);
  const png = manifest.icons.filter(icon => icon.type === 'image/png');
  // Android installs the app only with PNG icons of these sizes
  assert.ok(png.some(icon => icon.sizes === '192x192' && icon.purpose === 'any'));
  assert.ok(png.some(icon => icon.sizes === '512x512' && icon.purpose === 'any'));
  assert.ok(png.some(icon => icon.purpose === 'maskable'));
  for (const icon of png) {
    const size = Number(icon.sizes.split('x')[0]);
    const header = readFileSync(join(ROOT, icon.src));
    assert.equal(header.toString('latin1', 1, 4), 'PNG', icon.src);
    assert.equal(header.readUInt32BE(16), size, `${icon.src} width`);
    assert.equal(header.readUInt32BE(20), size, `${icon.src} height`);
  }
  // The iPhone home screen ignores SVG
  const touch = readFileSync(join(ROOT, 'index.html'), 'utf8').match(/rel="apple-touch-icon" href="([^"]+)"/)[1];
  assert.match(touch, /\.png$/);
  assert.ok(existsSync(join(ROOT, touch)));
});

test('the browser\'s install offer is caught before the app loads and kept for the button', () => {
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const early = html.indexOf('js/install-early.js');
  assert.ok(early > 0 && early < html.indexOf('</head>'), 'loaded in <head>');
  assert.ok(early < html.indexOf('js/main.js'), 'before the app modules');

  const handlers = {};
  const sent = [];
  const win = {
    addEventListener: (type, handler) => { handlers[type] = handler; },
    dispatchEvent: event => sent.push(event.type)
  };
  vm.runInNewContext(readFileSync(join(ROOT, 'js/install-early.js'), 'utf8'), { window: win, Event: class { constructor(type) { this.type = type; } } });

  let prevented = false;
  const offer = { preventDefault: () => { prevented = true; }, prompt: () => {} };
  handlers.beforeinstallprompt(offer);
  assert.equal(prevented, true, 'no browser banner: the button decides when to ask');
  assert.equal(win.cartrateInstallPrompt, offer);
  assert.deepEqual(sent, ['cartrate:installable'], 'a tap that is already waiting gets it at once');

  const shell = readFileSync(join(ROOT, 'js/ui/shell.js'), 'utf8');
  assert.ok(shell.includes(`'${sent[0]}'`), 'the button listens for the same event name');
});

test('the manifest lets Chrome install the app and spot an installed copy', () => {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.webmanifest'), 'utf8'));
  assert.notEqual(manifest.prefer_related_applications, true, 'true would stop Chrome from offering installation');
  const self = manifest.related_applications.find(app => app.platform === 'webapp');
  assert.match(self.url, /^https:\/\/[^/]+\/converter\/manifest\.webmanifest$/);
  assert.equal(manifest.display, 'standalone');
  assert.ok(manifest.name && manifest.short_name && manifest.start_url);
});

test('"Install" disappears once the app is installed, in the browser tab too', () => {
  assert.equal(showInstallButton(), true, 'a browser tab, nothing known: offer it');
  assert.equal(showInstallButton({ standalone: true }), false, 'inside the installed app');
  assert.equal(showInstallButton({ standalone: true, offered: true }), false);
  assert.equal(showInstallButton({ remembered: true }), false, 'installed on this device before: not in the browser either');
  assert.equal(showInstallButton({ remembered: true, offered: true }), true, 'the browser offers it again: the app was removed');
  assert.equal(showInstallButton({ offered: true }), true);
  assert.ok(APP_DISPLAY_MODES.includes('standalone') && APP_DISPLAY_MODES.includes('fullscreen'));
});

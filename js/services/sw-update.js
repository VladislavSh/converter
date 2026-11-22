// Service worker registration and automatic updates. An installed app on a
// phone is usually resumed from memory rather than reloaded, so we look for a
// new version every time it returns to the foreground and reload once the new
// worker has taken over.
import { STORAGE_KEYS, TIMING } from '../config.js';
import { setSessionFlag } from './storage.js';

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !location.protocol.startsWith('http')) return;

  let hadController = Boolean(navigator.serviceWorker.controller);
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) {
      // First install: nothing old to replace. The next change will be an update.
      hadController = true;
      return;
    }
    if (reloading) return;
    reloading = true;
    setSessionFlag(STORAGE_KEYS.updatedFlag);
    location.reload();
  });

  const register = async () => {
    try {
      const registration = await navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' });
      const check = () => { if (!document.hidden) registration.update().catch(() => {}); };
      document.addEventListener('visibilitychange', check);
      window.addEventListener('focus', check);
      setInterval(check, TIMING.updatePollMs);
    } catch { /* offline support is optional */ }
  };
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}

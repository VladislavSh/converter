// Installing the app to the home screen. Chrome and Edge open their own
// install dialog in one tap (see js/install-early.js and ui/shell.js); Safari
// on iPhone and Firefox never let a page do that, so there the user is shown
// where the menu item is.

/**
 * Which set of instructions fits this device.
 * @param {{userAgent?: string, platform?: string, maxTouchPoints?: number}} device
 * @returns {'ios'|'android'|'desktop'}
 */
export function installPlatform({ userAgent = '', platform = '', maxTouchPoints = 0 } = {}) {
  // An iPad introduces itself as a Mac; a Mac has no touch screen
  if (/iPad|iPhone|iPod/.test(userAgent) || (platform === 'MacIntel' && maxTouchPoints > 1)) return 'ios';
  if (/Android/i.test(userAgent)) return 'android';
  return 'desktop';
}

/** Translation keys of the steps, in order. */
export const INSTALL_STEPS = Object.freeze({
  ios: ['installIos1', 'installIos2', 'installIos3'],
  android: ['installAndroid1', 'installAndroid2', 'installAlready'],
  desktop: ['installDesktop1', 'installDesktop2', 'installAlready']
});

/**
 * Whether the page already runs as an installed app (its own window, no
 * browser bars) — then there is nothing to install.
 */
export function isInstalled({ standaloneDisplay = false, iosStandalone = false } = {}) {
  return standaloneDisplay || iosStandalone === true;
}

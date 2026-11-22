// Round currency badge: a self-hosted flag for fiat, a coloured monogram for
// crypto and for currencies without a flag.
import { CRYPTO_BY_CODE, isCrypto } from '../data/currencies.js';
import { currencySymbol, flagCountry } from '../core/names.js';
import { escapeHtml } from './dom.js';

function hueOf(code) {
  let hue = 0;
  for (const ch of code) hue = (hue * 31 + ch.charCodeAt(0)) % 360;
  return hue;
}

const monogram = symbol => (symbol.length > 1 ? `<small>${escapeHtml(symbol)}</small>` : escapeHtml(symbol));

export function badgeHtml(code) {
  if (isCrypto(code)) {
    const { color, sym } = CRYPTO_BY_CODE[code];
    return `<span class="badge" style="--badge:linear-gradient(135deg,${color[0]},${color[1]})">${monogram(sym)}</span>`;
  }
  const hue = hueOf(code);
  const background = `linear-gradient(135deg,hsl(${hue} 70% 58%),hsl(${(hue + 40) % 360} 70% 42%))`;
  const symbol = currencySymbol(code);
  const country = flagCountry(code);
  if (!country) return `<span class="badge" style="--badge:${background}">${monogram(symbol)}</span>`;
  return `<span class="badge" style="--badge:${background}" data-mono="${escapeHtml(symbol)}">` +
    `<img src="icons/flags/${country}.svg" alt="" loading="lazy" decoding="async"></span>`;
}

/**
 * A missing flag file falls back to the currency symbol. Done with one
 * capturing listener because the CSP forbids inline onerror handlers.
 */
export function installFlagFallback(root = document) {
  root.addEventListener('error', event => {
    const img = event.target;
    const badge = img instanceof HTMLImageElement ? img.parentElement : null;
    if (badge?.classList.contains('badge')) badge.textContent = badge.dataset.mono || '';
  }, true);
}

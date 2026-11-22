// Swiping between the tabs. Pure functions — the touch events are in ui/shell.js.

export const SWIPE = Object.freeze({
  minDistance: 64, // px: shorter is a tap or a scroll that wobbled
  maxTimeMs: 700, // a slow drag is reading, not a swipe
  ratio: 1.6, // clearly more sideways than up or down
  edgePx: 24 // the system's own back gesture starts at the screen edges
});

/**
 * The tab step a finished touch asks for.
 * @param {{dx: number, dy: number, dt: number, startX: number, width: number}} touch
 * @returns {-1|0|1} 1 = the next tab (swipe to the left), -1 = the previous one, 0 = not a swipe
 */
export function swipeStep({ dx, dy, dt, startX, width }, limits = SWIPE) {
  if (![dx, dy, dt, startX, width].every(Number.isFinite)) return 0;
  if (startX < limits.edgePx || startX > width - limits.edgePx) return 0;
  if (dt > limits.maxTimeMs || Math.abs(dx) < limits.minDistance) return 0;
  if (Math.abs(dx) < Math.abs(dy) * limits.ratio) return 0;
  return dx < 0 ? 1 : -1;
}

/** The tab a step leads to, or null past the first or the last one (no wrapping). */
export function stepView(views, current, step) {
  const index = views.indexOf(current);
  if (index < 0 || !step) return null;
  return views[index + step] ?? null;
}

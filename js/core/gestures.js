// Touch gestures, as numbers: pulling the page down to refresh it and dragging
// a sheet down to close it. Pure functions — the touch events are in ui/.

export const PULL = Object.freeze({
  lockPx: 8, // the finger moves this far before the gesture's direction is decided
  trigger: 64, // px the indicator travels before letting go refreshes
  max: 130, // px it can travel at most; the pull gets heavier towards it
  minSpinMs: 600 // a refresh that answers at once still shows that it happened
});

export const SHEET_DRAG = Object.freeze({
  shareOfHeight: 0.3, // dragged this far down (or…)
  maxDistance: 180, // …this many px on a tall sheet), the sheet closes
  flickSpeed: 0.45, // px/ms: a quick flick closes it from anywhere
  flickMin: 24 // px: but not a twitch
});

/**
 * Which way a touch is going, once it has moved far enough to tell.
 * @returns {null|'x'|'down'|'up'} null = not decided yet
 */
export function gestureAxis(dx, dy, lock = PULL.lockPx) {
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || Math.hypot(dx, dy) < lock) return null;
  if (Math.abs(dx) > Math.abs(dy)) return 'x';
  return dy > 0 ? 'down' : 'up';
}

/** How far the indicator follows a pull of `dy` px: freely at first, then ever heavier. */
export function pullDistance(dy, max = PULL.max) {
  if (!(dy > 0)) return 0;
  return max * (1 - Math.exp(-dy / max));
}

/** Whether a sheet dragged `dy` px down at `velocity` px/ms when let go should close. */
export function sheetShouldClose({ dy, velocity = 0, height }, limits = SHEET_DRAG) {
  if (!(dy > 0)) return false;
  if (velocity > limits.flickSpeed && dy > limits.flickMin) return true;
  return dy > Math.min(height * limits.shareOfHeight, limits.maxDistance);
}

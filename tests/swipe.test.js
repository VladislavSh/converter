import test from 'node:test';
import assert from 'node:assert/strict';
import { SWIPE, stepView, swipeStep } from '../js/core/swipe.js';
import { VIEWS } from '../js/core/state.js';

const touch = overrides => ({ dx: -120, dy: 10, dt: 250, startX: 300, width: 390, ...overrides });

test('a quick sideways swipe goes to the next or the previous tab', () => {
  assert.equal(swipeStep(touch()), 1, 'to the left: the next tab');
  assert.equal(swipeStep(touch({ dx: 120, startX: 80 })), -1, 'to the right: the previous one');
  assert.equal(swipeStep(touch({ dx: -SWIPE.minDistance })), 1, 'exactly the minimum distance');
});

test('taps, scrolls, slow drags and edge gestures are not swipes', () => {
  assert.equal(swipeStep(touch({ dx: -30 })), 0, 'too short: a tap that moved');
  assert.equal(swipeStep(touch({ dx: -100, dy: 90 })), 0, 'diagonal: a scroll that wobbled');
  assert.equal(swipeStep(touch({ dx: -40, dy: -300 })), 0, 'a scroll');
  assert.equal(swipeStep(touch({ dt: 1500 })), 0, 'slow: the finger was reading, not swiping');
  assert.equal(swipeStep(touch({ startX: 10 })), 0, 'from the left edge: the system back gesture');
  assert.equal(swipeStep(touch({ startX: 380, dx: -120 })), 0, 'from the right edge');
  assert.equal(swipeStep(touch({ dx: NaN })), 0, 'broken input');
  assert.equal(swipeStep({}), 0);
});

test('the tabs are stepped through in order, without wrapping around', () => {
  assert.deepEqual(VIEWS, ['convert', 'shop', 'banks']);
  assert.equal(stepView(VIEWS, 'convert', 1), 'shop');
  assert.equal(stepView(VIEWS, 'shop', 1), 'banks');
  assert.equal(stepView(VIEWS, 'banks', -1), 'shop');
  assert.equal(stepView(VIEWS, 'banks', 1), null, 'past the last tab: nothing');
  assert.equal(stepView(VIEWS, 'convert', -1), null, 'before the first: nothing');
  assert.equal(stepView(VIEWS, 'nowhere', 1), null);
  assert.equal(stepView(VIEWS, 'shop', 0), null);
});

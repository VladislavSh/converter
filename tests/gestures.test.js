import test from 'node:test';
import assert from 'node:assert/strict';
import { PULL, SHEET_DRAG, gestureAxis, pullDistance, sheetShouldClose } from '../js/core/gestures.js';

test('gestureAxis waits for a clear direction', () => {
  assert.equal(gestureAxis(2, 3), null, 'a few px is still a tap');
  assert.equal(gestureAxis(1, 20), 'down');
  assert.equal(gestureAxis(-2, -20), 'up');
  assert.equal(gestureAxis(30, 12), 'x', 'sideways: a tab swipe, not a pull');
  assert.equal(gestureAxis(Number.NaN, 20), null);
});

test('pullDistance follows the finger, then gets heavier, never past the limit', () => {
  assert.equal(pullDistance(0), 0);
  assert.equal(pullDistance(-40), 0, 'pushing up is not a pull');
  const short = pullDistance(20);
  assert.ok(short > 16 && short <= 20, 'almost 1:1 at first');
  assert.ok(pullDistance(100) >= PULL.trigger, 'a 100 px pull reaches the mark');
  assert.ok(pullDistance(60) < PULL.trigger, 'a 60 px pull does not');
  assert.ok(pullDistance(10000) <= PULL.max);
  assert.ok(pullDistance(200) > pullDistance(150), 'always grows');
});

test('sheetShouldClose: a third of the way down, or a quick flick', () => {
  const height = 400;
  assert.equal(sheetShouldClose({ dy: 60, velocity: 0.1, height }), false, 'a small drag springs back');
  assert.equal(sheetShouldClose({ dy: 130, velocity: 0, height }), true, 'past 30 %');
  assert.equal(sheetShouldClose({ dy: 40, velocity: 0.8, height }), true, 'a flick');
  assert.equal(sheetShouldClose({ dy: 10, velocity: 2, height }), false, 'a twitch is not a flick');
  assert.equal(sheetShouldClose({ dy: SHEET_DRAG.maxDistance + 1, velocity: 0, height: 900 }), true, 'a tall sheet needs no 270 px');
  assert.equal(sheetShouldClose({ dy: -50, velocity: 1, height }), false, 'dragged up');
});

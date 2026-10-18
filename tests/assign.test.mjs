// Which skeleton belongs to which player?
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PlayerAssigner } from '../src/input/PlayerAssigner.js';
import { pose } from './skeleton.mjs';

// raw camera x: the camera image is NOT mirrored, so a person on the
// players' left appears at a large raw x
const leftPerson = () => pose({ cx: 0.75 });
const rightPerson = () => pose({ cx: 0.25 });

test('two people: the one on the left is P1, whatever order MediaPipe uses', () => {
  const a = new PlayerAssigner();
  const L = leftPerson();
  const R = rightPerson();
  assert.deepEqual(a.assign([L, R], 0), [L, R]);
  assert.deepEqual(a.assign([R, L], 33), [L, R]);
});

test('one person alone goes to the side they stand on', () => {
  const a = new PlayerAssigner();
  const R = rightPerson();
  assert.deepEqual(a.assign([R], 0), [null, R]);
});

test('when P2 steps out, P1 keeps their slot even near the middle', () => {
  const a = new PlayerAssigner();
  a.assign([pose({ cx: 0.55 }), pose({ cx: 0.2 })], 0);
  const p1 = pose({ cx: 0.45 }); // P1 drifted just past the middle
  assert.deepEqual(a.assign([p1], 33), [p1, null]);
});

test('skeletons without visible shoulders are ignored', () => {
  const a = new PlayerAssigner();
  const ghost = leftPerson();
  ghost[11].visibility = 0.1;
  assert.deepEqual(a.assign([ghost], 0), [null, null]);
});

test('no skeletons = nobody', () => {
  assert.deepEqual(new PlayerAssigner().assign([], 0), [null, null]);
});

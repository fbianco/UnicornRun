// The training run: steps, skipping, and the practice road.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Tutorial, STEPS } from '../src/game/Tutorial.js';
import { Track } from '../src/game/Track.js';
import { TUTORIAL } from '../src/config.js';

const DT = 1 / 60;
const idle = { steer: 0, run: 0, jump: false, boost: false };

// play `seconds` with intent(t) for player 0 (player 1 idle)
function play(tut, seconds, intent, skip = false) {
  for (let i = 0; i < seconds * 60; i++) tut.update(DT, [intent(i * DT), idle], [skip, false]);
}

// what a perfect pupil does on each step
const PERFECT = {
  left: () => ({ ...idle, steer: -1 }),
  right: () => ({ ...idle, steer: 1 }),
  run: () => ({ ...idle, run: 1 }),
  jump: (t) => ({ ...idle, jump: Math.floor(t * 60) % 50 === 0 }),
  dash: () => ({ ...idle, boost: true }),
};

test('the practice road is a straight, flat-ending loop with nothing on it', () => {
  const t = new Track(7, { practice: true });
  assert.ok(t.segments.every((s) => s.curve === 0 && s.items.length === 0));
  assert.ok(!t.segments.some((s) => s.checker), 'no start line');
  assert.ok(Math.abs(t.segments[t.segments.length - 1].p2.y) < 1);
  assert.equal(t.hurdleZ.length, 0);
});

test('a player goes through every step in order, then is done', () => {
  const tut = new Tutorial();
  tut.start([true, false]);
  assert.equal(tut.players[1].done, true, 'a seat that does not train is done');
  for (const step of STEPS) {
    assert.equal(tut.stepOf(0), step);
    play(tut, 4, PERFECT[step]);
  }
  assert.equal(tut.stepOf(0), null);
  assert.equal(tut.allDone, true);
  assert.equal(tut.players[0].skipped, false);
});

test('doing nothing (or the wrong move) never passes a step', () => {
  const tut = new Tutorial();
  tut.start([true, true]);
  play(tut, 5, () => idle);
  play(tut, 5, PERFECT.right);          // asked to lean LEFT
  assert.equal(tut.stepOf(0), 'left');
  assert.equal(tut.players[0].progress, 0);
});

test('progress adds up: short leans with pauses in between still pass', () => {
  const tut = new Tutorial();
  tut.start([true, false]);
  // lean for 0.2 s, stand straight 0.3 s, again and again
  play(tut, 3, (t) => ((t % 0.5) < 0.2 ? PERFECT.left() : idle));
  assert.notEqual(tut.stepOf(0), 'left');
});

test('the jump step needs the configured number of jumps', () => {
  const tut = new Tutorial();
  tut.start([true, false]);
  for (const step of ['left', 'right', 'run']) play(tut, 4, PERFECT[step]);
  assert.equal(tut.stepOf(0), 'jump');
  tut.update(DT, [{ ...idle, jump: true }, idle]);
  play(tut, 1, () => idle);
  assert.equal(tut.players[0].jumps, 1);
  assert.equal(tut.stepOf(0), TUTORIAL.jumps > 1 ? 'jump' : 'run');
});

test('the dash step fills the rainbow meter so the dash can fire', () => {
  const tut = new Tutorial();
  tut.start([true, false]);
  for (const step of ['left', 'right', 'run', 'jump']) play(tut, 4, PERFECT[step]);
  assert.equal(tut.stepOf(0), 'dash');
  play(tut, 0.1, () => idle);
  assert.ok(tut.players[0].runner.power > 0);
  play(tut, 3, PERFECT.dash);
  assert.equal(tut.allDone, true);
});

test('crossing the arms (skip) finishes the training at once', () => {
  const tut = new Tutorial();
  tut.start([true, true]);
  tut.update(DT, [idle, idle], [true, false]);
  assert.equal(tut.players[0].done, true);
  assert.equal(tut.players[0].skipped, true);
  assert.equal(tut.allDone, false, 'the other player still trains');
  tut.drop(1);
  assert.equal(tut.allDone, true);
});

test('a player who is done can keep practising: their unicorn still steers', () => {
  const tut = new Tutorial();
  tut.start([true, false]);
  tut.update(DT, [idle, idle], [true, false]);
  const x0 = tut.players[0].runner.x;
  play(tut, 1, PERFECT.left);
  assert.ok(tut.players[0].runner.x < x0 - 0.3);
});

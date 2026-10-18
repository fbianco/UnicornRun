// Unit tests for the runner gesture interpreter, using synthetic skeletons.
// Run with:  npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RunnerGestures } from '../src/input/RunnerGestures.js';
import { pose, noHips } from './skeleton.mjs';

// Feed `frames` frames of the same pose at 30 fps, return the last output.
function hold(g, p, t0, frames = 15) {
  let out;
  for (let i = 0; i < frames; i++) out = g.update(p, t0 + i * 33);
  return { out, t: t0 + frames * 33 };
}

function calibrated() {
  const g = new RunnerGestures();
  g.startCalibration();
  const { t } = hold(g, pose(), 0, 60); // 2 s standing still
  assert.ok(g.baseline, 'baseline captured');
  return { g, t };
}

// run in place for `seconds`: body bounces and knees alternate at ~2.5 Hz
// drift = how far the runner wanders sideways over the run (image units)
function runInPlace(g, t0, seconds, { bob = 0.03, knee = 0.06, kneesVisible = true, cx = 0.5, drift = 0, tilt = 0 } = {}) {
  let out;
  let t = t0;
  const frames = Math.round(seconds * 30);
  let maxSteer = 0;
  for (let i = 0; i < frames; i++) {
    const ph = (t / 1000) * 2.5 * Math.PI * 2;
    const x = cx + (drift * i) / frames;
    const p = pose({ cx: x, tilt, hipLift: Math.abs(Math.sin(ph)) * bob, shY: 0.4 - Math.abs(Math.sin(ph)) * bob, knee: Math.sin(ph) * knee });
    if (!kneesVisible) { p[25].visibility = 0.1; p[26].visibility = 0.1; }
    out = g.update(p, t);
    maxSteer = Math.max(maxSteer, Math.abs(out.steer));
    t += 33;
  }
  return { out, t, maxSteer };
}

test('calibration captures the neutral pose', () => {
  const { g } = calibrated();
  assert.ok(Math.abs(g.baseline.sw - 0.2) < 1e-6);
  assert.ok(Math.abs(g.baseline.th) < 1e-6, 'standing straight');
});

test('standing still = no steering, no running, no jump', () => {
  const { g, t } = calibrated();
  const { out } = hold(g, pose(), t, 30);
  assert.equal(out.steer, 0);
  assert.ok(out.run < 0.05, `run ${out.run}`);
  assert.equal(out.jump, false);
});

test('tilting the upper body to your right (image left) steers right, analogue', () => {
  const { g, t } = calibrated();
  const small = hold(g, pose({ tilt: 0.25 }), t).out.steer;
  const big = hold(g, pose({ tilt: 0.7 }), t + 1000).out.steer;
  assert.ok(small > 0 && small < 0.5, `small tilt ${small}`);
  assert.equal(big, 1);
});

test('tilting left steers left', () => {
  const { g, t } = calibrated();
  assert.ok(hold(g, pose({ tilt: -0.45 }), t).out.steer < -0.5);
});

test('small sway inside the dead zone goes straight', () => {
  const { g, t } = calibrated();
  assert.equal(hold(g, pose({ tilt: 0.1 }), t).out.steer, 0);
});

test('standing somewhere else in the room does not steer', () => {
  const { g, t } = calibrated();
  assert.equal(hold(g, pose({ cx: 0.3 }), t).out.steer, 0, 'stepped far to the side');
  assert.equal(hold(g, pose({ cx: 0.68 }), t + 1000).out.steer, 0, 'and to the other side');
  assert.ok(hold(g, pose({ cx: 0.3, tilt: 0.6 }), t + 2000).out.steer > 0.9, 'a tilt still steers there');
});

test('drifting sideways while running in place keeps going straight', () => {
  const { g, t } = calibrated();
  const r = runInPlace(g, t, 4, { drift: -0.25 });   // more than a shoulder width
  assert.equal(r.maxSteer, 0);
  assert.ok(r.out.run > 0.8, `still running ${r.out.run}`);
});

test('steering while running in place', () => {
  const { g, t } = calibrated();
  const r = runInPlace(g, t, 2, { tilt: -0.5 });
  assert.ok(r.out.steer < -0.7, `steer ${r.out.steer}`);
  assert.ok(r.out.run > 0.8, `run ${r.out.run}`);
});

test('hips out of view: the slope of the shoulders steers', () => {
  const g = new RunnerGestures();
  g.startCalibration();
  const { t } = hold(g, noHips(pose()), 0, 60);
  assert.equal(hold(g, noHips(pose()), t).out.steer, 0);
  assert.ok(hold(g, noHips(pose({ tilt: 0.5 })), t + 1000).out.steer > 0.6);
  assert.ok(hold(g, noHips(pose({ tilt: -0.5 })), t + 2000).out.steer < -0.6);
});

test('a lean while calibrating is not trusted as "straight"', () => {
  const g = new RunnerGestures();
  g.startCalibration();
  const { t } = hold(g, pose({ tilt: 0.6 }), 0, 60);
  assert.ok(Math.abs(g.baseline.th) <= 0.2 + 1e-9);
  assert.ok(hold(g, pose({ tilt: 0.6 }), t).out.steer > 0.3, 'the same lean still steers');
});

test('arms crossed in front of the body (X) is reported, and is not hands up or a dash', () => {
  const { g, t } = calibrated();
  let boosts = 0;
  let tt = t;
  let out;
  for (let i = 0; i < 40; i++) { out = g.update(pose({ cross: true }), tt); if (out.boost) boosts++; tt += 33; }
  assert.equal(out.crossed, true);
  assert.ok(out.crossHeld > 1, `held ${out.crossHeld}`);
  assert.equal(out.handsUp, false);
  assert.equal(out.steer, 0);
  assert.equal(boosts, 0);
  out = g.update(pose(), tt);
  assert.equal(out.crossed, false);
  assert.equal(out.crossHeld, 0);
});

test('normal arms, hands up and arm pumping are never "crossed"', () => {
  const { g, t } = calibrated();
  let tt = t;
  for (const p of [pose(), pose({ handsUp: true }), pose({ arm: 0.15 }), pose({ arm: -0.15 }), pose({ tilt: 0.6 })]) {
    for (let i = 0; i < 10; i++) { assert.equal(g.update(p, tt).crossed, false); tt += 33; }
  }
});

test('running in place fills the run meter, stopping empties it', () => {
  const { g, t } = calibrated();
  let r = runInPlace(g, t, 2);
  assert.ok(r.out.run > 0.8, `run ${r.out.run}`);
  r = hold(g, pose(), r.t, 60);
  assert.ok(r.out.run < 0.1, `run after stopping ${r.out.run}`);
});

test('running in place works with the knees out of view (bounce only)', () => {
  const { g, t } = calibrated();
  const r = runInPlace(g, t, 2, { bob: 0.04, kneesVisible: false });
  assert.ok(r.out.run > 0.6, `run ${r.out.run}`);
});

test('pumping the arms also counts as running', () => {
  const { g, t } = calibrated();
  let tt = t;
  let out;
  for (let i = 0; i < 60; i++) {
    out = g.update(pose({ arm: Math.sin((tt / 1000) * 2.5 * Math.PI * 2) * 0.15 }), tt);
    tt += 33;
  }
  assert.ok(out.run > 0.5, `run ${out.run}`);
});

test('running in place never counts as a jump', () => {
  const { g, t } = calibrated();
  let jumps = 0;
  let tt = t;
  for (let i = 0; i < 150; i++) {
    const ph = (tt / 1000) * 2.5 * Math.PI * 2;
    const b = Math.abs(Math.sin(ph)) * 0.035;
    if (g.update(pose({ hipLift: b, shY: 0.4 - b, knee: Math.sin(ph) * 0.06 }), tt).jump) jumps++;
    tt += 33;
  }
  assert.equal(jumps, 0);
});

test('a real jump fires exactly once', () => {
  const { g, t } = calibrated();
  let jumps = 0;
  let tt = t;
  // hips rise 0.12 (0.6 shoulder widths) in 4 frames, hang, come back down
  for (const lift of [0, 0.03, 0.06, 0.09, 0.12, 0.12, 0.09, 0.05, 0.01, 0, 0, 0]) {
    if (g.update(pose({ hipLift: lift, shY: 0.4 - lift }), tt).jump) jumps++;
    tt += 33;
  }
  assert.equal(jumps, 1);
});

test('both hands up fires one rainbow dash per raise', () => {
  const { g, t } = calibrated();
  let boosts = 0;
  let tt = t;
  for (let i = 0; i < 40; i++) { if (g.update(pose({ handsUp: true }), tt).boost) boosts++; tt += 33; }
  assert.equal(boosts, 1, 'once while holding');
  for (let i = 0; i < 10; i++) { g.update(pose(), tt); tt += 33; }
  for (let i = 0; i < 20; i++) { if (g.update(pose({ handsUp: true }), tt).boost) boosts++; tt += 33; }
  assert.equal(boosts, 2, 'again after lowering the hands');
});

test('hands up is reported before calibration (used to join)', () => {
  const g = new RunnerGestures();
  const { out } = hold(g, pose({ handsUp: true }), 0, 40);
  assert.equal(out.handsUp, true);
  assert.ok(out.handsUpHeld > 1);
  assert.equal(out.boost, false);
});

test('calibration waits until the hands are down, and the joining hands do not dash', () => {
  const g = new RunnerGestures();
  g.startCalibration();
  let r = hold(g, pose({ handsUp: true }), 0, 60);
  assert.equal(g.baseline, null);
  r = hold(g, pose(), r.t, 60);
  assert.ok(g.baseline);
});

test('nobody in view = present false and no input', () => {
  const { g, t } = calibrated();
  const out = g.update(null, t);
  assert.equal(out.present, false);
  assert.equal(out.steer, 0);
});

test('two players anywhere in the picture each steer with their own tilt', () => {
  const g1 = new RunnerGestures();
  const g2 = new RunnerGestures();
  g1.startCalibration(); g2.startCalibration();
  for (let i = 0; i < 60; i++) { g1.update(pose({ cx: 0.7 }), i * 33); g2.update(pose({ cx: 0.3 }), i * 33); }
  const a = hold(g1, pose({ cx: 0.62 }), 3000).out;
  const b = hold(g2, pose({ cx: 0.36, tilt: 0.5 }), 3000).out;
  assert.equal(a.steer, 0, 'P1 moved but stands straight');
  assert.ok(b.steer > 0, 'P2 tilting right steers right');
});

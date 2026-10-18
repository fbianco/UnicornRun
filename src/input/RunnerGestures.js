// ---------------------------------------------------------------------------
// RunnerGestures: one player's body landmarks  ->  racing intent.
// (Same approach as Bun Rush's GestureInterpreter, one instance per player.)
//
// Input : 33 MediaPipe pose landmarks (x, y in 0..1 of the camera image,
//         y pointing down, plus a `visibility` score).
// Output: { steer: -1..1, run: 0..1, jump: event, boost: event, ... }
//
//   tilt upper body l/r     -> steer   (shoulders vs. hips, or shoulder slope)
//   run in place            -> run     (hip bounce, alternating knees or arms)
//   jump                    -> jump    (hips rise fast and high)
//   both hands up           -> boost   (rainbow dash), also used to join
//   arms crossed (an X)     -> cross   (skip the training)
//
// Steering is measured on the body itself (where the shoulders sit over the
// hips), never against a spot in the room: children who drift while running
// in place keep going straight.
//
// All distances are measured in shoulder widths, so the thresholds do not
// depend on how far you stand from the camera. Pure logic: unit tested in
// tests/gesture.test.mjs with synthetic skeletons.
// ---------------------------------------------------------------------------
import { GESTURE } from '../config.js';

export const LM = {
  NOSE: 0, L_SHOULDER: 11, R_SHOULDER: 12, L_WRIST: 15, R_WRIST: 16,
  L_HIP: 23, R_HIP: 24, L_KNEE: 25, R_KNEE: 26,
};
const TRACKED = Object.values(LM);

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const clampAbs = (v, m) => Math.max(-m, Math.min(m, v));

/**
 * Sideways tilt of the upper body in shoulder widths, + = to your right.
 *   hip  : shoulder centre vs. hip centre (null when the hips are not seen)
 *   roll : slope of the shoulder line, converted to the same unit
 * The camera picture is not mirrored: your right is the image's left.
 */
function tiltOf(P, sh, sw, hipsVisible, torsoRatio) {
  const L = P[LM.L_SHOULDER];
  const R = P[LM.R_SHOULDER];
  const roll = torsoRatio * Math.sin(Math.atan2(R.y - L.y, L.x - R.x));
  const hip = hipsVisible ? ((P[LM.L_HIP].x + P[LM.R_HIP].x) / 2 - sh.x) / sw : null;
  return { hip, roll };
}

export class RunnerGestures {
  constructor(cfg = GESTURE) {
    this.cfg = cfg;
    this.baseline = null;   // { x, y, sw, hy } of the neutral standing pose
    this.calibration = null;
    this.reset();
  }

  reset() {
    this.smooth = null;
    this.prev = null;
    this.history = [];
    this.lastJumpAt = -Infinity;
    this.handsUpSince = null;
    this.crossSince = null;
    this.boostFired = false;
    this.out = {
      present: false, calibrated: !!this.baseline,
      steer: 0, run: 0, jump: false, boost: false,
      handsUp: false, handsUpHeld: 0, crossed: false, crossHeld: 0,
      lean: 0, lift: 0, activity: 0,
      points: null,
    };
  }

  startCalibration() {
    this.baseline = null;
    this.calibration = { start: null, samples: [] };
    this.reset();
  }

  forget() {
    this.baseline = null;
    this.calibration = null;
    this.reset();
  }

  get calibrating() {
    return this.calibration !== null;
  }

  calibrationProgress(tMs) {
    const c = this.calibration;
    if (!c || c.start === null) return 0;
    return clamp01((tMs / 1000 - c.start) / this.cfg.calibrationSeconds);
  }

  /**
   * Feed one frame. `landmarks` may be null when this player is not seen.
   * `aspect` = image height / width: y is multiplied by it so that one unit
   * is the same physical distance horizontally and vertically.
   */
  update(landmarks, tMs, aspect = 0.75) {
    const o = this.out;
    const cfg = this.cfg;
    const t = tMs / 1000;
    o.jump = false;
    o.boost = false;

    const vis = (i) => landmarks?.[i]?.visibility ?? 1;
    if (!landmarks || vis(LM.L_SHOULDER) < cfg.minVisibility || vis(LM.R_SHOULDER) < cfg.minVisibility) {
      o.present = false;
      o.steer = 0;
      o.lean = 0;
      o.run = Math.max(0, o.run - 0.05);
      o.handsUp = false; o.handsUpHeld = 0;
      o.crossed = false; o.crossHeld = 0;
      o.points = null;
      this.handsUpSince = null;
      this.crossSince = null;
      this.prev = null;
      this.smooth = null;
      this.history = [];
      if (this.calibration) {
        // you left the picture: calibration starts again when you are back
        this.calibration.start = null;
        this.calibration.samples = [];
      }
      return o;
    }
    o.present = true;

    // 1. smooth the few landmarks we use (exponential moving average)
    const a = cfg.smoothing;
    if (!this.smooth) this.smooth = {};
    for (const i of TRACKED) {
      const p = landmarks[i];
      const py = p.y * aspect;
      const s = this.smooth[i];
      this.smooth[i] = s
        ? { x: s.x + (p.x - s.x) * a, y: s.y + (py - s.y) * a, v: vis(i) }
        : { x: p.x, y: py, v: vis(i) };
    }
    const P = this.smooth;
    o.points = P;
    const sh = { x: (P[LM.L_SHOULDER].x + P[LM.R_SHOULDER].x) / 2, y: (P[LM.L_SHOULDER].y + P[LM.R_SHOULDER].y) / 2 };
    const sw = Math.hypot(P[LM.L_SHOULDER].x - P[LM.R_SHOULDER].x, P[LM.L_SHOULDER].y - P[LM.R_SHOULDER].y);
    // hips are the best "body height" marker (they do not move when you raise
    // your arms), but they are only usable when the camera sees them
    const hipsVisible = P[LM.L_HIP].v > 0.6 && P[LM.R_HIP].v > 0.6;
    const hipY = (P[LM.L_HIP].y + P[LM.R_HIP].y) / 2;

    // 2. both hands above the nose (works before calibration: used to join)
    const handsUp = P[LM.L_WRIST].v > 0.3 && P[LM.R_WRIST].v > 0.3 &&
      P[LM.L_WRIST].y < P[LM.NOSE].y && P[LM.R_WRIST].y < P[LM.NOSE].y;
    if (handsUp) this.handsUpSince ??= t;
    else { this.handsUpSince = null; this.boostFired = false; }
    o.handsUp = handsUp;
    o.handsUpHeld = handsUp ? t - this.handsUpSince : 0;

    // arms crossed in front of the body (an X): the wrists swap sides, below
    // the nose (an X above the head would also be "hands up")
    const shDir = Math.sign(P[LM.L_SHOULDER].x - P[LM.R_SHOULDER].x) || 1;
    const wristGap = ((P[LM.L_WRIST].x - P[LM.R_WRIST].x) * shDir) / sw;  // normally > 0
    const belly = hipsVisible ? hipY : sh.y + 1.6 * sw;
    const chest = (p) => p.y > P[LM.NOSE].y && p.y < belly;
    const crossed = P[LM.L_WRIST].v > 0.3 && P[LM.R_WRIST].v > 0.3 && wristGap < -0.15 &&
      chest(P[LM.L_WRIST]) && chest(P[LM.R_WRIST]);
    if (crossed) this.crossSince ??= t;
    else this.crossSince = null;
    o.crossed = crossed;
    o.crossHeld = crossed ? t - this.crossSince : 0;

    // 3. calibration: record the neutral pose for a moment (arms down).
    //    The median ignores a few glitchy frames.
    if (this.calibration) {
      const c = this.calibration;
      if (handsUp) {
        c.start = null;
        c.samples = [];
      } else {
        if (c.start === null) c.start = t;
        const tilt = tiltOf(P, sh, sw, hipsVisible, cfg.torsoRatio);
        c.samples.push({ x: sh.x, y: sh.y, sw, hy: hipsVisible ? hipY : null, th: tilt.hip, tr: tilt.roll });
        if (t - c.start >= cfg.calibrationSeconds) {
          const med = (k) => {
            const v = c.samples.map((s) => s[k]).filter((x) => x !== null).sort((p, q) => p - q);
            return v.length > c.samples.length / 2 ? v[Math.floor(v.length / 2)] : null;
          };
          // the way you naturally stand (or a slightly tilted camera) counts
          // as "straight", but a real lean while calibrating is not trusted
          const neutral = (k) => clampAbs(med(k) ?? 0, cfg.tiltNeutralMax);
          this.baseline = { x: med('x'), y: med('y'), sw: med('sw'), hy: med('hy'), th: neutral('th'), tr: neutral('tr') };
          this.calibration = null;
          this.boostFired = true; // do not dash with the hands that just joined
        }
      }
      o.steer = 0; o.run = 0; o.calibrated = false;
      this.prev = null;
      return o;
    }

    if (!this.baseline) {
      o.steer = 0; o.run = 0;
      o.calibrated = false;
      this.prev = null;
      return o;
    }
    o.calibrated = true;

    // 4. position relative to the calibrated neutral pose
    const b = this.baseline;
    b.sw += (sw - b.sw) * cfg.scaleFollow;
    // sideways tilt of the upper body, + = your right. Shoulders over the
    // hips when the camera sees the hips, else the slope of the shoulders.
    const tilt = tiltOf(P, sh, b.sw, hipsVisible, cfg.torsoRatio);
    const lean = tilt.hip !== null ? tilt.hip - b.th : tilt.roll - b.tr;
    // body height marker: hips if visible now and at calibration, else shoulders
    const useHips = hipsVisible && b.hy !== null;
    const anchor = useHips ? hipY : sh.y;
    const anchorBase = useHips ? b.hy : b.y;
    const lift = (anchorBase - anchor) / b.sw;   // + = body higher than normal
    let vUp = 0;
    if (this.prev && this.prev.useHips === useHips && t > this.prev.t) {
      vUp = (this.prev.y - anchor) / (t - this.prev.t) / b.sw;
    }
    this.prev = { y: anchor, t, useHips };

    // 5. steering: analogue, with a dead zone around the centre
    const mag = clamp01((Math.abs(lean) - cfg.tiltDead) / (cfg.tiltFull - cfg.tiltDead));
    o.steer = Math.sign(lean) * mag;

    // 6. running in place: how much the body bounces / the knees or arms
    //    alternate over the last ~0.6 s (peak to peak, in shoulder widths)
    const kneesVisible = P[LM.L_KNEE].v > 0.5 && P[LM.R_KNEE].v > 0.5;
    const armsVisible = P[LM.L_WRIST].v > 0.5 && P[LM.R_WRIST].v > 0.5;
    this.history.push({
      t, useHips,
      y: anchor / b.sw,
      knee: kneesVisible ? (P[LM.L_KNEE].y - P[LM.R_KNEE].y) / b.sw : null,
      arm: armsVisible ? (P[LM.L_WRIST].y - P[LM.R_WRIST].y) / b.sw : null,
    });
    while (this.history.length && t - this.history[0].t > cfg.runWindow) this.history.shift();
    const span = (k) => {
      let lo = Infinity;
      let hi = -Infinity;
      for (const h of this.history) {
        const v = h[k];
        if (v === null || (k === 'y' && h.useHips !== useHips)) continue;
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      return hi > lo ? hi - lo : 0;
    };
    const bob = clamp01((span('y') - cfg.bobMin) / (cfg.bobFull - cfg.bobMin));
    const knee = clamp01((span('knee') - cfg.kneeMin) / (cfg.kneeFull - cfg.kneeMin));
    const arm = handsUp ? 0 : clamp01((span('arm') - cfg.armMin) / (cfg.armFull - cfg.armMin));
    const activity = Math.max(bob, knee, arm);
    o.activity = activity;
    o.run += (activity - o.run) * (activity > o.run ? cfg.runAttack : cfg.runRelease);

    // 7. jump = high AND fast upward movement. Raising your arms lifts the
    //    shoulders a little, so with shoulders only we ignore jumps with hands up.
    const sinceJump = t - this.lastJumpAt;
    const jumpAllowed = useHips || !handsUp;
    if (jumpAllowed && lift > cfg.jumpRise && vUp > cfg.jumpVelocity && sinceJump > cfg.jumpCooldown) {
      o.jump = true;
      this.lastJumpAt = t;
    }

    // 8. both hands up for a moment = rainbow dash (once per raise)
    if (handsUp && !this.boostFired && o.handsUpHeld >= cfg.boostHold) {
      o.boost = true;
      this.boostFired = true;
    }

    // 9. slowly follow posture changes while standing still
    if (!handsUp && Math.abs(lift) < 0.3 && Math.abs(vUp) < 0.3 && activity < 0.05 && t - this.lastJumpAt > 1) {
      b.y += (sh.y - b.y) * cfg.baselineFollow;
      if (useHips) b.hy += (hipY - b.hy) * cfg.baselineFollow;
    }

    o.lean = lean;
    o.lift = lift;
    return o;
  }
}

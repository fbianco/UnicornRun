// ---------------------------------------------------------------------------
// main.js - wires everything together and runs the loop.
//
//   camera -> PoseTracker -> PlayerAssigner -+-> RunnerGestures P1 --\
//                (2 skeletons)               +-> RunnerGestures P2 ---+-> InputManager -> Race -> Renderer
//   keyboard ---------------------------------------------------------/   (2 intents)     |     (2 RoadViews)
//                                                                                        Sound
//
// App screens: boot (click to enable camera + sound) -> lobby (join +
// calibrate each player) -> training (new body players learn the moves, an X
// with the arms skips it) -> race -> results -> rematch / lobby.
// The game logic runs at a fixed 60 updates per second ("fixed timestep"),
// independent of the monitor refresh rate; drawing happens once per frame.
// ---------------------------------------------------------------------------
import { GESTURE, KEYS, PLAYERS, PLAYER_Z, TUTORIAL } from './config.js';
import { Race } from './game/Race.js';
import { Tutorial } from './game/Tutorial.js';
import { Renderer } from './render/Renderer.js';
import { Particles } from './render/Particles.js';
import { Sound } from './audio/Sound.js';
import { Keyboard } from './input/Keyboard.js';
import { RunnerGestures } from './input/RunnerGestures.js';
import { PlayerAssigner } from './input/PlayerAssigner.js';
import { PoseTracker } from './input/PoseTracker.js';
import { InputManager } from './input/InputManager.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);

const sound = new Sound();
const fx = new Particles(2);
const race = new Race({ sound, fx });
const tutorial = new Tutorial({ sound, fx });
const renderer = new Renderer($('game'));
const keyboard = new Keyboard(window);
const gestures = [new RunnerGestures(), new RunnerGestures()];
const assigner = new PlayerAssigner();
const pose = new PoseTracker($('cam'), $('cam-overlay'));
const input = new InputManager(keyboard, gestures);

// one "seat" per player: how they play (body / keys / empty = CPU).
// trained = this player went through the training (or skipped it).
const slots = [0, 1].map((i) => ({
  mode: null, gest: gestures[i], lm: null, trained: false,
  joinHold: 0, calib: 0, ready: false, missingSince: null,
  flash: { jump: 0, boost: 0 },
}));

// the lobby background: a camera flying down the track behind two unicorns
const demoRunner = (index, ahead, x) => ({ index, dist: ahead, x, jumpH: 0, anim: index, steerVis: 0, stumble: 0, dash: 0, ahead });
const demo = {
  track: race.track,
  camera: { index: 0, dist: 0, x: 0, collected: null },
  unicorns: [demoRunner(0, PLAYER_Z + 700, -0.3), demoRunner(1, PLAYER_Z + 950, 0.3)],
};

const app = {
  screen: 'boot',
  time: 0,
  race,
  tutorial,
  fx,
  slots,
  demo,
  paused: false,
  pauseReason: '',
  startIn: null,
  calibratingInRace: false,
  get bodyReady() { return pose.ready; },
  // the lobby countdown leads to the training (not straight to the race)
  get willTrain() { return needsTraining().some(Boolean); },
  get poseMessage() { return pose.message; },
};

let joinLock = 0;    // avoid joining / rematching twice with the same raised hands
let backSince = null;

// ---- boot: one click is needed by browsers to allow sound -----------------
$('boot-btn').addEventListener('click', () => {
  $('boot').classList.add('hidden');
  sound.init();
  sound.play('start');
  app.screen = 'lobby';
  startPose();
});

async function startPose() {
  setStatus();
  await pose.start();
  input.bodyEnabled = pose.ready;
  setStatus();
}

function setStatus() {
  const el = $('cam-status');
  el.textContent = pose.message;
  el.className = pose.ready ? 'ok' : pose.status === 'error' ? 'err' : '';
  $('cam-panel').classList.toggle('no-cam', pose.status === 'error');
}

// ---- screens ----------------------------------------------------------------
// who has to train: body players who have not done it yet
function needsTraining() {
  return slots.map((s) => pose.ready && s.mode === 'body' && !s.trained);
}

// lobby -> training if somebody needs it, else straight to the start line
function leaveLobby() {
  const who = needsTraining();
  if (!who.some(Boolean)) { beginRace(); return; }
  keyboard.clearPressed();
  input.reset();
  tutorial.start(who);
  app.screen = 'tutorial';
  app.startIn = null;
  sound.play('start');
}

function beginRace() {
  keyboard.clearPressed();
  input.reset();
  race.newRace(slots.map((s) => !s.mode));
  app.screen = 'race';
  app.paused = false;
  app.startIn = null;
  sound.play('start');
}

function toLobby() {
  sound.stopMusic();
  app.screen = 'lobby';
  app.paused = false;
  joinLock = 1.5;
}

function updateLobby(dt, now) {
  // the fly-through background
  demo.camera.dist += 5200 * dt;
  for (const u of demo.unicorns) {
    u.dist = demo.camera.dist + u.ahead;
    u.anim += dt * 13;
    const hop = Math.sin(app.time * 1.7 + u.index * 2);
    u.jumpH = hop > 0.93 ? (hop - 0.93) * 6000 : 0;
  }

  for (let i = 0; i < 2; i++) {
    const s = slots[i];
    const g = s.gest.out;
    if (keyboard.consumeAny(KEYS[i].run) && s.mode !== 'body') {
      if (s.mode !== 'keys') sound.play('join', PLAYERS[i].pan);
      s.mode = 'keys';
      s.trained = false;
    }
    if (pose.ready && s.mode !== 'body') {
      s.joinHold = g.present && joinLock <= 0 ? Math.min(1, g.handsUpHeld / GESTURE.handsUpToJoin) : 0;
      if (s.joinHold >= 1) {
        s.mode = 'body';
        s.trained = false;
        s.gest.startCalibration();
        sound.play('join', PLAYERS[i].pan);
      }
    } else {
      s.joinHold = 0;
    }
    if (s.mode === 'body') {
      const was = s.calibratingNow;
      s.calibratingNow = s.gest.calibrating;
      s.calib = s.gest.calibrationProgress(now);
      if (was && !s.calibratingNow) sound.play('ready', PLAYERS[i].pan);
      // walked away from the lobby for good: free the seat
      if (!g.present) {
        s.missingSince ??= now;
        if (now - s.missingSince > 8000) { s.mode = null; s.trained = false; s.gest.forget(); }
      } else {
        s.missingSince = null;
      }
    }
    s.ready = s.mode === 'keys' || (s.mode === 'body' && !!s.gest.baseline && !s.gest.calibrating);
  }

  // start automatically once everyone who joined is ready
  const joined = slots.filter((s) => s.mode);
  if (joined.length && joined.every((s) => s.ready)) {
    app.startIn ??= joined.length === 2 ? 3 : 6;
    app.startIn -= dt;
    if (app.startIn <= 0) leaveLobby();
  } else {
    app.startIn = null;
  }
  if (keyboard.consume('Enter')) {
    if (!slots.some((s) => s.mode)) slots[0].mode = 'keys';
    beginRace();
  }
  if (keyboard.consume('Escape')) {
    for (const s of slots) { s.mode = null; s.gest.forget(); }
  }
  keyboard.clearPressed();
}

function updateTutorial(dt, now) {
  if (keyboard.consume('Escape')) { toLobby(); return; }
  const finish = () => {
    tutorial.players.forEach((p, i) => { if (p.active) slots[i].trained = true; });
    beginRace();
  };
  if (keyboard.consume('Enter')) { finish(); return; }

  // a body player who walked away for good: their seat goes to a CPU
  tutorial.players.forEach((p, i) => {
    const s = slots[i];
    if (!p.active || s.mode !== 'body') return;
    if (!s.gest.out.present) {
      s.missingSince ??= now;
      if (now - s.missingSince > TUTORIAL.dropAfter * 1000) {
        tutorial.drop(i);
        s.mode = null;
        s.gest.forget();
      }
    } else {
      s.missingSince = null;
    }
  });

  const skips = slots.map((s) => s.mode === 'body' && s.gest.out.crossHeld >= GESTURE.crossHold);
  const before = tutorial.players.map((p) => Math.floor(p.runner.anim / Math.PI));
  tutorial.update(dt, [input.intent(0), input.intent(1)], skips);
  tutorial.players.forEach((p, i) => {
    const r = p.runner;
    if (r.speed > 500 && !r.airborne && Math.floor(r.anim / Math.PI) !== before[i]) sound.play('hoof', PLAYERS[i].pan);
  });
  if (tutorial.allDone && tutorial.doneTime > TUTORIAL.endDelay) finish();
}

function updateRace(dt, now) {
  if (keyboard.consume('Escape')) { toLobby(); return; }
  if (keyboard.consume('KeyP')) {
    app.paused = !app.paused;
    app.pauseReason = '';
  }
  const bodySlots = slots.filter((s, i) => s.mode === 'body' && !race.cpus[i]);
  if (keyboard.consume('KeyC') && pose.ready && bodySlots.length) {
    for (const s of bodySlots) s.gest.startCalibration();
    app.paused = true;
    app.calibratingInRace = true;
    app.pauseReason = 'CALIBRATING - ARMS DOWN, STAND STILL';
  }
  if (app.calibratingInRace) {
    if (bodySlots.every((s) => !s.gest.calibrating)) {
      app.calibratingInRace = false;
      app.paused = false;
      sound.play('ready');
    }
    return;
  }

  // pause automatically when a body player walks out of the camera view
  if (input.bodyEnabled && race.state === 'racing') {
    let missing = null;
    for (let i = 0; i < 2; i++) {
      const s = slots[i];
      if (s.mode !== 'body' || race.cpus[i]) continue;
      if (!s.gest.out.present) {
        s.missingSince ??= now;
        if (now - s.missingSince > 1500) missing = i;
      } else {
        s.missingSince = null;
      }
    }
    if (missing !== null && !app.paused) {
      app.paused = true;
      app.pauseReason = `${PLAYERS[missing].label}: STEP BACK INTO THE CAMERA VIEW`;
    }
    if (app.paused && app.pauseReason && missing === null && bodySlots.every((s) => s.gest.out.present)) {
      backSince ??= now;
      if (now - backSince > 600) { app.paused = false; app.pauseReason = ''; }
    } else {
      backSince = null;
    }
  }
  if (app.paused) return;

  const before = race.runners.map((r) => Math.floor(r.anim / Math.PI));
  race.update(dt, [input.intent(0), input.intent(1)]);
  // hoof beats follow the gallop animation
  race.runners.forEach((r, i) => {
    if (r.speed > 500 && !r.airborne && Math.floor(r.anim / Math.PI) !== before[i]) sound.play('hoof', PLAYERS[i].pan);
  });

  if (race.state === 'over' && race.stateTime > 3) {
    const hands = pose.ready && slots.some((s, i) => !race.cpus[i] && s.mode === 'body' && s.gest.out.handsUpHeld > GESTURE.handsUpToJoin);
    if (keyboard.consume('Enter') || (hands && joinLock <= 0)) {
      joinLock = 2;
      beginRace();
    } else if (race.stateTime > 40) {
      toLobby();
    }
  }
}

function updateApp(dt, now) {
  app.time += dt;
  joinLock = Math.max(0, joinLock - dt);
  for (const s of slots) {
    s.flash.jump = Math.max(0, s.flash.jump - dt);
    s.flash.boost = Math.max(0, s.flash.boost - dt);
  }
  if (keyboard.consume('KeyM')) sound.toggleMute();
  if (keyboard.consume('KeyV')) {
    $('cam-panel').classList.toggle('collapsed');
    renderer.resize();
  }
  if (keyboard.consume('KeyR') && pose.status === 'error') startPose();

  if (app.screen === 'lobby') updateLobby(dt, now);
  else if (app.screen === 'tutorial') updateTutorial(dt, now);
  else if (app.screen === 'race') updateRace(dt, now);
}

// ---- camera panel (DOM) -------------------------------------------------------
const rows = [0, 1].map((i) => {
  const row = document.querySelector(`.prow[data-p="${i}"]`);
  const pill = (k) => row.querySelector(`[data-k="${k}"]`);
  return { left: pill('left'), right: pill('right'), run: pill('run'), jump: pill('jump'), boost: pill('boost'), mode: row.querySelector('.pmode') };
});

function updatePanel() {
  slots.forEach((s, i) => {
    const o = s.gest.out;
    const r = rows[i];
    const k = KEYS[i];
    r.left.classList.toggle('on', o.steer < -0.05 || keyboard.any(k.left));
    r.right.classList.toggle('on', o.steer > 0.05 || keyboard.any(k.right));
    const run = keyboard.any(k.run) ? 1 : o.run;
    r.run.style.setProperty('--fill', `${Math.round(run * 100)}%`);
    r.jump.classList.toggle('on', s.flash.jump > 0);
    r.boost.classList.toggle('on', s.flash.boost > 0);
    r.mode.textContent = s.mode === 'body' ? (s.gest.calibrating ? 'calibrating' : o.present ? 'body' : 'not seen')
      : s.mode === 'keys' ? 'keys' : o.present ? 'seen' : '-';
  });
  if (pose.ready) {
    const n = slots.filter((s) => s.gest.out.present).length;
    $('cam-status').textContent = `Tracking ${n} player${n === 1 ? '' : 's'} (${Math.round(pose.fps)} fps)`;
  }
  pose.drawOverlay(slots);
}

// ---- the loop -------------------------------------------------------------------
const STEP = 1 / 60;
let last = performance.now();
let acc = 0;

function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;

  // 1. read the bodies (at most once per new camera frame)
  const poses = pose.detect(now);
  if (poses !== undefined) {
    const v = $('cam');
    const aspect = v.videoWidth ? v.videoHeight / v.videoWidth : 0.5625;
    const assigned = assigner.assign(poses, now);
    slots.forEach((s, i) => {
      s.lm = assigned[i];
      const out = s.gest.update(assigned[i], now, aspect);
      input.onGestureFrame(i, out);
      if (out.jump) s.flash.jump = 0.5;
      if (out.boost) s.flash.boost = 0.6;
    });
  }

  // 2. fixed-step simulation
  acc += dt;
  while (acc >= STEP) {
    updateApp(STEP, now);
    acc -= STEP;
  }

  // 3. draw
  updatePanel();
  renderer.render(app);
  requestAnimationFrame(frame);
}

// ?demo  -> watch two CPU unicorns race (no camera)    ?lobby -> skip the boot card
if (params.has('demo')) {
  $('boot').classList.add('hidden');
  race.newRace([true, true]);
  app.screen = 'race';
} else if (params.has('lobby')) {
  $('boot').classList.add('hidden');
  app.screen = 'lobby';
}

let started = false;
const go = () => {
  if (started) return;
  started = true;
  renderer.sprites.rebake(); // signs contain text: bake them with the pixel font
  requestAnimationFrame(frame);
};
document.fonts?.load('16px "Press Start 2P"').finally(go);
setTimeout(go, 1500);

// handy for debugging in the browser console
window.unicornRun = { app, race, tutorial, gestures, slots, pose, sound, renderer };

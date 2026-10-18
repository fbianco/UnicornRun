// ---------------------------------------------------------------------------
// Tutorial: a short training run before the race, one per new body player.
//
//   lean left -> lean right -> run in place -> jump (x2) -> rainbow dash
//
// Each player trains in their own half of the screen, on a straight practice
// road (no rainbows, no obstacles), with the same Runner physics as the race,
// so what they learn is exactly what the race does. A step is passed by
// doing the move long enough in total (it never resets), then a short
// "GREAT!" moment leads to the next one. Crossing the arms in front of the
// body (an X) skips the rest. A player who is done may keep practising while
// waiting for the other one; once everybody is done the race starts.
//
// Pure logic (no DOM): unit tested in tests/tutorial.test.mjs.
// ---------------------------------------------------------------------------
import { RUN, TUTORIAL, PLAYERS } from '../config.js';
import { Track } from './Track.js';
import { Runner } from './Runner.js';

export const STEPS = ['left', 'right', 'run', 'jump', 'dash'];
const PRAISE = ['GREAT!', 'SUPER!', 'WOW!', 'YES!', 'AMAZING!'];
const IDLE = { steer: 0, run: 0, jump: false, boost: false };

export class Tutorial {
  constructor({ sound = null, fx = null } = {}) {
    this.sound = sound;
    this.fx = fx;
    this.track = new Track(7, { practice: true });
    this.start([false, false]);
  }

  /** who[i] = true when player i has to train. The others are done already. */
  start(who) {
    this.players = who.map((on, i) => ({
      active: on,          // this seat trains (a body player)
      done: !on,
      skipped: false,
      step: 0,             // index in STEPS
      progress: 0,         // 0..1 of the current step
      praise: 0,           // s left of "GREAT!" before the next step
      jumps: 0,
      runner: new Runner(i, { x: 0, dist: i * 4000, practice: true }),
    }));
    this.time = 0;
    this.doneTime = 0;     // s since everybody is done
    this.fx?.clear();
  }

  get allDone() {
    return this.players.every((p) => p.done);
  }

  /** The step player i is on ('left', ... 'dash'), or null when done. */
  stepOf(i) {
    const p = this.players[i];
    return p.done ? null : STEPS[p.step];
  }

  /** Give up on player i (left the camera view): the seat becomes a CPU. */
  drop(i) {
    const p = this.players[i];
    p.active = false;
    p.done = true;
  }

  /**
   * One tick. intents[i] = { steer, run, jump, boost } for player i,
   * skips[i] = true while player i holds the "skip" X long enough.
   */
  update(dt, intents, skips = [false, false]) {
    this.time += dt;
    this.fx?.update(dt);
    if (this.allDone) this.doneTime += dt;

    this.players.forEach((p, i) => {
      const r = p.runner;
      if (p.active && !p.done && skips[i]) this.finish(i, true);
      const step = p.done ? null : STEPS[p.step];
      // the dash step always has a full rainbow meter ready
      if (step === 'dash' && r.dash <= 0) r.power = RUN.powerMax;
      const intent = p.active ? intents[i] ?? IDLE : { ...IDLE, run: 0.2 };
      const ev = r.step(dt, intent, this.track, this.time);
      // drift gently back to the middle of the road when not steering
      if (Math.abs(intent.steer) < 0.05) r.x -= r.x * Math.min(1, dt * 0.8);
      for (const e of ev) this.event(i, e);
      if (!step || p.praise > 0) {
        if (p.praise > 0) {
          p.praise -= dt;
          if (p.praise <= 0) this.next(i);
        }
        return;
      }

      const T = TUTORIAL;
      switch (step) {
        case 'left': if (intent.steer <= -T.steerMin) p.progress += dt / T.steerHold; break;
        case 'right': if (intent.steer >= T.steerMin) p.progress += dt / T.steerHold; break;
        case 'run': if (intent.run >= T.runMin) p.progress += dt / T.runHold; break;
        case 'jump': if (ev.includes('jump')) p.progress = ++p.jumps / T.jumps; break;
        case 'dash': if (ev.includes('dash')) p.progress = 1; break;
        default: break;
      }
      if (p.progress >= 1) {
        p.progress = 1;
        p.praise = T.praise;
        this.sound?.play('lap', PLAYERS[i].pan);
        this.fx?.sparkle(i, 30);
        this.fx?.banner(i, PRAISE[p.step % PRAISE.length]);
      }
    });
  }

  next(i) {
    const p = this.players[i];
    p.step++;
    p.progress = 0;
    if (p.step >= STEPS.length) this.finish(i, false);
  }

  finish(i, skipped) {
    const p = this.players[i];
    p.done = true;
    p.skipped = skipped;
    p.praise = 0;
    this.sound?.play('ready', PLAYERS[i].pan);
    this.fx?.banner(i, 'READY!');
  }

  event(i, e) {
    const pan = PLAYERS[i].pan;
    switch (e) {
      case 'jump': this.sound?.play('jump', pan); break;
      case 'land': this.sound?.play('land', pan); this.fx?.dust(i); break;
      case 'dash': this.sound?.play('dash', pan); this.fx?.sparkle(i, 40); break;
      default: break;
    }
  }
}

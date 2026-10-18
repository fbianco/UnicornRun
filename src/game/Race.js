// ---------------------------------------------------------------------------
// Race: the rules of one race between two unicorns.
//
//   countdown (3 s) -> racing -> over (results)
//
// Each tick it takes one intent per player (from InputManager or a Cpu),
// moves both runners, resolves unicorn-vs-unicorn bumps and keeps the
// standings. Sound and particles are told about events; the renderer only
// reads this object.
// ---------------------------------------------------------------------------
import { LAPS, ROAD, RUN, PLAYERS } from '../config.js';
import { Track } from './Track.js';
import { Runner } from './Runner.js';
import { Cpu } from './Cpu.js';

export const COUNTDOWN = 3;
const FINISH_GRACE = 15;   // s the second unicorn gets after the winner

export class Race {
  constructor({ sound = null, fx = null, track = null } = {}) {
    this.sound = sound;
    this.fx = fx;
    this.track = track ?? new Track();
    this.newRace([false, true]);
  }

  /** cpu[i] = true makes player i a computer unicorn. */
  newRace(cpu) {
    const start = -6 * ROAD.segmentLength;
    this.runners = [0, 1].map((i) => new Runner(i, { cpu: cpu[i], x: i === 0 ? -0.45 : 0.45, dist: start }));
    this.cpus = cpu.map((c, i) => (c ? new Cpu(11 + i * 31, 0.84 + i * 0.03) : null));
    this.state = 'countdown';
    this.stateTime = 0;
    this.time = 0;          // race clock (starts at GO)
    this.lastBeep = -1;
    this.firstFinish = null;
    this.fx?.clear();
  }

  setState(s) {
    this.state = s;
    this.stateTime = 0;
  }

  get standings() {
    return [...this.runners].sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished !== b.finished) return a.finished ? -1 : 1;
      return b.dist - a.dist;
    });
  }

  update(dt, intents) {
    this.stateTime += dt;
    this.fx?.update(dt);
    const [a, b] = this.runners;

    if (this.state === 'countdown') {
      const n = Math.ceil(COUNTDOWN - this.stateTime);
      if (n !== this.lastBeep && n > 0) { this.lastBeep = n; this.sound?.play('beep'); }
      for (const r of this.runners) r.anim += dt * 2;
      if (this.stateTime >= COUNTDOWN) {
        this.sound?.play('go');
        this.sound?.startMusic();
        this.setState('racing');
      }
      return;
    }
    if (this.state === 'over') {
      for (const r of this.runners) r.step(dt, { steer: 0, run: 0, jump: false, boost: false }, this.track, this.time);
      return;
    }

    this.time += dt;
    this.runners.forEach((r, i) => {
      const other = this.runners[1 - i];
      const intent = this.cpus[i] ? this.cpus[i].intent(dt, r, other, this.track) : intents[i];
      for (const e of r.step(dt, intent, this.track, this.time)) this.event(i, e);
    });

    // unicorn vs unicorn: push apart sideways, the one behind loses a bit
    const dz = a.dist - b.dist;
    const dx = a.x - b.x;
    const reach = RUN.halfWidth * 2;
    if (Math.abs(dz) < 140 && Math.abs(dx) < reach && Math.abs(a.jumpH - b.jumpH) < 200) {
      const push = (reach - Math.abs(dx)) / 2 + 0.01;
      const s = dx >= 0 ? 1 : -1;
      a.x += s * push;
      b.x -= s * push;
      const back = dz < 0 ? a : b;
      if (back.bump <= 0) {
        back.speed *= 0.85;
        back.bump = 0.5;
        this.sound?.play('bump');
      }
    }

    this.standings.forEach((r, k) => { r.place = k + 1; });

    // end of race
    if (this.firstFinish === null && (a.finished || b.finished)) this.firstFinish = this.time;
    // over when every human has finished (a CPU does not make you wait),
    // or when the second unicorn is too far behind the winner
    const humans = this.runners.filter((r) => !this.cpus[r.index]);
    const done = (humans.length ? humans : this.runners).every((r) => r.finished);
    if (done || (this.firstFinish !== null && this.time - this.firstFinish > FINISH_GRACE)) {
      this.sound?.stopMusic();
      this.sound?.play('fanfare');
      this.setState('over');
    }
  }

  event(i, e) {
    const pan = PLAYERS[i].pan;
    const fx = this.fx;
    switch (e) {
      case 'rainbow': this.sound?.play('rainbow', pan); fx?.sparkle(i); break;
      case 'jump': this.sound?.play('jump', pan); break;
      case 'land': this.sound?.play('land', pan); fx?.dust(i); break;
      case 'stumble': this.sound?.play('stumble', pan); fx?.stars(i); fx?.shake(i); break;
      case 'dash': this.sound?.play('dash', pan); fx?.sparkle(i, 40); break;
      case 'lap': this.sound?.play('lap', pan); fx?.banner(i, this.runners[i].lapNumber(this.track.length) === LAPS ? 'FINAL LAP!' : `LAP ${this.runners[i].lapNumber(this.track.length)}`); break;
      case 'finish': this.sound?.play('finish', pan); fx?.banner(i, 'FINISH!'); break;
      default: break;
    }
  }
}

// ---------------------------------------------------------------------------
// Runner: one unicorn - position on the track and its "kart physics".
//
//   dist   total distance run since the start (keeps growing over laps)
//   x      sideways position: 0 = middle, +-1 = road edges, beyond = grass
//   speed  forward speed (world units / s)
//   jumpH  height above the road while jumping
// ---------------------------------------------------------------------------
import { RUN, ROAD, LAPS } from '../config.js';

export class Runner {
  /** practice = training run: nothing to touch and no laps. */
  constructor(index, { cpu = false, x = 0, dist = 0, practice = false } = {}) {
    this.index = index;
    this.cpu = cpu;
    this.practice = practice;
    this.x = x;
    this.dist = dist;
    this.speed = 0;
    this.jumpH = 0;
    this.jumpV = 0;
    this.stumble = 0;      // s left of tumbling
    this.invuln = 0;
    this.power = 0;        // rainbow dash meter (0..RUN.powerMax)
    this.dash = 0;         // s left of rainbow dash
    this.rainbows = 0;
    this.collected = new Set();  // rainbow ids taken this lap
    this.finished = false;
    this.finishTime = 0;
    this.place = index + 1;
    this.anim = index * 0.37;
    this.steerVis = 0;     // smoothed steer, for leaning the sprite
    this.runVis = 0;       // last run input, for the HUD
    this.bump = 0;
  }

  get airborne() {
    return this.jumpH > 0 || this.jumpV > 0;
  }

  get speedPct() {
    return this.speed / RUN.maxSpeed;
  }

  /** Completed laps (0 before the first crossing of the line). */
  lapsDone(trackLength) {
    return Math.max(0, Math.floor(this.dist / trackLength));
  }

  lapNumber(trackLength) {
    return Math.min(LAPS, this.lapsDone(trackLength) + 1);
  }

  /**
   * One physics step. Returns a list of events for sound / effects:
   * 'jump', 'land', 'dash', 'rainbow', 'stumble', 'lap', 'finish'.
   */
  step(dt, intent, track, raceTime) {
    const ev = [];
    const seg = track.segmentAt(this.dist);
    const pct = this.speedPct;
    let { steer, run } = intent;

    this.invuln = Math.max(0, this.invuln - dt);
    this.bump = Math.max(0, this.bump - dt);
    if (this.finished) { steer = 0; run = 0.3; }
    if (this.stumble > 0) {
      this.stumble = Math.max(0, this.stumble - dt);
      steer = 0;
      run = 0;
    } else if (!this.finished) {
      if (intent.jump && !this.airborne) {
        this.jumpV = RUN.jumpSpeed;
        ev.push('jump');
      }
      if (intent.boost && this.power >= RUN.powerMax && this.dash <= 0) {
        this.dash = RUN.dashTime;
        this.power = 0;
        ev.push('dash');
      }
    }
    this.runVis = run;

    // forward speed: running in place sets the target speed
    let target = RUN.maxSpeed * (RUN.trot + (1 - RUN.trot) * run);
    if (this.dash > 0) {
      this.dash = Math.max(0, this.dash - dt);
      target = RUN.maxSpeed * RUN.dashSpeed;
    } else if (Math.abs(this.x) > 1 && !this.airborne) {
      target *= RUN.offRoadFactor;
    }
    if (this.stumble > 0) target = 0;
    if (this.speed < target) this.speed = Math.min(target, this.speed + RUN.accel * dt);
    else this.speed = Math.max(target, this.speed - RUN.decel * dt);

    // sideways: your steering vs. the curve pushing you out
    const control = this.airborne ? 0.6 : 1;
    this.x += steer * dt * RUN.steerRate * (0.45 + 0.55 * Math.min(1, pct)) * control;
    this.x -= dt * 2 * pct * Math.min(1, pct) * seg.curve * RUN.centrifugal;
    this.x = Math.max(-RUN.maxX, Math.min(RUN.maxX, this.x));
    this.steerVis += (steer - this.steerVis) * Math.min(1, dt * 8);

    // up and down
    if (this.airborne) {
      this.jumpV -= RUN.gravity * dt;
      this.jumpH += this.jumpV * dt;
      if (this.jumpH <= 0) {
        this.jumpH = 0;
        this.jumpV = 0;
        ev.push('land');
      }
    }

    // move forward and check everything we passed over
    const before = this.dist;
    this.dist += this.speed * dt;
    this.anim += dt * (2 + 13 * pct);
    if (this.practice) return ev;
    const from = Math.floor(before / ROAD.segmentLength);
    const to = Math.floor(this.dist / ROAD.segmentLength);
    for (let s = from; s <= to; s++) {
      for (const it of track.segmentAt(s * ROAD.segmentLength).items) this.touch(it, ev);
    }

    // laps
    const lapsBefore = Math.max(0, Math.floor(before / track.length));
    const lapsNow = this.lapsDone(track.length);
    if (!this.finished && lapsNow > lapsBefore && before >= 0) {
      this.collected.clear();
      if (lapsNow >= LAPS) {
        this.finished = true;
        this.finishTime = raceTime;
        ev.push('finish');
      } else {
        ev.push('lap');
      }
    }
    return ev;
  }

  touch(it, ev) {
    const reach = RUN.halfWidth + (it.type === 'rainbow' ? 0.14 : it.halfW);
    if (Math.abs(this.x - it.offset) > reach) return;
    if (it.type === 'rainbow') {
      if (this.collected.has(it.id)) return;
      // floating rainbows need a jump, ground ones are missed when flying high
      if (it.air ? this.jumpH < 250 : this.jumpH > 500) return;
      this.collected.add(it.id);
      this.rainbows++;
      this.power = Math.min(RUN.powerMax, this.power + 1);
      this.speed += RUN.maxSpeed * RUN.rainbowKick;
      ev.push('rainbow');
    } else if (this.jumpH < RUN.clearHeight && this.dash <= 0 && this.invuln <= 0 && this.stumble <= 0) {
      this.stumble = RUN.stumbleTime;
      this.invuln = RUN.stumbleTime + RUN.invulnTime;
      this.speed *= RUN.stumbleSpeed;
      ev.push('stumble');
    }
  }
}

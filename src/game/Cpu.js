// ---------------------------------------------------------------------------
// Cpu: a computer-controlled unicorn for an empty seat (and for the demo).
// It produces exactly the same { steer, run, jump, boost } intent a human
// does, so the race code treats both alike.
// ---------------------------------------------------------------------------
import { ROAD, RUN } from '../config.js';

const LOOK = 45;   // segments to look ahead

export class Cpu {
  constructor(seed = 1, skill = 0.86) {
    this.skill = skill;
    this.lane = 0;
    this.laneTimer = 0;
    this.seed = seed;
    this.miss = new Set();   // obstacles it decided to "forget" (keeps it beatable)
  }

  rand() {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }

  intent(dt, me, other, track) {
    const segLen = ROAD.segmentLength;
    const base = Math.floor(me.dist / segLen);
    this.laneTimer -= dt;
    if (this.laneTimer <= 0) {
      this.lane = (this.rand() - 0.5) * 1.1;
      this.laneTimer = 2 + this.rand() * 3;
    }
    let target = this.lane;
    let jump = false;
    let dodging = false;
    let wantRainbow = null;

    for (let n = 0; n < LOOK; n++) {
      const segIndex = base + n;
      const dz = segIndex * segLen - me.dist;
      if (dz < -segLen) continue;
      for (const it of track.segmentAt(segIndex * segLen).items) {
        if (it.type === 'obstacle') {
          if (Math.abs(it.offset - me.x) > it.halfW + RUN.halfWidth + 0.08) continue;
          if (!this.miss.has(it.id) && this.rand() < 0.002) this.miss.add(it.id);
          if (this.miss.has(it.id)) continue;
          const tta = dz / Math.max(1, me.speed);
          if (it.kind === 'hurdle' || tta < 0.35) {
            if (tta < 0.3) jump = true;
          } else if (!dodging) {
            // steer to the free side of the obstacle
            const left = it.offset - it.halfW - RUN.halfWidth - 0.15;
            const right = it.offset + it.halfW + RUN.halfWidth + 0.15;
            target = Math.abs(left - me.x) < Math.abs(right - me.x) && left > -0.95 ? left : right < 0.95 ? right : left;
            dodging = true;
          }
        } else if (!wantRainbow && !it.air && !me.collected.has(it.id) && n < 25) {
          wantRainbow = it;
        }
      }
    }
    if (!dodging && wantRainbow) target = wantRainbow.offset;

    // a bit of rubber band so races stay close
    let run = this.skill;
    if (other) {
      const gap = (other.dist - me.dist) / track.length;
      if (gap > 0.05) run = 1;
      else if (gap < -0.08) run = this.skill * 0.85;
    }
    // lean into curves a little
    const curve = track.segmentAt(me.dist + segLen * 6).curve;
    const steer = Math.max(-1, Math.min(1, (target - me.x) * 3 + curve * 0.12 * me.speedPct));
    return { steer, run, jump, boost: me.power >= RUN.powerMax };
  }
}

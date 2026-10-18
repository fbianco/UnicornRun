// ---------------------------------------------------------------------------
// Track: the race course, as a loop of thin road slices ("segments").
//
// This is the classic pseudo-3D racer model (arcade / 16-bit era): the road
// is NOT a 3D mesh. It is a list of slices, each with
//   - a depth z (index * segmentLength),
//   - a curve value (how much the road bends at that slice),
//   - a height y (hills),
//   - things standing on it: scenery, rainbows and obstacles.
// The renderer projects the slices in front of each camera to the screen.
//
// Pure data + maths: no DOM, so it is unit tested in Node.
// ---------------------------------------------------------------------------
import { ROAD, RUN } from '../config.js';

const SEG = ROAD.segmentLength;
const L = { SHORT: 25, MEDIUM: 50, LONG: 100 };
const CURVE = { EASY: 2, MEDIUM: 3, HARD: 4.5 };
const HILL = { LOW: 15, MEDIUM: 30, HIGH: 45 };

const easeIn = (a, b, p) => a + (b - a) * p * p;
const easeInOut = (a, b, p) => a + (b - a) * (-Math.cos(p * Math.PI) / 2 + 0.5);

// tiny deterministic random generator, so the track is the same every time
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Obstacle kinds: halfW in road half-widths, h = world height
export const OBSTACLES = {
  hurdle: { halfW: RUN.maxX + 0.3, h: 260 },   // spans everything: you must jump
  rock: { halfW: 0.2, h: 220 },
  log: { halfW: 0.5, h: 180 },
};

export class Track {
  /** practice = the training road: a straight loop, scenery only. */
  constructor(seed = 7, { practice = false } = {}) {
    this.random = rng(seed);
    this.practice = practice;
    this.segments = [];
    this.rainbows = [];
    this.obstacles = [];
    if (practice) this.buildPractice();
    else this.build();
    this.length = this.segments.length * SEG;
    this.map = this.buildMap();
    // where the full-width hurdles stand (a runner touches an item when it
    // enters the item's slice)
    this.hurdleZ = this.obstacles.filter((o) => o.kind === 'hurdle').map((o) => o.seg * SEG).sort((a, b) => a - b);
  }

  // ---- construction ---------------------------------------------------------
  lastY() {
    const n = this.segments.length;
    return n ? this.segments[n - 1].p2.y : 0;
  }

  addSegment(curve, y) {
    const n = this.segments.length;
    this.segments.push({
      index: n,
      p1: { x: 0, y: this.lastY(), z: n * SEG, camera: {}, screen: {} },
      p2: { x: 0, y, z: (n + 1) * SEG, camera: {}, screen: {} },
      curve,
      sprites: [],   // scenery: { kind, offset }
      items: [],     // rainbows and obstacles (gameplay)
      clip: 0,
    });
  }

  addRoad(enter, hold, leave, curve, hill) {
    const startY = this.lastY();
    const endY = startY + hill * SEG;
    const total = enter + hold + leave;
    const from = this.segments.length;
    for (let n = 0; n < enter; n++) this.addSegment(easeIn(0, curve, n / enter), easeInOut(startY, endY, n / total));
    for (let n = 0; n < hold; n++) this.addSegment(curve, easeInOut(startY, endY, (enter + n) / total));
    for (let n = 0; n < leave; n++) this.addSegment(easeInOut(curve, 0, n / leave), easeInOut(startY, endY, (enter + hold + n) / total));
    return { from, to: this.segments.length - 1, curve };
  }

  build() {
    const curves = [];
    const straights = [];
    const r = (...a) => this.addRoad(...a);
    straights.push(r(0, 70, 0, 0, 0));                                   // start / finish
    curves.push(r(L.SHORT, L.MEDIUM, L.SHORT, CURVE.MEDIUM, HILL.LOW));  // first right-hander, uphill
    straights.push(r(L.SHORT, L.MEDIUM, L.SHORT, 0, -HILL.LOW));         // dip
    curves.push(r(L.SHORT, L.SHORT, L.SHORT, -CURVE.EASY, 0));           // S-bends
    curves.push(r(L.SHORT, L.SHORT, L.SHORT, CURVE.MEDIUM, 0));
    for (let i = 0; i < 4; i++) straights.push(r(15, 10, 15, 0, i % 2 ? -6 : 6)); // rolling hills
    curves.push(r(L.MEDIUM, L.LONG * 0.8, L.MEDIUM, CURVE.HARD, HILL.MEDIUM));     // big hairpin, climbing
    straights.push(r(L.SHORT, L.MEDIUM, L.SHORT, 0, -HILL.MEDIUM));      // downhill rush
    curves.push(r(L.SHORT, L.MEDIUM, L.SHORT, -CURVE.MEDIUM, HILL.LOW));
    curves.push(r(L.MEDIUM, L.LONG, L.MEDIUM, CURVE.MEDIUM, 0));
    // back to the start height
    straights.push(r(L.SHORT, L.MEDIUM, L.SHORT, 0, -this.lastY() / SEG));
    straights.push(r(0, 30, 0, 0, 0));
    this.straights = straights;
    this.curves = curves;
    this.segments[0].checker = true;     // the start / finish line
    this.segments[1].checker = true;
    this.placeScenery(curves);
    this.placeGameplay(straights, curves);
  }

  // the training road: rolling hills on a straight loop, no rainbows, no
  // obstacles, no start line, so nothing distracts from the lesson
  buildPractice() {
    for (let i = 0; i < 8; i++) this.addRoad(20, 20, 20, 0, i % 2 ? -HILL.LOW : HILL.LOW);
    this.straights = [];
    this.curves = [];
    this.placeScenery([], false);
  }

  sprite(index, kind, offset) {
    this.segments[index % this.segments.length].sprites.push({ kind, offset });
  }

  placeScenery(curves, finishLine = true) {
    const n = this.segments.length;
    const rand = this.random;
    // start / finish rainbow arch over the road
    if (finishLine) {
      this.sprite(0, 'banner', 0);
      this.sprite(n - 1, 'flagL', -1.15);
      this.sprite(n - 1, 'flagR', 1.15);
    }
    const near = ['tree', 'tree2', 'lollipop', 'mushroom', 'flowers', 'tree3', 'candy'];
    const far = ['tree', 'castle', 'cloudbush', 'crystal', 'tree2', 'tree3', 'cloudbush'];
    for (let i = 8; i < n - 4; i += 3) {
      for (const side of [-1, 1]) {
        if (rand() < 0.3) continue;
        const nearOne = rand() < 0.6;
        const list = nearOne ? near : far;
        const kind = list[Math.floor(rand() * list.length)];
        const off = nearOne ? 1.35 + rand() * 1.1 : 2.6 + rand() * 2.5;
        this.sprite(i, kind, side * off);
      }
    }
    // arrow signs on the outside of every curve
    for (const c of curves) {
      const side = c.curve > 0 ? -1 : 1;
      for (let i = c.from + 6; i < c.to - 6; i += 9) this.sprite(i, side < 0 ? 'signR' : 'signL', side * 1.2);
    }
  }

  item(index, it) {
    const seg = this.segments[index % this.segments.length];
    it.seg = seg.index;
    seg.items.push(it);
    (it.type === 'rainbow' ? this.rainbows : this.obstacles).push(it);
    return it;
  }

  rainbow(index, offset, air = false) {
    return this.item(index, { type: 'rainbow', id: this.rainbows.length, offset, air });
  }

  obstacle(index, kind, offset) {
    const o = OBSTACLES[kind];
    return this.item(index, { type: 'obstacle', id: this.obstacles.length, kind, offset, halfW: o.halfW, h: o.h });
  }

  placeGameplay(straights, curves) {
    const rand = this.random;
    const lanes = [-0.6, 0, 0.6];
    const row = (start, offset, count = 5, step = 3) => {
      for (let k = 0; k < count; k++) this.rainbow(start + k * step, offset);
    };
    const sweep = (start, from, to, count = 7, step = 3) => {
      for (let k = 0; k < count; k++) this.rainbow(start + k * step, from + ((to - from) * k) / (count - 1));
    };

    // full-width hurdles on three straights, each with a reward arc above it
    const hurdleSpots = [straights[1], straights[5], straights[6]];
    for (const s of hurdleSpots) {
      const at = Math.floor((s.from + s.to) / 2);
      this.obstacle(at, 'hurdle', 0);
      this.sprite(at - 30, 'jumpL', -1.25);
      this.sprite(at - 30, 'jumpR', 1.25);
      for (const off of [-0.5, 0.5]) {
        this.rainbow(at - 2, off, true);
        this.rainbow(at, off, true);
        this.rainbow(at + 2, off, true);
      }
    }

    // rainbow rows and lane obstacles everywhere else
    const busy = new Set();
    for (const it of this.obstacles) for (let d = -40; d <= 40; d++) busy.add(it.seg + d);
    const n = this.segments.length;
    let i = 90;
    let pattern = 0;
    while (i < n - 40) {
      if (busy.has(i) || busy.has(i + 20)) { i += 10; continue; }
      const lane = lanes[Math.floor(rand() * 3)];
      switch (pattern++ % 4) {
        case 0: row(i, lane); break;
        case 1: sweep(i, lane, -lane || 0.6); break;
        case 2: {
          // obstacle in one lane, rainbows in another
          const free = lanes.filter((l) => l !== lane);
          this.obstacle(i + 6, rand() < 0.5 ? 'rock' : 'log', lane === 0 ? (rand() < 0.5 ? -0.5 : 0.5) : lane);
          row(i, free[Math.floor(rand() * free.length)]);
          break;
        }
        default: {
          this.obstacle(i + 3, 'rock', lane);
          this.obstacle(i + 3, 'rock', lane === 0 ? 0.75 : -lane);
          row(i + 10, lane === 0 ? -0.75 : 0);
        }
      }
      i += 55 + Math.floor(rand() * 30);
    }
  }

  // A top-down outline for the minimap: integrate the curves into a heading.
  // The pseudo-3D curves are not real angles, so we scale them to make one
  // full turn and spread the small closing error along the lap.
  buildMap() {
    const segs = this.segments;
    const total = segs.reduce((s, g) => s + g.curve, 0) || 1;
    const k = (Math.PI * 2) / total;
    let a = 0;
    let x = 0;
    let y = 0;
    const pts = [];
    for (const g of segs) {
      pts.push({ x, y });
      a += g.curve * k;
      x += Math.cos(a);
      y += Math.sin(a);
    }
    const ex = x / segs.length;
    const ey = y / segs.length;
    pts.forEach((p, i) => { p.x -= ex * i; p.y -= ey * i; });
    let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity;
    for (const p of pts) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    }
    const size = Math.max(maxX - minX, maxY - minY);
    return pts.map((p) => ({ x: (p.x - (minX + maxX) / 2) / size, y: (p.y - (minY + maxY) / 2) / size }));
  }

  // ---- queries --------------------------------------------------------------
  wrap(z) {
    return ((z % this.length) + this.length) % this.length;
  }

  /** Distance from z to the next full-width hurdle ahead (Infinity if none). */
  hurdleAhead(z) {
    const here = this.wrap(z);
    let best = Infinity;
    for (const hz of this.hurdleZ) best = Math.min(best, (hz - here + this.length) % this.length);
    return best;
  }

  segmentAt(z) {
    return this.segments[Math.floor(this.wrap(z) / SEG) % this.segments.length];
  }

  /** Ground height at depth z (interpolated inside the slice). */
  heightAt(z) {
    const s = this.segmentAt(z);
    const p = (this.wrap(z) % SEG) / SEG;
    return s.p1.y + (s.p2.y - s.p1.y) * p;
  }
}

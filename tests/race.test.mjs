// Track sanity + whole races simulated at 60 ticks per second.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Track } from '../src/game/Track.js';
import { Race } from '../src/game/Race.js';
import { Runner } from '../src/game/Runner.js';
import { LAPS, ROAD, RUN } from '../src/config.js';

const DT = 1 / 60;
const idle = { steer: 0, run: 0, jump: false, boost: false };

function simulate(race, intents = () => [idle, idle], maxSeconds = 400) {
  for (let i = 0; i < maxSeconds * 60 && race.state !== 'over'; i++) race.update(DT, intents(race));
  return race;
}

test('the track is a closed loop that returns to its start height', () => {
  const t = new Track();
  const last = t.segments[t.segments.length - 1];
  assert.ok(Math.abs(last.p2.y) < 1, `ends at height ${last.p2.y}`);
  assert.ok(t.segments.length > 800, `${t.segments.length} segments`);
  assert.ok(t.rainbows.length > 40, `${t.rainbows.length} rainbows`);
  assert.ok(t.obstacles.filter((o) => o.kind === 'hurdle').length === 3);
  // minimap closes on itself
  const a = t.map[0];
  const b = t.map[t.map.length - 1];
  assert.ok(Math.hypot(a.x - b.x, a.y - b.y) < 0.02);
});

test('slices are continuous (no gaps in height)', () => {
  const t = new Track();
  for (let i = 1; i < t.segments.length; i++) assert.equal(t.segments[i].p1.y, t.segments[i - 1].p2.y);
});

test('nobody moves during the countdown', () => {
  const race = new Race({ });
  race.newRace([false, false]);
  const d = race.runners[0].dist;
  for (let i = 0; i < 120; i++) race.update(DT, [{ ...idle, run: 1 }, { ...idle, run: 1 }]);
  assert.equal(race.state, 'countdown');
  assert.equal(race.runners[0].dist, d);
});

test('two CPU unicorns finish all laps in a sensible time', () => {
  const race = new Race();
  race.newRace([true, true]);
  simulate(race);
  assert.equal(race.state, 'over');
  const [first, second] = race.standings;
  assert.ok(first.finished);
  assert.ok(first.finishTime > 40 && first.finishTime < 200, `winner time ${first.finishTime.toFixed(1)} s`);
  assert.ok(first.rainbows > 20, `winner took ${first.rainbows} rainbows`);
  assert.equal(first.place, 1);
  assert.equal(second.place, 2);
});

test('a human who runs flat out beats a human who does not run', () => {
  const race = new Race();
  race.newRace([false, false]);
  simulate(race, (r) => [{ ...idle, run: 1, steer: cpuSteer(r, 0) }, { ...idle, run: 0.1, steer: cpuSteer(r, 1) }]);
  assert.equal(race.standings[0].index, 0);
});

// keep a scripted human on the road and jump hurdles
function cpuSteer(race, i) {
  const r = race.runners[i];
  const curve = race.track.segmentAt(r.dist + 1200).curve;
  return Math.max(-1, Math.min(1, -r.x * 2 + curve * 0.12 * r.speedPct));
}

test('hitting an obstacle makes you tumble; jumping clears it', () => {
  const track = new Track();
  const hurdle = track.obstacles.find((o) => o.kind === 'hurdle');
  const z = hurdle.seg * ROAD.segmentLength;

  const r1 = new Runner(0, { dist: z - 400 });
  r1.speed = RUN.maxSpeed;
  let ev = [];
  for (let i = 0; i < 10; i++) ev = ev.concat(r1.step(DT, { steer: 0, run: 1 }, track, 0));
  assert.ok(ev.includes('stumble'));
  assert.ok(r1.speed < RUN.maxSpeed * 0.5);

  const r2 = new Runner(0, { dist: z - 1500 });
  r2.speed = RUN.maxSpeed;
  ev = r2.step(DT, { steer: 0, run: 1, jump: true }, track, 0);
  for (let i = 0; i < 20; i++) ev = ev.concat(r2.step(DT, { steer: 0, run: 1 }, track, 0));
  assert.ok(ev.includes('jump'));
  assert.ok(!ev.includes('stumble'), 'jumped over');
});

test('a full rainbow meter, and the dash makes you faster', () => {
  const track = new Track();
  const r = new Runner(0, { dist: 0 });
  r.power = RUN.powerMax;
  r.speed = RUN.maxSpeed;
  const ev = r.step(DT, { steer: 0, run: 1, boost: true }, track, 0);
  assert.ok(ev.includes('dash'));
  for (let i = 0; i < 60; i++) r.step(DT, { steer: 0, run: 1 }, track, 0);
  assert.ok(r.speed > RUN.maxSpeed * 1.2);
  assert.equal(r.power, 0);
});

test('lap counting: crossing the line LAPS times finishes', () => {
  const track = new Track();
  const r = new Runner(0, { dist: -100 });
  r.dist = track.length * LAPS - 50;
  r.speed = RUN.maxSpeed;
  const ev = r.step(DT, { steer: 0, run: 1 }, track, 99);
  assert.ok(ev.includes('finish'));
  assert.equal(r.finishTime, 99);
});

test('jumping when the unicorn reaches the jump line clears the hurdle, at any speed', async () => {
  const { jumpCue } = await import('../src/game/hints.js');
  const { HINTS } = await import('../src/config.js');
  const track = new Track();
  const hz = track.hurdleZ[0];
  // keys react at once; a body jump is seen ~0.3 s after the child starts it
  for (const [lead, delay] of [[HINTS.jumpLeadKeys, 0], [HINTS.jumpLeadBody, 0.3], [HINTS.jumpLeadBody, 0.15], [HINTS.jumpLeadBody, 0.45]]) {
    for (const pct of [RUN.trot, 0.5, 1]) {
      const r = new Runner(0, { dist: hz - 9000 });
      r.speed = RUN.maxSpeed * pct;
      const run = (pct - RUN.trot) / (1 - RUN.trot);
      let seen = null;
      let jumped = false;
      let ev = [];
      for (let i = 0; i < 600 && r.dist < hz + 2000; i++) {
        const cue = jumpCue(r, track, lead);
        if (seen === null && cue?.now) seen = i * DT;
        const jump = !jumped && seen !== null && i * DT >= seen + delay;
        if (jump) jumped = true;
        ev = ev.concat(r.step(DT, { steer: 0, run, jump }, track, 0));
      }
      assert.ok(seen !== null, 'the cue fired');
      assert.ok(!ev.includes('stumble'), `lead ${lead} + delay ${delay} at ${pct} speed: tumbled`);
    }
  }
});

test('the jump cue warns before the hurdle and goes quiet after it', async () => {
  const { jumpCue } = await import('../src/game/hints.js');
  const track = new Track();
  const hz = track.hurdleZ[0];
  const r = new Runner(0, { dist: hz - RUN.maxSpeed * 2 });
  r.speed = RUN.maxSpeed;
  let cue = jumpCue(r, track, 0.5);
  assert.ok(cue.warn && !cue.now, '2 s before: warning only');
  r.dist = hz - RUN.maxSpeed * 0.3;
  cue = jumpCue(r, track, 0.5);
  assert.ok(cue.now, '0.3 s before: jump now');
  assert.ok(cue.lineDist < r.dist, 'the line is behind the unicorn');
  r.dist = hz + 10;
  cue = jumpCue(r, track, 0.5);
  assert.ok(!cue.warn, 'just after: quiet');
  assert.equal(jumpCue(r, new Track(7, { practice: true }), 0.5), null, 'no hurdles on the training road');
});

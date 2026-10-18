// ---------------------------------------------------------------------------
// Renderer: draws one frame from the current state. It only *reads* the game.
//
//   race screen   = two RoadViews (left half P1, right half P2), each clipped
//                   to its half, + particles + HUD per half, + shared minimap
//   lobby screen  = one full-width RoadView flying down the track behind the
//                   two unicorns, with the join / calibration cards on top
//   training      = like the race (one half per player) on the practice road,
//                   with the lesson card on top
// Each half has a console at the bottom: a steering slider whose dot follows
// your body tilt (the grey middle part is "straight"), and the dash meter.
//
// Everything is drawn in a fixed 1280 x 720 logical space; one transform
// scales it to the window and the screen's pixel density.
// ---------------------------------------------------------------------------
import { VIEW_W, VIEW_H, HALF_W, PLAYERS, RAINBOW, FONT, GAME_TITLE, STUDIO, LAPS, RUN, KEYS, ROAD, GESTURE, HINTS, TUTORIAL } from '../config.js';
import { COUNTDOWN } from '../game/Race.js';
import { STEPS } from '../game/Tutorial.js';
import { jumpCue } from '../game/hints.js';
import { SpriteCache } from './SpriteCache.js';
import { RoadView } from './RoadView.js';
import { drawUnicornSide, drawStickFigure, drawStar } from './sprites.js';

const ORD = ['1ST', '2ND'];

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ratio = 1;
    this.sprites = new SpriteCache().warm();
    this.views = [new RoadView(HALF_W, VIEW_H, this.sprites), new RoadView(HALF_W, VIEW_H, this.sprites)];
    this.lobbyView = new RoadView(VIEW_W, VIEW_H, this.sprites);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const box = this.canvas.parentElement.getBoundingClientRect();
    const scale = Math.max(0.2, Math.min(box.width / VIEW_W, box.height / VIEW_H));
    const dpr = window.devicePixelRatio || 1;
    this.canvas.style.width = `${Math.floor(VIEW_W * scale)}px`;
    this.canvas.style.height = `${Math.floor(VIEW_H * scale)}px`;
    this.canvas.width = Math.floor(VIEW_W * scale * dpr);
    this.canvas.height = Math.floor(VIEW_H * scale * dpr);
    this.ratio = scale * dpr;
    // backgrounds are pre-rendered at the real pixel size
    for (const v of [...this.views, this.lobbyView]) v.setRatio(Math.min(2, this.ratio));
  }

  render(app) {
    const ctx = this.ctx;
    ctx.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);
    ctx.imageSmoothingEnabled = true;
    if (app.screen === 'race') this.drawRace(app);
    else if (app.screen === 'tutorial') this.drawTutorial(app);
    else this.drawLobby(app);
  }

  // ---- race ----------------------------------------------------------------------
  drawRace(app) {
    const ctx = this.ctx;
    const race = app.race;
    const cpuTags = race.cpus.map(Boolean);
    const cues = [0, 1].map((v) => this.cueFor(app, v));
    for (let v = 0; v < 2; v++) {
      const me = race.runners[v];
      const cue = cues[v];
      // the jump line, while it is still in front of the unicorn
      const jumpLine = cue && cue.ahead < ROAD.drawDistance * ROAD.segmentLength && cue.lineDist > me.dist - ROAD.segmentLength ? cue.lineDist : null;
      const [sx, sy] = app.fx.shakeOffset(v);
      ctx.save();
      ctx.translate(v * HALF_W, 0);
      ctx.beginPath();
      ctx.rect(0, 0, HALF_W, VIEW_H);
      ctx.clip();
      ctx.save();
      ctx.translate(sx, sy);
      this.views[v].render(ctx, {
        track: race.track, me, others: [race.runners[1 - v]],
        time: app.time, view: v, fx: app.fx, cpuTags, jumpLine,
      });
      app.fx.draw(ctx, v);
      ctx.restore();
      if (!(race.state === 'over' && race.stateTime > 1.2)) this.drawHud(app, v, cue);
      ctx.restore();
    }
    this.drawDivider();
    this.drawMinimap(race);

    if (race.state === 'over' && race.stateTime > 1.2) this.drawResults(app);
    if (app.paused) {
      dim(ctx, 0.55);
      text(ctx, 'PAUSED', VIEW_W / 2, 330, { size: 36, align: 'center', glow: '#ff5fa8' });
      text(ctx, app.pauseReason || 'PRESS P TO CONTINUE', VIEW_W / 2, 384, { size: 13, align: 'center', color: '#bfefff' });
    }
  }

  drawDivider() {
    const ctx = this.ctx;
    const dg = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    RAINBOW.forEach((c, i) => dg.addColorStop(i / 5, c));
    ctx.fillStyle = '#2a1840';
    ctx.fillRect(HALF_W - 4, 0, 8, VIEW_H);
    ctx.fillStyle = dg;
    ctx.fillRect(HALF_W - 2, 0, 4, VIEW_H);
  }

  /** The next-hurdle cue for a human player during the race, else null. */
  cueFor(app, v) {
    const race = app.race;
    if (race.cpus[v] || race.state !== 'racing') return null;
    return jumpCue(race.runners[v], race.track, jumpLead(app, v));
  }

  drawHud(app, v, cue = null) {
    const ctx = this.ctx;
    const race = app.race;
    const r = race.runners[v];
    const look = PLAYERS[v];
    const cpu = !!race.cpus[v];
    const left = v === 0;
    const edge = left ? 20 : HALF_W - 20;
    const align = left ? 'left' : 'right';
    const cx = HALF_W / 2;
    const t = app.time;

    // place, name, lap, time
    text(ctx, ORD[r.place - 1], edge, 62, { size: 40, align, color: r.place === 1 ? '#fff27a' : '#ffffff', glow: look.color, stroke: '#2a1840' });
    text(ctx, cpu ? `${look.name} (CPU)` : `${look.label} ${look.name}`, edge, 86, { size: 10, align, color: look.light, stroke: '#2a1840' });
    const lap = race.state === 'countdown' ? 1 : r.lapNumber(race.track.length);
    text(ctx, `LAP ${lap}/${LAPS}`, edge, 116, { size: 14, align, stroke: '#2a1840' });
    text(ctx, clock(r.finished ? r.finishTime : race.time), edge, 138, { size: 10, align, color: '#ffffff', stroke: '#2a1840' });

    this.drawSpeedBar(r, v);
    const call = r.power >= RUN.powerMax && !cpu && race.state === 'racing';
    this.drawConsole(app, v, r, { dashCall: call });

    // get ready for the hurdle, then JUMP! when the unicorn reaches the line
    const warn = cue && cue.warn && !r.finished && r.stumble <= 0;
    if (warn && cue.now) {
      if (!r.airborne) {
        text(ctx, 'JUMP!', cx, 262, { size: 54, align: 'center', color: Math.floor(t * 8) % 2 ? '#fff27a' : '#ffffff', glow: '#ff5fa8', stroke: '#2a1840' });
      }
    } else if (warn) {
      const lead = jumpLead(app, v);
      const k = Math.max(0, Math.min(1, (HINTS.jumpWarn - cue.time) / (HINTS.jumpWarn - lead)));
      text(ctx, 'HURDLE AHEAD!', cx, 232, { size: 16, align: 'center', color: '#fff27a', stroke: '#2a1840' });
      ctx.fillStyle = 'rgba(42,24,64,0.7)';
      ctx.beginPath(); ctx.roundRect(cx - 104, 244, 208, 16, 8); ctx.fill();
      ctx.fillStyle = '#ff5fa8';
      ctx.beginPath(); ctx.roundRect(cx - 100, 247, Math.max(1, 200 * k), 10, 5); ctx.fill();
      const how = app.slots[v].mode === 'keys' ? `PRESS ${keyName(KEYS[v].jump[0])}` : 'JUMP';
      text(ctx, `${how} ON THE STRIPED LINE`, cx, 278, { size: 9, align: 'center', color: '#ffffff', stroke: '#2a1840' });
    }

    // hints, banners, countdown
    if (race.state === 'racing' && !cpu && !warn && !r.finished && r.runVis < 0.15 && race.time > 2 && Math.floor(t * 3) % 2) {
      text(ctx, app.slots[v].mode === 'keys' ? `HOLD ${keyName(KEYS[v].run[0])} TO RUN!` : 'RUN IN PLACE!', cx, 250, { size: 16, align: 'center', color: '#ffffff', glow: look.color, stroke: '#2a1840' });
    }
    for (const b of app.fx.banners[v]) {
      const k = Math.min(1, b.t * 5);
      ctx.globalAlpha = Math.min(1, (b.life - b.t) * 3);
      text(ctx, b.text, cx, 200, { size: 14 + 20 * k, align: 'center', color: '#ffffff', glow: look.color, stroke: '#2a1840' });
      ctx.globalAlpha = 1;
    }
    if (race.state === 'countdown') {
      const nn = Math.ceil(COUNTDOWN - race.stateTime);
      const f = 1 - (COUNTDOWN - race.stateTime - (nn - 1));
      text(ctx, String(nn), cx, 320, { size: 70 + f * 40, align: 'center', color: '#ffffff', glow: look.color, stroke: '#2a1840' });
      text(ctx, cpu ? 'CPU UNICORN' : app.slots[v].mode === 'keys' ? 'HOLD YOUR RUN KEY!' : 'GET READY TO RUN!', cx, 380, { size: 12, align: 'center', color: look.light, stroke: '#2a1840' });
    } else if (race.state === 'racing' && race.stateTime < 0.9) {
      text(ctx, 'GO!', cx, 330, { size: 90, align: 'center', color: '#fff27a', glow: '#ff5fa8', stroke: '#2a1840' });
    }
    if (r.finished && race.state !== 'over') {
      text(ctx, `${ORD[r.place - 1]} PLACE!`, cx, 300, { size: 30, align: 'center', color: '#fff27a', glow: look.color, stroke: '#2a1840' });
      text(ctx, 'WAITING FOR THE OTHER UNICORN...', cx, 336, { size: 9, align: 'center', stroke: '#2a1840' });
    }
  }

  // speed (fill) with the run input (white marker) on the outer edge
  drawSpeedBar(r, v) {
    const ctx = this.ctx;
    const left = v === 0;
    const bx = left ? 22 : HALF_W - 40;
    const by0 = VIEW_H - 230;
    const bh = 160;
    ctx.fillStyle = 'rgba(42,24,64,0.6)';
    ctx.beginPath(); ctx.roundRect(bx - 3, by0 - 3, 24, bh + 6, 8); ctx.fill();
    const sp = Math.min(1.5, r.speedPct) / 1.5;
    const sg = ctx.createLinearGradient(0, by0 + bh, 0, by0);
    sg.addColorStop(0, '#4ddb6a'); sg.addColorStop(0.6, '#ffe14d'); sg.addColorStop(1, '#ff5fa8');
    ctx.fillStyle = sg;
    ctx.beginPath(); ctx.roundRect(bx, by0 + bh * (1 - sp), 18, bh * sp, 6); ctx.fill();
    const my = by0 + bh * (1 - r.runVis / 1.5);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    if (left) { ctx.moveTo(bx + 22, my); ctx.lineTo(bx + 32, my - 6); ctx.lineTo(bx + 32, my + 6); } else { ctx.moveTo(bx - 4, my); ctx.lineTo(bx - 14, my - 6); ctx.lineTo(bx - 14, my + 6); }
    ctx.fill();
    text(ctx, 'RUN', bx + 9, by0 + bh + 22, { size: 8, align: 'center', stroke: '#2a1840' });
  }

  /**
   * The console at the bottom of a half: steering slider + rainbow dash meter.
   * dashCall = the meter is full and the player should fire it,
   * target = -1 / 1 highlights the end of the slider to reach (training).
   */
  drawConsole(app, v, r, { dashCall = false, target = 0 } = {}) {
    const ctx = this.ctx;
    const look = PLAYERS[r.index];
    const cx = HALF_W / 2;
    const t = app.time;
    ctx.fillStyle = 'rgba(42,24,64,0.65)';
    ctx.beginPath(); ctx.roundRect(cx - 190, 614, 380, 96, 16); ctx.fill();
    this.drawSteerSlider(cx, 638, 140, this.steerView(app, v, r), look.color, target, t);

    // rainbow dash meter: fills with rainbow stripes, one per rainbow taken
    const mw = 280;
    const mx = cx - mw / 2;
    const myy = 690;
    const fill = r.dash > 0 ? r.dash / RUN.dashTime : r.power / RUN.powerMax;
    ctx.save();
    ctx.beginPath(); ctx.roundRect(mx, myy - 12, mw, 18, 8); ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(mx, myy - 12, mw, 18);
    RAINBOW.forEach((c, i) => {
      ctx.fillStyle = c;
      ctx.fillRect(mx, myy - 12 + i * 3, mw * fill, 3);
    });
    ctx.restore();
    if (r.dash > 0) {
      text(ctx, 'RAINBOW DASH!', cx, 670, { size: 16, align: 'center', color: RAINBOW[Math.floor(t * 10) % 6], stroke: '#2a1840' });
    } else if (dashCall) {
      const how = app.slots[v].mode === 'keys' ? `PRESS ${keyName(KEYS[v].boost[0])}` : 'BOTH HANDS UP!';
      if (Math.floor(t * 4) % 2) text(ctx, `${how} = RAINBOW DASH`, cx, 670, { size: 11, align: 'center', color: '#fff27a', stroke: '#2a1840' });
    } else {
      text(ctx, 'RAINBOW DASH', cx, 670, { size: 8, align: 'center', color: 'rgba(255,255,255,0.85)', stroke: '#2a1840' });
    }
  }

  /**
   * What the steering slider shows for player v:
   *   pos   where the dot is (-1..1): your body tilt, also inside the dead zone
   *   steer how much the unicorn actually steers (-1..1)
   *   dead  half width of the grey "straight" zone (0..1 of the slider)
   */
  steerView(app, v, r) {
    const slot = app.slots[v];
    const o = slot.gest.out;
    if (slot.mode === 'body' && o.present && o.calibrated) {
      return { pos: o.lean / GESTURE.tiltFull, steer: o.steer, dead: GESTURE.tiltDead / GESTURE.tiltFull };
    }
    const s = r ? r.steerVis : 0;
    return { pos: s, steer: s, dead: 0 };
  }

  drawSteerSlider(cx, y, half, sv, color, target = 0, t = 0) {
    const ctx = this.ctx;
    const pos = Math.max(-1, Math.min(1, sv.pos));
    const steering = Math.abs(sv.steer) > 0.05;
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.beginPath(); ctx.roundRect(cx - half, y - 7, half * 2, 14, 7); ctx.fill();
    // training: the part of the slider the dot has to reach, blinking
    if (target) {
      const from = sv.dead + TUTORIAL.steerMin * (1 - sv.dead);
      ctx.fillStyle = Math.floor(t * 3) % 2 ? 'rgba(124,255,178,0.75)' : 'rgba(124,255,178,0.4)';
      const a = cx + target * from * half;
      const b = cx + target * half;
      ctx.beginPath(); ctx.roundRect(Math.min(a, b), y - 7, Math.abs(b - a), 14, 7); ctx.fill();
    }
    // the "straight" zone in the middle
    if (sv.dead > 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.fillRect(cx - sv.dead * half, y - 7, sv.dead * half * 2, 14);
    }
    // from the edge of the straight zone to the dot: how hard you steer
    if (steering) {
      const a = cx + Math.sign(pos) * sv.dead * half;
      const b = cx + pos * half;
      ctx.fillStyle = color;
      ctx.fillRect(Math.min(a, b), y - 5, Math.abs(b - a), 10);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillRect(cx - 1, y - 11, 2, 22);
    // arrows at both ends light up in the direction you steer
    for (const s of [-1, 1]) {
      const on = sv.steer * s > 0.05;
      const ax = cx + s * (half + 14);
      ctx.fillStyle = on ? '#fff27a' : 'rgba(255,255,255,0.35)';
      ctx.beginPath();
      ctx.moveTo(ax + s * 9, y); ctx.lineTo(ax - s * 4, y - 9); ctx.lineTo(ax - s * 4, y + 9);
      ctx.fill();
    }
    // the dot = you
    const dx = cx + pos * half;
    ctx.save();
    if (steering) { ctx.shadowColor = '#fff27a'; ctx.shadowBlur = 14; }
    ctx.fillStyle = steering ? '#fff27a' : '#ffffff';
    ctx.strokeStyle = '#2a1840';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(dx, y, 11, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  drawMinimap(race) {
    const ctx = this.ctx;
    const S = 120;
    const x0 = HALF_W - S / 2;
    const y0 = 10;
    ctx.fillStyle = 'rgba(42,24,64,0.7)';
    ctx.beginPath(); ctx.roundRect(x0, y0, S, S, 16); ctx.fill();
    const map = race.track.map;
    const P = (p) => [x0 + S / 2 + p.x * (S - 22), y0 + S / 2 + p.y * (S - 22)];
    ctx.lineJoin = 'round';
    for (const [lw, col] of [[7, '#ffffff'], [3, '#c9a8ff']]) {
      ctx.strokeStyle = col;
      ctx.lineWidth = lw;
      ctx.beginPath();
      for (let i = 0; i < map.length; i += 4) { const [x, y] = P(map[i]); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
      ctx.closePath();
      ctx.stroke();
    }
    const [sx, sy] = P(map[0]);
    ctx.fillStyle = '#2a1840';
    ctx.fillRect(sx - 4, sy - 4, 8, 8);
    const segs = race.track.segments.length;
    for (const r of [...race.runners].sort((a, b) => b.place - a.place)) {
      const idx = Math.floor(race.track.wrap(r.dist) / ROAD.segmentLength) % segs;
      const [x, y] = P(map[idx]);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = PLAYERS[r.index].color;
      ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
    }
  }

  drawResults(app) {
    const ctx = this.ctx;
    const race = app.race;
    const t = app.time;
    dim(ctx, Math.min(0.72, (race.stateTime - 1.2) * 1.5));
    text(ctx, 'RACE RESULTS', VIEW_W / 2, 110, { size: 34, align: 'center', color: '#ffffff', glow: '#ff5fa8', stroke: '#2a1840' });
    const floor = 520;
    const standings = race.standings;
    const spots = [{ x: 500, h: 150 }, { x: 780, h: 90 }];
    standings.forEach((r, k) => {
      const look = PLAYERS[r.index];
      const { x, h } = spots[k];
      // podium block
      ctx.fillStyle = k === 0 ? '#ffd23f' : '#cfd6ea';
      ctx.beginPath(); ctx.roundRect(x - 100, floor - h, 200, h, 10); ctx.fill();
      text(ctx, String(k + 1), x, floor - h + 60, { size: 40, align: 'center', color: '#2a1840' });
      // the unicorn on top, the winner prances
      ctx.save();
      ctx.translate(x - 10, floor - h + 10);
      ctx.scale(1.3, 1.3);
      drawUnicornSide(ctx, look, { t: t * (k === 0 ? 9 : 3), moving: true });
      ctx.restore();
      if (k === 0) {
        for (let i = 0; i < 5; i++) {
          const a = t * 2 + (i * Math.PI * 2) / 5;
          drawStar(ctx, x + Math.cos(a) * 110, floor - h - 120 + Math.sin(a) * 30, 9, RAINBOW[i]);
        }
      }
      const name = race.cpus[r.index] ? `${look.name} (CPU)` : `${look.label} ${look.name}`;
      text(ctx, name, x, floor + 34, { size: 14, align: 'center', color: look.color, stroke: '#2a1840' });
      text(ctx, r.finished ? clock(r.finishTime) : 'DID NOT FINISH', x, floor + 58, { size: 11, align: 'center', stroke: '#2a1840' });
      text(ctx, `${r.rainbows} RAINBOWS`, x, floor + 80, { size: 10, align: 'center', color: '#fff27a', stroke: '#2a1840' });
    });
    if (race.stateTime > 3 && Math.floor(t * 2) % 2) {
      text(ctx, 'RAISE BOTH HANDS OR PRESS ENTER FOR A REMATCH', VIEW_W / 2, 660, { size: 12, align: 'center', color: '#bfefff', stroke: '#2a1840' });
    }
    text(ctx, 'ESC = BACK TO THE MENU', VIEW_W / 2, 690, { size: 8, align: 'center', color: 'rgba(255,255,255,0.7)' });
  }

  // ---- training --------------------------------------------------------------------
  drawTutorial(app) {
    const ctx = this.ctx;
    const tut = app.tutorial;
    for (let v = 0; v < 2; v++) {
      ctx.save();
      ctx.translate(v * HALF_W, 0);
      ctx.beginPath();
      ctx.rect(0, 0, HALF_W, VIEW_H);
      ctx.clip();
      this.views[v].render(ctx, { track: tut.track, me: tut.players[v].runner, others: [], time: app.time, view: v, fx: app.fx });
      app.fx.draw(ctx, v);
      this.drawLesson(app, v);
      ctx.restore();
    }
    this.drawDivider();
    if (tut.allDone) {
      dim(ctx, Math.min(0.45, tut.doneTime));
      text(ctx, "LET'S RACE!", VIEW_W / 2, 360, { size: 44, align: 'center', color: '#fff27a', glow: '#ff5fa8', stroke: '#2a1840' });
    } else {
      text(ctx, 'ENTER = START THE RACE NOW', VIEW_W / 2, 604, { size: 7, align: 'center', color: 'rgba(255,255,255,0.75)', stroke: '#2a1840' });
    }
  }

  // one player's half of the training screen: the lesson card + console
  drawLesson(app, v) {
    const ctx = this.ctx;
    const tut = app.tutorial;
    const p = tut.players[v];
    const r = p.runner;
    const slot = app.slots[v];
    const g = slot.gest.out;
    const look = PLAYERS[v];
    const t = app.time;
    const cx = HALF_W / 2;
    const step = tut.stepOf(v);
    const keys = slot.mode === 'keys';

    // the card
    const x = cx - 290;
    const y = 16;
    const W = 580;
    const H = 196;
    ctx.fillStyle = 'rgba(30,14,52,0.84)';
    ctx.strokeStyle = p.done ? '#7cffb2' : look.color;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.roundRect(x, y, W, H, 18); ctx.fill(); ctx.stroke();
    text(ctx, `${look.label} ${look.name}`, x + 20, y + 30, { size: 12, color: look.color });
    text(ctx, 'TRAINING', x + W - 20, y + 30, { size: 10, align: 'right', color: '#bfefff' });

    if (!p.active) {
      text(ctx, keys ? 'KEYBOARD PLAYER' : 'CPU UNICORN', cx, y + 96, { size: 16, align: 'center', color: look.light });
      text(ctx, 'READY!', cx, y + 140, { size: 22, align: 'center', color: '#7cffb2', glow: '#4ddb6a' });
      return;
    }

    // the five steps as pills: done (green), now (player colour), later (grey)
    const labels = ['LEFT', 'RIGHT', 'RUN', 'JUMP', 'DASH'];
    const pw = 92;
    const px0 = cx - (STEPS.length * pw + (STEPS.length - 1) * 10) / 2;
    STEPS.forEach((_, k) => {
      const done = p.done || k < p.step || (k === p.step && p.progress >= 1);
      const now = !p.done && k === p.step;
      const bx = px0 + k * (pw + 10);
      ctx.fillStyle = done ? '#4ddb6a' : now ? look.color : 'rgba(255,255,255,0.15)';
      ctx.beginPath(); ctx.roundRect(bx, y + 44, pw, 22, 11); ctx.fill();
      text(ctx, done ? `${labels[k]} OK` : labels[k], bx + pw / 2, y + 60, { size: 7, align: 'center', color: done || now ? '#2a1840' : 'rgba(255,255,255,0.7)' });
    });

    const fig = (pose) => {
      ctx.save();
      ctx.translate(x + 74, y + 146);
      ctx.scale(1.5, 1.5);
      drawStickFigure(ctx, 0, 0, pose, t, '#ffffff');
      ctx.restore();
    };
    const tx = cx + 50;
    if (p.done) {
      fig('idle');
      text(ctx, 'READY!', tx, y + 112, { size: 26, align: 'center', color: '#7cffb2', glow: '#4ddb6a' });
      const other = tut.players[1 - v];
      const msg = tut.allDone ? "LET'S RACE!" : other.active ? `WAITING FOR ${PLAYERS[1 - v].label}...` : '';
      text(ctx, msg, tx, y + 146, { size: 10, align: 'center' });
      if (!tut.allDone) text(ctx, 'KEEP PRACTISING MEANWHILE!', tx, y + 172, { size: 8, align: 'center', color: '#bfefff' });
    } else {
      const k = KEYS[v];
      const lesson = {
        left: ['leanL', 'LEAN LEFT', keys ? `HOLD ${keyName(k.left[0])}` : 'BEND YOUR BODY LIKE A SURFER'],
        right: ['leanR', 'LEAN RIGHT', keys ? `HOLD ${keyName(k.right[0])}` : 'BEND YOUR BODY LIKE A SURFER'],
        run: ['run', 'RUN IN PLACE', keys ? `HOLD ${keyName(k.run[0])}` : 'KNEES UP, FAST!'],
        jump: ['jump', 'JUMP!', `${keys ? `PRESS ${keyName(k.jump[0])}` : 'HOP UP HIGH'}  ${Math.min(p.jumps, TUTORIAL.jumps)} / ${TUTORIAL.jumps}`],
        dash: ['hands', 'BOTH HANDS UP!', keys ? `PRESS ${keyName(k.boost[0])} = RAINBOW DASH` : 'FIRE THE RAINBOW DASH'],
      }[step];
      fig(lesson[0]);
      text(ctx, lesson[1], tx, y + 108, { size: 24, align: 'center', color: '#fff27a', glow: look.color });
      text(ctx, lesson[2], tx, y + 136, { size: 9, align: 'center' });
      // progress
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.beginPath(); ctx.roundRect(tx - 150, y + 156, 300, 16, 8); ctx.fill();
      ctx.fillStyle = p.progress >= 1 ? '#4ddb6a' : '#7cffb2';
      ctx.beginPath(); ctx.roundRect(tx - 150, y + 156, Math.max(1, 300 * Math.min(1, p.progress)), 16, 8); ctx.fill();
    }

    // big arrows on the road for the steering lessons
    if ((step === 'left' || step === 'right') && p.progress < 1) {
      const s = step === 'left' ? -1 : 1;
      for (let i = 0; i < 3; i++) {
        const a = 0.35 + 0.65 * ((Math.floor(t * 6) + i) % 3 === 0 ? 1 : 0.3);
        const ax = cx + s * (150 + i * 46);
        ctx.globalAlpha = a;
        ctx.fillStyle = '#fff27a';
        ctx.strokeStyle = '#2a1840';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(ax + s * 22, 330); ctx.lineTo(ax - s * 10, 300); ctx.lineTo(ax - s * 10, 360);
        ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // skip: arms crossed in front of you (body players)
    if (slot.mode === 'body' && !p.done) {
      const held = Math.min(1, g.crossHeld / GESTURE.crossHold);
      ctx.fillStyle = 'rgba(30,14,52,0.75)';
      ctx.beginPath(); ctx.roundRect(cx - 150, y + H + 10, 300, 34, 12); ctx.fill();
      if (held > 0) {
        ctx.fillStyle = 'rgba(255,95,168,0.8)';
        ctx.beginPath(); ctx.roundRect(cx - 150, y + H + 10, Math.max(12, 300 * held), 34, 12); ctx.fill();
      }
      ctx.save();
      ctx.translate(cx - 126, y + H + 36);
      ctx.scale(0.45, 0.45);
      drawStickFigure(ctx, 0, 0, 'cross', t, '#ffffff');
      ctx.restore();
      text(ctx, 'CROSS YOUR ARMS (X) TO SKIP', cx + 14, y + H + 32, { size: 8, align: 'center', color: '#ffffff' });
    }

    if (slot.mode === 'body' && !g.present) {
      text(ctx, 'STEP BACK INTO', cx, 330, { size: 18, align: 'center', color: '#ff9fd0', stroke: '#2a1840' });
      text(ctx, 'THE CAMERA VIEW', cx, 358, { size: 18, align: 'center', color: '#ff9fd0', stroke: '#2a1840' });
    }

    for (const b of app.fx.banners[v]) {
      const k = Math.min(1, b.t * 5);
      ctx.globalAlpha = Math.min(1, (b.life - b.t) * 3);
      text(ctx, b.text, cx, 300, { size: 14 + 26 * k, align: 'center', color: '#ffffff', glow: look.color, stroke: '#2a1840' });
      ctx.globalAlpha = 1;
    }

    this.drawSpeedBar(r, v);
    const target = p.progress >= 1 ? 0 : step === 'left' ? -1 : step === 'right' ? 1 : 0;
    this.drawConsole(app, v, r, { dashCall: step === 'dash' && r.dash <= 0, target });
  }

  // ---- lobby / title ---------------------------------------------------------------
  drawLobby(app) {
    const ctx = this.ctx;
    const t = app.time;
    const d = app.demo;
    this.lobbyView.render(ctx, { track: d.track, me: d.camera, others: d.unicorns, time: t, hideSelf: true });
    // soften the background a bit so the cards read well
    const fade = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    fade.addColorStop(0, 'rgba(42,24,64,0.35)');
    fade.addColorStop(0.5, 'rgba(42,24,64,0.05)');
    fade.addColorStop(1, 'rgba(42,24,64,0.55)');
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    // logo
    ctx.save();
    ctx.translate(VIEW_W / 2, 92 + Math.sin(t * 2) * 3);
    ctx.font = `60px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 14;
    ctx.strokeStyle = '#2a1840';
    ctx.strokeText(GAME_TITLE, 0, 0);
    ctx.shadowColor = '#ff5fa8';
    ctx.shadowBlur = 22;
    const lg = ctx.createLinearGradient(-330, 0, 330, 0);
    RAINBOW.forEach((c, i) => lg.addColorStop(((i + t * 0.6) % 6) / 6, c));
    ctx.fillStyle = lg;
    ctx.fillText(GAME_TITLE, 0, 0);
    ctx.restore();
    text(ctx, 'THE 2-PLAYER BODY-CONTROLLED RAINBOW RACE', VIEW_W / 2, 128, { size: 11, align: 'center', color: '#ffffff', stroke: '#2a1840' });

    for (let i = 0; i < 2; i++) this.drawPlayerCard(app, i);
    this.drawHowTo(t);

    // start status
    const y = 682;
    if (app.startIn !== null) {
      text(ctx, `${app.willTrain ? 'TRAINING' : 'STARTING'} IN ${Math.ceil(app.startIn)}...`, VIEW_W / 2, y, { size: 18, align: 'center', color: '#fff27a', glow: '#ff5fa8', stroke: '#2a1840' });
    } else {
      const msg = app.bodyReady ? 'RAISE BOTH HANDS TO JOIN  -  ENTER = START NOW (EMPTY SEAT = CPU)' : 'PRESS YOUR RUN KEY TO JOIN  -  ENTER = START NOW (EMPTY SEAT = CPU)';
      text(ctx, msg, VIEW_W / 2, y, { size: 10, align: 'center', color: Math.floor(t * 2) % 2 ? '#ffffff' : '#fff27a', stroke: '#2a1840' });
    }
    text(ctx, `(C) 2026 ${STUDIO.toUpperCase()}`, VIEW_W / 2, 708, { size: 7, align: 'center', color: 'rgba(255,255,255,0.75)' });
  }

  drawPlayerCard(app, i) {
    const ctx = this.ctx;
    const t = app.time;
    const look = PLAYERS[i];
    const slot = app.slots[i];
    const g = slot.gest.out;
    const W = 400;
    const H = 300;
    const x = i === 0 ? 36 : VIEW_W - 36 - W;
    const y = 158;
    const cx = x + W / 2;
    const ready = slot.ready;
    ctx.fillStyle = 'rgba(30,14,52,0.82)';
    ctx.strokeStyle = ready ? look.color : 'rgba(255,255,255,0.35)';
    ctx.lineWidth = ready ? 4 : 2;
    ctx.beginPath(); ctx.roundRect(x, y, W, H, 18); ctx.fill(); ctx.stroke();
    text(ctx, `PLAYER ${i + 1}`, x + 22, y + 36, { size: 16, color: look.color });
    text(ctx, look.name, x + 22, y + 58, { size: 10, color: look.light });
    ctx.save();
    ctx.translate(x + W - 90, y + 112);
    ctx.scale(0.85, 0.85);
    drawUnicornSide(ctx, look, { t: t * (ready ? 10 : 3), moving: true });
    ctx.restore();

    const bar = (yy, k, col) => {
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.beginPath(); ctx.roundRect(x + 30, yy, W - 60, 14, 7); ctx.fill();
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.roundRect(x + 30, yy, (W - 60) * Math.max(0.001, Math.min(1, k)), 14, 7); ctx.fill();
    };
    const keyHint = `KEYS: ${keyName(KEYS[i].run[0])} RUN, ${keyName(KEYS[i].left[0])}/${keyName(KEYS[i].right[0])} STEER, ${keyName(KEYS[i].jump[0])} JUMP, ${keyName(KEYS[i].boost[0])} DASH`;
    const side = i === 0 ? 'LEFT' : 'RIGHT';
    const fig = (pose) => drawStickFigure(ctx, x + 70, y + 148, pose, t, '#ffffff');

    if (slot.mode === 'keys') {
      text(ctx, 'READY!', cx, y + 160, { size: 22, align: 'center', color: '#7cffb2', glow: '#4ddb6a' });
      text(ctx, 'KEYBOARD PLAYER', cx, y + 196, { size: 10, align: 'center' });
      text(ctx, keyHint, cx, y + 270, { size: 7, align: 'center', color: 'rgba(255,255,255,0.75)' });
    } else if (slot.mode === 'body' && slot.gest.calibrating) {
      fig('idle');
      if (!g.present) {
        text(ctx, "I CAN'T SEE YOU", cx + 40, y + 140, { size: 12, align: 'center', color: '#ff9fd0' });
        text(ctx, `STAND IN THE ${side} HALF`, cx + 40, y + 164, { size: 9, align: 'center' });
      } else {
        text(ctx, 'CALIBRATING', cx + 40, y + 136, { size: 14, align: 'center', color: '#7cffb2' });
        text(ctx, 'ARMS DOWN, STAND STILL', cx + 40, y + 162, { size: 9, align: 'center' });
        bar(y + 200, slot.calib, '#7cffb2');
        text(ctx, 'STAND UP STRAIGHT = GO STRAIGHT', cx, y + 240, { size: 8, align: 'center', color: 'rgba(255,255,255,0.7)' });
      }
    } else if (slot.mode === 'body') {
      text(ctx, 'READY!', x + 22, y + 108, { size: 22, color: '#7cffb2', glow: '#4ddb6a' });
      text(ctx, 'TRY IT: LEAN, RUN, JUMP', x + 22, y + 134, { size: 8, color: 'rgba(255,255,255,0.8)' });
      // live test meters
      text(ctx, 'STEER (LEAN YOUR BODY)', x + 30, y + 166, { size: 8, color: '#bfefff' });
      this.drawSteerSlider(cx, y + 183, W / 2 - 50, this.steerView(app, i, null), look.color, 0, t);
      text(ctx, 'RUN', x + 30, y + 214, { size: 8, color: '#bfefff' });
      bar(y + 222, g.run, '#ff9f1c');
      const flash = slot.flash;
      if (flash.jump > 0) text(ctx, 'JUMP!', x + 90, y + 274, { size: 16, align: 'center', color: '#ffffff', glow: look.color });
      if (flash.boost > 0) text(ctx, 'DASH!', x + W - 90, y + 274, { size: 16, align: 'center', color: RAINBOW[Math.floor(t * 10) % 6], glow: '#ffffff' });
      if (!g.present) text(ctx, 'STEP BACK INTO VIEW', cx, y + 274, { size: 10, align: 'center', color: '#ff9fd0' });
    } else if (app.bodyReady) {
      fig('hands');
      if (g.present) {
        text(ctx, 'RAISE BOTH', cx + 40, y + 130, { size: 14, align: 'center', color: '#fff27a' });
        text(ctx, 'HANDS TO JOIN', cx + 40, y + 154, { size: 14, align: 'center', color: '#fff27a' });
        bar(y + 196, slot.joinHold, look.color);
      } else {
        text(ctx, 'STEP INTO THE', cx + 40, y + 130, { size: 11, align: 'center' });
        text(ctx, `${side} HALF OF THE`, cx + 40, y + 150, { size: 11, align: 'center' });
        text(ctx, 'CAMERA PICTURE', cx + 40, y + 170, { size: 11, align: 'center' });
      }
      text(ctx, `OR PRESS ${keyName(KEYS[i].run[0])} TO PLAY WITH KEYS`, cx, y + 254, { size: 8, align: 'center', color: 'rgba(255,255,255,0.7)' });
    } else {
      text(ctx, `PRESS ${keyName(KEYS[i].run[0])}`, cx, y + 150, { size: 18, align: 'center', color: '#fff27a' });
      text(ctx, 'TO JOIN', cx, y + 178, { size: 12, align: 'center' });
      text(ctx, app.poseMessage || '', cx, y + 226, { size: 7, align: 'center', color: '#ff9fd0' });
      text(ctx, keyHint, cx, y + 270, { size: 7, align: 'center', color: 'rgba(255,255,255,0.75)' });
    }
  }

  drawHowTo(t) {
    const ctx = this.ctx;
    const cards = [
      ['lean', 'LEAN LEFT / RIGHT', 'STEER'],
      ['run', 'RUN IN PLACE', 'GALLOP FASTER'],
      ['jump', 'JUMP', 'HOP OBSTACLES'],
      ['hands', 'BOTH HANDS UP', 'RAINBOW DASH'],
    ];
    // two cards under each player card, so the middle of the road stays
    // free for the two unicorns galloping in the background
    const w = 194;
    const gap = 12;
    const y = 472;
    const xs = [36, 36 + w + gap, VIEW_W - 36 - 2 * w - gap, VIEW_W - 36 - w];
    cards.forEach(([pose, a, b], i) => {
      const x = xs[i];
      const cx = x + w / 2;
      ctx.fillStyle = 'rgba(30,14,52,0.8)';
      ctx.strokeStyle = 'rgba(191,239,255,0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(x, y, w, 176, 14); ctx.fill(); ctx.stroke();
      drawStickFigure(ctx, cx, y + 76, pose, t + i * 0.7, '#ffffff');
      text(ctx, a, cx, y + 130, { size: 8, align: 'center', color: '#bfefff' });
      text(ctx, b, cx, y + 154, { size: 10, align: 'center', color: '#fff27a' });
      if (pose === 'hands') text(ctx, '(METER FULL)', cx, y + 170, { size: 6, align: 'center', color: 'rgba(255,255,255,0.6)' });
    });
  }
}

// ---- small helpers -------------------------------------------------------------
/** Seconds before a hurdle the jump line sits for player v (body / keys). */
function jumpLead(app, v) {
  return app.slots[v].mode === 'body' ? HINTS.jumpLeadBody : HINTS.jumpLeadKeys;
}

export function text(ctx, str, x, y, { size = 12, color = '#ffffff', align = 'left', glow = null, stroke = null } = {}) {
  ctx.save();
  ctx.font = `${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  if (stroke) {
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(3, size / 4);
    ctx.strokeStyle = stroke;
    ctx.strokeText(str, x, y);
  } else {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillText(str, x + Math.max(1, size / 12), y + Math.max(1, size / 12));
  }
  if (glow) {
    ctx.shadowColor = glow;
    ctx.shadowBlur = size * 0.6;
  }
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
  ctx.restore();
}

function dim(ctx, a) {
  ctx.fillStyle = `rgba(30,14,52,${a})`;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
}

function clock(s) {
  const m = Math.floor(s / 60);
  const sec = s - m * 60;
  return `${m}:${sec.toFixed(1).padStart(4, '0')}`;
}

export function keyName(code) {
  const names = {
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '<', ArrowRight: '>',
    ShiftRight: 'R-SHIFT', Slash: '/', Numpad0: 'NUM0',
  };
  return names[code] ?? code.replace('Key', '');
}

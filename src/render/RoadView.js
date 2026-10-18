// ---------------------------------------------------------------------------
// RoadView: draws the pseudo-3D world as seen from behind ONE runner.
// The split screen is simply two RoadViews, each drawing into its own half.
//
// Per frame:
//  1. background: sky + 3 pre-rendered parallax layers that slide sideways
//     when the road curves (clouds slow, mountains medium, hills fast);
//  2. projection pass, near -> far: every road slice in front of the camera
//     is projected to the screen
//         scale = cameraDepth / z,   screenX = cx + scale * x * k,
//         screenY = horizon - scale * y * k
//     Curves are faked by shifting each slice sideways by an accumulating
//     amount (dx += curve), hills come from the slices' heights;
//  3. drawing pass, far -> near (painter's algorithm): for each slice draw
//     grass, rainbow kerbs, road, lane marks, fog, then the sprites standing
//     on it, then any unicorn on it. Nearer road painted later naturally
//     hides things behind a hill crest.
//     The optional "jump line" (opts.jumpLine = a distance) is painted
//     across the road on the slice at that distance.
// ---------------------------------------------------------------------------
import { ROAD, CAMERA_DEPTH, PLAYER_Z, PLAYERS, RAINBOW, UNICORN_W, FONT } from '../config.js';
import { drawUnicornBack } from './sprites.js';

const SEG = ROAD.segmentLength;
const GRASS = ['#93e6ad', '#7fd99d'];
const ROAD_C = ['#f6eaff', '#ecdcff'];
const FOG = '#ffe6f5';
const LIFT = { ground: 110, air: 560 };   // world height of floating rainbows

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

// tiny seeded random for the background art
function rand(seed) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}

/** Sky picture + three horizontally tileable parallax layers. */
export function buildBackground(w, h, horizon, ratio = 1) {
  const R = ratio;
  const sky = canvas(w * R, h * R);
  let g = sky.getContext('2d');
  g.scale(R, R);
  const sg = g.createLinearGradient(0, 0, 0, horizon);
  sg.addColorStop(0, '#5fb8ff');
  sg.addColorStop(0.6, '#a9dcff');
  sg.addColorStop(1, FOG);
  g.fillStyle = sg;
  g.fillRect(0, 0, w, horizon + 1);
  g.fillStyle = GRASS[1];
  g.fillRect(0, horizon, w, h - horizon);
  // sun glow
  const sun = g.createRadialGradient(w * 0.72, horizon * 0.35, 4, w * 0.72, horizon * 0.35, horizon * 0.6);
  sun.addColorStop(0, 'rgba(255,255,230,0.95)');
  sun.addColorStop(0.15, 'rgba(255,250,200,0.6)');
  sun.addColorStop(1, 'rgba(255,240,200,0)');
  g.fillStyle = sun;
  g.fillRect(0, 0, w, horizon);

  const W = w * 2;   // layers are twice the view wide and wrap around
  const layer = (lh, paint) => {
    const c = canvas(W * R, lh * R);
    const lg = c.getContext('2d');
    lg.scale(R, R);
    paint(lg, W, lh);
    return { img: c, w: W, h: lh };
  };
  // periodic profile: sum of sines with whole numbers of waves across W
  const profile = (x, waves) => waves.reduce((s, [n, a, p]) => s + a * Math.sin((x / W) * Math.PI * 2 * n + p), 0);

  const clouds = layer(horizon * 0.8, (lg, LW, LH) => {
    const r = rand(5);
    // a faint giant rainbow in the sky
    RAINBOW.forEach((c, i) => {
      lg.strokeStyle = c;
      lg.globalAlpha = 0.28;
      lg.lineWidth = LH * 0.035;
      lg.beginPath();
      lg.arc(LW * 0.3, LH * 1.15, LH * (0.95 - i * 0.035), Math.PI, 0);
      lg.stroke();
    });
    lg.globalAlpha = 1;
    for (let i = 0; i < 14; i++) {
      const cx = r() * LW;
      const cy = LH * (0.15 + r() * 0.5);
      const s = LH * (0.05 + r() * 0.06);
      lg.fillStyle = 'rgba(255,255,255,0.92)';
      for (let k = 0; k < 5; k++) {
        for (const off of [0, LW, -LW]) {
          lg.beginPath();
          lg.ellipse(cx + off + (k - 2) * s * 1.1, cy - Math.sin((k / 4) * Math.PI) * s * 0.7, s, s * 0.75, 0, 0, Math.PI * 2);
          lg.fill();
        }
      }
    }
  });
  const mountains = layer(horizon * 0.42, (lg, LW, LH) => {
    const waves = [[3, 0.22, 0], [5, 0.12, 1.3], [11, 0.06, 0.4]];
    lg.beginPath();
    lg.moveTo(0, LH);
    for (let x = 0; x <= LW; x += 4) lg.lineTo(x, LH * (0.45 - profile(x, waves)));
    lg.lineTo(LW, LH);
    lg.closePath();
    const mg = lg.createLinearGradient(0, 0, 0, LH);
    mg.addColorStop(0, '#d7c4ff');
    mg.addColorStop(1, '#f3dcff');
    lg.fillStyle = mg;
    lg.fill();
    // snowy (sugar) caps
    lg.save();
    lg.clip();
    lg.fillStyle = 'rgba(255,255,255,0.75)';
    lg.beginPath();
    lg.moveTo(0, 0);
    for (let x = 0; x <= LW; x += 4) lg.lineTo(x, LH * (0.45 - profile(x, waves)) + LH * 0.09);
    lg.lineTo(LW, 0);
    lg.fill();
    lg.restore();
  });
  const hills = layer(horizon * 0.22, (lg, LW, LH) => {
    const waves = [[4, 0.2, 2], [9, 0.1, 0.5], [17, 0.05, 1]];
    lg.beginPath();
    lg.moveTo(0, LH);
    for (let x = 0; x <= LW; x += 4) lg.lineTo(x, LH * (0.5 - profile(x, waves)));
    lg.lineTo(LW, LH);
    lg.closePath();
    const hg = lg.createLinearGradient(0, 0, 0, LH);
    hg.addColorStop(0, '#b6f2c9');
    hg.addColorStop(1, GRASS[1]);
    lg.fillStyle = hg;
    lg.fill();
    const r = rand(9);
    for (let i = 0; i < 60; i++) {
      const x = r() * LW;
      const y = LH * (0.5 - profile(x, waves)) + 6 + r() * LH * 0.3;
      lg.fillStyle = ['#ff9fd0', '#c3a6ff', '#ffffff', '#6fd6a0'][i % 4];
      lg.beginPath();
      lg.arc(x, y, 3 + r() * 4, 0, Math.PI * 2);
      lg.fill();
    }
  });
  return {
    sky,
    layers: [
      { ...clouds, speed: 0.0012, drift: 4 },
      { ...mountains, speed: 0.0024, drift: 0 },
      { ...hills, speed: 0.0042, drift: 0 },
    ],
  };
}

export class RoadView {
  /** w x h: size of this view in logical pixels. */
  constructor(w, h, sprites) {
    this.w = w;
    this.h = h;
    this.k = w / 2;                 // world -> pixel factor at scale 1
    this.horizon = Math.round(h * ROAD.horizon);
    this.sprites = sprites;
    this.ratio = 0;
    this.bgOffset = 0;
    this.lastDist = null;
    this.stats = { segments: 0, sprites: 0 };
  }

  setRatio(ratio) {
    if (ratio === this.ratio) return;
    this.ratio = ratio;
    this.bg = buildBackground(this.w, this.h, this.horizon, ratio);
  }

  /**
   * opts: { track, me, others: [runner], time, view, fx, hideSelf, cpuTags, jumpLine }
   * Draws in logical coordinates with (0, 0) = top-left of this view.
   */
  render(ctx, opts) {
    const { track, me, time = 0 } = opts;
    const { w, h, k, horizon } = this;
    const segs = track.segments;
    const N = segs.length;

    // ---- 1. background, sliding with the curves ----------------------------
    const segNow = track.segmentAt(me.dist);
    if (this.lastDist !== null) {
      const d = me.dist - this.lastDist;
      if (Math.abs(d) < 5000) this.bgOffset += (segNow.curve * d) / SEG;
    }
    this.lastDist = me.dist;
    ctx.drawImage(this.bg.sky, 0, 0, w, h);
    for (const L of this.bg.layers) {
      const off = (((this.bgOffset * L.speed + time * L.drift * 0.002) % 1) + 1) % 1;
      const x = -off * L.w;
      const y = horizon - L.h + 1;
      ctx.drawImage(L.img, x, y, L.w, L.h);
      ctx.drawImage(L.img, x + L.w, y, L.w, L.h);
    }

    // ---- 2. projection pass (near -> far) -------------------------------------
    const camZ = track.wrap(me.dist - PLAYER_Z);
    const base = track.segmentAt(camZ);
    const basePct = (camZ % SEG) / SEG;
    const camX = me.x * ROAD.width;
    const camY = track.heightAt(me.dist) + ROAD.cameraHeight;
    const dd = ROAD.drawDistance;
    const visible = new Array(dd);
    let maxy = h;
    let x = 0;
    let dx = -(base.curve * basePct);
    for (let n = 0; n < dd; n++) {
      const seg = segs[(base.index + n) % N];
      const z = camZ - (seg.index < base.index ? track.length : 0);
      project(seg.p1, camX - x, camY, z, w, horizon, k);
      project(seg.p2, camX - x - dx, camY, z, w, horizon, k);
      x += dx;
      dx += seg.curve;
      const d = n / dd;
      seg.fog = 1 - Math.exp(-d * d * ROAD.fogDensity);
      visible[n] = !(seg.p1.camera.z <= CAMERA_DEPTH || seg.p2.screen.y >= seg.p1.screen.y || seg.p2.screen.y >= maxy);
      if (visible[n]) maxy = seg.p2.screen.y;
    }

    // which unicorns stand on which slice
    const runners = [...(opts.others ?? [])];
    if (!opts.hideSelf) runners.push(me);
    const onSeg = new Map();
    for (const r of runners) {
      const n = (Math.floor(track.wrap(r.dist) / SEG) - base.index + N) % N;
      if (n >= dd) continue;
      if (!onSeg.has(n)) onSeg.set(n, []);
      onSeg.get(n).push(r);
    }

    const lineN = opts.jumpLine == null ? -1 : (Math.floor(track.wrap(opts.jumpLine) / SEG) - base.index + N) % N;

    // ---- 3. drawing pass (far -> near) ------------------------------------------
    let segCount = 0;
    let spriteCount = 0;
    const hidden = me.collected;
    for (let n = dd - 1; n >= 0; n--) {
      const seg = segs[(base.index + n) % N];
      if (seg.p1.camera.z <= CAMERA_DEPTH) continue;
      if (visible[n]) {
        this.drawSegment(ctx, seg);
        // 3 slices thick, so it still reads when it is far away
        if (lineN >= 0 && Math.abs(n - lineN) <= 1) this.drawJumpLine(ctx, seg, time, n - lineN);
        segCount++;
      }
      const p = seg.p1.screen;
      const alpha = 1 - seg.fog * 0.85;
      for (const s of seg.sprites) {
        spriteCount += this.drawSprite(ctx, s.kind, p.x + p.scale * s.offset * ROAD.width * k, p.y, p.scale, alpha);
      }
      for (const it of seg.items) {
        const sx = p.x + p.scale * it.offset * ROAD.width * k;
        if (it.type === 'rainbow') {
          if (hidden?.has(it.id)) continue;
          const lift = (it.air ? LIFT.air : LIFT.ground) + Math.sin(time * 5 + it.id) * 25;
          spriteCount += this.drawSprite(ctx, 'rainbow', sx, p.y - lift * p.scale * k, p.scale, alpha);
        } else {
          spriteCount += this.drawSprite(ctx, it.kind, sx, p.y, p.scale, alpha);
        }
      }
      const rs = onSeg.get(n);
      if (rs) {
        // farther one first when two unicorns share a slice
        rs.sort((a, b) => track.wrap(b.dist) - track.wrap(a.dist));
        for (const r of rs) this.drawRunner(ctx, seg, r, r === me && !opts.hideSelf, opts);
      }
    }
    this.stats = { segments: segCount, sprites: spriteCount };
  }

  drawSegment(ctx, seg) {
    const w = this.w;
    const p1 = seg.p1.screen;
    const p2 = seg.p2.screen;
    const band = Math.floor(seg.index / ROAD.rumbleLength);
    const light = band % 2;
    // slices are painted far -> near, so each one overlaps the previous
    // (farther) slice by a pixel: no antialiasing seams between them
    const y1 = p1.y;
    const y2 = p2.y - 1;
    const top = y2;
    const hgt = y1 - y2;
    ctx.fillStyle = GRASS[light];
    ctx.fillRect(0, top, w, hgt);
    // rainbow kerbs
    const r1 = p1.w * 0.13;
    const r2 = p2.w * 0.13;
    ctx.fillStyle = RAINBOW[band % 6];
    poly(ctx, p1.x - p1.w - r1, y1, p1.x - p1.w, y1, p2.x - p2.w, y2, p2.x - p2.w - r2, y2);
    poly(ctx, p1.x + p1.w + r1, y1, p1.x + p1.w, y1, p2.x + p2.w, y2, p2.x + p2.w + r2, y2);
    // road
    ctx.fillStyle = ROAD_C[light];
    poly(ctx, p1.x - p1.w, y1, p1.x + p1.w, y1, p2.x + p2.w, y2, p2.x - p2.w, y2);
    if (seg.checker) {
      // checkered start / finish line
      const cells = 12;
      for (let c = 0; c < cells; c++) {
        if ((c + seg.index) % 2) continue;
        const a = c / cells;
        const b = (c + 1) / cells;
        ctx.fillStyle = '#2a1840';
        poly(ctx,
          p1.x - p1.w + 2 * p1.w * a, p1.y, p1.x - p1.w + 2 * p1.w * b, p1.y,
          p2.x - p2.w + 2 * p2.w * b, p2.y, p2.x - p2.w + 2 * p2.w * a, p2.y);
      }
    } else if (light) {
      // dashed lane marks
      const l1 = p1.w / 28;
      const l2 = p2.w / 28;
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      for (let lane = 1; lane < ROAD.lanes; lane++) {
        const f = lane / ROAD.lanes;
        const x1 = p1.x - p1.w + 2 * p1.w * f;
        const x2 = p2.x - p2.w + 2 * p2.w * f;
        poly(ctx, x1 - l1, p1.y, x1 + l1, p1.y, x2 + l2, p2.y, x2 - l2, p2.y);
      }
    }
    if (seg.fog > 0.01) {
      ctx.globalAlpha = seg.fog;
      ctx.fillStyle = FOG;
      ctx.fillRect(0, top, w, hgt);
      ctx.globalAlpha = 1;
    }
  }

  // a glowing yellow / pink band across the road: "jump when you get here"
  // part = -1, 0, 1: the near, middle and far slice of the band
  drawJumpLine(ctx, seg, time, part) {
    const p1 = seg.p1.screen;
    const p2 = seg.p2.screen;
    const cells = 10;
    const pulse = 0.75 + 0.25 * Math.sin(time * 12);
    ctx.globalAlpha = pulse;
    for (let c = 0; c < cells; c++) {
      const a = c / cells;
      const b = (c + 1) / cells;
      ctx.fillStyle = (c + part) % 2 ? '#ff5fa8' : '#fff27a';
      poly(ctx,
        p1.x - p1.w + 2 * p1.w * a, p1.y, p1.x - p1.w + 2 * p1.w * b, p1.y,
        p2.x - p2.w + 2 * p2.w * b, p2.y - 1, p2.x - p2.w + 2 * p2.w * a, p2.y - 1);
    }
    ctx.globalAlpha = 1;
    if (part === 0) return;
    // white edges (near edge of the near slice, far edge of the far one)
    ctx.fillStyle = '#ffffff';
    const t1 = Math.max(1, p1.w * 0.01);
    const t2 = Math.max(1, p2.w * 0.01);
    if (part < 0) poly(ctx, p1.x - p1.w, p1.y, p1.x + p1.w, p1.y, p1.x + p1.w, p1.y - t1, p1.x - p1.w, p1.y - t1);
    else poly(ctx, p2.x - p2.w, p2.y, p2.x + p2.w, p2.y, p2.x + p2.w, p2.y - t2, p2.x - p2.w, p2.y - t2);
  }

  drawSprite(ctx, name, sx, sy, scale, alpha) {
    const img = this.sprites.get(name);
    if (!img) return 0;
    const dw = img.ww * scale * this.k;
    const dh = img.wh * scale * this.k;
    const x = sx - dw / 2;
    if (dw < 1 || x > this.w || x + dw < 0 || sy - dh > this.h) return 0;
    ctx.globalAlpha = alpha;
    ctx.drawImage(img.canvas, x, sy - dh, dw, dh);
    ctx.globalAlpha = 1;
    return 1;
  }

  drawRunner(ctx, seg, r, self, opts) {
    const { track, time = 0 } = opts;
    const k = this.k;
    const pct = (track.wrap(r.dist) % SEG) / SEG;
    const a = seg.p1.screen;
    const b = seg.p2.screen;
    const scale = a.scale + (b.scale - a.scale) * pct;
    const groundY = a.y + (b.y - a.y) * pct;
    const sx = a.x + (b.x - a.x) * pct + scale * r.x * ROAD.width * k;
    const sy = groundY - r.jumpH * scale * k;
    const dw = UNICORN_W * scale * k;
    const s = dw / 100;
    if (dw < 2 || sx + dw < 0 || sx - dw > this.w) return;
    const look = PLAYERS[r.index];

    // shadow stays on the ground and shrinks while flying
    const shrink = 1 / (1 + r.jumpH / 500);
    ctx.fillStyle = 'rgba(60,30,90,0.25)';
    ctx.beginPath();
    ctx.ellipse(sx, groundY, dw * 0.36 * shrink, dw * 0.07 * shrink, 0, 0, Math.PI * 2);
    ctx.fill();

    // rainbow dash: a rainbow trail streaming back towards the camera
    if (r.dash > 0 && self) {
      const bandW = dw * 0.09;
      for (let i = 0; i < 6; i++) {
        const o = (i - 2.5) * bandW;
        ctx.fillStyle = RAINBOW[i];
        ctx.globalAlpha = 0.85;
        poly(ctx, sx + o - bandW / 2, sy - dw * 0.45, sx + o + bandW / 2, sy - dw * 0.45,
          sx + o * 3 + bandW * 1.5, this.h, sx + o * 3 - bandW * 1.5, this.h);
      }
      ctx.globalAlpha = 1;
    }

    ctx.save();
    ctx.translate(sx, sy);
    ctx.scale(s, s);
    drawUnicornBack(ctx, look, {
      t: r.anim, steer: r.steerVis, air: r.jumpH > 0, stumble: r.stumble > 0 ? r.stumble : 0,
      dash: r.dash > 0, time,
    });
    ctx.restore();

    if (self) {
      opts.fx && (opts.fx.anchor[opts.view] = { x: sx, y: sy, w: dw });
    } else {
      // name tag above the other unicorn
      const ty = sy - dw * 1.75;
      const size = Math.max(9, Math.min(16, dw * 0.12));
      ctx.font = `${size}px ${FONT}`;
      ctx.textAlign = 'center';
      const label = opts.cpuTags?.[r.index] ? 'CPU' : look.label;
      const tw = ctx.measureText(label).width + size;
      ctx.fillStyle = look.color;
      ctx.beginPath();
      ctx.roundRect(sx - tw / 2, ty - size * 1.4, tw, size * 1.8, size * 0.5);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(sx - size * 0.4, ty + size * 0.4); ctx.lineTo(sx + size * 0.4, ty + size * 0.4); ctx.lineTo(sx, ty + size);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillText(label, sx, ty);
    }
  }
}

function project(p, camX, camY, camZ, w, horizon, k) {
  const c = p.camera;
  const s = p.screen;
  c.x = (p.x || 0) - camX;
  c.y = p.y - camY;
  c.z = p.z - camZ;
  s.scale = CAMERA_DEPTH / c.z;
  s.x = w / 2 + s.scale * c.x * k;
  s.y = horizon - s.scale * c.y * k;
  s.w = s.scale * ROAD.width * k;
}

function poly(ctx, x1, y1, x2, y2, x3, y3, x4, y4) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.lineTo(x3, y3);
  ctx.lineTo(x4, y4);
  ctx.closePath();
  ctx.fill();
}

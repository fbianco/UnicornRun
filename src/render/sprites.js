// ---------------------------------------------------------------------------
// Sprites, drawn with vector paths and gradients instead of image files.
//
// Two kinds:
//  - unicorns are drawn live every frame (only a few on screen, and they
//    animate: gallop, lean, jump, tumble);
//  - scenery / pickups / obstacles are "painters": drawn ONCE into an
//    offscreen canvas by SpriteCache, then copied and scaled with drawImage,
//    which is what makes a hundred sprites per view cheap.
// Unicorn functions draw around (0, 0) = the hooves, in a ~100 unit wide box.
// ---------------------------------------------------------------------------
import { RAINBOW, FONT } from '../config.js';

const TAU = Math.PI * 2;

function ell(ctx, x, y, rx, ry, rot = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, TAU);
}

function vgrad(ctx, y0, y1, stops) {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c));
  return g;
}

function rgrad(ctx, x, y, r0, r1, stops) {
  const g = ctx.createRadialGradient(x, y, r0, x, y, r1);
  stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c));
  return g;
}

export function drawStar(ctx, x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU - Math.PI / 2;
    const rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

function horn(ctx, x0, y0, x1, y1, w) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, '#ffcf4a');
  g.addColorStop(1, '#fff6c2');
  ctx.fillStyle = g;
  const nx = -(y1 - y0);
  const ny = x1 - x0;
  const l = Math.hypot(nx, ny) || 1;
  ctx.beginPath();
  ctx.moveTo(x0 + (nx / l) * w, y0 + (ny / l) * w);
  ctx.lineTo(x1, y1);
  ctx.lineTo(x0 - (nx / l) * w, y0 - (ny / l) * w);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(190,120,20,0.7)';
  ctx.lineWidth = w * 0.25;
  for (let k = 1; k <= 3; k++) {
    const p = k / 4.2;
    const cx = x0 + (x1 - x0) * p;
    const cy = y0 + (y1 - y0) * p;
    const ww = w * (1 - p);
    ctx.beginPath();
    ctx.moveTo(cx + (nx / l) * ww, cy + (ny / l) * ww + ww * 0.4);
    ctx.lineTo(cx - (nx / l) * ww, cy - (ny / l) * ww - ww * 0.4);
    ctx.stroke();
  }
}

// rainbow strands (mane / tail): `n` parallel bezier strokes
function strands(ctx, pts, width, spread, dx = 1, dy = 0) {
  ctx.lineCap = 'round';
  ctx.lineWidth = width;
  RAINBOW.forEach((c, i) => {
    const o = (i - 2.5) * spread;
    ctx.strokeStyle = c;
    ctx.beginPath();
    ctx.moveTo(pts[0] + o * dx, pts[1] + o * dy);
    ctx.bezierCurveTo(pts[2] + o * dx, pts[3] + o * dy, pts[4] + o * dx * 1.4, pts[5] + o * dy, pts[6] + o * dx * 1.8, pts[7] + o * dy);
    ctx.stroke();
  });
}

// ---- unicorn seen from behind (what you see in a chase-camera racer) -------
// o: { t: gallop phase, steer: -1..1, air, stumble: 0..1, dash, look }
export function drawUnicornBack(ctx, look, o) {
  const ph = o.t ?? 0;
  const steer = o.steer ?? 0;
  const moving = o.moving ?? true;
  const g1 = moving ? Math.sin(ph) : 0;
  const g2 = moving ? Math.sin(ph + 2.2) : 0;
  const bob = o.air ? 0 : Math.abs(Math.sin(ph)) * 3.5;
  ctx.save();
  ctx.rotate(steer * 0.1);
  ctx.translate(0, -bob);
  if (o.stumble > 0) {
    ctx.translate(0, -60);
    ctx.rotate(Math.sin(o.stumble * TAU * 1.5) * 0.6);
    ctx.translate(0, 60);
  }
  if (o.dash) {
    ctx.shadowColor = RAINBOW[Math.floor((o.time ?? 0) * 12) % 6];
    ctx.shadowBlur = 30;
  }
  const hx = steer * 11;
  const sway = Math.sin(ph * 0.5) * 2;
  const maneSide = steer < -0.2 ? -1 : 1;   // the mane flies to the outside of a turn

  // neck + head (farther away, drawn first)
  ctx.fillStyle = vgrad(ctx, -118, -76, [look.body, look.shade]);
  ctx.beginPath();
  ctx.moveTo(-17, -78);
  ctx.quadraticCurveTo(hx * 0.5 - 15, -100, hx - 12, -116);
  ctx.lineTo(hx + 12, -116);
  ctx.quadraticCurveTo(hx * 0.5 + 15, -100, 17, -78);
  ctx.closePath();
  ctx.fill();
  // horn peeking over the head
  horn(ctx, hx, -130, hx + steer * 6, -164, 5);
  // ears
  for (const s of [-1, 1]) {
    ctx.fillStyle = look.body;
    ctx.beginPath();
    ctx.moveTo(hx + s * 4, -128);
    ctx.lineTo(hx + s * 14, -146);
    ctx.lineTo(hx + s * 16, -124);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = look.light;
    ctx.beginPath();
    ctx.moveTo(hx + s * 8, -128);
    ctx.lineTo(hx + s * 13.5, -140);
    ctx.lineTo(hx + s * 14, -126);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = rgrad(ctx, hx - 4, -126, 2, 18, [look.body, look.shade]);
  ell(ctx, hx, -120, 16, 14);
  ctx.fill();
  // mane: falls down one side of the neck
  const m = maneSide;
  strands(ctx, [hx + m * 4, -134, hx + m * (16 + sway), -124, m * (19 + sway), -104, m * (22 + sway * 2), -84], 3, 1.5);

  // front legs (seen between the hind legs)
  ctx.fillStyle = look.shade;
  for (const [s, g] of [[-1, g2], [1, -g2]]) {
    const lift = Math.max(0, g) * 12;
    ctx.beginPath();
    ctx.roundRect(s * 9 - 4, -40, 8, 40 - lift, 3);
    ctx.fill();
    ctx.fillStyle = '#b48cff';
    ctx.beginPath();
    ctx.roundRect(s * 9 - 4.5, -6 - lift, 9, 6, 2);
    ctx.fill();
    ctx.fillStyle = look.shade;
  }

  // body / rump
  ctx.fillStyle = rgrad(ctx, -8, -70, 4, 44, [look.body, look.body, look.shade]);
  ell(ctx, 0, -58, 33, 30);
  ctx.fill();
  // hind legs (closest to us)
  for (const [s, g] of [[-1, g1], [1, -g1]]) {
    const lift = Math.max(0, g) * 15;
    ctx.fillStyle = vgrad(ctx, -50, 0, [look.body, look.shade]);
    ctx.beginPath();
    ctx.moveTo(s * 30, -58);
    ctx.quadraticCurveTo(s * 30, -30, s * 23, -18 - lift * 0.6);
    ctx.lineTo(s * 22, -lift);
    ctx.lineTo(s * 11, -lift);
    ctx.lineTo(s * 10, -40);
    ctx.closePath();
    ctx.fill();
    // fluffy cuff in the player's colour: tells the unicorns apart from behind
    ctx.fillStyle = look.saddle;
    ctx.beginPath();
    ctx.roundRect(s * 16.5 - 7.5, -14 - lift, 15, 8, 4);
    ctx.fill();
    // hoof: shows its golden sole when kicked up
    ctx.fillStyle = '#9b6bff';
    ctx.beginPath();
    ctx.roundRect(s * 16.5 - 6.5, -7 - lift, 13, 7, 2);
    ctx.fill();
    if (lift > 4) {
      ctx.fillStyle = '#ffd86b';
      ell(ctx, s * 16.5, -1 - lift, 5, 2.2);
      ctx.fill();
    }
  }

  // tail: rainbow, swishing with the gallop
  const tw = Math.sin(ph) * 7 + steer * -9;
  strands(ctx, [0, -80, tw * 0.6, -74, tw * 1.3, -56, tw * 1.7, -36], 3.4, 1.3);
  // bow in the player's colour
  ctx.fillStyle = look.saddle;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(0, -82);
    ctx.lineTo(s * 8, -87);
    ctx.lineTo(s * 8, -77);
    ctx.closePath();
    ctx.fill();
  }
  ell(ctx, 0, -82, 3, 3);
  ctx.fill();
  ctx.shadowBlur = 0;

  if (o.stumble > 0) {
    for (let k = 0; k < 4; k++) {
      const a = (o.time ?? 0) * 6 + (k * TAU) / 4;
      drawStar(ctx, Math.cos(a) * 26, -150 + Math.sin(a) * 7, 6, k % 2 ? '#fff27a' : '#ffffff');
    }
  }
  ctx.restore();
}

// ---- unicorn seen from the side (menus, results) --------------------------
export function drawUnicornSide(ctx, look, o = {}) {
  const ph = o.t ?? 0;
  const moving = o.moving ?? true;
  const bob = moving ? Math.abs(Math.sin(ph)) * 4 : 0;
  ctx.save();
  ctx.translate(0, -bob);
  const leg = (x, y, a1, a2, col) => {
    const k1x = x + Math.sin(a1) * 18;
    const k1y = y + Math.cos(a1) * 18;
    const fx = k1x + Math.sin(a1 + a2) * 18;
    const fy = k1y + Math.cos(a1 + a2) * 18;
    ctx.strokeStyle = col;
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(k1x, k1y); ctx.lineTo(fx, fy); ctx.stroke();
    ctx.fillStyle = '#9b6bff';
    ell(ctx, fx, fy + 1, 5, 3.5);
    ctx.fill();
  };
  const s = moving ? Math.sin(ph) : 0;
  const c = moving ? Math.cos(ph) : 0;
  // far legs
  leg(28, -44, s * 0.7 + 0.1, -Math.max(0, -c) * 1.2, look.shade);
  leg(-26, -44, -s * 0.6, Math.max(0, c) * 0.9, look.shade);
  // tail
  strands(ctx, [-38, -60, -60, -66 + s * 5, -70, -40, -78, -28 + s * 6], 4, 1.8, 0, 1);
  // body
  ctx.fillStyle = vgrad(ctx, -80, -36, [look.body, look.body, look.shade]);
  ell(ctx, 0, -58, 42, 21);
  ctx.fill();
  // neck + head
  ctx.beginPath();
  ctx.moveTo(22, -72);
  ctx.quadraticCurveTo(34, -100, 46, -106);
  ctx.lineTo(58, -96);
  ctx.quadraticCurveTo(48, -78, 40, -50);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = look.body;
  ell(ctx, 58, -100, 17, 11, 0.45);
  ctx.fill();
  ctx.fillStyle = look.light;
  ell(ctx, 70, -93, 7, 6, 0.45);
  ctx.fill();
  // ear, horn, eye
  ctx.fillStyle = look.body;
  ctx.beginPath(); ctx.moveTo(46, -108); ctx.lineTo(48, -124); ctx.lineTo(55, -110); ctx.closePath(); ctx.fill();
  horn(ctx, 58, -110, 72, -140, 4.5);
  ctx.fillStyle = '#2a1840';
  ell(ctx, 60, -103, 2.6, 3.2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ell(ctx, 61, -104.5, 1, 1);
  ctx.fill();
  ctx.fillStyle = look.saddle;
  ell(ctx, 66, -97, 2.5, 1.5);
  ctx.fill();
  // mane
  strands(ctx, [50, -116, 38, -108, 30, -92 + s * 3, 18, -74 + s * 4], 3.5, 1.8, -0.6, 0.8);
  // saddle cloth
  ctx.fillStyle = look.saddle;
  ctx.beginPath();
  ctx.roundRect(-14, -80, 26, 18, 5);
  ctx.fill();
  // near legs
  leg(30, -44, -s * 0.7 + 0.1, -Math.max(0, c) * 1.2, look.body);
  leg(-24, -44, s * 0.6, Math.max(0, -c) * 0.9, look.body);
  ctx.restore();
}

// ---- stick figure for the "how to play" cards --------------------------------
// pose: idle | lean | leanL | leanR | run | jump | hands | cross
export function drawStickFigure(ctx, cx, cy, pose, t, color = '#ffffff') {
  let dx = 0;
  let dy = 0;
  let tilt = 0;
  let arms = 'down';
  let kneeL = 0;
  let kneeR = 0;
  if (pose === 'lean') tilt = Math.sin(t * 2) * 0.3;
  // leanL / leanR: bend the upper body to one side and back, like a surfer
  if (pose === 'leanL' || pose === 'leanR') tilt = (pose === 'leanL' ? -1 : 1) * (0.12 + 0.26 * Math.max(0, Math.sin(t * 2.4)));
  if (pose === 'hands') arms = Math.sin(t * 3) > -0.4 ? 'up' : 'down';
  if (pose === 'cross') arms = 'cross';
  if (pose === 'run') {
    kneeL = Math.max(0, Math.sin(t * 9));
    kneeR = Math.max(0, -Math.sin(t * 9));
    dy = -Math.abs(Math.sin(t * 9)) * 4;
    arms = 'pump';
  }
  if (pose === 'jump') {
    const j = Math.max(0, Math.sin(t * 4));
    dy = -j * 18;
    arms = j > 0.3 ? 'up' : 'down';
  }
  const hip = cy + dy;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // legs
  for (const [s, k] of [[-1, kneeL], [1, kneeR]]) {
    const footY = pose === 'jump' ? hip + 26 : cy + 26 - k * 10;
    ctx.beginPath();
    ctx.moveTo(cx + dx, hip);
    ctx.lineTo(cx + dx + s * 5, hip + 13 - k * 9);
    ctx.lineTo(cx + dx + s * 6, footY);
    ctx.stroke();
  }
  // body (tilts for "lean")
  ctx.translate(cx + dx, hip);
  ctx.rotate(tilt);
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -24); ctx.stroke();
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(0, -20);
    if (arms === 'up') ctx.lineTo(s * 9, -46);
    else if (arms === 'cross') {
      ctx.lineTo(s * 9, -10);
      ctx.lineTo(-s * 9, -24);
    }
    else if (arms === 'pump') {
      const a = Math.sin(t * 9) * s;
      ctx.lineTo(s * 10, -12 + a * 8);
      ctx.lineTo(s * 8 + a * 4, -22 + a * 8);
    } else ctx.lineTo(s * 11, -4);
    ctx.stroke();
  }
  ctx.beginPath(); ctx.arc(0, -32, 6.5, 0, TAU); ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(cx - 34, cy + 28); ctx.lineTo(cx + 34, cy + 28); ctx.stroke();
}

// ---- baked sprite painters ---------------------------------------------------
// Each: bake size in px (w, h) + size in the world (ww, wh). The painter draws
// into a w x h canvas; the anchor is the bottom centre.
function fluffy(g, cx, cy, r, c1, c2) {
  g.fillStyle = rgrad(g, cx - r * 0.3, cy - r * 0.4, r * 0.1, r * 1.1, [c1, c2]);
  ell(g, cx, cy, r, r);
  g.fill();
}

function tree(colors) {
  return (g, w, h) => {
    g.fillStyle = vgrad(g, h * 0.5, h, ['#c98a6b', '#8f5a49']);
    g.beginPath();
    g.moveTo(w * 0.44, h); g.lineTo(w * 0.47, h * 0.45); g.lineTo(w * 0.53, h * 0.45); g.lineTo(w * 0.56, h);
    g.fill();
    const [a, b] = colors;
    const blobs = [[0.5, 0.3, 0.3], [0.3, 0.42, 0.22], [0.7, 0.42, 0.22], [0.38, 0.22, 0.2], [0.62, 0.22, 0.2], [0.5, 0.48, 0.2]];
    for (const [x, y, r] of blobs) fluffy(g, w * x, h * y, w * r, a, b);
    g.fillStyle = 'rgba(255,255,255,0.5)';
    for (const [x, y] of [[0.42, 0.18], [0.3, 0.36], [0.6, 0.3]]) { ell(g, w * x, h * y, w * 0.035, w * 0.025); g.fill(); }
  };
}

const SIGN_BOARD = (g, w, h, fill, draw) => {
  g.fillStyle = '#8f5a49';
  g.fillRect(w * 0.45, h * 0.4, w * 0.1, h * 0.6);
  g.fillStyle = fill;
  g.strokeStyle = '#ffffff';
  g.lineWidth = w * 0.04;
  g.beginPath(); g.roundRect(w * 0.06, h * 0.06, w * 0.88, h * 0.46, w * 0.1); g.fill(); g.stroke();
  draw();
};

export const PAINTERS = {
  tree: { w: 180, h: 240, ww: 900, wh: 1200, draw: tree(['#ffd1ea', '#ff7fbf']) },
  tree2: { w: 180, h: 240, ww: 800, wh: 1100, draw: tree(['#d8fff0', '#56d6a6']) },
  tree3: { w: 180, h: 240, ww: 950, wh: 1250, draw: tree(['#efe1ff', '#a77bff']) },
  lollipop: {
    w: 100, h: 250, ww: 380, wh: 950,
    draw(g, w, h) {
      g.fillStyle = '#ffffff';
      g.fillRect(w * 0.46, h * 0.35, w * 0.08, h * 0.65);
      const cx = w / 2; const cy = h * 0.22; const r = w * 0.46;
      g.fillStyle = '#ffffff';
      ell(g, cx, cy, r, r); g.fill();
      g.lineWidth = w * 0.09;
      g.lineCap = 'round';
      RAINBOW.forEach((c, i) => {
        g.strokeStyle = c;
        g.beginPath();
        for (let a = 0; a < 1; a += 0.02) {
          const ang = a * TAU * 2.2 + (i * TAU) / 6;
          const rr = r * 0.9 * a;
          g.lineTo(cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr);
        }
        g.stroke();
      });
    },
  },
  mushroom: {
    w: 160, h: 160, ww: 620, wh: 620,
    draw(g, w, h) {
      g.fillStyle = vgrad(g, h * 0.5, h, ['#fff7ee', '#f0d9c8']);
      g.beginPath(); g.roundRect(w * 0.38, h * 0.45, w * 0.24, h * 0.55, w * 0.06); g.fill();
      g.fillStyle = vgrad(g, 0, h * 0.55, ['#ff6b8b', '#d93a6a']);
      g.beginPath(); g.ellipse(w / 2, h * 0.5, w * 0.48, h * 0.42, 0, Math.PI, 0); g.closePath(); g.fill();
      g.fillStyle = '#ffffff';
      for (const [x, y, r] of [[0.5, 0.2, 0.08], [0.27, 0.36, 0.07], [0.73, 0.36, 0.07], [0.38, 0.13, 0.04], [0.64, 0.14, 0.05]]) { ell(g, w * x, h * y, w * r, w * r); g.fill(); }
    },
  },
  flowers: {
    w: 160, h: 80, ww: 520, wh: 260,
    draw(g, w, h) {
      g.fillStyle = '#4fc77d';
      g.beginPath(); g.ellipse(w / 2, h, w * 0.48, h * 0.45, 0, Math.PI, 0); g.fill();
      const cols = ['#ff7fbf', '#ffe14d', '#a77bff', '#ffffff', '#3fa9ff'];
      for (let i = 0; i < 9; i++) {
        const x = w * (0.12 + (i / 8) * 0.76);
        const y = h * (0.35 + ((i * 37) % 5) * 0.08);
        g.fillStyle = cols[i % cols.length];
        for (let p = 0; p < 5; p++) { const a = (p / 5) * TAU; ell(g, x + Math.cos(a) * 6, y + Math.sin(a) * 6, 5, 5); g.fill(); }
        g.fillStyle = '#ffd23f';
        ell(g, x, y, 3.5, 3.5); g.fill();
      }
    },
  },
  candy: {
    w: 100, h: 200, ww: 300, wh: 700,
    draw(g, w, h) {
      g.save();
      g.lineCap = 'round';
      g.lineWidth = w * 0.22;
      const path = () => { g.beginPath(); g.moveTo(w * 0.62, h * 0.97); g.lineTo(w * 0.62, h * 0.3); g.arc(w * 0.42, h * 0.3, w * 0.2, 0, Math.PI, true); };
      g.strokeStyle = '#ffffff'; path(); g.stroke();
      g.setLineDash([w * 0.14, w * 0.14]);
      g.strokeStyle = '#ff4d6d'; path(); g.stroke();
      g.restore();
    },
  },
  castle: {
    w: 256, h: 256, ww: 2800, wh: 2800,
    draw(g, w, h) {
      const wall = vgrad(g, h * 0.3, h, ['#fff0fb', '#e6c9ff']);
      const tower = (x, tw, top) => {
        g.fillStyle = wall;
        g.fillRect(x - tw / 2, top, tw, h - top);
        g.fillStyle = vgrad(g, top - tw * 1.1, top, ['#ff9fd0', '#ff5fa8']);
        g.beginPath(); g.moveTo(x - tw * 0.62, top); g.lineTo(x, top - tw * 1.3); g.lineTo(x + tw * 0.62, top); g.fill();
        g.fillStyle = '#ffe14d';
        g.beginPath(); g.moveTo(x, top - tw * 1.3); g.lineTo(x, top - tw * 1.7); g.lineTo(x + tw * 0.4, top - tw * 1.55); g.lineTo(x, top - tw * 1.45); g.fill();
        g.fillStyle = '#7b5cd6';
        g.beginPath(); g.roundRect(x - tw * 0.15, top + tw * 0.4, tw * 0.3, tw * 0.45, tw * 0.15); g.fill();
      };
      g.fillStyle = wall;
      g.fillRect(w * 0.15, h * 0.62, w * 0.7, h * 0.38);
      tower(w * 0.2, w * 0.16, h * 0.45);
      tower(w * 0.8, w * 0.16, h * 0.45);
      tower(w * 0.5, w * 0.22, h * 0.3);
      tower(w * 0.35, w * 0.12, h * 0.55);
      tower(w * 0.65, w * 0.12, h * 0.55);
      g.fillStyle = '#7b5cd6';
      g.beginPath(); g.ellipse(w / 2, h, w * 0.08, h * 0.14, 0, Math.PI, 0); g.fill();
    },
  },
  cloudbush: {
    w: 220, h: 120, ww: 1400, wh: 760,
    draw(g, w, h) {
      for (const [x, y, r] of [[0.25, 0.68, 0.2], [0.5, 0.55, 0.28], [0.75, 0.68, 0.2], [0.38, 0.8, 0.2], [0.62, 0.8, 0.2]]) {
        fluffy(g, w * x, h * y, w * r * 0.9, '#ffffff', '#d9d2ff');
      }
    },
  },
  crystal: {
    w: 120, h: 180, ww: 600, wh: 900,
    draw(g, w, h) {
      const spire = (x, top, sw, c1, c2) => {
        g.fillStyle = vgrad(g, top, h, [c1, c2]);
        g.beginPath(); g.moveTo(x, top); g.lineTo(x + sw, h * 0.35 + top * 0.5); g.lineTo(x + sw * 0.7, h); g.lineTo(x - sw * 0.7, h); g.lineTo(x - sw, h * 0.35 + top * 0.5); g.closePath(); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.45)';
        g.beginPath(); g.moveTo(x, top); g.lineTo(x - sw * 0.4, h * 0.4 + top * 0.5); g.lineTo(x - sw * 0.2, h); g.lineTo(x, h); g.closePath(); g.fill();
      };
      spire(w * 0.3, h * 0.3, w * 0.13, '#c9f4ff', '#3fa9ff');
      spire(w * 0.72, h * 0.25, w * 0.12, '#f1dcff', '#a66bff');
      spire(w * 0.5, h * 0.02, w * 0.17, '#e8fbff', '#7b5cd6');
    },
  },
  signL: {
    w: 120, h: 140, ww: 520, wh: 600,
    draw(g, w, h) {
      SIGN_BOARD(g, w, h, '#ff5fa8', () => {
        g.fillStyle = '#ffffff';
        for (const k of [0, 1]) {
          const x = w * (0.62 - k * 0.26);
          g.beginPath(); g.moveTo(x, h * 0.14); g.lineTo(x - w * 0.18, h * 0.29); g.lineTo(x, h * 0.44); g.lineTo(x + w * 0.08, h * 0.44); g.lineTo(x - w * 0.1, h * 0.29); g.lineTo(x + w * 0.08, h * 0.14); g.fill();
        }
      });
    },
  },
  jumpL: {
    w: 140, h: 160, ww: 640, wh: 720,
    draw(g, w, h) {
      SIGN_BOARD(g, w, h, '#ffb020', () => {
        g.fillStyle = '#3a1450';
        g.font = `${Math.round(w * 0.17)}px ${FONT}`;
        g.textAlign = 'center';
        g.fillText('JUMP!', w / 2, h * 0.38);
        g.beginPath(); g.moveTo(w / 2, h * 0.1); g.lineTo(w * 0.6, h * 0.2); g.lineTo(w * 0.4, h * 0.2); g.fill();
      });
    },
  },
  flagL: {
    w: 80, h: 240, ww: 320, wh: 1000,
    draw(g, w, h) {
      g.fillStyle = '#ffffff';
      g.fillRect(w * 0.1, 0, w * 0.08, h);
      const cell = w * 0.16;
      for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
        g.fillStyle = (r + c) % 2 ? '#222' : '#fff';
        g.fillRect(w * 0.18 + c * cell, h * 0.03 + r * cell, cell, cell);
      }
    },
  },
  banner: {
    w: 512, h: 300, ww: 4300, wh: 2500,
    draw(g, w, h) {
      // rainbow arch over the road
      const cx = w / 2;
      const cy = h;
      const band = w * 0.022;
      RAINBOW.forEach((c, i) => {
        g.strokeStyle = c;
        g.lineWidth = band + 1;
        g.beginPath();
        g.ellipse(cx, cy, w / 2 - band * (i + 0.5), h * 0.95 - band * (i + 0.5), 0, Math.PI, 0);
        g.stroke();
      });
      // checkered sign
      const sw = w * 0.34; const sh = h * 0.16; const sx = cx - sw / 2; const sy = h * 0.1;
      g.fillStyle = '#ffffff';
      g.beginPath(); g.roundRect(sx - 6, sy - 6, sw + 12, sh + 12, 10); g.fill();
      const n = 16;
      for (let c = 0; c < n; c++) for (let r = 0; r < 2; r++) {
        g.fillStyle = (r + c) % 2 ? '#2a1840' : '#ffffff';
        g.fillRect(sx + (c * sw) / n, sy + (r * sh) / 2, sw / n + 0.5, sh / 2 + 0.5);
      }
      g.fillStyle = '#ff5fa8';
      g.beginPath(); g.roundRect(cx - sw * 0.3, sy + sh * 0.15, sw * 0.6, sh * 0.7, 6); g.fill();
      g.fillStyle = '#ffffff';
      g.font = `${Math.round(sh * 0.45)}px ${FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('FINISH', cx, sy + sh / 2 + 1);
    },
  },
  rainbow: {
    w: 160, h: 104, ww: 380, wh: 247,
    draw(g, w, h) {
      const cx = w / 2;
      const cy = h * 0.8;
      const R = w * 0.42;
      const band = R * 0.11;
      g.shadowColor = 'rgba(255,255,255,0.9)';
      g.shadowBlur = 10;
      RAINBOW.forEach((c, i) => {
        g.strokeStyle = c;
        g.lineWidth = band + 0.8;
        g.beginPath();
        g.arc(cx, cy, R - band * (i + 0.5), Math.PI, 0);
        g.stroke();
      });
      g.shadowBlur = 0;
      for (const s of [-1, 1]) {
        for (const [dx, dy, r] of [[0, 0, 0.11], [s * 0.08, 0.03, 0.08], [-s * 0.07, 0.04, 0.07]]) {
          g.fillStyle = '#ffffff';
          ell(g, cx + s * R * 0.72 + dx * w, cy + dy * h, w * r, w * r * 0.8); g.fill();
        }
      }
      g.fillStyle = 'rgba(255,255,255,0.8)';
      drawStar(g, cx + R * 0.35, cy - R * 0.85, w * 0.05, '#ffffff');
    },
  },
  rock: {
    w: 140, h: 100, ww: 640, wh: 460,
    draw(g, w, h) {
      g.fillStyle = vgrad(g, 0, h, ['#b9a9d6', '#6f5f94']);
      g.beginPath();
      g.moveTo(w * 0.05, h); g.quadraticCurveTo(w * 0.02, h * 0.35, w * 0.35, h * 0.12);
      g.quadraticCurveTo(w * 0.6, 0, w * 0.82, h * 0.25); g.quadraticCurveTo(w * 1.02, h * 0.55, w * 0.95, h);
      g.closePath(); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.25)';
      ell(g, w * 0.38, h * 0.3, w * 0.14, h * 0.08, -0.4); g.fill();
      // grumpy face
      g.fillStyle = '#2a1840';
      ell(g, w * 0.4, h * 0.58, w * 0.04, h * 0.07); g.fill();
      ell(g, w * 0.6, h * 0.58, w * 0.04, h * 0.07); g.fill();
      g.strokeStyle = '#2a1840'; g.lineWidth = w * 0.03; g.lineCap = 'round';
      g.beginPath(); g.moveTo(w * 0.33, h * 0.44); g.lineTo(w * 0.46, h * 0.5); g.stroke();
      g.beginPath(); g.moveTo(w * 0.67, h * 0.44); g.lineTo(w * 0.54, h * 0.5); g.stroke();
      g.beginPath(); g.arc(w * 0.5, h * 0.84, w * 0.07, Math.PI * 1.15, Math.PI * 1.85); g.stroke();
    },
  },
  log: {
    w: 300, h: 80, ww: 1500, wh: 400,
    draw(g, w, h) {
      g.fillStyle = vgrad(g, h * 0.1, h, ['#d29a6d', '#8a5638']);
      g.beginPath(); g.roundRect(w * 0.06, h * 0.12, w * 0.88, h * 0.86, h * 0.4); g.fill();
      g.strokeStyle = 'rgba(90,50,30,0.5)'; g.lineWidth = 3;
      for (const y of [0.4, 0.62, 0.8]) { g.beginPath(); g.moveTo(w * 0.14, h * y); g.lineTo(w * 0.86, h * y); g.stroke(); }
      for (const x of [0.08, 0.92]) {
        g.fillStyle = '#f3cf9f';
        ell(g, w * x, h * 0.55, h * 0.18, h * 0.42); g.fill();
        g.strokeStyle = '#b07a4f'; g.lineWidth = 2;
        ell(g, w * x, h * 0.55, h * 0.1, h * 0.25); g.stroke();
      }
      g.fillStyle = '#56d6a6';
      ell(g, w * 0.4, h * 0.14, w * 0.05, h * 0.08); g.fill();
      ell(g, w * 0.44, h * 0.1, w * 0.03, h * 0.06); g.fill();
    },
  },
  hurdle: {
    w: 1024, h: 72, ww: 6600, wh: 460,
    draw(g, w, h) {
      // posts at the road edges and the ends
      g.fillStyle = '#ffffff';
      for (const x of [0.02, 0.27, 0.73, 0.98]) g.fillRect(w * x - 5, h * 0.2, 10, h * 0.8);
      // candy-striped bar
      const y = h * 0.12; const bh = h * 0.42;
      g.fillStyle = '#ffffff';
      g.beginPath(); g.roundRect(0, y, w, bh, bh / 2); g.fill();
      g.save();
      g.beginPath(); g.roundRect(0, y, w, bh, bh / 2); g.clip();
      g.fillStyle = '#ff4d6d';
      for (let x = -bh; x < w + bh; x += bh * 1.6) {
        g.beginPath(); g.moveTo(x, y + bh); g.lineTo(x + bh * 0.8, y); g.lineTo(x + bh * 1.6, y); g.lineTo(x + bh * 0.8, y + bh); g.fill();
      }
      g.restore();
    },
  },
};
// mirrored versions
PAINTERS.signR = { ...PAINTERS.signL, mirror: true };
PAINTERS.jumpR = PAINTERS.jumpL;
PAINTERS.flagR = { ...PAINTERS.flagL, mirror: true };

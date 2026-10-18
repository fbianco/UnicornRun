// ---------------------------------------------------------------------------
// Particles: sparkles, dust, dizzy stars and big flying banner texts.
// Everything lives in the SCREEN space of one split-screen view: the race
// says "player 1 took a rainbow", and the burst appears around player 1's
// unicorn in player 1's half. RoadView tells us where each unicorn was drawn.
// ---------------------------------------------------------------------------
import { RAINBOW } from '../config.js';

export class Particles {
  constructor(views = 2) {
    this.views = views;
    this.anchor = Array.from({ length: views }, () => ({ x: 320, y: 560, w: 180 }));
    this.clear();
  }

  clear() {
    this.parts = Array.from({ length: this.views }, () => []);
    this.banners = Array.from({ length: this.views }, () => []);
    this.shakeT = Array.from({ length: this.views }, () => 0);
  }

  add(v, p) {
    this.parts[v].push({ t: 0, g: 0, kind: 'dot', ...p });
  }

  sparkle(v, count = 18) {
    const a = this.anchor[v];
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const s = 120 + Math.random() * 220;
      this.add(v, {
        x: a.x + (Math.random() - 0.5) * a.w * 0.5, y: a.y - a.w * 0.6,
        vx: Math.cos(ang) * s, vy: Math.sin(ang) * s - 120, g: 300,
        life: 0.5 + Math.random() * 0.5, size: 4 + Math.random() * 5,
        color: RAINBOW[i % 6], kind: i % 3 ? 'star' : 'dot',
      });
    }
  }

  dust(v) {
    const a = this.anchor[v];
    for (let i = 0; i < 14; i++) {
      const s = (Math.random() - 0.5) * 2;
      this.add(v, {
        x: a.x + s * a.w * 0.3, y: a.y, vx: s * 160, vy: -30 - Math.random() * 60, g: 120,
        life: 0.4 + Math.random() * 0.3, size: 6 + Math.random() * 8, color: 'rgba(255,255,255,0.7)', kind: 'puff',
      });
    }
  }

  stars(v) {
    const a = this.anchor[v];
    for (let i = 0; i < 12; i++) {
      const ang = (i / 12) * Math.PI * 2;
      this.add(v, {
        x: a.x, y: a.y - a.w * 0.5, vx: Math.cos(ang) * 260, vy: Math.sin(ang) * 200 - 80, g: 500,
        life: 0.8, size: 7, color: i % 2 ? '#fff27a' : '#ffffff', kind: 'star',
      });
    }
  }

  shake(v, t = 0.35) {
    this.shakeT[v] = t;
  }

  shakeOffset(v) {
    const s = this.shakeT[v];
    if (s <= 0) return [0, 0];
    return [(Math.random() - 0.5) * s * 40, (Math.random() - 0.5) * s * 40];
  }

  banner(v, text) {
    this.banners[v].push({ text, t: 0, life: 1.6 });
  }

  update(dt) {
    for (let v = 0; v < this.views; v++) {
      for (const p of this.parts[v]) {
        p.t += dt;
        p.vy += p.g * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
      this.parts[v] = this.parts[v].filter((p) => p.t < p.life);
      for (const b of this.banners[v]) b.t += dt;
      this.banners[v] = this.banners[v].filter((b) => b.t < b.life);
      this.shakeT[v] = Math.max(0, this.shakeT[v] - dt);
    }
  }

  draw(ctx, v) {
    for (const p of this.parts[v]) {
      const k = 1 - p.t / p.life;
      ctx.globalAlpha = Math.max(0, k);
      ctx.fillStyle = p.color;
      if (p.kind === 'star') {
        const s = p.size * (0.5 + k * 0.5);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y - s); ctx.lineTo(p.x + s * 0.3, p.y - s * 0.3); ctx.lineTo(p.x + s, p.y);
        ctx.lineTo(p.x + s * 0.3, p.y + s * 0.3); ctx.lineTo(p.x, p.y + s); ctx.lineTo(p.x - s * 0.3, p.y + s * 0.3);
        ctx.lineTo(p.x - s, p.y); ctx.lineTo(p.x - s * 0.3, p.y - s * 0.3);
        ctx.fill();
      } else {
        const r = p.kind === 'puff' ? p.size * (1.6 - k * 0.6) : p.size * (0.5 + k * 0.5);
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
}

// ---------------------------------------------------------------------------
// SpriteCache: bakes each vector "painter" (sprites.js) once into an
// offscreen canvas. Afterwards a sprite costs one drawImage() at any size,
// instead of re-running dozens of path and gradient commands per frame.
// Sprites are baked at 2x their nominal size so close-ups stay crisp.
// ---------------------------------------------------------------------------
import { PAINTERS } from './sprites.js';

const SUPER = 2;

export class SpriteCache {
  constructor() {
    this.images = new Map();
  }

  /** Bake everything up front so the first race has no hiccups. */
  warm() {
    for (const name of Object.keys(PAINTERS)) this.get(name);
    return this;
  }

  /** Throw everything away and bake again (e.g. once the pixel font has loaded). */
  rebake() {
    this.images.clear();
    return this.warm();
  }

  get(name) {
    let img = this.images.get(name);
    if (img) return img;
    const p = PAINTERS[name];
    if (!p) return null;
    const c = document.createElement('canvas');
    c.width = p.w * SUPER;
    c.height = p.h * SUPER;
    const g = c.getContext('2d');
    if (p.mirror) {
      g.translate(c.width, 0);
      g.scale(-1, 1);
    }
    g.scale(SUPER, SUPER);
    p.draw(g, p.w, p.h);
    img = { canvas: c, ww: p.ww, wh: p.wh };
    this.images.set(name, img);
    return img;
  }
}

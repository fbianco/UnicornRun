// ---------------------------------------------------------------------------
// PlayerAssigner: "which skeleton is player 1 and which is player 2?"
//
// MediaPipe returns up to two skeletons per frame in no particular order.
// Players stand side by side: as seen in the mirrored camera picture,
// the person on the LEFT is player 1, on the RIGHT player 2 - the same
// sides as their halves of the split screen.
//
//   two skeletons -> sort by the (mirrored) shoulder centre
//   one skeleton  -> give it to the player who was last seen closest to it,
//                    so a player does not "swap" when the other one steps out
//
// Pure logic: unit tested in tests/assign.test.mjs.
// ---------------------------------------------------------------------------
import { LM } from './RunnerGestures.js';

const STICKY = 0.22;   // max jump (image widths) to keep a lone skeleton on its slot
const MEMORY = 2000;   // ms a slot remembers where its player was

export function centreX(lm) {
  // mirrored, so 0 = left of the picture the players see
  return 1 - (lm[LM.L_SHOULDER].x + lm[LM.R_SHOULDER].x) / 2;
}

function usable(lm) {
  return (lm[LM.L_SHOULDER].visibility ?? 1) > 0.5 && (lm[LM.R_SHOULDER].visibility ?? 1) > 0.5;
}

export class PlayerAssigner {
  constructor() {
    this.last = [null, null];   // { x, t } where each slot was last seen
  }

  /** poses: array of landmark lists. Returns [p1 | null, p2 | null]. */
  assign(poses, tMs) {
    const out = [null, null];
    const list = (poses ?? []).filter(usable).map((lm) => ({ lm, x: centreX(lm) }));
    for (let s = 0; s < 2; s++) {
      if (this.last[s] && tMs - this.last[s].t > MEMORY) this.last[s] = null;
    }
    if (list.length >= 2) {
      list.sort((a, b) => a.x - b.x);
      out[0] = list[0];
      out[1] = list[list.length - 1];
    } else if (list.length === 1) {
      const p = list[0];
      const d = this.last.map((l) => (l ? Math.abs(l.x - p.x) : Infinity));
      let slot;
      if (Math.min(d[0], d[1]) < STICKY) slot = d[0] <= d[1] ? 0 : 1;
      else slot = p.x < 0.5 ? 0 : 1;
      out[slot] = p;
    }
    for (let s = 0; s < 2; s++) if (out[s]) this.last[s] = { x: out[s].x, t: tMs };
    return out.map((o) => (o ? o.lm : null));
  }
}

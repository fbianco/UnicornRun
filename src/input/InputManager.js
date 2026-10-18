// ---------------------------------------------------------------------------
// InputManager: merges keyboard and body control into one "intent" per player.
// The race only ever sees { steer, run, jump, boost } - it does not know (or
// care) whether you pressed a key or jumped in front of the camera.
//
// Jump and boost are *events*: the camera may produce them between two game
// ticks, so we latch them here and hand them out exactly once.
// ---------------------------------------------------------------------------
import { KEYS } from '../config.js';

export class InputManager {
  constructor(keyboard, gestures) {
    this.keyboard = keyboard;
    this.gestures = gestures;          // one RunnerGestures per player
    this.bodyEnabled = false;
    this.latch = gestures.map(() => ({ jump: false, boost: false }));
  }

  /** Called whenever player i's gesture interpreter produced a new frame. */
  onGestureFrame(i, out) {
    if (!this.bodyEnabled) return;
    if (out.jump) this.latch[i].jump = true;
    if (out.boost) this.latch[i].boost = true;
  }

  /** Forget jumps / dashes seen before a new screen starts. */
  reset() {
    for (const l of this.latch) { l.jump = false; l.boost = false; }
  }

  /** True while player i is pressing any of their keys. */
  keyActive(i) {
    const k = KEYS[i];
    return this.keyboard.any([...k.left, ...k.right, ...k.run, ...k.jump, ...k.boost]);
  }

  /** Called once per game tick for each player. */
  intent(i) {
    const kb = this.keyboard;
    const k = KEYS[i];
    const g = this.bodyEnabled ? this.gestures[i].out : null;
    const l = this.latch[i];
    const keySteer = kb.axis(k.left, k.right);
    const jump = kb.consumeAny(k.jump) || l.jump;
    const boost = kb.consumeAny(k.boost) || l.boost;
    l.jump = false;
    l.boost = false;
    return {
      steer: keySteer || (g?.steer ?? 0),
      run: kb.any(k.run) ? 1 : (g?.run ?? 0),
      jump,
      boost,
    };
  }
}

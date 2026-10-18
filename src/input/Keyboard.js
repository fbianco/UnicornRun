// Keyboard: held keys for movement + one-shot "pressed" events for actions.
const PREVENT = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'Slash']);

export class Keyboard {
  constructor(target = window) {
    this.down = new Set();
    this.pressed = new Set();
    target.addEventListener('keydown', (e) => {
      if (PREVENT.has(e.code)) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.down.add(e.code);
    });
    target.addEventListener('keyup', (e) => this.down.delete(e.code));
    target.addEventListener('blur', () => this.down.clear());
  }

  any(codes) {
    return codes.some((k) => this.down.has(k));
  }

  axis(neg, pos) {
    return (this.any(pos) ? 1 : 0) - (this.any(neg) ? 1 : 0);
  }

  /** True once per key press. */
  consume(code) {
    const had = this.pressed.has(code);
    this.pressed.delete(code);
    return had;
  }

  /** True once if any of the keys was pressed (all of them are consumed). */
  consumeAny(codes) {
    let hit = false;
    for (const c of codes) if (this.consume(c)) hit = true;
    return hit;
  }

  clearPressed() {
    this.pressed.clear();
  }
}

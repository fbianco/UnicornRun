// ---------------------------------------------------------------------------
// Sound: every effect and the music are synthesised live with the Web Audio
// API (oscillators + noise), like the sound chip of an 8-bit computer.
// No audio files needed. The tune is original.
// Effects take a stereo pan: player 1's sounds come from the left speaker,
// player 2's from the right.
// ---------------------------------------------------------------------------

const NOTE = (n) => 440 * 2 ** ((n - 69) / 12); // MIDI note -> Hz

// F - C - Dm - Bb, eight eighth-notes per chord
const BASS = [
  41, 53, 48, 53, 41, 53, 48, 53, 36, 48, 43, 48, 36, 48, 43, 48,
  38, 50, 45, 50, 38, 50, 45, 50, 34, 46, 41, 46, 34, 46, 41, 46,
];
const LEAD = [
  72, 0, 69, 72, 77, 0, 76, 74, 72, 0, 67, 72, 76, 0, 74, 72,
  74, 0, 69, 74, 77, 0, 76, 74, 72, 70, 69, 67, 69, 0, 65, 0,
  77, 76, 77, 79, 81, 0, 77, 0, 76, 74, 76, 77, 79, 0, 76, 0,
  74, 72, 74, 76, 77, 0, 74, 0, 72, 74, 72, 70, 69, 0, 0, 0,
];

export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.musicOn = false;
    this.step = 0;
    this.nextTime = 0;
    this.timer = null;
  }

  init() {
    if (this.ctx) {
      this.ctx.resume?.();
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(this.ctx.destination);
      this.sfx = this.ctx.createGain();
      this.sfx.gain.value = 0.8;
      this.sfx.connect(this.master);
      this.music = this.ctx.createGain();
      this.music.gain.value = 0.2;
      this.music.connect(this.master);
      // one panner per side, created once
      this.pans = new Map();
      for (const p of [-0.6, 0, 0.6]) {
        const node = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : this.ctx.createGain();
        if (node.pan) node.pan.value = p;
        node.connect(this.sfx);
        this.pans.set(p, node);
      }
      const len = this.ctx.sampleRate * 0.5;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) {
      console.warn('No Web Audio', e);
      this.ctx = null;
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.55;
    return this.muted;
  }

  bus(pan) {
    return this.pans.get(pan) ?? this.pans.get(0);
  }

  tone(freq, dur, { type = 'square', vol = 0.25, slide = 0, delay = 0, out } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(out ?? this.bus(0));
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  noise(dur, { vol = 0.3, freq = 1800, delay = 0, out, sweep = 0 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(freq, t);
    if (sweep) f.frequency.exponentialRampToValueAtTime(freq + sweep, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(out ?? this.bus(0));
    s.start(t);
    s.stop(t + dur + 0.02);
  }

  play(name, pan = 0) {
    if (!this.ctx) return;
    const out = this.bus(pan);
    const arp = (notes, gap, opt = {}) => notes.forEach((f, i) => this.tone(f, opt.dur ?? 0.1, { delay: i * gap, vol: 0.15, out, ...opt }));
    switch (name) {
      case 'hoof': this.noise(0.03, { freq: 1400 + Math.random() * 600, vol: 0.12, out }); break;
      case 'rainbow': arp([1319, 1568, 2093, 2637], 0.035, { type: 'triangle', dur: 0.09, vol: 0.12 }); break;
      case 'jump': this.tone(330, 0.22, { slide: 500, type: 'square', vol: 0.12, out }); break;
      case 'land': this.noise(0.1, { freq: 300, vol: 0.35, out }); break;
      case 'stumble':
        this.noise(0.25, { freq: 600, vol: 0.4, out });
        this.tone(500, 0.5, { slide: -380, type: 'sawtooth', vol: 0.14, out });
        break;
      case 'dash':
        this.noise(0.8, { freq: 500, sweep: 4000, vol: 0.25, out });
        arp([523, 659, 784, 1047, 1319, 1568], 0.06, { type: 'square', vol: 0.12 });
        break;
      case 'bump': this.tone(140, 0.12, { type: 'triangle', vol: 0.3, out }); break;
      case 'lap': arp([784, 988, 1175, 1568], 0.08, { type: 'triangle', dur: 0.15 }); break;
      case 'finish': arp([523, 659, 784, 1047, 1319], 0.1, { dur: 0.2, vol: 0.18 }); break;
      case 'fanfare':
        [523, 523, 523, 698, 880, 784, 880, 1047].forEach((f, i) => this.tone(f, 0.22, { delay: [0, 0.15, 0.3, 0.45, 0.75, 1.05, 1.2, 1.4][i], vol: 0.17 }));
        break;
      case 'beep': this.tone(660, 0.15, { vol: 0.18 }); break;
      case 'go': this.tone(1320, 0.45, { vol: 0.2 }); break;
      case 'join': arp([523, 784], 0.1, { dur: 0.14 }); break;
      case 'ready': arp([659, 880, 1319], 0.08, { type: 'triangle', dur: 0.14 }); break;
      case 'start': arp([262, 330, 392, 523], 0.07); break;
      default: break;
    }
  }

  // ---- music: a tiny look-ahead sequencer -----------------------------------
  startMusic() {
    if (!this.ctx || this.musicOn) return;
    this.musicOn = true;
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.05;
    this.timer = setInterval(() => this.schedule(), 50);
  }

  stopMusic() {
    this.musicOn = false;
    clearInterval(this.timer);
  }

  schedule() {
    const stepDur = 60 / 160 / 2; // eighth notes at 160 bpm
    while (this.nextTime < this.ctx.currentTime + 0.15) {
      const delay = this.nextTime - this.ctx.currentTime;
      const b = BASS[this.step % BASS.length];
      this.tone(NOTE(b), stepDur * 0.9, { type: 'triangle', vol: 0.5, delay, out: this.music });
      const l = LEAD[this.step % LEAD.length];
      if (l) this.tone(NOTE(l), stepDur * 0.8, { type: 'square', vol: 0.14, delay, out: this.music });
      if (this.step % 2 === 1) this.noise(0.03, { freq: 8000, vol: 0.06, delay, out: this.music });
      if (this.step % 4 === 0) this.tone(90, 0.08, { type: 'sine', vol: 0.5, slide: -40, delay, out: this.music });
      this.step++;
      this.nextTime += stepDur;
    }
  }
}

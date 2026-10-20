// Fully synthesized audio: sound effects and a small generative music sequencer.
const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10], lydian: [0, 2, 4, 6, 7, 9, 11], mixolydian: [0, 2, 4, 5, 7, 9, 10],
  pentatonic: [0, 2, 4, 7, 9], wholetone: [0, 2, 4, 6, 8, 10],
};
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

class Audio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    try { this.muted = localStorage.getItem('p13-muted') === '1'; } catch (e) { /* storage unavailable */ }
    this.music = null;
  }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    this.master.connect(comp).connect(c.destination);
    this.sfxBus = c.createGain(); this.sfxBus.gain.value = 0.55; this.sfxBus.connect(this.master);
    this.musicBus = c.createGain(); this.musicBus.gain.value = 0.22; this.musicBus.connect(this.master);
    // shared echo for music & sparkle sfx
    this.delay = c.createDelay(1); this.delay.delayTime.value = 0.28;
    const fb = c.createGain(); fb.gain.value = 0.32;
    const dl = c.createBiquadFilter(); dl.type = 'lowpass'; dl.frequency.value = 2400;
    this.delay.connect(dl).connect(fb).connect(this.delay);
    const wet = c.createGain(); wet.gain.value = 0.5;
    this.delay.connect(wet).connect(this.master);
    // noise buffer
    const len = c.sampleRate * 1;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  setMuted(m) {
    this.muted = m;
    try { localStorage.setItem('p13-muted', m ? '1' : '0'); } catch (e) { /* ignore */ }
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.05);
  }
  toggleMute() { this.setMuted(!this.muted); return this.muted; }

  tone({ f = 440, f2 = null, type = 'square', t = 0, dur = 0.15, vol = 0.3, attack = 0.005, bus = this.sfxBus, echo = false, detune = 0 }) {
    if (!this.ctx) return;
    const c = this.ctx, now = c.currentTime + t;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, now); o.detune.value = detune;
    if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), now + dur);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(vol, now + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    o.connect(g).connect(bus);
    if (echo) g.connect(this.delay);
    o.start(now); o.stop(now + dur + 0.05);
  }
  noiseBurst({ t = 0, dur = 0.2, vol = 0.3, f = 1200, f2 = null, q = 1, type = 'bandpass', bus = this.sfxBus }) {
    if (!this.ctx) return;
    const c = this.ctx, now = c.currentTime + t;
    const s = c.createBufferSource(); s.buffer = this.noise;
    const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, now); fl.Q.value = q;
    if (f2) fl.frequency.exponentialRampToValueAtTime(f2, now + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, now); g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    s.connect(fl).connect(g).connect(bus);
    s.start(now, Math.random() * 0.5); s.stop(now + dur + 0.05);
  }

  // ---- sound effects ----
  jump() { this.tone({ f: 260, f2: 620, type: 'square', dur: 0.14, vol: 0.12 }); this.tone({ f: 520, f2: 1240, type: 'sine', dur: 0.12, vol: 0.06 }); }
  land() { this.noiseBurst({ dur: 0.07, vol: 0.12, f: 400, type: 'lowpass' }); }
  coin(i = 0) {
    const b = 988 * Math.pow(2, (i % 5) / 24);
    this.tone({ f: b, type: 'square', dur: 0.07, vol: 0.09 });
    this.tone({ f: b * 1.335, type: 'square', t: 0.06, dur: 0.16, vol: 0.09, echo: true });
  }
  mega() { [0, 4, 7, 12, 16].forEach((s, i) => this.tone({ f: mtof(76 + s), type: 'square', t: i * 0.05, dur: 0.2, vol: 0.08, echo: true })); }
  bounce() { this.tone({ f: 180, f2: 900, type: 'sine', dur: 0.32, vol: 0.25 }); this.tone({ f: 90, f2: 300, type: 'triangle', dur: 0.25, vol: 0.2 }); }
  artifact() {
    [0, 7, 12, 16, 19, 24].forEach((s, i) => this.tone({ f: mtof(64 + s), type: 'triangle', t: i * 0.09, dur: 0.6, vol: 0.16, echo: true }));
    this.tone({ f: mtof(52), type: 'sawtooth', dur: 1.4, vol: 0.08, attack: 0.2 });
    this.noiseBurst({ dur: 1.2, vol: 0.06, f: 6000, f2: 12000, type: 'highpass' });
  }
  portalOn() { this.tone({ f: 80, f2: 640, type: 'sawtooth', dur: 1.0, vol: 0.12, attack: 0.1 }); this.noiseBurst({ dur: 1.0, vol: 0.12, f: 300, f2: 4000, q: 3 }); }
  warp() { this.tone({ f: 120, f2: 1800, type: 'sawtooth', dur: 1.6, vol: 0.14, attack: 0.3 }); this.noiseBurst({ dur: 1.8, vol: 0.2, f: 200, f2: 6000, q: 2 }); }
  hurt() { this.tone({ f: 420, f2: 60, type: 'sawtooth', dur: 0.5, vol: 0.22 }); this.noiseBurst({ dur: 0.3, vol: 0.2, f: 800, type: 'lowpass' }); }
  die() {
    this.tone({ f: 600, f2: 40, type: 'square', dur: 0.9, vol: 0.18 });
    this.tone({ f: 300, f2: 30, type: 'sawtooth', dur: 1.0, vol: 0.12, detune: 20 });
    this.noiseBurst({ dur: 0.5, vol: 0.25, f: 500, type: 'lowpass' });
  }
  shieldPop() { this.noiseBurst({ dur: 0.25, vol: 0.3, f: 3000, q: 2 }); this.tone({ f: 1400, f2: 300, type: 'sine', dur: 0.3, vol: 0.2 }); }
  buy() { [0, 7, 12].forEach((s, i) => this.tone({ f: mtof(72 + s), type: 'square', t: i * 0.07, dur: 0.18, vol: 0.1, echo: true })); this.noiseBurst({ t: 0.2, dur: 0.15, vol: 0.12, f: 5000 }); }
  deny() { this.tone({ f: 160, type: 'square', dur: 0.12, vol: 0.12 }); this.tone({ f: 120, type: 'square', t: 0.13, dur: 0.18, vol: 0.12 }); }
  click() { this.tone({ f: 1200, f2: 800, type: 'square', dur: 0.04, vol: 0.06 }); }
  move() { this.tone({ f: 700, type: 'triangle', dur: 0.05, vol: 0.06 }); }
  blip() { this.tone({ f: 1600 + Math.random() * 900, type: 'square', dur: 0.025, vol: 0.02 }); }
  locked() { this.tone({ f: 220, f2: 180, type: 'triangle', dur: 0.25, vol: 0.15 }); }
  gameOver() { [12, 7, 3, 0, -5].forEach((s, i) => this.tone({ f: mtof(57 + s), type: 'triangle', t: i * 0.22, dur: 0.5, vol: 0.18, echo: true })); }
  victory() {
    const seq = [0, 4, 7, 12, 7, 12, 16, 19, 24];
    seq.forEach((s, i) => this.tone({ f: mtof(60 + s), type: 'square', t: i * 0.12, dur: 0.3, vol: 0.1, echo: true }));
    seq.forEach((s, i) => this.tone({ f: mtof(48 + s), type: 'triangle', t: i * 0.12, dur: 0.3, vol: 0.12 }));
  }

  // ---- music ----
  playMusic(cfg) {
    this.stopMusic();
    if (!this.ctx) return;
    const scale = SCALES[cfg.scale] || SCALES.minor;
    const step = 60 / cfg.bpm / 4; // 16th notes
    let seed = (cfg.seed || 1) >>> 0;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const note = (deg, oct = 0) => {
      const n = scale.length;
      const o = Math.floor(deg / n);
      return cfg.root + scale[((deg % n) + n) % n] + 12 * (o + oct);
    };
    // generate 4-bar progression and an arpeggio motif
    const prog = [0, rnd() < 0.5 ? 5 : 3, rnd() < 0.5 ? 3 : 4, rnd() < 0.5 ? 4 : 6].map((d) => d % scale.length);
    const motif = Array.from({ length: 16 }, () => (rnd() < 0.72 ? Math.floor(rnd() * 5) : null));
    const kickPat = cfg.calm ? [0, 8] : [0, 4, 8, 12];
    const m = { stepIdx: 0, next: this.ctx.currentTime + 0.1, timer: null };
    const tick = () => {
      const c = this.ctx;
      while (m.next < c.currentTime + 0.15) {
        const s = m.stepIdx % 16, bar = Math.floor(m.stepIdx / 16) % 4;
        const root = prog[bar];
        const t = m.next - c.currentTime;
        if (s % 4 === 0 || (s === 14 && !cfg.calm)) this.tone({ f: mtof(note(root, -2)), type: 'triangle', t, dur: step * 3, vol: 0.5, bus: this.musicBus });
        if (motif[s] !== null) {
          const deg = root + [0, 2, 4, 7, 9][motif[s]];
          this.tone({ f: mtof(note(deg, 0)), type: cfg.wave || 'square', t, dur: step * 1.6, vol: 0.1, bus: this.musicBus, echo: true, detune: 6 });
        }
        if (s === 0) this.tone({ f: mtof(note(root + 4, -1)), type: 'sine', t, dur: step * 15, vol: 0.12, attack: 0.3, bus: this.musicBus });
        if (!cfg.calm) {
          if (kickPat.includes(s)) this.tone({ f: 140, f2: 40, type: 'sine', t, dur: 0.16, vol: 0.55, bus: this.musicBus });
          if (s % 2 === 1) this.noiseBurst({ t, dur: 0.03, vol: 0.07, f: 8000, type: 'highpass', bus: this.musicBus });
          if (s === 4 || s === 12) this.noiseBurst({ t, dur: 0.12, vol: 0.12, f: 1800, q: 0.8, bus: this.musicBus });
        }
        m.next += step; m.stepIdx++;
      }
    };
    m.timer = setInterval(tick, 30);
    tick();
    this.music = m;
    this.musicBus.gain.cancelScheduledValues(this.ctx.currentTime);
    this.musicBus.gain.setTargetAtTime(0.22, this.ctx.currentTime, 0.4);
  }
  stopMusic() {
    if (this.music) { clearInterval(this.music.timer); this.music = null; }
  }
  duckMusic(on) {
    if (!this.ctx) return;
    this.musicBus.gain.setTargetAtTime(on ? 0.08 : 0.22, this.ctx.currentTime, 0.2);
  }
}

export const audio = new Audio();

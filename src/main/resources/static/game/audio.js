// Âm thanh tổng hợp bằng WebAudio (không file): súng, zombie, quạ, sấm,
// tiếng mưa, gió, dế kêu, lửa tí tách, nền nhạc trầm.
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class Sound {
  constructor() { this.ac = null; this.lx = 0; this.lz = 0; this.cricketT = 0; this.crackleT = 0; this.muted = false; }
  init() {
    if (this.ac) { if (this.ac.state === 'suspended') this.ac.resume(); return; }
    try {
      const ac = new (window.AudioContext || window.webkitAudioContext)();
      this.ac = ac;
      this.master = ac.createGain(); this.master.gain.value = 0.9;
      const comp = ac.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
      this.master.connect(comp); comp.connect(ac.destination);
      const len = ac.sampleRate * 2;
      this.noiseBuf = ac.createBuffer(1, len, ac.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const loop = (type, freq, q) => {
        const s = ac.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
        const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
        const g = ac.createGain(); g.gain.value = 0;
        s.connect(f); f.connect(g); g.connect(this.master); s.start();
        return { f, g };
      };
      this.wind = loop('bandpass', 420, 0.6);
      this.rain = loop('highpass', 1400, 0.4);
      this.rain2 = loop('lowpass', 500, 0.3);
      // nền nhạc trầm (hợp âm La thứ) rất nhỏ
      this.pad = ac.createGain(); this.pad.gain.value = 0;
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520; lp.Q.value = 0.4;
      this.pad.connect(lp); lp.connect(this.master);
      for (const [f, det] of [[110, -6], [110.4, 5], [130.8, -3], [164.8, 4], [82.4, 0]]) {
        const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det;
        const g = ac.createGain(); g.gain.value = 0.18;
        const lfo = ac.createOscillator(); lfo.frequency.value = 0.05 + Math.random() * 0.08;
        const lg = ac.createGain(); lg.gain.value = 0.1;
        lfo.connect(lg); lg.connect(g.gain);
        o.connect(g); g.connect(this.pad); o.start(); lfo.start();
      }
    } catch (e) { this.ac = null; }
  }
  setListener(x, z) { this.lx = x; this.lz = z; }
  out(x, z, base = 1) {
    const ac = this.ac;
    const g = ac.createGain();
    let node = g;
    if (x !== undefined && ac.createStereoPanner) {
      const dx = x - this.lx, dz = z - this.lz, d = Math.hypot(dx, dz);
      g.gain.value = base / (1 + d * d * 0.012);
      const p = ac.createStereoPanner(); p.pan.value = clamp(dx / 16, -0.9, 0.9);
      g.connect(p); p.connect(this.master);
    } else { g.gain.value = base; g.connect(this.master); }
    return node;
  }
  noise(dur, type, freq, vol, x, z, q = 1) {
    if (!this.ac || this.muted) return;
    const ac = this.ac, t = ac.currentTime;
    const s = ac.createBufferSource(); s.buffer = this.noiseBuf;
    s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ac.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    s.connect(f); f.connect(g); g.connect(this.out(x, z));
    s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  tone(type, f1, f2, dur, vol, x, z, delay = 0) {
    if (!this.ac || this.muted) return;
    const ac = this.ac, t = ac.currentTime + delay;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f1, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); g.connect(this.out(x, z));
    o.start(t); o.stop(t + dur + 0.05);
  }
  shoot(kind) {
    if (kind === 'shotgun') { this.noise(0.5, 'lowpass', 1300, 0.9); this.tone('square', 110, 32, 0.18, 0.28); this.noise(0.12, 'highpass', 3000, 0.25); }
    else if (kind === 'smg') { this.noise(0.1, 'lowpass', 3000, 0.36); this.tone('square', 190, 70, 0.05, 0.08); }
    else { this.noise(0.2, 'lowpass', 2400, 0.55); this.tone('square', 160, 45, 0.09, 0.16); }
  }
  empty() { this.tone('square', 1000, 760, 0.04, 0.05); }
  reload() { this.tone('square', 520, 300, 0.05, 0.07); this.tone('square', 760, 980, 0.05, 0.07, undefined, undefined, 0.2); }
  hit(x, z) { this.noise(0.09, 'bandpass', 700, 0.32, x, z, 1.5); }
  hurt() { this.tone('sawtooth', 150, 55, 0.3, 0.22); this.noise(0.2, 'lowpass', 400, 0.3); }
  groan(x, z, big) {
    if (!this.ac) return;
    const f = big ? 48 + Math.random() * 12 : 62 + Math.random() * 34;
    this.tone('sawtooth', f, f * 0.72, 0.6 + Math.random() * 0.5, big ? 0.12 : 0.07, x, z);
    this.tone('triangle', f * 2.01, f * 1.5, 0.5, 0.03, x, z);
  }
  caw(x, z) {
    for (let i = 0; i < 2; i++) { this.tone('sawtooth', 820, 520, 0.16, 0.05, x, z, i * 0.22); this.noise(0.14, 'bandpass', 1500, 0.04, x, z, 3); }
  }
  pickup() { this.tone('sine', 620, 1240, 0.14, 0.14); this.tone('sine', 930, 1860, 0.12, 0.08, undefined, undefined, 0.08); }
  thunder(dist = 1) {
    if (!this.ac) return;
    this.noise(2.8, 'lowpass', 160, 0.9 * dist); this.noise(1.2, 'lowpass', 500, 0.35 * dist);
    this.tone('sine', 48, 28, 2.2, 0.25 * dist);
  }
  rise(x, z) { this.noise(0.7, 'lowpass', 260, 0.35, x, z); }
  step() { this.noise(0.05, 'lowpass', 900, 0.05); }
  wave() { this.tone('triangle', 220, 220, 0.9, 0.08); this.tone('triangle', 261.6, 261.6, 0.9, 0.06, undefined, undefined, 0.25); this.tone('triangle', 329.6, 329.6, 1.2, 0.06, undefined, undefined, 0.5); }
  update(dt, amb) {
    if (!this.ac) return;
    const t = this.ac.currentTime;
    this.wind.g.gain.setTargetAtTime(this.muted ? 0 : 0.018 + amb.wind * 0.03, t, 0.5);
    this.wind.f.frequency.setTargetAtTime(320 + Math.sin(t * 0.3) * 120 + amb.wind * 120, t, 0.8);
    this.rain.g.gain.setTargetAtTime(this.muted ? 0 : amb.rain * 0.09, t, 0.8);
    this.rain2.g.gain.setTargetAtTime(this.muted ? 0 : amb.rain * 0.06, t, 0.8);
    this.pad.gain.setTargetAtTime(this.muted ? 0 : 0.02 * amb.music, t, 1.5);
    this.cricketT -= dt;
    if (this.cricketT <= 0 && amb.crickets > 0.05) {
      this.cricketT = 0.25 + Math.random() * 1.1 / amb.crickets;
      const f = 4300 + Math.random() * 600, x = this.lx + (Math.random() - 0.5) * 30, z = this.lz + (Math.random() - 0.5) * 20;
      for (let i = 0; i < 3; i++) this.tone('sine', f, f * 1.01, 0.035, 0.012 * amb.crickets, x, z, i * 0.06);
    }
    this.birdT = (this.birdT || 1) - dt;
    if (this.birdT <= 0 && amb.birds > 0.05) {
      this.birdT = 0.8 + Math.random() * 3 / amb.birds;
      const f = 2300 + Math.random() * 1500, x = this.lx + (Math.random() - 0.5) * 34, z = this.lz - 4 - Math.random() * 8;
      const n = 2 + Math.floor(Math.random() * 4);
      for (let i = 0; i < n; i++) this.tone('sine', f * (1 + (i % 2) * 0.18), f * (1.25 + (i % 2) * 0.1), 0.07, 0.022 * amb.birds, x, z, i * 0.09);
    }
    this.crackleT -= dt;
    if (this.crackleT <= 0 && amb.fire > 0.02) {
      this.crackleT = 0.04 + Math.random() * 0.25;
      this.noise(0.03 + Math.random() * 0.04, 'highpass', 2000 + Math.random() * 2000, 0.12 * amb.fire);
    }
  }
}

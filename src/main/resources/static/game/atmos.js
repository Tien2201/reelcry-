// Mỗi đêm một không khí khác nhau, chuyển dần mượt mà giữa các đêm.
import * as THREE from 'three';

export const PRESETS = [
  {
    id: 'dusk', name: 'Hoàng hôn',
    sunColor: '#ffab66', sunI: 2.5, sunDir: [-0.5, 0.45, -0.72],
    hemiSky: '#8c86c8', hemiGround: '#3a2c2a', hemiI: 1.25,
    fog: '#9a7a86', fogNear: 30, fogFar: 92,
    exposure: 1.02, bloom: 0.7, threshold: 1.15,
    lamps: 0.4, windows: 0.6, fires: 0.75, flash: 0.35,
    lift: [0.01, 0.0, 0.03], gain: [1.04, 0.99, 0.95], sat: 1.1, contrast: 1.05, vignette: 0.55,
    rain: 0, wet: 0, fireflies: 0.3, leaves: 0.9, ash: 0, mist: 0.12, shafts: 1, lightning: 0, wind: 0.9,
  },
  {
    id: 'night', name: 'Đêm trăng xanh',
    sunColor: '#8aa8ff', sunI: 0.75, sunDir: [0.35, 0.8, -0.5],
    hemiSky: '#4a5c9a', hemiGround: '#161220', hemiI: 0.75,
    fog: '#121a30', fogNear: 30, fogFar: 84,
    exposure: 1.2, bloom: 0.95, threshold: 0.95,
    lamps: 1, windows: 1, fires: 1, flash: 1,
    lift: [0.0, 0.01, 0.04], gain: [1.03, 1.0, 1.06], sat: 1.1, contrast: 1.07, vignette: 0.68,
    rain: 0, wet: 0, fireflies: 1, leaves: 0.3, ash: 0, mist: 0.22, shafts: 0.35, lightning: 0, wind: 0.6,
  },
  {
    id: 'storm', name: 'Mưa giông',
    sunColor: '#7a8cac', sunI: 0.45, sunDir: [0.2, 0.9, -0.4],
    hemiSky: '#3e4a5c', hemiGround: '#12141a', hemiI: 0.7,
    fog: '#1a222c', fogNear: 24, fogFar: 70,
    exposure: 1.2, bloom: 1.0, threshold: 0.9,
    lamps: 1, windows: 1, fires: 0.85, flash: 1,
    lift: [0.0, 0.01, 0.03], gain: [0.98, 1.0, 1.06], sat: 0.95, contrast: 1.1, vignette: 0.74,
    rain: 1, wet: 1, fireflies: 0, leaves: 0.5, ash: 0, mist: 0.3, shafts: 0, lightning: 1, wind: 1.7,
  },
  {
    id: 'fog', name: 'Sương mù',
    sunColor: '#b4c4ae', sunI: 0.6, sunDir: [-0.3, 0.85, -0.5],
    hemiSky: '#6a7a72', hemiGround: '#1a201c', hemiI: 0.85,
    fog: '#3e4c48', fogNear: 18, fogFar: 58,
    exposure: 1.1, bloom: 1.05, threshold: 0.85,
    lamps: 1, windows: 1, fires: 1, flash: 1,
    lift: [0.02, 0.03, 0.02], gain: [0.98, 1.02, 0.98], sat: 0.86, contrast: 1.0, vignette: 0.62,
    rain: 0, wet: 0.35, fireflies: 0.35, leaves: 0.2, ash: 0, mist: 1, shafts: 1, lightning: 0, wind: 0.4,
  },
  {
    id: 'blood', name: 'Trăng máu',
    sunColor: '#ff5032', sunI: 1.0, sunDir: [0.5, 0.6, -0.6],
    hemiSky: '#4a2232', hemiGround: '#140a0e', hemiI: 0.7,
    fog: '#2a0c10', fogNear: 26, fogFar: 74,
    exposure: 1.12, bloom: 1.0, threshold: 0.9,
    lamps: 0.85, windows: 0.65, fires: 1.2, flash: 1,
    lift: [0.02, 0.0, 0.01], gain: [1.06, 0.95, 0.95], sat: 0.98, contrast: 1.1, vignette: 0.8,
    rain: 0, wet: 0, fireflies: 0, leaves: 0, ash: 1, mist: 0.4, shafts: 0.35, lightning: 0, wind: 1.0,
  },
];

const COLOR_KEYS = ['sunColor', 'hemiSky', 'hemiGround', 'fog'];
function toState(p) {
  const s = { ...p };
  for (const k of COLOR_KEYS) s[k] = new THREE.Color(p[k]);
  s.sunDir = new THREE.Vector3(...p.sunDir).normalize();
  s.lift = [...p.lift]; s.gain = [...p.gain];
  return s;
}
// đêm 1 hoàng hôn, sau đó lặp: trăng xanh → mưa giông → sương mù → trăng máu
export function presetForNight(n) {
  return n <= 1 ? 0 : 1 + ((n - 2) % 4);
}
export class Atmos {
  constructor() {
    this.cur = toState(PRESETS[0]);
    this.from = toState(PRESETS[0]);
    this.to = toState(PRESETS[0]);
    this.t = 1; this.dur = 5;
    this.index = 0;
  }
  go(i, dur = 5) {
    this.index = i;
    this.from = this.snapshot();
    this.to = toState(PRESETS[i]);
    this.t = 0; this.dur = dur;
  }
  snapshot() {
    const c = this.cur, s = { ...c };
    for (const k of COLOR_KEYS) s[k] = c[k].clone();
    s.sunDir = c.sunDir.clone(); s.lift = [...c.lift]; s.gain = [...c.gain];
    return s;
  }
  update(dt) {
    if (this.t >= 1) return this.cur;
    this.t = Math.min(1, this.t + dt / this.dur);
    const k = this.t * this.t * (3 - 2 * this.t);
    const a = this.from, b = this.to, c = this.cur;
    for (const key in b) {
      if (key === 'id' || key === 'name') { c[key] = b[key]; continue; }
      if (COLOR_KEYS.includes(key)) c[key] = a[key].clone().lerp(b[key], k);
      else if (key === 'sunDir') c[key] = a[key].clone().lerp(b[key], k).normalize();
      else if (Array.isArray(b[key])) c[key] = b[key].map((v, i) => a[key][i] + (v - a[key][i]) * k);
      else if (typeof b[key] === 'number') c[key] = a[key] + (b[key] - a[key]) * k;
    }
    return c;
  }
}

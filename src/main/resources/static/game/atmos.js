// Chu kỳ ngày đêm liên tục + thời tiết: rạng đông → sáng → trưa → chiều tà →
// hoàng hôn → đêm, kèm mưa / mưa giông / sương mù / trăng máu chuyển mượt.
import * as THREE from 'three';

const C = (h) => new THREE.Color(h);
// mốc thời gian trong ngày (giờ) và thông số ánh sáng tại mỗi mốc
const NIGHT = {
  sunColor: '#8aa6ff', sunI: 0.7, hemiSky: '#43568f', hemiGround: '#151222', hemiI: 0.75,
  fog: '#141c34', fogNear: 30, fogFar: 110, skyTop: '#070c22', skyHor: '#22325a', glow: '#000000',
  stars: 1, moonCol: '#e8eeff', clouds: 0.4, cloudCol: '#26304e',
  exposure: 1.2, bloom: 0.95, threshold: 0.95, lamps: 1, windows: 1, fires: 1, flash: 1,
  lift: [0, 0.01, 0.04], gain: [1.03, 1, 1.06], sat: 1.08, contrast: 1.07, vignette: 0.68,
  fireflies: 1, leaves: 0.3, mist: 0.2, shafts: 0.25, wind: 0.6, kite: 0, butterflies: 0, birds: 0,
};
const KEYS = [
  { h: 0, ...NIGHT },
  { h: 4.6, ...NIGHT, sunColor: '#9aa8e8', sunI: 0.6, hemiSky: '#4a5a8a', hemiGround: '#1a1a28', hemiI: 0.85, fog: '#2a3450', fogFar: 100, skyTop: '#141c40', skyHor: '#4a4a78', glow: '#3a2a50', stars: 0.6, clouds: 0.5, cloudCol: '#3a4060', exposure: 1.15, bloom: 0.9, threshold: 1.0, windows: 0.9, flash: 0.9, gain: [1, 1, 1.05], sat: 1.0, contrast: 1.05, vignette: 0.62, fireflies: 0.6, mist: 0.5, shafts: 0.2, wind: 0.4 },
  { h: 5.7, ...NIGHT, sunColor: '#ff9a7a', sunI: 1.6, hemiSky: '#8a90c8', hemiGround: '#3a3038', hemiI: 1.1, fog: '#b08a9a', fogNear: 30, fogFar: 120, skyTop: '#4a5a9a', skyHor: '#ffb08a', glow: '#ff8a6a', stars: 0.1, moonCol: '#ffffff', clouds: 0.6, cloudCol: '#f0a0a0', exposure: 1.05, bloom: 0.75, threshold: 1.15, lamps: 0.6, windows: 0.6, fires: 0.8, flash: 0.4, lift: [0.02, 0, 0.03], gain: [1.05, 0.98, 0.97], sat: 1.08, contrast: 1.03, vignette: 0.55, fireflies: 0.2, mist: 0.55, shafts: 0.9, wind: 0.5, birds: 0.5 },
  { h: 7.0, ...NIGHT, sunColor: '#ffe0b0', sunI: 3.0, hemiSky: '#a8c4ec', hemiGround: '#4a4630', hemiI: 1.5, fog: '#c8d0d8', fogNear: 34, fogFar: 150, skyTop: '#5a90d8', skyHor: '#d8e4f0', glow: '#ffe0b0', stars: 0, clouds: 0.6, cloudCol: '#ffffff', exposure: 1.0, bloom: 0.5, threshold: 1.4, lamps: 0, windows: 0.08, fires: 0.6, flash: 0, lift: [0.01, 0.01, 0.02], gain: [1.02, 1.01, 0.98], sat: 1.08, contrast: 1.03, vignette: 0.45, fireflies: 0, leaves: 0.7, mist: 0.25, shafts: 1, wind: 0.7, kite: 1, butterflies: 1, birds: 1 },
  { h: 9.5, ...NIGHT, sunColor: '#fff6ea', sunI: 3.4, hemiSky: '#b0d0f4', hemiGround: '#4a4a3a', hemiI: 1.7, fog: '#c4d4e4', fogNear: 40, fogFar: 170, skyTop: '#4a88dc', skyHor: '#cfe2f6', glow: '#fff6e0', stars: 0, clouds: 0.55, cloudCol: '#ffffff', exposure: 0.95, bloom: 0.45, threshold: 1.5, lamps: 0, windows: 0, fires: 0.5, flash: 0, lift: [0, 0.01, 0.02], gain: [0.98, 1, 1.01], sat: 1.07, contrast: 1.04, vignette: 0.4, fireflies: 0, leaves: 0.6, mist: 0.05, shafts: 0.6, wind: 0.8, kite: 1, butterflies: 1, birds: 1 },
  { h: 14.5, ...NIGHT, sunColor: '#fff2e0', sunI: 3.35, hemiSky: '#b0cef0', hemiGround: '#524a32', hemiI: 1.65, fog: '#c8d4e0', fogNear: 40, fogFar: 170, skyTop: '#4a86d8', skyHor: '#d6e2f2', glow: '#fff0d0', stars: 0, clouds: 0.6, cloudCol: '#ffffff', exposure: 0.96, bloom: 0.45, threshold: 1.5, lamps: 0, windows: 0, fires: 0.5, flash: 0, lift: [0, 0.01, 0.02], gain: [1.0, 1, 0.99], sat: 1.08, contrast: 1.04, vignette: 0.42, fireflies: 0, leaves: 0.7, mist: 0.05, shafts: 0.7, wind: 0.85, kite: 1, butterflies: 1, birds: 1 },
  { h: 16.6, ...NIGHT, sunColor: '#ffd08a', sunI: 3.3, hemiSky: '#b8cce6', hemiGround: '#5a4a2e', hemiI: 1.55, fog: '#d8b88c', fogNear: 34, fogFar: 150, skyTop: '#6aa0d8', skyHor: '#ffd49a', glow: '#ffb860', stars: 0, clouds: 0.75, cloudCol: '#fff0dc', exposure: 1.0, bloom: 0.55, threshold: 1.35, lamps: 0.25, windows: 0.45, fires: 0.6, flash: 0.15, lift: [0.01, 0.01, 0.02], gain: [1.04, 1, 0.93], sat: 1.14, contrast: 1.04, vignette: 0.5, fireflies: 0.1, leaves: 0.9, mist: 0.08, shafts: 1, wind: 0.9, kite: 1, butterflies: 0.6, birds: 0.8 },
  { h: 18.1, ...NIGHT, sunColor: '#ff8a4a', sunI: 2.2, hemiSky: '#9a88c0', hemiGround: '#3a2a2a', hemiI: 1.2, fog: '#b07868', fogNear: 30, fogFar: 130, skyTop: '#3a3a7a', skyHor: '#ff9a5a', glow: '#ff7a40', stars: 0.05, clouds: 0.7, cloudCol: '#ff9a7a', exposure: 1.02, bloom: 0.75, threshold: 1.1, lamps: 0.7, windows: 0.8, fires: 0.8, flash: 0.5, lift: [0.02, 0, 0.03], gain: [1.06, 0.97, 0.93], sat: 1.12, contrast: 1.05, vignette: 0.58, fireflies: 0.4, leaves: 0.8, mist: 0.12, shafts: 0.9, wind: 0.8, kite: 0.4, butterflies: 0.1, birds: 0.3 },
  { h: 19.2, ...NIGHT, sunColor: '#7a8ad8', sunI: 0.9, hemiSky: '#5a64a8', hemiGround: '#1e1a2a', hemiI: 0.9, fog: '#2a2a50', fogFar: 115, skyTop: '#141a48', skyHor: '#5a4a8a', glow: '#6a3a6a', stars: 0.5, clouds: 0.5, cloudCol: '#4a4070', exposure: 1.15, bloom: 0.95, flash: 0.9, lift: [0.01, 0, 0.05], gain: [1.02, 0.98, 1.06], sat: 1.06, contrast: 1.06, vignette: 0.65, fireflies: 0.9, leaves: 0.4, mist: 0.18, shafts: 0.3 },
  { h: 20.4, ...NIGHT },
  { h: 24, ...NIGHT },
];
const COLOR_KEYS = ['sunColor', 'hemiSky', 'hemiGround', 'fog', 'skyTop', 'skyHor', 'glow', 'moonCol', 'cloudCol'];
for (const k of KEYS) for (const c of COLOR_KEYS) k[c] = C(k[c]);
const NUM_KEYS = Object.keys(KEYS[0]).filter((k) => k !== 'h' && typeof KEYS[0][k] === 'number');
const ARR_KEYS = ['lift', 'gain'];

export const WEATHER_NAMES = { clear: 'Trời quang', rain: 'Mưa', storm: 'Mưa giông', fog: 'Sương mù', blood: 'Trăng máu' };
const WEATHER = {
  clear: { rain: 0, storm: 0, fog: 0, blood: 0 },
  rain: { rain: 0.75, storm: 0, fog: 0.1, blood: 0 },
  storm: { rain: 1, storm: 1, fog: 0.15, blood: 0 },
  fog: { rain: 0, storm: 0, fog: 1, blood: 0 },
  blood: { rain: 0, storm: 0, fog: 0.3, blood: 1 },
};
const sm = (t) => t * t * (3 - 2 * t);
const GREY_DAY = C('#7a8494'), GREY_NIGHT = C('#1c242e'), FOG_DAY = C('#9aa4ac'), FOG_NIGHT = C('#3e4c48');
const BLOOD_SUN = C('#ff5032'), BLOOD_FOG = C('#2c0c10'), BLOOD_SKY = C('#5a1610'), BLOOD_TOP = C('#1a0608'), BLOOD_HEMI = C('#4a2232');

export class Atmos {
  constructor() {
    this.hour = 17;
    this.kind = 'clear';
    this.w = { ...WEATHER.clear };
    this.wt = { ...WEATHER.clear };
    this.rate = 0.12;
    this.out = { sunDir: new THREE.Vector3(), sunPos: new THREE.Vector2(), moonPos: new THREE.Vector2() };
    for (const c of COLOR_KEYS) this.out[c] = new THREE.Color();
    for (const a of ARR_KEYS) this.out[a] = [0, 0, 0];
  }
  setWeather(kind, instant = false) {
    this.kind = kind;
    Object.assign(this.wt, WEATHER[kind]);
    if (instant) Object.assign(this.w, WEATHER[kind]);
  }
  get weatherName() { return WEATHER_NAMES[this.kind]; }
  isNight(h = this.hour) { const x = ((h % 24) + 24) % 24; return x >= 19 || x < 5.5; }
  update(dt) {
    for (const k in this.w) {
      const d = this.wt[k] - this.w[k];
      this.w[k] += Math.sign(d) * Math.min(Math.abs(d), dt * this.rate);
    }
    const h = ((this.hour % 24) + 24) % 24;
    let i = 0;
    while (i < KEYS.length - 2 && KEYS[i + 1].h <= h) i++;
    const a = KEYS[i], b = KEYS[i + 1];
    const t = sm((h - a.h) / (b.h - a.h));
    const A = this.out;
    for (const k of NUM_KEYS) A[k] = a[k] + (b[k] - a[k]) * t;
    for (const k of COLOR_KEYS) A[k].copy(a[k]).lerp(b[k], t);
    for (const k of ARR_KEYS) for (let j = 0; j < 3; j++) A[k][j] = a[k][j] + (b[k][j] - a[k][j]) * t;
    // quỹ đạo mặt trời (5h30 → 19h30) và mặt trăng (19h30 → 5h30)
    const day = h >= 5.5 && h < 19.5;
    const tt = day ? (h - 5.5) / 14 : (((h - 19.5) + 24) % 24) / 10;
    const elev = Math.sin(Math.PI * tt);
    if (day) A.sunDir.set(-Math.cos(Math.PI * tt) * 0.8, 0.1 + elev * 0.9, -0.5).normalize();
    else A.sunDir.set(-Math.cos(Math.PI * tt) * 0.6, 0.25 + elev * 0.75, -0.6).normalize();
    const edge = Math.min(Math.abs(h - 5.5), Math.abs(h - 19.5), Math.abs(h + 24 - 19.5), Math.abs(h - 24 - 5.5));
    A.sunI *= sm(Math.min(1, edge / 0.6));
    A.sunPos.set(-Math.cos(Math.PI * (day ? tt : -1)) * 90, day ? 1 + elev * 26 : -50);
    A.moonPos.set(-Math.cos(Math.PI * (day ? -1 : tt)) * 70, day ? -50 : 4 + elev * 20);
    A.sunVis = day ? 1 : 0;
    A.moon = day ? 0 : 1;
    // thời tiết
    const W = this.w, night = this.isNight(h) ? 1 : 0;
    const rain = W.rain;
    A.rain = rain;
    A.wet = Math.min(1, rain * 1.3);
    A.lightning = W.storm;
    A.sunI *= 1 - 0.7 * rain;
    A.hemiI *= 1 - 0.18 * rain;
    const grey = night ? GREY_NIGHT : GREY_DAY;
    A.hemiSky.lerp(grey, rain * 0.5);
    A.fog.lerp(night ? GREY_NIGHT : grey, rain * 0.6).lerp(night ? FOG_NIGHT : FOG_DAY, W.fog * 0.75);
    A.fogNear *= 1 - 0.25 * rain - 0.35 * W.fog;
    A.fogFar *= 1 - 0.3 * rain - 0.5 * W.fog;
    A.clouds = Math.max(A.clouds, rain);
    A.cloudCol.lerp(grey, rain * 0.8);
    A.skyTop.lerp(grey, rain * 0.75).lerp(A.fog, W.fog * 0.6);
    A.skyHor.lerp(grey, rain * 0.7).lerp(A.fog, W.fog * 0.7);
    A.glow.multiplyScalar(1 - rain * 0.85);
    A.stars *= 1 - Math.max(rain, W.fog * 0.7);
    A.moon *= 1 - rain * 0.9;
    A.sunVis *= 1 - rain * 0.9;
    A.sat *= 1 - 0.14 * rain - 0.12 * W.fog;
    A.exposure *= 1 + rain * 0.04;
    A.mist = Math.max(A.mist, W.fog);
    A.shafts = Math.max(A.shafts * (1 - rain), W.fog * 0.8);
    A.fireflies *= 1 - rain;
    A.butterflies *= 1 - rain;
    A.birds *= 1 - rain * 0.8;
    A.kite *= 1 - rain;
    A.wind += rain * 0.9;
    A.lamps = Math.max(A.lamps, rain * 0.6 * (1 - A.sunI / 4));
    A.ash = W.blood * night;
    const bl = W.blood * night;
    if (bl > 0) {
      A.sunColor.lerp(BLOOD_SUN, bl); A.moonCol.lerp(BLOOD_SUN, bl);
      A.fog.lerp(BLOOD_FOG, bl * 0.8); A.skyHor.lerp(BLOOD_SKY, bl); A.skyTop.lerp(BLOOD_TOP, bl);
      A.hemiSky.lerp(BLOOD_HEMI, bl * 0.7);
      A.gain = [A.gain[0] + 0.04 * bl, A.gain[1] - 0.05 * bl, A.gain[2] - 0.08 * bl];
      A.sunI += 0.3 * bl;
    }
    A.id = this.kind;
    A.night = night;
    return A;
  }
}

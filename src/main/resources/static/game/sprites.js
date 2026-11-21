// Sprite nhân vật & vật thể nhỏ, vẽ bằng code theo phong cách chibi 2 đầu.
import { Pix, PPU, makeRng, tex, ramp, fbm, vnoise } from './pixel.js';

export const DIR_ROW = { down: 0, left: 1, right: 2, up: 3 };

const SPEC = {
  normal: { fw: 24, fh: 32, cx: 12, feet: 31, shoeH: 2, legTop: 26, legW: 3, legGap: 2, torsoTop: 16, torsoBot: 25, torsoHW: 5, belly: 0, headCy: 9.5, headRx: 7.5, headRy: 7, armW: 2 },
  thin: { fw: 24, fh: 32, cx: 12, feet: 31, shoeH: 2, legTop: 26, legW: 2, legGap: 2, torsoTop: 16, torsoBot: 25, torsoHW: 4, belly: 0, headCy: 10, headRx: 7, headRy: 6.5, armW: 2 },
  brute: { fw: 32, fh: 40, cx: 16, feet: 39, shoeH: 2, legTop: 33, legW: 5, legGap: 2, torsoTop: 17, torsoBot: 32, torsoHW: 9, belly: 2, headCy: 10.5, headRx: 7, headRy: 6.5, armW: 4 },
  fat: { fw: 32, fh: 36, cx: 16, feet: 35, shoeH: 2, legTop: 30, legW: 4, legGap: 2, torsoTop: 15, torsoBot: 29, torsoHW: 10, belly: 5, headCy: 9, headRx: 6.5, headRy: 6, armW: 3 },
};

export const PAL_SURVIVOR = {
  outline: '#1d1018',
  skin: '#f6cba2', skinS: '#d9977a', skinL: '#ffe5cc',
  hair: '#b8442c', hairS: '#7a2620', hairL: '#ec8248',
  eye: '#2b1a33', eyeHi: '#ffffff', blush: '#f2918a', mouth: '#a8483e',
  top: '#d99b4a', topS: '#a5692c', topL: '#f6c674',
  scarf: '#3d8a63', scarfS: '#285c43',
  belt: '#4a2f22',
  pants: '#3d4a6b', pantsS: '#29304a',
  shoe: '#55372a', shoeS: '#33201a',
  pack: '#7a6a44', packS: '#54482c', packL: '#a0905e',
  gun: '#26262e', gunL: '#6a6a7c', wood: '#7a4a2a',
};

const ZSKIN = [['#8ea877', '#627d55', '#b4c99a'], ['#9aa58a', '#6d7a60', '#bdc8ab'], ['#7f9a7a', '#56705a', '#a6bf9e'], ['#a0a88c', '#727a62', '#c2c8ae']];
const ZTOP = [['#6b4a4a', '#4a3030', '#8f6767'], ['#4a5a72', '#33404f', '#6a7d9c'], ['#7a7250', '#575034', '#9c946e'], ['#5a6a4a', '#3e4a32', '#7c8c64'], ['#8a8a8a', '#5f5f5f', '#adadad'], ['#7a3a2a', '#52261c', '#9c5a46']];
const ZPANTS = [['#3a3a46', '#26262e'], ['#4a3a2a', '#30261c'], ['#2e3a4a', '#1e2630']];

export function zombiePalette(seed, kind) {
  const r = makeRng(seed * 7919 + 13);
  const sk = r.pick(ZSKIN), tp = r.pick(ZTOP), pn = r.pick(ZPANTS);
  return {
    outline: '#15130f',
    skin: sk[0], skinS: sk[1], skinL: sk[2],
    hair: r.pick(['#2e2a22', '#4a3a2a', '#5a5a52', '#3a2a22']), hairS: '#1e1a16', hairL: '#6a5e4e',
    eye: '#1e1418', glowEye: kind === 'brute' ? '#ffa020' : kind === 'runner' ? '#ff2a1a' : '#ff4a26',
    mouth: '#2a1218', blood: '#7e1212', bloodL: '#a51c16',
    top: kind === 'brute' ? '#4a5a6a' : tp[0], topS: kind === 'brute' ? '#334050' : tp[1], topL: kind === 'brute' ? '#66788a' : tp[2],
    belt: '#2e241c',
    pants: pn[0], pantsS: pn[1],
    shoe: '#3a2a22', shoeS: '#221812',
    seed,
  };
}

function h3(x, y, s) {
  let h = (x * 73856093) ^ (y * 19349663) ^ (s * 83492791);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// vẽ 1 khung nhân vật (hướng dir, khung bước frame 0..3) vào atlas P tại (ox, oy)
function figure(P, ox, oy, s, dir, frame, pal, o) {
  const mirror = dir === 'left';
  const view = mirror ? 'right' : dir;
  const W = s.fw, HH = s.fh;
  const put = (x, y, c) => {
    if (!c) return;
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || y < 0 || x >= W || y >= HH) return;
    P.set(ox + (mirror ? W - 1 - x : x), oy + y, c);
  };
  const glow = (x, y, c) => {
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || y < 0 || x >= W || y >= HH) return;
    const gx = ox + (mirror ? W - 1 - x : x);
    P.set(gx, oy + y, c); P.glow(gx, oy + y, c);
  };
  const rect = (x0, y0, x1, y1, c) => {
    for (let y = Math.floor(y0); y <= Math.floor(y1); y++)
      for (let x = Math.floor(x0); x <= Math.floor(x1); x++) put(x, y, typeof c === 'function' ? c(x, y) : c);
  };
  const ell = (cx, cy, rx, ry, c) => {
    for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++)
      for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
        const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry;
        if (nx * nx + ny * ny <= 1) put(x, y, typeof c === 'function' ? c(nx, ny, x, y) : c);
      }
  };
  const sh3 = (base, dark, light, k1 = 0.45, k2 = -0.6) => (nx, ny) => {
    const d = nx * 0.55 + ny * 0.85;
    return d > k1 ? dark : d < k2 ? light : base;
  };

  const Z = !!o.zombie;
  const kind = o.kind || 'survivor';
  const seed = pal.seed || 1;
  const by = (frame & 1) ? 1 : 0;
  const tilt = Z && kind !== 'brute' ? [0, 1, 0, -1][frame] : 0;
  const cx = s.cx;
  const t0 = s.torsoTop + by, t1 = s.torsoBot + by, hw = s.torsoHW;
  const legBot = s.feet - s.shoeH;
  const hcy = s.headCy + by + (Z && kind === 'runner' ? 1 : 0);
  const stains = [];
  if (Z) {
    const sr = makeRng(seed * 31 + (view === 'up' ? 5 : view === 'right' ? 9 : 1));
    const n = kind === 'brute' ? 3 : 2;
    for (let i = 0; i < n; i++) stains.push([sr.range(-hw + 1, hw - 2), sr.range(1, s.torsoBot - s.torsoTop - 2), sr.range(1.2, kind === 'brute' ? 3.2 : 2.2)]);
  }

  // ---------- CHÂN ----------
  const leg = (hipX, footX, lift, near) => {
    const col = near ? pal.pants : pal.pantsS;
    const n = legBot - lift - s.legTop;
    for (let y = s.legTop; y <= legBot - lift; y++) {
      const t = n > 0 ? (y - s.legTop) / n : 0;
      const x = Math.round(hipX + (footX - hipX) * t);
      for (let i = 0; i < s.legW; i++) put(x + i, y, i === s.legW - 1 && near ? pal.pantsS : col);
    }
    const sy0 = legBot + 1 - lift, sy1 = s.feet - lift;
    return { sy0, sy1 };
  };
  if (view === 'down' || view === 'up') {
    const lx = cx - s.legGap / 2 - s.legW, rx = cx + s.legGap / 2;
    const liftL = frame === 1 ? 1 : 0, liftR = frame === 3 ? 1 : 0;
    leg(lx, lx, liftL, true); leg(rx, rx, liftR, true);
    rect(lx - (view === 'down' ? 1 : 0), legBot + 1 - liftL, lx + s.legW - 1, s.feet - liftL, (x, y) => (y === s.feet - liftL ? pal.shoeS : pal.shoe));
    rect(rx, legBot + 1 - liftR, rx + s.legW - (view === 'down' ? 0 : 1), s.feet - liftR, (x, y) => (y === s.feet - liftR ? pal.shoeS : pal.shoe));
  } else {
    const hip = cx - Math.ceil(s.legW / 2);
    const drawSide = (footX, lift, near) => {
      leg(hip, footX, lift, near);
      rect(footX, legBot + 1 - lift, footX + s.legW + 1, s.feet - lift, (x, y) => (y === s.feet - lift ? pal.shoeS : near ? pal.shoe : pal.shoeS));
    };
    if (frame === 0 || frame === 2) { drawSide(hip - 1, 0, false); drawSide(hip + 1, 0, true); }
    else if (frame === 1) { drawSide(hip - 3, 1, false); drawSide(hip + 3, 0, true); }
    else { drawSide(hip + 3, 0, false); drawSide(hip - 3, 1, true); }
  }

  // ---------- THÂN ----------
  const side = view === 'right';
  const thw = side ? hw - 1 : hw;
  for (let y = t0; y <= t1; y++) {
    const bul = s.belly ? Math.round(s.belly * Math.sin(Math.PI * (y - t0) / (t1 - t0))) : 0;
    const shrink = y === t0 ? 1 : 0;
    const x0 = cx - thw + shrink - (side ? 0 : bul), x1 = cx + thw - 1 - shrink + bul;
    for (let x = x0; x <= x1; x++) {
      let c = pal.top;
      if (x >= x1 - 1) c = pal.topS;
      else if (x <= x0 + 1 && y > t0) c = pal.topL;
      if (y === t1) c = pal.belt;
      if (Z) {
        const hx = x - cx, hy = y - t0;
        const r = h3(Math.floor(hx / 2), Math.floor(hy / 2), seed + (view === 'up' ? 7 : view === 'right' ? 3 : 0));
        if (r < 0.09 && y < t1) c = (hx + hy) & 1 ? pal.skinS : pal.skin; // áo rách
        for (const st of stains) {
          const d = ((hx - st[0]) / st[2]) ** 2 + ((hy - st[1]) / (st[2] * 0.8)) ** 2;
          if (d < 1 && y < t1) c = d < 0.35 ? pal.blood : (h3(hx, hy, seed) < 0.6 ? pal.blood : c); // vết máu loang
        }
      }
      put(x, y, c);
    }
  }
  if (!Z && view === 'down') {
    rect(cx - hw + 1, t0, cx + hw - 2, t0 + 1, (x, y) => (y === t0 + 1 && x > cx ? pal.scarfS : pal.scarf));
    rect(cx + 2, t0 + 2, cx + 3, t0 + 4, (x) => (x === cx + 3 ? pal.scarfS : pal.scarf));
    rect(cx - 1, t0 + 2, cx - 1, t1 - 1, pal.topS);
    put(cx - 3, t1 - 2, pal.topS); put(cx - 4, t1 - 2, pal.topS);
  }
  if (!Z && view === 'up') {
    rect(cx - hw + 1, t0, cx + hw - 2, t0, pal.scarf);
    rect(cx - 4, t0 + 1, cx + 3, t1 - 2, (x, y) => (y === t0 + 1 ? pal.packL : y === t1 - 2 || x === cx + 3 ? pal.packS : pal.pack));
    rect(cx - 3, t0 + 4, cx + 2, t0 + 4, pal.packS);
    put(cx - 1, t0 + 5, '#c8a050');
  }
  if (!Z && side) {
    rect(cx - thw, t0, cx + thw - 2, t0 + 1, pal.scarf);
    rect(cx - thw - 3, t0 + 1, cx - thw, t1 - 2, (x, y) => (y === t0 + 1 ? pal.packL : x === cx - thw - 3 || y === t1 - 2 ? pal.packS : pal.pack));
  }

  // ---------- TAY ----------
  const aw = s.armW;
  if (view === 'down' || view === 'up') {
    const lx0 = cx - hw - aw - (s.belly ? 1 : 0), rx0 = cx + hw + (s.belly ? 1 : 0);
    if (Z && view === 'down') {
      // tay giơ về phía trước (về phía camera): bàn tay ở ngang ngực
      rect(lx0 + 1, t0 + 1, lx0 + aw, t0 + 3, pal.topS);
      rect(rx0 - 1, t0 + 1, rx0 + aw - 2, t0 + 3, pal.topS);
      const hy = t0 + 3 + (frame === 1 ? 1 : 0), hy2 = t0 + 3 + (frame === 3 ? 1 : 0);
      rect(lx0 + 1, hy, lx0 + aw + 1, hy + 2, (x, y) => (y === hy + 2 ? pal.skinS : pal.skin));
      rect(rx0 - 2, hy2, rx0 + aw - 2, hy2 + 2, (x, y) => (y === hy2 + 2 ? pal.skinS : pal.skin));
      rect(lx0 + 1, hy + 3, lx0 + aw + 1, hy + 3, pal.outline);
      rect(rx0 - 2, hy2 + 3, rx0 + aw - 2, hy2 + 3, pal.outline);
    } else if (Z) {
      rect(lx0, t0 + 1, lx0 + aw - 1, t0 + 3, pal.topS);
      rect(rx0, t0 + 1, rx0 + aw - 1, t0 + 3, pal.topS);
    } else {
      const swing = frame === 1 ? 1 : frame === 3 ? -1 : 0;
      rect(lx0, t0 + 1, lx0 + aw - 1, t0 + 5 + swing, (x) => (x === lx0 ? pal.topS : pal.top));
      rect(lx0, t0 + 6 + swing, lx0 + aw - 1, t0 + 7 + swing, pal.skin);
      rect(rx0, t0 + 1, rx0 + aw - 1, t0 + 5 - swing, (x) => (x === rx0 + aw - 1 ? pal.topS : pal.top));
      rect(rx0, t0 + 6 - swing, rx0 + aw - 1, t0 + 7 - swing, pal.skin);
      if (view === 'down' && (o.weapon === 'fist')) {
        // tay không: không cầm gì
      } else if (view === 'down' && (o.weapon === 'club' || o.weapon === 'spear')) {
        const L2 = o.weapon === 'spear' ? 14 : 8;
        for (let k = 0; k < L2; k++) put(lx0 - 1, t0 + 7 + swing - k + (o.weapon === 'spear' ? 4 : 1), k === L2 - 1 && o.weapon === 'spear' ? '#d8d8e0' : '#8a5a32');
      } else if (view === 'down' && o.weapon === 'bow') {
        for (let k = 0; k < 9; k++) put(lx0 - 2 + (k > 1 && k < 7 ? -1 : 0), t0 + 3 + swing + k, '#8a5a2a');
      } else if (view === 'down') {
        const gl = o.weapon === 'shotgun' ? 5 : o.weapon === 'smg' ? 4 : 3;
        rect(lx0 - 1, t0 + 7 + swing, lx0, t0 + 7 + swing + gl, (x, y) => (x === lx0 - 1 ? pal.gunL : pal.gun));
      }
    }
  } else {
    const sy = t0 + 2;
    if (Z) {
      const bob = frame === 1 ? -1 : frame === 3 ? 1 : 0;
      const reach = kind === 'brute' ? 8 : 7;
      rect(cx - 1, sy - 1 + bob, cx + 2, sy + aw - 2 + bob, pal.topS);
      rect(cx + 3, sy - 1 + bob, cx + reach - 1, sy + aw - 2 + bob, pal.skinS);
      rect(cx - 1, sy + 1 - bob, cx + 3, sy + aw - bob, (x, y) => (y === sy + aw - bob ? pal.topS : pal.top));
      rect(cx + 4, sy + 1 - bob, cx + reach, sy + aw - bob, (x, y) => (y === sy + aw - bob ? pal.skinS : pal.skin));
    } else {
      rect(cx - 2, sy, cx + 3, sy + 1, (x, y) => (y === sy + 1 ? pal.topS : pal.top));
      rect(cx + 4, sy, cx + 5, sy + 1, pal.skin);
      const w = o.weapon;
      const gl = w === 'shotgun' ? 9 : w === 'smg' ? 6 : 4;
      if (w === 'knife') { rect(cx + 6, sy, cx + 9, sy, pal.gunL); put(cx + 10, sy, pal.gunL); put(cx + 5, sy, pal.gun); put(cx + 5, sy + 1, pal.gun); }
      else if (w === 'fist') { put(cx + 6, sy, pal.skinS); put(cx + 6, sy + 1, pal.skinS); }
      else if (w === 'club') {
        // gậy giơ chéo lên trước mặt
        for (let k = 0; k < 8; k++) { put(cx + 5 + k * 0.6, sy - k, k > 4 ? '#6a4a2a' : '#8a5a32'); put(cx + 6 + k * 0.6, sy - k, k > 4 ? '#5a3e22' : '#7a5030'); }
        put(cx + 9, sy - 6, '#9a9aa0'); put(cx + 10, sy - 7, '#9a9aa0');
      } else if (w === 'spear') {
        // giáo dựng đứng, mũi sắt phía trên
        for (let k = -10; k <= 4; k++) put(cx + 6, sy + k, '#8a6a42');
        rect(cx + 5, sy - 13, cx + 7, sy - 11, '#c8c8d0'); put(cx + 6, sy - 14, '#e8e8f0');
        put(cx + 5, sy, pal.skin);
      }
      else if (w === 'bow') {
        // cung gỗ dựng đứng trước người + dây cung
        for (let k = -6; k <= 6; k++) put(cx + 7 + (Math.abs(k) < 4 ? 1 : 0) - (Math.abs(k) > 5 ? 1 : 0), sy + k, k === 0 ? '#3a2414' : '#8a5a2a');
        for (let k = -5; k <= 5; k++) put(cx + 6, sy + k, '#e8e0d0');
        put(cx + 5, sy, pal.gun);
      } else {
      rect(cx + 5, sy - 1, cx + 5 + gl, sy, (x, y) => (y === sy - 1 ? pal.gunL : pal.gun));
      rect(cx + 5, sy + 1, cx + 6, sy + 2, pal.gun);
      }
      if (w === 'shotgun') { rect(cx + 8, sy + 1, cx + 11, sy + 1, pal.wood); rect(cx + 1, sy - 1, cx + 4, sy - 1, pal.wood); put(cx + 9, sy + 2, pal.skin); }
      if (w === 'smg') { rect(cx + 8, sy + 1, cx + 9, sy + 3, pal.gun); put(cx + 10, sy + 1, pal.skin); }
    }
  }

  // ---------- ĐẦU ----------
  const hx = cx + tilt * 0.5 + (side ? 0.5 + (Z ? 1 : 0) : 0);
  const rx = side ? s.headRx - 0.5 : s.headRx, ry = s.headRy;
  const hairSh = (nx, ny) => {
    if (ny < -0.5 && ny > -0.8 && nx > -0.65 && nx < 0.15) return pal.hairL;
    if (nx * 0.6 + ny * 0.8 > 0.45) return pal.hairS;
    return pal.hair;
  };
  const sparse = (x, y) => !Z || h3(Math.floor((x - hx + 20) / 2), Math.floor((y - hcy + 20) / 2), seed + 31) < 0.5;
  const ey = Math.floor(hcy + 1);
  if (view === 'up') {
    ell(hx, hcy, rx, ry, Z ? sh3(pal.skin, pal.skinS, pal.skinL) : hairSh);
    ell(hx, hcy - 1.5, rx + 1, ry + 0.5, (nx, ny, x, y) => (y <= hcy - 1 && sparse(x, y) ? hairSh(nx, ny) : null));
    if (!Z) for (let y = ey; y <= ey + 4; y++) { put(hx - rx - 0.5, y, pal.hairS); put(hx + rx - 0.5, y, pal.hairS); }
  } else if (view === 'down') {
    ell(hx, hcy, rx, ry, sh3(pal.skin, pal.skinS, pal.skinL));
    if (Z) for (let i = 0; i < 6; i++) { const a = h3(i, 1, seed), b = h3(i, 2, seed); put(hx - 5 + a * 10, hcy - 3 + b * 7, pal.skinS); }
    ell(hx, hcy - 1.5, rx + 1, ry + 0.5, (nx, ny, x, y) => (y <= hcy - 2 && sparse(x, y) ? hairSh(nx, ny) : null));
    const yb = Math.floor(hcy - 1.5), xl = Math.floor(hx - rx);
    if (!Z) {
      for (let x = xl; x <= Math.ceil(hx + rx); x++) {
        const k = x - xl;
        if (k % 4 !== 3) put(x, yb, pal.hair);
        if (k % 4 === 0 || k % 4 === 1) put(x, yb + 1, k % 4 === 0 ? pal.hairS : pal.hair);
      }
      for (let y = yb; y <= yb + 5; y++) {
        const wd = y > yb + 3 ? 1 : 2;
        for (let i = 0; i <= wd; i++) { put(xl - 1 + i, y, i === 0 ? pal.hairS : pal.hair); put(Math.ceil(hx + rx) - i, y, i === 0 ? pal.hairS : pal.hair); }
      }
    }
    const exL = Math.floor(hx - 5), exR = Math.floor(hx + 3);
    if (Z) {
      rect(exL, ey, exL + 1, ey + 1, pal.eye); rect(exR, ey, exR + 1, ey + 1, pal.eye);
      glow(exL + 1, ey, pal.glowEye); glow(exR, ey, pal.glowEye);
      rect(hx - 2, ey + 3, hx + 1, ey + 4, pal.mouth);
      put(hx - 1, ey + 3, '#e2dcc0'); put(hx + 1, ey + 3, '#e2dcc0');
      put(hx, ey + 5, pal.blood);
    } else {
      for (const ex of [exL, exR]) {
        rect(ex, ey, ex + 1, ey + 2, pal.eye);
        put(ex, ey, pal.eyeHi);
        put(ex + 1, ey + 2, '#5a3a6a');
      }
      put(exL - 1, ey + 3, pal.blush); put(exL, ey + 3, pal.blush);
      put(exR + 1, ey + 3, pal.blush); put(exR + 2, ey + 3, pal.blush);
      put(hx - 1, ey + 4, pal.mouth); put(hx, ey + 4, pal.mouth);
    }
  } else {
    ell(hx, hcy, rx, ry, sh3(pal.skin, pal.skinS, pal.skinL));
    ell(hx - 0.5, hcy - 1, rx + 0.5, ry + 0.5, (nx, ny, x, y) => ((nx < 0.12 || ny < -0.42) && sparse(x, y) ? hairSh(nx, ny) : null));
    const ex = Math.floor(hx + 3);
    if (!Z) {
      const yb = Math.floor(hcy - 1.5);
      for (let x = Math.floor(hx); x <= Math.floor(hx + rx); x++) { if ((x - Math.floor(hx)) % 3 !== 2) put(x, yb, pal.hair); }
      put(Math.floor(hx + 1), yb + 1, pal.hairS); put(Math.floor(hx + 4), yb + 1, pal.hair);
      for (let y = yb; y <= yb + 6; y++) { put(hx - rx, y, pal.hairS); put(hx - rx + 1, y, pal.hair); }
      rect(ex, ey, ex + 1, ey + 2, pal.eye); put(ex, ey, pal.eyeHi); put(ex + 1, ey + 2, '#5a3a6a');
      put(ex + 1, ey + 3, pal.blush); put(ex + 2, ey + 3, pal.blush);
      put(ex + 3, ey + 4, pal.mouth);
      put(hx - 1, ey + 1, pal.skinS); put(hx - 1, ey + 2, pal.skinS);
    } else {
      rect(ex, ey, ex + 1, ey + 1, pal.eye); glow(ex + 1, ey, pal.glowEye);
      rect(ex + 2, ey + 3, ex + 4, ey + 4, pal.mouth); put(ex + 3, ey + 3, '#e2dcc0');
      put(ex + 3, ey + 5, pal.blood);
    }
  }
}

function buildAtlas(spec, pal, o) {
  const P = new Pix(spec.fw * 4, spec.fh * 4, { emissive: !!o.zombie });
  ['down', 'left', 'right', 'up'].forEach((d, row) => {
    for (let f = 0; f < 4; f++) {
      figure(P, f * spec.fw, row * spec.fh, spec, d, f, pal, o);
      P.outline(pal.outline, f * spec.fw, row * spec.fh, spec.fw, spec.fh);
    }
  });
  return {
    map: tex(P),
    emissiveMap: o.zombie ? tex(P.emissiveCanvas()) : null,
    w: spec.fw / PPU, h: spec.fh / PPU, cols: 4, rows: 4,
    canvas: P.canvas(),
  };
}

// bảng màu người sống sót cho từng người chơi co-op
const SURVIVOR_VARIANTS = [
  {},
  { hair: '#2a2a32', hairS: '#16161c', hairL: '#4a4a58', top: '#3a7ac8', topS: '#2a5a96', topL: '#6aa0e8', scarf: '#c8a030', scarfS: '#8a6a1a' },
  { hair: '#e8c86a', hairS: '#b8943a', hairL: '#fff0a8', top: '#58a048', topS: '#3a7a30', topL: '#88c870', scarf: '#c83a3a', scarfS: '#8a2424' },
  { hair: '#6a3a2a', hairS: '#4a2418', hairL: '#8a5a44', top: '#a84ac8', topS: '#7a2a96', topL: '#c88ae8', scarf: '#e8e0d0', scarfS: '#a8a090' },
];
export const PLAYER_COLORS = ['#f2c14e', '#6aa0e8', '#88c870', '#c88ae8'];
function survivorSet(pal) {
  return {
    knife: buildAtlas(SPEC.normal, { ...pal, gun: '#4a2e1e', gunL: '#dce0e8' }, { weapon: 'knife' }),
    pistol: buildAtlas(SPEC.normal, pal, { weapon: 'pistol' }),
    shotgun: buildAtlas(SPEC.normal, pal, { weapon: 'shotgun' }),
    smg: buildAtlas(SPEC.normal, pal, { weapon: 'smg' }),
    bow: buildAtlas(SPEC.normal, pal, { weapon: 'bow' }),
    fist: buildAtlas(SPEC.normal, pal, { weapon: 'fist' }),
    club: buildAtlas(SPEC.normal, pal, { weapon: 'club' }),
    spear: buildAtlas(SPEC.normal, pal, { weapon: 'spear' }),
  };
}
// bộ hình của từng nhân vật chơi được (bảng màu riêng)
const charCache = [];
export function charSprites(i, pal) {
  if (!charCache[i]) charCache[i] = survivorSet({ ...PAL_SURVIVOR, ...pal });
  return charCache[i];
}
// chân dung nhỏ cho màn chọn nhân vật (khung nhìn thẳng, đứng yên)
export function charPortrait(i, pal, scale = 4) {
  const a = charSprites(i, pal).fist;
  const fw = Math.round(a.w * PPU), fh = Math.round(a.h * PPU);
  const c = document.createElement('canvas'); c.width = fw * scale; c.height = fh * scale;
  const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
  g.drawImage(a.canvas, 0, 0, fw, fh, 0, 0, fw * scale, fh * scale);
  return c;
}
const playerCache = [];
export function playerSprites(i) {
  const k = i % 4;
  if (!playerCache[k]) playerCache[k] = survivorSet({ ...PAL_SURVIVOR, ...SURVIVOR_VARIANTS[k] });
  return playerCache[k];
}
export function makeCharacterSprites() {
  const player = playerSprites(0);
  const uni = (seed, top, pants) => ({ ...zombiePalette(seed, 'walker'), top: top[0], topS: top[1], topL: top[2], pants: pants[0], pantsS: pants[1] });
  const zombies = {
    walker: [1, 2, 3, 4].map((s) => buildAtlas(SPEC.normal, zombiePalette(s, 'walker'), { zombie: true, kind: 'walker' })),
    runner: [11, 12].map((s) => buildAtlas(SPEC.thin, zombiePalette(s, 'runner'), { zombie: true, kind: 'runner' })),
    brute: [21].map((s) => buildAtlas(SPEC.brute, zombiePalette(s, 'brute'), { zombie: true, kind: 'brute' })),
    cop: [31, 32].map((s) => buildAtlas(SPEC.normal, uni(s, ['#2a3a5a', '#1a2640', '#4a5a7a'], ['#1e2230', '#12141e']), { zombie: true, kind: 'walker' })),
    soldier: [41, 42].map((s) => buildAtlas(SPEC.normal, uni(s, ['#4a5a3a', '#34402a', '#66764e'], ['#3a4a2e', '#28321e']), { zombie: true, kind: 'walker' })),
    // zombie đặc biệt
    bloater: [buildAtlas(SPEC.fat, { ...zombiePalette(51, 'brute'), skin: '#a8b060', skinS: '#7a8240', skinL: '#c8d080', top: '#c8c0a0', topS: '#9a9478', topL: '#e0d8b8', glowEye: '#d8ff4a', blood: '#6a8a1a', bloodL: '#9ac83a' }, { zombie: true, kind: 'brute' })],
    spitter: [buildAtlas(SPEC.thin, { ...zombiePalette(61, 'runner'), skin: '#8ab070', skinS: '#5a7a48', skinL: '#a8cc8a', top: '#3a4a3a', topS: '#28322a', topL: '#4e604e', glowEye: '#7aff4a', mouth: '#5aff3a', blood: '#3a8a1a', bloodL: '#6ad83a' }, { zombie: true, kind: 'runner' })],
    pouncer: [buildAtlas(SPEC.thin, { ...zombiePalette(71, 'runner'), top: '#2a2a30', topS: '#1a1a1e', topL: '#3e3e46', pants: '#26262c', pantsS: '#18181c', hair: '#1a1a1e', glowEye: '#ff2a1a' }, { zombie: true, kind: 'runner' })],
    charger: [buildAtlas(SPEC.brute, { ...zombiePalette(81, 'brute'), top: '#7a2a22', topS: '#5a1a16', topL: '#9a3a2e', glowEye: '#ff6a1a' }, { zombie: true, kind: 'brute' })],
    weeper: [buildAtlas(SPEC.thin, { ...zombiePalette(91, 'runner'), skin: '#e8e4e0', skinS: '#b8b0b0', skinL: '#ffffff', hair: '#f0f0f0', hairS: '#c8c8c8', hairL: '#ffffff', top: '#d8d4d0', topS: '#a8a4a0', topL: '#f0ece8', pants: '#c8c4c0', pantsS: '#a8a4a0', glowEye: '#ff3a3a' }, { zombie: true, kind: 'runner' })],
  };
  return { player, zombies };
}

// ---------- biểu tượng vật phẩm 16x16 (HUD, túi đồ) ----------
export function makeItemIcons() {
  const N = 45, P = new Pix(16 * N, 16);
  const at = (i) => (x, y, w, h, c) => P.rect(i * 16 + x, y, w, h, c);
  // 0 đạn 9mm
  { const r = at(0); r(2, 7, 12, 7, '#4f5a2c'); r(2, 7, 12, 1, '#6c7a3c'); for (let i = 0; i < 4; i++) { r(3 + i * 3, 2, 2, 5, '#d8b050'); r(3 + i * 3, 2, 2, 1, '#fff0b0'); } r(5, 9, 6, 2, '#d8c070'); }
  // 1 đạn ghém
  { const r = at(1); for (let i = 0; i < 3; i++) { r(2 + i * 4, 3, 3, 9, '#c8281e'); r(2 + i * 4, 3, 1, 9, '#e84a3a'); r(2 + i * 4, 11, 3, 3, '#d8b050'); } }
  // 2 băng gạc
  { const r = at(2); r(2, 5, 12, 7, '#ece8e0'); r(2, 5, 12, 1, '#ffffff'); r(3, 7, 10, 1, '#c8c4bc'); r(3, 9, 10, 1, '#c8c4bc'); r(11, 5, 3, 7, '#d8d4cc'); }
  // 3 hộp cứu thương
  { const r = at(3); r(1, 4, 14, 10, '#e8e4dc'); r(1, 4, 14, 1, '#ffffff'); r(6, 2, 4, 2, '#8a8680'); r(7, 6, 2, 6, '#d02a22'); r(5, 8, 6, 2, '#d02a22'); }
  // 4 đồ hộp
  { const r = at(4); r(3, 3, 10, 11, '#a8acb0'); r(3, 3, 10, 2, '#d8dce0'); r(3, 6, 10, 5, '#c8402a'); r(5, 7, 6, 3, '#e8c040'); r(3, 12, 10, 2, '#7a7e82'); }
  // 5 nước suối
  { const r = at(5); r(6, 1, 4, 2, '#2a5aa8'); r(5, 3, 6, 11, '#8ac8f0'); r(5, 3, 1, 11, '#c8ecff'); r(5, 7, 6, 3, '#3a7ac8'); r(5, 13, 6, 1, '#5a9ad8'); }
  // 6 can xăng
  { const r = at(6); r(3, 4, 10, 10, '#c8281e'); r(3, 4, 10, 1, '#e84a3a'); r(5, 1, 6, 3, '#8a1a14'); r(11, 1, 2, 4, '#3a3a3e'); r(5, 7, 6, 1, '#8a1a14'); r(5, 10, 6, 1, '#8a1a14'); }
  // 7 linh kiện bộ đàm
  { const r = at(7); r(2, 4, 12, 9, '#2a6a3a'); r(2, 4, 12, 1, '#3a8a4a'); r(4, 6, 3, 3, '#1a1a1e'); r(9, 6, 3, 2, '#d8b050'); r(9, 9, 4, 2, '#c8c8c8'); r(4, 11, 1, 2, '#d8b050'); r(7, 11, 1, 2, '#d8b050'); r(12, 1, 1, 3, '#8a8a8a'); }
  // 8 chìa khoá
  { const r = at(8); r(2, 4, 6, 6, '#e8c040'); r(4, 6, 2, 2, '#00000000'); r(8, 6, 7, 2, '#e8c040'); r(12, 8, 2, 3, '#e8c040'); r(10, 8, 1, 2, '#e8c040'); r(2, 4, 6, 1, '#fff0a0'); }
  // 9 shotgun
  { const r = at(9); r(1, 7, 10, 2, '#2a2a30'); r(1, 6, 10, 1, '#6a6a7c'); r(10, 7, 5, 3, '#7a4a2a'); r(5, 9, 3, 2, '#7a4a2a'); r(9, 9, 2, 3, '#2a2a30'); }
  // 10 tiểu liên
  { const r = at(10); r(1, 6, 11, 3, '#2a2a30'); r(1, 6, 11, 1, '#6a6a7c'); r(6, 9, 2, 5, '#2a2a30'); r(10, 9, 2, 3, '#2a2a30'); r(12, 7, 3, 2, '#3a3a40'); }
  // 11 kháng sinh (lọ thuốc)
  { const r = at(11); r(4, 5, 8, 9, '#e8e4dc'); r(4, 5, 1, 9, '#ffffff'); r(4, 2, 8, 3, '#d86a2a'); r(5, 8, 6, 3, '#3a8ac8'); r(6, 9, 4, 1, '#e8f4ff'); }
  // 12 ống tiêm
  { const r = at(12); for (let i = 0; i < 9; i++) { r(3 + i, 11 - i, 2, 2, i < 6 ? '#cfe8f0' : '#9ab0b8'); } r(4, 9, 3, 3, '#6ab0d8'); r(12, 1, 2, 2, '#8a8a8a'); r(1, 13, 2, 2, '#c8c8c8'); }
  // 13 thuốc giải (lọ xanh lá)
  { const r = at(13); r(6, 1, 4, 2, '#3a3a40'); r(5, 3, 6, 11, '#6ae08a'); r(5, 3, 1, 11, '#c8ffd8'); r(5, 8, 6, 3, '#2a8a4a'); r(7, 5, 2, 2, '#ffffff'); }
  // 14 hoa bỉ ngạn
  { const r = at(14); r(7, 8, 2, 7, '#2a7a2a'); r(4, 11, 3, 1, '#3a8a3a'); const pet = '#e8242a', tip = '#ff6a5a';
    for (const [x, y] of [[3, 3], [11, 3], [2, 6], [12, 6], [5, 1], [9, 1], [4, 5], [10, 5]]) r(x, y, 2, 2, pet);
    r(6, 3, 4, 4, '#c81a20'); r(7, 4, 2, 2, '#ffd84a'); for (const [x, y] of [[2, 2], [13, 2], [1, 7], [14, 7]]) r(x, y, 1, 1, tip); }
  // 15 thuốc súng (túi vải)
  { const r = at(15); r(3, 5, 10, 9, '#6a5a4a'); r(3, 5, 10, 1, '#8a7a66'); r(6, 2, 4, 3, '#5a4a3a'); r(5, 4, 6, 1, '#3a2a1e'); r(5, 8, 6, 4, '#2a2a2e'); r(6, 9, 1, 1, '#8a8a8e'); r(9, 10, 1, 1, '#8a8a8e'); }
  // 16 vỏ đạn
  { const r = at(16); for (let i = 0; i < 3; i++) { r(2 + i * 4, 4 + (i % 2) * 2, 3, 8, '#c89a3a'); r(2 + i * 4, 4 + (i % 2) * 2, 1, 8, '#f0d070'); r(2 + i * 4, 11 + (i % 2) * 2, 3, 1, '#8a6a2a'); } }
  // 17 thanh gỗ
  { const r = at(17); for (let i = 0; i < 11; i++) { r(2 + i, 12 - i, 3, 3, i % 3 ? '#8a6a44' : '#a8845a'); } r(12, 1, 2, 2, '#c8a070'); r(2, 13, 2, 1, '#5a4028'); }
  // 18 đuốc
  { const r = at(18); for (let i = 0; i < 8; i++) r(4 + i, 14 - i, 2, 2, '#7a5634'); r(10, 4, 4, 4, '#4a3a2a'); r(11, 1, 3, 3, '#ff9a2a'); r(12, 0, 1, 2, '#ffd25a'); r(10, 2, 1, 2, '#e0561a'); }
  // 19 đèn pin
  { const r = at(19); r(2, 6, 9, 4, '#2a2a30'); r(2, 6, 9, 1, '#5a5a66'); r(11, 4, 3, 8, '#3a3a42'); r(14, 5, 1, 6, '#fff0b0'); r(5, 10, 2, 1, '#c8281e'); }
  // 20 pin
  { const r = at(20); for (let i = 0; i < 2; i++) { r(3 + i * 6, 3, 4, 11, '#2a6ac8'); r(3 + i * 6, 3, 1, 11, '#5a9ae8'); r(4 + i * 6, 1, 2, 2, '#c8c8c8'); r(3 + i * 6, 10, 4, 4, '#1a1a1e'); } }
  // 21 súng lục
  { const r = at(21); r(2, 5, 11, 3, '#2a2a30'); r(2, 5, 11, 1, '#6a6a7c'); r(9, 8, 4, 6, '#3a2a22'); r(9, 8, 1, 6, '#5a4232'); r(7, 8, 2, 2, '#2a2a30'); }
  // 22 tên (mũi tên)
  { const r = at(22); for (let i = 0; i < 3; i++) { const o = i * 3; for (let k = 0; k < 10; k++) r(3 + k + (i === 1 ? 1 : 0), 14 - k - o, 1, 1, '#a8845a'); r(12 + (i === 1 ? 1 : 0), 5 - o, 2, 2, '#c8c8d0'); r(2 + (i === 1 ? 1 : 0), 13 - o, 2, 2, '#e84a3a'); } }
  // 23 vải vụn
  { const r = at(23); r(2, 4, 12, 9, '#c8b8a0'); r(2, 4, 12, 1, '#e0d4c0'); r(4, 6, 3, 2, '#a8483a'); r(9, 8, 3, 3, '#5a6a8a'); r(3, 11, 4, 1, '#9a8a74'); r(12, 3, 2, 3, '#c8b8a0'); }
  // 24 đinh
  { const r = at(24); for (let i = 0; i < 4; i++) { r(3 + i * 3, 3 + (i % 2), 3, 1, '#c8c8d0'); r(4 + i * 3, 4 + (i % 2), 1, 9, '#9a9aa4'); r(4 + i * 3, 13 + (i % 2) - 1, 1, 1, '#6a6a74'); } }
  // 25 băng keo
  { const r = at(25); r(3, 3, 10, 10, '#a8a8b0'); r(6, 6, 4, 4, '#3a3a40'); r(3, 3, 10, 1, '#c8c8d0'); r(12, 9, 3, 4, '#a8a8b0'); }
  // 26 sắt vụn
  { const r = at(26); r(2, 8, 7, 4, '#7a7a84'); r(2, 8, 7, 1, '#a8a8b4'); r(7, 4, 6, 3, '#8a6a4a'); r(9, 10, 5, 3, '#5a5a64'); r(4, 9, 1, 1, '#c8c8d0'); }
  // 27 dây dù
  { const r = at(27); for (let k = 0; k < 12; k++) { const x = 2 + k, y = 8 + Math.round(Math.sin(k * 0.9) * 3); r(x, y, 1, 2, k % 2 ? '#3a7a3a' : '#5a9a4a'); } r(2, 6, 3, 3, '#3a7a3a'); }
  // 28 chai rỗng
  { const r = at(28); r(6, 1, 4, 3, '#4a7a5a'); r(5, 4, 6, 10, '#6aa88a'); r(5, 4, 1, 10, '#a8e0c0'); r(5, 13, 6, 1, '#3a6a4a'); }
  // 29 cồn y tế
  { const r = at(29); r(6, 1, 4, 2, '#e8e8f0'); r(4, 3, 8, 11, '#d8e8f0'); r(4, 3, 1, 11, '#ffffff'); r(5, 6, 6, 5, '#2a6ac8'); r(7, 7, 2, 3, '#ffffff'); }
  // 30-34 sách (bìa khác màu)
  [['#8a5a2a', '#e8d8b0'], ['#e8e8e0', '#c8281e'], ['#3a5a2a', '#e8c040'], ['#2a6a3a', '#e8e0d0'], ['#c8701e', '#2a2a2e']].forEach(([cv, mk], k) => {
    const r = at(30 + k); r(3, 2, 10, 12, cv); r(3, 2, 2, 12, '#1e1a16'); r(5, 13, 8, 1, '#e8e4d8'); r(13, 3, 1, 10, '#e8e4d8');
    if (k === 1) { r(7, 5, 2, 6, mk); r(5, 7, 6, 2, mk); } else if (k === 3) { for (let i = 0; i < 6; i++) r(6 + i, 10 - i, 1, 1, mk); r(10, 4, 2, 2, mk); } else r(6, 5, 5, 4, mk);
  });
  // 35 dao bếp
  { const r = at(35); for (let i = 0; i < 7; i++) r(3 + i, 11 - i, 2, 2, '#d8dce4'); r(10, 4, 2, 2, '#f0f4ff'); r(2, 12, 3, 3, '#4a2e1e'); }
  // 36 dao tự chế
  { const r = at(36); for (let i = 0; i < 6; i++) r(4 + i, 10 - i, 2, 2, '#9a9aa4'); r(2, 11, 4, 4, '#a8a8b0'); r(2, 12, 4, 1, '#3a3a40'); }
  // 37 gậy gỗ
  { const r = at(37); for (let i = 0; i < 11; i++) r(2 + i, 13 - i, i > 6 ? 3 : 2, i > 6 ? 3 : 2, i > 6 ? '#8a5a32' : '#a8743e'); }
  // 38 gậy đóng đinh
  { const r = at(38); for (let i = 0; i < 11; i++) r(2 + i, 13 - i, i > 6 ? 3 : 2, i > 6 ? 3 : 2, i > 6 ? '#8a5a32' : '#a8743e'); for (const [x, y] of [[10, 2], [13, 4], [12, 7], [9, 5]]) r(x, y, 1, 1, '#d8d8e0'); }
  // 39 giáo
  { const r = at(39); for (let i = 0; i < 12; i++) r(2 + i, 14 - i, 1, 1, '#8a6a42'); r(12, 1, 3, 3, '#c8c8d0'); r(11, 3, 2, 2, '#3a3a40'); }
  // 40 ống thép
  { const r = at(40); for (let i = 0; i < 11; i++) r(2 + i, 13 - i, 2, 2, '#7a7a88'); for (let i = 0; i < 11; i++) r(2 + i, 13 - i, 1, 1, '#b8b8c8'); }
  // 41 áo giáp đệm
  { const r = at(41); r(3, 3, 10, 11, '#6a6a5a'); r(3, 3, 3, 3, '#2a2a2e'); r(10, 3, 3, 3, '#2a2a2e'); r(5, 6, 6, 1, '#a8a8a8'); r(5, 9, 6, 1, '#a8a8a8'); r(7, 5, 2, 8, '#8a8a7a'); }
  // 42 ba lô tự may
  { const r = at(42); r(3, 4, 10, 10, '#7a6a3a'); r(5, 2, 6, 3, '#5a4a2a'); r(4, 8, 8, 4, '#8a7a4a'); r(7, 9, 2, 1, '#2a2a2e'); }
  // 43 bom xăng
  { const r = at(43); r(5, 5, 6, 9, '#4a7a5a'); r(5, 5, 1, 9, '#8ac0a0'); r(6, 2, 4, 3, '#c8b8a0'); r(7, 0, 2, 2, '#ff9a2a'); r(6, 8, 4, 3, '#c83a2a'); }
  // 44 cung gỗ
  { const r = at(44); for (let k = 0; k < 13; k++) r(4 + Math.round(Math.sin(k / 12 * Math.PI) * 4), 1 + k, 1, 1, '#8a5a2a'); r(4, 1, 1, 13, '#e8e0d0'); }
  for (let i = 0; i < N; i++) P.outline('#15130f', i * 16, 0, 16, 16);
  return P.canvas();
}

// ---------- hoa bỉ ngạn mọc trong thế giới (phát sáng nhẹ) ----------
export function makeFlowerSprite() {
  const P = new Pix(16, 20, { emissive: true });
  const stem = '#2a6a2a';
  for (let y = 9; y < 20; y++) { P.set(7 + (y > 15 ? 1 : 0), y, stem); }
  P.set(5, 15, '#3a8a3a'); P.set(6, 16, '#3a8a3a'); P.set(10, 14, '#3a8a3a'); P.set(9, 15, '#3a8a3a');
  const pet = ['#a8141a', '#e8242a', '#ff5a4a'];
  const curls = [[[7, 8], [5, 6], [3, 5], [2, 3], [3, 2]], [[8, 8], [10, 6], [12, 5], [13, 3], [12, 2]], [[7, 7], [6, 4], [6, 2], [5, 0]], [[8, 7], [9, 4], [9, 2], [10, 0]], [[7, 8], [4, 8], [2, 7], [1, 6]], [[8, 8], [11, 8], [13, 7], [14, 6]]];
  for (const c of curls) c.forEach(([x, y], i) => { const col = pet[Math.min(2, i)]; P.set(x, y, col); P.glow(x, y, col); });
  for (const [x, y] of [[6, 7], [7, 6], [8, 6], [9, 7], [7, 7], [8, 7]]) { P.set(x, y, '#c81a20'); P.glow(x, y, '#ff3a2a'); }
  for (const [x, y] of [[3, 1], [12, 1], [1, 5], [14, 5], [6, 0], [9, 0]]) { P.set(x, y, '#ffd84a'); P.glow(x, y, '#ffe080'); }
  P.outline('#1a0a0a');
  return { map: tex(P), emissiveMap: tex(P.emissiveCanvas()), w: 16 / PPU, h: 20 / PPU };
}

// ---------- lửa (6 khung) ----------
export function makeFireAtlas() {
  const FW = 16, FH = 24, N = 6;
  const P = new Pix(FW * N, FH);
  const pal = ['#5a1206', '#a8260a', '#e0561a', '#ff9a2a', '#ffd25a', '#fff6cc'];
  for (let f = 0; f < N; f++)
    for (let y = 0; y < FH; y++)
      for (let x = 0; x < FW; x++) {
        const h = (FH - 1 - y) / FH;
        const ph = (f / N) * Math.PI * 2;
        const cxw = 8 + Math.sin(h * 5 + ph) * 1.6 * h;
        const width = (1 - h * 0.92) * 7.2 * (0.86 + 0.14 * Math.sin(ph * 2 + h * 8));
        const dx = Math.abs(x + 0.5 - cxw) / Math.max(width, 0.01);
        const n = fbm(x * 0.32 + Math.cos(ph) * 1.5, y * 0.24 + Math.sin(ph) * 1.5 + h * 2, 9, 3);
        const v = 1.05 - dx - h * 0.62 + (n - 0.5) * 0.85;
        if (v > 0.1) P.set(f * FW + x, y, ramp(pal, Math.min(1, v * 1.2), x, y, 0.7));
      }
  return { map: tex(P), frames: N, w: FW / PPU, h: FH / PPU };
}

// ---------- quạ: 0 đậu, 1 cánh lên, 2 cánh xuống ----------
const CROW = [
  ['............', '............', '........kk..', '.......kkEb.', '..kkkkkkkk..', '.kkkkkkkk...', 'kkskkkkk....', '...kkkk.....', '....l.l.....'],
  ['.k.......k..', '.kk.....kk..', '..kk...kk...', '...kkkkk....', '..kkkkkkkEb.', '.k....kkk...', '............', '............', '............'],
  ['............', '............', '............', '...kkkkk.Eb.', '..kkkkkkkk..', '.kk...kkk...', 'kk.....kk...', 'k.......k...', '............'],
];
export function makeCrowAtlas() {
  const P = new Pix(12 * 3, 9);
  const col = { k: '#17151d', s: '#34324a', E: '#d8d4c0', b: '#4a4652', l: '#4a4652' };
  CROW.forEach((rows, f) => rows.forEach((r, y) => [...r].forEach((ch, x) => { if (col[ch]) P.set(f * 12 + x, y, col[ch]); })));
  return { map: tex(P), frames: 3, w: 12 / PPU, h: 9 / PPU };
}

// ---------- máu loang (4 mẫu) ----------
export function makeBloodAtlas() {
  const S = 16, P = new Pix(S * 4, S);
  const pal = ['#3e0606', '#5c0a0a', '#7a1010', '#962018'];
  for (let v = 0; v < 4; v++) {
    const r = makeRng(101 + v * 31);
    const blobs = [];
    for (let i = 0; i < 6 + v * 2; i++) blobs.push([r.range(4, 12), r.range(4, 12), r.range(1.2, 4.2)]);
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        let f = 0;
        for (const [bx, by, br] of blobs) f = Math.max(f, 1 - Math.hypot(x + 0.5 - bx, y + 0.5 - by) / br);
        if (f > 0) P.set(v * S + x, y, ramp(pal, Math.min(1, f * 1.4 + 0.15), x, y, 0.6));
      }
  }
  return { map: tex(P), count: 4 };
}

// ---------- vật phẩm: đạn, hộp cứu thương ----------
export function makePickupAtlas() {
  const P = new Pix(24, 12);
  // hộp đạn
  P.rect(0, 3, 12, 9, '#4f5a2c'); P.rect(0, 3, 12, 1, '#6c7a3c'); P.rect(0, 11, 12, 1, '#2f3618');
  for (let i = 0; i < 4; i++) { P.rect(2 + i * 2, 0, 1, 3, '#e8c25a'); P.set(2 + i * 2, 0, '#fff0b0'); }
  P.rect(4, 6, 4, 2, '#d8c070');
  // hộp cứu thương
  P.rect(12, 2, 12, 10, '#e8e4dc'); P.rect(12, 2, 12, 1, '#ffffff'); P.rect(12, 11, 12, 1, '#a8a49c');
  P.rect(17, 4, 2, 6, '#d02a22'); P.rect(15, 6, 6, 2, '#d02a22');
  P.rect(16, 0, 4, 2, '#8a8680');
  P.outline('#15130f');
  return { map: tex(P), w: 12 / PPU, h: 12 / PPU };
}

// ---------- lá rơi / bướm đêm / tia lửa (trắng, tô màu theo instance) ----------
export function makeSmallAtlas() {
  const P = new Pix(16, 4);
  const leaf = ['.x..', 'xxx.', 'xx..', '....'];
  const moth = ['x.x.', 'xxx.', '.x..', '....'];
  const dot = ['xx..', 'xx..', '....', '....'];
  const ash = ['x...', '....', '....', '....'];
  [leaf, moth, dot, ash].forEach((m, k) => m.forEach((r, y) => [...r].forEach((ch, x) => { if (ch === 'x') P.set(k * 4 + x, y, '#ffffff'); })));
  return tex(P);
}

// ---------- mặt bí ngô phát sáng ----------
export function makeJackFace() {
  const P = new Pix(8, 8, { emissive: true });
  const m = ['........', '.x....x.', 'xxx..xxx', '........', '...xx...', '.x....x.', '.xxxxxx.', '..x..x..'];
  m.forEach((r, y) => [...r].forEach((ch, x) => { if (ch === 'x') { P.set(x, y, '#ffb43a'); P.glow(x, y, '#ffb43a'); } }));
  return { map: tex(P), emissiveMap: tex(P.emissiveCanvas()) };
}

export { vnoise };

// ---------- diều giấy (bay lơ lửng trên trời khi chiều tà) ----------
export function makeKite() {
  const P = new Pix(16, 32);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const d = Math.abs(x + 0.5 - 8) / 8 + Math.abs(y + 0.5 - 8) / 8;
    if (d <= 1) P.set(x, y, x < 8 ? (y < 8 ? '#d8402a' : '#f0c040') : (y < 8 ? '#3a6ac8' : '#e8e0d0'));
  }
  for (let y = 16; y < 32; y++) { const x = 8 + Math.round(Math.sin(y * 0.6) * 1.5); P.set(x, y, '#2a2a2a'); if (y % 5 === 0) { P.set(x - 1, y, '#d8402a'); P.set(x + 1, y, '#f0c040'); } }
  P.outline('#1a1418');
  return { map: tex(P), w: 16 / PPU, h: 32 / PPU };
}

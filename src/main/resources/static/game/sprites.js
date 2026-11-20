// Sprite nhân vật & vật thể nhỏ, vẽ bằng code theo phong cách chibi 2 đầu.
import { Pix, PPU, makeRng, tex, ramp, fbm, vnoise } from './pixel.js';

export const DIR_ROW = { down: 0, left: 1, right: 2, up: 3 };

const SPEC = {
  normal: { fw: 24, fh: 32, cx: 12, feet: 31, shoeH: 2, legTop: 26, legW: 3, legGap: 2, torsoTop: 16, torsoBot: 25, torsoHW: 5, belly: 0, headCy: 9.5, headRx: 7.5, headRy: 7, armW: 2 },
  thin: { fw: 24, fh: 32, cx: 12, feet: 31, shoeH: 2, legTop: 26, legW: 2, legGap: 2, torsoTop: 16, torsoBot: 25, torsoHW: 4, belly: 0, headCy: 10, headRx: 7, headRy: 6.5, armW: 2 },
  brute: { fw: 32, fh: 40, cx: 16, feet: 39, shoeH: 2, legTop: 33, legW: 5, legGap: 2, torsoTop: 17, torsoBot: 32, torsoHW: 9, belly: 2, headCy: 10.5, headRx: 7, headRy: 6.5, armW: 4 },
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
      if (view === 'down') {
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
      rect(cx + 5, sy - 1, cx + 5 + gl, sy, (x, y) => (y === sy - 1 ? pal.gunL : pal.gun));
      rect(cx + 5, sy + 1, cx + 6, sy + 2, pal.gun);
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

export function makeCharacterSprites() {
  const player = {
    pistol: buildAtlas(SPEC.normal, PAL_SURVIVOR, { weapon: 'pistol' }),
    shotgun: buildAtlas(SPEC.normal, PAL_SURVIVOR, { weapon: 'shotgun' }),
    smg: buildAtlas(SPEC.normal, PAL_SURVIVOR, { weapon: 'smg' }),
  };
  const zombies = {
    walker: [1, 2, 3, 4].map((s) => buildAtlas(SPEC.normal, zombiePalette(s, 'walker'), { zombie: true, kind: 'walker' })),
    runner: [11, 12].map((s) => buildAtlas(SPEC.thin, zombiePalette(s, 'runner'), { zombie: true, kind: 'runner' })),
    brute: [21].map((s) => buildAtlas(SPEC.brute, zombiePalette(s, 'brute'), { zombie: true, kind: 'brute' })),
  };
  return { player, zombies };
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

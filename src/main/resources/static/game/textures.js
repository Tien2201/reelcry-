// Texture môi trường pixel-art (16px = 1m): nền đất, đá lát, mặt tiền nhà,
// mái ngói, tường đá, lá cây, cỏ, hoa...
import * as THREE from 'three';
import { Pix, PPU, makeRng, tex, ramp, fbm, vnoise, bayer, rgb, mixc } from './pixel.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
function hash(x, y, s) {
  let h = (x * 374761393 + y * 668265263 + s * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// ---------- texture nhỏ cho voxel (8x8 mỗi mặt khối 0.5m) ----------
function grayTile(seed, fn, size = 8) {
  const P = new Pix(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) P.set(x, y, fn(x, y, makeRng(seed + x * 31 + y * 7)));
  return P;
}
export function leafTile() {
  const P = new Pix(8, 8);
  const g = (v) => [v, v, v];
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++) {
      const n = hash(x, y, 11);
      let v = 196 + (n - 0.5) * 40;
      if ((x + y * 3) % 5 === 0) v = 238;
      if ((x * 2 + y) % 7 === 3) v = 132;
      if (y === 0 && n > 0.5) v = 246;
      P.set(x, y, g(clamp(v, 0, 255)));
    }
  return tex(P);
}
export function barkTile() {
  return tex(grayTile(3, (x, y) => {
    const n = hash(x, Math.floor(y / 3), 5);
    const base = x % 3 === 0 ? 0.55 : 0.8 + n * 0.2;
    return mixc('#3a2618', '#7a5638', clamp(base, 0, 1));
  }));
}
export function stoneTile() {
  return tex(grayTile(7, (x, y) => {
    const n = fbm(x * 0.6, y * 0.6, 3, 2);
    let v = 150 + n * 90;
    if ((y === 3 && x < 5) || (x === 5 && y > 3)) v = 92;
    return [v, v, v * 1.02];
  }));
}
export function plankTile() {
  const P = new Pix(16, 16);
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const row = Math.floor(y / 4);
      const n = vnoise(x * 0.4 + row * 9, row * 3.1, 2);
      let c = ramp(['#4e3220', '#64422a', '#7a5434', '#8e6640'], 0.3 + n * 0.6, x, y, 0.5);
      if (y % 4 === 3) c = '#3a2416';
      if ((x + row * 7) % 16 === 0) c = '#3a2416';
      if (y % 4 === 0 && hash(x, y, 4) > 0.6) c = '#9a7450';
      P.set(x, y, c);
    }
  return tex(P);
}
export function crateTile() {
  const P = new Pix(16, 16);
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const n = hash(x, y >> 2, 41);
      let c = ramp(['#8a6038', '#a07442', '#b88a52', '#c89c62'], 0.3 + n * 0.5, x, y, 0.5);
      if (y % 5 === 4) c = '#6a4626';
      const border = x < 2 || y < 2 || x > 13 || y > 13;
      const diag = Math.abs(x - y) < 1.5;
      if (border || diag) c = (x + y) % 2 ? '#6a4626' : '#5a3a1e';
      if ((x === 1 || x === 14) && (y === 1 || y === 14)) c = '#2a2a2e';
      P.set(x, y, c);
    }
  return tex(P);
}
export function dirtTile() {
  return tex(grayTile(13, (x, y) => ramp(['#3a2a1c', '#4a3626', '#5a4430', '#6a523a'], hash(x, y, 13), x, y, 0.8)));
}
export function pumpkinTile() {
  return tex(grayTile(17, (x, y) => (x % 3 === 0 ? '#b8541a' : y < 2 ? '#f0a040' : hash(x, y, 2) > 0.8 ? '#ff9a3a' : '#e07a26')));
}
export function hayTile() {
  return tex(grayTile(19, (x, y) => ramp(['#8a6a2a', '#a8843a', '#c8a44c', '#e0c06a'], hash(x, y >> 1, 19), x, y, 0.9)));
}
export function plainTile() {
  return tex(grayTile(23, (x, y) => { const v = 214 + hash(x, y, 23) * 41; return [v, v, v]; }));
}
export function metalTile() {
  return tex(grayTile(29, (x, y) => ramp(['#1e1e24', '#2a2a32', '#383842', '#4a4a56'], hash(x, y, 29) * 0.7 + (y < 1 ? 0.3 : 0), x, y, 0.4)));
}
export function clothTile(base) {
  const b = rgb(base);
  return tex(grayTile(37, (x, y) => {
    const k = (x % 4 === 0 ? 0.85 : 1) * (0.92 + hash(x, y, 37) * 0.12) * (y % 8 === 7 ? 0.82 : 1);
    return [b[0] * k, b[1] * k, b[2] * k];
  }, 16));
}

// ---------- cỏ, hoa, lau sậy (sprite có nền trong suốt) ----------
export function grassTufts() {
  const out = [];
  for (let v = 0; v < 3; v++) {
    const P = new Pix(16, 16);
    const r = makeRng(400 + v * 17);
    const pal = v === 2 ? ['#24401a', '#36581f', '#4c7428', '#6e9434', '#a0b84a'] : ['#203a16', '#30521c', '#447028', '#5e8e30', '#8aae40'];
    const n = 6 + v;
    for (let b = 0; b < n; b++) {
      const bx = 2 + r() * 12, len = 7 + r() * 8, lean = (r() - 0.5) * 7;
      for (let i = 0; i <= len; i++) {
        const t = i / len;
        const x = Math.round(bx + lean * t * t), y = 15 - i;
        P.set(x, y, ramp(pal, t * 0.95 + 0.05, x, y, 0.4));
        if (t < 0.45) P.set(x + (lean > 0 ? -1 : 1), y, ramp(pal, t * 0.6, x, y, 0.4));
      }
    }
    out.push(tex(P));
  }
  return out;
}
export function flowerTexs() {
  const heads = [['#c8202a', '#ff5a4a', '#ffd04a'], ['#e8b020', '#ffe060', '#b86a10'], ['#e8e8e8', '#ffffff', '#f0c030'], ['#4a5ad0', '#8a9aff', '#f0e0a0'], ['#c84a9a', '#ff8ad0', '#ffe080']];
  return heads.map((h, k) => {
    const P = new Pix(8, 16);
    const r = makeRng(900 + k);
    for (let y = 6; y < 16; y++) P.set(3 + (y > 11 ? 0 : (y & 1) * 0), y, y > 12 ? '#2a4a1a' : '#3e6a24');
    P.set(2, 11, '#4e8a2c'); P.set(1, 10, '#4e8a2c'); P.set(4, 9, '#4e8a2c'); P.set(5, 8, '#5e9a34');
    const cx = 3.5, cy = 4;
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d < 1.1) P.set(x, y, h[2]); else if (d < 2.8 && r() > 0.12) P.set(x, y, d < 2 ? h[1] : h[0]);
    }
    return tex(P);
  });
}
export function reedTex() {
  const P = new Pix(8, 24);
  for (let b = 0; b < 4; b++) {
    const x0 = 1 + b * 2, len = 14 + b * 2;
    for (let i = 0; i < len; i++) P.set(x0 + (i > len * 0.7 ? (b & 1) : 0), 23 - i, i < 6 ? '#2e4a1e' : '#5a7a34');
    if (b === 1 || b === 2) for (let i = 0; i < 4; i++) { P.set(x0, 23 - len - i, '#5a3418'); P.set(x0 + 1, 23 - len - i, '#7a4a22'); }
  }
  return tex(P);
}
export function fernTex() {
  const P = new Pix(16, 16);
  const pal = ['#1a3016', '#264222', '#34582a', '#466e30'];
  for (let f = 0; f < 5; f++) {
    const a = -1.2 + f * 0.6;
    for (let i = 0; i < 11; i++) {
      const x = Math.round(8 + Math.sin(a) * i * 0.75), y = Math.round(15 - Math.cos(a) * i * 0.9);
      P.set(x, y, pal[Math.min(3, (i / 3) | 0)]);
      if (i > 2 && i % 2 === 0) { P.set(x - 1, y - 1, pal[2]); P.set(x + 1, y - 1, pal[2]); }
    }
  }
  return tex(P);
}
export function lilyTex() {
  const P = new Pix(16, 16);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const dx = x + 0.5 - 8, dy = y + 0.5 - 8, d = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
    if (d < 6.5 && !(a > -0.25 && a < 0.25)) P.set(x, y, d > 5.5 ? '#2c5a2a' : (x + y) % 5 === 0 ? '#5a9a46' : '#447e3a');
  }
  P.set(9, 5, '#f0d0e0'); P.set(10, 5, '#ffe8f0'); P.set(9, 4, '#e0a0c0');
  return tex(P);
}

// ---------- mái ngói (tile 32x32 = 2x2m) + normal ----------
const ROOF = {
  red: ['#5a1e16', '#7a2a1e', '#9a3a26', '#b84e30', '#d06a42'],
  slate: ['#1e2434', '#2a3346', '#3a465e', '#4e5c78', '#66789a'],
  wood: ['#3a2618', '#4a3222', '#5e4230', '#76563c', '#8e6c4c'],
  moss: ['#2a2e22', '#3a3e2e', '#4e523a', '#62684a', '#7a8058'],
};
export function roofTex(kind, seed = 1) {
  const pal = ROOF[kind] || ROOF.red;
  const P = new Pix(32, 32);
  for (let row = 0; row < 8; row++) {
    const y0 = row * 4, off = (row & 1) * 4;
    for (let y = y0; y < y0 + 4; y++)
      for (let x = 0; x < 32; x++) {
        const sx = (x + off) % 32, cell = Math.floor(sx / 8);
        const n = hash(cell, row, seed);
        const t = y - y0;
        let c;
        if (t === 3) c = pal[0];
        else if (sx % 8 === 0) c = pal[1];
        else c = ramp(pal, 0.35 + n * 0.45 + (t === 0 ? 0.15 : 0) - t * 0.04, x, y, 0.5);
        const moss = fbm(x * 0.15, y * 0.15, seed + 3, 2);
        if (moss > 0.66 && t < 3 && hash(x, y, seed) > 0.35) c = mixc(c, '#4a6a2a', 0.6);
        P.set(x, y, c, t * 0.28 + (sx % 8 === 0 ? -0.2 : 0));
      }
  }
  const map = tex(P, { repeat: true, mip: true, aniso: 4 });
  const normalMap = tex(P.normalCanvas(2.2), { repeat: true, srgb: false, mip: true });
  return { map, normalMap };
}

// ---------- tường đá thấp (tile 32x16 = 2x1m) ----------
export function stoneWallTex(seed = 5, mossy = true) {
  const P = new Pix(32, 16);
  const pal = ['#2e2c2a', '#4a4642', '#5a5650', '#6a665e', '#7c7870'];
  for (let row = 0; row < 3; row++) {
    const y0 = Math.round(row * 16 / 3), y1 = Math.round((row + 1) * 16 / 3);
    let x = (row * 5) % 9 - 9;
    while (x < 32) {
      const w = 7 + Math.floor(hash(x, row, seed) * 6);
      const n = hash(x + 3, row, seed);
      for (let yy = y0; yy < y1; yy++)
        for (let xx = x; xx < x + w; xx++) {
          const px = ((xx % 32) + 32) % 32;
          const edge = yy === y1 - 1 || xx === x + w - 1;
          const top = yy === y0;
          let c = edge ? pal[0] : ramp(pal, 0.3 + n * 0.5 + (top ? 0.18 : 0) + (hash(px, yy, 2) - 0.5) * 0.2, px, yy, 0.4);
          if (mossy && yy < y0 + 2 && fbm(px * 0.2, yy * 0.4 + row, seed, 2) > 0.58) c = mixc(c, '#466a28', 0.7);
          P.set(px, yy, c, edge ? 0 : 0.8 + (top ? 0.2 : 0));
        }
      x += w;
    }
  }
  return {
    map: tex(P, { repeat: true, mip: true, aniso: 4 }),
    normalMap: tex(P.normalCanvas(2.5), { repeat: true, srgb: false, mip: true }),
  };
}

// ---------- mặt tiền nhà (kích thước theo mét, 16px/m) ----------
export function facadeTex(o) {
  const W = Math.round(o.w * PPU), H = Math.round(o.h * PPU);
  const P = new Pix(W, H, { emissive: true });
  const r = makeRng(o.seed || 1);
  const FH = 10; // móng đá
  const plaster = o.plaster || ['#b8a88a', '#d8c8a4', '#ece0c0'];
  const timber = o.timber || ['#2a1a12', '#46301e', '#5e432a'];
  const style = o.style || 'timber';

  // nền tường
  for (let y = 0; y < H - FH; y++)
    for (let x = 0; x < W; x++) {
      let c, h = 0;
      if (style === 'stone') {
        const rowH = 6, row = Math.floor(y / rowH), off = (row & 1) * 5;
        const bw = 10, bx = Math.floor((x + off) / bw);
        const edge = y % rowH === rowH - 1 || (x + off) % bw === 0;
        const n = hash(bx, row, o.seed);
        c = edge ? '#3a3632' : ramp(['#5a554e', '#6c665e', '#7e776c', '#928a7c'], 0.25 + n * 0.55 + (y % rowH === 0 ? 0.15 : 0), x, y, 0.4);
        h = edge ? 0 : 0.8;
      } else if (style === 'plank') {
        const row = Math.floor(y / 5);
        const n = vnoise(x * 0.12 + row * 7, row, o.seed);
        c = y % 5 === 4 ? '#2a1c12' : ramp(['#4a3222', '#5c4030', '#6e4e38', '#7e5c44'], 0.3 + n * 0.55, x, y, 0.5);
        h = y % 5 === 4 ? 0 : 0.5;
      } else {
        const n = fbm(x * 0.07, y * 0.07, o.seed, 3);
        let t = 0.55 + (n - 0.5) * 0.7 - Math.max(0, (y - (H - FH - 14)) / 14) * 0.35 - (y < 6 ? (6 - y) * 0.06 : 0);
        c = ramp(plaster, t, x, y, 0.6);
        if (hash(x, y, o.seed) > 0.985) c = plaster[0];
        h = n * 0.15;
      }
      P.set(x, y, c, h);
    }
  // móng đá
  for (let y = H - FH; y < H; y++)
    for (let x = 0; x < W; x++) {
      const row = Math.floor((y - (H - FH)) / 5), off = (row & 1) * 4;
      const bx = Math.floor((x + off) / 8);
      const edge = (y - (H - FH)) % 5 === 4 || (x + off) % 8 === 0;
      const n = hash(bx, row, o.seed + 9);
      const c = edge ? '#2a2826' : ramp(['#4a4640', '#5a564e', '#6c665c', '#7e786c'], 0.3 + n * 0.55, x, y, 0.4);
      P.set(x, y, c, edge ? 0 : 1);
    }
  const beam = (x0, y0, w, h) => {
    for (let y = y0; y < y0 + h; y++)
      for (let x = x0; x < x0 + w; x++) {
        if (x < 0 || y < 0 || x >= W || y >= H - FH) continue;
        const edgeHi = y === y0 || x === x0, edgeLo = y === y0 + h - 1 || x === x0 + w - 1;
        const c = edgeLo ? timber[0] : edgeHi ? timber[2] : (hash(x, y >> 1, 3) > 0.8 ? timber[0] : timber[1]);
        P.set(x, y, c, 1.4);
      }
  };
  const brace = (x0, y0, x1, y1) => {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let i = 0; i <= n; i++) {
      const x = Math.round(x0 + (x1 - x0) * i / n), y = Math.round(y0 + (y1 - y0) * i / n);
      P.set(x, y, timber[1], 1.4); P.set(x + 1, y, timber[0], 1.3); P.set(x - 1, y, timber[2], 1.3);
    }
  };

  // vị trí cửa sổ / cửa ra vào
  const floors = o.floors || 1;
  const wallH = H - FH;
  const floorH = wallH / floors;
  const wins = [];
  for (let f = 0; f < floors; f++) {
    const n = o.winPerFloor || Math.max(1, Math.floor((o.w - 1) / 2.4));
    const top = Math.round(wallH - (f + 1) * floorH + floorH * 0.28);
    for (let i = 0; i < n; i++) {
      const cxp = Math.round(W * (i + 1) / (n + 1));
      if (f === 0 && o.door && Math.abs(cxp - o.door * W) < 18) continue;
      const roll = r();
      const state = o.lit === false ? 'dark' : roll < 0.62 ? 'lit' : roll < 0.78 ? 'dark' : roll < 0.9 ? 'boarded' : 'broken';
      wins.push({ x: cxp - 7, y: top, w: 14, h: 16, state, f });
    }
  }
  const door = o.door ? { x: Math.round(o.door * W) - 8, y: H - 30, w: 16, h: 30 } : null;

  if (style === 'timber') {
    beam(0, 0, W, 3);
    beam(0, wallH - 3, W, 3);
    for (let f = 1; f < floors; f++) beam(0, Math.round(wallH - f * floorH) - 2, W, 4);
    beam(0, 0, 3, wallH); beam(W - 3, 0, 3, wallH);
    // cột giữa các ô cửa và thanh chéo ở ô trống
    const cols = [0];
    const centers = wins.filter((w) => w.f === 0).map((w) => w.x + 7).concat(door ? [door.x + 8] : []).sort((a, b) => a - b);
    for (let i = 0; i < centers.length - 1; i++) cols.push(Math.round((centers[i] + centers[i + 1]) / 2));
    cols.push(W - 3);
    for (const cx of cols.slice(1, -1)) beam(cx - 1, 0, 3, wallH);
    for (let f = 0; f < floors; f++) {
      const y0 = Math.round(wallH - (f + 1) * floorH) + 3, y1 = Math.round(wallH - f * floorH) - 3;
      for (let i = 0; i < cols.length - 1; i++) {
        const a = cols[i] + 3, b = cols[i + 1] - 1;
        const hasOpening = wins.some((w) => w.f === f && w.x < b && w.x + w.w > a) || (f === 0 && door && door.x < b && door.x + door.w > a);
        if (!hasOpening && b - a > 8) { brace(a, y1, b, y0); if (b - a > 20) brace(a, y0, b, y1); }
      }
    }
  }

  // cây leo
  if (o.ivy) {
    for (let k = 0; k < o.ivy; k++) {
      let x = Math.floor(r() * W), y = H - FH + 2;
      const len = 30 + r() * 60;
      for (let i = 0; i < len; i++) {
        x += Math.round((r() - 0.5) * 2.2); y -= r() < 0.8 ? 1 : 0;
        if (y < 2) break;
        for (let j = 0; j < 3; j++) {
          const lx = x + Math.round((r() - 0.5) * 4), ly = y + Math.round((r() - 0.5) * 3);
          P.set(lx, ly, r() < 0.3 ? '#22401a' : r() < 0.6 ? '#3a6a26' : '#5a8e34', 1.2);
        }
      }
    }
  }

  // cửa sổ
  const shutter = o.shutter || '#3a5a7a';
  const shL = mixc(shutter, '#ffffff', 0.25), shD = mixc(shutter, '#000000', 0.4);
  for (const w of wins) {
    for (const sx of [w.x - 6, w.x + w.w + 1]) {
      for (let y = w.y; y < w.y + w.h; y++)
        for (let x = sx; x < sx + 5; x++) {
          const c = y === w.y || x === sx ? shL : (x - sx) % 2 === 1 ? shD : shutter;
          P.set(x, y, c, 1);
        }
      P.set(sx + 2, w.y + 4, '#1a1a1a'); P.set(sx + 2, w.y + w.h - 5, '#1a1a1a');
    }
    for (let y = w.y; y < w.y + w.h; y++)
      for (let x = w.x; x < w.x + w.w; x++) {
        const fx = x - w.x, fy = y - w.y;
        const frame = fx === 0 || fy === 0 || fx === w.w - 1 || fy === w.h - 1 || fx === 6 || fx === 7 || fy === 7;
        if (frame) { P.set(x, y, fy === 0 || fx === 0 ? '#5a3c26' : '#2a1a10', 0.8); continue; }
        if (w.state === 'lit') {
          const curtain = fx <= 2 || fx >= w.w - 3;
          const plant = fy >= w.h - 4 && fx >= 4 && fx <= 9 && hash(fx, fy, o.seed) > 0.35;
          let c = curtain ? (fy % 3 === 0 ? '#c86a32' : '#b85a2a') : plant ? '#5a2e14' : ramp(['#f08a3a', '#ffb050', '#ffd27a', '#ffe8a8'], 0.35 + fy / w.h * 0.5 + (hash(x, y, 7) - 0.5) * 0.2, x, y, 0.5);
          P.set(x, y, c, -0.5);
          if (!plant) P.glow(x, y, curtain ? '#a04a1a' : c);
        } else if (w.state === 'dark') {
          const refl = (fx + fy) % 9 === 0 || (fx + fy) % 9 === 1;
          P.set(x, y, refl ? '#4e5e78' : '#1e2638', -0.5);
        } else if (w.state === 'broken') {
          const shard = hash(fx, fy, 3) > 0.62 && (fx + fy) % 4 < 2;
          P.set(x, y, shard ? '#5e6e84' : '#0e1016', -0.8);
        } else {
          P.set(x, y, '#141414', -0.8);
        }
      }
    if (w.state === 'boarded') {
      for (let i = 0; i < w.w + 4; i++) {
        const x = w.x - 2 + i, y1 = w.y + 2 + Math.round(i * (w.h - 6) / (w.w + 4)), y2 = w.y + w.h - 4 - Math.round(i * (w.h - 8) / (w.w + 4));
        for (const yy of [y1, y1 + 1, y1 + 2]) P.set(x, yy, yy === y1 ? '#9a7048' : '#6e4c2e', 1.2);
        for (const yy of [y2, y2 + 1, y2 + 2]) P.set(x, yy, yy === y2 ? '#a07a50' : '#74522f', 1.3);
      }
    }
    // bậu cửa + hộp hoa
    for (let x = w.x - 1; x < w.x + w.w + 1; x++) { P.set(x, w.y + w.h, '#a8a090', 1.2); P.set(x, w.y + w.h + 1, '#6e685e', 1.1); }
    if (w.state !== 'boarded' && w.state !== 'broken' && r() < 0.8) {
      for (let y = w.y + w.h + 2; y < w.y + w.h + 5; y++) for (let x = w.x; x < w.x + w.w; x++) P.set(x, y, y === w.y + w.h + 2 ? '#7a5434' : '#5a3a22', 1.4);
      const fl = ['#d82a2a', '#ff6a8a', '#ffd04a', '#ffffff', '#c84ad8'];
      for (let x = w.x; x < w.x + w.w; x++) {
        P.set(x, w.y + w.h + 1, hash(x, 1, o.seed) > 0.4 ? '#3e7a2c' : '#2a5a1e', 1.5);
        if (hash(x, 2, o.seed) > 0.45) P.set(x, w.y + w.h, hash(x, 3, o.seed) > 0.5 ? r.pick(fl) : '#4e8e34', 1.6);
        if (hash(x, 4, o.seed) > 0.75) P.set(x, w.y + w.h - 1, r.pick(fl), 1.6);
      }
    }
  }

  // cửa ra vào
  if (door) {
    for (let y = door.y; y < H; y++)
      for (let x = door.x; x < door.x + door.w; x++) {
        const fx = x - door.x, fy = y - door.y;
        let c;
        if (fx === 0 || fx === door.w - 1 || fy === 0) c = fy === 0 || fx === 0 ? '#6a4a2e' : '#2a1a10';
        else if (fy >= 3 && fy <= 8 && fx >= 4 && fx <= 11) {
          const lit = o.doorLit !== false;
          c = lit ? (fx === 7 || fx === 8 || fy === 5 ? '#3a2416' : '#ffc060') : '#1e2638';
          if (lit && c !== '#3a2416') P.glow(x, y, c);
        } else if (fy === 12 || fy === 24) c = '#34343c';
        else c = fx % 4 === 0 ? '#3e2716' : hash(fx, fy >> 2, 5) > 0.7 ? '#7a5232' : '#684428';
        P.set(x, y, c, fy === 0 ? 1 : 0.4);
      }
    P.set(door.x + 12, door.y + 17, '#e8c060'); P.set(door.x + 12, door.y + 18, '#a88030');
  }

  return {
    map: tex(P, { mip: true, aniso: 4 }),
    emissiveMap: tex(P.emissiveCanvas(), { mip: true }),
    normalMap: tex(P.normalCanvas(1.8), { srgb: false, mip: true }),
    wins, door,
  };
}

// ---------- tường hồi / tường hông (tile lặp được) ----------
export function sideWallTex(o) {
  return facadeTex({ ...o, door: null, winPerFloor: 1, lit: o.lit });
}

// ---------- nền đất cả bản đồ ----------
// kind: 0 cỏ, 1 đất, 2 đá lát, 3 bùn, 4 đất trồng, 5 đất rừng, 6 đất mộ
export function groundTex(L) {
  const PPU = L.ppu || 16;
  const W = Math.round(L.w * PPU), H = Math.round(L.h * PPU);
  const mask = document.createElement('canvas');
  mask.width = W; mask.height = H;
  const g = mask.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  const X = (x) => (x - L.x0) * PPU, Y = (z) => (z - L.z0) * PPU;
  const col = (k) => `rgb(${k * 30},0,0)`;
  g.lineCap = 'round'; g.lineJoin = 'round';
  for (const s of L.shapes) {
    g.fillStyle = g.strokeStyle = col(s.kind);
    if (s.type === 'path') {
      g.lineWidth = s.width * PPU;
      g.beginPath();
      s.pts.forEach(([x, z], i) => (i ? g.lineTo(X(x), Y(z)) : g.moveTo(X(x), Y(z))));
      g.stroke();
    } else if (s.type === 'disc') {
      g.beginPath(); g.ellipse(X(s.x), Y(s.z), s.rx * PPU, (s.rz || s.rx) * PPU, 0, 0, Math.PI * 2); g.fill();
    } else if (s.type === 'rect') {
      g.fillRect(X(s.x), Y(s.z), s.w * PPU, s.h * PPU);
    }
  }
  const md = g.getImageData(0, 0, W, H).data;
  const kindAt = (x, y) => {
    x = clamp(x | 0, 0, W - 1); y = clamp(y | 0, 0, H - 1);
    return Math.round(md[(y * W + x) * 4] / 30);
  };
  const P = new Pix(W, H);
  const grass = ['#1e3414', '#28421a', '#32521e', '#3e6224', '#4a722a', '#5a8232'];
  const forest = ['#141e0e', '#1c2a12', '#263618', '#30401c', '#3e4a22'];
  const dirt = ['#3e2c1e', '#4c3726', '#5a4430', '#6a523a', '#7a6046'];
  const cob = ['#44444a', '#4c4c52', '#55555c', '#5e5e66', '#686870'];
  const C = 5;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const js = PPU / 16;
      const jx = (vnoise(x * 0.14 / js, y * 0.14 / js, 3) - 0.5) * 7 * js, jy = (vnoise(x * 0.14 / js + 40, y * 0.14 / js, 4) - 0.5) * 7 * js;
      const k0 = kindAt(x, y);
      const k = k0 >= 7 ? k0 : kindAt(x + jx, y + jy);
      let c, h = 0;
      if (k === 0 || k === 5) {
        const n = fbm(x * 0.03, y * 0.03, 1, 3) * 0.65 + vnoise(x * 0.45, y * 0.45, 2) * 0.35;
        c = ramp(k === 5 ? forest : grass, n, x, y, 0.8);
        h = vnoise(x * 0.5, y * 0.5, 2) * 0.5;
        const sp = hash(x, y, 77);
        if (k === 5 && sp > 0.97) c = sp > 0.99 ? '#6a3a1a' : '#5a4a1e';
        else if (sp > 0.9985) c = sp > 0.9993 ? '#e8e0c0' : '#e8c040';
      } else if (k === 1 || k === 6) {
        const n = fbm(x * 0.06, y * 0.06, 5, 2) * 0.6 + hash(x, y, 9) * 0.4;
        c = ramp(dirt, k === 6 ? n * 0.5 : n, x, y, 0.8);
        h = n * 0.4;
        const p = hash(x >> 1, y >> 1, 21);
        if (p > 0.985) { c = p > 0.993 ? '#9a8e80' : '#7a7064'; h = 1.2; }
      } else if (k === 2) {
        const gx = Math.floor(x / C), gy = Math.floor(y / C);
        let d1 = 1e9, d2 = 1e9, id = 0;
        for (let j = -1; j <= 1; j++)
          for (let i = -1; i <= 1; i++) {
            const cxp = (gx + i) * C + hash(gx + i, gy + j, 1) * C, cyp = (gy + j) * C + hash(gx + i, gy + j, 2) * C;
            const d = Math.hypot(x + 0.5 - cxp, y + 0.5 - cyp);
            if (d < d1) { d2 = d1; d1 = d; id = hash(gx + i, gy + j, 3); } else if (d < d2) d2 = d;
          }
        if (d2 - d1 < 1.1) { c = hash(x, y, 31) > 0.8 ? '#33402a' : '#2e2e33'; h = 0; }
        else { c = ramp(cob, 0.2 + id * 0.6 + (d1 < 1.6 ? 0.1 : 0), x, y, 0.5); h = 1 - Math.min(1, d1 / (C * 0.8)) * 0.4; if (id > 0.88) c = mixc(c, '#6a5a44', 0.35); }
      } else if (k === 3) {
        c = ramp(['#1a1c14', '#22241a', '#2a2c20'], hash(x, y, 3), x, y, 0.8); h = 0.1;
      } else if (k === 7 || k === 9) {
        // nhựa đường nứt nẻ, ổ gà, cỏ mọc qua khe nứt, vết dầu
        const n = fbm(x * 0.05, y * 0.05, 11, 3);
        c = ramp(['#1e1f22', '#26272a', '#2e2f33', '#37383c'], 0.25 + n * 0.55 + (hash(x, y, 12) - 0.5) * 0.25, x, y, 0.7);
        h = 0.3;
        const cr = Math.abs(vnoise(x * 0.09, y * 0.09, 13) - 0.5);
        if (cr < 0.018) { c = '#121214'; h = -0.4; if (hash(x, y, 14) > 0.8) c = '#3a5a22'; }
        const pot = fbm(x * 0.03 + 50, y * 0.03, 15, 2);
        if (pot > 0.7) { c = pot > 0.74 ? '#121316' : '#3a3a3e'; h = pot > 0.74 ? -0.8 : 0.1; }
        if (fbm(x * 0.04 + 9, y * 0.04 + 3, 16, 2) > 0.7) c = mixc(c, '#0a0a10', 0.45);
        if (k === 9 && fbm(x * 0.2, y * 0.2, 17, 2) < 0.68) { c = ramp(['#9a9488', '#b8b2a4', '#cac4b6'], hash(x, y, 18), x, y, 0.5); h = 0.5; }
      } else if (k === 8) {
        const bx = Math.floor(x / 8), by = Math.floor(y / 8);
        const edge = x % 8 === 0 || y % 8 === 0;
        const n = hash(bx, by, 19);
        c = edge ? (hash(x, y, 20) > 0.7 ? '#2e4a1e' : '#2a2a2c') : ramp(['#4a4a4e', '#56565a', '#626266', '#6e6e72'], 0.25 + n * 0.55, x, y, 0.5);
        if (n > 0.93 && !edge) c = mixc(c, '#141416', 0.6);
        h = edge ? 0 : 0.8;
      } else if (k === 4) {
        const furrow = Math.floor(y / 6) % 2 === 0;
        c = ramp(['#2a1c12', '#3a281a', '#4a3424', '#5a4230'], (furrow ? 0.7 : 0.25) + hash(x, y, 4) * 0.3, x, y, 0.8);
        h = furrow ? 0.8 : 0.1;
      }
      P.set(x, y, c, h);
    }
  return {
    map: tex(P, { mip: true, aniso: 8 }),
    normalMap: tex(P.normalCanvas(1.6), { srgb: false, mip: true, aniso: 8 }),
    kindAt: (wx, wz) => kindAt(X(wx), Y(wz)),
  };
}

// ---------- texture mềm (không pixel): sương mù, vệt sáng, phông nền ----------
export function mistTex() {
  const S = 128, cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d'), d = g.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    // fbm tuần hoàn bằng cách trộn 4 góc
    const fx = x / S, fy = y / S;
    const n = (a, b) => fbm(a * 6, b * 6, 41, 4);
    const v = n(fx, fy) * (1 - fx) * (1 - fy) + n(fx - 1, fy) * fx * (1 - fy) + n(fx, fy - 1) * (1 - fx) * fy + n(fx - 1, fy - 1) * fx * fy;
    const i = (y * S + x) * 4;
    d.data[i] = d.data[i + 1] = d.data[i + 2] = 255;
    d.data[i + 3] = clamp((v - 0.35) * 2.4, 0, 1) * 255;
  }
  g.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
export function shaftTex() {
  const Wd = 64, Hd = 256, cv = document.createElement('canvas');
  cv.width = Wd; cv.height = Hd;
  const g = cv.getContext('2d'), d = g.createImageData(Wd, Hd);
  for (let y = 0; y < Hd; y++) for (let x = 0; x < Wd; x++) {
    const u = x / Wd, v = y / Hd;
    const edge = Math.pow(Math.sin(Math.PI * u), 2);
    const streak = 0.65 + 0.35 * Math.sin(u * 37 + Math.sin(u * 13) * 2);
    const a = edge * streak * Math.pow(1 - v, 0.6) * Math.min(1, v * 6);
    const i = (y * Wd + x) * 4;
    d.data[i] = d.data[i + 1] = d.data[i + 2] = 255; d.data[i + 3] = a * 255;
  }
  g.putImageData(d, 0, 0);
  return new THREE.CanvasTexture(cv);
}
// phông nền xa: các lớp rừng/đồi bóng đen (alpha), màu do shader quyết định
export function backdropTex() {
  const Wd = 512, Hd = 128;
  const P = new Pix(Wd, Hd);
  const layers = [
    { base: 70, amp: 18, tree: 0.55, v: 3 },
    { base: 86, amp: 12, tree: 0.75, v: 2 },
    { base: 100, amp: 8, tree: 0.9, v: 1 },
  ];
  layers.forEach((L, li) => {
    for (let x = 0; x < Wd; x++) {
      let top = L.base - fbm(x * 0.01, li * 3, 50 + li, 3) * L.amp * 2;
      const tx = x % 9, th = hash(Math.floor(x / 9), li, 60);
      if (th < L.tree) top -= (4.5 - Math.abs(tx - 4)) * (2 + th * 4);
      for (let y = Math.max(0, Math.floor(top)); y < Hd; y++) P.setA(x, y, [L.v * 60, 0, 0], 255);
    }
  });
  const t = tex(P, { srgb: false });
  return t;
}

// ======================================================================
// THỊ TRẤN HẬU TẬN THẾ: chữ pixel có dấu, mặt tiền cửa hàng / đồn cảnh sát,
// tường & sàn bên trong nhà
// ======================================================================
const GLYPH = {
  '←': ['.....', '..#..', '.#...', '#####', '.#...', '..#..', '.....'],
  '→': ['.....', '..#..', '...#.', '#####', '...#.', '..#..', '.....'],
  '↑': ['..#..', '.###.', '#.#.#', '..#..', '..#..', '..#..', '..#..'],
  '↓': ['..#..', '..#..', '..#..', '..#..', '#.#.#', '.###.', '..#..'],
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  'Đ': ['.###.', '.#..#', '.#..#', '###.#', '.#..#', '.#..#', '.###.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.###.'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  J: ['..###', '...#.', '...#.', '...#.', '#..#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  0: ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  1: ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  2: ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  3: ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  4: ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  5: ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  6: ['.###.', '#....', '#....', '####.', '#...#', '#...#', '.###.'],
  7: ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  8: ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  9: ['.###.', '#...#', '#...#', '.####', '....#', '....#', '.###.'],
  '-': ['.....', '.....', '.....', '.###.', '.....', '.....', '.....'],
  '.': ['.....', '.....', '.....', '.....', '.....', '.....', '..#..'],
  ':': ['.....', '..#..', '.....', '.....', '.....', '..#..', '.....'],
  '!': ['..#..', '..#..', '..#..', '..#..', '..#..', '.....', '..#..'],
  '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
  '/': ['....#', '...#.', '...#.', '..#..', '.#...', '.#...', '#....'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
};
// dấu tiếng Việt (toạ độ tương đối so với góc trên-trái của chữ)
const MARK = {
  '́': [[3, -2], [2, -1]],
  '̀': [[1, -2], [2, -1]],
  '̉': [[1, -3], [2, -3], [3, -2], [2, -1]],
  '̃': [[0, -1], [1, -2], [2, -1], [3, -2], [4, -2]],
  '̂': [[2, -2], [1, -1], [3, -1]],
  '̆': [[1, -2], [3, -2], [2, -1]],
  '̣': [[2, 8]],
  '̛': [[5, -1], [5, 0]],
};
export function textWidth(text, scale = 1) { return [...text.normalize('NFD')].filter((c) => !MARK[c]).length * 6 * scale - scale; }
// vẽ chữ: (x, y) là góc trên-trái của hàng chữ cao 7px (dấu nằm phía trên)
export function drawText(P, x, y, text, color, { scale = 1, shadow = null, glow = null, spray = 0, rng = null } = {}) {
  let cx = x, first = true, hat = false;
  const put = (px, py) => {
    for (let j = 0; j < scale; j++) for (let i = 0; i < scale; i++) {
      const X = cx + px * scale + i, Y = y + py * scale + j;
      if (shadow) P.set(X + scale, Y + scale, shadow, 1.1);
      P.set(X, Y, color, 1.4);
      if (glow) P.glow(X, Y, glow);
    }
  };
  for (const ch of text.toUpperCase().normalize('NFD')) {
    if (MARK[ch]) {
      const stack = hat && ch !== '\u0323' && ch !== '\u031B' && ch !== '\u0302' && ch !== '\u0306';
      for (const [mx, my] of MARK[ch]) put(mx + (stack ? 1 : 0), my - (stack ? 2 : 0));
      if (ch === '\u0302' || ch === '\u0306') hat = true;
      continue;
    }
    if (!first) cx += 6 * scale;
    first = false; hat = false;
    const g = GLYPH[ch] || GLYPH[' '];
    for (let j = 0; j < 7; j++) for (let i = 0; i < 5; i++) if (g[j][i] === '#') {
      if (spray && rng && rng() < spray * 0.12) continue;
      put(i, j);
    }
    // sơn xịt chảy giọt
    if (spray && rng) for (let i = 0; i < 5; i++) if (g[6][i] === '#' && rng() < spray * 0.4) { let dy = 7; while (rng() < 0.65 && dy < 11) put(i, dy++); }
  }
}

// lớp hư hại dùng chung: vết bẩn từ chân tường, muội khói, vết nứt, lỗ đạn, máu
function grime(P, x0, y0, w, h, seed, amt = 1) {
  const r = makeRng(seed + 911);
  for (let y = y0; y < y0 + h; y++)
    for (let x = x0; x < x0 + w; x++) {
      const c = P.get(x, y);
      if (!c) continue;
      const fromBottom = (y - y0) / h;
      const n = fbm(x * 0.08, y * 0.05, seed, 3);
      let k = Math.max(0, (fromBottom - 0.55) * 1.6) * (0.6 + n * 0.6) * amt;
      k += Math.max(0, n - 0.62) * 1.2 * amt;
      if (k > 0.05) P.set(x, y, mixc(c, '#1c1812', Math.min(0.55, k * 0.5)), P.hgt[y * P.w + x]);
    }
  // vết nứt
  for (let k = 0; k < Math.round(3 * amt * w / 60); k++) {
    let x = x0 + Math.floor(r() * w), y = y0 + Math.floor(r() * h * 0.6);
    for (let i = 0; i < 18 + r() * 20; i++) {
      x += Math.round((r() - 0.5) * 2); y += r() < 0.7 ? 1 : 0;
      if (x < x0 || x >= x0 + w || y >= y0 + h) break;
      const c = P.get(x, y); if (c) P.set(x, y, mixc(c, '#141210', 0.6), -0.4);
    }
  }
  // lỗ đạn
  for (let k = 0; k < Math.round(5 * amt * w / 60); k++) {
    const x = x0 + 2 + Math.floor(r() * (w - 4)), y = y0 + 4 + Math.floor(r() * (h - 8));
    P.set(x, y, '#0e0c0c', -0.8); P.set(x + 1, y, '#3a3430', -0.3); P.set(x, y + 1, '#3a3430', -0.3);
  }
}
function bloodSmear(P, x, y, r, seed) {
  const rr = makeRng(seed);
  for (let i = 0; i < 6; i++) {
    const bx = x + (rr() - 0.5) * 5, by = y + (rr() - 0.5) * 3;
    P.ellipse(bx, by, 1 + rr() * 2, 0.8 + rr(), rr() < 0.5 ? '#5a0e0c' : '#7a1410');
    let dy = by; for (let k = 0; k < 2 + rr() * 6; k++) P.set(bx, dy++, '#4a0a0a');
  }
}
function poster(P, x, y, w, h, kind, seed) {
  const rr = makeRng(seed);
  const paper = kind === 'missing' ? '#e8e0c8' : kind === 'wanted' ? '#d8c89a' : '#c8d8e8';
  P.rect(x, y, w, h, paper, 0.3);
  for (let i = 0; i < 3; i++) P.rect(x + 1, y + 1 + i * 2, w - 2, 1, '#2a2a30', 0.3);
  P.rect(x + 2, y + 7, w - 4, h - 10, kind === 'missing' ? '#8a7a6a' : '#5a6a7a', 0.3);
  if (rr() < 0.6) P.rect(x + w - 2, y, 2, 3, mixc(paper, '#000', 0.25));
}

// mặt tiền nhà / cửa hàng / đồn cảnh sát thời hậu tận thế (16px = 1m)
// o: { w, h, floors, kind, wall, door:{x,w,h}, sign, seed, shop:[x0,x1], lit }
export function townFacadeTex(o) {
  const W = Math.round(o.w * PPU), H = Math.round(o.h * PPU);
  const P = new Pix(W, H, { emissive: true });
  const r = makeRng(o.seed || 1);
  const FH = 8;
  const kind = o.kind || 'house';
  const wall = o.wall || 'plaster';
  const pal = o.plaster || ['#a89c88', '#c4b8a0', '#d8ceb8'];
  // nền tường
  for (let y = 0; y < H - FH; y++)
    for (let x = 0; x < W; x++) {
      let c, h = 0.4;
      if (wall === 'brick') {
        const row = Math.floor(y / 4), off = (row & 1) * 4, bx = Math.floor((x + off) / 8);
        const edge = y % 4 === 3 || (x + off) % 8 === 0;
        const n = hash(bx, row, o.seed);
        c = edge ? '#4a3a32' : ramp(o.brick || ['#6a2e22', '#7e3a2a', '#8e4632', '#a0563c'], 0.2 + n * 0.6, x, y, 0.4);
        h = edge ? 0 : 0.8;
      } else if (wall === 'concrete') {
        const n = fbm(x * 0.05, y * 0.05, o.seed, 3);
        c = ramp(pal, 0.5 + (n - 0.5) * 0.8 + (y % 24 === 0 ? -0.25 : 0), x, y, 0.6);
        if (x % 40 === 0) c = mixc(c, '#000', 0.25);
        h = y % 24 === 0 || x % 40 === 0 ? 0 : 0.5;
      } else if (wall === 'plank') {
        const row = Math.floor(y / 5), n = vnoise(x * 0.12 + row * 7, row, o.seed);
        c = y % 5 === 4 ? '#221810' : ramp(['#3e2c1e', '#4e3828', '#5e4632', '#6c523c'], 0.3 + n * 0.55, x, y, 0.5);
        h = y % 5 === 4 ? 0 : 0.5;
      } else {
        const n = fbm(x * 0.07, y * 0.07, o.seed, 3);
        c = ramp(pal, 0.55 + (n - 0.5) * 0.7, x, y, 0.6);
        // mảng vữa bong lộ gạch
        const peel = fbm(x * 0.05 + 30, y * 0.06, o.seed + 5, 3);
        if (peel > 0.68) {
          const row = Math.floor(y / 4), off = (row & 1) * 4;
          c = y % 4 === 3 || (x + off) % 8 === 0 ? '#3e302a' : ramp(['#6a3a2a', '#7a4632', '#8a523a'], hash(x >> 3, row, 3), x, y, 0.4);
          h = 0.1;
        }
      }
      P.set(x, y, c, h);
    }
  for (let y = H - FH; y < H; y++)
    for (let x = 0; x < W; x++) {
      const n = hash(x >> 2, y >> 1, o.seed + 9);
      P.set(x, y, y === H - FH ? '#5a5650' : ramp(['#2e2c2a', '#3a3836', '#46423e', '#524e48'], 0.3 + n * 0.5, x, y, 0.5), y === H - FH ? 1 : 0.6);
    }
  const floors = o.floors || 1;
  const wallH = H - FH, floorH = wallH / floors;
  // viền tầng
  for (let f = 1; f < floors; f++) {
    const y = Math.round(wallH - f * floorH);
    P.rect(0, y - 1, W, 3, (x, yy) => (yy === y - 1 ? '#8a8478' : yy === y + 1 ? '#3a3632' : '#6a645a'), 1.2);
  }
  const wins = [];
  const door = o.door ? { x: Math.round((o.door.x - o.door.w / 2) * PPU), w: Math.round(o.door.w * PPU), h: Math.round((o.door.h || 2.1) * PPU) } : null;
  if (door) door.y = H - door.h;
  // cửa sổ các tầng
  for (let f = 0; f < floors; f++) {
    if (f === 0 && o.shop) continue;
    const n = o.winPerFloor || Math.max(1, Math.floor((o.w - 1) / 2.6));
    const top = Math.round(wallH - (f + 1) * floorH + floorH * 0.26);
    for (let i = 0; i < n; i++) {
      const cxp = Math.round(W * (i + 1) / (n + 1));
      if (f === 0 && door && cxp + 9 > door.x - 3 && cxp - 9 < door.x + door.w + 3) continue;
      const roll = r();
      const state = kind === 'police' && f === 0 ? 'barred' : roll < (o.litChance || 0.06) ? 'lit' : roll < 0.4 ? 'dark' : roll < 0.7 ? 'boarded' : 'broken';
      wins.push({ x: cxp - 7, y: top, w: 14, h: 18, state, f });
    }
  }
  for (const w of wins) {
    for (let y = w.y - 1; y < w.y + w.h + 2; y++) for (let x = w.x - 1; x < w.x + w.w + 1; x++) P.set(x, y, o.trim || '#5a5048', 0.9);
    for (let y = w.y; y < w.y + w.h; y++)
      for (let x = w.x; x < w.x + w.w; x++) {
        const fx = x - w.x, fy = y - w.y;
        if (fx === 6 || fx === 7 || fy === 8) { P.set(x, y, '#2a2420', 0.7); continue; }
        if (w.state === 'lit') { const c = ramp(['#c86a2a', '#f09a40', '#ffc870'], 0.3 + fy / w.h * 0.6, x, y, 0.5); P.set(x, y, c, -0.5); P.glow(x, y, c); }
        else if (w.state === 'dark' || w.state === 'barred') P.set(x, y, (fx + fy) % 11 < 2 ? '#3a4658' : '#141a26', -0.5);
        else if (w.state === 'broken') P.set(x, y, hash(fx, fy, w.x) > 0.7 && (fx * 2 + fy) % 5 < 2 ? '#56647a' : '#08090c', -0.8);
        else P.set(x, y, '#0c0c0e', -0.8);
      }
    if (w.state === 'boarded') {
      for (const [a, b, c] of [[2, 1, '#8a6040'], [w.h - 7, -1, '#7a5434'], [8, 0, '#94704a']]) {
        for (let i = -2; i < w.w + 2; i++) {
          const yy = w.y + a + Math.round(i * b * 0.25);
          for (let t = 0; t < 3; t++) P.set(w.x + i, yy + t, t === 0 ? mixc(c, '#ffffff', 0.15) : c, 1.3);
        }
      }
    }
    if (w.state === 'barred') for (let x = w.x + 1; x < w.x + w.w; x += 3) for (let y = w.y - 1; y < w.y + w.h + 1; y++) P.set(x, y, '#2a2a30', 1.4);
    for (let x = w.x - 2; x < w.x + w.w + 2; x++) { P.set(x, w.y + w.h + 1, '#8a8478', 1.2); P.set(x, w.y + w.h + 2, '#4a4640', 1); }
    // vệt muội khói phía trên cửa sổ vỡ
    if (w.state === 'broken' && r() < 0.6) for (let y = w.y - 14; y < w.y; y++) for (let x = w.x; x < w.x + w.w; x++) {
      const c = P.get(x, y); if (!c) continue;
      const k = (1 - (w.y - y) / 14) * (0.5 + 0.5 * vnoise(x * 0.3, y * 0.2, w.x)) * 0.7;
      P.set(x, y, mixc(c, '#141210', k));
    }
  }
  // tủ kính cửa hàng + cửa cuốn kéo xuống một nửa
  if (o.shop) {
    const sx0 = Math.round(o.shop[0] * PPU), sx1 = Math.round(o.shop[1] * PPU);
    const top = Math.round(wallH - floorH + floorH * 0.18), bot = H - FH - 2;
    for (let y = top - 2; y < bot + 2; y++) for (let x = sx0 - 2; x < sx1 + 2; x++) P.set(x, y, '#3a3a40', 1);
    const roll = Math.round(top + (bot - top) * (0.3 + r() * 0.35));
    for (let y = top; y < bot; y++)
      for (let x = sx0; x < sx1; x++) {
        if (door && x >= door.x - 2 && x < door.x + door.w + 2) continue;
        const fx = x - sx0;
        if (y < roll) {
          // cửa cuốn tôn
          const rib = (y - top) % 3;
          let c = rib === 0 ? '#8a8e94' : rib === 1 ? '#6a6e74' : '#4e5258';
          const rust = fbm(x * 0.1, y * 0.15, o.seed + 2, 3);
          if (rust > 0.62) c = mixc(c, '#7a4a2a', (rust - 0.62) * 2.2);
          P.set(x, y, c, rib === 0 ? 1 : 0.6);
        } else {
          const shelf = (y - roll) % 7 === 0;
          const goods = !shelf && hash(fx >> 1, (y - roll) / 7 | 0, o.seed) > 0.55;
          const crack = hash(fx, y, 5) > 0.97;
          let c = shelf ? '#2a2a2e' : goods ? r.pick(['#5a2a22', '#2a4a5a', '#5a5a2a', '#3a2a4a']) : '#0e1014';
          if ((fx + (y - roll)) % 13 < 2 && !goods) c = '#2e3644';
          if (crack) c = '#8a9aaa';
          P.set(x, y, c, -0.5);
        }
      }
    for (let x = sx0; x < sx1; x++) P.set(x, roll, '#2a2a2e', 1.2);
  }
  // cửa ra vào (mở toang, bên trong tối)
  if (door) {
    for (let y = door.y - 2; y < H; y++) for (let x = door.x - 2; x < door.x + door.w + 2; x++) P.set(x, y, o.trim || '#4a4038', 1);
    for (let y = door.y; y < H; y++)
      for (let x = door.x; x < door.x + door.w; x++) {
        const fx = x - door.x;
        let c = '#08070a';
        if (fx < 4) c = fx === 3 ? '#2a1c12' : ramp(['#3a2a1c', '#4a3626', '#5a4430'], hash(fx, y >> 2, 3), x, y, 0.5);
        P.set(x, y, c, fx < 4 ? 0.8 : -1);
      }
  }
  // vạch xanh đồn cảnh sát
  if (kind === 'police' || o.stripe) {
    const y0 = wallH - floorH - 6, sc = o.stripe || ['#4a7ac8', '#2a4a8a'];
    P.rect(0, y0, W, 4, (x, y) => (y === y0 ? sc[0] : sc[1]), 1.1);
  }
  // biển hiệu
  if (o.sign) {
    const s = o.sign, tw = textWidth(s.text);
    const bw = Math.max(tw + 10, Math.round((s.w || 0) * PPU)), bh = 16;
    const bx = Math.round((s.x !== undefined ? s.x * PPU : W / 2) - bw / 2);
    const by = Math.round(s.y !== undefined ? s.y * PPU : wallH - floorH + 2);
    for (let y = by; y < by + bh; y++) for (let x = bx; x < bx + bw; x++) {
      const edge = y === by || y === by + bh - 1 || x === bx || x === bx + bw - 1;
      P.set(x, y, edge ? (s.edge || '#d8d0c0') : s.bg || '#1e4a8a', edge ? 1.4 : 1.1);
      if (s.lit && !edge) P.glow(x, y, mixc(s.bg || '#1e4a8a', '#000', 0.4));
    }
    drawText(P, bx + Math.round((bw - tw) / 2), by + 5, s.text, s.fg || '#f8f0d8', { shadow: '#0a0a0a', glow: s.lit ? (s.fg || '#f8f0d8') : null });
    o.signBox = { x: bx, y: by, w: bw, h: bh };
    if (s.cross) { const cx = bx - 9, cy = by + 1; P.rect(cx, cy, 8, 11, '#e8e8e0', 1.2); P.rect(cx + 3, cy + 2, 2, 7, '#2a9a4a', 1.4); P.rect(cx + 1, cy + 4, 6, 3, '#2a9a4a', 1.4); }
  }
  grime(P, 0, 0, W, H - FH, o.seed || 1, o.damage === undefined ? 1 : o.damage);
  // áp phích, vết máu, graffiti
  for (let k = 0; k < (o.posters || 0); k++) {
    const x = 6 + Math.floor(r() * (W - 22)), y = Math.round(wallH - floorH * 0.55);
    if (door && x + 12 > door.x - 2 && x < door.x + door.w + 2) continue;
    poster(P, x, y, 10, 14, r() < 0.6 ? 'missing' : 'notice', o.seed + k);
  }
  if (o.blood) bloodSmear(P, Math.round(o.blood * W), Math.round(wallH - 20), 3, o.seed);
  for (const gr of o.graffiti || []) {
    drawText(P, Math.round(gr.x * PPU), Math.round(gr.y * PPU), gr.text, gr.col || '#c8241c', { scale: gr.scale || 2, spray: 0.6, rng: makeRng(o.seed + 77) });
  }
  return {
    map: tex(P, { mip: true, aniso: 4 }),
    emissiveMap: tex(P.emissiveCanvas(), { mip: true }),
    normalMap: tex(P.normalCanvas(1.8), { srgb: false, mip: true }),
    wins, door,
  };
}

// tường bên trong (giấy dán tường, gạch men, bê tông...)
export function roomWallTex(o) {
  const W = Math.round(o.w * PPU), H = Math.round(o.h * PPU);
  const P = new Pix(W, H);
  const r = makeRng(o.seed || 3);
  const k = o.kind || 'house';
  const wain = k === 'house' ? 14 : k === 'garage' ? 0 : 18;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let c, h = 0.3;
      const fy = H - 1 - y;
      if (fy < 2) c = '#2a2420';
      else if (fy < wain) {
        if (k === 'house') c = (x % 6 === 0) ? '#4a3220' : ramp(['#5a3e28', '#6a4a30', '#7a5638'], hash(x >> 1, 3, o.seed), x, y, 0.4);
        else c = (x % 8 === 0 || fy % 8 === 0) ? '#8a9090' : ramp(k === 'pharmacy' ? ['#c8d8d0', '#d8e8e0', '#e8f4ee'] : ['#b8c0c4', '#c8d0d4', '#d8e0e4'], hash(x >> 3, fy >> 3, 7), x, y, 0.4);
      } else if (k === 'house') {
        const st = (x % 12 < 6) ? 0 : 1;
        c = ramp(o.paper || (st ? ['#6a7a5a', '#7a8a68', '#8a9a76'] : ['#7a8a68', '#8a9a76', '#9aaa84']), 0.5 + (hash(x, y >> 2, 2) - 0.5) * 0.4, x, y, 0.5);
        if ((x + y) % 12 === 0 && st) c = '#a8b890';
      } else if (k === 'garage') {
        const row = Math.floor(y / 8), off = (row & 1) * 8;
        c = y % 8 === 7 || (x + off) % 16 === 0 ? '#3a3a3c' : ramp(['#55575a', '#626468', '#707276'], hash((x + off) >> 4, row, 5), x, y, 0.5);
      } else {
        c = ramp(k === 'police' ? ['#7a8494', '#8a94a4', '#9aa4b4'] : k === 'class' ? ['#b8c0a0', '#c8d0b0', '#d8dcc0'] : ['#b8b0a0', '#c8c0b0', '#d8d0c0'], 0.5 + (fbm(x * 0.06, y * 0.06, 4, 2) - 0.5) * 0.6, x, y, 0.5);
      }
      P.set(x, y, c, h);
    }
  if (k === 'police') P.rect(0, H - 34, W, 3, '#2a4a8a', 0.6);
  if (o.board) {
    // bảng đen + chữ phấn (lớp học)
    const bw = Math.min(W - 20, 64), bx = Math.round((W - bw) / 2), by = Math.round(H * 0.22), bh = 22;
    P.rect(bx - 2, by - 2, bw + 4, bh + 4, '#6a4a30', 1);
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) P.set(bx + x, by + y, ramp(['#1e3a2a', '#244232', '#2a4a38'], hash(x >> 2, y >> 2, 9), x, y, 0.3), 0.2);
    drawText(P, bx + 3, by + 3, o.board, '#e8e8dc');
    for (let i = 0; i < 3; i++) P.rect(bx + 4 + Math.floor(r() * (bw - 20)), by + 13 + i * 3, 8 + Math.floor(r() * 10), 1, '#c8c8bc', 0.2);
    P.rect(bx, by + bh + 2, bw, 2, '#8a7a6a', 0.8);
  }
  // tranh, đồng hồ, áp phích, bảng tin
  const deco = Math.max(1, Math.floor(o.w / 2.5));
  for (let i = 0; i < deco; i++) {
    const x = Math.floor(8 + r() * (W - 26)), y = Math.floor(H * 0.2 + r() * H * 0.15);
    if (k === 'house') {
      const fw = 10 + Math.floor(r() * 6), fh = 8 + Math.floor(r() * 4);
      P.rect(x, y, fw, fh, '#4a3020', 1); P.rect(x + 1, y + 1, fw - 2, fh - 2, r.pick(['#5a7a9a', '#8a6a4a', '#6a8a5a', '#9a8a6a']), 0.8);
      P.rect(x + 2, y + fh - 4, fw - 4, 2, '#3a5a3a', 0.8);
    } else if (k === 'police') {
      poster(P, x, y, 10, 14, 'wanted', o.seed + i);
    } else if (k === 'garage') {
      P.rect(x, y, 22, 14, '#6a5a3a', 0.6);
      for (let t = 0; t < 4; t++) P.rect(x + 2 + t * 5, y + 2, 2, 8 - (t % 2) * 3, '#2a2a2e', 1);
    } else {
      P.rect(x, y, 14, 9, r.pick(['#c83a2a', '#2a6ac8', '#e8c040']), 0.6);
      drawText(P, x + 2, y + 1, '%', '#ffffff');
    }
  }
  grime(P, 0, 0, W, H, (o.seed || 3) + 40, 0.8);
  if (r() < 0.7) bloodSmear(P, Math.floor(W * (0.2 + r() * 0.6)), Math.floor(H * 0.55), 3, o.seed + 5);
  const map = tex(P, { mip: true, aniso: 4 });
  return { map, normalMap: tex(P.normalCanvas(1.2), { srgb: false, mip: true }) };
}

// sàn trong nhà (tile lặp 2x2m)
export function floorTex(kind, seed = 1) {
  const S = 32, P = new Pix(S, S);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      let c, h = 0.4;
      if (kind === 'wood') {
        const row = Math.floor(y / 4), off = (row * 11) % 32;
        const n = vnoise((x + off) * 0.2, row * 2.3, seed);
        c = y % 4 === 3 || (x + off) % 32 === 0 ? '#2a1c12' : ramp(['#4e3624', '#5e4430', '#6e523a', '#7e6044'], 0.25 + n * 0.6, x, y, 0.5);
        h = y % 4 === 3 ? 0 : 0.6;
      } else if (kind === 'tile') {
        const t = ((x >> 3) + (y >> 3)) & 1;
        c = x % 8 === 0 || y % 8 === 0 ? '#5a5a58' : t ? ramp(['#b8b4a8', '#c8c4b8', '#d4d0c4'], hash(x, y, seed), x, y, 0.4) : ramp(['#3e5a5a', '#4a6868', '#567474'], hash(x, y, seed), x, y, 0.4);
        h = x % 8 === 0 || y % 8 === 0 ? 0 : 0.7;
      } else if (kind === 'lino') {
        c = ramp(['#4a5260', '#545c6a', '#5e6674', '#6a7280'], hash(x >> 1, y >> 1, seed) * 0.6 + fbm(x * 0.1, y * 0.1, seed, 2) * 0.4, x, y, 0.6);
        if (x % 16 === 0 || y % 16 === 0) c = '#3a404c';
      } else {
        const n = fbm(x * 0.12, y * 0.12, seed, 3);
        c = ramp(['#3e3e40', '#4a4a4c', '#565658', '#626264'], n, x, y, 0.6);
        if (x % 32 === 0 || y % 32 === 0) c = '#2e2e30';
        if (fbm(x * 0.08 + 20, y * 0.08, seed + 3, 2) > 0.66) c = mixc(c, '#141418', 0.5);
      }
      if (hash(x, y, seed + 9) > 0.992) c = mixc(c, '#6a1a14', 0.6);
      P.set(x, y, c, h);
    }
  return { map: tex(P, { repeat: true, mip: true, aniso: 4 }), normalMap: tex(P.normalCanvas(1.4), { repeat: true, srgb: false, mip: true }) };
}

// mặt sơn phẳng có chữ (biển hiệu rời, vạch chữ H bãi đáp...)
export function signTex(text, { bg = '#1e4a8a', fg = '#f8f0d8', edge = '#d8d0c0', pad = 5, lit = false, h = 16 } = {}) {
  const tw = textWidth(text), W = tw + pad * 2, H = h;
  const P = new Pix(W, H, { emissive: true });
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const e = y === 0 || x === 0 || y === H - 1 || x === W - 1;
    P.set(x, y, e ? edge : bg, e ? 1.2 : 1);
    if (lit && !e) P.glow(x, y, mixc(bg, '#000', 0.5));
  }
  drawText(P, pad, Math.round((H - 7) / 2) + 1, text, fg, { shadow: '#0a0a0a', glow: lit ? fg : null });
  if (!edge) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (P.get(x, y) && P.get(x, y).join() === rgb(bg).join()) P.data[(y * W + x) * 4 + 3] = 0;
  return { map: tex(P, { mip: true }), emissiveMap: tex(P.emissiveCanvas(), { mip: true }), w: W / PPU, h: H / PPU };
}

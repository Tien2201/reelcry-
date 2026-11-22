// Nhân vật & zombie dạng khối (voxel) 3D, dựng từ chính hình pixel của từng người:
// đầu + thân lấy màu từ ảnh nhìn trước / bên / sau, tay chân là các khối riêng để đung đưa khi đi,
// zombie giơ hai tay ra trước. Đối tượng trả về giữ cùng "giao diện" với sprite cũ (group, mesh, mat, xr, blob…).
import * as THREE from 'three';
import { PPU, spriteLit } from './pixel.js';
import { voxelSource } from './sprites.js';

const V = 1 / PPU;
const DIR_ANG = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 };
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// ---------- màu ----------
const LIN = new Map();
const tmpC = new THREE.Color();
function lin(key) {
  let v = LIN.get(key);
  if (!v) { tmpC.setRGB(((key >> 16) & 255) / 255, ((key >> 8) & 255) / 255, (key & 255) / 255, THREE.SRGBColorSpace); v = [tmpC.r, tmpC.g, tmpC.b]; LIN.set(key, v); }
  return v;
}
const hex = (s) => parseInt(String(s).replace('#', '').slice(0, 6), 16);
function px(P, x, y) {
  if (x < 0 || y < 0 || x >= P.w || y >= P.h) return -1;
  const i = (y * P.w + x) * 4, d = P.data;
  return d[i + 3] ? (d[i] << 16) | (d[i + 1] << 8) | d[i + 2] : -1;
}
function epx(P, x, y) {
  if (!P.emis || x < 0 || y < 0 || x >= P.w || y >= P.h) return -1;
  const i = (y * P.w + x) * 4, d = P.emis;
  return d[i + 3] ? (d[i] << 16) | (d[i + 1] << 8) | d[i + 2] : -1;
}

// ---------- ghép mặt khối (greedy meshing) ----------
// mặt: 0 +x, 1 -x, 2 +y, 3 -y, 4 +z, 5 -z ; color(x,y,z,mặt) → số màu hoặc -1 (không vẽ)
function mesher(dims, solid, color, out, off, push = 0, gain = 1) {
  const at = (p) => p[0] >= 0 && p[1] >= 0 && p[2] >= 0 && p[0] < dims[0] && p[1] < dims[1] && p[2] < dims[2] && solid(p[0], p[1], p[2]);
  const p = [0, 0, 0], q = [0, 0, 0];
  for (let d = 0; d < 3; d++) {
    const u = (d + 1) % 3, v = (d + 2) % 3, nu = dims[u], nv = dims[v];
    const mask = new Int32Array(nu * nv);
    for (const sg of [1, -1]) {
      const face = d * 2 + (sg > 0 ? 0 : 1);
      for (let i = 0; i < dims[d]; i++) {
        for (let b = 0; b < nv; b++) for (let a = 0; a < nu; a++) {
          p[d] = i; p[u] = a; p[v] = b; q[d] = i + sg; q[u] = a; q[v] = b;
          mask[a + b * nu] = at(p) && !at(q) ? color(p[0], p[1], p[2], face) : -1;
        }
        for (let b = 0; b < nv; b++) for (let a = 0; a < nu;) {
          const c = mask[a + b * nu];
          if (c < 0) { a++; continue; }
          let w = 1; while (a + w < nu && mask[a + w + b * nu] === c) w++;
          let h = 1;
          grow: while (b + h < nv) { for (let k = 0; k < w; k++) if (mask[a + k + (b + h) * nu] !== c) break grow; h++; }
          for (let y2 = 0; y2 < h; y2++) for (let k = 0; k < w; k++) mask[a + k + (b + y2) * nu] = -1;
          const c0 = [0, 0, 0]; c0[d] = (sg > 0 ? i + 1 : i) + sg * push; c0[u] = a; c0[v] = b;
          const du = [0, 0, 0]; du[u] = w; const dv = [0, 0, 0]; dv[v] = h;
          quad(out, c0, du, dv, d, sg, c, off, gain);
          a += w;
        }
      }
    }
  }
}
function quad(out, c0, du, dv, d, sg, c, off, gain) {
  const base = out.pos.length / 3;
  const P = [c0, [c0[0] + du[0], c0[1] + du[1], c0[2] + du[2]], [c0[0] + du[0] + dv[0], c0[1] + du[1] + dv[1], c0[2] + du[2] + dv[2]], [c0[0] + dv[0], c0[1] + dv[1], c0[2] + dv[2]]];
  const col = lin(c), n = [0, 0, 0]; n[d] = sg;
  for (const v of P) {
    out.pos.push((v[0] + off[0]) * V, (v[1] + off[1]) * V, (v[2] + off[2]) * V);
    out.nrm.push(n[0], n[1], n[2]);
    out.col.push(col[0] * gain, col[1] * gain, col[2] * gain);
  }
  if (sg > 0) out.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  else out.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
}
const newOut = () => ({ pos: [], nrm: [], col: [], idx: [] });
function toGeo(out) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(out.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(out.nrm, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(out.col, 3));
  g.setIndex(out.idx);
  g.computeBoundingSphere();
  return g;
}
// khối hộp đơn giản (vũ khí): [x0,y0,z0,x1,y1,z1,màu] theo đơn vị điểm ảnh
function boxesGeo(list) {
  const out = newOut();
  for (const [x0, y0, z0, x1, y1, z1, c] of list) {
    const k = hex(c), s = [x1 - x0, y1 - y0, z1 - z0], o = [x0, y0, z0];
    for (let d = 0; d < 3; d++) {
      const u = (d + 1) % 3, v = (d + 2) % 3;
      for (const sg of [1, -1]) {
        const c0 = [o[0], o[1], o[2]]; c0[d] = sg > 0 ? o[d] + s[d] : o[d];
        const du = [0, 0, 0]; du[u] = s[u]; const dv = [0, 0, 0]; dv[v] = s[v];
        quad(out, c0, du, dv, d, sg, k, [0, 0, 0], 1);
      }
    }
  }
  return toGeo(out);
}

// ---------- dựng hình khối cho một bộ ảnh ----------
const CACHE = new WeakMap();
function buildParts(src) {
  const S = voxelSource(src), s = S.spec, pal = S.pal, Z = !!S.o.zombie;
  const W = s.fw, H = s.fh, cx = s.cx, t0 = s.torsoTop, t1 = s.torsoBot;
  const F = S.front, SD = S.side, B = S.back;
  const row = (j) => H - 1 - j;           // chỉ số khối theo chiều cao → hàng ảnh
  // đầu + thân: giao của hình nhìn trước và nhìn bên
  const solidU = (i, j, k) => { const r = row(j); return r <= t1 && px(F, i, r) >= 0 && px(SD, k, r) >= 0; };
  const colU = (i, j, k, f) => {
    const r = row(j), fr = px(F, i, r), bk = px(B, W - 1 - i, r);
    if (f === 4) return fr;
    if (f === 5) return bk >= 0 ? bk : fr;
    if (f <= 1) { const sd = px(SD, k, r); return sd >= 0 ? sd : fr; }
    return k >= cx ? fr : (bk >= 0 ? bk : fr);
  };
  const up = newOut();
  const hipY = H - 1 - t1;                 // đáy thân (tính theo khối)
  mesher([W, H, W], solidU, colU, up, [-cx, -hipY, -cx]);
  let zMin = 0;
  for (let k = 0; k < W && !zMin; k++) for (let j = 0; j < H && !zMin; j++) for (let i = 0; i < W; i++) if (solidU(i, j, k)) { zMin = k - cx; break; }
  // mắt zombie phát sáng
  let glow = null;
  if (Z) {
    const g = newOut();
    mesher([W, H, W], solidU, (i, j, k, f) => (f === 4 ? epx(F, i, row(j)) : f <= 1 ? epx(SD, k, row(j)) : -1), g, [-cx, -hipY, -cx], 0.06, 3.5);
    if (g.idx.length) glow = toGeo(g);
  }
  // tay: ống tay áo + bàn tay (zombie: tay áo rách ngắn, cẳng tay dài)
  const aw = s.armW, ad = Math.max(2, aw), L = Z ? 8 : 7, sleeve = Z ? 3 : 5;
  const top = hex(pal.top), topS = hex(pal.topS), skin = hex(pal.skin), skinS = hex(pal.skinS);
  const armCol = (i, j, k, f) => {
    const r = L - 1 - j;
    if (r < sleeve) return f === 4 || f === 2 ? (Z ? topS : top) : topS;
    return f === 5 || f === 3 || r === L - 1 ? skinS : skin;
  };
  const arm = newOut();
  mesher([aw, L, ad], () => true, armCol, arm, [-aw / 2, -L, -ad / 2]);
  // chân: quần + giày (mũi giày nhô ra trước)
  const lw = s.legW, ld = Math.max(2, lw), LL = s.feet - s.legTop + 1, shoeN = s.shoeH;
  const pants = hex(pal.pants), pantsS = hex(pal.pantsS), shoe = hex(pal.shoe), shoeS = hex(pal.shoeS);
  const legSolid = (i, j, k) => k < ld || j < shoeN;
  const legCol = (i, j, k, f) => {
    if (j < shoeN) return j === 0 || f === 3 ? shoeS : shoe;
    return f === 4 || f === 2 ? pants : pantsS;
  };
  const leg = newOut();
  mesher([lw, LL, ld + 1], legSolid, legCol, leg, [-lw / 2, -LL, -ld / 2]);
  const belly = s.belly ? 1 : 0;
  return {
    upper: toGeo(up), glow, arm: toGeo(arm), leg: toGeo(leg),
    hipY: hipY * V, backZ: -zMin * V,
    // vai: tâm cột tay theo ảnh nhìn trước, đỉnh tay ở hàng t0+1
    armX: [(cx - s.torsoHW - aw - belly + aw / 2 - cx) * V, (cx + s.torsoHW + belly + aw / 2 - cx) * V],
    shoulderY: (H - 1 - t0) * V - 0.5 * V,
    legX: [(cx - s.legGap / 2 - lw + lw / 2 - cx) * V, (cx + s.legGap / 2 + lw / 2 - cx) * V],
    hipTop: LL * V,
    armLen: L * V, zombie: Z, kind: S.o.kind || 'survivor',
    gun: pal.gun || '#26262e', gunL: pal.gunL || '#6a6a7c',
  };
}
function partsFor(atlas) {
  let p = CACHE.get(atlas);
  if (!p) { p = buildParts(atlas.src); CACHE.set(atlas, p); }
  return p;
}

// ---------- vũ khí cầm tay (toạ độ theo tay phải, gốc ở bàn tay; tay buông: +z là phía trước) ----------
const WCACHE = new Map();
function weaponGeo(w, gun, gunL) {
  const key = w + gun;
  if (WCACHE.has(key)) return WCACHE.get(key);
  let L = null;
  const wood = '#8a5a32', woodD = '#6a4424';
  if (w === 'knife') L = [[-0.5, -1.2, -0.5, 0.5, 0.2, 1.4, '#4a2e1e'], [-0.4, -0.9, 1.4, 0.4, -0.1, 5.2, '#dce0e8']];
  else if (w === 'club') { L = []; for (let k = 0; k < 9; k++) L.push([-0.7, -0.6 + k * 0.62, 0.4 + k * 0.78, 0.7, 0.8 + k * 0.62, 1.8 + k * 0.78, k > 5 ? woodD : wood]); L.push([-0.9, 4.6, 6.6, 0.9, 5.2, 7.2, '#9a9aa0']); }
  else if (w === 'spear') L = [[-0.5, -5, -0.5, 0.5, 14, 0.5, '#8a6a42'], [-0.9, 14, -0.9, 0.9, 16.5, 0.9, '#c8c8d0'], [-0.4, 16.5, -0.4, 0.4, 18, 0.4, '#e8e8f0']];
  // súng: tay giơ ra trước nên nòng chạy theo -y của cánh tay, báng súng chúc xuống (-z)
  else if (w === 'pistol') L = [[-0.6, -6, -0.6, 0.6, -0.5, 1.2, gun], [-0.55, -6, 0.6, 0.55, -2, 1.3, gunL], [-0.5, -2.2, -2.4, 0.5, -0.8, -0.4, gun]];
  else if (w === 'shotgun') L = [[-0.6, -13, -0.4, 0.6, -0.5, 0.9, gun], [-0.55, -13, 0.8, 0.55, -6, 1.0, gunL], [-0.8, -9, -1.2, 0.8, -6, -0.2, wood], [-0.7, -0.8, -1.3, 0.7, 3, 0.8, wood]];
  else if (w === 'smg') L = [[-1, -8, -0.9, 1, -0.6, 1.4, gun], [-0.8, -8, 1.3, 0.8, -3, 1.6, gunL], [-0.6, -5, -3.4, 0.6, -3.6, -0.8, gun], [-0.5, -2, -2.4, 0.5, -0.8, -0.8, gun]];
  else if (w === 'bow') {
    L = [];
    for (let z = -7; z < 7; z++) { const b = 1.6 * (1 - ((z + 0.5) / 7) ** 2); L.push([-0.5, -2.2 - b, z, 0.5, -1.2 - b, z + 1, z === 0 || z === -1 ? '#3a2414' : '#8a5a2a']); }
    L.push([-0.15, -1.4, -6.5, 0.15, -1.1, 6.5, '#e8e0d0']);
  }
  const g = L ? boxesGeo(L) : null;
  WCACHE.set(key, g);
  return g;
}
const AIMED = { pistol: 1, shotgun: 2, smg: 2, bow: 2 };

// ---------- tạo một nhân vật khối ----------
const GLOW_MAT = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
export function makeModel(atlasList, xray, blob) {
  const P = partsFor(atlasList[0]);
  const mat = spriteLit(new THREE.MeshLambertMaterial({ vertexColors: true }), 0.5);
  // x-ray: vẽ TRƯỚC nhân vật (renderOrder nhỏ hơn), chỉ hiện chỗ bị tường che — không tự che chính mình
  const xmat = new THREE.MeshBasicMaterial({ color: new THREE.Color(xray).multiplyScalar(0.55), blending: THREE.AdditiveBlending, depthFunc: THREE.GreaterDepth, depthWrite: false, fog: false });
  const xclones = [];
  const part = (geo, m = mat) => {
    const o = new THREE.Mesh(geo, m);
    o.castShadow = m === mat; o.renderOrder = 2;
    if (m === mat) { const x = new THREE.Mesh(geo, xmat); x.renderOrder = 1; o.add(x); xclones.push(x); }
    return o;
  };
  const group = new THREE.Group(), yaw = new THREE.Group(), mesh = new THREE.Group(), upper = new THREE.Group();
  group.add(yaw); yaw.add(mesh); mesh.add(upper);
  upper.position.y = P.hipY;
  upper.add(part(P.upper));
  if (P.glow) { const g = new THREE.Mesh(P.glow, GLOW_MAT); g.renderOrder = 2; upper.add(g); }
  const pivot = (x, y, geo) => { const g = new THREE.Group(); g.position.set(x, y, 0); g.add(part(geo)); return g; };
  const armR = pivot(P.armX[0], P.shoulderY - P.hipY, P.arm), armL = pivot(P.armX[1], P.shoulderY - P.hipY, P.arm);
  upper.add(armR, armL);
  const legR = pivot(P.legX[0], P.hipTop, P.leg), legL = pivot(P.legX[1], P.hipTop, P.leg);
  mesh.add(legR, legL);
  // vũ khí: một khối cho mỗi loại, gắn vào bàn tay phải
  const hand = new THREE.Group(); hand.position.y = -P.armLen; armR.add(hand);
  const weapons = atlasList.map((a) => (a.src && a.src.o && a.src.o.weapon) || 'fist');
  const wMesh = {};
  const setWeapon = (i) => {
    const w = weapons[i] || 'fist';
    if (s.weapon === w) return;
    s.weapon = w;
    for (const k in wMesh) wMesh[k].visible = false;
    if (!wMesh[w]) { const g = weaponGeo(w, P.gun, P.gunL); wMesh[w] = g ? new THREE.Mesh(g, mat) : new THREE.Object3D(); if (g) wMesh[w].castShadow = true; hand.add(wMesh[w]); }
    wMesh[w].visible = true;
  };
  group.add(blob);
  const xr = {
    _v: true,
    get visible() { return this._v; },
    set visible(v) { this._v = v; for (const x of xclones) x.visible = v; },
  };
  const a0 = atlasList[0];
  const s = {
    is3d: true, group, mesh, mat, xmat, xr, blob, yawNode: yaw, upper, armR, armL, legR, legL,
    maps: [], emap: null, shadow: null, cur: 0, w: a0.w, h: a0.h,
    P, weapon: null, setWeapon,
    yaw: 0, vx: 0, vz: 0, phase: 0, amp: 0, lx: null, lz: null, atk: 0, atkMax: 0.28, busy: 0, dir: 'down', fr: 0, ang: null, seed: Math.random() * 10,
  };
  setWeapon(0);
  return s;
}
// ---------- mèo đột biến (4 chân, dựng thẳng từ khối) ----------
const CAT = {};
function hsh(x, y, z) { let h = (x * 73856093) ^ (y * 19349663) ^ (z * 83492791); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function catParts() {
  if (CAT.body) return CAT;
  const fur = hex('#8a6a48'), furD = hex('#5e4632'), belly = hex('#b49674'), rot = hex('#7d8c62'), rotD = hex('#5a6848'), blood = hex('#7e1212');
  const bone = hex('#d8d0b8'), sock = hex('#200808'), mouth = hex('#2a0a0a'), earIn = hex('#a8706a'), nose = hex('#3a2420');
  const X = 6, Y = 16, Z = 22, ox = -3, oz = -11;
  const solid = (gx, gy, gz) => {
    const x = gx + ox, y = gy, z = gz + oz;
    if (y >= 5 && y < 10 && z >= -7 && z < 5) return true;                       // thân
    if (y >= 7 && y < 13 && z >= 4 && z < 10) return true;                       // đầu
    if (y >= 13 && y < 15 && z >= 6 && z < 8 && (x <= -2 || x >= 1)) return true;  // tai
    if (y >= 8 && y < 10 && z === 10 && x >= -1 && x < 1) return true;           // mõm
    return false;
  };
  const col = (gx, gy, gz, f) => {
    const x = gx + ox, y = gy, z = gz + oz, head = z >= 4 && y >= 7;
    if (y >= 13) return f === 4 ? earIn : furD;
    if (head && f === 4) {
      if (y === 11 && (x === -2 || x === 1)) return sock;
      if (y === 8 && x >= -2 && x < 2) return x === -2 || x === 1 ? bone : mouth;
      if (z === 10) return y === 9 ? nose : fur;
    }
    if (f === 3) return belly;
    const r = hsh(Math.floor(x / 2), Math.floor(y / 2), Math.floor(z / 2));
    if (!head && r < 0.16) return f === 2 ? rotD : rot;                          // da thối lộ ra
    if (!head && r > 0.93) return blood;
    if (!head && (z + 20) % 3 === 0 && f !== 4) return furD;                     // vằn mướp
    return fur;
  };
  const out = newOut();
  mesher([X, Y, Z], solid, col, out, [ox, 0, oz]);
  CAT.body = toGeo(out);
  const g = newOut();
  const eye = hex('#ff3a2a');
  mesher([X, Y, Z], solid, (gx, gy, gz, f) => (f === 4 && gy === 11 && gz + oz === 9 && (gx + ox === -2 || gx + ox === 1) ? eye : -1), g, [ox, 0, oz], 0.08, 3.5);
  CAT.glow = toGeo(g);
  const leg = newOut();
  mesher([2, 5, 2], () => true, (x, y, z, f) => (y === 0 || f === 3 ? furD : f === 4 ? fur : furD), leg, [-1, -5, -1]);
  CAT.leg = toGeo(leg);
  const tail = newOut();
  mesher([2, 2, 9], () => true, (x, y, z) => ((z % 3) === 0 ? furD : z === 0 ? rot : fur), tail, [-1, -1, -9]);
  CAT.tail = toGeo(tail);
  return CAT;
}
export function makeCatModel(xray, blob) {
  const C = catParts();
  const mat = spriteLit(new THREE.MeshLambertMaterial({ vertexColors: true }), 0.5);
  const xmat = new THREE.MeshBasicMaterial({ color: new THREE.Color(xray).multiplyScalar(0.55), blending: THREE.AdditiveBlending, depthFunc: THREE.GreaterDepth, depthWrite: false, fog: false });
  const xclones = [];
  const part = (geo) => { const o = new THREE.Mesh(geo, mat); o.castShadow = true; o.renderOrder = 2; const x = new THREE.Mesh(geo, xmat); x.renderOrder = 1; o.add(x); xclones.push(x); return o; };
  const group = new THREE.Group(), yaw = new THREE.Group(), mesh = new THREE.Group(), roll = new THREE.Group(), body = new THREE.Group();
  group.add(yaw); yaw.add(mesh); mesh.add(roll); roll.add(body);
  body.add(part(C.body));
  const gl = new THREE.Mesh(C.glow, GLOW_MAT); gl.renderOrder = 2; body.add(gl);
  const legAt = (x, z) => { const p = new THREE.Group(); p.position.set(x * V, 5 * V, z * V); p.add(part(C.leg)); roll.add(p); return p; };
  const legFL = legAt(-2, 3), legFR = legAt(2, 3), legBL = legAt(-2, -5.5), legBR = legAt(2, -5.5);
  const tail = new THREE.Group(); tail.position.set(0, 9 * V, -7 * V); tail.rotation.x = -0.7; tail.add(part(C.tail)); body.add(tail);
  group.add(blob);
  const xr = { _v: true, get visible() { return this._v; }, set visible(v) { this._v = v; for (const x of xclones) x.visible = v; } };
  return {
    is3d: true, quad: true, group, mesh, mat, xmat, xr, blob, yawNode: yaw, roll, body, legFL, legFR, legBL, legBR, tail,
    maps: [], emap: null, shadow: null, cur: 0, w: 1.1, h: 1.0, P: { quad: true }, weapon: 'fist', setWeapon() {},
    yaw: 0, vx: 0, vz: 0, phase: 0, amp: 0, lx: null, lz: null, atk: 0, atkMax: 0.3, busy: 0, dir: 'down', fr: 0, ang: null, seed: Math.random() * 10,
  };
}
function animateCat(s, dt, sw, a) {
  const t = performance.now() / 1000, r = s.mesh.rotation.x;
  // game đặt mesh.rotation.x khi chết (ngã ngửa): mèo thì lăn nghiêng
  s.mesh.rotation.x = 0; s.mesh.position.y = 0;
  s.roll.rotation.z = r; s.roll.position.y = Math.abs(Math.sin(r)) * 3 * V;
  const dead = r < -0.05, leg = dead ? 0.5 : sw * 0.85 * a;
  s.legFL.rotation.x = leg; s.legBR.rotation.x = leg; s.legFR.rotation.x = -leg; s.legBL.rotation.x = -leg;
  s.tail.rotation.y = dead ? 0 : Math.sin(t * (a > 0.3 ? 12 : 5) + s.seed) * 0.45;
  s.tail.rotation.x = dead ? -0.1 : -0.7 - a * 0.25;
  const q = s.atk > 0 ? Math.sin((1 - s.atk / s.atkMax) * Math.PI) : 0;
  s.body.rotation.x = -q * 0.35 + (dead ? 0 : Math.sin(s.phase * 2) * 0.04 * a);
  s.body.position.y = Math.abs(Math.cos(s.phase)) * a * 0.04;
}
// vung tay đánh (gọi lúc ra đòn)
export function modelSwing(s, t = 0.28) { if (s && s.is3d) s.atk = s.atkMax = t; }

// ---------- cử động mỗi khung ----------
export function animateModel(s, dt) {
  const p = s.group.position;
  const first = s.lx === null;
  if (first) { s.lx = p.x; s.lz = p.z; }
  let dx = p.x - s.lx, dz = p.z - s.lz;
  s.lx = p.x; s.lz = p.z;
  if (Math.hypot(dx, dz) > 1.2) { dx = 0; dz = 0; }   // dịch chuyển tức thời (đổi khu, hồi sinh)
  const k = 1 - Math.exp(-dt * 10);
  if (dt > 0) { s.vx += (dx / dt - s.vx) * k; s.vz += (dz / dt - s.vz) * k; }
  const sp = Math.hypot(s.vx, s.vz), dist = Math.hypot(dx, dz);
  // hướng mặt: góc ngắm (nếu có) > hướng đang đi > hướng 4 phía của khung hình
  let ang = s.ang;
  if (ang === null || ang === undefined) ang = sp > 0.6 ? Math.atan2(s.vz, s.vx) : DIR_ANG[s.dir] ?? Math.PI / 2;
  const tgt = Math.PI / 2 - ang;
  s.yaw = first ? tgt : s.yaw + angDiff(tgt, s.yaw) * Math.min(1, dt * 14);
  s.yawNode.rotation.y = s.yaw;
  // bước chân
  s.phase += dist * Math.PI / 0.5;
  s.amp += (clamp(sp / 2.6, 0, 1) - s.amp) * Math.min(1, dt * 8);
  const P = s.P, sw = Math.sin(s.phase), a = s.amp;
  s.busy = Math.max(0, s.busy - dt);
  s.atk = Math.max(0, s.atk - dt);
  if (P.quad) { animateCat(s, dt, sw, a); return; }
  const lying = s.mesh.rotation.x < -0.05;
  s.mesh.position.y = lying ? P.backZ * Math.sin(-s.mesh.rotation.x) : 0;
  const t = performance.now() / 1000;
  let rR, rL, zR = 0, zL = 0, lean = 0, legA = lying ? 0 : sw * 0.75 * a;
  if (lying) { rR = rL = -0.25; }
  else if (P.zombie) {
    // zombie: hai tay giơ ra trước, người chúi tới, tay quờ quạng
    const wob = Math.sin(t * 2.3 + s.seed) * 0.06;
    rR = -1.38 + sw * 0.16 * a + wob; rL = -1.38 - sw * 0.16 * a - wob;
    zR = 0.08; zL = -0.08;
    lean = 0.12 + a * 0.06;
    if (s.atk > 0) { const q = Math.sin((1 - s.atk / s.atkMax) * Math.PI); rR -= q * 0.5; rL -= q * 0.5; lean += q * 0.3; }
    if (s.busy > 0) { rR = -0.7 + Math.sin(t * 13) * 0.35; rL = -0.7 - Math.sin(t * 13) * 0.35; lean = 0.35; }
  } else {
    rR = -sw * 0.6 * a; rL = sw * 0.6 * a;
    const aim = AIMED[s.weapon];
    if (aim) { rR = -1.45; zR = 0.12; if (aim === 2) { rL = -1.3; zL = -0.55; } }
    if (s.busy > 0) { rR = -0.9 + Math.sin(t * 14) * 0.3; rL = -0.9 - Math.sin(t * 14) * 0.3; lean = 0.18; }
    if (s.atk > 0) {
      const q = 1 - s.atk / s.atkMax;
      if (aim) rR = -1.45 - Math.sin(q * Math.PI) * 0.25;            // giật súng
      else { rR = -0.4 - Math.sin(q * Math.PI) * 2.0; zR = 0.2; lean = Math.sin(q * Math.PI) * 0.15; }
    }
  }
  s.armR.rotation.set(rR, 0, zR); s.armL.rotation.set(rL, 0, zL);
  s.legR.rotation.x = legA; s.legL.rotation.x = -legA;
  s.upper.rotation.x = lean;
  s.upper.position.y = P.hipY - Math.abs(Math.cos(s.phase)) * a * 0.03;
}

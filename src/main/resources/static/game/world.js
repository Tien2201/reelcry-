// Thị trấn hậu tận thế kiểu diorama HD-2D nhìn ngang: phố nhựa đường nứt nẻ,
// dãy nhà dân / tạp hoá / nhà thuốc / đồn cảnh sát vào lục soát được (tường trước
// tự "cắt" như nhà búp bê khi bước vào), trạm xăng, chốt quân sự bỏ hoang,
// bãi đáp trực thăng; phía sau là bậc thềm, nghĩa địa, đồi và bầu trời.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { makeRng, spriteLit, patchMaterial, softDisc } from './pixel.js';
import * as T from './textures.js';
import { makeFireAtlas } from './sprites.js';

export const TY = 1.8;          // độ cao bậc thềm sau tường kè
export const WALL_Z = -2.0;     // mặt trước tường kè = mặt tiền các toà nhà
export const BY = 3.6;          // bậc thềm phía sau
export const BACK_Z = -15;      // tường kè thứ hai
export const BLD_D = 5.6;       // chiều sâu toà nhà
export const ZB = WALL_Z - BLD_D;
export const BOUNDS = { x0: -58, x1: 58, z0: ZB + 0.2, z1: 4.6 };
export const STREET_FRONT = 3.25;
export const STAIRS = [{ x: -24.4, w: 1.9 }, { x: 26.4, w: 1.9 }, { x: 47.2, w: 1.9 }];
export const STAIR_DEPTH = 1.9;
export const POND = { cx: -28, cz: 6.25, rx: 6.6, rz: 2.55, c0: -29.6, c1: -26.4 };
export const STREAM = { x0: -29.0, x1: -27.0 };
export const HELIPAD = { x: 52.4, z: 1.2, r: 2.5 };
const XMIN = -72, XMAX = 72;

// các toà nhà vào được (mặt tiền tại WALL_Z, lòng nhà lùi vào BLD_D)
export const BUILDINGS = [
  { id: 'kiosk', name: 'Cửa hàng xăng dầu', kind: 'kiosk', x0: -56, x1: -50.5, floors: 1, h: 3.7, door: -53.0, doorW: 1.4, floor: 'tile', wall: 'plaster', plaster: ['#a8a090', '#bcb4a2', '#d0c8b6'], shop: true, sign: { text: 'MINI MART', bg: '#c8281e' }, roof: 'flat', light: 'flicker', seed: 41 },
  { id: 'garage', name: 'Gara sửa xe', kind: 'garage', x0: -49.5, x1: -43, floors: 1, h: 3.9, door: -46.25, doorW: 3.4, doorH: 2.7, floor: 'concrete', wall: 'brick', sign: { text: 'GARA', bg: '#2e2e30', y: 0.12 }, roof: 'flat', light: 'flicker', seed: 42 },
  { id: 'houseA', name: 'Nhà dân', kind: 'house', x0: -40.5, x1: -33.5, floors: 2, h: 6.2, door: -38.5, doorW: 1.2, floor: 'wood', wall: 'plaster', plaster: ['#b8a888', '#ccbc9c', '#ded0b4'], roof: 'red', light: 'candle', seed: 43, posters: 1, graffiti: [{ text: 'X', x: 4.6, y: 0.9, col: '#d83a2a', scale: 3 }] },
  { id: 'grocery', name: 'Tạp hoá', kind: 'grocery', x0: -20, x1: -11, floors: 1, h: 3.8, door: -15.5, doorW: 1.4, floor: 'tile', wall: 'plaster', plaster: ['#8a9a8a', '#a4b4a2', '#bccab8'], shop: true, sign: { text: 'TẠP HOÁ', bg: '#b8281e', w: 4 }, roof: 'flat', light: 'flicker', seed: 44, posters: 2, graffiti: [{ text: 'CỨU', x: 6.7, y: 0.95, col: '#e8e0d0' }] },
  { id: 'pharmacy', name: 'Nhà thuốc', kind: 'pharmacy', x0: -10, x1: -4, floors: 1, h: 3.8, door: -7, doorW: 1.3, floor: 'tile', wall: 'plaster', plaster: ['#c8c8c0', '#dcdcd4', '#ececE4'], shop: true, sign: { text: 'NHÀ THUỐC', bg: '#1e7a3e', cross: true }, roof: 'flat', light: 'flicker', seed: 45 },
  { id: 'houseB', name: 'Nhà dân', kind: 'house', x0: -2, x1: 5, floors: 2, h: 6.2, door: 0.1, doorW: 1.2, floor: 'wood', wall: 'brick', roof: 'slate', light: 'candle', seed: 46, posters: 1, blood: 0.75 },
  { id: 'radio', name: 'Nhà ông Tư', kind: 'workshop', x0: 7, x1: 13, floors: 1, h: 3.8, door: 8.6, doorW: 1.2, floor: 'wood', wall: 'plank', roof: 'wood', light: 'candle', seed: 47, antenna: true },
  { id: 'police', name: 'Đồn cảnh sát', kind: 'police', x0: 29, x1: 43, floors: 2, h: 6.6, door: 35.2, doorW: 1.8, doorH: 2.3, floor: 'lino', wall: 'concrete', plaster: ['#8a8c90', '#a0a2a6', '#b4b6ba'], sign: { text: 'ĐỒN CẢNH SÁT', bg: '#1a3a7a', y: 2.05 }, roof: 'flat', light: 'power', seed: 48, posters: 3, blood: 0.18, graffiti: [{ text: 'HELP', x: 1.0, y: 4.3 }] },
];
// toà nhà chứa điểm (x, z) (null nếu ở ngoài đường)
export function buildingAt(x, z) {
  if (z > WALL_Z - 0.02) return null;
  for (const b of BUILDINGS) if (x > b.x0 && x < b.x1 && z > ZB - 0.3) return b;
  return null;
}

export const U = {
  time: { value: 0 },
  wind: { value: 1 },
  push: { value: Array.from({ length: 6 }, () => new THREE.Vector4(0, -99, 0, 0.01)) },
  seeCenter: { value: new THREE.Vector2(-9999, -9999) },
  seeRadius: { value: 120 },
  seeDepth: { value: 0 },
  seeZ: { value: 999 },
  wet: { value: 0 },
  win: { value: 1 },
};

const GLSL_BAYER = `
#ifndef DN_BAYER
#define DN_BAYER
float bayerA(vec2 a){ a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float bayer4(vec2 a){ return bayerA(0.5 * a) * 0.25 + bayerA(a); }
#endif
`;
// "cắt tường" kiểu nhà búp bê: tường trước của toà nhà mờ dần (dither) khi người chơi bước vào
export function cutPatch(mat, cutU) {
  return patchMaterial(mat, 'cut', (sh) => {
    sh.uniforms.uCut = cutU;
    sh.fragmentShader = sh.fragmentShader.replace('void main() {', `uniform float uCut;
${GLSL_BAYER}
void main() {
        if (uCut > 0.001 && bayer4(gl_FragCoord.xy) < uCut * 1.02) discard;`);
  });
}
// nhìn xuyên: khoét lỗ quanh nhân vật + làm mờ dạng dither vật đứng chắn phía trước nhân vật
export function seeThrough(mat) {
  return patchMaterial(mat, 'see3', (sh) => {
    sh.uniforms.uSeeCenter = U.seeCenter; sh.uniforms.uSeeRadius = U.seeRadius; sh.uniforms.uSeeDepth = U.seeDepth; sh.uniforms.uSeeZ = U.seeZ;
    sh.vertexShader = 'varying vec3 vSeeW;\n' + sh.vertexShader.replace('#include <fog_vertex>', `#include <fog_vertex>
      #ifdef USE_INSTANCING
        vSeeW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
      #else
        vSeeW = (modelMatrix * vec4(transformed, 1.0)).xyz;
      #endif`);
    sh.fragmentShader = sh.fragmentShader.replace('void main() {', `uniform vec2 uSeeCenter; uniform float uSeeRadius; uniform float uSeeDepth; uniform float uSeeZ; varying vec3 vSeeW;
${GLSL_BAYER}
void main() {
        {
          vec2 dd = (gl_FragCoord.xy - uSeeCenter) / uSeeRadius;
          float keep = 1.0;
          if (vViewPosition.z < uSeeDepth) keep = smoothstep(0.45, 1.0, length(dd));
          float south = smoothstep(uSeeZ + 0.8, uSeeZ + 2.8, vSeeW.z) * smoothstep(0.5, 1.3, vSeeW.y);
          float band = 1.0 - smoothstep(2.2, 3.4, length(dd * vec2(0.75, 0.6)));
          keep = min(keep, 1.0 - south * band * 0.75);
          if (keep < 0.999 && bayer4(gl_FragCoord.xy) > keep) discard;
        }`);
  });
}
function swayPatch(mat, amp, key = 'sway') {
  return patchMaterial(mat, key + amp, (sh) => {
    sh.uniforms.uTime = U.time; sh.uniforms.uWind = U.wind;
    sh.vertexShader = 'uniform float uTime;\nuniform float uWind;\n' + sh.vertexShader.replace('#include <project_vertex>', `
      vec4 mvPosition = vec4( transformed, 1.0 );
      #ifdef USE_INSTANCING
        mvPosition = instanceMatrix * mvPosition;
        vec3 ip = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
      #else
        vec3 ip = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
      #endif
      vec4 wp = modelMatrix * mvPosition;
      float hk = clamp((ip.y - 1.0) / 5.0, 0.0, 1.0);
      float ph = ip.x * 0.21 + ip.z * 0.17;
      wp.x += (sin(uTime * 1.1 + ph) * 0.6 + sin(uTime * 2.7 + ph * 3.0 + ip.y * 0.7) * 0.3) * uWind * ${amp.toFixed(3)} * hk;
      wp.z += cos(uTime * 0.9 + ph * 1.3) * uWind * ${(amp * 0.5).toFixed(3)} * hk;
      mvPosition = viewMatrix * wp;
      gl_Position = projectionMatrix * mvPosition;`);
  });
}
function grassPatch(mat, amp) {
  return patchMaterial(mat, 'grass' + amp, (sh) => {
    sh.uniforms.uTime = U.time; sh.uniforms.uWind = U.wind; sh.uniforms.uPush = U.push;
    sh.vertexShader = 'uniform float uTime;\nuniform float uWind;\nuniform vec4 uPush[6];\n' + sh.vertexShader
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nobjectNormal = vec3(0.0, 1.0, 0.0);')
      .replace('#include <project_vertex>', `
        vec4 mvPosition = vec4( transformed, 1.0 );
        #ifdef USE_INSTANCING
          mvPosition = instanceMatrix * mvPosition;
        #endif
        vec4 wp = modelMatrix * mvPosition;
        float hk = uv.y * uv.y;
        float ph = wp.x * 0.37 + wp.z * 0.23;
        vec2 sway = vec2(sin(uTime * 1.7 + ph) + 0.35 * sin(uTime * 3.9 + ph * 2.3), 0.4 * cos(uTime * 1.3 + ph * 1.1)) * uWind * ${amp.toFixed(3)};
        vec2 push = vec2(0.0);
        for (int i = 0; i < 6; i++) {
          vec2 d = wp.xz - uPush[i].xz;
          float l = length(d);
          float k = 1.0 - smoothstep(0.0, uPush[i].w, l);
          push += (l > 0.001 ? d / l : vec2(0.0)) * k * 0.5;
        }
        wp.xz += (sway + push) * hk;
        wp.y -= length(push) * hk * 0.3;
        mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;`);
  });
}

// ---------- gom hình học tĩnh theo vật liệu + theo đoạn dọc phố (để cắt khung nhìn) ----------
const CHUNK = 24;
const chunkOf = (x) => Math.floor((x - XMIN) / CHUNK);
class Batch {
  constructor() { this.groups = new Map(); }
  add(geo, mat, matrix, cast = true, receive = true) {
    const gg = geo.index ? geo.toNonIndexed() : geo.clone();
    gg.clearGroups();
    for (const n of Object.keys(gg.attributes)) if (n !== 'position' && n !== 'normal' && n !== 'uv') gg.deleteAttribute(n);
    if (!gg.attributes.normal) gg.computeVertexNormals();
    gg.applyMatrix4(matrix);
    gg.computeBoundingBox();
    const cx = (gg.boundingBox.min.x + gg.boundingBox.max.x) / 2;
    const key = mat.uuid + (cast ? 'c' : '') + (receive ? 'r' : '') + chunkOf(cx);
    let g = this.groups.get(key);
    if (!g) { g = { mat, cast, receive, geos: [] }; this.groups.set(key, g); }
    g.geos.push(gg);
  }
  build(parent) {
    for (const g of this.groups.values()) {
      const m = new THREE.Mesh(mergeGeometries(g.geos), g.mat);
      m.castShadow = g.cast; m.receiveShadow = g.receive;
      m.matrixAutoUpdate = false;
      parent.add(m);
    }
  }
}
const Q = new THREE.Quaternion(), E = new THREE.Euler(), V = new THREE.Vector3(), S3 = new THREE.Vector3();
function mat4(x, y, z, rx = 0, ry = 0, rz = 0, order = 'XYZ') {
  return new THREE.Matrix4().compose(V.set(x, y, z), Q.setFromEuler(E.set(rx, ry, rz, order)), S3.set(1, 1, 1));
}
function boxGeo(w, h, d, tu = 1, tv = tu) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) { const k = f * 4 + i; uv.setXY(k, uv.getX(k) * dims[f][0] / tu, uv.getY(k) * dims[f][1] / tv); }
  return g;
}
class Voxels {
  constructor(map, { sway = 0, cast = true, receive = true, see = false, wrap = 0, emissive = false, cut = null } = {}) {
    Object.assign(this, { map, sway, cast, receive, see, wrap, emissive, cut });
    this.items = [];
  }
  add(x, y, z, sx, sy, sz, color, ry = 0) { this.items.push(x, y, z, sx, sy, sz, ry, color); }
  build(parent) {
    if (!this.items.length) return [];
    const mat = this.emissive
      ? new THREE.MeshBasicMaterial({ color: 0xffffff })
      : new THREE.MeshLambertMaterial({ map: this.map });
    if (this.wrap) spriteLit(mat, this.wrap);
    if (this.sway) swayPatch(mat, this.sway);
    if (this.see) seeThrough(mat);
    if (this.cut) cutPatch(mat, this.cut);
    this.mat = mat;
    let dm = null;
    if (this.sway && this.cast) { dm = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }); swayPatch(dm, this.sway); }
    const chunks = new Map();
    for (let i = 0; i < this.items.length; i += 8) {
      const k = chunkOf(this.items[i]);
      if (!chunks.has(k)) chunks.set(k, []);
      chunks.get(k).push(i);
    }
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const out = [];
    const m = new THREE.Matrix4(), c = new THREE.Color();
    for (const idx of chunks.values()) {
      const mesh = new THREE.InstancedMesh(geo, mat, idx.length);
      idx.forEach((o, n) => {
        const it = this.items;
        m.compose(V.set(it[o], it[o + 1], it[o + 2]), Q.setFromEuler(E.set(0, it[o + 6], 0)), S3.set(it[o + 3], it[o + 4], it[o + 5]));
        mesh.setMatrixAt(n, m);
        mesh.setColorAt(n, c.set(it[o + 7]));
      });
      mesh.castShadow = this.cast && !this.emissive; mesh.receiveShadow = this.receive && !this.emissive;
      if (dm) mesh.customDepthMaterial = dm;
      mesh.computeBoundingSphere();
      mesh.boundingSphere.radius += 1;
      parent.add(mesh); out.push(mesh);
    }
    return out;
  }
}

// ======================================================================
export function buildWorld(scene, quality) {
  const rng = makeRng(20261120);
  const hi = quality === 'high';
  const root = new THREE.Group();
  scene.add(root);
  const batch = new Batch();
  const colliders = { circles: [], boxes: [] };
  const emitters = [], fires = [], smokeSources = [], graves = [], perches = [], lampHeads = [], canopies = [];
  const windowMats = [], glowSprites = [], hideInReflection = [], animated = [];
  const containers = [], pois = {}, sirens = [];
  const addCircle = (x, z, r, low = false) => { const c = { x, z, r, low }; colliders.circles.push(c); return c; };
  const addBox = (x0, z0, x1, z1, low = false) => { const b = { x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1), low }; colliders.boxes.push(b); return b; };
  let cid = 0;
  const container = (kind, x, z, label, b = null, extra = {}) => { const c = { id: 'c' + (cid++), kind, x, z, label, b: b ? b.id : null, ...extra }; containers.push(c); return c; };
  const emit = (x, y, z, color, intensity, distance, kind, flicker = 'none') => {
    const e = { pos: new THREE.Vector3(x, y, z), color: new THREE.Color(color), base: intensity, dist: distance, kind, flicker, phase: rng() * 100, cur: 0, w: 0 };
    emitters.push(e); return e;
  };

  // ---------- texture & vật liệu dùng chung ----------
  const tx = {
    leaf: T.leafTile(), bark: T.barkTile(), stone: T.stoneTile(), plank: T.plankTile(), crate: T.crateTile(), dirt: T.dirtTile(),
    pumpkin: T.pumpkinTile(), hay: T.hayTile(), plain: T.plainTile(), metal: T.metalTile(),
  };
  const wallTex = T.stoneWallTex(5);
  const wallTex2 = T.stoneWallTex(9, false);
  const roofs = { red: T.roofTex('red', 3), slate: T.roofTex('slate', 4), wood: T.roofTex('wood', 5), moss: T.roofTex('moss', 6) };
  const lamb = (o) => new THREE.MeshLambertMaterial(o);
  const mWall = lamb({ map: wallTex.map, normalMap: wallTex.normalMap });
  const mWallDark = lamb({ map: wallTex2.map, normalMap: wallTex2.normalMap, color: '#9a948c' });
  const mPlank = lamb({ map: tx.plank });
  const mMetal = lamb({ map: tx.metal });
  for (const m of [mWall, mWallDark]) m.shadowSide = THREE.DoubleSide;

  const glowTex = softDisc(64, 0, 2.2);
  function addGlow(x, y, z, color, size, intensity = 1, kind = 'lamp') {
    const sm = new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(color).multiplyScalar(intensity), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    const s = new THREE.Sprite(sm);
    s.position.set(x, y, z); s.scale.set(size, size, 1);
    root.add(s);
    glowSprites.push({ s, base: intensity, color: new THREE.Color(color), size, kind });
    hideInReflection.push(s);
    return s;
  }

  // ---------- voxel batches ----------
  const leaves = new Voxels(tx.leaf, { sway: 0.07, see: true, wrap: 0.55 });
  const trunks = new Voxels(tx.bark, { see: true });
  const stones = new Voxels(tx.stone);
  const planks = new Voxels(tx.plank);
  const crates = new Voxels(tx.crate);
  const misc = new Voxels(tx.plain);
  const hay = new Voxels(tx.hay);
  const soil = new Voxels(tx.dirt);
  const bulbs = new Voxels(null, { emissive: true });
  const metals = new Voxels(tx.metal);

  // ======================= MẶT ĐẤT =======================
  // đa giác ao + kênh suối (toạ độ x,z)
  function pondPoly(zTop) {
    const { cx, cz, rx, rz, c0, c1 } = POND;
    const join = (x) => cz - rz * Math.sqrt(Math.max(0, 1 - ((x - cx) / rx) ** 2));
    const pts = [[c0, zTop], [c1, zTop], [c1, join(c1)]];
    const a0 = Math.atan2((join(c1) - cz) / rz, (c1 - cx) / rx);
    const a1 = Math.atan2((join(c0) - cz) / rz, (c0 - cx) / rx) + Math.PI * 2;
    for (let i = 1; i < 44; i++) {
      const a = a0 + (a1 - a0) * i / 44;
      const wob = 1 + 0.06 * Math.sin(a * 5) + 0.04 * Math.sin(a * 9 + 1);
      pts.push([cx + Math.cos(a) * rx * wob, cz + Math.sin(a) * rz * wob]);
    }
    pts.push([c0, join(c0)]);
    return pts;
  }
  const holePts = pondPoly(STREET_FRONT);
  const waterPts = pondPoly(WALL_Z);
  const inPoly = (pts, x, z) => {
    let c = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, zi] = pts[i], [xj, zj] = pts[j];
      if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c;
    }
    return c;
  };

  const bIv = BUILDINGS.map((b) => [b.x0, b.x1]);
  const stairIv = STAIRS.map((s) => [s.x - s.w / 2, s.x + s.w / 2]);
  // các đoạn [a, b] của [XMIN, XMAX] trừ đi các khoảng loại trừ
  function freeIntervals(ex) {
    const out = [];
    let x = XMIN;
    for (const [a, b] of [...ex].sort((p, q) => p[0] - q[0])) { if (a > x) out.push([x, a]); x = Math.max(x, b); }
    if (x < XMAX) out.push([x, XMAX]);
    return out;
  }
  const L_ST = { x0: XMIN, z0: WALL_Z, w: XMAX - XMIN, h: 26, ppu: 16 };
  const L_TE = { x0: XMIN, z0: BACK_Z, w: XMAX - XMIN, h: WALL_Z - BACK_Z, ppu: 12 };
  const L_BA = { x0: XMIN, z0: -48, w: XMAX - XMIN, h: 48 + BACK_Z, ppu: 8 };
  const cemetery = { x0: 45.5, x1: 57.5, z0: -13.2, z1: -2.6 };
  const field = { x0: 38, x1: 51, z0: 8.5, z1: 15 };
  const camp = { x0: 18, x1: 31 };
  const stShapes = [
    { type: 'rect', kind: 7, x: XMIN, z: WALL_Z - 1, w: XMAX - XMIN, h: STREET_FRONT - WALL_Z + 1 },
    { type: 'rect', kind: 8, x: XMIN, z: WALL_Z - 1, w: XMAX - XMIN, h: 1.1 },
    { type: 'rect', kind: 8, x: XMIN, z: STREET_FRONT - 0.5, w: XMAX - XMIN, h: 0.5 },
    { type: 'rect', kind: 8, x: -57.5, z: -0.9, w: 9, h: 3.6 },
    { type: 'rect', kind: 1, x: camp.x0, z: STREET_FRONT - 0.2, w: camp.x1 - camp.x0, h: 6 },
    { type: 'disc', kind: 3, x: POND.cx, z: POND.cz, rx: POND.rx + 1.2, rz: POND.rz + 1 },
    { type: 'path', kind: 1, width: 1.6, pts: [[-6, STREET_FRONT], [-5, 9], [-7, 26]] },
    { type: 'path', kind: 1, width: 1.4, pts: [[44, STREET_FRONT], [44.5, field.z0]] },
  ];
  for (let x = XMIN + 1; x < XMAX - 2; x += 3.2) if (x < -57.5 || x > -48.5) if (Math.abs(x + 0.6 - HELIPAD.x) > HELIPAD.r + 0.6) stShapes.push({ type: 'rect', kind: 9, x, z: 0.95, w: 1.5, h: 0.13 });
  // bãi đáp: vòng tròn + chữ H sơn trắng
  stShapes.push({ type: 'disc', kind: 9, x: HELIPAD.x, z: HELIPAD.z, rx: HELIPAD.r }, { type: 'disc', kind: 7, x: HELIPAD.x, z: HELIPAD.z, rx: HELIPAD.r - 0.25 });
  stShapes.push({ type: 'rect', kind: 9, x: HELIPAD.x - 0.95, z: HELIPAD.z - 1.2, w: 0.38, h: 2.4 }, { type: 'rect', kind: 9, x: HELIPAD.x + 0.57, z: HELIPAD.z - 1.2, w: 0.38, h: 2.4 }, { type: 'rect', kind: 9, x: HELIPAD.x - 0.6, z: HELIPAD.z - 0.17, w: 1.2, h: 0.34 });
  const teShapes = [
    { type: 'rect', kind: 1, x: XMIN, z: WALL_Z - 2.3, w: XMAX - XMIN, h: 2.3 },
    { type: 'rect', kind: 5, x: XMIN, z: BACK_Z, w: XMAX - XMIN, h: 3 },
  ];
  const graveSpots = [];
  for (let gx = 0; gx < 4; gx++) for (let gz = 0; gz < 2; gz++) {
    const x = cemetery.x0 + 1.8 + gx * 2.8 + (gz & 1) * 1.1, z = -6.4 - gz * 3.4;
    graveSpots.push({ x, z });
    teShapes.push({ type: 'rect', kind: 6, x: x - 0.45, z: z + 0.25, w: 0.9, h: 1.6 });
  }
  const baShapes = [{ type: 'rect', kind: 5, x: XMIN, z: -48, w: XMAX - XMIN, h: 48 + BACK_Z }];
  const gST = T.groundTex({ ...L_ST, shapes: stShapes });
  const gTE = T.groundTex({ ...L_TE, shapes: teShapes });
  const gBA = T.groundTex({ ...L_BA, shapes: baShapes });

  function groundMat(g) {
    const m = new THREE.MeshStandardMaterial({ map: g.map, normalMap: g.normalMap, roughness: 0.92, metalness: 0 });
    m.normalScale.set(0.6, -0.6);
    patchMaterial(m, 'wetground', (sh) => {
      sh.uniforms.uWet = U.wet;
      sh.fragmentShader = 'uniform float uWet;\n' + sh.fragmentShader
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.26, uWet * (0.55 + 0.45 * step(diffuseColor.r, 0.32)));')
        .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb *= 1.0 - uWet * 0.35;');
    });
    return m;
  }
  function worldUV(geo, L) {
    const p = geo.attributes.position, uv = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) { uv[i * 2] = (p.getX(i) - L.x0) / L.w; uv[i * 2 + 1] = 1 - (p.getZ(i) - L.z0) / L.h; }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return geo;
  }
  function flatRect(x0, x1, z0, z1, y) {
    const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
    g.rotateX(-Math.PI / 2); g.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
    return g;
  }
  // nền phố (có lỗ ao)
  {
    const shape = new THREE.Shape();
    shape.moveTo(XMIN, -WALL_Z); shape.lineTo(XMIN, -(WALL_Z + L_ST.h)); shape.lineTo(XMAX, -(WALL_Z + L_ST.h)); shape.lineTo(XMAX, -WALL_Z); shape.closePath();
    const hole = new THREE.Path();
    holePts.forEach(([x, z], i) => (i ? hole.lineTo(x, -z) : hole.moveTo(x, -z)));
    hole.closePath();
    shape.holes.push(hole);
    const g = new THREE.ShapeGeometry(shape, 4);
    g.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(worldUV(g, L_ST), groundMat(gST));
    mesh.receiveShadow = true;
    root.add(mesh);
  }
  // nền bậc thềm (chừa chỗ cho các toà nhà và cầu thang) + thềm sau
  {
    const parts = [flatRect(XMIN, XMAX, BACK_Z, ZB, TY)];
    for (const [a, b] of freeIntervals(bIv)) parts.push(flatRect(a, b, ZB, WALL_Z - STAIR_DEPTH, TY));
    for (const [a, b] of freeIntervals([...bIv, ...stairIv])) parts.push(flatRect(a, b, WALL_Z - STAIR_DEPTH, WALL_Z, TY));
    const g = worldUV(mergeGeometries(parts.map((p) => p.toNonIndexed())), L_TE);
    const mesh = new THREE.Mesh(g, groundMat(gTE));
    mesh.receiveShadow = true;
    root.add(mesh);
    const g2 = worldUV(flatRect(XMIN, XMAX, -48, BACK_Z, BY), L_BA);
    const m2 = new THREE.Mesh(g2, groundMat(gBA));
    m2.receiveShadow = true;
    root.add(m2);
  }

  // ======================= TƯỜNG KÈ, BẬC THANG =======================
  const wallSegs = freeIntervals([...bIv, ...stairIv]);
  {
    for (const [a, b] of wallSegs) {
      batch.add(boxGeo(b - a, TY, 0.6, 2, 1), mWall, mat4((a + b) / 2, TY / 2, WALL_Z - 0.3));
      batch.add(boxGeo(b - a + 0.04, 0.16, 0.78, 2, 1), mWallDark, mat4((a + b) / 2, TY + 0.08, WALL_Z - 0.3));
    }
    for (const s of STAIRS) {
      const n = 10, rise = TY / n, run = STAIR_DEPTH / n;
      for (let i = 0; i < n; i++) {
        const h = rise * (i + 1);
        batch.add(boxGeo(s.w, h, run, 1, 1), mWallDark, mat4(s.x, h / 2, WALL_Z - run * (i + 0.5)));
      }
      for (const sd of [-1, 1]) batch.add(boxGeo(0.3, TY + 0.5, STAIR_DEPTH + 0.6, 1, 1), mWall, mat4(s.x + sd * (s.w / 2 + 0.15), (TY + 0.5) / 2, WALL_Z - STAIR_DEPTH / 2 - 0.1));
    }
    batch.add(boxGeo(XMAX - XMIN, BY - TY, 0.6, 2, 1), mWall, mat4(0, TY + (BY - TY) / 2, BACK_Z - 0.3));
    batch.add(boxGeo(XMAX - XMIN, 0.16, 0.78, 2, 1), mWallDark, mat4(0, BY + 0.08, BACK_Z - 0.3));
    // khối đất bậc thềm chặn người chơi (trừ lòng các toà nhà)
    for (const [a, b] of freeIntervals(bIv)) addBox(a, WALL_Z - 12, b, WALL_Z + 0.05);
  }
  for (let i = 0; i < 46; i++) {
    const x = XMIN + 4 + rng() * (XMAX - XMIN - 8);
    if (!wallSegs.some(([a, b]) => x > a + 0.3 && x < b - 0.3)) continue;
    if (x > STREAM.x0 - 0.5 && x < STREAM.x1 + 0.5) continue;
    const len = 1 + Math.floor(rng() * 4);
    for (let k = 0; k < len; k++) leaves.add(x + (rng() - 0.5) * 0.3, TY - 0.05 - k * 0.32, WALL_Z + 0.06, 0.34, 0.34, 0.2, k === 0 ? '#4e7a2e' : '#3e6a26');
  }

  // ======================= CẦU ĐÁ VÒM + AO =======================
  const BED = -1.6, WATER_Y = -0.85, ARCH_R = 1.45;
  {
    const s = new THREE.Shape();
    const x0 = POND.cx - 2.9, x1 = POND.cx + 2.9;
    s.moveTo(x0, 0.55); s.lineTo(x0, BED); s.lineTo(POND.cx - ARCH_R, BED);
    for (let i = 1; i < 16; i++) { const a = Math.PI - i / 16 * Math.PI; s.lineTo(POND.cx + Math.cos(a) * ARCH_R, BED + Math.sin(a) * ARCH_R); }
    s.lineTo(POND.cx + ARCH_R, BED); s.lineTo(x1, BED); s.lineTo(x1, 0.55); s.closePath();
    const g = new THREE.ShapeGeometry(s, 2);
    const p = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 2, p.getY(i) / 1);
    g.translate(0, 0, STREET_FRONT);
    batch.add(g, mWall, new THREE.Matrix4());
    batch.add(boxGeo(5.9, 0.14, 0.5, 2, 1), mWallDark, mat4(POND.cx, 0.62, STREET_FRONT - 0.2));
    batch.add(boxGeo(5.8, 0.55, 0.3, 2, 1), mWall, mat4(POND.cx, 0.27, STREET_FRONT - 0.16));
    const cyl = new THREE.CylinderGeometry(ARCH_R, ARCH_R, STREET_FRONT - WALL_Z, 16, 1, true, Math.PI / 2, Math.PI);
    cyl.rotateX(Math.PI / 2);
    const cmesh = new THREE.Mesh(cyl, lamb({ map: wallTex2.map, color: '#5a5650', side: THREE.BackSide }));
    cmesh.position.set(POND.cx, BED, (STREET_FRONT + WALL_Z) / 2);
    root.add(cmesh);
    addBox(x0, STREET_FRONT - 0.35, x1, STREET_FRONT + 3, true);
  }
  {
    const pos = [], uvs = [];
    let acc = 0;
    for (let i = 0; i < waterPts.length; i++) {
      const [ax, az] = waterPts[i], [bx, bz] = waterPts[(i + 1) % waterPts.length];
      const len = Math.hypot(bx - ax, bz - az);
      const y0 = BED, y1 = 0.02;
      pos.push(ax, y0, az, bx, y0, bz, bx, y1, bz, ax, y0, az, bx, y1, bz, ax, y1, az);
      const u0 = acc / 2, u1 = (acc + len) / 2;
      uvs.push(u0, y0, u1, y0, u1, y1, u0, y0, u1, y1, u0, y1);
      acc += len;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, lamb({ map: wallTex2.map, normalMap: wallTex2.normalMap, color: '#8a8478', side: THREE.DoubleSide }));
    mesh.receiveShadow = true;
    root.add(mesh);
    for (let i = 0; i < waterPts.length; i++) {
      const [x, z] = waterPts[i];
      if (z < STREET_FRONT + 0.2) continue;
      const sz = 0.3 + rng() * 0.35;
      stones.add(x, 0.05, z, sz * 1.5, sz * 0.5, sz, ['#6a6a6e', '#7a7872', '#5a5a5e'][i % 3], rng() * 3);
    }
  }
  const waterShape = new THREE.Shape();
  waterPts.forEach(([x, z], i) => (i ? waterShape.lineTo(x, -z) : waterShape.moveTo(x, -z)));
  waterShape.closePath();
  const waterGeo = new THREE.ShapeGeometry(waterShape, 4);
  const water = hi ? new Reflector(waterGeo, {
    clipBias: 0.003, textureWidth: 960, textureHeight: 540, color: 0x9aaab0, multisample: 0,
    shader: {
      name: 'PondShader',
      uniforms: { color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null }, uTime: { value: 0 }, uRain: { value: 0 }, uDeep: { value: new THREE.Color('#071210') } },
      vertexShader: `
        uniform mat4 textureMatrix; varying vec4 vUv; varying vec3 vW;
        void main(){ vUv = textureMatrix * vec4(position, 1.0); vW = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        uniform vec3 color; uniform sampler2D tDiffuse; uniform float uTime; uniform float uRain; uniform vec3 uDeep;
        varying vec4 vUv; varying vec3 vW;
        float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        void main(){
          vec2 w = floor(vW.xz * 16.0) / 16.0;
          float flow = smoothstep(${(STREET_FRONT + 2.5).toFixed(2)}, ${STREET_FRONT.toFixed(2)}, vW.z);
          vec2 d = vec2(sin(w.y * 2.6 + uTime * 1.3) + sin(w.x * 1.7 - uTime * 0.9), cos(w.x * 2.2 + uTime * 1.1) + cos(w.y * 3.0 - uTime * 0.7)) * 0.006;
          d += vec2(0.0, sin(w.x * 9.0 + w.y * 3.0 - uTime * 6.0)) * 0.012 * flow;
          float ring = 0.0;
          for (int i = 0; i < 2; i++) {
            vec2 q = w * 1.3 + float(i) * 0.5;
            vec2 cell = floor(q), f = fract(q) - 0.5;
            float hh = h21(cell + float(i) * 7.0);
            float t = fract(uTime * 0.8 + hh * 9.0);
            vec2 c = vec2(h21(cell + 3.1), h21(cell + 7.7)) - 0.5;
            ring += smoothstep(0.035, 0.0, abs(length(f - c * 0.5) - t * 0.42)) * (1.0 - t);
          }
          ring *= uRain;
          d += ring * 0.02;
          vec4 uv = vUv; uv.xy += d * uv.w;
          vec3 refl = texture2DProj(tDiffuse, uv).rgb;
          vec3 col = uDeep + refl * color + ring * 0.06 + flow * 0.025;
          gl_FragColor = vec4(col, 1.0);
        }`,
    },
  }) : new THREE.Mesh(waterGeo, Object.assign(new THREE.MeshStandardMaterial({ color: '#0b1a1c', roughness: 0.06, metalness: 0.3 }), { uniforms: { uTime: { value: 0 }, uRain: { value: 0 } } }));
  if (water.isReflector) water.material.uniforms.uTime = U.time;
  water.rotation.x = -Math.PI / 2;
  water.position.y = WATER_Y;
  root.add(water);
  if (water.isReflector) {
    const ob = water.onBeforeRender;
    water.onBeforeRender = function (r, s, c) {
      for (const o of hideInReflection) o.visible = false;
      ob.call(this, r, s, c);
      for (const o of hideInReflection) o.visible = true;
    };
  }
  addBox(POND.cx - POND.rx - 0.3, STREET_FRONT + 0.15, POND.cx + POND.rx + 0.3, POND.cz + POND.rz + 1, true);
  const lilyMat = spriteLit(lamb({ map: T.lilyTex(), alphaTest: 0.5, side: THREE.DoubleSide }));
  const lilies = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.85, 0.85), lilyMat, 14);
  for (let i = 0; i < 14; i++) {
    let x, z, tries = 0;
    do { x = POND.cx + (rng() - 0.5) * POND.rx * 1.7; z = POND.cz + (rng() - 0.5) * POND.rz * 1.6; tries++; } while ((!inPoly(waterPts, x, z) || z < STREET_FRONT + 0.9 || Math.abs(x - POND.cx) < 2) && tries < 60);
    lilies.setMatrixAt(i, mat4(x, WATER_Y + 0.02, z, -Math.PI / 2, 0, rng() * 6.28));
  }
  root.add(lilies); hideInReflection.push(lilies);

  // ======================= SUỐI & THÁC NƯỚC =======================
  // suối chảy từ thềm sau → đổ thác xuống thềm → chảy ra mép tường kè → đổ thác
  // xuống song chắn dưới phố → chui qua gầm cầu ra ao
  const waterMats = [], waterfalls = [];
  const fogU = THREE.UniformsLib.fog;
  const WATER_GLSL = 'float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }';
  function streamStrip(x0, x1, z0, z1, y) {
    const len = z1 - z0, wid = x1 - x0;
    const m = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([fogU, { uLight: { value: 1 }, uTint: { value: new THREE.Color(1, 1, 1) }, uW: { value: wid }, uL: { value: len } }]),
      transparent: true, depthWrite: false, fog: true,
      vertexShader: `varying vec2 vUv; #include <fog_pars_vertex>
        void main(){ vUv = uv; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mvPosition; #include <fog_vertex> }`.replace(/#include <fog_pars_vertex>/, '\n#include <fog_pars_vertex>\n').replace(/#include <fog_vertex>/, '\n#include <fog_vertex>\n'),
      fragmentShader: `uniform float uTime, uLight, uW, uL; uniform vec3 uTint; varying vec2 vUv;
        #include <fog_pars_fragment>
        ${WATER_GLSL}
        void main(){
          vec2 px = floor(vec2(vUv.x * uW * 16.0, vUv.y * uL * 16.0));
          float o = h21(vec2(px.x, 0.0));
          float n = fract((px.y + uTime * 14.0 * (0.8 + o * 0.4)) / (5.0 + o * 7.0) + o * 3.0);
          float streak = smoothstep(0.72, 0.95, n);
          vec3 col = mix(vec3(0.05, 0.14, 0.18), vec3(0.14, 0.32, 0.38), 0.5 + 0.5 * sin(px.x * 0.9 + px.y * 0.15 + uTime * 2.0));
          col += streak * vec3(0.5, 0.65, 0.7);
          float edge = min(vUv.x, 1.0 - vUv.x);
          col += (1.0 - smoothstep(0.0, 0.16, edge)) * 0.3;
          float sp = step(0.985, h21(px + floor(uTime * 6.0)));
          col = col * uTint * uLight + sp * uTint * 0.9;
          gl_FragColor = vec4(col, 0.9);
          #include <fog_fragment>
        }`,
    });
    m.uniforms.uTime = U.time;
    const g = new THREE.PlaneGeometry(wid, len);
    g.rotateX(-Math.PI / 2);
    // đảo UV để vân nước chảy về phía trước (z tăng)
    const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
    mesh.renderOrder = 2;
    root.add(mesh); waterMats.push(m);
    for (let z = z0 + 0.3; z < z1; z += 0.55) for (const sx of [x0 - 0.2, x1 + 0.2]) stones.add(sx, y + 0.06, z + (rng() - 0.5) * 0.15, 0.38 + rng() * 0.12, 0.24, 0.5, ['#6a6a6e', '#7a7872', '#5a5a5e'][Math.floor(rng() * 3)], rng() * 0.4);
  }
  function waterfall(x0, x1, yTop, yBot, z) {
    const wid = x1 - x0, hei = yTop - yBot;
    const m = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([fogU, { uLight: { value: 1 }, uTint: { value: new THREE.Color(1, 1, 1) }, uW: { value: wid }, uH: { value: hei } }]),
      transparent: true, depthWrite: false, fog: true,
      vertexShader: '\n#include <fog_pars_vertex>\nvarying vec2 vUv; void main(){ vUv = uv; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mvPosition;\n#include <fog_vertex>\n}',
      fragmentShader: `uniform float uTime, uLight, uW, uH; uniform vec3 uTint; varying vec2 vUv;
        #include <fog_pars_fragment>
        ${WATER_GLSL}
        void main(){
          vec2 px = floor(vec2(vUv.x * uW * 16.0, vUv.y * uH * 16.0));
          float o = h21(vec2(px.x, 1.0));
          float n = fract((px.y + uTime * 24.0 * (0.8 + o * 0.5)) / (7.0 + o * 9.0) + o * 5.0);
          float b = smoothstep(0.35, 0.95, n) * (0.7 + 0.3 * h21(vec2(px.x, floor((px.y + uTime * 24.0) / 3.0))));
          float foam = smoothstep(0.2, 0.0, vUv.y) + smoothstep(0.9, 1.0, vUv.y) * 0.5;
          vec3 col = mix(vec3(0.1, 0.24, 0.32), vec3(0.82, 0.93, 1.0), clamp(b * 0.85 + foam, 0.0, 1.0));
          float sp = step(0.972, h21(px + floor(uTime * 8.0)));
          col = col * uTint * uLight + sp * 1.8 * uTint;
          float a = (0.8 + foam * 0.2) * smoothstep(0.0, 0.08, vUv.x) * (1.0 - smoothstep(0.92, 1.0, vUv.x));
          gl_FragColor = vec4(col, a);
          #include <fog_fragment>
        }`,
    });
    m.uniforms.uTime = U.time;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(wid, hei), m);
    mesh.position.set((x0 + x1) / 2, (yTop + yBot) / 2, z);
    mesh.renderOrder = 3;
    root.add(mesh); waterMats.push(m);
    waterfalls.push({ x0, x1, y: Math.max(yBot, 0.05), z: z + 0.15, top: yTop });
  }
  streamStrip(STREAM.x0, STREAM.x1, -27, BACK_Z - 0.62, BY + 0.05);
  waterfall(STREAM.x0, STREAM.x1, BY + 0.2, TY + 0.02, BACK_Z + 0.14);
  streamStrip(STREAM.x0, STREAM.x1, BACK_Z + 0.05, WALL_Z - 0.32, TY + 0.05);
  waterfall(STREAM.x0, STREAM.x1, TY + 0.2, -0.35, WALL_Z + 0.14);
  waterfalls[1].y = 0.05;
  // song chắn nước dưới chân thác (ngoài phần đi được của phố)
  misc.add((STREAM.x0 + STREAM.x1) / 2, 0.012, WALL_Z + 0.4, STREAM.x1 - STREAM.x0 + 0.5, 0.025, 0.62, '#121418');
  for (let i = 0; i < 7; i++) misc.add(STREAM.x0 - 0.15 + i * (STREAM.x1 - STREAM.x0 + 0.3) / 6, 0.03, WALL_Z + 0.4, 0.05, 0.03, 0.6, '#3a3c42');


  // ======================= MÁI NHÀ (dùng chung) =======================
  const roofMatCache = {};
  const mGable = lamb({ map: tx.plank, color: '#a89880' }); mGable.shadowSide = THREE.DoubleSide; seeThrough(mGable);
  const mTrim = lamb({ map: tx.bark, color: '#7a6050' }); seeThrough(mTrim);
  function roofMat(kind) {
    if (!roofMatCache[kind]) {
      const t = roofs[kind] || roofs.red;
      const m = lamb({ map: t.map, normalMap: t.normalMap }); m.shadowSide = THREE.DoubleSide; seeThrough(m);
      roofMatCache[kind] = m;
    }
    return roofMatCache[kind];
  }
  const addRel = (geo, mat, px, py, pz, rx = 0, ry = 0, rz = 0, order = 'XYZ', parent = null) => {
    const local = mat4(px, py, pz, rx, ry, rz, order);
    batch.add(geo, mat, parent ? parent.clone().multiply(local) : local);
  };
  function gableRoof(x, z, w, d, by, wallH, ridge, kind) {
    const mRoof = roofMat(kind);
    const o = 0.42, slope = ridge === 'z' ? 0.8 : 0.72;
    const L = ridge === 'x' ? w : d, Sp = ridge === 'x' ? d : w;
    const rise = (Sp / 2) * Math.tan(slope);
    const roofG = mat4(x, by, z, 0, ridge === 'z' ? Math.PI / 2 : 0, 0);
    const slopeLen = (Sp / 2 + o) / Math.cos(slope);
    const yMid = wallH + rise - (slopeLen / 2) * Math.sin(slope);
    const zMid = (slopeLen / 2) * Math.cos(slope);
    const slab = boxGeo(L + 2 * o, 0.18, slopeLen, 2, 2);
    addRel(slab, mRoof, 0, yMid + 0.09, zMid, slope, 0, 0, 'XYZ', roofG);
    addRel(slab, mRoof, 0, yMid + 0.09, -zMid, slope, Math.PI, 0, 'YXZ', roofG);
    addRel(boxGeo(L + 2 * o + 0.1, 0.2, 0.34, 1), mTrim, 0, wallH + rise + 0.1, 0, 0, 0, 0, 'XYZ', roofG);
    addRel(boxGeo(L + 2 * o, 0.16, 0.14, 1), mTrim, 0, wallH - o * Math.tan(slope) + 0.02, Sp / 2 + o, 0, 0, 0, 'XYZ', roofG);
    const tri = new THREE.BufferGeometry();
    const hs = Sp / 2;
    tri.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -hs, 0, 0, hs, 0, rise, 0], 3));
    tri.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, Sp / 1.5, 0, Sp / 3, rise / 1.5], 2));
    tri.computeVertexNormals();
    for (const sgn of [1, -1]) {
      addRel(tri, mGable, sgn * L / 2, wallH, 0, 0, sgn > 0 ? Math.PI : 0, 0, 'XYZ', roofG);
      for (const s2 of [1, -1]) addRel(boxGeo(0.14, 0.18, slopeLen, 1), mTrim, sgn * (L / 2 + o), yMid + 0.13, s2 * zMid, s2 * slope, 0, 0, 'XYZ', roofG);
    }
    perches.push({ x: x - L * 0.25 * (ridge === 'x' ? 1 : 0), y: by + wallH + rise + 0.22, z });
    return rise;
  }

  // ======================= NHÀ TRÊN THỀM (cảnh nền, bỏ hoang) =======================
  function buildHouse(h) {
    const wallH = h.floors === 2 ? 5.0 : 3.2;
    const by = h.by + 0.45;
    const { x, w, d } = h;
    const z = h.zf - d / 2;
    const fac = T.facadeTex({ w, h: wallH, floors: h.floors, style: h.style, plaster: h.plaster, shutter: h.shutter, door: h.door, ivy: h.ivy, seed: h.seed, lit: h.lit, doorLit: false });
    const side = T.facadeTex({ w: d, h: wallH, floors: h.floors, style: h.style, plaster: h.plaster, shutter: h.shutter, door: 0, winPerFloor: 1, seed: h.seed + 50, lit: false });
    const mk = (t) => {
      const m = lamb({ map: t.map, normalMap: t.normalMap });
      if (t.emissiveMap) { m.emissiveMap = t.emissiveMap; m.emissive.set('#ffb060'); m.emissiveIntensity = 2.2; windowMats.push(m); }
      m.shadowSide = THREE.DoubleSide;
      seeThrough(m);
      return m;
    };
    const mFront = mk(fac), mSide = mk(side), mBack = mk({ map: side.map, normalMap: side.normalMap });
    batch.add(boxGeo(w + 0.5, 0.45, d + 0.5, 2, 1), mWallDark, mat4(x, h.by + 0.225, z));
    addRel(new THREE.PlaneGeometry(w, wallH), mFront, x, by + wallH / 2, z + d / 2);
    addRel(new THREE.PlaneGeometry(w, wallH), mBack, x, by + wallH / 2, z - d / 2, 0, Math.PI, 0);
    addRel(new THREE.PlaneGeometry(d, wallH), mSide, x + w / 2, by + wallH / 2, z, 0, Math.PI / 2, 0);
    addRel(new THREE.PlaneGeometry(d, wallH), mSide, x - w / 2, by + wallH / 2, z, 0, -Math.PI / 2, 0);
    gableRoof(x, z, w, d, by, wallH, h.ridge, h.roof);
    if (h.chimney !== false) {
      const cxp = x + w * 0.27, czp = z - d * 0.15, top = by + wallH + (d / 2) * Math.tan(0.72) + 0.9;
      batch.add(boxGeo(0.7, top - (by + wallH) + 0.2, 0.7, 2, 1), mChimney, mat4(cxp, (top + by + wallH) / 2, czp));
      perches.push({ x: cxp, y: top + 0.14, z: czp });
    }
  }
  const mChimney = lamb({ map: wallTex.map, normalMap: wallTex.normalMap }); seeThrough(mChimney);
  const TERRACE_HOUSES = [
    { x: -31.6, zf: -3.0, w: 4.4, d: 4.0, floors: 1, ridge: 'z', roof: 'moss', style: 'stone', shutter: '#4a3a2a', door: 0.5, seed: 21, lit: false, by: TY },
    { x: 19.0, zf: -3.0, w: 6.0, d: 4.5, floors: 2, ridge: 'x', roof: 'slate', style: 'timber', shutter: '#3a4a5a', door: 0.4, seed: 18, ivy: 3, lit: false, by: TY },
    { x: -34, zf: -16.4, w: 6.5, d: 5, floors: 2, ridge: 'x', roof: 'slate', style: 'timber', shutter: '#3a5a7a', door: 0.5, seed: 31, by: BY, lit: false },
    { x: -1, zf: -16.6, w: 7, d: 5, floors: 1, ridge: 'z', roof: 'red', style: 'stone', shutter: '#3a6a44', door: 0.5, seed: 32, by: BY },
    { x: 30, zf: -16.4, w: 6, d: 5, floors: 2, ridge: 'x', roof: 'moss', style: 'timber', shutter: '#7a2a2a', door: 0.4, seed: 33, by: BY, lit: false },
  ];
  TERRACE_HOUSES.forEach(buildHouse);

  // ======================= ĐỒ NỘI THẤT (khối voxel) =======================
  const fb = (v, x0, x1, z0, z1, y0, y1, col, ry = 0) => v.add((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0), col, ry);
  const GOODS = ['#c83a2a', '#e8c040', '#3a7ac8', '#58a048', '#e8e0d0', '#d86a2a', '#8a4ac8', '#2aa8a0'];
  function shelfUnit(x0, x1, z0, z1, hgt, levels = 3, goods = GOODS, density = 0.55) {
    for (const [px, pz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) fb(metals, px - 0.03, px + 0.03, pz - 0.03, pz + 0.03, 0, hgt, '#8a8c90');
    for (let l = 0; l <= levels; l++) {
      const y = 0.12 + l * (hgt - 0.15) / levels;
      fb(metals, x0, x1, z0, z1, y, y + 0.04, '#9a9ca0');
      if (l === levels) continue;
      for (let x = x0 + 0.08; x < x1 - 0.12; x += 0.16 + rng() * 0.08) {
        if (rng() > density) continue;
        const bh = 0.12 + rng() * 0.18, bd = (z1 - z0) * (0.5 + rng() * 0.4);
        fb(misc, x, x + 0.1 + rng() * 0.06, (z0 + z1) / 2 - bd / 2, (z0 + z1) / 2 + bd / 2, y + 0.04, y + 0.04 + bh, goods[Math.floor(rng() * goods.length)]);
      }
    }
  }
  function counterBox(x0, x1, z0, z1, hgt, col = '#6a5a4a', top = '#8a7a66') {
    fb(planks, x0, x1, z0, z1, 0, hgt - 0.05, col);
    fb(misc, x0 - 0.03, x1 + 0.03, z0 - 0.03, z1 + 0.03, hgt - 0.05, hgt, top);
  }
  function fridge(x0, x1, z0, z1, hgt = 1.85, glow = null) {
    fb(misc, x0, x1, z0, z1, 0, hgt, '#d0d4d0');
    if (glow) fb(bulbs, x0 + 0.06, x1 - 0.06, z1 - 0.005, z1 + 0.01, 0.15, hgt - 0.15, glow);
    else fb(misc, x0 + 0.02, x1 - 0.02, z1, z1 + 0.012, hgt * 0.62, hgt * 0.62 + 0.02, '#5a5e5a');
  }
  function sofa(x0, x1, z0, z1, col) {
    const d = z1 - z0;
    fb(misc, x0, x1, z0, z1, 0.1, 0.45, col);
    fb(misc, x0, x1, z0, z0 + d * 0.3, 0.45, 0.85, col);
    fb(misc, x0 - 0.02, x0 + 0.18, z0, z1, 0.1, 0.62, col); fb(misc, x1 - 0.18, x1 + 0.02, z0, z1, 0.1, 0.62, col);
  }
  function bed(x0, x1, z0, z1) {
    fb(planks, x0, x1, z0, z1, 0, 0.32, '#6a4a30');
    fb(misc, x0 + 0.05, x1 - 0.05, z0 + 0.05, z1 - 0.05, 0.32, 0.5, '#d8d0c0');
    fb(misc, x0 + 0.04, x1 - 0.04, z0 + (z1 - z0) * 0.35, z1 - 0.03, 0.5, 0.56, '#5a6a8a');
    fb(misc, x0 + 0.15, x1 - 0.15, z0 + 0.08, z0 + 0.4, 0.5, 0.62, '#ece8dc');
  }
  function wardrobe(x0, x1, z0, z1, hgt = 1.9, col = '#5a3e28') {
    fb(planks, x0, x1, z0, z1, 0, hgt, col);
    const zf = Math.max(z0, z1);
    fb(misc, (x0 + x1) / 2 - 0.01, (x0 + x1) / 2 + 0.01, zf, zf + 0.012, 0.1, hgt - 0.1, '#2a1a10');
  }
  function table(x0, x1, z0, z1, hgt = 0.75, col = '#7a5a3a') {
    fb(planks, x0, x1, z0, z1, hgt - 0.06, hgt, col);
    for (const [px, pz] of [[x0 + 0.06, z0 + 0.06], [x1 - 0.06, z0 + 0.06], [x0 + 0.06, z1 - 0.06], [x1 - 0.06, z1 - 0.06]]) fb(planks, px - 0.04, px + 0.04, pz - 0.04, pz + 0.04, 0, hgt - 0.06, col);
  }
  function chair(x, z, fallen = false, col = '#6a4a30') {
    if (fallen) { fb(planks, x - 0.22, x + 0.22, z - 0.05, z + 0.4, 0, 0.08, col, rng() * 3); fb(planks, x - 0.22, x + 0.22, z - 0.25, z + 0.2, 0.05, 0.4, col, rng() * 3); return; }
    fb(planks, x - 0.22, x + 0.22, z - 0.22, z + 0.22, 0.42, 0.48, col);
    fb(planks, x - 0.22, x + 0.22, z - 0.24, z - 0.18, 0.48, 0.95, col);
    for (const [dx, dz] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) fb(planks, x + dx - 0.03, x + dx + 0.03, z + dz - 0.03, z + dz + 0.03, 0, 0.42, col);
  }
  function lockers(x0, x1, z0, z1, hgt = 1.9) {
    const n = Math.max(1, Math.round((x1 - x0) / 0.5)), lw = (x1 - x0) / n;
    for (let i = 0; i < n; i++) {
      const a = x0 + i * lw;
      fb(metals, a + 0.01, a + lw - 0.01, z0, z1, 0, hgt, i % 2 ? '#6a7a8a' : '#5e6e7e');
      for (let k = 0; k < 3; k++) fb(misc, a + 0.1, a + lw - 0.1, z1, z1 + 0.012, hgt - 0.25 - k * 0.06, hgt - 0.23 - k * 0.06, '#2a3038');
      if (rng() < 0.35) fb(metals, a + 0.02, a + 0.06, z1, z1 + lw * 0.8, 0.05, hgt - 0.05, '#7a8a9a', 0);
    }
  }
  function desk(x0, x1, z0, z1, pc = true) {
    table(x0, x1, z0, z1, 0.78, '#8a7a6a');
    if (pc) {
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      fb(misc, cx - 0.25, cx + 0.25, cz - 0.08, cz + 0.02, 0.78, 1.15, '#2a2a2e');
      fb(misc, cx - 0.2, cx + 0.2, cz + 0.02, cz + 0.03, 0.83, 1.1, '#1e2a3a');
      fb(misc, cx - 0.3, cx + 0.2, cz + 0.12, cz + 0.28, 0.78, 0.81, '#3a3a3e');
    }
    for (let i = 0; i < 3; i++) fb(misc, x0 + 0.1 + rng() * (x1 - x0 - 0.4), 0, z0 + 0.1, z0 + 0.35, 0.78, 0.785, '#e8e4d8');
  }
  function crateStack(x, z, n = 2) {
    for (let i = 0; i < n; i++) crates.add(x + (rng() - 0.5) * 0.15, 0.32 + i * 0.6, z + (rng() - 0.5) * 0.15, 0.62, 0.6, 0.62, '#ffffff', (rng() - 0.5) * 0.4);
  }
  function papers(x0, x1, z0, z1, n) {
    for (let i = 0; i < n; i++) misc.add(x0 + rng() * (x1 - x0), 0.02, z0 + rng() * (z1 - z0), 0.2 + rng() * 0.12, 0.008, 0.26 + rng() * 0.1, rng() < 0.8 ? '#e0dccc' : '#c8b890', rng() * 3);
  }
  function bloodPool(x, z, s = 1) {
    for (let i = 0; i < 4; i++) misc.add(x + (rng() - 0.5) * 0.5 * s, 0.015, z + (rng() - 0.5) * 0.35 * s, (0.3 + rng() * 0.4) * s, 0.008, (0.2 + rng() * 0.3) * s, rng() < 0.5 ? '#4a0a08' : '#5e100c', rng() * 3);
  }
  function debris(x, z, n = 6, r = 0.8) {
    for (let i = 0; i < n; i++) {
      const pick = rng();
      if (pick < 0.4) planks.add(x + (rng() - 0.5) * r, 0.04 + rng() * 0.1, z + (rng() - 0.5) * r * 0.6, 0.6 + rng() * 0.6, 0.06, 0.12, '#8a6a4a', rng() * 3);
      else if (pick < 0.75) stones.add(x + (rng() - 0.5) * r, 0.06, z + (rng() - 0.5) * r * 0.6, 0.22, 0.12, 0.12, rng() < 0.5 ? '#8a5a44' : '#7a7670', rng() * 3);
      else misc.add(x + (rng() - 0.5) * r, 0.03, z + (rng() - 0.5) * r * 0.6, 0.15, 0.02, 0.12, '#9ab0c0', rng() * 3);
    }
  }

  // ======================= CÁC TOÀ NHÀ VÀO ĐƯỢC =======================
  const floorCache = {};
  const powerMats = [];
  function buildBuilding(b) {
    const w = b.x1 - b.x0, h = b.h, cx = (b.x0 + b.x1) / 2, zf = WALL_Z, zb = ZB, zm = (zf + zb) / 2;
    Object.assign(b, { cut: { value: 0 }, cx, zf, zb, w, doorX0: b.door - b.doorW / 2, doorX1: b.door + b.doorW / 2 });
    const shopLike = b.kind === 'kiosk' || b.kind === 'grocery' || b.kind === 'pharmacy';
    const fac = T.townFacadeTex({
      w, h, floors: b.floors, kind: shopLike ? 'shop' : b.kind, wall: b.wall, plaster: b.plaster,
      door: { x: b.door - b.x0, w: b.doorW, h: b.doorH || 2.1 }, shop: b.shop ? [0.3, w - 0.3] : null,
      sign: b.sign ? { ...b.sign, lit: b.kind === 'police' } : null, seed: b.seed, posters: b.posters || 0, graffiti: b.graffiti, blood: b.blood,
      litChance: b.kind === 'house' ? 0.1 : 0.0,
    });
    const Hpx = Math.round(h * 16), wallPx = Hpx - 8, floorPx = wallPx / b.floors;
    const cutY = b.floors > 1 ? (8 + floorPx + 1) / 16 : h;
    b.cutY = cutY; b.ceil = b.floors > 1 ? cutY : h;
    const front = (cut) => {
      const m = lamb({ map: fac.map, normalMap: fac.normalMap });
      m.emissiveMap = fac.emissiveMap; m.emissive.set('#ffffff'); m.emissiveIntensity = 2;
      if (b.kind === 'police') powerMats.push({ m, k: 2.2 }); else windowMats.push(m);
      m.shadowSide = THREE.DoubleSide;
      if (cut) cutPatch(m, b.cut);
      seeThrough(m);
      return m;
    };
    const facePlane = (wid, y0, y1, v0, v1) => {
      const g = new THREE.PlaneGeometry(wid, y1 - y0);
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setY(i, v0 + (v1 - v0) * uv.getY(i));
      return g;
    };
    batch.add(facePlane(w, 0, cutY, 0, cutY / h), front(true), mat4(cx, cutY / 2, zf));
    if (b.floors > 1) batch.add(facePlane(w, cutY, h, cutY / h, 1), front(false), mat4(cx, (cutY + h) / 2, zf));
    // tường hông bên ngoài
    const side = T.townFacadeTex({ w: BLD_D, h, floors: b.floors, kind: 'house', wall: b.wall, plaster: b.plaster, winPerFloor: 1, seed: b.seed + 50 });
    const mSide = lamb({ map: side.map, normalMap: side.normalMap }); mSide.shadowSide = THREE.DoubleSide; seeThrough(mSide);
    batch.add(new THREE.PlaneGeometry(BLD_D, h), mSide, mat4(b.x0, h / 2, zm, 0, -Math.PI / 2, 0));
    batch.add(new THREE.PlaneGeometry(BLD_D, h), mSide, mat4(b.x1, h / 2, zm, 0, Math.PI / 2, 0));
    // bên trong: tường sau, hai tường hông, sàn
    const rk = shopLike ? (b.kind === 'pharmacy' ? 'pharmacy' : 'shop') : b.kind === 'workshop' ? 'house' : b.kind;
    const ceil = b.ceil;
    const back = T.roomWallTex({ w: w - 0.24, h: ceil, kind: rk, seed: b.seed + 7 });
    const inT = T.roomWallTex({ w: BLD_D, h: ceil, kind: rk, seed: b.seed + 8 });
    const mBack = lamb({ map: back.map, normalMap: back.normalMap, color: '#c8c0b8' });
    const mIn = lamb({ map: inT.map, normalMap: inT.normalMap, color: '#b0a8a0' });
    batch.add(new THREE.PlaneGeometry(w - 0.24, ceil), mBack, mat4(cx, ceil / 2, zb + 0.12));
    batch.add(new THREE.PlaneGeometry(BLD_D - 0.1, ceil), mIn, mat4(b.x0 + 0.12, ceil / 2, zm + 0.05, 0, Math.PI / 2, 0));
    batch.add(new THREE.PlaneGeometry(BLD_D - 0.1, ceil), mIn, mat4(b.x1 - 0.12, ceil / 2, zm + 0.05, 0, -Math.PI / 2, 0));
    if (!floorCache[b.floor]) {
      const ft = T.floorTex(b.floor, b.seed);
      floorCache[b.floor] = lamb({ map: ft.map, normalMap: ft.normalMap, color: '#bcb4ac' });
    }
    const fg = new THREE.PlaneGeometry(w - 0.24, BLD_D - 0.1);
    const fuv = fg.attributes.uv; for (let i = 0; i < fuv.count; i++) fuv.setXY(i, fuv.getX(i) * (w - 0.24) / 2, fuv.getY(i) * (BLD_D - 0.1) / 2);
    fg.rotateX(-Math.PI / 2);
    batch.add(fg, floorCache[b.floor], mat4(cx, 0.012, zm + 0.05));
    // ngưỡng cửa
    misc.add(b.door, 0.02, zf - 0.05, b.doorW, 0.04, 0.22, '#3a3632');
    // mái
    if (b.roof === 'flat') {
      batch.add(boxGeo(w + 0.2, 0.3, BLD_D + 0.25, 2), mRoofFlat, mat4(cx, h + 0.15, zm + 0.05));
      batch.add(boxGeo(w + 0.3, 0.55, 0.22, 2, 1), mParapet, mat4(cx, h + 0.42, zf + 0.06));
      for (const sx of [b.x0 - 0.04, b.x1 + 0.04]) batch.add(boxGeo(0.22, 0.55, BLD_D + 0.25, 1), mParapet, mat4(sx, h + 0.42, zm + 0.05));
      const r2 = makeRng(b.seed * 13);
      misc.add(cx - w * 0.22, h + 0.62, zm - 0.6, 1.0, 0.65, 0.7, '#9a9c9e'); misc.add(cx - w * 0.22, h + 0.65, zm - 0.24, 0.6, 0.45, 0.02, '#3a3c3e');
      if (r2() < 0.7) { misc.add(cx + w * 0.25, h + 0.95, zm - 1.2, 1.1, 1.3, 1.1, '#5a6a7a'); misc.add(cx + w * 0.25, h + 1.65, zm - 1.2, 1.2, 0.1, 1.2, '#4a5a6a'); }
      misc.add(cx + w * 0.05, h + 0.45, zm + 0.8, 0.12, 0.3, 0.12, '#4a4a4e');
      perches.push({ x: cx - w * 0.3, y: h + 0.7, z: zf + 0.06 });
    } else {
      gableRoof(cx, zm, w, BLD_D, 0, h, 'x', b.roof);
    }
    if (b.antenna) {
      const ax = cx + w * 0.3, az = zm - 0.5, base = h + (BLD_D / 2) * Math.tan(0.72) * 0.6;
      misc.add(ax, base + 1.6, az, 0.08, 3.2, 0.08, '#3a3a40');
      for (let i = 0; i < 4; i++) misc.add(ax, base + 1.4 + i * 0.5, az, 1.4 - i * 0.25, 0.05, 0.05, '#4a4a50');
      perches.push({ x: ax, y: base + 3.3, z: az });
    }
    // đèn trong nhà (nến / đèn tuýp chập chờn / đèn điện chờ máy phát)
    const lz = zm + 0.3, ly = ceil - 0.35;
    const col = b.light === 'candle' ? '#ffa860' : '#d8e8ff';
    b.emitter = emit(cx + (b.lightDx || 0), ly, lz, col, b.light === 'candle' ? 5.5 : 7.5, 7.5, b.light === 'power' ? 'power' : 'inner', b.light === 'candle' ? 'fire' : b.light === 'flicker' ? 'broken' : 'lamp');
    b.emitter.building = b.id;
    if (b.light !== 'candle') { fb(misc, cx - 0.6, cx + 0.6, lz - 0.08, lz + 0.08, ceil - 0.08, ceil - 0.02, '#3a3a3e'); }
    // va chạm tường (chừa ô cửa)
    const t = 0.18;
    addBox(b.x0 - 0.05, zb - 0.4, b.x0 + t, zf + 0.02);
    addBox(b.x1 - t, zb - 0.4, b.x1 + 0.05, zf + 0.02);
    addBox(b.x0, zb - 0.4, b.x1, zb + t);
    addBox(b.x0, zf - t, b.doorX0, zf + 0.04);
    addBox(b.doorX1, zf - t, b.x1, zf + 0.04);
    FURNISH[b.kind](b);
  }
  const mRoofFlat = lamb({ map: tx.stone, color: '#5e5c58' }); seeThrough(mRoofFlat);
  const mCanopy = lamb({ map: tx.plain, color: '#d8d8d0' }); seeThrough(mCanopy);
  const mFascia = lamb({ map: tx.plain, color: '#b8281e' }); seeThrough(mFascia);
  const mParapet = lamb({ map: wallTex2.map, color: '#8a8680' }); seeThrough(mParapet);
  const mCloth = lamb({ map: T.clothTile('#6a7048') });

  const FURNISH = {
    kiosk(b) {
      counterBox(-55.7, -54.3, -3.05, -2.5, 1.0);
      misc.add(-55.0, 1.12, -2.78, 0.4, 0.22, 0.3, '#2a2a2e');
      addBox(-55.75, -3.1, -54.25, -2.45);
      container('register', -54.9, -3.55, 'Quầy thu ngân', b);
      shelfUnit(-55.6, -51.6, -7.42, -6.92, 1.65);
      addBox(-55.65, -7.45, -51.55, -6.88);
      container('shelf_food', -54.6, -6.45, 'Kệ hàng', b);
      container('shelf_food', -52.6, -6.45, 'Kệ hàng', b);
      shelfUnit(-55.2, -52.4, -5.05, -4.45, 1.3);
      addBox(-55.25, -5.1, -52.35, -4.4);
      container('shelf_food', -53.8, -4.0, 'Kệ bánh kẹo', b);
      fridge(-51.28, -50.68, -6.6, -4.6, 1.9, '#9ad0ff');
      addBox(-51.3, -6.65, -50.6, -4.55);
      container('drinks', -51.75, -5.6, 'Tủ nước ngọt', b);
      crateStack(-51.1, -2.9, 2); addBox(-51.45, -3.25, -50.75, -2.55);
      papers(-55.5, -51.2, -6.2, -2.4, 10); bloodPool(-53.6, -5.6, 0.8);
    },
    garage(b) {
      // xe đang sửa, nắp capo mở
      const cxp = -46.1, czp = -4.7;
      fb(misc, cxp - 1.85, cxp + 1.85, czp - 0.8, czp + 0.8, 0.3, 0.92, '#7a2a22');
      fb(misc, cxp - 0.9, cxp + 0.6, czp - 0.72, czp + 0.72, 0.92, 1.4, '#7a2a22');
      fb(misc, cxp - 0.88, cxp + 0.58, czp - 0.74, czp + 0.74, 1.0, 1.32, '#141a22');
      fb(misc, cxp + 1.0, cxp + 1.9, czp - 0.7, czp + 0.7, 1.15, 1.2, '#7a2a22', 0);
      for (const [dx, dz] of [[-1.2, -0.8], [1.2, -0.8], [-1.2, 0.8], [1.2, 0.8]]) fb(misc, cxp + dx - 0.33, cxp + dx + 0.33, czp + dz - 0.13, czp + dz + 0.13, 0, 0.62, '#141416');
      addBox(cxp - 1.9, czp - 0.85, cxp + 1.9, czp + 0.85);
      counterBox(-49.2, -46.6, -7.45, -6.85, 0.95, '#5a4a3a', '#6a6a6e');
      misc.add(-47.8, 1.07, -7.1, 0.6, 0.22, 0.32, '#c83a2a');
      addBox(-49.25, -7.5, -46.55, -6.8);
      container('toolbox', -47.8, -6.4, 'Hộp đồ nghề', b);
      // can xăng (nhiệm vụ)
      for (let i = 0; i < 3; i++) fb(misc, -44.15 + i * 0.36 - 0.15, -44.15 + i * 0.36 + 0.15, -7.4, -6.95, 0, 0.5, '#c8281e');
      shelfUnit(-44.5, -43.25, -7.45, -6.95, 1.5, 2, ['#c8281e', '#2a2a2e', '#d8a020'], 0.7);
      addBox(-44.55, -7.5, -43.2, -6.9);
      container('fuel', -43.9, -6.45, 'Can xăng', b, { quest: true });
      for (let i = 0; i < 3; i++) misc.add(-49.0, 0.13 + i * 0.26, -3.0, 0.75, 0.24, 0.75, '#1a1a1c');
      addCircle(-49.0, -3.0, 0.4);
      for (let i = 0; i < 2; i++) { batch.add(fireBarrelGeoS, mDrum, mat4(-43.7 - i * 0.7, 0.45, -3.0)); }
      addBox(-44.9, -3.4, -43.3, -2.6);
      bloodPool(-45.5, -3.3, 1.2);
    },
    house(b) {
      const L = b.x0, R = b.x1;
      // bếp: tủ bếp dọc tường sau + tủ lạnh
      counterBox(L + 0.2, L + 2.9, -7.45, -6.85, 0.95, '#a8a090', '#d8d4c8');
      for (let i = 0; i < 4; i++) misc.add(L + 0.5 + i * 0.66, 0.5, -6.84, 0.04, 0.04, 0.012, '#2a2a2e');
      addBox(L + 0.15, -7.5, L + 2.95, -6.8);
      container('cabinet', L + 1.5, -6.4, 'Tủ bếp', b);
      fridge(L + 0.18, L + 0.85, -6.2, -5.4, 1.85);
      addBox(L + 0.15, -6.25, L + 0.9, -5.35);
      container('fridge', L + 1.3, -5.8, 'Tủ lạnh', b);
      // phòng khách: sofa, bàn trà, tủ quần áo
      sofa(R - 3.2, R - 1.0, -7.45, -6.6, b.seed % 2 ? '#6a3a3a' : '#3a4a6a');
      addBox(R - 3.25, -7.5, R - 0.95, -6.55, true);
      container('sofa', R - 2.1, -6.2, 'Ghế sofa', b);
      table(R - 2.7, R - 1.6, -5.6, -5.0, 0.45, '#5a3e28');
      addBox(R - 2.75, -5.65, R - 1.55, -4.95, true);
      wardrobe(R - 0.75, R - 0.2, -5.2, -3.6, 1.95);
      addBox(R - 0.8, -5.25, R - 0.15, -3.55);
      container('wardrobe', R - 1.2, -4.4, 'Tủ quần áo', b);
      // cầu thang lên tầng (bị chặn)
      for (let i = 0; i < 5; i++) fb(planks, L + 0.2, L + 1.1, -3.0 - i * 0.28 - 0.28, -3.0 - i * 0.28, 0, 0.2 + i * 0.2, '#6a4a30');
      addBox(L + 0.15, -4.5, L + 1.15, -2.9);
      debris(L + 0.7, -4.3, 5, 0.6);
      table(L + 1.6, L + 2.8, -4.6, -3.8, 0.75); chair(L + 1.9, -3.5, true); chair(L + 2.5, -4.9);
      addBox(L + 1.55, -4.65, L + 2.85, -3.75, true);
      papers(L + 0.5, R - 0.5, -6.5, -2.6, 8);
      bloodPool(L + 3.4, -4.2, 1.1);
    },
    grocery(b) {
      for (const z of [-4.2, -6.0]) {
        shelfUnit(-19.3, -13.6, z - 0.35, z + 0.35, 1.45, 3, GOODS, 0.45);
        addBox(-19.35, z - 0.4, -13.55, z + 0.4);
      }
      container('shelf_food', -18.2, -3.55, 'Kệ đồ hộp', b);
      container('shelf_food', -15.0, -5.1, 'Kệ mì gói', b);
      container('shelf_food', -17.6, -6.85, 'Kệ nước uống', b);
      fridge(-11.75, -11.15, -6.2, -3.9, 1.9, '#a8e0ff');
      addBox(-11.8, -6.25, -11.1, -3.85);
      container('drinks', -12.25, -5.1, 'Tủ nước ngọt', b);
      counterBox(-14.3, -12.5, -3.45, -2.9, 1.0, '#7a3a2a', '#9a8a7a');
      misc.add(-13.0, 1.12, -3.2, 0.4, 0.22, 0.3, '#2a2a2e');
      addBox(-14.35, -3.5, -12.45, -2.85);
      container('register', -13.4, -2.45, 'Quầy thu ngân', b);
      crateStack(-12.0, -7.0, 3); crateStack(-12.75, -7.05, 2);
      addBox(-13.15, -7.45, -11.6, -6.6);
      container('storage', -13.6, -6.85, 'Thùng hàng kho', b);
      papers(-19.5, -11.5, -7.2, -2.3, 14); debris(-16.2, -2.6, 6, 1.0);
      bloodPool(-16.6, -5.1, 1.3);
    },
    pharmacy(b) {
      counterBox(-9.6, -7.9, -4.65, -4.05, 1.05, '#d8d8d0', '#e8e8e0');
      counterBox(-6.1, -4.4, -4.65, -4.05, 1.05, '#d8d8d0', '#e8e8e0');
      addBox(-9.65, -4.7, -7.85, -4.0); addBox(-6.15, -4.7, -4.35, -4.0);
      container('counter_med', -8.7, -3.6, 'Ngăn kéo quầy', b);
      shelfUnit(-9.7, -4.3, -7.45, -6.95, 1.9, 4, ['#e8e8e0', '#c83a2a', '#3a8ac8', '#58a048', '#f0f0e8'], 0.6);
      addBox(-9.75, -7.5, -4.25, -6.9);
      container('med_shelf', -8.4, -6.45, 'Kệ thuốc', b);
      container('med_shelf', -5.6, -6.45, 'Kệ thuốc', b);
      fb(misc, -9.88, -9.5, -6.2, -5.0, 0.9, 1.7, '#e8e8e0');
      fb(misc, -9.5, -9.49, -5.75, -5.45, 1.25, 1.31, '#c8281e'); fb(misc, -9.5, -9.49, -5.63, -5.57, 1.13, 1.43, '#c8281e');
      container('med_cabinet', -9.0, -5.6, 'Tủ y tế', b);
      papers(-9.6, -4.4, -6.6, -2.4, 10); bloodPool(-7.0, -5.6, 0.8);
    },
    workshop(b) {
      counterBox(9.6, 12.7, -7.45, -6.75, 0.85, '#5a4a3a', '#6a5a4a');
      for (let i = 0; i < 4; i++) { fb(misc, 9.8 + i * 0.7, 10.3 + i * 0.7, -7.35, -6.95, 0.85, 1.2 + (i % 2) * 0.15, '#3a3a40'); fb(bulbs, 9.9 + i * 0.7, 10.0 + i * 0.7, -6.95, -6.94, 1.0, 1.06, i % 2 ? '#5aff7a' : '#ffb03a'); }
      misc.add(11.2, 2.4, -7.4, 3.0, 0.02, 0.02, '#1a1a1e');
      addBox(9.55, -7.5, 12.75, -6.7);
      container('radio_desk', 11.1, -6.3, 'Bàn điện đài', b, { quest: true });
      shelfUnit(7.25, 9.2, -7.45, -7.0, 1.6, 3, ['#3a3a40', '#5a7a3a', '#c8a020', '#8a8a8a'], 0.65);
      addBox(7.2, -7.5, 9.25, -6.95);
      container('parts_shelf', 8.2, -6.55, 'Kệ linh kiện', b);
      bed(11.4, 12.75, -4.7, -2.7);
      addBox(11.35, -4.75, 12.8, -2.65, true);
      container('backpack', 10.9, -3.7, 'Ba lô cũ', b);
      table(7.5, 8.6, -4.4, -3.6, 0.75); chair(8.0, -3.2, true);
      addBox(7.45, -4.45, 8.65, -3.55, true);
      papers(7.4, 12.6, -6.5, -2.4, 6);
    },
    police(b) {
      counterBox(30.0, 33.6, -3.65, -3.05, 1.05, '#4a5a7a', '#8a94a4');
      addBox(29.95, -3.7, 33.65, -3.0);
      container('register', 31.8, -2.6, 'Quầy tiếp dân', b);
      lockers(29.3, 32.3, -7.45, -7.0);
      addBox(29.25, -7.5, 32.35, -6.95);
      container('locker', 30.1, -6.55, 'Tủ đồ cảnh sát', b);
      container('locker', 31.6, -6.55, 'Tủ đồ cảnh sát', b);
      // bàn bộ đàm (nhiệm vụ gọi cứu hộ)
      counterBox(32.9, 34.9, -7.45, -6.8, 0.85, '#3a3a40', '#5a5a60');
      fb(misc, 33.1, 34.7, -7.42, -7.0, 0.85, 1.55, '#2a2e34');
      const dial = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.3, 0.02), lamb({ color: '#101418', emissive: new THREE.Color('#5aff8a'), emissiveIntensity: 0 }));
      dial.position.set(33.9, 1.25, -6.99); root.add(dial); powerMats.push({ m: dial.material, k: 1.6 });
      misc.add(34.6, 2.2, -7.3, 0.05, 1.4, 0.05, '#2a2a2e');
      addBox(32.85, -7.5, 34.95, -6.75);
      pois.radio = { x: 33.9, z: -6.25, b: b.id, label: 'Bộ đàm cứu hộ' };
      desk(35.8, 37.2, -5.0, -4.3); chair(36.5, -5.3, false);
      addBox(35.75, -5.05, 37.25, -4.25);
      container('desk', 36.5, -5.65, 'Bàn làm việc', b);
      desk(38.2, 39.6, -5.0, -4.3); chair(38.9, -5.3, true);
      addBox(38.15, -5.05, 39.65, -4.25);
      container('chief_desk', 38.9, -5.65, 'Bàn trưởng đồn', b);
      // kho súng có lồng sắt khoá
      const cx0 = 39.9, cz1 = -5.75;
      for (let x = cx0; x <= 42.8; x += 0.16) if (x < 40.55 || x > 41.55) fb(metals, x - 0.015, x + 0.015, cz1 - 0.015, cz1 + 0.015, 0, 2.4, '#3a3a40');
      for (let z = -7.45; z <= cz1; z += 0.16) fb(metals, cx0 - 0.015, cx0 + 0.015, z - 0.015, z + 0.015, 0, 2.4, '#3a3a40');
      fb(metals, cx0, 42.85, cz1 - 0.02, cz1 + 0.02, 2.38, 2.44, '#3a3a40');
      const door = new THREE.Group();
      const barMat = lamb({ map: tx.metal, color: '#4a4a52' });
      for (let x = 0.08; x < 1.0; x += 0.16) { const bar = new THREE.Mesh(new THREE.BoxGeometry(0.03, 2.3, 0.03), barMat); bar.position.set(x, 1.15, 0); bar.castShadow = true; door.add(bar); }
      for (const y of [0.15, 1.15, 2.2]) { const bar = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.05, 0.05), barMat); bar.position.set(0.5, y, 0); door.add(bar); }
      const lock = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.08), lamb({ color: '#b8902a' })); lock.position.set(0.9, 1.15, 0.05); door.add(lock);
      door.position.set(40.55, 0, cz1); root.add(door);
      shelfUnit(40.2, 42.6, -7.45, -7.0, 1.6, 2, ['#2a2a2e', '#4a5a2a', '#6a5a3a'], 0.8);
      const cageBox = addBox(cx0 - 0.05, cz1 - 0.05, 42.85, cz1 + 0.05);
      addBox(cx0 - 0.05, -7.5, cx0 + 0.05, cz1);
      pois.armory = { x: 41.05, z: -5.2, door, box: cageBox, open: false, label: 'Kho vũ khí (khoá)' };
      container('armory', 41.4, -6.55, 'Giá súng', b, { locked: 'armory' });
      papers(29.5, 42.5, -6.5, -2.4, 16); bloodPool(34.2, -4.4, 1.4); bloodPool(37.6, -6.2, 0.9);
      chair(33.0, -4.6, true); debris(30.6, -5.2, 6, 0.9);
    },
  };
  const fireBarrelGeoS = new THREE.CylinderGeometry(0.34, 0.31, 0.9, 10), mDrum = lamb({ map: tx.metal, color: '#3a5a8a' });
  for (const b of BUILDINGS) buildBuilding(b);
  // ======================= CÂY, BỤI =======================
  const TREE_COLORS = {
    oak: ['#3f6a28', '#4e7c2e', '#5d8a34', '#6c9a3c'],
    oak2: ['#365e26', '#447026', '#557e2c', '#668e36'],
    autumn: ['#a8481e', '#c0602a', '#d88a34', '#e8a83e'],
    gold: ['#8a7a22', '#a8922a', '#c0aa36', '#d6c04a'],
    pine: ['#1e3a26', '#25462c', '#2e5434', '#38623c'],
  };
  function canopy(cx, cy, cz, clusters, palette, rr, VS = 0.5, record = true) {
    const cells = new Map();
    const key = (i, j, k) => i + ',' + j + ',' + k;
    let minY = Infinity, maxY = -Infinity;
    for (const [ox, oy, oz, r] of clusters) {
      const x0 = cx + ox, y0 = cy + oy, z0 = cz + oz;
      for (let i = Math.floor((x0 - r) / VS); i <= Math.ceil((x0 + r) / VS); i++)
        for (let j = Math.floor((y0 - r) / VS); j <= Math.ceil((y0 + r) / VS); j++)
          for (let k = Math.floor((z0 - r) / VS); k <= Math.ceil((z0 + r) / VS); k++) {
            const px = i * VS, py = j * VS, pz = k * VS;
            if (Math.hypot(px - x0, (py - y0) * 1.15, pz - z0) <= r * (0.82 + rr() * 0.28)) { cells.set(key(i, j, k), [i, j, k]); minY = Math.min(minY, py); maxY = Math.max(maxY, py); }
          }
    }
    for (const [i, j, k] of cells.values()) {
      const open = (a, b, c) => !cells.has(key(i + a, j + b, k + c));
      if (!(open(0, 1, 0) || open(0, 0, 1) || open(1, 0, 0) || open(-1, 0, 0))) continue;
      const ty = (j * VS - minY) / Math.max(0.1, maxY - minY);
      const base = new THREE.Color(palette[Math.min(palette.length - 1, Math.floor(rr() * 1.4 + ty * (palette.length - 1.2)))]);
      base.multiplyScalar(0.62 + ty * 0.45 + (rr() - 0.5) * 0.12);
      leaves.add(i * VS, j * VS, k * VS, VS * 1.02, VS * 1.02, VS * 1.02, '#' + base.getHexString());
    }
    if (record) canopies.push({ x: cx, y: cy, z: cz, r: clusters[0][3], color: palette[2] });
  }
  function tree(x, z, s = 1, type = 'oak', y0 = 0, VS = 0.5) {
    const rr = makeRng(Math.floor(x * 1000 + z * 77) + 5);
    if (type === 'dead') {
      const th = 3.4 * s;
      for (let y = 0; y < th; y += 0.5) trunks.add(x, y0 + y + 0.25, z, 0.42 - y * 0.03, 0.5, 0.42 - y * 0.03, '#5a5048');
      for (const [dx, hy, len] of [[1, 0.8, 0.6], [-1, 0.55, 0.9], [0.6, 0.95, -0.4], [-0.7, 0.75, -0.6]])
        for (let i = 1; i <= 3; i++) trunks.add(x + dx * i * 0.32 * len * 1.6, y0 + th * hy + i * 0.28, z + (rr() - 0.5) * 0.3, 0.24, 0.24, 0.24, '#4e463e');
      perches.push({ x: x + 0.5, y: y0 + th * 0.95 + 0.6, z });
      return;
    }
    if (type === 'pine') {
      const th = 1.6 * s;
      for (let y = 0; y < th; y += 0.5) trunks.add(x, y0 + y + 0.25, z, 0.5, 0.5, 0.5, '#6a4a30');
      const pal = TREE_COLORS.pine;
      for (let tier = 0; tier < 4; tier++) {
        const r = (2.0 - tier * 0.45) * s, oy = tier * 1.25 * s;
        for (let i = -Math.ceil(r / VS); i <= Math.ceil(r / VS); i++)
          for (let k = -Math.ceil(r / VS); k <= Math.ceil(r / VS); k++)
            for (let j = 0; j < 3; j++) {
              const rad = r * (1 - j / 3), dd = Math.hypot(i * VS, k * VS);
              if (dd <= rad * (0.85 + rr() * 0.2) && (dd > rad - 0.9 || j === 2) && k * VS > -rad + 0.6) {
                const c = new THREE.Color(pal[Math.min(3, j + Math.floor(rr() * 2))]).multiplyScalar(0.7 + j * 0.15);
                leaves.add(x + i * VS, y0 + th + oy + j * VS + 0.25, z + k * VS, VS, VS, VS, '#' + c.getHexString());
              }
            }
      }
      canopies.push({ x, y: y0 + th + 2.2 * s, z, r: 1.8 * s, color: pal[2] });
      return;
    }
    const th = (1.9 + rr() * 0.6) * s;
    const tw = 0.62 * Math.max(1, s * 0.8);
    for (let y = 0; y < th + 0.8; y += 0.5) trunks.add(x, y0 + y + 0.25, z, tw, 0.5, tw, y < 0.5 ? '#5a3e28' : '#6e4e34');
    trunks.add(x + 0.45, y0 + 0.15, z, 0.4, 0.3, 0.4, '#5a3e28'); trunks.add(x - 0.45, y0 + 0.15, z + 0.1, 0.4, 0.3, 0.4, '#5a3e28');
    for (let i = 1; i <= 3; i++) { trunks.add(x + i * 0.35 * s, y0 + th - 0.2 + i * 0.32, z, 0.32, 0.32, 0.32, '#6e4e34'); trunks.add(x - i * 0.32 * s, y0 + th + i * 0.3, z + 0.1, 0.3, 0.3, 0.3, '#6e4e34'); }
    canopy(x, y0 + th, z, [[0, 1.5 * s, 0, 1.9 * s], [-1.3 * s, 0.9 * s, 0.25, 1.35 * s], [1.35 * s, 1.0 * s, -0.2, 1.45 * s], [0.2, 2.6 * s, -0.2, 1.35 * s]], TREE_COLORS[type] || TREE_COLORS.oak, rr, VS);
  }
  function bush(x, z, s = 1, y0 = 0, pal = TREE_COLORS.oak2, flowers = null) {
    const rr = makeRng(Math.floor(x * 931 + z * 37 + y0 * 7));
    canopy(x, y0, z, [[0, 0.5 * s, 0, 0.95 * s], [0.6 * s, 0.35 * s, 0.1, 0.7 * s]], pal, rr, 0.5, false);
    if (flowers) for (let i = 0; i < 6; i++) misc.add(x + (rr() - 0.5) * 1.4 * s, y0 + 0.6 * s + rr() * 0.6 * s, z + 0.35 * s + rr() * 0.3, 0.16, 0.16, 0.16, flowers);
  }
  const VSfar = hi ? 0.62 : 0.75;
  tree(-23.4, -8.8, 1.3, 'oak', TY);
  tree(-58.5, -7, 1.2, 'oak2', TY);
  tree(-37.2, -9.2, 1.0, 'autumn', TY);
  tree(10.8, -9.5, 0.95, 'dead', TY);
  tree(31.5, -9, 1.0, 'pine', TY);
  tree(40, -11.5, 0.9, 'dead', TY);
  tree(57.2, -11.8, 1.0, 'dead', TY);
  tree(-6.5, -9.6, 1.0, 'dead', TY);
  for (let i = 0; i < 22; i++) {
    const x = XMIN + 3 + i * 6.4 + rng.range(-1.5, 1.5);
    if (TERRACE_HOUSES.some((h) => h.by === BY && Math.abs(h.x - x) < h.w / 2 + 1.5)) continue;
    if (Math.abs(x - 12) < 3) continue;
    tree(x, -20 - rng.range(0, 6), 1.15 + rng() * 0.4, rng.chance(0.3) ? 'pine' : rng.chance(0.2) ? 'dead' : rng.chance(0.25) ? 'autumn' : rng.chance(0.5) ? 'oak' : 'oak2', BY, VSfar);
  }
  for (let i = 0; i < 16; i++) tree(XMIN + 6 + i * 9 + rng.range(-2, 2), -31 - rng.range(0, 8), 1.4 + rng() * 0.4, rng.chance(0.4) ? 'pine' : 'oak2', BY, 0.8);
  for (let x = XMIN + 3; x < XMAX - 3; x += rng.range(2.6, 5.5)) {
    if (STAIRS.some((s) => Math.abs(s.x - x) < 2.2)) continue;
    if (x > cemetery.x0 - 1 && x < cemetery.x1) continue;
    if (x > STREAM.x0 - 1.6 && x < STREAM.x1 + 1.6) continue;
    if (BUILDINGS.some((b) => x > b.x0 - 1.2 && x < b.x1 + 1.2)) continue;
    if (TERRACE_HOUSES.some((h) => h.by === TY && Math.abs(h.x - x) < h.w / 2 + 1)) continue;
    bush(x, -3.0 - rng() * 0.8, 0.8 + rng() * 0.45, TY, rng.chance(0.5) ? TREE_COLORS.oak2 : TREE_COLORS.oak, null);
  }
  for (let x = XMIN + 2; x < XMAX - 2; x += rng.range(5, 10)) {
    if (x > POND.cx - 9 && x < POND.cx + 9) continue;
    if (x > camp.x0 - 1 && x < camp.x1 + 1) continue;
    bush(x, 5.6 + rng() * 1.5, 0.85 + rng() * 0.4, 0, rng.chance(0.5) ? TREE_COLORS.oak2 : TREE_COLORS.oak, null);
  }

  // ======================= ĐÈN (đa số hỏng) =======================
  function lampPost(x, z, color = '#ffb85e', y0 = 0, h = 2.4, state = 'lamp') {
    misc.add(x, y0 + 0.12, z, 0.34, 0.24, 0.34, '#2a2a30');
    misc.add(x, y0 + h / 2, z, 0.13, h, 0.13, '#26262c');
    misc.add(x, y0 + h + 0.22, z, 0.36, 0.08, 0.36, '#1e1e24');
    const lantern = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.34, 0.28), lamb({ color: '#3a3026', emissive: new THREE.Color(color), emissiveIntensity: 4 }));
    lantern.position.set(x, y0 + h, z);
    root.add(lantern);
    const e = emit(x, y0 + h - 0.1, z + 0.1, color, state === 'dead' ? 0 : 11, 9, 'lamp', state);
    if (state !== 'dead') addGlow(x, y0 + h, z + 0.05, color, 1.3, 0.75);
    lampHeads.push({ x, y: y0 + h, z, mat: lantern.material, e, cone: state === 'dead' ? null : { y0, r: 1.35, k: 1 } });
    perches.push({ x, y: y0 + h + 0.28, z });
    if (y0 === 0) addCircle(x, z, 0.2, true);
  }
  const lampStates = ['broken', 'lamp', 'dead', 'broken', 'lamp', 'broken', 'lamp', 'dead'];
  [-52, -42, -9.5, 2.5, 14.5, 27.5, 41, 53].forEach((x, i) => lampPost(x, STREET_FRONT + 0.45, '#ffb85e', 0, 2.4, lampStates[i]));
  lampPost(POND.cx - POND.rx - 0.6, STREET_FRONT + 0.9, '#ffb85e', 0, 2.4, 'broken');
  lampPost(POND.cx + POND.rx + 0.7, STREET_FRONT + 0.6, '#ffb85e', 0, 2.4, 'lamp');
  for (const x of [-21.5, 23.4, 44.6]) lampPost(x, -3.3, '#ffb85e', TY, 2.2, 'broken');
  for (const x of [-57.2, -42.0, -32.6, -22.2, 14.2, 21.5, 28.4, 44.2, 50.2, 55.4]) {
    if (!wallSegs.some(([a, b]) => x > a + 0.4 && x < b - 0.4)) continue;
    misc.add(x, 1.35, WALL_Z + 0.08, 0.06, 0.06, 0.18, '#26262c');
    const ln = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.26, 0.2), lamb({ color: '#3a3026', emissive: new THREE.Color('#ffb050'), emissiveIntensity: 3.6 }));
    ln.position.set(x, 1.2, WALL_Z + 0.22);
    root.add(ln);
    const e = emit(x, 1.15, WALL_Z + 0.6, '#ffb050', 6, 6, 'lamp', rng() < 0.5 ? 'broken' : 'lamp');
    lampHeads.push({ x, y: 1.2, z: WALL_Z + 0.22, mat: ln.material, e, cone: { y0: 0, r: 0.62, k: 0.55, dz: 0.38 } });
    addGlow(x, 1.2, WALL_Z + 0.3, '#ffb060', 0.9, 0.7);
  }

  // ======================= LỬA =======================
  const fireAtlas = makeFireAtlas();
  function fire(x, z, scale, strength, base = 0) {
    const map = fireAtlas.map.clone();
    map.repeat.set(1 / fireAtlas.frames, 1);
    map.needsUpdate = true;
    const fm = new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: new THREE.Color(2.2, 1.7, 1.3) });
    const w = fireAtlas.w * scale, h = fireAtlas.h * scale;
    const pg = new THREE.PlaneGeometry(w, h); pg.translate(0, h / 2, 0);
    const m = new THREE.Mesh(pg, fm);
    m.position.set(x, base, z);
    root.add(m);
    fires.push({ mesh: m, map, frames: fireAtlas.frames, t: rng() * 10, speed: 9 + rng() * 3 });
    emit(x, base + 0.9 * scale, z + 0.2, '#ff8a36', strength, 11 * Math.sqrt(scale), 'fire', 'fire');
    addGlow(x, base + h * 0.4, z + 0.1, '#ff7a2a', 2.6 * scale, 1.0, 'fire');
    smokeSources.push({ x, y: base + h * 0.9, z, rate: 3 * scale, fire: true });
  }
  const campfire = { x: 24.5, z: 1.3 };
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; stones.add(campfire.x + Math.cos(a) * 0.85, 0.14, campfire.z + Math.sin(a) * 0.85, 0.36, 0.28, 0.36, i % 2 ? '#6e6c66' : '#5c5a56', a); }
  trunks.add(campfire.x, 0.14, campfire.z, 1.2, 0.2, 0.22, '#8a6a4a', 0.6);
  trunks.add(campfire.x, 0.2, campfire.z, 1.1, 0.2, 0.22, '#9a7652', -0.7);
  fire(campfire.x, campfire.z, 1.2, 38, 0.1);
  addCircle(campfire.x, campfire.z, 1.0, true);
  trunks.add(campfire.x + 2.2, 0.22, campfire.z + 0.6, 1.5, 0.42, 0.45, '#b08a62', -0.25); addCircle(campfire.x + 2.2, campfire.z + 0.6, 0.55, true);
  const fireBarrelGeo = new THREE.CylinderGeometry(0.36, 0.33, 0.9, 10), mFireBarrel = lamb({ map: tx.metal, color: '#8a5a3a' });
  for (const [x, z] of [[-41.8, -1.25], [13.8, -1.2], [45.6, 3.0], [-23.0, -1.3]]) {
    batch.add(fireBarrelGeo, mFireBarrel, mat4(x, 0.45, z));
    fire(x, z, 0.75, 15, 0.85);
    addCircle(x, z, 0.42, true);
  }

  // ======================= XE CỘ BỎ LẠI =======================
  const sirenMats = [];
  function car(x, z, ry = 0, style = 'sedan', o = {}) {
    const c = Math.cos(ry), s = Math.sin(ry);
    const P = (dx, dz) => [x + dx * c + dz * s, z - dx * s + dz * c];
    const add = (v, dx, y, dz, sx, sy, sz, col) => { const [px, pz] = P(dx, dz); v.add(px, y, pz, sx, sy, sz, col, ry); };
    const big = style === 'van' || style === 'ambulance';
    const L = style === 'truck' ? 6.0 : big ? 4.6 : 3.9, Wd = style === 'truck' ? 2.3 : big ? 1.95 : 1.75;
    const paint = o.paint || (style === 'police' ? '#e8e8e4' : style === 'ambulance' ? '#e8e4dc' : style === 'burnt' ? '#2a2422' : style === 'truck' ? '#4a5a3a' : '#5a6a7a');
    const glass = style === 'burnt' ? '#0a0a0c' : '#1e2836';
    const wheel = (dx, dz, flat = false) => add(misc, dx, flat ? 0.28 : 0.36, dz, 0.72, flat ? 0.56 : 0.72, 0.28, '#141416');
    if (style === 'truck') {
      add(misc, 2.0, 1.05, 0, 1.8, 1.5, Wd, paint);
      add(misc, 2.05, 1.45, 0, 1.6, 0.55, Wd + 0.02, glass);
      add(misc, -0.9, 0.85, 0, 4.0, 0.3, Wd, '#3a4a2a');
      const cover = new THREE.Mesh(boxGeo(3.9, 1.5, Wd - 0.05, 1), mCloth);
      const [px, pz] = P(-0.9, 0); cover.position.set(px, 1.75, pz); cover.rotation.y = ry; cover.castShadow = cover.receiveShadow = true; root.add(cover);
      for (const dx of [2.1, -0.2, -1.9]) { wheel(dx, Wd / 2); wheel(dx, -Wd / 2); }
      add(misc, 2.92, 0.7, 0, 0.06, 0.4, Wd * 0.8, '#2a2a2a');
    } else if (big) {
      add(misc, 0, 1.15, 0, L, 1.65, Wd, paint);
      add(misc, L * 0.36, 1.55, 0, L * 0.26, 0.5, Wd + 0.02, glass);
      if (style === 'ambulance') {
        add(misc, -0.3, 1.1, 0, L * 0.7, 0.16, Wd + 0.02, '#c8281e');
        add(misc, -0.6, 1.6, Wd / 2 + 0.01, 0.6, 0.18, 0.02, '#c8281e'); add(misc, -0.6, 1.6, Wd / 2 + 0.01, 0.18, 0.6, 0.03, '#c8281e');
      }
      for (const dx of [L * 0.3, -L * 0.3]) { wheel(dx, Wd / 2); wheel(dx, -Wd / 2, o.flat && dx < 0); }
    } else {
      add(misc, 0, 0.62, 0, L, 0.62, Wd, paint);
      add(misc, -0.15, 1.17, 0, L * 0.5, 0.5, Wd * 0.9, style === 'police' ? '#e8e8e4' : paint);
      add(misc, -0.15, 1.2, 0, L * 0.47, 0.34, Wd * 0.92, glass);
      add(misc, L * 0.12, 1.2, 0, 0.05, 0.32, Wd * 0.78, glass);
      if (style === 'police') add(misc, 0, 0.6, 0, L * 0.52, 0.34, Wd + 0.01, '#1a1a20');
      for (const dx of [L * 0.31, -L * 0.31]) { wheel(dx, Wd / 2, o.flat && dx > 0); wheel(dx, -Wd / 2); }
      add(misc, L / 2 + 0.005, 0.72, Wd * 0.32, 0.02, 0.12, 0.26, '#e8e0c0'); add(misc, L / 2 + 0.005, 0.72, -Wd * 0.32, 0.02, 0.12, 0.26, '#e8e0c0');
      add(misc, -L / 2 - 0.005, 0.74, Wd * 0.34, 0.02, 0.1, 0.22, '#8a1a14'); add(misc, -L / 2 - 0.005, 0.74, -Wd * 0.34, 0.02, 0.1, 0.22, '#8a1a14');
    }
    // gỉ sét, bụi bẩn
    for (let i = 0; i < 5; i++) add(misc, (rng() - 0.5) * L * 0.8, big ? 1.99 : 0.94, (rng() - 0.5) * Wd * 0.6, 0.3 + rng() * 0.4, 0.012, 0.2 + rng() * 0.3, style === 'burnt' ? '#4a2a1a' : '#6a4a2e');
    if (style === 'police' && o.siren) {
      add(misc, -0.15, 1.46, 0, 0.3, 0.1, Wd * 0.72, '#202024');
      const mR = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 0.3, 0.2) }), mB = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 0.6, 5) });
      sirenMats.push(mR, mB);
      for (const [m, dz] of [[mR, -Wd * 0.2], [mB, Wd * 0.2]]) {
        const sm = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, Wd * 0.3), m);
        const [px, pz] = P(-0.15, dz); sm.position.set(px, 1.57, pz); sm.rotation.y = ry; root.add(sm);
      }
      const [lx, lz] = P(-0.15, 0);
      const eR = emit(lx, 1.9, lz - 0.2, '#ff2a1a', 9, 9, 'siren', 'sirenR');
      const eB = emit(lx, 1.9, lz + 0.2, '#2a5aff', 11, 9, 'siren', 'sirenB');
      sirens.push({ mR, mB, eR, eB });
    }
    const hx = Math.abs(c) * L / 2 + Math.abs(s) * Wd / 2, hz = Math.abs(s) * L / 2 + Math.abs(c) * Wd / 2;
    addBox(x - hx, z - hz, x + hx, z + hz, true);
    perches.push({ x, y: big ? 2.05 : 1.5, z });
    if (style === 'burnt') fire(x + 0.3, z, 0.7, 12, 0.95);
    if (o.loot) { const [tx2, tz2] = P(-L / 2 - 0.55, 0); container(o.loot, tx2, tz2 + (o.lootDz || 0), o.label || 'Cốp xe'); }
  }
  car(-47.6, 2.5, 0.12, 'sedan', { paint: '#4a5a6a', loot: 'trunk', flat: true });
  car(-36.0, 2.7, -0.08, 'sedan', { paint: '#8a2a22', loot: 'trunk' });
  car(-21.6, 2.4, 0.22, 'burnt');
  car(-8.4, 2.75, 0.06, 'sedan', { paint: '#c8c0a8', loot: 'trunk' });
  car(3.2, 2.65, -0.1, 'van', { paint: '#d8d4c8', loot: 'trunk', label: 'Thùng xe tải nhỏ', flat: true });
  car(11.8, 2.9, 0.42, 'sedan', { paint: '#2a4a2a', flat: true });
  car(18.0, 0.35, 0, 'truck', { loot: 'truck', label: 'Thùng xe quân sự', lootDz: 1.6 });
  car(37.8, 2.65, 0.05, 'police', { siren: true, loot: 'trunk', label: 'Cốp xe cảnh sát' });
  car(48.4, -0.5, Math.PI + 0.1, 'police', {});
  car(56.4, 2.6, 0, 'ambulance', { loot: 'ambulance', label: 'Xe cứu thương' });

  // ======================= TRẠM XĂNG =======================
  {
    const x0 = -57.3, x1 = -49.6, z0 = -0.7, z1 = 2.9, y = 4.1;
    batch.add(boxGeo(x1 - x0, 0.3, z1 - z0, 2), mCanopy, mat4((x0 + x1) / 2, y, (z0 + z1) / 2));
    batch.add(boxGeo(x1 - x0 + 0.1, 0.6, 0.14, 2, 1), mFascia, mat4((x0 + x1) / 2, y - 0.05, z1 + 0.02));
    const sg = T.signTex('XĂNG DẦU', { bg: '#b8281e', edge: '#f0e8d8' });
    const sm = new THREE.Mesh(new THREE.PlaneGeometry(sg.w * 1.6, sg.h * 1.6), lamb({ map: sg.map, transparent: true, alphaTest: 0.5 }));
    sm.position.set((x0 + x1) / 2, y - 0.05, z1 + 0.1); root.add(sm);
    for (const [cx2, cz2] of [[x0 + 0.6, z0 + 0.4], [x1 - 0.6, z0 + 0.4], [x0 + 0.6, z1 - 0.4], [x1 - 0.6, z1 - 0.4]]) { misc.add(cx2, y / 2, cz2, 0.3, y, 0.3, '#c8c8c0'); addCircle(cx2, cz2, 0.22); }
    for (let i = 0; i < 4; i++) { bulbs.add(x0 + 1.2 + i * 1.8, y - 0.17, (z0 + z1) / 2, 1.0, 0.04, 0.35, '#e8f0ff'); }
    const e = emit((x0 + x1) / 2, y - 0.4, (z0 + z1) / 2 + 0.5, '#d8e8ff', 9, 9, 'lamp', 'broken');
    lampHeads.push({ x: (x0 + x1) / 2, y: y - 0.2, z: (z0 + z1) / 2, mat: lamb({}), e, cone: { y0: 0, r: 2.4, k: 0.7 } });
    for (const px of [-55.0, -51.9]) {
      misc.add(px, 0.75, 1.1, 0.7, 1.5, 0.45, '#c83a2a');
      misc.add(px, 1.55, 1.1, 0.75, 0.12, 0.5, '#e8e0d0');
      misc.add(px, 1.12, 1.34, 0.4, 0.26, 0.02, '#141a14');
      misc.add(px + 0.3, 0.9, 1.4, 0.06, 0.06, 0.4, '#1a1a1e');
      misc.add(px, 0.08, 1.1, 1.1, 0.16, 0.8, '#6a6a6c');
      addBox(px - 0.55, 0.7, px + 0.55, 1.5);
    }
  }
  // ======================= MÁY PHÁT ĐIỆN (nhiệm vụ) =======================
  {
    const gx = 44.4, gz = -1.25;
    misc.add(gx, 0.08, gz, 1.45, 0.16, 0.9, '#2a2a2e');
    misc.add(gx, 0.55, gz, 1.3, 0.8, 0.75, '#c8a028');
    misc.add(gx - 0.35, 0.98, gz, 0.42, 0.08, 0.42, '#2a2a2e');
    misc.add(gx + 0.45, 1.15, gz - 0.2, 0.12, 0.55, 0.12, '#3a3a3e');
    misc.add(gx + 0.2, 0.6, gz + 0.38, 0.5, 0.36, 0.02, '#1a1a1e');
    for (let i = 0; i < 6; i++) misc.add(gx - 0.75 - i * 0.12, 0.05 + i * 0.12, gz - 0.25, 0.14, 0.04, 0.04, '#141414');
    misc.add(43.12, 1.1, gz - 0.25, 0.04, 1.4, 0.04, '#141414');
    addBox(gx - 0.75, gz - 0.48, gx + 0.75, gz + 0.48);
    const e = emit(gx + 0.2, 0.9, gz + 0.6, '#6aff8a', 0, 3, 'power', 'lamp');
    pois.generator = { x: gx, z: gz + 1.0, exhaust: { x: gx + 0.45, y: 1.45, z: gz - 0.2 }, e, label: 'Máy phát điện' };
  }
  // ======================= BÃI ĐÁP TRỰC THĂNG =======================
  {
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; bulbs.add(HELIPAD.x + Math.cos(a) * (HELIPAD.r + 0.25), 0.05, HELIPAD.z + Math.sin(a) * (HELIPAD.r + 0.25), 0.14, 0.08, 0.14, i % 3 ? '#9aff7a' : '#ffd84a'); }
    misc.add(57.0, 1.6, -1.3, 0.08, 3.2, 0.08, '#4a4a50');
    for (let i = 0; i < 4; i++) misc.add(57.25 + i * 0.22, 3.0 - i * 0.03, -1.3, 0.22, 0.32 - i * 0.05, 0.32 - i * 0.05, i % 2 ? '#ffffff' : '#e86a1a');
    pois.helipad = { ...HELIPAD, label: 'Bãi đáp trực thăng' };
    const sg = T.signTex('BÃI ĐÁP', { bg: '#2a2a2e', fg: '#ffd84a' });
    const sm = new THREE.Mesh(new THREE.PlaneGeometry(sg.w * 1.2, sg.h * 1.2), lamb({ map: sg.map }));
    sm.position.set(49.6, 1.6, -1.72); root.add(sm);
    misc.add(49.6, 0.7, -1.78, 0.08, 1.4, 0.08, '#3a3a3e');
  }
  // ======================= CHỐT KIỂM SOÁT QUÂN SỰ =======================
  function sandbags(x0, x1, z0, z1, rows = 3) {
    const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    const len = alongX ? x1 - x0 : z1 - z0;
    for (let r = 0; r < rows; r++)
      for (let t = (r & 1) * 0.3; t < len - 0.3; t += 0.62) {
        const px = alongX ? x0 + t + 0.3 : (x0 + x1) / 2, pz = alongX ? (z0 + z1) / 2 : z0 + t + 0.3;
        misc.add(px, 0.14 + r * 0.25, pz, alongX ? 0.6 : 0.4, 0.26, alongX ? 0.4 : 0.6, r % 2 ? '#8a7a56' : '#7a6a4a', (rng() - 0.5) * 0.12);
      }
    for (let t = 0; t < len; t += 0.18) {
      const px = alongX ? x0 + t : (x0 + x1) / 2 + Math.sin(t * 9) * 0.12, pz = alongX ? (z0 + z1) / 2 + Math.sin(t * 9) * 0.12 : z0 + t;
      misc.add(px, 0.14 + rows * 0.25 + Math.abs(Math.sin(t * 9)) * 0.12, pz, 0.05, 0.05, 0.05, '#3a3a3e');
    }
    addBox(Math.min(x0, x1) - 0.2, Math.min(z0, z1) - 0.2, Math.max(x0, x1) + 0.2, Math.max(z0, z1) + 0.2, true);
  }
  sandbags(14.6, 14.6, -1.5, 0.4, 3);
  sandbags(28.4, 28.4, 1.6, 4.4, 3);
  sandbags(15.4, 17.6, 3.9, 3.9, 2);
  {
    misc.add(15.1, 0.5, 2.55, 0.25, 1.0, 0.25, '#3a3a3e');
    for (let i = 0; i < 8; i++) misc.add(15.1 + i * 0.32 * 0.2, 1.05 + i * 0.32 * 0.98, 2.55, 0.12, 0.34, 0.12, i % 2 ? '#e8e0d0' : '#c8281e');
    const sg = T.signTex('CẤM VÀO', { bg: '#c8281e' });
    const sm = new THREE.Mesh(new THREE.PlaneGeometry(sg.w * 1.1, sg.h * 1.1), lamb({ map: sg.map }));
    sm.position.set(16.2, 1.25, -1.75); root.add(sm);
    misc.add(16.2, 0.55, -1.8, 0.06, 1.1, 0.06, '#3a3a3e');
    for (let i = 0; i < 2; i++) crates.add(16.9 + i * 0.75, 0.3, -1.25, 0.7, 0.55, 0.5, '#8a9a6a', 0);
    misc.add(17.25, 0.6, -1.25, 1.5, 0.05, 0.52, '#3a4a2a');
    addBox(16.5, -1.55, 18.0, -0.95);
    container('ammo_crate', 17.25, -0.55, 'Thùng đạn quân đội');
  }
  const clothMats = { a: lamb({ map: T.clothTile('#c8b896') }), b: lamb({ map: T.clothTile('#6a7a4a') }) };
  function tent(x, z, ry, mat) {
    const g = new THREE.BufferGeometry();
    const wv = 1.4, hv = 1.5, lv = 2.4;
    const p = [-wv, 0, lv / 2, 0, hv, lv / 2, 0, hv, -lv / 2, -wv, 0, lv / 2, 0, hv, -lv / 2, -wv, 0, -lv / 2,
      wv, 0, lv / 2, wv, 0, -lv / 2, 0, hv, -lv / 2, wv, 0, lv / 2, 0, hv, -lv / 2, 0, hv, lv / 2,
      -wv, 0, lv / 2, wv, 0, lv / 2, 0, hv, lv / 2];
    const uv = [0, 0, 1, 0, 1, 1.6, 0, 0, 1, 1.6, 0, 1.6, 0, 0, 0, 1.6, 1, 1.6, 0, 0, 1, 1.6, 1, 0, 0, 0, 1.4, 0, 0.7, 1];
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    mat.side = THREE.DoubleSide;
    seeThrough(mat);
    const m = new THREE.Mesh(g, mat);
    m.position.set(x, 0, z); m.rotation.y = ry; m.castShadow = m.receiveShadow = true;
    root.add(m);
    const door = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), lamb({ color: '#140e0a' }));
    door.geometry.translate(0, 0.45, 0);
    door.position.set(x + Math.sin(ry) * (lv / 2 + 0.01), 0, z + Math.cos(ry) * (lv / 2 + 0.01)); door.rotation.y = ry;
    root.add(door);
  }
  tent(21, 7.2, 0.25, clothMats.a);
  tent(28.5, 7.6, -0.3, clothMats.b);
  for (let i = 0; i < 9; i++) for (let row = 0; row < 2; row++) if (i < 9 - row) misc.add(camp.x0 + 1 + i * 0.66 + row * 0.33, 0.17 + row * 0.3, 5.2, 0.62, 0.32, 0.36, row ? '#a89670' : '#968460');

  // ======================= CỐI XAY GIÓ (thềm sau) =======================
  {
    const x = 12, z = -21, base = BY;
    const mT = lamb({ map: wallTex.map, normalMap: wallTex.normalMap, color: '#d8ccb8' });
    for (let i = 0; i < 7; i++) { const w = 3.2 - i * 0.22; batch.add(boxGeo(w, 1.2, w, 2, 1), mT, mat4(x, base + 0.6 + i * 1.2, z)); }
    batch.add(new THREE.ConeGeometry(1.75, 2.0, 4, 1), lamb({ map: roofs.red.map, normalMap: roofs.red.normalMap }), mat4(x, base + 9.4, z, 0, Math.PI / 4, 0));
    const door = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.6), lamb({ map: tx.plank, color: '#a07050' }));
    door.position.set(x, base + 0.8, z + 1.61); root.add(door);
    const win = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.6), lamb({ color: '#2a1a10', emissive: new THREE.Color('#ffb060'), emissiveIntensity: 2.6 }));
    win.position.set(x, base + 4.2, z + 1.33); root.add(win); windowMats.push(win.material);
    const sails = new THREE.Group();
    sails.position.set(x, base + 7.6, z + 1.7);
    root.add(sails);
    const sMat = lamb({ map: tx.plank, color: '#d8c8a8' }), cMat = lamb({ map: T.clothTile('#e8e0cc'), side: THREE.DoubleSide });
    for (let k = 0; k < 4; k++) {
      const arm = new THREE.Group(); arm.rotation.z = k * Math.PI / 2; sails.add(arm);
      const bar = new THREE.Mesh(boxGeo(0.16, 4.6, 0.12, 1), sMat); bar.position.y = 2.3; bar.castShadow = true; arm.add(bar);
      const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 3.4), cMat); cloth.position.set(0.55, 2.7, 0.02); cloth.castShadow = true; arm.add(cloth);
    }
    sails.add(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), sMat));
    animated.push((dt, t, wind) => { sails.rotation.z -= dt * (0.25 + wind * 0.25); });
    perches.push({ x, y: base + 10.5, z });
  }

  // ======================= NGHĨA ĐỊA (trên thềm) =======================
  {
    for (let x = cemetery.x0; x <= cemetery.x1; x += 0.55) {
      if (STAIRS.some((s) => Math.abs(s.x - x) < s.w / 2 + 0.3)) continue;
      misc.add(x, TY + 0.55, -2.35, 0.06, 1.1, 0.06, '#1e1e24');
      misc.add(x, TY + 1.14, -2.35, 0.1, 0.1, 0.1, '#1e1e24');
    }
    for (const [a, b] of [[cemetery.x0, STAIRS[2].x - 1.25], [STAIRS[2].x + 1.25, cemetery.x1]]) {
      misc.add((a + b) / 2, TY + 0.95, -2.35, b - a, 0.06, 0.06, '#1e1e24');
      misc.add((a + b) / 2, TY + 0.25, -2.35, b - a, 0.06, 0.06, '#1e1e24');
    }
    for (const g of graveSpots) {
      const { x, z } = g;
      const k = rng();
      if (k < 0.55) { stones.add(x, TY + 0.42, z, 0.62, 0.84, 0.2, '#8a8680', rng.range(-0.12, 0.12)); stones.add(x, TY + 0.88, z, 0.42, 0.14, 0.2, '#8a8680'); }
      else if (k < 0.85) { stones.add(x, TY + 0.5, z, 0.14, 1.0, 0.14, '#7a7670'); stones.add(x, TY + 0.72, z, 0.56, 0.14, 0.14, '#7a7670'); }
      else stones.add(x, TY + 0.25, z, 0.7, 0.5, 0.3, '#6a6660', 0.25);
      soil.add(x, TY + 0.06, z + 1.05, 0.8, 0.14, 1.5, '#ffffff');
      graves.push({ x, z: z + 1.05 });
    }
    const cx = 51.5, cz = -12.6;
    stones.add(cx, TY + 1.2, cz, 3.2, 2.4, 2.6, '#8a8680');
    stones.add(cx, TY + 2.55, cz, 3.6, 0.3, 3.0, '#6a6660');
    stones.add(cx, TY + 2.9, cz, 2.2, 0.4, 2.0, '#7a7670');
    misc.add(cx, TY + 0.85, cz + 1.31, 1.0, 1.7, 0.04, '#141414');
    stones.add(cx, TY + 3.35, cz, 0.18, 0.6, 0.18, '#8a8680'); stones.add(cx, TY + 3.45, cz, 0.5, 0.16, 0.16, '#8a8680');
    const e = emit(45.2, TY + 1.4, -3, '#9adf8a', 7, 7, 'lamp', 'broken');
    misc.add(45.2, TY + 0.7, -3.3, 0.1, 1.4, 0.1, '#26262c');
    const gl = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.26, 0.22), lamb({ color: '#202a20', emissive: new THREE.Color('#9adf8a'), emissiveIntensity: 3.5 }));
    gl.position.set(45.2, TY + 1.5, -3.3); root.add(gl);
    lampHeads.push({ x: 45.2, y: TY + 1.5, z: -3.3, mat: gl.material, e, cone: { y0: TY, r: 0.95, k: 0.9 } });
    addGlow(45.2, TY + 1.5, -3.2, '#9adf8a', 1.3, 0.8);
  }
  function fence(x0, x1, z, broken = 0.25) {
    const n = Math.max(1, Math.round((x1 - x0) / 1.4));
    for (let i = 0; i <= n; i++) {
      const x = x0 + (x1 - x0) * i / n;
      if (rng() < broken * 0.5) continue;
      planks.add(x, 0.5, z, 0.16, 1.0, 0.16, '#a89880', (rng() - 0.5) * 0.2);
      if (i < n && rng() > broken) { const mx = x + (x1 - x0) / n / 2; planks.add(mx, 0.42, z, (x1 - x0) / n, 0.1, 0.07, '#b8a890'); planks.add(mx, 0.78, z, (x1 - x0) / n, 0.1, 0.07, '#b8a890'); }
    }
  }
  fence(-60, -38, 7.2); fence(-19, -1, 7.6); fence(54, 64, 7);

  // ======================= RÁC, GIẤY, KÍNH VỠ TRÊN PHỐ =======================
  {
    const nearDoor = (x) => BUILDINGS.some((b) => Math.abs(x - b.door) < b.doorW / 2 + 0.7);
    for (let i = 0; i < 46; i++) {
      const x = XMIN + 16 + rng() * (XMAX - XMIN - 32);
      if (nearDoor(x) || x < -57.5 || x > 57.5) continue;
      const z = -1.85 + rng() * 0.5;
      const k = rng();
      if (k < 0.4) { misc.add(x, 0.22, z, 0.5, 0.44, 0.46, rng() < 0.7 ? '#1a1a1e' : '#2a3a2a', rng() * 3); addCircle(x, z, 0.28, true); }
      else if (k < 0.65) crates.add(x, 0.2, z, 0.45, 0.4, 0.4, '#d8c8a8', rng() * 3);
      else if (k < 0.8) { for (let t = 0; t < 2; t++) misc.add(x, 0.13 + t * 0.26, z, 0.7, 0.24, 0.7, '#141416'); addCircle(x, z, 0.35, true); }
      else debris(x, z, 5, 0.9);
    }
    papers(XMIN + 14, XMAX - 14, -1.3, 2.9, hi ? 120 : 60);
    for (const b of BUILDINGS) if (b.shop) for (let i = 0; i < 14; i++) misc.add(b.x0 + 0.4 + rng() * (b.w - 0.8), 0.015, WALL_Z + 0.1 + rng() * 0.7, 0.08 + rng() * 0.1, 0.01, 0.06 + rng() * 0.08, rng() < 0.5 ? '#9ab0c0' : '#c8dae4', rng() * 3);
    bloodPool(-17.2, 1.5, 1.4); bloodPool(24.0, 2.8, 1.2); bloodPool(33.6, 1.0, 1.6); bloodPool(-3.5, 0.2, 1.0);
    for (const [x, z, lbl] of [[-17.2, 1.5, 'Xác người'], [24.0, 2.8, 'Xác lính'], [33.6, 1.0, 'Xác người']]) container('body', x, z, lbl, null, { corpse: true });
  }
  // ======================= CỎ, HOA, LAU SẬY =======================
  const grassMeshes = [];
  {
    const tufts = T.grassTufts(), flowersT = T.flowerTexs();
    const dens = hi ? 1 : 0.5;
    const blocked = (x, z, pad = 0.2) => {
      for (const b of colliders.boxes) if (b.z1 > WALL_Z + 0.1 && x > b.x0 - pad && x < b.x1 + pad && z > b.z0 - pad && z < b.z1 + pad) return true;
      return false;
    };
    const makeSet = (map, items, amp) => {
      const mat = lamb({ map, alphaTest: 0.45, side: THREE.DoubleSide });
      grassPatch(mat, amp);
      const geo = new THREE.PlaneGeometry(1, 1); geo.translate(0, 0.5, 0);
      const chunks = new Map();
      for (const it of items) { const k = chunkOf(it[0]); if (!chunks.has(k)) chunks.set(k, []); chunks.get(k).push(it); }
      const m = new THREE.Matrix4(), c = new THREE.Color();
      for (const list of chunks.values()) {
        const mesh = new THREE.InstancedMesh(geo, mat, list.length);
        list.forEach(([x, y, z, s, col], i) => {
          m.compose(V.set(x, y, z), Q.setFromEuler(E.set(0, (rng() - 0.5) * 1.0, 0)), S3.set(s * (rng() < 0.5 ? 1 : -1), s * (0.85 + rng() * 0.3), s));
          mesh.setMatrixAt(i, m); mesh.setColorAt(i, c.set(col));
        });
        mesh.receiveShadow = true;
        mesh.computeBoundingSphere(); mesh.boundingSphere.radius += 1;
        root.add(mesh); grassMeshes.push(mesh); hideInReflection.push(mesh);
      }
    };
    const tint = (x, z) => {
      const v = 0.82 + rng() * 0.3, warm = 0.5 + 0.5 * Math.sin(x * 0.13 + z * 0.09);
      return new THREE.Color(v * (0.92 + warm * 0.12), v, v * (0.9 - warm * 0.08)).getHex();
    };
    const grassy = (k) => k === 0 || k === 5;
    const onTerraceFree = (x, z) => {
      if (x > STREAM.x0 - 0.4 && x < STREAM.x1 + 0.4) return false;
      if (STAIRS.some((s) => Math.abs(s.x - x) < s.w / 2 + 0.2 && z > WALL_Z - STAIR_DEPTH - 0.2)) return false;
      if (BUILDINGS.some((b) => x > b.x0 - 0.3 && x < b.x1 + 0.3 && z > ZB - 0.3)) return false;
      return !TERRACE_HOUSES.some((h) => h.by === TY && Math.abs(h.x - x) < h.w / 2 + 0.4 && z < h.zf + 0.4 && z > h.zf - h.d - 0.4);
    };
    for (let v = 0; v < 3; v++) {
      const items = [];
      for (let i = 0; i < 5200 * dens; i++) {
        const x = XMIN + rng() * (XMAX - XMIN), z = STREET_FRONT - 0.4 + rng() * 22;
        if (!grassy(gST.kindAt(x, z)) || blocked(x, z) || inPoly(holePts, x, z)) continue;
        items.push([x, 0, z, 0.8 + rng() * 0.5 + Math.max(0, (z - 8) * 0.06), tint(x, z)]);
      }
      for (let i = 0; i < 2600 * dens; i++) {
        const x = XMIN + rng() * (XMAX - XMIN), z = BACK_Z + rng() * (WALL_Z - BACK_Z);
        if (!grassy(gTE.kindAt(x, z)) || !onTerraceFree(x, z)) continue;
        items.push([x, TY, z, 0.75 + rng() * 0.45, tint(x, z)]);
      }
      makeSet(tufts[v], items, 0.11);
    }
    {
      const items = [];
      for (let i = 0; i < 1500 * dens; i++) {
        const x = XMIN + rng() * (XMAX - XMIN), z = 8 + rng() * 14;
        if (inPoly(holePts, x, z) || (Math.abs(x - POND.cx) < POND.rx + 2 && z < 14)) continue;
        items.push([x, 0, z, 1.4 + rng() * 0.8, tint(x, z)]);
      }
      makeSet(tufts[2], items, 0.16);
    }
    flowersT.forEach((ft) => {
      const items = [];
      const centers = Array.from({ length: 16 }, () => [XMIN + rng() * (XMAX - XMIN), STREET_FRONT + 0.6 + rng() * 14, rng() < 0.3]);
      for (let i = 0; i < 380 * dens; i++) {
        const c = centers[Math.floor(rng() * centers.length)];
        const x = c[0] + (rng() - 0.5) * 5;
        if (c[2]) {
          const z = -2.5 - rng() * 1.6;
          if (onTerraceFree(x, z) && !STAIRS.some((s) => Math.abs(s.x - x) < 1.5)) items.push([x, TY, z, 0.55 + rng() * 0.2, 0xffffff]);
          continue;
        }
        const z = c[1] + (rng() - 0.5) * 3;
        if (!grassy(gST.kindAt(x, z)) || blocked(x, z) || inPoly(holePts, x, z)) continue;
        items.push([x, 0, z, 0.55 + rng() * 0.2, 0xffffff]);
      }
      makeSet(ft, items, 0.14);
    });
    {
      const items = [];
      for (let i = 0; i < 260 * dens; i++) {
        const [x0, z0] = holePts[Math.floor(rng() * holePts.length)];
        if (z0 < STREET_FRONT + 0.6) continue;
        items.push([x0 + (rng() - 0.5) * 0.8, 0, z0 + (rng() - 0.5) * 0.8, 0.9 + rng() * 0.6, 0xffffff]);
      }
      makeSet(T.reedTex(), items, 0.12);
    }
    {
      const items = [];
      for (let i = 0; i < 900 * dens; i++) { const x = XMIN + rng() * (XMAX - XMIN), z = BACK_Z - 1 - rng() * 14; if (x > STREAM.x0 - 0.4 && x < STREAM.x1 + 0.4 && z > -26) continue; items.push([x, BY, z, 1.0 + rng() * 0.6, tint(x, z)]); }
      makeSet(T.fernTex(), items, 0.08);
    }
  }

  const leafMeshes = leaves.build(root);
  for (const v of [trunks, stones, planks, crates, misc, hay, soil, bulbs, metals]) v.build(root);
  batch.build(root);

  return {
    root, colliders, emitters, fires, smokeSources, graves, perches, lampHeads, canopies, windowMats, glowSprites,
    hideInReflection, grassMeshes, water, leafMeshes, animated,
    campfire, cemetery, field, pond: POND, holePts, inPoly, bulbMat: bulbs.mat, waterMats, waterfalls,
    buildings: BUILDINGS, containers, pois, sirens, powerMats,
    leafCount: leafMeshes.reduce((a, m) => a + m.count, 0),
  };
}

// Dựng ngôi làng HD-2D: nhà khung gỗ, cây voxel, cỏ lay theo gió, ao phản chiếu,
// đèn đường, lửa trại, nghĩa địa... + dữ liệu va chạm & nguồn sáng.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { PPU, makeRng, tex, spriteLit, patchMaterial, softDisc } from './pixel.js';
import * as T from './textures.js';
import { makeFireAtlas, makeJackFace } from './sprites.js';

export const BOUNDS = { x0: -30, x1: 30, z0: -18, z1: 21 };
const GROUND = { x0: -46, z0: -40, w: 92, h: 76 };

// uniform dùng chung cho mọi shader tuỳ biến
export const U = {
  time: { value: 0 },
  wind: { value: 1 },
  push: { value: Array.from({ length: 6 }, () => new THREE.Vector4(0, -99, 0, 0.01)) },
  seeCenter: { value: new THREE.Vector2(-9999, -9999) },
  seeRadius: { value: 120 },
  seeDepth: { value: 0 },
  seeZ: { value: 999 },
  wet: { value: 0 },
};

const GLSL_BAYER = `
float bayerA(vec2 a){ a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float bayer4(vec2 a){ return bayerA(0.5 * a) * 0.25 + bayerA(a); }
`;
// nhìn xuyên: khoét lỗ quanh nhân vật + làm mờ dạng dither những nhà/cây đứng
// chắn giữa camera và khu vực nhân vật (phía nam nhân vật), giữ nguyên phần còn lại
export function seeThrough(mat) {
  return patchMaterial(mat, 'see2', (sh) => {
    sh.uniforms.uSeeCenter = U.seeCenter; sh.uniforms.uSeeRadius = U.seeRadius; sh.uniforms.uSeeDepth = U.seeDepth; sh.uniforms.uSeeZ = U.seeZ;
    sh.vertexShader = 'varying vec3 vSeeW;\n' + sh.vertexShader.replace('#include <fog_vertex>', `#include <fog_vertex>
      #ifdef USE_INSTANCING
        vSeeW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
      #else
        vSeeW = (modelMatrix * vec4(transformed, 1.0)).xyz;
      #endif`);
    sh.fragmentShader = sh.fragmentShader
      .replace('void main() {', `uniform vec2 uSeeCenter; uniform float uSeeRadius; uniform float uSeeDepth; uniform float uSeeZ; varying vec3 vSeeW;
${GLSL_BAYER}
void main() {
        {
          vec2 dd = (gl_FragCoord.xy - uSeeCenter) / uSeeRadius;
          float keep = 1.0;
          if (vViewPosition.z < uSeeDepth) keep = smoothstep(0.45, 1.0, length(dd));
          float south = smoothstep(uSeeZ + 0.6, uSeeZ + 2.6, vSeeW.z) * smoothstep(0.35, 1.3, vSeeW.y);
          float band = 1.0 - smoothstep(2.4, 3.6, length(dd * vec2(0.8, 0.55)));
          keep = min(keep, 1.0 - south * band * 0.74);
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
// cỏ: lắc theo gió + rạp xuống khi nhân vật đi qua; pháp tuyến hướng lên
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

// ---------- gom hình học tĩnh theo vật liệu (ít draw call) ----------
class Batch {
  constructor() { this.groups = new Map(); }
  add(geo, mat, matrix, cast = true, receive = true) {
    const key = mat.uuid + (cast ? 'c' : '') + (receive ? 'r' : '');
    let g = this.groups.get(key);
    if (!g) { g = { mat, cast, receive, geos: [] }; this.groups.set(key, g); }
    const gg = geo.index ? geo.toNonIndexed() : geo.clone();
    gg.clearGroups();
    for (const n of Object.keys(gg.attributes)) if (n !== 'position' && n !== 'normal' && n !== 'uv') gg.deleteAttribute(n);
    gg.applyMatrix4(matrix);
    g.geos.push(gg);
  }
  build(parent) {
    const out = [];
    for (const g of this.groups.values()) {
      const m = new THREE.Mesh(mergeGeometries(g.geos), g.mat);
      m.castShadow = g.cast; m.receiveShadow = g.receive;
      m.matrixAutoUpdate = false;
      parent.add(m); out.push(m);
    }
    return out;
  }
}
const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), V = new THREE.Vector3(), S3 = new THREE.Vector3();
function mat4(x, y, z, rx = 0, ry = 0, rz = 0, order = 'XYZ') {
  return new THREE.Matrix4().compose(V.set(x, y, z), Q.setFromEuler(E.set(rx, ry, rz, order)), S3.set(1, 1, 1));
}
// hộp với UV theo mét thật (tile = số mét cho 1 lần lặp texture)
function boxGeo(w, h, d, tu = 1, tv = tu) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) { const k = f * 4 + i; uv.setXY(k, uv.getX(k) * dims[f][0] / tu, uv.getY(k) * dims[f][1] / tv); }
  return g;
}

// ---------- voxel instanced ----------
class Voxels {
  constructor(map, { sway = 0, cast = true, receive = true, see = false, wrap = 0 } = {}) {
    this.map = map; this.sway = sway; this.cast = cast; this.receive = receive; this.see = see; this.wrap = wrap;
    this.items = [];
  }
  add(x, y, z, sx, sy, sz, color, ry = 0) { this.items.push(x, y, z, sx, sy, sz, ry, color); }
  build(parent) {
    const n = this.items.length / 8;
    if (!n) return null;
    const mat = new THREE.MeshLambertMaterial({ map: this.map });
    if (this.wrap) spriteLit(mat, this.wrap);
    if (this.sway) swayPatch(mat, this.sway);
    if (this.see) seeThrough(mat);
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, n);
    const m = new THREE.Matrix4(), c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const o = i * 8, it = this.items;
      m.compose(V.set(it[o], it[o + 1], it[o + 2]), Q.setFromEuler(E.set(0, it[o + 6], 0)), S3.set(it[o + 3], it[o + 4], it[o + 5]));
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, c.set(it[o + 7]));
    }
    mesh.castShadow = this.cast; mesh.receiveShadow = this.receive;
    if (this.sway && this.cast) {
      const dm = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
      swayPatch(dm, this.sway);
      mesh.customDepthMaterial = dm;
    }
    mesh.frustumCulled = false;
    parent.add(mesh);
    return mesh;
  }
}

export function buildWorld(scene, quality, camera) {
  const rng = makeRng(20261120);
  const root = new THREE.Group();
  scene.add(root);
  const batch = new Batch();
  const colliders = { circles: [], boxes: [] };
  const emitters = [];
  const fires = [];
  const smokeSources = [];
  const graves = [];
  const perches = [];
  const lampHeads = [];
  const canopies = [];
  const windowMats = [];
  const glowSprites = [];
  const hideInReflection = [];
  const occluders = [];
  const addCircle = (x, z, r, low = false) => colliders.circles.push({ x, z, r, low });
  const addBox = (x0, z0, x1, z1, low = false) => colliders.boxes.push({ x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1), low });
  const emit = (x, y, z, color, intensity, distance, kind, flicker = 'none') =>
    emitters.push({ pos: new THREE.Vector3(x, y, z), color: new THREE.Color(color), base: intensity, dist: distance, kind, flicker, phase: rng() * 100, cur: 0, w: 0 });

  // ---------- textures dùng chung ----------
  const tx = {
    leaf: T.leafTile(), bark: T.barkTile(), stone: T.stoneTile(), plank: T.plankTile(), crate: T.crateTile(), dirt: T.dirtTile(),
    pumpkin: T.pumpkinTile(), hay: T.hayTile(), plain: T.plainTile(), metal: T.metalTile(),
  };
  const wallTex = T.stoneWallTex(5);
  const roofs = { red: T.roofTex('red', 3), slate: T.roofTex('slate', 4), wood: T.roofTex('wood', 5), moss: T.roofTex('moss', 6) };
  const lamb = (opts) => new THREE.MeshLambertMaterial(opts);
  const mWall = lamb({ map: wallTex.map, normalMap: wallTex.normalMap });
  const mPlank = lamb({ map: tx.plank });
  const mDark = lamb({ map: tx.bark, color: '#6a5a50' });
  const mMetal = lamb({ map: tx.metal });

  // ---------- bố cục nền ----------
  const housesDef = [
    { x: -23, z: -15, w: 7, d: 5, floors: 2, ridge: 'x', roof: 'red', style: 'timber', shutter: '#3a5a7a', door: 0.3, ivy: 2, seed: 11 },
    { x: -13.5, z: -15, w: 6, d: 5, floors: 1, ridge: 'z', roof: 'slate', style: 'stone', shutter: '#6a2a24', door: 0.5, seed: 12 },
    { x: -3.5, z: -15, w: 8, d: 5, floors: 2, ridge: 'x', roof: 'red', style: 'timber', shutter: '#3a6a44', door: 0.62, plaster: ['#c8b080', '#e6d4a8', '#f6e8c6'], seed: 13, sign: true },
    { x: 6.5, z: -15, w: 6, d: 5, floors: 1, ridge: 'x', roof: 'wood', style: 'plank', shutter: '#5a4a2a', door: 0.4, seed: 14 },
    { x: -25, z: 0.5, w: 6, d: 5, floors: 1, ridge: 'z', roof: 'moss', style: 'timber', shutter: '#7a2a2a', door: 0.5, ivy: 3, seed: 15 },
    { x: 21, z: 6, w: 7, d: 5, floors: 2, ridge: 'x', roof: 'slate', style: 'timber', shutter: '#7a2a2a', door: 0.55, plaster: ['#b0a898', '#d4ccbc', '#ece6da'], seed: 16 },
  ];
  const pond = { x: -16, z: 10, rx: 5, rz: 3.2 };
  const plaza = { x: -1, z: 1, r: 6.2 };
  const field = { x0: 8, z0: 12, x1: 17, z1: 19 };
  const cem = { x0: 13.5, z0: -18, x1: 28.5, z1: -8 };
  const shapes = [
    { type: 'rect', kind: 5, x: -46, z: -40, w: 92, h: 20 },
    { type: 'rect', kind: 5, x: -46, z: -40, w: 14, h: 76 },
    { type: 'rect', kind: 5, x: 32, z: -40, w: 14, h: 76 },
    { type: 'path', kind: 2, width: 3.2, pts: [[-40, -10], [13, -10]] },
    { type: 'path', kind: 1, width: 2.6, pts: [[13, -10], [16, -12], [21, -13]] },
    { type: 'path', kind: 2, width: 2.6, pts: [[-1, -9], [-1, -4]] },
    { type: 'path', kind: 1, width: 2.4, pts: [[-1, 6], [0.5, 13], [0, 30]] },
    { type: 'path', kind: 1, width: 2.2, pts: [[-6, 2], [-14, 3], [-25, 4.5]] },
    { type: 'path', kind: 1, width: 2.2, pts: [[4, 2.5], [12, 4.5], [20.5, 9.5]] },
    { type: 'path', kind: 1, width: 1.6, pts: [[-9, -10], [-12, -6], [-12, -3]] },
    { type: 'disc', kind: 2, x: plaza.x, z: plaza.z, rx: plaza.r },
    { type: 'disc', kind: 3, x: pond.x, z: pond.z, rx: pond.rx + 0.7, rz: pond.rz + 0.6 },
    { type: 'rect', kind: 4, x: field.x0, z: field.z0, w: field.x1 - field.x0, h: field.z1 - field.z0 },
  ];
  for (const h of housesDef) shapes.push({ type: 'rect', kind: 1, x: h.x - h.w / 2 - 0.6, z: h.z - h.d / 2 - 0.6, w: h.w + 1.2, h: h.d + 1.6 });
  // mộ
  const graveSpots = [];
  for (let gx = 0; gx < 5; gx++) for (let gz = 0; gz < 3; gz++) {
    const x = 15.5 + gx * 2.6 + (gz & 1) * 0.6, z = -16.2 + gz * 2.9;
    graveSpots.push({ x, z });
    shapes.push({ type: 'rect', kind: 6, x: x - 0.45, z: z + 0.2, w: 0.9, h: 1.7 });
  }
  const ground = T.groundTex({ ...GROUND, shapes });

  // ---------- mặt đất ----------
  const groundMat = new THREE.MeshStandardMaterial({ map: ground.map, normalMap: ground.normalMap, roughness: 0.92, metalness: 0 });
  groundMat.normalScale.set(0.6, -0.6);
  patchMaterial(groundMat, 'wetground', (sh) => {
    sh.uniforms.uWet = U.wet;
    sh.fragmentShader = 'uniform float uWet;\n' + sh.fragmentShader
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.28, uWet * (0.55 + 0.45 * step(diffuseColor.r, 0.32)));')
      .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb *= 1.0 - uWet * 0.35;');
  });
  const groundMesh = new THREE.Mesh(new THREE.PlaneGeometry(GROUND.w, GROUND.h), groundMat);
  groundMesh.rotation.x = -Math.PI / 2;
  groundMesh.position.set(GROUND.x0 + GROUND.w / 2, 0, GROUND.z0 + GROUND.h / 2);
  groundMesh.receiveShadow = true;
  root.add(groundMesh);

  // ---------- quầng sáng (sprite cộng sáng) ----------
  const glowTex = softDisc(64, 0, 2.2);
  function addGlow(x, y, z, color, size, intensity = 1) {
    const sm = new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(color).multiplyScalar(intensity), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    const s = new THREE.Sprite(sm);
    s.position.set(x, y, z); s.scale.set(size, size, 1);
    root.add(s); glowSprites.push({ s, base: intensity, color: new THREE.Color(color), size });
    hideInReflection.push(s);
    return s;
  }

  // ---------- nhà ----------
  const houseObjs = [];
  for (const h of housesDef) houseObjs.push(buildHouse(h));

  function buildHouse(h) {
    const wallH = h.floors === 2 ? 5.0 : 3.2;
    const fade = [];
    const g = new THREE.Group();
    root.add(g);
    const facadeW = h.ridge === 'z' ? h.w : h.w;
    const fac = T.facadeTex({ w: facadeW, h: wallH, floors: h.floors, style: h.style, plaster: h.plaster, shutter: h.shutter, door: h.door, ivy: h.ivy, seed: h.seed });
    const side = T.facadeTex({ w: h.d, h: wallH, floors: h.floors, style: h.style, plaster: h.plaster, shutter: h.shutter, door: 0, winPerFloor: 1, seed: h.seed + 50 });
    const mk = (t, extra = {}) => {
      const m = lamb({ map: t.map, normalMap: t.normalMap, ...extra });
      if (t.emissiveMap) { m.emissiveMap = t.emissiveMap; m.emissive.set('#ffb060'); m.emissiveIntensity = 2.2; }
      m.shadowSide = THREE.DoubleSide;
      seeThrough(m); fade.push(m);
      if (t.emissiveMap) windowMats.push(m);
      return m;
    };
    const mFront = mk(fac), mSide = mk(side);
    const mBack = mk({ map: side.map, normalMap: side.normalMap });
    const roofT = roofs[h.roof];
    const mRoof = lamb({ map: roofT.map, normalMap: roofT.normalMap }); mRoof.shadowSide = THREE.DoubleSide; seeThrough(mRoof);
    const mGable = lamb({ map: tx.plank, color: '#c8b8a0' }); mGable.shadowSide = THREE.DoubleSide; seeThrough(mGable);
    const mTrim = lamb({ map: tx.bark, color: '#8a7060' }); seeThrough(mTrim);
    const mChim = lamb({ map: wallTex.map, normalMap: wallTex.normalMap }); seeThrough(mChim);
    const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0, order = 'XYZ') => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z); m.rotation.set(rx, ry, rz, order);
      m.castShadow = true; m.receiveShadow = true;
      g.add(m); return m;
    };
    const { x, z, w, d } = h;
    add(new THREE.PlaneGeometry(w, wallH), mFront, x, wallH / 2, z + d / 2);
    add(new THREE.PlaneGeometry(w, wallH), mBack, x, wallH / 2, z - d / 2, 0, Math.PI, 0);
    add(new THREE.PlaneGeometry(d, wallH), mSide, x + w / 2, wallH / 2, z, 0, Math.PI / 2, 0);
    add(new THREE.PlaneGeometry(d, wallH), mSide, x - w / 2, wallH / 2, z, 0, -Math.PI / 2, 0);
    // mái: dựng trong hệ trục cục bộ có nóc chạy theo trục X
    const o = 0.4, slope = h.ridge === 'z' ? 0.78 : 0.72;
    const L = h.ridge === 'x' ? w : d, Sp = h.ridge === 'x' ? d : w;
    const rise = (Sp / 2) * Math.tan(slope);
    const roofG = new THREE.Group();
    roofG.position.set(x, 0, z);
    if (h.ridge === 'z') roofG.rotation.y = Math.PI / 2;
    g.add(roofG);
    const slopeLen = (Sp / 2 + o) / Math.cos(slope);
    const yMid = wallH + rise - (slopeLen / 2) * Math.sin(slope);
    const zMid = (slopeLen / 2) * Math.cos(slope);
    const rAdd = (geo, mat, px, py, pz, rx, ry, order = 'XYZ') => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(px, py, pz); m.rotation.set(rx, ry, 0, order);
      m.castShadow = true; m.receiveShadow = true;
      roofG.add(m); return m;
    };
    const slab = boxGeo(L + 2 * o, 0.16, slopeLen, 2, 2);
    rAdd(slab, mRoof, 0, yMid + 0.08, zMid, slope, 0);
    rAdd(slab, mRoof, 0, yMid + 0.08, -zMid, slope, Math.PI, 'YXZ');
    rAdd(boxGeo(L + 2 * o + 0.1, 0.2, 0.32, 1), mTrim, 0, wallH + rise + 0.1, 0, 0, 0);
    // diềm mái trước/sau
    rAdd(boxGeo(L + 2 * o, 0.14, 0.12, 1), mTrim, 0, wallH - o * Math.tan(slope) + 0.02, Sp / 2 + o, 0, 0);
    // tam giác hồi nhà
    const tri = new THREE.BufferGeometry();
    const hs = Sp / 2;
    tri.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -hs, 0, 0, hs, 0, rise, 0], 3));
    tri.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, Sp / 1.5, 0, Sp / 3, rise / 1.5], 2));
    tri.computeVertexNormals();
    for (const sgn of [1, -1]) {
      rAdd(tri, mGable, sgn * L / 2, wallH, 0, 0, sgn > 0 ? Math.PI : 0);
      // ván diềm chạy dọc hai mép mái ở đầu hồi
      for (const s2 of [1, -1]) rAdd(boxGeo(0.14, 0.16, slopeLen, 1), mTrim, sgn * (L / 2 + o), yMid + 0.12, s2 * zMid, s2 * slope, 0);
    }
    // cửa sổ tròn ở hồi nhà mặt tiền (nhà nóc chạy theo trục z)
    if (h.ridge === 'z') {
      const disc = new THREE.Mesh(new THREE.CircleGeometry(0.38, 12), lamb({ color: '#2a1a10', emissive: new THREE.Color('#ffb060'), emissiveIntensity: 2.5 }));
      disc.position.set(x, wallH + rise * 0.42, z + d / 2 + 0.02);
      g.add(disc); windowMats.push(disc.material); fade.push(disc.material); seeThrough(disc.material);
    }
    // ống khói
    if (h.seed % 2 === 1 || h.floors === 2) {
      const cxp = x + (h.ridge === 'x' ? w * 0.25 : 0.6), czp = z - (h.ridge === 'x' ? d * 0.18 : d * 0.25);
      const top = wallH + rise + 0.9;
      add(boxGeo(0.7, top - wallH + 0.2, 0.7, 2, 1), mChim, cxp, (top + wallH) / 2, czp);
      add(boxGeo(0.86, 0.14, 0.86, 1), mTrim, cxp, top + 0.07, czp);
      smokeSources.push({ x: cxp, y: top + 0.2, z: czp, rate: 2.2 });
      perches.push({ x: cxp, y: top + 0.14, z: czp });
    }
    perches.push({ x: x - L * 0.25 * (h.ridge === 'x' ? 1 : 0), y: wallH + rise + 0.22, z: z });
    // bậc cửa + đèn cửa
    if (h.door) {
      const dx = x - w / 2 + h.door * w;
      batch.add(boxGeo(1.4, 0.18, 0.7, 1), mWall, mat4(dx, 0.09, z + d / 2 + 0.35));
      const lx = dx + 0.95;
      batch.add(boxGeo(0.06, 0.06, 0.3, 1), mMetal, mat4(lx, 2.25, z + d / 2 + 0.15));
      const lantern = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.28, 0.2), lamb({ color: '#2a2018', emissive: new THREE.Color('#ffb050'), emissiveIntensity: 3.5 }));
      lantern.position.set(lx, 2.1, z + d / 2 + 0.3);
      g.add(lantern);
      emit(lx, 2.1, z + d / 2 + 0.6, '#ffae5a', 9, 7.5, 'lamp', 'lamp');
      addGlow(lx, 2.1, z + d / 2 + 0.32, '#ffb060', 1.1, 0.8);
    }
    // ánh sáng cửa sổ hắt ra
    const litCount = fac.wins.filter((wn) => wn.state === 'lit').length;
    if (litCount) emit(x, 1.6, z + d / 2 + 2.4, '#ffb466', 3 + litCount * 1.3, 7.5, 'window', 'none');
    // biển hiệu quán trọ
    if (h.sign) {
      batch.add(boxGeo(0.9, 0.08, 0.08, 1), mMetal, mat4(x + w / 2 - 1.3, 2.75, z + d / 2 + 0.45));
      batch.add(boxGeo(0.7, 0.5, 0.06, 0.7, 0.5), mPlank, mat4(x + w / 2 - 1.1, 2.4, z + d / 2 + 0.8));
    }
    addBox(x - w / 2 - 0.1, z - d / 2 - 0.1, x + w / 2 + 0.1, z + d / 2 + 0.1);
    occluders.push({ x0: x - w / 2 - o, x1: x + w / 2 + o, z0: z - d / 2, z1: z + d / 2, h: wallH + rise, fade });
    return { g, fade, def: h };
  }

  // ---------- cây voxel ----------
  const leaves = new Voxels(tx.leaf, { sway: 0.07, see: true, wrap: 0.55 });
  const trunks = new Voxels(tx.bark, { see: true });
  const stones = new Voxels(tx.stone);
  const planks = new Voxels(tx.plank);
  const crates = new Voxels(tx.crate);
  const misc = new Voxels(tx.plain);
  const pumpkins = new Voxels(tx.pumpkin);
  const hay = new Voxels(tx.hay);
  const soil = new Voxels(tx.dirt);
  const TREE_COLORS = {
    oak: ['#3f6a28', '#4e7c2e', '#5d8a34', '#6c9a3c'],
    oak2: ['#365e26', '#447026', '#557e2c', '#668e36'],
    autumn: ['#a8481e', '#c0602a', '#d88a34', '#e8a83e'],
    gold: ['#8a7a22', '#a8922a', '#c0aa36', '#d6c04a'],
    pine: ['#1e3a26', '#25462c', '#2e5434', '#38623c'],
  };
  function canopy(cx, cy, cz, clusters, palette, rr, cullBack = true, VS = 0.5) {
    const cells = new Map();
    const key = (i, j, k) => i + ',' + j + ',' + k;
    let minY = Infinity, maxY = -Infinity;
    for (const [ox, oy, oz, r] of clusters) {
      const x0 = cx + ox, y0 = cy + oy, z0 = cz + oz;
      for (let i = Math.floor((x0 - r) / VS); i <= Math.ceil((x0 + r) / VS); i++)
        for (let j = Math.floor((y0 - r) / VS); j <= Math.ceil((y0 + r) / VS); j++)
          for (let k = Math.floor((z0 - r) / VS); k <= Math.ceil((z0 + r) / VS); k++) {
            const px = i * VS, py = j * VS, pz = k * VS;
            const dd = Math.hypot(px - x0, (py - y0) * 1.15, pz - z0);
            if (dd <= r * (0.82 + rr() * 0.28)) { cells.set(key(i, j, k), [i, j, k]); minY = Math.min(minY, py); maxY = Math.max(maxY, py); }
          }
    }
    for (const [i, j, k] of cells.values()) {
      const open = (a, b, c) => !cells.has(key(i + a, j + b, k + c));
      const visible = open(0, 1, 0) || open(0, 0, 1) || open(1, 0, 0) || open(-1, 0, 0) || (!cullBack && (open(0, 0, -1) || open(0, -1, 0)));
      if (!visible) continue;
      const ty = (j * VS - minY) / Math.max(0.1, maxY - minY);
      const base = new THREE.Color(palette[Math.min(palette.length - 1, Math.floor(rr() * 1.4 + ty * (palette.length - 1.2)))]);
      base.multiplyScalar(0.62 + ty * 0.45 + (rr() - 0.5) * 0.12);
      leaves.add(i * VS, j * VS, k * VS, VS * 1.02, VS * 1.02, VS * 1.02, '#' + base.getHexString());
    }
    canopies.push({ x: cx, y: cy, z: cz, r: clusters[0][3], color: palette[2] });
  }
  function tree(x, z, s = 1, type = 'oak', solid = true) {
    const rr = makeRng(Math.floor(x * 1000 + z * 77) + 5);
    if (type === 'dead') {
      const th = 3.4 * s;
      for (let y = 0; y < th; y += 0.5) trunks.add(x, y + 0.25, z, 0.42 - y * 0.03, 0.5, 0.42 - y * 0.03, '#5a5048');
      const br = [[1, 0.8, 0.6], [-1, 0.55, 0.9], [0.6, 0.95, -0.4], [-0.7, 0.75, -0.6]];
      for (const [dx, hy, len] of br) {
        for (let i = 1; i <= 3; i++) trunks.add(x + dx * i * 0.32 * len * 1.6, th * hy + i * 0.28, z + (rr() - 0.5) * 0.3, 0.24, 0.24, 0.24, '#4e463e');
      }
      if (solid) addCircle(x, z, 0.35);
      perches.push({ x: x + 0.5, y: th * 0.95 + 0.6, z });
      return;
    }
    if (type === 'pine') {
      const VS = solid ? 0.5 : 0.62;
      const th = 1.6 * s;
      for (let y = 0; y < th; y += 0.5) trunks.add(x, y + 0.25, z, 0.5, 0.5, 0.5, '#6a4a30');
      const cells = [];
      for (let tier = 0; tier < 4; tier++) {
        const y0 = th + tier * 1.25 * s, r = (2.0 - tier * 0.45) * s;
        cells.push([0, y0 - th, 0, r]);
      }
      const pal = TREE_COLORS.pine;
      for (const [ox, oy, oz, r] of cells) {
        for (let i = -Math.ceil(r / VS); i <= Math.ceil(r / VS); i++)
          for (let k = -Math.ceil(r / VS); k <= Math.ceil(r / VS); k++)
            for (let j = 0; j < 3; j++) {
              const rad = r * (1 - j / 3);
              const dd = Math.hypot(i * VS, k * VS);
              if (dd <= rad * (0.85 + rr() * 0.2) && (dd > rad - 0.9 || j === 2) && k * VS > -rad + 0.6) {
                const c = new THREE.Color(pal[Math.min(3, j + Math.floor(rr() * 2))]).multiplyScalar(0.7 + j * 0.15);
                leaves.add(x + i * VS, th + oy + j * VS + 0.25, z + k * VS, VS, VS, VS, '#' + c.getHexString());
              }
            }
      }
      canopies.push({ x, y: th + 2.2 * s, z, r: 1.8 * s, color: pal[2] });
      if (solid) addCircle(x, z, 0.45);
      return;
    }
    const th = (1.9 + rr() * 0.6) * s;
    const VS = solid ? 0.5 : (quality === 'high' ? 0.62 : 0.75);
    for (let y = 0; y < th + 0.8; y += 0.5) trunks.add(x, y + 0.25, z, 0.62, 0.5, 0.62, y < 0.5 ? '#5a3e28' : '#6e4e34');
    trunks.add(x + 0.45, 0.15, z, 0.4, 0.3, 0.4, '#5a3e28'); trunks.add(x - 0.45, 0.15, z + 0.1, 0.4, 0.3, 0.4, '#5a3e28');
    trunks.add(x, 0.15, z + 0.42, 0.4, 0.3, 0.3, '#5a3e28');
    for (let i = 1; i <= 3; i++) { trunks.add(x + i * 0.35, th - 0.2 + i * 0.32, z, 0.32, 0.32, 0.32, '#6e4e34'); trunks.add(x - i * 0.32, th + i * 0.3, z + 0.1, 0.3, 0.3, 0.3, '#6e4e34'); }
    const pal = TREE_COLORS[type] || TREE_COLORS.oak;
    canopy(x, th, z, [
      [0, 1.5 * s, 0, 1.9 * s], [-1.3 * s, 0.9 * s, 0.25, 1.35 * s], [1.35 * s, 1.0 * s, -0.2, 1.45 * s], [0.2, 2.6 * s, -0.2, 1.35 * s],
    ], pal, rr, true, VS);
    if (solid) addCircle(x, z, 0.5);
  }
  function bush(x, z, s = 1, pal = TREE_COLORS.oak2, flowers = null) {
    const rr = makeRng(Math.floor(x * 931 + z * 37));
    canopy(x, 0, z, [[0, 0.5 * s, 0, 0.95 * s], [0.6 * s, 0.35 * s, 0.1, 0.7 * s]], pal, rr, true);
    canopies.pop();
    if (flowers) for (let i = 0; i < 5; i++) misc.add(x + (rr() - 0.5) * 1.4 * s, 0.6 * s + rr() * 0.6 * s, z + 0.35 * s + rr() * 0.3, 0.16, 0.16, 0.16, flowers);
  }

  // cây trong làng
  const interiorTrees = [
    [-19.5, -4.5, 1.05, 'oak'], [14.5, -3, 1, 'oak2'], [-5.5, 17.5, 1.1, 'autumn'], [25.5, 16, 1.15, 'oak'], [-28, 11, 1.1, 'oak2'],
    [28, -3.5, 1, 'pine'], [-14, 19, 0.95, 'gold'], [9.5, 8, 0.9, 'oak'], [-21, 14.5, 0.85, 'autumn'], [27.5, 2, 0.95, 'pine'],
    [-29, -9, 1.0, 'pine'], [18.5, -6, 0.8, 'dead'], [26.5, -11.5, 0.95, 'dead'], [-9, 9.5, 0.75, 'oak2'],
  ];
  for (const [x, z, s, t] of interiorTrees) tree(x, z, s, t);
  // rừng bao quanh
  for (let i = 0; i < 26; i++) {
    const x = -44 + i * 3.6 + rng.range(-1, 1), z = -21 - rng.range(0, 3.5) - (i % 3) * 2.2;
    tree(x, z, 1.15 + rng() * 0.35, rng.chance(0.3) ? 'pine' : rng.chance(0.5) ? 'oak2' : 'oak', false);
  }
  for (const side of [-1, 1]) for (let i = 0; i < 11; i++) {
    const x = side * (33.5 + rng.range(0, 6) + (i % 2) * 2.5), z = -18 + i * 4.2 + rng.range(-1, 1);
    tree(x, z, 1.05 + rng() * 0.35, rng.chance(0.35) ? 'pine' : rng.chance(0.3) ? 'autumn' : 'oak', false);
  }
  for (let i = 0; i < 9; i++) tree(-34 + i * 8.5 + rng.range(-2, 2), 27 + rng.range(0, 3), 1.1 + rng() * 0.3, rng.chance(0.5) ? 'oak' : 'autumn', false);

  // bụi cây
  const bushes = [
    [-26, -11.5], [-19.5, -11.8, '#e84a6a'], [-9.5, -11.6], [1.5, -11.8, '#f0d040'], [10.5, -11.5], [-28.5, 4.5, '#ffffff'], [-21.5, 4.6],
    [17, 9.2, '#e84a6a'], [25.5, 9.2], [-12.5, 6.5], [-20.5, 6.4, '#c84ad8'], [7, -5.5], [-6.5, 21.5], [6, 21.8, '#f0d040'], [15, 21.5], [-17, 21.5],
    [29, 9], [-30, -3], [11.5, 0.5], [-24.5, 18],
  ];
  for (const [x, z, f] of bushes) bush(x, z, 0.9 + rng() * 0.4, rng.chance(0.5) ? TREE_COLORS.oak2 : TREE_COLORS.oak, f || null);

  // ---------- ao nước phản chiếu ----------
  const waterGeo = new THREE.CircleGeometry(1, 48);
  waterGeo.scale(pond.rx, pond.rz, 1);
  const water = quality !== 'high' ? cheapWater(waterGeo) : new Reflector(waterGeo, {
    clipBias: 0.003,
    textureWidth: quality === 'high' ? 768 : 384,
    textureHeight: quality === 'high' ? 432 : 216,
    color: 0x8c9ca4,
    multisample: 0,
    shader: {
      name: 'PondShader',
      uniforms: { color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null }, uTime: U.time, uRain: { value: 0 }, uDeep: { value: new THREE.Color('#06100f') } },
      vertexShader: `
        uniform mat4 textureMatrix; varying vec4 vUv; varying vec3 vW;
        void main(){ vUv = textureMatrix * vec4(position, 1.0); vW = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        uniform vec3 color; uniform sampler2D tDiffuse; uniform float uTime; uniform float uRain; uniform vec3 uDeep;
        varying vec4 vUv; varying vec3 vW;
        float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        void main(){
          vec2 w = floor(vW.xz * 16.0) / 16.0;
          vec2 d = vec2(sin(w.y * 2.6 + uTime * 1.3) + sin(w.x * 1.7 - uTime * 0.9), cos(w.x * 2.2 + uTime * 1.1) + cos(w.y * 3.0 - uTime * 0.7)) * 0.01;
          float ring = 0.0;
          for (int i = 0; i < 2; i++) {
            vec2 q = w * 1.3 + float(i) * 0.5;
            vec2 cell = floor(q), f = fract(q) - 0.5;
            float hh = h21(cell + float(i) * 7.0);
            float t = fract(uTime * 0.8 + hh * 9.0);
            vec2 c = vec2(h21(cell + 3.1), h21(cell + 7.7)) - 0.5;
            float r = length(f - c * 0.5);
            ring += smoothstep(0.035, 0.0, abs(r - t * 0.42)) * (1.0 - t);
          }
          ring *= uRain;
          d += ring * 0.025;
          vec4 uv = vUv; uv.xy += d * uv.w;
          vec3 refl = texture2DProj(tDiffuse, uv).rgb;
          vec2 e = (vW.xz - vec2(${pond.x.toFixed(2)}, ${pond.z.toFixed(2)})) / vec2(${pond.rx.toFixed(2)}, ${pond.rz.toFixed(2)});
          float shore = smoothstep(0.75, 1.0, length(e));
          vec3 col = uDeep + refl * color * (1.0 - shore * 0.5) + ring * 0.06;
          gl_FragColor = vec4(col, 1.0);
        }`,
    },
  });
  water.material.uniforms.uTime = U.time;
  water.rotation.x = -Math.PI / 2;
  water.position.set(pond.x, 0.04, pond.z);
  root.add(water);
  if (water.isReflector) {
    const ob = water.onBeforeRender;
    water.onBeforeRender = function (r, s, c) {
      for (const o of hideInReflection) o.visible = false;
      ob.call(this, r, s, c);
      for (const o of hideInReflection) o.visible = true;
    };
  }
  // nước rẻ cho máy yếu: mặt nước tối, bóng loáng phản chiếu ánh đèn
  function cheapWater(geo) {
    const m = new THREE.MeshStandardMaterial({ color: '#0b1a1c', roughness: 0.08, metalness: 0.2 });
    m.uniforms = { uTime: { value: 0 }, uRain: { value: 0 } };
    const mesh = new THREE.Mesh(geo, m);
    mesh.receiveShadow = true;
    return mesh;
  }
  for (let i = 0; i < 46; i++) {
    const a = (i / 46) * Math.PI * 2, rr2 = 1.02 + rng() * 0.1;
    const x = pond.x + Math.cos(a) * pond.rx * rr2, z = pond.z + Math.sin(a) * pond.rz * rr2;
    const s = 0.3 + rng() * 0.3;
    stones.add(x, s * 0.3, z, s * 1.4, s * 0.7, s, ['#6a6a6e', '#7a7872', '#5a5a5e'][i % 3], rng() * 3);
  }
  for (let i = 0; i < 6; i++) addCircle(pond.x + (i - 2.5) * 1.55, pond.z, pond.rz * (1 - Math.abs(i - 2.5) / 5.2) + 0.2, true);
  addCircle(pond.x - pond.rx + 0.9, pond.z, 1.8, true); addCircle(pond.x + pond.rx - 0.9, pond.z, 1.8, true);
  const lilyMat = spriteLit(lamb({ map: T.lilyTex(), alphaTest: 0.5, side: THREE.DoubleSide }));
  const lilies = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.9, 0.9), lilyMat, 9);
  for (let i = 0; i < 9; i++) {
    const a = rng() * 6.28, rr2 = Math.sqrt(rng()) * 0.75;
    const m = mat4(pond.x + Math.cos(a) * pond.rx * rr2, 0.06, pond.z + Math.sin(a) * pond.rz * rr2, -Math.PI / 2, 0, rng() * 6.28, 'XYZ');
    lilies.setMatrixAt(i, m);
  }
  root.add(lilies); hideInReflection.push(lilies);

  // ---------- đèn đường ----------
  const lampPos = [[-27, -12], [-17.5, -12], [-8.5, -12], [1.5, -12.2], [11, -12], [-7, -4.2], [5.2, 6.2], [1.6, 12.5], [-11.5, 4.6], [12.5, 2.6], [-20.5, 7.5], [15.6, 17.2]];
  for (const [x, z] of lampPos) lampPost(x, z);
  function lampPost(x, z, color = '#ffb85e') {
    misc.add(x, 0.12, z, 0.34, 0.24, 0.34, '#2a2a30');
    misc.add(x, 1.45, z, 0.13, 2.7, 0.13, '#26262c');
    misc.add(x + 0.22, 2.75, z, 0.5, 0.08, 0.08, '#26262c');
    misc.add(x + 0.42, 2.92, z, 0.34, 0.08, 0.34, '#1e1e24');
    const lantern = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.32, 0.26), lamb({ color: '#3a3026', emissive: new THREE.Color(color), emissiveIntensity: 4 }));
    lantern.position.set(x + 0.42, 2.7, z);
    root.add(lantern);
    emit(x + 0.42, 2.6, z, color, 11, 9, 'lamp', rng.chance(0.18) ? 'broken' : 'lamp');
    addGlow(x + 0.42, 2.7, z + 0.05, color, 1.3, 0.75);
    lampHeads.push({ x: x + 0.42, y: 2.7, z, mat: lantern.material, e: emitters[emitters.length - 1] });
    addCircle(x, z, 0.22, true);
  }

  // ---------- lửa trại & thùng lửa ----------
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
    addGlow(x, base + h * 0.4, z + 0.1, '#ff7a2a', 2.6 * scale, 1.0);
    smokeSources.push({ x, y: base + h * 0.9, z, rate: 3 * scale, fire: true });
  }
  // lửa trại giữa quảng trường
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    stones.add(plaza.x + Math.cos(a) * 0.85, 0.14, plaza.z + Math.sin(a) * 0.85, 0.36, 0.28, 0.36, i % 2 ? '#6e6c66' : '#5c5a56', a);
  }
  trunks.add(plaza.x, 0.14, plaza.z, 1.2, 0.2, 0.22, '#8a6a4a', 0.6);
  trunks.add(plaza.x, 0.2, plaza.z, 1.1, 0.2, 0.22, '#9a7652', -0.7);
  fire(plaza.x, plaza.z, 1.35, 46, 0.1);
  addCircle(plaza.x, plaza.z, 1.0, true);
  // khúc gỗ ngồi quanh lửa
  for (const [dx, dz, ry] of [[-2.6, 0.6, 0.3], [2.4, -0.4, -0.2], [0.2, -2.6, 1.5]]) {
    trunks.add(plaza.x + dx, 0.22, plaza.z + dz, 1.5, 0.42, 0.45, '#b08a62', ry);
    addCircle(plaza.x + dx, plaza.z + dz, 0.55, true);
  }
  // thùng lửa
  for (const [x, z] of [[7.5, 0.5], [-9.5, -6.5], [3, 15.5], [-23.5, -7.5], [21.5, 13]]) {
    const bm = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.33, 0.9, 10), lamb({ map: tx.metal, color: '#8a5a3a' }));
    bm.position.set(x, 0.45, z); bm.castShadow = true; bm.receiveShadow = true;
    root.add(bm);
    fire(x, z, 0.75, 16, 0.85);
    addCircle(x, z, 0.42, true);
  }

  // ---------- trại: lều, bao cát, thùng gỗ ----------
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
    const m = new THREE.Mesh(g, mat);
    m.material.side = THREE.DoubleSide;
    m.position.set(x, 0, z); m.rotation.y = ry;
    m.castShadow = true; m.receiveShadow = true;
    root.add(m);
    const door = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), lamb({ color: '#140e0a' }));
    door.geometry.translate(0, 0.45, 0);
    door.position.set(x + Math.sin(ry) * (lv / 2 + 0.01), 0, z + Math.cos(ry) * (lv / 2 + 0.01)); door.rotation.y = ry;
    root.add(door);
    addCircle(x, z, 1.35);
  }
  tent(-7.5, 7, 0.35, clothMats.a);
  tent(6.2, -3.6, -0.5, clothMats.b);
  function sandbags(cx, cz, r, a0, a1) {
    const n = Math.round((a1 - a0) * r / 0.62);
    for (let row = 0; row < 2; row++)
      for (let i = 0; i < n - row; i++) {
        const a = a0 + (i + 0.5 + row * 0.5) * (a1 - a0) / n;
        misc.add(cx + Math.cos(a) * r, 0.17 + row * 0.3, cz + Math.sin(a) * r, 0.62, 0.32, 0.36, row ? '#a89670' : '#968460', -a + Math.PI / 2);
      }
    for (let i = 0; i <= n; i += 2) { const a = a0 + i * (a1 - a0) / n; addCircle(cx + Math.cos(a) * r, cz + Math.sin(a) * r, 0.45, true); }
  }
  sandbags(plaza.x, plaza.z, 8.2, 2.4, 3.1);
  sandbags(plaza.x, plaza.z, 8.2, 3.6, 4.3);
  sandbags(plaza.x, plaza.z, 8.4, 5.3, 5.9);
  sandbags(plaza.x, plaza.z, 8.4, 0.3, 0.95);
  function crate(x, z, s = 0.8, y = s / 2, ry = 0) { crates.add(x, y, z, s, s, s, '#ffffff', ry); }
  for (const [x, z, st] of [[-4.8, -6.2, 2], [9.5, -1.5, 1], [-14.5, -8.2, 3], [4, 8.6, 1], [19.5, 2.2, 2], [-23, 7.5, 1]]) {
    crate(x, z, 0.85, 0.425, rng() * 0.4);
    if (st > 1) crate(x + 0.9, z + 0.1, 0.8, 0.4, rng() * 0.4);
    if (st > 2) crate(x + 0.45, z, 0.7, 1.2, rng() * 0.6);
    addBox(x - 0.5, z - 0.5, x + (st > 1 ? 1.4 : 0.5), z + 0.5);
  }
  for (const [x, z] of [[-3.8, -6.8], [10.4, -2.4], [20.5, 3.2], [-15.5, -7.6]]) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.95, 10), lamb({ map: tx.plank }));
    b.position.set(x, 0.475, z); b.castShadow = b.receiveShadow = true; root.add(b);
    misc.add(x, 0.25, z, 0.72, 0.05, 0.72, '#2a2a2e'); misc.add(x, 0.75, z, 0.72, 0.05, 0.72, '#2a2a2e');
    addCircle(x, z, 0.38, true);
  }

  // ---------- giếng ----------
  {
    const x = -12.5, z = -4.5;
    for (let i = 0; i < 12; i++) { const a = i / 12 * 6.28; stones.add(x + Math.cos(a) * 0.85, 0.4, z + Math.sin(a) * 0.85, 0.5, 0.8, 0.42, i % 2 ? '#7a7670' : '#6a6660', -a); }
    misc.add(x, 0.75, z, 1.3, 0.04, 1.3, '#0a0c10');
    for (const s of [-1, 1]) trunks.add(x + s * 0.95, 1.3, z, 0.16, 2.6, 0.16, '#5a3e28');
    trunks.add(x, 2.15, z, 2.1, 0.12, 0.12, '#5a3e28');
    planks.add(x, 2.75, z + 0.42, 2.4, 0.08, 1.0, '#9a5a3a'); planks.add(x, 2.75, z - 0.42, 2.4, 0.08, 1.0, '#9a5a3a');
    misc.add(x, 1.7, z, 0.26, 0.3, 0.26, '#6a4a2e');
    addCircle(x, z, 1.15, true);
    perches.push({ x: x + 0.3, y: 3.05, z });
  }

  // ---------- xe tải bỏ hoang ----------
  {
    const x = 10.5, z = -8.4, paint = '#5e7a86', rust = '#7a4a2a';
    misc.add(x, 0.75, z, 4.4, 0.7, 1.9, paint);
    misc.add(x - 1.2, 1.55, z, 1.6, 0.95, 1.8, paint);
    misc.add(x - 1.25, 1.62, z + 0.91, 1.3, 0.55, 0.02, '#1a222c');
    misc.add(x - 2.02, 1.62, z, 0.02, 0.55, 1.5, '#222c38');
    misc.add(x + 1.0, 1.2, z + 0.92, 2.3, 0.22, 0.06, paint); misc.add(x + 1.0, 1.2, z - 0.92, 2.3, 0.22, 0.06, paint);
    misc.add(x + 2.18, 1.2, z, 0.06, 0.22, 1.9, paint);
    misc.add(x + 0.6, 1.12, z, 1.2, 0.2, 1.0, rust);
    misc.add(x - 2.2, 0.62, z, 0.08, 0.4, 1.95, '#3a3a3e');
    for (const [wx, wz] of [[-1.4, 0.95], [-1.4, -0.95], [1.4, 0.95], [1.4, -0.95]]) misc.add(x + wx, 0.38, z + wz, 0.76, 0.76, 0.26, '#141416');
    hay.add(x + 1.0, 1.42, z + 0.2, 0.9, 0.4, 0.7, '#ffffff');
    addBox(x - 2.3, z - 1.05, x + 2.25, z + 1.05);
    perches.push({ x: x - 1.2, y: 2.05, z });
  }

  // ---------- ruộng bí ngô + hàng rào ----------
  const jack = makeJackFace();
  const jackMat = lamb({ map: jack.map, emissiveMap: jack.emissiveMap, emissive: new THREE.Color('#ffa030'), emissiveIntensity: 3, transparent: false, alphaTest: 0.5 });
  const jackFaces = [];
  for (let i = 0; i < 16; i++) {
    const x = field.x0 + 0.8 + (i % 4) * 2.2 + rng.range(-0.3, 0.3), z = field.z0 + 1 + Math.floor(i / 4) * 1.7 + rng.range(-0.2, 0.2);
    const s = 0.75 + rng() * 0.35;
    const cells = [[0, 0, 0], [0.5, 0, 0], [-0.5, 0, 0], [0, 0, 0.5], [0, 0, -0.5], [0, 0.45, 0], [0.32, 0.4, 0.3], [-0.32, 0.4, -0.3]];
    for (const [a, b, c] of cells) pumpkins.add(x + a * s * 0.8, 0.25 * s + b * s, z + c * s * 0.8, 0.5 * s, 0.5 * s, 0.5 * s, '#ffffff');
    trunks.add(x, 0.75 * s, z, 0.12, 0.25, 0.12, '#4a5a22');
    for (let v = 0; v < 3; v++) misc.add(x + rng.range(-0.9, 0.9), 0.04, z + rng.range(-0.6, 0.6), 0.5, 0.06, 0.18, '#3e6a26', rng() * 3);
    if (i % 5 === 1) {
      const f = new THREE.Mesh(new THREE.PlaneGeometry(0.42 * s, 0.42 * s), jackMat);
      f.position.set(x, 0.3 * s, z + 0.38 * s + 0.02);
      root.add(f); jackFaces.push(f);
      addGlow(x, 0.32 * s, z + 0.5 * s, '#ff8a20', 0.9, 0.7);
    }
  }
  function fence(x0, z0, x1, z1) {
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / 1.5));
    const ry = -Math.atan2(z1 - z0, x1 - x0);
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
      planks.add(x, 0.48, z, 0.16, 0.96, 0.16, '#d8c8b0', ry);
      if (i < n) {
        const t2 = (i + 0.5) / n, mx = x0 + (x1 - x0) * t2, mz = z0 + (z1 - z0) * t2;
        planks.add(mx, 0.42, mz, len / n, 0.1, 0.07, '#e8d8c0', ry);
        planks.add(mx, 0.76, mz, len / n, 0.1, 0.07, '#e8d8c0', ry);
      }
    }
    const steps = Math.ceil(len / 0.8);
    for (let i = 0; i <= steps; i++) addCircle(x0 + (x1 - x0) * i / steps, z0 + (z1 - z0) * i / steps, 0.22, true);
  }
  fence(field.x0 - 0.5, field.z0 - 0.5, field.x1 + 0.5, field.z0 - 0.5);
  fence(field.x1 + 0.5, field.z0 - 0.5, field.x1 + 0.5, field.z1 + 0.5);
  fence(field.x0 - 0.5, field.z0 - 0.5, field.x0 - 0.5, field.z0 + 3);
  fence(-30, 22.5, -8, 22.5); fence(8, 22.5, 30, 22.5);
  fence(pond.x - 6.5, pond.z + 4.6, pond.x + 2, pond.z + 4.6);
  // rơm
  for (const [x, z] of [[18, 10.5], [24, 10.5], [-27.5, 6.5]]) { hay.add(x, 0.45, z, 1.3, 0.9, 0.9, '#ffffff', 0.2); addBox(x - 0.7, z - 0.5, x + 0.7, z + 0.5, true); }

  // ---------- nghĩa địa ----------
  {
    const { x0, z0, x1, z1 } = cem;
    const wallSeg = (ax, az, bx, bz) => {
      const len = Math.hypot(bx - ax, bz - az), ry = -Math.atan2(bz - az, bx - ax);
      batch.add(boxGeo(len, 0.75, 0.42, 2, 1), mWall, mat4((ax + bx) / 2, 0.375, (az + bz) / 2, 0, ry, 0));
      const steps = Math.ceil(len / 0.7);
      for (let i = 0; i <= steps; i++) addCircle(ax + (bx - ax) * i / steps, az + (bz - az) * i / steps, 0.3, true);
    };
    wallSeg(x0, z1, x0 + 5, z1); wallSeg(x0 + 8, z1, x1, z1);
    wallSeg(x0, z0 + 3.5, x0, z1);
    wallSeg(x1, z0, x1, z1);
    for (const [x, z] of [[x0 + 5, z1], [x0 + 8, z1]]) { stones.add(x, 0.65, z, 0.55, 1.3, 0.55, '#7a7670'); misc.add(x, 1.36, z, 0.32, 0.14, 0.32, '#2a2a2e'); }
    for (const gsp of graveSpots) {
      const { x, z } = gsp;
      const kind = rng();
      if (kind < 0.55) {
        stones.add(x, 0.42, z, 0.62, 0.84, 0.2, '#8a8680', rng.range(-0.12, 0.12));
        stones.add(x, 0.88, z, 0.42, 0.14, 0.2, '#8a8680');
      } else if (kind < 0.85) {
        stones.add(x, 0.5, z, 0.14, 1.0, 0.14, '#7a7670');
        stones.add(x, 0.72, z, 0.56, 0.14, 0.14, '#7a7670');
      } else {
        stones.add(x, 0.25, z, 0.7, 0.5, 0.3, '#6a6660', 0.25);
      }
      soil.add(x, 0.06, z + 1.05, 0.8, 0.14, 1.5, '#ffffff');
      addBox(x - 0.35, z - 0.15, x + 0.35, z + 0.15, true);
      graves.push({ x, z: z + 1.05 });
    }
    emit(x0 + 6.5, 1.6, z1 + 0.3, '#9adf8a', 7, 7, 'lamp', 'broken');
    misc.add(x0 + 6.5, 0.8, z1 + 0.3, 0.1, 1.6, 0.1, '#26262c');
    const gl = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.26, 0.22), lamb({ color: '#202a20', emissive: new THREE.Color('#9adf8a'), emissiveIntensity: 3.5 }));
    gl.position.set(x0 + 6.5, 1.72, z1 + 0.3); root.add(gl);
    lampHeads.push({ x: x0 + 6.5, y: 1.72, z: z1 + 0.3, mat: gl.material, e: emitters[emitters.length - 1] });
    addGlow(x0 + 6.5, 1.72, z1 + 0.35, '#9adf8a', 1.3, 0.8);
  }

  // ---------- tường đá thấp trang trí ----------
  {
    const seg = (ax, az, bx, bz, h = 0.9) => {
      const len = Math.hypot(bx - ax, bz - az), ry = -Math.atan2(bz - az, bx - ax);
      batch.add(boxGeo(len, h, 0.5, 2, 1), mWall, mat4((ax + bx) / 2, h / 2, (az + bz) / 2, 0, ry, 0));
      batch.add(boxGeo(len + 0.1, 0.12, 0.62, 2, 1), mWall, mat4((ax + bx) / 2, h + 0.06, (az + bz) / 2, 0, ry, 0));
      const steps = Math.ceil(len / 0.7);
      for (let i = 0; i <= steps; i++) addCircle(ax + (bx - ax) * i / steps, az + (bz - az) * i / steps, 0.32, true);
    };
    seg(-30, -6.5, -24, -6.5);
    seg(24, 12.5, 30, 12.5);
    seg(-4, 19.5, -10, 19.5, 0.7);
  }

  // ---------- cỏ, hoa, dương xỉ (instanced) ----------
  const grassMeshes = [];
  {
    const tufts = T.grassTufts();
    const flowersT = T.flowerTexs();
    const dens = quality === 'high' ? 1 : 0.5;
    const blocked = (x, z, pad = 0.2) => {
      for (const b of colliders.boxes) if (x > b.x0 - pad && x < b.x1 + pad && z > b.z0 - pad && z < b.z1 + pad) return true;
      return false;
    };
    const inPond = (x, z) => ((x - pond.x) / (pond.rx + 0.5)) ** 2 + ((z - pond.z) / (pond.rz + 0.5)) ** 2 < 1;
    const make = (map, count, place, size, amp, colorFn, cast = false) => {
      const mat = lamb({ map, alphaTest: 0.45, side: THREE.DoubleSide });
      grassPatch(mat, amp);
      const geo = new THREE.PlaneGeometry(1, 1); geo.translate(0, 0.5, 0);
      const mesh = new THREE.InstancedMesh(geo, mat, count);
      const m = new THREE.Matrix4(), c = new THREE.Color();
      let n = 0;
      for (let tries = 0; n < count && tries < count * 6; tries++) {
        const p = place();
        if (!p) continue;
        const [x, z] = p;
        const s = size[0] + rng() * (size[1] - size[0]);
        m.compose(V.set(x, 0, z), Q.setFromEuler(E.set(0, (rng() - 0.5) * 1.4, 0)), S3.set(s * (rng() < 0.5 ? 1 : -1), s * (0.85 + rng() * 0.3), s));
        mesh.setMatrixAt(n, m);
        mesh.setColorAt(n, c.set(colorFn(x, z)));
        n++;
      }
      mesh.count = n;
      mesh.receiveShadow = true; mesh.castShadow = cast;
      mesh.frustumCulled = false;
      root.add(mesh); grassMeshes.push(mesh); hideInReflection.push(mesh);
      return mesh;
    };
    const area = { x0: -42, x1: 42, z0: -34, z1: 32 };
    const randPos = () => [area.x0 + rng() * (area.x1 - area.x0), area.z0 + rng() * (area.z1 - area.z0)];
    const grassy = (k) => k === 0 || k === 5;
    const tint = (x, z) => {
      const v = 0.82 + rng() * 0.3;
      const warm = 0.5 + 0.5 * Math.sin(x * 0.13 + z * 0.09);
      return new THREE.Color(v * (0.92 + warm * 0.12), v, v * (0.9 - warm * 0.08)).getHex();
    };
    for (let v = 0; v < 3; v++) {
      make(tufts[v], Math.round(5200 * dens), () => {
        const [x, z] = randPos();
        const k = ground.kindAt(x, z);
        if (!grassy(k) || blocked(x, z) || inPond(x, z)) return null;
        return [x, z];
      }, [0.75, 1.25], 0.11, tint);
    }
    // cỏ cao tiền cảnh (gần camera) và mép đường
    make(tufts[2], Math.round(1600 * dens), () => {
      const x = area.x0 + rng() * (area.x1 - area.x0), z = 20 + rng() * 12;
      return [x, z];
    }, [1.3, 2.0], 0.16, tint);
    flowersT.forEach((ft, i) => {
      const centers = Array.from({ length: 9 }, () => randPos());
      make(ft, Math.round(260 * dens), () => {
        const c = centers[Math.floor(rng() * centers.length)];
        const x = c[0] + (rng() - 0.5) * 5, z = c[1] + (rng() - 0.5) * 3.5;
        const k = ground.kindAt(x, z);
        if (!grassy(k) || blocked(x, z) || inPond(x, z)) return null;
        return [x, z];
      }, [0.5, 0.7], 0.14, () => 0xffffff);
    });
    make(T.fernTex(), Math.round(900 * dens), () => {
      const [x, z] = randPos();
      if (ground.kindAt(x, z) !== 5) return null;
      return [x, z];
    }, [1.0, 1.6], 0.08, tint);
    make(T.reedTex(), Math.round(140 * dens), () => {
      const a = rng() * 6.28, rr2 = 0.92 + rng() * 0.25;
      return [pond.x + Math.cos(a) * pond.rx * rr2, pond.z + Math.sin(a) * pond.rz * rr2];
    }, [0.9, 1.4], 0.12, () => 0xffffff);
  }

  // build các batch voxel & tĩnh
  const leafMesh = leaves.build(root);
  trunks.build(root); stones.build(root); planks.build(root); crates.build(root); misc.build(root); pumpkins.build(root); hay.build(root); soil.build(root);
  batch.build(root);

  // điểm đậu cho quạ: hàng rào ruộng, tường nghĩa địa
  perches.push({ x: field.x0 + 2, y: 1.0, z: field.z0 - 0.5 }, { x: field.x1 + 0.5, y: 1.0, z: field.z0 + 3 }, { x: cem.x0 + 2, y: 0.8, z: cem.z1 }, { x: cem.x1, y: 0.8, z: cem.z0 + 4 });

  return {
    root, colliders, emitters, fires, smokeSources, graves, perches, lampHeads, canopies, windowMats, glowSprites,
    hideInReflection, occluders, grassMeshes, water, leafMesh, jackMat, plaza, pond, cem, field,
    houses: houseObjs,
  };
}

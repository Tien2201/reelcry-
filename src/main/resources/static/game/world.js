// Dựng ngôi làng HD-2D kiểu diorama nhìn ngang: phố lát đá (nơi chơi), tường đá kè
// có bậc thang, bậc thềm với dãy nhà khung gỗ, cầu đá vòm qua suối đổ ra ao,
// cối xay gió, nghĩa địa trên thềm cao, đồi và bầu trời phía xa.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { makeRng, spriteLit, patchMaterial, softDisc } from './pixel.js';
import * as T from './textures.js';
import { makeFireAtlas, makeJackFace, makeKite } from './sprites.js';

export const TY = 1.8;          // độ cao bậc thềm sau tường kè
export const WALL_Z = -2.0;     // mặt trước tường kè
export const BY = 3.6;          // bậc thềm phía sau
export const BACK_Z = -15;      // tường kè thứ hai
export const BOUNDS = { x0: -58, x1: 58, z0: -1.45, z1: 4.6 };
export const STREET_FRONT = 3.25;
export const STAIRS = [{ x: -38, w: 1.9 }, { x: -12.4, w: 1.9 }, { x: 33.6, w: 1.9 }];
export const STAIR_DEPTH = 1.9;
export const POND = { cx: -28, cz: 6.25, rx: 6.6, rz: 2.55, c0: -29.6, c1: -26.4 };
const XMIN = -72, XMAX = 72;

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
  constructor(map, { sway = 0, cast = true, receive = true, see = false, wrap = 0, emissive = false } = {}) {
    Object.assign(this, { map, sway, cast, receive, see, wrap, emissive });
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
  const addCircle = (x, z, r, low = false) => colliders.circles.push({ x, z, r, low });
  const addBox = (x0, z0, x1, z1, low = false) => colliders.boxes.push({ x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1), low });
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
  const pumpkins = new Voxels(tx.pumpkin);
  const hay = new Voxels(tx.hay);
  const soil = new Voxels(tx.dirt);
  const bulbs = new Voxels(null, { emissive: true });

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

  const L_ST = { x0: XMIN, z0: WALL_Z, w: XMAX - XMIN, h: 26, ppu: 16 };
  const L_TE = { x0: XMIN, z0: BACK_Z, w: XMAX - XMIN, h: WALL_Z - BACK_Z, ppu: 12 };
  const L_BA = { x0: XMIN, z0: -48, w: XMAX - XMIN, h: 48 + BACK_Z, ppu: 8 };
  const cemetery = { x0: 37, x1: 56, z0: -13.2, z1: -2.6 };
  const field = { x0: 38, x1: 51, z0: 8.5, z1: 15 };
  const camp = { x0: 18, x1: 31 };
  const stShapes = [
    { type: 'rect', kind: 2, x: XMIN, z: WALL_Z - 1, w: XMAX - XMIN, h: STREET_FRONT - WALL_Z + 1 },
    { type: 'rect', kind: 1, x: camp.x0, z: STREET_FRONT - 0.2, w: camp.x1 - camp.x0, h: 6 },
    { type: 'disc', kind: 3, x: POND.cx, z: POND.cz, rx: POND.rx + 1.2, rz: POND.rz + 1 },
    { type: 'rect', kind: 4, x: field.x0, z: field.z0, w: field.x1 - field.x0, h: field.z1 - field.z0 },
    { type: 'path', kind: 1, width: 1.6, pts: [[-6, STREET_FRONT], [-5, 9], [-7, 26]] },
    { type: 'path', kind: 1, width: 1.4, pts: [[44, STREET_FRONT], [44.5, field.z0]] },
  ];
  const teShapes = [
    { type: 'rect', kind: 1, x: XMIN, z: WALL_Z - 2.3, w: XMAX - XMIN, h: 2.3 },
    { type: 'rect', kind: 5, x: XMIN, z: BACK_Z, w: XMAX - XMIN, h: 3 },
  ];
  const graveSpots = [];
  for (let gx = 0; gx < 6; gx++) for (let gz = 0; gz < 2; gz++) {
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
  // nền bậc thềm (chừa lỗ cầu thang) + thềm sau
  {
    const parts = [flatRect(XMIN, XMAX, BACK_Z, WALL_Z - STAIR_DEPTH, TY)];
    let x = XMIN;
    for (const s of [...STAIRS].sort((a, b) => a.x - b.x)) { parts.push(flatRect(x, s.x - s.w / 2, WALL_Z - STAIR_DEPTH, WALL_Z, TY)); x = s.x + s.w / 2; }
    parts.push(flatRect(x, XMAX, WALL_Z - STAIR_DEPTH, WALL_Z, TY));
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
  {
    let x = XMIN;
    const segs = [];
    for (const s of [...STAIRS].sort((a, b) => a.x - b.x)) { segs.push([x, s.x - s.w / 2]); x = s.x + s.w / 2; }
    segs.push([x, XMAX]);
    for (const [a, b] of segs) {
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
    addBox(XMIN, WALL_Z - 3, XMAX, WALL_Z + 0.05);
  }
  for (let i = 0; i < 46; i++) {
    const x = XMIN + 4 + rng() * (XMAX - XMIN - 8);
    if (STAIRS.some((s) => Math.abs(s.x - x) < s.w)) continue;
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

  // ======================= NHÀ =======================
  function buildHouse(h) {
    const wallH = h.floors === 2 ? 5.0 : 3.2;
    const by = h.by + 0.45;
    const { x, w, d } = h;
    const z = h.zf - d / 2;
    const g = new THREE.Group();
    root.add(g);
    const fac = T.facadeTex({ w, h: wallH, floors: h.floors, style: h.style, plaster: h.plaster, shutter: h.shutter, door: h.door, ivy: h.ivy, seed: h.seed, lit: h.lit });
    const side = T.facadeTex({ w: d, h: wallH, floors: h.floors, style: h.style, plaster: h.plaster, shutter: h.shutter, door: 0, winPerFloor: 1, seed: h.seed + 50, lit: h.lit });
    const mk = (t) => {
      const m = lamb({ map: t.map, normalMap: t.normalMap });
      if (t.emissiveMap) { m.emissiveMap = t.emissiveMap; m.emissive.set('#ffb060'); m.emissiveIntensity = 2.2; windowMats.push(m); }
      m.shadowSide = THREE.DoubleSide;
      seeThrough(m);
      return m;
    };
    const mFront = mk(fac), mSide = mk(side), mBack = mk({ map: side.map, normalMap: side.normalMap });
    const roofT = roofs[h.roof];
    const mRoof = lamb({ map: roofT.map, normalMap: roofT.normalMap }); mRoof.shadowSide = THREE.DoubleSide; seeThrough(mRoof);
    const mGable = lamb({ map: tx.plank, color: '#c8b8a0' }); mGable.shadowSide = THREE.DoubleSide; seeThrough(mGable);
    const mTrim = lamb({ map: tx.bark, color: '#8a7060' }); seeThrough(mTrim);
    const mChim = lamb({ map: wallTex.map, normalMap: wallTex.normalMap }); seeThrough(mChim);
    // gộp mọi mảnh của ngôi nhà theo vật liệu (ít draw call)
    const add = (geo, mat, px, py, pz, rx = 0, ry = 0, rz = 0, order = 'XYZ', parent = null) => {
      const local = mat4(px, py, pz, rx, ry, rz, order);
      batch.add(geo, mat, parent ? parent.clone().multiply(local) : local);
    };
    batch.add(boxGeo(w + 0.5, 0.45, d + 0.5, 2, 1), mWallDark, mat4(x, h.by + 0.225, z));
    add(new THREE.PlaneGeometry(w, wallH), mFront, x, by + wallH / 2, z + d / 2);
    add(new THREE.PlaneGeometry(w, wallH), mBack, x, by + wallH / 2, z - d / 2, 0, Math.PI, 0);
    add(new THREE.PlaneGeometry(d, wallH), mSide, x + w / 2, by + wallH / 2, z, 0, Math.PI / 2, 0);
    add(new THREE.PlaneGeometry(d, wallH), mSide, x - w / 2, by + wallH / 2, z, 0, -Math.PI / 2, 0);
    const o = 0.42, slope = h.ridge === 'z' ? 0.8 : 0.72;
    const L = h.ridge === 'x' ? w : d, Sp = h.ridge === 'x' ? d : w;
    const rise = (Sp / 2) * Math.tan(slope);
    const roofG = mat4(x, by, z, 0, h.ridge === 'z' ? Math.PI / 2 : 0, 0);
    const slopeLen = (Sp / 2 + o) / Math.cos(slope);
    const yMid = wallH + rise - (slopeLen / 2) * Math.sin(slope);
    const zMid = (slopeLen / 2) * Math.cos(slope);
    const slab = boxGeo(L + 2 * o, 0.18, slopeLen, 2, 2);
    add(slab, mRoof, 0, yMid + 0.09, zMid, slope, 0, 0, 'XYZ', roofG);
    add(slab, mRoof, 0, yMid + 0.09, -zMid, slope, Math.PI, 0, 'YXZ', roofG);
    add(boxGeo(L + 2 * o + 0.1, 0.2, 0.34, 1), mTrim, 0, wallH + rise + 0.1, 0, 0, 0, 0, 'XYZ', roofG);
    add(boxGeo(L + 2 * o, 0.16, 0.14, 1), mTrim, 0, wallH - o * Math.tan(slope) + 0.02, Sp / 2 + o, 0, 0, 0, 'XYZ', roofG);
    const tri = new THREE.BufferGeometry();
    const hs = Sp / 2;
    tri.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -hs, 0, 0, hs, 0, rise, 0], 3));
    tri.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, Sp / 1.5, 0, Sp / 3, rise / 1.5], 2));
    tri.computeVertexNormals();
    for (const sgn of [1, -1]) {
      add(tri, mGable, sgn * L / 2, wallH, 0, 0, sgn > 0 ? Math.PI : 0, 0, 'XYZ', roofG);
      for (const s2 of [1, -1]) add(boxGeo(0.14, 0.18, slopeLen, 1), mTrim, sgn * (L / 2 + o), yMid + 0.13, s2 * zMid, s2 * slope, 0, 0, 'XYZ', roofG);
    }
    if (h.ridge === 'z') {
      const disc = new THREE.Mesh(new THREE.CircleGeometry(0.38, 12), lamb({ color: '#2a1a10', emissive: new THREE.Color('#ffb060'), emissiveIntensity: 2.5 }));
      disc.position.set(x, by + wallH + rise * 0.42, z + d / 2 + 0.02);
      g.add(disc); windowMats.push(disc.material); seeThrough(disc.material);
    }
    if (h.chimney !== false) {
      const cxp = x + (h.ridge === 'x' ? w * 0.27 : 0.65), czp = z - (h.ridge === 'x' ? d * 0.15 : d * 0.25);
      const top = by + wallH + rise + 0.9;
      add(boxGeo(0.7, top - (by + wallH) + 0.2, 0.7, 2, 1), mChim, cxp, (top + by + wallH) / 2, czp);
      add(boxGeo(0.86, 0.14, 0.86, 1), mTrim, cxp, top + 0.07, czp);
      smokeSources.push({ x: cxp, y: top + 0.2, z: czp, rate: 2 });
      perches.push({ x: cxp, y: top + 0.14, z: czp });
    }
    perches.push({ x: x - L * 0.25 * (h.ridge === 'x' ? 1 : 0), y: by + wallH + rise + 0.22, z });
    // hộp hoa 3D dưới cửa sổ
    const fl = ['#e8304a', '#ff7aa0', '#ffd24a', '#ffffff', '#c84ad8', '#ff8a3a'];
    for (const wn of fac.wins) {
      if (wn.state === 'boarded' || wn.state === 'broken') continue;
      const wx = x - w / 2 + (wn.x + wn.w / 2) / 16, wy = by + wallH - (wn.y + wn.h) / 16;
      planks.add(wx, wy - 0.1, z + d / 2 + 0.16, wn.w / 16 + 0.1, 0.2, 0.3, '#c89a6a');
      for (let k = 0; k < 7; k++) {
        const fx = wx - wn.w / 32 + (k + 0.5) * wn.w / 16 / 7;
        leaves.add(fx, wy + 0.06, z + d / 2 + 0.16 + (rng() - 0.5) * 0.12, 0.16, 0.16, 0.16, k % 2 ? '#3e7a2c' : '#4e8a34');
        if (rng() < 0.75) misc.add(fx + (rng() - 0.5) * 0.06, wy + 0.17 + rng() * 0.06, z + d / 2 + 0.2, 0.1, 0.1, 0.1, fl[Math.floor(rng() * fl.length)]);
      }
    }
    if (h.door) {
      const dx = x - w / 2 + h.door * w;
      batch.add(boxGeo(1.4, 0.18, 0.7, 1), mWallDark, mat4(dx, h.by + 0.36, z + d / 2 + 0.35));
      const lx = dx + 0.95, ly = by + 2.25;
      batch.add(boxGeo(0.06, 0.06, 0.3, 1), mMetal, mat4(lx, ly + 0.15, z + d / 2 + 0.15));
      const lantern = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.28, 0.2), lamb({ color: '#2a2018', emissive: new THREE.Color('#ffb050'), emissiveIntensity: 3.5 }));
      lantern.position.set(lx, ly, z + d / 2 + 0.3);
      g.add(lantern);
      const e = emit(lx, ly, z + d / 2 + 0.7, '#ffae5a', 8, 7.5, 'lamp', 'lamp');
      lampHeads.push({ x: lx, y: ly, z: z + d / 2 + 0.3, mat: lantern.material, e });
      addGlow(lx, ly, z + d / 2 + 0.34, '#ffb060', 1.1, 0.8);
    }
    const litCount = fac.wins.filter((wn) => wn.state === 'lit').length;
    if (litCount) emit(x, by + 1.4, z + d / 2 + 2.0, '#ffb466', 3 + litCount * 1.3, 8, 'window', 'none');
    if (h.sign) {
      batch.add(boxGeo(0.9, 0.08, 0.08, 1), mMetal, mat4(x + w / 2 - 1.3, by + 2.75, z + d / 2 + 0.45));
      batch.add(boxGeo(0.8, 0.55, 0.06, 0.8, 0.55), mPlank, mat4(x + w / 2 - 1.1, by + 2.4, z + d / 2 + 0.85));
    }
    return { g, def: h, wallH, rise, z, by };
  }
  const HOUSES = [
    { x: -51, zf: -5.0, w: 7, d: 5, floors: 2, ridge: 'x', roof: 'red', style: 'timber', shutter: '#3a5a7a', door: 0.3, ivy: 2, seed: 11 },
    { x: -44, zf: -5.6, w: 5.5, d: 5, floors: 1, ridge: 'z', roof: 'moss', style: 'stone', shutter: '#6a2a24', door: 0.5, seed: 21 },
    { x: -18.2, zf: -5.0, w: 7.2, d: 5, floors: 2, ridge: 'x', roof: 'red', style: 'timber', shutter: '#2e4f86', door: 0.5, plaster: ['#c8b496', '#e8d8bc', '#f8ecd6'], seed: 13 },
    { x: -6.4, zf: -5.2, w: 6.6, d: 5, floors: 1, ridge: 'x', roof: 'slate', style: 'timber', shutter: '#8a2a24', door: 0.62, plaster: ['#b0a898', '#d8d0c0', '#efe8dc'], seed: 16 },
    { x: 4.6, zf: -5.0, w: 8, d: 5, floors: 2, ridge: 'x', roof: 'red', style: 'timber', shutter: '#3a6a44', door: 0.62, sign: true, plaster: ['#c8b080', '#e6d4a8', '#f6e8c6'], seed: 17 },
    { x: 15.8, zf: -5.6, w: 6, d: 5, floors: 1, ridge: 'z', roof: 'wood', style: 'plank', shutter: '#5a4a2a', door: 0.5, seed: 14 },
    { x: 24.6, zf: -5.2, w: 6.4, d: 5, floors: 2, ridge: 'x', roof: 'slate', style: 'timber', shutter: '#7a2a2a', door: 0.4, seed: 18, ivy: 2 },
    { x: -34, zf: -16.4, w: 6.5, d: 5, floors: 2, ridge: 'x', roof: 'slate', style: 'timber', shutter: '#3a5a7a', door: 0.5, seed: 31, by: BY },
    { x: -1, zf: -16.6, w: 7, d: 5, floors: 1, ridge: 'z', roof: 'red', style: 'stone', shutter: '#3a6a44', door: 0.5, seed: 32, by: BY },
    { x: 30, zf: -16.4, w: 6, d: 5, floors: 2, ridge: 'x', roof: 'moss', style: 'timber', shutter: '#7a2a2a', door: 0.4, seed: 33, by: BY },
  ];
  const houses = HOUSES.map((h) => buildHouse({ by: TY, ...h }));

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
  tree(-27.5, -7.5, 1.35, 'oak', TY);
  tree(-58.5, -7, 1.2, 'oak2', TY);
  tree(-37.2, -9.2, 1.0, 'autumn', TY);
  tree(10.8, -9.5, 0.95, 'gold', TY);
  tree(31.5, -9, 1.0, 'pine', TY);
  tree(40, -11.5, 0.9, 'dead', TY);
  tree(52.5, -9.8, 1.0, 'dead', TY);
  for (let i = 0; i < 22; i++) {
    const x = XMIN + 3 + i * 6.4 + rng.range(-1.5, 1.5);
    if (HOUSES.some((h) => h.by === BY && Math.abs(h.x - x) < h.w / 2 + 1.5)) continue;
    if (Math.abs(x - 12) < 3) continue;
    tree(x, -20 - rng.range(0, 6), 1.15 + rng() * 0.4, rng.chance(0.3) ? 'pine' : rng.chance(0.25) ? 'autumn' : rng.chance(0.5) ? 'oak' : 'oak2', BY, VSfar);
  }
  for (let i = 0; i < 16; i++) tree(XMIN + 6 + i * 9 + rng.range(-2, 2), -31 - rng.range(0, 8), 1.4 + rng() * 0.4, rng.chance(0.4) ? 'pine' : 'oak2', BY, 0.8);
  const flowerCols = ['#e84a6a', '#f0d040', '#ffffff', '#c84ad8', null, null];
  for (let x = XMIN + 3; x < XMAX - 3; x += rng.range(2.6, 5.5)) {
    if (STAIRS.some((s) => Math.abs(s.x - x) < 2.2)) continue;
    if (x > cemetery.x0 - 1 && x < cemetery.x1) continue;
    bush(x, -3.0 - rng() * 0.8, 0.8 + rng() * 0.45, TY, rng.chance(0.5) ? TREE_COLORS.oak2 : TREE_COLORS.oak, flowerCols[Math.floor(rng() * flowerCols.length)]);
  }
  for (let x = XMIN + 2; x < XMAX - 2; x += rng.range(5, 10)) {
    if (x > POND.cx - 9 && x < POND.cx + 9) continue;
    if (x > camp.x0 - 1 && x < camp.x1 + 1) continue;
    bush(x, 5.6 + rng() * 1.5, 0.85 + rng() * 0.4, 0, rng.chance(0.5) ? TREE_COLORS.oak2 : TREE_COLORS.oak, flowerCols[Math.floor(rng() * flowerCols.length)]);
  }

  // ======================= ĐÈN =======================
  function lampPost(x, z, color = '#ffb85e', y0 = 0, h = 2.4) {
    misc.add(x, y0 + 0.12, z, 0.34, 0.24, 0.34, '#2a2a30');
    misc.add(x, y0 + h / 2, z, 0.13, h, 0.13, '#26262c');
    misc.add(x, y0 + h + 0.22, z, 0.36, 0.08, 0.36, '#1e1e24');
    const lantern = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.34, 0.28), lamb({ color: '#3a3026', emissive: new THREE.Color(color), emissiveIntensity: 4 }));
    lantern.position.set(x, y0 + h, z);
    root.add(lantern);
    const e = emit(x, y0 + h - 0.1, z + 0.1, color, 11, 9, 'lamp', rng.chance(0.15) ? 'broken' : 'lamp');
    addGlow(x, y0 + h, z + 0.05, color, 1.3, 0.75);
    lampHeads.push({ x, y: y0 + h, z, mat: lantern.material, e });
    perches.push({ x, y: y0 + h + 0.28, z });
    if (y0 === 0) addCircle(x, z, 0.2, true);
  }
  for (const x of [-52, -42, -9.5, 2.5, 14.5, 27.5, 41, 53]) lampPost(x, STREET_FRONT + 0.45);
  lampPost(POND.cx - POND.rx - 0.6, STREET_FRONT + 0.9);
  lampPost(POND.cx + POND.rx + 0.7, STREET_FRONT + 0.6);
  for (const x of [-47, -25, -1, 20, 46]) lampPost(x, -3.3, '#ffb85e', TY, 2.2);
  for (const x of [-52.5, -40.5, -34.5, -21.2, -15.5, -6.3, 2.2, 9.5, 18.2, 30.5, 45.5]) {
    misc.add(x, 1.35, WALL_Z + 0.08, 0.06, 0.06, 0.18, '#26262c');
    const ln = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.26, 0.2), lamb({ color: '#3a3026', emissive: new THREE.Color('#ffb050'), emissiveIntensity: 3.6 }));
    ln.position.set(x, 1.2, WALL_Z + 0.22);
    root.add(ln);
    const e = emit(x, 1.15, WALL_Z + 0.6, '#ffb050', 6, 6, 'lamp', 'lamp');
    lampHeads.push({ x, y: 1.2, z: WALL_Z + 0.22, mat: ln.material, e });
    addGlow(x, 1.2, WALL_Z + 0.3, '#ffb060', 0.9, 0.7);
  }
  function festoon(x0, x1, y, z) {
    const pts = [];
    const n = Math.round((x1 - x0) / 0.5);
    for (let i = 0; i <= n; i++) {
      const t = i / n, seg = (t * (x1 - x0)) % 6 / 6;
      pts.push(new THREE.Vector3(x0 + (x1 - x0) * t, y - Math.sin(seg * Math.PI) * 0.45, z));
    }
    root.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: '#1a1410' })));
    pts.forEach((p, i) => { if (i % 2 === 0) bulbs.add(p.x, p.y - 0.08, p.z, 0.1, 0.12, 0.1, i % 6 === 0 ? '#ff9a6a' : '#ffd890'); });
    for (let x = x0; x <= x1 + 0.01; x += 6) misc.add(x, y - 0.6, z, 0.08, 1.2, 0.08, '#3a2a1e');
  }
  festoon(-24, 0, TY + 1.15, WALL_Z - 0.2);
  festoon(12, 30, TY + 1.15, WALL_Z - 0.2);

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
  fire(campfire.x, campfire.z, 1.3, 42, 0.1);
  addCircle(campfire.x, campfire.z, 1.0, true);
  for (const [dx, dz, ry] of [[-2.4, 0.4, 0.2], [2.3, -0.3, -0.25]]) { trunks.add(campfire.x + dx, 0.22, campfire.z + dz, 1.5, 0.42, 0.45, '#b08a62', ry); addCircle(campfire.x + dx, campfire.z + dz, 0.55, true); }
  const fireBarrelGeo = new THREE.CylinderGeometry(0.36, 0.33, 0.9, 10), mFireBarrel = lamb({ map: tx.metal, color: '#8a5a3a' });
  for (const [x, z] of [[13.2, -1.05], [33.2, 0.2], [-55, 0.8], [47.5, -1.0]]) {
    batch.add(fireBarrelGeo, mFireBarrel, mat4(x, 0.45, z));
    fire(x, z, 0.75, 15, 0.85);
    addCircle(x, z, 0.42, true);
  }

  // ======================= ĐỒ VẬT TRÊN PHỐ =======================
  function crate(x, z, s = 0.8, y = s / 2, ry = 0) { crates.add(x, y, z, s, s, s, '#ffffff', ry); }
  const mBarrel = lamb({ map: tx.plank }), barrelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.95, 10);
  function barrel(x, z, y0 = 0) {
    batch.add(barrelGeo, mBarrel, mat4(x, y0 + 0.475, z, 0, rng() * 3, 0));
    misc.add(x, y0 + 0.25, z, 0.72, 0.05, 0.72, '#2a2a2e'); misc.add(x, y0 + 0.75, z, 0.72, 0.05, 0.72, '#2a2a2e');
    if (y0 === 0) addCircle(x, z, 0.38, true);
  }
  function bench(x, z) {
    planks.add(x, 0.45, z, 1.6, 0.08, 0.42, '#c8a070');
    planks.add(x, 0.75, z - 0.2, 1.6, 0.36, 0.06, '#c8a070');
    for (const s of [-0.65, 0.65]) misc.add(x + s, 0.22, z, 0.08, 0.44, 0.38, '#2a2a30');
    addBox(x - 0.85, z - 0.3, x + 0.85, z + 0.3, true);
  }
  for (const [x, n] of [[-10.6, 3], [7.6, 2], [29.2, 3], [-49, 2]]) for (let i = 0; i < n; i++) barrel(x + i * 0.75, -1.45 + (i % 2) * 0.1);
  barrel(-6.2, -3.4, TY); barrel(-5.5, -3.6, TY); barrel(17.6, -3.4, TY);
  bench(-2.5, -1.3); bench(19.5, -1.3); bench(-44.5, -1.3);
  for (const [x, z, st] of [[18.2, 3.2, 2], [36.2, -1.0, 3], [-31.8, -1.1, 1], [-53.5, 3.4, 2]]) {
    crate(x, z, 0.85, 0.425, rng() * 0.4);
    if (st > 1) crate(x + 0.9, z + 0.1, 0.8, 0.4, rng() * 0.4);
    if (st > 2) crate(x + 0.45, z, 0.7, 1.2, rng() * 0.6);
    addBox(x - 0.5, z - 0.5, x + (st > 1 ? 1.4 : 0.5), z + 0.5);
  }
  {
    const x = -42, z = 0.9;
    for (let i = 0; i < 12; i++) { const a = i / 12 * 6.28; stones.add(x + Math.cos(a) * 0.85, 0.4, z + Math.sin(a) * 0.85, 0.5, 0.8, 0.42, i % 2 ? '#7a7670' : '#6a6660', -a); }
    misc.add(x, 0.75, z, 1.3, 0.04, 1.3, '#0a0c10');
    for (const s of [-1, 1]) trunks.add(x + s * 0.95, 1.3, z, 0.16, 2.6, 0.16, '#5a3e28');
    trunks.add(x, 2.15, z, 2.1, 0.12, 0.12, '#5a3e28');
    planks.add(x, 2.75, z + 0.42, 2.4, 0.08, 1.0, '#9a5a3a'); planks.add(x, 2.75, z - 0.42, 2.4, 0.08, 1.0, '#9a5a3a');
    misc.add(x, 1.7, z, 0.26, 0.3, 0.26, '#6a4a2e');
    addCircle(x, z, 1.15, true);
    perches.push({ x: x + 0.3, y: 3.05, z });
  }
  {
    const x = -52.5, z = -0.6;
    planks.add(x, 0.85, z, 2.6, 0.12, 1.1, '#b08a5a');
    for (const [dx, dz] of [[-1.2, -0.5], [1.2, -0.5], [-1.2, 0.5], [1.2, 0.5]]) trunks.add(x + dx, 1.1, z + dz, 0.12, 2.2, 0.12, '#5a3e28');
    for (let i = 0; i < 6; i++) misc.add(x - 1.3 + i * 0.52, 2.25 - 0.04 * (i % 2), z + 0.1, 0.52, 0.08, 1.5, i % 2 ? '#e8e0d0' : '#c83a2a');
    for (let i = 0; i < 8; i++) (i % 2 ? pumpkins : misc).add(x - 1 + i * 0.28, 0.98, z + (rng() - 0.5) * 0.5, 0.22, 0.2, 0.22, i % 2 ? '#ffffff' : ['#d8402a', '#e8c040', '#7ab03a'][i % 3]);
    addBox(x - 1.35, z - 0.6, x + 1.35, z + 0.6);
  }
  {
    const x = 43.5, z = 0.6, paint = '#5e7a86', rust = '#7a4a2a';
    misc.add(x, 0.75, z, 4.4, 0.7, 1.9, paint);
    misc.add(x - 1.2, 1.55, z, 1.6, 0.95, 1.8, paint);
    misc.add(x - 1.25, 1.62, z + 0.91, 1.3, 0.55, 0.02, '#1a222c');
    misc.add(x - 2.02, 1.62, z, 0.02, 0.55, 1.5, '#222c38');
    misc.add(x + 1.0, 1.2, z + 0.92, 2.3, 0.22, 0.06, paint); misc.add(x + 1.0, 1.2, z - 0.92, 2.3, 0.22, 0.06, paint);
    misc.add(x + 2.18, 1.2, z, 0.06, 0.22, 1.9, paint);
    misc.add(x + 0.6, 1.12, z, 1.2, 0.2, 1.0, rust);
    for (const [wx, wz] of [[-1.4, 0.95], [-1.4, -0.95], [1.4, 0.95], [1.4, -0.95]]) misc.add(x + wx, 0.38, z + wz, 0.76, 0.76, 0.26, '#141416');
    hay.add(x + 1.0, 1.42, z + 0.2, 0.9, 0.4, 0.7, '#ffffff');
    addBox(x - 2.3, z - 1.05, x + 2.25, z + 1.05);
    perches.push({ x: x - 1.2, y: 2.05, z });
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

  // ======================= DÂY CỜ =======================
  const flagGeo = new THREE.BufferGeometry();
  flagGeo.setAttribute('position', new THREE.Float32BufferAttribute([-0.13, 0, 0, 0.13, 0, 0, 0, -0.3, 0], 3));
  flagGeo.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  flagGeo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, 0.5, 0], 2));
  const flagItems = [];
  function bunting(a, b, sag) {
    const n = Math.max(4, Math.round(a.distanceTo(b) / 0.45));
    const pts = [];
    for (let i = 0; i <= n; i++) { const t = i / n; pts.push(new THREE.Vector3().lerpVectors(a, b, t).add(new THREE.Vector3(0, -Math.sin(t * Math.PI) * sag, 0))); }
    root.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: '#2a2018' })));
    const cols = ['#d8402a', '#f0c040', '#3a7ac8', '#58a048', '#f0ece0'];
    for (let i = 1; i < n; i++) flagItems.push({ p: pts[i], c: cols[i % cols.length], ph: i * 0.7 + a.x });
  }
  const hy = TY + 0.45;
  bunting(new THREE.Vector3(-14.6, hy + 4.6, -4.95), new THREE.Vector3(-9.7, hy + 2.9, -4.9), 0.5);
  bunting(new THREE.Vector3(-3.1, hy + 2.9, -4.9), new THREE.Vector3(0.6, hy + 4.6, -4.95), 0.4);
  bunting(new THREE.Vector3(8.6, hy + 4.6, -4.95), new THREE.Vector3(12.8, hy + 2.6, -4.9), 0.45);
  bunting(new THREE.Vector3(-24, TY + 1.9, -2.3), new THREE.Vector3(-21.6, hy + 4.4, -4.95), 0.3);
  const flags = new THREE.InstancedMesh(flagGeo, spriteLit(new THREE.MeshLambertMaterial({ side: THREE.DoubleSide })), flagItems.length);
  flagItems.forEach((f, i) => flags.setColorAt(i, new THREE.Color(f.c)));
  flags.castShadow = true; flags.frustumCulled = false;
  root.add(flags);
  const FM = new THREE.Matrix4();
  animated.push((dt, t, wind) => {
    flagItems.forEach((f, i) => {
      FM.compose(f.p, Q.setFromEuler(E.set(Math.sin(t * 3 + f.ph) * 0.35 * wind + 0.1, Math.sin(t * 2.1 + f.ph) * 0.3, 0)), S3.set(1, 1, 1));
      flags.setMatrixAt(i, FM);
    });
    flags.instanceMatrix.needsUpdate = true;
  });

  // ======================= NGHĨA ĐỊA (trên thềm) =======================
  {
    for (let x = cemetery.x0; x <= cemetery.x1; x += 0.55) {
      misc.add(x, TY + 0.55, -2.35, 0.06, 1.1, 0.06, '#1e1e24');
      misc.add(x, TY + 1.14, -2.35, 0.1, 0.1, 0.1, '#1e1e24');
    }
    misc.add((cemetery.x0 + cemetery.x1) / 2, TY + 0.95, -2.35, cemetery.x1 - cemetery.x0, 0.06, 0.06, '#1e1e24');
    misc.add((cemetery.x0 + cemetery.x1) / 2, TY + 0.25, -2.35, cemetery.x1 - cemetery.x0, 0.06, 0.06, '#1e1e24');
    for (const g of graveSpots) {
      const { x, z } = g;
      const k = rng();
      if (k < 0.55) { stones.add(x, TY + 0.42, z, 0.62, 0.84, 0.2, '#8a8680', rng.range(-0.12, 0.12)); stones.add(x, TY + 0.88, z, 0.42, 0.14, 0.2, '#8a8680'); }
      else if (k < 0.85) { stones.add(x, TY + 0.5, z, 0.14, 1.0, 0.14, '#7a7670'); stones.add(x, TY + 0.72, z, 0.56, 0.14, 0.14, '#7a7670'); }
      else stones.add(x, TY + 0.25, z, 0.7, 0.5, 0.3, '#6a6660', 0.25);
      soil.add(x, TY + 0.06, z + 1.05, 0.8, 0.14, 1.5, '#ffffff');
      graves.push({ x, z: z + 1.05 });
    }
    const cx = 50.5, cz = -10.5;
    stones.add(cx, TY + 1.2, cz, 3.2, 2.4, 2.6, '#8a8680');
    stones.add(cx, TY + 2.55, cz, 3.6, 0.3, 3.0, '#6a6660');
    stones.add(cx, TY + 2.9, cz, 2.2, 0.4, 2.0, '#7a7670');
    misc.add(cx, TY + 0.85, cz + 1.31, 1.0, 1.7, 0.04, '#141414');
    stones.add(cx, TY + 3.35, cz, 0.18, 0.6, 0.18, '#8a8680'); stones.add(cx, TY + 3.45, cz, 0.5, 0.16, 0.16, '#8a8680');
    const e = emit(44, TY + 1.4, -3, '#9adf8a', 7, 7, 'lamp', 'broken');
    misc.add(44, TY + 0.7, -3.3, 0.1, 1.4, 0.1, '#26262c');
    const gl = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.26, 0.22), lamb({ color: '#202a20', emissive: new THREE.Color('#9adf8a'), emissiveIntensity: 3.5 }));
    gl.position.set(44, TY + 1.5, -3.3); root.add(gl);
    lampHeads.push({ x: 44, y: TY + 1.5, z: -3.3, mat: gl.material, e });
    addGlow(44, TY + 1.5, -3.2, '#9adf8a', 1.3, 0.8);
  }

  // ======================= RUỘNG BÍ NGÔ, HÀNG RÀO =======================
  const jack = makeJackFace();
  const jackMat = lamb({ map: jack.map, emissiveMap: jack.emissiveMap, emissive: new THREE.Color('#ffa030'), emissiveIntensity: 3, alphaTest: 0.5 });
  for (let i = 0; i < 14; i++) {
    const x = field.x0 + 1 + (i % 5) * 2.4 + rng.range(-0.3, 0.3), z = field.z0 + 1 + Math.floor(i / 5) * 2 + rng.range(-0.2, 0.2);
    const s = 0.75 + rng() * 0.35;
    for (const [a, b, c] of [[0, 0, 0], [0.5, 0, 0], [-0.5, 0, 0], [0, 0, 0.5], [0, 0, -0.5], [0, 0.45, 0], [0.32, 0.4, 0.3], [-0.32, 0.4, -0.3]])
      pumpkins.add(x + a * s * 0.8, 0.25 * s + b * s, z + c * s * 0.8, 0.5 * s, 0.5 * s, 0.5 * s, '#ffffff');
    trunks.add(x, 0.75 * s, z, 0.12, 0.25, 0.12, '#4a5a22');
    if (i % 4 === 1) {
      const f = new THREE.Mesh(new THREE.PlaneGeometry(0.42 * s, 0.42 * s), jackMat);
      f.position.set(x, 0.3 * s, z + 0.38 * s + 0.02);
      root.add(f);
      addGlow(x, 0.32 * s, z + 0.5 * s, '#ff8a20', 0.9, 0.7, 'fire');
    }
  }
  function fence(x0, x1, z) {
    const n = Math.max(1, Math.round((x1 - x0) / 1.4));
    for (let i = 0; i <= n; i++) {
      const x = x0 + (x1 - x0) * i / n;
      planks.add(x, 0.5, z, 0.16, 1.0, 0.16, '#d8c8b0');
      if (i < n) { const mx = x + (x1 - x0) / n / 2; planks.add(mx, 0.42, z, (x1 - x0) / n, 0.1, 0.07, '#e8d8c0'); planks.add(mx, 0.78, z, (x1 - x0) / n, 0.1, 0.07, '#e8d8c0'); }
    }
  }
  fence(-60, -38, 7.2); fence(-19, -1, 7.6); fence(field.x0 - 0.5, field.x1 + 0.5, field.z0 - 0.6); fence(54, 64, 7);
  for (const [x, z] of [[-35.5, -1.0], [36, 6.5], [14.6, 6.4]]) hay.add(x, 0.45, z, 1.3, 0.9, 0.9, '#ffffff', 0.15);
  addBox(-36.2, -1.5, -34.8, -0.5, true);

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
      if (STAIRS.some((s) => Math.abs(s.x - x) < s.w / 2 + 0.2 && z > WALL_Z - STAIR_DEPTH - 0.2)) return false;
      return !HOUSES.some((h) => !h.by && Math.abs(h.x - x) < h.w / 2 + 0.4 && z < h.zf + 0.4 && z > h.zf - h.d - 0.4);
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
      for (let i = 0; i < 900 * dens; i++) { const x = XMIN + rng() * (XMAX - XMIN), z = BACK_Z - 1 - rng() * 14; items.push([x, BY, z, 1.0 + rng() * 0.6, tint(x, z)]); }
      makeSet(T.fernTex(), items, 0.08);
    }
  }

  // ======================= DIỀU =======================
  const kiteAtlas = makeKite();
  const kite = new THREE.Mesh(new THREE.PlaneGeometry(kiteAtlas.w * 2.2, kiteAtlas.h * 2.2), spriteLit(lamb({ map: kiteAtlas.map, alphaTest: 0.5, side: THREE.DoubleSide })));
  root.add(kite);
  const kiteLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: '#2a2a2a' }));
  kiteLine.frustumCulled = false;
  root.add(kiteLine);

  const leafMeshes = leaves.build(root);
  for (const v of [trunks, stones, planks, crates, misc, pumpkins, hay, soil, bulbs]) v.build(root);
  batch.build(root);

  return {
    root, colliders, emitters, fires, smokeSources, graves, perches, lampHeads, canopies, windowMats, glowSprites,
    hideInReflection, grassMeshes, water, leafMeshes, animated, houses, kite, kiteLine,
    campfire, cemetery, field, pond: POND, holePts, inPoly,
    leafCount: leafMeshes.reduce((a, m) => a + m.count, 0),
  };
}

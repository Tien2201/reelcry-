// DEAD NIGHT — game sinh tồn zombie phong cách HD-2D: sprite pixel trong diorama 3D,
// camera thấp nhìn ngang, cuộn theo nhân vật dọc con phố của ngôi làng.
import * as THREE from 'three';
import { buildWorld, U, BOUNDS, TY, WALL_Z, STAIRS, STAIR_DEPTH, STREET_FRONT, POND, ZB, BUILDINGS, buildingAt, HELIPAD } from './world.js';
import { Post } from './post.js';
import { Atmos } from './atmos.js';
import { Particles, Decals, Rain, Motes, Mist, Shafts, Crows, Moths, Leaves, Sky, Butterflies, Flock, LampCones } from './fx.js';
import { makeCharacterSprites, makePickupAtlas, DIR_ROW, playerSprites, PLAYER_COLORS, makeItemIcons, makeFlowerSprite } from './sprites.js';
import { ITEMS, ITEM_ORDER, rollLoot, searchTime } from './items.js';
import { openTransport, makeCode, roomName, cleanCode, cleanName } from './net.js';
import { spriteLit, softDisc, makeRng } from './pixel.js';
import { Sound } from './audio.js';

const $ = (id) => document.getElementById(id);
const QS = new URLSearchParams(location.search);
const DBG = QS.has('shot');
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rand = (a, b) => a + Math.random() * (b - a);
const TAU = Math.PI * 2;
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; };
const isTouch = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window;
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* bỏ qua */ } },
};
let quality = store.get('deadnight_q', isTouch ? 'low' : 'high');
// chế độ pixel hoá 1x / 2x / 3x (dựng cảnh ở độ phân giải thấp rồi phóng to sắc nét)
let pixelK = clamp(Math.round(+(QS.get('pix') || store.get('deadnight_px', '1'))) || 1, 1, 3);

// Giới hạn độ sáng khi vật đứng sát đèn (tránh sprite bị cháy trắng cạnh lửa/đèn)
THREE.ShaderChunk.lights_pars_begin = THREE.ShaderChunk.lights_pars_begin.replace(
  'float distanceFalloff = 1.0 / max( pow( lightDistance, decayExponent ), 0.01 );',
  'float distanceFalloff = 1.0 / max( pow( lightDistance, decayExponent ), 1.2 );');

// ================= RENDERER / SCENE / CAMERA =================
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.NoToneMapping;
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x000000, 30, 100);
// camera thấp kiểu diorama: nhìn gần như ngang vào mặt tiền các ngôi nhà
const CAM = { y: 9.6, back: 26, lookY: 3.0, lookZ: -3.2, fov: 30 };
const camera = new THREE.PerspectiveCamera(CAM.fov, 1, 1, 260);
let camScale = 1, camInside = 0;
const post = new Post(renderer);
post.setPixel(pixelK);
const overlay = $('fx2d');
const g2 = overlay.getContext('2d');
let W = 1, H = 1, PR = 1, ODPR = 1;
function resize() {
  W = innerWidth; H = innerHeight;
  const dpr = window.devicePixelRatio || 1;
  PR = quality === 'high' ? Math.min(dpr, 1.5) : Math.min(dpr, 1) * (isTouch ? 0.85 : 1);
  renderer.setPixelRatio(PR);
  renderer.setSize(W, H, false);
  camera.aspect = W / H;
  camScale = clamp(1.75 / camera.aspect, 1, 2.3);
  camera.updateProjectionMatrix();
  const s = renderer.getDrawingBufferSize(new THREE.Vector2());
  post.setSize(s.x, s.y);
  ODPR = Math.min(dpr, 2);
  overlay.width = Math.round(W * ODPR); overlay.height = Math.round(H * ODPR);
}

// ================= ÁNH SÁNG =================
const hemi = new THREE.HemisphereLight(0xffffff, 0x000000, 0.6);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 1);
sun.castShadow = true;
const sunSize = 26;
Object.assign(sun.shadow.camera, { left: -sunSize, right: sunSize, top: sunSize, bottom: -sunSize, near: 1, far: 110 });
sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.035;
scene.add(sun, sun.target);
const flashlight = new THREE.SpotLight('#fff0d6', 0, 22, 0.44, 0.6, 1.5);
flashlight.castShadow = true;
flashlight.shadow.camera.near = 0.3; flashlight.shadow.camera.far = 22;
flashlight.shadow.bias = -0.0008; flashlight.shadow.normalBias = 0.03;
scene.add(flashlight, flashlight.target);
const muzzleLight = new THREE.PointLight('#ffc070', 0, 11, 1.6);
scene.add(muzzleLight);
const aura = new THREE.PointLight('#ffd8b0', 0, 5, 2);
scene.add(aura);
let pool = [];
function setupShadowsAndPool() {
  const hi = quality === 'high';
  sun.shadow.mapSize.set(hi ? 2048 : 1024, hi ? 2048 : 1024);
  flashlight.shadow.mapSize.set(hi ? 1024 : 512, hi ? 1024 : 512);
  if (!pool.length) for (let i = 0; i < 10; i++) { const l = new THREE.PointLight(0xffffff, 0, 8, 2); scene.add(l); pool.push(l); }
}

const sound = new Sound();
const atmos = new Atmos();

let world, fx = {}, SPR, camQuat = new THREE.Quaternion();
const camTarget = new THREE.Vector3(0, 1, 1);
const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3();

function placeCamera(shake = 0) {
  const r = () => (Math.random() - 0.5) * shake;
  const cs = camScale * (state.mode === 'view' ? view.zoom : 1) * (1 - 0.1 * camInside);
  camera.position.set(camTarget.x + r(), CAM.lookY + (CAM.y - CAM.lookY) * cs + r(), CAM.lookZ + (CAM.back - CAM.lookZ) * cs);
  camera.lookAt(camTarget.x + r() * 0.3, CAM.lookY, CAM.lookZ);
}

// ---------- sprite nhân vật ----------
const blobTex = softDisc(64, 0.15, 1.6);
const blobMat = new THREE.MeshBasicMaterial({ map: blobTex, color: 0x000000, transparent: true, opacity: 0.5, depthWrite: false });
const blobGeo = new THREE.PlaneGeometry(1, 1);
function makeSprite(atlasList, xray) {
  const maps = atlasList.map((a) => { const m = a.map.clone(); m.needsUpdate = true; m.repeat.set(1 / 4, 1 / 4); return m; });
  const a0 = atlasList[0];
  let emap = null;
  if (a0.emissiveMap) { emap = a0.emissiveMap.clone(); emap.needsUpdate = true; emap.repeat.set(1 / 4, 1 / 4); }
  const mat = new THREE.MeshLambertMaterial({ map: maps[0], alphaTest: 0.5, side: THREE.DoubleSide });
  if (emap) { mat.emissiveMap = emap; mat.emissive.set(0xffffff); mat.emissiveIntensity = 3.2; }
  spriteLit(mat);
  const geo = new THREE.PlaneGeometry(a0.w, a0.h); geo.translate(0, a0.h / 2, 0);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: maps[0], alphaTest: 0.5 });
  mesh.customDepthMaterial = depth;
  const xmat = new THREE.MeshBasicMaterial({ map: maps[0], alphaTest: 0.5, color: xray, transparent: true, opacity: 0.6, depthFunc: THREE.GreaterDepth, depthWrite: false, fog: false });
  const xr = new THREE.Mesh(geo, xmat);
  xr.renderOrder = 20;
  mesh.add(xr);
  const blob = new THREE.Mesh(blobGeo, blobMat);
  blob.rotation.x = -Math.PI / 2; blob.position.y = 0.035;
  blob.scale.set(a0.w * 0.85, a0.w * 0.55, 1);
  blob.renderOrder = 1;
  const group = new THREE.Group();
  group.add(mesh, blob);
  scene.add(group);
  if (world) world.hideInReflection.push(xr, blob);
  return { group, mesh, mat, maps, emap, depth, xr, xmat, blob, cur: 0, w: a0.w, h: a0.h };
}
function setFrame(s, dir, frame) {
  const ox = frame / 4, oy = 1 - (DIR_ROW[dir] + 1) / 4;
  s.maps[s.cur].offset.set(ox, oy);
  if (s.emap) s.emap.offset.set(ox, oy);
}
function setSpriteMap(s, i) {
  if (s.cur === i) return;
  s.cur = i;
  s.mat.map = s.maps[i]; s.depth.map = s.maps[i]; s.xmat.map = s.maps[i];
}
function dirFromAngle(a) {
  if (a > -Math.PI / 4 && a <= Math.PI / 4) return 'right';
  if (a > Math.PI / 4 && a <= 3 * Math.PI / 4) return 'down';
  if (a > -3 * Math.PI / 4 && a <= -Math.PI / 4) return 'up';
  return 'left';
}

// ================= TRẠNG THÁI GAME =================
const WEAPONS = [
  { key: 'knife', name: 'DAO', melee: true, dmg: 45, rate: 0.4, reach: 1.5, arc: 1.05, mag: 0, shake: 0.05 },
  { key: 'pistol', name: 'SÚNG LỤC', dmg: 34, rate: 0.26, mag: 12, reload: 1.0, spread: 0.035, pellets: 1, speed: 38, kick: 0.06, shake: 0.12, ammo: 'ammo9', noise: 15 },
  { key: 'shotgun', name: 'SHOTGUN', dmg: 20, rate: 0.78, mag: 6, reload: 1.6, spread: 0.2, pellets: 8, speed: 32, kick: 0.2, shake: 0.4, ammo: 'shells', noise: 19 },
  { key: 'smg', name: 'TIỂU LIÊN', dmg: 17, rate: 0.075, mag: 32, reload: 1.4, spread: 0.07, pellets: 1, speed: 40, kick: 0.05, shake: 0.08, ammo: 'ammo9', noise: 17 },
];
const CORPSE_LIFE = 60;
let zid = 0;
const ZT = {
  walker: { r: 0.36, speed: [1.0, 1.5], hp: 60, dmg: 10, score: 10, atk: 0.9, hpW: 6 },
  runner: { r: 0.33, speed: [2.7, 3.2], hp: 40, dmg: 8, score: 15, atk: 0.75, hpW: 4 },
  brute: { r: 0.62, speed: [0.85, 1.05], hp: 320, dmg: 25, score: 50, atk: 1.2, hpW: 30 },
};
const state = { mode: 'loading', paused: false };
let player, zombies = [], bullets = [], pickups = [], floaters = [];
let wave = 0, toSpawn = 0, spawnTimer = 0, intermission = 0, kills = 0, score = 0, shake = 0, gtime = 0;
let hurtFlash = 0, lightning = 0, lightningT = 8, thunderQ = [], playStart = 0;
// pha trong ngày: dusk (chiều tà) → night (đêm, zombie tấn công) → dawn (rạng đông) → day (nghỉ ngơi)
let phase = 'title', phaseT = 0, dayNo = 0, nightKills = 0, nightTotal = 1, hourFrom = 0, strayT = 0, dayStartHour = 6.9;
// độ dài một ván: ngày (lục soát) và đêm (cầm cự) tính bằng giây thực
const DURATIONS = {
  short: { name: 'Ngắn', day: 100, night: 90, est: '~10 phút' },
  normal: { name: 'Vừa', day: 150, night: 120, est: '~15–20 phút' },
  long: { name: 'Dài', day: 240, night: 170, est: '~30 phút' },
};
let durKey = DURATIONS[store.get('deadnight_dur', 'normal')] ? store.get('deadnight_dur', 'normal') : 'normal';
let DAY_LEN = DURATIONS[durKey].day, NIGHT_LEN = DURATIONS[durKey].night;
const DUSK_LEN = 14, DAWN_LEN = 7;
let nightCleared = false;
const zPool = {};
let tracerMesh, pickupAtlas, glowTex, beam;

// ================= INPUT =================
const keys = {};
const mouse = { x: 0, y: 0, down: false, has: false };
const sticks = { move: null, aim: null };
addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
  if (state.mode === 'view') { viewKey(e.code); return; }
  if (state.mode !== 'play') return;
  if (e.code === 'KeyI' || e.code === 'Tab') { e.preventDefault(); toggleBag(); return; }
  if (bagOpen) return;
  if (e.code === 'KeyR') reload();
  if (e.code === 'Digit1') switchWeapon(0);
  if (e.code === 'Digit2') switchWeapon(1);
  if (e.code === 'Digit3') switchWeapon(2);
  if (e.code === 'Digit4') switchWeapon(3);
  if (e.code === 'KeyQ') cycleWeapon();
  if (e.code === 'KeyF') quickHeal();
  if (e.code === 'KeyC') quickEat();
  if (e.code === 'KeyV') quickAntidote();
  if (e.code === 'KeyM') sound.muted = !sound.muted;
  if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
canvas.addEventListener('mousemove', (e) => {
  if (view.drag) { view.pan -= (e.clientX - view.drag.x) * viewPxToWorld(); view.drag.x = e.clientX; }
  mouse.x = e.clientX; mouse.y = e.clientY; mouse.has = true;
});
canvas.addEventListener('mousedown', (e) => { sound.init(); if (state.mode === 'view') { view.drag = { x: e.clientX }; return; } if (e.button === 0) mouse.down = true; });
addEventListener('mouseup', () => { mouse.down = false; view.drag = null; });
canvas.addEventListener('wheel', (e) => {
  if (state.mode === 'view') view.zoom = clamp(view.zoom * (1 + e.deltaY * 0.0012), 0.5, 1.8);
  else if (state.mode === 'play') cycleWeapon();
}, { passive: true });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('blur', () => { mouse.down = false; for (const k in keys) keys[k] = false; if (state.mode === 'play' && !state.paused) togglePause(); });
function onTouch(e) {
  e.preventDefault(); sound.init();
  for (const t of e.changedTouches) {
    const st = { id: t.identifier, ox: t.clientX, oy: t.clientY, x: t.clientX, y: t.clientY, lx: t.clientX };
    if (t.clientX < W / 2) { if (!sticks.move) sticks.move = st; } else if (!sticks.aim) sticks.aim = st;
  }
}
function onTouchMove(e) {
  e.preventDefault();
  if (state.mode === 'view' && e.touches.length >= 2) {
    const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    if (!view.pinch) view.pinch = { d0: d, z0: view.zoom };
    view.zoom = clamp(view.pinch.z0 * view.pinch.d0 / Math.max(20, d), 0.5, 1.8);
    return;
  }
  for (const t of e.changedTouches) for (const k of ['move', 'aim']) if (sticks[k] && sticks[k].id === t.identifier) { sticks[k].x = t.clientX; sticks[k].y = t.clientY; }
}
function onTouchEnd(e) {
  if (e.touches.length < 2) view.pinch = null;
  for (const t of e.changedTouches) for (const k of ['move', 'aim']) if (sticks[k] && sticks[k].id === t.identifier) sticks[k] = null;
}
canvas.addEventListener('touchstart', onTouch, { passive: false });
canvas.addEventListener('touchmove', onTouchMove, { passive: false });
canvas.addEventListener('touchend', onTouchEnd);
canvas.addEventListener('touchcancel', onTouchEnd);
function stickVec(st, max = 56) {
  if (!st) return { x: 0, y: 0, m: 0 };
  let dx = st.x - st.ox, dy = st.y - st.oy;
  const d = Math.hypot(dx, dy);
  if (d > max) { st.ox = st.x - dx / d * max; st.oy = st.y - dy / d * max; dx = dx / d * max; dy = dy / d * max; }
  return d < 5 ? { x: 0, y: 0, m: 0 } : { x: dx / Math.min(d, max), y: dy / Math.min(d, max), m: Math.min(d, max) / max };
}
// màn hình → điểm ngắm: mặt phẳng ngang ngang tầm súng, nếu chỉ lên cao thì lấy điểm trên mặt tường kè
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
const planeH = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1), planeV = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
function aimPoint(sx, sy) {
  ndc.set(sx / W * 2 - 1, -(sy / H) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const zmin = curBuilding ? ZB + 0.2 : WALL_Z - 0.4;
  const p = ray.ray.intersectPlane(planeH, tmpV2);
  if (p && p.z > zmin) return p;
  planeV.constant = -zmin;
  return ray.ray.intersectPlane(planeV, tmpV2);
}

// ================= VA CHẠM =================
function collide(o) {
  let hit = false;
  const C = world.colliders;
  for (let i = 0; i < C.circles.length; i++) {
    const c = C.circles[i];
    const dx = o.x - c.x, dz = o.z - c.z, rr = o.r + c.r;
    if (dx > rr || dx < -rr || dz > rr || dz < -rr) continue;
    const d2 = dx * dx + dz * dz;
    if (d2 < rr * rr) { const d = Math.sqrt(d2) || 1e-4; o.x += dx / d * (rr - d); o.z += dz / d * (rr - d); hit = true; }
  }
  for (let i = 0; i < C.boxes.length; i++) {
    const b = C.boxes[i];
    if (o.x < b.x0 - o.r || o.x > b.x1 + o.r || o.z < b.z0 - o.r || o.z > b.z1 + o.r) continue;
    const nx = clamp(o.x, b.x0, b.x1), nz = clamp(o.z, b.z0, b.z1);
    const dx = o.x - nx, dz = o.z - nz, d2 = dx * dx + dz * dz;
    if (d2 < o.r * o.r) {
      if (d2 === 0) {
        const l = o.x - b.x0, r = b.x1 - o.x, t = o.z - b.z0, bb = b.z1 - o.z, m = Math.min(l, r, t, bb);
        if (m === l) o.x = b.x0 - o.r; else if (m === r) o.x = b.x1 + o.r; else if (m === t) o.z = b.z0 - o.r; else o.z = b.z1 + o.r;
      } else { const d = Math.sqrt(d2); o.x += dx / d * (o.r - d); o.z += dz / d * (o.r - d); }
      hit = true;
    }
  }
  o.x = clamp(o.x, BOUNDS.x0, BOUNDS.x1); o.z = clamp(o.z, BOUNDS.z0, BOUNDS.z1);
  return hit;
}
function bulletBlocked(x, z) {
  const C = world.colliders;
  for (const c of C.circles) { if (c.low) continue; const dx = x - c.x, dz = z - c.z; if (dx * dx + dz * dz < c.r * c.r) return true; }
  for (const b of C.boxes) if (!b.low && x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1) return true;
  return false;
}
function insideSolid(x, z, pad = 0.4) {
  const C = world.colliders;
  for (const c of C.circles) if (Math.hypot(x - c.x, z - c.z) < c.r + pad) return true;
  for (const b of C.boxes) if (x > b.x0 - pad && x < b.x1 + pad && z > b.z0 - pad && z < b.z1 + pad) return true;
  return false;
}

// ================= TÌM ĐƯỜNG (flow field BFS từ vị trí người chơi) =================
const NAV = { res: 0.5, w: 0, h: 0, block: null, dist: null, queue: null, cell: -1 };
const N8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
function navBuild() {
  NAV.w = Math.round((BOUNDS.x1 - BOUNDS.x0) / NAV.res) + 1;
  NAV.h = Math.round((BOUNDS.z1 - BOUNDS.z0) / NAV.res) + 1;
  const n = NAV.w * NAV.h;
  NAV.block = new Uint8Array(n); NAV.dist = new Int32Array(n); NAV.queue = new Int32Array(n);
  for (let j = 0; j < NAV.h; j++)
    for (let i = 0; i < NAV.w; i++) {
      const x = BOUNDS.x0 + i * NAV.res, z = BOUNDS.z0 + j * NAV.res;
      if (insideSolid(x, z, 0.3)) NAV.block[j * NAV.w + i] = 1;
    }
  NAV.cell = -1;
}
function navCell(x, z) {
  const i = clamp(Math.round((x - BOUNDS.x0) / NAV.res), 0, NAV.w - 1), j = clamp(Math.round((z - BOUNDS.z0) / NAV.res), 0, NAV.h - 1);
  return j * NAV.w + i;
}
function navCompute() {
  const cells = TG.map((t) => navCell(t.x, t.z));
  const key = cells.join(',');
  if (key === NAV.cell) return;
  NAV.cell = key;
  const { w, h, block, dist, queue } = NAV;
  dist.fill(-1);
  let head = 0, tail = 0;
  for (const c of cells) if (dist[c] !== 0) { dist[c] = 0; queue[tail++] = c; }
  while (head < tail) {
    const c = queue[head++], ci = c % w, cj = (c / w) | 0, d = dist[c] + 1;
    for (let k = 0; k < 8; k++) {
      const ni = ci + N8[k][0], nj = cj + N8[k][1];
      if (ni < 0 || nj < 0 || ni >= w || nj >= h) continue;
      const nc = nj * w + ni;
      if (dist[nc] !== -1 || block[nc]) continue;
      if (k >= 4 && (block[cj * w + ni] || block[nj * w + ci])) continue;
      dist[nc] = d; queue[tail++] = nc;
    }
  }
}
const navOut = { x: 0, z: 0 };
function navDir(z) {
  const { w, h, dist } = NAV;
  const c = navCell(z.x, z.z), ci = c % w, cj = (c / w) | 0;
  let best = -1, bd = dist[c] >= 0 ? dist[c] : 1e9;
  for (let k = 0; k < 8; k++) {
    const ni = ci + N8[k][0], nj = cj + N8[k][1];
    if (ni < 0 || nj < 0 || ni >= w || nj >= h) continue;
    const nd = dist[nj * w + ni];
    if (nd >= 0 && nd < bd) { bd = nd; best = k; }
  }
  if (best < 0) return false;
  const tx = BOUNDS.x0 + (ci + N8[best][0]) * NAV.res, tz = BOUNDS.z0 + (cj + N8[best][1]) * NAV.res;
  const dx = tx - z.x, dz = tz - z.z, l = Math.hypot(dx, dz) || 1;
  navOut.x = dx / l; navOut.z = dz / l;
  return true;
}
function navLOS(x0, z0, x1, z1) {
  const d = Math.hypot(x1 - x0, z1 - z0), n = Math.ceil(d / 0.35);
  for (let i = 1; i < n; i++) { const t = i / n; if (NAV.block[navCell(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t)]) return false; }
  return true;
}

// ================= NGƯỜI CHƠI & VŨ KHÍ =================
function newPlayer() {
  const sp = player ? player.sprite : makeSprite([SPR.player.knife, SPR.player.pistol, SPR.player.shotgun, SPR.player.smg], '#7ad8ff');
  return {
    x: -1.5, z: 1.0, r: 0.36, hp: 100, maxHp: 100, stamina: 1, speed: 4.3, food: 85, water: 85, starve: 0,
    aim: 0, dir: 'right', weapon: 1, cooldown: 0, reloading: 0, walk: 0, recoil: 0, inv: 0, moving: false, stepT: 0,
    guns: WEAPONS.map((w, i) => ({ owned: i <= 1, ammo: i === 1 ? w.mag : 0 })),
    bag: { ammo9: 24, shells: 0, bandage: 1, medkit: 0, food: 1, water: 1, fuel: 0, part: 0, key: 0, antibio: 0, syringe: 0, antidote: 0, flower: 0 },
    looted: new Set(), lootCount: 0, action: null, swing: 0, searching: false,
    infected: 0, zombie: false, picked: new Set(), groanT: 0, coughT: 12,
    sprite: sp,
  };
}
const curGun = () => player.guns[player.weapon];
function switchWeapon(i) {
  if (!player.guns[i].owned || i === player.weapon) return;
  player.weapon = i; player.reloading = 0; player.cooldown = 0.25;
  setSpriteMap(player.sprite, i);
  sound.reload(); hud.dirty = true;
}
function cycleWeapon() {
  for (let k = 1; k <= WEAPONS.length; k++) { const i = (player.weapon + k) % WEAPONS.length; if (player.guns[i].owned) { switchWeapon(i); return; } }
}
const reserveOf = (i) => (WEAPONS[i].melee ? Infinity : player.bag[WEAPONS[i].ammo] || 0);
function reload() {
  const g = curGun(), w = WEAPONS[player.weapon];
  if (w.melee || player.reloading > 0 || player.action || g.ammo >= w.mag || reserveOf(player.weapon) <= 0) return;
  player.reloading = w.reload; sound.reload(); hud.dirty = true;
}
function muzzlePos(out) {
  return out.set(player.x + Math.cos(player.aim) * 0.75, 1.0, player.z + Math.sin(player.aim) * 0.75);
}
let muzzleT = 0;
function shoot() {
  const g = curGun(), w = WEAPONS[player.weapon];
  if (w.melee) { melee(); return; }
  if (player.cooldown > 0 || player.reloading > 0 || player.action) return;
  if (g.ammo <= 0) {
    sound.empty(); player.cooldown = 0.3;
    if (reserveOf(player.weapon) > 0) reload();
    else { floaters.push({ x: player.x, y: 2.3, z: player.z, text: 'HẾT ĐẠN', t: 1.0, color: '#ff8a6a' }); if (++player.dryFire > 2) { player.dryFire = 0; switchWeapon(0); } }
    return;
  }
  player.dryFire = 0;
  g.ammo--; player.cooldown = w.rate; player.recoil = w.kick; hud.dirty = true;
  makeNoise(player.x, player.z, w.noise);
  // hỗ trợ ngắm: góc nhìn thấp khó ngắm theo chiều sâu, nên hút nhẹ về zombie gần hướng bắn
  let aim = player.aim, bestDa = 0.24;
  for (const z of zombies) {
    if (z.y > 0.3 || (z.state !== 'walk' && z.state !== 'rise' && z.state !== 'wade')) continue;
    const dx = z.x - player.x, dz = z.z - player.z, d = Math.hypot(dx, dz);
    if (d > 17 || d < 0.3) continue;
    const da = Math.abs(angDiff(Math.atan2(dz, dx), player.aim)) - Math.min(0.1, 0.5 / d);
    if (da < bestDa) { bestDa = da; aim = Math.atan2(dz, dx); }
  }
  const m = muzzlePos(tmpV);
  for (let i = 0; i < w.pellets; i++) {
    const a = aim + rand(-w.spread, w.spread) * (w.pellets > 1 ? 1 : 0.6);
    const sp = w.speed * rand(0.92, 1.05);
    bullets.push({ x: m.x, z: m.z, px: m.x, pz: m.z, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, dmg: w.dmg, life: 0.6, pierce: w.pellets > 1 ? 0 : 1 });
  }
  muzzleLight.position.copy(m); muzzleLight.intensity = 45;
  muzzleT = 0.06;
  shake = Math.max(shake, w.shake);
  for (let i = 0; i < 6; i++) { const a = aim + rand(-0.5, 0.5), s = rand(3, 8); fx.spark.spawn(m.x, m.y, m.z, Math.cos(a) * s, rand(-0.5, 1.5), Math.sin(a) * s, rand(0.06, 0.14), 0.07, '#ffd890', { grav: 0, drag: 6, mode: 1 }); }
  const sa = aim + Math.PI / 2 * (Math.random() < 0.5 ? 1 : -1);
  fx.lit.spawn(player.x, 1.0, player.z, Math.cos(sa) * rand(1.5, 2.5), rand(2, 3), Math.sin(sa) * rand(1.5, 2.5), 2.5, 0.07, '#d8b050', { grav: 12, drag: 1, bounce: 0.35, spin: 14 });
  sound.shoot(w.key);
  fx.crows.scare(player.x, player.z, 14);
  if (g.ammo === 0) reload();
}
// chém dao: trúng tối đa 3 zombie trong cung trước mặt
function melee() {
  const w = WEAPONS[0];
  if (player.cooldown > 0 || player.action) return;
  player.cooldown = w.rate; player.swing = 0.2; player.stamina = Math.max(0, player.stamina - 0.05);
  let hits = 0;
  for (const z of zombies) {
    if (!hittable(z)) continue;
    const dx = z.x - player.x, dz = z.z - player.z, d = Math.hypot(dx, dz);
    if (d > w.reach + z.r || Math.abs(angDiff(Math.atan2(dz, dx), player.aim)) > w.arc) continue;
    damageZombie(z, w.dmg, Math.atan2(dz, dx), 0.55);
    if (++hits >= 3) break;
  }
  for (let i = 0; i < 10; i++) {
    const a = player.aim + (i / 9 - 0.5) * 2 * w.arc * 0.85, r = 0.95 + Math.random() * 0.2;
    fx.spark.spawn(player.x + Math.cos(a) * r, 1.0 + (i / 9 - 0.5) * 0.3, player.z + Math.sin(a) * r, Math.cos(a + 1.4) * 2.2, 0, Math.sin(a + 1.4) * 2.2, 0.12, 0.06, '#e8f0ff', { grav: 0, drag: 9, mode: 1 });
  }
  sound.swing(hits > 0);
  shake = Math.max(shake, hits ? 0.14 : 0.03);
  makeNoise(player.x, player.z, 4);
}
function hittable(z) { return z.state !== 'dead' && z.y <= 0.3 && !(z.state === 'rise' && (z.riseLevel > 0.3 || z.t < 0.6)); }
function damageZombie(z, dmg, a, kb, cx = z.x, cz = z.z, remote = false) {
  const client = net.active && !net.host;
  z.hp -= dmg; z.hitT = 0.1;
  if (client) { z.predT = 0.6; const h = net.hits.get(z.id) || { dmg: 0, a }; h.dmg += dmg; h.a = a; net.hits.set(z.id, h); }
  else if (!z.aggro) wake(z);
  if (z.state === 'walk' && !client) { const k = z.type === 'brute' ? kb * 0.25 : kb; z.x += Math.cos(a) * k; z.z += Math.sin(a) * k; }
  for (let k = 0; k < 7; k++) {
    const aa = a + rand(-0.8, 0.8), sp = rand(1, 4.5);
    fx.blood.spawn(cx, rand(0.7, 1.3), cz, Math.cos(aa) * sp, rand(0, 2.5), Math.sin(aa) * sp, 1.6, rand(0.05, 0.1), Math.random() < 0.5 ? '#7a0e0c' : '#a51c16', { grav: 11, drag: 0.8 });
  }
  sound.hit(cx, cz);
  if (!remote) floaters.push({ x: z.x + rand(-0.3, 0.3), y: 2.2, z: z.z, text: String(dmg), t: 0.55, color: '#ffffff' });
  if (z.hp <= 0 && !client) killZombie(z, a);
}
function wake(z) { if (z.aggro) return; z.aggro = true; z.sprite.xr.visible = true; if (Math.random() < 0.7) sound.groan(z.x, z.z, z.type === 'brute'); }
function makeNoise(x, z, r, remote = false) {
  if (net.active && !net.host) { if (!remote) netEvent('n', Math.round(x * 10), Math.round(z * 10), Math.round(r)); return; }
  for (const zz of zombies) if (!zz.aggro && zz.state === 'walk' && Math.hypot(zz.x - x, zz.z - z) < r) wake(zz);
}

// ================= ZOMBIE =================
function spriteFor(skin) {
  const p = zPool[skin] || (zPool[skin] = []);
  if (p.length) { const s = p.pop(); s.group.visible = true; return s; }
  const list = SPR.zombies[skin];
  return makeSprite([list[Math.floor(Math.random() * list.length)]], '#ff4a4a');
}
function releaseSprite(z) {
  const s = z.sprite;
  s.group.visible = false;
  s.mesh.rotation.set(0, 0, 0); s.group.position.y = 0; s.xr.visible = true; s.blob.visible = true;
  s.mat.color.setScalar(1);
  (zPool[z.skin] || (zPool[z.skin] = [])).push(s);
}
function pickType() {
  const r = Math.random();
  if (wave >= 4 && r < 0.06 + wave * 0.012) return 'brute';
  if (wave >= 2 && r < 0.36) return 'runner';
  return 'walker';
}
function newZombie(type, x, y, z, st, o = {}) {
  const T = ZT[type];
  const hp = T.hp + wave * T.hpW + (o.variant === 'soldier' ? 30 : 0);
  const skin = o.variant || type;
  const zz = {
    id: ++zid, type, skin, x, y, z, r: T.r, speed: rand(T.speed[0], T.speed[1]) * (1 + Math.min(wave, 10) * 0.025), hp, maxHp: hp, dmg: T.dmg, score: T.score, atkT: 0, atkCd: T.atk,
    walk: rand(0, 4), dir: 'down', hitT: 0, stuck: 0, side: Math.random() < 0.5 ? 1 : -1, state: st, t: 0, sprite: spriteFor(skin),
    aggro: o.aggro !== false, home: { x, z }, lootKind: 'z_' + skin, looted: false,
  };
  zz.sprite.group.position.set(x, y, z);
  zz.sprite.xr.visible = zz.aggro;
  zombies.push(zz);
  return zz;
}
// chọn điểm nhảy/bậc thang gần người chơi cho zombie đi trên thềm
// các đoạn bậc thềm không có toà nhà (zombie đi trên thềm rồi nhảy xuống / xuống bậc thang)
const TERRACE_SEGS = (() => {
  const out = []; let x = BOUNDS.x0;
  for (const b of [...BUILDINGS].sort((a, c) => a.x0 - c.x0)) { if (b.x0 - x > 2.4) out.push([x + 0.6, b.x0 - 0.6]); x = b.x1; }
  if (BOUNDS.x1 - x > 2.4) out.push([x + 0.6, BOUNDS.x1 - 0.6]);
  return out;
})();
const segOf = (x) => TERRACE_SEGS.find(([a, b]) => x >= a && x <= b);
function terracePlan(z) {
  const seg = segOf(z.x) || TERRACE_SEGS[0];
  const near = STAIRS.filter((s) => s.x > seg[0] && s.x < seg[1]);
  if (near.length && Math.random() < 0.5) {
    const s = near[Math.floor(Math.random() * near.length)];
    z.tx = s.x; z.stair = s;
  } else {
    let tx = clamp((z.refX ?? player.x) + rand(-5, 5), seg[0], seg[1]);
    for (let k = 0; k < 6 && STAIRS.some((s) => Math.abs(s.x - tx) < 1.6); k++) tx = clamp(tx + 2 * (k % 2 ? -k : k), seg[0], seg[1]);
    z.tx = tx; z.stair = null;
  }
}
let TG = [];
function computeTargets() {
  TG = [];
  if (playerAlive()) TG.push({ x: player.x, z: player.z, me: true, b: curBuilding });
  if (net.active) netTargetsInto(TG);
}
function spawnRef() { return TG.length ? TG[Math.floor(Math.random() * TG.length)] : player; }
function spawnZombie(stray = false) {
  const player = spawnRef();
  const type = stray ? 'walker' : pickType();
  const roll = stray ? 1 : Math.random();
  const nearPond = Math.abs(player.x - POND.cx) < 18;
  const nearCem = player.x > 36;
  const segs = TERRACE_SEGS.filter(([a, b]) => b > player.x - 24 && a < player.x + 24);
  if (roll < 0.34 && segs.length) {
    // đi trên bậc thềm phía sau rồi nhảy xuống / xuống bậc thang
    const [a, b] = segs[Math.floor(Math.random() * segs.length)];
    let x = rand(a, b);
    if (Math.abs(x - player.x) < 6) x = Math.abs(a - player.x) > Math.abs(b - player.x) ? a : b;
    const z = newZombie(type, x, TY, WALL_Z - 1.3 - Math.random() * 0.9, 'terrace');
    z.refX = player.x;
    terracePlan(z);
    return true;
  }
  if (roll < 0.46 && nearCem) {
    const g = world.graves[Math.floor(Math.random() * world.graves.length)];
    const z = newZombie(type, g.x + rand(-0.2, 0.2), TY, g.z, 'rise');
    z.riseLevel = TY; z.sprite.group.position.y = TY - z.sprite.h;
    sound.rise(z.x, z.z);
    return true;
  }
  if (roll < 0.58 && nearPond) {
    // trồi lên từ mặt ao rồi lội vào bờ
    const x = Math.random() < 0.5 ? rand(POND.cx - 5, POND.c0 - 0.6) : rand(POND.c1 + 0.6, POND.cx + 5);
    const z = newZombie(type, x, -0.6, POND.cz + rand(-0.6, 0.8), 'rise');
    z.riseLevel = -0.6; z.sprite.group.position.y = -0.6 - z.sprite.h;
    sound.rise(x, z.z);
    for (let i = 0; i < 12; i++) fx.spark.spawn(x + rand(-0.4, 0.4), -0.8, z.z + rand(-0.3, 0.3), rand(-1, 1), rand(1.5, 3.5), rand(-0.5, 0.5), 0.7, 0.07, '#7aa0b8', { grav: 9, mode: 1 });
    return true;
  }
  // từ hai đầu phố
  const side = Math.random() < 0.5 ? -1 : 1;
  let x = player.x + side * rand(15, 21);
  if (x < BOUNDS.x0 || x > BOUNDS.x1) x = player.x - side * rand(15, 21);
  x = clamp(x, BOUNDS.x0 + 0.5, BOUNDS.x1 - 0.5);
  let z = rand(WALL_Z + 0.5, BOUNDS.z1 - 0.4);
  for (let k = 0; k < 8 && insideSolid(x, z, 0.5); k++) z = rand(WALL_Z + 0.5, BOUNDS.z1 - 0.4);
  newZombie(type, x, 0, z, 'walk');
  return true;
}
function killZombie(z, ang) {
  kills++; score += z.score * Math.max(1, wave);
  if (phase === 'night') nightKills++;
  z.state = 'dead'; z.t = 0;
  z.sprite.xr.visible = false; z.sprite.blob.visible = false;
  fx.decals.add(z.x, z.z, z.type === 'brute' ? 2.4 : 1.7);
  for (let i = 0; i < (z.type === 'brute' ? 36 : 20); i++) {
    const a = ang + rand(-1.1, 1.1), s = rand(1.5, 5.5);
    fx.blood.spawn(z.x, rand(0.6, 1.4), z.z, Math.cos(a) * s, rand(1, 4), Math.sin(a) * s, 2, rand(0.06, 0.13), Math.random() < 0.5 ? '#7a0e0c' : '#a01814', { grav: 11, drag: 0.6 });
  }
  hud.dirty = true;
}
function addPickup(x, z, type, life = 22) {
  const map = pickupAtlas.map.clone(); map.needsUpdate = true; map.repeat.set(0.5, 1); map.offset.set(type === 'med' ? 0.5 : 0, 0);
  const mat = spriteLit(new THREE.MeshLambertMaterial({ map, alphaTest: 0.5, side: THREE.DoubleSide, emissive: new THREE.Color(0.35, 0.35, 0.35), emissiveMap: map }));
  const geo = new THREE.PlaneGeometry(pickupAtlas.w * 1.2, pickupAtlas.h * 1.2); geo.translate(0, pickupAtlas.h * 0.6, 0);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, 0.1, z); mesh.quaternion.copy(camQuat);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: type === 'med' ? new THREE.Color(1.2, 0.35, 0.3) : new THREE.Color(1.1, 0.9, 0.35), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  glow.scale.set(1.3, 1.3, 1); glow.position.set(0, 0.5, -0.05);
  mesh.add(glow);
  scene.add(mesh);
  pickups.push({ x, z, type, t: life, mesh });
}

// ================= SÓNG / ĐÊM / NGÀY =================
function rollNightWeather() {
  if (wave % 5 === 0) return 'blood';
  if (wave === 1) return 'clear';
  const r = Math.random();
  return r < 0.17 ? 'storm' : r < 0.34 ? 'rain' : r < 0.48 ? 'fog' : 'clear';
}
function nextWave() {
  wave++;
  phase = 'night'; phaseT = 0;
  toSpawn = Math.min(Math.round((8 + wave * 4) * (NIGHT_LEN / 120) * (Q.called ? 1.6 : 1)), 90);
  nightTotal = toSpawn; nightKills = 0; nightCleared = false;
  spawnTimer = 2.5; intermission = 0;
  atmos.hour = Math.max(atmos.hour, 19.6);
  hourFrom = atmos.hour;
  atmos.setWeather(rollNightWeather());
  showMsg(`ĐÊM ${wave}`, atmos.weatherName + ' · zombie kéo tới!');
  sound.wave();
  hud.dirty = true;
}
function startDawn() {
  phase = 'dawn'; phaseT = 0; hourFrom = atmos.hour;
  if (Q.called && !Q.heli) setTimeout(() => { if (state.mode === 'play') heliArrive(); }, 3500);
  showMsg('TRỜI SÁNG', `Đã sống sót đêm ${wave}`);
  score += wave * 100; hud.dirty = true;
  atmos.setWeather('clear');
}
function startDay(first = false) {
  phase = 'day'; phaseT = 0; strayT = 4;
  if (!first) { dayNo++; restock(); }
  const r = Math.random();
  atmos.setWeather(first ? 'clear' : r < 0.25 ? 'rain' : r < 0.35 ? 'fog' : 'clear');
  showMsg(`NGÀY ${dayNo}`, first ? 'Lục soát thị trấn · tìm cách gọi cứu hộ' : atmos.kind === 'rain' ? 'Mưa rào · tranh thủ lục soát' : 'Trời sáng · tranh thủ lục soát');
}
// zombie nấp sẵn trong các toà nhà (chỉ lao ra khi thấy người hoặc nghe tiếng súng)
const LURKERS = { kiosk: 1, garage: 1, houseA: 1, grocery: 2, pharmacy: 1, houseB: 1, radio: 1, police: 3 };
function spawnLurkers() {
  for (const b of world.buildings) {
    for (let i = 0; i < (LURKERS[b.id] || 0); i++) {
      for (let k = 0; k < 16; k++) {
        const x = rand(b.x0 + 0.7, b.x1 - 0.7), z = rand(ZB + 0.9, WALL_Z - 0.9);
        if (insideSolid(x, z, 0.45) || Math.abs(x - b.door) < 0.8) continue;
        newZombie(b.id !== 'police' && Math.random() < 0.25 ? 'runner' : 'walker', x, 0, z, 'walk', { aggro: false, variant: b.id === 'police' ? 'cop' : null });
        break;
      }
    }
  }
  for (let i = 0; i < 2; i++) newZombie('walker', rand(19.5, 26), 0, rand(-1.0, 1.6), 'walk', { aggro: false, variant: 'soldier' });
}
// zombie lang thang ban ngày (chưa phát hiện người chơi)
function spawnStray() {
  const player = spawnRef();
  const side = Math.random() < 0.5 ? -1 : 1;
  let x = player.x + side * rand(16, 24);
  if (x < BOUNDS.x0 + 1 || x > BOUNDS.x1 - 1) x = player.x - side * rand(16, 24);
  x = clamp(x, BOUNDS.x0 + 1, BOUNDS.x1 - 1);
  let z = rand(WALL_Z + 0.5, BOUNDS.z1 - 0.4);
  for (let k = 0; k < 8 && insideSolid(x, z, 0.5); k++) z = rand(WALL_Z + 0.5, BOUNDS.z1 - 0.4);
  const zz = newZombie(Math.random() < 0.2 ? 'runner' : 'walker', x, 0, z, 'walk', { aggro: false, variant: Math.random() < 0.12 ? 'cop' : null });
  zz.home = { x: clamp(x + side * -6, BOUNDS.x0 + 1, BOUNDS.x1 - 1), z, roam: true };
}
function startDusk() {
  phase = 'dusk'; phaseT = 0; hourFrom = atmos.hour;
  showMsg('CHIỀU TÀ', 'Màn đêm sắp buông xuống…');
  if (atmos.kind === 'rain' && Math.random() < 0.6) atmos.setWeather('clear');
}
function updatePhase(dt) {
  phaseT += dt;
  if (phase === 'night') {
    // đêm dài cố định; hạ hết đợt zombie (không tính zombie còn nấp trong nhà) thì trời mau sáng
    const cleared = toSpawn <= 0 && !zombies.some((z) => z.state !== 'dead' && z.aggro);
    if (cleared && !nightCleared && phaseT > 8) { nightCleared = true; phaseT = Math.max(phaseT, NIGHT_LEN - 6); }
    atmos.hour = 19.6 + 9.9 * Math.min(1, phaseT / NIGHT_LEN);
    if (phaseT >= NIGHT_LEN) startDawn();
  } else if (phase === 'dawn') {
    const k = Math.min(1, phaseT / DAWN_LEN);
    atmos.hour = hourFrom + (30.9 - hourFrom) * k;
    if (k >= 1) { atmos.hour = 6.9; dayStartHour = 6.9; startDay(); }
  } else if (phase === 'day') {
    atmos.hour = dayStartHour + (16.4 - dayStartHour) * Math.min(1, phaseT / DAY_LEN);
    strayT -= dt;
    if (strayT <= 0) {
      strayT = rand(8, 13);
      if (zombies.filter((z) => z.state !== 'dead' && !z.aggro).length < 5 + Math.min(4, dayNo)) spawnStray();
    }
    if (phaseT >= DAY_LEN) startDusk();
  } else if (phase === 'dusk') {
    const k = Math.min(1, phaseT / DUSK_LEN);
    atmos.hour = hourFrom + (19.6 - hourFrom) * k;
    if (k >= 1) nextWave();
  }
}
let msgTimer = 0;
function showMsg(title, sub) {
  $('msg-title').textContent = title; $('msg-sub').textContent = sub;
  const el = $('msg'); el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  msgTimer = 3;
}

// ================= NHIỆM VỤ: GỌI CỨU HỘ =================
// đến đồn cảnh sát → đổ xăng máy phát → lắp 2 linh kiện bộ đàm → gọi cứu hộ
// → cầm cự tới bình minh → lên trực thăng ở bãi đáp
// ================= CO-OP (đồng bộ qua presence của kênh "room") =================
// Chủ phòng (người vào sớm nhất) mô phỏng zombie, giờ giấc, thời tiết, nhiệm vụ;
// mọi người gửi vị trí + phát trúng/âm thanh/nhiệm vụ dưới dạng sự kiện trong presence.
const net = {
  active: false, host: true, transport: null, pending: true, room: null, code: '', me: null, joinT: 0, name: '',
  seq: 0, out: [], hits: new Map(), players: new Map(), hostPeer: null, sendT: 0, snapT: 0, lastW: 0, zmap: new Map(),
  colorIdx: 0, unsub: null, lobbyUnsub: null, lastAd: '', started: false, k: 0,
};
const SKINS = ['walker', 'runner', 'brute', 'cop', 'soldier'];
const ZST = ['walk', 'terrace', 'edge', 'drop', 'stairtop', 'stairs', 'wade', 'rise', 'dead'];
const PH = ['day', 'dusk', 'night', 'dawn', 'shot', 'title'];
const WX = ['clear', 'rain', 'storm', 'fog', 'blood'];
function netEvent(...ev) { net.out.push({ t: performance.now(), ev: [++net.seq, ...ev] }); }
function setCoopNote(t) { $('lobby-note').textContent = t; }
function updateCoopBtn() {
  const b = $('coop-btn');
  b.textContent = net.pending ? 'CO-OP…' : 'CO-OP';
  b.classList.toggle('dim', !net.pending && !net.transport);
}
function openLobby() {
  $('title').classList.add('hidden');
  $('lobby').classList.remove('hidden');
  $('nick').value = net.name || store.get('deadnight_nick', '') || ('Người sống sót ' + (10 + Math.floor(Math.random() * 89)));
  showLobbyPane(net.room ? 'room' : 'main');
  if (net.pending) setCoopNote('Đang kết nối kênh co-op…');
  else if (!net.transport) setCoopNote('Co-op chỉ chạy khi mở game bằng link artifact trên Claude. Bạn bè cần tài khoản Claude và được bạn chia sẻ link (nút Share).');
  else setCoopNote('Tạo phòng rồi gửi MÃ PHÒNG cho bạn bè, hoặc bấm vào phòng đang mở bên dưới.');
  renderOpenGames();
}
function closeLobby() { $('lobby').classList.add('hidden'); if (state.mode === 'title') $('title').classList.remove('hidden'); }
function showLobbyPane(which) { $('lobby-main').classList.toggle('hidden', which !== 'main'); $('lobby-room').classList.toggle('hidden', which !== 'room'); }
function watchLobby() {
  if (!net.transport || net.lobbyUnsub) return;
  net.lobbyUnsub = net.transport.lobby.onPeers(() => renderOpenGames());
}
function renderOpenGames() {
  const el = $('open-games');
  if (!el) return;
  el.innerHTML = '';
  if (!net.transport) return;
  const games = net.transport.lobby.peers().filter((p) => !p.sameTab && p.presence && p.presence.g && p.presence.g.c);
  if (!games.length) { el.textContent = 'Chưa có phòng nào đang mở.'; return; }
  for (const p of games.slice(0, 6)) {
    const g = p.presence.g;
    const b = document.createElement('button');
    b.className = 'btn ghost';
    b.textContent = `Phòng ${cleanCode(String(g.c))} · ${cleanName(String(g.h || ''))} · ${Math.min(4, +g.n || 1)} người${g.s === 'play' ? ' · đang chơi' : ''}`;
    b.addEventListener('click', () => joinRoom(cleanCode(String(g.c))));
    el.appendChild(b);
  }
}
async function joinRoom(code, creating = false) {
  if (!net.transport) return;
  code = cleanCode(code);
  if (code.length !== 4) { setCoopNote('Mã phòng gồm 4 ký tự.'); return; }
  net.name = cleanName($('nick').value);
  store.set('deadnight_nick', net.name);
  setCoopNote(creating ? 'Đang tạo phòng…' : 'Đang vào phòng ' + code + '…');
  try {
    if (net.room) await leaveRoom();
    const room = await net.transport.join(roomName(code));
    Object.assign(net, { room, code, joinT: Date.now(), seq: 0, out: [], players: new Map(), zmap: new Map(), lastW: 0, started: false, hostPeer: null });
    await room.presence({ v: 1, n: net.name, j: net.joinT, p: null, e: [], w: null });
    net.unsub = room.onPeers(() => { refreshHost(); renderRoom(); });
    $('room-code').textContent = code;
    showLobbyPane('room');
    setCoopNote(creating ? 'Gửi mã phòng cho bạn bè. Khi đủ người, chủ phòng bấm BẮT ĐẦU.' : 'Đã vào phòng. Chờ chủ phòng bắt đầu…');
    refreshHost(); renderRoom();
  } catch (e) {
    setCoopNote('Không vào được phòng (' + ((e && e.code) || 'lỗi kết nối') + ').');
  }
}
async function leaveRoom() {
  const r = net.room;
  if (net.unsub) net.unsub();
  net.unsub = null; net.room = null; net.active = false; net.host = true; net.started = false;
  for (const rp of net.players.values()) { if (rp.sp) scene.remove(rp.sp.group); if (rp.zsp) scene.remove(rp.zsp.group); }
  net.players.clear();
  if (net.transport) net.transport.lobby.presence({ g: null }).catch(() => {});
  net.lastAd = '';
  if (r) await r.leave().catch(() => {});
  showLobbyPane('main');
}
function roomMembers() {
  if (!net.room) return [];
  const list = [];
  for (const p of net.room.peers()) {
    const pz = p.presence || {};
    if (p.sameTab) { if (net.me !== p.peer) net.me = p.peer; list.push({ peer: p.peer, me: true, n: net.name, j: net.joinT }); continue; }
    if (pz.v !== 1 || typeof pz.j !== 'number') continue;
    list.push({ peer: p.peer, me: false, n: cleanName(String(pz.n || '')), j: pz.j, pz });
  }
  list.sort((a, b) => a.j - b.j || (a.peer < b.peer ? -1 : 1));
  return list.slice(0, 4);
}
function refreshHost() {
  const m = roomMembers();
  if (!m.length) return;
  const newHost = m[0].peer;
  const wasHost = net.host;
  net.hostPeer = newHost;
  net.host = m[0].me;
  net.colorIdx = Math.max(0, m.findIndex((x) => x.me));
  if (net.active && net.host && !wasHost) becomeHost();
  if (!net.host && net.room) net.room.presence({ w: null }).catch(() => {});
  advertise(m.length);
}
function advertise(n) {
  if (!net.transport || !net.room) return;
  const ad = net.host ? JSON.stringify({ c: net.code, n, h: net.name, s: net.started ? 'play' : 'wait' }) : '';
  if (ad === net.lastAd) return;
  net.lastAd = ad;
  net.transport.lobby.presence({ g: ad ? JSON.parse(ad) : null }).catch(() => {});
}
function renderRoom() {
  if (!net.room) return;
  const m = roomMembers();
  const el = $('room-players');
  el.innerHTML = '';
  m.forEach((x, i) => {
    const d = document.createElement('div');
    d.style.color = PLAYER_COLORS[i];
    d.textContent = `${i === 0 ? '★ ' : '• '}${x.n}${x.me ? ' (bạn)' : ''}${i === 0 ? ' — chủ phòng' : ''}`;
    el.appendChild(d);
  });
  $('go-btn').classList.toggle('hidden', !net.host || net.started);
  // khách vào phòng: tự vào game khi chủ phòng đã bắt đầu
  if (!net.host && !net.started) {
    const h = m.find((x) => x.peer === net.hostPeer);
    if (h && h.pz && h.pz.w && h.pz.w.st === 'play') startCoop(false);
  }
}
function startCoop(asHost) {
  if (!net.room || net.started) return;
  net.started = true; net.active = true;
  $('lobby').classList.add('hidden');
  startGame();
  setPlayerSkin(net.colorIdx);
  if (!asHost) {
    for (const z of zombies) releaseSprite(z);
    zombies = []; net.zmap.clear();
    player.x = 35.2 + rand(-1.5, 1.5); player.z = 0.8;
  }
  advertise(roomMembers().length);
  showMsg(asHost ? 'CO-OP' : 'ĐÃ VÀO PHÒNG ' + net.code, 'Lục soát cùng nhau · gọi trực thăng cứu hộ');
}
function clientRestart() {
  startGame();
  for (const z of zombies) releaseSprite(z);
  zombies = []; net.zmap.clear();
  player.x = 35.2 + rand(-1.5, 1.5); player.z = 0.8;
  showMsg('CHƠI LẠI', 'Chủ phòng đã bắt đầu ván mới');
}
let skinIdx = 0;
function setPlayerSkin(i) {
  if (i === skinIdx) return;
  skinIdx = i;
  const set = playerSprites(i);
  const old = player.sprite;
  scene.remove(old.group);
  player.sprite = makeSprite([set.knife, set.pistol, set.shotgun, set.smg], '#7ad8ff');
  setSpriteMap(player.sprite, player.weapon);
}
// chủ phòng cũ rời đi: dựng lại zombie đầy đủ từ ảnh chụp cuối cùng
function becomeHost() {
  for (const z of zombies) {
    if (z.state === 'dead') continue;
    z.x = z.tx ?? z.x; z.z = z.tz ?? z.z;
    if (z.state !== 'walk' && z.state !== 'dead') { z.state = 'walk'; z.y = 0; }
  }
  showMsg('BẠN LÀ CHỦ PHÒNG', 'Chủ phòng cũ đã rời đi');
}
function netTargetsInto(list) {
  for (const rp of net.players.values()) if (rp.alive) list.push({ x: rp.x, z: rp.z, me: false, b: buildingAt(rp.x, rp.z) });
}
function netTick(dt) {
  if (!net.active || !net.room) return;
  // nhận
  const seen = new Set();
  for (const p of net.room.peers()) {
    if (p.sameTab) { net.me = p.peer; continue; }
    const pz = p.presence || {};
    if (pz.v !== 1) continue;
    seen.add(p.peer);
    let rp = net.players.get(p.peer);
    if (!rp) { rp = { peer: p.peer, x: 0, z: 0, tx: 0, tz: 0, aim: 0, weapon: 1, flags: 0, hp: 100, lastSeq: 0, walk: 0, fireT: 0, inited: false }; net.players.set(p.peer, rp); }
    rp.name = cleanName(String(pz.n || '')); rp.j = pz.j;
    const a = pz.p;
    if (Array.isArray(a) && a.length >= 6) {
      rp.tx = clamp(+a[0] / 100 || 0, BOUNDS.x0 - 2, BOUNDS.x1 + 2); rp.tz = clamp(+a[1] / 100 || 0, BOUNDS.z0 - 2, BOUNDS.z1 + 2);
      rp.aim = +a[2] / 100 || 0; rp.weapon = clamp(a[3] | 0, 0, 3); rp.flags = a[4] | 0; rp.hp = a[5] | 0; rp.inf = a[6] | 0;
      if (!rp.inited) { rp.x = rp.tx; rp.z = rp.tz; rp.inited = true; }
    }
    rp.alive = rp.inited && !(rp.flags & (4 | 8 | 16 | 128));
    if (Array.isArray(pz.e)) handleEvents(rp, pz.e);
    if (!net.host && p.peer === net.hostPeer && pz.w && pz.w.t !== net.lastW) { net.lastW = pz.w.t; applySnapshot(pz.w); }
  }
  for (const [k, rp] of net.players) if (!seen.has(k)) { if (rp.sp) scene.remove(rp.sp.group); if (rp.zsp) scene.remove(rp.zsp.group); net.players.delete(k); refreshHost(); }
  updateRemote(dt);
  // gửi
  net.sendT -= dt;
  if (net.sendT > 0) return;
  net.sendT = 1 / 12;
  for (const [id, h] of net.hits) netEvent('h', id, Math.round(h.dmg), Math.round(h.a * 100));
  net.hits.clear();
  const now = performance.now();
  // giữ sự kiện tới khi đã gửi đủ vài lần (presence chỉ giữ giá trị mới nhất, có thể bị gộp)
  net.out = net.out.filter((e) => now - e.t < 700 || (e.sent || 0) < 4).slice(-24);
  for (const e of net.out) e.sent = (e.sent || 0) + 1;
  const flags = (player.moving ? 1 : 0) | (player.firing ? 2 : 0) | (player.downed > 0 ? 4 : 0) | (player.dead ? 8 : 0) | (player.boarded ? 16 : 0) | (player.searching ? 32 : 0) | (player.infected > 0 ? 64 : 0) | (player.zombie ? 128 : 0);
  const patch = { v: 1, n: net.name, j: net.joinT, p: [Math.round(player.x * 100), Math.round(player.z * 100), Math.round(player.aim * 100), player.weapon, flags, Math.max(0, Math.round(player.hp)), Math.ceil(player.infected)], e: net.out.map((e) => e.ev) };
  if (net.host) {
    net.snapT -= 1 / 12;
    if (net.snapT <= 0) { net.snapT = 1 / 8; patch.w = makeSnapshot(JSON.stringify(patch).length); }
  }
  net.room.presence(patch).catch(() => {});
}
function handleEvents(rp, list) {
  for (const ev of list) {
    if (!Array.isArray(ev) || typeof ev[0] !== 'number' || ev[0] <= rp.lastSeq) continue;
    rp.lastSeq = ev[0];
    const type = ev[1];
    if (type === 'h' && net.host) {
      const z = zombies.find((zz) => zz.id === ev[2]);
      if (z && hittable(z)) damageZombie(z, clamp(+ev[3] || 0, 0, 400), (+ev[4] || 0) / 100, 0.16, z.x, z.z, true);
    } else if (type === 'n' && net.host) makeNoise(+ev[2] / 10, +ev[3] / 10, clamp(+ev[4] || 0, 0, 40), true);
    else if (type === 'q' && net.host) questApply(String(ev[2]), +ev[3] || 0, rp);
    else if (type === 'rv' && ev[2] === net.me && player.downed > 0) revived(rp);
    else if (type === 'fl' && ev[2] === net.me && player.zombie) unzombie(rp);
    else if (type === 'cure' && ev[2] === net.me && player.infected > 0) cureInfection(rp.name);
    else if (type === 'gr') { rp.pingT = 6; sound.groan(rp.x, rp.z, true); }
  }
}
function makeSnapshot(base) {
  const z = [];
  for (const o of zombies) if (o.state !== 'dead') z.push(o.id, Math.round(o.x * 10), Math.round(o.z * 10), Math.round(o.sprite.group.position.y * 10), SKINS.indexOf(o.skin), ZST.indexOf(o.state), Math.round(clamp(o.hp / o.maxHp, 0, 1) * 99), o.aggro ? 1 : 0);
  let dead = 0;
  for (const o of zombies) if (o.state === 'dead' && o.t < CORPSE_LIFE - 3 && dead < 20) { dead++; z.push(o.id, Math.round(o.x * 10), Math.round(o.z * 10), 0, SKINS.indexOf(o.skin), 8, 0, 0); }
  const h = Q.heli;
  const w = {
    t: Date.now(), st: state.mode === 'over' ? 'over' : 'play', ph: PH.indexOf(phase), hr: Math.round(atmos.hour * 100), wx: WX.indexOf(atmos.kind), d: dayNo, wv: wave, ts: toSpawn, k: kills,
    q: [Q.found ? 1 : 0, Q.parts, Q.called ? 1 : 0, h ? ['in', 'wait', 'out'].indexOf(h.stage) + 1 : 0, h ? Math.ceil(h.left) : 0, Q.won ? 1 : 0],
    pw: power ? 1 : 0, ar: world.pois.armory.open ? 1 : 0, g: net.gameId, dl: [DAY_LEN, NIGHT_LEN], z,
  };
  // giữ presence dưới 4 KiB
  while (z.length > 8 && base + JSON.stringify(w).length > 3900) z.splice(z.length - 8, 8);
  return w;
}
function applySnapshot(w) {
  if (!w || typeof w !== 'object') return;
  if (w.g !== undefined) {
    if (net.gameSeen && w.g !== net.gameSeen && w.st === 'play') { net.gameSeen = w.g; clientRestart(); return; }
    net.gameSeen = w.g;
  }
  if (w.st === 'over' && state.mode === 'play') { gameOver('CẢ ĐỘI ĐÃ GỤC NGÃ'); return; }
  const ph = PH[w.ph] || phase;
  if (ph !== phase) {
    if (ph === 'night') { wave = w.wv; showMsg(`ĐÊM ${w.wv}`, 'Zombie kéo tới!'); sound.wave(); }
    else if (ph === 'dawn') showMsg('TRỜI SÁNG', `Đã sống sót đêm ${w.wv}`);
    else if (ph === 'day') { dayNo = w.d; showMsg(`NGÀY ${w.d}`, 'Tranh thủ lục soát'); restock(); }
    else if (ph === 'dusk') showMsg('CHIỀU TÀ', 'Màn đêm sắp buông xuống…');
    phase = ph;
  }
  const hr = (+w.hr || 0) / 100;
  if (Math.abs(hr - atmos.hour) > 1.5) atmos.hour = hr; else atmos.hour += (hr - atmos.hour) * 0.5;
  const wk = WX[w.wx] || 'clear';
  if (wk !== atmos.kind) atmos.setWeather(wk);
  dayNo = w.d | 0; wave = w.wv | 0; toSpawn = w.ts | 0; kills = w.k | 0;
  if (Array.isArray(w.dl)) { DAY_LEN = clamp(+w.dl[0] || 150, 30, 600); NIGHT_LEN = clamp(+w.dl[1] || 120, 30, 600); }
  // nhiệm vụ chung
  const q = Array.isArray(w.q) ? w.q : [];
  if (q[0] && !Q.found) { Q.found = true; showMsg('BỘ ĐÀM HỎNG', 'Cần xăng cho máy phát & 2 linh kiện để gọi cứu hộ'); }
  if ((q[1] | 0) > Q.parts) { Q.parts = q[1] | 0; lootFeed('part', `Đã lắp linh kiện (${Q.parts}/2)`); }
  if (q[2] && !Q.called) { Q.called = true; showMsg('ĐÃ GỌI CỨU HỘ', 'Trực thăng tới lúc bình minh!'); sound.radio(); }
  if (!q[2] && Q.called && !q[3]) Q.called = false;
  if (w.pw && !power) powerOn(false);
  if (w.ar && !world.pois.armory.open) unlockArmory(false);
  const hs = q[3] | 0;
  if (hs && !Q.heli) heliArrive();
  if (Q.heli) {
    if (hs === 2 && Q.heli.stage === 'in') Q.heli.stage = 'wait';
    if (hs === 2) Q.heli.left = q[4] | 0;
    if ((hs === 3 || !hs) && Q.heli.stage !== 'out') { Q.heli.stage = 'out'; Q.heli.t = 0; Q.won = !!q[5]; }
  }
  // zombie
  const a = Array.isArray(w.z) ? w.z : [];
  const seen = new Set();
  for (let i = 0; i + 7 < a.length; i += 8) {
    const id = a[i] | 0, skin = SKINS[a[i + 4]] || 'walker', st = ZST[a[i + 5]] || 'walk';
    seen.add(id);
    let z = net.zmap.get(id);
    if (!z) {
      if (st === 'dead') continue;
      z = newZombie(skin === 'runner' || skin === 'brute' ? skin : 'walker', a[i + 1] / 10, a[i + 3] / 10, a[i + 2] / 10, st, { variant: skin === 'cop' || skin === 'soldier' ? skin : null });
      z.id = id; net.zmap.set(id, z);
    }
    z.tx = a[i + 1] / 10; z.tz = a[i + 2] / 10; z.ty = a[i + 3] / 10;
    if (st === 'dead') { if (z.state !== 'dead') clientKill(z); }
    else {
      z.state = st;
      if (!(z.predT > 0)) z.hp = (a[i + 6] / 99) * z.maxHp;
      const ag = !!a[i + 7];
      if (ag !== z.aggro) { z.aggro = ag; z.sprite.xr.visible = ag; }
    }
  }
  for (const z of zombies) if (!seen.has(z.id) && z.state !== 'dead') z.gone = true;
}
function clientKill(z) {
  z.state = 'dead'; z.t = 0;
  z.sprite.xr.visible = false; z.sprite.blob.visible = false;
  fx.decals.add(z.x, z.z, z.type === 'brute' ? 2.4 : 1.7);
  for (let i = 0; i < 16; i++) { const a = Math.random() * TAU, sp = rand(1.5, 5); fx.blood.spawn(z.x, rand(0.6, 1.4), z.z, Math.cos(a) * sp, rand(1, 4), Math.sin(a) * sp, 2, rand(0.06, 0.12), Math.random() < 0.5 ? '#7a0e0c' : '#a01814', { grav: 11, drag: 0.6 }); }
}
// zombie phía khách: chỉ nội suy theo ảnh chụp của chủ phòng; tự tính sát thương lên chính mình
function clientZombies(dt) {
  for (let i = 0; i < zombies.length; i++) {
    const z = zombies[i], s = z.sprite;
    z.t += dt; z.predT = (z.predT || 0) - dt;
    if (z.state === 'dead') {
      const k = Math.min(1, z.t / 0.35);
      s.mesh.rotation.x = -k * k * Math.PI / 2;
      s.group.position.set(z.x, 0, z.z);
      if (z.t > CORPSE_LIFE - 2) s.group.position.y = -(z.t - (CORPSE_LIFE - 2)) * 0.4;
      if (z.t > CORPSE_LIFE) { net.zmap.delete(z.id); releaseSprite(z); zombies.splice(i, 1); i--; }
      continue;
    }
    if (z.gone) { net.zmap.delete(z.id); releaseSprite(z); zombies.splice(i, 1); i--; continue; }
    const k = Math.min(1, dt * 9), ox = z.x, oz = z.z;
    z.x += ((z.tx ?? z.x) - z.x) * k; z.z += ((z.tz ?? z.z) - z.z) * k; z.y += ((z.ty ?? z.y) - z.y) * k;
    const mv = Math.hypot(z.x - ox, z.z - oz);
    z.walk += mv * 2.6;
    if (mv > 0.003) z.dir = dirFromAngle(Math.atan2(z.z - oz, z.x - ox));
    z.hitT -= dt;
    if (z.aggro && z.state === 'walk' && playerAlive()) {
      const d = Math.hypot(player.x - z.x, player.z - z.z);
      if (d < 3) z.dir = dirFromAngle(Math.atan2(player.z - z.z, player.x - z.x));
      z.atkT -= dt;
      if (d < z.r + player.r + 0.3 && z.atkT <= 0) { z.atkT = z.atkCd; hurtPlayer(z, d); if (state.mode !== 'play') return; }
    }
    setFrame(s, z.state === 'rise' ? 'down' : z.dir, Math.floor(z.state === 'rise' ? z.t * 6 : z.walk) % 4);
    s.group.position.set(z.x, z.y, z.z);
    s.mat.color.setScalar(z.hitT > 0 ? 3 : 1);
  }
}
// người chơi khác: nội suy vị trí, hoạt ảnh, bắn (chỉ hiệu ứng)
function updateRemote(dt) {
  for (const rp of net.players.values()) {
    if (!rp.inited) continue;
    if (!rp.sp) {
      const idx = Math.max(0, roomMembers().findIndex((m) => m.peer === rp.peer));
      rp.color = idx;
      const set = playerSprites(idx);
      rp.sp = makeSprite([set.knife, set.pistol, set.shotgun, set.smg], PLAYER_COLORS[idx]);
    }
    const k = Math.min(1, dt * 10), ox = rp.x, oz = rp.z;
    rp.x += (rp.tx - rp.x) * k; rp.z += (rp.tz - rp.z) * k;
    rp.walk += Math.hypot(rp.x - ox, rp.z - oz) * 1.6;
    const sp = rp.sp;
    rp.pingT = Math.max(0, (rp.pingT || 0) - dt);
    const zf = !!(rp.flags & 128);
    if (zf && !rp.zsp) { const list = SPR.zombies.walker; rp.zsp = makeSprite([list[(rp.color || 0) % list.length]], PLAYER_COLORS[rp.color || 0]); }
    if (rp.zsp) {
      rp.zsp.group.visible = zf;
      if (zf) { setFrame(rp.zsp, dirFromAngle(rp.aim), rp.flags & 1 ? Math.floor(rp.walk) % 4 : 0); rp.zsp.group.position.set(rp.x, 0, rp.z); }
    }
    sp.group.visible = !(rp.flags & (8 | 16)) && !zf;
    sp.mat.color.setRGB(rp.flags & 64 ? 0.78 : 1, 1, rp.flags & 64 ? 0.75 : 1);
    setSpriteMap(sp, rp.weapon);
    const down = rp.flags & 4;
    sp.mesh.rotation.x = down ? -Math.PI / 2 : 0;
    setFrame(sp, rp.flags & 32 ? 'up' : dirFromAngle(rp.aim), rp.flags & 1 ? Math.floor(rp.walk) % 4 : 0);
    sp.group.position.set(rp.x, down ? 0.05 : 0, rp.z);
    rp.fireT -= dt;
    if (rp.flags & 2 && !down && rp.fireT <= 0) {
      const w = WEAPONS[rp.weapon];
      rp.fireT = w.melee ? w.rate : w.rate;
      const a = rp.aim, mx = rp.x + Math.cos(a) * 0.75, mz = rp.z + Math.sin(a) * 0.75;
      if (w.melee) { for (let i = 0; i < 6; i++) { const aa = a + (i / 5 - 0.5) * 1.6; fx.spark.spawn(rp.x + Math.cos(aa), 1.0, rp.z + Math.sin(aa), 0, 0, 0, 0.1, 0.06, '#e8f0ff', { grav: 0, drag: 9, mode: 1 }); } }
      else {
        for (let i = 0; i < w.pellets; i++) { const aa = a + rand(-w.spread, w.spread); bullets.push({ x: mx, z: mz, px: mx, pz: mz, vx: Math.cos(aa) * w.speed, vz: Math.sin(aa) * w.speed, dmg: 0, life: 0.6, pierce: 0, cosmetic: true }); }
        for (let i = 0; i < 4; i++) fx.spark.spawn(mx, 1.0, mz, Math.cos(a) * rand(3, 7), rand(-0.5, 1), Math.sin(a) * rand(3, 7), rand(0.06, 0.12), 0.07, '#ffd890', { grav: 0, drag: 6, mode: 1 });
        if (Math.abs(rp.x - player.x) < 26) sound.shoot(w.key);
      }
    }
  }
}
function playerAlive() { return state.mode === 'play' && !(player.downed > 0) && !player.dead && !player.boarded && !player.zombie; }
function hurtPlayer(z, d) {
  if (player.inv > 0) return;
  player.hp -= z.dmg; player.inv = 0.35; hurtFlash = 0.5;
  player.action = null; interact.t = 0;
  shake = Math.max(shake, z.type === 'brute' ? 0.6 : 0.3);
  sound.hurt();
  fx.decals.add(player.x + rand(-0.3, 0.3), player.z + rand(-0.3, 0.3), 0.7);
  const kb = z.type === 'brute' ? 1.1 : 0.4;
  player.x += (player.x - z.x) / (d || 1) * kb; player.z += (player.z - z.z) / (d || 1) * kb; collide(player);
  hud.dirty = true;
  if (player.hp <= 0) { playerDied(); return; }
  infectPlayer(z);
}
function playerDied() {
  if (!net.active) { gameOver(); return; }
  if (player.downed > 0 || player.dead || player.zombie) return;
  player.hp = 0; player.downed = 35; player.action = null; player.searching = false;
  showMsg('BẠN ĐÃ GỤC', 'Chờ đồng đội tới cứu · còn 35 giây');
  hud.dirty = true;
}
function revived(rp) { player.downed = 0; player.hp = 40; player.inv = 1.5; showMsg('ĐƯỢC CỨU!', (rp.name || 'Đồng đội') + ' đã kéo bạn dậy'); hud.dirty = true; }
function respawn() {
  player.dead = false; player.downed = 0; player.hp = 60; player.food = Math.max(player.food, 50); player.water = Math.max(player.water, 50);
  player.x = 35.2 + rand(-1, 1); player.z = 0.8; player.sprite.group.visible = true; player.sprite.mesh.rotation.x = 0;
  showMsg('HỒI SINH', 'Bạn tỉnh dậy trước đồn cảnh sát'); hud.dirty = true;
}
// chủ phòng: cả đội gục hết thì thua
function hostCheckWipe() {
  if (!net.active || !net.host || state.mode !== 'play') return;
  let anyAlive = playerAlive() || player.boarded;
  for (const rp of net.players.values()) if (rp.alive || rp.flags & 16) anyAlive = true;
  if (!anyAlive) gameOver('CẢ ĐỘI ĐÃ GỤC NGÃ');
}

// ================= NHIỄM VIRUS · HOÁ ZOMBIE · HOA BỈ NGẠN =================
// bị cắn có thể nhiễm virus: 5 phút để chế & tiêm thuốc giải (Kháng sinh + Ống tiêm),
// không kịp thì hoá zombie ở một chỗ bất kỳ; đồng đội tìm hoa bỉ ngạn cho ăn để hồi sinh.
const INFECT_TIME = 300;
const BITE_CHANCE = { walker: 0.35, runner: 0.35, brute: 0.6 };
function infectPlayer(z) {
  if (player.zombie || player.boarded || state.mode !== 'play') return;
  if (player.infected > 0) { player.infected = Math.max(20, player.infected - 15); return; }
  if (Math.random() >= (BITE_CHANCE[z.type] || 0.35)) return;
  player.infected = INFECT_TIME;
  showMsg('BỊ CẮN — NHIỄM VIRUS!', 'Có 5 phút chế thuốc giải: Kháng sinh + Ống tiêm' + (isTouch ? '' : ' (phím V)'));
  sound.infect();
  hud.dirty = true;
}
function cureInfection(byName) {
  player.infected = 0;
  showMsg('ĐÃ KHỎI VIRUS', byName ? byName + ' đã tiêm thuốc giải cho bạn' : 'Thuốc giải đã có tác dụng');
  sound.revive(); hud.dirty = true;
}
const hasRecipe = () => player.bag.antibio > 0 && player.bag.syringe > 0;
function quickAntidote() {
  if (player.zombie || state.mode !== 'play' || player.action) return;
  if (player.bag.antidote > 0) {
    if (player.infected > 0) useItem('antidote');
    else lootFeed('antidote', 'Chưa nhiễm virus · cất thuốc giải dùng sau', true);
    return;
  }
  craftAntidote();
}
function craftAntidote() {
  if (player.action || player.zombie || state.mode !== 'play') return;
  if (player.bag.antidote >= ITEMS.antidote.max) { lootFeed('antidote', 'Đã mang đủ thuốc giải', true); return; }
  if (!hasRecipe()) {
    const miss = [player.bag.antibio > 0 ? null : 'Kháng sinh', player.bag.syringe > 0 ? null : 'Ống tiêm'].filter(Boolean).join(' + ');
    lootFeed('antidote', 'Thiếu ' + miss + ' để chế thuốc giải', true);
    return;
  }
  player.action = { item: 'craft', t: 0, dur: 3.0 };
  player.reloading = 0;
  sound.use('heal');
}
function turnZombie() {
  player.infected = 0; player.downed = 0; player.dead = false; player.action = null; player.searching = false; player.reloading = 0;
  if (!net.active) { gameOver('BẠN ĐÃ HOÁ ZOMBIE'); return; }
  player.zombie = true; player.hp = 100;
  // xuất hiện ở một chỗ bất kỳ, ưu tiên xa đồng đội
  let best = null, bestD = -1;
  for (let k = 0; k < 30; k++) {
    const b = Math.random() < 0.45 ? world.buildings[Math.floor(Math.random() * world.buildings.length)] : null;
    const x = b ? rand(b.x0 + 0.8, b.x1 - 0.8) : rand(BOUNDS.x0 + 2, BOUNDS.x1 - 2);
    const z = b ? rand(ZB + 1, WALL_Z - 1) : rand(WALL_Z + 0.6, BOUNDS.z1 - 0.6);
    if (insideSolid(x, z, 0.45)) continue;
    let dmin = 60;
    for (const rp of net.players.values()) if (rp.alive) dmin = Math.min(dmin, Math.abs(rp.x - x));
    dmin += Math.random() * 8;
    if (dmin > bestD) { bestD = dmin; best = { x, z }; }
  }
  if (best) { player.x = best.x; player.z = best.z; }
  setZombieLook(true);
  showMsg('BẠN ĐÃ HOÁ ZOMBIE', 'Đồng đội phải tìm HOA BỈ NGẠN cho bạn ăn · ' + (isTouch ? 'GẦM' : 'E') + ': gầm gọi đồng đội');
  sound.groan(player.x, player.z, true);
  hud.dirty = true;
}
function unzombie(rp) {
  player.zombie = false; player.hp = 55; player.inv = 2.5;
  player.food = Math.max(player.food, 40); player.water = Math.max(player.water, 40);
  setZombieLook(false);
  $('t-use').textContent = 'LỤC';
  showMsg('ĐÃ HỒI SINH!', (rp && rp.name ? rp.name : 'Đồng đội') + ' cho bạn ăn hoa bỉ ngạn');
  sound.revive();
  hud.dirty = true;
}
let zlook = null;
function setZombieLook(on) {
  if (on && !zlook) { const list = SPR.zombies.walker; zlook = makeSprite([list[skinIdx % list.length]], PLAYER_COLORS[skinIdx]); }
  if (zlook) zlook.group.visible = on;
  player.sprite.group.visible = !on;
}
function updateZombieForm(dt) {
  let mx = 0, mz = 0;
  if (keys.KeyW || keys.ArrowUp) mz -= 1;
  if (keys.KeyS || keys.ArrowDown) mz += 1;
  if (keys.KeyA || keys.ArrowLeft) mx -= 1;
  if (keys.KeyD || keys.ArrowRight) mx += 1;
  let mag = Math.hypot(mx, mz);
  if (mag > 0) { mx /= mag; mz /= mag; mag = 1; }
  const ms = stickVec(sticks.move);
  if (ms.m > 0) { mx = ms.x; mz = ms.y; mag = ms.m; }
  const spd = 2.6 * mag;
  player.x += mx * spd * dt; player.z += mz * spd * dt * 0.8;
  collide(player);
  player.moving = mag > 0.1;
  if (player.moving) { player.walk += dt * spd * 1.8; player.aim = Math.atan2(mz, mx); }
  setFrame(zlook, dirFromAngle(player.aim), player.moving ? Math.floor(player.walk) % 4 : 0);
  zlook.group.position.set(player.x, 0, player.z);
  player.firing = false; player.searching = false; interact.target = null;
  player.groanT = Math.max(0, player.groanT - dt);
  if ((keys.KeyE || keys.Space || interact.touchHold || sticks.aim) && player.groanT <= 0) {
    player.groanT = 4;
    sound.groan(player.x, player.z, false);
    netEvent('gr', 0);
    floaters.push({ x: player.x, y: 2.4, z: player.z, text: 'GRỪ…', t: 1.2, color: '#b8e08a' });
  }
  const tu = $('t-use');
  tu.textContent = 'GẦM'; tu.classList.toggle('off', player.groanT > 0);
}
// hoa bỉ ngạn mọc rải rác (vị trí giống nhau với cả đội, đổi mỗi ngày); mỗi người tự hái phần mình
const FLOWER_SPOTS = [[-55.4, 0.2], [-47.6, -2.7], [-37.0, -4.0], [-31.2, -1.6], [-26.6, 2.6], [-16.5, -2.7], [-6.0, -5.6], [2.6, -4.6], [9.4, -5.2], [15.9, 2.1], [22.4, 3.7], [31.0, -5.0], [44.8, 3.7], [49.2, -1.6], [55.4, -0.5]];
let flowers = [], flowerDay = -1, flowerSpr = null;
function clearFlowers() {
  for (const f of flowers) { scene.remove(f.mesh); f.e.base = 0; const i = world.emitters.indexOf(f.e); if (i >= 0) world.emitters.splice(i, 1); }
  flowers = [];
}
function spawnFlowers(day) {
  if (!flowerSpr) flowerSpr = makeFlowerSprite();
  const seed = (net.host ? net.gameId : net.gameSeen) || 7;
  const r = makeRng(Math.abs(seed % 1e6) * 31 + day * 977);
  const spots = FLOWER_SPOTS.filter(([x, z]) => !insideSolid(x, z, 0.25));
  const n = Math.min(spots.length, 2 + Math.min(2, net.players.size));
  for (let i = 0; i < n; i++) {
    const [x, z] = spots.splice(Math.floor(r() * spots.length), 1)[0];
    const mat = spriteLit(new THREE.MeshLambertMaterial({ map: flowerSpr.map, alphaTest: 0.5, side: THREE.DoubleSide, emissive: new THREE.Color(1, 1, 1), emissiveMap: flowerSpr.emissiveMap, emissiveIntensity: 1.4 }));
    const geo = new THREE.PlaneGeometry(flowerSpr.w * 1.3, flowerSpr.h * 1.3); geo.translate(0, flowerSpr.h * 0.65, 0);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, 0.02, z); mesh.quaternion.copy(camQuat);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(1.6, 0.3, 0.35), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    glow.scale.set(1.6, 1.6, 1); glow.position.set(0, 0.6, -0.05); mesh.add(glow);
    scene.add(mesh); world.hideInReflection.push(mesh);
    const e = { pos: new THREE.Vector3(x, 0.8, z + 0.3), color: new THREE.Color('#ff3a4a'), base: 3.2, dist: 4.5, kind: 'flower', flicker: 'lamp', phase: r() * 100, cur: 0, w: 0 };
    world.emitters.push(e);
    const id = 'f' + day + '_' + i;
    if (player.picked.has(id)) { mesh.visible = false; e.base = 0; }
    flowers.push({ id, x, z, mesh, glow, e });
  }
}
function updateFlowers(dt) {
  const want = net.active && state.mode === 'play' ? dayNo : -1;
  if (want !== flowerDay) { clearFlowers(); flowerDay = want; if (want >= 0) spawnFlowers(want); }
  for (const f of flowers) {
    if (!f.mesh.visible) continue;
    f.mesh.position.y = 0.02 + Math.sin(gtime * 2 + f.x) * 0.04;
    f.glow.material.opacity = 0.6 + 0.4 * Math.sin(gtime * 3 + f.z);
    if (Math.random() < dt * 3) fx.spark.spawn(f.x + rand(-0.3, 0.3), rand(0.4, 1.1), f.z + rand(-0.2, 0.2), rand(-0.2, 0.2), rand(0.3, 0.8), rand(-0.1, 0.1), 0.9, 0.05, '#ff6a7a', { grav: -0.3, drag: 1, mode: 1 });
  }
}
// mỗi sáng một phần chỗ đã lục có đồ mới (đủ nguyên liệu cho ván dài)
function restock() { for (const id of [...player.looted]) if (Math.random() < 0.35) player.looted.delete(id); }

const Q = { found: false, parts: 0, called: false, heli: null, evac: false, won: false };
function questReset() { Object.assign(Q, { found: false, parts: 0, called: false, heli: null, evac: false, won: false }); power = false; if (heli) heli.group.visible = false; hud.dirty = true; }
function questDone(it) {
  if (it === 'fuel') return power || player.bag.fuel > 0;
  if (it === 'part') return Q.parts + (player.bag.part || 0) >= 2;
  if (it === 'key') return world.pois.armory.open || player.bag.key > 0;
  return false;
}
function questDescribe(key) {
  if (key === 'radio') {
    if (!Q.found) return { label: 'Kiểm tra bộ đàm', can: true, time: 0.7 };
    if (player.bag.part > 0 && Q.parts < 2) return { label: 'Lắp linh kiện vào bộ đàm', can: true, time: 1.6 };
    if (!power) return { label: 'Bộ đàm: chưa có điện', can: false };
    if (Q.parts < 2) return { label: `Bộ đàm: thiếu linh kiện (${Q.parts}/2)`, can: false };
    if (!Q.called) return { label: 'GỌI TRỰC THĂNG CỨU HỘ', can: true, time: 2.0 };
    return { label: 'Đã gọi cứu hộ · chờ bình minh', can: false };
  }
  if (key === 'generator') {
    if (power) return { label: 'Máy phát đang chạy', can: false };
    if (player.bag.fuel > 0) return { label: 'Đổ xăng, khởi động máy phát', can: true, time: 2.2 };
    return { label: 'Máy phát điện · cần can xăng', can: false };
  }
  return { label: world.pois[key].label, can: false };
}
// quyết định hành động ở máy mình (tiêu vật phẩm trong túi), rồi áp dụng chung cho cả đội
function questInteract(key) {
  let act = null, n = 0;
  if (key === 'radio') {
    if (!Q.found) act = 'found';
    else if (player.bag.part > 0 && Q.parts < 2) { n = Math.min(2 - Q.parts, player.bag.part); player.bag.part -= n; act = 'part'; }
    else if (power && Q.parts >= 2 && !Q.called) act = 'call';
  } else if (key === 'generator' && player.bag.fuel > 0 && !power) { player.bag.fuel--; act = 'gen'; }
  if (!act) return;
  if (net.active && !net.host) { netEvent('q', act, n); questApply(act, n, null, true); }
  else questApply(act, n, null);
  hud.dirty = true;
}
function powerOn(msg = true) {
  if (power) return;
  power = true;
  sound.generator(true);
  const g = world.pois.generator; g.e.base = 4;
  world.smokeSources.push({ x: g.exhaust.x, y: g.exhaust.y, z: g.exhaust.z, rate: 2.5 });
  if (msg) showMsg('CÓ ĐIỆN', 'Máy phát đã chạy · đồn cảnh sát sáng đèn');
}
// predicted: khách đoán trước kết quả, chủ phòng xác nhận qua ảnh chụp
function questApply(act, n, rp, predicted = false) {
  if (act === 'found' && !Q.found) { Q.found = true; showMsg('BỘ ĐÀM HỎNG', 'Cần xăng cho máy phát & 2 linh kiện để gọi cứu hộ'); sound.radio(); }
  else if (act === 'part') {
    Q.parts = Math.min(2, Q.parts + clamp(n, 0, 2)); sound.unlock();
    lootFeed('part', `Đã lắp linh kiện (${Q.parts}/2)`);
    if (Q.parts >= 2 && power) showMsg('BỘ ĐÀM ĐÃ SẴN SÀNG', 'Gọi trực thăng cứu hộ ngay!');
  } else if (act === 'call' && power && Q.parts >= 2 && !Q.called) {
    Q.called = true; sound.radio();
    showMsg('ĐÃ GỌI CỨU HỘ', 'Trực thăng tới lúc bình minh · tín hiệu đang kéo zombie tới!');
    if (!predicted) makeNoise(world.pois.radio.x, world.pois.radio.z, 40);
  } else if (act === 'gen' && !power) {
    powerOn();
    if (!predicted) makeNoise(world.pois.generator.x, world.pois.generator.z, 16);
  } else if (act === 'armory') unlockArmory();
  hud.dirty = true;
}
function questText() {
  if (Q.won) return ['ĐÃ ĐƯỢC GIẢI CỨU', ''];
  if (player.zombie) return ['BẠN ĐANG LÀ ZOMBIE', 'Chờ đồng đội cho ăn hoa bỉ ngạn · ' + (isTouch ? 'GẦM' : 'E') + ': gầm gọi họ'];
  if (net.active) { const zf = [...net.players.values()].find((r) => r.flags & 128); if (zf) return [`CỨU ${zf.name.toUpperCase()}!`, player.bag.flower > 0 ? 'Mang hoa bỉ ngạn tới cho bạn ăn' : 'Tìm HOA BỈ NGẠN (đỏ, phát sáng) rồi cho bạn ăn']; }
  if (player.infected > 0) return ['NHIỄM VIRUS · CHẾ THUỐC GIẢI', 'Kháng sinh + Ống tiêm · nhà thuốc, xe cứu thương' + (isTouch ? '' : ' · phím V')];
  if (Q.heli && Q.heli.stage === 'wait') return ['LÊN TRỰC THĂNG Ở BÃI ĐÁP!', `Còn ${Math.ceil(Q.heli.left)} giây · phía đông thị trấn →`];
  if (Q.heli) return ['Trực thăng đang tới…', 'Chạy về bãi đáp phía đông'];
  if (Q.called) return ['Cầm cự tới bình minh', 'Trực thăng cứu hộ sẽ tới lúc 6:00'];
  if (!Q.found) return ['Tìm bộ đàm ở ĐỒN CẢNH SÁT', 'Đi về phía đông → · lục soát dọc đường'];
  if (power && Q.parts >= 2) return ['Dùng bộ đàm GỌI CỨU HỘ', 'Bàn bộ đàm trong đồn cảnh sát'];
  const a = power ? '✓ Máy phát đã có điện' : (player.bag.fuel ? '• Đổ xăng vào máy phát cạnh đồn' : '• Tìm can xăng ở GARA (phía tây)');
  const b = `• Linh kiện bộ đàm ${Q.parts}/2` + (player.bag.part ? ` (đang mang ${player.bag.part})` : ' · nhà ông Tư, xe quân sự');
  return ['Sửa bộ đàm để gọi cứu hộ', a + '\n' + b];
}
function questListHtml() {
  const it = (done, cur, text) => `<div class="${done ? 'done' : cur ? 'cur' : ''}">${done ? '✓' : '•'} ${text}</div>`;
  const ready = power && Q.parts >= 2;
  return '<b style="color:var(--gold);font-weight:400">NHIỆM VỤ</b>'
    + it(Q.found, !Q.found, 'Tìm bộ đàm ở đồn cảnh sát (phía đông)')
    + it(power, Q.found && !power, 'Can xăng ở gara phía tây → đổ vào máy phát cạnh đồn')
    + it(Q.parts >= 2, Q.found && Q.parts < 2, `Linh kiện bộ đàm ${Q.parts}/2 · nhà ông Tư, xe quân sự ở chốt kiểm soát`)
    + it(Q.called, ready && !Q.called, 'Gọi trực thăng cứu hộ')
    + it(!!Q.heli, Q.called && !Q.heli, 'Cầm cự tới bình minh')
    + it(Q.won, !!Q.heli, 'Lên trực thăng ở bãi đáp')
    + '<div style="margin-top:6px;color:var(--ink-dim)">Kho súng trong đồn cần chìa khoá · bàn trưởng đồn</div>';
}

// ---------- trực thăng cứu hộ ----------
let heli = null;
function makeHeli() {
  const g = new THREE.Group();
  const M = (c, e) => new THREE.MeshLambertMaterial({ color: c, emissive: e ? new THREE.Color(e) : undefined });
  const box = (w, h, d, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
  const body = M('#e8e4dc'), dark = M('#26262a'), glass = M('#2a3a48', '#0a1820'), red = M('#c8281e');
  box(3.6, 1.6, 1.9, body, 0, 1.3, 0);
  box(1.3, 1.2, 1.7, glass, 1.9, 1.35, 0);
  box(4.2, 0.45, 0.45, body, -3.6, 1.7, 0);
  box(0.9, 1.0, 0.12, red, -5.5, 2.1, 0);
  box(3.62, 0.3, 1.92, red, 0, 0.95, 0);
  box(4.22, 0.12, 0.47, red, -3.6, 1.7, 0);
  box(3.6, 0.1, 0.1, dark, 0, 0.18, 0.75); box(3.6, 0.1, 0.1, dark, 0, 0.18, -0.75);
  for (const x of [-1, 1]) { box(0.08, 0.5, 0.08, dark, x, 0.42, 0.75); box(0.08, 0.5, 0.08, dark, x, 0.42, -0.75); }
  box(0.3, 0.35, 0.3, dark, 0, 2.25, 0);
  box(0.9, 0.7, 0.05, M('#e8e0d0'), 0.2, 1.4, 0.98);
  const cross = M('#c8281e');
  box(0.5, 0.14, 0.06, cross, 0.2, 1.4, 1.0); box(0.14, 0.5, 0.07, cross, 0.2, 1.4, 1.0);
  const rotor = new THREE.Group(); rotor.position.set(0, 2.45, 0); g.add(rotor);
  for (let i = 0; i < 2; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(10.5, 0.05, 0.32), dark); b.rotation.y = i * Math.PI / 2; rotor.add(b); }
  const tail = new THREE.Group(); tail.position.set(-5.55, 2.1, 0.12); g.add(tail);
  const tb = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.8, 0.03), dark); tail.add(tb);
  const beacon = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.16), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 0.4, 0.3) }));
  beacon.position.set(-1.2, 2.2, 0); g.add(beacon);
  const lamp = new THREE.PointLight('#fff2d0', 0, 16, 1.6); lamp.position.set(2.4, 0.4, 0.6); g.add(lamp);
  g.visible = false;
  scene.add(g);
  return { group: g, rotor, tail, beacon, lamp };
}
function heliArrive() {
  if (!heli) heli = makeHeli();
  Q.heli = { stage: 'in', t: 0, left: 75 };
  heli.group.visible = true;
  showMsg('TRỰC THĂNG ĐÃ TỚI', 'Chạy tới BÃI ĐÁP phía đông!');
  sound.heli(true);
}
function updateHeli(dt) {
  if (!Q.heli || !heli) return;
  const h = Q.heli, g = heli.group;
  h.t += dt;
  heli.rotor.rotation.y += dt * 26; heli.tail.rotation.z += dt * 30;
  heli.beacon.visible = Math.floor(gtime * 2.5) % 2 === 0;
  heli.lamp.intensity = 30 * (0.4 + 0.6 * (1 - Math.min(1, atmos.hour > 5 && atmos.hour < 18 ? 0.6 : 0)));
  const hx = HELIPAD.x, hz = HELIPAD.z;
  if (h.stage === 'in') {
    const k = Math.min(1, h.t / 9), e = 1 - Math.pow(1 - k, 3);
    g.position.set(hx + 34 * (1 - e), 0.15 + 16 * Math.pow(1 - e, 1.4), hz - 1.2 * (1 - e));
    g.rotation.z = 0.12 * (1 - e); g.rotation.y = Math.PI;
    if (k >= 1) h.stage = 'wait';
  } else if (h.stage === 'wait') {
    h.left -= dt;
    g.position.set(hx, 0.15 + Math.sin(gtime * 6) * 0.02, hz);
    if (playerAlive() && Math.hypot(player.x - hx, player.z - hz) < HELIPAD.r + 0.3) {
      h.board = (h.board || 0) + dt;
      if (h.board > 1.2) {
        player.boarded = true; player.sprite.group.visible = false; sound.pickup();
        if (net.active) { netEvent('q', 'board', 0); showMsg('ĐÃ LÊN TRỰC THĂNG', 'Chờ đồng đội…'); }
        else { Q.won = true; h.stage = 'out'; h.t = 0; }
      }
    } else h.board = 0;
    if (net.active && net.host) {
      let waiting = playerAlive(), boarded = !!player.boarded;
      for (const rp of net.players.values()) { if (rp.alive) waiting = true; if (rp.flags & 16) boarded = true; }
      if (!waiting && boarded) { Q.won = true; h.stage = 'out'; h.t = 0; }
    }
    if (h.left <= 0 && (!net.active || net.host)) { h.stage = 'out'; h.t = 0; Q.won = !!player.boarded || [...net.players.values()].some((rp) => rp.flags & 16); if (!Q.won) { showMsg('TRỰC THĂNG ĐÃ BỎ ĐI', 'Gọi lại bằng bộ đàm vào ban ngày…'); Q.called = false; } }
  } else if (h.stage === 'out') {
    const k = Math.min(1, h.t / 7);
    g.position.set(hx - 40 * k * k, 0.15 + 18 * k * k, hz - 3 * k);
    g.rotation.z = -0.15 * Math.min(1, k * 3);
    if (k >= 1) {
      g.visible = false; Q.heli = null; sound.heli(false);
      if (player.boarded) winGame();
      else if (Q.won && net.active && state.mode === 'play') gameOver(player.zombie ? 'BẠN BỊ BỎ LẠI' : 'LỠ CHUYẾN TRỰC THĂNG');
    }
  }
  if (g.visible && g.position.y < 4 && Math.random() < 0.6) {
    const a = Math.random() * TAU, r = rand(1.5, 4);
    fx.lit.spawn(g.position.x + Math.cos(a) * r, 0.1, g.position.z + Math.sin(a) * r * 0.6, Math.cos(a) * 3, rand(0.3, 1), Math.sin(a) * 2, 0.8, 0.12, '#8a7a62', { grav: 1, drag: 1.5 });
  }
  hud.dirty = true;
}
function winGame() {
  state.mode = 'won';
  const best = Math.max(bestScore(), dayNo);
  store.set('deadnight_days', String(best));
  document.body.classList.remove('playing');
  $('win-stats').innerHTML = `Sống sót <b>${dayNo} ngày</b> · hạ gục <b>${kills}</b> zombie<br>Lục soát <b>${player.lootCount}</b> chỗ · thời gian <b>${Math.floor((gtime - playStart) / 60)} phút</b>`;
  setTimeout(() => $('win').classList.remove('hidden'), 400);
}

// ================= LỤC SOÁT, TÚI ĐỒ =================
const interact = { target: null, t: 0, touchHold: false };
let bagOpen = false;
const ICON = {};
const CORPSE_NAMES = { z_walker: 'Lục xác zombie', z_runner: 'Lục xác zombie', z_brute: 'Lục xác zombie to xác', z_cop: 'Lục xác cảnh sát', z_soldier: 'Lục xác lính' };
const lc = (t) => t.charAt(0).toLowerCase() + t.slice(1);
function interactTargets() {
  const out = [];
  for (const c of world.containers) { const d = Math.hypot(c.x - player.x, c.z - player.z); if (d < 1.3) out.push({ type: 'c', id: c.id, c, d, x: c.x, z: c.z }); }
  for (const z of zombies) if (z.state === 'dead' && z.t > 0.4 && z.t < CORPSE_LIFE - 2) { const d = Math.hypot(z.x - player.x, z.z - player.z); if (d < 1.3) out.push({ type: 'z', id: 'z' + z.id, zo: z, d, x: z.x, z: z.z }); }
  if (net.active) for (const rp of net.players.values()) {
    const d = Math.hypot(rp.x - player.x, rp.z - player.z);
    if (d > 1.5 || !rp.inited) continue;
    if (rp.flags & 128) out.push({ type: 'zf', id: 'zf' + rp.peer, rp, d, x: rp.x, z: rp.z });
    else if (rp.flags & 4 && !(rp.flags & 8)) out.push({ type: 'r', id: 'r' + rp.peer, rp, d, x: rp.x, z: rp.z });
    else if (rp.flags & 64 && player.bag.antidote > 0) out.push({ type: 'cu', id: 'cu' + rp.peer, rp, d: d + 0.3, x: rp.x, z: rp.z });
  }
  for (const f of flowers) if (f.mesh.visible) { const d = Math.hypot(f.x - player.x, f.z - player.z); if (d < 1.2) out.push({ type: 'f', id: f.id, f, d, x: f.x, z: f.z }); }
  for (const k in world.pois) {
    const p = world.pois[k];
    if (k === 'helipad' || (k === 'armory' && p.open)) continue;
    const d = Math.hypot(p.x - player.x, p.z - player.z);
    if (d < 1.5) out.push({ type: 'p', id: 'p' + k, key: k, p, d, x: p.x, z: p.z });
  }
  return out;
}
function describe(tg) {
  if (tg.type === 'c') {
    const c = tg.c;
    if (c.locked === 'armory' && !world.pois.armory.open) return { label: c.label + ' · bị khoá', can: false };
    if (player.looted.has(c.id)) return { label: c.label + ' · đã lục', can: false, done: true };
    return { label: 'Lục ' + lc(c.label), can: true, time: searchTime(c.kind) };
  }
  if (tg.type === 'z') {
    if (tg.zo.looted) return { label: 'Xác đã lục', can: false, done: true };
    return { label: CORPSE_NAMES[tg.zo.lootKind] || 'Lục xác', can: true, time: searchTime('corpse') };
  }
  if (tg.type === 'r') return { label: 'Cứu ' + tg.rp.name, can: true, time: 3.0 };
  if (tg.type === 'zf') return player.bag.flower > 0 ? { label: `Cho ${tg.rp.name} ăn hoa bỉ ngạn`, can: true, time: 2.0 } : { label: `${tg.rp.name} đã hoá zombie · cần hoa bỉ ngạn`, can: false };
  if (tg.type === 'cu') return { label: `Tiêm thuốc giải cho ${tg.rp.name}`, can: true, time: 1.5 };
  if (tg.type === 'f') return player.bag.flower >= ITEMS.flower.max ? { label: 'Hoa bỉ ngạn · túi đã đầy', can: false } : { label: 'Hái hoa bỉ ngạn', can: true, time: 0.9 };
  if (tg.key === 'armory') return player.bag.key > 0 ? { label: 'Mở kho súng bằng chìa khoá', can: true, time: 1.2 } : { label: 'Kho súng bị khoá · cần chìa khoá', can: false };
  return questDescribe(tg.key);
}
function updateInteract(dt) {
  const list = state.mode === 'play' && !player.action ? interactTargets() : [];
  let best = null, bestS = 1e9;
  for (const tg of list) { tg.info = describe(tg); const sc = tg.d + (tg.info.can ? 0 : 1.1); if (sc < bestS) { bestS = sc; best = tg; } }
  if (best && best.info.done && best.d > 0.95) best = null;
  if (!best || !interact.target || best.id !== interact.target.id) interact.t = 0;
  interact.target = best;
  const holding = (keys.KeyE || interact.touchHold) && !bagOpen;
  player.searching = !!(best && best.info.can && holding);
  if (player.searching) {
    interact.t += dt;
    if (Math.random() < dt * 9) fx.lit.spawn(best.x + rand(-0.3, 0.3), rand(0.4, 1.2), best.z + rand(-0.2, 0.2), rand(-0.6, 0.6), rand(0.4, 1.2), rand(-0.3, 0.3), 0.6, 0.06, '#c8b898', { grav: 3, drag: 2 });
    sound.rustle(dt);
    if (interact.t >= best.info.time) { interact.t = 0; player.searching = false; doInteract(best); }
  } else interact.t = Math.max(0, interact.t - dt * 3);
  $('t-use').classList.toggle('off', !(best && best.info.can));
}
function doInteract(tg) {
  if (tg.type === 'c') {
    const c = tg.c;
    player.looted.add(c.id);
    giveItems(rollLoot(c.kind, Math.random, questDone));
  } else if (tg.type === 'z') {
    tg.zo.looted = true;
    tg.zo.sprite.mat.color.setScalar(0.62);
    giveItems(rollLoot(tg.zo.lootKind));
  } else if (tg.type === 'r') netEvent('rv', tg.rp.peer);
  else if (tg.type === 'zf') { if (player.bag.flower > 0) { player.bag.flower--; netEvent('fl', tg.rp.peer); lootFeed('flower', `Đã cho ${tg.rp.name} ăn hoa`); } }
  else if (tg.type === 'cu') { if (player.bag.antidote > 0) { player.bag.antidote--; netEvent('cure', tg.rp.peer); lootFeed('antidote', `Đã tiêm thuốc giải cho ${tg.rp.name}`); } }
  else if (tg.type === 'f') { player.picked.add(tg.f.id); tg.f.mesh.visible = false; tg.f.e.base = 0; addItem('flower', 1); lootFeed('flower', '+1 Hoa bỉ ngạn'); sound.flower(); }
  else if (tg.key === 'armory') { unlockArmory(); if (net.active && !net.host) netEvent('q', 'armory', 0); }
  else questInteract(tg.key);
  hud.dirty = true; renderBagIfOpen();
}
function giveItems(list) {
  player.lootCount++;
  if (!list.length) { lootFeed(null, 'Không có gì…', true); sound.empty(); return; }
  for (const [it, n] of list) {
    const got = addItem(it, n);
    lootFeed(it, got > 0 ? `+${ITEMS[it].weapon !== undefined ? '' : got + ' '}${ITEMS[it].name}` : `${ITEMS[it].name}: túi đầy`, got <= 0);
  }
  sound.pickup();
}
function addItem(it, n) {
  const def = ITEMS[it];
  if (def.weapon !== undefined) {
    const g = player.guns[def.weapon], w = WEAPONS[def.weapon];
    if (!g.owned) {
      g.owned = true; g.ammo = w.mag;
      showMsg('VŨ KHÍ MỚI', `${w.name} — bấm ${def.weapon + 1}${isTouch ? ' hoặc ⇄' : ''}`);
      switchWeapon(def.weapon);
      return 1;
    }
    return addItem(w.ammo, w.mag) > 0 ? 1 : 0;
  }
  const before = player.bag[it] || 0;
  player.bag[it] = Math.min(def.max, before + n);
  return player.bag[it] - before;
}
const ACTION_TEXT = { bandage: 'Băng bó vết thương…', medkit: 'Sơ cứu…', food: 'Đang ăn…', water: 'Đang uống…', craft: 'Đang chế thuốc giải…', antidote: 'Tiêm thuốc giải…' };
function useItem(it) {
  const def = ITEMS[it];
  if (!def.use || player.action || !(player.bag[it] > 0) || state.mode !== 'play') return false;
  if (def.use === 'heal' && player.hp >= player.maxHp) { lootFeed(it, 'Máu đang đầy', true); return false; }
  if (def.use === 'eat' && player.food > 96) { lootFeed(it, 'Chưa đói', true); return false; }
  if (def.use === 'drink' && player.water > 96) { lootFeed(it, 'Chưa khát', true); return false; }
  if (def.use === 'cure' && !(player.infected > 0)) { lootFeed(it, 'Chưa nhiễm virus', true); return false; }
  player.action = { item: it, t: 0, dur: def.time };
  player.reloading = 0;
  sound.use(def.use);
  return true;
}
function finishAction() {
  const it = player.action.item, def = ITEMS[it];
  player.action = null;
  if (it === 'craft') {
    if (!hasRecipe() || player.bag.antidote >= ITEMS.antidote.max) return;
    player.bag.antibio--; player.bag.syringe--; player.bag.antidote = (player.bag.antidote || 0) + 1;
    lootFeed('antidote', '+1 Thuốc giải'); sound.unlock(); hud.dirty = true; renderBagIfOpen();
    if (player.infected > 0) useItem('antidote');
    return;
  }
  if (!(player.bag[it] > 0)) return;
  player.bag[it]--;
  if (def.use === 'cure') { cureInfection(); renderBagIfOpen(); return; }
  if (def.heal) { player.hp = Math.min(player.maxHp, player.hp + def.heal); floaters.push({ x: player.x, y: 2.3, z: player.z, text: `+${def.heal} MÁU`, t: 1.2, color: '#7fe07f' }); }
  if (def.food) { player.food = Math.min(100, player.food + def.food); floaters.push({ x: player.x, y: 2.3, z: player.z, text: 'NO BỤNG', t: 1.0, color: '#e8a860' }); }
  if (def.water) { player.water = Math.min(100, player.water + def.water); floaters.push({ x: player.x, y: 2.3, z: player.z, text: 'HẾT KHÁT', t: 1.0, color: '#7ac8f0' }); }
  sound.pickup(); hud.dirty = true; renderBagIfOpen();
}
function quickHeal() {
  const it = player.hp < 50 && player.bag.medkit > 0 ? 'medkit' : player.bag.bandage > 0 ? 'bandage' : player.bag.medkit > 0 ? 'medkit' : null;
  if (it) useItem(it); else lootFeed(null, 'Không có đồ y tế', true);
}
function quickEat() {
  const order = player.water <= player.food ? ['water', 'food'] : ['food', 'water'];
  for (const it of order) if (player.bag[it] > 0) { useItem(it); return; }
  lootFeed(null, 'Không có đồ ăn uống', true);
}
function lootFeed(it, text, bad = false) {
  const feed = $('loot-feed');
  const el = document.createElement('div');
  el.className = 'lf' + (bad ? ' bad' : '');
  if (it && ICON[it]) { const im = document.createElement('img'); im.src = ICON[it]; im.alt = ''; el.appendChild(im); }
  el.appendChild(document.createTextNode(text));
  feed.appendChild(el);
  while (feed.children.length > 5) feed.firstChild.remove();
  setTimeout(() => el.remove(), 3300);
}
function buildIcons() {
  const cv = makeItemIcons();
  for (const it in ITEMS) {
    const c = document.createElement('canvas'); c.width = c.height = 16;
    c.getContext('2d').drawImage(cv, ITEMS[it].icon * 16, 0, 16, 16, 0, 0, 16, 16);
    ICON[it] = c.toDataURL();
  }
}
const QUICK = [['bandage', 'F'], ['medkit', 'F'], ['food', 'C'], ['water', 'C'], ['antidote', 'V']];
function buildQuickBar() {
  const q = $('quick');
  q.innerHTML = '';
  for (const [it, key] of QUICK) {
    const d = document.createElement('div');
    d.className = 'qi'; d.dataset.it = it; d.title = ITEMS[it].name;
    d.innerHTML = `<img alt="" src="${ICON[it]}"><b>0</b><i>${key}</i>`;
    const act = () => (it === 'antidote' ? quickAntidote() : useItem(it));
    d.addEventListener('click', act);
    d.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); act(); }, { passive: false });
    q.appendChild(d);
  }
}
function toggleBag(force) {
  if (state.mode !== 'play') return;
  bagOpen = force !== undefined ? force : !bagOpen;
  $('bag').classList.toggle('hidden', !bagOpen);
  if (!net.active) state.paused = bagOpen;
  if (bagOpen) renderBag();
}
function renderBagIfOpen() { if (bagOpen) renderBag(); }
function renderBag() {
  const grid = $('bag-grid');
  grid.innerHTML = '';
  for (const it of ITEM_ORDER) {
    const n = player.bag[it] || 0;
    if ((ITEMS[it].quest || ITEMS[it].hideZero) && !n) continue;
    const d = document.createElement('div');
    d.className = 'bi' + (n ? '' : ' zero');
    d.innerHTML = `<img alt="" src="${ICON[it]}"><span>${ITEMS[it].name}<br><span class="n">×${n}</span></span>`;
    if (ITEMS[it].use && n) {
      const b = document.createElement('button'); b.textContent = 'Dùng';
      b.addEventListener('click', () => { if (bagOpen && !net.active) toggleBag(false); useItem(it); renderBagIfOpen(); });
      d.appendChild(b);
    }
    grid.appendChild(d);
  }
  WEAPONS.forEach((w, i) => {
    if (!player.guns[i].owned || w.melee) return;
    const d = document.createElement('div'); d.className = 'bi';
    const ic = i === 2 ? ICON.shotgun : i === 3 ? ICON.smg : ICON.ammo9;
    d.innerHTML = `<img alt="" src="${ic}"><span>${w.name}<br><span class="n">${player.guns[i].ammo}/${w.mag}</span></span>`;
    grid.appendChild(d);
  });
  const cr = document.createElement('div');
  cr.className = 'bi craft';
  cr.innerHTML = `<img alt="" src="${ICON.antidote}"><span>Chế thuốc giải<br><span class="n">Kháng sinh ×${player.bag.antibio || 0} + Ống tiêm ×${player.bag.syringe || 0}</span></span>`;
  const cb = document.createElement('button'); cb.textContent = 'Chế'; cb.disabled = !hasRecipe();
  cb.addEventListener('click', () => { if (bagOpen && !net.active) toggleBag(false); craftAntidote(); });
  cr.appendChild(cb); grid.prepend(cr);
  $('bag-quest').innerHTML = questListHtml();
}
function unlockArmory(feed = true) {
  const a = world.pois.armory;
  if (a.open) return;
  if (!feed) { a.open = true; a.door.rotation.y = -1.75; const j = world.colliders.boxes.indexOf(a.box); if (j >= 0) world.colliders.boxes.splice(j, 1); navBuild(); return; }
  a.open = true;
  a.door.rotation.y = -1.75;
  const i = world.colliders.boxes.indexOf(a.box);
  if (i >= 0) world.colliders.boxes.splice(i, 1);
  navBuild();
  sound.unlock();
  lootFeed('key', 'Đã mở kho vũ khí!');
}
function resetWorldState() {
  const g = world.pois.generator; g.e.base = 0;
  world.smokeSources = world.smokeSources.filter((s0) => !(s0.x === g.exhaust.x && s0.z === g.exhaust.z));
  const a = world.pois.armory;
  a.open = false; a.door.rotation.y = 0;
  if (!world.colliders.boxes.includes(a.box)) world.colliders.boxes.push(a.box);
  power = false;
  if (NAV.block) navBuild();
}

// ================= HUD =================
const hud = { dirty: true, last: {} };
function setText(id, v) { if (hud.last[id] !== v) { hud.last[id] = v; $(id).textContent = v; } }
function updateHud() {
  $('hp-fill').style.width = (Math.max(0, player.hp) / player.maxHp * 100).toFixed(1) + '%';
  $('st-fill').style.width = (player.stamina * 100).toFixed(1) + '%';
  $('fd-fill').style.width = player.food.toFixed(1) + '%';
  $('wt-fill').style.width = player.water.toFixed(1) + '%';
  $('fd-bar').classList.toggle('low', player.food < 20);
  $('wt-bar').classList.toggle('low', player.water < 20);
  $('hp-box').classList.toggle('low', player.hp < 30);
  const inf = player.infected > 0 ? Math.ceil(player.infected) : 0;
  $('inf-row').classList.toggle('hidden', !inf);
  if (inf) { setText('inf-time', `${Math.floor(inf / 60)}:${String(inf % 60).padStart(2, '0')} · chế thuốc giải!`); $('inf-row').classList.toggle('low', inf < 60); }
  $('zbanner').classList.toggle('hidden', !player.zombie);
  document.body.classList.toggle('zmode', !!player.zombie);
  $('reload-tag').classList.toggle('show', player.reloading > 0);
  const hh = ((atmos.hour % 24) + 24) % 24, clock = String(Math.floor(hh)).padStart(2, '0') + ':' + String(Math.floor((hh % 1) * 60)).padStart(2, '0');
  setText('night', phase === 'day' || phase === 'dawn' ? `NGÀY ${Math.max(1, dayNo)}` : `ĐÊM ${phase === 'dusk' ? wave + 1 : wave}`);
  setText('atmo', `${clock} · ${atmos.weatherName}`);
  if (phase === 'day' || net.active) hud.dirty = true;
  if (!hud.dirty) return;
  hud.dirty = false;
  const w = WEAPONS[player.weapon], g = curGun();
  const alive = zombies.filter((z) => z.state !== 'dead' && z.aggro).length;
  const hrs = atmos.hour, left10 = (v) => Math.max(0, Math.ceil(v / 10) * 10);
  setText('left', phase === 'night' ? `Bình minh sau ~${left10((29.5 - hrs) / 9.9 * NIGHT_LEN)} giây · zombie: ${toSpawn + alive}` : phase === 'dawn' ? 'Trời sáng rồi!' : phase === 'day' ? `Trời tối sau ~${left10((16.4 - hrs) / (16.4 - 6.9) * DAY_LEN)} giây` : 'Màn đêm sắp buông…');
  const [qt, qs] = questText();
  setText('q-text', qt);
  const qsub = $('q-sub');
  if (hud.last.qsub !== qs) { hud.last.qsub = qs; qsub.innerHTML = ''; qs.split('\n').forEach((l, i) => { if (i) qsub.appendChild(document.createElement('br')); qsub.appendChild(document.createTextNode(l)); }); }
  setText('wname', w.name);
  setText('ammo', w.melee ? '∞' : String(g.ammo));
  setText('reserve', w.melee ? 'cận chiến' : String(reserveOf(player.weapon)));
  $('ammo').classList.toggle('empty', !w.melee && g.ammo === 0);
  document.querySelectorAll('#slots .slot').forEach((el, i) => {
    el.classList.toggle('on', i === player.weapon);
    el.classList.toggle('owned', player.guns[i].owned);
  });
  const team = $('team');
  if (net.active) {
    const rows = [];
    const mmss = (sec) => Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
    for (const rp of net.players.values()) if (rp.inited) rows.push(`<div style="color:${PLAYER_COLORS[rp.color || 0]}">${rp.name.replace(/[<>&]/g, '')} · ${rp.flags & 16 ? 'đã lên trực thăng' : rp.flags & 128 ? '<b style="color:#b8e08a;font-weight:400">ZOMBIE · cần hoa</b>' : rp.flags & 4 ? '<b style="color:#ff6a5a;font-weight:400">GỤC NGÃ</b>' : '♥ ' + rp.hp + (rp.flags & 64 ? ` <b style="color:#9aff7a;font-weight:400">virus ${mmss(rp.inf || 0)}</b>` : '')}</div>`);
    const html = rows.join('');
    if (hud.last.team !== html) { hud.last.team = html; team.innerHTML = html; }
  } else if (hud.last.team) { hud.last.team = ''; team.innerHTML = ''; }
  document.querySelectorAll('#quick .qi').forEach((el) => {
    const n = player.bag[el.dataset.it] || 0;
    el.querySelector('b').textContent = n;
    el.classList.toggle('zero', !n);
  });
}

// ================= ÁNH SÁNG, KHÍ QUYỂN =================
const emitterMul = { lamp: 1, window: 1, fire: 1, inner: 1, power: 0, siren: 1, flower: 1 };
let power = false, curBuilding = null;
function flick(e, t) {
  if (e.flicker === 'fire') return 0.78 + 0.14 * Math.sin(t * 11 + e.phase) * Math.sin(t * 6.3 + e.phase * 2) + 0.08 * Math.sin(t * 23 + e.phase);
  if (e.flicker === 'broken') {
    const k = Math.floor(t * 9 + e.phase);
    const n = Math.abs(Math.sin(k * 12.9898 + e.phase) * 43758.5453) % 1;
    const slow = Math.sin(t * 0.37 + e.phase);
    return slow > 0.75 ? (n > 0.5 ? 0.05 : 0.6) : n > 0.94 ? 0.15 : 1;
  }
  if (e.flicker === 'lamp') return 0.97 + 0.03 * Math.sin(t * 50 + e.phase);
  if (e.flicker === 'sirenR') return Math.sin(t * 7.5) > 0.2 ? 1 : 0.04;
  if (e.flicker === 'sirenB') return Math.sin(t * 7.5 + Math.PI) > 0.2 ? 1 : 0.04;
  if (e.flicker === 'dead') return 0;
  return 1;
}
function updateLights(t, A) {
  emitterMul.lamp = A.lamps; emitterMul.window = A.windows; emitterMul.fire = A.fires; emitterMul.power = power ? 1 : 0;
  emitterMul.siren = 0.35 + 0.65 * A.night;
  emitterMul.flower = 0.3 + 0.7 * A.night;
  const n = quality === 'high' ? 10 : 6;
  for (const e of world.emitters) {
    e.cur = e.base * flick(e, t) * emitterMul[e.kind];
    const d = Math.hypot(e.pos.x - camTarget.x, (e.pos.z - camTarget.z) * 0.8);
    e.w = e.cur * (1 - clamp((d - 14) / 8, 0, 1));
    // đèn trong nhà chỉ bật khi người chơi đang ở trong toà nhà đó (tránh hắt sáng ra phố)
    if (e.building) e.w *= curBuilding && curBuilding.id === e.building ? 1.6 : 0;
  }
  for (const sr of world.sirens) {
    const k = emitterMul.siren;
    sr.mR.color.setRGB(0.3 + 3.8 * flick(sr.eR, t) * k, 0.15, 0.1);
    sr.mB.color.setRGB(0.1, 0.25, 0.4 + 4.6 * flick(sr.eB, t) * k);
  }
  for (const pm of world.powerMats) pm.m.emissiveIntensity = power ? pm.k : 0;
  const sorted = world.emitters.filter((e) => e.w > 0.05).sort((a, b) => b.w - a.w);
  for (let i = 0; i < pool.length; i++) {
    const l = pool[i], e = i < n ? sorted[i] : null;
    if (e) { l.position.copy(e.pos); l.color.copy(e.color); l.intensity = e.w; l.distance = e.dist; }
    else l.intensity = 0;
  }
  for (const L of world.lampHeads) L.mat.emissiveIntensity = 4.2 * (L.e.cur / Math.max(0.01, L.e.base));
  for (const m of world.windowMats) m.emissiveIntensity = 2.4 * A.windows;
  for (const gs of world.glowSprites) gs.s.material.color.copy(gs.color).multiplyScalar(gs.base * (gs.kind === 'fire' ? A.fires : A.lamps));
}
function applyAtmos(dt, t) {
  const A = atmos.update(dt);
  sun.color.copy(A.sunColor);
  sun.intensity = A.sunI + lightning * 3.5;
  hemi.color.copy(A.hemiSky); hemi.groundColor.copy(A.hemiGround);
  hemi.intensity = A.hemiI + lightning * 1.5;
  scene.fog.color.copy(A.fog); scene.fog.near = A.fogNear; scene.fog.far = A.fogFar;
  renderer.setClearColor(A.skyHor);
  const step = (sunSize * 2) / sun.shadow.mapSize.x;
  const sx = Math.round(camTarget.x / step) * step, sz = -3;
  sun.target.position.set(sx, 0, sz);
  sun.position.set(sx + A.sunDir.x * 50, A.sunDir.y * 50, sz + A.sunDir.z * 50);
  const P = post.params;
  P.exposure = A.exposure; P.bloom = A.bloom; P.threshold = A.threshold; P.sat = A.sat; P.contrast = A.contrast; P.vignette = A.vignette;
  P.lift = A.lift; P.gain = A.gain;
  P.flash = [hurtFlash * 0.25 + lightning * 0.5, lightning * 0.55, lightning * 0.65];
  U.wet.value = A.wet; U.wind.value = A.wind;
  if (world.water.material.uniforms) world.water.material.uniforms.uRain.value = A.rain;
  updateLights(t, A);
  const px = post.h / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
  fx.cones.update(0.24 + A.mist * 0.6 + A.rain * 0.5, camTarget.x);
  fx.rain.setLamps(A.rain > 0.01 ? fx.cones.near : []);
  fx.rain.update(camTarget, A.rain, A.wind, px);
  P.ssr = A.wet; P.rain = A.rain; P.ssrSteps = quality === 'high' ? 36 : 18; P.sky.copy(A.skyHor).lerp(A.fog, 0.4);
  fx.fireflies.update(A.fireflies, null, px);
  fx.ash.update(A.ash, camTarget, px);
  fx.mist.update(dt, t, A.mist, A.fog, camTarget.x);
  fx.shafts.update(t, A.shafts, A.sunColor, A.sunDir);
  fx.leaves.update(dt, t, A.leaves, world.canopies, camTarget, A.wind);
  fx.moths.update(t, world.lampHeads, camTarget, A.lamps > 0.5);
  fx.sky.update(t, A, camera.position.x, lightning);
  const wl = clamp(A.hemiI * 0.38 + A.sunI * 0.1 + lightning * 0.8, 0.3, 1.05);
  for (const m of world.waterMats) { m.uniforms.uLight.value = wl; m.uniforms.uTint.value.copy(A.hemiSky).lerp(new THREE.Color(1, 1, 1), 0.55); }
  fx.flock.update(dt, t, Math.max(A.birds, A.rain * 0.8 * (1 - A.night)), camTarget.x);
  fx.butterflies.update(t, A.butterflies, camTarget.x);
  U.win.value = A.windows;
  world.bulbMat.color.setScalar(0.15 + A.lamps * 1.6);
  if (A.lightning > 0.5 && state.mode !== 'loading') {
    lightningT -= dt;
    if (lightningT <= 0) { lightningT = rand(6, 14); lightning = 1; thunderQ.push(rand(0.3, 1.6)); }
  }
  lightning = Math.max(0, lightning - dt * (lightning > 0.5 ? 6 : 2.5));
  if (lightning > 0.4 && Math.random() < 0.1) lightning = 0.9;
  for (let i = thunderQ.length - 1; i >= 0; i--) { thunderQ[i] -= dt; if (thunderQ[i] <= 0) { sound.thunder(rand(0.6, 1)); thunderQ.splice(i, 1); } }
  sound.update(dt, {
    rain: A.rain, wind: A.wind,
    crickets: (1 - A.rain) * A.night * (A.ash > 0 ? 0.2 : 1), birds: A.birds,
    fire: Math.max(0, 1 - Math.hypot(player.x - world.campfire.x, player.z - world.campfire.z) / 9), music: state.mode === 'view' ? 0.6 : 1,
    water: Math.max(0, 1 - Math.abs(camTarget.x - (world.waterfalls[1].x0 + world.waterfalls[1].x1) / 2) / 16),
    gen: Math.max(0, 1 - Math.hypot(player.x - world.pois.generator.x, player.z - world.pois.generator.z) / 14),
    heli: heli && heli.group.visible ? Math.max(0.15, 1 - Math.abs(player.x - heli.group.position.x) / 40) : 0,
  });
  return A;
}

// ================= CHẾ ĐỘ NGẮM CẢNH (giống bảng điều khiển trong video mẫu) =================
const view = { zoom: 1, pan: 0, auto: false, target: null, dof: true, bloom: true, ui: true, drag: null, pinch: null, shot: false };
const VIEW_TIMES = { golden: 17.0, blue: 19.7, day: 11.5, night: 23.5, dawn: 5.9 };
function viewPxToWorld() { return (2 * Math.tan(THREE.MathUtils.degToRad(CAM.fov / 2)) * camera.position.distanceTo(camTarget)) / H; }
function startView() {
  sound.init();
  for (const z of zombies) releaseSprite(z);
  zombies = []; bullets = [];
  for (const p of pickups) scene.remove(p.mesh);
  pickups = []; floaters = [];
  fx.decals.clear();
  player = newPlayer(); setSpriteMap(player.sprite, 0);
  state.mode = 'view'; state.paused = false; phase = 'view';
  Object.assign(view, { zoom: 1, pan: 0, auto: false, target: null, dof: true, bloom: true, ui: true });
  atmos.hour = 17; atmos.setWeather('clear', true); atmos.rate = 0.35;
  $('title').classList.add('hidden'); $('view-ui').classList.remove('hidden'); $('view-show').classList.add('hidden');
  document.body.classList.add('viewing');
  syncView();
  toast(isTouch ? 'Kéo bên trái để đi dạo · kéo bên phải để dời cảnh · chụm 2 ngón để zoom' : 'Kéo chuột để dời cảnh · lăn chuột để zoom · WASD để đi dạo');
}
function exitView() {
  state.mode = 'title'; phase = 'title';
  post.params.dof = true;
  $('view-ui').classList.add('hidden'); $('view-show').classList.add('hidden'); $('title').classList.remove('hidden');
  document.body.classList.remove('viewing');
}
function viewAction(a) {
  if (VIEW_TIMES[a] !== undefined) { view.target = VIEW_TIMES[a]; view.auto = false; }
  else if (a === 'rain' || a === 'storm' || a === 'fog') atmos.setWeather(atmos.kind === a ? 'clear' : a);
  else if (a === 'auto') { view.auto = !view.auto; view.target = null; }
  else if (a === 'dof') view.dof = !view.dof;
  else if (a === 'bloom') view.bloom = !view.bloom;
  else if (a === 'hud') { view.ui = !view.ui; $('view-ui').classList.toggle('hidden', !view.ui); $('view-show').classList.toggle('hidden', view.ui); }
  else if (a === 'shot') view.shot = true;
  else if (a === 'pixel') toast('Pixel hoá: ' + cyclePixel() + 'x' + (pixelK === 1 ? ' (tắt)' : ''));
  else if (a === 'exit') exitView();
  syncView();
}
function viewKey(code) {
  const map = { Digit1: 'golden', Digit2: 'blue', Digit3: 'day', Digit4: 'night', Digit5: 'dawn', KeyR: 'rain', KeyT: 'storm', KeyF: 'fog', KeyN: 'auto', KeyG: 'dof', KeyB: 'bloom', KeyH: 'hud', KeyP: 'shot', KeyX: 'pixel', Escape: 'exit' };
  if (map[code]) viewAction(map[code]);
}
function syncView() {
  const h = ((atmos.hour % 24) + 24) % 24;
  const cur = view.target !== null ? view.target : h;
  const near = (t) => { const d = (((cur - t) % 24) + 24) % 24; return Math.min(d, 24 - d) < 0.7; };
  document.querySelectorAll('#view-bar .vb').forEach((b) => {
    const v = b.dataset.v;
    let on = false;
    if (VIEW_TIMES[v] !== undefined) on = !view.auto && near(VIEW_TIMES[v]);
    else if (v === 'rain' || v === 'storm' || v === 'fog') on = atmos.kind === v;
    else if (v === 'auto') on = view.auto;
    else if (v === 'dof') on = view.dof;
    else if (v === 'bloom') on = view.bloom;
    else if (v === 'pixel') on = pixelK > 1;
    b.classList.toggle('on', on);
  });
}
let toastT = 0;
function toast(msg) { const el = $('toast'); el.textContent = msg; el.classList.add('show'); toastT = 2.6; }
function updateViewer(dt) {
  if (view.auto) atmos.hour += dt * 0.4;
  else if (view.target !== null) {
    const diff = (((view.target - atmos.hour) % 24) + 24) % 24;
    const step = Math.min(diff, dt * Math.max(1.2, diff * 1.3));
    atmos.hour += step;
    if (diff < 0.01) { view.target = null; syncView(); }
  }
  // đi dạo tự do (không có zombie, không bắn)
  let mx = 0, mz = 0;
  if (keys.KeyW || keys.ArrowUp) mz -= 1;
  if (keys.KeyS || keys.ArrowDown) mz += 1;
  if (keys.KeyA || keys.ArrowLeft) mx -= 1;
  if (keys.KeyD || keys.ArrowRight) mx += 1;
  let mag = Math.hypot(mx, mz);
  if (mag > 0) { mx /= mag; mz /= mag; mag = 1; }
  const ms = stickVec(sticks.move);
  if (ms.m > 0) { mx = ms.x; mz = ms.y; mag = ms.m; }
  if (sticks.aim) { view.pan -= (sticks.aim.x - sticks.aim.lx) * viewPxToWorld(); sticks.aim.lx = sticks.aim.x; }
  const spd = player.speed * 0.8 * mag;
  player.x += mx * spd * dt; player.z += mz * spd * dt * 0.8;
  collide(player);
  player.moving = mag > 0.1;
  if (player.moving) { player.walk += dt * spd * 1.6; player.aim = Math.atan2(mz, mx); view.pan *= Math.exp(-dt * 1.5); }
  setFrame(player.sprite, dirFromAngle(player.aim), player.moving ? Math.floor(player.walk) % 4 : 0);
  player.sprite.group.position.set(player.x, 0, player.z);
  const ca = Math.cos(player.aim), sa = Math.sin(player.aim);
  flashlight.position.set(player.x + ca * 0.3, 1.15, player.z + sa * 0.3);
  flashlight.target.position.set(player.x + ca * 9, 0.15, player.z + sa * 9);
  const hh = ((atmos.hour % 24) + 24) % 24;
  $('view-clock').textContent = String(Math.floor(hh)).padStart(2, '0') + ':' + String(Math.floor((hh % 1) * 60)).padStart(2, '0') + ' · ' + atmos.weatherName;
}

// ================= CẬP NHẬT =================
function updatePlayer(dt) {
  if (player.zombie) { updateZombieForm(dt); return; }
  if (net.active && (player.downed > 0 || player.dead || player.boarded)) {
    if (player.downed > 0) {
      player.downed -= dt;
      if (player.downed <= 0) { player.downed = 0; turnZombie(); return; }
    }
    player.sprite.mesh.rotation.x = player.downed > 0 ? -Math.PI / 2 : 0;
    player.sprite.group.position.set(player.x, 0.05, player.z);
    player.firing = false; player.searching = false; player.moving = false;
    $('t-use').classList.add('off');
    interact.target = null;
    return;
  }
  player.sprite.mesh.rotation.x = 0;
  if (player.infected > 0) {
    player.infected -= dt;
    player.coughT -= dt;
    if (player.coughT <= 0) { player.coughT = rand(9, 20) * (0.35 + player.infected / INFECT_TIME); sound.cough(); }
    if (player.infected <= 0) { turnZombie(); return; }
  }
  let mx = 0, mz = 0;
  if (keys.KeyW || keys.ArrowUp) mz -= 1;
  if (keys.KeyS || keys.ArrowDown) mz += 1;
  if (keys.KeyA || keys.ArrowLeft) mx -= 1;
  if (keys.KeyD || keys.ArrowRight) mx += 1;
  let mag = Math.hypot(mx, mz);
  if (mag > 0) { mx /= mag; mz /= mag; mag = 1; }
  const ms = stickVec(sticks.move);
  if (ms.m > 0) { mx = ms.x; mz = ms.y; mag = ms.m; }
  const sprint = (keys.ShiftLeft || keys.ShiftRight || ms.m > 0.97) && mag > 0 && player.stamina > 0.05;
  player.stamina = clamp(player.stamina + (sprint ? -0.4 : 0.22) * dt, 0, 1);
  const spd = player.speed * (sprint ? 1.55 : 1) * mag * (player.action || player.searching ? 0.45 : 1);
  player.x += mx * spd * dt; player.z += mz * spd * dt * 0.8;
  collide(player);
  player.moving = mag > 0.1;
  // đói, khát: cạn thì mất máu dần
  player.water = Math.max(0, player.water - dt * (100 / 420) * (sprint ? 1.7 : 1));
  player.food = Math.max(0, player.food - dt * (100 / 640));
  if (player.water <= 0 || player.food <= 0) {
    player.starve += dt;
    if (player.starve > 1.6) {
      player.starve = 0; player.hp -= player.water <= 0 && player.food <= 0 ? 3 : 2; hurtFlash = Math.max(hurtFlash, 0.18); hud.dirty = true;
      if (player.hp <= 0) { playerDied(); return; }
    }
  }
  if (player.moving) {
    player.walk += dt * spd * 1.6;
    player.stepT -= dt * spd;
    if (player.stepT <= 0) { player.stepT = 1.6; if (sprint) fx.lit.spawn(player.x, 0.05, player.z, rand(-0.5, 0.5), rand(0.4, 1), rand(-0.3, 0.3), 0.7, 0.14, '#6a5a48', { grav: 1.5, drag: 3 }); }
  }
  let firing = false;
  const as = stickVec(sticks.aim);
  if (as.m > 0) { player.aim = Math.atan2(as.y * 0.8, as.x); firing = as.m > 0.35; }
  else if (!isTouch && mouse.has) {
    const p = aimPoint(mouse.x, mouse.y);
    if (p) player.aim = Math.atan2(p.z - player.z, p.x - player.x);
    else player.aim = mouse.x > W / 2 ? 0 : Math.PI;
    firing = mouse.down;
  } else if (player.moving) player.aim = Math.atan2(mz, mx);
  if (keys.Space) firing = true;
  if (bagOpen || player.searching) firing = false;
  player.firing = firing && !player.action;
  player.cooldown -= dt;
  player.swing = Math.max(0, player.swing - dt);
  if (player.action) {
    player.action.t += dt;
    if (player.action.t >= player.action.dur) finishAction();
  }
  updateInteract(dt);
  player.recoil = Math.max(0, player.recoil - dt * 1.2);
  player.inv -= dt;
  if (player.reloading > 0) {
    player.reloading -= dt;
    if (player.reloading <= 0) {
      const g = curGun(), w = WEAPONS[player.weapon], take = Math.min(w.mag - g.ammo, player.bag[w.ammo] || 0);
      g.ammo += take; player.bag[w.ammo] -= take;
      player.reloading = 0; hud.dirty = true;
    }
  }
  if (firing) shoot();
  const sp = player.sprite;
  player.dir = player.searching ? 'up' : dirFromAngle(player.aim);
  setFrame(sp, player.dir, player.moving || player.searching ? Math.floor(player.searching ? gtime * 7 : player.walk) % 4 : 0);
  sp.group.position.set(player.x - Math.cos(player.aim) * player.recoil, 0, player.z - Math.sin(player.aim) * player.recoil);
  sp.mat.color.setScalar(player.inv > 0 && Math.floor(player.inv * 20) % 2 ? 2.2 : 1);
  const ca = Math.cos(player.aim), sa = Math.sin(player.aim);
  flashlight.position.set(player.x + ca * 0.3, 1.15, player.z + sa * 0.3);
  flashlight.target.position.set(player.x + ca * 9, 0.15, player.z + sa * 9);
}

function zombieTerrace(z, dt) {
  const s = z.sprite;
  const spd = z.speed * 0.9;
  if (z.state === 'terrace') {
    const dx = z.tx - z.x;
    if (Math.abs(dx) > 0.15) { z.x += Math.sign(dx) * Math.min(Math.abs(dx), spd * dt); z.dir = dx > 0 ? 'right' : 'left'; }
    else z.state = z.stair ? 'stairtop' : 'edge';
  } else if (z.state === 'edge') {
    const tz = WALL_Z - 0.25;
    z.z += Math.min(tz - z.z, spd * dt); z.dir = 'down';
    if (Math.abs(tz - z.z) < 0.05) { z.state = 'drop'; z.t = 0; z.z0 = z.z; }
  } else if (z.state === 'stairtop') {
    const tz = WALL_Z - STAIR_DEPTH + 0.1;
    z.dir = 'down';
    if (z.z < tz) z.z = Math.min(tz, z.z + spd * dt); else z.z = Math.max(tz, z.z - spd * dt);
    if (Math.abs(tz - z.z) < 0.05) z.state = 'stairs';
  } else if (z.state === 'stairs') {
    z.z += spd * 0.8 * dt; z.dir = 'down';
    z.y = TY * clamp((WALL_Z - z.z) / STAIR_DEPTH, 0, 1);
    if (z.z >= WALL_Z + 0.55) { z.y = 0; z.state = 'walk'; }
  } else if (z.state === 'wade') {
    const tz = STREET_FRONT - 0.15;
    z.z = Math.max(tz, z.z - spd * 0.7 * dt); z.dir = 'up';
    z.y = -0.6 * clamp((z.z - tz) / Math.max(0.1, z.z0 - tz), 0, 1);
    if (Math.random() < 0.15) fx.spark.spawn(z.x + rand(-0.3, 0.3), -0.8, z.z + 0.1, rand(-0.5, 0.5), rand(0.5, 1.5), rand(0, 0.5), 0.4, 0.05, '#8ab0c8', { grav: 8, mode: 1 });
    if (z.z <= tz + 0.01) { z.y = 0; z.state = 'walk'; }
  } else if (z.state === 'drop') {
    z.t += dt / 0.6;
    const k = Math.min(1, z.t);
    z.z = z.z0 + (WALL_Z + 0.8 - z.z0) * k;
    z.y = TY * (1 - k) + Math.sin(k * Math.PI) * 0.7;
    if (k >= 1) {
      z.y = 0; z.state = 'walk';
      for (let i = 0; i < 8; i++) fx.lit.spawn(z.x + rand(-0.4, 0.4), 0.05, z.z + rand(-0.3, 0.3), rand(-1.2, 1.2), rand(0.5, 1.5), rand(-0.5, 0.5), 0.8, 0.13, '#6a5a48', { grav: 4, drag: 3 });
      sound.rise(z.x, z.z);
      if (Math.abs(z.x - player.x) < 10) shake = Math.max(shake, z.type === 'brute' ? 0.35 : 0.12);
    }
  }
  z.walk += dt * spd * 2.6;
  setFrame(s, z.dir, Math.floor(z.walk) % 4);
  s.group.position.set(z.x, z.y, z.z);
}

function updateZombies(dt) {
  if (net.active && !net.host) { clientZombies(dt); return; }
  computeTargets();
  if (NAV.block && TG.length) navCompute();
  for (let i = 0; i < zombies.length; i++) {
    const z = zombies[i], s = z.sprite;
    z.t += dt;
    if (z.state === 'dead') {
      const k = Math.min(1, z.t / 0.35);
      s.mesh.rotation.x = -k * k * Math.PI / 2;
      if (z.t > CORPSE_LIFE - 2) s.group.position.y = -(z.t - (CORPSE_LIFE - 2)) * 0.4;
      if (z.t > CORPSE_LIFE) { releaseSprite(z); zombies.splice(i, 1); i--; }
      continue;
    }
    if (z.state === 'rise') {
      const k = Math.min(1, z.t / 1.8);
      s.group.position.set(z.x, z.riseLevel - s.h * (1 - k), z.z);
      if (Math.random() < 0.3) fx.lit.spawn(z.x + rand(-0.4, 0.4), z.riseLevel + 0.05, z.z + rand(-0.3, 0.3), rand(-0.6, 0.6), rand(1, 2.5), rand(-0.4, 0.4), 0.8, 0.1, '#3e2c1e', { grav: 9 });
      setFrame(s, 'down', Math.floor(z.t * 6) % 4);
      s.mat.color.setScalar(z.hitT > 0 ? 3 : 1);
      z.hitT -= dt;
      if (k >= 1) {
        z.y = z.riseLevel;
        if (z.riseLevel > 0.5) { z.state = 'terrace'; z.z = WALL_Z - 1.5; terracePlan(z); }
        else if (z.riseLevel < -0.1) { z.state = 'wade'; z.z0 = z.z; }
        else z.state = 'walk';
      }
      continue;
    }
    if (z.state !== 'walk') { zombieTerrace(z, dt); s.mat.color.setScalar(1); continue; }
    if (!z.aggro) {
      // chưa phát hiện: đứng lắc lư / đi lang thang quanh chỗ cũ; tỉnh khi người chơi lại gần
      const zb = buildingAt(z.x, z.z);
      let near = false;
      for (const t of TG) { const pd = Math.hypot(t.x - z.x, t.z - z.z), same = zb === t.b; if (pd < (same ? 6.5 : 3.2) || (same && !t.b && pd < 8.5)) near = true; }
      if (state.mode === 'play' && near) wake(z);
      else {
        z.wt = (z.wt || 0) - dt;
        const H = z.home;
        if (z.wt <= 0) { z.wt = rand(2.5, 6); z.wx = H.x + (H.roam ? rand(-5, 5) : rand(-1.4, 1.4)); z.wz = clamp(H.z + rand(-1.0, 1.0), BOUNDS.z0 + 0.3, BOUNDS.z1 - 0.3); }
        const ex = z.wx - z.x, ez = z.wz - z.z, el = Math.hypot(ex, ez);
        if (el > 0.15) { const sp2 = z.speed * 0.32 * dt; z.x += ex / el * sp2; z.z += ez / el * sp2; collide(z); z.walk += dt * z.speed * 0.9; z.dir = dirFromAngle(Math.atan2(ez, ex)); }
        z.hitT -= dt;
        setFrame(s, z.dir, el > 0.15 ? Math.floor(z.walk) % 4 : 0);
        s.group.position.set(z.x, 0, z.z);
        s.mat.color.setScalar(1);
        continue;
      }
    }
    let T = null, best = 1e9;
    for (const t of TG) { const dd = (t.x - z.x) ** 2 + (t.z - z.z) ** 2; if (dd < best) { best = dd; T = t; } }
    if (!T) { z.walk += dt; setFrame(s, z.dir, 0); s.group.position.set(z.x, 0, z.z); continue; }
    let dx = T.x - z.x, dz = T.z - z.z;
    const d = Math.hypot(dx, dz) || 1;
    dx /= d; dz /= d;
    if (d > 1.0 && !(d < 7 && navLOS(z.x, z.z, T.x, T.z)) && navDir(z)) { dx = navOut.x; dz = navOut.z; }
    if (z.stuck > 0.6) { const sx = -dz * z.side, sz = dx * z.side; dx = dx * 0.4 + sx * 0.6; dz = dz * 0.4 + sz * 0.6; z.stuck -= dt; if (z.stuck > 1.2) { z.stuck = 0; z.side *= -1; } }
    z.ux = z.ux === undefined ? dx : z.ux + (dx - z.ux) * Math.min(1, dt * 7);
    z.uz = z.uz === undefined ? dz : z.uz + (dz - z.uz) * Math.min(1, dt * 7);
    const ul = Math.hypot(z.ux, z.uz) || 1;
    dx = z.ux / ul; dz = z.uz / ul;
    for (let j = i + 1; j < zombies.length; j++) {
      const o = zombies[j];
      if (o.state !== 'walk') continue;
      const ex = z.x - o.x, ez = z.z - o.z, ed = ex * ex + ez * ez, rr = z.r + o.r;
      if (ed < rr * rr && ed > 1e-4) { const e = Math.sqrt(ed), p = (rr - e) / 2, nx = ex / e, nz = ez / e; z.x += nx * p; z.z += nz * p; o.x -= nx * p; o.z -= nz * p; }
    }
    const ox = z.x, oz = z.z;
    const spd = z.speed * (z.hitT > 0 ? 0.35 : 1);
    z.x += dx * spd * dt; z.z += dz * spd * dt;
    if (collide(z)) {
      const moved = Math.hypot(z.x - ox, z.z - oz);
      if (moved < spd * dt * 0.5) z.stuck += dt; else z.stuck = Math.max(0, z.stuck - dt);
    } else z.stuck = Math.max(0, z.stuck - dt);
    z.walk += dt * spd * (z.type === 'runner' ? 2.2 : 2.6);
    z.hitT -= dt; z.atkT -= dt;
    z.dir = dirFromAngle(Math.atan2(T.z - z.z, T.x - z.x));
    setFrame(s, z.dir, Math.floor(z.walk) % 4);
    s.group.position.set(z.x, 0, z.z);
    s.mat.color.setScalar(z.hitT > 0 ? 3 : 1);
    if (T.me && d < z.r + player.r + 0.28 && z.atkT <= 0) {
      z.atkT = z.atkCd;
      hurtPlayer(z, d);
      if (state.mode !== 'play') return;
    }
  }
}

function updateBullets(dt) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.px = b.x; b.pz = b.z;
    b.x += b.vx * dt; b.z += b.vz * dt; b.life -= dt;
    let dead = b.life <= 0 || b.x < BOUNDS.x0 - 6 || b.x > BOUNDS.x1 + 6 || b.z > BOUNDS.z1 + 14;
    if (!dead && bulletBlocked(b.x, b.z)) {
      dead = true;
      for (let k = 0; k < 6; k++) fx.spark.spawn(b.x, 1, b.z, rand(-3, 3), rand(0, 3), rand(-3, 3), rand(0.1, 0.25), 0.06, '#ffe0a0', { grav: 8, mode: 1 });
      for (let k = 0; k < 3; k++) fx.lit.spawn(b.x, 1, b.z, rand(-1, 1), rand(0, 2), rand(-1, 1), 0.8, 0.08, '#8a8070', { grav: 9 });
      sound.hit(b.x, b.z);
    }
    if (!dead) {
      const sx = b.x - b.px, sz = b.z - b.pz, sl = sx * sx + sz * sz || 1e-6;
      for (let j = zombies.length - 1; j >= 0; j--) {
        const z = zombies[j];
        if (z.state === 'dead' || z.y > 0.3 || (z.state === 'rise' && z.riseLevel > 0.3)) continue;
        if (z.state === 'rise' && z.t < 0.6) continue;
        const t = clamp(((z.x - b.px) * sx + (z.z - b.pz) * sz) / sl, 0, 1);
        const cx = b.px + sx * t, cz = b.pz + sz * t;
        if ((z.x - cx) ** 2 + (z.z - cz) ** 2 < (z.r + 0.14) ** 2) {
          damageZombie(z, b.dmg, Math.atan2(b.vz, b.vx), 0.16, cx, cz);
          if (b.pierce-- <= 0) { dead = true; break; }
        }
      }
    }
    if (dead) bullets.splice(i, 1);
  }
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3(), E = new THREE.Euler();
  let n = 0;
  for (const b of bullets) {
    if (n >= 64) break;
    const a = Math.atan2(b.vz, b.vx), len = 1.1;
    P.set(b.x - Math.cos(a) * len / 2, 1.0, b.z - Math.sin(a) * len / 2);
    Q.setFromEuler(E.set(0, -a, 0));
    M.compose(P, Q, S.set(len, 0.045, 0.045));
    tracerMesh.setMatrixAt(n++, M);
  }
  tracerMesh.count = n;
  tracerMesh.instanceMatrix.needsUpdate = true;
}

function updatePickups(dt) {
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i];
    p.t -= dt;
    p.mesh.position.y = 0.1 + Math.sin(gtime * 4 + p.x) * 0.08;
    p.mesh.visible = !(p.t < 4 && Math.floor(gtime * 8) % 2);
    if (Math.hypot(p.x - player.x, p.z - player.z) < 0.85) {
      if (p.type === 'med') { player.hp = Math.min(player.maxHp, player.hp + 30); floaters.push({ x: p.x, y: 1.8, z: p.z, text: '+30 MÁU', t: 1.2, color: '#7fe07f' }); }
      else { player.guns.forEach((g, k) => { if (g.owned && g.reserve !== Infinity) g.reserve += WEAPONS[k].mag; }); floaters.push({ x: p.x, y: 1.8, z: p.z, text: '+ĐẠN', t: 1.2, color: '#f2c14e' }); }
      sound.pickup(); hud.dirty = true;
      scene.remove(p.mesh); pickups.splice(i, 1);
    } else if (p.t <= 0) { scene.remove(p.mesh); pickups.splice(i, 1); }
  }
}

function updateWaves(dt) {
  if (phase !== 'night' || toSpawn <= 0) return;
  spawnTimer -= dt;
  const alive = zombies.filter((z) => z.state !== 'dead' && z.aggro).length;
  if (spawnTimer <= 0 && alive < (quality === 'high' ? 40 : 28)) {
    const batch = Math.min(toSpawn, 1 + Math.floor(wave / 3));
    for (let i = 0; i < batch; i++) if (spawnZombie()) toSpawn--;
    // rải đều đợt zombie trong khoảng 2/3 đầu của đêm
    spawnTimer = clamp((NIGHT_LEN * 0.65 / Math.max(1, nightTotal)) * batch, 0.35, 4) * rand(0.7, 1.3);
    hud.dirty = true;
  }
}

function updateCamera(dt) {
  let tx = player.x;
  if (net.active && (player.dead || player.boarded)) { const rp = [...net.players.values()].find((r) => r.alive); if (rp) tx = rp.x; }
  if (state.mode === 'play') tx += Math.cos(player.aim) * (isTouch ? 1.5 : 2.4);
  if (state.mode === 'title') tx = Math.sin(gtime * 0.035) * 38;
  if (state.mode === 'view') tx = player.x + view.pan;
  tx = clamp(tx, BOUNDS.x0 + 9, BOUNDS.x1 - 9);
  if (state.mode === 'view') view.pan = tx - player.x;
  const k = Math.min(1, dt * (state.mode === 'title' ? 1 : 4));
  camTarget.x += (tx - camTarget.x) * k;
  camTarget.z = 1;
  shake = Math.max(0, shake - dt * 1.8);
  // toà nhà người chơi đang đứng trong: tường trước tự "cắt" như nhà búp bê
  curBuilding = state.mode === 'title' ? null : buildingAt(player.x, player.z);
  for (const b of world.buildings) b.cut.value += ((curBuilding === b ? 1 : 0) - b.cut.value) * Math.min(1, dt * 6);
  camInside += ((curBuilding ? 1 : 0) - camInside) * Math.min(1, dt * 3);
  placeCamera(shake);
  sound.setListener(camTarget.x, camTarget.z);
  tmpV.set(player.x, 1.0, player.z).project(camera);
  U.seeCenter.value.set((tmpV.x * 0.5 + 0.5) * post.w, (tmpV.y * 0.5 + 0.5) * post.h);
  U.seeRadius.value = post.h * 0.13;
  tmpV.set(player.x, 1.0, player.z).applyMatrix4(camera.matrixWorldInverse);
  U.seeDepth.value = -tmpV.z - 1.0;
  U.seeZ.value = state.mode === 'title' || curBuilding ? 999 : player.z;
  post.params.focus = -tmpV.z;
  U.push.value[0].set(player.x, 0, player.z, 1.1);
  const near = zombies.filter((z) => z.state === 'walk').map((z) => ({ z, d: Math.abs(z.x - camTarget.x) })).sort((a, b) => a.d - b.d);
  for (let i = 1; i < 6; i++) { const o = near[i - 1]; if (o) U.push.value[i].set(o.z.x, 0, o.z.z, o.z.r + 0.5); else U.push.value[i].set(0, -99, 0, 0.01); }
}

// ---------- lớp 2D: số sát thương, cần điều khiển, tâm ngắm ----------
function draw2D() {
  const g = g2;
  g.setTransform(ODPR, 0, 0, ODPR, 0, 0);
  g.clearRect(0, 0, W, H);
  g.imageSmoothingEnabled = false;
  g.textAlign = 'center';
  g.font = '22px "VT323", monospace';
  for (const f of floaters) {
    tmpV.set(f.x, f.y, f.z).project(camera);
    const x = (tmpV.x * 0.5 + 0.5) * W, y = (-tmpV.y * 0.5 + 0.5) * H;
    g.globalAlpha = clamp(f.t * 2.5, 0, 1);
    g.fillStyle = '#000'; g.fillText(f.text, Math.round(x) + 2, Math.round(y) + 2);
    g.fillStyle = f.color; g.fillText(f.text, Math.round(x), Math.round(y));
  }
  g.globalAlpha = 1;
  for (const z of zombies) {
    if (z.state === 'dead' || (z.hp >= z.maxHp && z.type !== 'brute')) continue;
    tmpV.set(z.x, z.y + z.sprite.h + 0.25, z.z).project(camera);
    const x = Math.round((tmpV.x * 0.5 + 0.5) * W), y = Math.round((-tmpV.y * 0.5 + 0.5) * H);
    if (x < -40 || x > W + 40 || y < -40 || y > H + 40) continue;
    const w = z.type === 'brute' ? 44 : 30;
    g.fillStyle = 'rgba(0,0,0,.7)'; g.fillRect(x - w / 2 - 1, y - 1, w + 2, 6);
    g.fillStyle = '#c9261b'; g.fillRect(x - w / 2, y, w * Math.max(0, z.hp / z.maxHp), 4);
  }
  if (net.active && state.mode !== 'title') for (const rp of net.players.values()) {
    if (!rp.inited || rp.flags & (8 | 16)) continue;
    if (rp.flags & 128 || rp.pingT > 0) {
      tmpV.set(rp.x, 1.2, rp.z).project(camera);
      const sx = (tmpV.x * 0.5 + 0.5) * W;
      if (sx < 30 || sx > W - 30) {
        const left = sx < 30, ex = left ? 36 : W - 36, ey = H * 0.42 + (rp.color || 0) * 26;
        g.font = '18px "VT323", monospace';
        g.fillStyle = 'rgba(10,8,14,.8)'; g.fillRect(ex - 58, ey - 15, 116, 22);
        g.fillStyle = rp.flags & 128 ? '#b8e08a' : PLAYER_COLORS[rp.color || 0];
        g.fillText(`${left ? '◀ ' : ''}${rp.name} ${Math.round(Math.abs(rp.x - player.x))}m${left ? '' : ' ▶'}`, ex, ey + 1);
      }
    }
    if (rp.flags & 128) {
      tmpV.set(rp.x, 2.3, rp.z).project(camera);
      const x = Math.round((tmpV.x * 0.5 + 0.5) * W), y = Math.round((-tmpV.y * 0.5 + 0.5) * H);
      g.font = '18px "VT323", monospace';
      g.fillStyle = '#000'; g.fillText(rp.name, x + 1, y + 1); g.fillStyle = '#b8e08a'; g.fillText(rp.name, x, y);
      g.fillStyle = Math.floor(gtime * 2) % 2 ? '#ff6a7a' : '#ffffff'; g.fillText('ZOMBIE · cho ăn hoa bỉ ngạn', x, y - 18);
      continue;
    }
    const down = rp.flags & 4;
    tmpV.set(rp.x, down ? 0.9 : 2.3, rp.z).project(camera);
    const x = Math.round((tmpV.x * 0.5 + 0.5) * W), y = Math.round((-tmpV.y * 0.5 + 0.5) * H);
    if (x < -60 || x > W + 60 || y < -40 || y > H + 40) continue;
    g.font = '18px "VT323", monospace';
    g.fillStyle = '#000'; g.fillText(rp.name, x + 1, y + 1);
    g.fillStyle = PLAYER_COLORS[rp.color || 0]; g.fillText(rp.name, x, y);
    if (down) { g.fillStyle = Math.floor(gtime * 3) % 2 ? '#ff6a5a' : '#ffffff'; g.fillText('GỤC NGÃ · giữ E để cứu', x, y - 18); }
    else { g.fillStyle = 'rgba(0,0,0,.7)'; g.fillRect(x - 16, y + 4, 32, 5); g.fillStyle = '#7fe07f'; g.fillRect(x - 15, y + 5, 30 * clamp(rp.hp / 100, 0, 1), 3); }
  }
  if (state.mode === 'play' && interact.target && !bagOpen) {
    const tg = interact.target, inf = tg.info;
    tmpV.set(tg.x, 1.7, tg.z).project(camera);
    const x = Math.round((tmpV.x * 0.5 + 0.5) * W), y = Math.round((-tmpV.y * 0.5 + 0.5) * H);
    const text = inf.can ? (isTouch ? inf.label : '[E] ' + inf.label) : inf.label;
    g.font = '20px "VT323", monospace';
    const tw = Math.ceil(g.measureText(text).width) + 20;
    g.fillStyle = 'rgba(10,8,14,.8)'; g.fillRect(x - tw / 2, y - 17, tw, 25);
    g.strokeStyle = inf.can ? '#f2c14e' : '#5a5060'; g.lineWidth = 2; g.strokeRect(x - tw / 2, y - 17, tw, 25);
    g.fillStyle = inf.can ? '#fff6dc' : '#a8a0a8'; g.fillText(text, x, y + 1);
    if (inf.can && interact.t > 0) {
      g.fillStyle = '#000'; g.fillRect(x - tw / 2, y + 9, tw, 5);
      g.fillStyle = '#f2c14e'; g.fillRect(x - tw / 2, y + 9, tw * Math.min(1, interact.t / inf.time), 5);
    }
  }
  if (state.mode === 'play' && player.action) {
    tmpV.set(player.x, 2.35, player.z).project(camera);
    const x = Math.round((tmpV.x * 0.5 + 0.5) * W), y = Math.round((-tmpV.y * 0.5 + 0.5) * H);
    const k = Math.min(1, player.action.t / player.action.dur);
    g.font = '18px "VT323", monospace';
    g.fillStyle = '#000'; g.fillText(ACTION_TEXT[player.action.item] || '', x + 1, y - 7);
    g.fillStyle = '#e8f0d8'; g.fillText(ACTION_TEXT[player.action.item] || '', x, y - 8);
    g.fillStyle = 'rgba(0,0,0,.75)'; g.fillRect(x - 31, y - 2, 62, 7);
    g.fillStyle = '#7fe07f'; g.fillRect(x - 30, y - 1, 60 * k, 5);
  }
  if (state.mode === 'play' && !state.paused) {
    if (!isTouch && mouse.has) {
      const sp = 7 + player.recoil * 30, x = Math.round(mouse.x), y = Math.round(mouse.y);
      g.fillStyle = 'rgba(0,0,0,.6)';
      for (const [dx, dy, w, h] of [[-sp - 7, -1, 7, 4], [sp, -1, 7, 4], [-1, -sp - 7, 4, 7], [-1, sp, 4, 7]]) g.fillRect(x + dx, y + dy, w, h);
      g.fillStyle = '#fff6dc';
      for (const [dx, dy, w, h] of [[-sp - 6, 0, 6, 2], [sp, 0, 6, 2], [0, -sp - 6, 2, 6], [0, sp, 2, 6]]) g.fillRect(x + dx, y + dy, w, h);
      g.fillRect(x, y, 2, 2);
    }
    if (isTouch) {
      for (const k of ['move', 'aim']) {
        const st = sticks[k];
        if (!st) continue;
        g.strokeStyle = 'rgba(255,240,210,.35)'; g.lineWidth = 3;
        g.beginPath(); g.arc(st.ox, st.oy, 56, 0, TAU); g.stroke();
        g.fillStyle = k === 'aim' ? 'rgba(220,60,40,.55)' : 'rgba(255,240,210,.35)';
        g.beginPath(); g.arc(st.x, st.y, 24, 0, TAU); g.fill();
      }
      const ha = clamp(1 - (gtime - playStart - 8) / 3, 0, 1);
      if (ha > 0) {
        g.font = '20px "VT323", monospace'; g.fillStyle = `rgba(255,240,210,${0.4 * ha})`;
        if (!sticks.move) g.fillText('← kéo để di chuyển', W * 0.25, H * 0.56);
        if (!sticks.aim) g.fillText('kéo để ngắm & bắn →', W * 0.75, H * 0.56);
      }
    }
  }
}

// ================= MÀN HÌNH =================
function togglePause() {
  if (state.mode !== 'play') return;
  if (net.active) { toast('Không tạm dừng được khi chơi co-op'); return; }
  state.paused = !state.paused;
  $('pause').classList.toggle('hidden', !state.paused);
}
function bestScore() { return +store.get('deadnight_days', '0') || 0; }
function startGame() {
  sound.init();
  for (const z of zombies) releaseSprite(z);
  zombies = []; bullets = [];
  for (const p of pickups) scene.remove(p.mesh);
  pickups = []; floaters = [];
  fx.decals.clear();
  for (const c of world.containers) if (c.corpse) fx.decals.add(c.x, c.z, 1.9);
  player = newPlayer();
  player.sprite.group.visible = true;
  setSpriteMap(player.sprite, player.weapon);
  wave = 0; kills = 0; score = 0; shake = 0; hurtFlash = 0;
  state.mode = 'play'; state.paused = false; playStart = gtime;
  for (const id of ['title', 'over', 'pause', 'win', 'bag']) $(id).classList.add('hidden');
  bagOpen = false;
  document.body.classList.add('playing');
  hud.dirty = true;
  resetWorldState(); questReset();
  if (!net.active || net.host) { DAY_LEN = DURATIONS[durKey].day; NIGHT_LEN = DURATIONS[durKey].night; }
  dayNo = 1;
  atmos.hour = 7.4; dayStartHour = 7.4; atmos.setWeather('clear', true); atmos.rate = 0.12;
  startDay(true);
  player.downed = 0; player.dead = false; player.boarded = false;
  setZombieLook(false); clearFlowers(); flowerDay = -1; $('t-use').textContent = 'LỤC';
  if (!net.active || net.host) { spawnLurkers(); for (let i = 0; i < 3; i++) spawnStray(); }
  net.gameId = Math.floor(Math.random() * 1e9);
  sound.generator(false); sound.heli(false);
  // chế độ chụp ảnh để kiểm tra đồ hoạ: ?shot=<giờ>&w=<rain|storm|fog|blood>&px=..
  if (QS.has('shot')) {
    phase = 'shot';
    atmos.hour = +QS.get('shot'); atmos.setWeather(QS.get('w') || 'clear', true); atmos.update(0);
    if (QS.has('px')) player.x = +QS.get('px');
    if (QS.has('pz')) player.z = +QS.get('pz');
    player.hp = player.maxHp = 1e6; toSpawn = 0;
    const types = ['walker', 'runner', 'walker', 'brute', 'walker'];
    types.forEach((t, i) => spawnAt(t, player.x + (i % 2 ? 1 : -1) * rand(3, 7), rand(WALL_Z + 0.5, BOUNDS.z1 - 0.3)));
    camTarget.x = player.x;
    window.__dn = { get zombies() { return zombies; }, get player() { return player; }, camera, size: () => [W, H] };
    window.__setHour = (h, w) => { atmos.hour = h; if (w && w !== atmos.kind) atmos.setWeather(w, true); };
  }
}
function spawnAt(type, x, z) {
  const zz = newZombie(type, x, 0, z, 'walk');
  zz.speed *= 0.3; zz.dmg = 0; zz.atkT = 1e9;
}
function gameOver(title) {
  $('ov-title').textContent = title || (net.active ? 'CẢ ĐỘI ĐÃ GỤC NGÃ' : 'BẠN ĐÃ CHẾT');
  state.mode = 'over';
  player.hp = 0; player.action = null; player.searching = false;
  if (bagOpen) { bagOpen = false; $('bag').classList.add('hidden'); }
  const best = Math.max(bestScore(), dayNo);
  store.set('deadnight_days', String(best));
  document.body.classList.remove('playing');
  $('ov-night').textContent = dayNo; $('ov-kills').textContent = kills; $('ov-loot').textContent = player.lootCount; $('ov-best').textContent = best;
  $('ov-time').textContent = Math.max(1, Math.round((gtime - playStart) / 60));
  setTimeout(() => $('over').classList.remove('hidden'), 900);
}
function toMenu() {
  for (const z of zombies) releaseSprite(z);
  zombies = []; bullets = []; floaters = [];
  for (const id of ['over', 'win', 'pause', 'bag']) $(id).classList.add('hidden');
  document.body.classList.remove('playing');
  state.mode = 'title'; state.paused = false; phase = 'title';
  player.zombie = false; player.infected = 0; setZombieLook(false); clearFlowers(); flowerDay = -1;
  sound.generator(false); sound.heli(false);
  if (heli) heli.group.visible = false;
  $('best').textContent = bestScore();
  $('title').classList.remove('hidden');
}
function setQualityLabel() {
  $('q-btn').textContent = 'Đồ hoạ: ' + (quality === 'high' ? 'Cao' : 'Nhẹ');
  $('dur-btn').textContent = `Thời lượng: ${DURATIONS[durKey].name} (${DURATIONS[durKey].est})`;
  $('px-btn').textContent = 'Pixel: ' + pixelK + 'x';
  const vb = document.querySelector('#view-bar .vb[data-v="pixel"]');
  if (vb) vb.textContent = 'Pixel ' + pixelK + 'x';
}
function cyclePixel() {
  pixelK = pixelK % 3 + 1;
  store.set('deadnight_px', String(pixelK));
  post.setPixel(pixelK);
  setQualityLabel();
  return pixelK;
}

// ================= KHỞI TẠO =================
function init() {
  resize();
  setupShadowsAndPool();
  placeCamera();
  camera.updateMatrixWorld();
  camQuat.copy(camera.quaternion);
  world = buildWorld(scene, quality);
  navBuild();
  SPR = makeCharacterSprites();
  pickupAtlas = makePickupAtlas();
  buildIcons(); buildQuickBar();
  for (const c of world.containers) if (c.corpse) {
    const sp = makeSprite([SPR.zombies[c.label === 'Xác lính' ? 'soldier' : 'walker'][c.x > 0 ? 1 : 0]], '#ff4a4a');
    setFrame(sp, 'down', 0);
    sp.mesh.rotation.x = -Math.PI / 2; sp.xr.visible = false; sp.blob.visible = false;
    sp.mat.color.setRGB(0.75, 0.7, 0.7);
    sp.group.position.set(c.x, 0.03, c.z + sp.h / 2);
  }
  glowTex = softDisc(64, 0, 2.2);
  fx.sky = new Sky(scene);
  fx.lit = new Particles(scene, 500, { camQuat });
  fx.blood = new Particles(scene, 600, { camQuat });
  fx.spark = new Particles(scene, 300, { additive: true, camQuat });
  fx.smoke = new Particles(scene, 260, { cube: true, camQuat });
  fx.ember = new Particles(scene, 200, { additive: true, camQuat });
  fx.decals = new Decals(scene, 200);
  fx.blood.onLand = (x, z) => { if (Math.random() < 0.35 && z > WALL_Z) fx.decals.add(x, z, rand(0.25, 0.55)); return true; };
  fx.rain = new Rain(scene, quality === 'high' ? 2400 : 1200);
  const fz = [{ x: POND.cx, z: POND.cz, w: 16, d: 7 }, { x: 0, z: 9, w: 140, d: 9 }, { x: 0, z: 4.5, w: 140, d: 2 }, { x: 44, z: 11, w: 14, d: 7 }];
  fx.fireflies = new Motes(scene, quality === 'high' ? 220 : 120, { color: new THREE.Color(3.2, 4.2, 1.2), size: 0.11, zones: fz });
  fx.ash = new Motes(scene, quality === 'high' ? 500 : 250, { color: new THREE.Color(1.6, 0.7, 0.4), size: 0.05, zones: [{ x: 0, z: 0, w: 1, d: 1 }], mode: 'ash', glow: false });
  fx.mist = new Mist(scene);
  fx.shafts = new Shafts(scene, [{ x: -27, y: 15, z: -8, w: 3.2 }, { x: -12, y: 15, z: -7, w: 2.6 }, { x: 10.5, y: 15, z: -9, w: 3 }, { x: 31, y: 15, z: -8, w: 3.4 }, { x: -50, y: 15, z: -9, w: 2.8 }, { x: 47, y: 15, z: -9, w: 3.6 }]);
  fx.crows = new Crows(scene, world.perches, camQuat, (p) => sound.caw(p.x, p.z));
  fx.moths = new Moths(scene, camQuat);
  fx.leaves = new Leaves(scene, camQuat);
  for (const m of [fx.lit.mesh, fx.blood.mesh, fx.spark.mesh, fx.smoke.mesh, fx.ember.mesh, fx.rain.mesh, fx.rain.splash, fx.fireflies.mesh, fx.ash.mesh, fx.moths.mesh, fx.leaves.p.mesh]) world.hideInReflection.push(m);
  for (const L of fx.mist.layers) world.hideInReflection.push(L.mesh);
  for (const it of fx.shafts.items) world.hideInReflection.push(it.mesh);
  const beamGeo = new THREE.ConeGeometry(2.4, 9, 24, 1, true);
  beamGeo.translate(0, -4.5, 0); beamGeo.rotateZ(Math.PI / 2);
  beam = new THREE.Mesh(beamGeo, new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color('#fff0d4') }, uI: { value: 0 }, uTime: U.time },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: `varying float vAlong; varying vec3 vN; varying vec3 vV; varying vec3 vW;
      void main(){ vAlong = position.x / 9.0; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vW = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uI; uniform float uTime; varying float vAlong; varying vec3 vN; varying vec3 vV; varying vec3 vW;
      void main(){
        float edge = pow(abs(dot(normalize(vN), normalize(vV))), 1.5);
        float fall = 1.0 - vAlong; fall *= fall;
        float n = 0.8 + 0.2 * sin(vW.x * 2.3 + uTime * 1.1) * sin(vW.z * 1.9 - uTime * 0.8);
        float a = edge * fall * uI * n * smoothstep(0.0, 0.06, vAlong) * smoothstep(-0.1, 0.4, vW.y);
        gl_FragColor = vec4(uColor * a, 1.0);
      }`,
  }));
  beam.renderOrder = 7; beam.frustumCulled = false;
  scene.add(beam); world.hideInReflection.push(beam);
  tracerMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 3.6, 1.6), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }), 64);
  tracerMesh.count = 0; tracerMesh.frustumCulled = false;
  scene.add(tracerMesh); world.hideInReflection.push(tracerMesh);
  player = newPlayer();
  camTarget.set(player.x, 1, 1);
  fx.butterflies = new Butterflies(scene, camQuat, TY);
  fx.flock = new Flock(scene);
  fx.cones = new LampCones(scene, world.lampHeads);
  for (const b of fx.flock.birds) world.hideInReflection.push(b.mesh);
  world.hideInReflection.push(fx.butterflies.mesh);
  atmos.hour = 15.5; atmos.update(0);
  setQualityLabel();
  $('best').textContent = bestScore();
  if (DBG) renderer.info.autoReset = false;
  try { renderer.compile(scene, camera); } catch (e) { /* bỏ qua */ }
  state.mode = 'title';
  $('loading').classList.add('hidden');
  $('title').classList.remove('hidden');
  last = performance.now();
  requestAnimationFrame(frame);
  if (QS.has('shot')) setTimeout(startGame, 50);
  openTransport(QS.has('mockroom')).then((t) => {
    net.transport = t; net.pending = false; updateCoopBtn(); watchLobby();
    if (!$('lobby').classList.contains('hidden')) openLobby();
  });
  updateCoopBtn();
  if (QS.has('debug')) window.__dbgKill = () => { toSpawn = 0; zombies.forEach((z) => { if (z.state !== 'dead') killZombie(z, 0); }); };
  if (QS.has('debug')) window.__dbg = () => ({ phase, hour: +atmos.hour.toFixed(2), weather: atmos.kind, hud: [$('night').textContent, $('atmo').textContent, $('left').textContent, $('msg-title').textContent, $('q-text').textContent], mode: state.mode, gtime: +gtime.toFixed(1), wave, toSpawn, zombies: zombies.map((z) => [z.type, z.state, +z.x.toFixed(2), +z.z.toFixed(2), +(z.y || 0).toFixed(2), z.aggro ? 1 : 0]), player: [+player.x.toFixed(1), +player.z.toFixed(1), Math.round(player.hp), Math.round(player.food), Math.round(player.water)], bag: { ...player.bag }, weapon: player.weapon, guns: player.guns.map((g) => [g.owned, g.ammo]), target: interact.target ? [interact.target.id, interact.target.info.label, interact.target.info.can, +interact.t.toFixed(2)] : null, quest: { ...Q, heli: Q.heli ? Q.heli.stage : null }, power, looted: player.looted.size, inf: Math.ceil(player.infected), zombie: player.zombie, net: { active: net.active, host: net.host, code: net.code, peers: net.players.size, me: net.me, hostPeer: net.hostPeer, remote: [...net.players.values()].map((r) => [r.name, +r.x.toFixed(1), +r.z.toFixed(1), r.flags, r.hp]) }, kills });
  if (QS.has('debug')) window.__dbgTp = (x, z) => { player.x = x; player.z = z; };
  if (QS.has('debug')) window.__dbgGive = (it, n) => addItem(it, n);
  if (QS.has('debug')) window.__dbgGod = () => { player.hp = player.maxHp = 1e5; };
  if (QS.has('debug')) window.__dbgDown = () => { player.maxHp = 100; player.hp = 0; playerDied(); };
  if (QS.has('debug')) window.__dbgInfect = (sec) => { player.infected = sec; };
  if (QS.has('debug')) window.__dbgFlowers = () => flowers.map((f) => [f.id, f.x, f.z, f.mesh.visible]);
  if (QS.has('debug')) window.__dbgSpawn = (x, z, variant, aggro = true) => { newZombie('walker', x, 0, z, 'walk', { variant, aggro }); };
  if (QS.has('debug')) window.__dbgAimAt = (x, z) => { tmpV.set(x, 1, z).project(camera); mouse.x = (tmpV.x * 0.5 + 0.5) * W; mouse.y = (-tmpV.y * 0.5 + 0.5) * H; mouse.has = true; };
  if (QS.has('debug')) window.__dbgQuest = (o, pw) => { Object.assign(Q, o); if (pw !== undefined) power = pw; hud.dirty = true; };
  if (QS.has('debug')) window.__dbgClear = () => { for (const z of zombies) releaseSprite(z); zombies = []; toSpawn = 0; strayT = 999; };
  if (QS.has('debug')) window.__dbgPhase = (ph) => { if (ph === 'dawn') startDawn(); if (ph === 'night') { atmos.hour = 19.6; nextWave(); } };
}

// ================= KHÓI & TÀN LỬA =================
function updateSmoke(dt, A) {
  for (const s of world.smokeSources) {
    if (Math.abs(s.x - camTarget.x) > 24) continue;
    s.acc = (s.acc || 0) + dt * s.rate;
    while (s.acc > 1) {
      s.acc -= 1;
      const c = s.fire ? rand(0.25, 0.4) : rand(0.45, 0.6);
      fx.smoke.spawn(s.x + rand(-0.15, 0.15), s.y, s.z + rand(-0.15, 0.15), 0.35 * A.wind + rand(-0.1, 0.1), rand(0.6, 1.0), rand(-0.1, 0.1), rand(3, 4.5), s.fire ? rand(0.28, 0.42) : rand(0.3, 0.5), new THREE.Color(c, c, c * 1.05), { grav: -0.05, drag: 0.4, mode: 2, spin: rand(-1, 1) });
      if (s.fire && Math.random() < 0.8) fx.ember.spawn(s.x + rand(-0.3, 0.3), s.y - 0.5, s.z + rand(-0.2, 0.2), rand(-0.3, 0.3) + 0.3 * A.wind, rand(1.2, 2.6), rand(-0.3, 0.3), rand(0.8, 1.8), 0.05, new THREE.Color(4, 1.6, 0.4), { grav: -0.2, drag: 0.8, mode: 1 });
    }
  }
  for (const f of world.fires) {
    f.t += dt * f.speed;
    f.map.offset.x = (Math.floor(f.t) % f.frames) / f.frames;
  }
}

// ================= FRAME =================
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (state.paused) dt = 0;
  gtime += dt;
  U.time.value = gtime;
  if (state.mode === 'play') {
    const steps = QS.has('debug') ? (+QS.get('speed') || 1) : 1;
    for (let k = 0; k < steps && state.mode === 'play'; k++) {
      if (k) { gtime += dt; U.time.value = gtime; }
      updatePlayer(dt);
      if (state.mode === 'play') updateZombies(dt);
      if (state.mode === 'play') {
        updateBullets(dt); updatePickups(dt);
        if (!net.active || net.host) { updateWaves(dt); if (phase !== 'shot') updatePhase(dt); }
        updateHeli(dt); hostCheckWipe();
      }
    }
  } else if (state.mode === 'title') {
    // màn hình tiêu đề: tua nhanh một vòng ngày đêm, có mưa và sương để khoe hiệu ứng
    atmos.hour += dt * 0.42;
    const h = atmos.hour % 24;
    atmos.rate = 0.3;
    const want = h > 12.5 && h < 15.2 ? 'rain' : h > 0.6 && h < 3 ? 'storm' : h > 4.4 && h < 6.6 ? 'fog' : 'clear';
    if (want !== atmos.kind) atmos.setWeather(want);
  }
  if (state.mode === 'over') {
    updateZombies(dt * 0.3);
    updateBullets(dt);
  }
  if (state.mode === 'view') updateViewer(dt);
  netTick(dt);
  updateFlowers(dt);
  if (state.mode === 'title') {
    setFrame(player.sprite, 'right', 0);
    player.sprite.group.position.set(player.x, 0, player.z);
    flashlight.position.set(player.x, 1.15, player.z + 0.3);
    flashlight.target.position.set(player.x + 6, 0.15, player.z);
  }
  updateCamera(dt);
  const A = applyAtmos(dt, gtime);
  for (const fn of world.animated) fn(dt, gtime, A.wind);
  flashlight.intensity = state.mode === 'loading' || player.zombie ? 0 : 40 * A.flash;
  // nhiễm virus: màn hình ngả xanh dần; khi là zombie: nhạt màu, ánh lục
  if (state.mode === 'play' && player.zombie) { post.params.tint = [0.82, 1.08, 0.78]; post.params.sat *= 0.55; post.params.vignette = Math.min(1, post.params.vignette + 0.35); }
  else if (state.mode === 'play' && player.infected > 0) { const k = 1 - player.infected / INFECT_TIME; post.params.tint = [1 - 0.14 * k, 1 + 0.04 * k, 1 - 0.2 * k]; post.params.vignette = Math.min(1, post.params.vignette + 0.3 * k + 0.08 * k * Math.sin(gtime * 3)); }
  else post.params.tint = [1, 1, 1];
  aura.position.set(player.x, 2.2, player.z + 0.6); aura.intensity = 3.5 * A.flash;
  beam.visible = state.mode === 'play';
  beam.position.set(player.x + Math.cos(player.aim) * 0.45, 1.12, player.z + Math.sin(player.aim) * 0.45);
  beam.rotation.set(0, -player.aim, -0.11, 'YZX');
  beam.material.uniforms.uI.value = (0.028 + A.rain * 0.035 + A.mist * 0.05) * A.flash;
  muzzleT -= dt; if (muzzleT <= 0) muzzleLight.intensity = 0;
  hurtFlash = Math.max(0, hurtFlash - dt * 1.5);
  for (let i = floaters.length - 1; i >= 0; i--) { floaters[i].t -= dt; floaters[i].y += dt * 0.9; if (floaters[i].t <= 0) floaters.splice(i, 1); }
  updateSmoke(dt, A);
  fx.lit.update(dt); fx.blood.update(dt); fx.spark.update(dt); fx.smoke.update(dt); fx.ember.update(dt);
  fx.crows.update(dt, player, camTarget);
  if (msgTimer > 0) { msgTimer -= dt; if (msgTimer <= 0) $('msg').classList.remove('show'); }
  if (state.mode === 'play' || state.mode === 'over') updateHud();
  post.params.maxBlur = quality === 'high' ? 7 : 5;
  post.params.range = 7; post.params.fall = 12; post.params.nearK = 1.3;
  post.params.dof = state.mode === 'view' ? view.dof : true;
  if (state.mode === 'view' && !view.bloom) post.params.bloom = 0;
  if (toastT > 0) { toastT -= dt; if (toastT <= 0) $('toast').classList.remove('show'); }
  // bụi nước dưới chân thác
  for (const wf of world.waterfalls) {
    if (Math.abs((wf.x0 + wf.x1) / 2 - camTarget.x) > 24 || Math.random() > 0.75) continue;
    const c = 0.45 + 0.4 * clamp(A.hemiI * 0.5 + A.sunI * 0.15, 0, 1);
    fx.spark.spawn(rand(wf.x0, wf.x1), wf.y + 0.05, wf.z + rand(0, 0.25), rand(-0.6, 0.6), rand(0.8, 2.2), rand(0.1, 0.9), rand(0.35, 0.8), rand(0.05, 0.09), new THREE.Color(c * 0.8, c * 0.9, c), { grav: 5, drag: 1.5, mode: 1 });
  }
  if (DBG) renderer.info.reset();
  post.render(scene, camera, gtime);
  if (view.shot) {
    view.shot = false;
    try {
      canvas.toBlob((b) => {
        if (!b) return;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(b); a.download = 'dead-night-' + Date.now() + '.png';
        document.body.appendChild(a); a.click(); a.remove();
      });
      toast('Đã chụp ảnh màn hình');
    } catch (e) { toast('Không chụp được ảnh'); }
  }
  if (DBG) window.__info = { calls: renderer.info.render.calls, tris: renderer.info.render.triangles, leaves: world.leafCount, q: quality };
  draw2D();
}

// ================= NÚT BẤM =================
$('start-btn').addEventListener('click', startGame);
$('view-btn').addEventListener('click', startView);
$('px-btn').addEventListener('click', cyclePixel);
$('dur-btn').addEventListener('click', () => {
  const keys = Object.keys(DURATIONS);
  durKey = keys[(keys.indexOf(durKey) + 1) % keys.length];
  store.set('deadnight_dur', durKey);
  DAY_LEN = DURATIONS[durKey].day; NIGHT_LEN = DURATIONS[durKey].night;
  setQualityLabel();
});
document.querySelectorAll('#view-bar .vb').forEach((b) => b.addEventListener('click', () => viewAction(b.dataset.v)));
$('view-show').addEventListener('click', () => viewAction('hud'));
$('again-btn').addEventListener('click', () => (net.active && !net.host ? toast('Chờ chủ phòng bắt đầu ván mới…') : startGame()));
$('win-again').addEventListener('click', () => (net.active && !net.host ? toast('Chờ chủ phòng bắt đầu ván mới…') : startGame()));
const menuOut = () => { if (net.room) leaveRoom(); toMenu(); };
$('menu-btn').addEventListener('click', menuOut);
$('win-menu').addEventListener('click', menuOut);
$('coop-btn').addEventListener('click', () => openLobby());
$('create-btn').addEventListener('click', () => joinRoom(makeCode(), true));
$('join-btn').addEventListener('click', () => joinRoom($('code-in').value));
$('code-in').addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') joinRoom($('code-in').value); });
$('nick').addEventListener('keydown', (e) => e.stopPropagation());
$('go-btn').addEventListener('click', () => { if (net.host) startCoop(true); });
$('leave-btn').addEventListener('click', () => { leaveRoom(); setCoopNote('Đã rời phòng.'); });
$('lobby-close').addEventListener('click', closeLobby);
$('bag-close').addEventListener('click', () => toggleBag(false));
$('t-bag').addEventListener('touchstart', (e) => { e.preventDefault(); toggleBag(); }, { passive: false });
$('t-bag').addEventListener('click', () => toggleBag());
$('t-use').addEventListener('touchstart', (e) => { e.preventDefault(); interact.touchHold = true; }, { passive: false });
$('t-use').addEventListener('touchend', (e) => { e.preventDefault(); interact.touchHold = false; }, { passive: false });
$('t-use').addEventListener('touchcancel', () => { interact.touchHold = false; });
$('resume-btn').addEventListener('click', togglePause);
$('q-btn').addEventListener('click', () => {
  quality = quality === 'high' ? 'low' : 'high';
  store.set('deadnight_q', quality);
  setQualityLabel();
  location.reload();
});
$('t-reload').addEventListener('touchstart', (e) => { e.preventDefault(); reload(); }, { passive: false });
$('t-swap').addEventListener('touchstart', (e) => { e.preventDefault(); cycleWeapon(); }, { passive: false });
$('t-pause').addEventListener('touchstart', (e) => { e.preventDefault(); togglePause(); }, { passive: false });
document.addEventListener('visibilitychange', () => { if (document.hidden && state.mode === 'play' && !state.paused) togglePause(); });
addEventListener('resize', resize);
if (isTouch) document.body.classList.add('touch');
$('help').innerHTML = isTouch
  ? 'Ngón trái: di chuyển · Ngón phải: ngắm &amp; bắn · Giữ LỤC: lục soát<br>R: nạp đạn · ⇄: đổi vũ khí · TÚI: túi đồ & chế thuốc giải · Nên xoay ngang màn hình'
  : 'WASD: đi · Shift: chạy · Chuột: ngắm &amp; bắn/chém · Giữ E: lục soát<br>R: nạp đạn · 1-4/Q: đổi vũ khí · F: băng bó · C: ăn/uống · V: chế/tiêm thuốc giải · I: túi đồ';

requestAnimationFrame(() => setTimeout(() => {
  try { init(); } catch (e) {
    console.error(e);
    $('loading').textContent = 'Không khởi tạo được WebGL: ' + e.message;
  }
}, 30));

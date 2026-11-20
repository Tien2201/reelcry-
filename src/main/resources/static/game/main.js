// DEAD NIGHT — game sinh tồn zombie phong cách HD-2D: sprite pixel trong diorama 3D,
// camera thấp nhìn ngang, cuộn theo nhân vật dọc con phố của ngôi làng.
import * as THREE from 'three';
import { buildWorld, U, BOUNDS, TY, WALL_Z, STAIRS, STAIR_DEPTH, STREET_FRONT, POND } from './world.js';
import { Post } from './post.js';
import { Atmos } from './atmos.js';
import { Particles, Decals, Rain, Motes, Mist, Shafts, Crows, Moths, Leaves, Sky, Butterflies, Flock, LampCones } from './fx.js';
import { makeCharacterSprites, makePickupAtlas, DIR_ROW } from './sprites.js';
import { spriteLit, softDisc } from './pixel.js';
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
let camScale = 1;
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
  const cs = camScale * (state.mode === 'view' ? view.zoom : 1);
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
  { key: 'pistol', name: 'SÚNG LỤC', dmg: 34, rate: 0.26, mag: 12, reload: 1.0, spread: 0.035, pellets: 1, speed: 38, kick: 0.06, infinite: true, shake: 0.12 },
  { key: 'shotgun', name: 'SHOTGUN', dmg: 20, rate: 0.78, mag: 6, reload: 1.6, spread: 0.2, pellets: 8, speed: 32, kick: 0.2, shake: 0.4, unlock: 2 },
  { key: 'smg', name: 'TIỂU LIÊN', dmg: 17, rate: 0.075, mag: 32, reload: 1.4, spread: 0.07, pellets: 1, speed: 40, kick: 0.05, shake: 0.08, unlock: 4 },
];
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
let phase = 'title', phaseT = 0, dayNo = 0, nightKills = 0, nightTotal = 1, hourFrom = 0, strayT = 0;
const DAY_LEN = 50, DUSK_LEN = 13, DAWN_LEN = 7;
const zPool = { walker: [], runner: [], brute: [] };
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
  if (e.code === 'KeyR') reload();
  if (e.code === 'Digit1') switchWeapon(0);
  if (e.code === 'Digit2') switchWeapon(1);
  if (e.code === 'Digit3') switchWeapon(2);
  if (e.code === 'KeyQ') cycleWeapon();
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
  const p = ray.ray.intersectPlane(planeH, tmpV2);
  if (p && p.z > BOUNDS.z0 - 0.4) return p;
  planeV.constant = -(BOUNDS.z0 - 0.4);
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
  if (z < WALL_Z + 0.1) return true;
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
      if (z < WALL_Z + 0.3) continue;
      if (insideSolid(x, z, 0.3) && !(z < WALL_Z + 0.6)) NAV.block[j * NAV.w + i] = 1;
    }
  NAV.cell = -1;
}
function navCell(x, z) {
  const i = clamp(Math.round((x - BOUNDS.x0) / NAV.res), 0, NAV.w - 1), j = clamp(Math.round((z - BOUNDS.z0) / NAV.res), 0, NAV.h - 1);
  return j * NAV.w + i;
}
function navCompute() {
  const s = navCell(player.x, player.z);
  if (s === NAV.cell) return;
  NAV.cell = s;
  const { w, h, block, dist, queue } = NAV;
  dist.fill(-1);
  let head = 0, tail = 0;
  dist[s] = 0; queue[tail++] = s;
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
  const sp = player ? player.sprite : makeSprite([SPR.player.pistol, SPR.player.shotgun, SPR.player.smg], '#7ad8ff');
  return {
    x: -1.5, z: 1.0, r: 0.36, hp: 100, maxHp: 100, stamina: 1, speed: 4.3,
    aim: 0, dir: 'right', weapon: 0, cooldown: 0, reloading: 0, walk: 0, recoil: 0, inv: 0, moving: false, stepT: 0,
    guns: WEAPONS.map((w, i) => ({ owned: i === 0, ammo: w.mag, reserve: i === 0 ? Infinity : 0 })),
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
function reload() {
  const g = curGun(), w = WEAPONS[player.weapon];
  if (player.reloading > 0 || g.ammo >= w.mag || g.reserve <= 0) return;
  player.reloading = w.reload; sound.reload(); hud.dirty = true;
}
function muzzlePos(out) {
  return out.set(player.x + Math.cos(player.aim) * 0.75, 1.0, player.z + Math.sin(player.aim) * 0.75);
}
let muzzleT = 0;
function shoot() {
  const g = curGun(), w = WEAPONS[player.weapon];
  if (player.cooldown > 0 || player.reloading > 0) return;
  if (g.ammo <= 0) { sound.empty(); player.cooldown = 0.25; reload(); return; }
  g.ammo--; player.cooldown = w.rate; player.recoil = w.kick; hud.dirty = true;
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

// ================= ZOMBIE =================
function spriteFor(type) {
  const p = zPool[type];
  if (p.length) { const s = p.pop(); s.group.visible = true; return s; }
  const list = SPR.zombies[type];
  return makeSprite([list[Math.floor(Math.random() * list.length)]], '#ff4a4a');
}
function releaseSprite(z) {
  const s = z.sprite;
  s.group.visible = false;
  s.mesh.rotation.set(0, 0, 0); s.group.position.y = 0; s.xr.visible = true; s.blob.visible = true;
  s.mat.color.setScalar(1);
  zPool[z.type].push(s);
}
function pickType() {
  const r = Math.random();
  if (wave >= 4 && r < 0.06 + wave * 0.012) return 'brute';
  if (wave >= 2 && r < 0.36) return 'runner';
  return 'walker';
}
function newZombie(type, x, y, z, st) {
  const T = ZT[type];
  const hp = T.hp + wave * T.hpW;
  const zz = {
    type, x, y, z, r: T.r, speed: rand(T.speed[0], T.speed[1]) * (1 + Math.min(wave, 10) * 0.025), hp, maxHp: hp, dmg: T.dmg, score: T.score, atkT: 0, atkCd: T.atk,
    walk: rand(0, 4), dir: 'down', hitT: 0, stuck: 0, side: Math.random() < 0.5 ? 1 : -1, state: st, t: 0, sprite: spriteFor(type),
  };
  zz.sprite.group.position.set(x, y, z);
  zombies.push(zz);
  return zz;
}
// chọn điểm nhảy/bậc thang gần người chơi cho zombie đi trên thềm
function terracePlan(z) {
  const near = STAIRS.filter((s) => Math.abs(s.x - player.x) < 9);
  if (near.length && Math.random() < 0.45) {
    const s = near[Math.floor(Math.random() * near.length)];
    z.tx = s.x; z.stair = s;
  } else {
    let tx = player.x + rand(-5, 5);
    for (let k = 0; k < 6 && STAIRS.some((s) => Math.abs(s.x - tx) < 1.6); k++) tx += 2;
    z.tx = clamp(tx, BOUNDS.x0 + 1, BOUNDS.x1 - 1); z.stair = null;
  }
}
function spawnZombie(stray = false) {
  const type = stray ? 'walker' : pickType();
  const roll = stray ? 1 : Math.random();
  const nearPond = Math.abs(player.x - POND.cx) < 18;
  const nearCem = player.x > 22;
  if (roll < 0.34) {
    // đi trên bậc thềm phía sau rồi nhảy xuống / xuống bậc thang
    const side = Math.random() < 0.5 ? -1 : 1;
    let x = player.x + side * rand(13, 18);
    if (x < BOUNDS.x0 + 1 || x > BOUNDS.x1 - 1) x = player.x - side * rand(13, 18);
    x = clamp(x, BOUNDS.x0 + 1, BOUNDS.x1 - 1);
    const z = newZombie(type, x, TY, WALL_Z - 1.3 - Math.random() * 0.9, 'terrace');
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
  let z = rand(BOUNDS.z0 + 0.4, BOUNDS.z1 - 0.4);
  for (let k = 0; k < 8 && insideSolid(x, z, 0.5); k++) z = rand(BOUNDS.z0 + 0.4, BOUNDS.z1 - 0.4);
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
  floaters.push({ x: z.x, y: 2.4, z: z.z, text: '+' + z.score * Math.max(1, wave), t: 1.1, color: '#f2c14e' });
  const roll = Math.random();
  if (roll < 0.06 + (z.type === 'brute' ? 0.5 : 0)) addPickup(z.x, z.z, 'med');
  else if (roll < 0.24) addPickup(z.x, z.z, 'ammo');
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
  toSpawn = Math.min(6 + wave * 4, 70);
  nightTotal = toSpawn; nightKills = 0;
  spawnTimer = 2.5; intermission = 0;
  atmos.hour = Math.max(atmos.hour, 19.6);
  hourFrom = atmos.hour;
  atmos.setWeather(rollNightWeather());
  showMsg(`ĐÊM ${wave}`, atmos.weatherName);
  sound.wave();
  WEAPONS.forEach((w, i) => {
    if (w.unlock === wave && !player.guns[i].owned) {
      player.guns[i].owned = true; player.guns[i].reserve = w.mag * 3;
      setTimeout(() => showMsg('VŨ KHÍ MỚI', `${w.name} — bấm ${i + 1}${isTouch ? ' hoặc ⇄' : ''}`), 2600);
    }
  });
  hud.dirty = true;
}
function startDawn() {
  phase = 'dawn'; phaseT = 0; hourFrom = atmos.hour;
  showMsg('TRỜI SÁNG', `Đã sống sót đêm ${wave} · +25 máu`);
  player.hp = Math.min(player.maxHp, player.hp + 25);
  score += wave * 100; hud.dirty = true;
  atmos.setWeather('clear');
}
function startDay() {
  phase = 'day'; phaseT = 0; dayNo++; strayT = 6;
  const r = Math.random();
  atmos.setWeather(r < 0.25 ? 'rain' : r < 0.35 ? 'fog' : 'clear');
  showMsg(`NGÀY ${dayNo}`, atmos.kind === 'rain' ? 'Mưa rào · nhặt đồ tiếp tế' : 'Nghỉ ngơi · nhặt đồ tiếp tế');
  // thùng tiếp tế rơi gần người chơi
  for (let i = 0; i < 3; i++) addPickup(clamp(player.x + rand(-7, 7), BOUNDS.x0 + 1, BOUNDS.x1 - 1), rand(BOUNDS.z0 + 0.6, BOUNDS.z1 - 0.6), i === 0 ? 'med' : 'ammo', 45);
}
function startDusk() {
  phase = 'dusk'; phaseT = 0; hourFrom = atmos.hour;
  showMsg('CHIỀU TÀ', 'Màn đêm sắp buông xuống…');
  if (atmos.kind === 'rain' && Math.random() < 0.6) atmos.setWeather('clear');
}
function updatePhase(dt) {
  phaseT += dt;
  if (phase === 'night') {
    // đêm trôi theo số zombie bị hạ (và chậm dần theo thời gian), hết zombie thì rạng đông
    const target = 19.6 + Math.min(1, nightKills / Math.max(1, nightTotal)) * 8.9;
    atmos.hour = Math.min(target, atmos.hour + dt * 0.5);
    if (toSpawn <= 0 && !zombies.some((z) => z.state !== 'dead')) startDawn();
  } else if (phase === 'dawn') {
    const k = Math.min(1, phaseT / DAWN_LEN);
    atmos.hour = hourFrom + (30.9 - hourFrom) * k;
    if (k >= 1) { atmos.hour = 6.9; startDay(); }
  } else if (phase === 'day') {
    atmos.hour = 6.9 + (16.4 - 6.9) * Math.min(1, phaseT / DAY_LEN);
    strayT -= dt;
    if (strayT <= 0) {
      strayT = rand(9, 14);
      if (zombies.filter((z) => z.state !== 'dead').length < 2) spawnZombie(true);
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

// ================= HUD =================
const hud = { dirty: true, last: {} };
function setText(id, v) { if (hud.last[id] !== v) { hud.last[id] = v; $(id).textContent = v; } }
function updateHud() {
  $('hp-fill').style.width = (Math.max(0, player.hp) / player.maxHp * 100).toFixed(1) + '%';
  $('st-fill').style.width = (player.stamina * 100).toFixed(1) + '%';
  $('hp-box').classList.toggle('low', player.hp < 30);
  $('reload-tag').classList.toggle('show', player.reloading > 0);
  const hh = ((atmos.hour % 24) + 24) % 24, clock = String(Math.floor(hh)).padStart(2, '0') + ':' + String(Math.floor((hh % 1) * 60)).padStart(2, '0');
  setText('night', phase === 'day' || phase === 'dawn' ? `NGÀY ${Math.max(1, dayNo)}` : `ĐÊM ${phase === 'dusk' ? wave + 1 : wave}`);
  setText('atmo', `${clock} · ${atmos.weatherName}`);
  if (phase === 'day') hud.dirty = true;
  if (!hud.dirty) return;
  hud.dirty = false;
  const w = WEAPONS[player.weapon], g = curGun();

  setText('score', String(score));
  setText('kills', `${kills} hạ gục`);
  const alive = zombies.filter((z) => z.state !== 'dead').length;
  setText('left', phase === 'night' ? `Zombie còn lại: ${toSpawn + alive}` : phase === 'dawn' ? 'Trời sáng rồi!' : phase === 'day' ? `Nghỉ ngơi · còn ${Math.ceil(DAY_LEN - phaseT)} giây` : 'Màn đêm sắp buông…');
  setText('wname', w.name);
  setText('ammo', String(g.ammo));
  setText('reserve', g.reserve === Infinity ? '∞' : String(g.reserve));
  $('ammo').classList.toggle('empty', g.ammo === 0);
  document.querySelectorAll('#slots .slot').forEach((el, i) => {
    el.classList.toggle('on', i === player.weapon);
    el.classList.toggle('owned', player.guns[i].owned);
  });
}

// ================= ÁNH SÁNG, KHÍ QUYỂN =================
const emitterMul = { lamp: 1, window: 1, fire: 1 };
function flick(e, t) {
  if (e.flicker === 'fire') return 0.78 + 0.14 * Math.sin(t * 11 + e.phase) * Math.sin(t * 6.3 + e.phase * 2) + 0.08 * Math.sin(t * 23 + e.phase);
  if (e.flicker === 'broken') {
    const k = Math.floor(t * 9 + e.phase);
    const n = Math.abs(Math.sin(k * 12.9898 + e.phase) * 43758.5453) % 1;
    const slow = Math.sin(t * 0.37 + e.phase);
    return slow > 0.75 ? (n > 0.5 ? 0.05 : 0.6) : n > 0.94 ? 0.15 : 1;
  }
  if (e.flicker === 'lamp') return 0.97 + 0.03 * Math.sin(t * 50 + e.phase);
  return 1;
}
function updateLights(t, A) {
  emitterMul.lamp = A.lamps; emitterMul.window = A.windows; emitterMul.fire = A.fires;
  const n = quality === 'high' ? 10 : 6;
  for (const e of world.emitters) {
    e.cur = e.base * flick(e, t) * emitterMul[e.kind];
    const d = Math.hypot(e.pos.x - camTarget.x, (e.pos.z - camTarget.z) * 0.8);
    e.w = e.cur * (1 - clamp((d - 14) / 8, 0, 1));
  }
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
  world.jackMat.emissiveIntensity = 3 * Math.max(0.15, A.lamps);
  // diều chỉ bay khi trời còn sáng
  const k = world.kite;
  k.visible = world.kiteLine.visible = A.kite > 0.5;
  if (k.visible) {
    k.position.set(camTarget.x * 0.55 + 9 + Math.sin(t * 0.3) * 1.5, 15.5 + Math.sin(t * 0.7) * 0.8, -26);
    k.rotation.z = Math.sin(t * 1.3) * 0.25;
    const lp = world.kiteLine.geometry.attributes.position;
    lp.setXYZ(0, k.position.x, k.position.y - 0.4, k.position.z); lp.setXYZ(1, k.position.x - 9, 3.6, -19); lp.needsUpdate = true;
  }
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
  const spd = player.speed * (sprint ? 1.55 : 1) * mag;
  player.x += mx * spd * dt; player.z += mz * spd * dt * 0.8;
  collide(player);
  player.moving = mag > 0.1;
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
  player.cooldown -= dt;
  player.recoil = Math.max(0, player.recoil - dt * 1.2);
  player.inv -= dt;
  if (player.reloading > 0) {
    player.reloading -= dt;
    if (player.reloading <= 0) {
      const g = curGun(), w = WEAPONS[player.weapon], take = Math.min(w.mag - g.ammo, g.reserve);
      g.ammo += take; if (g.reserve !== Infinity) g.reserve -= take;
      player.reloading = 0; hud.dirty = true;
    }
  }
  if (firing) shoot();
  const sp = player.sprite;
  player.dir = dirFromAngle(player.aim);
  setFrame(sp, player.dir, player.moving ? Math.floor(player.walk) % 4 : 0);
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
  if (NAV.block) navCompute();
  for (let i = 0; i < zombies.length; i++) {
    const z = zombies[i], s = z.sprite;
    z.t += dt;
    if (z.state === 'dead') {
      const k = Math.min(1, z.t / 0.35);
      s.mesh.rotation.x = -k * k * Math.PI / 2;
      if (z.t > 7) s.group.position.y = -(z.t - 7) * 0.4;
      if (z.t > 9) { releaseSprite(z); zombies.splice(i, 1); i--; }
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
    let dx = player.x - z.x, dz = player.z - z.z;
    const d = Math.hypot(dx, dz) || 1;
    dx /= d; dz /= d;
    if (d > 1.0 && !(d < 7 && navLOS(z.x, z.z, player.x, player.z)) && navDir(z)) { dx = navOut.x; dz = navOut.z; }
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
    z.dir = dirFromAngle(Math.atan2(player.z - z.z, player.x - z.x));
    setFrame(s, z.dir, Math.floor(z.walk) % 4);
    s.group.position.set(z.x, 0, z.z);
    s.mat.color.setScalar(z.hitT > 0 ? 3 : 1);
    if (d < z.r + player.r + 0.28 && z.atkT <= 0) {
      z.atkT = z.atkCd;
      if (player.inv <= 0) {
        player.hp -= z.dmg; player.inv = 0.35; hurtFlash = 0.5;
        shake = Math.max(shake, z.type === 'brute' ? 0.6 : 0.3);
        sound.hurt();
        fx.decals.add(player.x + rand(-0.3, 0.3), player.z + rand(-0.3, 0.3), 0.7);
        const kb = z.type === 'brute' ? 1.1 : 0.4;
        player.x += (player.x - z.x) / d * kb; player.z += (player.z - z.z) / d * kb; collide(player);
        hud.dirty = true;
        if (player.hp <= 0) { gameOver(); return; }
      }
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
          const a = Math.atan2(b.vz, b.vx);
          z.hp -= b.dmg; z.hitT = 0.1;
          const kb = z.type === 'brute' ? 0.04 : 0.16;
          if (z.state === 'walk') { z.x += Math.cos(a) * kb; z.z += Math.sin(a) * kb; }
          for (let k = 0; k < 7; k++) {
            const aa = a + rand(-0.8, 0.8), s = rand(1, 4.5);
            fx.blood.spawn(cx, rand(0.7, 1.3), cz, Math.cos(aa) * s, rand(0, 2.5), Math.sin(aa) * s, 1.6, rand(0.05, 0.1), Math.random() < 0.5 ? '#7a0e0c' : '#a51c16', { grav: 11, drag: 0.8 });
          }
          sound.hit(cx, cz);
          floaters.push({ x: z.x + rand(-0.3, 0.3), y: 2.2, z: z.z, text: String(b.dmg), t: 0.55, color: '#ffffff' });
          if (z.hp <= 0) killZombie(z, a);
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
  const alive = zombies.filter((z) => z.state !== 'dead').length;
  if (spawnTimer <= 0 && alive < (quality === 'high' ? 40 : 28)) {
    const batch = Math.min(toSpawn, 1 + Math.floor(wave / 3));
    for (let i = 0; i < batch; i++) if (spawnZombie()) toSpawn--;
    spawnTimer = Math.max(0.4, 1.7 - wave * 0.1) * rand(0.6, 1.3);
    hud.dirty = true;
  }
}

function updateCamera(dt) {
  let tx = player.x;
  if (state.mode === 'play') tx += Math.cos(player.aim) * (isTouch ? 1.5 : 2.4);
  if (state.mode === 'title') tx = Math.sin(gtime * 0.035) * 38;
  if (state.mode === 'view') tx = player.x + view.pan;
  tx = clamp(tx, BOUNDS.x0 + 9, BOUNDS.x1 - 9);
  if (state.mode === 'view') view.pan = tx - player.x;
  const k = Math.min(1, dt * (state.mode === 'title' ? 1 : 4));
  camTarget.x += (tx - camTarget.x) * k;
  camTarget.z = 1;
  shake = Math.max(0, shake - dt * 1.8);
  placeCamera(shake);
  sound.setListener(camTarget.x, camTarget.z);
  tmpV.set(player.x, 1.0, player.z).project(camera);
  U.seeCenter.value.set((tmpV.x * 0.5 + 0.5) * post.w, (tmpV.y * 0.5 + 0.5) * post.h);
  U.seeRadius.value = post.h * 0.13;
  tmpV.set(player.x, 1.0, player.z).applyMatrix4(camera.matrixWorldInverse);
  U.seeDepth.value = -tmpV.z - 1.0;
  U.seeZ.value = state.mode === 'title' ? 999 : player.z;
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
  state.paused = !state.paused;
  $('pause').classList.toggle('hidden', !state.paused);
}
function bestScore() { return +store.get('deadnight_best', '0') || 0; }
function startGame() {
  sound.init();
  for (const z of zombies) releaseSprite(z);
  zombies = []; bullets = [];
  for (const p of pickups) scene.remove(p.mesh);
  pickups = []; floaters = [];
  fx.decals.clear();
  player = newPlayer();
  setSpriteMap(player.sprite, 0);
  wave = 0; kills = 0; score = 0; shake = 0; hurtFlash = 0;
  state.mode = 'play'; state.paused = false; playStart = gtime;
  $('title').classList.add('hidden'); $('over').classList.add('hidden'); $('pause').classList.add('hidden');
  document.body.classList.add('playing');
  hud.dirty = true;
  dayNo = 0;
  atmos.hour = 16.4; atmos.setWeather('clear', true); atmos.rate = 0.12;
  startDusk();
  // chế độ chụp ảnh để kiểm tra đồ hoạ: ?shot=<giờ>&w=<rain|storm|fog|blood>&px=..
  if (QS.has('shot')) {
    phase = 'shot';
    atmos.hour = +QS.get('shot'); atmos.setWeather(QS.get('w') || 'clear', true); atmos.update(0);
    if (QS.has('px')) player.x = +QS.get('px');
    if (QS.has('pz')) player.z = +QS.get('pz');
    player.hp = player.maxHp = 1e6; toSpawn = 0;
    const types = ['walker', 'runner', 'walker', 'brute', 'walker'];
    types.forEach((t, i) => spawnAt(t, player.x + (i % 2 ? 1 : -1) * rand(3, 7), rand(BOUNDS.z0 + 0.3, BOUNDS.z1 - 0.3)));
    const tz = newZombie('walker', player.x + 5, TY, WALL_Z - 1.4, 'terrace'); tz.tx = player.x + 2; tz.stair = null; tz.speed *= 0.3;
    camTarget.x = player.x;
    window.__dn = { get zombies() { return zombies; }, get player() { return player; }, camera, size: () => [W, H] };
    window.__setHour = (h, w) => { atmos.hour = h; if (w && w !== atmos.kind) atmos.setWeather(w, true); };
  }
}
function spawnAt(type, x, z) {
  const zz = newZombie(type, x, 0, z, 'walk');
  zz.speed *= 0.3; zz.dmg = 0; zz.atkT = 1e9;
}
function gameOver() {
  state.mode = 'over';
  player.hp = 0;
  const best = Math.max(bestScore(), score);
  store.set('deadnight_best', String(best));
  document.body.classList.remove('playing');
  $('ov-night').textContent = wave; $('ov-kills').textContent = kills; $('ov-score').textContent = score; $('ov-best').textContent = best;
  setTimeout(() => $('over').classList.remove('hidden'), 900);
}
function setQualityLabel() {
  $('q-btn').textContent = 'Đồ hoạ: ' + (quality === 'high' ? 'Cao' : 'Nhẹ');
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
  if (QS.has('debug')) window.__dbgKill = () => { toSpawn = 0; zombies.forEach((z) => { if (z.state !== 'dead') killZombie(z, 0); }); };
  if (QS.has('debug')) window.__dbg = () => ({ phase, hour: +atmos.hour.toFixed(2), weather: atmos.kind, hud: [$('night').textContent, $('atmo').textContent, $('left').textContent, $('msg-title').textContent], mode: state.mode, gtime: +gtime.toFixed(1), wave, toSpawn, zombies: zombies.map((z) => [z.type, z.state, +z.x.toFixed(2), +z.z.toFixed(2), +(z.y || 0).toFixed(2)]), player: [+player.x.toFixed(1), +player.z.toFixed(1), player.hp] });
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
      if (state.mode === 'play') { updateBullets(dt); updatePickups(dt); updateWaves(dt); if (phase !== 'shot') updatePhase(dt); }
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
  if (state.mode === 'title') {
    setFrame(player.sprite, 'right', 0);
    player.sprite.group.position.set(player.x, 0, player.z);
    flashlight.position.set(player.x, 1.15, player.z + 0.3);
    flashlight.target.position.set(player.x + 6, 0.15, player.z);
  }
  updateCamera(dt);
  const A = applyAtmos(dt, gtime);
  for (const fn of world.animated) fn(dt, gtime, A.wind);
  flashlight.intensity = state.mode === 'loading' ? 0 : 40 * A.flash;
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
document.querySelectorAll('#view-bar .vb').forEach((b) => b.addEventListener('click', () => viewAction(b.dataset.v)));
$('view-show').addEventListener('click', () => viewAction('hud'));
$('again-btn').addEventListener('click', startGame);
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
  ? 'Ngón trái: di chuyển (kéo hết cỡ để chạy) · Ngón phải: ngắm &amp; bắn<br>R: nạp đạn · ⇄: đổi súng · ❚❚: tạm dừng · Nên xoay ngang màn hình'
  : 'A/D: đi dọc phố · W/S: tiến/lùi · Shift: chạy · Chuột: ngắm &amp; bắn<br>R: nạp đạn · 1/2/3, Q, lăn chuột: đổi súng · P: tạm dừng · M: tắt tiếng';

requestAnimationFrame(() => setTimeout(() => {
  try { init(); } catch (e) {
    console.error(e);
    $('loading').textContent = 'Không khởi tạo được WebGL: ' + e.message;
  }
}, 30));

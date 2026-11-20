// DEAD NIGHT — game sinh tồn zombie phong cách HD-2D (sprite pixel trong cảnh 3D).
import * as THREE from 'three';
import { buildWorld, U, BOUNDS } from './world.js';
import { Post } from './post.js';
import { Atmos, PRESETS, presetForNight } from './atmos.js';
import { Particles, Decals, Rain, Motes, Mist, Shafts, Crows, Moths, Leaves } from './fx.js';
import { makeCharacterSprites, makePickupAtlas, DIR_ROW } from './sprites.js';
import { spriteLit, softDisc } from './pixel.js';
import { Sound } from './audio.js';

const $ = (id) => document.getElementById(id);
const QS = new URLSearchParams(location.search);
const DBG = QS.has('shot');
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rand = (a, b) => a + Math.random() * (b - a);
const TAU = Math.PI * 2;
const isTouch = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window;
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* bỏ qua */ } },
};
let quality = store.get('deadnight_q', isTouch ? 'low' : 'high');

// Giới hạn độ sáng khi vật đứng sát đèn (tránh sprite bị cháy trắng cạnh lửa/đèn)
THREE.ShaderChunk.lights_pars_begin = THREE.ShaderChunk.lights_pars_begin.replace(
  'float distanceFalloff = 1.0 / max( pow( lightDistance, decayExponent ), 0.01 );',
  'float distanceFalloff = 1.0 / max( pow( lightDistance, decayExponent ), 1.2 );');

// ================= RENDERER / SCENE =================
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.NoToneMapping;
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x000000, 30, 90);
const camera = new THREE.PerspectiveCamera(24, 1, 2, 170);
const PITCH = THREE.MathUtils.degToRad(31);
let camDist = 28;
const post = new Post(renderer);
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
  const vh = clamp(21 / camera.aspect, 12, 24);
  camDist = vh / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
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
const sunSize = 24;
Object.assign(sun.shadow.camera, { left: -sunSize, right: sunSize, top: sunSize, bottom: -sunSize, near: 1, far: 90 });
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
  if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  if (flashlight.shadow.map) { flashlight.shadow.map.dispose(); flashlight.shadow.map = null; }
  if (!pool.length) for (let i = 0; i < 10; i++) { const l = new THREE.PointLight(0xffffff, 0, 8, 2); scene.add(l); pool.push(l); }
}

// ================= ÂM THANH, KHÍ QUYỂN =================
const sound = new Sound();
const atmos = new Atmos();

// ================= THẾ GIỚI (dựng sau khi màn hình chờ hiện) =================
let world, fx = {}, SPR, camQuat = new THREE.Quaternion();
const camTarget = new THREE.Vector3(0, 0.8, 0);
const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3();

function placeCamera(shake = 0) {
  camera.position.set(
    camTarget.x + (Math.random() - 0.5) * shake,
    camTarget.y + camDist * Math.sin(PITCH) + (Math.random() - 0.5) * shake,
    camTarget.z + camDist * Math.cos(PITCH));
  camera.lookAt(camTarget.x + (Math.random() - 0.5) * shake * 0.3, camTarget.y, camTarget.z);
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
  fx.hide && fx.hide.push(xr, blob);
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
  { key: 'shotgun', name: 'SHOTGUN', dmg: 20, rate: 0.78, mag: 6, reload: 1.6, spread: 0.24, pellets: 8, speed: 32, kick: 0.2, shake: 0.4, unlock: 2 },
  { key: 'smg', name: 'TIỂU LIÊN', dmg: 17, rate: 0.075, mag: 32, reload: 1.4, spread: 0.08, pellets: 1, speed: 40, kick: 0.05, shake: 0.08, unlock: 4 },
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
const zPool = { walker: [], runner: [], brute: [] };
let tracerMesh, pickupAtlas, glowTex, beam;

// ================= INPUT =================
const keys = {};
const mouse = { x: 0, y: 0, down: false, has: false };
const sticks = { move: null, aim: null };
addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
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
canvas.addEventListener('mousemove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; mouse.has = true; });
canvas.addEventListener('mousedown', (e) => { sound.init(); if (e.button === 0) mouse.down = true; });
addEventListener('mouseup', () => { mouse.down = false; });
canvas.addEventListener('wheel', () => { if (state.mode === 'play') cycleWeapon(); }, { passive: true });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('blur', () => { mouse.down = false; for (const k in keys) keys[k] = false; if (state.mode === 'play' && !state.paused) togglePause(); });
function onTouch(e) {
  e.preventDefault(); sound.init();
  for (const t of e.changedTouches) {
    const st = { id: t.identifier, ox: t.clientX, oy: t.clientY, x: t.clientX, y: t.clientY };
    if (t.clientX < W / 2) { if (!sticks.move) sticks.move = st; } else if (!sticks.aim) sticks.aim = st;
  }
}
function onTouchMove(e) {
  e.preventDefault();
  for (const t of e.changedTouches) for (const k of ['move', 'aim']) if (sticks[k] && sticks[k].id === t.identifier) { sticks[k].x = t.clientX; sticks[k].y = t.clientY; }
}
function onTouchEnd(e) { for (const t of e.changedTouches) for (const k of ['move', 'aim']) if (sticks[k] && sticks[k].id === t.identifier) sticks[k] = null; }
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
// màn hình → điểm trên mặt phẳng ngang y = h
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1);
function screenToGround(sx, sy, h = 1) {
  ndc.set(sx / W * 2 - 1, -(sy / H) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  plane.constant = -h;
  return ray.ray.intersectPlane(plane, tmpV2) ? tmpV2 : null;
}

// ================= VA CHẠM =================
function collide(o, solidOnly = false) {
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

// ================= NGƯỜI CHƠI & VŨ KHÍ =================
function newPlayer() {
  const sp = player ? player.sprite : makeSprite([SPR.player.pistol, SPR.player.shotgun, SPR.player.smg], '#7ad8ff');
  return {
    x: world.plaza.x + 2.2, z: world.plaza.z + 3.2, r: 0.36, hp: 100, maxHp: 100, stamina: 1, speed: 4.3,
    aim: Math.PI / 2, dir: 'down', weapon: 0, cooldown: 0, reloading: 0, walk: 0, recoil: 0, inv: 0, moving: false, stepT: 0,
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
  const ca = Math.cos(player.aim), sa = Math.sin(player.aim);
  return out.set(player.x + ca * 0.75, 1.0, player.z + sa * 0.75);
}
function shoot() {
  const g = curGun(), w = WEAPONS[player.weapon];
  if (player.cooldown > 0 || player.reloading > 0) return;
  if (g.ammo <= 0) { sound.empty(); player.cooldown = 0.25; reload(); return; }
  g.ammo--; player.cooldown = w.rate; player.recoil = w.kick; hud.dirty = true;
  const m = muzzlePos(tmpV);
  for (let i = 0; i < w.pellets; i++) {
    const a = player.aim + rand(-w.spread, w.spread) * (w.pellets > 1 ? 1 : 0.6);
    const sp = w.speed * rand(0.92, 1.05);
    bullets.push({ x: m.x, z: m.z, px: m.x, pz: m.z, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, dmg: w.dmg, life: 0.6, pierce: w.pellets > 1 ? 0 : 1 });
  }
  muzzleLight.position.copy(m); muzzleLight.intensity = 45;
  muzzleT = 0.06;
  shake = Math.max(shake, w.shake);
  for (let i = 0; i < 6; i++) { const a = player.aim + rand(-0.5, 0.5), s = rand(3, 8); fx.spark.spawn(m.x, m.y, m.z, Math.cos(a) * s, rand(-0.5, 1.5), Math.sin(a) * s, rand(0.06, 0.14), 0.07, '#ffd890', { grav: 0, drag: 6, mode: 1 }); }
  const sa = player.aim + Math.PI / 2 * (Math.random() < 0.5 ? 1 : -1);
  fx.lit.spawn(player.x, 1.0, player.z, Math.cos(sa) * rand(1.5, 2.5), rand(2, 3), Math.sin(sa) * rand(1.5, 2.5), 2.5, 0.07, '#d8b050', { grav: 12, drag: 1, bounce: 0.35, spin: 14 });
  sound.shoot(w.key);
  fx.crows.scare(player.x, player.z, 14);
  if (g.ammo === 0) reload();
}
let muzzleT = 0;

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
  s.mesh.rotation.set(0, 0, 0); s.group.position.y = 0; s.mesh.position.y = 0; s.xr.visible = true; s.blob.visible = true;
  s.mat.color.setScalar(1);
  zPool[z.type].push(s);
}
function spawnZombie() {
  let type = 'walker';
  const r = Math.random();
  if (wave >= 4 && r < 0.06 + wave * 0.012) type = 'brute';
  else if (wave >= 2 && r < 0.36) type = 'runner';
  const T = ZT[type];
  let x, z, rise = false;
  const graves = world.graves.filter((g) => Math.hypot(g.x - player.x, g.z - player.z) > 6);
  if (graves.length && Math.random() < 0.35) {
    const g = graves[Math.floor(Math.random() * graves.length)];
    x = g.x + rand(-0.2, 0.2); z = g.z + rand(-0.3, 0.3); rise = true;
  } else {
    let ok = false;
    for (let tries = 0; tries < 30 && !ok; tries++) {
      const side = Math.floor(Math.random() * 4);
      if (side === 0) { x = rand(BOUNDS.x0, BOUNDS.x1); z = BOUNDS.z0 + 0.5; }
      else if (side === 1) { x = rand(BOUNDS.x0, BOUNDS.x1); z = BOUNDS.z1 - 0.5; }
      else if (side === 2) { x = BOUNDS.x0 + 0.5; z = rand(BOUNDS.z0, BOUNDS.z1); }
      else { x = BOUNDS.x1 - 0.5; z = rand(BOUNDS.z0, BOUNDS.z1); }
      if (insideSolid(x, z, 0.5) || Math.hypot(x - player.x, z - player.z) < 12) continue;
      tmpV.set(x, 1, z).project(camera);
      ok = Math.abs(tmpV.x) > 1.05 || Math.abs(tmpV.y) > 1.05 || tries > 24;
    }
    if (!ok) return false;
  }
  const hp = T.hp + wave * T.hpW;
  const z0 = {
    type, x, z, r: T.r, speed: rand(T.speed[0], T.speed[1]) * (1 + Math.min(wave, 10) * 0.025), hp, maxHp: hp, dmg: T.dmg, score: T.score, atkT: 0, atkCd: T.atk,
    walk: rand(0, 4), dir: 'down', hitT: 0, stuck: 0, side: Math.random() < 0.5 ? 1 : -1, state: rise ? 'rise' : 'walk', t: 0, sprite: spriteFor(type),
  };
  z0.sprite.group.position.set(x, rise ? -z0.sprite.h : 0, z);
  if (rise) { sound.rise(x, z); for (let i = 0; i < 10; i++) fx.lit.spawn(x + rand(-0.4, 0.4), 0.1, z + rand(-0.4, 0.4), rand(-1, 1), rand(2, 4), rand(-1, 1), 1.2, 0.12, '#4a3626', { grav: 9, bounce: 0.2 }); }
  zombies.push(z0);
  return true;
}
function killZombie(z, ang) {
  kills++; score += z.score * wave;
  z.state = 'dead'; z.t = 0;
  z.sprite.xr.visible = false; z.sprite.blob.visible = false;
  fx.decals.add(z.x, z.z, z.type === 'brute' ? 2.4 : 1.7);
  for (let i = 0; i < (z.type === 'brute' ? 36 : 20); i++) {
    const a = ang + rand(-1.1, 1.1), s = rand(1.5, 5.5);
    fx.blood.spawn(z.x, rand(0.6, 1.4), z.z, Math.cos(a) * s, rand(1, 4), Math.sin(a) * s, 2, rand(0.06, 0.13), Math.random() < 0.5 ? '#7a0e0c' : '#a01814', { grav: 11, drag: 0.6 });
  }
  floaters.push({ x: z.x, y: 2.4, z: z.z, text: '+' + z.score * wave, t: 1.1, color: '#f2c14e' });
  const roll = Math.random();
  if (roll < 0.06 + (z.type === 'brute' ? 0.5 : 0)) addPickup(z.x, z.z, 'med');
  else if (roll < 0.24) addPickup(z.x, z.z, 'ammo');
  hud.dirty = true;
}
function addPickup(x, z, type) {
  const map = pickupAtlas.map.clone(); map.needsUpdate = true; map.repeat.set(0.5, 1); map.offset.set(type === 'med' ? 0.5 : 0, 0);
  const mat = spriteLit(new THREE.MeshLambertMaterial({ map, alphaTest: 0.5, side: THREE.DoubleSide, emissive: new THREE.Color(0.35, 0.35, 0.35), emissiveMap: map }));
  const geo = new THREE.PlaneGeometry(pickupAtlas.w * 1.2, pickupAtlas.h * 1.2); geo.translate(0, pickupAtlas.h * 0.6, 0);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, 0.1, z); mesh.quaternion.copy(camQuat);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: type === 'med' ? new THREE.Color(1.2, 0.35, 0.3) : new THREE.Color(1.1, 0.9, 0.35), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  glow.scale.set(1.3, 1.3, 1); glow.position.set(0, 0.5, -0.05);
  mesh.add(glow);
  scene.add(mesh);
  pickups.push({ x, z, type, t: 22, mesh });
}

// ================= SÓNG / ĐÊM =================
function nextWave() {
  wave++;
  toSpawn = Math.min(6 + wave * 4, 70);
  spawnTimer = 2.5; intermission = 0;
  const pi = presetForNight(wave);
  atmos.go(pi, wave === 1 ? 0.01 : 6);
  showMsg(`ĐÊM ${wave}`, PRESETS[pi].name);
  sound.wave();
  WEAPONS.forEach((w, i) => {
    if (w.unlock === wave && !player.guns[i].owned) {
      player.guns[i].owned = true; player.guns[i].reserve = w.mag * 3;
      setTimeout(() => showMsg('VŨ KHÍ MỚI', `${w.name} — bấm ${i + 1}${isTouch ? ' hoặc ⇄' : ''}`), 2600);
    }
  });
  hud.dirty = true;
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
  if (!hud.dirty) return;
  hud.dirty = false;
  const w = WEAPONS[player.weapon], g = curGun();
  setText('night', `ĐÊM ${wave}`);
  setText('atmo', PRESETS[atmos.index].name);
  setText('score', String(score));
  setText('kills', `${kills} hạ gục`);
  const alive = zombies.filter((z) => z.state !== 'dead').length;
  setText('left', intermission > 0 ? 'Trời sắp sáng…' : `Zombie còn lại: ${toSpawn + alive}`);
  setText('wname', w.name);
  setText('ammo', String(g.ammo));
  setText('reserve', g.reserve === Infinity ? '∞' : String(g.reserve));
  $('ammo').classList.toggle('empty', g.ammo === 0);
  document.querySelectorAll('#slots .slot').forEach((el, i) => {
    el.classList.toggle('on', i === player.weapon);
    el.classList.toggle('owned', player.guns[i].owned);
  });
}

// ================= VÒNG LẶP CẬP NHẬT =================
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
    const d = Math.hypot(e.pos.x - camTarget.x, (e.pos.z - camTarget.z) * 1.2);
    e.w = e.cur * (1 - clamp((d - 15) / 9, 0, 1));
  }
  const sorted = world.emitters.filter((e) => e.w > 0.05).sort((a, b) => b.w - a.w);
  for (let i = 0; i < pool.length; i++) {
    const l = pool[i], e = i < n ? sorted[i] : null;
    if (e) { l.position.copy(e.pos); l.color.copy(e.color); l.intensity = e.w; l.distance = e.dist; }
    else l.intensity = 0;
  }
  for (const L of world.lampHeads) L.mat.emissiveIntensity = 4.2 * (L.e.cur / Math.max(0.01, L.e.base));
  for (const m of world.windowMats) m.emissiveIntensity = 2.4 * A.windows;
  for (const gs of world.glowSprites) {
    gs.s.material.color.copy(gs.color).multiplyScalar(gs.base * (gs.color.r > gs.color.g * 1.4 ? A.fires : A.lamps));
  }
}
function applyAtmos(dt, t) {
  const A = atmos.update(dt);
  sun.color.copy(A.sunColor);
  sun.intensity = A.sunI + lightning * 3.5;
  hemi.color.copy(A.hemiSky); hemi.groundColor.copy(A.hemiGround);
  hemi.intensity = A.hemiI + lightning * 1.5;
  scene.fog.color.copy(A.fog); scene.fog.near = A.fogNear; scene.fog.far = A.fogFar;
  renderer.setClearColor(A.fog);
  // bóng đổ mặt trời/trăng đi theo camera, căn theo lưới texel để đỡ rung
  const step = (sunSize * 2) / sun.shadow.mapSize.x;
  const sx = Math.round(camTarget.x / step) * step, sz = Math.round(camTarget.z / step) * step;
  sun.target.position.set(sx, 0, sz);
  sun.position.set(sx + A.sunDir.x * 40, A.sunDir.y * 40, sz + A.sunDir.z * 40);
  const P = post.params;
  P.exposure = A.exposure; P.bloom = A.bloom; P.threshold = A.threshold; P.sat = A.sat; P.contrast = A.contrast; P.vignette = A.vignette;
  P.lift = A.lift; P.gain = A.gain;
  P.flash = [hurtFlash * 0.25 + lightning * 0.5, lightning * 0.55, lightning * 0.65];
  U.wet.value = A.wet; U.wind.value = A.wind;
  world.water.material.uniforms.uRain.value = A.rain;
  updateLights(t, A);
  // thời tiết
  const px = renderer.getDrawingBufferSize(tmpV2).y / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
  fx.rain.update(camTarget, A.rain, A.wind, px);
  fx.fireflies.update(A.fireflies, null, px);
  fx.ash.update(A.ash, camTarget, px);
  fx.mist.update(dt, t, A.mist, A.fog.clone().lerp(new THREE.Color(1, 1, 1), 0.25));
  fx.shafts.update(t, A.shafts, A.sunColor, A.sunDir);
  fx.leaves.update(dt, t, A.leaves, world.canopies, camTarget, A.wind);
  fx.moths.update(t, world.lampHeads, camTarget, A.lamps > 0.5);
  // chớp
  if (A.lightning > 0.5 && state.mode !== 'loading') {
    lightningT -= dt;
    if (lightningT <= 0) {
      lightningT = rand(6, 14);
      lightning = 1;
      thunderQ.push(rand(0.3, 1.6));
    }
  }
  lightning = Math.max(0, lightning - dt * (lightning > 0.5 ? 6 : 2.5));
  if (lightning > 0.4 && Math.random() < 0.1) lightning = 0.9;
  for (let i = thunderQ.length - 1; i >= 0; i--) { thunderQ[i] -= dt; if (thunderQ[i] <= 0) { sound.thunder(rand(0.6, 1)); thunderQ.splice(i, 1); } }
  sound.update(dt, { rain: A.rain, wind: A.wind, crickets: (1 - A.rain) * (A.id === 'blood' ? 0.2 : 1) * (state.mode === 'play' || state.mode === 'title' ? 1 : 0), fire: Math.max(0, 1 - Math.hypot(player.x - world.plaza.x, player.z - world.plaza.z) / 9), music: 1 });
  return A;
}

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
  player.x += mx * spd * dt; player.z += mz * spd * dt;
  collide(player);
  player.moving = mag > 0.1;
  if (player.moving) {
    player.walk += dt * spd * 1.6;
    player.stepT -= dt * spd;
    if (player.stepT <= 0) { player.stepT = 1.6; if (sprint) fx.lit.spawn(player.x, 0.05, player.z, rand(-0.5, 0.5), rand(0.4, 1), rand(-0.3, 0.3), 0.7, 0.14, '#6a5a48', { grav: 1.5, drag: 3 }); }
  }
  let firing = false;
  const as = stickVec(sticks.aim);
  if (as.m > 0) { player.aim = Math.atan2(as.y, as.x); firing = as.m > 0.35; }
  else if (!isTouch && mouse.has) {
    const p = screenToGround(mouse.x, mouse.y, 1.0);
    if (p) player.aim = Math.atan2(p.z - player.z, p.x - player.x);
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
  // sprite
  const sp = player.sprite;
  player.dir = dirFromAngle(player.aim);
  const frame = player.moving ? Math.floor(player.walk) % 4 : 0;
  setFrame(sp, player.dir, frame);
  sp.group.position.set(player.x - Math.cos(player.aim) * player.recoil, 0, player.z - Math.sin(player.aim) * player.recoil);
  sp.mat.color.setScalar(player.inv > 0 && Math.floor(player.inv * 20) % 2 ? 2.2 : 1);
  // đèn pin
  const ca = Math.cos(player.aim), sa = Math.sin(player.aim);
  flashlight.position.set(player.x + ca * 0.3, 1.15, player.z + sa * 0.3);
  flashlight.target.position.set(player.x + ca * 9, 0.15, player.z + sa * 9);
}

function updateZombies(dt) {
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
      s.group.position.y = -s.h * (1 - k);
      if (Math.random() < 0.3) fx.lit.spawn(z.x + rand(-0.4, 0.4), 0.05, z.z + rand(-0.3, 0.3), rand(-0.6, 0.6), rand(1, 2.5), rand(-0.4, 0.4), 0.8, 0.1, '#3e2c1e', { grav: 9 });
      setFrame(s, 'down', Math.floor(z.t * 6) % 4);
      if (k >= 1) z.state = 'walk';
      s.mat.color.setScalar(z.hitT > 0 ? 3 : 1);
      z.hitT -= dt;
      continue;
    }
    let dx = player.x - z.x, dz = player.z - z.z;
    const d = Math.hypot(dx, dz) || 1;
    dx /= d; dz /= d;
    if (z.stuck > 0.35) {
      const sx = -dz * z.side, sz = dx * z.side;
      dx = dx * 0.25 + sx; dz = dz * 0.25 + sz;
      z.stuck -= dt * 0.5;
      if (z.stuck > 1.6) { z.stuck = 0; z.side *= -1; }
    }
    for (let j = i + 1; j < zombies.length; j++) {
      const o = zombies[j];
      if (o.state === 'dead') continue;
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
        player.x += dx * kb; player.z += dz * kb; collide(player);
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
    let dead = b.life <= 0 || b.x < BOUNDS.x0 - 4 || b.x > BOUNDS.x1 + 4 || b.z < BOUNDS.z0 - 4 || b.z > BOUNDS.z1 + 4;
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
        if (z.state === 'dead') continue;
        const t = clamp(((z.x - b.px) * sx + (z.z - b.pz) * sz) / sl, 0, 1);
        const cx = b.px + sx * t, cz = b.pz + sz * t;
        if ((z.x - cx) ** 2 + (z.z - cz) ** 2 < (z.r + 0.08) ** 2) {
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
  // vệt đạn
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3(), E = new THREE.Euler();
  let n = 0;
  for (const b of bullets) {
    if (n >= 64) break;
    const a = Math.atan2(b.vz, b.vx);
    const len = 1.1;
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
      scene.remove(p.mesh); p.mesh.material.map.dispose(); pickups.splice(i, 1);
    } else if (p.t <= 0) { scene.remove(p.mesh); pickups.splice(i, 1); }
  }
}

function updateWaves(dt) {
  if (toSpawn > 0) {
    spawnTimer -= dt;
    const alive = zombies.filter((z) => z.state !== 'dead').length;
    if (spawnTimer <= 0 && alive < (quality === 'high' ? 42 : 28)) {
      const batch = Math.min(toSpawn, 1 + Math.floor(wave / 3));
      for (let i = 0; i < batch; i++) if (spawnZombie()) toSpawn--;
      spawnTimer = Math.max(0.4, 1.7 - wave * 0.1) * rand(0.6, 1.3);
      hud.dirty = true;
    }
  } else if (!zombies.some((z) => z.state !== 'dead')) {
    if (intermission === 0) {
      intermission = 7;
      showMsg(`ĐÃ SỐNG SÓT ĐÊM ${wave}`, '+25 máu · chuẩn bị cho đêm tiếp theo');
      player.hp = Math.min(player.maxHp, player.hp + 25);
      score += wave * 100; hud.dirty = true;
    }
    intermission -= dt;
    if (intermission <= 0.0001) nextWave();
  }
}

function updateCamera(dt) {
  let lead = 0;
  if (state.mode === 'play') lead = isTouch ? 1.2 : 2.0;
  let tx = player.x + Math.cos(player.aim) * lead, tz = player.z + Math.sin(player.aim) * lead * 0.8;
  if (state.mode === 'title') {
    const t = gtime * 0.05;
    tx = world.plaza.x + Math.sin(t) * 9; tz = world.plaza.z - 2 + Math.sin(t * 0.7) * 5;
  }
  tx = clamp(tx, -19, 19); tz = clamp(tz, -13.5, 15.5);
  const k = Math.min(1, dt * (state.mode === 'title' ? 0.8 : 5));
  camTarget.x += (tx - camTarget.x) * k; camTarget.z += (tz - camTarget.z) * k;
  shake = Math.max(0, shake - dt * 1.8);
  placeCamera(shake);
  sound.setListener(camTarget.x, camTarget.z);
  // vòng nhìn xuyên & đẩy cỏ
  const s = renderer.getDrawingBufferSize(tmpV2);
  tmpV.set(player.x, 1.0, player.z).project(camera);
  U.seeCenter.value.set((tmpV.x * 0.5 + 0.5) * s.x, (tmpV.y * 0.5 + 0.5) * s.y);
  U.seeRadius.value = s.y * 0.12;
  tmpV.set(player.x, 1.0, player.z).applyMatrix4(camera.matrixWorldInverse);
  U.seeDepth.value = -tmpV.z - 1.0;
  U.seeZ.value = state.mode === 'title' ? 999 : player.z;
  post.params.focus = -tmpV.z;
  U.push.value[0].set(player.x, 0, player.z, 1.1);
  const near = zombies.filter((z) => z.state === 'walk').map((z) => ({ z, d: Math.abs(z.x - camTarget.x) + Math.abs(z.z - camTarget.z) })).sort((a, b) => a.d - b.d);
  for (let i = 1; i < 6; i++) { const o = near[i - 1]; if (o) U.push.value[i].set(o.z.x, 0, o.z.z, o.z.r + 0.5); else U.push.value[i].set(0, -99, 0, 0.01); }
}

// ---------- vẽ lớp 2D: số sát thương, cần điều khiển, tâm ngắm ----------
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
    if (z.state !== 'walk' || (z.hp >= z.maxHp && z.type !== 'brute')) continue;
    tmpV.set(z.x, z.sprite.h + 0.25, z.z).project(camera);
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
  nextWave();
  // chế độ chụp ảnh để kiểm tra đồ hoạ: ?shot=<kiểu thời tiết>&px=..&pz=..
  if (QS.has('shot')) {
    atmos.go(+QS.get('shot'), 0.01); atmos.update(1);
    if (QS.has('px')) { player.x = +QS.get('px'); player.z = +QS.get('pz'); }
    player.hp = player.maxHp = 1e6; toSpawn = 0;
    const types = ['walker', 'runner', 'walker', 'brute', 'walker', 'runner'];
    types.forEach((t, i) => spawnAt(t, player.x + Math.cos(i * 1.05 + 0.4) * rand(3.5, 6), player.z + Math.sin(i * 1.05 + 0.4) * rand(3, 5)));
    camTarget.set(player.x, 0.8, player.z);
    window.__dn = { get zombies() { return zombies; }, get player() { return player; }, camera, size: () => [W, H] };
  }
}
function spawnAt(type, x, z) {
  const T = ZT[type], hp = T.hp;
  const zz = { type, x, z, r: T.r, speed: rand(T.speed[0], T.speed[1]) * 0.3, hp, maxHp: hp, dmg: 0, score: T.score, atkT: 0, atkCd: T.atk,
    walk: rand(0, 4), dir: 'down', hitT: 0, stuck: 0, side: 1, state: 'walk', t: 0, sprite: spriteFor(type) };
  zz.sprite.group.position.set(x, 0, z);
  zombies.push(zz);
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
function setQualityLabel() { $('q-btn').textContent = 'Đồ hoạ: ' + (quality === 'high' ? 'Cao' : 'Nhẹ'); }

// ================= KHỞI TẠO =================
function init() {
  resize();
  setupShadowsAndPool();
  placeCamera();
  camera.updateMatrixWorld();
  camQuat.copy(camera.quaternion);
  world = buildWorld(scene, quality, camera);
  SPR = makeCharacterSprites();
  pickupAtlas = makePickupAtlas();
  glowTex = softDisc(64, 0, 2.2);
  fx.hide = world.hideInReflection;
  fx.lit = new Particles(scene, 500, { camQuat });
  fx.blood = new Particles(scene, 600, { camQuat });
  fx.spark = new Particles(scene, 300, { additive: true, camQuat });
  fx.smoke = new Particles(scene, 260, { cube: true, camQuat });
  fx.ember = new Particles(scene, 200, { additive: true, camQuat });
  fx.decals = new Decals(scene, 200);
  fx.blood.onLand = (x, z, r, i) => { if (Math.random() < 0.35) fx.decals.add(x, z, rand(0.25, 0.55)); return true; };
  fx.rain = new Rain(scene, quality === 'high' ? 2400 : 1200);
  const fz = [{ x: world.pond.x, z: world.pond.z, w: 14, d: 9 }, { x: -2, z: 15, w: 30, d: 10 }, { x: 22, z: 15, w: 14, d: 10 }, { x: -24, z: -4, w: 12, d: 10 }, { x: 0, z: -20, w: 60, d: 4 }, { x: 20, z: -12, w: 14, d: 8 }];
  fx.fireflies = new Motes(scene, quality === 'high' ? 160 : 90, { color: new THREE.Color(3.2, 4.2, 1.2), size: 0.11, zones: fz });
  fx.ash = new Motes(scene, quality === 'high' ? 500 : 250, { color: new THREE.Color(1.6, 0.7, 0.4), size: 0.05, zones: [{ x: 0, z: 0, w: 1, d: 1 }], mode: 'ash', glow: false });
  fx.mist = new Mist(scene, 3);
  fx.shafts = new Shafts(scene, [{ x: -18, y: 12, z: -6, w: 3.2 }, { x: 13, y: 12, z: -4, w: 2.6 }, { x: -6, y: 12, z: 15, w: 3 }, { x: 24, y: 12, z: 14, w: 3.4 }, { x: -27, y: 12, z: 9, w: 2.8 }, { x: 4, y: 12, z: -20, w: 3.6 }]);
  fx.crows = new Crows(scene, world.perches, camQuat, (p) => sound.caw(p.x, p.z));
  fx.moths = new Moths(scene, camQuat);
  fx.leaves = new Leaves(scene, camQuat);
  for (const m of [fx.lit.mesh, fx.blood.mesh, fx.spark.mesh, fx.smoke.mesh, fx.ember.mesh, fx.rain.mesh, fx.rain.splash, fx.fireflies.mesh, fx.ash.mesh, fx.moths.mesh, fx.leaves.p.mesh]) world.hideInReflection.push(m);
  for (const L of fx.mist.layers) world.hideInReflection.push(L.mesh);
  for (const it of fx.shafts.items) world.hideInReflection.push(it.mesh);
  // luồng sáng đèn pin thể tích
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
  camTarget.set(world.plaza.x, 0.8, world.plaza.z);
  atmos.go(1, 0.01); atmos.update(1);
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
}

// ================= KHÓI & TÀN LỬA =================
function updateSmoke(dt, A) {
  for (const s of world.smokeSources) {
    if (Math.abs(s.x - camTarget.x) > 24 || Math.abs(s.z - camTarget.z) > 20) continue;
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
    updatePlayer(dt);
    if (state.mode === 'play') updateZombies(dt);
    if (state.mode === 'play') { updateBullets(dt); updatePickups(dt); updateWaves(dt); }
  } else if (state.mode === 'over') {
    updateZombies(dt * 0.3);
    updateBullets(dt);
  } else {
    setFrame(player.sprite, 'down', 0);
    player.sprite.group.position.set(player.x, 0, player.z);
    flashlight.position.set(player.x, 1.15, player.z + 0.3);
    flashlight.target.position.set(player.x, 0.15, player.z + 6);
  }
  updateCamera(dt);
  const A = applyAtmos(dt, gtime);
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
  if (DBG) renderer.info.reset();
  post.render(scene, camera, gtime);
  if (DBG) window.__info = { calls: renderer.info.render.calls, tris: renderer.info.render.triangles, geos: renderer.info.memory.geometries, tex: renderer.info.memory.textures, progs: renderer.info.programs.length, leaves: world.leafMesh.count, q: quality };
  draw2D();
}

// ================= NÚT BẤM =================
$('start-btn').addEventListener('click', startGame);
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
  ? 'Ngón trái: di chuyển (kéo hết cỡ để chạy) · Ngón phải: ngắm &amp; bắn<br>R: nạp đạn · ⇄: đổi súng · ❚❚: tạm dừng'
  : 'WASD: di chuyển · Shift: chạy · Chuột: ngắm &amp; bắn<br>R: nạp đạn · 1/2/3, Q, lăn chuột: đổi súng · P: tạm dừng · M: tắt tiếng';

requestAnimationFrame(() => setTimeout(() => {
  try { init(); } catch (e) {
    console.error(e);
    $('loading').textContent = 'Không khởi tạo được WebGL: ' + e.message;
  }
}, 30));

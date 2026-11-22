// DEAD NIGHT — game sinh tồn zombie phong cách HD-2D: sprite pixel trong diorama 3D,
// camera thấp nhìn ngang, cuộn theo nhân vật dọc con phố của ngôi làng.
import * as THREE from 'three';
import { buildWorld, U, BOUNDS, TY, WALL_Z, STAIRS, STAIR_DEPTH, STREET_FRONT, POND, ZB, BUILDINGS, buildingAt, HELIPAD, setZone, ZONE, ZONES, GRID, zoneCell, zoneLinks, WORLD_FLAGS, RAIL_Z, FLOOR_H } from './world.js';
import { Post } from './post.js';
import { Atmos } from './atmos.js';
import { Particles, Decals, Rain, Motes, Mist, Shafts, Crows, Moths, Leaves, Sky, Butterflies, Flock, LampCones } from './fx.js';
import { makeCharacterSprites, makePickupAtlas, DIR_ROW, playerSprites, PLAYER_COLORS, makeItemIcons, makeFlowerSprite, charSprites, charPortrait, npcAtlas, npcZombieAtlas } from './sprites.js';
import { CHARS, SKILLS, computeMod, xpNeed } from './chars.js';
import { ITEMS, ITEM_ORDER, rollLoot, searchTime, RECIPES, TORCH_TIME, BATTERY_TIME, MELEE, MELEE_ORDER, BOOKS, ARMOR_PTS } from './items.js';
import { openTransport, openFirebase, canUseFirebase, makeCode, roomName, cleanCode, cleanName, transportError } from './net.js';
import { spriteLit, softDisc, makeRng } from './pixel.js';
import { Sound } from './audio.js';
import { cinema } from './cinema.js';
import { makeModel, animateModel, modelSwing } from './models.js';

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
// camera chúc xuống hơn một chút để cả mặt phố rộng nằm gọn trong khung
const CAM = { y: 11.0, back: 26, lookY: 2.6, lookZ: -2.4, fov: 31 };
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
sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.035; sun.shadow.radius = 2.5;   // viền bóng mềm (PCF)
scene.add(sun, sun.target);
const flashlight = new THREE.SpotLight('#fff0d6', 0, 22, 0.44, 0.6, 1.5);
flashlight.castShadow = true;
flashlight.shadow.camera.near = 0.3; flashlight.shadow.camera.far = 22;
flashlight.shadow.bias = -0.0008; flashlight.shadow.normalBias = 0.03; flashlight.shadow.radius = 2;
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
// vật luôn ẩn khỏi ảnh phản chiếu mặt ao (giữ qua các lần dựng lại khu)
const reflHide = [];
function hideRefl(...ms) { for (const m of ms) { reflHide.push(m); if (world) world.hideInReflection.push(m); } }
const camTarget = new THREE.Vector3(0, 1, 1);
const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3();
// ---------- góc nhìn thứ nhất (cùng thế giới HD-2D, camera đặt ở tầm mắt nhân vật) ----------
const FP = { on: false, yaw: -Math.PI / 2, pitch: 0, bobT: 0, bob: 0, run: 0, strafe: 0, sway: 0, swayY: 0, hand: 0, lastSwing: 0, locked: false, lockFailed: false, releasing: false };
const SPRITES = new Set();
const DIR_ANG = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 };
const Y_AXIS = new THREE.Vector3(0, 1, 0), qYaw = new THREE.Quaternion();
// hướng khung hình theo vị trí camera: zombie đi về phía mình thì thấy mặt, đi ra xa thì thấy lưng
function fpDir(s, dir) {
  const p = s.group.position, c = camera.position;
  const r = angDiff(DIR_ANG[dir] ?? 0, Math.atan2(c.z - p.z, c.x - p.x)), a = Math.abs(r);
  if (a < Math.PI / 4) return 'down';
  if (a > 3 * Math.PI / 4) return 'up';
  return r < 0 ? 'right' : 'left';
}

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
let sunYaw = 0;
// hai tấm đổ bóng xếp chéo hình chữ X, cố định theo thế giới (bù góc xoay billboard):
// nắng từ hướng nào cũng có ít nhất một tấm đổ bóng gần đủ bề ngang
let animLast = 0;
function updateSpriteShadows() {
  const now = performance.now(), adt = animLast ? Math.min(0.1, (now - animLast) / 1000) : 0;
  animLast = now;
  for (const sp of SPRITES) {
    if (sp.is3d) {
      if (!sp.group.parent) { SPRITES.delete(sp); continue; }
      if (sp.group.visible) animateModel(sp, state.paused ? 0 : adt);
      continue;
    }
    if (!sp.shadow) continue;
    if (!sp.group.parent) { SPRITES.delete(sp); continue; }
    const r = sp.group.rotation.y;
    sp.shadow.rotation.y = Math.PI / 4 - r; sp.shadow2.rotation.y = -Math.PI / 4 - r;
  }
}
// nhân vật dạng khối 3D (mặc định) — hoặc hình phẳng 2D nếu chọn trong Cài đặt
function makeSprite(atlasList, xray) {
  if (settings.models !== '2d' && atlasList[0] && atlasList[0].src) {
    const a0 = atlasList[0];
    const blob = new THREE.Mesh(blobGeo, blobMat);
    blob.rotation.x = -Math.PI / 2; blob.position.y = 0.035;
    blob.scale.set(a0.w * 0.75, a0.w * 0.5, 1);
    blob.renderOrder = 1;
    const sp = makeModel(atlasList, xray, blob);
    scene.add(sp.group);
    hideRefl(sp.xr, blob);
    return sp;
  }
  const maps = atlasList.map((a) => { const m = a.map.clone(); m.needsUpdate = true; m.repeat.set(1 / 4, 1 / 4); return m; });
  const a0 = atlasList[0];
  let emap = null;
  if (a0.emissiveMap) { emap = a0.emissiveMap.clone(); emap.needsUpdate = true; emap.repeat.set(1 / 4, 1 / 4); }
  const mat = new THREE.MeshLambertMaterial({ map: maps[0], alphaTest: 0.5, side: THREE.DoubleSide });
  if (emap) { mat.emissiveMap = emap; mat.emissive.set(0xffffff); mat.emissiveIntensity = 3.2; }
  spriteLit(mat);
  const geo = new THREE.PlaneGeometry(a0.w, a0.h); geo.translate(0, a0.h / 2, 0);
  const mesh = new THREE.Mesh(geo, mat);
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: maps[0], alphaTest: 0.5 });
  mesh.customDepthMaterial = depth;
  // tấm đổ bóng vô hình luôn quay về phía mặt trời: bóng nhân vật đầy đặn ở mọi góc nắng / góc nhìn
  mesh.castShadow = false;
  // three.js lấy map/alphaTest/side từ vật liệu của vật khi vẽ bóng, nên tấm này cần map riêng và hai mặt
  const smat = new THREE.MeshBasicMaterial({ map: maps[0], alphaTest: 0.5, side: THREE.DoubleSide, colorWrite: false, depthWrite: false });
  const shadow = new THREE.Mesh(geo, smat), shadow2 = new THREE.Mesh(geo, smat);
  for (const o of [shadow, shadow2]) { o.castShadow = true; o.customDepthMaterial = depth; mesh.add(o); }
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
  hideRefl(xr, blob);
  return { group, mesh, mat, maps, emap, depth, xr, xmat, blob, shadow, shadow2, smat, cur: 0, w: a0.w, h: a0.h };
}
function setFrame(s, dir, frame, ang) {
  s._dir = dir; s._fr = frame; SPRITES.add(s);
  if (s.is3d) {
    // khung đổi mà không đi (lục đồ, trồi lên…): tay cử động
    if (frame !== s.fr && frame && s.amp < 0.25) s.busy = 0.25;
    s.fr = frame; s.dir = dir; s.ang = ang ?? null;
    return;
  }
  if (FP.on) dir = fpDir(s, dir);
  const ox = frame / 4, oy = 1 - (DIR_ROW[dir] + 1) / 4;
  s.maps[s.cur].offset.set(ox, oy);
  if (s.emap) s.emap.offset.set(ox, oy);
}
function setSpriteMap(s, i) {
  if (s.is3d) { s.setWeapon(i); return; }
  if (s.cur === i) return;
  s.cur = i;
  s.mat.map = s.maps[i]; s.depth.map = s.maps[i]; s.xmat.map = s.maps[i]; if (s.smat) s.smat.map = s.maps[i];
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
  // súng tự chế của Naryne: ít đạn, nạp lâu, kém chính xác hơn súng thật
  { key: 'pistol', name: 'SÚNG ỐNG', dmg: 42, rate: 0.45, mag: 2, reload: 1.5, spread: 0.05, pellets: 1, speed: 34, kick: 0.09, shake: 0.16, ammo: 'ammo9', noise: 15 },
  { key: 'shotgun', name: 'HOA CẢI', dmg: 17, rate: 0.9, mag: 1, reload: 1.9, spread: 0.24, pellets: 8, speed: 30, kick: 0.22, shake: 0.42, ammo: 'shells', noise: 19 },
  { key: 'smg', name: 'SÚNG ĐINH', dmg: 11, rate: 0.13, mag: 20, reload: 1.6, spread: 0.06, pellets: 1, speed: 30, kick: 0.03, shake: 0.05, ammo: 'nails', noise: 6 },
  { key: 'bow', name: 'CUNG', dmg: 58, rate: 0.7, mag: 1, reload: 0.45, spread: 0.012, pellets: 1, speed: 26, kick: 0.03, shake: 0.04, ammo: 'arrow', noise: 0, bow: true },
];
// nhân vật đang chơi (lưu lựa chọn)
let myChar = clamp(+store.get('deadnight_char', '0') || 0, 0, CHARS.length - 1);
// đội 4 người: nhân vật của bạn + 3 bạn đồng hành; 1 người ở lại (không đi cùng)
const TEAM_N = 4;
const BENCH_PREF = ['lycas', 'ama', 'tien', 'hamble', 'naryne'].map((id) => CHARS.findIndex((c) => c.id === id));
let bench = clamp(+store.get('deadnight_bench', '-1'), -1, CHARS.length - 1);
function fixBench() { if (bench < 0 || bench === myChar) bench = BENCH_PREF.find((i) => i !== myChar); return bench; }
fixBench();
const teamIdx = () => { fixBench(); return CHARS.map((c, i) => i).filter((i) => i !== bench); };
const inTeam = (id) => teamIdx().some((i) => CHARS[i].id === id);
// ai đang thực sự đi cùng: bạn, người chơi khác trong phòng, bot
function partyIds() {
  const s2 = new Set([player ? player.char : myChar]);
  if (net.active) for (const rp of net.players.values()) if (rp.inited) s2.add(rp.char);
  for (const b of allBots()) s2.add(b.ci);
  return [...s2].map((i) => CHARS[i].id);
}
const charSet = (ci) => { const s2 = charSprites(ci, CHARS[ci].pal); return [s2.knife, s2.pistol, s2.shotgun, s2.smg, s2.bow, s2.fist, s2.club, s2.spear]; };
// hình đang cầm: ô 0 là vũ khí cận chiến (dao / tay không / gậy / giáo)
const MELEE_SPR = { knife: 0, fist: 5, club: 6, spear: 7 };
const sprIdx = () => (player.weapon === 0 ? MELEE_SPR[MELEE[player.melee].spr] : player.weapon);
const setPlayerSprite = () => setSpriteMap(player.sprite, sprIdx());
function loadProgress(ci) {
  try { const o = JSON.parse(store.get('deadnight_prog_' + CHARS[ci].id, '{}')); return { xp: +o.xp || 0, level: +o.level || 1, sp: +o.sp || 0, learned: new Set(Array.isArray(o.learned) ? o.learned : []) }; }
  catch (e) { return { xp: 0, level: 1, sp: 0, learned: new Set() }; }
}
function saveProgress() {
  if (!player || player.char === undefined) return;
  store.set('deadnight_prog_' + CHARS[player.char].id, JSON.stringify({ xp: player.xp, level: player.level, sp: player.sp, learned: [...player.learned] }));
}
function applyMods() {
  const c = CHARS[player.char];
  player.mod = computeMod(c.id, player.learned);
  const oldMax = player.maxHp || c.hp;
  player.maxHp = c.hp + player.mod.maxHp;
  player.hp = Math.min(player.maxHp, player.hp + Math.max(0, player.maxHp - oldMax));
  player.speed = c.speed + player.mod.speed;
  hud.dirty = true;
}
// kinh nghiệm: giết zombie, lục đồ, chế tạo, cứu bạn, làm nhiệm vụ, sống qua đêm
// không còn cấp độ / điểm kỹ năng: giữ hàm để các chỗ gọi cũ không phải sửa
function gainXP() {}
const CORPSE_LIFE = 60;
let zid = 0;
const ZT = {
  walker: { r: 0.36, speed: [1.0, 1.5], hp: 80, dmg: 10, score: 10, atk: 0.9, hpW: 7 },
  runner: { r: 0.33, speed: [2.7, 3.2], hp: 54, dmg: 8, score: 15, atk: 0.75, hpW: 5 },
  brute: { r: 0.62, speed: [0.85, 1.05], hp: 410, dmg: 25, score: 50, atk: 1.2, hpW: 34 },
  // zombie đặc biệt (cơ chế kiểu game co-op sinh tồn, thiết kế riêng)
  bloater: { r: 0.55, speed: [0.75, 0.9], hp: 58, dmg: 6, score: 30, atk: 1.2, hpW: 4 },
  spitter: { r: 0.34, speed: [1.1, 1.3], hp: 92, dmg: 6, score: 30, atk: 1.0, hpW: 5 },
  pouncer: { r: 0.33, speed: [2.3, 2.7], hp: 118, dmg: 9, score: 35, atk: 0.5, hpW: 5 },
  charger: { r: 0.6, speed: [1.15, 1.35], hp: 540, dmg: 22, score: 60, atk: 1.2, hpW: 24 },
  weeper: { r: 0.34, speed: [4.4, 4.8], hp: 520, dmg: 40, score: 100, atk: 0.85, hpW: 20 },
};
const SPECIAL = {
  bloater: { name: 'ZOMBIE PHÌNH', hint: 'Bị giết hay lại gần là nổ dịch xanh · dính dịch thì cả bầy kéo tới' },
  spitter: { name: 'ZOMBIE PHUN', hint: 'Phun axit từ xa · tránh khỏi vũng axit xanh' },
  pouncer: { name: 'ZOMBIE VỒ', hint: 'Vồ đè người · bấm E liên tục để vùng ra, đồng đội đánh nó để cứu' },
  charger: { name: 'ZOMBIE HÚC', hint: 'Gầm rồi lao thẳng húc văng · né sang ngang' },
  weeper: { name: 'ZOMBIE KHÓC', hint: 'Đang ngồi khóc · đừng lại gần, đừng rọi đèn, đừng nổ súng gần nó' },
  brute: { name: 'ZOMBIE KHỔNG LỒ', hint: 'Rất trâu, đánh rất đau · giữ khoảng cách mà bắn' },
};
const seenSpecial = new Set();
let lastFlash = 0;
const state = { mode: 'loading', paused: false };
let player, zombies = [], bullets = [], pickups = [], floaters = [];
let wave = 0, toSpawn = 0, spawnTimer = 0, intermission = 0, kills = 0, score = 0, shake = 0, gtime = 0;
let hurtFlash = 0, lightning = 0, lightningT = 8, thunderQ = [], playStart = 0;
// pha trong ngày: dusk (chiều tà) → night (đêm, zombie tấn công) → dawn (rạng đông) → day (nghỉ ngơi)
let phase = 'title', phaseT = 0, dayNo = 0, nightKills = 0, nightTotal = 1, hourFrom = 0, strayT = 0, dayStartHour = 6.9;
// độ dài một ván: ngày (lục soát) và đêm (cầm cự) tính bằng giây thực
const DURATIONS = {
  cycle: { name: 'Chuẩn', day: 600, night: 600, est: 'ngày 10 phút · đêm 10 phút' },
  short: { name: 'Ngắn', day: 100, night: 90, est: '~10 phút' },
  normal: { name: 'Vừa', day: 150, night: 120, est: '~15–20 phút' },
  long: { name: 'Dài', day: 240, night: 170, est: '~30 phút' },
};
let durKey = DURATIONS[store.get('deadnight_dur2', 'cycle')] ? store.get('deadnight_dur2', 'cycle') : 'cycle';
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
  if (quitted) return;
  if (cinema.active) {
    if (e.code === 'Escape') cinema.userSkip();
    else if (['Space', 'Enter', 'KeyE', 'NumpadEnter'].includes(e.code) && !e.repeat) cinema.userAdvance();
    e.preventDefault();
    return;
  }
  if (rebinding) { captureRebind(e); return; }
  if (!$('confirm').classList.contains('hidden')) { if (e.code === 'Escape') closeConfirm(); else if (e.code === 'Enter') $('cf-yes').click(); return; }
  if (settingsOpen) { if (e.code === 'Escape') closeSettings(); return; }
  if ((state.mode === 'title' || !$('pause').classList.contains('hidden')) && menuNav(e)) { e.preventDefault(); return; }
  keys[e.code] = true;
  if (e.code === 'Space' || e.code.startsWith('Arrow') || e.code === 'Tab') e.preventDefault();
  if (state.mode === 'view') { viewKey(e.code); return; }
  if (state.mode !== 'play') return;
  const act = actionOf(e.code);
  if (!$('pause').classList.contains('hidden')) { if (act === 'pause') togglePause(); return; }
  if (player.pinned && (act === 'use' || e.code === 'Space') && !e.repeat) { player.struggle = (player.struggle || 0) + 1; return; }
  if (act === 'bag') { if (craftUI.open) toggleCraft(false); toggleBag(); return; }
  if (act === 'craft') { toggleCraft(); return; }
  if (craftUI.open) { if (e.code === 'Escape') toggleCraft(false); return; }
  if (mapOpen) { if (act === 'map' || e.code === 'Escape') toggleMap(false); return; }
  if (skillsOpen) { if (act === 'skills' || e.code === 'Escape') toggleSkills(false); return; }
  if (bagOpen) { if (e.code === 'Escape') toggleBag(false); return; }
  if (act === 'reload') reload();
  if (e.code === 'Digit1') switchWeapon(0);
  if (e.code === 'Digit2') switchWeapon(1);
  if (e.code === 'Digit3') switchWeapon(2);
  if (e.code === 'Digit4') switchWeapon(3);
  if (e.code === 'Digit5') switchWeapon(4);
  if (act === 'shove') shove();
  if (act === 'holster') holster();
  if (act === 'skills') toggleSkills();
  if (act === 'swap') cycleWeapon();
  if (act === 'heal') quickHeal();
  if (act === 'eat') quickEat();
  if (act === 'cure') quickAntidote();
  if (act === 'light') toggleFlashlight();
  if (act === 'torch') useItem('torch');
  if (act === 'throw') throwMolotov();
  if (act === 'map') toggleMap();
  if (act === 'mute') { settings.mute = !settings.mute; sound.muted = settings.mute; saveSettings(); toast(settings.mute ? 'Đã tắt tiếng' : 'Đã bật tiếng'); }
  if (act === 'view') toggleView();
  if (act === 'mine') placeMine();
  if (act === 'pause') togglePause();
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
canvas.addEventListener('mousemove', (e) => {
  if (view.drag) { view.pan -= (e.clientX - view.drag.x) * viewPxToWorld(); view.drag.x = e.clientX; }
  mouse.x = e.clientX; mouse.y = e.clientY; mouse.has = true;
});
canvas.addEventListener('mousedown', (e) => { sound.init(); if (state.mode === 'view') { view.drag = { x: e.clientX }; return; } if (FP.on && fpLock()) return; if (e.button === 0) mouse.down = true; });
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
    if ((t.clientX < W / 2) !== !!settings.lefty) { if (!sticks.move) sticks.move = st; } else if (!sticks.aim) sticks.aim = st;
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
  const zMax = ZONE.cross !== undefined && Math.abs(o.x - ZONE.cross) < 1.4 ? BOUNDS.z1 + 1.9 : BOUNDS.z1;
  o.x = clamp(o.x, BOUNDS.x0, BOUNDS.x1); o.z = clamp(o.z, BOUNDS.z0, zMax);
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
  NAV.cell = -1; NAV.gen = (NAV.gen || 0) + 1;
}
// đường đi tới một điểm bất kỳ (bot đi lục đồ, đi tới chỗ đứng): trường khoảng cách BFS, lưu đệm theo ô đích
const navFields = new Map();
function navField(x, z) {
  if (!NAV.block) return null;
  const c = navCell(x, z), f = navFields.get(c);
  if (f && f.gen === NAV.gen) return f.d;
  const { w, h, block } = NAV, dist = new Int16Array(w * h).fill(-1), q = new Int32Array(w * h);
  let head = 0, tail = 0; dist[c] = 0; q[tail++] = c;
  while (head < tail) {
    const cc = q[head++], ci = cc % w, cj = (cc / w) | 0, d = dist[cc] + 1;
    for (let k = 0; k < 8; k++) {
      const ni = ci + N8[k][0], nj = cj + N8[k][1];
      if (ni < 0 || nj < 0 || ni >= w || nj >= h) continue;
      const nc = nj * w + ni;
      if (dist[nc] !== -1 || block[nc]) continue;
      if (k >= 4 && (block[cj * w + ni] || block[nj * w + ci])) continue;
      dist[nc] = d; q[tail++] = nc;
    }
  }
  navFields.set(c, { d: dist, gen: NAV.gen });
  if (navFields.size > 24) navFields.delete(navFields.keys().next().value);
  return dist;
}
function navStep(dist, o) {
  const { w, h } = NAV, c = navCell(o.x, o.z), ci = c % w, cj = (c / w) | 0;
  let best = -1, bd = dist[c] >= 0 ? dist[c] : 1e9;
  for (let k = 0; k < 8; k++) {
    const ni = ci + N8[k][0], nj = cj + N8[k][1];
    if (ni < 0 || nj < 0 || ni >= w || nj >= h) continue;
    const nd = dist[nj * w + ni];
    if (nd >= 0 && nd < bd) { bd = nd; best = k; }
  }
  if (best < 0) return false;
  const tx = BOUNDS.x0 + (ci + N8[best][0]) * NAV.res, tz = BOUNDS.z0 + (cj + N8[best][1]) * NAV.res;
  const dx = tx - o.x, dz = tz - o.z, l = Math.hypot(dx, dz) || 1;
  navOut.x = dx / l; navOut.z = dz / l;
  return true;
}
function navCell(x, z) {
  const i = clamp(Math.round((x - BOUNDS.x0) / NAV.res), 0, NAV.w - 1), j = clamp(Math.round((z - BOUNDS.z0) / NAV.res), 0, NAV.h - 1);
  return j * NAV.w + i;
}
function navCompute() {
  const cells = TG.filter((t) => !t.bot).map((t) => navCell(t.x, t.z));
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
  if (player && player.sprite) scene.remove(player.sprite.group);
  const ci = myChar, C = CHARS[ci];
  const sp = makeSprite(charSet(ci), C.color);
  sp.group.scale.setScalar(C.scale || 1);
  const prog = loadProgress(ci);
  const p0 = {
    x: (ZONE.start && ZONE.start.x) ?? 0, z: (ZONE.start && ZONE.start.z) ?? 1.0, r: 0.36, hp: 100, maxHp: 100, stamina: 1, speed: 4.3, food: 85, water: 85, starve: 0,
    aim: 0, dir: 'right', weapon: 0, cooldown: 0, reloading: 0, walk: 0, recoil: 0, inv: 0, moving: false, stepT: 0,
    guns: WEAPONS.map((w, i) => ({ owned: i === 0, ammo: 0 })),
    // vào game tay trắng: phải lục lọi để có đồ
    bag: Object.fromEntries(Object.keys(ITEMS).map((k) => [k, 0])),
    melee: 'fist', durs: {}, armor: 0, pack: false, recipes: new Set(), books: new Set(),
    flashOn: true, battery: 0, torchT: 0, exit: null,
    looted: new Set(), qChecked: new Set(), lootCount: 0, action: null, swing: 0, searching: false,
    infected: 0, zombie: false, picked: new Set(), groanT: 0, coughT: 12,
    sprite: sp, char: ci, xp: 0, level: 1, sp: 0, learned: new Set(), shoveT: 0,
  };
  p0.mod = computeMod(C.id, p0.learned);
  p0.maxHp = C.hp + p0.mod.maxHp; p0.hp = p0.maxHp; p0.speed = C.speed + p0.mod.speed;
  // kiến thức có sẵn theo nghề: Naryne biết công thức y tế, Tiến biết làm cung tên
  const innate = { naryne: 'med', tien: 'bow' }[C.id];
  if (innate) { p0.books.add(innate); for (const R of RECIPES) if (R.book === innate) p0.recipes.add(R.id); }
  return p0;
}
const curGun = () => player.guns[player.weapon];
function switchWeapon(i) {
  if (i === 0 && player.weapon === 0) { cycleMelee(); return; }
  if (!player.guns[i].owned || i === player.weapon) return;
  player.weapon = i; player.reloading = 0; player.cooldown = 0.25;
  setPlayerSprite();
  sound.reload(); hud.dirty = true;
}
// vũ khí cận chiến: dùng loại đang có, gãy thì tự đổi sang loại tốt nhất còn lại
const meleeOwned = () => MELEE_ORDER.filter((id) => id === 'fist' || (player.bag[id] || 0) > 0);
function equipMelee(id, quiet) {
  if (id !== 'fist' && !(player.bag[id] > 0)) return;
  player.melee = id;
  if (id !== 'fist' && !(player.durs[id] > 0)) player.durs[id] = MELEE[id].dur;
  if (player.weapon === 0) setPlayerSprite();
  if (!quiet) lootFeed(id === 'fist' ? null : id, 'Cầm ' + MELEE[id].name.toLowerCase());
  hud.dirty = true;
}
function cycleMelee() {
  const list = meleeOwned();
  if (list.length < 2) return;
  equipMelee(list[(list.indexOf(player.melee) + 1) % list.length]);
}
function bestMelee() { return meleeOwned()[0]; }
function wearMelee() {
  const id = player.melee;
  if (id === 'fist') return;
  player.durs[id] = (player.durs[id] || MELEE[id].dur) - 1;
  if (player.durs[id] > 0) return;
  player.bag[id] = Math.max(0, (player.bag[id] || 0) - 1);
  player.durs[id] = player.bag[id] > 0 ? MELEE[id].dur : 0;
  showMsg(MELEE[id].name + ' ĐÃ GÃY!', player.bag[id] > 0 ? 'Lấy cái khác ra dùng' : 'Chế vũ khí mới bằng sách hướng dẫn');
  sound.hit(player.x, player.z);
  if (!(player.bag[id] > 0)) equipMelee(bestMelee(), true);
}
// cất vũ khí: về tay không (đấm)
function holster() {
  if (state.mode !== 'play' || player.zombie) return;
  if (player.weapon === 0 && player.melee === 'fist') return;
  player.melee = 'fist';
  if (player.weapon !== 0) { player.weapon = 0; player.reloading = 0; player.cooldown = 0.2; }
  setPlayerSprite(); sound.reload(); hud.dirty = true;
  lootFeed(null, 'Cất vũ khí · đánh tay không');
}
function cycleWeapon() {
  for (let k = 1; k <= WEAPONS.length; k++) { const i = (player.weapon + k) % WEAPONS.length; if (player.guns[i].owned) { switchWeapon(i); return; } }
}
const reserveOf = (i) => (WEAPONS[i].melee ? Infinity : player.bag[WEAPONS[i].ammo] || 0);
function reload() {
  const g = curGun(), w = WEAPONS[player.weapon];
  if (w.melee || player.reloading > 0 || player.action || g.ammo >= w.mag || reserveOf(player.weapon) <= 0) return;
  player.reloading = w.reload * (w.bow ? player.mod.bowRate : player.mod.reload); if (!w.bow) sound.reload(); hud.dirty = true;
}
function muzzlePos(out) {
  if (FP.on) { const c = Math.cos(player.aim), s2 = Math.sin(player.aim); return out.set(player.x + c * 0.75 - s2 * 0.12, camera.position.y - 0.28, player.z + s2 * 0.75 + c * 0.12); }
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
  g.ammo--; player.cooldown = w.rate * (w.bow ? player.mod.bowRate : 1); player.recoil = w.kick; hud.dirty = true;
  modelSwing(player.sprite, 0.14);
  if (w.noise) makeNoise(player.x, player.z, w.noise);
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
    const dmg = Math.round(w.dmg * (w.bow ? player.mod.bowDmg : player.mod.gunDmg));
    bullets.push({ x: m.x, z: m.z, y: m.y, px: m.x, pz: m.z, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, dmg, life: w.bow ? 0.75 : 0.6, pierce: w.bow ? player.mod.bowPierce : w.pellets > 1 ? 0 : 1, arrow: !!w.bow, mine: true });
  }
  shake = Math.max(shake, w.shake);
  if (w.bow) { sound.swing(false); }
  else {
    muzzleLight.position.copy(m); muzzleLight.intensity = 45;
    muzzleT = 0.06;
    for (let i = 0; i < 6; i++) { const a = aim + rand(-0.5, 0.5), s = rand(3, 8); fx.spark.spawn(m.x, m.y, m.z, Math.cos(a) * s, rand(-0.5, 1.5), Math.sin(a) * s, rand(0.06, 0.14), 0.07, '#ffd890', { grav: 0, drag: 6, mode: 1 }); }
    const sa = aim + Math.PI / 2 * (Math.random() < 0.5 ? 1 : -1);
    fx.lit.spawn(player.x, 1.0, player.z, Math.cos(sa) * rand(1.5, 2.5), rand(2, 3), Math.sin(sa) * rand(1.5, 2.5), 2.5, 0.07, '#d8b050', { grav: 12, drag: 1, bounce: 0.35, spin: 14 });
    sound.shoot(w.key);
    fx.crows.scare(player.x, player.z, 14);
  }
  if (g.ammo === 0) reload();
}
// chém dao: trúng tối đa 3 zombie trong cung trước mặt
function melee() {
  const w = MELEE[player.melee] || MELEE.fist;
  if (player.cooldown > 0 || player.action) return;
  const M = player.mod;
  player.cooldown = w.rate * M.meleeRate; player.swing = 0.2; player.stamina = Math.max(0, player.stamina - 0.05);
  modelSwing(player.sprite);
  let hits = 0;
  for (const z of zombies) {
    if (!hittable(z)) continue;
    const dx = z.x - player.x, dz = z.z - player.z, d = Math.hypot(dx, dz);
    if (d > w.reach + z.r || Math.abs(angDiff(Math.atan2(dz, dx), player.aim)) > w.arc) continue;
    // Ama: hạ gục im lặng zombie chưa phát hiện mình (trừ zombie to/đặc biệt nặng)
    const silent = M.takedown && !z.aggro && z.type !== 'brute' && z.type !== 'charger' && z.type !== 'weeper';
    damageZombie(z, silent ? 9999 : Math.round(w.dmg * M.meleeDmg), Math.atan2(dz, dx), w.kb * (M.meleeDmg > 1.5 ? 1.5 : 1));
    if (silent) floaters.push({ x: z.x, y: 2.4, z: z.z, text: 'HẠ GỤC!', t: 0.9, color: '#f2c14e' });
    if (++hits >= (player.melee === 'spear' ? 2 : 3)) break;
  }
  if (hits) wearMelee();
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
  if (!client && z.state === 'pin') { z.pinDmg += dmg; if (z.pinDmg >= 25) releasePin(z, 2.0); }
  if (z.state === 'walk' && !client) { const k = z.type === 'brute' ? kb * 0.25 : kb; z.x += Math.cos(a) * k; z.z += Math.sin(a) * k; }
  for (let k = 0; k < 7; k++) {
    const aa = a + rand(-0.8, 0.8), sp = rand(1, 4.5);
    fx.blood.spawn(cx, rand(0.7, 1.3), cz, Math.cos(aa) * sp, rand(0, 2.5), Math.sin(aa) * sp, 1.6, rand(0.05, 0.1), Math.random() < 0.5 ? '#7a0e0c' : '#a51c16', { grav: 11, drag: 0.8 });
  }
  sound.hit(cx, cz);
  if (!remote) floaters.push({ x: z.x + rand(-0.3, 0.3), y: 2.2, z: z.z, text: String(dmg), t: 0.55, color: '#ffffff' });
  if (z.hp <= 0 && !client) killZombie(z, a);
  if (z.hp <= 0 && !remote && !z.xpGiven) { z.xpGiven = true; gainXP(SPECIAL[z.skin] ? (z.type === 'brute' ? 20 : 12) : 4, true); }
}
function wake(z) { if (z.aggro) return; if (z.type === 'weeper') { enrage(z, null); return; } z.aggro = true; z.sprite.xr.visible = true; if (Math.random() < 0.7) sound.groan(z.x, z.z, z.type === 'brute'); }
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
  if (phase === 'night' && r < Math.min(0.3, 0.1 + wave * 0.03)) {
    const q = Math.random();
    if (wave >= 3 && q < 0.12) return 'brute';
    if (wave >= 2 && q < 0.3) return 'charger';
    if (q < 0.55) return 'bloater';
    if (q < 0.78) return 'spitter';
    return 'pouncer';
  }
  if (wave >= 4 && r < 0.06 + wave * 0.012) return 'brute';
  if (wave >= 2 && r < 0.36) return 'runner';
  if (phase === 'night' && r < 0.5) return 'runner';
  return 'walker';
}
// zombie khóc: ngồi một chỗ, không lang thang; bị làm phiền thì nổi điên
function spawnWeeper() {
  for (let k = 0; k < 20; k++) {
    const x = rand(BOUNDS.x0 + 6, BOUNDS.x1 - 6), z = rand(WALL_Z + 0.5, BOUNDS.z1 - 0.5);
    if (insideSolid(x, z, 0.5) || TG.some((t) => Math.abs(t.x - x) < 14) || Math.abs(player.x - x) < 14) continue;
    const w = newZombie('weeper', x, 0, z, 'walk', { aggro: false });
    w.sprite.xr.visible = false;
    return w;
  }
  return null;
}
function newZombie(type, x, y, z, st, o = {}) {
  const T = ZT[type];
  // ban đêm zombie khoẻ, nhanh và cắn đau hơn
  const night = phase === 'night' || phase === 'dusk';
  const hp = Math.round((T.hp + wave * T.hpW + (o.variant === 'soldier' ? 30 : 0)) * (night ? 1.25 : 1));
  const skin = o.variant || type;
  const zz = {
    id: ++zid, type, skin, x, y, z, r: T.r, speed: rand(T.speed[0], T.speed[1]) * (1 + Math.min(wave, 10) * 0.025) * (night && type !== 'weeper' ? 1.15 : 1), hp, maxHp: hp, dmg: Math.round(T.dmg * (night ? 1.3 : 1)), score: T.score, atkT: 0, atkCd: T.atk,
    keep: type === 'spitter' ? 5.5 : 0,
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
let TERRACE_SEGS = [];
function computeTerraceSegs() {
  const out = []; let x = BOUNDS.x0;
  for (const b of [...BUILDINGS].sort((a, c) => a.x0 - c.x0)) { if (b.x0 - x > 2.4) out.push([x + 0.6, b.x0 - 0.6]); x = Math.max(x, b.x1); }
  if (BOUNDS.x1 - x > 2.4) out.push([x + 0.6, BOUNDS.x1 - 0.6]);
  TERRACE_SEGS = out.length ? out : [[BOUNDS.x0 + 1, BOUNDS.x1 - 1]];
}
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
  if (playerAlive()) TG.push({ x: player.x, z: player.z, me: true, b: curBuilding, bile: player.bile > 0, det: player.mod.detect });
  if (net.active) netTargetsInto(TG);
  if (!net.active || net.host) for (const b of bots) if (b.state === 'ok') TG.push({ x: b.x, z: b.z, me: false, bot: 'b' + b.ci, b: buildingAt(b.x, b.z), det: 1 });
}
function spawnRef() { return TG.length ? TG[Math.floor(Math.random() * TG.length)] : player; }
function spawnZombie(stray = false) {
  const player = spawnRef();
  const type = stray ? 'walker' : pickType();
  const roll = stray ? 1 : Math.random();
  const nearPond = !!POND && Math.abs(player.x - POND.cx) < 18;
  const nearCem = world.graves.length > 0 && player.x > 36;
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
  if (z.state === 'pin') releasePin(z, 0);
  if (z.type === 'bloater' && !z.burst) {
    z.burst = true;
    bileBlast(z.x, z.z);
    if (net.active && net.host) netEvent('bx', Math.round(z.x * 10), Math.round(z.z * 10));
    bileHorde(z.x, z.z);
  }
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
  toSpawn = Math.min(Math.round((6 + wave * 3) * Math.pow(NIGHT_LEN / 120, 0.8) * (Q.called ? 1.6 : 1)), 110);
  nightTotal = toSpawn; nightKills = 0; nightCleared = false;
  spawnTimer = 2.5; intermission = 0;
  atmos.hour = Math.max(atmos.hour, 19.6);
  hourFrom = atmos.hour;
  atmos.setWeather(rollNightWeather());
  showMsg(`ĐÊM ${wave}`, atmos.weatherName + ' · zombie mạnh hơn và có zombie đặc biệt!');
  sound.wave();
  if (Math.random() < Math.min(0.75, 0.35 + wave * 0.1)) spawnWeeper();
  hud.dirty = true;
}
function startDawn() {
  phase = 'dawn'; phaseT = 0; hourFrom = atmos.hour;
  if (Q.called && !Q.heli) setTimeout(() => { if (state.mode === 'play') heliArrive(); }, 3500);
  showMsg('TRỜI SÁNG', `Đã sống sót đêm ${wave}`);
  score += wave * 100; hud.dirty = true;
  gainXP(40, true);
  dawnBots();
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
const LURK_KIND = { kiosk: 1, garage: 1, house: 1, grocery: 2, pharmacy: 1, workshop: 1, police: 3, guardroom: 1, classroom: 2, infirmary: 1, canteen: 2, club: 1, mall: 4, plantshop: 1, library: 2, storage: 1, lab: 1, teachers: 1 };
function spawnLurkers() {
  for (const b of world.buildings) {
    if (b.alley) continue;
    for (let i = 0; i < (LURK_KIND[b.kind] || 0); i++) {
      for (let k = 0; k < 16; k++) {
        const x = rand(b.x0 + 0.7, b.x1 - 0.7), z = rand(ZB + 0.9, WALL_Z - 0.9);
        if (insideSolid(x, z, 0.45) || Math.abs(x - b.door) < 0.8) continue;
        newZombie(b.id !== 'police' && Math.random() < 0.25 ? 'runner' : 'walker', x, 0, z, 'walk', { aggro: false, variant: b.id === 'police' ? 'cop' : ZONE.interior ? 'student' : null });
        break;
      }
    }
  }
  if (ZONE.checkpoint) for (let i = 0; i < 2; i++) newZombie('walker', rand(19.5, 26), 0, rand(-1.0, 1.6), 'walk', { aggro: false, variant: 'soldier' });
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
      strayT = rand(14, 22);
      if (zombies.filter((z) => z.state !== 'dead' && !z.aggro).length < 2 + Math.min(3, dayNo)) spawnStray();
    }
    if (phaseT >= DAY_LEN) startDusk();
  } else if (phase === 'dusk') {
    const k = Math.min(1, phaseT / DUSK_LEN);
    atmos.hour = hourFrom + (19.6 - hourFrom) * k;
    if (k >= 1) nextWave();
  }
}
let msgTimer = 0;
// thông báo giữa màn hình: ngắn gọn, phụ đề tối đa một dòng
function showMsg(title, sub) {
  let t = sub || '';
  if (t.length > 64) t = t.slice(0, t.lastIndexOf(' ', 62)) + '…';
  $('msg-title').textContent = title; $('msg-sub').textContent = t;
  const el = $('msg'); el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  msgTimer = 2.6;
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
  zoneSeq: 0, zoneSeqSeen: -1, zoneEntry: 'start', grants: [], grantSeen: new Set(), pickedDrops: new Set(),
};
const SKINS = ['walker', 'runner', 'brute', 'cop', 'soldier', 'bloater', 'spitter', 'pouncer', 'charger', 'weeper', 'student'];
const ZST = ['walk', 'terrace', 'edge', 'drop', 'stairtop', 'stairs', 'wade', 'rise', 'dead', 'crouch', 'leap', 'pin', 'charge', 'stun'];
const PH = ['day', 'dusk', 'night', 'dawn', 'shot', 'title'];
const WX = ['clear', 'rain', 'storm', 'fog', 'blood'];
function netEvent(...ev) { net.out.push({ t: performance.now(), ev: [++net.seq, ...ev] }); }
function setCoopNote(t) { $('lobby-note').textContent = t; }
function updateCoopBtn() {
  const b = $('coop-btn');
  b.querySelector('b').textContent = net.pending ? 'CHƠI CÙNG BẠN BÈ…' : 'CHƠI CÙNG BẠN BÈ';
  b.querySelector('small').textContent = net.pending ? 'Đang kết nối máy chủ online…' : net.transport || net.fbLazy ? 'Co-op 2–4 người · thiếu người thì bot' : 'Chưa kết nối được máy chủ online';
  b.classList.toggle('dim', !net.pending && !net.transport && !net.fbLazy);
}
// web riêng: nối Firebase lúc mở phần co-op, ngắt khi đóng (nếu không ở trong phòng)
function fbConnect() {
  if (net.transport && net.transport.kind === 'firebase') { net.transport.wake(); return; }
  if (!net.fbLazy || net.pending) return;
  net.pending = true; updateCoopBtn();
  openFirebase().then((t) => {
    net.pending = false;
    if (t) { net.transport = t; t.onError = (m) => setCoopNote(m); watchLobby(); }
    updateCoopBtn();
    if (!$('lobby').classList.contains('hidden')) openLobby();
  });
}
function fbSleep() { if (net.transport && net.transport.kind === 'firebase' && !net.room) net.transport.sleep(); }
function openLobby() {
  fbConnect();
  $('title').classList.add('hidden');
  $('lobby').classList.remove('hidden');
  $('nick').value = net.name || store.get('deadnight_nick', '') || ('Người sống sót ' + (10 + Math.floor(Math.random() * 89)));
  showLobbyPane(net.room ? 'room' : 'main');
  if (net.pending) setCoopNote('Đang kết nối kênh co-op…');
  else if (!net.transport) setCoopNote(transportError || 'Chưa kết nối được máy chủ online. Kiểm tra mạng rồi tải lại trang.');
  else setCoopNote('Tạo phòng rồi gửi MÃ PHÒNG cho bạn bè, hoặc bấm vào phòng đang mở bên dưới.');
  renderOpenGames();
}
function closeLobby() { $('lobby').classList.add('hidden'); if (state.mode === 'title') $('title').classList.remove('hidden'); fbSleep(); }
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
    net.ready = false;
    await room.presence({ v: 1, n: net.name, j: net.joinT, c: myChar, r: 0, p: null, e: [], w: null });
    net.unsub = room.onPeers(() => { refreshHost(); renderRoom(); });
    $('room-code').textContent = code;
    showLobbyPane('room');
    setCoopNote(creating ? 'Gửi mã phòng cho bạn bè. Khi mọi người đã SẴN SÀNG, bấm BẮT ĐẦU.' : 'Chọn nhân vật rồi bấm SẴN SÀNG.');
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
  if ($('lobby').classList.contains('hidden')) fbSleep();
}
function roomMembers() {
  if (!net.room) return [];
  const list = [];
  for (const p of net.room.peers()) {
    const pz = p.presence || {};
    if (p.sameTab) { if (net.me !== p.peer) net.me = p.peer; list.push({ peer: p.peer, me: true, n: net.name, j: net.joinT, c: myChar, r: !!net.ready }); continue; }
    if (pz.v !== 1 || typeof pz.j !== 'number') continue;
    list.push({ peer: p.peer, me: false, n: cleanName(String(pz.n || '')), j: pz.j, c: clamp(pz.c | 0, 0, CHARS.length - 1), r: !!pz.r, pz });
  }
  list.sort((a, b) => a.j - b.j || (a.peer < b.peer ? -1 : 1));
  return list.slice(0, 5);
}
function refreshHost() {
  const m = roomMembers();
  if (!m.length) return;
  const newHost = m[0].peer;
  // đang chơi: chỉ đổi chủ phòng khi chủ cũ vắng mặt liên tục 4 giây (mạng chập chờn thì giữ nguyên)
  if (net.active && net.hostPeer && newHost !== net.hostPeer) {
    const now = performance.now();
    if (net.hostCand !== newHost) { net.hostCand = newHost; net.hostCandT = now; return; }
    if (now - net.hostCandT < 4000) return;
  }
  net.hostCand = null;
  const wasHost = net.host;
  net.hostPeer = newHost;
  net.host = m[0].me;
  net.colorIdx = Math.max(0, m.findIndex((x) => x.me));
  if (net.active && net.host && !wasHost) becomeHost();
  // không còn là chủ phòng: bỏ bot thật, chỉ hiện bot theo ảnh chụp của chủ mới
  if (net.active && wasHost && !net.host) { for (const b of bots) scene.remove(b.sp.group); bots = []; }
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
  // mỗi người một nhân vật: người vào sau phải chọn nhân vật khác
  const taken = new Map();
  for (const x of m) if (!x.me && !taken.has(x.c)) taken.set(x.c, x.n);
  if (taken.has(myChar)) {
    const free = CHARS.findIndex((c, i) => !taken.has(i));
    if (free >= 0) { pickChar(free); return; }
  }
  // chỉ vẽ lại khi danh sách thay đổi (vẽ lại liên tục làm khó bấm chọn nhân vật)
  const sig = JSON.stringify([myChar, bench, net.ready, net.host, m.map((x) => [x.peer, x.n, x.c, x.r])]);
  const same = sig === net.roomSig;
  net.roomSig = sig;
  if (!same) el.innerHTML = '';
  if (!same) m.forEach((x, i) => {
    const d = document.createElement('div');
    const ci = x.me ? myChar : x.c;
    d.style.color = CHARS[ci].color;
    d.textContent = `${i === 0 ? '★ ' : '• '}${x.n}${x.me ? ' (bạn)' : ''} · ${CHARS[ci].name}${i === 0 ? ' — chủ phòng' : ''}`;
    if (i > 0) { const st = document.createElement('span'); st.className = x.r ? 'rdy' : 'wait'; st.textContent = x.r ? '  ✓ sẵn sàng' : '  … đang chọn'; d.appendChild(st); }
    el.appendChild(d);
  });
  const humans = new Set([myChar, ...taken.keys()]);
  const bots = teamIdx().filter((i) => !humans.has(i)).slice(0, Math.max(0, TEAM_N - humans.size)).map((i) => CHARS[i].name);
  if (!same) { const d = document.createElement('div'); d.style.color = 'var(--ink-dim)'; d.textContent = `Đội tối đa ${TEAM_N} người` + (bots.length ? ' · bot: ' + bots.join(', ') : ''); el.appendChild(d); }
  if (!same) renderCharPick($('char-pick'), taken);
  // chủ phòng chỉ bắt đầu được khi mọi người đã chọn nhân vật và bấm SẴN SÀNG
  const waiting = m.filter((x, i) => i > 0 && !x.r).length;
  const go = $('go-btn');
  go.classList.toggle('hidden', !net.host || net.started);
  go.disabled = waiting > 0;
  go.textContent = waiting > 0 ? `CHỜ ${waiting} NGƯỜI SẴN SÀNG` : 'BẮT ĐẦU';
  const rb = $('ready-btn');
  rb.classList.toggle('hidden', net.host || net.started);
  rb.classList.toggle('on', !!net.ready);
  rb.textContent = net.ready ? '✓ ĐÃ SẴN SÀNG' : 'SẴN SÀNG';
  // khách vào phòng khi trận đã chạy: chọn nhân vật, bấm SẴN SÀNG rồi vào luôn
  if (!net.host && !net.started && net.ready) {
    const h = m.find((x) => x.peer === net.hostPeer);
    if (h && h.pz && h.pz.w && h.pz.w.st === 'play') startCoop(false);
  }
}
function startCoop(asHost) {
  if (!net.room || net.started) return;
  net.started = true; net.active = true;
  $('lobby').classList.add('hidden');
  // khách vào muộn: nếu dịch đã bùng phát ở máy chủ phòng thì vào thẳng trạng thái đó
  const hm = roomMembers().find((x) => x.peer === net.hostPeer);
  const ob = !asHost && !!(hm && hm.pz && hm.pz.w && hm.pz.w.ob);
  startGame({ ob });
  setPlayerSkin(net.colorIdx);
  if (!ob) setTimeout(playIntro, 400);
  if (!asHost) {
    for (const z of zombies) releaseSprite(z);
    zombies = []; net.zmap.clear();
    placeAtEntry('start');
  }
  advertise(roomMembers().length);
  showMsg(asHost ? 'CO-OP' : 'ĐÃ VÀO PHÒNG ' + net.code, 'Lục soát cùng nhau · gọi trực thăng cứu hộ');
}
function clientRestart() {
  startGame();
  for (const z of zombies) releaseSprite(z);
  zombies = []; net.zmap.clear();
  placeAtEntry('start');
  showMsg('CHƠI LẠI', 'Chủ phòng đã bắt đầu ván mới');
}
let skinIdx = 0;
function setPlayerSkin(i) { skinIdx = i; }
// chủ phòng cũ rời đi: dựng lại zombie đầy đủ từ ảnh chụp cuối cùng
function becomeHost() {
  // giữ nguyên mã ván cũ: máy khác không bị "chơi lại", đồ nhiệm vụ và hoa vẫn ở chỗ cũ
  if (net.gameSeen) net.gameId = net.gameSeen;
  // bot: dựng bot thật từ bản sao đang thấy (giữ vị trí, máu, vũ khí, trạng thái)
  const views = [...botViews.values()].map((v) => ({ ci: v.ci, x: v.tx ?? v.x, z: v.tz ?? v.z, hp: v.hp, flags: v.flags | 0, weapon: v.weapon | 0 }));
  clearBots();
  const SPR_MELEE = { 0: 'knife', 6: 'club', 7: 'spear' };
  views.forEach((v, k) => {
    const b = newBot(v.ci, k);
    b.x = v.x; b.z = v.z;
    if (v.hp > 0) b.hp = Math.min(b.maxHp, v.hp);
    if (v.weapon === 4) b.weapon = 4; else if (SPR_MELEE[v.weapon]) b.melee = SPR_MELEE[v.weapon];
    if (v.flags & 8) b.state = 'out'; else if (v.flags & 4) { b.state = 'down'; b.hp = 0; b.downT = 30; }
    bots.push(b);
  });
  for (const z of zombies) {
    if (z.state === 'dead') continue;
    z.x = z.tx ?? z.x; z.z = z.tz ?? z.z;
    if (z.state !== 'walk' && z.state !== 'dead') { z.state = 'walk'; z.y = 0; }
  }
  showMsg('BẠN LÀ CHỦ PHÒNG', 'Chủ phòng cũ đã rời đi');
}
function netTargetsInto(list) {
  for (const rp of net.players.values()) if (rp.alive && rp.here) list.push({ x: rp.x, z: rp.z, me: false, peer: rp.peer, b: buildingAt(rp.x, rp.z), bile: !!(rp.flags & 256) });
}
function netTick(dt) {
  if (!net.active || !net.room) return;
  if (net.hostCand) refreshHost();
  // nhận
  const seen = new Set();
  for (const p of net.room.peers()) {
    if (p.sameTab) { net.me = p.peer; continue; }
    const pz = p.presence || {};
    if (pz.v !== 1) continue;
    seen.add(p.peer);
    let rp = net.players.get(p.peer);
    if (!rp) { rp = { peer: p.peer, x: 0, z: 0, tx: 0, tz: 0, aim: 0, weapon: 1, flags: 0, hp: 100, lastSeq: 0, walk: 0, fireT: 0, inited: false, char: 0 }; net.players.set(p.peer, rp); }
    rp.name = cleanName(String(pz.n || '')); rp.j = pz.j; rp.char = clamp(pz.c | 0, 0, CHARS.length - 1);
    const a = pz.p;
    if (Array.isArray(a) && a.length >= 6) {
      rp.tx = clamp(+a[0] / 100 || 0, BOUNDS.x0 - 2, BOUNDS.x1 + 2); rp.tz = clamp(+a[1] / 100 || 0, BOUNDS.z0 - 2, BOUNDS.z1 + 2);
      rp.aim = +a[2] / 100 || 0; rp.weapon = clamp(a[3] | 0, 0, 7); rp.flags = a[4] | 0; rp.hp = a[5] | 0; rp.inf = a[6] | 0;
      rp.exit = EXITS[a[7] | 0] || null; rp.zone = a[8] === undefined ? -1 : a[8] | 0; rp.light = a[9] | 0;
      if (!rp.inited) { rp.x = rp.tx; rp.z = rp.tz; rp.inited = true; }
    }
    rp.here = rp.zone === zoneIdx();
    rp.alive = rp.inited && rp.here && !(rp.flags & (4 | 8 | 16 | 128));
    if (Array.isArray(pz.e)) handleEvents(rp, pz.e);
    if (!net.host && p.peer === net.hostPeer && pz.w && pz.w.t !== net.lastW) { net.lastW = pz.w.t; applySnapshot(pz.w); }
  }
  for (const [k, rp] of net.players) if (!seen.has(k)) { if (rp.sp) scene.remove(rp.sp.group); if (rp.zsp) scene.remove(rp.zsp.group); net.players.delete(k); refreshHost(); }
  updateRemote(dt);
  // gửi
  net.sendT -= dt;
  if (net.sendT > 0) return;
  net.sendT = net.transport && net.transport.kind === 'firebase' ? 1 / 8 : 1 / 12;   // Firebase: tiết kiệm dung lượng
  for (const [id, h] of net.hits) netEvent('h', id, Math.round(h.dmg), Math.round(h.a * 100));
  net.hits.clear();
  const now = performance.now();
  // giữ sự kiện tới khi đã gửi đủ vài lần (presence chỉ giữ giá trị mới nhất, có thể bị gộp)
  net.out = net.out.filter((e) => now - e.t < 700 || (e.sent || 0) < 4).slice(-24);
  for (const e of net.out) e.sent = (e.sent || 0) + 1;
  const flags = (player.moving ? 1 : 0) | (player.firing ? 2 : 0) | (player.downed > 0 ? 4 : 0) | (player.dead ? 8 : 0) | (player.boarded ? 16 : 0) | (player.searching ? 32 : 0) | (player.infected > 0 ? 64 : 0) | (player.zombie ? 128 : 0) | (player.bile > 0 ? 256 : 0);
  const patch = { v: 1, n: net.name, j: net.joinT, c: myChar, p: [Math.round(player.x * 100), Math.round(player.z * 100), Math.round(player.aim * 100), sprIdx(), flags, Math.max(0, Math.round(player.hp)), Math.ceil(player.infected), EXITS.indexOf(player.exit), zoneIdx(), lightState()], e: net.out.map((e) => e.ev) };
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
    else if (type === 'gv' && ev[2] === net.me) receiveGift(String(ev[3]), rp, clamp((+ev[4] || 100) / 100, 1, 3));
    else if (type === 'bx') bileBlast((+ev[2] || 0) / 10, (+ev[3] || 0) / 10);
    else if (type === 'fp' && !net.host) firePool((+ev[2] || 0) / 10, (+ev[3] || 0) / 10, false);
    else if (type === 'mol' && net.host) firePool((+ev[2] || 0) / 10, (+ev[3] || 0) / 10, true);
    else if (type === 'ac' && !net.host) spitAcid((+ev[2] || 0) / 10, (+ev[3] || 0) / 10, (+ev[4] || 0) / 10, (+ev[5] || 0) / 10, false);
    else if (type === 'pin' && ev[2] === net.me) setPinned(ev[3] | 0);
    else if (type === 'unpin' && ev[2] === net.me && player.pinned === (ev[3] | 0)) player.pinned = 0;
    else if (type === 'chg' && ev[2] === net.me) knockPlayer((+ev[3] || 0) / 100, (+ev[4] || 0) / 100, clamp(ev[5] | 0, 0, 80));
    else if (type === 'shv' && net.host) shoveAt((+ev[2] || 0) / 10, (+ev[3] || 0) / 10);
    else if (type === 'btask' && net.host) botTask(String(ev[2]), String(ev[3]));
    else if (type === 'gate' && net.host) gateAct(String(ev[2]), rp.name);
    else if (type === 'cam' && rp.here) { camReveal = clamp(+ev[2] || 25, 5, 90); camLootOn = !!ev[3]; showMsg('CAMERA AN NINH', `${rp.name} đã hack camera · thấy mọi zombie`); }
    else if (type === 'rbot' && net.host) reviveBot(ev[2] | 0, false);
    else if (type === 'gbot' && net.host) giveToBot('b' + (ev[2] | 0), String(ev[3]), clamp((+ev[4] || 100) / 100, 1, 3));
    else if (type === 'ups' && net.host) { const z = zombies.find((o) => o.id === (ev[2] | 0)); if (z && z.state === 'pin') releasePin(z, 2.4, true); }
    else if (type === 'dr' && net.host) hostAddDrop(String(ev[2]), clamp(ev[3] | 0, 1, 99), (+ev[4] || 0) / 10, (+ev[5] || 0) / 10, rp.zone);
    else if (type === 'pk' && net.host) hostPickDrop(ev[2] | 0, rp.peer);
    else if (type === 'cskip' && !net.host) { net.cskip = { id: String(ev[2]), at: performance.now() }; if (cinema.active && cinema.id === net.cskip.id) cinema.skip(); }
    else if (type === 'cadv' && !net.host) cinema.syncTo(String(ev[2]), ev[3] | 0, (+ev[4] || 0) / 100);
    else if (type === 'ob' && !net.host) { if (calmNow() && !outbreakQueued && state.mode === 'play') { outbreakQueued = true; startOutbreak(); } }
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
    pw: power ? 1 : 0, ar: Q.armory ? 1 : 0, g: net.gameId, dl: [DAY_LEN, NIGHT_LEN], z,
    zn: [ZONE_IDS.indexOf(zt.target || ZONE.id), ENTRIES.indexOf(net.zoneEntry || 'start'), net.zoneSeq || 0],
    dp: drops.filter((d) => d.id > 0).slice(-24).map((d) => [d.id, ITEM_KEYS.indexOf(d.it), d.n, Math.round(d.x * 10), Math.round(d.z * 10)]),
    gr: net.grants.slice(-6),
    bt: bots.map((b) => [b.ci, Math.round(b.x * 10), Math.round(b.z * 10), Math.round(b.aim * 100), botSpr(b), (b.moving ? 1 : 0) | (b.firing ? 2 : 0) | (b.state === 'down' || b.pinnedBy ? 4 : 0) | (b.state === 'out' ? 8 : 0), Math.round(b.hp)]),
    gt: GATE_CODES.indexOf((gateStates[ZONE.id] || { s: 'closed' }).s),
    ob: story.seen.has('outbreak') ? 1 : 0, gc: Q.gateCut ? 1 : 0, cn: settings.cine ? 1 : 0,
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
    else if (ph === 'dawn') { showMsg('TRỜI SÁNG', `Đã sống sót đêm ${w.wv}`); gainXP(40, true); }
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
  if (q[2] && !Q.called) { Q.called = true; showMsg('ĐÃ GỌI CỨU HỘ', 'Trực thăng tới lúc bình minh!'); sound.radio(); playStory('call'); }
  if (!q[2] && Q.called && !q[3]) Q.called = false;
  if (w.pw && !power) powerOn(false);
  if (w.ar && !Q.armory) unlockArmory(false);
  // cả đội chuyển khu theo chủ phòng
  if (Array.isArray(w.zn)) {
    const zid = ZONE_IDS[w.zn[0] | 0];
    if (zid && zid !== ZONE.id && zid !== zt.target) requestZone(zid, ENTRIES[w.zn[1] | 0] || 'start');
  }
  if (Array.isArray(w.dp) && !zt.busy) syncDrops(w.dp);
  if (Array.isArray(w.bt) && !zt.busy) syncBotViews(w.bt);
  if (w.gt !== undefined && !zt.busy && world.pois.gate) gateVisual(GATE_CODES[w.gt | 0] || 'closed');
  if (w.cn !== undefined) net.hostCine = w.cn !== 0;
  if (w.ob && calmNow() && !outbreakQueued && !cinema.active && !zt.busy) coopLateOutbreak();
  if (w.gc && !Q.gateCut) { Q.gateCut = true; openMainGate(true); }
  if (Array.isArray(w.gr)) for (const g of w.gr) if (Array.isArray(g) && g[0] === net.me && !net.grantSeen.has(g[3])) { net.grantSeen.add(g[3]); const it = ITEM_KEYS[g[1] | 0]; if (it) giveItems([[it, g[2] | 0]], true); }
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
      z = newZombie(ZT[skin] ? skin : 'walker', a[i + 1] / 10, a[i + 3] / 10, a[i + 2] / 10, st, { variant: skin === 'cop' || skin === 'soldier' ? skin : null });
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
    if (z.skin === 'weeper' && !z.aggro) { z.cryT = (z.cryT || rand(0, 2)) - dt; if (z.cryT <= 0) { z.cryT = rand(2.5, 4.5); if (Math.abs(z.x - player.x) < 20) floaters.push({ x: z.x, y: 2.0, z: z.z, text: 'hu… hu…', t: 1.6, color: '#c8d0e8' }); } }
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
      if (d < z.r + player.r + 0.3 && z.atkT <= 0) { z.atkT = z.atkCd; modelSwing(z.sprite, 0.35); hurtPlayer(z, d); if (state.mode !== 'play') return; }
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
    if (!rp.sp || rp.spChar !== rp.char) {
      if (rp.sp) scene.remove(rp.sp.group);
      rp.spChar = rp.char; rp.color = rp.char;
      rp.sp = makeSprite(charSet(rp.char), CHARS[rp.char].color);
      rp.sp.group.scale.setScalar(CHARS[rp.char].scale || 1);
    }
    const k = Math.min(1, dt * 10), ox = rp.x, oz = rp.z;
    rp.x += (rp.tx - rp.x) * k; rp.z += (rp.tz - rp.z) * k;
    rp.walk += Math.hypot(rp.x - ox, rp.z - oz) * 1.6;
    const sp = rp.sp;
    rp.pingT = Math.max(0, (rp.pingT || 0) - dt);
    const zf = !!(rp.flags & 128);
    if (zf && !rp.zsp) { const list = SPR.zombies.walker; rp.zsp = makeSprite([list[(rp.char || 0) % list.length]], CHARS[rp.char || 0].color); }
    if (rp.zsp) {
      rp.zsp.group.visible = zf;
      if (zf) { setFrame(rp.zsp, dirFromAngle(rp.aim), rp.flags & 1 ? Math.floor(rp.walk) % 4 : 0); rp.zsp.group.position.set(rp.x, 0, rp.z); }
    }
    sp.group.visible = !(rp.flags & (8 | 16)) && !zf && rp.here;
    if (rp.zsp) rp.zsp.group.visible = zf && rp.here;
    sp.mat.color.setRGB(rp.flags & 64 ? 0.78 : 1, 1, rp.flags & 64 ? 0.75 : 1);
    setSpriteMap(sp, rp.weapon);
    const down = rp.flags & 4;
    sp.mesh.rotation.x = down ? -Math.PI / 2 : 0;
    setFrame(sp, rp.flags & 32 ? 'up' : dirFromAngle(rp.aim), rp.flags & 1 ? Math.floor(rp.walk) % 4 : 0, rp.flags & 32 ? undefined : rp.aim);
    sp.group.position.set(rp.x, down ? 0.05 : 0, rp.z);
    rp.fireT -= dt;
    if (rp.flags & 2 && !down && rp.fireT <= 0) {
      const w = WEAPONS[rp.weapon > 4 ? 0 : rp.weapon];
      rp.fireT = w.melee ? 0.5 : w.rate;
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
  if (player.mod.dodge && Math.random() < player.mod.dodge) { player.inv = 0.3; floaters.push({ x: player.x, y: 2.3, z: player.z, text: 'NÉ!', t: 0.8, color: '#f2c14e' }); return; }
  let dmg = z.dmg;
  if (player.armor > 0) { const ab = Math.min(player.armor, dmg * 0.5); player.armor -= ab; dmg -= ab; if (player.armor <= 0) { player.armor = 0; lootFeed('armor', 'Áo giáp đã rách nát', true); } }
  player.hp -= dmg; player.inv = 0.35; hurtFlash = 0.5;
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
  if (!net.active) {
    // chơi đơn: còn bạn (bot) đứng được thì gục chờ được cứu, không thì thua
    if (player.downed > 0) return;
    if (!bots.some((b) => b.state === 'ok')) { gameOver(); return; }
    player.hp = 0; player.downed = 30; player.action = null; player.searching = false; player.pinned = 0;
    showMsg('BẠN ĐÃ GỤC', 'Đồng đội đang tới cứu · còn 30 giây');
    hud.dirty = true; return;
  }
  if (player.downed > 0 || player.dead || player.zombie) return;
  player.hp = 0; player.downed = 35; player.action = null; player.searching = false;
  showMsg('BẠN ĐÃ GỤC', 'Chờ đồng đội tới cứu · còn 35 giây');
  hud.dirty = true;
}
function revived(rp) { player.downed = 0; player.hp = 40; player.inv = 1.5; showMsg('ĐƯỢC CỨU!', (rp.name || 'Đồng đội') + ' đã kéo bạn dậy'); hud.dirty = true; }
function respawn() {
  player.dead = false; player.downed = 0; player.hp = 60; player.food = Math.max(player.food, 50); player.water = Math.max(player.water, 50);
  placeAtEntry('start'); player.sprite.group.visible = true; player.sprite.mesh.rotation.x = 0;
  showMsg('HỒI SINH', 'Bạn tỉnh dậy ở ' + ZONE.name); hud.dirty = true;
}
// chủ phòng: cả đội gục hết thì thua
function hostCheckWipe() {
  if (!net.active || !net.host || state.mode !== 'play') return;
  let anyAlive = playerAlive() || player.boarded;
  for (const rp of net.players.values()) if (rp.alive || rp.flags & 16) anyAlive = true;
  if (!anyAlive) gameOver('CẢ ĐỘI ĐÃ GỤC NGÃ');
}

// ================= NHIỄM VIRUS · HOÁ ZOMBIE · HOA BỈ NGẠN =================
// bị cắn có thể nhiễm virus: 10 phút để chế & tiêm thuốc giải (Kháng sinh + Ống tiêm),
// không kịp thì hoá zombie ở một chỗ bất kỳ; đồng đội tìm hoa bỉ ngạn cho ăn để hồi sinh.
const INFECT_TIME = 600;   // 10 phút từ lúc bị cắn tới lúc hoá zombie
// tỉ lệ một đòn trúng là vết cắn lây virus: cào/cắn thì có, húc/đấm/nổ thì không
const BITE_CHANCE = { walker: 0.25, runner: 0.3, brute: 0.1, bloater: 0, spitter: 0.05, pouncer: 0.55, charger: 0, weeper: 0.6 };
function infectPlayer(z) {
  if (player.zombie || player.boarded || state.mode !== 'play') return;
  let p = BITE_CHANCE[z.type] ?? 0.25;
  if (player.armor > 0) p *= 0.5;   // áo giáp đệm chặn bớt vết cắn
  if (Math.random() >= p * player.mod.bite) return;
  // đang nhiễm mà bị cắn tiếp: virus lan nhanh hơn (bớt 15 giây), không bao giờ làm tăng thời gian còn lại
  if (player.infected > 0) {
    player.infected = Math.max(Math.min(player.infected, 10), player.infected - 15);
    floaters.push({ x: player.x, y: 2.4, z: player.z, text: 'VIRUS LAN NHANH HƠN', t: 1.2, color: '#9ae07a' });
    hud.dirty = true; return;
  }
  player.infected = player.infMax = player.mod.infectTime;
  showMsg('BỊ CẮN — NHIỄM VIRUS!', `Còn ${Math.round(player.infMax / 60)} phút trước khi hoá zombie · xem hướng dẫn chữa bên phải`);
  player.recipes.add('antidote');   // ai bị nhiễm cũng biết cách chế thuốc giải, không cần sách
  sound.infect();
  hud.dirty = true;
}
// bảng hướng dẫn chữa: còn bao lâu, đã có gì, tìm ở đâu, bấm gì
function updateCureGuide(inf) {
  const box = $('cure-box');
  box.classList.toggle('hidden', !inf || player.zombie);
  if (!inf) { box._sig = ''; return; }
  setText('cb-time', `${Math.floor(inf / 60)}:${String(inf % 60).padStart(2, '0')}`);
  box.classList.toggle('low', inf < 90);
  const has = (k) => (player.bag[k] || 0) > 0, key = isTouch ? 'nút bên dưới' : 'phím ' + KN('cure');
  const ready = has('antidote') || (has('antibio') && has('syringe'));
  const sig = [has('antidote'), has('antibio'), has('syringe'), net.active, isTouch].join();
  if (sig !== box._sig) {
    box._sig = sig;
    const row = (ok, name, where) => `<div class="${ok ? 'ok' : 'no'}">${ok ? '✓' : '✗'} ${name}${ok ? '' : ` <small>· ${where}</small>`}</div>`;
    $('cb-list').innerHTML = has('antidote')
      ? `<div class="ok">✓ Đã có Thuốc giải · tiêm ngay: ${key}</div>`
      : 'Cách chữa: chế Thuốc giải từ'
        + row(has('antibio'), 'Kháng sinh', 'phòng y tế, nhà thuốc, xe cứu thương, ba lô')
        + row(has('syringe'), 'Ống tiêm', 'phòng y tế, phòng thí nghiệm, xe cứu thương')
        + `<div><small>${has('antibio') && has('syringe') ? 'Đủ rồi · ' + key + ' để chế và tiêm' : 'Đủ 2 thứ thì ' + key + ' để chế và tiêm'}${net.active ? ' · hoặc nhờ bạn có thuốc giải tiêm giúp' : ''}</small></div>`;
    $('cb-go').classList.toggle('hidden', !ready);
  }
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
function craftAntidote() { craft('antidote'); }
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
  if (on && !zlook) { const list = SPR.zombies.walker; zlook = makeSprite([list[player.char % list.length]], CHARS[player.char].color); }
  if (zlook) zlook.group.visible = on;
  player.sprite.group.visible = !on;
}
function updateZombieForm(dt) {
  const [mx, mz, mag] = readMove();
  const spd = 2.6 * mag;
  player.x += mx * spd * dt; player.z += mz * spd * dt * (FP.on ? 1 : 0.8);
  collide(player);
  player.moving = mag > 0.1;
  if (FP.on) { fpAim(dt, stickVec(sticks.aim)); if (player.moving) player.walk += dt * spd * 1.8; }
  else if (player.moving) { player.walk += dt * spd * 1.8; player.aim = Math.atan2(mz, mx); }
  setFrame(zlook, dirFromAngle(player.aim), player.moving ? Math.floor(player.walk) % 4 : 0, player.aim);
  zlook.group.position.set(player.x, 0, player.z);
  player.firing = false; player.searching = false; interact.target = null;
  player.groanT = Math.max(0, player.groanT - dt);
  if ((held('use') || keys.Space || interact.touchHold || sticks.aim) && player.groanT <= 0) {
    player.groanT = 4;
    sound.groan(player.x, player.z, false);
    netEvent('gr', 0);
    floaters.push({ x: player.x, y: 2.4, z: player.z, text: 'GRỪ…', t: 1.2, color: '#b8e08a' });
  }
  const tu = $('t-use');
  tu.textContent = 'GẦM'; tu.classList.toggle('off', player.groanT > 0);
}
// hoa bỉ ngạn mọc rải rác (vị trí giống nhau với cả đội, đổi mỗi ngày); mỗi người tự hái phần mình
let flowers = [], flowerDay = -1, flowerZone = '', flowerSpr = null;
function clearFlowers() {
  for (const f of flowers) { scene.remove(f.mesh); f.e.base = 0; const i = world.emitters.indexOf(f.e); if (i >= 0) world.emitters.splice(i, 1); }
  flowers = [];
}
function spawnFlowers(day) {
  if (!flowerSpr) flowerSpr = makeFlowerSprite();
  const seed = (net.host ? net.gameId : net.gameSeen) || 7;
  const r = makeRng(Math.abs(seed % 1e6) * 31 + day * 977 + (ZONE.seed % 1000) * 13);
  const spots = (ZONE.flowers || []).map(([x, z]) => [x, z > 2 ? Math.min(z + 2.3, STREET_FRONT - 0.6) : z]).filter(([x, z]) => !insideSolid(x, z, 0.25));
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
    const id = 'f' + ZONE.id + day + '_' + i;
    if (player.picked.has(id)) { mesh.visible = false; e.base = 0; }
    flowers.push({ id, x, z, mesh, glow, e });
  }
}
function updateFlowers(dt) {
  const want = net.active && state.mode === 'play' ? dayNo : -1;
  if (want !== flowerDay || flowerZone !== ZONE.id) { clearFlowers(); flowerDay = want; flowerZone = ZONE.id; if (want >= 0) spawnFlowers(want); }
  for (const f of flowers) {
    if (!f.mesh.visible) continue;
    f.mesh.position.y = 0.02 + Math.sin(gtime * 2 + f.x) * 0.04;
    f.glow.material.opacity = 0.6 + 0.4 * Math.sin(gtime * 3 + f.z);
    if (Math.random() < dt * 3) fx.spark.spawn(f.x + rand(-0.3, 0.3), rand(0.4, 1.1), f.z + rand(-0.2, 0.2), rand(-0.2, 0.2), rand(0.3, 0.8), rand(-0.1, 0.1), 0.9, 0.05, '#ff6a7a', { grav: -0.3, drag: 1, mode: 1 });
  }
}
// mỗi sáng một phần chỗ đã lục có đồ mới (đủ nguyên liệu cho ván dài)
function restock() { for (const id of [...player.looted]) if (Math.random() < 0.35) player.looted.delete(id); }

const Q = { found: false, parts: 0, called: false, heli: null, evac: false, won: false, armory: false };
function questReset() { Object.assign(Q, { found: false, parts: 0, called: false, heli: null, evac: false, won: false, armory: false, gateCut: false }); power = false; if (heli) heli.group.visible = false; hud.dirty = true; }
function questDone(it) {
  if (it === 'fuel') return power || player.bag.fuel > 0;
  if (it === 'part') return Q.parts + (player.bag.part || 0) >= 2;
  if (it === 'key') return Q.armory || player.bag.key > 0;
  if (it === 'cutters') return !!Q.gateCut || player.bag.cutters > 0;
  if (ITEMS[it] && ITEMS[it].book) return (player.bag[it] || 0) > 0;
  return false;
}
// ---------- đồ nhiệm vụ: mỗi ván nằm ở một chỗ khác (cả phòng co-op giống nhau, theo mã ván) ----------
const QSPOTS = {
  cutters: [
    { z: 'sf3', k: ['tool_shelf', 'toolbox'], bk: 'storage', t: 'Kho dụng cụ · tầng 3' },
    { z: 'sf1', k: ['guard_desk', 'locker'], bk: 'guardroom', t: 'Phòng bảo vệ · tầng 1' },
    { z: 'sf3', k: ['storage_club', 'sports_rack'], bk: 'club', t: 'CLB bắn cung · tầng 3' },
    { z: 'sf2', k: ['lab_shelf'], bk: 'lab', t: 'Phòng thí nghiệm · tầng 2' },
    { z: 'sf1', k: ['cabinet', 'teacher_desk'], bk: 'teachers', t: 'Phòng giáo viên · tầng 1' },
  ],
  fuel: [
    { z: 'downtown', k: ['fuel', 'toolbox'], bk: 'garage', t: 'Gara sửa xe · Trung tâm' },
    { z: 'market', k: ['fuel', 'toolbox'], bk: 'garage', t: 'Gara sửa xe · Phố chợ' },
    { z: 'downtown', k: ['register', 'shelf_food', 'drinks'], b: 'kiosk', t: 'Cửa hàng xăng dầu · Trung tâm' },
    { z: 'residential', k: ['trunk'], t: 'Cốp xe ngoài phố · Khu dân cư' },
    { z: 'market', k: ['trunk'], t: 'Cốp xe, xe giao hàng · Phố chợ' },
  ],
  part: [
    { z: 'downtown', k: ['radio_desk', 'parts_shelf', 'backpack'], b: 'radio', t: 'Nhà ông Tư · Trung tâm' },
    { z: 'downtown', k: ['truck', 'ammo_crate'], t: 'Xe quân sự, chốt kiểm soát · Trung tâm' },
    { z: 'downtown', k: ['locker', 'desk'], b: 'police', t: 'Tủ đồ, bàn làm việc trong đồn · Trung tâm' },
    { z: 'market', k: ['mall_guard', 'register'], bk: 'mall', t: 'Trung tâm thương mại · Phố chợ' },
  ],
  key: [
    { z: 'downtown', k: ['chief_desk'], b: 'police', t: 'Bàn trưởng đồn' },
    { z: 'downtown', k: ['locker'], b: 'police', t: 'Tủ đồ cảnh sát trong đồn' },
    { z: 'downtown', k: ['desk', 'register'], b: 'police', t: 'Bàn làm việc, quầy tiếp dân trong đồn' },
    { z: 'downtown', k: ['trunk'], lb: 'cảnh sát', t: 'Cốp xe cảnh sát trước đồn' },
  ],
};
function spotMatch(sp, c) {
  if (!sp.k.includes(c.kind) || (sp.b && c.b !== sp.b)) return false;
  if (sp.bk) { const b = BUILDINGS.find((o) => o.id === c.b); if (!b || b.kind !== sp.bk) return false; }
  return !sp.lb || (c.label || '').toLowerCase().includes(sp.lb);
}
let QP = { seed: null };
function questPlan() {
  const seed = (net.active && !net.host ? net.gameSeen : net.gameId) || 7;
  if (QP.seed === seed) return QP;
  const r = makeRng(Math.abs(seed % 1e6) * 17 + 4241), pick = (n) => Math.floor(r() * n);
  QP = { seed };
  for (const it of ['cutters', 'fuel', 'key']) QP[it] = [pick(QSPOTS[it].length)];
  const a = pick(QSPOTS.part.length); let b = pick(QSPOTS.part.length - 1); if (b >= a) b++;
  QP.part = [a, b];
  return QP;
}
// đồ nhiệm vụ nằm trong chỗ c (nếu ván này nó được đặt đúng ở đây)
function questLoot(c) {
  const P = questPlan(), out = [];
  for (const it in QSPOTS) for (const i of P[it]) {
    const sp = QSPOTS[it][i];
    if (sp.z !== ZONE.id || !spotMatch(sp, c) || questDone(it)) continue;
    const list = world.containers.filter((o) => spotMatch(sp, o));
    const k = Math.floor(makeRng(Math.abs(P.seed % 1e6) * 7 + i * 131 + it.length * 977)() * list.length);
    if (list[k] === c) out.push([it, 1]);
  }
  return out;
}
// đánh dấu chỗ đã lục hết (để gợi ý nhiệm vụ gạch bớt)
function questCheck(c) {
  for (const it in QSPOTS) QSPOTS[it].forEach((sp, i) => {
    if (sp.z !== ZONE.id || !spotMatch(sp, c)) return;
    if (world.containers.filter((o) => spotMatch(sp, o)).every((o) => player.looted.has(o.id))) player.qChecked.add(it + i);
  });
  hud.dirty = true;
}
// danh sách chỗ có thể có đồ (✗ = đã lục hết)
function spotLines(it) {
  return QSPOTS[it].map((sp, i) => (player.qChecked.has(it + i) ? '✗ ' + sp.t + ' (đã lục)' : '• ' + sp.t));
}
const spotHint = (it) => 'Có thể ở:\n' + spotLines(it).join('\n');
function questDescribe(key) {
  if (key === 'radio') {
    if (!Q.found) return { label: 'Kiểm tra bộ đàm', can: true, time: 0.7 };
    if (player.bag.part > 0 && Q.parts < 2) return { label: 'Lắp linh kiện vào bộ đàm', can: true, time: 1.6 };
    if (!power) return { label: 'Bộ đàm: chưa có điện', can: false };
    if (Q.parts < 2) return { label: `Bộ đàm: thiếu linh kiện (${Q.parts}/2)`, can: false };
    if (!Q.called) return { label: 'GỌI TRỰC THĂNG CỨU HỘ', can: true, time: 2.0 };
    return { label: 'Đã gọi cứu hộ · chờ bình minh', can: false };
  }
  if (key === 'cctv') return describeCam();
  if (key === 'gate') return describeGate();
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
  gainXP(25, true);
  hud.dirty = true;
}
function powerOn(msg = true) {
  if (power) return;
  power = true;
  sound.generator(true);
  applyPowerVisual();
  if (msg) showMsg('CÓ ĐIỆN', 'Máy phát đã chạy · đồn cảnh sát sáng đèn');
}
// máy phát chỉ có ở Trung tâm: dựng lại hiệu ứng khi quay lại khu đó
function applyPowerVisual() {
  const g = world.pois.generator;
  if (!g || !power || g.e.base === 4) return;
  g.e.base = 4;
  world.smokeSources.push({ x: g.exhaust.x, y: g.exhaust.y, z: g.exhaust.z, rate: 2.5 });
}
// predicted: khách đoán trước kết quả, chủ phòng xác nhận qua ảnh chụp
function questApply(act, n, rp, predicted = false) {
  if (act === 'found' && !Q.found) { Q.found = true; showMsg('BỘ ĐÀM HỎNG', 'Cần xăng cho máy phát & 2 linh kiện để gọi cứu hộ'); sound.radio(); }
  else if (act === 'part') {
    Q.parts = Math.min(2, Q.parts + clamp(n, 0, 2)); sound.unlock();
    lootFeed('part', `Đã lắp linh kiện (${Q.parts}/2)`);
    if (Q.parts >= 2 && power) showMsg('BỘ ĐÀM ĐÃ SẴN SÀNG', 'Gọi trực thăng cứu hộ ngay!');
  } else if (act === 'call' && power && Q.parts >= 2 && !Q.called) {
    Q.called = true; sound.radio(); setTimeout(() => playStory('call'), 600);
    showMsg('ĐÃ GỌI CỨU HỘ', 'Trực thăng tới lúc bình minh · tín hiệu đang kéo zombie tới!');
    if (!predicted && world.pois.radio) makeNoise(world.pois.radio.x, world.pois.radio.z, 40);
  } else if (act === 'gen' && !power) {
    powerOn();
    if (!predicted && world.pois.generator) makeNoise(world.pois.generator.x, world.pois.generator.z, 16);
  } else if (act === 'armory') unlockArmory();
  else if (act === 'gatecut' && !Q.gateCut) { Q.gateCut = true; openMainGate(true); }
  hud.dirty = true;
}
function questText() {
  if (Q.won) return ['ĐÃ ĐƯỢC GIẢI CỨU', ''];
  if (player.zombie) return ['BẠN ĐANG LÀ ZOMBIE', 'Chờ đồng đội cho ăn hoa bỉ ngạn · ' + (isTouch ? 'GẦM' : 'E') + ': gầm gọi họ'];
  if (net.active) { const zf = [...net.players.values()].find((r) => r.flags & 128); if (zf) return [`CỨU ${zf.name.toUpperCase()}!`, player.bag.flower > 0 ? 'Mang hoa bỉ ngạn tới cho bạn ăn' : 'Tìm HOA BỈ NGẠN (đỏ, phát sáng) rồi cho bạn ăn']; }
  if (player.infected > 0) return ['NHIỄM VIRUS · CHẾ THUỐC GIẢI', 'Kháng sinh + Ống tiêm · xem bảng hướng dẫn chữa bên dưới'];
  const toDT = routeHint('downtown');
  if (Q.heli && Q.heli.stage === 'wait') return ['LÊN TRỰC THĂNG Ở BÃI ĐÁP!', `Còn ${Math.ceil(Q.heli.left)} giây · ` + (toDT || 'bãi đáp cuối phố →')];
  if (Q.heli) return ['Trực thăng đang tới…', toDT || 'Chạy về bãi đáp cuối phố →'];
  if (Q.called) return ['Cầm cự tới bình minh', 'Trực thăng cứu hộ sẽ tới lúc 6:00' + (toDT ? ' · ' + toDT : '')];
  const armed = player.melee !== 'fist' || player.guns.some((g, i) => i > 0 && g.owned);
  if (isFloor(ZONE.id)) {
    const hint = !player.books.has('basic') ? 'Lục bàn giáo viên tìm sách chế đồ' : !armed ? 'Chế vũ khí: 2 thanh gỗ = gậy gỗ' : '';
    if (calmNow()) return ['Đến lớp 11A', ZONE.id === 'sf2' ? 'Tiết Sinh học sắp bắt đầu · lớp 11A ở phía đông hành lang' : ZONE.id === 'sf1' ? 'Lên tầng 2: cầu thang cuối hành lang →' : 'Xuống tầng 2'];
    if (!Q.gateCut && !(player.bag.cutters > 0)) return ['Tìm KỀM CẮT', spotHint('cutters') + (hint ? '\n' + hint : '')];
    if (!Q.gateCut) return ['Cắt khoá cổng chính', ZONE.id === 'sf1' ? 'Cổng ở cuối hành lang phía tây ←' : 'Xuống tầng 1'];
    return ['Ra khỏi trường', ZONE.id === 'sf1' ? 'Đi qua cổng chính ←' : 'Xuống tầng 1, ra cổng chính'];
  }
  if (!Q.found) return ['Tìm bộ đàm ở ĐỒN CẢNH SÁT', toDT ? 'Ở Trung tâm thành phố · ' + toDT : 'Đồn cảnh sát ở cuối phố phía đông →'];
  if (power && Q.parts >= 2) return ['Dùng bộ đàm GỌI CỨU HỘ', toDT || 'Bàn bộ đàm trong đồn cảnh sát'];
  const a = power ? '✓ Máy phát đã có điện' : (player.bag.fuel ? '• Đổ xăng vào máy phát cạnh đồn' : '• Tìm CAN XĂNG · ' + spotHint('fuel').replace(/\n/g, '\n   '));
  const needP = Q.parts + (player.bag.part || 0) < 2;
  const b = `• Linh kiện bộ đàm ${Q.parts}/2` + (player.bag.part ? ` (đang mang ${player.bag.part})` : '') + (needP ? ' · ' + spotHint('part').replace(/\n/g, '\n   ') : ' · mang về bộ đàm trong đồn');
  return ['Sửa bộ đàm để gọi cứu hộ', a + '\n' + b];
}
function questListHtml() {
  const it = (done, cur, text) => `<div class="${done ? 'done' : cur ? 'cur' : ''}">${done ? '✓' : '•'} ${text}</div>`;
  const ready = power && Q.parts >= 2;
  const book = player.books.has('basic'), armed = player.melee !== 'fist' || player.guns.some((g, i) => i > 0 && g.owned);
  const out = !isFloor(ZONE.id) || Q.gateCut;
  const spots = (k, need) => need ? '<div class="qspots">' + spotLines(k).map((l) => `<span class="${l[0] === '✗' ? 'no' : ''}">${l}</span>`).join('') + '</div>' : '';
  return '<b style="color:var(--gold);font-weight:400">NHIỆM VỤ</b>'
    + it(!calmNow(), calmNow(), 'Đến lớp 11A (tầng 2) học tiết Sinh')
    + it(book, !calmNow() && !book, 'Lục bàn giáo viên để tìm sách chế đồ')
    + it(armed, book && !armed, 'Chế vũ khí đầu tiên ở bàn chế đồ')
    + it(!!Q.gateCut || player.bag.cutters > 0, !calmNow() && !Q.gateCut && !(player.bag.cutters > 0), 'Tìm kềm cắt (mỗi ván một chỗ khác)') + spots('cutters', !Q.gateCut && !(player.bag.cutters > 0))
    + it(!!Q.gateCut, player.bag.cutters > 0 && !Q.gateCut, 'Cắt khoá cổng chính ở tầng 1, ra khỏi trường')
    + (out ? '' : '<div style="margin:4px 0;color:var(--ink-dim)">— Sau khi ra khỏi trường —</div>')
    + it(Q.found, !Q.found, 'Tìm bộ đàm ở đồn cảnh sát (Trung tâm thành phố)')
    + it(power, Q.found && !power, 'Tìm can xăng → đổ vào máy phát cạnh đồn') + spots('fuel', !power && !(player.bag.fuel > 0))
    + it(Q.parts >= 2, Q.found && Q.parts < 2, `Linh kiện bộ đàm ${Q.parts}/2 (cần 2)`) + spots('part', Q.parts + (player.bag.part || 0) < 2)
    + it(Q.called, ready && !Q.called, 'Gọi trực thăng cứu hộ')
    + it(!!Q.heli, Q.called && !Q.heli, 'Cầm cự tới bình minh')
    + it(Q.won, !!Q.heli, 'Lên trực thăng ở bãi đáp')
    + '<div style="margin-top:6px;color:var(--ink-dim)">Không có súng thật: súng, đạn và mìn đều phải <b>tự chế</b> (ống thép, thuốc pháo, bi sắt, đinh)<br>Kho vật chứng trong đồn cần chìa khoá</div>' + (Q.armory || player.bag.key > 0 ? '' : '<div class="qspots"><b style="font-weight:400">Chìa khoá kho vật chứng có thể ở:</b>' + spotLines('key').map((l) => `<span class="${l[0] === '✗' ? 'no' : ''}">${l}</span>`).join('') + '</div>');
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
  Q.heli = { stage: 'in', t: 0, left: ZONE.id === 'downtown' ? 75 : 110 };
  heli.group.visible = !!HELIPAD;
  showMsg('TRỰC THĂNG ĐÃ TỚI', HELIPAD ? 'Chạy tới BÃI ĐÁP cuối phố!' : 'Bãi đáp ở Trung tâm · ' + routeHint('downtown'));
  sound.heli(true);
}
function updateHeli(dt) {
  if (!Q.heli || !heli) return;
  const h = Q.heli, g = heli.group;
  h.t += dt;
  heli.rotor.rotation.y += dt * 26; heli.tail.rotation.z += dt * 30;
  heli.beacon.visible = Math.floor(gtime * 2.5) % 2 === 0;
  heli.lamp.intensity = 30 * (0.4 + 0.6 * (1 - Math.min(1, atmos.hour > 5 && atmos.hour < 18 ? 0.6 : 0)));
  const HP = HELIPAD || ZONES.downtown.helipad, hx = HP.x, hz = HP.z;
  g.visible = !!HELIPAD && h.stage !== 'gone';
  if (h.stage === 'in') {
    const k = Math.min(1, h.t / 9), e = 1 - Math.pow(1 - k, 3);
    g.position.set(hx + 34 * (1 - e), 0.15 + 16 * Math.pow(1 - e, 1.4), hz - 1.2 * (1 - e));
    g.rotation.z = 0.12 * (1 - e); g.rotation.y = Math.PI;
    if (k >= 1) h.stage = 'wait';
  } else if (h.stage === 'wait') {
    h.left -= dt;
    g.position.set(hx, 0.15 + Math.sin(gtime * 6) * 0.02, hz);
    if (HELIPAD && playerAlive() && Math.hypot(player.x - hx, player.z - hz) < HP.r + 0.3) {
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
  if (!net.active) deleteSave();
  const show = () => setTimeout(() => $('win').classList.remove('hidden'), 400);
  if (settings.cine && !story.seen.has('ending')) { story.seen.add('ending'); markSeen('ending'); sound.init(); cinema.play('ending').then(show); }
  else show();
}

// ================= LỤC SOÁT, TÚI ĐỒ =================
const interact = { target: null, t: 0, touchHold: false, atkHold: false };
let bagOpen = false;
const ICON = {}, iconCanvas = {};
const CORPSE_NAMES = { z_student: 'Lục xác học sinh', z_walker: 'Lục xác zombie', z_runner: 'Lục xác zombie', z_brute: 'Lục xác zombie to xác', z_cop: 'Lục xác cảnh sát', z_soldier: 'Lục xác lính' };
const lc = (t) => t.charAt(0).toLowerCase() + t.slice(1);
function interactTargets() {
  const out = [];
  for (const c of world.containers) { const d = Math.hypot(c.x - player.x, c.z - player.z); if (d < 1.3) out.push({ type: 'c', id: c.id, c, d, x: c.x, z: c.z }); }
  for (const z of zombies) if (z.state === 'dead' && z.t > 0.4 && z.t < CORPSE_LIFE - 2) { const d = Math.hypot(z.x - player.x, z.z - player.z); if (d < 1.3) out.push({ type: 'z', id: 'z' + z.id, zo: z, d, x: z.x, z: z.z }); }
  for (const dr of drops) { const d = Math.hypot(dr.x - player.x, dr.z - player.z); if (d < 1.2) out.push({ type: 'd', id: 'd' + dr.id, dr, d: d - 0.05, x: dr.x, z: dr.z }); }
  if (net.active) for (const rp of net.players.values()) {
    const d = Math.hypot(rp.x - player.x, rp.z - player.z);
    if (d > 1.5 || !rp.inited || !rp.here) continue;
    if (rp.flags & 128) out.push({ type: 'zf', id: 'zf' + rp.peer, rp, d, x: rp.x, z: rp.z });
    else if (rp.flags & 4 && !(rp.flags & 8)) out.push({ type: 'r', id: 'r' + rp.peer, rp, d, x: rp.x, z: rp.z });
    else if (rp.flags & 64 && player.bag.antidote > 0) out.push({ type: 'cu', id: 'cu' + rp.peer, rp, d: d + 0.3, x: rp.x, z: rp.z });
  }
  for (const b of allBots()) if (b.state === 'down') { const d = Math.hypot(b.x - player.x, b.z - player.z); if (d < 1.5) out.push({ type: 'rb', id: 'rb' + b.ci, bt: b, d, x: b.x, z: b.z }); }
  for (const f of flowers) if (f.mesh.visible) { const d = Math.hypot(f.x - player.x, f.z - player.z); if (d < 1.2) out.push({ type: 'f', id: f.id, f, d, x: f.x, z: f.z }); }
  for (const k in world.pois) {
    const p = world.pois[k];
    if (k === 'helipad' || (k === 'armory' && p.open) || (k === 'gate' && p.state === 'open') || k.startsWith('stair_') || (k === 'mainGate' && p.state === 'open')) continue;
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
    return { label: 'Lục ' + lc(c.label), can: true, time: searchTime(c.kind) * player.mod.search };
  }
  if (tg.type === 'z') {
    if (tg.zo.looted) return { label: 'Xác đã lục', can: false, done: true };
    return { label: CORPSE_NAMES[tg.zo.lootKind] || 'Lục xác', can: true, time: searchTime('corpse') };
  }
  if (tg.type === 'rb') return { label: 'Cứu ' + botName(tg.bt.ci), can: true, time: 3.0 * player.mod.reviveTime };
  if (tg.type === 'd') return { label: `Nhặt ${ITEMS[tg.dr.it].name}${tg.dr.n > 1 ? ' ×' + tg.dr.n : ''}`, can: true, time: 0.35 };
  if (tg.type === 'r') return { label: 'Cứu ' + tg.rp.name, can: true, time: 3.0 * player.mod.reviveTime };
  if (tg.type === 'zf') return player.bag.flower > 0 ? { label: `Cho ${tg.rp.name} ăn hoa bỉ ngạn`, can: true, time: 2.0 } : { label: `${tg.rp.name} đã hoá zombie · cần hoa bỉ ngạn`, can: false };
  if (tg.type === 'cu') return { label: `Tiêm thuốc giải cho ${tg.rp.name}`, can: true, time: 1.5 };
  if (tg.type === 'f') return player.bag.flower >= ITEMS.flower.max ? { label: 'Hoa bỉ ngạn · túi đã đầy', can: false } : { label: 'Hái hoa bỉ ngạn', can: true, time: 0.9 };
  if (tg.key === 'armory') return player.bag.key > 0 ? { label: 'Mở kho vật chứng bằng chìa khoá', can: true, time: 1.2 } : { label: 'Kho vật chứng bị khoá · cần chìa khoá', can: false };
  if (tg.key === 'mainGate') return describeMainGate();
  return questDescribe(tg.key);
}
function updateInteract(dt) {
  const list = state.mode === 'play' && !player.action ? interactTargets() : [];
  let best = null, bestS = 1e9;
  for (const tg of list) {
    let sc = tg.d;
    if (FP.on) { const da = Math.abs(angDiff(Math.atan2(tg.z - player.z, tg.x - player.x), FP.yaw)); if (tg.d > 0.5 && da > 1.5) continue; sc += da * 0.8; }
    tg.info = describe(tg); sc += tg.info.can ? 0 : 1.1; if (sc < bestS) { bestS = sc; best = tg; }
  }
  if (best && best.info.done && best.d > 0.95) best = null;
  if (!best || !interact.target || best.id !== interact.target.id) interact.t = 0;
  interact.target = best;
  const holding = (held('use') || interact.touchHold) && !bagOpen;
  player.searching = !!(best && best.info.can && holding);
  if (player.searching) {
    interact.t += dt;
    if (Math.random() < dt * 9) fx.lit.spawn(best.x + rand(-0.3, 0.3), rand(0.4, 1.2), best.z + rand(-0.2, 0.2), rand(-0.6, 0.6), rand(0.4, 1.2), rand(-0.3, 0.3), 0.6, 0.06, '#c8b898', { grav: 3, drag: 2 });
    sound.rustle(dt);
    if (interact.t >= best.info.time) { interact.t = 0; player.searching = false; doInteract(best); }
  } else interact.t = Math.max(0, interact.t - dt * 3);
  $('t-use').classList.toggle('off', !(best && best.info.can));
  $('t-shove').classList.toggle('off', !player.mod.shove);
  $('t-throw').classList.toggle('off', !(player.bag.molotov > 0));
  const atkL = WEAPONS[player.weapon].melee ? 'ĐÁNH' : 'BẮN';
  if ($('t-atk').textContent !== atkL) $('t-atk').textContent = atkL;
}
function doInteract(tg) {
  if (tg.type === 'c') {
    const c = tg.c;
    player.looted.add(c.id);
    giveItems([...questLoot(c), ...rollLoot(c.kind, Math.random, questDone)]);
    questCheck(c);
    gainXP(2, false);
  } else if (tg.type === 'z') {
    tg.zo.looted = true;
    tg.zo.sprite.mat.color.setScalar(0.62);
    giveItems(rollLoot(tg.zo.lootKind));
  } else if (tg.type === 'd') { if (drops.includes(tg.dr)) pickDrop(tg.dr); }
  else if (tg.type === 'r') { netEvent('rv', tg.rp.peer); gainXP(15, true); }
  else if (tg.type === 'rb') { if (net.active && !net.host) { netEvent('rbot', tg.bt.ci); gainXP(10, true); } else reviveBot(tg.bt.ci, true); }
  else if (tg.type === 'zf') { if (player.bag.flower > 0) { player.bag.flower--; netEvent('fl', tg.rp.peer); lootFeed('flower', `Đã cho ${tg.rp.name} ăn hoa`); } }
  else if (tg.type === 'cu') { if (player.bag.antidote > 0) { player.bag.antidote--; netEvent('cure', tg.rp.peer); lootFeed('antidote', `Đã tiêm thuốc giải cho ${tg.rp.name}`); } }
  else if (tg.type === 'f') { player.picked.add(tg.f.id); tg.f.mesh.visible = false; tg.f.e.base = 0; addItem('flower', 1); lootFeed('flower', '+1 Hoa bỉ ngạn'); sound.flower(); }
  else if (tg.key === 'armory') { unlockArmory(); if (net.active && !net.host) netEvent('q', 'armory', 0); }
  else if (tg.key === 'cctv') doCam();
  else if (tg.key === 'mainGate') cutGate();
  else if (tg.key === 'gate') doGate();
  else questInteract(tg.key);
  hud.dirty = true; renderBagIfOpen();
}
function giveItems(list, picked = false) {
  if (!picked) player.lootCount++;
  if (!list.length) { lootFeed(null, 'Không có gì…', true); sound.empty(); return; }
  for (const [it, n] of list) {
    const def = ITEMS[it];
    if (def.book && player.bag[it] > 0) continue;
    const got = addItem(it, n);
    lootFeed(it, got > 0 ? `+${def.weapon !== undefined || def.book ? '' : got + ' '}${def.name}` : `${def.name}: túi đầy`, got <= 0);
    if (got > 0 && def.book) learnBook(def.book);
    if (got > 0 && def.melee && MELEE_ORDER.indexOf(def.melee) < MELEE_ORDER.indexOf(player.melee)) equipMelee(def.melee, true);
  }
  sound.pickup();
}
// đọc sách: học hết công thức trong sách
function learnBook(book) {
  if (player.books.has(book)) return;
  player.books.add(book);
  const list = RECIPES.filter((R) => R.book === book);
  for (const R of list) player.recipes.add(R.id);
  showMsg('ĐÃ ĐỌC: ' + BOOKS[book].name.toUpperCase(), `Học ${list.length} công thức · ` + (isTouch ? 'bấm Chế đồ' : 'phím ' + KN('craft')) + ' để chế đồ');
  gainXP(10, true); hud.dirty = true;
}
const capOf = (it) => (ITEMS[it].quest || ITEMS[it].book ? ITEMS[it].max : Math.round(ITEMS[it].max * ((player && player.mod && player.mod.carry) || 1) * (player && player.pack ? 1.35 : 1)));
function addItem(it, n) {
  const def = ITEMS[it];
  if (def.weapon !== undefined) {
    const g = player.guns[def.weapon], w = WEAPONS[def.weapon];
    if (!g.owned) {
      g.owned = true; g.ammo = Math.ceil(w.mag / 2);
      if (w.bow) addItem('arrow', 5);
      showMsg('VŨ KHÍ MỚI', `${w.name} — bấm ${def.weapon + 1}${isTouch ? ' hoặc ⇄' : ''}`);
      switchWeapon(def.weapon);
      return 1;
    }
    return addItem(w.ammo, Math.ceil(w.mag / 4)) > 0 ? 1 : 0;
  }
  const before = player.bag[it] || 0;
  player.bag[it] = Math.min(capOf(it), before + n);
  return player.bag[it] - before;
}
const ACTION_TEXT = { bandage: 'Băng bó vết thương…', medkit: 'Sơ cứu…', food: 'Đang ăn…', water: 'Đang uống…', craft: 'Đang chế…', antidote: 'Tiêm thuốc giải…', torch: 'Châm đuốc…', armor: 'Mặc áo giáp…', pack: 'Đeo ba lô…' };
function useItem(it) {
  const def = ITEMS[it];
  if (!def.use || player.action || !(player.bag[it] > 0) || state.mode !== 'play') return false;
  if (def.use === 'heal' && player.hp >= player.maxHp) { lootFeed(it, 'Máu đang đầy', true); return false; }
  if (def.use === 'eat' && player.food > 96) { lootFeed(it, 'Chưa đói', true); return false; }
  if (def.use === 'drink' && player.water > 96) { lootFeed(it, 'Chưa khát', true); return false; }
  if (def.use === 'cure' && !(player.infected > 0)) { lootFeed(it, 'Chưa nhiễm virus', true); return false; }
  if (def.use === 'torch' && player.torchT > 20) { lootFeed(it, 'Đuốc vẫn đang cháy', true); return false; }
  if (def.use === 'armor' && player.armor >= ARMOR_PTS * 0.8) { lootFeed(it, 'Áo giáp đang mặc vẫn còn tốt', true); return false; }
  if (def.use === 'pack' && player.pack) { lootFeed(it, 'Đã đeo ba lô rồi', true); return false; }
  player.action = { item: it, t: 0, dur: def.time };
  player.reloading = 0;
  sound.use(def.use);
  return true;
}
function finishAction() {
  const act = player.action, it = act.item, def = ITEMS[it];
  player.action = null;
  if (it === 'craft') { const R = RECIPES.find((r) => r.id === (act.recipe || 'antidote')); if (R) finishCraft(R); return; }
  if (!(player.bag[it] > 0)) return;
  player.bag[it]--;
  if (act.target) {
    if (act.bot) { giveToBot(act.target, it, player.mod.healMul); if (def.melee && !(player.bag[it] > 0) && player.melee === it) equipMelee(bestMelee(), true); }
    else netEvent('gv', act.target, it, Math.round(player.mod.healMul * 100));
    lootFeed(it, `Đã dùng ${def.name.toLowerCase()} cho ${act.targetName}`);
    gainXP(3, true);
    sound.pickup(); hud.dirty = true; renderBagIfOpen();
    return;
  }
  if (def.use === 'armor') { player.armor = ARMOR_PTS; lootFeed(it, 'Đã mặc áo giáp đệm · đỡ một nửa sát thương'); sound.use('heal'); hud.dirty = true; renderBagIfOpen(); return; }
  if (def.use === 'pack') { player.pack = true; lootFeed(it, 'Đã đeo ba lô · mang được nhiều đồ hơn'); sound.use('heal'); hud.dirty = true; renderBagIfOpen(); return; }
  if (def.use === 'torch') { player.torchT = TORCH_TIME; lootFeed(it, 'Đã châm đuốc · cháy khoảng ' + Math.round(TORCH_TIME / 60 * 10) / 10 + ' phút'); sound.use('heal'); hud.dirty = true; renderBagIfOpen(); return; }
  if (def.use === 'cure') { cureInfection(); renderBagIfOpen(); return; }
  applyItemEffect(it, player.mod.healMul);
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
  while (feed.children.length > 3) feed.firstChild.remove();
  setTimeout(() => el.remove(), 2800);
}
function buildIcons() {
  const cv = makeItemIcons();
  for (const it in ITEMS) {
    const c = document.createElement('canvas'); c.width = c.height = 16;
    c.getContext('2d').drawImage(cv, ITEMS[it].icon * 16, 0, 16, 16, 0, 0, 16, 16);
    ICON[it] = c.toDataURL(); iconCanvas[it] = c;
  }
}
const QUICK = [['bandage', 'F'], ['medkit', 'F'], ['food', 'C'], ['water', 'C'], ['antidote', 'V'], ['torch', 'T'], ['flashlight', 'L'], ['molotov', 'X'], ['mine', 'Y']];
// icon pixel 12×12 cho thanh công cụ
const UI_PIX = {
  more: { pal: { '#': '#140e0a', 1: '#f0ece0' }, rows: [
    '............', '............', '............', '............', '.###.###.###', '.#1#.#1#.#1#',
    '.###.###.###', '............', '............', '............', '............', '............'] },
  view: { pal: { '#': '#140e0a', 1: '#f0ece0', 2: '#4a8ac8', x: '#101018' }, rows: [
    '............', '............', '...######...', '..#111111#..', '.#11#22#11#.', '#11#2xx2#11#',
    '#11#2xx2#11#', '.#11#22#11#.', '..#111111#..', '...######...', '............', '............'] },
  bag: { pal: { '#': '#140e0a', 1: '#9a6a34', 2: '#5a3a1a', 3: '#74502a', 4: '#c8945a', 5: '#f2c14e' }, rows: [
    '....####....', '...#2..2#...', '..########..', '.#11111111#.', '.#14444441#.', '.#22222222#.',
    '.#11155111#.', '.#11155111#.', '.#11111111#.', '.#13333331#.', '.#11111111#.', '..########..'] },
  craft: { pal: { '#': '#140e0a', 1: '#c08040', 2: '#805028', 4: '#e0e4ec', 5: '#a8aeb8', 6: '#788090' }, rows: [
    '............', '.##########.', '.#44444444#.', '.#55555555#.', '.#66666666#.', '.####11####.',
    '....#11#....', '....#11#....', '....#11#....', '....#11#....', '....#22#....', '....####....'] },
  map: { pal: { '#': '#140e0a', 1: '#e8d8a8', 2: '#c8b480', r: '#d84a3a', x: '#ff3a2a' }, rows: [
    '............', '############', '#1112222111#', '#1r12222111#', '#1r1r222111#', '#11r2r22x1x#',
    '#1112r2r1x1#', '#11122r2x1x#', '#1112222111#', '#1112222111#', '############', '............'] },
  skill: { pal: { '#': '#140e0a', 4: '#fff0a0', 5: '#f2c14e' }, rows: [
    '.....##.....', '.....##.....', '....#55#....', '#####55#####', '#5555445555#', '.#55544555#.',
    '..#555555#..', '..#55##55#..', '.#55#..#55#.', '.#5#....#5#.', '.##......##.', '............'] },
  pause: { pal: { '#': '#140e0a', 1: '#f1e6cf' }, rows: [
    '............', '..###..###..', '..#1#..#1#..', '..#1#..#1#..', '..#1#..#1#..', '..#1#..#1#..',
    '..#1#..#1#..', '..#1#..#1#..', '..#1#..#1#..', '..#1#..#1#..', '..###..###..', '............'] },
};
function pixIcon({ pal, rows }) {
  const c = document.createElement('canvas');
  c.width = rows[0].length; c.height = rows.length;
  const g = c.getContext('2d');
  rows.forEach((r, y) => [...r].forEach((ch, x) => { if (pal[ch]) { g.fillStyle = pal[ch]; g.fillRect(x, y, 1, 1); } }));
  return c.toDataURL();
}
function buildToolbarIcons() {
  if (ICON.food) { $('fd-ic').src = ICON.food; $('wt-ic').src = ICON.water; $('ar-ic').src = ICON.armor; }
  for (const k of Object.keys(UI_PIX)) { const b = $('tb-' + k); if (b) b.querySelector('img').src = pixIcon(UI_PIX[k]); }
}
function buildQuickBar() {
  const q = $('quick');
  q.innerHTML = '';
  for (const [it, key] of QUICK) {
    const d = document.createElement('div');
    d.className = 'qi'; d.dataset.it = it; d.title = ITEMS[it].name;
    d.innerHTML = `<img alt="" src="${ICON[it]}"><b>0</b><i>${key}</i>`;
    const act = () => (it === 'antidote' ? quickAntidote() : it === 'flashlight' ? toggleFlashlight() : it === 'molotov' ? throwMolotov() : it === 'mine' ? placeMine() : useItem(it));
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
  if (bagOpen) { bagGiveFor = null; renderBag(); }
}
function renderBagIfOpen() { if (bagOpen) renderBag(); else bagGiveFor = null; }
let bagGiveFor = null; // món đang chọn người để đưa
function renderBag() {
  const grid = $('bag-grid');
  grid.innerHTML = '';
  const mates = nearMates();
  const top = document.createElement('div');
  top.className = 'bi craft';
  top.innerHTML = `<img alt="" src="${ICON.book_basic}"><span>Chế đồ · ${player.recipes.size}/${RECIPES.length} công thức<br><span class="n">Đặt nguyên liệu vào lưới 3×3 · đọc sách để biết công thức</span></span>`;
  const tb = document.createElement('button'); tb.textContent = 'MỞ BÀN CHẾ' + (isTouch ? '' : ` (${KN('craft')})`);
  tb.addEventListener('click', () => toggleCraft(true));
  top.appendChild(tb); grid.appendChild(top);
  let any = false;
  for (const it of ITEM_ORDER) {
    const n = player.bag[it] || 0;
    if (!n && (ITEMS[it].quest || ITEMS[it].hideZero || ITEMS[it].mat || ITEMS[it].melee || it === 'armor' || it === 'pack' || it === 'molotov' || it === 'arrow')) continue;
    if (!n && !['bandage', 'food', 'water'].includes(it)) continue;
    any = true;
    const d = document.createElement('div');
    d.className = 'bi' + (n ? '' : ' zero') + (ITEMS[it].melee && player.melee === it ? ' on' : '');
    const def = ITEMS[it];
    let extra = it === 'flashlight' && n ? ` · pin ${Math.ceil(player.battery / (BATTERY_TIME * player.mod.battery) * 100)}%` : '';
    if (def.melee) extra = ` · bền ${player.melee === it || player.durs[it] ? (player.durs[it] || MELEE[it].dur) : MELEE[it].dur}/${MELEE[it].dur}`;
    d.innerHTML = `<img alt="" src="${ICON[it]}"><span>${def.name}<br><span class="n">×${n}${extra}</span></span>`;
    let acts = null;
    const btn = (label, fn, cls) => {
      if (!acts) { acts = document.createElement('div'); acts.className = 'acts'; d.appendChild(acts); }
      const b2 = document.createElement('button'); b2.textContent = label; if (cls) b2.className = cls; b2.addEventListener('click', fn); acts.appendChild(b2);
    };
    if (n && def.book) btn('Đọc', () => openBook(def.book));
    if (n && def.melee && player.melee !== it) btn('Cầm', () => { equipMelee(it); if (player.weapon !== 0) switchWeapon(0); renderBagIfOpen(); });
    if (n && def.use) btn(def.use === 'armor' ? 'Mặc' : def.use === 'pack' ? 'Đeo' : 'Dùng', () => { if (bagOpen && !net.active) toggleBag(false); useItem(it); renderBagIfOpen(); });
    if (n && def.throw) btn('Ném', () => { if (bagOpen) toggleBag(false); throwMolotov(); });
    if (n && def.place) btn('Đặt', () => { if (bagOpen) toggleBag(false); placeMine(); });
    if (n && it === 'flashlight') btn(player.flashOn ? 'Tắt' : 'Bật', () => { toggleFlashlight(); renderBagIfOpen(); });
    const giveFn = (rp) => () => { bagGiveFor = null; if (bagOpen && !net.active) toggleBag(false); giveTo(it, rp); renderBagIfOpen(); };
    // vũ khí cận chiến / cung: đưa được cho bot đứng gần
    const gm = def.give ? mates : (def.melee || it === 'bow') ? mates.filter((m) => m.bot) : [];
    if (n && gm.length === 1) btn('Cho ' + gm[0].name, giveFn(gm[0]), 'give');
    else if (n && gm.length > 1) {
      if (bagGiveFor === it) { for (const rp of gm) btn(rp.name, giveFn(rp), 'give'); btn('✕', () => { bagGiveFor = null; renderBagIfOpen(); }); }
      else btn('Cho…', () => { bagGiveFor = it; renderBagIfOpen(); }, 'give');
    }
    if (n && !def.book) btn('Vứt', () => { dropItem(it); if (def.melee && !(player.bag[it] > 0) && player.melee === it) equipMelee(bestMelee(), true); }, 'drop');
    grid.appendChild(d);
  }
  if (!any) { const e = document.createElement('div'); e.className = 'bi zero'; e.textContent = 'Túi trống · lục lọi các phòng học để tìm đồ'; grid.appendChild(e); }
  WEAPONS.forEach((w, i) => {
    if (!player.guns[i].owned || w.melee) return;
    const d = document.createElement('div'); d.className = 'bi';
    const ic = i === 1 ? ICON.pistol : i === 2 ? ICON.shotgun : i === 4 ? ICON.bow : ICON.smg;
    d.innerHTML = `<img alt="" src="${ic}"><span>${w.name}<br><span class="n">${player.guns[i].ammo}/${w.mag} · dự trữ ${player.bag[w.ammo] || 0}</span></span>`;
    grid.appendChild(d);
  });
  if (player.armor > 0 || player.pack) {
    const d = document.createElement('div'); d.className = 'bi';
    d.innerHTML = `<img alt="" src="${ICON.armor}"><span>Đang mặc<br><span class="n">${player.armor > 0 ? 'Giáp ' + Math.ceil(player.armor) + '/' + ARMOR_PTS : 'Không giáp'}${player.pack ? ' · ba lô +35%' : ''}</span></span>`;
    grid.appendChild(d);
  }
  $('bag-quest').innerHTML = questListHtml();
}
function unlockArmory(feed = true) {
  const first = !Q.armory;
  Q.armory = true;
  const a = world.pois.armory;
  if (a && !a.open) {
    a.open = true; a.door.rotation.y = -1.75;
    const j = world.colliders.boxes.indexOf(a.box); if (j >= 0) world.colliders.boxes.splice(j, 1);
    navBuild();
  }
  if (feed && first) { sound.unlock(); lootFeed('key', 'Đã mở kho vũ khí!'); }
}
function resetWorldState() {
  const g = world.pois.generator;
  if (g) { g.e.base = 0; world.smokeSources = world.smokeSources.filter((s0) => !(s0.x === g.exhaust.x && s0.z === g.exhaust.z)); }
  const a = world.pois.armory;
  if (a) { a.open = false; a.door.rotation.y = 0; if (!world.colliders.boxes.includes(a.box)) world.colliders.boxes.push(a.box); }
  power = false;
  if (NAV.block) navBuild();
}




// ================= BOT ĐỒNG ĐỘI =================
// Nhân vật không ai chọn sẽ là bot do chủ phòng (hoặc máy chơi luyện tập) điều khiển:
// đi theo người chơi gần nhất, đánh zombie, gục thì chờ cứu, nghe lệnh dùng kỹ năng riêng.
let bots = [];
const botViews = new Map();
const BOT_FLAGS = { moving: 1, firing: 2, down: 4, out: 8 };
function botChars() {
  const taken = new Set([player.char]);
  if (net.active) for (const rp of net.players.values()) if (rp.inited || rp.j) taken.add(rp.char);
  if (net.active) for (const m of roomMembers()) taken.add(m.me ? myChar : m.c);
  return teamIdx().filter((i) => !taken.has(i)).slice(0, Math.max(0, TEAM_N - taken.size));
}
function clearBots() {
  for (const b of bots) scene.remove(b.sp.group);
  bots = [];
  for (const v of botViews.values()) scene.remove(v.sp.group);
  botViews.clear();
}
function botSprite(ci) {
  const C = CHARS[ci];
  const sp = makeSprite(charSet(ci), C.color);
  sp.group.scale.setScalar(C.scale || 1);
  return sp;
}
function newBot(ci, k) {
  const C = CHARS[ci], m = { ...computeMod(C.id, new Set()) };
  return { ci, k, r: 0.34, hp: C.hp, maxHp: C.hp, aim: 0, weapon: 0, melee: 'fist', idleT: rand(0.5, 2), anchor: null, search: null, searchT: 0, walk: 0, cd: rand(0, 0.5), state: 'ok', downT: 0, task: null, sp: botSprite(ci), side: k % 2 ? 1 : -1, stuck: 0, hitT: 0, moving: false, firing: false, pinnedBy: 0, mod: m, x: 0, z: 0 };
}
function makeBots() {
  clearBots(); botLooted.clear();
  botChars().forEach((ci, k) => bots.push(newBot(ci, k)));
  placeBots();
}
// chủ phòng: có người vào / rời phòng giữa ván thì bớt / thêm bot cho đủ đội 4 người (không trùng nhân vật với người chơi)
let botRecT = 2;
function reconcileBots() {
  if (state.mode !== 'play' || (net.active && !net.host) || calmNow()) return;
  const want = botChars();
  for (const b of [...bots]) if (!want.includes(b.ci)) { scene.remove(b.sp.group); bots.splice(bots.indexOf(b), 1); }
  for (const ci of want) if (!findBot(ci)) {
    const b = newBot(ci, bots.length);
    for (let t = 0; t < 12; t++) {
      const x = clamp(player.x + rand(-2, 2), BOUNDS.x0 + 0.5, BOUNDS.x1 - 0.5), z = clamp(player.z + rand(-0.8, 0.8), BOUNDS.z0 + 0.4, BOUNDS.z1 - 0.3);
      if (!insideSolid(x, z, 0.4) || t === 11) { b.x = x; b.z = z; break; }
    }
    bots.push(b);
  }
}
// bot cũng vào game tay trắng: tự lục đồ tìm vũ khí, hoặc được bạn đưa cho
function armBots() {}
const botLooted = new Set();
const botSpr = (b) => (b.weapon === 0 ? MELEE_SPR[(MELEE[b.melee] || MELEE.fist).spr] : b.weapon);
// bot nhận vũ khí: giữ món mạnh hơn; cung chỉ Tiến dùng
function botTakeWeapon(b, it, from) {
  const def = ITEMS[it];
  if (!def) return false;
  if (it === 'bow') {
    if (b.weapon === 4) return false;
    b.weapon = 4;
  } else if (def.melee) {
    const cur = MELEE[b.melee] || MELEE.fist, nw = MELEE[def.melee];
    if (!nw || nw.dmg <= cur.dmg) return false;
    b.melee = def.melee;
  } else return false;
  floaters.push({ x: b.x, y: 2.5, z: b.z, text: (from ? 'Cảm ơn! ' : 'Tìm được ') + def.name.toLowerCase(), t: 1.6, color: CHARS[b.ci].color });
  return true;
}
// bot lục một chỗ: chỉ giữ vũ khí (và băng gạc để tự băng bó)
function botLoot(b, c) {
  botLooted.add(c.id);
  for (const [it] of rollLoot(c.kind, Math.random, () => true)) {
    if (botTakeWeapon(b, it, false)) break;
    if ((it === 'bandage' || it === 'medkit') && b.hp < b.maxHp) { b.hp = Math.min(b.maxHp, b.hp + ITEMS[it].heal); floaters.push({ x: b.x, y: 2.4, z: b.z, text: '+' + ITEMS[it].heal + ' MÁU', t: 1.1, color: '#7fe07f' }); break; }
  }
}
// bot rảnh: đi lại quanh người dẫn đầu, thỉnh thoảng tự lục đồ gần đó
function botIdle(b, leader, ld, dt) {
  if (!leader) return null;
  const fpMe = FP.on && Math.abs(leader.x - player.x) < 0.01 && Math.abs(leader.z - player.z) < 0.01;
  if (ld > 9) { b.search = null; b.anchor = null; }
  if (b.search) {
    const c = b.search, d = Math.hypot(c.x - b.x, c.z - b.z);
    if (botLooted.has(c.id) || Math.hypot(c.x - leader.x, c.z - leader.z) > 10) { b.search = null; return null; }
    b.searchAge = (b.searchAge || 0) + dt;
    if (b.searchAge > 14) { botLooted.add(c.id); b.search = null; return null; }   // không tới được: bỏ qua chỗ này
    if (d > 1.25) { b.searchT = 0; return [c.x, c.z]; }
    b.searchT += dt; b.searching = true; b.aim = Math.atan2(c.z - b.z, c.x - b.x);
    if (Math.random() < dt * 6) fx.lit.spawn(c.x + rand(-0.3, 0.3), rand(0.4, 1.2), c.z + rand(-0.2, 0.2), rand(-0.6, 0.6), rand(0.4, 1.2), rand(-0.3, 0.3), 0.6, 0.06, '#c8b898', { grav: 3, drag: 2 });
    if (b.searchT > 2.4) { botLoot(b, c); b.search = null; b.idleT = rand(2, 5); }
    return null;
  }
  b.idleT -= dt;
  if (b.idleT <= 0 || !b.anchor) {
    b.idleT = rand(4, 9);
    // tìm chỗ chưa lục gần đó (bot khác chưa nhắm tới)
    if (Math.random() < 0.5 && !calmNow()) {
      let best = null, bd = 7;
      for (const c of world.containers) {
        if (botLooted.has(c.id) || c.locked || bots.some((o) => o.search === c)) continue;
        const d = Math.hypot(c.x - leader.x, c.z - leader.z);
        if (d < bd) { bd = d; best = c; }
      }
      if (best) { b.search = best; b.searchT = 0; b.searchAge = 0; return [best.x, best.z]; }
    }
    for (let t = 0; t < 8; t++) {
      let a = rand(0, TAU);
      if (fpMe) a = FP.yaw + Math.PI + rand(-1.1, 1.1);
      const r = rand(1.6, 4.2), x = clamp(leader.x + Math.cos(a) * r, BOUNDS.x0 + 0.5, BOUNDS.x1 - 0.5), z = clamp(leader.z + Math.sin(a) * r * 0.7, BOUNDS.z0 + 0.3, BOUNDS.z1 - 0.3);
      if (!insideSolid(x, z, 0.4)) { b.anchor = { x, z }; break; }
    }
  }
  if (fpMe && b.anchor) {
    // góc nhìn thứ nhất: không đứng chắn trước mặt
    const ax = b.anchor.x - player.x, az = b.anchor.z - player.z;
    if (ax * Math.cos(FP.yaw) + az * Math.sin(FP.yaw) > 0.5 && Math.hypot(ax, az) < 5) b.idleT = 0;
  }
  const lx = leader.x + 0, lz = leader.z + 0;
  if (ld > 6 && b.anchor && Math.hypot(b.anchor.x - lx, b.anchor.z - lz) > 5) b.idleT = 0;
  if (b.anchor && Math.hypot(b.anchor.x - b.x, b.anchor.z - b.z) > 0.6) return [b.anchor.x, b.anchor.z];
  return null;
}
function placeBots() {
  bots.forEach((b, k) => {
    for (let t = 0; t < 12; t++) {
      const x = clamp(player.x + (k + 1) * 0.9 * (player.x > 0 ? -1 : 1) + rand(-0.3, 0.3), BOUNDS.x0 + 0.5, BOUNDS.x1 - 0.5);
      const z = clamp(player.z + (k % 2 ? 0.7 : -0.6) + rand(-0.3, 0.3), BOUNDS.z0 + 0.4, BOUNDS.z1 - 0.3);
      if (!insideSolid(x, z, 0.4) || t === 11) { b.x = x; b.z = z; break; }
    }
    b.task = null; b.pinnedBy = 0;
  });
}
const botName = (ci) => CHARS[ci].name + ' (bot)';
const findBot = (ci) => bots.find((b) => b.ci === ci);
// danh sách bot để hiển thị / tương tác (chủ phòng: bot thật, khách: bản sao theo ảnh chụp)
function allBots() {
  if (!net.active || net.host) return bots.map((b) => ({ ci: b.ci, x: b.x, z: b.z, hp: b.hp, maxHp: b.maxHp, state: b.state }));
  return [...botViews.values()].map((v) => ({ ci: v.ci, x: v.x, z: v.z, hp: v.hp, maxHp: CHARS[v.ci].hp, state: v.flags & 8 ? 'out' : v.flags & 4 ? 'down' : 'ok' }));
}
const botAvail = (id) => allBots().find((b) => CHARS[b.ci].id === id && b.state === 'ok');
const botBusy = (id, poi) => bots.some((b) => CHARS[b.ci].id === id && b.task && b.task.poi === poi) || (net.active && !net.host && net.taskSent && net.taskSent[poi] > gtime);
function hurtBot(key, dmg) {
  const b = bots.find((o) => 'b' + o.ci === key);
  if (!b || b.state !== 'ok') return;
  b.hp -= dmg; b.hitT = 0.15;
  for (let i = 0; i < 6; i++) fx.blood.spawn(b.x, rand(0.7, 1.3), b.z, rand(-2, 2), rand(0.5, 2.5), rand(-2, 2), 1.4, rand(0.05, 0.09), '#a51c16', { grav: 11, drag: 0.8 });
  if (b.hp <= 0) {
    b.hp = 0; b.state = 'down'; b.downT = 40; b.task = null; b.pinnedBy = 0;
    showMsg(`${CHARS[b.ci].name.toUpperCase()} GỤC NGÃ`, 'Lại gần giữ ' + KN('use') + ' để cứu · bạn khác cũng sẽ tới kéo dậy');
  }
}
function reviveBot(ci, byMe) {
  const b = findBot(ci);
  if (!b || b.state !== 'down') return;
  b.state = 'ok'; b.hp = Math.round(b.maxHp * 0.5); b.hitT = 0;
  floaters.push({ x: b.x, y: 2.4, z: b.z, text: 'ĐÃ CỨU!', t: 1.1, color: '#7fe07f' });
  if (byMe) gainXP(10, true);
}
function giveToBot(key, it, mul) {
  const ci = +String(key).slice(1);
  if (net.active && !net.host) { netEvent('gbot', ci, it, Math.round(mul * 100)); return; }
  const b = findBot(ci), def = ITEMS[it];
  if (!b) return;
  if (def.melee || it === 'bow') { if (!botTakeWeapon(b, it, true)) floaters.push({ x: b.x, y: 2.4, z: b.z, text: 'CẢM ƠN!', t: 1.1, color: '#7fe07f' }); return; }
  if (def.heal) b.hp = Math.min(b.maxHp, b.hp + Math.round(def.heal * mul));
  floaters.push({ x: b.x, y: 2.4, z: b.z, text: def.heal ? `+${Math.round(def.heal * mul)} MÁU` : 'CẢM ƠN!', t: 1.1, color: '#7fe07f' });
}
function botMelee(b, z) {
  const C = CHARS[b.ci], w = MELEE[b.melee] || MELEE.fist;
  b.cd = Math.max(0.45, w.rate * 1.35);
  b.firing = true;
  const dmg = Math.round(Math.max(16, w.dmg) * (b.mod.meleeDmg || 1));
  modelSwing(b.sp);
  damageZombie(z, dmg, Math.atan2(z.z - b.z, z.x - b.x), 0.4, z.x, z.z, true);
  for (let i = 0; i < 5; i++) { const a = b.aim + (i / 4 - 0.5) * 1.4; fx.spark.spawn(b.x + Math.cos(a), 1.0, b.z + Math.sin(a), 0, 0, 0, 0.1, 0.06, '#e8f0ff', { grav: 0, drag: 9, mode: 1 }); }
  sound.swing(true);
}
function botShoot(b, z) {
  b.cd = 1.1; b.firing = true; modelSwing(b.sp, 0.14);
  const a = Math.atan2(z.z - b.z, z.x - b.x) + rand(-0.03, 0.03), mx = b.x + Math.cos(a) * 0.7, mz = b.z + Math.sin(a) * 0.7;
  bullets.push({ x: mx, z: mz, px: mx, pz: mz, vx: Math.cos(a) * 26, vz: Math.sin(a) * 26, dmg: 52, life: 0.8, pierce: 0, arrow: true, mine: false, bot: true });
  sound.swing(false);
}
// lệnh cho bot dùng kỹ năng riêng tại một điểm (cổng sắt, camera)
function botTask(id, poi) {
  if (net.active && !net.host) { net.taskSent = net.taskSent || {}; net.taskSent[poi] = gtime + 6; netEvent('btask', id, poi); return; }
  const b = bots.find((o) => CHARS[o.ci].id === id && o.state === 'ok');
  if (!b || !world.pois[poi] || (b.task && b.task.poi === poi)) return;
  b.task = { poi, t: 0, stuckT: 0 };
  floaters.push({ x: b.x, y: 2.5, z: b.z, text: 'Để tôi!', t: 1.2, color: CHARS[b.ci].color });
}
// người đang gục chờ cứu (chính mình, hoặc bạn co-op khi mình là chủ phòng); bot rảnh gần nhất tới cứu
function downedMate() {
  let t = null;
  if (player.downed > 0 && !player.zombie) t = { x: player.x, z: player.z, local: true };
  else if (net.active) for (const rp of net.players.values()) if (rp.inited && rp.here && rp.flags & 4 && !(rp.flags & (8 | 128))) { t = { x: rp.x, z: rp.z, peer: rp.peer }; break; }
  // không có người gục: bot cứu bot
  if (!t) for (const db of bots) if (db.state === 'down') { t = { x: db.x, z: db.z, mate: db }; break; }
  if (!t) return null;
  let bd = 1e9;
  for (const b of bots) if (b.state === 'ok' && !b.pinnedBy) { const d = Math.hypot(b.x - t.x, b.z - t.z); if (d < bd) { bd = d; t.bot = b; } }
  return t.bot ? t : null;
}
function updateBots(dt) {
  if (net.active && !net.host) { updateBotViews(dt); return; }
  const humans = TG.filter((t) => !t.bot);
  const downed = downedMate();
  for (const b of bots) {
    const s = b.sp;
    b.firing = false; b.moving = false; b.hitT -= dt;
    if (b.state === 'out') { s.group.visible = false; continue; }
    s.group.visible = true;
    if (b.state === 'down') {
      b.downT -= dt;
      s.mesh.rotation.x = -Math.PI / 2; s.group.position.set(b.x, 0.05, b.z);
      if (b.downT <= 0) { b.state = 'out'; showMsg(`${CHARS[b.ci].name.toUpperCase()} ĐÃ NGẤT`, 'Bot sẽ tỉnh lại và quay về khi trời sáng'); }
      continue;
    }
    s.mesh.rotation.x = 0;
    if (b.pinnedBy) {
      b.pinT = (b.pinT || 0) + dt; b.pinDmgT = (b.pinDmgT || 0.5) - dt;
      if (b.pinDmgT <= 0) { b.pinDmgT = 0.5; hurtBot('b' + b.ci, 5); }
      const z = zombies.find((o) => o.id === b.pinnedBy);
      if (!z || z.state !== 'pin' || b.pinT > 3.5) { if (z && z.state === 'pin') releasePin(z, 2.2, true); b.pinnedBy = 0; b.pinT = 0; }
      s.mesh.rotation.x = -Math.PI / 2; s.group.position.set(b.x, 0.05, b.z);
      continue;
    }
    b.cd -= dt;
    let gx, gz, tz = null, td = 1e9;
    b.searching = false;
    const R = downed && downed.bot === b ? downed : null;
    for (const z of zombies) {
      if (z.state === 'dead' || z.y > 0.3 || z.state === 'rise' || (z.type === 'weeper' && !z.aggro)) continue;
      const d = Math.hypot(z.x - b.x, z.z - b.z), range = b.weapon === 4 ? 11 : 6.5;
      if (d < range && (z.aggro || d < 2.5) && d < td) { td = d; tz = z; }
    }
    let leader = null, ld = 1e9;
    for (const t of humans) { const d = Math.hypot(t.x - b.x, t.z - b.z); if (d < ld) { ld = d; leader = t; } }
    if (b.task && world.pois[b.task.poi]) {
      const P = world.pois[b.task.poi], d = Math.hypot(P.x - b.x, P.z - b.z);
      if (d > 1.7) { gx = P.x; gz = P.z; b.task.stuckT += dt; if (b.task.stuckT > 6) { b.x = P.x + 0.4; b.z = P.z; } }
      else {
        b.task.t += dt; b.aim = Math.atan2(P.z - b.z, P.x - b.x);
        if (b.task.t > 1.6) { botDoTask(b, b.task.poi); b.task = null; }
      }
    } else if (R && !(tz && td < 1.8)) {
      // tới kéo bạn dậy (trừ khi zombie đang sát bên)
      const d = Math.hypot(R.x - b.x, R.z - b.z);
      b.search = null; b.anchor = null;
      if (d > 1.1) { gx = R.x; gz = R.z; b.revT = 0; }
      else {
        b.revT = (b.revT || 0) + dt; b.searching = true; b.aim = Math.atan2(R.z - b.z, R.x - b.x);
        if (b.revT > 2.5) {
          b.revT = 0;
          if (R.local) revived({ name: CHARS[b.ci].name }); else if (R.mate) reviveBot(R.mate.ci, false); else netEvent('rv', R.peer);
          floaters.push({ x: b.x, y: 2.5, z: b.z, text: 'Dậy đi!', t: 1.2, color: CHARS[b.ci].color });
        }
      }
    } else if (tz) {
      b.aim = Math.atan2(tz.z - b.z, tz.x - b.x);
      if (b.weapon === 4) {
        if (td < 3.5) { gx = b.x - Math.cos(b.aim) * 2; gz = b.z - Math.sin(b.aim) * 2; }
        if (b.cd <= 0 && navLOS(b.x, b.z, tz.x, tz.z)) botShoot(b, tz);
      } else if (td > 1.0) {
        // vây zombie từ phía mình đang đứng, không dồn cả nhóm vào một điểm
        const ax = b.x - tz.x, az = b.z - tz.z, al = Math.hypot(ax, az) || 1;
        gx = tz.x + ax / al * 0.85; gz = tz.z + az / al * 0.85;
      } else if (b.cd <= 0) botMelee(b, tz);
      b.search = null;
    } else {
      if (leader && ld > 26) { b.x = leader.x - b.side * 1.5; b.z = leader.z; b.anchor = null; b.search = null; }
      const g = botIdle(b, leader, ld, dt);
      if (g) { gx = g[0]; gz = g[1]; }
      if (!b.searching) b.hp = Math.min(b.maxHp, b.hp + dt * 2.5);
    }
    if (gx !== undefined) {
      let dx = gx - b.x, dz = gz - b.z;
      const d = Math.hypot(dx, dz) || 1;
      dx /= d; dz /= d;
      if (!navLOS(b.x, b.z, gx, gz)) { const f = navField(gx, gz); if (f && navStep(f, b)) { dx = navOut.x; dz = navOut.z; } }
      if (b.stuck > 0.6) { const sx = -dz * b.side, sz = dx * b.side; dx = dx * 0.4 + sx * 0.6; dz = dz * 0.4 + sz * 0.6; b.stuck -= dt; if (b.stuck > 1.2) { b.stuck = 0; b.side *= -1; } }
      const spd = CHARS[b.ci].speed * (d > 7 ? 1.35 : tz || b.search ? 0.95 : 0.72), ox = b.x, oz = b.z;
      b.x += dx * spd * dt; b.z += dz * spd * dt * 0.85;
      if (collide(b) && Math.hypot(b.x - ox, b.z - oz) < spd * dt * 0.4) b.stuck += dt; else b.stuck = Math.max(0, b.stuck - dt);
      b.moving = true; b.walk += dt * spd * 1.6;
      if (!tz) b.aim = Math.atan2(dz, dx);
    }
  }
  // tách nhau ra: bot không đứng chồng lên nhau hay lên người chơi
  const live = bots.filter((b) => b.state === 'ok' && !b.pinnedBy);
  for (let i = 0; i < live.length; i++) {
    const a = live[i];
    for (let j = i + 1; j < live.length; j++) {
      const c = live[j], dx = c.x - a.x, dz = c.z - a.z, d = Math.hypot(dx, dz), m = 0.8;
      if (d < m) { const k = (m - d) / 2, ux = d > 0.001 ? dx / d : Math.cos(i + j), uz = d > 0.001 ? dz / d : Math.sin(i + j); a.x -= ux * k; a.z -= uz * k; c.x += ux * k; c.z += uz * k; }
    }
    for (const t of humans) {
      const dx = a.x - t.x, dz = a.z - t.z, d = Math.hypot(dx, dz), m = FP.on ? 1.4 : 0.85;
      if (d < m) { const ux = d > 0.001 ? dx / d : 1, uz = d > 0.001 ? dz / d : 0; a.x += ux * (m - d); a.z += uz * (m - d); }
    }
    collide(a);
  }
  for (const b of bots) {
    if (b.state === 'out') continue;
    const s = b.sp;
    if (b.state === 'ok' && !b.pinnedBy) {
      setSpriteMap(s, botSpr(b));
      setFrame(s, b.searching ? 'up' : dirFromAngle(b.aim), b.moving ? Math.floor(b.walk) % 4 : b.searching ? Math.floor(gtime * 7) % 4 : 0, b.searching ? undefined : b.aim);
      s.group.position.set(b.x, 0, b.z);
    }
    s.mat.color.setScalar(b.hitT > 0 ? 2.2 : 1);
  }
}
function botDoTask(b, poi) {
  const id = CHARS[b.ci].id;
  if (poi === 'gate') gateAct('lift', CHARS[b.ci].name, 'b' + b.ci);
  if (poi === 'cctv') camHack(25, 0, CHARS[b.ci].name);
}
function dawnBots() {
  for (const b of bots) if (b.state === 'out' || b.state === 'down') { b.state = 'ok'; b.hp = Math.round(b.maxHp * 0.6); }
  if (bots.length) placeBots();
}
// khách: dựng bot theo ảnh chụp của chủ phòng
function syncBotViews(list) {
  const seen = new Set();
  for (const a of list) {
    if (!Array.isArray(a)) continue;
    const ci = clamp(a[0] | 0, 0, CHARS.length - 1);
    seen.add(ci);
    let v = botViews.get(ci);
    if (!v) { v = { ci, sp: botSprite(ci), x: a[1] / 10, z: a[2] / 10, walk: 0, fireT: 0 }; botViews.set(ci, v); }
    v.tx = a[1] / 10; v.tz = a[2] / 10; v.aim = a[3] / 100; v.weapon = clamp(a[4] | 0, 0, 4); v.flags = a[5] | 0; v.hp = a[6] | 0;
  }
  for (const [ci, v] of botViews) if (!seen.has(ci)) { scene.remove(v.sp.group); botViews.delete(ci); }
}
function updateBotViews(dt) {
  for (const v of botViews.values()) {
    const k = Math.min(1, dt * 10), ox = v.x, oz = v.z;
    v.x += ((v.tx ?? v.x) - v.x) * k; v.z += ((v.tz ?? v.z) - v.z) * k;
    v.walk += Math.hypot(v.x - ox, v.z - oz) * 1.6;
    const sp = v.sp;
    sp.group.visible = !(v.flags & 8);
    const down = v.flags & 4;
    sp.mesh.rotation.x = down ? -Math.PI / 2 : 0;
    setSpriteMap(sp, v.weapon);
    setFrame(sp, dirFromAngle(v.aim || 0), v.flags & 1 ? Math.floor(v.walk) % 4 : 0, v.aim || 0);
    sp.group.position.set(v.x, down ? 0.05 : 0, v.z);
    v.fireT -= dt;
    if (v.flags & 2 && !down && v.fireT <= 0 && v.weapon === 4) {
      v.fireT = 1.0;
      const a = v.aim, mx = v.x + Math.cos(a) * 0.7, mz = v.z + Math.sin(a) * 0.7;
      bullets.push({ x: mx, z: mz, px: mx, pz: mz, vx: Math.cos(a) * 26, vz: Math.sin(a) * 26, dmg: 0, life: 0.6, pierce: 0, cosmetic: true });
    }
  }
}

// ================= CỔNG SẮT (HAMBLE) · CAMERA (LYCAS) =================
const gateStates = {};      // chủ phòng/solo: trạng thái cổng của từng khu
const GATE_CODES = ['closed', 'held', 'open'];
function gateVisual(st) {
  const g = world.pois.gate;
  if (!g) return;
  if (g.state === st && g.applied) return;
  g.state = st; g.applied = true;
  if (st === 'closed') {
    g.gate.position.y = 0; g.gate.rotation.x = -1.2;
    if (!world.colliders.boxes.includes(g.box)) world.colliders.boxes.push(g.box);
  } else {
    g.gate.position.y = 2.35; g.gate.rotation.x = -Math.PI / 2;
    const i = world.colliders.boxes.indexOf(g.box); if (i >= 0) world.colliders.boxes.splice(i, 1);
  }
  g.plank.visible = st === 'open';
  navBuild();
}
let gateMine = false;
function gateAct(act, who, lifter) {
  if (net.active && !net.host) { netEvent('gate', act); return; }
  const g = world.pois.gate;
  if (!g) return;
  const st = gateStates[ZONE.id] || { s: 'closed', t: 0 };
  if (act === 'lift' && st.s === 'closed') {
    gateStates[ZONE.id] = { s: 'held', t: 18, bt: 0, by: lifter || '' };
    showMsg('CỔNG ĐÃ ĐƯỢC NÂNG', (who || 'Một bạn') + ' đang giữ cổng · bạn khác chèn gỗ (cần 1 thanh gỗ)');
    sound.unlock(); shake = Math.max(shake, 0.25);
  } else if (act === 'prop' && st.s === 'held') {
    gateStates[ZONE.id] = { s: 'open', t: 0 };
    showMsg('ĐÃ CHÈN CỔNG', 'Lối hẻm đã mở cho cả đội');
    sound.unlock();
  }
  gateVisual(gateStates[ZONE.id].s);
}
function updateGate(dt) {
  const g = world.pois.gate;
  if (!g || (net.active && !net.host)) return;
  const st = gateStates[ZONE.id] || (gateStates[ZONE.id] = { s: 'closed', t: 0 });
  gateVisual(st.s);
  if (st.s !== 'held') return;
  st.t -= dt; st.bt = (st.bt || 0) + dt;
  // không có ai khác chèn: một bot khác (không phải bot đang giữ cổng) tự lấy gỗ chèn
  const helper = bots.find((b) => b.state === 'ok' && st.by !== 'b' + b.ci);
  if (helper && st.bt > 3) { floaters.push({ x: helper.x, y: 2.5, z: helper.z, text: 'Tôi chèn cho!', t: 1.2, color: CHARS[helper.ci].color }); gateAct('prop', botName(helper.ci)); return; }
  if (st.t <= 0) { gateStates[ZONE.id] = { s: 'closed', t: 0 }; gateVisual('closed'); showMsg('CỔNG SẬP XUỐNG', 'Không ai chèn kịp · nâng lại lần nữa'); sound.hit(g.x, g.z); }
}
function describeGate() {
  const g = world.pois.gate, st = g.state || 'closed';
  if (st !== 'held') gateMine = false;
  if (st === 'open') return { label: 'Cổng đã được chèn', can: false };
  if (st === 'held') {
    if (gateMine) return { label: 'Đang giữ cổng · chờ bạn chèn gỗ', can: false };
    return player.bag.wood > 0 ? { label: 'Chèn gỗ giữ cổng', can: true, time: 1.2 } : { label: 'Cần 1 thanh gỗ để chèn cổng', can: false };
  }
  if (player.bag.pipe > 0 && player.bag.wood > 0) return { label: 'Bẩy cổng bằng ống thép và chèn gỗ', can: true, time: 4.0 };
  if (player.bag.wood >= 2) return { label: 'Bẩy cổng bằng gỗ rồi chèn (2 thanh gỗ)', can: true, time: 4.5 };
  const busy = bots.find((b) => b.task && b.task.poi === 'gate') || (net.active && !net.host && net.taskSent && net.taskSent.gate > gtime);
  if (busy) return { label: 'Bạn đang tới nâng cổng…', can: false };
  const b = allBots().find((o) => o.state === 'ok');
  if (b) return { label: `Nhờ ${CHARS[b.ci].name} nâng cổng`, can: true, time: 0.3 };
  return { label: 'Nâng cổng sắt · cần 2 thanh gỗ (hoặc ống thép + 1 gỗ) để tự chèn', can: true, time: 2.2 };
}
function doGate() {
  const st = world.pois.gate.state || 'closed';
  if (st === 'held' && !gateMine && player.bag.wood > 0) { player.bag.wood--; gateAct('prop'); hud.dirty = true; return; }
  if (st !== 'closed') return;
  if ((player.bag.pipe > 0 && player.bag.wood > 0) || player.bag.wood >= 2) {
    player.bag.wood -= player.bag.pipe > 0 ? 1 : 2;
    gateAct('lift', CHARS[player.char].name); gateAct('prop'); hud.dirty = true; return;
  }
  const b = allBots().find((o) => o.state === 'ok');
  if (b) { botTask(CHARS[b.ci].id, 'gate'); return; }
  gateMine = true; gateAct('lift', CHARS[player.char].name, 'me');
}
// camera an ninh: ai cũng xem được
function describeCam() {
  if (camReveal > 0) return { label: 'Đang xem camera…', can: false };
  return { label: 'Xem camera an ninh', can: true, time: 1.5 };
}
function doCam() { camHack(25, 0, CHARS[player.char].name); }
// hack camera: cả đội trong khu đều thấy zombie (và chỗ còn đồ nếu đã học kỹ năng)
let camLootOn = false;
function camHack(sec, loot, who) {
  if (net.active) netEvent('cam', Math.round(sec), loot ? 1 : 0);
  camReveal = sec; camLootOn = !!loot;
  showMsg('CAMERA AN NINH', `${who || 'Bạn'} đang xem camera · thấy mọi zombie trong ${Math.round(sec)} giây` + (loot ? ' · đánh dấu chỗ còn đồ' : ''));
  sound.radio();
}

// ================= ZOMBIE ĐẶC BIỆT =================
// Phình (nổ dịch xanh dụ cả bầy), Phun (axit), Vồ (đè người), Húc (lao húc văng),
// Khóc (ngồi khóc, làm phiền thì nổi điên), Khổng lồ. Chủ phòng điều khiển; hiệu ứng lên người chơi
// gửi qua sự kiện để máy của từng người tự áp dụng.
let acidPools = [], globs = [];
const keyOf = (t) => (t.me ? 'me' : t.bot || t.peer);
function noticeSpecials() {
  for (const z of zombies) {
    if (z.state === 'dead' || !SPECIAL[z.skin] || seenSpecial.has(z.skin)) continue;
    if (Math.abs(z.x - player.x) > 15 || !(z.aggro || z.skin === 'weeper')) continue;
    seenSpecial.add(z.skin);
    showMsg(SPECIAL[z.skin].name, SPECIAL[z.skin].hint);
  }
}
function weeperIdle(z, dt) {
  const s = z.sprite;
  setFrame(s, 'down', 0);
  s.group.position.set(z.x, 0, z.z);
  s.mat.color.setScalar(1);
  z.hitT -= dt;
  z.cryT = (z.cryT || rand(0, 2)) - dt;
  if (z.cryT <= 0) { z.cryT = rand(2.5, 4.5); if (Math.abs(z.x - player.x) < 20) floaters.push({ x: z.x, y: 2.0, z: z.z, text: 'hu… hu…', t: 1.6, color: '#c8d0e8' }); }
  for (const t of TG) {
    const d = Math.hypot(t.x - z.x, t.z - z.z);
    const ang = (o) => Math.abs(angDiff(o.aim, Math.atan2(z.z - o.z, z.x - o.x)));
    let lit = false;
    if (lastFlash > 0.05 && d < 7) {
      if (t.me) lit = (flashActive() && ang(player) < 0.45) || player.torchT > 0 && d < 4;
      else { const rp = net.players.get(t.peer); lit = !!rp && ((rp.light & 1 && ang(rp) < 0.45) || (rp.light & 2 && d < 4)); }
    }
    if (d < 2.8 || lit) { enrage(z, t); return; }
  }
}
function enrage(z, t) {
  if (z.aggro) return;
  z.aggro = true; z.prey = t ? keyOf(t) : null; z.sprite.xr.visible = true;
  sound.groan(z.x, z.z, true); shake = Math.max(shake, 0.4);
  floaters.push({ x: z.x, y: 2.3, z: z.z, text: 'AAAAAA!', t: 1.4, color: '#ff4a4a' });
  if (Math.abs(z.x - player.x) < 20) showMsg('ZOMBIE KHÓC NỔI ĐIÊN!', 'Chạy hoặc dồn hết hoả lực!');
}
// ---------- hành vi theo loại (chủ phòng / solo) ----------
const SPECIAL_AI = {
  bloater(z, T, d) { if (d < 1.3) { killZombie(z, 0); return true; } return false; },
  spitter(z, T, d, dt) {
    z.sT = (z.sT ?? rand(1.5, 3)) - dt;
    if (z.sT <= 0 && d < 9.5 && d > 2 && navLOS(z.x, z.z, T.x, T.z)) {
      z.sT = rand(4.5, 6.5);
      spitAcid(z.x, z.z, T.x + rand(-0.4, 0.4), T.z + rand(-0.3, 0.3), true);
      floaters.push({ x: z.x, y: 2.1, z: z.z, text: 'PHỤT!', t: 0.8, color: '#9aff6a' });
    }
    return false;
  },
  pouncer(z, T, d, dt) {
    z.sT = (z.sT ?? rand(0.5, 1.5)) - dt;
    if (z.sT <= 0 && d > 2.2 && d < 8 && navLOS(z.x, z.z, T.x, T.z)) {
      z.state = 'crouch'; z.ct = 0.45; z.tx0 = T.x; z.tz0 = T.z;
      sound.groan(z.x, z.z, false);
      return true;
    }
    return false;
  },
  charger(z, T, d, dt) {
    z.sT = (z.sT ?? rand(2, 4)) - dt;
    if (z.sT <= 0 && d > 3 && d < 11 && navLOS(z.x, z.z, T.x, T.z)) {
      z.sT = rand(6, 9); z.state = 'charge'; z.ct = 0.6; z.wind = true;
      z.cdx = (T.x - z.x) / d; z.cdz = (T.z - z.z) / d; z.hitKeys = new Set();
      sound.groan(z.x, z.z, true);
      floaters.push({ x: z.x, y: 2.6, z: z.z, text: 'GRAAA!', t: 0.9, color: '#ff8a4a' });
      return true;
    }
    return false;
  },
};
function targetByKey(k) { return TG.find((t) => keyOf(t) === k) || null; }
function specialState(z, dt) {
  const s = z.sprite;
  z.hitT -= dt;
  s.mat.color.setScalar(z.hitT > 0 ? 3 : 1);
  if (z.state === 'stun') {
    z.stunT -= dt;
    setFrame(s, z.dir, 0); s.group.position.set(z.x + Math.sin(gtime * 40) * 0.03, 0, z.z);
    if (z.stunT <= 0) z.state = 'walk';
    return;
  }
  if (z.state === 'crouch') {
    z.ct -= dt;
    setFrame(s, z.dir, 0); s.group.position.set(z.x, -0.12, z.z);
    if (z.ct <= 0) {
      const dx = z.tx0 - z.x, dz = z.tz0 - z.z, d = Math.hypot(dx, dz) || 1, L = Math.min(d + 0.4, 8.5);
      z.state = 'leap'; z.lt = 0; z.ld = Math.max(0.35, L / 10);
      z.lx0 = z.x; z.lz0 = z.z; z.lx1 = z.x + dx / d * L; z.lz1 = z.z + dz / d * L;
    }
    return;
  }
  if (z.state === 'leap') {
    z.lt += dt;
    const k = Math.min(1, z.lt / z.ld);
    z.x = z.lx0 + (z.lx1 - z.lx0) * k; z.z = z.lz0 + (z.lz1 - z.lz0) * k;
    collide(z);
    const y = Math.sin(Math.PI * k) * 1.3;
    z.dir = dirFromAngle(Math.atan2(z.lz1 - z.lz0, z.lx1 - z.lx0));
    setFrame(s, z.dir, 1); s.group.position.set(z.x, y, z.z);
    if (k >= 1) {
      let tg = null;
      for (const t of TG) if (Math.hypot(t.x - z.x, t.z - z.z) < 1.15) tg = t;
      if (tg) pinTarget(z, tg);
      else { z.state = 'walk'; z.sT = rand(2, 3.5); }
    }
    return;
  }
  if (z.state === 'pin') {
    const t = targetByKey(z.pinKey);
    z.pinT += dt;
    if (!t || z.pinT > 9) { releasePin(z, 1.5); return; }
    z.x = t.x + 0.18; z.z = t.z - 0.06;
    setFrame(s, 'down', Math.floor(gtime * 10) % 4);
    s.group.position.set(z.x, 0.3, z.z);
    return;
  }
  if (z.state === 'charge') {
    if (z.wind) {
      z.ct -= dt;
      setFrame(s, z.dir, 0); s.group.position.set(z.x + Math.sin(gtime * 50) * 0.05, 0, z.z);
      if (z.ct <= 0) { z.wind = false; z.ct = 1.4; }
      return;
    }
    z.ct -= dt;
    const ox = z.x, oz = z.z, sp = 9;
    z.x += z.cdx * sp * dt; z.z += z.cdz * sp * dt;
    const blocked = collide(z) && Math.hypot(z.x - ox, z.z - oz) < sp * dt * 0.5;
    for (const t of TG) {
      const k = keyOf(t);
      if (!z.hitKeys.has(k) && Math.hypot(t.x - z.x, t.z - z.z) < z.r + 0.5) { z.hitKeys.add(k); chargeHit(z, t); }
    }
    z.walk += dt * sp * 1.5;
    z.dir = dirFromAngle(Math.atan2(z.cdz, z.cdx));
    setFrame(s, z.dir, Math.floor(z.walk) % 4); s.group.position.set(z.x, 0, z.z);
    if (Math.random() < dt * 20) fx.lit.spawn(z.x, 0.1, z.z, rand(-1, 1), rand(0.5, 1.5), rand(-0.5, 0.5), 0.6, 0.1, '#6a5a48', { grav: 2, drag: 2 });
    if (z.ct <= 0 || blocked) {
      z.state = 'stun'; z.stunT = blocked ? 1.8 : 0.7;
      if (blocked) { shake = Math.max(shake, Math.abs(z.x - player.x) < 12 ? 0.5 : 0); sound.hit(z.x, z.z); }
    }
  }
}
function pinTarget(z, t) {
  z.state = 'pin'; z.pinKey = keyOf(t); z.pinT = 0; z.pinDmg = 0;
  if (t.me) setPinned(z.id);
  else if (t.bot) { const b = bots.find((o) => 'b' + o.ci === t.bot); if (b) { b.pinnedBy = z.id; b.pinT = 0; } }
  else netEvent('pin', t.peer, z.id);
}
function releasePin(z, stun, fromVictim = false) {
  if (!fromVictim) {
    if (z.pinKey === 'me') player.pinned = 0;
    else if (z.pinKey && z.pinKey[0] === 'b') { const b = bots.find((o) => 'b' + o.ci === z.pinKey); if (b) b.pinnedBy = 0; }
    else if (z.pinKey) netEvent('unpin', z.pinKey, z.id);
  }
  z.pinKey = null; z.state = 'stun'; z.stunT = stun; z.y = 0;
  z.x += rand(-0.8, 0.8); z.z += rand(-0.4, 0.4); collide(z);
}
function setPinned(id) {
  if (player.pinned === id) return;
  player.pinned = id; player.struggle = 0; player.pinDmgT = 0.6; player.action = null; player.searching = false;
  infectPlayer({ type: 'pouncer' });   // bị vồ ghì xuống: có thể bị cắn lây
  showMsg('BỊ ZOMBIE VỒ!', isTouch ? 'Bấm VÙNG liên tục để thoát' : 'Bấm ' + KN('use') + ' liên tục để vùng ra');
}
function breakPin() {
  const id = player.pinned;
  player.pinned = 0; player.struggle = 0; player.inv = 1.0;
  if (!net.active || net.host) { const z = zombies.find((o) => o.id === id); if (z && z.state === 'pin') releasePin(z, 2.4, true); }
  else netEvent('ups', id);
  floaters.push({ x: player.x, y: 2.3, z: player.z, text: 'THOÁT!', t: 1.0, color: '#f2c14e' });
}
function chargeHit(z, t) {
  if (t.me) knockPlayer(z.cdx, z.cdz, z.dmg);
  else if (t.bot) { const b = bots.find((o) => 'b' + o.ci === t.bot); if (b) { b.x += z.cdx * 2; b.z += z.cdz * 2; collide(b); hurtBot(t.bot, z.dmg); } }
  else netEvent('chg', t.peer, Math.round(z.cdx * 100), Math.round(z.cdz * 100), z.dmg);
}
function knockPlayer(dx, dz, dmg) {
  if (!playerAlive()) return;
  player.kx = dx * 9; player.kz = dz * 9; player.stunT = 0.8;
  hurtPlayer({ dmg, type: 'charger', x: player.x - dx, z: player.z - dz }, 1);
  shake = Math.max(shake, 0.7);
  floaters.push({ x: player.x, y: 2.4, z: player.z, text: 'BỊ HÚC VĂNG!', t: 1.1, color: '#ff8a4a' });
}
// nổ dịch xanh: chạy trên mọi máy, mỗi máy tự áp dụng lên người chơi của mình
function bileBlast(x, z) {
  for (let i = 0; i < 46; i++) {
    const a = Math.random() * TAU, sp = rand(1.5, 6);
    fx.blood.spawn(x, rand(0.5, 1.4), z, Math.cos(a) * sp, rand(1, 4.5), Math.sin(a) * sp, 2, rand(0.07, 0.14), Math.random() < 0.5 ? '#6a8a1a' : '#9ac83a', { grav: 10, drag: 0.6 });
  }
  sound.hit(x, z); sound.groan(x, z, true);
  if (Math.abs(x - camTarget.x) < 16) shake = Math.max(shake, 0.35);
  const d = Math.hypot(player.x - x, player.z - z);
  if (d < 3.2 && playerAlive()) {
    player.bile = 10;
    player.hp -= 5; hurtFlash = 0.5; hud.dirty = true;
    floaters.push({ x: player.x, y: 2.4, z: player.z, text: 'DÍNH DỊCH!', t: 1.4, color: '#b8f04a' });
    showMsg('DÍNH DỊCH ZOMBIE!', 'Cả bầy zombie đang lao về phía bạn!');
    if (player.hp <= 0) playerDied();
  }
}
function bileHorde(x, z) {
  // chủ phòng: dịch xanh gọi một bầy nhỏ lao tới những người bị dính
  for (const t of TG) {
    if (Math.hypot(t.x - x, t.z - z) > 3.4) continue;
    for (let i = 0; i < (phase === 'night' ? 4 : 2); i++) {
      const side = Math.random() < 0.5 ? -1 : 1;
      const zx = clamp(t.x + side * rand(9, 13), BOUNDS.x0 + 0.5, BOUNDS.x1 - 0.5), zz = rand(WALL_Z + 0.5, BOUNDS.z1 - 0.4);
      if (!insideSolid(zx, zz, 0.5)) newZombie(Math.random() < 0.4 ? 'runner' : 'walker', zx, 0, zz, 'walk');
    }
  }
}
// axit: cục axit bay theo đường cong rồi thành vũng
function spitAcid(x0, z0, x1, z1, host) {
  if (host && net.active && net.host) netEvent('ac', Math.round(x0 * 10), Math.round(z0 * 10), Math.round(x1 * 10), Math.round(z1 * 10));
  const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(0.6, 2.2, 0.4), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  m.scale.set(0.55, 0.55, 1); scene.add(m);
  globs.push({ x0, z0, x1, z1, t: 0, d: 0.85, m });
  sound.cough();
}
function updateAcid(dt) {
  for (let i = globs.length - 1; i >= 0; i--) {
    const g = globs[i];
    g.t += dt;
    const k = Math.min(1, g.t / g.d);
    g.m.position.set(g.x0 + (g.x1 - g.x0) * k, 1.4 + Math.sin(Math.PI * k) * 1.6 - k * 1.3, g.z0 + (g.z1 - g.z0) * k);
    if (g.fire && Math.random() < dt * 30) fx.ember.spawn(g.m.position.x, g.m.position.y, g.m.position.z, 0, 0.3, 0, 0.3, 0.06, '#ffb040', { grav: -0.2, drag: 1, mode: 1 });
    if (k >= 1 && g.fire) {
      scene.remove(g.m); g.m.material.dispose(); globs.splice(i, 1);
      if (!net.active || net.host) firePool(g.x1, g.z1, true);
      else netEvent('mol', Math.round(g.x1 * 10), Math.round(g.z1 * 10));
      continue;
    }
    if (k >= 1) {
      scene.remove(g.m); g.m.material.dispose(); globs.splice(i, 1);
      const mesh = new THREE.Mesh(new THREE.CircleGeometry(1.25, 22), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.35, 1.5, 0.22), transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
      mesh.rotation.x = -Math.PI / 2; mesh.position.set(g.x1, 0.035, g.z1); scene.add(mesh); hideRefl(mesh);
      acidPools.push({ x: g.x1, z: g.z1, r: 1.25, t: 7, mesh });
      sound.hit(g.x1, g.z1);
    }
  }
  for (let i = acidPools.length - 1; i >= 0; i--) {
    const a = acidPools[i];
    a.t -= dt;
    a.mesh.material.opacity = Math.min(0.6, a.t * 0.4) * (0.85 + 0.15 * Math.sin(gtime * 9 + a.x));
    if (Math.random() < dt * 14) fx.spark.spawn(a.x + rand(-1, 1), 0.05, a.z + rand(-0.8, 0.8), 0, rand(0.4, 1.0), 0, 0.5, 0.05, '#9aff6a', { grav: -0.4, drag: 1, mode: 1 });
    if (playerAlive() && Math.hypot(player.x - a.x, player.z - a.z) < a.r) {
      player.acidT = (player.acidT || 0) - dt;
      if (player.acidT <= 0) {
        player.acidT = 0.35; player.hp -= 3; hurtFlash = Math.max(hurtFlash, 0.3); hud.dirty = true;
        floaters.push({ x: player.x, y: 2.2, z: player.z, text: 'AXIT!', t: 0.6, color: '#9aff6a' });
        if (player.hp <= 0) playerDied();
      }
    }
    if (a.t <= 0) { scene.remove(a.mesh); a.mesh.geometry.dispose(); a.mesh.material.dispose(); acidPools.splice(i, 1); }
  }
}
function clearAcid() {
  for (const g of globs) { scene.remove(g.m); g.m.material.dispose(); }
  for (const a of acidPools) { scene.remove(a.mesh); a.mesh.geometry.dispose(); a.mesh.material.dispose(); }
  globs = []; acidPools = [];
}

// ================= THÀNH PHỐ NHIỀU KHU =================
// lưới 3 dãy phố × 4 khu; đi hết đường thì sang khu bên cạnh, vào hẻm phía sau lên dãy trên,
// rẽ ở ngã tư phía trước xuống dãy dưới. Co-op: cả đội cùng ở một khu, phải cùng ra một lối.
// 3 tầng trường (chương 0) nằm ngoài lưới phố nhưng vẫn phải có mã để co-op đồng bộ khu
const ZONE_IDS = [...GRID.flat(), ...Object.keys(ZONES).filter((k) => /^sf\d$/.test(k) && !GRID.flat().includes(k))];
const EXITS = [null, 'w', 'e', 'n', 's'];
const ENTRIES = ['start', 'w', 'e', 'n', 's', 'gate'];
const OPP = { w: 'e', e: 'w', n: 's', s: 'n' };
const ITEM_KEYS = Object.keys(ITEMS);
const zt = { busy: false, wait: '', target: null };
const zoneIdx = () => ZONE_IDS.indexOf(ZONE.id);
let corpseSprites = [], camReveal = 0;
// gợi ý đường đi tới một khu (tìm đường trên lưới các lối ra)
function routeHint(target) {
  if (ZONE.id === target) return '';
  const prev = new Map([[ZONE.id, null]]), q = [ZONE.id];
  while (q.length) {
    const id = q.shift();
    if (id === target) break;
    const L = zoneLinks(id);
    for (const k in L) if (!prev.has(L[k])) { prev.set(L[k], [id, k]); q.push(L[k]); }
  }
  if (!prev.has(target)) return '';
  let cur = target, step = null;
  while (prev.get(cur)) { step = prev.get(cur); if (step[0] === ZONE.id) break; cur = step[0]; }
  const name = ZONES[zoneLinks(ZONE.id)[step[1]]].name;
  return { e: `đi hết đường về phía đông → ${name}`, w: `← quay về phía tây: ${name}`, n: `vào hẻm phía sau ↑ ${name}`, s: `rẽ ở ngã tư phía trước ↓ ${name}` }[step[1]];
}
function placeAtEntry(entry) {
  const k = (net.active ? skinIdx : 0) * 0.7 - 1.0;
  const pad = ZONE.interior ? 2.6 : 1.4;
  const portal = world.buildings.find((b) => b.portal);
  if (entry === 'gate' && portal) { player.x = portal.door + k * 0.4; player.z = 0.4; }
  else if (entry === 'w') { player.x = BOUNDS.x0 + pad; player.z = (ZONE.interior ? 0.3 : 0.6) + k * 0.4; }
  else if (entry === 'e') { player.x = BOUNDS.x1 - pad; player.z = (ZONE.interior ? 0.3 : 0.6) + k * 0.4; }
  else if (entry === 'n' && ZONE.alley !== undefined) { player.x = ZONE.alley + k * 0.5; player.z = ZB + 1.6; }
  else if (entry === 's' && ZONE.cross !== undefined) { player.x = ZONE.cross + k * 0.5; player.z = BOUNDS.z1 - 0.7; }
  else { player.x = ((ZONE.start && ZONE.start.x) ?? 0) + k; player.z = (ZONE.start && ZONE.start.z) ?? 1.0; }
  player.exit = null;
  camTarget.x = clamp(player.x, BOUNDS.x0 + 9, BOUNDS.x1 - 9);
}
function disposeWorld(w) {
  scene.remove(w.root);
  const mats = new Set();
  w.root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    for (const m of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) mats.add(m);
    if (o.isReflector && o.dispose) o.dispose();
  });
  const texs = new Set();
  for (const m of mats) {
    for (const k in m) { const v = m[k]; if (v && v.isTexture) texs.add(v); }
    if (m.uniforms) for (const k in m.uniforms) { const v = m.uniforms[k] && m.uniforms[k].value; if (v && v.isTexture) texs.add(v); }
    m.dispose();
  }
  for (const t of texs) t.dispose();
}
function makeCorpseProps() {
  for (const sp of corpseSprites) scene.remove(sp.group);
  corpseSprites = [];
  for (const c of world.containers) if (c.corpse) {
    const sp = makeSprite([SPR.zombies[c.label === 'Xác lính' ? 'soldier' : 'walker'][c.x > 0 ? 1 : 0]], '#ff4a4a');
    // xác nằm ngang (song song mặt đường) để nhìn rõ là người nằm
    setFrame(sp, sp.is3d ? 'right' : 'down', 0);
    sp.mesh.rotation.x = -Math.PI / 2; sp.xr.visible = false; sp.blob.visible = false;
    sp.mat.color.setRGB(0.75, 0.7, 0.7);
    if (sp.is3d) sp.group.position.set(c.x + sp.h / 2, 0.03, c.z);
    else sp.group.position.set(c.x, 0.03, c.z + sp.h / 2);
    corpseSprites.push(sp);
  }
}
// dựng (lại) thế giới cho khu hiện tại và nối các hệ thống phụ thuộc vào nó
function buildZoneWorld() {
  world = buildWorld(scene, quality);
  for (const m of reflHide) world.hideInReflection.push(m);
  navBuild(); computeTerraceSegs();
  if (SPR) makeCorpseProps();
  if (fx.crows) { fx.crows.perches = world.perches; for (const b of fx.crows.birds) { b.state = 'gone'; b.perch = null; b.t = rand(1, 6); b.mesh.visible = false; } }
  if (fx.cones) { scene.remove(fx.cones.mesh); fx.cones.mesh.geometry.dispose(); fx.cones.mesh.material.dispose(); fx.cones = new LampCones(scene, world.lampHeads); }
  if (fx.decals) { fx.decals.clear(); for (const c of world.containers) if (c.corpse) fx.decals.add(c.x, c.z, 1.9); }
}
function loadZone(id, entry) {
  clearFlowers(); clearDrops(); clearAcid(); clearFire(); clearMines(); player.pinned = 0;
  for (const z of zombies) releaseSprite(z);
  zombies = []; bullets = []; net.zmap.clear();
  for (const p of pickups) scene.remove(p.mesh);
  pickups = [];
  disposeWorld(world);
  setZone(id);
  enterZoneHook(id);
  buildZoneWorld();
  if (power) applyPowerVisual();
  if (Q.armory) unlockArmory(false);
  curBuilding = null; interact.target = null; interact.t = 0; player.action = null; player.searching = false;
  camReveal = 0;
  if (player.zombie) { placeAtEntry(entry); turnZombiePlace(); } else placeAtEntry(entry);
  if (!net.active || net.host) placeBots(); else { for (const v of botViews.values()) scene.remove(v.sp.group); botViews.clear(); }
  if (state.mode === 'play' && (!net.active || net.host) && !(calmNow() && isFloor(id))) {
    spawnLurkers();
    for (let i = 0; i < (phase === 'night' ? 1 : 2); i++) spawnStray();
    if (phase === 'night' && Math.random() < 0.4) spawnWeeper();
    if (net.active) loadHostDrops();
  }
  if (!net.active) loadHostDrops();
  hud.dirty = true;
  sound.generator(power && !!world.pois.generator);
  afterZoneLoad(id);
  showMsg(ZONE.short ? ZONE.short.toUpperCase() : ZONE.name.toUpperCase(), ZONE.short ? 'Trường Quốc tế Vân Lâm' : '');
  if (!net.active) saveT = Math.min(saveT, 3);
  setTimeout(() => storyZone(id), 450);
}
function zoneSubtitle() {
  const L = ZONE.links || {};
  const parts = [];
  if (L.w) parts.push('← ' + L.w);
  if (L.e) parts.push(L.e + ' →');
  if (L.n) parts.push('hẻm ↑ ' + L.n);
  if (L.s) parts.push('ngã tư ↓ ' + L.s);
  return parts.join(' · ');
}
// làm mờ màn hình rồi chuyển khu (solo, chủ phòng, hoặc khách theo ảnh chụp của chủ phòng)
function requestZone(id, entry) {
  if (zt.busy || !ZONES[id]) return;
  zt.busy = true; zt.target = id;
  $('zfade').classList.add('on');
  setTimeout(() => {
    try { loadZone(id, entry); } catch (e) { console.error(e); }
    zt.target = null;
    setTimeout(() => { $('zfade').classList.remove('on'); zt.busy = false; }, 80);
  }, 360);
}
function exitAt(mx, mz) {
  const L = ZONE.linkIds || {};
  if (L.w && player.x <= BOUNDS.x0 + 0.4 && mx < -0.3) return 'w';
  if (L.e && player.x >= BOUNDS.x1 - 0.4 && mx > 0.3) return 'e';
  if (L.n && ZONE.alley !== undefined && Math.abs(player.x - ZONE.alley) < 1.35 && player.z < ZB + 1.6 && mz < -0.3) return 'n';
  if (L.s && ZONE.cross !== undefined && Math.abs(player.x - ZONE.cross) < 1.35 && player.z > BOUNDS.z1 + 0.8 && mz > 0.3) return 's';
  return null;
}
// đứng ở lối ra: solo thì đi luôn; co-op thì chờ cả đội cùng tới lối đó (chủ phòng quyết định)
function updateExit(mx, mz) {
  player.exit = zt.busy ? null : exitAt(mx, mz);
  zt.wait = '';
  if (player.exit && ZONE.gateLock === player.exit && !Q.gateCut) player.exit = null;
  if (!player.exit) return;
  const to = ZONE.linkIds[player.exit];
  if (!net.active) { requestZone(to, entryFor(player.exit, to)); return; }
  let ready = 1, total = 1;
  for (const rp of net.players.values()) { if (!rp.inited || !rp.here || rp.flags & (8 | 16 | 128)) continue; total++; if (rp.exit === player.exit) ready++; }
  if (ready < total) { zt.wait = `Chờ cả đội ra lối này (${ready}/${total}) → ${ZONES[to].name}`; return; }
  if (net.host) { const en = entryFor(player.exit, to); net.zoneSeq = (net.zoneSeq || 0) + 1; net.zoneEntry = en; net.zoneSeqSeen = net.zoneSeq; requestZone(to, en); }
}
// zombie (người chơi hoá zombie) xuất hiện ở chỗ bất kỳ trong khu mới
function turnZombiePlace() {
  for (let k = 0; k < 30; k++) {
    const x = rand(BOUNDS.x0 + 3, BOUNDS.x1 - 3), z = rand(WALL_Z + 0.6, BOUNDS.z1 - 0.6);
    if (!insideSolid(x, z, 0.45) && Math.abs(x - player.x) > 12) { player.x = x; player.z = z; return; }
  }
}

// ---------- bản đồ thành phố ----------
let mapOpen = false;
function toggleMap(force) {
  if (state.mode !== 'play') return;
  mapOpen = force !== undefined ? force : !mapOpen;
  $('citymap').classList.toggle('hidden', !mapOpen);
  if (!net.active) state.paused = mapOpen || bagOpen;
  if (mapOpen) renderMap();
}
// ---------- bản đồ khu hiện tại (minimap trên HUD và bản đồ lớn) ----------
const MM = { t: 0, big: 0 };
function bldColor(b) {
  if (b.kind === 'police') return '#34467a';
  if (b.kind === 'pharmacy' || b.kind === 'infirmary') return '#2a6a44';
  if (b.kind === 'classroom' || b.kind === 'guardroom' || b.kind === 'canteen' || b.kind === 'club') return '#7a6634';
  if (b.shop || b.shopLike) return '#6e4634';
  return '#4c4656';
}
function drawZoneMap(g, W, H, x0, x1, big) {
  const zTop = ZB - (big ? 2.6 : 0.6), zBot = BOUNDS.z1 + 1.4;
  const sx = (x) => ((x - x0) / (x1 - x0)) * W, sz = (z) => ((z - zTop) / (zBot - zTop)) * H;
  const u = H / 60;
  g.fillStyle = '#121016'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#262430'; g.fillRect(0, sz(WALL_Z), W, H - sz(WALL_Z));
  g.fillStyle = '#302e38'; g.fillRect(0, sz(WALL_Z), W, sz(WALL_Z + 1.9) - sz(WALL_Z));
  g.fillStyle = 'rgba(220,200,140,0.28)';
  for (let x = Math.ceil(x0 / 4) * 4; x < x1; x += 4) g.fillRect(sx(x), sz(2.0) - u * 0.5, Math.max(2, sx(x + 2) - sx(x)), Math.max(1, u));
  if (ZONE.alley !== undefined) { g.fillStyle = '#34303c'; g.fillRect(sx(ZONE.alley - 1.2), 0, sx(ZONE.alley + 1.2) - sx(ZONE.alley - 1.2), sz(WALL_Z)); }
  if (ZONE.cross !== undefined) { g.fillStyle = 'rgba(230,230,230,0.22)'; for (let k = 0; k < 4; k++) g.fillRect(sx(ZONE.cross - 1.3), sz(BOUNDS.z1 - 0.6) + k * u * 3, sx(ZONE.cross + 1.3) - sx(ZONE.cross - 1.3), u * 1.5); }
  g.font = `${Math.round(u * (big ? 6.5 : 9))}px VT323, monospace`; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const b of world.buildings) {
    if (b.x1 < x0 || b.x0 > x1 || b.alley) continue;
    const bx = sx(b.x0), bw = sx(b.x1) - bx, by = sz(ZB), bh = sz(WALL_Z) - by;
    const inside = curBuilding === b;
    g.fillStyle = bldColor(b); g.fillRect(bx, by, bw, bh);
    g.fillStyle = inside ? '#f2c14e' : 'rgba(255,255,255,0.16)'; g.fillRect(bx, by, bw, Math.max(1, u));
    g.fillStyle = '#e8d8a0'; g.fillRect(sx(b.door) - u * 1.4, sz(WALL_Z) - u * 2, u * 2.8, u * 2.6);
    if (big && b.name && g.measureText(b.name).width < bw - 6) { g.fillStyle = '#f1e6cf'; g.fillText(b.name, bx + bw / 2, by + bh * 0.55); }
  }
  if (world.pois.gate) { const gt = world.pois.gate; g.fillStyle = gt.state === 'open' ? '#8ad87a' : '#c8402a'; g.fillRect(sx(gt.x) - u * 2, sz(WALL_Z) - u * 6, u * 4, u * 3); }
  for (const c of world.containers) {
    if (c.x < x0 || c.x > x1) continue;
    const looted = player.looted.has(c.id);
    g.fillStyle = looted ? 'rgba(150,140,120,0.35)' : '#f2c14e';
    const r = big ? u * 1.3 : u * 1.6; g.fillRect(sx(c.x) - r, sz(c.z) - r, r * 2, r * 2);
  }
  for (const d of drops) { if (d.x < x0 || d.x > x1) continue; g.fillStyle = '#9ad8e8'; g.fillRect(sx(d.x) - u, sz(d.z) - u, u * 2, u * 2); }
  // lối ra
  const L = ZONE.linkIds || {};
  const arrow = (x, y, dir, label) => {
    g.fillStyle = '#7fe07f'; g.beginPath();
    const a = u * 4;
    if (dir === 'w') { g.moveTo(x, y); g.lineTo(x + a, y - a); g.lineTo(x + a, y + a); }
    else if (dir === 'e') { g.moveTo(x, y); g.lineTo(x - a, y - a); g.lineTo(x - a, y + a); }
    else if (dir === 'n') { g.moveTo(x, y); g.lineTo(x - a, y + a); g.lineTo(x + a, y + a); }
    else { g.moveTo(x, y); g.lineTo(x - a, y - a); g.lineTo(x + a, y - a); }
    g.closePath(); g.fill();
    if (big && label) { g.fillStyle = '#b8f0a8'; g.textAlign = dir === 'w' ? 'left' : dir === 'e' ? 'right' : 'center'; g.fillText(label, dir === 'w' ? x + a * 1.6 : dir === 'e' ? x - a * 1.6 : x, dir === 'n' ? y + a * 2.6 : dir === 's' ? y - a * 2.6 : y); g.textAlign = 'center'; }
  };
  const midY = sz(1.5);
  if (L.w && x0 <= BOUNDS.x0 + 1) arrow(sx(BOUNDS.x0) + u, midY, 'w', ZONES[L.w].name);
  if (L.e && x1 >= BOUNDS.x1 - 1) arrow(sx(BOUNDS.x1) - u, midY, 'e', ZONES[L.e].name);
  if (L.n && ZONE.alley !== undefined && ZONE.alley > x0 && ZONE.alley < x1) arrow(sx(ZONE.alley), u * 2, 'n', big ? '' : '');
  if (big && L.n && ZONE.alley !== undefined) { g.fillStyle = '#b8f0a8'; g.fillText('hẻm → ' + ZONES[L.n].name, sx(ZONE.alley), sz(ZB) - u * 3.5); }
  if (L.s && ZONE.cross !== undefined && ZONE.cross > x0 && ZONE.cross < x1) arrow(sx(ZONE.cross), H - u * 2, 's', 'ngã tư → ' + ZONES[L.s].name);
  // zombie: chỉ hiện con đã phát hiện mình, ở gần, hoặc khi Lycas hack camera
  for (const z of zombies) {
    if (z.state === 'dead' || z.x < x0 || z.x > x1) continue;
    const near = Math.hypot(z.x - player.x, z.z - player.z) < 13;
    if (!z.aggro && !near && !(camReveal > 0)) continue;
    const sp = z.type !== 'walker' && z.type !== 'runner';
    g.fillStyle = sp ? '#ff8a3a' : '#e8402e'; const r = (sp ? 2.2 : 1.6) * u;
    g.beginPath(); g.arc(sx(z.x), sz(z.z), r, 0, Math.PI * 2); g.fill();
  }
  for (const b of allBots()) { if (b.x < x0 || b.x > x1) continue; g.fillStyle = CHARS[b.ci].color; g.beginPath(); g.arc(sx(b.x), sz(b.z), u * 1.8, 0, Math.PI * 2); g.fill(); }
  if (net.active) for (const rp of net.players.values()) { if (!rp.inited || !rp.here || rp.x < x0 || rp.x > x1) continue; g.fillStyle = CHARS[rp.char || 0].color; g.beginPath(); g.arc(sx(rp.x), sz(rp.z), u * 2, 0, Math.PI * 2); g.fill(); }
  // bạn: mũi tên theo hướng nhìn + vòng sáng
  const px = sx(player.x), pz = sz(player.z), a = player.aim;
  const pulse = 1 + 0.25 * Math.sin(performance.now() / 180);
  g.strokeStyle = 'rgba(255,240,200,0.55)'; g.lineWidth = Math.max(1, u * 0.6); g.beginPath(); g.arc(px, pz, u * 4.2 * pulse, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#fff6dc'; g.beginPath();
  g.moveTo(px + Math.cos(a) * u * 3.6, pz + Math.sin(a) * u * 3.6 * 0.8);
  g.lineTo(px + Math.cos(a + 2.5) * u * 2.6, pz + Math.sin(a + 2.5) * u * 2.6 * 0.8);
  g.lineTo(px + Math.cos(a - 2.5) * u * 2.6, pz + Math.sin(a - 2.5) * u * 2.6 * 0.8);
  g.closePath(); g.fill(); g.strokeStyle = '#000'; g.lineWidth = 1; g.stroke();
  if (big) { g.fillStyle = '#f2c14e'; g.font = `${Math.round(u * 7)}px VT323, monospace`; g.fillText('BẠN', px, pz - u * 7); }
}
function drawMinimap() {
  const cv = $('minimap');
  if (!cv || !world) return;
  const g = cv.getContext('2d');
  const span = 70, x0 = clamp(player.x - span / 2, BOUNDS.x0 - 1, BOUNDS.x1 + 1 - span), x1 = x0 + span;
  drawZoneMap(g, cv.width, cv.height, x0, x1, false);
  g.strokeStyle = 'rgba(217,192,138,0.6)'; g.lineWidth = 2; g.strokeRect(1, 1, cv.width - 2, cv.height - 2);
}
function drawBigZone() {
  const cv = $('map-zone');
  if (!cv) return;
  drawZoneMap(cv.getContext('2d'), cv.width, cv.height, BOUNDS.x0 - 1, BOUNDS.x1 + 1, true);
}
function renderMap() {
  const CW = 150, CH = 86, PAD = 22, W2 = GRID[0].length * CW + PAD * 2, H2 = GRID.length * CH + PAD * 2;
  const cx = (c) => PAD + c * CW + CW / 2, cy = (r) => PAD + r * CH + CH / 2;
  let svg = `<svg viewBox="0 0 ${W2} ${H2}" width="100%" style="max-width:${W2}px" xmlns="http://www.w3.org/2000/svg" font-family="VT323, monospace">`;
  // đường nối
  GRID.forEach((row, r) => row.forEach((id, c) => {
    const L = zoneLinks(id);
    if (L.e) svg += `<line x1="${cx(c)}" y1="${cy(r)}" x2="${cx(c + 1)}" y2="${cy(r)}" stroke="#6a6258" stroke-width="10"/>`;
    if (L.s) svg += `<line x1="${cx(c)}" y1="${cy(r)}" x2="${cx(c)}" y2="${cy(r + 1)}" stroke="#6a6258" stroke-width="8" stroke-dasharray="10 5"/>`;
  }));
  GRID.forEach((row, r) => row.forEach((id, c) => {
    const here = id === ZONE.id, dt = id === 'downtown';
    const fill = here ? '#5a4a1e' : dt ? '#3a1e1e' : '#1e1c24';
    svg += `<rect x="${cx(c) - CW / 2 + 8}" y="${cy(r) - CH / 2 + 8}" width="${CW - 16}" height="${CH - 16}" fill="${fill}" stroke="${here ? '#f2c14e' : dt ? '#c8402a' : '#4a4652'}" stroke-width="${here ? 3 : 2}"/>`;
    const name = ZONES[id].name;
    const words = name.split(' '), half = Math.ceil(words.length / 2);
    const l1 = words.length > 2 ? words.slice(0, half).join(' ') : name, l2 = words.length > 2 ? words.slice(half).join(' ') : '';
    svg += `<text x="${cx(c)}" y="${cy(r) - (l2 ? 4 : -4)}" fill="${here ? '#fff0c8' : '#d8d0c4'}" font-size="18" text-anchor="middle">${l1}</text>`;
    if (l2) svg += `<text x="${cx(c)}" y="${cy(r) + 14}" fill="${here ? '#fff0c8' : '#d8d0c4'}" font-size="18" text-anchor="middle">${l2}</text>`;
    if (here) svg += `<text x="${cx(c)}" y="${cy(r) + CH / 2 - 12}" fill="#f2c14e" font-size="15" text-anchor="middle">● BẠN ĐANG Ở ĐÂY</text>`;
    else if (dt) svg += `<text x="${cx(c)}" y="${cy(r) + CH / 2 - 12}" fill="#ff8a6a" font-size="15" text-anchor="middle">★ đồn cảnh sát · bãi đáp</text>`;
  }));
  svg += '</svg>';
  $('map-svg').innerHTML = svg;
  $('map-zone-name').textContent = ZONE.name.toUpperCase();
  drawBigZone();
  const hint = routeHint('downtown');
  $('map-note').textContent = (hint ? 'Đường tới Trung tâm: ' + hint : '') + (hint ? ' · ' : '') + 'chấm vàng: chỗ chưa lục · chấm đỏ: zombie · mũi tên xanh: lối sang khu khác';
}

// ---------- đèn pin, đuốc ----------
const torchLight = new THREE.PointLight('#ff9a4a', 0, 9, 1.6);
scene.add(torchLight);
function toggleFlashlight() {
  if (!(player.bag.flashlight > 0)) { lootFeed('flashlight', 'Chưa có đèn pin · tìm ở phòng bảo vệ, cửa hàng điện máy', true); return; }
  player.flashOn = !player.flashOn;
  if (player.flashOn && player.battery <= 0 && !consumeBattery()) { player.flashOn = false; return; }
  sound.reload(); hud.dirty = true;
}
function consumeBattery() {
  if (player.bag.battery > 0) { player.bag.battery--; player.battery = BATTERY_TIME * player.mod.battery; lootFeed('battery', 'Thay pin đèn pin'); hud.dirty = true; return true; }
  lootFeed('flashlight', 'Đèn pin hết pin · cần thêm Pin', true);
  return false;
}
const flashActive = () => player.bag.flashlight > 0 && player.flashOn && player.battery > 0;
const lightState = () => (flashActive() ? 1 : 0) | (player.torchT > 0 ? 2 : 0);
function updatePlayerLights(dt, A) {
  const dark = A.flash > 0.05;
  if (player.bag.flashlight > 0 && player.flashOn) {
    if (player.battery <= 0 && dark) { if (!consumeBattery()) player.flashOn = false; }
    else if (dark && state.mode === 'play') player.battery = Math.max(0, player.battery - dt);
  }
  if (player.torchT > 0 && state.mode === 'play') {
    player.torchT -= dt;
    if (player.torchT <= 0) { player.torchT = 0; lootFeed('torch', 'Đuốc đã tàn', true); hud.dirty = true; }
    const hx = player.x + Math.cos(player.aim) * 0.35, hz = player.z + Math.sin(player.aim) * 0.35 + 0.2;
    torchLight.position.set(hx, 1.55, hz);
    torchLight.intensity = (6 + 16 * Math.max(0.15, A.flash)) * (0.85 + 0.15 * Math.sin(gtime * 17) * Math.sin(gtime * 7.3));
    if (Math.random() < dt * 30) fx.ember.spawn(hx + rand(-0.06, 0.06), 1.62, hz, rand(-0.2, 0.2), rand(0.8, 1.6), rand(-0.1, 0.1), rand(0.4, 0.8), rand(0.05, 0.09), Math.random() < 0.5 ? '#ffb040' : '#ff6a20', { grav: -0.6, drag: 1.2, mode: 1 });
  } else torchLight.intensity = 0;
}

// ---------- vứt đồ cho người khác nhặt ----------
let drops = [], dropTmp = -1, dropSeq = 0, dropSpr = null;
const dropStore = {};   // chủ phòng/solo: đồ vứt của từng khu
function dropMesh(it) {
  const map = new THREE.CanvasTexture(iconCanvas[it]);
  map.magFilter = THREE.NearestFilter; map.minFilter = THREE.NearestFilter; map.colorSpace = THREE.SRGBColorSpace;
  const mat = spriteLit(new THREE.MeshLambertMaterial({ map, alphaTest: 0.5, side: THREE.DoubleSide, emissive: new THREE.Color(0.4, 0.4, 0.4), emissiveMap: map }));
  const geo = new THREE.PlaneGeometry(0.62, 0.62); geo.translate(0, 0.36, 0);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.quaternion.copy(camQuat);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(1.1, 0.95, 0.5), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  glow.scale.set(1.0, 1.0, 1); glow.position.set(0, 0.3, -0.05); mesh.add(glow);
  scene.add(mesh);
  return mesh;
}
function addDropLocal(d) {
  d.mesh = dropMesh(d.it); d.mesh.position.set(d.x, 0.02, d.z);
  drops.push(d);
  return d;
}
function removeDrop(d) { scene.remove(d.mesh); d.mesh.geometry.dispose(); d.mesh.material.map.dispose(); d.mesh.material.dispose(); drops.splice(drops.indexOf(d), 1); }
function clearDrops() { for (const d of [...drops]) removeDrop(d); }
function hostAddDrop(it, n, x, z, zone = zoneIdx()) {
  if (!ITEMS[it] || ITEMS[it].weapon !== undefined) return;
  const zid = ZONE_IDS[zone] || ZONE.id;
  const d = { id: ++dropSeq, it, n, x: clamp(x, BOUNDS.x0, BOUNDS.x1), z: clamp(z, BOUNDS.z0, BOUNDS.z1) };
  (dropStore[zid] = dropStore[zid] || []).push(d);
  if (zid === ZONE.id) addDropLocal({ ...d });
}
function loadHostDrops() { for (const d of dropStore[ZONE.id] || []) addDropLocal({ ...d }); }
function hostPickDrop(id, peer) {
  const list = dropStore[ZONE.id] || [];
  const k = list.findIndex((d) => d.id === id);
  if (k < 0) return;
  const d = list.splice(k, 1)[0];
  const local = drops.find((o) => o.id === id); if (local) removeDrop(local);
  if (peer === net.me || !net.active) giveItems([[d.it, d.n]], true);
  else net.grants.push([peer, ITEM_KEYS.indexOf(d.it), d.n, Date.now() % 1e9 + '_' + id]);
}
// khách: dựng đồ vứt theo ảnh chụp của chủ phòng
function syncDrops(list) {
  const seen = new Set();
  for (const a of list) {
    if (!Array.isArray(a)) continue;
    const id = a[0] | 0, it = ITEM_KEYS[a[1] | 0];
    if (!it || net.pickedDrops.has(id)) continue;
    seen.add(id);
    if (!drops.some((d) => d.id === id)) addDropLocal({ id, it, n: a[2] | 0, x: a[3] / 10, z: a[4] / 10 });
  }
  for (const d of [...drops]) if ((d.id > 0 && !seen.has(d.id)) || (d.id < 0 && list.length && drops.some((o) => o.id > 0 && o.it === d.it && Math.hypot(o.x - d.x, o.z - d.z) < 0.6))) removeDrop(d);
}
const DROP_CHUNK = { ammo9: 10, shells: 4, casing: 5 };
function dropItem(it) {
  const have = player.bag[it] || 0;
  if (!have || state.mode !== 'play' || player.zombie) return;
  const n = Math.min(have, DROP_CHUNK[it] || 1);
  player.bag[it] -= n;
  if (it === 'flashlight' && !player.bag.flashlight) player.flashOn = false;
  const x = player.x + Math.cos(player.aim) * 0.6, z = player.z + Math.sin(player.aim) * 0.4;
  if (!net.active || net.host) hostAddDrop(it, n, x, z);
  else { netEvent('dr', it, n, Math.round(x * 10), Math.round(z * 10)); addDropLocal({ id: dropTmp--, it, n, x, z }); }
  lootFeed(it, `Đã vứt ${n} ${ITEMS[it].name}`);
  sound.rustle(0.2); hud.dirty = true; renderBagIfOpen();
}
function pickDrop(d) {
  if (d.id < 0) { giveItems([[d.it, d.n]], true); removeDrop(d); return; }
  if (!net.active || net.host) { hostPickDrop(d.id, net.me); return; }
  net.pickedDrops.add(d.id);
  netEvent('pk', d.id);
  removeDrop(d);
}

// ---------- dùng đồ cho đồng đội ----------
function nearMates(r = 2.6) {
  const out = [];
  if (net.active) for (const rp of net.players.values()) if (rp.inited && rp.here && !(rp.flags & (8 | 16 | 128)) && Math.hypot(rp.x - player.x, rp.z - player.z) < r) out.push(rp);
  for (const b of allBots()) if (b.state === 'ok' && Math.hypot(b.x - player.x, b.z - player.z) < r) out.push({ peer: 'b' + b.ci, name: CHARS[b.ci].name, bot: true, flags: 0 });
  return out;
}
function giveTo(it, rp) {
  const def = ITEMS[it];
  const weap = rp.bot && (def.melee || it === 'bow');
  if ((!def.give && !weap) || !(player.bag[it] > 0) || player.action || state.mode !== 'play') return;
  if (it === 'antidote' && !(rp.flags & 64)) { lootFeed(it, `${rp.name} chưa nhiễm virus`, true); return; }
  if (rp.bot && !def.heal && !weap) { lootFeed(it, `${rp.name} (bot) không cần`, true); return; }
  player.action = { item: it, t: 0, dur: def.time || 0.6, target: rp.peer, targetName: rp.name, bot: !!rp.bot };
  player.reloading = 0;
  sound.use(def.use);
}
function receiveGift(it, rp, mul = 1) {
  const def = ITEMS[it];
  if (!def || !def.give) return;
  const who = rp && rp.name ? rp.name : 'Đồng đội';
  if (def.use === 'cure') { if (player.infected > 0) cureInfection(who); return; }
  applyItemEffect(it, mul);
  showMsg('ĐƯỢC GIÚP', `${who} đã dùng ${def.name.toLowerCase()} cho bạn`);
}
function applyItemEffect(it, mul = 1) {
  const def = ITEMS[it];
  if (def.heal) { const h = Math.round(def.heal * mul); player.hp = Math.min(player.maxHp, player.hp + h); floaters.push({ x: player.x, y: 2.3, z: player.z, text: `+${h} MÁU`, t: 1.2, color: '#7fe07f' }); }
  if (def.food) { player.food = Math.min(100, player.food + def.food); floaters.push({ x: player.x, y: 2.3, z: player.z, text: 'NO BỤNG', t: 1.0, color: '#e8a860' }); }
  if (def.water) { player.water = Math.min(100, player.water + def.water); floaters.push({ x: player.x, y: 2.3, z: player.z, text: 'HẾT KHÁT', t: 1.0, color: '#7ac8f0' }); }
  sound.pickup(); hud.dirty = true; renderBagIfOpen();
}

// ---------- chế đồ kiểu Minecraft: lưới 3×3, sách công thức ----------
const canCraft = (R) => Object.entries(R.need).every(([k, v]) => (player.bag[k] || 0) >= v);
const craftUI = { open: false, grid: Array(9).fill(null), sel: -1, tab: 'inv', focus: null, msg: '' };
// phím V / nút thuốc giải: chế nhanh nếu đã biết công thức
// súng, đạn, mìn tự chế: ai cũng chế được, chỉ cần đủ nguyên liệu (nhân vật nào cũng tự lo được)
const naryneHelp = () => 'me';
const naryneNote = () => 'Ai cũng chế được · cần ống thép, thuốc pháo, bi sắt, đinh, băng keo';
function craft(id) {
  const R = RECIPES.find((r) => r.id === id);
  if (!R || player.zombie || state.mode !== 'play') return;
  if (R.book === 'naryne' && !naryneHelp()) { lootFeed(R.out, naryneNote(), true); return; }
  if (R.book !== 'naryne' && !player.recipes.has(R.id) && !(R.id === 'antidote' && player.infected > 0)) { lootFeed(R.out, 'Chưa biết cách chế · tìm ' + BOOKS[R.book].name, true); return; }
  if (!canCraft(R)) { lootFeed(R.out, 'Thiếu ' + Object.keys(R.need).filter((k) => (player.bag[k] || 0) < R.need[k]).map((k) => ITEMS[k].name).join(' + '), true); return; }
  for (const [k, v] of Object.entries(R.need)) player.bag[k] -= v;
  finishCraft(R);
}
function craftOutN(R) {
  const M = player.mod;
  return R.out === 'antidote' ? M.antidoteOut : R.out === 'arrow' ? M.arrows : R.out === 'ammo9' ? R.n + M.ammoCraft : R.out === 'shells' ? R.n + Math.ceil(M.ammoCraft / 2) : R.n;
}
function finishCraft(R) {
  const got = addItem(R.out, craftOutN(R));
  if (ITEMS[R.out].melee && MELEE_ORDER.indexOf(R.out) < MELEE_ORDER.indexOf(player.melee)) equipMelee(R.out, true);
  if (!player.recipes.has(R.id)) { player.recipes.add(R.id); if (R.book !== 'naryne') showMsg('KHÁM PHÁ CÔNG THỨC MỚI', ITEMS[R.out].name); }
  lootFeed(R.out, `+${got || ''} ${ITEMS[R.out].name}`.replace('+ ', '+')); sound.unlock(); gainXP(4, true); hud.dirty = true;
  if (R.out === 'antidote' && player.infected > 0) useItem('antidote');
}
function matchRecipe() {
  const cnt = {};
  for (const it of craftUI.grid) if (it) cnt[it] = (cnt[it] || 0) + 1;
  const keys = Object.keys(cnt);
  if (!keys.length) return null;
  return RECIPES.find((R) => { const nk = Object.keys(R.need); return nk.length === keys.length && nk.every((k) => cnt[k] === R.need[k]); }) || null;
}
function gridReturn(i) { const it = craftUI.grid[i]; if (!it) return; player.bag[it] = (player.bag[it] || 0) + 1; craftUI.grid[i] = null; }
function gridClear() { for (let i = 0; i < 9; i++) gridReturn(i); craftUI.sel = -1; }
function gridPut(it) {
  if (!(player.bag[it] > 0)) return false;
  let i = craftUI.sel >= 0 && !craftUI.grid[craftUI.sel] ? craftUI.sel : craftUI.grid.indexOf(null);
  if (i < 0) { craftUI.msg = 'Lưới chế đã đầy'; return false; }
  player.bag[it]--; craftUI.grid[i] = it; craftUI.sel = -1;
  return true;
}
// chọn công thức trong sách: tự xếp nguyên liệu đang có vào lưới
function gridAuto(R) {
  gridClear();
  const miss = [];
  for (const [k, v] of Object.entries(R.need)) for (let n = 0; n < v; n++) if (!gridPut(k)) miss.push(ITEMS[k].name);
  craftUI.msg = miss.length ? 'Thiếu: ' + [...new Set(miss)].map((m) => m + ' ×' + miss.filter((x) => x === m).length).join(', ') : '';
}
function gridCraft() {
  const R = matchRecipe();
  if (!R) return;
  if (R.book === 'naryne') {
    const h = naryneHelp();
    if (!h) { craftUI.msg = naryneNote(); renderCraft(); return; }
  }
  if ((player.bag[R.out] || 0) >= capOf(R.out) && !ITEMS[R.out].weapon) { craftUI.msg = 'Túi đã đầy ' + ITEMS[R.out].name.toLowerCase(); renderCraft(); return; }
  craftUI.grid.fill(null);
  finishCraft(R);
  craftUI.msg = '';
  renderCraft();
}
function toggleCraft(force) {
  if (state.mode !== 'play' || player.zombie) return;
  const open = force !== undefined ? force : !craftUI.open;
  if (!open) gridClear();
  craftUI.open = open;
  $('craft').classList.toggle('hidden', !open);
  if (!net.active) state.paused = open || bagOpen || mapOpen || skillsOpen;
  if (open) { if (bagOpen) toggleBag(false); craftUI.msg = ''; renderCraft(); }
}
function openBook(book) { toggleCraft(true); craftUI.tab = 'book'; craftUI.focus = book; renderCraft(); }
function slotEl(it, n, cls = '') {
  const d = document.createElement('button');
  d.className = 'cslot ' + cls;
  if (it) d.innerHTML = `<img alt="" src="${ICON[it]}">` + (n > 1 ? `<b>${n}</b>` : '');
  if (it) d.title = ITEMS[it].name;
  return d;
}
function renderCraft() {
  if (!craftUI.open) return;
  const grid = $('cr-grid');
  grid.innerHTML = '';
  craftUI.grid.forEach((it, i) => {
    const d = slotEl(it, 1, craftUI.sel === i ? 'sel' : '');
    d.addEventListener('click', () => { if (craftUI.grid[i]) gridReturn(i); else craftUI.sel = craftUI.sel === i ? -1 : i; craftUI.msg = ''; renderCraft(); });
    grid.appendChild(d);
  });
  const R = matchRecipe();
  const out = $('cr-out');
  out.innerHTML = '';
  const od = slotEl(R ? R.out : null, R ? craftOutN(R) : 0, R ? 'out ready' : 'out');
  od.addEventListener('click', gridCraft);
  out.appendChild(od);
  $('cr-go').disabled = !R;
  $('cr-name').textContent = R ? (R.book === 'naryne' ? ITEMS[R.out].name + (naryneHelp() ? '' : ' · cần Naryne') : player.recipes.has(R.id) ? ITEMS[R.out].name : ITEMS[R.out].name + ' · công thức mới!') : craftUI.grid.some(Boolean) ? 'Chưa ra món nào…' : 'Đặt nguyên liệu vào lưới';
  $('cr-msg').textContent = craftUI.msg;
  document.querySelectorAll('#craft .crtab').forEach((b) => b.classList.toggle('on', b.dataset.tab === craftUI.tab));
  const inv = $('cr-inv'), book = $('cr-book');
  inv.classList.toggle('hidden', craftUI.tab !== 'inv'); book.classList.toggle('hidden', craftUI.tab !== 'book');
  if (craftUI.tab === 'inv') {
    inv.innerHTML = '';
    const list = ITEM_ORDER.filter((it) => (player.bag[it] || 0) > 0 && !ITEMS[it].book && !ITEMS[it].quest);
    if (!list.length) inv.innerHTML = '<div class="cr-empty">Túi trống · đi lục lọi các phòng để tìm nguyên liệu</div>';
    for (const it of list) {
      const d = slotEl(it, player.bag[it]);
      d.addEventListener('click', () => { craftUI.msg = ''; gridPut(it); renderCraft(); });
      inv.appendChild(d);
    }
  } else {
    book.innerHTML = '';
    for (const key of Object.keys(BOOKS)) {
      const B = BOOKS[key], nar = key === 'naryne', known = nar || player.books.has(key);
      const sec = document.createElement('div');
      sec.className = 'crb' + (craftUI.focus === key ? ' focus' : '');
      sec.innerHTML = `<h4><img alt="" src="${ICON[B.item]}"> ${B.name}</h4>` + (nar ? `<div class="crnote">${naryneNote()}</div>` : '');
      for (const R of RECIPES.filter((r) => r.book === key)) {
        const learned = nar || player.recipes.has(R.id);
        const row = document.createElement('button');
        row.className = 'crr' + (learned && canCraft(R) ? ' can' : '') + (learned ? '' : ' unk');
        if (learned) row.innerHTML = `<img alt="" src="${ICON[R.out]}"><span><b>${ITEMS[R.out].name}${R.n > 1 ? ' ×' + craftOutN(R) : ''}</b><br>` + Object.entries(R.need).map(([k, v]) => `<i class="${(player.bag[k] || 0) >= v ? 'ok' : 'no'}"><img alt="" src="${ICON[k]}">${ITEMS[k].name} ${player.bag[k] || 0}/${v}</i>`).join(' ') + '</span>';
        else row.innerHTML = `<span class="q">?</span><span><b>???</b><br><small>${known ? 'Chưa học' : 'Tìm sách ở ' + B.where}</small></span>`;
        if (learned) row.addEventListener('click', () => { gridAuto(R); craftUI.tab = 'inv'; renderCraft(); });
        sec.appendChild(row);
      }
      book.appendChild(sec);
    }
    if (craftUI.focus) { const f = book.querySelector('.crb.focus'); if (f) f.scrollIntoView({ block: 'nearest' }); craftUI.focus = null; }
  }
}

// ---------- mìn tự chế: đặt xuống đất, zombie bước tới thì nổ ----------
let mines = [];
const mineGeo = new THREE.CylinderGeometry(0.22, 0.26, 0.12, 10), mineMat = new THREE.MeshLambertMaterial({ color: '#4a5a3a' });
function placeMine() {
  if (!(player.bag.mine > 0) || state.mode !== 'play' || player.zombie || player.pinned || player.action || curBuilding && curBuilding.portal) return;
  player.bag.mine--;
  const a = player.aim, x = clamp(player.x + Math.cos(a) * 0.9, BOUNDS.x0 + 0.3, BOUNDS.x1 - 0.3), z = clamp(player.z + Math.sin(a) * 0.9, BOUNDS.z0 + 0.2, BOUNDS.z1 - 0.2);
  const g = new THREE.Group();
  const body = new THREE.Mesh(mineGeo, mineMat); body.position.y = 0.06; body.castShadow = true; g.add(body);
  const led = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 0.06), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 0.3, 0.2) }));
  led.position.y = 0.14; g.add(led);
  g.position.set(x, 0, z); scene.add(g);
  mines.push({ x, z, g, led, t: 0 });
  lootFeed('mine', 'Đã đặt mìn · tránh xa 3 m');
  sound.use('heal'); hud.dirty = true; renderBagIfOpen();
}
function clearMines() { for (const m of mines) scene.remove(m.g); mines = []; }
function updateMines(dt) {
  for (let i = mines.length - 1; i >= 0; i--) {
    const m = mines[i];
    m.t += dt;
    m.led.visible = m.t < 1.5 ? Math.floor(m.t * 8) % 2 === 0 : Math.floor(gtime * 2) % 2 === 0;
    if (m.t < 1.5) continue;   // chờ kích hoạt
    const trig = zombies.some((z) => z.state !== 'dead' && (z.y || 0) <= 0.3 && Math.hypot(z.x - m.x, z.z - m.z) < 1.1);
    if (!trig) continue;
    scene.remove(m.g); mines.splice(i, 1);
    for (const z of zombies) {
      if (!hittable(z)) continue;
      const d = Math.hypot(z.x - m.x, z.z - m.z);
      if (d < 3.2) damageZombie(z, Math.round(150 * (1 - d / 3.2) + 30), Math.atan2(z.z - m.z, z.x - m.x), 1.4);
    }
    const dp = Math.hypot(player.x - m.x, player.z - m.z);
    if (dp < 2.6 && playerAlive() && !player.zombie && player.inv <= 0) {
      player.hp -= Math.round(35 * (1 - dp / 2.6)) + 5; player.inv = 0.4; hurtFlash = 0.6; sound.hurt(); hud.dirty = true;
      floaters.push({ x: player.x, y: 2.3, z: player.z, text: 'BỊ NỔ!', t: 0.9, color: '#ff8a6a' });
      if (player.hp <= 0) playerDied();
    }
    for (let k = 0; k < 26; k++) { const an = Math.random() * TAU, sp = rand(3, 9); fx.spark.spawn(m.x, 0.3, m.z, Math.cos(an) * sp, rand(2, 7), Math.sin(an) * sp * 0.7, rand(0.2, 0.5), rand(0.06, 0.12), Math.random() < 0.5 ? '#ffd890' : '#ff7a2a', { grav: 9, drag: 2, mode: 1 }); }
    for (let k = 0; k < 14; k++) fx.smoke.spawn(m.x + rand(-0.6, 0.6), 0.4, m.z + rand(-0.5, 0.5), rand(-0.5, 0.5), rand(1, 2.4), rand(-0.3, 0.3), rand(1.5, 2.6), rand(0.5, 0.9), new THREE.Color(0.18, 0.16, 0.14), { grav: -0.1, drag: 0.6, mode: 2 });
    muzzleLight.position.set(m.x, 1, m.z); muzzleLight.intensity = 80; muzzleT = 0.12;
    shake = Math.max(shake, 0.5); sound.boom(0.6); makeNoise(m.x, m.z, 25);
    fx.decals.add(m.x, m.z, 1.4);
  }
}
// ---------- bom xăng: ném ra một vùng lửa ----------
let firePools = [];
function throwMolotov() {
  if (!(player.bag.molotov > 0) || state.mode !== 'play' || player.zombie || player.pinned || player.action) return;
  player.bag.molotov--;
  let dist = 7;
  if (!isTouch && mouse.has) { const p2 = aimPoint(mouse.x, mouse.y); if (p2) dist = clamp(Math.hypot(p2.x - player.x, p2.z - player.z), 2.5, 9); }
  const tx = clamp(player.x + Math.cos(player.aim) * dist, BOUNDS.x0, BOUNDS.x1), tz = clamp(player.z + Math.sin(player.aim) * dist * 0.85, BOUNDS.z0, BOUNDS.z1);
  const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(2.2, 1.2, 0.4), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  m.scale.set(0.45, 0.45, 1); scene.add(m);
  globs.push({ x0: player.x, z0: player.z, x1: tx, z1: tz, t: 0, d: 0.7, m, fire: true });
  sound.swing(false); hud.dirty = true; renderBagIfOpen();
}
// vùng lửa: chủ phòng/solo gây sát thương zombie; mọi máy tự trừ máu người chơi của mình
function firePool(x, z, host) {
  if (host && net.active && net.host) netEvent('fp', Math.round(x * 10), Math.round(z * 10));
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(1.7, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 0.7, 0.15), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
  mesh.rotation.x = -Math.PI / 2; mesh.position.set(x, 0.04, z); scene.add(mesh); hideRefl(mesh);
  const e = { pos: new THREE.Vector3(x, 1.0, z + 0.2), color: new THREE.Color('#ff8a36'), base: 14, dist: 9, kind: 'fire', flicker: 'fire', phase: Math.random() * 100, cur: 0, w: 0 };
  world.emitters.push(e);
  firePools.push({ x, z, r: 1.7, t: 7, mesh, e, host: !net.active || net.host });
  if (!net.active || net.host) makeNoise(x, z, 12);
  sound.hit(x, z); shake = Math.max(shake, Math.abs(x - camTarget.x) < 15 ? 0.25 : 0);
}
function updateFire(dt) {
  for (let i = firePools.length - 1; i >= 0; i--) {
    const f = firePools[i];
    f.t -= dt;
    f.mesh.material.opacity = Math.min(0.55, f.t * 0.3) * (0.8 + 0.2 * Math.sin(gtime * 13 + f.x));
    for (let k = 0; k < 3; k++) if (Math.random() < dt * 40) fx.ember.spawn(f.x + rand(-1.4, 1.4), 0.1, f.z + rand(-1.1, 1.1), rand(-0.3, 0.3), rand(1.2, 2.6), rand(-0.2, 0.2), rand(0.4, 0.9), rand(0.06, 0.12), Math.random() < 0.5 ? '#ffb040' : '#ff5a1a', { grav: -0.8, drag: 1.2, mode: 1 });
    if (Math.random() < dt * 6) fx.smoke.spawn(f.x + rand(-1, 1), 0.6, f.z + rand(-0.8, 0.8), rand(-0.2, 0.2), rand(0.6, 1.0), 0, rand(2, 3), rand(0.3, 0.5), new THREE.Color(0.2, 0.18, 0.16), { grav: -0.05, drag: 0.4, mode: 2 });
    if (f.host) for (const z of zombies) {
      if (z.state === 'dead' || z.y > 0.3) continue;
      if (Math.hypot(z.x - f.x, z.z - f.z) < f.r + z.r * 0.5) { z.burnT = 3; }
    }
    if (playerAlive() && Math.hypot(player.x - f.x, player.z - f.z) < f.r) {
      player.fireT = (player.fireT || 0) - dt;
      if (player.fireT <= 0) { player.fireT = 0.4; player.hp -= 4; hurtFlash = Math.max(hurtFlash, 0.3); hud.dirty = true; floaters.push({ x: player.x, y: 2.2, z: player.z, text: 'BỎNG!', t: 0.6, color: '#ff8a4a' }); if (player.hp <= 0) playerDied(); }
    }
    if (f.t <= 0) { scene.remove(f.mesh); f.mesh.geometry.dispose(); f.mesh.material.dispose(); f.e.base = 0; const j = world.emitters.indexOf(f.e); if (j >= 0) world.emitters.splice(j, 1); firePools.splice(i, 1); }
  }
  // zombie đang cháy: mất máu liên tục, chạy loạn
  if (!net.active || net.host) for (const z of zombies) {
    if (!(z.burnT > 0) || z.state === 'dead') continue;
    z.burnT -= dt; z.burnDmg = (z.burnDmg || 0) + dt * 32;
    if (Math.random() < dt * 25) fx.ember.spawn(z.x + rand(-0.2, 0.2), rand(0.4, 1.6), z.z, rand(-0.3, 0.3), rand(0.8, 1.6), 0, 0.5, 0.08, '#ff7a2a', { grav: -0.6, drag: 1, mode: 1 });
    if (z.burnDmg >= 8) { const d = Math.floor(z.burnDmg); z.burnDmg -= d; damageZombie(z, d, rand(0, TAU), 0, z.x, z.z, true); }
  }
}
function clearFire() {
  for (const f of firePools) { scene.remove(f.mesh); f.mesh.geometry.dispose(); f.mesh.material.dispose(); }
  firePools = [];
}


// ================= NHÂN VẬT: CHỌN, KỸ NĂNG =================
function pickChar(ci) {
  myChar = clamp(ci | 0, 0, CHARS.length - 1);
  store.set('deadnight_char', String(myChar));
  if (bench === myChar) { bench = -1; fixBench(); store.set('deadnight_bench', String(bench)); }
  if (net.room) { if (!net.host) net.ready = false; net.room.presence({ c: myChar, r: net.ready ? 1 : 0 }).catch(() => {}); }
  renderRoom(); renderCharSel();
}
function charCard(ci, taken, compact) {
  const c = CHARS[ci], d = document.createElement('button');
  d.className = 'cc' + (ci === myChar ? ' on' : '') + (taken ? ' taken' : '') + (compact ? ' compact' : '');
  d.disabled = !!taken;
  const cv = charPortrait(ci, c.pal, compact ? 2 : 3);
  cv.className = 'cp';
  d.appendChild(cv);
  const t = document.createElement('div');
  t.className = 'ct';
  const prog = loadProgress(ci);
  t.innerHTML = `<b style="color:${c.color}">${c.name}</b> <span class="nat">(${c.nat})</span><br><span class="stat"><i class="role">${c.role} · </i>♥${c.hp} · ${c.speed >= 4.6 ? 'nhanh' : c.speed <= 4.1 ? 'chậm' : 'vừa'}</span>` + (compact ? '' : `<br><small>${c.desc}</small>`) + (taken ? `<br><em>${taken} đã chọn</em>` : '');
  d.appendChild(t);
  if (!compact) {
    fixBench();
    d.classList.toggle('benched', ci === bench);
    const chip = document.createElement('span');
    chip.className = 'tchip ' + (ci === myChar ? 'me' : ci === bench ? 'out' : 'in');
    chip.textContent = ci === myChar ? 'BẠN' : ci === bench ? 'Ở LẠI' : 'ĐI CÙNG';
    chip.title = ci === myChar ? 'Nhân vật của bạn' : ci === bench ? 'Không đi cùng đội' : 'Bấm để cho người này ở lại';
    chip.addEventListener('click', (e) => { e.stopPropagation(); if (ci === myChar || ci === bench) return; bench = ci; store.set('deadnight_bench', String(bench)); renderCharSel(); });
    d.appendChild(chip);
  }
  d.addEventListener('click', () => pickChar(ci));
  return d;
}
function renderCharPick(el, taken = new Map()) {
  if (!el) return;
  el.innerHTML = '';
  CHARS.forEach((c, i) => el.appendChild(charCard(i, taken.get(i), true)));
}
function renderCharSel() {
  const el = $('cs-grid');
  if (!el || $('charsel').classList.contains('hidden')) return;
  el.innerHTML = '';
  CHARS.forEach((c, i) => el.appendChild(charCard(i, null, false)));
  const c = CHARS[myChar];
  const mates = teamIdx().filter((i) => i !== myChar).map((i) => `<b style="color:${CHARS[i].color}">${CHARS[i].name}</b>`).join(', ');
  $('cs-desc').innerHTML = `<b style="color:${c.color}">${c.name}</b> (${c.nat}) · ${c.role} · ♥${c.hp}<br>${c.desc}`;
  $('cs-team').innerHTML = `ĐỘI 4/5 · đi cùng: ${mates} · ở lại: <b style="color:${CHARS[bench].color}">${CHARS[bench].name}</b> <span>· bấm nhãn ĐI CÙNG trên thẻ để đổi người ở lại</span>`;
}
function openCharSel() { $('title').classList.add('hidden'); $('charsel').classList.remove('hidden'); renderCharSel(); }
function closeCharSel() { $('charsel').classList.add('hidden'); if (state.mode === 'title') $('title').classList.remove('hidden'); }

// ---------- cây kỹ năng ----------
let skillsOpen = false;
function toggleSkills(force) {
  if (state.mode !== 'play') return;
  skillsOpen = force !== undefined ? force : !skillsOpen;
  $('skills').classList.toggle('hidden', !skillsOpen);
  if (!net.active) state.paused = skillsOpen || bagOpen || mapOpen;
  if (skillsOpen) renderSkills();
}
function renderSkills() {
  const c = CHARS[player.char];
  $('sk-title').textContent = `${c.name.toUpperCase()} · CẤP ${player.level}`;
  $('sk-xp').innerHTML = `Kinh nghiệm ${player.xp}/${xpNeed(player.level)} · <b style="color:var(--gold)">${player.sp} điểm kỹ năng</b> · ${c.role}: ${c.desc}`;
  const grid = $('sk-grid');
  grid.innerHTML = '';
  for (const br of SKILLS[c.id]) {
    const col = document.createElement('div'); col.className = 'skb';
    col.innerHTML = `<h3>${br.name}</h3>` + (br.locked ? `<div class="sk-lock">${br.locked}</div>` : '');
    br.nodes.forEach((n, i) => {
      const have = player.learned.has(n.id), prev = i === 0 || player.learned.has(br.nodes[i - 1].id);
      const can = !br.locked && !have && prev && player.sp > 0;
      const b = document.createElement('button');
      b.className = 'skn' + (have ? ' have' : can ? ' can' : '');
      b.disabled = !can;
      b.innerHTML = `<b>${have ? '✓ ' : ''}${n.name}</b><br><small>${n.desc}</small>`;
      b.addEventListener('click', () => {
        if (!can) return;
        player.sp--; player.learned.add(n.id);
        applyMods(); saveProgress(); sound.unlock(); renderSkills();
        lootFeed(null, `Đã học: ${n.name}`);
      });
      col.appendChild(b);
    });
    grid.appendChild(col);
  }
}
// Hamble: húc văng zombie xung quanh (cần học kỹ năng)
function shove() {
  if (!player.mod.shove || state.mode !== 'play' || player.zombie || player.pinned) return;
  if (player.shoveT > 0) { lootFeed(null, `Húc lại sau ${Math.ceil(player.shoveT)} giây`, true); return; }
  player.shoveT = 7 * player.mod.shoveCd;
  shake = Math.max(shake, 0.4); sound.hit(player.x, player.z);
  for (let i = 0; i < 18; i++) { const a = (i / 18) * TAU; fx.lit.spawn(player.x + Math.cos(a) * 0.8, 0.2, player.z + Math.sin(a) * 0.5, Math.cos(a) * 4, rand(0.5, 1.5), Math.sin(a) * 3, 0.6, 0.12, '#8a7a62', { grav: 3, drag: 3 }); }
  if (net.active && !net.host) netEvent('shv', Math.round(player.x * 10), Math.round(player.z * 10));
  else shoveAt(player.x, player.z);
  floaters.push({ x: player.x, y: 2.4, z: player.z, text: 'HÚC!', t: 0.8, color: '#f2a13e' });
}
function shoveAt(x, z0) {
  for (const z of zombies) {
    if (z.state !== 'walk' && z.state !== 'pin' && z.state !== 'charge') continue;
    const dx = z.x - x, dz = z.z - z0, d = Math.hypot(dx, dz);
    if (d > 2.4 || d < 0.01) continue;
    if (z.state === 'pin') releasePin(z, 2.5);
    const k = z.type === 'brute' || z.type === 'charger' ? 0.8 : 2.2;
    z.x += dx / d * k; z.z += dz / d * k; collide(z);
    z.state = 'stun'; z.stunT = 1.6; if (!z.aggro) wake(z);
    damageZombie(z, 12, Math.atan2(dz, dx), 0, z.x, z.z, true);
  }
}

// ================= HUD =================
const hud = { dirty: true, last: {} };
function setText(id, v) { if (hud.last[id] !== v) { hud.last[id] = v; $(id).textContent = v; } }
function updateHud() {
  const ARC = 100.53;
  $('hp-arc').style.strokeDashoffset = (ARC * (1 - clamp(player.hp / player.maxHp, 0, 1))).toFixed(2);
  $('st-arc').style.strokeDashoffset = (ARC * (1 - clamp(player.stamina, 0, 1))).toFixed(2);
  setText('hp-num', String(Math.max(0, Math.ceil(player.hp))));
  setText('st-num', String(Math.round(player.stamina * 100)));
  setText('fd-pct', Math.round(player.food) + '%');
  setText('wt-pct', Math.round(player.water) + '%');
  $('fd-chip').classList.toggle('low', player.food < 20);
  $('wt-chip').classList.toggle('low', player.water < 20);
  $('ar-chip').classList.toggle('hidden', !(player.armor > 0));
  if (player.armor > 0) setText('ar-pct', Math.round(player.armor / ARMOR_PTS * 100) + '%');
  $('hp-box').classList.toggle('low', player.hp < 30);
  const inf = player.infected > 0 ? Math.ceil(player.infected) : 0;
  $('inf-row').classList.toggle('hidden', !inf);
  updateCureGuide(inf);
  if (inf) { setText('inf-time', `${Math.floor(inf / 60)}:${String(inf % 60).padStart(2, '0')}`); $('inf-row').classList.toggle('low', inf < 60); }
  $('zbanner').classList.toggle('hidden', !player.zombie);
  document.body.classList.toggle('zmode', !!player.zombie);
  $('reload-tag').classList.toggle('show', player.reloading > 0);
  const hh = ((atmos.hour % 24) + 24) % 24, clock = String(Math.floor(hh)).padStart(2, '0') + ':' + String(Math.floor((hh % 1) * 60)).padStart(2, '0');
  setText('night', phase === 'day' || phase === 'dawn' ? `NGÀY ${Math.max(1, dayNo)}` : `ĐÊM ${phase === 'dusk' ? wave + 1 : wave}`);
  setText('atmo', `${clock} · ${atmos.weatherName}`);
  if (phase === 'day' || net.active || bots.length) hud.dirty = true;
  if (!hud.dirty) return;
  hud.dirty = false;
  const w = WEAPONS[player.weapon], g = curGun();
  const alive = zombies.filter((z) => z.state !== 'dead' && z.aggro).length;
  const hrs = atmos.hour, left10 = (v) => Math.max(0, Math.ceil(v / 10) * 10);
  const dayLeft = (16.4 - hrs) / (16.4 - 6.9) * DAY_LEN;
  setText('left', phase === 'night' ? `Bình minh sau ~${left10((29.5 - hrs) / 9.9 * NIGHT_LEN)} giây` : phase === 'day' ? (dayLeft < 90 ? `Trời tối sau ~${left10(dayLeft)} giây` : '') : phase === 'dusk' ? 'Màn đêm sắp buông…' : '');
  const [qt, qs] = questText();
  setText('q-text', qt);
  const qsub = $('q-sub');
  if (hud.last.qsub !== qs) { hud.last.qsub = qs; qsub.innerHTML = ''; qs.split('\n').forEach((l, i) => { if (i) qsub.appendChild(document.createElement('br')); qsub.appendChild(document.createTextNode(l)); }); }
  const MW = MELEE[player.melee];
  setText('wname', w.melee ? MW.name : w.name);
  setText('ammo', w.melee ? (player.melee === 'fist' ? '✊' : String(player.durs[player.melee] || MW.dur)) : String(g.ammo));
  setText('reserve', w.melee ? (player.melee === 'fist' ? '' : (isTouch ? '/' : 'độ bền /') + MW.dur) : String(reserveOf(player.weapon)));
  $('ammo').classList.toggle('empty', !w.melee && g.ammo === 0);
  document.querySelectorAll('#slots .slot').forEach((el, i) => {
    el.classList.toggle('on', i === player.weapon);
    el.classList.toggle('owned', player.guns[i].owned);
  });
  const team = $('team');
  if (net.active) {
    const rows = [];
    const mmss = (sec) => Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
    for (const rp of net.players.values()) if (rp.inited) rows.push(`<div style="color:${CHARS[rp.char || 0].color}">${rp.name.replace(/[<>&]/g, '')} (${CHARS[rp.char || 0].name}) · ${rp.flags & 16 ? 'đã lên trực thăng' : rp.flags & 128 ? '<b style="color:#b8e08a;font-weight:400">ZOMBIE · cần hoa</b>' : rp.flags & 4 ? '<b style="color:#ff6a5a;font-weight:400">GỤC NGÃ</b>' : '♥ ' + rp.hp + (rp.flags & 64 ? ` <b style="color:#9aff7a;font-weight:400">virus ${mmss(rp.inf || 0)}</b>` : '')}</div>`);
    for (const b of allBots()) rows.push(`<div style="color:${CHARS[b.ci].color}">${CHARS[b.ci].name} · ${b.state === 'out' ? 'ngất' : b.state === 'down' ? '<b style="color:#ff6a5a;font-weight:400">GỤC</b>' : '♥' + Math.round(b.hp)}</div>`);
    const html = rows.join('');
    if (hud.last.team !== html) { hud.last.team = html; team.innerHTML = html; }
  } else {
    const html = allBots().map((b) => `<div style="color:${CHARS[b.ci].color}">${CHARS[b.ci].name} · ${b.state === 'out' ? 'ngất' : b.state === 'down' ? '<b style="color:#ff6a5a;font-weight:400">GỤC</b>' : '♥' + Math.round(b.hp)}</div>`).join('');
    if (hud.last.team !== html) { hud.last.team = html; team.innerHTML = html; }
  }
  let anyQuick = false;
  document.querySelectorAll('#quick .qi').forEach((el) => {
    const it = el.dataset.it, n = player.bag[it] || 0;
    const has = n > 0 || (it === 'torch' && player.torchT > 0);
    el.classList.toggle('none', !has); if (has) anyQuick = true;
    el.querySelector('b').textContent = it === 'flashlight' ? (n ? Math.ceil(player.battery / (BATTERY_TIME * player.mod.battery) * 100) + '%' : '0') : it === 'torch' && player.torchT > 0 ? Math.ceil(player.torchT) + 's' : n;
    el.classList.toggle('zero', it === 'flashlight' ? !n || !player.flashOn : it === 'torch' ? !n && !(player.torchT > 0) : !n);
  });
  $('quick').classList.toggle('empty', !anyQuick);
  $('tb-skill').querySelector('.dot').classList.toggle('hidden', !(player.sp > 0));
  $('tb-craft').querySelector('.dot').classList.toggle('hidden', !RECIPES.some((R) => player.recipes.has(R.id) && canCraft(R)));
  $('tb-more').querySelector('.dot').classList.toggle('hidden', $('tb-skill').querySelector('.dot').classList.contains('hidden') && $('tb-craft').querySelector('.dot').classList.contains('hidden'));
  $('t-reload').classList.toggle('off', !!WEAPONS[player.weapon].melee);
  setText('zone-tag', ZONE.name);
  setText('char-tag', `${CHARS[player.char].name} · ♥${player.maxHp}`);
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
  const ss = FP.on ? 34 : sunSize, sc = sun.shadow.camera;
  if (sc.right !== ss) { Object.assign(sc, { left: -ss, right: ss, top: ss, bottom: -ss }); sc.updateProjectionMatrix(); }
  const step = (ss * 2) / sun.shadow.mapSize.x;
  const ax = FP.on ? player.x + Math.cos(FP.yaw) * 16 : camTarget.x, az = FP.on ? clamp(player.z + Math.sin(FP.yaw) * 10, -12, 14) : -3;
  const sx = Math.round(ax / step) * step, sz = Math.round(az / step) * step;
  sunYaw = Math.atan2(A.sunDir.x, A.sunDir.z);
  updateSpriteShadows();
  sun.target.position.set(sx, 0, sz);
  sun.position.set(sx + A.sunDir.x * 50, A.sunDir.y * 50, sz + A.sunDir.z * 50);
  const P = post.params;
  P.exposure = A.exposure * settings.bright / 100; P.bloom = A.bloom; P.threshold = A.threshold; P.sat = A.sat; P.contrast = A.contrast; P.vignette = A.vignette;
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
  fx.sky.update(t, A, camera.position.x, lightning, camera.position);
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
    water: world.waterfalls[1] ? Math.max(0, 1 - Math.abs(camTarget.x - (world.waterfalls[1].x0 + world.waterfalls[1].x1) / 2) / 16) : 0,
    gen: world.pois.generator ? Math.max(0, 1 - Math.hypot(player.x - world.pois.generator.x, player.z - world.pois.generator.z) / 14) : 0,
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
  player = newPlayer(); setPlayerSprite();
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
  if (held('up')) mz -= 1;
  if (held('down')) mz += 1;
  if (held('left')) mx -= 1;
  if (held('right')) mx += 1;
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
  setFrame(player.sprite, dirFromAngle(player.aim), player.moving ? Math.floor(player.walk) % 4 : 0, player.aim);
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
  if ((net.active && (player.downed > 0 || player.dead || player.boarded)) || (!net.active && player.downed > 0)) {
    if (player.downed > 0) {
      player.downed -= dt;
      if (!net.active && !bots.some((b) => b.state === 'ok')) { gameOver(); return; }
      if (player.downed <= 0) { player.downed = 0; if (!net.active) { gameOver('KHÔNG AI KỊP CỨU'); return; } turnZombie(); return; }
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
    if (player.coughT <= 0) { player.coughT = rand(9, 20) * (0.35 + player.infected / (player.infMax || INFECT_TIME)); sound.cough(); }
    if (player.infected <= 0) { turnZombie(); return; }
  }
  if (player.bile > 0) player.bile -= dt;
  if (player.pinned) {
    player.pinDmgT -= dt;
    if (player.pinDmgT <= 0) {
      player.pinDmgT = 0.5; player.hp -= phase === 'night' ? 7 : 5; hurtFlash = 0.45; sound.hurt(); hud.dirty = true;
      if (player.hp <= 0) { player.pinned = 0; playerDied(); return; }
    }
    if (player.struggle >= 10) breakPin();
    if (net.active && !net.host) {
      const pz = zombies.find((o) => o.id === player.pinned);
      if (!pz || (pz.state !== 'pin' && pz.state !== 'leap')) { player.pinCheck = (player.pinCheck || 0) + dt; if (player.pinCheck > 1.5) { player.pinned = 0; player.pinCheck = 0; } } else player.pinCheck = 0;
    }
    if (player.pinned) {
      player.sprite.mesh.rotation.x = -Math.PI / 2; player.sprite.group.position.set(player.x, 0.05, player.z);
      player.firing = false; player.moving = false; player.searching = false; interact.target = null; player.exit = null;
      const tu = $('t-use'); tu.textContent = 'VÙNG'; tu.classList.remove('off');
      return;
    }
  }
  if ($('t-use').textContent === 'VÙNG') $('t-use').textContent = 'LỤC';
  if (player.kx || player.kz) {
    player.x += player.kx * dt; player.z += player.kz * dt; collide(player);
    const f = Math.exp(-dt * 6); player.kx *= f; player.kz *= f;
    if (Math.abs(player.kx) + Math.abs(player.kz) < 0.25) player.kx = player.kz = 0;
  }
  if (player.stunT > 0) player.stunT -= dt;
  if (player.shoveT > 0) player.shoveT -= dt;
  let [mx, mz, mag, ms] = readMove();
  if (player.stunT > 0) { mx = mz = 0; mag = 0; }
  const sprint = (held('run') || ms.m > 0.97) && mag > 0 && player.stamina > 0.05;
  player.stamina = clamp(player.stamina + (sprint ? -0.4 : 0.22 * player.mod.stamina) * dt, 0, 1);
  const spd = player.speed * (sprint ? 1.55 : 1) * mag * (player.action || player.searching ? 0.45 : 1);
  player.x += mx * spd * dt; player.z += mz * spd * dt * (FP.on ? 1 : 0.8);
  collide(player);
  player.moving = mag > 0.1;
  updateExit(mx, mz);
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
  if (FP.on) firing = fpAim(dt, as);
  else if (as.m > 0) { player.aim = Math.atan2(as.y * 0.8, as.x); firing = as.m > 0.35; }
  else if (interact.atkHold) {
    const w = WEAPONS[player.weapon], range = w.melee ? MELEE[player.melee].reach * 2.2 : 10;
    let best = null, bd = range;
    for (const z of zombies) { if (z.state === 'dead' || (z.y || 0) > 1) continue; const d = Math.hypot(z.x - player.x, z.z - player.z); if (d < bd) { bd = d; best = z; } }
    if (best) player.aim = Math.atan2(best.z - player.z, best.x - player.x);
    firing = true;
  }
  else if (!isTouch && mouse.has) {
    const p = aimPoint(mouse.x, mouse.y);
    if (p) player.aim = Math.atan2(p.z - player.z, p.x - player.x);
    else player.aim = mouse.x > W / 2 ? 0 : Math.PI;
    firing = mouse.down;
  } else if (player.moving) player.aim = Math.atan2(mz, mx);
  if (keys.Space) firing = true;
  if (bagOpen || player.searching || state.paused) firing = false;
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
  setFrame(sp, player.dir, player.moving || player.searching ? Math.floor(player.searching ? gtime * 7 : player.walk) % 4 : 0, player.searching ? undefined : player.aim);
  sp.group.position.set(player.x - Math.cos(player.aim) * player.recoil, 0, player.z - Math.sin(player.aim) * player.recoil);
  sp.mat.color.setScalar(player.inv > 0 && Math.floor(player.inv * 20) % 2 ? 2.2 : 1);
  const ca = Math.cos(player.aim), sa = Math.sin(player.aim);
  if (FP.on) {
    const cp = Math.cos(FP.pitch), ey = camera.position.y;
    flashlight.position.set(player.x + ca * 0.25 - sa * 0.15, ey - 0.2, player.z + sa * 0.25 + ca * 0.15);
    flashlight.target.position.set(player.x + ca * 9 * cp, Math.max(0, ey + Math.sin(FP.pitch) * 9 - 0.6), player.z + sa * 9 * cp);
    return;
  }
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
    if (z.state === 'crouch' || z.state === 'leap' || z.state === 'pin' || z.state === 'charge' || z.state === 'stun') { specialState(z, dt); continue; }
    if (z.state !== 'walk') { zombieTerrace(z, dt); s.mat.color.setScalar(1); continue; }
    if (z.type === 'weeper' && !z.aggro) { weeperIdle(z, dt); continue; }
    if (!z.aggro) {
      // chưa phát hiện: đứng lắc lư / đi lang thang quanh chỗ cũ; tỉnh khi người chơi lại gần
      const zb = buildingAt(z.x, z.z);
      let near = false;
      for (const t of TG) { const pd = Math.hypot(t.x - z.x, t.z - z.z) / (t.det || 1), same = zb === t.b; if (pd < (same ? 6.5 : 3.2) || (same && !t.b && pd < 8.5)) near = true; }
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
    let T = z.prey ? targetByKey(z.prey) : null, best = 1e9;
    // người dính dịch xanh hút zombie như nam châm
    if (!T) for (const t of TG) { const dd = ((t.x - z.x) ** 2 + (t.z - z.z) ** 2) / (t.bile ? 8 : 1); if (dd < best) { best = dd; T = t; } }
    if (!T) { z.walk += dt; setFrame(s, z.dir, 0); s.group.position.set(z.x, 0, z.z); continue; }
    let dx = T.x - z.x, dz = T.z - z.z;
    const d = Math.hypot(dx, dz) || 1;
    dx /= d; dz /= d;
    if (SPECIAL_AI[z.type] && SPECIAL_AI[z.type](z, T, d, dt)) continue;
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
    if (z.keep && d < z.keep) { dx = -dx; dz = -dz; }
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
      z.atkT = z.atkCd; modelSwing(s, 0.35);
      hurtPlayer(z, d);
      if (state.mode !== 'play') return;
    } else if (T.bot && d < z.r + 0.34 + 0.28 && z.atkT <= 0) {
      z.atkT = z.atkCd; modelSwing(s, 0.35);
      hurtBot(T.bot, z.dmg);
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
      dead = true; b.wall = true;
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
          damageZombie(z, b.dmg, Math.atan2(b.vz, b.vx), b.arrow ? 0.3 : 0.16, cx, cz, !!b.bot);
          if (b.pierce-- <= 0) { dead = true; break; }
        }
      }
    }
    if (dead) {
      if (b.arrow && b.mine && Math.random() < player.mod.arrowRecover) {
        const ax = b.wall ? b.px : b.x, az = b.wall ? b.pz : b.z;
        addDropLocal({ id: dropTmp--, it: 'arrow', n: 1, x: clamp(ax, BOUNDS.x0, BOUNDS.x1), z: clamp(az, BOUNDS.z0, BOUNDS.z1) });
      }
      bullets.splice(i, 1);
    }
  }
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3(), E = new THREE.Euler();
  let n = 0;
  for (const b of bullets) {
    if (n >= 64) break;
    const a = Math.atan2(b.vz, b.vx), len = 1.1;
    P.set(b.x - Math.cos(a) * len / 2, b.y || 1.0, b.z - Math.sin(a) * len / 2);
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
    spawnTimer = clamp((NIGHT_LEN * 0.75 / Math.max(1, nightTotal)) * batch, 0.35, 20) * rand(0.7, 1.3);
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
  if (curBuilding && curBuilding.portal && state.mode === 'play' && !zt.busy && !net.active) requestZone(curBuilding.portal, 'w');
  const fpw = fpWanted();
  if (fpw !== FP.on) fpApply(fpw);
  if (FP.on) {
    fpCamera(dt);
    U.push.value[0].set(player.x, 0, player.z, 1.1);
    const nearF = zombies.filter((z) => z.state === 'walk').map((z) => ({ z, d: Math.hypot(z.x - player.x, z.z - player.z) })).sort((a, b) => a.d - b.d);
    for (let i = 1; i < 6; i++) { const o = nearF[i - 1]; if (o) U.push.value[i].set(o.z.x, 0, o.z.z, o.z.r + 0.5); else U.push.value[i].set(0, -99, 0, 0.01); }
    return;
  }
  for (const b of world.buildings) b.cut.value += ((curBuilding === b ? 1 : 0) - b.cut.value) * Math.min(1, dt * 6);
  camInside += ((curBuilding ? 1 : 0) - camInside) * Math.min(1, dt * 3);
  placeCamera(settings.shake ? shake : 0);
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
  if (FP.on && state.mode === 'play') drawViewModel(g);
  g.textAlign = 'center';
  g.font = '18px "VT323", monospace';
  for (let fi = Math.max(0, floaters.length - 5); fi < floaters.length; fi++) {
    const f = floaters[fi];
    tmpV.set(f.x, f.y, f.z).project(camera);
    if (tmpV.z > 1) continue;
    const x = (tmpV.x * 0.5 + 0.5) * W, y = (-tmpV.y * 0.5 + 0.5) * H;
    g.globalAlpha = clamp(f.t * 2.5, 0, 1);
    g.fillStyle = '#000'; g.fillText(f.text, Math.round(x) + 1, Math.round(y) + 1);
    g.fillStyle = f.color; g.fillText(f.text, Math.round(x), Math.round(y));
  }
  g.globalAlpha = 1;
  for (const z of zombies) {
    if (z.state === 'dead' || (z.hp >= z.maxHp && z.type !== 'brute')) continue;
    tmpV.set(z.x, z.y + z.sprite.h + 0.25, z.z).project(camera);
    if (tmpV.z > 1) continue;
    const x = Math.round((tmpV.x * 0.5 + 0.5) * W), y = Math.round((-tmpV.y * 0.5 + 0.5) * H);
    if (x < -40 || x > W + 40 || y < -40 || y > H + 40) continue;
    const w = z.type === 'brute' ? 44 : 30;
    g.fillStyle = 'rgba(0,0,0,.7)'; g.fillRect(x - w / 2 - 1, y - 1, w + 2, 6);
    g.fillStyle = '#c9261b'; g.fillRect(x - w / 2, y, w * Math.max(0, z.hp / z.maxHp), 4);
  }
  if (net.active && state.mode !== 'title') for (const rp of net.players.values()) {
    if (!rp.inited || rp.flags & (8 | 16) || !rp.here) continue;
    if (rp.flags & 128 || rp.pingT > 0) {
      tmpV.set(rp.x, 1.2, rp.z).project(camera);
      const sx = (tmpV.x * 0.5 + 0.5) * W;
      if (!FP.on && (sx < 30 || sx > W - 30)) {
        const left = sx < 30, ex = left ? 36 : W - 36, ey = H * 0.42 + (rp.color || 0) * 26;
        g.font = '18px "VT323", monospace';
        g.fillStyle = 'rgba(10,8,14,.8)'; g.fillRect(ex - 58, ey - 15, 116, 22);
        g.fillStyle = rp.flags & 128 ? '#b8e08a' : CHARS[rp.char || 0].color;
        g.fillText(`${left ? '◀ ' : ''}${rp.name} ${Math.round(Math.abs(rp.x - player.x))}m${left ? '' : ' ▶'}`, ex, ey + 1);
      }
    }
    if (rp.flags & 128) {
      tmpV.set(rp.x, 2.3, rp.z).project(camera);
      if (tmpV.z > 1) continue;
      const x = Math.round((tmpV.x * 0.5 + 0.5) * W), y = Math.round((-tmpV.y * 0.5 + 0.5) * H);
      g.font = '18px "VT323", monospace';
      g.fillStyle = '#000'; g.fillText(rp.name, x + 1, y + 1); g.fillStyle = '#b8e08a'; g.fillText(rp.name, x, y);
      g.fillStyle = Math.floor(gtime * 2) % 2 ? '#ff6a7a' : '#ffffff'; g.fillText('ZOMBIE · cho ăn hoa bỉ ngạn', x, y - 18);
      continue;
    }
    const down = rp.flags & 4;
    tmpV.set(rp.x, down ? 0.9 : 2.3, rp.z).project(camera);
    if (tmpV.z > 1) continue;
    const x = Math.round((tmpV.x * 0.5 + 0.5) * W), y = Math.round((-tmpV.y * 0.5 + 0.5) * H);
    if (x < -60 || x > W + 60 || y < -40 || y > H + 40) continue;
    g.font = '15px "VT323", monospace';
    g.globalAlpha = down ? 1 : 0.75;
    g.fillStyle = '#000'; g.fillText(rp.name, x + 1, y + 1);
    g.fillStyle = CHARS[rp.char || 0].color; g.fillText(rp.name, x, y);
    g.globalAlpha = 1;
    if (down) { g.fillStyle = Math.floor(gtime * 3) % 2 ? '#ff6a5a' : '#ffffff'; g.fillText('giữ ' + KN('use') + ' để cứu', x, y - 15); }
    else { const mx = (CHARS[rp.char || 0] || {}).hp || 100; if (rp.hp < mx - 0.5) { g.fillStyle = 'rgba(0,0,0,.7)'; g.fillRect(x - 13, y + 4, 26, 4); g.fillStyle = '#7fe07f'; g.fillRect(x - 12, y + 5, 24 * clamp(rp.hp / mx, 0, 1), 2); } }
  }
  // bot đồng đội: tên + máu
  if (state.mode !== 'title') for (const b of allBots()) {
    if (b.state === 'out') continue;
    const down = b.state === 'down';
    if (FP.on && !down && Math.hypot(b.x - player.x, b.z - player.z) > 7) continue;
    tmpV.set(b.x, down ? 0.9 : 2.3, b.z).project(camera);
    if (tmpV.z > 1) continue;
    const x = Math.round((tmpV.x * 0.5 + 0.5) * W), y = Math.round((-tmpV.y * 0.5 + 0.5) * H);
    if (x < -60 || x > W + 60 || y < -40 || y > H + 40) continue;
    // tên đã có ở danh sách đội góc trái: trên đầu chỉ hiện khi gục ngã, thanh máu khi bị thương
    g.font = '15px "VT323", monospace';
    if (down) {
      const nm = CHARS[b.ci].name;
      g.fillStyle = '#000'; g.fillText(nm, x + 1, y + 1); g.fillStyle = CHARS[b.ci].color; g.fillText(nm, x, y);
      g.fillStyle = Math.floor(gtime * 3) % 2 ? '#ff6a5a' : '#ffffff'; g.fillText('giữ ' + KN('use') + ' để cứu', x, y - 15);
    } else if (b.hp < b.maxHp - 0.5) {
      g.fillStyle = 'rgba(0,0,0,.7)'; g.fillRect(x - 11, y + 4, 22, 4);
      g.fillStyle = CHARS[b.ci].color; g.fillRect(x - 10, y + 5, 20 * clamp(b.hp / b.maxHp, 0, 1), 2);
    }
  }
  // camera an ninh + kỹ năng đánh dấu đồ: chỗ còn đồ chưa lục
  if (state.mode === 'play' && camReveal > 0 && camLootOn) {
    for (const c of world.containers) {
      if (player.looted.has(c.id) || Math.abs(c.x - camTarget.x) > 20) continue;
      tmpV.set(c.x, 1.6, c.z).project(camera);
      if (tmpV.z > 1) continue;
      const x = Math.round((tmpV.x * 0.5 + 0.5) * W), y = Math.round((-tmpV.y * 0.5 + 0.5) * H);
      g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(x - 5, y - 5, 10, 10);
      g.fillStyle = Math.floor(gtime * 3) % 2 ? '#f2c14e' : '#fff0b0'; g.fillRect(x - 3, y - 3, 6, 6);
    }
  }
  if (state.mode === 'play' && interact.target && !bagOpen) {
    const tg = interact.target, inf = tg.info;
    tmpV.set(tg.x, 1.7, tg.z).project(camera);
    let x = Math.round((tmpV.x * 0.5 + 0.5) * W), y = Math.round((-tmpV.y * 0.5 + 0.5) * H);
    if (FP.on) { x = Math.round(W / 2); y = Math.round(H * 0.6); }
    const text = inf.can ? (isTouch ? inf.label : KN('use') + ' · ' + inf.label) : inf.label;
    g.font = '17px "VT323", monospace';
    const tw = Math.ceil(g.measureText(text).width) + 14;
    g.fillStyle = 'rgba(10,8,14,.72)'; g.fillRect(x - tw / 2, y - 14, tw, 20);
    if (inf.can) { g.fillStyle = '#f2c14e'; g.fillRect(x - tw / 2, y - 14, 2, 20); }
    g.fillStyle = inf.can ? '#fff6dc' : '#a8a0a8'; g.fillText(text, x, y + 1);
    if (inf.can && interact.t > 0) {
      g.fillStyle = '#000'; g.fillRect(x - tw / 2, y + 6, tw, 4);
      g.fillStyle = '#f2c14e'; g.fillRect(x - tw / 2, y + 6, tw * Math.min(1, interact.t / inf.time), 4);
    }
  }
  if (state.mode === 'play' && player.pinned) {
    const msg = (isTouch ? 'BỊ VỒ! Bấm VÙNG liên tục' : 'BỊ VỒ! Bấm ' + KN('use') + ' liên tục') + ` (${Math.min(10, player.struggle || 0)}/10)`;
    g.font = '24px "VT323", monospace';
    const tw = Math.ceil(g.measureText(msg).width) + 24;
    g.fillStyle = 'rgba(40,6,6,.85)'; g.fillRect(W / 2 - tw / 2, H * 0.36 - 20, tw, 30);
    g.fillStyle = Math.floor(gtime * 4) % 2 ? '#ff6a5a' : '#ffffff'; g.fillText(msg, W / 2, H * 0.36 + 2);
  }
  if (state.mode === 'play' && zt.wait) {
    g.font = '22px "VT323", monospace';
    const tw = Math.ceil(g.measureText(zt.wait).width) + 24;
    g.fillStyle = 'rgba(10,8,14,.85)'; g.fillRect(W / 2 - tw / 2, H * 0.3 - 18, tw, 28);
    g.fillStyle = '#f2c14e'; g.fillText(zt.wait, W / 2, H * 0.3 + 2);
  }
  if (state.mode === 'play' && player.action) {
    tmpV.set(player.x, 2.35, player.z).project(camera);
    let x = Math.round((tmpV.x * 0.5 + 0.5) * W), y = Math.round((-tmpV.y * 0.5 + 0.5) * H);
    if (FP.on) { x = Math.round(W / 2); y = Math.round(H * 0.56); }
    const k = Math.min(1, player.action.t / player.action.dur);
    g.font = '16px "VT323", monospace';
    const at = player.action.label || (player.action.target ? `Giúp ${player.action.targetName}…` : ACTION_TEXT[player.action.item] || '');
    g.fillStyle = '#000'; g.fillText(at, x + 1, y - 7);
    g.fillStyle = '#e8f0d8'; g.fillText(at, x, y - 8);
    g.fillStyle = 'rgba(0,0,0,.75)'; g.fillRect(x - 31, y - 2, 62, 7);
    g.fillStyle = '#7fe07f'; g.fillRect(x - 30, y - 1, 60 * k, 5);
  }
  if (state.mode === 'play' && !state.paused && FP.on && !isTouch && !FP.locked && !bagOpen && !craftUI.open && !mapOpen) {
    const t = FP.lockFailed ? 'giữ chuột phải + kéo để nhìn quanh' : 'bấm vào màn hình để điều khiển góc nhìn';
    g.font = '17px "VT323", monospace';
    const tw = Math.ceil(g.measureText(t).width) + 18, y = Math.round(H * 0.62);
    g.fillStyle = 'rgba(10,8,14,.6)'; g.fillRect(W / 2 - tw / 2, y - 14, tw, 20);
    g.fillStyle = '#f2c14e'; g.fillText(t, W / 2, y + 1);
  }
  if (state.mode === 'play' && !state.paused) {
    if (FP.on || (!isTouch && mouse.has)) {
      const sp = (FP.on ? 5 : 7) + player.recoil * 30, x = Math.round(FP.on ? W / 2 : mouse.x), y = Math.round(FP.on ? H / 2 : mouse.y);
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
        const lf = settings.lefty ? 0.75 : 0.25;
        if (!sticks.move) g.fillText(settings.lefty ? 'kéo để di chuyển →' : '← kéo để di chuyển', W * lf, H * 0.56);
        const lookT = FP.on ? 'kéo để nhìn quanh' : 'kéo để ngắm & bắn';
        if (!sticks.aim) g.fillText(settings.lefty ? '← ' + lookT : lookT + ' →', W * (1 - lf), H * 0.56);
      }
    }
  }
}

// ================= GÓC NHÌN THỨ NHẤT =================
// đọc phím / cần trái → hướng đi trong thế giới (góc nhìn thứ nhất: theo hướng đang nhìn)
function readMove() {
  let f = 0, st = 0;
  if (FP.on) {
    if (held('up')) f += 1;
    if (held('down')) f -= 1;
    if (keys[KB.left]) st -= 1;
    if (keys[KB.right]) st += 1;
  } else {
    if (held('up')) f -= 1;
    if (held('down')) f += 1;
    if (held('left')) st -= 1;
    if (held('right')) st += 1;
  }
  let mag = Math.hypot(f, st);
  if (mag > 0) { f /= mag; st /= mag; mag = 1; }
  const ms = stickVec(sticks.move);
  if (ms.m > 0) { st = ms.x; f = FP.on ? -ms.y : ms.y; mag = ms.m; }
  if (!FP.on) return [st, f, mag, ms];
  const c = Math.cos(FP.yaw), s2 = Math.sin(FP.yaw);
  return [c * f - s2 * st, s2 * f + c * st, mag, ms];
}
// xoay nhìn: chuột (khoá con trỏ), phím mũi tên trái/phải, cần phải trên điện thoại; trả về có đang bắn không
function fpAim(dt, as) {
  if (keys.ArrowLeft) FP.yaw -= dt * 2.2;
  if (keys.ArrowRight) FP.yaw += dt * 2.2;
  if (as.m > 0) {
    const k = Math.pow(as.m, 1.6) * (settings.sens || 100) / 100;
    FP.yaw += as.x * k * 3.0 * dt;
    FP.pitch = clamp(FP.pitch - as.y * k * 1.8 * dt, -1.2, 1.2);
  }
  FP.yaw = angDiff(FP.yaw, 0);
  let firing = !!interact.atkHold || (!isTouch && mouse.down && (FP.locked || FP.lockFailed));
  // nút ĐÁNH/BẮN trên điện thoại: hút nhẹ tâm ngắm về zombie gần giữa màn hình
  if (interact.atkHold) {
    let best = null, bd = 0.4;
    for (const z of zombies) {
      if (z.state === 'dead' || (z.y || 0) > 1) continue;
      const d = Math.hypot(z.x - player.x, z.z - player.z);
      if (d > 14) continue;
      const da = Math.abs(angDiff(Math.atan2(z.z - player.z, z.x - player.x), FP.yaw));
      if (da < bd) { bd = da; best = z; }
    }
    if (best) FP.yaw += angDiff(Math.atan2(best.z - player.z, best.x - player.x), FP.yaw) * Math.min(1, dt * 6);
  }
  player.aim = FP.yaw;
  return firing;
}
const fpWanted = () => settings.view === 'fp' && state.mode === 'play' && !cinema.active && !!player && !player.dead && !player.boarded;
const fpBillboardMeshes = () => [...pickups.map((p) => p.mesh), ...drops.map((d) => d.mesh), ...flowers.map((f) => f.mesh)].filter(Boolean);
function fpApply(on) {
  FP.on = on;
  if (world && world.fpOnly) world.fpOnly.visible = on;
  if (fx.sky) fx.sky.setFP(on);
  camera.near = on ? 0.05 : 1; camera.fov = on ? 72 : CAM.fov; camera.updateProjectionMatrix();
  const pv = (sp, v) => { if (sp) { sp.mesh.visible = v; sp.blob.visible = v; } };
  if (player) pv(player.sprite, !on);
  pv(zlook, !on);
  beam.visible = false;
  if (on) {
    FP.yaw = player ? player.aim : -Math.PI / 2; FP.pitch = 0;
  } else {
    for (const sp of SPRITES) { sp.group.rotation.y = 0; sp.xmat.visible = true; if (sp.ghost) setGhost(sp, false); if (sp._dir) setFrame(sp, sp._dir, sp._fr); }
    placeCamera(); camera.updateMatrixWorld(); camQuat.copy(camera.quaternion);
    for (const o of fpBillboardMeshes()) o.quaternion.copy(camQuat);
    if (world) for (const b of world.buildings) b.cut.value = 0;
    if (document.pointerLockElement) { FP.releasing = true; document.exitPointerLock(); }
  }
  document.body.classList.toggle('fp', on);
}
// mọi sprite (zombie, bạn, NPC, đồ rơi) quay mặt về camera, chọn khung trước/sau/trái/phải theo góc nhìn
function fpBillboard() {
  const th = Math.atan2(-Math.cos(FP.yaw), -Math.sin(FP.yaw));
  for (const sp of SPRITES) {
    if (!sp.group.parent) { SPRITES.delete(sp); continue; }
    if (!sp.group.visible) continue;
    if (sp.is3d) { sp.xmat.visible = camReveal > 0; continue; }
    sp.group.rotation.y = th;
    sp.xmat.visible = camReveal > 0;
    if (sp._dir) {
      const d = fpDir(sp, sp._dir), ox = sp._fr / 4, oy = 1 - (DIR_ROW[d] + 1) / 4;
      sp.maps[sp.cur].offset.set(ox, oy);
      if (sp.emap) sp.emap.offset.set(ox, oy);
    }
  }
  qYaw.setFromAxisAngle(Y_AXIS, th);
  for (const o of fpBillboardMeshes()) o.quaternion.copy(qYaw);
  // đồng đội đứng sát trước mặt thì mờ đi, không che tầm nhìn
  const fx0 = Math.cos(FP.yaw), fz0 = Math.sin(FP.yaw);
  for (const sp of mateSprites()) {
    const dx = sp.group.position.x - camera.position.x, dz = sp.group.position.z - camera.position.z, d = Math.hypot(dx, dz);
    setGhost(sp, d < 2.4 && dx * fx0 + dz * fz0 > 0);
  }
}
function mateSprites() {
  const out = bots.map((b) => b.sp);
  for (const v of botViews.values()) out.push(v.sp);
  for (const rp of net.players.values()) if (rp.sp) out.push(rp.sp);
  return out;
}
function setGhost(sp, on) {
  if (!!sp.ghost === on) return;
  sp.ghost = on;
  sp.mat.transparent = on; sp.mat.opacity = on ? 0.32 : 1; sp.mat.alphaTest = on ? 0.2 : 0.5; sp.mat.depthWrite = !on;
}
function fpCamera(dt) {
  // cửa ra vào: tường trước chỉ "mở" khi đứng ngay ô cửa để đi xuyên qua
  for (const b of world.buildings) {
    const dc = (b.doorX0 + b.doorX1) / 2, hw = (b.doorX1 - b.doorX0) / 2;
    const near = Math.abs(player.x - dc) < hw + 0.5 && Math.abs(player.z - b.zf) < 0.9;
    b.cut.value += ((near ? 1 : 0) - b.cut.value) * Math.min(1, dt * 14);
  }
  camInside += ((curBuilding ? 1 : 0) - camInside) * Math.min(1, dt * 3);
  const low = player.downed > 0 || player.pinned;
  const eyeH = low ? 0.5 : 1.5 * (CHARS[player.char] ? CHARS[player.char].scale || 1 : 1) * (player.zombie ? 0.94 : 1);
  const run = player.moving && player.stamina > 0.05 && (held('run') || stickVec(sticks.move).m > 0.97);
  FP.run = (FP.run || 0) + ((run ? 1 : 0) - (FP.run || 0)) * Math.min(1, dt * 5);
  if (!Number.isFinite(camera.fov)) camera.fov = 72;
  const ph0 = Math.floor(FP.bobT / Math.PI);
  if (player.moving) FP.bobT += dt * (run ? 12 : 8.5);
  if (player.moving && Math.floor(FP.bobT / Math.PI) !== ph0) sound.step();   // tiếng bước chân mỗi nhịp
  FP.bob += ((player.moving ? 1 : 0) - FP.bob) * Math.min(1, dt * 6);
  FP.sway *= Math.exp(-dt * 8); FP.swayY *= Math.exp(-dt * 8);
  // vận tốc ngang so với hướng nhìn: nghiêng đầu khi đi ngang
  const vx = (player.x - (FP.px ?? player.x)) / Math.max(dt, 1e-3), vz = (player.z - (FP.pz ?? player.z)) / Math.max(dt, 1e-3);
  FP.px = player.x; FP.pz = player.z;
  const strafe = clamp((vx * -Math.sin(FP.yaw) + vz * Math.cos(FP.yaw)) / 5, -1, 1);
  FP.strafe = (FP.strafe || 0) + (strafe - (FP.strafe || 0)) * Math.min(1, dt * 6);
  const bobA = 1 + FP.run * 0.6;
  const by = Math.abs(Math.sin(FP.bobT)) * 0.05 * FP.bob * bobA, bx = Math.cos(FP.bobT) * 0.03 * FP.bob * bobA;
  const wantFov = 72 + FP.run * 7;
  if (Math.abs(camera.fov - wantFov) > 0.05) { camera.fov += (wantFov - camera.fov) * Math.min(1, dt * 6); camera.updateProjectionMatrix(); }
  const sk = settings.shake ? shake : 0;
  const yaw = FP.yaw + (Math.random() - 0.5) * sk * 0.06;
  const pitch = clamp(FP.pitch + player.recoil * 0.7 + (Math.random() - 0.5) * sk * 0.06, -1.3, 1.3);
  const rx = -Math.sin(yaw), rz = Math.cos(yaw);
  camera.position.set(player.x + rx * bx, eyeH + by, player.z + rz * bx);
  const cp = Math.cos(pitch);
  tmpV.set(camera.position.x + Math.cos(yaw) * cp, camera.position.y + Math.sin(pitch), camera.position.z + Math.sin(yaw) * cp);
  camera.lookAt(tmpV);
  // nghiêng nhẹ theo bước chân và khi đi ngang (như đầu người thật)
  camera.rotateZ(-FP.strafe * 0.035 + Math.cos(FP.bobT) * 0.008 * FP.bob * bobA);
  camera.updateMatrixWorld();
  camQuat.copy(camera.quaternion);
  camTarget.x = player.x; camTarget.z = 1;
  sound.setListener(player.x, player.z);
  U.seeCenter.value.set(-9999, -9999); U.seeZ.value = 999; U.seeDepth.value = 0;
  if (player.sprite.mesh.visible) { player.sprite.mesh.visible = false; player.sprite.blob.visible = false; }
  if (zlook && zlook.mesh.visible) { zlook.mesh.visible = false; zlook.blob.visible = false; }
  if (world.fpOnly && !world.fpOnly.visible) world.fpOnly.visible = true;
  fpBillboard();
}
function toggleView() {
  settings.view = settings.view === 'fp' ? 'tp' : 'fp'; saveSettings();
  toast(settings.view === 'fp' ? 'Góc nhìn thứ nhất' + (isTouch ? ' · kéo bên phải để nhìn quanh' : ' · bấm chuột để khoá con trỏ') : 'Góc nhìn thứ ba (diorama)');
  if (settingsOpen) renderSettings();
}
// xoay nhìn bằng chuột: chỉ khi đã khoá con trỏ (bấm vào màn hình); trang không cho khoá thì giữ chuột phải + kéo
addEventListener('mousemove', (e) => {
  if (!FP.on || state.paused || bagOpen || craftUI.open || mapOpen || skillsOpen || settingsOpen || cinema.active) return;
  const dx = e.movementX || 0, dy = e.movementY || 0;
  if (FP.locked) { if (Math.abs(dx) > 300 || Math.abs(dy) > 300) return; }   // bỏ cú giật bất thường của trình duyệt
  else if (!(FP.lockFailed && e.buttons & 2)) return;
  const k = 0.0022 * (settings.sens || 100) / 100;
  FP.yaw += dx * k; FP.pitch = clamp(FP.pitch - dy * k, -1.25, 1.25);
  FP.sway = clamp(FP.sway - dx * 0.06, -9, 9); FP.swayY = clamp(FP.swayY + dy * 0.05, -6, 6);
});
document.addEventListener('pointerlockchange', () => {
  FP.locked = document.pointerLockElement === canvas;
  if (FP.locked) FP.lockFails = 0; else FP.unlockT = performance.now();
  if (!FP.locked && !FP.releasing && FP.on && state.mode === 'play' && !state.paused && !bagOpen && !craftUI.open && !mapOpen && !skillsOpen) togglePause();
  FP.releasing = false;
});
// lỗi khoá chuột thường chỉ tạm thời (vd. bấm lại ngay sau Esc): chỉ coi là "không khoá được" sau 3 lần liên tiếp
const fpLockFail = () => { FP.lockFails = (FP.lockFails || 0) + 1; if (FP.lockFails >= 3) FP.lockFailed = true; };
document.addEventListener('pointerlockerror', fpLockFail);
function fpLock() {
  if (FP.locked || FP.lockFailed || isTouch || !canvas.requestPointerLock) return false;
  if (performance.now() - (FP.unlockT || 0) < 1200) return true;   // Chrome không cho khoá lại ngay sau khi vừa thoát
  try {
    // unadjustedMovement: chuột thô, không gia tốc của hệ điều hành (Chrome); trình duyệt khác thì khoá thường
    const r = FP.noRaw ? canvas.requestPointerLock() : canvas.requestPointerLock({ unadjustedMovement: true });
    if (r && r.catch) r.catch((err) => {
      // máy không hỗ trợ chuột thô: lần sau khoá thường (thử luôn bây giờ)
      if (!FP.noRaw && err && err.name === 'NotSupportedError') { FP.noRaw = true; try { const r2 = canvas.requestPointerLock(); if (r2 && r2.catch) r2.catch(() => {}); } catch (e2) { /* bấm lại là được */ } }
      else if (err && err.name === 'SecurityError') FP.lockFailed = true;   // khung nhúng cấm khoá chuột: dùng chuột phải kéo
      else fpLockFail();
    });
  } catch (e) { fpLockFail(); return false; }
  return true;
}
// thả con trỏ khi mở túi đồ / bảng / tạm dừng
function fpReleaseCheck() {
  if (FP.locked && (!FP.on || state.paused || bagOpen || craftUI.open || mapOpen || skillsOpen || settingsOpen || state.mode !== 'play' || cinema.active)) { FP.releasing = true; document.exitPointerLock(); }
}

// ---------- tay + vũ khí (pixel art vẽ tay, phóng to kiểu nearest) ----------
const VM = { cv: null, g: null, W: 160, H: 96 };
function drawViewModel(g) {
  if (!VM.cv) { VM.cv = document.createElement('canvas'); VM.cv.width = VM.W; VM.cv.height = VM.H; VM.g = VM.cv.getContext('2d', { willReadFrequently: true }); }
  const c = VM.g, Wv = VM.W, Hv = VM.H;
  c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, Wv, Hv);
  if (player.zombie) { drawZombieHands(c); return blitVM(g); }
  const C = CHARS[player.char] || CHARS[0], pal = C.pal || {};
  const skin = pal.skin || '#f6cba2', skinS = pal.skinS || '#d9977a', sl = pal.top || '#4a5a6a', slS = pal.topS || '#34404c', OL = '#1d1018';
  const w = WEAPONS[player.weapon], mk = w.melee ? player.melee : null, mw = mk ? MELEE[mk] : null;
  // nhịp bước, lắc theo chuột, giật khi bắn, hạ tay khi nạp đạn / lục đồ / băng bó
  // đung đưa hình số 8 theo bước chân, thở khi đứng yên, nghiêng khi đi ngang, chạy thì hạ và xoay vũ khí
  const bA = FP.bob * (1 + (FP.run || 0) * 0.8);
  let ox = Math.cos(FP.bobT) * 7 * bA + FP.sway - (FP.strafe || 0) * 6;
  let oy = Math.abs(Math.sin(FP.bobT)) * 6 * bA + FP.swayY + Math.sin(gtime * 1.7) * 1.5 * (1 - FP.bob) + (FP.run || 0) * 12;
  const tilt = Math.cos(FP.bobT) * 0.04 * bA + (FP.strafe || 0) * 0.06 + (FP.run || 0) * 0.16;
  const armSw = Math.sin(FP.bobT) * 6 * bA;   // hai tay vung so le khi đi
  if (player.reloading > 0) { const rt = WEAPONS[player.weapon].reload * player.mod.reload; oy += Math.sin(clamp(1 - player.reloading / rt, 0, 1) * Math.PI) * 34; }
  if (player.action || player.searching) oy += 30;
  const D = FP.dbg || null;
  oy += (D ? D.rec : player.recoil) * 70;
  if (player.swing > 0 && FP.lastSwing <= 0) FP.hand ^= 1;
  FP.lastSwing = player.swing;
  const sw = D ? D.sw : player.swing > 0 ? 1 - player.swing / 0.2 : 0;   // 0 → 1 trong cú đánh
  const muz = D ? D.mz : muzzleT > 0;
  const arc = sw > 0 ? Math.sin(sw * Math.PI) : 0;
  c.save(); c.translate(Wv / 2, Hv); c.rotate(tilt); c.translate(-Wv / 2, -Hv); c.translate(Math.round(ox), Math.round(oy));
  const R = (x, y, ww, hh, col) => { c.fillStyle = col; c.fillRect(x, y, ww, hh); };
  const RO = (x, y, ww, hh, col) => { R(x - 1, y - 1, ww + 2, hh + 2, OL); R(x, y, ww, hh, col); };
  const arm = (hx, hy, ang, len = 60, wid = 15) => {
    c.save(); c.translate(hx, hy); c.rotate(ang);
    RO(-wid / 2, 4, wid, len, sl); R(-wid / 2, 4, 3, len, slS);
    c.restore();
  };
  const fist = (x, y, k = 1) => {
    c.save(); c.translate(x, y); c.scale(k, k);
    RO(-10, -9, 20, 17, skin); R(-10, 2, 20, 6, skinS);
    for (let i = 0; i < 3; i++) R(-6 + i * 6, -9, 1, 5, skinS);
    RO(-12, -4, 4, 9, skin);
    c.restore();
  };
  const grip = (x, y) => { RO(x - 10, y - 8, 20, 16, skin); R(x - 10, y + 4, 20, 4, skinS); R(x - 10, y - 8, 20, 2, '#ffffff22'); };
  if (!w.melee) {
    const k = w.key;
    if (k === 'bow') {
      // cung: tay trái cầm thân cung, tay phải kéo dây
      const draw = player.cooldown > 0 ? 0 : 1;
      arm(58, 58, 0.5, 60, 13); grip(58, 56);
      c.strokeStyle = OL; c.lineWidth = 5; c.beginPath(); c.arc(80, 56, 44, Math.PI * 0.62, Math.PI * 1.38); c.stroke();
      c.strokeStyle = '#8a5a2e'; c.lineWidth = 3; c.beginPath(); c.arc(80, 56, 44, Math.PI * 0.62, Math.PI * 1.38); c.stroke();
      const sx = 80 + 44 * Math.cos(Math.PI * 0.62), sy1 = 56 + 44 * Math.sin(Math.PI * 1.38), sy2 = 56 + 44 * Math.sin(Math.PI * 0.62);
      const px = sx + 18 + draw * 20;
      c.strokeStyle = '#e8e0c8'; c.lineWidth = 1; c.beginPath(); c.moveTo(sx, sy1); c.lineTo(px, 62); c.lineTo(sx, sy2); c.stroke();
      if (draw) { RO(px - 34, 60, 40, 2, '#b89060'); R(px - 40, 58, 6, 6, '#c8ccd4'); }
      arm(px + 8, 70, -0.5, 60, 14); grip(px + 4, 64);
    } else {
      const long = k === 'shotgun' || k === 'smg';
      let fx0, fy0;
      if (long) {
        // súng dài: chéo từ góc phải dưới vào giữa màn hình, tay trái đỡ ốp
        c.save(); c.translate(124, 104); c.rotate(-0.4);
        if (k === 'shotgun') {
          // súng hoa cải tự chế: hai ống thép quấn băng keo, báng gỗ
          RO(-9, -100, 9, 50, '#7a7e86'); RO(0, -100, 9, 50, '#6a6e76'); R(-9, -100, 3, 50, '#aeb2ba'); R(0, -100, 2, 50, '#8a8e96');
          R(-7, -102, 5, 3, '#1a1a1e'); R(2, -102, 5, 3, '#1a1a1e');
          for (const y of [-86, -66]) R(-9, y, 18, 4, '#c8c0a0');
          RO(-9, -50, 18, 40, '#8a5a32'); R(-9, -50, 4, 40, '#a8784a'); R(-9, -38, 18, 3, '#c8c0a0');
          RO(-10, -14, 20, 26, '#6a4426');
        } else {
          // súng bắn đinh cải tiến: thân máy vàng, mũi thép, băng đinh
          RO(-5, -98, 10, 28, '#5a5a62'); R(-5, -98, 3, 28, '#8a8a92'); R(-2, -100, 4, 3, '#1a1a1e');
          RO(-11, -72, 22, 40, '#e8b020'); R(-11, -72, 5, 40, '#ffd860'); R(-11, -50, 22, 3, '#2a2a30');
          RO(11, -66, 6, 30, '#8a8a92'); for (let i = 0; i < 6; i++) R(12, -64 + i * 5, 4, 1, '#c8ccd4');
          RO(-8, -32, 16, 40, '#2a2a30'); R(-8, -32, 3, 40, '#44444c');
        }
        c.restore();
        fx0 = 124 + Math.sin(0.4) * 102 * -1 + 0; fy0 = 104 - Math.cos(0.4) * 102;
        arm(70, 74, 0.75, 70, 15); grip(76, 66);
        arm(122, 94, -0.3, 60, 17); grip(118, 88);
      } else {
        // súng lục: hai tay cầm, khe ngắm ở giữa
        const gx = 96, gy = 38;
        // súng ống tự chế: ống thép ngắn quấn băng keo, cán gỗ
        RO(gx - 8, gy, 16, 30, '#7a7e86'); R(gx - 8, gy, 4, 30, '#aeb2ba'); R(gx + 4, gy, 4, 30, '#5a5e66');
        R(gx - 4, gy - 2, 8, 5, '#1a1a1e');
        R(gx - 8, gy + 8, 16, 3, '#c8c0a0'); R(gx - 8, gy + 20, 16, 3, '#c8c0a0');
        RO(gx - 8, gy + 28, 16, 22, '#8a5a32'); R(gx - 8, gy + 28, 4, 22, '#a8784a');
        arm(gx - 14, gy + 56, 0.55, 70, 16); arm(gx + 8, gy + 58, -0.4, 70, 17);
        grip(gx - 9, gy + 46); grip(gx + 4, gy + 42);
        fx0 = gx; fy0 = gy - 8;
      }
      if (muz) {
        c.fillStyle = '#fff6c8'; c.beginPath(); c.arc(fx0, fy0, 6, 0, TAU); c.fill();
        c.fillStyle = '#ffb040';
        for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + gtime * 9; c.fillRect(fx0 + Math.cos(a) * 7 - 2, fy0 + Math.sin(a) * 6 - 2, 4, 4); }
      }
    }
  } else if (!mw || mk === 'fist') {
    // tay không: hai nắm đấm, đấm xen kẽ trái / phải
    const L = FP.hand === 0 && sw > 0 ? arc : 0, Rr = FP.hand === 1 && sw > 0 ? arc : 0;
    const ly = armSw, ry = -armSw;
    arm(40 + L * 26, 82 - L * 26 + ly, 0.35 - L * 0.2, 60, 15); fist(40 + L * 26, 80 - L * 26 + ly, 1 + L * 0.25);
    arm(120 - Rr * 26, 82 - Rr * 26 + ry, -0.35 + Rr * 0.2, 60, 15); fist(120 - Rr * 26, 80 - Rr * 26 + ry, 1 + Rr * 0.25);
  } else if (mw.spr === 'knife') {
    const hx = 112 - arc * 46, hy = 78 - arc * 18, ang = -0.5 - arc * 0.9;
    arm(hx, hy, -0.4 + arc * 0.3, 60, 15);
    c.save(); c.translate(hx, hy - 6); c.rotate(ang);
    RO(-3, -4, 6, 12, '#3a2418'); RO(-3, -30, 6, 26, '#c8ccd4'); R(-3, -30, 2, 26, '#eef0f4'); R(1, -30, 2, 3, OL);
    c.restore();
    grip(hx, hy);
  } else if (mw.spr === 'spear') {
    const t = arc * 16;
    c.save(); c.translate(124 - t * 0.9, 96 - t); c.rotate(-0.78);
    RO(-3, -110, 6, 120, '#8a5a32'); R(-3, -110, 2, 120, '#a8784a');
    RO(-6, -128, 12, 18, '#b8bcc4'); R(-2, -134, 4, 6, '#d8dce4');
    c.restore();
    arm(118 - t * 0.9, 86 - t, -0.4, 60, 15); grip(116 - t * 0.9, 82 - t);
    arm(84 - t * 0.9, 60 - t, 0.25, 60, 13); grip(84 - t * 0.9, 58 - t);
  } else {
    // gậy / ống thép / gậy đóng đinh: vung ngang từ phải sang trái
    const col = mk === 'pipe' ? '#8a9098' : '#8a5a32', colL = mk === 'pipe' ? '#b8c0c8' : '#a8784a';
    const hx = 116 - arc * 52, hy = 84 - arc * 12, ang = -0.35 - sw * 1.6 * (sw > 0 ? 1 : 0);
    c.save(); c.translate(hx, hy - 4); c.rotate(ang);
    RO(-4, -64, 8, 64, col); R(-4, -64, 3, 64, colL);
    if (mk === 'nailbat') for (let i = 0; i < 5; i++) { R(-8, -60 + i * 8, 3, 2, '#c8ccd4'); R(5, -56 + i * 8, 3, 2, '#c8ccd4'); }
    RO(-4, -6, 8, 10, '#3a2418');
    c.restore();
    arm(hx, hy, -0.45 + arc * 0.4, 60, 15); grip(hx, hy);
  }
  // đuốc ở tay trái
  if (player.torchT > 0 && !(w.melee && (!mw || mk === 'fist'))) {
    const tx0 = 22, ty0 = 70;
    {
      arm(tx0, ty0 + 6, 0.3, 50, 13);
      c.save(); c.translate(tx0, ty0); c.rotate(0.25);
      RO(-3, -34, 6, 38, '#6a4226');
      c.restore();
      const fl = Math.sin(gtime * 20) * 2;
      c.fillStyle = '#ff7a1a'; c.beginPath(); c.arc(tx0 + 9, ty0 - 34 + fl, 7, 0, TAU); c.fill();
      c.fillStyle = '#ffd040'; c.beginPath(); c.arc(tx0 + 9, ty0 - 33 + fl, 4, 0, TAU); c.fill();
      grip(tx0, ty0);
    }
  }
  c.restore();
  blitVM(g);
}
function drawZombieHands(c) {
  const sk = '#8aa070', skS = '#5a7448', OL = '#1d1018', sw = Math.sin(gtime * 2) * 3;
  for (const [x, a] of [[34, 0.4], [126, -0.4]]) {
    c.save(); c.translate(x, 78 + sw * (x < 80 ? 1 : -1)); c.rotate(a);
    c.fillStyle = OL; c.fillRect(-9, -13, 18, 80); c.fillStyle = sk; c.fillRect(-8, -12, 16, 78); c.fillStyle = skS; c.fillRect(-8, -12, 4, 78);
    c.fillStyle = '#7a0e0c'; c.fillRect(-3, 10, 6, 4); c.fillRect(2, 30, 4, 6);
    for (let i = 0; i < 4; i++) { c.fillStyle = OL; c.fillRect(-8 + i * 4, -20, 3, 9); c.fillStyle = sk; c.fillRect(-8 + i * 4, -19, 2, 7); }
    c.restore();
  }
}
// làm sắc mép (bỏ điểm ảnh nửa trong suốt) rồi phóng to kiểu nearest ở đáy màn hình
function blitVM(g) {
  const c = VM.g, img = c.getImageData(0, 0, VM.W, VM.H), d = img.data;
  for (let i = 3; i < d.length; i += 4) d[i] = d[i] > 110 ? 255 : 0;
  c.putImageData(img, 0, 0);
  const h = Math.round(H * (isTouch ? 0.44 : 0.52)), w = Math.round(h * VM.W / VM.H);
  g.imageSmoothingEnabled = false;
  g.drawImage(VM.cv, Math.round(W / 2 - w / 2), H - h + 2, w, h);
}

// ================= MÀN HÌNH =================
function togglePause() {
  if (state.mode !== 'play' || cinema.active) return;
  if (settingsOpen) { closeSettings(); return; }
  const open = $('pause').classList.contains('hidden');
  $('pause').classList.toggle('hidden', !open);
  if (!net.active) state.paused = open || bagOpen || mapOpen || skillsOpen || craftUI.open;
  if (open) {
    if (!net.active) saveGame();
    const S = !net.active && loadSave();
    $('p-note').textContent = net.active ? 'Co-op: trận vẫn tiếp diễn khi mở menu' : S ? 'Đã lưu tự động · ' + saveLabel(S) : '';
    $('p-save').querySelector('b').textContent = net.active ? 'RỜI PHÒNG · VỀ MENU' : 'LƯU VÀ VỀ MENU CHÍNH';
    document.querySelectorAll('#pause .mbtn').forEach((b, i) => b.classList.toggle('sel', i === 0 && !isTouch));
  }
}
function bestScore() { return +store.get('deadnight_days', '0') || 0; }
const START_ZONE = 'school';
function startGame(opts = {}) {
  const L = opts.load || null;
  sound.init();
  if (!L) story.seen = new Set();
  if (!L && opts.ob) story.seen.add('outbreak');
  outbreakQueued = false;
  if (C3.on) c3End();
  clearNPCs();
  for (const z of zombies) releaseSprite(z);
  zombies = []; bullets = [];
  clearDrops(); clearFlowers();
  for (const k in dropStore) delete dropStore[k];
  net.zoneSeq = 0; net.zoneSeqSeen = -1; net.zoneEntry = 'start'; net.grants = []; net.pickedDrops.clear();
  const z0 = L && ZONES[L.zone] ? L.zone : QS.has('zone') && ZONES[QS.get('zone')] ? QS.get('zone') : NEW_ZONE;
  const wantCalm = calmNow() && isFloor(z0);
  if (ZONE.id !== z0 || WORLD_FLAGS.calm !== wantCalm) { disposeWorld(world); setZone(z0); WORLD_FLAGS.calm = wantCalm; buildZoneWorld(); }
  camReveal = 0; zt.wait = ''; clearAcid(); clearFire(); clearMines(); seenSpecial.clear();
  if (craftUI.open) { craftUI.grid.fill(null); craftUI.open = false; $('craft').classList.add('hidden'); }
  for (const p of pickups) scene.remove(p.mesh);
  pickups = []; floaters = [];
  fx.decals.clear();
  for (const c of world.containers) if (c.corpse) fx.decals.add(c.x, c.z, 1.9);
  player = newPlayer();
  player.pinned = 0; player.bile = 0; player.stunT = 0; player.kx = player.kz = 0;
  player.sprite.group.visible = true;
  setPlayerSprite();
  wave = 0; kills = 0; score = 0; shake = 0; hurtFlash = 0;
  state.mode = 'play'; state.paused = false; playStart = gtime;
  for (const id of ['title', 'over', 'pause', 'win', 'bag', 'charsel', 'skills', 'citymap', 'settings', 'confirm']) $(id).classList.add('hidden');
  bagOpen = false; skillsOpen = false; mapOpen = false; settingsOpen = false;
  document.body.classList.add('playing');
  setTimeout(checkRotate, 60);
  hud.dirty = true;
  resetWorldState(); questReset();
  if (!net.active || net.host) { DAY_LEN = DURATIONS[durKey].day; NIGHT_LEN = DURATIONS[durKey].night; }
  dayNo = 1;
  atmos.hour = 7.4; dayStartHour = 7.4; atmos.setWeather('clear', true); atmos.rate = 0.12;
  startDay(true);
  player.downed = 0; player.dead = false; player.boarded = false;
  setZombieLook(false); clearFlowers(); flowerDay = -1; $('t-use').textContent = 'LỤC';
  const calmStart = calmNow() && isFloor(ZONE.id);
  if ((!net.active || net.host) && !calmStart) { spawnLurkers(); for (let i = 0; i < 3; i++) spawnStray(); }
  for (const k in gateStates) delete gateStates[k];
  if (!net.active || net.host) makeBots(); else clearBots();
  // mã ván: quyết định chỗ đặt đồ nhiệm vụ (giữ nguyên khi chơi tiếp bản lưu)
  net.gameId = (L && L.qs) || Math.floor(Math.random() * 1e9);
  if (L) applySave(L);
  afterZoneLoad(ZONE.id);
  saveT = 60;
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
  $('ov-load').classList.toggle('hidden', net.active || !loadSave());
  setTimeout(() => $('over').classList.remove('hidden'), 900);
}
function toMenu() {
  clearBots();
  for (const z of zombies) releaseSprite(z);
  zombies = []; bullets = []; floaters = [];
  for (const id of ['over', 'win', 'pause', 'bag', 'craft', 'citymap', 'skills', 'settings', 'confirm']) $(id).classList.add('hidden');
  bagOpen = false; mapOpen = false; skillsOpen = false; craftUI.open = false; settingsOpen = false;
  if (cinema.active) cinema.skip();
  document.body.classList.remove('playing');
  state.mode = 'title'; state.paused = false; phase = 'title';
  player.zombie = false; player.infected = 0; setZombieLook(false); clearFlowers(); flowerDay = -1;
  sound.generator(false); sound.heli(false);
  if (heli) heli.group.visible = false;
  refreshMenu();
  $('title').classList.remove('hidden');
}
function setQualityLabel() {
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
  setZone(QS.get('zone') && ZONES[QS.get('zone')] ? QS.get('zone') : START_ZONE);
  SPR = makeCharacterSprites();
  cinema.init({ sound, zombies: SPR.zombies });
  // co-op: chủ phòng điều khiển phim (bỏ qua / tua thoại) cho cả phòng
  cinema.setPolicy({
    lead: () => !net.active || net.host,
    onSkip: (id) => { if (net.active && net.host) netEvent('cskip', id); },
    onAdvance: (id, i, t) => { if (net.active && net.host) netEvent('cadv', id, i, Math.round(t * 100)); },
    skipped: (id) => net.active && !net.host && (net.hostCine === false || (!!net.cskip && net.cskip.id === id && performance.now() - net.cskip.at < 60000)),
  });
  buildZoneWorld();
  pickupAtlas = makePickupAtlas();
  buildIcons(); buildQuickBar(); buildToolbarIcons();
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
  const fz = [{ x: -28, z: 6.25, w: 16, d: 7 }, { x: 0, z: 9, w: 140, d: 9 }, { x: 0, z: 4.5, w: 140, d: 2 }, { x: 44, z: 11, w: 14, d: 7 }];
  fx.fireflies = new Motes(scene, quality === 'high' ? 220 : 120, { color: new THREE.Color(3.2, 4.2, 1.2), size: 0.11, zones: fz });
  fx.ash = new Motes(scene, quality === 'high' ? 500 : 250, { color: new THREE.Color(1.6, 0.7, 0.4), size: 0.05, zones: [{ x: 0, z: 0, w: 1, d: 1 }], mode: 'ash', glow: false });
  fx.mist = new Mist(scene);
  fx.shafts = new Shafts(scene, [{ x: -27, y: 15, z: -8, w: 3.2 }, { x: -12, y: 15, z: -7, w: 2.6 }, { x: 10.5, y: 15, z: -9, w: 3 }, { x: 31, y: 15, z: -8, w: 3.4 }, { x: -50, y: 15, z: -9, w: 2.8 }, { x: 47, y: 15, z: -9, w: 3.6 }]);
  fx.crows = new Crows(scene, world.perches, camQuat, (p) => sound.caw(p.x, p.z));
  fx.moths = new Moths(scene, camQuat);
  fx.leaves = new Leaves(scene, camQuat);
  hideRefl(fx.lit.mesh, fx.blood.mesh, fx.spark.mesh, fx.smoke.mesh, fx.ember.mesh, fx.rain.mesh, fx.rain.splash, fx.fireflies.mesh, fx.ash.mesh, fx.moths.mesh, fx.leaves.p.mesh);
  for (const L of fx.mist.layers) hideRefl(L.mesh);
  for (const it of fx.shafts.items) hideRefl(it.mesh);
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
  scene.add(beam); hideRefl(beam);
  tracerMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 3.6, 1.6), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }), 64);
  tracerMesh.count = 0; tracerMesh.frustumCulled = false;
  scene.add(tracerMesh); hideRefl(tracerMesh);
  player = newPlayer();
  camTarget.set(player.x, 1, 1);
  fx.butterflies = new Butterflies(scene, camQuat, TY);
  fx.flock = new Flock(scene);
  fx.cones = new LampCones(scene, world.lampHeads);
  for (const b of fx.flock.birds) hideRefl(b.mesh);
  hideRefl(fx.butterflies.mesh);
  atmos.hour = 15.5; atmos.update(0);
  setQualityLabel();
  applySettings(); refreshMenu();
  if (DBG) renderer.info.autoReset = false;
  try { renderer.compile(scene, camera); } catch (e) { /* bỏ qua */ }
  state.mode = 'title';
  $('loading').classList.add('hidden');
  $('title').classList.remove('hidden');
  last = performance.now();
  requestAnimationFrame(frame);
  if (QS.has('shot')) setTimeout(startGame, 50);
  openTransport(QS.has('mockroom')).then((t) => {
    net.transport = t; net.pending = false;
    net.fbLazy = !t && canUseFirebase();   // web riêng: chỉ nối Firebase khi mở phần co-op
    updateCoopBtn(); watchLobby();
    if (!$('lobby').classList.contains('hidden')) openLobby();
  });
  updateCoopBtn();
  if (QS.has('debug')) window.__dbgKill = () => { toSpawn = 0; zombies.forEach((z) => { if (z.state !== 'dead') killZombie(z, 0); }); };
  if (QS.has('debug')) window.__dbg = () => ({ phase, hour: +atmos.hour.toFixed(2), weather: atmos.kind, hud: [$('night').textContent, $('atmo').textContent, $('left').textContent, $('msg-title').textContent, $('q-text').textContent], mode: state.mode, gtime: +gtime.toFixed(1), wave, toSpawn, zombies: zombies.map((z) => [z.type, z.state, +z.x.toFixed(2), +z.z.toFixed(2), +(z.y || 0).toFixed(2), z.aggro ? 1 : 0]), player: [+player.x.toFixed(1), +player.z.toFixed(1), Math.round(player.hp), Math.round(player.food), Math.round(player.water)], bag: { ...player.bag }, weapon: player.weapon, guns: player.guns.map((g) => [g.owned, g.ammo]), target: interact.target ? [interact.target.id, interact.target.info.label, interact.target.info.can, +interact.t.toFixed(2)] : null, quest: { ...Q, heli: Q.heli ? Q.heli.stage : null }, power, zone: ZONE.id, links: ZONE.linkIds, exit: player.exit, wait: zt.wait, drops: drops.map((d) => [d.id, d.it, d.n]), light: [player.bag.flashlight, player.flashOn, Math.round(player.battery), Math.round(player.torchT)], looted: player.looted.size, inf: Math.ceil(player.infected), zombie: player.zombie, net: { active: net.active, host: net.host, code: net.code, peers: net.players.size, me: net.me, hostPeer: net.hostPeer, remote: [...net.players.values()].map((r) => [r.name, +r.x.toFixed(1), +r.z.toFixed(1), r.flags, r.hp]) }, kills });
  if (QS.has('debug')) window.__dbgTp = (x, z) => { player.x = x; player.z = z; };
  if (QS.has('debug')) window.__zoneCross = () => (ZONE.cross === undefined ? null : ZONE.cross);
  if (QS.has('debug')) window.__give = (it, n) => { addItem(it, n); hud.dirty = true; };
  if (QS.has('debug')) window.__dbgGive = (it, n) => addItem(it, n);
  if (QS.has('debug')) window.__dbgGod = () => { player.hp = player.maxHp = 1e5; };
  if (QS.has('debug')) window.__dbgHurt = (n) => { player.hp = Math.max(1, player.hp - n); };
  if (QS.has('debug')) window.__bots = () => ({ bots: bots.map((b) => [CHARS[b.ci].id, b.state, +b.x.toFixed(1), +b.z.toFixed(1), Math.round(b.hp), b.task ? b.task.poi : null, b.melee, b.weapon, b.search ? b.search.kind : null]), bl: botLooted.size, views: [...botViews.values()].map((v) => [CHARS[v.ci].id, +v.x.toFixed(1), v.flags]), gate: world.pois.gate ? world.pois.gate.state : null, gs: gateStates[ZONE.id] || null, cam: +camReveal.toFixed(1), me: CHARS[player.char].id, lv: player.level, sp: player.sp, xp: player.xp, hp: [Math.round(player.hp), player.maxHp], zone: ZONE.id, pos: [+player.x.toFixed(1), +player.z.toFixed(1)] });
  if (QS.has('debug')) window.__sp = (n) => { player.sp += n; hud.dirty = true; };
  if (QS.has('debug')) window.__forceOutbreak = () => { story.seen.add('outbreak'); WORLD_FLAGS.calm = false; clearNPCs(); for (const bt of bots) bt.sp.group.visible = true; placeBots(); };
  if (QS.has('debug')) window.__mod = (k, v) => { player.mod[k] = v; hud.dirty = true; };
  if (QS.has('debug')) window.__fire = () => ({ poolXZ: firePools.map((f) => [+f.x.toFixed(1), +f.z.toFixed(1)]), pools: firePools.length, globs: globs.length, burning: zombies.filter((o) => o.burnT > 0).length, alive: zombies.filter((o) => o.state !== 'dead').length, melee: player.melee, durs: { ...player.durs }, armor: player.armor, hp: Math.round(player.hp), molotov: player.bag.molotov });
  if (QS.has('debug')) { window.__set = () => ({ settings, KB: { ...KB } }); window.__save = () => loadSave(); window.__saveNow = () => saveGame(true); window.__story = () => [...story.seen]; }
  if (QS.has('debug')) window.__qplan = () => { const P = questPlan(); const out = {}; for (const it in QSPOTS) out[it] = P[it].map((i) => QSPOTS[it][i].t + ' @' + QSPOTS[it][i].z); return { seed: P.seed, out, here: world.containers.map((c) => [c.id, c.kind, c.label, questLoot(c).map((q) => q[0]).join(','), c.x, c.z]).filter((x) => x[3]), checked: [...player.qChecked], counts: Object.entries(QSPOTS).flatMap(([it, L]) => L.filter((sp) => sp.z === ZONE.id).map((sp) => [it, sp.t, world.containers.filter((o) => spotMatch(sp, o)).length])) }; };
  if (QS.has('debug')) window.__qseed = (n) => { net.gameId = n; };
  if (QS.has('debug')) window.__hurtBot = (ci, d) => hurtBot('b' + ci, d);
  if (QS.has('debug')) window.__poi = (k) => (world.pois[k] ? [world.pois[k].x, world.pois[k].z] : null);
  if (QS.has('debug')) window.__shInfo = () => { const out = []; for (const sp of SPRITES) { if (!sp.group.visible) continue; const e = sp.shadow.matrixWorld.elements; out.push([+sp.shadow.rotation.y.toFixed(2), sp.shadow.castShadow, sp.mesh.castShadow, sp.shadow.visible, !!sp.smat.map, e.slice(12, 15).map((v) => +v.toFixed(1)), sp.shadow.parent === sp.mesh]); if (out.length > 4) break; } return { sunYaw, n: SPRITES.size, out }; };
  if (QS.has('debug')) window.__shProxy = (on) => { for (const sp of SPRITES) if (sp.shadow) { sp.shadow.castShadow = sp.shadow2.castShadow = on; sp.mesh.castShadow = !on; } };
  if (QS.has('debug')) window.__hour = (h) => { dayStartHour = h; phaseT = 0; atmos.hour = h; atmos.setWeather('clear', true); };
  if (QS.has('debug')) window.__vm = (sw, rec = 0, mz = false) => { FP.dbg = sw === null ? null : { sw, rec, mz }; };
  if (QS.has('debug')) window.__triInfo = () => { const out = []; for (const sp of SPRITES) { if (!sp.is3d || !sp.group.visible) continue; let t = 0, m = 0; sp.group.traverse((o) => { if (o.isMesh && o.geometry.index) { t += o.geometry.index.count / 3; m++; } }); out.push([t, m]); } return out; };
  if (QS.has('debug')) window.__fpState = () => ({ on: FP.on, yaw: +FP.yaw.toFixed(3), pitch: +FP.pitch.toFixed(3), locked: FP.locked, failed: !!FP.lockFailed, fails: FP.lockFails || 0, paused: state.paused });
  if (QS.has('debug')) window.__fp = (yaw, pitch = 0) => { settings.view = 'fp'; FP.yaw = yaw; FP.pitch = pitch; return { on: FP.on, near: camera.near, fov: camera.fov, cam: camera.position.toArray().map((v) => +v.toFixed(2)) }; };
  if (QS.has('debug')) { window.__cine = (id) => { sound.init(); cinema.play(id); }; window.__cineJump = (i, t) => cinema.jump(i, t); window.__cineState = () => cinema.state(); }
  if (QS.has('debug')) window.__post = () => ({ flash: post.params.flash, gain: post.params.gain, lift: post.params.lift, hour: +atmos.hour.toFixed(2), kind: atmos.kind, hurt: hurtFlash, mode: state.mode });
  if (QS.has('debug')) window.__conts = (kind) => world.containers.filter((c) => !kind || c.kind === kind).map((c) => [c.id, c.kind, +c.x.toFixed(2), +c.z.toFixed(2), player.looted.has(c.id)]);
  if (QS.has('debug')) window.__gcraft = (id) => { const R = RECIPES.find((r) => r.id === id); toggleCraft(true); gridAuto(R); const b0 = player.bag[R.out] || 0, w0 = player.guns.map((g) => g.owned); gridCraft(); const res = { msg: craftUI.msg, got: (player.bag[R.out] || 0) - b0, guns: player.guns.map((g) => g.owned), w0, help: naryneHelp() }; toggleCraft(false); return res; };
  if (QS.has('debug')) window.__mine = (place = true) => { if (place) placeMine(); return mines.map((m) => [+m.x.toFixed(1), +m.z.toFixed(1), +m.t.toFixed(2)]); };
  if (QS.has('debug')) window.__craft = () => ({ open: craftUI.open, grid: [...craftUI.grid], recipes: [...player.recipes], books: [...player.books], melee: player.melee, durs: { ...player.durs } });
  if (QS.has('debug')) window.__hostZone = (id, entry) => { net.zoneSeq = (net.zoneSeq || 0) + 1; net.zoneEntry = entry; net.zoneSeqSeen = net.zoneSeq; requestZone(id, entry); };
  if (QS.has('debug')) window.__net = () => { const hp = net.room && net.room.peers().find((q) => q.peer === net.hostPeer); return { host: net.host, hostPeer: net.hostPeer, me: net.me, seen: net.zoneSeqSeen, seq: net.zoneSeq, zn: hp && hp.presence && hp.presence.w ? hp.presence.w.zn : null, busy: zt.busy, zone: ZONE.id }; };
  if (QS.has('debug')) window.__dbgDown = () => { player.maxHp = 100; player.hp = 0; playerDied(); };
  if (QS.has('debug')) window.__dbgInfect = (sec) => { player.infected = sec; };
  if (QS.has('debug')) window.__dbgFlowers = () => flowers.map((f) => [f.id, f.x, f.z, f.mesh.visible]);
  if (QS.has('debug')) window.__dbgSpawn = (x, z, variant, aggro = true) => { newZombie('walker', x, 0, z, 'walk', { variant, aggro }); };
  if (QS.has('debug')) window.__dbgSpecial = (type, x, z, aggro = true) => { const o = newZombie(type, x, 0, z, 'walk', { aggro }); if (type === 'weeper' && !aggro) o.sprite.xr.visible = false; return o.id; };
  if (QS.has('debug')) window.__fx = () => ({ pinned: player.pinned, bile: +(player.bile || 0).toFixed(1), kx: +(player.kx || 0).toFixed(2), stun: +(player.stunT || 0).toFixed(2), acid: acidPools.length, globs: globs.length, hp: Math.round(player.hp), z: zombies.filter((o) => o.state !== 'dead').map((o) => [o.type, o.state, o.aggro ? 1 : 0, +o.x.toFixed(1)]) });
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
  // khung đầu tiên có thể mang mốc thời gian sớm hơn lúc khởi tạo: không cho dt âm
  let dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
  last = now;
  // đoạn phim: chơi một mình thì game đứng yên; co-op thì game vẫn chạy ngầm (nhân vật không bị đánh)
  if (cinema.active) {
    cinema.frame(dt);
    sound.update(dt, cinema.amb());
    if (cinema.active && cinema.is3D()) { if (net.active) netTick(dt); cineRender(dt); return; }
    if (!net.active || state.mode !== 'play') return;
    player.inv = Math.max(player.inv, 0.4);
  }
  if (state.paused) dt = 0;
  gtime += dt;
  U.time.value = gtime;
  if (state.mode === 'play') {
    const steps = QS.has('debug') ? (+QS.get('speed') || 1) : 1;
    for (let k = 0; k < steps && state.mode === 'play'; k++) {
      if (k) { gtime += dt; U.time.value = gtime; }
      if (zt.busy) break;
      updatePlayer(dt);
      const calmHere = calmNow() && isFloor(ZONE.id);
      if (state.mode === 'play') { updateZombies(dt); if (!calmHere) updateBots(dt); updateGate(dt); }
      if (calmHere) { updateNPCs(dt); checkOutbreak(); }
      if (state.mode === 'play') {
        updateBullets(dt); updatePickups(dt);
        if ((!net.active || net.host) && !calmHere) { updateWaves(dt); if (phase !== 'shot') updatePhase(dt); }
        updateHeli(dt); hostCheckWipe();
        if (net.active && net.host && (botRecT -= dt) <= 0) { botRecT = 2; reconcileBots(); }
      }
    }
    if (!net.active && state.mode === 'play' && !state.paused) { saveT -= dt; if (saveT <= 0) { saveT = 60; saveGame(); } }
    MM.t -= dt;
    if (MM.t <= 0) { MM.t = 0.15; drawMinimap(); if (mapOpen) drawBigZone(); }
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
  updatePlayerLights(dt, A);
  lastFlash = A.flash;
  if (state.mode === 'play') { updateAcid(dt); updateFire(dt); updateMines(dt); noticeSpecials(); }
  const fOn = state.mode === 'play' ? flashActive() && !player.zombie : state.mode === 'title' || state.mode === 'view';
  flashlight.intensity = state.mode === 'loading' || !fOn ? 0 : 40 * A.flash;
  if (camReveal > 0 && state.mode === 'play') {
    camReveal -= dt;
    for (const z of zombies) if (z.state !== 'dead') z.sprite.xr.visible = camReveal > 0 || z.aggro;
  }
  // nhiễm virus: màn hình ngả xanh dần; khi là zombie: nhạt màu, ánh lục
  if (state.mode === 'play' && player.zombie) { post.params.tint = [0.82, 1.08, 0.78]; post.params.sat *= 0.55; post.params.vignette = Math.min(1, post.params.vignette + 0.35); }
  else if (state.mode === 'play' && player.bile > 0) { post.params.tint = [0.85, 1.12, 0.7]; post.params.vignette = Math.min(1, post.params.vignette + 0.3); }
  else if (state.mode === 'play' && player.infected > 0) { const k = 1 - player.infected / (player.infMax || INFECT_TIME); post.params.tint = [1 - 0.14 * k, 1 + 0.04 * k, 1 - 0.2 * k]; post.params.vignette = Math.min(1, post.params.vignette + 0.3 * k + 0.08 * k * Math.sin(gtime * 3)); }
  else post.params.tint = [1, 1, 1];
  aura.position.set(player.x, 2.2, player.z + 0.6); aura.intensity = (fOn || player.torchT > 0 ? 3.5 : 2.2) * A.flash;
  beam.visible = state.mode === 'play' && fOn;
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
  if (FP.on) { post.params.focus = 14; post.params.range = 13; post.params.fall = 40; post.params.nearK = 0; post.params.maxBlur = 3; beam.visible = false; }
  fpReleaseCheck();
  if (state.mode === 'view' && !view.bloom) post.params.bloom = 0;
  if (toastT > 0) { toastT -= dt; if (toastT <= 0) $('toast').classList.remove('show'); }
  // bụi nước dưới chân thác
  for (const wf of world.waterfalls) {
    if (Math.abs((wf.x0 + wf.x1) / 2 - camTarget.x) > 24 || Math.random() > 0.75) continue;
    const c = 0.45 + 0.4 * clamp(A.hemiI * 0.5 + A.sunI * 0.15, 0, 1);
    fx.spark.spawn(rand(wf.x0, wf.x1), wf.y + 0.05, wf.z + rand(0, 0.25), rand(-0.6, 0.6), rand(0.8, 2.2), rand(0.1, 0.9), rand(0.35, 0.8), rand(0.05, 0.09), new THREE.Color(c * 0.8, c * 0.9, c), { grav: 5, drag: 1.5, mode: 1 });
  }
  if (DBG) renderer.info.reset();
  if (!cinema.active) post.render(scene, camera, gtime);
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

// ================= CÀI ĐẶT · PHÍM · MENU · LƯU GAME · CỐT TRUYỆN =================
const SET_KEY = 'deadnight_settings';
const SET_DEF = { vol: { master: 85, music: 70, sfx: 90, amb: 75 }, mute: false, bright: 100, shake: true, cine: true, tsize: 100, talpha: 90, lefty: false, view: 'tp', sens: 100, models: '3d', keys: {} };
const settings = (() => {
  try { const s = JSON.parse(store.get(SET_KEY, '{}')) || {}; return { ...SET_DEF, ...s, vol: { ...SET_DEF.vol, ...(s.vol || {}) }, keys: { ...(s.keys || {}) } }; }
  catch (e) { return { ...SET_DEF, vol: { ...SET_DEF.vol }, keys: {} }; }
})();
function saveSettings() { store.set(SET_KEY, JSON.stringify(settings)); }
// hành động bàn phím: [mã, tên, phím mặc định]; phím phụ cố định (mũi tên, Tab, Esc…) không đổi được
const ACTIONS = [
  ['up', 'Đi lên', 'KeyW'], ['down', 'Đi xuống', 'KeyS'], ['left', 'Sang trái', 'KeyA'], ['right', 'Sang phải', 'KeyD'], ['run', 'Chạy', 'ShiftLeft'],
  ['use', 'Lục soát, nhặt đồ (giữ)', 'KeyE'], ['reload', 'Nạp đạn', 'KeyR'], ['swap', 'Đổi vũ khí', 'KeyQ'], ['heal', 'Băng bó', 'KeyF'], ['eat', 'Ăn, uống', 'KeyC'],
  ['cure', 'Thuốc giải', 'KeyV'], ['torch', 'Đốt đuốc', 'KeyT'], ['light', 'Đèn pin', 'KeyL'], ['throw', 'Ném bom xăng', 'KeyX'], ['holster', 'Cất vũ khí (tay không)', 'KeyH'],
  ['bag', 'Túi đồ', 'KeyI'], ['craft', 'Bàn chế đồ', 'KeyB'], ['map', 'Bản đồ', 'KeyM'], ['pause', 'Tạm dừng, menu', 'KeyP'], ['mute', 'Tắt tiếng', 'KeyN'], ['view', 'Đổi góc nhìn thứ nhất / thứ ba', 'KeyZ'], ['mine', 'Đặt mìn tự chế', 'KeyY'],
];
const ALT_KEYS = { up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'], run: ['ShiftRight'], bag: ['Tab'], pause: ['Escape'] };
const KB = {};
function loadKeys() { for (const [a, , d] of ACTIONS) KB[a] = settings.keys[a] || d; }
loadKeys();
const held = (a) => !!keys[KB[a]] || (ALT_KEYS[a] || []).some((c) => keys[c]);
function actionOf(code) {
  for (const [a] of ACTIONS) if (KB[a] === code) return a;
  for (const a in ALT_KEYS) if (ALT_KEYS[a].includes(code)) return a;
  return null;
}
const KEY_NAMES = { ShiftLeft: 'Shift', ShiftRight: 'Shift phải', ControlLeft: 'Ctrl', ControlRight: 'Ctrl phải', AltLeft: 'Alt', AltRight: 'Alt phải', Space: 'Space', Tab: 'Tab', Enter: 'Enter', CapsLock: 'Caps', Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backslash: '\\', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Escape: 'Esc' };
function keyName(code) {
  if (!code) return '?';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
  return KEY_NAMES[code] || code;
}
const KN = (a) => keyName(KB[a]);
const QUICK_ACT = { bandage: 'heal', medkit: 'heal', food: 'eat', water: 'eat', antidote: 'cure', torch: 'torch', flashlight: 'light', molotov: 'throw', mine: 'mine' };
function helpHtml() {
  if (isTouch) return 'Ngón trái: di chuyển · Ngón phải: ngắm &amp; bắn/đánh · Giữ LỤC: lục soát, nhặt đồ<br>NẠP đạn · ĐỔI vũ khí · NÉM bom xăng · góc trên: Túi đồ, ⋯ (Chế đồ, Góc nhìn), Dừng · bấm bản đồ nhỏ để xem bản đồ';
  return `${KN('up')}${KN('left')}${KN('down')}${KN('right')}: đi · ${KN('run')}: chạy · Chuột: ngắm &amp; bắn/đánh · Giữ ${KN('use')}: lục soát, nhặt đồ · ${KN('reload')}: nạp đạn · 1-5/${KN('swap')}: đổi vũ khí<br>`
    + `${KN('bag')}: túi đồ · ${KN('craft')}: bàn chế · ${KN('map')}: bản đồ · ${KN('heal')}: băng bó · ${KN('eat')}: ăn uống · ${KN('cure')}: thuốc giải · ${KN('torch')}: đuốc · ${KN('light')}: đèn pin · ${KN('throw')}: ném bom xăng · ${KN('view')}: góc nhìn thứ nhất/thứ ba · ${KN('pause')}/Esc: menu`;
}
function refreshKeyHints() {
  for (const [id, a] of [['tb-bag', 'bag'], ['tb-craft', 'craft'], ['tb-map', 'map'], ['tb-view', 'view'], ['tb-pause', 'pause']]) {
    const b = $(id); if (!b) continue;
    b.querySelector('kbd').textContent = KN(a);
    b.title = b.querySelector('span').textContent + ' (' + KN(a) + ')';
  }
  document.querySelectorAll('#quick .qi').forEach((el) => { const i = el.querySelector('i'); if (i) i.textContent = KN(QUICK_ACT[el.dataset.it] || 'heal'); });
  for (const [id, a] of [['map-close', 'map'], ['bag-close', 'bag'], ['sk-close', 'skills'], ['cr-close', 'craft']]) $(id).title = 'Đóng' + (isTouch ? '' : ` (${KN(a)} hoặc Esc)`);
}
function applySettings() {
  sound.setVolumes({ master: settings.vol.master / 100, music: settings.vol.music / 100, sfx: settings.vol.sfx / 100, amb: settings.vol.amb / 100 });
  sound.muted = !!settings.mute;
  const tp = $('tpad');
  tp.style.setProperty('--ts', String(settings.tsize / 100));
  tp.style.opacity = String(settings.talpha / 100);
  document.body.classList.toggle('lefty', !!settings.lefty);
  refreshKeyHints();
}

// ---------- bảng cài đặt ----------
let settingsOpen = false, setTab = 'sound', rebinding = null, gfxNote = '';
function openSettings(tab) {
  settingsOpen = true; rebinding = null;
  if (tab) setTab = tab;
  $('settings').classList.remove('hidden');
  renderSettings();
}
function closeSettings() {
  settingsOpen = false; rebinding = null;
  $('settings').classList.add('hidden');
  saveSettings();
}
function sRow(label, sub, ctrl) {
  const r = document.createElement('div'); r.className = 'srow';
  const sp = document.createElement('span'); sp.innerHTML = label + (sub ? `<small>${sub}</small>` : ''); r.appendChild(sp);
  if (ctrl) r.appendChild(ctrl);
  return r;
}
function sRange(min, max, get, set, fmt = (v) => v + '%') {
  const wrap = document.createElement('div'); wrap.style.display = 'flex'; wrap.style.alignItems = 'center'; wrap.style.gap = '8px';
  const inp = document.createElement('input'); inp.type = 'range'; inp.min = min; inp.max = max; inp.value = get();
  const em = document.createElement('em'); em.textContent = fmt(get());
  inp.addEventListener('input', () => { set(+inp.value); em.textContent = fmt(+inp.value); applySettings(); });
  inp.addEventListener('change', saveSettings);
  inp.addEventListener('keydown', (e) => e.stopPropagation());
  wrap.append(inp, em);
  return wrap;
}
function sToggle(get, set, on = 'BẬT', off = 'TẮT') {
  const b = document.createElement('button'); b.className = 'tog' + (get() ? ' on' : ''); b.textContent = get() ? on : off;
  b.addEventListener('click', () => { set(!get()); b.className = 'tog' + (get() ? ' on' : ''); b.textContent = get() ? on : off; applySettings(); saveSettings(); });
  return b;
}
function sSeg(opts, get, set) {
  const d = document.createElement('div'); d.className = 'seg';
  for (const [v, label] of opts) {
    const b = document.createElement('button'); b.textContent = label; b.className = get() === v ? 'on' : '';
    b.addEventListener('click', () => { set(v); d.querySelectorAll('button').forEach((x, i) => x.classList.toggle('on', opts[i][0] === get())); saveSettings(); });
    d.appendChild(b);
  }
  return d;
}
function sButton(label, fn, cls = 'sbtn') { const b = document.createElement('button'); b.className = cls; b.textContent = label; b.addEventListener('click', fn); return b; }
function renderSettings() {
  document.querySelectorAll('#settings .stab').forEach((b) => b.classList.toggle('on', b.dataset.tab === setTab));
  document.querySelectorAll('#settings .spane').forEach((p) => p.classList.toggle('hidden', p.dataset.pane !== setTab));
  const pane = document.querySelector(`#settings .spane[data-pane="${setTab}"]`);
  pane.innerHTML = '';
  const V = settings.vol;
  if (setTab === 'sound') {
    pane.append(
      sRow('Âm lượng chung', '', sRange(0, 100, () => V.master, (v) => { V.master = v; })),
      sRow('Nhạc nền và phim', '', sRange(0, 100, () => V.music, (v) => { V.music = v; })),
      sRow('Hiệu ứng', 'Súng, zombie, đánh, nhặt đồ', sRange(0, 100, () => V.sfx, (v) => { V.sfx = v; })),
      sRow('Môi trường', 'Mưa, gió, côn trùng, máy phát', sRange(0, 100, () => V.amb, (v) => { V.amb = v; })),
      sRow('Tắt tiếng', isTouch ? '' : 'Phím ' + KN('mute'), sToggle(() => settings.mute, (v) => { settings.mute = v; }, 'ĐANG TẮT', 'ĐANG BẬT')),
    );
  } else if (setTab === 'gfx') {
    pane.append(
      sRow('Chất lượng đồ hoạ', 'Nhẹ: mượt hơn trên điện thoại · Cao: bóng đổ, phản chiếu, hiệu ứng đầy đủ', sSeg([['low', 'Nhẹ'], ['high', 'Cao']], () => quality, (v) => {
        if (v === quality) return;
        quality = v; store.set('deadnight_q', v);
        gfxNote = 'Đổi chất lượng cần tải lại game.'; renderSettings();
      })),
    );
    if (gfxNote) {
      const n = document.createElement('div'); n.className = 'srow';
      n.innerHTML = `<span class="snote">${gfxNote}${state.mode === 'play' && !net.active ? ' Ván đang chơi sẽ được lưu trước.' : ''}</span>`;
      n.appendChild(sButton('Tải lại ngay', () => { if (state.mode === 'play' && !net.active) saveGame(); location.reload(); }));
      pane.appendChild(n);
    }
    pane.append(
      sRow('Nhân vật', 'Khối 3D đầy đặn hoặc hình phẳng 2D (nhẹ máy) · áp dụng từ ván mới', sSeg([['3d', 'Khối 3D'], ['2d', 'Phẳng 2D']], () => settings.models || '3d', (v) => { settings.models = v; })),
      sRow('Góc nhìn', (isTouch ? 'Nút ⋯ → GÓC NHÌN trên thanh công cụ' : 'Phím ' + KN('view')) + ' để đổi nhanh khi đang chơi', sSeg([['tp', 'Thứ ba · diorama'], ['fp', 'Thứ nhất']], () => settings.view, (v) => { settings.view = v; })),
      sRow('Độ pixel', 'Dựng cảnh ở độ phân giải thấp rồi phóng to sắc nét', sSeg([[1, '1x'], [2, '2x'], [3, '3x']], () => pixelK, (v) => { pixelK = v; store.set('deadnight_px', String(v)); post.setPixel(v); setQualityLabel(); })),
      sRow('Độ sáng', '', sRange(60, 160, () => settings.bright, (v) => { settings.bright = v; })),
      sRow('Rung màn hình', 'Khi bắn, nổ, bị đánh', sToggle(() => settings.shake, (v) => { settings.shake = v; })),
    );
    if (state.mode === 'title') pane.append(sRow('Ngắm cảnh', 'Xem thử đồ hoạ: đổi giờ, thời tiết, chụp ảnh', sButton('Mở', () => { closeSettings(); startView(); })));
  } else if (setTab === 'ctrl') {
    pane.append(sRow('Độ nhạy nhìn quanh', 'Góc nhìn thứ nhất: chuột / kéo màn hình', sRange(30, 250, () => settings.sens, (v) => { settings.sens = v; })));
    if (isTouch) {
      pane.append(
        sRow('Cỡ nút bấm', 'Cụm nút LỤC, NẠP, ĐỔI, HÚC, NÉM', sRange(70, 150, () => settings.tsize, (v) => { settings.tsize = v; })),
        sRow('Độ đậm nút', '', sRange(30, 100, () => settings.talpha, (v) => { settings.talpha = v; })),
        sRow('Chơi tay trái', 'Đưa cụm nút sang trái, ngắm bằng ngón trái, đi bằng ngón phải', sToggle(() => settings.lefty, (v) => { settings.lefty = v; })),
      );
    } else {
      const h = document.createElement('div'); h.className = 'shead'; h.textContent = 'PHÍM TẮT · bấm vào phím để đổi'; pane.appendChild(h);
      for (const [a, label] of ACTIONS) {
        const b = document.createElement('button'); b.className = 'keyb' + (rebinding === a ? ' wait' : '');
        b.textContent = rebinding === a ? 'Bấm phím mới…' : KN(a);
        b.addEventListener('click', () => { rebinding = rebinding === a ? null : a; renderSettings(); });
        const alt = ALT_KEYS[a] ? 'Phím phụ: ' + ALT_KEYS[a].map(keyName).join(', ') : '';
        pane.appendChild(sRow(label, alt, b));
      }
      pane.appendChild(sRow('Khôi phục phím mặc định', '', sButton('Mặc định', () => { settings.keys = {}; loadKeys(); saveSettings(); applySettings(); renderSettings(); })));
    }
    const hp = document.createElement('div'); hp.className = 'shelp'; hp.innerHTML = helpHtml(); pane.appendChild(hp);
  } else if (setTab === 'game') {
    pane.append(
      sRow('Thời lượng ngày / đêm', 'Áp dụng từ ván mới', sSeg(Object.keys(DURATIONS).map((k) => [k, DURATIONS[k].name]), () => durKey, (v) => { durKey = v; store.set('deadnight_dur2', v); setQualityLabel(); })),
      sRow('Phim cốt truyện', 'Tự chiếu khi bắt đầu và qua mỗi chương', sToggle(() => settings.cine, (v) => { settings.cine = v; })),
    );
    if (state.mode === 'title') {
      const seen = seenGlobal();
      const box = document.createElement('div'); box.className = 'seg';
      for (const [id, label] of [['prologue', 'Mở đầu'], ['ch1', 'Chương 1'], ['lord', 'Zombie Chúa'], ['call', 'Gọi cứu hộ'], ['ending', 'Kết']]) {
        if (id !== 'prologue' && !seen.has(id)) continue;
        box.appendChild(sButton(label, () => { closeSettings(); $('title').classList.add('hidden'); sound.init(); cinema.setTeam(teamIdx().map((i) => CHARS[i].id)); cinema.play(id).then(() => { if (state.mode === 'title') $('title').classList.remove('hidden'); }); }));
      }
      pane.appendChild(sRow('Xem lại phim', 'Các đoạn đã mở khoá', box));
    }
    const S = loadSave();
    pane.appendChild(sRow('Bản lưu', S ? saveLabel(S) : 'Chưa có bản lưu', S && state.mode === 'title' ? sButton('Xoá', () => askConfirm('Xoá bản lưu hiện tại? Không khôi phục được.', () => { deleteSave(); renderSettings(); refreshMenu(); }), 'sbtn warn') : null));
  }
}
document.querySelectorAll('#settings .stab').forEach((b) => b.addEventListener('click', () => { setTab = b.dataset.tab; rebinding = null; renderSettings(); }));
$('set-close').addEventListener('click', closeSettings);
// đổi phím: bắt phím kế tiếp
function captureRebind(e) {
  e.preventDefault(); e.stopPropagation();
  if (e.code === 'Escape') { rebinding = null; renderSettings(); return; }
  const a = rebinding, old = KB[a];
  const other = ACTIONS.find(([x]) => x !== a && KB[x] === e.code);
  if (other) settings.keys[other[0]] = old;
  settings.keys[a] = e.code;
  loadKeys(); rebinding = null;
  saveSettings(); applySettings(); renderSettings();
}

// ---------- hộp xác nhận ----------
let confirmFn = null;
function askConfirm(text, yes, yesLabel = 'ĐỒNG Ý') {
  $('cf-text').textContent = text; $('cf-yes').textContent = yesLabel;
  confirmFn = yes;
  $('confirm').classList.remove('hidden');
}
function closeConfirm() { $('confirm').classList.add('hidden'); confirmFn = null; }
$('cf-yes').addEventListener('click', () => { const f = confirmFn; closeConfirm(); if (f) f(); });
$('cf-no').addEventListener('click', closeConfirm);

// ---------- lưu game (chơi một mình) ----------
const SAVE_KEY = 'deadnight_save1';
const story = { seen: new Set() };
let saveT = 60;
function seenGlobal() { try { return new Set(JSON.parse(store.get('deadnight_seen', '[]'))); } catch (e) { return new Set(); } }
function markSeen(id) { const s = seenGlobal(); s.add(id); store.set('deadnight_seen', JSON.stringify([...s])); }
function loadSave() { try { const s = JSON.parse(store.get(SAVE_KEY, 'null')); return s && s.v === 1 ? s : null; } catch (e) { return null; } }
function deleteSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* bỏ qua */ } }
function saveLabel(S) {
  const C = CHARS[S.char] || CHARS[0], z = ZONES[S.zone];
  const mins = Math.max(1, Math.round((S.playTime || 0) / 60));
  return `${C.name} · ${S.phase === 'night' || S.phase === 'dusk' ? 'Đêm ' + Math.max(1, S.wave) : 'Ngày ' + S.dayNo} · ${z ? z.name : ''} · ${mins} phút`;
}
function canSave() { return state.mode === 'play' && !net.active && player && !player.zombie && !player.dead && !player.downed && !Q.won && !Q.heli && !cinema.active && !zt.busy; }
function saveGame(flash) {
  if (!canSave()) return false;
  const P = player;
  const S = {
    v: 1, at: Date.now(), char: P.char, bench, bw: bots.map((b) => [b.ci, b.melee, b.weapon]), bl: [...botLooted], zone: ZONE.id, x: +P.x.toFixed(2), z: +P.z.toFixed(2),
    hp: P.hp, food: P.food, water: P.water, bag: { ...P.bag }, melee: P.melee, durs: { ...P.durs }, armor: P.armor, pack: !!P.pack,
    recipes: [...P.recipes], books: [...P.books], guns: P.guns.map((g) => ({ owned: g.owned, ammo: g.ammo })), weapon: P.weapon,
    battery: P.battery, flashOn: P.flashOn, torchT: P.torchT, infected: P.infected, infMax: P.infMax || 0,
    looted: [...P.looted], picked: [...P.picked], lootCount: P.lootCount, qs: net.gameId, qc: [...P.qChecked],
    Q: { ...Q, heli: null }, power, dayNo, wave, phase, phaseT, dayStartHour, hourFrom, toSpawn, nightTotal, nightKills, hour: atmos.hour, weather: atmos.kind,
    durKey, gates: JSON.parse(JSON.stringify(gateStates)), drops: JSON.parse(JSON.stringify(dropStore)), kills, score, playTime: gtime - playStart,
    story: [...story.seen], bots: bots.map((b) => ({ ci: b.ci, hp: b.hp, state: b.state === 'out' ? 'out' : 'ok' })),
  };
  store.set(SAVE_KEY, JSON.stringify(S));
  if (flash) { const f = $('saveflash'); f.classList.add('show'); clearTimeout(saveGame.t); saveGame.t = setTimeout(() => f.classList.remove('show'), 1600); }
  return true;
}
function applySave(S) {
  const P = player;
  P.x = S.x; P.z = S.z; P.hp = Math.min(P.maxHp, S.hp); P.food = S.food; P.water = S.water;
  for (const [ci, m, w] of S.bw || []) { const b = findBot(ci); if (b) { b.melee = m in MELEE ? m : 'fist'; b.weapon = w === 4 ? 4 : 0; } }
  for (const id of S.bl || []) botLooted.add(id);
  for (const k in S.bag) if (k in P.bag) P.bag[k] = S.bag[k];
  P.melee = S.melee in MELEE ? S.melee : 'fist'; P.durs = { ...S.durs }; P.armor = S.armor || 0; P.pack = !!S.pack;
  P.recipes = new Set(S.recipes); P.books = new Set(S.books);
  S.guns.forEach((g, i) => { if (P.guns[i]) { P.guns[i].owned = g.owned; P.guns[i].ammo = g.ammo; } });
  P.weapon = P.guns[S.weapon] && P.guns[S.weapon].owned ? S.weapon : 0;
  P.battery = S.battery || 0; P.flashOn = S.flashOn; P.torchT = S.torchT || 0;
  P.infected = S.infected || 0; if (S.infMax) P.infMax = S.infMax;
  P.looted = new Set(S.looted); P.picked = new Set(S.picked); P.lootCount = S.lootCount || 0; P.qChecked = new Set(S.qc || []);
  Object.assign(Q, S.Q, { heli: null }); power = !!S.power;
  dayNo = S.dayNo; wave = S.wave; dayStartHour = S.dayStartHour; hourFrom = S.hourFrom;
  phase = S.phase === 'shot' ? 'day' : S.phase; phaseT = S.phaseT;
  toSpawn = S.toSpawn || 0; nightTotal = S.nightTotal || 1; nightKills = S.nightKills || 0;
  atmos.hour = S.hour; atmos.setWeather(S.weather || 'clear', true);
  if (S.durKey && DURATIONS[S.durKey]) { DAY_LEN = DURATIONS[S.durKey].day; NIGHT_LEN = DURATIONS[S.durKey].night; }
  for (const k in gateStates) delete gateStates[k]; Object.assign(gateStates, S.gates || {});
  for (const k in dropStore) delete dropStore[k]; Object.assign(dropStore, S.drops || {});
  kills = S.kills || 0; score = S.score || 0; playStart = gtime - (S.playTime || 0);
  story.seen = new Set(S.story || []);
  if (power) applyPowerVisual();
  if (Q.armory) unlockArmory(false);
  for (const sb of S.bots || []) { const b = findBot(sb.ci); if (b) { b.hp = Math.max(1, sb.hp); if (sb.state === 'out') b.state = 'out'; } }
  placeBots();
  if (!isSchoolZone(S.zone)) armBots();
  clearDrops(); loadHostDrops();
  setPlayerSprite(); hud.dirty = true;
  if (Q.called && (phase === 'dawn' || phase === 'day')) setTimeout(() => { if (state.mode === 'play' && !Q.heli && !Q.won) heliArrive(); }, 3500);
  showMsg('CHƠI TIẾP', saveLabel(S));
}
function continueGame() {
  const S = loadSave();
  if (!S) return;
  myChar = clamp(S.char | 0, 0, CHARS.length - 1);
  if (S.bench !== undefined) { bench = clamp(S.bench | 0, -1, CHARS.length - 1); fixBench(); }
  startGame({ load: S });
}

// ---------- cốt truyện ----------
function playStory(id) {
  if (!settings.cine || story.seen.has(id)) return Promise.resolve();
  story.seen.add(id); markSeen(id);
  if (bagOpen) toggleBag(false);
  if (craftUI.open) toggleCraft(false);
  if (mapOpen) toggleMap(false);
  if (skillsOpen) toggleSkills(false);
  sound.init();
  cinema.setTeam(partyIds());
  return cinema.play(id);
}
const isSchoolZone = (id) => /^sf\d/.test(id);
function storyZone(id) {
  if (state.mode !== 'play') return;
  if (!isSchoolZone(id)) armBots();
  if (!isSchoolZone(id) && !story.seen.has('ch1')) { defineCh1(); playStory('ch1'); }
  else if (id === 'market' && !story.seen.has('lord')) playStory('lord').then(lordHorde);
}
// Zombie Chúa gầm lên: cả bầy lao về phía người chơi
function lordHorde() {
  if (state.mode !== 'play' || (net.active && !net.host)) return;
  for (let i = 0; i < 9; i++) {
    const side = i % 2 ? 1 : -1;
    const x = clamp(player.x + side * rand(13, 20), BOUNDS.x0 + 1, BOUNDS.x1 - 1), z = rand(WALL_Z + 0.5, BOUNDS.z1 - 0.4);
    if (insideSolid(x, z, 0.5)) continue;
    newZombie(i % 4 === 3 ? 'runner' : 'walker', x, 0, z, 'walk', { aggro: true });
  }
  showMsg('CẢ BẦY ĐANG KÉO TỚI!', 'Zombie Chúa đã gọi chúng');
}

// ---------- menu chính ----------
function refreshMenu() {
  const S = loadSave();
  const c = $('m-continue');
  c.disabled = !S;
  $('m-save').textContent = S ? saveLabel(S) : 'Chưa có bản lưu';
  $('best').textContent = bestScore();
  const first = document.querySelector('#main-menu .mbtn:not(:disabled)');
  document.querySelectorAll('#main-menu .mbtn').forEach((b) => b.classList.remove('sel'));
  if (first && !isTouch) first.classList.add('sel');
}
function newGameFlow() {
  if (loadSave()) askConfirm('Bắt đầu trò chơi mới? Bản lưu hiện tại sẽ bị ghi đè khi bạn chơi.', openCharSel, 'CHƠI MỚI');
  else openCharSel();
}
function startNewGame() {
  $('charsel').classList.add('hidden');
  deleteSave();
  startGame();
  saveT = 20;
  playIntro();
}
function playIntro() {
  if (!settings.cine || !calmNow()) return;
  playStory('prologue').then(() => {
    if (state.mode !== 'play' || !calmNow() || cinema.active) return;
    defineArrive();
    cinema.play('arrive', { onEnd: () => { if (C3.on) c3End(); } });
  });
}
let quitted = false;
function quitGame() {
  if (state.mode === 'play' && !net.active) saveGame();
  if (net.room) leaveRoom();
  quitted = true;
  try { if (sound.ac) sound.ac.suspend(); } catch (e) { /* bỏ qua */ }
  for (const id of ['title', 'pause', 'settings', 'confirm', 'over', 'win']) $(id).classList.add('hidden');
  document.body.classList.remove('playing');
  $('bye').classList.remove('hidden');
  try { window.close(); } catch (e) { /* trình duyệt không cho đóng thẻ */ }
}
$('bye-back').addEventListener('click', () => location.reload());
$('m-continue').addEventListener('click', continueGame);
$('m-settings').addEventListener('click', () => openSettings());
$('m-quit').addEventListener('click', () => askConfirm('Thoát game?', quitGame, 'THOÁT'));
$('p-settings').addEventListener('click', () => openSettings());
$('p-save').addEventListener('click', () => {
  if (net.active) { askConfirm('Rời phòng co-op và về menu chính?', () => { leaveRoom(); toMenu(); }, 'RỜI PHÒNG'); return; }
  saveGame(); toMenu();
});
// điều hướng menu bằng phím mũi tên / Enter
function menuNav(e) {
  const scr = ['confirm', 'settings', 'pause', 'title'].find((id) => !$(id).classList.contains('hidden'));
  if (!scr || scr === 'settings' || scr === 'confirm') return false;
  const list = [...$(scr).querySelectorAll('.mbtn:not(:disabled)')];
  if (!list.length) return false;
  let i = list.findIndex((b) => b.classList.contains('sel'));
  if (e.code === 'ArrowDown' || e.code === 'KeyS') i = (i + 1) % list.length;
  else if (e.code === 'ArrowUp' || e.code === 'KeyW') i = (i - 1 + list.length) % list.length;
  else if ((e.code === 'Enter' || e.code === 'Space') && i >= 0) { list[i].click(); return true; }
  else return false;
  list.forEach((b, k) => b.classList.toggle('sel', k === i));
  return true;
}
document.querySelectorAll('.mbtn').forEach((b) => b.addEventListener('mouseenter', () => { b.parentElement.querySelectorAll('.mbtn').forEach((x) => x.classList.toggle('sel', x === b)); }));

// ================= TRƯỜNG HỌC 3 TẦNG · CHƯƠNG 0 =================
const isFloor = (id) => /^sf\d$/.test(id || '');
const calmNow = () => !story.seen.has('outbreak');
const NEW_ZONE = 'sf1';
// học sinh đi lại trước khi dịch bùng phát (chỉ để làm cảnh)
const STUDENT_PALS = [
  { top: '#f0f0f4', topS: '#c4c4d0', topL: '#ffffff', hair: '#1a1a20', hairS: '#0c0c10', hairL: '#3a3a48', scarf: '#2a3a6a', scarfS: '#1c2848', pants: '#2a3a6a', pantsS: '#1c2848' },
  { top: '#f0f0f4', topS: '#c4c4d0', topL: '#ffffff', hair: '#4a2a1a', hairS: '#2e1a10', hairL: '#6a4430', scarf: '#c83a4a', scarfS: '#8a2430', pants: '#2a3a6a', pantsS: '#1c2848' },
  { top: '#e8eef8', topS: '#b8c0d0', topL: '#ffffff', hair: '#5a3a22', hairS: '#3a2414', hairL: '#7a5434', scarf: '#2a3a6a', scarfS: '#1c2848', pants: '#3a3e4a', pantsS: '#262a34', skin: '#e8b896', skinS: '#c89474' },
  { top: '#f0f0f4', topS: '#c4c4d0', topL: '#ffffff', hair: '#14141a', hairS: '#08080c', hairL: '#2a2a34', scarf: '#c83a4a', scarfS: '#8a2430', pants: '#2a3a6a', pantsS: '#1c2848', skin: '#d8a888', skinS: '#b88068' },
];
const NPC_EXTRA = {
  hang: { top: '#7a4a9a', topS: '#5a3474', topL: '#9a6aba', hair: '#14141a', hairS: '#08080c', hairL: '#30303c', scarf: '#e8d8f0', scarfS: '#b8a8c8', pants: '#4a3a5a', pantsS: '#30263c' },
  tuan: STUDENT_PALS[0], ha: STUDENT_PALS[1],
};
let npcs = [], npcAtl = null;
const atlasCache = {};
function npcA(key) {
  if (!atlasCache[key]) {
    if (key === 'tuanZ') atlasCache[key] = npcZombieAtlas(7, { top: '#e0e0e4', topS: '#b0b0bc', topL: '#f4f4f8', pants: '#2a3a6a', pantsS: '#1c2848', hair: '#1a1a20', hairS: '#0c0c10', hairL: '#3a3a48' });
    else if (NPC_EXTRA[key]) atlasCache[key] = npcAtlas(NPC_EXTRA[key]);
    else atlasCache[key] = npcAtlas(STUDENT_PALS[+key % STUDENT_PALS.length]);
  }
  return atlasCache[key];
}
function clearNPCs() { for (const n of npcs) scene.remove(n.sp.group); npcs = []; }
function spawnNPCs() {
  clearNPCs();
  if (!calmNow() || !isFloor(ZONE.id)) return;
  const rooms = world.buildings.filter((b) => b.kind === 'classroom' && b.id !== 'class11a');
  const n = 9;
  for (let i = 0; i < n; i++) {
    const sp = makeSprite([npcA(String(i % 4))], '#88c8ff'); sp.xr.visible = false;
    let x = rand(BOUNDS.x0 + 5, BOUNDS.x1 - 5), z = rand(WALL_Z + 0.6, BOUNDS.z1 - 0.4), seated = false;
    if (i % 3 === 0 && rooms.length) { const b = rooms[i % rooms.length]; x = rand(b.x0 + 3.2, b.x1 - 1.2); z = Math.random() < 0.5 ? -4.15 : -5.5; seated = true; }
    npcs.push({ sp, x, z, r: 0.3, tx: x, tz: z, t: rand(0, 4), dir: seated ? 'up' : 'down', walk: rand(0, 4), seated });
  }
}
function updateNPCs(dt) {
  for (const n of npcs) {
    n.t -= dt;
    if (n.t <= 0) {
      n.t = rand(2.5, 7);
      if (!n.seated && Math.random() < 0.7) { n.tx = clamp(n.x + rand(-7, 7), BOUNDS.x0 + 4, BOUNDS.x1 - 4); n.tz = rand(WALL_Z + 0.6, BOUNDS.z1 - 0.4); }
      else if (!n.seated) n.dir = ['down', 'left', 'right'][Math.floor(Math.random() * 3)];
    }
    const dx = n.tx - n.x, dz = n.tz - n.z, d = Math.hypot(dx, dz), mv = !n.seated && d > 0.2;
    if (mv) {
      n.x += (dx / d) * 1.25 * dt; n.z += (dz / d) * 1.25 * dt * 0.8; collide(n);
      n.walk += dt * 5; n.dir = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'right' : 'left') : dz > 0 ? 'down' : 'up';
    }
    setFrame(n.sp, n.dir, mv ? Math.floor(n.walk) % 4 : 0);
    n.sp.group.position.set(n.x, 0, n.z);
  }
}
// trước tiết Sinh: 4 bạn còn lại ngồi sẵn trong lớp 11A (tầng 2), không đi theo
const CLASS_SEATS = [[3.4, -4.15], [5.15, -4.15], [6.9, -4.15], [5.15, -5.5], [6.9, -5.5]];
function placeCalmBots() {
  const b = world.buildings.find((q) => q.id === 'class11a');
  bots.forEach((bt, k) => {
    const g = bt.sp.group;
    if (ZONE.id === 'sf2' && b) {
      const [dx, z] = CLASS_SEATS[k % CLASS_SEATS.length];
      bt.x = b.x0 + dx; bt.z = z; g.visible = true;
      g.position.set(bt.x, 0, bt.z); setFrame(bt.sp, 'down', 0);
    } else { g.visible = false; bt.x = 999; bt.z = 0; }
  });
}
let outbreakQueued = false;
function checkOutbreak() {
  if (!calmNow() || (net.active && !net.host) || cinema.active || outbreakQueued || ZONE.id !== 'sf2') return;
  const b = world.buildings.find((q) => q.id === 'class11a');
  const inside = (x, z) => !!b && x > b.x0 && x < b.x1 && z < b.zf && z > b.zb;
  const any = (curBuilding && curBuilding.id === 'class11a') || (net.active && [...net.players.values()].some((rp) => rp.inited && rp.here && inside(rp.x, rp.z)));
  if (any) { outbreakQueued = true; setTimeout(startOutbreak, 250); }
}
function startOutbreak() {
  if (state.mode !== 'play') { outbreakQueued = false; return; }
  if (net.active && net.host) netEvent('ob');
  if (!settings.cine) { afterOutbreak(); return; }
  story.seen.add('outbreak3d'); markSeen('outbreak');
  sound.init();
  defineOutbreak();
  cinema.setTeam(null);
  cinema.play('outbreak', { onEnd: afterOutbreak });
}
// sau khi Tuấn biến đổi: học sinh hoá zombie, cả nhóm thoát ra hành lang
function afterOutbreak() {
  if (C3.on) c3End();
  if (!calmNow()) return;
  story.seen.add('outbreak');
  WORLD_FLAGS.calm = false;
  const b = world.buildings.find((q) => q.id === 'class11a');
  if (b) { player.x = b.door; player.z = 0.7; }
  const hostSide = !net.active || net.host;
  if (hostSide) {
    for (const n of npcs) if (!n.seated || Math.random() < 0.5) newZombie(Math.random() < 0.25 ? 'runner' : 'walker', n.x, 0, n.z, 'walk', { variant: 'student', aggro: Math.random() < 0.4 });
    if (b) { const t = newZombie('walker', b.x0 + 2.4, 0, -4.6, 'walk', { variant: 'student', aggro: true }); t.hp = t.maxHp = Math.round(t.hp * 1.5); }
    const ha = newZombie('walker', BOUNDS.x0 + 5, 0, 0.6, 'walk', { variant: 'student', aggro: false });
    ha.hp = ha.maxHp = 170;
    spawnLurkers();
  }
  clearNPCs();
  for (const e of world.emitters) if (e.kind === 'inner' && Math.random() < 0.55) e.flicker = 'broken';
  for (const bt of bots) bt.sp.group.visible = true;
  placeBots();
  phaseT = 0;
  hud.dirty = true; saveT = 2;
  showMsg('CHƯƠNG 0 · TIẾT HỌC CUỐI', 'Tìm kềm cắt trong trường · bấm NHIỆM VỤ để xem nơi có thể có');
  if (!partyIds().includes(CHARS[bench].id)) setTimeout(() => toast(`${CHARS[bench].name} chạy lạc khỏi nhóm trong lúc hỗn loạn`), 2600);
  sound.wave();
}
// khách vào phòng khi dịch đã bùng phát (hoặc bỏ lỡ phim): chuyển sang trạng thái sau dịch, dựng lại tầng
function coopLateOutbreak() {
  story.seen.add('outbreak');
  clearNPCs();
  if (isFloor(ZONE.id) && WORLD_FLAGS.calm) { disposeWorld(world); setZone(ZONE.id); WORLD_FLAGS.calm = false; buildZoneWorld(); afterZoneLoad(ZONE.id); }
  WORLD_FLAGS.calm = false;
  hud.dirty = true;
}
// ---------- cổng chính tầng 1: cắt ổ khoá bằng kềm ----------
function describeMainGate() {
  const g = world.pois.mainGate;
  if (!g || g.state === 'open' || Q.gateCut) return { label: 'Cổng chính đã mở', can: false };
  if (calmNow()) return { label: 'Cổng chính đang khoá (giờ học)', can: false };
  if (player.bag.cutters > 0) return { label: 'Cắt ổ khoá cổng chính', can: true, time: 2.4 };
  return { label: 'Cổng khoá xích · cần KỀM CẮT (bấm NHIỆM VỤ xem nơi tìm)', can: false };
}
function openMainGate(feed) {
  const g = world.pois.mainGate;
  if (!g || g.state === 'open') return;
  g.state = 'open';
  g.gate.position.z = WALL_Z - 1.2; g.gate.scale.z = 0.35;
  g.lock.visible = false; g.chain.visible = false;
  const i = world.colliders.boxes.indexOf(g.box); if (i >= 0) world.colliders.boxes.splice(i, 1);
  navBuild();
  if (feed) { sound.unlock(); sound.bang(); showMsg('ĐÃ CẮT KHOÁ', 'Cổng chính đã mở · ra khỏi trường ←'); }
}
function cutGate() {
  if (!(player.bag.cutters > 0)) return;
  player.bag.cutters = 0; Q.gateCut = true;
  if (net.active && !net.host) netEvent('q', 'gatecut', 0);
  openMainGate(true); gainXP(25, true); hud.dirty = true; saveT = 1;
}
// ---------- chuyển tầng ----------
function entryFor(side, to) {
  if (ZONE.floorLinks) return isFloor(to) ? side : 'gate';
  return ZONES[to] && ZONES[to].floorLinks ? 'w' : OPP[side];
}
function enterZoneHook(id) {
  WORLD_FLAGS.calm = calmNow() && isFloor(id);
}
function afterZoneLoad(id) {
  if (Q.gateCut) openMainGate(false);
  if (calmNow() && isFloor(id)) { spawnNPCs(); placeCalmBots(); } else clearNPCs();
}

// ================= PHIM 3D: dựng bằng chính thế giới trong game =================
const C3 = { on: false, actors: [], hidden: [], shake: 0, b: null, cam: { pos: new THREE.Vector3(0, 5, 10), look: new THREE.Vector3(), fov: CAM.fov } };
function c3Begin(hideReal = true, b = null) {
  C3.on = true; C3.b = b; C3.hideReal = hideReal;
  if (hideReal) {
    C3.hidden = [player.sprite.group, ...bots.map((q) => q.sp.group), ...npcs.map((n) => n.sp.group)].filter((g) => g.visible);
    for (const g of C3.hidden) g.visible = false;
  }
}
function c3End() {
  for (const z of zombies) if (z.c3h) { z.c3h = false; z.sprite.group.visible = true; }
  for (const a of C3.actors) scene.remove(a.sp.group);
  C3.actors = [];
  for (const g of C3.hidden) g.visible = true;
  C3.hidden = []; C3.on = false; C3.b = null; C3.shake = 0;
  camera.fov = CAM.fov; camera.updateProjectionMatrix();
}
function actor(atlas, x, z, dir = 'down') {
  const sp = makeSprite([atlas], '#ffffff'); sp.xr.visible = false;
  const a = { sp, x, z, y: 0, dir, frame: 0, walk: 0, rot: 0, path: null, jit: 0 };
  C3.actors.push(a);
  return a;
}
function actorSwap(a, atlas) { scene.remove(a.sp.group); a.sp = makeSprite([atlas], '#ff4a4a'); a.sp.xr.visible = false; }
function walkTo(a, x, z, speed = 2.4) { a.path = { x, z, speed }; }
function bloodBurst(x, y, z, n = 14, s = 1) {
  for (let i = 0; i < n; i++) { const an = Math.random() * TAU, sp = rand(1.2, 4) * s; fx.blood.spawn(x, y + rand(-0.2, 0.2), z, Math.cos(an) * sp, rand(1, 3.5), Math.sin(an) * sp * 0.6, 1.8, rand(0.05, 0.11), Math.random() < 0.5 ? '#7a0e0c' : '#a51c16', { grav: 11, drag: 0.7 }); }
  fx.decals.add(x, z + 0.2, 1.0);
}
function hitSpark(x, y, z) { for (let i = 0; i < 10; i++) { const an = Math.random() * TAU; fx.spark.spawn(x, y, z, Math.cos(an) * 3, rand(0.5, 3), Math.sin(an) * 2, 0.35, 0.05, '#fff0c0', { grav: 6, drag: 1.5 }); } }
function c3Update(dt) {
  for (const a of C3.actors) {
    if (a.path) {
      const dx = a.path.x - a.x, dz = a.path.z - a.z, d = Math.hypot(dx, dz);
      if (d < 0.04) a.path = null;
      else {
        const st = Math.min(d, a.path.speed * dt);
        a.x += (dx / d) * st; a.z += (dz / d) * st; a.walk += dt * a.path.speed * 2.4;
        a.dir = Math.abs(dx) > Math.abs(dz) * 0.7 ? (dx > 0 ? 'right' : 'left') : dz > 0 ? 'down' : 'up';
      }
    }
    setFrame(a.sp, a.dir, a.path ? Math.floor(a.walk) % 4 : a.frame);
    a.sp.group.position.set(a.x + (a.jit ? (Math.random() - 0.5) * a.jit : 0), a.y, a.z);
    a.sp.group.rotation.z = a.rot;
  }
}
const c3Cam = (px, py, pz, lx, ly, lz, fov = 34) => { C3.cam.pos.set(px, py, pz); C3.cam.look.set(lx, ly, lz); C3.cam.fov = fov; };
const lerp3 = (a, b, k) => a + (b - a) * k;
function cineRender(dt) {
  if (FP.on) fpApply(false);
  if (C3.on && C3.hideReal) {
    // co-op: người chơi khác, bot (bản sao) và zombie mới sinh không lọt vào cảnh phim
    for (const rp of net.players.values()) { if (rp.sp) rp.sp.group.visible = false; if (rp.zsp) rp.zsp.group.visible = false; }
    for (const v of botViews.values()) v.sp.group.visible = false;
    for (const z of zombies) if (z.sprite.group.visible) { z.sprite.group.visible = false; z.c3h = true; }
  }
  gtime += dt; U.time.value = gtime;
  c3Update(dt);
  camTarget.x = C3.cam.look.x;
  const A = applyAtmos(dt, gtime);
  for (const fn of world.animated) fn(dt, gtime, A.wind);
  C3.shake = Math.max(0, C3.shake - dt * 2.2);
  const sk = C3.shake * 0.25;
  camera.position.set(C3.cam.pos.x + (Math.random() - 0.5) * sk, C3.cam.pos.y + (Math.random() - 0.5) * sk, C3.cam.pos.z);
  camera.lookAt(C3.cam.look);
  if (Math.abs(camera.fov - C3.cam.fov) > 0.01) { camera.fov = C3.cam.fov; camera.updateProjectionMatrix(); }
  camera.updateMatrixWorld();
  for (const b of world.buildings) b.cut.value += ((C3.b === b ? 1 : 0) - b.cut.value) * Math.min(1, dt * 6);
  tmpV.copy(C3.cam.look).applyMatrix4(camera.matrixWorldInverse);
  post.params.focus = -tmpV.z; post.params.dof = true;
  post.params.maxBlur = 3; post.params.range = 3.5; post.params.fall = 9; post.params.nearK = 0.6;
  U.seeZ.value = 999; U.seeCenter.value.set(-9999, -9999);
  g2.setTransform(ODPR, 0, 0, ODPR, 0, 0); g2.clearRect(0, 0, W, H);
  hurtFlash = Math.max(0, hurtFlash - dt * 1.5);
  fx.blood.update(dt); fx.spark.update(dt); fx.lit.update(dt); fx.smoke.update(dt);
  post.render(scene, camera, gtime);
}
// --- đến trường (đầu game, trước khi có dịch) ---
function defineArrive() {
  const me = CHARS[player.char].id;
  cinema.define('arrive', [{
    three: true, dur: 8.2, cap: ['SÁNG NGÀY 1 · 7 GIỜ 25', 'Trường Quốc tế Vân Lâm · tầng 1'], amb: { birds: 0.6, wind: 0.2, music: 0.6 },
    lines: [[3.2, me, '(Lại một ngày đi học bình thường... lên lớp 11A thôi, sắp vào tiết Sinh.)']],
    enter() { c3Begin(false); },
    update(t) { const k = ease01(t / 8.2); c3Cam(lerp3(-25, -32.5, k), 2.15, 2.1, lerp3(-31, -38.6, k), 1.15, -0.9, 46); },
    exit() { c3End(); },
  }]);
}
const ease01 = (k) => { k = clamp(k, 0, 1); return k * k * (3 - 2 * k); };
// --- tiết Sinh học lớp 11A: Tuấn biến đổi ---
function defineOutbreak() {
  const b = world.buildings.find((q) => q.id === 'class11a');
  const L = b ? b.x0 : 12;
  const A = {};
  const seat = (i) => [L + CLASS_SEATS[i][0], CLASS_SEATS[i][1]];
  const shots = [];
  shots.push({
    three: true, dur: 9.6, cap: ['TIẾT SINH HỌC', 'Lớp 11A · cô Hằng'], amb: { birds: 0.25, drone: 0.15 },
    lines: [[1.0, 'hang', 'Hôm nay ta học về hoa bỉ ngạn: loài hoa đỏ mọc ven kênh, nở vào cuối hè...'], [4.4, 'lycas', '(thì thầm) Mạng trường mất từ sáng. Camera hành lang cũng tắt hết.'], [7.0, 'naryne', '(nghĩ thầm) Bố vẫn không nghe máy... đã hai tháng rồi.']],
    enter() {
      c3Begin(true, b);
      A.hang = actor(npcA('hang'), L + 1.8, -6.6, 'down');
      const order = ['lycas', 'ama', 'naryne', 'hamble', 'tien'];
      order.forEach((id, i) => { const [x, z] = seat(i); A[id] = actor(charSprites(CHARS.findIndex((c) => c.id === id), CHARS.find((c) => c.id === id).pal).fist, x, z, 'down'); });
      A.tuan = actor(npcA('tuan'), L + 9.05, -5.5, 'down');
      A.victim = actor(npcA('2'), L + 8.65, -4.15, 'down');
      A.ha = actor(npcA('ha'), L + 3.4, -5.5, 'down');
    },
    update(t) { const k = ease01(t / 9.6); c3Cam(lerp3(L + 2.5, L + 7.5, k), 3.3, 3.6, lerp3(L + 3.5, L + 6.5, k), 1.0, -5.0, 38); },
  });
  shots.push({
    three: true, dur: 6.2, amb: { drone: 0.45 },
    lines: [[0.6, 'tuan', 'Khụ... khụ... Cô ơi... em thấy lạnh quá...'], [3.4, 'hang', 'Tuấn? Em xuống phòng y tế ngay đi...']],
    cues: [[0.5, (s) => s.cough()], [1.8, (s) => s.cough()], [3.0, (s) => s.cough()], [4.6, (s) => s.heartbeat()], [5.3, (s) => s.heartbeat()]],
    update(t) {
      c3Cam(L + 9.85, 1.6, -1.3, L + 9.0, 1.0, -5.5, 32);
      A.tuan.jit = (t > 0.4 && t < 1.1) || (t > 1.7 && t < 2.4) || (t > 2.9 && t < 3.6) ? 0.06 : t > 4.5 ? 0.03 : 0;
      if (t > 1.9 && !A.sp1) { A.sp1 = 1; bloodBurst(A.tuan.x, 1.1, A.tuan.z + 0.2, 5, 0.4); }
      if (b && b.emitter) b.emitter.flicker = t > 4.2 ? 'broken' : b.emitter.flicker;
    },
  });
  shots.push({
    three: true, dur: 5.8, amb: { drone: 0.9 },
    cues: [[0.7, (s) => { s.roar(); s.sting(); }], [2.25, (s) => { s.hit(); s.scream(); }], [2.7, (s) => s.bang()]],
    update(t) {
      c3Cam(L + 9.85, 2.0, -0.5, L + 8.7, 0.95, -4.9, 40);
      if (t > 0.7 && !A.turned) { A.turned = 1; actorSwap(A.tuan, npcA('tuanZ')); hurtFlash = 0.8; C3.shake = 1.4; }
      if (t > 0.7 && t < 2.1) { A.tuan.y = Math.sin((t - 0.7) * 9) * 0.04 + 0.05; A.tuan.jit = 0.05; }
      if (t > 2.1 && !A.lunge) { A.lunge = 1; A.tuan.jit = 0; walkTo(A.tuan, A.victim.x + 0.1, A.victim.z - 0.15, 9); }
      if (t > 2.3 && !A.bite) { A.bite = 1; bloodBurst(A.victim.x, 1.2, A.victim.z, 22, 1.1); C3.shake = 2.2; }
      if (t > 2.6) { A.victim.rot = Math.min(Math.PI / 2, (t - 2.6) * 6); A.victim.y = 0.05; A.victim.dir = 'left'; }
      if (t > 3.0) { for (const id of ['lycas', 'ama', 'naryne', 'hamble', 'tien']) A[id].dir = 'right'; A.ha.dir = 'right'; }
    },
  });
  shots.push({
    three: true, dur: 7.4, amb: { drone: 0.8 },
    lines: [[0.5, 'hamble', 'Tuấn?! Mắt cậu ấy...'], [2.6, 'ama', 'Tất cả lùi lại!']],
    cues: [[4.15, (s) => { s.swing(true); s.hit(); }], [4.2, (s) => s.groan(0, 0, true)], [5.6, (s) => s.roar()]],
    enter() { walkTo(A.ha, L + 8.6, -1.6, 3.2); },
    update(t) {
      c3Cam(lerp3(L + 4.0, L + 5.5, ease01(t / 7.4)), 3.0, 2.6, L + 7.2, 1.0, -4.7, 40);
      if (t > 1.2 && A.ha.path === null && !A.haOut) { A.haOut = 1; walkTo(A.ha, L + 8.6, 1.2, 3.4); }
      if (t > 2.9 && !A.amaGo) { A.amaGo = 1; walkTo(A.ama, A.tuan.x - 0.85, A.tuan.z, 4.2); }
      if (t > 4.1 && !A.punch) { A.punch = 1; A.ama.dir = 'right'; A.ama.x += 0.25; hitSpark(A.tuan.x - 0.3, 1.2, A.tuan.z + 0.1); bloodBurst(A.tuan.x, 1.2, A.tuan.z, 10, 0.8); C3.shake = 1.6; walkTo(A.tuan, A.tuan.x + 0.75, A.tuan.z - 0.25, 6); }
      if (t > 4.3) A.tuan.rot = t < 5.4 ? -0.35 : Math.max(0, -0.35 + (t - 5.4) * 1.2);
      if (t > 4.6 && t < 4.9) A.ama.x -= 0.02;
    },
  });
  shots.push({
    three: true, dur: 7.6, amb: { drone: 0.7 },
    lines: [[0.4, 'hamble', 'Để tớ!'], [2.4, 'hang', 'Các em chạy đi! Và nhớ: đừng uống nước máy!'], [5.4, 'tien', 'Ra hành lang! Đi thôi!']],
    cues: [[1.25, (s) => { s.bang(); s.groan(0, 0, true); }]],
    enter() { walkTo(A.hamble, A.tuan.x - 0.9, A.tuan.z + 0.2, 5); },
    update(t) {
      if (t < 4.4) c3Cam(L + 5.2, 2.7, 2.0, L + 7.0, 1.0, -4.4, 40);
      else c3Cam(L + 13.2, 2.0, 2.15, L + 8.8, 1.05, -0.9, 44);
      if (t > 1.2 && !A.shove) { A.shove = 1; A.hamble.dir = 'right'; hitSpark(A.tuan.x - 0.3, 1.0, A.tuan.z); C3.shake = 2.4; walkTo(A.tuan, Math.min(L + 9.6, A.tuan.x + 1.4), A.tuan.z - 0.8, 9); }
      if (t > 1.35) A.tuan.rot = Math.max(-Math.PI / 2, -(t - 1.35) * 5);
      if (t > 1.6) A.tuan.y = 0.05;
      if (t > 3.0 && !A.run) {
        A.run = 1;
        ['lycas', 'ama', 'naryne', 'hamble', 'tien'].forEach((id, i) => walkTo(A[id], L + 8.6 - i * 0.3, -1.4 + (i % 2) * 0.3, 3.6 + i * 0.2));
        walkTo(A.hang, L + 8.0, -1.6, 2.4);
      }
      if (t > 5.0 && !A.out) {
        // người không đi cùng đội chạy lạc về phía cầu thang bên kia
        const lost = partyIds().includes(CHARS[bench].id) ? null : CHARS[bench].id;
        A.out = 1; ['lycas', 'ama', 'naryne', 'hamble', 'tien'].forEach((id, i) => walkTo(A[id], id === lost ? L - 4 : L + 7.6 + i * 0.6, id === lost ? 1.2 : 0.9, id === lost ? 4.6 : 3.8));
      }
    },
    exit() { c3End(); },
  });
  shots.push(cinema.titleShot('CHƯƠNG 0', 'TIẾT HỌC CUỐI', 'Mục tiêu: tìm KỀM CẮT trong trường · cắt khoá cổng chính tầng 1', 5));
  cinema.define('outbreak', shots);
}

// --- chương 1: ra khỏi cổng trường (3D) ---
let cineHeli = null;
const CH1_TITLE = () => cinema.titleShot('CHƯƠNG 1', 'THÀNH PHỐ BỊ ĐÓNG', 'Mục tiêu: tìm bộ đàm ở đồn cảnh sát để gọi cứu hộ');
function defineCh1() {
  const b = world.buildings.find((q) => q.portal);
  // co-op: game vẫn chạy ngầm nên dùng bản phim 2D
  if (net.active || !b) { cinema.define('ch1', [cinema.shot('citySmoke'), cinema.shot('lockdown'), CH1_TITLE()]); return; }
  const D = b.door, A = {};
  cinema.setTeam(partyIds());
  const party = partyIds(), ids = ['lycas', 'ama', 'naryne', 'hamble', 'tien'].filter((id) => party.includes(id));
  const W2 = cinema.who, HB = () => A[W2('hamble')], AM = () => A[W2('ama')];
  const hero = (id) => charSprites(CHARS.findIndex((c) => c.id === id), CHARS.find((c) => c.id === id).pal).fist;
  const SPOT = [[-2.2, 1.1], [-0.9, 1.6], [0.3, 1.0], [1.5, 1.5], [2.6, 1.15]];
  // cột khói đen phía sau dãy nhà: thành phố đang cháy
  const smokeCols = [[-24, -13], [-8, -15], [9, -12], [26, -14]];
  const burn = (dt) => {
    for (const [ox, z] of smokeCols) if (Math.random() < dt * 10) {
      const c = rand(0.06, 0.15);
      fx.smoke.spawn(D + ox + rand(-1.2, 1.2), rand(7, 9), z + rand(-1, 1), 0.45 + rand(-0.2, 0.2), rand(1.6, 2.4), 0, rand(6, 8), rand(1.8, 2.8), new THREE.Color(c, c * 0.95, c * 0.9), { grav: -0.03, drag: 0.12, mode: 2, spin: rand(-0.5, 0.5) });
    }
  };
  const flyHeli = (k) => {
    if (!cineHeli) cineHeli = makeHeli();
    const g = cineHeli.group; g.visible = k > 0 && k < 1;
    g.position.set(D + 30 - 60 * k, 11.5 + Math.sin(k * 6) * 0.3, -3.5);
    g.rotation.set(0, Math.PI, 0.1);
    cineHeli.rotor.rotation.y += 0.45; cineHeli.tail.rotation.z += 0.5;
    cineHeli.beacon.visible = Math.floor(gtime * 2.5) % 2 === 0;
  };
  const shots = [];
  shots.push({
    three: true, dur: 8.4, cap: ['HẾT CHƯƠNG 0', 'Cổng Trường Quốc tế Vân Lâm'], amb: { wind: 0.6, heli: 0.2, drone: 0.4 },
    lines: [[3.8, 'lycas', 'Không chỉ trường mình... cả thành phố đều như vậy.']],
    enter() {
      c3Begin(true);
      for (const z of zombies) if (z.sprite.group.visible) { z.sprite.group.visible = false; C3.hidden.push(z.sprite.group); }
      ids.forEach((id, i) => { A[id] = actor(hero(id), D + (i - 2) * 0.35, WALL_Z - 0.4, 'down'); });
      for (let i = 0; i < 60; i++) burn(0.12);
    },
    update(t, dt) {
      burn(dt);
      const k = ease01(t / 8.4);
      c3Cam(lerp3(D + 4.6, D + 2.4, k), lerp3(1.3, 1.15, k), lerp3(6.6, 5.9, k), lerp3(D - 0.2, D - 0.4, k), 1.5, lerp3(0, 0.3, k), 42);
      ids.forEach((id, i) => { if (t > 0.4 + i * 0.55 && !A[id].go) { A[id].go = 1; walkTo(A[id], D + SPOT[i][0], SPOT[i][1], 2.2); } });
      if (t > 5.4) { const a1 = A[W2('lycas')], a2 = A[W2('naryne')]; if (!a1.path) a1.dir = 'right'; if (a2 !== a1 && !a2.path) a2.dir = 'left'; }
    },
  });
  shots.push({
    three: true, dur: 7.6, amb: { wind: 0.5, heli: 1, drone: 0.3 },
    lines: [[1.4, 'hamble', 'Trực thăng quân đội! Này! Ở dưới này!'], [4.6, 'tien', 'Họ không dừng lại đâu. Mình phải tự tìm đường sống.']],
    enter() { for (const id of ids) A[id].dir = 'down'; },
    update(t, dt) {
      burn(dt);
      flyHeli(clamp((t - 0.2) / 6.6, 0, 1));
      C3.shake = Math.max(C3.shake, t > 1.5 && t < 4.5 ? 0.35 : 0);
      c3Cam(D + 0.8, 0.45, 6.2, D - 0.6, lerp3(4.2, 5.2, ease01(t / 7.6)), -2, 58);
      const h = HB();
      if (t > 1.0 && !h.go2) { h.go2 = 1; walkTo(h, h.x + 0.3, h.z + 0.8, 2.6); }
      h.y = t > 1.5 && t < 4.3 ? Math.abs(Math.sin(t * 9)) * 0.2 : 0;
      if (t > 1.5 && t < 4.3 && !h.path) h.dir = Math.floor(t * 6) % 2 ? 'right' : 'left';
      if (t > 4.3 && !h.path) h.dir = 'down';
    },
    exit() { if (cineHeli) cineHeli.group.visible = false; HB().y = 0; },
  });
  shots.push({
    three: true, dur: 8.2, amb: { wind: 0.4, drone: 0.8 },
    lines: [[0.7, 'naryne', 'Phía sau! Có người... không, không phải người!'], [5.6, 'ama', 'Đi thôi. Trước khi cả bầy kéo tới.']],
    cues: [[0.5, (s) => s.groan(0, 0, true)], [3.1, (s) => { s.swing(true); s.hit(); }], [3.25, (s) => s.groan(0, 0, true)], [4.35, (s) => s.bang()]],
    enter() {
      const zl = SPR.zombies.student || SPR.zombies.walker;
      A.z = actor(zl[0], D - 9.5, 1.5, 'right');
      walkTo(A.z, D - 6.0, 1.45, 1.5);
      for (const id of ids) A[id].dir = 'left';
    },
    update(t, dt) {
      burn(dt);
      if (t < 2.0) c3Cam(D - 1.2, 1.5, 6.2, D - 4.6, 1.1, 1.2, 40);
      else if (t < 5.0) c3Cam(D - 5.5, 1.3, 4.7, D - 6.3, 1.0, 1.4, 40);
      else c3Cam(lerp3(D - 3.6, D - 1.6, ease01((t - 5) / 3.2)), 1.5, 6.4, D - 2.6, 1.1, 1.2, 44);
      A.z.jit = t < 3.1 ? 0.03 : 0;
      if (t > 2.0 && !A.amaGo) { A.amaGo = 1; walkTo(AM(), D - 5.15, 1.45, 5.4); }
      if (t > 3.1 && !A.punch) {
        A.punch = 1; AM().path = null; AM().dir = 'left'; AM().x -= 0.22; A.z.path = null;
        hitSpark(A.z.x + 0.3, 1.25, A.z.z + 0.1); bloodBurst(A.z.x, 1.2, A.z.z, 14, 0.9); C3.shake = 2;
        walkTo(A.z, D - 7.2, 1.3, 7);
      }
      if (t > 3.25) { A.z.rot = Math.min(Math.PI / 2, (t - 3.25) * 4.5); A.z.y = 0.05; }
      if (t > 3.5 && !A.step) { A.step = 1; walkTo(AM(), D - 6.2, 1.4, 2.6); }
      if (t > 4.3 && !A.stomp) { A.stomp = 1; AM().dir = 'left'; bloodBurst(A.z.x - 0.8, 0.25, A.z.z, 12, 0.7); C3.shake = 1; }
      if (t > 5.0 && !A.go3) { A.go3 = 1; ids.forEach((id, i) => { if (A[id] !== AM()) walkTo(A[id], D + 4 + i * 0.6, 1.8 + (i % 2) * 0.5, 2.6); }); }
      if (t > 6.2 && !A.amaOut) { A.amaOut = 1; walkTo(AM(), D + 2, 1.5, 3); }
    },
    exit() { c3End(); },
  });
  shots.push(cinema.shot('lockdown'), CH1_TITLE());
  cinema.define('ch1', shots);
}

// ================= NÚT BẤM =================
$('start-btn').addEventListener('click', newGameFlow);
$('cs-go').addEventListener('click', startNewGame);
$('cs-back').addEventListener('click', closeCharSel);
$('sk-close').addEventListener('click', () => toggleSkills(false));
document.querySelectorAll('#view-bar .vb').forEach((b) => b.addEventListener('click', () => viewAction(b.dataset.v)));
$('view-show').addEventListener('click', () => viewAction('hud'));
$('again-btn').addEventListener('click', () => (net.active && !net.host ? toast('Chờ chủ phòng bắt đầu ván mới…') : (net.active ? startGame() : (deleteSave(), startGame()))));
$('ov-load').addEventListener('click', continueGame);
$('win-again').addEventListener('click', () => (net.active && !net.host ? toast('Chờ chủ phòng bắt đầu ván mới…') : startGame()));
const menuOut = () => { if (net.room) leaveRoom(); toMenu(); };
$('menu-btn').addEventListener('click', menuOut);
$('win-menu').addEventListener('click', menuOut);
$('coop-btn').addEventListener('click', () => openLobby());
$('create-btn').addEventListener('click', () => joinRoom(makeCode(), true));
$('join-btn').addEventListener('click', () => joinRoom($('code-in').value));
$('code-in').addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') joinRoom($('code-in').value); });
$('nick').addEventListener('keydown', (e) => e.stopPropagation());
$('go-btn').addEventListener('click', () => {
  if (!net.host) return;
  const waiting = roomMembers().filter((x, i) => i > 0 && !x.r).length;
  if (waiting) { setCoopNote(`Còn ${waiting} người chưa bấm SẴN SÀNG.`); return; }
  startCoop(true);
});
$('ready-btn').addEventListener('click', () => {
  if (!net.room || net.host) return;
  net.ready = !net.ready;
  net.room.presence({ r: net.ready ? 1 : 0, c: myChar }).catch(() => {});
  setCoopNote(net.ready ? 'Đã sẵn sàng · chờ chủ phòng bắt đầu…' : 'Chọn nhân vật rồi bấm SẴN SÀNG.');
  renderRoom();
});
$('leave-btn').addEventListener('click', () => { leaveRoom(); setCoopNote('Đã rời phòng.'); });
$('lobby-close').addEventListener('click', closeLobby);
$('lobby-x').addEventListener('click', closeLobby);
$('cs-x').addEventListener('click', closeCharSel);
// nhiệm vụ: bấm để xem/ẩn chi tiết
$('quest-box').addEventListener('click', () => $('quest-box').classList.toggle('open'));
$('bag-close').addEventListener('click', () => toggleBag(false));
$('map-close').addEventListener('click', () => toggleMap(false));
// thanh công cụ (chuột lẫn cảm ứng)
const tapBind = (id, fn) => {
  const b = $(id);
  b.addEventListener('click', () => fn());
  b.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); fn(); }, { passive: false });
};
tapBind('tb-bag', () => { if (craftUI.open) toggleCraft(false); toggleBag(); });
tapBind('tb-craft', () => toggleCraft());
$('minimap').addEventListener('click', () => toggleMap(true));
$('minimap').addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); toggleMap(true); }, { passive: false });
tapBind('tb-skill', () => toggleSkills());
tapBind('tb-pause', () => togglePause());
tapBind('cb-go', () => quickAntidote());
tapBind('tb-view', () => { if (state.mode === 'play') toggleView(); });
// "⋯": mở / gom các nút ít dùng; tự gom lại sau vài giây
let tbMoreT = 0;
function setToolbarOpen(on) {
  $('toolbar').classList.toggle('open', on);
  $('tb-more').setAttribute('aria-expanded', on ? 'true' : 'false');
  clearTimeout(tbMoreT);
  if (on) tbMoreT = setTimeout(() => setToolbarOpen(false), 6000);
}
tapBind('tb-more', () => setToolbarOpen(!$('toolbar').classList.contains('open')));
for (const id of ['tb-craft', 'tb-skill', 'tb-view']) for (const ev of ['click', 'touchstart']) $(id).addEventListener(ev, () => setTimeout(() => setToolbarOpen(false), 150), { passive: true });
// cụm nút hành động trên điện thoại
tapBind('t-reload', reload);
(() => {
  const sw = $('t-swap');
  let done = false, tm = 0;
  sw.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); done = false; clearTimeout(tm); tm = setTimeout(() => { done = true; holster(); }, 480); }, { passive: false });
  sw.addEventListener('touchend', (e) => { e.preventDefault(); clearTimeout(tm); if (!done) cycleWeapon(); }, { passive: false });
  sw.addEventListener('touchcancel', () => clearTimeout(tm));
  sw.addEventListener('click', () => cycleWeapon());
  const at = $('t-atk');
  at.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); interact.atkHold = true; }, { passive: false });
  at.addEventListener('touchend', (e) => { e.preventDefault(); interact.atkHold = false; }, { passive: false });
  at.addEventListener('touchcancel', () => { interact.atkHold = false; });
  at.addEventListener('mousedown', () => { interact.atkHold = true; });
  addEventListener('mouseup', () => { interact.atkHold = false; });
})();
tapBind('t-shove', shove);
tapBind('t-throw', throwMolotov);
// bàn chế đồ
$('cr-go').addEventListener('click', gridCraft);
$('cr-clear').addEventListener('click', () => { gridClear(); craftUI.msg = ''; renderCraft(); });
$('cr-close').addEventListener('click', () => toggleCraft(false));
document.querySelectorAll('#craft .crtab').forEach((b) => b.addEventListener('click', () => { craftUI.tab = b.dataset.tab; craftUI.msg = ''; renderCraft(); }));
// điện thoại dọc: nhắc xoay ngang (chơi một mình thì tạm dừng)
const portraitQ = matchMedia('(orientation: portrait)');
function checkRotate() {
  if (!isTouch || document.body.classList.contains('portrait-ok')) return;
  if (portraitQ.matches && state.mode === 'play' && !state.paused && !net.active) togglePause();
}
if (portraitQ.addEventListener) portraitQ.addEventListener('change', checkRotate);
$('rot-ok').addEventListener('click', () => document.body.classList.add('portrait-ok'));
$('t-use').addEventListener('touchstart', (e) => { e.preventDefault(); if (player && player.pinned) { player.struggle = (player.struggle || 0) + 1; return; } interact.touchHold = true; }, { passive: false });
$('t-use').addEventListener('touchend', (e) => { e.preventDefault(); interact.touchHold = false; }, { passive: false });
$('t-use').addEventListener('touchcancel', () => { interact.touchHold = false; });
$('resume-btn').addEventListener('click', togglePause);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden || state.mode !== 'play' || net.active) return;
  saveGame();
  if (!state.paused && !cinema.active) togglePause();
});
addEventListener('resize', resize);
if (isTouch) document.body.classList.add('touch');

requestAnimationFrame(() => setTimeout(() => {
  try { init(); } catch (e) {
    console.error(e);
    $('loading').textContent = 'Không khởi tạo được WebGL: ' + e.message;
  }
}, 30));

// Tay + vũ khí góc nhìn thứ nhất dạng khối 3D (cùng phong cách nhân vật khối), gắn vào camera.
// Toạ độ theo camera: x phải, y lên, −z là phía trước. Mọi thứ nằm trong ~0,3 m trước mắt nên không đâm xuyên tường.
import * as THREE from 'three';
import { spriteLit } from './pixel.js';

const S = 1 / 130;  // một "khối" của bàn tay (≈0,8 cm)
const SW = 1 / 95;  // một "khối" của vũ khí (to hơn tay một chút cho dễ nhìn)
const C = new THREE.Color();
const SH = S;
function geo(list, S = SH) {
  // [x0,y0,z0,x1,y1,z1,màu] theo đơn vị khối → hộp có màu đỉnh
  const pos = [], nrm = [], col = [], idx = [];
  for (const [x0, y0, z0, x1, y1, z1, c] of list) {
    C.set(c); const cl = [C.r, C.g, C.b];
    const a = [x0 * S, y0 * S, z0 * S], b = [x1 * S, y1 * S, z1 * S];
    const faces = [
      [[b[0], a[1], a[2]], [b[0], b[1], a[2]], [b[0], b[1], b[2]], [b[0], a[1], b[2]], [1, 0, 0]],
      [[a[0], a[1], b[2]], [a[0], b[1], b[2]], [a[0], b[1], a[2]], [a[0], a[1], a[2]], [-1, 0, 0]],
      [[a[0], b[1], a[2]], [a[0], b[1], b[2]], [b[0], b[1], b[2]], [b[0], b[1], a[2]], [0, 1, 0]],
      [[a[0], a[1], b[2]], [a[0], a[1], a[2]], [b[0], a[1], a[2]], [b[0], a[1], b[2]], [0, -1, 0]],
      [[a[0], a[1], b[2]], [b[0], a[1], b[2]], [b[0], b[1], b[2]], [a[0], b[1], b[2]], [0, 0, 1]],
      [[b[0], a[1], a[2]], [a[0], a[1], a[2]], [a[0], b[1], a[2]], [b[0], b[1], a[2]], [0, 0, -1]],
    ];
    for (const [p0, p1, p2, p3, n] of faces) {
      const base = pos.length / 3;
      for (const p of [p0, p1, p2, p3]) { pos.push(p[0], p[1], p[2]); nrm.push(n[0], n[1], n[2]); col.push(cl[0], cl[1], cl[2]); }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

// ---------- các khối ----------
const WOOD = '#8a5a32', WOOD_D = '#6a4424', STEEL = '#9aa0a8', STEEL_D = '#6a6e76', TAPE = '#c8c0a0', DARK = '#26262e';
function fistGeo(skin, skinS, claws) {
  const L = [[-3, -3, -4, 3, 3, 3, skin], [-3, -3.5, -4, 3, -2.6, 3, skinS], [-3.7, -1, -2, -3, 2.4, 2, skin]];   // nắm tay + ngón cái
  if (claws) for (let i = 0; i < 4; i++) L.push([-2.6 + i * 1.5, 1.2, -6.5, -1.8 + i * 1.5, 2.2, -4, '#e8e0c0']);
  return geo(L);
}
// ống tay áo: chạy từ cổ tay về phía sau, được xoay chúi xuống để ra khỏi mép dưới màn hình
const sleeveGeo = (sleeve, sleeveS, skin) => geo([[-2.2, -2.2, 2.5, 2.2, 2.2, 5, skin], [-2.7, -2.7, 5, 2.7, 2.7, 26, sleeve], [-2.8, -2.8, 12, 2.8, 2.8, 13.5, sleeveS]]);
const WGEO = {};
function weaponGeo(w) {
  if (WGEO[w]) return WGEO[w];
  let L = null;
  if (w === 'knife') L = [[-0.9, -1, -1, 0.9, 1, 3, '#3a2418'], [-0.5, -0.8, -12, 0.5, 1.4, -1, '#d8dce4'], [-0.5, 1, -12, 0.5, 1.4, -2, '#f0f2f6']];
  else if (w === 'club' || w === 'nailbat' || w === 'pipe') {
    const c = w === 'pipe' ? STEEL : WOOD, cd = w === 'pipe' ? STEEL_D : WOOD_D;
    L = [[-1.3, -1.3, -1, 1.3, 1.3, 3, '#3a2418'], [-1.3, -1.3, -24, 1.3, 1.3, -1, c], [-1.4, -1.4, -24, 1.4, 1.4, -18, cd]];
    if (w === 'nailbat') for (let i = 0; i < 6; i++) L.push([i % 2 ? 1.2 : -2.4, -0.3, -22 + i * 3, i % 2 ? 2.4 : -1.2, 0.3, -21.5 + i * 3, '#c8ccd4']);
  } else if (w === 'spear') L = [[-0.8, -0.8, -40, 0.8, 0.8, 6, WOOD], [-1.4, -0.5, -46, 1.4, 0.5, -40, '#c8ccd4'], [-0.6, -0.4, -49, 0.6, 0.4, -46, '#eef0f4']];
  else if (w === 'pistol') L = [[-1.4, -1.2, -12, 1.4, 1.6, 2, STEEL], [-1.45, -1.3, -9, 1.45, 1.7, -8, TAPE], [-1.45, -1.3, -3, 1.45, 1.7, -2, TAPE], [-1.2, -5.5, -1, 1.2, -1.2, 2.5, WOOD], [-0.6, 0.2, -12.2, 0.6, 0.8, -11.9, '#111114']];
  else if (w === 'shotgun') L = [[-2.6, -1.2, -26, -0.1, 1.2, 4, STEEL], [0.1, -1.2, -26, 2.6, 1.2, 4, STEEL_D], [-2.7, -1.3, -22, 2.7, 1.3, -21, TAPE], [-2.7, -1.3, -12, 2.7, 1.3, -11, TAPE], [-2.2, -3.2, -17, 2.2, -1.2, -9, WOOD], [-1.8, -4.5, 3, 1.8, 1.4, 12, WOOD_D]];
  else if (w === 'smg') L = [[-2.2, -2, -10, 2.2, 2.6, 4, '#e8b020'], [-1, -0.6, -15, 1, 1, -10, STEEL_D], [2.2, -1, -8, 3.2, 1.6, 2, STEEL], [-1.4, -6, 0, 1.4, -2, 3, DARK], [-2.3, 2.6, -8, 2.3, 3, 2, '#ffd860']];
  else if (w === 'bow') {
    L = [];
    for (let i = -7; i < 7; i++) { const bz = 2.6 * (1 - ((i + 0.5) / 7) ** 2); L.push([-0.8, i * 2.2, -bz - 0.8, 0.8, i * 2.2 + 2.2, -bz + 0.8, i === 0 || i === -1 ? '#3a2414' : '#8a5a2a']); }
    L.push([-0.2, -15, 1.6, 0.2, 15, 2.0, '#e8e0d0']);
  } else if (w === 'arrow') L = [[-0.3, -0.3, -22, 0.3, 0.3, 0, '#b89060'], [-0.7, -0.7, -25, 0.7, 0.7, -22, '#c8ccd4'], [-0.9, -0.1, 0, 0.9, 0.1, 3, '#e8e0d0']];
  else if (w === 'torch') L = [[-0.9, -0.9, -2, 0.9, 0.9, 12, WOOD], [-1.4, -1.4, -5, 1.4, 1.4, -2, '#5a3a22']];
  WGEO[w] = L ? geo(L, SW) : null;
  return WGEO[w];
}

export function makeViewModel(camera) {
  const mat = spriteLit(new THREE.MeshLambertMaterial({ vertexColors: true }), 0.45);
  const glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 2.0, 0.7), fog: false });
  const root = new THREE.Group(); root.visible = false;
  camera.add(root);
  const mk = (g) => { const m = new THREE.Mesh(g, mat); m.castShadow = false; m.frustumCulled = false; return m; };
  const handR = new THREE.Group(), handL = new THREE.Group();
  root.add(handR, handL);
  const armR = mk(new THREE.BufferGeometry()), armL = mk(new THREE.BufferGeometry());
  const slR = mk(new THREE.BufferGeometry()), slL = mk(new THREE.BufferGeometry());
  slR.rotation.x = 0.85; slL.rotation.x = 0.85;
  handR.add(armR, slR); handL.add(armL, slL);
  const gripR = new THREE.Group(); handR.add(gripR);
  const gripL = new THREE.Group(); handL.add(gripL);
  const wMesh = {};
  const flash = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.02), glowMat); flash.visible = false; root.add(flash);
  const flame = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.05, 0.035), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.4, 1.6, 0.4), fog: false })); flame.visible = false; gripL.add(flame);
  const vm = { root, handR, handL, armR, armL, gripR, gripL, flash, flame, skinKey: '', weapon: null, left: null, t: 0 };
  vm.setLook = (pal, zombie) => {
    const key = (zombie ? 'z' : '') + pal.skin + pal.top;
    if (vm.skinKey === key) return;
    vm.skinKey = key;
    const sk = zombie ? '#8ea877' : pal.skin || '#f6cba2', skS = zombie ? '#627d55' : pal.skinS || '#d9977a';
    const f = fistGeo(sk, skS, zombie), sl = zombie ? sleeveGeo('#5a6a4a', '#3e4a32', sk) : sleeveGeo(pal.top || '#4a5a6a', pal.topS || '#34404c', sk);
    for (const m of [armR, armL, slR, slL]) m.geometry.dispose();
    armR.geometry = f; armL.geometry = f.clone(); slR.geometry = sl; slL.geometry = sl.clone();
  };
  const show = (grp, key) => {
    for (const c of grp.children) if (c.userData.w) c.visible = c.userData.w === key;
    if (!key) return;
    let m = grp.children.find((c) => c.userData.w === key);
    if (!m) { const g = weaponGeo(key); if (!g) return; m = mk(g); m.userData.w = key; grp.add(m); }
    m.visible = true;
  };
  vm.setWeapon = (key, left) => {
    if (vm.weapon !== key) { vm.weapon = key; show(gripR, key); }
    if (vm.left !== left) { vm.left = left; show(gripL, left); flame.visible = left === 'torch'; }
  };
  return vm;
}

// cập nhật tư thế mỗi khung. st: trạng thái người chơi (FP, nhịp bước, cú đánh, giật súng…)
export function poseViewModel(vm, st, dt) {
  vm.t += dt;
  const { bob, bobT, sway, swayY, run, strafe, swing, hand, recoil, reload, busy, muzzle, kind, bowReady, zombie, torch } = st;
  const bA = bob * (1 + run * 0.8);
  const ox = Math.cos(bobT) * 0.008 * bA + sway * 0.0012 - strafe * 0.006;
  const oy = -Math.abs(Math.sin(bobT)) * 0.007 * bA - swayY * 0.001 - Math.sin(vm.t * 1.7) * 0.002 * (1 - bob) - run * 0.03 - busy * 0.09 - reload * 0.08;
  const r = vm.root;
  r.position.set(ox, oy, 0);
  r.rotation.set(-recoil * 0.9 - reload * 0.5, -sway * 0.002, Math.cos(bobT) * 0.03 * bA + strafe * 0.05 + run * 0.12);
  const arc = swing > 0 ? Math.sin(swing * Math.PI) : 0;
  const armSw = Math.sin(bobT) * 0.012 * bA;
  const R = vm.handR, L = vm.handL;
  // mặc định: hai nắm tay hai bên phía dưới
  R.position.set(0.085, -0.09 - armSw, -0.2); R.rotation.set(0.3, -0.12, 0);
  L.position.set(-0.085, -0.09 + armSw, -0.2); L.rotation.set(0.3, 0.12, 0);
  L.visible = true; vm.gripR.rotation.set(0, 0, 0); vm.gripR.position.set(0, 0, 0); vm.gripL.position.set(0, 0, 0); vm.gripL.rotation.set(0, 0, 0);
  vm.flash.visible = false;
  if (zombie) {
    // tay zombie: giơ ra trước, quờ quạng
    const w = Math.sin(vm.t * 3) * 0.01;
    R.position.set(0.075, -0.075 + w, -0.21 - arc * 0.05); R.rotation.set(0.1, -0.2, 0.2);
    L.position.set(-0.075, -0.075 - w, -0.21 - arc * 0.05); L.rotation.set(0.1, 0.2, -0.2);
    return;
  }
  if (kind === 'fist') {
    const a = hand === 0 ? arc : 0, b = hand === 1 ? arc : 0;
    L.position.set(-0.085 + a * 0.05, -0.09 + armSw + a * 0.03, -0.2 - a * 0.07); L.rotation.x = 0.3 - a * 0.3;
    R.position.set(0.085 - b * 0.05, -0.09 - armSw + b * 0.03, -0.2 - b * 0.07); R.rotation.x = 0.3 - b * 0.3;
  } else if (kind === 'knife') {
    R.position.set(0.08 - arc * 0.09, -0.085 + arc * 0.025, -0.2 - arc * 0.04); R.rotation.set(0.2 - arc * 0.2, -0.3 + arc * 0.9, -0.3 + arc * 0.6);
    L.position.y -= 0.03;
  } else if (kind === 'club') {
    // vung ngang từ phải sang trái
    R.position.set(0.08 - arc * 0.08, -0.09 + arc * 0.02, -0.2 - arc * 0.03);
    R.rotation.set(0.2, -0.1 + swing * 1.5, 0); vm.gripR.rotation.set(0.95 - swing * 0.6, 0, 0.35 + swing * 0.8);
    L.position.y -= 0.04;
  } else if (kind === 'spear') {
    R.position.set(0.065, -0.095, -0.19 - arc * 0.08); R.rotation.set(0.25, -0.05, 0);
    L.position.set(-0.03, -0.08, -0.25 - arc * 0.08); L.rotation.set(0.25, 0.05, 0);
    vm.gripR.rotation.set(-0.2, 0.06, 0);
  } else if (kind === 'pistol') {
    // hai tay cầm súng giữa màn hình, súng nằm trên bàn tay
    vm.gripR.position.set(0, 4.2 * S, -1.5 * S);
    R.position.set(0.02, -0.065, -0.2); R.rotation.set(0.05, 0, 0);
    L.position.set(-0.016, -0.072, -0.19); L.rotation.set(0.15, 0.4, 0.2);
    vm.flash.position.set(0.02, -0.055, -0.33);
  } else if (kind === 'shotgun' || kind === 'smg') {
    vm.gripR.position.set(0, 4.6 * S, -1 * S);
    R.position.set(0.06, -0.085, -0.18); R.rotation.set(0.08, -0.06, 0);
    L.position.set(0.0, -0.075, -0.27); L.rotation.set(0.25, 0.3, 0.1);
    vm.flash.position.set(0.05, -0.07, kind === 'shotgun' ? -0.48 : -0.35);
  } else if (kind === 'bow') {
    L.position.set(-0.04, -0.05, -0.27); L.rotation.set(0.05, 0, 0);
    R.position.set(0.015, -0.06, -0.21 + (bowReady ? 0.05 : 0)); R.rotation.set(0.1, -0.1, 0);
  }
  if (torch && kind !== 'fist') { L.position.set(-0.1, -0.09 + armSw, -0.21); L.rotation.set(0.3, 0.2, 0); vm.gripL.rotation.set(-1.3, 0, 0); vm.flame.position.set(0, 0, -6 * SW); vm.flame.scale.setScalar(0.85 + Math.sin(vm.t * 23) * 0.15); }
  if (muzzle) { vm.flash.visible = true; vm.flash.rotation.z = vm.t * 40; }
}

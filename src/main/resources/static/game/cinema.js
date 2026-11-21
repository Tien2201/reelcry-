// Đoạn phim cốt truyện: tranh pixel 320×180 vẽ bằng code (dùng lại sprite trong game),
// có thoại kiểu chữ chạy, phụ đề thời gian/địa điểm, âm thanh và nhạc nền căng thẳng.
// Bấm/chạm hoặc Space để tua thoại, nút "Bỏ qua" hoặc Esc để bỏ cả đoạn.
import { CHARS } from './chars.js';
import { charSprites, npcAtlas, npcZombieAtlas } from './sprites.js';

const W = 320, H = 180;
let cv, g, root, ovEl, boxEl, whoEl, txtEl, ptEl, capEl, titleEl, skipEl, fadeEl;
let sound = null, ZA = null;
let cur = null;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const ease = (k) => k * k * (3 - 2 * k);
const seg = (t, a, b) => clamp((t - a) / (b - a), 0, 1);

// ---------------- nhân vật ----------------
const NPC_PAL = {
  khai: { top: '#e8e8ec', topS: '#b8b8c6', topL: '#ffffff', hair: '#55555c', hairS: '#303036', hairL: '#9a9aa4', scarf: '#3a5a8a', scarfS: '#2a4066', pants: '#3a3e4a', pantsS: '#262a34', skin: '#e8bc98', skinS: '#c89474' },
  soldier: { top: '#4a5a3a', topS: '#34402a', topL: '#66764e', hair: '#3a4a2e', hairS: '#28321e', hairL: '#56683f', scarf: '#2a3020', scarfS: '#1a2014', pants: '#3a4a2e', pantsS: '#28321e', skin: '#e0b090', skinS: '#c08870' },
  anchor: { top: '#2a2e3e', topS: '#1c1e2a', topL: '#3e4458', hair: '#1a1a1e', hairS: '#0c0c0e', hairL: '#3a3a44', scarf: '#c83a3a', scarfS: '#8a2424', pants: '#2a2e3e', pantsS: '#1c1e2a' },
  tuan: { top: '#f0f0f4', topS: '#c4c4d0', topL: '#ffffff', hair: '#1a1a20', hairS: '#0c0c10', hairL: '#3a3a48', scarf: '#2a3a6a', scarfS: '#1c2848', pants: '#2a3a6a', pantsS: '#1c2848' },
  ha: { top: '#f0f0f4', topS: '#c4c4d0', topL: '#ffffff', hair: '#4a2a1a', hairS: '#2e1a10', hairL: '#6a4430', scarf: '#c83a4a', scarfS: '#8a2430', pants: '#2a3a6a', pantsS: '#1c2848' },
  hang: { top: '#7a4a9a', topS: '#5a3474', topL: '#9a6aba', hair: '#14141a', hairS: '#08080c', hairL: '#30303c', scarf: '#e8d8f0', scarfS: '#b8a8c8', pants: '#4a3a5a', pantsS: '#30263c' },
  quan: { top: '#4a5a3a', topS: '#34402a', topL: '#66764e', hair: '#8a1a1a', hairS: '#5a0e0e', hairL: '#b03030', scarf: '#c8a030', scarfS: '#8a6a1a', pants: '#3a4a2e', pantsS: '#28321e', skin: '#d8a888', skinS: '#b88068' },
  student: { top: '#f0f0f4', topS: '#c4c4d0', topL: '#ffffff', hair: '#5a3a22', hairS: '#3a2414', hairL: '#7a5434', scarf: '#2a3a6a', scarfS: '#1c2848', pants: '#2a3a6a', pantsS: '#1c2848' },
};
const atl = {};
function A(key) {
  if (atl[key]) return atl[key];
  if (key === 'tuanZ') atl[key] = npcZombieAtlas(7, { top: '#e0e0e4', topS: '#b0b0bc', topL: '#f4f4f8', pants: '#2a3a6a', pantsS: '#1c2848', hair: '#1a1a20', hairS: '#0c0c10', hairL: '#3a3a48' });
  else if (key === 'lord') atl[key] = npcZombieAtlas(99, { skin: '#8a8496', skinS: '#625c70', skinL: '#aaa4b8', top: '#c8c4bc', topS: '#8a867e', topL: '#e0dcd4', pants: '#3a3e4a', pantsS: '#262a34', hair: '#6a6a70', hairS: '#3a3a40', hairL: '#8a8a90', glowEye: '#ff1a1a' }, 'brute');
  else if (key.startsWith('hero')) { const i = +key.slice(4); atl[key] = charSprites(i, CHARS[i].pal).fist; }
  else atl[key] = npcAtlas(NPC_PAL[key]);
  return atl[key];
}
const HERO = (id) => A('hero' + CHARS.findIndex((c) => c.id === id));

const SPK = {
  narr: { name: '' },
  khai: { name: 'Tiến sĩ Khải', color: '#d8e0e8', a: 'khai' },
  council: { name: 'Hội đồng', color: '#9aa8c0' },
  soldier: { name: 'Lính áp giải', color: '#b8c898', a: 'soldier' },
  guard: { name: 'Lính gác', color: '#b8c898', a: 'soldier' },
  anchor: { name: 'Phát thanh viên', color: '#e8d8b0', a: 'anchor' },
  lord: { name: '???', color: '#ff5a4a', a: 'lord', dark: true },
  ha: { name: 'Hà', color: '#f4a8c0', a: 'ha' },
  tuan: { name: 'Tuấn', color: '#a8ccf4', a: 'tuan' },
  hang: { name: 'Cô Hằng', color: '#d0a8f0', a: 'hang' },
  quan: { name: 'Đại tá Quân', color: '#e0d090', a: 'quan' },
  loa: { name: 'Loa phóng thanh', color: '#e0d090' },
  radio: { name: 'Bộ đàm · đội cứu hộ Cánh Sen', color: '#9ad8e8' },
};
for (const c of CHARS) SPK[c.id] = { name: c.name, color: c.color, a: 'hero' + CHARS.indexOf(c) };

// ---------------- vẽ ----------------
function R(x, y, w, h, c) { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
function vg(x, y, w, h, c1, c2) { const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, c1); gr.addColorStop(1, c2); g.fillStyle = gr; g.fillRect(x, y, w, h); }
function glow(x, y, r, c, a = 1) {
  if (a <= 0) return;
  g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = Math.min(1, a);
  const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, c); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); g.restore();
}
function poly(pts, c, a = 1) { g.save(); g.globalAlpha = a; g.fillStyle = c; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill(); g.restore(); }
function cone(x, y, w0, w1, h, c, a) {
  g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = a;
  const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, c); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.beginPath(); g.moveTo(x - w0 / 2, y); g.lineTo(x + w0 / 2, y); g.lineTo(x + w1 / 2, y + h); g.lineTo(x - w1 / 2, y + h); g.closePath(); g.fill(); g.restore();
}
function beam(x, y, ang, len, spread, c, a) {
  g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = a;
  const ex = x + Math.cos(ang) * len, ey = y + Math.sin(ang) * len, px = -Math.sin(ang) * spread, py = Math.cos(ang) * spread;
  const gr = g.createLinearGradient(x, y, ex, ey); gr.addColorStop(0, c); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.beginPath(); g.moveTo(x, y); g.lineTo(ex + px, ey + py); g.lineTo(ex - px, ey - py); g.closePath(); g.fill(); g.restore();
}
function fade(c, a) { if (a <= 0) return; g.save(); g.globalAlpha = Math.min(1, a); g.fillStyle = c; g.fillRect(-W, -H, W * 3, H * 3); g.restore(); }
// sprite: hàng 0 nhìn thẳng, 1 trái, 2 phải, 3 quay lưng; cx = giữa, feet = chân
function spr(a, row, frame, cx, feet, sc = 1, alpha = 1) {
  const c = a.canvas, fw = c.width / 4, fh = c.height / 4;
  g.save(); g.globalAlpha = alpha;
  g.drawImage(c, (frame & 3) * fw, row * fh, fw, fh, Math.round(cx - (fw * sc) / 2), Math.round(feet - fh * sc), Math.round(fw * sc), Math.round(fh * sc));
  g.restore();
}
const silCache = new Map();
let silId = 0;
const silKey = new WeakMap();
function sil(a, row, frame, cx, feet, sc, color, alpha = 1) {
  if (!silKey.has(a)) silKey.set(a, ++silId);
  const key = silKey.get(a) + '|' + row + '|' + frame + '|' + color;
  let c = silCache.get(key);
  const src = a.canvas, fw = src.width / 4, fh = src.height / 4;
  if (!c) {
    c = document.createElement('canvas'); c.width = fw; c.height = fh;
    const x = c.getContext('2d');
    x.drawImage(src, (frame & 3) * fw, row * fh, fw, fh, 0, 0, fw, fh);
    x.globalCompositeOperation = 'source-in'; x.fillStyle = color; x.fillRect(0, 0, fw, fh);
    silCache.set(key, c);
  }
  g.save(); g.globalAlpha = alpha;
  g.drawImage(c, Math.round(cx - (fw * sc) / 2), Math.round(feet - fh * sc), Math.round(fw * sc), Math.round(fh * sc));
  g.restore();
}
// mắt đỏ phát sáng của zombie (khung nhìn thẳng)
function eyes(cx, ey, sc, a = 1, gap = 2.6) {
  R(cx - gap * sc - sc * 0.6, ey, sc * 1.3, Math.max(1, sc * 0.8), '#ff2a1a'); R(cx + gap * sc - sc * 0.6, ey, sc * 1.3, Math.max(1, sc * 0.8), '#ff2a1a');
  glow(cx - gap * sc, ey, 4 + sc * 3, 'rgba(255,40,20,0.9)', a); glow(cx + gap * sc, ey, 4 + sc * 3, 'rgba(255,40,20,0.9)', a);
}
function rain(t, n = 150, sp = 300, slant = 0.22, col = 'rgba(170,190,225,0.5)') {
  g.save(); g.strokeStyle = col; g.lineWidth = 1; g.beginPath();
  for (let i = 0; i < n; i++) {
    const v = 0.75 + ((i * 37) % 10) / 20, y = ((i * 41.7 + t * sp * v) % (H + 30)) - 15, x = (((i * 73.13) % (W + 60)) + y * slant) % (W + 60) - 30, l = 4 + (i % 4);
    g.moveTo(Math.round(x), Math.round(y)); g.lineTo(Math.round(x + l * slant), Math.round(y + l));
  }
  g.stroke(); g.restore();
}
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function skyline(seed, base, hMin, hMax, col, win, winA, x0 = 0, x1 = W) {
  const r = rng(seed);
  let x = x0 - 6;
  while (x < x1) {
    const w = 10 + Math.floor(r() * 22), h = hMin + Math.floor(r() * (hMax - hMin));
    R(x, base - h, w, h, col);
    if (r() < 0.3) R(x + w / 2 - 1, base - h - 6, 1, 6, col);
    if (win) for (let yy = base - h + 3; yy < base - 3; yy += 4) for (let xx = x + 2; xx < x + w - 2; xx += 3) if (r() < winA) R(xx, yy, 1, 2, win);
    x += w + Math.floor(r() * 3);
  }
}
function smoke(x, y, t, n = 9, hgt = 90, a = 0.55, col = '40,36,40') {
  for (let i = 0; i < n; i++) {
    const p = (t * 0.12 + i / n) % 1;
    const r = 4 + p * 16, px = x + Math.sin(p * 5 + i) * 6 + p * 14, py = y - p * hgt;
    g.fillStyle = `rgba(${col},${(a * (1 - p)).toFixed(3)})`;
    g.beginPath(); g.arc(px, py, r, 0, Math.PI * 2); g.fill();
  }
}
function blast(x, y, k, sc = 1) {
  if (k <= 0 || k >= 1) return;
  const r = (6 + k * 26) * sc;
  glow(x, y, r * 2.2, 'rgba(255,140,40,0.9)', 1 - k);
  g.fillStyle = `rgba(255,${Math.round(220 - k * 160)},${Math.round(120 - k * 110)},${(1 - k).toFixed(3)})`;
  g.beginPath(); g.arc(x, y - k * 8 * sc, r * (0.6 + k * 0.4), 0, Math.PI * 2); g.fill();
  g.fillStyle = `rgba(40,30,30,${(k * 0.7).toFixed(3)})`;
  g.beginPath(); g.arc(x, y - 6 - k * 20 * sc, r * 0.7, 0, Math.PI * 2); g.fill();
}
function heliShape(x, y, sc, t, lit = true) {
  const s = sc;
  R(x - 14 * s, y - 4 * s, 22 * s, 8 * s, '#2a3226'); R(x - 14 * s, y - 4 * s, 22 * s, 2 * s, '#3e4a36');
  R(x + 6 * s, y - 3 * s, 6 * s, 5 * s, '#1a2018'); R(x + 7 * s, y - 2 * s, 4 * s, 3 * s, lit ? '#7aa8c8' : '#2a3a48');
  R(x - 30 * s, y - 3 * s, 17 * s, 2 * s, '#2a3226'); R(x - 32 * s, y - 6 * s, 3 * s, 6 * s, '#2a3226');
  R(x - 10 * s, y + 4 * s, 1 * s, 3 * s, '#1a1a1a'); R(x + 4 * s, y + 4 * s, 1 * s, 3 * s, '#1a1a1a'); R(x - 13 * s, y + 7 * s, 20 * s, 1 * s, '#1a1a1a');
  const bl = Math.abs(Math.sin(t * 40));
  R(x - 22 * s - bl * 4 * s, y - 6 * s, (44 + bl * 8) * s, Math.max(1, s * 0.6), 'rgba(30,34,30,0.75)');
  R(x - 2 * s, y - 6 * s, 2 * s, 2 * s, '#1a1a1a');
  if (Math.sin(t * 6) > 0.6) { R(x - 32 * s, y - 6 * s, s, s, '#ff3a2a'); glow(x - 32 * s, y - 6 * s, 5 * s, 'rgba(255,60,40,0.9)'); }
}
function bomber(x, y, t) {
  poly([[x - 16, y], [x + 14, y - 1], [x + 18, y + 1], [x - 14, y + 3]], '#0c0c12');
  poly([[x - 2, y], [x + 6, y], [x - 6, y - 10], [x - 10, y - 10]], '#0c0c12');
  poly([[x - 2, y + 2], [x + 6, y + 2], [x - 6, y + 11], [x - 10, y + 11]], '#0c0c12');
  if (Math.sin(t * 7 + x) > 0.7) glow(x - 14, y + 1, 4, 'rgba(255,60,60,0.9)');
}
// mèo mướp nhìn ngang (đầu bên phải). mode: walk | drink | shake | curl
function cat(x, feet, sc, t, mode, red) {
  const s = sc, B = '#c8863a', S = '#8a5420', L = '#e8b070';
  if (mode === 'curl') {
    R(x - 7 * s, feet - 5 * s, 14 * s, 5 * s, B); R(x - 7 * s, feet - 5 * s, 14 * s, s, L);
    for (let i = 0; i < 5; i++) R(x - 6 * s + i * 3 * s, feet - 5 * s, s, 4 * s, S);
    R(x + 4 * s, feet - 7 * s, 4 * s, 4 * s, B); R(x + 4 * s, feet - 8 * s, s, s, B); R(x + 7 * s, feet - 8 * s, s, s, B);
    R(x + 5 * s, feet - 5 * s, s, s, red ? '#ff2a1a' : '#3a2a1a');
    return;
  }
  const step = mode === 'walk' ? Math.floor(t * 8) % 2 : 0;
  const jx = mode === 'shake' ? (Math.random() - 0.5) * 2 * s : 0;
  const bx = x + jx, top = feet - 8 * s;
  R(bx - 6 * s, top, 11 * s, 5 * s, B); R(bx - 6 * s, top, 11 * s, s, L);
  for (let i = 0; i < 4; i++) R(bx - 5 * s + i * 3 * s, top, s, 4 * s, S);
  const lg = [[-5, step], [-2, 1 - step], [2, step], [4, 1 - step]];
  for (const [lx, up] of lg) R(bx + lx * s, top + 5 * s, s, (3 - up) * s, S);
  R(bx - 8 * s, top - 3 * s, s, 4 * s, B); R(bx - 9 * s, top - 4 * s, s, 2 * s, B);
  const down = mode === 'drink' ? 3 + Math.round(Math.sin(t * 6)) : 0;
  const hx = bx + 5 * s, hy = top - 3 * s + down * s;
  R(hx, hy, 5 * s, 5 * s, B); R(hx, hy, 5 * s, s, L); R(hx + s, hy - s, s, s, B); R(hx + 3 * s, hy - s, s, s, B);
  R(hx + 3 * s, hy + 2 * s, s, s, red ? '#ff2a1a' : '#2a6a2a');
  if (red) glow(hx + 3.5 * s, hy + 2.5 * s, 5 * s, 'rgba(255,40,20,0.9)');
  R(hx + 5 * s, hy + 3 * s, s, s, '#e8a0a0');
}
function lily(x, y, s, a = 1) {
  g.save(); g.globalAlpha = a; g.strokeStyle = '#e8283a'; g.lineWidth = Math.max(1, s * 0.6);
  for (let k = 0; k < 7; k++) { const an = -Math.PI / 2 + (k - 3) * 0.42; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(an) * 5 * s, y + Math.sin(an) * 5 * s - 2 * s, x + Math.cos(an) * 9 * s, y + Math.sin(an) * 9 * s - 4 * s); g.stroke(); }
  g.strokeStyle = '#ff8a8a'; g.lineWidth = Math.max(1, s * 0.3);
  for (let k = 0; k < 5; k++) { const an = -Math.PI / 2 + (k - 2) * 0.5; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(an) * 12 * s, y + Math.sin(an) * 12 * s - 3 * s); g.stroke(); }
  R(x - 0.5, y, 1, 10 * s, '#3a7a3a');
  g.restore();
}
function tvFrame(x, y, w, h, t, inner) {
  glow(x + w / 2, y + h / 2, w * 0.9, 'rgba(70,110,200,0.35)');
  R(x - 8, y - 8, w + 16, h + 16, '#141418'); R(x - 8, y - 8, w + 16, 2, '#2a2a30');
  R(x + w / 2 - 20, y + h + 8, 40, 6, '#0e0e12');
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); g.translate(x, y);
  inner(w, h);
  for (let yy = 0; yy < h; yy += 2) R(0, yy, w, 1, 'rgba(0,0,0,0.22)');
  if (Math.random() < 0.06) R(0, Math.random() * h, w, 2, 'rgba(255,255,255,0.12)');
  g.restore();
  glow(x + w * 0.25, y + h * 0.2, 26, 'rgba(255,255,255,0.08)');
}
function desk(x, feet, w = 30) { R(x - w / 2, feet - 15, w, 3, '#b07a42'); R(x - w / 2, feet - 15, w, 1, '#d09a5a'); R(x - w / 2 + 1, feet - 12, w - 2, 12, '#7a5028'); R(x - w / 2 + 1, feet - 12, w - 2, 1, '#5a3a1c'); }

// ---------------- cảnh ----------------
// shot: { cap:[lớn, nhỏ], dur, lines:[[t, ai, thoại]], cues:[[t, fn(sound)]], ov:[...], amb, cam(t), draw(t, S), title }
const SH = {};
SH.lab = {
  cap: ['HAI NĂM TRƯỚC', 'Phòng thí nghiệm B-0 · dưới lòng Trường Quốc tế Vân Lâm'],
  dur: 12.8, amb: { drone: 0.6 },
  cam: (t) => ({ x: 150 + t * 0.8, y: 92, z: 1 + t * 0.014 }),
  lines: [[3.2, 'khai', 'Mẫu số 47. Vết cắt sâu ba phân...'], [5.8, 'khai', '...lành hẳn sau bốn mươi giây.'], [8.2, 'khai', 'Nó không còn biết đau nữa.'], [10.4, 'khai', 'Thành công rồi.']],
  cues: [[0.6, (s) => s.beep()], [1.6, (s) => s.beep()], [2.6, (s) => s.beep()], [3.6, (s) => s.beep()], [4.6, (s) => s.heartbeat()], [6.6, (s) => s.bang()], [7.1, (s) => s.bang()], [7.7, (s) => s.bang()], [8.6, (s) => s.bang()], [9.4, (s) => s.bang()]],
  ov: [{ x: 62, y: 66, text: 'BN-0 · THỬ NGHIỆM 47', cls: 'mono' }],
  draw(t) {
    vg(-20, -20, W + 40, 150, '#0b171b', '#15282d');
    for (let x = -20; x < W + 20; x += 40) R(x, -20, 1, 150, '#08110f');
    R(-20, 58, W + 40, 2, '#1a2e33');
    R(14, 20, 96, 62, '#05080a'); R(18, 24, 88, 54, '#06201e');
    for (let x = 0; x < 84; x++) { const spike = x > 40 && x < 52 ? 9 : 2; R(20 + x, 58 + Math.sin(x * 0.35 + t * 5) * spike, 1, 1, '#3aff9a'); }
    for (let i = 0; i < 13; i++) { const ph = i * 0.55 + t * 1.6; R(24 + i * 6, 40 + Math.sin(ph) * 5, 2, 2, '#ff4a6a'); R(24 + i * 6, 40 - Math.sin(ph) * 5, 2, 2, '#4ad8ff'); }
    glow(62, 50, 64, 'rgba(40,255,160,0.22)');
    for (const sy of [44, 74]) {
      R(226, sy, 90, 3, '#2a3a40');
      for (let i = 0; i < 10; i++) { const c = ['#3aff8a', '#ff3a4a', '#8ad8ff', '#ffd84a'][(i * 7) % 4]; R(230 + i * 8, sy - 7, 3, 7, c); glow(231 + i * 8, sy - 4, 6, c, 0.25); }
    }
    vg(-20, 130, W + 40, 70, '#0c1618', '#050909');
    for (let i = 0; i < 7; i++) R(-20, 132 + i * i * 1.4, W + 40, 1, '#132221');
    R(149, -20, 1, 44, '#2a2a2a'); R(140, 24, 19, 4, '#3a4a4a');
    cone(149.5, 28, 18, 120, 96, 'rgba(255,240,200,0.6)', 0.5);
    R(64, 112, 176, 5, '#46565c'); R(64, 112, 176, 1, '#6a7a80'); R(70, 117, 4, 22, '#2a3438'); R(230, 117, 4, 22, '#2a3438');
    const slam = t > 6.5 ? Math.round(Math.sin(t * 38) * (Math.sin(t * 9) > 0 ? 1 : 0)) : 0;
    const cx = 132 + slam;
    R(cx - 2, 90, 34, 2, '#9aa8ae');
    // chuột
    let mx = cx + 12, my = 107, eye = false;
    if (t > 5.3) eye = true;
    if (t > 6.5) { mx = cx + 3 + Math.abs(Math.sin(t * 7)) * 22; my = 106 - Math.abs(Math.sin(t * 14)) * 6; }
    R(mx, my, 5, 3, '#e8e4e8'); R(mx - 3, my + 2, 3, 1, '#e8a0a8'); R(mx + 4, my, 1, 1, '#e8a0a8');
    if (t < 4.2) { if (Math.sin(t * 8) > -0.3) R(mx + 2, my, 2, 1, '#d8202a'); }
    else if (t < 5.2) { const k = seg(t, 4.2, 5.2); for (let i = 0; i < 5; i++) R(mx + 1 + i, my - 2 - ((t * 20 + i * 3) % 8), 1, 1, i % 2 ? '#aaffcc' : '#ffffff'); R(mx + 2, my, 2, 1, `rgba(216,32,42,${1 - k})`); }
    if (eye) { R(mx + 4, my + 1, 1, 1, '#ff1a1a'); glow(mx + 4.5, my + 1.5, 5, 'rgba(255,30,30,0.9)'); }
    for (let i = 0; i <= 10; i++) R(cx - 2 + i * 3.3, 92, 1, 18, '#7a888e');
    R(cx - 2, 110, 34, 2, '#9aa8ae');
    spr(A('khai'), 1, 0, 228, 154, 2);
    glow(214, 104, 10, 'rgba(160,220,255,0.25)');
  },
};
SH.council = {
  cap: ['HAI THÁNG TRƯỚC', 'Phòng họp kín · Hội đồng An ninh'],
  dur: 11.2, amb: { drone: 0.5 },
  lines: [[1.8, 'council', 'Một đội quân tự lành vết thương... nhưng không ai điều khiển được.'], [4.9, 'council', 'Khai tử Dự án Bỉ Ngạn. Tiêu huỷ toàn bộ hồ sơ.'], [8.0, 'council', 'Còn tiến sĩ Khải... đưa tới trại K-9. Xử lý cho êm.']],
  cues: [[4.7, (s) => s.click()]],
  ov: [{ x: 132, y: 44, text: 'DỰ ÁN BỈ NGẠN', cls: 'scr', to: 4.7 }, { x: 132, y: 53, text: 'Báo cáo cuối · chủng BN-0', cls: 'scr sm', to: 4.7 }],
  draw(t) {
    vg(0, 0, W, H, '#07070b', '#0e0e16');
    const off = t > 4.7;
    const on = !off ? 1 : Math.max(0, 1 - (t - 4.7) / 0.35);
    R(84, 12, 152, 78, '#040406');
    if (on > 0) {
      const hh = off ? 72 * on * on : 72;
      R(88, 51 - hh / 2, 144, Math.max(1, hh), '#12386a');
      if (!off) { for (let i = 0; i < 8; i++) { const bh = 6 + ((i * 13) % 18); R(96 + i * 9, 84 - bh, 6, bh, '#4a9ad8'); } lily(206, 72, 1.5); }
      glow(160, 51, 120, 'rgba(60,120,220,0.35)', on);
    } else if (t < 5.4) R(158, 50, 4, 2, '#cfe8ff');
    poly([[30, 180], [290, 180], [208, 104], [112, 104]], '#17110d');
    poly([[112, 104], [208, 104], [210, 107], [110, 107]], '#2a2018');
    if (on > 0) poly([[132, 110], [188, 110], [200, 132], [120, 132]], '#3a6ab0', 0.22 * on);
    const seats = [[104, 122, 0.9, 1], [86, 144, 1.05, 1], [64, 172, 1.25, 1], [216, 122, 0.9, -1], [234, 144, 1.05, -1], [256, 172, 1.25, -1]];
    for (const [x, y, sc, side] of seats) {
      g.fillStyle = '#08080d';
      g.beginPath(); g.arc(x, y - 24 * sc, 5.5 * sc, 0, Math.PI * 2); g.fill();
      poly([[x - 11 * sc, y], [x + 11 * sc, y], [x + 8 * sc, y - 17 * sc], [x - 8 * sc, y - 17 * sc]], '#08080d');
      if (on > 0) { R(x + side * 5 * sc - (side < 0 ? 1 : 0), y - 28 * sc, 1, 7 * sc, `rgba(90,140,220,${0.6 * on})`); R(x + side * 8 * sc - (side < 0 ? 1 : 0), y - 16 * sc, 1, 14 * sc, `rgba(90,140,220,${0.45 * on})`); }
    }
  },
};
SH.escort = {
  dur: 9.6, amb: { drone: 0.75 },
  lines: [[0.8, 'soldier', 'Đi nhanh lên, tiến sĩ.'], [3.4, 'khai', '(thì thầm) Các người sẽ phải công nhận nó...']],
  cues: [[0.3, (s) => s.step()], [0.7, (s) => s.step()], [1.1, (s) => s.step()], [1.5, (s) => s.step()], [6.0, (s) => { s.hiss(); s.heartbeat(); }], [6.8, (s) => s.heartbeat()], [7.6, (s) => s.heartbeat()]],
  draw(t) {
    if (t < 5.2) {
      vg(0, 0, W, 120, '#1a1c20', '#25282d'); vg(0, 120, W, 60, '#15161a', '#0a0a0c');
      const off = (t * 34) % 64;
      for (let x = -64; x < W + 64; x += 64) { const xx = x - off; R(xx, 0, 22, 5, '#e8e8d0'); cone(xx + 11, 5, 22, 80, 130, 'rgba(255,250,220,0.5)', 0.3); R(xx + 44, 22, 2, 98, '#121418'); R(xx + 2, 140, 18, 1, 'rgba(255,250,220,0.12)'); }
      const f = Math.floor(t * 7);
      spr(A('soldier'), 2, f, 118, 160, 2); spr(A('khai'), 2, f + 1, 166, 162, 2); spr(A('soldier'), 2, f + 2, 214, 160, 2);
    } else {
      vg(0, 0, W, H, '#0a0a0e', '#141418');
      R(-10, 72, 182, 58, '#d4d4da'); R(-10, 72, 182, 4, '#f0f0f4'); R(-10, 126, 182, 4, '#a4a4b0');
      for (let i = 0; i < 5; i++) R(10 + i * 34, 80, 1, 44, '#bcbcc8');
      R(170, 80, 62, 40, '#e8b898'); R(170, 80, 62, 3, '#f8cca8'); R(228, 84, 34, 32, '#e8b898');
      for (let i = 0; i < 4; i++) R(262, 86 + i * 8, 10, 6, '#e0b090');
      const k = ease(seg(t, 5.3, 6.1));
      const vx = 196, vy = 4 + k * 46;
      R(vx, vy, 12, 28, 'rgba(200,220,230,0.45)'); R(vx + 1, vy + 9, 10, 18, '#c8102a'); R(vx + 2, vy + 9, 2, 18, '#ff5a6a');
      glow(vx + 6, vy + 18, 22, 'rgba(255,40,60,0.7)');
      R(vx + 5, vy + 28, 2, 12, '#c8d0d8');
      if (t > 6.05) { const a = Math.max(0, 1 - (t - 6.05) / 1.4); fade('#c80014', a * 0.5); }
      if (t > 6.4) { const a = Math.min(1, t - 6.4) * 0.85; for (let i = 0; i < 7; i++) R(176 + i * 8, 92 + (i % 3) * 6, 7, 1, `rgba(90,20,60,${a})`); }
    }
  },
};
SH.camp = {
  cap: ['MỘT THÁNG TRƯỚC', 'Trại giam K-9 · ngoại ô Vân Lâm'],
  dur: 12.6, amb: { rain: 1, wind: 0.8, drone: 0.6 },
  lines: [[1.3, 'narr', 'Đêm mưa. Từ phòng biệt giam số 9 vọng ra tiếng gào không còn giống tiếng người.'], [5.4, 'guard', 'Cái gì đang đập cửa vậy?!'], [8.7, 'guard', 'Bắn! BẮN ĐI!']],
  cues: [[0.2, (s) => s.thunder(0.8)], [3.1, (s) => s.roar()], [5.6, (s) => s.bang()], [6.4, (s) => s.bang()], [7.1, (s) => s.bang()], [7.8, (s) => s.bang()], [8.3, (s) => { s.bang(); s.roar(); }], [8.9, (s) => s.shoot('pistol')], [9.2, (s) => s.shoot('smg')], [9.5, (s) => s.shoot('pistol')], [9.9, (s) => s.shoot('smg')], [10.4, (s) => s.scream()]],
  shake: (t) => { for (const b of [5.6, 6.4, 7.1, 7.8, 8.3]) if (t > b && t < b + 0.18) return 2.5; return t > 8.3 && t < 9 ? 1.5 : 0; },
  draw(t) {
    if (t < 5) {
      const fl = (t % 3.3 < 0.12 || (t % 3.3 > 0.2 && t % 3.3 < 0.26)) ? 1 : 0;
      vg(0, 0, W, 120, fl ? '#5a6a88' : '#04060a', fl ? '#8a9ab8' : '#0c121a');
      R(40, 64, 236, 78, '#10161c'); R(40, 64, 236, 3, '#1c242c');
      for (let i = 0; i < 9; i++) { const wx = 54 + i * 25; R(wx, 84, 6, 8, (i * 5) % 3 ? '#4a4020' : '#6a5a2a'); R(wx + 2, 84, 1, 8, '#10161c'); R(wx + 4, 84, 1, 8, '#10161c'); }
      R(18, 26, 16, 116, '#0c1016'); R(14, 22, 24, 8, '#141a20');
      const ang = Math.PI / 2 + Math.sin(t * 0.9) * 0.7;
      beam(26, 28, ang, 150, 22, 'rgba(255,250,220,0.9)', 0.35);
      vg(0, 142, W, 38, '#0b0d10', '#050607');
      for (let i = 0; i < 4; i++) R(30 + i * 80, 160, 40, 1, 'rgba(160,170,190,0.18)');
      for (let x = -4; x < W; x += 26) R(x, 118, 2, 44, '#1a1c20');
      for (const wy of [122, 133, 144]) { for (let x = 0; x < W; x += 4) R(x, wy + ((x / 4) % 2), 3, 1, '#2a2c30'); }
      rain(t);
      if (fl) fade('#ffffff', 0.12);
    } else {
      const lt = t - 5;
      vg(0, 0, W, H, '#16181c', '#0c0d10');
      for (let i = 0; i < 6; i++) R(0, 20 + i * 22, W, 1, '#1c1f24');
      glow(160, 10, 80, 'rgba(255,240,200,0.25)', 0.8 + Math.sin(t * 13) * 0.1);
      const burst = t > 8.3;
      if (!burst) {
        R(118, 44, 84, 112, '#4a5058'); R(118, 44, 84, 3, '#6a7078'); R(118, 44, 3, 112, '#5a6068');
        for (let i = 0; i < 6; i++) { R(124, 52 + i * 18, 2, 2, '#7a8088'); R(194, 52 + i * 18, 2, 2, '#7a8088'); }
        R(146, 60, 28, 6, '#08080a'); R(152, 61, 16, 4, lt > 0.5 ? '#3a0a0a' : '#0a0a0c');
        if (lt > 0.5) glow(160, 63, 14, 'rgba(255,40,30,0.8)', 0.5 + Math.sin(t * 5) * 0.3);
        const dents = [5.6, 6.4, 7.1, 7.8].filter((b) => t > b).length;
        for (let i = 0; i < dents; i++) { g.fillStyle = 'rgba(20,22,26,0.7)'; g.beginPath(); g.ellipse(140 + i * 12, 100 + (i % 2) * 14, 7, 9, 0, 0, Math.PI * 2); g.fill(); g.fillStyle = 'rgba(120,128,136,0.6)'; g.fillRect(136 + i * 12, 94 + (i % 2) * 14, 2, 2); }
      } else {
        R(118, 44, 84, 112, '#020203');
        const k = seg(t, 8.3, 8.75);
        if (k < 1) { g.save(); g.translate(160 - k * 120, 100 + k * 60); g.rotate(-k * 1.2); R(-42, -56, 84, 112, '#4a5058'); g.restore(); }
        const st = seg(t, 8.5, 11.5);
        const sc = 2.2 + st * 0.9;
        sil(A('lord'), 0, Math.floor(t * 3), 160, 156 + st * 14, sc, '#0a0a10');
        eyes(160, 156 + st * 14 - 29.5 * sc, sc * 0.8, 1);
      }
      for (const [gx, side] of [[70, 1], [250, -1]]) {
        const down = side > 0 && t > 10.4;
        if (down) { sil(A('soldier'), 3, 0, gx - 10, 186, 2.6, '#06070a', 0.9); continue; }
        spr(A('soldier'), 3, 0, gx, 184, 2.6);
        for (const tf of [8.9, 9.2, 9.5, 9.9]) if (t > tf && t < tf + 0.08) { glow(gx + side * 14, 132, 22, 'rgba(255,220,120,1)'); R(gx + side * 14 - 2, 130, 4, 4, '#fff6c8'); }
      }
      if (t > 10.4 && t < 10.7) fade('#a00010', 0.4);
      if (t > 11.6) fade('#000', (t - 11.6) / 0.8);
    }
  },
};
SH.bomb = {
  dur: 5.2, amb: { wind: 0.4, drone: 0.4 },
  cap: ['NGAY SAU ĐÓ', 'Quân đội ném bom xoá dấu vết'],
  cues: [[1.7, (s) => s.boom(0.7)], [2.3, (s) => s.boom(1)], [2.9, (s) => s.boom(0.85)], [3.6, (s) => s.boom(0.6)]],
  shake: (t) => { for (const b of [1.7, 2.3, 2.9, 3.6]) if (t > b && t < b + 0.25) return 2; return 0; },
  draw(t) {
    vg(0, 0, W, 150, '#05060c', '#1a1018');
    const fire = seg(t, 1.7, 3.5);
    glow(160, 150, 120, 'rgba(255,100,30,0.6)', fire);
    skyline(3, 150, 6, 18, '#07070a');
    R(110, 136, 100, 14, '#0a0a0e'); R(150, 128, 12, 8, '#0a0a0e');
    vg(0, 150, W, 30, '#0a0808', '#050404');
    for (let i = 0; i < 3; i++) {
      const bx = -40 + t * 90 - i * 22, by = 26 + i * 9;
      bomber(bx, by, t);
      for (let j = 0; j < 2; j++) {
        const tr = 0.9 + i * 0.3 + j * 0.25, k = seg(t, tr, tr + 0.8);
        if (t > tr && k < 1) { const rx = -40 + tr * 90 - i * 22 + k * 30, ry = by + 4 + k * k * 110; R(rx, ry, 2, 3, '#14141a'); }
      }
    }
    for (const [x, tb] of [[130, 1.7], [170, 2.3], [150, 2.9], [195, 3.6]]) { blast(x, 140, seg(t, tb, tb + 1.6), 1.1); if (t > tb + 0.8) smoke(x, 138, t - tb, 7, 70, 0.5); }
  },
};
SH.tv = {
  dur: 8.2, amb: { drone: 0.3 },
  lines: [[0.9, 'anchor', '...sự cố rò rỉ hoá chất ở khu công nghiệp phía bắc đã được khống chế hoàn toàn.'], [4.6, 'anchor', 'Người dân không cần lo lắng.']],
  cues: [[0.1, (s) => s.tvStatic(0.45, 0.12)]],
  ov: [{ x: 99, y: 116, text: 'TIN KHẨN', cls: 'tvred' }, { x: 66, y: 125, w: 188, text: 'Rò rỉ hoá chất tại khu công nghiệp ngoại ô · Tình hình đã được kiểm soát · Người dân không cần lo lắng · Quân đội phong toả khu vực để xử lý', cls: 'ticker' }],
  draw(t) {
    vg(0, 0, W, H, '#0a080c', '#060508');
    R(0, 150, W, 30, '#0c0a0c');
    tvFrame(66, 26, 188, 112, t, (w, h) => {
      vg(0, 0, w, h, '#1a3a7a', '#0a1a3a');
      for (let i = 0; i < 6; i++) R(10 + i * 32, 10, 20, 50, 'rgba(120,170,255,0.08)');
      spr(A('anchor'), 0, 0, w / 2, 86, 2.2);
      R(30, 74, w - 60, 16, '#d8d8e0'); R(30, 74, w - 60, 2, '#f4f4f8');
      R(0, 86, w, 10, '#c81a1a'); R(0, 96, w, 16, '#0a0a14');
    });
    if (t < 0.4) fade('#ffffff', (0.4 - t) * 0.6);
  },
};
SH.manhole = {
  cap: ['CÙNG ĐÊM ĐÓ', ''],
  dur: 5, amb: { rain: 0.7, wind: 0.4, drone: 0.7 },
  lines: [[0.9, 'narr', 'Giữa đám cháy, một bóng người lẩn xuống cống ngầm.']],
  cues: [[1.8, (s) => s.groan(0, 0, true)]],
  draw(t) {
    vg(0, 0, W, 110, '#06070c', '#10121a');
    skyline(11, 110, 30, 80, '#0a0b10', '#5a4a2a', 0.06);
    vg(0, 110, W, 70, '#141418', '#0a0a0c');
    R(240, 30, 3, 82, '#1a1a1e'); R(232, 30, 16, 3, '#2a2a2e');
    cone(240, 33, 10, 90, 80, 'rgba(255,220,160,0.7)', 0.45);
    for (let i = 0; i < 6; i++) R(150 + i * 18, 150, 12, 1, 'rgba(255,220,160,0.12)');
    g.fillStyle = '#020203'; g.beginPath(); g.ellipse(150, 148, 22, 6, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#3a3a40'; g.beginPath(); g.ellipse(190, 156, 20, 5, 0, 0, Math.PI * 2); g.fill();
    const d = seg(t, 1.5, 3.8);
    g.save(); g.beginPath(); g.rect(0, 0, W, 148); g.clip();
    sil(A('lord'), 1, 0, 150, 148 + d * 70, 2.2, '#050508');
    if (d < 0.6) { const sc = 2.2; R(150 - 4 * sc, 148 + d * 70 - 30 * sc, 2, 1, '#ff2a1a'); glow(150 - 4 * sc, 148 + d * 70 - 30 * sc, 6, 'rgba(255,40,20,0.9)'); }
    g.restore();
    for (let i = 0; i < 4; i++) smoke(150 + i * 6, 146, t + i, 4, 40, 0.18, '200,200,210');
    rain(t, 110);
  },
};
SH.sewer = {
  cap: ['BA NGÀY TRƯỚC', 'Kênh dẫn nước của nhà máy nước Vân Lâm'],
  dur: 11.5, amb: { water: 1, drone: 0.8 },
  lines: [[4.6, 'lord', 'Các người muốn chôn vùi nó...'], [7.6, 'lord', '...thì cả thành phố này sẽ được tận mắt chứng kiến.']],
  cues: [[3.6, (s) => s.groan(0, 0, true)], [6.8, (s) => s.groan(0, 0, true)]],
  ov: [{ x: 250, y: 46, text: 'KÊNH DẪN · NHÀ MÁY NƯỚC', cls: 'sign' }],
  draw(t) {
    vg(0, 0, W, H, '#120c09', '#0a0706');
    for (let y = 8; y < 128; y += 6) for (let x = (y / 6) % 2 ? -8 : 0; x < W; x += 16) R(x, y, 15, 5, (x * 7 + y) % 5 ? '#1c1410' : '#22180f');
    g.fillStyle = '#060404'; g.beginPath(); g.ellipse(160, 128, 132, 118, 0, Math.PI, 0); g.fill();
    g.strokeStyle = '#2e2218'; g.lineWidth = 3; g.beginPath(); g.ellipse(160, 128, 132, 118, 0, Math.PI, 0); g.stroke();
    R(224, 38, 54, 14, '#2a3a40'); R(224, 38, 54, 1, '#4a5a60');
    R(150, 0, 20, 6, '#3a3a3a'); for (let i = 0; i < 5; i++) R(151 + i * 4, 0, 2, 6, '#0a0a0a');
    cone(160, 6, 18, 80, 120, 'rgba(180,200,220,0.6)', 0.25);
    R(0, 128, 110, 8, '#2a2018'); R(0, 128, 110, 1, '#3a2c20'); R(250, 128, 70, 8, '#2a2018');
    const spread = seg(t, 5.2, 11.5);
    for (let y = 136; y < 162; y++) {
      const k = (y - 136) / 26;
      R(0, y, W, 1, `rgb(${14 + k * 6},${40 - k * 10},${44 - k * 10})`);
    }
    for (let i = 0; i < 26; i++) { const x = ((i * 47 + t * 40) % (W + 20)) - 10, y = 138 + (i * 7) % 22; R(x, y, 6 + (i % 3) * 3, 1, 'rgba(140,200,210,0.25)'); }
    if (spread > 0) {
      g.save(); g.globalCompositeOperation = 'source-over';
      const gr = g.createLinearGradient(150, 0, 150 + spread * 190, 0); gr.addColorStop(0, 'rgba(200,20,40,0.75)'); gr.addColorStop(1, 'rgba(200,20,40,0)');
      g.fillStyle = gr; g.fillRect(120, 137, 40 + spread * 190, 24); g.restore();
    }
    R(0, 162, W, 18, '#0a0706');
    const tilt = ease(seg(t, 4.2, 5.4));
    g.save(); g.translate(150, 128); g.rotate(tilt * 1.1);
    R(-8, -22, 16, 22, '#5a3a1a'); R(-8, -22, 16, 2, '#7a5a2a'); R(-8, -12, 16, 2, '#3a2410'); R(-6, -20, 12, 1, '#c81a2a');
    g.restore();
    if (t > 5.2) { for (let i = 0; i < 12; i++) R(156 + Math.sin(t * 9 + i) * 1.2, 118 + i * 1.6, 2, 2, i % 2 ? '#d8102a' : '#ff3a4a'); glow(158, 136, 16, 'rgba(255,30,50,0.7)'); }
    sil(A('lord'), 2, 0, 117, 129, 2.2, '#5a6a7a', 0.55);
    sil(A('lord'), 2, 0, 119, 129, 2.2, '#0a080c');
    glow(160, 30, 60, 'rgba(170,190,210,0.15)');
    R(118 + 2.2 * 2, 129 - 29 * 2.2, 2, 1, '#ff2a1a'); glow(118 + 5, 129 - 29 * 2.2, 7, 'rgba(255,40,20,0.9)');
  },
};
SH.cat = {
  cap: ['CHIỀU HÔM TRƯỚC', 'Bờ kênh cạnh Trường Quốc tế Vân Lâm'],
  dur: 9.6, amb: { birds: 0.5, water: 0.5, drone: 0.2 },
  lines: [[2.4, 'narr', 'Mướp, con mèo hoang quen thuộc ở cổng trường, cúi xuống uống nước kênh.']],
  cues: [[0.6, (s) => s.meow(false)], [6.4, (s) => { s.meow(true); s.hiss(); }]],
  draw(t) {
    vg(0, 0, W, 104, '#e88a5a', '#f8d8a0');
    glow(250, 84, 50, 'rgba(255,220,150,0.8)'); g.fillStyle = '#fff0c8'; g.beginPath(); g.arc(250, 86, 9, 0, Math.PI * 2); g.fill();
    skyline(21, 104, 10, 34, '#7a5a6a', '#ffd890', 0.08);
    R(0, 104, W, 10, '#5a7a4a');
    for (let y = 114; y < 150; y++) R(0, y, W, 1, `rgb(${60 + (y - 114) * 0.6},${88 - (y - 114) * 0.5},${100 - (y - 114) * 0.4})`);
    for (let i = 0; i < 18; i++) { const x = (i * 53 + t * 12) % W, y = 116 + (i * 11) % 32; R(x, y, 8, 1, 'rgba(255,200,140,0.35)'); }
    for (let i = 0; i < 6; i++) { const x = (i * 71 + t * 9) % (W + 40) - 20; g.fillStyle = 'rgba(200,30,40,0.18)'; g.beginPath(); g.ellipse(x, 130 + (i % 3) * 6, 14, 2, 0, 0, Math.PI * 2); g.fill(); }
    R(0, 150, W, 6, '#9a9488'); R(0, 150, W, 1, '#bab4a8');
    vg(0, 156, W, 24, '#5a7a3a', '#3a5a2a');
    for (let i = 0; i < 40; i++) R((i * 37) % W, 156 + (i % 4), 1, 3, '#7a9a4a');
    let x = 150, mode = 'drink';
    if (t < 2.4) { x = 60 + seg(t, 0.2, 2.4) * 90; mode = 'walk'; }
    else if (t > 4.6 && t < 6.2) mode = 'shake';
    else if (t >= 6.2) mode = 'walk';
    const red = t > 6.0;
    cat(x, 150, 2, t, mode === 'walk' && t >= 6.2 ? 'drink' : mode, red);
    if (red) fade('#a00010', Math.max(0, 0.25 - (t - 6.0) * 0.2));
  },
};
SH.gate = {
  dur: 11.4, amb: { birds: 0.6, drone: 0.15 },
  lines: [[1.4, 'ha', 'Ơ, con Mướp nằm co ro thế này... chắc bị thương rồi.'], [4.2, 'tuan', 'Á! Nó cào tớ!'], [6.6, 'ha', 'Tớ cũng bị xước... Chỉ là vết mèo thôi mà.'], [9.0, 'tuan', 'Về thôi. Mai còn kiểm tra Sinh.']],
  cues: [[4.0, (s) => { s.meow(true); s.hiss(); }]],
  shake: (t) => (t > 4.0 && t < 4.25 ? 2 : 0),
  ov: [{ x: 160, y: 51, text: 'TRƯỜNG QUỐC TẾ VÂN LÂM', cls: 'sign' }],
  draw(t) {
    vg(0, 0, W, 120, '#f4a868', '#f8e0b0');
    R(20, 40, 280, 90, '#d8c4a0'); R(20, 36, 280, 6, '#8a5a3a');
    for (let r = 0; r < 3; r++) for (let i = 0; i < 12; i++) { R(30 + i * 23, 56 + r * 22, 12, 12, '#6a7a8a'); R(30 + i * 23, 56 + r * 22, 12, 2, '#f8e0b0'); }
    for (const tx of [6, 300]) { R(tx + 4, 70, 4, 60, '#5a3a22'); g.fillStyle = '#4a6a2a'; g.beginPath(); g.arc(tx + 6, 66, 16, 0, Math.PI * 2); g.fill(); }
    R(66, 44, 188, 14, '#1e3a78'); R(66, 44, 188, 2, '#3a5aa0');
    R(66, 58, 20, 96, '#e8dcc0'); R(66, 58, 3, 96, '#c8bca0'); R(234, 58, 20, 96, '#e8dcc0'); R(251, 58, 3, 96, '#c8bca0');
    for (let x = 160; x < 234; x += 6) R(x, 92, 2, 60, '#5a5a62'); R(160, 92, 74, 3, '#6a6a72'); R(160, 146, 74, 3, '#6a6a72');
    vg(0, 152, W, 28, '#c8b898', '#a89878');
    for (let x = 0; x < W; x += 24) R(x, 160, 1, 20, '#988868');
    const lunge = t > 3.9 && t < 4.4;
    cat(96 + (lunge ? 6 : 0), 154, 1.6, t, lunge ? 'walk' : 'curl', t > 3.5);
    const hx = 128 + (t > 4.1 ? Math.min(8, (t - 4.1) * 30) : 0);
    spr(A('ha'), 1, 0, hx, 156, 2); spr(A('tuan'), 1, 0, 160, 154, 2);
    if (t > 4.05 && t < 6) { const a = Math.min(1, 6 - t); for (let i = 0; i < 3; i++) R(hx - 12 + i * 2, 118 + i, 1, 5, `rgba(220,20,30,${a})`); }
    if (t > 4.4 && t < 6.2) { const a = Math.min(1, 6.2 - t); for (let i = 0; i < 3; i++) R(150 + i * 2, 120 + i, 1, 5, `rgba(220,20,30,${a})`); }
  },
};
const CLASS_HEROES = [['lycas', 196, 152], ['ama', 246, 132], ['naryne', 296, 152], ['hamble', 346, 132], ['tien', 396, 152]];
const CLASS_LABEL = { lycas: 'LYCAS · Mỹ · trinh sát công nghệ', ama: 'AMA · Đức · đội trưởng đội võ', naryne: 'NARYNE · Nhật · luôn đeo dây chuyền hoa bỉ ngạn', hamble: 'HAMBLE · Angola · cầu thủ bóng rổ', tien: 'TIẾN · Việt Nam · thiện xạ' };
SH.cls = {
  cap: ['SÁNG NGÀY 1', 'Tiết Sinh học của cô Hằng · lớp 11A'],
  dur: 23, amb: { birds: 0.25, drone: 0.25 },
  cam: (t) => {
    const p = ease(seg(t, 1.6, 12)), q = ease(seg(t, 12, 14));
    return { x: 160 + p * 236 + q * 60, y: 90, z: 1 + q * 0.1 };
  },
  lines: [[2.2, 'hang', 'Hôm nay ta học về hoa bỉ ngạn: loài hoa đỏ mọc ven kênh, nở vào cuối hè...'], [5.6, 'lycas', '(thì thầm) Mạng trường mất từ sáng. Camera hành lang cũng tắt hết.'], [8.8, 'naryne', '(nghĩ thầm) Bố vẫn không nghe máy... đã hai tháng rồi.'], [12.6, 'tuan', 'Khụ... khụ... Cô ơi... em thấy lạnh quá...'], [16.6, 'hamble', 'Tuấn?! Mắt cậu ấy...'], [18.6, 'ama', 'Tất cả lùi lại!'], [20.4, 'hang', 'Các em chạy đi! Và nhớ: đừng uống nước máy!']],
  cues: [[12.8, (s) => s.cough()], [13.9, (s) => s.cough()], [15.1, (s) => s.cough()], [16.3, (s) => { s.roar(); s.sting(); }], [16.7, (s) => s.scream()], [17.1, (s) => s.hit()]],
  shake: (t) => (t > 16.3 && t < 16.9 ? 2.5 : 0),
  ov: [{ x: 84, y: 38, text: 'Hoa bỉ ngạn · Lycoris radiata', cls: 'chalk', world: true },
    ...CLASS_HEROES.map(([id, x, f]) => ({ x, y: f - 56, text: CLASS_LABEL[id], cls: 'label', world: true, from: 1.6 + ((x - 196) / 236) * 10.4 - 1.2, to: 1.6 + ((x - 196) / 236) * 10.4 + 2.4 }))],
  draw(t) {
    vg(-40, -20, 640, 132, '#c8c8a8', '#b4b494'); R(-40, 108, 640, 4, '#8a7a5a');
    vg(-40, 112, 640, 90, '#8a6a4a', '#6a4a30');
    for (let x = -40; x < 600; x += 18) R(x, 112, 1, 90, '#7a5a3a');
    R(18, 14, 166, 66, '#5a4a3a'); R(22, 18, 158, 58, '#2a5a3a');
    lily(140, 60, 1.6);
    for (let i = 0; i < 5; i++) R(30 + i * 18, 44 + (i % 2) * 6, 12, 1, 'rgba(240,240,220,0.6)');
    for (const wx of [430, 490, 550]) { R(wx, 20, 40, 60, '#a8c8e0'); R(wx, 20, 40, 3, '#e8f0f8'); R(wx + 19, 20, 2, 60, '#8a8a7a'); cone(wx + 20, 80, 40, 90, 90, 'rgba(255,250,220,0.6)', 0.18); }
    spr(A('hang'), 2, 0, 74, 140, 1.7);
    const tz = t >= 16.3;
    const tx = 466 + (tz ? -seg(t, 16.3, 16.6) * 4 : 0), tf = 132 + (tz ? seg(t, 16.3, 16.6) * 14 : 0);
    const cough = t > 12.6 && t < 16.3 && Math.sin(t * 9) > 0.4 ? 1 : 0;
    for (const [id, x, f] of CLASS_HEROES) if (f < 140) { spr(HERO(id), t > 17 ? 2 : 0, 0, x, f, 1.6); desk(x, f); }
    spr(A('ha'), t > 16.8 ? 1 : 0, 0, 512, 132, 1.6); desk(512, 132);
    if (!tz) { spr(A('tuan'), 0, 0, tx + cough, tf, 1.6); desk(466, 132); }
    else { desk(466, 132); spr(A('tuanZ'), 0, Math.floor(t * 6), tx, tf, 1.6); eyes(tx, tf - 22.4 * 1.6, 1.1, 1); }
    if (t > 14) for (let i = 0; i < 3; i++) R(462 + i * 3, 118 + i, 1, 1, '#a01018');
    for (const [id, x, f] of CLASS_HEROES) if (f >= 140) {
      spr(HERO(id), t > 17 ? 2 : 0, 0, x, f, 1.6); desk(x, f);
      if (id === 'naryne') { R(x - 1, f - 27, 2, 2, '#ff2a3a'); glow(x, f - 26, 5, 'rgba(255,40,60,0.8)', 0.5 + Math.sin(t * 4) * 0.3); }
    }
    spr(A('student'), t > 16.6 ? 1 : 0, 0, 470, 152 + (t > 16.6 ? 3 : 0), 1.6); desk(470, 152);
    if (t > 16.4 && t < 17.2) fade('#b00010', (17.2 - t) * 0.5);
  },
};
function titleShot(big, sub, note, dur = 5.6) {
  return {
    dur, amb: { drone: 0.35 }, title: { big, sub, note },
    cues: [[0.25, (s) => s.sting()]],
    draw(t) {
      R(0, 0, W, H, '#000');
      glow(160, 90, 160, 'rgba(120,10,10,0.35)', 0.6 + Math.sin(t * 2) * 0.2);
      for (let i = 0; i < 30; i++) { const x = (i * 61 + t * 6 * (1 + (i % 3))) % W, y = H - ((i * 37 + t * 10 * (1 + (i % 4))) % H); R(x, y, 1, 1, 'rgba(255,140,100,0.5)'); }
    },
  };
}
// ---- chương 1 ----
SH.citySmoke = {
  cap: ['HẾT CHƯƠNG 0', 'Cổng sau Trường Quốc tế Vân Lâm'],
  dur: 12, amb: { wind: 0.6, heli: 0.5, drone: 0.4 },
  lines: [[1.6, 'lycas', 'Không chỉ trường mình... cả thành phố đều như vậy.'], [4.8, 'hamble', 'Trực thăng quân đội! Này! Ở dưới này!'], [8.0, 'tien', 'Họ không dừng lại đâu. Mình phải tự tìm đường sống.']],
  draw(t) {
    vg(0, 0, W, 130, '#2a1e34', '#d0704a');
    glow(230, 118, 70, 'rgba(255,150,80,0.6)');
    skyline(41, 130, 20, 60, '#3a2a3e', '#ffcc80', 0.05);
    skyline(42, 136, 30, 86, '#1e1622', '#ffd890', 0.08);
    for (const [x, ph] of [[64, 0], [150, 3], [262, 6]]) { glow(x, 128, 26, 'rgba(255,110,40,0.7)', 0.7); smoke(x, 126, t + ph, 11, 120, 0.6); }
    const h1 = -40 + t * 34, h2 = 360 - t * 26;
    heliShape(h1, 40, 1, t); beam(h1, 44, Math.PI / 2 + Math.sin(t) * 0.3, 90, 10, 'rgba(255,250,220,0.8)', 0.2);
    heliShape(h2, 62, 0.8, t + 1);
    R(0, 136, W, 44, '#151214');
    for (let x = 0; x < W; x += 7) R(x, 128, 2, 52, '#0a0a0c'); R(0, 130, W, 3, '#141416'); R(0, 168, W, 3, '#141416');
    const ids = ['lycas', 'ama', 'naryne', 'hamble', 'tien'];
    ids.forEach((id, i) => spr(HERO(id), 3, 0, 104 + i * 28, 182, 1.7));
  },
};
SH.lockdown = {
  dur: 11, amb: { drone: 0.5 },
  lines: [[0.8, 'loa', 'Thông báo của Bộ chỉ huy phong toả: thành phố Vân Lâm đã bị cách ly.'], [4.2, 'quan', 'Tôi là Đại tá Quân. Từ giờ phút này, không ai được ra khỏi vành đai phong toả.'], [7.8, 'quan', 'Lính gác được lệnh nổ súng với mọi mục tiêu di chuyển.']],
  cues: [[0.1, (s) => s.tvStatic(0.4, 0.1)]],
  ov: [{ x: 160, y: 113, text: 'LỆNH PHONG TOẢ VÂN LÂM', cls: 'tvred wide' }, { x: 66, y: 125, w: 188, text: 'Không ai được ra khỏi vành đai · Ở yên trong nhà · Không uống nước máy chưa đun sôi · Lính được lệnh nổ súng', cls: 'ticker' }],
  draw(t) {
    vg(0, 0, W, H, '#0a080c', '#060508');
    tvFrame(66, 26, 188, 112, t, (w, h) => {
      vg(0, 0, w, h, '#3a4a2a', '#1a2414');
      for (let i = 0; i < 6; i++) R(0, i * 16, w, 8, 'rgba(0,0,0,0.12)');
      R(w - 46, 10, 30, 20, '#c81a1a'); R(w - 36, 16, 10, 8, '#f2c14e');
      spr(A('quan'), 0, 0, w / 2, 90, 2.2);
      R(0, 82, w, 14, '#c81a1a'); R(0, 96, w, 16, '#0a0a14');
    });
  },
};
// ---- Zombie Chúa trên mái nhà ----
SH.lordRoof = {
  cap: ['', ''],
  dur: 12.5, amb: { wind: 0.7, drone: 0.95 },
  lines: [[1.2, 'lycas', 'Trên mái nhà kia... cái gì vậy?'], [5.2, 'naryne', '(sững người) Nó... đang nhìn mình?'], [8.8, 'ama', 'Cả bầy đang kéo tới! Chạy!']],
  cues: [[0.4, (s) => s.heartbeat()], [1.6, (s) => s.heartbeat()], [2.8, (s) => s.heartbeat()], [4.0, (s) => s.heartbeat()], [7.2, (s) => { s.roar(); s.boom(0.35); }]],
  shake: (t) => (t > 7.2 && t < 8.4 ? 3 : 0),
  draw(t) {
    if (t < 3.6 || t > 7) {
      vg(0, 0, W, 120, '#1a1424', '#4a2a3a');
      glow(250, 30, 30, 'rgba(255,230,210,0.5)'); g.fillStyle = '#f0e0d0'; g.beginPath(); g.arc(250, 30, 8, 0, Math.PI * 2); g.fill();
      skyline(61, 120, 30, 70, '#140e18', '#6a4a2a', 0.04);
      R(150, 104, 170, 80, '#0e0a12'); R(150, 102, 170, 3, '#1e1622'); R(286, 84, 14, 18, '#0e0a12'); R(290, 74, 2, 10, '#0e0a12');
      const sc = 2.1, rx = 226, rf = 104;
      sil(A('lord'), 0, 0, rx, rf, sc, '#06050a');
      eyes(rx, rf - 29.5 * sc, sc * 0.75, t > 7.2 ? 1.4 : 1);
      R(rx - 7, rf - 20 * sc, 3, 10, 'rgba(200,196,188,0.35)');
      vg(0, 128, 150, 52, '#18121a', '#0c090e');
      for (let i = 0; i < 9; i++) { const zx = 12 + i * 15, zr = t > 7.4 ? 2 : 1; sil(ZA.walker[i % ZA.walker.length], zr, Math.floor(t * 4 + i), zx, 168 + (i % 2) * 6, 1.1, '#050406'); }
      if (t > 7.2) fade('#8a0010', Math.max(0, 0.35 - (t - 7.2) * 0.25));
    } else {
      vg(0, 0, W, H, '#07050a', '#0c080e');
      const k = seg(t, 3.6, 7);
      const open = t > 4.6 && t < 6.2 ? 0.55 : 1;
      for (const sx of [-1, 1]) {
        const x = 160 + sx * 52;
        g.fillStyle = '#ff2a1a'; g.beginPath(); g.ellipse(x, 86, 22, 4 * open + 1, sx * 0.12, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#ffd0b0'; g.beginPath(); g.ellipse(x, 86, 5, 2 * open, 0, 0, Math.PI * 2); g.fill();
        glow(x, 86, 48, 'rgba(255,30,20,0.8)', 0.7 + k * 0.3);
      }
      for (let i = 0; i < 40; i++) R((i * 47) % W, 70 + ((i * 13) % 40), 2, 1, 'rgba(120,110,130,0.25)');
    }
  },
};
// ---- gọi cứu hộ, lệnh ném bom ----
SH.radioRoom = {
  cap: ['ĐỒN CẢNH SÁT TRUNG TÂM', 'Bộ đàm đã có điện'],
  dur: 11.5, amb: { drone: 0.35 },
  lines: [[0.9, 'radio', '...Đây là đội cứu hộ độc lập Cánh Sen. Chúng tôi nghe rõ.'], [4.2, 'lycas', 'Bọn em có năm người, đang ở đồn cảnh sát trung tâm!'], [7.4, 'radio', 'Trực thăng sẽ đáp ở bãi đáp tầng thượng lúc bình minh. Cầm cự tới 6 giờ sáng!']],
  cues: [[0.3, (s) => s.radio()], [3.8, (s) => s.tvStatic(0.3, 0.06)], [7.1, (s) => s.radio()]],
  draw(t) {
    vg(0, 0, W, H, '#14161c', '#0a0b0e');
    R(0, 120, W, 60, '#101114');
    R(90, 62, 140, 58, '#2a2e34'); R(90, 62, 140, 3, '#4a4e54');
    for (let i = 0; i < 4; i++) { g.fillStyle = '#6a6e74'; g.beginPath(); g.arc(110 + i * 28, 80, 6, 0, Math.PI * 2); g.fill(); R(110 + i * 28, 75, 1, 5, '#14161a'); }
    R(108, 96, 104, 14, '#0a1a12');
    for (let x = 0; x < 100; x++) R(110 + x, 103 + Math.sin(x * 0.6 + t * 12) * (t % 3.3 < 2.4 ? 4 : 1), 1, 1, '#4aff9a');
    for (let i = 0; i < 6; i++) if (Math.sin(t * 5 + i * 2) > 0) { R(96 + i * 22, 68, 3, 3, i % 2 ? '#ff4a3a' : '#4aff6a'); glow(97 + i * 22, 69, 5, i % 2 ? 'rgba(255,70,50,0.8)' : 'rgba(70,255,100,0.8)'); }
    glow(160, 100, 90, 'rgba(70,255,150,0.18)');
    R(150, 40, 2, 22, '#2a2e34'); R(140, 40, 22, 2, '#2a2e34');
    const pos = [['lycas', 160, 176, 3], ['ama', 104, 170, 2], ['naryne', 214, 170, 1], ['hamble', 66, 178, 2], ['tien', 254, 178, 1]];
    for (const [id, x, f, row] of pos) spr(HERO(id), row, 0, x, f, 1.8);
  },
};
SH.bombOrder = {
  dur: 10, amb: { drone: 0.7 },
  lines: [[0.8, 'quan', 'Theo lệnh cấp trên, 6 giờ sáng nay toàn bộ Vân Lâm sẽ bị ném bom làm sạch.'], [4.4, 'hamble', 'Họ định xoá sổ cả thành phố sao...?'], [7.0, 'tien', 'Vậy thì phải lên được trực thăng trước 6 giờ.']],
  cues: [[0.1, (s) => s.tvStatic(0.4, 0.1)], [4.2, (s) => s.sting()]],
  ov: [{ x: 160, y: 113, text: 'LỆNH NÉM BOM · 06:00', cls: 'tvred wide' }, { x: 160, y: 162, text: '06:00', cls: 'count', from: 4.2 }],
  draw(t) {
    vg(0, 0, W, H, '#0a080c', '#060508');
    tvFrame(66, 26, 188, 112, t, (w, h) => {
      vg(0, 0, w, h, '#3a2a2a', '#1a1010');
      spr(A('quan'), 0, 0, w / 2, 90, 2.2);
      R(0, 82, w, 14, '#c81a1a'); R(0, 96, w, 16, '#0a0a14');
    });
    if (t > 4.2) fade('#600008', 0.12 + Math.sin(t * 6) * 0.06);
  },
};
// ---- kết: lên trực thăng, bom rơi, dây chuyền ----
SH.heliUp = {
  cap: ['6 GIỜ SÁNG', 'Bãi đáp tầng thượng'],
  dur: 9.4, amb: { heli: 1, wind: 0.6, drone: 0.2 },
  lines: [[2.4, 'tien', 'Lên được rồi! Mọi người đủ cả chứ?'], [5.4, 'ama', 'Đủ năm người. Đi thôi!']],
  draw(t) {
    vg(0, 0, W, 150, '#4a5a8a', '#f8b880');
    glow(70, 140, 60, 'rgba(255,200,120,0.8)'); g.fillStyle = '#fff0c8'; g.beginPath(); g.arc(70, 142, 12, 0, Math.PI * 2); g.fill();
    skyline(71, 160, 20, 60, '#3a3048', '#ffd890', 0.04);
    for (const x of [40, 260]) smoke(x, 150, t, 8, 90, 0.4);
    R(60, 150, 200, 30, '#2a2a30'); R(60, 150, 200, 2, '#4a4a52');
    g.strokeStyle = '#e8e8e8'; g.lineWidth = 2; g.beginPath(); g.ellipse(160, 164, 34, 8, 0, 0, Math.PI * 2); g.stroke();
    R(156, 160, 2, 8, '#e8e8e8'); R(164, 160, 2, 8, '#e8e8e8'); R(156, 163, 10, 2, '#e8e8e8');
    const lift = ease(seg(t, 1.2, 9));
    const hx = 160 + lift * 40, hy = 146 - lift * 96;
    heliShape(hx, hy, 2.4, t);
    for (let i = 0; i < 5; i++) R(hx - 18 + i * 5, hy - 5, 3, 3, '#1a1a1a');
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2 + t * 3; R(160 + Math.cos(a) * (30 + lift * 30), 156 + Math.sin(a) * 4, 3, 1, 'rgba(200,200,200,0.4)'); }
  },
};
SH.cityBomb = {
  dur: 9.5, amb: { heli: 0.6, wind: 0.5, drone: 0.7 },
  lines: [[3.6, 'narr', 'Đúng 6 giờ, những quả bom đầu tiên rơi xuống Vân Lâm.']],
  cues: [[2.6, (s) => s.boom(0.6)], [3.1, (s) => s.boom(0.9)], [3.6, (s) => s.boom(0.7)], [4.4, (s) => s.boom(1)], [5.2, (s) => s.boom(0.6)]],
  shake: (t) => (t > 2.6 && t < 5.6 ? 1.2 : 0),
  draw(t) {
    vg(0, 0, W, 140, '#5a6a9a', '#f0a878');
    skyline(81, 150, 20, 70, '#2a2234', '#ffd890', 0.05);
    vg(0, 150, W, 30, '#1a1620', '#100c14');
    sil(A('lord'), 0, 0, 96, 104, 1.2, '#08060a'); R(60, 104, 70, 46, '#1a1620');
    eyes(96, 104 - 29.5 * 1.2, 0.9, 0.9);
    for (let i = 0; i < 3; i++) bomber(-60 + t * 50 - i * 26, 22 + i * 8, t);
    for (const [x, tb] of [[40, 2.6], [120, 3.1], [90, 3.6], [180, 4.4], [70, 5.2], [150, 5.6]]) { blast(x, 132, seg(t, tb, tb + 1.8), 1.6); if (t > tb + 0.8) smoke(x, 130, t - tb, 7, 90, 0.55); }
    heliShape(240 + t * 8, 40 - t * 2, 1, t);
  },
};
SH.pendant = {
  dur: 8.4, amb: { heli: 0.45, drone: 0.4 },
  lines: [[1.6, 'naryne', '(nắm chặt mặt dây chuyền) Bố... con sẽ tìm ra sự thật.']],
  draw(t) {
    vg(0, 0, W, H, '#1a1a24', '#0c0c12');
    R(196, 22, 100, 64, '#f0b888'); R(196, 22, 100, 64, 'rgba(255,190,130,0.4)');
    for (let i = 0; i < 4; i++) R(196 + i * 30, 30 + i * 9, 40, 2, 'rgba(255,240,220,0.5)');
    R(192, 18, 108, 4, '#2a2a30'); R(192, 86, 108, 4, '#2a2a30'); R(192, 18, 4, 72, '#2a2a30'); R(296, 18, 4, 72, '#2a2a30');
    skyline(91, 86, 4, 18, 'rgba(60,40,70,0.7)', null, 0, 196, 296);
    cone(246, 88, 100, 220, 92, 'rgba(255,200,140,0.6)', 0.22);
    R(0, 150, W, 30, '#121218');
    const bob = Math.sin(t * 9) > 0.92 ? 1 : 0;
    spr(HERO('naryne'), 0, 0, 120, 178 + bob, 4.6);
    glow(150, 110, 70, 'rgba(255,190,130,0.22)');
    const px = 120, py = 136;
    g.strokeStyle = 'rgba(220,210,190,0.8)'; g.lineWidth = 1; g.beginPath(); g.moveTo(108, 110); g.lineTo(px, py - 12); g.lineTo(132, 110); g.stroke();
    lily(px, py, 0.9, 0.95);
    glow(px, py - 6, 18, 'rgba(255,50,70,0.9)', 0.55 + Math.sin(t * 3) * 0.3);
    if (t > 3.2) { const k = seg(t, 3.2, 6.5); R(103, 178 - 21.6 * 4.6 + k * 18, 2, 3, `rgba(170,220,255,${0.8 * (1 - k * 0.5)})`); }
  },
};

const SEQ = {
  prologue: [SH.lab, SH.council, SH.escort, SH.camp, SH.bomb, SH.tv, SH.manhole, SH.sewer, SH.cat, SH.gate, titleShot('SÁNG HÔM SAU', 'Trường Quốc tế Vân Lâm', 'Một ngày đi học như mọi ngày…', 4.2)],
  pixelClass: [SH.cls],
  ch1: [SH.citySmoke, SH.lockdown, titleShot('CHƯƠNG 1', 'THÀNH PHỐ BỊ ĐÓNG', 'Mục tiêu: tìm bộ đàm ở đồn cảnh sát để gọi cứu hộ')],
  lord: [SH.lordRoof],
  call: [SH.radioRoom, SH.bombOrder, titleShot('CẦM CỰ TỚI BÌNH MINH', 'Trực thăng tới bãi đáp lúc 6:00', 'Bom sẽ rơi cùng lúc · đừng để lỡ chuyến bay', 4.6)],
  ending: [SH.heliUp, SH.cityBomb, SH.pendant, titleShot('CÒN TIẾP', '', 'Trực thăng hạ cánh ở một trại cách ly của chính phủ: đúng những người từng muốn chôn vùi bí mật.', 7)],
};
export const CINE_IDS = Object.keys(SEQ);

// ---------------- điều khiển ----------------
function ensureDom() {
  if (root) return;
  root = document.createElement('div'); root.id = 'cine'; root.className = 'hidden';
  root.innerHTML = '<div id="cine-wrap"><div id="cine-stage"><canvas id="cine-cv" width="320" height="180"></canvas><div id="cine-ov"></div><div id="cine-cap"><b></b><small></small></div><div id="cine-title"><b></b><span></span><em></em></div></div></div>'
    + '<div id="cine-box"><canvas width="72" height="60"></canvas><div class="cb"><b class="who"></b><p class="txt"></p></div><i class="nx">▼</i></div>'
    + '<div id="cine-fade"></div><button id="cine-skip" type="button">Bỏ qua ▶▶</button>';
  document.body.appendChild(root);
  cv = root.querySelector('#cine-cv'); g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
  ovEl = root.querySelector('#cine-ov'); capEl = root.querySelector('#cine-cap'); titleEl = root.querySelector('#cine-title');
  boxEl = root.querySelector('#cine-box'); whoEl = boxEl.querySelector('.who'); txtEl = boxEl.querySelector('.txt'); ptEl = boxEl.querySelector('canvas');
  skipEl = root.querySelector('#cine-skip');
  fadeEl = root.querySelector('#cine-fade');
  skipEl.addEventListener('click', (e) => { e.stopPropagation(); skip(); });
  skipEl.addEventListener('touchstart', (e) => { e.stopPropagation(); e.preventDefault(); skip(); }, { passive: false });
  root.addEventListener('mousedown', (e) => { if (e.target !== skipEl) advance(); });
  root.addEventListener('touchstart', (e) => { if (e.target !== skipEl) { e.preventDefault(); advance(); } }, { passive: false });
}
function portrait(key) {
  const sp = SPK[key];
  const x = ptEl.getContext('2d'); x.imageSmoothingEnabled = false;
  x.fillStyle = '#14101a'; x.fillRect(0, 0, 72, 60);
  if (!sp || !sp.a) return false;
  const a = A(sp.a), c = a.canvas, fw = c.width / 4, fh = c.height / 4;
  const ch = Math.round(fh * 0.62), cw = fw;
  const sc = Math.min(72 / cw, 60 / ch);
  x.drawImage(c, 0, 0, cw, ch, (72 - cw * sc) / 2, 60 - ch * sc, cw * sc, ch * sc);
  if (sp.dark) {
    x.globalCompositeOperation = 'source-atop'; x.fillStyle = 'rgba(6,4,10,0.85)'; x.fillRect(0, 0, 72, 60); x.globalCompositeOperation = 'source-over';
    x.fillStyle = '#ff2a1a'; x.fillRect(26, 30, 6, 3); x.fillRect(40, 30, 6, 3);
  }
  return true;
}
function startShot() {
  const sh = cur.shot;
  cur.t = 0; cur.li = -1; cur.fired = new Set(); cur.typedAll = false;
  root.classList.toggle('three', !!sh.three);
  if (sh.three && sh.enter) { try { sh.enter(); } catch (e) { console.error(e); } }
  ovEl.innerHTML = '';
  cur.ov = (sh.ov || []).map((o) => {
    const el = document.createElement('div'); el.className = 'cov ' + (o.cls || '');
    if (o.cls && o.cls.includes('ticker')) { const sp = document.createElement('span'); sp.textContent = o.text; el.appendChild(sp); } else el.textContent = o.text;
    if (o.w) el.style.width = (o.w / W * 100) + '%';
    ovEl.appendChild(el);
    return { o, el };
  });
  capEl.className = '';
  if (sh.cap && (sh.cap[0] || sh.cap[1])) { capEl.querySelector('b').textContent = sh.cap[0]; capEl.querySelector('small').textContent = sh.cap[1] || ''; void capEl.offsetWidth; capEl.className = 'show'; }
  titleEl.className = '';
  if (sh.title) {
    titleEl.querySelector('b').textContent = sh.title.big; titleEl.querySelector('span').textContent = sh.title.sub || ''; titleEl.querySelector('em').textContent = sh.title.note || '';
    void titleEl.offsetWidth; titleEl.className = 'show';
  }
  boxEl.className = 'off';
}
function exitShot() {
  const sh = cur && cur.shot;
  if (sh && sh.three && sh.exit) { try { sh.exit(); } catch (e) { console.error(e); } }
}
function nextShot() {
  exitShot();
  cur.i++;
  if (cur.i >= cur.list.length) { finish(); return; }
  cur.shot = cur.list[cur.i];
  startShot();
}
function finish() {
  if (!cur) return;
  exitShot();
  if (cur.onEnd) { try { cur.onEnd(); } catch (e) { console.error(e); } }
  root.classList.remove('three'); document.body.classList.remove('cine');
  fadeEl.style.opacity = '0';
  const done = cur.resolve;
  cur = null; cinema.active = false;
  root.classList.add('hidden'); ovEl.innerHTML = ''; boxEl.className = 'off';
  done();
}
function skip() { if (cur) finish(); }
function lineAt(t) { const L = cur.shot.lines || []; let k = -1; for (let i = 0; i < L.length; i++) if (L[i][0] <= t) k = i; return k; }
function advance() {
  if (!cur) return;
  const sh = cur.shot, L = sh.lines || [];
  const li = lineAt(cur.t);
  if (li >= 0 && !cur.typedAll && cur.typed < L[li][2].length) { cur.typedAll = true; return; }
  const nt = li + 1 < L.length ? L[li + 1][0] : sh.dur;
  for (const c of sh.cues || []) if (c[0] < nt - 0.3) cur.fired.add(c);
  cur.t = Math.max(cur.t, nt - 0.02);
}
function camOf(t) { return cur.shot.cam ? cur.shot.cam(t) : { x: W / 2, y: H / 2, z: 1 }; }
function frame(dt) {
  if (!cur) return;
  const sh = cur.shot;
  cur.t += Math.min(dt, 0.1);
  const t = cur.t;
  for (const c of sh.cues || []) if (!cur.fired.has(c) && t >= c[0]) { cur.fired.add(c); try { c[1](sound); } catch (e) { /* âm thanh lỗi thì bỏ qua */ } }
  const cam = camOf(t);
  const fin = sh.title ? 0.2 : 0.5;
  const fa = clamp(Math.max(1 - t / fin, 1 - (sh.dur - t) / 0.45), 0, 1);
  if (sh.three) {
    // cảnh dựng trong thế giới 3D: game tự vẽ, ở đây chỉ chạy kịch bản và làm mờ đầu/cuối cảnh
    if (sh.update) { try { sh.update(t, Math.min(dt, 0.1)); } catch (e) { console.error(e); } }
    fadeEl.style.opacity = String(sh.noFade ? 0 : fa);
  } else {
    fadeEl.style.opacity = '0';
    const sk = sh.shake ? sh.shake(t) : 0;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    g.setTransform(cam.z, 0, 0, cam.z, W / 2 - cam.x * cam.z + (sk ? (Math.random() - 0.5) * sk * 2 : 0), H / 2 - cam.y * cam.z + (sk ? (Math.random() - 0.5) * sk * 2 : 0));
    sh.draw(t);
    g.setTransform(1, 0, 0, 1, 0, 0);
    fade('#000', fa);
  }
  for (const { o, el } of cur.ov) {
    const vis = t >= (o.from ?? 0) && t <= (o.to ?? 1e9) && t < sh.dur - 0.35;
    el.style.opacity = vis ? '1' : '0';
    const sx = o.world ? (o.x - cam.x) * cam.z + W / 2 : o.x, sy = o.world ? (o.y - cam.y) * cam.z + H / 2 : o.y;
    el.style.left = (sx / W * 100) + '%'; el.style.top = (sy / H * 100) + '%';
  }
  const L = sh.lines || [];
  const li = lineAt(t);
  if (li !== cur.li) {
    cur.li = li; cur.typedAll = false;
    if (li >= 0) {
      const sp = SPK[L[li][1]] || { name: L[li][1] };
      const narr = L[li][1] === 'narr';
      boxEl.className = narr ? 'narr' : '';
      whoEl.textContent = sp.name; whoEl.style.color = sp.color || '#f1e6cf';
      const hasP = !narr && portrait(L[li][1]);
      ptEl.style.display = hasP ? '' : 'none';
    } else boxEl.className = 'off';
  }
  if (li >= 0) {
    const text = L[li][2];
    const n = cur.typedAll ? text.length : Math.min(text.length, Math.floor((t - L[li][0]) * 44));
    if (n !== cur.typed) { cur.typed = n; txtEl.textContent = text.slice(0, n); }
    boxEl.classList.toggle('done', n >= text.length);
  }
  if (t >= sh.dur) nextShot();
}
function play(id, opts = {}) {
  ensureDom();
  if (cur) finish();
  const list = SEQ[id];
  if (!list) return Promise.resolve();
  return new Promise((resolve) => {
    cur = { list, i: -1, resolve, typed: 0, onEnd: opts.onEnd };
    cinema.active = true; cinema.id = id;
    root.classList.remove('hidden');
    document.body.classList.add('cine');
    nextShot();
  });
}
// cảnh 3D do game định nghĩa (dựng bằng chính thế giới trong game)
function define(id, shots) { SEQ[id] = shots; }
const is3D = () => !!(cur && cur.shot && cur.shot.three);
const AMB0 = { rain: 0, wind: 0.15, crickets: 0, birds: 0, fire: 0, music: 0, water: 0, gen: 0, heli: 0, drone: 0 };
function amb() { return cur ? { ...AMB0, ...(cur.shot.amb || {}) } : AMB0; }
function init(o) { sound = o.sound; ZA = o.zombies; }

// gỡ lỗi: nhảy tới cảnh i, thời điểm t
function jump(i, t = 0) { if (!cur) return; cur.i = i - 1; nextShot(); cur.t = t; cur.fired = new Set((cur.shot.cues || []).filter((c) => c[0] < t)); }
function state() { return cur ? { id: cinema.id, i: cur.i, n: cur.list.length, t: +cur.t.toFixed(2) } : null; }
export const cinema = { active: false, id: null, init, play, frame, skip, advance, amb, jump, state, define, is3D, titleShot };

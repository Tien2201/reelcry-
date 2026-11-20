// Tiện ích vẽ pixel-art bằng code: mọi texture/sprite trong game đều sinh ra
// từ đây (không dùng file ảnh), mật độ chuẩn 16 pixel = 1 mét trong thế giới.
import * as THREE from 'three';

export const PPU = 16;

export function makeRng(seed = 1) {
  let a = seed >>> 0;
  const r = () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.range = (lo, hi) => lo + r() * (hi - lo);
  r.int = (lo, hi) => Math.floor(lo + r() * (hi - lo + 1));
  r.pick = (arr) => arr[Math.floor(r() * arr.length)];
  r.chance = (p) => r() < p;
  return r;
}

const colCache = new Map();
export function rgb(c) {
  if (Array.isArray(c)) return c;
  let v = colCache.get(c);
  if (!v) {
    const n = parseInt(c.slice(1), 16);
    v = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    colCache.set(c, v);
  }
  return v;
}
export const mixc = (a, b, t) => { a = rgb(a); b = rgb(b); return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; };
export const scalec = (a, k) => { a = rgb(a); return [a[0] * k, a[1] * k, a[2] * k]; };

// value noise + fbm (đủ dùng cho texture)
function hash2(x, y, s) {
  let h = (x * 374761393 + y * 668265263 + s * 982451653) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function vnoise(x, y, s = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, y, s = 0, oct = 4) {
  let f = 0, amp = 0.5, fr = 1;
  for (let i = 0; i < oct; i++) { f += vnoise(x * fr, y * fr, s + i * 17) * amp; fr *= 2; amp *= 0.5; }
  return f / (1 - Math.pow(0.5, oct));
}
// dither Bayer 4x4 để chuyển dải màu kiểu pixel-art
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export const bayer = (x, y) => (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
export function ramp(pal, t, x, y, ditherAmt = 0.5) {
  const n = pal.length;
  let f = t * (n - 1) + (bayer(x, y) - 0.5) * ditherAmt;
  f = Math.max(0, Math.min(n - 1, Math.round(f)));
  return pal[f];
}

export class Pix {
  constructor(w, h, { emissive = false } = {}) {
    this.w = w; this.h = h;
    this.data = new Uint8ClampedArray(w * h * 4);
    this.hgt = new Float32Array(w * h);
    this.emis = emissive ? new Uint8ClampedArray(w * h * 4) : null;
  }
  inb(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  set(x, y, c, hgt) {
    x |= 0; y |= 0;
    if (!this.inb(x, y)) return;
    const i = (y * this.w + x) * 4, v = rgb(c);
    this.data[i] = v[0]; this.data[i + 1] = v[1]; this.data[i + 2] = v[2]; this.data[i + 3] = 255;
    if (hgt !== undefined) this.hgt[y * this.w + x] = hgt;
  }
  setA(x, y, c, a) {
    x |= 0; y |= 0;
    if (!this.inb(x, y)) return;
    const i = (y * this.w + x) * 4, v = rgb(c);
    this.data[i] = v[0]; this.data[i + 1] = v[1]; this.data[i + 2] = v[2]; this.data[i + 3] = a;
  }
  glow(x, y, c) {
    x |= 0; y |= 0;
    if (!this.emis || !this.inb(x, y)) return;
    const i = (y * this.w + x) * 4, v = rgb(c);
    this.emis[i] = v[0]; this.emis[i + 1] = v[1]; this.emis[i + 2] = v[2]; this.emis[i + 3] = 255;
  }
  get(x, y) {
    if (!this.inb(x, y)) return null;
    const i = (y * this.w + x) * 4;
    return this.data[i + 3] ? [this.data[i], this.data[i + 1], this.data[i + 2]] : null;
  }
  a(x, y) { return this.inb(x, y) ? this.data[(y * this.w + x) * 4 + 3] : 0; }
  H(x, y) { x = (x + this.w) % this.w; y = (y + this.h) % this.h; return this.hgt[y * this.w + x]; }
  setH(x, y, v) { if (this.inb(x, y)) this.hgt[(y | 0) * this.w + (x | 0)] = v; }
  rect(x, y, w, h, c, hgt) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, typeof c === 'function' ? c(i, j) : c, hgt);
  }
  ellipse(cx, cy, rx, ry, c, hgt) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry;
        if (nx * nx + ny * ny <= 1) this.set(x, y, typeof c === 'function' ? c(nx, ny, x, y) : c, typeof hgt === 'function' ? hgt(nx, ny) : hgt);
      }
  }
  line(x0, y0, x1, y1, c) {
    x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  // viền ngoài cho sprite (trong ô x0,y0,w,h để không tràn sang khung khác)
  outline(c, x0 = 0, y0 = 0, w = this.w, h = this.h, diag = false) {
    const add = [];
    for (let y = y0; y < y0 + h; y++)
      for (let x = x0; x < x0 + w; x++) {
        if (this.a(x, y)) continue;
        const inCell = (i, j) => i >= x0 && j >= y0 && i < x0 + w && j < y0 + h && this.a(i, j) > 127;
        let hit = inCell(x - 1, y) || inCell(x + 1, y) || inCell(x, y - 1) || inCell(x, y + 1);
        if (!hit && diag) hit = inCell(x - 1, y - 1) || inCell(x + 1, y - 1) || inCell(x - 1, y + 1) || inCell(x + 1, y + 1);
        if (hit) add.push(x, y);
      }
    for (let i = 0; i < add.length; i += 2) this.set(add[i], add[i + 1], c);
  }
  canvas() {
    const cv = document.createElement('canvas');
    cv.width = this.w; cv.height = this.h;
    cv.getContext('2d').putImageData(new ImageData(this.data, this.w, this.h), 0, 0);
    return cv;
  }
  emissiveCanvas() {
    const cv = document.createElement('canvas');
    cv.width = this.w; cv.height = this.h;
    const d = new Uint8ClampedArray(this.w * this.h * 4);
    for (let i = 0; i < d.length; i += 4) {
      d[i] = this.emis[i]; d[i + 1] = this.emis[i + 1]; d[i + 2] = this.emis[i + 2]; d[i + 3] = 255;
    }
    cv.getContext('2d').putImageData(new ImageData(d, this.w, this.h), 0, 0);
    return cv;
  }
  // normal map từ bản đồ độ cao (Sobel), lặp biên để tile liền mạch
  normalCanvas(strength = 2) {
    const cv = document.createElement('canvas');
    cv.width = this.w; cv.height = this.h;
    const d = new Uint8ClampedArray(this.w * this.h * 4);
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        const dx = (this.H(x + 1, y - 1) + 2 * this.H(x + 1, y) + this.H(x + 1, y + 1)) - (this.H(x - 1, y - 1) + 2 * this.H(x - 1, y) + this.H(x - 1, y + 1));
        const dy = (this.H(x - 1, y + 1) + 2 * this.H(x, y + 1) + this.H(x + 1, y + 1)) - (this.H(x - 1, y - 1) + 2 * this.H(x, y - 1) + this.H(x + 1, y - 1));
        let nx = -dx * strength, ny = dy * strength, nz = 1;
        const l = Math.hypot(nx, ny, nz);
        nx /= l; ny /= l; nz /= l;
        const i = (y * this.w + x) * 4;
        d[i] = (nx * 0.5 + 0.5) * 255; d[i + 1] = (ny * 0.5 + 0.5) * 255; d[i + 2] = (nz * 0.5 + 0.5) * 255; d[i + 3] = 255;
      }
    cv.getContext('2d').putImageData(new ImageData(d, this.w, this.h), 0, 0);
    return cv;
  }
}

export function tex(src, { repeat = false, mip = false, srgb = true, aniso = 1 } = {}) {
  const t = new THREE.CanvasTexture(src instanceof Pix ? src.canvas() : src);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = mip ? THREE.LinearMipmapLinearFilter : THREE.NearestFilter;
  t.generateMipmaps = mip;
  t.anisotropy = aniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
export function texFromCanvas(cv, opts = {}) { return tex(cv, opts); }

// texture mềm (không pixel) cho quầng sáng / bóng tròn dưới chân
export function softDisc(size = 64, inner = 0, power = 2) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d');
  const d = g.createImageData(size, size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const r = Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2) / (size / 2);
      const v = r < inner ? 1 : Math.max(0, 1 - (r - inner) / (1 - inner));
      const i = (y * size + x) * 4;
      d.data[i] = d.data[i + 1] = d.data[i + 2] = 255;
      d.data[i + 3] = Math.pow(v, power) * 255;
    }
  g.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---- patch shader dùng chung ----
// Sprite phẳng: bỏ phụ thuộc góc tới của đèn (N·L) để sprite luôn nhận sáng
// đúng theo khoảng cách tới đèn, giống cách HD-2D chiếu sáng nhân vật 2D.
export function patchMaterial(mat, key, fn) {
  const prev = mat.onBeforeCompile;
  const prevKey = mat.customProgramCacheKey ? mat.customProgramCacheKey() : '';
  mat.onBeforeCompile = (sh, r) => { if (prev) prev(sh, r); fn(sh, r); };
  mat.customProgramCacheKey = () => prevKey + '|' + key;
  return mat;
}
export function spriteLit(mat, wrap = 1) {
  return patchMaterial(mat, 'spriteLit' + wrap, (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <lights_lambert_pars_fragment>',
      THREE.ShaderChunk.lights_lambert_pars_fragment.replace(
        'float dotNL = saturate( dot( geometryNormal, directLight.direction ) );',
        `float dotNL = mix( saturate( dot( geometryNormal, directLight.direction ) ), 1.0, ${wrap.toFixed(3)} );`));
  });
}

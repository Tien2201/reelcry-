// Hiệu ứng sống động: hạt (máu, tia lửa, vỏ đạn, khói voxel, tàn lửa), mưa,
// bọt nước, đom đóm, tro, lá rơi, sương mù, vệt nắng, quạ, bướm đêm, vết máu.
import * as THREE from 'three';
import { spriteLit, patchMaterial, softDisc, makeRng } from './pixel.js';
import { makeCrowAtlas, makeBloodAtlas, makeSmallAtlas } from './sprites.js';
import { mistTex, shaftTex } from './textures.js';
import { U } from './world.js';

const V = new THREE.Vector3(), S = new THREE.Vector3(), M = new THREE.Matrix4(), Q = new THREE.Quaternion(), C = new THREE.Color(), EU = new THREE.Euler();
const rand = (a, b) => a + Math.random() * (b - a);

// ---------- hạt CPU (instanced) ----------
export class Particles {
  constructor(parent, max, { additive = false, cube = false, lit = true, map = null, camQuat }) {
    this.max = max; this.n = 0; this.camQuat = camQuat; this.cube = cube;
    const geo = cube ? new THREE.BoxGeometry(1, 1, 1) : new THREE.PlaneGeometry(1, 1);
    let mat;
    if (additive) mat = new THREE.MeshBasicMaterial({ color: 0xffffff, map, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    else if (lit) { mat = new THREE.MeshLambertMaterial({ color: 0xffffff, map, alphaTest: map ? 0.5 : 0 }); if (!cube) spriteLit(mat); }
    else mat = new THREE.MeshBasicMaterial({ color: 0xffffff, map, alphaTest: 0.5 });
    if (!cube) mat.side = THREE.DoubleSide;
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, C.set(0xffffff));
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    parent.add(this.mesh);
    const F = (k) => new Float32Array(max * k);
    this.p = F(3); this.v = F(3); this.life = F(1); this.max0 = F(1); this.size = F(1); this.grav = F(1); this.drag = F(1);
    this.col = F(3); this.rot = F(3); this.spin = F(1); this.mode = new Uint8Array(max); this.bounce = F(1);
    this.onLand = null;
  }
  spawn(x, y, z, vx, vy, vz, life, size, color, { grav = 9.8, drag = 1, mode = 0, bounce = 0, spin = 0 } = {}) {
    if (this.n >= this.max) return -1;
    const i = this.n++;
    this.p.set([x, y, z], i * 3); this.v.set([vx, vy, vz], i * 3);
    this.life[i] = this.max0[i] = life; this.size[i] = size; this.grav[i] = grav; this.drag[i] = drag;
    C.set(color); this.col.set([C.r, C.g, C.b], i * 3);
    this.rot.set([Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28], i * 3);
    this.spin[i] = spin; this.mode[i] = mode; this.bounce[i] = bounce;
    return i;
  }
  kill(i) {
    const j = --this.n;
    if (i === j) return;
    for (const [arr, k] of [[this.p, 3], [this.v, 3], [this.col, 3], [this.rot, 3]]) arr.copyWithin(i * k, j * k, j * k + k);
    for (const arr of [this.life, this.max0, this.size, this.grav, this.drag, this.spin, this.bounce]) arr[i] = arr[j];
    this.mode[i] = this.mode[j];
  }
  // mode: 0 thường (co lại khi tàn), 1 sáng cộng (mờ dần), 2 khói (to rồi nhỏ), 3 nằm lại trên đất
  update(dt) {
    const p = this.p, v = this.v;
    for (let i = this.n - 1; i >= 0; i--) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.kill(i); continue; }
      const k = i * 3;
      const dr = Math.exp(-this.drag[i] * dt);
      v[k] *= dr; v[k + 2] *= dr; v[k + 1] = v[k + 1] * dr - this.grav[i] * dt;
      p[k] += v[k] * dt; p[k + 1] += v[k + 1] * dt; p[k + 2] += v[k + 2] * dt;
      if (p[k + 1] < 0.02 && this.grav[i] > 0) {
        p[k + 1] = 0.02;
        if (this.bounce[i] > 0 && Math.abs(v[k + 1]) > 1) { v[k + 1] = -v[k + 1] * this.bounce[i]; v[k] *= 0.6; v[k + 2] *= 0.6; this.spin[i] *= 0.5; }
        else {
          if (this.onLand && this.mode[i] !== 3) { if (this.onLand(p[k], p[k + 2], this.col[k], i)) { this.kill(i); continue; } }
          v[k] = v[k + 1] = v[k + 2] = 0; this.spin[i] = 0;
          if (this.mode[i] === 0) this.mode[i] = 3;
        }
      }
      this.rot[k] += this.spin[i] * dt; this.rot[k + 1] += this.spin[i] * 0.7 * dt;
    }
    const cq = this.camQuat;
    for (let i = 0; i < this.n; i++) {
      const k = i * 3, t = this.life[i] / this.max0[i];
      let s = this.size[i], cr = this.col[k], cg = this.col[k + 1], cb = this.col[k + 2];
      const m = this.mode[i];
      if (m === 0) s *= Math.min(1, t * 4);
      else if (m === 1) { const f = Math.min(1, t * 2.5); cr *= f; cg *= f; cb *= f; }
      else if (m === 2) s *= Math.sin(Math.min(1, (1 - t) * 1.25) * Math.PI) * 0.8 + 0.2 * (1 - t);
      else if (m === 3) s *= Math.min(1, t * 3);
      if (this.cube) Q.setFromEuler(EU.set(this.rot[k], this.rot[k + 1], this.rot[k + 2]));
      else if (m === 3 && !this.cube) Q.setFromEuler(EU.set(-Math.PI / 2, 0, this.rot[k]));
      else Q.copy(cq);
      M.compose(V.set(this.p[k], this.p[k + 1] + (m === 3 ? 0 : 0), this.p[k + 2]), Q, S.set(s, s, s));
      this.mesh.setMatrixAt(i, M);
      this.mesh.setColorAt(i, C.setRGB(cr, cg, cb));
    }
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

// ---------- vết máu trên mặt đất ----------
export class Decals {
  constructor(parent, max = 180) {
    const atlas = makeBloodAtlas();
    atlas.map.repeat.set(1 / atlas.count, 1);
    const mat = new THREE.MeshLambertMaterial({ map: atlas.map, alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    spriteLit(mat, 0.25);
    patchMaterial(mat, 'decal', (sh) => {
      sh.vertexShader = 'attribute float aVar;\n' + sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\nvMapUv.x += aVar * 0.25;');
    });
    const geo = new THREE.PlaneGeometry(1, 1);
    this.aVar = new THREE.InstancedBufferAttribute(new Float32Array(max), 1);
    geo.setAttribute('aVar', this.aVar);
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.count = 0; this.mesh.frustumCulled = false; this.mesh.receiveShadow = true;
    this.max = max; this.i = 0;
    parent.add(this.mesh);
  }
  add(x, z, size) {
    const i = this.i % this.max; this.i++;
    M.compose(V.set(x, 0.015 + (i % 7) * 0.0015, z), Q.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, Math.random() * 6.28)), S.set(size, size, 1));
    this.mesh.setMatrixAt(i, M);
    this.aVar.setX(i, Math.floor(Math.random() * 4));
    this.aVar.needsUpdate = true;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.count = Math.min(this.max, this.i);
  }
  clear() { this.i = 0; this.mesh.count = 0; }
}

// ---------- mưa (GPU) ----------
export class Rain {
  constructor(parent, count = 2200) {
    const pos = new Float32Array(count * 6), seed = new Float32Array(count * 8), end = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      const s = [Math.random(), Math.random(), Math.random(), Math.random()];
      seed.set(s, i * 8); seed.set(s, i * 8 + 4);
      end[i * 2] = 0; end[i * 2 + 1] = 1;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    g.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
    this.u = { uTime: U.time, uCenter: { value: new THREE.Vector3() }, uAmount: { value: 0 }, uWind: { value: new THREE.Vector2(0.25, 0.05) }, uColor: { value: new THREE.Color(0.55, 0.62, 0.75) } };
    const m = new THREE.ShaderMaterial({
      uniforms: this.u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `
        attribute vec4 aSeed; attribute float aEnd;
        uniform float uTime, uAmount; uniform vec3 uCenter; uniform vec2 uWind;
        varying float vA;
        void main(){
          float t = fract(aSeed.z + uTime * (0.85 + aSeed.w * 0.35));
          vec3 p = vec3(uCenter.x + (aSeed.x - 0.5) * 40.0, mix(15.0, -0.2, t), uCenter.z + (aSeed.y - 0.5) * 34.0);
          p.xz += uWind * (1.0 - t) * 6.0;
          vec3 dir = normalize(vec3(uWind.x, -1.0, uWind.y));
          p -= dir * aEnd * 0.75;
          vA = step(aSeed.w, uAmount) * (1.0 - aEnd * 0.85) * smoothstep(-0.2, 0.6, p.y);
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: `uniform vec3 uColor; varying float vA; void main(){ gl_FragColor = vec4(uColor * vA * 0.55, 1.0); }`,
    });
    this.mesh = new THREE.LineSegments(g, m);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    parent.add(this.mesh);
    // bọt nước bắn trên mặt đất
    const n2 = 700, sp = new Float32Array(n2 * 3), ss = new Float32Array(n2 * 3);
    for (let i = 0; i < n2; i++) ss.set([Math.random(), Math.random(), Math.random()], i * 3);
    const g2 = new THREE.BufferGeometry();
    g2.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    g2.setAttribute('aSeed', new THREE.BufferAttribute(ss, 3));
    this.u2 = { uTime: U.time, uCenter: this.u.uCenter, uAmount: this.u.uAmount, uPx: { value: 800 }, uColor: this.u.uColor };
    const m2 = new THREE.ShaderMaterial({
      uniforms: this.u2, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `
        attribute vec3 aSeed; uniform float uTime, uAmount, uPx; uniform vec3 uCenter;
        varying float vT; varying float vA;
        void main(){
          float t = fract(aSeed.z + uTime * 1.6);
          float cyc = floor(aSeed.z + uTime * 1.6);
          vec2 j = fract(vec2(sin(cyc * 12.9898 + aSeed.x * 78.2), sin(cyc * 39.346 + aSeed.y * 11.1)) * 43758.5453);
          vT = t;
          vA = step(fract(aSeed.x * 13.7 + aSeed.y * 7.3), uAmount);
          vec3 p = vec3(uCenter.x + (j.x - 0.5) * 32.0, 0.04, uCenter.z + (j.y - 0.5) * 26.0);
          vec4 mv = viewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = max(2.0, (0.12 + t * 0.32) * uPx / -mv.z);
        }`,
      fragmentShader: `
        uniform vec3 uColor; varying float vT; varying float vA;
        void main(){
          vec2 c = gl_PointCoord - 0.5;
          float r = length(c * vec2(1.0, 2.0)) * 2.0;
          float ring = smoothstep(0.18, 0.0, abs(r - (0.3 + vT * 0.7)));
          float a = ring * (1.0 - vT) * vA * 0.7;
          if (a < 0.02) discard;
          gl_FragColor = vec4(uColor * a * 0.9, 1.0);
        }`,
    });
    this.splash = new THREE.Points(g2, m2);
    this.splash.frustumCulled = false;
    parent.add(this.splash);
  }
  update(center, amount, wind, px) {
    if (px) this.u2.uPx.value = px;
    this.u.uCenter.value.copy(center);
    this.u.uAmount.value = amount;
    this.u.uWind.value.set(0.22 * wind, 0.06 * wind);
    this.mesh.visible = this.splash.visible = amount > 0.01;
  }
}

// ---------- đom đóm / tro bay / bụi sáng (GPU points) ----------
export class Motes {
  constructor(parent, count, { color, size = 26, zones, mode = 'firefly', glow = true }) {
    const pos = new Float32Array(count * 3), seed = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      const z = zones[i % zones.length];
      seed.set([z.x + (Math.random() - 0.5) * z.w, z.z + (Math.random() - 0.5) * z.d, Math.random() * 100, Math.random()], i * 4);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    this.u = { uTime: U.time, uAmount: { value: 0 }, uColor: { value: new THREE.Color(color) }, uScale: { value: size }, uCenter: { value: new THREE.Vector3() }, uPx: { value: 400 } };
    const ash = mode === 'ash';
    const m = new THREE.ShaderMaterial({
      uniforms: this.u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `
        attribute vec4 aSeed; uniform float uTime, uAmount, uScale, uPx; uniform vec3 uCenter;
        varying float vA;
        void main(){
          float ph = aSeed.z, t = uTime;
          vec3 p;
          ${ash ? `
          float fall = fract(aSeed.w + t * 0.045);
          p = vec3(uCenter.x + (fract(aSeed.x * 0.0137 + aSeed.w * 3.1) - 0.5) * 36.0 + sin(t * 0.7 + ph) * 1.2,
                   mix(9.0, 0.0, fall),
                   uCenter.z + (fract(aSeed.y * 0.0191 + aSeed.w * 7.7) - 0.5) * 30.0 + cos(t * 0.5 + ph) * 0.8);
          vA = smoothstep(0.0, 0.1, fall) * (1.0 - smoothstep(0.85, 1.0, fall));` : `
          p = vec3(aSeed.x + sin(t * 0.37 + ph) * 1.6 + sin(t * 1.3 + ph * 2.0) * 0.3,
                   0.5 + aSeed.w * 1.8 + sin(t * 0.9 + ph * 1.7) * 0.35,
                   aSeed.y + cos(t * 0.29 + ph * 1.3) * 1.4);
          vA = pow(max(0.0, sin(t * (1.2 + aSeed.w) + ph * 5.0)), 2.0) * 0.85 + 0.15;`}
          vA *= step(aSeed.w, uAmount);
          vec4 mv = viewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = uScale * uPx / -mv.z;
        }`,
      fragmentShader: `
        uniform vec3 uColor; varying float vA;
        void main(){
          vec2 c = gl_PointCoord - 0.5;
          ${glow ? 'float d = length(c) * 2.0; float a = (smoothstep(1.0, 0.0, d) * 0.35 + step(d, 0.16)) * vA;' : 'float a = step(max(abs(c.x), abs(c.y)), 0.25) * vA;'}
          if (a < 0.01) discard;
          gl_FragColor = vec4(uColor * a, 1.0);
        }`,
    });
    this.mesh = new THREE.Points(g, m);
    this.mesh.frustumCulled = false;
    parent.add(this.mesh);
  }
  update(amount, center, px) {
    this.u.uAmount.value = amount;
    if (center) this.u.uCenter.value.copy(center);
    if (px) this.u.uPx.value = px;
    this.mesh.visible = amount > 0.01;
  }
}

// ---------- sương mù sát mặt đất ----------
export class Mist {
  constructor(parent, layers = 3) {
    const t = mistTex();
    this.layers = [];
    for (let i = 0; i < layers; i++) {
      const mt = t.clone(); mt.needsUpdate = true;
      mt.repeat.set(5, 4);
      const m = new THREE.MeshBasicMaterial({ map: mt, transparent: true, depthWrite: false, opacity: 0, color: 0xffffff, fog: true });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(110, 80), m);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(0, 0.25 + i * 0.45, 0);
      mesh.renderOrder = 3 + i;
      parent.add(mesh);
      this.layers.push({ mesh, map: mt, sp: 0.006 + i * 0.004 });
    }
  }
  update(dt, t, amount, color) {
    for (const [i, L] of this.layers.entries()) {
      L.map.offset.set(t * L.sp, t * L.sp * 0.6 + i * 0.3);
      L.mesh.material.opacity = amount * (0.34 - i * 0.07);
      L.mesh.material.color.copy(color);
      L.mesh.visible = amount > 0.01;
    }
  }
}

// ---------- vệt nắng / ánh trăng xuyên tán cây ----------
export class Shafts {
  constructor(parent, spots) {
    const t = shaftTex();
    this.items = spots.map((s) => {
      const m = new THREE.ShaderMaterial({
        uniforms: { map: { value: t }, color: { value: new THREE.Color(0) } },
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        vertexShader: `varying vec2 vUv; varying float vD; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vD = -mv.z; gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `uniform sampler2D map; uniform vec3 color; varying vec2 vUv; varying float vD;
          void main(){ float a = texture2D(map, vUv).a * smoothstep(16.0, 26.0, vD); gl_FragColor = vec4(color * a, 1.0); }`,
      });
      m.color = m.uniforms.color.value;
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(s.w, 14), m);
      mesh.geometry.translate(0, -7, 0);
      mesh.position.set(s.x, s.y, s.z);
      mesh.renderOrder = 6;
      parent.add(mesh);
      return { mesh, ph: Math.random() * 10, s };
    });
  }
  update(t, amount, color, sunDir) {
    const lean = Math.atan2(-sunDir.x, sunDir.y);
    for (const it of this.items) {
      const f = amount * (0.55 + 0.45 * Math.sin(t * 0.35 + it.ph)) * 0.22;
      it.mesh.material.color.copy(color).multiplyScalar(f);
      it.mesh.rotation.set(-0.25, 0, lean * 0.8);
      it.mesh.visible = amount > 0.01;
    }
  }
}

// ---------- quạ: đậu trên mái/hàng rào, giật mình bay đi ----------
export class Crows {
  constructor(parent, perches, camQuat, onCaw) {
    const atlas = makeCrowAtlas();
    this.atlas = atlas; this.perches = perches; this.camQuat = camQuat; this.onCaw = onCaw;
    this.birds = [];
    const geo = new THREE.PlaneGeometry(atlas.w, atlas.h); geo.translate(0, atlas.h / 2, 0);
    for (let i = 0; i < 9; i++) {
      const map = atlas.map.clone(); map.needsUpdate = true; map.repeat.set(1 / 3, 1);
      const mat = spriteLit(new THREE.MeshLambertMaterial({ map, alphaTest: 0.5, side: THREE.DoubleSide }));
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map, alphaTest: 0.5 });
      parent.add(mesh);
      const b = { mesh, map, state: 'gone', t: rand(1, 8), vx: 0, vy: 0, vz: 0, perch: null, flap: 0, flip: 1, hop: rand(1, 5) };
      this.birds.push(b);
    }
  }
  scare(x, z, r) {
    for (const b of this.birds) if (b.state === 'perched' && Math.hypot(b.mesh.position.x - x, b.mesh.position.z - z) < r) this.takeOff(b, x, z);
  }
  takeOff(b, x, z) {
    b.state = 'fly';
    const dx = b.mesh.position.x - x, dz = b.mesh.position.z - z, d = Math.hypot(dx, dz) || 1;
    b.vx = dx / d * rand(3, 5); b.vz = dz / d * rand(2, 4) - 1.5; b.vy = rand(2.5, 4);
    b.t = 7;
    if (this.onCaw) this.onCaw(b.mesh.position);
    if (b.perch) b.perch.used = false;
  }
  update(dt, player, camTarget) {
    for (const b of this.birds) {
      const p = b.mesh.position;
      if (b.state === 'gone') {
        b.mesh.visible = false;
        b.t -= dt;
        if (b.t <= 0) {
          const free = this.perches.filter((q) => !q.used && Math.hypot(q.x - player.x, q.z - player.z) > 7);
          if (!free.length) { b.t = 5; continue; }
          const q = free[Math.floor(Math.random() * free.length)];
          q.used = true; b.perch = q;
          p.set(q.x + rand(-0.2, 0.2), q.y, q.z);
          b.state = 'perched'; b.mesh.visible = true; b.flip = Math.random() < 0.5 ? 1 : -1;
        }
      } else if (b.state === 'perched') {
        b.hop -= dt;
        if (b.hop <= 0) { b.hop = rand(1.5, 6); b.flip *= Math.random() < 0.5 ? -1 : 1; }
        b.map.offset.x = 0;
        if (Math.hypot(p.x - player.x, p.z - player.z) < 4.2) this.takeOff(b, player.x, player.z);
      } else {
        b.flap += dt * 14;
        b.vy += dt * 0.6;
        p.x += b.vx * dt; p.y += b.vy * dt; p.z += b.vz * dt;
        b.flip = b.vx >= 0 ? 1 : -1;
        b.map.offset.x = (1 + (Math.floor(b.flap) % 2)) / 3;
        b.t -= dt;
        if (b.t <= 0 || p.y > 22) { b.state = 'gone'; b.t = rand(12, 30); }
      }
      b.mesh.scale.x = b.flip;
    }
  }
}

// ---------- bướm đêm quanh đèn ----------
export class Moths {
  constructor(parent, camQuat, max = 24) {
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.11, 0.08), spriteLit(new THREE.MeshLambertMaterial({ color: '#e8dcc0', side: THREE.DoubleSide })), max);
    this.mesh.frustumCulled = false; this.mesh.count = 0;
    this.camQuat = camQuat; this.max = max;
    this.seeds = Array.from({ length: max }, () => [Math.random() * 10, rand(0.25, 0.6), rand(2, 4)]);
    parent.add(this.mesh);
  }
  update(t, lamps, center, active) {
    if (!active) { this.mesh.count = 0; return; }
    const near = lamps.map((l) => ({ l, d: Math.hypot(l.x - center.x, l.z - center.z) })).filter((o) => o.d < 22 && o.l.e.cur > 1).sort((a, b) => a.d - b.d).slice(0, 6);
    let n = 0;
    for (const { l } of near)
      for (let k = 0; k < 4 && n < this.max; k++, n++) {
        const [ph, r, sp] = this.seeds[n];
        const a = t * sp + ph;
        V.set(l.x + Math.cos(a) * r + Math.sin(t * 7 + ph) * 0.05, l.y + Math.sin(a * 1.7) * 0.25 + 0.05, l.z + Math.sin(a) * r * 0.6 + 0.15);
        const flap = 0.6 + 0.4 * Math.abs(Math.sin(t * 30 + ph * 9));
        M.compose(V, this.camQuat, S.set(flap, 1, 1));
        this.mesh.setMatrixAt(n, M);
      }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ---------- lá rơi ----------
export class Leaves {
  constructor(parent, camQuat, max = 140) {
    const atlas = makeSmallAtlas();
    atlas.repeat.set(0.25, 1);
    this.p = new Particles(parent, max, { map: atlas, camQuat });
    this.acc = 0;
  }
  update(dt, t, amount, canopies, center, wind) {
    this.acc += dt * amount * 9;
    while (this.acc > 1) {
      this.acc -= 1;
      const near = canopies.filter((c) => Math.abs(c.x - center.x) < 22 && Math.abs(c.z - center.z) < 18);
      if (!near.length) break;
      const c = near[Math.floor(Math.random() * near.length)];
      const col = new THREE.Color(c.color).multiplyScalar(rand(0.8, 1.3));
      this.p.spawn(c.x + rand(-c.r, c.r), c.y + rand(0, 1.5), c.z + rand(-c.r * 0.6, c.r * 0.6), rand(0.2, 0.8) * wind, rand(-0.2, 0), rand(-0.2, 0.2), rand(7, 11), 0.2, col, { grav: 0.35, drag: 1.8, spin: rand(2, 5) });
    }
    for (let i = 0; i < this.p.n; i++) {
      const k = i * 3;
      if (this.p.p[k + 1] > 0.05) { this.p.v[k] += Math.sin(t * 2.3 + i) * dt * 1.2 + 0.35 * wind * dt; this.p.v[k + 2] += Math.cos(t * 1.7 + i * 1.3) * dt * 0.8; }
    }
    this.p.update(dt);
  }
}

export function glowTexture() { return softDisc(64, 0, 2); }
export { makeRng };

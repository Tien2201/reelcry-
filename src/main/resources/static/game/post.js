// Hậu kỳ kiểu HD-2D: DOF theo độ sâu (tiền cảnh/hậu cảnh nhoè như máy ảnh
// thu nhỏ), bloom nhiều tầng, tone-map ACES, chỉnh màu, vignette, hạt phim.
import * as THREE from 'three';

const VERT = /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const COC = /* glsl */`
float cocAt(float depth){
  float z = -perspectiveDepthToViewZ(depth, uNear, uFar);
  float d = z - uFocus;
  return clamp((abs(d) - uRange) / uFall, 0.0, 1.0) * (d < 0.0 ? uNearK : 1.0);
}`;

function mat(frag, uniforms) {
  return new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false });
}

export class Post {
  constructor(renderer) {
    this.r = renderer;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
    this.quad = new THREE.Mesh(geo);
    this.quad.frustumCulled = false;
    this.scene = new THREE.Scene();
    this.scene.add(this.quad);
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const half = { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false };
    this.rtScene = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    this.rtScene.depthTexture = new THREE.DepthTexture(4, 4);
    this.rtScene2 = new THREE.WebGLRenderTarget(4, 4, half);
    this.pixel = 1;
    this.rtA = new THREE.WebGLRenderTarget(4, 4, half);
    this.rtB = new THREE.WebGLRenderTarget(4, 4, half);
    this.bd = Array.from({ length: 5 }, () => new THREE.WebGLRenderTarget(4, 4, half));
    this.bu = Array.from({ length: 4 }, () => new THREE.WebGLRenderTarget(4, 4, half));
    const dofU = () => ({ uNear: { value: 1 }, uFar: { value: 200 }, uFocus: { value: 30 }, uRange: { value: 3 }, uFall: { value: 10 }, uNearK: { value: 1 } });

    this.mCoc = mat(/* glsl */`
      #include <packing>
      uniform sampler2D tColor; uniform sampler2D tDepth; uniform vec2 uTexel;
      uniform float uNear, uFar, uFocus, uRange, uFall, uNearK;
      varying vec2 vUv;
      ${COC}
      void main(){
        vec2 o = uTexel * 0.5;
        vec3 c = texture2D(tColor, vUv + vec2(-o.x, -o.y)).rgb + texture2D(tColor, vUv + vec2(o.x, -o.y)).rgb
               + texture2D(tColor, vUv + vec2(-o.x, o.y)).rgb + texture2D(tColor, vUv + vec2(o.x, o.y)).rgb;
        float k = max(max(cocAt(texture2D(tDepth, vUv + vec2(-o.x, -o.y)).x), cocAt(texture2D(tDepth, vUv + vec2(o.x, o.y)).x)),
                      max(cocAt(texture2D(tDepth, vUv + vec2(o.x, -o.y)).x), cocAt(texture2D(tDepth, vUv + vec2(-o.x, o.y)).x)));
        gl_FragColor = vec4(c * 0.25, k);
      }`, { tColor: { value: null }, tDepth: { value: null }, uTexel: { value: new THREE.Vector2() }, ...dofU() });

    this.mBlur = mat(/* glsl */`
      uniform sampler2D tSrc; uniform vec2 uDir; uniform float uMaxR;
      varying vec2 vUv;
      void main(){
        vec4 c0 = texture2D(tSrc, vUv);
        float r = c0.a * uMaxR;
        vec3 acc = c0.rgb; float ws = 1.0;
        for (int i = 1; i <= 8; i++) {
          float t = float(i) / 8.0;
          float g = exp(-t * t * 2.2);
          vec2 off = uDir * r * t;
          vec4 a = texture2D(tSrc, vUv + off);
          vec4 b = texture2D(tSrc, vUv - off);
          float wa = g * smoothstep(0.0, 0.35, a.a + 0.03);
          float wb = g * smoothstep(0.0, 0.35, b.a + 0.03);
          acc += a.rgb * wa + b.rgb * wb; ws += wa + wb;
        }
        gl_FragColor = vec4(acc / ws, c0.a);
      }`, { tSrc: { value: null }, uDir: { value: new THREE.Vector2() }, uMaxR: { value: 7 } });

    this.mBright = mat(/* glsl */`
      uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uThreshold; uniform float uKnee;
      varying vec2 vUv;
      void main(){
        vec2 o = uTexel * 0.5;
        vec3 c = (texture2D(tSrc, vUv + vec2(-o.x, -o.y)).rgb + texture2D(tSrc, vUv + vec2(o.x, -o.y)).rgb
                + texture2D(tSrc, vUv + vec2(-o.x, o.y)).rgb + texture2D(tSrc, vUv + vec2(o.x, o.y)).rgb) * 0.25;
        float br = max(c.r, max(c.g, c.b));
        float soft = clamp(br - uThreshold + uKnee, 0.0, 2.0 * uKnee);
        soft = soft * soft / (4.0 * uKnee + 1e-4);
        float contrib = max(soft, br - uThreshold) / max(br, 1e-4);
        gl_FragColor = vec4(min(c * contrib, vec3(40.0)), 1.0);
      }`, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uThreshold: { value: 1 }, uKnee: { value: 0.5 } });

    this.mDown = mat(/* glsl */`
      uniform sampler2D tSrc; uniform vec2 uTexel; varying vec2 vUv;
      void main(){
        vec3 c = texture2D(tSrc, vUv + uTexel * vec2(-1.0, -1.0)).rgb + texture2D(tSrc, vUv + uTexel * vec2(1.0, -1.0)).rgb
               + texture2D(tSrc, vUv + uTexel * vec2(-1.0, 1.0)).rgb + texture2D(tSrc, vUv + uTexel * vec2(1.0, 1.0)).rgb;
        gl_FragColor = vec4(c * 0.25, 1.0);
      }`, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } });

    this.mUp = mat(/* glsl */`
      uniform sampler2D tSrc; uniform sampler2D tBase; uniform vec2 uTexel; uniform float uScatter; varying vec2 vUv;
      void main(){
        vec3 s = texture2D(tSrc, vUv).rgb * 4.0;
        s += (texture2D(tSrc, vUv + uTexel * vec2(-1.0, 0.0)).rgb + texture2D(tSrc, vUv + uTexel * vec2(1.0, 0.0)).rgb
            + texture2D(tSrc, vUv + uTexel * vec2(0.0, -1.0)).rgb + texture2D(tSrc, vUv + uTexel * vec2(0.0, 1.0)).rgb) * 2.0;
        s += texture2D(tSrc, vUv + uTexel * vec2(-1.0, -1.0)).rgb + texture2D(tSrc, vUv + uTexel * vec2(1.0, -1.0)).rgb
           + texture2D(tSrc, vUv + uTexel * vec2(-1.0, 1.0)).rgb + texture2D(tSrc, vUv + uTexel * vec2(1.0, 1.0)).rgb;
        gl_FragColor = vec4(texture2D(tBase, vUv).rgb + s / 16.0 * uScatter, 1.0);
      }`, { tSrc: { value: null }, tBase: { value: null }, uTexel: { value: new THREE.Vector2() }, uScatter: { value: 0.85 } });

    // phản chiếu mặt đường / sân ướt: dò tia trong không gian màn hình (SSR),
    // chỉ áp cho điểm ảnh nằm trên mặt phố (y≈0) hoặc mặt sân trên (y≈TY)
    this.mSSR = mat(/* glsl */`
      #include <packing>
      uniform sampler2D tColor; uniform sampler2D tDepth;
      uniform mat4 uProj, uProjInv, uView, uViewInv;
      uniform float uWet, uNear, uFar, uTime, uRain, uZ0, uZ1, uTY, uSteps;
      uniform vec3 uSky;
      varying vec2 vUv;
      float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
      float viewZ(vec2 su){ return -perspectiveDepthToViewZ(texture2D(tDepth, su).x, uNear, uFar); }
      void main(){
        vec4 base = texture2D(tColor, vUv);
        float d = texture2D(tDepth, vUv).x;
        if (d >= 0.99999) { gl_FragColor = base; return; }
        vec4 v4 = uProjInv * vec4(vUv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
        vec3 wp = (uViewInv * vec4(v4.xyz / v4.w, 1.0)).xyz;
        float onStreet = step(abs(wp.y), 0.06) * step(uZ0, wp.z) * step(wp.z, uZ1);
        float onTerrace = step(abs(wp.y - uTY), 0.06) * step(wp.z, uZ0 - 0.1);
        if (onStreet + onTerrace < 0.5) { gl_FragColor = base; return; }
        vec3 cam = (uViewInv * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        vec3 V = normalize(wp - cam);
        vec2 q = floor(wp.xz * 16.0) / 16.0;
        // vũng nước loang lổ + gợn sóng do mưa rơi
        float puddle = smoothstep(0.32, 0.56, vn(q * 0.55 + 3.0) * 0.75 + vn(q * 2.1) * 0.25);
        float rip = uRain * (0.35 + 0.65 * (1.0 - puddle));
        vec3 N = normalize(vec3((vn(q * 4.0 + vec2(uTime * 2.3, 0.0)) - 0.5) * 0.09 * rip, 1.0, (vn(q * 4.0 + vec2(7.0, -uTime * 2.1)) - 0.5) * 0.09 * rip));
        vec3 R = reflect(V, N);
        float stepLen = 0.09, hit = 0.0, fi = 0.0;
        vec3 p = wp + R * 0.03;
        vec3 prev = p;
        vec2 su = vUv;
        for (int i = 0; i < 48; i++) {
          if (float(i) >= uSteps) break;
          prev = p; p += R * stepLen; stepLen *= 1.075;
          vec4 c = uProj * uView * vec4(p, 1.0);
          su = c.xy / c.w * 0.5 + 0.5;
          if (su.x < 0.0 || su.x > 1.0 || su.y < 0.0 || su.y > 1.0) break;
          float rz = -(uView * vec4(p, 1.0)).z;
          float dz = rz - viewZ(su);
          if (dz > 0.0 && dz < 0.9 + stepLen * 2.0) {
            // tinh chỉnh điểm chạm bằng chia đôi
            vec3 a = prev, b = p;
            for (int j = 0; j < 4; j++) {
              vec3 m = (a + b) * 0.5;
              vec4 cm = uProj * uView * vec4(m, 1.0);
              vec2 sm = cm.xy / cm.w * 0.5 + 0.5;
              if (-(uView * vec4(m, 1.0)).z > viewZ(sm)) { b = m; su = sm; } else a = m;
            }
            hit = 1.0; fi = float(i);
            break;
          }
        }
        vec3 hc = texture2D(tColor, su).rgb;
        vec2 e = smoothstep(0.0, 0.07, su) * smoothstep(1.0, 0.93, su);
        hit *= e.x * e.y * (1.0 - fi / uSteps * 0.7);
        float fres = 0.25 + 0.75 * pow(1.0 - max(dot(-V, N), 0.0), 3.0);
        float k = clamp(uWet * fres * mix(0.35, 1.0, puddle), 0.0, 1.0);
        // mặt ướt sẫm lại; vũng nước phản chiếu đèn, nhà, nhân vật
        vec3 col = base.rgb * (1.0 - k * 0.5 * (0.4 + 0.6 * puddle)) + (hc * hit * 1.25 + uSky * (1.0 - hit) * puddle * 0.5) * k;
        gl_FragColor = vec4(col, base.a);
      }`, {
      tColor: { value: null }, tDepth: { value: null },
      uProj: { value: new THREE.Matrix4() }, uProjInv: { value: new THREE.Matrix4() }, uView: { value: new THREE.Matrix4() }, uViewInv: { value: new THREE.Matrix4() },
      uWet: { value: 0 }, uNear: { value: 1 }, uFar: { value: 200 }, uTime: { value: 0 }, uRain: { value: 0 },
      uZ0: { value: -2 }, uZ1: { value: 4 }, uTY: { value: 1.8 }, uSteps: { value: 36 }, uSky: { value: new THREE.Color() },
    });

    this.mFinal = mat(/* glsl */`
      #include <packing>
      uniform sampler2D tScene; uniform sampler2D tDepth; uniform sampler2D tDof; uniform sampler2D tBloom;
      uniform float uNear, uFar, uFocus, uRange, uFall, uNearK, uDofOn;
      uniform float uBloom, uExposure, uSat, uContrast, uVig, uGrain, uTime, uCA;
      uniform vec3 uLift, uGamma, uGain, uTint, uFlash;
      uniform vec2 uRes;
      varying vec2 vUv;
      ${COC}
      vec3 aces(vec3 x){ return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
      float h12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
      vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
      void main(){
        vec2 uv = vUv;
        vec2 dc = uv - 0.5;
        vec2 ca = dc * uCA * dot(dc, dc);
        vec3 sharp = vec3(texture2D(tScene, uv - ca).r, texture2D(tScene, uv).g, texture2D(tScene, uv + ca).b);
        float coc = cocAt(texture2D(tDepth, uv).x);
        vec3 dof = texture2D(tDof, uv).rgb;
        vec3 col = mix(sharp, dof, smoothstep(0.04, 0.42, coc) * uDofOn);
        col += texture2D(tBloom, uv).rgb * uBloom;
        col = col * uExposure * uTint + uFlash;
        col = aces(col);
        col = uGain * (col + uLift * (1.0 - col));
        col = pow(max(col, 0.0), 1.0 / uGamma);
        float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
        col = mix(vec3(l), col, uSat);
        col = max((col - 0.18) * uContrast + 0.18, 0.0);
        float v = smoothstep(1.02, 0.28, length(dc * vec2(1.0, 0.9)) * 1.3);
        col *= mix(1.0, v, uVig);
        col = toSRGB(clamp(col, 0.0, 1.0));
        float n = h12(uv * uRes + fract(uTime * 13.7) * 300.0);
        col += (n - 0.5) * uGrain + (h12(uv * uRes * 1.37 + 17.0) - 0.5) / 255.0;
        gl_FragColor = vec4(col, 1.0);
      }`, {
      tScene: { value: null }, tDepth: { value: null }, tDof: { value: null }, tBloom: { value: null },
      ...dofU(), uDofOn: { value: 1 },
      uBloom: { value: 0.8 }, uExposure: { value: 1 }, uSat: { value: 1 }, uContrast: { value: 1 }, uVig: { value: 0.6 },
      uGrain: { value: 0.035 }, uTime: { value: 0 }, uCA: { value: 0.012 },
      uLift: { value: new THREE.Vector3() }, uGamma: { value: new THREE.Vector3(1, 1, 1) }, uGain: { value: new THREE.Vector3(1, 1, 1) },
      uTint: { value: new THREE.Vector3(1, 1, 1) }, uFlash: { value: new THREE.Vector3() },
      uRes: { value: new THREE.Vector2(1, 1) },
    });
    this.params = {
      focus: 30, range: 3, fall: 10, nearK: 1, maxBlur: 7, dof: true,
      bloom: 0.8, threshold: 1, exposure: 1, sat: 1, contrast: 1, vignette: 0.6, grain: 0.035, ca: 0.012,
      lift: [0, 0, 0], gamma: [1, 1, 1], gain: [1, 1, 1], tint: [1, 1, 1], flash: [0, 0, 0],
      ssr: 0, rain: 0, ssrSteps: 36, z0: -2, z1: 4, ty: 1.8, sky: new THREE.Color(),
    };
  }

  // chế độ "pixel hoá": dựng cảnh ở 1/k độ phân giải rồi phóng to kiểu nearest
  setPixel(k) {
    this.pixel = k;
    const f = k > 1 ? THREE.NearestFilter : THREE.LinearFilter;
    for (const rt of [this.rtScene, this.rtScene2]) { rt.texture.magFilter = f; rt.texture.minFilter = f; rt.texture.needsUpdate = true; rt.dispose(); }
    if (this.fullW) this.setSize(this.fullW, this.fullH);
  }
  setSize(fw, fh) {
    this.fullW = fw; this.fullH = fh;
    const w = Math.max(1, Math.round(fw / this.pixel)), h = Math.max(1, Math.round(fh / this.pixel));
    this.w = w; this.h = h;
    this.rtScene.setSize(w, h);
    this.rtScene2.setSize(w, h);
    const hw = Math.max(1, Math.round(w / 2)), hh = Math.max(1, Math.round(h / 2));
    this.rtA.setSize(hw, hh); this.rtB.setSize(hw, hh);
    let bw = hw, bh = hh;
    for (let i = 0; i < 5; i++) {
      this.bd[i].setSize(bw, bh);
      if (i < 4) this.bu[i].setSize(bw, bh);
      bw = Math.max(1, Math.round(bw / 2)); bh = Math.max(1, Math.round(bh / 2));
    }
  }

  pass(m, target, set) {
    for (const k in set) {
      const u = m.uniforms[k];
      if (u.value && u.value.isVector2 && Array.isArray(set[k])) u.value.set(set[k][0], set[k][1]);
      else u.value = set[k];
    }
    this.quad.material = m;
    this.r.setRenderTarget(target);
    this.r.render(this.scene, this.cam);
  }

  render(scene, camera, time) {
    const r = this.r, p = this.params;
    r.setRenderTarget(this.rtScene);
    r.render(scene, camera);
    let src = this.rtScene.texture;
    if (p.ssr > 0.01) {
      const u = this.mSSR.uniforms;
      u.uProj.value.copy(camera.projectionMatrix); u.uProjInv.value.copy(camera.projectionMatrixInverse);
      u.uView.value.copy(camera.matrixWorldInverse); u.uViewInv.value.copy(camera.matrixWorld); u.uSky.value.copy(p.sky);
      this.pass(this.mSSR, this.rtScene2, {
        tColor: src, tDepth: this.rtScene.depthTexture, uWet: p.ssr, uNear: camera.near, uFar: camera.far, uTime: time,
        uRain: p.rain, uZ0: p.z0, uZ1: p.z1, uTY: p.ty, uSteps: p.ssrSteps,
      });
      src = this.rtScene2.texture;
    }
    const dofSet = { uNear: camera.near, uFar: camera.far, uFocus: p.focus, uRange: p.range, uFall: p.fall, uNearK: p.nearK };
    const hw = this.rtA.width, hh = this.rtA.height;
    if (p.dof) {
      this.pass(this.mCoc, this.rtA, { tColor: src, tDepth: this.rtScene.depthTexture, uTexel: [1 / this.w, 1 / this.h], ...dofSet });
      this.pass(this.mBlur, this.rtB, { tSrc: this.rtA.texture, uDir: [1 / hw, 0], uMaxR: p.maxBlur });
      this.pass(this.mBlur, this.rtA, { tSrc: this.rtB.texture, uDir: [0, 1 / hh], uMaxR: p.maxBlur });
    }
    this.pass(this.mBright, this.bd[0], { tSrc: src, uTexel: [1 / this.w, 1 / this.h], uThreshold: p.threshold, uKnee: 0.5 });
    for (let i = 1; i < 5; i++) this.pass(this.mDown, this.bd[i], { tSrc: this.bd[i - 1].texture, uTexel: [1 / this.bd[i - 1].width, 1 / this.bd[i - 1].height] });
    this.pass(this.mUp, this.bu[3], { tSrc: this.bd[4].texture, tBase: this.bd[3].texture, uTexel: [1 / this.bd[4].width, 1 / this.bd[4].height] });
    for (let i = 2; i >= 0; i--) this.pass(this.mUp, this.bu[i], { tSrc: this.bu[i + 1].texture, tBase: this.bd[i].texture, uTexel: [1 / this.bu[i + 1].width, 1 / this.bu[i + 1].height] });
    const f = this.mFinal.uniforms;
    f.uLift.value.fromArray(p.lift); f.uGamma.value.fromArray(p.gamma); f.uGain.value.fromArray(p.gain);
    f.uTint.value.fromArray(p.tint); f.uFlash.value.fromArray(p.flash);
    f.uRes.value.set(this.fullW, this.fullH);
    this.pass(this.mFinal, null, {
      tScene: src, tDepth: this.rtScene.depthTexture, tDof: this.rtA.texture, tBloom: this.bu[0].texture,
      ...dofSet, uDofOn: p.dof ? 1 : 0,
      uBloom: p.bloom, uExposure: p.exposure, uSat: p.sat, uContrast: p.contrast, uVig: p.vignette, uGrain: p.grain, uTime: time, uCA: p.ca,
    });
  }
}

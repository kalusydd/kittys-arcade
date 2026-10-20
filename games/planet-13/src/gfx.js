// Renderer, post-processing, shared materials and custom shaders.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

export { THREE };

// ---------------------------------------------------------------- shared GLSL
export const GLSL_NOISE = /* glsl */ `
float hash21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash21(i),hash21(i+vec2(1,0)),f.x), mix(hash21(i+vec2(0,1)),hash21(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float a=0.5, s=0.0; for(int i=0;i<4;i++){ s+=a*vnoise(p); p=p*2.03+vec2(1.7,9.2); a*=0.5; } return s; }
`;

// ---------------------------------------------------------------- toon basics
let GRADIENT = null;
export function gradientMap() {
  if (GRADIENT) return GRADIENT;
  const data = new Uint8Array([70, 70, 70, 255, 150, 150, 150, 255, 215, 215, 215, 255, 255, 255, 255, 255]);
  GRADIENT = new THREE.DataTexture(data, 4, 1, THREE.RGBAFormat);
  GRADIENT.minFilter = GRADIENT.magFilter = THREE.NearestFilter;
  GRADIENT.needsUpdate = true;
  return GRADIENT;
}
export function toon(color, opts = {}) {
  return new THREE.MeshToonMaterial({ color, gradientMap: gradientMap(), ...opts });
}
export function glow(color, intensity = 2) {
  return new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), toneMapped: true });
}

const outlineCache = new Map();
export function outlineMaterial(thick = 0.035, color = '#0b0614') {
  const key = thick.toFixed(3) + color;
  if (outlineCache.has(key)) return outlineCache.get(key);
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\n transformed += normalize(normal) * ${thick.toFixed(4)};`);
  };
  m.customProgramCacheKey = () => 'outline' + key;
  outlineCache.set(key, m);
  return m;
}
export function addOutline(mesh, thick = 0.035) {
  const o = new THREE.Mesh(mesh.geometry, outlineMaterial(thick));
  o.raycast = () => {};
  o.userData.outline = true;
  mesh.add(o);
  return o;
}

// ---------------------------------------------------------------- platform material
const PATTERN_GLSL = /* glsl */ `
${GLSL_NOISE}
vec2 vor(vec2 p){ vec2 i=floor(p), f=fract(p); float d1=8.0, d2=8.0;
  for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++){ vec2 g=vec2(x,y); vec2 o=vec2(hash21(i+g), hash21(i+g+17.3));
    float d=length(g+o-f); if(d<d1){d2=d1; d1=d;} else if(d<d2) d2=d; }
  return vec2(d1,d2); }
float hexd(vec2 p){ p=abs(p); return max(dot(p, normalize(vec2(1.0,1.732))), p.x); }
float pattern(vec2 p, int k){
  if(k==0){ float s=sin(p.y*3.4 + sin(p.x*0.6)*0.9); return mix(0.25, 1.0, smoothstep(-0.25,0.25,s))*0.85 + 0.15*vnoise(p*3.0); }
  if(k==1){ vec2 v=vor(p*1.3); return smoothstep(0.02,0.18, v.y-v.x)*0.7 + 0.3*(1.0-v.x); }
  if(k==2){ vec2 q=p*vec2(0.9,1.4); vec2 i=floor(q); vec2 f=fract(q); float t=step(f.x,f.y); return 0.35+0.65*hash21(i+t*7.1); }
  if(k==3){ float l=smoothstep(0.05,0.0,abs(fract(p.y*1.4)-0.5)-0.45); float m=smoothstep(0.06,0.0,abs(fract(p.x*0.25)-0.5)-0.47); return 1.0-0.35*l-0.5*m; }
  if(k==4){ vec2 q=p*vec2(2.6,2.2); float v=abs(fract(q.x)-0.5); float s=fract(q.y+v*1.3); return 0.35+0.65*smoothstep(0.05,0.3,s)*smoothstep(0.98,0.7,s); }
  if(k==5){ vec2 q=p*0.75; vec2 f=fract(q); float e=min(min(f.x,1.0-f.x),min(f.y,1.0-f.y)); return smoothstep(0.02,0.07,e)*(0.65+0.35*hash21(floor(q))); }
  if(k==6){ vec2 q=p*1.1; vec2 i=floor(q); vec2 f=fract(q)-0.5; float r=0.12+0.22*hash21(i); vec2 o=(vec2(hash21(i+3.0),hash21(i+7.0))-0.5)*0.4; return 1.0-0.65*smoothstep(r, r-0.05, length(f-o)); }
  if(k==7){ float n=fbm(p*0.5); return 0.5+0.5*sin(p.x*0.7+p.y*0.4+n*7.0); }
  if(k==8){ vec2 q=p*vec2(1.0,2.0); q.x+=step(1.0,mod(floor(q.y),2.0))*0.5; vec2 f=fract(q); float e=min(min(f.x,1.0-f.x)*2.0,min(f.y,1.0-f.y)); return smoothstep(0.03,0.12,e)*(0.7+0.3*hash21(floor(q))); }
  vec2 q=p*1.3; vec2 r=vec2(1.0,1.732); vec2 h=r*0.5; vec2 a=mod(q,r)-h; vec2 b=mod(q-h,r)-h; vec2 g=dot(a,a)<dot(b,b)?a:b;
  return smoothstep(0.42,0.36,hexd(g))*0.75+0.25;
}`;

export function platformMaterial(pal, terrain, kind = 0) {
  const m = toon(0xffffff);
  const u = {
    uBody: { value: new THREE.Color(pal.body) },
    uTop: { value: new THREE.Color(pal.top) },
    uEdge: { value: new THREE.Color(pal.edge) },
    uDark: { value: new THREE.Color(pal.fog).multiplyScalar(0.35) },
    uDrip: { value: terrain.drip },
    uPattern: { value: terrain.pattern },
    uKind: { value: kind },
    uTime: { value: 0 },
    uShake: { value: 0 },
  };
  m.userData.uniforms = u;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLP; varying vec3 vWP; varying vec3 vON;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n vLP = position; vON = normal; vWP = (modelMatrix * vec4(position,1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vLP; varying vec3 vWP; varying vec3 vON;
        uniform vec3 uBody, uTop, uEdge, uDark; uniform float uDrip, uTime, uShake; uniform int uPattern, uKind;
        ${PATTERN_GLSL}
        float dripDepth(){ float x=vWP.x;
          float d = 0.32 + uDrip*(0.12 + 0.1*sin(x*1.7) + 0.06*sin(x*4.3+vWP.z*2.0));
          d += uDrip*0.9*pow(max(0.0, sin(x*0.83)*sin(x*2.17+1.3)), 4.0);
          return d; }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec2 puv = abs(vON.y) > 0.5 ? vWP.xz : vWP.xy;
        float pat = pattern(puv, uPattern);
        vec3 body = uBody * mix(0.72, 1.1, pat);
        float d = dripDepth();
        float topMask = max(step(0.6, vON.y), step(-d, vLP.y));
        vec3 topc = uTop * mix(0.86, 1.12, vnoise(puv*2.5));
        vec3 col = mix(body, topc, topMask);
        if (uKind == 2) { // crumble: cracks
          vec2 v = vor(puv*1.6); col *= mix(0.45, 1.0, smoothstep(0.0, 0.06, v.y-v.x)); col = mix(col, col*vec3(1.0,0.8,0.7), 0.3); }
        col = mix(col, uDark, smoothstep(-1.2, -8.0, vLP.y) * 0.9);
        diffuseColor.rgb = col;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float seam = smoothstep(0.06, 0.0, abs(vLP.y + d)) * (1.0 - step(0.6, vON.y));
        totalEmissiveRadiance += uEdge * seam * 1.4;
        if (uKind == 3) { float under = smoothstep(-0.45, -0.7, vLP.y) * (0.6 + 0.4*sin(uTime*8.0)); totalEmissiveRadiance += uEdge * under * 1.2; }
        if (uKind == 2) totalEmissiveRadiance += vec3(1.0,0.4,0.2) * uShake * 0.8;`);
  };
  m.customProgramCacheKey = () => 'platform';
  return m;
}

// ---------------------------------------------------------------- sky dome
export function makeSky() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      uTop: { value: new THREE.Color('#05011a') }, uBottom: { value: new THREE.Color('#3a0a6e') },
      uBand: { value: new THREE.Color('#ff5ad2') }, uTime: { value: 0 }, uSwirl: { value: 1 },
    },
    vertexShader: /* glsl */ `varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
    fragmentShader: /* glsl */ `
      varying vec3 vDir; uniform vec3 uTop, uBottom, uBand; uniform float uTime, uSwirl;
      ${GLSL_NOISE}
      float hash31(vec3 p){ p=fract(p*0.3183099+0.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
      void main(){
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = mix(uBottom, uTop, smoothstep(-0.15, 0.65, h));
        vec2 sp = vec2(atan(d.x, -d.z)*1.6, h*3.0);
        float w = fbm(sp*1.3 + vec2(uTime*0.02, 0.0));
        float n = fbm(sp*2.0 + w*2.5 + vec2(0.0, uTime*0.015));
        float bands = smoothstep(0.55, 0.85, sin(n*9.0 + h*6.0 + uTime*0.1)*0.5+0.5);
        col = mix(col, uBand, bands * 0.22 * uSwirl * smoothstep(-0.1, 0.4, h));
        col += uBand * pow(max(0.0, 1.0 - abs(h - 0.02)*4.0), 3.0) * 0.18;
        // stars
        vec3 sd = d * 140.0; vec3 cell = floor(sd); vec3 f = fract(sd) - 0.5;
        float r = hash31(cell);
        if (r > 0.93) {
          vec3 o = vec3(hash31(cell+1.3), hash31(cell+4.1), hash31(cell+7.7)) - 0.5;
          float s = smoothstep(0.12, 0.0, length(f - o*0.6));
          float tw = 0.6 + 0.4*sin(uTime*(1.0+r*4.0) + r*50.0);
          col += vec3(1.0, 0.95, 0.9) * s * tw * smoothstep(0.0, 0.35, h) * 1.4;
        }
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(500, 48, 24), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return mesh;
}

// ---------------------------------------------------------------- celestial bodies
export function celestialMaterial(kind, a, b) {
  const kinds = { banded: 0, ringed: 0, cratered: 1, swirl: 2, eye: 3, clock: 4 };
  return new THREE.ShaderMaterial({
    fog: false, transparent: false,
    uniforms: { uA: { value: new THREE.Color(a) }, uB: { value: new THREE.Color(b) }, uKind: { value: kinds[kind] ?? 0 }, uTime: { value: 0 }, uLook: { value: new THREE.Vector2() } },
    vertexShader: /* glsl */ `varying vec3 vN; varying vec3 vP; varying vec3 vV;
      void main(){ vN = normalize(normalMatrix*normal); vP = position; vec4 mv = modelViewMatrix*vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: /* glsl */ `varying vec3 vN; varying vec3 vP; varying vec3 vV; uniform vec3 uA, uB; uniform int uKind; uniform float uTime; uniform vec2 uLook;
      ${GLSL_NOISE}
      void main(){
        vec3 p = normalize(vP);
        float lat = p.y; float lon = atan(p.x, p.z);
        vec3 col;
        if (uKind == 0) { float n = fbm(vec2(lon*2.0 + uTime*0.03, lat*4.0));
          float b = sin(lat*18.0 + n*4.0 + uTime*0.05); col = mix(uA, uB, smoothstep(-0.6, 0.6, b)); col = mix(col, uA*1.2, smoothstep(0.7, 0.9, n)); }
        else if (uKind == 1) { float n = fbm(vec2(lon*3.0, lat*3.0)*1.5); float cr = vnoise(vec2(lon, lat)*9.0);
          col = mix(uB, uA, n); col *= mix(0.7, 1.0, smoothstep(0.25, 0.3, abs(cr-0.5))); }
        else if (uKind == 2) { float n = fbm(vec2(lon*1.5 + lat*3.0 + uTime*0.04, lat*2.0)); col = mix(uA, uB, 0.5+0.5*sin(n*12.0 + lon*2.0 - uTime*0.2)); }
        else if (uKind == 3) { vec3 look = normalize(vec3(uLook.x, uLook.y, 1.0)); float c = dot(p, look);
          col = uA * (0.85 + 0.15*vnoise(vec2(lon, lat)*8.0));
          float veins = smoothstep(0.03, 0.0, abs(sin(lon*7.0 + vnoise(vec2(lon,lat)*6.0)*3.0)*0.5)) * smoothstep(0.85, 0.2, c);
          col = mix(col, vec3(0.8,0.1,0.15), veins*0.6);
          col = mix(col, uB, smoothstep(0.86, 0.88, c)); col = mix(col, uB*0.5, smoothstep(0.9, 0.95, c) * (0.5+0.5*sin(atan(p.y,p.x)*30.0)));
          col = mix(col, vec3(0.02), smoothstep(0.955, 0.965, c)); col = mix(col, vec3(1.0), smoothstep(0.985, 0.99, dot(p, normalize(look+vec3(0.12,0.12,0.0))))); }
        else { col = mix(uB, uA, 0.6); float r = length(p.xy); float ang = atan(p.y, p.x);
          float ticks = smoothstep(0.92, 0.98, cos(ang*12.0)) * smoothstep(0.75, 0.85, r) * step(0.0, p.z);
          col = mix(col, uB*0.3, ticks);
          float hA = mod(-uTime*0.3, 6.2831); float mA = mod(-uTime*3.6, 6.2831);
          float hand1 = smoothstep(0.06, 0.0, abs(sin(ang - hA - 1.5708)) * r) * step(r, 0.5) * step(0.0, cos(ang-hA-1.5708)) * step(0.0,p.z);
          float hand2 = smoothstep(0.04, 0.0, abs(sin(ang - mA - 1.5708)) * r) * step(r, 0.75) * step(0.0, cos(ang-mA-1.5708)) * step(0.0,p.z);
          col = mix(col, vec3(0.05), max(hand1, hand2)); }
        float lit = clamp(dot(vN, normalize(vec3(-0.5, 0.6, 0.7))) * 0.8 + 0.35, 0.12, 1.1);
        col *= lit;
        float rim = pow(1.0 - max(0.0, dot(vN, vV)), 3.0);
        col += uA * rim * 0.9;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}
export function ringMaterial(a, b) {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide, transparent: true, depthWrite: false, fog: false,
    uniforms: { uA: { value: new THREE.Color(a) }, uB: { value: new THREE.Color(b) } },
    vertexShader: `varying vec2 vUv; varying vec3 vP; void main(){ vUv=uv; vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `varying vec3 vP; uniform vec3 uA, uB; ${GLSL_NOISE}
      void main(){ float r = length(vP.xy); float t = (r - 1.35)/(2.3-1.35);
        float bands = 0.5+0.5*sin(t*60.0) * vnoise(vec2(t*30.0, 0.5));
        float a = smoothstep(0.0, 0.05, t) * smoothstep(1.0, 0.9, t) * (0.35 + 0.5*bands);
        gl_FragColor = vec4(mix(uA, uB, t)*0.75, a*0.8); }`,
  });
}

// ---------------------------------------------------------------- hazard sea
export function seaMaterial(color, fogColor) {
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    uColor: { value: new THREE.Color(color) }, uDeep: { value: new THREE.Color(fogColor) }, uTime: { value: 0 },
  }]);
  return new THREE.ShaderMaterial({
    fog: true, uniforms,
    vertexShader: /* glsl */ `
      #include <fog_pars_vertex>
      uniform float uTime; varying vec3 vW; varying float vWave;
      void main(){
        vec3 p = position;
        vec4 w = modelMatrix * vec4(p, 1.0);
        float wave = sin(w.x*0.55 + uTime*1.6)*0.14 + sin(w.z*0.9 + w.x*0.2 + uTime*1.1)*0.1 + sin(w.x*1.7 - uTime*2.3)*0.05;
        w.y += wave; vWave = wave; vW = w.xyz;
        vec4 mvPosition = viewMatrix * w;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <fog_pars_fragment>
      uniform vec3 uColor, uDeep; uniform float uTime; varying vec3 vW; varying float vWave;
      ${GLSL_NOISE}
      void main(){
        vec2 p = vW.xz;
        float n = fbm(p*0.35 + vec2(uTime*0.12, uTime*0.05));
        float caust = smoothstep(0.45, 0.75, fbm(p*0.9 - vec2(uTime*0.2, 0.0) + n*1.5));
        vec3 col = mix(uDeep*0.6, uColor, 0.55 + 0.45*n);
        col += uColor * caust * 0.45;
        col += vec3(1.0) * smoothstep(0.14, 0.26, vWave) * 0.22;
        // rising bubbles
        vec2 g = p*vec2(0.8, 1.2); vec2 id = floor(g); vec2 f = fract(g)-0.5;
        float h = hash21(id); float ph = fract(uTime*0.4 + h);
        float b = smoothstep(0.12, 0.08, abs(length(f - vec2(h-0.5, 0.0)*0.6) - ph*0.3)) * step(0.82, h) * (1.0-ph);
        col += uColor * b * 1.2;
        col *= 0.72;
        gl_FragColor = vec4(col, 1.0);
        #include <fog_fragment>
      }`,
  });
}

// ---------------------------------------------------------------- additive FX
export function beamMaterial(color, strength = 1) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    uniforms: { uColor: { value: new THREE.Color(color) }, uTime: { value: 0 }, uStrength: { value: strength } },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `varying vec2 vUv; uniform vec3 uColor; uniform float uTime, uStrength; ${GLSL_NOISE}
      void main(){ float edge = pow(sin(vUv.x*3.14159), 2.0);
        float n = 0.6 + 0.4*vnoise(vec2(vUv.x*6.0, vUv.y*8.0 - uTime*2.0));
        float a = edge * pow(1.0 - vUv.y, 1.6) * n * uStrength;
        gl_FragColor = vec4(uColor * a, a); }`,
  });
}
export function geyserMaterial(color) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    uniforms: { uColor: { value: new THREE.Color(color) }, uTime: { value: 0 }, uOn: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `varying vec2 vUv; uniform vec3 uColor; uniform float uTime, uOn; ${GLSL_NOISE}
      void main(){ float edge = pow(sin(vUv.x*3.14159), 1.5);
        float n = fbm(vec2(vUv.x*5.0, vUv.y*4.0 - uTime*5.0));
        float a = edge * smoothstep(0.2, 0.8, n + 0.3) * smoothstep(1.0, 0.75, vUv.y) * uOn;
        vec3 c = mix(uColor, vec3(1.0), smoothstep(0.6, 0.9, n));
        gl_FragColor = vec4(c * a * 1.6, a); }`,
  });
}
export function portalMaterial(a, b) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
    uniforms: { uA: { value: new THREE.Color(a) }, uB: { value: new THREE.Color(b) }, uTime: { value: 0 }, uActive: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `varying vec2 vUv; uniform vec3 uA, uB; uniform float uTime, uActive; ${GLSL_NOISE}
      void main(){ vec2 c = vUv - 0.5; float r = length(c)*2.0; float a = atan(c.y, c.x);
        float sp = uTime * mix(0.6, 3.0, uActive);
        float s = sin(a*3.0 + log(r+0.02)*7.0 - sp*3.0);
        float n = fbm(vec2(a*2.0, r*3.0 - sp));
        vec3 col = mix(uA, uB, 0.5+0.5*s);
        col = mix(col, vec3(1.0), smoothstep(0.35, 0.0, r) * (0.4+0.6*uActive));
        col += n * 0.3;
        float grey = dot(col, vec3(0.33));
        col = mix(vec3(grey)*vec3(0.5,0.55,0.7), col, 0.25 + 0.75*uActive);
        float alpha = smoothstep(1.0, 0.86, r) * mix(0.55, 1.0, uActive);
        gl_FragColor = vec4(col * mix(0.7, 2.2, uActive), alpha); }`,
  });
}
export function tunnelMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uTime: { value: 0 }, uSpeed: { value: 1 }, uA: { value: new THREE.Color('#ff2aa8') }, uB: { value: new THREE.Color('#2affe0') }, uC: { value: new THREE.Color('#7a2aff') } },
    vertexShader: `varying vec2 vUv; varying float vZ; void main(){ vUv=uv; vec4 mv = modelViewMatrix*vec4(position,1.0); vZ = -mv.z; gl_Position=projectionMatrix*mv; }`,
    fragmentShader: /* glsl */ `varying vec2 vUv; varying float vZ; uniform float uTime, uSpeed; uniform vec3 uA, uB, uC; ${GLSL_NOISE}
      void main(){ float ang = vUv.x * 6.28318; float z = vUv.y * 40.0;
        float t = uTime * uSpeed;
        float spiral = sin(ang*4.0 + z*1.2 - t*6.0);
        float rings = sin(z*3.0 + t*14.0);
        float n = fbm(vec2(cos(ang)*1.6 + z*0.8 + t*3.0, sin(ang)*1.6 + z*0.25));
        vec3 col = mix(uA, uB, 0.5+0.5*spiral);
        col = mix(col, uC, smoothstep(0.3, 0.9, n));
        float lanes = smoothstep(0.55, 0.95, sin(ang*8.0 - z*0.6 + t*2.0)*0.5+0.5);
        col *= 0.08 + 0.75*smoothstep(0.35, 1.0, rings*0.5+0.5 + n*0.3) + lanes*0.35;
        col += uB * smoothstep(0.96, 1.0, rings) * 0.5;
        float fade = smoothstep(150.0, 6.0, vZ);
        gl_FragColor = vec4(col * fade * 0.85 + vec3(1.0,0.85,1.0)*smoothstep(90.0, 160.0, vZ)*0.9, 1.0); }`,
  });
}

// ---------------------------------------------------------------- particles
export class Particles {
  constructor(max = 1500, additive = true) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.size0 = new Float32Array(max);
    this.cursor = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo = g;
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, fog: false,
      uniforms: { uScale: { value: 600 } },
      vertexShader: /* glsl */ `attribute float size; attribute float alpha; attribute vec3 color; varying vec3 vC; varying float vA; uniform float uScale;
        void main(){ vC = color; vA = alpha; vec4 mv = modelViewMatrix*vec4(position,1.0); gl_PointSize = size * uScale / -mv.z; gl_Position = projectionMatrix*mv; }`,
      fragmentShader: additive
        ? `varying vec3 vC; varying float vA; void main(){ vec2 c = gl_PointCoord-0.5; float d = length(c); float a = smoothstep(0.5, 0.0, d); a = a*a + smoothstep(0.12,0.0,d); gl_FragColor = vec4(vC*a*vA*1.6, a*vA); }`
        : `varying vec3 vC; varying float vA; void main(){ vec2 c = gl_PointCoord-0.5; float d = length(c); float a = smoothstep(0.5, 0.35, d); gl_FragColor = vec4(vC, a*vA); }`,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    this.material = mat;
  }
  emit(x, y, z, o = {}) {
    const i = this.cursor; this.cursor = (this.cursor + 1) % this.max;
    const sp = o.speed ?? 4, a = Math.random() * Math.PI * 2, b = Math.acos(Math.random() * 2 - 1);
    const dir = o.dir;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    if (dir) {
      this.vel[i * 3] = dir[0] + (Math.random() - 0.5) * (o.spread ?? 1);
      this.vel[i * 3 + 1] = dir[1] + (Math.random() - 0.5) * (o.spread ?? 1);
      this.vel[i * 3 + 2] = (dir[2] || 0) + (Math.random() - 0.5) * (o.spread ?? 1);
    } else {
      const s = sp * (0.4 + Math.random() * 0.6);
      this.vel[i * 3] = Math.sin(b) * Math.cos(a) * s;
      this.vel[i * 3 + 1] = Math.sin(b) * Math.sin(a) * s;
      this.vel[i * 3 + 2] = Math.cos(b) * s * (o.flatZ ?? 0.5);
    }
    const c = o.color || [1, 1, 1];
    this.col[i * 3] = c[0]; this.col[i * 3 + 1] = c[1]; this.col[i * 3 + 2] = c[2];
    this.size0[i] = (o.size ?? 0.35) * (0.6 + Math.random() * 0.8);
    this.life[i] = this.maxLife[i] = (o.life ?? 0.8) * (0.6 + Math.random() * 0.6);
    this.grav[i] = o.gravity ?? 6;
    this.drag[i] = o.drag ?? 1.5;
  }
  burst(x, y, z, n, o) { for (let k = 0; k < n; k++) this.emit(x, y, z, o); }
  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      this.life[i] -= dt;
      const t = Math.max(0, this.life[i] / this.maxLife[i]);
      const dr = Math.exp(-this.drag[i] * dt);
      this.vel[i * 3] *= dr; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * dr - this.grav[i] * dt; this.vel[i * 3 + 2] *= dr;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.alpha[i] = Math.min(1, t * 2.5);
      this.size[i] = this.size0[i] * (0.4 + 0.6 * t);
    }
    const a = this.geo.attributes;
    a.position.needsUpdate = a.color.needsUpdate = a.size.needsUpdate = a.alpha.needsUpdate = true;
  }
  clear() { this.life.fill(0); this.alpha.fill(0); }
}

// ambient drifting motes that wrap around the camera (zero CPU cost)
export function ambientParticles(count = 500) {
  const g = new THREE.BufferGeometry();
  const p = new Float32Array(count * 3), s = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    p[i * 3] = Math.random() * 80; p[i * 3 + 1] = Math.random() * 40; p[i * 3 + 2] = Math.random() * 40;
    s[i] = Math.random();
  }
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  g.setAttribute('seed', new THREE.BufferAttribute(s, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { uCam: { value: new THREE.Vector3() }, uTime: { value: 0 }, uColor: { value: new THREE.Color('#ffffff') }, uMotion: { value: 0 }, uScale: { value: 600 } },
    vertexShader: /* glsl */ `attribute float seed; uniform vec3 uCam; uniform float uTime, uMotion, uScale; varying float vA;
      void main(){
        vec3 box = vec3(80.0, 40.0, 40.0);
        vec3 drift = vec3(sin(uTime*0.3+seed*20.0)*1.5, 0.0, cos(uTime*0.2+seed*11.0));
        if (uMotion < 0.5) drift.y += uTime*(0.6+seed*0.8);
        else if (uMotion < 1.5) drift.y -= uTime*(0.5+seed*0.7);
        else if (uMotion < 2.5) drift += vec3(sin(uTime*0.5+seed*7.0), cos(uTime*0.4+seed*5.0), 0.0)*2.0;
        else drift.x += uTime*(1.0+seed*2.0);
        vec3 origin = uCam - vec3(40.0, 20.0, 34.0);
        vec3 pos = mod(position + drift - origin, box) + origin;
        vec4 mv = modelViewMatrix * vec4(pos, 1.0);
        float tw = uMotion > 2.5 ? step(0.5, fract(uTime*2.0 + seed*13.0)) : 1.0;
        vA = (0.35 + 0.65*fract(seed*91.0)) * tw;
        gl_PointSize = (0.12 + seed*0.22) * uScale / -mv.z;
        gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uColor; varying float vA; void main(){ float d = length(gl_PointCoord-0.5); float a = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(uColor*a*a*vA, a*vA); }`,
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  return pts;
}

// ---------------------------------------------------------------- post FX
const FinalShader = {
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) },
    uVignette: { value: 0.9 }, uAberration: { value: 0.0025 }, uFlash: { value: 0 }, uFlashColor: { value: new THREE.Color(1, 1, 1) },
    uFade: { value: 0 }, uWarp: { value: 0 }, uSat: { value: 1.12 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `varying vec2 vUv; uniform sampler2D tDiffuse; uniform float uTime, uVignette, uAberration, uFlash, uFade, uWarp, uSat; uniform vec2 uRes; uniform vec3 uFlashColor;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
    void main(){
      vec2 c = vUv - 0.5; float r = length(c * vec2(uRes.x/uRes.y, 1.0));
      float a = uWarp * 7.0 * (1.0 - smoothstep(0.0, 0.8, r));
      c = mat2(cos(a), -sin(a), sin(a), cos(a)) * c * (1.0 - uWarp*0.35*(1.0-r));
      vec2 uv = c + 0.5;
      float ca = uAberration * (0.3 + r*2.0) + uWarp*0.02;
      vec3 col;
      col.r = texture2D(tDiffuse, uv + c*ca).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - c*ca).b;
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(l), col, uSat);
      col = (col - 0.5) * 1.07 + 0.5;
      col *= 0.97 + 0.03*sin(vUv.y*uRes.y*1.2 + uTime*30.0);
      col += (h(vUv*uRes + fract(uTime)*100.0) - 0.5) * 0.04;
      col *= mix(1.0, smoothstep(1.05, 0.25, r), uVignette);
      col = mix(col, uFlashColor, uFlash);
      col = mix(col, vec3(0.02, 0.0, 0.05), uFade);
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  // cap total rendered pixels (~2.3 MP) so big/HiDPI party screens stay smooth
  let qualityScale = 1;
  const pixelRatio = () => Math.max(0.5, Math.min(window.devicePixelRatio || 1, 1.5, Math.sqrt(2.3e6 / (window.innerWidth * window.innerHeight))) * qualityScale);
  renderer.setPixelRatio(pixelRatio());
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 1200);

  const size = new THREE.Vector2();
  renderer.getDrawingBufferSize(size);
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.55, 0.45, 0.92);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const final = new ShaderPass(FinalShader);
  composer.addPass(final);
  final.uniforms.uRes.value.copy(size);

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setPixelRatio(pixelRatio());
    composer.setPixelRatio(pixelRatio());
    renderer.setSize(w, h);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.getDrawingBufferSize(size);
    final.uniforms.uRes.value.copy(size);
  }
  window.addEventListener('resize', resize);
  // adaptive quality: if real frames are consistently slow, render fewer pixels
  let acc = 0, n = 0;
  function adapt(dt) {
    if (dt > 0.1 || dt <= 0) return; // throttled/background frames are not a signal
    acc += dt; n++;
    if (acc < 2) return;
    const avg = acc / n; acc = 0; n = 0;
    if (avg > 0.024 && qualityScale > 0.55) { qualityScale *= 0.85; resize(); }
  }
  return { renderer, scene, camera, composer, bloom, final, resize, adapt };
}

// ---------------------------------------------------------------- canvas textures
export function coinTexture(mega = false) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(100, 90, 10, 128, 128, 130);
  if (mega) { grd.addColorStop(0, '#ffffff'); grd.addColorStop(0.4, '#ff9af0'); grd.addColorStop(1, '#5a2aff'); }
  else { grd.addColorStop(0, '#fff6b0'); grd.addColorStop(0.5, '#ffc21a'); grd.addColorStop(1, '#c46a00'); }
  g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = mega ? 'rgba(255,255,255,0.8)' : 'rgba(120,50,0,0.6)'; g.lineWidth = 10;
  g.beginPath(); g.arc(128, 128, 104, 0, Math.PI * 2); g.stroke();
  g.setLineDash([6, 10]); g.lineWidth = 4; g.beginPath(); g.arc(128, 128, 90, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
  g.font = '900 86px "Bungee", "Arial Black", Impact, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = mega ? 'rgba(60,0,90,0.6)' : 'rgba(110,40,0,0.65)'; g.fillText('P13', 132, 136);
  g.fillStyle = mega ? '#ffffff' : '#fff8d0'; g.fillText('P13', 126, 130);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

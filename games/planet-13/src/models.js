// Procedural models: player characters, predators, props, artifacts, coins, portal.
import { THREE, toon, glow, addOutline, coinTexture, portalMaterial, beamMaterial } from './gfx.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

const SPH = new THREE.SphereGeometry(1, 20, 14);
const SPH_LO = new THREE.SphereGeometry(1, 12, 8);
const MAT = {
  white: toon('#ffffff'),
  black: new THREE.MeshBasicMaterial({ color: '#0a0612' }),
  shine: new THREE.MeshBasicMaterial({ color: '#ffffff' }),
  tooth: toon('#fffaf0'),
  dark: toon('#1a1024'),
};

function mesh(geo, mat, x = 0, y = 0, z = 0, s = 1) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  if (typeof s === 'number') m.scale.setScalar(s); else m.scale.set(s[0], s[1], s[2]);
  m.castShadow = true;
  return m;
}
function outlined(m, worldThick = 0.03) {
  const s = Math.max(m.scale.x, m.scale.y, m.scale.z);
  addOutline(m, worldThick / s);
  return m;
}
function lumpy(radius, detail, amount, seed = 1, flat = true) {
  let g = new THREE.IcosahedronGeometry(radius, detail);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = Math.sin(v.x * 5.1 + seed) * Math.sin(v.y * 4.3 + seed * 2) * Math.sin(v.z * 6.7 + seed * 3);
    v.multiplyScalar(1 + n * amount);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  if (flat) { g = g.toNonIndexed(); }
  g.computeVertexNormals();
  return g;
}
function fuzzy(radius, amount) {
  const g = new THREE.IcosahedronGeometry(radius, 4);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  const seen = new Map();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const k = v.x.toFixed(3) + v.y.toFixed(3) + v.z.toFixed(3);
    if (!seen.has(k)) seen.set(k, 1 + (Math.random() - 0.3) * amount);
    v.multiplyScalar(seen.get(k));
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------- eyes
export function makeEye(r, { pupil = 0.55, iris = null, lid = null } = {}) {
  const g = new THREE.Group();
  const w = outlined(mesh(SPH, MAT.white, 0, 0, 0, r), 0.022);
  g.add(w);
  let p;
  if (iris) {
    p = new THREE.Group();
    p.add(mesh(SPH_LO, toon(iris), 0, 0, 0, [r * 0.62, r * 0.62, r * 0.3]));
    p.add(mesh(SPH_LO, MAT.black, 0, 0, r * 0.12, [r * 0.32, r * 0.32, r * 0.2]));
    p.position.z = r * 0.78;
  } else {
    p = mesh(SPH_LO, MAT.black, 0, 0, r * 0.6, r * pupil);
  }
  g.add(p);
  const sh = mesh(SPH_LO, MAT.shine, r * 0.25, r * 0.3, r * 0.92, r * 0.17);
  g.add(sh);
  let lidMesh = null;
  if (lid) {
    lidMesh = mesh(new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), toon(lid), 0, 0, 0, r * 1.06);
    lidMesh.rotation.x = -1.2;
    g.add(lidMesh);
  }
  g.userData = { pupil: p, r, base: p.position.z, lid: lidMesh, blink: Math.random() * 4 };
  return g;
}
export function lookEye(eye, lx, ly) {
  const { pupil, r } = eye.userData;
  pupil.position.x = lx * r * 0.32;
  pupil.position.y = ly * r * 0.32;
}
function blinkEyes(eyes, dt) {
  for (const e of eyes) {
    const u = e.userData;
    u.blink -= dt;
    const closed = u.blink < 0.12 && u.blink > 0;
    e.scale.y = closed ? 0.12 : 1;
    if (u.blink <= 0) u.blink = 2 + Math.random() * 4;
  }
}
function brow(len, thick, color = '#1a1024') {
  return mesh(new RoundedBoxGeometry(len, thick, thick, 2, thick * 0.4), toon(color));
}
function teethRow(n, w, h, mat = MAT.tooth) {
  const g = new THREE.Group();
  const cone = new THREE.ConeGeometry(w / n / 2, h, 4);
  for (let i = 0; i < n; i++) {
    const t = mesh(cone, mat, -w / 2 + (i + 0.5) * (w / n), 0, 0);
    t.rotation.x = Math.PI;
    g.add(t);
  }
  return g;
}

// ================================================================ CHARACTERS
// Each returns { root, body, update(dt, s) } — root at the feet, facing +z (camera)
class Character {
  constructor() {
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);
    this.eyes = [];
    this.squash = 0; this.squashV = 0;
    this.t = Math.random() * 10;
    this.turn = 0;
    this.sparkTimer = 0;
  }
  // spring-based squash & stretch shared by everyone
  baseUpdate(dt, s) {
    this.t += dt;
    if (s.landed) this.squashV -= Math.min(6, s.landed * 0.35);
    const target = s.grounded ? 0 : Math.max(-0.12, Math.min(0.18, s.vy * 0.012));
    this.squashV += ((target - this.squash) * 180 - this.squashV * 14) * dt;
    this.squash += this.squashV * dt;
    const q = Math.max(-0.35, Math.min(0.35, this.squash));
    this.body.scale.set(1 - q * 0.6, 1 + q, 1 - q * 0.6);
    const want = (s.facing || 1) * 0.55;
    this.turn += (want - this.turn) * Math.min(1, dt * 12);
    this.root.rotation.y = this.turn;
    blinkEyes(this.eyes, dt);
    const lx = (s.facing || 1) * 0.6 * (s.run || 0.3), ly = s.grounded ? 0 : Math.max(-0.7, Math.min(0.7, s.vy * 0.04));
    for (const e of this.eyes) lookEye(e, lx, ly);
  }
}

class Pebblord extends Character {
  constructor() {
    super();
    const rockMat = toon('#8d7fae', { flatShading: true });
    const rock = outlined(mesh(lumpy(0.52, 1, 0.16, 3), rockMat, 0, 0.66, 0, [1.05, 0.95, 0.9]), 0.035);
    this.body.add(rock);
    const crystalMat = toon('#7affff', { emissive: '#2ad2ff', emissiveIntensity: 1.2, flatShading: true });
    const cg = new THREE.OctahedronGeometry(0.1, 0);
    [[-0.18, 1.12, -0.05, 0.3, 1.9], [0.0, 1.17, -0.12, -0.1, 2.4], [0.16, 1.1, -0.02, -0.35, 1.6]].forEach(([x, y, z, rz, sy]) => {
      const c = mesh(cg, crystalMat, x, y, z, [1, sy, 1]); c.rotation.z = rz; this.body.add(c);
    });
    const moss = mesh(lumpy(0.2, 1, 0.3, 7), toon('#5ad26a', { flatShading: true }), 0.28, 0.98, 0.12, [1, 0.4, 1]);
    this.body.add(moss);
    this.eyeL = makeEye(0.15); this.eyeL.position.set(-0.17, 0.74, 0.42);
    this.eyeR = makeEye(0.17); this.eyeR.position.set(0.18, 0.76, 0.41);
    this.eyes.push(this.eyeL, this.eyeR);
    this.body.add(this.eyeL, this.eyeR);
    this.browL = brow(0.22, 0.06); this.browL.position.set(-0.17, 0.95, 0.47);
    this.browR = brow(0.24, 0.06); this.browR.position.set(0.19, 0.98, 0.46);
    this.body.add(this.browL, this.browR);
    this.mouth = mesh(SPH_LO, MAT.black, 0, 0.52, 0.47, [0.09, 0.03, 0.03]);
    this.body.add(this.mouth);
    const legGeo = new THREE.CapsuleGeometry(0.055, 0.14, 4, 8);
    const legMat = toon('#5a4a7a');
    this.legs = [-0.16, 0.16].map((x) => { const l = outlined(mesh(legGeo, legMat, x, 0.13, 0.05), 0.02); this.root.add(l); return l; });
    this.mood = 0; this.moodT = 0;
  }
  update(dt, s) {
    this.baseUpdate(dt, s);
    const run = s.run || 0;
    const ph = this.t * 22;
    this.legs.forEach((l, i) => {
      const k = Math.sin(ph + i * Math.PI);
      l.position.y = 0.13 + (s.grounded ? Math.max(0, k) * 0.09 * run : -0.03);
      l.position.z = 0.05 + (s.grounded ? Math.cos(ph + i * Math.PI) * 0.1 * run : 0);
    });
    this.body.position.y = s.grounded ? Math.abs(Math.sin(ph)) * 0.04 * run : 0;
    // emotional instability: brows randomly flip between rage and despair
    this.moodT -= dt;
    if (this.moodT <= 0) { this.mood = [0.45, -0.45, 0.1, 0.6][Math.floor(Math.random() * 4)]; this.moodT = 0.8 + Math.random() * 2.5; }
    const m = s.grounded ? this.mood : -0.5;
    this.browL.rotation.z += (-m - this.browL.rotation.z) * Math.min(1, dt * 10);
    this.browR.rotation.z += (m - this.browR.rotation.z) * Math.min(1, dt * 10);
    this.mouth.scale.y = s.grounded ? 0.03 : 0.08;
  }
}

class Blib extends Character {
  constructor() {
    super();
    const shell = mesh(SPH, toon('#5affd2', { transparent: true, opacity: 0.5, emissive: '#1a8a7a', emissiveIntensity: 0.6, depthWrite: false }), 0, 0.52, 0, 0.5);
    shell.castShadow = true;
    shell.renderOrder = 2;
    addOutline(shell, 0.05);
    this.body.add(shell);
    this.nucleus = mesh(SPH, toon('#ff4fb4', { emissive: '#ff2a8a', emissiveIntensity: 0.6 }), 0.08, 0.48, -0.08, 0.19);
    this.nucleus.add(mesh(SPH_LO, toon('#7a1a5a'), 0.3, 0.3, 0.5, 0.35));
    this.body.add(this.nucleus);
    this.orgs = [];
    const om = [toon('#ffe85a', { emissive: '#ffcf2a', emissiveIntensity: 0.5 }), toon('#8a5aff'), toon('#5ab4ff')];
    for (let i = 0; i < 5; i++) {
      const o = mesh(SPH_LO, om[i % 3], 0, 0.5, 0, 0.05 + Math.random() * 0.04);
      o.userData = { a: Math.random() * 6, r: 0.22 + Math.random() * 0.12, s: 0.6 + Math.random() };
      this.orgs.push(o); this.body.add(o);
    }
    this.cilia = [];
    const cg = new THREE.ConeGeometry(0.02, 0.14, 4);
    const cm = toon('#8affe0');
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const c = mesh(cg, cm);
      c.userData.a = a;
      this.cilia.push(c); this.body.add(c);
    }
    const eL = makeEye(0.12); eL.position.set(-0.15, 0.65, 0.42);
    const eR = makeEye(0.12); eR.position.set(0.15, 0.65, 0.42);
    this.eyes.push(eL, eR); this.body.add(eL, eR);
    this.browL = brow(0.14, 0.035); this.browL.position.set(-0.15, 0.8, 0.45); this.browL.rotation.z = -0.4;
    this.browR = brow(0.14, 0.035); this.browR.position.set(0.15, 0.8, 0.45); this.browR.rotation.z = 0.4;
    this.body.add(this.browL, this.browR);
    this.mouth = mesh(new THREE.TorusGeometry(0.06, 0.015, 6, 12, Math.PI), MAT.black, 0, 0.47, 0.48);
    this.mouth.rotation.z = Math.PI;
    this.body.add(this.mouth);
  }
  update(dt, s) {
    this.baseUpdate(dt, s);
    // blobby wobble on top of the shared squash
    const w = Math.sin(this.t * 7) * 0.04;
    this.body.scale.x *= 1 + w; this.body.scale.y *= 1 - w;
    for (const o of this.orgs) {
      const u = o.userData; u.a += dt * u.s;
      o.position.set(Math.cos(u.a) * u.r, 0.52 + Math.sin(u.a * 1.3) * 0.18, Math.sin(u.a) * u.r * 0.6);
    }
    this.cilia.forEach((c, i) => {
      const a = c.userData.a + Math.sin(this.t * 8 + i) * 0.08;
      c.position.set(Math.cos(a) * 0.52, 0.52 + Math.sin(a) * 0.52, -0.05);
      c.rotation.z = a - Math.PI / 2 + Math.sin(this.t * 12 + i * 1.7) * 0.4;
      c.visible = Math.sin(a) > -0.6;
    });
    this.nucleus.position.x = 0.08 + Math.sin(this.t * 2) * 0.04;
    this.mouth.scale.y = s.grounded ? 1 : -1;
  }
}

class Zzzorp extends Character {
  constructor() {
    super();
    this.u = { uTime: { value: 0 }, uAmp: { value: 0.1 }, uLean: { value: 0 } };
    const bend = (m) => {
      m.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, this.u);
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime, uAmp, uLean;')
          .replace('#include <begin_vertex>', `#include <begin_vertex>
            float hh = clamp((transformed.y + 0.0) / 1.15, 0.0, 1.0);
            transformed.x += sin(transformed.y*4.0 - uTime*7.0) * uAmp * hh + uLean * hh * hh;`);
      };
      m.customProgramCacheKey = () => 'zzzorp' + m.type;
      return m;
    };
    const geo = new THREE.CapsuleGeometry(0.19, 0.78, 8, 14);
    geo.translate(0, 0.58, 0);
    const mat = bend(toon('#ffd84a', { emissive: '#ff9a00', emissiveIntensity: 0.18 }));
    const noodle = mesh(geo, mat);
    const om = bend(new THREE.MeshBasicMaterial({ color: '#0b0614', side: THREE.BackSide }));
    om.onBeforeCompile = ((orig) => (sh) => { orig(sh); sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n transformed += normal*0.035;'); })(om.onBeforeCompile);
    om.customProgramCacheKey = () => 'zzzorp-outline';
    noodle.add(new THREE.Mesh(geo, om));
    this.body.add(noodle);
    // ridges to read as pasta
    const ring = new THREE.TorusGeometry(0.195, 0.018, 6, 18);
    this.rings = [];
    for (let i = 0; i < 4; i++) {
      const r = mesh(ring, toon('#ffcf2a'), 0, 0.3 + i * 0.16, 0); r.rotation.x = Math.PI / 2;
      this.rings.push(r); this.body.add(r);
    }
    this.head = new THREE.Group();
    this.body.add(this.head);
    const eL = makeEye(0.1); eL.position.set(-0.09, 0, 0.16);
    const eR = makeEye(0.11); eR.position.set(0.1, 0.02, 0.15);
    this.eyes.push(eL, eR); this.head.add(eL, eR);
    this.mouth = mesh(SPH_LO, MAT.black, 0, -0.14, 0.18, [0.06, 0.025, 0.02]);
    this.head.add(this.mouth);
    this.sparks = [];
    const sm = glow('#7affff', 3);
    const sg = new THREE.OctahedronGeometry(0.045, 0);
    for (let i = 0; i < 3; i++) { const sp = new THREE.Mesh(sg, sm); this.sparks.push(sp); this.head.add(sp); }
  }
  offsetAt(y) { const hh = Math.min(1, Math.max(0, y / 1.15)); return Math.sin(y * 4 - this.u.uTime.value * 7) * this.u.uAmp.value * hh + this.u.uLean.value * hh * hh; }
  update(dt, s) {
    this.baseUpdate(dt, s);
    this.u.uTime.value = this.t;
    this.u.uAmp.value = 0.06 + (s.run || 0) * 0.08 + (s.grounded ? 0 : 0.05);
    this.u.uLean.value += ((-(s.vx || 0) * 0.025) - this.u.uLean.value) * Math.min(1, dt * 8);
    const hy = 0.98;
    this.head.position.set(this.offsetAt(hy), hy, 0);
    this.rings.forEach((r) => { r.position.x = this.offsetAt(r.position.y); });
    this.sparks.forEach((sp, i) => {
      const a = this.t * 6 + (i * Math.PI * 2) / 3;
      sp.position.set(Math.cos(a) * 0.26, 0.2 + Math.sin(a * 2) * 0.05, Math.sin(a) * 0.26);
      sp.visible = Math.random() > 0.15;
    });
    this.mouth.scale.y = s.grounded ? 0.025 : 0.06;
  }
}

function wingTexture(c1, c2) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 128, 128);
  grd.addColorStop(0, c1); grd.addColorStop(1, c2);
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#2a0a4a'; g.beginPath(); g.arc(78, 58, 26, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#ffe85a'; g.beginPath(); g.arc(78, 58, 18, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#1a0624'; g.beginPath(); g.arc(80, 56, 9, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#ffffff'; g.beginPath(); g.arc(84, 52, 3, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(40,10,60,0.5)'; g.lineWidth = 3;
  for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(0, 0); g.lineTo(128, 20 + i * 26); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

class Mothilda extends Character {
  constructor() {
    super();
    const fur = toon('#d2a8ff');
    const torso = outlined(mesh(fuzzy(0.36, 0.22), fur, 0, 0.55, 0, [1, 1.12, 0.95]), 0.03);
    this.body.add(torso);
    const collar = mesh(fuzzy(0.2, 0.35), toon('#ffffff'), 0, 0.72, 0.12, [1.6, 0.6, 1.2]);
    this.body.add(collar);
    const eL = makeEye(0.16, { pupil: 0.8 }); eL.position.set(-0.17, 0.66, 0.28);
    const eR = makeEye(0.16, { pupil: 0.8 }); eR.position.set(0.17, 0.66, 0.28);
    this.eyes.push(eL, eR); this.body.add(eL, eR);
    // feathery antennae
    this.antennae = [-1, 1].map((sd) => {
      const g = new THREE.Group();
      const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(sd * 0.1, 0.3, 0.1), new THREE.Vector3(sd * 0.28, 0.42, 0));
      g.add(mesh(new THREE.TubeGeometry(curve, 10, 0.018, 5), toon('#5a3a7a')));
      const fm = toon('#b48aff');
      for (let i = 2; i < 9; i++) {
        const p = curve.getPoint(i / 9);
        const f = mesh(new THREE.ConeGeometry(0.025, 0.16, 4), fm, p.x, p.y, p.z);
        f.rotation.z = sd * 1.2; g.add(f);
        const f2 = mesh(new THREE.ConeGeometry(0.025, 0.16, 4), fm, p.x, p.y, p.z);
        f2.rotation.z = -sd * 0.3; g.add(f2);
      }
      g.position.set(sd * 0.1, 0.92, 0.12);
      this.body.add(g);
      return g;
    });
    const wtex = wingTexture('#ffb4f0', '#8a5aff');
    const wmat = new THREE.MeshToonMaterial({ map: wtex, side: THREE.DoubleSide, gradientMap: toon('#fff').gradientMap, emissive: '#3a1a5a', emissiveIntensity: 0.4 });
    const shape = new THREE.Shape();
    shape.moveTo(0, 0); shape.bezierCurveTo(0.2, 0.5, 0.7, 0.55, 0.75, 0.25); shape.bezierCurveTo(0.8, 0.0, 0.5, -0.35, 0, -0.1);
    const wg = new THREE.ShapeGeometry(shape, 12);
    // normalise uvs to the shape bounds
    wg.computeBoundingBox();
    const bb = wg.boundingBox, uv = wg.attributes.uv, pos = wg.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (pos.getX(i) - bb.min.x) / (bb.max.x - bb.min.x), (pos.getY(i) - bb.min.y) / (bb.max.y - bb.min.y));
    this.wings = [-1, 1].map((sd) => {
      const pivot = new THREE.Group();
      const w = mesh(wg, wmat); w.castShadow = true;
      w.scale.set(sd, 1, 1);
      pivot.add(w);
      pivot.position.set(sd * 0.12, 0.62, -0.22);
      this.body.add(pivot);
      return pivot;
    });
    const legGeo = new THREE.CapsuleGeometry(0.04, 0.14, 4, 6);
    const lm = toon('#3a2a5a');
    this.legs = [-0.13, 0.13].map((x) => { const l = mesh(legGeo, lm, x, 0.12, 0.05); this.root.add(l); return l; });
  }
  update(dt, s) {
    this.baseUpdate(dt, s);
    const flap = s.grounded ? Math.sin(this.t * 3) * 0.15 + 0.3 : Math.sin(this.t * 30) * 0.7 + 0.2;
    this.wings.forEach((w, i) => { const sd = i ? 1 : -1; w.rotation.y = -sd * (0.5 + flap); w.rotation.z = sd * 0.15; });
    this.antennae.forEach((a, i) => { a.rotation.z = Math.sin(this.t * 4 + i) * 0.1 - (s.vy || 0) * 0.01; });
    const ph = this.t * 20, run = s.run || 0;
    this.legs.forEach((l, i) => { l.position.y = 0.12 + (s.grounded ? Math.max(0, Math.sin(ph + i * Math.PI)) * 0.07 * run : 0.02); });
    this.body.position.y = s.grounded ? Math.sin(this.t * 2.5) * 0.02 : 0;
  }
}

class Blups extends Character {
  constructor() {
    super();
    const colors = ['#ff5a8a', '#5affd2', '#ffe85a', '#8a5aff', '#5ab4ff', '#ff8a3a', '#8aff5a'];
    const layout = [[-0.24, 0.17], [0, 0.17], [0.24, 0.17], [-0.12, 0.47], [0.12, 0.47], [0, 0.76], [0, 1.0]];
    this.blups = layout.map(([x, y], i) => {
      const g = new THREE.Group();
      const r = i === 6 ? 0.13 : 0.16;
      g.add(outlined(mesh(SPH, toon(colors[i], { emissive: colors[i], emissiveIntensity: 0.12 }), 0, 0, 0, r), 0.025));
      const eye1 = makeEye(r * 0.42); eye1.position.set(-r * 0.38, r * 0.25, r * 0.8);
      const eye2 = makeEye(r * 0.42); eye2.position.set(r * 0.38, r * 0.25, r * 0.8);
      g.add(eye1, eye2); this.eyes.push(eye1, eye2);
      g.userData = { x, y, ph: i * 1.3, r };
      this.body.add(g);
      return g;
    });
    const top = this.blups[6];
    const hatMat = toon('#2a1a3a');
    const hat = new THREE.Group();
    hat.add(outlined(mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.025, 20), hatMat), 0.015));
    hat.add(outlined(mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.14, 16), hatMat, 0, 0.08, 0), 0.015));
    hat.add(mesh(new THREE.CylinderGeometry(0.132, 0.132, 0.03, 16), toon('#ff5a8a'), 0, 0.03, 0));
    hat.position.y = 0.11; hat.rotation.z = 0.15;
    top.add(hat);
    const stache = mesh(new THREE.TorusGeometry(0.06, 0.02, 6, 12, Math.PI), MAT.black, 0, -0.04, 0.13);
    stache.rotation.z = Math.PI;
    top.add(stache);
    // a tiny tie on the middle blup, for professionalism
    const tie = mesh(new THREE.ConeGeometry(0.05, 0.16, 4), toon('#ff2a5a'), 0, -0.08, 0.15);
    tie.rotation.x = Math.PI;
    this.blups[5].add(tie);
  }
  update(dt, s) {
    this.baseUpdate(dt, s);
    const stretch = s.grounded ? 1 : 1 + Math.max(-0.1, Math.min(0.25, (s.vy || 0) * 0.015));
    this.blups.forEach((b, i) => {
      const u = b.userData;
      const sway = Math.sin(this.t * 6 + u.ph) * 0.025 * (1 + (s.run || 0) * 2) * (u.y + 0.3);
      const lag = -(s.vx || 0) * 0.008 * u.y;
      b.position.set(u.x + sway + lag, u.y * stretch + Math.abs(Math.sin(this.t * 12 + u.ph)) * 0.03 * (s.run || 0), 0);
      b.rotation.z = -sway * 2;
    });
  }
}

export function createCharacter(key) {
  const C = { pebblord: Pebblord, blib: Blib, zzzorp: Zzzorp, mothilda: Mothilda, blups: Blups }[key] || Pebblord;
  const c = new C();
  c.baseScale = key === 'blups' ? 1.32 : 1.15;
  c.root.scale.setScalar(c.baseScale);
  c.root.traverse((o) => { if (o.isMesh && !o.userData.outline) o.castShadow = true; });
  return c;
}

// ================================================================ ENEMIES
// look builders: return { root, update(dt, t, e) } (e = live enemy state)
function faceOn(group, { y, z, spacing = 0.2, size = 0.12, angry = true, teeth = false, teethW = 0.3 }) {
  const eyes = [makeEye(size), makeEye(size)];
  eyes[0].position.set(-spacing / 2, y, z); eyes[1].position.set(spacing / 2, y, z);
  group.add(...eyes);
  if (angry) {
    const b1 = brow(size * 1.5, size * 0.35); b1.position.set(-spacing / 2, y + size * 1.1, z + size * 0.3); b1.rotation.z = -0.5;
    const b2 = brow(size * 1.5, size * 0.35); b2.position.set(spacing / 2, y + size * 1.1, z + size * 0.3); b2.rotation.z = 0.5;
    group.add(b1, b2);
  }
  if (teeth) {
    const tr = teethRow(5, teethW, 0.1); tr.position.set(0, y - size * 1.6, z + 0.02); group.add(tr);
  }
  return eyes;
}

const LOOKS = {
  meatball(c) {
    const root = new THREE.Group(), spin = new THREE.Group();
    root.add(spin);
    spin.add(outlined(mesh(lumpy(0.45, 2, 0.12, 5, false), toon(c), 0, 0, 0), 0.035));
    for (let i = 0; i < 8; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(0.44);
      spin.add(mesh(SPH_LO, toon('#3a8a2a'), v.x, v.y, v.z, 0.05));
    }
    spin.position.y = 0.45;
    const face = new THREE.Group(); face.position.y = 0.45; root.add(face);
    const sauce = mesh(lumpy(0.32, 1, 0.2, 2, false), toon('#d2261a', { emissive: '#801010', emissiveIntensity: 0.3 }), 0, 0.3, 0, [1.2, 0.45, 1.2]);
    face.add(sauce);
    const eyes = faceOn(face, { y: 0.08, z: 0.4, spacing: 0.26, size: 0.11, teeth: true, teethW: 0.32 });
    return { root, eyes, update(dt, t, e) { spin.rotation.z -= (e.vx || 0) * dt / 0.45; } };
  },
  microbe(c) {
    const root = new THREE.Group(), b = new THREE.Group(); root.add(b); b.position.y = 0.42;
    b.add(outlined(mesh(SPH, toon(c, { transparent: true, opacity: 0.75, emissive: c, emissiveIntensity: 0.25 }), 0, 0, 0, [0.48, 0.4, 0.4]), 0.03));
    b.add(mesh(SPH_LO, toon('#3a1a5a'), 0.12, -0.05, -0.1, 0.15));
    const cil = [];
    const cg = new THREE.ConeGeometry(0.025, 0.2, 4);
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; const k = mesh(cg, toon(c), Math.cos(a) * 0.48, Math.sin(a) * 0.4, 0); k.rotation.z = a - Math.PI / 2; k.userData.a = a; cil.push(k); b.add(k); }
    const eye = makeEye(0.17, { iris: '#ff3a3a' }); eye.position.set(0, 0.05, 0.33); b.add(eye);
    return { root, eyes: [eye], update(dt, t) { b.scale.set(1 + Math.sin(t * 5) * 0.06, 1 - Math.sin(t * 5) * 0.06, 1); cil.forEach((k, i) => (k.rotation.z = k.userData.a - Math.PI / 2 + Math.sin(t * 10 + i) * 0.35)); } };
  },
  mushroom(c) {
    const root = new THREE.Group(), b = new THREE.Group(); root.add(b);
    b.add(outlined(mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.55, 14), toon('#fff0d8'), 0, 0.28, 0), 0.03));
    const cap = outlined(mesh(new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), toon(c, { emissive: c, emissiveIntensity: 0.15 }), 0, 0.5, 0, [0.55, 0.45, 0.55]), 0.03);
    b.add(cap);
    for (let i = 0; i < 6; i++) { const a = i * 1.1, h = 0.3 + (i % 3) * 0.2; b.add(mesh(SPH_LO, MAT.white, Math.cos(a) * 0.4 * Math.cos(h), 0.5 + Math.sin(h) * 0.42, Math.sin(a) * 0.4 * Math.cos(h) + 0.05, 0.06)); }
    b.add(mesh(new THREE.CircleGeometry(0.54, 20), glow('#ffd2a8', 1.2), 0, 0.5, 0)).rotation && (b.children[b.children.length - 1].rotation.x = Math.PI / 2);
    const tr = teethRow(7, 0.7, 0.12); tr.position.set(0, 0.47, 0.3); b.add(tr);
    const eyes = faceOn(b, { y: 0.3, z: 0.22, spacing: 0.18, size: 0.08 });
    return { root, eyes, update(dt, t) { b.position.y = Math.abs(Math.sin(t * 6)) * 0.12; cap.rotation.z = Math.sin(t * 6) * 0.08; } };
  },
  stapler(c) {
    const root = new THREE.Group(), b = new THREE.Group(); root.add(b);
    const m = toon(c), dm = toon('#2a2a34');
    b.add(outlined(mesh(new RoundedBoxGeometry(0.95, 0.16, 0.42, 2, 0.05), dm, 0, 0.1, 0), 0.025));
    const jaw = new THREE.Group(); jaw.position.set(-0.42, 0.2, 0);
    jaw.add(outlined(mesh(new RoundedBoxGeometry(0.95, 0.2, 0.38, 2, 0.07), m, 0.45, 0.1, 0), 0.025));
    const tr = teethRow(6, 0.6, 0.08, toon('#d8dce8')); tr.position.set(0.55, 0, 0.0); jaw.add(tr);
    const eyes = faceOn(jaw, { y: 0.28, z: 0.12, spacing: 0.22, size: 0.09 });
    eyes.forEach((e) => (e.position.x += 0.62));
    b.add(jaw);
    return { root, eyes, update(dt, t) { jaw.rotation.z = Math.max(0, Math.sin(t * 7)) * 0.5; b.position.y = Math.max(0, Math.sin(t * 7)) * 0.05; } };
  },
  jelly(c) {
    const root = new THREE.Group(), b = new THREE.Group(); root.add(b);
    b.add(outlined(mesh(new RoundedBoxGeometry(0.8, 0.7, 0.6, 3, 0.15), toon(c, { transparent: true, opacity: 0.8, emissive: c, emissiveIntensity: 0.25 }), 0, 0.35, 0), 0.03));
    b.add(mesh(SPH, toon('#ff2a3a'), 0.05, 0.78, 0, 0.12));
    const eyes = faceOn(b, { y: 0.45, z: 0.31, spacing: 0.3, size: 0.11 });
    const mouth = mesh(SPH_LO, MAT.black, 0, 0.22, 0.31, [0.15, 0.05, 0.02]); b.add(mouth);
    return { root, eyes, update(dt, t) { const w = Math.sin(t * 9) * 0.08; b.scale.set(1 + w, 1 - w, 1); b.rotation.z = Math.sin(t * 4.5) * 0.08; } };
  },
  slug(c) {
    const root = new THREE.Group(), b = new THREE.Group(); root.add(b);
    const body = outlined(mesh(new THREE.CapsuleGeometry(0.22, 0.6, 6, 14), toon(c, { emissive: '#ffffff', emissiveIntensity: 0.15 }), 0, 0.22, 0), 0.03);
    body.rotation.z = Math.PI / 2; b.add(body);
    const eyes = [];
    [-0.08, 0.08].forEach((z, i) => {
      const st = mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.4, 6), toon(c), 0.32, 0.5, z); st.rotation.z = -0.3; b.add(st);
      const e = makeEye(0.09); e.position.set(0.38, 0.72, z + 0.05); b.add(e); eyes.push(e);
    });
    return { root, eyes, flip: true, update(dt, t) { b.scale.x = 1 + Math.sin(t * 5) * 0.08; } };
  },
  tooth(c) {
    const root = new THREE.Group(), b = new THREE.Group(); root.add(b);
    b.add(outlined(mesh(new RoundedBoxGeometry(0.7, 0.55, 0.5, 3, 0.2), toon(c), 0, 0.55, 0), 0.03));
    const legs = [-0.18, 0.18].map((x) => { const l = outlined(mesh(new THREE.ConeGeometry(0.12, 0.35, 8), toon(c), x, 0.18, 0), 0.025); l.rotation.x = Math.PI; b.add(l); return l; });
    const eyes = faceOn(b, { y: 0.62, z: 0.26, spacing: 0.24, size: 0.09, teeth: false });
    b.add(mesh(SPH_LO, MAT.black, 0, 0.42, 0.26, [0.14, 0.04, 0.02]));
    return { root, eyes, update(dt, t) { legs.forEach((l, i) => (l.position.y = 0.18 + Math.max(0, Math.sin(t * 12 + i * Math.PI)) * 0.08)); b.rotation.z = Math.sin(t * 12) * 0.06; } };
  },
  clock(c) {
    const root = new THREE.Group(), b = new THREE.Group(); root.add(b);
    const face = outlined(mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.22, 24), toon(c), 0, 0.5, 0), 0.03);
    face.rotation.x = Math.PI / 2; b.add(face);
    b.add(mesh(new THREE.CircleGeometry(0.31, 24), MAT.white, 0, 0.5, 0.115));
    const h1 = mesh(new THREE.BoxGeometry(0.03, 0.2, 0.02), MAT.black, 0, 0.5, 0.13); h1.geometry.translate(0, 0.1, 0); b.add(h1);
    const h2 = mesh(new THREE.BoxGeometry(0.02, 0.27, 0.02), MAT.black, 0, 0.5, 0.135); h2.geometry.translate(0, 0.13, 0); b.add(h2);
    [-0.25, 0.25].forEach((x) => b.add(outlined(mesh(SPH, toon('#d8dce8'), x, 0.9, 0, 0.13), 0.02)));
    [-0.18, 0.18].forEach((x) => { const l = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.2, 6), MAT.dark, x, 0.1, 0); l.rotation.z = x; b.add(l); });
    const eyes = faceOn(b, { y: 0.56, z: 0.15, spacing: 0.24, size: 0.07, angry: true });
    return { root, eyes, update(dt, t) { h1.rotation.z = -t * 2; h2.rotation.z = -t * 9; b.position.x = Math.sin(t * 40) * 0.015; } };
  },
  lint(c) {
    const root = new THREE.Group(), b = new THREE.Group(); root.add(b);
    b.add(outlined(mesh(fuzzy(0.4, 0.5), toon(c), 0, 0.42, 0), 0.03));
    const eyes = faceOn(b, { y: 0.48, z: 0.34, spacing: 0.22, size: 0.09 });
    return { root, eyes, update(dt, t) { b.rotation.z = Math.sin(t * 3) * 0.15; b.position.y = Math.abs(Math.sin(t * 5)) * 0.08; } };
  },
  pumpkin(c) {
    const root = new THREE.Group(), b = new THREE.Group(); root.add(b);
    const g = new THREE.SphereGeometry(0.45, 28, 16);
    const p = g.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const a = Math.atan2(v.z, v.x); const k = 1 - Math.pow(Math.abs(Math.sin(a * 4)), 3) * 0.08; p.setXYZ(i, v.x * k, v.y * 0.8, v.z * k); }
    g.computeVertexNormals();
    b.add(outlined(mesh(g, toon(c), 0, 0.38, 0), 0.03));
    b.add(mesh(new THREE.CylinderGeometry(0.04, 0.07, 0.18, 6), toon('#3a7a2a'), 0, 0.78, 0));
    const fm = glow('#ffd23a', 3);
    const tri = new THREE.ConeGeometry(0.08, 0.12, 3);
    [-0.15, 0.15].forEach((x) => { const e = new THREE.Mesh(tri, fm); e.position.set(x, 0.48, 0.4); e.rotation.x = Math.PI / 2; b.add(e); });
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.07, 0.02), fm); mouth.position.set(0, 0.27, 0.41); b.add(mouth);
    teethRow(4, 0.34, 0.06, fm).children.forEach((tt) => { tt.position.set(tt.position.x, 0.31, 0.41); b.add(tt); });
    return { root, eyes: [], update(dt, t) { b.position.y = Math.abs(Math.sin(t * 7)) * 0.15; b.rotation.z = Math.sin(t * 7) * 0.1; } };
  },
  skull(c) {
    const root = new THREE.Group(), b = new THREE.Group(); root.add(b);
    b.add(outlined(mesh(SPH, toon(c), 0, 0.55, 0, [0.32, 0.3, 0.3]), 0.03));
    b.add(outlined(mesh(new RoundedBoxGeometry(0.34, 0.14, 0.26, 2, 0.05), toon(c), 0, 0.33, 0.04), 0.025));
    const gm = glow('#5affb4', 3);
    [-0.12, 0.12].forEach((x) => {
      b.add(mesh(SPH_LO, MAT.black, x, 0.55, 0.24, 0.09));
      b.add(mesh(SPH_LO, gm, x, 0.55, 0.31, 0.035));
    });
    const legs = [];
    for (let i = 0; i < 4; i++) { const sd = i < 2 ? -1 : 1; const l = mesh(new THREE.CylinderGeometry(0.025, 0.02, 0.45, 5), toon(c), sd * 0.25, 0.22, i % 2 ? 0.1 : -0.1); l.rotation.z = sd * 0.8; b.add(l); legs.push(l); }
    return { root, eyes: [], update(dt, t) { legs.forEach((l, i) => (l.rotation.z = (i < 2 ? -1 : 1) * (0.8 + Math.sin(t * 14 + i * 1.6) * 0.25))); b.position.y = Math.abs(Math.sin(t * 14)) * 0.03; } };
  },
  geode(c) {
    const root = new THREE.Group(), spin = new THREE.Group(); root.add(spin); spin.position.y = 0.45;
    spin.add(outlined(mesh(new THREE.IcosahedronGeometry(0.33, 0), toon(c, { flatShading: true }), 0, 0, 0), 0.03));
    const cm = toon('#b4f4ff', { emissive: c, emissiveIntensity: 0.9, flatShading: true });
    const cg = new THREE.ConeGeometry(0.08, 0.32, 5);
    for (let i = 0; i < 14; i++) { const v = new THREE.Vector3().randomDirection(); const k = mesh(cg, cm, v.x * 0.32, v.y * 0.32, v.z * 0.32); k.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v); spin.add(k); }
    const face = new THREE.Group(); face.position.y = 0.45; root.add(face);
    const eyes = faceOn(face, { y: 0.02, z: 0.34, spacing: 0.2, size: 0.09 });
    return { root, eyes, update(dt, t, e) { spin.rotation.z -= (e.vx || 0) * dt / 0.45; } };
  },
  bat(c) {
    const root = new THREE.Group(), b = new THREE.Group(); root.add(b);
    b.add(outlined(mesh(SPH, toon(c), 0, 0, 0, [0.3, 0.28, 0.26]), 0.03));
    const shape = new THREE.Shape();
    shape.moveTo(0, 0); shape.lineTo(0.7, 0.25); shape.lineTo(0.62, 0.0); shape.lineTo(0.5, -0.12); shape.lineTo(0.35, -0.02); shape.lineTo(0.2, -0.14); shape.lineTo(0, -0.1);
    const wg = new THREE.ShapeGeometry(shape);
    const wm = toon(c, { side: THREE.DoubleSide, emissive: c, emissiveIntensity: 0.2 });
    const wings = [-1, 1].map((sd) => { const p = new THREE.Group(); const w = mesh(wg, wm); w.scale.x = sd; p.add(w); p.position.set(sd * 0.2, 0.05, -0.05); b.add(p); return p; });
    const eyes = faceOn(b, { y: 0.05, z: 0.22, spacing: 0.18, size: 0.08 });
    const f = teethRow(2, 0.12, 0.08); f.position.set(0, -0.12, 0.24); b.add(f);
    [-0.12, 0.12].forEach((x) => { const ear = mesh(new THREE.ConeGeometry(0.07, 0.18, 4), toon(c), x, 0.28, 0); b.add(ear); });
    return { root, eyes, update(dt, t) { wings.forEach((w, i) => (w.rotation.y = (i ? -1 : 1) * Math.sin(t * 16) * 0.8)); b.position.y = Math.sin(t * 16) * 0.03; } };
  },
  crystalbat(c) {
    const root = new THREE.Group(), b = new THREE.Group(); root.add(b);
    b.add(outlined(mesh(new THREE.OctahedronGeometry(0.3, 0), toon(c, { emissive: c, emissiveIntensity: 0.6, flatShading: true }), 0, 0, 0, [1, 1.2, 0.8]), 0.03));
    const wg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0.1, 0), new THREE.Vector3(0.8, 0.3, 0), new THREE.Vector3(0.1, -0.2, 0), new THREE.Vector3(0.8, 0.3, 0), new THREE.Vector3(0.5, -0.25, 0), new THREE.Vector3(0.1, -0.2, 0)]);
    wg.computeVertexNormals();
    const wm = toon('#ffffff', { side: THREE.DoubleSide, emissive: c, emissiveIntensity: 0.8, transparent: true, opacity: 0.85 });
    const wings = [-1, 1].map((sd) => { const p = new THREE.Group(); const w = mesh(wg, wm); w.scale.x = sd; p.add(w); p.position.x = sd * 0.15; b.add(p); return p; });
    const eyes = faceOn(b, { y: 0.06, z: 0.2, spacing: 0.16, size: 0.07 });
    return { root, eyes, update(dt, t) { wings.forEach((w, i) => (w.rotation.y = (i ? -1 : 1) * Math.sin(t * 12) * 0.7)); b.rotation.y = Math.sin(t * 2) * 0.3; } };
  },
  paperplane(c) {
    const root = new THREE.Group(), b = new THREE.Group(); root.add(b);
    const v = [[0.6, 0, 0], [-0.5, 0.05, 0.45], [-0.4, 0, 0], [0.6, 0, 0], [-0.4, 0, 0], [-0.5, 0.05, -0.45], [0.6, 0, 0], [-0.4, 0, 0], [-0.45, -0.22, 0]].map((p) => new THREE.Vector3(...p));
    const g = new THREE.BufferGeometry().setFromPoints(v); g.computeVertexNormals();
    b.add(mesh(g, toon(c, { side: THREE.DoubleSide })));
    const eyes = faceOn(b, { y: 0.1, z: 0.12, spacing: 0.14, size: 0.06 });
    eyes.forEach((e) => (e.position.x = 0.22));
    b.rotation.x = 0.35;
    return { root, eyes, flip: true, update(dt, t) { b.rotation.z = Math.sin(t * 3) * 0.15; } };
  },
  spark(c) {
    const root = new THREE.Group(), b = new THREE.Group(); root.add(b); b.position.y = 0.4;
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 1), glow(c, 2.5)); b.add(core);
    const sm = glow('#ffffff', 2);
    const spikes = [];
    for (let i = 0; i < 10; i++) { const k = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.32, 4), sm); const d = new THREE.Vector3().randomDirection(); k.position.copy(d.clone().multiplyScalar(0.3)); k.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d); b.add(k); spikes.push(k); }
    const eyes = faceOn(b, { y: 0.04, z: 0.24, spacing: 0.18, size: 0.08 });
    return { root, eyes, update(dt, t) { const s = 1 + Math.sin(t * 25) * 0.08; core.scale.setScalar(s); b.rotation.z = t * 2; eyes.forEach((e) => (e.parent.rotation.z = 0)); spikes.forEach((k) => (k.visible = Math.random() > 0.2)); } };
  },
  bee(c) {
    const root = new THREE.Group(), b = new THREE.Group(); root.add(b);
    const body = outlined(mesh(SPH, toon(c), 0, 0, 0, [0.38, 0.27, 0.27]), 0.03); b.add(body);
    [-0.1, 0.1].forEach((x) => { const s = mesh(new THREE.CylinderGeometry(0.265, 0.265, 0.07, 18), MAT.dark, x - 0.05, 0, 0); s.rotation.z = Math.PI / 2; s.scale.set(1, 1, 1); b.add(s); });
    const st = mesh(new THREE.ConeGeometry(0.05, 0.2, 6), MAT.dark, -0.44, 0, 0); st.rotation.z = Math.PI / 2; b.add(st);
    const wm = new THREE.MeshBasicMaterial({ color: '#e8ffff', transparent: true, opacity: 0.55, side: THREE.DoubleSide });
    const wings = [-1, 1].map((sd) => { const w = new THREE.Mesh(new THREE.CircleGeometry(0.22, 12), wm); w.scale.set(1, 0.55, 1); w.position.set(-0.05, 0.28, sd * 0.1); w.rotation.x = Math.PI / 2; b.add(w); return w; });
    const eyes = faceOn(b, { y: 0.06, z: 0.22, spacing: 0.16, size: 0.07 });
    eyes.forEach((e) => (e.position.x += 0.18));
    return { root, eyes, flip: true, update(dt, t) { wings.forEach((w, i) => (w.rotation.x = Math.PI / 2 + (i ? 1 : -1) * Math.sin(t * 40) * 0.6)); } };
  },
  eyeball(c) {
    const root = new THREE.Group(), b = new THREE.Group(); root.add(b);
    const eye = makeEye(0.42, { iris: '#ff3a8a', lid: '#8a3a6a' });
    b.add(eye);
    const tm = toon('#8a3a6a');
    const tent = [];
    for (let i = 0; i < 4; i++) { const k = mesh(new THREE.ConeGeometry(0.06, 0.5, 6), tm, -0.24 + i * 0.16, -0.48, -0.05); k.rotation.x = Math.PI; b.add(k); tent.push(k); }
    return { root, eyes: [eye], tracks: true, update(dt, t) { tent.forEach((k, i) => (k.rotation.z = Math.sin(t * 5 + i) * 0.3)); } };
  },
  raincloud(c) {
    const root = new THREE.Group(), b = new THREE.Group(); root.add(b);
    const m = toon(c);
    [[0, 0, 0.32], [-0.3, -0.06, 0.24], [0.3, -0.05, 0.25], [-0.12, 0.18, 0.24], [0.16, 0.16, 0.22]].forEach(([x, y, r]) => b.add(outlined(mesh(SPH, m, x, y, 0, r), 0.03)));
    const eyes = faceOn(b, { y: 0.02, z: 0.3, spacing: 0.22, size: 0.08 });
    const bolt = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.5, 3), glow('#ffff5a', 3)); bolt.position.set(0, -0.45, 0); bolt.rotation.x = Math.PI; b.add(bolt);
    const drops = [];
    const dm = glow('#8ad2ff', 1.5);
    for (let i = 0; i < 5; i++) { const d = new THREE.Mesh(new THREE.CapsuleGeometry(0.02, 0.08, 2, 4), dm); d.position.set(-0.3 + i * 0.15, -0.3, 0); b.add(d); drops.push(d); }
    return { root, eyes, update(dt, t) { bolt.visible = Math.sin(t * 3.1) > 0.85; drops.forEach((d, i) => { d.position.y = -0.3 - ((t * 1.5 + i * 0.37) % 1) * 0.8; }); } };
  },
  fish(c) {
    const root = new THREE.Group(), b = new THREE.Group(); root.add(b);
    b.add(outlined(mesh(SPH, toon(c, { emissive: c, emissiveIntensity: 0.15 }), 0, 0, 0, [0.42, 0.28, 0.24]), 0.03));
    const tail = mesh(new THREE.ConeGeometry(0.22, 0.3, 4), toon(c), -0.48, 0, 0); tail.rotation.z = -Math.PI / 2; tail.scale.z = 0.25; b.add(tail);
    const fin = mesh(new THREE.ConeGeometry(0.12, 0.25, 4), toon(c), -0.05, 0.28, 0); fin.scale.z = 0.25; fin.rotation.z = 0.4; b.add(fin);
    const eyes = [makeEye(0.1), makeEye(0.1)]; eyes[0].position.set(0.22, 0.08, 0.18); eyes[1].position.set(0.22, 0.08, -0.18); b.add(...eyes);
    b.add(mesh(SPH_LO, MAT.black, 0.4, -0.06, 0, [0.04, 0.07, 0.1]));
    const tr = teethRow(4, 0.14, 0.05); tr.position.set(0.38, -0.01, 0.06); tr.rotation.y = Math.PI / 2; b.add(tr);
    return { root, eyes, leaper: true, update(dt, t) { tail.rotation.y = Math.sin(t * 18) * 0.5; } };
  },
  droplet(c) {
    const root = new THREE.Group(), b = new THREE.Group(); root.add(b);
    const pts = [];
    for (let i = 0; i <= 12; i++) { const u = i / 12; pts.push(new THREE.Vector2(Math.sin(u * Math.PI) * (0.36 * Math.pow(1 - u, 0.6)) + 0.001, -0.3 + u * 0.8)); }
    const g = new THREE.LatheGeometry(pts, 18);
    b.add(outlined(mesh(g, toon(c, { emissive: c, emissiveIntensity: 0.5 }), 0, 0, 0), 0.03));
    const eyes = faceOn(b, { y: -0.02, z: 0.28, spacing: 0.2, size: 0.08 });
    return { root, eyes, leaper: 'up', update(dt, t) { b.scale.set(1 + Math.sin(t * 9) * 0.05, 1 - Math.sin(t * 9) * 0.05, 1); } };
  },
};

const BASED = new Set(['meatball', 'microbe', 'mushroom', 'stapler', 'jelly', 'slug', 'tooth', 'clock', 'lint', 'pumpkin', 'skull', 'geode', 'spark']);
export function createEnemy(look, color) {
  const fn = LOOKS[look] || LOOKS.microbe;
  const m = fn(color);
  m.based = BASED.has(look);
  m.root.traverse((o) => { if (o.isMesh && !o.userData.outline) o.castShadow = true; });
  return m;
}

// ================================================================ ARTIFACTS
function goldMat(tint = '#ffd25a', em = '#ff9a1a') { return toon(tint, { emissive: em, emissiveIntensity: 0.55 }); }
const ARTIFACTS = {
  pillow(a) {
    const g = new THREE.Group(); const m = goldMat();
    g.add(mesh(SPH, m, 0, 0, 0, [0.42, 0.42, 0.16]));
    const crimp = mesh(new THREE.TorusGeometry(0.42, 0.06, 8, 40), m); g.add(crimp);
    for (let i = 0; i < 20; i++) { const ang = (i / 20) * Math.PI * 2; g.add(mesh(SPH_LO, m, Math.cos(ang) * 0.47, Math.sin(ang) * 0.47, 0, 0.05)); }
    g.rotation.z = Math.PI / 4;
    return g;
  },
  stone(a) { const g = new THREE.Group(); g.add(mesh(lumpy(0.38, 1, 0.25, 9), goldMat(), 0, 0, 0)); return g; },
  crown(a) {
    const g = new THREE.Group(); const m = goldMat();
    g.add(mesh(new THREE.CylinderGeometry(0.36, 0.32, 0.22, 24, 1, true), toon('#ffd25a', { emissive: '#ff9a1a', emissiveIntensity: 0.55, side: THREE.DoubleSide })));
    for (let i = 0; i < 7; i++) { const ang = (i / 7) * Math.PI * 2; g.add(mesh(new THREE.ConeGeometry(0.07, 0.3, 6), m, Math.cos(ang) * 0.34, 0.24, Math.sin(ang) * 0.34)); g.add(mesh(SPH_LO, glow(a, 2.5), Math.cos(ang) * 0.36, 0.0, Math.sin(ang) * 0.36, 0.05)); }
    return g;
  },
  shard(a) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.OctahedronGeometry(0.3, 0), toon('#ffffff', { emissive: a, emissiveIntensity: 1.2, flatShading: true }), 0, 0, 0, [0.7, 1.7, 0.7]));
    for (let i = 0; i < 4; i++) { const k = mesh(new THREE.OctahedronGeometry(0.07, 0), glow(a, 2.5), Math.cos(i * 1.57) * 0.45, 0, Math.sin(i * 1.57) * 0.45); g.add(k); }
    return g;
  },
  permit(a) {
    const g = new THREE.Group();
    g.add(mesh(new RoundedBoxGeometry(0.6, 0.8, 0.03, 2, 0.01), toon('#fff8e8', { emissive: '#ffe8b0', emissiveIntensity: 0.3 })));
    for (let i = 0; i < 5; i++) g.add(mesh(new THREE.BoxGeometry(0.4, 0.025, 0.01), MAT.dark, 0, 0.25 - i * 0.09, 0.02));
    const seal = mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.04, 16), toon('#d21a2a', { emissive: '#ff2a2a', emissiveIntensity: 0.6 }), 0.15, -0.26, 0.03); seal.rotation.x = Math.PI / 2; g.add(seal);
    return g;
  },
  cube(a) {
    const g = new THREE.Group(); const m = goldMat();
    g.add(mesh(new RoundedBoxGeometry(0.7, 0.12, 0.25, 2, 0.04), m, 0, -0.1, 0));
    const top = mesh(new RoundedBoxGeometry(0.7, 0.14, 0.22, 2, 0.05), m, 0.02, 0.06, 0); top.rotation.z = 0.25; g.add(top);
    return g;
  },
  gummy(a) {
    const g = new THREE.Group(); const m = toon(a, { transparent: true, opacity: 0.85, emissive: a, emissiveIntensity: 0.6 });
    g.add(mesh(SPH, m, 0, -0.1, 0, [0.25, 0.3, 0.2])); g.add(mesh(SPH, m, 0, 0.25, 0, 0.18));
    [[-0.13, 0.4], [0.13, 0.4]].forEach(([x, y]) => g.add(mesh(SPH, m, x, y, 0, 0.07)));
    [[-0.24, 0.0], [0.24, 0.0], [-0.13, -0.38], [0.13, -0.38]].forEach(([x, y]) => g.add(mesh(SPH, m, x, y, 0, 0.09)));
    return g;
  },
  spool(a) {
    const g = new THREE.Group(); const wood = toon('#c8a06a');
    [-0.25, 0.25].forEach((y) => g.add(mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.07, 20), wood, 0, y, 0)));
    g.add(mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.45, 20), toon('#ffd25a', { emissive: a, emissiveIntensity: 0.6 })));
    const thr = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0.22, 0, 0), new THREE.Vector3(0.45, -0.2, 0.1), new THREE.Vector3(0.4, -0.5, 0), new THREE.Vector3(0.6, -0.7, 0)]), 16, 0.02, 5), glow(a, 2));
    g.add(thr);
    return g;
  },
  sock(a) {
    const g = new THREE.Group(); const m = goldMat();
    g.add(mesh(new THREE.CapsuleGeometry(0.15, 0.45, 6, 12), m, 0, 0.12, 0));
    const foot = mesh(new THREE.CapsuleGeometry(0.15, 0.3, 6, 12), m, 0.17, -0.22, 0); foot.rotation.z = Math.PI / 2; g.add(foot);
    g.add(mesh(new THREE.TorusGeometry(0.15, 0.04, 6, 16), toon('#ff5a8a', { emissive: '#ff2a6a', emissiveIntensity: 0.6 }), 0, 0.45, 0)).children;
    g.children[g.children.length - 1].rotation.x = Math.PI / 2;
    return g;
  },
  jar(a) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.6, 20), toon('#d8f8ff', { transparent: true, opacity: 0.35, depthWrite: false })));
    g.add(mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.1, 20), toon('#8a6a3a'), 0, 0.34, 0));
    const spark = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13, 0), glow(a, 4)); g.add(spark);
    g.userData.spin = spark;
    return g;
  },
  mirror(a) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.TorusGeometry(0.38, 0.07, 10, 32), goldMat()));
    g.add(mesh(new THREE.CircleGeometry(0.36, 32), new THREE.MeshBasicMaterial({ color: '#000000' })));
    g.add(mesh(new THREE.TorusGeometry(0.33, 0.015, 6, 32), glow(a, 3)));
    return g;
  },
  organ(a) {
    const g = new THREE.Group(); const m = toon('#ff7a9a', { emissive: '#ff2a5a', emissiveIntensity: 0.45 });
    g.add(mesh(SPH, m, -0.1, 0.05, 0, [0.28, 0.2, 0.18])); g.add(mesh(SPH, m, 0.12, -0.08, 0, [0.22, 0.24, 0.18]));
    g.add(mesh(new THREE.TorusGeometry(0.3, 0.02, 6, 20, Math.PI), glow('#ffd25a', 2), 0, 0, 0.12));
    return g;
  },
  tooth(a) {
    const g = new THREE.Group(); const m = goldMat('#fff8ec', '#ffd28a');
    g.add(mesh(new RoundedBoxGeometry(0.5, 0.4, 0.4, 3, 0.15), m, 0, 0.12, 0));
    [-0.13, 0.13].forEach((x) => { const r = mesh(new THREE.ConeGeometry(0.1, 0.35, 8), m, x, -0.22, 0); r.rotation.x = Math.PI; g.add(r); });
    return g;
  },
  mirrorball(a) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.IcosahedronGeometry(0.38, 2), toon('#e8f0ff', { flatShading: true, emissive: a, emissiveIntensity: 0.5 })));
    return g;
  },
  drop(a) {
    const g = new THREE.Group();
    const pts = []; for (let i = 0; i <= 12; i++) { const u = i / 12; pts.push(new THREE.Vector2(Math.sin(u * Math.PI) * 0.34 * Math.pow(1 - u, 0.7) + 0.001, -0.3 + u * 0.75)); }
    g.add(mesh(new THREE.LatheGeometry(pts, 20), toon(a, { emissive: a, emissiveIntensity: 0.9, transparent: true, opacity: 0.9 })));
    return g;
  },
  tear(a) { return ARTIFACTS.drop(a); },
  hourglass(a) {
    const g = new THREE.Group(); const m = goldMat();
    [-0.36, 0.36].forEach((y) => g.add(mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 16), m, 0, y, 0)));
    for (let i = 0; i < 3; i++) g.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.72, 6), m, Math.cos(i * 2.1) * 0.26, 0, Math.sin(i * 2.1) * 0.26));
    const sm = toon(a, { emissive: a, emissiveIntensity: 1.0 });
    g.add(mesh(new THREE.ConeGeometry(0.2, 0.32, 16), sm, 0, 0.16, 0)); const b2 = mesh(new THREE.ConeGeometry(0.2, 0.32, 16), sm, 0, -0.16, 0); b2.rotation.x = Math.PI; g.add(b2);
    return g;
  },
  lantern(a) { const l = LOOKS.pumpkin('#ffb43a'); l.root.position.y = -0.38; const g = new THREE.Group(); g.add(l.root); return g; },
  femur(a) {
    const g = new THREE.Group(); const m = goldMat('#fff4dc', '#ffcf8a');
    const shaft = mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.7, 12), m); shaft.rotation.z = Math.PI / 4; g.add(shaft);
    [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(([s1, s2]) => g.add(mesh(SPH, m, s1 * 0.25 + s2 * 0.06, s1 * 0.25 - s2 * 0.06, 0, 0.1)));
    return g;
  },
  orb(a) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 3), glow(a, 2.2)));
    const ring = mesh(new THREE.TorusGeometry(0.45, 0.025, 6, 40), goldMat()); ring.rotation.x = 1.2; g.add(ring);
    return g;
  },
};
export function createArtifact(look, accent) {
  const fn = ARTIFACTS[look] || ARTIFACTS.orb;
  const g = fn(accent);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// ================================================================ COINS
let COIN = null;
export function coinAssets() {
  if (COIN) return COIN;
  const geo = new THREE.CylinderGeometry(0.44, 0.44, 0.1, 32);
  geo.rotateX(Math.PI / 2);
  const side = toon('#ffb21a', { emissive: '#ff9a00', emissiveIntensity: 0.9 });
  const face = new THREE.MeshToonMaterial({ map: coinTexture(false), gradientMap: side.gradientMap, emissive: '#ffffff', emissiveIntensity: 0.55 });
  face.emissiveMap = face.map;
  const mface = new THREE.MeshToonMaterial({ map: coinTexture(true), gradientMap: side.gradientMap, emissive: '#ff5aff', emissiveIntensity: 0.6 });
  const mside = toon('#ff9af0', { emissive: '#a85aff', emissiveIntensity: 1.0 });
  COIN = { geo, mats: [side, face, face], megaMats: [mside, mface, mface] };
  return COIN;
}
export function createCoin(mega) {
  const a = coinAssets();
  const m = new THREE.Mesh(a.geo, mega ? a.megaMats : a.mats);
  m.castShadow = true;
  if (mega) m.scale.setScalar(1.6);
  return m;
}

// ================================================================ PORTAL
export function createPortal(pal) {
  const g = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.75, 48), portalMaterial(pal.accent, pal.edge));
  disc.position.z = 0.05;
  g.add(disc);
  const ringMat = toon('#3a2a5a', { emissive: pal.accent, emissiveIntensity: 0.25 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.85, 0.2, 14, 60), ringMat);
  ring.castShadow = true;
  g.add(ring);
  addOutline(ring, 0.04);
  const runes = [];
  const rm = glow(pal.edge, 1.0);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.28, 0.12), rm);
    r.position.set(Math.cos(a) * 1.85, Math.sin(a) * 1.85, 0.18);
    r.rotation.z = a;
    runes.push(r); g.add(r);
  }
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(6.5, 6.5), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { uColor: { value: new THREE.Color(pal.accent) }, uOn: { value: 0.2 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `varying vec2 vUv; uniform vec3 uColor; uniform float uOn; void main(){ float d = length(vUv-0.5)*2.0; float a = smoothstep(1.0, 0.45, d) * uOn * 0.6; gl_FragColor = vec4(uColor*a, a); }`,
  }));
  halo.position.z = -0.2;
  g.add(halo);
  // base pylons
  const pm = toon('#2a1a3a', { emissive: pal.edge, emissiveIntensity: 0.15 });
  [-1.5, 1.5].forEach((x) => { const p = new THREE.Mesh(new RoundedBoxGeometry(0.5, 0.9, 0.6, 2, 0.1), pm); p.position.set(x, -2.0, 0); p.castShadow = true; g.add(p); });
  return { root: g, disc, ring, ringMat, runes, rm, halo };
}

export function createBeam(color, h = 18, r = 0.8) {
  const geo = new THREE.CylinderGeometry(r, r * 1.3, h, 24, 1, true);
  geo.translate(0, h / 2, 0);
  const m = new THREE.Mesh(geo, beamMaterial(color, 0.8));
  // flip uv so the bright end is at the bottom
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
  return m;
}

export function createPedestal(pal) {
  const g = new THREE.Group();
  const m = toon('#2a1a3a', { emissive: pal.edge, emissiveIntensity: 0.12 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 0.35, 8), m); base.position.y = 0.17; base.castShadow = true;
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 0.12, 8), toon(pal.accent, { emissive: pal.accent, emissiveIntensity: 0.5 })); top.position.y = 0.4;
  g.add(base, top);
  return g;
}

export function createBouncer(pal) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.72, 0.25, 18), toon('#2a1a3a')); base.position.y = 0.12; base.castShadow = true;
  const pad = new THREE.Group();
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.7, 22, 10, 0, Math.PI * 2, 0, Math.PI / 2), toon(pal.accent, { emissive: pal.accent, emissiveIntensity: 0.45 }));
  cap.scale.y = 0.45; cap.castShadow = true;
  addOutline(cap, 0.04);
  pad.add(cap);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; pad.add(mesh(SPH_LO, glow(pal.edge, 1.6), Math.cos(a) * 0.42, 0.15, Math.sin(a) * 0.42, 0.06)); }
  pad.position.y = 0.22;
  g.add(base, pad);
  return { root: g, pad };
}

// spikes as an instanced row
const SPIKE_GEOS = {};
function spikeGeo(look) {
  if (SPIKE_GEOS[look]) return SPIKE_GEOS[look];
  let g;
  switch (look) {
    case 'tines': g = new THREE.CylinderGeometry(0.03, 0.06, 0.8, 6); g.translate(0, 0.4, 0); break;
    case 'needles': g = new THREE.CylinderGeometry(0.0, 0.06, 0.85, 6); g.translate(0, 0.42, 0); break;
    case 'staples': g = new THREE.TorusGeometry(0.14, 0.035, 5, 10, Math.PI); g.rotateZ(0); g.scale(1, 2.2, 1); break;
    case 'fangs': g = new THREE.ConeGeometry(0.14, 0.7, 6); g.translate(0, 0.35, 0); break;
    case 'thorns': g = new THREE.ConeGeometry(0.12, 0.7, 5); g.translate(0, 0.35, 0); break;
    default: g = new THREE.OctahedronGeometry(0.16, 0); g.scale(1, 2.6, 1); g.translate(0, 0.3, 0);
  }
  SPIKE_GEOS[look] = g;
  return g;
}
export function createSpikes(look, color, w, edge) {
  const n = Math.max(2, Math.round(w / 0.32));
  const mat = toon(color, { emissive: edge, emissiveIntensity: 0.35, flatShading: look === 'shards' });
  const im = new THREE.InstancedMesh(spikeGeo(look), mat, n * 2);
  const d = new THREE.Object3D();
  let k = 0;
  for (let row = 0; row < 2; row++) {
    for (let i = 0; i < n; i++) {
      d.position.set(-w / 2 + (i + 0.5) * (w / n) + (row ? 0.08 : 0), 0, row ? -0.45 : 0.25);
      d.rotation.set((Math.random() - 0.5) * 0.25, Math.random() * 3, (Math.random() - 0.5) * 0.3);
      const s = 0.85 + Math.random() * 0.35;
      d.scale.set(s, s * (row ? 1.15 : 1), s);
      d.updateMatrix();
      im.setMatrixAt(k++, d.matrix);
    }
  }
  im.castShadow = true;
  return im;
}

// ================================================================ PROPS (background decor)
// Builders return [geometry, materialKey] pairs in prop-local space; they get merged per material.
const P = (geo, key, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) => {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  g.applyMatrix4(m);
  if (g.attributes.uv === undefined) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  return [g, key];
};
const flatG = (g) => { const n = g.toNonIndexed(); n.computeVertexNormals(); return n; };
const G = {
  cyl: (rt, rb, h, s = 12) => new THREE.CylinderGeometry(rt, rb, h, s),
  sph: (r, w = 14, h = 10) => new THREE.SphereGeometry(r, w, h),
  cone: (r, h, s = 10) => new THREE.ConeGeometry(r, h, s),
  box: (x, y, z) => new THREE.BoxGeometry(x, y, z),
  tor: (r, t, a = Math.PI * 2) => new THREE.TorusGeometry(r, t, 8, 24, a),
};
export const PROPS = {
  tube(r) { const t = r.range(-0.6, 0.6); return [P(G.cyl(0.5, 0.5, 2.6, 16), 'b', 0, 1.2, 0, 0, 0, t), P(new THREE.CircleGeometry(0.42, 16), 'd', -Math.sin(t) * 1.31, 1.2 + Math.cos(t) * 1.31, 0, -Math.PI / 2, 0, t), P(G.tor(0.5, 0.05), 't', -Math.sin(t) * 0.6, 1.2 + Math.cos(t) * 0.6, 0, Math.PI / 2, 0, t)]; },
  forkspire() { const o = [P(G.box(0.25, 3.2, 0.12), 'w', 0, 1.6, 0), P(G.box(0.9, 0.18, 0.12), 'w', 0, 3.2, 0)]; for (let i = 0; i < 4; i++) o.push(P(G.box(0.08, 1.2, 0.08), 'w', -0.4 + i * 0.27, 3.85, 0)); return o; },
  rock(r) { return [P(flatG(lumpy(1, 1, 0.25, r.range(0, 9), false)), 'b', 0, 0.6, 0, r.range(0, 3), r.range(0, 3), 0, r.range(0.8, 1.3), r.range(0.6, 1.0), 1)]; },
  mushroom(r) { const h = r.range(1.2, 2.6); return [P(G.cyl(0.18, 0.28, h), 'w', 0, h / 2, 0), P(new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), 't', 0, h, 0, 0, 0, 0, 1, 0.55, 1), P(new THREE.CircleGeometry(0.98, 16), 'g', 0, h - 0.01, 0, Math.PI / 2), P(G.sph(0.12), 'w', 0.4, h + 0.45, 0.3), P(G.sph(0.1), 'w', -0.5, h + 0.35, -0.1)]; },
  crystal(r) { const o = []; const n = r.int(3, 5); for (let i = 0; i < n; i++) { const k = new THREE.OctahedronGeometry(0.4, 0); o.push(P(k, i === 0 ? 'g' : 'a', r.range(-0.4, 0.4), 0.8, r.range(-0.3, 0.3), r.range(-0.3, 0.3), r.range(0, 3), r.range(-0.5, 0.5), r.range(0.5, 0.9), r.range(2, 4), r.range(0.5, 0.9))); } return o; },
  cabinet(r) { const o = [P(G.box(1.2, 2.6, 1), 'b', 0, 1.3, 0)]; for (let i = 0; i < 3; i++) { o.push(P(G.box(1.0, 0.04, 0.02), 'd', 0, 0.45 + i * 0.85, 0.51)); o.push(P(G.box(0.3, 0.08, 0.06), 'g', 0, 0.75 + i * 0.85, 0.52)); } return o; },
  paperstack(r) { const o = []; for (let i = 0; i < 8; i++) o.push(P(G.box(1.1, 0.12, 0.8), 'w', r.range(-0.1, 0.1), 0.06 + i * 0.14, 0, 0, r.range(-0.3, 0.3), 0)); return o; },
  jellyblob(r) { return [P(G.sph(1, 18, 12), 'a', 0, 0.6, 0, 0, 0, 0, r.range(0.9, 1.3), r.range(0.6, 1.0), 1), P(G.sph(0.25), 'g', 0.2, 1.3, 0.1)]; },
  yarnball() { return [P(G.sph(0.9), 'a', 0, 0.9, 0), P(G.tor(0.92, 0.05), 'b', 0, 0.9, 0, 0.6, 0, 0.3), P(G.tor(0.92, 0.05), 'b', 0, 0.9, 0, -0.4, 0.8, 0), P(G.tor(0.92, 0.05), 't', 0, 0.9, 0, 1.4, 0.2, 0.8)]; },
  knitpine(r) { const o = [P(G.cyl(0.15, 0.2, 0.8), 'b', 0, 0.4, 0)]; for (let i = 0; i < 3; i++) o.push(P(G.cone(1.1 - i * 0.28, 1.2, 12), 't', 0, 1.1 + i * 0.7, 0)); o.push(P(G.sph(0.22), 'w', 0, 3.1, 0)); return o; },
  tesla() { return [P(G.cyl(0.18, 0.35, 3.2), 'd', 0, 1.6, 0), P(G.tor(0.45, 0.07), 'b', 0, 1.0, 0, Math.PI / 2), P(G.tor(0.38, 0.07), 'b', 0, 1.8, 0, Math.PI / 2), P(G.tor(0.3, 0.07), 'b', 0, 2.5, 0, Math.PI / 2), P(G.sph(0.42), 'g', 0, 3.4, 0)]; },
  chromedrop(r) { const pts = []; for (let i = 0; i <= 10; i++) { const u = i / 10; pts.push(new THREE.Vector2(Math.sin(u * Math.PI) * 0.8 * Math.pow(1 - u, 0.6) + 0.001, u * 2.4)); } return [P(new THREE.LatheGeometry(pts, 16), 'w', 0, 0, 0)]; },
  spire(r) { const h = r.range(2.5, 5); return [P(G.cone(0.6, h, 7), 'b', 0, h / 2, 0), P(G.tor(0.45, 0.06), 'g', 0, h * 0.35, 0, Math.PI / 2), P(G.sph(0.15), 'g', 0, h, 0)]; },
  villi(r) { const o = []; for (let i = 0; i < 3; i++) { const h = r.range(1.2, 2.4); const x = (i - 1) * 0.5, t = r.range(-0.3, 0.3); o.push(P(new THREE.CapsuleGeometry(0.2, h, 4, 10), 'a', x, h / 2, r.range(-0.2, 0.2), 0, 0, t)); o.push(P(G.sph(0.24), 'g', x - Math.sin(t) * h * 0.55, h + 0.15, 0)); } return o; },
  ribs(r) { const o = []; for (let i = 0; i < 3; i++) o.push(P(G.tor(1.6, 0.16, Math.PI), 'b', 0, 0, i * 0.9 - 0.9)); o.push(P(G.cyl(0.18, 0.18, 2.4), 'b', 0, 1.6, 0, Math.PI / 2)); return o; },
  molar() { return [P(new RoundedBoxGeometry(1.4, 1.1, 1.2, 2, 0.35), 'w', 0, 1.0, 0), P(G.cone(0.25, 0.8), 'w', -0.35, 0.3, 0, Math.PI), P(G.cone(0.25, 0.8), 'w', 0.35, 0.3, 0, Math.PI)]; },
  speaker() { return [P(G.box(1.4, 2.2, 1), 'd', 0, 1.1, 0), P(new THREE.CircleGeometry(0.45, 20), 'g', 0, 1.45, 0.51), P(new THREE.CircleGeometry(0.28, 20), 'a', 0, 0.6, 0.51)]; },
  discoball() { return [P(flatG(new THREE.IcosahedronGeometry(0.8, 1)), 'w', 0, 2.4, 0), P(G.cyl(0.02, 0.02, 2), 'd', 0, 4.1, 0), P(G.sph(0.2), 'g', 0, 2.4, 0.75)]; },
  honeycomb(r) { const o = []; for (let i = 0; i < 4; i++) { const h = r.range(1, 3); const x = (i % 2) * 0.8 - 0.4, z = Math.floor(i / 2) * 0.7 - 0.35; o.push(P(G.cyl(0.45, 0.45, h, 6), 'b', x, h / 2, z)); o.push(P(G.cyl(0.4, 0.4, 0.05, 6), 't', x, h + 0.01, z)); } return o; },
  hourglass() { return [P(G.cyl(0.8, 0.8, 0.15, 16), 'b', 0, 0.08, 0), P(G.cyl(0.8, 0.8, 0.15, 16), 'b', 0, 2.6, 0), P(G.cone(0.65, 1.2, 16), 'g', 0, 0.75, 0), P(G.cone(0.65, 1.2, 16), 'a', 0, 1.95, 0, Math.PI)]; },
  clocktower() { return [P(G.box(1.2, 3.6, 1.2), 'b', 0, 1.8, 0), P(G.cyl(0.5, 0.5, 0.1, 24), 'w', 0, 2.8, 0.62, Math.PI / 2), P(G.cone(0.95, 1.2, 4), 't', 0, 4.2, 0, 0, Math.PI / 4), P(G.box(0.05, 0.35, 0.05), 'd', 0, 2.95, 0.68)]; },
  sockpile(r) { const o = []; for (let i = 0; i < 3; i++) { const k = ['a', 'b', 't'][i]; const x = r.range(-0.6, 0.6), ry = r.range(0, 3); o.push(P(new THREE.CapsuleGeometry(0.22, 0.9, 4, 10), k, x, 0.3 + i * 0.35, 0, 0, ry, Math.PI / 2 + r.range(-0.3, 0.3))); } return o; },
  pumpkin(r) { const s = r.range(0.6, 1.2); return [P(G.sph(1, 18, 12), 'b', 0, 0.75 * s, 0, 0, 0, 0, s, 0.75 * s, s), P(G.cyl(0.08, 0.12, 0.4), 't', 0, 1.6 * s, 0), P(G.cone(0.18, 0.22, 3), 'g', -0.3 * s, 0.9 * s, 0.92 * s, Math.PI / 2), P(G.cone(0.18, 0.22, 3), 'g', 0.3 * s, 0.9 * s, 0.92 * s, Math.PI / 2), P(G.box(0.6 * s, 0.1, 0.1), 'g', 0, 0.55 * s, 0.95 * s)]; },
  tombstone(r) { return [P(new RoundedBoxGeometry(1, 1.5, 0.3, 2, 0.3), 'd', 0, 0.7, 0, 0, 0, r.range(-0.2, 0.2)), P(G.box(0.5, 0.08, 0.05), 'g', 0, 1.0, 0.16)]; },
  cloudpuff(r) { const o = []; for (let i = 0; i < 5; i++) o.push(P(G.sph(r.range(0.5, 0.9), 14, 10), 'w', r.range(-1, 1), 0.6 + r.range(0, 0.6), r.range(-0.4, 0.4))); return o; },
};

// materials for merged props per world palette
export function propMaterials(pal) {
  return {
    b: toon(pal.body), t: toon(pal.top), a: toon(pal.accent, { emissive: pal.accent, emissiveIntensity: 0.12 }),
    w: toon(shade(pal.body, 0.25)), d: toon(shade(pal.fog, -0.15)),
    g: new THREE.MeshBasicMaterial({ color: new THREE.Color(pal.edge).multiplyScalar(1.05) }),
  };
}
function shade(hex, amt) {
  const c = new THREE.Color(hex);
  return amt > 0 ? c.lerp(new THREE.Color('#ffffff'), amt) : c.lerp(new THREE.Color('#000000'), -amt);
}

export class PropBatcher {
  constructor() { this.buckets = {}; }
  add(kind, r, x, y, z, s, ry = 0) {
    const fn = PROPS[kind] || PROPS.rock;
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(s, s, s));
    for (const [g, key] of fn(r)) {
      g.applyMatrix4(m);
      (this.buckets[key] ||= []).push(g);
    }
  }
  build(mats, { castShadow = false, receiveShadow = false } = {}) {
    const group = new THREE.Group();
    for (const [key, list] of Object.entries(this.buckets)) {
      if (!list.length) continue;
      const merged = mergeGeometries(list, false);
      list.forEach((g) => g.dispose());
      const mm = new THREE.Mesh(merged, mats[key]);
      mm.castShadow = castShadow; mm.receiveShadow = receiveShadow;
      group.add(mm);
    }
    this.buckets = {};
    return group;
  }
}

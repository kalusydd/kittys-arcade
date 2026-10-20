// PLANET:13 — Interdimensional Escape. Game controller: state machine, input, camera, stages.
import { THREE, createRenderer, Particles, tunnelMaterial, toon, GLSL_NOISE } from './gfx.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { Environment } from './env.js';
import { LevelRuntime } from './level.js';
import { generateExpedition } from './worldgen.js';
import { generateLevel } from './levelgen.js';
import { createCharacter, createArtifact, createPedestal } from './models.js';
import { CHARACTERS, REGISTRY } from './content.js';
import { audio } from './audio.js';
import { UI } from './ui.js';
import { hashString, PHYS, SEA_Y, damp, clamp, lerp } from './core.js';

const canvas = document.getElementById('gl');
const { renderer, scene, camera, composer, bloom, final, adapt } = createRenderer(canvas);
const env = new Environment(scene);
const fx = new Particles(2000, true);
const dust = new Particles(600, false);
scene.add(fx.points, dust.points);
const level = new LevelRuntime(scene, fx, dust);
const pickLine = (arr) => arr[Math.floor(Math.random() * arr.length)];

const P13_PAL = {
  sky: ['#04010f', '#4a0a7a'], band: '#3affe8', fog: '#1a0630', body: '#3a2a5a', top: '#c6ff3a', edge: '#3affe8',
  hazard: '#ff3ad1', accent: '#ff3ad1', light: '#ffe8ff', amb: '#5a3a8a',
};
const P13_CELESTIAL = { kind: 'ringed', a: '#c6ff3a', b: '#7a2aff', size: 1.1, ringTilt: 0.35 };

// ================================================================ stages
// --- wormhole tunnel (title, transitions, shop backdrop)
const tunnel = new THREE.Group();
const tunnelMesh = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 320, 64, 1, true), tunnelMaterial());
tunnelMesh.rotation.x = Math.PI / 2;
tunnelMesh.position.z = -150;
tunnel.add(tunnelMesh);
const tumblers = CHARACTERS.map((c, i) => {
  const m = createCharacter(c.key);
  m.root.position.set(Math.cos(i * 1.3) * 3.5, Math.sin(i * 1.7) * 2.5, -20 - i * 16);
  m.spin = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(2);
  tunnel.add(m.root);
  return m;
});
const tunnelLight = new THREE.PointLight('#ffffff', 40, 40, 1.5);
tunnelLight.position.set(0, 0, 2);
tunnel.add(tunnelLight);
scene.add(tunnel);

// --- customs dock (character select)
const dock = new THREE.Group();
const dockMat = toon('#2a1a4a', { emissive: '#3affe8', emissiveIntensity: 0.05 });
const dockBase = new THREE.Mesh(new RoundedBoxGeometry(19, 1.2, 6, 3, 0.4), dockMat);
dockBase.position.set(0, -0.6, -0.5); dockBase.receiveShadow = true; dockBase.castShadow = true;
dock.add(dockBase);
const trim = new THREE.Mesh(new THREE.BoxGeometry(19.2, 0.08, 0.08), new THREE.MeshBasicMaterial({ color: new THREE.Color('#3affe8').multiplyScalar(1.1) }));
trim.position.set(0, -0.05, 2.5); dock.add(trim);
const dockChars = CHARACTERS.map((c, i) => {
  const ped = createPedestal({ edge: c.color, accent: c.color });
  ped.position.set((i - 2) * 3.6, 0, 0);
  ped.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
  dock.add(ped);
  const m = createCharacter(c.key);
  m.root.position.set((i - 2) * 3.6, 0.46, 0);
  dock.add(m.root);
  return m;
});
const selRing = new THREE.Mesh(new THREE.RingGeometry(0.75, 1.0, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff3ad1').multiplyScalar(1.3), transparent: true, side: THREE.DoubleSide }));
selRing.rotation.x = -Math.PI / 2;
dock.add(selRing);
const selSpot = new THREE.SpotLight('#ffffff', 22, 14, 0.5, 0.6, 1.2);
selSpot.castShadow = false;
dock.add(selSpot, selSpot.target);
scene.add(dock);

// --- arrival at Planet:13
const finale = new THREE.Group();
scene.add(finale);
let finaleArtifacts = [];
let finaleChar = null;

// --- player
let player = null;
const shieldBubble = new THREE.Mesh(new THREE.SphereGeometry(0.9, 32, 20), new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color('#3affe8') } },
  vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vP; void main(){ vN = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position,1.0); vV = normalize(-mv.xyz); vP = position; gl_Position = projectionMatrix*mv; }`,
  fragmentShader: `varying vec3 vN; varying vec3 vV; varying vec3 vP; uniform float uTime; uniform vec3 uColor; ${GLSL_NOISE}
    void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 2.5); float hex = 0.5+0.5*sin(vP.y*30.0 + uTime*4.0)*sin(vP.x*26.0);
      float a = f * 0.9 + hex*0.05; gl_FragColor = vec4(uColor * a * 1.8, a); }`,
}));
shieldBubble.position.y = 0.6;

// ================================================================ state
const S = {
  state: 'boot', t: 0, seed: 0, worlds: [], levelIndex: 0, lives: 3, credits: 0, creditsAtStart: 0, shield: false,
  artifacts: [], creditsTotal: 0, deaths: 0, charIndex: 0, timer: 0, levelTime: 0,
};
const cam = { x: 0, y: 2, groundY: 0, look: 0, shake: 0, fly: null };
const input = { left: false, right: false, jumpHeld: false, jumpPressed: false };
const keys = new Set();

function setStage(name) {
  tunnel.visible = name === 'tunnel';
  dock.visible = name === 'dock';
  finale.visible = name === 'finale';
  if (level.group) level.group.visible = name === 'level';
  if (player) player.root.visible = name === 'level';
  env.sky.visible = name !== 'tunnel';
  env.celestial.visible = name !== 'tunnel';
  scene.fog.far = name === 'tunnel' ? 2000 : 150;
  scene.fog.near = name === 'tunnel' ? 1000 : 30;
  fx.clear(); dust.clear();
}

function playMenuMusic() { audio.playMusic({ scale: 'lydian', root: 57, bpm: 84, wave: 'triangle', calm: true, seed: 13 }); }

// ================================================================ flow
function toTitle() {
  S.state = 'title';
  document.getElementById('toasts').innerHTML = '';
  UI.hint('');
  setStage('tunnel');
  env.apply(P13_PAL, P13_CELESTIAL, { color: '#ffffff', motion: 'drift' });
  UI.show('title');
  playMenuMusic();
}

async function startExpedition() {
  S.seed = (Math.random() * 1e9) >>> 0;
  S.worlds = generateExpedition(S.seed);
  Object.assign(S, { levelIndex: 0, lives: 3, credits: 0, creditsAtStart: 0, shield: false, artifacts: [], creditsTotal: 0, deaths: 0 });
  S.state = 'intro';
  UI.show('intro');
  const term = UI.terms.intro;
  for (const line of REGISTRY.intro) {
    if (S.state !== 'intro') return;
    await term.say(line, { wait: true, next: '<span class="key">SPACE</span> continue' });
  }
  if (S.state === 'intro') toSelect();
}

function toSelect() {
  S.state = 'select';
  setStage('dock');
  env.apply(P13_PAL, P13_CELESTIAL, { color: '#c6ff3a', motion: 'drift' });
  UI.show('select');
  updateSelect(0);
  env.celestialScale = 34;
  cam.x = (S.charIndex - 2) * 3.6;
}
function updateSelect(d) {
  S.charIndex = (S.charIndex + d + CHARACTERS.length) % CHARACTERS.length;
  UI.setCharacter(CHARACTERS[S.charIndex], S.charIndex, CHARACTERS.length);
  if (d) audio.move();
  const c = new THREE.Color(CHARACTERS[S.charIndex].color);
  selRing.material.color.copy(c).multiplyScalar(1.3);
  dockChars[S.charIndex].hop = 0.0001;
}

function chooseCharacter() {
  const key = CHARACTERS[S.charIndex].key;
  if (player) { player.root.remove(shieldBubble); scene.remove(player.root); }
  player = createCharacter(key);
  player.root.add(shieldBubble);
  scene.add(player.root);
  audio.buy();
  transition(() => loadLevel(0));
}

function transition(fn, delay = 500) {
  UI.fade(true);
  setTimeout(() => { fn(); setTimeout(() => UI.fade(false), 80); }, delay);
}

function levelSeed(i) { return hashString(S.seed + ':level:' + i); }

function dangerList(w, L) {
  const f = L.features, p = w.predators, h = w.hazards;
  const items = [];
  if (f.has('walker')) items.push(p.walker.name);
  if (f.has('leaper')) items.push(p.leaper.name);
  if (f.has('flyer')) items.push(p.flyer.name);
  if (f.has('chaser')) items.push(p.chaser.name);
  if (f.has('spikes')) items.push(h.spikes.name);
  if (f.has('geyser')) items.push(h.geyser);
  if (f.has('crumble')) items.push(h.crumble);
  items.push(h.pool);
  const s = items.length > 1 ? items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1] : items[0];
  return s.charAt(0).toUpperCase() + s.slice(1) + '.';
}

function loadLevel(i) {
  S.levelIndex = i;
  const w = S.worlds[i];
  const L = generateLevel(i, levelSeed(i));
  level.build(w, L);
  env.apply(w.palette, w.celestial, w.particles);
  setStage('level');
  S.creditsAtStart = S.credits;
  placePlayer();
  // briefing: camera glides from the portal back to the start
  S.state = 'briefing';
  cam.fly = { t: 0, from: L.portal.x - 4, to: L.start.x + 6 };
  UI.briefing(w, i, dangerList(w, L), i === 9 ? REGISTRY.final : '');
  UI.show('briefing');
  audio.playMusic({ ...w.music, seed: hashString(w.name) });
  audio.duckMusic(true);
  updateHud();
}

function placePlayer() {
  const p = level.player;
  player.root.position.set(p.x, p.y, 0);
  player.root.scale.setScalar(player.baseScale);
  player.root.visible = true;
  cam.x = p.x + 4; cam.y = p.y + 2; cam.groundY = p.y; cam.look = 2;
}

function beginLevel() {
  S.state = 'playing';
  S.levelTime = 0;
  UI.show('hud');
  audio.duckMusic(false);
  UI.hint(S.levelIndex === 0 ? 'Find the artifact — follow the beam of light →' : '');
  if (S.levelIndex === 0) setTimeout(() => UI.hint(''), 6000);
  input.jumpPressed = false;
}

function updateHud() {
  UI.hud({ level: S.levelIndex, worldName: S.worlds[S.levelIndex]?.name || '', lives: S.lives, credits: S.credits, artifact: level.artifact?.taken, shield: S.shield });
}

// ---------------------------------------------------------------- level events
const screenPos = (x, y, z = 0) => {
  const v = new THREE.Vector3(x, y, z).project(camera);
  return { x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (-v.y * 0.5 + 0.5) * window.innerHeight, z: v.z };
};
level.on('jump', () => audio.jump());
level.on('land', () => audio.land());
level.on('bounce', () => audio.bounce());
level.on('crumble', () => audio.tone({ f: 120, f2: 60, type: 'sawtooth', dur: 0.4, vol: 0.06 }));
level.on('coin', (c) => {
  S.credits += c.value;
  if (c.mega) audio.mega(); else audio.coin(S.credits);
  const sp = screenPos(c.x, c.y + 0.4);
  UI.pop(sp.x, sp.y, c.mega ? '+5 P13' : '+1', c.mega);
  updateHud();
});
level.on('artifact', () => {
  S.state = 'artifact';
  audio.artifact();
  audio.duckMusic(true);
  cam.shake = 0.3;
  S.timer = 0;
  updateHud();
  setTimeout(() => {
    if (S.state !== 'artifact') return;
    UI.artifactCard(S.worlds[S.levelIndex]);
    UI.show('artifact', { keep: ['hud'] });
  }, 700);
});
level.on('locked', () => {
  audio.locked();
  UI.toast('PORTAL INACTIVE', 'warn', pickLine(REGISTRY.portalLocked), 2.6);
});
level.on('portal', () => {
  if (S.state !== 'playing') return;
  S.state = 'warp';
  S.timer = 0;
  audio.warp();
  UI.hint('');
});
level.on('hit', (kind) => {
  if (S.state !== 'playing') return;
  const p = level.player;
  if (S.shield) {
    S.shield = false;
    audio.shieldPop();
    fx.burst(p.x, p.y + 0.6, 0.3, 40, { color: [0.3, 1, 0.95], speed: 9, gravity: 0, size: 0.35, life: 0.6 });
    p.invuln = 1.8;
    if (kind === 'sea') { p.x = p.lastSafe.x; p.y = p.lastSafe.y + 0.05; p.vx = 0; p.vy = 0; }
    else { p.vy = 13; p.jumping = false; }
    cam.shake = 0.25;
    UI.toast('SHIELD ABSORBED THE IMPACT', '', 'You are, briefly, unkillable. Do not get used to it.', 2.4);
    updateHud();
    return;
  }
  die();
});

function die() {
  const p = level.player;
  S.state = 'dying';
  S.timer = 0;
  S.lives -= 1;
  S.deaths += 1;
  S.credits = S.creditsAtStart;
  p.dead = true;
  audio.die();
  cam.shake = 0.6;
  const col = new THREE.Color(CHARACTERS[S.charIndex].color);
  fx.burst(p.x, p.y + 0.6, 0.3, 60, { color: [col.r, col.g, col.b], speed: 10, gravity: 8, size: 0.45, life: 1.0 });
  dust.burst(p.x, p.y + 0.6, 0.3, 24, { color: [0.15, 0.1, 0.2], speed: 5, gravity: -1, size: 0.8, life: 1.0 });
  player.root.visible = false;
  updateHud();
}

function afterDeath() {
  if (S.lives <= 0) return toGameOver();
  level.reset();
  placePlayer();
  level.player.invuln = 1.0;
  S.state = 'playing';
  UI.toast(`LIFE LOST · ${S.lives} REMAINING`, 'warn', pickLine(REGISTRY.death) + (S.credits !== level.creditsThisRun ? ' Credits from this attempt were confiscated.' : ''), 3);
  updateHud();
}

function finishLevel() {
  S.creditsTotal += S.credits - S.creditsAtStart;
  S.artifacts.push(S.levelIndex);
  if (S.levelIndex >= 9) return toVictory();
  toShop();
}

// ---------------------------------------------------------------- shop
function toShop() {
  S.state = 'shop';
  setStage('tunnel');
  tunnelMesh.material.uniforms.uSpeed.value = 0.35;
  env.apply(P13_PAL, P13_CELESTIAL);
  UI.show('shop');
  refreshShop();
  UI.terms.shop.say(pickLine(REGISTRY.shopEnter));
  playMenuMusic();
}
function refreshShop() {
  const nw = S.worlds[S.levelIndex + 1];
  UI.shop({ credits: S.credits, lives: S.lives, shield: S.shield, nextLabel: `Next destination: <b>${nw.name}</b> · world ${S.levelIndex + 2} of 10` });
}
function buy(item) {
  const t = UI.terms.shop;
  if (item === 'life') {
    if (S.lives >= 3) { audio.deny(); return t.say(REGISTRY.full[0]); }
    if (S.credits < 25) { audio.deny(); return t.say(pickLine(REGISTRY.deny)); }
    S.credits -= 25; S.lives += 1; audio.buy(); t.say(pickLine(REGISTRY.buyLife));
  } else {
    if (S.shield) { audio.deny(); return t.say(REGISTRY.full[1]); }
    if (S.credits < 15) { audio.deny(); return t.say(pickLine(REGISTRY.deny)); }
    S.credits -= 15; S.shield = true; audio.buy(); t.say(pickLine(REGISTRY.buyShield));
  }
  refreshShop();
}
function leaveShop() {
  UI.terms.shop.say(pickLine(REGISTRY.leave));
  S.state = 'leaving';
  tunnelMesh.material.uniforms.uSpeed.value = 2.5;
  audio.warp();
  transition(() => loadLevel(S.levelIndex + 1), 900);
}

// ---------------------------------------------------------------- end screens
function toGameOver() {
  S.state = 'gameover';
  setStage('tunnel');
  tunnelMesh.material.uniforms.uSpeed.value = 0.15;
  UI.endScreen('gameover', { ...S, completed: S.levelIndex }, S.worlds);
  UI.show('gameover');
  UI.terms.gameover.say(pickLine(REGISTRY.gameOver));
  audio.stopMusic();
  audio.gameOver();
}

function toVictory() {
  S.state = 'victory';
  buildFinale();
  setStage('finale');
  env.apply({ ...P13_PAL, sky: ['#05011a', '#8a2aff'] }, { ...P13_CELESTIAL, size: 1.5 }, { color: '#c6ff3a', motion: 'rise' });
  UI.endScreen('victory', { ...S, completed: 10 }, S.worlds);
  UI.show('victory');
  UI.terms.victory.say(pickLine(REGISTRY.victory));
  audio.victory();
  setTimeout(() => audio.playMusic({ scale: 'major', root: 60, bpm: 122, wave: 'square', seed: 1313 }), 1400);
}

function buildFinale() {
  while (finale.children.length) finale.remove(finale.children[0]);
  const rockGeo = new THREE.IcosahedronGeometry(3, 2);
  const pos = rockGeo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i); const k = v.y > 1.5 ? 0.55 : 1 + Math.sin(v.x * 2) * Math.cos(v.z * 2) * 0.12; v.y *= v.y > 0 ? k : 1.1; pos.setXYZ(i, v.x, v.y, v.z); }
  rockGeo.computeVertexNormals();
  const rock = new THREE.Mesh(rockGeo, toon('#3a2a5a', { flatShading: true }));
  rock.position.y = -1.7; rock.receiveShadow = true;
  finale.add(rock);
  const grass = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.6, 0.2, 24), toon('#7ad22a', { emissive: '#3a8a1a', emissiveIntensity: 0.05 }));
  grass.position.y = -0.05; grass.receiveShadow = true;
  finale.add(grass);
  finaleChar = createCharacter(CHARACTERS[S.charIndex].key);
  finaleChar.root.position.set(0, 0.05, 0);
  finale.add(finaleChar.root);
  finaleArtifacts = S.worlds.map((w, i) => {
    const a = createArtifact(w.artifact.look, w.palette.accent);
    a.scale.setScalar(0.7);
    finale.add(a);
    return a;
  });
  const l = new THREE.PointLight('#ff3ad1', 14, 12, 1.4);
  l.position.set(0, 3, 3);
  finale.add(l);
}

// ================================================================ actions & input
UI.init({
  action(act) {
    audio.init();
    switch (act) {
      case 'start': if (S.state === 'title') startExpedition(); break;
      case 'howto': S.state = 'howto'; UI.show('howto'); break;
      case 'back': toTitle(); break;
      case 'prev': updateSelect(-1); break;
      case 'next': updateSelect(1); break;
      case 'choose': if (S.state === 'select') { S.state = 'chosen'; chooseCharacter(); } break;
      case 'begin': if (S.state === 'briefing') beginLevel(); break;
      case 'artok': if (S.state === 'artifact') startPortalCinematic(); break;
      case 'buylife': buy('life'); break;
      case 'buyshield': buy('shield'); break;
      case 'continue': if (S.state === 'shop') leaveShop(); break;
      case 'restart': transition(() => startExpedition()); break;
      case 'totitle': transition(() => toTitle()); break;
      case 'resume': togglePause(false); break;
      case 'restartlvl': togglePause(false); level.reset(); S.credits = S.creditsAtStart; placePlayer(); updateHud(); break;
      case 'quit': transition(() => toTitle()); break;
      case 'mute': audio.toggleMute(); UI.updateMute(); break;
    }
  },
});

function startPortalCinematic() {
  UI.show('hud');
  S.state = 'cinematic';
  S.timer = 0;
  level.artifact.anim = Math.max(level.artifact.anim, 3); // artifact absorbs into the ambassador
}

function togglePause(on) {
  if (on && S.state === 'playing') { S.state = 'paused'; UI.show('pause', { keep: ['hud'] }); audio.duckMusic(true); }
  else if (!on && S.state === 'paused') { S.state = 'playing'; UI.show('hud'); audio.duckMusic(false); }
}

const JUMP = ['Space', 'KeyW', 'ArrowUp'];
window.addEventListener('keydown', (e) => {
  audio.init();
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
  if (e.code === 'KeyM' && !e.repeat) { audio.toggleMute(); UI.updateMute(); return; }
  const st = S.state;
  if (st === 'playing' || st === 'paused') {
    if (e.code === 'Escape' || e.code === 'KeyP') { togglePause(st === 'playing'); return; }
    if (st === 'paused') { UI.navKey(e.code); return; }
    keys.add(e.code);
    if (JUMP.includes(e.code) && !e.repeat) input.jumpPressed = true;
    return;
  }
  if (e.repeat) return;
  if (st === 'intro') { if (['Space', 'Enter'].includes(e.code)) UI.terms.intro.advance(); if (e.code === 'Escape') toSelect(); return; }
  if (st === 'select') {
    if (['ArrowLeft', 'KeyA'].includes(e.code)) return updateSelect(-1);
    if (['ArrowRight', 'KeyD'].includes(e.code)) return updateSelect(1);
    if (['Enter', 'Space'].includes(e.code)) { S.state = 'chosen'; audio.click(); chooseCharacter(); }
    return;
  }
  if (st === 'shop' && ['Space', 'Enter'].includes(e.code) && UI.terms.shop.skip()) return;
  if (st === 'howto' && e.code === 'Escape') return toTitle();
  UI.navKey(e.code);
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
const TEST = location.search.includes('test');
window.addEventListener('blur', () => { keys.clear(); if (!TEST) togglePause(true); });
document.addEventListener('visibilitychange', () => { if (document.hidden && !TEST) togglePause(true); });

let padJumpPrev = false, padStartPrev = false, padNavPrev = 0;
function pollInput() {
  input.left = keys.has('KeyA') || keys.has('ArrowLeft');
  input.right = keys.has('KeyD') || keys.has('ArrowRight');
  input.jumpHeld = JUMP.some((k) => keys.has(k));
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const gp of pads) {
    if (!gp) continue;
    const ax = gp.axes[0] || 0;
    const l = ax < -0.35 || gp.buttons[14]?.pressed, r = ax > 0.35 || gp.buttons[15]?.pressed;
    const j = gp.buttons[0]?.pressed || gp.buttons[1]?.pressed;
    const st = gp.buttons[9]?.pressed;
    if (S.state === 'playing') {
      input.left ||= l; input.right ||= r; input.jumpHeld ||= j;
      if (j && !padJumpPrev) input.jumpPressed = true;
    } else {
      const nav = l ? -1 : r ? 1 : 0;
      if (nav && nav !== padNavPrev) {
        if (S.state === 'select') updateSelect(nav); else UI.navKey(nav > 0 ? 'ArrowDown' : 'ArrowUp');
      }
      padNavPrev = nav;
      if (j && !padJumpPrev) {
        if (S.state === 'intro') UI.terms.intro.advance();
        else if (S.state === 'select') { S.state = 'chosen'; chooseCharacter(); }
        else UI.navKey('Enter');
      }
    }
    if (st && !padStartPrev) togglePause(S.state === 'playing');
    padJumpPrev = j; padStartPrev = st;
    break;
  }
}

// ================================================================ frame loop
const STEP = 1 / 120;
let acc = 0, last = performance.now();
const tmpV = new THREE.Vector3();

function updateCameraPlaying(dt) {
  const p = level.player;
  cam.look = damp(cam.look, p.facing * 2.6 + p.vx * 0.12, 2.5, dt);
  const tx = p.x + cam.look;
  if (p.grounded) cam.groundY = p.y;
  let ty = cam.groundY + 1.6;
  if (p.y > ty + 2.6) ty = p.y - 2.6;
  if (p.y < ty - 3.2) ty = p.y + 3.2;
  ty = Math.max(ty, SEA_Y + 3.2);
  cam.x = damp(cam.x, tx, 5, dt);
  cam.y = damp(cam.y, ty, 3.2, dt);
  const B = level.L.bounds;
  cam.x = clamp(cam.x, B.minX + 8, B.maxX - 8);
}
function applyCamera(x, y, z, lx, ly, lz) {
  const s = cam.shake;
  const sx = s > 0 ? (Math.random() - 0.5) * s : 0, sy = s > 0 ? (Math.random() - 0.5) * s : 0;
  camera.position.set(x + sx, y + sy, z);
  camera.lookAt(lx + sx * 0.5, ly + sy * 0.5, lz);
}

function updatePointer() {
  if (!level.artifact || S.state !== 'playing') return UI.pointer(null);
  const A = level.artifact;
  const target = !A.taken ? { x: A.x, y: A.y, label: 'ARTIFACT', color: '#ffd23a' } : { x: level.portal.x, y: level.portal.y, label: 'PORTAL', color: '#3affe8' };
  const sp = screenPos(target.x, target.y);
  const W = window.innerWidth, H = window.innerHeight, m = 50;
  if (sp.x > m && sp.x < W - m && sp.y > 90 && sp.y < H - m) return UI.pointer(null);
  const cx = W / 2, cy = H / 2;
  const dx = sp.x - cx, dy = sp.y - cy;
  const k = Math.min((W / 2 - m) / Math.abs(dx || 1e-3), (H / 2 - m - 40) / Math.abs(dy || 1e-3));
  UI.pointer({ x: cx + dx * k, y: cy + dy * k + 20, angle: Math.atan2(dy, dx) + Math.PI / 2, label: target.label, color: target.color });
}

function frame(now) {
  requestAnimationFrame(frame);
  tick(now);
}
function tick(now) {
  let dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  adapt(dt);
  S.t += dt;
  const t = S.t;
  pollInput();
  UI.tick(dt, t);
  cam.shake = Math.max(0, cam.shake - dt * 1.5);
  final.uniforms.uTime.value = t;
  let focus = null;

  const st = S.state;
  if (tunnel.visible) {
    tunnelMesh.material.uniforms.uTime.value = t;
    const speed = tunnelMesh.material.uniforms.uSpeed.value;
    tumblers.forEach((m, i) => {
      m.root.position.z += dt * (8 + i * 1.5) * Math.max(0.3, speed);
      if (m.root.position.z > 8) m.root.position.z = -90 - Math.random() * 20;
      m.root.rotation.x += m.spin.x * dt; m.root.rotation.z += m.spin.z * dt;
      m.update(dt, { vx: 0, vy: Math.sin(t * 3 + i) * 10, grounded: false, facing: 1, run: 0.5 });
      m.root.rotation.y += m.spin.y * dt;
    });
    tunnelMesh.rotation.y = t * 0.1;
    applyCamera(Math.sin(t * 0.4) * 0.6, Math.cos(t * 0.3) * 0.4, 6, 0, 0, -60);
    focus = { x: 0, y: 0, z: 0 };
  }

  if (dock.visible) {
    const tx = (S.charIndex - 2) * 3.6;
    cam.x = damp(cam.x, tx, 6, dt);
    applyCamera(cam.x, 2.0, 9.5, cam.x, 1.0, 0);
    selRing.position.set(tx, 0.48, 0);
    selRing.rotation.z = t;
    selSpot.position.set(tx, 7, 4); selSpot.target.position.set(tx, 0.5, 0);
    dockChars.forEach((m, i) => {
      const sel = i === S.charIndex;
      let vy = 0, grounded = true, landed = 0;
      if (m.hop) {
        m.hop += dt;
        const ht = m.hop;
        const y = 9 * ht - 16 * ht * ht;
        if (y <= 0 && ht > 0.1) { m.hop = 0; landed = 14; m.root.position.y = 0.46; }
        else { m.root.position.y = 0.46 + Math.max(0, y); vy = 9 - 32 * ht; grounded = false; }
      } else if (sel && Math.sin(t * 1.3) > 0.995) m.hop = 0.0001;
      const s = (sel ? 1.15 : 0.85) * m.baseScale;
      m.root.scale.setScalar(damp(m.root.scale.x, s, 8, dt));
      m.update(dt, { vx: 0, vy, grounded, landed, facing: sel ? Math.sin(t * 0.8) > 0 ? 0.5 : -0.5 : (i < S.charIndex ? 1 : -1) * 0.6, run: 0 });
    });
    focus = { x: cam.x, y: 0, z: 0 };
    env.celestialOffset.set(70, 26, -330);
  }

  if (finale.visible) {
    const a = t * 0.15;
    applyCamera(Math.sin(a) * 12, 4.2, Math.cos(a) * 12, 0, 1.6, 0);
    finaleArtifacts.forEach((m, i) => {
      const k = (i / 10) * Math.PI * 2 + t * 0.4;
      m.position.set(Math.cos(k) * 3.2, 1.6 + Math.sin(t * 2 + i) * 0.35, Math.sin(k) * 3.2);
      m.rotation.y = t * 1.5 + i;
    });
    if (finaleChar) {
      const hop = Math.max(0, Math.sin(t * 3));
      finaleChar.root.position.y = 0.05 + hop * 0.8;
      finaleChar.update(dt, { vx: 0, vy: Math.cos(t * 3) * 8, grounded: hop < 0.05, landed: hop < 0.05 ? 4 : 0, facing: Math.sin(t) > 0 ? 1 : -1, run: 0.3 });
      finaleChar.root.rotation.y = Math.atan2(camera.position.x, camera.position.z);
    }
    if (Math.random() < 0.6) {
      const c = new THREE.Color().setHSL(Math.random(), 1, 0.6);
      fx.emit((Math.random() - 0.5) * 10, 7, (Math.random() - 0.5) * 6, { color: [c.r, c.g, c.b], dir: [0, -2, 0], spread: 2, gravity: 2, drag: 0.5, size: 0.3, life: 3 });
    }
    focus = { x: 0, y: 0, z: 0 };
    env.celestialOffset.set(-120, 60, -380);
  }

  if (level.group && level.group.visible) {
    env.celestialOffset.set(45, 60, -330);
    const p = level.player;
    p.frozen = st !== 'playing';
    if (st === 'playing') {
      acc += dt;
      S.levelTime += dt;
      let steps = 0;
      while (acc >= STEP && steps < 8) {
        level.step(STEP, input);
        input.jumpPressed = false;
        acc -= STEP; steps++;
        if (S.state !== 'playing') break;
      }
      if (steps >= 8) acc = 0;
    } else {
      acc = 0;
      if (st !== 'paused') level.step(dt, { left: false, right: false, jumpHeld: false, jumpPressed: false });
    }

    // timers for transient states
    if (st === 'dying') { S.timer += dt; if (S.timer > 1.6) afterDeath(); }
    if (st === 'cinematic') {
      S.timer += dt;
      const T = S.timer;
      if (T > 0.9 && !level.portal.active) { level.activatePortal(); audio.portalOn(); cam.shake = 0.3; }
      if (T > 2.6) { S.state = 'playing'; audio.duckMusic(false); UI.toast('THE PORTAL HAS AWAKENED', 'gold', 'Reach the wormhole to leave this world.', 2.6); updateHud(); }
    }
    if (st === 'warp') {
      S.timer += dt;
      const k = Math.min(1, S.timer / 1.4);
      const P = level.portal;
      tmpV.set(P.x, P.y - 0.6, 0);
      player.root.position.lerp(tmpV, Math.min(1, dt * 4));
      player.root.scale.setScalar(player.baseScale * Math.max(0.01, 1 - k));
      player.root.rotation.z += dt * 12 * k;
      final.uniforms.uWarp.value = k * k;
      if (S.timer > 1.5 && S.state === 'warp') {
        S.state = 'warped';
        UI.fade(true);
        setTimeout(() => { final.uniforms.uWarp.value = 0; player.root.rotation.z = 0; finishLevel(); UI.fade(false); }, 450);
      }
    }

    if (st === 'briefing' && cam.fly) {
      cam.fly.t += dt;
      const u = (Math.sin(cam.fly.t * 0.12 - Math.PI / 2) + 1) / 2;
      const x = lerp(cam.fly.from, cam.fly.to, u);
      applyCamera(x - 4, 5.5, 30, x, 2.0, 0);
      cam.x = p.x + 4; cam.y = p.y + 2;
    } else if (st === 'cinematic') {
      const T = S.timer;
      const P = level.portal;
      const u = T < 1.0 ? T / 1.0 : T < 1.8 ? 1 : 1 - (T - 1.8) / 0.8;
      const e = u * u * (3 - 2 * u);
      const px = lerp(cam.x, P.x, e), py = lerp(cam.y, P.y, e);
      applyCamera(px, py + 2.0 - e * 0.6, 20 - e * 5, px, py + 0.6, 0);
    } else {
      if (st === 'playing') updateCameraPlaying(dt);
      applyCamera(cam.x, cam.y + 2.0, 20, cam.x, cam.y + 0.6, 0);
    }

    // player visual
    if (player && !p.dead && st !== 'warp' && st !== 'warped') {
      player.root.position.set(p.x, p.y, 0);
      player.update(dt, { vx: p.vx, vy: p.vy, grounded: p.grounded, facing: p.facing, run: Math.abs(p.vx) / PHYS.RUN, landed: p.landed });
      player.root.visible = !(p.invuln > 0 && Math.floor(t * 16) % 2 === 0);
      if (CHARACTERS[S.charIndex].key === 'zzzorp' && Math.random() < 0.12 + Math.abs(p.vx) * 0.02) {
        fx.emit(p.x + (Math.random() - 0.5) * 0.5, p.y + 0.4 + Math.random() * 0.8, 0.2, { color: [0.5, 1, 1], speed: 4, gravity: 0, size: 0.18, life: 0.25 });
      }
    } else if (player && st === 'warp') {
      player.update(dt, { vx: 0, vy: 5, grounded: false, facing: 1, run: 0 });
    }
    shieldBubble.visible = S.shield;
    shieldBubble.material.uniforms.uTime.value = t;
    level.render(dt, t, camera);
    focus = { x: p.x, y: p.y, z: 0 };
    updatePointer();
  } else UI.pointer(null);

  fx.update(dt); dust.update(dt);
  env.update(dt, t, camera, focus);
  composer.render();
}

// ================================================================ boot
requestAnimationFrame((n) => { last = n; frame(n); });
document.fonts?.ready.then(() => {}).catch(() => {});
toTitle();
setTimeout(() => UI.hideLoading(), 300);

// debug hooks for automated testing
window.__P13 = {
  S, level, get player() { return level.player; },
  jumpTo(i) { if (!S.worlds.length) { S.seed = 1; S.worlds = generateExpedition(1); } if (!player) { player = createCharacter(CHARACTERS[S.charIndex].key); player.root.add(shieldBubble); scene.add(player.root); } loadLevel(i); },
  begin: beginLevel,
  // deterministic simulation for automated tests: steps physics, then renders one frame
  sim(seconds, fn) {
    const n = Math.round(seconds / STEP);
    for (let i = 0; i < n && S.state === 'playing'; i++) {
      const p = level.player;
      Object.assign(input, { left: false, right: false, jumpHeld: false, jumpPressed: false }, fn ? fn(i * STEP, p, level) : {});
      level.step(STEP, input);
      S.levelTime += STEP;
    }
    for (const k of Object.keys(input)) input[k] = false;
    const p = level.player;
    cam.x = clamp(p.x + p.facing * 2.6, level.L.bounds.minX + 9, level.L.bounds.maxX - 9); cam.y = Math.max(p.y + 1.6, SEA_Y + 3.2);
    return { state: S.state, x: +p.x.toFixed(2), y: +p.y.toFixed(2), grounded: p.grounded, credits: S.credits, lives: S.lives };
  },
  audio,
  // render n frames synchronously (test screenshots while the tab is throttled)
  frames(n = 1, dt = 1 / 60) { for (let i = 0; i < n; i++) { last -= dt * 1000; tick(performance.now()); } return S.state; },
};

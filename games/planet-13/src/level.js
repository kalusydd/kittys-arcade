// Level runtime: builds the 3D world from (world record, level layout) and runs the simulation.
import { THREE, platformMaterial, seaMaterial, geyserMaterial, toon } from './gfx.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { PHYS, SEA_Y, RNG, clamp, lerp } from './core.js';
import {
  createEnemy, createCoin, createArtifact, createPortal, createBeam, createPedestal, createBouncer,
  createSpikes, PropBatcher, propMaterials,
} from './models.js';

const TAU = Math.PI * 2;
const LEAP_G = 26;

function rgb(hex) { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; }

export class LevelRuntime {
  constructor(scene, fx, dust) {
    this.scene = scene;
    this.fx = fx;
    this.dust = dust;
    this.group = null;
    this.events = {};
  }
  on(name, fn) { this.events[name] = fn; }
  emit(name, ...a) { if (this.events[name]) this.events[name](...a); }

  dispose() {
    if (!this.group) return;
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
    });
    this.group = null;
  }

  build(world, layout) {
    this.dispose();
    this.world = world;
    this.L = layout;
    const pal = world.palette;
    this.pal = pal;
    const g = (this.group = new THREE.Group());
    this.scene.add(g);
    const r = new RNG(layout.decorSeed);

    // ---------- materials
    this.mats = {
      ground: platformMaterial(pal, world.terrain, 0),
      float: platformMaterial(pal, world.terrain, 1),
      moving: platformMaterial(pal, world.terrain, 3),
    };

    // ---------- solids
    this.solids = layout.solids.map((s) => ({ ...s, active: true, dx: 0, dy: 0, bx: s.x, by: s.y, state: 'idle', timer: 0 }));
    for (const s of this.solids) {
      const depth = s.kind === 'ground' || s.kind === 'wall' ? 5 : 2.4;
      const geo = new RoundedBoxGeometry(s.w, s.h, depth, 2, Math.min(0.24, s.h * 0.3, s.w * 0.3));
      geo.translate(0, -s.h / 2, 0);
      let mat = this.mats.ground;
      if (s.kind === 'float') mat = this.mats.float;
      if (s.kind === 'moving') mat = this.mats.moving;
      if (s.kind === 'crumble') { mat = platformMaterial(pal, world.terrain, 2); }
      const m = new THREE.Mesh(geo, mat);
      m.position.set(s.x + s.w / 2, s.y + s.h, depth === 5 ? -0.6 : 0);
      m.receiveShadow = true;
      m.castShadow = s.kind !== 'ground' && s.kind !== 'wall';
      if (s.kind === 'ground' || s.kind === 'wall') m.castShadow = true;
      g.add(m);
      s.mesh = m;
      s.z = m.position.z;
    }
    this.movers = this.solids.filter((s) => s.move);
    this.crumbles = this.solids.filter((s) => s.kind === 'crumble');

    // ---------- sea
    const len = layout.length;
    const seaGeo = new THREE.PlaneGeometry(len + 500, 150, Math.ceil((len + 500) / 2.5), 40);
    seaGeo.rotateX(-Math.PI / 2);
    this.sea = new THREE.Mesh(seaGeo, seaMaterial(pal.hazard, pal.fog));
    this.sea.position.set(len / 2, SEA_Y, -62);
    g.add(this.sea);

    // ---------- hazards
    this.hazards = layout.hazards.map((h) => ({ ...h }));
    for (const h of this.hazards) {
      if (h.type === 'spikes') {
        const sp = world.hazards.spikes;
        const im = createSpikes(sp.look, sp.color, h.w, pal.edge);
        im.position.set(h.x + h.w / 2, h.y, 0);
        g.add(im);
      } else if (h.type === 'geyser') {
        const vent = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.9, 0.3, 14), toon('#1a1024', { emissive: pal.hazard, emissiveIntensity: 0.0 }));
        vent.position.set(h.x + h.w / 2, h.y + 0.12, 0);
        vent.castShadow = true;
        g.add(vent);
        const cg = new THREE.CylinderGeometry(0.65, 0.5, h.h, 18, 1, true);
        cg.translate(0, h.h / 2, 0);
        const col = new THREE.Mesh(cg, geyserMaterial(pal.hazard));
        col.position.set(h.x + h.w / 2, h.y + 0.2, 0);
        g.add(col);
        h.vent = vent; h.col = col; h.on = h.on; h.active = false;
      }
    }

    // ---------- bouncers
    this.bouncers = layout.bouncers.map((b) => {
      const v = createBouncer(pal);
      v.root.position.set(b.x + b.w / 2, b.y, 0);
      g.add(v.root);
      return { ...b, view: v, squish: 0 };
    });

    // ---------- coins
    this.coinViews = layout.coins.map((c) => {
      const m = createCoin(c.mega);
      m.position.set(c.x, c.y, 0);
      g.add(m);
      return { ...c, mesh: m, taken: false };
    });

    // ---------- enemies
    this.enemies = layout.enemies.map((e) => {
      const pred = world.predators[e.type] || world.predators.walker;
      const model = createEnemy(pred.look, pred.color);
      g.add(model.root);
      return { def: e, model, x: e.x, y: e.y, vx: 0, vy: 0, dir: e.dir || 1, visible: true, splashed: false };
    });

    // ---------- artifact
    const art = layout.artifact;
    this.artifact = { x: art.x, y: art.y, taken: false, anim: 0 };
    const ped = createPedestal(pal);
    ped.position.set(art.x, art.y - 1.3, 0);
    // pedestal sits on the platform the artifact floats above
    g.add(ped);
    this.artifactMesh = createArtifact(world.artifact.look, pal.accent);
    this.artifactMesh.position.set(art.x, art.y, 0);
    this.artifactMesh.scale.setScalar(1.25);
    g.add(this.artifactMesh);
    this.artifactBeam = createBeam(pal.accent, 30, 0.9);
    this.artifactBeam.position.set(art.x, art.y - 1.3, -0.3);
    g.add(this.artifactBeam);
    this.artifactLight = new THREE.PointLight(pal.accent, 18, 9, 1.6);
    this.artifactLight.position.set(art.x, art.y + 0.5, 1.5);
    g.add(this.artifactLight);

    // ---------- portal
    this.portal = { ...layout.portal, active: false, level: 0 };
    this.portalView = createPortal(pal);
    this.portalView.root.position.set(this.portal.x, this.portal.y, -0.4);
    g.add(this.portalView.root);
    this.portalLight = new THREE.PointLight(pal.accent, 6, 14, 1.5);
    this.portalLight.position.set(this.portal.x, this.portal.y, 2);
    g.add(this.portalLight);

    // ---------- decor
    this.buildDecor(r, pal, world, layout);

    this.reset();
  }

  buildDecor(r, pal, world, layout) {
    const mats = propMaterials(pal);
    const decor = world.decor;
    const len = layout.length;
    // surface decor along walkable ground, behind the play lane
    const near = new PropBatcher();
    for (const s of layout.segments) {
      if (!s.ground) continue;
      for (let x = s.x0 + r.range(0.5, 2); x < s.x1 - 0.5; x += r.range(2.2, 4.5)) {
        near.add(r.pick(decor), r, x, s.y, r.range(-2.9, -2.2), r.range(0.28, 0.55), r.range(0, TAU));
      }
    }
    this.group.add(near.build(mats, { castShadow: false, receiveShadow: true }));
    // mid layer: islands rising from the sea, crowned with props
    const mid = new PropBatcher();
    for (let x = -30; x < len + 40; x += r.range(7, 13)) {
      const z = r.range(-17, -40), s = r.range(3.5, 6.5);
      mid.add('rock', r, x, SEA_Y - s * 0.5, z, s, r.range(0, TAU));
      const top = SEA_Y + s * 0.35;
      mid.add(r.pick(decor), r, x + r.range(-1, 1), top, z + r.range(-1, 1), r.range(1.3, 2.4), r.range(0, TAU));
      if (r.chance(0.35)) mid.add(r.pick(decor), r, x + r.range(-3, 3), SEA_Y - 0.3, z + 4, r.range(1.0, 1.8), r.range(0, TAU));
    }
    this.group.add(mid.build(mats));
    // far layer: giant silhouettes of the world's signature forms
    const far = new PropBatcher();
    for (let x = -120; x < len + 140; x += r.range(14, 26)) {
      far.add(world.far, r, x, SEA_Y - 2, r.range(-70, -115), r.range(6, 14), r.range(0, TAU));
      if (r.chance(0.4)) far.add('rock', r, x + 8, SEA_Y - 8, r.range(-80, -120), r.range(10, 18), r.range(0, TAU));
    }
    this.group.add(far.build(mats));
    // foreground silhouettes below the play lane for depth
    const fore = new PropBatcher();
    for (let x = -10; x < len + 20; x += r.range(16, 30)) fore.add(r.pick(decor), r, x, SEA_Y - 1.2, r.range(5, 7), r.range(0.8, 1.4), r.range(0, TAU));
    this.group.add(fore.build(mats));
  }

  // full restart of the current level (same layout)
  reset() {
    this.time = 0;
    for (const s of this.solids) {
      s.x = s.bx; s.y = s.by; s.active = true; s.state = 'idle'; s.timer = 0; s.dx = s.dy = 0;
      if (s.mesh) { s.mesh.visible = true; s.mesh.position.set(s.x + s.w / 2, s.y + s.h, s.z); s.mesh.rotation.z = 0; if (s.kind === 'crumble') s.mesh.material.userData.uniforms.uShake.value = 0; }
    }
    for (const c of this.coinViews) { c.taken = false; c.mesh.visible = true; c.mesh.scale.setScalar(c.mega ? 1.6 : 1); c.mesh.position.set(c.x, c.y, 0); }
    for (const e of this.enemies) { e.x = e.def.x; e.y = e.def.y; e.dir = e.def.dir || 1; e.vx = 0; }
    this.artifact.taken = false; this.artifact.anim = 0;
    this.artifactMesh.visible = true; this.artifactMesh.position.set(this.artifact.x, this.artifact.y, 0); this.artifactMesh.scale.setScalar(1.25);
    this.artifactBeam.visible = true; this.artifactLight.visible = true;
    this.portal.active = false; this.portal.level = 0;
    const st = this.L.start;
    this.player = {
      x: st.x, y: st.y, vx: 0, vy: 0, grounded: true, coyote: 0, buffer: 0, facing: 1, standing: null,
      jumping: false, invuln: 0, landed: 0, lastSafe: { x: st.x, y: st.y }, dead: false, frozen: false,
    };
    this.lockedCooldown = 0;
    this.creditsThisRun = 0;
  }

  activatePortal() { this.portal.active = true; }

  // ---------------------------------------------------------------- simulation
  step(dt, input) {
    this.time += dt;
    const t = this.time;
    const p = this.player;

    // moving platforms
    for (const s of this.movers) {
      const m = s.move;
      const u = 0.5 - 0.5 * Math.cos(TAU * (t / m.period + m.phase));
      const nx = lerp(m.ax, m.bx, u), ny = lerp(m.ay, m.by, u);
      s.dx = nx - s.x; s.dy = ny - s.y; s.x = nx; s.y = ny;
    }
    // crumbling platforms
    for (const s of this.crumbles) {
      if (s.state === 'shaking') { s.timer -= dt; if (s.timer <= 0) { s.state = 'falling'; s.active = false; s.timer = 2.8; } }
      else if (s.state === 'falling') {
        s.timer -= dt;
        if (s.timer <= 0) {
          const over = p.x + PHYS.PW / 2 > s.bx && p.x - PHYS.PW / 2 < s.bx + s.w && p.y < s.by + s.h + 1.5 && p.y + PHYS.PH > s.by;
          if (!over) { s.state = 'idle'; s.active = true; s.y = s.by; }
        }
      }
    }
    if (p.dead || p.frozen) { this.stepEnemies(dt, t); return; }

    // carry with the platform we stand on
    if (p.standing && (p.standing.dx || p.standing.dy)) { p.x += p.standing.dx; p.y += p.standing.dy; }

    // horizontal input
    const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const accel = p.grounded ? PHYS.ACCEL_G : PHYS.ACCEL_A;
    if (dir) {
      const turning = Math.sign(p.vx) !== dir && p.vx !== 0;
      p.vx += dir * accel * (turning ? 1.9 : 1) * dt;
      p.vx = clamp(p.vx, -PHYS.RUN, PHYS.RUN);
      p.facing = dir;
    } else {
      const dec = (p.grounded ? PHYS.DECEL_G : PHYS.DECEL_A) * dt;
      p.vx = Math.abs(p.vx) <= dec ? 0 : p.vx - Math.sign(p.vx) * dec;
    }

    // jumping with buffer + coyote time
    p.buffer = input.jumpPressed ? PHYS.BUFFER : p.buffer - dt;
    p.coyote = p.grounded ? PHYS.COYOTE : p.coyote - dt;
    if (p.buffer > 0 && p.coyote > 0) {
      p.vy = PHYS.VJ; p.buffer = 0; p.coyote = 0; p.grounded = false; p.standing = null; p.jumping = true;
      this.emit('jump');
      this.dust.burst(p.x, p.y + 0.05, 0.3, 8, { color: rgb(this.pal.top), speed: 3, gravity: 2, size: 0.35, life: 0.45, flatZ: 0.3 });
    }
    if (p.jumping && !input.jumpHeld && p.vy > 0) { p.vy *= PHYS.JUMP_CUT; p.jumping = false; }
    if (p.vy <= 0) p.jumping = false;
    p.vy -= (p.vy > 0 ? PHYS.GU : PHYS.GD) * dt;
    if (p.vy < -PHYS.MAXFALL) p.vy = -PHYS.MAXFALL;

    const wasGrounded = p.grounded, vyBefore = p.vy;
    // X
    p.x += p.vx * dt;
    this.resolveX(p);
    // Y
    const prevY = p.y;
    p.y += p.vy * dt;
    this.resolveY(p, prevY);
    if (p.x < this.L.bounds.minX + PHYS.PW / 2) { p.x = this.L.bounds.minX + PHYS.PW / 2; p.vx = 0; }

    if (p.grounded && !wasGrounded) {
      p.landed = -vyBefore;
      if (-vyBefore > 8) {
        this.emit('land');
        this.dust.burst(p.x, p.y + 0.05, 0.3, 10, { color: rgb(this.pal.top), speed: 4, gravity: 1, size: 0.4, life: 0.5, flatZ: 0.3 });
      }
    } else p.landed = 0;

    if (p.grounded && p.standing) {
      const s = p.standing;
      if (s.kind === 'crumble' && s.state === 'idle') { s.state = 'shaking'; s.timer = 0.5; this.emit('crumble'); }
      if (s.kind === 'ground' && p.x - PHYS.PW / 2 >= s.x && p.x + PHYS.PW / 2 <= s.x + s.w) p.lastSafe = { x: p.x, y: p.y };
    }

    // bouncers
    for (const b of this.bouncers) {
      if (p.vy <= 0.1 && Math.abs(p.x - (b.x + b.w / 2)) < b.w / 2 + 0.15 && p.y <= b.y + 0.5 && p.y >= b.y - 0.2) {
        p.vy = b.power; p.grounded = false; p.standing = null; p.jumping = false; p.coyote = 0;
        b.squish = 1;
        this.emit('bounce');
        this.fx.burst(b.x + b.w / 2, b.y + 0.4, 0.3, 18, { color: rgb(this.pal.accent), speed: 6, gravity: 4, size: 0.4, life: 0.6 });
      }
    }

    this.stepEnemies(dt, t);
    if (p.invuln > 0) p.invuln -= dt;

    // collectibles
    const cx = p.x, cy = p.y + PHYS.PH / 2;
    for (const c of this.coinViews) {
      if (c.taken) continue;
      const rr = c.mega ? 1.05 : 0.78;
      if (Math.abs(c.x - cx) < rr && Math.abs(c.y - cy) < rr + 0.2) {
        c.taken = true;
        this.creditsThisRun += c.value;
        this.emit('coin', c);
        this.fx.burst(c.x, c.y, 0.2, c.mega ? 40 : 14, { color: c.mega ? [1, 0.5, 1] : [1, 0.82, 0.25], speed: c.mega ? 8 : 5, gravity: 3, size: 0.3, life: 0.6 });
      }
    }
    const A = this.artifact;
    if (!A.taken && Math.abs(A.x - cx) < 1.1 && Math.abs(A.y - cy) < 1.3) {
      A.taken = true; A.anim = 0.0001;
      this.artifactBeam.visible = false;
      this.fx.burst(A.x, A.y, 0.3, 80, { color: rgb(this.pal.accent), speed: 10, gravity: 0, size: 0.5, life: 1.2, drag: 2 });
      this.fx.burst(A.x, A.y, 0.3, 40, { color: [1, 1, 1], speed: 6, gravity: -1, size: 0.3, life: 1.0 });
      this.emit('artifact');
    }
    // portal
    const P = this.portal;
    this.lockedCooldown -= dt;
    if (Math.abs(p.x - P.x) < 1.2 && p.y > P.y - 2.8 && p.y < P.y + 1.4) {
      if (P.active) { this.emit('portal'); }
      else if (this.lockedCooldown <= 0) { this.lockedCooldown = 3; this.emit('locked'); }
    }

    // hazards
    if (p.invuln <= 0) {
      if (p.y < SEA_Y + 0.15) return this.emit('hit', 'sea');
      for (const h of this.hazards) {
        if (h.type === 'spikes' && p.x + 0.3 > h.x + 0.1 && p.x - 0.3 < h.x + h.w - 0.1 && p.y < h.y + 0.55 && p.y + 1.0 > h.y) return this.emit('hit', 'spikes');
        if (h.type === 'geyser' && h.active && p.x + 0.3 > h.x + 0.2 && p.x - 0.3 < h.x + h.w - 0.2 && p.y < h.y + h.h && p.y + 1.0 > h.y) return this.emit('hit', 'geyser');
      }
      for (const e of this.enemies) {
        if (!e.visible) continue;
        const rad = e.def.type === 'walker' ? 0.36 : 0.34;
        const ey = e.def.type === 'walker' ? e.y + 0.42 : e.y;
        const nx = clamp(e.x, p.x - 0.3, p.x + 0.3), ny = clamp(ey, p.y + 0.1, p.y + 1.0);
        if ((nx - e.x) ** 2 + (ny - ey) ** 2 < rad * rad) return this.emit('hit', 'enemy', e);
      }
    } else if (p.y < SEA_Y + 0.15) {
      return this.emit('hit', 'sea');
    }
    if (p.y < SEA_Y - 6) this.emit('hit', 'sea');
  }

  resolveX(p) {
    const hw = PHYS.PW / 2;
    for (const s of this.solids) {
      if (s.oneway || !s.active) continue;
      const top = s.y + s.h;
      if (p.x - hw < s.x + s.w && p.x + hw > s.x && p.y < top - 1e-3 && p.y + PHYS.PH > s.y + 1e-3) {
        if (p.grounded && top - p.y <= 0.32) { p.y = top; continue; } // auto step-up of tiny ledges
        if (p.x < s.x + s.w / 2) p.x = s.x - hw - 1e-4; else p.x = s.x + s.w + hw + 1e-4;
        p.vx = 0;
      }
    }
  }
  resolveY(p, prevY) {
    const hw = PHYS.PW / 2;
    p.grounded = false; p.standing = null;
    for (const s of this.solids) {
      if (!s.active) continue;
      if (!(p.x - hw < s.x + s.w - 1e-4 && p.x + hw > s.x + 1e-4)) continue;
      const top = s.y + s.h;
      if (s.oneway) {
        const eps = 0.03 + Math.max(0, s.dy);
        if (p.vy <= 0 && prevY >= top - eps && p.y <= top) { p.y = top; p.vy = 0; p.grounded = true; p.standing = s; }
      } else if (p.y < top && p.y + PHYS.PH > s.y) {
        if (p.vy <= 0 && prevY >= top - 0.4) { p.y = top; p.vy = 0; p.grounded = true; p.standing = s; }
        else if (p.vy > 0) { p.y = s.y - PHYS.PH; p.vy = 0; p.jumping = false; }
      }
    }
  }

  stepEnemies(dt, t) {
    const p = this.player;
    for (const e of this.enemies) {
      const d = e.def;
      const ox = e.x;
      if (d.type === 'walker') {
        e.x += e.dir * d.speed * dt;
        if (e.x < d.minX) { e.x = d.minX; e.dir = 1; }
        if (e.x > d.maxX) { e.x = d.maxX; e.dir = -1; }
      } else if (d.type === 'flyer') {
        const w = (TAU / d.period) * t + d.phase;
        e.x = d.x + Math.sin(w) * d.ax;
        e.y = d.y + Math.sin(w * 2) * d.ay;
      } else if (d.type === 'leaper') {
        const h = d.peak - SEA_Y;
        const v0 = Math.sqrt(2 * LEAP_G * h);
        const T = (2 * v0) / LEAP_G;
        const u = (t + d.phase) % d.period;
        const wasVis = e.visible;
        if (u < T) { e.y = SEA_Y + v0 * u - 0.5 * LEAP_G * u * u; e.vy = v0 - LEAP_G * u; e.visible = true; }
        else { e.y = SEA_Y - 1.5; e.visible = false; }
        if (wasVis !== e.visible) this.fx.burst(e.x, SEA_Y + 0.1, 0.3, 14, { color: rgb(this.pal.hazard), speed: 5, gravity: 10, size: 0.35, life: 0.6, dir: [0, 5, 0], spread: 4 });
      } else if (d.type === 'chaser') {
        const dx = p.x - e.x, dy = p.y + 0.6 - e.y;
        const dist = Math.hypot(dx, dy);
        let tx, ty, sp;
        if (dist < 11 && !p.dead) { tx = p.x; ty = p.y + 0.6; sp = d.speed; } else { tx = d.x; ty = d.y; sp = d.speed * 0.6; }
        const vx = tx - e.x, vy = ty - e.y, l = Math.hypot(vx, vy) || 1;
        const step = Math.min(l, sp * dt);
        e.x += (vx / l) * step; e.y += (vy / l) * step + Math.sin(t * 3 + d.x) * 0.01;
        e.x = clamp(e.x, d.x - 10, d.x + 10); e.y = clamp(e.y, d.y - 3.5, d.y + 3);
      }
      e.vx = (e.x - ox) / Math.max(dt, 1e-4);
      if (Math.abs(e.vx) > 0.05) e.dir = Math.sign(e.vx);
    }
  }

  // ---------------------------------------------------------------- visuals
  render(dt, t, camera) {
    const pal = this.pal;
    for (const k in this.mats) this.mats[k].userData.uniforms.uTime.value = t;
    this.sea.material.uniforms.uTime.value = t;
    for (const s of this.solids) {
      if (!s.mesh) continue;
      if (s.move) s.mesh.position.set(s.x + s.w / 2, s.y + s.h, s.z);
      if (s.kind === 'crumble') {
        const u = s.mesh.material.userData.uniforms;
        if (s.state === 'shaking') { s.mesh.position.x = s.bx + s.w / 2 + Math.sin(t * 70) * 0.05; u.uShake.value = 1 - s.timer / 0.5; }
        else if (s.state === 'falling') { s.mesh.position.y -= dt * 9; s.mesh.rotation.z += dt * 0.6; s.mesh.visible = s.mesh.position.y > SEA_Y - 3; u.uShake.value = 0; }
        else { s.mesh.visible = true; s.mesh.position.set(s.bx + s.w / 2, s.by + s.h, s.z); s.mesh.rotation.z = 0; u.uShake.value = 0; }
      }
    }
    for (const h of this.hazards) {
      if (h.type !== 'geyser') continue;
      const u = (this.time + h.phase) % h.period;
      const onStart = h.period - h.on;
      const warn = u > onStart - 0.8 && u < onStart;
      h.active = u >= onStart + 0.08;
      const target = u >= onStart ? 1 : warn ? 0.12 : 0;
      const m = h.col.material.uniforms;
      m.uOn.value += (target - m.uOn.value) * Math.min(1, dt * 18);
      m.uTime.value = t;
      h.col.scale.y = 0.15 + 0.85 * Math.min(1, m.uOn.value * 1.3);
      h.vent.material.emissiveIntensity = warn ? 0.6 + 0.6 * Math.sin(t * 30) : h.active ? 1.4 : 0.05;
      if ((warn || h.active) && Math.random() < (h.active ? 0.9 : 0.35)) {
        this.fx.emit(h.x + h.w / 2 + (Math.random() - 0.5) * 0.8, h.y + 0.3, 0.2, { color: rgb(pal.hazard), dir: [0, h.active ? 12 : 3, 0], spread: 1.5, gravity: h.active ? -2 : 1, size: 0.35, life: h.active ? 0.5 : 0.4 });
      }
    }
    for (const b of this.bouncers) {
      b.squish = Math.max(0, b.squish - dt * 3);
      const k = Math.sin(b.squish * Math.PI * 3) * b.squish;
      b.view.pad.scale.set(1 + k * 0.3, 1 - k * 0.5, 1 + k * 0.3);
    }
    for (const c of this.coinViews) {
      if (c.taken) {
        if (c.mesh.visible) {
          c.mesh.position.y += dt * 6; c.mesh.scale.multiplyScalar(1 - dt * 6);
          if (c.mesh.scale.x < 0.1) c.mesh.visible = false;
        }
        continue;
      }
      c.mesh.rotation.y = t * 3 + c.x * 0.7;
      c.mesh.position.y = c.y + Math.sin(t * 3 + c.x) * 0.08;
    }
    const p = this.player;
    for (const e of this.enemies) {
      const m = e.model;
      m.root.visible = e.visible;
      if (!e.visible) continue;
      m.root.position.set(e.x, e.y + (e.def.type === 'walker' ? (m.based ? 0 : 0.45) : (m.based ? -0.42 : 0)), 0);
      m.update(dt, t + e.def.x, e);
      if (e.def.type === 'leaper') {
        m.root.rotation.set(0, 0, m.leaper ? Math.atan2(e.vy || 0, 2.5) - (m.leaper === 'up' ? Math.PI / 2 : 0) : 0);
      } else if (m.flip) m.root.rotation.y = e.dir > 0 ? -0.35 : Math.PI + 0.35;
      else m.root.rotation.y = e.dir * 0.45;
      // pupils track the player: they are predators after all
      const lx = clamp((p.x - e.x) * 0.2, -1, 1), ly = clamp((p.y - e.y) * 0.2, -1, 1);
      for (const eye of m.eyes || []) { eye.userData.pupil.position.x = lx * eye.userData.r * 0.32 * (m.flip ? 0 : 1); eye.userData.pupil.position.y = ly * eye.userData.r * 0.32; }
    }
    // artifact
    const A = this.artifact;
    if (!A.taken) {
      this.artifactMesh.position.y = A.y + Math.sin(t * 2) * 0.15;
      this.artifactMesh.rotation.y = t * 1.4;
      this.artifactBeam.material.uniforms.uTime.value = t;
      this.artifactLight.intensity = 14 + Math.sin(t * 4) * 4;
      if (Math.random() < 0.3) this.fx.emit(A.x + (Math.random() - 0.5) * 1.2, A.y - 1, 0.3, { color: rgb(pal.accent), dir: [0, 2.5, 0], spread: 0.5, gravity: -0.5, size: 0.25, life: 1.2 });
    } else if (A.anim > 0) {
      A.anim += dt;
      const target = new THREE.Vector3(p.x, p.y + 2.4, 0.5);
      this.artifactMesh.position.lerp(target, Math.min(1, dt * 8));
      this.artifactMesh.rotation.y += dt * 6;
      const s = A.anim < 3 ? 1.25 + Math.min(1, A.anim * 2) * 0.5 : Math.max(0, 1.75 - (A.anim - 3) * 4);
      this.artifactMesh.scale.setScalar(Math.max(0.001, s));
      this.artifactLight.position.copy(this.artifactMesh.position);
      if (s <= 0.01) { this.artifactMesh.visible = false; this.artifactLight.visible = false; A.anim = 0; }
    }
    // portal
    const P = this.portal, pv = this.portalView;
    P.level += ((P.active ? 1 : 0) - P.level) * Math.min(1, dt * 2.5);
    pv.disc.material.uniforms.uTime.value = t;
    pv.disc.material.uniforms.uActive.value = P.level;
    pv.halo.material.uniforms.uOn.value = 0.25 + P.level * 1.1;
    pv.rm.color.set(pal.edge).multiplyScalar(0.6 + P.level * 2.4);
    pv.ringMat.emissiveIntensity = 0.2 + P.level * 0.8;
    pv.runes.forEach((rn, i) => { rn.position.z = 0.18 + Math.sin(t * 3 + i) * 0.05 * (1 + P.level); });
    pv.root.rotation.z = 0;
    pv.disc.rotation.z = -t * (0.2 + P.level);
    this.portalLight.intensity = 3 + P.level * 22;
    if (P.level > 0.5 && Math.random() < 0.8) {
      const a = Math.random() * TAU, rr = 3 + Math.random();
      this.fx.emit(P.x + Math.cos(a) * rr, P.y + Math.sin(a) * rr, 0, { color: rgb(pal.accent), dir: [-Math.cos(a) * 5, -Math.sin(a) * 5, 0], spread: 0.3, gravity: 0, drag: 0, size: 0.3, life: 0.6 });
    }
  }
}

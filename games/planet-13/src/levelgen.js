// Level layout generation. Pure data: no rendering, no world-specific visuals.
// The layout is assembled from "chunks" that each start at the right edge of a walkable surface
// and end on a new one. Every jump a chunk creates is sized from the real player physics
// (airReach) scaled by a difficulty-dependent safety factor, so every level is completable.
import { RNG, PHYS, SEA_Y, airReach, JUMP_HEIGHT, lerp, clamp } from './core.js';

const Y_MIN = 0, Y_MAX = 8;

export function difficultyFor(index) {
  const D = clamp(index / 9, 0, 1);
  return {
    D,
    length: 150 + index * 15,
    reach: lerp(0.6, 0.8, D),          // fraction of the physical jump reach a gap may use
    gapMin: lerp(1.6, 2.5, D),
    gapCap: lerp(3.4, 5.0, D),
    upMax: lerp(1.5, 2.5, D),
    enemySpeed: lerp(1.9, 4.0, D),
    walker: lerp(0.4, 0.8, D),
    spikes: index >= 1 ? lerp(0.25, 0.6, D) : 0,
    geyser: index >= 2 ? lerp(0.3, 0.55, D) : 0,
    leaper: index >= 1 ? lerp(0.3, 0.65, D) : 0,
    flyer: index >= 2,
    chaser: index >= 5,
    moving: index >= 2,
    lift: index >= 3,
    crumble: index >= 4,
    bounce: index >= 1,
    coinTarget: 10 + Math.floor(index * 0.5),
  };
}

export function generateLevel(index, seed) {
  const r = new RNG(seed);
  const P = difficultyFor(index);
  const D = P.D;
  const L = {
    index, seed,
    solids: [], hazards: [], enemies: [], coins: [], bouncers: [], segments: [], jumps: [],
    features: new Set(), decorSeed: r.int(1, 1e9),
  };
  const coinGroups = [];
  const megaSpots = [];
  let x = 0, y = 0;

  const maxGap = (dy) => Math.min(P.gapCap, airReach(dy) * P.reach);
  const jump = (fx, fy, tx, ty, kind = 'gap') => L.jumps.push({ fx, fy, tx, ty, kind });

  function ground(x0, x1, top, kind = 'ground') {
    const last = L.solids[L.solids.length - 1];
    if (kind === 'ground' && last && last.kind === 'ground' && Math.abs(last.x + last.w - x0) < 1e-6 && Math.abs(last.y + last.h - top) < 1e-6) {
      last.w = x1 - last.x;
      const seg = L.segments[L.segments.length - 1];
      if (seg && seg.ground) seg.x1 = x1;
      return last;
    }
    const s = { x: x0, y: -16, w: x1 - x0, h: top + 16, kind, oneway: false };
    L.solids.push(s);
    L.segments.push({ x0, x1, y: top, ground: true });
    return s;
  }
  function plat(x0, w, top, kind = 'float', move = null) {
    const s = { x: x0, y: top - 0.7, w, h: 0.7, kind, oneway: true, move };
    L.solids.push(s);
    if (kind === 'float') L.segments.push({ x0, x1: x0 + w, y: top, ground: false });
    return s;
  }
  const coinRow = (x0, x1, yy, n, kind = 'row') => {
    const g = [];
    for (let i = 0; i < n; i++) g.push({ x: n === 1 ? (x0 + x1) / 2 : lerp(x0, x1, i / (n - 1)), y: yy });
    coinGroups.push({ kind, coins: g });
  };
  const coinArc = (x0, y0, x1, y1, n, h = 1.7) => {
    const g = [];
    for (let i = 1; i <= n; i++) {
      const u = i / (n + 1);
      g.push({ x: lerp(x0, x1, u), y: lerp(y0, y1, u) + 0.9 + 4 * h * u * (1 - u) });
    }
    coinGroups.push({ kind: 'arc', coins: g });
  };
  function pickDy(lo = -2.4, hi = P.upMax, from = y) {
    if (from > 5.5) hi = Math.min(hi, 0);
    if (from > 7) hi = -1;
    if (from < 0.6) lo = Math.max(lo, 0);
    if (r.chance(0.2) && lo <= 0 && hi >= 0) return 0;
    let dy = Math.round(r.range(lo, hi) * 10) / 10;
    return clamp(from + dy, Y_MIN, Y_MAX) - from;
  }
  const gapFor = (dy) => {
    const mg = maxGap(dy);
    return Math.max(Math.min(P.gapMin, mg), r.range(P.gapMin, Math.max(P.gapMin, mg)));
  };
  function addWalker(x0, x1, top) {
    if (x1 - x0 < 2.5) return;
    L.enemies.push({ type: 'walker', x: r.range(x0, x1), y: top, minX: x0, maxX: x1, speed: P.enemySpeed * r.range(0.85, 1.15), dir: r.sign() });
    L.features.add('walker');
  }
  function addFlyer(cx, cy, ax, ay) {
    L.enemies.push({ type: 'flyer', x: cx, y: cy, ax, ay, period: lerp(5.5, 3.6, D) * r.range(0.9, 1.15), phase: r.range(0, Math.PI * 2) });
    L.features.add('flyer');
  }
  function addLeaper(cx, peak) {
    const period = lerp(3.4, 2.5, D) * r.range(0.95, 1.1);
    L.enemies.push({ type: 'leaper', x: cx, y: SEA_Y, peak, period, phase: r.range(0, period) });
    L.features.add('leaper');
  }

  // ---------------- chunks ----------------
  const chunks = {
    flat() {
      const len = r.range(lerp(7, 9, D), lerp(13, 15, D));
      const x0 = x, x1 = x + len, mid = (x0 + x1) / 2;
      ground(x0, x1, y);
      const feature = r.weighted([
        ['none', 1.0], ['walker', P.walker * 2.5],
        ['spikes', len >= 9 ? P.spikes * 2.5 : 0], ['geyser', len >= 8.5 ? P.geyser * 2.5 : 0],
      ]);
      if (feature === 'walker') {
        addWalker(x0 + 1.8, x1 - 1.8, y);
        if (len >= 11 && D > 0.5 && r.chance(0.5)) addWalker(x0 + 1.8, x1 - 1.8, y);
        coinRow(mid - 1.8, mid + 1.8, y + 1.0, 4);
      } else if (feature === 'spikes') {
        const w = r.range(1.2, lerp(1.6, 2.6, D));
        const sx = clamp(mid - w / 2 + r.range(-1, 1), x0 + 3, x1 - 3 - w);
        L.hazards.push({ type: 'spikes', x: sx, y, w });
        L.features.add('spikes');
        coinArc(sx - 1.2, y, sx + w + 1.2, y, 3, 1.4);
      } else if (feature === 'geyser') {
        const w = 1.3, gx = clamp(mid - w / 2 + r.range(-1.5, 1.5), x0 + 3, x1 - 3 - w);
        const period = lerp(3.6, 2.7, D);
        L.hazards.push({ type: 'geyser', x: gx, y, w, h: r.range(5.5, 7), period, on: lerp(0.9, 1.15, D), phase: r.range(0, period) });
        L.features.add('geyser');
        coinRow(x0 + 1, gx - 1, y + 1.0, 2);
      } else {
        coinRow(mid - 2.4, mid + 2.4, y + 1.0, r.int(3, 5));
      }
      if (len >= 10 && feature !== 'geyser' && r.chance(0.45)) {
        const pw = r.range(2.6, 3.6);
        const px = x0 + r.range(2.5, len - 2.5 - pw);
        const ph = y + r.range(2.3, 2.8);
        plat(px, pw, ph);
        coinRow(px + 0.6, px + pw - 0.6, ph + 1.0, 2, 'bonus');
      }
      if (P.flyer && D > 0.35 && feature !== 'geyser' && r.chance(0.3)) addFlyer(mid, y + 2.3, len / 2 - 1.5, 1.0);
      x = x1;
      return true;
    },
    gap() {
      const dy = pickDy();
      const g = gapFor(dy);
      const x0 = x + g, ny = y + dy, len = r.range(5, 8.5);
      ground(x0, x0 + len, ny);
      jump(x, y, x0, ny);
      if (g >= 2) coinArc(x, y, x0, ny, g > 3.5 ? 4 : 3);
      if (g >= 2.6 && r.chance(P.leaper)) addLeaper(x + g / 2, Math.max(y, ny) + r.range(1.8, 3.2));
      else if (P.flyer && r.chance(0.3)) addFlyer(x + g / 2, Math.max(y, ny) + 2.6, g / 2 + 0.6, 0.8);
      megaSpots.push({ x: x + g / 2, y: y + 3.4 });
      if (len > 7 && r.chance(P.walker * 0.4)) addWalker(x0 + 2.2, x0 + len - 1.2, ny);
      x = x0 + len; y = ny;
      return true;
    },
    steps() {
      const n = r.int(2, 2 + Math.round(D * 2));
      let cx = x, cy = y;
      for (let i = 0; i < n; i++) {
        const dy = pickDy(-1.6, P.upMax * 0.9, cy);
        const g = gapFor(dy);
        const w = r.range(lerp(3.4, 2.2, D), lerp(4.6, 3.2, D));
        plat(cx + g, w, cy + dy);
        jump(cx, cy, cx + g, cy + dy);
        if (r.chance(0.6)) coinRow(cx + g + w / 2 - 0.5, cx + g + w / 2 + 0.5, cy + dy + 1.0, 2);
        if (D > 0.3 && g > 2.6 && r.chance(P.leaper * 0.6)) addLeaper(cx + g / 2, Math.max(cy, cy + dy) + 2.2);
        cx += g + w; cy += dy;
      }
      const dy = pickDy(-2, P.upMax * 0.9, cy);
      const g = gapFor(dy);
      const len = r.range(5, 8);
      ground(cx + g, cx + g + len, cy + dy);
      jump(cx, cy, cx + g, cy + dy);
      x = cx + g + len; y = cy + dy;
      return true;
    },
    stairs() {
      const n = r.int(2, 4);
      let dir = y > 4.5 ? -1 : y < 1 ? 1 : r.sign();
      for (let i = 0; i < n; i++) {
        let dy = dir * r.range(0.8, 1.7);
        if (y + dy > Y_MAX || y + dy < Y_MIN) { dir = -dir; dy = -dy; }
        const w = r.range(2.4, 3.6);
        if (D > 0.3 && r.chance(0.3)) {
          const g = r.range(1.2, 2.0);
          jump(x, y, x + g, y + dy, 'step');
          x += g;
        }
        ground(x, x + w, y + dy);
        coinRow(x + w / 2, x + w / 2, y + dy + 1.0, 1);
        x += w; y += dy;
      }
      const len = r.range(3, 5);
      ground(x, x + len, y);
      x += len;
      return true;
    },
    movingH() {
      const pitW = r.range(lerp(8, 10, D), lerp(10, 13, D));
      const pw = lerp(3.0, 2.4, D);
      const ax = x + 0.7, bx = x + pitW - 0.7 - pw;
      const period = lerp(5.2, 3.8, D);
      plat(ax, pw, y, 'moving', { ax, ay: y - 0.7, bx, by: y - 0.7, period, phase: r.range(0, 1) });
      L.features.add('moving');
      const ny = clamp(y + r.range(-1, 1), Y_MIN, Y_MAX);
      const len = r.range(5, 8);
      ground(x + pitW, x + pitW + len, ny);
      coinRow(x + pitW * 0.3, x + pitW * 0.7, y + 1.3, 3);
      megaSpots.push({ x: x + pitW / 2, y: y + 3.4 });
      if (D > 0.6 && r.chance(0.4)) addFlyer(x + pitW / 2, y + 3.6, pitW / 2 - 1, 0.5);
      x = x + pitW + len; y = ny;
      return true;
    },
    lift() {
      if (y > 3.5) return false;
      const g1 = r.range(1.0, 1.5), pw = 2.6, g2 = r.range(1.0, 1.5);
      const rise = r.range(4, 5.5);
      const lx = x + g1;
      const period = lerp(5.4, 4.0, D);
      plat(lx, pw, y, 'moving', { ax: lx, ay: y - 0.7, bx: lx, by: y + rise - 0.7, period, phase: r.range(0, 1) });
      L.features.add('moving');
      const ny = y + rise - 0.4;
      const len = r.range(5, 8);
      const gx = lx + pw + g2;
      ground(gx, gx + len, ny);
      coinRow(lx + pw / 2, lx + pw / 2, y + 2.0, 1);
      coinRow(lx + pw / 2, lx + pw / 2, y + 3.5, 1);
      coinRow(lx + pw / 2, lx + pw / 2, y + 5.0, 1);
      x = gx + len; y = ny;
      return true;
    },
    crumble() {
      const n = r.int(3, 4 + Math.round(D));
      let cx = x, cy = y;
      for (let i = 0; i < n; i++) {
        const g = r.range(1.3, Math.min(2.6, maxGap(0) * 0.85));
        const dy = clamp(r.range(-0.4, 0.4), Y_MIN - cy, Y_MAX - cy);
        plat(cx + g, 2.0, cy + dy, 'crumble');
        jump(cx, cy, cx + g, cy + dy);
        coinRow(cx + g + 1, cx + g + 1, cy + dy + 1.0, 1);
        cx += g + 2.0; cy += dy;
      }
      L.features.add('crumble');
      const g = r.range(1.3, 2.2), len = r.range(5, 8);
      ground(cx + g, cx + g + len, cy);
      jump(cx, cy, cx + g, cy);
      x = cx + g + len; y = cy;
      return true;
    },
    bounce() {
      if (y > 3) return false;
      const pre = 6;
      ground(x, x + pre, y);
      const rise = r.range(4.6, 6.0);
      const power = Math.sqrt(2 * PHYS.GU * (rise + 2.6));
      L.bouncers.push({ x: x + 2.0, y, w: 1.5, power });
      L.features.add('bounce');
      coinRow(x + 2.75, x + 2.75, y + 2.4, 1);
      coinRow(x + 2.75, x + 2.75, y + 4.0, 1);
      coinRow(x + 2.75, x + 2.75, y + 5.6, 1);
      const len = r.range(6, 10);
      ground(x + pre, x + pre + len, y + rise);
      jump(x + 2.75, y, x + pre, y + rise, 'bounce');
      coinRow(x + pre + 1.5, x + pre + len - 1.5, y + rise + 1.0, 3);
      megaSpots.push({ x: x + 2.75, y: y + rise + 2.4 });
      x = x + pre + len; y = y + rise;
      return true;
    },
  };

  function shrine() {
    const len = 15;
    ground(x, x + len, y);
    let ax, ay;
    if (r.chance(0.5)) {
      const ph = y + 2.6;
      plat(x + 5.5, 4, ph);
      ax = x + 7.5; ay = ph + 1.3;
    } else {
      plat(x + 3, 2.6, y + 2.3);
      plat(x + 7.4, 3.2, y + 4.4);
      ax = x + 9; ay = y + 4.4 + 1.3;
    }
    L.artifact = { x: ax, y: ay };
    coinRow(x + 1.5, x + 3.5, y + 1.0, 2);
    if (D >= 0.3) addFlyer(x + 7.5, y + 2.4, 4, 1.1);
    x += len;
  }

  function finish() {
    const len = 20;
    ground(x, x + len, y);
    L.portal = { x: x + 12, y: y + 2.4 };
    coinRow(x + 3, x + 6, y + 1.0, 3);
    L.solids.push({ x: x + len, y: -16, w: 14, h: y + 16 + 26, kind: 'wall', oneway: false });
    L.bounds = { minX: -1.5, maxX: x + len };
    x += len;
  }

  // ---------------- assembly ----------------
  L.solids.push({ x: -14, y: -16, w: 12.5, h: 16 + 26, kind: 'wall', oneway: false });
  ground(-1.5, 12, 0);
  L.start = { x: 1.5, y: 0 };
  coinRow(5, 8.6, 1.0, 4);
  x = 12; y = 0;

  // each level introduces (and guarantees) a feature; later levels mix several
  const intro = [[], ['bounce'], ['movingH'], ['lift'], ['crumble']][index];
  const pending = intro ? intro.slice() : r.shuffle(['movingH', 'lift', 'crumble', 'bounce']).slice(0, 2);
  const pendingAt = pending.length === 1 ? [0.25] : [0.22, 0.45];

  let prev = null, shrineDone = false, guard = 0;
  while (x < P.length && guard++ < 200) {
    if (!shrineDone && x >= P.length * 0.58) {
      if (prev !== 'gap' && r.chance(0.6)) chunks.gap();
      shrine(); shrineDone = true; prev = 'shrine'; continue;
    }
    let type;
    if (pending.length && x >= P.length * pendingAt[0]) {
      type = pending.shift(); pendingAt.shift();
    } else {
      const options = [
        ['flat', 2.6], ['gap', 4], ['steps', 2.4], ['stairs', 1.3],
        ['movingH', P.moving ? 1.3 : 0], ['lift', P.lift ? 0.9 : 0],
        ['crumble', P.crumble ? 1.2 : 0], ['bounce', P.bounce ? 0.8 : 0],
      ].filter((o) => o[1] > 0 && (o[0] !== prev || o[0] === 'gap'));
      type = r.weighted(options);
    }
    if (!chunks[type]()) { chunks.gap(); prev = 'gap'; continue; }
    prev = type;
  }
  if (!shrineDone) shrine();
  chunks.gap();
  finish();

  // chasers: roaming eyes that drift toward the player, only on harder levels
  if (P.chaser) {
    const cands = L.segments.filter((s) => s.ground && s.x0 > P.length * 0.25 && s.x1 - s.x0 > 5);
    const n = index >= 8 ? 2 : 1;
    for (const s of r.shuffle(cands).slice(0, n)) {
      L.enemies.push({ type: 'chaser', x: (s.x0 + s.x1) / 2, y: s.y + 3.6, speed: lerp(2.4, 3.4, D) });
      L.features.add('chaser');
    }
  }

  // coin budget: keep groups intact; trim the last group to hit the target exactly
  let budget = P.coinTarget;
  const chosen = new Set();
  for (const gi of [0, ...r.shuffle(coinGroups.map((_, i) => i).slice(1))]) {
    if (budget <= 0) break;
    const g = coinGroups[gi];
    if (g.coins.length > budget) g.coins = g.coins.slice(0, budget);
    budget -= g.coins.length;
    chosen.add(gi);
  }
  let id = 0;
  coinGroups.forEach((g, gi) => { if (chosen.has(gi)) for (const c of g.coins) L.coins.push({ id: id++, x: c.x, y: c.y, value: 1 }); });
  const mega = megaSpots.length ? r.pick(megaSpots) : { x: L.portal.x - 20, y: 4 };
  L.coins.push({ id: id++, x: mega.x, y: mega.y, value: 5, mega: true });
  L.totalCredits = L.coins.reduce((a, c) => a + c.value, 0);
  L.length = L.bounds.maxX;
  return L;
}

// Self-check used by the test harness: every generated jump must fit inside the physical reach.
export function validateLevel(L) {
  const problems = [];
  for (const j of L.jumps) {
    const gap = j.tx - j.fx, dy = j.ty - j.fy;
    if (j.kind === 'bounce') continue;
    if (dy > JUMP_HEIGHT - 0.6) problems.push(`jump too high dy=${dy.toFixed(2)} at x=${j.fx.toFixed(1)}`);
    else if (gap > airReach(dy) * 0.85) problems.push(`gap too wide ${gap.toFixed(2)} (dy ${dy.toFixed(2)}) at x=${j.fx.toFixed(1)}`);
  }
  if (!L.artifact) problems.push('no artifact');
  if (!L.portal) problems.push('no portal');
  if (L.artifact && L.artifact.x > L.portal.x) problems.push('artifact after portal');
  return problems;
}

// World concept generation. Produces plain "world records" that are independent of level layout
// and rendering. A future Planet:13 Archive integration can supply records of the same shape
// (see normalizeWorldRecord) instead of calling generateWorld.
import { RNG, hashString, shiftHue } from './core.js';
import { THEMES, CULTURES, PATTERNS } from './content.js';

const SUFFIXES = ['Prime', 'Minor', 'IX', 'VII', '-9', 'Beta', 'Major'];

function jitterPalette(p, r) {
  const dh = r.range(-0.035, 0.035);
  const out = {};
  for (const k of Object.keys(p)) {
    out[k] = Array.isArray(p[k]) ? p[k].map((c) => shiftHue(c, dh)) : shiftHue(p[k], dh);
  }
  return out;
}

export function generateWorld(theme, r, index) {
  let name = r.pick(theme.names);
  if (r.chance(0.18) && !/\b(Prime|Minor|IX|VII|IV|V|-\d|Major|Beta)\b/.test(name) && !name.startsWith('The ')) {
    name = name + ' ' + r.pick(SUFFIXES);
  }
  const compatible = CULTURES.filter((c) => c.needs.every((t) => theme.tags.includes(t)));
  const cultureLine = r.chance(0.45) ? r.pick(compatible).text : r.pick(theme.inhabitants);
  const artifact = r.pick(theme.artifacts);
  return {
    id: theme.key + '-' + index,
    source: 'generated',
    theme: theme.key,
    name,
    type: r.pick(theme.types),
    overview: r.pick(theme.overview),
    culture: cultureLine,
    palette: jitterPalette(r.pick(theme.pal), r),
    terrain: { pattern: PATTERNS[theme.terrain.pattern] ?? 0, drip: theme.terrain.drip },
    decor: theme.decor.slice(),
    far: theme.far,
    celestial: { ...theme.celestial, ringTilt: r.range(-0.5, 0.5), size: r.range(0.85, 1.25) },
    particles: { ...theme.particles },
    hazards: {
      pool: theme.pool,
      spikes: { ...theme.spikes },
      geyser: theme.geyser,
      crumble: theme.crumble,
      bounce: theme.bounce,
    },
    predators: {
      walker: { ...theme.walker },
      flyer: { ...theme.flyer },
      leaper: { ...theme.leaper },
      chaser: { ...theme.chaser },
    },
    artifact: { ...artifact },
    registry: {
      arrival: r.pick(theme.quips),
      artifact: r.pick(theme.artQuips),
    },
    music: { ...theme.music },
  };
}

// Builds the ten worlds of an expedition. Themes never repeat inside one expedition.
export function generateExpedition(seed, count = 10) {
  const r = new RNG(hashString('expedition:' + seed));
  const order = r.shuffle(THEMES).slice(0, count);
  return order.map((theme, i) => generateWorld(theme, r.fork('world' + i), i));
}

// Accepts a partial external record (e.g. from the future Intergalactic Archive) and fills
// every field the renderer and level generator need with sensible, theme-consistent defaults.
export function normalizeWorldRecord(rec, seed = 'archive') {
  const r = new RNG(hashString(seed + ':' + (rec.name || 'unknown')));
  const base = THEMES.find((t) => t.key === rec.theme) || r.pick(THEMES);
  const filled = generateWorld(base, r, 0);
  return {
    ...filled,
    ...rec,
    source: rec.source || 'archive',
    palette: { ...filled.palette, ...(rec.palette || {}) },
    predators: { ...filled.predators, ...(rec.predators || {}) },
    hazards: { ...filled.hazards, ...(rec.hazards || {}) },
    artifact: { ...filled.artifact, ...(rec.artifact || {}) },
    registry: { ...filled.registry, ...(rec.registry || {}) },
  };
}

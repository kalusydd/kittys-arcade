// Shared constants, seeded RNG and small helpers.

export const PHYS = {
  RUN: 9.5,        // max run speed (units/s)
  ACCEL_G: 85,     // ground acceleration
  ACCEL_A: 55,     // air acceleration
  DECEL_G: 75,     // ground friction
  DECEL_A: 22,     // air drag when no input
  GU: 55,          // gravity while rising
  GD: 80,          // gravity while falling (snappier landings)
  VJ: 20,          // jump velocity
  JUMP_CUT: 0.45,  // velocity multiplier when jump released early
  COYOTE: 0.11,
  BUFFER: 0.14,
  MAXFALL: 30,
  PW: 0.8,         // player width
  PH: 1.15,        // player height
};

export const SEA_Y = -2.6;      // the lethal liquid surface that fills every world's lowlands
export const MAX_LEVELS = 10;

// Horizontal distance travelled at full speed during a full-height jump that lands dy higher.
export function airReach(dy) {
  const H = (PHYS.VJ * PHYS.VJ) / (2 * PHYS.GU);
  if (dy > H - 0.25) return 0;
  const tUp = PHYS.VJ / PHYS.GU;
  const tDown = Math.sqrt((2 * (H - dy)) / PHYS.GD);
  return PHYS.RUN * (tUp + tDown);
}
export const JUMP_HEIGHT = (PHYS.VJ * PHYS.VJ) / (2 * PHYS.GU);

export function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h += h << 13; h ^= h >>> 7; h += h << 3; h ^= h >>> 17; h += h << 5;
  return h >>> 0;
}

export class RNG {
  constructor(seed) {
    this.s = (typeof seed === 'string' ? hashString(seed) : seed >>> 0) || 0x9e3779b9;
  }
  next() {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a, b) { return a + (b - a) * this.next(); }
  int(a, b) { return Math.floor(this.range(a, b + 1)); }
  chance(p) { return this.next() < p; }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  sign() { return this.next() < 0.5 ? -1 : 1; }
  shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  weighted(items) { // [[value, weight], ...]
    let total = 0;
    for (const it of items) total += it[1];
    let r = this.next() * total;
    for (const it of items) { if ((r -= it[1]) <= 0) return it[0]; }
    return items[items.length - 1][0];
  }
  fork(tag) { return new RNG(hashString(this.s + ':' + tag)); }
}

export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const smooth = (t) => t * t * (3 - 2 * t);
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));

// Hex colour helpers (hue jitter keeps palettes coherent but fresh per expedition)
export function hexToHsl(hex) {
  const n = parseInt(hex.slice(1), 16);
  let r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0; const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return [h, s, l];
}
export function hslToHex(h, s, l) {
  h = ((h % 1) + 1) % 1;
  const f = (n) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255).toString(16).padStart(2, '0');
  };
  return '#' + f(0) + f(8) + f(4);
}
export function shiftHue(hex, dh, ds = 0, dl = 0) {
  const [h, s, l] = hexToHsl(hex);
  return hslToHex(h + dh, clamp(s + ds, 0, 1), clamp(l + dl, 0, 1));
}

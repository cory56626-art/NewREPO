// Seeded deterministic randomness. Every pig, document and night is reproducible
// from a single integer seed, which is what makes the ID photo and the pig in the
// chair two views of the same creature rather than two rolls of the dice.

export function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32 — small, fast, good enough spread for our purposes. */
export function makeRng(seed) {
  let a = (typeof seed === 'string' ? hashString(seed) : seed >>> 0) || 1;
  const rng = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rng.int = (min, max) => Math.floor(rng() * (max - min + 1)) + min;
  rng.range = (min, max) => rng() * (max - min) + min;
  rng.chance = (p) => rng() < p;
  rng.pick = (arr) => arr[Math.floor(rng() * arr.length)];
  rng.pickWeighted = (entries) => {
    // entries: [[value, weight], ...]
    let total = 0;
    for (const [, w] of entries) total += w;
    let roll = rng() * total;
    for (const [v, w] of entries) {
      roll -= w;
      if (roll <= 0) return v;
    }
    return entries[entries.length - 1][0];
  };
  rng.shuffle = (arr) => {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };
  /** Take up to n distinct items. */
  rng.sample = (arr, n) => rng.shuffle(arr).slice(0, n);
  rng.seed = () => rng.int(1, 2147483646);
  return rng;
}

/** Deterministic value noise, used for wood grain, stains and film grain. */
export function noise2d(x, y, seed = 0) {
  let n = Math.imul(Math.floor(x) * 374761393 + Math.floor(y) * 668265263 + seed * 1442695040, 1);
  n = (n ^ (n >>> 13)) >>> 0;
  n = Math.imul(n, 1274126177) >>> 0;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

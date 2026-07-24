// Every drawn element goes through this registry. Today each name maps to a
// procedural function; when hand-drawn art arrives, call `overrideWithImage()` and
// the same name starts drawing a bitmap instead — no game logic changes.
//
//   definePainter('desk.surface', (ctx, o) => { ...canvas drawing... });
//   paint(ctx, 'desk.surface', { width: 1600 });
//
//   // later, with art:
//   overrideWithImage('desk.surface', './assets/desk.png', { x: 0, y: 520, w: 1600, h: 380 });

const painters = new Map();
const overrides = new Map();

export function definePainter(name, fn) {
  painters.set(name, fn);
}

export function paint(ctx, name, opts = {}) {
  const ov = overrides.get(name);
  if (ov && ov.image && ov.image.complete && ov.image.naturalWidth > 0) {
    const d = typeof ov.dest === 'function' ? ov.dest(opts) : ov.dest;
    ctx.drawImage(ov.image, d.x, d.y, d.w, d.h);
    if (ov.alsoProcedural !== true) return;
  }
  const fn = painters.get(name);
  if (!fn) {
    if (!paint._warned) paint._warned = new Set();
    if (!paint._warned.has(name)) {
      paint._warned.add(name);
      console.warn('[painters] no painter registered for', name);
    }
    return;
  }
  fn(ctx, opts);
}

export function hasPainter(name) {
  return painters.has(name);
}

/**
 * Swap a procedural painter for a bitmap.
 * @param {string} name        painter id, e.g. 'pig.head'
 * @param {string} url         image path
 * @param {object|function} dest  {x,y,w,h} in 1600x900 space, or (opts) => rect
 * @param {object} extra       { alsoProcedural: true } to draw art *and* code
 */
export function overrideWithImage(name, url, dest, extra = {}) {
  const image = new Image();
  image.src = url;
  overrides.set(name, { image, dest, ...extra });
  return image;
}

export function clearOverride(name) {
  overrides.delete(name);
}

/** Bulk-load a manifest: { 'desk.surface': { url, dest }, ... } */
export function loadArtManifest(manifest) {
  for (const [name, cfg] of Object.entries(manifest)) {
    overrideWithImage(name, cfg.url, cfg.dest, cfg);
  }
}

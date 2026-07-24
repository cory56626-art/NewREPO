// One creature, drawn two ways.
//
// `drawPig` renders a feature set at any size in one of two modes: 'scene' (the
// animal sitting in the chair, lit from above by the desk lamp) and 'photo' (the
// desaturated bust printed on an identity card). Both read the *same* feature
// object, so when a mimic's papers carry a mutated feature set the difference is
// genuinely visible rather than a hidden dice roll.

import { P, rgba, shade, mix } from './palette.js';
import { makeRng, noise2d } from '../core/rng.js';
import { definePainter, paint } from './painters.js';

const photoCache = new Map();

function hideColour(f) {
  const base = P.hide[f.hide % P.hide.length];
  return shade(base, 1 + f.hideShift);
}

const EYE_HEX = {
  AMBER: '#d9962f', GREY: '#9a968c', BLACK: '#2b2622',
  'PALE BLUE': '#9db6c4', GREEN: '#7f9159', PINK: '#c98d97',
};

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

function headPath(ctx, f) {
  const w = 92 * f.headW;
  const h = 104 * f.headH;
  const jowl = 1 + f.jowl * 0.22;
  const cx = 0, cy = -58;
  ctx.beginPath();
  ctx.moveTo(cx, cy - h * 0.5);                                       // crown
  ctx.bezierCurveTo(cx + w * 0.62, cy - h * 0.46, cx + w * 0.58, cy - h * 0.05, cx + w * 0.52 * jowl, cy + h * 0.22);
  ctx.bezierCurveTo(cx + w * 0.48 * jowl, cy + h * 0.44, cx + w * 0.24, cy + h * 0.52, cx, cy + h * 0.52);
  ctx.bezierCurveTo(cx - w * 0.24, cy + h * 0.52, cx - w * 0.48 * jowl, cy + h * 0.44, cx - w * 0.52 * jowl, cy + h * 0.22);
  ctx.bezierCurveTo(cx - w * 0.58, cy - h * 0.05, cx - w * 0.62, cy - h * 0.46, cx, cy - h * 0.5);
  ctx.closePath();
}

/** The ear outline, in ear-local space. */
function earShape(ctx, f) {
  const s = 34 * f.earSize;
  ctx.beginPath();
  ctx.moveTo(0, s * 0.55);
  ctx.bezierCurveTo(-s * 0.62, s * 0.1, -s * 0.5, -s * 0.95, 0, -s * 1.25);
  ctx.bezierCurveTo(s * 0.5, -s * 0.95, s * 0.62, s * 0.1, 0, s * 0.55);
  ctx.closePath();
}

/**
 * Moves the context into ear-local space and leaves it there — the caller draws
 * the inner ear and the notch in the same space, and is responsible for the
 * surrounding save/restore.
 */
function earPath(ctx, f, side) {
  const w = 92 * f.headW;
  ctx.translate(side * w * 0.44, -96 * f.headH + 4);
  ctx.rotate(side * (0.24 + f.earDroop * 0.85));
  earShape(ctx, f);
}

function snoutRect(f) {
  return {
    x: 0,
    y: -20 + f.snoutTilt * 6,
    w: 44 * f.snoutW,
    h: 31 * (0.85 + f.snoutLen * 0.32),
  };
}

// ---------------------------------------------------------------------------
// Detail passes
// ---------------------------------------------------------------------------

function mottle(ctx, f, seed) {
  // Uneven, dirty skin. Cheap, but it stops the hide reading as flat plastic.
  const rng = makeRng(seed ^ 0x9e37);
  ctx.save();
  ctx.globalAlpha = 0.075;
  for (let i = 0; i < 26; i++) {
    const x = rng.range(-52, 52);
    const y = rng.range(-108, 4);
    const r = rng.range(4, 15);
    ctx.fillStyle = rng.chance(0.5) ? '#000' : '#ffd9b0';
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * rng.range(0.5, 1), rng.range(0, 3.14), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawEye(ctx, f, side, { blink = 0, reveal = false }) {
  const x = side * 20 * f.eyeSpacing;
  const y = -70 + f.brow * 4;
  const r = 6.3 * f.eyeSize;
  const open = 1 - blink;

  // socket — deep, so the eyes read as set into the skull rather than stuck on
  ctx.fillStyle = 'rgba(0,0,0,0.62)';
  ctx.beginPath();
  ctx.ellipse(x, y + 1, r * 2.1, r * 1.9, 0, 0, Math.PI * 2);
  ctx.fill();

  if (open > 0.06) {
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(x, y, r * 1.25, r * 1.05 * open, 0, 0, Math.PI * 2);
    ctx.clip();

    ctx.fillStyle = '#a89c88';
    ctx.fillRect(x - r * 1.4, y - r * 1.4, r * 2.8, r * 2.8);

    const iris = EYE_HEX[f.eyeColour] || '#9a968c';
    ctx.fillStyle = iris;
    ctx.beginPath();
    ctx.ellipse(x, y, r * 0.78, r * 0.78, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.beginPath();
    ctx.ellipse(x, y, r * (reveal ? 0.5 : 0.34), r * (reveal ? 0.5 : 0.34), 0, 0, Math.PI * 2);
    ctx.fill();

    // upper lid shadow — the light is above, so the top of the eye is always dark
    const g = ctx.createLinearGradient(0, y - r * 1.3, 0, y + r * 0.4);
    g.addColorStop(0, 'rgba(0,0,0,0.75)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r * 1.6, y - r * 1.6, r * 3.2, r * 2.4);

    // wet specular
    ctx.fillStyle = 'rgba(255,240,210,0.9)';
    ctx.beginPath();
    ctx.ellipse(x - r * 0.3, y - r * 0.34, r * 0.2, r * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // lid line
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.ellipse(x, y, r * 1.25, r * 1.05 * Math.max(open, 0.05), 0, 0, Math.PI * 2);
  ctx.stroke();
}

function drawSnout(ctx, f, { talk = 0 }) {
  const s = snoutRect(f);
  // Snouts take their colour from the animal, so a dark hide doesn't end up
  // wearing a bright pink disc in the middle of its face.
  const base = mix(P.hide[f.hide % P.hide.length], P.snout, 0.5);
  const grd = ctx.createLinearGradient(0, s.y - s.h * 0.6, 0, s.y + s.h * 0.7);
  grd.addColorStop(0, shade(base, 1.24));
  grd.addColorStop(0.55, shade(base, 0.98));
  grd.addColorStop(1, shade(base, 0.36));

  ctx.save();
  // contact shadow where the snout meets the face
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath();
  ctx.ellipse(0, s.y + 4, s.w * 0.56, s.h * 0.62, 0, 0, Math.PI * 2);
  ctx.filter = 'none';
  ctx.fill();

  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.ellipse(0, s.y, s.w * 0.5, s.h * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // nostrils
  const nw = 5.2 * f.nostril;
  ctx.fillStyle = 'rgba(28,14,12,0.92)';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(side * s.w * 0.17, s.y + s.h * 0.04, nw * 0.5, nw * 0.86, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // wet highlight
  ctx.fillStyle = 'rgba(255,236,205,0.34)';
  ctx.beginPath();
  ctx.ellipse(-s.w * 0.16, s.y - s.h * 0.26, s.w * 0.14, s.h * 0.1, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // mouth
  const open = talk * 7;
  ctx.strokeStyle = 'rgba(20,10,8,0.75)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-s.w * 0.42, s.y + s.h * 0.62);
  ctx.quadraticCurveTo(0, s.y + s.h * 0.72 + open, s.w * 0.42, s.y + s.h * 0.62);
  ctx.stroke();
  if (open > 1.2) {
    ctx.fillStyle = '#170b09';
    ctx.beginPath();
    ctx.moveTo(-s.w * 0.36, s.y + s.h * 0.63);
    ctx.quadraticCurveTo(0, s.y + s.h * 0.72 + open, s.w * 0.36, s.y + s.h * 0.63);
    ctx.quadraticCurveTo(0, s.y + s.h * 0.66, -s.w * 0.36, s.y + s.h * 0.63);
    ctx.fill();
  }
}

function drawTusks(ctx, f) {
  if (f.tusk <= 0.02) return;
  const s = snoutRect(f);
  const len = 6 + f.tusk * 13;
  ctx.fillStyle = shade(P.tusk, 0.72);
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.lineWidth = 1;
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(side * s.w * 0.52, s.y + s.h * 0.6);
    ctx.rotate(side * -0.25);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(side * 3, -len * 0.6, side * 1.5, -len);
    ctx.quadraticCurveTo(side * -2.4, -len * 0.5, -side * 2.4, 1);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

function drawScar(ctx, f) {
  if (f.scar === 'none') return;
  ctx.save();
  ctx.strokeStyle = 'rgba(120,58,52,0.85)';
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  if (f.scar === 'brow') {
    ctx.moveTo(-30, -92); ctx.lineTo(-16, -62);
  } else if (f.scar === 'cheek') {
    ctx.moveTo(34, -66); ctx.lineTo(24, -34);
  } else {
    ctx.moveTo(-14, -30); ctx.lineTo(12, -14);
  }
  ctx.stroke();
  // cross stitches
  ctx.lineWidth = 1.3;
  ctx.strokeStyle = 'rgba(90,42,38,0.7)';
  for (let i = 0.2; i < 0.9; i += 0.22) {
    ctx.save();
    if (f.scar === 'brow') ctx.translate(-30 + 14 * i, -92 + 30 * i);
    else if (f.scar === 'cheek') ctx.translate(34 - 10 * i, -66 + 32 * i);
    else ctx.translate(-14 + 26 * i, -30 + 16 * i);
    ctx.beginPath();
    ctx.moveTo(-4, -3); ctx.lineTo(4, 3);
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

function drawBristles(ctx, f, seed) {
  const n = Math.round(4 + f.bristle * 9);
  const rng = makeRng(seed ^ 0x51ab);
  ctx.strokeStyle = 'rgba(20,12,8,0.6)';
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const t = (i / (n - 1)) * 2 - 1;
    const x = t * 34 * f.headW;
    const y = -58 - 52 * f.headH + Math.abs(t) * 9;
    const len = 6 + f.bristle * 10 + rng.range(-2, 3);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + t * 3, y - len * 0.7, x + t * 6 + rng.range(-2, 2), y - len);
    ctx.stroke();
  }
}

function drawBody(ctx, f, { mode }) {
  // Narrower shoulders in a photograph, or the bust overruns the frame.
  const w = 150 * f.neck * (mode === 'photo' ? 0.74 : 0.92);
  const top = 6;
  const bottom = mode === 'photo' ? 78 : 230;
  const g = ctx.createLinearGradient(0, top, 0, bottom);
  g.addColorStop(0, shade(hideColour(f), 0.42));
  g.addColorStop(0.4, shade(hideColour(f), 0.2));
  g.addColorStop(1, '#0a0705');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-w * 0.28, top - 14);
  ctx.bezierCurveTo(-w * 0.55, top + 4, -w * 0.9, top + 34, -w * 1.02, bottom);
  ctx.lineTo(w * 1.02, bottom);
  ctx.bezierCurveTo(w * 0.9, top + 34, w * 0.55, top + 4, w * 0.28, top - 14);
  ctx.closePath();
  ctx.fill();

  // collar of a coat, so they aren't naked torsos
  ctx.fillStyle = 'rgba(24,18,12,0.9)';
  ctx.beginPath();
  ctx.moveTo(-w * 0.34, top - 8);
  ctx.quadraticCurveTo(0, top + 30, w * 0.34, top - 8);
  ctx.quadraticCurveTo(w * 0.2, top + 46, 0, top + 52);
  ctx.quadraticCurveTo(-w * 0.2, top + 46, -w * 0.34, top - 8);
  ctx.fill();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} f      feature set
 * @param {object} o      { x, y, scale, mode, seed, blink, talk, breath, lean, reveal, lightY }
 */
export function drawPig(ctx, f, o = {}) {
  const {
    x = 0, y = 0, scale = 1, mode = 'scene', seed = 1,
    blink = 0, talk = 0, breath = 0, lean = 0, reveal = false,
  } = o;

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.rotate(lean * 0.06);
  ctx.translate(0, breath * 2.2);

  drawBody(ctx, f, { mode });

  // ears sit behind the skull
  for (const side of [-1, 1]) {
    ctx.save();
    earPath(ctx, f, side);
    const eg = ctx.createLinearGradient(0, -30, 0, 20);
    eg.addColorStop(0, shade(hideColour(f), 0.95));
    eg.addColorStop(1, shade(hideColour(f), 0.3));
    ctx.fillStyle = eg;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // inner ear
    ctx.beginPath();
    ctx.ellipse(0, -8, 9 * f.earSize, 17 * f.earSize, 0, 0, Math.PI * 2);
    ctx.fillStyle = rgba('#3a1d1a', 0.6);
    ctx.fill();

    // notch — a bite taken out of one ear, and a tell we can forge.
    // Painted as a dark wedge rather than cut out with destination-out: that
    // would punch a real hole through the room already drawn behind the pig.
    if ((f.earNotch === 'left' && side === -1) || (f.earNotch === 'right' && side === 1)) {
      ctx.save();
      earShape(ctx, f);
      ctx.clip();
      ctx.beginPath();
      ctx.moveTo(side * 2, -26 * f.earSize);
      ctx.lineTo(side * 30, -34 * f.earSize);
      ctx.lineTo(side * 4, -11 * f.earSize);
      ctx.closePath();
      ctx.fillStyle = 'rgba(6,4,3,0.96)';
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  // skull
  ctx.save();
  headPath(ctx, f);
  ctx.clip();

  const hg = ctx.createLinearGradient(0, -118 * f.headH, 0, 10);
  // The bulb is directly overhead, so the falloff is steep — but the top two
  // thirds of the face have to stay legible, because comparing it to the
  // photograph on the card is the whole game.
  hg.addColorStop(0, shade(hideColour(f), 1.42));
  hg.addColorStop(0.34, shade(hideColour(f), 1.14));
  hg.addColorStop(0.72, shade(hideColour(f), 0.56));
  hg.addColorStop(1, shade(hideColour(f), 0.24));
  ctx.fillStyle = hg;
  ctx.fillRect(-90, -130, 180, 160);

  mottle(ctx, f, seed);

  // brow shadow
  const bg = ctx.createLinearGradient(0, -92, 0, -60);
  bg.addColorStop(0, 'rgba(0,0,0,0)');
  bg.addColorStop(1, `rgba(0,0,0,${0.16 + f.brow * 0.2})`);
  ctx.fillStyle = bg;
  ctx.fillRect(-90, -92, 180, 34);
  ctx.restore();

  // head outline keeps it readable against the dark room
  ctx.save();
  headPath(ctx, f);
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.restore();

  drawBristles(ctx, f, seed);
  drawEye(ctx, f, -1, { blink, reveal });
  drawEye(ctx, f, 1, { blink, reveal });
  if (reveal) {
    // a mimic stops bothering with the right number of eyes
    ctx.save();
    ctx.globalAlpha = 0.9;
    drawEye(ctx, { ...f, eyeSpacing: f.eyeSpacing * 2.05, eyeSize: f.eyeSize * 0.62 }, -1, { blink: 0, reveal: true });
    drawEye(ctx, { ...f, eyeSpacing: f.eyeSpacing * 2.05, eyeSize: f.eyeSize * 0.62 }, 1, { blink: 0, reveal: true });
    ctx.restore();
  }
  drawSnout(ctx, f, { talk });
  drawTusks(ctx, reveal ? { ...f, tusk: Math.max(f.tusk, 0.85) } : f);
  drawScar(ctx, f);

  if (reveal) {
    const s = snoutRect(f);
    ctx.fillStyle = '#e6dcc0';
    for (let i = -4; i <= 4; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 5.5, s.y + s.h * 0.6);
      ctx.lineTo(i * 5.5 + 2.4, s.y + s.h * 0.6 + 9 + Math.abs(i));
      ctx.lineTo(i * 5.5 + 4.8, s.y + s.h * 0.6);
      ctx.closePath();
      ctx.fill();
    }
  }

  // lamp rim — the single strongest cue that the light is overhead
  if (mode === 'scene') {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const rim = ctx.createLinearGradient(0, -118 * f.headH, 0, -34);
    rim.addColorStop(0, 'rgba(255,196,120,0.34)');
    rim.addColorStop(0.55, 'rgba(255,172,88,0.16)');
    rim.addColorStop(1, 'rgba(255,150,60,0)');
    headPath(ctx, f);
    ctx.fillStyle = rim;
    ctx.fill();
    ctx.restore();
  }

  ctx.restore();
}

// ---------------------------------------------------------------------------
// Photograph
// ---------------------------------------------------------------------------

/**
 * Renders the bust used on identity documents: desaturated, grainy, slightly
 * over-exposed. Cached per (seed, size) because documents redraw every frame.
 */
export function pigPhoto(features, seed, w = 150, h = 180) {
  const key = `${seed}|${w}x${h}|${features.hide}|${features.headW.toFixed(3)}|${features.snoutLen.toFixed(3)}|${features.earNotch}|${features.eyeSpacing.toFixed(3)}|${features.tusk.toFixed(3)}|${features.scar}|${features.eyeColour}|${features.build}|${features.earSize.toFixed(3)}|${features.headH.toFixed(3)}|${features.snoutW.toFixed(3)}|${features.jowl.toFixed(3)}`;
  const hit = photoCache.get(key);
  if (hit) return hit;

  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');

  // studio backdrop
  const bg = g.createRadialGradient(w / 2, h * 0.42, 4, w / 2, h * 0.5, h * 0.8);
  bg.addColorStop(0, '#8d8271');
  bg.addColorStop(1, '#453d33');
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);

  // A studio bulb, not the desk lamp: flatter light so the face reads.
  g.save();
  g.globalCompositeOperation = 'lighter';
  const fill = g.createRadialGradient(w / 2, h * 0.38, 2, w / 2, h * 0.45, h * 0.7);
  fill.addColorStop(0, 'rgba(255,238,206,0.30)');
  fill.addColorStop(1, 'rgba(255,220,170,0)');
  g.fillStyle = fill;
  g.fillRect(0, 0, w, h);
  g.restore();

  const scale = (h / 210) * 1.02;
  drawPig(g, features, {
    x: w / 2,
    y: h * 0.86,
    scale,
    mode: 'photo',
    seed,
  });

  // desaturate, then tint warm — a cheap darkroom
  g.globalCompositeOperation = 'saturation';
  g.fillStyle = '#808080';
  g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = 'source-over';
  g.fillStyle = 'rgba(148,116,72,0.28)';
  g.fillRect(0, 0, w, h);

  // grain + vignette
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const i = (py * w + px) * 4;
      const n = (noise2d(px, py, seed) - 0.5) * 34;
      const dx = (px - w / 2) / (w / 2);
      const dy = (py - h / 2) / (h / 2);
      const vig = 1 - Math.min(1, (dx * dx + dy * dy) * 0.26);
      d[i] = Math.max(0, Math.min(255, (d[i] + n) * vig));
      d[i + 1] = Math.max(0, Math.min(255, (d[i + 1] + n) * vig));
      d[i + 2] = Math.max(0, Math.min(255, (d[i + 2] + n) * vig));
      // A photograph is opaque. The ear-notch cut-out punches real holes in the
      // canvas, so without this the card shows whatever is behind it.
      d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);

  if (photoCache.size > 220) photoCache.clear();
  photoCache.set(key, c);
  return c;
}

definePainter('pig.seated', (ctx, o) => drawPig(ctx, o.features, o));
definePainter('pig.photo', (ctx, o) => {
  const img = pigPhoto(o.features, o.seed, o.w, o.h);
  ctx.drawImage(img, o.x, o.y, o.w, o.h);
});

export const paintPig = (ctx, o) => paint(ctx, 'pig.seated', o);

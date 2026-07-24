// The desk: the only thing in the room that is properly lit. Everything the
// player can touch lives here, so the layout rectangles are exported and the
// scenes hit-test against them directly.

import { P, rgba, shade, FONT_UI } from './palette.js';
import { VIEW_W, VIEW_H } from '../core/input.js';
import { makeRng, noise2d } from '../core/rng.js';
import { definePainter } from './painters.js';

export const DESK = {
  far: 618,
  farLeft: 120,
  farRight: 1480,
  near: VIEW_H,
};

/** Where things sit on the desk, in screen space. */
export const SLOTS = {
  applicantDocs: { x: 556, y: 658, w: 450, h: 190 },
  recordsStack: { x: 58, y: 658, w: 310, h: 172 },
  red: { x: 1152, y: 726, r: 44 },
  yellow: { x: 1288, y: 732, r: 32 },
  green: { x: 1424, y: 726, r: 44 },
  compare: { x: 1224, y: 648, w: 128, h: 38 },
};

export function deskTopAt(x) {
  // The far edge is a straight line; this is only here so props can sit on it.
  return DESK.far;
}

let grainTile = null;
function buildGrain() {
  const w = 512, h = 256;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = P.woodMid;
  g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const warp = Math.sin(x * 0.012 + y * 0.05) * 7;
      const n = noise2d(x >> 2, (y + warp) >> 0, 3);
      const band = Math.sin((y + warp) * 0.55 + noise2d(x >> 4, 0, 9) * 6) * 0.5 + 0.5;
      const v = n * 0.35 + band * 0.65;
      if (v > 0.72) { g.fillStyle = `rgba(0,0,0,${(v - 0.72) * 0.9})`; g.fillRect(x, y, 1, 1); }
      else if (v < 0.3) { g.fillStyle = `rgba(190,130,70,${(0.3 - v) * 0.35})`; g.fillRect(x, y, 1, 1); }
    }
  }
  // a few gouges and ring stains
  const rng = makeRng(88);
  for (let i = 0; i < 5; i++) {
    g.strokeStyle = 'rgba(0,0,0,0.35)';
    g.lineWidth = rng.range(1, 2.4);
    g.beginPath();
    const x0 = rng.range(0, w), y0 = rng.range(0, h);
    g.moveTo(x0, y0);
    g.lineTo(x0 + rng.range(-70, 70), y0 + rng.range(-9, 9));
    g.stroke();
  }
  for (let i = 0; i < 3; i++) {
    g.strokeStyle = 'rgba(30,16,6,0.3)';
    g.lineWidth = 3;
    g.beginPath();
    g.arc(rng.range(0, w), rng.range(0, h), rng.range(16, 30), 0, Math.PI * 2);
    g.stroke();
  }
  grainTile = c;
}

export function drawDesk(ctx, o = {}) {
  const { px = 0, py = 0, lamp = 1 } = o;
  if (!grainTile) buildGrain();
  const shift = px * 8;
  const lift = py * 4;

  ctx.save();
  ctx.translate(shift, lift);

  // The surface, in perspective: narrow at the back, full-bleed at the front.
  ctx.beginPath();
  ctx.moveTo(DESK.farLeft, DESK.far);
  ctx.lineTo(DESK.farRight, DESK.far);
  ctx.lineTo(VIEW_W + 120, VIEW_H + 40);
  ctx.lineTo(-120, VIEW_H + 40);
  ctx.closePath();
  ctx.save();
  ctx.clip();

  const pat = ctx.createPattern(grainTile, 'repeat');
  ctx.fillStyle = pat;
  ctx.save();
  ctx.translate(0, DESK.far);
  ctx.scale(2.6, 1.55);
  ctx.fillRect(-200, -20, VIEW_W, VIEW_H);
  ctx.restore();

  // Depth shading: dark at the back, warm where the lamp lands, dark again at
  // the very front where the player's own body would block the light. The wood
  // is kept well under the lamp's brightness so the papers on it stay the
  // lightest thing on screen.
  const g = ctx.createLinearGradient(0, DESK.far, 0, VIEW_H);
  g.addColorStop(0, 'rgba(0,0,0,0.86)');
  g.addColorStop(0.24, 'rgba(0,0,0,0.55)');
  g.addColorStop(0.62, 'rgba(0,0,0,0.44)');
  g.addColorStop(1, 'rgba(0,0,0,0.78)');
  ctx.fillStyle = g;
  ctx.fillRect(-200, DESK.far - 10, VIEW_W + 400, VIEW_H);

  // lamp pool on the wood
  if (lamp > 0.02) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const pool = ctx.createRadialGradient(VIEW_W / 2, DESK.far + 130, 20, VIEW_W / 2, DESK.far + 150, 700);
    pool.addColorStop(0, `rgba(255,196,116,${0.30 * lamp})`);
    pool.addColorStop(0.45, `rgba(255,160,70,${0.10 * lamp})`);
    pool.addColorStop(1, 'rgba(255,140,40,0)');
    ctx.fillStyle = pool;
    ctx.fillRect(-200, DESK.far - 40, VIEW_W + 400, VIEW_H);
    ctx.restore();
  }

  // edges dark
  const sideL = ctx.createLinearGradient(0, 0, 260, 0);
  sideL.addColorStop(0, 'rgba(0,0,0,0.7)');
  sideL.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sideL;
  ctx.fillRect(-120, DESK.far, 380, VIEW_H);
  const sideR = ctx.createLinearGradient(VIEW_W, 0, VIEW_W - 260, 0);
  sideR.addColorStop(0, 'rgba(0,0,0,0.7)');
  sideR.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sideR;
  ctx.fillRect(VIEW_W - 260, DESK.far, 380, VIEW_H);
  ctx.restore();

  // Bright lip along the far edge — reads as a hard table edge under a bulb.
  ctx.strokeStyle = rgba(P.lampWarm, 0.35 * lamp + 0.06);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(DESK.farLeft, DESK.far);
  ctx.lineTo(DESK.farRight, DESK.far);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.8)';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(DESK.farLeft, DESK.far + 6);
  ctx.lineTo(DESK.farRight, DESK.far + 6);
  ctx.stroke();

  ctx.restore();
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

export function drawDeskButton(ctx, o) {
  const { x, y, r, colour, dim, hover = false, press = 0, label = '', glow = 0, disabled = false } = o;
  const sink = press * 5;

  ctx.save();
  // brass housing
  ctx.fillStyle = '#150d06';
  ctx.beginPath();
  ctx.ellipse(x, y + 8, r * 1.34, r * 0.62, 0, 0, Math.PI * 2);
  ctx.fill();

  const ring = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
  ring.addColorStop(0, '#6d5227');
  ring.addColorStop(0.45, '#2e2211');
  ring.addColorStop(1, '#0f0a05');
  ctx.fillStyle = ring;
  ctx.beginPath();
  ctx.ellipse(x, y + 4, r * 1.22, r * 0.98, 0, 0, Math.PI * 2);
  ctx.fill();

  // cap
  const capY = y + sink;
  const cg = ctx.createRadialGradient(x - r * 0.3, capY - r * 0.4, r * 0.1, x, capY, r * 1.15);
  cg.addColorStop(0, shade(colour, disabled ? 0.7 : 1.55));
  cg.addColorStop(0.55, disabled ? shade(colour, 0.5) : colour);
  cg.addColorStop(1, dim);
  ctx.fillStyle = cg;
  ctx.beginPath();
  ctx.ellipse(x, capY, r, r * 0.82, 0, 0, Math.PI * 2);
  ctx.fill();

  // specular
  ctx.fillStyle = `rgba(255,240,210,${hover && !disabled ? 0.34 : 0.18})`;
  ctx.beginPath();
  ctx.ellipse(x - r * 0.26, capY - r * 0.34, r * 0.34, r * 0.18, -0.4, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(x, capY, r, r * 0.82, 0, 0, Math.PI * 2);
  ctx.stroke();

  if (glow > 0.01 && !disabled) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const gg = ctx.createRadialGradient(x, capY, 0, x, capY, r * 3.2);
    gg.addColorStop(0, rgba(colour, 0.32 * glow));
    gg.addColorStop(1, rgba(colour, 0));
    ctx.fillStyle = gg;
    ctx.beginPath();
    ctx.arc(x, capY, r * 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  if (label) {
    ctx.fillStyle = hover && !disabled ? P.amberBright : 'rgba(160,128,74,0.75)';
    ctx.font = `10px ${FONT_UI}`;
    ctx.textAlign = 'center';
    ctx.letterSpacing = '2px';
    ctx.fillText(label, x, y + r * 0.98 + 26);
    ctx.letterSpacing = '0px';
  }
  ctx.restore();
}

/** Engraved brass plate used for the compare toggle. */
export function drawPlate(ctx, r, label, { hover = false, active = false } = {}) {
  ctx.save();
  const g = ctx.createLinearGradient(r.x, r.y, r.x, r.y + r.h);
  g.addColorStop(0, active ? '#6a5026' : '#3a2c15');
  g.addColorStop(1, '#140d06');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.w, r.h, 5);
  ctx.fill();
  ctx.strokeStyle = hover || active ? rgba(P.amber, 0.8) : 'rgba(0,0,0,0.7)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = hover || active ? P.amberBright : P.amberDim;
  ctx.font = `12px ${FONT_UI}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.letterSpacing = '2px';
  ctx.fillText(label, r.x + r.w / 2, r.y + r.h / 2 + 1);
  ctx.letterSpacing = '0px';
  ctx.restore();
}

/** A loose pile of paper seen from the player's seat. */
export function drawStack(ctx, r, { count = 3, seed = 1, hover = false, tint = shade(P.paper, 0.88), label = null } = {}) {
  const rng = makeRng(seed);
  ctx.save();
  for (let i = 0; i < count; i++) {
    const a = rng.range(-0.05, 0.05);
    const dx = rng.range(-10, 10);
    const dy = rng.range(-6, 6) + i * 2.5;
    ctx.save();
    ctx.translate(r.x + r.w / 2 + dx, r.y + r.h / 2 + dy);
    ctx.rotate(a);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(-r.w / 2 + 5, -r.h / 2 + 7, r.w, r.h);
    const g = ctx.createLinearGradient(0, -r.h / 2, 0, r.h / 2);
    g.addColorStop(0, shade(tint, 1.04));
    g.addColorStop(1, shade(tint, 0.62));
    ctx.fillStyle = g;
    ctx.fillRect(-r.w / 2, -r.h / 2, r.w, r.h);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(-r.w / 2, -r.h / 2, r.w, r.h);

    // suggestion of type, not actual text
    ctx.fillStyle = 'rgba(40,30,18,0.35)';
    for (let l = 0; l < 6; l++) {
      const lw = r.w * rng.range(0.3, 0.78);
      ctx.fillRect(-r.w / 2 + 14, -r.h / 2 + 22 + l * 13, lw, 2.4);
    }
    ctx.restore();
  }
  if (hover) {
    ctx.strokeStyle = rgba(P.amberBright, 0.75);
    ctx.lineWidth = 2;
    ctx.setLineDash([7, 6]);
    ctx.strokeRect(r.x - 8, r.y - 10, r.w + 16, r.h + 22);
    ctx.setLineDash([]);
  }
  if (label) {
    ctx.fillStyle = hover ? P.amberBright : 'rgba(150,120,70,0.65)';
    ctx.font = `12px ${FONT_UI}`;
    ctx.textAlign = 'center';
    ctx.letterSpacing = '3px';
    ctx.fillText(label, r.x + r.w / 2, r.y - 14);
    ctx.letterSpacing = '0px';
  }
  ctx.restore();
}

definePainter('desk.surface', (ctx, o) => drawDesk(ctx, o));
definePainter('desk.button', (ctx, o) => drawDeskButton(ctx, o));
definePainter('desk.stack', (ctx, o) => drawStack(ctx, o.rect, o));

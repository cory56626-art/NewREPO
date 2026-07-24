// Atmosphere passes that run over the top of every scene: the lamp's pool of
// light, the vignette that swallows the corners, and the film grain that keeps
// large flat gradients from banding.

import { VIEW_W, VIEW_H } from '../core/input.js';

let grainTile = null;

function buildGrain() {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 118 + Math.random() * 74;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  grainTile = c;
}

export function grain(ctx, alpha = 0.05) {
  if (!grainTile) buildGrain();
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = alpha;
  const ox = -Math.floor(Math.random() * 128);
  const oy = -Math.floor(Math.random() * 128);
  const pat = ctx.createPattern(grainTile, 'repeat');
  ctx.translate(ox, oy);
  ctx.fillStyle = pat;
  ctx.fillRect(0, 0, VIEW_W + 128, VIEW_H + 128);
  ctx.restore();
}

export function vignette(ctx, strength = 1, cx = VIEW_W / 2, cy = VIEW_H * 0.44) {
  const g = ctx.createRadialGradient(cx, cy, VIEW_H * 0.16, cx, cy, VIEW_H * 1.02);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(0.55, `rgba(0,0,0,${0.25 * strength})`);
  g.addColorStop(1, `rgba(0,0,0,${0.93 * strength})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
}

/** Warm bloom cast down from the bulb. */
export function lampPool(ctx, x, y, radius, intensity = 1) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
  g.addColorStop(0, `rgba(255, 208, 138, ${0.42 * intensity})`);
  g.addColorStop(0.35, `rgba(255, 168, 84, ${0.16 * intensity})`);
  g.addColorStop(1, 'rgba(255, 140, 40, 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** A soft cone of light falling from the shade. */
export function lightCone(ctx, x, y, spread, length, intensity = 1) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createLinearGradient(0, y, 0, y + length);
  g.addColorStop(0, `rgba(255,196,116,${0.15 * intensity})`);
  g.addColorStop(0.45, `rgba(255,168,84,${0.055 * intensity})`);
  g.addColorStop(1, 'rgba(255,150,60,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(x - spread * 0.22, y);
  ctx.lineTo(x + spread * 0.22, y);
  ctx.lineTo(x + spread, y + length);
  ctx.lineTo(x - spread, y + length);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Flashlight mask for the night shift: everything dark but a moving cone. */
export function flashlightMask(ctx, x, y, radius, darkness = 0.93) {
  ctx.save();
  const g = ctx.createRadialGradient(x, y, radius * 0.08, x, y, radius);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(0.42, `rgba(0,0,0,${darkness * 0.35})`);
  g.addColorStop(0.78, `rgba(0,0,0,${darkness * 0.82})`);
  g.addColorStop(1, `rgba(0,0,0,${darkness})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.restore();
}

/** Warm light the torch itself throws onto what it hits. */
export function flashlightGlow(ctx, x, y, radius) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(x, y, 0, x, y, radius * 0.8);
  g.addColorStop(0, 'rgba(226,206,158,0.16)');
  g.addColorStop(1, 'rgba(226,206,158,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.restore();
}

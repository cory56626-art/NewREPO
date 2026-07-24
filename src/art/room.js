// The room on the other side of the desk. Almost all of it is black; what sells
// the space is the cord and shade of the single bulb, the cone of light under it,
// and the fact that the chair and the far wall are only ever half-visible.

import { P, rgba, shade } from './palette.js';
import { VIEW_W, VIEW_H } from '../core/input.js';
import { noise2d, makeRng } from '../core/rng.js';
import { lightCone, lampPool } from './lighting.js';
import { definePainter } from './painters.js';

export const LAMP = { x: VIEW_W / 2, y: 168 };

let wallTile = null;
function buildWall() {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = P.wallFar;
  g.fillRect(0, 0, size, size);
  // damp patches and peeling plaster
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = noise2d(x >> 1, y >> 1, 7) * 0.6 + noise2d(x >> 3, y >> 3, 19) * 0.4;
      if (n > 0.62) {
        g.fillStyle = `rgba(60,44,28,${(n - 0.62) * 0.5})`;
        g.fillRect(x, y, 1, 1);
      } else if (n < 0.22) {
        g.fillStyle = `rgba(0,0,0,${(0.22 - n) * 0.7})`;
        g.fillRect(x, y, 1, 1);
      }
    }
  }
  wallTile = c;
}

export function drawRoom(ctx, o = {}) {
  const { px = 0, py = 0, lamp = 1, sway = 0, horizon = 560 } = o;
  if (!wallTile) buildWall();

  ctx.save();
  ctx.fillStyle = P.void;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  ctx.translate(px * 22, py * 10);

  // back wall
  ctx.save();
  ctx.fillStyle = ctx.createPattern(wallTile, 'repeat');
  ctx.fillRect(-40, -40, VIEW_W + 80, horizon + 60);
  const wallShade = ctx.createLinearGradient(0, 0, 0, horizon);
  wallShade.addColorStop(0, 'rgba(0,0,0,0.86)');
  wallShade.addColorStop(0.42, 'rgba(0,0,0,0.4)');
  wallShade.addColorStop(1, 'rgba(0,0,0,0.72)');
  ctx.fillStyle = wallShade;
  ctx.fillRect(-40, -40, VIEW_W + 80, horizon + 60);
  ctx.restore();

  // floor
  const fg = ctx.createLinearGradient(0, horizon, 0, VIEW_H);
  fg.addColorStop(0, P.floor);
  fg.addColorStop(1, '#070503');
  ctx.fillStyle = fg;
  ctx.fillRect(-40, horizon, VIEW_W + 80, VIEW_H - horizon + 40);

  // skirting
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.fillRect(-40, horizon - 12, VIEW_W + 80, 12);

  // side walls fold in and eat the corners
  const left = ctx.createLinearGradient(0, 0, 300, 0);
  left.addColorStop(0, 'rgba(0,0,0,0.95)');
  left.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = left;
  ctx.fillRect(-40, -40, 340, VIEW_H + 80);
  const right = ctx.createLinearGradient(VIEW_W, 0, VIEW_W - 300, 0);
  right.addColorStop(0, 'rgba(0,0,0,0.95)');
  right.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = right;
  ctx.fillRect(VIEW_W - 300, -40, 340, VIEW_H + 80);

  // doorway they pace in through, on the right
  drawDoorway(ctx, horizon);

  ctx.restore();

  drawChair(ctx, { px, py, horizon });
  drawLamp(ctx, { px, py, lamp, sway });
}

function drawDoorway(ctx, horizon) {
  const x = VIEW_W - 250;
  const w = 190;
  const top = horizon - 430;
  ctx.save();
  ctx.fillStyle = '#040302';
  ctx.fillRect(x, top, w, horizon - top);
  ctx.strokeStyle = 'rgba(90,66,38,0.22)';
  ctx.lineWidth = 5;
  ctx.strokeRect(x, top, w, horizon - top);
  // faint spill from the corridor beyond
  const g = ctx.createLinearGradient(x, top, x, horizon);
  g.addColorStop(0, 'rgba(120,86,44,0.10)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x, top, w, horizon - top);
  ctx.restore();
}

function drawChair(ctx, { px, py, horizon }) {
  ctx.save();
  ctx.translate(VIEW_W / 2 + px * 14, py * 6);

  // shadow pooled under it
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.beginPath();
  ctx.ellipse(0, horizon + 26, 170, 34, 0, 0, Math.PI * 2);
  ctx.fill();

  const post = (x, topY, botY, w) => {
    const g = ctx.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
    g.addColorStop(0, '#1a1109');
    g.addColorStop(0.35, '#432b15');
    g.addColorStop(1, '#0d0805');
    ctx.fillStyle = g;
    ctx.fillRect(x - w / 2, topY, w, botY - topY);
  };

  // back posts and rails, seen behind whoever is sitting
  post(-104, horizon - 330, horizon + 10, 18);
  post(104, horizon - 330, horizon + 10, 18);
  ctx.fillStyle = '#2e1c0e';
  ctx.fillRect(-112, horizon - 330, 224, 20);
  ctx.fillRect(-112, horizon - 274, 224, 14);
  ctx.fillStyle = 'rgba(255,186,92,0.10)';
  ctx.fillRect(-112, horizon - 330, 224, 4);

  // seat slab
  ctx.fillStyle = '#3a2412';
  ctx.fillRect(-124, horizon - 96, 248, 22);
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(-124, horizon - 76, 248, 12);
  ctx.restore();
}

function drawLamp(ctx, { px, py, lamp, sway }) {
  const x = LAMP.x + px * 8 + Math.sin(sway) * 9;
  const y = LAMP.y;
  ctx.save();

  // cord
  ctx.strokeStyle = '#191207';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(VIEW_W / 2 + px * 3, -10);
  ctx.quadraticCurveTo((VIEW_W / 2 + x) / 2, y * 0.55, x, y - 46);
  ctx.stroke();

  // conical shade
  ctx.beginPath();
  ctx.moveTo(x - 16, y - 48);
  ctx.lineTo(x + 16, y - 48);
  ctx.lineTo(x + 78, y + 6);
  ctx.lineTo(x - 78, y + 6);
  ctx.closePath();
  const sg = ctx.createLinearGradient(x - 78, 0, x + 78, 0);
  sg.addColorStop(0, '#0d0906');
  sg.addColorStop(0.35, '#2f2418');
  sg.addColorStop(0.6, '#3d2f1d');
  sg.addColorStop(1, '#0a0704');
  ctx.fillStyle = sg;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.7)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // hot inner lip of the shade
  ctx.fillStyle = rgba(P.bulbHot, 0.5 * lamp);
  ctx.fillRect(x - 76, y + 2, 152, 5);

  if (lamp > 0.02) {
    // bulb
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const bg = ctx.createRadialGradient(x, y + 16, 1, x, y + 16, 62);
    bg.addColorStop(0, rgba(P.bulbCore, 0.95 * lamp));
    bg.addColorStop(0.18, rgba(P.bulbHot, 0.7 * lamp));
    bg.addColorStop(1, 'rgba(255,150,60,0)');
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.arc(x, y + 16, 62, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = rgba(P.bulbCore, 0.9 * lamp);
    ctx.beginPath();
    ctx.ellipse(x, y + 16, 9, 12, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  if (lamp > 0.02) {
    lightCone(ctx, x, y + 6, 300, 620, lamp);
    lampPool(ctx, x, y + 330, 520, lamp * 0.55);
  }
}

/** Slow dust drifting through the cone. Purely atmosphere. */
export function drawDust(ctx, t, count = 40) {
  const rng = makeRng(4242);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < count; i++) {
    const bx = rng.range(VIEW_W * 0.24, VIEW_W * 0.76);
    const by = rng.range(120, 640);
    const sp = rng.range(0.05, 0.28);
    const amp = rng.range(8, 34);
    const x = bx + Math.sin(t * sp + i) * amp;
    const y = by + ((t * rng.range(3, 11) + i * 37) % 320) - 160;
    const a = 0.05 + Math.sin(t * 0.9 + i) * 0.03;
    if (a <= 0) continue;
    ctx.fillStyle = `rgba(255,214,160,${a})`;
    ctx.beginPath();
    ctx.arc(x, y, rng.range(0.7, 1.9), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

definePainter('room.base', (ctx, o) => drawRoom(ctx, o));
definePainter('room.dust', (ctx, o) => drawDust(ctx, o.t, o.count));

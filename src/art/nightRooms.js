// The Complex after dark. Each room is a flat little stage drawn in the same
// palette as the office; the flashlight mask in the night scene is what makes it
// frightening, so these paint fairly plainly and let the dark do the work.

import { P, rgba, shade } from './palette.js';
import { VIEW_W, VIEW_H } from '../core/input.js';
import { makeRng, noise2d } from '../core/rng.js';
import { definePainter } from './painters.js';

const HORIZON = 470;

function shell(ctx, { wall = '#171009', floor = '#0f0a06' } = {}) {
  ctx.fillStyle = '#050403';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  // back wall
  const wg = ctx.createLinearGradient(0, 0, 0, HORIZON);
  wg.addColorStop(0, shade(wall, 0.5));
  wg.addColorStop(1, wall);
  ctx.fillStyle = wg;
  ctx.fillRect(0, 0, VIEW_W, HORIZON);

  // floor in perspective
  const fg = ctx.createLinearGradient(0, HORIZON, 0, VIEW_H);
  fg.addColorStop(0, shade(floor, 1.5));
  fg.addColorStop(1, floor);
  ctx.fillStyle = fg;
  ctx.fillRect(0, HORIZON, VIEW_W, VIEW_H - HORIZON);

  // floorboards converging
  ctx.save();
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.lineWidth = 2;
  for (let i = -6; i <= 6; i++) {
    ctx.beginPath();
    ctx.moveTo(VIEW_W / 2 + i * 40, HORIZON);
    ctx.lineTo(VIEW_W / 2 + i * 300, VIEW_H + 40);
    ctx.stroke();
  }
  for (let i = 1; i < 7; i++) {
    const y = HORIZON + Math.pow(i / 7, 1.7) * (VIEW_H - HORIZON) * 1.1;
    ctx.beginPath();
    ctx.moveTo(-40, y);
    ctx.lineTo(VIEW_W + 40, y);
    ctx.stroke();
  }
  ctx.restore();

  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, HORIZON - 14, VIEW_W, 14);
}

function grime(ctx, seed, n = 30) {
  const rng = makeRng(seed);
  ctx.save();
  for (let i = 0; i < n; i++) {
    const x = rng.range(0, VIEW_W);
    const y = rng.range(60, VIEW_H);
    const r = rng.range(20, 90);
    ctx.fillStyle = `rgba(0,0,0,${rng.range(0.1, 0.3)})`;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * rng.range(0.3, 0.9), rng.range(0, 3), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function door(ctx, x, w, label, { open = false, marked = false } = {}) {
  const top = HORIZON - 300;
  ctx.save();
  ctx.fillStyle = open ? '#050303' : '#2a1a0d';
  ctx.fillRect(x, top, w, HORIZON - top);
  ctx.strokeStyle = 'rgba(90,66,36,0.5)';
  ctx.lineWidth = 3;
  ctx.strokeRect(x, top, w, HORIZON - top);
  if (!open) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(x + 12, top + 18, w - 24, 110);
    ctx.fillRect(x + 12, top + 148, w - 24, 110);
    ctx.fillStyle = '#8a6a34';
    ctx.beginPath();
    ctx.arc(x + w - 20, top + 175, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  if (label) {
    ctx.fillStyle = 'rgba(214,190,140,0.75)';
    ctx.font = '15px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(label, x + w / 2, top - 12);
  }
  if (marked) {
    ctx.strokeStyle = rgba(P.blood, 0.9);
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(x + 20, top + 40);
    ctx.lineTo(x + w - 20, top + 120);
    ctx.moveTo(x + w - 20, top + 40);
    ctx.lineTo(x + 20, top + 120);
    ctx.stroke();
  }
  ctx.restore();
}

function bloodPool(ctx, x, y, r, seed) {
  const rng = makeRng(seed);
  ctx.save();
  ctx.fillStyle = P.blood;
  ctx.beginPath();
  ctx.ellipse(x, y, r, r * 0.44, 0, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 9; i++) {
    const a = rng.range(0, Math.PI * 2);
    const d = rng.range(r * 0.7, r * 1.7);
    ctx.beginPath();
    ctx.ellipse(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.4, rng.range(3, 13), rng.range(2, 6), a, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(140,30,24,0.35)';
  ctx.beginPath();
  ctx.ellipse(x - r * 0.2, y - r * 0.1, r * 0.4, r * 0.16, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

const ROOM_PAINTERS = {
  hall(ctx, o) {
    shell(ctx, { wall: '#191108', floor: '#100a06' });
    door(ctx, 120, 150, '3A');
    door(ctx, 350, 150, '3B');
    door(ctx, VIEW_W - 500, 150, '3C', { marked: o.marked });
    door(ctx, VIEW_W - 270, 150, '3D', { open: true });
    // dead bulb and its cage
    ctx.save();
    ctx.strokeStyle = 'rgba(70,52,26,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(VIEW_W / 2, 0);
    ctx.lineTo(VIEW_W / 2, 96);
    ctx.stroke();
    ctx.fillStyle = '#221a10';
    ctx.beginPath();
    ctx.arc(VIEW_W / 2, 110, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    grime(ctx, 11);
  },

  unit(ctx, o) {
    shell(ctx, { wall: '#1b1209', floor: '#120c07' });
    // bed
    ctx.save();
    ctx.fillStyle = '#2b1c10';
    ctx.fillRect(180, HORIZON - 40, 420, 150);
    ctx.fillStyle = '#4a3a26';
    ctx.fillRect(180, HORIZON - 70, 420, 44);
    ctx.fillStyle = 'rgba(180,166,132,0.5)';
    ctx.fillRect(196, HORIZON - 66, 150, 36);
    ctx.restore();
    // table and chair
    ctx.fillStyle = '#33210f';
    ctx.fillRect(900, HORIZON - 10, 320, 22);
    ctx.fillRect(920, HORIZON + 12, 16, 120);
    ctx.fillRect(1184, HORIZON + 12, 16, 120);
    ctx.fillStyle = '#241708';
    ctx.fillRect(1270, HORIZON - 120, 90, 240);
    // window, painted shut, open two inches
    ctx.save();
    ctx.fillStyle = '#07100f';
    ctx.fillRect(700, 110, 220, 250);
    ctx.strokeStyle = 'rgba(96,74,40,0.7)';
    ctx.lineWidth = 6;
    ctx.strokeRect(700, 110, 220, 250);
    ctx.fillStyle = 'rgba(120,140,150,0.10)';
    ctx.fillRect(706, 116, 208, 120);
    ctx.restore();
    if (o.marked) bloodPool(ctx, 620, HORIZON + 150, 130, 5);
    grime(ctx, 21);
  },

  laundry(ctx) {
    shell(ctx, { wall: '#14120c', floor: '#0d0c08' });
    for (let i = 0; i < 4; i++) {
      const x = 180 + i * 300;
      ctx.fillStyle = '#241f16';
      ctx.fillRect(x, HORIZON - 190, 220, 190);
      ctx.fillStyle = '#0c0a07';
      ctx.beginPath();
      ctx.arc(x + 110, HORIZON - 100, 62, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(120,110,90,0.35)';
      ctx.lineWidth = 4;
      ctx.stroke();
    }
    // standing water
    ctx.save();
    const wg = ctx.createLinearGradient(0, HORIZON + 60, 0, VIEW_H);
    wg.addColorStop(0, 'rgba(30,40,44,0.55)');
    wg.addColorStop(1, 'rgba(12,18,20,0.75)');
    ctx.fillStyle = wg;
    ctx.fillRect(0, HORIZON + 60, VIEW_W, VIEW_H - HORIZON - 60);
    ctx.restore();
    grime(ctx, 31, 18);
  },

  boiler(ctx) {
    shell(ctx, { wall: '#1c1108', floor: '#130b05' });
    // the boiler itself
    ctx.save();
    const g = ctx.createLinearGradient(600, 0, 1000, 0);
    g.addColorStop(0, '#2b1d10');
    g.addColorStop(0.5, '#4a3218');
    g.addColorStop(1, '#1a1108');
    ctx.fillStyle = g;
    ctx.fillRect(600, 120, 400, 350);
    ctx.fillStyle = '#120b05';
    ctx.beginPath();
    ctx.arc(800, 340, 76, 0, Math.PI * 2);
    ctx.fill();
    // firebox glow
    const fg = ctx.createRadialGradient(800, 340, 4, 800, 340, 90);
    fg.addColorStop(0, 'rgba(255,140,40,0.55)');
    fg.addColorStop(1, 'rgba(255,90,20,0)');
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.arc(800, 340, 90, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // pipes
    ctx.strokeStyle = '#3a2a16';
    ctx.lineWidth = 22;
    ctx.beginPath();
    ctx.moveTo(0, 90); ctx.lineTo(560, 90); ctx.lineTo(560, 200); ctx.lineTo(600, 200);
    ctx.moveTo(1000, 160); ctx.lineTo(1400, 160); ctx.lineTo(1400, 40);
    ctx.stroke();
    grime(ctx, 41, 22);
  },

  stair(ctx) {
    shell(ctx, { wall: '#150e07', floor: '#0d0805' });
    ctx.save();
    for (let i = 0; i < 9; i++) {
      const w = 700 - i * 52;
      const h = 34;
      const x = VIEW_W / 2 - w / 2;
      const y = VIEW_H - 60 - i * h * 0.92;
      ctx.fillStyle = i % 2 ? '#241708' : '#2c1d0c';
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(x, y + h - 7, w, 7);
    }
    ctx.restore();
    // handrail
    ctx.strokeStyle = 'rgba(90,66,36,0.6)';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(240, VIEW_H - 40);
    ctx.lineTo(VIEW_W / 2 - 130, HORIZON - 60);
    ctx.moveTo(VIEW_W - 240, VIEW_H - 40);
    ctx.lineTo(VIEW_W / 2 + 130, HORIZON - 60);
    ctx.stroke();
    grime(ctx, 51, 16);
  },
};

export function drawNightRoom(ctx, roomId, o = {}) {
  const painter = ROOM_PAINTERS[roomId] || ROOM_PAINTERS.hall;
  painter(ctx, o);
}

/** A clue, drawn only where the torch finds it. */
export function drawClueMark(ctx, x, y, { found, hovered, t }) {
  ctx.save();
  const pulse = 0.6 + Math.sin(t * 3) * 0.25;
  ctx.globalAlpha = found ? 0.5 : 1;
  ctx.strokeStyle = found ? rgba(P.ok, 0.8) : rgba(P.amberBright, hovered ? 1 : pulse);
  ctx.lineWidth = hovered ? 3 : 2;
  ctx.beginPath();
  ctx.arc(x, y, hovered ? 26 : 21, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, 4, 0, Math.PI * 2);
  ctx.fillStyle = found ? P.ok : P.amberBright;
  ctx.fill();
  if (!found) {
    ctx.globalAlpha = 0.35 * pulse;
    ctx.beginPath();
    ctx.arc(x, y, 34, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

definePainter('night.room', (ctx, o) => drawNightRoom(ctx, o.roomId, o));

// The only permanent overlay: two small controls bottom-left and the money
// counter bottom-right, matching the reference office. Everything else the player
// needs is a physical object on the desk.

import { P, rgba, FONT_UI } from '../art/palette.js';
import { VIEW_W, VIEW_H, rect } from '../core/input.js';
import { text } from './widgets.js';
import { state } from '../core/state.js';
import { isMuted } from '../core/audio.js';

export const HUD_RECTS = {
  pause: rect(28, 828, 52, 52),
  lamp: rect(92, 828, 52, 52),
  mute: rect(156, 828, 52, 52),
};

let shownMoney = null;

function iconButton(ctx, input, r, draw, { active = false } = {}) {
  const hovered = input.hover(r);
  const clicked = input.clicked(r);
  ctx.save();
  ctx.fillStyle = hovered ? 'rgba(48,36,18,0.92)' : 'rgba(16,12,7,0.86)';
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.w, r.h, 7);
  ctx.fill();
  ctx.strokeStyle = hovered ? rgba(P.amber, 0.9) : 'rgba(110,86,44,0.55)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.translate(r.x + r.w / 2, r.y + r.h / 2);
  ctx.fillStyle = active ? P.amberBright : (hovered ? P.amber : 'rgba(170,138,80,0.8)');
  ctx.strokeStyle = ctx.fillStyle;
  draw(ctx);
  ctx.restore();
  return clicked;
}

const pauseIcon = (ctx) => {
  ctx.fillRect(-8, -10, 6, 20);
  ctx.fillRect(2, -10, 6, 20);
};

const boltIcon = (ctx) => {
  ctx.beginPath();
  ctx.moveTo(3, -12);
  ctx.lineTo(-7, 2);
  ctx.lineTo(-1, 2);
  ctx.lineTo(-3, 12);
  ctx.lineTo(7, -3);
  ctx.lineTo(1, -3);
  ctx.closePath();
  ctx.fill();
};

const speakerIcon = (muted) => (ctx) => {
  ctx.beginPath();
  ctx.moveTo(-9, -4); ctx.lineTo(-4, -4); ctx.lineTo(1, -10);
  ctx.lineTo(1, 10); ctx.lineTo(-4, 4); ctx.lineTo(-9, 4);
  ctx.closePath();
  ctx.fill();
  ctx.lineWidth = 2;
  if (muted) {
    ctx.beginPath();
    ctx.moveTo(5, -6); ctx.lineTo(12, 6);
    ctx.moveTo(12, -6); ctx.lineTo(5, 6);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(2, 0, 7, -0.9, 0.9);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(2, 0, 11, -0.8, 0.8);
    ctx.stroke();
  }
};

/**
 * @returns {{pause:boolean, lamp:boolean, mute:boolean}} which control was hit
 */
export function drawHud(ctx, input, o = {}) {
  const { lampOn = true, showMoney = true } = o;
  const hits = {
    pause: iconButton(ctx, input, HUD_RECTS.pause, pauseIcon),
    lamp: iconButton(ctx, input, HUD_RECTS.lamp, boltIcon, { active: lampOn }),
    mute: iconButton(ctx, input, HUD_RECTS.mute, speakerIcon(isMuted())),
  };

  if (showMoney) {
    // Counts up rather than snapping, like a till.
    if (shownMoney === null) shownMoney = state.money;
    shownMoney += (state.money - shownMoney) * 0.12;
    if (Math.abs(state.money - shownMoney) < 0.6) shownMoney = state.money;
    const value = Math.round(shownMoney);

    ctx.save();
    ctx.shadowColor = 'rgba(255,170,70,0.55)';
    ctx.shadowBlur = 22;
    text(ctx, String(value), VIEW_W - 40, VIEW_H - 34, {
      size: 46, colour: '#f0c274', align: 'right', spacing: 7, bold: false,
    });
    ctx.restore();
    text(ctx, 'SCRIP', VIEW_W - 42, VIEW_H - 78, {
      size: 11, colour: 'rgba(170,132,70,0.6)', align: 'right', spacing: 5,
    });
  }
  return hits;
}

export function resetHudCounter() { shownMoney = null; }

/** Small day/date plate — diegetic, printed on a card taped to the desk edge. */
export function dayPlate(ctx, day, dateStr, extra) {
  ctx.save();
  ctx.translate(232, 838);
  ctx.rotate(-0.02);
  ctx.fillStyle = 'rgba(202,186,150,0.9)';
  ctx.fillRect(0, 0, 210, 44);
  ctx.strokeStyle = 'rgba(60,44,22,0.5)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(0, 0, 210, 44);
  ctx.fillStyle = 'rgba(30,22,12,0.9)';
  ctx.font = `13px ${FONT_UI}`;
  ctx.letterSpacing = '2px';
  ctx.fillText(`DAY ${day}`, 12, 19);
  ctx.font = `12px ${FONT_UI}`;
  ctx.fillStyle = 'rgba(60,46,24,0.85)';
  ctx.fillText(dateStr, 12, 35);
  if (extra) {
    ctx.textAlign = 'right';
    ctx.fillText(extra, 198, 35);
    ctx.textAlign = 'left';
  }
  ctx.letterSpacing = '0px';
  ctx.restore();
}

// Shared canvas widgets. Everything is immediate-mode: draw it, and it tells you
// whether it was clicked this frame.

import { P, rgba } from '../art/palette.js';
import { VIEW_W, VIEW_H } from '../core/input.js';
import { FONT_UI } from '../art/palette.js';

export function wrapLines(ctx, text, maxWidth, font) {
  ctx.save();
  ctx.font = font;
  const paragraphs = String(text).split('\n');
  const out = [];
  for (const para of paragraphs) {
    if (!para.trim()) { out.push(''); continue; }
    let line = '';
    for (const word of para.split(' ')) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        out.push(line);
        line = word;
      } else line = test;
    }
    if (line) out.push(line);
  }
  ctx.restore();
  return out;
}

export function text(ctx, str, x, y, o = {}) {
  const {
    size = 14, colour = P.amber, align = 'left', baseline = 'alphabetic',
    spacing = 0, bold = false, alpha = 1, font = FONT_UI, shadow = false,
  } = o;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `${bold ? 'bold ' : ''}${size}px ${font}`;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.letterSpacing = `${spacing}px`;
  if (shadow) {
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.fillText(str, x + 2, y + 2);
  }
  ctx.fillStyle = colour;
  ctx.fillText(str, x, y);
  ctx.letterSpacing = '0px';
  ctx.restore();
}

export function paragraph(ctx, str, x, y, maxW, o = {}) {
  const size = o.size || 14;
  const lineH = o.lineH || size * 1.55;
  const lines = wrapLines(ctx, str, maxW, `${size}px ${o.font || FONT_UI}`);
  lines.forEach((ln, i) => text(ctx, ln, x, y + i * lineH, o));
  return lines.length * lineH;
}

export function panel(ctx, r, o = {}) {
  const { alpha = 0.94, border = true, tone = '#100b06' } = o;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.beginPath();
  ctx.roundRect(r.x + 6, r.y + 8, r.w, r.h, 10);
  ctx.fill();
  const g = ctx.createLinearGradient(r.x, r.y, r.x, r.y + r.h);
  g.addColorStop(0, rgba(tone, alpha));
  g.addColorStop(1, rgba('#080604', alpha));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.w, r.h, 10);
  ctx.fill();
  if (border) {
    ctx.strokeStyle = 'rgba(150,116,58,0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(r.x + 4, r.y + 4, r.w - 8, r.h - 8, 7);
    ctx.stroke();
  }
  ctx.restore();
}

export function button(ctx, input, r, label, o = {}) {
  const hovered = !o.disabled && input.hover(r);
  const clicked = !o.disabled && input.clicked(r);
  const tone = o.tone || P.amber;
  ctx.save();
  const g = ctx.createLinearGradient(r.x, r.y, r.x, r.y + r.h);
  g.addColorStop(0, hovered ? 'rgba(74,56,26,0.98)' : 'rgba(34,26,14,0.95)');
  g.addColorStop(1, 'rgba(12,9,5,0.98)');
  ctx.fillStyle = o.disabled ? 'rgba(18,14,9,0.9)' : g;
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.w, r.h, 6);
  ctx.fill();
  ctx.strokeStyle = o.disabled ? 'rgba(80,64,38,0.35)' : (hovered ? rgba(tone, 0.95) : 'rgba(120,94,48,0.6)');
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
  text(ctx, label, r.x + r.w / 2, r.y + r.h / 2 + 1, {
    size: o.size || 14,
    colour: o.disabled ? 'rgba(120,100,66,0.4)' : (hovered ? P.amberBright : tone),
    align: 'center',
    baseline: 'middle',
    spacing: 2,
  });
  if (o.sub) {
    text(ctx, o.sub, r.x + r.w / 2, r.y + r.h - 9, {
      size: 10, colour: 'rgba(150,124,74,0.7)', align: 'center', baseline: 'middle',
    });
  }
  return clicked;
}

/** The big page-turn arrows down the sides of the inspect view. */
export function arrow(ctx, input, r, dir, o = {}) {
  const hovered = !o.disabled && input.hover(r);
  const clicked = !o.disabled && input.clicked(r);
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const a = o.disabled ? 0.15 : hovered ? 1 : 0.55;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.w, r.h, 10);
  ctx.fill();
  ctx.strokeStyle = rgba(P.amber, 0.55);
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.strokeStyle = hovered ? P.amberBright : P.amber;
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const s = 16;
  ctx.beginPath();
  if (dir < 0) {
    ctx.moveTo(cx + s * 0.5, cy - s);
    ctx.lineTo(cx - s * 0.5, cy);
    ctx.lineTo(cx + s * 0.5, cy + s);
  } else {
    ctx.moveTo(cx - s * 0.5, cy - s);
    ctx.lineTo(cx + s * 0.5, cy);
    ctx.lineTo(cx - s * 0.5, cy + s);
  }
  ctx.stroke();
  ctx.restore();
  return clicked;
}

export function hint(ctx, str, y = VIEW_H - 26) {
  text(ctx, str, VIEW_W / 2, y, {
    size: 12, colour: 'rgba(150,122,72,0.62)', align: 'center', spacing: 2,
  });
}

export function scrim(ctx, alpha = 0.82) {
  ctx.fillStyle = `rgba(4,3,2,${alpha})`;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
}

/** Small tab used for document titles in the inspect and compare views. */
export function tab(ctx, r, label, active) {
  ctx.save();
  ctx.fillStyle = active ? 'rgba(70,52,24,0.95)' : 'rgba(20,15,9,0.9)';
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.w, r.h, 5);
  ctx.fill();
  ctx.strokeStyle = active ? rgba(P.amber, 0.9) : 'rgba(96,76,40,0.5)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
  text(ctx, label, r.x + r.w / 2, r.y + r.h / 2 + 1, {
    size: 10, colour: active ? P.amberBright : 'rgba(160,130,78,0.7)',
    align: 'center', baseline: 'middle', spacing: 1.2,
  });
}

export function meter(ctx, r, value, max, o = {}) {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(r.x, r.y, r.w, r.h);
  const pct = Math.max(0, Math.min(1, value / max));
  const g = ctx.createLinearGradient(r.x, 0, r.x + r.w, 0);
  g.addColorStop(0, o.from || '#7a3a1e');
  g.addColorStop(1, o.to || P.amber);
  ctx.fillStyle = g;
  ctx.fillRect(r.x, r.y, r.w * pct, r.h);
  ctx.strokeStyle = 'rgba(140,110,60,0.55)';
  ctx.lineWidth = 1;
  ctx.strokeRect(r.x, r.y, r.w, r.h);
  ctx.restore();
}

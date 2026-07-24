// Documents are data; this turns them into paper. Rendering is cached per
// document and returns the layout rectangle of every field, which is what makes
// clicking a field to ask a question — and highlighting a mismatch in compare
// mode — possible without duplicating the layout maths anywhere else.

import { P, rgba, shade, FONT_DOC } from './palette.js';
import { makeRng, noise2d } from '../core/rng.js';
import { pigPhoto } from './pig.js';
import { definePainter } from './painters.js';

const cache = new Map();

// ---------------------------------------------------------------------------
// Paper stock
// ---------------------------------------------------------------------------

let fibreTile = null;
function buildFibre() {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const n = (noise2d(x >> 1, y >> 1, 5) - 0.5) * 22 + (noise2d(x >> 4, y >> 4, 8) - 0.5) * 30;
      const v = 128 + n;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.max(0, Math.min(255, v));
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  fibreTile = c;
}

function paperStock(g, w, h, seed, tint) {
  const rng = makeRng(seed);
  g.fillStyle = tint;
  g.fillRect(0, 0, w, h);

  // fibre / tone variation, from a shared tile so a sheet costs nothing to make
  if (!fibreTile) buildFibre();
  g.save();
  g.globalCompositeOperation = 'overlay';
  g.globalAlpha = 0.55;
  g.translate(-(seed % 97), -(seed % 61));
  g.fillStyle = g.createPattern(fibreTile, 'repeat');
  g.fillRect(0, 0, w + 128, h + 128);
  g.restore();

  // damp stains
  for (let i = 0; i < 4; i++) {
    const x = rng.range(0, w), y = rng.range(0, h), r = rng.range(40, 130);
    const st = g.createRadialGradient(x, y, r * 0.2, x, y, r);
    st.addColorStop(0, 'rgba(120,92,48,0.13)');
    st.addColorStop(1, 'rgba(120,92,48,0)');
    g.fillStyle = st;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }

  // a crease down the middle of most sheets
  if (rng.chance(0.7)) {
    const cx = rng.range(w * 0.35, w * 0.65);
    const cg = g.createLinearGradient(cx - 12, 0, cx + 12, 0);
    cg.addColorStop(0, 'rgba(0,0,0,0)');
    cg.addColorStop(0.5, 'rgba(60,44,22,0.16)');
    cg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = cg;
    g.fillRect(cx - 12, 0, 24, h);
  }

  // worn edges
  g.strokeStyle = 'rgba(90,70,40,0.5)';
  g.lineWidth = 2;
  g.strokeRect(1, 1, w - 2, h - 2);
  g.save();
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 60; i++) {
    const edge = rng.int(0, 3);
    const t = rng.range(0, 1);
    const x = edge === 0 ? t * w : edge === 1 ? w : edge === 2 ? t * w : 0;
    const y = edge === 0 ? 0 : edge === 1 ? t * h : edge === 2 ? h : t * h;
    g.beginPath();
    g.arc(x, y, rng.range(1, 4.5), 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

// ---------------------------------------------------------------------------
// Ink primitives
// ---------------------------------------------------------------------------

function typewriter(g, text, x, y, size, colour = P.ink, { align = 'left', spacing = 1.4, bold = false } = {}) {
  g.save();
  g.font = `${bold ? 'bold ' : ''}${size}px ${FONT_DOC}`;
  g.fillStyle = colour;
  g.textAlign = align;
  g.textBaseline = 'alphabetic';
  g.letterSpacing = `${spacing}px`;
  g.fillText(text, x, y);
  // struck twice, slightly offset — old ribbon, uneven impression
  g.globalAlpha = 0.22;
  g.fillText(text, x + 0.6, y + 0.4);
  g.letterSpacing = '0px';
  g.restore();
}

function rule(g, x, y, w, alpha = 0.35) {
  g.fillStyle = rgba(P.ink, alpha);
  g.fillRect(x, y, w, 1.4);
}

function stamp(g, { text, x, y, rot = -0.2, colour = P.inkRed, scale = 1, seed = 1 }) {
  const rng = makeRng(seed);
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.scale(scale, scale);
  g.globalAlpha = 0.72;
  g.strokeStyle = colour;
  g.lineWidth = 3;
  const w = 26 + text.length * 15;
  g.strokeRect(-w / 2, -26, w, 52);
  g.font = `bold 27px ${FONT_DOC}`;
  g.fillStyle = colour;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.letterSpacing = '3px';
  g.fillText(text, 0, 2);
  g.letterSpacing = '0px';
  // break the ink up so it looks pressed, not printed
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 70; i++) {
    g.beginPath();
    g.arc(rng.range(-w / 2 - 4, w / 2 + 4), rng.range(-30, 30), rng.range(0.8, 3.4), 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

function seal(g, { x, y, text, sub = '', colour = P.inkBlue, r = 52, seed = 1 }) {
  const rng = makeRng(seed);
  g.save();
  g.translate(x, y);
  g.globalAlpha = 0.6;
  g.strokeStyle = colour;
  g.lineWidth = 2.6;
  g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 1.4;
  g.beginPath(); g.arc(0, 0, r - 8, 0, Math.PI * 2); g.stroke();

  g.fillStyle = colour;
  g.font = `bold 15px ${FONT_DOC}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 0, -2);
  if (sub) {
    g.font = `10px ${FONT_DOC}`;
    g.fillText(sub, 0, 14);
  }
  // ring of letters
  g.font = `9px ${FONT_DOC}`;
  const ring = 'THE COMPLEX · REGISTRY OF PERSONS · ';
  for (let i = 0; i < ring.length; i++) {
    const a = (i / ring.length) * Math.PI * 2 - Math.PI / 2;
    g.save();
    g.translate(Math.cos(a) * (r - 4), Math.sin(a) * (r - 4));
    g.rotate(a + Math.PI / 2);
    g.fillText(ring[i], 0, 0);
    g.restore();
  }
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 40; i++) {
    g.beginPath();
    g.arc(rng.range(-r, r), rng.range(-r, r), rng.range(0.8, 2.6), 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

function signature(g, { x, y, seed, w = 150 }) {
  const rng = makeRng(seed);
  g.save();
  g.translate(x, y);
  g.strokeStyle = rgba(P.inkBlue, 0.85);
  g.lineWidth = 1.9;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(0, 0);
  let cx = 0;
  const loops = rng.int(4, 7);
  for (let i = 0; i < loops; i++) {
    const step = w / loops;
    g.bezierCurveTo(
      cx + step * 0.3, rng.range(-18, 4),
      cx + step * 0.7, rng.range(-4, 16),
      cx + step, rng.range(-6, 6),
    );
    cx += step;
  }
  g.stroke();
  if (rng.chance(0.6)) {
    g.beginPath();
    g.moveTo(w * 0.1, 8);
    g.quadraticCurveTo(w * 0.5, 16, w * 0.95, 4);
    g.stroke();
  }
  g.restore();
}

function photoBox(g, doc, x, y, w, h) {
  g.save();
  g.fillStyle = '#2a241c';
  g.fillRect(x - 4, y - 4, w + 8, h + 8);
  const img = pigPhoto(doc.photo.features, doc.photo.seed, Math.round(w), Math.round(h));
  g.drawImage(img, x, y, w, h);
  // staple / corner mount
  g.strokeStyle = 'rgba(60,50,34,0.8)';
  g.lineWidth = 2;
  g.strokeRect(x, y, w, h);
  g.fillStyle = 'rgba(190,180,150,0.55)';
  g.beginPath();
  g.moveTo(x, y); g.lineTo(x + 16, y); g.lineTo(x, y + 16); g.closePath(); g.fill();
  g.beginPath();
  g.moveTo(x + w, y + h); g.lineTo(x + w - 16, y + h); g.lineTo(x + w, y + h - 16); g.closePath(); g.fill();
  g.restore();
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

const LAYOUTS = {
  card: { w: 660, h: 530 },
  sheet: { w: 620, h: 820 },
};

function wrapText(g, text, maxWidth, font) {
  g.save();
  g.font = font;
  // `typewriter` prints with letter spacing, so measure with it too or every
  // line comes out wider than it was measured and overruns the page.
  g.letterSpacing = '1.4px';
  const words = String(text).split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (g.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else line = test;
  }
  if (line) lines.push(line);
  g.restore();
  return lines;
}

/**
 * Draws a document to an offscreen canvas.
 * @returns {{canvas: HTMLCanvasElement, w:number, h:number, fields: Array}}
 */
function build(doc) {
  const layout = LAYOUTS[doc.layout || 'sheet'];
  const w = layout.w, h = layout.h;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  const fields = [];

  paperStock(g, w, h, doc.paperSeed || 1, doc.tint || P.paper);

  const pad = 34;
  let y = pad + 30;

  // header
  typewriter(g, doc.title, w / 2, y, doc.layout === 'card' ? 22 : 24, P.ink, { align: 'center', bold: true, spacing: 3 });
  y += 20;
  if (doc.subtitle) {
    typewriter(g, doc.subtitle, w / 2, y, 11, P.inkFaded, { align: 'center', spacing: 2 });
    y += 14;
  }
  rule(g, pad, y, w - pad * 2, 0.4);
  y += 26;

  const hasPhoto = !!doc.photo;
  const photoW = doc.layout === 'card' ? 168 : 176;
  const photoH = doc.layout === 'card' ? 210 : 216;
  if (hasPhoto) {
    photoBox(g, doc, w - pad - photoW, y - 4, photoW, photoH);
    fields.push({ id: '__photo', label: 'PHOTOGRAPH', value: '', rect: { x: w - pad - photoW, y: y - 4, w: photoW, h: photoH }, kind: 'photo' });
  }

  const fieldRight = hasPhoto ? w - pad - photoW - 22 : w - pad;
  const labelX = pad;
  const valueX = pad + (doc.layout === 'card' ? 116 : 132);

  for (const f of doc.fields) {
    const rowH = f.multiline ? 0 : 30;
    typewriter(g, f.label, labelX, y, 11, P.inkFaded, { spacing: 1.6 });
    if (f.multiline) {
      const lines = wrapText(g, f.value, fieldRight - labelX, `13px ${FONT_DOC}`);
      let ly = y + 18;
      for (const ln of lines) {
        typewriter(g, ln, labelX, ly, 13, f.colour || P.ink);
        ly += 18;
      }
      fields.push({ ...f, rect: { x: labelX - 6, y: y - 14, w: fieldRight - labelX + 12, h: ly - y + 6 } });
      y = ly + 12;
    } else {
      typewriter(g, String(f.value), valueX, y, doc.layout === 'card' ? 16 : 15, f.colour || P.ink, { spacing: 1.1 });
      rule(g, valueX, y + 6, fieldRight - valueX, 0.18);
      fields.push({ ...f, rect: { x: labelX - 6, y: y - 16, w: fieldRight - labelX + 12, h: 26 } });
      y += rowH;
    }
  }

  if (doc.notes) {
    y += 6;
    rule(g, pad, y, w - pad * 2, 0.25);
    y += 20;
    for (const note of doc.notes) {
      const lines = wrapText(g, note, w - pad * 2, `12px ${FONT_DOC}`);
      for (const ln of lines) {
        typewriter(g, ln, pad, y, 12, P.inkFaded);
        y += 16;
      }
      y += 4;
    }
  }

  if (doc.table) {
    y += 4;
    for (const row of doc.table) {
      const cols = row.cells;
      const colW = (w - pad * 2) / cols.length;
      cols.forEach((cell, i) => {
        typewriter(g, String(cell), pad + i * colW, y, row.head ? 11 : 13, row.head ? P.inkFaded : (row.colour || P.ink), { spacing: row.head ? 1.8 : 1 });
      });
      if (row.head) rule(g, pad, y + 5, w - pad * 2, 0.3);
      if (row.id) {
        fields.push({ id: row.id, label: cols[0], value: cols.slice(1).join(' '), rect: { x: pad - 6, y: y - 14, w: w - pad * 2 + 12, h: 22 }, kind: row.kind || 'row', meta: row.meta });
      }
      y += row.head ? 22 : 21;
    }
  }

  // furniture
  if (doc.seal) seal(g, { x: doc.seal.x ?? pad + 66, y: doc.seal.y ?? h - 96, text: doc.seal.text, sub: doc.seal.sub, colour: doc.seal.colour || P.inkBlue, seed: doc.paperSeed || 1 });
  if (doc.signature) {
    signature(g, { x: doc.signature.x ?? w - 250, y: doc.signature.y ?? h - 92, seed: doc.signature.seed || 1, w: 170 });
    rule(g, (doc.signature.x ?? w - 250) - 6, (doc.signature.y ?? h - 92) + 22, 186, 0.35);
    typewriter(g, doc.signature.label || 'AUTHORISING CLERK', (doc.signature.x ?? w - 250) - 6, (doc.signature.y ?? h - 92) + 38, 10, P.inkFaded, { spacing: 1.4 });
  }
  for (const s of doc.stamps || []) {
    stamp(g, { ...s, seed: (doc.paperSeed || 1) + 11 });
  }

  if (doc.footer) {
    typewriter(g, doc.footer, w / 2, h - 22, 10, rgba(P.ink, 0.5), { align: 'center', spacing: 1.6 });
  }

  return { canvas: c, w, h, fields };
}

export function renderDocument(doc) {
  const key = doc.cacheKey || doc.id;
  const hit = cache.get(key);
  if (hit && hit.version === doc.version) return hit.data;
  const data = build(doc);
  cache.set(key, { version: doc.version, data });
  if (cache.size > 90) {
    const first = cache.keys().next().value;
    cache.delete(first);
  }
  return data;
}

export function clearDocumentCache() { cache.clear(); }

/**
 * Draw a rendered document into a screen rectangle, letterboxed to fit.
 * Returns the transform so callers can map field rects to screen space.
 */
export function drawDocument(ctx, doc, box, opts = {}) {
  const data = renderDocument(doc);
  const scale = Math.min(box.w / data.w, box.h / data.h) * (opts.zoom || 1);
  const dw = data.w * scale;
  const dh = data.h * scale;
  const dx = box.x + (box.w - dw) / 2 + (opts.offsetX || 0);
  const dy = box.y + (box.h - dh) / 2 + (opts.offsetY || 0);

  ctx.save();
  if (opts.rotate) {
    ctx.translate(dx + dw / 2, dy + dh / 2);
    ctx.rotate(opts.rotate);
    ctx.translate(-(dx + dw / 2), -(dy + dh / 2));
  }
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(dx + 8, dy + 12, dw, dh);
  ctx.drawImage(data.canvas, dx, dy, dw, dh);

  // lamp falloff across the sheet so it sits in the room's light
  const g = ctx.createLinearGradient(dx, dy, dx, dy + dh);
  g.addColorStop(0, 'rgba(0,0,0,0.16)');
  g.addColorStop(0.35, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.3)');
  ctx.fillStyle = g;
  ctx.fillRect(dx, dy, dw, dh);
  ctx.restore();

  const toScreen = (r) => ({ x: dx + r.x * scale, y: dy + r.y * scale, w: r.w * scale, h: r.h * scale });
  return { dx, dy, dw, dh, scale, data, toScreen };
}

definePainter('paper.document', (ctx, o) => drawDocument(ctx, o.doc, o.box, o));

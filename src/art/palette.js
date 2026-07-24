// The whole game is lit by one bulb, so the palette is deliberately narrow:
// warm light, cold shadow, aged paper. Anything that isn't in the lamp's reach
// should be almost black with a faint amber bounce.

export const P = {
  // Room
  void: '#050403',
  wallFar: '#0d0a07',
  wallNear: '#171009',
  floor: '#120c07',

  // Lamp
  bulbCore: '#fff4d2',
  bulbHot: '#ffd98a',
  lampWarm: '#f5b453',
  lampGlow: 'rgba(255, 186, 92, 0.20)',
  lampSpill: 'rgba(255, 160, 60, 0.10)',

  // Desk
  woodHigh: '#8a5a2b',
  woodMid: '#5a3618',
  woodLow: '#2c190b',
  woodEdge: '#1a0e05',

  // Paper
  paper: '#cdbb95',
  paperShade: '#b3a07c',
  paperEdge: '#8e7c5c',
  paperOld: '#c0aa80',
  ink: '#241b10',
  inkFaded: '#5a4a33',
  inkRed: '#8e2a22',
  inkBlue: '#2c3f63',

  // Flesh
  hide: ['#c99a86', '#b8836c', '#a8705c', '#d0a893', '#9d6a58', '#c08a72', '#8f6152'],
  hideDark: '#2a1712',
  snout: '#ac7d70',
  gum: '#7d4a48',
  tusk: '#e0d6ba',

  // UI
  amber: '#e8b45c',
  amberDim: '#8a6a34',
  amberBright: '#ffd98a',
  textDim: '#6b5836',
  danger: '#c1362b',
  dangerDim: '#5e1c16',
  ok: '#4e9a4a',
  okDim: '#254a23',
  caution: '#d0a52f',
  cautionDim: '#5f4a14',
  blood: '#5e1410',
};

/** Random-ish but stable hide tone lookup. */
export const hideTone = (i) => P.hide[i % P.hide.length];

/**
 * Parses '#rgb', '#rrggbb', 'rgb(...)' and 'rgba(...)' alike.
 *
 * These helpers return `rgb(...)` strings, so they get composed — `shade(mix(a,
 * b), 1.2)` is entirely normal. Anything that only understood hex would hand
 * back NaN components, and canvas silently ignores an invalid fillStyle and
 * keeps painting with the previous colour, which is a miserable thing to debug.
 */
export function parseColour(colour) {
  if (typeof colour !== 'string') return [0, 0, 0, 1];
  const s = colour.trim();
  if (s[0] === '#') {
    const h = s.slice(1);
    const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
    const n = parseInt(full, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const m = /^rgba?\(([^)]+)\)$/i.exec(s);
  if (m) {
    const parts = m[1].split(',').map((p) => parseFloat(p));
    return [parts[0] || 0, parts[1] || 0, parts[2] || 0, parts.length > 3 ? parts[3] : 1];
  }
  return [0, 0, 0, 1];
}

export function rgba(colour, a) {
  const [r, g, b] = parseColour(colour);
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${a})`;
}

/** Blend two colours. Used so a dark pig gets a dark snout, not a pink one. */
export function mix(a, b, t) {
  const [r1, g1, b1] = parseColour(a);
  const [r2, g2, b2] = parseColour(b);
  const m = (x, y) => Math.round(x + (y - x) * t);
  return `rgb(${m(r1, r2)}, ${m(g1, g2)}, ${m(b1, b2)})`;
}

/** Darken or lighten a colour by a factor. */
export function shade(colour, f) {
  const [r, g, b] = parseColour(colour);
  const cl = (v) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${cl(r)}, ${cl(g)}, ${cl(b)})`;
}

export const FONT_DOC = '"Courier New", Courier, monospace';
export const FONT_UI = '"Courier New", Courier, monospace';

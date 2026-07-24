// One update per rendered frame with a clamped delta, plus the letterboxed 16:9
// canvas sizing. Game code always draws in a 1600x900 coordinate space and never
// has to think about device pixel ratio or window size.
//
// This deliberately is *not* a fixed-timestep accumulator. There is no physics
// here, every animation is already frame-rate independent, and an accumulator
// that runs update() twice in a slow frame makes edge-triggered input fire twice
// — which silently cancels every keyboard toggle in the game.

import { VIEW_W, VIEW_H } from './input.js';

const MAX_FRAME = 1 / 15;

export function fitCanvas(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const availW = window.innerWidth;
  const availH = window.innerHeight;
  const scale = Math.min(availW / VIEW_W, availH / VIEW_H);
  const cssW = Math.max(320, Math.floor(VIEW_W * scale));
  const cssH = Math.max(180, Math.floor(VIEW_H * scale));
  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';
  const bw = Math.floor(cssW * dpr);
  const bh = Math.floor(cssH * dpr);
  if (canvas.width !== bw || canvas.height !== bh) {
    canvas.width = bw;
    canvas.height = bh;
  }
  return bw / VIEW_W;
}

export function startLoop({ canvas, ctx, update, render }) {
  let last = performance.now() / 1000;
  let scale = fitCanvas(canvas);
  window.addEventListener('resize', () => { scale = fitCanvas(canvas); });

  const frame = (nowMs) => {
    const now = nowMs / 1000;
    let dt = now - last;
    last = now;
    if (dt > MAX_FRAME) dt = MAX_FRAME;
    if (dt < 0) dt = 0;

    update(dt);

    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.clearRect(0, 0, VIEW_W, VIEW_H);
    render(ctx, dt);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

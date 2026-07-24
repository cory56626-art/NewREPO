// Boot, scene router, and the global bits every scene shares (input, camera
// shake, the pause overlay, and the debug reveal).

import { Input, VIEW_W, VIEW_H } from './core/input.js';
import { startLoop } from './core/loop.js';
import { state, load, save, hasSave } from './core/state.js';
import { unlock, setMuted, isMuted, sfx } from './core/audio.js';
import { grain } from './art/lighting.js';
import { P } from './art/palette.js';
import { text, panel, button, scrim } from './ui/widgets.js';
import { rect } from './core/input.js';

import { createMenuScene } from './scenes/menu.js';
import { createDeskScene } from './scenes/deskScene.js';
import { createShiftEndScene } from './scenes/shiftEnd.js';
import { createShopScene } from './scenes/shop.js';
import { createNightScene } from './scenes/nightScene.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: false });
const input = new Input(canvas);

const SCENES = {
  menu: createMenuScene,
  desk: createDeskScene,
  shiftEnd: createShiftEndScene,
  shop: createShopScene,
  night: createNightScene,
};

export const game = {
  input,
  ctx,
  t: 0,
  scene: null,
  sceneName: null,
  paused: false,
  lampOn: true,
  debug: new URLSearchParams(location.search).has('debug'),
  shakeAmount: 0,
  fade: 1,
  fadeTarget: 0,
  pending: null,

  switchTo(name, opts = {}) {
    this.pending = { name, opts };
    this.fadeTarget = 1;
  },

  shake(amount = 8) {
    this.shakeAmount = Math.max(this.shakeAmount, amount);
  },
};

function enterScene(name, opts) {
  const factory = SCENES[name];
  if (!factory) throw new Error(`unknown scene ${name}`);
  game.scene = factory(game, opts);
  game.sceneName = name;
  if (game.scene.enter) game.scene.enter(opts);
  game.fadeTarget = 0;
}

// Exposed so the browser test harness can read scene state.
window.__game = game;

function update(dt) {
  game.t += dt;
  input.beginFrame();

  // fade / scene swap
  game.fade += (game.fadeTarget - game.fade) * Math.min(1, dt * 7);
  if (game.pending && game.fade > 0.96) {
    const { name, opts } = game.pending;
    game.pending = null;
    enterScene(name, opts);
  }

  if (game.shakeAmount > 0) {
    game.shakeAmount = Math.max(0, game.shakeAmount - dt * 26);
  }

  if (input.pressed('KeyP') || input.pressed('Escape')) {
    if (game.sceneName !== 'menu' && !(game.scene && game.scene.handlesEscape && game.scene.handlesEscape())) {
      game.paused = !game.paused;
      sfx.click();
    }
  }
  if (input.pressed('KeyM')) {
    setMuted(!isMuted());
  }

  if (!game.paused && game.scene && game.scene.update && !game.pending) {
    game.scene.update(dt);
  }
}

function render(ctx, dt) {
  ctx.save();
  if (game.shakeAmount > 0.05) {
    ctx.translate(
      (Math.random() - 0.5) * game.shakeAmount,
      (Math.random() - 0.5) * game.shakeAmount,
    );
  }

  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  if (game.scene && game.scene.render) game.scene.render(ctx, dt);
  ctx.restore();

  if (game.paused) drawPause(ctx);

  grain(ctx, 0.045);

  if (game.fade > 0.01) {
    ctx.fillStyle = `rgba(0,0,0,${Math.min(1, game.fade)})`;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }

  input.endFrame();
}

function drawPause(ctx) {
  scrim(ctx, 0.86);
  const r = rect(VIEW_W / 2 - 220, VIEW_H / 2 - 170, 440, 340);
  panel(ctx, r);
  text(ctx, 'SHIFT PAUSED', VIEW_W / 2, r.y + 62, { size: 24, colour: P.amberBright, align: 'center', spacing: 6 });
  text(ctx, 'The queue waits. It is very patient.', VIEW_W / 2, r.y + 92, {
    size: 12, colour: 'rgba(160,130,78,0.7)', align: 'center',
  });

  if (button(ctx, input, rect(r.x + 70, r.y + 130, 300, 46), 'RESUME')) {
    game.paused = false;
    sfx.click();
  }
  if (button(ctx, input, rect(r.x + 70, r.y + 186, 300, 46), isMuted() ? 'SOUND: OFF' : 'SOUND: ON')) {
    setMuted(!isMuted());
    state.settings.muted = isMuted();
    sfx.click();
  }
  if (button(ctx, input, rect(r.x + 70, r.y + 242, 300, 46), 'SAVE AND QUIT TO TITLE')) {
    save();
    game.paused = false;
    game.switchTo('menu');
  }
  input.consumeRemaining();
}

// --- boot -------------------------------------------------------------------

function boot() {
  if (hasSave()) load();
  if (state.settings && state.settings.muted) setMuted(true);

  const kick = () => {
    unlock();
    window.removeEventListener('pointerdown', kick);
    window.removeEventListener('keydown', kick);
  };
  window.addEventListener('pointerdown', kick);
  window.addEventListener('keydown', kick);

  enterScene('menu', {});
  startLoop({ canvas, ctx, update, render });

  const bootEl = document.getElementById('boot');
  if (bootEl) {
    bootEl.classList.add('gone');
    setTimeout(() => bootEl.remove(), 900);
  }
}

boot();

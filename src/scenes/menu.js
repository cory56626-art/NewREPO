// Title screen. The room is already there behind it, lit and waiting.

import { VIEW_W, VIEW_H, rect } from '../core/input.js';
import { P } from '../art/palette.js';
import { drawRoom, drawDust } from '../art/room.js';
import { drawDesk } from '../art/desk.js';
import { vignette } from '../art/lighting.js';
import { text, button, panel, paragraph } from '../ui/widgets.js';
import { state, assign, hasSave, load, save, clearSave } from '../core/state.js';
import { initComplex } from '../sim/registry.js';
import { sfx, unlock } from '../core/audio.js';
import { LAST_AUTHORED_DAY } from '../sim/day.js';

export function createMenuScene(game) {
  const input = game.input;
  let showControls = false;
  let lamp = 1;
  let flickerCooldown = 2;

  function newRun() {
    const seed = Math.floor(Math.random() * 2147483000) + 1;
    const complex = initComplex(seed);
    assign({
      version: 1,
      seed,
      day: 1,
      money: 240,
      reputation: 50,
      units: complex.units,
      residents: complex.residents,
      upgrades: {},
      visitorLog: [],
      formerResidents: null,
      stats: {
        processed: 0, admitted: 0, denied: 0, mimicsCaught: 0, mimicsAdmitted: 0,
        wrongDenials: 0, murders: 0, murdersSolved: 0, innocentsLost: 0, daysSurvived: 0,
      },
      today: null,
      lastNight: null,
      endless: false,
      finished: false,
      settings: state.settings || { muted: false },
    });
    save();
    game.switchTo('desk');
  }

  function update(dt) {
    flickerCooldown -= dt;
    if (flickerCooldown <= 0) {
      flickerCooldown = 2 + Math.random() * 7;
      lamp = 0.3;
    }
    lamp += (1 - lamp) * Math.min(1, dt * 8);
  }

  function render(ctx) {
    drawRoom(ctx, { px: input.nx * 0.4, py: input.ny * 0.4, lamp, sway: game.t * 0.35, horizon: 560 });
    drawDust(ctx, game.t, 30);
    drawDesk(ctx, { px: input.nx * 0.4, py: input.ny * 0.4, lamp });
    vignette(ctx, 1);

    ctx.save();
    ctx.shadowColor = 'rgba(255,170,70,0.4)';
    ctx.shadowBlur = 30;
    text(ctx, 'PACING HAMS', VIEW_W / 2, 250, {
      size: 74, colour: '#f0c274', align: 'center', spacing: 14,
    });
    ctx.restore();
    text(ctx, 'EVERY ONE OF THEM SAYS THEY BELONG HERE', VIEW_W / 2, 300, {
      size: 14, colour: 'rgba(180,146,88,0.75)', align: 'center', spacing: 6,
    });

    if (showControls) {
      const r = rect(VIEW_W / 2 - 340, 350, 680, 420);
      panel(ctx, r);
      text(ctx, 'THE DESK', r.x + 40, r.y + 50, { size: 16, colour: P.amberBright, spacing: 4 });
      const lines = [
        'CLICK THEIR PAPERS to read them. Arrows page through the stack.',
        'CLICK THE RECORDS on your left to check the Complex\'s own books.',
        'C — hold their papers beside your records and compare.',
        'YELLOW — question them about any field on any document.',
        'RED refuses. GREEN admits. Neither has a hotkey. Mean it.',
        '',
        'TAB records · ESC back · P pause · M mute',
      ];
      let y = r.y + 96;
      for (const l of lines) {
        y += paragraph(ctx, l, r.x + 40, y, r.w - 80, { size: 14, colour: '#cbb08a' }) + 6;
      }
      if (button(ctx, input, rect(r.x + r.w / 2 - 100, r.y + r.h - 62, 200, 44), 'BACK')) {
        showControls = false;
        sfx.click();
      }
    } else {
      const bx = VIEW_W / 2 - 170;
      let by = 400;
      if (hasSave()) {
        if (button(ctx, input, rect(bx, by, 340, 54), 'CONTINUE', { sub: `DAY ${state.day}` })) {
          unlock();
          load();
          sfx.clunk();
          game.switchTo('desk');
        }
        by += 68;
      }
      if (button(ctx, input, rect(bx, by, 340, 54), hasSave() ? 'NEW SHIFT (ERASES SAVE)' : 'NEW SHIFT')) {
        unlock();
        sfx.clunk();
        if (hasSave()) clearSave();
        newRun();
      }
      by += 68;
      if (button(ctx, input, rect(bx, by, 340, 54), 'HOW THE DESK WORKS')) {
        showControls = true;
        sfx.click();
      }

      text(ctx, `${LAST_AUTHORED_DAY} NIGHTS, THEN AS MANY AS YOU LAST`, VIEW_W / 2, by + 108, {
        size: 12, colour: 'rgba(150,122,72,0.55)', align: 'center', spacing: 3,
      });
    }
  }

  return { update, render };
}

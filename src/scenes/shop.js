// Between the shift and the night: spend what you took. Four columns, four very
// different theories about what keeps a building alive.

import { VIEW_W, VIEW_H, rect } from '../core/input.js';
import { P, rgba } from '../art/palette.js';
import { vignette } from '../art/lighting.js';
import { text, panel, button, paragraph, wrapLines } from '../ui/widgets.js';
import { state, hasUpgrade, save } from '../core/state.js';
import { UPGRADES, BRANCHES, purchase, isAvailable, upgradeById } from '../sim/upgrades.js';
import { sfx } from '../core/audio.js';
import { drawHud } from '../ui/hud.js';

export function createShopScene(game, opts = {}) {
  const input = game.input;
  const day = opts.day || state.day;
  let toast = null;

  function render(ctx, dt = 1 / 60) {
    // A quieter room: the lamp is off, you're working by the window.
    ctx.fillStyle = '#0a0806';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    const g = ctx.createRadialGradient(VIEW_W / 2, 300, 40, VIEW_W / 2, 400, 900);
    g.addColorStop(0, 'rgba(90,64,30,0.35)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    text(ctx, 'THE OFFICE', VIEW_W / 2, 74, { size: 26, colour: P.amberBright, align: 'center', spacing: 8 });
    text(ctx, 'WHAT THE BUILDING NEEDS BEFORE DARK', VIEW_W / 2, 102, {
      size: 12, colour: 'rgba(170,138,84,0.7)', align: 'center', spacing: 4,
    });

    const colW = 366;
    const gap = 18;
    const startX = (VIEW_W - (colW * 4 + gap * 3)) / 2;

    BRANCHES.forEach((branch, bi) => {
      const x = startX + bi * (colW + gap);
      const r = rect(x, 140, colW, 600);
      panel(ctx, r, { alpha: 0.9 });
      text(ctx, branch.name, r.x + r.w / 2, r.y + 34, { size: 14, colour: P.amberBright, align: 'center', spacing: 3 });
      text(ctx, branch.blurb, r.x + r.w / 2, r.y + 56, {
        size: 11, colour: 'rgba(160,130,78,0.65)', align: 'center',
      });

      const items = UPGRADES.filter((u) => u.branch === branch.id);
      let y = r.y + 82;
      for (const u of items) {
        const owned = hasUpgrade(u.id);
        const locked = !!u.requires && !hasUpgrade(u.requires);
        const afford = state.money >= u.cost;
        const descLines = wrapLines(ctx, u.desc, colW - 46, '11px "Courier New", monospace');
        const h = 58 + descLines.length * 15;
        const box = rect(r.x + 14, y, colW - 28, h);

        const hovered = !owned && !locked && input.hover(box);
        ctx.save();
        ctx.fillStyle = owned ? 'rgba(40,58,32,0.55)' : hovered && afford ? 'rgba(60,46,22,0.75)' : 'rgba(16,12,8,0.7)';
        ctx.beginPath();
        ctx.roundRect(box.x, box.y, box.w, box.h, 6);
        ctx.fill();
        ctx.strokeStyle = owned
          ? rgba(P.ok, 0.6)
          : locked ? 'rgba(80,64,38,0.3)'
            : hovered && afford ? rgba(P.amber, 0.9) : 'rgba(110,88,46,0.45)';
        ctx.lineWidth = 1.6;
        ctx.stroke();
        ctx.restore();

        text(ctx, u.name, box.x + 14, box.y + 24, {
          size: 13,
          colour: owned ? P.ok : locked ? 'rgba(130,108,68,0.45)' : P.amberBright,
          spacing: 1.6,
        });
        text(ctx, owned ? 'OWNED' : `${u.cost}`, box.x + box.w - 14, box.y + 24, {
          size: 13,
          colour: owned ? P.ok : afford ? '#f0c274' : 'rgba(180,90,70,0.8)',
          align: 'right',
        });
        descLines.forEach((ln, i) => {
          text(ctx, ln, box.x + 14, box.y + 46 + i * 15, {
            size: 11, colour: locked ? 'rgba(120,100,64,0.4)' : 'rgba(190,164,116,0.8)',
          });
        });
        if (locked) {
          text(ctx, `NEEDS ${upgradeById(u.requires).name}`, box.x + 14, box.y + box.h - 8, {
            size: 10, colour: 'rgba(150,110,60,0.6)',
          });
        }

        if (hovered && input.clicked(box)) {
          if (!afford) {
            toast = { msg: 'NOT ENOUGH SCRIP.', life: 0, bad: true };
            sfx.buzzer();
          } else if (purchase(u.id)) {
            toast = { msg: `${u.name} INSTALLED.`, life: 0, bad: false };
            sfx.stamp();
            save();
          }
        }
        y += h + 10;
      }
    });

    if (toast) {
      toast.life += dt;
      if (toast.life > 2.4) toast = null;
      else {
        text(ctx, toast.msg, VIEW_W / 2, 770, {
          size: 14, colour: toast.bad ? P.danger : P.ok, align: 'center', spacing: 3,
        });
      }
    }

    if (button(ctx, input, rect(VIEW_W / 2 - 200, 792, 400, 52), 'LOCK UP FOR THE NIGHT  →', { size: 16 })) {
      sfx.door();
      game.switchTo('night', { day });
    }

    drawHud(ctx, input, { lampOn: false });
    vignette(ctx, 0.7);
    input.consumeRemaining();
  }

  return { render };
}

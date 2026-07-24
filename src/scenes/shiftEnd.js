// End of shift. You are paid for bodies processed and beds filled. What you are
// not told is whether any of the bodies you let past were wearing a face.

import { VIEW_W, VIEW_H, rect } from '../core/input.js';
import { P } from '../art/palette.js';
import { drawRoom } from '../art/room.js';
import { drawDesk } from '../art/desk.js';
import { vignette } from '../art/lighting.js';
import { text, panel, button, meter, paragraph } from '../ui/widgets.js';
import { state } from '../core/state.js';
import { shiftEarnings, reputationLabel, REP_MAX } from '../sim/economy.js';
import { payPerApplicant, rentPerResident } from '../sim/upgrades.js';
import { sfx } from '../core/audio.js';
import { dayConfig } from '../sim/day.js';
import { fmtDate, dateForDay } from '../sim/identity.js';

export function createShiftEndScene(game, opts = {}) {
  const input = game.input;
  const results = opts.results || [];
  const day = opts.day || state.day;

  const seen = results.length;
  const admitted = results.filter((r) => r.admitted).length;
  const refused = seen - admitted;
  const complaints = results.filter((r) => !r.admitted && !r.case.isMimic).length;

  const earn = shiftEarnings(seen);
  let paid = false;
  let reveal = 0;

  function update(dt) {
    reveal = Math.min(1, reveal + dt * 0.9);
    if (!paid && reveal > 0.15) {
      paid = true;
      state.money += earn.total;
      state.stats.daysSurvived = Math.max(state.stats.daysSurvived, day);
      sfx.coin();
    }
  }

  function render(ctx) {
    drawRoom(ctx, { px: 0, py: 0, lamp: 0.5, sway: game.t * 0.3, horizon: 560 });
    drawDesk(ctx, { px: 0, py: 0, lamp: 0.5 });
    vignette(ctx, 1);

    const r = rect(VIEW_W / 2 - 420, 90, 840, 700);
    panel(ctx, r);

    text(ctx, 'SHIFT ENDED', VIEW_W / 2, r.y + 58, { size: 26, colour: P.amberBright, align: 'center', spacing: 8 });
    text(ctx, `DAY ${day} · ${fmtDate(dateForDay(day))} · ${dayConfig(day).title}`, VIEW_W / 2, r.y + 88, {
      size: 12, colour: P.amberDim, align: 'center', spacing: 3,
    });

    const rows = [
      ['APPLICANTS SEEN', `${seen}`, null],
      ['ADMITTED', `${admitted}`, null],
      ['REFUSED', `${refused}`, null],
      ['—', '', null],
      [`WAGES  (${seen} × ${payPerApplicant()})`, `+${earn.wages}`, P.ok],
      [`RENT  (${earn.residents} × ${rentPerResident()})`, `+${earn.rent}`, P.ok],
    ];
    if (complaints > 0) {
      rows.push([`COMPLAINTS FILED  (${complaints})`, 'STANDING DOWN', P.danger]);
    }

    let y = r.y + 150;
    for (const [label, value, colour] of rows) {
      if (label === '—') {
        ctx.fillStyle = 'rgba(140,110,60,0.28)';
        ctx.fillRect(r.x + 70, y - 6, r.w - 140, 1.5);
        y += 22;
        continue;
      }
      text(ctx, label, r.x + 70, y, { size: 15, colour: '#c9b58c' });
      text(ctx, value, r.x + r.w - 70, y, { size: 15, colour: colour || '#e8d5ab', align: 'right' });
      y += 34;
    }

    y += 12;
    ctx.fillStyle = 'rgba(140,110,60,0.4)';
    ctx.fillRect(r.x + 70, y - 8, r.w - 140, 2);
    y += 26;
    text(ctx, 'TAKINGS', r.x + 70, y, { size: 19, colour: P.amberBright, spacing: 2 });
    text(ctx, `+${earn.total}`, r.x + r.w - 70, y, { size: 22, colour: '#f0c274', align: 'right' });

    y += 52;
    text(ctx, `STANDING — ${reputationLabel()}`, r.x + 70, y, { size: 13, colour: P.amberDim, spacing: 2 });
    meter(ctx, rect(r.x + 70, y + 14, r.w - 140, 12), state.reputation, REP_MAX);

    y += 62;
    paragraph(ctx, admitted > 0
      ? 'Beds are full that were empty this morning. Everyone you let past is asleep under your roof tonight.'
      : 'Nobody sleeps here tonight who did not sleep here last night. Quiet, at least.',
    r.x + 70, y, r.w - 140, { size: 13, colour: 'rgba(178,142,88,0.72)' });

    if (button(ctx, input, rect(VIEW_W / 2 - 170, r.y + r.h - 66, 340, 48), 'TO THE OFFICE  →')) {
      sfx.click();
      game.switchTo('shop', { day });
    }
    input.consumeRemaining();
  }

  return { update, render };
}

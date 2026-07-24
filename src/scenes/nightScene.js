// Night. Either nothing happens — which is its own kind of unpleasant — or you
// go down into your own building with a torch and work out which of the people
// you admitted is not a person.

import { VIEW_W, VIEW_H, rect } from '../core/input.js';
import { P, rgba } from '../art/palette.js';
import { drawNightRoom, drawClueMark } from '../art/nightRooms.js';
import { flashlightMask, flashlightGlow, vignette } from '../art/lighting.js';
import { pigPhoto } from '../art/pig.js';
import { text, panel, button, paragraph, scrim, hint } from '../ui/widgets.js';
import { state, save } from '../core/state.js';
import { sfx, setBedLevel } from '../core/audio.js';
import { rollNight, buildScene, sceneSuspects, suspectTraits, matchesEvidence } from '../sim/night.js';
import {
  payCleanNight, applyMurderCost, applySolvedBonus, applyWrongAccusation, removeResident,
} from '../sim/economy.js';
import { LAST_AUTHORED_DAY } from '../sim/day.js';
import { fmtDate, dateForDay } from '../sim/identity.js';

const TORCH_R = 345;

export function createNightScene(game, opts = {}) {
  const input = game.input;
  const day = opts.day || state.day;

  let phase = 'ROLL';
  let scene = null;
  let roll = null;
  let roomIndex = 0;
  let showSheet = false;
  let result = null;
  let heartbeat = 0;
  let flicker = 1;
  let confirmKey = null;

  function enter() {
    setBedLevel(0.25);
    roll = rollNight(day, state.seed + day);
    if (roll.murder) {
      scene = buildScene(day, state.seed + day);
      if (!scene) {
        roll.murder = false;
      } else {
        const victim = removeResident(scene.victimKey, 'MURDERED', day);
        if (victim) victim.note = 'MURDERED';
        applyMurderCost(day);
        phase = 'DISCOVER';
        sfx.sting();
        game.shake(14);
        return;
      }
    }
    phase = 'QUIET';
    if (roll.mimics === 0) payCleanNight(day);
    sfx.drone();
  }

  function advanceDay() {
    setBedLevel(0.5);
    state.day = day + 1;
    if (state.day > LAST_AUTHORED_DAY) state.endless = true;
    save();
    game.switchTo('desk');
  }

  function update(dt) {
    heartbeat += dt;
    if (phase === 'EXPLORE' && heartbeat > 4.5) {
      heartbeat = 0;
      sfx.heartbeat();
    }
    flicker += (1 - flicker) * Math.min(1, dt * 6);
    if (Math.random() < dt * 0.5) flicker = 0.55;

    if (phase === 'EXPLORE') {
      if (input.pressed('KeyE')) { showSheet = !showSheet; sfx.paper(); }
      if (input.pressed('Escape') && showSheet) showSheet = false;
      if (input.pressed('ArrowLeft')) moveRoom(-1);
      if (input.pressed('ArrowRight')) moveRoom(1);
    }
  }

  function moveRoom(dir) {
    roomIndex = (roomIndex + dir + scene.rooms.length) % scene.rooms.length;
    sfx.hoofstep(roomIndex);
    sfx.door();
  }

  const foundClues = () => scene.rooms.flatMap((r) => r.clues.filter((c) => c.found));
  const remainingKey = () => scene.rooms
    .flatMap((r) => r.clues)
    .filter((c) => c.eliminating && !c.found).length;

  // --- render ---------------------------------------------------------------

  function render(ctx) {
    if (phase === 'QUIET') return renderQuiet(ctx);
    if (phase === 'DISCOVER') return renderDiscover(ctx);
    if (phase === 'RESULT') return renderResult(ctx);
    // During the accusation the room is only a backdrop — its chrome must not
    // draw over the line-up, and its buttons must not eat the clicks.
    renderExplore(ctx, phase !== 'ACCUSE');
    if (phase === 'ACCUSE') renderAccuse(ctx);
    else if (showSheet) renderSheet(ctx);
  }

  function renderQuiet(ctx) {
    ctx.fillStyle = '#050403';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    const g = ctx.createRadialGradient(VIEW_W / 2, 380, 20, VIEW_W / 2, 420, 760);
    g.addColorStop(0, 'rgba(60,44,22,0.5)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    const r = rect(VIEW_W / 2 - 380, 200, 760, 460);
    panel(ctx, r);
    text(ctx, 'THE NIGHT PASSES', VIEW_W / 2, r.y + 68, {
      size: 26, colour: P.amberBright, align: 'center', spacing: 8,
    });
    text(ctx, fmtDate(dateForDay(day)), VIEW_W / 2, r.y + 96, {
      size: 12, colour: P.amberDim, align: 'center', spacing: 3,
    });

    let body;
    if (roll.interrupted) {
      body = 'The alarm wire went off at some hour you will not remember clearly. '
        + 'Something was on the third-floor landing and then it was not. '
        + 'Everyone is accounted for in the morning. Everyone.';
    } else if (roll.mimics > 0) {
      body = 'Nobody dies tonight. That is not the same as nobody being here. '
        + 'You lie awake listening to the building settle, and somewhere above you '
        + 'something settles that is not the building.';
    } else {
      body = 'You admitted nobody who should not have come in. The Complex sleeps, '
        + 'the boiler ticks, and for one night you are simply a landlord.';
    }
    paragraph(ctx, body, r.x + 60, r.y + 150, r.w - 120, { size: 15, colour: '#cbb08a', lineH: 26 });

    if (roll.mimics === 0) {
      text(ctx, `CLEAN NIGHT BONUS  +${40 + day * 8}`, VIEW_W / 2, r.y + 320, {
        size: 18, colour: P.ok, align: 'center', spacing: 3,
      });
    } else {
      text(ctx, `${roll.mimics} ADMITTED GUEST${roll.mimics === 1 ? '' : 'S'} UNACCOUNTED FOR`, VIEW_W / 2, r.y + 320, {
        size: 14, colour: P.danger, align: 'center', spacing: 3,
      });
    }

    if (button(ctx, input, rect(VIEW_W / 2 - 160, r.y + r.h - 76, 320, 48), 'MORNING  →')) {
      sfx.click();
      advanceDay();
    }
    vignette(ctx, 1);
    input.consumeRemaining();
  }

  function renderDiscover(ctx) {
    ctx.fillStyle = '#050403';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    drawNightRoom(ctx, 'hall', { marked: true });
    flashlightMask(ctx, VIEW_W / 2, 460, 420, 0.96);
    vignette(ctx, 1);
    scrim(ctx, 0.55);

    const r = rect(VIEW_W / 2 - 400, 190, 800, 490);
    panel(ctx, r);
    text(ctx, 'SOMETHING HAPPENED IN THE NIGHT', VIEW_W / 2, r.y + 66, {
      size: 22, colour: P.danger, align: 'center', spacing: 5,
    });
    paragraph(ctx,
      `${scene.victimName} of unit ${scene.victimUnit} did not answer the door this morning, `
      + 'and then the door answered for them. The ward office will not come out before noon '
      + 'and by noon whatever did this will have had a full night and half a day to be someone else.\n\n'
      + 'Take the torch. Whatever it is, you let it in, and it is still inside.',
      r.x + 60, r.y + 120, r.w - 120, { size: 15, colour: '#cbb08a', lineH: 26 });

    if (button(ctx, input, rect(VIEW_W / 2 - 170, r.y + r.h - 78, 340, 50), 'GO DOWN  →')) {
      phase = 'EXPLORE';
      sfx.door();
    }
    input.consumeRemaining();
  }

  function renderExplore(ctx, chrome = true) {
    const room = scene.rooms[roomIndex];
    drawNightRoom(ctx, room.id, { marked: room.id === 'unit' || room.id === 'hall' });

    const tx = input.x;
    const ty = input.y;
    const radius = TORCH_R * flicker;

    // clues, but only where the torch actually falls
    for (const clue of chrome ? room.clues : []) {
      const d = Math.hypot(clue.x - tx, clue.y - ty);
      if (d > radius * 0.92 && !clue.found) continue;
      const r = rect(clue.x - 30, clue.y - 30, 60, 60);
      const hovered = d < radius * 0.8 && input.hover(r);
      drawClueMark(ctx, clue.x, clue.y, { found: clue.found, hovered, t: game.t });
      if (hovered && input.clicked(r) && !clue.found) {
        clue.found = true;
        sfx.wet();
        game.shake(4);
        showSheet = true;
      }
    }

    flashlightGlow(ctx, tx, ty, radius);
    flashlightMask(ctx, tx, ty, radius, 0.94);
    vignette(ctx, 0.9);
    if (!chrome) return;

    // chrome
    text(ctx, room.name, VIEW_W / 2, 54, { size: 20, colour: P.amberBright, align: 'center', spacing: 6, shadow: true });
    text(ctx, room.blurb, VIEW_W / 2, 80, { size: 13, colour: 'rgba(190,160,104,0.75)', align: 'center', shadow: true });

    const found = foundClues().length;
    text(ctx, `EVIDENCE  ${found}/${scene.totalClues}`, 40, 54, { size: 13, colour: P.amber, spacing: 2, shadow: true });
    if (remainingKey() > 0) {
      text(ctx, `${remainingKey()} TELLING SIGN${remainingKey() === 1 ? '' : 'S'} STILL OUT THERE`, 40, 78, {
        size: 11, colour: 'rgba(190,120,90,0.85)', spacing: 1.5, shadow: true,
      });
    } else {
      text(ctx, 'YOU HAVE ENOUGH TO NAME IT', 40, 78, { size: 11, colour: P.ok, spacing: 1.5, shadow: true });
    }

    // room navigation along the bottom
    const bw = 210;
    const total = scene.rooms.length * (bw + 10) - 10;
    scene.rooms.forEach((rm, i) => {
      const r = rect((VIEW_W - total) / 2 + i * (bw + 10), VIEW_H - 74, bw, 44);
      const unseen = rm.clues.some((c) => !c.found);
      if (button(ctx, input, r, rm.name.split(' ').slice(-2).join(' '), {
        tone: i === roomIndex ? P.amberBright : (unseen ? P.amber : 'rgba(150,124,74,0.7)'),
        size: 12,
      })) {
        roomIndex = i;
        sfx.door();
      }
    });

    if (button(ctx, input, rect(VIEW_W - 250, 40, 210, 44), showSheet ? 'CLOSE SHEET  [E]' : 'EVIDENCE SHEET  [E]')) {
      showSheet = !showSheet;
      sfx.paper();
    }
    if (found > 0 && button(ctx, input, rect(VIEW_W - 250, 92, 210, 44), 'NAME THE MIMIC', { tone: P.danger })) {
      phase = 'ACCUSE';
      showSheet = false;
      sfx.clunk();
    }
    hint(ctx, '← → MOVE   ·   E EVIDENCE   ·   MOVE THE TORCH TO SEARCH', VIEW_H - 118);
  }

  function renderSheet(ctx) {
    const r = rect(VIEW_W / 2 - 420, 120, 840, 600);
    panel(ctx, r);
    text(ctx, 'EVIDENCE', VIEW_W / 2, r.y + 50, { size: 20, colour: P.amberBright, align: 'center', spacing: 6 });
    text(ctx, `${scene.victimName} · UNIT ${scene.victimUnit}`, VIEW_W / 2, r.y + 76, {
      size: 12, colour: P.danger, align: 'center', spacing: 2,
    });

    const clues = foundClues();
    let y = r.y + 118;
    if (!clues.length) {
      paragraph(ctx, 'Nothing yet. Take the torch around the rooms and look properly.',
        r.x + 50, y, r.w - 100, { size: 14, colour: 'rgba(180,150,100,0.7)' });
    }
    for (const clue of clues) {
      if (clue.label) {
        text(ctx, clue.label, r.x + 50, y, { size: 13, colour: P.amberBright, spacing: 2 });
        y += 22;
      }
      y += paragraph(ctx, clue.text, r.x + 50, y, r.w - 100, {
        size: 13, colour: clue.eliminating ? '#cbb08a' : 'rgba(160,134,88,0.65)', lineH: 20,
      }) + 16;
    }

    if (button(ctx, input, rect(VIEW_W / 2 - 130, r.y + r.h - 62, 260, 44), 'CLOSE  [E]')) {
      showSheet = false;
      sfx.paper();
    }
    input.consumeRemaining();
  }

  function renderAccuse(ctx) {
    scrim(ctx, 0.9);
    const suspects = sceneSuspects(scene);
    const clues = foundClues();

    text(ctx, 'WHO IS IT?', VIEW_W / 2, 74, { size: 26, colour: P.amberBright, align: 'center', spacing: 8 });
    text(ctx, 'NAME ONE. THEY WILL NOT BE HERE IN THE MORNING EITHER WAY.', VIEW_W / 2, 104, {
      size: 12, colour: 'rgba(190,120,90,0.8)', align: 'center', spacing: 3,
    });

    const cardW = 250;
    const gap = 22;
    const totalW = suspects.length * (cardW + gap) - gap;
    const startX = (VIEW_W - totalW) / 2;

    suspects.forEach((s, i) => {
      const r = rect(startX + i * (cardW + gap), 150, cardW, 520);
      const fits = matchesEvidence(s, clues);
      const hovered = input.hover(r);
      panel(ctx, r, { alpha: 0.95 });

      const img = pigPhoto(s.identity.features, s.identity.seed, 200, 240);
      ctx.drawImage(img, r.x + 25, r.y + 20, 200, 240);
      ctx.strokeStyle = fits ? rgba(P.danger, 0.8) : 'rgba(90,74,44,0.5)';
      ctx.lineWidth = 2;
      ctx.strokeRect(r.x + 25, r.y + 20, 200, 240);

      text(ctx, s.identity.fullName, r.x + cardW / 2, r.y + 288, {
        size: 14, colour: P.amberBright, align: 'center',
      });
      text(ctx, `UNIT ${s.unit}`, r.x + cardW / 2, r.y + 308, {
        size: 11, colour: P.amberDim, align: 'center', spacing: 2,
      });

      let ty = r.y + 340;
      for (const t of suspectTraits(s)) {
        const matchedClue = clues.find((c) => c.trait === t.id && c.eliminating);
        const ok = matchedClue ? t.label === matchedClue.label : null;
        text(ctx, t.label, r.x + 20, ty, {
          size: 11,
          colour: ok === null ? 'rgba(150,126,80,0.55)' : ok ? P.ok : P.danger,
        });
        ty += 18;
      }

      text(ctx, fits ? 'FITS THE EVIDENCE' : 'RULED OUT', r.x + cardW / 2, r.y + 466, {
        size: 11, colour: fits ? P.danger : 'rgba(130,110,70,0.6)', align: 'center', spacing: 1.5,
      });

      if (button(ctx, input, rect(r.x + 30, r.y + 480, cardW - 60, 36),
        confirmKey === s.key ? 'CERTAIN?' : 'ACCUSE', { tone: confirmKey === s.key ? P.danger : P.amber })) {
        if (confirmKey === s.key) accuse(s);
        else { confirmKey = s.key; sfx.click(); }
      }
      if (hovered && confirmKey && confirmKey !== s.key) confirmKey = confirmKey;
    });

    if (button(ctx, input, rect(VIEW_W / 2 - 150, VIEW_H - 74, 300, 44), 'KEEP LOOKING')) {
      phase = 'EXPLORE';
      confirmKey = null;
      sfx.click();
    }
    input.consumeRemaining();
  }

  function accuse(suspect) {
    const correct = suspect.key === scene.culpritKey;
    if (correct) {
      removeResident(suspect.key, 'DESTROYED', day);
      const bonus = applySolvedBonus(day);
      result = { correct, bonus, name: suspect.identity.fullName, unit: suspect.unit };
      sfx.squeal();
      game.shake(18);
    } else {
      removeResident(suspect.key, 'WRONGLY ACCUSED', day);
      applyWrongAccusation(day);
      result = { correct, name: suspect.identity.fullName, unit: suspect.unit };
      sfx.sting();
      game.shake(10);
    }
    scene.solved = correct;
    phase = 'RESULT';
  }

  function renderResult(ctx) {
    drawNightRoom(ctx, 'hall', { marked: true });
    flashlightMask(ctx, VIEW_W / 2, 420, 380, 0.96);
    scrim(ctx, 0.7);

    const r = rect(VIEW_W / 2 - 400, 170, 800, 520);
    panel(ctx, r);
    text(ctx, result.correct ? 'YOU WERE RIGHT' : 'YOU WERE WRONG', VIEW_W / 2, r.y + 66, {
      size: 26, colour: result.correct ? P.ok : P.danger, align: 'center', spacing: 6,
    });

    const body = result.correct
      ? `It did not deny it. It did not do anything at all until the door was open, and then it `
        + `stopped being ${result.name} in front of you, and there was rather a lot of it. `
        + `Unit ${result.unit} is empty and will need scrubbing.\n\n`
        + `The Complex is clean tonight.`
      : `${result.name} of unit ${result.unit} is gone. They said your name at the end, `
        + `as a question. The evidence did not fit them and you named them anyway.\n\n`
        + `Whatever killed your tenant is still inside, and now it has a spare bed.`;
    paragraph(ctx, body, r.x + 56, r.y + 120, r.w - 112, { size: 15, colour: '#cbb08a', lineH: 26 });

    text(ctx, result.correct ? `+${result.bonus} SCRIP · STANDING RESTORED` : 'STANDING DAMAGED · A MIMIC REMAINS',
      VIEW_W / 2, r.y + r.h - 116, {
        size: 14, colour: result.correct ? P.ok : P.danger, align: 'center', spacing: 3,
      });

    if (state.day + 1 > LAST_AUTHORED_DAY && !state.endless) {
      text(ctx, 'THE BULLETINS HAVE STOPPED COMING. THE QUEUE HAS NOT.', VIEW_W / 2, r.y + r.h - 92, {
        size: 11, colour: P.amberDim, align: 'center', spacing: 2,
      });
    }

    if (button(ctx, input, rect(VIEW_W / 2 - 160, r.y + r.h - 70, 320, 48), 'MORNING  →')) {
      sfx.click();
      advanceDay();
    }
    input.consumeRemaining();
  }

  return {
    enter,
    update,
    render,
    handlesEscape: () => phase === 'ACCUSE' || showSheet,
    // Read by the browser test harness.
    debugState: () => ({
      phase,
      roomIndex,
      murder: !!(roll && roll.murder),
      rooms: scene ? scene.rooms.map((r) => r.clues.map((c) => ({ x: c.x, y: c.y, found: c.found }))) : null,
      remainingKey: scene ? remainingKey() : null,
      suspects: scene ? scene.suspects.length : 0,
      culprit: scene ? scene.culpritKey : null,
      result: result ? result.correct : null,
    }),
  };
}

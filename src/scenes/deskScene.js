// The shift. Four views over one desk:
//
//   DESK     the room, the applicant, their papers, the three buttons
//   INSPECT  one of their documents, filling the screen, pageable
//   RECORDS  the Complex's own stack, held up to the left — the head tilts
//   COMPARE  registry on one side, applicant on the other
//
// The applicant is never re-generated once seated, and the registry documents are
// rebuilt per applicant so the resident file always reflects the unit they claim.

import { VIEW_W, VIEW_H, rect } from '../core/input.js';
import { P, rgba } from '../art/palette.js';
import { Smooth, Timer, clamp, lerp, easeOutCubic, easeInOutCubic } from '../core/tween.js';
import { sfx } from '../core/audio.js';
import { state, hasUpgrade } from '../core/state.js';
import { drawRoom, drawDust } from '../art/room.js';
import { drawDesk, drawDeskButton, drawStack, drawPlate, SLOTS, DESK } from '../art/desk.js';
import { drawPig } from '../art/pig.js';
import { drawDocument, renderDocument } from '../art/paper.js';
import { vignette } from '../art/lighting.js';
import { text, paragraph, panel, button, arrow, hint, scrim, tab } from '../ui/widgets.js';
import { drawHud, dayPlate } from '../ui/hud.js';
import { planQueue, caseFromPlan, dayConfig } from '../sim/day.js';
import { buildApplicantDocs, buildRegistryDocs } from '../sim/documents.js';
import { topicsFor, ask, greeting, farewell, questionBudget, isAskable } from '../sim/dialogue.js';
import { resolveVerdict } from '../sim/economy.js';
import { fmtDate, dateForDay, idIsValid, dateValue } from '../sim/identity.js';

const SEAT_Y = 452;
const STAND_Y = 356;
const PIG_SCALE = 1.62;

/** Checks a clerk could do with arithmetic alone — what the loupe automates. */
function autoFlags(doc, c) {
  const flags = [];
  const today = dateForDay(c.day);
  for (const f of doc.fields || []) {
    if (f.id === 'idNumber' && !idIsValid(String(f.value))) flags.push({ id: f.id, why: 'CHECK LETTER FAILS' });
    if (f.id === 'expires' && dateValue(c.papers.expires) < dateValue(today)) flags.push({ id: f.id, why: 'EXPIRED' });
    if (f.id === 'issued' && dateValue(c.papers.issued) > dateValue(c.papers.expires)) flags.push({ id: f.id, why: 'ISSUED AFTER EXPIRY' });
    if (f.id === 'born' && dateValue(c.papers.born) > dateValue(c.papers.issued)) flags.push({ id: f.id, why: 'BORN AFTER ISSUE' });
  }
  return flags;
}

export function createDeskScene(game, opts = {}) {
  const input = game.input;
  const day = state.day;
  const cfg = dayConfig(day);

  let plan = planQueue(day, state.seed);
  let index = -1;
  let current = null;
  let docs = [];
  let regDocs = [];
  let results = [];

  let phase = 'INTRO';
  let view = 'DESK';
  let docIndex = 0;
  let regIndex = 0;
  let asking = false;
  let subtitle = null;
  let questionsLeft = 0;
  let flash = null;

  const walk = new Timer(2.0);
  const seat = new Timer(0.75);
  const hand = new Timer(0.7);
  const leave = new Timer(1.5);
  const tilt = new Smooth(0, 7);
  const px = new Smooth(0, 6);
  const py = new Smooth(0, 6);
  const docLift = new Smooth(0, 9);

  let blinkTimer = 1.6;
  let blink = 0;
  let talk = 0;
  let lampFlicker = 1;
  let flickerCooldown = 3;
  let stepCounter = 0;

  const nextApplicant = () => {
    index++;
    if (index >= plan.length) {
      // No save here: the run is only written at a day boundary, once the night
      // has resolved. Saving mid-day would let a reload replay applicants who
      // are already on the roster.
      phase = 'DAYEND';
      game.switchTo('shiftEnd', { results, day });
      return;
    }
    current = caseFromPlan(plan[index]);
    docs = buildApplicantDocs(current);
    regDocs = buildRegistryDocs(day, current, cfg.rules);
    // Warm the paper caches before they are needed, so nothing hitches when the
    // player opens a document mid-shift.
    for (const d of [...docs, ...regDocs]) renderDocument(d);
    docIndex = 0;
    regIndex = 0;
    asking = false;
    subtitle = null;
    questionsLeft = questionBudget();
    walk.reset();
    seat.reset();
    hand.reset();
    phase = 'ENTER';
    stepCounter = 0;
  };

  const say = (line, cue = null, question = null) => {
    subtitle = { line, cue, question, life: 0, ttl: cue ? 6.5 : 4.2 };
    talk = 1;
  };

  const verdict = (admit) => {
    if (phase !== 'SEATED' || !current) return;
    const out = resolveVerdict(current, admit, day);
    results.push({ case: current, admitted: admit, correct: out.correct, out });
    flash = { colour: admit ? P.ok : P.danger, life: 0 };
    if (admit) sfx.chime(); else sfx.buzzer();
    sfx.stamp();
    say(farewell(current, admit));
    view = 'DESK';
    asking = false;
    phase = 'LEAVE';
    leave.reset();
  };

  // --- update ---------------------------------------------------------------

  function update(dt) {
    px.set(input.nx * (view === 'DESK' ? 1 : 0.2)).update(dt);
    py.set(input.ny * (view === 'DESK' ? 1 : 0.2)).update(dt);
    tilt.set(view === 'RECORDS' ? -0.055 : 0).update(dt);
    docLift.set(view === 'DESK' && phase === 'SEATED' ? 1 : 0).update(dt);

    // lamp life
    flickerCooldown -= dt;
    if (flickerCooldown <= 0) {
      flickerCooldown = 3 + Math.random() * 9;
      lampFlicker = 0.25;
      sfx.lampFlicker();
    }
    lampFlicker += (1 - lampFlicker) * Math.min(1, dt * 9);

    blinkTimer -= dt;
    if (blinkTimer <= 0) {
      blinkTimer = 1.8 + Math.random() * 3.4;
      blink = 1;
    }
    blink = Math.max(0, blink - dt * 7);
    talk = Math.max(0, talk - dt * 1.6);

    if (subtitle) {
      subtitle.life += dt;
      if (subtitle.life > subtitle.ttl) subtitle = null;
    }
    if (flash) {
      flash.life += dt;
      if (flash.life > 0.5) flash = null;
    }

    switch (phase) {
      case 'INTRO':
        if (input.pressed('Space') || input.pressed('Enter')) startShift();
        break;
      case 'ENTER': {
        walk.update(dt);
        const steps = Math.floor(walk.t * 7);
        if (steps > stepCounter) { stepCounter = steps; sfx.hoofstep(steps); }
        if (walk.done) { phase = 'SEAT'; sfx.chairScrape(); }
        break;
      }
      case 'SEAT':
        seat.update(dt);
        if (seat.done) {
          phase = 'HAND';
          sfx.paperBig();
        }
        break;
      case 'HAND':
        hand.update(dt);
        if (hand.done) {
          phase = 'SEATED';
          say(greeting(current));
        }
        break;
      case 'LEAVE':
        leave.update(dt);
        if (leave.t > 0.35) {
          const steps = 3 + Math.floor((leave.t - 0.35) * 6);
          if (steps > stepCounter) { stepCounter = steps; sfx.hoofstep(steps); }
        }
        if (leave.done) nextApplicant();
        break;
      default:
        break;
    }

    if (phase === 'SEATED') hotkeys();
  }

  function startShift() {
    phase = 'IDLE';
    sfx.door();
    nextApplicant();
  }

  function hotkeys() {
    if (input.pressed('Escape') && view !== 'DESK') {
      view = 'DESK';
      asking = false;
      sfx.paper();
    }
    if (input.pressed('KeyC')) {
      view = view === 'COMPARE' ? 'DESK' : 'COMPARE';
      sfx.paperBig();
    }
    if (input.pressed('Tab')) {
      view = view === 'RECORDS' ? 'DESK' : 'RECORDS';
      sfx.paper();
    }
    if (input.pressed('ArrowLeft')) page(-1);
    if (input.pressed('ArrowRight')) page(1);
  }

  function page(dir) {
    if (view === 'INSPECT') {
      docIndex = (docIndex + dir + docs.length) % docs.length;
      sfx.paper();
    } else if (view === 'RECORDS') {
      regIndex = (regIndex + dir + regDocs.length) % regDocs.length;
      sfx.paper();
    }
  }

  function askAbout(fieldId) {
    if (questionsLeft <= 0 || !isAskable(fieldId)) return;
    questionsLeft--;
    const a = ask(current, fieldId);
    say(a.answer, a.cue, a.question);
    current.answered[fieldId] = a;
    current.questionsAsked++;
    sfx.click();
  }

  // --- render ---------------------------------------------------------------

  function render(ctx) {
    ctx.save();
    // The whole scene leans when the player looks at the stack on their left.
    ctx.translate(VIEW_W / 2, VIEW_H);
    ctx.rotate(tilt.value);
    ctx.translate(-VIEW_W / 2 + (view === 'RECORDS' ? 90 : 0), -VIEW_H);

    drawRoom(ctx, { px: px.value, py: py.value, lamp: lampFlicker, sway: game.t * 0.4, horizon: 560 });
    drawDust(ctx, game.t, 34);
    if (game.lampOn === false) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    drawApplicant(ctx);
    drawDesk(ctx, { px: px.value, py: py.value, lamp: lampFlicker });
    drawDeskProps(ctx);
    ctx.restore();

    vignette(ctx, 0.95);

    if (view === 'INSPECT') drawInspect(ctx);
    if (view === 'RECORDS') drawRecordsOverlay(ctx);
    if (view === 'COMPARE') drawCompare(ctx);

    drawSubtitle(ctx);

    const hits = drawHud(ctx, input, { lampOn: game.lampOn });
    if (hits.pause) game.paused = true;
    if (hits.lamp) { game.lampOn = !game.lampOn; sfx.clunk(); }
    if (hits.mute) sfx.click();
    dayPlate(ctx, day, fmtDate(dateForDay(day)), `${Math.max(0, plan.length - Math.max(0, index))} LEFT`);

    if (flash) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = rgba(flash.colour, 0.16 * (1 - flash.life / 0.5));
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      ctx.restore();
    }

    if (phase === 'INTRO') drawIntro(ctx);
    if (game.debug && current) drawDebug(ctx);
  }

  function applicantPose() {
    if (!current) return null;
    if (phase === 'ENTER') {
      const t = easeOutCubic(walk.t);
      return {
        x: lerp(VIEW_W + 190, VIEW_W / 2, t),
        y: STAND_Y + Math.sin(walk.t * 26) * 5,
        scale: lerp(1.3, PIG_SCALE, t),
        lean: Math.sin(walk.t * 26) * 0.05,
      };
    }
    if (phase === 'SEAT') {
      const t = easeInOutCubic(seat.t);
      return { x: VIEW_W / 2, y: lerp(STAND_Y, SEAT_Y, t), scale: PIG_SCALE, lean: 0 };
    }
    if (phase === 'LEAVE') {
      const t = easeInOutCubic(leave.t);
      return {
        x: lerp(VIEW_W / 2, VIEW_W + 220, Math.max(0, (t - 0.25) / 0.75)),
        y: lerp(SEAT_Y, STAND_Y, clamp(t * 3, 0, 1)),
        scale: lerp(PIG_SCALE, 1.28, t),
        lean: Math.sin(t * 22) * 0.05,
      };
    }
    if (phase === 'HAND' || phase === 'SEATED') {
      return { x: VIEW_W / 2, y: SEAT_Y, scale: PIG_SCALE, lean: 0 };
    }
    return null;
  }

  function drawApplicant(ctx) {
    const pose = applicantPose();
    if (!pose) return;
    const breathing = Math.sin(game.t * 1.7) * (current.isMimic ? 0.35 : 1);
    drawPig(ctx, current.identity.features, {
      x: pose.x + px.value * 10,
      y: pose.y + py.value * 5,
      scale: pose.scale,
      seed: current.seed,
      mode: 'scene',
      blink: current.isMimic && hasUpgrade('desk_lamp') ? blink * 0.25 : blink,
      talk: talk * 0.9,
      breath: breathing,
      // A small constant list per applicant, so nobody sits perfectly square on.
      lean: pose.lean + ((current.seed % 7) - 3) * 0.007,
    });
  }

  function drawDeskProps(ctx) {
    // The Complex's records, always to hand on the left.
    const recHover = phase === 'SEATED' && view === 'DESK' && input.hover(SLOTS.recordsStack);
    drawStack(ctx, SLOTS.recordsStack, {
      count: Math.min(5, regDocs.length || 3),
      seed: 12,
      hover: recHover,
      label: 'COMPLEX RECORDS',
    });
    if (recHover && input.clicked(SLOTS.recordsStack)) {
      view = 'RECORDS';
      sfx.paper();
    }

    // Their papers, once handed over.
    if (docs.length && (phase === 'HAND' || phase === 'SEATED' || phase === 'LEAVE')) {
      const t = phase === 'HAND' ? easeOutCubic(hand.t) : phase === 'LEAVE' ? 1 - easeOutCubic(leave.t) : 1;
      const slot = SLOTS.applicantDocs;
      const fromY = 470;
      ctx.save();
      ctx.globalAlpha = clamp(t * 1.4, 0, 1);
      docs.forEach((doc, i) => {
        const spread = (i - (docs.length - 1) / 2);
        const box = {
          x: slot.x + spread * 26,
          y: lerp(fromY, slot.y, t) + i * 6,
          w: slot.w,
          h: slot.h,
        };
        drawDocument(ctx, doc, box, {
          rotate: (spread * 0.05) + (1 - t) * 0.4,
          offsetY: -docLift.value * (i === docIndex ? 6 : 0),
        });
      });
      ctx.restore();

      const hovered = phase === 'SEATED' && view === 'DESK' && input.hover(slot);
      if (hovered) {
        ctx.save();
        ctx.strokeStyle = rgba(P.amberBright, 0.8);
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 6]);
        ctx.strokeRect(slot.x - 26, slot.y - 12, slot.w + 52, slot.h + 26);
        ctx.setLineDash([]);
        ctx.restore();
        if (input.clicked(slot)) {
          view = 'INSPECT';
          sfx.paperBig();
        }
      }
      text(ctx, 'THEIR PAPERS', slot.x + slot.w / 2, slot.y - 14, {
        size: 12, colour: hovered ? P.amberBright : 'rgba(150,120,70,0.6)', align: 'center', spacing: 3,
      });
    }

    // Buttons.
    const live = phase === 'SEATED';
    const redHover = live && input.hover(circleRect(SLOTS.red));
    const greenHover = live && input.hover(circleRect(SLOTS.green));
    const yellowHover = live && input.hover(circleRect(SLOTS.yellow));

    drawDeskButton(ctx, {
      x: SLOTS.red.x, y: SLOTS.red.y, r: SLOTS.red.r,
      colour: P.danger, dim: P.dangerDim, hover: redHover,
      glow: live ? 0.5 : 0, label: 'REFUSE', disabled: !live,
    });
    drawDeskButton(ctx, {
      x: SLOTS.yellow.x, y: SLOTS.yellow.y, r: SLOTS.yellow.r,
      colour: P.caution, dim: P.cautionDim, hover: yellowHover,
      glow: live && questionsLeft > 0 ? 0.6 : 0,
      label: live ? `ASK · ${questionsLeft}` : 'ASK',
      disabled: !live || questionsLeft <= 0,
    });
    drawDeskButton(ctx, {
      x: SLOTS.green.x, y: SLOTS.green.y, r: SLOTS.green.r,
      colour: P.ok, dim: P.okDim, hover: greenHover,
      glow: live ? 0.5 : 0, label: 'ADMIT', disabled: !live,
    });

    if (live) {
      if (input.clicked(circleRect(SLOTS.red))) verdict(false);
      if (input.clicked(circleRect(SLOTS.green))) verdict(true);
      if (questionsLeft > 0 && input.clicked(circleRect(SLOTS.yellow))) {
        view = 'INSPECT';
        asking = true;
        sfx.clunk();
      }
      const cmpHover = input.hover(SLOTS.compare);
      drawPlate(ctx, SLOTS.compare, 'COMPARE', { hover: cmpHover, active: view === 'COMPARE' });
      if (input.clicked(SLOTS.compare)) {
        view = view === 'COMPARE' ? 'DESK' : 'COMPARE';
        sfx.paperBig();
      }
    }
  }

  const circleRect = (c) => rect(c.x - c.r * 1.2, c.y - c.r, c.r * 2.4, c.r * 2.1);

  // --- document views -------------------------------------------------------

  function drawDocPager(ctx, list, idx, box, o = {}) {
    const doc = list[idx];
    const placed = drawDocument(ctx, doc, box, {});
    // title tabs
    const tabW = Math.min(156, (box.w - 20) / list.length);
    const tabRowW = list.length * (tabW + 6) - 6;
    list.forEach((d, i) => {
      const r = rect(box.x + (box.w - tabRowW) / 2 + i * (tabW + 6), box.y - 42, tabW, 30);
      tab(ctx, r, d.title.split(' ').slice(0, 2).join(' '), i === idx);
      if (input.hover(r) && input.clicked(r)) {
        if (o.onPick) o.onPick(i);
        sfx.paper();
      }
    });
    return placed;
  }

  function drawInspect(ctx) {
    scrim(ctx, 0.88);
    const box = rect(VIEW_W / 2 - 400, 140, 800, 660);
    const placed = drawDocPager(ctx, docs, docIndex, box, { onPick: (i) => { docIndex = i; } });
    const doc = docs[docIndex];

    // loupe: ring anything that fails a check the player could do by hand
    if (hasUpgrade('desk_loupe')) {
      for (const flag of autoFlags(doc, current)) {
        const field = placed.data.fields.find((f) => f.id === flag.id);
        if (!field) continue;
        const r = placed.toScreen(field.rect);
        ctx.save();
        ctx.strokeStyle = rgba(P.danger, 0.85);
        ctx.lineWidth = 2.5;
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(r.x, r.y, r.w, r.h);
        ctx.setLineDash([]);
        text(ctx, flag.why, r.x + r.w + 10, r.y + r.h / 2 + 4, { size: 11, colour: P.danger, spacing: 1.4 });
        ctx.restore();
      }
    }
    if (hasUpgrade('desk_uv') && current.claim.sealed === false
      && (doc.type === 'RESIDENCY_PERMIT' || doc.type === 'RESIDENT_PASS')) {
      text(ctx, 'UV: NO REGISTRY SEAL PRESENT', VIEW_W / 2, box.y + box.h + 6, {
        size: 13, colour: P.danger, align: 'center', spacing: 2,
      });
    }

    // asking mode: every askable field becomes a target
    if (asking) {
      let anyHover = false;
      for (const field of placed.data.fields) {
        if (!isAskable(field.id)) continue;
        const r = placed.toScreen(field.rect);
        const hovered = input.hover(r);
        anyHover = anyHover || hovered;
        ctx.save();
        ctx.fillStyle = hovered ? rgba(P.caution, 0.26) : rgba(P.caution, 0.10);
        ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.strokeStyle = hovered ? P.caution : rgba(P.caution, 0.45);
        ctx.lineWidth = hovered ? 2 : 1;
        ctx.strokeRect(r.x, r.y, r.w, r.h);
        ctx.restore();
        if (current.answered[field.id]) {
          text(ctx, 'ASKED', r.x + r.w - 4, r.y - 4, { size: 9, colour: rgba(P.caution, 0.8), align: 'right' });
        }
        if (hovered && input.clicked(r)) {
          askAbout(field.id);
          if (questionsLeft <= 0) asking = false;
        }
      }
      text(ctx, `ASK ABOUT A FIELD — ${questionsLeft} QUESTION${questionsLeft === 1 ? '' : 'S'} LEFT`, VIEW_W / 2, 62, {
        size: 15, colour: P.caution, align: 'center', spacing: 3,
      });
    } else {
      text(ctx, 'THEIR PAPERS', VIEW_W / 2, 62, { size: 15, colour: P.amber, align: 'center', spacing: 5 });
    }

    if (arrow(ctx, input, rect(80, VIEW_H / 2 - 60, 92, 120), -1, { disabled: docs.length < 2 })) page(-1);
    if (arrow(ctx, input, rect(VIEW_W - 172, VIEW_H / 2 - 60, 92, 120), 1, { disabled: docs.length < 2 })) page(1);

    if (button(ctx, input, rect(VIEW_W - 210, 40, 170, 40), 'BACK  [ESC]')) {
      view = 'DESK';
      asking = false;
      sfx.paper();
    }
    if (!asking && questionsLeft > 0 && button(ctx, input, rect(40, 40, 190, 40), `ASK ABOUT THIS  [${questionsLeft}]`, { tone: P.caution })) {
      asking = true;
      sfx.clunk();
    }
    hint(ctx, '← → PAGE   ·   C COMPARE   ·   ESC BACK');
    input.consumeRemaining();
  }

  function drawRecordsOverlay(ctx) {
    // Held up in the left of the view, room still visible — the head is tilted.
    const box = rect(170, 128, 600, 660);
    ctx.save();
    ctx.fillStyle = 'rgba(4,3,2,0.72)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.restore();

    text(ctx, 'THE COMPLEX — RECORDS', box.x + box.w / 2, 62, {
      size: 15, colour: P.amber, align: 'center', spacing: 4,
    });
    drawDocPager(ctx, regDocs, regIndex, box, { onPick: (i) => { regIndex = i; } });

    // Both page arrows sit under the sheet rather than out over the room.
    if (arrow(ctx, input, rect(box.x + 130, VIEW_H - 84, 100, 56), -1, { disabled: regDocs.length < 2 })) page(-1);
    if (arrow(ctx, input, rect(box.x + box.w - 230, VIEW_H - 84, 100, 56), 1, { disabled: regDocs.length < 2 })) page(1);
    text(ctx, regDocs[regIndex].title, box.x + box.w / 2, VIEW_H - 100, {
      size: 12, colour: 'rgba(170,140,84,0.8)', align: 'center', spacing: 2,
    });

    if (button(ctx, input, rect(VIEW_W - 300, 150, 220, 46), 'PUT DOWN  [ESC]')) {
      view = 'DESK';
      sfx.paper();
    }
    if (button(ctx, input, rect(VIEW_W - 300, 208, 220, 46), 'COMPARE  [C]', { tone: P.caution })) {
      view = 'COMPARE';
      sfx.paperBig();
    }
    text(ctx, 'Everything the Complex knows', VIEW_W - 190, 280, {
      size: 12, colour: 'rgba(160,130,78,0.6)', align: 'center',
    });
    text(ctx, 'about the people already inside it.', VIEW_W - 190, 300, {
      size: 12, colour: 'rgba(160,130,78,0.6)', align: 'center',
    });
    input.consumeRemaining();
  }

  function drawCompare(ctx) {
    scrim(ctx, 0.9);
    // Both columns stop well short of the bottom so their pagers never end up
    // underneath the HUD controls or the money counter.
    const left = rect(56, 122, 700, 606);
    const right = rect(VIEW_W / 2 + 44, 122, 700, 606);

    text(ctx, 'COMPLEX RECORDS', left.x + left.w / 2, 92, { size: 14, colour: P.amber, align: 'center', spacing: 4 });
    text(ctx, 'APPLICANT', right.x + right.w / 2, 92, { size: 14, colour: P.amber, align: 'center', spacing: 4 });

    ctx.save();
    ctx.strokeStyle = 'rgba(140,110,60,0.28)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(VIEW_W / 2, 120);
    ctx.lineTo(VIEW_W / 2, VIEW_H - 90);
    ctx.stroke();
    ctx.restore();

    drawDocument(ctx, regDocs[regIndex], left, {});
    const placedRight = drawDocument(ctx, docs[docIndex], right, {});

    if (hasUpgrade('desk_loupe')) {
      for (const flag of autoFlags(docs[docIndex], current)) {
        const field = placedRight.data.fields.find((f) => f.id === flag.id);
        if (!field) continue;
        const r = placedRight.toScreen(field.rect);
        ctx.save();
        ctx.strokeStyle = rgba(P.danger, 0.9);
        ctx.lineWidth = 2.5;
        ctx.strokeRect(r.x, r.y, r.w, r.h);
        ctx.restore();
      }
    }

    const pagerY = left.y + left.h + 16;
    const pager = (box, list, idx, set) => {
      const cx = box.x + box.w / 2;
      if (arrow(ctx, input, rect(cx - 210, pagerY, 64, 46), -1, { disabled: list.length < 2 })) {
        set((idx - 1 + list.length) % list.length);
        sfx.paper();
      }
      if (arrow(ctx, input, rect(cx + 146, pagerY, 64, 46), 1, { disabled: list.length < 2 })) {
        set((idx + 1) % list.length);
        sfx.paper();
      }
      text(ctx, list[idx].title, cx, pagerY + 28, {
        size: 12, colour: 'rgba(178,146,88,0.85)', align: 'center', spacing: 2,
      });
      text(ctx, `${idx + 1} / ${list.length}`, cx, pagerY + 48, {
        size: 10, colour: 'rgba(150,122,72,0.6)', align: 'center', spacing: 2,
      });
    };
    pager(left, regDocs, regIndex, (i) => { regIndex = i; });
    pager(right, docs, docIndex, (i) => { docIndex = i; });

    if (button(ctx, input, rect(VIEW_W / 2 - 90, 36, 180, 40), 'BACK  [C]')) {
      view = 'DESK';
      sfx.paper();
    }
    input.consumeRemaining();
  }

  // --- overlays -------------------------------------------------------------

  function drawSubtitle(ctx) {
    if (!subtitle) return;
    const fade = clamp((subtitle.ttl - subtitle.life) * 2.5, 0, 1);
    // Sits just above the desk edge so it never covers the papers.
    const y = 524;
    ctx.save();
    ctx.globalAlpha = fade;
    const w = 940;
    const x = VIEW_W / 2 - w / 2;
    const lines = [];
    if (subtitle.question) lines.push({ t: `“${subtitle.question}”`, c: 'rgba(190,158,96,0.8)', s: 14 });
    lines.push({ t: `“${subtitle.line}”`, c: '#e8d5ab', s: 19 });
    if (subtitle.cue) lines.push({ t: subtitle.cue, c: 'rgba(190,120,90,0.9)', s: 14 });

    const h = 34 + lines.length * 30;
    ctx.fillStyle = 'rgba(3,2,1,0.82)';
    ctx.beginPath();
    ctx.roundRect(x, y - 26, w, h, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,94,48,0.35)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    let ly = y + 4;
    for (const l of lines) {
      text(ctx, l.t, VIEW_W / 2, ly, { size: l.s, colour: l.c, align: 'center' });
      ly += 30;
    }
    ctx.restore();
  }

  function drawIntro(ctx) {
    scrim(ctx, 0.92);
    const r = rect(VIEW_W / 2 - 400, 110, 800, 660);
    panel(ctx, r);
    text(ctx, `DAY ${day}`, VIEW_W / 2, r.y + 66, { size: 15, colour: P.amberDim, align: 'center', spacing: 8 });
    text(ctx, cfg.title, VIEW_W / 2, r.y + 108, { size: 30, colour: P.amberBright, align: 'center', spacing: 4 });
    text(ctx, fmtDate(dateForDay(day)), VIEW_W / 2, r.y + 138, { size: 13, colour: P.amberDim, align: 'center', spacing: 3 });

    let y = r.y + 196;
    text(ctx, 'TODAY\'S BULLETIN', r.x + 60, y, { size: 12, colour: P.amberDim, spacing: 4 });
    y += 30;
    for (const rule of cfg.rules) {
      const used = paragraph(ctx, `· ${rule}`, r.x + 60, y, r.w - 120, { size: 14, colour: '#d8c39a' });
      y += used + 8;
    }

    if (cfg.story) {
      y += 14;
      paragraph(ctx, cfg.story, r.x + 60, y, r.w - 120, { size: 14, colour: 'rgba(180,140,92,0.75)' });
    }

    text(ctx, `${plan.length} EXPECTED AT THE DOOR`, VIEW_W / 2, r.y + r.h - 92, {
      size: 13, colour: P.amberDim, align: 'center', spacing: 3,
    });
    if (button(ctx, input, rect(VIEW_W / 2 - 150, r.y + r.h - 68, 300, 46), 'OPEN THE DOOR  [SPACE]')) {
      startShift();
    }
    input.consumeRemaining();
  }

  function drawDebug(ctx) {
    const lines = [
      `case ${index + 1}/${plan.length}  kind=${current.kind}  MIMIC=${current.isMimic}`,
      `unit=${current.claim.unit}  questions=${questionsLeft}`,
      ...current.discrepancies.map((d) => `· [${d.category}] ${d.note}`),
      ...(current.lies.length ? [`lies about: ${current.lies.join(', ')}`] : []),
      ...(current.quirks || []).map((q) => `~ quirk: ${q}`),
    ];
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    ctx.fillRect(10, 10, 720, 20 + lines.length * 17);
    lines.forEach((l, i) => {
      text(ctx, l, 20, 30 + i * 17, {
        size: 12,
        colour: i === 0 ? (current.isMimic ? '#ff8a7a' : '#8ad48a') : '#c9b98a',
      });
    });
    ctx.restore();
  }

  return {
    update,
    render,
    handlesEscape: () => view !== 'DESK',
    // Read by the browser test harness.
    debugState: () => ({ view, phase, index, total: plan.length, questionsLeft, isMimic: current && current.isMimic }),
  };
}

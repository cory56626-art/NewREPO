// The Night Shift. If anything you admitted was wearing a face, it may use the
// dark. The scene that follows is generated so that the clues *actually* isolate
// the culprit: traits are chosen greedily until exactly one suspect survives.

import { makeRng } from '../core/rng.js';
import { state } from '../core/state.js';
import { securityFactor, extraClues, canInterruptMurder } from './upgrades.js';

export const ROOMS = [
  { id: 'hall', name: 'THIRD FLOOR HALL', blurb: 'The bulb at the far end has been out for weeks.' },
  { id: 'unit', name: 'THE UNIT', blurb: 'The door was not forced. That is the first thing you notice.' },
  { id: 'laundry', name: 'LAUNDRY', blurb: 'Standing water. Something was rinsed here in a hurry.' },
  { id: 'boiler', name: 'BOILER ROOM', blurb: 'Warm. Too warm. The only warm room in the building.' },
  { id: 'stair', name: 'BACK STAIR', blurb: 'Nobody uses it. Something has been using it.' },
];

// Each trait yields a clue that names one value and rules out everyone else.
const TRAITS = [
  {
    id: 'build',
    of: (r) => r.identity.features.build,
    clue: (v) => `Hoofprints pressed into the ash, deep and wide. The tread of something ${v.toLowerCase()}.`,
    label: (v) => `TREAD: ${v}`,
  },
  {
    id: 'eyes',
    of: (r) => r.identity.features.eyeColour,
    clue: (v) => `A film of shed eye-skin on the sill, dried and curled. Held to the light it is ${v.toLowerCase()}.`,
    label: (v) => `EYES: ${v}`,
  },
  {
    id: 'ear',
    of: (r) => r.identity.features.earNotch,
    clue: (v) => (v === 'none'
      ? 'Both ears are accounted for in the blood-print on the door: whole, unnotched.'
      : `A torn scrap of ear caught in the latch. The notch is on the ${v}.`),
    label: (v) => `EAR: ${v === 'none' ? 'WHOLE' : v.toUpperCase() + ' NOTCH'}`,
  },
  {
    id: 'tusk',
    of: (r) => (r.identity.features.tusk > 0.3 ? 'TUSKED' : 'NO TUSKS'),
    clue: (v) => (v === 'TUSKED'
      ? 'Two gouges in the doorframe, a hand apart, curved upward. Tusks.'
      : 'The bite in the frame is flat and blunt. Nothing tusked made it.'),
    label: (v) => `MOUTH: ${v}`,
  },
  {
    id: 'scar',
    of: (r) => r.identity.features.scar,
    clue: (v) => (v === 'none'
      ? 'No stitch-thread anywhere in the room. Whoever it was carries no mended wound.'
      : `Black stitch-thread, torn free and trodden in. It came from a ${v} scar.`),
    label: (v) => `MARK: ${v === 'none' ? 'UNSCARRED' : v.toUpperCase() + ' SCAR'}`,
  },
  {
    id: 'hide',
    of: (r) => (r.identity.features.hide % 2 === 0 ? 'PALE' : 'DARK'),
    clue: (v) => `Bristles in the drain trap, a good handful. ${v === 'PALE' ? 'Pale as tallow.' : 'Dark as wet rope.'}`,
    label: (v) => `HIDE: ${v}`,
  },
];

const FLAVOUR = [
  'The window is open two inches. It has been painted shut for years.',
  'A chair is set neatly against the wall. Nothing else in the room is neat.',
  'There is no sign of a struggle. There is a great deal of sign of an ending.',
  'Somebody wiped the handle. Only the handle.',
  'The floor is warm here and nowhere else.',
  'A tooth on the boards. It is not a pig\'s tooth. It is very nearly one.',
];

/** Does anything happen tonight? */
export function rollNight(day, seed) {
  const rng = makeRng(seed * 77 + day * 913);
  const mimics = state.residents.filter((r) => r.alive && r.isMimic);
  if (mimics.length === 0) return { murder: false, mimics: 0, interrupted: false };

  const perMimic = 0.55 * securityFactor();
  const chance = 1 - Math.pow(1 - perMimic, mimics.length);
  const happened = rng.chance(chance);
  if (!happened) return { murder: false, mimics: mimics.length, interrupted: false };

  if (canInterruptMurder() && rng.chance(0.35)) {
    return { murder: false, mimics: mimics.length, interrupted: true };
  }
  return { murder: true, mimics: mimics.length, interrupted: false };
}

/**
 * Builds the crime scene. Guarantees the clue set narrows the suspects to
 * exactly one — the culprit — before any flavour clues are added.
 */
export function buildScene(day, seed) {
  const rng = makeRng(seed * 131 + day * 4441);
  const living = state.residents.filter((r) => r.alive);
  const mimics = living.filter((r) => r.isMimic);
  if (!mimics.length) return null;

  const culprit = rng.pick(mimics);
  const victimPool = living.filter((r) => !r.isMimic && r.key !== culprit.key);
  if (!victimPool.length) return null;
  // A mimic kills close to home.
  const sameFloor = victimPool.filter((r) => r.unit[0] === culprit.unit[0]);
  const victim = rng.pick(sameFloor.length ? sameFloor : victimPool);

  // Suspect pool: everyone who could plausibly have been in the building.
  const others = rng.shuffle(living.filter((r) => r.key !== culprit.key && r.key !== victim.key));
  const suspects = rng.shuffle([culprit, ...others.slice(0, Math.min(4, others.length))]);

  // Greedily choose traits until only the culprit fits every clue.
  let remaining = suspects.filter((s) => s.key !== culprit.key);
  const pool = rng.shuffle(TRAITS.slice());
  const clues = [];
  while (remaining.length > 0 && pool.length > 0) {
    let best = null;
    let bestCut = -1;
    for (const trait of pool) {
      const target = trait.of(culprit);
      const cut = remaining.filter((s) => trait.of(s) !== target).length;
      if (cut > bestCut) { bestCut = cut; best = trait; }
    }
    pool.splice(pool.indexOf(best), 1);
    if (bestCut <= 0) continue;
    const value = best.of(culprit);
    clues.push({
      id: best.id,
      trait: best.id,
      value,
      text: best.clue(value),
      label: best.label(value),
      eliminating: true,
    });
    remaining = remaining.filter((s) => best.of(s) === value);
  }

  // One trait can sometimes single the culprit out on its own, which makes for a
  // very thin night. Top up with further true statements about them — they cost
  // the player nothing to believe and give the evidence sheet some body.
  while (clues.length < 3 && pool.length > 0) {
    const trait = pool.pop();
    const value = trait.of(culprit);
    clues.push({
      id: trait.id,
      trait: trait.id,
      value,
      text: trait.clue(value),
      label: trait.label(value),
      eliminating: true,
    });
  }

  // Any suspect the traits cannot separate from the culprit is dropped from the
  // line-up rather than left in as an unfair coin flip.
  const fitsEveryClue = (s) => clues.every((cl) => TRAITS.find((t) => t.id === cl.trait).of(s) === cl.value);
  const finalSuspects = suspects.filter((s) => s.key === culprit.key || !fitsEveryClue(s));

  const bonus = extraClues();
  const flavour = rng.sample(FLAVOUR, Math.min(FLAVOUR.length, 4 + bonus));
  for (const text of flavour) {
    clues.push({ id: `flavour-${clues.length}`, trait: null, text, label: null, eliminating: false });
  }

  // Deal the clues round-robin starting at the victim's unit, so no room is a
  // wasted walk.
  const rooms = ROOMS.map((r) => ({ ...r, clues: [] }));
  const order = rng.shuffle(clues.slice());
  order.forEach((clue, i) => {
    rooms[(i + 1) % rooms.length].clues.push({ ...clue, found: false, x: 0, y: 0 });
  });
  for (const room of rooms) {
    const rr = makeRng(seed + room.id.length * 97 + room.clues.length);
    room.clues.forEach((clue, i) => {
      clue.x = 240 + rr.range(0, 1) * 1100 + (i % 3) * 40;
      clue.y = 330 + rr.range(0, 1) * 330;
    });
  }

  return {
    day,
    culpritKey: culprit.key,
    victimKey: victim.key,
    victimName: victim.identity.fullName,
    victimUnit: victim.unit,
    suspects: finalSuspects.map((s) => s.key),
    rooms,
    totalClues: clues.length,
    eliminating: clues.filter((c) => c.eliminating).length,
    solved: null,
  };
}

export function sceneSuspects(scene) {
  return scene.suspects
    .map((k) => state.residents.find((r) => r.key === k))
    .filter(Boolean);
}

/** Traits of a suspect, phrased the way the evidence sheet phrases them. */
export function suspectTraits(resident) {
  return TRAITS.map((t) => ({ id: t.id, label: t.label(t.of(resident)) }));
}

export function matchesEvidence(resident, foundClues) {
  return foundClues.filter((c) => c.eliminating).every((c) => {
    const trait = TRAITS.find((t) => t.id === c.trait);
    return trait.of(resident) === c.value;
  });
}

export { TRAITS as NIGHT_TRAITS };

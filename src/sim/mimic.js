// Case generation and the contradiction engine.
//
// Ground truth (`isMimic`) is decided first, and then *evidence is deliberately
// planted* — every mimic gets an explicit list of discrepancies drawn only from
// the tells the player has already been taught. Nothing is left to chance, so the
// two invariants the tests enforce hold by construction:
//
//   1. every mimic is solvable with what the player currently knows;
//   2. a legitimate applicant never carries a real contradiction, only quirks.

import { makeRng } from '../core/rng.js';
import {
  makeIdentity, cloneIdentity, marksFor, dateForDay, addDays, fmtDate,
  checkLetter, idDigits, EYE_COLOURS, BUILDS, DISTRICTS, DEAD_DISTRICTS,
} from './identity.js';
import { state, hasUpgrade } from '../core/state.js';
import { residentByUnit, vacantUnits, occupiedUnits, approvedDistricts } from './registry.js';

export const CATEGORY = {
  DOCUMENT: 'DOCUMENT',
  APPEARANCE: 'APPEARANCE',
  REGISTRY: 'REGISTRY',
  DIALOGUE: 'DIALOGUE',
};

const EMPLOYERS = ['KILN WORKS', 'THE TANNERY', 'SALT DRAWS', 'WARD SANITATION', 'SCRAP LINE 4', 'MILL ROW', 'THE ROPEWALK'];
const PHYSICIANS = ['DR. HOLLOW', 'DR. PIKE', 'SURGEON ELM', 'DR. VANCE', 'SURGEON RUE'];
const AUTHORISERS = ['WARDEN COLE', 'CLERK MASSEY', 'WARDEN OTT', 'CLERK BRINE'];
const ABSENCES = ['WORK ROTATION', 'FAMILY BURIAL', 'SALVAGE RUN', 'HOSPITAL WARD', 'DEBT WORK'];

// ---------------------------------------------------------------------------
// Tell definitions
// ---------------------------------------------------------------------------
//
// `minDay` is when the bulletin teaches it. `kinds` limits which applicant types
// it can apply to. `apply` mutates the case and returns a discrepancy record.

export const TELLS = [
  {
    id: 'EXPIRED_ID',
    category: CATEGORY.DOCUMENT,
    minDay: 1,
    apply: (c, rng) => {
      const today = dateForDay(c.day);
      c.papers.expires = addDays(today, -rng.int(20, 900));
      if (c.papers.expires.y <= c.papers.issued.y - 1) c.papers.issued = addDays(c.papers.expires, -rng.int(300, 900));
      return {
        where: 'documents', doc: 'ID_CARD', field: 'expires',
        note: `Identity card expired ${fmtDate(c.papers.expires)}.`,
      };
    },
  },
  {
    id: 'NAME_MISMATCH',
    category: CATEGORY.DOCUMENT,
    minDay: 1,
    apply: (c, rng) => {
      const target = c.docTypes.find((t) => t !== 'ID_CARD');
      if (!target) return null;
      const name = c.papers.fullName;
      const variants = [
        name.replace(/m$/, 'rn'), name.replace(/i/, 'l'), name.replace(/o/, 'e'),
        `${name.slice(0, -1)}${rng.pick(['e', 'y', 's', 'n'])}`,
      ].filter((v) => v !== name);
      const wrong = rng.pick(variants.length ? variants : [`${name}e`]);
      c.fieldOverrides[`${target}.name`] = wrong;
      return {
        where: 'documents', doc: target, field: 'name',
        note: `Name is spelled "${wrong}" here and "${name}" on the identity card.`,
      };
    },
  },
  {
    id: 'EYES_PRINTED',
    category: CATEGORY.APPEARANCE,
    minDay: 2,
    apply: (c, rng) => {
      const actual = c.identity.features.eyeColour;
      const wrong = rng.pick(EYE_COLOURS.filter((e) => e !== actual));
      c.papers.eyesPrinted = wrong;
      return {
        where: 'appearance', doc: 'ID_CARD', field: 'eyes',
        note: `Papers say the eyes are ${wrong}. They are ${actual}.`,
      };
    },
  },
  {
    id: 'BUILD_PRINTED',
    category: CATEGORY.APPEARANCE,
    minDay: 2,
    apply: (c, rng) => {
      const actual = c.identity.features.build;
      const idx = BUILDS.indexOf(actual);
      const wrong = rng.pick(BUILDS.filter((b, i) => Math.abs(i - idx) >= 2));
      c.papers.buildPrinted = wrong;
      c.papers.heightPrinted = c.identity.features.heightCm + (BUILDS.indexOf(wrong) - idx) * 7;
      return {
        where: 'appearance', doc: 'ID_CARD', field: 'build',
        note: `Papers describe a ${wrong} build. The applicant is ${actual}.`,
      };
    },
  },
  {
    id: 'MARKS_PRINTED',
    category: CATEGORY.APPEARANCE,
    minDay: 2,
    apply: (c, rng) => {
      const actual = marksFor(c.identity.features);
      const options = ['NONE', 'BROW SCAR', 'CHEEK SCAR', 'SNOUT SCAR', 'LEFT EAR NOTCHED', 'RIGHT EAR NOTCHED']
        .filter((m) => m !== actual);
      const wrong = rng.pick(options);
      c.papers.marksPrinted = wrong;
      return {
        where: 'appearance', doc: 'ID_CARD', field: 'marks',
        note: `Papers record "${wrong}". The applicant shows "${actual}".`,
      };
    },
  },
  {
    id: 'PHOTO_MISMATCH',
    category: CATEGORY.APPEARANCE,
    minDay: 3,
    apply: (c, rng) => {
      const f = { ...c.identity.features };
      const change = rng.pick(['ear', 'snout', 'eyes', 'tusk', 'skull', 'scar']);
      let note;
      switch (change) {
        case 'ear':
          f.earNotch = f.earNotch === 'none' ? rng.pick(['left', 'right']) : 'none';
          f.earSize = f.earSize * rng.range(1.18, 1.3);
          note = 'The ears in the photograph are not this animal\'s ears.';
          break;
        case 'snout':
          f.snoutLen = f.snoutLen * rng.pick([0.66, 1.42]);
          f.snoutW = f.snoutW * rng.pick([0.74, 1.34]);
          note = 'The snout in the photograph is the wrong length.';
          break;
        case 'eyes':
          f.eyeSpacing = f.eyeSpacing * rng.pick([0.7, 1.36]);
          f.eyeSize = f.eyeSize * rng.pick([0.72, 1.32]);
          note = 'The eyes in the photograph sit wrongly in the skull.';
          break;
        case 'tusk':
          f.tusk = f.tusk > 0.3 ? 0 : rng.range(0.7, 1);
          note = 'The tusks in the photograph do not match the mouth in front of you.';
          break;
        case 'skull':
          f.headW = f.headW * rng.pick([0.82, 1.2]);
          f.jowl = 1 - f.jowl;
          note = 'The shape of the head in the photograph is wrong.';
          break;
        default:
          f.scar = f.scar === 'none' ? rng.pick(['brow', 'cheek', 'snout']) : 'none';
          note = 'The photograph carries a scar the applicant does not.';
      }
      c.papers.photoFeatures = f;
      return { where: 'appearance', doc: 'ID_CARD', field: '__photo', note };
    },
  },
  {
    id: 'CHECKSUM',
    category: CATEGORY.DOCUMENT,
    minDay: 4,
    apply: (c, rng) => {
      const digits = idDigits(c.papers.idNumber);
      const right = checkLetter(digits);
      let wrong = right;
      while (wrong === right) wrong = String.fromCharCode(65 + rng.int(0, 25));
      c.papers.idNumber = `${c.papers.districtCode}-${digits}-${wrong}`;
      return {
        where: 'documents', doc: 'ID_CARD', field: 'idNumber',
        note: `ID number fails the check letter — ${digits} should end ${right}, not ${wrong}.`,
      };
    },
  },
  {
    id: 'SEALED_WARD',
    category: CATEGORY.DOCUMENT,
    minDay: 4,
    // The sealed-ward rule is about letting new people in from outside, so it
    // can only ever be a tell for someone asking for a room.
    kinds: ['NEW', 'TRANSFER'],
    available: (c) => approvedDistricts(c.day).closed.length > 0,
    apply: (c, rng) => {
      const closed = approvedDistricts(c.day).closed;
      const name = rng.pick(closed);
      const match = DISTRICTS.find((d) => d.name === name);
      c.papers.district = match.name;
      c.papers.districtCode = match.code;
      const digits = idDigits(c.papers.idNumber);
      c.papers.idNumber = `${match.code}-${digits}-${checkLetter(digits)}`;
      return {
        where: 'documents', doc: 'ID_CARD', field: 'district',
        note: `${match.name} is sealed today. The bulletin says refuse on sight.`,
      };
    },
  },
  {
    id: 'DEAD_WARD',
    category: CATEGORY.DOCUMENT,
    minDay: 5,
    apply: (c, rng) => {
      const dead = rng.pick(DEAD_DISTRICTS);
      c.papers.district = dead.name;
      c.papers.districtCode = dead.code;
      const digits = idDigits(c.papers.idNumber);
      c.papers.idNumber = `${dead.code}-${digits}-${checkLetter(digits)}`;
      return {
        where: 'documents', doc: 'ID_CARD', field: 'district',
        note: `${dead.name} has not existed for years. No one is issued papers there.`,
      };
    },
  },
  {
    // Only checkable once the player owns the WARD REGISTER — buying that
    // upgrade is literally what puts this class of forgery within reach.
    id: 'PREFIX_MISMATCH',
    category: CATEGORY.DOCUMENT,
    minDay: 6,
    available: () => hasUpgrade('records_cross'),
    apply: (c, rng) => {
      const other = rng.pick(DISTRICTS.filter((d) => d.code !== c.papers.districtCode));
      const digits = idDigits(c.papers.idNumber);
      c.papers.idNumber = `${other.code}-${digits}-${checkLetter(digits)}`;
      return {
        where: 'documents', doc: 'ID_CARD', field: 'idNumber',
        note: `The number is stamped ${other.code} — that is ${other.name}, not ${c.papers.district}.`,
      };
    },
  },
  {
    id: 'DATE_IMPOSSIBLE',
    category: CATEGORY.DOCUMENT,
    minDay: 5,
    apply: (c, rng) => {
      if (rng.chance(0.5)) {
        c.papers.issued = addDays(c.papers.expires, rng.int(40, 400));
        return {
          where: 'documents', doc: 'ID_CARD', field: 'issued',
          note: 'The card was issued after it expired.',
        };
      }
      c.papers.born = addDays(c.papers.issued, rng.int(200, 900));
      return {
        where: 'documents', doc: 'ID_CARD', field: 'born',
        note: 'The bearer was born after their own card was printed.',
      };
    },
  },
  {
    id: 'UNIT_OCCUPIED',
    category: CATEGORY.REGISTRY,
    minDay: 5,
    kinds: ['NEW', 'TRANSFER'],
    available: () => occupiedUnits().length > 0,
    apply: (c, rng) => {
      const unit = rng.pick(occupiedUnits());
      c.claim.unit = unit;
      const r = residentByUnit(unit);
      return {
        where: 'registry', doc: 'RESIDENCY_PERMIT', field: 'unit',
        note: `Unit ${unit} is not vacant — the roster has ${r.identity.fullName} in it.`,
      };
    },
  },
  {
    id: 'NO_SEAL',
    category: CATEGORY.DOCUMENT,
    minDay: 6,
    apply: (c) => {
      c.claim.sealed = false;
      const doc = c.docTypes.includes('RESIDENCY_PERMIT') ? 'RESIDENCY_PERMIT' : 'RESIDENT_PASS';
      return {
        where: 'documents', doc, field: null,
        note: 'The registry seal is missing entirely. No clerk issued this.',
      };
    },
  },
  {
    id: 'ROSTER_ID_MISMATCH',
    category: CATEGORY.REGISTRY,
    minDay: 6,
    kinds: ['RESIDENT'],
    apply: (c, rng) => {
      const real = c.impersonating.identity.idNumber;
      let digits = idDigits(real);
      let wrongDigits = digits;
      while (wrongDigits === digits) wrongDigits = String(rng.int(1000, 9999));
      c.papers.idNumber = `${c.impersonating.identity.districtCode}-${wrongDigits}-${checkLetter(wrongDigits)}`;
      return {
        where: 'registry', doc: 'ID_CARD', field: 'idNumber',
        note: `The roster has ${real} against this name, not ${c.papers.idNumber}.`,
      };
    },
  },
  {
    id: 'ALREADY_INSIDE',
    category: CATEGORY.REGISTRY,
    minDay: 6,
    kinds: ['RESIDENT'],
    apply: (c, rng) => {
      const when = fmtDate(dateForDay(Math.max(1, c.day - rng.int(1, 4))));
      c.plantedVisit = { date: when, name: c.papers.fullName, unit: c.claim.unit, note: 'RETURNED' };
      return {
        where: 'registry', doc: 'RESIDENT_PASS', field: 'reason',
        note: `The door log already has ${c.papers.fullName} coming home on ${when}. They never left again.`,
      };
    },
  },
  {
    id: 'IMPERSONATION',
    category: CATEGORY.APPEARANCE,
    minDay: 7,
    kinds: ['RESIDENT'],
    apply: (c) => ({
      where: 'registry', doc: 'RESIDENT_FILE', field: '__photo',
      note: `The photograph in ${c.impersonating.unit}'s file is a different animal.`,
    }),
  },
];

export const DIALOGUE_TOPICS = ['unit', 'sponsor', 'since', 'district', 'occupation', 'name', 'idNumber'];

// ---------------------------------------------------------------------------
// Case construction
// ---------------------------------------------------------------------------

function pickKind(rng, day) {
  const vacant = vacantUnits().length;
  const residents = state.residents.filter((r) => r.alive).length;
  const options = [];
  if (vacant > 0) options.push(['NEW', day < 3 ? 10 : 6]);
  if (day >= 4 && residents > 0) options.push(['RESIDENT', day < 7 ? 3 : 5]);
  if (day >= 6 && vacant > 0) options.push(['TRANSFER', 3]);
  if (!options.length) options.push(['RESIDENT', 1]);
  return rng.pickWeighted(options);
}

function docTypesFor(kind, day) {
  const docs = ['ID_CARD'];
  if (kind === 'RESIDENT') docs.push('RESIDENT_PASS');
  else docs.push('RESIDENCY_PERMIT');
  if (kind === 'TRANSFER') docs.push('TRANSFER_SLIP');
  if (day >= 3 && kind !== 'RESIDENT') docs.push('WORK_CHIT');
  if (day >= 8) docs.push('MEDICAL_SLIP');
  return docs;
}

export function availableTells(day, c) {
  return TELLS.filter((t) => {
    if (t.minDay > day) return false;
    if (t.kinds && !t.kinds.includes(c.kind)) return false;
    if (t.available && !t.available(c)) return false;
    return true;
  });
}

function applyQuirks(c, rng) {
  // Harmless oddities. None of these is ever a rule violation — they exist so
  // that "something feels off" is not the same thing as "this is a mimic".
  const quirks = [];
  if (rng.chance(0.35)) {
    c.claim.stamp = rng.pick(['RE-FILED', 'DUPLICATE', 'LATE', 'BY HAND']);
    quirks.push('paperwork re-filed');
  }
  if (rng.chance(0.3)) {
    c.claim.sponsor = 'NONE';
    quirks.push('no sponsor');
  }
  if (rng.chance(0.25)) {
    c.claim.medicalNote = rng.pick([
      'Old fracture, left foreleg. Set badly. No bearing on lodging.',
      'Persistent cough. Ward air. Not contagious.',
      'Underweight. Recommend feeding.',
    ]);
    quirks.push('medical note');
  }
  if (rng.chance(0.3)) {
    c.claim.chitDate = addDays(dateForDay(c.day), -rng.int(200, 700));
    quirks.push('stale work chit');
  }
  c.quirks = quirks;
}

function behaviourFor(c, rng) {
  // Soft signals. A mimic is *more likely* to show these, an honest pig can show
  // them too — they push the player toward asking, never toward a verdict.
  const pool = c.isMimic
    ? ['STARES WITHOUT BLINKING', 'ANSWERS BEFORE YOU FINISH', 'SITS TOO STILL', 'SMILES WITH TOO MANY TEETH', 'DOES NOT SHIFT ITS WEIGHT']
    : ['WRINGS ITS HANDS', 'WON\'T MEET YOUR EYE', 'COUGHS INTO A SLEEVE', 'TAPS THE DESK', 'KEEPS GLANCING AT THE DOOR'];
  const n = c.isMimic ? (rng.chance(0.75) ? 1 : 2) : (rng.chance(0.5) ? 1 : 0);
  return rng.sample(pool, n);
}

/**
 * @param {object} o { day, seed, isMimic, rules }
 */
export function makeCase(o) {
  const { day, seed } = o;
  const rng = makeRng(seed);
  const today = dateForDay(day);

  const c = {
    id: `case-${seed}`,
    seed,
    day,
    version: 1,
    kind: pickKind(rng, day),
    isMimic: !!o.isMimic,
    discrepancies: [],
    fieldOverrides: {},
    lies: [],
    dialogueOnly: false,
    impersonating: null,
    plantedVisit: null,
    answered: {},
    questionsAsked: 0,
    verdict: null,
  };

  // --- who is actually sitting down -------------------------------------
  if (c.kind === 'RESIDENT') {
    const closedToday = approvedDistricts(day).closed;
    const all = state.residents.filter((r) => r.alive && !r.isMimic);
    // Prefer someone whose home ward is still open, so a returning resident is
    // never a judgement call about a rule that does not apply to them.
    const pool = all.filter((r) => !closedToday.includes(r.identity.district));
    const target = pool.length ? rng.pick(pool) : (all.length ? rng.pick(all) : null);
    if (!target) {
      c.kind = 'NEW';
    } else {
      c.impersonating = target;
      if (c.isMimic) {
        // The animal is a stranger wearing the resident's name.
        c.identity = makeIdentity(rng.seed(), { day });
        c.identity.fullName = target.identity.fullName;
        c.identity.firstName = target.identity.firstName;
        c.identity.lastName = target.identity.lastName;
        c.identity.idNumber = target.identity.idNumber;
        c.identity.district = target.identity.district;
        c.identity.districtCode = target.identity.districtCode;
      } else {
        c.identity = cloneIdentity(target.identity);
      }
      c.claim = { unit: target.unit };
    }
  }
  if (!c.identity) {
    c.identity = makeIdentity(rng.seed(), { day });
    c.claim = {};
  }

  // The printed version of the applicant starts out perfectly honest.
  c.identity.eyesPrinted = c.identity.features.eyeColour;
  c.identity.buildPrinted = c.identity.features.build;
  c.identity.marksPrinted = marksFor(c.identity.features);
  c.identity.heightPrinted = c.identity.features.heightCm;
  c.identity.weightPrinted = c.identity.features.weightKg;
  c.identity.photoFeatures = { ...c.identity.features };
  c.papers = cloneIdentity(c.identity);

  // --- what they are asking for -----------------------------------------
  const vacant = vacantUnits();
  c.claim.unit = c.claim.unit || (vacant.length ? rng.pick(vacant) : rng.pick(state.units));
  c.claim.sponsor = c.claim.sponsor
    || (state.residents.filter((r) => r.alive).length && rng.chance(0.55)
      ? rng.pick(state.residents.filter((r) => r.alive)).identity.fullName
      : 'NONE');
  c.claim.filed = addDays(today, -rng.int(0, 12));
  c.claim.employer = rng.pick(EMPLOYERS);
  c.claim.wage = rng.int(6, 34);
  c.claim.chitDate = addDays(today, -rng.int(1, 40));
  c.claim.absence = rng.pick(ABSENCES);
  c.claim.sinceLabel = c.impersonating ? fmtDate(dateForDay(Math.max(1, c.impersonating.sinceDay))) : fmtDate(addDays(today, -rng.int(60, 800)));
  c.claim.authoriser = rng.pick(AUTHORISERS);
  c.claim.transferDate = addDays(today, -rng.int(1, 20));
  c.claim.examDate = addDays(today, -rng.int(2, 90));
  c.claim.physician = rng.pick(PHYSICIANS);
  c.claim.sealed = true;
  c.claim.stamp = null;
  c.claim.medicalNote = null;
  c.docTypes = docTypesFor(c.kind, day);

  // --- plant the evidence -----------------------------------------------
  if (c.isMimic) {
    const pool = availableTells(day, c);
    const hard = pool.filter((t) => t.category !== CATEGORY.DIALOGUE);
    const count = day <= 2 ? 1 : day <= 5 ? rng.int(1, 2) : rng.int(1, 3);

    // Impersonation is always the headline tell when one is available.
    const forced = [];
    if (c.kind === 'RESIDENT' && day >= 7 && hard.some((t) => t.id === 'IMPERSONATION')) {
      forced.push(hard.find((t) => t.id === 'IMPERSONATION'));
    }
    const rest = rng.shuffle(hard.filter((t) => !forced.includes(t)));
    const chosen = [...forced, ...rest].slice(0, Math.max(1, count));

    for (const tell of chosen) {
      const d = tell.apply(c, rng);
      if (d) c.discrepancies.push({ id: tell.id, category: tell.category, ...d });
    }

    // Dialogue slips corroborate from day 7. A mimic that has been caught out on
    // paper will also fumble a question, which is how the player learns to trust
    // the yellow button.
    if (day >= 7) {
      const topics = rng.sample(['unit', 'sponsor', 'since', 'district'], rng.int(1, 3));
      c.lies = topics;
      for (const t of topics) {
        c.discrepancies.push({
          id: `DIALOGUE_${t.toUpperCase()}`,
          category: CATEGORY.DIALOGUE,
          where: 'dialogue',
          doc: null,
          field: t,
          note: `Their answer about ${t} contradicts the paperwork.`,
        });
      }
    }
  } else {
    applyQuirks(c, rng);
    // A legitimate resident coming home is logged properly.
    if (c.kind === 'RESIDENT' && c.impersonating) {
      c.claim.unit = c.impersonating.unit;
    }
    // ...and a legitimate new tenant never asks for an occupied unit.
    if (c.kind !== 'RESIDENT' && residentByUnit(c.claim.unit)) {
      const free = vacantUnits();
      if (free.length) c.claim.unit = rng.pick(free);
    }
    // ...nor walks in from a ward today's bulletin has sealed. Refusing such a
    // person is the correct call, so an honest one must never be generated —
    // otherwise obeying the bulletin would be punished as a wrong denial.
    const closed = approvedDistricts(day).closed;
    if (c.kind !== 'RESIDENT' && closed.includes(c.papers.district)) {
      const open = DISTRICTS.filter((d) => !closed.includes(d.name));
      const swap = rng.pick(open.length ? open : DISTRICTS);
      const digits = idDigits(c.papers.idNumber);
      const idNumber = `${swap.code}-${digits}-${checkLetter(digits)}`;
      for (const target of [c.identity, c.papers]) {
        target.district = swap.name;
        target.districtCode = swap.code;
        target.idNumber = idNumber;
      }
    }
  }

  c.behaviour = behaviourFor(c, rng);
  c.rngSeed = rng.seed();
  return c;
}

/** Discrepancies that don't need the interview. */
export const hardDiscrepancies = (c) => c.discrepancies.filter((d) => d.where !== 'dialogue');

/**
 * The fairness check the tests lean on: could a careful player have caught this?
 */
export function isSolvable(c) {
  if (!c.isMimic) return true;
  if (hardDiscrepancies(c).length >= 1) return true;
  return c.lies.length >= 3;
}

/** A legitimate applicant must never carry a genuine contradiction. */
export function isClean(c) {
  return c.isMimic || (c.discrepancies.length === 0 && c.lies.length === 0);
}

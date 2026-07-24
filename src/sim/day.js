// The campaign. Ten authored days, each one teaching exactly one new way to be
// lied to, then an endless mode that keeps escalating.

import { makeRng } from '../core/rng.js';
import { state } from '../core/state.js';
import { makeCase } from './mimic.js';
import { applicantBonus } from './upgrades.js';
import { vacantUnits } from './registry.js';

export const CAMPAIGN = [
  {
    day: 1,
    quota: 5,
    mimics: 1,
    title: 'THE DOOR OPENS',
    rules: [
      'EVERY APPLICANT SHOWS AN IDENTITY CARD. NO CARD, NO ROOM.',
      'REFUSE ANY CARD THAT HAS EXPIRED.',
      'THE NAME MUST BE THE SAME ON EVERY PAPER THEY HAND YOU.',
    ],
    story: 'Your father kept this building for thirty years. He never wrote down how.',
  },
  {
    day: 2,
    quota: 6,
    mimics: 1,
    title: 'A DESCRIPTION IS A PROMISE',
    rules: [
      'THE CARD DESCRIBES THE BEARER: EYES, BUILD, MARKS.',
      'REFUSE WHERE THE DESCRIPTION DOES NOT FIT THE ANIMAL IN THE CHAIR.',
    ],
    story: 'Merrow ward burned last night. There will be more of them at the door.',
  },
  {
    day: 3,
    quota: 6,
    mimics: 1,
    title: 'THE FACE ON THE CARD',
    rules: [
      'COMPARE THE PHOTOGRAPH TO THE FACE. TAKE YOUR TIME OVER IT.',
      'A FORGER CAN COPY A NAME. NO ONE CAN COPY A SKULL.',
      'LABOUR CHITS ARE NOW COLLECTED. THEY PROVE MEANS, NOT RIGHT.',
    ],
    story: 'A tenant in 2C says something was in the hall, standing still, for an hour.',
  },
  {
    day: 4,
    quota: 7,
    mimics: 2,
    title: 'ARITHMETIC',
    rules: [
      'ID NUMBERS CARRY A CHECK LETTER. VERIFY IT.',
      'SEALED WARDS ARE LISTED BELOW. REFUSE NEW APPLICANTS OUT OF THEM.',
      'A RESIDENT COMING HOME IS NOT A NEW APPLICANT.',
      'RESIDENTS MAY RETURN FROM OUTSIDE. THEY CARRY A RESIDENT PASS.',
    ],
    story: 'The ward office sent a letter. It uses the word "mimic" twice and explains it once.',
  },
  {
    day: 5,
    quota: 8,
    mimics: 2,
    title: 'IMPOSSIBLE THINGS',
    rules: [
      'DATES MUST BE POSSIBLE. NOTHING IS ISSUED AFTER IT EXPIRES.',
      'NO ONE IS BORN AFTER THEIR OWN CARD IS PRINTED.',
      'DO NOT LODGE TWO FAMILIES IN ONE UNIT. CHECK THE ROSTER.',
      'SOME WARDS ON THESE PAPERS NO LONGER EXIST. THE REGISTER BELOW IS COMPLETE.',
    ],
    story: 'You have started dreaming about the ledger. In the dream every unit is full.',
  },
  {
    day: 6,
    quota: 9,
    mimics: 2,
    title: 'THE SEAL AND THE LOG',
    rules: [
      'EVERY PERMIT AND PASS MUST CARRY THE REGISTRY SEAL.',
      'NAMES AND NUMBERS MUST AGREE WITH THE HOUSE ROSTER.',
      'THE DOOR LOG DOES NOT LIE. NOBODY COMES HOME TWICE.',
    ],
    story: 'You have begun locking your own door. You are the owner. You lock it anyway.',
  },
  {
    day: 7,
    quota: 10,
    mimics: 3,
    title: 'SOMEONE YOU KNOW',
    rules: [
      'RESIDENTS RETURNING MUST MATCH THEIR FILE. FACE INCLUDED.',
      'PRESS THE YELLOW BUTTON. A MIMIC IMPROVISES BADLY.',
      'A MIMIC WEARING A NEIGHBOUR IS STILL A MIMIC.',
    ],
    story: 'It is wearing people now. Not strangers. People whose rent you have counted.',
  },
  {
    day: 8,
    quota: 11,
    mimics: 3,
    title: 'FITNESS TO LODGE',
    rules: [
      'HEALTH INSPECTIONS ARE NOW REQUIRED OF ALL APPLICANTS.',
      'THE SURGERY RECORDS EYES AND WEIGHT. SO DOES THE CARD. THEY MUST AGREE.',
      'ALL PREVIOUS RULES REMAIN IN FORCE.',
    ],
    story: 'The surgeon will not come inside any more. She leaves the slips in the letterbox.',
  },
  {
    day: 9,
    quota: 12,
    mimics: 3,
    title: 'THE QUEUE DOES NOT END',
    rules: [
      'ALL PREVIOUS RULES REMAIN IN FORCE.',
      'TWO WARDS ARE SEALED. THE LIST IS BELOW.',
      'YOU ARE PERMITTED TO REFUSE WITHOUT CAUSE. YOU ARE NOT PERMITTED TO BE WRONG.',
    ],
    story: 'There is a queue down the street before you unlock. Nobody is talking in it.',
  },
  {
    day: 10,
    quota: 14,
    mimics: 4,
    title: 'THE LAST HONEST DESK',
    rules: [
      'ALL PREVIOUS RULES REMAIN IN FORCE.',
      'THE WARD OFFICE HAS STOPPED ANSWERING. THIS BULLETIN IS YOUR OWN.',
      'WHATEVER YOU LET IN TONIGHT, YOU LIVE WITH.',
    ],
    story: 'Whatever happens after tonight, it happens to a building you chose the shape of.',
  },
];

export const LAST_AUTHORED_DAY = CAMPAIGN.length;

export function dayConfig(day) {
  const authored = CAMPAIGN.find((d) => d.day === day);
  if (authored) return authored;
  // Endless: the queue keeps growing and roughly two in five are wearing a face.
  const over = day - LAST_AUTHORED_DAY;
  const quota = Math.min(20, 14 + Math.floor(over / 2));
  return {
    day,
    quota,
    mimics: Math.max(3, Math.round(quota * 0.36)),
    title: `NIGHT ${day}`,
    rules: [
      'ALL PREVIOUS RULES REMAIN IN FORCE.',
      'NO FURTHER BULLETINS WILL BE ISSUED.',
      'THE DESK IS YOURS. SO IS THE CONSEQUENCE.',
    ],
    story: null,
    endless: true,
  };
}

/**
 * Plans the day's queue: how many applicants, and which of them are wearing a
 * face. Only the plan is made up front — each case is generated at the moment
 * that applicant walks in, so it sees the roster as it stands *then*. Building
 * them all in advance would let an admission earlier in the day turn a later
 * honest applicant's vacant unit into an "occupied unit" contradiction.
 */
export function planQueue(day, seed = state.seed) {
  const cfg = dayConfig(day);
  const rng = makeRng(seed * 31 + day * 7717);

  let count = cfg.quota + applicantBonus();
  // Never queue more applicants than there are beds, or the day stalls.
  const room = vacantUnits().length;
  if (room < 2) count = Math.min(count, Math.max(3, room + 4));

  let mimics = Math.min(cfg.mimics, Math.max(0, count - 1));
  // From day 3 a shift can occasionally be entirely clean — the bonus for a
  // quiet night has to be reachable, and doubt is the point.
  if (day >= 3 && rng.chance(0.14)) mimics = 0;

  const flags = rng.shuffle([
    ...Array(mimics).fill(true),
    ...Array(count - mimics).fill(false),
  ]);

  return flags.map((isMimic, i) => ({
    isMimic,
    seed: seed * 1013 + day * 131 + i * 17 + 1,
    day,
  }));
}

/** Realise one planned applicant against the registry as it stands right now. */
export function caseFromPlan(entry) {
  return makeCase(entry);
}

export const dayTitle = (day) => dayConfig(day).title;
export const dayRules = (day) => dayConfig(day).rules;
export const dayStory = (day) => dayConfig(day).story;

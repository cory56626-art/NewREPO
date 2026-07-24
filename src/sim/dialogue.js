// The interview. Pressing the yellow button lights up the fields on the
// applicant's papers; clicking one asks about it. Answers are generated from the
// same case data the documents came from, so a lie is a real contradiction the
// player can go back and verify rather than a scripted "gotcha".

import { makeRng } from '../core/rng.js';
import { state, hasUpgrade } from '../core/state.js';
import { fmtDate, EYE_COLOURS, BUILDS, DISTRICTS } from './identity.js';
import { residentByUnit, neighboursOf, tenureLabel } from './registry.js';

export function questionBudget() {
  let n = 2;
  if (hasUpgrade('desk_questions')) n += 1;
  if (hasUpgrade('desk_questions2')) n += 2;
  return n;
}

const ASK = {
  name: 'State your name.',
  idNumber: 'Read me your number.',
  born: 'When were you born?',
  district: 'Which ward are you out of?',
  eyes: 'Look up. What colour are your eyes?',
  build: 'How would a clerk describe your build?',
  marks: 'Any marks on you?',
  height: 'How tall are you?',
  issued: 'When was that card issued?',
  expires: 'When does that card run out?',
  unit: 'Which unit are you asking for?',
  since: 'How long have you lived here?',
  sponsor: 'Who sponsors you?',
  occupation: 'What is your trade?',
  employer: 'Who pays you?',
  wage: 'What do they pay you?',
  reason: 'Where have you been?',
  authorised: 'Who signed your transfer?',
  physician: 'Who examined you?',
  blood: 'What is your blood type?',
  __photo: 'Is that photograph recent?',
};

const HONEST = {
  name: (c) => `${c.papers.fullName}. It's on the card.`,
  idNumber: (c) => `${c.papers.idNumber}. I've said it enough times today.`,
  born: (c) => `${fmtDate(c.papers.born)}. A bad year for it.`,
  district: (c) => `${c.papers.district}. Walked most of it.`,
  eyes: (c) => `${c.identity.features.eyeColour.toLowerCase()}, last I looked.`,
  build: (c) => `${c.identity.features.build.toLowerCase()}, they write. I'd say hungry.`,
  marks: (c) => {
    const m = c.papers.marksPrinted;
    return m === 'NONE' ? 'None worth writing down.' : `${m.toLowerCase()}. Old business.`;
  },
  height: (c) => `${c.papers.heightPrinted} centimetres, give or take a stoop.`,
  issued: (c) => `${fmtDate(c.papers.issued)}. Same clerk, same desk.`,
  expires: (c) => `${fmtDate(c.papers.expires)}. I can read.`,
  unit: (c) => `${c.claim.unit}. That's what I was told to ask for.`,
  since: (c) => (c.impersonating
    ? `${tenureLabel(c.impersonating, c.day)}, near enough.`
    : 'I don\'t. That\'s rather the point of the paper.'),
  sponsor: (c) => (c.claim.sponsor === 'NONE'
    ? 'Nobody. I have no one left to vouch.'
    : `${c.claim.sponsor}. Ask them, they'll grumble but they'll say yes.`),
  occupation: (c) => `${c.papers.occupation.toLowerCase()}. Since I could lift.`,
  employer: (c) => `${c.claim.employer}. When there's work.`,
  wage: (c) => `${c.claim.wage} scrip a week. Less what they take.`,
  reason: (c) => `${c.claim.absence.toLowerCase()}. Longer than I wanted.`,
  authorised: (c) => `${c.claim.authoriser}. Miserable sort.`,
  physician: (c) => `${c.claim.physician}. Cold hands.`,
  blood: (c) => `${c.papers.bloodType}. Why?`,
  __photo: () => 'Two winters back. I looked better fed.',
};

/** What a mimic says when it has to improvise. */
function lie(c, topic, rng) {
  switch (topic) {
    case 'unit': {
      const others = state.units.filter((u) => u !== c.claim.unit);
      return `${rng.pick(others)}. That's what I was told to ask for.`;
    }
    case 'sponsor': {
      const dead = (state.formerResidents || []).map((f) => f.name);
      const living = state.residents.filter((r) => r.alive).map((r) => r.identity.fullName);
      const pool = dead.length ? dead : living;
      const pick = pool.length ? rng.pick(pool) : 'a friend inside';
      return `${pick}. We go back.`;
    }
    case 'since': {
      return c.impersonating
        ? `${rng.int(6, 19)} years. Longer than most.`
        : `Years. I've always lived here.`;
    }
    case 'district': {
      const other = rng.pick(DISTRICTS.filter((d) => d.name !== c.papers.district));
      return `${other.name}. Walked most of it.`;
    }
    case 'name':
      return `${c.papers.firstName} ${rng.pick(['Gammon', 'Rind', 'Wattle', 'Byre'])}. It's on the card.`;
    case 'idNumber':
      return `${c.papers.districtCode}-${rng.int(1000, 9999)}-${String.fromCharCode(65 + rng.int(0, 25))}.`;
    case 'eyes':
      return `${rng.pick(EYE_COLOURS.filter((e) => e !== c.identity.features.eyeColour)).toLowerCase()}.`;
    case 'build':
      return `${rng.pick(BUILDS.filter((b) => b !== c.identity.features.build)).toLowerCase()}.`;
    case 'occupation':
      return `Whatever pays. ${rng.pick(['Hauling', 'Digging', 'Watching'])}, lately.`;
    default:
      return 'I don\'t see why that matters.';
  }
}

const CUES_MIMIC = [
  'It answers before you finish the question.',
  'It does not blink.',
  'Its jaw moves a moment after the words.',
  'It is smiling. It has not stopped smiling.',
  'It watches your hand, not your face.',
  'Something behind its eyes finishes the sentence first.',
];
const CUES_HONEST = [
  'They shift in the chair.',
  'They look at the floor.',
  'They wipe their snout on a sleeve.',
  'They glance back at the door.',
  'They say it like they have said it all day.',
  'Their hands do not stop moving.',
];

/**
 * Which fields the applicant can be questioned about, derived from the documents
 * actually on the table.
 */
export function topicsFor(docs) {
  const seen = new Set();
  const topics = [];
  for (const doc of docs) {
    for (const f of doc.fields || []) {
      if (!ASK[f.id] || seen.has(f.id)) continue;
      seen.add(f.id);
      topics.push({ id: f.id, doc: doc.type, label: f.label, question: ASK[f.id] });
    }
  }
  return topics;
}

export function isAskable(fieldId) {
  return !!ASK[fieldId];
}

/**
 * @returns {{question:string, answer:string, cue:string, lying:boolean}}
 */
export function ask(c, topicId) {
  const rng = makeRng((c.rngSeed || c.seed) + topicId.length * 31 + topicId.charCodeAt(0));
  const lying = c.isMimic && c.lies.includes(topicId);
  const answer = lying
    ? lie(c, topicId, rng)
    : (HONEST[topicId] ? HONEST[topicId](c) : 'I couldn\'t say.');

  // The behavioural cue leans with the truth but never proves it: an honest pig
  // can be twitchy and a patient mimic can sit still.
  let cue;
  if (c.isMimic) cue = rng.chance(hasUpgrade('desk_lamp') ? 0.8 : 0.55) ? rng.pick(CUES_MIMIC) : rng.pick(CUES_HONEST);
  else cue = rng.chance(0.75) ? rng.pick(CUES_HONEST) : rng.pick(CUES_MIMIC);

  return { question: ASK[topicId] || '...', answer, cue, lying };
}

/** Free line as they sit down. Flavour, plus a nudge toward the behaviour tells. */
export function greeting(c) {
  const rng = makeRng(c.seed + 991);
  const lines = c.kind === 'RESIDENT'
    ? ['I live here. You know I live here.', 'Long way back. Let me up.', 'It\'s me. Same as it was.']
    : c.kind === 'TRANSFER'
      ? ['They said you had rooms.', 'Transferred in. Papers and all.', 'I walked from the ward office.']
      : ['I heard you had space.', 'I can pay. Mostly.', 'Cold out there. Colder than in.'];
  return rng.pick(lines);
}

/** Line as they leave, which is the last chance to feel something about them. */
export function farewell(c, admitted) {
  const rng = makeRng(c.seed + (admitted ? 17 : 23));
  if (admitted) {
    return rng.pick(c.isMimic
      ? ['Thank you. You have been very fair.', 'You won\'t know I\'m there.', 'I\'ll settle in. Quietly.']
      : ['Thank you. Truly.', 'I won\'t be trouble.', 'Bless the desk.']);
  }
  return rng.pick(c.isMimic
    ? ['You will change your mind.', 'I will be here tomorrow.', 'Someone will let me in.']
    : ['Then where do I go?', 'Please. It\'s cold.', 'I understand. I don\'t, but I do.']);
}

/** Only used by the debug overlay. */
export function neighbourHint(c) {
  const n = neighboursOf(c.claim.unit);
  return n.length ? n.map((r) => `${r.unit} ${r.identity.fullName}`).join(', ') : 'none';
}

export const claimedResident = (c) => residentByUnit(c.claim.unit);

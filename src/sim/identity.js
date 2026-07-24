// Identity generation. A pig is a bundle of *visible features* plus *paperwork*,
// and the two are generated from the same seed. That is the spine of the whole
// game: the photo on the ID card and the animal in the chair are the same
// function of the same numbers, so a forged photo is genuinely, visibly wrong.

import { makeRng } from '../core/rng.js';

export const FIRST_NAMES = [
  'Bram', 'Otta', 'Hollis', 'Sable', 'Cudge', 'Marla', 'Pell', 'Wren', 'Grist',
  'Tibbet', 'Cass', 'Dorrin', 'Mabel', 'Fen', 'Rook', 'Prue', 'Alder', 'Nim',
  'Bex', 'Corm', 'Hesper', 'Tolliver', 'Sile', 'Bracken', 'Odgar', 'Vell',
  'Merrit', 'Ansel', 'Perrin', 'Gull', 'Sorrel', 'Hux', 'Delve', 'Wenna',
];

export const LAST_NAMES = [
  'Gammon', 'Trotter', 'Bristle', 'Hocking', 'Marrowby', 'Sowerby', 'Rind',
  'Cracklin', 'Ashmore', 'Kettle', 'Bramblewick', 'Dunn', 'Pockett', 'Fenner',
  'Grissom', 'Larder', 'Swill', 'Thickett', 'Wattle', 'Hamm', 'Byre', 'Chine',
  'Sorrel', 'Muddock', 'Halloway', 'Prigg', 'Vasker', 'Oddleigh', 'Rasher',
];

export const DISTRICTS = [
  { name: 'ASHFALL', code: 'AF' },
  { name: 'MERROW', code: 'MW' },
  { name: 'KILN', code: 'KL' },
  { name: 'DUSTREACH', code: 'DR' },
  { name: 'GREY HOLLOW', code: 'GH' },
  { name: 'SALTVEIN', code: 'SV' },
  { name: 'TANNERY ROW', code: 'TR' },
  { name: 'LOW CINDER', code: 'LC' },
];

/** Districts that no longer exist — an instant forgery tell once taught. */
export const DEAD_DISTRICTS = [
  { name: 'VERGE', code: 'VG' },
  { name: 'OLD MERROW', code: 'OM' },
  { name: 'CANDLEWICK', code: 'CW' },
];

export const OCCUPATIONS = [
  'SCRAPPER', 'WATER-CARRIER', 'ASH SWEEPER', 'TANNER', 'SALVAGE CLERK',
  'RATCATCHER', 'WIRE-PULLER', 'MILL HAND', 'BONE SETTER', 'COURIER',
  'STILL-KEEPER', 'ROOFER', 'GRAVE DIGGER', 'SOAP BOILER', 'NIGHT WATCH',
];

export const EYE_COLOURS = ['AMBER', 'GREY', 'BLACK', 'PALE BLUE', 'GREEN', 'PINK'];
export const BUILDS = ['SLIGHT', 'LEAN', 'STOCKY', 'HEAVY', 'HULKING'];
export const MARKS = ['NONE', 'BROW SCAR', 'CHEEK SCAR', 'SNOUT SCAR', 'LEFT EAR NOTCHED', 'RIGHT EAR NOTCHED'];
export const BLOOD_TYPES = ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB+'];

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
export const START_DATE = { d: 12, m: 4, y: 47 };

export function addDays(date, n) {
  let { d, m, y } = date;
  d += n;
  while (d > MONTH_DAYS[m - 1]) {
    d -= MONTH_DAYS[m - 1];
    m++;
    if (m > 12) { m = 1; y++; }
  }
  while (d < 1) {
    m--;
    if (m < 1) { m = 12; y--; }
    d += MONTH_DAYS[m - 1];
  }
  return { d, m, y };
}

export const dateForDay = (dayIndex) => addDays(START_DATE, dayIndex - 1);
export const fmtDate = (dt) => `${String(dt.d).padStart(2, '0')}·${String(dt.m).padStart(2, '0')}·${String(dt.y).padStart(2, '0')}`;
export const dateValue = (dt) => dt.y * 372 + dt.m * 31 + dt.d;
export const dateBefore = (a, b) => dateValue(a) < dateValue(b);

// ---------------------------------------------------------------------------
// ID numbers
// ---------------------------------------------------------------------------

/**
 * Check letter rule, as printed on the daily bulletin:
 * add the four digits, count that many letters from A.
 * (1 -> A, 2 -> B ... 26 -> Z, then it wraps.)
 */
export function checkLetter(digits) {
  const sum = String(digits).split('').reduce((a, c) => a + (+c || 0), 0);
  const idx = (((sum - 1) % 26) + 26) % 26;
  return String.fromCharCode(65 + idx);
}

export function makeIdNumber(rng, districtCode) {
  let digits;
  do {
    digits = String(rng.int(1000, 9999));
  } while (digits.split('').reduce((a, c) => a + +c, 0) === 0);
  return `${districtCode}-${digits}-${checkLetter(digits)}`;
}

export function idIsValid(id) {
  const m = /^([A-Z]{2})-(\d{4})-([A-Z])$/.exec(id || '');
  if (!m) return false;
  return checkLetter(m[2]) === m[3];
}

export const idDigits = (id) => (/-(\d{4})-/.exec(id || '') || [])[1] || '';

// ---------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------

export function allUnits(floors = 4, perFloor = 4) {
  const units = [];
  for (let f = 1; f <= floors; f++) {
    for (let i = 0; i < perFloor; i++) {
      units.push(`${f}${String.fromCharCode(65 + i)}`);
    }
  }
  return units;
}

// ---------------------------------------------------------------------------
// Features — the shape of the animal
// ---------------------------------------------------------------------------

export function makeFeatures(rng) {
  const build = rng.pick(BUILDS);
  const buildIndex = BUILDS.indexOf(build);
  const scarRoll = rng();
  const notchRoll = rng();
  return {
    hide: rng.int(0, 6),
    hideShift: rng.range(-0.09, 0.09),
    headW: rng.range(0.88, 1.14),
    headH: rng.range(0.9, 1.12),
    jowl: rng.range(0, 1),
    snoutW: rng.range(0.8, 1.26),
    snoutLen: rng.range(0.78, 1.3),
    snoutTilt: rng.range(-0.1, 0.1),
    nostril: rng.range(0.8, 1.2),
    earSize: rng.range(0.82, 1.25),
    earDroop: rng.range(0, 1),
    earNotch: notchRoll < 0.12 ? 'left' : notchRoll < 0.24 ? 'right' : 'none',
    eyeSpacing: rng.range(0.85, 1.2),
    eyeSize: rng.range(0.82, 1.2),
    eyeColour: rng.pick(EYE_COLOURS),
    brow: rng.range(0, 1),
    tusk: rng() < 0.45 ? rng.range(0.25, 1) : 0,
    scar: scarRoll < 0.1 ? 'brow' : scarRoll < 0.18 ? 'cheek' : scarRoll < 0.24 ? 'snout' : 'none',
    build,
    neck: 0.85 + buildIndex * 0.08 + rng.range(-0.04, 0.04),
    bristle: rng.range(0, 1),
    heightCm: 148 + buildIndex * 7 + rng.int(-5, 5),
    weightKg: 68 + buildIndex * 16 + rng.int(-6, 6),
  };
}

/** The MARKS line on an ID card, derived from the features it depicts. */
export function marksFor(features) {
  if (features.scar === 'brow') return 'BROW SCAR';
  if (features.scar === 'cheek') return 'CHEEK SCAR';
  if (features.scar === 'snout') return 'SNOUT SCAR';
  if (features.earNotch === 'left') return 'LEFT EAR NOTCHED';
  if (features.earNotch === 'right') return 'RIGHT EAR NOTCHED';
  return 'NONE';
}

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

let idCounter = 0;

/**
 * @param {number|string} seed
 * @param {object} opts { day, district, unit, resident }
 */
export function makeIdentity(seed, opts = {}) {
  const rng = makeRng(seed);
  const day = opts.day || 1;
  const today = dateForDay(day);
  const district = opts.district || rng.pick(DISTRICTS);
  const features = opts.features || makeFeatures(rng);
  const first = opts.firstName || rng.pick(FIRST_NAMES);
  const last = opts.lastName || rng.pick(LAST_NAMES);
  const age = rng.int(19, 58);
  const born = { d: rng.int(1, 28), m: rng.int(1, 12), y: today.y - age };
  const issued = addDays(today, -rng.int(120, 2200));
  const expires = addDays(issued, rng.int(1400, 3200));

  return {
    key: `id${++idCounter}`,
    seed,
    firstName: first,
    lastName: last,
    fullName: `${first} ${last}`,
    district: district.name,
    districtCode: district.code,
    idNumber: makeIdNumber(rng, district.code),
    born,
    issued,
    expires,
    occupation: rng.pick(OCCUPATIONS),
    bloodType: rng.pick(BLOOD_TYPES),
    unit: opts.unit || null,
    sponsor: opts.sponsor || null,
    features,
    photoFeatures: features, // mimics overwrite this with a mutated copy
    eyesPrinted: features.eyeColour,
    buildPrinted: features.build,
    marksPrinted: marksFor(features),
    heightPrinted: features.heightCm,
    weightPrinted: features.weightKg,
  };
}

/** Deep-ish clone that keeps identities independent when we mutate paperwork. */
export function cloneIdentity(identity) {
  return {
    ...identity,
    born: { ...identity.born },
    issued: { ...identity.issued },
    expires: { ...identity.expires },
    features: { ...identity.features },
    photoFeatures: { ...identity.photoFeatures },
  };
}

// Document specs. These are pure data — `art/paper.js` turns them into paper and
// hands back the rectangle of every field, so a field id used here is the same id
// the interview and compare-mode highlighting refer to.

import { P } from '../art/palette.js';
import { fmtDate, dateForDay, marksFor, DISTRICTS } from './identity.js';
import { state, hasUpgrade } from '../core/state.js';
import {
  residentByUnit, visitorEntries, approvedDistricts, archiveEntries,
  watchNotes, tenureLabel,
} from './registry.js';

// ---------------------------------------------------------------------------
// Applicant paperwork
// ---------------------------------------------------------------------------

export function idCard(c) {
  const id = c.papers;
  return {
    id: `${c.id}-idcard`,
    version: c.version,
    type: 'ID_CARD',
    layout: 'card',
    title: 'CITIZEN IDENTITY CARD',
    subtitle: 'MINISTRY OF PERSONS · DISTRICT ISSUE',
    tint: P.paper,
    paperSeed: c.seed + 1,
    photo: { features: id.photoFeatures, seed: c.seed },
    fields: [
      { id: 'name', label: 'NAME', value: id.fullName },
      { id: 'idNumber', label: 'ID NO.', value: id.idNumber },
      { id: 'born', label: 'BORN', value: fmtDate(id.born) },
      { id: 'district', label: 'DISTRICT', value: id.district },
      { id: 'eyes', label: 'EYES', value: id.eyesPrinted },
      { id: 'build', label: 'BUILD', value: id.buildPrinted },
      { id: 'height', label: 'HEIGHT', value: `${id.heightPrinted} CM` },
      { id: 'marks', label: 'MARKS', value: id.marksPrinted },
      { id: 'issued', label: 'ISSUED', value: fmtDate(id.issued) },
      { id: 'expires', label: 'EXPIRES', value: fmtDate(id.expires) },
    ],
    footer: 'PRODUCE ON DEMAND · FALSIFICATION IS A CAPITAL MATTER',
  };
}

export function residencyPermit(c) {
  const id = c.papers;
  return {
    id: `${c.id}-permit`,
    version: c.version,
    type: 'RESIDENCY_PERMIT',
    layout: 'sheet',
    title: 'RESIDENCY PERMIT',
    subtitle: 'APPLICATION TO OCCUPY — THE COMPLEX',
    tint: P.paperOld,
    paperSeed: c.seed + 2,
    fields: [
      { id: 'name', label: 'APPLICANT', value: id.fullName },
      { id: 'idNumber', label: 'ID NO.', value: id.idNumber },
      { id: 'unit', label: 'UNIT SOUGHT', value: c.claim.unit },
      { id: 'district', label: 'FROM DISTRICT', value: id.district },
      { id: 'occupation', label: 'TRADE', value: id.occupation },
      { id: 'sponsor', label: 'SPONSOR', value: c.claim.sponsor || 'NONE' },
      { id: 'issued', label: 'FILED', value: fmtDate(c.claim.filed) },
    ],
    notes: [
      'The bearer petitions the owner of the Complex for lodging. The owner may',
      'refuse without cause. Admission is at the owner\'s risk and the owner\'s cost.',
    ],
    seal: c.claim.sealed === false ? null : { text: 'REG', sub: 'OF PERSONS' },
    signature: { seed: c.seed + 7, label: 'DISTRICT CLERK' },
    stamps: c.claim.stamp ? [{ text: c.claim.stamp, x: 430, y: 250, rot: -0.22, colour: P.inkRed }] : [],
  };
}

export function residentPass(c) {
  const id = c.papers;
  return {
    id: `${c.id}-pass`,
    version: c.version,
    type: 'RESIDENT_PASS',
    layout: 'sheet',
    title: 'RESIDENT PASS',
    subtitle: 'THE COMPLEX — RIGHT OF RE-ENTRY',
    tint: P.paperOld,
    paperSeed: c.seed + 3,
    fields: [
      { id: 'name', label: 'RESIDENT', value: id.fullName },
      { id: 'idNumber', label: 'ID NO.', value: id.idNumber },
      { id: 'unit', label: 'UNIT', value: c.claim.unit },
      { id: 'since', label: 'RESIDENT SINCE', value: c.claim.sinceLabel },
      { id: 'reason', label: 'ABSENCE', value: c.claim.absence },
    ],
    notes: [
      'Re-entry is granted only where the bearer matches the registry in name,',
      'number and face. Where any of the three fail, refuse the bearer.',
    ],
    seal: c.claim.sealed === false ? null : { text: 'CPX', sub: 'RE-ENTRY' },
    signature: { seed: c.seed + 9, label: 'HOUSE CLERK' },
  };
}

export function workChit(c) {
  const id = c.papers;
  return {
    id: `${c.id}-chit`,
    version: c.version,
    type: 'WORK_CHIT',
    layout: 'sheet',
    title: 'LABOUR CHIT',
    subtitle: 'PROOF OF MEANS',
    tint: '#c4b489',
    paperSeed: c.seed + 4,
    fields: [
      { id: 'name', label: 'BEARER', value: id.fullName },
      { id: 'employer', label: 'EMPLOYER', value: c.claim.employer },
      { id: 'occupation', label: 'TRADE', value: id.occupation },
      { id: 'wage', label: 'WAGE / WEEK', value: `${c.claim.wage} SCRIP` },
      { id: 'stamped', label: 'STAMPED', value: fmtDate(c.claim.chitDate) },
    ],
    notes: ['Means are not a right of entry. They are only evidence of one.'],
    stamps: [{ text: 'PAID', x: 420, y: 470, rot: 0.16, colour: P.inkBlue }],
    signature: { seed: c.seed + 12, label: 'WORKS FOREMAN' },
  };
}

export function transferSlip(c) {
  const id = c.papers;
  return {
    id: `${c.id}-transfer`,
    version: c.version,
    type: 'TRANSFER_SLIP',
    layout: 'sheet',
    title: 'DISTRICT TRANSFER',
    subtitle: 'MOVEMENT OF PERSONS BETWEEN WARDS',
    tint: '#c8b68c',
    paperSeed: c.seed + 5,
    fields: [
      { id: 'name', label: 'PERSON', value: id.fullName },
      { id: 'idNumber', label: 'ID NO.', value: id.idNumber },
      { id: 'district', label: 'FROM', value: id.district },
      { id: 'to', label: 'TO', value: 'THE COMPLEX' },
      { id: 'authorised', label: 'AUTHORISED BY', value: c.claim.authoriser },
      { id: 'transferDate', label: 'DATED', value: fmtDate(c.claim.transferDate) },
    ],
    notes: ['Movement without this slip is vagrancy. Vagrants are not housed.'],
    seal: { text: 'TRN', sub: 'WARD OFFICE' },
    stamps: [{ text: 'CLEARED', x: 300, y: 560, rot: -0.1, colour: P.inkRed }],
  };
}

export function medicalSlip(c) {
  const id = c.papers;
  return {
    id: `${c.id}-medical`,
    version: c.version,
    type: 'MEDICAL_SLIP',
    layout: 'sheet',
    title: 'HEALTH INSPECTION',
    subtitle: 'WARD SURGERY — FITNESS TO LODGE',
    tint: '#c9bfa2',
    paperSeed: c.seed + 6,
    fields: [
      { id: 'name', label: 'PATIENT', value: id.fullName },
      { id: 'idNumber', label: 'ID NO.', value: id.idNumber },
      { id: 'blood', label: 'BLOOD', value: id.bloodType },
      { id: 'eyes', label: 'EYES', value: id.eyesPrinted },
      { id: 'weight', label: 'WEIGHT', value: `${id.weightPrinted} KG` },
      { id: 'examined', label: 'LAST EXAM', value: fmtDate(c.claim.examDate) },
      { id: 'physician', label: 'PHYSICIAN', value: c.claim.physician },
    ],
    notes: c.claim.medicalNote ? [c.claim.medicalNote] : ['No findings. Reflexes ordinary. Pupils respond.'],
    signature: { seed: c.seed + 15, label: 'WARD SURGEON' },
  };
}

const BUILDERS = {
  ID_CARD: idCard,
  RESIDENCY_PERMIT: residencyPermit,
  RESIDENT_PASS: residentPass,
  WORK_CHIT: workChit,
  TRANSFER_SLIP: transferSlip,
  MEDICAL_SLIP: medicalSlip,
};

export function buildApplicantDocs(c) {
  return c.docTypes.map((t) => {
    const doc = BUILDERS[t](c);
    // Forged fields are applied here rather than in each builder, so a tell only
    // has to name the document and field it wants to corrupt.
    for (const f of doc.fields) {
      const override = c.fieldOverrides[`${doc.type}.${f.id}`];
      if (override !== undefined) f.value = override;
    }
    doc.cacheKey = `${doc.id}:${c.version}`;
    return doc;
  });
}

// ---------------------------------------------------------------------------
// The Complex's records — the stack on the left
// ---------------------------------------------------------------------------

export function bulletinDoc(day, rules) {
  const districts = approvedDistricts(day);
  const fields = [
    { id: 'date', label: 'DATE', value: fmtDate(dateForDay(day)) },
    { id: 'day', label: 'SHIFT', value: `DAY ${day}` },
  ];
  return {
    id: `bulletin-${day}`,
    version: day,
    type: 'BULLETIN',
    layout: 'sheet',
    title: 'OWNER\'S BULLETIN',
    subtitle: 'READ BEFORE THE DOOR OPENS',
    tint: '#cfc4a4',
    paperSeed: 500 + day,
    fields,
    notes: [
      ...rules,
      '',
      'CHECK LETTER: add the four digits of an ID number, then count that many',
      'letters from A. 1 is A, 2 is B, and so on, wrapping past Z.',
      '',
      districts.closed.length
        ? `SEALED WARDS — REFUSE NEW APPLICANTS OUT OF THEM ON SIGHT: ${districts.closed.join(', ')}.`
        : 'ALL WARDS ARE OPEN TODAY.',
      '',
      `WARDS THAT EXIST AT ALL: ${DISTRICTS.map((d) => d.name).join(', ')}.`,
      'ANY OTHER WARD NAMED ON A PAPER IS A FORGERY.',
    ],
    stamps: [{ text: `DAY ${day}`, x: 470, y: 690, rot: -0.14, colour: P.inkRed }],
  };
}

export function rosterDoc(day) {
  const rows = [{ cells: ['UNIT', 'RESIDENT', 'ID NO.', 'SINCE'], head: true }];
  for (const unit of state.units) {
    const r = residentByUnit(unit);
    rows.push({
      id: `roster-${unit}`,
      kind: 'roster',
      meta: { unit, key: r ? r.key : null },
      cells: r
        ? [unit, r.identity.fullName, r.identity.idNumber, tenureLabel(r, day)]
        : [unit, '— VACANT —', '', ''],
      colour: r ? P.ink : P.inkFaded,
    });
  }
  return {
    id: `roster-${day}`,
    version: `${day}:${state.residents.filter((r) => r.alive).length}`,
    type: 'ROSTER',
    layout: 'sheet',
    title: 'HOUSE ROSTER',
    subtitle: 'WHO SLEEPS HERE TONIGHT',
    tint: P.paper,
    paperSeed: 600,
    fields: [],
    table: rows,
  };
}

export function ledgerDoc(day) {
  const rows = [{ cells: ['UNIT', 'STATUS', 'BALANCE'], head: true }];
  for (const unit of state.units) {
    const r = residentByUnit(unit);
    if (!r) {
      rows.push({ id: `ledger-${unit}`, kind: 'ledger', meta: { unit }, cells: [unit, 'VACATED', '—'], colour: P.inkFaded });
    } else {
      rows.push({
        id: `ledger-${unit}`,
        kind: 'ledger',
        meta: { unit, key: r.key },
        cells: [unit, r.arrears ? 'IN ARREARS' : 'SETTLED', r.arrears ? `${r.arrears} SCRIP` : `${r.rent} / WK`],
        colour: r.arrears ? P.inkRed : P.ink,
      });
    }
  }
  return {
    id: `ledger-${day}`,
    version: `${day}:${state.residents.length}`,
    type: 'LEDGER',
    layout: 'sheet',
    title: 'RENT LEDGER',
    subtitle: 'WHAT IS OWED AND BY WHOM',
    tint: '#c7b791',
    paperSeed: 610,
    fields: [],
    table: rows,
  };
}

export function visitorLogDoc(day, extra = null) {
  const entries = visitorEntries(day);
  if (extra) entries.splice(Math.max(0, entries.length - 2), 0, extra);
  const rows = [{ cells: ['DATE', 'NAME', 'UNIT', 'NOTE'], head: true }];
  for (const e of entries) {
    rows.push({ id: `visit-${e.date}-${e.name}`, kind: 'visit', meta: e, cells: [e.date, e.name, e.unit || '—', e.note] });
  }
  if (entries.length === 0) rows.push({ cells: ['—', 'NO TRAFFIC RECORDED', '', ''], colour: P.inkFaded });
  return {
    id: `visitors-${day}`,
    version: `${day}:${entries.length}:${extra ? extra.name : ''}`,
    type: 'VISITOR_LOG',
    layout: 'sheet',
    title: 'DOOR LOG',
    subtitle: 'EVERY BODY THROUGH THE FRONT',
    tint: '#c5b78f',
    paperSeed: 620,
    fields: [],
    table: rows,
  };
}

/** The file for a specific resident, including the photograph on record. */
export function residentFileDoc(resident, day) {
  return {
    id: `file-${resident.key}`,
    version: `${day}:${resident.alive}`,
    type: 'RESIDENT_FILE',
    layout: 'card',
    title: 'RESIDENT FILE',
    subtitle: `UNIT ${resident.unit} — ON RECORD`,
    tint: P.paper,
    paperSeed: 700 + resident.unit.charCodeAt(0),
    photo: { features: resident.identity.features, seed: resident.identity.seed },
    fields: [
      { id: 'name', label: 'NAME', value: resident.identity.fullName },
      { id: 'idNumber', label: 'ID NO.', value: resident.identity.idNumber },
      { id: 'unit', label: 'UNIT', value: resident.unit },
      { id: 'district', label: 'ORIGIN', value: resident.identity.district },
      { id: 'eyes', label: 'EYES', value: resident.identity.features.eyeColour },
      { id: 'build', label: 'BUILD', value: resident.identity.features.build },
      { id: 'marks', label: 'MARKS', value: marksFor(resident.identity.features) },
      { id: 'since', label: 'SINCE', value: tenureLabel(resident, day) },
    ],
    footer: 'THE FACE ON THIS CARD IS THE FACE THAT LIVES HERE',
  };
}

export function archiveDoc(day) {
  const rows = [{ cells: ['NAME', 'UNIT', 'ID NO.', 'LEFT', 'WHY'], head: true }];
  for (const e of archiveEntries().slice(-12)) {
    rows.push({ id: `arch-${e.name}`, kind: 'archive', meta: e, cells: [e.name, e.unit, e.idNumber, e.left, e.reason] });
  }
  return {
    id: `archive-${day}`,
    version: `${day}:${(state.formerResidents || []).length}`,
    type: 'ARCHIVE',
    layout: 'sheet',
    title: 'CLOSED FILES',
    subtitle: 'THOSE WHO NO LONGER LIVE HERE',
    tint: '#bfae86',
    paperSeed: 640,
    fields: [],
    table: rows,
  };
}

/** Unlocked by WARD REGISTER: the codes that let you check an ID's prefix. */
export function wardRegisterDoc(day) {
  const rows = [{ cells: ['WARD', 'CODE', 'STANDING'], head: true }];
  const closed = approvedDistricts(day).closed;
  for (const d of DISTRICTS) {
    rows.push({
      id: `ward-${d.code}`,
      kind: 'ward',
      meta: d,
      cells: [d.name, d.code, closed.includes(d.name) ? 'SEALED' : 'OPEN'],
      colour: closed.includes(d.name) ? P.inkRed : P.ink,
    });
  }
  return {
    id: `wards-${day}`,
    version: day,
    type: 'WARD_REGISTER',
    layout: 'sheet',
    title: 'WARD REGISTER',
    subtitle: 'EVERY WARD AND THE LETTERS IT STAMPS',
    tint: '#c6b78e',
    paperSeed: 660,
    fields: [],
    table: rows,
    notes: [
      'An identity number opens with the two letters of the ward that issued it.',
      'Where the letters and the ward do not agree, the number was invented.',
    ],
  };
}

export function watchDoc(day) {
  return {
    id: `watch-${day}`,
    version: day,
    type: 'WATCH',
    layout: 'sheet',
    title: 'WARD WATCH NOTICE',
    subtitle: 'ON THE HABITS OF MIMICS',
    tint: '#c2b189',
    paperSeed: 650,
    fields: [],
    notes: watchNotes(day),
    stamps: [{ text: 'CONFIDENTIAL', x: 310, y: 640, rot: -0.12, colour: P.inkRed }],
  };
}

/**
 * The stack the player can leaf through on the left of the desk.
 * The resident file only appears when the applicant names an occupied unit —
 * which for a genuine new tenant never happens.
 */
export function buildRegistryDocs(day, activeCase, rules) {
  const docs = [
    bulletinDoc(day, rules),
    rosterDoc(day),
    ledgerDoc(day),
    visitorLogDoc(day, activeCase ? activeCase.plantedVisit : null),
  ];
  if (activeCase) {
    const claimed = residentByUnit(activeCase.claim.unit);
    if (claimed) docs.push(residentFileDoc(claimed, day));
  }
  if (hasUpgrade('records_archive')) docs.push(archiveDoc(day));
  if (hasUpgrade('records_watch')) docs.push(watchDoc(day));
  if (hasUpgrade('records_cross')) docs.push(wardRegisterDoc(day));
  for (const d of docs) d.cacheKey = `${d.id}:${d.version}`;
  return docs;
}

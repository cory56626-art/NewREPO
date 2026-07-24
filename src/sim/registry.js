// The Complex's own paperwork — the stack on the player's left. Everything an
// applicant claims can be checked against this, which is where most mimics come
// apart.

import { makeRng } from '../core/rng.js';
import { state, hasUpgrade } from '../core/state.js';
import {
  makeIdentity, allUnits, dateForDay, fmtDate, addDays, DISTRICTS,
} from './identity.js';

export function initComplex(seed) {
  const rng = makeRng(seed);
  const units = allUnits(4, 4);
  const residents = [];
  // The building starts about half full; empty units are what you rent out.
  const startingOccupied = rng.sample(units, 7);
  startingOccupied.forEach((unit, i) => {
    const identity = makeIdentity(rng.seed(), { day: 1, unit });
    residents.push({
      key: `res${i + 1}`,
      identity,
      unit,
      sinceDay: -rng.int(30, 900),
      alive: true,
      isMimic: false,
      rent: 18 + rng.int(0, 10),
      arrears: rng.chance(0.25) ? rng.int(10, 90) : 0,
      note: null,
    });
  });
  return { units, residents };
}

export const residentByUnit = (unit) => state.residents.find((r) => r.alive && r.unit === unit) || null;
export const residentByName = (name) => state.residents.find((r) => r.alive && r.identity.fullName === name) || null;
export const residentByKey = (key) => state.residents.find((r) => r.key === key) || null;
export const vacantUnits = () => state.units.filter((u) => !residentByUnit(u));
export const occupiedUnits = () => state.units.filter((u) => !!residentByUnit(u));

/** Neighbours on the same floor — used by the harder interview questions. */
export function neighboursOf(unit) {
  const floor = unit[0];
  return state.residents.filter((r) => r.alive && r.unit !== unit && r.unit[0] === floor);
}

export function tenureLabel(resident, day) {
  const days = day - resident.sinceDay;
  if (days > 365) return `${Math.floor(days / 365)} YEARS`;
  if (days > 60) return `${Math.floor(days / 30)} MONTHS`;
  return `${Math.max(1, days)} DAYS`;
}

// ---------------------------------------------------------------------------
// Visitor log
// ---------------------------------------------------------------------------

/** Deterministic recent traffic through the front door, plus real admissions. */
export function visitorEntries(day) {
  const rng = makeRng(9000 + day);
  const rows = [];
  const history = (state.visitorLog || []).slice(-9);
  for (const h of history) rows.push(h);
  const fillers = 6 - Math.min(6, rows.length);
  for (let i = 0; i < fillers; i++) {
    const r = rng.pick(state.residents.filter((x) => x.alive));
    if (!r) break;
    rows.push({
      date: fmtDate(dateForDay(Math.max(1, day - rng.int(1, 9)))),
      name: r.identity.fullName,
      unit: r.unit,
      note: rng.pick(['RETURNED', 'RETURNED', 'ESCORTED', 'LATE']),
    });
  }
  return rows.slice(-10);
}

export function logVisit(day, name, unit, note = 'ADMITTED') {
  if (!state.visitorLog) state.visitorLog = [];
  state.visitorLog.push({ date: fmtDate(dateForDay(day)), name, unit, note });
  if (state.visitorLog.length > 40) state.visitorLog.shift();
}

// ---------------------------------------------------------------------------
// Districts approved today
// ---------------------------------------------------------------------------

export function approvedDistricts(day) {
  const rng = makeRng(4400 + day);
  const closed = day >= 4 ? rng.sample(DISTRICTS, day >= 8 ? 2 : 1).map((d) => d.name) : [];
  return {
    open: DISTRICTS.filter((d) => !closed.includes(d.name)).map((d) => d.name),
    closed,
  };
}

// ---------------------------------------------------------------------------
// Archive — unlocked by the records upgrades
// ---------------------------------------------------------------------------

export function archiveEntries() {
  const rng = makeRng(7311);
  const rows = state.formerResidents || [];
  if (rows.length) return rows;
  // Seed a little history so the archive isn't empty on the day it's bought.
  const seeded = [];
  for (let i = 0; i < 5; i++) {
    const id = makeIdentity(rng.seed(), { day: 1 });
    seeded.push({
      name: id.fullName,
      unit: rng.pick(allUnits(4, 4)),
      idNumber: id.idNumber,
      left: fmtDate(addDays(dateForDay(1), -rng.int(60, 900))),
      reason: rng.pick(['MOVED OUT', 'ARREARS', 'DECEASED', 'VANISHED', 'EVICTED']),
    });
  }
  state.formerResidents = seeded;
  return seeded;
}

export function recordFormerResident(resident, reason, day) {
  if (!state.formerResidents) archiveEntries();
  state.formerResidents.push({
    name: resident.identity.fullName,
    unit: resident.unit,
    idNumber: resident.identity.idNumber,
    left: fmtDate(dateForDay(day)),
    reason,
  });
}

/** Traits the watch bulletin knows about mimics, widened by upgrades. */
export function watchNotes(day) {
  const notes = [
    'MIMICS COPY A FACE BUT NOT A HISTORY. CHECK THE REGISTRY.',
    'A MIMIC WILL NOT ASK WHY IT IS BEING QUESTIONED.',
  ];
  if (day >= 3) notes.push('PHOTOGRAPHS CANNOT BE MIMICKED. COMPARE THE FACE.');
  if (day >= 5) notes.push('THEY FAVOUR EMPTY UNITS AND RECENT DEATHS.');
  if (hasUpgrade('records_watch')) {
    notes.push('CONFIRMED: EYES DO NOT WET. TEETH EXCEED THIRTY-SIX.');
    notes.push('CONFIRMED: THEY ANSWER BEFORE THE QUESTION ENDS.');
  }
  return notes;
}

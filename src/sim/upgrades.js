// Four branches of upgrade, each wired to an actual mechanic rather than a
// number on a screen. Records upgrades in particular add whole document types —
// and with them whole new classes of contradiction to catch.

import { state, hasUpgrade } from '../core/state.js';

export const BRANCHES = [
  { id: 'desk', name: 'DESK TOOLS', blurb: 'What you screen with.' },
  { id: 'security', name: 'COMPLEX SECURITY', blurb: 'What keeps them out at night.' },
  { id: 'living', name: 'LIVING QUALITY', blurb: 'What makes this worth owning.' },
  { id: 'records', name: 'RECORDS ACCESS', blurb: 'What you can check against.' },
];

export const UPGRADES = [
  // --- desk -------------------------------------------------------------
  { id: 'desk_lamp', branch: 'desk', name: 'BRIGHTER BULB', cost: 90, desc: 'The lamp reaches their face. Behaviour tells become far more reliable.' },
  { id: 'desk_questions', branch: 'desk', name: 'PATIENCE', cost: 120, desc: 'One more question per applicant.' },
  { id: 'desk_loupe', branch: 'desk', name: 'CLERK\'S LOUPE', cost: 170, requires: 'desk_lamp', desc: 'In compare mode, ink that fails an arithmetic check is ringed for you.' },
  { id: 'desk_uv', branch: 'desk', name: 'UV LAMP', cost: 210, requires: 'desk_loupe', desc: 'Seals fluoresce. A missing or forged seal is called out on the document.' },
  { id: 'desk_questions2', branch: 'desk', name: 'INTERVIEW STOOL', cost: 260, requires: 'desk_questions', desc: 'Two more questions per applicant. They sit until you are done.' },
  { id: 'desk_stamp', branch: 'desk', name: 'STAMP SET', cost: 100, desc: 'Process faster. +3 scrip for every applicant you see.' },

  // --- security ---------------------------------------------------------
  { id: 'sec_locks', branch: 'security', name: 'NEW LOCKS', cost: 130, desc: 'Doors that hold. Murder chance down by a fifth.' },
  { id: 'sec_bars', branch: 'security', name: 'WINDOW BARS', cost: 180, desc: 'No more climbing in from the yard. Murder chance down by a fifth.' },
  { id: 'sec_cameras', branch: 'security', name: 'HALL CAMERAS', cost: 250, desc: 'One extra clue at every murder scene.' },
  { id: 'sec_watch', branch: 'security', name: 'NIGHT WATCHPIG', cost: 320, requires: 'sec_locks', desc: 'Someone awake at night. Murder chance down by a quarter.' },
  { id: 'sec_alarm', branch: 'security', name: 'ALARM WIRE', cost: 420, requires: 'sec_bars', desc: 'A murder in progress can be interrupted outright.' },

  // --- living -----------------------------------------------------------
  { id: 'liv_repairs', branch: 'living', name: 'REPAIRS', cost: 110, desc: '+2 rent from every resident, every day.' },
  { id: 'liv_water', branch: 'living', name: 'WATER RATION', cost: 190, requires: 'liv_repairs', desc: '+3 rent, and word gets round. More applicants.' },
  { id: 'liv_heat', branch: 'living', name: 'BOILER REPAIR', cost: 270, requires: 'liv_water', desc: '+4 rent. Warm residents talk to you at night — one extra clue.' },
  { id: 'liv_floor', branch: 'living', name: 'OPEN FIFTH FLOOR', cost: 340, desc: 'Four more units to let. More rent, more risk.' },

  // --- records ----------------------------------------------------------
  { id: 'records_archive', branch: 'records', name: 'CLOSED FILES', cost: 150, desc: 'Adds the archive of former residents to your stack.' },
  { id: 'records_watch', branch: 'records', name: 'WARD WATCH NOTICE', cost: 210, desc: 'Adds the watch notice. Confirmed mimic habits, and sharper cues.' },
  { id: 'records_cross', branch: 'records', name: 'WARD REGISTER', cost: 290, requires: 'records_archive', desc: 'Every ward and its two-letter code. Forgers get the prefix wrong.' },
];

export const upgradeById = (id) => UPGRADES.find((u) => u.id === id);

export function isAvailable(u) {
  if (hasUpgrade(u.id)) return false;
  if (u.requires && !hasUpgrade(u.requires)) return false;
  return true;
}

export function purchase(id) {
  const u = upgradeById(id);
  if (!u || hasUpgrade(id) || state.money < u.cost || !isAvailable(u)) return false;
  state.money -= u.cost;
  state.upgrades[id] = true;
  if (id === 'liv_floor') {
    for (const letter of ['A', 'B', 'C', 'D']) {
      const unit = `5${letter}`;
      if (!state.units.includes(unit)) state.units.push(unit);
    }
  }
  return true;
}

// --- derived effects ------------------------------------------------------

export function rentPerResident() {
  let r = 14;
  if (hasUpgrade('liv_repairs')) r += 2;
  if (hasUpgrade('liv_water')) r += 3;
  if (hasUpgrade('liv_heat')) r += 4;
  return r;
}

export function payPerApplicant() {
  return 11 + (hasUpgrade('desk_stamp') ? 3 : 0);
}

/** Multiplier on the nightly murder roll. */
export function securityFactor() {
  let f = 1;
  if (hasUpgrade('sec_locks')) f *= 0.8;
  if (hasUpgrade('sec_bars')) f *= 0.8;
  if (hasUpgrade('sec_watch')) f *= 0.75;
  return f;
}

export function extraClues() {
  return (hasUpgrade('sec_cameras') ? 1 : 0) + (hasUpgrade('liv_heat') ? 1 : 0);
}

export function applicantBonus() {
  return hasUpgrade('liv_water') ? 1 : 0;
}

export const canInterruptMurder = () => hasUpgrade('sec_alarm');
export const autoFlagsInk = () => hasUpgrade('desk_loupe');
export const autoFlagsSeals = () => hasUpgrade('desk_uv');

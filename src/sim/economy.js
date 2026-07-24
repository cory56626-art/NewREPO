// Money, standing, and what a mistake actually costs. Nothing here ends a run:
// a bad call is expensive and it raises the odds of something worse tonight.

import { state } from '../core/state.js';
import { payPerApplicant, rentPerResident } from './upgrades.js';
import { logVisit, recordFormerResident } from './registry.js';
import { dateForDay } from './identity.js';

export const REP_MAX = 100;

export function adjustReputation(delta) {
  state.reputation = Math.max(0, Math.min(REP_MAX, state.reputation + delta));
}

export function reputationLabel() {
  const r = state.reputation;
  if (r >= 85) return 'THE HONEST DESK';
  if (r >= 65) return 'WELL SPOKEN OF';
  if (r >= 45) return 'KNOWN';
  if (r >= 25) return 'DOUBTED';
  if (r >= 10) return 'AVOIDED';
  return 'A BAD ADDRESS';
}

/**
 * Record a verdict. Returns what the player is told immediately — which is
 * deliberately not the whole truth: admitting a mimic looks like a good day.
 */
export function resolveVerdict(c, admitted, day) {
  const correct = admitted ? !c.isMimic : c.isMimic;
  const out = { admitted, correct, rep: 0, money: 0, lines: [] };

  state.stats.processed++;
  if (admitted) {
    state.stats.admitted++;
    const resident = {
      key: `res-${c.seed}`,
      identity: c.identity,
      unit: c.claim.unit,
      sinceDay: day,
      alive: true,
      isMimic: c.isMimic,
      rent: rentPerResident(),
      arrears: 0,
      note: null,
      admittedDay: day,
    };
    if (c.kind === 'RESIDENT' && c.impersonating) {
      // A returning resident doesn't take a second bed — but if this was a
      // mimic, the thing in that unit is no longer the resident you knew.
      const existing = state.residents.find((r) => r.key === c.impersonating.key);
      if (existing) {
        existing.isMimic = existing.isMimic || c.isMimic;
        if (c.isMimic) existing.identity = c.identity;
      }
    } else {
      state.residents.push(resident);
    }
    logVisit(day, c.identity.fullName, c.claim.unit, 'ADMITTED');
    if (c.isMimic) {
      state.stats.mimicsAdmitted++;
      out.lines.push('They thank you on the way past.');
    } else {
      out.rep = 1;
      out.lines.push(`Unit ${c.claim.unit} is let.`);
    }
  } else {
    state.stats.denied++;
    logVisit(day, c.identity.fullName, c.claim.unit, 'REFUSED');
    if (c.isMimic) {
      state.stats.mimicsCaught++;
      out.rep = 3;
      out.money = 0;
      out.lines.push('It does not argue. That is the worst part.');
    } else {
      state.stats.wrongDenials++;
      out.rep = -5;
      out.money = -Math.round(rentPerResident() * 0.5);
      out.lines.push('You have turned away someone who had every right.');
    }
  }

  adjustReputation(out.rep);
  state.money = Math.max(0, state.money + out.money);
  return out;
}

export function shiftEarnings(processedCount) {
  const wages = payPerApplicant() * processedCount;
  const residents = state.residents.filter((r) => r.alive).length;
  const rent = rentPerResident() * residents;
  return { wages, rent, residents, total: wages + rent };
}

export function cleanNightBonus(day) {
  return 40 + day * 8;
}

/** Applied when the night passes without a murder. */
export function payCleanNight(day) {
  const bonus = cleanNightBonus(day);
  state.money += bonus;
  adjustReputation(4);
  return bonus;
}

/** A resident is gone — killed, or wrongly accused and thrown out. */
export function removeResident(key, reason, day) {
  const r = state.residents.find((x) => x.key === key);
  if (!r) return null;
  r.alive = false;
  recordFormerResident(r, reason, day);
  return r;
}

export function murderCost(day) {
  return { rep: -12, money: -Math.round(20 + day * 4) };
}

export function applyMurderCost(day) {
  const cost = murderCost(day);
  adjustReputation(cost.rep);
  state.money = Math.max(0, state.money + cost.money);
  state.stats.murders++;
  return cost;
}

export function applySolvedBonus(day) {
  const bonus = 60 + day * 10;
  state.money += bonus;
  adjustReputation(8);
  state.stats.murdersSolved++;
  return bonus;
}

/** Wrong accusation: the innocent is gone for good and the mimic stays inside. */
export function applyWrongAccusation(day) {
  adjustReputation(-14);
  state.stats.innocentsLost++;
  return { rep: -14 };
}

export const todayDate = (day) => dateForDay(day);

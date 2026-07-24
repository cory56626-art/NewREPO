// Invariant tests for the generators. These are the tests that make the game
// fair: they run thousands of shifts and assert that every mimic could have been
// caught with what the player had been taught by that day, and that no honest
// applicant ever carries a real contradiction.
//
//   node test/sim.test.js
//
// The sim layer deliberately has no DOM dependencies so this runs in plain node.

import { makeRng } from '../src/core/rng.js';
import { state, assign } from '../src/core/state.js';
import { initComplex, vacantUnits, approvedDistricts } from '../src/sim/registry.js';
import { makeCase, isSolvable, isClean, hardDiscrepancies, TELLS } from '../src/sim/mimic.js';
import { planQueue, caseFromPlan, dayConfig, LAST_AUTHORED_DAY } from '../src/sim/day.js';
import { buildApplicantDocs, buildRegistryDocs } from '../src/sim/documents.js';
import { topicsFor, ask, isAskable, questionBudget, greeting, farewell } from '../src/sim/dialogue.js';
import { resolveVerdict, shiftEarnings } from '../src/sim/economy.js';
import { buildScene, sceneSuspects, matchesEvidence, NIGHT_TRAITS } from '../src/sim/night.js';
import { idIsValid, marksFor, dateValue } from '../src/sim/identity.js';
import { rentPerResident } from '../src/sim/upgrades.js';

let checks = 0;
let failures = [];

function ok(cond, msg, detail) {
  checks++;
  if (!cond) failures.push(detail ? `${msg}\n      ${detail}` : msg);
}

function group(name, fn) {
  const before = failures.length;
  const t0 = Date.now();
  fn();
  const failed = failures.length - before;
  const mark = failed === 0 ? '  ok  ' : ' FAIL ';
  console.log(`[${mark}] ${name}  (${Date.now() - t0}ms)`);
}

function freshRun(seed) {
  const complex = initComplex(seed);
  assign({
    seed,
    day: 1,
    money: 240,
    reputation: 50,
    units: complex.units,
    residents: complex.residents,
    upgrades: {},
    visitorLog: [],
    formerResidents: null,
    stats: {
      processed: 0, admitted: 0, denied: 0, mimicsCaught: 0, mimicsAdmitted: 0,
      wrongDenials: 0, murders: 0, murdersSolved: 0, innocentsLost: 0, daysSurvived: 0,
    },
    endless: false,
  });
}

const tellById = (id) => TELLS.find((t) => t.id === id);

// ---------------------------------------------------------------------------

group('every mimic is solvable, every honest applicant is clean', () => {
  let mimics = 0;
  let honest = 0;
  for (let run = 0; run < 60; run++) {
    freshRun(1000 + run);
    for (let day = 1; day <= 14; day++) {
      state.day = day;
      const plan = planQueue(day, state.seed);
      for (const entry of plan) {
        const c = caseFromPlan(entry);

        if (c.isMimic) {
          mimics++;
          ok(isSolvable(c), 'mimic with no detectable evidence',
            `day ${day} seed ${c.seed} kind ${c.kind} discrepancies ${c.discrepancies.length}`);
          ok(hardDiscrepancies(c).length >= 1 || c.lies.length >= 3,
            'mimic solvable only by guessing',
            `day ${day} seed ${c.seed}`);
          for (const d of c.discrepancies) {
            const tell = tellById(d.id);
            if (tell) {
              ok(tell.minDay <= day, `tell ${d.id} used before it is taught`,
                `taught day ${tell.minDay}, used day ${day}`);
            }
            ok(typeof d.note === 'string' && d.note.length > 8,
              `discrepancy ${d.id} has no usable note`);
          }
        } else {
          honest++;
          ok(isClean(c), 'honest applicant carries a real contradiction',
            `day ${day} seed ${c.seed} kind ${c.kind}`);
          // Their paperwork must survive every check the bulletin describes.
          ok(idIsValid(c.papers.idNumber), 'honest applicant has a failing check letter',
            `${c.papers.idNumber} day ${day}`);
          ok(c.papers.idNumber.startsWith(`${c.papers.districtCode}-`),
            'honest applicant ID prefix does not match their ward',
            `${c.papers.idNumber} vs ${c.papers.district}`);
          ok(dateValue(c.papers.issued) <= dateValue(c.papers.expires),
            'honest applicant issued after expiry');
          ok(dateValue(c.papers.born) <= dateValue(c.papers.issued),
            'honest applicant born after their card was printed');
          ok(c.papers.eyesPrinted === c.identity.features.eyeColour,
            'honest applicant eye colour misprinted');
          ok(c.papers.buildPrinted === c.identity.features.build,
            'honest applicant build misprinted');
          ok(c.papers.marksPrinted === marksFor(c.identity.features),
            'honest applicant marks misprinted');
          ok(JSON.stringify(c.papers.photoFeatures) === JSON.stringify(c.identity.features),
            'honest applicant photograph does not match them');
          // The sealed-ward rule only binds new arrivals; a resident coming
          // home is explicitly exempt on the bulletin.
          const closed = approvedDistricts(day).closed;
          if (c.kind !== 'RESIDENT') {
            ok(!closed.includes(c.papers.district),
              'honest new applicant comes from a sealed ward', `${c.papers.district} on day ${day}`);
          }
          ok(c.claim.sealed !== false, 'honest applicant permit is missing its seal');
        }

        // Whoever they are, the paperwork has to be printable.
        const docs = buildApplicantDocs(c);
        ok(docs.length >= 2, 'applicant arrived with fewer than two documents');
        for (const doc of docs) {
          for (const f of doc.fields) {
            ok(f.value !== undefined && f.value !== null && String(f.value).length > 0,
              `document field ${doc.type}.${f.id} is empty`);
          }
        }
      }
    }
  }
  console.log(`         ${mimics} mimics, ${honest} honest applicants examined`);
});

group('the mimic count for a day is exactly what the campaign asks for', () => {
  for (let run = 0; run < 40; run++) {
    freshRun(7000 + run);
    for (let day = 1; day <= LAST_AUTHORED_DAY; day++) {
      state.day = day;
      const cfg = dayConfig(day);
      const plan = planQueue(day, state.seed);
      const mimics = plan.filter((p) => p.isMimic).length;
      ok(mimics === cfg.mimics || mimics === 0,
        `day ${day} queued ${mimics} mimics, expected ${cfg.mimics} or a clean shift`);
      ok(plan.length >= 3, `day ${day} queued only ${plan.length} applicants`);
    }
  }
});

group('records upgrades add documents, and the tells they unlock', () => {
  freshRun(881);
  state.day = 8;
  const base = buildRegistryDocs(8, caseFromPlan({ day: 8, seed: 5, isMimic: false }), dayConfig(8).rules);
  ok(!base.some((d) => d.type === 'WARD_REGISTER'), 'ward register present before it is bought');
  ok(!base.some((d) => d.type === 'ARCHIVE'), 'archive present before it is bought');

  state.upgrades.records_archive = true;
  state.upgrades.records_watch = true;
  state.upgrades.records_cross = true;
  const upgraded = buildRegistryDocs(8, caseFromPlan({ day: 8, seed: 5, isMimic: false }), dayConfig(8).rules);
  for (const type of ['ARCHIVE', 'WATCH', 'WARD_REGISTER']) {
    ok(upgraded.some((d) => d.type === type), `${type} missing after its upgrade was bought`);
  }
  ok(upgraded.length > base.length, 'buying records upgrades added no documents');

  // The prefix forgery only becomes available with the register in hand.
  let seenPrefix = false;
  for (let i = 0; i < 400 && !seenPrefix; i++) {
    const c = caseFromPlan({ day: 8, seed: 90000 + i, isMimic: true });
    if (c.discrepancies.some((d) => d.id === 'PREFIX_MISMATCH')) seenPrefix = true;
  }
  ok(seenPrefix, 'the ward register never unlocked a prefix forgery');

  state.upgrades = {};
  for (let i = 0; i < 400; i++) {
    const c = caseFromPlan({ day: 8, seed: 90000 + i, isMimic: true });
    ok(!c.discrepancies.some((d) => d.id === 'PREFIX_MISMATCH'),
      'a prefix forgery was used without the ward register to check it against');
  }
});

group('the registry stack always builds and always includes the bulletin', () => {
  for (let run = 0; run < 25; run++) {
    freshRun(3300 + run);
    for (let day = 1; day <= 12; day++) {
      state.day = day;
      const c = caseFromPlan({ day, seed: day * 977 + run, isMimic: day % 2 === 0 });
      const docs = buildRegistryDocs(day, c, dayConfig(day).rules);
      ok(docs.some((d) => d.type === 'BULLETIN'), 'no bulletin in the records stack');
      ok(docs.some((d) => d.type === 'ROSTER'), 'no roster in the records stack');
      // A resident file appears exactly when the claimed unit is occupied.
      const occupied = !vacantUnits().includes(c.claim.unit);
      ok(docs.some((d) => d.type === 'RESIDENT_FILE') === occupied,
        'resident file presence does not follow the claimed unit',
        `unit ${c.claim.unit} occupied=${occupied}`);
    }
  }
});

group('every askable field yields an answer, and mimics only lie where planted', () => {
  for (let run = 0; run < 30; run++) {
    freshRun(5100 + run);
    for (const day of [1, 4, 7, 9, 12]) {
      state.day = day;
      for (const isMimic of [true, false]) {
        const c = caseFromPlan({ day, seed: day * 31 + run * 7 + (isMimic ? 1 : 0), isMimic });
        const docs = buildApplicantDocs(c);
        const topics = topicsFor(docs);
        ok(topics.length >= 3, 'too few things to ask about', `day ${day} got ${topics.length}`);
        for (const t of topics) {
          ok(isAskable(t.id), `topic ${t.id} is not askable`);
          const a = ask(c, t.id);
          ok(typeof a.answer === 'string' && a.answer.length > 0, `no answer for ${t.id}`);
          ok(typeof a.cue === 'string' && a.cue.length > 0, `no behaviour cue for ${t.id}`);
          ok(a.lying === (c.isMimic && c.lies.includes(t.id)),
            `answer for ${t.id} lies when it should not`);
          if (!c.isMimic) ok(a.lying === false, 'an honest applicant lied');
        }
        ok(typeof greeting(c) === 'string' && greeting(c).length > 0, 'no greeting');
        ok(typeof farewell(c, true) === 'string', 'no farewell');
      }
      ok(questionBudget() >= 2, 'question budget below two');
    }
  }
});

group('night scenes single out exactly one suspect, and it is the culprit', () => {
  let scenes = 0;
  for (let run = 0; run < 120; run++) {
    freshRun(9100 + run);
    // Plant a few mimics and let the night build a scene around them.
    const rng = makeRng(run + 1);
    const living = state.residents.filter((r) => r.alive);
    for (const r of rng.sample(living, 1 + (run % 3))) r.isMimic = true;

    const scene = buildScene(3 + (run % 9), state.seed + run);
    if (!scene) continue;
    scenes++;

    const suspects = sceneSuspects(scene);
    ok(suspects.length >= 2, 'line-up has fewer than two suspects');
    ok(suspects.some((s) => s.key === scene.culpritKey), 'the culprit is not in the line-up');

    const eliminating = scene.rooms.flatMap((r) => r.clues).filter((c) => c.eliminating);
    ok(eliminating.length >= 1, 'no eliminating evidence was placed');

    const fits = suspects.filter((s) => matchesEvidence(s, eliminating));
    ok(fits.length === 1, 'evidence does not narrow to a single suspect',
      `${fits.length} suspects fit, run ${run}`);
    ok(fits[0] && fits[0].key === scene.culpritKey,
      'the evidence points at the wrong resident');

    // Every eliminating clue must be a true statement about the culprit.
    const culprit = suspects.find((s) => s.key === scene.culpritKey);
    for (const clue of eliminating) {
      const trait = NIGHT_TRAITS.find((t) => t.id === clue.trait);
      ok(trait && trait.of(culprit) === clue.value,
        `clue ${clue.trait} does not describe the culprit`);
    }

    // Clues have to be reachable: every one lands inside the playfield.
    for (const room of scene.rooms) {
      for (const clue of room.clues) {
        ok(clue.x > 60 && clue.x < 1540, `clue off screen horizontally (${clue.x})`);
        ok(clue.y > 120 && clue.y < 780, `clue off screen vertically (${clue.y})`);
      }
    }
    const emptyRooms = scene.rooms.filter((r) => r.clues.length === 0).length;
    ok(emptyRooms <= 1, `${emptyRooms} rooms had nothing in them at all`);
  }
  console.log(`         ${scenes} crime scenes examined`);
});

group('verdicts keep the books in a sane state', () => {
  for (let run = 0; run < 30; run++) {
    freshRun(2200 + run);
    for (let day = 1; day <= 6; day++) {
      state.day = day;
      for (const entry of planQueue(day, state.seed)) {
        const c = caseFromPlan(entry);
        const admit = (c.seed % 3) !== 0;
        const out = resolveVerdict(c, admit, day);
        ok(Number.isFinite(state.money), 'money became not a number');
        ok(state.money >= 0, 'money went negative');
        ok(state.reputation >= 0 && state.reputation <= 100, 'reputation left its range');
        ok(out.correct === (admit ? !c.isMimic : c.isMimic), 'verdict scored incorrectly');
      }
      const earn = shiftEarnings(4);
      ok(earn.total === earn.wages + earn.rent, 'shift earnings do not add up');
      ok(rentPerResident() > 0, 'rent per resident is not positive');
    }
    // Nobody is ever housed twice.
    const units = state.residents.filter((r) => r.alive).map((r) => r.unit);
    ok(new Set(units).size === units.length, 'two residents share one unit');
  }
});

group('the check letter rule is self-consistent', () => {
  const rng = makeRng(4242);
  for (let i = 0; i < 4000; i++) {
    const digits = String(rng.int(1000, 9999));
    const sum = digits.split('').reduce((a, ch) => a + +ch, 0);
    const expected = String.fromCharCode(65 + (((sum - 1) % 26) + 26) % 26);
    ok(idIsValid(`AF-${digits}-${expected}`), `valid id rejected: AF-${digits}-${expected}`);
    const wrong = String.fromCharCode(65 + ((expected.charCodeAt(0) - 65 + 1) % 26));
    ok(!idIsValid(`AF-${digits}-${wrong}`), `invalid id accepted: AF-${digits}-${wrong}`);
  }
});

// ---------------------------------------------------------------------------

console.log('');
if (failures.length === 0) {
  console.log(`All good — ${checks.toLocaleString()} assertions passed.`);
  process.exit(0);
} else {
  const shown = failures.slice(0, 25);
  console.log(`${failures.length} of ${checks.toLocaleString()} assertions FAILED:\n`);
  for (const f of shown) console.log(`  · ${f}`);
  if (failures.length > shown.length) console.log(`  … and ${failures.length - shown.length} more`);
  process.exit(1);
}

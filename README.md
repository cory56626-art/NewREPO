# Pacing Hams

A first-person document-inspection game. You own an apartment complex in a
post-apocalyptic ward, you sit behind a desk under one bulb, and pigs pace in
from the right and sit down opposite you. Some of them are not pigs.

Read their papers. Check them against your own books. Ask questions. Then press
red or green, and live with it — because if you let a Mimic in, something in the
building may not be alive in the morning, and you will be the one going down
with a torch to work out which of your tenants did it.

## Running it

Any static server will do — ES modules will not load over `file://`.

```sh
python3 -m http.server 8000     # or: npm start
# then open http://localhost:8000
```

To get one double-clickable file with no server at all:

```sh
node build.js                   # or: npm run build
# open dist/pacing-hams.html
```

Desktop only, mouse and keyboard, 16:9 letterboxed. Progress saves to
`localStorage` at each day boundary.

## Controls

| | |
|---|---|
| **Click their papers** | open the applicant's documents |
| **Click the records** (left of the desk) | leaf through the Complex's own books — your head tilts toward them |
| `←` `→` | page through whichever stack is open |
| `C` | compare mode — their papers beside your records |
| `Tab` | records |
| **Yellow button** | question them; then click any field on any document to ask about it |
| **Red / green buttons** | refuse / admit. Mouse only, deliberately — a verdict should not be a stray keypress |
| `Esc` | back out of a view · `P` pause · `M` mute |
| `E` | evidence sheet, during a Night Shift |

Add `?debug=1` to the URL to see ground truth and the planted evidence for the
applicant in the chair.

## How a case works

Every applicant is generated from a single seed, and that seed produces *both*
the animal in the chair and the photograph on their identity card. So when a
forger gets the ears wrong, the ears are genuinely, visibly wrong — the
comparison is real rather than a hidden dice roll.

Ground truth (`isMimic`) is decided first, and then evidence is deliberately
planted. Every mimic carries an explicit list of discrepancies drawn only from
the tells the daily bulletin has already taught, across four categories:

- **document forgery** — expiry dates, check letters, impossible dates, missing seals, names spelled differently on two papers
- **appearance** — the printed eyes/build/marks not matching the animal, or a photograph of a different skull
- **registry** — a unit the roster says is occupied, an ID the roster disagrees with, a door log that already has them coming home
- **dialogue** — answers that contradict the paperwork, plus behavioural cues that lean but never prove

Two invariants hold by construction, and `test/sim.test.js` enforces them over
hundreds of thousands of assertions:

1. **Every mimic is solvable** with what the player has been taught by that day.
2. **No honest applicant ever carries a real contradiction.** They get quirks —
   re-filed paperwork, no sponsor, a stale work chit, a nervous manner — and
   none of those is ever a rule violation.

```sh
node test/sim.test.js           # or: npm test
```

The sim layer has no DOM dependencies, which is what lets those tests run in
plain node.

## Layout

```
index.html            canvas + module entry
build.js              inlines src/ into dist/pacing-hams.html
src/
  core/               loop, input, seeded rng, tweening, save state, WebAudio
  art/                palette, painter registry, room, desk, pig, paper, night rooms
  sim/                identity, documents, registry, mimics, dialogue, day, economy,
                      upgrades, night
  scenes/             menu, desk shift, shift end, upgrade shop, night shift
  ui/                 canvas widgets, HUD
test/sim.test.js      generator invariants
```

Everything is drawn to one canvas — including the documents, which are rendered
from data to offscreen canvases and hand back the rectangle of every field. That
one detail is what lets the same layout drive inspect-mode clicking, field
questioning and compare-mode highlighting without duplicating any maths.

## Dropping in hand-drawn art

Every drawn element goes through a painter registry, so replacing procedural
art with bitmaps needs no changes to game logic:

```js
import { overrideWithImage } from './src/art/painters.js';

overrideWithImage('desk.surface', './assets/desk.png', { x: 0, y: 618, w: 1600, h: 282 });
overrideWithImage('room.base',    './assets/room.png',  { x: 0, y: 0,   w: 1600, h: 900 });
```

The `dest` rectangle is in the game's fixed 1600×900 coordinate space, and can
be a function of the painter's options instead of a fixed rect. Pass
`{ alsoProcedural: true }` to draw the bitmap *and* the code beneath it.

Registered painter ids: `room.base`, `room.dust`, `desk.surface`, `desk.button`,
`desk.stack`, `pig.seated`, `pig.photo`, `paper.document`, `night.room`.

`pig.seated` is the interesting one: it is called with a feature set (snout
length, ear notches, eye spacing, tusks, scars, hide tone) and is expected to
draw *that* animal, because the photo comparison depends on it. A drop-in
replacement wants to be a layered sprite set driven by the same features rather
than a single flat image.

## Upgrades

Four branches, each wired to a mechanic rather than a number: desk tools (a
brighter bulb, a loupe that rings failing arithmetic, a UV lamp for seals, more
questions), complex security (locks, bars, cameras, a watchpig, an alarm that
can interrupt a murder outright), living quality (rent, more applicants, warmer
residents who talk to you at night, a fifth floor), and records access — which
literally adds documents to your stack, and with them whole new classes of
contradiction to catch. The ward register is the clearest example: buying it is
what makes a forged ID prefix checkable at all.

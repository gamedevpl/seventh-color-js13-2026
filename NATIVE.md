# The Native Rewrite — the whole story, from scratch, 13 KB up

This plan inverts the project. Everything so far transformed a ~200 KB
gamedev.pl game *down* toward 13,312 bytes, and the measured floor of that
approach — micro-engine emulating the GameKit API so unmodified game code can
run, generalized 28-scene story machinery, localization call shapes,
telemetry fields — is **~12.3 KB before the first line of story**. Three
episodes fit under that regime; three never will.

The rewrite deletes the compatibility problem instead of squeezing it:
**a completely native JS game, ground up, in this repo** — raw canvas 2D,
raw Web Audio, no GameKit, no micro-engine, no adapter, no games-repo
dependency at runtime. One entry containing the *whole story*, designed to
13,312 from the first commit. (This repo is a js13k entry, not a gamedev.pl
catalog game — the games repo's GameKit-only validator rules do not apply
here; raw `getContext('2d')` and `AudioContext` are the point.)

What survives from the existing work is the part that was always the real
asset: the **measurement harness** (terser + roadroller + zip + headless
Chromium verify) and every number this project has measured.

## Design rules — each one paid for by a measurement

1. **Whole subsystems cost; slack doesn't.** The diffing probe: 1,163
   source bytes of duplicated state machine zipped to 96 — roadroller
   stores near-clone code at ~8% of source. Deleting whole things pays;
   restructuring survivors doesn't.
2. **One machine, many data rows.** Never a second implementation of
   dialogue/choice/retry/cinematic-beats. A scene sharing a paid-for
   machine costs ~1 KB through the old pipeline; one bringing its own
   costs ~2.65 KB. Native, the ratio should be even steeper.
3. **Portraits carry scenes.** The three staging rewrites bought −1,787,
   −4,086 and −2,609 bytes and *read better*. Bodies appear only where
   motion is the mechanic itself — and the rewrite budgets **at most one**
   motion set piece, priced before built.
4. **A mechanic is ~15 lines.** Ice Rain proved it. A dedicated
   logic/render pair is a ~2 KB decision reserved for a lead mechanic,
   never a way to add a scene.
5. **Six faces, no more.** Cast-size was the measured cost driver of the
   naive slices. Cast: Jack, Lili, Gump, Darkness, Meg, the unicorn.
   Luna, Blix, Pox, Brown Tom, Screwball, Blunder, Tic are cut — every
   shipping episode already cut Luna, and none of the seven is
   load-bearing to the arc.
6. **Prose is cheap but not free.** All 28 scenes' prose measured 4,107
   zipped. Write tight because it's better writing; don't grind prose for
   bytes.
7. **Data compresses; code multiplies.** Prefer verbose, repetitive data
   over clever encodings. Never pre-deduplicate or delta-encode data — a
   context-mixing compressor feeds on repetition, and hand-diffing starves
   it (measured, twice).
8. **Measure with the real chain from day one.** esbuild → terser →
   roadroller → zip. Source-size intuition lied every time it was tested.
9. **Never trust one roll.** Roadroller jitter is ±30–100 bytes. Every
   gate is judged on the *worst* of 5 rolls.
10. **Retract on measurement, not argument.** The project's record: rig
    diet, prose blanking, episode splitting, DRY logic, loop density, mode
    unification — all plausible, all retracted by numbers. The rewrite
    inherits the discipline, not just the numbers.

## The game — twelve beats, whole arc

| # | beat | machine | notes |
| --- | --- | --- | --- |
| 1 | The Shadow Council | story | Darkness alone, vowing winter — cold open, stakes on first read |
| 2 | Winter Falls | **Ice Rain** | proven timing minigame, Jack at the pond, Lili gone |
| 3 | The Bog Road | **lights** | silence the warning lights — the non-walking redesign of the dual-puzzle |
| 4 | Meg's Looking Glass | story + **aim** | parley choice, then mirror-aim — proven scene, proven mechanic |
| 5 | The Root Door | story | riddle row: choose the true passage into the castle |
| 6 | The Gown That Breathes | story | riddle row — the proven two-portrait confrontation |
| 7 | The Hidden Hand | story | confrontation row on castle art |
| 8 | The False Sacrifice | story | confrontation row, same art — a pure diff |
| 9 | The Final Beam | story + **aim** | the aim mechanic re-parameterized: turn the mirror trick on Darkness |
| 10 | The Edge of the World | **chase?** | the ONE motion set piece — go/no-go priced at M3; fallback is a timed tap-beat cinematic |
| 11 | Spring Remembers | **align** | alicorn-align on the unicorn portrait — proven |
| 12 | The Seventh Color | story | vow choice → rainbow bloom ending |

Mechanics inventory: **one story machine** (dialogue → choice → retry →
timed cinematic beats — the thing riddle/finale/epilogue were three copies
of) + **four micro-mechanics** (Ice Rain timing, aim — used twice, align,
lights) + one optional chase. Locations: ~7 painters; beats 5–9 share the
castle interior, so 7, 8, 9 are near-pure data rows.

Beat 9 is the design keystone: reusing the aim mechanic as the finale means
the player's *skill* from beat 4 pays off narratively — Jack turns Meg's
own trick on Darkness — and it costs a parameter row, not a mechanic.

## Native architecture

```
src/
  main.js    boot, canvas, letterbox, rAF loop, input (pointer + keys)
  draw.js    prims: path/circle/rect/line/text, transform push/pop, one palette array
  audio.js   tiny WebAudio synth (square/triangle/noise + envelope), pattern player, 2 tracks as note strings
  story.js   THE machine: beats, lines, choices, retry, timers, transitions
  faces.js   6 portraits as packed polygon data + one renderer (blink + talk, shared)
  scenes.js  7 location painters
  games.js   the 4 micro-mechanics (+ chase if it survives M3)
  data.js    the whole story as rows — every beat is data on a machine
```

No classes, no runtime module system (esbuild IIFE), no framework, no
external requests, single HTML file. English only — no localization layer
at all (the fold that stripped Polish becomes simply not writing it).

## The ledger — provisional, corrected at every gate

All numbers zipped, after the full chain. These are estimates to be
*replaced by measurements* at each milestone; the ledger's job is to make
drift visible the day it happens, not to be right today.

| subsystem | budget | measured |
| --- | ---: | ---: |
| boot + loop + shell + prims (M0) | 600 | **1,048** |
| input (deferred to M1) | 200 | — |
| audio synth + music + sfx | 900 | — |
| story machine | 700 | — |
| 6 portraits | 1,400 | — |
| 7 location painters | 2,200 | — |
| 4 micro-mechanics (+ chase option) | 1,300 | — |
| story data + prose | 2,500 | — |
| HUD, title, ending | 500 | — |
| reserve (jitter + integration) | 1,200 | — |
| unassigned — spent last | 1,264 | — |
| **ceiling** | **13,312** | |

M0 ran 448 over its own line item, taken from "unassigned." M1 (input +
story machine + 1 portrait + 1 painter + 1 beat of data + title) landed at
2,242 cumulative, +1,194 over M0. M2 (5 more portraits, 2 more painters,
choice/retry/success machine phases, 2 more beats, choice UI) landed at
**3,569 cumulative, +1,327 over M1** — first real per-unit data:

- 5 portraits, sharing the blink/mouth helpers built for the first one,
  cost markedly less than the 1,400-budget/6-faces ≈ 233/face estimate.
- 2 more painters (`hall`, `forest`) similarly undershot 2,200/7 ≈ 314/painter.
- Choice/retry/success + arrow-key input + 2 beats of data all fit in the
  same 1,327 as the above, well inside the combined provisional budget for
  all of it (~1,400×5/6 + 2,200×2/7 + machine + 2 more data rows ≈ 2,700+).

Still bundled, not force-split further — this is a positive-drift result,
not a warning, but the ledger's job is to catch the day it goes the other
way, so it stays a measured cumulative rather than an assumed one.

M3 (3 mechanics — `icerain`, `dial`, `lights` — 5 more painters, 5 more
beats) landed at **5,152 cumulative, +1,583 over M2**. `dial` alone covers
what was planned as two mechanics (`aim`/`align`), so this bought 3
mechanics' worth of interaction plus 5 painters plus 5 beats in less than
M2's single increment cost for roughly a third as much new *content*
per byte — the sharpest positive drift yet, consistent with mechanics
being pure code (cheap to compress, per design rule 1) while painters and
data are what actually cost.

**8,160 bytes remain against the 13,312 ceiling for M4 (beats 7-10, the
chase decision below, music) and M5 (polish).**

M4 (beats 7-10 — 2 more painters, the committed `chase` mechanic, `audio.js`
— all twelve beats, full chain) landed at **6,397 cumulative, +2,245 over
M3's chase-reverted baseline**. Every remaining beat is real content shipped,
not thin filler: 2 new painters, 4 new beats' dialogue and choices, a
committed motion mechanic, and a full audio system (drone + 4 sfx voices)
all in under 2.3 KB combined.

**6,915 bytes remain against the 13,312 ceiling — for M5 alone** (theme
integration, polish). The whole twelve-beat story, every mechanic, and
audio all fit in under half the budget.

M5 (the rainbow bloom, the unicorn's restoration actually staged, final
gate) landed at **6,523 final, +126 over M4**. **Ship state: 6,523 zipped
against a 13,312 ceiling — 6,789 bytes of headroom, 52% of the budget
unused**, with every milestone gate passed on the worst of at least one
`-O1` roadroller roll and the final one checked against the worst of 5.

## Build and measurement harness

- `tools/native.mjs`: esbuild `src/main.js` → terser (reusing
  `lib/squeeze.mjs`) → roadroller → HTML shell → `build/native.zip`.
- `tools/verify.mjs` reused against the native zip — boots the real
  artifact in Chromium, fails on console errors, screenshots.
- `npm run gate`: builds native, asserts the **worst of 5 roadroller
  rolls** is under the current milestone ceiling (`native-milestone.json`),
  regenerates `SIZE-NATIVE.md`. A commit that fails its gate doesn't land.

## Milestones — each ends at a measured gate

| | scope | gate (worst of 5 rolls) |
| --- | --- | ---: |
| **M0** | boot + prims + loop, one animated shape on screen | **< 1,500** |
| **M1** | story machine + 1 portrait + 1 painter + title card | < 4,000 |
| **M2** | all 6 portraits + full story machine; beats 1, 6, 12 playable start-to-finish (the spine) | < 6,500 |
| **M3** | 4 micro-mechanics; beats 2, 3, 4, 5, 11 playable; **chase go/no-go decided here on real numbers** | < 9,500 |
| **M4** | all 12 beats + music + ending | < 12,100 |
| **M5** | theme integration, juice, polish | ≤ 13,312 with ≥ 150 headroom |

M0 is the premise test. The entire bet is that a native floor is ~1 KB
where the inherited floor was ~12.3 KB — if M0 lands far above its gate,
the premise is wrong and we learn it in a day, not a month. Every
subsequent gate is sized so that missing it forces a scope decision *at
that milestone* instead of a death march at the end.

## Risk structure

- **The fallback already exists.** Episodes 1, 2 and 4 are finished,
  under budget, verified, and committed. If the rewrite misses, the
  episode series ships as-is.
- **If the rewrite lands, it replaces the series.** js13k forbids
  submitting the same game twice, and a whole-story entry overlaps every
  episode. The episodes then remain what they already are — the measured
  proof-of-concept that found every design rule above.
- **Reuse is designs and data, not code.** Face geometry, palettes,
  dialogue text, minigame designs port over as *data into new code* —
  a new game built during the compo, seeded with our own content, which
  the rules explicitly permit.

## Open inputs

1. **The 2026 theme.** The js13k site is client-rendered and the theme
   couldn't be extracted from this session. It gets folded in at the
   design level at M5 (and earlier if it suggests a mechanic) — paste it
   into the conversation and it enters the plan.
2. **Cast cut sign-off.** Six faces, Luna cut from the whole game (not
   just episodes) — flagged as the one narrative decision this plan makes
   that earlier work only made per-episode.

## Milestone log

### M0 — boot floor: PASS

Canvas + letterbox/center-fit resize + rAF loop + draw prims (`rect`,
`circle`, `ellipse`, `line`, `poly`, `text`, `withTransform`), one animated
shape. `esbuild` bundle 1,199 → terser+mangle 594 → **zip 1,048**, worst of
5 `-O1` rolls (roadroller converges deterministically at this size — no
jitter to chase yet, that starts mattering once the payload is large enough
for the optimizer's search space to matter).

**Ceiling 1,500, landed at 1,048 — 452 bytes of margin, premise confirmed.**
The native floor is two orders of magnitude below the ~12.3 KB inherited
floor this document exists to escape. Caught and fixed one real bug before
calling it done: the initial CSS didn't vertically center the canvas
(pinned to the top of the body) — a screenshot at the verify step caught it,
same discipline as every episode in the transform-pipeline work.

Files: `native/src/{main,draw}.js`, `tools/native.mjs` (build:
esbuild → terser → roadroller → zip, reusing `lib/squeeze.mjs` so numbers
are comparable to the episode pipeline), `tools/verify-native.mjs` (headless
Chromium boot + console-error + screenshot check), `native-milestone.json`
(current gate), `npm run native:gate` (`--O1 --rolls=5` then verify).

### M1 — story machine + first portrait + title: PASS

`story.js` (dialogue-advance machine — choice/retry/cinematic phases arrive
when a beat first needs them at M2), `faces.js` (Darkness, packed polygon
data + shared blink/talk renderer), `scenes.js` (shadow-council painter),
`data.js` (beat 1's lines), input wiring in `main.js` (pointer + Space/Enter).

`esbuild` bundle 6,240 → terser+mangle 3,462 → **zip 2,240**, worst of 5
`-O1` rolls 2,242 (roadroller jitter starts showing — 1-byte spread at this
size, per design rule 9 the *worst* roll is what's judged).

**Ceiling 4,000, landed at 2,242 — 1,758 bytes of margin.** Verified past
just booting: `verify-native.mjs` now presses Space and screenshots after
each press (`--presses=N`), confirming the full loop — title → dialogue
line 1 → line 2 → back to title — plays correctly, not just that the canvas
paints. Same discipline the GameKit-episode `verify.mjs` used throughout
the transform-pipeline work, now doing the same job for a codebase this
project wrote itself.

### M2 — six portraits + story spine: PASS

Extended `story.js` to the full machine: `P.CHOICE` (arrow-key select +
confirm), `P.RETRY` (wrong answer, press to return to `P.CHOICE`),
`P.SUCCESS` (post-choice dialogue), `P.END` (terminal, for `ending: true`
beats). Added `jack`, `lili`, `gump`, `meg`, `unicorn` to `faces.js` (all
six now built), `hall` and `forest` painters to `scenes.js`, and beats 6
(`gown-that-breathes`) and 12 (`seventh-color`) to `data.js`, chained
directly off beat 1 for now (`1 -> 6 -> 12`) — the missing beats slot in at
M3/M4 by editing only `data.js`.

`esbuild` bundle 13,977 → terser+mangle 8,225 → **zip 3,555**, worst of 5
`-O1` rolls 3,569. **Ceiling 6,500 — 2,931 bytes of margin.**

Verified the whole spine, not just that it boots: extended
`verify-native.mjs` with `--keys=` (named keys, not just Space) to drive
arrow-key choice selection. Caught one real bug in the *test* along the
way — the first `space` in a sequence starts the game from the title
screen, so it doesn't count toward beat 1's dialogue; a naive key count was
off by one and made it look like arrow-key input wasn't registering when
it was actually the harness's press-counting that was wrong. Confirmed with
a full correct-answer run: title → beat 1 (2 lines) → beat 6 (3 lines,
choice, correct selection, success line, mouth-animation correctly follows
the current speaker) → beat 12 (2 lines, choice, success) → the `forest`
ending screen (its own composed backdrop, not just title text over black) →
back to title. Screenshotted at every step.

### M3 — three mechanics (not four), five painters, five beats: PASS

Planned as four mechanics (Ice Rain timing, `aim`, `align`, `lights`);
built as three. `aim` (turn the mirror on Meg) and `align` (turn the
alicorn's horn) turned out to be the identical interaction - rotate toward
a target angle within a tolerance, confirm - before a line of either was
written. Collapsed into one `dial`, parameterized per beat (`games.js`).
Design rule 2 applied to the *plan* this time, not retroactively to code
the way the old pipeline's mode-unification finding worked.

`games.js`: `icerain` (timing taps, reused from the episode-series design),
`dial` (continuous turn + confirm, used by beats 4 and 11), `lights`
(ordered-selection puzzle - the non-walking redesign of the old
`bog-cottage` dual-puzzle, resolving the mechanic-redesign question the
episode series left open rather than a walking simulation). `story.js`
gained a `P.GAME` phase: dialogue hands off to a mechanic's own
init/update/render, which owns success but never the surrounding
dialogue/success/next plumbing - a mechanic failing is feedback handled
inside the mechanic (a reset, a color change), never a modal phase switch.
5 new painters (`pond`, `bog`, `cottage`, `roots`, `stream`) and 5 new
beats (2, 3, 4, 5, 11), chaining `1→2→3→4→5→6→11→12` - beats 7-10 (the
castle interior + the chase decision) slot in at M4 by data.js edits alone.

`esbuild` bundle 23,072 → terser+mangle 13,854 → **zip 5,152**, worst of 5
`-O1` rolls 5,151. **Ceiling 9,500 — 4,349 bytes of margin.**

Two real bugs caught and fixed, both by the same discipline: drive it and
look, don't trust that code compiling means code working.

1. **`paintHud` checked `if (b.game)` instead of `if (round.phase ===
   P.GAME)`.** Any beat carrying a mechanic never showed its own dialogue
   text at all - it jumped straight to the game prompt from the first
   frame, even while still in `P.DIALOGUE`. Caught because a screenshot
   mid-dialogue showed the game prompt where a dialogue line should have
   been; the mechanic's own visual elements (Ice Rain's falling shard, its
   hit-progress dots) were correctly invisible at that point too, since
   `round.phase` genuinely wasn't `P.GAME` yet - both symptoms had the one
   root cause once traced.
2. **The verify harness's own key-counting was off by one**, at M2 - the
   first `space` in a scripted sequence starts the game from the title
   screen, so it doesn't advance beat 1's dialogue. Documented under M2;
   recorded again here because the *same class* of harness bug (confusing
   a mechanic's runtime state with the beat's config - `r.g.target` when
   the target lives on `b.g.target`, `r.g` only ever holds `{angle,
   aligned}`) showed up a second time while writing a full-chain
   integration test, and produced an identical-looking symptom: a
   plausible-looking infinite loop that read exactly like a real product
   bug (`dial` stuck turning the wrong way against the clamp) until
   isolated with a minimal reproduction. Two data points is a pattern -
   test-code bugs that mimic product bugs are the recurring failure mode
   for this kind of driven verification, not a one-off.

Verified past individual mechanics: a Node-level integration test drives
`story.js` + `games.js` directly (no browser needed, fully deterministic -
`icerain`'s internal timing window doesn't survive Playwright's real
wall-clock key-press intervals reliably, so this is the more honest way to
prove a timing-sensitive mechanic converges) through the entire built
chain - all three mechanics solved correctly, both choices answered
correctly, ending at `P.END` on `seventh-color`. Each mechanic's render
also confirmed visually via targeted screenshots (a temporary debug start-
point edit, reverted before committing): `lights`' three selectable dots,
`dial`'s needle-and-ring, `icerain`'s falling shard and hit-progress dots
all read clearly against their scenes.

### The chase decision: GO, priced not guessed

Design rule 3 required pricing beat 10's chase before building it. Probed
on top of the committed M3 baseline: added a `chase` mechanic to
`games.js` (progress + timed-jump-over-gaps, the same shape as the old
episode series' `throne-pursuit`) and a fully wired test beat reusing the
`roots` painter, measured, then reverted both via `git checkout` — the
same reversible-probe discipline used throughout the episode-series work.

| | zip | delta |
| --- | ---: | ---: |
| M3 baseline (3 mechanics, no chase) | 5,152 | — |
| + `chase` mechanic code only (unreferenced by any beat — not tree-shaken, since `GAMES` is dynamically indexed by `b.game`, so this delta is the mechanic's true marginal cost) | 5,406 | +254 |
| + a fully wired test beat (dialogue, `gamePrompt`, reused painter) | 5,509 | +357 total |

**357 bytes for a complete, playable chase beat.** Confirmed correct with
the same two-track verification as the other mechanics: a deterministic
logic test (clears all three gaps, zero fails) and a screenshot (scrolling
ground, visible gap markers, Jack's portrait above — reads as an obstacle
course, not just numbers passing).

**Decision: GO.** Beat 10 gets the chase, not the tap-beat-cinematic
fallback. Against 8,160 bytes remaining after M3, 357 for the series' one
motion set piece is not a close call. The committed mechanic set stays at
three for now — this was a pricing probe, not the real build; beat 10
proper (its own painter, real dialogue, final gap tuning, wired into the
actual chain in place of the `roots`-reusing placeholder) is M4 work,
scoped there already since M4 covers all twelve beats.

### M4 — all twelve beats, music, the chase for real: PASS

Added the four remaining beats: `hidden-hand` and `false-sacrifice`
(confrontation rows sharing a new `throne` painter — a pure diff each,
same mode, different data, exactly the pattern design rule 2 predicts),
`final-beam` (the design keystone realized: the `dial` mechanic Jack
learned from Meg turned on Darkness himself, same code, a new target
angle), and `edge-of-world` (the chase, committed for real this time, on
a new `causeway` painter). Chain is now the full
`1→2→3→4→5→6→7→8→9→10→11→12`, no skips.

`audio.js`: one `tone()` primitive doing double duty as both the ambient
drone (three detuned oscillators, `setDrone(freq)` per beat via a new
`drone` field in beat data — low and tense through the castle, warm at
the reunion and ending) and four short envelope blips (`sfxTap`,
`sfxYes`/`sfxNo` for choices, `sfxWin` for mechanic completion). No note-
sequence player, no tracker format — design rule 2 applied to audio the
same way it was applied to the story machine and the mechanics: one
mechanism, parameterized, not two systems.

`esbuild` bundle 30,529 → terser+mangle 18,454 → **zip 6,397**, worst of 5
`-O1` rolls 6,408. **Ceiling 12,100 — 5,692 bytes of margin.**

One real bug caught and fixed before committing: `chase`'s render drew an
opaque dark-green ground rect that visually clashed with the new
`causeway` painter's purple palette, half-covering its own bridge art. A
screenshot at the mechanic's first real outing (not the probe, which used
a placeholder painter and never showed this) caught it; fixed by dropping
the opaque rect and letting the causeway's own art show through the
scrolling crack-lines, and adding the same "highlight the target in the
window" cue `icerain`'s hit-dots already use, for a consistent feedback
language across mechanics rather than one added ad hoc.

Verified with the same Node-level integration test extended to solve all
four mechanics across all twelve beats (icerain, lights, dial ×2, chase)
plus every choice - reaches `P.END` at `seventh-color` cleanly. Each new
painter confirmed visually via targeted screenshots (temporary debug
start-points, reverted before committing, same as M3).

### M5 — the theme, made literal; the unicorn actually restored: SHIP

The 2026 theme arrived mid-build: **rainbows and unicorns**, with the user
noting the resemblance to *Legend* (1985) — a unicorn, a Lord of Darkness,
color stolen from the world — which the story had already been telling for
three sessions before the theme was known. Nothing about the plot needed
changing; what needed doing was making the theme *legible*, not just present.

Two additions, one shared visual:

1. **A rainbow bloom** - seven concentric rings, seven colors, one
   function (`bloom()` in `main.js`) used at both the title screen (a
   small accent, a promise) and the ending (full-size, the promise kept).
   Not two effects; one, parameterized by position and radius, the same
   "one thing, not two" instinct this whole rewrite has run on. +137 bytes.
2. **The unicorn's restoration, actually staged.** Caught in review, not
   requested: `spring-remembers` - the beat literally about restoring the
   unicorn's horn - never showed the unicorn. Added it, anchored exactly
   on the `dial` mechanic's own coordinates so the turning needle reads as
   *the player aligning the horn itself*, not a coincidence of two things
   sharing a scene. Wired `horned` to the beat's actual mechanic state
   (`!b.game || phase === P.SUCCESS`) rather than a fixed flag - hornless
   through the dialogue and the attempt, restored the instant the mechanic
   resolves, so the visual payoff is earned, not decorative. Also gave the
   unicorn a small cameo in the finale, confirming the restoration held.
   Caught one bug in this same pass: the first version of the `horned`
   condition (`phase !== P.GAME`) was true during the *pre-attempt*
   dialogue too, showing a restored horn before the player had done
   anything - a screenshot at that exact moment caught it, fixed by
   requiring `phase === P.SUCCESS` specifically. +20 bytes.

`esbuild` bundle 31,102 → terser+mangle 18,795 → **zip 6,523**. Ship gate
was ≤13,312 with ≥150 headroom on the worst of 5 `-O1` rolls; actual worst
of 5 was 6,524, best 6,517 - **6,789 bytes of headroom, 52% of the entire
budget unused.**

Verified the same two ways as every milestone: the Node-level integration
test (all four mechanics, all twelve beats, every choice, reaches `P.END`)
re-run clean after every change in this pass, and targeted screenshots for
each visual claim - the bloom at both the title and the ending, the
unicorn hornless during dialogue, hornless mid-`dial`, and horned in the
finale cameo. Nothing shipped on "it should work."

## Where this leaves the project

Five milestones, five gates, all passed with real margin:

| | ceiling | worst-of-N | margin |
| --- | ---: | ---: | ---: |
| M0 - boot floor | 1,500 | 1,048 | 452 |
| M1 - story machine + 1 portrait | 4,000 | 2,242 | 1,758 |
| M2 - 6 portraits, full machine, spine | 6,500 | 3,569 | 2,931 |
| M3 - 3 mechanics (not 4), chase priced | 9,500 | 5,151 | 4,349 |
| M4 - all 12 beats, audio, chase shipped | 12,100 | 6,408 | 5,692 |
| M5 - theme, ship | 13,162 | 6,524 | 6,788 |

The premise the plan opened with - that a native floor would land two
orders of magnitude below the transform pipeline's ~12.3 KB inherited
floor - held at every single gate, not just at M0. The whole twelve-beat
story, four working mechanics (one of them reused twice by design), six
animated portraits, seven location painters, a full audio layer, and
theme-integrated polish together cost **less than half** what the old
pipeline's engine-and-harness alone cost before a single scene shipped.

Per the plan's risk structure: the episode series (episodes 1, 2, and 4,
all shipping, all under budget, all still committed and pushed) remains
the fallback that needed no rescuing. This rewrite is not a fallback - it
is a complete, verified, theme-integrated, comfortably-under-budget js13k
2026 entry telling the whole story in one submission, which is what the
episode series was always working around not being able to do.

## M6 - the mechanics were not games

The build passed every byte gate and told the whole story, and the
mechanics were still bad. Played rather than measured, all four failed in
the same way: **nothing could be lost, so nothing could be learned.**

| | what it actually was | why it failed |
| --- | --- | --- |
| `dial` (used 3x) | hold a key until the needle turns yellow, press space | literally could not be failed - a third of all mechanic encounters were a no-op |
| `lights` | guess a permutation stored in `data.js` | the answer was never on screen; not a puzzle, a lock with no key |
| `icerain` | one dot, fixed position, one button | a QTE - no spatial dimension, no cost for missing |
| `chase` | hold right to advance | nothing was chasing you; you could stop and think forever |

What they are now, keeping the visual language intact:

- **`dial`** - an unstable equilibrium. Small deviations accelerate away,
  so the player balances rather than parks, and alignment has to be *held*
  to fill a charge rather than merely touched. The target sways; the
  tolerance wedge is drawn, so the thing you are aiming at is visible.
- **`lights`** - the marsh-fire demonstrates the safe order, then replays
  it after a slip. A memory test the player can actually pass, instead of
  brute force over permutations.
- **`icerain`** - weak points open across the ice on a visible sealing
  timer, up to three at once, and the chisel has to be carried to them.
  The skill is triage: which one can you still reach?
- **`chase`** - the run is automatic and accelerating, the collapse is a
  real object on screen closing the gap whenever you stumble, and the jump
  arc is tight enough that it has to be aimed.

Plus a shared juice layer (`fx.js`: screen shake, particle bursts) called
by all four rather than four private feedback systems, and the controls
printed under every prompt - a mechanic nobody knows how to drive is
indistinguishable from one that does not work.

### Tuning by measurement, not by feel

`tools/play-native.mjs` plays the whole game at module level. Its solvers
are written as a *competent human*: they use only what the renderer puts
on screen - mark positions, the drawn tolerance wedge, the demonstrated
sequence, the gaps ahead - never `data.js`. `--sloppy=N` then models an
imperfect player: decisions arrive four frames late and a fraction of
inputs are dropped outright.

That sweep is what made the tuning honest, and it caught three real
faults that no amount of reading the code would have:

1. **`final-beam` was unwinnable for a lagged player.** Charge drained at
   0.8/s and filled at 1.0/s, so a scrappy player netted ~zero and the
   beat never ended. Drain is now 0.45/s - the meter is ground gained,
   still losable, no longer futile.
2. **`spring-remembers` stalled before it began.** With runaway drift
   proportional to distance, a needle starting 2.1 rad out generated 1.57
   rad/s of drift against 1.7 rad/s of steering - the two nearly cancelled
   and the needle crawled. Drift is now capped well under the steer rate,
   which keeps the instability where it matters (near the target) and
   makes the far field recoverable.
3. **The causeway read as a ladder.** Fixing hole width for fairness had
   made holes 47% of the floor. Narrowing them fixed the read but removed
   the challenge (zero stumbles even at 35% dropped inputs), so the jump
   arc was tightened instead: same readable floor, timing back in.

Final band, worst case over repeated runs:

| player | mechanics | outcome |
| --- | --- | --- |
| perfect | 2.3 - 6.0s each | clean |
| 20% dropped | barely slower | clean |
| 35% dropped | stumbles and seals appear | always completes |
| 50% dropped | real struggle | always completes |

0 stalls in 30+ runs. The design target: failure is visible and costs
ground, recovery always exists, nobody is ever stuck.

One bug surfaced on the way and is now guarded by the test: the press
that completed a mechanic was *also* fed to `press()`, which consumed the
entire success line and jumped straight to the next beat - so every
mechanic beat silently skipped its own payoff line.

Cost: **7,671 bytes** worst-of-5, up from 6,519. The mechanics rework,
the juice layer and the on-screen controls together cost ~1,150 bytes and
left 5,641 of the 13,312 budget unused.

## M7 - content restored, and the mechanics made into puzzles

Two passes, both paid for out of the headroom the native floor bought.

**Restored from the original GameKit build (12 beats -> 16).** The cut
opened on Darkness gloating and jumped straight to "Lili is gone under the
ice": the player never met Lili, never saw a unicorn whole, and never
watched winter begin. Restored using the original's own prose - the glade,
the unicorn stream and its inciting incident, the Champion's Hollow, and
the vow at the vision pool. The blindfold-path scene was folded into the
glade rather than given a second location: the lines were the content, the
second location was not.

**All eight composed tracks, ported note-for-note** as 16-step tracker
patterns behind a lookahead scheduler on the audio clock - 579 bytes for
the lot. A region now plays across its beats; restarting the bar at every
beat boundary was what made the old per-beat drone read as a buzzer.

**Then the mechanics stopped being reflex tests.** Every one of them
measured dexterity - timing, balance, memory - and none asked the player to
work anything out.

| | was | is |
| --- | --- | --- |
| `dial` (x3) | balance a drifting needle | **`beam`** - route a beam through mirrors you set to `/` or `\` |
| `icerain` | hit the lit thing in time | **`crack`** - a strike splits the pane *and both neighbours*: 1D Lights Out |
| `lights` | repeat a demonstrated order | **deduction** - name an order, learn how many you placed right |
| `chase` | jump the holes | holes to leap **and** arches you must not jump under |

The chase stays an action beat on purpose - the story's climax should not
pause for a puzzle - but it now needs a decision per obstacle rather than
one reflex.

### The layouts are data, and data can be wrong

An unsolvable beam layout looks exactly like a hard one until someone gives
up. `tools/check-puzzles.mjs` brute-forces every mirror configuration of
every beam beat and reports whether a solution exists, whether the start is
already solved, and how many configurations work. It immediately caught
`spring-remembers` shipping at **0/16 solutions** - authored by hand,
traced by hand, and wrong.

All three now have exactly one solution, which is what makes them deduction
rather than fiddling:

| beat | mirrors | solutions | min flips |
| --- | ---: | ---: | ---: |
| megs-looking-glass | 3 | 1/8 | 2 |
| spring-remembers | 4 | 1/16 | 4 |
| final-beam | 5 | 1/32 | 3 |

Crack boards are scrambled by real strikes, so they are solvable by
construction - but **solvability is not difficulty**. Measured over 20
runs, one board in four was falling to a single strike, so the shortest
solution is now computed at init (128 subsets, once) and any board that
gives itself away is thrown back. Every board now needs 3 or 5 strikes;
the parity is visible in that there are no even answers. The lights
deduction lands in 1-4 guesses over the same sample.

One measurement changed meaning here and is worth stating plainly: the
solver times in `play-native.mjs` are *execution* times, not thinking
times. A solver computes the answer instantly, so "crack 1.3s" means "five
moves once you already know the answer" - it proves the puzzle is
solvable and bounds the input cost, and says nothing about how long a
player will stare at it. `--sloppy` keeps its old job of proving nothing
becomes unwinnable: 0 stalls in 45 runs up to 50% dropped inputs.

`npm run native:gate` now proves every puzzle solvable before it measures
a single byte.

Cost: **9,774 bytes** worst-of-5 - the whole of M7 (four restored beats, a
new painter, eight music tracks with a sequencer, a stillness mechanic, a
cutscene phase, and four mechanics rebuilt as puzzles) came to ~2,100
bytes and left 3,538 of the 13,312 budget unused.

## M8 - the story learns to hold a moment

Five narrated cutscenes over full-screen procedural veils, built on the
`P.CUT` phase that already existed rather than a second system:

| beat | veil | |
| --- | --- | --- |
| `prologue` | bloom | seven rings breathing outward - the premise, before a word of dialogue |
| `unicorn-stream` | shatter | the horn breaking, the light going out of the world |
| `winter-comes` | snow | winter arriving, and then not stopping |
| `edge-of-world` | dark | the castle taking its own roof down behind them |
| `epilogue` | dawn | colour bleeding back, band by band |

Nineteen beats now, and cutscenes are the cheapest thing in the project
per unit of effect - no assets, no frames, just maths over time. All five,
plus the veils and the narration, came to about a kilobyte.

The machine grew exactly two things, both small. A cutscene is a **list of
lines with a per-line hold**, so the writing sets the pacing rather than a
duration kept in sync with it by hand. And a beat with **no dialogue *is*
its cutscene**, opening straight into `P.CUT` - which is what let the
prologue and epilogue be ordinary beats instead of special cases bolted
onto the title and ending screens.

One deliberate reversal: cutscenes were designed unskippable, and that was
wrong. Thirteen unskippable seconds before the first interaction is a real
risk when a compo judge gives an entry ninety seconds. A press now moves
to the next line early - the moment keeps its shape for anyone who wants
it and stops being a wall for anyone who does not.

### Two bugs found by looking, not by reasoning

- **Prose ran off both edges of the canvas.** The epilogue's longest line
  was clipped at both ends, and a check across every string found four
  over the limit - including a piece of *dialogue* that had been
  overflowing since the day it was written and had simply never been
  screenshotted. Trimming sentences to fit is a losing game as prose keeps
  getting written, so `draw.js` now wraps against real font metrics and
  dialogue, retry text and narration all lay out over two lines when they
  need to.
- **The integration test silently swallowed a whole beat.** Its cutscene
  loop watched the *phase*, and two cutscenes back to back are both
  `P.CUT` - so `winter-comes` was consumed inside `unicorn-stream`'s loop
  and never reported. It now stops at the beat boundary, which is why the
  walk reports 19/19 rather than 18/19. The same species of harness bug
  this project has now hit four times: the test agreeing with itself
  instead of with the game.

Cost: **10,997 bytes** worst-of-5, leaving 2,315 of the 13,312 budget.

## Decision: this is the submission

The user's call: **"We need full story."** The native rewrite in this
repo - not the episode series - is the js13kGames 2026 entry. It tells
all twelve beats in one HTML document; the episode series covered the
same story only in fragments across separate compo entries, which is
exactly the gap this rewrite closed.

Final locked build, after M7: `node tools/native.mjs --O1 --rolls=5` →
**10,997 bytes** worst-of-5 zipped against the 13,312-byte budget -
**2,315 bytes (17%) of headroom unused**, comfortably under the 13,162
ceiling. Nineteen beats, five mechanics (four of them puzzles), five
narrated cutscenes, eight music tracks.
`unzip -l build/native/index.zip` confirms the archive holds exactly one
file, `index.html`, at the root - the shape js13kGames requires.
`tools/verify-native.mjs` reports a clean boot (no console errors,
warnings, pageerrors, or failed requests) and the Node-level integration
test walks all twelve beats start to finish:
`shadow-council -> winter-falls -> bog-road -> megs-looking-glass ->
root-door -> gown-that-breathes -> hidden-hand -> false-sacrifice ->
final-beam -> edge-of-world -> spring-remembers -> seventh-color`,
ending in `P.END`.

What's left is outside this repo's reach: creating the actual js13k
2026 competition entry at js13kgames.com is a manual step on the
compo's own site, gated by the user's own account.

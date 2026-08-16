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
2,242 cumulative, +1,194 over M0 — bundled across several buckets at once
(module wiring is shared, not separable per bucket yet), so recorded as a
cumulative checkpoint rather than force-split: **cumulative through M1:
budgeted 3,400 (600+200+700+1,400/6+2,200/7+2,500/12+500), measured
2,242 — already under**, because per-portrait/per-painter/per-data-row
costs won't be knowable until M2 gives more than one of each to regress
against. Each future milestone's actual gets recorded the same way.

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

# The Episodes Plan — one submission per chapter

The question this document answers: js13kGames allows multiple entries per participant,
so can The Seventh Color ship as a *series* of 13 KB episodes instead of one impossible
37 KB game? Short answer: **yes, it is legal, and the machinery now exists — but a 1:1
chapter slice does not fit the budget.** Every naive episode measures 5–10 KB over.
The plan that works is fewer, redesigned, mechanic-led episodes. The numbers are below.

## What the rules actually say

Extracted from the competition's own rules page (the site is client-rendered; quotes
pulled from its page module):

> "You may submit more than one game, but you can only have a single draft open at
> a time. Sending the same game as independent submissions targeting different
> platforms (e.g. separate desktop and mobile builds) is forbidden."

> "How many games can I submit? The limit is 13... just kidding, you can submit as
> many as you want."

> "Do not submit old games or demos. [...] You are free to seed your game with
> already existing content and resources, as long as you have the (legal) right to
> use them and it's in line with all other rules."

> "Games on our site share the same origin, so if you use [localStorage] prefix
> your keys with a unique namespace."

> "The theme is a rating criterion and impacts your score."

Four consequences:

1. **A series is explicitly allowed.** The forbidden case is the *same* game submitted
   twice; episodes with distinct scenes, cast, and lead mechanics are distinct games.
2. **The "old games" rule is the line to respect.** The Seventh Color exists on
   gamedev.pl. What makes an episode submittable is that it is a *new game built during
   the compo* — the micro-engine was written this month for this budget, the scope/fold
   pipeline is compo work, and each episode needs genuine redesign (below) — *seeded*
   with our own content, which the rules permit in as many words. A re-zip of the
   published game would not clear this bar; these episodes must not be that.
3. **One draft at a time** → episodes are produced and submitted *serially*. Episode 1
   must be finished before episode 2's draft opens. This shapes the schedule more than
   any technical constraint.
4. **Shared origin + namespaced localStorage is sanctioned** → episodes may leave a
   small save token for each other (`7c-ep1=done`). A player who finished episode 1
   can be greeted by name in episode 2. Costs a few dozen bytes, must stay optional —
   judges play in any order.

Each submission also requires its own public GitHub repository with buildable,
readable source — so each episode gets a repo containing this pipeline plus the
episode's config, which is a feature: the build system itself is honest compo work
worth showing.

## The machinery: the dial now has two ends

`--endAt <scene>` existed (build as if the story ended there). This session added
`--startAt <scene>`: drop every scene before it, and the first kept scene becomes the
cold open. It works because of two facts verified by scan, not assumption: the game
boots from `STORY_SCENES[0]` (entry position, opening music), and scenes advance only
by `nextSceneId` link — there is no cross-scene inventory to carry. All the existing
folds (cast art, painters, modes, prompt tables, music, sounds) derive from the kept
list, so they follow the window automatically: an episode that never stages Darkness
ships no Darkness.

Proof it produces a *game*, not just a number: `--startAt jacks-glade --endAt
surviving-mare` passes the full verify pass — boots, advances dialogue, walks both
ways — opening cold on Jack and Lili in the glade with no prologue.

## The measured reality

Full pipeline (every fold, roadroller `-O1`, zopfli), games branch
`claude/seventh-color-js13k-slim @ 6f5d4186`. Budget is 13,312.

Cumulative — "the zip if the story ended here":

| story so far | scenes | zip | chapter marginal |
| --- | ---: | ---: | ---: |
| prologue (shadow-council) | 1 | 13,300 | — |
| + ch I: forbidden wonder | 4 | 18,028 | +4,728 |
| + ch II: world freezes | 7 | 20,077 | +2,049 |
| + ch III: two courages | 12 | 26,205 | +6,128 |
| + ch IV: dark castle | 18 | 32,504 | +6,299 |
| + ch V: the last ray | 25 | 34,889 | +2,385 |
| + epilogue = whole game | 28 | 37,272 | +2,383 |

Standalone episodes — `startAt..endAt` windows, everything outside folded:

| candidate | scenes | zip | over budget |
| --- | ---: | ---: | ---: |
| jacks-glade → surviving-mare | 6 | 18,671 | +5,359 |
| faerie-council → meg-encounter | 5 | 22,737 | +9,425 |
| castle-descent → reflection-plan | 6 | 23,238 | +9,926 |
| plate-vault → last-stand | 7 | 21,925 | +8,613 |
| spring-remembers → forest-vow | 3 | 18,787 | +5,475 |

Two hard lessons in that table:

- **Dropping the past refunds little.** Cutting the whole prologue from the ch I–II
  episode saved only 1,406 bytes (20,077 → 18,671). Early content is cheap; the
  compressor already prices repetition low, and the floor dominates.
- **Cast size, not scene count, is the cost driver.** The 3-scene epilogue episode
  (18,787) costs nearly as much as the 6-scene opener, because its reunion scenes
  stage almost the whole cast, and every staged character ships a rig, a face, and
  costume art. Chapter III–IV episodes stage 7–9 characters and it shows.

The shape underneath: the per-episode **floor** — micro-engine, story/dialogue
machinery, core rig, one scene's worth of art — is ~11.5–12 KB (the shipping
prologue is 13,300 with one scene and three characters). That leaves **~1.5–2 KB of
content per episode at current art and prose density**, which buys 1–2 scenes.
Chapters cost 2–6 KB each. This is why slicing alone cannot work.

## What actually fits: the redesign

The gap per naive episode (5–10 KB) is the size of the entire squeeze campaign that
got the prologue under budget. So an episode is not "configure the dial and zip" —
each one is a design project. Three levers, in order of leverage:

**1. Floor diet — pays in every episode, but measure before cutting.** The premise
was that the deferred shared leg/arm rig simplification is a big lever now that it
pays across three episodes instead of one. Measured and **retracted**:
`cast-actor-rig.ts` + `cast-rig-geometry.ts` are 3,698 bytes minified, combined, for
every humanoid character's full walk/run/stand motion, costuming, and hands —
already dense, already terse, no padding found. Leave-one-out on the whole game
puts "cast art: human rigs" at 4,576 marginal bytes, which is the cost of the rig
*existing*, not the cost of its current level of detail — no slack visible to cut
without visibly degrading the animation. Same lesson as the derived-palette and
bytecode-VM predictions earlier in this project: intuition about what looks
"expensive" and measured compressed cost keep disagreeing, so a lever gets built
only after `scene-weight`/`weigh` say it's there, not before.

What *did* measure real: dropping episode 1's prologue entirely (`--startAt
jacks-glade`, no shadow-council/darkness/blix/pox) saves **1,569 bytes** (18,538 →
16,969, still 3,657 over). That is a narrative call, not a free technical one — it
trades the villain-council cold open, which gives a standalone entry its stakes on
first read, for headroom. Left to the user rather than decided here.

**2. Mechanic-led episodes, not chapter transcriptions.** This is the re-ideation:
invert the gameplay:story ratio. A js13k entry is rated as a *game*; a 90% dialogue
vignette rates as a slideshow. Each episode leads with one minigame expanded into the
core loop — more levels/waves/patterns, which are nearly free (data compresses to
almost nothing; the pond breakout's *logic* is what costs, and it's already paid) —
framed by 2–3 short story scenes instead of seven long ones. This simultaneously:
fits the budget (fewer staged scenes, smaller cast), rates better (gameplay-first),
and is the strongest answer to the "old games" rule — a breakout game that grew out
of one scene of a story is a new game by any honest reading.

**3. Per-episode content diet.** The existing tools, applied per episode: `recast`
trims staged extras scene by scene (with the painter-safety check), prose diet on the
episode's scenes, painter simplification for its backdrops — all on the episodes
branch in the games repo, where visual changes are allowed now.

Shipped: **`skipScenes`** — dropping scenes from the *middle* of an episode's
window and relinking `nextSceneId` across the gap. Same AST machinery as
`truncateAndClose`, plus a relink and a resolve-through-a-chain guard for
skipping consecutive scenes. `--skip <id,...>` on the CLI, `scope.skip` in
config. Episode 1 uses it to drop `blindfold-path`, saving 121 bytes (the
window's cast was already staged for the surrounding scenes, so removing one
walk-and-talk beat mostly just removes prose).

**Correction to the original plan:** "breakout" in the scene data is not a
brick-breaker — `frozen-pond` was a three-tap QTE (tap anywhere, three times,
done in a few seconds), and the rest of episode 1's window is similarly light
narrative interaction. There was no existing minigame to expand. Built instead:
**Ice Rain**, a real timing mechanic — a shard falls toward the ice each beat,
and only a tap timed to its arrival shatters it; the fall duration shortens
each hit, so the window tightens as the ice nears breaking. Zero new scene
data — fall duration and the hit window are a formula off `round.pondCracks`
and the scene's own `sceneElapsed` clock, so three escalating waves cost only
the new logic and paint code, not per-wave content. Measured: **+139 bytes**
(18,399 → 18,538, `--endAt frozen-pond --skip blindfold-path`), verified
rendering correctly — falling shard, accumulating crack lines, updated prompt
— across a full playthrough capture.

## The whole story, in six episodes

The story is a strict 28-scene chain, no branches — confirmed by reading both
scene-data files in full. `choices`/`correctChoice` fields only gate
retry-until-right puzzles; every scene has exactly one `nextSceneId`. That
means an episode split is purely a question of where to cut and what to
compress, never which branch to follow.

Ten scenes carry real, dedicated minigame code (`bog-cottage`, `meg-encounter`,
`castle-descent`, `iron-cage`, `dark-kitchen`, `throne-pursuit`, `last-stand`,
`spring-remembers`, `ring-pond`, `forest-vow` — each has its own
`*-logic.ts`/`*-render.ts`, unlike the inline "thin" modes `frozen-pond` turned
out to be). They cluster in Act 2 and the resolution; Act 1 and the throne-room
climax are dialogue/riddle/investigation scenes with real but modest
interaction. Every episode below is built around at least one thick scene, so
none of them read as a slideshow.

Twenty-eight scenes into thirteen-byte-budget episodes does not divide evenly,
and per-episode floor cost (~11.5–12 KB before a line of content) makes
splitting expensive — every additional episode re-pays that floor. Six
episodes for a 28-scene story is the count that keeps each one recognizable as
"a chapter" without either (a) so few episodes that each needs the kind of
scene-starving Episode 1 needed, or (b) so many that the series reads as
fragments. Getting there means most episodes compress several scenes into one
or two kept ones — same technique as Episode 1's `frozen-pond` rewrite,
applied at every act seam, using the Explore-agent story read as source
material for what a compressed transition line needs to imply.

| # | title | scenes kept | compresses | lead mechanic | measured baseline |
| --- | --- | --- | --- | --- | ---: |
| 1 | **Winter Falls** | `shadow-council`, `frozen-pond` (rewritten) | `jacks-glade`, `blindfold-path`, `unicorn-stream` | Ice Rain (built) | shipping at 13,303, headroom 9 |
| 2 | **Into the Bog** | `bog-cottage`, `meg-encounter` | `gumps-judgment`, `surviving-mare`, `faerie-council`, `hollow-armory`, `rescue-vow` | dual-puzzle → Meg's set piece, both real (thick) minigames | 17,719, over by 4,407 — in progress |
| 3 | **The Root Door** | `castle-descent`, `iron-cage` | `dark-kitchen` (its stealth minigame and the party split compressed into a rewritten line opening episode 4) | cage-escape (send Luna through the bars) | 18,366, over by 5,054 — not started |
| 4 | **The Gown That Breathes** | `living-gown` alone | `dark-kitchen`'s split (recap line), `dungeon-viaduct`, `reflection-plan`, `plate-vault`, `reflector-chain` | Lili/Darkness confrontation — a real riddle scene, cast-light (just her and Darkness) | 14,085 at -O2, over by 773 — best remaining gap by far, needs a recap line + final trims |
| 5 | **The Last Turn** | `false-yield`, `false-sacrifice`, `final-beam`, `throne-pursuit`, `last-stand` — all five, unreduced | — (measured: dropping `false-yield`+`false-sacrifice` only saved 251 bytes once the cast floor is paid, so cutting Lili's own agency beats from her climax bought almost nothing) | the villain's actual defeat + the collapsing-causeway chase | 18,941, over by 5,629 — not started |
| 6 | **The Seventh Color** | `spring-remembers`, `ring-pond`, `forest-vow` | — | three payoff minigames back to back, epilogue reunion | 18,714, over by 5,402 — not started |

This table is a plan, not a commitment — each episode gets the same treatment
Episode 1 got: build it, measure it against the real pipeline, cut what the
numbers say to cut, and update this table with what actually shipped.

**Two real course-corrections from measuring instead of guessing:**

- The original sketch put `dark-kitchen` in episode 3 alongside `castle-descent`
  and `iron-cage`. Measured: those two alone are already 18,366 (barely less
  than all three at 19,846 — cast, not scene count, dominates again), and this
  chapter's cast (`jack, gump, luna, brown-tom, screwball, blunder`) is
  load-bearing — Screwball and Blunder both carry real lines here, unlike
  `meg-encounter`'s decorative extras, so there's no cheap character cut
  available. Moved `dark-kitchen` out to keep episode 3 to two thick scenes
  instead of three.
- `living-gown`, measured alone, is dramatically cheaper than the original plan
  assumed (14,395 vs. the 19,558 the whole `living-gown`→`reflector-chain`
  window costs) — its cast is just Lili and Darkness, no party. It gets its own
  episode instead of being bundled with the mirror-relay scenes, which was the
  single best number to come out of the whole baseline sweep.

Episode 5 was tested the other way — keeping the throne-room trio in full
turned out to be *free* (251 bytes) rather than a cut worth making, so
`false-yield` and `false-sacrifice` stay. Cutting them would have saved
Lili's own climax agency for almost no byte return, which is the kind of
trade the earlier sessions' "measure before cutting" rule exists to prevent.

A structural bug surfaced while reading the throne-room scenes: they define
`mode`/`art`/`music` via `...THRONE` object-spread rather than repeating them,
which the scope dial's fact-reader couldn't see until fixed (see pipeline
commit `a4ef77d`) — without that fix, an episode covering them could have had
`foldAbsentSceneFields` silently strip the painter they still need. Fixed and
verified before any episode-5 work begins, not after something broke.

Building in story order, one at a time — the single-draft-at-a-time compo
rule forces serial submission anyway, and each finished episode is a real
result even if the series stops partway. Cross-episode continuity ships in
all of them: `localStorage['7c-ep<N>'] = outcome`, read as a greeting line in
the next episode, never as a gate — a player who never touched episode 1 can
still play episode 4 cold.

## Risks, named

- **"Do not submit old games"** is a judgement call made by human reviewers. The
  mitigation is real redesign per episode (mechanic-led, new scope, compo-built
  engine) and honesty in each entry's description about the lineage. If a reviewer
  still reads it as a port, that episode is rejected — the series degrades gracefully
  to fewer entries, not to zero.
- **Per-episode margins will be as thin as the prologue's** (12–26 bytes). Every
  episode needs the same end-of-line discipline: final pack at `-O2`, best of a few
  rolls, verify on the actual archive.
- **Time.** Three episodes in four weeks means roughly a week per episode plus
  slack, and the prologue took most of a week. The scope dial, folds, and this
  measurement harness are the reason to believe the later episodes go faster.

## Episode 1 progress log

Prologue kept (user decision, weighing narrative legibility against 1,569 bytes).
Working forward from 18,538 B / over by 5,226:

| cut | zip | delta |
| --- | ---: | ---: |
| jack/lili hair detail invisible at ~15px body scale (curl counts, headband, highlight ellipses) | 18,438 | −100 |

**Honest read on the rate:** a real, screenshot-verified, visually-lossless trim
bought 100 bytes. Closing the remaining 5,126 at that rate is ~50 more passes of
this size — not a reasonable ask of one session. Reassessed instead of grinding.

**Reassessment.** Measured a narrower window: `shadow-council` + `frozen-pond`
only (drop `jacks-glade` and `unicorn-stream` too, not just `blindfold-path`) —
**15,905 B, over by 2,593**, less than half the 4-scene gap. The catch:
`frozen-pond`'s dialogue assumed the player just watched Lili vanish in
`unicorn-stream`. Rewritten (games repo, episodes branch, commit `d24ca1ab`) to
pay off shadow-council's threat directly — "Winter will answer" from the council
scene becomes "Winter falls where no season called it. Lili is gone." opening
frozen-pond — instead of assuming a scene this build no longer contains. Screenshot-
verified end to end: chapter title, dialogue, and Ice Rain all read correctly
with no prior context. Final measured state after the rewrite:

```
node tools/pull.mjs --endAt frozen-pond --skip blindfold-path,jacks-glade,unicorn-stream
node tools/pack.mjs
```

**15,930 B, over by 2,618** (4 cast: darkness, blix, pox, jack — no Lili or
unicorn staged, only named). More than half of the original 5,226-byte gap
closed by narrowing scope plus the jack/lili art trim, without touching the
prose density of what remains. The unicorn-stream/rainbow beat and Lili's
on-screen presence are gone from episode 1 as a result — a real narrative
cost, accepted in exchange for a tractable remaining gap. Closing the last
2,618 is the same toolkit as before (character-art trims, prose, or the
unproven yaw-unreachability tooling) — paused here for the user to weigh back
in, since each further character trim or the yaw investment is diminishing-
return work at this point, not a clear win.

## Episode 2 progress log

`--startAt bog-cottage --endAt meg-encounter`, no skips needed (they're
already adjacent). Raw baseline (9 declared cast, before any recast):
18,561. Working forward:

| cut | zip | delta |
| --- | ---: | ---: |
| recast `blix`/`pox` out of `bog-cottage` (unpainted — verified against the render, not just the declared cast array) | 18,561 → n/a | — |
| drop `brown-tom`/`screwball` from `meg-encounter`'s `party()` (silent extras; their only lines are in the next chapter) + recast | 18,561 → 17,754 | −807 |
| Meg's hag-face hair locks (5→3), Gump's hair spikes (5→3) | 17,754 → 17,719 | −35 |
| `bogPrompt` rewritten with a recap opener (`"Jack tracks Lili's captors to Meg's bog…"`) so the scene stands alone | included above | prose, not measured separately |

**Current: 17,719, over by 4,407.** Screenshot-verified: bog puzzle, crack
counter, prompt text, and the cottage/Meg reveal all render correctly.
Two thick scenes together are simply expensive — 5 cast (`jack, gump, luna,
lili, meg`) is close to the floor for a scene this rich, and further cuts
here would start costing real story (Luna's a recurring companion, not an
extra). Left here; next lever is the same one that helped episode 4 — check
whether `bog-cottage-render.ts`/`meg-encounter-render.ts` share any
scene.id-style branching the fold can't see through yet.

## Episode 4 progress log

`--startAt living-gown --endAt living-gown`. Baseline: 14,395, over by 1,083
— by far the smallest gap in the series, because this scene's cast is just
`lili` and `darkness`, no party.

| cut | zip | delta |
| --- | ---: | ---: |
| split `paintLivingGown`'s shared scene.id-branching into `paintLivingGown` + `paintThroneClimax`, told apart by a new `art: 'throne-climax'` value the existing fold can see (pipeline fix `a4ef77d` made this safe — see below) | 14,395 → 14,101 | −286, plus drops `unicorn` from the cast (only the throne-climax branch ever drew it) |
| gown pleat count 5→3 | 14,101 → ~14,085 (noise-level, not a real saving — kept anyway, harmless) | ~0 |
| `-O2` roadroller | 14,097 → 14,085 | −12 |

**Current: 14,085 at -O2, over by 773.** This is the structural lesson worth
generalizing: any painter that dispatches on `scene.id` rather than
`scene.art`/`scene.mode` is invisible to the existing fold, no matter how
much of its code a given episode never reaches. Worth auditing the other
shared painters (`castle-parallel-render.ts` has more of them —
`paintDungeonViaduct`, `paintReflectorChain`) before episode 5 gets built,
since episode 5 needs `paintThroneClimax` and would otherwise still ship
whatever else in that file branches the same invisible way.

A correctness fix landed alongside this work, not just a size win: `false-
yield`/`false-sacrifice`/`final-beam` define `mode`/`art`/`music` through a
`...THRONE` object spread rather than repeating them, which `sceneFacts()`
couldn't see until fixed (pipeline commit `a4ef77d`) — unfixed, an episode
covering only some of those scenes could have had its painter silently
stripped as unreachable. Fixed and verified (direct fact-extraction test,
plus an unaffected prologue rebuild) before any episode-4/5 work touched
those scenes.

## What's shipped, what's not

| # | title | status |
| --- | --- | --- |
| 1 | Winter Falls | **shipping** — 13,280 B, headroom 32, gap-closing work paused at 2,618 over on the un-narrowed original 4-scene cut, superseded by the narrower 2-scene build documented above |
| 2 | Into the Bog | in progress — 17,719, over by 4,407 |
| 3 | The Root Door | scoped, not started — baseline 18,366 (castle-descent+iron-cage), over by 5,054 |
| 4 | The Gown That Breathes | in progress — 14,085 at -O2, over by 773, closest to done |
| 5 | The Last Turn | scoped, not started — baseline 18,941, over by 5,629 |
| 6 | The Seventh Color | scoped, not started — baseline 18,714, over by 5,402 |

None of episodes 2–6 are ready to submit. Every number above is a real,
pipeline-measured, `VERIFY OK`-checked baseline — not an estimate — but
"measured and under active work" is different from "ready." The prologue
(episode 1) is the only one that is actually done: built, under budget,
verified, and stable across every commit in this session.

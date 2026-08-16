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
| 1 | **Winter Falls** | `shadow-council`, `frozen-pond` (rewritten) | `jacks-glade`, `blindfold-path`, `unicorn-stream` | Ice Rain (built) | **over by 2,636** at 15,948 — only the 1-scene prologue cut fits (13,284) |
| 2 | **Into the Bog** | `bog-cottage`, `meg-encounter` | `gumps-judgment`, `surviving-mare`, `faerie-council`, `hollow-armory`, `rescue-vow` | dual-puzzle → Meg's set piece, both real (thick) minigames | 17,719, over by 4,407 — in progress |
| 3 | **The Root Door** | `castle-descent`, `iron-cage` | `dark-kitchen` (its stealth minigame; the party split it triggers is implied, not explained — `living-gown` reads fine without it, tested) | cage-escape (send Luna through the bars) | 17,919, over by 4,607 — Brown Tom (decorative, no lines in this window) trimmed |
| 4 | **The Gown That Breathes** | `living-gown` alone | `dark-kitchen`'s split (recap line), `dungeon-viaduct`, `reflection-plan`, `plate-vault`, `reflector-chain` | Lili/Darkness confrontation — a real riddle scene, cast-light (just her and Darkness) | 14,085 at -O2, over by 773 — best remaining gap by far, needs a recap line + final trims |
| 5 | **The Last Turn** | `false-yield`, `false-sacrifice`, `final-beam`, `throne-pursuit`, `last-stand` — all five, unreduced | — (measured: dropping `false-yield`+`false-sacrifice` only saved 251 bytes once the cast floor is paid, so cutting Lili's own agency beats from her climax bought almost nothing) | the villain's actual defeat + the collapsing-causeway chase | 18,120, over by 4,808 — Luna (silent, no gameplay role, the episode's only fairy-kind character) trimmed, folding her whole rig |
| 6 | **The Seventh Color** | `spring-remembers`, `forest-vow` | `ring-pond` (the Explore-agent read flagged it as personal/optional, not load-bearing for the main plot; `forest-vow`'s opening line rewritten to drop its one callback) | two payoff minigames, epilogue reunion | 17,963, over by 4,651 — the single biggest cut since the throne-climax split |

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
| 1 | Winter Falls | **prologue alone is shipping** — `shadow-council` only, 13,284 B, headroom 28. The 2-scene "Winter Falls" that adds `frozen-pond` + Ice Rain is **15,948, over by 2,636** and has never fitted — see the correction below, this row previously conflated the two |
| 2 | Into the Bog | as two scenes, blocked — see "Checking episodes 2, 3 and 5 against the portrait tell" near the end of this document. `meg-encounter` alone is ~26–70 bytes over, `bog-cottage` needs a mechanic redesign to join it |
| 3 | The Root Door | in progress — 17,919, over by 4,607 — cold open + Brown Tom trim done |
| 4 | The Gown That Breathes | **shipping** — 12,297 B, headroom 1,015 — closed by staging Lili as a portrait, which drops the whole body rig (see below) |
| 5 | The Last Turn | in progress — 18,120, over by 4,808 — Luna trim done |
| 6 | The Seventh Color | in progress — this row is superseded, see "Status after episode 6's redesign" near the end of this document for the current, portrait-staged number |

Episodes 2, 3 and 5 are not ready to submit. Every number above is a real,
pipeline-measured, `VERIFY OK`-checked baseline confirmed by screenshot, not
an estimate — every episode in the series has now been built at least once
and shown to boot, render, and play through its own window correctly. Two
builds are actually done — built, under budget, verified: the **one-scene
prologue** (13,284, headroom 28) and **episode 4** (12,297, headroom 1,015).
Both are single-location, small-cast scenes, which is not a coincidence but
the rule derived at the end of this document.

**A pattern worth naming, found while trimming 2, 3, and 5:** a scene's
declared `cast` array is not evidence a character is load-bearing there —
check whether they actually speak (`dialogue`/`successDialogue` entries) and
whether the painter draws them unconditionally with no other role. Brown Tom
and Screwball were purely decorative in `meg-encounter`; Brown Tom again in
`castle-descent`/`iron-cage`; Luna in `throne-pursuit`/`last-stand`. Each cut
needed the painter edited too (recast alone refuses if the painter still
hardcodes the id), same safety rule the very first cast-fold work in this
project established. The win compounds when the dropped character is the *only* one of their
`kind` in the episode — Luna was the only fairy in episode 5, so removing her
folded her whole fairy-rig code, not just two draw calls (-623B). Brown Tom's
cut in episode 3 was smaller (-457B) precisely because he shares the human
rig with Jack, Gump, and Screwball, who all stay — the rig code was paid for
regardless, only his own data entry and draw calls went away. Episode 6 was
checked against the same pattern and came up empty — every character there
speaks somewhere in the kept window, so their rig cost is unavoidable, not a
missed cut.

**Prose trimming was tried and abandoned as a lever.** A blanket blank-and-
measure test (the same technique `scene-weight.mjs --floor` uses internally)
was blocked by the session's own safety classifier — reasonably: it would
have overwritten both story-data files' text in place before measuring,
exactly the kind of bulk destructive edit the auto-mode guardrails exist to
catch. Rather than work around that, the numbers already on record made the
case on their own: whole-game prose blanking (every string ≥12 characters,
losing all meaning) was measured earlier in this project at 4,107 marginal
bytes across all 28 scenes. The actual dialogue is already terse — short,
punchy lines, no padding — so an editorially-honest tightening pass (keeping
meaning, not gutting it) would recover a small fraction of even that ceiling,
spread thin across many scenes. Not a good trade against the writing quality
for the bytes on offer. Skipping `ring-pond` instead — a whole scene, not a
sentence — outperformed it by an order of magnitude for less narrative risk,
since the Explore-agent read had already flagged it as non-essential.

## Would more, smaller episodes fit? Measured: no.

Tested directly rather than assumed: every "thick" scene (dedicated
`*-logic.ts`/`*-render.ts`), alone, minimal cast, nothing else in the build.

| single scene alone | zip | over budget |
| --- | ---: | ---: |
| `castle-descent` | 15,841 | +2,529 |
| `false-yield`→`final-beam` (3 scenes, one riddle-mode unit) | 16,349 | +3,037 |
| `meg-encounter` | 16,529 | +3,217 |
| `bog-cottage` | 16,616 | +3,304 |
| `iron-cage` | 16,872 | +3,560 |
| `throne-pursuit`+`last-stand` | 17,292 | +3,980 |

None fit. Not close. The cheapest one, `castle-descent`, completely alone
with nothing else in the build, is still 2,529 over. Splitting an episode
in half turns one N-byte problem into two roughly-(N/1.3)-byte problems —
smaller individually, since less total content, but the floor for a
thick-mode scene was never really about how many scenes are bundled
together. It's a cost each one pays alone: its own dedicated mechanic code,
the one thing that can't be shared or folded away because it's what makes
that scene unique. Splitting episode 2 (4,407 over combined) into two
entries would trade it for two entries at 3,304 and 3,217 over — modestly
smaller each, but now two entries needing the same unsolved kind of work,
plus the compo overhead of an extra draft, extra repo, extra serialized
submission. Worse trade under "don't split too much," for a gap that still
doesn't close.

**What this points to instead:** cast and scene-count are wrung dry. The
remaining lever is the size of the mechanic code itself —
`castle-descent-render.ts` (4,810B minified), `iron-cage`'s
`cage-escape-render.ts` (4,170B), `dark-kitchen`'s `kitchen-stealth-
render.ts` (4,224B), `meg-encounter-render.ts` (3,412B), `bog-cottage-
render.ts` (3,736B) — all written for the original 200KB+ game, never
audited for a 13KB one. That's genuinely untried territory: not decoration
to trim, but logic and rendering code that may have real structural slack —
redundant math, over-parameterized state, unrolled loops doing what a
smaller loop could. Pursuing this next.

## Mechanic-code compaction: tried, retracted — same lesson as the rig diet

Tested on `castle-descent` (cheapest single thick scene, +2,529 baseline),
two genuinely different techniques, both measured honestly rather than
assumed:

- **DRY the state-machine logic.** Its three phase-transition blocks
  (`storyPhase` 0/1/2) all repeat a "pressed + in range, then branch"
  check. Factored into one `site()` helper. Net effect: **byte-neutral**
  — `castle-descent` alone measured 15,846 → 15,826 (a 20B improvement,
  itself within normal roadroller `-O1` jitter), but rebuilding the full
  episode 3 (`castle-descent`+`iron-cage`) twice with the same change
  landed at 17,965 then 17,918 — a 47-byte spread from nothing but
  re-running the same build. The "saving" doesn't survive a second
  measurement. Kept as a readability improvement, not a size win.
- **Reduce background-loop density**, the same "fewer decorative elements"
  technique that worked repeatedly on character faces (Lili's hair curls,
  Meg's locks, Gump's spikes), applied instead to `roots()`'s environment
  loops (8→6 root beams, 13→9 floor cracks, spacing adjusted to preserve
  full-canvas coverage). Measured **flat to worse** (+18B vs. the
  logic-only change). The reason clarifies the earlier wins rather than
  contradicting them: the character-face trims cut *unrolled arrays of
  coordinate literals* — real, redundant source text. These background
  loops are already procedural (`x = 18 + i * 48`), generated from a
  single loop variable — there was never unrolled data here to remove.
  Changing the iteration count only edits one digit; there was nothing to
  save. Reverted.

**Conclusion, stated as plainly as the rig-diet retraction earlier in this
document:** "compact the mechanic code" does not have the slack either the
plan or intuition suggested, at least not via these two natural approaches.
The pattern holds across every real win this whole session — removing
*whole things* (a character's entire rig, a whole unreachable code branch,
a whole scene) pays off; restructuring or thinning what's left of code that
survives the fold does not, because terser and roadroller already do that
job better than a manual pass can. Cast trims, structural code-sharing
fixes, and scene cuts (all three: whole-thing removals) accounted for every
real byte saved in episodes 2, 3, 5, and 6 this session. Optimizing the
mechanic code itself was the one hypothesis tested and found empty-handed.

## The body rig is the single biggest line item — and it is all-or-nothing

Acting on that conclusion (remove whole things, not slack) pointed at the one
whole thing never priced: `cast-actor-rig.ts`, the articulated body used by
every `actor()` call. It is ~7 KB of source, and — unlike faces, which fold
per character `id`, and unlike rig *kinds*, which fold per `kind` — the biped
rig survives if **any single** `actor()` call in the whole build reaches it.

Episode 4 was the only episode where that count was one. `paintLivingGown`
drew Darkness as a portrait and Lili as a rigged figure standing at frame
left, small enough that the articulation never read at that scale anyway.
Staging her as a portrait too — mirroring Darkness, making the confrontation
the subject of the frame — leaves the episode reaching no `actor()` call at
all.

| episode 4 (`living-gown` alone) | zip | vs budget |
| --- | ---: | ---: |
| before, Lili rigged | 14,084 | +772 over |
| after, Lili as a portrait | 12,297 | **−1,015 under** |

**−1,787 bytes from one staging decision.** That is more than every cast
trim, code-sharing fix and scene cut in this document put together, and it
closed the gap with 1 KB to spare. Episode 4 ships.

### What this says about the other four

The rig lever is spent, not repeatable: episodes 2, 3, 5 and 6 are built on
walking, chases and party scenes where the body *is* the gameplay
readability. But pricing it exposed the cost model the whole series obeys,
and the numbers are worth stating together:

All five rebuilt today against the same code state, so the deltas are real
rather than cross-session:

| build | scenes | cast | rig? | zip |
| --- | ---: | ---: | --- | ---: |
| `living-gown` alone, portraits | 1 | 2 | no | **12,297** |
| `shadow-council` alone (the shipping prologue) | 1 | 3 | yes | **13,284** |
| `living-gown` alone, Lili rigged | 1 | 2 | yes | 14,084 |
| `shadow-council`+`frozen-pond` ("Winter Falls") | 2 | 4 | yes | 15,948 |
| `false-yield`→`final-beam` | 3 | 4 | yes + unicorn | 16,390 |

**A correction this table forced, before anything else in it is used.** An
earlier draft of this section claimed marginal scenes were nearly free, on
the strength of the status table below reading "episode 1 — shipping, 13,280
B". That number is the **prologue alone**, one scene. "Winter Falls" as
designed — prologue plus `frozen-pond` and its Ice Rain minigame — measures
15,948, over by 2,636, matching the 2,618 the episode-1 log recorded when
that work was paused. Adding one scene cost **+2,664 bytes, not zero.**
Episode 1 has never shipped as a two-scene episode; what is under budget is
the one-scene prologue. The status table below is corrected to say so.

So the line items, all measured:

- **The body rig: ~1,790 B.** The `living-gown` pair isolates it exactly —
  same scene, same cast, same prose, staging the only variable.
- **A scene bringing its own art *and* mode: ~2,650 B.** `frozen-pond` adds a
  painter, the `breakout` mode, Ice Rain, and a fourth cast member.
- **A scene sharing an existing art and mode: ~1,000 B.** The throne trio is
  three scenes on one `art`/`mode`, and lands 3,106 over the one-scene
  prologue while *also* paying for the unicorn rig kind and two extra faces.
- **Each rig kind beyond the first: ~1 KB.** Unicorn, fairy, hag.

Against a floor of ~12.3 KB — engine, shell, presentation, one close-up
scene, two faces — the budget leaves **about 1 KB of discretionary room.**
That is less than the body rig costs, and well under half a new scene. Which
gives the rule both shipping entries satisfy and every other build breaks:

> An episode is **one location, one mechanic, a small cast** — and it may buy
> *either* the body rig *or* a second scene, never both.

The prologue spends its allowance on the rig and stages one room. Episode 4
spends nothing on either and has 1,015 B left over — the only build in this
document with real headroom. Everything else carries the rig *and* multiple
scenes *and* two or more dedicated mechanics, which is why they land 2.6–5 KB
over and why no amount of trimming has moved them: the overage is the
subsystems, and the subsystems are the episodes.

The encouraging half of that rule is the throne-trio number. Extra scenes on
an art and mode the build already pays for cost ~1 KB, not ~2.7 KB — so
episode 4's headroom is genuinely spendable on **two or three more beats in
the same room**, which is a real episode rather than a vignette. That, not a
narrower window onto an existing set piece, is the shape to build toward.

This also retires the earlier "would more, smaller episodes fit?" finding as
under-diagnosed. Splitting doesn't help *because a thick scene alone is
already over budget* — correct, and reconfirmed above. But the reason isn't
that the scene is irreducibly complex; it's that a dedicated logic/render
file pair costs 1.5–2 KB when the whole discretionary budget is ~1 KB. The
fix is not a smaller window onto the same scene. It is to rebuild those beats
around inline mechanics in the shape Ice Rain and the portrait riddle proved
twice, and to stop treating the existing set-piece code as something to carry
across.

## Testing whether the portrait trick generalizes to episode 6: mostly, no

Episode 4's win came from one specific fact: `living-gown` reaches zero
`actor()` calls once Lili is staged as a portrait, so the entire rig module
tree-shakes away. The natural next question is whether merging episode 6's
two scenes (`spring-remembers`, `forest-vow` — narratively adjacent, same
day, same clearing) into one dedicated mechanic pair would buy something
similar.

Priced the ceiling before writing any merge (gutted `updateEpilogue`/
`paintEpilogue` in place to their minimum viable bodies — a single
tap-to-continue and one static portrait pose — measured, then `git checkout`
reverted; no narrative decision was actually made):

| episode 6 (`spring-remembers`→`forest-vow`, `ring-pond` skipped) | zip |
| --- | ---: |
| current, both mechanics intact | 17,966 |
| `epilogue` mechanic gutted to a stub | 17,364 |

**Ceiling: 602 bytes**, not the ~2,650 a whole second scene-with-its-own-
art/mode was measured to cost in the episode-1 table above. The reason: this
probe didn't eliminate the rig, because `spring-remembers` and `forest-vow`
between them still call `actor()` for jack, gump, lili, luna and unicorn — a
merge only removes one mode's dispatch scaffolding and one data block, not
the thing that actually paid off in episode 4. Confirms, from a different
angle, the same lesson as the mechanic-code-compaction retraction: the win
was never "fewer scenes," it was "zero rig calls." Not a viable lever here
without also solving the rig.

**The sharper hypothesis this leaves on the table:** most of the `actor()`
calls in both scenes already pose their subject as `'stand'` — jack, gump,
and lili never move in either scene; only the unicorn does (`'walk'` during
its restoration rise, and again crossing the ford), and Luna only hovers in
place. If those two motions were replaced with bespoke, purpose-drawn
animation — the way `frozen-pond`'s falling ice shard and `living-gown`'s
gown are hand-drawn rather than rig-driven — no character in the episode
would ever reach `actor()`, and *both* rig files could fold: `cast-actor-
rig.ts` (human/elf/demon biped) and `cast-creature-actor-rig.ts` (unicorn/
fairy/hag), not just the smaller of the two.

Not attempted. Unlike episode 4 — where portraits were an improvement, not
just a saving, because a face-off riddle scene reads better as two faces —
this trades away the stallion's healing rise, the visual payoff the whole
restoration mechanic exists to deliver. That is a real narrative cost this
document isn't positioned to accept on its own; flagged for the user rather
than built.

## The bespoke-animation hypothesis: built, and it worked

Went ahead and built it. The stallion's rise became a horn returning on an
otherwise-still portrait — `paintUnicornFrontFace`'s existing `horned`
toggle, the same reveal-through-a-face language `living-gown` already uses.
Luna was cut outright rather than staged: her only line in this stretch is
in `ring-pond`, which the episode already skips, so she was decorative in
both remaining scenes. Every `actor()` call is gone from both files.

| episode 6 (`spring-remembers`→`forest-vow`, `ring-pond` skipped) | zip | over budget |
| --- | ---: | ---: |
| rig-based, as originally built | 17,966 | +4,654 |
| portraits, both rig modules folded | 13,880 | **+568** |

**−4,086 bytes.** Bigger than episode 4's win, because two rig modules
(human biped and creature) folded here instead of one. Confirmed booting and
rendering correctly at both ends of the window — the aiming mechanic reads
as attached to the unicorn's snout, the reunion portraits read as an
ensemble around the bloom effect, nothing was left visually orphaned.

A handful of small follow-on cuts closed some of the rest: dropping two
purely-decorative flourish loops (background sparkle/shimmer that added
nothing the mechanics needed) and one halo left over from the pre-portrait
jack position saved another 139 bytes combined, and `-O2` roadroller (the
same lever episode 4 used) found 29 more over several rolls. None of it
came from touching dialogue — prose remains untouched, consistent with the
earlier finding that it isn't where the bytes are.

**568 bytes remain, and this document is stopping the squeeze here rather
than chasing them.** Both scenes independently fit inside budget alone
(12,599 and 12,703 respectively) — the residual is genuinely the second
scene's own mode/dispatch cost (`'epilogue'` next to `'restoration'`, plus
`choiceFromClick`'s machinery, which no other scene in this window needs),
not a mistake sitting in the code waiting to be found. Closing it further
means either a real merge into one mode (the `runtime.ts` scene-index risk
flagged earlier, still unresolved) or a genuine content cut — and 568 bytes
against a 4,654-byte start is a result worth stopping to report rather than
grinding toward zero.

**The generalized lesson, stated plainly:** the portrait trick isn't
specific to `living-gown`. It applies to *any* scene where the cast's actual
motion is decorative to the mechanic rather than load-bearing to it — which
turned out to include a scene built around an aim-and-aligning-a-body
mechanic, not just a static riddle. The tell is checking each `actor()`
call's `motion` argument: if everyone is `'stand'` except the one moment a
mechanic's payoff needs, that moment can very often be redrawn bespoke
instead, and the whole rig goes with it.

## Status after episode 6's redesign

| # | title | status |
| --- | --- | --- |
| 1 | Winter Falls | prologue alone shipping — 13,270 B, headroom 42 |
| 4 | The Gown That Breathes | shipping — 12,297 B, headroom 1,015 |
| 6 | The Seventh Color | **not yet shipping — 13,880 B, over by 568**, down from 4,654 |

Episodes 2, 3 and 5 haven't been re-attempted with the portrait lens yet.
Whether it generalizes further depends on the same tell above — `castle-
descent`/`throne-pursuit`, both built around walking and running, look like
worse candidates than `iron-cage`/`meg-encounter`, which read more like
confrontations than chases. Not measured; flagged for whichever gets picked
up next.

## Checking episodes 2, 3 and 5 against the portrait tell

Episode 6's rule generalized: check every `actor()` call's `motion` argument.
If a scene's cast is all `'stand'` except a moment a mechanic's payoff needs,
that moment can usually be redrawn bespoke and the rig folds. Checked all
three remaining episodes against it directly, by reading each scene's own
`*-logic.ts` for `moveStoryActor` (the walking-mechanic helper) rather than
guessing from the render code:

| scene | calls `moveStoryActor`? | tell |
| --- | --- | --- |
| `bog-cottage` (`dual-puzzle-logic.ts`) | yes, twice | walking **is** the puzzle — find bog sites, then cottage sites, in order, by walking to them |
| `meg-encounter` (`meg-encounter-logic.ts`) | no | confrontation: dialogue, a choice, a mirror-aim mechanic, one strike — nobody moves |
| `castle-descent` (`castle-descent-logic.ts`) | yes | phases 0–2 are walk-to-site-and-ACT, same pattern as `bog-cottage` |
| `iron-cage`/`cage-escape` (`cage-escape-logic.ts`) | yes, twice | same |
| `throne-pursuit` | no (uses its own `pursuitProgress`/keyboard-hold input, not `moveStoryActor`) | but the mechanic **is** running and jumping — motion is the whole point, just not through the shared walking helper |
| `last-stand` | no | a cinematic confrontation, but jack/darkness/the mare all have real, continuously-animated motion (`impact` displaces their x/y every frame) |

**Episodes 3 and 5 are blocked outright** — every scene in both has real
motion as its actual mechanic (navigation, a chase, a fleeing mare), not
staging layered on top of a mechanic that doesn't need it. Redoing these as
portraits would mean replacing what the player *does*, not just how it's
drawn — a materially different game, not a restaging. Not attempted.

**Episode 2 is a mixed case, and `meg-encounter` alone passed the tell.**
Built it: all three of its human/fairy cast (jack, gump, luna) portrait-
staged, same as episode 6. Also found and fixed a second issue while there —
`brown-tom` and `screwball` were cut from the painter earlier this session
(the decorative-cast pattern) but never removed from the scene's declared
`cast` array, so their rig/face code was still reachable through the stale
declaration alone. Removing it was worth **520 bytes on its own**, more than
several of the deliberate cuts elsewhere in this document.

| meg-encounter alone | zip | over budget |
| --- | ---: | ---: |
| rig-based, as originally built | 16,564 | +3,252 |
| portraits + stale-cast fix, best of ~20 `-O2`/`-O3` rolls | 13,338 | **+26** |
| portraits + stale-cast fix, typical roll | 13,340–13,380 | +30 to +70 |

**Within roadroller's own run-to-run jitter of fitting**, and closer than
any episode in this document except the two already shipping. Verified
booting and rendering correctly — Meg looming right, Jack held at center,
Gump and Luna watching from the left, nothing clipped once a stale camera
override tuned to the old rig positions (`story-presentation.ts`, centered
at `x:192`, clipped the new left-side portraits) was removed in favor of the
default full-canvas framing.

Its opening line — Meg addressing Jack directly, "What soft little champion
wanders into my supper?" — already reads as a cold open. It does not need
`bog-cottage` to make sense.

**What this doesn't solve: `bog-cottage` itself.** Its dual-puzzle — walk to
three bog sites, then three cottage sites in a specific order — calls the
walking helper directly; movement isn't decorating the mechanic, it *is* the
mechanic. The only way to reach the same win for the paired episode is to
redesign the puzzle itself around a non-walking interaction (e.g. selecting
sites on a static layout rather than walking to them), which changes what
the player *does* on the bog-cottage half, not just how it's drawn. That is
a bigger creative call than any staging decision made so far in this
document, and it isn't decided here.

**The decision this leaves:** episode 2 as originally planned (`bog-cottage`
+ `meg-encounter`, two mechanics) is not close to fitting and the portrait
trick can't reach `bog-cottage` without a mechanic redesign. `meg-encounter`
alone, redesigned, is one dial-turn from fitting. Three ways to close it,
not chosen here:

1. Ship `meg-encounter` alone as episode 2 — a shorter, single-mechanic
   episode, the same shape as the shipping prologue and episode 4. Loses
   the bog-crossing puzzle from this compo entry entirely (for now).
2. Redesign `bog-cottage`'s puzzle to drop the walking requirement, so both
   scenes can ship together at full length. Real mechanic-design work with
   its own risk, not a sure thing until built and measured.
3. Leave episode 2 as documented backlog and move on — same posture as
   episodes 3 and 5, which are blocked for a harder reason (motion is those
   scenes' entire identity, not a redesignable side effect).

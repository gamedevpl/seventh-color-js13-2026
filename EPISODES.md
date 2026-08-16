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

## The proposed series

Three episodes, each led by its strongest mechanic, each with its own theme hook
(the story *is* the rainbow's stolen seventh color; the unicorn features in 1 and 3):

| # | title | window (distilled) | lead mechanic | measured / starting gap |
| --- | --- | --- | --- | ---: |
| 1 | **The Frozen Pond** | shadow-council → frozen-pond, skipping blindfold-path | Ice Rain (built) | 18,438 B, over by 5,126 — see progress log below |
| 2 | **The Dark Castle** | castle-descent → dark-kitchen, recap card for ch III | kitchen stealth + cage escape | measured 23,238 undistilled; the deep-cut episode |
| 3 | **The Last Ray** | reflector-chain → forest-vow, heavy cast trim | reflector relay + last stand | measured window subsets 18–22 KB undistilled |

The other two episodes carry the same lesson: audit what their scene's `mode`
actually does — via `story-slice-logic.ts`, not the mode name — before
promising an "expansion" of it. Kitchen stealth, cage escape, the reflector
relay and last stand each have dedicated `*-logic.ts`/`*-render.ts` modules
(unlike breakout's inline handling), which is a good sign they're real enough
to build on rather than replace — but that should be confirmed, not assumed,
before their budgets are planned around it.

Episode 1 first, end to end, before episode 2 begins — it has the smallest measured
gap, it reuses the already-shipped prologue work, and the single-draft rule forces
serial delivery anyway. Landing it validates the distillation levers with real
numbers before the harder episodes commit to them. If the compo deadline (13 Sep)
arrives mid-series, a finished episode 1 + 2 is a result; five half-episodes are not.

Cross-episode continuity ships in all of them from day one (write the token even if
no earlier episode exists to read it): `localStorage['7c-ep<N>'] = outcome`, read as
a greeting line, never as a gate.

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
this size — jack, lili, and the unicorn each have room for one or two more
(unexamined so far: the unicorn's front-facing paint path, `paintFrontUnicorn`,
never fires in this episode since every `actor()` call here uses yaw ±90°, but
the scope dial has no way to prove a runtime yaw value unreachable the way it
proves a scene mode unreachable — that would need new tooling, not just an edit).
Past the easy visual trims, the remaining gap is prose (narrative cost) or a
genuine engine-level cut (none found yet — see the retracted rig lever above).
Next step is the user's call: keep grinding per-character trims, accept a
narrower episode window, or take the prologue-drop trade after all.

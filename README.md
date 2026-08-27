# js13kGames 2026 — two entries

This repo holds two finished js13kGames 2026 entries. They share a build,
measurement and verification toolchain and **nothing else**: separate source
trees, separate game code, separate budgets, separate size gates. Both are
written to the 2026 theme, *rainbows and unicorns*.

| entry | source | zipped | limit | write-up |
| --- | --- | ---: | ---: | --- |
| **The Seventh Color** — a twelve-beat story game with four playable mechanics | `native/src` (9 files) | **12,160** | 13,312 | [`NATIVE.md`](./NATIVE.md) |
| **Rainbow Surfer** — a 3D coaster chase where speed is a resource | `strands/src` (6 files) | **13,298** | 13,312 | [`RAINBOW-SURFER.md`](./RAINBOW-SURFER.md) |

Rainbow Surfer's pack is a range, not a fixed number: roadroller `-O2` runs a
randomised search, so consecutive ship builds of identical source measured
13,298, 13,312 and 13,314. The table quotes the
smallest of three: pack repeatedly and submit the best. This is the procedure,
not a nicety.

Rainbow Surfer: <https://js13kgames.com/2026/games/rainbow-surfer>

Neither game depends on anything at runtime — no libraries, no assets, no
network. The Seventh Color is raw canvas 2D with a hand-rolled tracker; Rainbow
Surfer is raw WebGL with one shader program and a course generated fresh every
run.

## Building

Each game builds through the same tools, selected with `--game`:

| command | what it does |
| --- | --- |
| `npm run native` | build The Seventh Color |
| `npm run native:gate` | its full release gate: puzzle checks, a scripted playthrough, coverage, worst-of-5 pack, verify, soak |
| `npm run strands` | build Rainbow Surfer |
| `npm run strands:gate` | its release gate: course invariants, motion smoothness, worst-of-5 pack, verify |
| `npm run strands:ship` | the submission build — roadroller at `-O2`, which is worth ~32 bytes over `-O1` and far too slow to iterate on |

Add `--cheats` to any build for the DEV probes the live measurement tools read;
they compile out of a shipping build entirely.

### The measuring tools

Most of what this project got right came from building a probe rather than
arguing about a feel. They all drive the real page in headless Chromium and read
telemetry back out of it:

| tool | the question it answers |
| --- | --- |
| `tools/verify-native.mjs` | does the zip that would actually be submitted boot, and survive being played? |
| `tools/test-balance.mjs` | is the run winnable — and, with `--idle`, is it winnable *without playing*? |
| `tools/test-touch.mjs` | can you steer with a thumb, two fingers included? |
| `tools/test-shell.mjs` | at a phone's size, is the page a game - or a document that selects and zooms? |
| `tools/test-resume.mjs` | does the music survive the player switching away from the game and coming back? |
| `tools/test-portrait.mjs` | held upright, the game turns itself — do the touch zones follow the picture? |
| `tools/test-unlock.mjs` | is the audio context built inside the touch, which is the only way a phone starts sound? |
| `tools/test-audio.mjs` | is there sound where there should be, silence where the browser demands it, and is the in-game track still intact? |
| `tools/test-course.mjs`, `test-smooth.mjs`, `test-cam.mjs`, `test-fov.mjs`, `test-bank.mjs`, `test-dust.mjs` | course invariants, motion, camera and effect geometry |
| `tools/test-fps.mjs` | what an effect costs in frames |
| `tools/shots.mjs` | promo frames, rendered at twice the game's own resolution |

## The shared toolchain

esbuild → terser (whole-program property mangling) → roadroller (self-extracting
pack) → zip. The zip writer is ours rather than `zip -9`: one entry, no extra
fields, zeroed timestamps, three zlib strategies plus zopfli, smallest kept —
so the same input always produces the same archive.

Every build is measured against a per-game milestone ceiling
(`native-milestone.json`, `strands-milestone.json`) as **worst of N rolls**, not
best, because a number you cannot reproduce is not a number you can ship.

## The first approach, and why it was abandoned

The repo began as a *packer*: it pulled the existing ~200 KB gamedev.pl game
`seventh-color` from the games repo and squeezed it down — synthesising the
audio from patch definitions instead of shipping WAVs, tree-shaking a global-
publishing engine by hand, mangling properties whole-program. That work is
below, and the numbers in it are real.

It was abandoned because it was measured: the floor of that approach — a
micro-engine emulating the GameKit API, generalized scene machinery,
localization, telemetry — came to **~12.3 KB before the first line of story**.
Three episodes fit under that; three never would. The native rewrite deletes the
compatibility problem rather than compressing it, and shipped the *whole* story
at 12,160. [`NATIVE.md`](./NATIVE.md) tells that story properly;
[`EPISODES.md`](./EPISODES.md) and [`SIZE.md`](./SIZE.md) hold the measurements
that led to the decision.

The packer is still wired up as `npm run size` and its per-transform notes are
kept below, because the engineering in them is sound and reusable — but neither
entry ships through it, and it has not been exercised since the rewrite.

### The transforms

Each is a flag in `config.json` and each can be switched off for one run with
`--no-<name>`, so any of them can be A/B'd against the size ledger.

**`synthAudio`** — the largest single win, and the one most specific to this platform.
gamedev.pl renders `shared/audio/sounds.json` to WAV at build time and inlines the result,
which costs ~233 KB of base64 for nine sounds. The patch definitions those WAVs come from
are 2.4 KB, and the renderer is about forty lines, so this ships the definitions and moves
the render to boot. The synthesiser is a port of `tools/audio.ts` and its output is
**byte-identical** to the committed WAVs — same noise seeds, same envelope arithmetic — so
the game sounds exactly as it does on gamedev.pl.

**`stripI18n`** — removes the `data-i18n-en` / `data-i18n-pl` attribute pairs. The site
chrome uses them to swap languages; a standalone entry has one language and the DOM already
contains the English text, so `GameKit`'s localise pass simply finds nothing to do.

**`minifyCss`**, **`minifyMarkup`** — esbuild for the stylesheet, a conservative squeeze for
the markup (comments out, whitespace between tags collapsed).

**`mangleProps: "max"`** — whole-program property renaming, made safe by construction
rather than by hope. Every string literal in the bundle that is shaped like an identifier
is collected with acorn and passed to terser as reserved, because dynamic property access
(`steps[name]`, `state[kind]`) always names its key as a literal somewhere — so anything
reachable by string keeps its name, and everything else is renamed consistently on both
sides. Terser's builtin list protects DOM names. Two hard-won details live in the code:
the literals must be *tokenised*, not regex-scanned (an apostrophe inside prose desyncs a
quote-parity scan and silently drops every capture after it), and the engine+game must be
one program when terser runs, or the rename maps diverge. A scan confirms the codebase
never builds a key by concatenation, which is the one pattern this cannot protect.

Worth ~1.9 KB off the archive. The gross rename is 27 KB of minified source, but
roadroller already prices the 400th `lineWidth` at a fraction of a bit — which is also why
minified size is a poor proxy for archive size throughout.

**`inlineChrome`** — folds the page markup and stylesheet into the packed script (injected
via `insertAdjacentHTML` before the game boots, shell reduced to doctype+title+`<body>`).
One compression model over markup+css+code beats three separate streams: ~1.3 KB.

**`treeShake`** — GameKit publishes itself onto a global (`Object.assign(GameKit, {…})`
per module), so no bundler can shake it: esbuild sees a property write and keeps every
function named in it. This does the reachability by hand, over two seams that cascade.
The `draw` surface is an object literal of thin delegators — `panel` forwards to
`GameKit.drawPanel`, `ship` to `GameKit.drawShip` — so a game that never calls `draw.panel`
still pays for the whole panel painter; drop the unused surface methods and their targets
lose their last reference. Then published members nobody names are removed **to a
fixpoint**, because each removal strands more. Terser deletes the orphaned bodies, which is
where the bytes come from: we remove references, the compressor removes code.

For this game that is 11 surface methods and 32 published members — GameKit drops from 67
exported members to 35 — worth **~3.0 KB** off the archive.

Two safety rails. Ranges come from acorn, never regex: these literals contain nested
braces, template strings and regexes, and a brace-counting scan gets them wrong in ways
that still parse. And `pack` refuses to run unless the staged per-module sources splice
back into the assembled bundle **verbatim** — if the parts have drifted from what the
assembler produced, the shaken build would be a different program, so it is a hard stop.

The reference check is deliberately loose (any `.name` access keeps a method, not just a
call), which over-keeps: `subtitle` survives on two `win.subtitle` config fields despite
having zero call sites. Tightening it was measured at 69 bytes and declined — over-keeping
costs bytes, over-pruning costs a working submission.

**`roadroller`** — packs the script into a self-extracting blob. `roadrollerOptimize` picks
the search level: `0` is a few seconds, `1` (the default) about a minute, and `--O2` a full
parameter search — measured at 145 bytes over `-O1` for ~35 minutes, so it is worth running
exactly once, on the final submission pack, and never during iteration. The final zip still
matters even with everything folded into the payload: roadroller emits an ASCII-safe stream
(97 distinct byte values, ~6.05 bits/byte), and deflate recovers precisely that encoding
overhead — measured, the whole chain lands at the model's own entropy, so there is no
headroom hiding between the two stages.

The zip writer is ours rather than `zip -9`: one entry, no extra fields, zeroed timestamps,
and it tries three zlib strategies plus zopfli and keeps the smallest. Reproducible — the
same input always produces the same archive.

### Verification is not optional (the packer)

Three of the stages rewrite code the game never expected to be rewritten. `npm run verify`
unzips the archive that would actually be submitted, boots it in Chromium, and fails on any
page error, failed request, or missing canvas. It then plays the opening scene — advances
dialogue, walks both directions, opens and closes the cast and story overlays — because a
boot-only check would pass a build whose input handling the transforms broke. It writes
`build/verify.png`, the fastest way to see that a size win did not quietly cost a scene.

Verify is what turned `mangleProps: "max"` from reckless to routine: its first run caught
the engine's required-step check (`steps[name]` over a quoted list) breaking, and its
interaction pass is the regression net for every transform added since.

### Dropping the on-screen touch controls

The D-pad and ACT button in `tools/engine/input.mjs` were built for the whole game, but
a scoped build might not need them at all. `pressedAction()` in the game's own source
already accepts a tap anywhere in the dialogue panel (`dialogueTap` checks the panel's
y-range, not a specific button) — so for a scope whose only mode is `dialogue`, the
on-screen button is decoration pointing at a click the panel already accepts, and the
D-pad points at movement no reachable scene reads.

This is checked, not assumed: `story-slice-movement.ts`'s arrow-key handling is only
called from `moveStoryActor`, which only `walk-dialogue` and a handful of minigame modes
invoke — none of which are in scope once the game ends at `shadow-council`. Removing
`buildTouchControls()` and its `.gamekit-touch-*` CSS is a straight win for this scope
(~700 B) — but it undoes itself the moment scope widens to a scene that walks or steers,
which is called out in the file's own comment so it isn't rediscovered as a bug.

### The scope dial

`scope.endAt` in `config.json` (or `--endAt <sceneId>` for a one-off) builds the game as
if the story ended at that scene, and the result is **playable, not just smaller**. Three
things have to happen together for that to be true, and the dial derives all of them from
the scene table itself rather than a hand-kept list that would rot:

- the last kept scene is a *link* — it carries `nextSceneId` and would walk the player
  into a scene the build no longer contains. It is rewritten into a `completion`, which is
  how the real final scene ends the game. A scene that already has one is left alone;
- every minigame whose `mode` no longer appears is stubbed — but stubbed with a module
  exporting the same names, since the dispatchers still import them;
- music tracks and cast the kept scenes never reach are dropped.

`truncateAndClose` asserts its own output: it re-parses the result and fails unless the
final scene is genuinely terminal. That assertion exists because the failure is silent and
fatal — you would only meet it at the end of a playthrough.

Two bugs found while building it, both worth remembering. `nextSceneId` is frequently the
*last* property of a scene, so removing it left a trailing comma and appending `completion`
produced `,,`. And the first sweep reported three different scopes at byte-identical sizes:
`pull` had failed, the previous `game-cut.js` was still on disk, and `pack` measured the
stale file. **Any sweep must check the exit status of every step** — a build tool that
fails quietly will report the last good number forever.

### Pricing a cut

`weigh` ranks files by minified size, which is a bad guide to what removing one
would save — prose and data tables compress several times better than code. `probe`
settles it by building the bundle with chosen files stubbed out and running the real
compression chain over each variant. Probe builds are deliberately broken; they
measure, they do not run.

`--floor` is the one to run before planning any cut at all. It prices the engine
with no game and the game with no engine, which is how we learned that
`core+gfx+drawing+input` is 13,352 bytes zipped on its own — the entire budget,
before a line of this game.

# The Seventh Color — js13kGames 2026 build

Packs the gamedev.pl game [`seventh-color`](https://github.com/gamedevpl/www.gamedev.pl-games/tree/main/games/seventh-color)
into a single zip small enough for [js13kGames](https://js13kgames.com/): **13,312 bytes**.

The game itself is not developed here. It lives on a branch in the games repo and keeps
being developed there. This repo only ever *reads* that branch, so the two never fight over
the same files, and the gamedev.pl gates (validate, trace, agent-play) stay the sole
authority on whether the game is correct.

```
www.gamedev.pl-games                    seventh-color-js13-2026
  games/seventh-color/**   ──pull──▶      build/source/index.html
  npm run build                             │
                                            ├─ synth audio   238 KB → 4 KB
                                            ├─ minify        esbuild + terser
                                            ├─ roadroller    self-extracting pack
                                            └─ zip           deflate/zopfli, best of
                                                  ▼
                                            build/index.zip
```

## Commands

| command | what it does |
| --- | --- |
| `npm run size` | the whole loop: pull, pack, verify. Start here. |
| `npm run pull` | build the game in the games checkout, stage it under `build/source/` |
| `npm run pack` | run the transforms, write `build/index.html` + `build/index.zip`, update `SIZE.md` |
| `npm run verify` | unzip the archive, boot it in headless Chromium, fail on any page error |
| `npm run weigh` | per-file table of what is costing bytes, so cuts can be aimed |
| `npm run probe` | price each candidate cut in bytes off the *archive* |
| `npm run probe -- --floor` | what the engine costs with no game, and the game with no engine |
| `node tools/pack.mjs --O2` | override the roadroller search level for one run |
| `npm run size:fast` | pack without roadroller — quicker, for A/B-ing a single change |

`npm run pack -- --strict` exits non-zero when the zip is over budget. Nothing uses it yet,
because the zip is over budget by a wide margin; it is there for the day that flips.

## Where it builds from

`pull` looks for a games checkout in this order:

1. `--games <path>`
2. `source.localCheckout` in `config.json` (default `../www.gamedev.pl-games`)
3. a shallow clone it manages itself under `.cache/games-repo`

**A checkout you already have is treated as read-only.** It builds whatever is checked out
and says so, rather than moving your branch under you. Pass `--fetch` to opt into
fetching and fast-forwarding it, or `--branch <name>` to override the configured branch.
Only the `.cache/` clone is driven automatically.

## The transforms

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
the search level: `0` is a few seconds, `2` searches parameters and takes far longer. The
zip is still worth taking afterwards, because the markup and stylesheet sit outside the
packed blob.

The zip writer is ours rather than `zip -9`: one entry, no extra fields, zeroed timestamps,
and it tries three zlib strategies plus zopfli and keeps the smallest. Reproducible — the
same input always produces the same archive.

## Verification is not optional

Three of the stages rewrite code the game never expected to be rewritten. `npm run verify`
unzips the archive that would actually be submitted, boots it in Chromium, and fails on any
page error, failed request, or missing canvas. It then plays the opening scene — advances
dialogue, walks both directions, opens and closes the cast and story overlays — because a
boot-only check would pass a build whose input handling the transforms broke. It writes
`build/verify.png`, the fastest way to see that a size win did not quietly cost a scene.

Verify is what turned `mangleProps: "max"` from reckless to routine: its first run caught
the engine's required-step check (`steps[name]` over a quoted list) breaking, and its
interaction pass is the regression net for every transform added since.

## Pricing a cut

`weigh` ranks files by minified size, which is a bad guide to what removing one
would save — prose and data tables compress several times better than code. `probe`
settles it by building the bundle with chosen files stubbed out and running the real
compression chain over each variant. Probe builds are deliberately broken; they
measure, they do not run.

`--floor` is the one to run before planning any cut at all. It prices the engine
with no game and the game with no engine, which is how we learned that
`core+gfx+drawing+input` is 13,352 bytes zipped on its own — the entire budget,
before a line of this game.

## Current standing

See [`SIZE.md`](./SIZE.md), regenerated by every `npm run pack`.

The entry is a long way over budget — this is a thirty-scene story game that was never
written to a byte limit, and the pipeline exists so the number is visible while it is cut
down rather than measured once at the end.

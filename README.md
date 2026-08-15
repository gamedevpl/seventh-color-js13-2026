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

**`mangleProps`** — off, and measurement says leave it off. Mangling every property cuts
30,189 bytes of minified source (11%) and **2,873 bytes off the archive (4%)** — roadroller
is a context-mixing compressor, so the 400th `lineWidth` already costs a fraction of a bit
and shortening it buys almost nothing. It is also unsafe: the game passes canvas property
names through its own option objects, so a blanket mangle renames one side of that and not
the other. Bad trade twice over.

The same measurement is the reason to distrust minified size generally. Effective
compression is already 3.78× (266,336 minified → 70,435 zipped) against 3.05× for gzip
alone, and `roadrollerOptimize: 1` buys a further 671 bytes for 56 seconds. There is
roughly 5% left in the compression chain, total.

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
page error, failed request, or missing canvas. It also writes `build/verify.png`, which is
the fastest way to see that a size win did not quietly cost a scene.

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

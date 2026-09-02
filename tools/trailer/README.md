# The trailers

Two of them, cut the same way and sharing everything except the direction:

- **Unicorn Snap**, ~43 seconds - a tease of styled details, the drop into a
  shoot, the score, and a closing walk into the lens that dissolves into an
  end card.
- **Unicorn Fireball**, ~36 seconds - the plain, a herd that grows, the
  wind-up, the rainbow, and two of them meeting head-on.

```sh
npm run trailer            # Snap     -> build/trailer/unicorn-snap-trailer.mp4
npm run fireball:trailer   # Fireball -> build/trailer-fireball/unicorn-fireball-trailer.mp4
```

Or one stage at a time:

```sh
npm run snap:dev         # REQUIRED FIRST - the recorder drives DEV-only hooks
npm run trailer:frames   # 1164 PNGs -> build/trailer/frames/     (~5 min)
npm run trailer:endcard  # the animated end card -> build/trailer/endcard/
npm run trailer:audio    # the music -> build/trailer/audio/strut.wav
npm run trailer:assemble # muxes the three -> build/trailer/*.mp4
```

Fireball's stages are the same names under `fireball:` - and
`record-endcard.mjs` and `assemble.mjs` are one file each with a `--game`
switch, not a fork per trailer. Adding a third should be a row in the `GAMES`
table at the top of those files.

Needs `ffmpeg`/`ffprobe` on PATH, and `numpy` for the audio stage. Everything
lands in `build/`, which is gitignored - only the tooling is tracked.

## The recording is not real-time

Both recorders - `record-frames.mjs` and `record-fireball.mjs` - replace
`requestAnimationFrame`, `performance.now` **and** `setTimeout` with a virtual
clock that only advances when the script pumps it.
Each exported frame is exactly 1/30s of *game* time from the last one no matter
how long the software renderer actually took, so the output cannot judder and
cannot vary between runs. This was not the first design; it replaced a
real-time screen recording that produced visibly dropped frames.

The consequences are worth knowing before editing this file:

- **`setTimeout` is virtualised too.** The game reveals the results card from
  `setTimeout(endRound, 700)`. Left on the wall clock, the card appeared at a
  different point of the captured timeline on every run, depending only on how
  fast the machine happened to be rendering.
- **CSS transitions and keyframes cannot be used for anything captured.** They
  animate on the compositor's clock, which this script does not control, so
  they come out desynced from the frames. Every overlay effect here
  (narration, the sheet slide-out, the score pop, the confetti) is instead
  driven by hand off the virtual clock, one step per pumped frame. The end
  card is the exception and that is why it is recorded separately, in real
  time, by `record-endcard.mjs`.
- **Watching for DOM the game creates needs both a synchronous check and a
  `MutationObserver`.** The card may already exist by the time a watcher is
  armed - an observer alone waits forever for a mutation that already
  happened - and a polling interval reintroduces exactly the wall-clock race
  the virtual clock exists to remove.

## Unicorn Snap: the camera

Shots are a list, and each one is a hard cut - no easing carries across.
`tease` frames one body part at a time against `SNAPBONE`; `pov` is the
photographer's own viewfinder and ends on a shutter; `wide`/`sweep` watch from
a third-person vantage; `approach` plants the lens and lets the animal walk
into it.

The game's own camera rides a fixed circle of radius `R` around the *origin*,
which means a shot's configured `dolly` is only the distance to the subject if
the subject happens to be standing in the middle of the set. It usually is not,
and after the finale's several seconds of uninterrupted AI movement it can be
far from it - which produced random, geometry-filling close-ups that looked
like a bug in the camera and were not. Finale shots therefore set
`subjectRelative`, anchoring the tripod on the animal's own position so `dolly`
means what it says. Session shots are left on the original behaviour, which is
what they were framed against.

### The DEV hooks

The recorder drives hooks compiled in only by `--cheats`, alongside the probe
hooks that were already there:

| hook | what it is for |
| --- | --- |
| `SNAPCAM(a, p, fov, ang, d, h)` | aim, plus the trailer's two extra controls: distance `d` and eye height `h` |
| `SNAPBONE(i)` | world position of one bone, to frame on a horn or a hoof |
| `SNAPPHASE(p)` | resume the actor after the results screen froze it, without calling `layout()` and un-hiding the HUD |
| `SNAPAIM(x, z)` | steer the animal's heading at a fixed point instead of its own random wander |
| `SNAPGAIT(m)` | commit it to one gait so a closing shot is not spent on it deciding to graze |

`DEV` is substituted as a literal, so terser deletes all of it: the shipping
build is byte-identical with and without these (12,987 bytes at the time of
writing). The free camera in `main.js` is written as a `DEV ? ... : ...`
ternary for the same reason - it folds back to the fixed-radius original.

### Audio

`audio/render.py` re-orchestrates the game's own theme. It is a port of the
`snd.js` sequencer - same tempo, same bassline, same hook, same bare/full
arrangement - playing ElevenLabs one-shots instead of Web Audio oscillators.
It is deliberately not a new composition; the melody is the game's.

The five `.mp3`s are the downloaded one-shots and the source of truth. Two
things in there are less obvious than they look:

- The tease ends on about a second of near-silence before the drop. An earlier
  version built to it with a rising sweep, which just read as hiss.
- The track ends on a held chord that is faded out, because the sequencer's
  own notes decay in a fifth of a second by design. Simply stopping the
  sequencer and fading whatever was left was fading silence, and it sounded
  like the music had been cut off. That chord also swells in rather than
  starting at full gain - these are percussive one-shots, and triggering one
  cold as a sustained note is an audible thump.

## Unicorn Fireball: slapstick, with lights of its own

The cut is a story with a hero. A face in the dark, lit by the flashes of
a fight it is not in. It sets off, hopeful, the lens backing away ahead of
it - and a herd runs it down. It lies there, gets up like a hero (at a
third of speed), shakes it off, sets off again, same shot, same hope - and
a *rainbow* runs it down. It stays down. The camera goes straight up off
the body, turning, and the whole plain is at war. Then how: gather your
herd, trample the rest, become the rainbow - and two rainbows meet and
everything goes white, and the end card dissolves out of the white.

Four things the game did not have, all DEV hooks that compile out of the
shipping build byte for byte (`cmp` says so after every change):

- **A camera.** `FBCAM_` places the eye, the look point and the field of
  view; `record-fireball.mjs` animates it a pumped frame at a time - orbits,
  a lens that backs away ahead of a walking animal, a tripod planted in a
  herd's path, a crane that goes to eighty units. Look points are offsets in
  the subject's own frame, `[along, side, height]`, the same as the eye.
- **Lighting.** `FBGL({flash, dir, fog, glow})`. `flash` is a directional
  light added to the lambert term in a DEV variant of the vertex shader -
  the box faces that face it brighten, the rest do not, which is what a
  rainbow going off out of frame does to a face. `fog` is the range the
  shader used to hardcode: solid geometry fogged out fully at seventy
  units, which is why every high angle died, and the crane pushes it to
  seven hundred. `glow` is a gain on every additive layer.
- **Pyrotechnics.** `FB.boom(x, z, pw)` sets off the game's own explosion
  at a point - ring, cloud, sparks, flash, shake.
- **Bloom**, in the mux rather than the game: `assemble.mjs` lifts the
  bright pixels of every frame, blurs them and adds them back. The rainbow
  is additive geometry and blooms the moment it is blurred over itself;
  it reads as plasma, and the explosions as clouds.

The falls are the game's own. `st = 1` is the tumble (it rolls about its
long axis and lands on its side); `up` pinned at .55 is the knocked-flat
pose, held; let go of, the game rolls it back onto its feet in half a
second, and the recorder runs that at a third of speed. The shake is a
wiggle the game does not have, done to the yaw.

The guard - the per-frame hand on the world - grew a vocabulary for this
cut, and every word of it is a rule of the game found in a preview:

| flag | what it does, and why |
| --- | --- |
| `pin` | the player's speed. `pin: 0` is as near to standing as the game allows - with an input object and no key held the game walks at eleven, and eleven for the length of an intro is off the edge of the plain |
| `mortal` | rivals keep their charge and their rainbow. Otherwise both are held down: a charging rival's herd landed three horns on the standing hero inside one step, and the match ends in the same step that kills the player |
| `horns` | a horn may land on the hero (`hit` is the fight loop's own per-pair cooldown). The first fall is horns; the second is the rainbow ALONE - a lit leader's horn would throw the hero half a second before its band arrived |
| `lie` | the knocked-flat pose, held |
| `drive` | a rival sent somewhere at a speed: a herd crossing the frame on cue. Its brain is off, so this is its brain. A brainless rival not driven is pinned, because it walks too |
| `pairs` | lit rivals held head-on at the speed that lets their centroids meet (a centroid trails its leader by spd/2.2), and lit AGAIN the moment the game's cooldown allows - a war, not one clash |
| `aim` | the final two, head-on, for the white |
| `wide` | no clamp ring: the war spreads |

`FB_PREVIEW=10` captures every tenth frame at half size, for looking at a
shot list in five minutes. `FB_STRICT=1` stops at the first frame the
match is not running, with the frame before it in the log - that frame is
the one that explains it.

### The score follows the cut

`record-fireball.mjs` writes `beats.json`: the second every shot starts, the
frames the hero left the ground on (`walk1Hit`, `walk2Hit` - measured off
the physics, or off the fallback throw when the physics missed), the
frames the face flashes hit, the frames the war's explosions go off, and
ignition, slow motion and the clash. `audio/render-fireball.py` reads it.
The fight next door is on the flashes; the walk - the tune in a music box
at the game's own tempo, counted from the frame the walk starts so the
second walk begins on the same note as the first - stops dead on the hit;
the get-up is four notes climbing on the lead; the war swells in with the
crane; the game's groove plays the part that explains the game; the drop
lands on ignition; the white gets a chord that holds under the end card.

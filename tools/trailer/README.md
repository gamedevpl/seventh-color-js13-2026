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

## Unicorn Fireball: directed, not captured

The first cut of this one played the game with its own chase camera and
its HUD on, and captioned it. It was a screencast. The cut that replaced
it is a film with a shot list, and three things make it one:

- **A camera of its own.** `FBCAM_` is a DEV hook in `main.js` (the
  shipping build is byte-identical without it) that places the eye, the
  look point and the field of view for a frame. `record-fireball.mjs`
  animates it one pumped frame at a time - orbits, cranes, tracking shots
  in the subject's own frame, a tripod planted in the herd's path - and
  keeps the HUD canvas hidden for the whole length. The one thing the
  plain will not give is a high angle: from above, the fog swallows it, so
  everything is shot from grass height.
- **A story.** Cards on black between the movements: *one plain. / seven
  colours. / one of them is yours. / hold. / two rainbows meet.* - and one
  line over the picture at the drop. A unicorn alone; each of the seven
  colours in a cut on the half-bar; gathering its own; the fold; the
  rainbow; two rainbows meeting; the same animal with a herd round it.
- **Time.** A pumped clock costs nothing to slow: the hold ramps down to a
  third of speed as the charge tops, ignition plays at a fifth, and the
  clash goes to a fifth from twenty-five units out and snaps back to full
  speed on the hit.

Every cut is a bar of the game's own music (132 BPM), so the score can be
arranged to the picture. The recorder writes `beats.json` - the second
each shot starts, and the frames on which the rainbow lit and the clash
detonated, which are physics - and `audio/render-fireball.py` reads it and
lays out its movements on those cues: a music-box intro (the lead at half
speed, two octaves up, with an echo), a build, a breakdown with the game's
riser, the drop (the lead stacked in octaves, its second bar answered by a
phrase of its own), half time under the slow motion, the hit, and the
music box back over a held chord. `FB_PREVIEW=10` captures every tenth
frame at half size, for looking at a shot list in two minutes.

### What the previews taught

None of this was found by reading the source. Five previews, five ways
for a take to die:

- The player was hunted down while it stood with a herd of three during
  the montage. The match ends in the SAME step that kills the player -
  `hurt()` to no hearts, then `lost()` right after `step()` - so healing it
  next frame is a frame too late. Protection is preventive: the player
  cannot be horned (`hit` is the fight loop's own per-pair cooldown), and
  rivals are held under the charge that makes a horn lethal.
- The player never stands still. With an input object and no key held the
  game's `want` is eleven units a second, and eleven units a second for
  the length of the intro is off the far edge of the plain - it fell at
  `[3, -95]`, during a card. Steering is on for every shot; the "standing"
  shots pin the speed to zero and get a creep, which reads as an animal
  shifting its weight.
- The rivals' brains hunt the player's followers loose faster than the
  gather adds them (the herd that reached the hold was two). They are set
  dressing until the clash: brains off for the whole cut, and pinned,
  because a brainless rival walks too.
- Two rainbows only explode if their herd CENTROIDS come within the sum of
  the two footprints, and a centroid trails its leader by about
  `spd / 2.2`. At a lit herd's natural 37 that lag is ten, wider than either
  footprint, so the leader reaches the other band first and is run over;
  pinned to twelve, the centroids meet first and it detonates.
- Ignition is placed, not hoped for: the hold is given the head start that
  ends it at a charge of .97, and the first frame of the next shot sets it
  to 1.

`FB_STRICT=1` makes the recorder stop at the first frame the match is not
running, with the frame before it in the log - that frame is the one that
explains it.

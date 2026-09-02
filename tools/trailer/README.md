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

## Unicorn Fireball: directed by playing it

Snap needed a free camera because the camera IS that game and its own lens
sits on a fixed tripod. Fireball's camera is already the shot you want - it
rides behind the herd, pulls back as the herd grows and opens right up when
the rainbow lights - so `record-fireball.mjs` never touches it. It plays the
game instead: real `keydown`/`keyup`, and the world staged between beats
through the `window.FB` handle.

Which turns out to be the harder job, because the game is trying to end.

- **A trailer is a long time to survive.** ArrowUp is fifteen units a second
  and the plain is fatal at its rim, ninety-five out; held down for the nine
  seconds of the opening beats the player simply runs off the edge of the
  world. `fell()` takes its hearts, turns every unicorn that wore its colour
  wild, and `lost()` latches `mode = 'end'` - and then the very next SPACE,
  the one meant to start the charge, dismisses the end screen to the title.
  A whole trailer recorded on the attract loop, and the only symptom in the
  log is one field reading `"end"`. The guard now runs *every* frame rather
  than every tenth (nine frames is enough to die in), keeps the player's
  hearts, stands rivals back up, and steers - only once the rim is actually
  coming, and toward whichever tangent is nearer the current heading, so the
  correction reads as a turn rather than a rail.
- **Ignition is placed, not hoped for.** `chargeTime` is `2.4 + .08n` seconds
  and the herd's size is only known at the beat, so the charge is handed
  exactly the head start that lights the rainbow inside the shot. An earlier
  cut topped the charge up afterwards if it had not lit, which worked and
  stretched the beat by 0.7s, putting every later beat out of step with the
  music.
- **The clash needed a probe to get right, twice.** `clash()` only detonates
  when the two headings oppose - and the rival's brain answers a bigger
  rainbow by *sidestepping*, which is correct play and a graze on camera. Aim
  both by hand and they still graze, because two rainbows explode only when
  their herd CENTROIDS come within the sum of the two footprints, and a herd's
  centroid trails its leader by about `spd / 2.2` - the followers settle where
  their catch-up speed matches the leader's. At a lit herd's natural 37 units a
  second that lag is ten, wider than either footprint, so the leader reaches
  the other band first and is simply run over: a heart, the rainbow out, and
  the pair pass through each other still lit. Pinned to twelve the lag is six,
  the footprints are seven and eight, and the centroids meet first. The rival
  also has its brain taken off it for the length of the approach, because with
  it on it reads the edge eighty units down its own nose and lets the rainbow
  go.

None of that was found by reading the source. It was found by writing a
throwaway probe that staged the clash alone, stepped it a frame at a time and
printed the six numbers the rule is made of.

### The score follows the cut, not the other way round

`record-fireball.mjs` writes `build/trailer-fireball/beats.json` - the beat
boundaries it used AND the second the two rainbows actually detonated.
`audio/render-fireball.py` reads it. The clash is physics, not a cue: it moves
when the approach is retuned, and typing its timestamp into two files is how a
score ends up hitting its boom a second after the screen does.

The music itself is the same idea as Snap's - a port of `snd.js` (tempo,
gallop pattern, bassline, lead) played on the sampled one-shots, arranged
against the trailer's beats instead of against a herd size.

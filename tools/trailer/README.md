# The Unicorn Snap trailer

Records a ~43 second promo cut of Unicorn Snap: a tease of styled details, the
drop into a shoot, the score, and a closing walk into the lens that dissolves
into an end card.

```sh
npm run trailer          # the whole thing -> build/trailer/unicorn-snap-trailer.mp4
```

Or one stage at a time:

```sh
npm run snap:dev         # REQUIRED FIRST - the recorder drives DEV-only hooks
npm run trailer:frames   # 1164 PNGs -> build/trailer/frames/     (~5 min)
npm run trailer:endcard  # the animated end card -> build/trailer/endcard/
npm run trailer:audio    # the music -> build/trailer/audio/strut.wav
npm run trailer:assemble # muxes the three -> build/trailer/*.mp4
```

Needs `ffmpeg`/`ffprobe` on PATH, and `numpy` for the audio stage. Everything
lands in `build/`, which is gitignored - only the tooling is tracked.

## The recording is not real-time

`record-frames.mjs` replaces `requestAnimationFrame`, `performance.now` **and**
`setTimeout` with a virtual clock that only advances when the script pumps it.
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

## Camera

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

## The DEV hooks

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

## Audio

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

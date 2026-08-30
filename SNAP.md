# UNICORN SNAP — the third entry

Point a camera at a unicorn that knows exactly how good it looks.

The idea is a nine-year-old's, and it is a better one than it first sounds:
*a game about taking photographs of a unicorn, scored on how nice the photo
is.* That is the shape of Pokémon Snap, and Pokémon Snap did not read
pixels to grade a picture — it graded the **state of the world at the moment
of the shutter**, projected onto the screen. Every term a photograph is
judged on here is already in the simulation: where the unicorn is in frame,
how large, which pose it was mid-way through, whether it was looking down
the lens, what was behind it.

## What it takes from Rainbow Surfer, and what it does not

Not the track, and not the running. `gl.js` comes over verbatim — one
shader, three materials, additive glow, distance fog, a stencil for
reflections — because that renderer is the look and feel, and the look and
feel is what was worth keeping. Everything else is new: the course, the
chase, the stardust economy and the whole 68 KB of `main.js` stay behind.

That trade is the entire reason this is a *third native entry* rather than a
port of the games-repo version. This repo already ran that experiment once
and measured it: packing the full gamedev.pl game down came to ~12.3 KB of
floor before a single line of story, and the native rewrite shipped the
whole thing at 12,160. Porting down does not work here; building up does.

## R1 — the rig

In Rainbow Surfer the unicorn was a body and a head on one neck pivot,
which is all anyone can see of it at 300 km/h from behind. Here the unicorn
**is** the game, so it needed a skeleton it can actually pose with.

**A rig of rigid boxes, not skinned vertices.** Twelve bones; each owns a
mesh built once around its own pivot, and a bone's world matrix is
`parent * translate(offset) * rotate(angles)`. Posing is a handful of 4×4
multiplies per frame and no vertex work at all. A boxy unicorn loses nothing
by having rigid limbs, and skinning would cost both bytes and a per-frame
rebuild of every vertex.

Ten poses: grazing, standing, walking, trotting, galloping, rearing, a mane
toss, shaking out, asleep, prancing. The three gaits are the same cycle with
different phase offsets — a walk is the four-beat sequence, a trot is
diagonal pairs, a gallop leads with the hind pair — and the knee only ever
bends one way, which is what the `max(0, …)` in the leg cycle is for.

**Every transition in the game is bought with one exponential.** Poses write
target angles into a scratch vector and the live pose eases toward it at a
0.09 s time constant. Rearing settles back down, a grazing head comes up to
meet the camera, and none of it needs a transition table. The gaits are not
damped by it in any way that matters: a 2 Hz cycle under a 0.09 s constant
loses almost nothing.

### The bug the rig is *made* of

Every bone above the root inherits the root's pitch, so any bone that wants
to stay upright in the world has to cancel it by hand. Rearing pitches the
body back 0.95 rad, and the first cut set the neck 0.55 rad *further* back
on top of that — 97° from vertical. It read exactly as what it was: an
animal falling over backwards. The hind legs had the same fault and lifted
off the grass. Both are now written as explicit cancellations of `R`, with
the residual stated as the thing it actually is (the 0.25 rad that puts the
hind hooves under the belly, where a rearing animal carries its weight).

### The hair

The mane, forelock and tail are the only part of the unicorn that is not a
rigid box, and they are what every photograph is really about.

Each strand is a chain solved **follow-the-leader**: the root is planted on
its bone and every point below is pulled to exactly one rest length from its
parent in a single downward pass. That converges in one iteration and can
never stretch — which matters, because the head whips hard in a mane toss
and a spring solution would either sag or explode. Verlet supplies the
inertia, and that lag *is* the animation.

Two things were wrong before it looked like hair:

- **Stiffness beat gravity.** A constant pull toward the rest direction made
  every strand a straight rigid spike out of the neck; the mane pointed
  wherever the rest direction pointed and gravity never got a say. It tapers
  now — firm at the roots, where a mane really is combed into a shape, free
  at the tips, which is what falls and flows.
- **Additive strands sum, and a mane is nothing but overlapping strands.**
  At a core alpha of 0.85 the crest saturated to pure white and the only
  rainbow left was the fringe at its edge. At 0.42 it reads as a spectrum.

### The instrument

`tools/test-pose.mjs` reads the lowest **contact** out of the running rig —
the lowest hoof, or the belly when that is lower — and holds all ten poses
to the ground.

Hooves alone are the wrong measure, and the test's own first run proved it
by reporting the one correct lying-down pose as floating 20 cm: a sleeping
unicorn rests on its barrel with its legs folded in the air. It also settled
a disagreement in the other direction — rearing *looked* like it was
hovering in a screenshot and measures at −0.042, planted. Which is the
argument for the probe: this failure is systematic (it follows from the
inheritance above), too small to be sure of by eye, and impossible to miss
once a player is being asked to photograph the thing.

```
  pose        lowest   highest   allowed
  graze       -0.050    -0.050 -0.06..0.06  ok
  idle        -0.010    -0.009 -0.06..0.06  ok
  walk        -0.005     0.021 -0.06..0.09  ok
  trot        -0.005     0.025 -0.06..0.12  ok
  gallop       0.024     0.097 -0.06..0.22  ok
  rear        -0.042    -0.042 -0.08..0.1   ok
  toss        -0.015    -0.015 -0.06..0.07  ok
  shake       -0.013     0.045 -0.06..0.08  ok
  sleep       -0.023    -0.023 -0.08..0.06  ok
  prance       0.005     0.039 -0.06..0.14  ok
```

`tools/shots-snap.mjs` renders a contact sheet of all ten poses in one
command, because a gait that reads as broken is not something a byte count
reports.

### The wall

Worst-of-3 at `--O1`: **5,384** against 13,312 — **7,928 bytes in hand** for
the game itself. Stated now so that later passes are spending a measured
budget rather than a hoped-for one.

| after | worst-of-3 | added |
| --- | ---: | ---: |
| R1, the rig | 5,384 | — |
| R2, the studio and its shadow | 5,725 | 341 |
| R3, the track and the bow | 6,498 | 773 |
| R4, styling and glitter | 7,797 | 1,299 |
| R5, the shoot, the brief and the season | 9,799 | 2,002 |
| R6, the tripod, roaming and balance | 10,026 | 227 |
| R7, title, contact sheet and coaching | 10,619 | 593 |
| R8, the viewfinder, pinch and a shutter | 11,266 | 647 |

**2,046 bytes still in hand.**

## R2 — the studio

The meadow is gone. This is a game about a photo shoot, so the set is a
**seamless cyclorama**: the floor sweeps up into the back wall through a
quarter-circle curve with no visible join, which is the backdrop every real
photograph of a posing subject is taken against. Warm paper, lightly shaded.

Three things make it read as a studio rather than as a coloured box:

- **The shading is baked into vertex colours**, not lit and not shadered.
  The renderer has one program, and a studio needs exactly one thing that
  program does not do: a soft pool of light falling off toward the edges. A
  dense enough sheet with per-vertex brightness gives that for free — no
  uniform, no branch, no second shader — and because the falloff is computed
  from world position it never bands the way a texture would. The first cut
  bottomed out at 0.34 and the far corners went olive; a sweep is an even
  field with a gentle pool in it, not a spotlight in a dark room, and it
  bottoms out at 0.55 now.
- **The floor shades differently from the wall.** Lit as evenly as each
  other they read as the inside of a cardboard box; the fall-off along the
  floor toward the lens is what gives the sweep its depth.
- **A cast shadow, projected and stencilled** — see below. On a seamless
  sweep there is no horizon line and no texture, so the shadow is the *only*
  cue for where the floor is; without one the unicorn hangs in front of the
  backdrop instead of standing on it.

### The shadow

Not a blob. The whole rig is drawn a second time through a **shear that
flattens it onto the paper**, so the shadow is the unicorn's own silhouette:
legs, horn, and the mane's every strand. In a game about photographing
poses, the shadow states the pose.

Three things make it work:

- **The stencil paints each pixel once.** Flattening a solid onto a plane
  piles its triangles on top of each other — four legs, a barrel and a head
  all land in one footprint — and an alpha-blended shadow drawn that way
  darkens once per overlapping triangle, so the silhouette comes out mottled
  with the mesh's own internal structure. Passing only where the stencil is
  still zero and incrementing as it draws fixes that exactly.
- **A uniform tints it, not a second set of meshes.** The projected geometry
  arrives carrying the unicorn's own colours, and without an override it
  would paint a flattened *copy* of the unicorn on the floor rather than its
  shadow. A shader uniform costs one line; dark twin meshes would double the
  per-frame geometry work, and the mane is rebuilt every frame.
- **The light has exactly one definition.** It is used twice — the shader
  lights with it, the studio shears along it — and two hand-kept copies of
  one vector is precisely how a shadow ends up disagreeing with the shading
  that made it. `LIGHT` lives in `gl.js` and is interpolated into the shader
  source; the projection derives its slope from the same array. It also sits
  lower than a noon sun on purpose: the shear *is* the light's slope, so a
  light overhead casts a shadow the subject stands on top of.

The ambient fan survives underneath it at low alpha, darkening the few
centimetres where the hooves meet the floor — which no directional
projection gives you. A hard key plus a soft fill is what a studio is.

### The gradient

The first sweep divided each axis by a wildly different number (17, 12, 30)
and added a separate fall-off along the floor. The result was a broad
horizontal band with a darker top: it read as a gradient laid *over* the
picture rather than as a light aimed at the middle of it. It is now one
distance from one point, weighted only mildly per axis — a circle centred
on the subject.

### What the backdrop cost the mane

The mane was purely additive, and against Rainbow Surfer's night sky it
glowed beautifully. Against a lit studio sweep additive is very nearly a
no-op: adding light to an already-bright surface changes almost nothing, and
the rainbow washed out to the colour of the paper.

So the hair is two materials now. The **core is solid** — opaque coloured
geometry that holds its hue against anything behind it — and the additive
pass is demoted to a thin rim that reads as sheen rather than as the hair
itself. Both are filled in one walk of the strands: the two ribbons differ
only in width and alpha, so the cross product that turns each segment toward
the lens is computed once and used twice.

This is worth stating as a general rule for the rest of the build: **on a
bright background, glow is not a colour, it is a highlight.** Anything that
needs to be *seen* has to be solid.

## R3 — the strut

### The music

The brief was the swagger of a catwalk vamp, and what carries that is not a
tune anyone owns — it is the furniture: four on the floor, a clap on two and
four, and a bassline that keeps jumping an octave and dropping back. The
hook over the top is written for this game. One scheduler running ahead of
the clock in short blocks, exactly as Rainbow Surfer's does, because a
`setInterval` sequencer drifts and audio that drifts against an animation
locked to the same tempo is worse than no music at all.

Claps and hats are **filtered noise**, not tones: one buffer of white noise
band-passed differently per hit. That is most of the distance between a
drum kit and two beeps, and it pays for itself again in the shutter — a real
camera is two events, the mirror and then the blades, and the *pair* is what
the ear recognises as a camera rather than a click.

### The gaits are locked to the track

Every gait is now a whole number of beats per stride, and the prance is one
strutting step per beat. For a game whose subject is a unicorn showing off
to a strut, that is most of the difference between an animal moving and an
animal performing.

Worth recording: the gaits were tuned by eye first, at 1.1 / 1.9 / 2.6 Hz,
and the tempo-locked values come out at 0.97 / 1.93 / 2.58. **The lock was
free** — which is some evidence that the eye was already looking for it.

### The instrument, and what it caught

`tools/test-audio-snap.mjs` patches `createOscillator` and
`createBufferSource` before the page boots and counts what the running game
actually asks for. "`music()` was called" is not the same claim as "the
browser made a noise": a suspended context swallows the lot in silence, and
a page that builds its context before a user gesture gets suspended exactly
that way.

| | oscillators | noise | context |
| --- | ---: | ---: | --- |
| before any gesture | **0** | **0** | none |
| after one press, ordinary pose | 6.0/s | 4.5/s | `running` |
| on a pose worth photographing | **9.0/s** | 4.5/s | `running` |

The last row is the one that caught something. The hook was gated at an
intensity of 0.15, which every pose already exceeded — so it played
constantly and only its *volume* changed, which the ear reads as a mix
wobble rather than as the track arriving. The probe reported it as what it
was: no change at all, 8.5/s against 9.0/s. Gated at 0.5 the hook now
enters, and the counts say so.

### The bow

An eleventh pose, and the same inheritance rule as rearing with the sign
flipped: the root tips nose-down by `B`, so the hind legs cancel `B` to stay
standing and the forelegs need `B` taken off the angle they want. The probe
caught the rest — the reaching forelegs sat 9.6 cm *under* the floor, fixed
by raising the hip rather than lowering it, which is what a bow does anyway.

### The set became a cove

The flat sweep was wrong in a way only the camera could show: a flat
backdrop always ends somewhere, and swung far enough round the lens found
the edge, with the dark beyond it reading as a hole torn in the corner of
the picture. Widening it twice only moved the angle at which that happened.

It is now the same profile **revolved about the vertical axis** — a full
infinity cove, no edge to find from any angle, and a real thing rather than
a trick. Two details it needed:

- The pool of light is centred on the subject, so on a surface that wraps
  the whole way round the falloff is equal in every direction.
- `Math.PI * 2`, not `6.283`. The cove is a closed loop, so the last
  segment's end angle must be bit-identical to the first one's start;
  truncated tau leaves the ring 0.0002 rad short, which at this radius is a
  4 mm crack running across the floor — faint, dotted, and unmistakable
  once seen.

## R4 — the styling bench

The daughter's other idea, and the one that turns a photo toy into a game:
**you dress the unicorn before you shoot it.** Paint on five zones — mane,
tail, coat, horn, hooves — plus glitter.

### Paint is a rewrite, not a rebuild

Zones are recorded as vertex **ranges** while the meshes are built, so a
stroke rewrites three floats per vertex in a slice of an existing buffer.
Regenerating meshes per colour change would allocate a fresh GL buffer per
stroke and leak the old one unless tracked — the same bookkeeping, for more
work.

It also fell out that the rig only needs **six** meshes, not twelve: the four
legs are the same two boxes drawn through four matrices, so they share their
geometry and, usefully, their paint. Dyeing the hooves dyes all four, which
is what the player meant.

### A palette, not a colour wheel

A wheel is more expressive and much worse here. The brief has to ask for
something specific and the score has to say whether it got it, and both are
far easier to make honest against eight swatches than against a continuum
nobody can hit twice. Warmth is derived from the colour itself rather than
from a swatch number, so changing the palette cannot silently break a brief.

The rainbow swatch belongs to hair only — a rainbow coat is a different game
and a rainbow hoof is a mess.

### The UI is DOM

Buttons arrive with hit-testing, text layout, wrapping and touch handling
already written. In a 13 KB budget those are precisely the things not worth
writing twice.

### Glitter

Motes live in **bone-local space**, so they ride the pose for free: a rearing
unicorn's glitter rears with it and nothing is re-scattered when it moves.
Scattered once from a fixed seed, so the same unicorn always sparkles in the
same places and a photograph is reproducible.

The shake-off is closed form rather than integrated — each mote travels
along its own direction by an amount that rises and falls, with a droop
under it. No per-mote state to keep, nothing that can drift out of step with
the pose, and at the speed a shake happens the eye cannot tell.

Two goes at the look. The first made them squares of white stuck to the
coat: a sparkle is a **point that blows out**, and the blow-out has to come
from brightness rather than from area. Halving the quads and raising the
twinkle's exponent from 9 to 14 fixed it.

### The instrument

`tools/test-deco.mjs` reads the framebuffer back over the barrel and asks
what colour is actually there. Every cheaper way of asking tests the new
code against itself — the state says rose, the array says rose, the uploader
says it uploaded, and none of that is evidence that anything is rose on the
player's screen.

```
  the coat starts pale                            171,167,162  ok
  painting the coat rose warms it                 176,101,128  ok
  painting the coat sky cools it                   77,128,174  ok
  the rainbow swatch is inert on the coat                 0.0  ok
  one press puts glitter on the coat                114 quads  ok
  three presses put on more                         468 quads  ok
  a fourth press brushes it all off                   0 quads  ok
```

The thresholds are **relative** throughout — rose must lead blue by more
than the bare coat did — because an absolute one would be a test of the
studio lighting rather than of the paint.

## R5 — the game

Three phases in a loop. Take a commission and **style** the unicorn for it,
**shoot** it while it works the set, then look at what you got. Six frames a
job, three jobs a season.

### The unicorn works the set

A weighted table, not a state graph. A graph would let poses lead into each
other, which sounds better and plays worse: what a photographer needs is
that a big pose can arrive *at any moment*, not that it is reachable only
from standing. The showy four are rare **and** brief — the same lever pulled
twice, so a rearing unicorn is worth catching because it is worth points and
because you might miss it. Eye contact comes and goes on its own clock,
because a unicorn that stared down the lens forever would make the best shot
in the game free.

It only performs during the shoot. On the bench it stands still, so the
player can see what they are painting.

### Nothing here reads a pixel

The score grades the **state of the world at the moment of the shutter**,
projected onto the screen — which is what Pokémon Snap did, and it is why
this is tractable at all. Every term already exists in the simulation.

Two of the terms are worth defending:

- **Cropping is punished on the square** of what made the frame, so losing a
  quarter of the animal costs far more than a quarter of the marks. A
  photograph missing its subject's head is not three-quarters of a
  photograph.
- **Size is judged on height, not area.** A rearing unicorn is tall and
  narrow, a grazing one is long and low, and an area rule would quietly
  prefer whichever poses happen to be wide — rewarding a shape when it meant
  to reward a distance.

The rule of thirds is a **bonus, not a requirement**: dead centre is a real
choice and should not score as a mistake, it just does not earn this.

Every term is named, because the result screen has to say *why*. A number
alone teaches nothing; `mane toss +200, eye contact +150` teaches a player
what to point at next time.

### The brief

Without one, the score would have to judge taste — and it cannot, so it
would end up judging nothing and the styling would be a dress-up screen
bolted to the side of a photo game. A commission asks for warm or cool
colours, a glitter level and a pose to catch, which makes every swatch a
decision with an answer.

Matching is **graded, not pass/fail**: a warm-ish coat under a warm brief is
worth something, or the palette collapses to one right answer per job and
there is nothing left to choose. Warmth is read off the colours themselves,
so the brief cannot be broken by editing the palette.

### The photograph is a photograph

The shutter captures the canvas to a JPEG data URL and the result screen
shows it. It costs almost nothing and it is most of what makes this feel
like a camera rather than a scoreboard.

The capture has to happen **after the draw, inside the same frame**:
`preserveDrawingBuffer` keeps the frame only until the next clear, so a
capture taken from the input handler grabs a stale buffer. The shutter sets
a flag; the frame loop takes the picture.

A tap is a shutter and a drag is a camera move, told apart by how far the
finger travelled. There is no second button to give the shutter on a phone,
and asking a player to reach for one while the pose they want is happening
is asking them to miss it.

### The instrument

`tools/test-shoot.mjs` plays a whole season. Almost every failure in this
layer is **silent** — a phase that never advances, a shutter that fires with
no film, a photograph that captures an already-cleared buffer and comes back
black. None of them throw, and all of them look approximately like a working
game until you read the numbers.

```
  starts on the styling bench                         phase 0  ok
  the shoot starts with a full roll                    film 6  ok
  it works the set on its own                         3 poses  ok
  a frame scores something                            502 pts  ok
  the score is itemised                               5 lines  ok
  six frames end the job                              phase 2  ok
  the job scored                                      748 pts  ok
  it kept an actual photograph                          17 KB  ok
  three jobs make a season                    phase 2 round 2  ok
```

It earned itself immediately: `endRound` set the phase and built the result
card but never called `layout()`, so the sheet stayed `display:none`. The
card existed in the DOM — a query found the photograph inside it — and
nothing on screen had changed.

The audio probe was rewritten in the same pass, because the music now
follows the **phase** rather than the pose: the bench plays the bare
bassline, and the shoot brings in the kit and the hook. Its old assertion
had quietly stopped describing the game.

| | oscillators | noise |
| --- | ---: | ---: |
| the bench | 4.0/s | **0.0/s** |
| the shoot | **9.0/s** | 4.5/s |

## R6 — making skill worth something

The question was the one Rainbow Surfer asked with `--idle`: **can a player
who never aims score nearly as well as one who does?** `tools/test-balance-snap.mjs`
answers it by playing whole jobs under four policies — *idle* (default
camera, shutter on a timer), *framed* (aims, shoots on a timer), *timed*
(default camera, waits for a pose worth having) and *skilled* (both) — with
identical styling, so the one thing being measured is the one thing that
varies.

The first answer was **1.37x**, and everything below came out of chasing it.

### The camera could not be aimed

The rig was an orbit that always looked at the centre of the set, so
swinging it barely moved the subject in frame: composition priced at
**1.12x**, which is what "you cannot actually aim" looks like as a number.

It is a **tripod** now. The lens has its own heading and field of view, the
tripod walks round the cove, and aim speed scales with the field of view so
a long lens is not twitchy at exactly the moment precision starts to matter.
Drag aims, wheel zooms — a photographer's controls, and the whole of the
skill: hold the subject, fill the frame, wait for the moment.

### The unicorn stayed where it was put

It played its gaits on the spot, so one aim held forever. It walks the set
now, on a leash rather than against a wall — past its roaming radius it
steers back toward the middle instead of stopping at an invisible edge.

### Best-of-six was a lottery

A job kept its best frame, so six draws from the pose table almost always
contained a good one and the shutter was free. **The job is the whole roll
now**: every frame is summed, so a wasted frame is a wasted frame.

### The frame became a multiplier

Framing was another line item — 200 points for having the subject on screen
at all, with the pose and the eye contact added on top. So a rear paid the
same whether it filled the frame or sat in the far distance. It is a
multiplier on everything now: **a distant, badly composed photograph of a
rearing unicorn is not a good photograph of a rearing unicorn.**

The flat framing award was cut to 170 in the same pass, because with the
multiplier in place a large one is composition counted twice — and it was
drowning out the timing.

### The camera started already composed

Even then, idle framed at **0.69** of a perfect shot without touching
anything. A camera handed to you already composed is a camera you need not
use, so it starts at its widest now and you zoom to compose.

### Timing earned nothing

With everything multiplied by the frame, *timed* sat at 1.01x: a player who
had learned to wait but not to zoom saw no reward at all, which is exactly
the wrong lesson to give a learner. The pose term keeps a floor —
`0.35 + 0.65q` — so catching the moment pays something even when the framing
is poor, and pays properly when it is not.

### Where it landed

```
  policy      mean job    worst    best   frame   vs idle
  idle           1348      272    2597    0.29     1.00x
  framed         2642     1871    3680    0.88     1.96x
  timed          1800      878    2698    0.36     1.34x
  skilled        3993     3049    5247    0.97     2.96x
```

Both skills pay on their own — composition nearly doubles a score, timing
adds a third — and together they nearly triple it. The gate fails the build
below **1.6x**, because under that a player who never aims is within a bad
roll of one who does and the shutter stops being a decision.

`frame` is the composition multiplier at the moment each shutter fired, and
it is in the report because without it a low score is indistinguishable from
a broken servo in the harness. It earned that immediately: the first run of
the aiming policies fired on every iteration, so the servo got about six
steps across a whole job and never converged — the harness was measuring a
player who intends to compose and then shoots before finishing, which is
nobody.

## R7 — the front door

### The title

It sits over a **live set**: the unicorn is already working and the camera is
already following it, so the first thing anyone sees is the thing the game
is about. A menu over a frozen frame advertises a different game.

Rainbow Surfer's R14 lesson arrived again unchanged, and was solved the same
way. A camera pointed at its subject *centres that subject by definition*,
and the centre of the frame is where the words are — the first cut put
`UNICORN SNAP` straight across the unicorn's chest. Aiming the lens **below**
the subject lifts the animal into the top of the frame and leaves the band
underneath clear.

### The contact sheet

Every frame counts toward the job, so every frame is now on the result
screen with its own score, the keeper outlined. A result that shows only the
best frame hides the five decisions that actually moved the number, and a
player cannot learn from a photograph they never see.

It also immediately broke the result screen: the taller card pushed the only
button off the bottom of the viewport. **A result screen you cannot leave is
a soft lock, and it looks exactly like a working result screen until you try
it** — the card is capped to the viewport and scrolls now.

### Coaching, one control at a time

A hint low on the screen, where a viewfinder overlay belongs: *drag to aim*,
then *zoom in — fill the frame*, then *tap or SPACE to take the picture*.
Each disappears the moment its control has actually been used, because a
hint that stays up after you have obeyed it is noise, and noise is how
players learn to ignore the next one.

### The attract mode was handing out free framing

The balance probe caught this within minutes of the title existing, and it
was a genuine design fault rather than a harness problem. The title's camera
composes itself on the subject; carrying that into the job gave a player who
touched nothing a framing of **0.96**, and the whole game measured back at
**0.90x — worse than not playing at all.**

The bench keeps a good view, because the player is painting and needs to see
what they are painting. **The shoot hands over a wide lens**, like every
camera. Measured again over eight jobs a policy, with the title in place:

```
  policy      mean job    worst    best   frame   vs idle
  idle           1315      404    2004    0.32     1.00x
  framed         2939     2332    3701    0.95     2.24x
  timed          1917     1263    2577    0.35     1.46x
  skilled        3484     2891    4214    0.99     2.65x
```

Composition on its own more than doubles a score, timing on its own adds
half again, and together they come to **2.65x**.

A second, quieter version of the same fault: the attract camera also
overrode the fixed camera the styling probe asks for by URL, so that probe
started sampling the backdrop instead of the coat. Both are the same rule —
*an attract mode must not be driving anything a caller has asked to hold
still.*

## R8 — the viewfinder

The score arrived six frames late, on a card, after every decision had
already been made. **A photographer sees the picture before the shutter**,
so the two things the score is made of are now on screen while you aim.

### Two gauges, not one

`FRAME` and `MOMENT`, side by side, each going green on its own. A single
"shot quality" number would tell a player they are doing badly without
telling them *which half to fix* — and the balance probe had already
established that these are two separable skills worth 2.24x and 1.46x on
their own. The HUD says the same thing the scoring does.

`frameQuality` is exported and shared rather than reimplemented for the
gauge: a meter computed from its own copy of the formula drifts away from
the score it claims to predict the moment either is touched.

### Thirds guides

Two CSS gradients, four lines, no elements. They are the cheapest possible
tutorial for the one composition rule the score rewards — instead of being
told about the rule of thirds, you can see where the subject has to sit.

### The job became a checklist

`GOLDEN HOUR · warm OK · lots of glitter OK · rearing · FILM 6` — each
requirement its own chip, ticking as it is met, and the pose chip lighting
up at the moment the unicorn actually does it. A brief written as a sentence
is something you re-read mid-shoot; a row of chips is something you glance
at.

The HUD carries **its own scrim and its own light colour**. It has to be
legible over the bright paper and over the dark upper cove, and text that
borrows either one is unreadable against the other.

### Pinch, and a shutter button

Every live pointer is tracked, because pinch rests on knowing whether two
fingers are down at once: one finger aims, two zoom by the change in the
distance between them. Releasing one of two fingers must never fire the
shutter, which is why the tap test also checks that no pinch was in
progress.

And there is a real **SHOOT** button now. Tap-anywhere is right on a phone,
but on a trackpad a tap is indistinguishable from the beginning of a drag
until the finger has already moved — so the one control the whole game is
built around was the one control a trackpad could not reliably use. Its ring
turns green when both gauges are, which makes the button itself the last
piece of feedback before the shutter.

### The harness got a guard

The balance probe reads and drives the DEV hooks, which a shipping build
compiles out entirely. Run against one, its first evaluate died with
`SNAPSHOT is not a function` and said nothing about why — twice, in this
pass alone, both times because a packed build had just been made in the same
directory. It now checks for the hooks up front and names the fix, and
`npm run snap:balance` builds the right thing first. A footgun that fires
twice is a tooling defect, not a lapse.

Re-measured with the viewfinder in: **2.57x**, against 2.65x before it —
unchanged within the run-to-run spread, which is what a HUD ought to do to
a score.

## Where it goes next

- **A title screen**, which the game does not have at all yet — it opens
  straight onto the bench.
- **The contact sheet.** All six frames at the end of a job rather than only
  the best one, so a player can see the near misses they took.
- **A unicorn with moods.** It performs on a fixed table; it should play up
  to a player who is styling it well and sulk at one who is not.
- **Sound for the shutter's aftermath** — a frame that scores well should
  be audibly better than one that does not.
- **More jobs than six.** The commission list is short enough that a second
  season repeats it.
- **The music.** A strutting catwalk vamp — the joke the idea was born with,
  written rather than borrowed.

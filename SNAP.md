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
| R9, aiming with the phone | 11,603 | 337 |
| R9b, walking round it, and the button that did nothing | 11,728 | 125 |
| R9c, the diagnostic panel out again | 11,689 | −39 |
| R10, styling that changes behaviour | 12,153 | 464 |
| R10b, a contact sheet you can read | 12,203 | 50 |
| R10c, the same shot twice is worth less | 12,297 | 94 |

**1,015 bytes still in hand.**

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

Every term is named. The result screen no longer prints the list — see
*R10d* — but the names are what the one-sentence verdict reasons over, and
what the balance probe reads when it needs to know which skill a policy is
being paid for.

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

## R9 — walking round the unicorn with the phone

> **Removed in R11.** It worked, it was measured, and it was not playable
> in a child's hands. The reasoning below is kept because the decision it
> records — an API named, an experience described, and only one of them a
> good fit — is still the right way to have read that request.

The ask was WebXR. **What shipped is not WebXR, and that was a deliberate
call worth writing down**, because the request named an API and described an
experience, and only one of the two was a good fit.

`immersive-ar` needs ARCore, so it is Android-and-Chrome — **iOS Safari has
no WebXR at all** — and the DOM heads-up display would additionally need the
`dom-overlay` feature, narrowing it again. Beyond support: an AR session
puts the unicorn in your living room, and the one thing this game is about
standing in is a lit studio cove. A VR session on a phone wants a headset.

`DeviceOrientation` delivers the part a phone can actually do, on both
platforms.

### It cannot tell you where you walked

The first cut mapped the phone's rotation to the **lens heading**, which is
the honest reading of the sensor and the wrong reading of the request: what
was wanted was *walking around* the unicorn, and a gyroscope has nothing to
say about position. Integrating an accelerometer twice drifts metres within
seconds — "how far have I moved" is not a question this hardware answers.

So turning yourself is mapped to **stepping round the set**. The tripod
already orbits the cove, so turning right walks you right around the subject
with the lens held on it — and a finger drag still trims the aim from
wherever you are standing, so composition stays the player's. It is a
substitution, stated as one, and it is the one that makes a phone feel like
a window onto the animal.

### Relative, and accumulated

Two decisions, both of which the probe had opinions about.

**Relative to the pose it was switched on in**, not to compass north.
Absolute headings need a calibrated magnetometer, drift indoors, and would
point the player at a corner of the cove they never chose. Switching it off
and on again is therefore also a recentre.

**Yaw accumulates the wrapped step between consecutive readings** rather
than measuring against a fixed origin. The first cut did the latter, and the
test caught what that costs: `alpha` wraps at north, so a heading held
against one base flips the long way round the moment the player turns more
than half a circle from where they began — **a 10 degree movement across
north swung the lens 350 degrees.** Pitch stays absolute against its base,
because `beta` does not wrap for a phone anyone is holding and accumulating
it would drift against the clamp.

### The button that did nothing

Reported from a real phone: *"I press MOTION and nothing happens."* Exactly
right, and the cause was a one-line mistake with a category worth naming.

iOS will not deliver a single event until `requestPermission()` is granted
from inside a real gesture — which is why this is a button at all. But the
call had been written as

```js
const R = DeviceOrientationEvent.requestPermission;
if (R) { try { if (await R() !== 'granted') return; } catch (e) { return; } }
```

Pulled off its constructor, the method loses its receiver and throws. And
the `catch` — written to handle a refusal politely — **swallowed the throw
and returned**, so the button was pressed, did nothing, and said nothing. A
catch that hides the failure it was written for is worse than no catch.

It is called on the constructor now. And because a page can also legitimately
have no sensor access — an iframe without the gyroscope permission policy, a
browser with motion access switched off — the button now reports it: if no
reading arrives within a second and a half it says **NO SENSOR** instead of
sitting there looking armed.

### What the probe can and cannot settle

`tools/test-motion.mjs` emulates a touch device, dispatches orientation
events and checks that the button appears only where the gesture can work,
that each axis turns the lens the way a person holding the phone would
expect, that a finger drag stands down while the phone is aiming, and that
switching it off really stops it.

What it **cannot** settle is the one thing only hardware can: whether a real
phone reports the axes the way this assumes. The signs asserted in that file
are the *intent* — turn right, lens goes right — so if a device disagrees,
that is where the correction belongs, and the test will say which way it
went.

```
  hidden on the styling bench                          hidden  ok
  offered on a touch device, in the shoot               shown  ok
  ignored until it is switched on                 no movement  ok
  turning the phone right turns the lens right         -0.349  ok
  turning it left turns the lens left                   0.349  ok
  tipping it back looks up                              0.349  ok
  tipping it forward looks down                        -0.349  ok
  a drag stands down while the phone aims             unmoved  ok
  crossing north is a small step                        0.175  ok
  switching it off really stops it                    unmoved  ok
```

### The panel that settled it, and is gone again

A page with no sensor access fails *silently and identically to broken code*:
in a cross-origin iframe without an `allow="gyroscope"` permissions policy the
events simply never arrive — no error, no refused permission, nothing to
catch. This pass had already produced a real bug with exactly that symptom,
so a temporary readout was added rather than guessing between the two:
whether the page was framed, what `requestPermission` returned or threw, what
`featurePolicy` said, and live counts of orientation and motion events.

Confirmed working on a real phone, so it has been removed. The **NO SENSOR**
fallback stays, because that one is not diagnostics: it is what a player sees
when their browser blocks motion access, and a button that is pressed and
then does nothing is the failure this whole section is about.

## R10 — the styling became the strategy

Visuals and sound were called finished, so this pass is about the game. It
started with a measurement rather than an opinion — how often does the pose a
brief asks for actually happen?

```
  per 30s of shooting
  idle    3.25    prance  3.13    shake   1.88    walk  1.75
  toss    1.25    rear    1.13    graze   0.88    bow   0.88    trot  0.63
```

The wanted pose turned up **0.9 to 3 times per thirty seconds and held for
under two** — and nothing the player did could change that. Which named the
real hole: **the player had one verb.** Point and press. Everything else
happened beforehand, and had one right answer.

### Styling is not paint

What you put on the unicorn now changes what it *does*. Three rules, and the
bench states them in the player's own words, because behaviour nobody can
see is depth nobody plays with:

- **warm and bold** — it struts and rears, because it is showing off
- **cool and dark** — it bows, and it watches you for longer
- **glitter** — it shakes, which is what throws the stuff into the air

That last one is the strongest on purpose: glitter in the air is the best
thing a photograph of this animal can contain, so the styling choice and the
money shot are the same decision.

### The flash is the provocation

A photographer's only tool is the camera, so that is what provokes. The
shutter makes the unicorn look at you, and for a second or two afterwards it
is likelier to do something worth catching — which turns a frame into
currency: spend one to buy a better next one.

### Boredom is the clock the shoot never had

Dawdle and the poses thin out; keep dawdling and it lies down, which is the
plainest possible statement that the shoot has stalled. Every shutter resets
it, so a player who is working never meets it.

### Three findings that changed the design

**One:** the first `test-temper` compared a warm-and-glittered look against a
cool-and-plain one, and reported warmth as *weaker* than cool. Shares sum to
one, so the glitter rule trebling one pose pushed every other share down. One
variable at a time, or a rule cannot be attributed anything.

**Two, and the one that mattered:** the balance probe gained a `dressed`
policy — skilled, but styled for each brief — and it **lost**, 3,400 against
4,423 for a policy that ignored every brief and wore one warm look all
season. Cool was boosting *standing and grazing*, poses worth 30 and 40, so
obeying a cool brief spoiled all six frames to collect one styling bonus.
**A brief that is cheaper to disobey is not a brief.** Cool buys bows and eye
contact now — fewer, better moments against warm's many showy ones.

That fixed the sign and left a tie, which was its own answer: the styling
bonus was a flat 380 against a job worth four thousand, too small to be a
reason. It is a **share of the roll** now.

**Three:** boosting the flash and the boredom clock together made *waiting*
pointless — composition-only outscored composition-plus-timing, because
spraying the shutter summoned showy poses more reliably than patience did.
The flash helps; it must not decide. Boredom is for a player who has
stopped, not one who is being patient.

### Where it landed

```
  policy      mean job    worst    best   frame   vs idle
  idle           1562      325    2672    0.31     1.00x
  framed         4088     3044    4906    0.97     2.62x
  timed          2140     1603    2687    0.40     1.37x
  skilled        4380     3526    5383    0.97     2.80x
  dressed        4117     3256    5248    0.92     2.64x
```

Skill is worth **2.80x**, up from 2.57x, and the ordering is right again:
`skilled` beats `framed`, so timing earns its keep.

**`dressed` is honestly unresolved.** It sits 6% below `skilled` with the
spreads overlapping heavily at eight jobs a policy, and its framing measures
0.92 against 0.97 — a cool-dressed unicorn bows, and a bow is a harder shape
to frame than a strut. Whether that is the game being fair (harder shots for
better poses) or the harness's zoom servo coping badly cannot be separated
at this sample size. What *can* be said is that dressing to the brief no
longer costs 23% of the score, which is what it did before this pass.

## R10b — the contact sheet became readable

Reported from a phone: *"a shame you cannot click the photographs at the end
to understand what was good and what was bad."* Exactly right, and it was the
result screen contradicting its own scoring — **the job scores the whole
roll**, but only the keeper was inspectable, so five of the six numbers a
player was being judged on had no explanation attached.

Every frame opens now. Tapping a thumbnail swaps the large photograph and
its breakdown, and the caption names which frame it is. A 24-point frame
beside a 280-point one is the clearest lesson this game has to offer, once
you can put them side by side.

### Two things the same screenshot showed that nobody had mentioned

**The hint was teaching a move that loses.** Measured on a 390-wide phone:
the default framing scores 0.51, and zooming to the stop puts the subject
**94% outside the frame** and the shot's quality at zero — while the coach
said *"zoom in — fill the frame"*. Advice that stops being true halfway is
worse than none. It points at the gauge now: *zoom until FRAME turns green*,
which is where the answer actually lives.

**Portrait photographs came out black at the top.** A phone held upright
sees far more of the cove's ceiling than a monitor does, and the light pool
was centred for a landscape frame, so the upper third of every phone photo
read as an unlit room rather than a lit backdrop. The pool sits higher now
and falls off more gently upward than sideways.

## R10c — the same shot six times

Asked directly: *does taking the same shot several times score the same?*
It did. `scoreShot` saw only the present moment, so six identical
photographs were worth six times one — and a `samey` policy (aim once, then
spam one pose from one spot) measured **3,707 against 4,324 for playing
properly: 86% of the best score for no variety at all**, with the *highest*
framing of any policy, because a parked camera is the easiest one to keep
aimed.

A duplicate still earns its **framing**, because you did frame it. What it
stops earning is the **moment** — the pose, the eye contact, the glitter in
the air — at 0.68 per repeat. And the escape is the control the game already
had and barely used: **walk round the set**. Two rears from two sides are two
photographs, so the check is pose *and* bearing, within half a radian.

### Two rounds of overshoot, both caught by the probe

At 0.55 per repeat, `timed` — waits for good poses, never aims — fell to
**0.77x, below a policy that shoots at random**. Random shooting is more
varied by construction, so the harsh rate taught *do not bother waiting*,
which is the opposite of the lesson. Repetition should cost; patience should
not.

Softened to 0.68, `framed` still beat `skilled`: with only five showy poses,
selectivity naturally repeats. That is when it became clear the table was
missing the policy the rule was built for.

```
  policy      mean job    worst    best   frame   vs idle
  idle           1109      771    1560    0.39     1.00x
  timed          1263      579    1957    0.33     1.14x
  samey          2950     2379    3478    0.97     2.66x
  framed         3266     2491    3713    0.90     2.95x
  skilled        3388     2903    3880    0.91     3.06x
  dressed        3970     2936    4918    0.95     3.58x
  roaming        4185     3195    4942    0.93     3.78x
```

**`roaming` — aim, wait, and walk between frames — comes top at 3.78x**,
which is the answer the rule wanted: it rewards variety rather than punishing
selectivity. Dressing to the brief pays. And spamming one shot now takes 70%
of what playing properly earns, rather than 86%.

### The footgun got a shared guard

Every probe here reads the DEV hooks a shipping build compiles out, and
pointing one at a packed build kills it several frames in with a stack that
blames the assertion. That cost three separate debugging detours in this
session, each time because an `--O1` build had just been written to the same
directory. `tools/lib/require-dev.mjs` now says so in one line, and every
probe calls it before its first read.

## R10d — the gallery replaced the ledger

Reported, in the plainest possible terms: *the screen after a session is
number-itis; it has to be simpler — a gallery of photographs with thumbs up
or down.* Right, and the version it replaced was a fair description of what
the game was doing and a poor description of what the player had done. Six
photographs, each with its own itemised list — framing, size, pose, eye
contact, thirds, brief — plus a roll total and a styling total. Every number
true. None of them answering *was that a nice picture?*

So the screen is now a large photograph, a row of six thumbnails, and one
line: a 👍 or a 👎 and the single most useful thing that can be said about
the frame you are looking at. Each thumbnail carries its own thumb, so the
shape of a session is legible before you tap anything — five down and one up
is a different session from four up and two down, and you can see which is
which at a glance.

`verdict()` reasons over the same terms the score does, and the **order is
the whole design**. Faults are checked first and worst first: a photograph
that is half out of frame is not also *a lovely rear* — the crop is the only
thing worth saying about it. Only once a frame has no fault does it get told
what it did right, and again most-specific-first: glitter in the air beats
eye contact beats the name of the pose.

Two smaller decisions:

- **It opens on the best keeper, not the best score.** The highest-scoring
  frame of a bad roll is still a bad photograph, and greeting a player with
  a thumbs-down on the frame the game calls their best is just confusing.
- **The total survives, small and grey**, with the brief bonus beside it on
  the same line. Points are the season's currency and deleting them would
  make the season screen arrive from nowhere; they are simply no longer the
  first thing the screen says.

The probe changed with the screen. `test-shoot` used to assert on the
caption `frame N of M` and prove a tap worked by watching that caption
change — which the gallery would have broken silently, and which would not
work anyway now that two frames with the same fault honestly say the same
sentence. It reads the highlight ring instead: click a thumbnail that is not
the lit one, and the ring has to move to it.

## R11 — the phone session

Played on an iPhone with the person the game was made for. Six problems came
back in one message, and five of them are things a desktop can never show
you.

### The accelerometer is gone

It demoed beautifully and it did not survive contact with a nine-year-old:
the yaw wanders, the permission prompt is a coin flip inside an in-app
browser, and every drag fought the sensor for the same camera. **A control
that is delightful one time in three is worse than one that is not there.**
Out with it, along with its probe — 0.4 KB of source that was buying
frustration.

### The shutter was firing by itself

The worst of the six, because it spent film: *"jak sie kadruje kamera to sie
robia zdjecia samoistnie"*. A tap and a drag were told apart by asking
whether **one** pointer was left and whether a **shared** drag counter was
small — and both are true for the second finger leaving a pinch. Two-finger
zoom therefore ended in a photograph of wherever the camera had drifted to,
every time.

Every test is now about *this* pointer: how far it personally travelled, how
long it was down, and whether a second finger joined at any point before the
hand left the glass. The probe pinches, drags and taps in turn and checks
the film counter after each.

### The page was never told it was a page on a phone

There was no `<meta name=viewport>` at all. Mobile Safari lays such a page
out at 980 CSS pixels and scales it down, which is — in one stroke — why
every control read as too small and why the game could be pinched and
double-tapped into a zoomed page with its shutter off the bottom of the
screen. The shell now ships the viewport, `touch-action:none`,
`overscroll-behavior:none` and a no-select rule, and the game swallows
`gesturestart` for the iOS pinch that the meta does not stop.

On top of that, every control carries `min-height:44px` — Apple's own
figure, and the bench buttons were **30**. The probe walks every visible
button and fails on anything smaller than a fingertip.

### The bench was showing a statue

*"podczas kolorowania unicorn sie nie obraca i nie przemieszcza, stoi jak
słup"*. It did, and it was deliberate — "so the player can see what they are
painting" — and it was wrong: **you never saw the tail**, which is the part
a child paints first and then wants to look at. The unicorn now performs on
the bench as it does on the set, and the camera drifts round it until the
player takes hold of it.

### The thumbnails were six brown stamps

At 62 pixels on a 390-wide screen, the subject inside a contact-sheet frame
is a tenth of its width. Three to a row, sized off the card rather than off
a number, with the thumb badge on a dark chip so it reads against a bright
photograph.

## R12 — the second phone session

Five more, from the same pair of hands.

### Pinch did nothing on a Mac

Because **macOS does not send a second pointer for it**. Chrome turns a
trackpad pinch into a wheel event with `ctrlKey` set; Safari sends its own
`gesturestart`/`gesturechange` with a scale. Neither ever reached the
two-finger code, so the gesture that worked on a phone was dead on a laptop
— and worse, R11's blanket `preventDefault` on the gesture events had made
Safari's pinch do nothing at all rather than zoom the page. Both paths now
drive the same `zoomBy`, and the wheel listener is `passive:false` so its
`preventDefault` actually holds.

### The bench was written for readers

*"dzieci nie potrafią czytać"* — and the styling row said MANE, TAIL, COAT,
HORN, HOOF. **One 10×10 unicorn does all five buttons**: every pixel is
labelled with the zone it belongs to, and each button draws the whole animal
but lights only its own part, in the colour that part is currently painted.
So the icon says *which bit this changes* and *what you have already done to
it*, and the row needs no words. The name survives as the `title`, which is
the hover text and the accessible name both — that is what the probes click.

Two sizing bugs fell out of testing it at 375 CSS pixels, which is an iPhone
SE and the smallest screen anyone will bring: the icon row ran off the left
edge, and the nine swatches wrapped onto two lines. Swatches are narrower
now but never shorter — 34×44 — because the thumb rule is about the height
you can hit, not the width.

### The bench lens was composed on a monitor

A phone is tall and a unicorn is long, so the same vertical field of view
that frames it on a laptop cropped its nose and tail off a portrait screen.
The idle lens widens with the aspect instead of being one number. The bench
camera also tracks its subject about three times harder than the title does
— an animal three metres from the lens crosses the frame quickly, and a
styling screen must never be half a unicorn.

### The gallery became a feed

The R10d screen was one large photograph and a row of thumbnails you tapped
to swap it, which meant seven of your eight pictures were postage stamps and
the sentence you were reading belonged to whichever one was selected. A
phone already has the right idiom: **a column you scroll, every photograph
full width, every verdict under the photograph it is about**. Nothing to
tap, nothing to select — and the selection code went with it. Each frame is
capped at 42vh, contained rather than cropped, because the verdict talks
about the composition.

### Bigger again, and the other half of the trackpad

Fed straight back from the next sitting: the icons and swatches were better
but still not comfortable. Icons went to 42px inside 54px buttons and
swatches to 52 square, five to a row — which on an iPhone SE means the
controls take the lower half of the screen, so the portrait lens widens
again *and aims lower*, because a lens pointed down lifts its subject up the
frame and the clear space is at the top.

And pinch worked but panning did not, which is the same lesson twice:
**three different gestures arrive as one event on a Mac.** A pinch is a
wheel with `ctrlKey`; a two-finger drag is small pixel deltas, usually on
both axes; a mouse wheel is a big notch on one axis, or a line-mode delta.
The handler now tells all three apart, and the probe fires all three and
checks that each moves the thing it should and nothing it should not.

### A score you can play for

The season total is on every result screen now, with the personal best
beside it, rather than appearing three jobs later. And the roll is **eight
frames rather than six** — asked for directly, and the feed is what makes it
free: eight photographs scroll exactly as well as six, where eight
thumbnails would only have been smaller thumbnails.

## R13 — the studio calms down, and the part winks

Three from the same session, two of them about the styling bench.

### The feed would not scroll on a trackpad

The camera took **every** wheel event on the page, `preventDefault` and all,
which is right while you are aiming and wrong the moment a card taller than
the window is on screen: the result feed simply refused to move. It stands
aside on phase rather than on the event target — the sheet is the only thing
on screen once the roll is spent, and asking a `Window` whether it is inside
a `div` throws, which is how the first fix broke the pinch instead.

### The poses are the surprise

R11 gave the bench a living unicorn, and it went too far: it reared and
tossed its mane while the player was still choosing colours, which spends
the best thing the shoot has to offer before the shoot begins. The bench now
draws from the mooching half of the repertoire — stand, graze, wander — and
everything showy waits for the camera. The probe watches twelve seconds of
bench and fails if it sees a single showy pose.

### The part you pick winks

The icons say which zone a button edits; the wink says it on the animal,
where the player is actually looking. It flashes **light and then dark**
rather than twice toward white: the default coat is 93% grey, so lightening
it moved eleven levels out of 255 — measured, not guessed — while a dark
beat reads against any colour in the palette. Both beats are that zone's own
colour scaled, so the flash never lies about what the part is painted.

The probe samples the barrel as a **burst** rather than at two named
instants. A flash under a second long, checked at a moment the probe
calculates for itself, tests the probe's arithmetic about its own clock as
much as it tests the game.

### The drag was a viewfinder, not a touchscreen

Asked as a question — *shouldn't touch steering be inverted?* — and the
answer, measured rather than argued, was yes. A 120-pixel drag to the right
moved the subject **0.68 of a screen to the left**: the camera panned right,
which is exactly what a tripod head does and the opposite of what every
touchscreen anyone has ever held does. A child reaching to nudge the unicorn
back into frame pushed it further out.

The subject follows the finger now, on both axes, and the trackpad's
two-finger drag keeps the inverted signs that make it the same gesture. The
probe asserts the convention directly — drag right, `box.cx` goes up — so it
cannot quietly flip back.

## R14 — the verdict arrives before the shutter

Proposed as a question: *what if the thumbs and the feedback were live, and
the score climbed as you shot?* Both, and they are the same idea — the
gallery tells a player at the end of a job what they needed to know during
it.

The viewfinder now carries the **same sentence the gallery will use**, on
the frame you are currently aiming at: a thumb and the one thing wrong or
right with it. It is literally the same `verdict()` call, which is what
makes it trustworthy — a live hint computed a second way would eventually
disagree with the screen that scores you, and then it would be teaching a
different game.

Making that possible needed one thing lifted out of `scoreShot`: the
repetition count. "The same shot again" is the one verdict that depends on
what is already on the roll, and the viewfinder has to be able to say it
*before* the frame joins the roll. `repeats(roll, pose, bearing)` is now
shared by both.

Alongside it, a running total in the top row and a `+N` that rises toward it
each time the shutter fires. The total is **eased rather than snapped**, so
it reads as counting up rather than jumping, and the `+N` sits high enough
to miss both the coaching line and the subject — it landed on both in the
first cut.

### "How is nothing much happening?"

Asked over a close, well composed photograph of a unicorn that had lain
down and gone to sleep. The arithmetic was right — sleep is worth 25 — and
the sentence was useless: it read as the game not having looked at the
picture at all.

Two fixes, both about what the words are for. **The pose gets named**, so a
thumbs-down says *only standing* or *only grazing* rather than a shrug. And
because the faults are checked worst-first, anything reaching that line has
already passed the crop and the distance — the player got the hard half
right, so the line says so: *nice frame — only standing*.

Sleep keeps its own line, because it is not a dull pose like the others: it
is the game saying it is bored, and the fix is a control the player already
has. *Fast asleep — flash it awake.*

## R15 — the hair was inside the horse

Reported from play, and it was real: *"czasem włosy wchodzą w ciało"*. This
is the kind of fault a screenshot argues about and a number settles, so the
first thing built was the number.

`tools/test-hair.mjs` asks how deep inside the drawn geometry each strand
point gets — and it asks against **the boxes the renderer actually draws**,
read out of the build under DEV rather than copied into the probe, because a
second table of body sizes drifts away from the first and quietly starts
testing nothing. A point counts as inside only if it is 3.5 cm past the
surface on every axis at once; hair is allowed to lie against the skin.

The first measurement, every pose:

```
  pose        deepest   points inside   of
  idle          0.199           730     5040
  rear          0.200           722     5040
```

**A seventh of the hair was inside the animal, the worst of it 20 cm in.**
(That first table, and the zero it eventually reached, were both measured
through a broken `?pose=` — see *R16* — so they are eleven readings of a
*standing* unicorn. The moving poses were still wrong, and nobody knew.)
The collider was two spheres — one skull, one neck — and the barrel had
none at all, so the crest fell through the withers and the tail hung inside
the rump.

Stringing eight more spheres along the body got the worst case from 20 cm to
7 cm and then stopped, for a reason worth writing down: **a sphere inscribed
in a box leaves the box's corners outside it**, and a shoulder is a corner.
So the collider became the box. A bone matrix is a rotation and a
translation, so the inverse is the transposed rotation applied to
`point - origin` — no general inverse, and none affordable — and a point
inside all three half-extents is pushed out through its shallowest face.

Six boxes: barrel, rump, chest, two neck segments, skull. **Zero points
inside, in all eleven poses.**

### And the hair itself

The second half of the report was that the mane looks odd next to the full
version in the games repo. It will: that one drives a kit hair system with
four times the strands, per-root slabs along the nape and its own collider
hulls, and none of that fits in what is left of 13,312 bytes. Two things
that did fit and are most of the visible difference:

- **A third pair of root rows**, out on the sides of the neck rather than on
  the crest line. Two rows a centimetre apart read as a painted stripe from
  the side and as a fin from the front.
- **Narrower ribbons**: a half-width of 0.055 against a segment length of
  0.095 made every quad wider than it was tall, so the hair read as a row of
  tiles. A strand is longer than it is wide.

## R16 — the brief is gone, the set has an edge, and it jumps

Three asks in one message, and the first was a reversal of an earlier one.

### "Nobody will get the session goals, children certainly not"

The brief was asked for eight rounds ago, on the grounds that a commission
system would make the game look more finished for the competition. Played
with the person it is for, it read as homework: three requirements in
chips at the top of the screen, two of them about colour theory, and a
bonus that only pays if you remember them while a unicorn is running about.
*"Ja bym po prostu robił sesje i tyle."*

So it is gone — `brief.js`, the chips, the pose bonus, the styling bonus,
the season arc of pose pools. **It freed 456 bytes**, which is most of what
paid for what follows, and it leaves the styling standing on the thing that
was always the better argument for it: the look changes what the unicorn
*does*, and showy poses are worth more points. That is a strategy a child
can find by playing rather than one that has to be read.

The top row is `SESSION 1/3` now. The score, the film counter and the live
verdict are the whole HUD.

### Three new poses, and a gallop that goes somewhere

`JUMP`, `BUCK` and `SPIN`. The jump is the only pose in the game that
leaves the ground, which makes it the hardest to catch and the best paid at
340. And `GALLOP` had **no entry in the speed table at all** — the fastest
gait in the game covered no ground, which is a treadmill. Walking, trotting
and galloping between them now carry a third of the table's weight, because
a subject that never crosses the set never teaches anyone to follow it.

### The set has an edge

An infinity cove is a backdrop with no join and no corner anywhere. That is
exactly what a photographer wants and exactly what makes movement invisible:
a unicorn crossing a featureless field of paper only ever reads as a unicorn
getting bigger. There is a **taped circle on the floor** now, dashed, the
way a real studio marks the ground a subject works on — and the roaming
leash sits just inside it, so the mark and the behaviour say the same thing.

### What removing the brief cost, measured

```
  policy      mean job    worst    best   frame   vs idle
  idle           1320      623    2070    0.42     1.00x
  timed          1523      820    2335    0.41     1.15x
  samey          3207     2514    3773    0.97     2.43x
  framed         4152     3617    4717    0.95     3.15x
  dressed        4186     3316    4835    0.96     3.17x
  skilled        4208     3659    5010    0.98     3.19x
  roaming        4602     3624    5839    0.94     3.49x
```

Two things to read here honestly. Walking the set still wins (3.49x) and
spamming one shot still takes 70% of what playing properly earns, so the
variety rule survived the change. But **`dressed` and `skilled` are now the
same number**: with the brief bonus gone, dressing to buy showy poses is
worth nothing measurable on top of aiming and waiting, because a patient
photographer gets the pose eventually anyway.

That is a real cost and it is worth naming rather than hiding: in R10 the
styling was the strategy layer, and it is now expression plus a mild change
in what the subject does. The lever that would bring it back is lowering the
base weights of the showy poses so a plain unicorn genuinely offers fewer of
them - but that makes the game duller for a child who just wants to point
the camera, which is exactly the player this round was for. Left as it is,
deliberately.

### The correction: that zero was eleven readings of the same pose

Fixing `?pose=` immediately falsified the claim made one round earlier.
R15's hair probe reported zero points inside the unicorn in all eleven
poses; with the query working, the same probe on the same code found the
hair inside the animal in **five of them** — every pose that moves. The
earlier zero was true and useless: it was the idle pose, measured eleven
times.

Two guesses were tried against the new numbers and both were wrong. A
second solver pass, on the theory that pushing a point out of the body and
then constraining the next one was a convergence problem: **no change**. Leg
colliders, on the theory that the tail was catching a hind leg: **no
change**. Then the probe was asked *which box* the strays were in, which
took a minute and answered it completely — every stray point, in every pose,
was in the **muzzle**. The forelock falls forward off the poll and straight
through the nose.

One more collider, and it is zero across all fourteen poses. The leg hulls
came back out for changing nothing; the second pass stayed, having earned
its keep on exactly one case — the 21 Hz shimmy of a shake, where it was the
difference between one strand through the shoulder and none.

### The probe that had stopped being a probe

Fixing the jump meant looking at `?pose=`, and `?pose=` had been broken
since the title screen was added: the query was parsed *before* `newRound()`,
which resets the mode to standing. **Every pose screenshot and every run of
`test-pose` since then was of a standing unicorn** — and all of them passed,
because a standing unicorn does stand on the ground.

A probe that cannot fail is not a probe. With it working again all eleven
old poses still hold, which is the good news, and the jump immediately did
not: at a 0.62 lift the lowest hoof reached **90 cm** of air, a unicorn on a
trampoline. It is 0.34 now, and the probe asserts both halves of a jump —
that it leaves the ground, and that it comes back.

The buck failed the same way in the same session, visibly rather than
numerically: the first cut had the sign inverted and swung both hind legs
forward under the belly. Backward is positive, and a bone above the root
inherits the root's pitch.

## R17 — a statue on a turntable, a loud floor mark, and an argument between two boxes

Two from a play session, both about things being noticed that should not
have been noticeable.

### It span without moving its legs

Exactly right, and exactly what the code said: `move()` applied the actor's
yaw rate whatever the animal was doing, so a standing or grazing unicorn
swung slowly round with all four hooves planted. Turning is footwork now -
only the poses that have any (walk, trot, gallop, prance, spin) may change
heading, and the roaming leash steers only when there are feet under it.

`test-shoot` samples pose and heading together for seven seconds and fails
on any drift at all while the hooves are planted. Measured: 0.000 rad over
25 planted samples.

### And the hair was back inside, for a third reason

The suite caught a shake with one strand 4.1 cm inside the animal, so the
probe was asked again which box - and this time the answer was *the chest,
and the barrel, and the legs, and the base of the horn*, across a fifth of
the frames of that pose.

The body being **three** hulls was the problem. A point pushed out through
the chest's nearest face lands inside the barrel; the next pass pushes it
back into the chest; a 21 Hz shimmy catches it mid-argument. Their union is
barely bigger than the barrel alone - a barrel is most of a horse - so the
body is one box now and the oscillation has nowhere to happen.

The legs went back in at the same time. They were guessed in once, measured
out again when the only strays left were in the muzzle, and measured back in
when the shake - which swings the whole body over its feet - turned out to
bury the tail in a hind leg. Guessing put them in and out; the probe decided
it.

And then the shake failed once more, at 3.5 cm - dead on the threshold -
and the diagnostic named the chest again, which by then was *inside* the
merged body hull and could not be reached from outside it. Merging the body
had not removed the argument, it had moved it: pushed out of a leg or the
neck, a point lands back inside the body, which is checked first in the list
and never revisited. **The hull list is walked twice per point now.** Same
fix as the strand solver, one level up.

Zero points inside, all fourteen poses, three runs, with the worst reading
in the shake down from 8.3 cm to 2.5 - comfortably under the 3.5 cm the
probe allows for hair lying against skin, and about half a strand's own
width.

### The floor mark read as gaffer tape

The set needed an edge and got a dashed band 16 cm wide at 58% of the
paper's brightness. It worked, in the sense that travel became legible, and
it was the first thing the eye landed on - ahead of the unicorn, in a game
about photographing the unicorn. *"Nie tak chamska przerywana linia."*

What a worked studio floor actually has is a faint continuous ring where the
subject has been walked round for years: unbroken, a finger wide, barely
darker than the paper. Same reference for the eye, no longer in the
photograph.

## R18 — the hair was tinsel

*"Nie pasuje mi, że one są jakieś takie pół przezroczyste jak łańcuch
choinkowy."* Correct, and the culprit was a leftover: the mane was drawn
twice, as a solid core and as a wide additive halo around it.

The halo came from Rainbow Surfer, where the mane glowed against a night
sky. Against a lit studio sweep it never glowed — adding light to an
already-bright surface changes almost nothing, which was known and written
down two rounds into this game — and what it did instead was hang a
translucent fringe twice the width of the strand around every piece of hair.
Overlapping strands showed the body through each other. Tinsel.

**Hair is opaque.** The halo is gone, which also removes half the mane's
geometry and the second material it needed. Two adjustments came with it,
both because the halo had been quietly doing work nobody asked it to do:

- **The ribbons are wider** (0.064 half-width, up from 0.042). The halo used
  to fill the gaps between strands, and without it the neck showed through
  the mane. Still narrower than a segment is long, so a quad reads as a
  strand rather than as a tile.
- **Each strand is shaded a few percent differently from its neighbour.**
  Flat opaque colour turned a pink mane into one moulded plastic piece;
  there was nothing left to tell one strand from the next. The shade is
  dealt out by strand index so neighbours always differ.

### Three faults, one shortcut

Then, on the same hair: *it looks like cut tissue paper, there are little
gaps between the segments, and it does not react to the light at all.* All
three were the same shortcut — a quad is not a surface.

**The gaps.** The sideways vector was computed per segment, from that
segment's own direction, so where a strand bends the two quads meeting at a
point were rotated slightly differently and their corners did not touch. It
is computed per **point** now, off the average of the segments either side,
so consecutive quads share their corners exactly and a strand is one
continuous band.

**The light.** Every hair vertex carried a hard-coded normal of straight up,
which made the one lambert term in the shader a constant. The hair could not
be lit, shaded, or turned away from the light — it read as cut paper because
that is precisely what it was. Each edge of the ribbon now gets a normal
tilted **outward** from the strand's plane, as if the band were the front of
a round tuft: the middle faces the lens, the edges lean away, and the
gradient across every strand is what says *hair* rather than *sticker*.

One correction fell out of that immediately. A billboard's own normal points
at the lens, which is at right angles to a light coming from above, so
shading it honestly made every strand dark — the mane went murky the moment
it stopped being flat-lit. The normals carry a standing up-component too, so
the hair catches the key light the way the body does and the side lean
supplies the gradient.

With real shading in place the per-strand tint went from ±18% to ±10%: it
only has to break neighbours apart now, not carry the whole impression of
depth on its own.

### Rubber tubes that do not shine

Shaded hair was better and still wrong: *"trochę takie rurki teraz i nie
błyszczą się"*. Right again — lambert alone gives a smooth gradient across a
band, and a smooth gradient across a band is a tube. What says *hair* is the
highlight running along it.

So the shader learned one new trick, a **sheen**: Blinn-Phong off the
half-vector, per vertex, behind a `spc` uniform that is zero for everything
in the game except the mane and tail. Eight points a strand is coarse for a
specular term, and it does not matter: a strand is thin, so what you see is
a bright band sliding along it as the camera moves, which is what real hair
does.

And the whole argument stopped being about screenshots, because
`tools/test-shine.mjs` now measures it. The camera goes round the mane from
six angles, the raw pixels come back, the hair is picked out of them by
colour, and the probe reports the **spread of brightness across the hair**:

```
                        spread, by angle
  flat-lit (before)    18  18  18  18  18  18
  shaded + sheen       33  29  35  59  74  52
```

Eighteen levels from all six angles, to the level — that is the numeric
signature of paper. Every bit of that spread was the per-strand tint and not
one level of it was the light. It reads 47 mean now, and 74 at the angle
where the highlight lands.

### Still tubes: the fault was the width, not the shading

*"Ciągle wygląda jak dmuchańce/rurki."* And the honest reading of that is
that the last two rounds of work made it worse in one specific way: a
ribbon 13 cm across, smoothly shaded edge to edge with a highlight down the
middle, is the exact recipe for a rounded plastic tube. Every improvement to
the shading made the tube more convincing.

**Hair does not read as volume. It reads as count.** Many thin pieces with
hard edges between them, not few fat ones with a gradient.

So each solved chain now carries **three thin ribbons** instead of one wide
one — 3 cm across, spaced 4 cm apart, each a shade off its siblings so the
seam between them is visible. Splitting at the drawing stage rather than
adding roots keeps the solver's work identical (one chain still swings,
three ribbons ride it) and costs geometry rather than bytes, which is the
resource this game has left.

The shine probe holds through the change: 44 mean, 64 at the best angle,
against the flat 18.

### And a gate that had been quietly diluted

The suite caught something the hair work had nothing to do with: a bored
subject lying down **6.3%** of the time against a 15% threshold, and 12.8%
on a re-run. It used to be 18 to 22%.

Not a boundary flake. R16 put three new poses into the repertoire and gave
the travelling gaits a third of its weight, and sleep is **gated on boredom
rather than weighted against anything** — so every pose added anywhere else
in the table pushed it down. A gate has to be sized against the table it
competes with, not set once and left there while the table grows around it.

Two guesses, both measured: 17 overshot to 31.8%, and 13 lands at **19.6%**,
back inside the band the design had before. The number in the file is the
one the probe agreed with.

## Where it goes next

- **A title screen**, which the game does not have at all yet — it opens
  straight onto the bench.
- **A unicorn with moods.** It performs on a fixed table; it should play up
  to a player who is styling it well and sulk at one who is not.
- **Sound for the shutter's aftermath** — a frame that scores well should
  be audibly better than one that does not.
- **Settling `dressed`.** More jobs a policy, or a harness that frames a bow
  as competently as a strut, would say whether styling pays or merely stops
  costing.
- **The music.** A strutting catwalk vamp — the joke the idea was born with,
  written rather than borrowed.

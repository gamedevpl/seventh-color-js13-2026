# RAINBOW SURFER — the second entry, 3D

Run the rainbow down, then ride it. A wipeout-style chase along a track
that grows forward through the night sky, splits into two routes now and
then, and breaks open into jumps. Completely separate code from game one,
sharing only the build/measure/verify toolchain (`--game=strands` on the
same tools, so byte numbers stay comparable).

## Architecture (R1)

```
strands/src/
  gl.js      raw WebGL, one shader, three materials: SOLID (lambert+fog),
             GLOW (additive, no depth write), GLASS (lambert+fog, alpha
             blended, no depth write - the deck)
  course.js  the course: grows FORWARD, never loops. Splits into two
             parallel routes and closes again a few nodes later; some
             edges are GAPS you have to jump. Each node stores its own
             tangent, so flow through a split or a merge is continuous by
             construction
  track.js   hermite curves between nodes, arc-length tables, the deck and
             neon meshes, and the ONE rail-rider that moves both the
             player and the rainbow
  uni.js     the unicorn as boxes; the head is its own mesh on a neck pivot
  ribbon.js  the rainbow: flees forward, its spine resampled through
             Catmull-Rom so it is a curve rather than a chain of sticks,
             with orbiting strands, haze sheets and drifting motes
  main.js    loop, lane steering, the jump and its flight cutscene, surf
             mode, chase camera, HUD, adaptive score
```

## R2 - the run became physical (and the forks went the way of the maze)

"Hold up-arrow to go fast" was not a game. Now SPEED IS A RESOURCE:

- **Stardust** is scattered along the deck (denser before demands, strung
  along every jump arc) and the boost BURNS it - ~10/s on the deck, more
  in the air. No dust, no boost: cruise is 15, boost tops at 34.
- **Demands**: serpentines need 20, corkscrews 23 - carried through the
  whole section, or half a second under the minimum slides you off the
  track. Demand sections have hot-pink rails: read the track, not a HUD.
- **Gaps** need momentum: flight speed under the requirement makes you
  SINK below the far lip - and a mid-air boost (burning dust) can save
  you. Air steering drifts the landing line onto the stars strung along
  the arc.
- **Dives are free speed** (gravity along the tangent, coefficient raised)
  and climbs bleed it - the course is a rhythm chart for the throttle.
- **Falling is soft**: respawn one node back, with pity stardust so a dry
  tank cannot soft-lock in front of the same demand forever.
- **As the rainbow the boost is free** - you are made of the stuff - and
  the seven-colour burn clock is the cost instead. Falls while burning
  also tear the rainbow away.
- **Forks are gone.** The course is one joyful line; sections (cruise /
  serpentine / dive / climb / gap / corkscrew) give it rhythm, and the
  lane now exists for gathering stardust, not choosing roads.
- Particles: four-point bloom sparkles burst off every pickup, stream
  behind the airborne unicorn and spark off hooves at high speed.
- The unicorn is drawn in the RAW track frame, perpendicular to the deck
  it stands on - only the camera gets the smoothing. It was visibly
  aligned to the eased camera frame before, which read as floaty.

## R9 - the long bend, and an instrument that was lying about it

The course had two kinds of turn - the serpentine's flick from side to side
and the wiggle inside a cruise - and no third kind. Nothing you *lean*
through. A **sweeper** section: one direction held for seven to eleven
nodes at ten to fourteen degrees each, so the bank comes on and stays on
for around 250 units of track. Measured over 60 courses: **3.0 sustained
arcs, averaging 147 degrees of held bend.**

It TIGHTENS as it goes, six percent more angle per node, so the outward
push builds and you have to keep committing rather than coast the whole
bend on one input.

**It carries no speed demand, deliberately.** The first cut put `req` on
every sweeper node and demand nodes went from 39.5 to 63.3 per course -
over half the track in hot pink. Pink rails mean one thing, a minimum
speed, and marking half the course with it is the same as marking none.
The sweeper tests the other skill, holding a line against a push that
never lets up, and it earns its teeth from geometry instead. Demand nodes
came back to 36.4.

Serpentines are longer too - six to ten flicks where they were four to
seven - and a shade sharper, with the demand raised from 18-25 to 19-26.

### The harness was steering the wrong way

The balance policy weaved on a fixed schedule, blind to the track. Through
a sustained arc that means steering *out* of the bend for roughly half of
it, so the harness charged every sweeper for a mistake a player is not
making. It reported falls doubling and I nearly tuned the section down on
that number.

`test-balance.mjs --skill` closes the loop on the probe instead and steers
into the bend - matching the sign of `turnRate`, since left is +1 in
`turnDir` and the centrifugal term is `-turnRate`, so they cancel when the
signs agree - with a second term pulling a drifting lane back to the
middle, held at 90ms inside the lane's 0.38s time constant.

| policy | falls / 40s | rainbow |
| --- | ---: | ---: |
| blind (never reads a bend) | 4, 2, 4 | 34%, 7%, 28% |
| skilled (steers into it) | 0, 0, 1 | 68%, 39%, 52% |

The two together are the answer, not either alone: a player who reads the
road is barely troubled by the arcs, and one who does not is thrown by
them. That is the difficulty being *in the right place*. The old single
number could not tell those apart.

## R8 - light where the motion is, and a deck that behaves like glass

### The snowstorm

"They should fly faster the nearer they are to the edge of the screen."
They already did - that is the trouble.

For a camera translating forward, a static point sweeps the frame at
`v*sin(theta)/dist`: nothing at all at the vanishing point, fastest out at
the edges. But the streak's own length scales by the identical factor - the
`R/(R^2+z^2)` that cancelled out in R7 - so every mote looked equally
lively. The far axial ones crawled while shining exactly as bright as the
ones whipping past your ear, and a field of uniform slow dots is the
definition of a snowstorm.

So brightness now rides that same optical flow: `perp/dist^2`, normalised
and squared. The crawlers fade out of the picture entirely (they are culled
below alpha 0.01, so they cost no fill either), and the fast ones at the
edges keep the light. A small length bonus, up to 1.6x, gives the edges the
long lines the eye expects.

| | drawn motes | within 12u |
| --- | ---: | ---: |
| before, speedN 0.6-0.8 | 56 | 8.3 |
| after, speedN 0.6-0.8 | 38 | 8.3 |

Fewer than two-thirds as many motes drawn, with the close traffic - the
part you actually read as speed - untouched. `test-dust.mjs` guards the
worst per-mote overlap now, not the average, since it is the longest streak
on screen that decides whether anything reads as standing geometry: 3.6x,
under the 4x limit.

### The glass

The deck was already a translucent sheet; now it reflects. A planar mirror,
one plane through the rider along the DECK's own normal - `rUp`, not
`rUp2`, because `rUp2` carries the cosmetic lean and hanging a mirror off a
pose rather than the road would tilt the whole reflection with a flourish
the track never made. The rainbow, the unicorn and its head, the stardust
and the sparks are all drawn a second time through that matrix, additively,
at a third of their brightness. The neon rails go through it too, and their
reflected pair inboard of the real ones is what makes the deck read as a
pane with thickness rather than a decal.

**It needs a mask.** A mirror image floating beside the track - out over a
gap, past the edge, in open air - is worse than no mirror at all. The deck
marks the stencil buffer as it draws, and the reflected pass lands only
where the deck itself appeared on screen. The deck is drawn after the
solids and tests depth, so a stretch of it hidden behind scenery marks
nothing and reflects nothing, for free.

The plane is local, so distant deck reflects through the wrong plane and is
somewhat wrong for it. Fog, a third brightness and a handful of pixels make
that academic.

Cost: **227 bytes** and about 4 fps of the software rasteriser's 39 - the
same order as the dust, and nothing at all on a real GPU.

## R7 - the streak becomes a smear, and the cone gets tight

"They still hang in the air instead of flying past." Right, and the whole
effect collapses to one ratio.

For a mote at lateral offset R and axial distance z the screen angle is
`atan(R/z)`. Differentiate: both the per-frame angular motion and the
streak's angular length scale by the same `R/(R^2+z^2)`. They cancel, so

```
angular motion per frame / angular streak length  =  vl / len
```

everywhere on screen, wherever the mote sits - one scalar for the entire
effect. `vl` is how far the camera actually moved this frame. A real
exposure gives exactly 1: successive smears abut, no overlap, no gap.

The streak length was a constant `2 + speedN*26`, up to 28 units, against a
`vl` of about 0.6. **Overlap factor 23-37x, measured**: every dash covering
its own next position by 97%. That is not a smear, it is a rod hanging in
space, and no amount of tuning colour or count would have fixed it. `len`
rides `vl` now, at `1.4 + speedN*1.2` frames of exposure - a mild
exaggeration over the honest 1, and frame-rate-correct for free.

| | streak | overlap |
| --- | ---: | ---: |
| before, speedN 0.5 | 15.1u | 22.9x |
| before, speedN 0.7 | 19.7u | 23.4x |
| after, speedN 0.5 | 1.37u | 2.0x |
| after, speedN 0.7 | 1.78u | 2.2x |

**Then it was too subtle, and density was the reason.** The motes filled a
cone 38 units in radius and 150 deep, and the ones that read as speed are
the ones that pass close enough to sweep across the frame - measured at
**0.2 to 1.2 within 12 units** at any moment. A third of the width and half
the depth gives **1.7 to 8.9**, roughly seven times the close traffic, with
*fewer* motes in total (56 against 109 at speed). Subtler and faster at the
same time.

**And the fade moved from distance to age.** Fading by distance is what
forced motes to be born far away and dim - which took out precisely the
near ones that move. Each now carries a fade-in it swells through over a
third of a second, so one can appear anywhere, including beside your ear.

`tools/test-dust.mjs` reports the overlap factor and the close count from
the running game, and fails above 4x. Run against the old code it fails.

## R6 - the dust approaches, and the jump is allowed to be sharp

Three defects in the speed effect, all of them reported as "feel" and all of
them one-line sign or shape errors.

**The motes vibrated instead of approaching.** Each streak was drawn from
the mote *away* from the direction of travel - the intuitive reading of "a
trail behind it". But the mote is static and the camera is the thing that
moves: over one frame's exposure the mote's image sweeps from `p + v*len`
to `p`, so the streak belongs on the far side, pointing back toward the
vanishing point. Drawn the other way the streak anchored on the wrong side
of the mote, and every frame the mote appeared to hop forward a whole
streak-length. One sign; the difference between rushing past you and
buzzing in place.

**Motes blinked as the speed wobbled.** Density was culled by an index
count that tracked speed, so a mote at the boundary switched on and off
several times a second while cruising. Replaced with a per-mote fade band -
each mote wakes over a stretch of speed rather than at a threshold:

```js
const wa = (wake * wake - i / DMAX) * 8;   // > 1 fully awake, 0..1 fading in
if (wa <= 0) break;                        // everything past here is asleep
```

The count still rides speed squared; only the edge is soft now.

**The jump was a hall of mirrors.** Both effects were *boosted* by the
cinematic flag: the blur added `cine * .3` and the dust kept its full
alpha. But the jump is the one held shot in the game, and during it the
camera pulls back and swings sideways - so its velocity, which is exactly
what the streaks are drawn along, stops having anything to do with where
the unicorn is going. Streaks raked across the frame while three composite
copies ghosted over each other: reported, precisely, as "I feel like I've
gone cross-eyed". Both now stand down for the flight (`* (1 - cine)` on the
dust with an early out, `* (1 - cine * .9)` on the blur), and the ordinary
running blur - which the report said was fine - is untouched.

## R5 - speed you fly through, not speed painted on

The old speed effect was a fan of screen-space rays at fixed angles that
merely got longer. Fixed angles do not move, so it read as wallpaper with a
zoom on it. Replaced with **speed dust**: motes anchored in the WORLD that
you fly through. They stream past, sweep sideways when you turn (they do
not turn with you), and each is drawn as a streak along the camera's actual
frame-to-frame velocity - so the streak's length IS that mote's motion
blur, not a decoration standing in for one. Density rides speed squared:

| speed | motes awake (of 230) | streak |
| ---: | ---: | ---: |
| 90 km/h | 0 | - |
| 180 km/h | 13 | 10.7u |
| 270 km/h | 65 | 17.3u |
| 414 km/h | 230 | 28.0u |

They fade in with distance at both ends, so nothing pops into being in your
face and nothing vanishes at the horizon.

**The zoom blur got measured rather than piled on.** Six full-screen
composite passes cost a third of the frame rate: an A/B in the headless
harness put the blur at about -9 fps and the dust at about -4, against a
~50 fps baseline in software rasterisation. Three passes spaced wider and
pushed harder look the same and give most of it back (37 -> 41 fps).
`preserveDrawingBuffer`, which the blur needs to read the frame back,
measured at about half a frame per second - not worth a second thought.

## R4 - the run gets a shape, and beating it gets a reason

Two measurements drove this pass. First, the course had **no memory**: its
sections were drawn from a flat distribution for the whole run, so the last
minute was exactly as hard as the first - nothing built, nothing paid off.
The section mix now ramps with progress, and the minimum speeds ramp with
it (serpentines 18 -> 25, corkscrews 21 -> 28). Measured over 25 courses,
per 100 nodes: corkscrews 2.6 early -> 7.1 late, demand nodes 28 -> 40.

Second, the **corkscrew - the signature move - showed up once every 27
seconds**. It is now roughly every 15, but earned: its weight starts near
zero at the gate and is the single most likely section by the end. Seeding
it from the start (the first attempt) just moved the difficulty forward
instead of building it - the balance probe caught that immediately, with
falls tripling and the rainbow caught in 19% of frames instead of 44%.

Run length went 170 -> 120 nodes, about 90 seconds instead of 134: a
score-chase run should end while you still want another one, and a shorter
line makes the ramp felt rather than merely present.

And the meta layer, because in a score game the end screen IS the reason to
press the button again:

- **The best run persists** through `localStorage`, read and written inside
  try/catch - a private window or blocked site data must not take the game
  down with it, and file:// origins refuse storage outright.
- **The end screen** leads with the score at 52px, marks NEW BEST, and
  breaks the run into the three things you can get better at: longest
  single burn, jumps landed, falls.
- **A progress bar** for the line itself, so the run has a visible middle.
- **The score runs on stardust too**: an empty tank strips the arp and most
  of the hats out of the mix and drops a low pulse under it, so you hear
  the fuel gauge before you look at it.

## R3 - two sign bugs, and the economy tuned against measurement

Three of the complaints ("left arrow moves it right", "it goes under the
track", "the lean on serpentines still looks wrong") turned out to be TWO
sign errors, both pinned down by a test rather than by staring:

- **main.js built its side vector as cross(forward, up); track.js builds
  cross(up, forward).** Opposite handedness. main's pointed screen-RIGHT
  while the track's pointed screen-LEFT, so pressing left slid the unicorn
  right, and the roll leaned the wrong way on top of the track's own bank.
  One helper, one handedness, everywhere.
- **The track banked OUT of its corners.** `up' = u*cos - s0*sin` with a
  positive phi tilts the surface normal away from the turn - the opposite
  of what a body does in a bend. `tools/test-bank.mjs` builds a deliberate
  left-hander and asserts the normal leans toward +X.
- **Under the deck**: the lateral lane offset was applied along the ROLLED
  up vector, so on a hard lean the offset dived below the road. Position
  now rides the unrolled deck frame; only the pose is rolled.

Then the economy, which is not a thing you can reason out on paper:
`tools/test-balance.mjs` plays a fixed full-throttle policy in a real
browser and reports speed, stardust, falls and how much of the run was
spent as the rainbow. First measurement: tank empty 69% of frames, below
the corkscrew minimum 53%, rainbow never caught. After tuning cruise to 20
(so an empty tank still clears the gentlest demand instead of soft-locking
against it), burn to 19/s, dust to 10 a piece on 80% of edges, and the
rainbow's flee speed to 24 - three consecutive trials give 44-52% of the
run spent as the rainbow, 16-19s of burn, 13-23% empty tank, one fall per
35 seconds. The probe also caught an uncapped air-boost pumping landing
speeds to 79 against a deck limit of 46, which then threw the player off
the very next bend.

Also in this pass:

- **Real radial blur**, ADDITIVELY composited: the rendered frame is drawn
  back over itself four times, scaled about the viewport centre. A plain
  alpha composite averages in mostly-dark copies and DIMS small bright
  features - the rainbow's own head came out as a dark disc - while
  `lighter` only ever brightens, so light smears outward as light.
  (`preserveDrawingBuffer` is on for this.)
- **Dynamic shake** from two incommensurable sine pairs so it never settles
  into a rhythm, scaled by speed squared, plus a roll component - gated out
  of the jump cinematic, which wants to be still.
- **Centrifugal force**: a = v x turnRate pushes you to the outside of every
  bend and steering is an opposing acceleration you must actually apply.
  Past 1.25 lanes you go over the edge. This is what finally makes falling
  off possible - and what makes the wide deck matter.
- **The gap is as long as you earned**: launch speed picks a landing node
  further down the chain, and the flight is time-dilated on top, so a good
  launch buys a long slow arc through the stardust instead of a hop.
- **The merge is a catch, not a stumble**: reaching the rainbow's HEAD
  transforms you, with a 110-particle detonation - stepping on its tail
  made the best moment in the game feel like an accident.

## Why the maze had to go (R1)

The grid maze had cycles, and cycles are why the rainbow could come at you
head-on: in a graph with loops the quarry's flight path can double back
into your face, which reads as chaos rather than a chase. The course is
now acyclic by construction (`tools/test-course.mjs` proves it over many
generated courses), so nothing can ever travel the wrong way past you.

It fixed something else for free. Per-node stored tangents mean a split's
two exits share one entry tangent and a merge's two entries share one exit,
so the junction kinks the grid version fought for three milestones simply
cannot arise. Measured, straight after the switch:

| | grid maze | forward course |
| --- | ---: | ---: |
| heading change per frame, mean | 1.07 deg | 0.48 deg |
| heading change, p99 | 3.63 deg | 1.75 deg |
| heading change, max | 91.9 deg | 1.90 deg |
| advance speed variation | 0.9% | 0.4% |

## The rainbow

Two generations of stutter, both fixed at the parameterisation:

1. It drew straight quads between points sampled every 1.3 units - the head
   popped a whole sample at a time and the body was visibly a polygon.
2. After the Catmull-Rom pass it STILL popped, ~20x a second, because
   points were committed on a euclidean threshold (spacing wobbled with
   frame time) and the curve was sampled BY SEGMENT INDEX - so every commit
   re-parameterised the whole ribbon.

Now commits are interpolated inside the frame's travel to land at EXACT
arc spacing, the head rides the true position every frame, and geometry
samples the chain at fixed fractions of total arc length, which changes
continuously (verified: a 0.3-unit feed moves no vertex more than ~1 unit,
and only near the head). The tail fade reaches zero, so dropping the
oldest point is invisible too.

Layers: three haze sheets, upright curtains, seven strands plaiting round
a shared axis, drifting motes, and a crossed head flare - all written into
one preallocated Float32Array. When the PLAYER owns the rainbow the head
flare is skipped and the first ~14 samples damp to zero, because the
camera sits at the head and the glow otherwise floods the screen white
from inside.

## Become the rainbow (the game, finally)

Chasing was a loop with no goal, colour-collecting felt arbitrary, and the
rainbow could be OVERTAKEN, which broke the fantasy outright. All three
died together: touching ANY part of the ribbon merges you with it - being
about to overtake it IS catching it. The unicorn becomes the rainbow; the
trail machine simply changes owners, so the ribbon flows from the old head
to your hooves without a seam. The seven colours then burn down (~2.2s
each); landing a jump relights one; when the last gutters out the rainbow
tears three nodes ahead and the chase resumes. SCORE IS TOTAL BURN TIME.
One goal, one meter, and the jumps - the course's best moments - are now
the thing that keeps the ride alive.

## The rest of the graphics pass

- **Serpentine lean**: geometry banking fades at every node, so on winding
  lines of short segments it never added up. The camera and rider now also
  roll with the ACTUAL smoothed horizontal turn rate, which knows nothing
  about nodes - the krecioł is back on serpentines.
- **Deck widened** 3.6 -> 5 half-width; lane range scaled to match.
- **Speed drama**: chromatic double streaks (cyan/magenta ghosts under the
  white), a harder vignette, FOV coefficient up, and a deliberate 6 Hz
  micro-shake that scales with speed squared - all gated to fade during
  the jump cinematic so the airborne shot stays clean.
- **Parallax backdrop**: 150 stars and nine aurora curtains on a finite
  ring (~260-500u) around the course's centre, drawn in the glow pass.
  Finite-far means the camera's travel slides them slowly against the
  void - the horizon now participates in speed.

## Jumps

A gap draws no deck; the hole IS the jump. The rider leaves the rails on a
parabola that lands exactly on the far node, so it is a spectacle and never
a fail state. Landing lights on each lip telegraph it. `cine` swells while
airborne and eases back after touchdown, and it is the single number every
cinematic term blends through: the camera drops back, lifts, swings out to
the side to put the unicorn against the sky, widens its field of view, and
the head comes up out of its tuck.

## Surfing

Catch the rainbow and it stops fleeing: it runs just ahead at YOUR pace and
a shade faster, so holding the ride means holding the throttle. Coast and
it walks away; let the gap reach 34 units and it tears free, and you are
chasing again.

## Design notes, S0

- **The braid is honest.** Its ribbon is the trail of where it actually
  ran, so it snakes around the corners it took. It flees by argmax of
  BFS-distance-from-player recomputed every 250 ms, doubles back only
  from dead ends — cornering it is real, luck is not required.
- **Rubber band, both ways.** Panics to 4.2 u/s when the player is close
  (player tops at 5.2, so a committed straight catches it), dawdles at
  1.7 when far. A rainbow beacon pillar rises over the walls when it is
  far — a maze you cannot find the quarry in is hide-and-seek, and this
  game is tag.
- **Catch the tail, not the head** — trail[0], the oldest point, is the
  catch target, which is exactly the fantasy: you close in on the braid
  streaming behind it.
- Rounds grow: each catch rebuilds a maze two cells wider.

## Design notes, S1 - the braid drags along the ground

The braid was reworked from a flat ribbon floating at chest height into a
rope of light dragging along the stone, glowing volumetrically. There is
no post-process bloom in the byte budget, so the bloom is built from
geometry plus additive blending: the shader gained a per-vertex alpha and
an `add` uniform (emissive, unlit, fades to nothing instead of toward the
fog colour - additive blending *adds*, so fading toward fog would
brighten the horizon). Additive draws keep the depth TEST but drop depth
WRITES: glow still hides behind walls but layers never occlude each
other - they sum, and that summing is the bloom.

Layers, all rebuilt from the same trail every frame:

- **seven cores** orbiting the shared path - seven phases evenly around a
  circle, advancing along the trail and turning with time, so the strands
  genuinely cross over and under like a plait (sway alone just lays seven
  parallel ribbons down like a flag);
- **ground smear** - a tight rainbow spill plus a wide pale wash, each
  bright at the centreline and alpha-zero at both outer edges, because a
  hard-edged quad reads as a rectangle no matter how faint it is;
- **a pale sheath** at rope height so the plait sits inside a haze;
- **upright haze cards** every other trail point, bright at the floor and
  fading with height, giving the glow a body standing in the air;
- **a head knot** - two crossed white fans pulsing at the braid's actual
  position, so the rope ends in the living light being chased rather than
  just stopping.

Dev-only spectator rig (compiled out of shipping builds): pressing O
toggles a camera parked on the braid's own trail - a toggle, not a hold,
because the headless harness screenshots after keyup. The catch check is
suppressed while spectating.

## Design notes, S2 - the wipeout pivot

The maze stopped being a floor and became the sky. Same recursive
backtracker, but its cells are now NODES of a rollercoaster network:

- **Braided maze, literally.** Every dead end gets a second exit and a
  few extra walls are knocked open - a racer at speed can never be forced
  into a three-point turn, routes loop and rejoin, and the same junction
  can be entered from three sides. The route ambiguity IS the game: you
  can see the braid glowing out there, but never quite which track it is
  on.
- **One rail-rider, two riders.** track.js moves both the player and the
  braid along hermite curves over the graph; nothing in it knows who is
  riding. The braid's flee AI (argmax BFS-distance at every fork) carried
  over from the flat game unchanged, because the graph API survived the
  pivot.
- **Hermite through-flow.** Each node stores a through-axis (its two most
  opposite neighbours); edge tangents sign-align to it, so track flows
  smoothly THROUGH junctions instead of kinking at them.
- **Gravity along the tangent.** Dives feed speed, climbs bleed it -
  boost/brake on top of a real coaster. Steering only matters at forks:
  hold a direction while crossing a node, get the leftmost/rightmost
  branch; hands off takes the straightest.
- **Rail colours are landmarks.** Each edge's neon rails carry one
  rainbow colour hashed from its endpoints - "the braid went down the
  green track" is how the player learns the knots. Junctions announce
  themselves across the void as thin gold light columns.
- **The score is the proximity meter.** A lookahead step sequencer:
  kick + bass always, hats and an octave-up saw arp that wake with speed
  (the whole thing accelerates 116->168 BPM), and a pentatonic lead that
  fades in as the tail gets close. No proximity bar on the HUD - you hear
  it.
- The scripted release-build gate run actually catches the braid
  (21.9s), verifying the chase end-to-end with zero dev code.

## Design notes, S3 - corkscrews, speed blur, and the rainbow key

- **The moving frame.** One `frame(g,a,b,t)` in track.js returns
  pos/tangent/side/up for everything that stands on the track: road quads,
  rails, the rider, the camera. Roll has two sources - banking (lean into
  horizontal turns, faded to zero at nodes so junction geometry never
  cracks) and corkscrews: a quarter of edges, hashed order-independently
  from their endpoints, roll a full 360 along their length. Node roll is
  always zero, so every fork is entered upright. `lookAt` grew an
  arbitrary-up parameter and the camera lerps its up vector toward the
  rider's - a corkscrew is only a corkscrew if the horizon turns with you.
- **Serpentines**: hermite tangents overshoot at 1.3x chord, node jitter
  and height amplitude raised - every segment bows.
- **The rainbow is the key** (the acceleration question, answered): seven
  colour shards placed in order of BFS distance from the start, so
  red->violet pulls the player across the whole net. Each collected colour
  raises top speed by 2 (22 -> 36) and fires a surge; the braid's panic
  speed is 26, so it is UNCATCHABLE until the collected colours raise your
  ceiling past it. Grabbing the tail with an incomplete rainbow makes the
  braid burst away at 42 with a "gather all seven" flash - collecting all
  seven is literally the key to holding it.
- **Speed blur without post-processing**: the 2D HUD canvas draws radial
  streaks and a vignette scaling with velocity, and the GL camera widens
  its FOV with speed (1.03 -> ~1.45 at full surge). The overlay is the
  whole post-processing budget, and it is enough.
- **The choice is visible before it is made**: a gold diamond pulses on
  the branch the current steering input would take (the pure
  `pickBranch` is called in preview every frame), and the fork telegraph
  arrows light the active side. Crossing any node fires a small FOV kick.
- **You can always find both quarries**: additive glow carries ~150 units
  (solid fog still dies at 70), and edge-of-screen arrows point at the
  braid's tail (white) and the active shard (its own colour) whenever
  they are off-screen.

## Design notes, S5 - making it flow

Two complaints, "smoother track" and "a longer moment at the fork", turned
out to be four separate causes, three of them measurable:

- **Motion was parameterised by t, not by arc length.** A hermite curve is
  not uniformly parameterised, so advancing t proportionally to distance
  made the rider surge through the middle of every segment and crawl at its
  ends. `edgePos` now also returns |dP/dt| and `ride` steps ds/|dP/dt|.
  Measured by `tools/test-smooth.mjs`: advance coefficient of variation
  4.2% -> 0.9%.
- **Node tangents could flip 180 degrees.** Sign-aligning a node's
  through-axis to an edge is unstable exactly where the two are
  perpendicular - the dot product crosses zero and the tangent snaps
  backwards mid-corner. `nodeTan` now blends the axis toward the chord as
  they approach perpendicular. Mean heading change 2.47 -> 1.09 deg/frame,
  p99 10.2 -> 3.7.
- **Junctions are structurally non-smooth** - two branches leaving one node
  simply point different ways, and no per-edge tangent scheme fixes that -
  so the remaining rare snap (up to 88 deg in one frame) is eased in the
  VIEW only, and only when it is large: changes under ~10 deg pass through
  untouched, so normal motion has zero lag and corkscrews still roll at
  full rate.
- **Node jitter and the fine height octave were the chatter**, not the
  swell. Jitter dropped from 0.44 to 0.12 of a cell and the fine octave
  from 8 to 5, while the big swell went UP (17 -> 19): the net keeps its
  mountain-range silhouette without the local noise. Spacing widened from
  14 to 22, so segments last about a second at speed.

**The fork became a place, not a keypress.** `player.lane` is a racing line
across the channel, -1 to +1; steering slides you across it and letting go
eases you back toward the middle. Which branch you take is decided by WHERE
YOU ARE when you cross the node. The whole approach is now the decision
window - about a second of track plus a comfortable 0.9s to cross from one
side to the other - and the HUD shows a lane gauge with the branch your
current position selects lit up, instead of arrows that lit on a keypress.
The camera and the unicorn both ride the lane offset, so the choice is
visible in the world and not only on the dial.

Also fixed: the chase camera lifts along the RIDER's up, not the up of the
track point it sits on. Mid-corkscrew those are rolled far apart, and
lifting along the trailing point's up walked the camera around the tube and
into the deck.

## Design notes, S6 - "the ride is terribly unsmooth"

The rider's own motion measured clean (0.9% speed variation) and the frame
rate measured clean (57 fps, 0.5% stutters), so neither was the problem.
What the player feels is the CAMERA, and nothing was measuring that. So
`tools/test-camlive.mjs` reads a DEV-only probe out of the running game -
real eye, aim, FOV, real frame times - and reports eye acceleration, view
swing rate and FOV rate. Four separate defects fell out of it, none of
which any earlier test could see:

| | before | after |
| --- | ---: | ---: |
| view swing, max | 2,327 deg/s | 211 deg/s |
| frames over 400 deg/s (24s) | many | 0 |
| eye acceleration, max | 1,706 u/s² | 235 u/s² |
| frames over 300 u/s² (24s) | 8 per 15s | 0 |
| FOV rate, max | 107 deg/s | 62 deg/s |

- **The aim point froze, then teleported.** `ahead()` clamped at the end of
  the segment, so for the last nine units before every node the camera
  stared at a fixed spot, then jumped nine units onto the next branch. It
  now walks past the node onto the branch the lane predicts.
- **The branch prediction disagreed with the actual choice.** The aim used
  the camera's smoothed tangent while `chooseP` used the rider's raw one;
  near a node they picked different branches and the view flipped 152
  degrees in a frame. Both use the rider's tangent now.
- **A rate clamp is not smoothing.** Clamping is continuous in value but its
  velocity switches on and off at the threshold, and a velocity step IS
  jerk. Replaced with a critically damped spring. The spring deliberately
  lags the roll, so the boom lengthens by the lag's cosine to keep its
  height off the deck through a corkscrew - and that compensation is itself
  low-passed, because unfiltered it put the spikes right back.
- **Every step in the FOV was a pop.** `surge` jumps to 1 on a pickup and
  `forkKick` to 1 at each fork; measured at 620 and 103 deg/s, recurring
  every couple of seconds. One low-pass on the finished FOV catches all of
  them at the source-independent end.

Also, from the same pass: FOV was wired to instantaneous speed, which rises
and falls with every crest because gravity acts along the track - the image
breathed continuously (`tools/test-fov.mjs`: 5.7 deg/s peak, halved by
smoothing). The speed streaks re-rolled their angles every frame, which is
white noise, and white noise reads as judder; they have fixed angles now.
And corkscrews went from one edge in four to one in seven: a 360-degree
roll inside a one-second segment is a ~350 deg/s spin, which is a showpiece,
not a texture.

## Design notes, S7 - the deck is glass, not a gutter

The banked channel from S4 read as a gutter you sit inside, and a gutter
walls the view off: the entire point of a net of ribbons hung in the sky is
seeing the rest of it, and lips 1.5 units tall hid exactly that. So:

- **The profile is flat**, one token raised rim instead of walls.
- **The deck is a third material.** The shader's solid path now honours the
  per-vertex alpha, so one program covers a new GLASS mode: lambert and fog
  like a solid, but alpha-blended and writing no depth. Overlapping pieces
  of track therefore stack instead of occluding, and the track ahead, below
  and overhead all read through the one you are riding. Draw order is
  solids, then the deck (so it blends over the unicorn it passes in front
  of), then the glow.
- **The neon edge rails carry the shape now.** With the deck a faint sheet,
  a bright line down each side is what makes the track legible at speed;
  they sit 0.26 up instead of 1.5, high enough to catch the eye and too low
  to be a wall.
- Junction beacons went thin (0.22 wide, alpha 0.16) - against a
  transparent deck the old gold fans dominated every frame.
- And with no lips to clear, the camera finally drops to where it was
  wanted all along: 2.0 above the rails instead of 2.35, close behind the
  head.

## Milestone log

| gate | ceiling | worst-of-5 | notes |
| --- | ---: | ---: | --- |
| S0 first playable | 6,500 | 4,790 | maze+chase+catch+title/win, headless-verified |
| S1 volumetric braid | 6,500 | 5,236 | ground-dragging plait, additive glow layers, head knot |
| S2 wipeout pivot | 9,500 | 6,386 | coaster net, rails+forks, adaptive score, gate run catches the braid |
| S3 corkscrews & colours | 9,500 | 7,734 | full-roll corkscrews + rolling camera, speed blur, rainbow-key collection |
| S4 wipeout channel | 9,500 | 8,223 | on-rails camera behind the head, banked channel, animated head, colour fix |
| S5 flow | 9,500 | 8,541 | arc-length motion, stabilised tangents, lane-based forks |
| S6 smoothness | 9,800 | 8,763 | live camera probe; aim walks past nodes, spring easing, low-passed FOV |
| S7 glass deck | 9,800 | 8,786 | flat translucent deck, neon edge rails, open sightlines |
| R1 rainbow surfer | 11,500 | 8,688 | maze dropped for a forward course, jumps with a flight shot, surf the rainbow |
| R1b become the rainbow | 11,500 | 9,384 | merge on touch, burn meter, graphics pass |
| R2 physical run | 11,500 | 10,217 | speed as a resource: stardust, demands, falling off |
| R3 signs and balance | 11,500 | 10,474 | two sign bugs, centrifugal lane physics, earned jumps, economy measured |
| R4 shape and score | 11,500 | 10,885 | difficulty ramp, persistent best, richer end screen |
| R5 speed dust | 11,500 | 11,156 | world-anchored motes, blur cost measured and cut to three passes |
| R9 the long bend | 11,500 | 11,471 | sweeper sections, longer serpentines, skilled balance policy |
| R8 flow and glass | 11,500 | 11,468 | dust weighted by optical flow, stencil-masked planar reflections in the deck |
| R7 streaks that move | 11,500 | 11,211 | streak length tied to real frame travel, tight cone, age-based fade |
| R6 dust approaches | 11,500 | 11,192 | streak direction corrected, per-mote fade band, both effects stand down for the jump |

Bugs caught by looking at S0 screenshots, not by the harness: the
hand-rolled `lookAt` used `z×up` instead of `up×z` and rendered the world
upside down; the round opened with the camera flying in from outside the
maze (now snapped behind the player, facing an open corridor); headless
WebGL needed `--enable-unsafe-swiftshader` and its driver's *performance*
chatter had to be filtered from the verify harness without loosening real
error detection.

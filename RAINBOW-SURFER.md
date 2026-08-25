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

It used to read as jumping point by point, because it was: the trail took
a sample every 1.3 units and drew straight quads between them, so the head
popped forward a whole sample at a time and the body was visibly a polygon.
Now the newest point IS the rainbow's exact position, updated every frame
so the head glides; older points are fixed; and the spine is resampled
through Catmull-Rom before any geometry is built. Layers: two haze sheets
(bright core, wide soft wash, both alpha-zero at the outer edge), seven
strands orbiting a shared axis so they plait over and under, drifting
motes that wink in and out, and a crossed head flare. All of it is written
into one preallocated Float32Array - a few hundred KB of fresh arrays every
frame is a GC hitch waiting to happen.

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
| S6 smoothness | 9,800 | 8,763 |
| S7 glass deck | 9,800 | 8,786 | flat translucent deck, neon edge rails, open sightlines | live camera probe; aim walks past nodes, spring easing, low-passed FOV |

Bugs caught by looking at S0 screenshots, not by the harness: the
hand-rolled `lookAt` used `z×up` instead of `up×z` and rendered the world
upside down; the round opened with the camera flying in from outside the
maze (now snapped behind the player, facing an open corridor); headless
WebGL needed `--enable-unsafe-swiftshader` and its driver's *performance*
chatter had to be filtered from the verify harness without loosening real
error detection.

# Seven Strands — the second entry, 3D

Same legend as The Seventh Color, opposite form. After the light came
back, one braid of it bolted onto a rollercoaster net twisted through the
night sky; the restored unicorn races it down. A wipeout-style coaster
chase: rails, speed, forks — completely separate code from game one,
sharing only the build/measure/verify toolchain (`--game=strands` on the
same tools, same squeeze chain, so byte numbers stay comparable).

## Architecture (S2, the coaster pivot)

```
strands/src/
  gl.js      raw WebGL: one shader, two materials (lambert+fog solid /
             additive emissive glow), hand-rolled mat4, box mesh builder
  maze.js    recursive-backtracker maze, BRAIDED (no dead end survives,
             extra loops knocked open) - its cells are nodes of the track
             graph, with jittered positions on a swooping height field
             and a per-node through-axis for smooth hermite flow
  track.js   the rollercoaster: hermite curves over the graph, road +
             neon-rail meshes, junction light columns, and the ONE
             rail-rider that moves both the player and the braid
  uni.js     the unicorn as boxes: gold horn, violet mane, rainbow tail
  ribbon.js  the braid on rails: flees via argmax BFS-distance at every
             fork, dragging its five-layer volumetric glow along the track
  main.js    loop, boost/brake + gravity-along-tangent, fork steering,
             chase camera, HUD, and the adaptive score
```

No three.js — the whole game fits in ~6.4 KB zipped, under half the
budget, at the S2 milestone.

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

## Milestone log

| gate | ceiling | worst-of-5 | notes |
| --- | ---: | ---: | --- |
| S0 first playable | 6,500 | 4,790 | maze+chase+catch+title/win, headless-verified |
| S1 volumetric braid | 6,500 | 5,236 | ground-dragging plait, additive glow layers, head knot |
| S2 wipeout pivot | 9,500 | 6,386 | coaster net, rails+forks, adaptive score, gate run catches the braid |
| S3 corkscrews & colours | 9,500 | 7,734 | full-roll corkscrews + rolling camera, speed blur, rainbow-key collection |
| S4 wipeout channel | 9,500 | 8,223 | on-rails camera behind the head, banked channel, animated head, colour fix |
| S5 flow | 9,500 | 8,541 | arc-length motion, stabilised tangents, lane-based forks |

Bugs caught by looking at S0 screenshots, not by the harness: the
hand-rolled `lookAt` used `z×up` instead of `up×z` and rendered the world
upside down; the round opened with the camera flying in from outside the
maze (now snapped behind the player, facing an open corridor); headless
WebGL needed `--enable-unsafe-swiftshader` and its driver's *performance*
chatter had to be filtered from the verify harness without loosening real
error detection.

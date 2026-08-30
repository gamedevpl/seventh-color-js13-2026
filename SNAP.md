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

**5,515 bytes still in hand** for the shoot, the brief and the end game.

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

## Where it goes next

- **The photograph.** Aim, shutter, and a score computed from world state at
  the moment it fires: framing against the thirds, how much of the frame the
  unicorn fills, which pose it was caught mid-way through, and eye contact.
- **The brief.** A commission each round — a palette, a mood, a pose to
  catch — scored against what the player actually styled and shot. This is
  what makes the paint a mechanic rather than a dress-up screen: without
  something asking for a specific look, a score would have to judge taste,
  which it cannot do honestly.
- **A unicorn with opinions.** It works the set on its own schedule, and the
  poses worth having are rare and brief, so the shutter finger has to wait.
- **The end game.** A season of briefs, then a spread of the best frames.
- **The music.** A strutting catwalk vamp — the joke the idea was born with,
  written rather than borrowed.

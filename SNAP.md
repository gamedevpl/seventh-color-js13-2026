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
- **A contact shadow**, as a unit fan scaled to the subject. On a seamless
  sweep there is no horizon line and no texture, so the shadow is the *only*
  cue for where the floor is — without it the unicorn hangs in front of the
  backdrop instead of standing on it.

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

## Where it goes next

- **The photograph.** Aim, shutter, and a score computed from world state at
  the moment it fires: framing against the thirds, how much of the frame the
  unicorn fills, which pose it was caught mid-way through, and eye contact.
- **A unicorn with opinions.** It should work the set on its own schedule —
  striking poses, getting bored, playing up to the lens when it feels like
  it. What replaces the meadow's shyness as the source of tension is an open
  question the next pass has to answer.
- **The music.** A strutting catwalk vamp — the joke the idea was born with,
  written rather than borrowed.

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

## R18 - the title screen gets its music after all

The ask was a quiet motif on the **title screen**, and two attempts got the
shape wrong before the third got it right.

The first put the bass under the opening cutscene and called the matter
closed. The browser rule behind that was real - no sound until the page has
had a genuine user gesture, and here the gesture that unlocks audio was
also the one that left the title - but the conclusion drawn from it was
lazy.

The second held the title for a second and a half after the first press,
with the label swapped to "here we go". Reported back immediately: *"I
click the screen and it says here we go straight away."* Right - **a second
and a half is a transition, not a theme, and you cannot linger on a
transition.** The label made it worse by announcing a departure.

What it wanted was simply: **the first press wakes the title, the second
leaves it.** The bass comes up, the race carries on running underneath, the
bars breathe on the kick, and you sit there as long as you like. The label
never changes, because nothing has changed - it still says press SPACE, and
that is still what to do.

It costs exactly one extra press per page load, because after a run you
rejoin at the intro and never see this screen again.

### Just the bass, not the bed

`pump(0, 0, 1)` was still a whole backing track: kick, hi-hat, bass and the
58Hz sub pulse. The ask was one element of it. `pump` takes a fourth
argument now - `bare` - which silences everything except the bass line. A
fourth argument rather than a second loop, because the run's own
three-argument calls then behave exactly as they always did.

`beat` still fires on the downbeat with no kick behind it, so the title
bars keep breathing in time with a line that has no drums.

### Verified by counting oscillators

"pump is called" is not the same as "the browser made a noise" - a
suspended AudioContext swallows the lot silently. `tools/test-audio.mjs`
patches `createOscillator` before the page boots:

| | oscillators | context |
| --- | ---: | --- |
| title, before any gesture | **0** | - |
| title, after one press | **11** | `running` |
| title, still sitting there | **27** | `running` |

Zero before the gesture is as much the requirement as eleven after it.
The third row is the one that distinguishes this pass from the last: the
music does not stop, because the screen does not leave.

**The motif is a rate, not a volume.** The bass fires every second step at
roughly 116bpm sixteenths - about 3.9 notes a second - where the full bed
runs near 8.7. Measuring the rate is what tells those apart; "it sounds
quieter" would not. Measured: **4.0/s**.

And the track you play to is guarded rather than promised. Two more presses
carry the probe into the run and it measures again there: **17.6/s**, kick,
hat, bass, sub and arp intact. Not touching the main music is a standing
instruction, so it gets a test.

`tools/test-touch.mjs` gained the matching behavioural check - *one tap
wakes the title but does not leave it* - since "nothing happened on the
first press" is precisely what a bug would look like as well.

It also gained a retry. A fall resets the lane to zero and a jump freezes
it, so a sample taken across either measures nothing and reads 0.00; one
run compared a real touch deflection against a spoiled keyboard reference
and failed on it. The instrument now insists on a real deflection before
comparing.

The music engine itself remains untouched - `pump(0, 0, 1)`, the same
sequencer told it has no speed, nothing near and a dry tank.

### The wall

O1 gate 13,236, **shipped (O2) 13,194**, limit 13,312 - 118 bytes.

## R17 - touch, and a bass under the opening

### Touch: it half worked, which is worse than not at all

There was a `pointerdown` handler, so a tap counted as SPACE and the game
would **start** on a phone - and then you were a passenger. `turnDir` and
`heldFwd` read the keyboard only. Starting fine and being unsteerable is a
worse first impression than an obvious wall.

Now every live pointer is tracked, because the scheme rests on knowing
whether both sides are down at once: **left half steers left, right half
steers right, both together is the boost.** The top strip is the SPACE key -
start, restart, arm a kicker - kept separate so that steering on a phone
does not fire a ramp every time you turn. The HUD carries `touch-action:
none`, without which the browser pans the page instead.

`tools/test-touch.mjs` drives the real page with synthetic pointer events,
two fingers included, and reads the result off the DEV probe. It caught its
own author first: the initial assertion said the left half should push the
lane negative, and it does the opposite - correctly, matching `ArrowLeft`.
Which sign means "left" is an internal convention this project has had
backwards twice, so the test now asserts the property that actually
matters - **a thumb does what the arrow key does** - rather than a sign I
guessed:

```
left half matches ArrowLeft    key 0.44   touch 0.92
right half matches ArrowRight  key -0.45  touch -0.95
both halves boost              19.4 -> 32.2
boosting does not steer        lane -0.30
```

### The bass, and why it cannot be on the title

A browser makes no sound until the page has had a real user gesture, and
here the gesture that unlocks audio is the same SPACE that leaves the title
behind. A title-screen loop would be silent on every cold load, which is
every load that matters. So the bass sits under the **opening cutscene**
instead, which is the same musical idea and can actually be heard.

It is `pump(0, 0, 1)` - the same sequencer the run uses, told it has no
speed, nothing near and a dry tank, which is already exactly "no arp, no
lead, just the bottom end". The first attempt wrote a second loop to say
that; ten lines for one, and a second place to keep in step with the first.
**The music engine itself is untouched.**

### What it cost

Touch and the bass together came to 13,249 against a 13,312 limit - 63
bytes, which is not shippable. The wake behind the unicorn went, as priced
two passes ago: seven rainbow bars stretched by speed, saying what the dust
streaks, the zoom blur and the trail already say louder. A phone that
cannot steer is a game nobody on a phone can play; that beats a decoration.

Shipping at **13,190** - 122 bytes clear.

## R16 - a shine rather than a starburst, and a free 32 bytes

### The stars again

The crosses were wrong, and the reason is worth writing down: **crossed
streaks are a camera artefact, not a shine.** They are what a lens does to
a bright point, so they read as photography rather than as light, and at
this size they read as junk.

Each star is a triangle **fan** now - bright in the middle, alpha zero all
round the rim - so it falls off smoothly in every direction with no arms.
Two fans, a tight one inside a wide faint one, because a single linear
falloff looks flat while two stacked additively give a hot core inside a
soft halo. And the pulse is a slow swell rather than the previous spike:
they breathe at their own rates and drift in and out of each other, which
is the shimmer.

### The packer had room in it

`packer.optimize(level)` was being called at level 1. Level 2 - the highest
roadroller offers - searches far harder for the same output:

| | zipped |
| --- | ---: |
| `--O1` | 13,067 |
| `--O2` | **13,035** |

**32 bytes for nothing but build time.** The gate stays on `--O1` so
iteration stays quick, and it is the conservative direction anyway: the
shipped artifact is smaller than the gate reports, never larger. The
release path is now its own script, `npm run strands:ship`, so it does not
depend on remembering a flag.

Shipping at **13,060** against 13,312 - 252 bytes.

## R15 - honest mirrors, and stars that catch the light

### The reflection was wrong, and by how much

"The reflections look off, especially where the track bends - the mirror
image goes strongly downward." Correct, and measurable. The mirror is a
single plane through the rider along the deck normal there, so its accuracy
falls away with distance. A point lying ON the deck must reflect onto
itself; how far it lands from itself is the error:

| distance ahead | mean | p90 | worst |
| ---: | ---: | ---: | ---: |
| 10u | 0.2u | 0.5u | 1u |
| 25u | 1.3u | 3.3u | 5u |
| 40u | 2.7u | 8.0u | 12u |
| 60u | 5.7u | 17.6u | **27u** |

So a distant rainbow's mirror image could land twenty-seven units from
where it belonged, sliding away as the track bent - exactly the report.

The fix is to reflect only what the one plane is right about. The unicorn,
its head and its sparks ARE the player, so their plane is exact. The trail
is exact too once you own it, since it is then fed from the player; while
chasing, it draws only when the braid is genuinely near (18 units, where
the error is half a unit). **Stardust came out of the mirror entirely** -
it ranged sixteen nodes ahead and was the worst offender by far.

Worth being plain about: this is not a better mirror, it is an honest one.
It shows less, and what it shows is right.

### Stars that flare

Each sky star is a **cross** now rather than a dot, and it flares: a high
power of a sine sits near zero and spikes briefly, which is what a glint
off a lamp actually does. They hang dim and then catch, one at a time, and
the arms of the cross grow with the catch. A dot can only get brighter -
the arms are what read as glare.

Their colour is resolved once at build rather than per star per frame,
which was 170 array allocations every frame for a constant.

### The margin, stated plainly

Worst-of-5 is 13,084 against the js13k limit of 13,312 - **228 bytes**.
The wake behind the unicorn was priced at **79 bytes** as a candidate for
removal and deliberately kept: cutting a visible effect to buy margin is a
decision for whoever owns the game, not something to do quietly while
fixing something else.

## R14b - a lens on the glass

The tower shots were composed but static. **Distance is the only thing a
planted camera has to say about speed**, so the second shot type puts the
lens down ON the deck - four units out, half a unit clear of the glass,
inboard of the rail - and rolls its horizon with the road. They come
through at head height a couple of metres away, the frame whips as they
pass, and through a banked arc or a wall the whole shot lies over with the
track. Shots alternate: wide, low, wide, low.

Two small things fixed while in there. The tower had stopped alternating
sides when the shot picker was refactored, so every wide shot was from the
same hand; it takes its side from the node index now, for free. And the
title never taught the kicker - a mechanic added two passes ago - so the
controls line says `SPACE at a gold gate to jump` and the two description
lines were tightened to pay for it.

`sm` was defined twice, in track.js and again in main.js. It is exported
once now. That is a genuine duplicate rather than a byte trick, and it
happened to be worth about fifteen of them.

**On the margin.** Worst-of-5 is 13,012 against the js13k limit of 13,312
- **300 bytes, 2.3%**. The last twenty of those were chased with a text
trim and a dedup, and at that point the ceiling is arbitrary and the
spread between rolls (28 bytes) is larger than what is being chased. This
is the end of free additions: anything further needs something removed
first, chosen deliberately.

## R14 - the title screen becomes a broadcast

The menu sits on a live race now rather than a still. A world is built at
boot, the chase runs behind the text, and the scrim is a gradient - opaque
enough at the top to hold the words, clearing toward the bottom where the
track and the two of them are worth looking at.

The camera is **trackside**, planted at a tower twelve units off the road
and a dozen up, panning as they come past, then cutting to the next tower.
That is the grammar of a race broadcast, and a camera that chased them
would only be the game's own rig with nobody driving.

Three things were wrong before it read right, and all three were about
where the shot points:

- **The tower stood six nodes ahead**, about 150 units - six seconds away
  at demo speed, against a 4.4 second hold. The cut came before they ever
  arrived, so every shot was of an empty road. Three nodes puts them past
  the lens inside the hold.
- **It drifted instead of cutting.** The rig springs the eye toward its
  target, so a "cut" crawled the seventy-odd units between towers over more
  than a second and spent most of the shot in transit. Position is a hard
  set now; only the aim is sprung, which is the pan.
- **Aiming at them put them behind the title.** A camera pointed at its
  subject centres that subject by definition, and the centre of this frame
  is the words. Raising the tower changed the angle but not where they
  landed on screen - lifting the AIM by a share of the range is what drops
  them into the clear band underneath.

### What paid for it

The nine backdrop curtains are gone: parallax landmarks from before there
was a skybox, drawing as big flat olive slabs hanging in the dark, more
artefact than scenery. The track net parallaxes plenty on its own. They
were worth **154 bytes**, which is roughly what the attract mode cost -
worst-of-5 went 13,117 (over ceiling, and only 195 clear of the js13k
limit) to 12,972.

## R13 - kickers, and the black streak that was two bugs

### The kicker

Still too easy, and the fix was not to tighten a number but to move where
the fuel is. **Kickers** are marked launch points - a gold gate you can see
coming, deliberately unlike the demand pink and the rainbow hash, because
this one is an invitation rather than a warning. 6.7 per course, placed on
the first node of a cruise, at the bottom of a dive where the speed you
were just handed is what a launch wants, and on sweepers where the jump
cuts the corner in mid-air.

**It arms before the marker and fires as you cross it.** Launching from
mid-edge would either snap you back to the node the arc starts at or drop
you in already half an arc up, and committing a moment early is a better
ask than hitting a frame.

The payload is an arc of stardust hanging over the road on the trajectory a
well-judged launch actually flies - worth several nodes of driving. It
demands 30 to stay up where a gap only asks 16, so launching on a dry tank
drops you through the arc you were aiming at. And it **swings out to the
side**, so the richest part pulls you away from the deck you have to land
back on: come down outside 3.6 units and you have missed the road. Drifting
out is free in the air and expensive at the moment you touch down, which is
what makes the reward a decision rather than a pickup.

Road dust dropped correspondingly, from 80% of plain edges to 30%.

| policy (4 runs each) | catches | as the rainbow | tank empty |
| --- | ---: | ---: | ---: |
| skilled, ignores kickers | 41.8s avg | 25.5% | 51% |
| skilled, takes kickers | 31.6s avg | **34.8%** | 34% |
| idle, never boosts | never (3 runs) | 0% | - |

Against R12's 41% for a skilled player, the baseline is now meaningfully
harder and the kickers are the way back up.

**The harness needed teaching twice more.** First it jumped with an empty
tank - a player learns that a kicker needs 30, a policy has to be told.
Then it kept applying the ground steering rule in the air, which moves you
sideways off the deck, so it threw away its own landings; airborne, the
only sane input is to centre up. Both times the instrument, not the
mechanic, was what the first measurement was reporting.

### The black streak was two bugs

**One:** a 6000x6000 opaque ground plate at y = -70, in almost exactly the
fog colour - invisible by design and therefore pure liability. Measured over
40 courses, **32% of all track nodes sit below it** and 27 courses in 40 dip
through it. A horizontal plane meets a curving ribbon along a thin curve,
and the slab writes depth while the glass deck does not. Deleted; the
skybox is the surround now and the floor had no job.

**Two, and the real one:** glass writes no depth, so a far piece of deck
composites over a near one in *mesh order* rather than depth order - and
fogged toward the background it is **darker than the road it lands on**, so
it paints a thin black curve across it. Glass now fades its ALPHA instead
of fogging its colour. The overlap becomes deck-over-deck, the same hue, so
the seam disappears, while the fade still lets distance take it away.

Worth stating plainly: removing the ground did not fix the streak, and the
screenshot after it proved that. The second bug was found by looking again
rather than by assuming the first fix had landed.

## R12 - the chase was giving itself away

"Too easy to catch, and when it goes badly it disappears - and I often
catch it without pressing anything."

All three at once, from one inverted rubber band.

Cruising with no throttle is **20**. The rainbow fled at **16** in the
middle band and **11** past 55 units. So doing nothing closed the gap at
four units a second, and *having fallen behind* closed it at nine: the band
it ran to when you lost ground was the band where it handed the catch back.

I built the policy that asks the only question that matters here -
`test-balance.mjs --idle`, which steers to survive but never touches the
boost. Against the old numbers it **caught the rainbow in two runs out of
three**, at 39.5s and 25.8s. The pursuit was decoration.

### The shape it wants

| gap | flee speed | against cruise 20 | against boost 34 |
| --- | ---: | --- | --- |
| inside 15u | 26 | opens | closes 8/s |
| 15-60u | 22 | opens | closes 12/s |
| past 60u | min(22, v x 0.92) | closes | closes 12/s |
| past 110u | min(22, 8) | closes fast | closes fast |

Sixty units is an **equilibrium**, and that is the whole trick: below it the
flee speed of 22 outruns cruise and the gap opens again, above it the leash
closes it. A player doing nothing is held there - in sight, plainly ahead,
refusing to be had for free. Every unit inside sixty costs stardust, and
stardust is collected by driving well.

The second stage is deliberately **fixed rather than proportional**. A run
of falls leaves you slow, and a leash scaled by your speed reels in slowest
exactly when the gap is worst - measured that way, a policy that fell 23
times still trailed by 532 units. That is not a chase any more, it is an
ex-chase. The free recovery only ever returns you to the equilibrium.

### Measured

| policy | catches | as the rainbow |
| --- | ---: | ---: |
| idle - never boosts (6 runs) | **0** | 0% |
| skilled - boosts and reads bends (4 runs) | **4**, at 19-39s | 23, 40, 50, 51% |

Before the change the idle policy caught it 2 times in 3. After, never in
six - while a player who actually plays catches it every time and spends
about **41%** of the run as the rainbow.

The first cut of this overshot: at a flee speed of 23 the skilled policy
managed only two catches in three and 13% rainbow time. 22 is the number
that outruns a coasting player and still loses to one spending stardust.

## R11 - the opening and closing shots

Both cutscenes are an **override on the one camera rig**, not a second
camera. The rig already knows about corkscrews, banking, lane offset and
the spring; a parallel set of rules would have to be kept in step with all
of it forever. So the opening blends the rig's own target toward a held
wide shot and the closing pins the eye while the aim keeps following.

### The opening

The camera starts ahead of the line and off to one side, aimed down the
track at the rainbow already leaving - so the unicorn is behind the lens
and out of frame. Blending into the chase rig sweeps the camera backwards
past it, and **that sweep is the unicorn's entrance**: the shot that finds
it is the shot you then ride, so the reveal costs no extra machinery.

Three beats over 4.6 seconds - what is happening, who you are, what to do
about it - and SPACE skips it.

The braid starts three nodes ahead instead of six. At six the fog has all
but eaten it and the opening shot is meant to *show* you the thing you are
chasing; it flees through the intro and opens the gap back to where it was
by the time you have control.

### The closing

The run ends at a node, not at the end of the track. `makeCourse` now marks
a `finish` and then lays sixteen more gentle nodes past it, so the closing
shot has road for the unicorn to keep running along - a track that simply
stopped would have it gallop off the end of the world.

At the finish the camera stops and everything else carries on. The eye
pins, the aim keeps following, the horizon locks (a locked-off camera that
rolled with a track it is no longer riding reads as a mistake rather than
as stillness), and the FOV eases in a touch. The unicorn's speed eases to a
canter, because at full boost it is a dot within two seconds and the shot
is meant to let you watch it go. Then the stats fade in after 3.2 seconds,
over the shot rather than instead of it.

Both cutscenes get letterbox bars and no instruments: a speedometer ticking
over a held shot is the fastest way to tell someone it is not a film.

### Two things caught on the way

The end panel's fade was first written as an early `return` when the alpha
was still zero. That block is the tail of the frame function - the `return`
would have skipped `requestAnimationFrame` and stopped the game dead on
arrival at the finish line. It fades with `globalAlpha` instead.

And the progress bar measured against `nodes.length`, which the runout had
just made sixteen nodes longer than the run - so it could never fill. It
measures against `finish.i` now.

The balance probe also stopped sampling during cutscenes: they hold the
speed static with no throttle, and those frames quietly dragged every
percentage in the report toward "too slow".

## R10 - a soft-lock, a phantom road, and a sky with no corners

Six things off one screenshot, and two of them were real bugs.

### The soft-lock

"Too slow for the bend" over and over at a perfectly healthy speed. A fall
respawns you a node back at speed 12, and the demand check gives half a
second of grace. The throttle has a **0.83s time constant**, so half a
second from 12 with the boost open reaches about **21.9** - and a late-run
serpentine demands up to 26. You are thrown again immediately, respawn a
node further back, and walk backwards through the section forever.

R9 made it worse without noticing: lengthening serpentines from four-to-
seven flicks to six-to-ten made landing *inside* a demand run far more
likely, and raising the demand to 19-26 raised the bar you cannot clear.

The fix is a grace window rather than a bigger respawn speed: 1.6 seconds
during which the demand cannot bite, which reaches about 31 - clear of
anything on the course - and pity stardust raised to 45 so boost is
actually available for all of it. **A respawn must not immediately
re-trigger the condition it respawned you from.**

The blind balance policy had been reporting this all along as an inflated
fall count; with the cascade gone it drops from 3.3 falls per 40s to 1.7,
and the skilled policy from 0.3 to 0.

### The phantom road

"As if the track reflects in its own glass, some kind of bug." Exactly
right. R8 reflected the rail mesh, and the rail mesh is the **whole
course** while the mirror plane is local to the player. Distant rails
reflected through a plane that has nothing to do with them landed in
nonsense places and drew a convincing second road alongside the real one -
which is also why the run in the screenshot got stuck: there was no telling
which road was the road. Reflecting a localised thing near the deck (the
rainbow, the unicorn, the sparks) is sound; reflecting all the geometry in
the level through one local plane is not.

### A sky with no corners

The stars were 150 solid **cubes** at 260-500 units - several pixels of
unmistakable square, and being placed in the world they parallaxed, so a
star would slide past like a nearby rock. Now a genuine skybox: 260 fixed
directions re-emitted every frame at a constant radius from the eye, so
they never approach and never slide, billboarded against the camera's own
right and up so each is a point from any angle, and drawn first with depth
testing off - a skybox is not far away, it is simply *behind*.

### Hairlines, not hail

The streaks were 0.16 wide and read as hail. A smear wants to be a hairline
with length, so 0.055, with the brightness raised to compensate.

### The wall

The corkscrew's trick is a full roll inside one edge, over before you
register it. **The wall** is that idea held for ten seconds: a sweeper laid
on its side across eight to eleven nodes with an authored bank, sine-
enveloped so it joins flat track at both ends. Measured, excluding
corkscrews: **maximum deck tilt 149 degrees from upright**, past vertical
and plainly upside down, in 2.1 sustained inverted runs per course.

The bank is authored per node and smoothstepped along each edge, folded
into the same `phi` the deck geometry, the rider's pose and the camera all
share - so there is nothing to keep in sync. `test-smooth` confirms it adds
no jerk: roll change per frame p99 0.687 degrees.

Its demand marks only the deep middle, where you are far enough over that
speed is what keeps you on. Pink on the ramps in and out would be pink for
the sake of it.

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
| R18 title music | 13,290 | 13,194 (O2) | first press wakes the title and stays, second leaves; audio verified by probe |
| R17 touch and intro bass | 13,230 | 13,190 (O2) | two-thumb touch verified by a pointer probe, kick+bass under the opening, wake cut |
| R16 shine, and -O2 | 13,150 | 13,060 (O2) | radial glow stars, roadroller optimize level 2 |
| R15 honest mirrors | 13,150 | 13,084 | reflections limited to their accurate range, stars flare as crosses |
| R14b lens on the glass | 13,050 | 13,012 | on-deck camera with a rolled horizon, kicker taught on the title |
| R14 attract mode | 13,000 | 12,972 | live race under a translucent title, trackside broadcast camera, curtains cut |
| R13 kickers | 12,800 | 12,567 | kicker ramps carry the dust economy, glass alpha-fades, ground slab deleted |
| R12 the chase | 12,500 | 12,243 | flee speed above coasting, two-stage gap leash, idle policy proves it |
| R11 opening and closing shots | 12,500 | 12,229 | intro reveal cutscene, locked-off ending over a runout, letterboxed |
| R10 sky, bank, phantom road | 12,000 | 11,744 | fall-grace soft-lock fix, phantom reflection removed, skybox, inverted wall sections |
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

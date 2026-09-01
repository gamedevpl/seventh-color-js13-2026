# UNICORN FIREBALL — the fourth entry

Run the plain as a unicorn of one colour. Gather every unicorn that shares
it into a herd. When the herd is big enough, hold the button: the herd
spirals into you and *becomes* a rainbow fireball that you ride across the
plain into the next herd. Two fireballs that meet explode in a rainbow, and
the bigger fist wins; everything the loser gathered is thrown across the
map, and the gathering starts again.

It descends from the two entries before it. Rainbow Surfer's renderer and
its box unicorn come over verbatim (`gl.js`, and `uni.js` re-coloured);
Unicorn Snap's sequencer discipline and the *probe first, argue later*
habit come over as method. What is new is the shape of the game: not one
unicorn on a rail and not one unicorn on a set, but seventy-seven of them
loose on a plain with seven leaders among them, and a rule that lets a herd
stop being a herd for a few seconds.

## The pitch, and the decisions in it

The brief was three ideas and a question:

- a plain, a unicorn of a colour, gather your colour into a herd, beat the
  other colours;
- the end-game is a rainbow fireball out of *Dragon Ball* that crushes the
  herds that could not build one;
- **the herd itself becomes the fireball**, visibly and smoothly, and it
  builds up long enough that the other side can see it coming and answer;
- and the question: is a fireball the end of the match, or does the
  explosion scatter everyone and the gathering begins again?

The answer built here is **the second**. A one-shot ending makes the first
ninety seconds of gathering the whole game and the fireball a cutscene. A
scatter makes the fireball a *move* — the most expensive move in the game,
with a wind-up, a cost when it misses and a bigger cost when it loses — and
lets a match have three or four of them. The rules that fell out:

- **Colour is the only rule of gathering.** A grazing unicorn joins a
  leader of its colour who walks past, or one of that leader's followers.
  Joining chains, so a herd running through its meadow sweeps it up.
- **Hearts, not death.** A leader has three. A heart is only ever lost to a
  fireball. At zero it turns to a golden statue where it stood, and *its
  whole colour goes wild* — white-gold, and anyone may gather it. That is
  the snowball that ends a match: the plain has seven colours and only one
  winner, so the losers' unicorns have to become somebody's.
- **The horn fight is free but small.** Two herds that touch lose unicorns
  from the smaller one, one per contact, thrown a few lengths and grazing
  again. Leaders only clang. It makes running through a small herd worth
  doing and running through a big one a mistake, without a single number
  on screen.
- **The charge is public.** Holding the button folds the herd into a
  sphere over one to two seconds (longer the bigger it is); the rings pulse
  faster as it fills, the riser climbs, and the rival list marks the herd
  with `!`. Releasing early is a *feint* — the herd simply unfolds — and
  releasing at a quarter fires a weak ball, so the wind-up is a bluff you
  can call.
- **The fireball is transport.** It carries the leader and every follower.
  It rolls up grazing unicorns of its own colour on the way (the ball gets
  bigger), throws everyone else it touches, costs a heart to a leader
  caught in the open — and *then puts the herd down where it stopped*,
  still following. Crossing the plain is the same button as attacking.
- **The clash.** Two balls that meet explode. The smaller one loses
  outright: its whole herd is thrown and its leader pays a heart. The
  winner keeps only its *margin* — what it had over the loser — and the
  rest is thrown too. Equal balls both lose. So a clash is never free, and
  a bigger herd is not a guarantee but a margin.
- **Rivals answer.** A fireball coming their way is either met (fold in
  and fire back, if they would win) or sidestepped. They hunt herds smaller
  than theirs, run from herds much bigger, and get bolder over the first
  ninety seconds, because seven herds of ten grazing forever is not a
  match.

## Architecture (F1)

```
fireball/src/
  gl.js     Rainbow Surfer's renderer, verbatim: one program, SOLID / GLOW /
            GLASS, lambert + fog
  uni.js    the box unicorn, once per colour (seven, and WILD): body, a
            single leg drawn four times on a pendulum, head on a neck pivot,
            a longer horn on a leader
  herd.js   the simulation and nothing else: units, leaders, fireballs, the
            rival brains, an event list main.js drains for sound and sparks
  snd.js    the stampede: a gallop in filtered noise, a bass that finds the
            fifth when the herd is big enough, a lead that arrives at a
            third of the plain; the charge riser, the whoosh, the boom and
            its seven-note fan
  main.js   loop, input (keys and a two-zone touch layout), the plain, the
            chase camera, the fireball and explosion glow, the HUD, the
            title with its colour picker and the live plain under it
```

Seventy-seven unicorns at four draw calls each is three hundred draw
calls a frame, which is nothing to the GPU and about a millisecond of
JavaScript; batching was priced and declined. The one mesh per colour
means the herd colour is baked into vertices and free at draw time; the
only per-unicorn state that reaches the shader is the model matrix.

The fireball is *not* a mesh. It is the unicorns themselves, still drawn,
orbiting a point at half size (you can see the herd inside the light),
under three additive discs in rotating colours and four rings. The
explosion is seven rings on the ground and seven in the air, red outside,
plus a hundred and twenty sparks. All the glow in the game — meadows,
edge posts, stars, halos, balls, rings — goes through one additive pass
with a disc mesh and a ring mesh per colour, billboarded by the model
matrix.

## The probe

`tools/test-herd.mjs` (`npm run fireball:test`) drives the DEV build in
headless Chromium. First it plays: boots, wakes the title with one press
and leaves with a second, circles the meadow and asserts the herd grew,
holds SPACE and asserts the charge climbs, releases and asserts the
player's fireball exists and carries the leader, waits and asserts it
landed and unfolded. Then it steps the simulation directly through
`window.FB` — no rendering — through dozens of whole matches with the
player on the rival brain, and asks the questions a herd game has to
answer before anyone plays it:

```
  30 autopilot matches: 29 ended, player won 2, avg 176s, 3.4 clashes/match, max herd 46
ok   autopilot matches end inside 7 minutes       29/30
ok   matches end by fighting, not waiting         3.4 clashes/match
ok   fireballs get thrown
ok   an autopilot player wins sometimes and loses sometimes 2/30
```

The first cut of the brains stalled every match: each rival would only
attack a herd two thirds its size, every herd gathered to ten inside
twenty seconds, and nobody was ever two thirds of anybody. Zero clashes
in twelve matches, all twelve at the seven-minute cap. Boldness that
*rises* — from two thirds to equal over ninety seconds — turned that into
three or four clashes and a winner in about three minutes. A fifteen-second
grace before anyone hunts came next, after the probe's own player was
fireballed while still gathering at eleven seconds.

`max herd 46` is the wild rule working: a leader that takes two statues
inherits their colours.

## F2 — thumbs and ears

Two things the first probe took on faith. The touch layout - lower halves
steer, the top strip is the button - had been written but never driven, and
"pump is called" is not "the browser made a noise". `test-herd.mjs` now
presses the canvas with a pointer and reads the leader's yaw during the
hold (left thumb: yaw 4.71 → 6.66; right thumb: back to 4.89), then holds
the top strip and asserts the charge climbs and lifting fires. For the ear
it patches `createOscillator` before the page boots and counts: **0**
before any gesture, 262 by the time the run has fired once. Silence before
the gesture is as much the requirement as noise after.

The rival list gained hearts under each count, because "who is one hit from
stone" is the question a fireball answers.

And the build tool stopped knowing games by name: each entry carries an
`entry.json` (title, phone viewport) beside its `src/`, so the fourth entry
did not have to edit `native.mjs` the way the third did.

## F3 — horns, the charge, and the rainbow

The first playtest came back with four notes, and three of them were the
same note: *the fireball is nonsense.* A ball that swallowed the herd,
flew as a projectile and put the herd down somewhere else was a teleport
with a hitbox, and it made the herd — the thing the game is about — vanish
at the moment that mattered. What was asked for instead:

- **melee first** — two herds should fight horn to horn;
- **the button is a CHARGE** — a run that gathers speed slowly;
- a long charge should **crackle** between the unicorns, tension building
  the way it does in Dragon Ball, until the band **becomes a sliding
  rainbow the size of itself** — Rainbow Surfer's rainbow with the herd
  where the rider was — and only *that* does harm or meets another.
- and left turned right.

So the fireball is gone. `herd.js` was rewritten around three ideas:

**Momentum decides a blow.** When two herds touch, each contact is settled
by `.6 + speed/12 + 2 × charge` — a unicorn running hard knocks one that
is not, and a charging wedge ploughs a grazing line. Leaders only bounce,
unless the horn came in at over half charge, or the leader has no herd
left to stand behind: then it is a heart. A lone leader is prey; it must
run and gather. The last rule came from the probe — matches stalled for
minutes with a forty-strong herd dancing at four units from a herdless
leader it could not finish, because a charge needs a run-up and the
target kept stepping out of it.

**The charge is a run.** Holding the button no longer stops you; it makes
the herd tighten into a wedge, shoulder to shoulder, and gather speed —
from 11 to 33 over a few seconds, the turn heavier as it goes. From the
first tenth the band crackles: bolts jump between unicorns, thin and rare
at first, a storm at the top, and past two thirds they reach *up*, to a
point hanging over the herd. The ground lights from within. At full charge
(2.4 s + 0.08 s a head) it **ignites**: every unicorn is a lamp of its own
colour, a haze hangs over the band, and the band drags a **tunnel** —
seven arches the width of the herd, red outermost, extruded back along
where it ran and dissolving behind it. You run inside your own rainbow,
and it is faded where it passes the lens so it does not blind you. The
rainbow burns for 2.5 s + 0.12 s a head, or until you let go.

**Only the rainbow does real harm.** Everything under it is thrown; a
leader under it loses a heart with its whole herd; a grazing unicorn of
your colour under it is swept up. Two rainbows that meet explode and the
bigger herd wins outright: the loser's herd is thrown, the winner's
rainbow goes out — a clash costs the momentum too. Two lit herds do not
trade horns; the rainbows settle it.

### The brains had to learn to hold a note

The first rewrite of the rivals produced *zero* clashes in twelve matches
and eleven of them ran to the seven-minute cap. Three findings from the
probe, in order:

1. A brain that re-aimed every quarter second dropped every charge at the
   target's first swerve. Now a charge, once running, is held while the
   target is anywhere ahead.
2. The attacker always arrived before the defender lit, so the clash
   existed on paper only. An **answer** — a charge begun under an incoming
   rainbow — builds twice as fast, and inside forty units a herd over half
   the attacker's size turns and meets it rather than take the certain
   trampling.
3. Rivals could not close on a fleeing leader at equal speed. They sprint
   now, as the player can, when hunting, fleeing or dodging.

```
  30 autopilot matches: 30 ended, player won 5, avg 182s,
  14.4 rainbows (4.7 answers, 4.7s of two lit) and 0.5 clashes/match
```

Every match ends, in three minutes on average, with a rainbow lit
fourteen times a match; about one in two matches has a clash. Two lit
herds share the plain for almost five seconds a match without meeting,
which says the clash is still rarer than the spectacle deserves — the
next thing to tune.

### And left turned right

Yaw grows toward +z, and +z is the *right* of a camera looking along +x.
The first build had LEFT raising the yaw, and the touch probe happily
asserted it, because it only checked that a left thumb *moved* the yaw,
not which way. Both fixed; the probe now says `yaw falls` and `yaw rises`.

## F4 — the plain has an edge, and the rainbow has a price

A second playtest, ten notes, and none of them about the idea - all about
the *feel*. In the order they were given:

**The edge kills now.** There was a soft push-back at the boundary, which
is another way of saying the plain had no edge at all. Crossing it ends
the run: a leader that steps outside turns to stone and its colour goes
wild, whether it walked out or rode a rainbow out at thirty a second.
Inside the last fourteen units the ground lights red in the direction you
are about to leave in, and the HUD says so. **The brains know**, and that
is the half that matters: each rival looks along its own nose - fourteen
units plus a second and a half of its speed, and fifty-five plus its herd
when lit, because a lit herd turns like a barge - and when the edge is out
there it drops everything, aims at the middle, and *lets the rainbow go*.
The probe counts falls against deaths across four whole matches: `0 of 24`.
The first cut, without the let-go rule, killed a third of the field.

**The rainbow burns the herd.** A rainbow thrown at nothing used to cost
only its cooldown. It now spends followers as it runs - about one a second
at a herd of ten, a fifth of the band over a full burn. They drop out
behind you, dazed for four seconds, still your colour: gatherable again,
by you or by whoever gets there first. That is the price of a miss, and it
is a price you can watch being paid, because the herd counter is in the
bar under the word RAINBOW.

**The bigger it is, the worse it steers.** Turn rate divides by
`1 + herd × 0.07` while lit, on top of the charge's own heaviness. A herd
of thirty is a freight train: it wins any clash it reaches and cannot
correct its aim to reach one.

**The herd vanishes into the rainbow.** Past 82% charge the unicorns fade
out, and while it burns they are not drawn at all - the light *is* them.
They fade back in when it goes out. This was the note that made the effect
finally read: before it, a tunnel of rainbow with a herd of white boxes
running inside it looked like two effects fighting.

**And the camera opens up.** Lit, it pulls back ten units plus the herd's
own footprint and rises six more. A shoulder cam on a hundred feet of
rainbow shows none of it.

**The tunnel stopped stepping.** It sampled the herd's position every
ninth of a second and left the sample there, so at charge speed the front
of the tunnel jumped three units at a time. The last sample is now
rewritten *every frame* and a new one only pushed every twentieth of a
second, so the front is always exactly where the herd is.

**Nothing runs in lockstep any more.** Every unicorn carries its own
`gait` (0.82-1.24 leg tempo), `pace` (0.85-1.20 of the slot-chasing
speed), `size` (±7%) and a leg phase offset, and its slot in the wedge
drifts on two slow sines. A herd of forty identical animals at an
identical tempo read as a texture rather than as animals.

**The horn strike has an animation.** The one that lands the blow throws
its head down and forward; the one that takes it rears back, and both
decay over a quarter second. It was the one thing in the fight with no
picture at all.

**And a thrown unicorn now falls properly.** It tumbles about its own long
axis at its own rate, lands, bounces once if it came down hard, skids, and
then spends half a second rolling back onto its feet. Before, it snapped
upright the instant it touched the ground.

**More crackle near the top.** The arc rate went from `k²` to `k³`, which
is far flatter early and a real storm in the last fifth - the tension
belongs where the payoff is.

Two things the round did not change: the music, which was the one note
that came back positive, and the shape of the fight.

### What the probe caught, twice

Both catches were the *test* being wrong, which is its own lesson.
`the rainbow burns the herd` passed while reading `herd 7 -> 0`: the
probe's charge ran the player clean off the plain and the wipeout looked
exactly like the burn. Fixed by measuring the cost in the simulation
instead, with the rivals frozen at their meadows and the loop stopped
before the edge. Then `...and the leader survives its own rainbow` failed
at `hearts 0 at x 95` - the same fault one layer down, a twelve-second
hold that crossed the whole plain. The rule for a probe on a plain with a
lethal edge: never drive further than the plain is wide.

```
  24 autopilot matches: 24 ended, player won 3, avg 154s,
  13.0 rainbows (5.8 answers, 1.2s of two lit) and 0.3 clashes/match
  the brains keep off the edge          0 of 24 deaths were falls
  the rainbow burns the herd as it runs herd 10 -> 9 over two seconds
```

## The wall

F4: **11,071 bytes** packed worst-of-5 at O1, limit 13,312. The edge, the
burn, the fall, the strike and the varied gaits cost about seven hundred
bytes over F3, and 2,241 remain.

## Where it goes next

- **Hearts, seen.** A rival at one heart should look it - a dimmer horn, a
  limp - not only read it in the list.
- **A sky.** The plain has stars, a moon and fog; it wants a horizon.
- **More clashes.** An answering herd now leads its target rather than
  chasing where it was, and two lit herds still share the plain for about
  a second a match without meeting. The remaining gap is that a rainbow
  cannot turn hard enough to close on one that swerves.
- **A skilled policy for the probe.** The autopilot player is the rival
  brain; a policy that hunts wild colours after a kill would say whether the
  snowball is too steep.

## The director's cut

`games/unicorn-fireball` in the games repo is the editor's-cut port on
GameKit Scene3D: the same rules and brains in TypeScript, a seeded plain,
an editor surface (unicorns per colour, rivals, hearts, charge time,
fireball range), the kit's tracker playing the gallop, point lights on the
fireballs, bloom, an aurora, and the catalog gate (trace, capture,
acceptance, agent-play, playtest) green. Its `VISUAL.md` records every
place the rebuild diverges from the 13k original and why.

## Milestone log

| gate | ceiling | packed | notes |
| --- | ---: | ---: | --- |
| F4 the edge and the price | 13,312 | 11,071 (O1 worst-of-5) | leaving the plain is fatal and the brains know it; the rainbow spends the herd and steers worse the bigger it is; the herd dissolves into it and the camera opens up; smooth tunnel, varied gaits, horn strike and fall animations |
| F3 horns, charge, rainbow | 13,312 | 10,396 (O1 worst-of-5) | fireball removed; momentum melee, the charge as a run, arcs, ignition into a rainbow tunnel, answering brains, steering sign fixed |
| F2 thumbs and ears | 13,312 | 9,965 (O1 worst-of-5) | touch zones and audio driven by the probe, rival hearts, per-entry build config |
| F1 first playable | 13,312 | 9,808 (O0) | seven herds on a plain, gathering, the charge, the fireball as transport and weapon, the clash, wild colours, rival brains, the probe |

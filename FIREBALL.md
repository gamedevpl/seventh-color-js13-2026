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

### F4a — the win that unwon itself

The first player to win a match reported it immediately: *"as soon as I
won I lost control, the unicorns rode off the map and in the end I lost."*
Both halves were real, and both were this round's own doing.

The end screen asked `lost()` **live**, every frame it painted. The run
was over, but the plain was not: the closing shot keeps stepping the
simulation, so a herd still carrying thirty a second - and nobody
steering it any more - ran on and crossed the fatal line a second later.
The screen dutifully changed its mind.

Three lines, all of them the same idea: **the result is decided once, at
the moment it happens, and kept.** `victory` is recorded on the
transition and the end screen reads that. Every rainbow goes out with the
run, so nothing is still being ridden by nobody. And `step` now takes an
`over` flag: once a run has ended, the plain stops taking leaders, and
anything that reaches the line is simply set down just inside it.

The probe grew the case, driven through the real loop rather than through
`step` - the win transition lives in the frame loop, and the first cut of
this test drove the simulation directly and never saw it:

```
ok  winning the plain is recorded as a win        victory true, mode end
ok  ...and running on afterwards cannot undo it   victory true, leader st 0 at x 93
```

### F4b — a ground you can measure, and a blast with a volume

Two looks, one question each. *Why is the 13k ground black and the
director's cut green - which is right?* And: *the explosion is gradienty,
not volumetric.*

**The ground.** Dark is right, and for a reason that is not taste: every
important thing in this game is additive light - the meadows, the arcs,
the rainbow, the blast - and additive light over a pale ground reads as
the ground rather than as light. The 13k plain was not too dark, it was
too *uniform*: one flat slab has nothing on it for the eye to measure
against, so a herd at thirty a second looked like it was standing still.
It now carries 260 low-contrast patches, laid flat over the slab, dark
enough that the light is still the only bright thing and varied enough
that the ground moves under you. The director's cut got the same treatment
from the other direction: its noise texture went darker so the glow reads
against it.

**The blast.** It was seven concentric rings on the ground and seven more
rising in a stack - which is a *gradient*, drawn once and scaled up.
Rings do not make a volume; overlapping bodies do. The explosion is now:

- **one shockwave**, thin and fast, travelling out along the ground, with
  a second just inside it cycling the colours;
- **a cloud of puffs** - up to fifty little billowing balls, each born on
  a shell a couple of metres out along its own direction rather than all
  at the same point (which is what made the old one a saturated blob with
  a fringe), each with its own birth delay so the thing *blooms* over a
  quarter second, its own colour, and a size drawn from a squared random
  so a few slow boulders sit among a lot of small fast ones. They are
  thrown outward, slowed hard by drag, lifted gently, and drawn as two
  discs each - one inside the other - so every puff has a core;
- **a small, brief white flash**, and nothing else at the centre. The old
  version's big white core disc was most of why the whole blast read flat.

The probe photographs one on purpose now, twenty units in front of the
lens, at a third of a second and again at seven tenths - the simulation's
own clashes land in whatever frame the search stopped on, which is never
the one worth looking at.

## F5 — the plain, shared

js13kGames 2026 has an **Online** category: a WebSocket relay hosted on
Cloudflare, free to build on, and a rule that the game must still work on
its own. The whole of it is one address per room, and it does four things:

- it hands each socket a name of its own the moment it connects;
- it repeats whatever you send to every OTHER socket in the room, and
  never back to you;
- it says a line when somebody arrives (`+name`) or leaves (`-name`);
- and `@name|...` reaches that one socket instead of the room.

Nothing else. No state, no rooms that outlive their last member, no
authority. Everything below is built out of that.

### What multiplayer is here

Not a new game: the same plain, the same seven meadows, the same seven
herds. **Every person on the plain drives one of them, and the brains keep
the rest.** That single decision pays for itself three times over.

- **It is offline-first for free.** One person in a room is exactly the
  game you play with no socket at all - six rivals, same brains.
- **Nobody waits in a lobby.** An arrival takes a herd off the brains
  mid-match; a departure hands it back. There is no "waiting for players"
  and no round to sit out.
- **It fixes the thing the brains cannot do.** Two lit herds share the
  plain for about a second a match and hardly ever meet, because a rainbow
  cannot turn hard enough to close on one that swerves (see *Where it goes
  next*). Two people can. Rainbow against rainbow was always the end-game;
  online is where it actually happens.

### Who runs the plain

One client is the **host**: it alone runs `step`, and twelve times a second
it writes the entire plain into a packet. Everyone else animates what they
are told and sends three bytes of input back.

The alternative was lockstep - everyone runs the same simulation on the
same inputs - and it was rejected on sight. `herd.js` is thick with `sin`,
`cos`, `atan2` and `hypot`, and those disagree in the last place between
one engine and the next. A minute of that is a plain that has quietly
become two plains, and the checksum-and-resync needed to notice costs more
than sending the state does.

Who hosts is **not negotiated**. Everyone announces their name once a
second, so everyone holds the same set of names, and:

- if nobody has sent a packet for 1.2 seconds, the smallest name starts;
- whoever is running the plain **keeps** running it while they are there;
- two hosts can only happen in the first second of an empty room, and the
  packet carries a random tag so the larger one stands down mid-packet.

The first build gave the plain to the smallest name outright. That is
wrong, and the probe said so: every arrival with a small name took the
plain off whoever had it, so **joining froze the game for a second and a
half for everybody already playing**. Stability beats order. An arrival
should be invisible to the people already there.

When a host leaves, the plain does not restart. Everyone left has been
drawing it all along, so whoever takes over simply carries on from the
state they were already holding.

### The packet

Seven bytes a unicorn - two each for x and z, one for the heading, one
holding state, herd and colour together, one for height - and four a
leader on top. Seventy-seven unicorns, so **564 bytes, twelve times a
second**: 6.5 KB/s up from the host, and about 45 KB/s out of the relay
with seven people on the plain. Measured on the real relay before a line
of game code was written: 12 Hz to six peers, not one frame dropped, 30 ms
at the median and 44 at the 99th.

What is NOT in the packet is the interesting half. Leg phase, tumbles,
the horn's lunge and recoil, the herd's footprint, the arcs, the particles
and every sound are worked out on each client from what it can see. They
are the parts nobody can tell apart from the real thing, and they are most
of the bytes. The client eases toward the positions it is given rather
than snapping to them, so a packet every 83 ms still draws at 60.

A client is told states, not events, so the noises are read back out of
what changed: a herd that lit is an ignition, a heart that went at the same
moment a rainbow went out is a clash, and one that went on its own is a
horn.

### The probe

`tools/test-online.mjs` runs two and then three headless browsers against
a relay of our own - `tools/lib/relay.mjs`, a hundred lines with exactly
the four behaviours above - and asks:

- do two people agree on which of them runs the plain, without a word
  about it?
- do they end up on different herds, and does the second one's herd obey
  the second one's thumbs and nobody else's?
- does the plain the guest draws match the plain the host is running?
- does an arrival mid-match leave the plain running?
- and when the host walks out, does the plain carry on from where it was?

`--live` runs the same questions against the competition's own relay,
which is the only way to find out that the stand-in still tells the truth.
It earned its keep immediately. Two bugs only the real thing produced:

- **a dt of zero.** Three tabs make the frame clock jump, and two frames
  inside the same millisecond divide a distance by zero. The infinity
  reached an oscillator as a NaN and took the whole loop down.
- **a blast with no size.** The client's derived clash called `boom()`
  without the power the sound needs, so its gain was NaN - same crash,
  different door.

Neither is reachable offline. The lesson is the one this project keeps
learning: the stand-in tells you the protocol is right, and only the real
thing tells you the game is.

### What it cost

1,675 bytes packed. There were 1,945 to spend.

## F6 — nobody waits for a round

The first shared plain had rounds: one herd left standing, five seconds,
everybody dealt a new plain. Playing it, the first question was *"when do I
start - am I waiting for a round to finish?"*, which is the sound of a rule
nobody can see. Worse, it was not even the rule that hurt: a person taking
a seat mid-run inherited whatever the brains had left there, which could be
a leader on its last heart with nothing behind it, or a statue.

So the plain no longer ends.

- **Five seconds after a leader turns to stone it rises again** at its own
  meadow with three hearts, and its colour is called home out of the wild
  ones nobody is holding. Losing the herd is the whole punishment - you
  have to gather it again, which is most of the game - and losing the
  session would only empty the room.
- **A seat just taken gets a herd worth taking**: the same fresh deal. Only
  on the way in, though. A rider who dies waits out the five seconds like
  everybody else, or the plain has no teeth for the people on it.
- Nobody waits for anything. There is no round to sit out and no round to
  explain.

### The stand

Being out is a seat in the stand, not a black screen. While your leader is
stone - or while the plain is full and you have no seat at all - the camera
lifts and pulls back, **left and right walk the herds still standing**, and
the screen says which of the two you are: `DOWN - RIDING AGAIN IN 4`, or
`NO SEAT - WATCHING`. The count is real: a stone leader has no rainbow left
to burn, so that byte of the packet carries the seconds until it rises
instead, and costs nothing.

### Which of them is a person

Every herd used to look the same from outside, so you could not choose your
fight - and choosing your fight is the entire reason to be in a room with
other people. One spare bit in the leader's flag byte says a person is
riding, and it draws as **a white pip**, on the rival list and on the
radar.

The radar was rebuilt around it. It used to plot all seventy-seven
unicorns, which at sixty-eight pixels is a texture rather than
information; now it is one dot a herd, sized by the herd, ringed when it
is lit and pipped when somebody is riding it. It says less and shows more,
and it paid for the pips.

### Are the brains worth keeping online?

Yes, and it is worth writing down why, because the obvious answer is no.

- **They hold the unicorns.** Without led herds the plain is seven meadows
  of loose grazers and no reason to cross it: everyone gathers their own
  colour in peace. The brains are what makes the middle contested.
- **Two people on an empty plain is not a game.** A public room usually has
  one to three people in it. With nothing else on the plain that is a duel
  across a hundred and ninety units of nothing, most of it spent running
  toward each other.
- **Leaving must not leave a hole.** People go. Their herd has to keep
  existing or the plain empties over an evening.

The problem was never that the brains are there; it was that you could not
tell them from people. That is the pip.

What is NOT done, and is the obvious next move: **fewer brains as more
people arrive**. A colour nobody is riding could graze wild instead of
being led, so a full room is all human and the loose unicorns become the
prize everyone is crossing the plain for. It did not fit in what was left
of the budget.

### What it cost

The whole of it, plus the ground for it: 13,239 packed worst-of-5 at O1
against a 13,312 ceiling. The radar rebuild and a shorter title paid for
most of it.

## F7 — is anybody there?

The pips said *which* herd was a person. They did not answer the question
you actually have, which comes before that one: *is anybody here at all?*
And the answer had to arrive on its own, not be hunted for on a list.

- **The title listens.** Once the first gesture has woken the page, the
  title opens the socket in a quiet mode - never announcing, never hosting,
  never touching the plain on screen - and reads the seat count out of the
  host's packets. So before O is ever pressed the title says `2 riding
  online now - press O`, or `nobody riding online yet - press O`. Pressing
  O closes that socket and opens a real one; the reconnect is a hundred
  milliseconds, and cheaper than teaching a listener to become a rider.
- **Somebody came, somebody went.** The seating is diffed as it changes,
  and `RIDER JOINED` / `RIDER LEFT` is said once, in that herd's colour -
  the message wears the colour rather than naming it, which is both
  shorter and quicker to read. Not on the first roster a newcomer sees,
  which would read the whole room out to them, and never about yourself.

Two of the owner's calls shaped this. *One room, always* - there will
never be many players, and a second room or an overflow is code nobody
will ever run. And *a socket that hangs* had to stop saying it was
joining, which is the six-second give-up from F5, kept.

### Paid for with

A `whoosh` that was still playing under every ignition - the sound of a
fireball leaving, from a game that no longer has one. The re-announce on
hearing a new name, which bought nothing once the host stopped changing on
arrival. A `join()` that turned a listener into a rider, replaced by close
and open. Two title lines becoming one. And a bug found on the way: a
socket closes asynchronously, so its handlers must be taken off before a
new one opens, or the old one's `onclose` lands on the new one and zeroes
it.

The reconnect found a second one, subtler. The names a socket heard were
kept across `close()`, so the listener's own old name stayed in the set,
sorted smallest, and blocked the election for the three and a half seconds
it took to go stale: nobody hosted, nobody was seated, and the probe saw a
plain that never started. The lesson is the one every reconnect teaches -
a socket's memory belongs to the socket, and goes with it.

And a third, from the probe starving its third browser: the once-a-second
hello ran on the frame clock, so a tab drawing slowly announced itself
slowly, and a tab in the background - where the browser stops the frame
loop altogether - would have stopped announcing itself at all, been pruned
by everyone else after three and a half seconds, and lost its seat while
still connected. Hellos now run on a wall clock, and the first goes out
the moment the relay hands over a name.

## F7a — the black sectors

Played on a real monitor, the plain had black rectangles on it: hard-edged
sectors, as if the ground were missing in places. They were the F4 ground
patches, meant to be a fifth darker or lighter than the slab so the eye
had something to measure speed against - and on a dark tone a fifth is
not subtle, it is a different colour.

But the patches were not the cause, only the witness. **Fog is worked out
per vertex, and the slab was one 600-unit box**: every vertex of it sat
deep in the fog, so the whole plain drew in fog colour even under your
hooves, while anything small - a patch, a unicorn - had its vertices near
and drew true. The plain was never dark; it was fogged from underneath.
Which is also, in hindsight, why it read as a void in F4 and why the
patches seemed to fix it: they were the only part of the ground drawn at
its real colour.

The slab is now a grid of 25-unit tiles, so fog runs across it as a
gradient toward the horizon like it does across everything else, and the
mottling is back to a few percent, where it was always meant to be:
texture, not geography.

The end screen also lost its time line and the best-time save behind it.
A detail nobody asked for, and forty bytes.

## The wall

F7a: **13,203 bytes** packed worst-of-5 at O1, limit 13,312, and **109
remain** - the best-time save bought the tiles and more. F7 stood at
13,285 with 27 to spare. F6 stood at 13,239; presence cost about 190 and paid back about
140 out of things that were no longer earning their place. Every change from here has to pay for itself out of something
already in the build - the stand, the pips and the respawn were paid for
by a radar that said less, and by four lines of title prose becoming
three.

## Where it goes next

- **Hearts, seen.** A rival at one heart should look it - a dimmer horn, a
  limp - not only read it in the list.
- **A sky.** The plain has stars, a moon and fog; it wants a horizon.
- **More clashes.** An answering herd now leads its target rather than
  chasing where it was, and two lit herds still share the plain for about
  a second a match without meeting. The remaining gap is that a rainbow
  cannot turn hard enough to close on one that swerves. Online sidesteps
  this rather than solving it: two people close on each other perfectly
  well, and the brains still cannot.
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

Its multiplayer is **not** this one, and deliberately so. The competition
relay is a room on the internet; the platform already has party mode - one
screen, phones as controllers - and a game that reimplemented a WebSocket
protocol there would be a second way of doing something the platform does
already. So the director's cut shares a screen instead: four of the seven
herds can be driven by people, by phone through the lobby or by a second
and third pair of hands on the same keyboard, and the brains keep the
rest. The drop-in rule is the same one as here, and it arrives at it from
the other direction - a herd is the brains' until somebody touches its
controls.

The one thing that could not be shared is the shot. A chase camera behind
one herd hides everybody else, which in a game about herds meeting is the
whole show, so two or more drivers lift the camera into an overview that
holds all of them. The heading stays fixed; only the distance answers to
how far they have drifted apart.

The kit gained `party.held(dt, { idleSeconds })` on the way: the claim
rule - a slot is a person once a phone lands on it or its keys are
touched, and a keyboard seat left alone goes back to the bots - was being
written again in every party game.

## Milestone log

| gate | ceiling | packed | notes |
| --- | ---: | ---: | --- |
| F7a the black sectors | 13,312 | 13,203 (O1 worst-of-5) | the ground slab tiled so per-vertex fog no longer paints the whole plain fog-coloured; mottling down to a few percent; end-screen time line and best-time save removed |
| F7 is anybody there? | 13,312 | 13,285 (O1 worst-of-5) | the title listens quietly and counts the riders before O is pressed; RIDER JOINED / LEFT said once in the herd's colour; hellos on a wall clock; one room, always; the whoosh, the re-announce and join() gone |
| F6 nobody waits for a round | 13,312 | 13,239 (O1 worst-of-5) | the shared plain never ends: five seconds after a leader falls it rises at its meadow with its colour called home, and a seat just taken is dealt the same fresh herd; a stand to watch from with left and right walking the herds and a real countdown; a white pip on every herd a person is riding, on the list and on a radar rebuilt to say less |
| F5 the plain, shared | 13,312 | 13,049 (O1 worst-of-5) | the Online category: up to seven people on one plain, a herd each and the brains on the rest; a host that writes the whole plain into 564 bytes at 12 Hz, clients that animate it and send three bytes back; hosting settled by sorting names, never by asking; a probe that runs three browsers against a relay of our own and against the real one |
| F4 the edge and the price | 13,312 | 11,336 (O1 worst-of-5) | leaving the plain is fatal and the brains know it; the rainbow spends the herd and steers worse the bigger it is; the herd dissolves into it and the camera opens up; smooth tunnel, varied gaits, horn strike and fall animations |
| F3 horns, charge, rainbow | 13,312 | 10,396 (O1 worst-of-5) | fireball removed; momentum melee, the charge as a run, arcs, ignition into a rainbow tunnel, answering brains, steering sign fixed |
| F2 thumbs and ears | 13,312 | 9,965 (O1 worst-of-5) | touch zones and audio driven by the probe, rival hearts, per-entry build config |
| F1 first playable | 13,312 | 9,808 (O0) | seven herds on a plain, gathering, the charge, the fireball as transport and weapon, the clash, wild colours, rival brains, the probe |

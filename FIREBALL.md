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

## The wall

F1: **9,808 bytes** packed at O0, limit 13,312. Three and a half
kilobytes in hand, which is where the next rounds go.

## Milestone log

| gate | ceiling | packed | notes |
| --- | ---: | ---: | --- |
| F1 first playable | 13,312 | 9,808 | seven herds on a plain, gathering, the charge, the fireball as transport and weapon, the clash, wild colours, rival brains, the probe |

// The unicorn works the set on its own. This is what makes the shutter a
// decision rather than a button: the poses worth having are rare and short,
// so the player has to be pointing at the right thing when one happens.
//
// A weighted table rather than a state graph. A graph would let poses lead
// into each other, which sounds better and plays worse - what a photographer
// needs is that a big pose can arrive at any moment, not that it is reachable
// only from standing.

import { IDLE, WALK, TROT, PRANCE, REAR, TOSS, SHAKE, BOW, GRAZE, SLEEP } from './pose.js';
import { warmth, PALETTE, RB } from './deco.js';

// [pose, weight, how long it holds]. The showy four are rare AND brief,
// which is the same lever pulled twice: a rearing unicorn is worth more
// because it is worth more, and because you might miss it.
const REPERTOIRE = [
  [IDLE, 5, 2.4],
  [GRAZE, 2, 2.6],
  [WALK, 2, 2.6],
  [TROT, 1, 2.0],
  [PRANCE, 3, 3.2],
  [TOSS, 2, 1.0],
  [SHAKE, 2, 1.5],
  [BOW, 1, 1.8],
  [REAR, 1, 1.3],
  // Base weight is almost irrelevant: sleep is gated on boredom below, so
  // it never happens to a player who is shooting and always happens to one
  // who is not. A subject that lies down is the clearest possible statement
  // that the shoot has stalled.
  [SLEEP, 1.2, 3.2],
];

// Poses a photograph is actually about. The score knows this too, and it is
// the same list on purpose - what the unicorn does rarely and what is worth
// catching have to be the same set, or the game asks for one and rewards
// the other.
export const SHOWY = [PRANCE, TOSS, SHAKE, BOW, REAR];

// How fast each gait actually travels. Roughly stride length times stride
// rate, so the hooves do not skate - and, more to the point, so that a
// walking unicorn LEAVES where it was standing.
const SPEED = { [WALK]: .58, [TROT]: 1.06, [PRANCE]: .34 };
const ROAM = 1.35;             // how far from the middle of the set it strays

export function makeActor() {
  return { hold: 0, next: 1.5, gaze: 0, gazeNext: 2, turn: 0, spark: 0, bored: 0 };
}

// STYLING IS NOT PAINT. What you put on the unicorn changes what it does,
// which is the whole reason the dressing-up screen exists at all: before
// this, a brief that said "warm colours, catch a rear" had one right answer
// on the palette and no way to act on the second half. Now the first half IS
// how you get the second.
//
// Measured, the wanted pose turned up 0.9 to 3 times per thirty seconds and
// held for under two - so waiting for it was patience and a dice roll.
export function temper(deco) {
  const coat = warmth(PALETTE[deco.coat]);
  // The rainbow is warm-ish by nature; it is the unicorn's own colouring.
  const mane = deco.mane === RB ? .3 : warmth(PALETTE[deco.mane]);
  const w = coat * .6 + mane * .4;
  return { warm: Math.max(0, w), cool: Math.max(0, -w), glit: deco.glitter / 3 };
}

// How much more likely each pose becomes, given the look and the mood.
// Three rules a player can actually learn, and the bench says them out loud:
//   warm and bold  - it struts and rears, because it is showing off
//   cool and dark  - it settles, and it watches you
//   glitter        - it shakes, because it can feel the stuff
function weightOf(e, t, spark, bored) {
  const [pose, base] = e;
  let m = 1;
  // Glitter's effect is the strongest of the three on purpose. Shaking is
  // what throws the stuff into the air, and glitter in the air is the single
  // best thing a photograph of this animal can contain - so the styling
  // choice and the money shot are the same decision.
  if (pose === SHAKE) m += t.glit * 4.2;
  if (pose === PRANCE) m += t.warm * 1.8;
  if (pose === REAR) m += t.warm * 2.4;
  if (pose === TOSS) m += t.warm * .9 + t.glit * .9;
  // Cool must be a DIFFERENT strategy, not a worse one. It first boosted
  // standing and grazing - poses worth 30 and 40 - so dressing for a cool
  // brief spoiled all six frames to collect one styling bonus, and the
  // balance probe duly reported that ignoring the brief outscored obeying it
  // (3,400 against 4,423). A brief that is cheaper to disobey is not a brief.
  //
  // So cool now buys the two things it should: bows, which are worth 230,
  // and the long looks down the lens that eye contact pays for. Warm offers
  // many showy moments; cool offers fewer, better ones.
  if (pose === BOW) m += t.cool * 3.6;
  // A flash wakes it up; a long wait with no shutter sends it to sleep.
  // Squared, so it is genuinely absent from a working shoot and genuinely
  // the main event once the player has stopped. At the first weighting it
  // reached only 8% of pose changes at full boredom - a consequence nobody
  // would ever see, which is the same as no consequence.
  if (pose === SLEEP) return base * bored * bored * 9;
  // The flash helps; it must not decide. At four times the odds, spraying
  // the shutter summoned showy poses reliably enough that waiting for one
  // was strictly worse than not waiting - which turns the provocation into a
  // replacement for timing rather than a tool for it.
  if (SHOWY.includes(pose)) m *= (1 + spark * 1.7) * (1 - bored * .72);
  else m *= 1 + bored * 2.2;
  return base * m;
}

// The shutter is the only tool a photographer has, so it is also the only
// thing that can provoke. A flash makes the unicorn look, and for a second
// or two afterwards it is far likelier to do something worth catching -
// which turns a frame into currency: spend one to buy a better next one.
export const poke = (A) => { A.spark = 1; A.bored = Math.max(0, A.bored - .55); };

// The unicorn WALKS THE SET. Until it did, the camera could be aimed once
// and left, and framing cost nothing after the first second - the balance
// probe put composition at 1.12x, which is another way of saying it was not
// a skill. A subject that moves has to be followed.
export function move(A, anim, P, dt) {
  const sp = SPEED[anim.mode] || 0;
  P.yaw += A.turn * dt;
  if (sp) {
    P.x += Math.sin(P.yaw) * sp * dt;
    P.z += Math.cos(P.yaw) * sp * dt;
  }
  // A leash rather than a wall: past the roaming radius it steers back
  // toward the middle instead of stopping dead at an invisible edge.
  const r = Math.hypot(P.x, P.z);
  if (r > ROAM) {
    const want = Math.atan2(-P.x, -P.z);
    let d = ((want - P.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    P.yaw += d * Math.min(1, dt * 1.6);
  }
}

// What it will do while you are dressing it. THE POSES ARE THE SURPRISE:
// a unicorn that rears and tosses its mane on the styling bench has spent
// the best thing the shoot has to offer before the shoot starts. On the
// bench it mooches - stands, grazes, wanders - and everything showy waits
// for the camera.
const CALM = [IDLE, GRAZE, WALK];
export function act(A, anim, dt, deco, calm) {
  A.hold += dt;
  A.gazeNext -= dt;
  A.spark = Math.max(0, A.spark - dt / 1.6);
  // Boredom is the clock the shoot never had. Dawdling costs: the poses
  // worth photographing thin out and it starts looking for something to eat.
  // Slow. At a 26-second fuse this punished the one skill it was meant to
  // leave alone: a player waiting for a rear accumulated boredom while
  // waiting, and the balance probe showed composition-only outscoring
  // composition-plus-timing. Boredom is for a player who has stopped, not
  // for one who is being patient.
  A.bored = Math.min(1, A.bored + dt / 55);

  // Eye contact comes and goes on its own clock, because a unicorn that
  // stared down the lens forever would make the best shot in the game free.
  const t = temper(deco);
  if (A.spark > .35) A.gaze = 1;               // it looks at whatever flashed
  else if (A.gazeNext <= 0) {
    A.gaze = A.gaze > .5 ? 0 : 1;
    // A calm, cool-coloured unicorn watches you for longer. That is the
    // other half of the cool look being worth choosing.
    A.gazeNext = A.gaze ? (1.2 + t.cool * 1.4) + Math.random() * 1.6
      : (1.8 - t.cool * .7) + Math.random() * 3;
  }
  anim.gaze += (A.gaze - anim.gaze) * (1 - Math.exp(-dt / .25));

  if (A.hold < A.next) return;
  // Weights are recomputed per pick rather than cached: the look can change
  // between rounds and the mood changes within one.
  const rep = calm ? REPERTOIRE.filter((e) => CALM.includes(e[0])) : REPERTOIRE;
  const ws = rep.map((e) => weightOf(e, t, A.spark, A.bored));
  let r = Math.random() * ws.reduce((a, b) => a + b, 0), pick = rep[0];
  for (let i = 0; i < rep.length; i++) { r -= ws[i]; if (r <= 0) { pick = rep[i]; break; } }
  // Never twice in a row: repeating a pose reads as the animal being stuck,
  // and it also lets a patient player farm one rare pose by waiting.
  if (pick[0] === anim.mode) pick = rep[0];
  anim.mode = pick[0];
  anim.hold = 0;
  A.hold = 0;
  A.next = pick[2];
  A.turn = (Math.random() * 2 - 1) * .7;
}

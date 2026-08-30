// The unicorn works the set on its own. This is what makes the shutter a
// decision rather than a button: the poses worth having are rare and short,
// so the player has to be pointing at the right thing when one happens.
//
// A weighted table rather than a state graph. A graph would let poses lead
// into each other, which sounds better and plays worse - what a photographer
// needs is that a big pose can arrive at any moment, not that it is reachable
// only from standing.

import { IDLE, WALK, TROT, PRANCE, REAR, TOSS, SHAKE, BOW, GRAZE } from './pose.js';

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
];
const TOTAL = REPERTOIRE.reduce((a, r) => a + r[1], 0);

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
  return { hold: 0, next: 1.5, gaze: 0, gazeNext: 2, turn: 0 };
}

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

export function act(A, anim, dt) {
  A.hold += dt;
  A.gazeNext -= dt;

  // Eye contact comes and goes on its own clock, because a unicorn that
  // stared down the lens forever would make the best shot in the game free.
  if (A.gazeNext <= 0) {
    A.gaze = A.gaze > .5 ? 0 : 1;
    A.gazeNext = A.gaze ? 1.2 + Math.random() * 1.6 : 1.8 + Math.random() * 3;
  }
  anim.gaze += (A.gaze - anim.gaze) * (1 - Math.exp(-dt / .25));

  if (A.hold < A.next) return;
  let r = Math.random() * TOTAL, pick = REPERTOIRE[0];
  for (const e of REPERTOIRE) { r -= e[1]; if (r <= 0) { pick = e; break; } }
  // Never twice in a row: repeating a pose reads as the animal being stuck,
  // and it also lets a patient player farm one rare pose by waiting.
  if (pick[0] === anim.mode) pick = REPERTOIRE[0];
  anim.mode = pick[0];
  anim.hold = 0;
  A.hold = 0;
  A.next = pick[2];
  A.turn = (Math.random() * 2 - 1) * .7;
}

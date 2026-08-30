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

export function makeActor() {
  return { hold: 0, next: 1.5, gaze: 0, gazeNext: 2 };
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
}

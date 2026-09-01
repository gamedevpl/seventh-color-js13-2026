// The unicorn, as boxes - Rainbow Surfer's animal, re-coloured. A herd game
// needs SEVEN of it: coat stays moonlit white, and the mane, tail and hooves
// carry the herd colour, because that colour is the whole rule set (you can
// only gather your own). One body mesh and one head mesh per colour, built
// once; the LEGS are a single mesh drawn four times with a pendulum swing
// so the herd trots instead of sliding, at four draw calls a unicorn.

import { pushBox, createMesh } from './gl.js';

export const RAINBOW = [
  [.86, .30, .32], [.90, .56, .26], [.90, .82, .30], [.44, .76, .42],
  [.32, .66, .78], [.42, .48, .88], [.68, .42, .84],
];
// The eighth colour: WILD. A defeated herd's unicorns lose their leader's
// colour and go white-gold, and anyone may gather them.
export const WILD = [.95, .90, .72];
export const COL = [...RAINBOW, WILD];

const W = [.93, .91, .88];                      // moonlit white
export const PIVOT = [0, .78, .34];             // neck base, in model space
// Hip pivots for the four legs, in model space: [x, z].
export const HIPS = [[-.15, .34], [.15, .34], [-.15, -.34], [.15, -.34]];

export function bodyMesh(c) {
  const v = [];
  pushBox(v, 0, .62, 0, .46, .40, .96, ...W);          // body
  pushBox(v, 0, .58, .42, .40, .34, .30, ...W);        // chest
  // the tail: three strands of the herd colour, fanned
  for (let i = -1; i <= 1; i++) {
    pushBox(v, i * .1, .74 - Math.abs(i) * .04, -.56 - Math.abs(i) * .04, .06, .06, .36, ...c);
  }
  return createMesh(v);
}

// One leg, hung from its hip (the hip is the origin) so a rotation about
// x swings it. Hoof in the herd colour: a running herd flashes its colour
// underneath itself, which reads at a distance where a mane does not.
export function legMesh(c) {
  const v = [];
  pushBox(v, 0, -.19, 0, .13, .38, .13, .84, .82, .80);
  pushBox(v, 0, -.43, 0, .14, .10, .15, ...c);
  return createMesh(v);
}

// Everything above the neck base, RELATIVE to the pivot so one rotation
// nods the whole head. The skull is wider than the neck so a unicorn seen
// from behind - which is where the camera lives - still has a head.
export function headMesh(c, leader) {
  const v = [];
  pushBox(v, 0, .14, .14, .22, .46, .24, ...W);          // neck
  pushBox(v, 0, .38, .32, .36, .30, .48, ...W);          // skull
  // The horn: gold, and on a LEADER half again as long - the one thing
  // that tells the unicorn you are steering from the ones you lead.
  pushBox(v, 0, .60 + (leader ? .1 : 0), .56, .08, leader ? .54 : .34, .08, .93, .78, .38);
  pushBox(v, -.14, .58, .20, .07, .17, .07, ...W);       // ears
  pushBox(v, .14, .58, .20, .07, .17, .07, ...W);
  pushBox(v, 0, .34, -.02, .16, .40, .20, ...c);          // mane crest
  pushBox(v, 0, .52, .10, .14, .14, .26, ...c);
  return createMesh(v);
}

export function buildAll() {
  return COL.map((c) => ({ body: bodyMesh(c), leg: legMesh(c), head: headMesh(c), crown: headMesh(c, 1) }));
}

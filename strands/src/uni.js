// The unicorn, as boxes. Low-poly on purpose: at chase distance a chunky
// silhouette with a gold horn and a rainbow tail reads better than any
// amount of geometry the budget could not afford anyway. Built once;
// animation is a gallop bob applied to the model matrix, not to vertices.

import { pushBox, createMesh } from './gl.js';

export const RAINBOW = [
  [.79, .32, .31], [.85, .54, .29], [.85, .76, .31], [.49, .71, .42],
  [.35, .61, .69], [.42, .49, .79], [.60, .42, .77],
];

export function unicornMesh() {
  const v = [];
  const W = [.93, .91, .88];                    // moonlit white
  // body, chest, haunch
  pushBox(v, 0, .62, 0, .46, .40, .96, ...W);
  pushBox(v, 0, .58, .42, .40, .34, .30, ...W);
  // neck + head, leaning into the run
  pushBox(v, 0, .92, .48, .24, .46, .24, ...W);
  pushBox(v, 0, 1.14, .64, .26, .24, .44, ...W);
  // golden horn
  pushBox(v, 0, 1.30, .84, .07, .30, .07, .91, .77, .41);
  // ears
  pushBox(v, -.09, 1.30, .52, .06, .14, .06, ...W);
  pushBox(v, .09, 1.30, .52, .06, .14, .06, ...W);
  // mane - a violet crest down the neck
  pushBox(v, 0, 1.06, .34, .10, .34, .18, .45, .32, .62);
  // four legs
  for (const [lx, lz] of [[-.15, .34], [.15, .34], [-.15, -.34], [.15, -.34]]) {
    pushBox(v, lx, .24, lz, .13, .48, .13, .82, .80, .78);
  }
  // the tail: seven strands, one per color the world got back
  RAINBOW.forEach((c, i) => {
    const a = (i - 3) * .16;
    pushBox(v, Math.sin(a) * .12, .74 - i * .015, -.52 - Math.cos(a) * .06, .05, .05, .34, ...c);
  });
  return createMesh(v);
}

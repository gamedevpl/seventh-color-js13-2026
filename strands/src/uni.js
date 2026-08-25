// The unicorn, as boxes - now in two meshes: the body, and the HEAD hung
// on a neck pivot, because the head is where the character lives. It drops
// low when boosting, and it nods to the music, because the music is good
// and the unicorn knows it.

import { pushBox, createMesh } from './gl.js';

export const RAINBOW = [
  [.79, .32, .31], [.85, .54, .29], [.85, .76, .31], [.49, .71, .42],
  [.35, .61, .69], [.42, .49, .79], [.60, .42, .77],
];

const W = [.93, .91, .88];                      // moonlit white
export const PIVOT = [0, .78, .34];             // neck base, in model space

export function unicornMesh() {
  const v = [];
  // body, chest, haunch
  pushBox(v, 0, .62, 0, .46, .40, .96, ...W);
  pushBox(v, 0, .58, .42, .40, .34, .30, ...W);
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

// Everything above the neck base, built RELATIVE to the pivot so a single
// rotation nods the whole head: neck, skull, horn, ears, mane.
export function headMesh() {
  const v = [];
  // The skull is wider than the neck on purpose: seen from directly behind
  // - which is where the camera lives - a skull the neck's width vanishes
  // completely behind it and the unicorn reads as a headless box.
  pushBox(v, 0, .14, .14, .22, .46, .24, ...W);          // neck
  pushBox(v, 0, .38, .32, .36, .30, .48, ...W);          // skull
  pushBox(v, 0, .60, .56, .08, .34, .08, .91, .77, .41); // golden horn
  pushBox(v, -.14, .58, .20, .07, .17, .07, ...W);       // ears
  pushBox(v, .14, .58, .20, .07, .17, .07, ...W);
  pushBox(v, 0, .34, -.02, .16, .40, .20, .45, .32, .62); // violet mane crest
  return createMesh(v);
}

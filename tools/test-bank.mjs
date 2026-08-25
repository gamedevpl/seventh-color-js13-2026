// Which way does the track bank? On a real banked curve the surface normal
// leans INTO the turn (toward the centre), like a motorcycle. Leaning out
// is the opposite of what a body does, and reads as wrong even when the
// player cannot say why.
import { makeCourse } from '../strands/src/course.js';
import { frame, edgePos } from '../strands/src/track.js';

// A deliberate left-hand bend: yaw increases toward +X.
const A = { p: [0, 0, 0], dir: [0, 0, 1], i: 0, req: 0, twist: false, next: [] };
const B = { p: [14, 0, 20], dir: [0.6, 0, 0.8], i: 1, req: 0, twist: false, next: [] };
A.next = [{ to: B, gap: false }];

const [, T, side, up] = frame(A, B, .5);
// screen-left when facing +Z is +X
const leftness = side[0] > 0 ? 'side points screen-LEFT' : 'side points screen-RIGHT';
const tilt = up[0];
console.log(`bend turns LEFT (yaw toward +X)`);
console.log(`${leftness}   up = [${up.map((v) => v.toFixed(3)).join(', ')}]`);
console.log(tilt > .02 ? 'up leans toward +X = INTO the turn: correct'
  : tilt < -.02 ? 'up leans toward -X = OUT of the turn: INVERTED'
    : 'no bank at all');
process.exit(tilt < -.02 ? 1 : 0);

// The unicorn. In Rainbow Surfer it was a body and a head on one pivot,
// because at 300 km/h from behind that is all anyone can see. Here the
// unicorn IS the game - it is the thing being photographed - so it needs
// a skeleton it can actually pose with.
//
// A RIG OF RIGID BOXES, not skinned vertices. Every bone owns a mesh built
// once around its own pivot, and a bone's world matrix is
//   parent * translate(offset) * rotate(angles)
// so posing costs a handful of 4x4 multiplies a frame and no vertex work
// at all. A boxy unicorn loses nothing by having rigid limbs, and skinning
// would cost both bytes and a per-frame rebuild of every vertex.

import { pushBox, createMesh, mul } from './gl.js';

export const RAINBOW = [
  [.79, .32, .31], [.85, .54, .29], [.85, .76, .31], [.49, .71, .42],
  [.35, .61, .69], [.42, .49, .79], [.60, .42, .77],
];

const W = [.93, .91, .88];        // moonlit white
const D = [.82, .80, .78];        // shaded white, for limbs
const HOOF = [.34, .30, .40];
const GOLD = [.91, .77, .41];

// --- the rig -------------------------------------------------------------
// Bone indices are used everywhere (the poser writes angles by index, the
// mane hangs off HEAD), so they are named rather than remembered.
export const ROOT = 0, NECK = 1, HEAD = 2, TAIL = 3;
export const LEGS = [4, 6, 8, 10];         // upper: hindL hindR foreL foreR
// each upper leg's lower segment is the next index

// Offsets are in the PARENT's space. The root sits at the hip, 0.62 above
// the ground when standing square, so pitching the root rears the unicorn
// around its hindquarters - which is exactly what rearing is.
export const BONES = [
  { p: -1, o: [0, 0, 0] },                 // 0 root (hip)
  { p: 0, o: [0, .14, .72] },              // 1 neck  (withers)
  { p: 1, o: [0, .44, .16] },              // 2 head   (poll)
  { p: 0, o: [0, .14, -.20] },             // 3 tail   (dock)
  { p: 0, o: [-.15, -.14, -.02] },         // 4 hind L upper
  { p: 4, o: [0, -.24, 0] },               // 5 hind L lower
  { p: 0, o: [.15, -.14, -.02] },          // 6 hind R upper
  { p: 6, o: [0, -.24, 0] },               // 7 hind R lower
  { p: 0, o: [-.15, -.14, .70] },          // 8 fore L upper
  { p: 8, o: [0, -.24, 0] },               // 9 fore L lower
  { p: 0, o: [.15, -.14, .70] },           // 10 fore R upper
  { p: 10, o: [0, -.24, 0] },              // 11 fore R lower
];

export const NB = BONES.length;

// --- meshes, one per bone ------------------------------------------------
function bodyMesh() {
  const v = [];
  pushBox(v, 0, 0, .30, .46, .40, .90, ...W);        // barrel
  pushBox(v, 0, .02, -.10, .44, .38, .30, ...W);     // rump
  pushBox(v, 0, -.03, .74, .42, .36, .28, ...W);     // chest
  return createMesh(v);
}

function neckMesh() {
  const v = [];
  // Rising and leaning forward: a vertical neck reads as a fencepost.
  pushBox(v, 0, .12, .02, .24, .34, .28, ...W);
  pushBox(v, 0, .34, .12, .21, .30, .25, ...W);
  return createMesh(v);
}

function headMesh() {
  const v = [];
  pushBox(v, 0, .02, .14, .28, .26, .40, ...W);      // skull
  pushBox(v, 0, -.07, .38, .19, .17, .22, ...W);     // muzzle
  pushBox(v, 0, -.14, .46, .17, .06, .12, .74, .62, .66); // nose
  // The horn tapers over three shrinking segments - one box reads as a
  // spike, and the spiral is what makes it a unicorn rather than a horse.
  pushBox(v, 0, .18, .18, .09, .16, .09, ...GOLD);
  pushBox(v, 0, .30, .22, .06, .13, .06, ...GOLD);
  pushBox(v, 0, .39, .25, .035, .10, .035, .97, .88, .60);
  pushBox(v, -.10, .19, -.02, .07, .17, .06, ...W);  // ears
  pushBox(v, .10, .19, -.02, .07, .17, .06, ...W);
  pushBox(v, -.145, .05, .22, .04, .07, .07, .14, .11, .18); // eyes
  pushBox(v, .145, .05, .22, .04, .07, .07, .14, .11, .18);
  return createMesh(v);
}

function tailMesh() {
  const v = [];
  // The dock only; the hair itself is strands (mane.js), like the crest.
  pushBox(v, 0, -.06, -.10, .12, .14, .22, ...W);
  return createMesh(v);
}

function upperLegMesh() {
  const v = [];
  pushBox(v, 0, -.12, 0, .14, .26, .15, ...D);
  return createMesh(v);
}

function lowerLegMesh() {
  const v = [];
  pushBox(v, 0, -.10, 0, .10, .22, .11, ...D);
  pushBox(v, 0, -.22, .01, .12, .07, .14, ...HOOF);
  return createMesh(v);
}

// Built once per round. Legs share two meshes between all four limbs -
// they are the same box, only their matrices differ.
export function buildUnicorn() {
  const up = upperLegMesh(), lo = lowerLegMesh();
  const m = [bodyMesh(), neckMesh(), headMesh(), tailMesh()];
  for (let i = 0; i < 4; i++) m.push(up, lo);
  return m;
}

// --- posing --------------------------------------------------------------
// A pose is 3 angles per bone (pitch about X, yaw about Y, roll about Z)
// plus the root's world placement. Flat arrays, reused every frame.
export function makePose() {
  return {
    a: new Float32Array(NB * 3),
    x: 0, y: .62, z: 0,      // root world position
    yaw: 0,                  // which way it faces
    s: 1,                    // scale
    w: new Array(NB),        // world matrices, filled by solve()
  };
}

// translate(o) * rotX(p) * rotY(y) * rotZ(r), built directly rather than as
// three matrix multiplies - this runs NB times a frame.
function joint(o, rx, ry, rz) {
  const cx = Math.cos(rx), sx = Math.sin(rx);
  const cy = Math.cos(ry), sy = Math.sin(ry);
  const cz = Math.cos(rz), sz = Math.sin(rz);
  return [
    cy * cz, cx * sz + sx * sy * cz, sx * sz - cx * sy * cz, 0,
    -cy * sz, cx * cz - sx * sy * sz, sx * cz + cx * sy * sz, 0,
    sy, -sx * cy, cx * cy, 0,
    o[0], o[1], o[2], 1,
  ];
}

// Compose every bone's world matrix. Parents always precede children in
// BONES, so one forward pass is enough - no recursion, no sorting.
export function solve(P) {
  const c = Math.cos(P.yaw) * P.s, s = Math.sin(P.yaw) * P.s;
  const base = [c, 0, -s, 0, 0, P.s, 0, 0, s, 0, c, 0, P.x, P.y, P.z, 1];
  for (let i = 0; i < NB; i++) {
    const b = BONES[i], a = P.a;
    const local = joint(b.o, a[i * 3], a[i * 3 + 1], a[i * 3 + 2]);
    P.w[i] = mul(b.p < 0 ? base : P.w[b.p], local);
  }
  return P.w;
}

// The point a bone's own origin lands at in the world - what the mane
// hangs from and what the camera aims at.
export const boneAt = (P, i) => [P.w[i][12], P.w[i][13], P.w[i][14]];

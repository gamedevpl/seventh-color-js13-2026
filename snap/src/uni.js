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

import { pushBox, createMesh, updateMesh, mul } from './gl.js';

export const RAINBOW = [
  [.79, .32, .31], [.85, .54, .29], [.85, .76, .31], [.49, .71, .42],
  [.35, .61, .69], [.42, .49, .79], [.60, .42, .77],
];

const W = [.93, .91, .88];        // moonlit white
const D = [.82, .80, .78];        // shaded white, for limbs
const HOOFC = [.34, .30, .40];
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

// --- meshes ---------------------------------------------------------------
// SIX meshes, not twelve: the four legs are the same two boxes drawn through
// four different matrices, so they share their geometry - and, usefully,
// their paint. A player who dyes the hooves dyes all four at once, which is
// what they meant.
const MESH_OF = [0, 1, 2, 3, 4, 5, 4, 5, 4, 5, 4, 5];

// Zones are recorded as vertex RANGES while the meshes are built, so paint
// is a rewrite of a slice of an existing buffer rather than a rebuild. The
// alternative - regenerating meshes on every colour change - allocates a
// fresh GL buffer per stroke and leaks the old one unless it is tracked
// anyway, which is the same bookkeeping for more work.
export const COAT = 0, HORN = 1, HOOF = 2;

export function buildUnicorn() {
  const arrs = [], zones = [[], [], []];
  let cur = null, ci = -1;
  const open = () => { cur = []; ci = arrs.length; arrs.push(cur); };
  const box = (zone, ...a) => {
    const s = cur.length;
    pushBox(cur, ...a);
    if (zone >= 0) zones[zone].push([ci, s, cur.length]);
  };

  open();                                            // 0 body
  box(COAT, 0, 0, .30, .46, .40, .90, ...W);         // barrel
  box(COAT, 0, .02, -.10, .44, .38, .30, ...W);      // rump
  box(COAT, 0, -.03, .74, .42, .36, .28, ...W);      // chest

  open();                                            // 1 neck
  box(COAT, 0, .12, .02, .24, .34, .28, ...W);
  box(COAT, 0, .34, .12, .21, .30, .25, ...W);

  open();                                            // 2 head
  box(COAT, 0, .02, .14, .28, .26, .40, ...W);       // skull
  box(COAT, 0, -.07, .38, .19, .17, .22, ...W);      // muzzle
  box(-1, 0, -.14, .46, .17, .06, .12, .74, .62, .66); // nose stays a nose
  // The horn tapers over three shrinking segments - one box reads as a
  // spike, and the taper is what makes it a unicorn rather than a horse.
  box(HORN, 0, .18, .18, .09, .16, .09, ...GOLD);
  box(HORN, 0, .30, .22, .06, .13, .06, ...GOLD);
  box(HORN, 0, .39, .25, .035, .10, .035, ...GOLD);
  box(COAT, -.10, .19, -.02, .07, .17, .06, ...W);   // ears
  box(COAT, .10, .19, -.02, .07, .17, .06, ...W);
  box(-1, -.145, .05, .22, .04, .07, .07, .14, .11, .18); // eyes
  box(-1, .145, .05, .22, .04, .07, .07, .14, .11, .18);

  open();                                            // 3 tail dock
  box(COAT, 0, -.06, -.10, .12, .14, .22, ...W);

  open();                                            // 4 upper leg
  box(COAT, 0, -.12, 0, .14, .26, .15, ...D);

  open();                                            // 5 lower leg
  box(COAT, 0, -.10, 0, .10, .22, .11, ...D);
  box(HOOF, 0, -.22, .01, .12, .07, .14, ...HOOFC);

  const meshes = arrs.map((v) => createMesh(v, true));
  return { arrs, zones, meshes, parts: MESH_OF.map((i) => meshes[i]), dirty: [] };
}

// Recolour a zone. Only the three colour floats of each vertex in the zone's
// ranges are touched; position and normal are left exactly as built.
export function paint(U, zone, rgb) {
  for (const [mi, a, b] of U.zones[zone]) {
    const v = U.arrs[mi];
    for (let i = a; i < b; i += 10) { v[i + 6] = rgb[0]; v[i + 7] = rgb[1]; v[i + 8] = rgb[2]; }
    U.dirty[mi] = 1;
  }
}

// Re-upload only what changed, once, after any number of strokes.
export function flushPaint(U) {
  for (let i = 0; i < U.arrs.length; i++) {
    if (U.dirty[i]) { updateMesh(U.meshes[i], U.arrs[i]); U.dirty[i] = 0; }
  }
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

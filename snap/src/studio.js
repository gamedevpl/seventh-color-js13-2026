// The studio. A seamless infinity cove - a disc of floor sweeping up into a
// wall through a curve, with no visible join and no edge anywhere, which is
// the backdrop every real photograph of a posing subject is taken against.
//
// The shading is BAKED INTO VERTEX COLOURS rather than lit or shadered. The
// renderer has one program and three materials, and a studio needs exactly
// one thing that program does not do: a soft pool of light falling off
// toward the edges. A dense enough sheet with per-vertex brightness gives
// that for free, costs no uniform, no branch and no second shader, and it
// is resolution-independent - the falloff is computed from world position,
// so it never bands the way a texture would.

import { createMesh, pushBox, LIGHT } from './gl.js';

// The paper. Warm and slightly dusty rather than pure - a saturated
// backdrop takes over the photograph, and the unicorn is the subject.
const PAPER = [.93, .78, .31];

// The cove, as a profile REVOLVED about the vertical axis: a disc of floor,
// a quarter-circle cove, and a wall going up, all the way round.
//
// It began as a flat sweep and that was wrong in a way only the camera
// could show. A flat backdrop always ends somewhere, and swung far enough
// round the lens found the edge and the void beyond it read as a hole torn
// in the corner of the picture. Widening it twice only moved the angle at
// which that happened. A full revolution has no edge to find, and it is a
// real thing rather than a trick - an infinity cove is exactly this shape.
const RF = 16, R = 4, TOP = 26;    // floor radius, cove radius, wall height
const NT = 44, NA = 6, NB = 7, NC = 8;

// Brightness at a point on the paper. One soft pool centred on the subject,
// which on a surface that wraps the whole way round means the light falls
// off in every direction at the same rate - the pool is a pool rather than
// a patch that happens to face the camera.
function shade(x, y, z) {
  // The pool sits higher and falls off more gently upward than sideways. A
  // phone held upright sees far more of the cove's top than a monitor does,
  // and at the first centring the upper third of every portrait photograph
  // came out near black - the vignette was reading as an unlit room rather
  // than as a lit backdrop.
  const dx = x, dy = (y - 3.4) * .78, dz = (z + 2) * .85;
  const d = Math.hypot(dx, dy, dz) / 14;
  const f = 1 / (1 + d * d * 2.2);
  // Bottoming out at 0.5 rather than 0.34: the first cut fell so far that
  // the far corners went olive and the paper read as dirty rather than as
  // lit. A studio cove is an even field with a gentle pool in it, not a
  // spotlight in a dark room.
  return .5 + .5 * f;
}

// The profile as [radius, height, normalRadial, normalY], pointing into the
// room. Floor and wall are the two ends of the same arc - the floor is the
// cove at angle 0 and the wall is it at 90 degrees - so all three pieces
// share one normal rule and the joins cannot be visibly creased.
function profile() {
  const p = [];
  for (let k = 0; k <= NA; k++) p.push([RF * k / NA, 0, 0, 1]);
  for (let k = 1; k <= NB; k++) {
    const a = Math.PI / 2 * k / NB;
    p.push([RF + R * Math.sin(a), R - R * Math.cos(a), -Math.sin(a), Math.cos(a)]);
  }
  for (let k = 1; k <= NC; k++) p.push([RF + R, R + (TOP - R) * k / NC, -1, 0]);
  return p;
}

export function studioMesh() {
  const v = [], p = profile();
  const V = (th, q) => {
    const [r, y, nr, ny] = q, c = Math.cos(th), sn = Math.sin(th);
    const x = r * c, z = r * sn, s = shade(x, y, z);
    v.push(x, y, z, nr * c, ny, nr * sn, PAPER[0] * s, PAPER[1] * s, PAPER[2] * s, 1);
  };
  // Math.PI * 2, not 6.283. The cove is a CLOSED loop, so the last segment's
  // end angle has to be bit-identical to the first one's start; truncating
  // tau leaves the ring 0.0002 rad short, which at this radius is a 4 mm
  // crack running across the floor - faint, dotted, and unmistakable once
  // you have seen it.
  const TAU = Math.PI * 2;
  for (let i = 0; i < NT; i++) {
    const t0 = TAU * i / NT, t1 = TAU * (i + 1) / NT;
    for (let j = 0; j < p.length - 1; j++) {
      const a = p[j], b = p[j + 1];
      V(t0, a); V(t1, a); V(t1, b);
      V(t0, a); V(t1, b); V(t0, b);
    }
  }
  return createMesh(v);
}

// Flatten the world onto the paper from the same direction the shader lights
// it, so the shadow agrees with the shading instead of contradicting it.
// For a directional light the projection is a pure shear: a point drops
// straight down onto the plane, sliding by its own height times the light's
// slope. `h` lifts the plane a hair off the floor - exactly coplanar, the
// shadow z-fights with the paper across its whole area.
const KX = LIGHT[0] / LIGHT[1], KZ = LIGHT[2] / LIGHT[1];
export const shadowMat = (h) => [
  1, 0, 0, 0,
  -KX, 0, -KZ, 0,
  0, 0, 1, 0,
  KX * h, h, KZ * h, 1,
];

// The ambient contact patch, as a unit fan drawn flat on the paper. The cast
// shadow above is a hard-edged silhouette, which is what one key light
// actually produces; this sits under it and darkens the few centimetres
// where the hooves meet the floor, which no directional projection gives
// you. Together they read as a key plus a fill - which is what a studio is.
export function shadowMesh() {
  const v = [], N = 20, C = [.30, .18, .06];
  for (let i = 0; i < N; i++) {
    const a0 = 6.283 * i / N, a1 = 6.283 * (i + 1) / N;
    v.push(0, 0, 0, 0, 1, 0, C[0], C[1], C[2], .55);
    v.push(Math.cos(a0), 0, Math.sin(a0), 0, 1, 0, C[0], C[1], C[2], 0);
    v.push(Math.cos(a1), 0, Math.sin(a1), 0, 1, 0, C[0], C[1], C[2], 0);
  }
  return createMesh(v);
}

// A rig of soft key lights, hanging out of frame above the sweep. They are
// glow cards rather than geometry - the shader has no second light - so
// what they contribute is the bloom above the subject that says "studio"
// rather than any actual illumination.
export function lightsMesh() {
  const v = [];
  for (const [x, c] of [[-7, [1, .86, .62]], [7, [1, .86, .62]], [0, [.86, .92, 1]]]) {
    pushBox(v, x, 11.5, -2.5, 2.6, .5, 1.6, c[0], c[1], c[2], .30);
    pushBox(v, x, 11.5, -2.5, 4.4, 1.6, 3.0, c[0], c[1], c[2], .07);
  }
  return createMesh(v);
}

// The studio. A seamless cyclorama - floor sweeping up into the back wall
// through a curve, with no visible join - which is the backdrop every real
// photograph of a posing subject is taken against.
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

// The sweep, in the z/y plane: floor out to the curve, a quarter circle of
// radius R, then the wall going up. Swept along x, this is the whole set.
const Z0 = 9, ZC = -6, R = 4, TOP = 17, HX = 30;
const NX = 26, NA = 8, NB = 7, NC = 7;

// Brightness at a point on the paper. One soft pool centred behind and a
// little above where the subject stands, plus a fall-off along the floor
// toward the lens - a floor lit as evenly as the wall reads as a cardboard
// box, and the near shading is what gives the sweep its depth.
function shade(x, y, z) {
  // ONE distance from ONE point, weighted only mildly per axis, so the pool
  // is a circle centred on the subject. The previous version divided each
  // axis by a wildly different number (17, 12, 30) and added a separate
  // fall-off along the floor, which made the bright region a broad
  // horizontal band with a darker top - it read as a gradient laid over the
  // picture rather than as a light aimed at the middle of it.
  const dx = x, dy = (y - 2.1) * 1.15, dz = (z + 4.5) * .8;
  const d = Math.hypot(dx, dy, dz) / 13;
  const f = 1 / (1 + d * d * 2.2);
  // Bottoming out at 0.5 rather than 0.34: the first cut fell so far that
  // the far corners went olive and the paper read as dirty rather than as
  // lit. A studio sweep is an even field with a gentle pool in it, not a
  // spotlight in a dark room.
  return .5 + .5 * f;
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

// The profile as [y, z, normalY, normalZ]. Floor and wall are the two ends
// of the same arc - the floor is the curve at angle 0 and the wall is it at
// 90 degrees - so all three pieces share one normal rule and the join can
// never be visibly creased.
function profile() {
  const p = [];
  for (let k = 0; k <= NA; k++) p.push([0, Z0 + (ZC - Z0) * k / NA, 1, 0]);
  for (let k = 1; k <= NB; k++) {
    const a = Math.PI / 2 * k / NB;
    p.push([R - R * Math.cos(a), ZC - R * Math.sin(a), Math.cos(a), Math.sin(a)]);
  }
  for (let k = 1; k <= NC; k++) p.push([R + (TOP - R) * k / NC, ZC - R, 0, 1]);
  return p;
}

export function studioMesh() {
  const v = [], p = profile();
  const V = (x, q) => {
    const [y, z, ny, nz] = q, s = shade(x, y, z);
    v.push(x, y, z, 0, ny, nz, PAPER[0] * s, PAPER[1] * s, PAPER[2] * s, 1);
  };
  for (let i = 0; i < NX; i++) {
    const x0 = -HX + 2 * HX * i / NX, x1 = -HX + 2 * HX * (i + 1) / NX;
    for (let j = 0; j < p.length - 1; j++) {
      const a = p[j], b = p[j + 1];
      V(x0, a); V(x1, a); V(x1, b);
      V(x0, a); V(x1, b); V(x0, b);
    }
  }
  return createMesh(v);
}

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

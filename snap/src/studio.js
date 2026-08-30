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

import { createMesh, pushBox } from './gl.js';

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
  const dx = x / 17, dy = (y - 2.4) / 12, dz = (z + 8) / 30;
  let f = 1 / (1 + (dx * dx + dy * dy + dz * dz) * 1.45);
  f *= 1 - Math.max(0, (z - 1) / 9) * .28;
  // Bottoming out at 0.55 rather than 0.34: the first cut fell so far that
  // the far corners went olive and the paper read as dirty rather than as
  // lit. A studio sweep is meant to be an even field with a gentle pool in
  // it, not a spotlight in a dark room.
  return .55 + .45 * f;
}

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

// The contact shadow, as a unit fan drawn flat on the paper and scaled to
// the subject. Without it the unicorn hangs in front of the backdrop
// instead of standing on it - on a seamless sweep there is no horizon line
// and no texture, so the shadow is the ONLY cue for where the floor is.
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

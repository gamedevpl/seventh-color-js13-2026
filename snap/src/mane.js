// The mane, the forelock and the tail - the only part of the unicorn that
// is not a rigid box, and the part every photograph is actually about.
//
// Each strand is a chain of points solved FOLLOW-THE-LEADER: the root is
// planted on its bone, and every point below it is pulled to exactly one
// rest length from its parent in a single downward pass. That converges in
// one iteration and can never stretch, which matters because the head whips
// hard in a mane toss and a spring solution would either sag or explode.
// Verlet supplies the inertia - the hair lags, overshoots and settles, and
// that lag IS the animation.

import { RAINBOW } from './uni.js';

const L = 8;                 // points per strand, root included
const SEG = .095;            // rest length between them
const GRAV = -9.5;
const DAMP = .93;            // high, because hair keeps its swing

// Roots, in the local space of the bone they are planted on. The crest runs
// down the neck, the forelock sits between the ears in front of the horn,
// and the tail falls from the dock.
// The crest is doubled either side of the centre line: a mane grown from a
// single row of roots is a fin, and reads as one from the front.
const CREST = [
  [-.03, .42, .05], [.03, .42, .05], [-.04, .32, .03], [.04, .32, .03],
  [-.04, .22, .01], [.04, .22, .01], [-.04, .12, -.01], [.04, .12, -.01],
  [0, .02, -.03],
];
const FORE = [[-.05, .16, .08], [.05, .16, .08], [0, .14, .14]];
const TAILR = [[0, .02, -.14], [-.06, -.02, -.15], [.06, -.02, -.15], [0, -.08, -.16], [-.03, -.10, -.14], [.03, -.10, -.14]];

// Which bone each group hangs from, and which way its hair wants to fall.
// A mane with no rest direction collapses into the neck the moment the
// unicorn stands still; this is what gives it a shape to be blown out of.
const GROUPS = [
  { bone: 1, roots: CREST, dir: [0, -.15, -1] },    // neck: crest sweeps back
  { bone: 2, roots: FORE, dir: [0, -.2, 1] },       // head: forelock falls forward
  { bone: 3, roots: TAILR, dir: [0, -.7, -1] },     // dock: tail falls back and down
];

// Two spheres the hair must not sink into: the skull and the neck. Written
// in world space each frame from the bones themselves, so they follow the
// pose rather than approximating it.
const BLOCK = [[2, 0, .04, .16, .26], [1, 0, .24, .06, .24]]; // bone, local xyz, radius

const xf = (m, p) => [
  m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
  m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
  m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
];
// Direction only - no translation, so a rest direction rides the bone's
// rotation without being dragged to its origin.
const xd = (m, p) => [
  m[0] * p[0] + m[4] * p[1] + m[8] * p[2],
  m[1] * p[0] + m[5] * p[1] + m[9] * p[2],
  m[2] * p[0] + m[6] * p[1] + m[10] * p[2],
];

export function makeMane() {
  const strands = [];
  GROUPS.forEach((g, gi) => {
    g.roots.forEach((r, ri) => {
      strands.push({
        g: gi, r,
        // rainbow across the whole head of hair, not per group, so the
        // crest reads as one spectrum rather than three short ones
        c: RAINBOW[strands.length % 7],
        p: Array.from({ length: L }, () => [0, 0, 0]),
        q: Array.from({ length: L }, () => [0, 0, 0]),
        init: 0,
      });
    });
  });
  return { strands, wind: 0 };
}

export function updateMane(M, W, t, dt) {
  M.wind = Math.sin(t * .9) * .5 + Math.sin(t * 2.3) * .25;
  const blocks = BLOCK.map(([b, x, y, z, r]) => [xf(W[b], [x, y, z]), r]);

  for (const s of M.strands) {
    const g = GROUPS[s.g], m = W[g.bone];
    const root = xf(m, s.r);
    const dir = xd(m, g.dir);
    const dl = Math.hypot(...dir) || 1;

    if (!s.init) {                       // drop the strand onto its rest line
      s.init = 1;
      for (let i = 0; i < L; i++) {
        s.p[i] = [root[0] + dir[0] / dl * SEG * i, root[1] + dir[1] / dl * SEG * i, root[2] + dir[2] / dl * SEG * i];
        s.q[i] = [...s.p[i]];
      }
    }
    s.p[0] = root;
    s.q[0] = root;

    for (let i = 1; i < L; i++) {
      const p = s.p[i], q = s.q[i];
      // verlet: the previous position IS the velocity
      let nx = p[0] + (p[0] - q[0]) * DAMP;
      let ny = p[1] + (p[1] - q[1]) * DAMP + GRAV * dt * dt;
      let nz = p[2] + (p[2] - q[2]) * DAMP;
      // A breeze, stronger toward the tips, so the hair drifts when the
      // unicorn is standing perfectly still - which is most of the time.
      const w = M.wind * dt * dt * 9 * (i / L);
      nx += w; nz += w * .6;
      // Stiffness: a pull back toward the strand's rest direction, so it
      // has a shape of its own instead of hanging like wet rope.
      // It TAPERS: firm at the roots, where a mane really is combed into a
      // shape, and free at the tips, which is what falls and flows. A
      // constant stiffness made every strand a straight rigid spike out of
      // the neck - the hair pointed wherever the rest direction pointed and
      // gravity never got a say.
      const tx = s.p[i - 1][0] + dir[0] / dl * SEG;
      const ty = s.p[i - 1][1] + dir[1] / dl * SEG;
      const tz = s.p[i - 1][2] + dir[2] / dl * SEG;
      const k = .30 * Math.max(0, 1 - i / (L - 2));
      nx += (tx - nx) * k; ny += (ty - ny) * k; nz += (tz - nz) * k;
      s.q[i] = [p[0], p[1], p[2]];
      s.p[i] = [nx, ny, nz];
    }
    // follow-the-leader: one pass, exact lengths, no stretch
    for (let i = 1; i < L; i++) {
      const a = s.p[i - 1], b = s.p[i];
      let dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
      const d = Math.hypot(dx, dy, dz) || 1e-4, f = SEG / d;
      b[0] = a[0] + dx * f; b[1] = a[1] + dy * f; b[2] = a[2] + dz * f;
      // and out of the skull
      for (const [c, r] of blocks) {
        dx = b[0] - c[0]; dy = b[1] - c[1]; dz = b[2] - c[2];
        const l = Math.hypot(dx, dy, dz);
        if (l < r && l > 1e-4) {
          const s2 = r / l;
          b[0] = c[0] + dx * s2; b[1] = c[1] + dy * s2; b[2] = c[2] + dz * s2;
        }
      }
      if (b[1] < .02) b[1] = .02;        // never through the floor
    }
  }
}

// Billboarded quads along each strand, tapering to nothing at the tip.
//
// TWO MATERIALS, and the reason is the backdrop. On Rainbow Surfer's night
// sky the mane was purely additive and glowed beautifully; against a lit
// studio sweep additive is nearly a no-op, because adding light to an
// already-bright surface changes almost nothing - the rainbow washed out to
// the colour of the paper. So the core is now SOLID, opaque, coloured
// geometry that holds its hue against anything behind it, and the additive
// pass is demoted to a thin rim that reads as sheen rather than as the hair
// itself.
const CORE = new Float32Array(24 * L * 6 * 10);
const HALO = new Float32Array(24 * L * 6 * 10);
let ci = 0, hi = 0;
const V = (buf, i, x, y, z, c, a) => {
  buf[i++] = x; buf[i++] = y; buf[i++] = z;
  buf[i++] = 0; buf[i++] = 1; buf[i++] = 0;
  buf[i++] = c[0]; buf[i++] = c[1]; buf[i++] = c[2]; buf[i++] = a;
  return i;
};
// One quad as two triangles, into whichever buffer it belongs to.
const Q = (buf, i, a, b, c, d) => {
  i = V(buf, i, ...a); i = V(buf, i, ...b); i = V(buf, i, ...c);
  i = V(buf, i, ...a); i = V(buf, i, ...c); i = V(buf, i, ...d);
  return i;
};

// Fills BOTH buffers in one walk of the strands and returns their two vertex
// counts. The core and the halo are the same ribbon at two widths, so the
// cross product that orients it toward the lens is computed once and used
// twice rather than the whole solve being run per material.
export function maneVerts(M, eye) {
  ci = 0; hi = 0;
  for (const s of M.strands) {
    for (let i = 1; i < L; i++) {
      const a = s.p[i - 1], b = s.p[i];
      // A strand's width is perpendicular to both the strand and the line
      // of sight, so it faces the lens from every angle - a fixed-plane
      // ribbon disappears edge-on, and this game is all about angles.
      const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
      const ex = a[0] - eye[0], ey = a[1] - eye[1], ez = a[2] - eye[2];
      let sx = dy * ez - dz * ey, sy = dz * ex - dx * ez, sz = dx * ey - dy * ex;
      const sl = Math.hypot(sx, sy, sz) || 1;
      sx /= sl; sy /= sl; sz /= sl;
      const t0 = 1 - (i - 1) / L * .55, t1 = 1 - i / L * .55;
      const f0 = 1 - (i - 1) / L * .3, f1 = 1 - i / L * .3;
      const rib = (w, a0, a1) => [
        [a[0] - sx * w * t0, a[1] - sy * w * t0, a[2] - sz * w * t0, s.c, a0],
        [a[0] + sx * w * t0, a[1] + sy * w * t0, a[2] + sz * w * t0, s.c, a0],
        [b[0] + sx * w * t1, b[1] + sy * w * t1, b[2] + sz * w * t1, s.c, a1],
        [b[0] - sx * w * t1, b[1] - sy * w * t1, b[2] - sz * w * t1, s.c, a1],
      ];
      ci = Q(CORE, ci, ...rib(.055, f0, f1));
      hi = Q(HALO, hi, ...rib(.105, .16 * f0, .16 * f1));
    }
  }
  return [ci, hi];
}
export { CORE as MANE_CORE, HALO as MANE_HALO };

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
import { RB, PALETTE } from './deco.js';

const L = 8;                 // points per strand, root included
const SEG = .095;            // rest length between them
const GRAV = -9.5;
const DAMP = .93;            // high, because hair keeps its swing

// Roots, in the local space of the bone they are planted on. The crest runs
// down the neck, the forelock sits between the ears in front of the horn,
// and the tail falls from the dock.
// The crest is doubled either side of the centre line: a mane grown from a
// single row of roots is a fin, and reads as one from the front.
// Four of these sit further out on the neck's sides than the crest line
// does. The mane was two rows a centimetre apart, which reads as a painted
// stripe from the side and as a fin from the front; a third pair of rows
// draped over the shoulder of the neck is what gives it a body.
const CREST = [
  [-.03, .42, .05], [.03, .42, .05], [-.04, .32, .03], [.04, .32, .03],
  [-.04, .22, .01], [.04, .22, .01], [-.04, .12, -.01], [.04, .12, -.01],
  [0, .02, -.03],
  [-.08, .36, .02], [.08, .36, .02], [-.08, .18, 0], [.08, .18, 0],
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

// THE ANIMAL THE HAIR HAS TO STAY OUT OF, as the boxes it is actually made
// of: bone, centre in that bone's space, half sizes.
//
// This started as two spheres - one skull, one neck - with nothing at all
// on the barrel, and measured against the drawn geometry a seventh of every
// strand's points sat more than 3.5 cm inside the animal, the worst of them
// 20 cm in: the crest fell through the withers and the tail hung inside the
// rump. Stringing more spheres along the body got that to 7 cm and stopped
// there, because a sphere inscribed in a box leaves the box's corners
// sticking out of it - and the shoulder is a corner.
//
// So the collider is the box. It matches what the renderer draws, it needs
// no radius tuned by eye, and it is the same shape the probe measures
// against, which is why the probe can be trusted to notice if these numbers
// ever drift away from uni.js.
const HULL = [
  // ONE BOX FOR THE BODY, not three. Barrel, rump and chest as separate
  // hulls oscillated: a point pushed out through the chest's nearest face
  // landed inside the barrel, the next pass pushed it back into the chest,
  // and the shake - a 21 Hz shimmy - caught it mid-argument often enough
  // for the probe to see hair inside the animal in a fifth of its frames.
  // Their union is barely larger than the barrel alone, because the barrel
  // is most of a horse.
  [0, 0, 0, .315, .23, .21, .565],      // barrel, rump and chest together
  [1, 0, .12, .02, .12, .17, .14],      // neck, lower
  [1, 0, .34, .12, .105, .15, .125],    // neck, upper
  [2, 0, .02, .14, .14, .13, .20],      // skull
  [2, 0, -.07, .38, .095, .085, .11],   // muzzle
  [2, 0, .18, .18, .045, .08, .045],    // the base of the horn
  [3, 0, -.06, -.10, .06, .07, .11],    // the dock the tail grows out of
];
// The legs. Left out of the first cut, then measured out again when the
// only strays left were in the muzzle - and measured back IN when the
// shake, which swings the whole body over its feet, turned out to bury the
// tail in a hind leg. Guessing put them in twice; the probe decided it.
const LEGS = [];
for (const b of [4, 6, 8, 10]) {
  LEGS.push([b, 0, -.12, 0, .07, .13, .075], [b + 1, 0, -.10, 0, .05, .11, .055]);
}

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
        i: strands.length,
        c: RAINBOW[strands.length % 7],
        p: Array.from({ length: L }, () => [0, 0, 0]),
        q: Array.from({ length: L }, () => [0, 0, 0]),
        init: 0,
      });
    });
  });
  return { strands, wind: 0 };
}

// Mane and forelock take one choice, the tail another - they are the two
// things a player thinks of as separate, and groups 0 and 1 are both hair
// on the head. A slot of RB means leave it the unicorn's own spectrum.
// `g` and `c` are the wink: one hair group is forced to a colour so the
// bench can flash the part the player just chose. Everything else takes the
// colour it is painted.
export function recolour(M, deco, g, c) {
  for (const s of M.strands) {
    const pick = s.g === 2 ? deco.tail : deco.mane;
    const col = c && (s.g === 2 ? 2 : 1) === g ? c
      : pick === RB ? RAINBOW[s.i % 7] : PALETTE[pick];
    // A LITTLE DARKER, STRAND BY STRAND. Opaque hair in one flat colour is
    // a plastic shell: without the old halo there was nothing left to tell
    // one strand from the next, and a pink mane read as a single moulded
    // piece. A few percent of shade, dealt out so neighbours differ, is
    // enough to see the hair as hair.
    const k = .82 + .18 * ((s.i * 3) % 5) / 4;
    s.c = [col[0] * k, col[1] * k, col[2] * k];
  }
}

export function updateMane(M, W, t, dt) {
  M.wind = Math.sin(t * .9) * .5 + Math.sin(t * 2.3) * .25;
  const hulls = [...HULL, ...LEGS].map(([b, ...h]) => [W[b], h]);

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
    // Follow-the-leader - exact lengths, no stretch - with each point
    // pushed out of the animal immediately after its own length is set.
    //
    // TWICE. A second pass and a set of leg colliders were both tried when
    // the moving poses were still failing, on the theory that this was a
    // convergence problem. It was not: asking the probe WHICH box the
    // strays were in answered it in a minute - every one of them, in every
    // pose, was in the muzzle. The leg colliders went back out again for
    // changing nothing; the second pass earned its keep on exactly one
    // case, the 21 Hz shimmy of a shake, and one visible strand through the
    // shoulder is one too many.
    for (let pass = 0; pass < 2; pass++)
    for (let i = 1; i < L; i++) {
      const a = s.p[i - 1], b = s.p[i];
      let dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
      const d = Math.hypot(dx, dy, dz) || 1e-4, f = SEG / d;
      b[0] = a[0] + dx * f; b[1] = a[1] + dy * f; b[2] = a[2] + dz * f;
      // and out of the animal. A bone matrix is a rotation and a
      // translation, so its inverse is the transposed rotation applied to
      // (point - origin) - no general inverse needed, and none affordable.
      //
      // The hull list is walked TWICE. Merging the body into one box killed
      // the argument between the barrel and the chest, and left the same
      // argument between the body and its neighbours: pushed out of a leg
      // or the neck, a point can land back inside the body, which was
      // checked first and is not revisited. A second walk settles what the
      // first one moved.
      for (let k = 0; k < 2; k++)
      for (const [m, h] of hulls) {
        const px = b[0] - m[12], py = b[1] - m[13], pz = b[2] - m[14];
        let lx = m[0] * px + m[1] * py + m[2] * pz - h[0];
        let ly = m[4] * px + m[5] * py + m[6] * pz - h[1];
        let lz = m[8] * px + m[9] * py + m[10] * pz - h[2];
        const ox = h[3] - Math.abs(lx), oy = h[4] - Math.abs(ly), oz = h[5] - Math.abs(lz);
        if (ox <= 0 || oy <= 0 || oz <= 0) continue;
        // Out through the nearest face, which is the shallowest overlap.
        if (ox < oy && ox < oz) lx = lx < 0 ? -h[3] : h[3];
        else if (oy < oz) ly = ly < 0 ? -h[4] : h[4];
        else lz = lz < 0 ? -h[5] : h[5];
        lx += h[0]; ly += h[1]; lz += h[2];
        b[0] = m[0] * lx + m[4] * ly + m[8] * lz + m[12];
        b[1] = m[1] * lx + m[5] * ly + m[9] * lz + m[13];
        b[2] = m[2] * lx + m[6] * ly + m[10] * lz + m[14];
      }
      if (b[1] < .02) b[1] = .02;        // never through the floor
    }
  }
}

// Billboarded quads along each strand.
//
// ONE MATERIAL. There were two: a solid core and a wide additive halo, the
// halo left over from Rainbow Surfer, where the mane glowed against a night
// sky. Against a lit studio sweep it never glowed - adding light to an
// already-bright surface changes almost nothing - and what it did instead
// was hang a translucent fringe twice the width of the strand around every
// piece of hair, so overlapping strands showed the body through them and
// the whole mane read as tinsel: *"pol przezroczyste jak lancuch
// choinkowy"*, and exactly right.
//
// Hair is opaque. The core is all that is left, wider now that it is not
// sitting inside a haze, and it costs half the geometry it used to.
const CORE = new Float32Array(24 * L * 6 * 10);
let ci = 0;
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

// One walk of the strands, one buffer, and the vertex count back.
export function maneVerts(M, eye) {
  ci = 0;
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
      // Tapering toward the tip, which is what hair does and what keeps a
      // strand from ending in a blunt square.
      const t0 = 1 - (i - 1) / L * .55, t1 = 1 - i / L * .55;
      // Wider than it was under the halo, because the halo used to fill
      // the gaps between strands and its removal left the neck showing
      // through the mane. Still under the segment length, so a quad is
      // taller than it is wide and reads as hair rather than as tiling.
      const w = .064;
      ci = Q(CORE, ci,
        [a[0] - sx * w * t0, a[1] - sy * w * t0, a[2] - sz * w * t0, s.c, 1],
        [a[0] + sx * w * t0, a[1] + sy * w * t0, a[2] + sz * w * t0, s.c, 1],
        [b[0] + sx * w * t1, b[1] + sy * w * t1, b[2] + sz * w * t1, s.c, 1],
        [b[0] - sx * w * t1, b[1] - sy * w * t1, b[2] - sz * w * t1, s.c, 1]);
    }
  }
  return ci;
}
export { CORE as MANE_CORE };

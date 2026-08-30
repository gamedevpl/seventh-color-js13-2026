// Styling: what the player does TO the unicorn before pointing a camera at
// it. Paint on five zones, and glitter.
//
// The colours are deliberately a small fixed palette rather than a colour
// wheel. A wheel is more expressive and much worse here: the brief has to
// be able to ask for something specific and the score has to be able to say
// whether it got it, and both are far easier to make honest against a set
// of named swatches than against a continuum nobody can hit twice.

import { RAINBOW } from './uni.js';

export const PALETTE = [
  [.93, .91, .88],   // 0 snow
  [.96, .55, .70],   // 1 rose
  [.42, .70, .95],   // 2 sky
  [.48, .88, .66],   // 3 mint
  [.96, .80, .34],   // 4 gold
  [.72, .53, .95],   // 5 lilac
  [.98, .55, .38],   // 6 coral
  [.30, .27, .42],   // 7 ink
];
// -1 in a slot means the rainbow, which is the unicorn's own colouring and
// the thing every other choice is measured against.
export const RB = -1;

// How warm a colour is, on -1..1. The brief asks for warmth rather than for
// swatch number three, so this is what a score is computed from - and it is
// a property of the colour itself, so a palette change cannot silently
// break the brief.
export const warmth = (c) => Math.max(-1, Math.min(1, (c[0] - c[2]) * 2.2));

export const swatch = (i) => (i === RB ? RAINBOW[2] : PALETTE[i]);

export function makeDeco() {
  return { mane: RB, tail: RB, coat: 0, horn: 4, hoof: 7, glitter: 0 };
}

// --- glitter --------------------------------------------------------------
// Motes live in BONE-LOCAL space, so they ride the pose for free: a rearing
// unicorn's glitter rears with it, and nothing has to be re-scattered when
// it moves. Scattered once from a fixed seed, so the same unicorn always
// sparkles in the same places and a photograph is reproducible.
const SPOTS = [
  [0, .23, .20, .30, .30],   // bone, half x, half y, half z, z centre
  [0, .23, .20, .30, .60],
  [1, .13, .22, .14, .18],
  [2, .15, .14, .20, .18],
  [3, .08, .08, .10, -.10],
];
const GC = [[1, .97, .9], [1, .88, .55], [.95, .8, 1], [.8, .95, 1]];
export const MAX_GLITTER = 3;
const PER = 45;

export function makeGlitter() {
  const m = [];
  let s = 1337;
  const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let i = 0; i < MAX_GLITTER * PER; i++) {
    const [b, hx, hy, hz, cz] = SPOTS[(rnd() * SPOTS.length) | 0];
    m.push({
      b,
      p: [(rnd() * 2 - 1) * hx, (rnd() * 2 - 1) * hy, cz + (rnd() * 2 - 1) * hz],
      c: GC[(rnd() * GC.length) | 0],
      ph: rnd() * 6.283,
      rate: 5 + rnd() * 7,
      dir: [(rnd() * 2 - 1), rnd() * .8 + .2, (rnd() * 2 - 1)],
      sz: .005 + rnd() * .009,
    });
  }
  return m;
}

const BUF = new Float32Array(MAX_GLITTER * PER * 6 * 10);
let bi = 0;
const V = (x, y, z, c, a) => {
  BUF[bi++] = x; BUF[bi++] = y; BUF[bi++] = z;
  BUF[bi++] = 0; BUF[bi++] = 1; BUF[bi++] = 0;
  BUF[bi++] = c[0]; BUF[bi++] = c[1]; BUF[bi++] = c[2]; BUF[bi++] = a;
};

// `burst` is 0 normally and rises when the unicorn shakes itself out. Rather
// than integrating a particle per mote, the puff is closed form: each mote
// travels along its own direction by an amount that rises and falls, with a
// droop under it. It costs no state, it cannot drift out of sync with the
// pose, and at the speed the shake happens the eye cannot tell the
// difference from real physics.
export function glitterVerts(G, W, eye, level, t, burst) {
  bi = 0;
  const n = Math.min(G.length, (level | 0) * PER);
  const fly = burst > 0 ? Math.sin(Math.min(3.14, burst * 2.2)) : 0;
  for (let i = 0; i < n; i++) {
    const g = G[i], m = W[g.b], p = g.p;
    let x = m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12];
    let y = m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13];
    let z = m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14];
    if (fly > 0) {
      const d = fly * .55;
      x += g.dir[0] * d; y += g.dir[1] * d - fly * fly * .5; z += g.dir[2] * d;
    }
    // A sharp power of a sine sits near zero and spikes briefly, which is
    // what a speck of glitter catching the light actually does. A plain
    // sine would make the whole coat pulse together like a warning lamp.
    // A sharp power of a sine sits near zero and spikes briefly. Raised
    // from 9 to 14, and the quads shrunk by half, because at the first size
    // the specks read as square white patches stuck to the coat rather than
    // as light catching: a sparkle is a POINT that blows out, and the blow
    // out has to come from brightness, not from area.
    const tw = Math.abs(Math.sin(t * g.rate + g.ph)) ** 14;
    const a = tw * (fly > 0 ? 1 : .9);
    if (a < .02) continue;
    // Billboard: any two axes perpendicular to the line of sight will do,
    // and one of them can be lifted straight off world up.
    let dx = x - eye[0], dy = y - eye[1], dz = z - eye[2];
    const dl = Math.hypot(dx, dy, dz) || 1;
    dx /= dl; dy /= dl; dz /= dl;
    let rx = dz, rz = -dx;                       // cross(up, dir), up = (0,1,0)
    const rl = Math.hypot(rx, rz) || 1;
    rx /= rl; rz /= rl;
    const ux = dy * rz * -1, uy = dz * rx - dx * rz, uz = dy * rx;
    const s = g.sz * (1 + tw * 1.2);
    const P4 = [
      [x - rx * s - ux * s, y - uy * s, z - rz * s - uz * s],
      [x + rx * s - ux * s, y - uy * s, z + rz * s - uz * s],
      [x + rx * s + ux * s, y + uy * s, z + rz * s + uz * s],
      [x - rx * s + ux * s, y + uy * s, z - rz * s + uz * s],
    ];
    V(...P4[0], g.c, a); V(...P4[1], g.c, a); V(...P4[2], g.c, a);
    V(...P4[0], g.c, a); V(...P4[2], g.c, a); V(...P4[3], g.c, a);
  }
  return bi;
}
export { BUF as GLITTER_BUF };

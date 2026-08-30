// What makes a photograph good, arithmetically.
//
// Nothing here reads a pixel. Pokemon Snap did not grade pictures by looking
// at them either - it graded the STATE OF THE WORLD at the moment of the
// shutter, projected onto the screen, and every term a photograph is judged
// on is already in this simulation: where the unicorn is in frame, how
// large, which pose it was half way through, whether it was looking down
// the lens, what it was wearing.
//
// Every term is also NAMED, because the result screen has to be able to say
// why. A number alone teaches nothing; "mane toss +200, eye contact +150"
// teaches a player what to point at next time.

import { NB } from './uni.js';
import { GRAZE, IDLE, WALK, TROT, GALLOP, REAR, TOSS, SHAKE, SLEEP, PRANCE, BOW, POSE_NAME } from './pose.js';

// What each pose is worth to a photographer. The showy ones are worth more
// AND are rarer - the same lever pulled twice, deliberately.
export const POSE_WORTH = {
  [SLEEP]: 30, [IDLE]: 40, [GRAZE]: 55, [WALK]: 60, [TROT]: 85, [GALLOP]: 120,
  [PRANCE]: 170, [SHAKE]: 180, [BOW]: 190, [TOSS]: 200, [REAR]: 250,
};

// Bone origins cover the animal; the horn tip and the four hooves are added
// because they are its extremities and a crop that loses them is exactly
// the crop a framing score has to notice.
const EXTRA = [[2, [0, .44, .25]], [5, [0, -.255, 0]], [7, [0, -.255, 0]], [9, [0, -.255, 0]], [11, [0, -.255, 0]]];

function proj(vp, x, y, z) {
  const w = vp[3] * x + vp[7] * y + vp[11] * z + vp[15];
  return [
    (vp[0] * x + vp[4] * y + vp[8] * z + vp[12]) / w,
    (vp[1] * x + vp[5] * y + vp[9] * z + vp[13]) / w,
    w,
  ];
}

// The subject's box in normalised device coordinates, plus how much of it
// made the frame.
export function frameBox(P, vp) {
  let x0 = 9, x1 = -9, y0 = 9, y1 = -9, inside = 0, n = 0;
  const add = (wx, wy, wz) => {
    const [x, y, w] = proj(vp, wx, wy, wz);
    n++;
    if (w <= 0) return;                       // behind the lens
    if (x >= -1 && x <= 1 && y >= -1 && y <= 1) inside++;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  };
  for (let i = 0; i < NB; i++) add(P.w[i][12], P.w[i][13], P.w[i][14]);
  for (const [b, p] of EXTRA) {
    const m = P.w[b];
    add(
      m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
      m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
      m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
    );
  }
  return { x0, x1, y0, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, h: y1 - y0, inFrac: inside / n };
}

const bell = (v, mid, wide) => Math.exp(-(((v - mid) / wide) ** 2));

// How squarely the unicorn is looking down the lens: its head's own forward
// axis against the direction to the camera. This is the shot the whole game
// is really about, so it is worth having its own line on the result.
export function eyeContact(P, eye) {
  const m = P.w[2];
  const fx = m[8], fy = m[9], fz = m[10];
  let dx = eye[0] - m[12], dy = eye[1] - m[13], dz = eye[2] - m[14];
  const l = Math.hypot(dx, dy, dz) || 1;
  return fx * dx / l + fy * dy / l + fz * dz / l;
}

export function scoreShot(P, vp, eye, anim, deco) {
  const b = frameBox(P, vp);
  const parts = [];
  const add = (name, pts) => { if (pts >= 1) parts.push([name, Math.round(pts)]); };

  // Cropping is punished on the SQUARE of what made it in, so losing a
  // quarter of the animal costs far more than a quarter of the marks. A
  // photograph missing its subject's head is not three-quarters of a
  // photograph.
  add('in frame', 200 * b.inFrac ** 2);

  // Height rather than area: a rearing unicorn is tall and narrow and a
  // grazing one is long and low, and judging by area would quietly prefer
  // the poses that happen to be wide.
  add('size', 190 * bell(b.h, 1.15, .55));

  // The rule of thirds, as a bonus rather than a requirement - dead centre
  // is a real choice and should not be scored as a mistake, it just does
  // not earn this.
  if (Math.abs(Math.abs(b.cx) - 1 / 3) < .13 && b.inFrac > .95) add('rule of thirds', 120);

  add(POSE_NAME[anim.mode], POSE_WORTH[anim.mode] || 40);

  const e = eyeContact(P, eye);
  if (e > .55) add('eye contact', 150 * bell(e, 1, .55));

  // Glitter only counts when it is IN THE AIR. Sitting on the coat it is
  // styling; thrown off mid-shake it is the thing that makes the frame.
  if (deco.glitter) {
    const flying = anim.mode === SHAKE ? 1 : .25;
    add(flying > .5 ? 'glitter in the air' : 'sparkle', 110 * (deco.glitter / 3) * flying);
  }

  const total = parts.reduce((a, p) => a + p[1], 0);
  return { total, parts, box: b, pose: anim.mode, eye: e };
}

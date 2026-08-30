// What makes a photograph good, arithmetically.
//
// Nothing here reads a pixel. Pokemon Snap did not grade pictures by looking
// at them either - it graded the STATE OF THE WORLD at the moment of the
// shutter, projected onto the screen, and every term a photograph is judged
// on is already in this simulation: where the unicorn is in frame, how
// large, which pose it was half way through, whether it was looking down
// the lens, what it was wearing.
//
// Every term is also NAMED. The result screen no longer prints the list -
// six itemised invoices taught less than one plain sentence did - but the
// names are what verdict() reasons over, and what the balance probe reads
// when it needs to know which skill a policy is actually being paid for.

import { NB } from './uni.js';
import { GRAZE, IDLE, WALK, TROT, GALLOP, REAR, TOSS, SHAKE, SLEEP, PRANCE, BOW, POSE_NAME } from './pose.js';

// What each pose is worth to a photographer. The showy ones are worth more
// AND are rarer - the same lever pulled twice, deliberately.
// The spread was widened once the probe could see what each skill was
// worth. Composition alone was paying 1.98x and timing 1.01x - waiting for
// the moment earned nothing, so the game was "zoom in properly" with a
// unicorn moving about in it. A photographer's two skills should both be
// worth having.
export const POSE_WORTH = {
  [SLEEP]: 25, [IDLE]: 30, [GRAZE]: 40, [WALK]: 45, [TROT]: 70, [GALLOP]: 110,
  [PRANCE]: 200, [SHAKE]: 220, [BOW]: 230, [TOSS]: 250, [REAR]: 320,
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

// THE FRAME IS A MULTIPLIER, not another line item - see scoreShot. It is
// exported because the viewfinder shows it live while the player aims, and
// a gauge computed from its own copy of this formula would drift away from
// the score it claims to predict the moment either is touched.
export const frameQuality = (b) => b.inFrac ** 2 * bell(b.h, 1.15, .48);

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

// `roll` is the frames already taken this job. Without it the scoring knew
// only the present moment, and six identical photographs were worth six
// times one - measured at 3,707 against 4,324 for playing properly, or 86%
// of the best score for parking the camera and spamming one pose. No editor
// buys the same frame twice.
//
// What a duplicate still earns is the FRAMING, because you did frame it.
// What it stops earning is the moment: the pose, the eye contact, the
// glitter in the air. And the escape is the one the game already has a
// control for - walk round the set and shoot it from somewhere else, and it
// is a different photograph again.
// ONE SENTENCE, NOT A LEDGER.
//
// The result screen listed every term that contributed - framing, size, the
// pose, eye contact, the thirds, the brief - and read as an invoice. What a
// player wants to know, and a nine-year-old especially, is whether the
// picture was any good and what made it so. So each frame gets a thumb and
// the single most useful thing that can be said about it: the fault when
// there is one, the reason when there is not.
//
// Order matters here. The faults are checked first and worst-first, because
// a photograph that is half out of frame is not also "a lovely rear" - the
// crop is the only thing worth mentioning.
export function verdict(s) {
  const b = s.box;
  if (b.inFrac < .9) return [0, 'half out of frame'];
  if (b.h < .62) return [0, 'too far away'];
  if (b.h > 1.95) return [0, 'too close in'];
  if (s.fresh < .7) return [0, 'the same shot again'];
  // NAME THE THING IT IS DOING. "Nothing much happening" was fair as
  // arithmetic and useless as feedback: it was said over a close, well
  // framed photograph of a unicorn that had lain down and gone to sleep,
  // and it read as the game not looking at the picture. Sleep gets its own
  // line because it is the game telling you it is bored, and the fix is a
  // control the player already has - the flash wakes it up.
  if ((POSE_WORTH[s.pose] || 40) < 80) {
    // By the time we are here the crop and the distance have already
    // passed, so the player got the hard half right and should be told so -
    // a bare thumbs-down on a well composed picture reads as the game not
    // having looked at it.
    return [0, s.pose === SLEEP ? 'fast asleep - flash it awake' : 'nice frame - only ' + POSE_NAME[s.pose]];
  }
  if (s.glitAir) return [1, 'glitter everywhere'];
  if (s.eye > .82) return [1, 'looking right at you'];
  return [1, POSE_NAME[s.pose] + '!'];
}

// How many of the frames already on the roll are THIS shot: the same pose
// from within half a radian of the same bearing. Lifted out of scoreShot
// because the viewfinder needs it too - the live verdict has to be able to
// say "the same shot again" before the shutter, not after.
export function repeats(roll, pose, bearing) {
  let seen = 0;
  for (const f of roll) {
    if (f.pose !== pose) continue;
    const d = ((f.bearing - bearing + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    if (Math.abs(d) < .5) seen++;
  }
  return seen;
}
export const bearingOf = (P, eye) => Math.atan2(eye[0] - P.x, eye[2] - P.z);

export function scoreShot(P, vp, eye, anim, deco, roll = []) {
  const b = frameBox(P, vp);
  const bearing = bearingOf(P, eye);
  const seen = repeats(roll, anim.mode, bearing);
  // 0.68, not 0.55. At the steeper rate a policy that waits for good poses
  // from one spot fell BELOW one that shot at random - random shooting is
  // more varied by construction, so the harsher penalty taught "do not
  // bother waiting", which is the opposite of the lesson. Repetition should
  // cost; patience should not.
  const fresh = .68 ** seen;
  const parts = [];
  const add = (name, pts) => { if (pts >= 1) parts.push([name, Math.round(pts)]); };

  // THE FRAME IS A MULTIPLIER, not another line item.
  //
  // It used to be additive - 200 for having the subject on screen at all,
  // then the pose and the eye contact on top - and the balance probe took
  // that apart: a player who never aimed scored 0.69 of one who did, because
  // pointing roughly at the set collected the whole framing term and a rear
  // paid the same whether it filled the frame or sat in the far distance.
  //
  // A distant, badly composed photograph OF a rearing unicorn is not a good
  // photograph of a rearing unicorn. So everything the subject does is worth
  // what the framing is worth, and aiming stops being optional.
  //
  // Cropping counts on the SQUARE of what made the frame: a photograph
  // missing its subject's head is not three-quarters of a photograph.
  // Size is judged on HEIGHT rather than area, or the rule would quietly
  // prefer whichever poses happen to be wide - rewarding a shape when it
  // meant to reward a distance.
  const q = frameQuality(b);

  // Modest, because the frame is ALREADY paid on every other line through
  // the multiplier. A large flat framing award on top of that is composition
  // counted twice, and it was drowning out the timing.
  add('framing', 170 * q);
  add(POSE_NAME[anim.mode] + (seen ? ` again (x${seen + 1})` : ''),
    (POSE_WORTH[anim.mode] || 40) * (.35 + .65 * q) * fresh);

  // The rule of thirds, as a bonus rather than a requirement - dead centre
  // is a real choice and should not be scored as a mistake, it just does
  // not earn this.
  if (Math.abs(Math.abs(b.cx) - 1 / 3) < .13 && b.inFrac > .95) add('rule of thirds', 120 * q);

  const e = eyeContact(P, eye);
  if (e > .55) add('eye contact', 200 * bell(e, 1, .55) * q * fresh);

  // Glitter only counts when it is IN THE AIR. Sitting on the coat it is
  // styling; thrown off mid-shake it is the thing that makes the frame.
  if (deco.glitter) {
    const flying = anim.mode === SHAKE ? 1 : .25;
    add(flying > .5 ? 'glitter in the air' : 'sparkle', 120 * (deco.glitter / 3) * flying * q * fresh);
  }

  const total = parts.reduce((a, p) => a + p[1], 0);
  return { total, parts, box: b, pose: anim.mode, eye: e, q, fresh, bearing, glitAir: deco.glitter > 0 && anim.mode === SHAKE };
}

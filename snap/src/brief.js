// The commission. Without one, a score would have to judge taste - and it
// cannot, so it would end up judging nothing and the styling would be a
// dress-up screen bolted to a photo game. A brief asks for something
// specific, which makes every swatch a decision with an answer.

import { warmth, PALETTE, RB } from './deco.js';
import { POSE_NAME } from './pose.js';
import { SHOWY } from './act.js';

// [title, wanted warmth, wanted glitter]. Authored rather than generated:
// five names a player can recognise beat a hundred they cannot.
const JOBS = [
  ['GOLDEN HOUR', 1, 3],
  ['MOONLIGHT', -1, 1],
  ['SUGAR RUSH', 1, 3],
  ['ICE QUEEN', -1, 0],
  ['WILDFLOWER', 1, 1],
  ['MIDNIGHT GALA', -1, 2],
];

const GLITTER_WORD = ['no glitter', 'a little glitter', 'glitter', 'all the glitter'];

export function makeBrief(seed) {
  const j = JOBS[seed % JOBS.length];
  return { title: j[0], warm: j[1], glit: j[2], pose: SHOWY[(Math.random() * SHOWY.length) | 0] };
}

export const briefText = (b) =>
  `${b.title} - ${b.warm > 0 ? 'warm' : 'cool'} colours, ${GLITTER_WORD[b.glit]}, catch a ${POSE_NAME[b.pose]}`;

// The coat and the mane are what a viewer reads as the look; the horn and
// hooves are trim. Rainbow hair counts as neither warm nor cool, which is
// the honest answer - it is all of it at once.
const look = (deco) => {
  const c = warmth(PALETTE[deco.coat]);
  const m = deco.mane === RB ? 0 : warmth(PALETTE[deco.mane]);
  return c * .6 + m * .4;
};

// What the styling earned. Paid ONCE per job, because the styling is fixed
// for the whole job - awarding it per frame would just scale every score by
// six and make the paint look far more important than the shooting.
export function briefStyle(b, deco) {
  const lines = [];
  const add = (n, p) => { if (p >= 1) lines.push([n, Math.round(p)]); };

  // Matching is graded, not pass/fail: a warm-ish coat under a warm brief
  // should be worth something, or the palette collapses to one right answer
  // per job and there is nothing to choose.
  const w = look(deco) * b.warm;
  add(b.warm > 0 ? 'warm brief' : 'cool brief', 220 * Math.max(0, w));
  add('glitter as asked', 160 * Math.max(0, 1 - Math.abs(deco.glitter - b.glit) / 3));

  return { pts: lines.reduce((a, l) => a + l[1], 0), lines };
}

// Paid PER FRAME, because catching the pose they asked for is the thing the
// job is actually about, and catching it twice is twice the work.
export const POSE_BONUS = 260;

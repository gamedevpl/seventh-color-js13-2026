// The commission. Without one, a score would have to judge taste - and it
// cannot, so it would end up judging nothing and the styling would be a
// dress-up screen bolted to a photo game. A brief asks for something
// specific, which makes every swatch a decision with an answer.

import { warmth, PALETTE, RB } from './deco.js';
import { POSE_NAME, PRANCE, SHAKE, TOSS, BOW, REAR } from './pose.js';

// [title, wanted warmth, wanted glitter]. Authored rather than generated:
// five names a player can recognise beat a hundred they cannot.
const JOBS = [
  ['GOLDEN HOUR', 1, 3],
  ['MOONLIGHT', -1, 1],
  ['SUGAR RUSH', 1, 3],
  ['ICE QUEEN', -1, 0],
  ['WILDFLOWER', 1, 1],
  ['MIDNIGHT GALA', -1, 2],
  ['CANDY FLOSS', 1, 2],
  ['FROST FAIR', -1, 1],
  ['CARNIVAL', 1, 3],
  ['DEEP WATER', -1, 0],
  ['HARVEST', 1, 1],
  ['SILVER SCREEN', -1, 2],
];

// The season gets harder by asking for RARER poses, not by taking film away.
// Film is what the job is scored out of - every frame is summed - so shrinking
// the roll would make a harder job worth fewer points, which is backwards.
// Measured occurrences per thirty seconds of shooting: prance 3.1, shake 1.9,
// toss 1.3, rear 1.1, bow 0.9. The pools walk down that list.
const POSE_POOL = [[PRANCE, SHAKE], [SHAKE, TOSS, BOW], [TOSS, REAR, BOW]];

export const GLIT_WORD = ['no glitter', 'a little glitter', 'glitter', 'lots of glitter'];

// `used` are the titles already commissioned this season, so a three-job run
// does not ask for the same shoot twice.
export function makeBrief(round, used = []) {
  const pool = JOBS.filter((j) => !used.includes(j[0]));
  const j = (pool.length ? pool : JOBS)[(Math.random() * (pool.length || JOBS.length)) | 0];
  const p = POSE_POOL[Math.min(round, POSE_POOL.length - 1)];
  return { title: j[0], warm: j[1], glit: j[2], pose: p[(Math.random() * p.length) | 0] };
}

export const briefText = (b) =>
  `${b.title} - ${b.warm > 0 ? 'warm' : 'cool'} colours, ${GLIT_WORD[b.glit]}, catch a ${POSE_NAME[b.pose]}`;

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
// How well the styling answers the brief's mood, on 0..1. Exported because
// the job card ticks the requirement live while the player paints - a
// checklist that only grades you afterwards teaches nothing while you can
// still act on it.
export const warmMatch = (b, deco) => Math.max(0, look(deco) * b.warm);

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

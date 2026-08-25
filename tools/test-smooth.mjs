// Motion smoothness, measured rather than eyeballed. Two things make a
// coaster feel rough: uneven advance (the rider surging inside a segment
// because the curve is parameterised by t, not arc length) and sharp
// heading changes at nodes. Both are numbers, so both get printed.
import { makeCourse } from '../strands/src/course.js';
import { makeRider, ride, frame } from '../strands/src/track.js';

// Two policies: how a hands-off player actually travels (straightest
// branch, which is what lane 0 selects), and an adversary that deliberately
// takes the sharpest turn available. The first is the number that matters;
// the second bounds the worst case.
const POLICY = process.argv[2] === '--sharp' ? 'sharp' : 'straight';
const g = makeCourse(400);
const r = makeRider(g.start);
const SPEED = 25, DT = 1 / 60;
const straightest = (es) => {
  let best = es[0], bv = -2;
  for (const e of es) {
    const M = e.to.p;
    let ex = M[0] - r.pos[0], ez = M[2] - r.pos[2];
    const l = Math.hypot(ex, ez) || 1;
    const v = r.tan[0] * ex / l + r.tan[2] * ez / l;
    if (v > bv) { bv = v; best = e; }
  }
  return best;
};
const sharpest = (es) => {
  let best = es[0], bv = 2;
  for (const e of es) {
    const M = e.to.p;
    let ex = M[0] - r.pos[0], ez = M[2] - r.pos[2];
    const l = Math.hypot(ex, ez) || 1;
    const v = r.tan[0] * ex / l + r.tan[2] * ez / l;
    if (v < bv) { bv = v; best = e; }
  }
  return best;
};
const pick = POLICY === 'sharp' ? sharpest : straightest;
console.log(`policy: ${POLICY}`);
ride(r, .01, pick);

let prev = [...r.pos], prevT = [...r.tan];
const steps = [], turns = [], rolls = [];
let prevUp = frame(r.a, r.b, r.t)[3];
for (let i = 0; i < 1800; i++) {
  ride(r, SPEED * DT, pick);
  if (!r.b) continue;
  const d = Math.hypot(r.pos[0] - prev[0], r.pos[1] - prev[1], r.pos[2] - prev[2]);
  steps.push(d);
  const dot = Math.max(-1, Math.min(1, r.tan[0] * prevT[0] + r.tan[1] * prevT[1] + r.tan[2] * prevT[2]));
  turns.push(Math.acos(dot) * 180 / Math.PI);
  const up = frame(r.a, r.b, r.t)[3];
  const ud = Math.max(-1, Math.min(1, up[0] * prevUp[0] + up[1] * prevUp[1] + up[2] * prevUp[2]));
  rolls.push(Math.acos(ud) * 180 / Math.PI);
  prev = [...r.pos]; prevT = [...r.tan]; prevUp = up;
}
const stat = (a, name, unit) => {
  const mean = a.reduce((x, y) => x + y, 0) / a.length;
  const sd = Math.sqrt(a.reduce((x, y) => x + (y - mean) ** 2, 0) / a.length);
  const srt = [...a].sort((x, y) => x - y);
  console.log(`${name.padEnd(22)} mean ${mean.toFixed(3)}${unit}  sd ${sd.toFixed(3)}  p99 ${srt[Math.floor(a.length * .99)].toFixed(3)}  max ${srt[srt.length - 1].toFixed(3)}`);
  return { mean, sd, max: srt[srt.length - 1] };
};
console.log(`ideal advance per frame: ${(SPEED * DT).toFixed(3)}u\n`);
const st = stat(steps, 'advance/frame', 'u');
stat(turns, 'heading change/frame', 'deg');
stat(rolls, 'roll change/frame', 'deg');
const cv = st.sd / st.mean;
console.log(`\nadvance coefficient of variation: ${(cv * 100).toFixed(1)}%`);
console.log(cv < .12 ? 'PASS: motion is near-constant speed' : 'FAIL: rider surges within segments');
process.exit(cv < .12 ? 0 : 1);

// What the eye actually feels: the CAMERA path, not the rider's. Replicates
// main.js's camera formula against the real track modules and reports the
// per-frame acceleration of the eye and the angular jerk of the view
// direction. Smooth motion has small, evenly-distributed values here; a
// camera that reads as "jerky" shows up as fat p99/max even when the frame
// rate is perfect and the rider's own motion is constant-speed.
import { makeCourse } from '../strands/src/course.js';
import { makeRider, ride, behind, ahead, frame } from '../strands/src/track.js';

const g = makeCourse(400);
const r = makeRider(g.start);
const DT = 1 / 60, SPEED = 25;
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
ride(r, .01, straightest);

const HIGH = 2.35, BACK = 2.4, maxStep = DT * 9;
let camT = null, camU = null;
const ease = (cur, want) => {
  if (!cur) return [...want];
  const d = Math.max(-1, Math.min(1, cur[0] * want[0] + cur[1] * want[1] + cur[2] * want[2]));
  const ang = Math.acos(d);
  if (!(ang > maxStep)) return [...want];
  const f = maxStep / ang;
  const v = [cur[0] + (want[0] - cur[0]) * f, cur[1] + (want[1] - cur[1]) * f, cur[2] + (want[2] - cur[2]) * f];
  const l = Math.hypot(...v) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

const eyes = [], dirs = [];
for (let i = 0; i < 2000; i++) {
  ride(r, SPEED * DT, straightest);
  if (!r.b) continue;
  const fr = frame(r.a, r.b, r.t);
  camT = ease(camT, fr[1]); camU = ease(camU, fr[3]);
  const bf = behind(r, BACK) || fr;
  const eye = [bf[0][0] + camU[0] * HIGH, bf[0][1] + camU[1] * HIGH, bf[0][2] + camU[2] * HIGH];
  const af = ahead(r, 9) || fr;
  const at = [af[0][0] + af[3][0] * 1.7, af[0][1] + af[3][1] * 1.7, af[0][2] + af[3][2] * 1.7];
  let dx = at[0] - eye[0], dy = at[1] - eye[1], dz = at[2] - eye[2];
  const dl = Math.hypot(dx, dy, dz) || 1;
  eyes.push(eye); dirs.push([dx / dl, dy / dl, dz / dl]);
}

const accel = [], jerk = [];
for (let i = 2; i < eyes.length; i++) {
  const a = eyes[i - 2], b = eyes[i - 1], c = eyes[i];
  accel.push(Math.hypot(c[0] - 2 * b[0] + a[0], c[1] - 2 * b[1] + a[1], c[2] - 2 * b[2] + a[2]));
}
for (let i = 1; i < dirs.length; i++) {
  const d = Math.max(-1, Math.min(1, dirs[i][0] * dirs[i - 1][0] + dirs[i][1] * dirs[i - 1][1] + dirs[i][2] * dirs[i - 1][2]));
  jerk.push(Math.acos(d) * 180 / Math.PI);
}
const stat = (a, name, unit) => {
  const s = [...a].sort((x, y) => x - y);
  const mean = a.reduce((x, y) => x + y, 0) / a.length;
  console.log(`${name.padEnd(24)} mean ${mean.toFixed(4)}${unit}  p90 ${s[Math.floor(a.length * .9)].toFixed(4)}  p99 ${s[Math.floor(a.length * .99)].toFixed(4)}  max ${s[s.length - 1].toFixed(4)}`);
  return s;
};
const A = stat(accel, 'eye accel/frame^2', 'u');
const J = stat(jerk, 'view dir change/frame', 'deg');
const bigA = accel.filter((x) => x > .05).length, bigJ = jerk.filter((x) => x > 6).length;
console.log(`\nframes with eye accel > 0.05u: ${bigA} (${(bigA / accel.length * 100).toFixed(1)}%)`);
console.log(`frames with view swing > 6 deg: ${bigJ} (${(bigJ / jerk.length * 100).toFixed(1)}%)`);

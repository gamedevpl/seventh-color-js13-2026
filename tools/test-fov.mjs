// Does the image breathe? Gravity along the track makes real speed rise and
// fall with every crest, so anything wired to instantaneous speed - field of
// view, boom length, blur - pulses with the terrain. This rides a real net
// at full throttle and reports the peak-to-peak wobble of the FOV both ways.
import { genGraph } from '../strands/src/maze.js';
import { makeRider, ride } from '../strands/src/track.js';

const g = genGraph(8);
const r = makeRider(g, [7, 7]);
const DT = 1 / 60;
const straightest = (c) => {
  let best = c[0], bv = -2;
  for (const m of c) {
    const M = g.pos[m[0]][m[1]];
    let ex = M[0] - r.pos[0], ez = M[2] - r.pos[2];
    const l = Math.hypot(ex, ez) || 1;
    const v = r.tan[0] * ex / l + r.tan[2] * ez / l;
    if (v > bv) { bv = v; best = m; }
  }
  return best;
};
ride(g, r, .01, straightest);

let speed = 10, sm = 0;
const raw = [], smooth = [];
for (let i = 0; i < 2400; i++) {
  const top = 22;
  speed += (top - speed) * Math.min(1, DT * 1.2);
  speed -= r.tan[1] * DT * 16;
  speed = Math.max(6, Math.min(top, speed));
  ride(g, r, speed * DT, straightest);
  const n = (speed - 6) / 32;
  sm += (n - sm) * Math.min(1, DT * 1.5);
  if (i > 240) { raw.push(1.03 + n * .32); smooth.push(1.03 + sm * .3); }
}
const swing = (a) => {
  let mx = 0;
  for (let i = 30; i < a.length; i++) {
    const w = a.slice(i - 30, i);           // half-second window
    mx = Math.max(mx, Math.max(...w) - Math.min(...w));
  }
  return mx * 180 / Math.PI;
};
const rate = (a) => {
  let mx = 0;
  for (let i = 1; i < a.length; i++) mx = Math.max(mx, Math.abs(a[i] - a[i - 1]));
  return mx * 180 / Math.PI / DT;
};
console.log(`FOV wired to instantaneous speed: ${swing(raw).toFixed(2)} deg swing per half second, peak ${rate(raw).toFixed(1)} deg/s`);
console.log(`FOV wired to smoothed speed:      ${swing(smooth).toFixed(2)} deg swing per half second, peak ${rate(smooth).toFixed(1)} deg/s`);

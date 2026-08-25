// The rainbow: the thing you chase, and later the thing you surf. It rides
// the same rails as the player and flees forward down the course.
//
// It used to read as jumping point by point, because it was: the trail took
// a sample every 1.3 units and drew straight quads between them, so the head
// popped forward a whole sample at a time and the body was visibly a
// polygon. Now the newest point IS the rainbow's exact position, updated
// every frame so the head glides, older points are fixed, and the whole
// spine is resampled through a Catmull-Rom pass before any geometry is
// built - the ribbon is a curve, not a chain of sticks.

import { makeRider, ride, frame } from './track.js';
import { RAINBOW } from './uni.js';

const d3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const STEP = 1, MAXP = 48, SUB = 2;   // ~48 units of ribbon, 95 smoothed samples

export function makeBraid(course) {
  return { r: makeRider(course.start), trail: [], burst: 0 };
}

export function updateBraid(br, playerPos, dt, depth, surfing, playerSpeed) {
  const pd = d3(br.r.pos, playerPos);
  br.burst = Math.max(0, br.burst - dt);
  // Chasing, it rubber-bands. Surfing, it runs at YOUR pace and a shade
  // faster - so holding the ride means holding the throttle, which is the
  // whole fantasy. Coast and it walks away from you.
  let sp = surfing ? Math.max(21, playerSpeed * 1.02)
    : pd < 14 ? 22 : pd > 55 ? 11 : 16;
  if (br.burst > 0) sp = 44;
  ride(br.r, sp * dt, (es) => {
    // Forward-only course, so fleeing is just "take the longer road" - and
    // never a gap, because a rainbow that vanishes over a jump is a rainbow
    // you cannot follow.
    let best = es[0], bv = -1;
    for (const e of es) {
      const v = (depth.get(e.to) || 0) + (e.gap ? -40 : 0);
      if (v > bv) { bv = v; best = e; }
    }
    return best;
  });
  const tr = br.trail;
  const f = br.r.b ? frame(br.r.a, br.r.b, br.r.t) : null;
  const pt = [...br.r.pos];
  pt.s = f ? f[2] : [1, 0, 0];
  pt.u = f ? f[3] : [0, 1, 0];
  // The head always sits exactly where the rainbow is; a new point is only
  // committed once the head has pulled a full step clear of the last one.
  if (tr.length < 2) tr.push(pt);
  else {
    tr[tr.length - 1] = pt;
    if (d3(pt, tr[tr.length - 2]) > STEP) tr.push(pt);
  }
  if (tr.length > MAXP) tr.shift();
}

// --- geometry -------------------------------------------------------------
// One preallocated buffer, refilled in place: this mesh is rebuilt every
// frame and fresh arrays here are pure garbage-collector pressure.
const BUF = new Float32Array(90000);
let bi = 0;
const V = (x, y, z, c, a) => {
  BUF[bi] = x; BUF[bi + 1] = y; BUF[bi + 2] = z;
  BUF[bi + 3] = 0; BUF[bi + 4] = 1; BUF[bi + 5] = 0;
  BUF[bi + 6] = c[0]; BUF[bi + 7] = c[1]; BUF[bi + 8] = c[2]; BUF[bi + 9] = a;
  bi += 10;
};
const WHITE = [.86, .84, 1];

// Catmull-Rom through four control points.
const cr = (p0, p1, p2, p3, t, i) => {
  const t2 = t * t, t3 = t2 * t;
  return .5 * (2 * p1[i] + (p2[i] - p0[i]) * t
    + (2 * p0[i] - 5 * p1[i] + 4 * p2[i] - p3[i]) * t2
    + (3 * p1[i] - p0[i] - 3 * p2[i] + p3[i]) * t3);
};

const SP = [], SS = [], SU = [];

export function braidVerts(br, t) {
  bi = 0;
  const tr = br.trail, n = tr.length;
  if (n < 3) return 0;

  // Resample the spine: SUB points per trail segment, smoothed. This is
  // what turns a chain of sticks into a ribbon.
  let m = 0;
  for (let i = 0; i < n - 1; i++) {
    const p0 = tr[Math.max(0, i - 1)], p1 = tr[i], p2 = tr[i + 1], p3 = tr[Math.min(n - 1, i + 2)];
    for (let k = 0; k < SUB; k++) {
      const u = k / SUB;
      SP[m] = [cr(p0, p1, p2, p3, u, 0), cr(p0, p1, p2, p3, u, 1), cr(p0, p1, p2, p3, u, 2)];
      const s0 = p1.s, s1 = p2.s, u0 = p1.u, u1 = p2.u;
      let sx = s0[0] + (s1[0] - s0[0]) * u, sy = s0[1] + (s1[1] - s0[1]) * u, sz = s0[2] + (s1[2] - s0[2]) * u;
      let l = Math.hypot(sx, sy, sz) || 1;
      SS[m] = [sx / l, sy / l, sz / l];
      let ax = u0[0] + (u1[0] - u0[0]) * u, ay = u0[1] + (u1[1] - u0[1]) * u, az = u0[2] + (u1[2] - u0[2]) * u;
      l = Math.hypot(ax, ay, az) || 1;
      SU[m] = [ax / l, ay / l, az / l];
      m++;
    }
  }
  SP[m] = tr[n - 1]; SS[m] = tr[n - 1].s; SU[m] = tr[n - 1].u; m++;

  const off = (i, ws, wu) => [
    SP[i][0] + SS[i][0] * ws + SU[i][0] * wu,
    SP[i][1] + SS[i][1] * ws + SU[i][1] * wu,
    SP[i][2] + SS[i][2] * ws + SU[i][2] * wu,
  ];
  const fade = (i) => .3 + .7 * (i / (m - 1));
  const Q = (a, b, c, d) => { V(...a); V(...b); V(...c); V(...a); V(...c); V(...d); };

  // haze: a bright core sheet and a wide soft one, both alpha-zero at the
  // outer edge - a hard-edged quad reads as a rectangle however faint it is
  for (const [w, al, dy, mono] of [[1.1, .26, .55, 0], [3.2, .12, .5, 1]]) {
    for (let i = 1; i < m; i++) {
      const c0 = mono ? WHITE : RAINBOW[i % 7], c1 = mono ? WHITE : RAINBOW[(i + 1) % 7];
      const a0 = al * fade(i - 1), a1 = al * fade(i);
      for (const e of [-1, 1]) Q(
        [...off(i - 1, 0, dy), c0, a0], [...off(i, 0, dy), c1, a1],
        [...off(i, w * e, dy), c1, 0], [...off(i - 1, w * e, dy), c0, 0]);
    }
  }

  // the seven strands, orbiting a shared axis so they plait over and under
  for (let s = 0; s < 7; s++) {
    const c = RAINBOW[s], w = .17;
    const orb = (k, extra) => {
      const ph = s * (Math.PI * 2 / 7) + k * .42 - t * 3;
      return off(k, Math.cos(ph) * .42 + extra, .55 + Math.sin(ph) * .42);
    };
    for (let i = 1; i < m; i++) {
      Q([...orb(i - 1, -w), c, fade(i - 1)], [...orb(i - 1, w), c, fade(i - 1)],
        [...orb(i, w), c, fade(i)], [...orb(i, -w), c, fade(i)]);
    }
  }

  // motes: sparks shed off the braid, drifting and winking, so the thing
  // reads as made of light rather than painted
  for (let i = 2; i < m; i += 2) {
    const ph = i * 1.7 + t * 2.3;
    const r = .8 + Math.sin(ph * 1.7) * .7;
    const a = (.28 + Math.sin(ph * 3.1) * .22) * fade(i);
    if (a <= 0) continue;
    const c = RAINBOW[(i * 3) % 7];
    const q = off(i, Math.cos(ph) * r, .55 + Math.sin(ph * .9) * r);
    const sz = .13 + Math.sin(ph * 2.3) * .05;
    Q([q[0] - sz, q[1] - sz, q[2], c, a], [q[0] + sz, q[1] - sz, q[2], c, a],
      [q[0] + sz, q[1] + sz, q[2], c, a], [q[0] - sz, q[1] + sz, q[2], c, a]);
  }

  // the head: crossed fans in the track's own frame, pulsing
  const hs = SS[m - 1], hu = SU[m - 1], hp = br.r.pos;
  const R = 2.8 + Math.sin(t * 6) * .4;
  const hf = (ws, wu) => [hp[0] + hs[0] * ws + hu[0] * wu, hp[1] + hs[1] * ws + hu[1] * wu, hp[2] + hs[2] * ws + hu[2] * wu];
  for (const e of [-1, 1]) {
    Q([...hf(0, .1), WHITE, .85], [...hf(R * e, .1), WHITE, 0], [...hf(R * e, 2.4), WHITE, 0], [...hf(0, 4.2), WHITE, 0]);
    Q([...hf(0, .1), WHITE, .85], [...hf(R * e * .5, 3), WHITE, 0], [...hf(0, 4.6), WHITE, 0], [...hf(-R * e * .5, 3), WHITE, 0]);
  }
  return bi;
}
export { BUF };

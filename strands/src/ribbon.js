// The rainbow: first the thing you chase, then the thing you ARE. One trail
// machine feeds from whichever entity owns the light - the fleeing braid
// during the chase, the player after the merge - so the ribbon flows from
// one to the other without a seam.
//
// Why it used to stutter, twice over: points were committed by a euclidean
// threshold, so their spacing wobbled with frame time; and the ribbon was
// sampled BY SEGMENT INDEX, so every committed point re-parameterised the
// whole curve - a visible pop, twenty times a second at speed. Now points
// are committed at EXACT arc spacing (the crossing is interpolated inside
// the frame's travel), the head rides the true position every frame, and
// geometry samples the chain at fixed fractions of total arc length, which
// changes continuously. Nothing ever pops.

import { makeRider, ride, frame as tframe } from './track.js';
import { RAINBOW } from './uni.js';

const d3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const STEP = 1.1, MAXP = 44, M = 64;

export function makeTrail() {
  return { pts: [], acc: 0, head: null };
}

// Feed one frame of movement: `dist` is arc distance travelled since the
// last feed. Commits are interpolated to land exactly STEP apart.
export function feedTrail(tl, pos, s, u, dist) {
  const pt = [...pos];
  pt.s = s; pt.u = u;
  if (!tl.head) { tl.head = pt; return; }
  let from = tl.head, a = tl.acc, d = dist;
  while (a + d >= STEP && d > 0) {
    const f = (STEP - a) / d;
    const c = [from[0] + (pt[0] - from[0]) * f, from[1] + (pt[1] - from[1]) * f, from[2] + (pt[2] - from[2]) * f];
    c.s = pt.s; c.u = pt.u;
    tl.pts.push(c);
    if (tl.pts.length > MAXP) tl.pts.shift();
    d -= STEP - a;
    a = 0;
    from = c;
  }
  tl.acc = a + d;
  tl.head = pt;
}

export function nearTrail(tl, p, r) {
  if (tl.head && d3(tl.head, p) < r) return true;
  for (let i = tl.pts.length - 1; i >= 0; i--) if (d3(tl.pts[i], p) < r) return true;
  return false;
}

export function makeBraid(course) {
  return { r: makeRider(course.start), tl: makeTrail(), burst: 0 };
}

export function updateBraid(br, playerPos, dt, depth) {
  const pd = d3(br.r.pos, playerPos);
  br.burst = Math.max(0, br.burst - dt);
  let sp = pd < 14 ? 27 : pd > 55 ? 11 : 16;
  if (br.burst > 0) sp = 44;
  const before = [...br.r.pos];
  ride(br.r, sp * dt, (es) => {
    let best = es[0], bv = -1;
    for (const e of es) {
      const v = (depth.get(e.to) || 0) + (e.gap ? -40 : 0);
      if (v > bv) { bv = v; best = e; }
    }
    return best;
  });
  const f = br.r.b ? tframe(br.r.a, br.r.b, br.r.t) : null;
  feedTrail(br.tl, br.r.pos, f ? f[2] : [1, 0, 0], f ? f[3] : [0, 1, 0], d3(before, br.r.pos));
}

// --- geometry -------------------------------------------------------------
// Fixed sample count M, preallocated buffer, no allocation per frame.
const BUF = new Float32Array(120000);
let bi = 0;
const V = (x, y, z, c, a) => {
  BUF[bi] = x; BUF[bi + 1] = y; BUF[bi + 2] = z;
  BUF[bi + 3] = 0; BUF[bi + 4] = 1; BUF[bi + 5] = 0;
  BUF[bi + 6] = c[0]; BUF[bi + 7] = c[1]; BUF[bi + 8] = c[2]; BUF[bi + 9] = a;
  bi += 10;
};
const WHITE = [.9, .88, 1];
const cr = (p0, p1, p2, p3, t, i) => {
  const t2 = t * t, t3 = t2 * t;
  return .5 * (2 * p1[i] + (p2[i] - p0[i]) * t
    + (2 * p0[i] - 5 * p1[i] + 4 * p2[i] - p3[i]) * t2
    + (3 * p1[i] - p0[i] - 3 * p2[i] + p3[i]) * t3);
};
const SP = [], SS = [], SU = [];

function sampleChain(tl) {
  const P = tl.pts, n = P.length;
  if (n < 3 || !tl.head) return 0;
  const main = (n - 1) * STEP;
  const total = main + tl.acc;
  const get = (i) => (i < 0 ? P[0] : i < n ? P[i] : tl.head);
  for (let j = 0; j < M; j++) {
    const d = total * j / (M - 1);
    let i, t;
    if (d < main) { i = Math.min(n - 2, (d / STEP) | 0); t = d / STEP - i; }
    else { i = n - 1; t = tl.acc > .001 ? (d - main) / tl.acc : 0; }
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
    SP[j] = [cr(p0, p1, p2, p3, t, 0), cr(p0, p1, p2, p3, t, 1), cr(p0, p1, p2, p3, t, 2)];
    for (const [dst, key] of [[SS, 's'], [SU, 'u']]) {
      const a = p1[key], b = p2[key];
      let x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t, z = a[2] + (b[2] - a[2]) * t;
      const l = Math.hypot(x, y, z) || 1;
      dst[j] = [x / l, y / l, z / l];
    }
  }
  return M;
}

// `owned` = the player IS the rainbow now. The camera sits at the head, so
// the head flare and the first dozen units of glow would flood the screen
// white from inside - damp the light to nothing at the head and let it
// swell a few lengths back, where you can actually see it streaming.
export function trailVerts(tl, t, owned) {
  bi = 0;
  const m = sampleChain(tl);
  if (!m) return 0;
  const off = (i, ws, wu) => [
    SP[i][0] + SS[i][0] * ws + SU[i][0] * wu,
    SP[i][1] + SS[i][1] * ws + SU[i][1] * wu,
    SP[i][2] + SS[i][2] * ws + SU[i][2] * wu,
  ];
  // Zero at the very tail, so dropping the oldest point is invisible.
  const damp = (i) => owned ? Math.min(1, (m - 1 - i) / 14) : 1;
  const fade = (i) => Math.pow(i / (m - 1), 1.3) * damp(i);
  const Q = (a, b, c, d) => { V(...a); V(...b); V(...c); V(...a); V(...c); V(...d); };

  // haze sheets: bright rainbow core, wide white wash, broad rainbow bloom -
  // each bright on the spine and alpha-zero at the outer edge
  for (const [w, al, dy, mono] of [[1.5, .3, .55, 0], [4.6, .13, .5, 1], [2.6, .17, .7, 0]]) {
    for (let i = 1; i < m; i++) {
      const c0 = mono ? WHITE : RAINBOW[i % 7], c1 = mono ? WHITE : RAINBOW[(i + 1) % 7];
      const a0 = al * fade(i - 1), a1 = al * fade(i);
      for (const e of [-1, 1]) Q(
        [...off(i - 1, 0, dy), c0, a0], [...off(i, 0, dy), c1, a1],
        [...off(i, w * e, dy), c1, 0], [...off(i - 1, w * e, dy), c0, 0]);
    }
  }
  // upright curtains, so the glow has a body standing in the air
  for (let i = 2; i < m; i += 3) {
    const c = RAINBOW[i % 7], a = .16 * fade(i);
    const h = 2.4 + Math.sin(t * 2.1 + i) * .4;
    for (const e of [-1, 1]) Q(
      [...off(i, 0, .1), c, a], [...off(i, 1.7 * e, .1), c, 0],
      [...off(i, 1.7 * e, h * .7), c, 0], [...off(i, 0, h), c, 0]);
  }
  // the seven strands, plaiting around the shared axis
  for (let s = 0; s < 7; s++) {
    const c = RAINBOW[s], w = .17;
    const orb = (k, extra) => {
      const ph = s * (Math.PI * 2 / 7) + k * .42 - t * 3;
      return off(k, Math.cos(ph) * .45 + extra, .55 + Math.sin(ph) * .45);
    };
    for (let i = 1; i < m; i++) {
      Q([...orb(i - 1, -w), c, fade(i - 1)], [...orb(i - 1, w), c, fade(i - 1)],
        [...orb(i, w), c, fade(i)], [...orb(i, -w), c, fade(i)]);
    }
  }
  // motes shed off the light, drifting and winking
  for (let i = 1; i < m; i++) {
    const ph = i * 1.7 + t * 2.3;
    const a = (.3 + Math.sin(ph * 3.1) * .24) * fade(i);
    if (a <= 0) continue;
    const r = .9 + Math.sin(ph * 1.7) * .8;
    const c = RAINBOW[(i * 3) % 7];
    const q = off(i, Math.cos(ph) * r, .55 + Math.sin(ph * .9) * r);
    const sz = .15 + Math.sin(ph * 2.3) * .06;
    Q([q[0] - sz, q[1] - sz, q[2], c, a], [q[0] + sz, q[1] - sz, q[2], c, a],
      [q[0] + sz, q[1] + sz, q[2], c, a], [q[0] - sz, q[1] + sz, q[2], c, a]);
  }
  // head flare - only while the rainbow is its own creature
  if (owned) return bi;
  const hs = SS[m - 1], hu = SU[m - 1], hp = tl.head;
  const R = 3.2 + Math.sin(t * 6) * .5;
  const hf = (ws, wu) => [hp[0] + hs[0] * ws + hu[0] * wu, hp[1] + hs[1] * ws + hu[1] * wu, hp[2] + hs[2] * ws + hu[2] * wu];
  for (const e of [-1, 1]) {
    Q([...hf(0, .1), WHITE, .9], [...hf(R * e, .1), WHITE, 0], [...hf(R * e, 2.6), WHITE, 0], [...hf(0, 4.6), WHITE, 0]);
    Q([...hf(0, .1), WHITE, .9], [...hf(R * e * .5, 3.2), WHITE, 0], [...hf(0, 5), WHITE, 0], [...hf(-R * e * .5, 3.2), WHITE, 0]);
  }
  return bi;
}
export { BUF };

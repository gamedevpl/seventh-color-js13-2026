// The rollercoaster over the course: hermite curves between nodes, the
// meshes that draw them, and the ONE rail-rider that moves both the player
// and the rainbow. Nothing here knows who is riding.

import { RAINBOW } from './uni.js';

// Tangent at a node, for any edge: the node's OWN stored direction, scaled
// by chord. Because it does not depend on which edge is being drawn, flow
// through a split or a merge is continuous by construction - the sign-flip
// and kink problems the grid version fought simply cannot arise here.
const nodeTan = (n, L) => [n.dir[0] * L, n.dir[1] * L, n.dir[2] * L];

// Position, unit tangent, and |dP/dt|. The third value is what keeps motion
// smooth: a hermite curve is not uniformly parameterised, so stepping t in
// proportion to distance makes the rider surge mid-segment.
export function edgePos(a, b, t) {
  const P0 = a.p, P1 = b.p;
  const L = Math.hypot(P1[0] - P0[0], P1[1] - P0[1], P1[2] - P0[2]) * 1.15;
  const T0 = nodeTan(a, L), T1 = nodeTan(b, L);
  const t2 = t * t, t3 = t2 * t;
  const p = [], tn = [];
  for (let i = 0; i < 3; i++) {
    p.push((2 * t3 - 3 * t2 + 1) * P0[i] + (t3 - 2 * t2 + t) * T0[i]
      + (3 * t2 - 2 * t3) * P1[i] + (t3 - t2) * T1[i]);
    tn.push((6 * t2 - 6 * t) * P0[i] + (3 * t2 - 4 * t + 1) * T0[i]
      + (6 * t - 6 * t2) * P1[i] + (3 * t2 - 2 * t) * T1[i]);
  }
  const l = Math.hypot(...tn) || 1;
  return [p, [tn[0] / l, tn[1] / l, tn[2] / l], l];
}

// Arc-length table, built once per edge entered. Everything wants to ask
// "where am I two units back down the track", and t alone cannot answer it.
const LUT_N = 24;
export function buildLUT(a, b) {
  const ss = [0];
  let prev = edgePos(a, b, 0)[0], acc = 0;
  for (let k = 1; k <= LUT_N; k++) {
    const q = edgePos(a, b, k / LUT_N)[0];
    acc += Math.hypot(q[0] - prev[0], q[1] - prev[1], q[2] - prev[2]);
    ss.push(acc);
    prev = q;
  }
  return ss;
}
export function tAt(ss, s) {
  if (s <= 0) return 0;
  if (s >= ss[LUT_N]) return 1;
  let i = 1;
  while (i < LUT_N && ss[i] < s) i++;
  return (i - 1 + (s - ss[i - 1]) / (ss[i] - ss[i - 1] || 1)) / LUT_N;
}

// --- the rider ------------------------------------------------------------
export function makeRider(node) {
  return { a: node, from: null, b: null, edge: null, t: 0, s: 0, len: 1, lut: null,
    pa: null, pb: null, plut: null, plen: 1, pos: [...node.p], tan: [...node.dir] };
}

export function placeAt(r, node, from) {
  r.pa = r.a; r.pb = r.b; r.plut = r.lut; r.plen = r.len;
  r.a = node; r.from = from; r.b = null; r.edge = null; r.s = 0;
  r.pos = [...node.p]; r.tan = [...node.dir];
}

export function ride(r, dist, choose) {
  let guard = 8;
  while (dist > 0 && guard--) {
    if (!r.b) {
      if (!r.a.next.length) { r.pos = [...r.a.p]; return; }   // end of course
      const e = choose(r.a.next);
      if (!e) return;
      r.edge = e; r.b = e.to;
      r.lut = buildLUT(r.a, r.b);
      r.len = r.lut[LUT_N];
      r.s = 0;
    }
    const remain = r.len - r.s;
    if (dist < remain) { r.s += dist; dist = 0; }
    else {
      dist -= remain;
      r.pa = r.a; r.pb = r.b; r.plut = r.lut; r.plen = r.len;
      r.from = r.a; r.a = r.b; r.b = null; r.edge = null;
    }
  }
  if (r.b) {
    r.t = tAt(r.lut, r.s);
    [r.pos, r.tan] = edgePos(r.a, r.b, r.t);
  } else r.pos = [...r.a.p];
}

// The frame a fixed arc-distance behind the rider, staying on the rails: a
// world-space lerp toward an offset cannot survive a corkscrew, but a point
// that is itself on the track always sits in the channel, correctly banked.
export function behind(r, D) {
  if (!r.b) return null;
  if (r.s >= D) return frame(r.a, r.b, tAt(r.lut, r.s - D));
  if (r.pa && r.pb) return frame(r.pa, r.pb, tAt(r.plut, r.plen - (D - r.s)));
  return frame(r.a, r.b, 0);
}

// ...and ahead, WALKING PAST the node onto whichever branch `choose` picks.
// Clamping at the node froze the aim point for the last stretch of every
// segment and then teleported it - a 152-degree view flip in one frame.
export function ahead(r, D, choose) {
  if (!r.b) return null;
  const s = r.s + D;
  if (s <= r.len) return frame(r.a, r.b, tAt(r.lut, s));
  const nx = r.b.next;
  if (!nx.length) return frame(r.a, r.b, 1);
  const e = (choose ? choose(nx) : nx[0]) || nx[0];
  if (!r.alut || r.ae !== e) { r.alut = buildLUT(r.b, e.to); r.ae = e; }
  return frame(r.b, e.to, tAt(r.alut, Math.min(r.alut[LUT_N], s - r.len)));
}

// --- the moving frame -----------------------------------------------------
const sm = (t) => t * t * (3 - 2 * t);
// Corkscrews are a COURSE decision now (b.twist), not a hash - because they
// carry a speed requirement, and demands must be authored, not accidental.
export const twisted = (a, b) => b.twist;

export function frame(a, b, t) {
  const [p, T] = edgePos(a, b, t);
  const h = Math.max(.05, Math.hypot(T[0], T[2]));
  const s0 = [T[2] / h, 0, -T[0] / h];
  let ux = T[1] * s0[2], uy = T[2] * s0[0] - T[0] * s0[2], uz = -T[1] * s0[0];
  const ul = Math.hypot(ux, uy, uz) || 1;
  ux /= ul; uy /= ul; uz /= ul;
  const e = .05;
  const Ta = edgePos(a, b, Math.max(0, t - e))[1];
  const Tb = edgePos(a, b, Math.min(1, t + e))[1];
  let dh = Math.atan2(Tb[0], Tb[2]) - Math.atan2(Ta[0], Ta[2]);
  dh -= Math.round(dh / (2 * Math.PI)) * 2 * Math.PI;
  // NEGATIVE, because up' = u*cos - s0*sin: a positive phi leans the surface
  // normal AWAY from the turn. Banking outward is the opposite of what a
  // body does in a corner, and it reads as wrong even when you cannot say
  // why. tools/test-bank.mjs pins the direction down.
  let phi = -Math.max(-.5, Math.min(.5, dh * 1.6)) * Math.min(1, 4 * t * (1 - t));
  if (twisted(a, b)) phi += Math.PI * 2 * sm(t);
  const c = Math.cos(phi), si = Math.sin(phi);
  return [p, T,
    [s0[0] * c + ux * si, s0[1] * c + uy * si, s0[2] * c + uz * si],
    [ux * c - s0[0] * si, uy * c - s0[1] * si, uz * c - s0[2] * si]];
}

// --- geometry -------------------------------------------------------------
// A FLAT deck, not a gutter: high lips walled off the view, and the point of
// a net of ribbons in the sky is seeing the rest of it. The deck draws as
// glass - alpha blended, no depth write - so track ahead, below and overhead
// all read through the one you ride.
const PROFILE = [
  [-5, .3], [-4.5, .07], [-3.3, 0], [0, -.02], [3.3, 0], [4.5, .07], [5, .3],
];
const DECK_A = .45;

export function trackMeshes(course) {
  const road = [], rail = [];
  const W = 5, K = 8;
  const quad = (arr, a, b, c, d, nrm, col, al) => {
    for (const q of [a, b, c, a, c, d]) {
      arr.push(q[0], q[1], q[2], nrm[0], nrm[1], nrm[2], col[0], col[1], col[2], al);
    }
  };
  const at = (P, s, u, ws, wu) => [P[0] + s[0] * ws + u[0] * wu, P[1] + s[1] * ws + u[1] * wu, P[2] + s[2] * ws + u[2] * wu];

  for (const a of course.nodes) for (const e of a.next) {
    const b = e.to;
    // A gap draws no deck at all - the hole IS the jump. Landing lights on
    // each lip tell you it is coming and where you are aiming.
    if (e.gap) {
      for (const [nd, s] of [[a, 1], [b, -1]]) {
        const f = frame(a, b, s > 0 ? .06 : .94);
        for (const sd of [-1, 1]) {
          quad(rail,
            at(f[0], f[2], f[3], sd * W, .1), at(f[0], f[2], f[3], sd * W * .55, .1),
            at(f[0], f[2], f[3], sd * W * .55, 1.6), at(f[0], f[2], f[3], sd * W, 1.6),
            [0, 1, 0], [1.4, .9, .3], .3);
        }
      }
      continue;
    }
    // Rails carry the demand: hot warning pink where a minimum speed
    // applies, the rainbow hash everywhere else. Read the track, not a HUD.
    const rc = b.req ? [2.2, .55, .8] : RAINBOW[(a.i * 5 + b.i * 3) % 7].map((v) => v * 1.7);
    const kk = twisted(a, b) ? K * 3 : K;
    let [pp, , ps, pu] = frame(a, b, 0);
    for (let k = 1; k <= kk; k++) {
      const [cp, , cs, cu] = frame(a, b, k / kk);
      for (let j = 0; j < PROFILE.length - 1; j++) {
        const [w0, u0] = PROFILE[j], [w1, u1] = PROFILE[j + 1];
        const lip = Math.abs(w0) > 2.3 ? 2.1 : 1;
        quad(road,
          at(pp, ps, pu, w0, u0), at(pp, ps, pu, w1, u1),
          at(cp, cs, cu, w1, u1), at(cp, cs, cu, w0, u0),
          cu, [.3 * lip, .28 * lip, .46 * lip], lip > 1 ? .85 : DECK_A);
      }
      // Neon edge rails: with the deck a faint sheet these ARE its shape.
      for (const sd of [-1, 1]) {
        quad(rail,
          at(pp, ps, pu, W * sd, .26), at(cp, cs, cu, W * sd, .26),
          at(cp, cs, cu, W * sd, .62), at(pp, ps, pu, W * sd, .62),
          [0, 1, 0], rc, .75);
      }
      if (k % 2) {
        quad(rail,
          at(pp, ps, pu, -.16, -.06), at(pp, ps, pu, .16, -.06),
          at(cp, cs, cu, .16, -.06), at(cp, cs, cu, -.16, -.06),
          cu, [1, .95, .8], .32);
      }
      pp = cp; ps = cs; pu = cu;
    }
  }
  return { road, rail };
}

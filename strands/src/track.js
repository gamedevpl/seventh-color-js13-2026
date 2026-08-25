// The rollercoaster itself: hermite curves over the graph, the meshes that
// render them, and the ONE rail-rider that moves both the player and the
// braid - one machine, two data rows, same discipline as game one's story
// engine. Nothing here knows who is riding it.

import { DIRS } from './maze.js';
import { RAINBOW } from './uni.js';

// Tangent at node `a` for the edge toward `b`: the node's through-axis,
// sign-aligned to this edge, scaled by chord length (standard hermite).
function nodeTan(g, a, b) {
  const A = g.pos[a[0]][a[1]], B = g.pos[b[0]][b[1]];
  const ax = g.axis[a[0]][a[1]];
  const d = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
  const s = Math.sign(ax[0] * d[0] + ax[1] * d[1] + ax[2] * d[2]) || 1;
  const L = Math.hypot(...d);
  return [ax[0] * s * L, ax[1] * s * L, ax[2] * s * L];
}

// Position + unit tangent at parameter t along edge a->b.
export function edgePos(g, a, b, t) {
  const P0 = g.pos[a[0]][a[1]], P1 = g.pos[b[0]][b[1]];
  const T0 = nodeTan(g, a, b), T1 = nodeTan(g, b, a);   // T1 points b->a: minus below
  const t2 = t * t, t3 = t2 * t;
  const p = [], tn = [];
  for (let i = 0; i < 3; i++) {
    p.push((2 * t3 - 3 * t2 + 1) * P0[i] + (t3 - 2 * t2 + t) * T0[i]
      + (3 * t2 - 2 * t3) * P1[i] - (t3 - t2) * T1[i]);
    tn.push((6 * t2 - 6 * t) * P0[i] + (3 * t2 - 4 * t + 1) * T0[i]
      + (6 * t - 6 * t2) * P1[i] - (3 * t2 - 2 * t) * T1[i]);
  }
  const l = Math.hypot(...tn) || 1;
  return [p, [tn[0] / l, tn[1] / l, tn[2] / l]];
}

export function edgeLen(g, a, b) {
  let L = 0, p = edgePos(g, a, b, 0)[0];
  for (let k = 1; k <= 6; k++) {
    const q = edgePos(g, a, b, k / 6)[0];
    L += Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
    p = q;
  }
  return L;
}

export function nbrs(g, x, z) {
  const o = [];
  for (const [dx, dz] of DIRS) if (g.open(x, z, dx, dz)) o.push([x + dx, z + dz]);
  return o;
}

// --- the rider ------------------------------------------------------------
export function makeRider(g, node) {
  return { a: node, from: null, b: null, t: 0, len: 1,
    pos: [...g.pos[node[0]][node[1]]], tan: [0, 0, 1] };
}

// Advance `dist` along the rails. At every node, `choose(candidates)` picks
// the next edge; candidates never include the edge just ridden unless it is
// the only way out (braiding makes that impossible mid-graph anyway).
export function ride(g, r, dist, choose) {
  let guard = 8;
  while (dist > 0 && guard--) {
    if (!r.b) {
      const c = nbrs(g, r.a[0], r.a[1]).filter((m) =>
        !r.from || m[0] !== r.from[0] || m[1] !== r.from[1]);
      r.b = choose(c.length ? c : [r.from]);
      if (!r.b) return;
      r.len = edgeLen(g, r.a, r.b);
      r.t = 0;
    }
    const remain = (1 - r.t) * r.len;
    if (dist < remain) { r.t += dist / r.len; dist = 0; }
    else { dist -= remain; r.from = r.a; r.a = r.b; r.b = null; }
  }
  if (r.b) [r.pos, r.tan] = edgePos(g, r.a, r.b, r.t);
  else r.pos = [...g.pos[r.a[0]][r.a[1]]];
}

// --- geometry -------------------------------------------------------------
const sideOf = (t) => {
  const h = Math.hypot(t[0], t[2]) || 1;
  return [t[2] / h, -t[0] / h];
};

// Solid road + additive neon. Each edge's rails carry ONE rainbow colour
// picked by a hash of its endpoints: the colours are landmarks - "the braid
// went down the green track" is how the player learns the knots.
export function trackMeshes(g) {
  const road = [], rail = [];
  const W = 1.7, K = 8;
  const quad = (arr, a, b, c, d, nrm, col, al) => {
    for (const q of [a, b, c, a, c, d]) {
      arr.push(q[0], q[1], q[2], nrm[0], nrm[1], nrm[2], col[0], col[1], col[2], al);
    }
  };
  for (let x = 0; x < g.n; x++) for (let z = 0; z < g.n; z++) {
    for (const [dx, dz] of [[1, 0], [0, 1]]) {
      if (!g.open(x, z, dx, dz)) continue;
      const a = [x, z], b = [x + dx, z + dz];
      // Neon wants punch: over-drive the palette colour, let additive clamp.
      const rc = RAINBOW[(x * 5 + z * 11 + dx * 3 + dz * 7) % 7].map((v) => v * 1.7);
      let [pp, pt] = edgePos(g, a, b, 0), ps = sideOf(pt);
      for (let k = 1; k <= K; k++) {
        const [cp, ct] = edgePos(g, a, b, k / K), cs = sideOf(ct);
        // normal = tan x side, so slopes shade like slopes
        const nrm = [ct[1] * cs[1], ct[2] * cs[0] - ct[0] * cs[1], -ct[1] * cs[0]];
        quad(road,
          [pp[0] - ps[0] * W, pp[1], pp[2] - ps[1] * W],
          [pp[0] + ps[0] * W, pp[1], pp[2] + ps[1] * W],
          [cp[0] + cs[0] * W, cp[1], cp[2] + cs[1] * W],
          [cp[0] - cs[0] * W, cp[1], cp[2] - cs[1] * W],
          nrm, [.14, .13, .20], 1);
        for (const e of [-1, 1]) {
          quad(rail,
            [pp[0] + ps[0] * W * e, pp[1], pp[2] + ps[1] * W * e],
            [cp[0] + cs[0] * W * e, cp[1], cp[2] + cs[1] * W * e],
            [cp[0] + cs[0] * W * e, cp[1] + .4, cp[2] + cs[1] * W * e],
            [pp[0] + ps[0] * W * e, pp[1] + .4, pp[2] + ps[1] * W * e],
            [0, 1, 0], rc, .6);
        }
        pp = cp; ps = cs;
      }
    }
  }
  // Junction beacons: forks announce themselves across the void as thin
  // gold light columns, so a distant glimpse of the braid comes WITH the
  // question "which of those gates does it flow through?"
  for (let x = 0; x < g.n; x++) for (let z = 0; z < g.n; z++) {
    if (nbrs(g, x, z).length < 3) continue;
    const [px, py, pz] = g.pos[x][z], R = .4, H = 7;
    for (const [ux, uz] of [[1, 0], [0, 1]]) for (const e of [-1, 1]) {
      quad(rail,
        [px, py + .1, pz],
        [px + ux * R * e, py + .1, pz + uz * R * e],
        [px + ux * R * e, py + H, pz + uz * R * e],
        [px, py + H, pz],
        [0, 1, 0], [1.2, 1, .55], .3);
    }
  }
  return { road, rail };
}

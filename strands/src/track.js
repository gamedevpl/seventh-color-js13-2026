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
  const L0 = Math.hypot(...d) || 1;
  const dh = [d[0] / L0, d[1] / L0, d[2] / L0];
  // Blend the node's through-axis toward the chord as the two approach
  // perpendicular. Sign-aligning to the axis alone is unstable exactly
  // there - the dot product crosses zero, the sign flips, and the tangent
  // snaps a full 180 degrees mid-corner. Measured: max heading change per
  // frame was 179.7 degrees before this.
  const k = ax[0] * dh[0] + ax[1] * dh[1] + ax[2] * dh[2];
  const w = Math.min(1, Math.abs(k) / .5), sg = Math.sign(k) || 1;
  const v = [
    ax[0] * sg * w + dh[0] * (1 - w),
    ax[1] * sg * w + dh[1] * (1 - w),
    ax[2] * sg * w + dh[2] * (1 - w),
  ];
  const vl = Math.hypot(...v) || 1;
  // Mild overshoot bows every segment into a serpentine; push it much past
  // this and the curve whips back on itself at the nodes.
  const L = L0 * 1.12 / vl;
  return [v[0] * L, v[1] * L, v[2] * L];
}

// Position, unit tangent, and |dP/dt| at parameter t along edge a->b.
// That third value is what makes motion smooth: a hermite curve is NOT
// uniformly parameterised, so advancing t proportionally to distance makes
// the rider surge in the middle of every segment and crawl at its ends.
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
  return [p, [tn[0] / l, tn[1] / l, tn[2] / l], l];
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
  return { a: node, from: null, b: null, t: 0, len: 1, pa: null, pb: null, plen: 1,
    pos: [...g.pos[node[0]][node[1]]], tan: [0, 0, 1] };
}

// The frame a fixed arc-distance BEHIND the rider, staying on the rails.
// The chase camera lives here: a world-space lerp toward an offset from the
// rider cannot survive a corkscrew (the target orbits a full turn and the
// lag throws the camera clean off the track), but a point that is itself on
// the track always sits in the channel, correctly banked.
export function behind(g, r, D) {
  if (!r.b) return null;
  const spd = edgePos(g, r.a, r.b, r.t)[2] || r.len;
  const on = r.t * spd;
  if (on >= D) return frame(g, r.a, r.b, (on - D) / spd);
  if (r.pa && r.pb) {
    const ps = edgePos(g, r.pa, r.pb, 1)[2] || r.plen;
    const back = Math.max(0, 1 - (D - on) / ps);
    return frame(g, r.pa, r.pb, back);
  }
  return frame(g, r.a, r.b, 0);
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
    // Arc-length step: dt = ds / |dP/dt| at the current t, not ds / len.
    const spd = edgePos(g, r.a, r.b, r.t)[2] || r.len;
    const remain = (1 - r.t) * spd;
    if (dist < remain) { r.t += dist / spd; dist = 0; }
    else {
      dist -= remain;
      r.pa = r.a; r.pb = r.b; r.plen = r.len;   // keep one edge of history
      r.from = r.a; r.a = r.b; r.b = null;
    }
  }
  if (r.b) [r.pos, r.tan] = edgePos(g, r.a, r.b, r.t);
  else r.pos = [...g.pos[r.a[0]][r.a[1]]];
}

// --- the moving frame -----------------------------------------------------
// Everything that stands ON the track - road quads, rails, the rider, the
// camera - shares one frame: position, tangent, side, up. Roll comes from
// two sources: banking (lean into horizontal turns, faded to zero at nodes
// so junction geometry never cracks) and corkscrews - a quarter of edges,
// hashed order-independently from their endpoints, roll a full 360 along
// their length. Node roll is always zero, so every fork is entered upright.
const sm = (t) => t * t * (3 - 2 * t);
export const twisted = (a, b) =>
  ((a[0] + b[0]) * 31 + (a[1] + b[1]) * 17 + Math.abs(a[0] - b[0])) % 4 === 1;

export function frame(g, a, b, t) {
  const [p, T] = edgePos(g, a, b, t);
  const h = Math.max(.05, Math.hypot(T[0], T[2]));
  const s0 = [T[2] / h, 0, -T[0] / h];
  let ux = T[1] * s0[2], uy = T[2] * s0[0] - T[0] * s0[2], uz = -T[1] * s0[0];
  const ul = Math.hypot(ux, uy, uz) || 1;
  ux /= ul; uy /= ul; uz /= ul;
  // banking: horizontal turn rate, clamped, zeroed at both nodes
  const e = .05;
  const Ta = edgePos(g, a, b, Math.max(0, t - e))[1];
  const Tb = edgePos(g, a, b, Math.min(1, t + e))[1];
  let dh = Math.atan2(Tb[0], Tb[2]) - Math.atan2(Ta[0], Ta[2]);
  dh -= Math.round(dh / (2 * Math.PI)) * 2 * Math.PI;
  let phi = Math.max(-.8, Math.min(.8, dh * 2.4)) * Math.min(1, 6 * t * (1 - t));
  if (twisted(a, b)) phi += Math.PI * 2 * sm(t);
  const c = Math.cos(phi), si = Math.sin(phi);
  return [p, T,
    [s0[0] * c + ux * si, s0[1] * c + uy * si, s0[2] * c + uz * si],
    [ux * c - s0[0] * si, uy * c - s0[1] * si, uz * c - s0[2] * si]];
}

// Solid road + additive neon. Each edge's rails carry ONE rainbow colour
// picked by a hash of its endpoints: the colours are landmarks - "the braid
// went down the green track" is how the player learns the knots.
// Wipeout cross-section, not a coaster plank: a crowned centre falling to
// banked lips that curl UP at the edges, so the track reads as a channel
// you are held inside. Profile is (across, up) offsets from the frame -
// one data row per rib, and the builder just walks pairs.
const PROFILE = [
  [-3.4, 1.5], [-3.0, .55], [-2.3, .1], [-1.1, -.04], [0, -.1],
  [1.1, -.04], [2.3, .1], [3.0, .55], [3.4, 1.5],
];

export function trackMeshes(g) {
  const road = [], rail = [];
  const W = 3.4, K = 8;
  const quad = (arr, a, b, c, d, nrm, col, al) => {
    for (const q of [a, b, c, a, c, d]) {
      arr.push(q[0], q[1], q[2], nrm[0], nrm[1], nrm[2], col[0], col[1], col[2], al);
    }
  };
  const at = (P, s, u, ws, wu) => [P[0] + s[0] * ws + u[0] * wu, P[1] + s[1] * ws + u[1] * wu, P[2] + s[2] * ws + u[2] * wu];
  for (let x = 0; x < g.n; x++) for (let z = 0; z < g.n; z++) {
    for (const [dx, dz] of [[1, 0], [0, 1]]) {
      if (!g.open(x, z, dx, dz)) continue;
      const a = [x, z], b = [x + dx, z + dz];
      // Neon wants punch: over-drive the palette colour, let additive clamp.
      const rc = RAINBOW[(x * 5 + z * 11 + dx * 3 + dz * 7) % 7].map((v) => v * 1.7);
      const kk = twisted(a, b) ? K * 3 : K;    // corkscrews need the samples
      let [pp, , ps, pu] = frame(g, a, b, 0);
      for (let k = 1; k <= kk; k++) {
        const [cp, , cs, cu] = frame(g, a, b, k / kk);
        // deck: one strip per profile rib pair, darker toward the lips
        for (let j = 0; j < PROFILE.length - 1; j++) {
          const [w0, u0] = PROFILE[j], [w1, u1] = PROFILE[j + 1];
          // Lips catch more light than the deck - that shading is what
          // makes the channel read as a channel at speed.
          const lip = Math.abs(w0) > 2.2 ? 1.9 : 1;
          quad(road,
            at(pp, ps, pu, w0, u0), at(pp, ps, pu, w1, u1),
            at(cp, cs, cu, w1, u1), at(cp, cs, cu, w0, u0),
            cu, [.26 * lip, .24 * lip, .38 * lip], 1);
        }
        // neon strip along the top of each lip, plus a centre spine line
        for (const e of [-1, 1]) {
          quad(rail,
            at(pp, ps, pu, W * e, 1.5), at(cp, cs, cu, W * e, 1.5),
            at(cp, cs, cu, W * e, 1.9), at(pp, ps, pu, W * e, 1.9),
            [0, 1, 0], rc, .6);
        }
        // dashed centre line: every other sample, so speed has a metronome
        if (k % 2) {
          quad(rail,
            at(pp, ps, pu, -.16, -.06), at(pp, ps, pu, .16, -.06),
            at(cp, cs, cu, .16, -.06), at(cp, cs, cu, -.16, -.06),
            cu, [1, .95, .8], .32);
        }
        pp = cp; ps = cs; pu = cu;
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

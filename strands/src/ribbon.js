// The rainbow braid - the thing being raced. It rides the same rails as the
// player (track.js's one rider), fleeing by argmax of BFS distance at every
// junction, and its ribbon is the trail of where it actually flowed - so it
// swoops through the same dives and climbs the player must read.

import { makeRider, ride } from './track.js';
import { RAINBOW } from './uni.js';

const d3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

export function makeBraid(g, node) {
  return { r: makeRider(g, node), trail: [], burst: 0 };
}

export function updateBraid(g, br, dists, playerPos, dt, canCatch) {
  // Rubber band, coaster scale: its panic speed sits just above the base
  // top speed, so the braid is uncatchable until the collected colours
  // raise the ceiling - the rainbow is the key, not a bigger engine. When
  // grabbed at without the full rainbow it BURSTS away in a panic sprint.
  const pd = d3(br.r.pos, playerPos);
  br.burst = Math.max(0, br.burst - dt);
  let sp = pd < 12 ? (canCatch ? 21 : 26) : pd > 45 ? 10 : 15;
  if (br.burst > 0) sp = 42;
  ride(g, br.r, sp * dt, (c) => {
    let best = c[0], bd = -1;
    for (const m of c) {
      const d = dists[m[0]][m[1]];
      if (d > bd) { bd = d; best = m; }
    }
    return best;
  });
  const last = br.trail[br.trail.length - 1];
  if (!last || d3(br.r.pos, last) > 1.3) {
    br.trail.push([...br.r.pos]);
    if (br.trail.length > 40) br.trail.shift();  // trail[0] = the tail you catch
  }
}

// The braid drags along the TRACK and glows. Additive layers built from the
// same trail, depth-write off so they sum instead of occluding - that
// summing IS the bloom, no post-process buffer required. All heights are
// offsets from the trail point, because the trail now dives and climbs.
export function braidVerts(br, t) {
  const v = [], tr = br.trail, n = tr.length;
  if (n < 2) return v;
  const P = (x, y, z, c, a) => v.push(x, y, z, 0, 1, 0, c[0], c[1], c[2], a);
  const Q = (q) => { for (const k of [0, 1, 2, 0, 2, 3]) P(...q[k]); };

  // Horizontal side vector per trail point, shared by every layer.
  const side = [];
  for (let i = 0; i < n; i++) {
    const a = tr[Math.max(0, i - 1)], p = tr[Math.min(n - 1, i + 1)];
    let nx = p[2] - a[2], nz = a[0] - p[0];
    const l = Math.hypot(nx, nz) || 1;
    side.push([nx / l, nz / l]);
  }
  // The oldest end is dissipating; the head is fresh light.
  const fade = (i) => .34 + .66 * (i / (n - 1));

  // --- smear on the road + sheath at rope height -------------------------
  // Every band is bright on its centreline and alpha-zero at both outer
  // edges - a hard-edged quad reads as a rectangle no matter how faint.
  const WHITE = [.86, .84, 1];
  for (const [w, al, dy, mono] of [[.7, .22, .10, 0], [2.0, .10, .06, 1], [.6, .17, .5, 1]]) {
    for (let i = 1; i < n; i++) {
      const c0 = mono ? WHITE : RAINBOW[(i - 1) % 7], c1 = mono ? WHITE : RAINBOW[i % 7];
      const a0 = al * fade(i - 1), a1 = al * fade(i);
      const [sx0, sz0] = side[i - 1], [sx1, sz1] = side[i];
      const A = tr[i - 1], B = tr[i];
      for (const e of [-1, 1]) Q([
        [A[0], A[1] + dy, A[2], c0, a0],
        [B[0], B[1] + dy, B[2], c1, a1],
        [B[0] + sx1 * w * e, B[1] + dy, B[2] + sz1 * w * e, c1, 0],
        [A[0] + sx0 * w * e, A[1] + dy, A[2] + sz0 * w * e, c0, 0],
      ]);
    }
  }

  // --- the seven cores ----------------------------------------------------
  // Each strand orbits the shared path: seven phases evenly around a circle,
  // advancing along the trail and turning with time - that is what makes
  // them cross over and under each other like a plait.
  for (let s = 0; s < 7; s++) {
    const c = RAINBOW[s], w = .12;
    const off = (k) => {
      const ph = s * (Math.PI * 2 / 7) + k * 1.05 - t * 3;
      return [
        tr[k][0] + side[k][0] * Math.cos(ph) * .3,
        tr[k][1] + .5 + Math.sin(ph) * .3,
        tr[k][2] + side[k][1] * Math.cos(ph) * .3,
      ];
    };
    for (let i = 1; i < n; i++) {
      const A = off(i - 1), B = off(i);
      const [sx0, sz0] = side[i - 1], [sx1, sz1] = side[i];
      Q([
        [A[0] - sx0 * w, A[1], A[2] - sz0 * w, c, fade(i - 1)],
        [A[0] + sx0 * w, A[1], A[2] + sz0 * w, c, fade(i - 1)],
        [B[0] + sx1 * w, B[1], B[2] + sz1 * w, c, fade(i)],
        [B[0] - sx1 * w, B[1], B[2] - sz1 * w, c, fade(i)],
      ]);
    }
  }

  // --- upright haze cards -------------------------------------------------
  for (let i = 0; i < n; i += 2) {
    const c = RAINBOW[i % 7], [sx, sz] = side[i], [x, y, z] = tr[i];
    const w = 1.1, h = 1.5 + Math.sin(t * 2.2 + i) * .3, a = .15 * fade(i);
    for (const e of [-1, 1]) Q([
      [x, y + .05, z, c, a],
      [x + sx * w * e, y + .05, z + sz * w * e, c, 0],
      [x + sx * w * e, y + h * .75, z + sz * w * e, c, 0],
      [x, y + h, z, c, 0],
    ]);
  }

  // --- the head knot ------------------------------------------------------
  // Where the braid entity actually is, the rope ends in the living light
  // being chased - two crossed white fans pulsing with time. This is the
  // glimpse the player steers by across the void.
  const [hx, hy, hz] = br.r.pos, R = 2 + Math.sin(t * 6) * .3;
  for (const [ux, uz] of [[1, 0], [0, 1]]) for (const e of [-1, 1]) Q([
    [hx, hy + .05, hz, WHITE, .7],
    [hx + ux * R * e, hy + .05, hz + uz * R * e, WHITE, 0],
    [hx + ux * R * e, hy + 1.8, hz + uz * R * e, WHITE, 0],
    [hx, hy + 3.5, hz, WHITE, 0],
  ]);
  return v;
}

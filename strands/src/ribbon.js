// The rainbow braid - the thing being chased. An agent that runs the maze
// graph away from the player (argmax of BFS distance at every junction),
// trailing seven woven strands behind it. The braid IS the trail of where
// it has actually run, so it snakes around the corners it took - no faked
// curves.

import { S } from './maze.js';
import { RAINBOW } from './uni.js';

export function makeBraid(cx, cz) {
  return {
    x: (cx + .5) * S, z: (cz + .5) * S,
    cell: [cx, cz], from: [-1, -1], target: null,
    trail: [], speed: 3,
  };
}

function pickNext(m, br, dists) {
  const [x, z] = br.cell;
  let best = null, bestD = -1, backup = null;
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    if (!m.open(x, z, dx, dz)) continue;
    const nx = x + dx, nz = z + dz;
    const cand = [nx, nz];
    if (nx === br.from[0] && nz === br.from[1]) { backup = cand; continue; }
    const d = dists[nx][nz];
    if (d > bestD) { bestD = d; best = cand; }
  }
  // Doubling back only from a dead end - that is what makes cornering it
  // in one possible at all.
  return best || backup;
}

export function updateBraid(m, br, player, dists, dt) {
  if (!br.target) {
    br.target = pickNext(m, br, dists);
    if (!br.target) return;
  }
  const tx = (br.target[0] + .5) * S, tz = (br.target[1] + .5) * S;
  const dx = tx - br.x, dz = tz - br.z;
  const d = Math.hypot(dx, dz);

  // Rubber band: panics when the player closes in but never outruns a
  // committed straight-line chase; dawdles when it has lost them so the
  // chase stays findable. The drama lives in this clamp.
  const pd = Math.hypot(player.x - br.x, player.z - br.z);
  br.speed = pd < 3.2 ? 4.2 : pd > 10 ? 1.7 : 3;

  const step = br.speed * dt;
  if (d <= step) {
    br.x = tx; br.z = tz;
    br.from = br.cell;
    br.cell = br.target;
    br.target = pickNext(m, br, dists);
  } else {
    br.x += dx / d * step;
    br.z += dz / d * step;
  }

  const last = br.trail[br.trail.length - 1];
  if (!last || Math.hypot(br.x - last[0], br.z - last[2]) > .22) {
    br.trail.push([br.x, 0, br.z]);
    if (br.trail.length > 26) br.trail.shift();     // trail[0] = the tail tip you catch
  }
}

// The braid drags along the floor and glows. Three additive layers, all
// built from the same trail, drawn with depth-write off so they sum instead
// of occluding each other - that summing IS the bloom, no post-process
// buffer required (one would cost more than the rest of the game):
//
//   cores  seven thin ribbons hugging the stone, woven by per-strand phase
//          so they braid over and under each other. Where they cross, the
//          adds pile up and blow out white - a plait of light.
//   smear  two wide, faint ground ribbons under the cores. The near one is
//          the spill, the far one the soft outer falloff.
//   cards  upright quads across the path every few points, bright at the
//          floor and alpha-zero at the top, so the glow has a body standing
//          in the air instead of being a decal. Cross-path, because the
//          camera looks down the path - a card along it would be edge-on.
export function braidVerts(br, t) {
  const v = [], tr = br.trail, n = tr.length;
  if (n < 2) return v;
  const P = (x, y, z, c, a) => v.push(x, y, z, 0, 1, 0, c[0], c[1], c[2], a);
  const Q = (q) => { for (const k of [0, 1, 2, 0, 2, 3]) P(...q[k]); };

  // Side vector per trail point, from the neighbours - shared by every layer.
  const side = [];
  for (let i = 0; i < n; i++) {
    const a = tr[Math.max(0, i - 1)], p = tr[Math.min(n - 1, i + 1)];
    let nx = p[2] - a[2], nz = a[0] - p[0];
    const l = Math.hypot(nx, nz) || 1;
    side.push([nx / l, nz / l]);
  }
  // The oldest end is dissipating; the head is fresh light.
  const fade = (i) => .34 + .66 * (i / (n - 1));

  // --- ground smear: the spill the strands cast on the floor -------------
  // Every layer is bright on its centreline and alpha-zero at both outer
  // edges - a hard-edged quad reads as a rectangle no matter how faint it
  // is, and rectangles on the floor is not what a glow looks like.
  const WHITE = [.86, .84, 1];
  // width, alpha, height, white? - three rows, one ribbon builder: a rainbow
  // spill tight under the rope, a wide pale wash for the outer falloff, and
  // a pale sheath floating at rope height so the strands sit inside a haze
  // instead of hanging in clear air.
  for (const [w, al, y, mono] of [[.30, .22, .006, 0], [.85, .10, .003, 1], [.26, .17, .15, 1]]) {
    for (let i = 1; i < n; i++) {
      const c0 = mono ? WHITE : RAINBOW[(i - 1) % 7], c1 = mono ? WHITE : RAINBOW[i % 7];
      const a0 = al * fade(i - 1), a1 = al * fade(i);
      const [sx0, sz0] = side[i - 1], [sx1, sz1] = side[i];
      const A = tr[i - 1], B = tr[i];
      for (const e of [-1, 1]) Q([
        [A[0], y, A[2], c0, a0],
        [B[0], y, B[2], c1, a1],
        [B[0] + sx1 * w * e, y, B[2] + sz1 * w * e, c1, 0],
        [A[0] + sx0 * w * e, y, A[2] + sz0 * w * e, c0, 0],
      ]);
    }
  }

  // --- the seven cores ----------------------------------------------------
  // Each strand orbits the shared path rather than running beside it: seven
  // phases evenly around a circle, advancing along the trail and turning
  // with time. That is what makes them cross over and under each other -
  // sway alone just lays seven parallel ribbons down like a flag.
  for (let s = 0; s < 7; s++) {
    const c = RAINBOW[s], w = .05;
    const off = (k) => {
      const ph = s * (Math.PI * 2 / 7) + k * 1.05 - t * 3;
      return [
        tr[k][0] + side[k][0] * Math.cos(ph) * .11,
        .14 + Math.sin(ph) * .115,
        tr[k][2] + side[k][1] * Math.cos(ph) * .11,
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
    const c = RAINBOW[i % 7], [sx, sz] = side[i], [x, , z] = tr[i];
    const w = .46, h = .60 + Math.sin(t * 2.2 + i) * .12, a = .17 * fade(i);
    for (const e of [-1, 1]) Q([
      [x, .004, z, c, a],
      [x + sx * w * e, .004, z + sz * w * e, c, 0],
      [x + sx * w * e, h * .75, z + sz * w * e, c, 0],
      [x, h, z, c, 0],
    ]);
  }

  // --- the head knot ------------------------------------------------------
  // Where the braid entity actually is, the rope should not just stop - a
  // bright white flare, two crossed fans pulsing with time, marks the living
  // end of the light the player is chasing.
  const hx = br.x, hz = br.z, R = .55 + Math.sin(t * 6) * .08;
  for (const [ux, uz] of [[1, 0], [0, 1]]) for (const e of [-1, 1]) Q([
    [hx, .01, hz, WHITE, .55],
    [hx + ux * R * e, .01, hz + uz * R * e, WHITE, 0],
    [hx + ux * R * e, .5, hz + uz * R * e, WHITE, 0],
    [hx, .95, hz, WHITE, 0],
  ]);
  return v;
}

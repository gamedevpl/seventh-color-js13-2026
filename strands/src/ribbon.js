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
    br.trail.push([br.x, .72, br.z]);
    if (br.trail.length > 26) br.trail.shift();     // trail[0] = the tail tip you catch
  }
}

// Seven strands woven along the trail: shared path, per-strand phase in
// both sway and lift, so they cross each other like a plait rather than
// stacking like a flag.
export function braidVerts(br, t) {
  const v = [], tr = br.trail;
  for (let s = 0; s < 7; s++) {
    const [r, g, b] = RAINBOW[s];
    for (let i = 1; i < tr.length; i++) {
      const a = tr[i - 1], p = tr[i];
      let nx = p[2] - a[2], nz = a[0] - p[0];
      const nl = Math.hypot(nx, nz) || 1;
      nx /= nl; nz /= nl;
      const w = .05;
      const off = (k) => {
        const ph = k * .62 + t * 4 + s * .9;
        const lat = Math.sin(ph) * .14, lift = Math.cos(ph * .7) * .10 + s * .012;
        return [tr[k][0] + nx * lat, tr[k][1] + lift, tr[k][2] + nz * lat];
      };
      const A = off(i - 1), P = off(i);
      const quad = [
        A[0] - nx * w, A[1], A[2] - nz * w, A[0] + nx * w, A[1], A[2] + nz * w,
        P[0] + nx * w, P[1], P[2] + nz * w, P[0] - nx * w, P[1], P[2] - nz * w,
      ];
      for (const k of [0, 1, 2, 0, 2, 3]) {
        v.push(quad[k * 3], quad[k * 3 + 1], quad[k * 3 + 2], 0, 1, 0, r, g, b);
      }
    }
  }
  return v;
}

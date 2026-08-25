// The labyrinth: recursive-backtracker generation, box geometry, circle
// collision, and BFS distances - all against one wall list, so what the
// player collides with is exactly what they see and exactly what the
// braid's flee logic reasons about. One source of truth, three consumers.

import { pushBox } from './gl.js';

export const S = 2;          // cell size in world units
const T = .34;               // wall thickness
const H = 1.5;               // wall height

export function genMaze(n) {
  // right[x][z]: wall between (x,z) and (x+1,z). bot[x][z]: to (x,z+1).
  const right = [], bot = [], seen = [];
  for (let x = 0; x < n; x++) {
    right.push(Array(n).fill(true));
    bot.push(Array(n).fill(true));
    seen.push(Array(n).fill(false));
  }
  const stack = [[0, 0]];
  seen[0][0] = true;
  while (stack.length) {
    const [x, z] = stack[stack.length - 1];
    const opts = [];
    if (x + 1 < n && !seen[x + 1][z]) opts.push([1, 0]);
    if (x > 0 && !seen[x - 1][z]) opts.push([-1, 0]);
    if (z + 1 < n && !seen[x][z + 1]) opts.push([0, 1]);
    if (z > 0 && !seen[x][z - 1]) opts.push([0, -1]);
    if (!opts.length) { stack.pop(); continue; }
    const [dx, dz] = opts[Math.floor(Math.random() * opts.length)];
    if (dx === 1) right[x][z] = false;
    else if (dx === -1) right[x - 1][z] = false;
    else if (dz === 1) bot[x][z] = false;
    else bot[x][z - 1] = false;
    seen[x + dx][z + dz] = true;
    stack.push([x + dx, z + dz]);
  }

  // Wall boxes: geometry AND collision AND nothing else ever re-derives them.
  const walls = [];
  const wall = (cx, cz, hx, hz) => walls.push({ x: cx, z: cz, hx, hz });
  for (let x = 0; x < n; x++) for (let z = 0; z < n; z++) {
    if (right[x][z] && x < n - 1) wall((x + 1) * S, (z + .5) * S, T / 2, S / 2 + T / 2);
    if (bot[x][z] && z < n - 1) wall((x + .5) * S, (z + 1) * S, S / 2 + T / 2, T / 2);
  }
  const L = n * S;
  wall(0, L / 2, T / 2, L / 2 + T / 2);
  wall(L, L / 2, T / 2, L / 2 + T / 2);
  wall(L / 2, 0, L / 2 + T / 2, T / 2);
  wall(L / 2, L, L / 2 + T / 2, T / 2);

  const open = (x, z, dx, dz) => {
    const nx = x + dx, nz = z + dz;
    if (nx < 0 || nz < 0 || nx >= n || nz >= n) return false;
    if (dx === 1) return !right[x][z];
    if (dx === -1) return !right[nx][z];
    if (dz === 1) return !bot[x][z];
    return !bot[x][nz];
  };

  return { n, walls, open };
}

export function mazeMesh(m) {
  const v = [];
  const L = m.n * S;
  // Night ground far past the walls, so a camera peeking over the outer
  // boundary sees dark moor instead of the void.
  pushBox(v, L / 2, -.3, L / 2, L * 5, .1, L * 5, .05, .045, .09);
  // Checkered floor - two mossy greens so motion reads even in a bare hall.
  for (let x = 0; x < m.n; x++) for (let z = 0; z < m.n; z++) {
    const g = (x + z) % 2 ? [.12, .23, .16] : [.10, .19, .14];
    pushBox(v, (x + .5) * S, -.05, (z + .5) * S, S, .1, S, ...g);
  }
  for (const w of m.walls) {
    pushBox(v, w.x, H / 2, w.z, w.hx * 2, H, w.hz * 2, .21, .16, .30);
    // A pale cap line so wall tops read against the fog from above.
    pushBox(v, w.x, H + .02, w.z, w.hx * 2, .06, w.hz * 2, .38, .30, .50);
  }
  // Rainbow gate marks the braid's starting corner - set dressing, no logic.
  return v;
}

// Push a circle of radius r out of every wall box it overlaps.
export function collide(m, x, z, r) {
  for (const w of m.walls) {
    const dx = x - Math.max(w.x - w.hx, Math.min(x, w.x + w.hx));
    const dz = z - Math.max(w.z - w.hz, Math.min(z, w.z + w.hz));
    const d2 = dx * dx + dz * dz;
    if (d2 >= r * r || d2 === 0) continue;
    const d = Math.sqrt(d2), push = (r - d) / d;
    x += dx * push;
    z += dz * push;
  }
  return [x, z];
}

export function bfs(m, sx, sz) {
  const dist = Array.from({ length: m.n }, () => Array(m.n).fill(-1));
  const q = [[sx, sz]];
  dist[sx][sz] = 0;
  for (let i = 0; i < q.length; i++) {
    const [x, z] = q[i];
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (m.open(x, z, dx, dz) && dist[x + dx][z + dz] < 0) {
        dist[x + dx][z + dz] = dist[x][z] + 1;
        q.push([x + dx, z + dz]);
      }
    }
  }
  return dist;
}

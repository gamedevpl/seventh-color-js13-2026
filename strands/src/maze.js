// The labyrinth, lifted into the sky: the same recursive backtracker as
// before, but its cells are now NODES of a rollercoaster network and its
// corridors are track segments. Two post-passes turn the spanning tree into
// a racing circuit: braiding (every dead end gets a second exit - a racer
// at speed can never be forced into a three-point turn) and a few extra
// knocked walls, so routes loop and rejoin and the same junction can be
// entered from three sides. One graph feeds geometry, movement and the
// braid's flee logic alike.

export const S = 22;                          // node spacing in world units
export const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export function genGraph(n) {
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

  const open = (x, z, dx, dz) => {
    const nx = x + dx, nz = z + dz;
    if (nx < 0 || nz < 0 || nx >= n || nz >= n) return false;
    if (dx === 1) return !right[x][z];
    if (dx === -1) return !right[nx][z];
    if (dz === 1) return !bot[x][z];
    return !bot[x][nz];
  };
  const knock = (x, z, dx, dz) => {
    if (dx === 1) right[x][z] = false;
    else if (dx === -1) right[x - 1][z] = false;
    else if (dz === 1) bot[x][z] = false;
    else bot[x][z - 1] = false;
  };
  const closed = (x, z) => DIRS.filter(([dx, dz]) =>
    x + dx >= 0 && z + dz >= 0 && x + dx < n && z + dz < n && !open(x, z, dx, dz));

  // Braiding: no dead end survives. Then extra loops for route ambiguity -
  // the "which fork actually leads there" question IS the game.
  for (let x = 0; x < n; x++) for (let z = 0; z < n; z++) {
    if (DIRS.filter(([dx, dz]) => open(x, z, dx, dz)).length === 1) {
      const c = closed(x, z);
      if (c.length) knock(x, z, ...c[Math.floor(Math.random() * c.length)]);
    }
  }
  for (let i = 0; i < n; i++) {
    const x = Math.floor(Math.random() * n), z = Math.floor(Math.random() * n);
    const c = closed(x, z);
    if (c.length) knock(x, z, ...c[Math.floor(Math.random() * c.length)]);
  }

  // Node positions: jittered grid + a big swooping height field, so every
  // corridor is a climb or a dive and the net reads as a coaster, not a floor.
  // Two octaves: a big slow swell for silhouette across the whole net, plus
  // a gentler second one for local relief. Keep the swell tall (flat is the
  // enemy) but the fine octave and the per-node jitter small - those are
  // what turn a flowing net into a chattering one.
  const p1 = Math.random() * 9, p2 = Math.random() * 9, p3 = Math.random() * 9;
  const pos = [];
  for (let x = 0; x < n; x++) {
    pos.push([]);
    for (let z = 0; z < n; z++) {
      pos[x].push([
        (x + .5) * S + (Math.random() - .5) * S * .12,
        19 * Math.sin(x * .62 + p1) * Math.cos(z * .5 + p2)
        + 5 * Math.sin(x * 1.15 + z * .9 + p3) + (Math.random() - .5) * 1.2,
        (z + .5) * S + (Math.random() - .5) * S * .12,
      ]);
    }
  }

  // Per-node through-axis: the two most opposite neighbours define the flow
  // direction. Hermite tangents sign-align to it per edge, so track flows
  // smoothly THROUGH junctions instead of kinking at them.
  const axis = [];
  for (let x = 0; x < n; x++) {
    axis.push([]);
    for (let z = 0; z < n; z++) {
      const ds = [];
      for (const [dx, dz] of DIRS) if (open(x, z, dx, dz)) {
        const q = pos[x + dx][z + dz], p = pos[x][z];
        const v = [q[0] - p[0], q[1] - p[1], q[2] - p[2]];
        const l = Math.hypot(...v);
        ds.push([v[0] / l, v[1] / l, v[2] / l]);
      }
      let a = ds[0] || [1, 0, 0];
      if (ds.length > 1) {
        let bd = 2;
        for (let i = 0; i < ds.length; i++) for (let j = i + 1; j < ds.length; j++) {
          const d = ds[i][0] * ds[j][0] + ds[i][1] * ds[j][1] + ds[i][2] * ds[j][2];
          if (d < bd) { bd = d; a = [ds[i][0] - ds[j][0], ds[i][1] - ds[j][1], ds[i][2] - ds[j][2]]; }
        }
        const l = Math.hypot(...a) || 1;
        a = [a[0] / l, a[1] / l, a[2] / l];
      }
      axis[x].push(a);
    }
  }

  return { n, open, pos, axis };
}

export function bfs(g, sx, sz) {
  const dist = Array.from({ length: g.n }, () => Array(g.n).fill(-1));
  const q = [[sx, sz]];
  dist[sx][sz] = 0;
  for (let i = 0; i < q.length; i++) {
    const [x, z] = q[i];
    for (const [dx, dz] of DIRS) {
      if (g.open(x, z, dx, dz) && dist[x + dx][z + dz] < 0) {
        dist[x + dx][z + dz] = dist[x][z] + 1;
        q.push([x + dx, z + dz]);
      }
    }
  }
  return dist;
}

// The course: a track that GROWS FORWARD, never loops. The maze had cycles,
// and cycles are why the rainbow could come at you head-on - in a graph with
// loops the quarry's flight path can double back into your face, which
// reads as chaos rather than a chase. Here the course is a chain that
// occasionally splits into two parallel routes and rejoins a few nodes
// later. You can pick a line; you can never go in a circle, and nothing can
// ever come at you the wrong way.
//
// Every node carries its own tangent, which is the other quiet win: hermite
// tangents taken from a stored per-node direction are continuous through
// splits and merges by construction, so the whole class of junction kinks
// the grid version fought with simply cannot occur.

export const S = 26;                    // node spacing in world units

const norm = (v) => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const rnd = (a, b) => a + Math.random() * (b - a);

export function makeCourse(count) {
  const nodes = [];
  const add = (p) => {
    const n = { p, dir: [0, 0, 1], next: [], i: nodes.length };
    nodes.push(n);
    return n;
  };
  let yaw = 0, pitch = 0;
  const step = () => {
    // Wander, but gently, and always lean back toward level - a course that
    // integrates unbounded pitch dives into the floor or climbs out of sight.
    yaw += rnd(-.42, .42);
    pitch = pitch * .82 + rnd(-.20, .20);
    return [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)];
  };

  let cur = add([0, 0, 0]);
  const start = cur;
  let d = [0, 0, 1];
  while (nodes.length < count) {
    // Roughly one stretch in four opens into a two-route split that closes
    // again: a real choice, no cycle. The rest is a single line, and about
    // one edge in nine of it is a GAP you have to jump.
    if (Math.random() < .26 && nodes.length < count - 8) {
      const L = 2 + (Math.random() * 3 | 0);       // nodes per branch
      const spine = [cur.p];
      let dd = d;
      for (let k = 0; k <= L; k++) {
        dd = norm(step());
        spine.push([spine[k][0] + dd[0] * S, spine[k][1] + dd[1] * S, spine[k][2] + dd[2] * S]);
      }
      const merge = add(spine[L + 1]);
      const amp = rnd(9, 16);
      for (const sgn of [1, -1]) {
        // Offset each route sideways by a sine bulge that is zero at both
        // ends, so the two lines part and meet again exactly on the nodes.
        let prev = cur;
        for (let k = 1; k <= L; k++) {
          const a = spine[k], b = spine[k + 1];
          const side = norm([b[2] - a[2], 0, a[0] - b[0]]);
          const o = Math.sin(Math.PI * k / (L + 1)) * amp * sgn;
          const n = add([a[0] + side[0] * o, a[1] + rnd(-2, 2), a[2] + side[2] * o]);
          prev.next.push({ to: n, gap: false });
          prev = n;
        }
        prev.next.push({ to: merge, gap: false });
      }
      cur = merge;
      d = dd;
    } else {
      d = norm(step());
      const n = add([cur.p[0] + d[0] * S, cur.p[1] + d[1] * S, cur.p[2] + d[2] * S]);
      cur.next.push({ to: n, gap: nodes.length > 6 && Math.random() < .11 });
      cur = n;
    }
  }

  // Per-node tangent: the direction that carries flow THROUGH the node.
  // Averaging in and out means a split's two exits share one entry tangent
  // and a merge's two entries share one exit - continuous either way.
  for (const n of nodes) {
    const outs = n.next.map((e) => norm([e.to.p[0] - n.p[0], e.to.p[1] - n.p[1], e.to.p[2] - n.p[2]]));
    const o = outs.length
      ? norm(outs.reduce((a, v) => [a[0] + v[0], a[1] + v[1], a[2] + v[2]], [0, 0, 0]))
      : n.dir;
    n.dir = o;
  }
  for (const n of nodes) {
    for (const e of n.next) {
      const inD = norm([e.to.p[0] - n.p[0], e.to.p[1] - n.p[1], e.to.p[2] - n.p[2]]);
      e.to.dir = norm([e.to.dir[0] + inD[0], e.to.dir[1] + inD[1], e.to.dir[2] + inD[2]]);
    }
  }
  return { nodes, start };
}

// Distance from a node to the end of the course, in nodes - the braid uses
// it to know it is running out of road, and the HUD to show progress.
export function depths(course) {
  const d = new Map();
  for (let i = course.nodes.length - 1; i >= 0; i--) {
    const n = course.nodes[i];
    let best = 0;
    for (const e of n.next) best = Math.max(best, 1 + (d.get(e.to) || 0));
    d.set(n, best);
  }
  return d;
}

// The course: ONE joyful line forward, built from readable sections. Forks
// are gone - the run is not about choosing a road any more, it is about
// EARNING the road: serpentines and corkscrews have a minimum speed you
// must carry through them, gaps need momentum to clear, dives hand you
// speed for free. The course is a rhythm chart for the throttle.
//
// Demands live on the TO-node of each edge (req = minimum speed, twist =
// corkscrew), gaps on the edge itself. One incoming edge per node - the
// chain - is what makes that well-defined.

export const S = 26;

const norm = (v) => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const rnd = (a, b) => a + Math.random() * (b - a);

export function makeCourse(count) {
  const nodes = [];
  const add = (p) => {
    const n = { p, dir: [0, 0, 1], next: [], i: nodes.length, req: 0, twist: false };
    nodes.push(n);
    return n;
  };
  let yaw = 0, pitch = 0;
  let cur = add([0, 0, 0]);
  const start = cur;

  const step = (dyaw, dpitch, len, gap, req, twist) => {
    yaw += dyaw;
    pitch = Math.max(-.6, Math.min(.5, pitch * .86 + dpitch));
    const d = [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)];
    const n = add([cur.p[0] + d[0] * len, cur.p[1] + d[1] * len, cur.p[2] + d[2] * len]);
    n.req = req || 0;
    n.twist = !!twist;
    cur.next.push({ to: n, gap: !!gap });
    cur = n;
  };

  // The first stretch is always gentle - a runway to learn the throttle on.
  for (let i = 0; i < 6; i++) step(rnd(-.14, .14), rnd(-.05, .05), S);

  while (nodes.length < count) {
    const r = Math.random();
    if (r < .26) {                                  // cruise
      const L = 4 + (Math.random() * 4 | 0);
      for (let i = 0; i < L; i++) step(rnd(-.2, .2), rnd(-.07, .07), S);
    } else if (r < .46) {                           // serpentine: carry speed or slide off
      const L = 5 + (Math.random() * 4 | 0);
      let sgn = Math.random() < .5 ? 1 : -1;
      for (let i = 0; i < L; i++) {
        step(sgn * rnd(.38, .55), rnd(-.04, .04), S * .9, false, 20);
        if (i % 2) sgn = -sgn;
      }
    } else if (r < .60) {                           // dive: free speed
      const L = 3 + (Math.random() * 3 | 0);
      for (let i = 0; i < L; i++) step(rnd(-.15, .15), -.16, S);
      step(rnd(-.1, .1), .1, S);
    } else if (r < .66) {                           // climb: it costs you
      const L = 2 + (Math.random() * 2 | 0);
      for (let i = 0; i < L; i++) step(rnd(-.12, .12), .14, S * .9);
    } else if (r < .88) {                           // the gap: jump it
      step(rnd(-.08, .08), .02, S, false, 0);
      step(0, .04, S * .8, true, 0);
      step(0, -.02, S, false, 0);
    } else {                                        // corkscrew: speed or fall
      step(rnd(-.1, .1), 0, S);
      step(rnd(-.12, .12), 0, S * 1.1, false, 23, true);
      step(rnd(-.1, .1), 0, S);
    }
  }

  // Per-node tangent from in+out, so flow through every node is continuous.
  for (const n of nodes) {
    const o = n.next.length ? norm([n.next[0].to.p[0] - n.p[0], n.next[0].to.p[1] - n.p[1], n.next[0].to.p[2] - n.p[2]]) : n.dir;
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

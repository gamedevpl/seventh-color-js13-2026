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

  // The run has a SHAPE. Sections used to be drawn uniformly for the whole
  // two minutes, which makes a course with no memory: the last minute is
  // exactly as hard as the first, so nothing builds and nothing pays off.
  // Now the mix ramps - cruise gives way to demands, corkscrews and gaps
  // arrive more often, and the minimum speeds tighten as you go.
  while (nodes.length < count) {
    const prog = nodes.length / count;                  // 0 at the gate, 1 at the end
    const hard = Math.min(1, prog * 1.25);
    const rq = (base, top) => Math.round(base + (top - base) * hard);
    // weights: cruise, serpentine, dive, climb, gap, corkscrew, sweeper
    const W = [
      .34 - .28 * hard,
      .16 + .07 * hard,
      .13 - .03 * hard,
      .08 - .03 * hard,
      .13 + .06 * hard,
      .02 + .30 * hard,     // the signature move, but EARNED: near-absent at
                            // the gate, everywhere by the end. Seeding it
                            // from the start just moved the difficulty
                            // forward instead of building it.
      .14 + .08 * hard,
    ];
    let r = Math.random() * W.reduce((a, b) => a + b, 0), pick = 0;
    while (pick < W.length - 1 && r > W[pick]) { r -= W[pick]; pick++; }
    if (nodes.length > count - 8) pick = 0;             // land the ending calmly

    if (pick === 0) {                                   // cruise
      const L = 3 + (Math.random() * 4 | 0);
      for (let i = 0; i < L; i++) step(rnd(-.2, .2), rnd(-.07, .07), S);
    } else if (pick === 1) {                            // serpentine
      // Longer than it was (four to seven flicks), because a slalom over in
      // three seconds is a decoration rather than a section, and a shade
      // sharper - the demand does the work, not the geometry.
      const L = 6 + (Math.random() * 5 | 0);
      let sgn = Math.random() < .5 ? 1 : -1;
      const amp = .36 + .24 * hard;
      for (let i = 0; i < L; i++) {
        step(sgn * rnd(amp, amp + .18), rnd(-.04, .04), S * .9, false, rq(19, 26));
        if (i % 2) sgn = -sgn;
      }
    } else if (pick === 2) {                            // dive: free speed
      const L = 3 + (Math.random() * 3 | 0);
      for (let i = 0; i < L; i++) step(rnd(-.15, .15), -.16, S);
      step(rnd(-.1, .1), .1, S);
    } else if (pick === 3) {                            // climb: it costs you
      const L = 2 + (Math.random() * 2 | 0);
      for (let i = 0; i < L; i++) step(rnd(-.12, .12), .14, S * .9);
    } else if (pick === 4) {                            // the gap
      step(rnd(-.08, .08), .02, S);
      step(0, .04, S * .8, true);
      step(0, -.02, S);
    } else if (pick === 5) {                            // corkscrew
      step(rnd(-.1, .1), 0, S);
      step(rnd(-.12, .12), 0, S * 1.1, false, rq(21, 28), true);
      step(rnd(-.1, .1), 0, S);
    } else {                                            // the long sweeper
      // A sustained ARC, held one way for the whole section, so the bank
      // comes on and STAYS on and you lean the length of it. The
      // serpentine's charm is the flick from side to side; a long banked
      // bend is the other thing a coaster does, and the course had none of
      // it - every turn was either a flick or a wiggle inside a cruise.
      // Modest per-node angle, many nodes: seven to eleven of them at ten
      // to sixteen degrees each sweeps up to a third of a circle over 250
      // units of track, on a radius of about a hundred.
      // No speed demand on it, deliberately. Hot pink rails mean ONE thing -
      // a minimum speed - and hanging that on every node of every arc put
      // over half the course in warning colours, which is the same as
      // marking none of it. This section tests the other skill: holding a
      // line against a push that never lets up. It earns its teeth from
      // geometry instead, by TIGHTENING as it goes, so you have to keep
      // committing rather than coast the whole bend on one input.
      const sgn = Math.random() < .5 ? 1 : -1, k = rnd(.16, .24);
      const L = 7 + (Math.random() * 5 | 0);
      let sw = 0;
      for (let i = 0; i < L && sw < 2.4; i++) {
        const kk = k * (1 + i * .06);
        sw += kk;
        step(sgn * kk, rnd(-.06, .04), S);
      }
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

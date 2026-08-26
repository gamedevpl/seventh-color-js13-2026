// Course invariants for the physics run. The course must be one forward
// CHAIN (forks were cut on purpose - the game is earning the road, not
// choosing it), acyclic, fully reachable, and it must actually contain the
// things the game is made of: speed-demand sections, corkscrews and jumps.
// A run of pure cruise is a treadmill, not a rhythm chart.
import { makeCourse } from '../strands/src/course.js';

// A sweeper is measured, not flagged: walk the chain and find the longest
// run of consecutive edges whose heading turns the SAME way. A serpentine
// flicks sign every couple of nodes and can never produce one; only a
// sustained arc can. That makes the assertion about the shape of the track
// rather than about a variable the generator happened to set.
const sweeps = (c) => {
  const ns = [];
  for (let n = c.start; n; n = n.next[0] && n.next[0].to) ns.push(n);
  const hd = [];
  for (let i = 0; i + 1 < ns.length; i++) {
    hd.push(Math.atan2(ns[i + 1].p[0] - ns[i].p[0], ns[i + 1].p[2] - ns[i].p[2]));
  }
  const out = [];
  let run = 0, sum = 0, sgn = 0;
  for (let i = 1; i < hd.length; i++) {
    let d = hd[i] - hd[i - 1];
    d -= Math.round(d / (2 * Math.PI)) * 2 * Math.PI;
    const s2 = Math.sign(d);
    if (Math.abs(d) > .08 && s2 === sgn) { run++; sum += Math.abs(d); }
    else { if (run >= 6 && sum >= 1.2) out.push(sum); run = 1; sum = Math.abs(d); sgn = s2; }
  }
  if (run >= 6 && sum >= 1.2) out.push(sum);
  return out;
};

let cycles = 0, orphans = 0;
const tot = { nodes: 0, split: 0, req: 0, twist: 0, gap: 0, sweep: 0, sweepArc: 0, kick: 0 };
const N = 60;
for (let i = 0; i < N; i++) {
  const c = makeCourse(120);
  const state = new Map();
  const visit = (n) => {
    if (state.get(n) === 1) { cycles++; return; }
    if (state.get(n) === 2) return;
    state.set(n, 1);
    for (const e of n.next) visit(e.to);
    state.set(n, 2);
  };
  visit(c.start);
  const seen = new Set();
  const walk = (n) => { if (seen.has(n)) return; seen.add(n); n.next.forEach((e) => walk(e.to)); };
  walk(c.start);
  orphans += c.nodes.length - seen.size;
  tot.nodes += c.nodes.length;
  tot.split += c.nodes.filter((n) => n.next.length > 1).length;
  tot.req += c.nodes.filter((n) => n.req > 0).length;
  tot.twist += c.nodes.filter((n) => n.twist).length;
  tot.gap += c.nodes.reduce((a, n) => a + n.next.filter((e) => e.gap).length, 0);
  tot.kick += c.nodes.filter((n) => n.kick).length;
  const sw = sweeps(c);
  tot.sweep += sw.length;
  tot.sweepArc += sw.reduce((a, b) => a + b, 0);
}
console.log(`${N} courses: avg ${(tot.nodes / N) | 0} nodes, ${(tot.req / N).toFixed(1)} demand nodes, ${(tot.twist / N).toFixed(1)} corkscrews, ${(tot.gap / N).toFixed(1)} jumps`);
console.log(`${(tot.kick / N).toFixed(1)} kickers per course`);
console.log(`${(tot.sweep / N).toFixed(1)} sustained arcs per course, averaging ${tot.sweep ? (tot.sweepArc / tot.sweep * 57.3).toFixed(0) : 0} degrees of held bend`);
if (cycles || orphans) {
  console.log(`FAIL: ${cycles} cycles, ${orphans} orphaned nodes`);
  process.exit(1);
}
if (tot.split > 0) { console.log('FAIL: the course must be a single chain now'); process.exit(1); }
if (tot.req < N * 4 || tot.gap < N) { console.log('FAIL: not enough demands or jumps'); process.exit(1); }
if (tot.kick < N * 3) { console.log('FAIL: too few kickers - the dust economy leans on them'); process.exit(1); }
if (tot.sweep < N * 1.5) { console.log('FAIL: too few sustained arcs - every bend is a flick or a wiggle'); process.exit(1); }
console.log('single chain, acyclic, with demands, corkscrews, jumps and long arcs: OK');

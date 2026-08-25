// Course invariants for the physics run. The course must be one forward
// CHAIN (forks were cut on purpose - the game is earning the road, not
// choosing it), acyclic, fully reachable, and it must actually contain the
// things the game is made of: speed-demand sections, corkscrews and jumps.
// A run of pure cruise is a treadmill, not a rhythm chart.
import { makeCourse } from '../strands/src/course.js';

let cycles = 0, orphans = 0;
const tot = { nodes: 0, split: 0, req: 0, twist: 0, gap: 0 };
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
}
console.log(`${N} courses: avg ${(tot.nodes / N) | 0} nodes, ${(tot.req / N).toFixed(1)} demand nodes, ${(tot.twist / N).toFixed(1)} corkscrews, ${(tot.gap / N).toFixed(1)} jumps`);
if (cycles || orphans) {
  console.log(`FAIL: ${cycles} cycles, ${orphans} orphaned nodes`);
  process.exit(1);
}
if (tot.split > 0) { console.log('FAIL: the course must be a single chain now'); process.exit(1); }
if (tot.req < N * 4 || tot.gap < N) { console.log('FAIL: not enough demands or jumps'); process.exit(1); }
console.log('single chain, acyclic, with demands, corkscrews and jumps: OK');

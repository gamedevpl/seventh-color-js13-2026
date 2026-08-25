// The course must be ACYCLIC. That is not a style preference: cycles are
// exactly why the rainbow could come at the player head-on in the maze
// version, and a chase reads as chaos the moment the quarry can appear
// travelling the wrong way. Also checks nothing is orphaned and that the
// split/merge/jump mix is actually happening.
import { makeCourse } from '../strands/src/course.js';

let cycles = 0, orphans = 0;
const tot = { nodes: 0, split: 0, merge: 0, gap: 0 };
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
  const inc = new Map();
  c.nodes.forEach((n) => n.next.forEach((e) => inc.set(e.to, (inc.get(e.to) || 0) + 1)));
  tot.merge += [...inc.values()].filter((v) => v > 1).length;
  tot.gap += c.nodes.reduce((a, n) => a + n.next.filter((e) => e.gap).length, 0);
}
console.log(`${N} courses: avg ${(tot.nodes / N) | 0} nodes, ${(tot.split / N).toFixed(1)} splits, ${(tot.merge / N).toFixed(1)} merges, ${(tot.gap / N).toFixed(1)} jumps`);
if (cycles || orphans) {
  console.log(`FAIL: ${cycles} cycles, ${orphans} orphaned nodes`);
  process.exit(1);
}
if (tot.split < N || tot.gap < N) { console.log('FAIL: course is not branching or not jumping'); process.exit(1); }
console.log('acyclic, fully reachable, branching and jumping: OK');

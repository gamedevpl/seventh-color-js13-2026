// Steering sanity: ride the same net with constant LEFT / STRAIGHT / RIGHT
// input and prove the visited node sequences diverge. If they do not, fork
// choice is broken mechanically and no amount of camera feedback fixes it.
import { genGraph } from '../strands/src/maze.js';
import { makeRider, ride, nbrs } from '../strands/src/track.js';

// same math as main.js pickBranch, kept in sync by hand (it is 15 lines)
function pickBranch(g, c, st, T, A) {
  if (c.length === 1) return c[0];
  const h = Math.hypot(T[0], T[2]) || 1;
  const d = [T[0] / h, T[2] / h];
  let bestC = c[0], bv = -1e9;
  for (const m of c) {
    const M = g.pos[m[0]][m[1]];
    let ex = M[0] - A[0], ez = M[2] - A[2];
    const l = Math.hypot(ex, ez) || 1;
    ex /= l; ez /= l;
    const ang = Math.atan2(d[1] * ex - d[0] * ez, d[0] * ex + d[1] * ez);
    const v = st > 0 ? ang : st < 0 ? -ang : -Math.abs(ang);
    if (v > bv) { bv = v; bestC = m; }
  }
  return bestC;
}

const g = genGraph(8);
const forks = [];
for (let x = 0; x < 8; x++) for (let z = 0; z < 8; z++) {
  if (nbrs(g, x, z).length > 2) forks.push([x, z]);
}
console.log(`net 8x8, ${forks.length} fork nodes`);

function runWith(st) {
  const r = makeRider(g, [7, 7]);
  const path = [];
  let choices = 0;
  for (let i = 0; i < 600; i++) {
    ride(g, r, .8, (c) => {
      if (c.length > 1) choices++;
      const pick = pickBranch(g, c, st, r.tan, g.pos[r.a[0]][r.a[1]]);
      return pick;
    });
    path.push(r.a.join(','));
  }
  return { path: [...new Set(path)], choices };
}

const L = runWith(1), S = runWith(0), R = runWith(-1);
console.log(`LEFT     visits ${L.path.length} nodes, ${L.choices} real forks taken`);
console.log(`STRAIGHT visits ${S.path.length} nodes, ${S.choices} real forks taken`);
console.log(`RIGHT    visits ${R.path.length} nodes, ${R.choices} real forks taken`);
const lr = L.path.filter((n) => !R.path.includes(n)).length;
const ls = L.path.filter((n) => !S.path.includes(n)).length;
console.log(`nodes visited by LEFT but not RIGHT: ${lr}`);
console.log(`nodes visited by LEFT but not STRAIGHT: ${ls}`);
if (L.choices === 0) { console.log('FAIL: no forks ever offered'); process.exit(1); }
if (lr === 0 && ls === 0) { console.log('FAIL: steering changes nothing'); process.exit(1); }
console.log('steering diverges: OK');

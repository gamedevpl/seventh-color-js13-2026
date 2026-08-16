// Hand-authoring beam layouts produced puzzles that were unique but easy:
// with the beam redrawn on every flip, "turn one mirror and look" beats
// thinking, and a small search space rewards it. So layouts are searched
// for instead of written.
//
// The property being searched for is deliberately not "one solution" - it
// is "MANY ways to reach the target, exactly one that also lights every
// lantern". That is what kills flip-and-see: local flips keep hitting the
// target and keep being wrong, so the player has to reason about the whole
// route. Run this, paste the winners into data.js, and check-puzzles.mjs
// re-verifies them from the shipped data forever after.
//
//   node tools/design-beams.mjs <mirrors> <lanterns> [cols] [rows] [tries]

import { beamTrace } from '../native/src/games.js';

const [, , mArg, wArg, colArg, rowArg, tryArg] = process.argv;
const M = +(mArg || 5), W = +(wArg || 2);
const cols = +(colArg || 7), rows = +(rowArg || 4), TRIES = +(tryArg || 400000);

const rnd = (n) => Math.floor(Math.random() * n);
const key = ([c, r]) => c + ',' + r;

function combos(list, k) {
  if (k === 0) return [[]];
  const out = [];
  list.forEach((v, i) => combos(list.slice(i + 1), k - 1).forEach((rest) => out.push([v, ...rest])));
  return out;
}

let best = null;
for (let attempt = 0; attempt < TRIES && !best; attempt++) {
  const taken = new Set();
  const spot = () => {
    for (;;) {
      const p = [rnd(cols), rnd(rows)];
      if (!taken.has(key(p))) { taken.add(key(p)); return p; }
    }
  };
  const side = rnd(2);
  const entry = side ? [0, rnd(rows), 1, 0] : [rnd(cols), 0, 0, 1];
  taken.add(key(entry));
  const mirrors = Array.from({ length: M }, spot);
  const target = spot();
  const bg = { cols, rows, entry, target, mirrors, blocks: [] };

  // Every orientation, and which of them reach the target at all.
  const reaching = [];
  for (let m = 0; m < 1 << M; m++) {
    const orient = Array.from({ length: M }, (_, i) => (m >> i) & 1);
    const { pts, reach } = beamTrace(bg, orient);
    if (reach && pts.length > 5) reaching.push({ orient, cells: pts.map(key) });
  }
  // Want the target to be *easy* to hit - that is the trap.
  if (reaching.length < 5) continue;

  // Cells the beam can visit, minus the fixed furniture: candidate lanterns.
  const pool = [...new Set(reaching.flatMap((r) => r.cells))]
    .filter((k) => k !== key(target) && !mirrors.some((m) => key(m) === k) && k !== key(entry));
  if (pool.length < W + 2) continue;

  for (const pick of combos(pool, W)) {
    const winners = reaching.filter((r) => pick.every((p) => r.cells.includes(p)));
    if (winners.length !== 1) continue;
    // Every lantern must actually rule something out. One that sits on the
    // entry path - covered by every route that reaches the target at all -
    // is scenery, and it makes the puzzle look harder than it is.
    if (pick.some((p) => reaching.every((r) => r.cells.includes(p)))) continue;
    const sol = winners[0].orient;
    // A start far from the answer, so it cannot be stumbled into.
    let start = null;
    for (let m = 0; m < 1 << M; m++) {
      const o = Array.from({ length: M }, (_, i) => (m >> i) & 1);
      const flips = o.filter((v, i) => v !== sol[i]).length;
      if (flips >= Math.max(3, M - 2) && !beamTrace({ ...bg, waypoints: pick.map((k) => k.split(',').map(Number)) }, o).hit) { start = o; break; }
    }
    if (!start) continue;
    best = {
      ...bg,
      waypoints: pick.map((k) => k.split(',').map(Number)),
      start,
      decoys: reaching.length,
      flips: sol.filter((v, i) => v !== start[i]).length,
    };
    break;
  }
}

if (!best) { console.error('no layout found - loosen the constraints'); process.exit(1); }
const j = (a) => JSON.stringify(a).replace(/,/g, ', ');
console.log(`      cols: ${best.cols}, rows: ${best.rows}, entry: ${j(best.entry)}, target: ${j(best.target)},`);
console.log(`      mirrors: ${j(best.mirrors)},`);
console.log(`      waypoints: ${j(best.waypoints)},`);
console.log(`      start: ${j(best.start)},`);
console.log(`// ${best.decoys} orientations reach the target, exactly 1 lights every lantern; ${best.flips} flips from the start`);

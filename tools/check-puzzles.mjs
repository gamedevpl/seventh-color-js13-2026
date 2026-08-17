// Authored levels are data, and data can be wrong in ways no playtest
// reliably catches - an unsolvable level looks exactly like a hard one
// until someone gives up. This searches every placement of the bucklers a
// level actually hands the player, on the floors the player can actually
// reach, and reports whether the light can be landed on Darkness at all.
//
// It caught a 0/16 beam layout when this checked the old grid puzzle. The
// puzzle changed; the reason for checking did not.

import { BEATS } from '../native/src/data.js';
import { beamTrace } from '../native/src/games.js';

// Which floors can be walked to from the roof, following the shafts.
function reachableRows(g) {
  const seen = new Set([0]);
  for (;;) {
    const before = seen.size;
    for (const [, r] of g.shafts) {
      if (seen.has(r - 1)) seen.add(r);
      if (seen.has(r)) seen.add(r - 1);
    }
    if (seen.size === before) return [...seen].filter((r) => r >= 0 && r < g.rows).sort();
  }
}

function solve(g) {
  const rows = reachableRows(g);
  const cells = [];
  for (const r of rows) for (let c = 0; c < g.cols; c++) {
    if (r === 0 && c === g.entry) continue;                       // that cell is the shutter
    if ((g.blocks || []).some(([bc, br]) => bc === c && br === r)) continue;
    cells.push([c, r]);
  }
  const base = { cols: g.cols, rows: g.rows, entry: [g.entry, 0, 0, 1], target: g.target, blocks: g.blocks };
  // Search by increasing size, so what comes back is the MINIMUM number of
  // bucklers that works. Solvable is not the bar - a level that hands out
  // three and can be cleared with one is a level with two decorations.
  let found = null, tried = 0;
  for (let k = 1; k <= g.mirrors && !found; k++) {
    const walk = (start, chosen) => {
      if (found) return;
      if (chosen.length === k) {
        for (let m = 0; m < 1 << k; m++) {
          tried++;
          const orient = chosen.map((_, i) => (m >> i) & 1);
          if (beamTrace({ ...base, mirrors: chosen }, orient).hit) { found = { chosen, orient, k }; return; }
        }
        return;
      }
      for (let i = start; i < cells.length && !found; i++) walk(i + 1, [...chosen, cells[i]]);
    };
    walk(0, []);
  }
  return { found, tried, rows };
}

let bad = 0;
for (const b of BEATS.filter((x) => x.game === 'dungeon')) {
  const g = b.g;
  const { found, tried, rows } = solve(g);
  const reachesAll = rows.length === g.rows;
  const targetReachable = rows.includes(g.target[1]) || true;    // the light reaches it, not Jack
  // One spare is deliberate - room to try something without first
  // unpicking the board. Two or more and the level is handing out
  // decoration, which is what this check exists to catch.
  const spare = found ? g.mirrors - found.k : 0;
  const ok = !!found && reachesAll && spare <= 1;
  if (!ok) bad++;
  console.log(
    `${ok ? 'OK  ' : 'FAIL'} ${b.id.padEnd(20)} ${g.cols}x${g.rows}  ${g.mirrors} bucklers  ` +
    `${(g.guards || []).length} guards  floors reachable ${rows.length}/${g.rows}  ` +
    `${found ? `needs ${found.k}, ${spare} spare` : 'NO SOLUTION'}` +
    `${reachesAll ? '' : '  <-- A FLOOR CANNOT BE REACHED'}` +
    `${found && spare > 1 ? `  <-- ${spare} BUCKLERS ARE DECORATION` : ''}`
  );
  if (found) {
    const shown = found.chosen.map(([c, r], i) => `${c},${r}${found.orient[i] ? '\\' : '/'}`).join('  ');
    console.log(`      one answer: ${shown}`);
  }
}
if (bad) { console.error(`\n${bad} broken level(s)`); process.exit(1); }
console.log('\nall dungeon levels solvable, every floor reachable');

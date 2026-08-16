// Authored puzzle layouts are data, and data can be wrong in ways no
// playtest reliably catches - an unsolvable beam layout looks exactly like
// a hard one until someone gives up. This brute-forces every mirror
// configuration of every beam beat and reports: does a solution exist, is
// the starting state already solved (a puzzle that solves itself is not a
// puzzle), and how many of the configurations work - the fewer, the more
// the player has to actually reason.

import { BEATS } from '../native/src/data.js';
import { beamTrace } from '../native/src/games.js';

let bad = 0;
for (const b of BEATS.filter((x) => x.game === 'beam')) {
  const n = b.g.mirrors.length, total = 2 ** n;
  const wins = [];
  for (let m = 0; m < total; m++) {
    const orient = Array.from({ length: n }, (_, i) => (m >> i) & 1);
    if (beamTrace(b.g, orient).hit) wins.push(orient.join(''));
  }
  const startSolved = beamTrace(b.g, b.g.start).hit;
  const minFlips = wins.length
    ? Math.min(...wins.map((w) => [...w].filter((c, i) => +c !== b.g.start[i]).length))
    : Infinity;
  const ok = wins.length > 0 && !startSolved;
  if (!ok) bad++;
  console.log(
    `${ok ? 'OK  ' : 'FAIL'} ${b.id.padEnd(20)} ${n} mirrors  ${String(wins.length).padStart(2)}/${total} solve` +
    `  min ${minFlips} flips${startSolved ? '  <-- STARTS SOLVED' : ''}${wins.length ? '' : '  <-- UNSOLVABLE'}`
  );
  if (wins.length && wins.length <= 4) console.log(`      solutions: ${wins.join(' ')}`);
}
if (bad) { console.error(`\n${bad} broken layout(s)`); process.exit(1); }
console.log('\nall beam layouts solvable, none pre-solved');

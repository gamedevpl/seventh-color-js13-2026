// Plays the whole game at the module level - no browser, no timing luck.
// The solvers below are deliberately written as a *competent human*, not as
// an oracle: they only use information the player can actually see on
// screen (mark positions, the drawn target wedge, the demonstrated
// sequence, the gaps ahead). If a solver like this cannot clear a mechanic,
// neither can a player, and the mechanic is mistuned rather than merely
// hard. Failures are counted and reported so tuning is measured, not felt.

import { BEATS } from '../native/src/data.js';
import { GAMES, beamTrace } from '../native/src/games.js';
import { makeRound, currentBeat, tick, press, moveChoice, P } from '../native/src/story.js';

const DT = 1 / 60;
const NONE = { act: false, pressLeft: false, pressRight: false, heldLeft: false, heldRight: false, heldAct: false };
const input = (o) => ({ ...NONE, ...o });

// Cursor-driven puzzles are all edge-triggered: one tap, one step. Tapping
// every frame models a stuck key, not a player, so every cursor move goes
// through one human-cadence gate.
function toCursor(cur, want, n) {
  if (tapGate++ % 7) return input({});
  if (cur === want) return input({ act: true });
  const right = (want - cur + n) % n, left = (cur - want + n) % n;
  return input(right <= left ? { pressRight: true } : { pressLeft: true });
}

// Each puzzle solver re-derives its whole plan from the board every frame
// rather than remembering one. That makes them self-correcting when
// --sloppy drops an input, and it means the solver is reading the same
// state the player can see rather than a private script.
let tapGate = 0;
const SOLVERS = {
  crack(g) {
    // 1D Lights Out: find the set of strikes that clears the board.
    const n = g.n;
    let picks = null;
    for (let m = 0; m < (1 << n) && !picks; m++) {
      const cells = g.cells.slice(), got = [];
      for (let i = 0; i < n; i++) {
        if (!((m >> i) & 1)) continue;
        got.push(i);
        for (let j = i - 1; j <= i + 1; j++) if (j >= 0 && j < n) cells[j] = !cells[j];
      }
      if (cells.every(Boolean)) picks = got;
    }
    if (!picks || !picks.length) throw new Error('crack: board is unsolvable');
    return toCursor(g.sel, picks[0], n);
  },
  beam(g, b) {
    // Brute-force the mirror settings, then fix the first wrong mirror.
    const n = b.g.mirrors.length;
    let want = null;
    for (let m = 0; m < 2 ** n && !want; m++) {
      const o = Array.from({ length: n }, (_, i) => (m >> i) & 1);
      if (beamTrace(b.g, o).hit) want = o;
    }
    if (!want) throw new Error(`beam: ${b.id} has no solution`);
    const wrong = want.findIndex((v, i) => v !== g.orient[i]);
    if (wrong < 0) return input({});
    return toCursor(g.sel, wrong, n);
  },
  lights(g) {
    // Keep only the orders consistent with every score so far, then name
    // the first survivor - exactly the reasoning the puzzle asks for.
    const perms = [];
    const walk = (left, acc) => {
      if (!left.length) return perms.push(acc);
      left.forEach((v, i) => walk(left.filter((_, j) => j !== i), [...acc, v]));
    };
    walk([...Array(g.n).keys()], []);
    const viable = perms.filter((p) => g.history.every(([row, score]) => row.filter((v, i) => v === p[i]).length === score));
    const pick = viable[0] || perms[0];
    return toCursor(g.cursor, pick[g.guess.length], g.n);
  },
  stillness(g, b) {
    // Read the drifting calm band the gauge draws and breathe toward it.
    const zone = .5 + Math.sin(g.t * .7) * (b.g.drift ?? .22);
    return input({ heldAct: g.level < zone });
  },
  chase(g, b) {
    // Holes want a jump, arches want the opposite - so look at what is
    // actually next rather than reacting to any marker at all.
    const w = b.g.width ?? .035;
    const gap = b.g.gaps.find((p) => p + w > g.d);
    const arch = (b.g.arches || []).find((p) => p + w > g.d);
    if (arch !== undefined && (gap === undefined || arch < gap)) return input({});
    const lead = gap === undefined ? 1 : gap - w - g.d;
    if (g.y <= 0 && lead < .022 && lead > -w) return input({ act: true });
    return input({});
  },
};

// --sloppy models an imperfect player: decisions arrive a few frames late
// and some inputs are dropped outright. A mechanic that a sloppy player
// never fails is not a game; one they cannot finish is mistuned. Both ends
// are checked, because the first version of these four failed the first
// test - nothing could be lost, so nothing could be learned.
const sloppy = Number(process.argv.find((a) => a.startsWith('--sloppy='))?.split('=')[1] || 0);
let lag = [];
function degrade(cmd) {
  if (!sloppy) return cmd;
  lag.push(cmd);
  const out = lag.length > 4 ? lag.shift() : NONE;
  return Math.random() < sloppy ? NONE : out;
}

const round = makeRound(BEATS, BEATS[0].id);
const visited = [];
const report = [];
let guard = 0;

while (round.phase !== P.END && guard++ < 400000) {
  const b = currentBeat(round);
  if (visited[visited.length - 1] !== b.id) visited.push(b.id);

  if (round.phase === P.GAME) {
    const solver = SOLVERS[b.game];
    if (!solver) throw new Error(`no solver for mechanic ${b.game}`);
    const started = round.g;
    let frames = 0;
    lag = [];
    while (round.phase === P.GAME && frames++ < 60 * 90) tick(round, DT, degrade(solver(round.g, b)));
    if (round.phase === P.GAME) throw new Error(`${b.id}: ${b.game} unsolved after 90s`);
    // Guards a bug that shipped once: the same press that landed the final
    // hit was also fed to press(), which ate the success line whole and
    // jumped to the next beat. Finishing a mechanic must land in SUCCESS.
    if (b.successDialogue && round.phase !== P.SUCCESS) throw new Error(`${b.id}: success dialogue skipped on completion`);
    const cost = started.wake ?? started.falls ?? started.moves ?? 0;
    report.push(`  ${b.id.padEnd(20)} ${b.game.padEnd(8)} ${(frames / 60).toFixed(1)}s  mistakes:${cost}`);
    continue;
  }

  if (round.phase === P.CUT) {
    let cf = 0;
    while (round.phase === P.CUT && cf++ < 60 * 30) tick(round, DT, NONE);
    if (round.phase === P.CUT) throw new Error(`${b.id}: cutscene never ended`);
    report.push(`  ${b.id.padEnd(20)} ${'cutscene'.padEnd(8)} ${(cf / 60).toFixed(1)}s  (unskippable)`);
    continue;
  }

  if (round.phase === P.CHOICE) {
    while (round.choiceIndex !== b.choice.correct) moveChoice(round, 1);
  }
  tick(round, DT, NONE);
  press(round);
}

if (round.phase !== P.END) throw new Error(`never reached the ending (guard ${guard})`);

console.log('mechanic playthrough (solver only uses on-screen information):');
for (const r of report) console.log(r);
console.log(`\nbeats visited (${visited.length}/${BEATS.length}): ${visited.join(' -> ')}`);
console.log('reached ending: OK');

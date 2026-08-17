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
const NONE = { act: false, pressLeft: false, pressRight: false, pressUp: false, pressDown: false, heldLeft: false, heldRight: false, heldAct: false };
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
// Smallest set of bucklers that lands the light on Darkness - the same
// search the level checker runs, so the test and the gate agree on what
// "solvable" means.
const PLANS = {};
function planDungeon(g) {
  const rows = new Set([0]);
  for (let pass = 0; pass < g.rows; pass++) {
    for (const [, r] of g.shafts) {
      if (rows.has(r - 1)) rows.add(r);
      if (rows.has(r)) rows.add(r - 1);
    }
  }
  const cells = [];
  for (const r of [...rows].filter((r) => r >= 0 && r < g.rows)) {
    for (let c = 0; c < g.cols; c++) {
      if (r === 0 && c === g.entry) continue;
      if ((g.blocks || []).some(([bc, br]) => bc === c && br === r)) continue;
      cells.push([c, r]);
    }
  }
  const base = { cols: g.cols, rows: g.rows, entry: [g.entry, 0, 0, 1], target: g.target, blocks: g.blocks };
  // How much of a route sits where a guard can reach it. A route through a
  // patrol lane needs a lucky window; a route outside every lane can be
  // opened whenever. A player works that out, so the solver should too.
  const exposure = (mirrors, orient) => {
    const t = beamTrace({ ...base, mirrors }, orient);
    return t.pts.filter(([c, r]) => (g.guards || []).some(([gr, x0, x1]) => gr === r && c >= x0 - 1 && c <= x1 + 1)).length
      + mirrors.filter(([c, r]) => (g.guards || []).some(([gr, x0, x1]) => gr === r && c >= x0 - 1 && c <= x1 + 1)).length * 3;
  };
  for (let k = 1; k <= g.mirrors; k++) {
    let best = null, bestCost = Infinity;
    const walk = (start, chosen) => {
      if (chosen.length === k) {
        for (let m = 0; m < 1 << k; m++) {
          const orient = chosen.map((_, i) => (m >> i) & 1);
          if (!beamTrace({ ...base, mirrors: chosen }, orient).hit) continue;
          const cost = exposure(chosen, orient);
          if (cost < bestCost) { bestCost = cost; best = chosen.map(([c, r], i) => [c, r, orient[i]]); }
        }
        return;
      }
      for (let i = start; i < cells.length; i++) walk(i + 1, [...chosen, cells[i]]);
    };
    walk(0, []);
    if (best) return best;
  }
  return null;
}

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
  dungeon(st, b) {
    // Plan once, then walk the plan: place every buckler the search says is
    // needed, then stand at the shutter and open it only on a frame where
    // no guard is standing in the light. Exactly what the level asks of a
    // player, using only what the level shows them.
    const g = b.g;
    const plan = (PLANS[b.id] ||= planDungeon(g));
    if (!plan) throw new Error(`${b.id}: dungeon level has no solution`);

    const walkTo = (col) => {
      if (Math.abs(st.x - col) < .12) return null;
      return input(st.x > col ? { heldLeft: true } : { heldRight: true });
    };
    // Anything not yet placed, or placed the wrong way round.
    for (const [c, r, o] of plan) {
      const at = st.mir.find((m) => m[0] === c && m[1] === r);
      if (at && at[2] === o) continue;
      if (st.r !== r) {
        const up = st.r > r;
        const sh = g.shafts.find((x) => x[1] === (up ? st.r : st.r + 1));
        if (!sh) throw new Error(`${b.id}: floor ${r} is unreachable from ${st.r}`);
        return walkTo(sh[0]) || (tapGate++ % 7 ? input({}) : input(up ? { pressUp: true } : { pressDown: true }));
      }
      return walkTo(c) || (tapGate++ % 7 ? input({}) : input({ act: true }));
    }
    // Everything is in place: go to the shaft and wait for a clean moment.
    if (st.r !== 0) {
      const sh = g.shafts.find((x) => x[1] === st.r);
      return walkTo(sh[0]) || (tapGate++ % 7 ? input({}) : input({ pressUp: true }));
    }
    const move = walkTo(g.entry);
    if (move) return move;
    const t = beamTrace(
      { cols: g.cols, rows: g.rows, entry: [g.entry, 0, 0, 1], target: g.target, blocks: g.blocks, mirrors: st.mir.map((m) => [m[0], m[1]]) },
      st.mir.map((m) => m[2]),
    );
    // The light travels now, so the route has to stay clear for the whole
    // descent - sample it rather than checking the instant of opening.
    const sweep = g.sweep ?? 1.5;
    const speedMult = 1 + Math.min(st.alarm, 2.2) * .18;
    const clear = Array.from({ length: 16 }, (_, k) => (k + 1) / 16).every((frac) => {
      const when = st.t + frac * sweep, lit = Math.ceil(frac * t.pts.length);
      return !(g.guards || []).some((gd) => {
        const [, x0, x1, sp, ph] = gd, w = x1 - x0;
        const u = (when * sp * speedMult + ph) % 2;
        const gx = Math.round(x0 + (u < 1 ? u : 2 - u) * w);
        return t.pts.slice(0, lit).some(([pc, pr]) => pr === gd[0] && pc === gx);
      });
    });
    return t.hit && clear ? input({ act: true }) : input({});
  },
  stillness(g) {
    // Watch the same three heads the player does, and move only when they
    // all agree - including not starting a move a head is about to end.
    const herd = [[2.4, .72, 0], [3.3, .68, .8], [4.1, .74, 1.9]];
    const up = (u, t) => ((t / u[0] + u[2]) % 1) >= u[1];
    return input({ heldAct: !herd.some((u) => up(u, g.t) || up(u, g.t + .08)) });
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
    // Stop at the beat boundary, not merely at the phase change - two
    // cutscenes back to back are both P.CUT, and a loop that only watches
    // the phase silently swallows the second one.
    let cf = 0;
    const here = round.id;
    while (round.phase === P.CUT && round.id === here && cf++ < 60 * 60) tick(round, DT, NONE);
    if (round.phase === P.CUT && round.id === here) throw new Error(`${b.id}: cutscene never ended`);
    report.push(`  ${b.id.padEnd(20)} ${'cutscene'.padEnd(8)} ${(cf / 60).toFixed(1)}s  ${b.cutscene.lines.length} lines`);
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

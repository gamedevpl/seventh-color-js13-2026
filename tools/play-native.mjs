// Plays the whole game at the module level - no browser, no timing luck.
// The solvers below are deliberately written as a *competent human*, not as
// an oracle: they only use information the player can actually see on
// screen (mark positions, the drawn target wedge, the demonstrated
// sequence, the gaps ahead). If a solver like this cannot clear a mechanic,
// neither can a player, and the mechanic is mistuned rather than merely
// hard. Failures are counted and reported so tuning is measured, not felt.

import { BEATS } from '../native/src/data.js';
import { GAMES } from '../native/src/games.js';
import { makeRound, currentBeat, tick, press, moveChoice, P } from '../native/src/story.js';

const DT = 1 / 60;
const NONE = { act: false, pressLeft: false, pressRight: false, heldLeft: false, heldRight: false };
const input = (o) => ({ ...NONE, ...o });

// Each solver sees (state, beat) and returns the input a player would give.
let tapGate = 0;
const SOLVERS = {
  icerain(g) {
    // Go for the mark you can still reach, soonest-to-seal first.
    const reachable = g.marks
      .filter((m) => Math.abs(m.x - g.x) / 160 < m.life)
      .sort((a, b) => a.life - b.life);
    const m = reachable[0] || g.marks[0];
    if (!m) return input({});
    if (Math.abs(m.x - g.x) < 12) return input({ act: true });
    return input(m.x < g.x ? { heldLeft: true } : { heldRight: true });
  },
  dial(g, b) {
    // Track the wedge the renderer draws, counter-steering the drift.
    const target = b.g.target + Math.sin(g.t * (b.g.sway ?? 0)) * (b.g.swayAmp ?? 0);
    const err = target - g.angle;
    if (Math.abs(err) < b.g.tolerance * .35) return input({});
    return input(err > 0 ? { heldRight: true } : { heldLeft: true });
  },
  lights(g) {
    if (g.show < g.seq.length) return input({});          // watch the demo
    // pressLeft/pressRight are edge-triggered: one tap, one step. A solver
    // that taps every frame is not modelling a player, it is modelling a
    // stuck key - so tap at a human cadence and let the cursor settle.
    if (tapGate++ % 7) return input({});
    const want = g.seq[g.step];
    if (g.cursor === want) return input({ act: true });
    const n = g.n, right = (want - g.cursor + n) % n, left = (g.cursor - want + n) % n;
    return input(right <= left ? { pressRight: true } : { pressLeft: true });
  },
  chase(g, b) {
    const w = b.g.width ?? .035;
    // Jump when the next hole is close enough that the arc will clear it.
    const next = b.g.gaps.find((p) => p + w > g.d);
    const lead = next === undefined ? 1 : next - w - g.d;
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
    const cost = started.sealed ?? started.wake ?? started.falls ?? 0;
    report.push(`  ${b.id.padEnd(20)} ${b.game.padEnd(8)} ${(frames / 60).toFixed(1)}s  mistakes:${cost}`);
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

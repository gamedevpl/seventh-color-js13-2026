import { circle, line, rect, poly, text } from './draw.js';
import { paintFace } from './faces.js';
import { kick, burst } from './fx.js';
import { sfxHit, sfxNo, sfxJump, sfxTap } from './audio.js';

// A mechanic is init(beat) -> state, update(state, beat, dt, input) ->
// done?, render(state, beat, t), plus a `hint` string naming its controls.
// Failure inside a mechanic never leaves P.GAME - it costs progress and
// shakes the screen, but it never throws the player back to a modal phase.
//
// Every one of these was rebuilt once the first versions turned out to be
// unplayable in the same way: nothing could be failed, so nothing could be
// learned. The rules they now share:
//   - there is always something you can lose, and losing it is visible;
//   - the information you need to win is on screen, never only in data.js;
//   - difficulty escalates inside a single attempt, not across beats;
//   - a hit is felt (kick + burst + sfx), not merely counted.

// Shared readouts. Four mechanics, one status vocabulary - pips for
// countable progress, a meter for continuous progress - so the player
// learns to read the top strip once rather than four times.
function pips(x, y, n, filled, on, off) {
  for (let i = 0; i < n; i++) circle(x + i * 9, y, 3, { fill: i < filled ? on : off });
}
function meter(x, y, w, p, color) {
  rect(x, y, w, 4, { fill: '#0009' });
  rect(x, y, w * Math.max(0, Math.min(1, p)), 4, { fill: color });
}
function strip() { rect(0, 0, 320, 16, { fill: '#0007' }); }

// --- crack: the ice answers back on both sides --------------------------
// Was a reflex test: hit the lit thing before it closed. Now striking the
// ice cracks the cell *and both its neighbours*, which turns "crack every
// cell" into a parity problem - a one-dimensional Lights Out. There is
// nothing to react to and nothing to out-run; the only way through is to
// work out the order. Scrambled from the solved state by real strikes, so
// the board handed to the player is always solvable by construction.
const CW = 36;
const crackX = (i) => 34 + i * CW + CW / 2;

// Scrambling by random strikes guarantees solvability but not *difficulty*
// - strikes cancel, and a board that falls to one hit is not a puzzle. So
// the shortest solution is measured (128 subsets, once, at init) and any
// board that gives itself away is thrown back.
function crackBest(cells, n) {
  let best = 99;
  for (let m = 0; m < 1 << n; m++) {
    const c = cells.slice();
    let hits = 0;
    for (let i = 0; i < n; i++) {
      if (!((m >> i) & 1)) continue;
      hits++;
      for (let j = i - 1; j <= i + 1; j++) if (j >= 0 && j < n) c[j] = !c[j];
    }
    if (c.every(Boolean) && hits < best) best = hits;
  }
  return best;
}
function crackInit(b) {
  const n = b.g.cells ?? 7, floor = b.g.min ?? 3;
  let cells;
  do {
    cells = Array(n).fill(true);
    for (let i = 0; i < (b.g.scramble ?? 6); i++) {
      const k = Math.floor(Math.random() * n);
      for (let j = k - 1; j <= k + 1; j++) if (j >= 0 && j < n) cells[j] = !cells[j];
    }
  } while (crackBest(cells, n) < floor);
  return { cells, sel: (n / 2) | 0, moves: 0, n };
}
function crackUpdate(g, b, dt, input) {
  if (input.pressLeft) { g.sel = (g.sel - 1 + g.n) % g.n; sfxTap(); }
  if (input.pressRight) { g.sel = (g.sel + 1) % g.n; sfxTap(); }
  if (input.act) {
    for (let j = g.sel - 1; j <= g.sel + 1; j++) if (j >= 0 && j < g.n) g.cells[j] = !g.cells[j];
    g.moves++;
    kick(.9);
    sfxHit();
    burst(crackX(g.sel), 112, 9, '#cfe8ff', 75);
    if (g.cells.every(Boolean)) return true;
  }
  return false;
}
function crackRender(g) {
  rect(0, 96, 320, 32, { fill: '#0a1622' });
  for (let i = 0; i < g.n; i++) {
    const x = 34 + i * CW, done = g.cells[i];
    rect(x + 2, 100, CW - 6, 22, { fill: done ? '#2b4a66' : '#12202e', stroke: i === g.sel ? '#e8b923' : '#1d3648', lineWidth: i === g.sel ? 2 : 1 });
    if (done) {
      line(x + 6, 104, x + 18, 118, { stroke: '#9fd4f0', lineWidth: 1 });
      line(x + 26, 103, x + 14, 119, { stroke: '#9fd4f0', lineWidth: 1 });
    }
  }
  // The tell that makes the rule learnable: the strike's reach is drawn.
  for (let j = g.sel - 1; j <= g.sel + 1; j++) {
    if (j < 0 || j >= g.n) continue;
    circle(crackX(j), 92, 2, { fill: j === g.sel ? '#e8b923' : '#e8b92377' });
  }
  strip();
  text(`moves ${g.moves}`, 10, 11, { fill: '#a89b84', font: '8px system-ui' });
}

// --- beam: route the light to where it has to land ----------------------
// This replaces a needle-balancing mechanic that asked for a steady hand
// and nothing else. A puzzle has to be *thought* about: here the beam is
// deterministic and the mirrors are the only variable, so the player is
// solving a small spatial problem rather than executing a small physical
// one. Same machine three times over, escalating layouts in data - the
// Mirror Buckler Jack chose in the Hollow, finally doing something.
//
// Grid geometry is shared so every layout reads the same way.
const CELL = 18, OX = 100, OY = 32;
const cx = (c) => OX + c * CELL + CELL / 2;
const cy = (r) => OY + r * CELL + CELL / 2;

// Deterministic trace: walk cell to cell, turning at mirrors, stopping at
// blocks or the grid edge. '/' sends (dx,dy) to (-dy,-dx); '\\' to (dy,dx).
export function beamTrace(bg, orient) {
  let [c, r, dx, dy] = bg.entry;
  const pts = [[c, r]];
  let hit = false;
  for (let i = 0; i < 40; i++) {
    if (c === bg.target[0] && r === bg.target[1]) { hit = true; break; }
    const mi = bg.mirrors.findIndex(([mc, mr]) => mc === c && mr === r);
    if (mi >= 0) {
      if (orient[mi]) { const t = dx; dx = dy; dy = t; }
      else { const t = dx; dx = -dy; dy = -t; }
    }
    c += dx; r += dy;
    if (c < 0 || r < 0 || c >= bg.cols || r >= bg.rows) break;
    if (bg.blocks && bg.blocks.some(([bc, br]) => bc === c && br === r)) { pts.push([c, r]); break; }
    pts.push([c, r]);
  }
  return { pts, hit };
}

function beamInit(b) {
  const orient = b.g.start.slice();
  return { orient, sel: 0, moves: 0, win: 0, ...beamTrace(b.g, orient) };
}
function beamUpdate(g, b, dt, input) {
  if (g.hit) {
    // A held beat so the player sees the light land before the scene moves.
    g.win += dt;
    return g.win > .7;
  }
  const n = b.g.mirrors.length;
  if (input.pressLeft) { g.sel = (g.sel - 1 + n) % n; sfxTap(); }
  if (input.pressRight) { g.sel = (g.sel + 1) % n; sfxTap(); }
  if (input.act) {
    g.orient[g.sel] ^= 1;
    g.moves++;
    Object.assign(g, beamTrace(b.g, g.orient));
    if (g.hit) { kick(1.2); burst(cx(b.g.target[0]), cy(b.g.target[1]), 16, '#fff0a0', 90); }
    else { sfxHit(); }
  }
  return false;
}
function beamRender(g, b) {
  const bg = b.g;
  rect(OX - 4, OY - 4, bg.cols * CELL + 8, bg.rows * CELL + 8, { fill: '#0b0a14cc' });
  for (let c = 0; c < bg.cols; c++) for (let r = 0; r < bg.rows; r++) circle(cx(c), cy(r), 1, { fill: '#3a3450' });
  // The beam, drawn before the pieces so mirrors sit on top of it.
  for (let i = 1; i < g.pts.length; i++) {
    const a = g.pts[i - 1], p = g.pts[i];
    line(cx(a[0]), cy(a[1]), cx(p[0]), cy(p[1]), { stroke: g.hit ? '#fff0a0' : '#e8b92399', lineWidth: g.hit ? 3 : 2 });
  }
  for (const [c, r] of bg.blocks || []) rect(cx(c) - 7, cy(r) - 7, 14, 14, { fill: '#241c30', stroke: '#4a3a5e', lineWidth: 1 });
  bg.mirrors.forEach(([c, C], i) => {
    const x = cx(c), y = cy(C), d = 6, sel = i === g.sel;
    if (sel) circle(x, y, 11, { stroke: '#e8b923', lineWidth: 1 });
    line(x - d, y + (g.orient[i] ? -d : d), x + d, y + (g.orient[i] ? d : -d), { stroke: sel ? '#fff' : '#9fd4f0', lineWidth: 3 });
  });
  const [tc, tr] = bg.target;
  circle(cx(tc), cy(tr), g.hit ? 8 : 6, { stroke: g.hit ? '#fff0a0' : '#c9975a', lineWidth: 2 });
  strip();
  text(`mirror ${g.sel + 1}/${bg.mirrors.length}    moves ${g.moves}`, 10, 11, { fill: '#a89b84', font: '8px system-ui' });
}

// --- lights: work out the order, do not memorise it ---------------------
// The first version hid the answer in data.js; the second demonstrated it,
// which made it a memory test. Neither asked the player to think. Now the
// order is secret but *deducible*: name a full order, and the bog reports
// how many lights you placed correctly. Every past guess and its score
// stays on screen, because a deduction puzzle you cannot review is just a
// guessing game with extra steps.
const LIT = ['#e86b52', '#e8b923', '#7cb56a', '#6b9bd0'];

function lightsInit(b) {
  const n = b.g.lights ?? 4;
  const secret = [...Array(n).keys()];
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [secret[i], secret[j]] = [secret[j], secret[i]];
  }
  return { n, secret, guess: [], history: [], cursor: 0, wake: 0 };
}
function lightsUpdate(g, b, dt, input) {
  if (input.pressLeft) { g.cursor = (g.cursor - 1 + g.n) % g.n; sfxTap(); }
  if (input.pressRight) { g.cursor = (g.cursor + 1) % g.n; sfxTap(); }
  if (input.act) {
    if (g.guess.includes(g.cursor)) { sfxNo(); return false; }
    g.guess.push(g.cursor);
    sfxHit();
    burst(lightX(g.cursor, g.n), 52, 6, LIT[g.cursor % 4], 55);
    if (g.guess.length === g.n) {
      const score = g.guess.filter((v, i) => v === g.secret[i]).length;
      g.history.push([g.guess.slice(), score]);
      g.guess = [];
      if (score === g.n) { kick(1.4); return true; }
      g.wake++;
      kick(1.1);
      sfxNo();
    }
  }
  return false;
}
const lightX = (i, n) => 160 + (i - (n - 1) / 2) * 44;
function lightsRender(g) {
  for (let i = 0; i < g.n; i++) {
    const x = lightX(i, g.n), used = g.guess.includes(i), sel = i === g.cursor;
    circle(x, 52, sel ? 12 : 9, { fill: used ? '#243024' : LIT[i % 4], stroke: sel ? '#fff' : '#556', lineWidth: 2 });
  }
  // The order being built, then every order already tried and its score.
  for (let i = 0; i < g.n; i++) {
    const x = 160 + (i - (g.n - 1) / 2) * 14;
    if (i < g.guess.length) circle(x, 76, 4, { fill: LIT[g.guess[i] % 4] });
    else circle(x, 76, 4, { stroke: '#4a4436', lineWidth: 1 });
  }
  g.history.slice(-4).forEach(([row, score], k) => {
    const y = 92 + k * 10;
    row.forEach((v, i) => circle(160 + (i - (g.n - 1) / 2) * 14, y, 3, { fill: LIT[v % 4] }));
    text(`${score} right`, 160 + (g.n / 2) * 14 + 8, y + 3, { fill: '#a89b84', font: '8px system-ui' });
  });
  strip();
  text(`tries ${g.history.length}`, 10, 11, { fill: '#a89b84', font: '8px system-ui' });
  meter(258, 6, 52, g.wake / 6, '#6a8a5a');
}

// --- chase: the causeway falls behind you -------------------------------
// Was: hold right to advance, which meant nothing was chasing you and you
// could stop to think. Now the run is automatic and accelerating, and the
// collapse is a real object on screen closing the gap whenever you stumble.
function chaseInit(b) {
  return { d: 0, y: 0, vy: 0, t: 0, edge: -.22, falls: 0, flash: 0 };
}
function chaseUpdate(g, b, dt, input) {
  g.t += dt;
  g.flash = Math.max(0, g.flash - dt * 3);
  const speed = (b.g.speed ?? .19) + g.t * .006;
  g.d += speed * dt;
  g.edge += speed * .93 * dt;

  if (input.act && g.y <= 0) { g.vy = 68; sfxJump(); }
  if (g.vy || g.y > 0) {
    g.y += g.vy * dt;
    g.vy -= 320 * dt;
    if (g.y <= 0) { g.y = 0; g.vy = 0; }
  }

  // Two obstacles that want opposite things: holes you must jump, and low
  // arches you must NOT. One reflex no longer clears the causeway - each
  // marker has to be read and answered, at speed.
  const w = b.g.width ?? .035;
  if (g.y > 3 && (b.g.arches || []).some((p) => Math.abs(g.d - p) < w)) {
    g.falls++;
    g.flash = 1;
    g.vy = -40;
    g.d = Math.max(0, g.d - .06);
    g.edge += .012;
    kick(1.8);
    sfxNo();
    burst(80, 100, 10, '#8a6a4a', 70);
  }
  // On the ground over a gap: a stumble. Costs ground, lets the collapse in.
  if (g.y <= 0 && b.g.gaps.some((p) => Math.abs(g.d - p) < w)) {
    g.falls++;
    g.flash = 1;
    g.d = Math.max(0, g.d - .075);
    g.edge += .015;
    kick(1.6);
    sfxNo();
    burst(80, 120, 10, '#8a6a4a', 70);
  }
  // Caught: the worst that happens is the collapse is beaten back, never
  // a restart - this is the story's climax, not a skill wall.
  if (g.edge >= g.d - .015) { g.edge = g.d - .16; kick(2.2); sfxNo(); }
  return g.d >= 1;
}
function chaseRender(g, b) {
  const sx = (p) => 80 + (p - g.d) * 300;
  // Causeway, drawn as the stretch between gaps rather than one slab, so
  // the holes are real holes in the floor the player can see coming.
  const slab = (x, w) => {
    rect(x, 112, w, 10, { fill: '#4a3a63' });
    rect(x, 112, w, 2, { fill: '#8a76b0' });
  };
  let cut = 0;
  for (const p of b.g.gaps) {
    const a = sx(p - (b.g.width ?? .035)), c = sx(p + (b.g.width ?? .035));
    if (a > cut) slab(cut, a - cut);
    cut = Math.max(cut, c);
  }
  if (cut < 320) slab(cut, 320 - cut);
  for (const p of b.g.arches || []) {
    const x = sx(p);
    if (x > -30 && x < 350) {
      const half = (b.g.width ?? .035) * 300;
      rect(x - half, 78, half * 2, 14, { fill: '#4a3a63' });
      poly([x - half, 92, x + half, 92, x, 102], { fill: '#3a2c50' });
    }
  }
  // The collapse itself.
  const ex = sx(g.edge);
  if (ex > -40) {
    rect(0, 0, Math.max(0, ex), 156, { fill: '#0b0510cc' });
    for (let i = 0; i < 5; i++) line(ex - 2, 30 + i * 26, ex + 8 + Math.sin(g.t * 6 + i) * 5, 40 + i * 26, { stroke: '#3a1f4a', lineWidth: 2 });
  }
  const py = 108 - g.y, run = g.y > 0 ? 0 : Math.sin(g.t * 16) * 2, tint = g.flash > 0 ? '#e8735a' : '#e8b923';
  rect(78, py - 2 + run, 5, 8, { fill: tint });
  circle(80, py - 5 + run, 3, { fill: tint });
  line(78, py + 6, 76 - run, py + 10, { stroke: tint, lineWidth: 2 });
  line(82, py + 6, 85 + run, py + 10, { stroke: tint, lineWidth: 2 });
  strip();
  meter(10, 6, 300, g.d, '#e8b923');
  // The collapse rides the same track as your progress, so the gap between
  // the two marks *is* the tension, readable at a glance.
  rect(10 + 300 * Math.max(0, g.edge), 4, 2, 8, { fill: '#e8735a' });
}

// --- stillness: breathe, and let them come to you ----------------------
// Ported from the original build's observe-choice scene, which asked the
// player to hold ACT to remain perfectly still while the unicorns
// approached. One button, one value: holding raises the breath, releasing
// lets it fall, and the calm band drifts - so it is modulation rather than
// the steering every other mechanic asks for. The payoff is drawn, not
// described: the unicorn walks closer the longer you hold your nerve.
function stillInit() { return { level: .5, near: 0, t: 0, calm: false }; }
function stillUpdate(g, b, dt, input) {
  g.t += dt;
  g.level = Math.max(0, Math.min(1, g.level + (input.heldAct ? .62 : -.55) * dt));
  const zone = .5 + Math.sin(g.t * .7) * (b.g.drift ?? .22);
  g.calm = Math.abs(g.level - zone) <= (b.g.band ?? .13);
  g.near = Math.max(0, g.near + (g.calm ? dt * .42 : -dt * .3));
  if (g.calm && Math.random() < dt * 6) burst(150 + Math.random() * 40, 70, 1, '#e8d9a0', 20);
  return g.near >= 1;
}
function stillRender(g, b) {
  // The unicorn is the meter: it is nearer when you are calmer.
  paintFace('unicorn', 250 - g.near * 60, 92 - g.near * 14, .3 + g.near * .34, g.t, false, true);
  const x = 22, top = 34, h = 74;
  const zone = .5 + Math.sin(g.t * .7) * (b.g.drift ?? .22), band = b.g.band ?? .13;
  rect(x, top, 7, h, { fill: '#0009' });
  rect(x, top + h * (1 - zone - band), 7, h * band * 2, { fill: g.calm ? '#fff0a066' : '#c9975a44' });
  rect(x - 2, top + h * (1 - g.level) - 1, 11, 3, { fill: g.calm ? '#fff0a0' : '#e8b923' });
  strip();
  meter(10, 6, 300, g.near, g.calm ? '#fff0a0' : '#8a7a5a');
}

export const GAMES = {
  crack: { init: crackInit, update: crackUpdate, render: crackRender, hint: '← → choose a pane    SPACE strike' },
  beam: { init: beamInit, update: beamUpdate, render: beamRender, hint: '← → pick a mirror    SPACE turn it' },
  lights: { init: lightsInit, update: lightsUpdate, render: lightsRender, hint: '← → choose    SPACE add to the order' },
  chase: { init: chaseInit, update: chaseUpdate, render: chaseRender, hint: 'SPACE jumps the holes - but never under an arch' },
  stillness: { init: stillInit, update: stillUpdate, render: stillRender, hint: 'hold SPACE to breathe - keep the mark in the light' },
};

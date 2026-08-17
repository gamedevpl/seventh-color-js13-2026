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
const CELL = 18, OY = 30;
const ox = (bg) => 160 - bg.cols * CELL / 2;
const cx = (bg, c) => ox(bg) + c * CELL + CELL / 2;
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
  const lit = (bg.waypoints || []).map(([wc, wr]) => pts.some(([c, r]) => c === wc && r === wr));
  return { pts, reach: hit, lit, hit: hit && lit.every(Boolean) };
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

// --- stillness: move only when the whole herd is grazing ----------------
// The first version drew a calm band and asked you to keep a marker inside
// it, which is a following exercise, not a watching one. The herd version
// asks the actual question the scene asks: *when is it safe to move?* Each
// unicorn lifts its head on its own rhythm, and Lili may only creep
// forward while every head is down - so the player has to read three
// clocks at once and find the window where they agree. The heads telegraph
// before they lift; that tell is the whole skill.
const HERD = [[2.4, .72, 0], [3.3, .68, .8], [4.1, .74, 1.9]];
const headUp = (u, t) => ((t / u[0] + u[2]) % 1) >= u[1];
const rising = (u, t) => !headUp(u, t) && ((t / u[0] + u[2]) % 1) >= u[1] - .12;

function stillInit() { return { near: 0, t: 0, spooked: 0, moving: false }; }
function stillUpdate(g, b, dt, input) {
  g.t += dt;
  g.spooked = Math.max(0, g.spooked - dt);
  const safe = !HERD.some((u) => headUp(u, g.t));
  g.moving = input.heldAct && !g.spooked;
  if (g.moving) {
    if (safe) {
      g.near += dt * .55;
      if (Math.random() < dt * 8) burst(60 + g.near * 90, 96, 1, '#e8d9a0', 22);
    } else {
      g.spooked = 1.2;
      g.near = Math.max(0, g.near - .2);
      kick(1.7);
      sfxNo();
    }
  }
  return g.near >= 1;
}
function stillRender(g) {
  const safe = !HERD.some((u) => headUp(u, g.t));
  // The herd reads at a glance: head down is safe, head up is caught, and
  // the amber lean in between is the warning you learn to move off.
  HERD.forEach((u, i) => {
    const up = headUp(u, g.t), warn = rising(u, g.t);
    const y = 96 - (up ? 18 : 0);
    paintFace('unicorn', 148 + i * 58, y, .34, g.t, false, true);
    circle(148 + i * 58, y + 22, 3, { fill: up ? '#e8735a' : warn ? '#e8b923' : '#7cb56a' });
  });
  // Lili, closing the distance she has earned.
  circle(46 + g.near * 88, 104, 4, { fill: g.spooked ? '#e8735a' : '#e8cdb0' });
  rect(0, 116, 320, 2, { fill: safe ? '#7cb56a55' : '#e8735a55' });
  strip();
  meter(10, 6, 240, g.near, g.spooked ? '#e8735a' : safe ? '#fff0a0' : '#8a7a5a');
  text(safe ? 'still' : 'watching', 268, 11, { fill: safe ? '#7cb56a' : '#e8735a', font: '8px system-ui' });
}

// --- dungeon: carry the light down to him -------------------------------
// The Legend finale, made playable. A cross-section of the castle: Jack
// climbs the floors placing bucklers while sunlight waits at a shaft in
// the roof, and Darkness is at the bottom. The catch is the whole design -
// the shutter can only be opened once, at the end, because open light
// draws every guard in the place. So the route is planned in the dark,
// walked past patrols, and then committed to in one moment.
//
// The reflection engine is beamTrace, unchanged from the grid puzzle this
// replaces: what was wrong there was never the tracer, it was that the
// player only flipped switches at it.
const DW = 22, DH = 24;
const dx0 = (g) => 160 - g.cols * DW / 2;
const dy0 = (g) => 20 + (100 - g.rows * DH) / 2;
const dcx = (g, c) => dx0(g) + c * DW + DW / 2;
const dfloor = (g, r) => dy0(g) + (r + 1) * DH;
const dcy = (g, r) => dfloor(g, r) - 9;

const guardAt = (gd, t) => {
  const [, x0, x1, sp, ph] = gd;
  const w = x1 - x0, u = ((t * sp + ph) % 2);
  return x0 + (u < 1 ? u : 2 - u) * w;
};

function dunInit(b) {
  return { x: b.g.entry + .0, r: 0, mir: [], open: 0, alarm: 0, t: 0, win: 0, msg: 0 };
}
// The placed bucklers, in the shape beamTrace already expects.
const dunBeam = (g, st) => beamTrace(
  { cols: g.cols, rows: g.rows, entry: [g.entry, 0, 0, 1], target: g.target, blocks: g.blocks, mirrors: st.mir.map((m) => [m[0], m[1]]) },
  st.mir.map((m) => m[2]),
);
const onShaft = (g, c, r) => g.shafts.some(([sc, sr]) => sc === c && sr === r);

function dunUpdate(st, b, dt, input) {
  const g = b.g;
  st.t += dt;
  st.msg = Math.max(0, st.msg - dt);
  if (st.win) { st.win += dt; return st.win > 1; }

  if (input.heldLeft) st.x -= 3.4 * dt;
  if (input.heldRight) st.x += 3.4 * dt;
  st.x = Math.max(0, Math.min(g.cols - 1, st.x));
  const c = Math.round(st.x);
  if (input.pressUp && st.r > 0 && onShaft(g, c, st.r)) { st.r--; sfxTap(); }
  if (input.pressDown && st.r < g.rows - 1 && onShaft(g, c, st.r + 1)) { st.r++; sfxTap(); }

  if (input.act) {
    if (st.r === 0 && c === g.entry) {
      // The shutter. One decision, and the guards get a vote.
      st.open = 1;
      const t = dunBeam(g, st);
      const seen = (g.guards || []).some((gd) => {
        const gx = Math.round(guardAt(gd, st.t));
        return t.pts.some(([pc, pr]) => pr === gd[0] && pc === gx);
      });
      if (t.hit && !seen) { st.win = .01; kick(2); burst(dcx(g, g.target[0]), dcy(g, g.target[1]), 22, '#fff0a0', 100); }
      else { st.open = 0; st.alarm++; st.msg = 2; kick(1.8); sfxNo(); }
    } else {
      const at = st.mir.findIndex((m) => m[0] === c && m[1] === st.r);
      if (at < 0) {
        if (st.mir.length < g.mirrors) { st.mir.push([c, st.r, 0]); sfxHit(); }
        else { st.msg = 1.4; sfxNo(); }
      } else if (st.mir[at][2] === 0) { st.mir[at][2] = 1; sfxHit(); }
      else st.mir.splice(at, 1);
    }
  }

  // Patrols. Touching one costs the climb, never the attempt.
  for (const gd of g.guards || []) {
    if (gd[0] === st.r && Math.abs(guardAt(gd, st.t) - st.x) < .6) {
      st.r = 0;
      st.x = g.entry;
      st.alarm++;
      kick(2);
      sfxNo();
      burst(dcx(g, c), dcy(g, gd[0]), 10, '#e8735a', 70);
    }
  }
  return false;
}

function dunRender(st, b) {
  const g = b.g, X = dx0(g);
  rect(0, 0, 320, 126, { fill: '#0b0812' });
  rect(X - 3, dy0(g) - 13, g.cols * DW + 6, g.rows * DH + 17, { fill: '#140f1e' });
  // The sun, waiting on the roof.
  const sunx = dcx(g, g.entry);
  circle(sunx, dy0(g) - 16, 5, { fill: st.open ? '#fff6d8' : '#6a5a3a' });
  for (let r = 0; r < g.rows; r++) {
    const y = dfloor(g, r);
    for (let c = 0; c < g.cols; c++) {
      if (r < g.rows - 1 && onShaft(g, c, r + 1)) continue;
      rect(X + c * DW, y, DW, 4, { fill: '#3a2f4e' });
    }
  }
  for (const [c, r] of g.shafts) {
    const x = dcx(g, c), y = dfloor(g, r - 1);
    for (let i = 0; i < 4; i++) line(x - 5, y + 2 + i * 6, x + 5, y + 2 + i * 6, { stroke: '#5a4a7a', lineWidth: 1 });
    line(x - 5, y, x - 5, y + 22, { stroke: '#5a4a7a', lineWidth: 1 });
    line(x + 5, y, x + 5, y + 22, { stroke: '#5a4a7a', lineWidth: 1 });
  }
  for (const [c, r] of g.blocks || []) rect(dcx(g, c) - 8, dcy(g, r) - 8, 16, 16, { fill: '#241c30', stroke: '#4a3a5e', lineWidth: 1 });
  const t = dunBeam(g, st);
  const lit = st.open ? '#fff0a0' : '#6b5a2e';
  for (let i = 1; i < t.pts.length; i++) {
    const a = t.pts[i - 1], p = t.pts[i];
    line(dcx(g, a[0]), dcy(g, a[1]), dcx(g, p[0]), dcy(g, p[1]), { stroke: lit, lineWidth: st.open ? 3 : 1 });
  }
  line(sunx, dy0(g) - 12, sunx, dcy(g, 0), { stroke: lit, lineWidth: st.open ? 3 : 1 });
  for (const [c, r, o] of st.mir) {
    const x = dcx(g, c), y = dcy(g, r), d = 6;
    line(x - d, y + (o ? -d : d), x + d, y + (o ? d : -d), { stroke: '#9fd4f0', lineWidth: 3 });
  }
  // Darkness, at the bottom of everything - his own portrait, shrunk,
  // rather than a shape standing in for him.
  paintFace(g.face || 'darkness', dcx(g, g.target[0]), dcy(g, g.target[1]) - 1, g.faceScale || .17, st.t, false, false);
  for (const gd of g.guards || []) {
    const gx = dcx(g, guardAt(gd, st.t)), gy = dcy(g, gd[0]);
    rect(gx - 3, gy - 6, 6, 13, { fill: '#2b2038' });
    circle(gx, gy - 9, 3, { fill: '#4a3a5e' });
    circle(gx + 5, gy - 2, 2, { fill: '#e8735a' });
  }
  const px = dcx(g, st.x), py = dcy(g, st.r);
  rect(px - 2, py - 4, 5, 10, { fill: '#e8b923' });
  circle(px, py - 7, 3, { fill: '#e8cdb0' });
  strip();
  text(`bucklers ${g.mirrors - st.mir.length}/${g.mirrors}`, 10, 11, { fill: '#a89b84', font: '8px system-ui' });
  const here = Math.round(st.x), on = st.mir.find((m) => m[0] === here && m[1] === st.r);
  const doesWhat = st.r === 0 && here === g.entry ? 'SPACE opens the shaft'
    : on ? (on[2] ? 'SPACE takes it back' : 'SPACE turns it')
    : st.mir.length < g.mirrors ? 'SPACE puts a buckler here' : 'no bucklers left - take one back';
  if (st.msg > 0) text(st.msg > 1.4 ? 'seen! the shaft slams shut' : 'no bucklers left', 96, 11, { fill: '#e8735a', font: '8px system-ui' });
  else text(doesWhat, 96, 11, { fill: t.hit ? '#fff0a0' : '#8a7f6a', font: '8px system-ui' });
  meter(258, 6, 52, st.alarm / 5, '#e8735a');
}

export const GAMES = {
  dungeon: { init: dunInit, update: dunUpdate, render: dunRender, hint: '\u2190\u2192 walk   \u2191\u2193 climb the ladders   aim the dim line at him' },
  crack: { init: crackInit, update: crackUpdate, render: crackRender, hint: '← → choose a pane    SPACE strike' },
  lights: { init: lightsInit, update: lightsUpdate, render: lightsRender, hint: '← → choose    SPACE add to the order' },
  stillness: { init: stillInit, update: stillUpdate, render: stillRender, hint: 'hold SPACE to creep closer - only while every head is down' },
};

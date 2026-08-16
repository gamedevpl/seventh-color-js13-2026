import { circle, line, rect } from './draw.js';

// Three mechanics, not four. `aim` (turn the mirror on Meg) and `align`
// (turn the alicorn's horn) were planned as separate mechanics but turned
// out to be the same interaction - rotate toward a target angle within a
// tolerance, confirm - before a line of either was written. Collapsed into
// one `dial`, parameterized by target/tolerance/anchor per beat. Design
// rule 2 applied to the plan itself, not just retroactively to code: one
// machine (here, one mechanic), many data rows.
//
// A mechanic is init(beat) -> state, update(state, beat, dt, input) ->
// done?, render(state, beat, t). Failure inside a mechanic never leaves
// P.GAME - it's feedback (a reset, a color change), not a modal phase
// switch, matching how the original aim mechanics played.

function icerainInit() {
  return { hits: 0, t: 0, fall: 1.5 };
}
function icerainUpdate(g, b, dt, input) {
  g.t += dt;
  if (g.t >= g.fall) g.t = 0;
  if (input.act) {
    const p = g.t / g.fall;
    if (p >= 0.6 && p <= 0.92) {
      g.hits++;
      g.t = 0;
      g.fall = Math.max(0.62, 1.5 - g.hits * 0.28);
      if (g.hits >= 4) return true;
    } else g.t = 0;
  }
  return false;
}
function icerainRender(g) {
  const p = g.t / g.fall, hit = p >= 0.6 && p <= 0.92;
  rect(0, 120, 320, 20, { fill: '#0a1622' });
  circle(160, 22 + p * 90, hit ? 5 : 4, { fill: hit ? '#fff0a0' : '#8fb8d8' });
  for (let i = 0; i < 4; i++) circle(120 + i * 26, 130, 3, { fill: i < g.hits ? '#e8b923' : '#2a3a4a' });
}

function dialInit(b) {
  return { angle: b.g.start ?? -1.3, aligned: false };
}
function dialUpdate(g, b, dt, input) {
  const speed = 1.8;
  if (input.heldLeft) g.angle -= speed * dt;
  if (input.heldRight) g.angle += speed * dt;
  g.angle = Math.max(-1.6, Math.min(1.6, g.angle));
  g.aligned = Math.abs(g.angle - b.g.target) <= b.g.tolerance;
  return !!(input.act && g.aligned);
}
function dialRender(g, b) {
  const cx = b.g.x ?? 160, cy = b.g.y ?? 96, r = 26;
  circle(cx, cy, r + 6, { stroke: g.aligned ? '#fff0a0' : '#5a4a3a', lineWidth: 2 });
  line(cx, cy, cx + Math.cos(g.angle) * r, cy + Math.sin(g.angle) * r, { stroke: g.aligned ? '#fff0a0' : '#c9975a', lineWidth: 3 });
  circle(cx, cy, 4, { fill: '#e8b923' });
}

function lightsInit(b) {
  return { lit: b.g.order.map(() => true), cursor: 0, step: 0 };
}
function lightsUpdate(g, b, dt, input) {
  const n = g.lit.length;
  if (input.pressLeft) g.cursor = (g.cursor - 1 + n) % n;
  if (input.pressRight) g.cursor = (g.cursor + 1) % n;
  if (input.act && g.lit[g.cursor]) {
    if (g.cursor === b.g.order[g.step]) {
      g.lit[g.cursor] = false;
      g.step++;
      if (g.step >= b.g.order.length) return true;
    } else {
      g.lit = g.lit.map(() => true);
      g.step = 0;
    }
  }
  return false;
}
function lightsRender(g) {
  for (let i = 0; i < g.lit.length; i++) {
    const x = 110 + i * 50;
    circle(x, 96, i === g.cursor ? 10 : 8, { fill: g.lit[i] ? '#e86b52' : '#2a3a2a', stroke: i === g.cursor ? '#fff' : '#556', lineWidth: 2 });
  }
}

export const GAMES = {
  icerain: { init: icerainInit, update: icerainUpdate, render: icerainRender },
  dial: { init: dialInit, update: dialUpdate, render: dialRender },
  lights: { init: lightsInit, update: lightsUpdate, render: lightsRender },
};

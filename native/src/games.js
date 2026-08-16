import { circle, line, rect, poly } from './draw.js';
import { kick, burst } from './fx.js';
import { sfxHit, sfxNo, sfxJump } from './audio.js';

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

// --- icerain: strike the weak points before the frost seals them --------
// Was a single dot falling at a fixed x with one button. Now the ice opens
// weak points at random positions with a visible closing timer, Jack's
// chisel has to be carried to them, and a sealed point costs ground.
function icerainInit(b) {
  return { x: 160, marks: [], hit: 0, sealed: 0, spawn: .35, t: 0, need: b.g.need ?? 6 };
}
function icerainUpdate(g, b, dt, input) {
  g.t += dt;
  // Weak points open faster the closer Jack gets to breaking through.
  const life = Math.max(1.3, 2.1 - g.hit * .14);
  g.spawn -= dt;
  if (g.spawn <= 0 && g.marks.length < 3) {
    g.spawn = Math.max(.5, 1.05 - g.hit * .06);
    g.marks.push({ x: 34 + Math.random() * 252, life, max: life });
  }
  for (const m of g.marks) m.life -= dt;
  for (const m of g.marks) {
    if (m.life <= 0) { g.sealed++; kick(.7); sfxNo(); burst(m.x, 112, 5, '#7fa8c8', 40); }
  }
  g.marks = g.marks.filter((m) => m.life > 0);

  const speed = 160;
  if (input.heldLeft) g.x -= speed * dt;
  if (input.heldRight) g.x += speed * dt;
  g.x = Math.max(14, Math.min(306, g.x));

  if (input.act) {
    let best = null;
    for (const m of g.marks) if (Math.abs(m.x - g.x) < 15 && (!best || Math.abs(m.x - g.x) < Math.abs(best.x - g.x))) best = m;
    if (best) {
      g.marks = g.marks.filter((m) => m !== best);
      g.hit++;
      kick(1);
      sfxHit();
      burst(best.x, 112, 12, '#cfe8ff', 90);
      if (g.hit >= g.need) return true;
    } else {
      kick(.45);
      sfxNo();
      burst(g.x, 112, 4, '#5a7a94', 45);
    }
  }
  // The frost only ever takes back ground - it never ends the attempt.
  if (g.sealed >= 4) { g.sealed = 0; g.hit = Math.max(0, g.hit - 1); kick(1.4); }
  return false;
}
function icerainRender(g) {
  rect(0, 106, 320, 20, { fill: '#0a1622' });
  line(0, 106, 320, 106, { stroke: '#2b4a66', lineWidth: 1 });
  for (const m of g.marks) {
    const p = m.life / m.max;
    circle(m.x, 112, 4, { fill: p < .35 ? '#e8735a' : '#9fd4f0' });
    circle(m.x, 112, 5 + p * 7, { stroke: p < .35 ? '#e8735a' : '#6fa8cc', lineWidth: 1 });
  }
  // The chisel, and the line of attack it covers.
  poly([g.x, 104, g.x - 5, 94, g.x + 5, 94], { fill: '#e8b923' });
  line(g.x, 104, g.x, 118, { stroke: '#e8b92355', lineWidth: 1 });
  strip();
  pips(10, 8, g.need, g.hit, '#e8b923', '#2a3a4a');
  meter(240, 6, 70, g.sealed / 4, '#7fa8c8');
}

// --- dial: hold a drifting needle on a moving target --------------------
// Was: hold a key until it turns yellow, press space, win. Could not be
// failed. Now the needle sits in an unstable equilibrium - the further it
// drifts the harder it pulls - so the player is balancing, not steering,
// and alignment has to be *held* to charge rather than merely touched.
function dialInit(b) {
  return { angle: b.g.start ?? -1.3, charge: 0, t: 0, aligned: false };
}
function dialTarget(g, b) {
  return b.g.target + Math.sin(g.t * (b.g.sway ?? 0)) * (b.g.swayAmp ?? 0);
}
function dialUpdate(g, b, dt, input) {
  g.t += dt;
  const target = dialTarget(g, b);
  if (input.heldLeft) g.angle -= 1.7 * dt;
  if (input.heldRight) g.angle += 1.7 * dt;
  // Unstable near the target - small deviations accelerate away, so the
  // player is balancing rather than parking - but capped well under the
  // steer rate, or a needle that starts far out can never be hauled back
  // at all: drift would simply cancel steering and the beat would stall.
  const off = g.angle - target;
  g.angle += Math.sign(off) * Math.min(Math.abs(off) * (b.g.drift ?? .6), .6) * dt;
  g.angle = Math.max(-1.6, Math.min(1.6, g.angle));

  const was = g.aligned;
  g.aligned = Math.abs(g.angle - target) <= b.g.tolerance;
  if (g.aligned && !was) sfxHit();
  // Drains slower than it fills, so a scrappy player still banks progress
  // and the meter reads as ground gained rather than a coin-flip. Fast
  // enough to still be lost - it stays failable, just not futile.
  g.charge += (g.aligned ? dt : -dt * .45);
  g.charge = Math.max(0, g.charge);
  if (g.aligned && Math.random() < dt * 14) burst(b.g.x ?? 160, b.g.y ?? 96, 1, '#fff0a0', 30);
  return g.charge >= (b.g.hold ?? 1.2);
}
function dialRender(g, b) {
  const cx = b.g.x ?? 160, cy = b.g.y ?? 96, r = 26, target = dialTarget(g, b);
  // The target wedge is drawn, not hidden - the player can see what they
  // are aiming at and how much slack the tolerance gives them.
  const t0 = target - b.g.tolerance, t1 = target + b.g.tolerance;
  poly([cx, cy, cx + Math.cos(t0) * (r + 8), cy + Math.sin(t0) * (r + 8), cx + Math.cos(t1) * (r + 8), cy + Math.sin(t1) * (r + 8)], { fill: g.aligned ? '#fff0a077' : '#c9975a44' });
  circle(cx, cy, r + 8, { stroke: g.aligned ? '#fff0a0' : '#5a4a3a', lineWidth: 1 });
  line(cx, cy, cx + Math.cos(g.angle) * r, cy + Math.sin(g.angle) * r, { stroke: g.aligned ? '#fff0a0' : '#c9975a', lineWidth: 3 });
  circle(cx, cy, 4, { fill: '#e8b923' });
  strip();
  meter(10, 6, 300, g.charge / (b.g.hold ?? 1.2), g.aligned ? '#fff0a0' : '#8a7a5a');
}

// --- lights: repeat the order the bog shows you -------------------------
// Was: guess a permutation stored in data.js with no way to learn it. Now
// the marsh-fire plays the safe order first and replays it after a
// mistake, so it is a memory test the player can actually pass.
function lightsInit(b) {
  return { seq: b.g.seq, step: 0, cursor: 0, show: 0, showT: 0, flash: -1, wake: 0, n: b.g.lights ?? 3 };
}
function lightsUpdate(g, b, dt, input) {
  // Demonstration: one light at a time, then a beat of silence.
  if (g.show < g.seq.length) {
    g.showT += dt;
    g.flash = g.showT % .52 < .34 ? g.seq[g.show] : -1;
    if (g.showT >= .52) { g.showT = 0; g.show++; if (g.show < g.seq.length) sfxHit(); }
    return false;
  }
  g.flash = -1;
  if (input.pressLeft) g.cursor = (g.cursor - 1 + g.n) % g.n;
  if (input.pressRight) g.cursor = (g.cursor + 1) % g.n;
  if (input.act) {
    if (g.cursor === g.seq[g.step]) {
      g.step++;
      sfxHit();
      kick(.4);
      burst(70 + g.cursor * 60, 96, 8, '#e8b923', 60);
      if (g.step >= g.seq.length) return true;
    } else {
      // The bog stirs, and shows the order once more.
      g.wake++;
      g.step = 0;
      g.show = 0;
      g.showT = 0;
      kick(1.5);
      sfxNo();
      burst(70 + g.cursor * 60, 96, 10, '#6a8a5a', 70);
    }
  }
  return false;
}
function lightsRender(g) {
  for (let i = 0; i < g.n; i++) {
    const x = 70 + i * 60, lit = i === g.flash, done = g.show >= g.seq.length && i === g.cursor;
    circle(x, 96, lit ? 13 : 9, { fill: lit ? '#ffd76a' : '#e86b52', stroke: done ? '#fff' : '#556', lineWidth: 2 });
    if (lit) circle(x, 96, 17, { stroke: '#ffd76a88', lineWidth: 2 });
  }
  strip();
  pips(10, 8, g.seq.length, g.show >= g.seq.length ? g.step : 0, '#e8b923', '#2a3a4a');
  meter(240, 6, 70, g.wake / 4, '#6a8a5a');
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

  // On the ground over a gap: a stumble. Costs ground, lets the collapse in.
  if (g.y <= 0 && b.g.gaps.some((p) => Math.abs(g.d - p) < (b.g.width ?? .035))) {
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

export const GAMES = {
  icerain: { init: icerainInit, update: icerainUpdate, render: icerainRender, hint: '← → move    SPACE strike' },
  dial: { init: dialInit, update: dialUpdate, render: dialRender, hint: '← → steer - hold it steady to charge' },
  lights: { init: lightsInit, update: lightsUpdate, render: lightsRender, hint: '← → choose    SPACE silence' },
  chase: { init: chaseInit, update: chaseUpdate, render: chaseRender, hint: 'SPACE jump - you cannot stop running' },
};

// Seven Strands - the coaster chase. The braid bolted onto a rollercoaster
// net twisted through the night sky; the unicorn rides the rails after it.
// The loop: gather the seven colours IN ORDER (each raises your top speed
// and surges you forward) - only a full rainbow can hold the braid, which
// bursts free of empty hooves. Corkscrews roll the world, the camera rolls
// with it, and the score tells you how close you are before your eyes do.

import { initGL, frameGL, mode as glMode, createMesh, updateMesh, drawMesh, perspective, lookAt, mul, modelTR, modelFrame, IDENT, pushBox } from './gl.js';
import { S, genGraph, bfs } from './maze.js';
import { trackMeshes, makeRider, ride, nbrs, behind, ahead, frame as tframe } from './track.js';
import { unicornMesh, headMesh, PIVOT, RAINBOW } from './uni.js';
import { makeBraid, updateBraid, braidVerts } from './ribbon.js';

const VW = 640, VH = 360;
const FOG = [.035, .03, .08];
const d3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

const glc = document.getElementById('c');
glc.width = VW;
glc.height = VH;
initGL(glc);

// HUD overlay: wrap the GL canvas so absolute positioning is relative to it.
const wrap = document.createElement('div');
wrap.style.position = 'relative';
glc.parentNode.insertBefore(wrap, glc);
wrap.appendChild(glc);
const hud = document.createElement('canvas');
hud.width = VW;
hud.height = VH;
hud.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%';
wrap.appendChild(hud);
const ctx = hud.getContext('2d');

function resize() {
  const sc = Math.min(innerWidth / VW, innerHeight / VH);
  glc.style.width = VW * sc + 'px';
  glc.style.height = VH * sc + 'px';
}
addEventListener('resize', resize);
resize();

// --- input ----------------------------------------------------------------
const held = {};
let acted = false, devSpec = false;
addEventListener('keydown', (e) => {
  held[e.key] = true;
  if (e.key === ' ' || e.key === 'Enter') acted = true;
  // Dev-only spectate toggle - a toggle, not a hold, because the headless
  // harness screenshots after keyup.
  if (DEV && e.key === 'o') devSpec = !devSpec;
});
addEventListener('keyup', (e) => { held[e.key] = false; });
hud.addEventListener('pointerdown', () => { acted = true; });
const heldFwd = () => held.ArrowUp || held.w;
const heldBack = () => held.ArrowDown || held.s;
const turnDir = () => (held.ArrowLeft || held.a ? 1 : 0) - (held.ArrowRight || held.d ? 1 : 0);

// --- audio: one tone primitive + a lookahead step sequencer ---------------
let ac;
function tone(f, dur, type, gain, t0) {
  if (!ac) return;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type;
  o.frequency.value = f;
  t0 = t0 || ac.currentTime;
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(.001, t0 + dur);
  o.connect(g);
  g.connect(ac.destination);
  o.start(t0);
  o.stop(t0 + dur);
}
function kick(t0) {
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = 'triangle';
  o.frequency.setValueAtTime(150, t0);
  o.frequency.exponentialRampToValueAtTime(44, t0 + .12);
  g.gain.setValueAtTime(.17, t0);
  g.gain.exponentialRampToValueAtTime(.001, t0 + .15);
  o.connect(g);
  g.connect(ac.destination);
  o.start(t0);
  o.stop(t0 + .16);
}

// The score is the instrument panel: kick+bass always, hats and a saw arp
// wake with speed (116->168 BPM), a pentatonic lead fades in as the tail
// gets close, and a bright counter-voice grows with each colour gathered.
const NOTE = (s) => 110 * 2 ** (s / 12);
const BASS = [0, 0, 12, 0, 3, 3, 15, 3, 5, 5, 17, 5, 7, 7, 10, 3];
const LEAD = [24, 22, 19, 17, 15, 17, 19, 22, 12, 15, 17, 19, 22, 24, 27, 24,
  19, 17, 15, 12, 10, 12, 15, 17, 19, 17, 15, 12, 15, 19, 22, 24];
let nextT = 0, step = 0;
function pump(speedN, closeN) {
  if (!ac) return;
  if (nextT < ac.currentTime) nextT = ac.currentTime + .05;
  while (nextT < ac.currentTime + .16) {
    const s = step % 32;
    if (s % 4 === 0) { kick(nextT); beat = 1; }   // the head nods on this
    if (s % 4 === 2) tone(6200, .03, 'square', .012 + speedN * .035, nextT);
    if (s % 2 === 0) tone(NOTE(BASS[(s >> 1) % 16]), .16, 'square', .05, nextT);
    if (speedN > .2) tone(NOTE(BASS[s % 16] + 12), .06, 'sawtooth', .015 + speedN * .03, nextT);
    if (closeN > .02) tone(NOTE(LEAD[s]), .2, 'triangle', .02 + closeN * .08, nextT);
    if (colors > 0) tone(NOTE(LEAD[(s + 8) % 32] + 12), .09, 'square', .006 + colors / 7 * .04, nextT);
    nextT += 15 / (116 + speedN * 52);
    step++;
  }
}

// --- round state ----------------------------------------------------------
let mode = 'title', round = 0, timer = 0, best = 0;
let g, roadM, railM, groundM, braid, braidM, dists, bfsT = 0;
let shards = [], colors = 0, surge = 0, slipT = 0, forkKick = 0;
// `lane` is the racing line: -1 hard left, +1 hard right of the channel.
// The fork is decided by WHERE YOU ARE when you cross the node, not by what
// you were pressing at that instant - so the whole approach is the decision
// window and you can drift across at your leisure.
const player = { r: null, speed: 10, lane: 0 };
const cam = { x: 0, y: 3, z: -5, u: [0, 1, 0] };
const uniM = unicornMesh();
const headM = headMesh();
let vp = null, beat = 0, lean = 0, camT = null, camU = null, speedSm = 0, fovSm = 1.03, clSm = 1;
const camTv = [0, 0, 0], camUv = [0, 0, 0];

// Steering only matters at forks: hold left/right while crossing a node and
// the leftmost/rightmost branch is taken; hands off takes the straightest.
// Pure, so the HUD can PREVIEW the branch the current input would take.
function pickBranch(c, st, T, A) {
  if (c.length === 1) return c[0];
  const h = Math.hypot(T[0], T[2]) || 1;
  const d = [T[0] / h, T[2] / h];
  let bestC = c[0], bv = -1e9;
  for (const m of c) {
    const M = g.pos[m[0]][m[1]];
    let ex = M[0] - A[0], ez = M[2] - A[2];
    const l = Math.hypot(ex, ez) || 1;
    ex /= l; ez /= l;
    const ang = Math.atan2(d[1] * ex - d[0] * ez, d[0] * ex + d[1] * ez);
    const v = st > 0 ? ang : st < 0 ? -ang : -Math.abs(ang);
    if (v > bv) { bv = v; bestC = m; }
  }
  return bestC;
}
const laneSteer = () => (player.lane > .18 ? 1 : player.lane < -.18 ? -1 : 0);
const chooseP = (c) => pickBranch(c, laneSteer(), player.r.tan, g.pos[player.r.a[0]][player.r.a[1]]);

// Seven colour shards, placed in order of BFS distance from the start, so
// the sequence red->violet pulls the player across the whole net - the
// collecting IS the learning of the knots.
function placeShards() {
  const n = g.n, dd = bfs(g, n - 1, n - 1);
  let maxd = 0;
  for (let x = 0; x < n; x++) for (let z = 0; z < n; z++) maxd = Math.max(maxd, dd[x][z]);
  shards = [];
  const used = new Set([(n - 1) + ',' + (n - 1)]);
  for (let i = 0; i < 7; i++) {
    const want = (i + 1) * maxd / 8;
    let bn = null, bv = 1e9;
    for (let x = 0; x < n; x++) for (let z = 0; z < n; z++) {
      if (used.has(x + ',' + z)) continue;
      const v = Math.abs(dd[x][z] - want) + Math.random();
      if (v < bv) { bv = v; bn = [x, z]; }
    }
    used.add(bn.join(','));
    // Additive boxes SUM their front and back faces, so alpha 1 clamps
    // every colour to white - that is why the shards all read white. Low
    // alpha on the glow, a solid-ish core, and the colour survives.
    const c = RAINBOW[i].map((v) => v * 1.9), m = [];
    pushBox(m, 0, 3, 0, .34, 6, .34, ...c, .16);      // light column
    pushBox(m, 0, 1.5, 0, 1.5, 1.5, 1.5, ...c, .12);  // halo
    pushBox(m, 0, 1.5, 0, .6, .6, .6, ...c, .5);      // the shard itself
    shards.push({ node: bn, mesh: createMesh(m) });
  }
  colors = 0;
}

function newRound() {
  const n = 6 + round;
  g = genGraph(n);
  const tm = trackMeshes(g);
  roadM = createMesh(tm.road);
  railM = createMesh(tm.rail);
  const L = n * S, gr = [];
  // Night moor far below the net - depth cue, not a floor you can reach.
  pushBox(gr, L / 2, -15, L / 2, L * 6, .2, L * 6, .04, .035, .08);
  groundM = createMesh(gr);
  player.r = makeRider(g, [n - 1, n - 1]);
  player.speed = 10;
  player.lane = 0;
  braid = makeBraid(g, [0, 0]);
  braidM = createMesh(braidVerts(braid, 0), true);
  dists = bfs(g, n - 1, n - 1);
  placeShards();
  surge = 0; slipT = 0;
  ride(g, player.r, .01, chooseP);
  const T = player.r.tan, h = Math.hypot(T[0], T[2]) || 1;
  cam.x = player.r.pos[0] - T[0] / h * 5.4;
  cam.y = player.r.pos[1] + 2.4;
  cam.z = player.r.pos[2] - T[2] / h * 5.4;
  cam.u = [0, 1, 0];
  timer = 0;
}

// Wake plume: a low rainbow flare that rides WITH the braid down its
// channel - a pillar into the sky told you where it was but not which
// track it was on, which is the one thing this game must never give away.
const pillar = [];
RAINBOW.forEach((c, i) => pushBox(pillar, 0, .5 + i * .28, -i * .5, 3.4 - i * .3, .22, .5, ...c.map((v) => v * 1.8), .5));
const pillarM = createMesh(pillar);
// Fork marker: a small glowing diamond dropped on the branch the current
// steering input will take - the choice is visible before it is made.
const mark = [];
pushBox(mark, 0, .6, 0, .9, .9, .9, 1.2, 1, .5, .4);
const markM = createMesh(mark);
// Hoof wake: rainbow streaks that stretch behind under boost. Drawn in the
// rider's own frame, so they lie in the channel through every corkscrew.
const wake = [];
// Seven thin streaks, low and well behind: additive overlap blows straight
// to white, so alpha stays small and the colours stay readable.
RAINBOW.forEach((c, i) => pushBox(wake, (i - 3) * .19, .16, -2.5, .09, .09, 3.2, ...c.map((v) => v * 1.5), .1));
const wakeM = createMesh(wake);

// Project a world point to screen space; wc<=0 means behind the camera.
function project(w) {
  const x = vp[0] * w[0] + vp[4] * w[1] + vp[8] * w[2] + vp[12];
  const y = vp[1] * w[0] + vp[5] * w[1] + vp[9] * w[2] + vp[13];
  const wc = vp[3] * w[0] + vp[7] * w[1] + vp[11] * w[2] + vp[15];
  return [x / wc * VW / 2 + VW / 2, -y / wc * VH / 2 + VH / 2, wc];
}

// Edge-of-screen arrow toward an off-screen target, in its own colour.
function edgeArrow(w, col) {
  const [sx, sy, wc] = project(w);
  const on = wc > 0 && sx > 0 && sx < VW && sy > 0 && sy < VH;
  if (on) return;
  let dx = sx - VW / 2, dy = sy - VH / 2;
  if (wc < 0) { dx = -dx; dy = -dy; }
  const l = Math.hypot(dx, dy) || 1;
  dx /= l; dy /= l;
  const px = VW / 2 + dx * (VW / 2 - 26), py = VH / 2 + dy * (VH / 2 - 26);
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(Math.atan2(dy, dx));
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(10, 0); ctx.lineTo(-6, -7); ctx.lineTo(-6, 7);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

let last = 0;
function frame(now) {
  const dt = Math.min(.05, (now - last) / 1000 || 0);
  last = now;
  const doAct = acted;
  acted = false;

  let speedN = 0, closeN = 0;
  if (mode === 'run') {
    timer += dt;
    surge = Math.max(0, surge - dt / 1.4);
    slipT = Math.max(0, slipT - dt);
    forkKick = Math.max(0, forkKick - dt * 3);
    // Boost / brake / cruise. The TOP speed is earned: each gathered colour
    // raises it, each pickup surges past it. And gravity along the tangent:
    // dives feed speed, climbs bleed it.
    const top = 22 + colors * 2;
    const target = heldFwd() ? top : heldBack() ? 7 : 13;
    player.speed += (target - player.speed) * Math.min(1, dt * (heldBack() ? 3 : 1.2));
    player.speed -= player.r.tan[1] * dt * 16;
    player.speed = Math.max(6, Math.min(top + surge * 8, player.speed));
    // Slide across the channel; let go and it eases back toward the middle.
    const st = turnDir();
    if (st) player.lane += st * dt * 2.2;
    else player.lane -= Math.sign(player.lane) * Math.min(Math.abs(player.lane), dt * .7);
    player.lane = Math.max(-1, Math.min(1, player.lane));
    const prevA = player.r.a;
    ride(g, player.r, player.speed * dt, chooseP);
    // Only a real fork pops the view; every node doing it was a hitch.
    if (player.r.a !== prevA && nbrs(g, player.r.a[0], player.r.a[1]).length > 2) forkKick = 1;

    // braid flees against fresh BFS-from-player, recomputed on a short clock
    bfsT -= dt;
    if (bfsT <= 0) {
      bfsT = .3;
      const cell = player.r.t < .5 || !player.r.b ? player.r.a : player.r.b;
      dists = bfs(g, cell[0], cell[1]);
    }
    updateBraid(g, braid, dists, player.r.pos, dt, colors === 7);
    updateMesh(braidM, braidVerts(braid, now / 1000));

    // colour pickup: the next shard in rainbow order
    if (colors < 7) {
      const sh = shards[colors];
      if (d3(player.r.pos, g.pos[sh.node[0]][sh.node[1]]) < 3.4) {
        tone(392 * 2 ** (colors / 7), .5, 'triangle', .12);
        colors++;
        surge = 1;
      }
    }

    speedN = (player.speed - 6) / 32;
    // The camera must NOT track instantaneous speed. Gravity along the
    // track makes real speed rise and fall with every crest and dip, so a
    // FOV (or boom length) wired straight to it pumps the whole image a
    // couple of times a second - the single biggest reason the ride read as
    // unsmooth. This lags by about two thirds of a second: it answers a
    // sustained boost and ignores the terrain ripple.
    speedSm += (speedN - speedSm) * Math.min(1, dt * 1.5);
    const tail = braid.trail[0];
    if (tail) {
      const td = d3(player.r.pos, tail);
      closeN = Math.max(0, 1 - td / 34);
      if (!(DEV && devSpec) && td < 2.8) {
        if (colors === 7) {
          mode = 'won';
          best = best === 0 ? timer : Math.min(best, timer);
          RAINBOW.forEach((_, i) => tone(392 * 2 ** (i / 7), .3, 'triangle', .1, ac && ac.currentTime + i * .09));
        } else if (braid.burst <= 0) {
          // Empty hooves: it tears free. The rainbow is the key.
          braid.burst = 1.4;
          slipT = 3;
          tone(180, .4, 'sawtooth', .1);
        }
      }
    }
    pump(speedN, closeN);
  }

  if (doAct) {
    if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
    if (mode === 'title') { newRound(); mode = 'run'; }
    else if (mode === 'won') { round++; newRound(); mode = 'run'; }
  }

  // --- camera: full frame follow, rolls with the track --------------------
  let p = [0, 0, 0], T = [0, 0, 1], up = [0, 1, 0];
  if (player.r) {
    p = player.r.pos; T = player.r.tan;
    if (player.r.b) [p, T, , up] = tframe(g, player.r.a, player.r.b, player.r.t);
  }
  // Per-edge tangents cannot be smooth for every pair of edges at a
  // junction - two branches leaving the same node simply point different
  // ways - so crossing a sharp one snaps the frame in a single step
  // (measured: up to 88 degrees, against a 99th percentile of 3.7). Ease
  // ONLY those: small changes pass through untouched, so normal motion has
  // no lag at all and a corkscrew still rolls at full rate.
  // A RATE LIMIT, not a blend-past-a-threshold. The threshold version of
  // this jittered badly: under it the frame snapped exactly to the target,
  // over it the frame lerped 15% of the way, so around the boundary - which
  // is precisely where a corkscrew's roll rate sits - it alternated between
  // the two every frame and sawtoothed. A rate limit is continuous at its
  // own boundary: at exactly maxStep the clamped result IS the target.
  // Critically damped spring, not a rate clamp. A clamp is continuous in
  // value but its VELOCITY switches on and off the instant the threshold is
  // crossed, and a velocity step is exactly what "jerk" means - the live
  // probe showed eye accelerations past 1700 u/s^2 from that alone. A spring
  // is smooth in both, and criticaly damped it never overshoots.
  const K = 9;
  const ease = (cur, vel, want) => {
    if (!cur) return [...want];
    for (let i = 0; i < 3; i++) {
      vel[i] += ((want[i] - cur[i]) * K * K - 2 * K * vel[i]) * dt;
      cur[i] += vel[i] * dt;
    }
    const l = Math.hypot(cur[0], cur[1], cur[2]) || 1;
    cur[0] /= l; cur[1] /= l; cur[2] /= l;
    return cur;
  };
  if (mode === 'title' || !player.r) { camT = null; camU = null; }
  const upT = up;                                // unsmoothed track up
  camT = ease(camT, camTv, T); camU = ease(camU, camUv, up);
  T = camT; up = camU;
  // Over-the-withers, not a drone: tight behind and barely above the head,
  // so the horn sits in frame and the track fills the screen. Boosting
  // pulls it in and down - the head drops and the camera drops with it.
  // ON THE RAILS: the eye sits at a point of TRACK a fixed distance behind,
  // lifted along that point's own up. A world-space lerp toward an offset
  // from the rider cannot survive a corkscrew - the target orbits a full
  // turn and the lag flings the camera off the track. This is rigid, so the
  // roll is exact and the channel always frames the shot.
  // high must clear the banked lips (1.5) or they wall the view off.
  const high = 2.0 - speedSm * .15;
  lean += (turnDir() * .1 - lean) * Math.min(1, dt * 4);
  const sideL = [T[1] * up[2] - T[2] * up[1], T[2] * up[0] - T[0] * up[2], T[0] * up[1] - T[1] * up[0]];
  const bf = player.r && player.r.b ? behind(g, player.r, 2.3 + speedSm * .7) : null;
  const bp = bf ? bf[0] : [p[0] - T[0] * 2.3, p[1] - T[1] * 2.3, p[2] - T[2] * 2.3];
  // Sit at the point behind, but lift along the RIDER's up, not that
  // point's. Mid-corkscrew the two are rolled apart by a big angle, and
  // lifting along the trailing point's up walks the camera around the tube
  // and straight into the deck.
  // The spring deliberately lags the roll, which keeps junction kinks from
  // jolting the eye - but a lagged up vector also swings the boom sideways
  // and drops the camera toward the deck through a corkscrew. Lengthen the
  // boom by exactly the lag's cosine and it keeps its height off the track
  // while still rolling smoothly.
  // ...and the compensation itself gets low-passed, or it becomes the very
  // thing it is fixing: the lag cosine drops sharply at a junction, and an
  // unfiltered boom length tracking it put the spikes straight back.
  const cl = Math.max(.55, camT ? up[0] * upT[0] + up[1] * upT[1] + up[2] * upT[2] : 1);
  clSm += (cl - clSm) * Math.min(1, dt * 4);
  const lift = high / Math.max(.55, clSm);
  cam.x = bp[0] + up[0] * lift; cam.y = bp[1] + up[1] * lift; cam.z = bp[2] + up[2] * lift;
  cam.u = up;
  const lo = player.r ? player.lane * 1.6 : 0;
  let eye = [cam.x + sideL[0] * (lean + lo), cam.y + sideL[1] * (lean + lo), cam.z + sideL[2] * (lean + lo)];
  // Aim at a point of TRACK ahead, not down the straight tangent: the
  // tangent leaves the road on every bend (which threw the rider
  // off-centre), while a short tangent aim points the camera at the floor.
  // Predict with the RIDER's tangent, exactly what chooseP uses. Predicting
  // with the camera's smoothed tangent instead let the two disagree near a
  // node, and when they did, the aim point teleported from one branch to the
  // other as the node went by - a 152-degree view flip in a single frame.
  const af = player.r ? ahead(g, player.r, 9, (c) =>
    pickBranch(c, laneSteer(), player.r.tan, g.pos[player.r.b[0]][player.r.b[1]])) : null;
  const ap = af ? af[0] : [p[0] + T[0] * 9, p[1] + T[1] * 9, p[2] + T[2] * 9];
  const au = up;
  let at = [ap[0] + au[0] * 1.7 + sideL[0] * lo, ap[1] + au[1] * 1.7 + sideL[1] * lo, ap[2] + au[2] * 1.7 + sideL[2] * lo];
  let cu = cam.u.map((v, i) => v - sideL[i] * lean * .55);
  if (DEV && devSpec && mode === 'run' && braid.trail.length > 4) {
    const e = braid.trail[0];
    eye = [e[0], e[1] + 2.5, e[2]];
    at = [...braid.r.pos];
    cu = [0, 1, 0];
  }
  // Speed widens the world: FOV kick is most of what "fast" feels like.
  // ONE low-pass on the finished field of view, which catches every source
  // of a step at once: surge is set to 1 the instant a colour is taken and
  // forkKick to 1 the instant a fork is crossed, and each of those was a
  // visible pop - measured at 103 deg/s per fork and 620 deg/s per pickup,
  // recurring every couple of seconds. Filter the result, not each cause.
  fovSm += (1.03 + speedSm * .3 + surge * .18 + forkKick * .04 - fovSm) * Math.min(1, dt * 6);
  const fov = fovSm;
  // Dev only: publish the real camera so tools/test-camlive.mjs can measure
  // the actual ride - lane, lean, FOV and all - instead of a Node replica of
  // it. Compiled out of every shipping build.
  if (DEV) (window.__cam = window.__cam || []).push([now, eye[0], eye[1], eye[2], at[0], at[1], at[2], fov, cu[0], cu[1], cu[2]]);
  vp = mul(perspective(fov, VW / VH, .1, 160), lookAt(eye, at, cu));
  frameGL(vp, eye, FOG);

  if (mode !== 'title') {
    drawMesh(groundM, IDENT);
    const bob = Math.abs(Math.sin(now / 1000 * 11)) * Math.min(1, player.speed / 14) * .1;
    const sideV = sideL;
    const S8 = .85, lx = player.lane * 2;
    const base = [
      p[0] + up[0] * (bob + .04) + sideV[0] * lx,
      p[1] + up[1] * (bob + .04) + sideV[1] * lx,
      p[2] + up[2] * (bob + .04) + sideV[2] * lx,
    ];
    drawMesh(uniM, modelFrame(base, sideV, up, T, S8));
    // The head: tucked low into the wind when boosting, and nodding to the
    // kick the rest of the time, because the unicorn likes this track.
    beat = Math.max(0, beat - dt * 4.5);
    const duck = speedN * .42 + surge * .16;
    const nod = beat * beat * .34 * (1 - speedN * .5);
    const pitch = duck + nod;
    const sway = Math.sin(now / 460) * .12 * (1 - speedN * .6) + turnDir() * -.18;
    const cp = Math.cos(pitch), sp = Math.sin(pitch), cs = Math.cos(sway), ss = Math.sin(sway);
    // head frame = body frame, rotated about side (pitch) then up (sway)
    const hZ = [T[0] * cp - up[0] * sp, T[1] * cp - up[1] * sp, T[2] * cp - up[2] * sp];
    const hY = [T[0] * sp + up[0] * cp, T[1] * sp + up[1] * cp, T[2] * sp + up[2] * cp];
    const hX = sideV;
    const fZ = [hZ[0] * cs - hX[0] * ss, hZ[1] * cs - hX[1] * ss, hZ[2] * cs - hX[2] * ss];
    const fX = [hX[0] * cs + hZ[0] * ss, hX[1] * cs + hZ[1] * ss, hX[2] * cs + hZ[2] * ss];
    const hp = [
      base[0] + (sideV[0] * PIVOT[0] + up[0] * PIVOT[1] + T[0] * PIVOT[2]) * S8,
      base[1] + (sideV[1] * PIVOT[0] + up[1] * PIVOT[1] + T[1] * PIVOT[2]) * S8,
      base[2] + (sideV[2] * PIVOT[0] + up[2] * PIVOT[1] + T[2] * PIVOT[2]) * S8,
    ];
    drawMesh(headM, modelFrame(hp, fX, hY, fZ, S8));
    // Deck after the solids so it blends over them, before the glow.
    glMode(2);
    drawMesh(roadM, IDENT);
    glMode(1);
    drawMesh(railM, IDENT);
    drawMesh(braidM, IDENT);
    // hoof wake, stretched by speed - the visual receipt for the throttle
    if (speedN > .25) {
      const st = .5 + speedN * 1.8 + surge;
      drawMesh(wakeM, modelFrame(base, sideV, up, [T[0] * st, T[1] * st, T[2] * st], S8));
    }
    if (colors < 7 && mode === 'run') {
      const sh = shards[colors], sp = g.pos[sh.node[0]][sh.node[1]];
      drawMesh(sh.mesh, modelTR(sp[0], sp[1], sp[2], now / 350));
    }
    // wake plume, laid in the braid's own channel so it reads as something
    // racing a track rather than a marker floating in the sky
    if (mode === 'run' && braid.r.b) {
      const [bp, bt, bs, bu] = tframe(g, braid.r.a, braid.r.b, braid.r.t);
      drawMesh(pillarM, modelFrame(bp, bs, bu, bt, 1));
    }
    // fork preview: a gold diamond on the branch this input would take
    if (mode === 'run' && player.r.b && player.r.t > .1) {
      const cand = nbrs(g, player.r.b[0], player.r.b[1]).filter((m) => m[0] !== player.r.a[0] || m[1] !== player.r.a[1]);
      if (cand.length > 1) {
        const ch = pickBranch(cand, laneSteer(), T, g.pos[player.r.b[0]][player.r.b[1]]);
        const [mp] = tframe(g, player.r.b, ch, .22);
        drawMesh(markM, modelTR(mp[0], mp[1], mp[2], now / 180, .8 + Math.sin(now / 90) * .2));
      }
    }
    glMode(0);
  }

  // --- HUD ----------------------------------------------------------------
  ctx.clearRect(0, 0, VW, VH);
  ctx.textAlign = 'center';
  if (mode === 'title') {
    ctx.fillStyle = '#0a0714';
    ctx.fillRect(0, 0, VW, VH);
    RAINBOW.forEach(([r, gg, b], i) => {
      ctx.fillStyle = `rgb(${r * 255},${gg * 255},${b * 255})`;
      ctx.fillRect(0, 96 + i * 7, VW, 5);
    });
    ctx.fillStyle = '#f3ead6';
    ctx.font = 'bold 34px system-ui';
    ctx.fillText('SEVEN STRANDS', VW / 2, 78);
    ctx.font = '13px system-ui';
    ctx.fillStyle = '#b8ab92';
    ctx.fillText('The braid bolted onto the coaster net. Only a full rainbow can hold it:', VW / 2, 166);
    ctx.fillText('gather the seven colours IN ORDER - each one makes you faster.', VW / 2, 186);
    ctx.fillStyle = '#7a6e5c';
    ctx.fillText('↑ boost   ↓ brake   ← → slide across the track', VW / 2, 224);
    ctx.fillText('whichever side you are on when you cross a node picks the branch', VW / 2, 242);
    ctx.fillStyle = '#e8b923';
    ctx.fillText('press SPACE', VW / 2, 264);
  } else {
    // speed blur: radial streaks + vignette, scaling with velocity - the
    // 2D overlay is the whole post-processing budget, and it is enough.
    const blur = Math.max(0, speedN - .35) + surge * .5;
    if (blur > 0 && mode === 'run') {
      ctx.strokeStyle = `rgba(255,255,255,${Math.min(.4, blur * .4)})`;
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 24; i++) {
        // Fixed angles per streak, not fresh randoms every frame: re-rolling
        // them each frame is white noise, and white noise reads as judder.
        const an = i * 2.399, r0 = 104 + (i % 5) * 13, r1 = r0 + 30 + blur * 160;
        ctx.beginPath();
        ctx.moveTo(VW / 2 + Math.cos(an) * r0, VH / 2 + Math.sin(an) * r0 * .62);
        ctx.lineTo(VW / 2 + Math.cos(an) * r1, VH / 2 + Math.sin(an) * r1 * .62);
        ctx.stroke();
      }
      const vg = ctx.createRadialGradient(VW / 2, VH / 2, VH * .42, VW / 2, VH / 2, VH * .78);
      vg.addColorStop(0, 'rgba(8,5,18,0)');
      vg.addColorStop(1, `rgba(8,5,18,${Math.min(.55, blur * .6)})`);
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, VW, VH);
    }

    ctx.font = '14px system-ui';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#f3ead6';
    ctx.fillText(timer.toFixed(1) + 's', 12, 22);
    ctx.fillText(Math.round(player.speed * 9) + ' km/h', 12, 42);
    if (round > 0) ctx.fillText('net ' + (round + 1), 12, 62);

    // the rainbow meter: seven slots, filled in order, current one pulsing
    for (let i = 0; i < 7; i++) {
      const [r, gg, b] = RAINBOW[i];
      const on = i < colors;
      ctx.fillStyle = on ? `rgb(${r * 255},${gg * 255},${b * 255})` : 'rgba(120,110,140,.35)';
      const pu = i === colors ? Math.sin(now / 150) * 2 : 0;
      ctx.fillRect(VW / 2 - 63 + i * 18, 12 - pu / 2, 14, 8 + pu);
    }

    if (mode === 'run') {
      // guidance arrows: rainbow chevron to the braid, coloured to the shard
      const tail = braid.trail[0];
      if (tail) edgeArrow(tail, '#fff');
      if (colors < 7) {
        const sp = g.pos[shards[colors].node[0]][shards[colors].node[1]];
        const [r, gg, b] = RAINBOW[colors];
        edgeArrow([sp[0], sp[1] + 4, sp[2]], `rgb(${r * 255},${gg * 255},${b * 255})`);
      }
      // Lane gauge: where you are across the channel, always visible, with
      // the branch that position currently selects lit. The decision is a
      // place you drive to, so the readout is a position, not a keypress.
      const gw = 150, gy = VH - 30;
      ctx.fillStyle = 'rgba(160,150,130,.22)';
      ctx.fillRect(VW / 2 - gw / 2, gy - 3, gw, 6);
      const lst = laneSteer();
      for (const [sx, dir] of [[-1, 1], [0, 0], [1, -1]]) {
        ctx.fillStyle = lst === dir ? '#e8b923' : 'rgba(160,150,130,.32)';
        ctx.fillRect(VW / 2 + sx * gw / 2 - 2, gy - 9, 4, 18);
      }
      ctx.fillStyle = '#f3ead6';
      ctx.beginPath();
      ctx.arc(VW / 2 - player.lane * gw / 2, gy, 6, 0, 7);
      ctx.fill();
      if (player.r.b && nbrs(g, player.r.b[0], player.r.b[1]).length > 2 && player.r.t > .1) {
        ctx.textAlign = 'center';
        ctx.font = 'bold 13px system-ui';
        ctx.fillStyle = '#e8b923';
        ctx.fillText('FORK', VW / 2, gy - 18);
      }
      if (slipT > 0) {
        ctx.textAlign = 'center';
        ctx.fillStyle = '#e8b923';
        ctx.font = 'bold 15px system-ui';
        ctx.fillText('It tears free! Gather all seven colours to hold it.', VW / 2, 90);
      }
    }

    if (mode === 'won') {
      ctx.textAlign = 'center';
      ctx.fillStyle = '#00000088';
      ctx.fillRect(0, VH / 2 - 58, VW, 116);
      ctx.fillStyle = '#e8b923';
      ctx.font = 'bold 26px system-ui';
      ctx.fillText('CAUGHT THE BRAID!', VW / 2, VH / 2 - 18);
      ctx.font = '14px system-ui';
      ctx.fillStyle = '#f3ead6';
      ctx.fillText(timer.toFixed(1) + 's' + (best < timer ? '   (best ' + best.toFixed(1) + 's)' : '   new best!'), VW / 2, VH / 2 + 10);
      ctx.fillStyle = '#b8ab92';
      ctx.fillText('SPACE - a wider net', VW / 2, VH / 2 + 38);
    }
  }

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

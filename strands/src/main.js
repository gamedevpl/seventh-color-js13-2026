// Seven Strands - the second Seventh Color entry, pivoted into a coaster
// chase. The braid bolted onto a rollercoaster net twisted through the
// night sky: a braided maze whose corridors are hermite track segments.
// The player rides rails at speed, picks a branch at every fork, and can
// SEE the braid glowing somewhere out there - but never quite which route
// leads to it. The score is adaptive: drums and bass always, an arp that
// wakes with speed, a lead that sings as the tail gets close.

import { initGL, frameGL, additive, createMesh, updateMesh, drawMesh, perspective, lookAt, mul, modelTR, IDENT, pushBox } from './gl.js';
import { S, genGraph, bfs } from './maze.js';
import { trackMeshes, makeRider, ride, nbrs } from './track.js';
import { unicornMesh, RAINBOW } from './uni.js';
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

// The score is three layers over a kick: bass always, an octave-up saw arp
// that wakes with speed (and the whole thing accelerates 116->168 BPM),
// and a pentatonic lead that fades in as the tail gets close - the music
// IS the proximity meter.
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
    if (s % 4 === 0) kick(nextT);
    if (s % 4 === 2) tone(6200, .03, 'square', .012 + speedN * .035, nextT);
    if (s % 2 === 0) tone(NOTE(BASS[(s >> 1) % 16]), .16, 'square', .05, nextT);
    if (speedN > .2) tone(NOTE(BASS[s % 16] + 12), .06, 'sawtooth', .015 + speedN * .03, nextT);
    if (closeN > .02) tone(NOTE(LEAD[s]), .2, 'triangle', .02 + closeN * .08, nextT);
    nextT += 15 / (116 + speedN * 52);
    step++;
  }
}

// --- round state ----------------------------------------------------------
let mode = 'title', round = 0, timer = 0, best = 0;
let g, roadM, railM, groundM, braid, braidM, dists, bfsT = 0;
const player = { r: null, speed: 10 };
const cam = { x: 0, y: 3, z: -5 };
const uniM = unicornMesh();

// Steering only matters at forks: hold left/right while crossing a node and
// the leftmost/rightmost branch is taken; hands off takes the straightest.
function chooseP(c) {
  if (c.length === 1) return c[0];
  const T = player.r.tan, h = Math.hypot(T[0], T[2]) || 1;
  const d = [T[0] / h, T[2] / h];
  const A = g.pos[player.r.a[0]][player.r.a[1]];
  const st = turnDir();
  let bestC = c[0], bv = -1e9;
  for (const m of c) {
    const M = g.pos[m[0]][m[1]];
    let ex = M[0] - A[0], ez = M[2] - A[2];
    const l = Math.hypot(ex, ez) || 1;
    ex /= l; ez /= l;
    const dot = d[0] * ex + d[1] * ez, cr = d[1] * ex - d[0] * ez;
    const ang = Math.atan2(cr, dot);
    const v = st > 0 ? ang : st < 0 ? -ang : -Math.abs(ang);
    if (v > bv) { bv = v; bestC = m; }
  }
  return bestC;
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
  braid = makeBraid(g, [0, 0]);
  braidM = createMesh(braidVerts(braid, 0), true);
  dists = bfs(g, n - 1, n - 1);
  ride(g, player.r, .01, chooseP);
  const T = player.r.tan, h = Math.hypot(T[0], T[2]) || 1;
  cam.x = player.r.pos[0] - T[0] / h * 5.4;
  cam.y = player.r.pos[1] + 2.4;
  cam.z = player.r.pos[2] - T[2] / h * 5.4;
  timer = 0;
}

// Sparkle beacon over the braid when it is far - you should always have a
// bearing, just never a route.
const pillar = [];
RAINBOW.forEach((c, i) => pushBox(pillar, 0, 4 + i * 2, 0, .4, 1.9, .4, ...c));
const pillarM = createMesh(pillar);

let last = 0;
function frame(now) {
  const dt = Math.min(.05, (now - last) / 1000 || 0);
  last = now;
  const doAct = acted;
  acted = false;

  let speedN = 0, closeN = 0;
  if (mode === 'run') {
    timer += dt;
    // Boost / brake / cruise - and gravity along the track: dives feed
    // speed, climbs bleed it. The rollercoaster is a real one.
    const target = heldFwd() ? 30 : heldBack() ? 7 : 14;
    player.speed += (target - player.speed) * Math.min(1, dt * (heldBack() ? 3 : 1.2));
    player.speed -= player.r.tan[1] * dt * 16;
    player.speed = Math.max(6, Math.min(34, player.speed));
    ride(g, player.r, player.speed * dt, chooseP);

    // braid flees against fresh BFS-from-player, recomputed on a short clock
    bfsT -= dt;
    if (bfsT <= 0) {
      bfsT = .3;
      const cell = player.r.t < .5 || !player.r.b ? player.r.a : player.r.b;
      dists = bfs(g, cell[0], cell[1]);
    }
    updateBraid(g, braid, dists, player.r.pos, dt);
    updateMesh(braidM, braidVerts(braid, now / 1000));

    speedN = (player.speed - 6) / 28;
    const tail = braid.trail[0];
    if (tail) {
      const td = d3(player.r.pos, tail);
      closeN = Math.max(0, 1 - td / 34);
      if (!(DEV && devSpec) && td < 2.6) {
        mode = 'won';
        best = best === 0 ? timer : Math.min(best, timer);
        RAINBOW.forEach((_, i) => tone(392 * 2 ** (i / 7), .3, 'triangle', .1, ac && ac.currentTime + i * .09));
      }
    }
    pump(speedN, closeN);
  }

  if (doAct) {
    if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
    if (mode === 'title') { newRound(); mode = 'run'; }
    else if (mode === 'won') { round++; newRound(); mode = 'run'; }
  }

  // --- camera + draw ------------------------------------------------------
  const p = player.r ? player.r.pos : [0, 0, 0];
  const T = player.r ? player.r.tan : [0, 0, 1];
  const h = Math.hypot(T[0], T[2]) || 1;
  const dx = T[0] / h, dz = T[2] / h;
  const k = Math.min(1, dt * 5);
  cam.x += (p[0] - dx * 5.4 - cam.x) * k;
  cam.y += (p[1] + 2.4 - cam.y) * k;
  cam.z += (p[2] - dz * 5.4 - cam.z) * k;
  // Dev only, while O is held: spectate the braid from its own trail.
  if (DEV && devSpec && mode === 'run' && braid.trail.length > 4) {
    const e = braid.trail[0];
    cam.x = e[0]; cam.y = e[1] + 2.5; cam.z = e[2];
  }
  const eye = [cam.x, cam.y, cam.z];
  const at = DEV && devSpec && mode === 'run'
    ? [...braid.r.pos]
    : [p[0] + dx * 3.5, p[1] + .8 + T[1] * 3, p[2] + dz * 3.5];
  const vp = mul(perspective(1.1, VW / VH, .1, 110), lookAt(eye, at));
  frameGL(vp, eye, FOG);

  if (mode !== 'title') {
    drawMesh(groundM, IDENT);
    drawMesh(roadM, IDENT);
    const bob = Math.abs(Math.sin(now / 1000 * 11)) * Math.min(1, player.speed / 14) * .12;
    const yaw = Math.atan2(T[0], T[2]), pitch = -Math.atan2(T[1], h);
    drawMesh(uniM, modelTR(p[0], p[1] + bob + .05, p[2], yaw, .85, pitch));
    additive(true);
    drawMesh(railM, IDENT);
    drawMesh(braidM, IDENT);
    const pd = d3(p, braid.r.pos);
    if (pd > 40 && mode === 'run') {
      drawMesh(pillarM, modelTR(braid.r.pos[0], braid.r.pos[1] + Math.sin(now / 300) * .4, braid.r.pos[2], now / 400));
    }
    additive(false);
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
    ctx.fillText('The braid bolted onto the old coaster net above the moor.', VW / 2, 168);
    ctx.fillText('You can see it out there. Which track is it on?', VW / 2, 188);
    ctx.fillStyle = '#7a6e5c';
    ctx.fillText('↑ boost   ↓ brake   ← → choose a branch at every fork', VW / 2, 232);
    ctx.fillStyle = '#e8b923';
    ctx.fillText('press SPACE', VW / 2, 266);
  } else {
    ctx.font = '14px system-ui';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#f3ead6';
    ctx.fillText(timer.toFixed(1) + 's', 12, 22);
    ctx.fillText(Math.round(player.speed * 9) + ' km/h', 12, 42);
    if (round > 0) ctx.fillText('net ' + (round + 1), 12, 62);
    // Fork telegraph: arrows light up while a junction is incoming.
    if (mode === 'run' && player.r.b && nbrs(g, player.r.b[0], player.r.b[1]).length > 2 && player.r.t > .35) {
      ctx.textAlign = 'center';
      ctx.fillStyle = '#e8b923';
      ctx.font = 'bold 26px system-ui';
      ctx.fillText('❮      ❯', VW / 2, VH - 26);
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

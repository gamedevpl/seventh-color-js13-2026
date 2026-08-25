// RAINBOW SURFER. The run is physical now: speed is a RESOURCE. Stardust
// scattered on the deck feeds the boost; serpentines and corkscrews demand
// a minimum speed or you slide off; gaps demand momentum or you sink short
// of the far lip (an air-boost can save you - it burns stardust too);
// dives hand you speed for free. Catch the rainbow and BECOME it - as the
// rainbow the boost is free, the colours burn down instead, and a landed
// jump relights one. Score is how long you burned.

import { initGL, frameGL, mode as glMode, createMesh, updateMesh, drawMesh, perspective, lookAt, mul, modelFrame, IDENT, pushBox } from './gl.js';
import { S, makeCourse, depths } from './course.js';
import { trackMeshes, makeRider, ride, behind, ahead, placeAt, frame as tframe } from './track.js';
import { unicornMesh, headMesh, PIVOT, RAINBOW } from './uni.js';
import { makeBraid, updateBraid, makeTrail, feedTrail, nearTrail, trailVerts, BUF } from './ribbon.js';

const VW = 640, VH = 360;
const FOG = [.035, .03, .08];
const d3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

const glc = document.getElementById('c');
glc.width = VW;
glc.height = VH;
initGL(glc);

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
let acted = false;
addEventListener('keydown', (e) => {
  held[e.key] = true;
  if (e.key === ' ' || e.key === 'Enter') acted = true;
});
addEventListener('keyup', (e) => { held[e.key] = false; });
hud.addEventListener('pointerdown', () => { acted = true; });
const heldFwd = () => held.ArrowUp || held.w;
const heldBack = () => held.ArrowDown || held.s;
const turnDir = () => (held.ArrowLeft || held.a ? 1 : 0) - (held.ArrowRight || held.d ? 1 : 0);

// --- audio ----------------------------------------------------------------
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
    if (s % 4 === 0) { kick(nextT); beat = 1; }
    if (s % 4 === 2) tone(6200, .03, 'square', .012 + speedN * .035, nextT);
    if (s % 2 === 0) tone(NOTE(BASS[(s >> 1) % 16]), .16, 'square', .05, nextT);
    if (speedN > .2) tone(NOTE(BASS[s % 16] + 12), .06, 'sawtooth', .015 + speedN * .03, nextT);
    if (closeN > .02) tone(NOTE(LEAD[s]), .2, 'triangle', .02 + closeN * .08, nextT);
    if (mode === 'rainbow') tone(NOTE(LEAD[s] + 12), .18, 'triangle', .05, nextT);
    nextT += 15 / (116 + speedN * 52);
    step++;
  }
}

// --- state ----------------------------------------------------------------
let mode = 'title', timer = 0;
let course, depth, roadM, railM, groundM, bgM, braid, trailM;
let surge = 0, slipT = 0, fly = null, cine = 0, jumps = 0, falls = 0;
let rainbowT = 0, rainbowTotal = 0, bestBurn = 0, flash = 0, msgT = 0, msg = '';
let energy = 40, slowT = 0, stars = [];
const player = { r: null, speed: 10, lane: 0 };
const cam = { e: [0, 3, -5], a: [0, 0, 0] };
const uniM = unicornMesh();
const headM = headMesh();
let vp = null, beat = 0, lean = 0, camT = null, camU = null, speedSm = 0, fovSm = 1.03, clSm = 1;
let lastHd = 0, rollSm = 0, prevP = null;
const camTv = [0, 0, 0], camUv = [0, 0, 0];
const first = (es) => es[0];

function say(t, dur) { msg = t; msgT = dur; }

// Stardust: authored onto the course - denser before demands, and strung
// along the flight arc of every gap so the jump itself feeds you.
function placeStars() {
  stars = [];
  for (const a of course.nodes) {
    const e = a.next[0];
    if (!e) continue;
    if (e.gap) {
      const A = a.p, B = e.to.p, dist = d3(A, B), h = Math.min(11, dist * .22);
      for (const u of [.3, .5, .7]) {
        stars.push({ i: a.i, p: [A[0] + (B[0] - A[0]) * u, A[1] + (B[1] - A[1]) * u + 4 * h * u * (1 - u) + 1.2, A[2] + (B[2] - A[2]) * u] });
      }
    } else if ((e.to.req || Math.random() < .55)) {
      const k = e.to.req ? 2 : 1;
      for (let j = 0; j < k; j++) {
        const t = .25 + .5 * (j + Math.random()) / k;
        const f = tframe(a, e.to, t);
        const lane = Math.sin(a.i * .9 + j * 2) * 2.8;
        stars.push({ i: a.i, p: [f[0][0] + f[2][0] * lane + f[3][0] * 1.1, f[0][1] + f[2][1] * lane + f[3][1] * 1.1, f[0][2] + f[2][2] * lane + f[3][2] * 1.1] });
      }
    }
  }
}

// --- particles: bloomy star sparks ---------------------------------------
const PMAX = 160, PART = [];
let pcur = 0;
function spawnP(p, v, col, life) {
  PART[pcur % PMAX] = { p: [...p], v, col, life, max: life };
  pcur++;
}
function burst(p, n, sp) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, b = Math.random() * Math.PI - Math.PI / 2;
    spawnP(p, [Math.cos(a) * Math.cos(b) * sp, Math.sin(b) * sp + 2, Math.sin(a) * Math.cos(b) * sp], RAINBOW[(Math.random() * 7) | 0], .6 + Math.random() * .5);
  }
}
const PBUF = new Float32Array(PMAX * 120);
function particleVerts(now) {
  let n = 0;
  const put = (x, y, z, c, a) => {
    PBUF[n] = x; PBUF[n + 1] = y; PBUF[n + 2] = z;
    PBUF[n + 3] = 0; PBUF[n + 4] = 1; PBUF[n + 5] = 0;
    PBUF[n + 6] = c[0] * 1.8; PBUF[n + 7] = c[1] * 1.8; PBUF[n + 8] = c[2] * 1.8; PBUF[n + 9] = a;
    n += 10;
  };
  for (const pt of PART) {
    if (!pt || pt.life <= 0) continue;
    const f = pt.life / pt.max, sz = .16 + f * .2, a = f * .8;
    const [x, y, z] = pt.p;
    // a four-point star: two crossed quads read as a bloom sparkle
    put(x - sz, y, z, pt.col, a); put(x + sz, y, z, pt.col, a); put(x, y + sz * 2.6, z, pt.col, 0);
    put(x - sz, y, z, pt.col, a); put(x + sz, y, z, pt.col, a); put(x, y - sz * 2.6, z, pt.col, 0);
    put(x, y - sz, z, pt.col, a); put(x, y + sz, z, pt.col, a); put(x + sz * 2.6, y, z, pt.col, 0);
    put(x, y - sz, z, pt.col, a); put(x, y + sz, z, pt.col, a); put(x - sz * 2.6, y, z, pt.col, 0);
  }
  return n;
}
const partM = () => createMesh(new Float32Array(0), true);
let particleM, starM;
const SBUF = new Float32Array(24000);

function starVerts(now) {
  if (!player.r) return 0;
  const pi = player.r.a.i;
  let n = 0;
  const put = (x, y, z, c, a) => {
    SBUF[n] = x; SBUF[n + 1] = y; SBUF[n + 2] = z;
    SBUF[n + 3] = 0; SBUF[n + 4] = 1; SBUF[n + 5] = 0;
    SBUF[n + 6] = c[0]; SBUF[n + 7] = c[1]; SBUF[n + 8] = c[2]; SBUF[n + 9] = a;
    n += 10;
  };
  for (const st of stars) {
    if (st.taken || st.i < pi - 1 || st.i > pi + 16) continue;
    const s = .5 + Math.sin(now / 160 + st.i * 2.1) * .14;
    const c = [1.6, 1.5, 1.2], [x, y, z] = st.p;
    for (const [dx, dy] of [[s, 0], [0, s]]) {
      put(x - dx, y - dy, z, c, .8); put(x + dx, y + dy, z, c, .8); put(x + dy * .4, y + dx * .4, z + s, c, 0);
      put(x - dx, y - dy, z, c, .8); put(x + dx, y + dy, z, c, .8); put(x - dy * .4, y - dx * .4, z - s, c, 0);
    }
  }
  return n;
}

function makeBackdrop() {
  let cx = 0, cz = 0;
  for (const n of course.nodes) { cx += n.p[0]; cz += n.p[2]; }
  cx /= course.nodes.length; cz /= course.nodes.length;
  const v = [];
  for (let i = 0; i < 150; i++) {
    const an = Math.random() * Math.PI * 2, r = 260 + Math.random() * 240;
    const y = -40 + Math.random() * 260, sz = 1.5 + Math.random() * 1.8;
    const c = [[1.6, 1.6, 1.6], [1.2, 1.4, 1.8], [1.7, 1.3, 1.5]][i % 3];
    pushBox(v, cx + Math.cos(an) * r, y, cz + Math.sin(an) * r, sz, sz, sz, ...c, 1);
  }
  for (let i = 0; i < 9; i++) {
    const an = i / 9 * Math.PI * 2 + Math.random() * .4, r = 330;
    const c = RAINBOW[i % 7].map((x) => x * 2.4);
    const px = cx + Math.cos(an) * r, pz = cz + Math.sin(an) * r;
    const sx = -Math.sin(an), sz2 = Math.cos(an);
    const w = 50 + Math.random() * 60, h0 = -20, h1 = 120 + Math.random() * 90;
    const quad = [[px - sx * w, h0, pz - sz2 * w], [px + sx * w, h0, pz + sz2 * w], [px + sx * w, h1, pz + sz2 * w], [px - sx * w, h1, pz - sz2 * w]];
    for (const k of [0, 1, 2, 0, 2, 3]) v.push(quad[k][0], quad[k][1], quad[k][2], 0, 1, 0, c[0], c[1], c[2], .1);
  }
  return createMesh(v);
}

function newRun() {
  course = makeCourse(170);
  depth = depths(course);
  const tm = trackMeshes(course);
  roadM = createMesh(tm.road);
  railM = createMesh(tm.rail);
  const gr = [];
  pushBox(gr, 0, -70, 800, 6000, .2, 6000, .04, .035, .08);
  groundM = createMesh(gr);
  bgM = makeBackdrop();
  placeStars();
  player.r = makeRider(course.start);
  player.speed = 14;
  player.lane = 0;
  braid = makeBraid(course);
  ride(braid.r, S * 6, first);
  trailM = createMesh(new Float32Array(0), true);
  particleM = partM(); starM = partM();
  PART.length = 0; pcur = 0;
  surge = 0; slipT = 0; fly = null; cine = 0; jumps = 0; falls = 0;
  rainbowT = 0; rainbowTotal = 0; flash = 0; msgT = 0;
  energy = 40; slowT = 0;
  timer = 0;
  camT = null; camU = null; prevP = null;
}

const wake = [];
RAINBOW.forEach((c, i) => pushBox(wake, (i - 3) * .22, .16, -2.8, .11, .11, 3.6, ...c.map((v) => v * 1.6), .12));
const wakeM = createMesh(wake);

function project(w) {
  const x = vp[0] * w[0] + vp[4] * w[1] + vp[8] * w[2] + vp[12];
  const y = vp[1] * w[0] + vp[5] * w[1] + vp[9] * w[2] + vp[13];
  const wc = vp[3] * w[0] + vp[7] * w[1] + vp[11] * w[2] + vp[15];
  return [x / wc * VW / 2 + VW / 2, -y / wc * VH / 2 + VH / 2, wc];
}
function edgeArrow(w, col) {
  const [sx, sy, wc] = project(w);
  if (wc > 0 && sx > 0 && sx < VW && sy > 0 && sy < VH) return;
  let dx = sx - VW / 2, dy = sy - VH / 2;
  if (wc < 0) { dx = -dx; dy = -dy; }
  const l = Math.hypot(dx, dy) || 1;
  dx /= l; dy /= l;
  ctx.save();
  ctx.translate(VW / 2 + dx * (VW / 2 - 26), VH / 2 + dy * (VH / 2 - 26));
  ctx.rotate(Math.atan2(dy, dx));
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(10, 0); ctx.lineTo(-6, -7); ctx.lineTo(-6, 7);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// --- falling and flying ---------------------------------------------------
function doFall(why) {
  falls++;
  flash = .8;
  say(why, 3);
  tone(120, .6, 'sawtooth', .12);
  if (mode === 'rainbow') detach(true);
  // Respawn a node back, with a little pity stardust so a dry tank cannot
  // soft-lock you in front of the same demand forever.
  const back = player.r.pa || player.r.a;
  placeAt(player.r, back, null);
  player.speed = 12;
  energy = Math.max(energy, 30);
  fly = null;
  slowT = 0;
}

function startFly() {
  const a = player.r.a, b = player.r.b;
  const dist = d3(a.p, b.p);
  fly = { a, b, u: player.r.s / Math.max(1, player.r.len), v: Math.max(10, player.speed),
    need: dist * 1.02 + 7, dist, h: Math.min(11, dist * .22), sink: 0, lat: player.lane * 2.8 };
  tone(300, .3, 'sawtooth', .09);
  jumps++;
}
function flyState() {
  const u = fly.u, A = fly.a.p, B = fly.b.p;
  const arc = 4 * fly.h * u * (1 - u);
  const dx = B[0] - A[0], dz = B[2] - A[2];
  const hl = Math.hypot(dx, dz) || 1;
  const sx = dz / hl, sz = -dx / hl;
  const p = [A[0] + dx * u + sx * fly.lat, A[1] + (B[1] - A[1]) * u + arc - fly.sink, A[2] + dz * u + sz * fly.lat];
  const dArc = 4 * fly.h * (1 - 2 * u);
  const T = [dx, B[1] - A[1] + dArc, dz];
  const l = Math.hypot(...T) || 1;
  return [p, [T[0] / l, T[1] / l, T[2] / l]];
}

function detach(silent) {
  mode = 'run';
  if (!silent) { slipT = 2.5; tone(170, .5, 'sawtooth', .11); }
  let n = player.r.b || player.r.a, from = player.r.a;
  for (let i = 0; i < 3 && n.next.length; i++) { from = n; n = n.next[0].to; }
  placeAt(braid.r, n, from);
  braid.tl = makeTrail();
  braid.burst = 1.2;
}

let last = 0;
function frame(now) {
  const dt = Math.min(.05, (now - last) / 1000 || 0);
  last = now;
  const doAct = acted;
  acted = false;

  let speedN = 0, closeN = 0;
  flash = Math.max(0, flash - dt * 1.6);
  if (mode === 'run' || mode === 'rainbow') {
    timer += dt;
    surge = Math.max(0, surge - dt / 1.4);
    slipT = Math.max(0, slipT - dt);
    msgT = Math.max(0, msgT - dt);
    // THE resource rule: boost exists only while there is stardust to burn.
    // As the rainbow the boost is free - you are made of the stuff - and
    // the burn meter is the cost instead.
    const free = mode === 'rainbow';
    const canBoost = heldFwd() && (free || energy > 0);
    const top = free ? 40 : 34;
    const target = canBoost ? top : heldBack() ? 9 : 15;
    player.speed += (target - player.speed) * Math.min(1, dt * (heldBack() ? 3 : 1.2));
    if (canBoost && !free) energy = Math.max(0, energy - dt * 10);

    if (fly) {
      cine = Math.min(1, cine + dt * 4);
      // air control: boost burns stardust to stretch the arc, lateral drift
      // lines up the landing (and the stars strung along the arc)
      if (heldFwd() && (free || energy > 0)) {
        fly.v += dt * 16;
        if (!free) energy = Math.max(0, energy - dt * 14);
        burst(prevP || player.r.pos, 1, 2);
      }
      fly.lat += turnDir() * dt * 7;
      fly.lat = Math.max(-4.5, Math.min(4.5, fly.lat));
      fly.u += fly.v / fly.dist * dt;
      const deficit = Math.max(0, fly.need - fly.v);
      fly.sink += deficit * dt * .9;
      if (fly.sink > 7) doFall('Fell short! Carry more speed into the jump - or boost mid-air.');
      else if (fly.u >= 1) {
        placeAt(player.r, fly.b, fly.a);
        player.speed = Math.max(player.speed, fly.v * .9);
        player.lane = Math.max(-1, Math.min(1, fly.lat / 2.8));
        fly = null;
        tone(140, .25, 'triangle', .12);
        tone(520, .5, 'triangle', .07);
        if (mode === 'rainbow') {
          rainbowT = Math.min(7, rainbowT + 1);
          flash = Math.max(flash, .5);
          tone(392 * 2 ** (rainbowT / 7), .4, 'triangle', .1);
        }
      }
    } else {
      cine = Math.max(0, cine - dt * 1.4);
      const st = turnDir();
      if (st) player.lane += st * dt * 2.2;
      else player.lane -= Math.sign(player.lane) * Math.min(Math.abs(player.lane), dt * .7);
      player.lane = Math.max(-1, Math.min(1, player.lane));
      // Gravity along the tangent: dives are FREE speed - use them.
      player.speed -= player.r.tan[1] * dt * 22;
      player.speed = Math.max(7, Math.min(46, player.speed));
      ride(player.r, player.speed * dt, first);
      if (player.r.edge && player.r.edge.gap) startFly();
      else {
        // Demand sections: below the minimum for half a second, you slide off.
        const req = player.r.b ? player.r.b.req : 0;
        if (req && player.speed < req - 1) {
          slowT += dt;
          if (slowT > .5) doFall('Too slow for the bend - it threw you!');
        } else slowT = 0;
      }
      if (!player.r.a.next.length && !player.r.b) mode = 'end';
    }

    // stardust pickup
    if (player.r) {
      const pi = player.r.a.i, pp2 = fly ? (prevP || player.r.pos) : player.r.pos;
      for (const st2 of stars) {
        if (st2.taken || st2.i < pi - 1 || st2.i > pi + 2) continue;
        if (d3(st2.p, pp2) < 2.7) {
          st2.taken = true;
          energy = Math.min(100, energy + 9);
          surge = Math.max(surge, .25);
          burst(st2.p, 8, 5);
          tone(880 + Math.random() * 220, .12, 'triangle', .07);
        }
      }
    }

    speedN = (player.speed - 7) / 39;
    speedSm += (speedN - speedSm) * Math.min(1, dt * 1.5);

    if (mode === 'run') {
      updateBraid(braid, player.r.pos, dt, depth);
      if (!fly && braid.burst <= 0 && nearTrail(braid.tl, player.r.pos, 3.4)) {
        mode = 'rainbow';
        rainbowT = 7;
        energy = 100;
        flash = 1;
        surge = 1;
        say('YOU ARE THE RAINBOW - jump the gaps to keep it burning!', 5);
        RAINBOW.forEach((_, i) => tone(392 * 2 ** (i / 7), .35, 'triangle', .1, ac && ac.currentTime + i * .07));
      }
      const hd = braid.tl.head;
      if (hd) closeN = Math.max(0, 1 - d3(player.r.pos, hd) / 40);
    } else if (mode === 'rainbow') {
      rainbowT -= dt / 2.2;
      rainbowTotal += dt;
      bestBurn = Math.max(bestBurn, rainbowTotal);
      closeN = 1;
      if (rainbowT <= 0) { detach(); say('The last colour burned out - run it down again!', 2.5); }
    }
    pump(speedN, closeN);
  }

  if (doAct) {
    if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
    if (mode === 'title' || mode === 'end') { newRun(); mode = 'run'; }
  }

  // --- frames: RAW for the unicorn, eased for the camera --------------------
  // The unicorn stands perpendicular to the TRACK, exactly - it is a
  // physical thing on a physical road. Only the camera gets the smoothing.
  let p = [0, 0, 0], rT = [0, 0, 1], rUp = [0, 1, 0];
  if (fly) {
    [p, rT] = flyState();
  } else if (player.r) {
    p = player.r.pos; rT = player.r.tan;
    if (player.r.b) [p, rT, , rUp] = tframe(player.r.a, player.r.b, player.r.t);
  }
  const ease = (cur, vel, want) => {
    if (!cur) return [...want];
    const K = 9;
    for (let i = 0; i < 3; i++) {
      vel[i] += ((want[i] - cur[i]) * K * K - 2 * K * vel[i]) * dt;
      cur[i] += vel[i] * dt;
    }
    const l = Math.hypot(cur[0], cur[1], cur[2]) || 1;
    cur[0] /= l; cur[1] /= l; cur[2] /= l;
    return cur;
  };
  camT = ease(camT, camTv, rT); camU = ease(camU, camUv, rUp);
  let T = camT, up = camU;

  const hd2 = Math.atan2(T[0], T[2]);
  let dhd = hd2 - lastHd;
  dhd -= Math.round(dhd / (2 * Math.PI)) * 2 * Math.PI;
  lastHd = hd2;
  if (dt > 0) rollSm += (Math.max(-.6, Math.min(.6, dhd / dt * .5)) - rollSm) * Math.min(1, dt * 3);
  const roll = rollSm * (1 - cine);
  let sideL = [T[1] * up[2] - T[2] * up[1], T[2] * up[0] - T[0] * up[2], T[0] * up[1] - T[1] * up[0]];
  const cR = Math.cos(roll), sR = Math.sin(roll);
  up = [up[0] * cR + sideL[0] * sR, up[1] * cR + sideL[1] * sR, up[2] * cR + sideL[2] * sR];
  sideL = [T[1] * up[2] - T[2] * up[1], T[2] * up[0] - T[0] * up[2], T[0] * up[1] - T[1] * up[0]];
  // raw frame for the body, with the same lean rolled in
  let rSide = [rT[1] * rUp[2] - rT[2] * rUp[1], rT[2] * rUp[0] - rT[0] * rUp[2], rT[0] * rUp[1] - rT[1] * rUp[0]];
  const rUp2 = [rUp[0] * cR + rSide[0] * sR, rUp[1] * cR + rSide[1] * sR, rUp[2] * cR + rSide[2] * sR];
  rSide = [rT[1] * rUp2[2] - rT[2] * rUp2[1], rT[2] * rUp2[0] - rT[0] * rUp2[2], rT[0] * rUp2[1] - rT[1] * rUp2[0]];
  lean += (turnDir() * .1 - lean) * Math.min(1, dt * 4);

  const high = (2.0 - speedSm * .15) + cine * 2.2;
  const back = (2.3 + speedSm * .7) + cine * 4.4;
  let bp;
  if (fly || !player.r || !player.r.b) bp = [p[0] - T[0] * back, p[1] - T[1] * back, p[2] - T[2] * back];
  else {
    const bf = behind(player.r, back);
    bp = bf ? bf[0] : [p[0] - T[0] * back, p[1] - T[1] * back, p[2] - T[2] * back];
  }
  const cl = Math.max(.55, camT ? up[0] * rUp[0] + up[1] * rUp[1] + up[2] * rUp[2] : 1);
  clSm += (cl - clSm) * Math.min(1, dt * 4);
  const lo = player.r ? player.lane * 2.2 : 0;
  const swing = cine * 3.2;
  const sh = (speedSm * speedSm * .08 + surge * .1) * (1 - cine);
  const shx = Math.sin(now * .037) * sh, shy = Math.cos(now * .029) * sh * .6;
  const tgtE = [
    bp[0] + up[0] * (high / Math.max(.55, clSm) + shy) + sideL[0] * (lean + lo + swing + shx),
    bp[1] + up[1] * (high / Math.max(.55, clSm) + shy) + sideL[1] * (lean + lo + swing + shx),
    bp[2] + up[2] * (high / Math.max(.55, clSm) + shy) + sideL[2] * (lean + lo + swing + shx),
  ];
  let tgtA;
  if (fly) tgtA = [p[0], p[1] + .6, p[2]];
  else {
    const af = player.r ? ahead(player.r, 9) : null;
    const ap = af ? af[0] : [p[0] + T[0] * 9, p[1] + T[1] * 9, p[2] + T[2] * 9];
    tgtA = [ap[0] + up[0] * 1.7 + sideL[0] * lo, ap[1] + up[1] * 1.7 + sideL[1] * lo, ap[2] + up[2] * 1.7 + sideL[2] * lo];
  }
  const k = cine > .02 ? Math.min(1, dt * (3.5 + 60 * (1 - cine))) : 1;
  for (let i = 0; i < 3; i++) {
    cam.e[i] += (tgtE[i] - cam.e[i]) * k;
    cam.a[i] += (tgtA[i] - cam.a[i]) * k;
  }
  const cu = up.map((v, i) => v - sideL[i] * lean * .5);
  fovSm += (1.03 + speedSm * .38 + surge * .2 + cine * .16 - fovSm) * Math.min(1, dt * 6);
  if (DEV) (window.__cam = window.__cam || []).push([now, cam.e[0], cam.e[1], cam.e[2], cam.a[0], cam.a[1], cam.a[2], fovSm, cu[0], cu[1], cu[2]]);
  vp = mul(perspective(fovSm, VW / VH, .1, 700), lookAt(cam.e, cam.a, cu));
  frameGL(vp, cam.e, FOG);

  if (mode !== 'title') {
    if (mode === 'rainbow' || (mode === 'end' && rainbowT > 0)) {
      const dP = prevP ? d3(p, prevP) : 0;
      feedTrail(braid.tl, p, rSide, rUp2, dP);
    }
    // hoof sparks while boosting hard on the deck
    if (!fly && player.speed > 26 && Math.random() < .5) {
      burst([p[0] - rT[0] * 1.2 + rUp2[0] * .2, p[1] - rT[1] * 1.2 + rUp2[1] * .2, p[2] - rT[2] * 1.2 + rUp2[2] * .2], 1, 3);
    }
    prevP = [...p];
    for (const pt of PART) {
      if (!pt || pt.life <= 0) continue;
      pt.life -= dt;
      pt.v[1] -= 7 * dt;
      pt.p[0] += pt.v[0] * dt; pt.p[1] += pt.v[1] * dt; pt.p[2] += pt.v[2] * dt;
    }
    const nb = trailVerts(braid.tl, now / 1000, mode === 'rainbow' || mode === 'end');
    if (nb) updateMesh(trailM, BUF, nb);
    updateMesh(starM, SBUF, starVerts(now));
    updateMesh(particleM, PBUF, particleVerts(now));

    drawMesh(groundM, IDENT);
    const bob = Math.abs(Math.sin(now / 1000 * 11)) * Math.min(1, player.speed / 14) * .1;
    const S8 = .85, lx = fly ? 0 : player.lane * 2.8;
    const base = [
      p[0] + rUp2[0] * (bob + .04) + rSide[0] * lx,
      p[1] + rUp2[1] * (bob + .04) + rSide[1] * lx,
      p[2] + rUp2[2] * (bob + .04) + rSide[2] * lx,
    ];
    drawMesh(uniM, modelFrame(base, rSide, rUp2, rT, S8));
    beat = Math.max(0, beat - dt * 4.5);
    const duck = speedN * .42 + surge * .16 - cine * .5;
    const pitch = duck + beat * beat * .34 * (1 - speedN * .5);
    const sway = Math.sin(now / 460) * .12 * (1 - speedN * .6) + turnDir() * -.18;
    const cp2 = Math.cos(pitch), sp2 = Math.sin(pitch), cs2 = Math.cos(sway), ss2 = Math.sin(sway);
    const hZ = [rT[0] * cp2 - rUp2[0] * sp2, rT[1] * cp2 - rUp2[1] * sp2, rT[2] * cp2 - rUp2[2] * sp2];
    const hY = [rT[0] * sp2 + rUp2[0] * cp2, rT[1] * sp2 + rUp2[1] * cp2, rT[2] * sp2 + rUp2[2] * cp2];
    const fZ = [hZ[0] * cs2 - rSide[0] * ss2, hZ[1] * cs2 - rSide[1] * ss2, hZ[2] * cs2 - rSide[2] * ss2];
    const fX = [rSide[0] * cs2 + hZ[0] * ss2, rSide[1] * cs2 + hZ[1] * ss2, rSide[2] * cs2 + hZ[2] * ss2];
    const hp = [
      base[0] + (rSide[0] * PIVOT[0] + rUp2[0] * PIVOT[1] + rT[0] * PIVOT[2]) * S8,
      base[1] + (rSide[1] * PIVOT[0] + rUp2[1] * PIVOT[1] + rT[1] * PIVOT[2]) * S8,
      base[2] + (rSide[2] * PIVOT[0] + rUp2[2] * PIVOT[1] + rT[2] * PIVOT[2]) * S8,
    ];
    drawMesh(headM, modelFrame(hp, fX, hY, fZ, S8));

    glMode(2);
    drawMesh(roadM, IDENT);
    glMode(1);
    drawMesh(bgM, IDENT);
    drawMesh(railM, IDENT);
    if (trailM.n) drawMesh(trailM, IDENT);
    if (starM.n) drawMesh(starM, IDENT);
    if (particleM.n) drawMesh(particleM, IDENT);
    if (speedN > .2 || fly || mode === 'rainbow') {
      const st = .5 + speedN * 2 + surge + cine * 1.5;
      drawMesh(wakeM, modelFrame(base, rSide, rUp2, [rT[0] * st, rT[1] * st, rT[2] * st], S8));
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
      ctx.fillRect(0, 100 + i * 7, VW, 5);
    });
    ctx.fillStyle = '#f3ead6';
    ctx.font = 'bold 40px system-ui';
    ctx.fillText('RAINBOW SURFER', VW / 2, 76);
    ctx.font = '13px system-ui';
    ctx.fillStyle = '#b8ab92';
    ctx.fillText('Stardust feeds the boost. Bends and jumps demand SPEED - too slow and you fall.', VW / 2, 164);
    ctx.fillText('Catch the rainbow to BECOME it; jumps keep it burning. Score is your burn time.', VW / 2, 182);
    ctx.fillStyle = '#7a6e5c';
    ctx.fillText('↑ boost (burns stardust)   ↓ brake   ← → slide / steer the jump', VW / 2, 222);
    ctx.fillStyle = '#e8b923';
    ctx.fillText('press SPACE', VW / 2, 258);
  } else {
    const blur = Math.max(0, speedSm - .3) + surge * .5 + cine * .3;
    if (blur > 0) {
      for (const [col, ox] of [['rgba(120,220,255,', -2], ['rgba(255,120,190,', 2], ['rgba(255,255,255,', 0]]) {
        ctx.strokeStyle = col + Math.min(.42, blur * (ox ? .22 : .45)) + ')';
        ctx.lineWidth = ox ? 2 : 1.5;
        for (let i = 0; i < 30; i++) {
          const an = i * 2.399, r0 = 96 + (i % 5) * 14, r1 = r0 + 34 + blur * 200;
          ctx.beginPath();
          ctx.moveTo(VW / 2 + ox + Math.cos(an) * r0, VH / 2 + Math.sin(an) * r0 * .62);
          ctx.lineTo(VW / 2 + ox + Math.cos(an) * r1, VH / 2 + Math.sin(an) * r1 * .62);
          ctx.stroke();
        }
      }
      const vg = ctx.createRadialGradient(VW / 2, VH / 2, VH * .38, VW / 2, VH / 2, VH * .8);
      vg.addColorStop(0, 'rgba(8,5,18,0)');
      vg.addColorStop(1, `rgba(8,5,18,${Math.min(.7, blur * .75)})`);
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, VW, VH);
    }
    if (flash > 0) {
      ctx.fillStyle = `rgba(255,250,240,${flash * .7})`;
      ctx.fillRect(0, 0, VW, VH);
    }

    ctx.font = '14px system-ui';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#f3ead6';
    ctx.fillText(Math.round(player.speed * 9) + ' km/h', 12, 22);
    ctx.fillText('burn ' + rainbowTotal.toFixed(1) + 's', 12, 42);
    // stardust tank
    ctx.fillStyle = 'rgba(160,150,130,.25)';
    ctx.fillRect(12, 52, 104, 9);
    ctx.fillStyle = mode === 'rainbow' ? '#9be8ff' : '#ffd75e';
    ctx.fillRect(14, 54, energy, 5);
    ctx.fillStyle = '#7a6e5c';
    ctx.font = '10px system-ui';
    ctx.fillText('stardust', 12, 72);

    ctx.textAlign = 'center';
    if (mode === 'rainbow') {
      for (let i = 0; i < 7; i++) {
        const [r, gg, b] = RAINBOW[i];
        const f = Math.max(0, Math.min(1, rainbowT - i));
        ctx.fillStyle = 'rgba(120,110,140,.3)';
        ctx.fillRect(VW / 2 - 70 + i * 20, 16, 16, 9);
        ctx.fillStyle = `rgb(${r * 255},${gg * 255},${b * 255})`;
        ctx.fillRect(VW / 2 - 70 + i * 20, 16 + (1 - f) * 9, 16, f * 9);
      }
    } else if (mode === 'run') {
      const hd = braid.tl.head;
      if (hd) edgeArrow(hd, '#fff');
      ctx.fillStyle = 'rgba(232,185,35,' + (.55 + Math.sin(now / 300) * .25) + ')';
      ctx.font = 'bold 14px system-ui';
      ctx.fillText('CATCH THE RAINBOW', VW / 2, 24);
    }
    // demand warnings, front and centre - this is the game now
    if (!fly && player.r && player.r.b) {
      const req = player.r.b.req;
      const nextGap = player.r.b.next[0] && player.r.b.next[0].gap && player.r.t > .3;
      if (req && player.speed < req + 2) {
        ctx.fillStyle = `rgba(255,80,110,${.6 + Math.sin(now / 90) * .4})`;
        ctx.font = 'bold 22px system-ui';
        ctx.fillText('SPEED UP!', VW / 2, 120);
      } else if (nextGap) {
        ctx.fillStyle = '#e8b923';
        ctx.font = 'bold 16px system-ui';
        ctx.fillText('JUMP AHEAD - carry speed!', VW / 2, 120);
      }
    }
    if (msgT > 0) {
      ctx.fillStyle = '#e8b923';
      ctx.font = 'bold 15px system-ui';
      ctx.fillText(msg, VW / 2, 92);
    }
    if (fly) {
      ctx.fillStyle = `rgba(232,185,35,${Math.min(1, cine)})`;
      ctx.font = 'bold 30px system-ui';
      ctx.fillText('AIRBORNE', VW / 2, VH - 40);
      if (fly.sink > 1.5) {
        ctx.fillStyle = `rgba(255,80,110,${.6 + Math.sin(now / 80) * .4})`;
        ctx.font = 'bold 18px system-ui';
        ctx.fillText('SINKING - BOOST!', VW / 2, VH - 70);
      }
    }
    if (mode === 'end') {
      ctx.fillStyle = '#000000aa';
      ctx.fillRect(0, VH / 2 - 60, VW, 120);
      ctx.fillStyle = '#e8b923';
      ctx.font = 'bold 26px system-ui';
      ctx.fillText('END OF THE LINE', VW / 2, VH / 2 - 16);
      ctx.font = '14px system-ui';
      ctx.fillStyle = '#f3ead6';
      ctx.fillText('burned ' + rainbowTotal.toFixed(1) + 's   jumps ' + jumps + '   falls ' + falls + '   best ' + bestBurn.toFixed(1) + 's', VW / 2, VH / 2 + 14);
      ctx.fillStyle = '#b8ab92';
      ctx.fillText('SPACE - ride again', VW / 2, VH / 2 + 40);
    }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

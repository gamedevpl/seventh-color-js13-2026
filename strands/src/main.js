// RAINBOW SURFER - run the rainbow down, then ride it.
//
// The course grows forward and never loops: it splits into two routes now
// and then and closes again a few nodes later. That is deliberate. The maze
// this started as had cycles, and cycles are why the rainbow could come at
// you head-on - a chase reads as chaos the moment the quarry can appear
// travelling the wrong way. Here it never can.

import { initGL, frameGL, mode as glMode, createMesh, updateMesh, drawMesh, perspective, lookAt, mul, modelTR, modelFrame, IDENT, pushBox } from './gl.js';
import { S, makeCourse, depths } from './course.js';
import { trackMeshes, makeRider, ride, behind, ahead, placeAt, frame as tframe } from './track.js';
import { unicornMesh, headMesh, PIVOT, RAINBOW } from './uni.js';
import { makeBraid, updateBraid, braidVerts, BUF } from './ribbon.js';

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
    if (mode === 'surf') tone(NOTE(LEAD[s] + 12), .18, 'triangle', .05, nextT);
    nextT += 15 / (116 + speedN * 52);
    step++;
  }
}

// --- state ----------------------------------------------------------------
let mode = 'title', run = 0, timer = 0, best = 0, surfTime = 0, bestSurf = 0;
let course, depth, roadM, railM, groundM, braid, braidM;
let surge = 0, slipT = 0, fly = null, cine = 0, jumps = 0;
const player = { r: null, speed: 10, lane: 0 };
const cam = { e: [0, 3, -5], a: [0, 0, 0], u: [0, 1, 0] };
const uniM = unicornMesh();
const headM = headMesh();
let vp = null, beat = 0, lean = 0, camT = null, camU = null, speedSm = 0, fovSm = 1.03, clSm = 1;
const camTv = [0, 0, 0], camUv = [0, 0, 0];

// The lane is the racing line across the deck: which side you are on when
// you cross a node picks the branch, so the whole approach is the decision.
function pickBranch(es, st, T, A) {
  if (es.length === 1) return es[0];
  const h = Math.hypot(T[0], T[2]) || 1;
  const d = [T[0] / h, T[2] / h];
  let bestE = es[0], bv = -1e9;
  for (const e of es) {
    const M = e.to.p;
    let ex = M[0] - A[0], ez = M[2] - A[2];
    const l = Math.hypot(ex, ez) || 1;
    ex /= l; ez /= l;
    const ang = Math.atan2(d[1] * ex - d[0] * ez, d[0] * ex + d[1] * ez);
    const v = st > 0 ? ang : st < 0 ? -ang : -Math.abs(ang);
    if (v > bv) { bv = v; bestE = e; }
  }
  return bestE;
}
const laneSteer = () => (player.lane > .18 ? 1 : player.lane < -.18 ? -1 : 0);
const chooseP = (es) => pickBranch(es, laneSteer(), player.r.tan, player.r.a.p);

function newRun() {
  course = makeCourse(130 + run * 25);
  depth = depths(course);
  const tm = trackMeshes(course);
  roadM = createMesh(tm.road);
  railM = createMesh(tm.rail);
  const gr = [];
  pushBox(gr, 0, -70, 800, 6000, .2, 6000, .04, .035, .08);
  groundM = createMesh(gr);
  player.r = makeRider(course.start);
  player.speed = 14;
  player.lane = 0;
  braid = makeBraid(course);
  ride(braid.r, S * 7, (es) => es[0]);          // a real head start to chase down
  braidM = createMesh(new Float32Array(0), true);
  surge = 0; slipT = 0; fly = null; cine = 0; jumps = 0;
  timer = 0; surfTime = 0;
  camT = null; camU = null;
}

// Wake plume that rides the rainbow's own channel.
const plume = [];
RAINBOW.forEach((c, i) => pushBox(plume, 0, .5 + i * .28, -i * .5, 3.4 - i * .3, .22, .5, ...c.map((v) => v * 1.8), .5));
const plumeM = createMesh(plume);
const mark = [];
pushBox(mark, 0, .6, 0, .9, .9, .9, 1.2, 1, .5, .4);
const markM = createMesh(mark);
const wake = [];
RAINBOW.forEach((c, i) => pushBox(wake, (i - 3) * .19, .16, -2.5, .09, .09, 3.2, ...c.map((v) => v * 1.5), .1));
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

// --- the jump -------------------------------------------------------------
// A gap draws no deck; the rider leaves the rails on a parabola that lands
// exactly on the far node, so the jump is a spectacle and never a fail
// state. `cine` swells while airborne and eases back after touchdown, and
// it is the single number the camera blends every cinematic term through.
function startFly() {
  const a = player.r.a, b = player.r.b;
  const dist = d3(a.p, b.p);
  fly = { a, b, u: player.r.s / Math.max(1, player.r.len), dur: dist / Math.max(16, player.speed), h: Math.min(11, dist * .22) };
  tone(300, .3, 'sawtooth', .09);
  jumps++;
}
function flyState() {
  const u = fly.u, A = fly.a.p, B = fly.b.p;
  const arc = 4 * fly.h * u * (1 - u);
  const p = [A[0] + (B[0] - A[0]) * u, A[1] + (B[1] - A[1]) * u + arc, A[2] + (B[2] - A[2]) * u];
  const dArc = 4 * fly.h * (1 - 2 * u);
  const T = [B[0] - A[0], B[1] - A[1] + dArc, B[2] - A[2]];
  const l = Math.hypot(...T) || 1;
  return [p, [T[0] / l, T[1] / l, T[2] / l]];
}

let last = 0;
function frame(now) {
  const dt = Math.min(.05, (now - last) / 1000 || 0);
  last = now;
  const doAct = acted;
  acted = false;

  let speedN = 0, closeN = 0;
  if (mode === 'run' || mode === 'surf') {
    timer += dt;
    surge = Math.max(0, surge - dt / 1.4);
    slipT = Math.max(0, slipT - dt);
    const top = mode === 'surf' ? 40 : 30;
    const target = heldFwd() ? top : heldBack() ? 9 : 15;
    player.speed += (target - player.speed) * Math.min(1, dt * (heldBack() ? 3 : 1.2));

    if (fly) {
      fly.u += dt / fly.dur;
      cine = Math.min(1, cine + dt * 4);
      if (fly.u >= 1) {
        placeAt(player.r, fly.b, fly.a);
        fly = null;
        tone(140, .25, 'triangle', .12);
        tone(520, .5, 'triangle', .07);
      }
    } else {
      cine = Math.max(0, cine - dt * 1.4);
      const st = turnDir();
      if (st) player.lane += st * dt * 2.2;
      else player.lane -= Math.sign(player.lane) * Math.min(Math.abs(player.lane), dt * .7);
      player.lane = Math.max(-1, Math.min(1, player.lane));
      player.speed -= player.r.tan[1] * dt * 16;
      player.speed = Math.max(7, Math.min(top + surge * 8, player.speed));
      ride(player.r, player.speed * dt, chooseP);
      if (player.r.edge && player.r.edge.gap) startFly();
      if (!player.r.a.next.length && !player.r.b) mode = 'end';
    }

    updateBraid(braid, player.r.pos, dt, depth, mode === 'surf', player.speed);
    const nb = braidVerts(braid, now / 1000);
    if (nb) updateMesh(braidM, BUF, nb);

    speedN = (player.speed - 7) / 33;
    speedSm += (speedN - speedSm) * Math.min(1, dt * 1.5);
    const tail = braid.trail[0];
    if (tail) {
      const td = d3(player.r.pos, tail);
      closeN = Math.max(0, 1 - td / 36);
      if (mode === 'run' && !fly && td < 2.6) {
        mode = 'surf';
        surfTime = 0;
        RAINBOW.forEach((_, i) => tone(392 * 2 ** (i / 7), .35, 'triangle', .1, ac && ac.currentTime + i * .07));
      }
    }
    if (mode === 'surf') {
      // Surfing: the rainbow stops fleeing and runs just ahead of you. Hold
      // the pace and you ride it; drop off and it tears free again.
      surfTime += dt;
      bestSurf = Math.max(bestSurf, surfTime);
      const gap = d3(player.r.pos, braid.r.pos);
      if (gap > 34 && !fly) {
        mode = 'run';
        slipT = 2.5;
        braid.burst = 1.2;
        tone(170, .45, 'sawtooth', .1);
      }
    }
    pump(speedN, closeN);
  }

  if (doAct) {
    if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
    if (mode === 'end') run++;
    if (mode === 'title' || mode === 'end') { newRun(); mode = 'run'; }
  }

  // --- camera -------------------------------------------------------------
  let p = [0, 0, 0], T = [0, 0, 1], up = [0, 1, 0];
  if (fly) {
    [p, T] = flyState();
    up = [0, 1, 0];
  } else if (player.r) {
    p = player.r.pos; T = player.r.tan;
    if (player.r.b) [p, T, , up] = tframe(player.r.a, player.r.b, player.r.t);
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
  const upT = up;
  camT = ease(camT, camTv, T); camU = ease(camU, camUv, up);
  T = camT; up = camU;
  const sideL = [T[1] * up[2] - T[2] * up[1], T[2] * up[0] - T[0] * up[2], T[0] * up[1] - T[1] * up[0]];
  lean += (turnDir() * .1 - lean) * Math.min(1, dt * 4);

  // Airborne, the camera drops back and swings out to the side to show the
  // unicorn against the sky; on the rails it sits close behind the head.
  const high = (2.0 - speedSm * .15) + cine * 2.2;
  const back = (2.3 + speedSm * .7) + cine * 4.4;
  let bp;
  if (fly || !player.r || !player.r.b) bp = [p[0] - T[0] * back, p[1] - T[1] * back, p[2] - T[2] * back];
  else {
    const bf = behind(player.r, back);
    bp = bf ? bf[0] : [p[0] - T[0] * back, p[1] - T[1] * back, p[2] - T[2] * back];
  }
  const cl = Math.max(.55, camT ? up[0] * upT[0] + up[1] * upT[1] + up[2] * upT[2] : 1);
  clSm += (cl - clSm) * Math.min(1, dt * 4);
  const lo = player.r ? player.lane * 1.6 : 0;
  const swing = cine * 3.2;
  const tgtE = [
    bp[0] + up[0] * (high / Math.max(.55, clSm)) + sideL[0] * (lean + lo + swing),
    bp[1] + up[1] * (high / Math.max(.55, clSm)) + sideL[1] * (lean + lo + swing),
    bp[2] + up[2] * (high / Math.max(.55, clSm)) + sideL[2] * (lean + lo + swing),
  ];
  let tgtA;
  if (fly) tgtA = [p[0], p[1] + .6, p[2]];
  else {
    const af = player.r ? ahead(player.r, 9, (es) => pickBranch(es, laneSteer(), player.r.tan, player.r.b.p)) : null;
    const ap = af ? af[0] : [p[0] + T[0] * 9, p[1] + T[1] * 9, p[2] + T[2] * 9];
    tgtA = [ap[0] + up[0] * 1.7 + sideL[0] * lo, ap[1] + up[1] * 1.7 + sideL[1] * lo, ap[2] + up[2] * 1.7 + sideL[2] * lo];
  }
  // On the rails the camera is EXACT - no position filter at all. A
  // first-order lag whose step is proportional to dt amplifies frame-time
  // jitter into an alternating velocity, which measured as 360 acceleration
  // spikes in 20 seconds even though the target path was smooth. The lag
  // exists only for the cinematic, where the anchor really does move about,
  // and it fades back to zero as `cine` does.
  const k = cine > .02 ? Math.min(1, dt * (3.5 + 60 * (1 - cine))) : 1;
  for (let i = 0; i < 3; i++) {
    cam.e[i] += (tgtE[i] - cam.e[i]) * k;
    cam.a[i] += (tgtA[i] - cam.a[i]) * k;
  }
  const cu = up.map((v, i) => v - sideL[i] * lean * .5);
  fovSm += (1.03 + speedSm * .3 + surge * .18 + cine * .16 - fovSm) * Math.min(1, dt * 6);
  // Dev only: publish the real camera so tools/test-camlive.mjs can measure
  // the actual ride rather than a Node replica of it. Compiled out of every
  // shipping build.
  if (DEV) (window.__cam = window.__cam || []).push([now, cam.e[0], cam.e[1], cam.e[2], cam.a[0], cam.a[1], cam.a[2], fovSm, cu[0], cu[1], cu[2]]);
  vp = mul(perspective(fovSm, VW / VH, .1, 200), lookAt(cam.e, cam.a, cu));
  frameGL(vp, cam.e, FOG);

  if (mode !== 'title') {
    drawMesh(groundM, IDENT);
    const bob = Math.abs(Math.sin(now / 1000 * 11)) * Math.min(1, player.speed / 14) * .1;
    const S8 = .85, lx = fly ? 0 : player.lane * 2;
    const base = [
      p[0] + up[0] * (bob + .04) + sideL[0] * lx,
      p[1] + up[1] * (bob + .04) + sideL[1] * lx,
      p[2] + up[2] * (bob + .04) + sideL[2] * lx,
    ];
    drawMesh(uniM, modelFrame(base, sideL, up, T, S8));
    beat = Math.max(0, beat - dt * 4.5);
    const duck = speedN * .42 + surge * .16 - cine * .5;
    const pitch = duck + beat * beat * .34 * (1 - speedN * .5);
    const sway = Math.sin(now / 460) * .12 * (1 - speedN * .6) + turnDir() * -.18;
    const cp = Math.cos(pitch), sp = Math.sin(pitch), cs = Math.cos(sway), ss = Math.sin(sway);
    const hZ = [T[0] * cp - up[0] * sp, T[1] * cp - up[1] * sp, T[2] * cp - up[2] * sp];
    const hY = [T[0] * sp + up[0] * cp, T[1] * sp + up[1] * cp, T[2] * sp + up[2] * cp];
    const fZ = [hZ[0] * cs - sideL[0] * ss, hZ[1] * cs - sideL[1] * ss, hZ[2] * cs - sideL[2] * ss];
    const fX = [sideL[0] * cs + hZ[0] * ss, sideL[1] * cs + hZ[1] * ss, sideL[2] * cs + hZ[2] * ss];
    const hp = [
      base[0] + (sideL[0] * PIVOT[0] + up[0] * PIVOT[1] + T[0] * PIVOT[2]) * S8,
      base[1] + (sideL[1] * PIVOT[0] + up[1] * PIVOT[1] + T[1] * PIVOT[2]) * S8,
      base[2] + (sideL[2] * PIVOT[0] + up[2] * PIVOT[1] + T[2] * PIVOT[2]) * S8,
    ];
    drawMesh(headM, modelFrame(hp, fX, hY, fZ, S8));

    glMode(2);
    drawMesh(roadM, IDENT);
    glMode(1);
    drawMesh(railM, IDENT);
    if (braidM.n) drawMesh(braidM, IDENT);
    if (speedN > .25 || fly) {
      const st = .5 + speedN * 1.8 + surge + cine * 1.5;
      drawMesh(wakeM, modelFrame(base, sideL, up, [T[0] * st, T[1] * st, T[2] * st], S8));
    }
    if (braid.r.b) {
      const bf2 = tframe(braid.r.a, braid.r.b, braid.r.t);
      drawMesh(plumeM, modelFrame(bf2[0], bf2[2], bf2[3], bf2[1], 1));
    }
    if (!fly && player.r.b && player.r.t > .1) {
      const cand = player.r.b.next;
      if (cand.length > 1) {
        const ch = pickBranch(cand, laneSteer(), player.r.tan, player.r.b.p);
        const [mp] = tframe(player.r.b, ch.to, .22);
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
      ctx.fillRect(0, 100 + i * 7, VW, 5);
    });
    ctx.fillStyle = '#f3ead6';
    ctx.font = 'bold 40px system-ui';
    ctx.fillText('RAINBOW SURFER', VW / 2, 76);
    ctx.font = '13px system-ui';
    ctx.fillStyle = '#b8ab92';
    ctx.fillText('Run the rainbow down. Then ride it as long as you can hold the pace.', VW / 2, 172);
    ctx.fillStyle = '#7a6e5c';
    ctx.fillText('↑ boost   ↓ brake   ← → slide across the track', VW / 2, 214);
    ctx.fillText('the side you are on when you cross a node picks the branch', VW / 2, 232);
    ctx.fillStyle = '#e8b923';
    ctx.fillText('press SPACE', VW / 2, 268);
  } else {
    const blur = Math.max(0, speedSm - .35) + surge * .5 + cine * .3;
    if (blur > 0) {
      ctx.strokeStyle = `rgba(255,255,255,${Math.min(.4, blur * .4)})`;
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 24; i++) {
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
    ctx.fillText(Math.round(player.speed * 9) + ' km/h', 12, 22);
    ctx.fillText('jumps ' + jumps, 12, 42);
    if (bestSurf > 0) {
      ctx.fillStyle = '#b8ab92';
      ctx.fillText('best surf ' + bestSurf.toFixed(1) + 's', 12, 62);
    }
    if (mode === 'surf') {
      ctx.textAlign = 'center';
      ctx.fillStyle = '#e8b923';
      ctx.font = 'bold 22px system-ui';
      ctx.fillText('SURFING  ' + surfTime.toFixed(1) + 's', VW / 2, 40);
      RAINBOW.forEach(([r, gg, b], i) => {
        ctx.fillStyle = `rgba(${r * 255},${gg * 255},${b * 255},.8)`;
        ctx.fillRect(VW / 2 - 63 + i * 18, 50, 14, 5);
      });
    } else if (mode === 'run') {
      const tail = braid.trail[0];
      if (tail) edgeArrow(tail, '#fff');
      if (slipT > 0) {
        ctx.textAlign = 'center';
        ctx.fillStyle = '#e8b923';
        ctx.font = 'bold 15px system-ui';
        ctx.fillText('The rainbow tears free! Close the gap and take it again.', VW / 2, 90);
      }
    }
    if (fly) {
      ctx.textAlign = 'center';
      ctx.fillStyle = `rgba(232,185,35,${Math.min(1, cine)})`;
      ctx.font = 'bold 30px system-ui';
      ctx.fillText('AIRBORNE', VW / 2, VH - 40);
    } else if (!fly && mode === 'run') {
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
    }
    if (mode === 'end') {
      ctx.textAlign = 'center';
      ctx.fillStyle = '#000000aa';
      ctx.fillRect(0, VH / 2 - 60, VW, 120);
      ctx.fillStyle = '#e8b923';
      ctx.font = 'bold 26px system-ui';
      ctx.fillText('END OF THE LINE', VW / 2, VH / 2 - 16);
      ctx.font = '14px system-ui';
      ctx.fillStyle = '#f3ead6';
      ctx.fillText(timer.toFixed(1) + 's   ' + jumps + ' jumps   best surf ' + bestSurf.toFixed(1) + 's', VW / 2, VH / 2 + 14);
      ctx.fillStyle = '#b8ab92';
      ctx.fillText('SPACE - a longer course', VW / 2, VH / 2 + 40);
    }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

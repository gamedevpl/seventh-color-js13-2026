// UNICORN FIREBALL. Run the plain as a unicorn of one colour, gather every
// unicorn that shares it into a herd, and when the herd is big enough hold
// the button: the herd spirals into you and becomes a rainbow fireball
// that you ride across the plain into the next herd. Two fireballs that
// meet explode in a rainbow, and the bigger fist wins; everyone the loser
// gathered is thrown across the map, and the gathering starts again.

import { gl, initGL, frameGL, mode as glMode, createMesh, updateMesh, drawMesh, perspective, lookAt, mul, modelTR, IDENT, pushBox } from './gl.js';
import { buildAll, COL, RAINBOW, PIVOT, HIPS } from './uni.js';
import { units, leaders, balls, events, meadows, newWorld, step, charge, focus, won, lost, alive, radius, ARENA, WILD, now } from './herd.js';
import { wake, awake, music, join as sJoin, clang, thud, rise, riseOff, whoosh, boom as sBoom, ouch, beat, clearBeat } from './snd.js';

const VW = 640, VH = 360;
const FOG = [.07, .05, .13];
const TAU = Math.PI * 2;
const lerp = (a, b, k) => a + (b - a) * k;
const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const css = (c, a = 1) => `rgba(${c[0] * 255 | 0},${c[1] * 255 | 0},${c[2] * 255 | 0},${a})`;

const glc = document.getElementById('c');
glc.width = VW; glc.height = VH;
initGL(glc);
const wrap = document.createElement('div');
wrap.style.position = 'relative';
glc.parentNode.insertBefore(wrap, glc);
wrap.appendChild(glc);
const hud = document.createElement('canvas');
hud.width = VW; hud.height = VH;
hud.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;touch-action:none';
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
// Keyboard: arrows or WASD steer and sprint, SPACE (held) charges, released
// fires. Touch: the lower left and right thirds steer, the top strip is the
// button - hold it to fold the herd in, lift the thumb to fire.
const held = {};
let acted = false, pick = 0;
addEventListener('keydown', (e) => {
  if (!held[e.key] && mode === 'title') { if (e.key === 'ArrowLeft' || e.key === 'a') pick--; if (e.key === 'ArrowRight' || e.key === 'd') pick++; }
  held[e.key] = true;
  if (e.key === ' ' || e.key === 'Enter') acted = true;
  if (e.key === ' ') e.preventDefault();
});
addEventListener('keyup', (e) => { held[e.key] = false; });
const pts = new Map();
let tL = 0, tR = 0, tT = 0;
const at = (e) => {
  const r = hud.getBoundingClientRect();
  return [(e.clientX - r.left) / r.width * VW, (e.clientY - r.top) / r.height * VH];
};
const scan = () => {
  tL = tR = tT = 0;
  for (const [x, y] of pts.values()) {
    if (y < VH * .3) { tT = 1; continue; }
    if (x < VW / 2) tL = 1; else tR = 1;
  }
};
hud.addEventListener('pointerdown', (e) => {
  const [x, y] = at(e);
  pts.set(e.pointerId, [x, y]); scan();
  if (mode === 'title') { if (y > VH * .58 && y < VH * .72) { pick += x < VW / 2 ? -1 : 1; return; } }
  if (mode !== 'run') acted = true;
});
hud.addEventListener('pointermove', (e) => { if (pts.has(e.pointerId)) { pts.set(e.pointerId, at(e)); scan(); } });
const drop = (e) => { pts.delete(e.pointerId); scan(); };
hud.addEventListener('pointerup', drop);
hud.addEventListener('pointercancel', drop);
const turnDir = () => (held.ArrowLeft || held.a || (tL && !tR) ? 1 : 0) - (held.ArrowRight || held.d || (tR && !tL) ? 1 : 0);
const button = () => held[' '] || tT;

// --- the plain ------------------------------------------------------------
const U = buildAll();
let groundM, tuftM, starM, postM;
function partM() { return createMesh(new Float32Array(0), true); }
function buildPlain() {
  const g = [];
  pushBox(g, 0, -.5, 0, 600, 1, 600, .14, .17, .17);
  groundM = createMesh(g);
  // Each meadow glows faintly in its own colour: the map tells you where a
  // colour lives before a single unicorn does.
  const t = [];
  meadows.forEach((m, c) => {
    for (let i = 0; i < 90; i++) {
      const a = Math.random() * TAU, d = Math.sqrt(Math.random()) * 22;
      const x = m[0] + Math.cos(a) * d, z = m[1] + Math.sin(a) * d, h = .3 + Math.random() * .6;
      const k = COL[c];
      pushBox(t, x, h / 2, z, .12, h, .12, k[0], k[1], k[2], .5);
    }
  });
  // And a scatter of pale grass everywhere else, so the ground moves.
  for (let i = 0; i < 500; i++) {
    const x = (Math.random() - .5) * ARENA * 2.2, z = (Math.random() - .5) * ARENA * 2.2;
    pushBox(t, x, .2, z, .1, .4, .1, .5, .55, .5, .3);
  }
  tuftM = createMesh(t);
  // The edge: posts of light in a square.
  const p = [];
  for (let i = -ARENA; i <= ARENA; i += 14) for (const [x, z] of [[i, -ARENA], [i, ARENA], [-ARENA, i], [ARENA, i]]) {
    pushBox(p, x, 3, z, .3, 6, .3, .7, .6, 1, .35);
  }
  postM = createMesh(p);
  // Stars.
  const s = [];
  for (let i = 0; i < 260; i++) {
    const a = Math.random() * TAU, e = .05 + Math.random() * .9, r = 900;
    const x = Math.cos(a) * Math.cos(e) * r, y = Math.sin(e) * r, z = Math.sin(a) * Math.cos(e) * r;
    const q = 1.5 + Math.random() * 3, b = .4 + Math.random() * .6;
    pushBox(s, x, y, z, q, q, q, b, b, b * 1.1, .6);
  }
  pushBox(s, -500, 260, -700, 26, 26, 26, .9, .85, .7, .5);
  starM = createMesh(s);
}
let camR = [1, 0, 0], camU = [0, 1, 0];
// A soft disc: a fan, bright in the middle and gone at the rim, one per
// colour. Billboarded each draw, it is every glow in the game - the
// fireball's layers, the halo of a folding herd, the rings of an explosion.
const DISC = COL.map((c) => {
  const v = [], N = 18;
  for (let i = 0; i < N; i++) {
    const a = i / N * TAU, b = (i + 1) / N * TAU;
    v.push(0, 0, 0, 0, 0, 1, c[0], c[1], c[2], .4,
      Math.cos(a), Math.sin(a), 0, 0, 0, 1, c[0], c[1], c[2], 0,
      Math.cos(b), Math.sin(b), 0, 0, 0, 1, c[0], c[1], c[2], 0);
  }
  return createMesh(v);
});
// And a ring of the same: an annulus, bright in the middle of its band.
const RINGM = COL.map((c) => {
  const v = [], N = 24, put = (a, r, al) => v.push(Math.cos(a) * r, Math.sin(a) * r, 0, 0, 0, 1, c[0], c[1], c[2], al);
  for (let i = 0; i < N; i++) {
    const a = i / N * TAU, b = (i + 1) / N * TAU;
    put(a, .78, 0); put(b, .78, 0); put(b, .9, .5); put(a, .78, 0); put(b, .9, .5); put(a, .9, .5);
    put(a, .9, .5); put(b, .9, .5); put(b, 1, 0); put(a, .9, .5); put(b, 1, 0); put(a, 1, 0);
  }
  return createMesh(v);
});
const bill = (x, y, z, r) => [camR[0] * r, camR[1] * r, camR[2] * r, 0, camU[0] * r, camU[1] * r, camU[2] * r, 0, 0, 0, 1, 0, x, y, z, 1];
// A ring lying flat on the ground, for the explosion's shockwaves.
const flat = (x, y, z, r) => [r, 0, 0, 0, 0, 0, r, 0, 0, 1, 0, 0, x, y, z, 1];
const ring = (col, M) => drawMesh(RINGM[col], M);
function disc(col, x, y, z, r) {
  drawMesh(DISC[col], [camR[0] * r, camR[1] * r, camR[2] * r, 0, camU[0] * r, camU[1] * r, camU[2] * r, 0, 0, 0, 1, 0, x, y, z, 1]);
}

// --- particles: bloomy sparks, from Rainbow Surfer ------------------------
const PMAX = 220, PART = [];
let pcur = 0;
function spawnP(p, v, col, life) { PART[pcur++ % PMAX] = { p: [...p], v, col, life, max: life }; }
function burst(p, n, sp, col) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, b = Math.random() * Math.PI - Math.PI / 2;
    spawnP(p, [Math.cos(a) * Math.cos(b) * sp, Math.sin(b) * sp + 3, Math.sin(a) * Math.cos(b) * sp], col || RAINBOW[(Math.random() * 7) | 0], .6 + Math.random() * .6);
  }
}
const PBUF = new Float32Array(PMAX * 120);
let particleM;
function particleVerts(dt) {
  let n = 0;
  const put = (x, y, z, c, a) => {
    PBUF[n] = x; PBUF[n + 1] = y; PBUF[n + 2] = z; PBUF[n + 3] = 0; PBUF[n + 4] = 1; PBUF[n + 5] = 0;
    PBUF[n + 6] = c[0] * 1.8; PBUF[n + 7] = c[1] * 1.8; PBUF[n + 8] = c[2] * 1.8; PBUF[n + 9] = a; n += 10;
  };
  for (const pt of PART) {
    if (!pt || pt.life <= 0) continue;
    pt.life -= dt; pt.v[1] -= 9 * dt;
    pt.p[0] += pt.v[0] * dt; pt.p[1] += pt.v[1] * dt; pt.p[2] += pt.v[2] * dt;
    if (pt.p[1] < 0) { pt.p[1] = 0; pt.v[1] *= -.4; }
    const f = pt.life / pt.max, sz = .14 + f * .2, a = f * .8, [x, y, z] = pt.p;
    put(x - sz, y, z, pt.col, a); put(x + sz, y, z, pt.col, a); put(x, y + sz * 2.6, z, pt.col, 0);
    put(x - sz, y, z, pt.col, a); put(x + sz, y, z, pt.col, a); put(x, y - sz * 2.6, z, pt.col, 0);
    put(x, y - sz, z, pt.col, a); put(x, y + sz, z, pt.col, a); put(x + sz * 2.6, y, z, pt.col, 0);
    put(x, y - sz, z, pt.col, a); put(x, y + sz, z, pt.col, a); put(x - sz * 2.6, y, z, pt.col, 0);
  }
  return n;
}

// --- state ----------------------------------------------------------------
let mode = 'title', timer = 0, msg = '', msgT = 0, shake = 0, flash = 0, endT = 0;
let best = +localStorage.fbBest || 0, isBest = false;
const BOOMS = [];
let eye = null, look = null, camYaw = 0;
const say = (t, d = 2) => { msg = t; msgT = d; };

function newRun(attract) {
  newWorld(((pick % 7) + 7) % 7);
  // On the title every herd is a rival's - the plain plays itself under
  // the words, and the colour you are picking plays too.
  if (attract) leaders[0].ai = { t: 0, goal: null };
  buildPlain();
  particleM = partM();
  PART.length = 0; pcur = 0; BOOMS.length = 0;
  timer = 0; msgT = 0; shake = 0; flash = 0; endT = 0; isBest = false;
  eye = null; camYaw = leaders[0].yaw;
}
newRun(1);

// --- the frame ------------------------------------------------------------
let last = 0, lastPick = 0, chgOn = false;
function frame(now_) {
  const dt = Math.min(.05, (now_ - last) / 1000 || 0);
  last = now_;
  const doAct = acted; acted = false;
  timer += dt;
  if (mode === 'title' && pick !== lastPick) { lastPick = pick; newRun(1); }

  const P = leaders[0];
  if (mode === 'title') {
    if (awake()) music(.2, 1);
    step(dt, { turn: 0 });
    if (doAct) {
      if (!awake()) wake();
      else { newRun(); mode = 'run'; say('GATHER YOUR COLOUR', 3); }
    }
  } else if (mode === 'run') {
    const heat = Math.min(1, P.n / 12);
    music(heat, 0);
    const btn = button();
    if (btn !== chgOn) { chgOn = btn; charge(P, btn); }
    if (P.chg) rise(P.charge); else riseOff();
    step(dt, { turn: turnDir(), fwd: held.ArrowUp || held.w || (tL && tR), back: held.ArrowDown || held.s });
    if (won() || lost()) {
      mode = 'end'; endT = 0; riseOff();
      if (won()) { isBest = !best || timer < best; if (isBest) localStorage.fbBest = best = timer; }
    }
  } else {
    endT += dt;
    music(.2, 1);
    step(dt, { turn: 0 });
    if (doAct && endT > 1) { newRun(1); mode = 'title'; }
  }
  msgT = Math.max(0, msgT - dt);
  shake = Math.max(0, shake - dt * 2.5);
  flash = Math.max(0, flash - dt * 2);

  // Events into sound and sparks.
  for (const e of events) {
    if (e.k === 'join') { if (e.L === P) sJoin(P.n); burst([e.u.x, .8, e.u.z], 6, 2, COL[e.u.col]); }
    else if (e.k === 'knock') { thud(); burst([e.x, .6, e.z], 8, 4, COL[e.col]); }
    else if (e.k === 'horn') { clang(); burst([e.x, 1, e.z], 5, 3, [1, .9, .6]); }
    else if (e.k === 'fire') { whoosh(); if (e.L === P) say('FIREBALL!', 1.2); }
    else if (e.k === 'eat') burst([e.b.x, 1, e.b.z], 4, 3);
    else if (e.k === 'blast') { burst([e.x, .8, e.z], 10, 6, COL[e.col]); shake = Math.max(shake, .3); }
    else if (e.k === 'boom') { sBoom(e.pw); BOOMS.push({ x: e.x, z: e.z, t: 0, pw: e.pw }); burst([e.x, 1.5, e.z], 120, 9 + e.pw * .4); shake = 1; flash = .4; }
    else if (e.k === 'hurt') { if (e.L === P) { ouch(); say(P.hearts ? 'HEART LOST' : 'THE HERD IS GONE', 2); } }
    else if (e.k === 'dead') { if (e.L !== P) say(alive().length > 1 ? 'A RIVAL FALLS' : 'THE PLAIN IS YOURS', 2.5); }
    else if (e.k === 'land' && e.L === P && mode === 'run') say(P.n ? 'RIDE ON' : 'GATHER AGAIN', 1.5);
  }
  events.length = 0;
  for (const b of BOOMS) b.t += dt;
  while (BOOMS.length && BOOMS[0].t > 1.6) BOOMS.shift();

  // --- camera -------------------------------------------------------------
  const f = focus(), fb = P.ball;
  let ex, ey, ez, lx, ly, lz;
  if (mode === 'title') {
    // A trackside camera circling the herd of the colour you are picking,
    // which plays itself under the words: the plain is live, not a still.
    const a = timer * .25, F = P.ball || P;
    ex = F.x + Math.cos(a) * 15; ey = 5.5; ez = F.z + Math.sin(a) * 15;
    lx = F.x; ly = 1; lz = F.z;
  } else {
    // Behind the herd, pulling back as it grows, and further again to fit
    // the fireball; the yaw eases so a spin does not whip the world round.
    const yaw = fb ? Math.atan2(fb.vz, fb.vx) : P.yaw;
    camYaw += wrapA(yaw - camYaw) * Math.min(1, dt * (fb ? 3 : 2.2));
    const back = 9 + Math.sqrt(P.n) * 1.6 + (fb ? fb.r * 2.5 : 0), up = 3.6 + Math.sqrt(P.n) * .6 + (fb ? fb.r : 0);
    ex = f.x - Math.cos(camYaw) * back; ey = up; ez = f.z - Math.sin(camYaw) * back;
    lx = f.x + Math.cos(camYaw) * 6; ly = 1 + (fb ? fb.r : 0); lz = f.z + Math.sin(camYaw) * 6;
    if (P.st === 3) { ex = P.x + 10; ey = 8; ez = P.z + 10; lx = P.x; lz = P.z; ly = 1; }
  }
  if (!eye) eye = [ex, ey, ez], look = [lx, ly, lz];
  const k = Math.min(1, dt * 5);
  eye[0] = lerp(eye[0], ex, k); eye[1] = lerp(eye[1], ey, k); eye[2] = lerp(eye[2], ez, k);
  look[0] = lerp(look[0], lx, k); look[1] = lerp(look[1], ly, k); look[2] = lerp(look[2], lz, k);
  const sh = shake * shake * .5;
  const e2 = [eye[0] + (Math.random() - .5) * sh, eye[1] + (Math.random() - .5) * sh, eye[2] + (Math.random() - .5) * sh];
  const view = lookAt(e2, look);
  camR = [view[0], view[4], view[8]]; camU = [view[1], view[5], view[9]];
  const vp = mul(perspective(mode === 'title' ? .8 : 1.0, VW / VH, .1, 1500), view);

  // --- draw ---------------------------------------------------------------
  frameGL(vp, e2, FOG);
  drawMesh(groundM, IDENT);
  const T = now();
  for (const u of units) {
    if (u.st === 2 && !(u.lead >= 0 && leaders[u.lead].ball)) continue;
    const L = u.lead >= 0 ? leaders[u.lead] : null, set = U[u.st === 3 ? WILD : u.col];
    let x = u.x, y = u.y, z = u.z, s = u.hearts ? 1.25 : 1, yaw = u.yaw;
    // Folding into the fireball: the slot on the sphere, and a tumble.
    const m = u.st === 2 ? 1 : u.morph * u.morph * (3 - 2 * u.morph);
    if (m > 0 && L) {
      const b = L.ball, cx = b ? b.x : L.x, cz = b ? b.z : L.z, r = (b ? b.r : radius(L.n)) * .75;
      const th = u.seed * 7 + T * (2 + 4 * m) * (u.seed > 3.5 ? 1 : -1), ph = Math.sin(u.seed * 3 + T) * 1.2;
      x = lerp(x, cx + Math.cos(th) * Math.cos(ph) * r, m); z = lerp(z, cz + Math.sin(th) * Math.cos(ph) * r, m);
      y = lerp(y, (b ? b.r : 1.2) + Math.sin(ph) * r, m);
      yaw += m * T * 6; s *= 1 - .5 * m;
    }
    const bob = u.st ? 0 : Math.sin(u.ph * 2) * .05 * Math.min(1, u.sp / 5);
    const M = modelTR(x, y + bob, z, -yaw + Math.PI / 2, s);
    // Thrown: tumbling end over end.
    if (u.st === 1) { const c = Math.cos(u.yaw * 2), si = Math.sin(u.yaw * 2); M[5] = c * s; M[6] = si * s; M[9] = -si * s; M[10] = c * s; }
    drawMesh(set.body, M);
    // The head nods to the beat on the leader, and drops when charging.
    const nod = (u.hearts ? -.12 * beat : 0) - (u.chg ? .4 * u.charge : 0);
    const c = Math.cos(nod), si = Math.sin(nod);
    drawMesh(u.hearts ? set.crown : set.head, mul(M, [1, 0, 0, 0, 0, c, si, 0, 0, -si, c, 0, PIVOT[0], PIVOT[1], PIVOT[2], 1]));
    const amp = Math.min(1, u.sp / 6) * .7;
    HIPS.forEach(([hx, hz], i) => {
      const sw = Math.sin(u.ph * 2 + (i === 0 || i === 3 ? 0 : Math.PI)) * amp, cs = Math.cos(sw), sn = Math.sin(sw);
      drawMesh(set.leg, mul(M, [1, 0, 0, 0, 0, cs, sn, 0, 0, -sn, cs, 0, hx, .43, hz, 1]));
    });
  }
  // Glow, all of it additive: tufts, stars, the edge, the fireballs, the
  // halos of a folding herd, the rings of an explosion, and the sparks.
  glMode(1);
  drawMesh(tuftM, IDENT); drawMesh(postM, IDENT); drawMesh(starM, IDENT);
  for (const b of balls) {
    // Seven layers, one per colour, each wobbling on its own orbit - the
    // ball is a rainbow churning, not a white light. A faint white core and
    // a pool of light on the ground under it.
    for (let i = 0; i < 3; i++) {
      const c = (i * 2 + (T * 3 | 0)) % 7, w = b.r * .3;
      disc(c, b.x + Math.cos(T * 5 + i * 2.1) * w, b.r + Math.sin(T * 6 + i * 2) * w, b.z + Math.sin(T * 5 + i * 2.1) * w, b.r * (1.4 - i * .15));
    }
    for (let i = 0; i < 4; i++) ring((i * 3 + (T * 2 | 0)) % 7, bill(b.x, b.r, b.z, b.r * (1.1 + i * .22 + Math.sin(T * 8 + i) * .08)));
    disc(WILD, b.x, .05, b.z, b.r * 1.6);
    spawnP([b.x, b.r * .8, b.z], [(Math.random() - .5) * 6 - b.vx * .1, 3, (Math.random() - .5) * 6 - b.vz * .1], RAINBOW[(Math.random() * 7) | 0], .7);
  }
  for (const L of leaders) if (L.chg) {
    // The charge halo: rainbow layers pulsing faster as the charge fills.
    const r = radius(L.n) * (.3 + L.charge * .9), p = .85 + .15 * Math.sin(T * (10 + L.charge * 30));
    for (let i = 0; i < 4; i++) disc(((T * 4 + i * 2) | 0) % 7, L.x, 1.2, L.z, r * (1.3 - i * .25) * p);
    disc(WILD, L.x, .05, L.z, r * 1.8);
  }
  for (const b of BOOMS) {
    // The rainbow: seven shockwaves racing outward on the ground, red on
    // the outside, and a slower dome of the same rising off it.
    const k = b.t / 1.6, R = (4 + b.pw * .6) * Math.sqrt(k) * 2.2;
    for (let i = 0; i < 7; i++) {
      ring(i, flat(b.x, .15 + i * .05, b.z, R * (1 - i * .07) * (1.3 - k)));
      ring(i, bill(b.x, 1 + k * 6, b.z, R * .5 * (1 - i * .07)));
    }
    disc(WILD, b.x, 1.5, b.z, R * .5 * (1 - k));
  }
  const pn = particleVerts(dt);
  updateMesh(particleM, PBUF, pn);
  if (pn) drawMesh(particleM, IDENT);
  glMode(0);

  // --- HUD ----------------------------------------------------------------
  ctx.clearRect(0, 0, VW, VH);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (flash) { ctx.fillStyle = `rgba(255,255,255,${flash * .6})`; ctx.fillRect(0, 0, VW, VH); }
  const pc = COL[P.col];
  if (mode === 'title') {
    const sc = ctx.createLinearGradient(0, 0, 0, VH);
    sc.addColorStop(0, 'rgba(5,4,14,.7)'); sc.addColorStop(.55, 'rgba(5,4,14,.25)'); sc.addColorStop(1, 'rgba(5,4,14,0)');
    ctx.fillStyle = sc; ctx.fillRect(0, 0, VW, VH);
    // The title, once per colour, stacked: a rainbow made of the word.
    ctx.font = 'bold 44px system-ui';
    RAINBOW.forEach((c, i) => { ctx.fillStyle = css(c, .9); ctx.fillText('UNICORN FIREBALL', VW / 2 + (3 - i) * 1.5 - beat * (3 - i), 70 + (i - 3) * 2.5); });
    ctx.fillStyle = '#f3ead6'; ctx.fillText('UNICORN FIREBALL', VW / 2, 70);
    ctx.font = '15px system-ui';
    ctx.fillStyle = '#d8d0ea';
    ctx.fillText('gather every unicorn of your colour into a herd', VW / 2, 120);
    ctx.fillText('hold SPACE: the herd becomes a fireball  -  release to fire it', VW / 2, 142);
    ctx.fillText('a bigger fireball wins the clash; a smaller herd loses its horns', VW / 2, 164);
    ctx.font = 'bold 15px system-ui';
    ctx.fillStyle = pc;
    ctx.fillStyle = css(pc);
    ctx.beginPath(); ctx.arc(VW / 2, VH * .65, 14, 0, TAU); ctx.fill();
    ctx.fillStyle = '#f3ead6';
    ctx.fillText('<   your colour   >', VW / 2, VH * .65 + 34);
    ctx.font = 'bold 18px system-ui';
    ctx.fillStyle = (timer * 2 | 0) % 2 ? '#fff' : '#c9b8ff';
    ctx.fillText(awake() ? 'press SPACE to run' : 'press SPACE', VW / 2, VH - 42);
    ctx.font = '12px system-ui'; ctx.fillStyle = '#9a90b8';
    ctx.fillText('arrows steer  -  up sprints  -  touch: sides steer, top strip fires', VW / 2, VH - 18);
    ctx.fillText('@gtanczyk | gamedev.pl | 2026', VW / 2, VH - 4);
  } else {
    // Your herd: a dot in your colour, the count, the hearts.
    ctx.textAlign = 'left';
    ctx.fillStyle = css(pc); ctx.beginPath(); ctx.arc(24, 24, 11, 0, TAU); ctx.fill();
    ctx.fillStyle = '#f3ead6'; ctx.font = 'bold 26px system-ui'; ctx.fillText(P.n, 44, 24);
    ctx.font = '18px system-ui'; ctx.fillStyle = '#ff6b8a';
    ctx.fillText('♥'.repeat(P.hearts), 90, 23);
    // The rivals, biggest first, so the threat is at the top.
    ctx.textAlign = 'right'; ctx.font = 'bold 14px system-ui';
    [...leaders].slice(1).sort((a, b) => b.n - a.n).forEach((L, i) => {
      const y = 22 + i * 20, dead = L.st === 3;
      ctx.fillStyle = css(COL[L.col], dead ? .3 : 1); ctx.beginPath(); ctx.arc(VW - 100, y, 6, 0, TAU); ctx.fill();
      ctx.fillStyle = dead ? '#666' : '#e8e0f4';
      ctx.fillText(dead ? '-' : L.n + (L.chg ? ' !' : L.ball ? ' >' : ''), VW - 112, y);
      // Its hearts, so you can see who is one hit from stone.
      if (!dead) { ctx.fillStyle = '#ff6b8a'; ctx.font = '10px system-ui'; ctx.fillText('♥'.repeat(L.hearts), VW - 150, y); ctx.font = 'bold 14px system-ui'; }
    });
    // The radar: the whole plain in a square, leaders as dots sized by
    // herd, fireballs as rings. It is how you see a fireball coming.
    const RX = VW - 78, RY = 10, RS = 68;
    ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.fillRect(RX, RY, RS, RS);
    const rp = (x, z) => [RX + (x / ARENA + 1) * RS / 2, RY + (z / ARENA + 1) * RS / 2];
    for (const u of units) {
      if (u.st === 3 || u.lead >= 0 && u.st !== 0 && !u.hearts) continue;
      const [x, y] = rp(u.x, u.z);
      ctx.fillStyle = css(COL[u.col], u.lead < 0 ? .45 : .9);
      ctx.fillRect(x - .7, y - .7, 1.5, 1.5);
      if (u.hearts) { ctx.beginPath(); ctx.arc(x, y, 1.5 + Math.sqrt(u.n) * .8, 0, TAU); ctx.fill(); }
    }
    ctx.strokeStyle = '#fff';
    for (const b of balls) { const [x, y] = rp(b.x, b.z); ctx.beginPath(); ctx.arc(x, y, 3 + b.r, 0, TAU); ctx.stroke(); }
    ctx.strokeStyle = css(pc); ctx.strokeRect(RX + .5, RY + .5, RS - 1, RS - 1);
    ctx.textAlign = 'center';
    // The charge bar, or the fireball's remaining flight.
    if (P.chg || P.ball) {
      const k = P.ball ? P.ball.life / (1.5 + P.ball.pw * .11) : P.charge;
      ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(VW / 2 - 80, VH - 30, 160, 10);
      const g = ctx.createLinearGradient(VW / 2 - 80, 0, VW / 2 + 80, 0);
      RAINBOW.forEach((c, i) => g.addColorStop(i / 6, css(c)));
      ctx.fillStyle = g; ctx.fillRect(VW / 2 - 80, VH - 30, 160 * k, 10);
      ctx.font = 'bold 12px system-ui'; ctx.fillStyle = '#fff';
      ctx.fillText(P.ball ? 'POWER ' + Math.round(P.ball.pw) : k >= 1 ? 'RELEASE!' : 'CHARGING ' + Math.round((1 + P.n * P.charge)), VW / 2, VH - 42);
    } else if (P.st === 0 && P.n >= 2 && timer < 40 && !P.cool) {
      ctx.font = '12px system-ui'; ctx.fillStyle = 'rgba(255,255,255,.5)';
      ctx.fillText('hold SPACE to charge', VW / 2, VH - 26);
    }
    if (msgT) {
      ctx.font = 'bold 26px system-ui'; ctx.fillStyle = `rgba(255,244,214,${Math.min(1, msgT)})`;
      ctx.fillText(msg, VW / 2, VH * .3);
    }
    ctx.font = '13px system-ui'; ctx.fillStyle = 'rgba(255,255,255,.6)';
    ctx.fillText(Math.floor(timer / 60) + ':' + String(Math.floor(timer % 60)).padStart(2, '0'), VW / 2, 16);
    if (mode === 'end') {
      ctx.fillStyle = 'rgba(5,4,14,.6)'; ctx.fillRect(0, VH * .3, VW, VH * .42);
      ctx.font = 'bold 40px system-ui'; ctx.fillStyle = '#f3ead6';
      ctx.fillText(lost() ? 'THE PLAIN FORGETS YOU' : 'THE PLAIN IS YOURS', VW / 2, VH * .44);
      ctx.font = '17px system-ui'; ctx.fillStyle = '#d8d0ea';
      if (!lost()) ctx.fillText((isBest ? 'best time  ' : 'time  ') + timer.toFixed(1) + 's' + (best && !isBest ? '   best ' + best.toFixed(1) + 's' : ''), VW / 2, VH * .56);
      else ctx.fillText('every unicorn you gathered has gone wild', VW / 2, VH * .56);
      if (endT > 1) ctx.fillText('press SPACE', VW / 2, VH * .66);
    }
  }
  clearBeat();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

if (DEV) window.FB = { units, leaders, balls, events, step, charge, get mode() { return mode; }, get timer() { return timer; }, reset: (c, ai) => { pick = c; lastPick = c; newRun(ai); } };

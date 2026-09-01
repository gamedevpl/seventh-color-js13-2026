// UNICORN FIREBALL. Run the plain as a unicorn of one colour, gather every
// unicorn that shares it into a herd, and fight the other herds horn to
// horn. Hold the button and the herd CHARGES: it tightens into a wedge and
// gathers speed, arcs crackle between the unicorns, and if you hold it
// long enough the whole band ignites into a sliding rainbow the size of
// itself. Only the rainbow does real harm, and two rainbows that meet
// explode - the bigger herd wins, and the loser's herd is thrown across
// the plain, where the gathering starts again.

import { gl, initGL, frameGL, mode as glMode, createMesh, updateMesh, drawMesh, perspective, lookAt, mul, modelTR, IDENT, pushBox, setDim } from './gl.js';
import { buildAll, COL, RAINBOW, PIVOT, HIPS } from './uni.js';
import { units, leaders, events, meadows, newWorld, step, charge, won, lost, alive, footprint, burnTime, nearEdge, ARENA, EDGE, WILD, now } from './herd.js';
import { wake, awake, music, join as sJoin, clang, thud, rise, riseOff, whoosh, ignite as sIgnite, boom as sBoom, ouch, beat, clearBeat } from './snd.js';

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
// Yaw grows toward +z, and +z is the RIGHT of a camera looking along +x -
// so LEFT lowers the yaw. The first build had this backwards, and the probe
// happily asserted the backwards version, because it only checked that a
// left thumb moved the yaw, not which way.
const turnDir = () => (held.ArrowRight || held.d || (tR && !tL) ? 1 : 0) - (held.ArrowLeft || held.a || (tL && !tR) ? 1 : 0);
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

// --- the charge, the arcs, and the rainbow's wake -------------------------
// A charging herd crackles: bolts jump between its unicorns, more of them
// and brighter as the charge fills, and the ground under the band lights
// up. When it ignites, every unicorn carries a disc of its own colour, a
// haze hangs over the centre of the band, and the band drags a WAKE - seven
// stripes across its width, the width of the herd, rising off the ground -
// which is the rainbow you see coming from the other side of the plain.
const ARCMAX = 60, ABUF = new Float32Array(ARCMAX * 6 * 6 * 10);
const TBUF = new Float32Array(200000);
let arcM, trailM;
function drawCharge(L, T, dt) {
  const k = L.charge, wave = L.wave > 0;
  if (k < .04 && !wave) return;
  // The ground, lit from within the band.
  setDim(wave ? .18 : k * .8);
  disc(WILD, L.cx, .05, L.cz, L.r * 1.4);
  setDim(1);
  const herd = [];
  for (const u of units) if (u.st === 0 && (u === L || u.lead === L.lead)) herd.push(u);
  // Arcs. Rare and thin at first, a storm at the top of the charge.
  if (herd.length > 1 && k > .1 && Math.random() < dt * (k * k * k * 150 + (wave ? 30 : 0)) && ARCS.length < ARCMAX) {
    const a = herd[(Math.random() * herd.length) | 0];
    let b = null, bd = 9;
    for (let i = 0; i < 4; i++) {
      const c = herd[(Math.random() * herd.length) | 0], d = Math.hypot(c.x - a.x, c.z - a.z);
      if (c !== a && d < bd) { b = c; bd = d; }
    }
    const col = RAINBOW[(Math.random() * 7) | 0];
    // Past two thirds the bolts also reach UP, to a point hanging over the
    // band - the energy gathering above the herd before it lights.
    if (b && (k < .66 || Math.random() < .5)) ARCS.push({ a: [a.x, .9, a.z], b: [b.x, .9, b.z], col, t: .15, w: .14 + .3 * k });
    else ARCS.push({ a: [a.x, .9, a.z], b: [L.cx, 1.2 + L.r * .8, L.cz], col, t: .15, w: .1 + .24 * k });
    spawnP([a.x, 1, a.z], [0, 2, 0], col, .3);
  }
  if (!wave) return;
  // Lit: each unicorn a lamp of its own colour, the band under a haze.
  // The lamps ARE the herd now that its unicorns are not drawn, so they
  // are small and dim: a line of coloured lights inside the tunnel, not a
  // white wall at the head of it.
  setDim(.13);
  herd.forEach((u, i) => disc(i % 7, u.x, .8, u.z, 1.25));
  setDim(.1);
  for (let i = 0; i < 3; i++) disc(((T * 3 + i * 2) | 0) % 7, L.cx, 1 + i * .6 + L.r * .15, L.cz, L.r * (1.05 - i * .28));
  setDim(1);
  // Motes lifting off the band.
  if (Math.random() < .6) { const u = herd[(Math.random() * herd.length) | 0]; spawnP([u.x, 1, u.z], [0, 2.5, 0], RAINBOW[(Math.random() * 7) | 0], .6); }
  // Sample the wake.
  // Sample the wake. The LAST sample is the herd's position this frame,
  // rewritten every frame: pushing one every ninth of a second and leaving
  // it there made the front of the tunnel jump forward three units at a
  // time at charge speed, which is exactly what it looked like.
  let tr = TRAIL.get(L);
  if (!tr) TRAIL.set(L, tr = { s: [], since: 1 });
  const head = { x: L.cx, z: L.cz, yaw: L.yaw, r: L.r * 1.1, t: 0 };
  tr.since += dt;
  if (tr.since > .05 || tr.s.length < 2) { tr.since = 0; tr.s.push(head); }
  else tr.s[tr.s.length - 1] = head;
}
// The wake: the rainbow itself, as an ARCH the width of the herd, standing
// over the band and extruded back along where it ran - a tunnel of seven
// bands the herd runs inside, red outermost, that dissolves behind it. It
// is Rainbow Surfer's braid with the herd where the rider was.
const ARCH = 9;                                   // segments per half-circle
function trailVerts(T, dt, eye) {
  let n = 0;
  const put = (x, y, z, c, a) => {
    TBUF[n] = x; TBUF[n + 1] = y; TBUF[n + 2] = z; TBUF[n + 3] = 0; TBUF[n + 4] = 1; TBUF[n + 5] = 0;
    TBUF[n + 6] = c[0] * 1.4; TBUF[n + 7] = c[1] * 1.4; TBUF[n + 8] = c[2] * 1.4; TBUF[n + 9] = a; n += 10;
  };
  const quad = (p0, p1, p2, p3, c, a) => { put(...p0, c, a); put(...p1, c, a); put(...p2, c, a); put(...p0, c, a); put(...p2, c, a); put(...p3, c, a); };
  // A point on the arch of sample s: colour band c, angle index i, at the
  // band's inner (e=0) or outer (e=1) edge.
  const pt = (s, c, i, e, T) => {
    const th = i / ARCH * Math.PI, R = s.r * (1.05 - c * .075 + e * .07) * (1 + Math.sin(T * 5 + i) * .03);
    const sx = -Math.sin(s.yaw), sz = Math.cos(s.yaw);
    return [s.x + sx * Math.cos(th) * R, .15 + Math.sin(th) * R * .85, s.z + sz * Math.cos(th) * R];
  };
  for (const [L, tr] of TRAIL) {
    for (const s of tr.s) s.t += dt;
    while (tr.s.length && tr.s[0].t > .9) tr.s.shift();
    if (!tr.s.length) { TRAIL.delete(L); continue; }
    for (let i = 0; i + 1 < tr.s.length && n < TBUF.length - 8000; i++) {
      const s0 = tr.s[i], s1 = tr.s[i + 1];
      // Fade with age, and fade out again where the tunnel runs past the
      // camera - being inside your own rainbow is the point, being blinded
      // by it is not.
      const near = Math.min(1, Math.max(0, (Math.hypot(s1.x - eye[0], s1.z - eye[2]) - 5) / 9));
      const f = (2 - s0.t / .9 - s1.t / .9) / 2 * near;
      if (f <= 0) continue;
      for (let c = 0; c < 7; c++) {
        for (let k = 0; k < ARCH; k++) {
          quad(pt(s0, c, k, 0, T), pt(s0, c, k + 1, 0, T), pt(s1, c, k + 1, 0, T), pt(s1, c, k, 0, T), RAINBOW[c], .26 * f);
        }
      }
    }
  }
  return n;
}
// The arcs: jagged bolts, each a ribbon facing the camera, alive for a
// few frames and gone.
function arcVerts(dt) {
  let n = 0;
  const put = (x, y, z, c, a) => {
    ABUF[n] = x; ABUF[n + 1] = y; ABUF[n + 2] = z; ABUF[n + 3] = 0; ABUF[n + 4] = 1; ABUF[n + 5] = 0;
    ABUF[n + 6] = c[0] * 1.2 + .7; ABUF[n + 7] = c[1] * 1.2 + .7; ABUF[n + 8] = c[2] * 1.2 + .7; ABUF[n + 9] = a; n += 10;
  };
  for (let i = ARCS.length - 1; i >= 0; i--) {
    const A = ARCS[i];
    A.t -= dt;
    if (A.t <= 0) { ARCS.splice(i, 1); continue; }
    const a = A.t / .15, S = 6;
    let px = A.a[0], py = A.a[1], pz = A.a[2];
    for (let s = 1; s <= S; s++) {
      const f = s / S, j = s < S ? (1 - Math.abs(2 * f - 1)) * .45 : 0;
      const x = A.a[0] + (A.b[0] - A.a[0]) * f + (Math.random() - .5) * j, y = A.a[1] + (Math.random() - .3) * j * 1.6, z = A.a[2] + (A.b[2] - A.a[2]) * f + (Math.random() - .5) * j;
      const w = A.w, ux = camU[0] * w, uy = camU[1] * w, uz = camU[2] * w;
      put(px - ux, py - uy, pz - uz, A.col, a); put(px + ux, py + uy, pz + uz, A.col, a); put(x + ux, y + uy, z + uz, A.col, a);
      put(px - ux, py - uy, pz - uz, A.col, a); put(x + ux, y + uy, z + uz, A.col, a); put(x - ux, y - uy, z - uz, A.col, a);
      px = x; py = y; pz = z;
    }
  }
  return n;
}
const WILDC = COL[WILD];

// --- state ----------------------------------------------------------------
let mode = 'title', timer = 0, msg = '', msgT = 0, shake = 0, flash = 0, endT = 0;
// A private window throws on the FIRST TOUCH of localStorage - the read as
// much as the write - and a best time is a nicety, never a reason for the
// game to fail to boot. Both ends are guarded.
let best = 0, isBest = false;
try { best = +localStorage.fbBest || 0; } catch {}
const BOOMS = [], TRAIL = new Map(), ARCS = [];
let eye = null, look = null, camYaw = 0;
const say = (t, d = 2) => { msg = t; msgT = d; };

function newRun(attract) {
  newWorld(((pick % 7) + 7) % 7);
  // On the title every herd is a rival's - the plain plays itself under
  // the words, and the colour you are picking plays too.
  if (attract) leaders[0].ai = { t: 0, goal: null };
  buildPlain();
  particleM = partM(); arcM = partM(); trailM = partM();
  PART.length = 0; pcur = 0; BOOMS.length = 0; TRAIL.clear(); ARCS.length = 0;
  timer = 0; msgT = 0; shake = 0; flash = 0; endT = 0; isBest = false;
  eye = null; camYaw = leaders[0].yaw;
}
newRun(1);

// --- the frame ------------------------------------------------------------
let last = 0, lastPick = 0;
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
    charge(P, button());
    if (P.chg && P.st === 0) rise(P.wave ? 1 : P.charge); else riseOff();
    step(dt, { turn: turnDir(), fwd: held.ArrowUp || held.w || (tL && tR), back: held.ArrowDown || held.s });
    if (won() || lost()) {
      mode = 'end'; endT = 0; riseOff();
      if (won()) { isBest = !best || timer < best; if (isBest) { best = timer; try { localStorage.fbBest = timer; } catch {} } }
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
    else if (e.k === 'chg') { if (e.L === P) say('CHARGE!', 1); }
    else if (e.k === 'ignite') {
      // The band lights: a flash, a fan of sparks the size of the herd, and
      // the riser resolving into a chord.
      whoosh(); sIgnite();
      burst([e.L.cx, 1.2, e.L.cz], 40 + e.L.n * 6, 5 + e.L.r);
      if (e.L === P) { say('RAINBOW!', 1.5); flash = Math.max(flash, .35); }
    }
    else if (e.k === 'fizzle') { if (e.L === P) say(P.cool ? 'SPENT' : '', 1); }
    else if (e.k === 'spend') { burst([e.u.x, .8, e.u.z], 5, 3, COL[e.u.col]); }
    else if (e.k === 'lost') { thud(); burst([e.u.x, .8, e.u.z], 8, 5, COL[WILD]); }
    else if (e.k === 'fell') {
      sBoom(3); shake = 1;
      if (e.L === P) say('OFF THE PLAIN', 3); else say('A RIVAL RUNS OFF THE PLAIN', 2.5);
    }
    else if (e.k === 'blast') { burst([e.x, .8, e.z], 10, 6, COL[e.col]); if (e.L === P) shake = Math.max(shake, .3); }
    else if (e.k === 'boom') { sBoom(e.pw); BOOMS.push({ x: e.x, z: e.z, t: 0, pw: e.pw }); burst([e.x, 1.5, e.z], 120, 9 + e.pw * .4); shake = 1; flash = .4; }
    else if (e.k === 'hurt') { if (e.L === P) { ouch(); say(P.hearts ? 'HEART LOST' : 'THE HERD IS GONE', 2); } }
    else if (e.k === 'dead') { if (e.L !== P) say(alive().length > 1 ? 'A RIVAL FALLS' : 'THE PLAIN IS YOURS', 2.5); }
  }
  events.length = 0;
  for (const b of BOOMS) b.t += dt;
  while (BOOMS.length && BOOMS[0].t > 1.6) BOOMS.shift();

  // --- camera -------------------------------------------------------------
  let ex, ey, ez, lx, ly, lz;
  if (mode === 'title') {
    // A trackside camera circling the herd of the colour you are picking,
    // which plays itself under the words: the plain is live, not a still.
    const a = timer * .25;
    ex = P.x + Math.cos(a) * 15; ey = 5.5; ez = P.z + Math.sin(a) * 15;
    lx = P.x; ly = 1; lz = P.z;
  } else {
    // Behind the herd, pulling back as it grows and further as it runs -
    // a charge should feel like the ground coming at you. The yaw eases
    // so a spin does not whip the world round.
    camYaw += wrapA(P.yaw - camYaw) * Math.min(1, dt * 2.2);
    const sp = Math.min(1, P.spd / 33);
    // Lit, the shot opens right up: you are a hundred feet of rainbow now,
    // and a camera on your shoulder shows none of it.
    const lit = P.wave ? 1 : 0;
    const back = 9 + Math.sqrt(P.n) * 1.6 + sp * 5 + lit * (10 + P.r * 1.6);
    const up = 3.6 + Math.sqrt(P.n) * .6 + sp * 1.2 + lit * (6 + P.r);
    ex = P.x - Math.cos(camYaw) * back; ey = up; ez = P.z - Math.sin(camYaw) * back;
    lx = P.x + Math.cos(camYaw) * (6 + sp * 8); ly = 1 + lit * 2; lz = P.z + Math.sin(camYaw) * (6 + sp * 8);
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
    // A lit herd IS the rainbow: its unicorns are not drawn at all while
    // it burns. They fade out as the charge tops out and fade back in when
    // it goes out, so the change of state is a dissolve, not a cut.
    const L0 = u.lead >= 0 ? leaders[u.lead] : null;
    const gone = L0 ? (L0.wave ? 1 : Math.max(0, (L0.charge - .82) / .18)) : 0;
    if (gone >= 1) continue;
    const set = U[u.st === 3 ? WILD : u.col];
    const x = u.x, y = u.y, z = u.z, s = (u.hearts ? 1.25 : 1) * u.size * (1 - gone * .6), yaw = u.yaw;
    const bob = u.st ? 0 : Math.sin(u.ph * 2) * .05 * Math.min(1, u.sp / 5);
    const M = modelTR(x, y + bob, z, -yaw + Math.PI / 2, s);
    // Thrown: it tumbles about its long axis, and lands on its side. `up`
    // is the second and a half it spends rolling back onto its feet -
    // before, it simply snapped upright the instant it touched down.
    const tilt = u.st === 1 ? u.roll : u.up > 0 ? (u.up / .55) * 1.4 : 0;
    if (tilt) {
      const c = Math.cos(tilt), si = Math.sin(tilt);
      // Roll about the model's own forward axis (z after the yaw).
      const r = [c, si, 0, 0, -si, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
      const R = mul(M, r);
      for (let i = 0; i < 16; i++) M[i] = R[i];
    }
    drawMesh(set.body, M);
    // The head nods to the beat, drops into a charge, and THRUSTS on a
    // horn strike - the one that lands the blow throws its head down and
    // forward, the one that takes it rears back.
    const nod = (u.hearts ? -.12 * beat : 0) - (u.chg ? .4 * u.charge : 0)
      - u.lunge * u.lunge * .9 + u.recoil * u.recoil * 1.1;
    const c = Math.cos(nod), si = Math.sin(nod);
    drawMesh(u.hearts ? set.crown : set.head, mul(M, [1, 0, 0, 0, 0, c, si, 0, 0, -si, c, 0, PIVOT[0], PIVOT[1], PIVOT[2], 1]));
    const amp = Math.min(1, u.sp / 6) * .7 * u.gait;
    HIPS.forEach(([hx, hz], i) => {
      const sw = Math.sin(u.ph * 2 + u.seed + (i === 0 || i === 3 ? 0 : Math.PI)) * amp, cs = Math.cos(sw), sn = Math.sin(sw);
      drawMesh(set.leg, mul(M, [1, 0, 0, 0, 0, cs, sn, 0, 0, -sn, cs, 0, hx, .43, hz, 1]));
    });
  }
  // Glow, all of it additive: tufts, stars, the edge, the charge and its
  // arcs, the rainbow and its wake, the rings of an explosion, the sparks.
  glMode(1);
  drawMesh(tuftM, IDENT); drawMesh(postM, IDENT); drawMesh(starM, IDENT);
  for (const L of leaders) if (L.st !== 3) drawCharge(L, T, dt);
  // The edge, while you are near it: a band of red light on the ground
  // between the herd and the posts. It is drawn from the herd outward, so
  // the warning arrives in the direction you are about to leave in.
  if (mode !== 'title' && nearEdge(P.x, P.z) && P.st !== 3) {
    const w = (Math.max(Math.abs(P.x), Math.abs(P.z)) - (ARENA - EDGE)) / EDGE;
    setDim(.25 + .45 * w * (.7 + .3 * Math.sin(T * 12)));
    for (let i = -3; i <= 3; i++) {
      const a = camYaw + i * .18;
      disc(0, P.x + Math.cos(a) * 14, .06, P.z + Math.sin(a) * 14, 7);
    }
    setDim(1);
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
  const tn = trailVerts(T, dt, e2);
  updateMesh(trailM, TBUF, tn);
  if (tn) drawMesh(trailM, IDENT);
  const an = arcVerts(dt);
  updateMesh(arcM, ABUF, an);
  if (an) drawMesh(arcM, IDENT);
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
    ctx.fillText('gather every unicorn of your colour into a herd, and fight horn to horn', VW / 2, 120);
    ctx.fillText('hold SPACE to charge: the herd gathers speed, and lights up as it runs', VW / 2, 142);
    ctx.fillText('hold long enough and the herd BECOMES the rainbow - the bigger one wins', VW / 2, 164);
    ctx.fillStyle = '#ffb0b8';
    ctx.fillText('the rainbow burns your herd as it runs, and the edge of the plain is the end', VW / 2, 186);
    ctx.fillStyle = '#d8d0ea';
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
    ctx.fillText('arrows steer  -  up sprints  -  touch: sides steer, top strip charges', VW / 2, VH - 18);
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
      ctx.fillText(dead ? '-' : L.n + (L.wave ? ' ~' : L.chg ? ' !' : ''), VW - 112, y);
      // Its hearts, but only once it has lost one. Three hearts beside
      // every rival is a wall of pink that says nothing; the row you want
      // to find is the one that is DOWN to one, and it only reads as an
      // alarm if the quiet rows next to it are quiet.
      if (!dead && L.hearts < 3) { ctx.fillStyle = '#ff6b8a'; ctx.font = '10px system-ui'; ctx.fillText('♥'.repeat(L.hearts), VW - 150, y); ctx.font = 'bold 14px system-ui'; }
    });
    // The radar: the whole plain in a square, leaders as dots sized by
    // herd, a rainbow as a ring. It is how you see one coming from behind.
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
    for (const L of leaders) if (L.wave) { const [x, y] = rp(L.cx, L.cz); ctx.beginPath(); ctx.arc(x, y, 2 + L.r * .4, 0, TAU); ctx.stroke(); }
    ctx.strokeStyle = css(pc); ctx.strokeRect(RX + .5, RY + .5, RS - 1, RS - 1);
    ctx.textAlign = 'center';
    // The charge bar: how far the charge is from igniting, then how much
    // rainbow is left to burn.
    if (P.chg || P.wave) {
      const k = P.wave ? P.burn / (2.5 + .12 * P.n) : P.charge;
      ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(VW / 2 - 80, VH - 30, 160, 10);
      const g = ctx.createLinearGradient(VW / 2 - 80, 0, VW / 2 + 80, 0);
      RAINBOW.forEach((c, i) => g.addColorStop(i / 6, css(c)));
      ctx.fillStyle = g; ctx.fillRect(VW / 2 - 80, VH - 30, 160 * k, 10);
      ctx.font = 'bold 12px system-ui'; ctx.fillStyle = '#fff';
      ctx.fillText(P.wave ? 'RAINBOW - herd ' + P.n : 'CHARGE ' + Math.round(P.charge * 100) + '%', VW / 2, VH - 42);
    } else if (P.st === 0 && P.n >= 2 && timer < 40 && !P.cool) {
      ctx.font = '12px system-ui'; ctx.fillStyle = 'rgba(255,255,255,.5)';
      ctx.fillText('hold SPACE to charge', VW / 2, VH - 26);
    }
    if (nearEdge(P.x, P.z) && P.st !== 3 && mode === 'run') {
      ctx.font = 'bold 20px system-ui';
      ctx.fillStyle = (timer * 5 | 0) % 2 ? '#ff5f6e' : '#ffb0b8';
      ctx.fillText('THE EDGE - TURN BACK', VW / 2, VH * .18);
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

if (DEV) window.FB = { units, leaders, events, step, charge, get mode() { return mode; }, get timer() { return timer; }, reset: (c, ai) => { pick = c; lastPick = c; newRun(ai); mode = 'run'; } };

import { lightning } from './lightning.js';
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
import { units, leaders, events, meadows, newWorld, step, charge, won, lost, alive, rnd, lerp, wrapA, edgeDanger, ARENA, EDGE, WILD, now, burnTime } from './herd.js';
import { net, open as netOpen, close as netClose, tick as netTick, ghost, spy } from './net.js';
import { wake, music, join as sJoin, clang, thud, boom as sBoom, ouch, beat, clearBeat } from './snd.js';

document.title = 'UNICORN FIREBALL';
const VW = 640, VH = 360;
const FOG = [.07, .05, .13];
const TAU = Math.PI * 2;
const dot = (x, y, r) => { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); };
const css = (c, a = 1) => `rgba(${c[0] * 255 | 0},${c[1] * 255 | 0},${c[2] * 255 | 0},${a})`;

const glc = document.getElementById('c');
glc.width = VW; glc.height = VH;
initGL(glc);
const wrap = document.createElement('div');
wrap.style.position = 'relative';
glc.before(wrap);
wrap.append(glc);
const hud = document.createElement('canvas');
hud.width = VW; hud.height = VH;
hud.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
wrap.append(hud);
const ctx = hud.getContext('2d');
const label = (text, y, x = VW / 2) => ctx.fillText(text, x, y);
const font = (size, bold) => { ctx.font = (bold ? 'bold ' : '') + size + 'px system-ui'; };
function resize() {
  const sc = Math.min(innerWidth / VW, innerHeight / VH);
  glc.style.width = VW * sc + 'px';
  glc.style.height = VH * sc + 'px';
}
addEventListener('resize', resize);
resize();

// --- input ----------------------------------------------------------------
// Keyboard: arrows or WASD steer and sprint; hold SPACE to charge and burn,
// Touch: sides steer, both sprint; drag either thumb to steer the sprint.
// Top charges, bottom centre brakes. Roles stay fixed until release.
const held = {};
let acted = false, pick = 0;
addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase();
  if (!held[key]) {
    const l = key === 'arrowleft' || key === 'a', r = key === 'arrowright' || key === 'd';
    if (mode === 'title') { if (l) pick--; if (r) pick++; }
    else if (watching()) { if (l) watch--; if (r) watch++; }
  }
  held[key] = true;
  if (key === 'o') goOnline();
  if (key === 'escape' && net.on) goHome();
  if (key === ' ' || key === 'enter') acted = true;
  if (key === ' ') e.preventDefault();
});
addEventListener('keyup', (e) => { held[e.key.toLowerCase()] = false; });
const touch = navigator.maxTouchPoints > 0;
const pts = new Map();
let tL = 0, tR = 0, tT = 0, tB = 0, tF = 0;
const at = (e) => {
  const r = hud.getBoundingClientRect();
  return [(e.clientX - r.left) / r.width * VW, (e.clientY - r.top) / r.height * VH];
};
const scan = () => {
  tL = tR = tT = tB = tF = 0;
  let drag = 0;
  for (const [x, y, ox, oy] of pts.values()) {
    if (oy < 108) { tT = 1; continue; }
    if (oy > 305 && Math.abs(ox - VW / 2) < 60) { tB = 1; continue; }
    if (ox < VW / 2) tL = 1; else tR = 1;
    drag += x - ox;
  }
  if (tF = tL && tR) {
    tL = drag < -8;
    tR = drag > 8;
  }
};
hud.addEventListener('pointerdown', (e) => {
  wake();
  if (innerHeight > innerWidth && !net.on) return;
  const [x, y] = at(e);
  hud.setPointerCapture(e.pointerId);
  if (mode === 'title' && y > 280 && y < 310) { goOnline(); return; }
  if (net.on && mode === 'run' && y < 48 && x > 200 && x < 440) { goHome(); return; }
  if (mode === 'title' && y > 208 && y < 280) { pick += x < VW / 2 ? -1 : 1; return; }
  if (watching()) { watch += x < VW / 2 ? -1 : 1; return; }
  if (mode !== 'run') { acted = true; return; }
  if (y < 48) return;
  pts.set(e.pointerId, [x, y, x, y]); scan();
});
hud.addEventListener('pointermove', (e) => {
  const p = pts.get(e.pointerId);
  if (p) { [p[0], p[1]] = at(e); scan(); }
});
const drop = (e) => { pts.delete(e.pointerId); scan(); };
hud.addEventListener('pointerup', drop);
hud.addEventListener('pointercancel', drop);
hud.addEventListener('lostpointercapture', drop);
const clearInput = () => { for (const k in held) held[k] = false; pts.clear(); scan(); };
addEventListener('blur', clearInput);
addEventListener('resize', clearInput);
// Yaw grows toward +z, and +z is the RIGHT of a camera looking along +x -
// so LEFT lowers the yaw. The first build had this backwards, and the probe
// happily asserted the backwards version, because it only checked that a
// left thumb moved the yaw, not which way.
const turnDir = () => (held.arrowright || held.d || (tR && !tL) ? 1 : 0) - (held.arrowleft || held.a || (tL && !tR) ? 1 : 0);
const button = () => held[' '] || tT;

// --- the plain ------------------------------------------------------------
const U = buildAll();
let groundM, tuftM, postM;
function partM() { return createMesh(new Float32Array(0), true); }
function buildPlain() {
  // Restarting releases the previous GPU buffers instead of leaking a world.
  for (const mesh of [groundM, tuftM, postM, particleM, arcM, trailM]) if (mesh) gl.deleteBuffer(mesh.b);
  const g = [];
  // The slab is tiled, not one box: fog is worked out per vertex, and a
  // single 600-unit quad has every vertex deep in it, so the whole plain
  // drew in fog colour even under your hooves while anything small drew
  // true - which is what made the mottling read as black sectors.
  for (let i = -12; i < 12; i++) for (let j = -12; j < 12; j++) pushBox(g, i * 25 + 12.5, -.5, j * 25 + 12.5, 25, 1, 25, .13, .16, .15);
  // Coloured meadow tufts provide ground detail; the budget goes to plasma.
  groundM = createMesh(g);
  // Each meadow glows faintly in its own colour: the map tells you where a
  // colour lives before a single unicorn does.
  const t = [];
  meadows.forEach((m, c) => {
    for (let i = 0; i < 90; i++) {
      const a = rnd(TAU), d = Math.sqrt(rnd()) * 22;
      const x = m[0] + Math.cos(a) * d, z = m[1] + Math.sin(a) * d, h = .3 + rnd(.6);
      const k = COL[c];
      pushBox(t, x, h / 2, z, .12, h, .12, k[0], k[1], k[2], .5);
    }
  });
  tuftM = createMesh(t);
  // The edge: posts of light in a square.
  const p = [];
  for (let i = -ARENA; i <= ARENA; i += 14) for (const [x, z] of [[i, -ARENA], [i, ARENA], [-ARENA, i], [ARENA, i]]) {
    pushBox(p, x, 3, z, .3, 6, .3, .7, .6, 1, .35);
  }
  for (const a of [-ARENA, ARENA]) {
    pushBox(p, a, .1, 0, .6, .2, ARENA * 2, 1, .2, .3, .6);
    pushBox(p, 0, .1, a, ARENA * 2, .2, .6, 1, .2, .3, .6);
  }
  postM = createMesh(p);

}
let camR = [1, 0, 0], camU = [0, 1, 0];
// A soft disc: a fan, bright in the middle and gone at the rim, one per
// colour. Billboarded each draw, it is every glow in the game - the
// fireball's layers, the halo of a folding herd, the rings of an explosion.
const DISC = COL.map((c) => {
  const v = [], N = 18;
  for (let i = 0; i < N; i++) {
    const a = i / N * TAU, b = (i + 1) / N * TAU;
    v.push(0, 0, 0, 0, 0, 1, ...c, .4,
      Math.cos(a), Math.sin(a), 0, 0, 0, 1, ...c, 0,
      Math.cos(b), Math.sin(b), 0, 0, 0, 1, ...c, 0);
  }
  return createMesh(v);
});
// And one ring of the same: an annulus, bright in the middle of its band.
// Seven of them existed while a second ring cycled the colours inside the
// shockwave; there is one ring now, and it is always the wild white-gold.
const RINGM = (() => {
  const c = COL[WILD], v = [], N = 24;
  const put = (a, r, al) => v.push(Math.cos(a) * r, Math.sin(a) * r, 0, 0, 0, 1, ...c, al);
  for (let i = 0; i < N; i++) {
    const a = i / N * TAU, b = (i + 1) / N * TAU;
    put(a, .9, .5); put(b, .9, .5); put(b, 1, 0); put(a, .9, .5); put(b, 1, 0); put(a, 1, 0);
  }
  return createMesh(v);
})();
function disc(col, x, y, z, r) {
  drawMesh(DISC[col], [camR[0] * r, camR[1] * r, camR[2] * r, 0, camU[0] * r, camU[1] * r, camU[2] * r, 0, 0, 0, 1, 0, x, y, z, 1]);
}

// --- particles: bloomy sparks, from Rainbow Surfer ------------------------
// The explosion's cloud: puffs, not rings. Each carries its own birth
// delay, so a blast unfolds over a quarter second instead of appearing
// whole, and its own colour, so the cloud is a rainbow rather than a tint.
const PUFF = [];
function boomCloud(x, z, pw) {
  const n = 40 + Math.min(40, pw * 3);
  for (let i = 0; i < n; i++) {
    // Born on a SHELL, not at a point. Every puff starting in the same
    // place makes one saturated blob with a fringe; started a couple of
    // metres out along its own direction, the lobes stay separable and the
    // ball reads as a ball.
    const a = rnd(TAU), e = rnd(1.15);
    const sp = (3 + rnd(8)) * (1 + pw * .05), d = 1.4 + rnd() * (2 + pw * .16);
    const dx = Math.cos(a) * Math.cos(e), dy = Math.sin(e), dz = Math.sin(a) * Math.cos(e);
    PUFF.push({
      x: x + dx * d, y: .7 + dy * d * .8, z: z + dz * d,
      vx: dx * sp, vy: dy * sp * .6 + .8, vz: dz * sp,
      // A wide spread of sizes: a few slow boulders among a lot of small
      // fast ones is what a cloud looks like from outside.
      r0: (1.4 + rnd() * rnd(5)) + pw * .12,
      t: -rnd(.3), life: 1.4 + rnd(1.2),
      col: rnd(7) | 0,
    });
  }
}
const PMAX = 220, PART = [];
let pcur = 0;
function spawnP(p, v, col, life) { PART[pcur++ % PMAX] = { p: [...p], v, col, life, max: life }; }
function burst(p, n, sp, col) {
  for (let i = 0; i < n; i++) {
    const a = rnd(TAU), b = rnd(Math.PI) - Math.PI / 2;
    spawnP(p, [Math.cos(a) * Math.cos(b) * sp, Math.sin(b) * sp + 3, Math.sin(a) * Math.cos(b) * sp], col || RAINBOW[rnd(7) | 0], .6 + rnd(.6));
  }
}
const PBUF = new Float32Array((PMAX + 9216) * 120);
let particleM, glitterTick = 0;
// All three effects use the same vertex layout, with different light levels.
// Keep one writer, without allocating a temporary array for each vertex.
function vertexWriter(buf, light, bias = 0) {
  const put = (x, y, z, c, a) => {
    const n = put.n;
    buf[n] = x; buf[n + 1] = y; buf[n + 2] = z; buf[n + 4] = 1;
    buf[n + 6] = c[0] * light + bias; buf[n + 7] = c[1] * light + bias; buf[n + 8] = c[2] * light + bias; buf[n + 9] = a;
    put.n += 10;
  };
  put.n = 0;
  return put;
}
function particleVerts(dt) {
  glitterTick++;
  const put = vertexWriter(PBUF, 1.8), view = who(), t = now(), sources = units.concat(BOOMS);
  for (let i = 0; i < PMAX + 9216; i++) {
    const dust = i >= PMAX;
    let pt = PART[i];
    if (dust) {
      // A recycled world-space field: no new particles or draw calls per frame.
      if (!pt) pt = PART[i] = { p: [i % 96 * .875 + Math.sin(i) * 2, 0, (i / 96 | 0) * .875 + Math.cos(i) * 2], life: 0, spin: i, col: RAINBOW[i % 7] };
      for (const j of [0, 2]) pt.p[j] -= Math.floor((pt.p[j] - view[j ? 'z' : 'x'] + 42) / 84) * 84;
      pt.life *= Math.exp(-dt * 2);
      if ((i + glitterTick) % 8 === 0) for (const u of sources) if (u.st === 0 || u.pw) {
        const r = u.pw ? 8 + Math.sqrt(u.pw) * 3 : u.wave ? u.r + 4 : 3,
          dx = pt.p[0] - u.x, dz = pt.p[2] - u.z,
          k = (1 - Math.hypot(dx, dz, pt.p[1]) / r) * (u.pw ? (1 - u.t / 1.6) * 6 : u.sp / 10);
        if (k > pt.life) { pt.life = k; pt.spin = Math.atan2(dx, dz) - t * 3 + (u.pw ? 0 : Math.PI / 2); }
      }
      pt.p[1] = .08 + Math.max(0, 8 - (t * .3 + i * 1.7) % 10) ** 2 + pt.life;
    } else {
      if (!pt || pt.life <= 0) continue;
      pt.life -= dt; pt.v[1] -= 9 * dt;
      for (let j = 0; j < 3; j++) pt.p[j] += pt.v[j] * dt;
      if (pt.p[1] < 0) { pt.p[1] = 0; pt.v[1] *= -.4; }
    }
    if (dust && Math.max(Math.abs(pt.p[0]), Math.abs(pt.p[2])) > ARENA) continue;
    // Rotating coloured flakes, with sparse brief specular glints.
    const turn = dust ? t * (1.4 + Math.sin(i) * .6) + i : 0, nx = Math.cos(turn), nz = Math.sin(turn),
      f = dust ? .02 + (nx * camR[0] + nz * camR[2]) ** 16 * .8 : pt.life / pt.max,
      flash = dust ? Math.max(0, Math.sin(turn * .7 + i)) ** 64 * f * 8 : 0,
      c = flash > .3 ? [1, 1, 1] : pt.col,
      sz = dust ? Math.min(.025, Math.hypot(pt.p[0] - eye[0], pt.p[2] - eye[2]) * .001) : .14 + f * .2, a = (f + flash) * .8,
      [px, y, pz] = pt.p, sway = dust ? pt.life : 0, angle = dust ? t * 3 + pt.spin : 0,
      x = px + Math.sin(angle) * sway, z = pz + Math.cos(angle) * sway;
    for (let glow = 0; glow < (flash > .1 ? 2 : 1); glow++) {
      const r = sz * (glow ? 3 : 1), alpha = glow ? flash * .25 : a;
      for (const sign of [-1, 1]) {
        put(x - r * nx, y, z - r * nz, c, alpha); put(x + r * nx, y, z + r * nz, c, alpha); put(x, y + sign * sz * (glow ? 3 : 2.6), z, c, 0);
      }
    }

  }
  return put.n;
}

// --- the charge, the arcs, and the rainbow's wake -------------------------
// A charging herd crackles: bolts jump between its unicorns, more of them
// and brighter as the charge fills, and the ground under the band lights
// up. Ignition turns the herd into merging plasma wisps and drags a WAKE - seven
// stripes across its width, the width of the herd, rising off the ground -
// which is the rainbow you see coming from the other side of the plain.
const ARCMAX = 60, ABUF = new Float32Array(ARCMAX * 16 * 12 * 10);
const TBUF = new Float32Array(200000);
let arcM, trailM;
function drawCharge(L, T, dt) {
  const k = Math.max(L.charge, L.n >= 10 ? Math.min(.8, .35 + L.n / 100) : 0), wave = L.wave > 0;
  if (k < .04 && !wave) return;
  const herd = [];
  for (const u of units) if (u.st === 0 && (u === L || u.lead === L.lead)) herd.push(u);
  // Arcs. Rare and thin at first, a storm at the top of the charge.
  if (herd.length > 1 && k > .1 && rnd() < dt * (k * k * k * 150 + (wave ? 30 : 0)) && ARCS.length < ARCMAX) {
    const a = herd[(rnd(herd.length)) | 0];
    const b = herd[rnd(herd.length) | 0];
    // Both ends stay on herd members, including at full charge.
    if (b !== a) ARCS.push({ a: [a.x, .9, a.z], b: [b.x, .9, b.z], t: .15 });
  }
  if (!wave) return;
  // Every lit unicorn becomes a low plasma wisp. Overlap forms the core
  // wherever the herd gathers; the ground clips the lower half of the glow.
  for (const u of herd) {
    const phase = T * 8 + u.seed;
    setDim(1 + Math.sin(phase) ** 2);
    for (let j = 0; j < 5; j++) {
      const d = j && j - 1, a = phase - j,
        yaw = u.yaw + Math.sin(a) * d * .2;
      disc(j ? u.col : WILD, u.x - Math.cos(yaw) * d,
        .5 + Math.sin(a) * .2, u.z - Math.sin(yaw) * d, j ? 2.4 - j * .4 : .6);
    }
  }
  setDim(1);
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
function trailVerts(dt, eye) {
  const put = vertexWriter(TBUF, 1.4);
  const quad = (p0, p1, p2, p3, c, a) => { put(...p0, c, a); put(...p1, c, a); put(...p2, c, a); put(...p0, c, a); put(...p2, c, a); put(...p3, c, a); };
  // A point on the arch of sample s: colour band c, angle index i, at the
  // band's surface. The live nose shrinks to the leader's plasma wisp.
  const pt = (s, c, i) => {
    const th = i / ARCH * Math.PI, R = (s.wave ? .8 : s.r * Math.sqrt(1 - s.t / .9)) * (1.05 - c * .075) * (1 + Math.sin(now() * 8 + i) * .06);
    const sx = -Math.sin(s.yaw), sz = Math.cos(s.yaw);
    return [s.x + sx * Math.cos(th) * R, .15 + Math.sin(th) * R * 1.1, s.z + sz * Math.cos(th) * R];
  };
  for (const [L, tr] of TRAIL) {
    for (const s of tr.s) s.t += dt;
    while (tr.s.length && tr.s[0].t > .9) tr.s.shift();
    if (!tr.s.length) { TRAIL.delete(L); continue; }
    for (let i = 0; i + 1 < tr.s.length && put.n < TBUF.length - 8000; i++) {
      // Stretch only the live front to the leader; keep the wake on the herd path.
      const s0 = tr.s[i], s1 = i + 2 === tr.s.length && L.wave
        ? L : tr.s[i + 1];
      // Fade with age, and fade out again where the tunnel runs past the
      // camera - being inside your own rainbow is the point, being blinded
      // by it is not.
      const near = Math.min(1, Math.max(0, (Math.hypot(s1.x - eye[0], s1.z - eye[2]) - 5) / 9));
      const f = (1 - s0.t / .9) * near;
      if (f <= 0) continue;
      for (let c = 0; c < 7; c++) {
        for (let k = 0; k < ARCH; k++) {
          quad(pt(s0, c, k), pt(s0, c, k + 1), pt(s1, c, k + 1), pt(s1, c, k), RAINBOW[c], (.1 + .1 * Math.sin(now() * 8 - s0.t * 18 + c + k) ** 8) * f);
        }
      }
    }
  }
  return put.n;
}
// The arcs: jagged bolts, each a ribbon facing the camera, alive for a
// few frames and gone.
function arcVerts(dt) {
  return lightning(ARCS, vertexWriter(ABUF, 1.2, .7), camU, dt);
}

const WILDC = COL[WILD];

// --- state ----------------------------------------------------------------
let mode = 'title', timer = 0, msg = '', msgT = 0, shake = 0, flash = 0, endT = 0;
let victory = false;
const BOOMS = [], TRAIL = new Map(), ARCS = [];
let eye = null, look = null, camYaw = 0;
let msgCol = '#fff4d6';
const say = (t, d = 2, c = '#fff4d6') => { msg = t; msgT = d; msgCol = c; };

function goOnline(room) {
  if (net.on) return;
  wake();
  newRun(); mode = 'run'; say('', 0);
  netClose(); netOpen(room);
}
function goHome() { netClose(); newRun(1); mode = 'title'; }

let impact = null;
let watch = 0;
const watching = () => mode === 'run' && net.on && (net.me < 0 || leaders[net.me].st === 3);
function who() {
  if (!watching()) return leaders[Math.max(0, net.me)];
  // Watching. Left and right walk the herds still standing, so being out
  // is a seat in the stand rather than a black screen.
  const live = alive();
  return live.length ? live[((watch % live.length) + live.length) % live.length] : leaders[0];
}

function newRun(attract) {
  clearInput();
  newWorld(((pick % 7) + 7) % 7);
  // On the title every herd is a rival's - the plain plays itself under
  // the words, and the colour you are picking plays too.
  if (attract) leaders[0].ai = { t: 0, goal: null };
  buildPlain();
  particleM = partM(); arcM = partM(); trailM = partM();
  PART.length = 0; pcur = 0; BOOMS.length = 0; PUFF.length = 0; TRAIL.clear(); ARCS.length = 0;
  impact = null; timer = 0; msgT = 0; shake = 0; flash = 0; endT = 0; victory = false;
  eye = null; camYaw = who().yaw;
}
newRun(1);

// --- the shared plain -----------------------------------------------------
// A client is told states, not events, so the noises are read back out of
// what changed since the last packet: a herd that lit, a heart that went.
const pw = [], ph = [];
function ghostSound(P) {
  let boom;
  for (let i = 0; i < 7; i++) {
    const L = leaders[i];
    if (L === P && L.wave && !pw[i]) say('RAINBOW!', 1.5);
    if (pw[i] && !L.wave && L.hearts < ph[i]) boom = [L.cx, L.cz, pw[i] * 2];
    pw[i] = L.wave; ph[i] = L.hearts;
  }
  if (boom) explode(...boom);
}

function explode(x, z, pw) {
  if (pw >= 62 && Math.hypot(x - who().x, z - who().z) < 35 && (mode !== 'end' || victory)) impact = { x, z, t: 2 };
  sBoom(pw); BOOMS.push({ x, z, t: 0, pw }); boomCloud(x, z, pw);
  burst([x, 1.5, z], 120, 9 + pw * .4); shake = 1; flash = .4;
}

// --- the frame ------------------------------------------------------------
let last = 0, lastPick = 0, lastSaid = '';
function rotate() {
  ctx.fillStyle = '#0b0f14'; ctx.fillRect(0, 0, VW, VH);
  font(32, 1); ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
  label('Rotate your phone to play', VH / 2);
}
function frame(now_) {
  const realDt = Math.min(.05, (now_ - last) / 1000 || 0);
  if (impact) { impact.t -= realDt; if (impact.t <= 0) impact = null; }
  const dt = realDt * (impact && !net.on ? .3 : 1);
  last = now_;
  const portrait = innerHeight > innerWidth;
  if (portrait && !net.on) { rotate(); requestAnimationFrame(frame); return; }
  const doAct = acted; acted = false;
  timer += dt;
  if (mode === 'title' && pick !== lastPick) { lastPick = pick; newRun(1); }

  if (net.dropped) { goHome(); net.said = 'OFFLINE - O'; }
  const P = who();
  if (mode === 'title') {
    music(.2, 1);
    step(dt, { over: 1 });
    if (doAct) {
      wake(); netClose(); newRun(); mode = 'run'; say('AUTO-RUN / red edge = death', 4);
    }
  } else if (mode === 'run') {
    const heat = Math.min(1, P.n / 12);
    let magic = 0, pan = 0;
    for (const L of leaders) if (L.st === 0) {
      const dx = L.cx - P.x, dz = L.cz - P.z,
        k = (L.wave ? 1 : L.charge * .4) * Math.max(0, 1 - Math.hypot(dx, dz) / 70);
      magic += k; pan += k * (dx * camR[0] + dz * camR[2]) / 30;
    }
    music(heat, 0, Math.min(1, magic), pan / (2 + magic), P.wave ? 1 : P.charge);
    const local = {
      t: turnDir(), f: held.arrowup || held.w || tF ? 1 : 0,
      b: held.arrowdown || held.s || tB ? 1 : 0, c: button() ? 1 : 0,
    };
    // Offline this is always ours. Online it is ours only while we host;
    // otherwise the plain arrives in packets and we animate what we are told.
    const mine = netTick(dt, local);
    if (net.news) { say(net.news.k ? 'RIDER JOINED' : 'RIDER LEFT', 2.5, css(COL[leaders[net.news.i].col])); net.news = null; }
    if (net.said !== lastSaid) { lastSaid = net.said; if (net.said) say(net.said, 3); }
    if (mine) {
      if (!net.on) { P.in = local; charge(P, local.c); }
      step(dt, { arena: net.on });
    } else { ghost(dt); ghostSound(P); }
    if (!net.on && (lost(0) || won(0))) {
      // Latch the result before displaying the finished world.
      victory = won(0);
      mode = 'end'; endT = 0;
      if (!victory) impact = null;
      // Stop decisions, but let existing motion, rainbows and debris settle.
      for (const L of leaders) { L.ai = null; L.in = { b: 1, t: 0 }; }
    }
  } else {
    endT += dt;
    music(.2, 1);
    // Continue the aftermath with combat disabled and the result latched.
    step(dt, { over: 2 });
    if (doAct && endT > 1.6) { newRun(1); mode = 'title'; }
  }
  msgT = Math.max(0, msgT - dt);
  shake = Math.max(0, shake - dt * 2.5);
  flash = Math.max(0, flash - dt * 2);

  // Events into sound and sparks.
  let impactSound = 0;
  for (const e of events) {
    if (e.k === 'join') { if (e.L === P) sJoin(P.n); burst([e.u.x, .8, e.u.z], 6, 2, COL[e.u.col]); }
    else if (e.k === 'knock') { impactSound = Math.max(impactSound, 1); burst([e.x, .6, e.z], 8, 4, COL[e.col]); }
    else if (e.k === 'horn') { clang(); burst([e.x, 1, e.z], 5, 3, [1, .9, .6]); }
    else if (e.k === 'graze') { clang(); burst([e.x, 1.5, e.z], 40, 7); }
    else if (e.k === 'ignite') {
      // The band lights: a flash, a fan of sparks the size of the herd, and
      // the upward plasma zing.
      burst([e.L.cx, 1.2, e.L.cz], 40 + e.L.n * 6, 5 + e.L.r);
      if (e.L === P) { say('RAINBOW!', 1.5); flash = Math.max(flash, .35); }
    }
    else if (e.k === 'spend') { burst([e.u.x, .8, e.u.z], 5, 3, COL[e.u.col]); }
    else if (e.k === 'lost') { thud(); burst([e.u.x, .8, e.u.z], 8, 5, COL[WILD]); }
    else if (e.k === 'fell') {
      sBoom(3); shake = 1;
      if (e.L === P) say('OFF THE PLAIN', 2.5);
    }
    else if (e.k === 'blast') { impactSound = 2; burst([e.x, .8, e.z], 10, 6, COL[e.col]); if (e.L === P) shake = Math.max(shake, .3); }
    else if (e.k === 'boom') explode(e.x, e.z, e.pw);
    else if (e.k === 'hurt') { if (e.L === P) { ouch(); say(P.hearts ? 'HEART LOST' : 'HERD LOST', 2); } }
    else if (e.k === 'dead') { if (e.L !== P) say('A RIVAL FALLS', 2.5); }
  }
  if (impactSound) thud(impactSound);
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
    const lit = P.wave ? 1 : 0, seat = watching() ? 0 : 1;
    const back = 9 + Math.sqrt(P.n) * 1.6 + sp * 5 + lit * (10 + P.r * 1.6) + (1 - seat) * 12;
    const up = 3.6 + Math.sqrt(P.n) * .6 + sp * 1.2 + lit * (6 + P.r) + (1 - seat) * 9;
    ex = P.x - Math.cos(camYaw) * back; ey = up; ez = P.z - Math.sin(camYaw) * back;
    lx = P.x + Math.cos(camYaw) * (6 + sp * 8); ly = 1 + lit * 2; lz = P.z + Math.sin(camYaw) * (6 + sp * 8);
    if (P.st === 3) { ex = P.x + 10; ey = 8; ez = P.z + 10; lx = P.x; lz = P.z; ly = 1; }
  }
  if (impact) { ex = impact.x - 42; ey = 32; ez = impact.z + 42; lx = impact.x; lz = impact.z; ly = 3; }
  if (!eye) eye = [ex, ey, ez], look = [lx, ly, lz];
  const k = Math.min(1, realDt * 5);
  [ex, ey, ez].forEach((v, i) => eye[i] = lerp(eye[i], v, k));
  [lx, ly, lz].forEach((v, i) => look[i] = lerp(look[i], v, k));
  const sh = shake * shake * .5;
  const e2 = eye.map(v => v + (rnd() - .5) * sh);
  const view = lookAt(e2, look);
  camR = [view[0], view[4], view[8]]; camU = [view[1], view[5], view[9]];
  const vp = mul(perspective(mode === 'title' ? .8 : 1.0, VW / VH, .1, 1500), view);

  // --- draw ---------------------------------------------------------------
  frameGL(vp, e2, FOG);
  drawMesh(groundM, IDENT);
  // Light lies on the meadow, before opaque shadows and unicorns.
  glMode(1);
  for (const L of leaders) {
    const r = L.r * 4;
    setDim(L.wave ? 1.4 : L.charge * .3);
    drawMesh(DISC[WILD], [r,0,0,0, 0,0,r,0, 0,1,0,0, L.cx,.02,L.cz,1]);
  }
  setDim(1);
  glMode(0);
  const T = now();
  for (const u of units) {
    // Lit unicorns render as plasma wisps in drawCharge; burnout restores
    // their solid bodies at the same simulated positions.
    const L0 = u.lead >= 0 ? leaders[u.lead] : null;
    if (L0 && L0.wave && u.st === 0) continue;
    const set = U[u.st === 3 ? WILD : u.col];
    const x = u.x, y = u.y, z = u.z, s = (u.hearts ? 1.25 : 1) * u.size, yaw = u.yaw;
    const bob = u.st ? 0 : Math.sin(u.ph * 2) * .05 * Math.min(1, u.sp / 5);
    const shadow = modelTR(x, 0, z, -yaw + Math.PI / 2, s);
    let dx = 0, dz = 0, light = 1;
    for (const L of leaders) {
      const k = L.wave ? Math.max(0, 1 - Math.hypot(x - L.cx, z - L.cz) / (L.r * 4)) : 0;
      dx += (x - L.cx) * k; dz += (z - L.cz) * k; light += k;
    }
    shadow[8] += dx / light * .15; shadow[10] += dz / light * .15;
    shadow[12] += dx / light * .1; shadow[14] += dz / light * .1;
    setDim(1 / light);
    drawMesh(set.shadow, shadow);
    setDim(1);
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
  drawMesh(tuftM, IDENT); drawMesh(postM, IDENT);
  for (const L of leaders) if (L.st !== 3) drawCharge(L, T, dt);
  for (const b of BOOMS) {
    // The shockwave: one ring on the ground, thin and fast. Seven concentric rings
    // rising in a stack read as a gradient; one ring travelling reads as a
    // blast, and the volume comes from the cloud below instead.
    const k = b.t / 1.6, R = (5 + b.pw * .7) * Math.sqrt(k) * 3;
    setDim((1 - k) * (1 - k));
    // Flat on the ground: the billboard basis swapped for the world's.
    drawMesh(RINGM, [R, 0, 0, 0, 0, 0, R, 0, 0, 1, 0, 0, b.x, .12, b.z, 1]);
    // And the core: a hard white flash for a fifth of a second.
    // And the core: small and brief. A big white disc at the centre is
    // what turned the whole blast into one flat blowout.
    if (k < .12) { setDim(1 - k * 8); disc(WILD, b.x, 1.4, b.z, (1.6 + b.pw * .12) * (1 + k * 6)); }
    setDim(1);
  }
  // The cloud itself. Each puff is its own little billowing ball - born a
  // moment apart so the thing BLOOMS rather than appearing, thrown outward
  // and up, slowed by drag, growing as it goes and fading as it grows.
  // Two discs to a puff, one inside the other, so it has a core; several
  // dozen of them overlapping is what makes a volume out of flat sprites.
  for (let i = PUFF.length - 1; i >= 0; i--) {
    const p = PUFF[i];
    p.t += dt;
    if (p.t < 0) continue;
    if (p.t > p.life) { PUFF.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    const dr = 1 - Math.min(.9, dt * 3.2);
    p.vx *= dr; p.vz *= dr; p.vy = p.vy * dr + dt * 1.6;
    const f = p.t / p.life, r = p.r0 * (.5 + f * 1.6), a = (1 - f) * (1 - f);
    setDim(a * .42);
    disc(p.col, p.x, p.y, p.z, r);
    setDim(a * .6);
    disc(p.col, p.x, p.y, p.z, r * .45);
  }
  setDim(1);

  const tn = trailVerts(dt, e2);
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
  // The edge: a red frame closing in from the screen's rim, under the
  // HUD so it never covers the radar - which is what you need most there.
  if (mode === 'run' && edgeDanger(P) && P.st !== 3) {
    const w = Math.max(0, (Math.max(Math.abs(P.x), Math.abs(P.z)) - (ARENA - EDGE)) / EDGE);
    ctx.strokeStyle = `rgba(255,40,60,${.25 + .35 * w * (.7 + .3 * Math.sin(timer * 12))})`; ctx.lineWidth = 14 + 40 * w;
    ctx.strokeRect(0, 0, VW, VH); ctx.lineWidth = 1;
    font(20, 1);
    ctx.fillStyle = (timer * 5 | 0) % 2 ? '#ff5f6e' : '#ffb0b8';
    label(P.wave ? 'EDGE! STEER NOW' : 'EDGE! BRAKE & TURN', VH * .18);
  }
  const pc = COL[P.col];
  if (mode === 'title') {
    ctx.fillStyle = 'rgba(5,4,14,.6)'; ctx.fillRect(0, 0, VW, VH);
    // The title, once per colour, stacked: a rainbow made of the word.
    font(44, 1);
    RAINBOW.forEach((c, i) => { ctx.fillStyle = css(c, .9); label('UNICORN FIREBALL', 70 + (i - 3) * 2.5, VW / 2 + (3 - i) * 1.5 - beat * (3 - i)); });
    ctx.fillStyle = '#f3ead6'; label('UNICORN FIREBALL', 70);
    font(15);
    ctx.fillStyle = '#d8d0ea';
    label('gather your colour - last herd wins', 132);
    ctx.fillStyle = '#ffb0b8';
    label(touch ? 'HOLD TOP: charge; LIT = NO BRAKES' : 'HOLD SPACE: charge; LIT = NO BRAKES', 160);
    font(12);
    label(touch ? 'SIDES: steer / BOTH: sprint + drag to steer' : 'AUTO-RUN | WASD: steer / UP: sprint', 182);
    label('DOWN / bottom: brake / red edge = death', 200);
    font(15, 1);
    ctx.fillStyle = css(pc);
    dot(VW / 2, VH * .65, 14);
    ctx.fillStyle = '#f3ead6';
    label('<   your colour   >', VH * .65 + 34);
    font(18, 1);
    ctx.fillStyle = (timer * 2 | 0) % 2 ? '#fff' : '#c9b8ff';
    label('SPACE / tap to run', VH - 42);
    font(14, 1); ctx.fillStyle = '#8fe3c8';
    label(net.said || 'ONLINE - tap / O', VH - 62);
    font(12); ctx.fillStyle = '#9a90b8';
    label('@gtanczyk | gamedev.pl', VH - 4);
  } else {
    // Your herd: a dot in your colour, the count, the hearts.
    ctx.textAlign = 'left';
    ctx.fillStyle = css(pc); dot(24, 24, 11);
    ctx.fillStyle = '#f3ead6'; font(26, 1); label(P.n, 24, 44);
    font(18); ctx.fillStyle = '#ff6b8a';
    label('♥'.repeat(P.hearts), 23, 90);
    // The rivals, biggest first, so the threat is at the top.
    ctx.textAlign = 'right'; font(14, 1);
    leaders.filter((L) => L !== P).sort((a, b) => b.n - a.n).forEach((L, i) => {
      const y = 22 + i * 20, dead = L.st === 3;
      ctx.fillStyle = css(COL[L.col], dead ? .3 : 1); dot(VW - 18, y, 6);
      if (L.man) { ctx.fillStyle = '#fff'; dot(VW - 18, y, 2.5); }
      ctx.fillStyle = dead ? '#666' : '#e8e0f4';
      label(dead ? '-' : L.n + (L.wave ? ' ~' : L.chg ? ' !' : ''), y, VW - 30);
      // Its hearts, but only once it has lost one. Three hearts beside
      // every rival is a wall of pink that says nothing; the row you want
      // to find is the one that is DOWN to one, and it only reads as an
      // alarm if the quiet rows next to it are quiet.
      if (!dead && L.hearts < 3) { ctx.fillStyle = '#ff6b8a'; font(10); label('♥'.repeat(L.hearts), y, VW - 68); font(14, 1); }
    });
    ctx.textAlign = 'center';
    // The charge bar: how far the charge is from igniting, then how much
    // rainbow is left to burn.
    if (P.chg || P.wave) {
      const k = P.wave ? P.burn / burnTime(P) : P.charge;
      ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(VW / 2 - 80, VH - 30, 160, 10);
      const g = ctx.createLinearGradient(VW / 2 - 80, 0, VW / 2 + 80, 0);
      RAINBOW.forEach((c, i) => g.addColorStop(i / 6, css(c)));
      ctx.fillStyle = g; ctx.fillRect(VW / 2 - 80, VH - 30, 160 * k, 10);
      font(12, 1); ctx.fillStyle = '#fff';
      label(P.wave ? 'NO BRAKES - herd ' + P.n : 'CHARGE ' + (P.charge * 100 | 0) + '%', VH - 42);
    } else if (P.st === 0 && (P.cool || P.n >= 2 && timer < 40)) {
      font(12); ctx.fillStyle = '#fff';
      label(P.cool ? 'COOLDOWN' : touch ? 'HOLD TOP: charge; LIT = NO BRAKES' : 'HOLD SPACE: charge; LIT = NO BRAKES', VH - 26);
    }
    if (P.heat > 0 && !P.wave && mode === 'run') { font(15, 1); ctx.fillStyle = '#ffb0b8'; label('UNSTABLE ' + (P.heat * 100 | 0) + '% - brake to cool', VH - 62); }
    if (msgT && !impact) {
      font(26, 1); ctx.globalAlpha = Math.min(1, msgT); ctx.fillStyle = msgCol;
      label(msg, VH * .3); ctx.globalAlpha = 1;
    }
    font(13); ctx.fillStyle = 'rgba(255,255,255,.6)';
    label((timer / 60 | 0) + ':' + String((timer % 60 | 0)).padStart(2, '0'), 16);
    if (net.on) {
      font(13, 1); ctx.fillStyle = '#8fe3c8';
      label((net.seats + ' riding') + ' - tap / ESC: exit', 34);
      if (watching()) {
        const mine = net.me >= 0 ? leaders[net.me] : null;
        font(17, 1); ctx.fillStyle = '#ffb0b8';
        // A stone leader's burn byte carries the seconds until it rises.
        label(mine ? 'BACK IN ' + Math.max(1, Math.ceil(5 - (mine.gone || 0))) : 'WATCHING', VH * .28);
      }
    }
    if (mode === 'end' && !impact && endT > 1.6) {
      ctx.fillStyle = 'rgba(5,4,14,.6)'; ctx.fillRect(0, VH * .3, VW, VH * .42);
      font(40, 1); ctx.fillStyle = '#f3ead6';
      label(victory ? 'VICTORY' : !alive().length ? 'DRAW' : 'DEFEAT', VH * .44);
      font(17); ctx.fillStyle = '#d8d0ea';
      if (endT > 1) label('SPACE / tap to run', VH * .66);
    }
  }
  clearBeat();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

if (DEV) window.FB = { units, leaders, events, net, spy, netOpen, goOnline, goHome, get impact() { return impact; }, get victory() { return victory; }, step, charge, get mode() { return mode; }, get timer() { return timer; }, reset: (c, ai) => { pick = c; lastPick = c; newRun(ai); mode = 'run'; } };

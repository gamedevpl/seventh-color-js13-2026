// RAINBOW SURFER. The run is physical now: speed is a RESOURCE. Stardust
// scattered on the deck feeds the boost; serpentines and corkscrews demand
// a minimum speed or you slide off; gaps demand momentum or you sink short
// of the far lip (an air-boost can save you - it burns stardust too);
// dives hand you speed for free. Catch the rainbow and BECOME it - as the
// rainbow the boost is free, the colours burn down instead, and a landed
// jump relights one. Score is how long you burned.

import { gl, initGL, frameGL, mode as glMode, createMesh, updateMesh, drawMesh, perspective, lookAt, mul, modelFrame, IDENT, pushBox, setDim, mask, reflector } from './gl.js';
import { S, makeCourse, depths } from './course.js';
import { trackMeshes, makeRider, ride, behind, ahead, placeAt, frame as tframe, sm } from './track.js';
import { unicornMesh, headMesh, PIVOT, RAINBOW } from './uni.js';
import { makeBraid, updateBraid, makeTrail, feedTrail, trailVerts, BUF } from './ribbon.js';

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
const held = {};
let acted = false;
addEventListener('keydown', (e) => {
  held[e.key] = true;
  if (e.key === ' ' || e.key === 'Enter') acted = true;
});
addEventListener('keyup', (e) => { held[e.key] = false; });
// The title credit is two links. Pointer events arrive in CSS pixels of an
// upscaled canvas, so hit-testing divides by the box the HUD occupies.
const CREDIT = [['@gtanczyk', 'https://x.com/gtanczyk'], [' | ', 0], ['gamedev.pl', 'https://www.gamedev.pl'], [' | 2026', 0]];
let hotX = -9, hotY = -9, links = [];
const at = (e) => {
  const r = hud.getBoundingClientRect();
  return [(e.clientX - r.left) / r.width * VW, (e.clientY - r.top) / r.height * VH];
};
// Only the title fills `links`, and only the title may consume a click with
// one - otherwise a stale box swallows a tap mid-run.
function linkAt(x, y) {
  if (mode !== 'title') return;
  for (const l of links) if (x >= l[0] && x <= l[0] + l[2] && y >= l[1] && y <= l[1] + l[3]) return l[4];
}
// Touch. Every live pointer is tracked, because the whole scheme rests on
// knowing whether BOTH sides are held at once: left half steers left, right
// half steers right, and both together is the boost. The top strip is the
// SPACE key - start, restart, and arm a kicker - kept separate so that
// steering on a phone does not fire a ramp every time you turn.
const pts = new Map();
let tL = 0, tR = 0;
const scan = () => {
  tL = tR = 0;
  for (const [x, y] of pts.values()) {
    if (y < VH * .28) continue;
    if (x < VW / 2) tL = 1; else tR = 1;
  }
};
hud.addEventListener('pointermove', (e) => {
  [hotX, hotY] = at(e);
  if (pts.has(e.pointerId)) { pts.set(e.pointerId, [hotX, hotY]); scan(); }
});
hud.addEventListener('pointerdown', (e) => {
  const [x, y] = at(e);
  // A tap that follows a link must not also start the run underneath it.
  const url = linkAt(x, y);
  // window.open is blocked in sandboxed frames - and a js13k entry spends
  // its life in one. A real anchor click carries the gesture through.
  if (url) {
    document.body.appendChild(Object.assign(document.createElement('a'), { href: url, target: '_blank', rel: 'noopener' })).click();
    return;
  }
  pts.set(e.pointerId, [x, y]);
  scan();
  if (mode !== 'run' && mode !== 'rainbow') acted = true;
  else if (y < VH * .28) acted = true;
});
const drop = (e) => { pts.delete(e.pointerId); scan(); };
hud.addEventListener('pointerup', drop);
hud.addEventListener('pointercancel', drop);
const heldFwd = () => held.ArrowUp || held.w || (tL && tR);
const heldBack = () => held.ArrowDown || held.s;
const turnDir = () => (held.ArrowLeft || held.a || (tL && !tR) ? 1 : 0) - (held.ArrowRight || held.d || (tR && !tL) ? 1 : 0);

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
function pump(speedN, closeN, dry) {
  if (!ac) return;
  if (nextT < ac.currentTime) nextT = ac.currentTime + .05;
  while (nextT < ac.currentTime + .16) {
    const s = step % 32;
    if (s % 4 === 0) { kick(nextT); beat = 1; }
    if (s % 4 === 2) tone(6200, .03, 'square', (.012 + speedN * .035) * (dry ? .25 : 1), nextT);
    if (s % 2 === 0) tone(NOTE(BASS[(s >> 1) % 16]), .16, 'square', .05, nextT);
    // The arp runs on stardust: an empty tank strips the track back to kick
    // and bass, so you HEAR the fuel gauge before you look at it.
    if (speedN > .2 && !dry) tone(NOTE(BASS[s % 16] + 12), .06, 'sawtooth', .015 + speedN * .03, nextT);
    if (dry && s % 8 === 0) tone(58, .34, 'sine', .12, nextT);
    if (closeN > .02) tone(NOTE(LEAD[s]), .2, 'triangle', .02 + closeN * .08, nextT);
    if (mode === 'rainbow') tone(NOTE(LEAD[s] + 12), .18, 'triangle', .05, nextT);
    nextT += 15 / (116 + speedN * 52);
    step++;
  }
}

// --- state ----------------------------------------------------------------
let mode = 'title', timer = 0;
// The two cutscenes. INTRO is on a clock; the outro has no clock at all -
// it simply never ends, because the point of it is that the running does
// not stop, only the camera does.
const INTRO = 4.6;
let demoT = 0, demoEye = null, demoUp = null, demoSide = 1;
let introT = 0, introBeat = -1, introEye = null, endEye = null, endUp = null, endT = 0;
// No ground slab any more. It was a 6000x6000 opaque plate at y = -70 in
// almost exactly the fog colour - invisible by design, and therefore pure
// liability: measured over 60 courses, 32% of all track nodes sit BELOW it
// and 27 courses in 40 dip through it. A horizontal plane cutting a curving
// ribbon meets it along a thin curve, and since the slab writes depth while
// the glass deck does not, that curve came out as a black streak painted
// across the road. The skybox is the surround now; the floor had no job.
// The nine backdrop curtains are gone too. They were parallax landmarks
// from before there was a skybox, and they drew as big flat olive slabs
// hanging in the dark - more artefact than scenery. The track net itself
// parallaxes plenty. They also happened to be worth 154 bytes, which is
// what paid for the attract mode.
let course, depth, roadM, railM, braid, trailM, skyM;
let surge = 0, slipT = 0, fly = null, cine = 0, jumps = 0, falls = 0;
let rainbowT = 0, rainbowTotal = 0, streak = 0, bestStreak = 0, flash = 0, msgT = 0, msg = '';
// Best run survives a reload, or there is nothing to come back for. Any of
// this can throw (private windows, blocked site data), so it all runs blind.
let best = 0, isBest = false;
try { best = +localStorage.rsBest || 0; } catch (e) { /* no store, no problem */ }
let energy = 40, slowT = 0, graceT = 0, armed = 0, stars = [], laneV = 0, prevYaw = 0, turnRate = 0;
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
      const A = a.p, B = e.to.p, dist = d3(A, B), h = Math.min(18, dist * .3);
      for (const u of [.2, .35, .5, .65, .8]) {
        stars.push({ i: a.i, p: [A[0] + (B[0] - A[0]) * u, A[1] + (B[1] - A[1]) * u + 4 * h * u * (1 - u) + 1.2, A[2] + (B[2] - A[2]) * u] });
      }
    } else if (a.kick) {
      // The kicker's payload: a bright arc of dust hanging over the road,
      // on the trajectory a well-judged launch actually flies. It is worth
      // several nodes of driving, and it swings out to the side - so the
      // richest part of it pulls you away from the deck you have to land
      // back on. That tension IS the mechanic.
      let b2 = e.to;
      for (let j = 0; j < 2 && b2.next.length && !b2.next[0].gap; j++) b2 = b2.next[0].to;
      const A = a.p, B = b2.p, h = Math.min(26, d3(A, B) * .55);
      const sx = B[2] - A[2], sz = -(B[0] - A[0]), sl = Math.hypot(sx, sz) || 1;
      for (let j = 0; j < 7; j++) {
        const u = .1 + .8 * j / 6, lat = Math.sin(j / 6 * Math.PI) * 3.2 * (a.i % 2 ? 1 : -1);
        stars.push({ i: a.i, kick: 1, p: [
          A[0] + (B[0] - A[0]) * u + sx / sl * lat,
          A[1] + (B[1] - A[1]) * u + 4 * h * u * (1 - u) + 1.4,
          A[2] + (B[2] - A[2]) * u + sz / sl * lat] });
      }
    } else if ((e.to.req || Math.random() < .3)) {
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
// --- speed dust ----------------------------------------------------------
// Motes anchored in the WORLD that you fly through, not rays pinned to the
// screen. Screen-space rays at fixed angles sit still and merely stretch,
// which reads as wallpaper; these stream past, sweep sideways when you turn
// (because they do not turn with you), and the faster you go the more of
// them wake up. Each is drawn as a streak along the camera's actual
// per-frame velocity, so its length IS the motion blur of that mote.
//
// That length is measured, not chosen. For a mote at lateral offset R and
// axial distance z the screen angle is atan(R/z), and BOTH the per-frame
// angular motion and the streak's angular length scale by R/(R^2+z^2) - so
// the ratio deciding whether a dash reads as motion or as an object is
// vl/len everywhere on screen, wherever the mote sits. A real exposure
// gives exactly 1: successive smears abut, no overlap and no gap. The first
// cut used a fixed len of up to 28 units against a vl of about 0.6 - a
// ratio of 1/49, every dash overlapping its own next position by 98%, which
// is a rod hanging in the air, not a streak. len rides vl now, so the
// overlap is a small deliberate number and stays right at any frame rate.
const DMAX = 150, DUST = [];
const DBUF = new Float32Array(DMAX * 60);
let prevEye = null;

function dustVerts(speedN, dt) {
  let n = 0, near = 0, maxOv = 0;
  if (!prevEye) { prevEye = [...cam.e]; return 0; }
  let vx = cam.e[0] - prevEye[0], vy = cam.e[1] - prevEye[1], vz = cam.e[2] - prevEye[2];
  prevEye = [...cam.e];
  const vl = Math.hypot(vx, vy, vz);
  if (vl < 1e-4) return 0;
  vx /= vl; vy /= vl; vz /= vl;
  // How many are awake rides speed; how long each smears rides the actual
  // frame displacement. The multiplier is the overlap factor - frames of
  // exposure - and a mild exaggeration over the honest 1 is all it needs.
  const wake = Math.max(0, (speedN - .12) / .88);
  const len = vl * (1.4 + speedN * 1.2);
  // Fades right out for the jump: airborne, the camera pulls back and swings
  // sideways, so ITS velocity - which is what the streaks are drawn along -
  // stops having anything to do with where the unicorn is going.
  const alp = Math.min(.62, .08 + speedN * .68) * (1 - cine);
  if (alp <= .01) return 0;
  // a stable basis around the travel direction
  let ax = -vz, ay = 0, az = vx;
  const al = Math.hypot(ax, ay, az) || 1;
  ax /= al; az /= al;
  const bx = vy * az - vz * ay, by = vz * ax - vx * az, bz = vx * ay - vy * ax;
  for (let i = 0; i < DMAX; i++) {
    // Each mote wakes at its own speed, and fades in over a band rather than
    // switching on: culling by a count that tracks speed made whole motes
    // blink as the speed wobbled around each threshold.
    const wa = (wake * wake - i / DMAX) * 8;
    if (wa <= 0) break;
    let d = DUST[i];
    const far = d && (d[0] - cam.e[0]) * vx + (d[1] - cam.e[1]) * vy + (d[2] - cam.e[2]) * vz;
    if (!d || far < -8 || far > 82) {
      // A TIGHT cone, not a big sparse cloud. Spread through a 38-unit
      // radius and 150 units deep, these few motes drifted past close
      // enough to sweep across the frame about once every five seconds -
      // scenery, not speed. Same count in a cone a third as wide and half
      // as deep passes one every fraction of a second.
      const r = 2 + Math.random() * 17, th = Math.random() * 6.283;
      const ahead = 8 + Math.random() * 72;
      const co = Math.cos(th) * r, si = Math.sin(th) * r;
      d = DUST[i] = [
        cam.e[0] + vx * ahead + ax * co + bx * si,
        cam.e[1] + vy * ahead + ay * co + by * si,
        cam.e[2] + vz * ahead + az * co + bz * si,
        0,
      ];
    }
    // Fade in by AGE, not by distance. Fading by distance is what forced
    // motes to be born far away and dim, and the near ones - the only ones
    // that visibly move - were the casualty. Age lets one appear anywhere,
    // including right beside you, and simply swell into being.
    d[3] = Math.min(1, d[3] + dt * 3);
    const dist = Math.hypot(d[0] - cam.e[0], d[1] - cam.e[1], d[2] - cam.e[2]);
    // How fast this mote crosses the FRAME, which is not the same thing as
    // how fast you are going. For a camera translating forward, a static
    // point sweeps at v*sin(theta)/dist - nothing at the vanishing point,
    // fastest out at the edges. In world terms that is perp/dist^2 per unit
    // travelled. The streak's own length scales by the identical factor, so
    // the two cancel and every mote used to look equally lively: the far
    // axial ones crawled but shone just as bright as the ones whipping past
    // your ear. That uniformity IS the snowstorm. Weighting brightness and
    // a little length by the flow puts the light where the motion is.
    const perp = Math.sqrt(Math.max(0, dist * dist - far * far));
    const fn = Math.min(1, perp / (dist * dist) / .042);
    const a = alp * Math.min(1, wa) * d[3] * fn * fn * Math.min(1, (82 - dist) / 22);
    const ln = len * (1 + fn * .6);
    if (DEV) { if (dist < 12) near++; if (a > .02) maxOv = Math.max(maxOv, ln / vl); }
    if (a <= .01) continue;
    // the streak: a thin quad from the mote back along the travel direction
    // TOWARD the vanishing point, not away from it. The camera moves +v and
    // the mote is static, so relative to the camera the mote moves -v: over
    // the exposure its image swept from (p + v*len) to (p). Trailing it the
    // other way anchors the streak on the wrong side of the mote, and the
    // mote appears to jump forward a streak-length every frame - which is
    // exactly the "vibrating in the air" instead of approaching.
    const tx = d[0] + vx * ln, ty = d[1] + vy * ln, tz = d[2] + vz * ln;
    let ex = d[0] - cam.e[0], ey = d[1] - cam.e[1], ez = d[2] - cam.e[2];
    let sx = vy * ez - vz * ey, sy = vz * ex - vx * ez, sz = vx * ey - vy * ex;
    const sl = Math.hypot(sx, sy, sz) || 1;
    // Thin. Fat streaks read as hail rather than as speed - a smear wants
    // to be a hairline with length, not a lozenge.
    const w = .055;
    sx = sx / sl * w; sy = sy / sl * w; sz = sz / sl * w;
    const put = (x, y, z, aa) => {
      DBUF[n] = x; DBUF[n + 1] = y; DBUF[n + 2] = z;
      DBUF[n + 3] = 0; DBUF[n + 4] = 1; DBUF[n + 5] = 0;
      DBUF[n + 6] = 1.5; DBUF[n + 7] = 1.5; DBUF[n + 8] = 1.7; DBUF[n + 9] = aa;
      n += 10;
    };
    put(d[0] - sx, d[1] - sy, d[2] - sz, a);
    put(d[0] + sx, d[1] + sy, d[2] + sz, a);
    put(tx + sx, ty + sy, tz + sz, 0);
    put(d[0] - sx, d[1] - sy, d[2] - sz, a);
    put(tx + sx, ty + sy, tz + sz, 0);
    put(tx - sx, ty - sy, tz - sz, 0);
  }
  if (DEV) (window.__dust = window.__dust || []).push([speedN, vl, len, n / 60, near, maxOv]);
  return n;
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
let particleM, starM, dustM;
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

// The sky. These used to be 150 solid CUBES scattered at 260 to 500 units,
// which at that distance is several pixels of unmistakable square - stars
// have no corners. And being placed in the world they parallaxed, so a
// "star" would slide past the track like a nearby rock.
// A skybox instead: fixed directions, re-emitted every frame at a constant
// radius from the EYE, so they never approach and never slide - and
// billboarded, so each is a point of light from wherever you look. Drawn
// first with depth testing off, which is what puts them behind everything.
// A ring of unit offsets, shared by every star: each one is drawn as a
// triangle FAN - bright in the middle, alpha zero all round the rim - so it
// falls off smoothly in every direction instead of having arms. Two fans, a
// tight one inside a wide faint one, because a single linear falloff reads
// flat while two stacked additively give a hot core inside a soft halo.
// That is what a light looks like. Crossed streaks are a camera artefact,
// not a shine, which is why the first attempt read as junk.
const RING = [];
for (let i = 0; i <= 6; i++) RING.push([Math.cos(i / 6 * 6.283), Math.sin(i / 6 * 6.283)]);
const SKY = [];
for (let i = 0; i < 130; i++) {
  const u = Math.random() * 2 - 1, th = Math.random() * 6.283, r = Math.sqrt(1 - u * u);
  // Colour resolved ONCE here rather than per star per frame: it never
  // changes, and rebuilding it in the draw loop was an array allocation per
  // star per frame for a constant.
  const ci = (Math.random() * 7) | 0;
  SKY.push([Math.cos(th) * r, u, Math.sin(th) * r,
    .1 + Math.random() * .2, .4 + Math.random() * .6,
    ci > 4 ? [1.6, 1.6, 1.8] : RAINBOW[ci].map((v) => 1.2 + v * .8),
    .35 + Math.random() * 1.5, Math.random() * 6.283]);
}
const KBUF = new Float32Array(SKY.length * 380);
function skyVerts(t, sx, sy, sz, ux, uy, uz) {
  let n = 0;
  const R = 46;
  const put = (x, y, z, c, a) => {
    KBUF[n] = x; KBUF[n + 1] = y; KBUF[n + 2] = z;
    KBUF[n + 3] = 0; KBUF[n + 4] = 1; KBUF[n + 5] = 0;
    KBUF[n + 6] = c[0]; KBUF[n + 7] = c[1]; KBUF[n + 8] = c[2]; KBUF[n + 9] = a;
    n += 10;
  };
  for (const [dx, dy, dz, sz0, br, c, rt, ph] of SKY) {
    // A slow swell, not a strobe: they breathe at their own rates and drift
    // in and out of each other, which is the shimmer.
    const f = .5 + .5 * Math.sin(t * rt + ph);
    const px = cam.e[0] + dx * R, py = cam.e[1] + dy * R, pz = cam.e[2] + dz * R;
    const a0 = br * (.4 + .6 * f);
    for (const [rad, al] of [[sz0 * (.85 + f * .4), a0], [sz0 * (2.4 + f * 1.4), a0 * .3]]) {
      for (let i = 0; i < 6; i++) {
        put(px, py, pz, c, al);
        for (const k of [i, i + 1]) {
          const ox = RING[k][0] * rad, oy = RING[k][1] * rad;
          put(px + sx * ox + ux * oy, py + sy * ox + uy * oy, pz + sz * ox + uz * oy, c, 0);
        }
      }
    }
  }
  return n;
}


function newRun() {
  // ~90 seconds, not 134. A score-chase run wants to end while you still
  // want another one, and a shorter line makes the difficulty ramp felt
  // rather than merely present.
  course = makeCourse(120);
  depth = depths(course);
  const tm = trackMeshes(course);
  roadM = createMesh(tm.road);
  railM = createMesh(tm.rail);
  placeStars();
  player.r = makeRider(course.start);
  player.speed = 14;
  player.lane = 0;
  braid = makeBraid(course);
  // Three nodes ahead, not six: at six the fog has all but eaten it, and the
  // opening shot is meant to SHOW you the thing you are chasing. It flees
  // through the intro and opens the gap back up by the time you have control.
  ride(braid.r, S * 3, first);
  trailM = createMesh(new Float32Array(0), true);
  particleM = partM(); starM = partM(); dustM = partM(); skyM = partM();
  DUST.length = 0; prevEye = null;
  PART.length = 0; pcur = 0;
  surge = 0; slipT = 0; fly = null; cine = 0; jumps = 0; falls = 0;
  rainbowT = 0; rainbowTotal = 0; streak = 0; bestStreak = 0; isBest = false; flash = 0; msgT = 0;
  energy = 40; slowT = 0; graceT = 0; armed = 0; laneV = 0; prevYaw = 0; turnRate = 0;
  introT = 0; introBeat = -1; endEye = null; endUp = null; endT = 0;
  // AHEAD of the start and off to one side, aimed down the track at the
  // fleeing rainbow - so the unicorn is behind the lens and out of frame.
  // Blending to the chase rig then sweeps the camera backwards past it, and
  // that sweep IS the unicorn's entrance. No extra machinery for a reveal.
  const sd = [course.start.dir[2], 0, -course.start.dir[0]];
  introEye = [
    course.start.p[0] + course.start.dir[0] * 26 + sd[0] * 7,
    course.start.p[1] + 3.4,
    course.start.p[2] + course.start.dir[2] * 26 + sd[2] * 7,
  ];
  timer = 0;
  camT = null; camU = null; prevP = null;
}

// The speed wake behind the unicorn is gone. It was seven rainbow bars
// stretched by speed, and by now the dust streaks, the zoom blur and the
// trail itself all say the same thing louder. It was priced at 79 bytes,
// and touch controls needed them: a phone that cannot steer is a game
// nobody on a phone can play, which beats a decoration every time.

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
  player.lane = 0; laneV = 0;
  energy = Math.max(energy, 45);
  fly = null;
  slowT = 0;
  // ...and a window where the demand cannot bite, because respawning at 12
  // in the middle of a long serpentine was a SOFT-LOCK. The throttle has a
  // 0.83s time constant, so half a second of grace only gets you to about
  // 22 - under a late-run demand of 26 you are thrown again instantly, and
  // again, walking backwards through the section forever. 1.6s reaches 31,
  // clear of anything, and the pity stardust now covers the whole window.
  graceT = 1.6;
}

// The gap is as long as you EARNED. Launch fast and the landing is chosen
// further down the chain - the hole literally opens up for you - and the
// flight is time-dilated on top, so a good launch buys a long, slow, silly
// arc through the stars instead of a hop.
function startFly(ramp) {
  const a = player.r.a;
  let b = player.r.b;
  const extra = ramp ? 2 : Math.max(0, Math.min(3, Math.floor((player.speed - 17) / 6)));
  for (let i = 0; i < extra && b.next.length && !b.next[0].gap; i++) b = b.next[0].to;
  const dist = d3(a.p, b.p);
  // A kicker throws you much higher and demands much more speed to stay up:
  // a gap only asks 16, this asks 30, so launching off a kicker on a dry
  // tank drops you straight through the arc you were aiming at.
  fly = { a, b, u: 0, v: Math.max(10, player.speed), need: ramp ? 30 : 16, dist, ramp,
    h: Math.min(26, dist * (ramp ? .55 : .3)), sink: 0, lat: player.lane * 2.8, air: 0 };
  tone(300, .35, 'sawtooth', .09);
  tone(660, .5, 'triangle', .05);
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
  if (mode === 'title' && course) {
    // Attract mode: the chase actually runs behind the menu rather than a
    // still image of it. Both ride at the same speed, so the flee rule holds
    // them a few lengths apart and they keep trading ground.
    player.speed = 26;
    updateBraid(braid, player.r.pos, 26, dt, depth);
    ride(player.r, 26 * dt, first);
    if (!player.r.a.next.length) newRun();
    // A trackside tower: planted, panning as they come past, then a cut to
    // the next one - the grammar of a race broadcast. A camera that chased
    // them would just be the game's own rig with nobody driving.
    demoT -= dt;
    if (demoT <= 0 || !demoEye) {
      demoSide = -demoSide;
      // Two kinds of shot, alternating. The tower is the wide one; the deck
      // cam is the one that makes it move - a lens lying ON the glass at the
      // edge of the road, so they come through at head height a couple of
      // metres away and the whole frame whips as they go by. Distance is the
      // only thing that reads as speed in a static shot.
      const low = demoSide > 0;
      let n = braid.r.b || braid.r.a;
      // Near enough that they arrive INSIDE the hold. At six nodes the tower
      // stood 150 units off - six seconds at demo speed against a five
      // second shot - so the cut came before they did, every time.
      for (let i = 0; i < (low ? 2 : 3) && n.next.length; i++) n = n.next[0].to;
      if (low && n.next.length) {
        const f = tframe(n, n.next[0].to, .3);
        // Just clear of the deck and inboard of the rail, and rolled with
        // the road: through a banked arc the horizon lies over with it,
        // which is the whole reason to put the camera down there.
        demoEye = [f[0][0] + f[2][0] * 4.1 + f[3][0] * .5,
          f[0][1] + f[2][1] * 4.1 + f[3][1] * .5,
          f[0][2] + f[2][2] * 4.1 + f[3][2] * .5];
        demoUp = f[3];
        demoT = 3.4;
      } else {
        const sd = (Math.hypot(n.dir[2], n.dir[0]) || 1) * (n.i % 2 ? 1 : -1);
        demoEye = [
          n.p[0] + n.dir[2] / sd * 12,
          // High enough to look DOWN on them: the words own the top of the
          // frame, so the race is framed into the bottom rather than fought.
          n.p[1] + 11 + Math.random() * 7,
          n.p[2] - n.dir[0] / sd * 12,
        ];
        demoUp = null;
        demoT = 5;
      }
    }
  }
  if (mode === 'intro') {
    introT += dt;
    msgT = Math.max(0, msgT - dt);
    // The rainbow is already leaving while you watch. Nothing else moves.
    updateBraid(braid, player.r.pos, player.speed, dt, depth);
    // Three beats: what is happening, who you are, what to do about it.
    const beatI = introT < 2.4 ? 0 : introT < 3.9 ? 1 : 2;
    if (beatI !== introBeat) {
      introBeat = beatI;
      say(['A rainbow is running loose...', '...and you are the only one fast enough.', 'GO!'][beatI], 2.6);
      tone(beatI < 2 ? 330 : 523, .3, 'triangle', .07);
    }
    // Kick and bass under the opening, resolving into the full track the
    // moment you get control. This is the SAME sequencer the run uses, told
    // it has no speed, nothing near and a dry tank - which is already
    // exactly "no arp, no lead, just the bottom end". Writing a second loop
    // for it, as the first attempt did, was ten lines to say one.
    //
    // It can only live here and not on the title: a browser makes no sound
    // until the page has had a real user gesture, and the gesture that
    // unlocks audio is the same SPACE that leaves the title behind.
    pump(0, 0, 1);
    if (introT > INTRO) { mode = 'run'; say('CATCH THE RAINBOW - collect stardust to keep the boost lit', 3.5); }
  }
  if (mode === 'end') {
    // It keeps going. The camera does not.
    msgT = Math.max(0, msgT - dt);
    endT += dt;
    // Eased down to a canter: at full boost it is a dot within two seconds,
    // and the shot is supposed to let you watch it go.
    player.speed += (25 - player.speed) * Math.min(1, dt * .8);
    ride(player.r, player.speed * dt, first);
    if (rainbowT > 0) rainbowT = Math.max(0, rainbowT - dt / 6);
  }
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
    const target = canBoost ? top : heldBack() ? 9 : 20;
    player.speed += (target - player.speed) * Math.min(1, dt * (heldBack() ? 3 : 1.2));
    if (canBoost && !free) energy = Math.max(0, energy - dt * 19);

    if (fly) {
      cine = Math.min(1, cine + dt * 4);
      // air control: boost burns stardust to stretch the arc, lateral drift
      // lines up the landing (and the stars strung along the arc)
      if (heldFwd() && (free || energy > 0)) {
        // Same ceiling as the deck: the flight is dilated now, so an
        // uncapped air-boost pumped landing speeds to 79 against a limit of
        // 46 - and a landing at 79 gets thrown off the very next bend.
        fly.v = Math.min(46, fly.v + dt * 16);
        if (!free) energy = Math.max(0, energy - dt * 22);
        burst(prevP || player.r.pos, 1, 2);
      }
      fly.lat += turnDir() * dt * 7;
      fly.lat = Math.max(-4.5, Math.min(4.5, fly.lat));
      fly.air += dt;
      fly.u += fly.v * .5 / fly.dist * dt;   // dilated: air time is the reward
      const deficit = Math.max(0, fly.need - fly.v);
      fly.sink += deficit * dt * .9;
      if (fly.sink > 7) doFall('Fell short! Carry more speed into the jump - or boost mid-air.');
      else if (fly.u >= 1) {
        // Off a kicker you have to come back over the road. Drifting out
        // for the far dust is free while you are in the air and expensive
        // at the moment you touch down, which is what makes the reward a
        // decision rather than a pickup.
        if (fly.ramp && Math.abs(fly.lat) > 3.6) { doFall('Missed the deck! Swing back over the road before you land.'); return; }
        placeAt(player.r, fly.b, fly.a);
        player.speed = Math.min(46, Math.max(player.speed, fly.v * .9));
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
      // Lateral physics. a = v * turnRate is the real centrifugal term, and
      // it pushes you to the OUTSIDE of the bend; steering is an opposing
      // acceleration you have to actually apply. Fast through a serpentine
      // is no longer free - you have to hold the line, and if you cannot,
      // you go over the edge. This is what makes falling off possible.
      const yawNow = Math.atan2(player.r.tan[0], player.r.tan[2]);
      let dy2 = yawNow - prevYaw;
      dy2 -= Math.round(dy2 / (2 * Math.PI)) * 2 * Math.PI;
      prevYaw = yawNow;
      turnRate = dt > 0 ? dy2 / dt : 0;
      const cf = -turnRate * player.speed / 2.8 * .3;      // lane units/s^2
      laneV += (cf + turnDir() * 6 - laneV * 2.6) * dt;
      player.lane += laneV * dt;
      if (!turnDir() && Math.abs(turnRate) < .3) player.lane -= Math.sign(player.lane) * Math.min(Math.abs(player.lane), dt * .5);
      if (Math.abs(player.lane) > 1.25) doFall('Thrown off the edge! Steer INTO the bend to hold the line.');
      player.lane = Math.max(-1.25, Math.min(1.25, player.lane));
      // Gravity along the tangent: dives are FREE speed - use them.
      player.speed -= player.r.tan[1] * dt * 22;
      player.speed = Math.max(7, Math.min(46, player.speed));
      armed = Math.max(0, armed - dt);
      ride(player.r, player.speed * dt, first);
      // Fires as you CROSS the kicker, not when you press. Launching from
      // mid-edge would either snap you back to the node the arc starts at
      // or drop you in already half an arc up - and committing a moment
      // early is a better ask of the player than hitting a frame.
      if (player.r.edge && player.r.edge.gap) startFly();
      else if (armed > 0 && player.r.a.kick && player.r.s < 6) { armed = 0; startFly(true); }
      else {
        // Demand sections: below the minimum for half a second, you slide off.
        graceT = Math.max(0, graceT - dt);
        const req = player.r.b ? player.r.b.req : 0;
        if (req && !graceT && player.speed < req - 1) {
          slowT += dt;
          if (slowT > .5) doFall('Too slow for the bend - it threw you!');
        } else slowT = 0;
      }
      if (player.r.a === course.finish || (!player.r.a.next.length && !player.r.b)) {
        mode = 'end';
        endEye = [...cam.e];
        say('', 0);
        if (rainbowTotal > best) {
          best = rainbowTotal;
          isBest = true;
          try { localStorage.rsBest = best.toFixed(1); } catch (e) { /* nowhere to keep it */ }
          RAINBOW.forEach((_, i) => tone(523 * 2 ** (i / 7), .5, 'triangle', .09, ac && ac.currentTime + i * .1));
        }
      }
    }

    // stardust pickup
    if (player.r) {
      const pi = player.r.a.i, pp2 = fly ? (prevP || player.r.pos) : player.r.pos;
      for (const st2 of stars) {
        if (st2.taken || st2.i < pi - 1 || st2.i > pi + (fly ? 6 : 2)) continue;
        if (d3(st2.p, pp2) < (fly ? 4 : 2.7)) {
          st2.taken = true;
          energy = Math.min(100, energy + 10);
          surge = Math.max(surge, .25);
          burst(st2.p, 8, 5);
          tone(880 + Math.random() * 220, .12, 'triangle', .07);
        }
      }
    }

    speedN = (player.speed - 7) / 39;
    speedSm += (speedN - speedSm) * Math.min(1, dt * 1.5);

    if (mode === 'run') {
      updateBraid(braid, player.r.pos, player.speed, dt, depth);
      // Reaching the HEAD is the catch - stepping on the tail was never the
      // fantasy, and it made the merge feel like an accident.
      if (!fly && braid.burst <= 0 && d3(player.r.pos, braid.r.pos) < 4.6) {
        mode = 'rainbow';
        rainbowT = 7;
        energy = 100;
        flash = 1;
        surge = 1;
        burst(braid.r.pos, 70, 13);
        burst(player.r.pos, 40, 8);
        say('YOU ARE THE RAINBOW - jump the gaps to keep it burning!', 5);
        RAINBOW.forEach((_, i) => tone(392 * 2 ** (i / 7), .35, 'triangle', .1, ac && ac.currentTime + i * .07));
      }
      const hd = braid.tl.head;
      if (hd) closeN = Math.max(0, 1 - d3(player.r.pos, hd) / 40);
    } else if (mode === 'rainbow') {
      rainbowT -= dt / 2.2;
      rainbowTotal += dt;
      streak += dt;
      bestStreak = Math.max(bestStreak, streak);
      closeN = 1;
      if (rainbowT <= 0) { detach(); say('The last colour burned out - run it down again!', 2.5); }
    }
    pump(speedN, closeN, mode !== 'rainbow' && energy < 8);
  }

  if (doAct) {
    if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
    if (mode === 'title' || mode === 'end') { newRun(); mode = 'intro'; demoEye = null; }
    else if (mode === 'intro') introT = INTRO;      // skippable
    else if (!fly && player.r && player.r.b && player.r.b.kick) {
      armed = 2.2;
      tone(520, .12, 'square', .06);
    }
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

  // ONE handedness for everything: cross(up, forward), which is what
  // track.js's own frame produces. main.js used cross(forward, up) - the
  // opposite - so its side vector pointed screen-RIGHT while the track's
  // pointed screen-LEFT. That single sign is why pressing left slid the
  // unicorn right, and why the lean on serpentines looked inside out.
  const X = (u, f) => [u[1] * f[2] - u[2] * f[1], u[2] * f[0] - u[0] * f[2], u[0] * f[1] - u[1] * f[0]];
  const hd2 = Math.atan2(T[0], T[2]);
  let dhd = hd2 - lastHd;
  dhd -= Math.round(dhd / (2 * Math.PI)) * 2 * Math.PI;
  lastHd = hd2;
  if (dt > 0) rollSm += (Math.max(-.6, Math.min(.6, dhd / dt * .5)) - rollSm) * Math.min(1, dt * 3);
  const roll = rollSm * (1 - cine);
  const cR = Math.cos(roll), sR = Math.sin(roll);
  let sideL = X(up, T);
  up = [up[0] * cR + sideL[0] * sR, up[1] * cR + sideL[1] * sR, up[2] * cR + sideL[2] * sR];
  sideL = X(up, T);
  // The DECK frame, unrolled: everything POSITIONAL rides this, because the
  // extra lean is a pose, not a place. Offsetting along a rolled-up vector
  // is what used to drive the unicorn under the road on hard bends.
  const dSide = X(rUp, rT);
  // ...and the rolled frame, for the pose only.
  const rSide0 = X(rUp, rT);
  const rUp2 = [rUp[0] * cR + rSide0[0] * sR, rUp[1] * cR + rSide0[1] * sR, rUp[2] * cR + rSide0[2] * sR];
  const rSide = X(rUp2, rT);
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
  // Dynamic shake: two incommensurable sine pairs so it never settles into a
  // visible rhythm, scaled hard by speed and punched by every surge. Gated
  // out of the jump cinematic, which wants to be still.
  const sh = (speedSm * speedSm * .22 + surge * .3) * (1 - cine);
  const shx = (Math.sin(now * .041) + Math.sin(now * .0173) * .6) * sh;
  const shy = (Math.cos(now * .031) + Math.cos(now * .0119) * .6) * sh * .7;
  const shr = Math.sin(now * .027) * sh * .06;
  let tgtE = [
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
  // --- the two cutscenes, both expressed as an override on the ONE rig ---
  // Neither gets its own camera. The opening blends the rig's own target
  // toward a held wide shot; the closing pins the eye and lets the aim keep
  // following. Anything else would mean a second set of rules to keep in
  // step with corkscrews, banking and lane offset.
  let ck = cine > .02 ? Math.min(1, dt * (3.5 + 60 * (1 - cine))) : 1, ckA = 0;
  if (mode === 'title' && demoEye) {
    const hp3 = braid.tl.head || braid.r.pos;
    tgtE = demoEye;
    // Aim ABOVE them, not at them. A camera pointed at its subject puts that
    // subject in the middle of the frame by definition - and the middle of
    // this frame is the title. Raising the tower only changed the angle, not
    // where they landed on screen; lifting the AIM by a share of the range
    // is what drops them into the clear band under the words.
    const mx = (hp3[0] + p[0]) / 2, my = (hp3[1] + p[1]) / 2, mz = (hp3[2] + p[2]) / 2;
    tgtA = [mx, my + d3(demoEye, [mx, my, mz]) * .22 + 1.4, mz];
    // A HARD cut of position and a slow pan of the aim - which is the whole
    // grammar. Springing both, as the rig does everywhere else, meant the
    // eye crawled the seventy-odd units between towers instead of cutting,
    // so it spent most of the shot in transit pointing at nothing.
    ckA = Math.min(1, dt * 2.6);
  } else if (mode === 'intro') {
    // Held wide on the escaping rainbow, then swung round behind the
    // unicorn - which is how the unicorn ARRIVES in the film without any
    // extra machinery: the shot that finds it is the shot you then ride.
    const w = 1 - sm(Math.max(0, Math.min(1, (introT - 2.7) / 1.9)));
    const drift = introT * .6;
    const hp2 = braid.tl.head || braid.r.pos;
    for (let i = 0; i < 3; i++) {
      const ie = introEye[i] + course.start.dir[i] * drift;
      tgtE[i] += (ie - tgtE[i]) * w;
      tgtA[i] += ((i === 1 ? hp2[i] + 1.5 : hp2[i]) - tgtA[i]) * w;
    }
    ck = 1;
  } else if (mode === 'end' && endEye) {
    tgtE = endEye;
    tgtA = [p[0], p[1] + 1.1, p[2]];
    ck = Math.min(1, dt * 2.2);
  }
  for (let i = 0; i < 3; i++) {
    cam.e[i] += (tgtE[i] - cam.e[i]) * ck;
    cam.a[i] += (tgtA[i] - cam.a[i]) * (ckA || ck);
  }
  // The closing shot holds its horizon too - the runout still bends, and a
  // locked-off camera that rolled with a track it is no longer riding would
  // read as a mistake rather than as stillness.
  if (mode === 'end' && !endUp) endUp = up.map((v, i) => v - sideL[i] * (lean * .5 + shr));
  // A broadcast camera keeps its horizon level; it is bolted to the scenery,
  // not riding the road.
  const cu = mode === 'title' ? (demoUp || [0, 1, 0])
    : mode === 'end' ? endUp : up.map((v, i) => v - sideL[i] * (lean * .5 + shr));
  fovSm += (1.03 + speedSm * .38 + surge * .2 + cine * .16 - (mode === 'end' ? .22 : 0) - fovSm) * Math.min(1, dt * 6);
  // Dev only: the run's vital signs, so tools/test-balance.mjs can tune the
  // stardust economy against real play instead of arithmetic on paper.
  // Only while you are actually driving: the cutscenes hold the speed static
  // with no throttle, and letting those frames into the sample quietly drags
  // every percentage in the balance report toward "too slow".
  if (DEV && (mode === 'run' || mode === 'rainbow')) (window.__st = window.__st || []).push([now, player.speed, energy, falls, jumps, mode === 'rainbow' ? 1 : 0, rainbowTotal, player.lane, turnRate, braid && braid.r ? d3(player.r.pos, braid.r.pos) : 0, !fly && player.r.b && player.r.b.kick ? 1 : 0, fly ? 1 : 0, fly ? fly.lat : 0]);
  if (DEV) (window.__cam = window.__cam || []).push([now, cam.e[0], cam.e[1], cam.e[2], cam.a[0], cam.a[1], cam.a[2], fovSm, cu[0], cu[1], cu[2]]);
  vp = mul(perspective(fovSm, VW / VH, .1, 700), lookAt(cam.e, cam.a, cu));
  frameGL(vp, cam.e, FOG);

  if (course) {
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
    const own = mode === 'rainbow' || mode === 'end';
    const nb = trailVerts(braid.tl, now / 1000, own);
    if (nb) updateMesh(trailM, BUF, nb);
    updateMesh(starM, SBUF, starVerts(now));
    updateMesh(particleM, PBUF, particleVerts(now));
    updateMesh(dustM, DBUF, dustVerts(speedN, dt));

    // The sky first, with no depth test at all, so nothing can ever occlude
    // it and it can never occlude anything. A skybox is not far away - it is
    // simply behind.
    // Screen right, from the same up vector lookAt uses, so each star is
    // square-on to the viewport however the world is rolling.
    const vz = [cam.e[0] - cam.a[0], cam.e[1] - cam.a[1], cam.e[2] - cam.a[2]];
    const vs = X(cu, vz), vsl = Math.hypot(vs[0], vs[1], vs[2]) || 1;
    glMode(1);
    gl.disable(gl.DEPTH_TEST);
    updateMesh(skyM, KBUF, skyVerts(now / 1000, vs[0] / vsl, vs[1] / vsl, vs[2] / vsl, cu[0], cu[1], cu[2]));
    drawMesh(skyM, IDENT);
    gl.enable(gl.DEPTH_TEST);
    glMode(0);

    const bob = Math.abs(Math.sin(now / 1000 * 11)) * Math.min(1, player.speed / 14) * .1;
    const S8 = .85, lx = fly ? 0 : player.lane * 2.8;
    const base = [
      p[0] + rUp[0] * (bob + .04) + dSide[0] * lx,
      p[1] + rUp[1] * (bob + .04) + dSide[1] * lx,
      p[2] + rUp[2] * (bob + .04) + dSide[2] * lx,
    ];
    const uniMdl = modelFrame(base, rSide, rUp2, rT, S8);
    drawMesh(uniM, uniMdl);
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
    const headMdl = modelFrame(hp, fX, hY, fZ, S8);
    drawMesh(headM, headMdl);

    // The deck is glass, so it shows what stands over it. The mirror is one
    // plane, through the rider and along the DECK's own normal - rUp, not
    // rUp2: rUp2 carries the cosmetic lean, and hanging the mirror off a
    // pose rather than the road would tilt the whole reflection with a
    // flourish the track never made. Distant deck reflects through that
    // same local plane and is a little wrong for it; fog, a third of the
    // brightness and a few pixels of screen make that academic.
    glMode(2);
    mask(1);
    drawMesh(roadM, IDENT);
    mask(2);
    glMode(1);
    setDim(.34);
    const RFL = reflector(p, rUp);
    // NOT the rails. One local plane is only right near the player, and the
    // rail mesh is the WHOLE course - so distant rails reflected through it
    // landed in nonsense places and drew a convincing phantom road beside
    // the real one. Reflecting a localised thing near the deck is fine;
    // reflecting all the geometry in the level through a local plane is
    // not. Read as "the track reflects in its own glass, some kind of bug",
    // and that was exactly right.
    // Only what the ONE plane is actually right about. Measured, a point
    // lying on the deck reflects onto itself to within 0.2 units at ten
    // ahead, but 5.7 mean and 27 worst at sixty - so a distant rainbow's
    // mirror image landed tens of units off, sliding away as the track
    // bent. That is the "reflection goes downward" of the report.
    // The unicorn and its sparks ARE the player, so their plane is exact.
    // The trail is exact too once you own it, since it is fed from the
    // player; while chasing it only draws when the braid is genuinely near.
    // Stardust ranged sixteen nodes ahead and was the worst offender.
    if (trailM.n && (own || d3(p, braid.r.pos) < 18)) drawMesh(trailM, RFL);
    drawMesh(uniM, mul(RFL, uniMdl));
    drawMesh(headM, mul(RFL, headMdl));
    if (particleM.n) drawMesh(particleM, RFL);
    setDim(1);
    mask(0);
    drawMesh(railM, IDENT);
    if (trailM.n) drawMesh(trailM, IDENT);
    if (starM.n) drawMesh(starM, IDENT);
    if (particleM.n) drawMesh(particleM, IDENT);
    if (dustM.n) drawMesh(dustM, IDENT);
    glMode(0);
  }

  // --- HUD ----------------------------------------------------------------
  ctx.clearRect(0, 0, VW, VH);
  ctx.textAlign = 'center';
  if (mode === 'title') {
    // A scrim, not a wall. The race is running live underneath, so the menu
    // has to sit ON it: an even tint to hold the text, darkest across the
    // band the words occupy and clearing toward the bottom, where the track
    // and the two of them are worth looking at.
    const sc = ctx.createLinearGradient(0, 0, 0, VH);
    sc.addColorStop(0, 'rgba(8,5,18,.88)');
    sc.addColorStop(.5, 'rgba(8,5,18,.8)');
    sc.addColorStop(.72, 'rgba(8,5,18,.34)');
    sc.addColorStop(1, 'rgba(8,5,18,.04)');
    ctx.fillStyle = sc;
    ctx.fillRect(0, 0, VW, VH);
    RAINBOW.forEach(([r, gg, b], i) => {
      ctx.fillStyle = `rgba(${r * 255},${gg * 255},${b * 255},.8)`;
      ctx.fillRect(0, 100 + i * 7, VW, 5);
    });
    ctx.fillStyle = '#f3ead6';
    ctx.font = 'bold 40px system-ui';
    ctx.fillText('RAINBOW SURFER', VW / 2, 76);
    ctx.font = '13px system-ui';
    ctx.fillStyle = '#b8ab92';
    ctx.fillText('Stardust feeds the boost. Bends and jumps demand SPEED.', VW / 2, 164);
    ctx.fillText('Catch the rainbow to BECOME it. Score is your burn time.', VW / 2, 182);
    if (best > 0) {
      ctx.fillStyle = '#9be8ff';
      ctx.fillText('best ' + best.toFixed(1) + 's', VW / 2, 200);
    }
    ctx.fillStyle = '#7a6e5c';
    ctx.fillText('↑ boost   ↓ brake   ← → steer   SPACE at a gold gate to jump', VW / 2, 222);
    ctx.fillText('touch: a side to steer, both to boost, top to jump', VW / 2, 240);
    ctx.fillStyle = '#e8b923';
    ctx.fillText('press SPACE', VW / 2, 258);
    // Author credit, painted piecewise so each link run owns a hit box and
    // lights up under the pointer; a run with no url registers nothing.
    ctx.font = '11px system-ui';
    ctx.textAlign = 'left';
    let cw = 0;
    for (const p of CREDIT) cw += ctx.measureText(p[0]).width;
    let cx = (VW - cw) / 2, hit = 0;
    links = [];
    for (const p of CREDIT) {
      const pw = ctx.measureText(p[0]).width;
      const on = p[1] && hotX >= cx && hotX <= cx + pw && hotY >= 321 && hotY <= 335;
      if (on) hit = 1;
      ctx.fillStyle = on ? '#e8b923' : p[1] ? '#8a7f6a' : '#5f5648';
      ctx.fillText(p[0], cx, 332);
      if (on) ctx.fillRect(cx, 334, pw, 1);
      if (p[1]) links.push([cx, 321, pw, 14, p[1]]);
      cx += pw;
    }
    hud.style.cursor = hit ? 'pointer' : '';
    ctx.textAlign = 'center';
  } else {
    // The jump is a held cinematic shot and wants to be SHARP. The blur used
    // to be boosted by `cine`, which ghosted the whole frame exactly when
    // the camera was swinging - it reads as double vision.
    const blur = (Math.max(0, speedSm - .28) + surge * .5) * (1 - cine * .9);
    // REAL radial blur: redraw the rendered frame over itself a few times,
    // scaled up about the viewport centre. Successive scaled copies at low
    // alpha smear every pixel outward along its own radius - a zoom blur,
    // for the price of three drawImage calls and no shader.
    if (blur > .02) {
      // ADDITIVE, not a plain alpha composite. Averaging scaled copies in
      // over the crisp frame darkens small bright features - every scaled
      // copy is mostly dark sky - so the rainbow's own head came out as a
      // dim disc. Adding them only ever brightens: bright things smear
      // outward as light, which is the whole point.
      ctx.globalCompositeOperation = 'lighter';
      // Layer count rides the blur, because each pass is a full-screen
      // composite: six of them cost a third of the frame rate at a speed
      // you spend most of the run below. Two when it barely matters, six
      // when the screen is supposed to come apart.
      // Three passes, spaced wider and pushed harder, rather than six close
      // together: each pass is a full-screen fill, and six of them cost a
      // third of the frame rate for a difference you cannot see.
      const layers = 1 + Math.min(2, (blur * 3) | 0);
      for (let i = 1; i <= layers; i++) {
        const sc = 1 + i * i * .026 * (.7 + blur * 2.1);
        ctx.globalAlpha = Math.min(.5, blur * .62) / (i * .7);
        const w2 = VW * sc, h2 = VH * sc;
        ctx.drawImage(glc, (VW - w2) / 2, (VH - h2) / 2, w2, h2);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    if (blur > 0) {
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

    // Cutscenes get bars and no instruments. A speedo ticking over a held
    // shot is the fastest way to tell the player it is not a film.
    const cs = mode === 'intro' || mode === 'end';
    if (cs) {
      const bar = VH * (mode === 'intro' ? .1 * Math.min(1, introT * 3) : .1);
      ctx.fillStyle = '#07050f';
      ctx.fillRect(0, 0, VW, bar);
      ctx.fillRect(0, VH - bar, VW, bar);
    }
    ctx.font = '14px system-ui';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#f3ead6';
    if (!cs) {
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
    }
    // How far down the line you are - the run needs a visible middle.
    // Measured against the FINISH, not the node count: the runout past it
    // exists for the closing shot and would otherwise stop the bar filling.
    if (player.r && course && !cs) {
      const pr = Math.min(1, player.r.a.i / course.finish.i);
      ctx.fillStyle = 'rgba(160,150,130,.22)';
      ctx.fillRect(VW - 130, 18, 112, 4);
      ctx.fillStyle = '#b8ab92';
      ctx.fillRect(VW - 130, 18, 112 * pr, 4);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#7a6e5c';
      ctx.fillText(best > 0 ? 'best ' + best.toFixed(1) + 's' : 'the line', VW - 18, 38);
      ctx.textAlign = 'left';
    }

    ctx.textAlign = 'center';
    // The kicker prompt. It has to appear while there is still time to act,
    // which is the same window the arming accepts.
    if (!cs && !fly && player.r && player.r.b && player.r.b.kick) {
      ctx.font = 'bold 15px system-ui';
      ctx.fillStyle = armed > 0
        ? `rgba(255,240,150,${.65 + Math.sin(now / 60) * .35})` : '#c8a24a';
      ctx.fillText(armed > 0 ? 'JUMP ARMED' : 'SPACE - jump the kicker', VW / 2, VH - 96);
    }
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
    // Not over the end panel - the run's last shout would sit across its
    // header, which is exactly where the score wants to be read.
    if (msgT > 0 && mode !== 'end') {
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
      // The end screen IS the reason to press SPACE again: the score large
      // enough to aim at, the record beside it, and the run broken into the
      // three things you can actually get better at.
      // Hold on the shot before the numbers arrive. The panel covers most of
      // the frame, and the frame is the point of the ending - the run does
      // not stop, only the camera does, and you should get to see that.
      // Faded, NOT early-returned: this block is the tail of the frame
      // function and a return here would skip requestAnimationFrame and
      // stop the game dead.
      const ea = sm(Math.max(0, Math.min(1, (endT - 3.2) / 1.4)));
      ctx.globalAlpha = ea;
      ctx.fillStyle = '#000000c4';
      ctx.fillRect(0, VH / 2 - 96, VW, 192);
      RAINBOW.forEach(([r, gg, b], i) => {
        ctx.fillStyle = `rgba(${r * 255},${gg * 255},${b * 255},.85)`;
        ctx.fillRect(VW / 2 - 122 + i * 35, VH / 2 - 96, 33, 3);
      });
      ctx.fillStyle = '#b8ab92';
      ctx.font = '13px system-ui';
      ctx.fillText('END OF THE LINE', VW / 2, VH / 2 - 68);
      ctx.fillStyle = isBest ? '#9be8ff' : '#e8b923';
      ctx.font = 'bold 52px system-ui';
      ctx.fillText(rainbowTotal.toFixed(1) + 's', VW / 2, VH / 2 - 20);
      ctx.font = '12px system-ui';
      ctx.fillStyle = '#7a6e5c';
      ctx.fillText('AS THE RAINBOW', VW / 2, VH / 2 - 2);
      if (isBest) {
        ctx.fillStyle = '#9be8ff';
        ctx.font = 'bold 15px system-ui';
        ctx.fillText('NEW BEST', VW / 2, VH / 2 + 22);
      } else {
        ctx.fillStyle = '#b8ab92';
        ctx.font = '13px system-ui';
        ctx.fillText('best ' + best.toFixed(1) + 's', VW / 2, VH / 2 + 22);
      }
      ctx.font = '13px system-ui';
      const cols = [['longest burn', bestStreak.toFixed(1) + 's'], ['jumps', '' + jumps], ['falls', '' + falls]];
      cols.forEach(([k, v], i) => {
        const x = VW / 2 + (i - 1) * 130;
        ctx.fillStyle = '#f3ead6';
        ctx.fillText(v, x, VH / 2 + 52);
        ctx.fillStyle = '#7a6e5c';
        ctx.font = '11px system-ui';
        ctx.fillText(k, x, VH / 2 + 68);
        ctx.font = '13px system-ui';
      });
      ctx.fillStyle = '#e8b923';
      ctx.fillText('SPACE - ride again', VW / 2, VH / 2 + 88);
      ctx.globalAlpha = 1;
    }
  }
  requestAnimationFrame(frame);
}
// Build a world at boot, so the title screen has a race to show. The title
// tick drives it; pressing SPACE throws it away and builds a fresh one.
newRun();
requestAnimationFrame(frame);

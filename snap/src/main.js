// Unicorn Snap - point a camera at a unicorn that knows exactly how good it
// looks.
//
// Three phases in a loop: take a commission and STYLE the unicorn for it,
// SHOOT it while it works the set, then look at what you got. Six frames a
// job, three jobs a season.

import {
  gl, initGL, frameGL, mode, drawMesh, createMesh, updateMesh,
  perspective, lookAt, mul, modelTR, mask, setDim, setSdw, IDENT,
} from './gl.js';
import { buildUnicorn, paint, flushPaint, makePose, solve, COAT, HORN, HOOF } from './uni.js';
import { studioMesh, shadowMesh, lightsMesh, shadowMat } from './studio.js';
import { makeMane, updateMane, maneVerts, recolour, MANE_CORE, MANE_HALO } from './mane.js';
import { makeAnim, applyPose, POSE_NAME, SHAKE, IDLE } from './pose.js';
import { makeDeco, makeGlitter, glitterVerts, GLITTER_BUF, PALETTE, RB, MAX_GLITTER, swatch } from './deco.js';
import { makeActor, act, move } from './act.js';
import { scoreShot } from './score.js';
import { makeBrief, briefText, briefStyle, POSE_BONUS } from './brief.js';
import { wake, awake, music, shutter, sparkle, pleased } from './snd.js';

const FOG = [.09, .07, .05];
const FILM = 6, SEASON = 3;

const c = document.getElementById('c');
initGL(c);

function resize() {
  const d = Math.min(devicePixelRatio || 1, 2);
  c.width = innerWidth * d;
  c.height = innerHeight * d;
  c.style.width = innerWidth + 'px';
  c.style.height = innerHeight + 'px';
}
addEventListener('resize', resize);
resize();

const studio = studioMesh(), shadow = shadowMesh(), lights = lightsMesh();
const U = buildUnicorn();
const P = makePose();
const anim = makeAnim();
const A = makeActor();
const M = makeMane();
const deco = makeDeco();
const G = makeGlitter();
const maneCore = createMesh([0, 0, 0, 0, 1, 0, 1, 1, 1, 1], true);
const maneHalo = createMesh([0, 0, 0, 0, 1, 0, 1, 1, 1, 1], true);
const glitMesh = createMesh([0, 0, 0, 0, 1, 0, 1, 1, 1, 1], true);
recolour(M, deco);

// --- the furniture --------------------------------------------------------
const el = (tag, css, parent, text) => {
  const e = document.createElement(tag);
  e.style.cssText = css;
  if (text) e.textContent = text;
  (parent || document.body).appendChild(e);
  return e;
};
const BTN = 'font:600 13px system-ui,sans-serif;padding:7px 11px;border:0;border-radius:8px;cursor:pointer;color:#3a2a12;background:#00000018';
const GO = BTN + ';background:#3a2a12;color:#f2d98a;padding:10px 20px;font-size:15px';
const TXT = 'font:600 14px system-ui,sans-serif;color:#3a2a12;text-align:center;line-height:1.5';

const top = el('div', 'position:fixed;left:0;right:0;top:0;padding:12px 14px;pointer-events:none;' + TXT);
const bar = el('div', 'position:fixed;left:0;right:0;bottom:0;display:flex;flex-direction:column;align-items:center;gap:7px;padding:10px 8px 14px;touch-action:none');
const rowZ = el('div', 'display:flex;gap:6px;flex-wrap:wrap;justify-content:center', bar);
const rowC = el('div', 'display:flex;gap:6px;flex-wrap:wrap;justify-content:center', bar);
const rowG = el('div', 'display:flex;gap:8px;align-items:center;justify-content:center', bar);
const flash = el('div', 'position:fixed;inset:0;background:#fff;opacity:0;pointer-events:none');
const sheet = el('div', 'position:fixed;inset:0;display:none;flex-direction:column;align-items:center;justify-content:center;gap:12px;background:#00000055;backdrop-filter:blur(3px);padding:16px');

const ZONES = ['mane', 'tail', 'coat', 'horn', 'hoof'];
let zone = 0;

const zBtns = ZONES.map((z, i) => {
  const b = el('button', BTN, rowZ, z.toUpperCase());
  b.onclick = () => { wake(); zone = i; sync(); };
  return b;
});
const glitBtn = el('button', BTN, rowZ, 'GLITTER');
glitBtn.onclick = () => {
  wake();
  deco.glitter = (deco.glitter + 1) % (MAX_GLITTER + 1);
  if (deco.glitter) sparkle(9);
  sync();
};
const cBtns = [RB, 0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
  const b = el('button', BTN, rowC, '');
  b.style.width = b.style.height = '32px';
  b.style.padding = '0';
  b.dataset.i = i;
  b.onclick = () => { wake(); apply(i); sparkle(3); };
  return b;
});
const goBtn = el('button', GO, rowG, 'START THE SHOOT');
goBtn.onclick = () => { wake(); startShoot(); };

function apply(i) {
  const key = ZONES[zone];
  if (i === RB && zone > 1) return;
  deco[key] = i;
  if (zone < 2) recolour(M, deco);
  else {
    paint(U, zone === 2 ? COAT : zone === 3 ? HORN : HOOF, PALETTE[i]);
    flushPaint(U);
  }
  sync();
}

function sync() {
  zBtns.forEach((b, i) => { b.style.background = i === zone ? '#00000038' : '#00000018'; });
  cBtns.forEach((b) => {
    const i = +b.dataset.i, col = swatch(i);
    b.style.background = i === RB
      ? 'linear-gradient(135deg,#c9524f,#d9c24f,#7db06b,#6b7dc9,#9a6bc4)'
      : `rgb(${col.map((v) => (v * 255) | 0)})`;
    b.style.opacity = i === RB && zone > 1 ? '.25' : '1';
    b.style.outline = deco[ZONES[zone]] === i ? '2px solid #3a2a12' : '0';
  });
  glitBtn.textContent = 'GLITTER ' + '*'.repeat(deco.glitter);
}

// --- the game -------------------------------------------------------------
let phase = 0;                 // 0 style, 1 shoot, 2 result, 3 season over
let round = 0, film = FILM, seasonPts = 0, best = null, brief = null, lastJob = 0;
let rollPts = 0, onBrief = 0;
let bestEver = 0;
try { bestEver = +localStorage.usBest || 0; } catch (e) { /* no store, no problem */ }

function newRound() {
  brief = makeBrief(round);
  best = null;
  rollPts = 0;
  onBrief = 0;
  film = FILM;
  phase = 0;
  anim.mode = IDLE;
  P.x = P.z = P.yaw = 0;
  layout();
}

function startShoot() {
  phase = 1;
  A.hold = 99;                 // get it working immediately, not after a beat
  layout();
}

function endRound() {
  phase = 2;
  // The job is the WHOLE ROLL, not its best frame. Keeping only the best of
  // six made the shutter free: the balance probe put a player who never
  // aimed at 0.73 of one who did, because six draws from the pose table
  // almost always contain one good one. Summing every frame means a wasted
  // frame is a wasted frame.
  const b = briefStyle(brief, deco);
  const total = rollPts + b.pts;
  lastJob = total;
  seasonPts += total;
  if (best) pleased();
  layout();                    // the sheet is display:none until this runs
  showSheet(b, total);
}

function layout() {
  bar.style.display = phase === 0 ? 'flex' : 'none';
  sheet.style.display = phase >= 2 ? 'flex' : 'none';
  top.textContent = phase === 0
    ? `JOB ${round + 1}/${SEASON} - ${briefText(brief)}`
    : phase === 1 ? `${briefText(brief)}      FILM ${film}` : '';
}

function showSheet(bs, total) {
  sheet.textContent = '';
  const card = el('div', 'background:#f5e6bd;border-radius:14px;padding:16px 18px;max-width:min(92vw,460px);display:flex;flex-direction:column;align-items:center;gap:10px;' + TXT, sheet);
  if (phase === 3) {
    el('div', 'font-size:22px;font-weight:800', card, 'THAT IS A WRAP');
    el('div', '', card, `Season total ${seasonPts}`);
    if (seasonPts > bestEver) {
      bestEver = seasonPts;
      try { localStorage.usBest = bestEver; } catch (e) { /* no store, no problem */ }
      el('div', 'color:#a05a10;font-weight:800', card, 'A NEW PERSONAL BEST');
    } else el('div', '', card, `Best season ${bestEver}`);
  } else {
    el('div', 'font-size:20px;font-weight:800', card, best ? `${total} points` : 'No usable frames');
    if (best) {
      el('div', 'font-weight:500;font-size:13px', card,
        `your best of ${FILM}` + (onBrief ? ` - ${onBrief} on brief` : ''));
      const im = el('img', 'width:min(78vw,380px);border-radius:8px;display:block', card);
      im.src = best.img;
      const list = el('div', 'font-weight:500;font-size:13px;line-height:1.6', card);
      for (const [n, p] of best.parts.concat(bs.lines)) {
        el('div', '', list, `${n} +${p}`);
      }
      el('div', 'font-weight:700;font-size:13px', card, `whole roll ${rollPts} + styling ${bs.pts}`);
    }
  }
  const b = el('button', GO, card, phase === 3 ? 'SHOOT ANOTHER SEASON' : 'NEXT JOB');
  b.onclick = () => {
    wake();
    if (phase === 3) { round = 0; seasonPts = 0; }
    else round++;
    if (round >= SEASON) { phase = 3; showSheet(null, 0); layout(); return; }
    newRound();
  };
}

// --- the camera -----------------------------------------------------------
// A TRIPOD, not an orbit. The orbit rig this started with always looked at
// the centre of the set, so swinging it barely moved the subject in frame -
// the balance probe priced composition at 1.12x, which is what "you cannot
// actually aim" looks like as a number. Now the lens has its own heading
// and the body has to be tracked across the set.
//
// Drag aims, the wheel zooms, and Q/E walk the tripod round the cove. Those
// are a photographer's three controls and they are the whole of the skill:
// hold the subject, fill the frame, wait for the moment.
const R = 4.6;
// It starts at its WIDEST. The probe found the old default already framing
// at 0.69 of a perfect shot, which left aiming almost nothing to earn - a
// camera handed to you already composed is a camera you need not use. A
// real one starts wide and you zoom to compose, and now so does this.
const cam = { a: Math.PI, p: -.02, fov: 1.15, ang: 0 };
const keys = {};
addEventListener('keydown', (e) => {
  wake();
  keys[e.code] = 1;
  if (e.code === 'Space' && phase === 1) { wantShot = 1; e.preventDefault(); }
});
addEventListener('keyup', (e) => { keys[e.code] = 0; });

let drag = null, dragDist = 0, wantShot = 0;
c.addEventListener('pointerdown', (e) => { wake(); drag = [e.clientX, e.clientY]; dragDist = 0; });
addEventListener('pointerup', () => {
  // A tap is a shutter and a drag is an aim, told apart by how far the
  // finger went. There is no second button to give the shutter on a phone,
  // and asking a player to reach for one while the pose they want is
  // happening is asking them to miss it.
  if (drag && dragDist < 7 && phase === 1) wantShot = 1;
  drag = null;
});
addEventListener('pointermove', (e) => {
  if (!drag) return;
  const dx = e.clientX - drag[0], dy = e.clientY - drag[1];
  dragDist += Math.abs(dx) + Math.abs(dy);
  // Scaled by the field of view, so a long lens aims slowly. Without this,
  // zooming in makes the camera unusably twitchy at exactly the moment
  // precision starts to matter.
  cam.a -= dx * .0022 * cam.fov;
  cam.p = Math.max(-.5, Math.min(.6, cam.p - dy * .0022 * cam.fov));
  drag = [e.clientX, e.clientY];
});
addEventListener('wheel', (e) => {
  cam.fov = Math.max(.34, Math.min(1.15, cam.fov + e.deltaY * .0012));
});

const q = new URLSearchParams(location.search);
if (q.has('pose')) { anim.mode = +q.get('pose'); }
if (q.has('cam')) { const p = q.get('cam').split(','); cam.ang = +p[0]; cam.p = +p[1]; cam.fov = +p[2]; }
if (q.has('deco')) {
  const d = q.get('deco').split(',').map(Number);
  ZONES.forEach((k, i) => { zone = i; apply(d[i]); });
  zone = 0;
  deco.glitter = d[5] || 0;
  sync();
}
// The pose harness freezes the actor, so a probe can hold one pose still.
const FROZEN = q.has('pose');
if (q.has('ui')) bar.style.display = 'none';

newRound();
sync();

let glitN = 0, vp = null, eye = null, flashT = 0;
let last = performance.now();
function frame(now) {
  const dt = Math.min(.05, (now - last) / 1000);
  last = now;
  anim.t += dt;
  anim.hold += dt;

  if (keys.ArrowLeft) cam.a += dt * cam.fov;
  if (keys.ArrowRight) cam.a -= dt * cam.fov;
  if (keys.ArrowUp) cam.p = Math.min(.6, cam.p + dt * cam.fov);
  if (keys.ArrowDown) cam.p = Math.max(-.5, cam.p - dt * cam.fov);
  if (keys.KeyQ) cam.ang += dt * .8;
  if (keys.KeyE) cam.ang -= dt * .8;
  if (keys.KeyW) cam.fov = Math.max(.34, cam.fov - dt * .6);
  if (keys.KeyS) cam.fov = Math.min(1.15, cam.fov + dt * .6);

  // The unicorn only performs while it is being photographed. On the bench
  // it stands and waits, so the player can actually see what they are
  // painting.
  if (phase === 1 && !FROZEN) { act(A, anim, dt); move(A, anim, P, dt); }
  if (awake()) music(phase === 1 ? .8 : .2, phase !== 1);

  // The lens is placed BEFORE anything reads it. It depends only on the
  // camera, never on the pose, and the gaze below needs it in the same
  // frame - computing it after the rig left the unicorn looking at a null.
  eye = [Math.sin(cam.ang) * R, 1.15, Math.cos(cam.ang) * R];
  const cp = Math.cos(cam.p);
  const at = [
    eye[0] + Math.sin(cam.a) * cp,
    eye[1] + Math.sin(cam.p),
    eye[2] + Math.cos(cam.a) * cp,
  ];

  // Where the lens actually IS, rather than where an orbit angle says it is
  // - the unicorn has to find a camera that can now stand anywhere.
  const toCam = Math.atan2(eye[0] - P.x, eye[2] - P.z);
  anim.lookYaw = Math.atan2(Math.sin(toCam - P.yaw), Math.cos(toCam - P.yaw));
  anim.lookPitch = Math.atan2(eye[1] - 1.3, Math.hypot(eye[0] - P.x, eye[2] - P.z));
  if (phase !== 1) anim.gaze += (1 - anim.gaze) * (1 - Math.exp(-dt / .4));

  applyPose(P, anim, dt);
  solve(P);
  updateMane(M, P.w, anim.t, dt);

  const [nc, nh] = maneVerts(M, eye);
  updateMesh(maneCore, MANE_CORE, nc);
  updateMesh(maneHalo, MANE_HALO, nh);
  const burst = anim.mode === SHAKE ? anim.hold : 0;
  glitN = glitterVerts(G, P.w, eye, deco.glitter, anim.t, burst);
  updateMesh(glitMesh, GLITTER_BUF, glitN);

  vp = mul(perspective(cam.fov, c.width / c.height, .1, 400), lookAt(eye, at));

  frameGL(vp, eye, FOG);
  mode(0);
  drawMesh(studio, IDENT);

  mode(2);
  setDim(.4);
  drawMesh(shadow, modelTR(P.x, .01, P.z, 0, 1.0));
  const SM = shadowMat(.012);
  mask(3);
  setDim(.5);
  setSdw(1);
  for (let i = 0; i < U.parts.length; i++) drawMesh(U.parts[i], mul(SM, P.w[i]));
  drawMesh(maneCore, SM);
  setSdw(0);
  setDim(1);
  mask(0);

  mode(0);
  for (let i = 0; i < U.parts.length; i++) drawMesh(U.parts[i], P.w[i]);
  drawMesh(maneCore, IDENT);
  mode(1);
  drawMesh(lights, IDENT);
  drawMesh(maneHalo, IDENT);
  drawMesh(glitMesh, IDENT);

  // The capture happens HERE, after the draw and before anything else can
  // clear the buffer - preserveDrawingBuffer keeps the frame only until the
  // next clear, and taking the picture from an input handler would grab
  // whatever was on screen a frame ago.
  if (wantShot) {
    wantShot = 0;
    takeShot();
  }
  if (flashT > 0) {
    flashT = Math.max(0, flashT - dt * 3.4);
    flash.style.opacity = flashT * .75;
  }

  if (DEV) {
    let lo = 9;
    for (const b of [5, 7, 9, 11]) {
      const m = P.w[b];
      lo = Math.min(lo, m[5] * -.255 + m[9] * .01 + m[13]);
    }
    const bm = P.w[0];
    const belly = bm[5] * -.20 + bm[9] * .30 + bm[13];
    window.SNAP = {
      pose: anim.mode, hoof: lo, belly, contact: Math.min(lo, belly), t: anim.t,
      deco, name: POSE_NAME[anim.mode], glit: glitN / 10,
      phase, film, round, best: best && best.total, seasonPts, lastJob,
      cam: [cam.a, cam.p, cam.fov, cam.ang], sub: [P.x, P.z],
    };
    window.SNAPSHOT = () => scoreShot(P, vp, eye, anim, deco);
    // The balance policies drive the game through these rather than through
    // synthetic input events: what is being measured is a way of PLAYING,
    // and routing it through keyboard timing would measure the harness.
    window.SNAPCAM = (a, p, f, ang) => { cam.a = a; cam.p = p; cam.fov = f; if (ang !== undefined) cam.ang = ang; };
    window.SNAPFIRE = () => { wantShot = 1; };
    window.SNAPPIX = (x, y, w, h) => {
      const px = new Uint8Array(w * h * 4);
      gl.readPixels(x, y, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      let r = 0, g2 = 0, b2 = 0;
      for (let i = 0; i < px.length; i += 4) { r += px[i]; g2 += px[i + 1]; b2 += px[i + 2]; }
      const n = px.length / 4;
      return [r / n, g2 / n, b2 / n];
    };
  }
  requestAnimationFrame(frame);
}

function takeShot() {
  if (phase !== 1 || film <= 0) return;
  film--;
  shutter();
  flashT = 1;
  const s = scoreShot(P, vp, eye, anim, deco);
  // Scaled by the frame like everything else: a badly composed photograph of
  // the pose they asked for is still a badly composed photograph, and paying
  // it in full would let a player ignore the lens and just wait.
  if (s.pose === brief.pose) {
    const bp = Math.round(POSE_BONUS * s.q);
    s.parts.push(['the pose they asked for', bp]);
    s.total += bp;
    onBrief++;
  }
  rollPts += s.total;
  // JPEG, not PNG: these are photographs, six of them are held in memory at
  // once, and a full-window PNG data URL is megabytes of string.
  s.img = c.toDataURL('image/jpeg', .82);
  if (!best || s.total > best.total) best = s;
  layout();
  if (film <= 0) setTimeout(endRound, 700);
}

requestAnimationFrame(frame);

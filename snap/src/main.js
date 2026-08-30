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
import { scoreShot, frameBox, frameQuality, eyeContact, POSE_WORTH } from './score.js';
import { makeBrief, briefText, briefStyle, warmMatch, GLIT_WORD, POSE_BONUS } from './brief.js';
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

const top = el('div', 'position:fixed;left:0;right:0;top:0;padding:11px 14px 16px;pointer-events:none;text-align:center;'
  + 'font:600 14px system-ui,sans-serif;color:#fff3d6;text-shadow:0 2px 8px #000a;'
  + 'background:linear-gradient(#00000070,#00000000)');
const bar = el('div', 'position:fixed;left:0;right:0;bottom:0;display:flex;flex-direction:column;align-items:center;gap:7px;padding:10px 8px 14px;touch-action:none');
const rowZ = el('div', 'display:flex;gap:6px;flex-wrap:wrap;justify-content:center', bar);
const rowC = el('div', 'display:flex;gap:6px;flex-wrap:wrap;justify-content:center', bar);
const rowG = el('div', 'display:flex;gap:8px;align-items:center;justify-content:center', bar);
const flash = el('div', 'position:fixed;inset:0;background:#fff;opacity:0;pointer-events:none');
// Taught in the order the controls are needed, one at a time, low on the
// screen where a viewfinder overlay belongs.
const hint = el('div', 'position:fixed;left:0;right:0;bottom:142px;text-align:center;pointer-events:none;transition:opacity .3s;font:600 14px system-ui,sans-serif;color:#fff3d6;text-shadow:0 2px 10px #000a');

// --- the viewfinder -------------------------------------------------------
// The score used to arrive six frames late, on a card, after every decision
// had been made. A photographer sees the picture BEFORE the shutter, so the
// two things the score is actually made of are on screen while you aim.
const vf = el('div', 'position:fixed;inset:0;display:none;pointer-events:none');
// Thirds guides, drawn with gradients rather than four elements. They are
// the cheapest possible tutorial for the one composition rule the score
// rewards: you can see where the subject has to sit.
el('div', 'position:absolute;inset:0;opacity:.22;background:'
  + 'linear-gradient(90deg,#0000 33.2%,#fff 33.2%,#fff 33.5%,#0000 33.5%,#0000 66.4%,#fff 66.4%,#fff 66.7%,#0000 66.7%),'
  + 'linear-gradient(#0000 33.2%,#fff 33.2%,#fff 33.5%,#0000 33.5%,#0000 66.4%,#fff 66.4%,#fff 66.7%,#0000 66.7%)', vf);
const meters = el('div', 'position:fixed;left:50%;transform:translateX(-50%);bottom:104px;display:flex;gap:14px;pointer-events:none', vf);
const METER = 'font:700 10px system-ui,sans-serif;letter-spacing:.09em;color:#fff3d6;text-shadow:0 2px 8px #000a;text-align:center';
function gauge(label) {
  const w = el('div', METER, meters, '');
  el('div', '', w, label);
  const track = el('div', 'width:96px;height:7px;border-radius:4px;background:#0006;margin-top:4px;overflow:hidden', w);
  const fill = el('div', 'height:100%;width:0;border-radius:4px;background:#ffd977;transition:width .12s linear', track);
  return fill;
}
const gFrame = gauge('FRAME');
const gMoment = gauge('MOMENT');
const onbrief = el('div', 'position:fixed;left:0;right:0;bottom:174px;text-align:center;pointer-events:none;opacity:0;transition:opacity .18s;font:800 15px system-ui,sans-serif;letter-spacing:.08em;color:#ffe9a8;text-shadow:0 2px 12px #000c', vf, 'THE POSE THEY ASKED FOR');
const sheet = el('div', 'position:fixed;inset:0;display:none;flex-direction:column;align-items:center;justify-content:center;gap:12px;background:#00000055;backdrop-filter:blur(3px);padding:16px');
// The title sits over a LIVE set rather than a still: the unicorn is already
// working and the camera is already following it, so the first thing anyone
// sees is the thing the game is about. A menu over a frozen frame would be
// advertising a different game.
const title = el('div', 'position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:10px;padding:0 16px 8vh;text-align:center;background:linear-gradient(#00000059,#00000000 34%,#00000012 50%,#000000a6)');

const CHIP = 'font:600 12px system-ui,sans-serif;padding:3px 9px;border-radius:999px;background:#0000005e;color:#fff3d6';
// Each requirement is its own chip and ticks when it is met, so the brief
// is a checklist you can glance at rather than a sentence you re-read.
let poseChip = null;
function briefChips(row) {
  const w = warmMatch(brief, deco);
  el('div', CHIP, row, (brief.warm > 0 ? 'warm' : 'cool') + (w > .25 ? ' OK' : ''));
  el('div', CHIP, row, GLIT_WORD[brief.glit] + (deco.glitter === brief.glit ? ' OK' : ''));
  poseChip = el('div', CHIP, row, POSE_NAME[brief.pose]);
}

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
el('div', 'font:800 min(13vw,54px)/1 system-ui,sans-serif;color:#fff6dd;letter-spacing:.02em;text-shadow:0 3px 14px #0007', title, 'UNICORN SNAP');
el('div', 'font:600 15px system-ui,sans-serif;color:#ffeec4;text-shadow:0 2px 8px #0008;margin-top:6px', title, 'It knows how good it looks. Prove it.');
el('div', 'font:500 13px/1.7 system-ui,sans-serif;color:#f0dcae;text-shadow:0 2px 8px #0008;max-width:34em', title,
  'Style the unicorn for the job, then shoot it. Drag or pinch to aim and zoom - wheel or W/S on a desktop, Q/E to walk round the set. Tap, SPACE or the shutter takes the picture. On a phone, MOTION aims by moving the phone itself.');
const startBtn = el('button', GO + ';margin-top:10px;font-size:17px', title, 'OPEN THE STUDIO');

// A real button for the shutter. Tap-anywhere works on a phone, but on a
// trackpad a tap is indistinguishable from the start of a drag until the
// finger has already moved - so the one control the game is built around
// was the one control a trackpad could not reliably use.
const shutBtn = el('button', 'position:fixed;left:50%;transform:translateX(-50%);bottom:18px;width:72px;height:72px;border-radius:50%;border:4px solid #fff3d6cc;background:#ffffff26;cursor:pointer;display:none;font:800 11px system-ui,sans-serif;letter-spacing:.08em;color:#fff3d6;text-shadow:0 2px 8px #000a', null, 'SHOOT');
shutBtn.onclick = () => { wake(); if (phase === 1) wantShot = 1; };
startBtn.onclick = () => { wake(); phase = 0; benchCam(); layout(); };

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
let rollPts = 0, onBrief = 0, roll = [];
let bestEver = 0;
try { bestEver = +localStorage.usBest || 0; } catch (e) { /* no store, no problem */ }

// The bench wants a good look at the unicorn, because the player is
// painting it. The shoot hands over a WIDE lens instead: the attract mode
// leaves the title's camera perfectly composed on the subject, and carrying
// that into the job gave a player who never touched the controls a framing
// of 0.96 - the balance probe read the whole game back at 0.90x, worse than
// not playing. A shoot starts with an unzoomed camera, like every camera.
const benchCam = () => { if (!FROZEN) { cam.a = Math.PI; cam.p = -.10; cam.fov = .62; cam.ang = 0; } };
const wideCam = () => { if (!FROZEN) { cam.a = Math.PI; cam.p = -.02; cam.fov = 1.15; cam.ang = 0; } };

function newRound() {
  brief = makeBrief(round);
  best = null;
  rollPts = 0;
  onBrief = 0;
  roll = [];
  film = FILM;
  phase = 0;
  anim.mode = IDLE;
  P.x = P.z = P.yaw = 0;
  benchCam();
  layout();
}

function startShoot() {
  phase = 1;
  A.hold = 99;                 // get it working immediately, not after a beat
  wideCam();
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
  title.style.display = phase < 0 ? 'flex' : 'none';
  bar.style.display = phase === 0 ? 'flex' : 'none';
  sheet.style.display = phase >= 2 ? 'flex' : 'none';
  // The job, always legible, never a sentence to re-read mid-shoot: the
  // title, the three things it wants, and how much film is left.
  top.textContent = '';
  if (phase >= 0) {
    const row = el('div', 'display:flex;gap:8px;flex-wrap:wrap;justify-content:center;align-items:center', top);
    el('div', 'font:800 14px system-ui,sans-serif;letter-spacing:.06em', row, brief.title);
    briefChips(row);
    if (phase === 1) el('div', CHIP + ';font-weight:800', row, `FILM ${film}`);
  }
  vf.style.display = phase === 1 ? 'block' : 'none';
  shutBtn.style.display = phase === 1 ? 'block' : 'none';
  gyroBtn.style.display = phase === 1 && canGyro ? 'block' : 'none';
  const c2 = phase === 1 ? coach() : '';
  hint.textContent = c2;
  hint.style.opacity = c2 ? '1' : '0';
}

function showSheet(bs, total) {
  sheet.textContent = '';
  // Scrollable, and capped to the viewport. The contact sheet made this card
// taller than a phone screen, which pushed the only button off the bottom -
// a result screen you cannot leave is a soft lock, and it looks exactly
// like a working result screen until you try.
const card = el('div', 'background:#f5e6bd;border-radius:14px;padding:16px 18px;max-width:min(92vw,460px);max-height:88vh;overflow-y:auto;display:flex;flex-direction:column;align-items:center;gap:9px;' + TXT, sheet);
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
      const im = el('img', 'width:min(62vw,290px);border-radius:8px;display:block', card);
      im.src = best.img;
      const list = el('div', 'font-weight:500;font-size:13px;line-height:1.6', card);
      for (const [n, p] of best.parts.concat(bs.lines)) {
        el('div', '', list, `${n} +${p}`);
      }
      el('div', 'font-weight:700;font-size:13px', card, `whole roll ${rollPts} + styling ${bs.pts}`);
      // The contact sheet. Every frame counts toward the job, so every frame
      // has to be visible - a result that shows only the keeper hides the
      // five decisions that actually moved the number, and a player cannot
      // learn from a frame they never see.
      const cs = el('div', 'display:flex;gap:5px;flex-wrap:wrap;justify-content:center;margin-top:2px', card);
      for (const f of roll) {
        const t = el('div', 'position:relative;width:62px', cs);
        const ti = el('img', `width:62px;display:block;border-radius:4px;outline:${f === best ? '2px solid #a05a10' : '1px solid #0002'}`, t);
        ti.src = f.img;
        el('div', 'font:600 11px system-ui,sans-serif;color:#6b5320', t, String(f.total));
      }
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

// --- aiming with the phone itself -----------------------------------------
// Not WebXR. immersive-ar needs ARCore, so it is Android-only - iOS Safari
// has no WebXR at all - and the DOM HUD would need the dom-overlay feature,
// which narrows it further. An AR session would also put the unicorn in your
// living room, which is the opposite of the one thing this game is about
// standing in: a lit studio cove.
//
// DeviceOrientation gives the part that was actually asked for - turn the
// phone, turn the lens - on both platforms, for a few hundred bytes.
//
// Everything is RELATIVE to the pose it was switched on in, rather than to
// absolute compass north. Absolute headings need a calibrated magnetometer,
// drift indoors, and would point the player at a corner of the cove they
// never chose; a relative frame means "wherever you are pointing now is
// where you were pointing", and switching it off and on again is a recentre.
let gyroBase = null, gyroPrev = 0;
const canGyro = typeof DeviceOrientationEvent !== 'undefined' && matchMedia('(pointer:coarse)').matches;

function onOrient(e) {
  if (e.alpha == null || !gyroBtn.dataset.on) return;
  const rot = (screen.orientation || {}).angle || 0;
  const a = e.alpha * Math.PI / 180;
  // Pitch rides a different axis depending on how the phone is held: beta is
  // the front-to-back tilt upright, and gamma is that same movement once the
  // device is turned on its side.
  const p = (rot === 90 ? -e.gamma : rot === 270 ? e.gamma : e.beta - 90) * Math.PI / 180;
  if (!gyroBase) { gyroBase = { p, cp: cam.p }; gyroPrev = a; return; }
  // Yaw ACCUMULATES the wrapped step between consecutive readings instead of
  // measuring from a fixed origin. Alpha wraps at north, and a heading held
  // against one base flips the long way round as soon as the player turns
  // more than half a circle from where they started - measured at a 350
  // degree swing for a 10 degree movement across north.
  const d = ((a - gyroPrev + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  gyroPrev = a;
  cam.a += d;
  // Pitch stays absolute against its base: beta does not wrap for a phone
  // anyone is holding, and accumulating it would drift against the clamp.
  cam.p = Math.max(-.5, Math.min(.6, gyroBase.cp + (p - gyroBase.p)));
  learnt.aim = 1;
}

const gyroBtn = el('button', 'position:fixed;right:14px;bottom:34px;padding:9px 13px;border:0;border-radius:10px;cursor:pointer;display:none;font:700 12px system-ui,sans-serif;letter-spacing:.06em;background:#0000005e;color:#fff3d6', null, 'MOTION');
gyroBtn.onclick = async () => {
  wake();
  if (gyroBtn.dataset.on) {
    delete gyroBtn.dataset.on;
    gyroBase = null;
    gyroBtn.style.background = '#0000005e';
    return;
  }
  // iOS 13 and later will not deliver a single event until this is granted,
  // and it must be asked for from inside a real gesture - which is the whole
  // reason this is a button rather than something the game turns on itself.
  const R = DeviceOrientationEvent.requestPermission;
  if (R) { try { if (await R() !== 'granted') return; } catch (err) { return; } }
  gyroBtn.dataset.on = '1';
  gyroBase = null;
  gyroBtn.style.background = '#c07a12';
};
if (canGyro) addEventListener('deviceorientation', onOrient);

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

// Every live pointer is tracked, because pinch rests on knowing whether two
// fingers are down at once. One finger aims; two zoom by the change in the
// distance between them, which is the gesture every camera app on a phone
// already taught the player.
const pts = new Map();
let dragDist = 0, wantShot = 0, pinch = 0;
const spread = () => {
  const [a, b] = [...pts.values()];
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
};
c.addEventListener('pointerdown', (e) => {
  wake();
  pts.set(e.pointerId, [e.clientX, e.clientY]);
  if (pts.size === 1) dragDist = 0;
  if (pts.size === 2) pinch = spread();
});
const drop = (e) => {
  // A tap is a shutter and a drag is an aim, told apart by how far the
  // finger went - and a pinch is neither, so releasing one of two fingers
  // must never fire the shutter.
  if (pts.size === 1 && dragDist < 7 && !pinch && phase === 1) wantShot = 1;
  pts.delete(e.pointerId);
  if (pts.size < 2) pinch = 0;
};
addEventListener('pointerup', drop);
addEventListener('pointercancel', drop);
addEventListener('pointermove', (e) => {
  if (!pts.has(e.pointerId)) return;
  const prev = pts.get(e.pointerId);
  const dx = e.clientX - prev[0], dy = e.clientY - prev[1];
  pts.set(e.pointerId, [e.clientX, e.clientY]);
  if (pts.size === 2) {
    const d = spread();
    if (pinch && d > 8) {
      cam.fov = Math.max(.34, Math.min(1.15, cam.fov * (pinch / d)));
      learnt.zoom = cam.fov < 1 ? 1 : learnt.zoom;
    }
    pinch = d;
    return;
  }
  dragDist += Math.abs(dx) + Math.abs(dy);
  if (dragDist > 24) learnt.aim = 1;
  // While the phone is aiming, a drag would be two hands on one wheel.
  if (gyroBtn.dataset.on) return;
  // Scaled by the field of view, so a long lens aims slowly. Without this,
  // zooming in makes the camera unusably twitchy at exactly the moment
  // precision starts to matter.
  cam.a -= dx * .0022 * cam.fov;
  cam.p = Math.max(-.5, Math.min(.6, cam.p - dy * .0022 * cam.fov));
});
addEventListener('wheel', (e) => {
  cam.fov = Math.max(.34, Math.min(1.15, cam.fov + e.deltaY * .0012));
  if (cam.fov < 1) learnt.zoom = 1;
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
// The title is where a page load lands. newRound builds the first job
// underneath it, so opening the studio is instant rather than a second
// wait.
phase = -1;
layout();
sync();

let glitN = 0, vp = null, eye = null, flashT = 0;
// What the player has actually done, so the coaching can stop the moment
// each control has been used. A hint that stays up after you have obeyed it
// is noise, and noise is how players learn to ignore the next hint.
const learnt = { aim: 0, zoom: 0, shot: 0 };
const coach = () => (!learnt.aim ? 'drag to aim the camera'
  : !learnt.zoom ? 'wheel or W/S to zoom in - fill the frame'
  : !learnt.shot ? 'tap or SPACE to take the picture'
  : '');
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
  if (keys.KeyW) { cam.fov = Math.max(.34, cam.fov - dt * .6); if (cam.fov < 1) learnt.zoom = 1; }
  if (keys.KeyS) cam.fov = Math.min(1.15, cam.fov + dt * .6);

  // The unicorn only performs while it is being photographed - or on the
  // title, which is an attract mode and wants exactly that. On the bench it
  // stands and waits, so the player can see what they are painting.
  if ((phase === 1 || phase < 0) && !FROZEN) { act(A, anim, dt); move(A, anim, P, dt); }

  // The title's camera works the subject by itself: it drifts round the
  // cove and keeps the lens on the unicorn, which is the shot the player is
  // about to be asked to take.
  // Not while a probe is holding the scene still: FROZEN means a fixed
  // camera was asked for, and an attract mode that keeps driving would
  // quietly overwrite it - which is how a styling probe ended up sampling
  // the backdrop instead of the coat.
  if (phase < 0 && !FROZEN) {
    cam.ang += dt * .11;
    const ex = Math.sin(cam.ang) * R, ez = Math.cos(cam.ang) * R;
    const want = Math.atan2(P.x - ex, P.z - ez);
    cam.a += ((want - cam.a + Math.PI * 3) % (Math.PI * 2) - Math.PI) * Math.min(1, dt * 2.2);
    cam.fov += (.62 - cam.fov) * Math.min(1, dt * 1.4);
    // Aimed BELOW the subject on purpose. A camera pointed at what it is
    // photographing centres it by definition, and the centre of this frame
    // is the words - the first cut put the title straight across the
    // unicorn's chest. Dropping the lens lifts the animal into the top of
    // the frame and leaves the band underneath clear.
    cam.p += (-.23 - cam.p) * Math.min(1, dt * 1.4);
  }
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
  if (phase === 1) {
    const h = coach();
    if (hint.textContent !== h) { hint.textContent = h; hint.style.opacity = h ? '1' : '0'; }
    // The two gauges are the two skills, shown separately on purpose: a
    // single "shot quality" number would tell a player they are doing badly
    // without telling them which half to fix.
    const q = frameQuality(frameBox(P, vp));
    const e = eyeContact(P, eye);
    const mom = Math.min(1, ((POSE_WORTH[anim.mode] || 40) / 320) + Math.max(0, e - .55) * .5);
    gFrame.style.width = (q * 100).toFixed(0) + '%';
    gMoment.style.width = (mom * 100).toFixed(0) + '%';
    // Green only when BOTH are there, because that is the only combination
    // the score actually pays for.
    const good = q > .7 && mom > .55;
    gFrame.style.background = q > .7 ? '#9fe08a' : '#ffd977';
    gMoment.style.background = mom > .55 ? '#9fe08a' : '#ffd977';
    const ob = anim.mode === brief.pose;
    onbrief.style.opacity = ob ? '1' : '0';
    if (poseChip) poseChip.style.background = ob ? '#c07a12' : '#0000005e';
    shutBtn.style.borderColor = good ? '#9fe08add' : '#fff3d6cc';
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
  learnt.shot = 1;
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
  roll.push(s);
  if (!best || s.total > best.total) best = s;
  layout();
  if (film <= 0) setTimeout(endRound, 700);
}

requestAnimationFrame(frame);

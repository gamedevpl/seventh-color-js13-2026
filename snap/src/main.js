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
import { makeActor, act, move, poke, temper } from './act.js';
import { scoreShot, verdict, frameBox, frameQuality, eyeContact, POSE_WORTH } from './score.js';
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
const TOUCH = matchMedia('(pointer:coarse)').matches;
const el = (tag, css, parent, text) => {
  const e = document.createElement(tag);
  e.style.cssText = css;
  if (text) e.textContent = text;
  (parent || document.body).appendChild(e);
  return e;
};
// 44 CSS PIXELS. Apple's own figure, and the reason every control here
// carries a min-height rather than only padding: at 13px with 7px of
// padding these were 30 pixels tall, which reads as "designed on a laptop"
// the moment a child tries to hit one. Nothing on this page is smaller than
// a fingertip any more.
const TAP = 'min-height:44px;touch-action:manipulation;';
const BTN = TAP + 'font:600 15px system-ui,sans-serif;padding:10px 15px;border:0;border-radius:10px;cursor:pointer;color:#3a2a12;background:#00000018';
const GO = BTN + ';background:#3a2a12;color:#f2d98a;padding:13px 24px;font-size:17px';
const TXT = 'font:600 14px system-ui,sans-serif;color:#3a2a12;text-align:center;line-height:1.5';

const top = el('div', 'position:fixed;left:0;right:0;top:0;padding:11px 14px 16px;pointer-events:none;text-align:center;'
  + 'font:600 14px system-ui,sans-serif;color:#fff3d6;text-shadow:0 2px 8px #000a;'
  + 'background:linear-gradient(#00000070,#00000000)');
const bar = el('div', 'position:fixed;left:0;right:0;bottom:0;display:flex;flex-direction:column;align-items:center;gap:8px;padding:10px 8px calc(14px + env(safe-area-inset-bottom));touch-action:none');
const rowZ = el('div', 'display:flex;gap:7px;flex-wrap:wrap;justify-content:center', bar);
const rowC = el('div', 'display:flex;gap:7px;flex-wrap:wrap;justify-content:center', bar);
const rowG = el('div', 'display:flex;gap:8px;align-items:center;justify-content:center', bar);
// Behaviour you cannot see is depth nobody plays with. The bench states, in
// the player's words, what this look will make the unicorn do - which is the
// only reason choosing a colour is a decision rather than a preference.
const tell = el('div', 'font:600 12px system-ui,sans-serif;color:#3a2a12;opacity:.75;text-align:center;max-width:32em', bar);
const flash = el('div', 'position:fixed;inset:0;background:#fff;opacity:0;pointer-events:none');
// Taught in the order the controls are needed, one at a time, low on the
// screen where a viewfinder overlay belongs.
const hint = el('div', 'position:fixed;left:0;right:0;bottom:158px;text-align:center;pointer-events:none;transition:opacity .3s;font:600 14px system-ui,sans-serif;color:#fff3d6;text-shadow:0 2px 10px #000a');

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
const meters = el('div', 'position:fixed;left:50%;transform:translateX(-50%);bottom:120px;display:flex;gap:14px;pointer-events:none', vf);
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
const onbrief = el('div', 'position:fixed;left:0;right:0;bottom:190px;text-align:center;pointer-events:none;opacity:0;transition:opacity .18s;font:800 15px system-ui,sans-serif;letter-spacing:.08em;color:#ffe9a8;text-shadow:0 2px 12px #000c', vf, 'THE POSE THEY ASKED FOR');
const sheet = el('div', 'position:fixed;inset:0;display:none;flex-direction:column;align-items:center;justify-content:center;gap:12px;background:#00000055;backdrop-filter:blur(3px);padding:16px');
// The title sits over a LIVE set rather than a still: the unicorn is already
// working and the camera is already following it, so the first thing anyone
// sees is the thing the game is about. A menu over a frozen frame would be
// advertising a different game.
const title = el('div', 'position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:10px;padding:0 16px 8vh;text-align:center;background:linear-gradient(#00000059,#00000000 34%,#00000012 50%,#000000a6)');

const CHIP = 'font:600 13px system-ui,sans-serif;padding:5px 11px;border-radius:999px;background:#0000005e;color:#fff3d6';
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
  b.style.width = b.style.height = '44px';
  b.style.padding = '0';
  b.dataset.i = i;
  b.onclick = () => { wake(); apply(i); sparkle(3); };
  return b;
});
el('div', 'font:800 min(13vw,54px)/1 system-ui,sans-serif;color:#fff6dd;letter-spacing:.02em;text-shadow:0 3px 14px #0007', title, 'UNICORN SNAP');
el('div', 'font:600 15px system-ui,sans-serif;color:#ffeec4;text-shadow:0 2px 8px #0008;margin-top:6px', title, 'It knows how good it looks. Prove it.');
el('div', 'font:500 13px/1.7 system-ui,sans-serif;color:#f0dcae;text-shadow:0 2px 8px #0008;max-width:34em', title,
  'Style the unicorn for the job, then shoot it. Drag or pinch to aim and zoom - wheel or W/S on a desktop, Q/E to walk round the set. Tap, SPACE or the shutter takes the picture.');
const startBtn = el('button', GO + ';margin-top:10px;font-size:18px', title, 'OPEN THE STUDIO');

// A real button for the shutter. Tap-anywhere works on a phone, but on a
// trackpad a tap is indistinguishable from the start of a drag until the
// finger has already moved - so the one control the game is built around
// was the one control a trackpad could not reliably use.
const shutBtn = el('button', 'position:fixed;left:50%;transform:translateX(-50%);bottom:calc(22px + env(safe-area-inset-bottom));width:84px;height:84px;border-radius:50%;touch-action:manipulation;border:4px solid #fff3d6cc;background:#ffffff26;cursor:pointer;display:none;font:800 11px system-ui,sans-serif;letter-spacing:.08em;color:#fff3d6;text-shadow:0 2px 8px #000a', null, 'SHOOT');
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
  const t = temper(deco);
  const does = [];
  if (t.warm > .25) does.push('struts and rears');
  if (t.cool > .25) does.push('settles, and watches you');
  if (t.glit > .3) does.push('shakes the glitter out');
  tell.textContent = does.length
    ? 'this look makes it ' + does.join(' - ')
    : 'a plain look - it will mostly just stand about';
}

// --- the game -------------------------------------------------------------
let phase = 0;                 // 0 style, 1 shoot, 2 result, 3 season over
let round = 0, film = FILM, seasonPts = 0, best = null, brief = null, lastJob = 0, used = [];
let rollPts = 0, onBrief = 0, roll = [];
let bestEver = 0;
try { bestEver = +localStorage.usBest || 0; } catch (e) { /* no store, no problem */ }

// The bench wants a good look at the unicorn, because the player is
// painting it. The shoot hands over a WIDE lens instead: the attract mode
// leaves the title's camera perfectly composed on the subject, and carrying
// that into the job gave a player who never touched the controls a framing
// of 0.96 - the balance probe read the whole game back at 0.90x, worse than
// not playing. A shoot starts with an unzoomed camera, like every camera.
// The bench camera drifts round the unicorn until the player takes hold of
// it. A styling screen showing a statue facing front is a screen that hides
// half of what you just painted - the tail above all, which is the part a
// child paints first and then wants to see.
let spin = 1;
const benchCam = () => { spin = 1; if (!FROZEN) { cam.a = Math.PI; cam.p = -.10; cam.fov = .62; cam.ang = 0; } };
const wideCam = () => { if (!FROZEN) { cam.a = Math.PI; cam.p = -.02; cam.fov = 1.15; cam.ang = 0; } };

function newRound() {
  brief = makeBrief(round, used);
  used.push(brief.title);
  best = null;
  rollPts = 0;
  onBrief = 0;
  roll = [];
  film = FILM;
  phase = 0;
  anim.mode = IDLE;
  A.spark = 0;
  A.bored = 0;
  P.x = P.z = P.yaw = 0;
  benchCam();
  layout();
}

function startShoot() {
  phase = 1;
  A.hold = 99;                 // get it working immediately, not after a beat
  // The bench got a living unicorn in R11, and with it the boredom clock
  // started running while the player painted. A child spends a minute on
  // the colours; boredom climbs at dt/55, so the shoot would open on an
  // animal that was already yawning and about to lie down. The clock is
  // for the SHOOT - it measures a photographer who has stopped working,
  // not one who has not started.
  A.bored = 0;
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
  const b = briefStyle(brief, deco, rollPts);
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
const card = el('div', 'background:#f5e6bd;border-radius:14px;padding:16px 18px;max-width:min(92vw,460px);max-height:86vh;overflow-y:auto;touch-action:pan-y;width:min(92vw,400px);display:flex;flex-direction:column;align-items:center;gap:9px;' + TXT, sheet);
  if (phase === 3) {
    el('div', 'font-size:22px;font-weight:800', card, 'THAT IS A WRAP');
    el('div', '', card, `Season total ${seasonPts}`);
    if (seasonPts > bestEver) {
      bestEver = seasonPts;
      try { localStorage.usBest = bestEver; } catch (e) { /* no store, no problem */ }
      el('div', 'color:#a05a10;font-weight:800', card, 'A NEW PERSONAL BEST');
    } else el('div', '', card, `Best season ${bestEver}`);
  } else {
    // A GALLERY, NOT A LEDGER. This screen used to list every term that
    // contributed to every frame, and it read as an invoice - the numbers
    // were all true and none of them told a player whether the picture was
    // any good. Six photographs, a thumb on each, and one sentence about
    // whichever one you are looking at.
    el('div', 'font-size:15px;font-weight:700;opacity:.75', card,
      best ? `${total} points${bs.pts ? ` - brief +${bs.pts}` : ''}` : 'No usable frames');
    if (best) {
      const im = el('img', 'width:100%;max-width:340px;border-radius:10px;display:block', card);
      const say = el('div', 'font:700 17px system-ui,sans-serif;line-height:1.3', card, '');
      // THUMBNAILS BIG ENOUGH TO READ. At 62 pixels these were six brown
      // stamps on a phone - reported as barely visible, and fairly: the
      // subject inside one is a tenth of its width. Three to a row, sized
      // off the card rather than off a number, they are large enough to
      // tell one photograph from another, which is the entire job of a
      // contact sheet.
      const cs = el('div', 'display:grid;grid-template-columns:repeat(3,1fr);gap:7px;width:100%;max-width:340px', card);
      const thumbs = [];
      const show = (f) => {
        const [up, why] = verdict(f);
        im.src = f.img;
        say.textContent = (up ? '\u{1F44D} ' : '\u{1F44E} ') + why;
        thumbs.forEach((t, i) => { t.style.outline = roll[i] === f ? '3px solid #a05a10' : '1px solid #0003'; });
      };
      roll.forEach((f) => {
        const t = el('div', 'position:relative;cursor:pointer;touch-action:manipulation', cs);
        const ti = el('img', 'width:100%;display:block;border-radius:6px;outline:1px solid #0003', t);
        ti.src = f.img;
        el('div', 'position:absolute;right:3px;bottom:3px;font-size:17px;line-height:1;'
          + 'background:#000000a6;border-radius:6px;padding:2px 3px', t,
          verdict(f)[0] ? '\u{1F44D}' : '\u{1F44E}');
        t.onclick = () => { wake(); show(f); };
        thumbs.push(ti);
      });
      // Open on the best KEEPER, not the best score. The highest-scoring
      // frame of a bad roll is still a bad photograph, and a gallery that
      // greets you with a thumbs-down on the frame it calls your best is
      // just confusing.
      let op = 0;
      for (const f of roll) if (verdict(f)[0] && (!op || f.total > op.total)) op = f;
      show(op || best);
    }
  }
  const b = el('button', GO, card, phase === 3 ? 'SHOOT ANOTHER SEASON' : 'NEXT JOB');
  b.onclick = () => {
    wake();
    if (phase === 3) { round = 0; seasonPts = 0; used = []; }
    else round++;
    if (round >= SEASON) { phase = 3; showSheet(null, 0); layout(); return; }
    newRound();
  };
}

// --- walking round the unicorn with the phone -----------------------------
// NO ACCELEROMETER. There was one: turning the phone walked the tripod
// round the set, and it demoed beautifully. Played with a nine-year-old it
// was unusable - the yaw wanders, the permission prompt is a coin flip
// inside an in-app browser, and every drag fought the sensor for control of
// the same camera. A control that is delightful one time in three is worse
// than one that is not there, so it is not there.

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
let wantShot = 0, pinch = 0, multi = 0;
const spread = () => {
  const [a, b] = [...pts.values()];
  return Math.hypot(a.x - b.x, a.y - b.y);
};
c.addEventListener('pointerdown', (e) => {
  wake();
  pts.set(e.pointerId, { x: e.clientX, y: e.clientY, d: 0, t: performance.now() });
  spin = 0;                    // the player took the bench camera off me
  if (pts.size === 2) { pinch = spread(); multi = 1; }
});
// A TAP IS A SHUTTER AND EVERYTHING ELSE IS NOT, and the first cut of this
// got it wrong in a way that ruined framing on a phone: it asked whether
// ONE finger was down and whether a shared drag counter was small. Lift one
// finger out of a pinch and the counter was untouched, `pinch` had already
// been cleared, and the second lift fired the shutter - so composing a shot
// spent film by itself. Every test here is now about THIS pointer: how far
// it personally travelled, how long it was down, and whether a second
// finger joined at any point before the hand left the glass.
const drop = (e) => {
  const p = pts.get(e.pointerId);
  pts.delete(e.pointerId);
  if (!pts.size) { pinch = 0; multi = 0; }
  if (p && !multi && p.d < 12 && performance.now() - p.t < 400 && phase === 1) wantShot = 1;
};
addEventListener('pointerup', drop);
addEventListener('pointercancel', drop);
addEventListener('pointermove', (e) => {
  const p = pts.get(e.pointerId);
  if (!p) return;
  const dx = e.clientX - p.x, dy = e.clientY - p.y;
  p.x = e.clientX; p.y = e.clientY;
  p.d += Math.abs(dx) + Math.abs(dy);
  if (pts.size === 2) {
    const d = spread();
    if (pinch && d > 8) {
      cam.fov = Math.max(.34, Math.min(1.15, cam.fov * (pinch / d)));
      learnt.zoom = cam.fov < 1 ? 1 : learnt.zoom;
    }
    pinch = d;
    return;
  }
  if (p.d > 24) learnt.aim = 1;
  // Scaled by the field of view, so a long lens aims slowly. Without this,
  // zooming in makes the camera unusably twitchy at exactly the moment
  // precision starts to matter.
  cam.a -= dx * .0022 * cam.fov;
  cam.p = Math.max(-.5, Math.min(.6, cam.p - dy * .0022 * cam.fov));
});
// iOS pinch-zooms the PAGE unless the page says otherwise, and a zoomed
// page is a game with its controls off the bottom of the screen. The
// viewport meta stops the double-tap; these stop the pinch.
for (const g of ['gesturestart', 'gesturechange', 'dblclick']) addEventListener(g, (e) => e.preventDefault());

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
// Named for the hardware in the player's hands. Telling someone on a phone
// to use a mouse wheel is worse than saying nothing: it teaches them the
// hint is not about them.
const coach = () => (!learnt.aim ? 'drag to aim the camera'
  // Points at the GAUGE, not at a direction. "Zoom in to fill the frame" is
  // advice that stops being true halfway: measured on a phone, zooming to
  // the stop puts the subject 94% outside the frame and the score at zero.
  // The gauge already knows where the sweet spot is; the hint's job is to
  // send the player there rather than to imply that more is always better.
  : !learnt.zoom ? (TOUCH ? 'pinch to zoom until FRAME turns green' : 'wheel or W/S to zoom until FRAME turns green')
  : !learnt.shot ? (TOUCH ? 'tap or the shutter takes the picture' : 'tap or SPACE to take the picture')
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

  // It performs on the bench as well now. It used to stand square to the
  // camera and wait, which was defended as "so the player can see what they
  // are painting" and was reported straight back as the unicorn standing
  // like a post - you never saw the tail, and a horse that ignores you
  // while you dress it is not the character this game is about.
  if (phase < 2 && !FROZEN) { act(A, anim, dt, deco); move(A, anim, P, dt); }

  // The title's camera works the subject by itself: it drifts round the
  // cove and keeps the lens on the unicorn, which is the shot the player is
  // about to be asked to take.
  // Not while a probe is holding the scene still: FROZEN means a fixed
  // camera was asked for, and an attract mode that keeps driving would
  // quietly overwrite it - which is how a styling probe ended up sampling
  // the backdrop instead of the coat.
  if ((phase < 0 || (phase === 0 && spin)) && !FROZEN) {
    cam.ang += dt * (phase < 0 ? .11 : .3);
    const ex = Math.sin(cam.ang) * R, ez = Math.cos(cam.ang) * R;
    const want = Math.atan2(P.x - ex, P.z - ez);
    cam.a += ((want - cam.a + Math.PI * 3) % (Math.PI * 2) - Math.PI) * Math.min(1, dt * 2.2);
    cam.fov += (.62 - cam.fov) * Math.min(1, dt * 1.4);
    // The title aims BELOW the subject on purpose: a camera pointed at what
    // it photographs centres it by definition, and the centre of that frame
    // is the words - the first cut put the title across the unicorn's
    // chest. The bench has no words in the middle, so it looks straight on.
    cam.p += ((phase < 0 ? -.23 : -.12) - cam.p) * Math.min(1, dt * 1.4);
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
      phase, film, round, best: best && best.total, seasonPts, lastJob, brief,
      cam: [cam.a, cam.p, cam.fov, cam.ang], sub: [P.x, P.z],
    };
    window.SNAPSHOT = () => scoreShot(P, vp, eye, anim, deco, roll);
    // The balance policies drive the game through these rather than through
    // synthetic input events: what is being measured is a way of PLAYING,
    // and routing it through keyboard timing would measure the harness.
    window.SNAPCAM = (a, p, f, ang) => { cam.a = a; cam.p = p; cam.fov = f; if (ang !== undefined) cam.ang = ang; };
    window.SNAPFIRE = () => { wantShot = 1; };
    // Boredom and spark both move the same weights the look does, so a probe
    // measuring what a LOOK is worth has to be able to hold the mood still -
    // otherwise it measures the two together and can attribute neither.
    window.SNAPMOOD = (bored, spark) => { A.bored = bored; A.spark = spark; };
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
  // The flash is the provocation. It also resets the boredom clock, so a
  // player who keeps working keeps a lively subject.
  poke(A);
  shutter();
  flashT = 1;
  const s = scoreShot(P, vp, eye, anim, deco, roll);
  // Scaled by the frame like everything else: a badly composed photograph of
  // the pose they asked for is still a badly composed photograph, and paying
  // it in full would let a player ignore the lens and just wait.
  if (s.pose === brief.pose) {
    const bp = Math.round(POSE_BONUS * s.q * s.fresh);
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

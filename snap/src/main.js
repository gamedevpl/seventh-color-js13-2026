// Unicorn Snap - point a camera at a unicorn that knows exactly how good it
// looks.
//
// Three phases in a loop: take a commission and STYLE the unicorn for it,
// SHOOT it while it works the set, then look at what you got. Six frames a
// job, three jobs a season.

import {
  gl, initGL, frameGL, mode, drawMesh, createMesh, updateMesh,
  perspective, lookAt, mul, modelTR, mask, setDim, setSdw, setSpc, setHair, IDENT,
} from './gl.js';
import { buildUnicorn, paint, flushPaint, makePose, solve, BOXES, MESH_OF, COAT, HORN, HOOF } from './uni.js';
import { studioMesh, shadowMesh, lightsMesh, markMesh, shadowMat } from './studio.js';
import { makeMane, updateMane, maneVerts, recolour, MANE_CORE } from './mane.js';
import { makeAnim, applyPose, POSE_NAME, SHAKE, IDLE } from './pose.js';
import { makeDeco, makeGlitter, glitterVerts, GLITTER_BUF, PALETTE, RB, MAX_GLITTER, swatch } from './deco.js';
import { makeActor, act, move, poke, temper } from './act.js';
import { scoreShot, verdict, repeats, bearingOf, frameBox, frameQuality, eyeContact, POSE_WORTH } from './score.js';
import { wake, awake, music, shutter, sparkle, pleased } from './snd.js';

const FOG = [.09, .07, .05];
// EIGHT FRAMES, NOT SIX. Asked for directly, and the gallery is the reason
// it costs nothing: a feed of eight scrolls exactly as well as a feed of
// six, where a contact sheet of eight thumbnails would have been eight
// smaller thumbnails.
const FILM = 8, SEASON = 3;

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

const studio = studioMesh(), shadow = shadowMesh(), lights = lightsMesh(), mark = markMesh();
const U = buildUnicorn();
const P = makePose();
const anim = makeAnim();
const A = makeActor();
const M = makeMane();
const deco = makeDeco();
const G = makeGlitter();
const maneCore = createMesh([0, 0, 0, 0, 1, 0, 1, 1, 1, 1], true);
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
const rowZ = el('div', 'display:flex;gap:5px;flex-wrap:wrap;justify-content:center', bar);
const rowC = el('div', 'display:flex;gap:6px;flex-wrap:wrap;justify-content:center;max-width:296px', bar);
const rowG = el('div', 'display:flex;gap:8px;align-items:center;justify-content:center', bar);
// Behaviour you cannot see is depth nobody plays with. The bench states, in
// the player's words, what this look will make the unicorn do - which is the
// only reason choosing a colour is a decision rather than a preference.
const tell = el('div', 'font:600 12px system-ui,sans-serif;color:#3a2a12;opacity:.75;text-align:center;max-width:32em', bar);
const flash = el('div', 'position:fixed;inset:0;background:#fff;opacity:0;pointer-events:none');
// Taught in the order the controls are needed, one at a time, low on the
// screen where a viewfinder overlay belongs.
const hint = el('div', 'position:fixed;left:0;right:0;bottom:248px;text-align:center;pointer-events:none;transition:opacity .3s;font:600 14px system-ui,sans-serif;color:#fff3d6;text-shadow:0 2px 10px #000a');

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
// THE GAUGES ARE GONE, and this is the trade that paid for hair worth
// looking at. FRAME and MOMENT were two bars saying, in numbers, what the
// live verdict now says in words - "too far away", "nice frame - only
// standing" - and a sentence a child can read beats a bar a child has to
// interpret. The bytes went into the mane.
// THE VERDICT ARRIVES BEFORE THE SHUTTER. The gallery says what each
// photograph was worth once the roll is spent, which teaches a player at
// the end of a job what they should have known during it. The same sentence
// on the viewfinder - a thumb and the one thing wrong or right with the
// shot you are looking at - is the whole lesson, live, while there is still
// something to do about it.
const live = el('div', 'position:fixed;left:0;right:0;bottom:158px;text-align:center;pointer-events:none;'
  + 'font:800 17px system-ui,sans-serif;text-shadow:0 2px 12px #000c', vf, '');
// Points that climb as you shoot. The score used to be a number you met
// after the fact; a total that ticks up when a good frame lands is the same
// information arriving at the moment it means something.
// It rises toward the running total rather than sitting in the middle of
// the viewfinder, where it landed on the coaching line and on the subject.
const pop = el('div', 'position:fixed;left:0;right:0;top:106px;text-align:center;pointer-events:none;opacity:0;'
  + 'font:800 27px system-ui,sans-serif;color:#ffe9a8;text-shadow:0 2px 14px #000c', vf, '');
const sheet = el('div', 'position:fixed;inset:0;display:none;flex-direction:column;align-items:center;justify-content:center;gap:12px;background:#00000055;backdrop-filter:blur(3px);padding:16px');
// The title sits over a LIVE set rather than a still: the unicorn is already
// working and the camera is already following it, so the first thing anyone
// sees is the thing the game is about. A menu over a frozen frame would be
// advertising a different game.
const title = el('div', 'position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:10px;padding:0 16px 8vh;text-align:center;background:linear-gradient(#00000059,#00000000 34%,#00000012 50%,#000000a6)');

const CHIP = 'font:600 13px system-ui,sans-serif;padding:5px 11px;border-radius:999px;background:#0000005e;color:#fff3d6';
let ptsChip = null, shown = 0, popT = 0;

const ZONES = ['mane', 'tail', 'coat', 'horn', 'hoof'];
let zone = 0;

// A PICTURE OF THE PART, NOT ITS NAME. The bench said MANE, TAIL, COAT,
// HORN, HOOF - six English words on a game whose player cannot read yet,
// which makes the whole styling screen a guessing game for exactly the
// person it was built for.
//
// One 10x10 unicorn does all five buttons: each pixel is labelled with the
// zone it belongs to, and a button draws the whole animal but lights only
// its own zone - in the colour that zone is currently painted. So the icon
// says which part you are about to change AND shows what you have already
// done to it, and the row needs no words at all. The name survives as the
// title attribute, which is the hover text and the accessible name both.
const PIX = '0044000000' + '0043000000' + '0333110000' + '0333111000' + '0033311100'
  + '0033333322' + '0033333332' + '0033333330' + '0030030300' + '0050050500';
// The digits are zone+1 in bench order: mane, tail, coat, horn, hoof.
const ZPIX = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4 };
const rgb = (c) => `rgb(${c.map((v) => (v * 255) | 0)})`;
function drawIcon(cv, mine) {
  const x = cv.getContext('2d');
  x.clearRect(0, 0, 10, 10);
  for (let i = 0; i < 100; i++) {
    const z = ZPIX[PIX[i]];
    if (z === undefined) continue;
    // Everything but this button's own part is a faint grey ghost, so the
    // eye lands on the bit the button edits.
    x.fillStyle = z === mine ? rgb(swatch(deco[ZONES[z]])) : '#3a2a1230';
    x.fillRect(i % 10, (i / 10) | 0, 1, 1);
  }
}
const icons = [];
const zBtns = ZONES.map((z, i) => {
  const b = el('button', BTN + ';padding:6px', rowZ);
  b.title = z.toUpperCase();
  const cv = el('canvas', 'width:42px;height:42px;display:block;image-rendering:pixelated', b);
  cv.width = cv.height = 10;
  icons.push(cv);
  b.onclick = () => { wake(); zone = i; winkT = .78; sync(); };
  return b;
});
const glitBtn = el('button', BTN + ';font-size:23px;letter-spacing:.04em;padding:6px 10px', rowZ, '\u2728');
glitBtn.title = 'GLITTER';
glitBtn.onclick = () => {
  wake();
  deco.glitter = (deco.glitter + 1) % (MAX_GLITTER + 1);
  if (deco.glitter) sparkle(9);
  sync();
};
const cBtns = [RB, 0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
  const b = el('button', BTN, rowC, '');
  b.style.width = '52px';
  b.style.height = '52px';
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

// A WINK FROM THE PART YOU JUST PICKED. The icons say which bit a button
// edits; this says it on the animal itself, which is where the player is
// actually looking.
//
// It flashes LIGHT AND THEN DARK rather than twice toward white. The coat
// starts at 93% grey, so lightening it is nearly invisible - measured at
// eleven levels out of 255 - while a dark beat reads on any colour there
// is. Both beats are that zone's own colour, scaled, so the flash never
// lies about what the part is painted.
let winkT = 0, winkOn = -1;
function wink(k) {
  const col = swatch(deco[ZONES[zone]]);
  const c = k ? col.map((v) => (k > 1 ? v * .4 : v * .3 + .7)) : col;
  if (zone < 2) recolour(M, deco, zone + 1, k && c);
  else {
    paint(U, zone === 2 ? COAT : zone === 3 ? HORN : HOOF, c);
    flushPaint(U);
  }
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
  glitBtn.textContent = '\u2728'.repeat(deco.glitter) || '\u2728';
  glitBtn.style.opacity = deco.glitter ? '1' : '.45';
  icons.forEach(drawIcon);
  const t = temper(deco);
  const does = [];
  if (t.warm > .25) does.push('strut and rear');
  if (t.cool > .25) does.push('settle and watch you');
  if (t.glit > .3) does.push('shake the glitter out');
  tell.textContent = does.length
    ? 'this look makes it ' + does.join(' - ')
    : 'a plain look - it will mostly just stand about';
}

// --- the game -------------------------------------------------------------
let phase = 0;                 // 0 style, 1 shoot, 2 result, 3 season over
let round = 0, film = FILM, seasonPts = 0, best = null, lastJob = 0;
let rollPts = 0, roll = [];
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
// The bench controls now eat the bottom half of a small phone, so the
// portrait lens both widens AND aims lower - a lens pointed down lifts its
// subject up the frame, which is where the only clear space is.
const tall = () => c.height > c.width;
const idleFov = () => (tall() ? 1.06 : .72);
const benchCam = () => { spin = 1; if (!FROZEN) { cam.a = Math.PI; cam.p = -.10; cam.fov = idleFov(); cam.ang = 0; } };
const wideCam = () => { if (!FROZEN) { cam.a = Math.PI; cam.p = -.02; cam.fov = 1.15; cam.ang = 0; } };

function newRound() {
  best = null;
  rollPts = 0;
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
  const total = rollPts;
  lastJob = total;
  seasonPts += total;
  if (best) pleased();
  layout();                    // the sheet is display:none until this runs
  showSheet(total);
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
    el('div', 'font:800 14px system-ui,sans-serif;letter-spacing:.06em', row, `SESSION ${round + 1}/${SEASON}`);
    if (phase === 1) {
      el('div', CHIP + ';font-weight:800', row, `FILM ${film}`);
      ptsChip = el('div', CHIP + ';font-weight:800;background:#3a2a12b0', row, '0');
      shown = rollPts;
    }
  }
  vf.style.display = phase === 1 ? 'block' : 'none';
  shutBtn.style.display = phase === 1 ? 'block' : 'none';
  const c2 = phase === 1 ? coach() : '';
  hint.textContent = c2;
  hint.style.opacity = c2 ? '1' : '0';
}

function showSheet(total) {
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
    // A FEED, NOT A CONTACT SHEET. The first cut of this screen was one big
    // photograph and a row of thumbnails you tapped to swap it - which meant
    // seven of your eight pictures were the size of a postage stamp, and the
    // verdict you were reading belonged to whichever one you had selected.
    // A phone already has the right idiom for "here is what you shot": a
    // column you scroll, every photograph full width, every verdict under
    // the photograph it is about. Nothing to tap, nothing to select.
    el('div', 'font:800 19px system-ui,sans-serif', card,
      best ? `${total} points` : 'No usable frames');
    // The running total, on every result screen rather than only at the end
    // of a season - a score you cannot see until three jobs later is not a
    // score anyone is playing for.
    el('div', 'font-size:14px;font-weight:700;opacity:.7', card,
      `season ${seasonPts}` + (bestEver ? ` - best ${bestEver}` : ''));
    for (const f of roll) {
      const [up, why] = verdict(f);
      const w = el('div', 'width:100%;position:relative', card);
      // Capped at a screen-share rather than shown at full height: a phone
      // photograph is as tall as the phone, and eight of them at full size
      // is a feed nobody reaches the end of. Contained, not cropped - the
      // verdict talks about the composition, so the composition has to be
      // the thing on screen.
      el('img', 'max-width:100%;max-height:42vh;border-radius:10px;display:block;margin:0 auto', w)
        .src = f.img;
      el('div', 'font:700 16px system-ui,sans-serif;padding:5px 2px 2px;text-align:left', w,
        (up ? '\u{1F44D} ' : '\u{1F44E} ') + why);
    }
  }
  const b = el('button', GO + ';position:sticky;bottom:0;box-shadow:0 0 0 12px #f5e6bd;margin-top:4px', card,
    phase === 3 ? 'SHOOT ANOTHER SEASON' : 'NEXT JOB');
  b.onclick = () => {
    wake();
    if (phase === 3) { round = 0; seasonPts = 0; used = []; }
    else round++;
    if (round >= SEASON) { phase = 3; showSheet(0); layout(); return; }
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
    if (pinch && d > 8) zoomBy(pinch / d);
    pinch = d;
    return;
  }
  if (p.d > 24) learnt.aim = 1;
  // THE UNICORN FOLLOWS THE FINGER. This was the other way round - drag
  // right, camera pans right, subject slides left - which is how a
  // viewfinder works and not how a touchscreen does. Everything a phone has
  // taught anyone about dragging says the thing under your finger comes
  // with it, and a nine-year-old reaching to nudge the unicorn back into
  // frame pushed it further out.
  //
  // Scaled by the field of view, so a long lens aims slowly. Without this,
  // zooming in makes the camera unusably twitchy at exactly the moment
  // precision starts to matter.
  // X TURNS THE CAMERA, Y CARRIES THE SUBJECT, and the mixed convention is
  // deliberate rather than an oversight. Both axes used to follow the
  // finger - drag right, unicorn goes right - and the vertical half of that
  // reads correctly while the horizontal half was reported as simply
  // annoying. That is not a contradiction: turning left and right is
  // AIMING, and every camera anyone has held turns the way you push it,
  // while up and down is FRAMING, where the subject sliding with the thumb
  // is what a touchscreen has taught everybody. So the signs differ.
  cam.a -= dx * .0022 * cam.fov;
  cam.p = Math.max(-.5, Math.min(.6, cam.p + dy * .0022 * cam.fov));
});
let gScale = 1;
const zoomBy = (k) => {
  cam.fov = Math.max(.34, Math.min(1.15, cam.fov * k));
  if (cam.fov < 1) learnt.zoom = 1;
};
// A TRACKPAD PINCH IS NOT A TOUCH PINCH. macOS does not send two pointers
// for it: Chrome turns it into a wheel event with ctrlKey set, and Safari
// sends its own gesture events with a scale. Neither reaches the two-finger
// code, which is why pinching on a Mac did nothing at all while it worked
// on a phone - and both, left alone, zoom the PAGE instead, which is the
// other half of the same bug.
addEventListener('gesturestart', (e) => { e.preventDefault(); gScale = 1; });
addEventListener('gesturechange', (e) => {
  e.preventDefault();
  zoomBy(gScale / e.scale);
  gScale = e.scale;
});
addEventListener('gestureend', (e) => e.preventDefault());
addEventListener('dblclick', (e) => e.preventDefault());

// passive:false, or the preventDefault is ignored and the browser zooms or
// scrolls the page out from under a game that just handled the same gesture.
//
// THREE GESTURES ARRIVE AS ONE EVENT on a Mac. A trackpad pinch is a wheel
// with ctrlKey set. A two-finger drag - which is how anyone on a laptop
// expects to move a camera, and which did nothing here - is a wheel with
// small pixel deltas, usually on both axes. A real mouse wheel is a big
// notch on one axis, or a line-mode delta. They have to be told apart from
// each other, because the same event means zoom, pan and zoom again.
addEventListener('wheel', (e) => {
  // NOT ON THE RESULT SCREEN. Taking every wheel event for the camera means
  // taking the ones aimed at a scrolling card too, and the feed of eight
  // photographs was unscrollable on a trackpad the moment it grew taller
  // than the window - the page simply refused to move. Phase, not the event
  // target: the sheet is the only thing on screen once the roll is spent,
  // and asking a Window whether it is inside a div throws.
  if (phase >= 2) return;
  e.preventDefault();
  if (e.ctrlKey) return zoomBy(1 + e.deltaY * .01);
  if (e.deltaMode || (!e.deltaX && Math.abs(e.deltaY) >= 50)) {
    // A notch: zoom, which is what a wheel has always done here.
    cam.fov = Math.max(.34, Math.min(1.15, cam.fov + e.deltaY * .0012));
    if (cam.fov < 1) learnt.zoom = 1;
    return;
  }
  // A two-finger drag, with the same split as the one-finger one and its
  // signs inverted, because scrolling right is the gesture of dragging the
  // surface left.
  cam.a += e.deltaX * .0022 * cam.fov;
  cam.p = Math.max(-.5, Math.min(.6, cam.p - e.deltaY * .0022 * cam.fov));
  learnt.aim = 1;
}, { passive: false });

const q = new URLSearchParams(location.search);
const HAIRN = +q.get('hair') || 5;
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
// AFTER newRound, which resets the mode to IDLE. It used to be set before,
// and the day the title screen was added - newRound moved to boot to build
// the first job under it - ?pose= silently stopped working. Every pose
// screenshot and every run of test-pose from then on was of a standing
// unicorn, and they all passed, because a standing unicorn does stand on
// the ground. A probe that cannot fail is not a probe.
if (FROZEN) anim.mode = +q.get('pose');
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
  : !learnt.zoom ? (TOUCH ? 'pinch to zoom in on it' : 'wheel or W/S to zoom in on it')
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
  // Calm on the bench: everything showy waits for the camera.
  if (phase < 2 && !FROZEN) { act(A, anim, dt, deco, phase === 0); move(A, anim, P, dt); }
  if (winkT > 0) {
    winkT = Math.max(0, winkT - dt);
    // Light, back, dark, back.
    const on = winkT > .58 ? 1 : winkT > .2 && winkT < .39 ? 2 : 0;
    if (on !== winkOn) { winkOn = on; wink(on); }
  }

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
    // The bench tracks HARDER than the title does. A unicorn three metres
    // from the lens crosses the frame quickly, and a lens that ambles after
    // it at the title's rate leaves the animal half out of shot - which is
    // exactly what a styling screen must never do.
    cam.a += ((want - cam.a + Math.PI * 3) % (Math.PI * 2) - Math.PI) * Math.min(1, dt * (phase < 0 ? 2.2 : 6));
    // A phone is TALL, and a unicorn is long: the same vertical field of
    // view that frames it on a monitor crops its nose and tail off a
    // portrait screen, which is what the bench was doing on an iPhone SE.
    // The idle lens widens with the aspect instead of being one number.
    cam.fov += (idleFov() - cam.fov) * Math.min(1, dt * 1.4);
    // The title aims BELOW the subject on purpose: a camera pointed at what
    // it photographs centres it by definition, and the centre of that frame
    // is the words - the first cut put the title across the unicorn's
    // chest. The bench has no words in the middle, so it looks straight on.
    cam.p += ((phase < 0 ? -.23 : tall() ? -.30 : -.12) - cam.p) * Math.min(1, dt * 1.4);
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

  updateMesh(maneCore, MANE_CORE, maneVerts(M, eye));
  const burst = anim.mode === SHAKE ? anim.hold : 0;
  glitN = glitterVerts(G, P.w, eye, deco.glitter, anim.t, burst);
  updateMesh(glitMesh, GLITTER_BUF, glitN);

  vp = mul(perspective(cam.fov, c.width / c.height, .1, 400), lookAt(eye, at));

  frameGL(vp, eye, FOG);
  mode(0);
  drawMesh(studio, IDENT);
  drawMesh(mark, IDENT);

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
  // The one shiny thing on the set, and the only thing cut into hairs.
  // HAIRN is how many hairs the fragment shader carves out of each card;
  // a query parameter while this is being tuned by eye.
  setSpc(1.7);
  setHair(HAIRN);
  drawMesh(maneCore, IDENT);
  setHair(0);
  setSpc(0);
  mode(1);
  drawMesh(lights, IDENT);
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
    const b2 = frameBox(P, vp);
    const q = frameQuality(b2);
    const e = eyeContact(P, eye);
    // The shutter's ring still says when both halves are there, because
    // that is the only combination the score pays for - and it says it
    // where the thumb already is.
    const good = q > .7 && (POSE_WORTH[anim.mode] || 40) > 150;
    // The same call the gallery makes, on the frame you are aiming at.
    const [up, why] = verdict({
      box: b2, pose: anim.mode, eye: e, glitAir: deco.glitter > 0 && anim.mode === SHAKE,
      fresh: .68 ** repeats(roll, anim.mode, bearingOf(P, eye)),
    });
    const say = (up ? '\u{1F44D} ' : '\u{1F44E} ') + why;
    if (live.textContent !== say) {
      live.textContent = say;
      live.style.color = up ? '#9fe08a' : '#ffd0a8';
    }
    // Eased rather than snapped: a number that counts up reads as earned,
    // and it also survives the eight frames of a good roll landing at once.
    shown += (rollPts - shown) * Math.min(1, dt * 5);
    const n = `${Math.round(shown)}`;
    if (ptsChip && ptsChip.textContent !== n) ptsChip.textContent = n;
    shutBtn.style.borderColor = good ? '#9fe08add' : '#fff3d6cc';
  }
  if (popT > 0) {
    popT = Math.max(0, popT - dt * 1.1);
    pop.style.opacity = popT;
    pop.style.transform = `translateY(${(1 - popT) * -22}px)`;
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
      cam: [cam.a, cam.p, cam.fov, cam.ang], sub: [P.x, P.z], yaw: P.yaw,
    };
    window.SNAPSHOT = () => scoreShot(P, vp, eye, anim, deco, roll);
    // The rig and the hair as the renderer sees them, so a probe can ask
    // whether a strand has gone inside the animal.
    window.SNAPHAIR = () => ({
      boxes: BOXES, meshOf: MESH_OF,
      w: P.w.map((m) => [...m]),
      hair: M.strands.map((s) => s.p.map((q) => [...q])),
    });
    // The balance policies drive the game through these rather than through
    // synthetic input events: what is being measured is a way of PLAYING,
    // and routing it through keyboard timing would measure the harness.
    window.SNAPCAM = (a, p, f, ang) => { cam.a = a; cam.p = p; cam.fov = f; if (ang !== undefined) cam.ang = ang; };
    window.SNAPFIRE = () => { wantShot = 1; };
    // Boredom and spark both move the same weights the look does, so a probe
    // measuring what a LOOK is worth has to be able to hold the mood still -
    // otherwise it measures the two together and can attribute neither.
    window.SNAPMOOD = (bored, spark) => { A.bored = bored; A.spark = spark; };
    // Raw pixels, for the one question an average cannot answer: is there
    // a GRADIENT across the hair, or is it flat-lit paper?
    window.SNAPRAW = (x, y, w, h) => {
      const px = new Uint8Array(w * h * 4);
      gl.readPixels(x, y, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      return Array.from(px);
    };
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
  rollPts += s.total;
  pop.textContent = `+${s.total}`;
  popT = 1;
  // JPEG, not PNG: these are photographs, six of them are held in memory at
  // once, and a full-window PNG data URL is megabytes of string.
  s.img = c.toDataURL('image/jpeg', .82);
  roll.push(s);
  if (!best || s.total > best.total) best = s;
  layout();
  if (film <= 0) setTimeout(endRound, 700);
}

requestAnimationFrame(frame);

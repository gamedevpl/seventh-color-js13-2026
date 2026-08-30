// Unicorn Snap - point a camera at a unicorn that knows exactly how good it
// looks.
//
// This pass is the styling bench: the set, the animal, and the paint. The
// shoot itself comes next, and the brief after it - but the brief can only
// ask for things the player is able to do, so being able to do them comes
// first.

import {
  gl, initGL, frameGL, mode, drawMesh, createMesh, updateMesh,
  perspective, lookAt, mul, modelTR, mask, setDim, setSdw, IDENT,
} from './gl.js';
import { buildUnicorn, paint, flushPaint, makePose, solve, COAT, HORN, HOOF } from './uni.js';
import { studioMesh, shadowMesh, lightsMesh, shadowMat } from './studio.js';
import { makeMane, updateMane, maneVerts, recolour, MANE_CORE, MANE_HALO } from './mane.js';
import { makeAnim, applyPose, POSE_NAME, SHAKE } from './pose.js';
import { makeDeco, makeGlitter, glitterVerts, GLITTER_BUF, PALETTE, RB, MAX_GLITTER, swatch } from './deco.js';
import { wake, awake, music, shutter, sparkle } from './snd.js';

// Warm and dark, so anything beyond the paper reads as the unlit depth of a
// studio rather than as a hole in the world.
const FOG = [.09, .07, .05];

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
const M = makeMane();
const deco = makeDeco();
const G = makeGlitter();
const maneCore = createMesh([0, 0, 0, 0, 1, 0, 1, 1, 1, 1], true);
const maneHalo = createMesh([0, 0, 0, 0, 1, 0, 1, 1, 1, 1], true);
const glitMesh = createMesh([0, 0, 0, 0, 1, 0, 1, 1, 1, 1], true);
recolour(M, deco);

// --- the styling bench ----------------------------------------------------
// Plain DOM, not a canvas UI. Buttons come with hit-testing, text layout,
// wrapping and touch handling already written, and in a 13 KB budget those
// are exactly the things not worth writing twice.
const el = (tag, css, parent, text) => {
  const e = document.createElement(tag);
  e.style.cssText = css;
  if (text) e.textContent = text;
  (parent || document.body).appendChild(e);
  return e;
};

const BTN = 'font:600 13px system-ui,sans-serif;padding:7px 11px;border:0;border-radius:8px;cursor:pointer;color:#3a2a12;background:#00000018';
const bar = el('div', 'position:fixed;left:0;right:0;bottom:0;display:flex;flex-direction:column;align-items:center;gap:7px;padding:10px 8px 14px;touch-action:none');
const rowZ = el('div', 'display:flex;gap:6px;flex-wrap:wrap;justify-content:center', bar);
const rowC = el('div', 'display:flex;gap:6px;flex-wrap:wrap;justify-content:center', bar);

// The five things a player thinks of as separate parts of a unicorn.
const ZONES = ['mane', 'tail', 'coat', 'horn', 'hoof'];
let zone = 0;

const zBtns = ZONES.map((z, i) => {
  const b = el('button', BTN, rowZ, z.toUpperCase());
  b.onclick = () => { wake(); zone = i; sync(); };
  return b;
});

// The rainbow swatch is the unicorn's own colouring, and it belongs only to
// hair - a rainbow coat is a different game, and a rainbow hoof is a mess.
const cBtns = [RB, 0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
  const b = el('button', BTN, rowC, '');
  b.style.width = b.style.height = '32px';
  b.style.padding = '0';
  b.onclick = () => {
    wake();
    apply(i);
    sparkle(3);
  };
  b.dataset.i = i;
  return b;
});

const glitBtn = el('button', BTN, rowZ, 'GLITTER');
glitBtn.onclick = () => {
  wake();
  deco.glitter = (deco.glitter + 1) % (MAX_GLITTER + 1);
  if (deco.glitter) sparkle(9);
  sync();
};

function apply(i) {
  const key = ZONES[zone];
  if (i === RB && zone > 1) return;            // hair only
  deco[key] = i;
  if (zone < 2) recolour(M, deco);
  else {
    paint(U, zone === 2 ? COAT : zone === 3 ? HORN : HOOF, PALETTE[i]);
    flushPaint(U);
  }
  sync();
}

function sync() {
  zBtns.forEach((b, i) => {
    b.style.background = i === zone ? '#00000038' : '#00000018';
  });
  cBtns.forEach((b) => {
    const i = +b.dataset.i;
    const on = deco[ZONES[zone]] === i;
    const dead = i === RB && zone > 1;
    const col = swatch(i);
    b.style.background = i === RB
      ? 'linear-gradient(135deg,#c9524f,#d9c24f,#7db06b,#6b7dc9,#9a6bc4)'
      : `rgb(${col.map((v) => (v * 255) | 0)})`;
    b.style.opacity = dead ? '.25' : '1';
    b.style.outline = on ? '2px solid #3a2a12' : '0';
  });
  glitBtn.textContent = 'GLITTER ' + '★'.repeat(deco.glitter).padEnd(0);
};
sync();

// --- camera ---------------------------------------------------------------
const YAW = 1.25;
const cam = { yaw: .35, pitch: .12, dist: 4.4 };
const keys = {};
addEventListener('keydown', (e) => {
  wake();
  keys[e.code] = 1;
  const n = 'Digit0 Digit1 Digit2 Digit3 Digit4 Digit5 Digit6 Digit7 Digit8 Digit9'.split(' ').indexOf(e.code);
  if (n >= 0) { anim.mode = n; anim.hold = 0; }
  if (e.code === 'KeyB') { anim.mode = 10; anim.hold = 0; }
  if (e.code === 'KeyF') shutter();
});
addEventListener('keyup', (e) => { keys[e.code] = 0; });

let drag = null;
c.addEventListener('pointerdown', (e) => { wake(); drag = [e.clientX, e.clientY]; });
addEventListener('pointerup', () => { drag = null; });
addEventListener('pointermove', (e) => {
  if (!drag) return;
  cam.yaw = Math.max(-YAW, Math.min(YAW, cam.yaw - (e.clientX - drag[0]) * .006));
  cam.pitch = Math.max(-.12, Math.min(.9, cam.pitch + (e.clientY - drag[1]) * .004));
  drag = [e.clientX, e.clientY];
});
addEventListener('wheel', (e) => {
  cam.dist = Math.max(2, Math.min(12, cam.dist + e.deltaY * .003));
});

const q = new URLSearchParams(location.search);
if (q.has('pose')) anim.mode = +q.get('pose');
if (q.has('cam')) { const p = q.get('cam').split(','); cam.yaw = +p[0]; cam.pitch = +p[1]; cam.dist = +p[2]; }
if (q.has('ui')) bar.style.display = 'none';
// A whole look in one string - mane,tail,coat,horn,hoof,glitter - so a shot
// of a styled unicorn is reproducible and a brief can be posed against a
// known one.
if (q.has('deco')) {
  const d = q.get('deco').split(',').map(Number);
  ZONES.forEach((k, i) => { zone = i; apply(d[i]); });
  zone = 0;
  deco.glitter = d[5] || 0;
  sync();
}

let glitN = 0;
let last = performance.now();
function frame(now) {
  const dt = Math.min(.05, (now - last) / 1000);
  last = now;
  anim.t += dt;
  anim.hold += dt;

  if (keys.ArrowLeft) cam.yaw = Math.min(YAW, cam.yaw + dt * 1.4);
  if (keys.ArrowRight) cam.yaw = Math.max(-YAW, cam.yaw - dt * 1.4);
  if (keys.ArrowUp) cam.pitch = Math.min(.9, cam.pitch + dt);
  if (keys.ArrowDown) cam.pitch = Math.max(-.12, cam.pitch - dt);

  if (awake()) music(anim.mode === 9 || anim.mode === 5 ? .8 : .2, 0);

  anim.gaze = keys.Space ? 1 : 0;
  anim.lookYaw = Math.atan2(Math.sin(cam.yaw - P.yaw), Math.cos(cam.yaw - P.yaw));
  anim.lookPitch = cam.pitch;

  applyPose(P, anim, dt);
  solve(P);

  // The hair is solved AFTER the rig, because every root rides a bone that
  // this frame's pose has just moved - solving it first would hang the mane
  // off where the head was a frame ago, which reads as a rubbery lag.
  updateMane(M, P.w, anim.t, dt);

  const aim = [0, .8, 0];
  const eye = [
    aim[0] + Math.sin(cam.yaw) * Math.cos(cam.pitch) * cam.dist,
    aim[1] + Math.sin(cam.pitch) * cam.dist,
    aim[2] + Math.cos(cam.yaw) * Math.cos(cam.pitch) * cam.dist,
  ];
  const [nc, nh] = maneVerts(M, eye);
  updateMesh(maneCore, MANE_CORE, nc);
  updateMesh(maneHalo, MANE_HALO, nh);
  const burst = anim.mode === SHAKE ? anim.hold : 0;
  glitN = glitterVerts(G, P.w, eye, deco.glitter, anim.t, burst);
  updateMesh(glitMesh, GLITTER_BUF, glitN);

  const vp = mul(perspective(1.15, c.width / c.height, .1, 400), lookAt(eye, aim));

  frameGL(vp, eye, FOG);
  mode(0);
  drawMesh(studio, IDENT);

  // --- the shadow, before the unicorn that casts it ----------------------
  // Drawn first so the solid unicorn then covers whatever part of its own
  // shadow lies behind it, for free and in the right order.
  mode(2);
  setDim(.4);
  // Just clear of the paper: coplanar with it, this z-fights across the
  // whole disc and flickers as the camera moves.
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

  if (DEV) {
    let lo = 9;
    for (const b of [5, 7, 9, 11]) {
      const m = P.w[b];
      lo = Math.min(lo, m[5] * -.255 + m[9] * .01 + m[13]);
    }
    // The belly, because a sleeping unicorn rests on its barrel and its
    // hooves are tucked up in the air - measuring only hooves would call
    // the one pose that is lying down correctly a pose that is floating.
    const bm = P.w[0];
    const belly = bm[5] * -.20 + bm[9] * .30 + bm[13];
    window.SNAP = {
      pose: anim.mode, hoof: lo, belly, contact: Math.min(lo, belly), t: anim.t,
      deco, name: POSE_NAME[anim.mode], glit: glitN / 10,
    };
    // Reading the framebuffer back is the only honest way to ask whether a
    // colour the player chose actually reached the screen: every other
    // check tests the code that was just written against itself.
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
requestAnimationFrame(frame);

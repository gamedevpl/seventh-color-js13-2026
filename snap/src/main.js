// Unicorn Snap - point a camera at a unicorn that knows it looks good.
//
// This pass is the rig harness: an orbit camera, a meadow to stand on, and
// every pose reachable so they can be looked at. The photography comes
// next; getting the animal right first is the whole point of the game.

import {
  initGL, frameGL, mode, drawMesh, createMesh, updateMesh, pushBox,
  perspective, lookAt, mul, modelTR, IDENT,
} from './gl.js';
import { buildUnicorn, makePose, solve, RAINBOW } from './uni.js';
import { makeMane, updateMane, maneVerts, MANE_BUF } from './mane.js';
import { makeAnim, applyPose, POSE_NAME, GRAZE, IDLE, WALK, TROT, GALLOP, REAR, TOSS, SHAKE, SLEEP, PRANCE } from './pose.js';

const FOG = [.07, .06, .13];

const c = document.getElementById('c');
initGL(c);

const hud = document.createElement('div');
hud.style.cssText = 'position:fixed;left:12px;top:10px;font:16px system-ui,sans-serif;color:#cfc6ff;text-shadow:0 2px 6px #000;pointer-events:none';
document.body.appendChild(hud);

function resize() {
  const d = Math.min(devicePixelRatio || 1, 2);
  c.width = innerWidth * d;
  c.height = innerHeight * d;
  c.style.width = innerWidth + 'px';
  c.style.height = innerHeight + 'px';
}
addEventListener('resize', resize);
resize();

// --- the meadow ----------------------------------------------------------
function groundMesh() {
  const v = [];
  pushBox(v, 0, -.4, 0, 80, .8, 80, .16, .18, .26);
  return createMesh(v);
}

// Glowing tufts, scattered on a fixed lattice so the field is the same
// every run and the camera has something to parallax against.
function fieldMesh() {
  const v = [];
  let s = 7;
  const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let i = 0; i < 420; i++) {
    const a = rnd() * 6.283, r = 2 + rnd() * 30;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const col = RAINBOW[(rnd() * 7) | 0];
    // Rooted in the grass and short. Tall bright bars read as confetti
    // hanging in the air rather than as a meadow with light in it.
    const h = .05 + rnd() * .07;
    pushBox(v, x, h / 2, z, .03, h, .03, col[0], col[1], col[2], .38);
  }
  return createMesh(v);
}

// A sky that is mostly empty and one rainbow arc, because the theme is
// rainbows and unicorns and the arc is what a photograph wants behind it.
function skyMesh() {
  const v = [];
  let s = 91;
  const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let i = 0; i < 160; i++) {
    const a = rnd() * 6.283, e = rnd() * 1.2 + .05, r = 120;
    const y = Math.sin(e) * r, h = Math.cos(e) * r;
    pushBox(v, Math.cos(a) * h, y, Math.sin(a) * h, .5, .5, .5, .9, .92, 1, .5 + rnd() * .5);
  }
  // The arc has to be sampled densely enough that it reads as a band and
  // not as a dotted line: at 24 steps the gaps between boxes were wider
  // than the boxes, and it came out as a ladder lying on its side.
  RAINBOW.forEach((col, i) => {
    const r = 46 + i * 2.4;
    for (let k = 0; k <= 90; k++) {
      const a = Math.PI * (k / 90);
      pushBox(v, Math.cos(a) * r, Math.sin(a) * r, -70, 2.6, 2.6, 2.6, col[0], col[1], col[2], .2);
    }
  });
  return createMesh(v);
}

const ground = groundMesh(), field = fieldMesh(), sky = skyMesh();
const parts = buildUnicorn();
const P = makePose();
const anim = makeAnim();
const M = makeMane();
const maneMesh = createMesh([0, 0, 0, 0, 1, 0, 1, 1, 1, 1], true);

// --- camera --------------------------------------------------------------
const cam = { yaw: .6, pitch: .18, dist: 5.2 };
const keys = {};
addEventListener('keydown', (e) => {
  keys[e.code] = 1;
  const n = 'Digit0 Digit1 Digit2 Digit3 Digit4 Digit5 Digit6 Digit7 Digit8 Digit9'.split(' ').indexOf(e.code);
  if (n >= 0) { anim.mode = n; anim.hold = 0; }
});
addEventListener('keyup', (e) => { keys[e.code] = 0; });

let drag = null;
addEventListener('pointerdown', (e) => { drag = [e.clientX, e.clientY]; });
addEventListener('pointerup', () => { drag = null; });
addEventListener('pointermove', (e) => {
  if (!drag) return;
  cam.yaw -= (e.clientX - drag[0]) * .006;
  cam.pitch = Math.max(-.2, Math.min(1.1, cam.pitch + (e.clientY - drag[1]) * .004));
  drag = [e.clientX, e.clientY];
});
addEventListener('wheel', (e) => {
  cam.dist = Math.max(2, Math.min(16, cam.dist + e.deltaY * .003));
});

// The dev harness picks a pose from the URL so a screenshot can be taken of
// any one of them without driving the keyboard.
const q = new URLSearchParams(location.search);
if (q.has('pose')) anim.mode = +q.get('pose');
if (q.has('cam')) { const p = q.get('cam').split(','); cam.yaw = +p[0]; cam.pitch = +p[1]; cam.dist = +p[2]; }

let last = performance.now();
function frame(now) {
  const dt = Math.min(.05, (now - last) / 1000);
  last = now;
  anim.t += dt;
  anim.hold += dt;

  if (keys.ArrowLeft) cam.yaw += dt * 1.4;
  if (keys.ArrowRight) cam.yaw -= dt * 1.4;
  if (keys.ArrowUp) cam.pitch = Math.min(1.1, cam.pitch + dt);
  if (keys.ArrowDown) cam.pitch = Math.max(-.2, cam.pitch - dt);

  // Where the unicorn is looking: at the camera, so the rig's gaze code
  // gets exercised while the poses are being judged.
  anim.gaze = keys.Space ? 1 : 0;
  anim.lookYaw = Math.atan2(Math.sin(cam.yaw - P.yaw), Math.cos(cam.yaw - P.yaw));
  anim.lookPitch = cam.pitch;

  applyPose(P, anim, dt);
  solve(P);

  const aim = [0, .8, 0];
  const eye = [
    aim[0] + Math.sin(cam.yaw) * Math.cos(cam.pitch) * cam.dist,
    aim[1] + Math.sin(cam.pitch) * cam.dist,
    aim[2] + Math.cos(cam.yaw) * Math.cos(cam.pitch) * cam.dist,
  ];
  const vp = mul(perspective(1.15, c.width / c.height, .1, 400), lookAt(eye, aim));

  // The hair is solved AFTER the rig, because every root rides a bone that
  // this frame's pose has just moved - solving it first would hang the mane
  // off where the head was a frame ago, which reads as a rubbery lag.
  updateMane(M, P.w, anim.t, dt);
  updateMesh(maneMesh, MANE_BUF, maneVerts(M, eye));

  frameGL(vp, eye, FOG);
  mode(0);
  drawMesh(ground, IDENT);
  for (let i = 0; i < parts.length; i++) drawMesh(parts[i], P.w[i]);
  mode(1);
  drawMesh(sky, modelTR(eye[0], 0, eye[2]));
  drawMesh(field, IDENT);
  drawMesh(maneMesh, IDENT);

  hud.textContent = `${POSE_NAME[anim.mode]}   [0-9 poses, drag to orbit, SPACE to be looked at]`;

  // The rig probe. "Is it standing on the grass?" is not a question to
  // settle by looking at a screenshot - a pose can float or sink by a few
  // centimetres and read as merely a bit odd, and every bone above the root
  // inherits the root's pitch, so the failure mode is systematic rather
  // than rare. The lowest hoof is the number that decides it.
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
    window.SNAP = { pose: anim.mode, hoof: lo, belly, contact: Math.min(lo, belly), t: anim.t };
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Unicorn Snap - point a camera at a unicorn that knows exactly how good it
// looks.
//
// This pass is the rig harness plus the set it stands on: an orbit camera,
// a studio sweep, and every pose reachable so they can be looked at. The
// photography comes next; getting the animal and the light right first is
// the whole point of the game.

import {
  initGL, frameGL, mode, drawMesh, createMesh, updateMesh,
  perspective, lookAt, mul, modelTR, mask, setDim, setSdw, IDENT,
} from './gl.js';
import { buildUnicorn, makePose, solve } from './uni.js';
import { studioMesh, shadowMesh, lightsMesh, shadowMat } from './studio.js';
import { makeMane, updateMane, maneVerts, MANE_CORE, MANE_HALO } from './mane.js';
import { makeAnim, applyPose, POSE_NAME } from './pose.js';
import { wake, awake, music, shutter, sparkle } from './snd.js';

// Warm and dark, so the frame beyond the paper's edge reads as the unlit
// depth of a studio rather than as a hole in the world.
const FOG = [.09, .07, .05];

const c = document.getElementById('c');
initGL(c);

const hud = document.createElement('div');
hud.style.cssText = 'position:fixed;left:12px;top:10px;font:16px system-ui,sans-serif;color:#3a2a12;pointer-events:none';
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

const studio = studioMesh(), shadow = shadowMesh(), lights = lightsMesh();
const parts = buildUnicorn();
const P = makePose();
const anim = makeAnim();
const M = makeMane();
const maneCore = createMesh([0, 0, 0, 0, 1, 0, 1, 1, 1, 1], true);
const maneHalo = createMesh([0, 0, 0, 0, 1, 0, 1, 1, 1, 1], true);

// --- camera --------------------------------------------------------------
// The sweep only exists in front of the subject, which is what a cyclorama
// is - so the lens stays on the near side of it. That is not a limitation
// to work around, it is the room.
const YAW = 1.25;
const cam = { yaw: .35, pitch: .12, dist: 5.6 };
const keys = {};
// A browser makes no sound until the page has had a real user gesture, so
// the context is created from the first press and from nowhere else.
addEventListener('keydown', (e) => {
  wake();
  keys[e.code] = 1;
  if (e.code === 'KeyF') shutter();
  if (e.code === 'KeyG') sparkle();
  const n = 'Digit0 Digit1 Digit2 Digit3 Digit4 Digit5 Digit6 Digit7 Digit8 Digit9'.split(' ').indexOf(e.code);
  if (n >= 0) { anim.mode = n; anim.hold = 0; }
});
addEventListener('keyup', (e) => { keys[e.code] = 0; });

let drag = null;
addEventListener('pointerdown', (e) => { wake(); drag = [e.clientX, e.clientY]; });
addEventListener('pointerup', () => { drag = null; });
addEventListener('pointermove', (e) => {
  if (!drag) return;
  cam.yaw = Math.max(-YAW, Math.min(YAW, cam.yaw - (e.clientX - drag[0]) * .006));
  cam.pitch = Math.max(-.12, Math.min(.9, cam.pitch + (e.clientY - drag[1]) * .004));
  drag = [e.clientX, e.clientY];
});
addEventListener('wheel', (e) => {
  cam.dist = Math.max(2, Math.min(14, cam.dist + e.deltaY * .003));
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

  if (keys.ArrowLeft) cam.yaw = Math.min(YAW, cam.yaw + dt * 1.4);
  if (keys.ArrowRight) cam.yaw = Math.max(-YAW, cam.yaw - dt * 1.4);
  if (keys.ArrowUp) cam.pitch = Math.min(.9, cam.pitch + dt);
  if (keys.ArrowDown) cam.pitch = Math.max(-.12, cam.pitch - dt);

  anim.gaze = keys.Space ? 1 : 0;
  anim.lookYaw = Math.atan2(Math.sin(cam.yaw - P.yaw), Math.cos(cam.yaw - P.yaw));
  anim.lookPitch = cam.pitch;

  // The strut runs whenever the page has been touched. Intensity is a stand
  // in until the shoot exists: the hook comes in for the poses that are
  // worth photographing.
  if (awake()) music(anim.mode === 9 || anim.mode === 5 ? .8 : .2, 0);

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
  const vp = mul(perspective(1.15, c.width / c.height, .1, 400), lookAt(eye, aim));

  frameGL(vp, eye, FOG);
  mode(0);
  drawMesh(studio, IDENT);

  // --- the shadow, before the unicorn that casts it ----------------------
  // Drawn first so the solid unicorn then covers whatever part of its own
  // shadow lies behind it, for free and in the right order.
  mode(2);
  // Just clear of the paper: coplanar with it, this z-fights across the
  // whole disc and flickers as the camera moves.
  setDim(.4);
  drawMesh(shadow, modelTR(P.x, .01, P.z, 0, 1.0));
  // The real one: every bone flattened onto the floor through the light's
  // shear, tinted by the shader and painted once per pixel by the stencil.
  // The mane is in world space already, so it projects with the same matrix
  // and its silhouette lands in the shadow with everything else - which is
  // the whole point of doing this rather than drawing a blob.
  const SM = shadowMat(.012);
  mask(3);
  setDim(.5);
  setSdw(1);
  for (let i = 0; i < parts.length; i++) drawMesh(parts[i], mul(SM, P.w[i]));
  drawMesh(maneCore, SM);
  setSdw(0);
  setDim(1);
  mask(0);

  mode(0);
  for (let i = 0; i < parts.length; i++) drawMesh(parts[i], P.w[i]);
  drawMesh(maneCore, IDENT);
  mode(1);
  drawMesh(lights, IDENT);
  drawMesh(maneHalo, IDENT);

  hud.textContent = `${POSE_NAME[anim.mode]}   [0-9 poses, drag to orbit, SPACE to be looked at]`;

  // The rig probe. "Is it standing on the floor?" is not a question to
  // settle by looking at a screenshot - a pose can float or sink by a few
  // centimetres and read as merely a bit odd, and every bone above the root
  // inherits the root's pitch, so the failure mode is systematic rather
  // than rare. The lowest contact point is the number that decides it.
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

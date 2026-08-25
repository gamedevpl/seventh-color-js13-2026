// Seven Strands - the second Seventh Color entry. Same legend, opposite
// form: after the light came back, one braid of it bolted, and the
// restored unicorn chases it through a hedge labyrinth. Third-person 3D
// over raw WebGL; the HUD is a transparent 2D canvas laid over the GL one,
// because canvas text costs nothing and GL text costs everything.

import { initGL, frameGL, createMesh, updateMesh, drawMesh, perspective, lookAt, mul, modelTR, IDENT, pushBox } from './gl.js';
import { S, genMaze, mazeMesh, collide, bfs } from './maze.js';
import { unicornMesh, RAINBOW } from './uni.js';
import { makeBraid, updateBraid, braidVerts } from './ribbon.js';

const VW = 640, VH = 360;
const FOG = [.055, .04, .10];

const glc = document.getElementById('c');
glc.width = VW;
glc.height = VH;
initGL(glc);

// HUD overlay: wrap the GL canvas so absolute positioning is relative to it.
const wrap = document.createElement('div');
wrap.style.position = 'relative';
glc.parentNode.insertBefore(wrap, glc);
wrap.appendChild(glc);
const hud = document.createElement('canvas');
hud.width = VW;
hud.height = VH;
hud.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%';
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
hud.addEventListener('pointerdown', () => { acted = true; });
const heldFwd = () => held.ArrowUp || held.w;
const heldBack = () => held.ArrowDown || held.s;
const turnDir = () => (held.ArrowLeft || held.a ? 1 : 0) - (held.ArrowRight || held.d ? 1 : 0);

// --- audio: one tone primitive, gallop + catch arpeggio -------------------
let ac;
function tone(f, dur, type, gain, when = 0) {
  if (!ac) return;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type;
  o.frequency.value = f;
  const t0 = ac.currentTime + when;
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(.001, t0 + dur);
  o.connect(g);
  g.connect(ac.destination);
  o.start(t0);
  o.stop(t0 + dur);
}

// --- round state ----------------------------------------------------------
let mode = 'title', round = 0, timer = 0, best = 0;
let maze, mazeM, braid, braidM, dists, bfsT = 0;
const player = { x: 0, z: 0, yaw: 0, speed: 0 };
const cam = { x: 0, y: 3, z: -5 };
const uniM = unicornMesh();

function newRound() {
  const n = 9 + round * 2;
  maze = genMaze(n);
  mazeM = createMesh(mazeMesh(maze));
  player.x = (n - .5) * S;
  player.z = (n - .5) * S;
  // Face whichever corridor is actually open, and snap the camera straight
  // to its spot behind - the first frames of a round should be the maze,
  // not the camera flying in from wherever the last round left it.
  player.yaw = maze.open(n - 1, n - 1, -1, 0) ? -Math.PI / 2 : Math.PI;
  player.speed = 0;
  cam.x = player.x - Math.sin(player.yaw) * 3.6;
  cam.y = 2.3;
  cam.z = player.z - Math.cos(player.yaw) * 3.6;
  braid = makeBraid(0, 0);
  braidM = createMesh(braidVerts(braid, 0), true);
  dists = bfs(maze, n - 1, n - 1);
  timer = 0;
}

// Sparkle beacon: when the braid is far, a shimmering pillar shows over
// the walls - a maze you cannot find the quarry in is hide-and-seek, and
// this game is tag.
const pillar = [];
RAINBOW.forEach((c, i) => pushBox(pillar, 0, 1.4 + i * .62, 0, .12, .58, .12, ...c));
const pillarM = createMesh(pillar);

let last = 0;
function frame(now) {
  const dt = Math.min(.05, (now - last) / 1000 || 0);
  last = now;
  const doAct = acted;
  acted = false;

  if (mode === 'run') {
    timer += dt;
    // player: tank-ish controls tuned for corridor turns
    player.yaw += turnDir() * dt * (2.9 - Math.min(1.2, player.speed * .18));
    const target = heldFwd() ? 5.2 : heldBack() ? -1.8 : 0;
    player.speed += (target - player.speed) * Math.min(1, dt * 5);
    const fx = Math.sin(player.yaw), fz = Math.cos(player.yaw);
    player.x += fx * player.speed * dt;
    player.z += fz * player.speed * dt;
    [player.x, player.z] = collide(maze, player.x, player.z, .38);

    // braid flees against fresh BFS-from-player, recomputed on a short clock
    bfsT -= dt;
    if (bfsT <= 0) {
      bfsT = .25;
      const px = Math.max(0, Math.min(maze.n - 1, Math.floor(player.x / S)));
      const pz = Math.max(0, Math.min(maze.n - 1, Math.floor(player.z / S)));
      dists = bfs(maze, px, pz);
    }
    updateBraid(maze, braid, player, dists, dt);
    updateMesh(braidM, braidVerts(braid, now / 1000));

    // gallop rhythm follows real speed
    if (player.speed > 2 && Math.floor(timer * 7) !== Math.floor((timer - dt) * 7)) {
      tone(150 + Math.random() * 40, .04, 'triangle', .05);
    }

    const tail = braid.trail[0];
    if (tail && Math.hypot(player.x - tail[0], player.z - tail[2]) < .95) {
      mode = 'won';
      best = best === 0 ? timer : Math.min(best, timer);
      RAINBOW.forEach((_, i) => tone(392 * 2 ** (i / 7), .3, 'triangle', .1, i * .09));
    }
  }

  if (doAct) {
    if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
    if (mode === 'title') { newRound(); mode = 'run'; tone(660, .2, 'triangle', .1); }
    else if (mode === 'won') { round++; newRound(); mode = 'run'; }
  }

  // --- camera + draw ------------------------------------------------------
  const fx = Math.sin(player.yaw), fz = Math.cos(player.yaw);
  const wantX = player.x - fx * 3.6, wantZ = player.z - fz * 3.6;
  const k = Math.min(1, dt * 5);
  cam.x += (wantX - cam.x) * k;
  cam.y += (2.3 - cam.y) * k;
  cam.z += (wantZ - cam.z) * k;
  const eye = [cam.x, cam.y, cam.z];
  const vp = mul(perspective(1.05, VW / VH, .1, 60), lookAt(eye, [player.x + fx * 1.4, .9, player.z + fz * 1.4]));
  frameGL(vp, eye, FOG);

  if (mode !== 'title') {
    drawMesh(mazeM, IDENT);
    drawMesh(braidM, IDENT);
    const bob = Math.abs(Math.sin(now / 1000 * 11)) * Math.min(1, Math.abs(player.speed) / 4) * .1;
    drawMesh(uniM, modelTR(player.x, bob, player.z, player.yaw, .8));
    const pd = Math.hypot(player.x - braid.x, player.z - braid.z);
    if (pd > 7 && mode === 'run') drawMesh(pillarM, modelTR(braid.x, Math.sin(now / 300) * .3, braid.z, now / 400));
  }

  // --- HUD ----------------------------------------------------------------
  ctx.clearRect(0, 0, VW, VH);
  ctx.textAlign = 'center';
  if (mode === 'title') {
    ctx.fillStyle = '#0a0714';
    ctx.fillRect(0, 0, VW, VH);
    RAINBOW.forEach(([r, g, b], i) => {
      ctx.fillStyle = `rgb(${r * 255},${g * 255},${b * 255})`;
      ctx.fillRect(0, 96 + i * 7, VW, 5);
    });
    ctx.fillStyle = '#f3ead6';
    ctx.font = 'bold 34px system-ui';
    ctx.fillText('SEVEN STRANDS', VW / 2, 78);
    ctx.font = '13px system-ui';
    ctx.fillStyle = '#b8ab92';
    ctx.fillText('One braid of the returned light bolted into the hedge maze.', VW / 2, 172);
    ctx.fillText('Run it down and catch its tail.', VW / 2, 192);
    ctx.fillStyle = '#7a6e5c';
    ctx.fillText('↑ gallop   ← → turn   ↓ brake', VW / 2, 236);
    ctx.fillStyle = '#e8b923';
    ctx.fillText('press SPACE', VW / 2, 268);
  } else {
    ctx.font = '14px system-ui';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#f3ead6';
    ctx.fillText(timer.toFixed(1) + 's', 12, 22);
    if (round > 0) ctx.fillText('maze ' + (round + 1), 12, 42);
    if (mode === 'won') {
      ctx.textAlign = 'center';
      ctx.fillStyle = '#00000088';
      ctx.fillRect(0, VH / 2 - 58, VW, 116);
      ctx.fillStyle = '#e8b923';
      ctx.font = 'bold 26px system-ui';
      ctx.fillText('CAUGHT THE BRAID!', VW / 2, VH / 2 - 18);
      ctx.font = '14px system-ui';
      ctx.fillStyle = '#f3ead6';
      ctx.fillText(timer.toFixed(1) + 's' + (best < timer ? '   (best ' + best.toFixed(1) + 's)' : '   new best!'), VW / 2, VH / 2 + 10);
      ctx.fillStyle = '#b8ab92';
      ctx.fillText('SPACE - a deeper maze', VW / 2, VH / 2 + 38);
    }
  }

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

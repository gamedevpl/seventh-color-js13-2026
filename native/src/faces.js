import { poly, ellipse, line, circle, withTransform } from './draw.js';

// Six faces, no more (design rule 5). Shared eye/mouth helpers so blink and
// talk animation is written once - each face is just its own silhouette
// polygons plus a call into the shared bits, not a second implementation.

function blink(t, phase) {
  return Math.floor((t + phase) * 3) % 22 === 0;
}
function eyes(cx1, cx2, cy, r, color, t, phase) {
  if (blink(t, phase)) {
    line(cx1 - r, cy, cx1 + r, cy, { stroke: color, lineWidth: 2 });
    line(cx2 - r, cy, cx2 + r, cy, { stroke: color, lineWidth: 2 });
  } else {
    circle(cx1, cy, r, { fill: color });
    circle(cx2, cy, r, { fill: color });
  }
}
function mouth(cx, cy, w, closedH, openH, color, talking, t) {
  const open = talking && Math.floor(t * 8) % 2 === 0;
  ellipse(cx, cy, w, open ? openH : closedH, { fill: color });
}

const HUMAN_HEAD = [0, -40, 22, -30, 26, 10, 14, 34, -14, 34, -26, 10, -22, -30];

function paintDarkness(t, talking) {
  poly([0, -46, 30, -18, 26, 30, -26, 30, -30, -18], { fill: '#8f3037', stroke: '#1a0d0f', lineWidth: 3 });
  poly([-14, -40, -22, -70, -6, -44], { fill: '#b79557' });
  poly([14, -40, 22, -70, 6, -44], { fill: '#b79557' });
  eyes(-9, 9, -6, 3, '#1a0d0f', t, 3);
  mouth(0, 14, 9, 2, 5, '#1a0d0f', talking, t);
}

function paintJack(t, talking) {
  poly(HUMAN_HEAD, { fill: '#d8b89b', stroke: '#2a1810', lineWidth: 2 });
  poly([-24, -28, -18, -48, 0, -54, 18, -48, 24, -28, 12, -36, 0, -40, -12, -36], { fill: '#4a3626' });
  eyes(-9, 9, -4, 3, '#241812', t, 1);
  mouth(0, 20, 7, 1.5, 4, '#5a2f26', talking, t);
}

// `variant` blindfolds her. Jack hands her the blindfold in the glade and
// takes it off when the unicorns arrive, so the cloth has to actually be
// on her face in between - a line about a blindfold with no blindfold on
// screen reads as a bug, because it is one.
function paintLili(t, talking, variant) {
  poly(HUMAN_HEAD, { fill: '#e8cdb0', stroke: '#2a1f3a', lineWidth: 2 });
  poly([-22, -30, -30, 10, -22, 48, -14, 10, -22, -6], { fill: '#241d38' });
  poly([22, -30, 30, 10, 22, 48, 14, 10, 22, -6], { fill: '#241d38' });
  poly([-24, -26, -16, -48, 0, -54, 16, -48, 24, -26, 12, -34, 0, -38, -12, -34], { fill: '#241d38' });
  if (variant) {
    poly([-21, -12, 21, -12, 21, 2, -21, 2], { fill: '#8a6f4a', stroke: '#5e4a30', lineWidth: 1 });
    poly([21, -10, 30, -4, 28, 4, 21, 0], { fill: '#7a6142' });
  } else {
    eyes(-9, 9, -4, 3.4, '#241812', t, 2);
  }
  mouth(0, 20, 7, 1.5, 4, '#7a3a44', talking, t);
}

function paintGump(t, talking) {
  poly(HUMAN_HEAD, { fill: '#c7b58b', stroke: '#2a2416', lineWidth: 2 });
  poly([-26, -10, -38, -4, -26, 4], { fill: '#c7b58b', stroke: '#2a2416', lineWidth: 2 });
  poly([26, -10, 38, -4, 26, 4], { fill: '#c7b58b', stroke: '#2a2416', lineWidth: 2 });
  poly([-22, -26, -12, -46, 8, -50, 22, -34, 10, -32, -6, -36], { fill: '#635846' });
  eyes(-9, 9, -6, 2.8, '#241f16', t, 4);
  mouth(0, 18, 6, 1.5, 3.5, '#5a3a26', talking, t);
}

function paintMeg(t, talking) {
  poly([0, -34, 24, -20, 28, 20, 12, 40, -12, 40, -28, 20, -24, -20], { fill: '#7a9b7e', stroke: '#1c2a1e', lineWidth: 2 });
  poly([-20, -28, -30, -50, -8, -36], { fill: '#3a4a3a' });
  poly([20, -28, 30, -50, 8, -36], { fill: '#3a4a3a' });
  poly([-16, -34, 0, -30, 16, -34, 8, -46, -8, -46], { fill: '#3a4a3a' });
  eyes(-10, 10, -6, 3, '#0f160f', t, 5);
  circle(-16, 6, 2, { fill: '#3a4a3a' });
  mouth(0, 22, 10, 1.5, 6, '#1c2a1e', talking, t);
}

function paintUnicorn(t, talking, horned) {
  poly([0, -30, 18, -8, 20, 30, 8, 46, -8, 46, -20, 30, -18, -8], { fill: '#e8e6e0', stroke: '#8a8578', lineWidth: 2 });
  poly([-14, -26, -22, -50, -4, -30], { fill: '#c9c4b6' });
  poly([14, -26, 22, -50, 4, -30], { fill: '#c9c4b6' });
  if (horned) {
    poly([-4, -30, 0, -78, 4, -30], { fill: '#e8c468' });
    for (let i = 0; i < 4; i++) line(-3 + i * 2, -34 - i * 10, 3 - i * 2, -34 - i * 10, { stroke: '#fff0c0', lineWidth: 1 });
  }
  eyes(-11, 11, 0, 3, '#241f18', t, 6);
  ellipse(-5, 32, 2, 3, { fill: '#3a352c' });
  ellipse(5, 32, 2, 3, { fill: '#3a352c' });
}

const PAINTERS = { darkness: paintDarkness, jack: paintJack, lili: paintLili, gump: paintGump, meg: paintMeg, unicorn: paintUnicorn };

export function paintFace(key, x, y, scale, t, talking, variant) {
  withTransform({ x, y, scale }, () => PAINTERS[key](t, talking, variant));
}

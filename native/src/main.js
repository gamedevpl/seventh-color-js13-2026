import { initDraw, clear, rect, circle, text } from './draw.js';
import { SCENES } from './scenes.js';
import { paintFace } from './faces.js';
import { GAMES } from './games.js';
import { BEATS } from './data.js';
import { makeRound, currentBeat, tick, press, moveChoice, P } from './story.js';
import { initAudio, setMusic, sfxTap, sfxYes, sfxNo, sfxWin } from './audio.js';
import { fxUpdate, fxBegin, fxEnd } from './fx.js';

const VW = 320, VH = 156;

const canvas = document.getElementById('c');
canvas.width = VW;
canvas.height = VH;
initDraw(canvas.getContext('2d'));

function resize() {
  const scale = Math.min(innerWidth / VW, innerHeight / VH);
  canvas.style.width = VW * scale + 'px';
  canvas.style.height = VH * scale + 'px';
}
addEventListener('resize', resize);
resize();

let acted = false, left = false, right = false, heldLeft = false, heldRight = false, heldAct = false;
addEventListener('keydown', (e) => {
  if (e.key === ' ' || e.key === 'Enter') { acted = true; heldAct = true; }
  else if (e.key === 'ArrowLeft' || e.key === 'a') { left = heldLeft = true; }
  else if (e.key === 'ArrowRight' || e.key === 'd') { right = heldRight = true; }
});
addEventListener('keyup', (e) => {
  if (e.key === ' ' || e.key === 'Enter') heldAct = false;
  else if (e.key === 'ArrowLeft' || e.key === 'a') heldLeft = false;
  else if (e.key === 'ArrowRight' || e.key === 'd') heldRight = false;
});
canvas.addEventListener('pointerdown', () => { acted = heldAct = true; });
canvas.addEventListener('pointerup', () => { heldAct = false; });

let mode = 'title';
let round = null;
let last = 0;

function box(y, h) { rect(0, y, VW, h, { fill: '#0008' }); }

// The theme, made literal rather than left implicit in a color-restoration
// plot: seven concentric rings, seven colors, the same bloom both at the
// title (a promise) and the ending (the promise kept) - one shared visual
// for both, not two, per the project's running "one thing, not two" rule.
const RAINBOW = ['#c9524f', '#d98a4a', '#d9c14f', '#7cb56a', '#5a9bb0', '#6b7ec9', '#9a6bc4'];
function bloom(cx, cy, t, r0, spread) {
  for (let i = 0; i < RAINBOW.length; i++) {
    circle(cx, cy, r0 + i * spread + Math.sin(t * 1.5 + i) * 1.5, { stroke: RAINBOW[i], lineWidth: 2 });
  }
}

function paintHud(b) {
  if (round.phase === P.GAME) {
    box(126, 30);
    text(b.gamePrompt, 10, 138, { fill: '#cdbfa0', font: '9px system-ui' });
    // The controls belong on screen. A mechanic nobody knows how to drive
    // is indistinguishable from a mechanic that does not work.
    text(GAMES[b.game].hint, 10, 150, { fill: '#7a6e5c', font: '8px system-ui' });
    return null;
  }
  const speak = round.phase === P.SUCCESS ? b.successDialogue[round.line] : b.dialogue[round.line];
  if (round.phase === P.DIALOGUE || round.phase === P.SUCCESS) {
    box(128, 28);
    text(speak.text, 10, 146, { fill: '#f3ead6', font: '9px system-ui' });
    return speak.who;
  }
  if (round.phase === P.CHOICE || round.phase === P.RETRY) {
    box(96, 60);
    if (round.phase === P.RETRY) {
      text(b.choice.retry, 10, 116, { fill: '#e08a7a', font: '9px system-ui' });
      return null;
    }
    text(b.choice.question, 10, 110, { fill: '#f3ead6', font: '9px system-ui' });
    b.choice.options.forEach((o, i) => {
      text((i === round.choiceIndex ? '> ' : '  ') + o, 10, 126 + i * 12, { fill: i === round.choiceIndex ? '#e8b923' : '#c8bfae', font: '9px system-ui' });
    });
    return null;
  }
  return null;
}

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000 || 0);
  last = now;

  const doAct = acted, doLeft = left, doRight = right;
  acted = left = right = false;
  fxUpdate(dt);

  if (mode === 'title') {
    clear(VW, VH, '#0a0710');
    bloom(160, 120, now / 1000, 8, 3);
    text('THE SEVENTH COLOR', VW / 2, 68, { fill: '#e8b923', font: 'bold 16px system-ui', align: 'center' });
    text('tap or press space', VW / 2, 92, { fill: '#a89', font: '9px system-ui', align: 'center' });
    if (doAct) { initAudio(); round = makeRound(BEATS, BEATS[0].id); mode = 'play'; }
  } else {
    const b = currentBeat(round);
    setMusic(b.music);
    const before = round.phase;
    tick(round, dt, { act: doAct, pressLeft: doLeft, pressRight: doRight, heldLeft, heldRight, heldAct });
    if (before === P.GAME && round.phase !== P.GAME) sfxWin();

    // A press that finishes a mechanic must not also advance the story -
    // otherwise the same space bar that lands the last hit eats the whole
    // success line and jumps straight to the next beat.
    const justFinished = before === P.GAME && round.phase !== P.GAME;

    // The cutscene: the scene keeps running, the HUD steps aside, and the
    // player cannot press past it. Held moments are the only thing the
    // story machine does that the player does not drive.
    if (round.phase === P.CUT) {
      fxBegin();
      SCENES[b.bg](round.elapsed);
      for (const f of b.faces) paintFace(f.key, f.x, f.y, f.scale, round.elapsed, false, false);
      const fade = Math.min(1, round.cut * 2) * Math.min(1, (b.cutscene.seconds - round.cut) * 2);
      rect(0, 0, VW, VH, { fill: `rgba(6,4,10,${.55 * fade})` });
      text(b.cutscene.text, VW / 2, 130, { fill: `rgba(243,234,214,${fade})`, font: '10px system-ui', align: 'center' });
      fxEnd();
      requestAnimationFrame(frame);
      return;
    }

    if (round.phase === P.END) {
      SCENES[b.bg](round.elapsed);
      bloom(160, 58, round.elapsed, 12, 5);
      text('THE SEVENTH COLOR', VW / 2, 70, { fill: '#e8b923', font: 'bold 15px system-ui', align: 'center' });
      text('tap or press space', VW / 2, 108, { fill: '#eee', font: '9px system-ui', align: 'center' });
      if (doAct) mode = 'title';
      requestAnimationFrame(frame);
      return;
    }

    fxBegin();
    SCENES[b.bg](round.elapsed);
    const talker = paintHud(b);
    // The horn returns as the mechanic's actual payoff, not a fixed
    // decoration: hornless through this beat's dialogue and its game
    // phase, restored only once that game resolves into SUCCESS. Beats
    // with no game of their own (a later cameo) show it already restored.
    const restored = !b.game || round.phase === P.SUCCESS;
    for (const f of b.faces) paintFace(f.key, f.x, f.y, f.scale, round.elapsed, f.key === talker, f.key === 'unicorn' ? restored : undefined);
    if (round.phase === P.GAME) GAMES[b.game].render(round.g, b, round.elapsed);
    fxEnd();

    if (round.phase === P.CHOICE) {
      if (doLeft) moveChoice(round, -1);
      if (doRight) moveChoice(round, 1);
    }
    if (doAct && !justFinished) {
      const beforePress = round.phase;
      press(round);
      if (beforePress === P.CHOICE) round.phase === P.RETRY ? sfxNo() : sfxYes();
      else if (beforePress === P.DIALOGUE || beforePress === P.SUCCESS || beforePress === P.RETRY) sfxTap();
    }
  }

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

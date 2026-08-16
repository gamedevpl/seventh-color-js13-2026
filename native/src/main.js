import { initDraw, clear, rect, text } from './draw.js';
import { SCENES } from './scenes.js';
import { paintFace } from './faces.js';
import { GAMES } from './games.js';
import { BEATS } from './data.js';
import { makeRound, currentBeat, tick, press, moveChoice, P } from './story.js';

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

let acted = false, left = false, right = false, heldLeft = false, heldRight = false;
addEventListener('keydown', (e) => {
  if (e.key === ' ' || e.key === 'Enter') acted = true;
  else if (e.key === 'ArrowLeft' || e.key === 'a') { left = heldLeft = true; }
  else if (e.key === 'ArrowRight' || e.key === 'd') { right = heldRight = true; }
});
addEventListener('keyup', (e) => {
  if (e.key === 'ArrowLeft' || e.key === 'a') heldLeft = false;
  else if (e.key === 'ArrowRight' || e.key === 'd') heldRight = false;
});
canvas.addEventListener('pointerdown', () => { acted = true; });

let mode = 'title';
let round = null;
let last = 0;

function box(y, h) { rect(0, y, VW, h, { fill: '#0008' }); }

function paintHud(b) {
  if (round.phase === P.GAME) {
    box(128, 28);
    text(b.gamePrompt, 10, 146, { fill: '#cdbfa0', font: '9px system-ui' });
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

  if (mode === 'title') {
    clear(VW, VH, '#0a0710');
    text('THE SEVENTH COLOR', VW / 2, 68, { fill: '#e8b923', font: 'bold 16px system-ui', align: 'center' });
    text('tap or press space', VW / 2, 92, { fill: '#a89', font: '9px system-ui', align: 'center' });
    if (doAct) { round = makeRound(BEATS, BEATS[0].id); mode = 'play'; }
  } else {
    const b = currentBeat(round);
    tick(round, dt, { act: doAct, pressLeft: doLeft, pressRight: doRight, heldLeft, heldRight });

    if (round.phase === P.END) {
      SCENES[b.bg](round.elapsed);
      text('THE SEVENTH COLOR', VW / 2, 70, { fill: '#e8b923', font: 'bold 15px system-ui', align: 'center' });
      text('tap or press space', VW / 2, 92, { fill: '#cba', font: '9px system-ui', align: 'center' });
      if (doAct) mode = 'title';
      requestAnimationFrame(frame);
      return;
    }

    SCENES[b.bg](round.elapsed);
    const talker = paintHud(b);
    for (const f of b.faces) paintFace(f.key, f.x, f.y, f.scale, round.elapsed, f.key === talker, f.key === 'unicorn');
    if (round.phase === P.GAME) GAMES[b.game].render(round.g, b, round.elapsed);

    if (round.phase === P.CHOICE) {
      if (doLeft) moveChoice(round, -1);
      if (doRight) moveChoice(round, 1);
    }
    if (doAct) press(round);
  }

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

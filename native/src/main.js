import { initDraw, clear, rect, text } from './draw.js';
import { SCENES } from './scenes.js';
import { paintFace } from './faces.js';
import { BEATS } from './data.js';
import { makeRound, currentBeat, tick, press } from './story.js';

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

let acted = false;
const act = () => { acted = true; };
addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') act(); });
canvas.addEventListener('pointerdown', act);

let mode = 'title';
let round = null;
let last = 0;

function paintDialogueBox(line) {
  rect(0, 128, VW, 28, { fill: '#0008' });
  text(line, 10, 146, { fill: '#f3ead6', font: '9px system-ui' });
}

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000 || 0);
  last = now;

  const doAct = acted;
  acted = false;

  if (mode === 'title') {
    clear(VW, VH, '#0a0710');
    text('THE SEVENTH COLOR', VW / 2, 68, { fill: '#e8b923', font: 'bold 16px system-ui', align: 'center' });
    text('tap or press space', VW / 2, 92, { fill: '#a89', font: '9px system-ui', align: 'center' });
    if (doAct) { round = makeRound(BEATS, BEATS[0].id); mode = 'play'; }
  } else {
    const b = currentBeat(round);
    tick(round, dt);
    SCENES[b.bg](round.elapsed);
    paintFace(b.face, VW / 2, 62, 1, round.elapsed, true);
    paintDialogueBox(b.dialogue[round.line]);
    if (doAct && press(round)) mode = 'title';
  }

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

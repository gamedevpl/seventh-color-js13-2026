import { initDraw, clear, rect, circle, text, wrap } from './draw.js';
import { SCENES, VEILS, RAINBOW } from './scenes.js';
import { paintFace } from './faces.js';
import { GAMES } from './games.js';
import { BEATS } from './data.js';
import { makeRound, currentBeat, tick, press, moveChoice, finish, cutLength, P } from './story.js';
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

// Dev-only: both Shift keys together jump to the next beat, so the whole
// nineteen-beat story can be walked without solving every puzzle on the
// way. `DEV` is substituted at build time - without --cheats this whole
// block is deleted before a byte of it reaches the zip.
let shiftL = false, shiftR = false, skipLatch = false;
function devSkip() {
  if (mode !== 'play') return;
  const b = currentBeat(round);
  round.g = null;
  round.line = 0;
  round.cut = 0;
  round.choiceIndex = 0;
  // Sitting in P.CUT makes finish() step past the beat instead of into
  // its cutscene, which is what "skip this screen" has to mean.
  round.phase = P.CUT;
  finish(round, b);
}
addEventListener('keydown', (e) => {
  if (DEV) {
    if (e.code === 'ShiftLeft') shiftL = true;
    else if (e.code === 'ShiftRight') shiftR = true;
    if (shiftL && shiftR && !skipLatch) { skipLatch = true; devSkip(); }
  }
  if (e.key === ' ' || e.key === 'Enter') { acted = true; heldAct = true; }
  else if (e.key === 'ArrowLeft' || e.key === 'a') { left = heldLeft = true; }
  else if (e.key === 'ArrowRight' || e.key === 'd') { right = heldRight = true; }
});
addEventListener('keyup', (e) => {
  if (DEV) {
    if (e.code === 'ShiftLeft') shiftL = false;
    else if (e.code === 'ShiftRight') shiftR = false;
    if (!shiftL || !shiftR) skipLatch = false;
  }
  if (e.key === ' ' || e.key === 'Enter') heldAct = false;
  else if (e.key === 'ArrowLeft' || e.key === 'a') heldLeft = false;
  else if (e.key === 'ArrowRight' || e.key === 'd') heldRight = false;
});
canvas.addEventListener('pointerdown', () => { acted = heldAct = true; });
canvas.addEventListener('pointerup', () => { heldAct = false; });

let mode = 'title';
let round = null;
let last = 0;

const FONT = '9px system-ui', NARRATE = '10px system-ui';
function box(y, h) { rect(0, y, VW, h, { fill: '#0008' }); }

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
    const lines = wrap(speak.text, 300, FONT);
    box(126, 30);
    lines.forEach((l, i) => text(l, 10, (lines.length > 1 ? 138 : 145) + i * 11, { fill: '#f3ead6', font: FONT }));
    return speak.who;
  }
  if (round.phase === P.CHOICE || round.phase === P.RETRY) {
    box(96, 60);
    if (round.phase === P.RETRY) {
      wrap(b.choice.retry, 300, FONT).forEach((l, i) => text(l, 10, 112 + i * 11, { fill: '#e08a7a', font: FONT }));
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
    const before = round.phase;
    tick(round, dt, { act: doAct, pressLeft: doLeft, pressRight: doRight, heldLeft, heldRight, heldAct });
    // Read the beat AFTER ticking, never before: tick can end a beat on its
    // own clock - a cutscene running out, a mechanic completing - and a
    // frame that renders the previous beat's data against the new beat's
    // phase is reading a row that no longer applies. Harmless while every
    // beat carried dialogue; a crash the moment one did not.
    const b = currentBeat(round);
    setMusic(b.music);
    if (before === P.GAME && round.phase !== P.GAME) sfxWin();

    // A press that finishes a mechanic must not also advance the story -
    // otherwise the same space bar that lands the last hit eats the whole
    // success line and jumps straight to the next beat.
    const justFinished = before === P.GAME && round.phase !== P.GAME;

    // The cutscene: the scene keeps running, the HUD steps aside, and the
    // player cannot press past it. Held moments are the only thing the
    // story machine does that the player does not drive.
    if (round.phase === P.CUT) {
      const cs = b.cutscene, hold = cs.hold ?? 3.1;
      const i = Math.min(cs.lines.length - 1, Math.floor(round.cut / hold));
      const local = round.cut - i * hold;
      // Each line fades up and down inside its own hold, and the veil gets
      // progress across the whole cutscene so it can arrive rather than loop.
      const fade = Math.min(1, local * 2.2) * Math.min(1, (hold - local) * 2.2);
      const p = round.cut / cutLength(b);
      fxBegin();
      if (cs.fx) VEILS[cs.fx](round.elapsed, p);
      else {
        SCENES[b.bg](round.elapsed);
        for (const f of b.faces) paintFace(f.key, f.x, f.y, f.scale, round.elapsed, false, false);
        rect(0, 0, VW, VH, { fill: `rgba(6,4,10,${.55 * fade})` });
      }
      const lines = wrap(cs.lines[i], 296, NARRATE);
      box(108, 36);
      lines.forEach((l, k) => text(l, VW / 2, (lines.length > 1 ? 122 : 128) + k * 12, { fill: `rgba(243,234,214,${fade})`, font: NARRATE, align: 'center' }));
      if (local > .9) text('>', VW - 12, 150, { fill: '#5f5648', font: '8px system-ui', align: 'center' });
      fxEnd();
      if (doAct) { press(round); sfxTap(); }
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
    // One idea, two faces: the beat's payoff has or has not landed yet.
    // The horn returns on it; the blindfold comes off on it. `blind` names
    // the dialogue line the cloth goes on, so the glade can hand it over
    // mid-scene rather than having her wear it from the first word.
    const restored = !b.game || round.phase === P.SUCCESS;
    for (const f of b.faces) {
      const variant = f.key === 'unicorn' ? restored
        : f.blind != null && round.phase !== P.SUCCESS && (round.phase !== P.DIALOGUE || round.line >= f.blind);
      paintFace(f.key, f.x, f.y, f.scale, round.elapsed, f.key === talker, variant);
    }
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

  if (DEV && mode === 'play') {
    text(`${currentBeat(round).id}  [shift+shift = skip]`, 4, 154, { fill: '#4a8a5a', font: '7px system-ui' });
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

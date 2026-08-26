import { initDraw, ctx, clear, rect, circle, text, wrap } from './draw.js';
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

let acted = false, left = false, right = false, up = false, down = false, heldLeft = false, heldRight = false, heldAct = false;

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
  else if (e.key === 'ArrowUp' || e.key === 'w') up = true;
  else if (e.key === 'ArrowDown' || e.key === 's') down = true;
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
// The title credit is two links. Pointer events arrive in CSS pixels of an
// upscaled canvas, so everything hit-tests in viewport space after dividing
// by the box the canvas actually occupies.
let hotX = -9, hotY = -9, links = [];
function at(e) {
  const r = canvas.getBoundingClientRect();
  return [(e.clientX - r.left) / r.width * VW, (e.clientY - r.top) / r.height * VH];
}
// Only the title screen ever fills `links`, and only the title screen may
// consume a click with one - otherwise a stale box swallows a tap mid-story.
function linkAt(x, y) {
  if (mode !== 'title') return;
  for (const l of links) if (x >= l[0] && x <= l[0] + l[2] && y >= l[1] && y <= l[1] + l[3]) return l[4];
}
canvas.addEventListener('pointermove', (e) => { [hotX, hotY] = at(e); });
canvas.addEventListener('pointerdown', (e) => {
  const [x, y] = at(e);
  // A tap that follows a link must not also start the game underneath it.
  const url = linkAt(x, y);
  // window.open is blocked in sandboxed frames - and a js13k entry spends
  // its life in one, on the compo page or an itch embed. A real anchor
  // click carries the user gesture through where open() does not.
  if (url) document.body.appendChild(Object.assign(document.createElement('a'), { href: url, target: '_blank', rel: 'noopener' })).click();
  else acted = heldAct = true;
});
canvas.addEventListener('pointerup', () => { heldAct = false; });

// Beat changes were hard cuts - Darkness, then instantly a moonlit glade.
// The outgoing frame is snapshotted the moment the beat changes and then
// dissolved over the incoming one, dipping through dark at the midpoint so
// two very different scenes cross without turning to mush.
// Two transitions, because they say different things. A dissolve means
// "a moment later, near where we were". A black card means "time and place
// have moved" - so it is reserved for genuine journeys and carried on the
// arriving beat as data, never inferred. The throne-room run deliberately
// gets no cards: three confrontations in one room should not keep stopping
// to announce themselves.
const TRANS = .5, CARD = 1.9;
const snap = document.createElement('canvas');
snap.width = VW;
snap.height = VH;
const sctx = snap.getContext('2d');
let lastKey = null, trans = 0, transMax = TRANS, card = null;

function cut(key, arriving) {
  if (key === lastKey) return;
  if (lastKey !== null) {
    sctx.clearRect(0, 0, VW, VH);
    sctx.drawImage(canvas, 0, 0);
    card = arriving || null;
    transMax = trans = card ? CARD : TRANS;
  }
  lastKey = key;
}

// Painted over the world layer but UNDER the text: dissolving two lines of
// dialogue through each other reads as a rendering fault, not a
// transition. Subtitles cut, scenery dissolves.
function drawSnap(alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.drawImage(snap, 0, 0);
  ctx.restore();
}

// Advances the transition clock, and draws the cross-dissolve only. Sits
// UNDER the text layer, because two lines of dialogue fading through each
// other reads as a rendering fault rather than a transition.
function dissolve(dt) {
  if (trans <= 0) return;
  trans -= dt;
  if (card) return;
  const p = Math.max(0, trans / transMax);
  rect(0, 0, VW, VH, { fill: `rgba(5,3,9,${Math.sin((1 - p) * Math.PI) * .55})` });
  drawSnap(p);
}

// The card is the opposite case and so is drawn OVER everything: a
// blackout that still shows the dialogue waiting underneath is not a
// blackout. Fade the old scene down, hold the caption, lift into the new
// one - and let the caption ride the blackness rather than its own timer,
// so it can never be caught half-lit over a visible scene.
function cardOverlay() {
  if (!card || trans <= 0) return;
  const a = 1 - Math.max(0, trans / transMax);
  let black = 1;
  if (a < .2) { drawSnap(1); black = a / .2; }
  else if (a > .8) black = (1 - a) / .2;
  rect(0, 0, VW, VH, { fill: `rgba(0,0,0,${black})` });
  const ta = Math.max(0, (black - .55) / .45);
  if (ta <= 0) return;
  text(card[0], VW - 12, 118, { fill: `rgba(232,185,35,${ta})`, font: 'bold 11px system-ui', align: 'right' });
  if (card[1]) text(card[1], VW - 12, 132, { fill: `rgba(168,155,132,${ta * .8})`, font: '8px system-ui', align: 'right' });
}

let mode = 'title';
let round = null;
let last = 0;

const FONT = '9px system-ui', NARRATE = '10px system-ui';
function box(y, h) { rect(0, y, VW, h, { fill: '#0008' }); }

// Author credit: two link runs and the punctuation between them. Painted
// piecewise so each link can own a hit box and light up under the pointer -
// a run with no url is plain text and registers nothing.
const CREDIT = [['@gtanczyk', 'https://x.com/gtanczyk'], [' | ', 0], ['gamedev.pl', 'https://www.gamedev.pl'], [' | 2026', 0]];
function credit(cy, size) {
  const font = size + 'px system-ui';
  ctx.font = font;
  let w = 0;
  for (const p of CREDIT) w += ctx.measureText(p[0]).width;
  let x = (VW - w) / 2, hit = 0;
  links = [];
  for (const p of CREDIT) {
    const pw = ctx.measureText(p[0]).width;
    const on = p[1] && hotX >= x && hotX <= x + pw && hotY >= cy - size && hotY <= cy + 3;
    if (on) hit = 1;
    text(p[0], x, cy, { fill: on ? '#e8b923' : p[1] ? '#8a7f6a' : '#5f5648', font });
    if (on) rect(x, cy + 1.5, pw, .8, { fill: '#e8b923' });
    if (p[1]) links.push([x, cy - size, pw, size + 3, p[1]]);
    x += pw;
  }
  canvas.style.cursor = hit ? 'pointer' : '';
}

function bloom(cx, cy, t, r0, spread) {
  for (let i = 0; i < RAINBOW.length; i++) {
    circle(cx, cy, r0 + i * spread + Math.sin(t * 1.5 + i) * 1.5, { stroke: RAINBOW[i], lineWidth: 2 });
  }
}

function paintHud(b) {
  if (round.phase === P.GAME) {
    box(126, 30);
    text(b.gamePrompt, 10, 136, { fill: '#cdbfa0', font: '9px system-ui' });
    // The controls belong on screen. A mechanic nobody knows how to drive
    // is indistinguishable from a mechanic that does not work.
    text(GAMES[b.game].hint, 10, 146, { fill: '#7a6e5c', font: '8px system-ui' });
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

// Who is talking, decided without drawing, so the portraits can animate a
// mouth on a frame where the HUD has not been painted yet.
function speaker(b) {
  const line = round.phase === P.SUCCESS ? b.successDialogue?.[round.line]
    : round.phase === P.DIALOGUE ? b.dialogue?.[round.line] : null;
  return line?.who;
}

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000 || 0);
  last = now;

  let doAct = acted;
  const doLeft = left, doRight = right, doUp = up, doDown = down;
  acted = left = right = up = down = false;
  fxUpdate(dt);
  // A press during a card skips to the lift, and is swallowed - otherwise
  // the same key also advances the dialogue waiting underneath it.
  if (card && trans > 0 && doAct) {
    trans = Math.min(trans, transMax * .16);
    doAct = false;
  }

  if (mode === 'title') {
    cut('title');
    clear(VW, VH, '#0a0710');
    // The rings reach 28px from their centre, so the whole stack is spaced
    // around that: prompt clears their top, credit clears their bottom.
    bloom(160, 110, now / 1000, 8, 3);
    text('THE SEVENTH COLOR', VW / 2, 54, { fill: '#e8b923', font: 'bold 16px system-ui', align: 'center' });
    text('tap or press space', VW / 2, 76, { fill: '#a89', font: '9px system-ui', align: 'center' });
    credit(150, 8);
    if (doAct) { initAudio(); round = makeRound(BEATS, BEATS[0].id); mode = 'play'; }
    dissolve(dt);
    cardOverlay();
  } else {
    const before = round.phase;
    tick(round, dt, { act: doAct, pressLeft: doLeft, pressRight: doRight, pressUp: doUp, pressDown: doDown, heldLeft, heldRight, heldAct });
    // Read the beat AFTER ticking, never before: tick can end a beat on its
    // own clock - a cutscene running out, a mechanic completing - and a
    // frame that renders the previous beat's data against the new beat's
    // phase is reading a row that no longer applies. Harmless while every
    // beat carried dialogue; a crash the moment one did not.
    const b = currentBeat(round);
    cut(round.phase === P.END ? 'end' : b.id, b.card);
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
      fxEnd();
      dissolve(dt);
      const lines = wrap(cs.lines[i], 296, NARRATE);
      box(108, 36);
      lines.forEach((l, k) => text(l, VW / 2, (lines.length > 1 ? 122 : 128) + k * 12, { fill: `rgba(243,234,214,${fade})`, font: NARRATE, align: 'center' }));
      if (local > .9) text('>', VW - 12, 150, { fill: '#5f5648', font: '8px system-ui', align: 'center' });
      cardOverlay();
      if (doAct) { press(round); sfxTap(); }
      return requestAnimationFrame(frame);
    }

    if (round.phase === P.END) {
      SCENES[b.bg](round.elapsed);
      dissolve(dt);
      bloom(160, 58, round.elapsed, 12, 5);
      text('THE SEVENTH COLOR', VW / 2, 70, { fill: '#e8b923', font: 'bold 15px system-ui', align: 'center' });
      text('tap or press space', VW / 2, 108, { fill: '#eee', font: '9px system-ui', align: 'center' });
      cardOverlay();
      if (doAct) mode = 'title';
      return requestAnimationFrame(frame);
    }

    fxBegin();
    SCENES[b.bg](round.elapsed);
    const talker = speaker(b);
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
    dissolve(dt);
    paintHud(b);
    cardOverlay();

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
    rect(0, 149, 152, 7, { fill: '#000c' });
    text(`${currentBeat(round).id}  [shift+shift = skip]`, 4, 155, { fill: '#4a8a5a', font: '7px system-ui' });
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

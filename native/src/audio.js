// One `tone` primitive for interaction blips, plus a 16-step tracker that
// plays the eight tracks composed for the original GameKit build - ported
// note-for-note rather than re-invented, because the compositions were
// already there and already good.
//
// Notes are packed one char per step: ' ' is a rest, anything else is a
// MIDI number offset by 9 (base 40 keeps every char inside ( .. Z, so no
// quote, backslash or backtick ever lands in a pattern string). Data like
// this is exactly what design rule 7 wants - verbose and repetitive, the
// shape a context-mixing compressor feeds on.

let ctx, noiseBuf, track, trackName, step = 0, next = 0, timer;

export function initAudio() {
  if (ctx) return;
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  noiseBuf = ctx.createBuffer(1, 4096, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < 4096; i++) d[i] = Math.random() * 2 - 1;
  timer = setInterval(pump, 40);
}

function tone(freq, dur, type, gain) {
  if (!ctx) return;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.value = gain;
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
  o.connect(g);
  g.connect(ctx.destination);
  o.start();
  o.stop(ctx.currentTime + dur);
}

export function sfxTap() { tone(420, 0.06, 'square', 0.06); }
export function sfxHit() { tone(920, 0.07, 'square', 0.09); }
export function sfxJump() { tone(280, 0.09, 'triangle', 0.07); }
export function sfxYes() { tone(660, 0.12, 'triangle', 0.12); setTimeout(() => tone(880, 0.16, 'triangle', 0.1), 70); }
export function sfxNo() { tone(150, 0.18, 'sawtooth', 0.1); }
export function sfxWin() { tone(523, 0.1, 'triangle', 0.12); setTimeout(() => tone(659, 0.1, 'triangle', 0.12), 90); setTimeout(() => tone(784, 0.22, 'triangle', 0.14), 180); }

const WAVES = { t: 'triangle', s: 'sine', w: 'sawtooth', q: 'square' };
const MIX = 0.16;

export const TRACKS = {
  shadow: [58, [['t', 0.72, '/  /  - /  2 1  '], ['w', 0.16, '; > A > : = @ = '], ['n', 0.08, 'K     H K    H  ']]],
  wonder: [82, [['s', 0.62, 'S W Z U R U Z W '], ['t', 0.42, ';   8   6   ; 6 '], ['s', 0.2, ' N   P   U   S  ']]],
  winter: [52, [['s', 0.56, 'U   T   P   Q   '], ['t', 0.48, '1     8 9     8 '], ['n', 0.04, '  H       H     ']]],
  trail: [74, [['t', 0.52, 'G N I P K N I G '], ['s', 0.48, ' S  U W  Z  W U '], ['t', 0.32, '/   6   8   4 6 ']]],
  marsh: [66, [['t', 0.62, '/  0 /  + - /   '], ['s', 0.38, ' N Q  O  J M  N '], ['w', 0.12, '; A  <  ; >  :  '], ['n', 0.05, 'K  H    K H   H ']]],
  castle: [64, [['t', 0.58, '-  ( -  0  / )  '], ['s', 0.28, ' L  Q O  T  S L '], ['n', 0.04, 'K   H   K  H    ']]],
  throne: [60, [['w', 0.2, '/ / )  -/  0 .  '], ['t', 0.58, ';  > A  : = @ > '], ['s', 0.24, ' N M  J  Q P  M '], ['n', 0.05, 'K  H  K   H K   ']]],
  pursuit: [104, [['t', 0.62, '/ /*- / /2 1. * '], ['w', 0.16, 'G JN MJ G FIL I '], ['n', 0.07, 'K H KH HK H K HH']]],
};

function voice(char, dur, type, gain, when) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.value = 440 * 2 ** ((char.charCodeAt(0) - 9 - 69) / 12);
  g.gain.setValueAtTime(gain, when);
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  o.connect(g);
  g.connect(ctx.destination);
  o.start(when);
  o.stop(when + dur);
}

function hit(when, gain, high) {
  const s = ctx.createBufferSource(), g = ctx.createGain(), f = ctx.createBiquadFilter();
  s.buffer = noiseBuf;
  f.type = high ? 'highpass' : 'lowpass';
  f.frequency.value = high ? 5200 : 320;
  g.gain.setValueAtTime(gain, when);
  g.gain.exponentialRampToValueAtTime(0.0001, when + 0.14);
  s.connect(f);
  f.connect(g);
  g.connect(ctx.destination);
  s.start(when);
  s.stop(when + 0.16);
}

// Schedules ahead on the audio clock rather than firing notes from a
// timer, so tempo does not wobble with frame or timer jitter.
function pump() {
  if (!ctx || !track) return;
  const spb = 60 / track[0] / 4;
  while (next < ctx.currentTime + 0.18) {
    if (next < ctx.currentTime) next = ctx.currentTime;
    for (const [w, gain, pat] of track[1]) {
      const c = pat[step % pat.length];
      if (c === ' ') continue;
      if (w === 'n') hit(next, gain * MIX, c === 'H');
      else voice(c, spb * 3.4, WAVES[w], gain * MIX, next);
    }
    step++;
    next += spb;
  }
}

// A region keeps playing across its beats - restarting the bar at every
// beat boundary was what made the old per-beat drone feel like a buzzer
// rather than a score.
export function setMusic(name) {
  if (name === trackName) return;
  trackName = name;
  track = TRACKS[name];
  step = 0;
  next = 0;
}

// THE STAMPEDE. A herd game wants a gallop under it: a kick in the gallop
// rhythm (da-da-DUM, the three-beat of hooves), a bass that stays on the
// root until the herd is big enough to earn the fifth, and a lead that
// only arrives once you are a herd worth hearing. Intensity is the size
// of your herd against the plain - the music IS the score meter.
//
// One scheduler running ahead of the clock in short blocks, as in the two
// entries before it; setInterval drifts, and a gallop that drifts against
// legs animated on the same tempo is worse than silence.

export const BPM = 132;
export const STEP = 15 / BPM;             // a sixteenth

let ac = null, master, noise = null, nextT = 0, step = 0, riser = null;
export let beat = 0;

const NOTE = (s) => 110 * 2 ** (s / 12);
const R = -99;
// A minor gallop. Root and fifth, the octave when the herd is big.
const BASS = [0, R, 0, 0, R, 0, 0, R, 0, 0, R, 0, 7, R, 7, 7];
const LEAD = [12, R, 15, R, 19, R, 15, R, 12, R, 10, R, 12, R, R, R,
  17, R, 15, R, 12, R, 15, R, 19, R, 22, R, 19, R, R, R];
// The gallop: three hits then a rest, hooves on turf.
const GALLOP = [1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0];

function env(g, gain, t0, dur) {
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(.001, t0 + dur);
}
function tone(f, dur, type, gain, t0, f2) {
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t0);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
  env(g, gain, t0, dur);
  o.connect(g); g.connect(master);
  o.start(t0); o.stop(t0 + dur);
}
// Filtered noise: hooves, thuds and the boom are all this with a
// different band.
function hit(t0, dur, gain, freq, q) {
  const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  s.buffer = noise; s.loop = true;
  f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
  env(g, gain, t0, dur);
  s.connect(f); f.connect(g); g.connect(master);
  s.start(t0); s.stop(t0 + dur);
}

export function wake() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
  ac = new (window.AudioContext || window.webkitAudioContext)();
  // One shared compressor catches overlapping impacts without flattening quiet play.
  master = ac.createDynamicsCompressor();
  master.threshold.value = -8; master.ratio.value = 12;
  master.connect(ac.destination);
  const n = (ac.sampleRate * .4) | 0;
  noise = ac.createBuffer(1, n, ac.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
}
export const awake = () => !!ac;

// `heat` 0..1 is how much herd you have; `bare` is the title's version -
// just the hooves in the distance and the bass, so the run arrives.
export function music(heat, bare) {
  if (!ac) return;
  if (nextT < ac.currentTime) nextT = ac.currentTime + .05;
  while (nextT < ac.currentTime + .16) {
    const s = step % 32, h = s % 16;
    if (h % 4 === 0) beat = 1;
    if (GALLOP[h]) hit(nextT, .06, bare ? .05 : .09 + heat * .06, h % 4 === 2 ? 180 : 320, 1.5);
    if (!bare && h % 4 === 2) tone(120, .12, 'triangle', .16, nextT, 40);      // the kick, on the DUM
    if (!bare && h % 8 === 6) hit(nextT, .09, .06, 5000, 1);                   // an off-beat hat
    if (BASS[h] !== R) tone(NOTE(BASS[h] - 12), .2, 'square', .05, nextT);
    if (!bare && heat > .35 && LEAD[s] !== R) tone(NOTE(LEAD[s] + 12), .22, 'sawtooth', .01 + heat * .03, nextT);
    nextT += STEP; step++;
  }
}

// --- the noises the game makes -------------------------------------------
const t0 = () => ac.currentTime;
// A unicorn joining: one bell, climbing the pentatonic with the herd.
export function join(n) {
  if (!ac) return;
  tone(NOTE(12 + [0, 2, 4, 7, 9][n % 5] + 12 * ((n / 5) | 0 & 1)), .3, 'triangle', .06, t0());
}
// A horn clash: metal on metal, bright and short.
export function clang() {
  if (!ac) return;
  hit(t0(), .08, .18, 3200, 3); tone(2100, .12, 'square', .03, t0(), 1700);
}
// Someone thrown: a thud and a squeak going away.
export function thud() {
  if (!ac) return;
  hit(t0(), .12, .15, 220, 1.2); tone(900, .25, 'triangle', .04, t0(), 300);
}
// The charge: one riser held as long as the herd folds in. Pitch tracks
// the charge from outside, so releasing early sounds early.
export function rise(k) {
  if (!ac) return;
  if (!riser) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = 'sawtooth'; o.connect(g); g.connect(master);
    g.gain.value = .04; o.start();
    riser = { o, g };
  }
  riser.o.frequency.setTargetAtTime(110 * 2 ** (k * 3), t0(), .05);
  riser.g.gain.setTargetAtTime(.03 + k * .05, t0(), .05);
}
export function riseOff() {
  if (!riser) return;
  riser.g.gain.setTargetAtTime(0, t0(), .04);
  riser.o.stop(t0() + .3);
  riser = null;
}
// The explosion. A sub boom, a wide noise burst, then the rainbow: seven
// notes fanning up, one per colour, because a rainbow must be heard too.
export function boom(pw) {
  if (!ac) return;
  const t = t0(), g = Math.min(1, .5 + pw * .04);
  tone(90, pw >= 62 ? 2 : .8, 'triangle', .5 * g, t, 25);
  if (pw >= 62) { hit(t + .2, 2, .3, 900, .3); tone(180, 1.6, 'sawtooth', .08, t + .1, 35); }
  hit(t, .7, .5 * g, 500, .4);
  hit(t + .05, 1.2, .25 * g, 150, .6);
  [0, 2, 4, 5, 7, 9, 11].forEach((n, i) => tone(NOTE(24 + n), .5, 'triangle', .07, t + .12 + i * .06));
}
// Ignition: the riser resolves. A bright chord fanning up through the
// seven colours, quicker than the explosion's and with no sub under it -
// this is a light coming on, not a blast.
export function ignite() {
  if (!ac) return;
  const t = t0();
  hit(t, .4, .2, 1800, .8);
  [0, 4, 7, 11, 14, 16, 19].forEach((n, i) => tone(NOTE(12 + n), .6, 'triangle', .06, t + i * .04));
}
// A heart lost: a low, sour two-note.
export function ouch() {
  if (!ac) return;
  tone(NOTE(7), .3, 'square', .06, t0()); tone(NOTE(1), .5, 'square', .06, t0() + .18);
}
export const clearBeat = () => { beat = 0; };

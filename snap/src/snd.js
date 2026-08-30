// THE STRUT.
//
// The brief was the swagger of a catwalk vamp, and what carries that is not
// a tune anyone owns - it is the furniture: four on the floor, a clap
// landing on two and four, and a bassline that keeps jumping an octave and
// dropping back. That octave jump is a genre convention older than any
// record built on it. The hook over the top is written for this game.
//
// One scheduler, running ahead of the clock in short blocks, exactly as
// Rainbow Surfer's does - a setInterval sequencer drifts, and audio that
// drifts against an animation locked to the same tempo is worse than no
// music at all.

export const BPM = 116;
// Sixteenths. The animation reads this too, so the unicorn struts in time
// with the track rather than merely near it.
export const STEP = 15 / BPM;

let ac = null, noise = null, nextT = 0, step = 0;
export let beat = 0;            // fires on the downbeat, for things that pulse

const NOTE = (s) => 110 * 2 ** (s / 12);
const REST = -99;

// A funk strut in A minor: root, its octave, the fifth and the flat seven,
// syncopated so the bar never sits still.
const BASS = [0, 0, 12, 0, 7, 0, 10, 7, 0, 0, 12, 0, 3, 5, 7, 10];
// The hook - sparse on purpose. A busy lead over a strut fights the groove;
// what a catwalk wants is a phrase that struts in, stops, and struts back.
const HOOK = [
  12, REST, REST, 15, REST, 17, REST, REST, 19, REST, 17, REST, 15, REST, REST, REST,
  10, REST, REST, 12, REST, 15, REST, REST, 17, REST, 15, REST, 12, REST, REST, REST,
];

function env(g, gain, t0, dur) {
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(.001, t0 + dur);
}

function tone(f, dur, type, gain, t0, dest) {
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type;
  o.frequency.value = f;
  env(g, gain, t0, dur);
  o.connect(g); g.connect(dest || ac.destination);
  o.start(t0); o.stop(t0 + dur);
}

function kick(t0, gain) {
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = 'triangle';
  o.frequency.setValueAtTime(155, t0);
  o.frequency.exponentialRampToValueAtTime(44, t0 + .11);
  env(g, gain, t0, .16);
  o.connect(g); g.connect(ac.destination);
  o.start(t0); o.stop(t0 + .17);
}

// Filtered noise, which is what separates a clap and a hat from two beeps.
// One buffer of white noise, band-passed differently per hit - claps low and
// broad, hats high and tight, the shutter somewhere between.
function hit(t0, dur, gain, freq, q) {
  const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  s.buffer = noise;
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = q;
  env(g, gain, t0, dur);
  s.connect(f); f.connect(g); g.connect(ac.destination);
  s.start(t0); s.stop(t0 + dur);
}

// A browser makes no sound until the page has had a real user gesture, so
// this is called from the first press and from nowhere else.
export function wake() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
  ac = new (window.AudioContext || window.webkitAudioContext)();
  const n = (ac.sampleRate * .35) | 0;
  noise = ac.createBuffer(1, n, ac.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
}

export const awake = () => !!ac;

// `bare` is the title/menu version: the bassline and nothing else. A fourth
// of the track, so the full thing still lands as an arrival when the shoot
// starts.
export function music(intensity, bare) {
  if (!ac) return;
  if (nextT < ac.currentTime) nextT = ac.currentTime + .05;
  while (nextT < ac.currentTime + .16) {
    const s = step % 32, h = s % 16;
    if (s % 4 === 0) { if (!bare) kick(nextT, .17); beat = 1; }
    // Two and four. A strut without a backbeat is just a bassline.
    if (!bare && s % 8 === 4) hit(nextT, .13, .12, 1400, 1.1);
    if (!bare && s % 2 === 1) hit(nextT, .035, .035 + intensity * .02, 9000, 2.2);
    if (s % 2 === 0) tone(NOTE(BASS[h >> 1]), .17, 'square', .055, nextT);
    // The hook ENTERS rather than merely getting louder. Gated at .15 it
    // played under everything and only changed volume, which the ear reads
    // as a mix wobble rather than as the track arriving - and which an
    // oscillator count exposes immediately as no change at all.
    if (!bare && intensity > .5) {
      const n = HOOK[s];
      if (n !== REST) tone(NOTE(n + 12), .19, 'sawtooth', .012 + intensity * .028, nextT);
    }
    nextT += STEP;
    step++;
  }
}

// --- the noises the game itself makes -------------------------------------
// A real shutter is two events, not one - the mirror and then the blades -
// and the pair is what the ear recognises as a camera rather than a click.
export function shutter() {
  if (!ac) return;
  const t = ac.currentTime;
  hit(t, .035, .3, 2600, .8);
  hit(t + .055, .05, .22, 1700, .9);
}

// Glitter: a scatter of little bells, deliberately not in tune with each
// other, because the sound of a handful of something is many small events.
export function sparkle(n = 7) {
  if (!ac) return;
  const t = ac.currentTime;
  for (let i = 0; i < n; i++) {
    tone(1400 + Math.random() * 2600, .18 + Math.random() * .2, 'triangle',
      .05, t + Math.random() * .22);
  }
}

// The unicorn approving of itself: a short rising two-note flourish.
export function pleased() {
  if (!ac) return;
  const t = ac.currentTime;
  tone(NOTE(12), .12, 'triangle', .07, t);
  tone(NOTE(19), .14, 'triangle', .07, t + .09);
  tone(NOTE(24), .22, 'triangle', .06, t + .18);
}

export const clearBeat = () => { beat = 0; };

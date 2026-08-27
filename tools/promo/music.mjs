// The promo soundtrack IS the game's soundtrack. This renders the exact
// sequencer from strands/src/main.js - same BASS and LEAD tables, same kick,
// same hat, same voices at the same gains - through an OfflineAudioContext,
// arranged along the film's timeline instead of the run's telemetry: the
// intro plays the bare bass line, the montage brings in the full groove, the
// catch fires the seven-note rainbow arpeggio, the surf rides the lead an
// octave up, and the ending strips back down to the bass the film opened on.
// A touch of stereo (the game is mono) and a soft master compressor are the
// only liberties taken.
//
// usage: node tools/promo/music.mjs <out.wav> [timeline.json]

import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const out = process.argv[2] || '/tmp/promo/music.wav';
const spec = process.argv[3]
  ? JSON.parse(readFileSync(process.argv[3], 'utf8'))
  : {
    // Default: a 60s arc. t0/t1 in seconds; the sequencer walks through the
    // segments with the game's own speed-dependent step clock.
    dur: 60,
    fadeIn: .8,
    fadeOut: 3,
    segments: [
      { t0: 0, t1: 9.5, speedN: 0, closeN: 0, dry: 1, bare: 1 },              // the bare title/intro motif
      { t0: 9.5, t1: 19, speedN: .55, closeN: 0, dry: 0, bare: 0 },           // the groove arrives
      { t0: 19, t1: 27, speedN: .75, closeN: .35, dry: 0, bare: 0 },          // chase builds, lead creeps in
      { t0: 27, t1: 33, speedN: .8, closeN: .55, dry: 0, bare: 0 },           // the jump
      { t0: 33, t1: 46, speedN: .9, closeN: 1, dry: 0, bare: 0, rainbow: 1 }, // caught: lead an octave up
      { t0: 46, t1: 60, speedN: 0, closeN: 0, dry: 1, bare: 1 },              // bracketed by the same figure
    ],
    events: [
      { t: 33.2, kind: 'catch' },     // 392*2^(i/7) - becoming the rainbow
      { t: 46.5, kind: 'fanfare' },   // 523*2^(i/7) - the end-of-line best
    ],
  };

const browser = await chromium.launch();
const page = await browser.newPage();
const b64 = await page.evaluate(async (spec) => {
  const sr = 44100;
  const off = new OfflineAudioContext(2, Math.ceil(sr * spec.dur), sr);
  const master = off.createGain();
  const comp = off.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 5;
  comp.attack.value = .004;
  comp.release.value = .18;
  master.connect(comp);
  comp.connect(off.destination);
  master.gain.setValueAtTime(0, 0);
  master.gain.linearRampToValueAtTime(1, spec.fadeIn || .5);
  master.gain.setValueAtTime(1, spec.dur - (spec.fadeOut || 2));
  master.gain.linearRampToValueAtTime(0, spec.dur);

  const NOTE = (s) => 110 * 2 ** (s / 12);
  const BASS = [0, 0, 12, 0, 3, 3, 15, 3, 5, 5, 17, 5, 7, 7, 10, 3];
  const LEAD = [24, 22, 19, 17, 15, 17, 19, 22, 12, 15, 17, 19, 22, 24, 27, 24,
    19, 17, 15, 12, 10, 12, 15, 17, 19, 17, 15, 12, 15, 19, 22, 24];

  function tone(f, dur, type, gain, t0, pan) {
    const o = off.createOscillator(), g = off.createGain();
    o.type = type;
    o.frequency.value = f;
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(.001, t0 + dur);
    o.connect(g);
    if (pan) {
      const p = off.createStereoPanner();
      p.pan.value = pan;
      g.connect(p); p.connect(master);
    } else g.connect(master);
    o.start(t0);
    o.stop(t0 + dur);
  }
  function kick(t0) {
    const o = off.createOscillator(), g = off.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(150, t0);
    o.frequency.exponentialRampToValueAtTime(44, t0 + .12);
    g.gain.setValueAtTime(.17, t0);
    g.gain.exponentialRampToValueAtTime(.001, t0 + .15);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + .16);
  }

  // The run's pump(), unrolled over the film instead of over frames.
  let t = 0, step = 0;
  while (t < spec.dur) {
    const seg = spec.segments.find((g) => t >= g.t0 && t < g.t1) || spec.segments[spec.segments.length - 1];
    const { speedN, closeN, dry, bare, rainbow } = seg;
    const s = step % 32;
    if (s % 4 === 0 && !bare) kick(t);
    if (s % 4 === 2 && !bare) tone(6200, .03, 'square', (.012 + speedN * .035) * (dry ? .25 : 1), t, .25);
    if (s % 2 === 0 && !seg.silent) tone(NOTE(BASS[(s >> 1) % 16]), .16, 'square', .05, t);
    if (speedN > .2 && !dry) tone(NOTE(BASS[s % 16] + 12), .06, 'sawtooth', .015 + speedN * .03, t, -.2);
    if (dry && s % 8 === 0 && !bare) tone(58, .34, 'sine', .12, t);
    if (closeN > .02) tone(NOTE(LEAD[s]), .2, 'triangle', .02 + closeN * .08, t, Math.sin(step * .4) * .3);
    if (rainbow) tone(NOTE(LEAD[s] + 12), .18, 'triangle', .05, t, Math.sin(step * .4) * -.3);
    t += 15 / (116 + speedN * 52);
    step++;
  }
  for (const ev of spec.events || []) {
    if (ev.kind === 'catch') for (let i = 0; i < 7; i++) tone(392 * 2 ** (i / 7), .35, 'triangle', .1, ev.t + i * .07, (i / 6 - .5) * .6);
    if (ev.kind === 'fanfare') for (let i = 0; i < 7; i++) tone(523 * 2 ** (i / 7), .5, 'triangle', .09, ev.t + i * .1, (i / 6 - .5) * .4);
  }

  const buf = await off.startRendering();
  const L = buf.getChannelData(0), R = buf.getChannelData(1);
  const pcm = new Int16Array(L.length * 2);
  for (let i = 0; i < L.length; i++) {
    pcm[i * 2] = Math.max(-32768, Math.min(32767, L[i] * 32767));
    pcm[i * 2 + 1] = Math.max(-32768, Math.min(32767, R[i] * 32767));
  }
  const bytes = new Uint8Array(pcm.buffer);
  const hdr = new ArrayBuffer(44);
  const v = new DataView(hdr);
  const w4 = (o, s) => { for (let i = 0; i < 4; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w4(0, 'RIFF'); v.setUint32(4, 36 + bytes.length, true); w4(8, 'WAVE');
  w4(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * 4, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true);
  w4(36, 'data'); v.setUint32(40, bytes.length, true);
  const all = new Uint8Array(44 + bytes.length);
  all.set(new Uint8Array(hdr), 0);
  all.set(bytes, 44);
  let b = '';
  const CH = 0x8000;
  for (let i = 0; i < all.length; i += CH) b += String.fromCharCode.apply(null, all.subarray(i, i + CH));
  return btoa(b);
}, spec);
await browser.close();
writeFileSync(out, Buffer.from(b64, 'base64'));
console.log('music ->', out);

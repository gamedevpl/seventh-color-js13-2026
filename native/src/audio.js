// No music tracker, no note-sequence player - a three-oscillator drone
// (cheap, atmospheric, always-on) plus a handful of short envelope blips
// for interaction feedback. Both are variations on one primitive (tone),
// not two separate systems - design rule 2 applied to audio the same way
// it was applied to the story machine and the mechanics.

let ctx, drone = [];

export function initAudio() {
  if (ctx) return;
  ctx = new (window.AudioContext || window.webkitAudioContext)();
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
export function sfxYes() { tone(660, 0.12, 'triangle', 0.12); setTimeout(() => tone(880, 0.16, 'triangle', 0.1), 70); }
export function sfxNo() { tone(150, 0.18, 'sawtooth', 0.1); }
export function sfxWin() { tone(523, 0.1, 'triangle', 0.12); setTimeout(() => tone(659, 0.1, 'triangle', 0.12), 90); setTimeout(() => tone(784, 0.22, 'triangle', 0.14), 180); }

export function setDrone(baseFreq) {
  if (!ctx) return;
  drone.forEach((n) => { try { n.stop ? n.stop() : n.disconnect(); } catch (e) {} });
  drone = [];
  for (const mult of [1, 1.5, 2.01]) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = baseFreq * mult;
    g.gain.value = 0.018;
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    drone.push(o, g);
  }
}

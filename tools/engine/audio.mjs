// WAV synth for sound effects (bit-identical to shared/audio/sounds.json's
// renderer, but rendering straight into an AudioBuffer — no WAV header, no
// base64, no decodeAudioData round trip) plus a compact tracker player for
// the game's own music.json tracks. Both patch and track data are embedded
// by the build (see bundleMicroEngine in tools/pull.mjs) as SOUND_PATCHES
// and MUSIC_TRACKS — this file only holds the players.

const NOTE_OFFSETS = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5,
  'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
};

function noteFrequency(token) {
  const match = /^([A-G](?:#|b)?)(-?\d+)$/.exec(token || '');
  if (!match) return null;
  const offset = NOTE_OFFSETS[match[1]];
  if (offset === undefined) return null;
  const midi = (Number(match[2]) + 1) * 12 + offset;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function oscValue(wave, phase) {
  if (wave === 'sine') return Math.sin(phase);
  if (wave === 'square') return Math.sin(phase) >= 0 ? 1 : -1;
  if (wave === 'triangle') return (2 / Math.PI) * Math.asin(Math.sin(phase));
  if (wave === 'saw') return 2 * (phase / (Math.PI * 2) - Math.floor(phase / (Math.PI * 2) + 0.5));
  return 0;
}

/** Same envelope and noise seeding as tools/audio.ts, rendering direct to Float32. */
function renderSound(context, definition) {
  const rate = definition.sampleRate || context.sampleRate;
  const frameCount = Math.ceil(definition.duration * rate);
  const buffer = context.createBuffer(1, frameCount, rate);
  const samples = buffer.getChannelData(0);
  let noiseState = (definition.s >>> 0) || 1;

  for (const voice of definition.voices) {
    let phase = 0;
    const delay = voice.delay || 0;
    const voiceDuration = Math.max(0.001, definition.duration - delay);
    for (let frame = 0; frame < frameCount; frame++) {
      const time = frame / rate - delay;
      if (time < 0 || time >= voiceDuration) continue;
      const progress = time / voiceDuration;
      const frequency = voice.from + (voice.to - voice.from) * progress;
      let value;
      if (voice.wave === 'noise') {
        noiseState = Math.imul(noiseState ^ (noiseState >>> 15), 1 | noiseState);
        noiseState ^= noiseState + Math.imul(noiseState ^ (noiseState >>> 7), 61 | noiseState);
        value = ((noiseState ^ (noiseState >>> 14)) >>> 0) / 2147483648 - 1;
      } else {
        phase += (Math.PI * 2 * frequency) / rate;
        value = oscValue(voice.wave, phase);
      }
      const attack = voice.attack || 0;
      const release = voice.release || 0;
      const envelope = (attack > 0 ? Math.min(1, time / attack) : 1) * (release > 0 ? Math.min(1, (voiceDuration - time) / release) : 1);
      samples[frame] += value * voice.gain * envelope;
    }
  }
  let peak = 0;
  for (let i = 0; i < frameCount; i++) peak = Math.max(peak, Math.abs(samples[i]));
  if (peak > 0.92) {
    const scale = 0.92 / peak;
    for (let i = 0; i < frameCount; i++) samples[i] *= scale;
  }
  return buffer;
}

export function createAudio(patches, tracks, options) {
  const masterVolume = Math.max(0, Math.min(1, (options && options.volume) ?? 0.72));
  let context = null;
  const buffers = new Map();
  let muted = false;
  let musicName = null;
  let session = null;

  function ensureContext() {
    if (muted) return null;
    if (!context) context = new (window.AudioContext || window.webkitAudioContext)();
    if (context.state === 'suspended') context.resume().catch(() => {});
    return context;
  }

  function bufferFor(name) {
    if (buffers.has(name)) return buffers.get(name);
    const ctx = ensureContext();
    if (!ctx || !patches[name]) return null;
    const buffer = renderSound(ctx, patches[name]);
    buffers.set(name, buffer);
    return buffer;
  }

  function play(name, opts) {
    if (muted || !patches[name]) return;
    const ctx = ensureContext();
    const buffer = ctx && bufferFor(name);
    if (!ctx || !buffer) return;
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    source.buffer = buffer;
    source.playbackRate.value = (opts && opts.rate) || 1;
    gain.gain.value = masterVolume * ((opts && opts.volume) ?? 1);
    source.connect(gain);
    gain.connect(ctx.destination);
    source.start();
  }

  function scheduleNote(ctx, gainNode, channel, token, when, stepSeconds) {
    if (!token) return;
    const channelGain = Math.max(0, Math.min(1, channel.gain ?? 1));
    const outputGain = masterVolume * channelGain * 0.55;
    if (outputGain <= 0) return;

    if (channel.wave === 'noise' || token === 'K' || token === 'H') {
      const duration = token === 'K' ? Math.min(0.12, stepSeconds * 0.9) : Math.min(0.05, stepSeconds * 0.55);
      const frameCount = Math.max(1, Math.floor(duration * ctx.sampleRate));
      const buffer = ctx.createBuffer(1, frameCount, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < frameCount; i++) {
        const envelope = 1 - i / frameCount;
        data[i] = (Math.random() * 2 - 1) * envelope * envelope;
      }
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      source.buffer = buffer;
      gain.gain.setValueAtTime(outputGain * (token === 'K' ? 0.9 : 0.45), when);
      gain.gain.exponentialRampToValueAtTime(0.001, when + duration);
      source.connect(gain);
      gain.connect(gainNode);
      source.start(when);
      source.stop(when + duration + 0.02);
      return;
    }

    const frequency = noteFrequency(token);
    if (!frequency) return;
    const duration = Math.min(stepSeconds * 0.92, 0.45);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = channel.wave === 'saw' ? 'sawtooth' : channel.wave;
    osc.frequency.setValueAtTime(frequency, when);
    gain.gain.setValueAtTime(0.001, when);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.001, outputGain), when + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, when + duration);
    osc.connect(gain);
    gain.connect(gainNode);
    osc.start(when);
    osc.stop(when + duration + 0.03);
  }

  function stopMusic() {
    if (session) {
      clearInterval(session.timer);
      const now = context ? context.currentTime : 0;
      session.gain.gain.setTargetAtTime(0, now, 0.08);
    }
    session = null;
    musicName = null;
  }

  function playMusic(name) {
    const trackName = name || musicName;
    const track = tracks[trackName];
    if (!track || muted) return;
    stopMusic();
    musicName = trackName;
    const ctx = ensureContext();
    if (!ctx) return;
    const gainNode = ctx.createGain();
    gainNode.gain.value = track.gain ?? 0.2;
    gainNode.connect(ctx.destination);
    const stepSeconds = 60 / track.bpm / 4;
    let step = 0;
    let nextTime = ctx.currentTime + 0.05;
    const scheduleAhead = 0.28;
    const timer = setInterval(() => {
      while (nextTime < ctx.currentTime + scheduleAhead) {
        for (const channel of track.channels) {
          scheduleNote(ctx, gainNode, channel, channel.pattern[step % channel.pattern.length], nextTime, stepSeconds);
        }
        nextTime += stepSeconds;
        step++;
      }
    }, 40);
    session = { timer, gain: gainNode };
  }

  const button = document.getElementById('sound-toggle');
  function renderControl() {
    if (!button) return;
    button.textContent = muted ? 'Sound: Off' : 'Sound: On';
    button.setAttribute('aria-pressed', String(muted));
  }
  function setMuted(next) {
    const changed = muted !== Boolean(next);
    muted = Boolean(next);
    renderControl();
    if (!changed) return;
    if (muted) { stopMusic(); if (context) context.suspend(); }
    else { ensureContext(); play('ui-toggle'); if (musicName) playMusic(musicName); }
  }
  function toggleMuted() { setMuted(!muted); }
  if (button) button.addEventListener('click', toggleMuted);
  window.addEventListener('keydown', (event) => {
    if (event.key.toLowerCase() === 'm' && !event.repeat) toggleMuted();
    ensureContext();
  });
  window.addEventListener('pointerdown', () => ensureContext());
  renderControl();

  return { play, playMusic, stopMusic, get muted() { return muted; } };
}

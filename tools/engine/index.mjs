// Entry point: composes the renderer/input/audio/loop pieces and assigns the
// small remaining GameKit surface this game's reachable code touches.
// SOUND_PATCHES and MUSIC_TRACKS are injected as literals by bundleMicroEngine
// in tools/pull.mjs — this file references them as free variables so the data
// and the players that consume it live in one bundle with no import seam.

import { createRenderer } from './renderer.mjs';
import { createInput } from './input.mjs';
import { createAudio as createAudioPlayer } from './audio.mjs';
import { defineGame } from './loop.mjs';

// Layout-only signal (dialogue panel sizing) — genuinely device-capability
// based, unlike the always-on DOM touch controls in input.mjs.
const wantsTouchControls = () => typeof matchMedia === 'function' && matchMedia('(any-pointer: coarse)').matches;

function createAudio(options) {
  return createAudioPlayer(SOUND_PATCHES, MUSIC_TRACKS, options);
}

function t(value) {
  if (typeof value === 'string') return value;
  return (value && value.en) || '';
}

window.GameKit = {
  defineGame: () => defineGame({ createRenderer, createInput, createAudio }),
  createSave: () => ({ ready: Promise.resolve(), data: null, put() {}, flush() {} }),
  clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
  copyText: (value) => (navigator.clipboard ? navigator.clipboard.writeText(value).then(() => true, () => false) : Promise.resolve(false)),
  t,
  wantsTouchControls,
  progress: () => {},
};

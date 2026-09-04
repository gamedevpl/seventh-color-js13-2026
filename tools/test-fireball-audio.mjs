// Deterministic four-second stress mix; no speakers or microphone needed.
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const src = readFileSync('fireball/src/snd.js', 'utf8').replace(/export /g, '');
  const result = await page.evaluate(async src => {
    const ctx = new OfflineAudioContext(1, 44100 * 4, 44100);
    window.AudioContext = function () { return ctx; };
    let seed = 1;
    Math.random = () => (seed = Math.imul(seed, 1664525) + 1013904223 >>> 0) / 4294967296;
    new Function(src + ';wake();music(1,0);boom(72);ignite();for(let i=0;i<8;i++)clang();')();
    const buffer = await ctx.startRendering(), d = buffer.getChannelData(0);
    let peak = 0, clipped = 0, sum = 0;
    for (const x of d) { peak = Math.max(peak, Math.abs(x)); clipped += Math.abs(x) > 1; sum += x * x; }
    return { peak, clipped, percent: 100 * clipped / d.length, rms: Math.sqrt(sum / d.length) };
  }, src);
  assert.equal(result.clipped, 0, 'overlapping battle sounds must not exceed full scale');
  assert.ok(result.peak > .1, 'the mixer must remain audible');
  console.log('PASS offline battle mix', JSON.stringify(result));
} finally { await browser.close(); }

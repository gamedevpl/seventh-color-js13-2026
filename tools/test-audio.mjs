// Is there actually sound on the title screen? Counting oscillators is the
// only way to know from here - "pump is called" is not the same as "the
// browser made a noise", because a suspended AudioContext swallows it all.
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inflateRawSync } from 'node:zlib';
import { chromium } from 'playwright-core';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const a = readFileSync(path.join(root, 'build', 'strands', 'index.zip'));
const nl = a.readUInt16LE(26), el = a.readUInt16LE(28);
const m = a.readUInt16LE(8), c = a.readUInt32LE(18);
const body = a.subarray(30 + nl + el, 30 + nl + el + c);
const stage = mkdtempSync(path.join(tmpdir(), 'js13k-audio-'));
const f = path.join(stage, 'index.html');
writeFileSync(f, m === 0 ? body : inflateRawSync(body));

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--autoplay-policy=user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 900, height: 640 } });
await page.addInitScript(() => {
  window.__osc = 0; window.__state = [];
  const O = AudioContext.prototype.createOscillator;
  AudioContext.prototype.createOscillator = function () { window.__osc++; window.__state.push(this.state); return O.call(this); };
});
await page.goto(pathToFileURL(f).href, { waitUntil: 'load' });
await page.waitForTimeout(1500);
const before = await page.evaluate(() => window.__osc);
console.log(`title, no gesture yet:      ${before} oscillators   (must be 0 - nothing may sound)`);
await page.keyboard.press('Space');
await page.waitForTimeout(2600);                 // still on the title, playing
const during = await page.evaluate(() => window.__osc);
const states = await page.evaluate(() => [...new Set(window.__state)]);
console.log(`title, after one press:      ${during} oscillators   context state seen: ${states.join(', ') || 'none'}`);
await page.waitForTimeout(2500);
const more = await page.evaluate(() => window.__osc);
console.log(`title, still sitting there:  ${more} oscillators   (it must keep playing, not stop)`);
await browser.close();
const ok = before === 0 && during > 8 && more > during && states.includes('running');
console.log(ok ? '\nOK: the title screen makes sound, and only after the gesture'
  : `\nFAIL: before=${before} during=${during} later=${more} states=${states.join(',')}`);
process.exit(ok ? 0 : 1);

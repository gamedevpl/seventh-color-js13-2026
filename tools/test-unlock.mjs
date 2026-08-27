// Is the audio context created INSIDE the touch that is supposed to unlock
// it? A phone will not start audio otherwise, and this is invisible to
// every other probe: desktop Chromium keeps a gesture "sticky" for seconds
// afterwards, so a context built in the next animation frame still starts
// running there and looks fine. iOS does not. The check is therefore not
// "does it play" but "was it built while the touch was being dispatched",
// which is the property iOS actually enforces.
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inflateRawSync } from 'node:zlib';
import { chromium } from 'playwright-core';

const args = process.argv.slice(2);
const game = args.find((a) => /^--game=/.test(a))?.split('=')[1] || 'native';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const a = readFileSync(path.join(root, 'build', game, 'index.zip'));
const nl = a.readUInt16LE(26), el = a.readUInt16LE(28);
const method = a.readUInt16LE(8), comp = a.readUInt32LE(18);
const stage = mkdtempSync(path.join(tmpdir(), 'js13k-unlock-'));
const p0 = path.join(stage, 'index.html');
writeFileSync(p0, method === 0 ? a.subarray(30+nl+el, 30+nl+el+comp) : inflateRawSync(a.subarray(30+nl+el, 30+nl+el+comp)));

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 375, height: 667 }, hasTouch: true, isMobile: true });
// Record, at construction time, whether a touch was mid-dispatch.
await page.addInitScript(() => {
  const C = window.AudioContext;
  window.__builtInGesture = null;
  window.__gesture = false;
  window.AudioContext = function (...a) {
    if (window.__builtInGesture === null) window.__builtInGesture = window.__gesture;
    return new C(...a);
  };
});
await page.goto(pathToFileURL(p0).href, { waitUntil: 'load' });
await page.waitForTimeout(800);

const tap = (id) => page.evaluate((id) => {
  const cs = document.querySelectorAll('canvas');
  const el = cs[cs.length - 1];
  const b = el.getBoundingClientRect();
  const x = b.left + b.width * .5, y = b.top + b.height * .5;
  window.__gesture = true;                       // the touch is being dispatched
  for (const t of ['pointerdown', 'pointerup'])
    el.dispatchEvent(new PointerEvent(t, { pointerId: id, bubbles: true, clientX: x, clientY: y }));
  window.__gesture = false;                      // ...and is over
}, id);

const fails = [];
const check = (n, ok, d) => { console.log(`${ok?'ok  ':'FAIL'}  ${n}${d?'   '+d:''}`); if(!ok) fails.push(n); };

await tap(1); await page.waitForTimeout(1500);
await tap(2); await page.waitForTimeout(1500);
await tap(3); await page.waitForTimeout(1500);

const r = await page.evaluate(() => window.__builtInGesture);
check('the audio context is built inside the touch that unlocks it',
  r === true, r === null ? 'no context was ever built' : `built in gesture: ${r}`);
await browser.close();
console.log(fails.length ? `\n${fails.length} FAILED - a phone will stay silent` : '\nthe sound unlocks on a phone');
process.exit(fails.length ? 1 : 0);

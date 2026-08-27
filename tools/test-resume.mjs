// The scenario nobody tested: switch away from the game on a phone and come
// back. iOS suspends the AudioContext and does NOT resume it on its own -
// so if the game only ever CREATES the context on first gesture, the music
// is dead for the rest of the session. Simulated here by suspending the
// real context the game made, then tapping the way a returning player does.
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
const stage = mkdtempSync(path.join(tmpdir(), 'js13k-resume-'));
const p0 = path.join(stage, 'index.html');
writeFileSync(p0, method === 0 ? a.subarray(30+nl+el, 30+nl+el+comp) : inflateRawSync(a.subarray(30+nl+el, 30+nl+el+comp)));
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 375, height: 667 }, hasTouch: true, isMobile: true });
// Capture the context the game builds, and count oscillators, before load.
await page.addInitScript(() => {
  const C = window.AudioContext;
  window.__osc = 0;
  window.AudioContext = function (...a) {
    const c = new C(...a);
    window.__ac = c;
    const co = c.createOscillator.bind(c);
    c.createOscillator = () => { window.__osc++; return co(); };
    return c;
  };
});
await page.goto(pathToFileURL(p0).href, { waitUntil: 'load' });
await page.waitForTimeout(600);
const tap = async (id) => {
  const r = await page.evaluate(() => {
    const c = document.querySelectorAll('canvas'); const b = c[c.length-1].getBoundingClientRect();
    return [b.left + b.width * .5, b.top + b.height * .1];
  });
  for (const t of ['pointerdown', 'pointerup']) await page.evaluate(([t, id, x, y]) => {
    const c = document.querySelectorAll('canvas');
    c[c.length-1].dispatchEvent(new PointerEvent(t, { pointerId: id, bubbles: true, clientX: x, clientY: y }));
  }, [t, id, r[0], r[1]]);
};
await tap(1); await page.waitForTimeout(1200);   // wakes the title, creates the context
const made = await page.evaluate(() => !!window.__ac && window.__ac.state);
console.log(`context after the first tap: ${made}`);

// Now: the player switches apps. iOS suspends it.
await page.evaluate(() => window.__ac.suspend());
await page.waitForTimeout(300);
const suspended = await page.evaluate(() => window.__ac.state);
await page.evaluate(() => { window.__osc = 0; });

// ...and comes back, tapping to carry on playing.
await tap(2); await page.waitForTimeout(400);
await tap(3); await page.waitForTimeout(1600);
const after = await page.evaluate(() => ({ state: window.__ac.state, osc: window.__osc }));
console.log(`after backgrounding:         ${suspended}`);
console.log(`after tapping to come back:  ${after.state}   ${after.osc} oscillators since`);
await browser.close();
const ok = after.state === 'running';
console.log(ok ? '\nOK: the music survives coming back' : '\nFAIL: the context stays suspended - audio is dead for the rest of the session');
process.exit(ok ? 0 : 1);

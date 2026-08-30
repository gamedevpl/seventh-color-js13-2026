// Is there actually sound, and is there silence where the browser demands
// it?
//
// "music() was called" is not the same claim as "the browser made a noise":
// a suspended AudioContext swallows the lot in perfect silence, and a page
// that creates its context before any user gesture gets suspended exactly
// that way. So this patches createOscillator and createBufferSource before
// the page boots and counts what the running game actually asks for.
//
// Zero before the gesture is as much a requirement as a healthy rate after
// it - a game that tries to play music on load is a game that plays no
// music at all on the load that matters.
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'build', 'snap', 'index.html');

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--autoplay-policy=document-user-activation-required'] });
const page = await browser.newPage({ viewport: { width: 480, height: 320 } });
page.on('pageerror', (e) => { console.error('PAGE ERROR:', e.message); process.exitCode = 1; });

await page.addInitScript(() => {
  window.__osc = 0;
  window.__buf = 0;
  window.__ctx = null;
  const P = window.AudioContext.prototype;
  const o = P.createOscillator, b = P.createBufferSource;
  P.createOscillator = function () { window.__osc++; window.__ctx = this; return o.call(this); };
  P.createBufferSource = function () { window.__buf++; window.__ctx = this; return b.call(this); };
});

const read = () => page.evaluate(() => ({ osc: window.__osc, buf: window.__buf, state: window.__ctx && window.__ctx.state }));
const rate = async (ms) => {
  const a = await read();
  await page.waitForTimeout(ms);
  const b = await read();
  return [(b.osc - a.osc) / (ms / 1000), (b.buf - a.buf) / (ms / 1000), b.state];
};

await page.goto(pathToFileURL(file).href, { waitUntil: 'load' });
await page.waitForTimeout(900);

let bad = 0;
const check = (name, ok, detail) => {
  if (!ok) bad++;
  console.log(`  ${name.padEnd(38)} ${detail.padStart(16)}  ${ok ? 'ok' : 'FAIL'}`);
};

const before = await read();
check('silent before any gesture', before.osc === 0 && before.buf === 0,
  `${before.osc} osc, ${before.buf} noise`);
check('no context before any gesture', !before.state, String(before.state));

// The styling bench runs the bare version - the bassline and nothing else -
// so that the full track ARRIVES when the shoot starts. That arrival is a
// musical event, and an event that is only a volume change is not one.
await page.getByRole('button', { name: 'MANE' }).click();
await page.waitForTimeout(500);
const [o1, b1, s1] = await rate(2000);
check('context running after a press', s1 === 'running', String(s1));
// The bassline is every other sixteenth at 116 bpm: 3.87 a second.
check('the bench plays the bassline', o1 > 3, `${o1.toFixed(1)}/s`);
check('the bench has no drums', b1 < .5, `${b1.toFixed(1)}/s`);

await page.getByRole('button', { name: 'START THE SHOOT' }).click();
await page.waitForTimeout(500);
const [o2, b2] = await rate(2000);
check('the shoot brings the kit in', b2 > 3, `${b1.toFixed(1)} -> ${b2.toFixed(1)}/s`);
check('the shoot brings the hook in', o2 > o1 * 1.3, `${o1.toFixed(1)} -> ${o2.toFixed(1)}/s`);

await browser.close();
console.log('');
if (bad) { console.error(`  ${bad} audio check(s) failed`); process.exit(1); }
console.log('  the track plays, and only after a gesture');

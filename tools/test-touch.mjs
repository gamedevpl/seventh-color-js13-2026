// Does the game actually play by touch? Keyboard input is easy to verify by
// accident; touch is not, and "it has pointer handlers" is not the same as
// "you can steer with a thumb". This drives the real page with synthetic
// pointer events - including two fingers at once, which is the whole point
// of the scheme - and reads the result back off the DEV probe.
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inflateRawSync } from 'node:zlib';
import { chromium } from 'playwright-core';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const a = readFileSync(path.join(root, 'build', 'strands', 'index.zip'));
const nl = a.readUInt16LE(26), el = a.readUInt16LE(28);
const method = a.readUInt16LE(8), comp = a.readUInt32LE(18);
const body = a.subarray(30 + nl + el, 30 + nl + el + comp);
const stage = mkdtempSync(path.join(tmpdir(), 'js13k-touch-'));
const page0 = path.join(stage, 'index.html');
writeFileSync(page0, method === 0 ? body : inflateRawSync(body));

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 900, height: 640 }, hasTouch: true });
await page.goto(pathToFileURL(page0).href, { waitUntil: 'load' });
await page.waitForTimeout(600);

// fx/fy are fractions of the HUD, so this speaks in the same terms the
// player does: "a thumb on the left half", not a pixel.
const send = (type, id, fx, fy) => page.evaluate(([type, id, fx, fy]) => {
  const c = document.querySelectorAll('canvas')[1];
  const r = c.getBoundingClientRect();
  c.dispatchEvent(new PointerEvent(type, {
    pointerId: id, bubbles: true,
    clientX: r.left + r.width * fx, clientY: r.top + r.height * fy,
  }));
}, [type, id, fx, fy]);

const st = async () => page.evaluate(() => {
  const a = window.__st; const r = a && a[a.length - 1];
  return r ? { speed: r[1], lane: r[7] } : null;
});

const fails = [];
const check = (name, ok, detail) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? '   ' + detail : ''}`);
  if (!ok) fails.push(name);
};

// tap the top strip: that is the SPACE key, so it must start the run
await send('pointerdown', 1, .5, .1); await send('pointerup', 1, .5, .1);
await page.waitForTimeout(300);
await page.evaluate(() => { window.__st = []; });
await page.waitForTimeout(5200);                 // sit through the intro
if (!(await st())) {
  // Bail cleanly rather than throwing ten lines later on a null: this probe
  // reads the DEV telemetry, which a shipping build does not carry.
  console.log('FAIL  a tap starts the run   no probe data - build with --cheats first');
  await browser.close();
  process.exit(1);
}
check('a tap starts the run', true);

// Steering is checked against the KEYBOARD rather than against a sign I
// guessed at. Which way "left" moves the lane value is an internal
// convention - twice already this project has had it backwards - so the
// property worth asserting is that a thumb does what the arrow key does.
const settle = async () => { await page.waitForTimeout(1100); };
const holdKey = async (k) => {
  await page.keyboard.down(k); await page.waitForTimeout(1300);
  const v = (await st()).lane; await page.keyboard.up(k); await settle();
  return v;
};
const holdTouch = async (id, fx) => {
  await send('pointerdown', id, fx, .7); await page.waitForTimeout(1300);
  const v = (await st()).lane; await send('pointerup', id, fx, .7); await settle();
  return v;
};
const kL = await holdKey('ArrowLeft'), tLv = await holdTouch(2, .2);
const kR = await holdKey('ArrowRight'), tRv = await holdTouch(3, .8);
check('left half matches ArrowLeft', Math.sign(tLv) === Math.sign(kL) && Math.abs(tLv) > .1,
  `key ${kL.toFixed(2)}  touch ${tLv.toFixed(2)}`);
check('right half matches ArrowRight', Math.sign(tRv) === Math.sign(kR) && Math.abs(tRv) > .1,
  `key ${kR.toFixed(2)}  touch ${tRv.toFixed(2)}`);
check('the two sides disagree', Math.sign(tLv) !== Math.sign(tRv), `${tLv.toFixed(2)} vs ${tRv.toFixed(2)}`);

// both halves at once = boost
const before = (await st()).speed;
await send('pointerdown', 4, .2, .7);
await send('pointerdown', 5, .8, .7);
await page.waitForTimeout(1800);
const both = await st();
await send('pointerup', 4, .2, .7);
await send('pointerup', 5, .8, .7);
check('both halves boost', both.speed > before + 2, `${before.toFixed(1)} -> ${both.speed.toFixed(1)}`);
// ...and two fingers must NOT also steer, or the boost drags you off line
check('boosting does not steer', Math.abs(both.lane) < .5, `lane ${both.lane.toFixed(2)}`);

await browser.close();
console.log(fails.length ? `\n${fails.length} FAILED` : '\ntouch is playable');
process.exit(fails.length ? 1 : 0);

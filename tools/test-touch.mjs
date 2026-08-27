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

// The title takes two presses: the first wakes the sound and STAYS, the
// second leaves. Assert both halves of that, because "nothing happened"
// on the first press is exactly what a bug would look like too.
await send('pointerdown', 1, .5, .1); await send('pointerup', 1, .5, .1);
await page.waitForTimeout(2000);
await page.evaluate(() => { window.__st = []; });
await page.waitForTimeout(1200);
check('one tap wakes the title but does not leave it',
  (await page.evaluate(() => (window.__st || []).length)) === 0);

await send('pointerdown', 1, .5, .1); await send('pointerup', 1, .5, .1);
await page.waitForTimeout(300);
await page.evaluate(() => { window.__st = []; });
await page.waitForTimeout(5400);                 // sit through the intro
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
// A fall resets the lane to zero and a jump freezes it, so a sample taken
// across either is not a measurement of steering at all - it reads 0.00 and
// makes the comparison meaningless. Retry until the hold produces a real
// deflection rather than trusting whatever the first window happened to
// catch.
const retry = async (take) => {
  for (let i = 0; i < 4; i++) {
    const v = await take();
    if (Math.abs(v) > .12) return v;
  }
  return 0;
};
const holdKey = (k) => retry(async () => {
  await page.keyboard.down(k); await page.waitForTimeout(1300);
  const v = (await st()).lane; await page.keyboard.up(k); await settle();
  return v;
});
const holdTouch = (id, fx) => retry(async () => {
  await send('pointerdown', id, fx, .7); await page.waitForTimeout(1300);
  const v = (await st()).lane; await send('pointerup', id, fx, .7); await settle();
  return v;
});
const kL = await holdKey('ArrowLeft'), tLv = await holdTouch(2, .2);
const kR = await holdKey('ArrowRight'), tRv = await holdTouch(3, .8);
check('left half matches ArrowLeft', Math.sign(tLv) === Math.sign(kL) && Math.abs(tLv) > .1,
  `key ${kL.toFixed(2)}  touch ${tLv.toFixed(2)}`);
check('right half matches ArrowRight', Math.sign(tRv) === Math.sign(kR) && Math.abs(tRv) > .1,
  `key ${kR.toFixed(2)}  touch ${tRv.toFixed(2)}`);
check('the two sides disagree', Math.sign(tLv) !== Math.sign(tRv), `${tLv.toFixed(2)} vs ${tRv.toFixed(2)}`);

// both halves at once = boost (the old chord survives as an alias)
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

// The top strip is the throttle - and because it is its own zone, a thumb
// can steer WHILE boosting, which the two-thumb chord never allowed.
await page.waitForTimeout(1100);
const calm = (await st()).speed;
await send('pointerdown', 6, .5, .1);
await page.waitForTimeout(1800);
const topB = await st();
await send('pointerup', 6, .5, .1);
check('top strip boosts', topB.speed > calm + 2, `${calm.toFixed(1)} -> ${topB.speed.toFixed(1)}`);

// Peak-tracking hold: under boost a steering hold can end in a fall (lane
// resets to zero) or a jump (lane freezes), so sample DURING the hold and
// keep the largest deflection rather than trusting the endpoint.
const holdPeak = async (id, fx, fy, ms) => {
  await send('pointerdown', id, fx, fy);
  let lane = 0, speed = 0;
  for (let t = 0; t < ms; t += 200) {
    await page.waitForTimeout(200);
    const s = await st();
    if (Math.abs(s.lane) > Math.abs(lane)) lane = s.lane;
    speed = Math.max(speed, s.speed);
  }
  await send('pointerup', id, fx, fy);
  await settle();
  return { lane, speed };
};

// A top corner is boost-and-turn on one thumb: the strip's outer quarters
// steer their side while the throttle stays open.
await settle();
const cornerBase = (await st()).speed;
const corner = await holdPeak(9, .95, .1, 1600);
check('a top corner steers its side',
  Math.sign(corner.lane) === Math.sign(kR) && Math.abs(corner.lane) > .1, `lane ${corner.lane.toFixed(2)}`);
check('...while it boosts', corner.speed > cornerBase + 2,
  `${cornerBase.toFixed(1)} -> ${corner.speed.toFixed(1)}`);

// ...and a thumb below the strip steers under a middle-of-strip boost.
await send('pointerdown', 6, .5, .1);
let sb = { lane: 0 };
for (let i = 0; i < 3 && Math.abs(sb.lane) < .12; i++) sb = await holdPeak(7, .2, .7, 1500);
await send('pointerup', 6, .5, .1);
check('steering works under a top-strip boost',
  Math.sign(sb.lane) === Math.sign(kL) && Math.abs(sb.lane) > .1, `lane ${sb.lane.toFixed(2)}`);

// The low middle band is the jump. For steering it is dead ground - a press
// that arms a kicker must not also pull the line.
await settle();
await send('pointerdown', 8, .5, .7);
await page.waitForTimeout(1300);
const band = await st();
await send('pointerup', 8, .5, .7);
check('the jump band does not steer', Math.abs(band.lane) < .12, `lane ${band.lane.toFixed(2)}`);

await browser.close();
console.log(fails.length ? `\n${fails.length} FAILED` : '\ntouch is playable');
process.exit(fails.length ? 1 : 0);

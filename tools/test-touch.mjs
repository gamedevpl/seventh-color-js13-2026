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
  return r ? { speed: r[1], energy: r[2], lane: r[7], steer: r[13] } : null;
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

// Peak-tracking hold, over any number of fingers. Two properties of the
// live run make an endpoint sample lie, and both bit this probe before
// they were handled: under boost a steering hold can end in a fall (which
// resets the lane to zero) or a jump (which freezes it), so DEFLECTION is
// sampled during the hold and kept at its peak; and `lane` is a carried
// value, not an input, so a "does not steer" claim has to be about
// movement AWAY from where the press started, never about the absolute
// number a previous hold left behind. `drift` is that delta.
const holdPeak = async (pts, ms) => {
  for (const [id, fx, fy] of pts) await send('pointerdown', id, fx, fy);
  const from = (await st()).lane;
  let lane = 0, drift = 0, speed = 0, dust = 0, steer = 0;
  for (let t = 0; t < ms; t += 200) {
    await page.waitForTimeout(200);
    const s = await st();
    if (Math.abs(s.lane) > Math.abs(lane)) lane = s.lane;
    if (Math.abs(s.lane - from) > Math.abs(drift)) drift = s.lane - from;
    speed = Math.max(speed, s.speed);
    dust = Math.max(dust, s.energy);
    if (Math.abs(s.steer) > Math.abs(steer)) steer = s.steer;
  }
  for (const [id, fx, fy] of pts) await send('pointerup', id, fx, fy);
  await settle();
  return { lane, drift, speed, dust, steer };
};

// Boost exists only while there is stardust to burn (canBoost in main.js)
// and this probe boosts repeatedly, so EVERY boost claim goes through
// here: retry until a hold catches a tank with dust in it. Without it the
// assertion reads "this zone does not boost" when what actually happened
// is "there was nothing to boost with" - which is how a dry tank failed
// three different zones across three runs of an unchanged game.
const boostHold = async (pts) => {
  let last;
  for (let i = 0; i < 5; i++) {
    const base = await st();
    last = await holdPeak(pts, 1600);
    if (last.speed > base.speed + 2 || last.dust > 5) return { base: base.speed, ...last, dry: false };
    await page.waitForTimeout(1500);          // let the run gather dust
  }
  return { base: 0, ...last, dry: true };
};
const boosted = (r) => !r.dry && r.speed > r.base + 2;
const boostDetail = (r) => r.dry ? 'never caught a tank with dust' : `${r.base.toFixed(1)} -> ${r.speed.toFixed(1)}`;

// both halves at once = boost (the old chord survives as an alias)
const both = await boostHold([[4, .2, .7], [5, .8, .7]]);
check('both halves boost', boosted(both), boostDetail(both));
// ...and two fingers must NOT also steer, or the boost drags you off line.
// Asserted on the steering INPUT the game reads, because the lane moves
// on its own: bends throw the player outward (a = v x turn rate), so both
// an absolute lane and a drift-from-press measure the track, not the
// thumbs - each read as a failure here on a game that was steering
// correctly.
check('boosting does not steer', both.steer === 0, `steer ${both.steer}`);

// The top strip is the throttle - and because it is its own zone, a thumb
// can steer WHILE boosting, which the two-thumb chord never allowed.
const topB = await boostHold([[6, .5, .1]]);
check('top strip boosts', boosted(topB), boostDetail(topB));

// A top corner is boost-and-turn on one thumb: the strip's outer quarters
// steer their side while the throttle stays open.
const corner = await boostHold([[9, .95, .1]]);
check('a top corner steers its side',
  Math.sign(corner.lane) === Math.sign(kR) && Math.abs(corner.lane) > .1, `lane ${corner.lane.toFixed(2)}`);
check('...while it boosts', boosted(corner), boostDetail(corner));

// ...and a thumb below the strip steers under a middle-of-strip boost.
await send('pointerdown', 6, .5, .1);
let sb = { lane: 0 };
for (let i = 0; i < 3 && Math.abs(sb.lane) < .12; i++) sb = await holdPeak([[7, .2, .7]], 1500);
await send('pointerup', 6, .5, .1);
check('steering works under a top-strip boost',
  Math.sign(sb.lane) === Math.sign(kL) && Math.abs(sb.lane) > .1, `lane ${sb.lane.toFixed(2)}`);

// The low middle band is the jump. For steering it is dead ground - a press
// that arms a kicker must not also pull the line - asserted on the input,
// for the same reason the chord above is.
await settle();
const band = await holdPeak([[8, .5, .7]], 1300);
check('the jump band does not steer', band.steer === 0, `steer ${band.steer}`);

await browser.close();
console.log(fails.length ? `\n${fails.length} FAILED` : '\ntouch is playable');
process.exit(fails.length ? 1 : 0);

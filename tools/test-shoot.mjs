// The loop, end to end: take a job, shoot six frames, get a result, and
// reach the end of a season.
//
// The reason this is a probe and not a click-through by hand is that almost
// every failure here is silent. A phase that never advances, a shutter that
// fires with no film left, a photograph that captures an already-cleared
// buffer and comes back black - none of those throw, and all of them look
// approximately like a working game until you read the numbers.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { requireDevBuild } from './lib/require-dev.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'build', 'snap', 'index.html');
const out = process.argv[2];
if (out) mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 900, height: 620 } });
page.on('pageerror', (e) => { console.error('PAGE ERROR:', e.message); process.exitCode = 1; });

await requireDevBuild(page, browser, file, pathToFileURL);
await page.goto(pathToFileURL(file).href, { waitUntil: 'load' });
await page.waitForTimeout(700);
if (out) await page.screenshot({ path: path.join(out, '0-title.png') });
// The game opens on its title now, so every probe has to walk in through
// the front door like a player does.
await page.getByRole('button', { name: 'OPEN THE STUDIO' }).click();
await page.waitForTimeout(350);

const probe = () => page.evaluate(() => window.SNAP);
const shot = () => page.evaluate(() => window.SNAPSHOT());
let bad = 0;
const check = (name, ok, detail) => {
  if (!ok) bad++;
  console.log(`  ${name.padEnd(42)} ${String(detail).padStart(16)}  ${ok ? 'ok' : 'FAIL'}`);
};

const s0 = await probe();
check('starts on the styling bench', s0.phase === 0, `phase ${s0.phase}`);
if (out) await page.screenshot({ path: path.join(out, '1-style.png') });

// Style it for the job before shooting, so the result screen has brief
// lines on it as well as photo lines.
// The bench buttons are pictures now, not words - a player who cannot read
// yet was being asked to pick between MANE and HORN - so they are found by
// the title that names them rather than by their label.
await page.locator('[title=COAT]').click();
await page.locator('button[data-i="6"]').click();
await page.locator('[title=GLITTER]').click();
await page.locator('[title=GLITTER]').click();

await page.getByRole('button', { name: 'START THE SHOOT' }).click();
await page.waitForTimeout(400);
const s1 = await probe();
check('the shoot starts with a full roll', s1.phase === 1 && s1.film === 8, `film ${s1.film}`);

// THE THREE THINGS A WHEEL EVENT MEANS ON A MAC, told apart. A pinch is a
// wheel with ctrlKey; a two-finger drag is small pixel deltas on both axes;
// a mouse wheel is a big notch on one. All three reached the same handler
// and only one of them worked - pinch did nothing at all on a laptop, and
// two-finger panning did nothing after that was fixed.
const wheel = (d) => page.evaluate((o) => dispatchEvent(new WheelEvent('wheel', { ...o, cancelable: true })), d);
const cam = async () => (await probe()).cam;

const c0 = await cam();
await wheel({ deltaY: -12, ctrlKey: true });
await wheel({ deltaY: -12, ctrlKey: true });
await wheel({ deltaY: -12, ctrlKey: true });
await wheel({ deltaY: -12, ctrlKey: true });
await wheel({ deltaY: -12, ctrlKey: true });
await wheel({ deltaY: -12, ctrlKey: true });
const c1 = await cam();
check('a trackpad pinch zooms in', c1[2] < c0[2] - .03, `${c0[2].toFixed(2)} -> ${c1[2].toFixed(2)}`);

await wheel({ deltaX: 40, deltaY: 6 });
const c2 = await cam();
check('a two-finger drag turns the camera', Math.abs(c2[0] - c1[0]) > .01 && Math.abs(c2[2] - c1[2]) < 1e-9,
  `${(c2[0] - c1[0]).toFixed(3)} rad, lens held`);

await wheel({ deltaY: 120 });
const c3 = await cam();
check('and a mouse wheel still zooms out', c3[2] > c2[2] + .05, `${c2[2].toFixed(2)} -> ${c3[2].toFixed(2)}`);
// The other side of the scrolling fix: while the camera is live it must
// still swallow the wheel, or the page scrolls under the viewfinder.
check('the camera takes the wheel while shooting', await page.evaluate(() =>
  !document.querySelector('canvas').dispatchEvent(
    new WheelEvent('wheel', { deltaY: 90, bubbles: true, cancelable: true }))), 'wheel handled');

// A frozen unicorn would make this meaningless - the whole point of the
// shoot is that the pose changes under the shutter.
const seen = new Set();
for (let i = 0; i < 60; i++) {
  seen.add((await probe()).pose);
  await page.waitForTimeout(120);
}
check('it works the set on its own', seen.size >= 3, `${seen.size} poses`);

// THE VERDICT BEFORE THE SHUTTER. The gallery tells a player at the end of
// a job what they needed to know during it; the same sentence on the
// viewfinder is the lesson while there is still something to do about it.
const said = () => page.evaluate(() => [...document.querySelectorAll('div')]
  .filter((d) => !d.children.length && /^[\u{1F44D}\u{1F44E}] \S/u.test(d.textContent))
  .map((d) => d.textContent)[0] || '');
check('the viewfinder says what it thinks', /\S/.test(await said()), await said());

// A running total that climbs as the roll fills. It is eased toward the
// real figure, so the probe waits for it to arrive rather than reading the
// frame the shutter fired on.
const chip = () => page.evaluate(() => [...document.querySelectorAll('div')]
  .filter((d) => !d.children.length && /^\d+$/.test(d.textContent)).map((d) => +d.textContent)[0]);
const t0 = await chip();
await page.keyboard.press('Space');
await page.waitForTimeout(900);
const t1 = await chip();
check('the score climbs while you shoot', t1 > t0, `${t0} -> ${t1}`);

// Score the current frame directly, so a bad number is caught here rather
// than being averaged into a total later.
const sc = await shot();
check('a frame scores something', sc.total > 0 && sc.parts.length > 0, `${sc.total} pts`);
check('the score is itemised', sc.parts.every((p) => p[1] > 0), `${sc.parts.length} lines`);

for (let i = 0; i < 7; i++) {
  await page.keyboard.press('Space');
  await page.waitForTimeout(260);
}
await page.waitForTimeout(1100);
const s2 = await probe();
check('a spent roll ends the job', s2.phase === 2 && s2.film === 0, `phase ${s2.phase}`);
check('the job scored', s2.seasonPts > 0, `${s2.seasonPts} pts`);

// The photograph has to be a photograph. preserveDrawingBuffer keeps the
// frame only until the next clear, so a capture taken from an input handler
// grabs a stale or empty buffer and comes back as a black rectangle.
const img = await page.evaluate(() => {
  const i = document.querySelector('img');
  return i ? { src: i.src.slice(0, 24), len: i.src.length } : null;
});
check('it kept an actual photograph', img && img.len > 4000, img ? `${(img.len / 1024) | 0} KB` : 'none');

// Every frame is on the screen with its own verdict under it. The screen
// this replaced showed one photograph large and the rest as thumbnails you
// tapped to swap in, so seven eighths of a roll were postage stamps and the
// sentence you were reading belonged to whichever one was selected.
const feed = await page.evaluate(() => ({
  shots: document.querySelectorAll('img').length,
  // The caption, not the wrapper around it: both carry the same
  // textContent, so count only the element that actually holds the words -
  // and only the ones on screen, or the viewfinder's own live verdict,
  // hidden behind the result card, counts as a ninth photograph.
  said: [...document.querySelectorAll('div')]
    .filter((d) => d.offsetParent && !d.children.length && /^[\u{1F44D}\u{1F44E}] \S/u.test(d.textContent)).length,
}));
check('every frame is in the feed', feed.shots === 8, `${feed.shots} photographs`);
check('and every one says why', feed.said === 8, `${feed.said} verdicts`);
const season = await page.evaluate(() => [...document.querySelectorAll('div')]
  .map((d) => d.textContent).find((t) => /^season \d/.test(t)));
check('the running season total is on it', !!season, season || 'none');

// The feed has to SCROLL. The camera takes every wheel event on the page,
// and a card taller than the screen that refuses to move is what that costs
// if the handler does not stand aside - reported from a trackpad, where the
// feed was simply stuck. Asserted as the handler's own behaviour rather than
// through a scroll position, because a synthetic wheel event does not move a
// real scroller.
const eaten = (sel) => page.evaluate((s) => {
  const t = document.querySelector(s);
  return !t.dispatchEvent(new WheelEvent('wheel', { deltaY: 90, bubbles: true, cancelable: true }));
}, sel);
check('the feed scrolls on a trackpad', !(await eaten('img')), 'wheel left alone');

if (out) {
  await page.screenshot({ path: path.join(out, '2-result.png') });
  const data = await page.evaluate(() => document.querySelector('img').src);
  writeFileSync(path.join(out, '3-photo.jpg'), Buffer.from(data.split(',')[1], 'base64'));
}

// Round the season out.
for (let r = 0; r < 2; r++) {
  await page.getByRole('button', { name: 'NEXT JOB' }).click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'START THE SHOOT' }).click();
  await page.waitForTimeout(300);
  for (let i = 0; i < 8; i++) { await page.keyboard.press('Space'); await page.waitForTimeout(180); }
  await page.waitForTimeout(1000);
}
const s3 = await probe();
check('three jobs make a season', s3.phase === 3 || s3.round === 2, `phase ${s3.phase} round ${s3.round}`);
if (out) await page.screenshot({ path: path.join(out, '4-season.png') });

await browser.close();
console.log('');
if (bad) { console.error(`  ${bad} check(s) failed`); process.exit(1); }
console.log('  the loop closes');

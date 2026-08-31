// The phone tests. Every one of these was reported from an iPhone by two
// players in one sitting, and every one is invisible on a desktop.
//
// The one that cost real film: composing a shot took photographs by itself.
// A pinch ends with two fingers leaving the glass one after the other, and
// the old tap test asked only "is one pointer left, and was the shared drag
// counter small" - which is true for the second lift of every pinch. So the
// probe pinches, lets go, and insists the film is untouched.
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { requireDevBuild } from './lib/require-dev.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'build', 'snap', 'index.html');

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
// An iPhone, near enough: a small screen at 3x with a coarse pointer.
const page = await browser.newPage({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 3,
  hasTouch: true, isMobile: true,
});
page.on('pageerror', (e) => { console.error('PAGE ERROR:', e.message); process.exitCode = 1; });

let bad = 0;
const check = (name, ok, detail) => {
  if (!ok) bad++;
  console.log(`  ${name.padEnd(44)} ${String(detail).padStart(14)}  ${ok ? 'ok' : 'FAIL'}`);
};

// The page itself, before a line of it runs. A build with no viewport meta
// is laid out at 980 pixels and scaled down, which is the whole reason the
// controls read as too small to hit and the page could be pinch-zoomed.
const html = readFileSync(file, 'utf8');
check('the page declares a viewport', /name=viewport[^>]*width=device-width/.test(html), 'meta');
check('and refuses to be zoomed', /user-scalable=no/.test(html) && /touch-action:none/.test(html), 'locked');
check('and carries no motion sensor', !/deviceorientation/i.test(html), 'gone');

await requireDevBuild(page, browser, file, pathToFileURL);
await page.goto(pathToFileURL(file).href, { waitUntil: 'load' });
await page.waitForTimeout(600);
await page.getByRole('button', { name: 'OPEN THE STUDIO' }).click();
await page.waitForTimeout(500);

// The bench. It used to stand square to the camera and wait - a styling
// screen that never turns hides half of what the player just painted, the
// tail above all.
//
// But THE POSES ARE THE SURPRISE: a unicorn that rears and tosses its mane
// while you are still choosing colours has spent the best thing the shoot
// has to offer before the shoot starts. So the bench has to be alive and
// unspectacular at once, and both halves are read off the same window.
const SHOWY = [5, 6, 7, 9, 10];
const a = await page.evaluate(() => [SNAP.cam[3], SNAP.sub[0], SNAP.sub[1]]);
const seen = new Set();
// Ninety samples, not sixty: a pose holds for about two and a half
// seconds, so a twelve-second window is five picks and "how many different
// poses" is a question about a handful of dice rolls. The same
// small-sample trap that had test-temper tuning a constant against noise.
for (let i = 0; i < 90; i++) {
  seen.add(await page.evaluate(() => SNAP.pose));
  await page.waitForTimeout(200);
}
const b = await page.evaluate(() => [SNAP.cam[3], SNAP.sub[0], SNAP.sub[1]]);
const showy = [...seen].filter((p) => SHOWY.includes(p));
check('the bench camera goes round it', Math.abs(b[0] - a[0]) > .3, (b[0] - a[0]).toFixed(2) + ' rad');
check('and the unicorn is alive on it', seen.size > 1, `${seen.size} poses`);
check('but keeps the showy ones back', !showy.length, showy.length ? `posed ${showy}` : 'mooching');

// Nothing on this page may be smaller than a fingertip. 44 CSS pixels is
// Apple's own figure; the bench buttons were 30.
const small = await page.evaluate(() => [...document.querySelectorAll('button')]
  .filter((el) => el.offsetParent !== null)
  .map((el) => [el.textContent.trim() || 'swatch', Math.round(el.getBoundingClientRect().height)])
  .filter(([, h]) => h < 44));
check('every button is thumb-sized', !small.length, small.length ? small[0].join(' ') : '44px+');

// The bench has to work for a player who cannot read yet: the five zone
// buttons are a picture of the unicorn with one part lit up, and the only
// words left on the styling row belong to the button that starts the shoot.
const wordy = await page.evaluate(() => [...document.querySelectorAll('button')]
  .filter((el) => el.offsetParent !== null && /[a-z]/i.test(el.textContent))
  .map((el) => el.textContent.trim()));
check('the bench speaks in pictures', wordy.length === 1, wordy.join('|') || 'none');

await page.getByRole('button', { name: 'START THE SHOOT' }).click();
await page.waitForTimeout(400);

// Synthetic pointer events rather than the touchscreen helper, because two
// fingers at once is the entire point and a tap helper cannot express it.
const gesture = (moves) => page.evaluate(async (ms) => {
  const c = document.getElementById('c');
  for (const [type, id, x, y] of ms) {
    (type === 'pointerdown' ? c : window).dispatchEvent(new PointerEvent(type, {
      pointerId: id, clientX: x, clientY: y, bubbles: true, pointerType: 'touch',
    }));
    await new Promise((r) => setTimeout(r, 30));
  }
}, moves);

const film = () => page.evaluate(() => SNAP.film);
const f0 = await film();

await gesture([
  ['pointerdown', 1, 150, 400], ['pointerdown', 2, 250, 400],
  ['pointermove', 1, 120, 400], ['pointermove', 2, 280, 400],
  ['pointermove', 1, 90, 400], ['pointermove', 2, 310, 400],
  ['pointerup', 1, 90, 400], ['pointerup', 2, 310, 400],
]);
await page.waitForTimeout(250);
check('a pinch spends no film', await film() === f0, `${await film()} of ${f0}`);

await gesture([
  ['pointerdown', 1, 200, 400], ['pointermove', 1, 240, 410],
  ['pointermove', 1, 290, 420], ['pointerup', 1, 290, 420],
]);
await page.waitForTimeout(250);
check('an aiming drag spends no film', await film() === f0, `${await film()} of ${f0}`);

// SIDEWAYS IS AIMING, so the camera turns the way the finger pushes and the
// subject slides the other way. This has been flipped twice, once in each
// direction, and both reports were right about their own axis: making the
// subject follow the finger fixed the vertical, where framing is what the
// thumb is doing, and broke the horizontal, where turning the camera is.
// The signs differ on purpose now, and this is the check that says so.
const at = async () => (await page.evaluate(() => SNAPSHOT().box.cx));
const x0 = await at();
await gesture([
  ['pointerdown', 1, 150, 400], ['pointermove', 1, 190, 400],
  ['pointermove', 1, 230, 400], ['pointermove', 1, 270, 400], ['pointerup', 1, 270, 400],
]);
const x1 = await at();
check('by default the subject follows the finger', x1 > x0 + .05, `${x0.toFixed(2)} -> ${x1.toFixed(2)}`);

// ...and the switch really switches it. Two conventions exist, this game
// ships one and offers the other, and the probe holds both ends so neither
// can quietly become the other.
await page.getByRole('button', { name: /CAMERA|SUBJECT/ }).click();
const x2 = await at();
await gesture([
  ['pointerdown', 1, 150, 400], ['pointermove', 1, 190, 400],
  ['pointermove', 1, 230, 400], ['pointermove', 1, 270, 400], ['pointerup', 1, 270, 400],
]);
const x3 = await at();
check('and the switch turns the camera instead', x3 < x2 - .05, `${x2.toFixed(2)} -> ${x3.toFixed(2)}`);
await page.getByRole('button', { name: /CAMERA|SUBJECT/ }).click();

await gesture([['pointerdown', 1, 200, 400], ['pointerup', 1, 201, 401]]);
await page.waitForTimeout(450);
check('a tap takes the picture', await film() === f0 - 1, `${await film()} of ${f0}`);

await page.getByRole('button', { name: 'SHOOT' }).click();
await page.waitForTimeout(450);
check('so does the shutter button', await film() === f0 - 2, `${await film()} of ${f0}`);

await browser.close();
console.log('');
if (bad) { console.error(`  ${bad} check(s) failed`); process.exit(1); }
console.log('  it behaves on a phone');

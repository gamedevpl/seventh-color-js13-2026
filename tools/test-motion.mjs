// Walking round the unicorn by turning the phone.
//
// A phone cannot report where you have WALKED - integrating an accelerometer
// twice drifts metres in seconds - so turning yourself is mapped to stepping
// round the set instead, with the lens held on the subject. These checks are
// about that mapping: the button appears only where the gesture works,
// orientation events reach the camera, turning moves you round the subject
// rather than merely panning past it, a finger still trims the aim, and
// switching it off really stops it.
//
// What it CANNOT check is the one thing only hardware can settle: whether a
// real device reports the axes the way this assumes. The signs asserted here
// are the INTENT - turn right, lens goes right - so if a phone disagrees,
// this file is where the correction belongs and the test will say which way
// it went.
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { requireDevBuild } from './lib/require-dev.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'build', 'snap', 'index.html');

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
// A coarse pointer, because the button is gated on one: aiming a desktop
// monitor by waving it is not a feature.
const ctx = await browser.newContext({ viewport: { width: 420, height: 780 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
const page = await ctx.newPage();
page.on('pageerror', (e) => { console.error('PAGE ERROR:', e.message); process.exitCode = 1; });

await requireDevBuild(page, browser, file, pathToFileURL);

let bad = 0;
const check = (name, ok, detail) => {
  if (!ok) bad++;
  console.log(`  ${name.padEnd(44)} ${String(detail).padStart(14)}  ${ok ? 'ok' : 'FAIL'}`);
};
// [lens heading, lens pitch, field of view, position round the cove]
const cam = async () => (await page.evaluate(() => window.SNAP)).cam;
const tilt = (alpha, beta, gamma = 0) => page.evaluate(([a, b, g]) => {
  dispatchEvent(new DeviceOrientationEvent('deviceorientation', { alpha: a, beta: b, gamma: g }));
}, [alpha, beta, gamma]);

await page.goto(pathToFileURL(file).href, { waitUntil: 'load' });
await page.waitForTimeout(700);
await page.getByRole('button', { name: 'OPEN THE STUDIO' }).click();
await page.waitForTimeout(250);

check('hidden on the styling bench', !(await page.getByRole('button', { name: /WALK/ }).isVisible()), 'hidden');

await page.getByRole('button', { name: 'START THE SHOOT' }).click();
await page.waitForTimeout(350);
check('offered on a touch device, in the shoot', await page.getByRole('button', { name: /WALK/ }).isVisible(), 'shown');

// Off by default: the lens must not move until it has been asked for.
const c0 = await cam();
await tilt(180, 90);
await tilt(150, 110);
await page.waitForTimeout(120);
const c1 = await cam();
check('ignored until it is switched on', Math.abs(c1[0] - c0[0]) < 1e-6, 'no movement');

await page.getByRole('button', { name: /WALK/ }).click();
await page.waitForTimeout(120);
await tilt(180, 90);                       // this pose becomes the centre
await page.waitForTimeout(60);
const base = await cam();

// Alpha counts anticlockwise, so turning the phone to your RIGHT lowers it,
// and stepping right around a subject you are facing raises the orbit angle.
await tilt(160, 90);
await page.waitForTimeout(120);
const right = await cam();
check('turning right walks you right round the subject', right[3] > base[3] + .05, (right[3] - base[3]).toFixed(3));
// The whole point of orbiting rather than panning: the subject must still be
// in front of the lens afterwards.
check('the lens stays pointed at the set', Math.abs(((right[0] - right[3] - Math.PI) % (Math.PI * 2))) < .01, 'inward');

await tilt(200, 90);
await page.waitForTimeout(120);
const left = await cam();
check('turning left walks you the other way', left[3] < base[3] - .05, (left[3] - base[3]).toFixed(3));

// Beta passes 90 as the phone comes upright and keeps climbing as its top
// tips away from you, which is the gesture for looking up.
await tilt(180, 110);
await page.waitForTimeout(120);
const up = await cam();
check('tipping it back looks up', up[1] > base[1] + .05, (up[1] - base[1]).toFixed(3));

await tilt(180, 70);
await page.waitForTimeout(120);
const down = await cam();
check('tipping it forward looks down', down[1] < base[1] - .05, (down[1] - base[1]).toFixed(3));

// The phone says where you are standing; the finger says exactly where to
// point from there. So a drag must move the lens WITHOUT moving you.
await tilt(180, 90);
await page.waitForTimeout(80);
const beforeDrag = await cam();
await page.mouse.move(210, 400);
await page.mouse.down();
await page.mouse.move(320, 430, { steps: 8 });
await page.mouse.up();
await tilt(180, 90);
await page.waitForTimeout(120);
const afterDrag = await cam();
check('a finger trims the aim', Math.abs(afterDrag[0] - beforeDrag[0]) > .01, (afterDrag[0] - beforeDrag[0]).toFixed(3));
check('but does not walk you anywhere', Math.abs(afterDrag[3] - beforeDrag[3]) < 1e-6, 'same spot');

// The wrap at north must not swing the lens the long way round.
await tilt(5, 90);
await page.waitForTimeout(60);
const nearNorth = await cam();
await tilt(355, 90);
await page.waitForTimeout(120);
const overNorth = await cam();
check('crossing north is a small step', Math.abs(overNorth[3] - nearNorth[3]) < .3, Math.abs(overNorth[3] - nearNorth[3]).toFixed(3));

await page.getByRole('button', { name: /WALK/ }).click();
await page.waitForTimeout(100);
const off0 = await cam();
await tilt(120, 130);
await page.waitForTimeout(120);
const off1 = await cam();
check('switching it off really stops it', Math.abs(off1[3] - off0[3]) < 1e-6, 'unmoved');

// A button that was pressed and then did nothing is the worst outcome here,
// and a page with no sensor permission fails exactly that way - which is how
// this shipped the first time, because requestPermission was pulled off its
// constructor, threw, and had the throw swallowed.
await page.getByRole('button', { name: /WALK/ }).click();
await page.waitForTimeout(1800);
check('says so when no sensor answers', /NO SENSOR|WALKING/.test(await page.getByRole('button', { name: /WALK|NO SENSOR/ }).textContent()), 'reports');

await browser.close();
console.log('');
if (bad) { console.error(`  ${bad} motion check(s) failed`); process.exit(1); }
console.log('  the phone walks the camera round the unicorn');

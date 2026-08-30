// Aiming the camera by moving the phone.
//
// What this CAN check, and does: that the button appears only where the
// gesture can work, that orientation events actually reach the lens, that
// each axis turns it the way a person holding the phone would expect, that
// a finger drag stands down while the phone is aiming, and that switching
// it off really stops it.
//
// What it CANNOT check is the one thing only hardware can settle: whether a
// real device reports the axes the way this assumes. The signs asserted here
// are the INTENT - turn right, lens goes right - so if a phone disagrees,
// this file is where the correction belongs and the test will say which way
// it went.
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'build', 'snap', 'index.html');

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
// A coarse pointer, because the button is gated on one: aiming a desktop
// monitor by waving it is not a feature.
const ctx = await browser.newContext({ viewport: { width: 420, height: 780 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
const page = await ctx.newPage();
page.on('pageerror', (e) => { console.error('PAGE ERROR:', e.message); process.exitCode = 1; });

let bad = 0;
const check = (name, ok, detail) => {
  if (!ok) bad++;
  console.log(`  ${name.padEnd(44)} ${String(detail).padStart(14)}  ${ok ? 'ok' : 'FAIL'}`);
};
const cam = async () => (await page.evaluate(() => window.SNAP)).cam;
const tilt = (alpha, beta, gamma = 0) => page.evaluate(([a, b, g]) => {
  dispatchEvent(new DeviceOrientationEvent('deviceorientation', { alpha: a, beta: b, gamma: g }));
}, [alpha, beta, gamma]);

await page.goto(pathToFileURL(file).href, { waitUntil: 'load' });
await page.waitForTimeout(700);
await page.getByRole('button', { name: 'OPEN THE STUDIO' }).click();
await page.waitForTimeout(250);

check('hidden on the styling bench', !(await page.getByRole('button', { name: 'MOTION' }).isVisible()), 'hidden');

await page.getByRole('button', { name: 'START THE SHOOT' }).click();
await page.waitForTimeout(350);
check('offered on a touch device, in the shoot', await page.getByRole('button', { name: 'MOTION' }).isVisible(), 'shown');

// Off by default: the lens must not move until it has been asked for.
const c0 = await cam();
await tilt(180, 90);
await tilt(150, 110);
await page.waitForTimeout(120);
const c1 = await cam();
check('ignored until it is switched on', Math.abs(c1[0] - c0[0]) < 1e-6, 'no movement');

await page.getByRole('button', { name: 'MOTION' }).click();
await page.waitForTimeout(120);
await tilt(180, 90);                       // this pose becomes the centre
await page.waitForTimeout(60);
const base = await cam();

// Alpha counts anticlockwise, so turning the phone to your RIGHT lowers it.
await tilt(160, 90);
await page.waitForTimeout(120);
const right = await cam();
check('turning the phone right turns the lens right', right[0] < base[0] - .05, (right[0] - base[0]).toFixed(3));

await tilt(200, 90);
await page.waitForTimeout(120);
const left = await cam();
check('turning it left turns the lens left', left[0] > base[0] + .05, (left[0] - base[0]).toFixed(3));

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

// One wheel, one pair of hands.
await tilt(180, 90);
await page.waitForTimeout(80);
const beforeDrag = await cam();
await page.mouse.move(210, 400);
await page.mouse.down();
await page.mouse.move(320, 430, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(120);
const afterDrag = await cam();
check('a drag stands down while the phone aims', Math.abs(afterDrag[0] - beforeDrag[0]) < 1e-6, 'unmoved');

// The wrap at north must not swing the lens the long way round.
await tilt(5, 90);
await page.waitForTimeout(60);
const nearNorth = await cam();
await tilt(355, 90);
await page.waitForTimeout(120);
const overNorth = await cam();
check('crossing north is a small step', Math.abs(overNorth[0] - nearNorth[0]) < .3, Math.abs(overNorth[0] - nearNorth[0]).toFixed(3));

await page.getByRole('button', { name: 'MOTION' }).click();
await page.waitForTimeout(100);
const off0 = await cam();
await tilt(120, 130);
await page.waitForTimeout(120);
const off1 = await cam();
check('switching it off really stops it', Math.abs(off1[0] - off0[0]) < 1e-6, 'unmoved');

await browser.close();
console.log('');
if (bad) { console.error(`  ${bad} motion check(s) failed`); process.exit(1); }
console.log('  the phone aims the camera');

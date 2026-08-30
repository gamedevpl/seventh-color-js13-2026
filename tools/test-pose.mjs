// Does the unicorn stand on the ground in every pose it can strike?
//
// It sounds like something a screenshot answers, and it is not. Every bone
// hangs off the root, so a pose that pitches the body - rearing above all -
// carries the legs with it, and each limb that should stay planted has to
// cancel that pitch by hand. Get it slightly wrong and the animal floats a
// few centimetres or sinks into the grass: too small to notice in a still,
// impossible to miss once the game is asking a player to photograph it.
//
// So the probe reads the lowest CONTACT out of the running rig - the lowest
// hoof, or the belly when that is lower - and holds every pose to the
// ground. Hooves alone are the wrong measure: a sleeping unicorn rests on
// its barrel with its legs folded up in the air, and the first cut of this
// test duly reported the one correct lying-down pose as floating 20 cm.
// Airborne moments (a gallop has a suspension phase) are allowed off the
// ground within a stated bound, and still have to come back down.
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { requireDevBuild } from './lib/require-dev.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'build', 'snap', 'index.html');
const NAMES = ['graze', 'idle', 'walk', 'trot', 'gallop', 'rear', 'toss', 'shake', 'sleep', 'prance', 'bow', 'jump', 'buck', 'spin'];

// pose -> [lowest allowed hoof, highest allowed hoof] over the sample window.
// A hoof a shade under zero is the leg reaching into the turf and reads
// fine; a hoof visibly under it is the animal sinking.
const BOUND = {
  0: [-.06, .06], 1: [-.06, .06], 2: [-.06, .09], 3: [-.06, .12],
  4: [-.06, .22], 5: [-.08, .10], 6: [-.06, .07], 7: [-.06, .08],
  8: [-.08, .06], 9: [-.06, .14], 10: [-.06, .06],
  // A jump is the one pose that is SUPPOSED to leave the ground, so its
  // bound is the only generous one here - and it is paired below with the
  // opposite assertion, that it comes back down. An animation that takes
  // off and never lands passes a ceiling test and is still broken.
  11: [-.06, .70], 12: [-.06, .10], 13: [-.06, .16],
};
const AIRBORNE = 11;

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 480, height: 320 } });
page.on('pageerror', (e) => { console.error('PAGE ERROR:', e.message); process.exitCode = 1; });

await requireDevBuild(page, browser, file, pathToFileURL);

let bad = 0;
console.log('  pose        lowest   highest   allowed');
for (let i = 0; i < NAMES.length; i++) {
  await page.goto(`${pathToFileURL(file).href}?pose=${i}`, { waitUntil: 'load' });
  // Let the pose settle out of the ease-in, then sample across more than a
  // full gait cycle - a single reading lands wherever the cycle happens to
  // be and would pass a leg that spends half its time underground.
  //
  // Except the jump, which is a ONE-SHOT: waiting for it to settle means
  // sampling an animal that has already landed, so the window starts at
  // take-off.
  await page.waitForTimeout(i === AIRBORNE ? 120 : 1200);
  const s = await page.evaluate(async () => {
    const out = [];
    for (let k = 0; k < 90; k++) {
      out.push(window.SNAP.contact);
      await new Promise((r) => requestAnimationFrame(r));
    }
    return out;
  });
  const lo = Math.min(...s), hi = Math.max(...s);
  const [bl, bh] = BOUND[i];
  // The jump has to do both: leave the ground, and come back to it.
  const ok = lo >= bl && hi <= bh && (i !== AIRBORNE || (hi > .3 && lo < .06));
  if (!ok) bad++;
  console.log(`  ${NAMES[i].padEnd(10)} ${lo.toFixed(3).padStart(7)} ${hi.toFixed(3).padStart(9)} ${`${bl}..${bh}`.padStart(10)}  ${ok ? 'ok' : 'FAIL'}`);
}
await browser.close();
console.log('');
if (bad) { console.error(`  ${bad} pose(s) not standing on the ground`); process.exit(1); }
console.log('  every pose stands on the ground');

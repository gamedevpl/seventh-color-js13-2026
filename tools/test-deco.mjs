// Does the paint reach the screen?
//
// Every other way of asking this tests the code that was just written
// against itself: the state says rose, the array says rose, the uploader
// says it uploaded. None of that is evidence that anything is rose on the
// player's screen - a mesh can be rebuilt into a buffer nothing draws, a
// zone range can be off by a vertex, a shader can be tinting. So this reads
// the framebuffer back over the unicorn's barrel and asks what colour is
// actually there.
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'build', 'snap', 'index.html');
const W = 900, H = 620;
// A box well inside the barrel at this fixed camera. Deliberately small and
// central: clipping the outline would average the paper in and every
// reading would drift toward yellow.
const BOX = [400, H - 350, 55, 38];

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => { console.error('PAGE ERROR:', e.message); process.exitCode = 1; });
await page.goto(`${pathToFileURL(file).href}?pose=1&cam=0.3,0.1,3.6`, { waitUntil: 'load' });
await page.waitForTimeout(800);

const coat = () => page.evaluate((b) => window.SNAPPIX(...b), BOX);
const probe = () => page.evaluate(() => window.SNAP);
const rgb = (c) => `${c.map((v) => Math.round(v)).join(',')}`;

let bad = 0;
const check = (name, ok, detail) => {
  if (!ok) bad++;
  console.log(`  ${name.padEnd(40)} ${detail.padStart(18)}  ${ok ? 'ok' : 'FAIL'}`);
};

const base = await coat();
check('the coat starts pale', base[0] > 120 && Math.abs(base[0] - base[2]) < 70, rgb(base));

await page.getByRole('button', { name: 'COAT' }).click();
await page.locator('button[data-i="1"]').click();          // rose
await page.waitForTimeout(300);
const rose = await coat();
// Rose is warm: red must lead blue by a clear margin, and by MORE than it
// did before. Absolute thresholds would be a test of the light rather than
// of the paint.
check('painting the coat rose warms it', rose[0] - rose[2] > base[0] - base[2] + 25, rgb(rose));

await page.locator('button[data-i="2"]').click();          // sky
await page.waitForTimeout(300);
const sky = await coat();
check('painting the coat sky cools it', sky[2] - sky[0] > rose[2] - rose[0] + 40, rgb(sky));

// The rainbow swatch belongs to hair only. A rainbow coat is a different
// game and a rainbow hoof is a mess, so the button is inert here - and
// "inert" has to mean the colour does not move, not merely that it looks
// faded.
const before = await coat();
await page.locator('button[data-i="-1"]').click();
await page.waitForTimeout(300);
const after = await coat();
const moved = Math.hypot(after[0] - before[0], after[1] - before[1], after[2] - before[2]);
check('the rainbow swatch is inert on the coat', moved < 6, moved.toFixed(1));

// Glitter is counted rather than looked at: it twinkles, so a screenshot
// catches an arbitrary moment and a bright frame proves nothing.
await page.getByRole('button', { name: /GLITTER/ }).click();
await page.waitForTimeout(400);
const g1 = await probe();
check('one press puts glitter on the coat', g1.deco.glitter === 1 && g1.glit > 0, `${g1.glit} quads`);

await page.getByRole('button', { name: /GLITTER/ }).click();
await page.getByRole('button', { name: /GLITTER/ }).click();
await page.waitForTimeout(400);
const g3 = await probe();
check('three presses put on more', g3.deco.glitter === 3 && g3.glit > g1.glit, `${g3.glit} quads`);

await page.getByRole('button', { name: /GLITTER/ }).click();
await page.waitForTimeout(300);
const g0 = await probe();
check('a fourth press brushes it all off', g0.deco.glitter === 0 && g0.glit === 0, `${g0.glit} quads`);

await browser.close();
console.log('');
if (bad) { console.error(`  ${bad} styling check(s) failed`); process.exit(1); }
console.log('  the paint reaches the screen');

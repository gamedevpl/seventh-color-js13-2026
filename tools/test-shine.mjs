// Is the hair LIT, or is it paper?
//
// Reported twice from play, in the player's own words: first that the mane
// and tail looked like cut tissue paper with no reaction to the light at
// all, and then, once they were shaded, that they looked like rubber tubes
// and did not shine. Both are the same question - how much does the light
// vary across a strand - and it is a question a screenshot argues about and
// a histogram settles.
//
// So the probe puts the camera on the mane, reads the raw pixels, and
// measures the SPREAD of brightness over the hair alone: flat-lit paper has
// almost none, a lit round tuft has a gradient, and a tuft with a sheen has
// a bright end to that gradient well above its own base colour.
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { requireDevBuild } from './lib/require-dev.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'build', 'snap', 'index.html');
const W = 900, H = 620;

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => { console.error('PAGE ERROR:', e.message); process.exitCode = 1; });
await requireDevBuild(page, browser, file, pathToFileURL);

let bad = 0;
const check = (name, ok, detail) => {
  if (!ok) bad++;
  console.log(`  ${name.padEnd(44)} ${String(detail).padStart(16)}  ${ok ? 'ok' : 'FAIL'}`);
};

// Rose hair on a yellow set: hair pixels are the only ones where blue beats
// green, which separates them from the paper (r>g>b) and from the white
// body (r=g=b) without needing to know where on screen they landed.
await page.goto(`${pathToFileURL(file).href}?pose=1&deco=1,1,0,4,7,0`, { waitUntil: 'load' });
await page.waitForTimeout(1600);

// Sampled from several angles, because a highlight is a thing you see from
// somewhere - a single viewpoint measures whether this one camera got lucky.
const shots = [];
for (const ang of [0, 1.1, 2.2, 3.3, 4.4, 5.5]) {
  await page.evaluate((a) => window.SNAPCAM(a + Math.PI, -.05, .45, a), ang);
  await page.waitForTimeout(180);
  const px = await page.evaluate(() => window.SNAPRAW(0, 0, 900, 620));
  const lum = [];
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i], g = px[i + 1], b = px[i + 2];
    if (b > g + 24 && r > b) lum.push((r + g + b) / 3);   // rose hair only
  }
  if (lum.length < 400) continue;                          // hair off screen
  lum.sort((x, y) => x - y);
  const lo = lum[(lum.length * .05) | 0], hi = lum[(lum.length * .97) | 0];
  shots.push({ ang, n: lum.length, lo, hi, spread: hi - lo });
}

console.log('  angle    hair px      dim    bright    spread');
for (const s of shots) {
  console.log(`  ${s.ang.toFixed(1).padStart(5)} ${String(s.n).padStart(10)} ${s.lo.toFixed(0).padStart(8)} ${s.hi.toFixed(0).padStart(9)} ${s.spread.toFixed(0).padStart(9)}`);
}
console.log('');

const best = Math.max(...shots.map((s) => s.spread));
const mean = shots.reduce((a, s) => a + s.spread, 0) / shots.length;
// Flat-lit hair - one hard-coded normal for every vertex - measures 18
// levels of spread, and MEASURED THE SAME 18 FROM ALL SIX ANGLES, which is
// the numeric signature of paper: all of it was the per-strand tint and
// none of it was the light. Shaded and with the sheen on it reads 47 mean
// and 74 at the angle where the highlight lands.
check('the hair is shaded, not flat', mean > 34, `${mean.toFixed(0)} levels mean`);
check('and somewhere on it, it shines', best > 60, `${best.toFixed(0)} levels at best`);

await browser.close();
console.log('');
if (bad) { console.error(`  ${bad} check(s) failed`); process.exit(1); }
console.log('  the hair takes the light');

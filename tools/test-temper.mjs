// Does the styling actually change what the unicorn does?
//
// This is the mechanic that makes dressing it up a decision rather than a
// preference, and it is invisible: nothing on screen fails if the weights
// stop being applied, the unicorn simply goes back to behaving the same way
// whatever it is wearing, and the game quietly loses its strategy layer.
//
// The mood moves the same weights the look does, so the probe pins boredom
// and spark to zero and compares two looks under identical conditions. What
// is being measured is the look alone.
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { requireDevBuild } from './lib/require-dev.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'build', 'snap', 'index.html');
const NAMES = ['graze', 'idle', 'walk', 'trot', 'gallop', 'rear', 'toss', 'shake', 'sleep', 'prance', 'bow'];
const REAR = 5, TOSS = 6, SHAKE = 7, SLEEP = 8, PRANCE = 9, BOW = 10;
const SHOWY = [PRANCE, TOSS, SHAKE, BOW, REAR];
const SECONDS = Number(process.argv.find((a) => /^--seconds=/.test(a))?.split('=')[1] || 150);

// The four looks run in PARALLEL pages, and each tallies inside its own page
// rather than over a poll from Node. The sim runs in real time, so wall clock
// was the whole cost: four sequential 140-second windows is nine minutes, and
// a per-100ms round trip samples badly enough to miss a one-second pose. The
// throttling flags matter - Chromium freezes requestAnimationFrame in a page
// it thinks is in a background tab, which is exactly what three of these are.
const browser = await chromium.launch({
  args: ['--enable-unsafe-swiftshader', '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
});

// mane,tail,coat,horn,hoof,glitter
async function tally(deco, bored) {
  const page = await browser.newPage({ viewport: { width: 900, height: 620 } });
  page.on('pageerror', (e) => { console.error('PAGE ERROR:', e.message); process.exitCode = 1; });

await requireDevBuild(page, browser, file, pathToFileURL);
  await page.goto(`${pathToFileURL(file).href}?deco=${deco}`, { waitUntil: 'load' });
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'OPEN THE STUDIO' }).click();
  await page.getByRole('button', { name: 'START THE SHOOT' }).click();
  await page.waitForTimeout(250);
  const counts = await page.evaluate(([secs, b]) => new Promise((res) => {
    const c = {};
    let last = -1;
    const t0 = performance.now();
    const step = () => {
      // Held every frame: boredom climbs on its own and would swamp the
      // signal the probe is trying to isolate.
      window.SNAPMOOD(b, 0);
      const p = window.SNAP.pose;
      if (p !== last) { c[p] = (c[p] || 0) + 1; last = p; }
      if (performance.now() - t0 < secs * 1000) requestAnimationFrame(step);
      else res(c);
    };
    step();
  }), [SECONDS, bored]);
  await page.close();
  const n = Object.values(counts).reduce((a, b2) => a + b2, 0);
  const share = {};
  for (const k of Object.keys(counts)) share[k] = counts[k] / n;
  return { share, n };
}

const pct = (v) => ((v || 0) * 100).toFixed(1).padStart(5) + '%';
let bad = 0;
const check = (name, ok, detail) => {
  if (!ok) bad++;
  console.log(`  ${name.padEnd(46)} ${detail.padStart(16)}  ${ok ? 'ok' : 'FAIL'}`);
};

// ONE VARIABLE AT A TIME. The first cut compared warm-with-glitter against
// cool-without, and the glitter rule swamped the warmth rule: shares sum to
// one, so a pose that trebles pushes every other share down, and warmth read
// as WEAKER than cool despite working. Three looks, differing in one thing
// each, is the only way to attribute a change to a rule.
const [warm, cool, glit, bored] = await Promise.all([
  tally('4,4,6,4,4,0', 0),      // coral coat, gold mane
  tally('2,2,2,2,2,0', 0),      // sky throughout
  tally('4,4,6,4,4,3', 0),      // warm again, plus glitter
  tally('4,4,6,4,4,0', 1),      // warm, but the player has stopped working
]);

console.log('\n  pose          warm     cool     warm+glitter');
for (const i of [PRANCE, REAR, TOSS, SHAKE, BOW, 1, 0]) {
  console.log(`  ${NAMES[i].padEnd(10)} ${pct(warm.share[i])}   ${pct(cool.share[i])}   ${pct(glit.share[i])}`);
}
console.log('');

const showyWarm = (warm.share[PRANCE] || 0) + (warm.share[REAR] || 0);
const showyCool = (cool.share[PRANCE] || 0) + (cool.share[REAR] || 0);
check('warm makes it strut and rear', showyWarm > showyCool * 1.3,
  `${pct(showyWarm)} vs ${pct(showyCool)}`);
check('glitter makes it shake', (glit.share[SHAKE] || 0) > (warm.share[SHAKE] || 0) * 1.4,
  `${pct(glit.share[SHAKE])} vs ${pct(warm.share[SHAKE])}`);
// Cool is a trade, not a downgrade: fewer struts, more bows. Asserting that
// it merely produces "calm" was what let it quietly mean "more standing
// about", which cost more than the brief bonus it earned.
check('cool trades struts for bows', (cool.share[BOW] || 0) > (warm.share[BOW] || 0) * 1.8,
  `${pct(cool.share[BOW])} vs ${pct(warm.share[BOW])}`);
const dead = (cool.share[1] || 0) + (cool.share[0] || 0);
check('and does not just stand about', dead < .5, pct(dead));

// Boredom is the shoot's clock. Held high, the subject should stop performing
// and eventually lie down - which is the visible statement that the player has
// stopped working.
// Measured over the WHOLE showy set rather than over prancing alone. The
// claim is that a bored subject stops performing, not that it stops
// prancing, and one pose out of a table this size is a noisy estimate: the
// single-pose form of this check failed twice at the boundary on runs where
// the effect it is testing was plainly there (15.6% against 20.4%, needing
// 15.3%). Widening the bucket to what is actually being claimed makes the
// same test read the same effect with a fraction of the variance.
const showy = (r) => SHOWY.reduce((a, p) => a + (r.share[p] || 0), 0);
console.log(`\n  bored:  sleep ${pct(bored.share[SLEEP])}   showy ${pct(showy(bored))}   rear ${pct(bored.share[REAR])}\n`);
check('a bored subject lies down', (bored.share[SLEEP] || 0) > .15, pct(bored.share[SLEEP]));
check('and stops performing', showy(bored) < showy(warm) * .75,
  `${pct(showy(bored))} vs ${pct(showy(warm))}`);

await browser.close();
if (bad) { console.error(`  ${bad} check(s) failed`); process.exit(1); }
console.log('  the look changes what it does');

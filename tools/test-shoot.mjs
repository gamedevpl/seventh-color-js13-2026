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

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'build', 'snap', 'index.html');
const out = process.argv[2];
if (out) mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 900, height: 620 } });
page.on('pageerror', (e) => { console.error('PAGE ERROR:', e.message); process.exitCode = 1; });
await page.goto(pathToFileURL(file).href, { waitUntil: 'load' });
await page.waitForTimeout(700);

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
await page.getByRole('button', { name: 'COAT' }).click();
await page.locator('button[data-i="6"]').click();
await page.getByRole('button', { name: /GLITTER/ }).click();
await page.getByRole('button', { name: /GLITTER/ }).click();

await page.getByRole('button', { name: 'START THE SHOOT' }).click();
await page.waitForTimeout(400);
const s1 = await probe();
check('the shoot starts with a full roll', s1.phase === 1 && s1.film === 6, `film ${s1.film}`);

// A frozen unicorn would make this meaningless - the whole point of the
// shoot is that the pose changes under the shutter.
const seen = new Set();
for (let i = 0; i < 60; i++) {
  seen.add((await probe()).pose);
  await page.waitForTimeout(120);
}
check('it works the set on its own', seen.size >= 3, `${seen.size} poses`);

// Score the current frame directly, so a bad number is caught here rather
// than being averaged into a total later.
const sc = await shot();
check('a frame scores something', sc.total > 0 && sc.parts.length > 0, `${sc.total} pts`);
check('the score is itemised', sc.parts.every((p) => p[1] > 0), `${sc.parts.length} lines`);

for (let i = 0; i < 6; i++) {
  await page.keyboard.press('Space');
  await page.waitForTimeout(260);
}
await page.waitForTimeout(1100);
const s2 = await probe();
check('six frames end the job', s2.phase === 2 && s2.film === 0, `phase ${s2.phase}`);
check('the job scored', s2.seasonPts > 0, `${s2.seasonPts} pts`);

// The photograph has to be a photograph. preserveDrawingBuffer keeps the
// frame only until the next clear, so a capture taken from an input handler
// grabs a stale or empty buffer and comes back as a black rectangle.
const img = await page.evaluate(() => {
  const i = document.querySelector('img');
  return i ? { src: i.src.slice(0, 24), len: i.src.length } : null;
});
check('it kept an actual photograph', img && img.len > 4000, img ? `${(img.len / 1024) | 0} KB` : 'none');
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
  for (let i = 0; i < 6; i++) { await page.keyboard.press('Space'); await page.waitForTimeout(180); }
  await page.waitForTimeout(1000);
}
const s3 = await probe();
check('three jobs make a season', s3.phase === 3 || s3.round === 2, `phase ${s3.phase} round ${s3.round}`);
if (out) await page.screenshot({ path: path.join(out, '4-season.png') });

await browser.close();
console.log('');
if (bad) { console.error(`  ${bad} check(s) failed`); process.exit(1); }
console.log('  the loop closes');

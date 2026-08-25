// Is the stardust economy playable? Boost burns dust, demands need speed,
// and if a full tank cannot be refilled by collecting what is on the road,
// the run degenerates into cruising - or worse, into falling off the same
// bend forever. Runs a fixed policy in a real browser and reports what the
// numbers actually do.
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const secs = Number(process.argv.find((a) => /^--secs=/.test(a))?.split('=')[1] || 40);
const archive = readFileSync(path.join(root, 'build', 'strands', 'index.zip'));
const nl = archive.readUInt16LE(26), el = archive.readUInt16LE(28);
const method = archive.readUInt16LE(8), comp = archive.readUInt32LE(18);
const body = archive.subarray(30 + nl + el, 30 + nl + el + comp);
const { inflateRawSync } = await import('node:zlib');
const stage = mkdtempSync(path.join(tmpdir(), 'js13k-bal-'));
const pagePath = path.join(stage, 'index.html');
writeFileSync(pagePath, method === 0 ? body : inflateRawSync(body));

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 900, height: 640 } });
await page.goto(pathToFileURL(pagePath).href, { waitUntil: 'load' });
await page.waitForTimeout(500);
await page.keyboard.press('Space');
await page.evaluate(() => { window.__st = []; });
// Policy: boost always, and weave gently - a player who never lifts off.
await page.keyboard.down('ArrowUp');
for (let i = 0; i < secs; i++) {
  const key = i % 4 === 1 ? 'ArrowLeft' : i % 4 === 3 ? 'ArrowRight' : null;
  if (key) { await page.keyboard.down(key); await page.waitForTimeout(420); await page.keyboard.up(key); await page.waitForTimeout(580); }
  else await page.waitForTimeout(1000);
}
await page.keyboard.up('ArrowUp');
const rows = await page.evaluate(() => window.__st || []);
await browser.close();
if (!rows.length) { console.log('no probe data - is this a --cheats build?'); process.exit(1); }

const sp = rows.map((r) => r[1]), en = rows.map((r) => r[2]);
const falls = rows[rows.length - 1][3], jumps = rows[rows.length - 1][4];
const burnT = rows[rows.length - 1][6];
const rainbowFrames = rows.filter((r) => r[5]).length;
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const pct = (a, f) => (a.filter(f).length / a.length * 100).toFixed(0);
const span = (rows[rows.length - 1][0] - rows[0][0]) / 1000;
console.log(`${span.toFixed(0)}s of full-throttle play\n`);
console.log(`speed    mean ${mean(sp).toFixed(1)}  min ${Math.min(...sp).toFixed(1)}  max ${Math.max(...sp).toFixed(1)}`);
console.log(`         under 20 (serpentine minimum): ${pct(sp, (v) => v < 20)}% of frames`);
console.log(`         under 23 (corkscrew minimum):  ${pct(sp, (v) => v < 23)}% of frames`);
console.log(`stardust mean ${mean(en).toFixed(1)}  empty: ${pct(en, (v) => v <= 0.5)}% of frames`);
console.log(`falls ${falls}   jumps ${jumps}   rainbow ${(rainbowFrames / rows.length * 100).toFixed(0)}% of frames   burn total ${burnT.toFixed(1)}s`);
console.log();
if (falls > span / 6) console.log('WARN: falling more than once every 6 seconds - too punishing');
if (Number(pct(en, (v) => v <= 0.5)) > 75) console.log('WARN: tank empty almost always - boost is unaffordable');
if (Number(pct(sp, (v) => v < 20)) > 50) console.log('WARN: below the serpentine minimum most of the time');

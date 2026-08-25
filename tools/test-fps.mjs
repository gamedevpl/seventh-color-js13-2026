// Frame-pacing probe. tools/test-smooth.mjs measures the MOTION MATH; this
// measures what the player actually feels - the wall-clock gap between
// rendered frames. Jerk the eye notices is almost never in the curve, it is
// in a frame that took 40ms while its neighbours took 16.
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const args = process.argv.slice(2);
const game = args.find((a) => /^--game=/.test(a))?.split('=')[1] || 'strands';
const secs = Number(args.find((a) => /^--secs=/.test(a))?.split('=')[1] || 12);

const archive = readFileSync(path.join(root, 'build', game, 'index.zip'));
const nameLength = archive.readUInt16LE(26);
const extraLength = archive.readUInt16LE(28);
const method = archive.readUInt16LE(8);
const compressed = archive.readUInt32LE(18);
const body = archive.subarray(30 + nameLength + extraLength, 30 + nameLength + extraLength + compressed);
const { inflateRawSync } = await import('node:zlib');
const doc = method === 0 ? body : inflateRawSync(body);
const stage = mkdtempSync(path.join(tmpdir(), 'js13k-fps-'));
const pagePath = path.join(stage, 'index.html');
writeFileSync(pagePath, doc);

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 900, height: 640 } });
// Install the recorder BEFORE the game's own rAF loop starts.
await page.addInitScript(() => {
  window.__d = [];
  let last = 0;
  const tick = (t) => { if (last) window.__d.push(t - last); last = t; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
});
await page.goto(pathToFileURL(pagePath).href, { waitUntil: 'load' });
await page.waitForTimeout(600);
await page.keyboard.press('Space');
await page.keyboard.down('ArrowUp');
await page.waitForTimeout(secs * 1000);
await page.keyboard.up('ArrowUp');

const d = (await page.evaluate(() => window.__d)).slice(30);
await browser.close();
const srt = [...d].sort((a, b) => a - b);
const q = (p) => srt[Math.floor(srt.length * p)];
const mean = d.reduce((a, b) => a + b, 0) / d.length;
const long = d.filter((x) => x > q(.5) * 2).length;
console.log(`frames: ${d.length} over ${secs}s`);
console.log(`gap ms  p50 ${q(.5).toFixed(1)}  p90 ${q(.9).toFixed(1)}  p99 ${q(.99).toFixed(1)}  max ${srt[srt.length - 1].toFixed(1)}  mean ${mean.toFixed(1)}`);
console.log(`effective fps: ${(1000 / mean).toFixed(1)}`);
console.log(`stutters (>2x median): ${long}  (${(long / d.length * 100).toFixed(1)}%)`);

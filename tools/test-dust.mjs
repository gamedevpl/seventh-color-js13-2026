// Measure the speed dust from the RUNNING game.
//
// The one number that decides whether a streak reads as motion or as an
// object hanging in the air is the OVERLAP FACTOR len/vl: how many frames
// of camera travel each dash spans. Because a mote's angular position is
// atan(R/z), both its per-frame angular motion and its angular streak
// length scale by the same R/(R^2+z^2), so this ratio is the same wherever
// on screen the mote sits - one scalar for the whole effect.
//
//   1  a true exposure: successive smears abut exactly
//   2-3  mild exaggeration, still plainly moving
//   50 a rod sitting in space that shifts 2% of its own length per frame
//
// The second column that matters is how many motes are within 12 units at
// any moment: those are the ones sweeping across the frame rather than
// creeping near the vanishing point, and they are what reads as speed.
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inflateRawSync } from 'node:zlib';
import { chromium } from 'playwright-core';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const archive = readFileSync(path.join(root, 'build', 'strands', 'index.zip'));
const nl = archive.readUInt16LE(26), el = archive.readUInt16LE(28);
const method = archive.readUInt16LE(8), comp = archive.readUInt32LE(18);
const body = archive.subarray(30 + nl + el, 30 + nl + el + comp);
const stage = mkdtempSync(path.join(tmpdir(), 'js13k-dust-'));
const pagePath = path.join(stage, 'index.html');
writeFileSync(pagePath, method === 0 ? body : inflateRawSync(body));

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 900, height: 640 } });
await page.goto(pathToFileURL(pagePath).href, { waitUntil: 'load' });
await page.waitForTimeout(500);
await page.keyboard.press('Space');
await page.waitForTimeout(300);
await page.evaluate(() => { window.__dust = []; });
await page.keyboard.down('ArrowUp');
await page.waitForTimeout(14000);
await page.keyboard.up('ArrowUp');
const rows = await page.evaluate(() => window.__dust || []);
await browser.close();
if (!rows.length) { console.log('no probe data - is this a --cheats build?'); process.exit(1); }

// Bucket by speed, because both density and streak length ride on it.
const BUCKETS = [[.2, .4], [.4, .6], [.6, .8], [.8, 1.01]];
console.log(`${rows.length} frames sampled\n`);
console.log('speedN      frames   travel/frame   streak    overlap   motes   within 12u');
let worst = 0;
for (const [lo, hi] of BUCKETS) {
  const b = rows.filter((r) => r[0] >= lo && r[0] < hi);
  if (!b.length) continue;
  const avg = (k) => b.reduce((s, r) => s + r[k], 0) / b.length;
  const vl = avg(1), len = avg(2), ov = len / vl;
  worst = Math.max(worst, ov);
  console.log(`${lo.toFixed(1)}-${hi.toFixed(1)}   ${String(b.length).padStart(6)}   ${vl.toFixed(3).padStart(10)}u   ${len.toFixed(2).padStart(6)}u   ${ov.toFixed(1).padStart(6)}x   ${avg(3).toFixed(0).padStart(5)}   ${avg(4).toFixed(1).padStart(9)}`);
}
console.log(`\nworst overlap factor: ${worst.toFixed(1)}x`);
if (worst > 4) {
  console.log('FAIL: streaks span more than four frames of travel - they will read as');
  console.log('      rods hanging in the air rather than motes rushing past.');
  process.exit(1);
}
console.log('PASS: streaks are a smear of the real motion, not standing geometry');

// Capture promo stills from the native build: boots build/native/index.zip in
// a real browser at exactly 2x the game's 320x156 canvas and screenshots the
// canvas element, so every frame lands pixel-aligned instead of resampled.
// Build first: `node tools/native.mjs --no-roadroller --cheats`.
// Needs a --cheats build - shift+shift walks the story to a chosen beat, and
// then plain taps advance that beat's dialogue into whatever the shot wants.
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inflateRawSync } from 'node:zlib';
import { chromium } from 'playwright-core';

// beat = index into BEATS (skips from the prologue), taps = dialogue
// advances after arriving, hold = extra ms before the shutter.
const SHOTS = [
  { name: 'council', beat: 1, taps: 1 },
  { name: 'glade', beat: 2, taps: 4 },
  { name: 'unicorns', beat: 3, taps: 2, hold: 3400 },
  { name: 'castle', beat: 11, taps: 2, hold: 2200 },
  { name: 'throne', beat: 14, taps: 2, hold: 2600 },
  { name: 'spring', beat: 16, taps: 2, hold: 2200 },
];

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const out = process.argv[2] || path.join(root, 'build', 'shots');
mkdirSync(out, { recursive: true });

const archive = readFileSync(path.join(root, 'build', 'native', 'index.zip'));
const nameLength = archive.readUInt16LE(26);
const extraLength = archive.readUInt16LE(28);
const compressed = archive.readUInt32LE(18);
const body = archive.subarray(30 + nameLength + extraLength, 30 + nameLength + extraLength + compressed);
const document_ = archive.readUInt16LE(8) === 0 ? body : inflateRawSync(body);
const stage = mkdtempSync(path.join(tmpdir(), 'shots-'));
const pagePath = path.join(stage, 'index.html');
writeFileSync(pagePath, document_);

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: { width: 640, height: 312 } });
const page = await context.newPage();
// #nohud keeps the cheat build's beat readout out of the frame.
await page.goto(pathToFileURL(pagePath).href + '#nohud', { waitUntil: 'load' });
const canvas = page.locator('canvas');
await page.waitForTimeout(2500);
await canvas.screenshot({ path: path.join(out, 'title.png') });

async function skip() {
  await page.keyboard.down('ShiftLeft');
  await page.keyboard.down('ShiftRight');
  await page.waitForTimeout(140);
  await page.keyboard.up('ShiftRight');
  await page.keyboard.up('ShiftLeft');
  // The arriving beat's black card runs 1.9s; nothing is worth shooting
  // until it has cleared.
  await page.waitForTimeout(2400);
}

await page.keyboard.press('Space');
await page.waitForTimeout(2500);
let at = 0;
for (const shot of SHOTS) {
  while (at < shot.beat) { await skip(); at++; }
  for (let k = 0; k < (shot.taps || 0); k++) { await page.keyboard.press('Space'); await page.waitForTimeout(450); }
  await page.waitForTimeout(shot.hold || 900);
  await canvas.screenshot({ path: path.join(out, `${shot.name}.png`) });
}
await browser.close();
console.log(`shots in ${path.relative(root, out)}`);

// Boot the packed zip in a real browser and fail on anything the console says.
//
// Every stage in pack.mjs rewrites code the game did not expect to be rewritten
// — the audio prelude, terser's property mangling, roadroller's self-extractor.
// A zip under budget that throws on load is worth nothing, so the size number
// is only trustworthy next to this.

import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const args = process.argv.slice(2);
const seconds = Number(args.find((a) => /^\d+$/.test(a)) || 8);

// Unzip our own archive rather than trusting build/index.html — this checks the
// artifact that would actually be submitted, container and all.
const archive = readFileSync(path.join(root, 'build', 'index.zip'));
const nameLength = archive.readUInt16LE(26);
const extraLength = archive.readUInt16LE(28);
const method = archive.readUInt16LE(8);
const compressed = archive.readUInt32LE(18);
const body = archive.subarray(30 + nameLength + extraLength, 30 + nameLength + extraLength + compressed);
const { inflateRawSync } = await import('node:zlib');
const document = method === 0 ? body : inflateRawSync(body);

const stage = mkdtempSync(path.join(tmpdir(), 'js13k-verify-'));
const pagePath = path.join(stage, 'index.html');
writeFileSync(pagePath, document);

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 900, height: 640 } });
const page = await context.newPage();

const problems = [];
page.on('console', (message) => {
  if (message.type() === 'error' || message.type() === 'warning') problems.push(`${message.type()}: ${message.text()}`);
});
page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
page.on('requestfailed', (request) => problems.push(`requestfailed: ${request.url()}`));

await page.goto(pathToFileURL(pagePath).href, { waitUntil: 'load' });
await page.waitForTimeout(seconds * 1000);

const probe = await page.evaluate(() => {
  const canvas = document.querySelector('canvas');
  return {
    kit: typeof window.GameKit,
    modules: window.GameKit ? Object.keys(window.GameKit).length : 0,
    sounds: Object.keys(window.__GAME_AUDIO_ASSETS__ || {}).length,
    canvas: canvas ? `${canvas.width}x${canvas.height}` : null,
    painted: canvas ? canvas.width > 0 && canvas.height > 0 : false,
  };
});

const shot = path.join(root, 'build', 'verify.png');
await page.screenshot({ path: shot });
await browser.close();

console.log(`GameKit: ${probe.kit} (${probe.modules} modules)`);
console.log(`sounds synthesised: ${probe.sounds}`);
console.log(`canvas: ${probe.canvas ?? 'none'}`);
console.log(`screenshot: ${path.relative(root, shot)}`);

const fatal = problems.filter((p) => !/^warning:/.test(p));
if (problems.length) {
  console.log(`\n${problems.length} console message(s):`);
  for (const problem of problems.slice(0, 20)) console.log(`  ${problem}`);
}

if (probe.kit !== 'object' || !probe.painted || fatal.length) {
  console.error('\nVERIFY FAILED');
  process.exit(1);
}
console.log('\nVERIFY OK');

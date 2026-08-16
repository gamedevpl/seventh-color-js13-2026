// Boot the native build's own zip in a real browser and fail on anything the
// console says. Unlike verify.mjs (the GameKit-episode path) this drives no
// specific input scheme yet - each milestone adds its own interaction check
// here as the story machine and mechanics come online.

import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const args = process.argv.slice(2);
const seconds = Number(args.find((a) => /^\d+$/.test(a)) || 3);

const archive = readFileSync(path.join(root, 'build', 'native', 'index.zip'));
const nameLength = archive.readUInt16LE(26);
const extraLength = archive.readUInt16LE(28);
const method = archive.readUInt16LE(8);
const compressed = archive.readUInt32LE(18);
const body = archive.subarray(30 + nameLength + extraLength, 30 + nameLength + extraLength + compressed);
const { inflateRawSync } = await import('node:zlib');
const document = method === 0 ? body : inflateRawSync(body);

const stage = mkdtempSync(path.join(tmpdir(), 'js13k-native-verify-'));
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
    canvas: canvas ? `${canvas.width}x${canvas.height}` : null,
    painted: canvas ? canvas.width > 0 && canvas.height > 0 : false,
  };
});

const shot = path.join(root, 'build', 'native', 'verify.png');
await page.screenshot({ path: shot });
await browser.close();

console.log(`canvas: ${probe.canvas ?? 'none'}`);
console.log(`screenshot: ${path.relative(root, shot)}`);

if (problems.length) {
  console.log(`\n${problems.length} console message(s):`);
  for (const problem of problems.slice(0, 20)) console.log(`  ${problem}`);
}

if (!probe.painted || problems.length) {
  console.error('\nVERIFY FAILED');
  process.exit(1);
}
console.log('\nVERIFY OK');

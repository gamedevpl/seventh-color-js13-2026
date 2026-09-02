// Boot the native build's own zip in a real browser and fail on anything the
// console says. --keys=space,space,right,space presses named keys 350ms apart,
// screenshotting after each - each milestone extends the script as the story
// machine and mechanics come online, the same "drive it a little, not just
// boot" discipline as the GameKit-episode verify.mjs.

const KEY_MAP = { space: 'Space', left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown', enter: 'Enter' };

import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const args = process.argv.slice(2);
const seconds = Number(args.find((a) => /^\d+$/.test(a)) || 3);
const keysArg = args.find((a) => /^--keys=/.test(a))?.split('=')[1] || '';
const game = args.find((a) => /^--game=/.test(a))?.split('=')[1] || 'native';
const keys = keysArg ? keysArg.split(',') : [];

const archive = readFileSync(path.join(root, 'build', game, 'index.zip'));
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

// Software WebGL in headless needs an explicit opt-in these days; without
// it the strands build boots to a dead context and the probe blames the game.
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: { width: 900, height: 640 } });
const page = await context.newPage();

const problems = [];
page.on('console', (message) => {
  // Headless GL emits *performance* chatter (ReadPixels stalls from the
  // screenshotting itself). That is the harness observing, not the game
  // failing - filter exactly that class and nothing else.
  if (/GL Driver Message \(OpenGL, Performance/.test(message.text())) return;
  // The title listens to the competition relay for a rider count, and this
  // sandbox has no route to it. The game's behaviour on a relay it cannot
  // reach is tested on its own (tools/test-online.mjs); here it is weather.
  if (/WebSocket connection to 'wss:\/\/relay\.js13kgames\.com/.test(message.text())) return;
  if (message.type() === 'error' || message.type() === 'warning') problems.push(`${message.type()}: ${message.text()}`);
});
page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
page.on('requestfailed', (request) => problems.push(`requestfailed: ${request.url()}`));

await page.goto(pathToFileURL(pagePath).href, { waitUntil: 'load' });
await page.waitForTimeout(seconds * 1000);

for (let i = 0; i < keys.length; i++) {
  // `space:1200` holds the key for 1200ms instead of tapping it - hold-based
  // mechanics (stillness) cannot be driven by presses at all.
  const [name, holdMs] = keys[i].split(':');
  const key = KEY_MAP[name] || name;
  if (holdMs) {
    await page.keyboard.down(key);
    await page.waitForTimeout(Number(holdMs));
    await page.keyboard.up(key);
  } else {
    await page.keyboard.press(key);
  }
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(root, 'build', game, `verify-${i + 1}.png`) });
}

// --soak=N plays for N seconds on a fixed, repeating input pattern that is
// mostly *waiting*. That matters: the story machine can end a beat on its
// own clock - a cutscene running out - and the bug that motivated this
// soak was invisible to any test that pressed a key every frame, and
// invisible to the Node integration test because that one never renders.
// Deterministic on purpose, so a failure reproduces.
const soak = Number(args.find((a) => /^--soak=/.test(a))?.split('=')[1] || 0);
if (soak) {
  // Opening move, deliberately: start the game and then touch nothing at
  // all for long enough that the prologue runs out on its own clock. A
  // beat that ends without input is the transition worth guarding, and any
  // pattern that taps every second or two never reaches it - the first
  // version of this soak tapped its way through the prologue and passed
  // happily against the very bug it was written for.
  await page.keyboard.press('Space');
  await page.waitForTimeout(18000);
  const CYCLE = ['', '', '', 'Space', '', 'ArrowRight', '', 'Space', '', '', 'ArrowLeft', '', 'Space', ''];
  const steps = Math.max(0, Math.round(((soak - 18) * 1000) / 240));
  for (let i = 0; i < steps && !problems.length; i++) {
    const k = CYCLE[i % CYCLE.length];
    if (k) await page.keyboard.press(k);
    await page.waitForTimeout(240);
  }
  console.log(`soaked ${soak}s (18s silent opening + ${steps} steps)`);
}

// --skipall drives the dev cheat (both Shifts) to walk every beat in the
// story, screenshotting each one. Needs a --cheats build. The soak can
// only reach as far as the first puzzle it cannot solve; this reaches all
// nineteen, so a beat that crashes on render cannot hide behind a mechanic.
const skipAll = args.includes('--skipall');
if (skipAll) {
  await page.keyboard.press('Space');
  await page.waitForTimeout(500);
  for (let i = 0; i < 30 && !problems.length; i++) {
    await page.keyboard.down('ShiftLeft');
    await page.keyboard.down('ShiftRight');
    await page.waitForTimeout(140);
    await page.keyboard.up('ShiftRight');
    await page.keyboard.up('ShiftLeft');
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(root, 'build', game, `skip-${String(i).padStart(2, '0')}.png`) });
  }
  console.log('walked 30 skips across the story');
}

const probe = await page.evaluate(() => {
  const canvas = document.querySelector('canvas');
  return {
    canvas: canvas ? `${canvas.width}x${canvas.height}` : null,
    painted: canvas ? canvas.width > 0 && canvas.height > 0 : false,
  };
});

const shot = path.join(root, 'build', game, 'verify.png');
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

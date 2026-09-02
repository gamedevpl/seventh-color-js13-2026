// The end card, captured as video rather than rendered as a still: its
// reveal is a CSS animation (the title rises, the palette bar grows, the
// lines stagger in), and the trailer wants that motion, not a frozen frame
// of where it ended up.
//
//   node tools/trailer/record-endcard.mjs [--game=snap|fireball]
//
// This one IS real-time - Playwright's own recorder, wall clock and all -
// because there is no game loop to step here, just CSS running at whatever
// rate the compositor gives it. The frame recorders have to fake a clock;
// this does not, and that is exactly why the end card is a separate capture
// instead of another overlay inside them.
import { mkdirSync, renameSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');

const GAMES = {
  snap: { page: 'endcard.html', dir: 'trailer' },
  fireball: { page: 'endcard-fireball.html', dir: 'trailer-fireball' },
};
const which = (process.argv.find((a) => a.startsWith('--game=')) || '--game=snap').split('=')[1];
const game = GAMES[which];
if (!game) {
  console.error(`unknown game '${which}' - expected one of: ${Object.keys(GAMES).join(', ')}`);
  process.exit(1);
}

const outDir = path.join(root, 'build', game.dir, 'endcard');
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  recordVideo: { dir: outDir, size: { width: 1920, height: 1080 } },
});
const page = await context.newPage();
await page.goto(pathToFileURL(path.join(here, game.page)).href, { waitUntil: 'load' });
// Long enough for the last line (the byline, at 1.7s) to land and hold.
await page.waitForTimeout(5200);
const raw = await page.video().path();
await page.close();
await context.close();
await browser.close();

// Playwright names the file by hash; assemble.mjs wants one it can predict.
const out = path.join(outDir, 'endcard.webm');
renameSync(raw, out);
console.log(`${which} end card -> ${path.relative(root, out)}`);

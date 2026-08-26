// Promo frames. The game renders into a 640x360 backing store, which is fine
// on screen and far too soft for a 800x500 cover, so the buffer is doubled
// for the capture only: the projection takes its aspect from the constant
// VW/VH and the GL viewport from canvas.width, so a 1280x720 buffer renders
// the same shot at twice the detail. The HUD canvas is doubled too and its
// context scaled 2x, so the text lands in the same place at twice the size.
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inflateRawSync } from 'node:zlib';
import { chromium } from 'playwright-core';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = process.argv[2] || '/tmp/shots';
const a = readFileSync(path.join(root, 'build', 'strands', 'index.zip'));
const nl = a.readUInt16LE(26), el = a.readUInt16LE(28);
const m = a.readUInt16LE(8), c = a.readUInt32LE(18);
const stage = mkdtempSync(path.join(tmpdir(), 'js13k-shots-'));
const f = path.join(stage, 'index.html');
writeFileSync(f, m === 0 ? a.subarray(30+nl+el, 30+nl+el+c) : inflateRawSync(a.subarray(30+nl+el, 30+nl+el+c)));

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 740 } });
await page.goto(pathToFileURL(f).href, { waitUntil: 'load' });
await page.waitForTimeout(700);
await page.evaluate(() => {
  const cs = document.querySelectorAll('canvas');
  for (const c of cs) { c.width = 1280; c.height = 720; }
  cs[1].getContext('2d').setTransform(2, 0, 0, 2, 0, 0);
});
await page.waitForTimeout(400);
const shot = async (name) => {
  const box = await page.locator('canvas').first().boundingBox();
  await page.screenshot({ path: path.join(out, name + '.png'),
    clip: { x: box.x, y: box.y, width: Math.min(1280, box.width), height: Math.min(720, box.height) } });
};
await shot('00-title');
await page.keyboard.press('Space'); await page.waitForTimeout(900);
await shot('01-title-live');
await page.keyboard.press('Space'); await page.waitForTimeout(1600);
await shot('02-intro');
await page.keyboard.press('Space'); await page.waitForTimeout(700);
// Drive it properly, or the best shots never happen: the bot has to steer
// into the bends and take the kickers to keep the tank up, catch the
// rainbow and BE it. That state is the whole point of the game and the most
// worthwhile thing to photograph. A --cheats build is used only because the
// steering reads the DEV probe; DEV adds telemetry and nothing visual.
await page.keyboard.down('ArrowUp');
let cur = null, n = 3;
for (let i = 0; i < 900; i++) {
  const st = await page.evaluate(() => {
    const a = window.__st; const r = a && a[a.length - 1];
    return r ? [r[7], r[8], r[10], r[2], r[11], r[12], r[5]] : null;
  });
  let want = null;
  if (st && st[4]) want = st[5] > .4 ? 'ArrowRight' : st[5] < -.4 ? 'ArrowLeft' : null;
  else if (st) { const d = st[1] * 2.2 - st[0] * 1.4; want = d > .25 ? 'ArrowLeft' : d < -.25 ? 'ArrowRight' : null; }
  if (want !== cur) { if (cur) await page.keyboard.up(cur); if (want) await page.keyboard.down(want); cur = want; }
  if (i % 11 === 10) {
    const tag = st && st[6] ? '-rainbow' : '-run';
    await shot(String(n++).padStart(2, '0') + tag);
  }
  await page.waitForTimeout(90);
}
if (cur) await page.keyboard.up(cur);
await page.keyboard.up('ArrowUp');
await browser.close();
console.log('done ->', out);

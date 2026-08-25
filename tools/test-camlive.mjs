// Measure the REAL camera, from the running game, via the DEV probe. The
// Node replicas (test-cam) miss lane, lean, FOV and the actual frame times,
// and "the ride feels rough" is a claim about exactly those.
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const secs = Number(process.argv.find((a) => /^--secs=/.test(a))?.split('=')[1] || 14);
const archive = readFileSync(path.join(root, 'build', 'strands', 'index.zip'));
const nl = archive.readUInt16LE(26), el = archive.readUInt16LE(28);
const method = archive.readUInt16LE(8), comp = archive.readUInt32LE(18);
const body = archive.subarray(30 + nl + el, 30 + nl + el + comp);
const { inflateRawSync } = await import('node:zlib');
const stage = mkdtempSync(path.join(tmpdir(), 'js13k-camlive-'));
const pagePath = path.join(stage, 'index.html');
writeFileSync(pagePath, method === 0 ? body : inflateRawSync(body));

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 900, height: 640 } });
await page.goto(pathToFileURL(pagePath).href, { waitUntil: 'load' });
await page.waitForTimeout(500);
await page.keyboard.press('Space');
await page.waitForTimeout(300);
await page.evaluate(() => { window.__cam = []; });
await page.keyboard.down('ArrowUp');
await page.waitForTimeout(secs * 500);
await page.keyboard.down('ArrowLeft');
await page.waitForTimeout(700);
await page.keyboard.up('ArrowLeft');
await page.waitForTimeout(secs * 500);
await page.keyboard.up('ArrowUp');
const rows = await page.evaluate(() => window.__cam || []);
await browser.close();
if (!rows.length) { console.log('no probe data - is this a --cheats build?'); process.exit(1); }

const dirs = [], eyes = [], fovs = [], ts = [];
for (const r of rows) {
  ts.push(r[0]); eyes.push([r[1], r[2], r[3]]); fovs.push(r[7]);
  let dx = r[4] - r[1], dy = r[5] - r[2], dz = r[6] - r[3];
  const l = Math.hypot(dx, dy, dz) || 1;
  dirs.push([dx / l, dy / l, dz / l]);
}
// Normalise per-frame quantities by frame time so a slow frame is not
// mistaken for a jerk: what matters is acceleration in units per second^2.
const acc = [], swing = [], fovRate = [];
for (let i = 2; i < eyes.length; i++) {
  const h1 = (ts[i - 1] - ts[i - 2]) / 1000, h2 = (ts[i] - ts[i - 1]) / 1000;
  if (h1 <= 0 || h2 <= 0) continue;
  const v1 = eyes[i - 1].map((v, k) => (v - eyes[i - 2][k]) / h1);
  const v2 = eyes[i].map((v, k) => (v - eyes[i - 1][k]) / h2);
  acc.push(Math.hypot(...v2.map((v, k) => (v - v1[k]) / h2)));
  const d = Math.max(-1, Math.min(1, dirs[i][0] * dirs[i - 1][0] + dirs[i][1] * dirs[i - 1][1] + dirs[i][2] * dirs[i - 1][2]));
  swing.push(Math.acos(d) * 180 / Math.PI / h2);
  fovRate.push(Math.abs(fovs[i] - fovs[i - 1]) * 180 / Math.PI / h2);
}
const stat = (a, name, unit) => {
  const s = [...a].sort((x, y) => x - y);
  const mean = a.reduce((x, y) => x + y, 0) / a.length;
  console.log(`${name.padEnd(26)} mean ${mean.toFixed(1)}${unit}  p90 ${s[Math.floor(a.length * .9)].toFixed(1)}  p99 ${s[Math.floor(a.length * .99)].toFixed(1)}  max ${s[s.length - 1].toFixed(1)}`);
};
console.log(`samples: ${rows.length}, span ${((ts[ts.length - 1] - ts[0]) / 1000).toFixed(1)}s\n`);
stat(acc, 'eye accel', ' u/s^2');
stat(swing, 'view swing rate', ' deg/s');
stat(fovRate, 'fov rate', ' deg/s');

// A single glitch and a constant judder produce similar tails; only the
// timing tells them apart. List the worst events with when they happened.
const worst = (a, name, thr) => {
  const hits = [];
  for (let i = 0; i < a.length; i++) if (a[i] > thr) hits.push([((ts[i + 2] - ts[0]) / 1000).toFixed(2), a[i].toFixed(0)]);
  console.log(`\n${name} over ${thr}: ${hits.length} frames`);
  console.log('  ' + hits.slice(0, 14).map(([t, v]) => `${t}s:${v}`).join('  ') + (hits.length > 14 ? ' ...' : ''));
};
worst(swing, 'view swing', 400);
worst(acc, 'eye accel', 300);
worst(fovRate, 'fov rate', 60);

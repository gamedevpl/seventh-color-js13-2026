// A contact sheet of every pose. The rig is the game here, so being able to
// LOOK at all ten poses in one command is the instrument this build needs
// most - a gait that reads as broken is not something a byte count reports.
//
// Loads build/snap/index.html directly (not the zip): this runs constantly
// during rig work, and unpacking an archive to look at a pose is friction.
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = process.argv[2] || '/tmp/snap-poses';
const only = process.argv.find((a) => /^--pose=/.test(a))?.split('=')[1];
// Poses are cyclic; a still of a gait is a lie unless it is taken at a
// stated moment, so each shot names the time it was taken at.
const AT = Number(process.argv.find((a) => /^--at=/.test(a))?.split('=')[1] || 1.6);
const CAM = process.argv.find((a) => /^--cam=/.test(a))?.split('=')[1] || '0.9,0.12,4.6';
// A whole look as mane,tail,coat,horn,hoof,glitter, so a contact sheet can
// be taken of a STYLED unicorn rather than only of the default one.
const DECO = process.argv.find((a) => /^--deco=/.test(a))?.split('=')[1];
const HIDE = process.argv.includes('--nogui');

mkdirSync(out, { recursive: true });
const file = path.join(root, 'build', 'snap', 'index.html');
const NAMES = ['graze', 'idle', 'walk', 'trot', 'gallop', 'rear', 'toss', 'shake', 'sleep', 'prance', 'bow'];

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 900, height: 620 } });
page.on('pageerror', (e) => { console.error('PAGE ERROR:', e.message); process.exitCode = 1; });

const list = only === undefined ? NAMES.map((_, i) => i) : [Number(only)];
for (const i of list) {
  const url = `${pathToFileURL(file).href}?pose=${i}&cam=${CAM}`
    + (DECO ? `&deco=${DECO}` : '') + (HIDE ? '&ui=0' : '');
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(AT * 1000);
  await page.screenshot({ path: path.join(out, `${String(i)}-${NAMES[i]}.png`) });
  console.log(`  ${i} ${NAMES[i]}`);
}
await browser.close();
console.log(`\n  ${list.length} poses -> ${out}`);

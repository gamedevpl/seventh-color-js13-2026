// Did you collect the dust you actually drove through?
//
// The reported symptom - "wizualnie przejeżdżam przez pył, a go nie
// zbieram" - is invisible to every other probe, because the game's own
// numbers looked fine: dust was collected, energy went up, the balance
// tool was happy. What was wrong was WHICH dust. The pickup measured from
// the track centreline, so the lane you steered into never entered into
// it: motes near the edge were unreachable however exactly you drove
// through them, and motes on the centreline came to you from the far side.
//
// So this probe watches the drawn unicorn and the live star list, and asks
// the player's question: was anything I passed through left behind?
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inflateRawSync } from 'node:zlib';
import { chromium } from 'playwright-core';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const a = readFileSync(path.join(root, 'build', 'strands', 'index.zip'));
const nl = a.readUInt16LE(26), el = a.readUInt16LE(28);
const method = a.readUInt16LE(8), comp = a.readUInt32LE(18);
const stage = mkdtempSync(path.join(tmpdir(), 'js13k-pickup-'));
const p0 = path.join(stage, 'index.html');
writeFileSync(p0, method === 0 ? a.subarray(30+nl+el, 30+nl+el+comp) : inflateRawSync(a.subarray(30+nl+el, 30+nl+el+comp)));

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 900, height: 640 } });
await page.goto(pathToFileURL(p0).href, { waitUntil: 'load' });
await page.waitForTimeout(600);
if (!(await page.evaluate(() => !!window.__stars))) {
  console.log('FAIL  no probe data - build with --cheats first');
  await browser.close(); process.exit(1);
}
// Into the run.
for (let i = 0; i < 2; i++) { await page.keyboard.press('Space'); await page.waitForTimeout(2200); }
await page.waitForTimeout(5400);

// Drive it like a player hunting dust: boost, and swing across the deck
// rather than sitting on the centreline, which is the only place the old
// pickup could see.
const drive = async (ms, key) => {
  await page.keyboard.down('ArrowUp');
  if (key) await page.keyboard.down(key);
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    await page.waitForTimeout(50);
    await page.evaluate(() => {
      const u = window.__uni, s = window.__stars;
      if (!u || !s) return;
      window.__seen = window.__seen || new Map();
      for (const st of s) {
        // 1.5 is well inside the unicorn's own body: at this range the mote
        // is visibly ON the player, not merely nearby.
        const d = Math.hypot(st.p[0]-u[0], st.p[1]-u[1], st.p[2]-u[2]);
        if (d < 1.5) window.__seen.set(st, Math.min(window.__seen.get(st) ?? 9, d));
      }
    });
  }
  if (key) await page.keyboard.up(key);
  await page.keyboard.up('ArrowUp');
};
await drive(4000, 'ArrowLeft');
await drive(4000, 'ArrowRight');
await drive(3000, null);
await drive(4000, 'ArrowLeft');

const r = await page.evaluate(() => {
  const seen = window.__seen || new Map();
  let through = 0, missed = 0, worst = 0;
  for (const [st, d] of seen) { through++; if (!st.taken) { missed++; worst = Math.max(worst, d); } }
  const all = window.__stars || [];
  return { through, missed, worst, taken: all.filter((s) => s.taken).length, total: all.length };
});
await browser.close();

console.log(`stars driven through (within 1.5u of the unicorn): ${r.through}`);
console.log(`...of those, left behind uncollected:              ${r.missed}`);
console.log(`collected this run:                                ${r.taken} of ${r.total} placed`);
const ok = r.through > 0 && r.missed === 0;
if (!r.through) console.log('\nFAIL: never drove through a single mote - the probe learned nothing');
else console.log(ok ? '\nPASS: everything the unicorn passed through was collected'
  : `\nFAIL: ${r.missed} motes passed through and left behind (closest miss ${r.worst.toFixed(2)}u)`);
process.exit(ok ? 0 : 1);

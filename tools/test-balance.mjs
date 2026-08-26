// Is the stardust economy playable? Boost burns dust, demands need speed,
// and if a full tank cannot be refilled by collecting what is on the road,
// the run degenerates into cruising - or worse, into falling off the same
// bend forever. Runs a fixed policy in a real browser and reports what the
// numbers actually do.
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const secs = Number(process.argv.find((a) => /^--secs=/.test(a))?.split('=')[1] || 40);
// Two policies, because they answer different questions.
//   blind  - weaves on a fixed schedule, ignoring the track. The worst case:
//            someone who has not learned to read a bend yet.
//   skilled- closes the loop on the probe and steers INTO the bend, which is
//            what the game asks of you. Without this the harness steers the
//            wrong way through half of every sustained arc, so it charges a
//            long banked bend for a mistake the player is not making.
//   idle   - steers to survive but NEVER boosts. This is the policy that
//            answers the only question that matters about the chase: can
//            you catch the rainbow by doing nothing? If it ever catches,
//            the pursuit is decoration.
const skilled = process.argv.includes('--skill');
const idle = process.argv.includes('--idle');
// --jump makes the policy take the kickers. The point of the kicker is that
// it is where the fuel is, so measuring with and without it is the only way
// to know whether the dust economy actually rewards playing it.
const jump = process.argv.includes('--jump');
const archive = readFileSync(path.join(root, 'build', 'strands', 'index.zip'));
const nl = archive.readUInt16LE(26), el = archive.readUInt16LE(28);
const method = archive.readUInt16LE(8), comp = archive.readUInt32LE(18);
const body = archive.subarray(30 + nl + el, 30 + nl + el + comp);
const { inflateRawSync } = await import('node:zlib');
const stage = mkdtempSync(path.join(tmpdir(), 'js13k-bal-'));
const pagePath = path.join(stage, 'index.html');
writeFileSync(pagePath, method === 0 ? body : inflateRawSync(body));

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 900, height: 640 } });
await page.goto(pathToFileURL(pagePath).href, { waitUntil: 'load' });
await page.waitForTimeout(500);
await page.keyboard.press('Space');
await page.evaluate(() => { window.__st = []; });
if (!idle) await page.keyboard.down('ArrowUp');
if (skilled || idle) {
  // Steering INTO the bend means matching the sign of turnRate: left is +1
  // in turnDir and the centrifugal term is -turnRate, so they cancel when
  // the two signs agree. The second term pulls a drifting lane back to the
  // middle. Held at ~90ms, well inside the lane's 0.38s time constant.
  let cur = null;
  for (let i = 0; i < secs * 11; i++) {
    const st = await page.evaluate(() => {
      const a = window.__st; const r = a && a[a.length - 1];
      return r ? [r[7], r[8], r[10], r[2], r[11], r[12]] : null;
    });
    // Arm a kicker only with fuel to launch on: it needs 30 to stay up, and
    // a dry tank cannot reach 30. A player learns that; the policy has to be
    // told.
    if (jump && st && st[2] && st[3] > 45) await page.keyboard.press('Space');
    let want = null;
    if (st && st[4]) {
      // AIRBORNE: the ground rule is wrong here. Steering in the air moves
      // you sideways off the deck, and a kicker landing outside 3.6 is a
      // fall - so the only sane input is to centre up. Left is +1 in
      // turnDir and lat follows it, so positive lat wants Right.
      want = st[5] > .4 ? 'ArrowRight' : st[5] < -.4 ? 'ArrowLeft' : null;
    } else if (st) {
      const d = st[1] * 2.2 - st[0] * 1.4;
      want = d > .25 ? 'ArrowLeft' : d < -.25 ? 'ArrowRight' : null;
    }
    if (want !== cur) {
      if (cur) await page.keyboard.up(cur);
      if (want) await page.keyboard.down(want);
      cur = want;
    }
    await page.waitForTimeout(90);
  }
  if (cur) await page.keyboard.up(cur);
} else {
  // Weave on a fixed schedule - a player who never lifts off and never reads
  // the road.
  for (let i = 0; i < secs; i++) {
    const key = i % 4 === 1 ? 'ArrowLeft' : i % 4 === 3 ? 'ArrowRight' : null;
    if (key) { await page.keyboard.down(key); await page.waitForTimeout(420); await page.keyboard.up(key); await page.waitForTimeout(580); }
    else await page.waitForTimeout(1000);
  }
}
if (!idle) await page.keyboard.up('ArrowUp');
const rows = await page.evaluate(() => window.__st || []);
await browser.close();
if (!rows.length) { console.log('no probe data - is this a --cheats build?'); process.exit(1); }

const sp = rows.map((r) => r[1]), en = rows.map((r) => r[2]);
const falls = rows[rows.length - 1][3], jumps = rows[rows.length - 1][4];
const burnT = rows[rows.length - 1][6];
const rainbowFrames = rows.filter((r) => r[5]).length;
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const pct = (a, f) => (a.filter(f).length / a.length * 100).toFixed(0);
const span = (rows[rows.length - 1][0] - rows[0][0]) / 1000;
console.log(`${span.toFixed(0)}s of full-throttle play, ${idle ? 'NO BOOST AT ALL' : jump ? 'boosting and taking the kickers' : skilled ? 'steering into the bends' : 'weaving blind'}\n`);
console.log(`speed    mean ${mean(sp).toFixed(1)}  min ${Math.min(...sp).toFixed(1)}  max ${Math.max(...sp).toFixed(1)}`);
console.log(`         under 20 (serpentine minimum): ${pct(sp, (v) => v < 20)}% of frames`);
console.log(`         under 23 (corkscrew minimum):  ${pct(sp, (v) => v < 23)}% of frames`);
console.log(`stardust mean ${mean(en).toFixed(1)}  empty: ${pct(en, (v) => v <= 0.5)}% of frames`);
// The chase, which is the whole shape of the run: how far the rainbow sits,
// and whether this policy ever actually reaches it.
const gaps = rows.filter((r) => !r[5]).map((r) => r[9]);
const caughtAt = rows.findIndex((r) => r[5]);
if (gaps.length) {
  console.log(`gap      mean ${mean(gaps).toFixed(0)}u  min ${Math.min(...gaps).toFixed(0)}  max ${Math.max(...gaps).toFixed(0)}`);
}
console.log(`caught   ${caughtAt < 0 ? 'never' : ((rows[caughtAt][0] - rows[0][0]) / 1000).toFixed(1) + 's'}`);
console.log(`falls ${falls}   jumps ${jumps}   rainbow ${(rainbowFrames / rows.length * 100).toFixed(0)}% of frames   burn total ${burnT.toFixed(1)}s`);
console.log();
if (falls > span / 6) console.log('WARN: falling more than once every 6 seconds - too punishing');
if (Number(pct(en, (v) => v <= 0.5)) > 75) console.log('WARN: tank empty almost always - boost is unaffordable');
if (Number(pct(sp, (v) => v < 20)) > 50) console.log('WARN: below the serpentine minimum most of the time');

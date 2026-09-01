// Unicorn Fireball's probe. Drives the DEV build (npm run fireball:dev)
// in headless Chromium and asks the questions a herd game has to answer
// before anyone plays it:
//   - does the title boot, and does one press wake it without leaving it?
//   - does gathering work: does a herd grow when its leader walks its meadow?
//   - does a charge fold the herd in, and does release fire a ball that
//     carries the herd and puts it back down?
//   - does a match END: with the player on autopilot, do the rivals fight
//     each other to a conclusion inside a few minutes, and does the player
//     both win and lose sometimes rather than always one or the other?
// Runs the sim through window.FB.step directly for the balance part, so a
// hundred matches cost seconds rather than hours.

import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const args = process.argv.slice(2);
const matches = Number(args.find((a) => /^--matches=/.test(a))?.split('=')[1] || 24);
const html = readFileSync(path.join(root, 'build/fireball/index.html'));
const stage = mkdtempSync(path.join(tmpdir(), 'fb-'));
const pagePath = path.join(stage, 'index.html');
writeFileSync(pagePath, html);

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 900, height: 640 } });
const problems = [];
page.on('console', (m) => { if (m.type() === 'error' && !/GL Driver/.test(m.text())) problems.push(m.text()); });
page.on('pageerror', (e) => problems.push(e.message));
await page.goto(pathToFileURL(pagePath).href);
await page.waitForTimeout(800);

let fails = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(44)} ${detail}`);
  if (!ok) fails++;
};
const st = () => page.evaluate(() => ({
  mode: FB.mode, n: FB.leaders[0].n, st: FB.leaders[0].st, chg: FB.leaders[0].chg, charge: FB.leaders[0].charge,
  balls: FB.balls.length, mine: !!FB.leaders[0].ball, alive: FB.leaders.filter((L) => L.st !== 3).length, hearts: FB.leaders[0].hearts,
}));

check('boots to the title', (await st()).mode === 'title');
await page.keyboard.press('Space');
await page.waitForTimeout(300);
check('one press wakes the title and stays', (await st()).mode === 'title');
await page.keyboard.press('Space');
await page.waitForTimeout(300);
check('second press starts the run', (await st()).mode === 'run');
await page.screenshot({ path: path.join(root, 'build/fireball/probe-start.png') });

// Gathering: walk the meadow for a few seconds.
// A slow circle round the meadow: forward, with a long turn held.
await page.keyboard.down('ArrowLeft');
await page.waitForTimeout(5000);
await page.keyboard.up('ArrowLeft');
let s = await st();
check('walking the meadow gathers a herd', s.n >= 2, `herd ${s.n}`);
await page.screenshot({ path: path.join(root, 'build/fireball/probe-herd.png') });

// The charge and the fireball.
await page.keyboard.down('Space');
await page.waitForTimeout(900);
s = await st();
check('holding SPACE charges', s.chg === 1 && s.charge > .2, `charge ${s.charge.toFixed(2)}`);
await page.screenshot({ path: path.join(root, 'build/fireball/probe-charge.png') });
await page.waitForTimeout(2500);
await page.keyboard.up('Space');
await page.waitForTimeout(200);
s = await st();
check('release fires a fireball carrying the herd', s.mine && s.st === 2, `mine ${s.mine} st ${s.st}`);
await page.screenshot({ path: path.join(root, 'build/fireball/probe-ball.png') });
await page.waitForTimeout(3500);
s = await st();
check('the fireball lands and the herd unfolds', !s.mine && s.st !== 2, `balls ${s.balls} st ${s.st} herd ${s.n}`);
check('the herd survived the ride, or was hit', s.n >= 2 || s.hearts < 3, `herd ${s.n} hearts ${s.hearts}`);
await page.screenshot({ path: path.join(root, 'build/fireball/probe-land.png') });

// A clash, for looking at: step the sim until two fireballs meet, then
// let the frame draw it.
const clashAt = await page.evaluate(async () => {
  FB.reset(0, true);
  for (let i = 0; i < 30 * 400; i++) {
    FB.step(1 / 30, { turn: 0 });
    const e = FB.events.find((e) => e.k === 'boom' && e.pw > 3);
    if (e) return [e.x, e.z];
  }
});
check('two fireballs clash within an autopilot match', !!clashAt);
await page.waitForTimeout(250);
await page.screenshot({ path: path.join(root, 'build/fireball/probe-clash.png') });

// Balance: run whole matches through the sim with the player on autopilot.
// The player brain is the rival brain, so this measures whether the rules
// converge, not whether a human can win them.
const results = await page.evaluate(async (matches) => {
  const out = [];
  for (let m = 0; m < matches; m++) {
    FB.reset(m % 7, true);
    let t = 0, ballsSeen = 0, clashes = 0, maxHerd = 0;
    while (t < 420) {
      FB.step(1 / 30, { turn: 0 });
      t += 1 / 30;
      const b = FB.balls.length;
      ballsSeen = Math.max(ballsSeen, b);
      for (const L of FB.leaders) maxHerd = Math.max(maxHerd, L.n);
      for (const e of FB.events) if (e.k === 'boom' && e.pw > 2) clashes++;
      FB.events.length = 0;
      const alive = FB.leaders.filter((L) => L.st !== 3).length;
      if (alive <= 1) break;
    }
    const alive = FB.leaders.filter((L) => L.st !== 3);
    out.push({ t: Math.round(t), ended: alive.length <= 1, playerWon: alive.length === 1 && alive[0] === FB.leaders[0], playerAlive: FB.leaders[0].st !== 3, ballsSeen, clashes, maxHerd });
  }
  return out;
}, matches);
const ended = results.filter((r) => r.ended).length;
const wins = results.filter((r) => r.playerWon).length;
const avgT = results.reduce((a, r) => a + r.t, 0) / results.length;
const clashes = results.reduce((a, r) => a + r.clashes, 0) / results.length;
console.log(`  ${matches} autopilot matches: ${ended} ended, player won ${wins}, avg ${avgT.toFixed(0)}s, ${clashes.toFixed(1)} clashes/match, max herd ${Math.max(...results.map((r) => r.maxHerd))}`);
check('autopilot matches end inside 7 minutes', ended / matches >= .8, `${ended}/${matches}`);
check('matches end by fighting, not waiting', clashes >= .5, `${clashes.toFixed(1)} clashes/match`);
check('fireballs get thrown', results.every((r) => r.ballsSeen > 0));
check('an autopilot player wins sometimes and loses sometimes', wins > 0 && wins < matches, `${wins}/${matches}`);
check('no page errors', !problems.length, problems.join(' | ').slice(0, 200));
await browser.close();
process.exit(fails ? 1 : 0);

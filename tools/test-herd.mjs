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
await page.addInitScript(() => {
  const proto = (window.AudioContext || window.webkitAudioContext).prototype, orig = proto.createOscillator;
  window.__oscs = 0;
  proto.createOscillator = function () { window.__oscs++; return orig.call(this); };
});
await page.goto(pathToFileURL(pagePath).href);
await page.waitForTimeout(800);

let fails = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(44)} ${detail}`);
  if (!ok) fails++;
};
const st = () => page.evaluate(() => ({
  mode: FB.mode, n: FB.leaders[0].n, st: FB.leaders[0].st, chg: FB.leaders[0].chg, charge: FB.leaders[0].charge,
  spd: FB.leaders[0].spd, wave: FB.leaders[0].wave, yaw: FB.leaders[0].yaw, hearts: FB.leaders[0].hearts, alive: FB.leaders.filter((L) => L.st !== 3).length, hearts: FB.leaders[0].hearts,
}));

check('boots to the title', (await st()).mode === 'title');
check('silent before any gesture', (await page.evaluate(() => window.__oscs)) === 0);
await page.keyboard.press('Space');
await page.waitForTimeout(300);
check('one press wakes the title and stays', (await st()).mode === 'title');
await page.keyboard.press('Space');
await page.waitForTimeout(300);
check('second press starts the run', (await st()).mode === 'run');
await page.screenshot({ path: path.join(root, 'build/fireball/probe-start.png') });

// Gathering: walk the meadow for a few seconds.
// A sweep of the home meadow: sprint, with the turn held in bursts, so
// the circle is wide enough to actually pass the grazing unicorns rather
// than spinning on the spot in the middle of them.
await page.keyboard.down('ArrowUp');
for (let i = 0; i < 4; i++) {
  await page.keyboard.down('ArrowLeft');
  await page.waitForTimeout(700);
  await page.keyboard.up('ArrowLeft');
  await page.waitForTimeout(900);
}
await page.keyboard.up('ArrowUp');
await page.waitForTimeout(400);
let s = await st();
check('sweeping the meadow gathers a herd', s.n >= 2, `herd ${s.n}`);
await page.screenshot({ path: path.join(root, 'build/fireball/probe-herd.png') });

// The charge, and the rainbow. Holding builds speed slowly; held long
// enough the herd ignites, and the rainbow runs until the herd is spent.
// Aimed across the plain rather than off it. This section is for the
// pictures and for the feel of the button; what the rainbow COSTS is
// measured below, in the sim, where the rest of the plain can be held
// still - a live charge through six rival herds loses hearts to horns and
// reads every one of them as the rainbow burning the herd.
await page.evaluate(() => { FB.leaders[0].yaw = -Math.PI / 2; });
await page.waitForTimeout(400);
const spd0 = (await st()).spd;
await page.keyboard.down('Space');
// Long enough that a slow frame cannot decide the answer: at 1.2s the
// speed lands within a tenth of the threshold and the gate turns on the
// weather rather than on the game.
await page.waitForTimeout(1700);
s = await st();
check('holding SPACE charges', s.chg === 1 && s.charge > .25, `charge ${s.charge.toFixed(2)}`);
check('...and the herd gathers speed', s.spd > spd0 + 3, `speed ${spd0.toFixed(1)} -> ${s.spd.toFixed(1)}`);
await page.screenshot({ path: path.join(root, 'build/fireball/probe-charge.png') });
await page.waitForTimeout(2600);
s = await st();
check('held long enough, the charge ignites', s.wave > 0, `rainbow ${s.wave} at charge ${s.charge.toFixed(2)}`);
await page.screenshot({ path: path.join(root, 'build/fireball/probe-wave.png') });
await page.waitForTimeout(600);
await page.keyboard.up('Space');
await page.waitForTimeout(700);
s = await st();
check('letting go puts the rainbow out', s.wave === 0 && !s.chg, `rainbow ${s.wave}`);
await page.screenshot({ path: path.join(root, 'build/fireball/probe-land.png') });

// What the rainbow costs, on an empty plain: the rivals are frozen at
// their meadows, the player charges across the middle, and the herd is
// counted at ignition and again two seconds into the burn.
const burn = await page.evaluate(async () => {
  FB.reset(0, false);
  const P = FB.leaders[0];
  for (const L of FB.leaders) if (L !== P) L.ai = null;
  P.x = -40; P.z = 0; P.yaw = 0;
  // Hand it a herd: the nearest twelve of its colour fall in behind.
  let given = 0;
  for (const u of FB.units) if (u !== P && u.col === P.col && given < 12) { u.lead = 0; u.x = P.x - 2 - given; u.z = P.z; given++; }
  let lit = 0, after = 0, t = 0;
  for (let i = 0; i < 30 * 12; i++) {
    FB.charge(P, 1);
    FB.step(1 / 30, { turn: 0 });
    FB.events.length = 0;
    if (P.wave && !lit) { lit = P.n; t = 0; }
    if (lit) { t += 1 / 30; if (t > 2 && !after) { after = P.n; break; } }
  }
  return { given, lit, after, hearts: P.hearts, x: Math.round(P.x) };
});
check('the rainbow burns the herd as it runs', burn.lit > 0 && burn.after > 0 && burn.after < burn.lit,
  `herd ${burn.lit} -> ${burn.after} over two seconds`);
check('...and the leader survives its own rainbow', burn.hearts === 3, `hearts ${burn.hearts} at x ${burn.x}`);

// The edge is fatal, for the player and for the brains alike.
const edge = await page.evaluate(async () => {
  FB.reset(0, false);
  const P = FB.leaders[0];
  P.x = 0; P.z = 0; P.yaw = 0;
  for (let i = 0; i < 30 * 40 && P.st !== 3; i++) FB.step(1 / 30, { turn: 0, fwd: 1 });
  const out = { playerDied: P.st === 3, x: Math.round(P.x), z: Math.round(P.z) };
  // And the brains: run four whole matches and count how many leaders the
  // edge took. A brain that walks off it would win the plain by accident.
  let fellCount = 0, deaths = 0;
  for (let m = 0; m < 4; m++) {
    FB.reset(m, true);
    for (let i = 0; i < 30 * 240; i++) {
      FB.step(1 / 30, { turn: 0 });
      for (const e of FB.events) { if (e.k === 'fell') fellCount++; if (e.k === 'dead') deaths++; }
      FB.events.length = 0;
      if (FB.leaders.filter((L) => L.st !== 3).length <= 1) break;
    }
  }
  out.fellCount = fellCount; out.deaths = deaths;
  return out;
});
check('running off the plain ends the run', edge.playerDied, `at ${edge.x},${edge.z}`);
check('the brains keep off the edge', edge.fellCount <= edge.deaths * .25, `${edge.fellCount} of ${edge.deaths} deaths were falls`);

// Touch. The lower halves steer, the top strip is the button: a pointer
// held there must charge, and lifting it must fire. Checked against the
// keyboard, which the section above already proved.
const tap = async (x, y, ms) => {
  const box = await page.evaluate(() => { const r = document.querySelector('canvas:last-of-type').getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; });
  await page.mouse.move(box[0] + box[2] * x, box[1] + box[3] * y);
  await page.mouse.down();
  await page.waitForTimeout(ms);
  return async () => { await page.mouse.up(); };
};
await page.evaluate(() => FB.reset(0, false));
await page.waitForTimeout(300);
let yaw0 = await page.evaluate(() => FB.leaders[0].yaw);
let lift = await tap(.2, .7, 700);
let yaw1 = await page.evaluate(() => FB.leaders[0].yaw);
await lift();
check('a left thumb steers left (yaw falls)', yaw1 < yaw0 - .5, `yaw ${yaw0.toFixed(2)} -> ${yaw1.toFixed(2)}`);
yaw0 = yaw1;
lift = await tap(.8, .7, 700);
yaw1 = await page.evaluate(() => FB.leaders[0].yaw);
await lift();
check('a right thumb steers right (yaw rises)', yaw1 > yaw0 + .5, `yaw ${yaw0.toFixed(2)} -> ${yaw1.toFixed(2)}`);
await page.waitForTimeout(3500);
lift = await tap(.5, .12, 1200);
s = await st();
check('a thumb on the top strip charges', s.chg === 1 && s.charge > .25, `charge ${s.charge.toFixed(2)}`);
await lift();
await page.waitForTimeout(300);
s = await st();
check('lifting it lets the charge go', !s.chg, `chg ${s.chg}`);

// Audio: the browser must be silent until a gesture, and the run must be
// audible after one. Counted in oscillators, as Rainbow Surfer does.
const oscs = await page.evaluate(() => window.__oscs || 0);
check('the run makes sound after the gesture', oscs > 20, `${oscs} oscillators so far`);

// A clash, for looking at: step the sim until two fireballs meet, then
// let the frame draw it.
const clashAt = await page.evaluate(async () => {
  for (let seed = 0; seed < 12; seed++) {
    FB.reset(seed, true);
    for (let i = 0; i < 30 * 400; i++) {
      FB.step(1 / 30, { turn: 0 });
      const e = FB.events.find((e) => e.k === 'boom');
      FB.events.length = 0;
      if (e) return [e.x, e.z];
      if (FB.leaders.filter((L) => L.st !== 3).length <= 1) break;
    }
  }
});
check('two rainbows clash within an autopilot match', !!clashAt);

// And one blast, photographed on purpose: the sim's own clash lands in
// whatever frame the search happened to stop on, which is never the one
// worth looking at.
await page.evaluate(() => {
  FB.reset(0, false);
  const P = FB.leaders[0];
  // In front of the lens: the camera looks along the leader's own yaw.
  FB.events.push({ k: 'boom', x: P.x + Math.cos(P.yaw) * 20, z: P.z + Math.sin(P.yaw) * 20, pw: 14 });
});
await page.waitForTimeout(330);
await page.screenshot({ path: path.join(root, 'build/fireball/probe-boom.png') });
await page.waitForTimeout(380);
await page.screenshot({ path: path.join(root, 'build/fireball/probe-boom2.png') });
await page.waitForTimeout(420);
await page.screenshot({ path: path.join(root, 'build/fireball/probe-clash.png') });

// A win stays won. The closing shot keeps the plain running, so a herd
// still carrying speed can cross the line while nobody is steering - the
// first player to win a match watched the end screen change its mind.
// Driven through the real loop, because the win transition lives there.
await page.evaluate(() => {
  FB.reset(0, false);
  const P = FB.leaders[0];
  for (const L of FB.leaders) if (L !== P) L.st = 3;
  P.x = 80; P.z = 0; P.yaw = 0; P.spd = 30;
});
await page.keyboard.down('ArrowUp');
await page.waitForTimeout(900);
let vic = await page.evaluate(() => ({ victory: FB.victory, mode: FB.mode, st: FB.leaders[0].st }));
check('winning the plain is recorded as a win', vic.victory === true && vic.mode === 'end', `victory ${vic.victory}, mode ${vic.mode}`);
await page.waitForTimeout(4000);
await page.keyboard.up('ArrowUp');
vic = await page.evaluate(() => ({ victory: FB.victory, st: FB.leaders[0].st, x: Math.round(FB.leaders[0].x) }));
check('...and running on afterwards cannot undo it', vic.victory === true && vic.st !== 3, `victory ${vic.victory}, leader st ${vic.st} at x ${vic.x}`);

// Balance: run whole matches through the sim with the player on autopilot.
// The player brain is the rival brain, so this measures whether the rules
// converge, not whether a human can win them.
const raw = await page.evaluate(async (matches) => {
  const out = [];
  for (let m = 0; m < matches; m++) {
    FB.reset(m % 7, true);
    let t = 0, ignitions = 0, answers = 0, litPairs = 0, clashes = 0, maxHerd = 0;
    while (t < 420) {
      FB.step(1 / 30, { turn: 0 });
      t += 1 / 30;
      for (const L of FB.leaders) maxHerd = Math.max(maxHerd, L.n);
      for (const e of FB.events) { if (e.k === 'boom') clashes++; if (e.k === 'ignite') { ignitions++; if (e.L.threat) answers++; } }
      const lit = FB.leaders.filter((L) => L.wave && L.st === 0);
      if (lit.length > 1) litPairs++;
      FB.events.length = 0;
      const alive = FB.leaders.filter((L) => L.st !== 3).length;
      if (alive <= 1) break;
    }
    const alive = FB.leaders.filter((L) => L.st !== 3);
    if (alive.length > 1) out.push({ stall: alive.map((L) => ({ col: L.col, n: L.n, hearts: L.hearts, chg: L.chg, charge: +L.charge.toFixed(2), cool: +L.cool.toFixed(1), stun: +L.stun.toFixed(1), st: L.st, d: Math.round(Math.hypot(L.x - alive[0].x, L.z - alive[0].z)) })) });
    out.push({ t: Math.round(t), ended: alive.length <= 1, playerWon: alive.length === 1 && alive[0] === FB.leaders[0], playerAlive: FB.leaders[0].st !== 3, ignitions, answers, litPairs, clashes, maxHerd });
  }
  return out;
}, matches);
const results = raw.filter((r) => !r.stall);
for (const r of raw) if (r.stall) console.log('  stalled:', JSON.stringify(r.stall));
const ended = results.filter((r) => r.ended).length;
const wins = results.filter((r) => r.playerWon).length;
const avgT = results.reduce((a, r) => a + r.t, 0) / results.length;
const clashes = results.reduce((a, r) => a + r.clashes, 0) / results.length;
const ignitions = results.reduce((a, r) => a + r.ignitions, 0) / results.length;
const answers = results.reduce((a, r) => a + r.answers, 0) / results.length, litPairs = results.reduce((a, r) => a + r.litPairs, 0) / results.length;
console.log(`  ${matches} autopilot matches: ${ended} ended, player won ${wins}, avg ${avgT.toFixed(0)}s, ${ignitions.toFixed(1)} rainbows (${answers.toFixed(1)} answers, ${(litPairs / 30).toFixed(1)}s of two lit) and ${clashes.toFixed(1)} clashes/match, max herd ${Math.max(...results.map((r) => r.maxHerd))}`);
check('autopilot matches end inside 7 minutes', ended / matches >= .8, `${ended}/${matches}`);
check('matches end by fighting, not waiting', clashes >= .3 || ignitions >= 3, `${clashes.toFixed(1)} clashes, ${ignitions.toFixed(1)} rainbows/match`);
check('rainbows ignite, one a match at least', ignitions >= 1, `${ignitions.toFixed(1)}/match`);
check('an autopilot player wins sometimes and loses sometimes', wins > 0 && wins < matches, `${wins}/${matches}`);
// Online the plain never ends: a leader with no hearts is stone for eight
// seconds and then rises at its own meadow with a herd to gather again.
// Offline nothing rises, because offline the run is over.
const rose = await page.evaluate(async () => {
  FB.reset(0, 1);
  const L = FB.leaders[1];
  L.hearts = 0; L.st = 3; L.gone = 0;
  const before = { st: L.st, x: L.x };
  for (let i = 0; i < 400; i++) FB.step(1 / 40, { over: 0 });
  const still = L.st;
  // Measured the moment it rises, not ten seconds later: the plain keeps
  // fighting, and a freshly risen leader can be knocked down again by a
  // rival before any later frame is read.
  let n = 0;
  while (L.st === 3 && n++ < 800) FB.step(1 / 40, { arena: 1 });
  const mine = FB.units.filter((u) => u.col === L.col && u !== L).length;
  return { before, still, after: L.st, hearts: L.hearts, herd: mine, secs: n / 40 };
});
check('a stone leader stays stone in a solo run', rose.still === 3);
check('...and rises again on a shared plain', rose.after === 0 && rose.hearts === 3, `after ${rose.secs.toFixed(1)}s, st ${rose.after}, hearts ${rose.hearts}`);
check('...with a meadow to gather again', rose.herd >= 5, `${rose.herd} of its colour back on the plain`);

check('no page errors', !problems.length, problems.join(' | ').slice(0, 200));
await browser.close();
process.exit(fails ? 1 : 0);

// Unicorn Fireball's online probe. Two headless browsers, one relay of our
// own that behaves like the competition's, and the questions a shared
// plain has to answer:
//   - do two people in a room agree on which of them runs it, without
//     saying a word about it to each other?
//   - do they end up on different herds, and does the second one's herd
//     obey the second one's thumbs rather than the first one's?
//   - does the plain the client draws match the plain the host is running?
//   - and when the host walks out mid-match, does the plain carry on from
//     where it was, in somebody else's hands?

import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { startRelay, startBridge } from './lib/relay.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const html = readFileSync(path.join(root, 'build/fireball/index.html'));
const stage = mkdtempSync(path.join(tmpdir(), 'fb-net-'));
const pagePath = path.join(stage, 'index.html');
writeFileSync(pagePath, html);

// `--live` runs the same questions against the competition's own relay,
// which is the only way to find out that our stand-in still tells the truth.
const live = process.argv.includes('--live');
const relay = live ? await startBridge('wss://relay.js13kgames.com') : await startRelay();
const room = relay.url + '/unicorn-fireball-probe-' + Math.random().toString(36).slice(2, 8);
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
const problems = [];

async function rider() {
  const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
  page.on('console', (m) => { if (m.type() === 'error' && !/GL Driver/.test(m.text())) problems.push(m.text()); });
  page.on('pageerror', (e) => problems.push(e.message));
  await page.goto(pathToFileURL(pagePath).href);
  await page.waitForTimeout(500);
  await page.keyboard.press('Space');
  await page.waitForTimeout(200);
  await page.evaluate((r) => FB.goOnline(r), room);
  return page;
}

let fails = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(46)} ${detail}`);
  if (!ok) fails++;
};
const look = (p) => p.evaluate(() => ({
  on: FB.net.on, host: FB.net.host, me: FB.net.me, seats: FB.net.seats, said: FB.net.said,
  mode: FB.mode, round: FB.net.round,
  yaw: FB.leaders.map((L) => L.yaw), n: FB.leaders.map((L) => L.n),
  x: FB.leaders.map((L) => Math.round(L.x * 10) / 10), z: FB.leaders.map((L) => Math.round(L.z * 10) / 10),
  sum: FB.units.reduce((a, u) => a + u.x + u.z, 0),
}));

const A = await rider();
await new Promise((r) => setTimeout(r, 400));
const B = await rider();
await new Promise((r) => setTimeout(r, 3000));

let a = await look(A), b = await look(B);
check('both sockets are up', a.on === 1 && b.on === 1);
check('exactly one of them runs the plain', a.host + b.host === 1, `A host ${a.host}, B host ${b.host}`);
check('they take different herds', a.me !== b.me && a.me >= 0 && b.me >= 0, `seats ${a.me} and ${b.me}`);
check('both count two riders', a.seats === 2 && b.seats === 2, `${a.seats} / ${b.seats}`);

// The client is drawing the host's plain, not one of its own.
const gap = Math.max(...a.x.map((v, i) => Math.abs(v - b.x[i])));
check('the client draws the host\'s plain', gap < 3, `worst leader off by ${gap.toFixed(2)}`);

// The far end of the wire: the guest's thumbs, the guest's herd, and
// nobody else's. The button goes first, while the herd is still fresh at
// its meadow: a herd steered blind for a few seconds can be dead, and a
// dead herd cannot charge, which says nothing about the wire.
const guest0 = a.host ? B : A, host0 = a.host ? A : B;
const seat0 = a.host ? b.me : a.me;
await guest0.keyboard.down('Space');
await new Promise((r) => setTimeout(r, 1600));
const held = await host0.evaluate((s) => {
  const L = FB.leaders[s];
  return { chg: L.chg, charge: L.charge, st: L.st, cool: L.cool };
}, seat0);
await guest0.keyboard.up('Space');
await new Promise((r) => setTimeout(r, 400));
check('a guest\'s button reaches the host', held.chg === 1 && held.charge > .2,
  `held ${held.chg}, charge ${held.charge.toFixed(2)} (st ${held.st}, cool ${held.cool.toFixed(1)})`);
check('...and letting go reaches it too', (await host0.evaluate((s) => FB.leaders[s].chg, seat0)) === 0);

const guest = a.host ? B : A, hostPage = a.host ? A : B;
const seat = a.host ? b.me : a.me, other = a.host ? a.me : b.me;
const before = await look(hostPage);
await guest.keyboard.down('ArrowRight');
await new Promise((r) => setTimeout(r, 1400));
await guest.keyboard.up('ArrowRight');
await new Promise((r) => setTimeout(r, 300));
const after = await look(hostPage);
const turn = (i) => Math.abs(Math.atan2(Math.sin(after.yaw[i] - before.yaw[i]), Math.cos(after.yaw[i] - before.yaw[i])));
check('a guest\'s thumb turns the guest\'s herd', turn(seat) > .8, `seat ${seat} turned ${turn(seat).toFixed(2)} rad`);
check('...and does not turn the host\'s', turn(other) < turn(seat), `host seat ${other} turned ${turn(other).toFixed(2)} rad`);

// And the guest's own screen must show it: a client is told states, and
// paints the charge back out of them.
await guest.keyboard.down('Space');
await new Promise((r) => setTimeout(r, 2000));
const lit = await guest.evaluate((s) => {
  const L = FB.leaders[s];
  return { charge: L.charge, wave: L.wave, st: L.st, hearts: L.hearts, cool: L.cool };
}, seat);
await guest.keyboard.up('Space');
check('...and the guest sees its own herd light up', lit.charge > .2 || lit.wave > 0,
  `charge ${lit.charge.toFixed(2)} (st ${lit.st}, hearts ${lit.hearts}, cool ${lit.cool.toFixed(1)})`);

await guest.screenshot({ path: path.join(root, 'build/fireball/probe-online.png') });

// A third rider arrives mid-match. The bug this replaces froze the plain
// for everyone for a second and a half every time somebody joined, because
// a smaller name took the plain off whoever already had it.
const beforeJoin = await look(hostPage);
const C = await rider();
await new Promise((r) => setTimeout(r, 2500));
const afterJoin = await look(hostPage);
const c = await look(C);
check('an arrival does not stop the plain', Math.abs(afterJoin.sum - beforeJoin.sum) > 40,
  `the plain moved ${Math.abs(afterJoin.sum - beforeJoin.sum).toFixed(0)} unit-sums while somebody joined`);
check('...and does not take it over', afterJoin.host === 1 && c.host === 0);
check('...and the newcomer gets its own herd', c.me >= 0 && c.me !== seat && c.me !== other, `seat ${c.me}`);
check('three riders, three counts agree', c.seats === 3 && afterJoin.seats === 3, `${afterJoin.seats} / ${c.seats}`);
await C.close();
await new Promise((r) => setTimeout(r, 1500));

// The host walks out. The plain must not blink: whoever is left picks it
// up from the state they were already drawing.
const lastSeen = await look(guest);
await hostPage.close();
await new Promise((r) => setTimeout(r, 4000));
const now = await look(guest);
check('the survivor takes over the plain', now.host === 1, `host ${now.host}, said "${now.said}"`);
check('...and the plain is the same plain', now.round === lastSeen.round, `round ${lastSeen.round} -> ${now.round}`);
const moved = Math.hypot(now.x[now.me] - lastSeen.x[lastSeen.me], now.z[now.me] - lastSeen.z[lastSeen.me]);
check('...not a fresh one dealt on the spot', moved < 60, `own herd moved ${moved.toFixed(1)} units across the handover`);
check('the survivor keeps running it', (await look(guest)).seats === 1);

await new Promise((r) => setTimeout(r, 1200));
const rolling = await look(guest);
check('the plain still runs with one rider', rolling.mode === 'run' && rolling.on === 1);

check('no page errors', problems.length === 0, problems.slice(0, 2).join(' | '));

await browser.close();
relay.close();
console.log(fails ? `\n${fails} failed` : '\nonline: all good');
process.exit(fails ? 1 : 0);

// Browser regressions for the QA findings, using a local relay only.
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { startRelay } from './lib/relay.mjs';
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
const relay = await startRelay(), room = relay.url + '/qa';
const errors = [];
async function page(viewport = { width: 1000, height: 740 }) {
  const p = await browser.newPage({ viewport });
  p.on('pageerror', e => errors.push(e.message));
  await p.addInitScript(() => {
    window.hudLines = [];
    const proto = CanvasRenderingContext2D.prototype, fill = proto.fillText, clear = proto.clearRect;
    proto.fillText = function (s, ...args) { hudLines.push(String(s)); return fill.call(this, s, ...args); };
    proto.clearRect = function (...args) { hudLines.length = 0; return clear.apply(this, args); };
  });
  await p.routeWebSocket(/relay\.js13kgames\.com/, ws => ws.close());
  await p.goto('file://' + process.cwd() + '/build/fireball/index.html');
  return p;
}
async function disconnect(p) {
  const id = await p.evaluate(() => FB.spy().id);
  for (const sockets of relay.rooms.values()) sockets.get(id)?.destroy();
  await p.waitForFunction(() => FB.mode === 'title');
}
try {
  const p = await page();
  await p.evaluate(() => { FB.reset(0, false); for (const L of FB.leaders) L.stun = 99; });
  const box = await p.locator('canvas').last().boundingBox();
  await p.mouse.move(box.x + box.width * .2, box.y + box.height * .7);
  await p.mouse.down(); await p.waitForFunction(() => FB.leaders[0].in.t === -1);
  await p.mouse.move(0, 0); await p.mouse.up();
  await p.waitForFunction(() => FB.leaders[0].in.t === 0);
  await p.keyboard.down('Shift'); await p.keyboard.down('A');
  await p.waitForFunction(() => FB.leaders[0].in.t === -1);
  await p.keyboard.up('A'); await p.keyboard.up('Shift');
  console.log('PASS outside-canvas release and uppercase WASD');
  await p.evaluate(() => FB.events.push({k: 'boom', x: FB.leaders[0].x + 70, z: FB.leaders[0].z, pw: 72}));
  await p.waitForFunction(() => !FB.events.length);
  assert.equal(await p.evaluate(() => FB.impact), null);
  await p.evaluate(() => FB.events.push({k: 'boom', x: FB.leaders[0].x, z: FB.leaders[0].z, pw: 72}));
  await p.waitForFunction(() => FB.impact !== null);
  console.log('PASS distant bot clash keeps the player camera; nearby impact still works');
  await p.evaluate(() => {
    FB.leaders[0].st = 3; FB.leaders[0].hearts = 0;
    FB.events.push({k: 'boom', x: 0, z: 0, pw: 72});
  });
  await p.waitForFunction(() => FB.mode === 'end' && hudLines.includes('DEFEAT'));
  assert.equal(await p.evaluate(() => FB.impact), null);
  assert.equal(await p.evaluate(() => FB.victory), false);
  const stopped = await p.evaluate(() => FB.leaders.map(L => [L.x, L.z, L.hearts]));
  await p.keyboard.down('ArrowRight'); await p.waitForTimeout(250);
  assert.deepEqual(await p.evaluate(() => FB.leaders.map(L => [L.x, L.z, L.hearts])), stopped);
  await p.keyboard.up('ArrowRight');
  await p.evaluate(() => FB.reset(0, false));
  console.log('PASS immediate solo game over, no impact delay or continuing bot battle');
  await p.setViewportSize({ width: 390, height: 844 });
  await p.waitForFunction(() => hudLines.includes('Rotate your phone to play'));
  const paused = await p.evaluate(() => FB.timer);
  await p.waitForTimeout(200);
  assert.equal(await p.evaluate(() => FB.timer), paused);
  await p.setViewportSize({ width: 844, height: 390 });
  console.log('PASS portrait prompt pauses the round');
  await p.evaluate(r => { FB.goHome(); FB.net.room = r; }, room);
  // Orientation changes deliver resize asynchronously; click the settled layout.
  await p.waitForFunction(() => Math.abs(document.querySelector('canvas').getBoundingClientRect().width - Math.min(innerWidth, innerHeight * 640 / 360)) < 1);
  let b = await p.locator('canvas').last().boundingBox();
  await p.mouse.click(b.x + b.width / 2, b.y + b.height * 298 / 360);
  await p.waitForFunction(() => FB.net.host && FB.net.me >= 0);
  b = await p.locator('canvas').last().boundingBox();
  await p.mouse.click(b.x + b.width / 2, b.y + b.height * 34 / 360);
  await p.waitForFunction(() => FB.mode === 'title');
  console.log('PASS pointer-accessible online and exit');
  await p.evaluate(r => FB.goOnline(r), room);
  await p.waitForFunction(() => FB.net.host && FB.net.me >= 0);
  await p.evaluate(() => { const L = FB.leaders[FB.net.me]; L.st = 3; L.hearts = L.gone = 0; });
  await p.setViewportSize({ width: 390, height: 844 });
  await p.waitForFunction(() => FB.leaders[FB.net.me].gone > 3);
  await p.setViewportSize({ width: 844, height: 390 });
  assert.ok(await p.evaluate(() => hudLines.includes('DOWN - BACK IN 2')));
  await p.waitForFunction(() => FB.leaders[FB.net.me].st === 0);
  const guest = await page(); await guest.evaluate(r => FB.goOnline(r), room);
  await guest.waitForFunction(() => FB.net.me >= 0 && !FB.net.host);
  await disconnect(guest);
  assert.equal(await guest.evaluate(() => FB.net.me), -1);
  assert.ok(await guest.evaluate(() => FB.leaders.every(L => L.ai && !L.in)));
  await guest.close(); await disconnect(p);
  await p.evaluate(r => FB.goOnline(r), room);
  await p.waitForFunction(() => FB.net.host && FB.net.me >= 0);
  assert.equal(await p.evaluate(() => FB.spy().names.length), 1);
  console.log('PASS host countdown, guest disconnect and fresh host election');
  assert.deepEqual(errors, []);
} finally {
  await browser.close(); relay.close();
}

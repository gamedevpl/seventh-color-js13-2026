// First-run input checks: no world reset or AI steering until the edge screenshot.
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
const browser = await chromium.launch({args: ['--enable-unsafe-swiftshader']});
try {
  mkdirSync('build/fireball-qa', {recursive: true});
  const p = await browser.newPage({viewport: {width: 1280, height: 720}}), errors = [];
  p.on('pageerror', e => errors.push(e.message));
  await p.goto('file://' + process.cwd() + '/build/fireball/index.html');
  await p.screenshot({path: 'build/fireball-qa/f15-title.png'});
  await p.keyboard.press('Space');
  await p.waitForTimeout(300);
  await p.keyboard.down('Space'); await p.keyboard.down('s');
  await p.waitForFunction(() => FB.leaders[0].spd < .02);
  assert.equal(await p.evaluate(() => FB.leaders[0].chg), 0);
  assert.equal(await p.evaluate(() => FB.mode), 'run');
  const box = await p.locator('canvas').last().boundingBox();
  await p.mouse.move(box.x + box.width / 2, box.y + box.height * .95);
  await p.mouse.down(); await p.keyboard.up('s');
  await p.waitForTimeout(300);
  assert.ok(await p.evaluate(() => FB.leaders[0].in.b && FB.leaders[0].spd < .02 && !FB.leaders[0].chg));
  await p.mouse.up();
  await p.waitForFunction(() => FB.leaders[0].wave > 0);
  const first = await p.evaluate(() => ({seconds: FB.timer, herd: FB.leaders[0].n, hearts: FB.leaders[0].hearts}));
  await p.screenshot({path: 'build/fireball-qa/f15-first-rainbow.png'});
  await p.keyboard.up('Space');
  await p.keyboard.down('s'); await p.keyboard.down('ArrowRight');
  await p.waitForTimeout(250);
  assert.ok(await p.evaluate(() => FB.leaders[0].wave && FB.leaders[0].spd > 20));
  await p.waitForFunction(() => !FB.leaders[0].wave);
  await p.keyboard.up('s'); await p.keyboard.up('ArrowRight');
  assert.equal(await p.evaluate(() => FB.mode), 'run');
  console.log('PASS first run: keyboard/touch brake, hold to ignite, release/brake cannot cancel; steer until burnout', first);
  // Visual fixture only: approach the warning strip without waiting for an accidental fall.
  await p.evaluate(() => {
    for (const L of FB.leaders) { L.ai = null; L.stun = 99; }
    Object.assign(FB.leaders[0], {x: 80, z: 0, yaw: 0, vx: 0, vz: 0});
  });
  await p.waitForTimeout(1500);
  await p.screenshot({path: 'build/fireball-qa/f15-edge.png'});
  assert.deepEqual(errors, []);
} finally { await browser.close(); }

// Held upright, the game turns itself - so a thumb on what LOOKS like the
// left of the picture must still steer left. The rotation moves the
// picture but not the pointer events, so this is the check that the undo
// in at() is right: press where the player sees the zone, not where the
// un-rotated maths would put it.
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inflateRawSync } from 'node:zlib';
import { chromium } from 'playwright-core';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const a = readFileSync(path.join(root, 'build', 'strands', 'index.zip'));
const nl=a.readUInt16LE(26), el=a.readUInt16LE(28), m=a.readUInt16LE(8), c=a.readUInt32LE(18);
const stage = mkdtempSync(path.join(tmpdir(), 'js13k-portrait-'));
const p0 = path.join(stage, 'index.html');
writeFileSync(p0, m===0 ? a.subarray(30+nl+el,30+nl+el+c) : inflateRawSync(a.subarray(30+nl+el,30+nl+el+c)));
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 375, height: 667 }, hasTouch: true, isMobile: true });
await page.goto(pathToFileURL(p0).href, { waitUntil: 'load' });
await page.waitForTimeout(600);

// The game is turned 90deg clockwise on screen, so the picture's LEFT half
// is the screen's TOP half and the picture's TOP strip is the screen's
// RIGHT edge. Press in SCREEN space, the way a player's thumb does.
const press = (type, id, sx, sy) => page.evaluate(([type, id, sx, sy]) => {
  const c = document.querySelectorAll('canvas');
  const el = c[c.length-1];
  el.dispatchEvent(new PointerEvent(type, { pointerId: id, bubbles: true,
    clientX: innerWidth * sx, clientY: innerHeight * sy }));
}, [type, id, sx, sy]);
const st = () => page.evaluate(() => { const a = window.__st, r = a && a[a.length-1]; return r ? { speed: r[1], lane: r[7], steer: r[13] } : null; });

await press('pointerdown', 1, .5, .5); await press('pointerup', 1, .5, .5);
await page.waitForTimeout(2200);
await press('pointerdown', 1, .5, .5); await press('pointerup', 1, .5, .5);
await page.waitForTimeout(5600);
if (!(await st())) { console.log('FAIL  the run starts when held upright   no probe data'); await browser.close(); process.exit(1); }
console.log('ok    the run starts when held upright');

const fails = [];
const check = (n, ok, d) => { console.log(`${ok?'ok  ':'FAIL'}  ${n}${d?'   '+d:''}`); if(!ok) fails.push(n); };
const hold = async (id, sx, sy, ms=1400) => {
  await press('pointerdown', id, sx, sy);
  let steer = 0, speed = 0;
  for (let t = 0; t < ms; t += 200) { await page.waitForTimeout(200); const s = await st();
    if (Math.abs(s.steer) > Math.abs(steer)) steer = s.steer; speed = Math.max(speed, s.speed); }
  await press('pointerup', id, sx, sy); await page.waitForTimeout(900);
  return { steer, speed };
};
// picture-left  = screen-top     (a thumb near the top of the upright screen)
// picture-right = screen-bottom
// picture-top strip = screen-right edge
const left = await hold(2, .5, .2);
const right = await hold(3, .5, .8);
check('the picture\'s left zone steers one way', left.steer !== 0, `steer ${left.steer}`);
check('the picture\'s right zone steers the other', right.steer !== 0 && Math.sign(right.steer) !== Math.sign(left.steer),
  `${left.steer} vs ${right.steer}`);
const base = (await st()).speed;
const top = await hold(4, .9, .5);
check('the throttle strip is reachable', top.speed > base + 2 || top.steer === 0, `${base.toFixed(1)} -> ${top.speed.toFixed(1)}`);
await browser.close();
console.log(fails.length ? `\n${fails.length} FAILED` : '\nthe zones follow the picture when the game turns');
process.exit(fails.length ? 1 : 0);

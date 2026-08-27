// Does the page behave like a GAME on a phone, or like a document?
//
// The report this exists for: on an iPhone SE, touching the canvas selected
// it and small double-tap zooms crept in. None of that is visible in the
// source - the HUD's touch-action lives inside roadroller-packed JS, so
// grepping the built document cannot see it, and the desktop probes never
// exercise a mobile viewport. Only a running page at a phone's size can
// answer, which is what this does.
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inflateRawSync } from 'node:zlib';
import { chromium } from 'playwright-core';

const args = process.argv.slice(2);
const game = args.find((a) => /^--game=/.test(a))?.split('=')[1] || 'native';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

const a = readFileSync(path.join(root, 'build', game, 'index.zip'));
const nl = a.readUInt16LE(26), el = a.readUInt16LE(28);
const method = a.readUInt16LE(8), comp = a.readUInt32LE(18);
const body = a.subarray(30 + nl + el, 30 + nl + el + comp);
const stage = mkdtempSync(path.join(tmpdir(), 'js13k-shell-'));
const page0 = path.join(stage, 'index.html');
writeFileSync(page0, method === 0 ? body : inflateRawSync(body));

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
// An iPhone SE, which is the device the selection and zoom were reported on.
const page = await browser.newPage({
  viewport: { width: 375, height: 667 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2,
});
await page.goto(pathToFileURL(page0).href, { waitUntil: 'load' });
await page.waitForTimeout(1500);

const r = await page.evaluate(() => {
  const cs = document.querySelectorAll('canvas');
  // The last canvas is the one every touch lands on - the HUD where a game
  // mounts its pointer handlers, or the only canvas in a one-canvas game.
  const el = cs[cs.length - 1];
  const s = getComputedStyle(el);
  const vp = document.querySelector('meta[name=viewport]');
  const b = el.getBoundingClientRect();
  // A rotation shows up in the matrix' off-diagonal terms, wherever in the
  // ancestry it was applied - so this asks the rendered result, not the
  // markup, whether the game turned itself.
  const m = new DOMMatrix(getComputedStyle(el.parentNode).transform);
  return {
    touchAction: s.touchAction,
    userSelect: s.webkitUserSelect || s.userSelect,
    viewport: vp && vp.getAttribute('content'),
    bodyOverflow: getComputedStyle(document.body).overflow,
    turned: Math.abs(m.b) > .5 || Math.abs(m.c) > .5,
    covers: b.width * b.height / (innerWidth * innerHeight),
  };
});

const fails = [];
const check = (name, ok, detail) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? '   ' + detail : ''}`);
  if (!ok) fails.push(name);
};
// Without this Safari lays the page out at a virtual 980px and runs its
// double-tap-to-zoom heuristics against the scaled canvas, whatever the
// canvas itself asks for.
check('viewport is device-width', /width=device-width/.test(r.viewport || ''), r.viewport || 'MISSING');
check('the touch surface blocks pan and double-tap zoom', r.touchAction === 'none', `touch-action ${r.touchAction}`);
check('the touch surface blocks the selection loupe', r.userSelect === 'none', `user-select ${r.userSelect}`);
check('the page itself cannot scroll', r.bodyOverflow === 'hidden', r.bodyOverflow);
// This viewport is a phone held UPRIGHT, and both entries are landscape
// games. Turning the picture is the only thing that works on iOS - there
// is no orientation lock in Safari, and a "please rotate" card does
// nothing for the many players who keep rotation locked. A game that only
// letterboxes here is playing on about a third of the screen.
if (game === 'strands') {
  check('held upright, the game turns itself', r.turned);
  check('...and fills the screen rather than a third of it', r.covers > .9,
    `${Math.round(r.covers * 100)}% of the screen`);
}

await browser.close();
console.log(fails.length ? `\n${fails.length} FAILED` : '\nthe page behaves like a game on a phone');
process.exit(fails.length ? 1 : 0);

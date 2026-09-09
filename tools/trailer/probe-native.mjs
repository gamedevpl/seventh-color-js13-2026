// Where things actually are, in the game's own 320x156.
//
//   node tools/trailer/probe-native.mjs
//
// Every shot in the trailer is a focus point and a scale, and both are
// only as good as the number you believed about where the subject is. Two
// of the close-ups were framed by eye off a letterboxed 1080p screenshot
// and both cropped the horns off the top of the frame - which are the one
// feature of that face anybody remembers.
//
// So: run the game at SCX=1, where the canvas IS the coordinate system,
// hold a beat, and read the pixels back. Gold is the horns, red is his
// face, skin is everyone else's. What comes out is the bounding box a
// shot has to contain, and the largest push that can contain it is
// 156 / (height of that box).
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
const here = path.dirname(fileURLToPath(import.meta.url));
const gamePath = path.join(path.resolve(here, '..', '..'), 'build', 'native', 'index.html');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 640, height: 320 } });
await page.addInitScript(() => {
  window.SCX = 1; window.SCH = 1; window.__vnow = 0;
  let pending = [];
  window.requestAnimationFrame = (cb) => { pending.push(cb); return pending.length; };
  window.cancelAnimationFrame = () => {};
  let timers = [], timerId = 1;
  window.setTimeout = (fn, ms, ...a) => { const id = timerId++; timers.push({ id, at: window.__vnow + (ms || 0), fn, a }); return id; };
  window.clearTimeout = (id) => { timers = timers.filter((t) => t.id !== id); };
  window.setInterval = () => 0;
  window.__pump = (dt) => {
    window.__vnow += dt;
    const cbs = pending; pending = [];
    for (const cb of cbs) cb(window.__vnow);
    const due = timers.filter((t) => t.at <= window.__vnow);
    timers = timers.filter((t) => t.at > window.__vnow);
    for (const t of due) t.fn(...t.a);
  };
  performance.now = () => window.__vnow;
});
await page.goto(pathToFileURL(gamePath).href, { waitUntil: 'load' });
await page.evaluate(() => window.__pump(16));

const measure = async (id, patch, label) => {
  const r = await page.evaluate(([id, patch]) => {
    const bt = window.SC.BEATS.find((x) => x.id === id);
    if (bt.card) { bt.__card = bt.card; delete bt.card; }
    window.SC.hard();
    window.SC.play(id, patch || {});
    for (let i = 0; i < 30; i++) window.__pump(33.34);
    const c = document.getElementById('c');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    // Colour classes, loose enough to survive the game's shading.
    const cls = {
      gold: (r, g, b) => r > 170 && g > 120 && b < 130 && r - b > 70 && r - g < 90,
      red: (r, g, b) => r > 110 && g < 90 && b < 90 && r - g > 50,
      skin: (r, g, b) => r > 190 && g > 150 && b > 110 && r - b > 40 && g - b > 20,
    };
    const box = {};
    for (const k in cls) box[k] = [999, 999, -1, -1];
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
      const i = (y * c.width + x) * 4;
      const R = d[i], G = d[i + 1], B = d[i + 2];
      for (const k in cls) if (cls[k](R, G, B)) {
        const bx = box[k];
        if (x < bx[0]) bx[0] = x; if (y < bx[1]) bx[1] = y;
        if (x > bx[2]) bx[2] = x; if (y > bx[3]) bx[3] = y;
      }
    }
    return box;
  }, [id, patch]);
  const fmt = (b) => b[2] < 0 ? 'none' : `x ${b[0]}..${b[2]}  y ${b[1]}..${b[3]}`;
  console.log(`${label.padEnd(22)} gold: ${fmt(r.gold).padEnd(24)} red: ${fmt(r.red).padEnd(24)} skin: ${fmt(r.skin)}`);
};

await measure('shadow-council', { phase: 0, line: 0 }, 'HALL darkness s1.0');
await measure('hidden-hand', { phase: 0, line: 0 }, 'THRONE darkness+jack');
await measure('false-sacrifice', { phase: 0, line: 1 }, 'DEFY darkness+lili');
await measure('winter-falls', { phase: 0, line: 1 }, 'POND jack s.72');
await measure('jacks-glade', { phase: 0, line: 4 }, 'GLADE jack+lili');
await browser.close();

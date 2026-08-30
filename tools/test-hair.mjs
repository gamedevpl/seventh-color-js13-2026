// Is the hair OUTSIDE the unicorn?
//
// Reported from play: the mane and tail sometimes pass through the body.
// It is the kind of fault a screenshot argues about and a number settles,
// so this asks the only question that matters - how deep inside the drawn
// geometry does a strand point get - and it asks it against the boxes the
// renderer actually draws, read out of the build rather than copied into
// this file, because a second table of body sizes would drift away from the
// first and quietly start testing nothing.
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { requireDevBuild } from './lib/require-dev.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'build', 'snap', 'index.html');
const NAMES = ['graze', 'idle', 'walk', 'trot', 'gallop', 'rear', 'toss', 'shake', 'sleep', 'prance', 'bow', 'jump', 'buck', 'spin'];
// Hair may grow out of the skin, so a point is only INSIDE if it is this
// far past the surface on every axis at once. Below that it is a strand
// lying against the animal, which is what hair does.
const DEEP = .035;

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 480, height: 360 } });
page.on('pageerror', (e) => { console.error('PAGE ERROR:', e.message); process.exitCode = 1; });
await requireDevBuild(page, browser, file, pathToFileURL);

// The measurement runs in the page: shipping the whole rig out per sample
// would be most of the wall clock.
const sample = (frames) => page.evaluate(async (n) => {
  // A bone matrix is a rotation and a translation, so its inverse is the
  // transposed rotation applied to (point - origin).
  const into = (m, p) => {
    const x = p[0] - m[12], y = p[1] - m[13], z = p[2] - m[14];
    return [
      m[0] * x + m[1] * y + m[2] * z,
      m[4] * x + m[5] * y + m[6] * z,
      m[8] * x + m[9] * y + m[10] * z,
    ];
  };
  let worst = 0, count = 0, total = 0;
  for (let f = 0; f < n; f++) {
    const { boxes, meshOf, w, hair } = window.SNAPHAIR();
    for (const strand of hair) {
      // The root is planted ON the bone and is allowed to be inside it.
      for (let i = 1; i < strand.length; i++) {
        total++;
        let deepest = 9;
        for (let b = 0; b < w.length; b++) {
          const mesh = meshOf[b];
          for (const [mi, cx, cy, cz, sx, sy, sz] of boxes) {
            if (mi !== mesh) continue;
            const q = into(w[b], strand[i]);
            // How far inside this box, on its least-inside axis.
            const d = Math.min(
              sx / 2 - Math.abs(q[0] - cx),
              sy / 2 - Math.abs(q[1] - cy),
              sz / 2 - Math.abs(q[2] - cz),
            );
            if (d > 0 && (deepest === 9 || d > deepest)) deepest = d;
          }
        }
        if (deepest !== 9) { if (deepest > worst) worst = deepest; if (deepest > 0.035) count++; }
      }
    }
    await new Promise((r) => requestAnimationFrame(r));
  }
  return { worst, count, total };
}, frames);

let bad = 0;
console.log('  pose        deepest   points inside   of');
for (let i = 0; i < NAMES.length; i++) {
  await page.goto(`${pathToFileURL(file).href}?pose=${i}`, { waitUntil: 'load' });
  await page.waitForTimeout(1400);
  const s = await sample(40);
  const ok = s.worst < DEEP;
  if (!ok) bad++;
  console.log(`  ${NAMES[i].padEnd(10)} ${s.worst.toFixed(3).padStart(7)} ${String(s.count).padStart(13)} ${String(s.total).padStart(8)}  ${ok ? 'ok' : 'FAIL'}`);
}
await browser.close();
console.log('');
if (bad) { console.error(`  hair goes inside the unicorn in ${bad} pose(s)`); process.exit(1); }
console.log('  the hair stays out of the unicorn');

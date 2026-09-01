// The two images js13kgames.com asks for: a 320x320 thumbnail for listings
// and an 800x500 cover for the game's own page header.
//
// Rendered from the GAME, not painted in an editor - the picture a player
// gets is the picture in the listing. The frame is composited in the page
// itself: the WebGL canvas is drawn into a 2D canvas at the exact target
// size, which supersamples it down from a viewport twice as large (free
// anti-aliasing, and the only way to hit an exact pixel size without an
// image library), and the wordmark is drawn on top with the 2D API.
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'build', 'snap', 'index.html');
const out = process.argv[2] || path.join(root, 'build', 'snap');

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });

// pose, when to grab it, camera [look, pitch, fov, orbit], and how far the
// subject sits from the middle of the frame.
async function frame({ w, h, scale, pose, at, deco, cam, title, sub }) {
  const page = await browser.newPage({ viewport: { width: w * scale, height: h * scale } });
  page.on('pageerror', (e) => { console.error('PAGE ERROR:', e.message); process.exitCode = 1; });
  await page.goto(`${pathToFileURL(file).href}?pose=${pose}&deco=${deco}`, { waitUntil: 'load' });
  await page.waitForTimeout(at);
  const url = await page.evaluate(([w, h, cam, title, sub]) => {
    window.SNAPCAM(...cam);
    return new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => {
      const src = document.getElementById('c');
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      const x = cv.getContext('2d');
      x.drawImage(src, 0, 0, w, h);
      if (title) {
        x.textAlign = 'right';
        x.shadowColor = 'rgba(0,0,0,.55)';
        x.shadowBlur = h * .05;
        x.shadowOffsetY = h * .01;
        x.fillStyle = '#fff6dd';
        x.font = `800 ${h * .1}px system-ui, sans-serif`;
        x.fillText(title, w * .955, h * .55);
        x.fillStyle = '#ffeec4';
        x.font = `600 ${h * .04}px system-ui, sans-serif`;
        x.fillText(sub, w * .955, h * .64);
      }
      res(cv.toDataURL('image/png'));
    })));
  }, [w, h, cam, title, sub]);
  await page.close();
  return Buffer.from(url.split(',')[1], 'base64');
}

// The listing thumbnail. Square, and the mane toss rather than a stand: at
// the size a listing shows this the title is unreadable, so the picture has
// to say "unicorn" on its own - which a rainbow mane thrown up in an arc
// does and a grey horse in profile does not.
const thumb = await frame({
  w: 320, h: 320, scale: 3, pose: 6, at: 330, deco: '-1,-1,0,4,7,1',
  cam: [2.2 + Math.PI + .02, -.01, .50, 2.2],
});
writeFileSync(path.join(out, 'thumb.png'), thumb);

// The page header. The one pose that leaves the ground, caught near the top
// of its arc with the shadow well below it, sitting on the left third - the
// cove leaves the other two thirds clear, which is where the wordmark goes.
const cover = await frame({
  w: 800, h: 500, scale: 2, pose: 11, at: 560, deco: '-1,-1,0,4,7,1',
  cam: [2.2 + Math.PI - .26, -.02, .74, 2.2],
  title: 'UNICORN SNAP', sub: 'It knows how good it looks. Prove it.',
});
writeFileSync(path.join(out, 'cover.png'), cover);

await browser.close();
console.log(`  thumb.png  320x320  ${(thumb.length / 1024).toFixed(1)} KB  (limit 64)`);
console.log(`  cover.png  800x500  ${(cover.length / 1024).toFixed(1)} KB  (limit 256)`);

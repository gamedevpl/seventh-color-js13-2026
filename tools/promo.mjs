// Compose the two submission images out of the stills tools/shots.mjs
// captured. Layout is HTML, screenshotted by the same headless Chromium at
// exactly the target viewport, so the PNGs come out at the required pixel
// sizes with no resampling step of their own:
//   promo-320.png  320x320  (<=64KB)
//   promo-800.png  800x500  (<=256KB)
import { mkdirSync, writeFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const shots = path.join(root, 'build', 'shots');
const out = path.join(root, 'promo');
mkdirSync(out, { recursive: true });
const url = (name) => pathToFileURL(path.join(shots, name)).href;

const RAINBOW = ['#c9524f', '#d98a4a', '#d9c14f', '#7cb56a', '#5a9bb0', '#6b7ec9', '#9a6bc4'];
const BG = '#0a0710';
const GOLD = '#e8b923';

// The title screen's own bloom(): seven 2px rings, r0 + i*spread, scaled up
// for a square that has to read at icon size.
const rings = (r0, spread, thickness) =>
  RAINBOW.map((c, i) => {
    const r = r0 + i * spread;
    return `<i style="width:${r * 2}px;height:${r * 2}px;border:${thickness}px solid ${c}"></i>`;
  }).join('');

const shell = (w, h, body, css) => `<!doctype html><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${w}px;height:${h}px;overflow:hidden}
body{background:${BG};font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#fff}
.rings{position:relative;display:grid;place-items:center}
.rings i{position:absolute;border-radius:50%}
${css}</style>${body}`;

const square = shell(320, 320, `
<div class="wrap">
  <h1>THE SEVENTH<br>COLOR</h1>
  <div class="rings" style="width:150px;height:150px">${rings(23, 8.5, 3)}</div>
  <p>tap or press space</p>
</div>`, `
.wrap{width:320px;height:320px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;
  background:radial-gradient(circle at 50% 54%, #17102400 40%, ${BG} 78%), ${BG}}
h1{color:${GOLD};font-size:30px;line-height:1.08;font-weight:700;letter-spacing:.5px;text-align:center}
p{color:#a89;font-size:13px;letter-spacing:.3px}`);

const wide = shell(800, 500, `
<header>
  <div class="rings" style="width:74px;height:74px">${rings(11, 4.2, 2)}</div>
  <div class="words">
    <h1>THE SEVENTH COLOR</h1>
    <p>A stolen colour, a blindfolded princess, and nineteen beats of fairy tale to win it back.</p>
  </div>
</header>
<div class="grid">
  <img src="${url('glade.png')}" alt="">
  <img src="${url('unicorns.png')}" alt="">
  <img src="${url('council.png')}" alt="">
  <img src="${url('throne.png')}" alt="">
</div>`, `
header{height:104px;display:flex;align-items:center;gap:22px;padding:0 26px}
.words h1{color:${GOLD};font-size:30px;font-weight:700;letter-spacing:1px}
.words p{color:#a89;font-size:13px;margin-top:6px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:0 8px 8px}
.grid img{width:100%;height:186px;object-fit:cover;display:block;border-radius:3px}`);

const pages = [
  { file: 'promo-320.png', html: square, width: 320, height: 320, cap: 64 * 1024 },
  { file: 'promo-800.png', html: wide, width: 800, height: 500, cap: 256 * 1024 },
];

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
for (const page_ of pages) {
  const htmlPath = path.join(shots, page_.file.replace('.png', '.html'));
  writeFileSync(htmlPath, page_.html);
  const context = await browser.newContext({ viewport: { width: page_.width, height: page_.height } });
  const page = await context.newPage();
  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'load' });
  await page.waitForTimeout(400);
  const file = path.join(out, page_.file);
  await page.screenshot({ path: file });
  await context.close();
  const size = statSync(file).size;
  console.log(`${page_.file}  ${page_.width}x${page_.height}  ${size.toLocaleString()} bytes  ${size <= page_.cap ? 'OK' : 'OVER BUDGET'}`);
}
await browser.close();

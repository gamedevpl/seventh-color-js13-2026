// The film's two title cards, set in the game's own dress: its background,
// its moonlit off-white, its gold, and the seven rainbow bars from the title
// screen. Rendered by Chromium so the type is real and anti-aliased, not
// ffmpeg drawtext.
//
// usage: node tools/promo/cards.mjs <outdir> [--w=1920]

import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const out = process.argv[2] || '/tmp/promo/cards';
const W = Number(process.argv.find((a) => a.startsWith('--w='))?.split('=')[1] || 1920);
const H = Math.round(W * 9 / 32) * 2;
mkdirSync(out, { recursive: true });

// the game's palette, straight out of uni.js / main.js
const RAINBOW = [
  [.79, .32, .31], [.85, .54, .29], [.85, .76, .31], [.49, .71, .42],
  [.35, .61, .69], [.42, .49, .79], [.60, .42, .77],
];
const bars = (h, op) => RAINBOW.map((c) =>
  `<div style="height:${h}px;background:rgba(${c.map((v, i) => i < 3 ? Math.round(v * 255) : v).join(',')},${op})"></div>`).join('');

const page_ = (body) => `<!doctype html><html><head><meta charset="utf-8"><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { width: ${W}px; height: ${H}px; background: #07050f; overflow: hidden;
         font-family: 'DejaVu Sans', system-ui, sans-serif; color: #f3ead6;
         display: flex; align-items: center; justify-content: center; }
  .col { text-align: center; width: 100%; }
  .title { font-weight: bold; letter-spacing: .04em; }
  .gold { color: #e8b923; }
  .dim { color: #b8ab92; }
  .faint { color: #7a6e5c; }
  .bars { width: 62%; margin: 0 auto; display: flex; flex-direction: column; gap: ${W / 480}px; }
</style></head><body>${body}</body></html>`;

const CARDS = {
  // The reveal, after the montage has earned it.
  title: page_(`<div class="col">
    <div class="title" style="font-size:${W / 12}px">RAINBOW SURFER</div>
    <div style="height:${W / 48}px"></div>
    <div class="bars">${bars(Math.max(2, W / 240), .85)}</div>
    <div style="height:${W / 40}px"></div>
    <div class="dim" style="font-size:${W / 60}px">catch it &nbsp;&middot;&nbsp; become it &nbsp;&middot;&nbsp; burn</div>
  </div>`),

  // Where to play it, and whose it is.
  end: page_(`<div class="col">
    <div class="title" style="font-size:${W / 17}px">RAINBOW SURFER</div>
    <div style="height:${W / 64}px"></div>
    <div class="bars" style="width:44%">${bars(Math.max(2, W / 320), .85)}</div>
    <div style="height:${W / 32}px"></div>
    <div class="gold" style="font-size:${W / 45}px;font-weight:bold">js13kGames 2026</div>
    <div style="height:${W / 90}px"></div>
    <div class="dim" style="font-size:${W / 64}px">a WebGL game in 13 kilobytes &mdash; plays in your browser</div>
    <div style="height:${W / 28}px"></div>
    <div class="faint" style="font-size:${W / 75}px">@gtanczyk &nbsp;|&nbsp; gamedev.pl &nbsp;|&nbsp; 2026</div>
  </div>`),
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H } });
for (const [name, html] of Object.entries(CARDS)) {
  await page.setContent(html, { waitUntil: 'load' });
  await page.screenshot({ path: path.join(out, name + '.png') });
  console.log('  card:', name);
}
await browser.close();

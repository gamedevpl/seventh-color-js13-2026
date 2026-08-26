// Cut the recorded shots into a ~50 second trailer: one line of copy per shot,
// faded in over the picture, hard cuts between shots, the game's own music
// carrying underneath. Captions are rendered as transparent PNGs by the same
// headless Chromium that captured the game, so the type matches the promo
// stills rather than whatever font ffmpeg's drawtext can find.
//
// Needs build/clips (node tools/clips.mjs). Writes promo/seventh-color-trailer.mp4.
import { mkdirSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import ffmpeg from 'ffmpeg-static';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const clips = path.join(root, 'build', 'clips');
const work = path.join(root, 'build', 'trailer');
mkdirSync(work, { recursive: true });

if (!existsSync(path.join(clips, 'title.webm'))) {
  const shot = spawnSync(process.execPath, [path.join(here, 'clips.mjs')], { stdio: 'inherit', cwd: root });
  if (shot.status !== 0) process.exit(shot.status ?? 1);
}

// The edit. `dur` is how much of the take to keep; `in`/`out` are when its
// line of copy fades up and away, in seconds from the cut.
const CUTS = [
  { clip: 'title', dur: 4.2, kind: 'card', line: '13 kilobytes.', sub: 'That is the whole fairy tale. Zip included.', in: 0.7, out: 3.6 },
  { clip: 'council', dur: 4.4, line: 'Meet the villain.', sub: 'He is a pentagon. He is doing fine.', in: 0.5, out: 3.7 },
  { clip: 'glade', dur: 4.6, line: 'Romance, at 320 by 156.', sub: 'He brought a blindfold. She said yes anyway.', in: 0.5, out: 3.9 },
  { clip: 'unicorns', dur: 7.0, line: 'Unicorn rhythm stealth.', sub: 'Creep while every head is down. That is a genre now.', in: 0.6, out: 6.2 },
  { clip: 'winter', dur: 4.6, line: 'One arrow later, the year stops.', sub: '', in: 0.5, out: 3.9 },
  { clip: 'armory', dur: 4.6, line: 'Three weapons.', sub: 'Two of them are character development.', in: 0.5, out: 3.9 },
  { clip: 'gown', dur: 4.0, line: 'The gown breathes.', sub: 'Nobody in the castle finds this strange.', in: 0.4, out: 3.4 },
  { clip: 'beam', dur: 6.4, line: 'Stealth platforming on a byte budget.', sub: 'Carry the sun down. Open the shaft once.', in: 0.6, out: 5.6 },
  { clip: 'spring', dur: 4.6, line: 'Give the light back,', sub: 'and spring remembers your hand.', in: 0.5, out: 3.9 },
  { clip: 'ending', dur: 7.0, kind: 'end', line: 'THE SEVENTH COLOR', sub: '12,518 of 13,312 bytes used. The rest is fairy tale.', in: 0.6, out: 6.6 },
];

const RAINBOW = ['#c9524f', '#d98a4a', '#d9c14f', '#7cb56a', '#5a9bb0', '#6b7ec9', '#9a6bc4'];
const GOLD = '#e8b923';

// The title screen's own bloom(): seven 2px rings, r0 + i*spread.
const rings = (r0, spread, thickness) => RAINBOW
  .map((c, i) => `<i style="width:${(r0 + i * spread) * 2}px;height:${(r0 + i * spread) * 2}px;border:${thickness}px solid ${c}"></i>`)
  .join('');

const base = `*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1280px;height:720px;overflow:hidden;background:transparent}
body{font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#fff}
.rings{position:relative;display:grid;place-items:center}
.rings i{position:absolute;border-radius:50%}
.line{font-size:44px;font-weight:700;letter-spacing:.4px;text-shadow:0 3px 18px #000,0 1px 3px #000}
.sub{font-size:24px;color:#d8d2e2;margin-top:10px;text-shadow:0 3px 14px #000,0 1px 3px #000}`;

function captionHtml(cut) {
  if (cut.kind === 'card') {
    return `<!doctype html><meta charset="utf-8"><style>${base}
    .wrap{width:1280px;height:720px;display:flex;flex-direction:column;align-items:center;justify-content:center;
      background:radial-gradient(ellipse at 50% 50%, #0a0710e0 30%, #0a0710f2 100%)}
    .line{font-size:86px;color:${GOLD}}
    .sub{font-size:28px;margin-top:18px}
    </style><div class="wrap"><div class="line">${cut.line}</div><div class="sub">${cut.sub}</div></div>`;
  }
  if (cut.kind === 'end') {
    return `<!doctype html><meta charset="utf-8"><style>${base}
    .wrap{width:1280px;height:720px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:26px;
      background:radial-gradient(ellipse at 50% 50%, #0a0710e6 25%, #0a0710f7 100%)}
    .line{font-size:72px;color:${GOLD}}
    .sub{font-size:26px;color:#a89}
    .play{font-size:30px;color:#fff;letter-spacing:2px;margin-top:4px}
    .credit{font-size:22px;color:#7d7488;margin-top:2px}
    </style><div class="wrap">
      <div class="rings" style="width:150px;height:150px">${rings(23, 8.5, 3)}</div>
      <div class="line">${cut.line}</div>
      <div class="play">PLAY IT AT JS13KGAMES.COM</div>
      <div class="sub">${cut.sub}</div>
      <div class="credit">@gtanczyk &nbsp;|&nbsp; gamedev.pl &nbsp;|&nbsp; 2026</div>
    </div>`;
  }
  // A line of copy over the picture, with just enough gradient behind it to
  // survive a bright sky or a pale moon.
  return `<!doctype html><meta charset="utf-8"><style>${base}
  .band{position:absolute;inset:0 0 auto 0;height:300px;background:linear-gradient(#000000d0,#0000)}
  .wrap{position:absolute;left:70px;top:92px;max-width:1000px}
  </style><div class="band"></div><div class="wrap"><div class="line">${cut.line}</div>${cut.sub ? `<div class="sub">${cut.sub}</div>` : ''}</div>`;
}

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
for (const [i, cut] of CUTS.entries()) {
  const html = path.join(work, `cap-${i}.html`);
  writeFileSync(html, captionHtml(cut));
  await page.goto(pathToFileURL(html).href, { waitUntil: 'load' });
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(work, `cap-${i}.png`), omitBackground: true });
}
await browser.close();

const run = (args) => {
  const done = spawnSync(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', ...args], { stdio: 'inherit' });
  if (done.status !== 0) process.exit(done.status ?? 1);
};

CUTS.forEach((cut, i) => {
  const d = cut.dur;
  run([
    '-i', path.join(clips, `${cut.clip}.webm`),
    '-loop', '1', '-i', path.join(work, `cap-${i}.png`),
    '-filter_complex', [
      `[0:v]fps=30,trim=0:${d},setpts=PTS-STARTPTS[v0]`,
      `[1:v]format=yuva420p,fade=t=in:st=${cut.in}:d=0.45:alpha=1,fade=t=out:st=${cut.out}:d=0.45:alpha=1[cap]`,
      `[v0][cap]overlay=0:0[v]`,
      `[0:a]atrim=0:${d},asetpts=PTS-STARTPTS,afade=t=in:d=0.25,afade=t=out:st=${(d - 0.4).toFixed(2)}:d=0.4[a]`,
    ].join(';'),
    '-map', '[v]', '-map', '[a]', '-t', String(d),
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', '30',
    '-c:a', 'aac', '-b:a', '160k', '-ar', '48000',
    path.join(work, `seg-${String(i).padStart(2, '0')}.mp4`),
  ]);
});

const list = path.join(work, 'segments.txt');
writeFileSync(list, CUTS.map((_, i) => `file '${path.join(work, `seg-${String(i).padStart(2, '0')}.mp4`)}'`).join('\n') + '\n');
const joined = path.join(work, 'joined.mp4');
run(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', joined]);

// Final pass: up from black, out to black, and loudness where YouTube wants it
// (the game mixes far below that) - with the moov atom up front for streaming.
const total = CUTS.reduce((sum, c) => sum + c.dur, 0);
const promo = path.join(root, 'promo');
mkdirSync(promo, { recursive: true });
const mp4 = path.join(promo, 'seventh-color-trailer.mp4');
run([
  '-i', joined,
  '-vf', `fade=t=in:st=0:d=0.6,fade=t=out:st=${(total - 1.0).toFixed(2)}:d=1.0`,
  '-af', `afade=t=out:st=${(total - 1.2).toFixed(2)}:d=1.2,loudnorm=I=-16:TP=-1.5:LRA=11`,
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '19', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-r', '30',
  '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-movflags', '+faststart',
  mp4,
]);
console.log(`${path.relative(root, mp4)}  ${statSync(mp4).size.toLocaleString()} bytes  ~${total.toFixed(1)}s`);

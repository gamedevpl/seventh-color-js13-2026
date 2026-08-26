// Record a promo video of the native build - picture AND sound - straight out
// of the real game in headless Chromium.
//
// Sound is the hard half: nothing leaves a headless browser's speakers, so the
// page's AudioContext is replaced before the game boots by one whose
// `destination` is a MediaStreamDestination. Every oscillator the tracker and
// the sfx build connects to it as usual, and the stream it feeds becomes the
// audio track of a MediaRecorder that also carries a 720p canvas the game is
// upscaled into. The recorder's chunks are piped out to disk as they arrive.
//
// The cheat build is made here rather than assumed: shift+shift is what walks
// the performance from beat to beat, and against a submission build (no
// cheats) every skip is silently a no-op - the recording just sits on
// whichever beat it last played. `--no-build` reuses build/native as it is.
//
// Output: build/video/promo.webm, then promo/seventh-color-promo.mp4 -
// H.264/AAC, 720p, faststart, loudness-normalised for YouTube.
import { createWriteStream, mkdtempSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inflateRawSync } from 'node:zlib';
import { chromium } from 'playwright-core';
import ffmpeg from 'ffmpeg-static';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const out = path.join(root, 'build', 'video');
mkdirSync(out, { recursive: true });
const webm = path.join(out, 'promo.webm');

if (!process.argv.includes('--no-build')) {
  const built = spawnSync(process.execPath, [path.join(here, 'native.mjs'), '--no-roadroller', '--cheats'], { stdio: 'inherit', cwd: root });
  if (built.status !== 0) process.exit(built.status ?? 1);
}

const archive = readFileSync(path.join(root, 'build', 'native', 'index.zip'));
const nameLength = archive.readUInt16LE(26);
const extraLength = archive.readUInt16LE(28);
const compressed = archive.readUInt32LE(18);
const body = archive.subarray(30 + nameLength + extraLength, 30 + nameLength + extraLength + compressed);
const document_ = archive.readUInt16LE(8) === 0 ? body : inflateRawSync(body);
const stage = mkdtempSync(path.join(tmpdir(), 'video-'));
const pagePath = path.join(stage, 'index.html');
writeFileSync(pagePath, document_);

const browser = await chromium.launch({
  args: [
    '--enable-unsafe-swiftshader',
    // Headless would otherwise hold the context suspended until it decides a
    // gesture counts, and the opening bars would be missing.
    '--autoplay-policy=no-user-gesture-required',
  ],
});
const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await context.newPage();

const sink = createWriteStream(webm);
let bytes = 0;
await page.exposeBinding('__chunk', async (_source, b64) => {
  const buf = Buffer.from(b64, 'base64');
  bytes += buf.length;
  sink.write(buf);
});

await page.addInitScript(() => {
  // One AudioContext, made before the game asks for one, handed back to it
  // when it does - so the tap it makes into the mix is already in place.
  const Orig = window.AudioContext || window.webkitAudioContext;
  const ac = new Orig();
  const tap = ac.createMediaStreamDestination();
  Object.defineProperty(ac, 'destination', { value: tap, configurable: true });
  const proxy = new Proxy(Orig, { construct: () => ac });
  window.AudioContext = proxy;
  window.webkitAudioContext = proxy;
  window.__cap = { ac, stream: tap.stream };
});

await page.goto(pathToFileURL(pagePath).href + '#nohud', { waitUntil: 'load' });
await page.waitForTimeout(1200);

await page.evaluate(async () => {
  const game = document.querySelector('canvas');
  const cv = document.createElement('canvas');
  cv.width = 1280;
  cv.height = 720;
  const g = cv.getContext('2d');
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  // 320x156 into 1280x720: width-limited at 4x, so the frame keeps the
  // game's own aspect inside 16:9 letterboxing rather than stretching it.
  const draw = () => {
    g.fillStyle = '#000';
    g.fillRect(0, 0, 1280, 720);
    g.drawImage(game, 0, (720 - 624) / 2, 1280, 624);
    requestAnimationFrame(draw);
  };
  draw();

  await window.__cap.ac.resume();
  const stream = cv.captureStream(30);
  for (const t of window.__cap.stream.getAudioTracks()) stream.addTrack(t);
  const rec = new MediaRecorder(stream, {
    mimeType: 'video/webm;codecs=vp9,opus',
    videoBitsPerSecond: 6_000_000,
    audioBitsPerSecond: 128_000,
  });
  rec.ondataavailable = async (e) => {
    if (!e.data.size) return;
    const buf = new Uint8Array(await e.data.arrayBuffer());
    let s = '';
    for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    await window.__chunk(btoa(s));
  };
  rec.start(1000);
  window.__rec = rec;
});

const wait = (ms) => page.waitForTimeout(ms);
const tap = async (n = 1, gap = 2300) => {
  for (let i = 0; i < n; i++) { await page.keyboard.press('Space'); await wait(gap); }
};
const hold = async (key, ms) => {
  await page.keyboard.down(key);
  await wait(ms);
  await page.keyboard.up(key);
};
let at = 0;
const skipTo = async (beat) => {
  while (at < beat) {
    await page.keyboard.down('ShiftLeft');
    await page.keyboard.down('ShiftRight');
    await wait(140);
    await page.keyboard.up('ShiftRight');
    await page.keyboard.up('ShiftLeft');
    at++;
    // The arriving beat's black card runs 1.9s.
    await wait(2300);
  }
};

// The performance. Roughly 95 seconds: a beat of title, the theft, the
// promise, one mechanic played rather than described, the winter, the
// castle, the platforming climax, and the ending.
await wait(3500);
await page.keyboard.press('Space');   // start - and the first bars of music
await wait(2500);
await tap(3);                          // prologue
await skipTo(1);                       // the shadow council
await tap(2);
await skipTo(2);                       // Jack's glade, the blindfold
await tap(4, 2500);
await skipTo(3);                       // unicorns at the stream
await tap(2);
await hold('Space', 2600);             // creep closer while every head is down
await wait(900);
await hold('Space', 2200);
await wait(2500);
await skipTo(4);                       // winter comes
await tap(2, 2600);
await skipTo(6);                       // the champion's hollow
await tap(3);
await skipTo(9);                       // Meg's looking glass
await tap(3);
await skipTo(11);                      // the gown that breathes
await tap(3);
await skipTo(14);                      // final beam: carry the sun down
await tap(2);
await hold('ArrowRight', 1400);
await hold('ArrowUp', 900);
await hold('ArrowRight', 1200);
await hold('ArrowDown', 700);
await hold('ArrowLeft', 1500);
await wait(1500);
await skipTo(16);                      // spring remembers
await tap(2, 2600);
await skipTo(18);                      // epilogue
await tap(3, 2800);
await wait(3500);

await page.evaluate(() => new Promise((done) => {
  window.__rec.onstop = () => done();
  window.__rec.stop();
}));
await wait(600);
await browser.close();
await new Promise((done) => sink.end(done));
console.log(`${path.relative(root, webm)}  ${statSync(webm).size.toLocaleString()} bytes (${bytes.toLocaleString()} streamed)`);

// YouTube wants H.264/AAC with the moov atom up front, and normalises loudness
// on its own - the game mixes well below that, so bring it up here instead of
// letting the whole video sit quiet.
const promo = path.join(root, 'promo');
mkdirSync(promo, { recursive: true });
const mp4 = path.join(promo, 'seventh-color-promo.mp4');
const encode = spawnSync(ffmpeg, [
  '-y', '-hide_banner', '-loglevel', 'error',
  '-fflags', '+genpts', '-i', webm,
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-r', '30',
  '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11',
  '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-movflags', '+faststart', mp4,
], { stdio: 'inherit' });
if (encode.status !== 0) process.exit(encode.status ?? 1);
console.log(`${path.relative(root, mp4)}  ${statSync(mp4).size.toLocaleString()} bytes`);

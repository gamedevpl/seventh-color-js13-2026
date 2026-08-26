// Record a long playthrough of the native build - picture AND sound - straight
// out of the real game, then encode it for YouTube. Capturing and driving both
// live in lib/capture.mjs; what is here is the performance and the encode.
// For the cut-together promo piece, see tools/clips.mjs + tools/trailer.mjs.
//
// The cheat build is made here rather than assumed: shift+shift is what walks
// the performance from beat to beat, and against a submission build every skip
// is silently a no-op - the recording just sits on whichever beat it last
// played. `--no-build` reuses build/native as it is.
import { mkdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ffmpeg from 'ffmpeg-static';
import { openGame, driver } from './lib/capture.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const out = path.join(root, 'build', 'video');
mkdirSync(out, { recursive: true });
const webm = path.join(out, 'promo.webm');

if (!process.argv.includes('--no-build')) {
  const built = spawnSync(process.execPath, [path.join(here, 'native.mjs'), '--no-roadroller', '--cheats'], { stdio: 'inherit', cwd: root });
  if (built.status !== 0) process.exit(built.status ?? 1);
}

const { page, record, close } = await openGame({ zip: path.join(root, 'build', 'native', 'index.zip') });
const { wait, tap, hold, press, skipTo, tapToGame, tapToChoice, tapToEnd, start } = driver(page);

// The performance: a beat of title, the theft, the promise, two mechanics
// played rather than described, the winter, the castle, and the ending.
await record(webm, async () => {
  await wait(3500);
  await start();
  await tap(3);

  await skipTo('shadow-council');
  await tap(2);

  await skipTo('jacks-glade');
  await tap(4, 2500);

  await skipTo('unicorn-stream');
  await tapToGame();
  await hold('Space', 2600);
  await wait(900);
  await hold('Space', 2200);
  await wait(2500);

  await skipTo('winter-comes');
  await tap(2, 2600);

  await skipTo('hollow-armory');
  await tapToChoice();
  await press('ArrowRight');
  await wait(1400);
  await tap(2, 2400);

  await skipTo('megs-looking-glass');
  await tap(3);

  await skipTo('gown-that-breathes');
  await tap(3);

  await skipTo('final-beam');
  await tapToGame();
  await hold('ArrowRight', 1400);
  await hold('ArrowUp', 900);
  await hold('ArrowRight', 1200);
  await hold('ArrowDown', 700);
  await hold('ArrowLeft', 1500);
  await wait(1500);

  await skipTo('spring-remembers');
  await tapToChoice();
  await tap(2, 2600);

  await skipTo('epilogue');
  await tapToEnd();
  await wait(4000);
});
await close();
console.log(`${path.relative(root, webm)}  ${statSync(webm).size.toLocaleString()} bytes`);

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

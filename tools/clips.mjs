// Record the trailer's shots - one file per shot, picture and sound.
//
// Navigation happens between takes and playing happens inside them: the
// recorder only runs while something worth cutting to is on screen, so the
// edit never has to trim away a black story card or a skip.
//
// Builds its own --cheats zip (shift+shift is what walks the story between
// takes; against a submission build every skip is silently a no-op).
// `--no-build` reuses build/native as it is.
import { mkdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openGame, driver } from './lib/capture.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const out = path.join(root, 'build', 'clips');
mkdirSync(out, { recursive: true });

if (!process.argv.includes('--no-build')) {
  const built = spawnSync(process.execPath, [path.join(here, 'native.mjs'), '--no-roadroller', '--cheats'], { stdio: 'inherit', cwd: root });
  if (built.status !== 0) process.exit(built.status ?? 1);
}

const { page, record, close } = await openGame({ zip: path.join(root, 'build', 'native', 'index.zip') });
const { wait, tap, hold, press, skipTo, tapToGame, tapToChoice, tapToEnd, start } = driver(page);
const clip = (name, action) => record(path.join(out, `${name}.webm`), action);

// 1. The title screen, breathing.
await clip('title', () => wait(4500));
await start();

// 2. The theft, from the mouth of the shadow that did it.
await skipTo('shadow-council');
await clip('council', async () => { await wait(3000); await tap(1, 3200); });

// 3. A blindfold offered as a gift, which is the whole romance in one line.
await skipTo('jacks-glade');
await tap(3, 2000);
await clip('glade', async () => { await wait(1200); await tap(1, 4200); });

// 4. The mechanic, played rather than described: creep while every head is
//    down, freeze the moment one lifts.
await skipTo('unicorn-stream');
await tapToGame();
await clip('unicorns', async () => {
  await wait(1000);
  await hold('Space', 2400);
  await wait(1100);
  await hold('Space', 2000);
  await wait(1600);
});

// 5. One arrow later: the year stops.
await skipTo('winter-comes');
await clip('winter', async () => { await wait(2200); await tap(1, 3600); });

// 6. Three weapons, and a cursor that visibly changes its mind.
await skipTo('hollow-armory');
await tapToChoice();
await clip('armory', async () => {
  await wait(1400);
  // The cursor moves on left/right, so that is what makes it visibly change
  // its mind on camera.
  await press('ArrowRight');
  await wait(1300);
  await press('ArrowRight');
  await wait(1300);
  await press('ArrowLeft');
  await wait(1400);
});

// 7. Inside the dark castle.
await skipTo('gown-that-breathes');
await clip('gown', async () => { await wait(2400); await tap(1, 3200); });

// 8. The climax: carry the sun down a shaft full of guards.
await skipTo('final-beam');
await tapToGame();
await clip('beam', async () => {
  await wait(900);
  await hold('ArrowRight', 1300);
  await hold('ArrowUp', 800);
  await hold('ArrowRight', 1100);
  await hold('ArrowDown', 700);
  await hold('ArrowLeft', 1400);
  await wait(1200);
});

// 9. What to do with a colour once you have it back.
await skipTo('spring-remembers');
await tapToChoice();
await clip('spring', async () => { await wait(1800); await tap(1, 3000); });

// 10. The ending screen, where the rings come back up under the title.
await skipTo('epilogue');
await tapToEnd();
await clip('ending', () => wait(7000));

await close();
for (const name of ['title', 'council', 'glade', 'unicorns', 'winter', 'armory', 'gown', 'beam', 'spring', 'ending']) {
  const file = path.join(out, `${name}.webm`);
  console.log(`  ${name.padEnd(9)} ${statSync(file).size.toLocaleString().padStart(10)} bytes`);
}
console.log(`clips in ${path.relative(root, out)}`);

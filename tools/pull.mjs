// Stage one assembled build of the game, plus everything the packer needs to
// rewrite it, into build/source/.
//
// The games repo owns assembly; this repo never re-implements it. We ask that
// repo's own `npm run build` for the bundle, then copy the few inputs the
// transforms read directly (the audio catalog, the game manifest).

import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { build, buildSync, transformSync } from 'esbuild';
import { readSelectedPatches } from './lib/audio-inline.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { locateCheckout, run } from './lib/checkout.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const config = JSON.parse(readFileSync(path.join(root, 'config.json'), 'utf8'));
const args = process.argv.slice(2);

function flag(name) {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] ?? true : null;
}

const { dir: gamesDir, owned } = locateCheckout(root, config, { override: flag('games') });
const branch = flag('branch') || config.source.branch;

if (owned) {
  run('git', ['fetch', '--depth', '1', 'origin', branch], gamesDir);
  run('git', ['checkout', '-B', branch, 'FETCH_HEAD'], gamesDir);
} else if (flag('fetch')) {
  run('git', ['fetch', 'origin', branch], gamesDir);
  run('git', ['checkout', branch], gamesDir);
  run('git', ['merge', '--ff-only', `origin/${branch}`], gamesDir);
}

const head = run('git', ['rev-parse', 'HEAD'], gamesDir);
const headBranch = run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], gamesDir);
const dirty = run('git', ['status', '--porcelain'], gamesDir).length > 0;

console.log(`source: ${gamesDir}`);
console.log(`  branch ${headBranch} @ ${head.slice(0, 8)}${dirty ? ' (dirty working tree)' : ''}`);
if (!owned && headBranch !== branch) {
  console.log(`  note: config expects ${branch} — packing what is checked out, not that`);
}

console.log(`building ${config.slug}…`);
run('npm', ['run', 'build', '--', config.slug], gamesDir);

const outDir = path.join(root, 'build', 'source');
mkdirSync(outDir, { recursive: true });
copyFileSync(path.join(gamesDir, 'dist', 'games', config.slug, 'index.html'), path.join(outDir, 'index.html'));
copyFileSync(path.join(gamesDir, 'shared', 'audio', 'sounds.json'), path.join(outDir, 'sounds.json'));
copyFileSync(path.join(gamesDir, 'games', config.slug, 'GAME.json'), path.join(outDir, 'GAME.json'));

// Stage the engine one module at a time and the game on its own, because the
// tree-shaker needs the seams the assembled bundle has already welded shut.
// These are transpiled exactly as tools/lib/assemble.ts does — same target,
// same format, same comment handling — so recomposing them reproduces the
// shipped bundle byte for byte. pack.mjs asserts that.
const TARGET = 'safari16';
const engineDir = path.join(outDir, 'engine');
rmSync(engineDir, { recursive: true, force: true });
mkdirSync(engineDir, { recursive: true });
const manifest = JSON.parse(readFileSync(path.join(gamesDir, 'games', config.slug, 'GAME.json'), 'utf8'));
const moduleNames = ['core', ...manifest.engine.modules];
for (const name of moduleNames) {
  const modulePath = path.join(gamesDir, 'shared', 'modules', `${name}.ts`);
  const compiled = transformSync(readFileSync(modulePath, 'utf8'), {
    sourcefile: path.relative(gamesDir, modulePath),
    loader: 'ts',
    target: TARGET,
    format: 'iife',
    legalComments: 'inline',
  }).code;
  writeFileSync(path.join(engineDir, `${name}.js`), compiled);
}
writeFileSync(path.join(outDir, 'engine', 'ORDER.json'), `${JSON.stringify(moduleNames)}\n`);

async function bundleGame(stubs) {
  const result = await build({
    absWorkingDir: gamesDir,
    entryPoints: [path.join(gamesDir, 'games', config.slug, 'game.ts')],
    bundle: true,
    write: false,
    platform: 'browser',
    target: TARGET,
    format: 'iife',
    legalComments: 'inline',
    plugins: stubs.length ? [{
      name: 'drop-features',
      setup(pluginBuild) {
        pluginBuild.onResolve({ filter: /\.ts$/ }, (found) => {
          const base = path.basename(found.path);
          return stubs.includes(base) ? { path: path.join(stubDir, base) } : undefined;
        });
        // Stubbing a subsystem is only half the job: the buttons that opened it
        // still work, and a no-op renderer behind a live button is a black
        // screen the player can get into. These patches close the doors. Each
        // must match exactly once — a silent miss would ship that black screen.
        pluginBuild.onLoad({ filter: /\.ts$/ }, (found) => {
          const patches = (config.patches ?? []).filter((p) => found.path.endsWith(p.file));
          if (!patches.length) return undefined;
          let text = readFileSync(found.path, 'utf8');
          for (const patch of patches) {
            const hits = text.split(patch.find).length - 1;
            if (hits !== 1) {
              throw new Error(`patch for ${patch.file} matched ${hits} times, expected 1 — the source moved`);
            }
            text = text.replace(patch.find, patch.replace);
          }
          return { contents: text, loader: 'ts' };
        });
      },
    }] : [],
  });
  return result.outputFiles[0].text;
}

// Two bundles: the untouched one, which pack asserts against so it knows the
// staged parts still match what the assembler ships, and the feature-dropped
// one it actually packs. Keeping both is what lets the drop be verified rather
// than assumed.
const stubDir = path.join(root, 'tools', 'stubs');
writeFileSync(path.join(outDir, 'game.js'), await bundleGame([]));

const drops = config.dropFeatures ?? [];
writeFileSync(path.join(outDir, 'game-cut.js'), await bundleGame(drops));
if (drops.length) console.log(`staged a feature-dropped game bundle (${drops.length} modules stubbed)`);

// The bespoke micro-engine: bundled separately from GameKit entirely. Sound
// patch definitions and music track data are embedded as literals — esbuild's
// `define` substitutes the free variables tools/engine/audio.mjs references,
// so the bundle needs no import seam or asset-loading step at all.
const soundCatalog = JSON.parse(readFileSync(path.join(gamesDir, 'shared', 'audio', 'sounds.json'), 'utf8'));
const musicPath = path.join(gamesDir, 'games', config.slug, 'music.json');
const musicCatalog = JSON.parse(readFileSync(musicPath, 'utf8'));
const usedTrackNames = [manifest.audio.music, ...(manifest.audio.musicTracks ?? [])];
const usedTracks = Object.fromEntries(usedTrackNames.map((name) => [name, musicCatalog.tracks[name]]));
const soundPatches = readSelectedPatches(soundCatalog, manifest.audio.sounds);

const microEngine = (await build({
  absWorkingDir: root,
  entryPoints: [path.join(root, 'tools', 'engine', 'index.mjs')],
  bundle: true,
  write: false,
  platform: 'browser',
  target: TARGET,
  format: 'iife',
  legalComments: 'inline',
  define: {
    SOUND_PATCHES: JSON.stringify(soundPatches),
    MUSIC_TRACKS: JSON.stringify(usedTracks),
  },
})).outputFiles[0].text;
writeFileSync(path.join(outDir, 'micro-engine.js'), microEngine);
console.log(`staged the micro-engine (${microEngine.length.toLocaleString('en-US')} bytes, ${Object.keys(soundPatches).length} sounds, ${usedTrackNames.length} tracks)`);

writeFileSync(
  path.join(outDir, 'SOURCE.json'),
  `${JSON.stringify({ repo: config.source.repo, branch: headBranch, commit: head, dirty, checkout: gamesDir }, null, 2)}\n`,
);

const bytes = readFileSync(path.join(outDir, 'index.html')).length;
console.log(`staged build/source/index.html (${bytes.toLocaleString('en-US')} bytes)`);

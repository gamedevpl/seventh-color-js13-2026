// Stage one assembled build of the game, plus everything the packer needs to
// rewrite it, into build/source/.
//
// The games repo owns assembly; this repo never re-implements it. We ask that
// repo's own `npm run build` for the bundle, then copy the few inputs the
// transforms read directly (the audio catalog, the game manifest).

import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { buildSync, transformSync } from 'esbuild';
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

const gameBundle = buildSync({
  absWorkingDir: gamesDir,
  entryPoints: [path.join(gamesDir, 'games', config.slug, 'game.ts')],
  bundle: true,
  write: false,
  platform: 'browser',
  target: TARGET,
  format: 'iife',
  legalComments: 'inline',
}).outputFiles[0].text;
writeFileSync(path.join(outDir, 'game.js'), gameBundle);

writeFileSync(
  path.join(outDir, 'SOURCE.json'),
  `${JSON.stringify({ repo: config.source.repo, branch: headBranch, commit: head, dirty, checkout: gamesDir }, null, 2)}\n`,
);

const bytes = readFileSync(path.join(outDir, 'index.html')).length;
console.log(`staged build/source/index.html (${bytes.toLocaleString('en-US')} bytes)`);

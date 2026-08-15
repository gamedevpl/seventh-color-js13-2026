// Where the bytes are.
//
// pack.mjs says how far over budget we are; this says which files to argue
// with. It re-bundles straight from the games checkout with a metafile, so the
// per-file numbers are post-minify contribution to the shipped script — not
// source size, which flatters comment-heavy files and lies about data tables.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import { build, transform } from 'esbuild';
import { locateCheckout } from './lib/checkout.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const config = JSON.parse(readFileSync(path.join(root, 'config.json'), 'utf8'));
const args = process.argv.slice(2);
const limit = Number(args.find((a) => /^\d+$/.test(a)) || 25);

const { dir: gamesDir } = locateCheckout(root, config);
const manifest = JSON.parse(readFileSync(path.join(gamesDir, 'games', config.slug, 'GAME.json'), 'utf8'));

const num = (bytes) => bytes.toLocaleString('en-US');
const gz = (text) => zlib.gzipSync(Buffer.from(text), { level: 9 }).length;

// GameKit modules are transpiled one file at a time by the assembler, so each
// one's cost is exactly its own minified size — no shared chunk to apportion.
const kit = [];
for (const name of ['core', ...manifest.engine.modules]) {
  const file = path.join(gamesDir, 'shared', 'modules', `${name}.ts`);
  const js = (await transform(readFileSync(file, 'utf8'), { loader: 'ts', target: 'es2020' })).code;
  const min = (await transform(js, { loader: 'js', minify: true, target: 'es2020', legalComments: 'none' })).code;
  kit.push({ name: `GameKit/${name}`, bytes: min.length, gzip: gz(min) });
}

const result = await build({
  absWorkingDir: gamesDir,
  entryPoints: [path.join(gamesDir, 'games', config.slug, 'game.ts')],
  bundle: true,
  write: false,
  platform: 'browser',
  target: 'es2020',
  format: 'iife',
  minify: true,
  metafile: true,
});
const outputKey = Object.keys(result.metafile.outputs)[0];
const game = Object.entries(result.metafile.outputs[outputKey].inputs)
  .map(([file, info]) => ({ name: file.replace(`games/${config.slug}/`, ''), bytes: info.bytesInOutput, gzip: null }))
  .filter((row) => row.bytes > 0);

const kitTotal = kit.reduce((sum, row) => sum + row.bytes, 0);
const gameTotal = game.reduce((sum, row) => sum + row.bytes, 0);

function table(title, rows, total, shown) {
  const sorted = [...rows].sort((a, b) => b.bytes - a.bytes);
  const head = shown ? sorted.slice(0, shown) : sorted;
  const width = Math.max(...head.map((r) => r.name.length));
  const lines = head.map((r) => {
    const share = ((r.bytes / total) * 100).toFixed(1).padStart(5);
    return `  ${r.name.padEnd(width)}  ${num(r.bytes).padStart(8)}  ${share}%${r.gzip ? `   gz ${num(r.gzip)}` : ''}`;
  });
  const rest = sorted.length - head.length;
  return [
    '',
    `${title} — ${num(total)} bytes minified across ${sorted.length} files`,
    ...lines,
    rest > 0 ? `  … and ${rest} more totalling ${num(sorted.slice(head.length).reduce((s, r) => s + r.bytes, 0))}` : null,
  ].filter(Boolean).join('\n');
}

console.log(table('engine', kit, kitTotal));
console.log(table('game', game, gameTotal, limit));
console.log('');
console.log(`engine ${num(kitTotal)} + game ${num(gameTotal)} = ${num(kitTotal + gameTotal)} bytes of minified script`);
console.log(`budget is ${num(config.budget)} bytes zipped — run \`npm run pack\` for the compressed number`);

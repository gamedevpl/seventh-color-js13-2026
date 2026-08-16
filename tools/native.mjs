// Build the native game: esbuild bundle -> terser -> roadroller -> zip.
//
// No games-repo checkout, no GameKit, no config.json transforms - this is a
// separate, much smaller pipeline than pull.mjs/pack.mjs. Reuses the same
// squeeze/zip chain (lib/squeeze.mjs) so numbers stay comparable across both.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { minifyJs, squeeze } from './lib/squeeze.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const args = process.argv.slice(2);
const cli = args.find((a) => /^--O\d$/.test(a));
const level = cli ? Number(cli.slice(3)) : 0;
const rolls = Number(args.find((a) => /^--rolls=/.test(a))?.split('=')[1] || 1);
const noRoadroller = args.includes('--no-roadroller');

const num = (n) => n.toLocaleString('en-US');

const result = await build({
  absWorkingDir: root,
  entryPoints: [path.join(root, 'native/src/main.js')],
  bundle: true,
  write: false,
  platform: 'browser',
  target: 'es2020',
  format: 'iife',
  logLevel: 'silent',
});
const raw = result.outputFiles[0].text;
console.log(`  esbuild bundle           ${num(raw.length)}`);

const { js: minified, stages } = await minifyJs(raw, { mangleProps: true });
console.log(`  terser + mangle          ${num(minified.length)}`);

const markup = '<canvas id=c></canvas>';
const css = 'body{margin:0;background:#0b0f14;overflow:hidden;height:100vh;display:flex;align-items:center;justify-content:center}';

let best = null, worst = null;
for (let i = 0; i < rolls; i++) {
  const out = await squeeze({
    js: minified, css, markup, title: 'The Seventh Color',
    roadroller: !noRoadroller, level, zopfliIterations: rolls > 1 ? 15 : 200,
  });
  console.log(`  roll ${i + 1}/${rolls}: index.zip = ${num(out.archiveBytes)}`);
  if (!best || out.archiveBytes < best.archiveBytes) best = out;
  if (!worst || out.archiveBytes > worst.archiveBytes) worst = out;
}

const outDir = path.join(root, 'build', 'native');
mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, 'index.html'), best.document);
writeFileSync(path.join(outDir, 'index.zip'), best.archive);

console.log('');
console.log(`  best of ${rolls}:  ${num(best.archiveBytes)}`);
console.log(`  worst of ${rolls}: ${num(worst.archiveBytes)}`);

const milestonePath = path.join(root, 'native-milestone.json');
let milestone = null;
try { milestone = JSON.parse(readFileSync(milestonePath, 'utf8')); } catch {}

if (milestone) {
  const ceiling = milestone.ceilingBytes;
  const pass = worst.archiveBytes < ceiling;
  console.log('');
  console.log(`  milestone ${milestone.name}: ceiling ${num(ceiling)}, worst-of-${rolls} ${num(worst.archiveBytes)} -> ${pass ? 'PASS' : 'FAIL'}`);
  if (!pass) process.exitCode = 1;
}

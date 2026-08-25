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
// Dev cheats are compiled in only with --cheats. DEV is substituted as a
// literal, so without the flag terser deletes every `if (DEV)` block and
// the shipped zip carries none of it - a debug key that reaches a compo
// judge is a liability, and one that costs bytes is two.
const cheats = args.includes('--cheats');
// Two entries live in this repo now. --game picks which one this run
// builds; each has its own source dir, milestone file and title, and both
// go through the same squeeze chain so their numbers stay comparable.
const game = args.find((a) => /^--game=/.test(a))?.split('=')[1] || 'native';
const TITLES = { native: 'The Seventh Color', strands: 'Seven Strands' };

const num = (n) => n.toLocaleString('en-US');

const result = await build({
  absWorkingDir: root,
  entryPoints: [path.join(root, game, 'src/main.js')],
  bundle: true,
  write: false,
  platform: 'browser',
  target: 'es2020',
  format: 'iife',
  logLevel: 'silent',
  define: { DEV: cheats ? 'true' : 'false' },
});
const raw = result.outputFiles[0].text;
console.log(`  esbuild bundle           ${num(raw.length)}${cheats ? '   (+dev cheats)' : ''}`);

const { js: minified, stages } = await minifyJs(raw, { mangleProps: true });
console.log(`  terser + mangle          ${num(minified.length)}`);

// The dev skip must never reach a shipped build. Checked here, on the
// minified output, because esbuild only substitutes DEV=false - it is
// terser that deletes the dead branch, so the pre-minified bundle still
// mentions the cheat and is the wrong thing to assert against.
if (!cheats && /ShiftLeft|ShiftRight/.test(minified)) {
  console.error('\nFAIL: dev cheat survived into a production build');
  process.exit(1);
}

const markup = '<canvas id=c></canvas>';
const css = 'body{margin:0;background:#0b0f14;overflow:hidden;height:100vh;display:flex;align-items:center;justify-content:center}';

let best = null, worst = null;
for (let i = 0; i < rolls; i++) {
  const out = await squeeze({
    js: minified, css, markup, title: TITLES[game] || game,
    roadroller: !noRoadroller, level, zopfliIterations: rolls > 1 ? 15 : 200,
  });
  console.log(`  roll ${i + 1}/${rolls}: index.zip = ${num(out.archiveBytes)}`);
  if (!best || out.archiveBytes < best.archiveBytes) best = out;
  if (!worst || out.archiveBytes > worst.archiveBytes) worst = out;
}

const outDir = path.join(root, 'build', game);
mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, 'index.html'), best.document);
writeFileSync(path.join(outDir, 'index.zip'), best.archive);

console.log('');
console.log(`  best of ${rolls}:  ${num(best.archiveBytes)}`);
console.log(`  worst of ${rolls}: ${num(worst.archiveBytes)}`);

const milestonePath = path.join(root, `${game}-milestone.json`);
let milestone = null;
try { milestone = JSON.parse(readFileSync(milestonePath, 'utf8')); } catch {}

// The ceiling belongs to the submission chain, and only to that. A
// --no-roadroller build is a debugging convenience and a --cheats build
// carries code that is deliberately deleted from the real one; holding
// either to the competition limit fails honest builds for being what they
// were asked to be. Measured and reported, never enforced.
if (milestone) {
  const ceiling = milestone.ceilingBytes;
  const shippable = !noRoadroller && !cheats;
  const pass = worst.archiveBytes < ceiling;
  console.log('');
  if (shippable) {
    console.log(`  milestone ${milestone.name}: ceiling ${num(ceiling)}, worst-of-${rolls} ${num(worst.archiveBytes)} -> ${pass ? 'PASS' : 'FAIL'}`);
    if (!pass) process.exitCode = 1;
  } else {
    console.log(`  ${num(worst.archiveBytes)} bytes - not a submission build (${noRoadroller ? 'no roadroller' : ''}${noRoadroller && cheats ? ', ' : ''}${cheats ? 'dev cheats' : ''}), ceiling not enforced`);
  }
}

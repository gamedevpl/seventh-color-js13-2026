// Pack the staged bundle down to a js13k-shaped zip and report what it weighs.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { transform } from 'esbuild';
import { minify as terserMinify } from 'terser';
import { Packer } from 'roadroller';
import { extractBundle, minifyMarkup, stripI18nAttributes } from './lib/extract.mjs';
import { inlineSynthesizedAudio } from './lib/audio-inline.mjs';
import { zipSingleFile } from './lib/zip.mjs';
import { renderLedger, writeSizeLedger } from './lib/report.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const config = JSON.parse(readFileSync(path.join(root, 'config.json'), 'utf8'));
const args = process.argv.slice(2);
const off = (name) => args.includes(`--no-${name}`);
const on = (name) => config.transforms[name] && !off(name);

const sourceDir = path.join(root, 'build', 'source');
if (!existsSync(path.join(sourceDir, 'index.html'))) {
  console.error('nothing staged — run `npm run pull` first');
  process.exit(1);
}

const html = readFileSync(path.join(sourceDir, 'index.html'), 'utf8');
const catalog = JSON.parse(readFileSync(path.join(sourceDir, 'sounds.json'), 'utf8'));
const manifest = JSON.parse(readFileSync(path.join(sourceDir, 'GAME.json'), 'utf8'));
const source = JSON.parse(readFileSync(path.join(sourceDir, 'SOURCE.json'), 'utf8'));

const steps = [];
const note = (label, bytes, detail = '') => steps.push({ label, bytes, detail });

const bundle = extractBundle(html);
note('assembled bundle', html.length, `${source.branch} @ ${source.commit.slice(0, 8)}`);

let js = bundle.js;
note('  javascript', js.length);

if (on('synthAudio')) {
  const swapped = inlineSynthesizedAudio(js, catalog, manifest.audio.sounds);
  js = swapped.js;
  note('  − inlined WAVs → runtime synth', js.length, `${swapped.before} → ${swapped.after} bytes of prelude`);
}

let markup = bundle.markup;
if (on('stripI18n')) markup = stripI18nAttributes(markup);
if (on('minifyMarkup')) markup = minifyMarkup(markup);

let css = bundle.css;
if (on('minifyCss')) {
  css = (await transform(css, { loader: 'css', minify: true })).code.trim();
}

js = (await transform(js, { loader: 'js', minify: true, target: 'es2020', legalComments: 'none' })).code;
note('  − esbuild minify', js.length);

const tersed = await terserMinify(js, {
  ecma: 2020,
  compress: { passes: 3, unsafe: true, unsafe_arrows: true, unsafe_math: true, pure_getters: true },
  mangle: on('mangleProps') ? { properties: { regex: /^_/ } } : true,
  format: { comments: false },
});
if (tersed.code && tersed.code.length < js.length) {
  js = tersed.code;
  note('  − terser', js.length);
}

const shellFor = (script) =>
  `<!doctype html><meta charset=utf-8><title>${bundle.title}</title>`
  + `<style>${css}</style>${markup}<script>${script}</script>`;

let payload = js;
if (on('roadroller')) {
  const level = Number(config.transforms.roadrollerOptimize) || 0;
  process.stdout.write(`  roadroller (-O${level}, ${js.length.toLocaleString('en-US')} bytes in)… `);
  const started = Date.now();
  const packer = new Packer([{ data: js, type: 'js', action: 'eval' }], { maxMemoryMB: 512 });
  if (level > 0) await packer.optimize(level);
  const { firstLine, secondLine } = packer.makeDecoder();
  payload = firstLine + secondLine;
  console.log(`${((Date.now() - started) / 1000).toFixed(1)}s → ${payload.length.toLocaleString('en-US')} bytes`);
  note('  − roadroller', payload.length);
}

const document = shellFor(payload);
note('final index.html', document.length, `css ${css.length} + markup ${markup.length}`);

const { archive, stored, deflatedBytes } = await zipSingleFile('index.html', document);
note('index.zip', archive.length, stored ? 'stored (deflate did not help)' : `deflate ${deflatedBytes}`);

const outDir = path.join(root, 'build');
mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, 'index.html'), document);
writeFileSync(path.join(outDir, 'index.zip'), archive);

console.log(renderLedger(steps, archive.length, config.budget));
writeSizeLedger(path.join(root, 'SIZE.md'), { steps, zipBytes: archive.length, budget: config.budget, source });

if (args.includes('--strict') && archive.length > config.budget) process.exit(1);

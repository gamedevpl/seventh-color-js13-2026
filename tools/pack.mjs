// Pack the staged bundle down to a js13k-shaped zip and report what it weighs.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { transform } from 'esbuild';
import { minify as terserMinify } from 'terser';
import { tokenizer } from 'acorn';
import { Packer } from 'roadroller';
import { extractBundle, minifyMarkup, stripI18nAttributes } from './lib/extract.mjs';
import { inlineSynthesizedAudio } from './lib/audio-inline.mjs';
import { shakeEngine } from './lib/shake.mjs';
import { stripPolish } from './lib/english.mjs';
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

function collectStringTokens(source) {
  const names = new Set();
  const keep = (text) => {
    if (typeof text === 'string' && /^[A-Za-z_$][\w$]*$/.test(text)) names.add(text);
  };
  for (const token of tokenizer(source, { ecmaVersion: 'latest' })) {
    if (token.type.label === 'string') keep(token.value);
    if (token.type.label === 'template') keep(token.value);
  }
  return [...names];
}

const bundle = extractBundle(html);
note('assembled bundle', html.length, `${source.branch} @ ${source.commit.slice(0, 8)}`);

let js;
if (on('microEngine')) {
  // Bypass GameKit entirely: a bespoke renderer/input/audio/loop (tools/engine/)
  // sized to what this one game calls, bundled by pull.mjs with its sound
  // patches and music tracks embedded. No splicing, no shaking — there is no
  // GameKit region to prove drift against, because none ships.
  const microEngine = readFileSync(path.join(sourceDir, 'micro-engine.js'), 'utf8');
  const gamePlain = readFileSync(path.join(sourceDir, 'game.js'), 'utf8');
  const gameJs = on('dropFeatures') && (config.dropFeatures ?? []).length
    ? readFileSync(path.join(sourceDir, 'game-cut.js'), 'utf8')
    : gamePlain;
  js = `${microEngine}\n${gameJs}`;
  note('  micro-engine + game', js.length, `engine ${microEngine.length} + game ${gameJs.length}`);
} else {
  js = bundle.js;
  note('  javascript', js.length);
}

if (!on('microEngine') && on('synthAudio')) {
  const swapped = inlineSynthesizedAudio(js, catalog, manifest.audio.sounds);
  js = swapped.js;
  note('  − inlined WAVs → runtime synth', js.length, `${swapped.before} → ${swapped.after} bytes of prelude`);
}

// GameKit publishes itself onto a global, so no bundler can shake it. We do it
// by hand from the staged per-module sources — but only after proving that
// recomposing those parts unshaken reproduces the assembled bundle exactly. If
// that assert ever fails, the parts have drifted from what gamedev.pl ships and
// the shaken build would be measuring a different program.
if (!on('microEngine') && on('treeShake')) {
  const engineDir = path.join(sourceDir, 'engine');
  const order = JSON.parse(readFileSync(path.join(engineDir, 'ORDER.json'), 'utf8'));
  const modules = Object.fromEntries(
    order.map((name) => [name, readFileSync(path.join(engineDir, `${name}.js`), 'utf8')]),
  );
  const gameJs = readFileSync(path.join(sourceDir, 'game.js'), 'utf8');

  // Splice the engine region in place rather than recomposing the whole bundle:
  // the prelude carries music tracks and other lines that are none of our
  // business, and rebuilding around them is how you silently drop one. If the
  // unshaken region is not found verbatim, the staged parts have drifted from
  // what the assembler produced and the shaken build would be a different
  // program — so that is a hard stop, not a warning.
  const assembled = order.map((name) => modules[name]).join('\n') + '\nObject.freeze(window.GameKit);';
  if (!js.includes(assembled)) {
    throw new Error('staged engine parts do not match the assembled bundle — re-run pull');
  }

  const shaken = shakeEngine(modules, gameJs, { keep: config.treeShakeKeep ?? [] });

  // Whole engine modules the entry does not need. Each is replaced by a shim
  // that keeps the shape its callers expect — dropping `save` removes the
  // persistence, not the in-run memory that story-progress routes through it.
  // Shims go in before the freeze, or GameKit is sealed without them.
  const dropped = config.dropEngineModules ?? [];
  const kept = order.filter((name) => !dropped.includes(name));
  const shims = dropped.map((name) => {
    const shimPath = path.join(root, 'tools', 'stubs', `engine-${name}.js`);
    if (!existsSync(shimPath)) throw new Error(`dropEngineModules names "${name}" but tools/stubs/engine-${name}.js is missing`);
    return readFileSync(shimPath, 'utf8');
  });
  const shakenEngine = [...kept.map((name) => shaken.modules[name]), ...shims].join('\n')
    + '\nObject.freeze(window.GameKit);';
  js = js.replace(assembled, () => shakenEngine);
  note(
    '  \u2212 tree-shook GameKit',
    js.length,
    `${shaken.removed.surface.length} surface + ${shaken.removed.published.length} published dropped`
    + (dropped.length ? `, ${dropped.join('/')} shimmed` : ''),
  );
}

// Swap the game region for the feature-dropped build. The bundle is
// prelude + engine + freeze + '\n' + game, so the game is everything after the
// freeze line — and we assert it matches the plain staged bundle before
// swapping, for the same reason the engine splice does. Skipped in
// microEngine mode: that path already picked game.js vs game-cut.js above.
if (!on('microEngine') && on('dropFeatures') && (config.dropFeatures ?? []).length) {
  const FREEZE = '\nObject.freeze(window.GameKit);\n';
  const at = js.lastIndexOf(FREEZE);
  if (at < 0) throw new Error('cannot find the engine/game seam in the assembled bundle');
  const gamePlain = readFileSync(path.join(sourceDir, 'game.js'), 'utf8');
  const gameCut = readFileSync(path.join(sourceDir, 'game-cut.js'), 'utf8');
  if (js.slice(at + FREEZE.length) !== gamePlain) {
    throw new Error('staged game bundle does not match the assembled one — re-run pull');
  }
  js = js.slice(0, at + FREEZE.length) + gameCut;
  note('  − dropped dev features', js.length, `${config.dropFeatures.length} modules stubbed`);
}

// One language ships, so the Polish half of every { en, pl } literal is weight
// with no reader. `t({ en })` still resolves — this deletes data, not mechanism.
if (on('englishOnly')) {
  const stripped = stripPolish(js);
  js = stripped.source;
  note('  − Polish strings', js.length, `${stripped.removed} literals, ${stripped.bytes} bytes`);
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

// mangleProps: false | "underscore" (/^_/ only) | "max" (every property not
// referenced by a quoted string; terser's builtin list protects DOM names).
// "max" renames both sides of every internal access consistently because the
// engine and the game are one program here — verify is the gate that proves it.
const mangleMode = off('mangleProps') ? false : config.transforms.mangleProps;
// Any identifier-shaped string literal is reserved: dynamic property access
// (steps[name], state[kind]) always names its key as a literal somewhere, and
// renaming only the dotted side of such a pair is how mangling breaks. Tokenised
// with acorn, not a regex — an apostrophe inside prose desyncs any quote-parity
// scan and silently drops every capture after it.
const reserved = collectStringTokens(js);
// toplevel mangling was tried here and measured at zero effect: esbuild's own
// bundler already renames every top-level binding to a short name during the
// minify step above (bundling in iife format with no export surface makes
// that safe for esbuild too), so terser finds nothing left to shorten.
const mangle =
  mangleMode === 'max' ? { properties: { keep_quoted: 'strict', reserved } }
  : mangleMode === 'underscore' ? { properties: { regex: /^_/ } }
  : true;
const tersed = await terserMinify(js, {
  ecma: 2020,
  compress: { passes: 3, unsafe: true, unsafe_arrows: true, unsafe_math: true, pure_getters: true },
  mangle,
  format: { comments: false },
});
if (tersed.code && tersed.code.length < js.length) {
  js = tersed.code;
  note(`  − terser${mangleMode === 'max' ? ' + property mangle' : ''}`, js.length);
}

// Fold the page chrome into the script so roadroller's context models compress
// markup, css and code as one stream instead of three. The shell keeps an
// explicit <body> so the injection has somewhere to land before the game runs.
if (on('inlineChrome')) {
  const esc = (text) => JSON.stringify(text).replace(/<\//g, '<\\/');
  js = `document.head.insertAdjacentHTML("beforeend","<style>"+${esc(css)}+"</style>");`
    + `document.body.insertAdjacentHTML("afterbegin",${esc(markup)});\n${js}`;
  css = '';
  markup = '';
  note('  + chrome folded into payload', js.length);
}

const shellFor = (script) =>
  `<!doctype html><meta charset=utf-8><title>${bundle.title}</title>`
  + `${css ? `<style>${css}</style>` : ''}${markup || '<body>'}<script>${script}</script>`;

let payload = js;
if (on('roadroller')) {
  const cli = args.find((a) => /^--O\d$/.test(a));
  const level = cli ? Number(cli.slice(3)) : Number(config.transforms.roadrollerOptimize) || 0;
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

// What would cutting X actually save?
//
// Minified source size is a bad guide to zipped size — prose and data tables
// compress far better than code, so a big file can be a cheap one. This builds
// the bundle with chosen source files stubbed out and runs the real compression
// chain over each variant, so every candidate cut is priced in the only unit
// that matters: bytes off the archive.
//
// Probe builds are deliberately broken — stubbing a module does not fix its
// callers. They measure, they do not run.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, transform } from 'esbuild';
import { locateCheckout } from './lib/checkout.mjs';
import { inlineSynthesizedAudio } from './lib/audio-inline.mjs';
import { extractBundle, minifyMarkup, stripI18nAttributes } from './lib/extract.mjs';
import { minifyJs, squeeze } from './lib/squeeze.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const config = JSON.parse(readFileSync(path.join(root, 'config.json'), 'utf8'));
const { dir: gamesDir } = locateCheckout(root, config);
const manifest = JSON.parse(readFileSync(path.join(gamesDir, 'games', config.slug, 'GAME.json'), 'utf8'));
const catalog = JSON.parse(readFileSync(path.join(gamesDir, 'shared', 'audio', 'sounds.json'), 'utf8'));

// name → { drop: /regex/ over game source paths, modules: GameKit modules to omit,
//          chrome: strip the page shell down to a bare canvas host }
const PROBES = {
  'editor + vector runtime': { drop: /cast-(editor|vector)/ },
  'cast gallery': { drop: /cast-gallery/ },
  'all cast art (faces, rigs, gallery)': { drop: /cast-/ },
  'finale chapter data': { drop: /story-slice-finale-data/ },
  'all story prose': { drop: /story-slice(-finale)?-data/ },
  'engine: effects': { modules: ['effects'] },
  'engine: save': { modules: ['save'] },
  'engine: ui': { modules: ['ui'] },
  'engine: input': { modules: ['input'] },
  'engine: everything but core+gfx': { modules: ['input', 'drawing', 'ui', 'effects', 'audio', 'save'] },
  'audio (module + patches)': { modules: ['audio'], noAudioPrelude: true },
  'page chrome (css + markup)': { chrome: true },
};

const stubPlugin = (pattern) => ({
  name: 'stub',
  setup(pluginBuild) {
    if (!pattern) return;
    // CommonJS, so esbuild allows any named import to resolve against the stub.
    pluginBuild.onLoad({ filter: pattern }, () => ({ contents: 'module.exports = {};', loader: 'js' }));
  },
});

async function buildGame(drop) {
  const result = await build({
    absWorkingDir: gamesDir,
    entryPoints: [path.join(gamesDir, 'games', config.slug, 'game.ts')],
    bundle: true,
    write: false,
    platform: 'browser',
    target: 'es2020',
    format: 'iife',
    plugins: [stubPlugin(drop)],
    logLevel: 'silent',
  });
  return result.outputFiles[0].text;
}

async function buildKit(omit = []) {
  const names = ['core', ...manifest.engine.modules].filter((name) => !omit.includes(name));
  const parts = [];
  for (const name of names) {
    const source = readFileSync(path.join(gamesDir, 'shared', 'modules', `${name}.ts`), 'utf8');
    parts.push((await transform(source, { loader: 'ts', target: 'es2020' })).code);
  }
  return parts.join('\n');
}

const assembled = readFileSync(path.join(root, 'build', 'source', 'index.html'), 'utf8');
const bundle = extractBundle(assembled);
const audioPrelude = inlineSynthesizedAudio(bundle.js, catalog, manifest.audio.sounds);
const preludeSource = audioPrelude.js.slice(0, audioPrelude.after);

const baseCss = (await transform(bundle.css, { loader: 'css', minify: true })).code.trim();
const baseMarkup = minifyMarkup(stripI18nAttributes(bundle.markup));
// A compo entry needs the canvas the engine mounts into and nothing else.
const bareMarkup = '<div class="wrap"><div id="game"></div></div>';
const bareCss = 'body{margin:0;background:#0b0f14}#game{width:100vw;height:100vh}';

async function variant({ drop, modules = [], noAudioPrelude = false, chrome = false }) {
  const js = [noAudioPrelude ? '' : preludeSource, await buildKit(modules), await buildGame(drop)]
    .filter(Boolean).join('\n');
  const minified = await minifyJs(js);
  const result = await squeeze({
    js: minified.js,
    css: chrome ? bareCss : baseCss,
    markup: chrome ? bareMarkup : baseMarkup,
    title: bundle.title,
    level: Number(config.transforms.roadrollerOptimize) || 0,
    // Probes compare deltas, so a consistent deflate is enough — and skipping
    // zopfli keeps a dozen variants to seconds rather than minutes.
    zopfliIterations: 0,
  });
  return { minifiedBytes: minified.js.length, zipBytes: result.archiveBytes };
}

const num = (bytes) => bytes.toLocaleString('en-US');
const only = process.argv.slice(2).filter((a) => !a.startsWith('-'));

// --floor answers the prior question: before anything is cut, does what is left
// even fit? It prices the engine with no game, and the game with no engine.
if (process.argv.includes('--floor')) {
  const ENGINE_SETS = [
    ['core'],
    ['core', 'gfx'],
    ['core', 'gfx', 'drawing'],
    ['core', 'gfx', 'drawing', 'input'],
    ['core', ...manifest.engine.modules],
  ];
  console.log(`  floors against a ${num(config.budget)} byte budget\n`);
  console.log(`  ${'what'.padEnd(46)} ${'minified'.padStart(9)} ${'zipped'.padStart(8)}  ratio   budget`);
  for (const set of ENGINE_SETS) {
    const all = ['core', ...manifest.engine.modules];
    const { js } = await minifyJs(await buildKit(all.filter((name) => !set.includes(name))));
    const result = await squeeze({ js, css: bareCss, markup: bareMarkup, title: bundle.title, zopfliIterations: 0 });
    const label = `engine ${set.join('+')}, no game`;
    console.log(
      `  ${label.padEnd(46)} ${num(js.length).padStart(9)} ${num(result.archiveBytes).padStart(8)}`
      + `  ${(js.length / result.archiveBytes).toFixed(2)}x   ${((result.archiveBytes / config.budget) * 100).toFixed(0)}%`,
    );
  }
  const gameOnly = await minifyJs(await buildGame(null));
  const result = await squeeze({ js: gameOnly.js, css: bareCss, markup: bareMarkup, title: bundle.title, zopfliIterations: 0 });
  console.log(
    `  ${'game source, no engine at all'.padEnd(46)} ${num(gameOnly.js.length).padStart(9)} ${num(result.archiveBytes).padStart(8)}`
    + `  ${(gameOnly.js.length / result.archiveBytes).toFixed(2)}x   ${((result.archiveBytes / config.budget) * 100).toFixed(0)}%`,
  );
  process.exit(0);
}

process.stdout.write('baseline… ');
const base = await variant({});
console.log(`${num(base.minifiedBytes)} minified → ${num(base.zipBytes)} zipped`);
console.log(`budget ${num(config.budget)} — over by ${num(base.zipBytes - config.budget)}\n`);

const width = Math.max(...Object.keys(PROBES).map((k) => k.length));
console.log(`  ${'cut'.padEnd(width)}  ${'minified'.padStart(10)}  ${'zipped'.padStart(9)}  ${'saves'.padStart(8)}   share`);

for (const [name, probe] of Object.entries(PROBES)) {
  if (only.length && !only.some((needle) => name.includes(needle))) continue;
  const result = await variant(probe);
  const saved = base.zipBytes - result.zipBytes;
  const share = ((saved / (base.zipBytes - config.budget)) * 100).toFixed(1);
  console.log(
    `  ${name.padEnd(width)}  ${num(result.minifiedBytes).padStart(10)}  ${num(result.zipBytes).padStart(9)}`
    + `  ${num(saved).padStart(8)}   ${share.padStart(5)}% of the gap`,
  );
}

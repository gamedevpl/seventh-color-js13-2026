// Which parts of the scene content cost what, in bytes off the archive.
//
// Leave-one-out at the compressed level: rebuild the shipping bundle with one
// content group stubbed, run the real chain (minify → mangle → fold →
// roadroller → zip), and charge the group its marginal delta. Compressed
// contributions do not sum to the total — groups share redundancy the model
// exploits, so the sum of deltas undershoots the whole — but the marginal
// number is the honest answer to "what would removing this actually buy".
//
// Roadroller runs at -O0 and the zip skips zopfli: deltas, not absolutes, and
// this keeps ~30 variants to a few minutes. Baseline is therefore slightly
// above the shipping SIZE.md number.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, transform, transformSync } from 'esbuild';
import { minify as terserMinify } from 'terser';
import { tokenizer, parse } from 'acorn';
import { Packer } from 'roadroller';
import { extractBundle, minifyMarkup, stripI18nAttributes } from './lib/extract.mjs';
import { stripPolish } from './lib/english.mjs';
import { filterShellCss, BARE_MARKUP } from './lib/shell.mjs';
import { zipSingleFile } from './lib/zip.mjs';
import { locateCheckout } from './lib/checkout.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const config = JSON.parse(readFileSync(path.join(root, 'config.json'), 'utf8'));
const { dir: gamesDir } = locateCheckout(root, config, { clone: false });
const stubDir = path.join(root, 'tools', 'stubs');
const num = (n) => n.toLocaleString('en-US');

// Content groups, coarse enough to act on. A group is a set of source files;
// PROSE is special — it keeps every file but blanks long string literals, so
// it prices the words separately from the staging structure around them.
const GROUPS = {
  'castle mirror art + bog dual-puzzle': ['castle-parallel-render.ts', 'dual-puzzle-logic.ts'],
  'chapter: castle descent': ['castle-descent-logic.ts', 'castle-descent-render.ts'],
  'chapter: kitchen stealth': ['kitchen-stealth-logic.ts', 'kitchen-stealth-render.ts'],
  'chapter: cage escape': ['cage-escape-logic.ts', 'cage-escape-render.ts'],
  'chapter: meg encounter': ['meg-encounter-logic.ts', 'meg-encounter-render.ts'],
  'chapter: ring recovery': ['ring-recovery-logic.ts', 'ring-recovery-render.ts'],
  'chapter: last stand': ['last-stand-logic.ts', 'last-stand-render.ts'],
  'chapter: throne pursuit': ['throne-pursuit-logic.ts', 'throne-pursuit-render.ts'],
  'chapter: spring restoration': ['spring-restoration-logic.ts', 'spring-restoration-render.ts'],
  'chapter: bog cottage': ['bog-cottage-render.ts'],
  'chapter: epilogue': ['epilogue-logic.ts', 'epilogue-render.ts'],
  'quest scene dressing': ['quest-scene-render.ts'],
  'living ink cells': ['living-ink-cells.ts'],
  'story data: scenes 1–10': ['story-slice-data.ts'],
  'story data: finale (scenes 11–28)': ['story-slice-finale-data.ts'],
  'story engine: slice logic+render': ['story-slice-logic.ts', 'story-slice-render.ts', 'story-slice-movement.ts'],
  'story engine: dialogue UI': ['story-dialogue-render.ts', 'story-dialogue-layout.ts', 'story-presentation.ts'],
  'story engine: actors on stage': ['story-actor-render.ts'],
  'story engine: chapter flow': ['chapter-flow.ts', 'chapter-flow-input.ts', 'chapter-flow-render.ts', 'story-text.ts'],
  'cast art: human rigs': ['cast-actor-rig.ts', 'cast-actor-heads.ts'],
  'cast art: unicorn/creature rigs': ['cast-creature-actor-rig.ts', 'cast-creature-faces.ts'],
  'cast art: front faces': ['cast-faces.ts'],
  'cast art: profile faces': ['cast-profile-faces.ts'],
  'cast art: expressions/primitives': ['cast-face-expression.ts', 'cast-face-primitives.ts'],
  'cast data + scene actions': ['cast-data.ts', 'cast-scene-actions.ts'],
};

function collectStringTokens(source) {
  const names = new Set();
  for (const token of tokenizer(source, { ecmaVersion: 'latest' })) {
    if ((token.type.label === 'string' || token.type.label === 'template')
      && typeof token.value === 'string' && /^[A-Za-z_$][\w$]*$/.test(token.value)) names.add(token.value);
  }
  return [...names];
}

/** Blank every string literal of `min` chars or more — the prose variant. */
function blankProse(source, min = 12) {
  const ranges = [];
  const tree = parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
  const walk = (node) => {
    if (!node || typeof node.type !== 'string') return;
    if (node.type === 'Literal' && typeof node.value === 'string' && node.value.length >= min) {
      ranges.push({ start: node.start, end: node.end });
    }
    for (const key of Object.keys(node)) {
      if (key === 'type' || key === 'start' || key === 'end') continue;
      // Module specifiers are string literals too; blanking one unresolves it.
      if (key === 'source' && /^(Import|Export)/.test(node.type)) continue;
      const value = node[key];
      if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value.type === 'string') walk(value);
    }
  };
  walk(tree);
  return [...ranges].sort((a, b) => b.start - a.start)
    .reduce((text, range) => `${text.slice(0, range.start)}""${text.slice(range.end)}`, source);
}

/** Keep the first `keep` array elements of `export const <name> = [...]`. */
function truncateScenes(js, name, keep, dropSpread) {
  const tree = parse(js, { ecmaVersion: 'latest', sourceType: 'module' });
  let array = null;
  const walk = (node) => {
    if (!node || typeof node.type !== 'string') return;
    if (node.type === 'VariableDeclarator' && node.id.name === name && node.init?.type === 'ArrayExpression') array = node.init;
    for (const key of Object.keys(node)) {
      if (key === 'type' || key === 'start' || key === 'end') continue;
      const value = node[key];
      if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value.type === 'string') walk(value);
    }
  };
  walk(tree);
  if (!array) throw new Error(`no array literal for ${name}`);
  const objects = array.elements.filter((el) => el.type === 'ObjectExpression');
  const spread = array.elements.find((el) => el.type === 'SpreadElement');
  if (keep > objects.length) throw new Error(`${name} holds ${objects.length} scenes, cannot keep ${keep}`);
  const kept = objects.slice(0, keep).map((el) => js.slice(el.start, el.end));
  if (spread && !dropSpread) kept.push(js.slice(spread.start, spread.end));
  return js.slice(0, array.start) + '[' + kept.join(',') + ']' + js.slice(array.end);
}

async function bundleGame({ dropFiles = [], proseOnly = false, truncate = null } = {}) {
  const result = await build({
    absWorkingDir: gamesDir,
    entryPoints: [path.join(gamesDir, 'games', config.slug, 'game.ts')],
    bundle: true, write: false, platform: 'browser', target: 'safari16', format: 'iife',
    legalComments: 'none', logLevel: 'silent',
    plugins: [{
      name: 'variant',
      setup(pluginBuild) {
        pluginBuild.onResolve({ filter: /\.ts$/ }, (found) => {
          const base = path.basename(found.path);
          if ((config.dropFeatures ?? []).includes(base)) return { path: path.join(stubDir, base) };
          return undefined;
        });
        pluginBuild.onLoad({ filter: /\.ts$/ }, (found) => {
          const base = path.basename(found.path);
          if (found.path.startsWith(stubDir)) return undefined;
          if (dropFiles.includes(base)) return { contents: 'module.exports = {};', loader: 'js' };
          let text = readFileSync(found.path, 'utf8');
          for (const patch of (config.patches ?? []).filter((p) => found.path.endsWith(p.file))) {
            const hits = text.split(patch.find).length - 1;
            if (hits !== 1) throw new Error(`patch for ${patch.file} matched ${hits}× — the source moved`);
            text = text.replace(patch.find, patch.replace);
          }
          // acorn reads JavaScript, not TypeScript — transpile before AST work.
          if (proseOnly && /story-slice(-finale)?-data|story-text|chapter-flow\.ts/.test(base)) {
            return { contents: blankProse(transformSync(text, { loader: 'ts' }).code), loader: 'js' };
          }
          if (truncate) {
            if (base === 'story-slice-data.ts') {
              const js = transformSync(text, { loader: 'ts' }).code;
              return { contents: truncateScenes(js, 'STORY_SCENES', truncate.main, truncate.dropSpread), loader: 'js' };
            }
            if (base === 'story-slice-finale-data.ts') {
              if (truncate.finale === 0) return { contents: 'module.exports = { FINAL_STORY_SCENES: [] };', loader: 'js' };
              const js = transformSync(text, { loader: 'ts' }).code;
              return { contents: truncateScenes(js, 'FINAL_STORY_SCENES', truncate.finale, false), loader: 'js' };
            }
          }
          return { contents: text, loader: 'ts' };
        });
      },
    }],
  });
  return result.outputFiles[0].text;
}

const bundle = extractBundle(readFileSync(path.join(root, 'build', 'source', 'index.html'), 'utf8'));
const microEngine = readFileSync(path.join(root, 'build', 'source', 'micro-engine.js'), 'utf8');
const css = filterShellCss(bundle.css);
const markup = BARE_MARKUP;

async function measure(variant) {
  const gameJs = await bundleGame(variant);
  let js = stripPolish(`${microEngine}\n${gameJs}`).source;
  js = (await transform(js, { loader: 'js', minify: true, target: 'es2020', legalComments: 'none' })).code;
  const reserved = collectStringTokens(js);
  const tersed = await terserMinify(js, {
    ecma: 2020,
    compress: { passes: 3, unsafe: true, unsafe_arrows: true, unsafe_math: true, pure_getters: true },
    mangle: { properties: { keep_quoted: 'strict', reserved } },
    format: { comments: false },
  });
  if (tersed.code && tersed.code.length < js.length) js = tersed.code;
  const minCss = (await transform(css, { loader: 'css', minify: true })).code.trim();
  const esc = (text) => JSON.stringify(text).replace(/<\//g, '<\\/');
  js = `document.head.insertAdjacentHTML("beforeend","<style>"+${esc(minCss)}+"</style>");`
    + `document.body.insertAdjacentHTML("afterbegin",${esc(minifyMarkup(stripI18nAttributes(markup)))});\n${js}`;
  const packer = new Packer([{ data: js, type: 'js', action: 'eval' }], { maxMemoryMB: 512 });
  const { firstLine, secondLine } = packer.makeDecoder();
  const doc = `<!doctype html><meta charset=utf-8><title>${bundle.title}</title><body><script>${firstLine + secondLine}</script>`;
  const { archive } = await zipSingleFile('index.html', doc, { zopfliIterations: 0 });
  return archive.length;
}

const base = await measure({});
console.log(`baseline (this probe's chain): ${num(base)} zipped — deltas below are marginal bytes\n`);

// --curve: cumulative cost by story progression. Each point truncates the
// scene arrays at a chapter boundary and stubs the minigame files only later
// chapters reach, so the number is "the zip if the story ended here".
if (process.argv.includes('--curve')) {
  const CH3 = ['bog-cottage-render.ts', 'dual-puzzle-logic.ts', 'meg-encounter-logic.ts', 'meg-encounter-render.ts', 'quest-scene-render.ts'];
  const CH4 = ['castle-descent-logic.ts', 'castle-descent-render.ts', 'cage-escape-logic.ts', 'cage-escape-render.ts', 'kitchen-stealth-logic.ts', 'kitchen-stealth-render.ts', 'castle-parallel-render.ts'];
  const CH5 = ['throne-pursuit-logic.ts', 'throne-pursuit-render.ts', 'last-stand-logic.ts', 'last-stand-render.ts'];
  const EPI = ['spring-restoration-logic.ts', 'spring-restoration-render.ts', 'ring-recovery-logic.ts', 'ring-recovery-render.ts', 'epilogue-logic.ts', 'epilogue-render.ts'];
  const MAIN_SCENES = 10;
  const CUTS = [
    ['prologue only (1 scene)', 1, [...CH3, ...CH4, ...CH5, ...EPI]],
    ['+ ch I: forbidden wonder (4)', 4, [...CH3, ...CH4, ...CH5, ...EPI]],
    ['+ ch II: world freezes (7)', 7, [...CH3, ...CH4, ...CH5, ...EPI]],
    ['+ ch III: two courages (12)', 12, [...CH4, ...CH5, ...EPI]],
    ['+ ch IV: dark castle (18)', 18, [...CH5, ...EPI]],
    ['+ ch V: the last ray (25)', 25, [...EPI]],
    ['+ epilogue = whole game (28)', 28, []],
  ];
  console.log('  cumulative zip by story progression');
  let prev = null;
  for (const [label, keep, dropFiles] of CUTS) {
    const truncate = {
      main: Math.min(keep, MAIN_SCENES),
      dropSpread: keep <= MAIN_SCENES,
      finale: Math.max(0, keep - MAIN_SCENES),
    };
    const zipped = await measure({ dropFiles, truncate });
    const step = prev === null ? '' : `   +${num(zipped - prev)} for this chapter`;
    console.log(`  ${label.padEnd(32)} ${num(zipped).padStart(8)}${step}`);
    prev = zipped;
  }
  process.exit(0);
}

const rows = [];
for (const [name, files] of Object.entries(GROUPS)) {
  const zipped = await measure({ dropFiles: files });
  rows.push({ name, saves: base - zipped });
  process.stdout.write('.');
}
const prose = await measure({ proseOnly: true });
rows.push({ name: 'PROSE ALONE (strings ≥12 chars in story data)', saves: base - prose });
console.log('\n');

rows.sort((a, b) => b.saves - a.saves);
const width = Math.max(...rows.map((r) => r.name.length));
let sum = 0;
for (const row of rows) {
  if (!row.name.startsWith('PROSE')) sum += row.saves;
  console.log(`  ${row.name.padEnd(width)}  ${num(row.saves).padStart(7)}`);
}
console.log(`\n  sum of marginal deltas (excl. prose row): ${num(sum)} — vs whole-bundle scene share; overlap makes the parts undershoot the whole`);

// Stage one assembled build of the game, plus everything the packer needs to
// rewrite it, into build/source/.
//
// The games repo owns assembly; this repo never re-implements it. We ask that
// repo's own `npm run build` for the bundle, then copy the few inputs the
// transforms read directly (the audio catalog, the game manifest).

import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { build, buildSync, transformSync } from 'esbuild';
import { readSelectedPatches } from './lib/audio-inline.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { locateCheckout, run } from './lib/checkout.mjs';
import { readScenes, planScope, truncateAndClose, stubFor, recastScenes, pruneModeTable, dropScenes } from './lib/scope.mjs';
import { planCast, foldAbsentMembers, pruneCastTable, reachableCastIds, readCast, foldAbsentSceneFields, foldFalseReads } from './lib/cast.mjs';

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

async function bundleGame(stubs, applyScope = false) {
  const result = await build({
    absWorkingDir: gamesDir,
    entryPoints: [path.join(gamesDir, 'games', config.slug, 'game.ts')],
    bundle: true,
    write: false,
    platform: 'browser',
    target: TARGET,
    format: 'iife',
    legalComments: 'inline',
    plugins: (stubs.length || (applyScope && scope)) ? [{
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
          const base = path.basename(found.path);
          const patches = (config.patches ?? []).filter((p) => found.path.endsWith(p.file));
          const scoped = applyScope && scope;
          if (!patches.length && !scoped) return undefined;
          let text = readFileSync(found.path, 'utf8');
          for (const patch of patches) {
            const hits = text.split(patch.find).length - 1;
            if (hits !== 1) {
              throw new Error(`patch for ${patch.file} matched ${hits} times, expected 1 — the source moved`);
            }
            text = text.replace(patch.find, patch.replace);
          }
          if (scoped) {
            const js = () => {
              let out = transformSync(text, { loader: 'ts' }).code;
              if (hasRecast) {
                if (base === 'story-slice-data.ts') out = recastScenes(out, 'STORY_SCENES', recast);
                if (base === 'story-slice-finale-data.ts') out = recastScenes(out, 'FINAL_STORY_SCENES', recast);
              }
              if (skipIds.length) {
                if (base === 'story-slice-data.ts') out = dropScenes(out, 'STORY_SCENES', skipIds);
                if (base === 'story-slice-finale-data.ts') out = dropScenes(out, 'FINAL_STORY_SCENES', skipIds);
              }
              return out;
            };
            if (scope.droppedModules.includes(base)) return { contents: stubFor(js()), loader: 'js' };
            const close = { outcome: config.scope?.outcome ?? 'won', delayFrames: config.scope?.delayFrames ?? 8 };
            if (base === 'story-slice-data.ts') {
              return { contents: truncateAndClose(js(), 'STORY_SCENES', scope.keepMain, {
                skip: scope.skipMain, dropSpread: scope.keepFinale === 0, closeLast: scope.keepFinale === 0, ...close,
              }), loader: 'js' };
            }
            if (base === 'story-slice-finale-data.ts') {
              return { contents: truncateAndClose(js(), 'FINAL_STORY_SCENES', scope.keepFinale, {
                skip: scope.skipFinale, dropSpread: false, closeLast: scope.keepFinale > 0, ...close,
              }), loader: 'js' };
            }
            if (cast?.droppedIds.length) {
              if (base === 'cast-data.ts') {
                const pruned = pruneCastTable(js(), cast.keptIds);
                return { contents: pruned.js, loader: 'js' };
              }
              if (/^cast-|^story-actor-render/.test(base)) {
                return {
                  contents: foldAbsentMembers(js(), cast.keptIds, cast.keptKinds, cast.allIds, cast.allKinds),
                  loader: 'js',
                };
              }
            }
            // Every game module, not a hand-picked few: the fold only touches
            // `.art`/`.mode` compared against values the scene table defines,
            // so a module that has no such comparison is simply unchanged.
            if (sceneFields) {
              let text2 = foldAbsentSceneFields(js(), sceneFields.keptArt, sceneFields.keptModes,
                sceneFields.allArt, sceneFields.allModes);
              text2 = foldAbsentMembers(text2, cast.keptIds, cast.keptKinds, cast.allIds, cast.allKinds);
              if (base === 'story-dialogue-render.ts') {
                text2 = pruneModeTable(text2, 'PROMPT_KEYS', sceneFields.keptModes, sceneFields.allModes);
                text2 = pruneModeTable(text2, 'labels', sceneFields.keptVerbs, sceneFields.allVerbs);
              }
              // With save shimmed, no checkpoint ever loads, so the resume
              // dialog is unreachable: its reads fold to false and terser
              // deletes the dialog, its input handling, and its painter.
              if ((config.dropEngineModules ?? []).includes('save')) {
                text2 = foldFalseReads(text2, ['resumeOpen']);
              }
              return { contents: text2, loader: 'js' };
            }
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

// The scope dial. `--endAt <sceneId>` overrides config for a one-off trial;
// `--scenes` just lists what the dial can be set to and exits.
const gameSrcDir = path.join(gamesDir, 'games', config.slug, 'game');
// acorn reads JavaScript, so every scope operation works on transpiled source.
const asJs = (file) => transformSync(readFileSync(file, 'utf8'), { loader: 'ts' }).code;
// Which ids each scene's painter stages by name. Needed before recasting, so a
// recast that cannot actually work is refused with the reason rather than
// silently keeping the member it was meant to drop.
const painterStaging = (() => {
  const castIds = readCast(asJs(path.join(gameSrcDir, 'cast-data.ts'))).map((e) => e.id).filter(Boolean);
  const renderSrc = asJs(path.join(gameSrcDir, 'story-slice-render.ts'));
  const raw = readScenes(
    asJs(path.join(gameSrcDir, 'story-slice-data.ts')),
    asJs(path.join(gameSrcDir, 'story-slice-finale-data.ts')),
  );
  const map = {};
  for (const scene of raw.all) {
    if (!scene.art) continue;
    map[scene.id] = reachableCastIds(renderSrc, [scene.art], castIds).ids;
  }
  return map;
})();

// Recast first, so the plan below sees the staging this build will actually use.
const recast = config.scope?.recast ?? {};
const hasRecast = Object.keys(recast).length > 0;
const withRecast = (js, name) => (hasRecast ? recastScenes(js, name, recast, painterStaging) : js);
// Scenes to drop from the middle of the window (relinked, not just deleted) —
// applied after recast so the two folds compose the same way here as in the
// per-file transform below, and before readScenes so planScope's indices
// already reflect the gap.
const skipFlag = flag('skip');
const skipIds = (skipFlag ? String(skipFlag).split(',') : (config.scope?.skip ?? [])).filter(Boolean);
const recastOnly = readScenes(
  withRecast(asJs(path.join(gameSrcDir, 'story-slice-data.ts')), 'STORY_SCENES'),
  withRecast(asJs(path.join(gameSrcDir, 'story-slice-finale-data.ts')), 'FINAL_STORY_SCENES'),
);
for (const id of skipIds) {
  if (!recastOnly.all.some((s) => s.id === id)) {
    throw new Error(`scope: --skip named "${id}". Known ids:\n  ${recastOnly.all.map((s) => s.id).join('\n  ')}`);
  }
}
const withSkip = (js, name) => (skipIds.length ? dropScenes(js, name, skipIds) : js);
const scenes = readScenes(
  withSkip(withRecast(asJs(path.join(gameSrcDir, 'story-slice-data.ts')), 'STORY_SCENES'), 'STORY_SCENES'),
  withSkip(withRecast(asJs(path.join(gameSrcDir, 'story-slice-finale-data.ts')), 'FINAL_STORY_SCENES'), 'FINAL_STORY_SCENES'),
);
if (flag('scenes')) {
  console.log(`${scenes.all.length} scenes, in play order:`);
  scenes.all.forEach((s, i) => console.log(`  ${String(i).padStart(2)}  ${s.id.padEnd(22)} ${s.mode ?? ''}`));
  process.exit(0);
}
const endAt = flag('endAt') || config.scope?.endAt || null;
const startAt = flag('startAt') || config.scope?.startAt || null;
const scope = endAt ? planScope(scenes, endAt, startAt) : null;
// Cast the scoped story never stages. Their art is unreachable, so the
// comparisons that select it fold to constants and terser clears the rest.
const castJs = asJs(path.join(gameSrcDir, 'cast-data.ts'));
const renderJs = asJs(path.join(gameSrcDir, 'story-slice-render.ts'));
const allCastIds = readCast(castJs).map((e) => e.id).filter(Boolean);
const painted = scope
  ? reachableCastIds(renderJs, [...new Set(scope.kept.map((s) => s.art).filter(Boolean))], allCastIds)
  : null;
const cast = scope ? planCast(castJs, scope.cast, painted.ids) : null;
// Scene painters and mode handlers live behind if/else chains on `scene.art`
// and `scene.mode`, so values no kept scene uses keep whole painters alive.
const sceneFields = scope ? {
  keptArt: [...new Set(scope.kept.map((s) => s.art).filter(Boolean))],
  keptModes: scope.modes,
  allArt: [...new Set(scenes.all.map((s) => s.art).filter(Boolean))],
  allModes: [...new Set(scenes.all.map((s) => s.mode).filter(Boolean))],
  keptVerbs: scope.verbs,
  allVerbs: [...new Set(scenes.all.flatMap((s) => s.verbs ?? []))],
} : null;
if (sceneFields) {
  const deadArt = sceneFields.allArt.length - sceneFields.keptArt.length;
  const deadModes = sceneFields.allModes.length - sceneFields.keptModes.length;
  console.log(`  scene painters folded out: ${deadArt} art, ${deadModes} modes`);
}
if (scope) {
  console.log(`scope: ${startAt ? `"${scope.kept[0].id}" through` : 'ending at'} "${scope.lastSceneId}" — ${scope.kept.length}/${scope.totalScenes} scenes,`
    + ` ${scope.modes.length} modes, ${scope.music.length} tracks, ${scope.cast.length} cast`);
  if (scope.droppedModules.length) console.log(`  unreachable minigames stubbed: ${scope.droppedModules.length / 2}`);
  if (cast?.droppedIds.length) console.log(`  cast never staged, art folded out: ${cast.droppedIds.join(', ')}`);
}

writeFileSync(path.join(outDir, 'game.js'), await bundleGame([]));

const drops = config.dropFeatures ?? [];
writeFileSync(path.join(outDir, 'game-cut.js'), await bundleGame(drops, true));
if (drops.length) console.log(`staged a feature-dropped game bundle (${drops.length} modules stubbed)`);

// The bespoke micro-engine: bundled separately from GameKit entirely. Sound
// patch definitions and music track data are embedded as literals — esbuild's
// `define` substitutes the free variables tools/engine/audio.mjs references,
// so the bundle needs no import seam or asset-loading step at all.
const soundCatalog = JSON.parse(readFileSync(path.join(gamesDir, 'shared', 'audio', 'sounds.json'), 'utf8'));
const musicPath = path.join(gamesDir, 'games', config.slug, 'music.json');
const musicCatalog = JSON.parse(readFileSync(musicPath, 'utf8'));
// Only the tracks scenes in scope actually call for. The default track has to
// survive whatever the dial says, or the game boots into silence.
const allTrackNames = [manifest.audio.music, ...(manifest.audio.musicTracks ?? [])];
const usedTrackNames = scope
  ? allTrackNames.filter((name) => scope.music.includes(name) || name === scope.kept[0].music)
  : allTrackNames;
const usedTracks = Object.fromEntries(usedTrackNames.map((name) => [name, musicCatalog.tracks[name]]));
// Under scope, ship only the sounds the folded bundle can still name. The
// scan runs over the cut game bundle and the engine's own sources — a sound
// neither mentions is unreachable. Without scope, the full manifest ships.
const cutBundle = readFileSync(path.join(outDir, 'game-cut.js'), 'utf8');
const engineSources = readdirSync(path.join(root, 'tools', 'engine'))
  .map((name) => readFileSync(path.join(root, 'tools', 'engine', name), 'utf8')).join('\n');
const soundNames = scope
  ? manifest.audio.sounds.filter((name) =>
      cutBundle.includes(`"${name}"`) || cutBundle.includes(`'${name}'`) || engineSources.includes(`'${name}'`))
  : manifest.audio.sounds;
if (scope && soundNames.length < manifest.audio.sounds.length) {
  console.log(`  sounds subset to scope: ${soundNames.join(', ')}`);
}
const soundPatches = readSelectedPatches(soundCatalog, soundNames);

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

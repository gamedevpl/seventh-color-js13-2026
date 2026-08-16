// The scope dial: build the game as if the story ended earlier.
//
// Truncating scenes is the easy half. The half that makes the result *playable*
// rather than merely smaller:
//
//   * the last kept scene is a link, not an ending — it carries `nextSceneId`
//     and would walk the player into a scene that no longer exists. It has to
//     be converted into a `completion`, which is how the real final scene ends
//     the game;
//   * every minigame whose `mode` no longer appears is dead weight, but its
//     module is still imported by the dispatchers, so it needs a stub that
//     satisfies those imports rather than a deletion;
//   * music tracks and cast members no scene reaches are pure data to drop.
//
// Everything here works off the scene table itself, so the dial follows the
// game as it is edited rather than a hand-maintained list that silently rots.

import { parse } from 'acorn';

const propertyName = (p) => (p.key ? (p.key.name ?? p.key.value) : null);

function walk(node, visit) {
  if (!node || typeof node.type !== 'string') return;
  visit(node);
  for (const key of Object.keys(node)) {
    if (key === 'type' || key === 'start' || key === 'end') continue;
    const value = node[key];
    if (Array.isArray(value)) value.forEach((c) => walk(c, visit));
    else if (value && typeof value.type === 'string') walk(value, visit);
  }
}

function findArray(js, name) {
  const tree = parse(js, { ecmaVersion: 'latest', sourceType: 'module' });
  let found = null;
  walk(tree, (n) => {
    if (n.type === 'VariableDeclarator' && n.id.name === name && n.init?.type === 'ArrayExpression') found = n.init;
  });
  if (!found) throw new Error(`scope: no array literal named ${name}`);
  return found;
}

/** Literal-valued fields of one scene object, ignoring anything computed. */
function sceneFacts(objectNode, js) {
  const facts = { cast: [] };
  for (const property of objectNode.properties) {
    const key = propertyName(property);
    if (!key) continue;
    const value = property.value;
    if (value.type === 'Literal') facts[key] = value.value;
    else if (key === 'cast' && value.type === 'ArrayExpression') {
      facts.cast = value.elements.filter((e) => e?.type === 'Literal').map((e) => e.value);
    }
    if (key === 'nextSceneId' || key === 'completion') facts[`${key}Range`] = { start: property.start, end: property.end };
  }
  facts.range = { start: objectNode.start, end: objectNode.end };
  facts.source = js.slice(objectNode.start, objectNode.end);
  return facts;
}

/**
 * The scene order as the game plays it: the main table, then the finale table
 * it splices in. Read from the sources so the dial cannot drift out of sync.
 */
export function readScenes(mainJs, finaleJs) {
  const main = findArray(mainJs, 'STORY_SCENES').elements
    .filter((e) => e.type === 'ObjectExpression').map((e) => sceneFacts(e, mainJs));
  const finale = findArray(finaleJs, 'FINAL_STORY_SCENES').elements
    .filter((e) => e.type === 'ObjectExpression').map((e) => sceneFacts(e, finaleJs));
  return { main, finale, all: [...main, ...finale] };
}

/** Which minigame modules each scene `mode` needs. Modes absent here ride the core story machinery. */
export const MODE_MODULES = {
  'dual-puzzle': ['dual-puzzle-logic.ts', 'bog-cottage-render.ts'],
  'meg-encounter': ['meg-encounter-logic.ts', 'meg-encounter-render.ts'],
  'castle-descent': ['castle-descent-logic.ts', 'castle-descent-render.ts'],
  'cage-escape': ['cage-escape-logic.ts', 'cage-escape-render.ts'],
  'kitchen-stealth': ['kitchen-stealth-logic.ts', 'kitchen-stealth-render.ts'],
  pursuit: ['throne-pursuit-logic.ts', 'throne-pursuit-render.ts'],
  finale: ['last-stand-logic.ts', 'last-stand-render.ts'],
  restoration: ['spring-restoration-logic.ts', 'spring-restoration-render.ts'],
  'ring-recovery': ['ring-recovery-logic.ts', 'ring-recovery-render.ts'],
  epilogue: ['epilogue-logic.ts', 'epilogue-render.ts'],
};

export function planScope(scenes, endAt) {
  const index = scenes.all.findIndex((s) => s.id === endAt);
  if (index < 0) {
    throw new Error(`scope: no scene "${endAt}". Known ids:\n  ${scenes.all.map((s) => s.id).join('\n  ')}`);
  }
  const kept = scenes.all.slice(0, index + 1);
  const modes = new Set(kept.map((s) => s.mode).filter(Boolean));
  const dropped = [];
  for (const [mode, files] of Object.entries(MODE_MODULES)) if (!modes.has(mode)) dropped.push(...files);
  return {
    kept,
    keepMain: Math.min(kept.length, scenes.main.length),
    keepFinale: Math.max(0, kept.length - scenes.main.length),
    lastSceneId: kept[kept.length - 1].id,
    modes: [...modes],
    music: [...new Set(kept.map((s) => s.music).filter(Boolean))],
    cast: [...new Set(kept.flatMap((s) => s.cast))],
    droppedModules: dropped,
    totalScenes: scenes.all.length,
  };
}

/**
 * Truncate one scene array, and turn its final scene into an ending.
 *
 * A scene that already carries `completion` is the story's real finish and is
 * left exactly as written — this only rewrites a scene that would otherwise
 * link to somewhere the build no longer contains.
 */
export function truncateAndClose(js, name, keep, { dropSpread, closeLast, outcome = 'won', delayFrames = 8 }) {
  const array = findArray(js, name);
  const objects = array.elements.filter((e) => e.type === 'ObjectExpression');
  const spread = array.elements.find((e) => e.type === 'SpreadElement');
  if (keep > objects.length) throw new Error(`scope: ${name} holds ${objects.length} scenes, cannot keep ${keep}`);

  const pieces = objects.slice(0, keep).map((node, i) => {
    let text = js.slice(node.start, node.end);
    if (!(closeLast && i === keep - 1)) return text;
    const facts = sceneFacts(node, js);
    if (facts.completionRange) return text;
    // Rewrite back-to-front so the earlier offset stays valid.
    const relative = (r) => ({ start: r.start - node.start, end: r.end - node.start });
    if (facts.nextSceneIdRange) {
      const r = relative(facts.nextSceneIdRange);
      let end = r.end;
      while (end < text.length && /[\s,]/.test(text[end])) end++;
      text = text.slice(0, r.start) + text.slice(end);
    }
    // Consume any trailing comma the removal left behind — `nextSceneId` is
    // often the last property, and appending after it would emit `,,`.
    return text.replace(/,?\s*\}$/, `, completion: { outcome: ${JSON.stringify(outcome)}, delayFrames: ${delayFrames} } }`);
  });
  if (spread && !dropSpread) pieces.push(js.slice(spread.start, spread.end));
  const out = js.slice(0, array.start) + '[' + pieces.join(',\n') + ']' + js.slice(array.end);

  // Self-check, because the failure mode is silent and fatal: a last scene that
  // still links forward walks the player into a scene the build no longer has.
  // Cheaper to assert here than to discover it at the end of a playthrough.
  if (closeLast && keep > 0) {
    const last = findArray(out, name).elements.filter((e) => e.type === 'ObjectExpression').pop();
    const facts = sceneFacts(last, out);
    if (!facts.completionRange || facts.nextSceneIdRange) {
      throw new Error(`scope: ${name} final scene "${facts.id}" is not terminal `
        + `(completion=${Boolean(facts.completionRange)}, nextSceneId=${Boolean(facts.nextSceneIdRange)})`);
    }
  }
  return out;
}

/**
 * Rewrite a scene's `cast` list at build time.
 *
 * A prologue that stages five characters pays for five characters' art. Which
 * of them are load-bearing is a staging judgement, and making it here — rather
 * than editing the scene in the games repo — keeps this repo read-only over
 * that branch and lets the choice be A/B'd against the ledger.
 */
export function recastScenes(js, name, recast, painterIds = {}) {
  const array = findArray(js, name);
  const edits = [];
  for (const node of array.elements) {
    if (node.type !== 'ObjectExpression') continue;
    const facts = sceneFacts(node, js);
    const wanted = recast[facts.id];
    if (!wanted) continue;
    const property = node.properties.find((p) => propertyName(p) === 'cast');
    if (!property || property.value.type !== 'ArrayExpression') {
      throw new Error(`scope: scene "${facts.id}" has no literal cast array to recast`);
    }
    const missing = wanted.filter((id) => !facts.cast.includes(id));
    if (missing.length) {
      throw new Error(`scope: recast of "${facts.id}" names ${missing.join(', ')}, who are not in its cast`);
    }
    // A scene's painter stages by hardcoded id, so removing someone from the
    // cast array does not stop them being drawn — it only orphans the lookup.
    // Refuse, with the reason, rather than shipping a crash.
    const stillPainted = (painterIds[facts.id] ?? []).filter((id) => !wanted.includes(id));
    if (stillPainted.length) {
      throw new Error(`scope: cannot recast "${facts.id}" without ${stillPainted.join(', ')} — `
        + `its painter draws them by name. Removing them needs an edit to the painter, not the cast list.`);
    }
    edits.push({ start: property.value.start, end: property.value.end, text: JSON.stringify(wanted) });
  }
  return edits.sort((a, b) => b.start - a.start)
    .reduce((text, e) => text.slice(0, e.start) + e.text + text.slice(e.end), js);
}

/** A stub exporting every name the real module does, so importers still link. */
export function stubFor(js) {
  const tree = parse(js, { ecmaVersion: 'latest', sourceType: 'module' });
  const names = new Set();
  walk(tree, (n) => {
    if (n.type === 'ExportNamedDeclaration' && n.declaration) {
      if (n.declaration.type === 'FunctionDeclaration') names.add(n.declaration.id.name);
      if (n.declaration.type === 'VariableDeclaration') {
        for (const d of n.declaration.declarations) if (d.id.type === 'Identifier') names.add(d.id.name);
      }
    }
    if (n.type === 'ExportNamedDeclaration' && n.specifiers) {
      for (const s of n.specifiers) names.add(s.exported.name ?? s.exported.value);
    }
  });
  // Unreachable by construction — the mode that called these is gone — so a
  // no-op that satisfies the import is enough, and stays tiny after minifying.
  return [...names].map((n) => `export const ${n} = () => {};`).join('\n') || 'export {};';
}

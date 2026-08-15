// Tree-shake GameKit.
//
// The engine ships as one IIFE per module, each ending in
// `Object.assign(GameKit, { … })`. Nothing can shake that: esbuild sees a
// property write on a global and keeps every function it names. So we do the
// reachability ourselves, over two seams that cascade into each other.
//
//   1. The `draw` surface is an object literal of thin delegators — `panel`
//      forwards to `GameKit.drawPanel`, `ship` to `GameKit.drawShip`. A game
//      that never calls `draw.panel` still pays for the whole panel painter.
//      Drop the unused surface methods and their targets lose their last
//      reference.
//   2. `Object.assign(GameKit, { … })` entries nobody names anywhere are dead
//      outright — and become dead as step 1 removes callers, which is why this
//      runs to a fixpoint rather than once.
//
// Terser then deletes the orphaned function bodies, which is where the bytes
// actually come from: we remove references, the compressor removes code.
//
// Ranges come from acorn, never regex. These object literals contain nested
// braces, template strings and regexes; a brace-counting scan gets them wrong
// in ways that produce a bundle that parses and misbehaves.

import { parse } from 'acorn';

const PUBLISH_SHAPES = ['GameKit', 'window.GameKit'];

function isGameKitTarget(node) {
  if (!node) return false;
  if (node.type === 'Identifier') return node.name === 'GameKit';
  if (node.type === 'MemberExpression') return `${node.object.name}.${node.property.name}` === 'window.GameKit';
  if (node.type === 'LogicalExpression') return isGameKitTarget(node.left);
  return false;
}

function walk(node, visit, parent = null) {
  if (!node || typeof node.type !== 'string') return;
  visit(node, parent);
  for (const key of Object.keys(node)) {
    if (key === 'type' || key === 'start' || key === 'end') continue;
    const value = node[key];
    if (Array.isArray(value)) value.forEach((child) => walk(child, visit, node));
    else if (value && typeof value.type === 'string') walk(value, visit, node);
  }
}

const propertyName = (property) =>
  property.key ? (property.key.name ?? property.key.value) : null;

/** Cut source ranges out back-to-front so earlier offsets stay valid. */
function cut(source, ranges) {
  return [...ranges]
    .sort((a, b) => b.start - a.start)
    .reduce((text, range) => text.slice(0, range.start) + text.slice(range.end), source);
}

/** Every name a module hands to GameKit, with the range that publishes it. */
export function findPublished(source) {
  const tree = parse(source, { ecmaVersion: 'latest' });
  const found = [];
  walk(tree, (node) => {
    if (node.type !== 'CallExpression') return;
    const callee = node.callee;
    if (callee.type !== 'MemberExpression') return;
    if (`${callee.object.name}.${callee.property.name}` !== 'Object.assign') return;
    if (!isGameKitTarget(node.arguments[0])) return;
    const literal = node.arguments[1];
    if (!literal || literal.type !== 'ObjectExpression') return;
    literal.properties.forEach((property, index) => {
      const name = propertyName(property);
      if (!name) return;
      const previous = literal.properties[index - 1];
      found.push({
        name,
        // Swallow the separating comma with whichever neighbour has one.
        start: previous ? previous.end : property.start,
        end: previous ? property.end : Math.min(property.end + 1, literal.end - 1),
      });
    });
  });
  return found;
}

/**
 * The `draw` surface, identified by shape rather than by position: the one
 * object literal carrying the primitives every renderer must expose.
 */
const SURFACE_MARKERS = ['line', 'rect', 'circle', 'text'];

export function findSurfaceMethods(source) {
  const tree = parse(source, { ecmaVersion: 'latest' });
  let best = null;
  walk(tree, (node) => {
    if (node.type !== 'ObjectExpression') return;
    const names = node.properties.map(propertyName).filter(Boolean);
    if (!SURFACE_MARKERS.every((marker) => names.includes(marker))) return;
    if (!best || names.length > best.names.length) best = { node, names };
  });
  if (!best) return [];
  return best.node.properties.map((property, index) => {
    const previous = best.node.properties[index - 1];
    const value = property.value;
    return {
      name: propertyName(property),
      // Only function-valued entries are delegators. `width` and `height` are
      // data the renderer writes through (`renderer.draw.width = w`); pruning
      // those removes a field rather than an unused code path.
      isFunction: Boolean(value && (value.type === 'FunctionExpression' || value.type === 'ArrowFunctionExpression')),
      start: previous ? previous.end : property.start,
      end: previous ? property.end : Math.min(property.end + 1, best.node.end - 1),
    };
  }).filter((entry) => entry.name);
}

/** References to `name` outside the definitions we are pruning. */
function referenceCount(text, name) {
  const dotted = new RegExp(`GameKit\\s*\\.\\s*${name}\\b`, 'g');
  const quoted = new RegExp(`["'\`]${name}["'\`]`, 'g');
  return (text.match(dotted) || []).length + (text.match(quoted) || []).length;
}

/**
 * Any access of the form `.name` outside the surface definition.
 *
 * Deliberately looser than a call check: a surface method can be read without
 * being called in the same expression (`const paint = draw.panel`), and the
 * cost of over-keeping is bytes while the cost of over-pruning is a broken
 * submission.
 */
function touchesMember(text, name) {
  return new RegExp(`\\.\\s*${name}\\b`).test(text);
}

/**
 * Shake the engine against one game's usage.
 *
 * `keep` is the bootstrap set: names `defineGame` reaches by string, which no
 * static scan of the game can see.
 */
export function shakeEngine(modules, gameJs, { keep = [], maxRounds = 8 } = {}) {
  const current = new Map(Object.entries(modules));
  const removed = { surface: [], published: [] };
  const kept = new Set(keep);

  // Pass 1: the draw surface. A method survives if anything outside the
  // surface literal calls it by name, or the bootstrap set names it.
  for (const [name, source] of current) {
    const methods = findSurfaceMethods(source);
    if (!methods.length) continue;
    const others = [...current].filter(([other]) => other !== name).map(([, text]) => text).join('\n');
    const surfaceRanges = methods.map((m) => ({ start: m.start, end: m.end }));
    const withoutSurface = cut(source, surfaceRanges);
    const haystack = `${gameJs}\n${others}\n${withoutSurface}`;
    const doomed = methods.filter((m) => m.isFunction && !kept.has(m.name) && !touchesMember(haystack, m.name));
    if (!doomed.length) continue;
    current.set(name, cut(source, doomed));
    removed.surface.push(...doomed.map((m) => m.name));
  }

  // Pass 2: published members, to a fixpoint — each removal can strand more.
  for (let round = 0; round < maxRounds; round++) {
    const engineText = [...current.values()].join('\n');
    const haystack = `${gameJs}\n${engineText}`;
    let changed = false;
    for (const [name, source] of current) {
      const doomed = findPublished(source).filter((entry) => {
        if (kept.has(entry.name)) return false;
        // One reference is the publish site itself when written in shorthand.
        return referenceCount(haystack, entry.name) === 0;
      });
      if (!doomed.length) continue;
      current.set(name, cut(source, doomed));
      removed.published.push(...doomed.map((entry) => entry.name));
      changed = true;
    }
    if (!changed) break;
  }

  return { modules: Object.fromEntries(current), removed };
}

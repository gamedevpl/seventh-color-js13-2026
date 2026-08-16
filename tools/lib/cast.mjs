// Prune cast members the scoped story never puts on stage.
//
// The art is not organised as one painter per character — it is dozens of
// `member.id === 'pox'` conditionals and ternaries threaded through the face,
// profile and rig files. So rather than trying to excise painters, this folds
// the comparisons: if no scene in scope casts `pox`, then `member.id === 'pox'`
// can never be true, and the branch behind it is unreachable by construction.
//
// Terser does the rest — collapsing `false ? a : b`, dropping `if (false)`,
// and deleting whatever functions those branches were the last callers of.
// Same trick as the GameKit shake: remove the reference, let the compressor
// remove the code.
//
// Only literal comparisons are touched. `entry.id === id` — the CAST lookup —
// compares against a variable, never a literal, so it is left alone.

import { parse } from 'acorn';

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

const propertyName = (p) => (p.key ? (p.key.name ?? p.key.value) : null);

/** Every member the cast table declares, with the fields the pruner needs. */
export function readCast(js) {
  const tree = parse(js, { ecmaVersion: 'latest', sourceType: 'module' });
  let array = null;
  walk(tree, (n) => {
    if (n.type === 'VariableDeclarator' && n.id.name === 'CAST' && n.init?.type === 'ArrayExpression') array = n.init;
  });
  if (!array) throw new Error('cast: no CAST array literal');
  return array.elements.filter((e) => e.type === 'ObjectExpression').map((node) => {
    const entry = { node };
    for (const property of node.properties) {
      const key = propertyName(property);
      if ((key === 'id' || key === 'kind') && property.value.type === 'Literal') entry[key] = property.value.value;
    }
    return entry;
  });
}

/**
 * Fold `member.id === '<absent>'` and `member.kind === '<absent>'` to a constant.
 *
 * `===` against a member that does not exist is always false; `!==` always
 * true. Writing the constant in rather than deleting the branch keeps the
 * transform local and lets terser decide what that makes dead.
 */
export function foldAbsentMembers(js, keptIds, keptKinds, allIds, allKinds) {
  const tree = parse(js, { ecmaVersion: 'latest', sourceType: 'module' });
  const edits = [];
  walk(tree, (node) => {
    if (node.type !== 'BinaryExpression') return;
    if (node.operator !== '===' && node.operator !== '!==') return;
    const sides = [[node.left, node.right], [node.right, node.left]];
    for (const [maybeMember, maybeLiteral] of sides) {
      if (maybeMember.type !== 'MemberExpression' || maybeMember.computed) continue;
      const field = maybeMember.property.name;
      if (field !== 'id' && field !== 'kind') continue;
      if (maybeLiteral.type !== 'Literal' || typeof maybeLiteral.value !== 'string') continue;
      const known = field === 'id' ? allIds : allKinds;
      const kept = field === 'id' ? keptIds : keptKinds;
      // Only fold values that are genuinely cast identifiers, so an unrelated
      // `.id === 'something'` elsewhere in the game is never touched.
      if (!known.includes(maybeLiteral.value) || kept.includes(maybeLiteral.value)) continue;
      edits.push({ start: node.start, end: node.end, text: node.operator === '===' ? 'false' : 'true' });
      return;
    }
  });
  return edits.sort((a, b) => b.start - a.start)
    .reduce((text, e) => text.slice(0, e.start) + e.text + text.slice(e.end), js);
}

/** Drop cast table rows for members no scene in scope casts. */
export function pruneCastTable(js, keptIds) {
  const entries = readCast(js);
  const doomed = entries.filter((e) => e.id && !keptIds.includes(e.id));
  if (!doomed.length) return { js, dropped: [] };
  const ranges = doomed.map((e, i) => {
    const all = entries.indexOf(e);
    const previous = entries[all - 1];
    return previous
      ? { start: previous.node.end, end: e.node.end }
      : { start: e.node.start, end: e.node.end + 1 };
  });
  const out = ranges.sort((a, b) => b.start - a.start)
    .reduce((text, r) => text.slice(0, r.start) + text.slice(r.end), js);
  return { js: out, dropped: doomed.map((e) => e.id) };
}

/**
 * Cast ids the reachable painters name directly.
 *
 * `scene.cast` is metadata; it is not what gets drawn. `paintShadowCouncil`
 * hardcodes `actor(draw, 'blunder', …)` whatever the cast array says. So the
 * safe kept-set is the union of the cast arrays and every id literal inside a
 * painter the kept scenes can reach — reachability being the `scene.art === 'x'`
 * dispatch, followed transitively through helper calls.
 *
 * Without this the fold survives only because unreachable painters never run,
 * which is true today and one scope change away from being false.
 */
export function reachableCastIds(renderJs, keptArt, allIds) {
  const tree = parse(renderJs, { ecmaVersion: 'latest', sourceType: 'module' });
  const functions = new Map();
  walk(tree, (n) => { if (n.type === 'FunctionDeclaration' && n.id) functions.set(n.id.name, n); });

  const dispatch = new Map();
  walk(tree, (n) => {
    if (n.type !== 'IfStatement' || !n.test) return;
    const tests = [];
    walk(n.test, (t) => {
      if (t.type === 'BinaryExpression' && t.operator === '==='
        && t.left.type === 'MemberExpression' && t.left.property?.name === 'art'
        && t.right.type === 'Literal') tests.push(t.right.value);
    });
    if (!tests.length) return;
    let painter = null;
    walk(n.consequent, (c) => {
      if (!painter && c.type === 'CallExpression' && c.callee.type === 'Identifier') painter = c.callee.name;
    });
    if (painter) for (const art of tests) if (!dispatch.has(art)) dispatch.set(art, painter);
  });

  const ids = new Set();
  const seen = new Set();
  const visit = (name) => {
    if (seen.has(name)) return;
    seen.add(name);
    const fn = functions.get(name);
    if (!fn) return;
    walk(fn, (n) => {
      if (n.type === 'Literal' && typeof n.value === 'string' && allIds.includes(n.value)) ids.add(n.value);
      if (n.type === 'CallExpression' && n.callee.type === 'Identifier') visit(n.callee.name);
    });
  };
  for (const art of keptArt) { const p = dispatch.get(art); if (p) visit(p); }
  return { ids: [...ids], unmapped: keptArt.filter((a) => !dispatch.has(a)) };
}

/**
 * Fold `scene.art === 'x'` / `scene.mode === 'x'` for values no kept scene uses.
 *
 * The scene painters all live in one file behind an if/else chain, so no
 * bundler can drop `paintGlade` when nothing in scope has `art: 'glade'` — the
 * call site is live code. Folding the test to `false` makes the branch dead and
 * terser deletes the painter behind it, exactly as with the minigame stubs and
 * the cast members. At the prologue this strands 27 of the 28 painters.
 */
export function foldAbsentSceneFields(js, keptArt, keptModes, allArt, allModes) {
  const tree = parse(js, { ecmaVersion: 'latest', sourceType: 'module' });
  const edits = [];
  walk(tree, (node) => {
    if (node.type !== 'BinaryExpression') return;
    if (node.operator !== '===' && node.operator !== '!==') return;
    for (const [maybeField, maybeLiteral] of [[node.left, node.right], [node.right, node.left]]) {
      if (maybeField.type !== 'MemberExpression' || maybeField.computed) continue;
      const field = maybeField.property.name;
      if (field !== 'art' && field !== 'mode') continue;
      if (maybeLiteral.type !== 'Literal' || typeof maybeLiteral.value !== 'string') continue;
      const known = field === 'art' ? allArt : allModes;
      const kept = field === 'art' ? keptArt : keptModes;
      if (!known.includes(maybeLiteral.value) || kept.includes(maybeLiteral.value)) continue;
      edits.push({ start: node.start, end: node.end, text: node.operator === '===' ? 'false' : 'true' });
      return;
    }
  });
  return edits.sort((a, b) => b.start - a.start)
    .reduce((text, e) => text.slice(0, e.start) + e.text + text.slice(e.end), js);
}

/**
 * Fold reads of a member field to `false`, leaving writes alone.
 *
 * For state that is provably never set under the current build shape — with
 * the save module shimmed to `data: null`, `offerStoryResume` early-returns
 * and `round.resumeOpen` can never become true — every read is a constant,
 * and the branches behind it (the resume dialog, its input handling, its
 * painter) are dead. Writes are preserved so the assignment sites stay valid;
 * they become dead stores terser removes on its own.
 */
export function foldFalseReads(js, names) {
  const tree = parse(js, { ecmaVersion: 'latest', sourceType: 'module' });
  const writeTargets = new Set();
  walk(tree, (n) => {
    if (n.type === 'AssignmentExpression' && n.left.type === 'MemberExpression') {
      writeTargets.add(`${n.left.start}:${n.left.end}`);
    }
    if (n.type === 'UpdateExpression' && n.argument.type === 'MemberExpression') {
      writeTargets.add(`${n.argument.start}:${n.argument.end}`);
    }
  });
  const edits = [];
  walk(tree, (n) => {
    if (n.type !== 'MemberExpression' || n.computed) return;
    if (!names.includes(n.property.name)) return;
    if (writeTargets.has(`${n.start}:${n.end}`)) return;
    edits.push({ start: n.start, end: n.end, text: 'false' });
  });
  return edits.sort((a, b) => b.start - a.start)
    .reduce((text, e) => text.slice(0, e.start) + e.text + text.slice(e.end), js);
}

export function planCast(castJs, sceneCastIds, painterIds = []) {
  const entries = readCast(castJs);
  const allIds = entries.map((e) => e.id).filter(Boolean);
  const allKinds = [...new Set(entries.map((e) => e.kind).filter(Boolean))];
  // Union, not intersection: a member is kept if any kept scene casts them OR
  // any reachable painter names them. Dropping one the painter still draws is
  // an undefined lookup at runtime, so this side errs toward keeping.
  const needed = new Set([...sceneCastIds, ...painterIds]);
  const keptIds = allIds.filter((id) => needed.has(id));
  const keptKinds = [...new Set(entries.filter((e) => keptIds.includes(e.id)).map((e) => e.kind))];
  return { allIds, allKinds, keptIds, keptKinds, droppedIds: allIds.filter((id) => !keptIds.includes(id)) };
}

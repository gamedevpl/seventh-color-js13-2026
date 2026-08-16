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

export function planCast(castJs, sceneCastIds) {
  const entries = readCast(castJs);
  const allIds = entries.map((e) => e.id).filter(Boolean);
  const allKinds = [...new Set(entries.map((e) => e.kind).filter(Boolean))];
  const keptIds = allIds.filter((id) => sceneCastIds.includes(id));
  const keptKinds = [...new Set(entries.filter((e) => keptIds.includes(e.id)).map((e) => e.kind))];
  return { allIds, allKinds, keptIds, keptKinds, droppedIds: allIds.filter((id) => !keptIds.includes(id)) };
}

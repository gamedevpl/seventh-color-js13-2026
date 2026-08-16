// Drop the Polish half of every localized literal.
//
// gamedev.pl ships the game bilingual: `{ en: '…', pl: '…' }` everywhere a
// string reaches the player, resolved at runtime by `GameKit.t`. A js13k entry
// has one language, so every `pl` value is weight with no reader.
//
// This removes the property, not the mechanism — `t({en})` still resolves, and
// the engine's locale lookup already falls back to `en` when the active locale
// is missing. That keeps the transform a deletion rather than a rewrite, which
// is what makes it safe to apply to the whole bundle at once.

import { parse } from 'acorn';

const propertyName = (property) =>
  property.key ? (property.key.name ?? property.key.value) : null;

/**
 * Ranges of `pl:` entries in objects that also carry an `en:` entry.
 *
 * The `en` sibling is the whole test. A bare `pl` key elsewhere in the codebase
 * — a locale table, a settings map, someone's variable — has no English twin
 * and is left alone.
 */
export function findPolishProperties(source) {
  const tree = parse(source, { ecmaVersion: 'latest' });
  const ranges = [];
  const walk = (node) => {
    if (!node || typeof node.type !== 'string') return;
    if (node.type === 'ObjectExpression') {
      const names = node.properties.map(propertyName);
      if (names.includes('en') && names.includes('pl')) {
        node.properties.forEach((property, index) => {
          if (propertyName(property) !== 'pl') return;
          const previous = node.properties[index - 1];
          ranges.push({
            start: previous ? previous.end : property.start,
            end: previous ? property.end : Math.min(property.end + 1, node.end - 1),
          });
        });
      }
    }
    for (const key of Object.keys(node)) {
      if (key === 'type' || key === 'start' || key === 'end') continue;
      const value = node[key];
      if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value.type === 'string') walk(value);
    }
  };
  walk(tree);
  return ranges;
}

/**
 * Trailing Polish arguments in the dialogue constructors.
 *
 * `L(en, pl)` and `D(speaker, en, pl)` build localized pairs at runtime rather
 * than as `{ en, pl }` literals, so the property sweep above never sees them —
 * that is how ~200 dialogue lines kept shipping both languages after the
 * English-only transform was declared done.
 *
 * Dropping the trailing argument leaves `pl` undefined, which is exactly what
 * the locale lookup already falls back on. Arity is checked before cutting, so
 * a call that has already been trimmed is left alone and the transform stays
 * idempotent.
 */
const DIALOGUE_ARITY = { L: 2, D: 3 };

export function findPolishArguments(source) {
  const tree = parse(source, { ecmaVersion: 'latest' });
  const ranges = [];
  const walk = (node) => {
    if (!node || typeof node.type !== 'string') return;
    if (node.type === 'CallExpression' && node.callee.type === 'Identifier') {
      const arity = DIALOGUE_ARITY[node.callee.name];
      if (arity && node.arguments.length === arity) {
        const last = node.arguments[arity - 1];
        const previous = node.arguments[arity - 2];
        // Only literal Polish text is safe to drop; a computed argument could
        // be carrying something other than a translation.
        if (last.type === 'Literal' && typeof last.value === 'string') {
          ranges.push({ start: previous.end, end: last.end });
        }
      }
    }
    for (const key of Object.keys(node)) {
      if (key === 'type' || key === 'start' || key === 'end') continue;
      const value = node[key];
      if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value.type === 'string') walk(value);
    }
  };
  walk(tree);
  return ranges;
}

export function stripPolish(source) {
  const ranges = [...findPolishProperties(source), ...findPolishArguments(source)];
  const out = [...ranges]
    .sort((a, b) => b.start - a.start)
    .reduce((text, range) => text.slice(0, range.start) + text.slice(range.end), source);
  return { source: out, removed: ranges.length, bytes: source.length - out.length };
}

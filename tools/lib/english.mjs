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

export function stripPolish(source) {
  const ranges = findPolishProperties(source);
  const out = [...ranges]
    .sort((a, b) => b.start - a.start)
    .reduce((text, range) => text.slice(0, range.start) + text.slice(range.end), source);
  return { source: out, removed: ranges.length, bytes: source.length - out.length };
}

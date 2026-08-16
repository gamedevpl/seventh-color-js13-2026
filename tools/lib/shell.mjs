// The js13k page shell: the game, a sound toggle, the touch controls.
//
// The assembled markup is gamedev.pl's game page — header, tagline, a controls
// legend (which still lists the gallery/editor/director this build removed),
// footer hint, aria live region. A compo entry's page is the game itself, so
// the shell shrinks to what the shipped code actually reaches: #game (canvas),
// #sound-toggle (audio.mjs binds it), .wrap (touch controls mount there).
//
// CSS is filtered from the real game-shell stylesheet rather than rewritten,
// so the rules that survive — canvas framing, sound button, touch pad/button —
// are byte-identical to what the full page used and look identical. The filter
// recurses into @media/@supports one level, which is as deep as this sheet
// nests, and asserts that expectation rather than assuming it.

const KEEP = [
  /^(html|body|\*)\b/,
  /\.wrap\b/,
  /#game\b|canvas\b/,
  /\.sound-toggle\b/,
  /\.gamekit-touch\b/,
  /\.gamekit-touch-(pad|dir|nub|right|buttons|btn)\b/,
  /:root\b/,
  /@keyframes/,
];
const DROP = [
  /\.gamekit-touch-coach\b/,
  /\.gamekit-touch-look\b/,
  /\.gamekit-restart\b/,
  /is-calling/,
  /\.legend\b|\.legend-|\.game-controls\b|\.hint\b|\.sr-only\b|#game-title\b|#game-desc\b|h1\b/,
];

function keepSelector(selectorList) {
  if (DROP.some((re) => re.test(selectorList))) return false;
  return KEEP.some((re) => re.test(selectorList));
}

/** Split css text into top-level {}-balanced blocks. */
function blocks(css) {
  const out = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        out.push(css.slice(start, i + 1));
        start = i + 1;
      }
      if (depth < 0) throw new Error('unbalanced css');
    }
  }
  return out;
}

export function filterShellCss(css) {
  const kept = [];
  for (const block of blocks(css)) {
    const brace = block.indexOf('{');
    const header = block.slice(0, brace).trim();
    if (header.startsWith('@media') || header.startsWith('@supports')) {
      const inner = block.slice(brace + 1, block.lastIndexOf('}'));
      if (/@media|@supports/.test(inner)) throw new Error('css nests at-rules deeper than the filter handles');
      const keptInner = blocks(inner).filter((rule) => keepSelector(rule.slice(0, rule.indexOf('{')).trim()));
      if (keptInner.length) kept.push(`${header}{${keptInner.join('')}}`);
    } else if (header.startsWith('@keyframes') || keepSelector(header)) {
      kept.push(block);
    }
  }
  return kept.join('\n');
}

export const BARE_MARKUP =
  '<div class="wrap">'
  + '<button id="sound-toggle" class="sound-toggle" type="button" aria-pressed="false">Sound: On</button>'
  + '<canvas id="game" width="640" height="400" tabindex="0" aria-label="The Seventh Color playfield"></canvas>'
  + '</div>';

// Split an assembled gamedev.pl bundle back into its four parts.
//
// tools/lib/assemble.ts in the games repo emits one fixed shape: a single
// <style> in <head> and a single <script> at the end of <body>. Anything else
// means the assembler changed, and we fail loudly rather than pack a fragment.

export function extractBundle(html) {
  const title = pick(html, '<title>', '</title>', 'title');
  const css = pick(html, '<style>', '</style>', 'style');
  const script = pick(html, '<script>', '</script>', 'script');
  const bodyOpen = html.indexOf('<body>');
  const scriptOpen = html.indexOf('<script>');
  if (bodyOpen < 0 || scriptOpen < bodyOpen) throw new Error('assembled bundle has no <body> before its <script>');
  if (html.indexOf('<script>', scriptOpen + 1) !== -1) throw new Error('assembled bundle has more than one <script>');
  return { title, css, markup: html.slice(bodyOpen + 6, scriptOpen), js: script };
}

function pick(html, open, close, label) {
  const start = html.indexOf(open);
  const end = html.indexOf(close, start + open.length);
  if (start < 0 || end < 0) throw new Error(`assembled bundle has no <${label}>`);
  return html.slice(start + open.length, end);
}

/** Drop the bilingual chrome gamedev.pl needs and a standalone entry does not. */
export function stripI18nAttributes(markup) {
  return markup.replace(/\s+data-i18n-(?:aria-label-|title-)?(?:en|pl)="[^"]*"/g, '');
}

/** Conservative markup squeeze: comments out, whitespace between tags collapsed. */
export function minifyMarkup(markup) {
  return markup
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/>\s+</g, '><')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

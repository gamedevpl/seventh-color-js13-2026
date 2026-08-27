// The compression chain, in one place.
//
// pack.mjs runs it on the real bundle; probe.mjs runs it on hypothetical ones.
// They have to be the same chain or the probe's savings are fiction.

import { transform } from 'esbuild';
import { minify as terserMinify } from 'terser';
import { Packer } from 'roadroller';
import { zipSingleFile } from './zip.mjs';

export async function minifyJs(js, { mangleProps = false } = {}) {
  const stages = {};
  let out = (await transform(js, { loader: 'js', minify: true, target: 'es2020', legalComments: 'none' })).code;
  stages.esbuild = out.length;
  const tersed = await terserMinify(out, {
    ecma: 2020,
    compress: { passes: 3, unsafe: true, unsafe_arrows: true, unsafe_math: true, pure_getters: true },
    mangle: mangleProps ? { properties: { regex: /^_/ } } : true,
    format: { comments: false },
  });
  if (tersed.code && tersed.code.length < out.length) {
    out = tersed.code;
    stages.terser = out.length;
  }
  return { js: out, stages };
}

export async function roadroll(js, level = 0) {
  const packer = new Packer([{ data: js, type: 'js', action: 'eval' }], { maxMemoryMB: 512 });
  if (level > 0) await packer.optimize(level);
  const { firstLine, secondLine } = packer.makeDecoder();
  return firstLine + secondLine;
}

export function shell({ title, css, markup, script }) {
  // The viewport meta is not decoration: without it an iPhone lays the page
  // out at a virtual 980px and every tap runs Safari's double-tap-to-zoom
  // heuristics against the scaled canvas. Nothing here meets roadroller, so
  // every character costs 1:1 in the zip - which is why the charset
  // declaration below is spent only when it is actually needed.
  const page = (charset) => `<!doctype html>${charset ? '<meta charset=utf-8>' : ''}`
    + `<meta name=viewport content="width=device-width"><title>${title}</title>`
    + `<style>${css}</style>${markup}<script>${script}</script>`;
  // A roadrolled payload is ASCII-safe: every code point the game draws -
  // the arrow glyphs in the title hint among them - is reconstructed
  // arithmetically at runtime, so the document's own encoding never enters
  // into it and the declaration is 20 bytes of nothing. A build that does
  // carry a non-ASCII byte (--no-roadroller ships the JS literally) gets it
  // back automatically, because without it that byte is decoded by the
  // browser's fallback and the text mojibakes. Decided by measuring the
  // document rather than by assuming which build this is.
  const bare = page(false);
  return /[^\x00-\x7F]/.test(bare) ? page(true) : bare;
}

/** Minified JS + page parts → the archive that would be submitted. */
export async function squeeze({ js, css, markup, title, roadroller = true, level = 0, zopfliIterations = 200 }) {
  const payload = roadroller ? await roadroll(js, level) : js;
  const document = shell({ title, css, markup, script: payload });
  const zipped = await zipSingleFile('index.html', document, { zopfliIterations });
  return { payload, document, ...zipped, archiveBytes: zipped.archive.length };
}

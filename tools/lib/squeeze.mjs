// The compression chain, in one place.
//
// pack.mjs runs it on the real bundle; probe.mjs runs it on hypothetical ones.
// They have to be the same chain or the probe's savings are fiction.

import { transform } from 'esbuild';
import { minify as terserMinify } from 'terser';
import { Packer } from 'roadroller';
import { zipSingleFile } from './zip.mjs';

export async function minifyJs(js, { mangleProps = false, asciiOnly = false } = {}) {
  const stages = {};
  let out = (await transform(js, { loader: 'js', minify: true, target: 'es2020', legalComments: 'none', mangleProps: mangleProps instanceof RegExp ? mangleProps : undefined })).code;
  stages.esbuild = out.length;
  const tersed = await terserMinify(out, {
    ecma: 2020,
    compress: { booleans_as_integers: mangleProps instanceof RegExp, passes: 3, unsafe: true, unsafe_arrows: true, unsafe_math: true, pure_getters: true },
    mangle: mangleProps === true ? { properties: { regex: /^_/ } } : true,
    format: { comments: false, ascii_only: asciiOnly },
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

export function shell({ title, css, markup, script, head = '' }) {
  const body = (title ? `<title>${title}</title>` : '') + head
    + `<style>${css}</style>${markup}<script>${script}</script>`;
  // ASCII bundles decode identically without a charset declaration. Keep it
  // whenever a title, stylesheet or payload contains actual Unicode bytes.
  return '<!doctype html>' + (/[^\x00-\x7f]/.test(body) ? '<meta charset=utf-8>' : '') + body;
}

/** Minified JS + page parts → the archive that would be submitted. */
export async function squeeze({ js, css, markup, title, head = '', roadroller = true, level = 0, zopfliIterations = 200 }) {
  const payload = roadroller ? await roadroll(js, level) : js;
  const document = shell({ title, css, markup, head, script: payload });
  const zipped = await zipSingleFile('index.html', document, { zopfliIterations });
  return { payload, document, ...zipped, archiveBytes: zipped.archive.length };
}

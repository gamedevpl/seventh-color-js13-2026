// The edit. One plan drives both the picture and the score: each cut names
// its source frames and its music (the sequencer parameters the game itself
// would have been running there), the assembler does the overlap arithmetic
// once - crossfades shorten a timeline, and audio landing "at the catch"
// has to land at the catch AFTER that shortening - renders the soundtrack
// through music.mjs, and hands ffmpeg the whole graph.
//
// usage: node tools/promo/assemble.mjs <capdir> <cardsdir> <plan.json> <out.mp4>

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const [cap, cards, planFile, out] = process.argv.slice(2);
const plan = JSON.parse(readFileSync(planFile, 'utf8'));
const FPS = plan.fps || 60;
const XF = plan.xfade ?? .5;
const FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
const tmp = path.join(path.dirname(out), 'segments');
mkdirSync(tmp, { recursive: true });

// --- final-timeline arithmetic: cut k starts at sum(dur) - k * XF ----------
let t0 = 0;
for (const c of plan.cuts) { c.abs = t0; t0 += c.dur - XF; }
const total = t0 + XF;
console.log('final length', total.toFixed(2) + 's');

// --- soundtrack, aligned to the cuts ---------------------------------------
const mus = { dur: Math.ceil(total), fadeIn: .8, fadeOut: plan.musicFadeOut ?? 3, segments: [], events: [] };
for (const c of plan.cuts) {
  const m = c.mus || { speedN: 0, closeN: 0, dry: 1, bare: 1 };
  const last = mus.segments[mus.segments.length - 1];
  // merge same-groove neighbours so the step clock never stutters at a cut
  if (last && ['speedN', 'closeN', 'dry', 'bare', 'rainbow', 'silent'].every((k) => (last[k] || 0) === (m[k] || 0))) last.t1 = c.abs + c.dur;
  else mus.segments.push({ t0: c.abs, t1: c.abs + c.dur, ...m });
  for (const ev of c.musEvents || []) mus.events.push({ t: c.abs + ev.t, kind: ev.kind });
}
mus.segments[mus.segments.length - 1].t1 = mus.dur;
const musSpec = path.join(tmp, 'music.json');
writeFileSync(musSpec, JSON.stringify(mus, null, 1));
const wav = path.join(tmp, 'music.wav');
execFileSync('node', [path.join(here, 'music.mjs'), wav, musSpec], { stdio: 'inherit' });

// --- per-cut intermediate segments -----------------------------------------
const seg = (c, i) => {
  const f = path.join(tmp, `seg${i}.mp4`);
  const vf = ['fps=' + FPS, 'settb=AVTB'];
  if (c.card) {
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-loop', '1', '-t', String(c.dur),
      '-i', path.join(cards, c.card), '-vf', vf.join(','), '-r', String(FPS),
      '-c:v', 'libx264', '-crf', '12', '-preset', 'fast', '-pix_fmt', 'yuv420p', f], { stdio: ['ignore', 'inherit', 'inherit'] });
  } else {
    const dir = path.join(cap, c.src);
    const start = Math.round((c.from || 0) * FPS);
    const frames = Math.round(c.dur * FPS);
    const have = readdirSync(dir).filter((n) => n.endsWith('.jpg')).length;
    if (start + frames > have) throw new Error(`${c.src}: wants frames ${start}..${start + frames} but has ${have}`);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS),
      '-start_number', String(start), '-i', path.join(dir, '%05d.jpg'),
      '-frames:v', String(frames), '-vf', vf.join(','),
      '-c:v', 'libx264', '-crf', '12', '-preset', 'fast', '-pix_fmt', 'yuv420p', f], { stdio: ['ignore', 'inherit', 'inherit'] });
  }
  return f;
};
const files = plan.cuts.map(seg);

// --- one ffmpeg graph: xfade chain, then the words, then the fades ---------
const inputs = files.flatMap((f) => ['-i', f]);
let graph = '', prev = '[0:v]';
plan.cuts.forEach((c, i) => {
  if (!i) return;
  const o = `[x${i}]`;
  graph += `${prev}[${i}:v]xfade=transition=fade:duration=${XF}:offset=${c.abs.toFixed(3)}${o};`;
  prev = o;
});
const texts = [];
for (const c of plan.cuts) for (const tx of c.texts || []) {
  const a0 = c.abs + tx.t0, a1 = c.abs + tx.t1;
  const esc = tx.s.replace(/\\/g, '\\\\').replace(/'/g, "\\\\\\'").replace(/:/g, '\\:');
  texts.push(`drawtext=fontfile=${FONT}:text='${esc}'` +
    `:fontsize=${tx.size || 'h/18'}:fontcolor=${tx.color || '0xf3ead6'}` +
    `:x=(w-text_w)/2:y=${tx.y || 'h*0.78'}` +
    `:shadowcolor=0x07050f:shadowx=2:shadowy=2` +
    `:alpha='if(lt(t,${a0}),0,if(lt(t,${a0 + .4}),(t-${a0})/.4,if(lt(t,${a1 - .4}),1,if(lt(t,${a1}),(${a1}-t)/.4,0))))'`);
}
graph += `${prev}${texts.length ? texts.join(',') + ',' : ''}` +
  `fade=t=in:d=0.6,fade=t=out:st=${(total - 1).toFixed(2)}:d=1[v]`;

execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...inputs, '-i', wav,
  '-filter_complex', graph,
  '-map', '[v]', '-map', `${files.length}:a`,
  '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11',
  '-c:v', 'libx264', '-crf', '18', '-preset', 'slow', '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', out], { stdio: ['ignore', 'inherit', 'inherit'] });
console.log('film ->', out);

// The spoken lines, as burnable captions.
//
//   node tools/trailer/captions.mjs [--game=native]
//
// Four synthesised voices under a synth score is a lot to ask an ear to
// pick apart, and most people meet a trailer muted anyway - so the words
// have to be on the screen. The thing to avoid is the version of this
// that got thrown out early on, where the film's prose ran as full-frame
// cards and the trailer turned into a slideshow with a soundtrack.
//
// So these are SUBTITLES, not cards. They sit in the lower letterbox bar,
// which means they never cover a single pixel of picture, in the film's
// own typeface at the film's own cream. They fade rather than cut, like
// everything else in this trailer.
//
// Timing comes from beats.json, which already carries the schedule the cut
// was built around, and the text from vo.json, which is what was actually
// spoken. Nothing here is typed in twice.
//
// Writes captions.ass (burnt in by assemble.mjs) and captions.srt (for
// YouTube, which would rather have real captions than pixels).
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const which = (process.argv.find((a) => a.startsWith('--game=')) || '--game=native').split('=')[1];
const build = path.join(root, 'build', `trailer-${which}`);

const beats = JSON.parse(readFileSync(path.join(build, 'beats.json'), 'utf8'));
const vo = JSON.parse(readFileSync(path.join(build, 'audio', 'vo', 'vo.json'), 'utf8'));

// 1080p, and the picture is 936 of it: 72 rows of bar top and bottom.
const W = 1920, H = 1080, PIC = 936;
const BAR = (H - PIC) / 2;
const SIZE = 38;
// Centred in the lower bar. ASS measures MarginV from the bottom edge to
// the bottom of the line box, so this is the leftover gap halved.
const MARGIN_V = Math.round((BAR - SIZE * 1.2) / 2);

// A caption wants to be there slightly before the voice and to outstay it,
// or the eye never catches up. The smallest gap between two lines in this
// cut is a little under a second, so both of these fit everywhere.
const LEAD = 0.2, HOLD = 0.45, FADE = 220;
// The last line runs into the crossfade to the end card; it should be gone
// by the time the title arrives.
const LAST = beats.duration - 0.9;

// The bracketed direction is for the model, not the audience: eleven_v3
// reads "[sarcastic]" as a performance note and drops it. So does this.
const clean = (s) => s.replace(/\[[^\]]*\]/g, '').replace(/\.\.\./g, '…').replace(/\s+/g, ' ').trim();

const lines = beats.vo.map((v) => ({
  who: v.who,
  text: clean(vo[v.id].text),
  a: Math.max(0, v.at - LEAD),
  b: Math.min(LAST, v.at + v.dur + HOLD),
})).filter((l) => l.b > l.a).sort((x, y) => x.a - y.a);

// Overlapping captions read as noise. Nothing in this cut should overlap;
// say so out loud if it ever does rather than shipping two lines at once.
for (let i = 1; i < lines.length; i++) {
  if (lines[i].a < lines[i - 1].b) {
    console.error(`  !! caption ${i} starts at ${lines[i].a.toFixed(2)} `
      + `before ${lines[i - 1].b.toFixed(2)} - trimming`);
    lines[i - 1].b = lines[i].a - 0.08;
  }
}

// --- ASS, for burning ------------------------------------------------------
// &HAABBGGRR. The film's cream, no outline and no shadow: this sits on a
// pure black bar, and an outline on black is a rim of grey.
const ass = (hex) => `&H00${hex.slice(5, 7)}${hex.slice(3, 5)}${hex.slice(1, 3)}`.toUpperCase();
const t = (s) => {
  const cs = Math.round(s * 100), h = (cs / 360000) | 0;
  return `${h}:${String(((cs / 6000) | 0) % 60).padStart(2, '0')}:`
    + `${String(((cs / 100) | 0) % 60).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
};
writeFileSync(path.join(build, 'captions.ass'), `[Script Info]
ScriptType: v4.00+
PlayResX: ${W}
PlayResY: ${H}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Line,DejaVu Sans,${SIZE},${ass('#f3ead6')},${ass('#f3ead6')},&H00000000,&H00000000,0,0,0,0,100,100,0.6,0,1,0,0,2,160,160,${MARGIN_V},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${lines.map((l) => `Dialogue: 0,${t(l.a)},${t(l.b)},Line,${l.who},0,0,0,,{\\fad(${FADE},${FADE})}${l.text}`).join('\n')}
`);

// --- SRT, for anyone who would rather have text than pixels ----------------
const srt = (s) => {
  const ms = Math.round(s * 1000);
  return `${String((ms / 3600000) | 0).padStart(2, '0')}:${String(((ms / 60000) | 0) % 60).padStart(2, '0')}:`
    + `${String(((ms / 1000) | 0) % 60).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`;
};
writeFileSync(path.join(build, 'captions.srt'),
  lines.map((l, i) => `${i + 1}\n${srt(l.a)} --> ${srt(l.b)}\n${l.text}\n`).join('\n'));

console.log(`${which}: ${lines.length} captions, ${SIZE}px in the ${BAR}px bar (marginV ${MARGIN_V})`);
for (const l of lines) console.log(`  ${l.a.toFixed(2).padStart(6)}-${l.b.toFixed(2).padStart(6)}  ${l.who.padEnd(9)} ${l.text}`);

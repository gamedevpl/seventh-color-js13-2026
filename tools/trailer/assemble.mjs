// Puts the three pieces together: the frame sequence, the end card, and the
// music. Everything here is measured rather than typed in - the shot list
// gets retimed constantly, and every hardcoded duration in this pipeline
// eventually became a crossfade landing in the wrong place.
//
//   node tools/trailer/assemble.mjs [--game=snap|fireball] [out.mp4]
//
// Run order per game: build it with cheats (the recorders need the DEV
// hooks), then frames, end card, audio, then this.
import { existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// Each entry says where that game's recorders put things. Adding a third
// trailer should be a row here, not a fork of this file.
const GAMES = {
  // `npm` is the prefix its stages carry in package.json - Snap's came
  // first and got the unprefixed names.
  snap: { dir: 'trailer', music: 'strut.wav', out: 'unicorn-snap-trailer.mp4', npm: 'trailer' },
  // Fireball's glow - the rainbow, the arcs, the explosions - is additive
  // geometry, and additive geometry blooms the moment it is blurred and
  // laid back over itself. The mux does that rather than the game: bright
  // pixels above `thresh` are lifted by `gain`, blurred by `sigma`, and
  // added back at `opacity`. Every frame, no shader.
  fireball: {
    dir: 'trailer-fireball', music: 'stampede.wav', out: 'unicorn-fireball-trailer.mp4', npm: 'fireball:trailer',
    bloom: { thresh: 120, gain: 2.4, sigma: 28, opacity: 0.75 },
  },
};
const which = (process.argv.find((a) => a.startsWith('--game=')) || '--game=snap').split('=')[1];
const game = GAMES[which];
if (!game) {
  console.error(`unknown game '${which}' - expected one of: ${Object.keys(GAMES).join(', ')}`);
  process.exit(1);
}

const build = path.join(root, 'build', game.dir);
const framesDir = path.join(build, 'frames');
const endcard = path.join(build, 'endcard', 'endcard.webm');
const music = path.join(build, 'audio', game.music);
const out = process.argv.find((a) => a.endsWith('.mp4')) || path.join(build, game.out);

const FPS = 30;
// Long enough to read as a dissolve rather than a cut, short enough that the
// closing shot is still playing while it happens.
const XFADE = 0.9;
// The trailer opens from black. Neither game fades in - they are pages that
// simply start drawing - so this is the one piece of grammar the capture
// cannot provide and the mux has to.
const FADE_IN = 1.0;
// Playwright's recorder writes a few malformed frames before it settles;
// they show up as a white flash at the cut. Trimming the head is cheaper
// than trying to make the recorder behave.
const ENDCARD_LEAD = 0.32;

const sh = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8' });
const probe = (file) => Number(sh('ffprobe', [
  '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file,
]).trim());

for (const [what, p] of [['frames', framesDir], ['end card', endcard], ['music', music]]) {
  if (!existsSync(p)) {
    console.error(`missing ${what}: ${path.relative(root, p)}`);
    console.error(`run: npm run ${game.npm}:frames / :endcard / :audio`);
    process.exit(1);
  }
}

const frameCount = readdirSync(framesDir).filter((f) => f.endsWith('.png')).length;
const gameplay = path.join(build, 'gameplay.mp4');
console.log(`${which}: encoding ${frameCount} frames (${(frameCount / FPS).toFixed(2)}s)`);
// The pixel format is pinned on both sides of the blend, and the blend's
// output is forced back to PACKED rgb24 before the YUV conversion. Left to
// negotiate, blend emits planar GBR, and the planar-to-yuv420p step reads
// its planes in the wrong order: the first bloomed mux was magenta from end
// to end, a thing the PNG-to-PNG prototype of this chain never showed.
const bloom = game.bloom ? ['-filter_complex',
  `[0]format=rgb24,split[a][b];[b]lutrgb=r='clip((val-${game.bloom.thresh})*${game.bloom.gain},0,255)'`
  + `:g='clip((val-${game.bloom.thresh})*${game.bloom.gain},0,255)'`
  + `:b='clip((val-${game.bloom.thresh})*${game.bloom.gain},0,255)',gblur=sigma=${game.bloom.sigma}[g];`
  + `[a][g]blend=all_mode=addition:all_opacity=${game.bloom.opacity},format=rgb24,format=yuv420p`] : [];
sh('ffmpeg', [
  '-y', '-framerate', String(FPS), '-i', path.join(framesDir, 'f%06d.png'), ...bloom,
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '16', '-preset', 'medium', gameplay,
]);

// Normalised to the gameplay's frame rate first: xfade blends two streams
// frame by frame and quietly produces judder if they disagree, and
// Playwright records at 25.
const endcard30 = path.join(build, 'endcard-30.mp4');
sh('ffmpeg', [
  '-y', '-ss', String(ENDCARD_LEAD), '-i', endcard,
  '-vf', `fps=${FPS},setpts=PTS-STARTPTS`,
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '16', endcard30,
]);

const gameDur = probe(gameplay);
const offset = (gameDur - XFADE).toFixed(3);
console.log(`  gameplay ${gameDur.toFixed(2)}s, crossfade at ${offset}s`);

// transition=fade, not dissolve: dissolve is a dithered blend and reads as
// television static across a whole-frame crossfade.
sh('ffmpeg', [
  '-y', '-i', gameplay, '-i', endcard30, '-i', music,
  '-filter_complex',
  `[0:v]fade=t=in:st=0:d=${FADE_IN}:color=black[v0];`
  + `[v0][1:v]xfade=transition=fade:duration=${XFADE}:offset=${offset}[v]`,
  '-map', '[v]', '-map', '2:a',
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '16', '-preset', 'medium',
  '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', out,
]);

console.log(`${path.relative(root, out)}  ${probe(out).toFixed(2)}s`);

// The voices, from ElevenLabs, for The Seventh Color's trailer.
//
//   node tools/trailer/audio/voice-native.mjs          (only what is missing)
//   node tools/trailer/audio/voice-native.mjs --force   (all of it again)
//
// Four of them, cast against each other rather than for realism:
//
//   NARRATOR  George, British, the house's narrative_story voice. A fairy
//             tale wants somebody telling it, and a storyteller's cadence
//             is the one thing that stops a trailer's cold open sounding
//             like an advertisement.
//   DARKNESS  Callum, tagged "husky trickster". Everything he says in this
//             game is an offer, and an offer is only frightening when the
//             one making it is enjoying himself. Low stability so v3's
//             delivery tags actually land - a stable read of a sneer is
//             just a man reading a sneer.
//   JACK      Charlie, young and low. He starts frightened and ends up
//             saying the last line in the film, so he needs somewhere to
//             go rather than authority from the first word.
//   LILI      Lily, British, an actress's voice. She gets one line and it
//             has to be the most composed thing anybody says.
//
// The text is the game's, from native/src/data.js, trimmed the way a
// trailer trims a script. The bracketed tags are eleven_v3 direction, not
// dialogue; the model reads them as performance notes and drops them.
//
// Writes build/trailer-native/audio/vo/*.wav plus vo.json, which carries
// each line's measured length. The cut reads that file: a shot has to be
// long enough for the sentence spoken over it, and guessing at that is how
// you end up with a trailer whose voice is still talking after the picture
// has moved on.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..', '..');
const outDir = path.join(root, 'build', 'trailer-native', 'audio', 'vo');
const KEY = process.env.ELEVENLABS_API_KEY;
if (!KEY) { console.error('ELEVENLABS_API_KEY is not set'); process.exit(1); }
const FORCE = process.argv.includes('--force');
const MODEL = 'eleven_v3';

const CAST = {
  narrator: { id: 'JBFqnCBsd6RMkjVDRZzb', stability: 0.5, similarity_boost: 0.75, style: 0.35 },
  // Deliberately unstable. He is the only one in the film having a good
  // time and a locked-down read takes that away.
  darkness: { id: 'N2lVS1w4EtoT3dr4eOWO', stability: 0.3, similarity_boost: 0.7, style: 0.75 },
  jack: { id: 'IKne3meq5aSn9XLyUdCD', stability: 0.45, similarity_boost: 0.8, style: 0.4 },
  lili: { id: 'pFZP5JQG7iQjIQuC4Bku', stability: 0.5, similarity_boost: 0.8, style: 0.45 },
};

// id, who, and the line. Order is the film's order.
const LINES = [
  ['n1', 'narrator', '[slow] Before the first winter... light had seven colours.'],
  ['n2', 'narrator', 'Six of them, the world was allowed to keep.'],
  ['n3', 'narrator', '[quietly] The seventh lived in the horn of a unicorn. And nowhere else.'],
  ['d1', 'darkness', '[sarcastic] Winter answers to no one but me.'],
  ['d2', 'darkness', '[amused] Let them search. The light I took will not be found.'],
  ['g1', 'narrator', '[low] Guilt is a chain. Choice is a road.'],
  ['d3', 'darkness', '[coaxing] Stand beside me. The night can be yours to keep.'],
  ['j1', 'jack', 'I have seen what your forever costs.'],
  ['j2', 'jack', '[firm] Dawn needs no throne.'],
  ['l1', 'lili', '[cold] You cannot trade a threat for a hostage I refuse to be.'],
  ['d4', 'darkness', '[mocking] A parlour trick will not unmake me... child.'],
  // Split, because the film puts a card and a black beat between the two
  // halves of it and one file cannot straddle that.
  ['j3a', 'jack', '[quietly] You were never the night.'],
  ['j3b', 'jack', '[quietly] You were only... its shadow.'],
  ['n4', 'narrator', 'They named it the seventh colour.'],
  ['n5', 'narrator', '[warm] You only ever catch it at dawn. And only if you were still.'],
];

mkdirSync(outDir, { recursive: true });
const meta = {};
// A WAV that ffmpeg has just written: 16-bit mono PCM behind a short
// header. The room is trimmed off both ends HERE rather than in the filter
// graph, because the obvious filter for it - silenceremove around a pair
// of areverse - buffers the whole stream twice and hung solid on the
// fourth line for half an hour.
const trim = (file) => {
  const raw = readFileSync(file);
  let off = 12;
  while (off + 8 <= raw.length && raw.toString('latin1', off, off + 4) !== 'data') off += 8 + raw.readUInt32LE(off + 4);
  const start = off + 8, bytes = raw.readUInt32LE(off + 4), n = bytes / 2;
  const gate = 900;                     // about -37dBFS
  let a = 0, z = n - 1;
  while (a < n && Math.abs(raw.readInt16LE(start + a * 2)) < gate) a++;
  while (z > a && Math.abs(raw.readInt16LE(start + z * 2)) < gate) z--;
  // A hair of room either side so nothing clicks and no consonant is bitten.
  a = Math.max(0, a - 882) | 0;
  z = Math.min(n - 1, z + 4410) | 0;
  const cut = raw.subarray(start + a * 2, start + (z + 1) * 2);
  const head = Buffer.from(raw.subarray(0, start));
  head.writeUInt32LE(cut.length, off + 4);
  head.writeUInt32LE(cut.length + start - 8, 4);
  writeFileSync(file, Buffer.concat([head, cut]));
  return (z - a + 1) / 44100;
};

for (const [id, who, text] of LINES) {
  const wav = path.join(outDir, `${id}.wav`);
  const mp3 = path.join(outDir, `${id}.mp3`);
  // The API call is the slow part and the model is not deterministic, so a
  // line that has been spoken once stays spoken unless --force asks again.
  if (FORCE || !existsSync(mp3)) {
    const v = CAST[who];
    const body = JSON.stringify({
      text, model_id: MODEL,
      voice_settings: { stability: v.stability, similarity_boost: v.similarity_boost, style: v.style, use_speaker_boost: true },
    });
    execFileSync('curl', [
      '-sS', '--fail', '-m', '180', '-o', mp3,
      `https://api.elevenlabs.io/v1/text-to-speech/${v.id}?output_format=mp3_44100_128`,
      '-H', `xi-api-key: ${KEY}`, '-H', 'Content-Type: application/json', '-d', body,
    ], { stdio: ['ignore', 'inherit', 'inherit'] });
  }
  // Mono 44.1k at a known loudness, then trimmed to the words.
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', mp3, '-ac', '1', '-ar', '44100',
    '-c:a', 'pcm_s16le', '-af', 'loudnorm=I=-18:TP=-2:LRA=11', wav],
    { stdio: ['ignore', 'inherit', 'inherit'] });
  const dur = trim(wav);
  meta[id] = { who, text, dur: +dur.toFixed(3) };
  console.log(`  ${id.padEnd(3)} ${who.padEnd(9)} ${dur.toFixed(2)}s  ${text}`);
}
writeFileSync(path.join(outDir, 'vo.json'), JSON.stringify(meta, null, 2));
console.log(`wrote ${Object.keys(meta).length} lines to ${path.relative(root, outDir)}`);

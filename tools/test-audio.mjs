// Is there actually sound on the title screen? Counting oscillators is the
// only way to know from here - "pump is called" is not the same as "the
// browser made a noise", because a suspended AudioContext swallows it all.
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inflateRawSync } from 'node:zlib';
import { chromium } from 'playwright-core';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const a = readFileSync(path.join(root, 'build', 'strands', 'index.zip'));
const nl = a.readUInt16LE(26), el = a.readUInt16LE(28);
const m = a.readUInt16LE(8), c = a.readUInt32LE(18);
const body = a.subarray(30 + nl + el, 30 + nl + el + c);
const stage = mkdtempSync(path.join(tmpdir(), 'js13k-audio-'));
const f = path.join(stage, 'index.html');
writeFileSync(f, m === 0 ? body : inflateRawSync(body));

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--autoplay-policy=user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 900, height: 640 } });
await page.addInitScript(() => {
  window.__osc = 0; window.__state = [];
  const O = AudioContext.prototype.createOscillator;
  AudioContext.prototype.createOscillator = function () { window.__osc++; window.__state.push(this.state); return O.call(this); };
});
await page.goto(pathToFileURL(f).href, { waitUntil: 'load' });
await page.waitForTimeout(1500);
const before = await page.evaluate(() => window.__osc);
console.log(`title, no gesture yet:      ${before} oscillators   (must be 0 - nothing may sound)`);
await page.keyboard.press('Space');
await page.waitForTimeout(2600);                 // still on the title, playing
const during = await page.evaluate(() => window.__osc);
const states = await page.evaluate(() => [...new Set(window.__state)]);
console.log(`title, after one press:      ${during} oscillators   context state seen: ${states.join(', ') || 'none'}`);
const t0 = Date.now();
await page.waitForTimeout(4000);
const more = await page.evaluate(() => window.__osc);
const rate = (more - during) / ((Date.now() - t0) / 1000);
console.log(`title, still sitting there:  ${more} oscillators   (it must keep playing, not stop)`);
// The motif is meant to be the BASS LINE and nothing else. That is a rate,
// not a volume: the bass fires every second step at ~116bpm sixteenths,
// about 3.9 notes a second. The full bed - kick, hat, bass and sub pulse -
// runs near 8.7. Measuring the rate is what tells those two apart; "it
// sounds quieter" would not.
console.log(`             note rate:      ${rate.toFixed(1)}/s   (bass alone ~3.9, full bed ~8.7)`);
// And the track you actually play to must NOT have been stripped. This is a
// standing instruction - the main music is not to be touched - so it gets a
// guard rather than a promise: two more presses to reach the run, then the
// same measurement. Kick, hat, bass, sub and arp together sit far above the
// bass line on its own.
await page.keyboard.press('Space');              // title -> intro
await page.waitForTimeout(400);
await page.keyboard.press('Space');              // skip the intro
await page.waitForTimeout(1200);
const g0 = await page.evaluate(() => window.__osc), gt = Date.now();
await page.waitForTimeout(3000);
const g1 = await page.evaluate(() => window.__osc);
const gameRate = (g1 - g0) / ((Date.now() - gt) / 1000);
console.log(`in the run, full track:      ${gameRate.toFixed(1)}/s   (must stay well above the bass line)`);
await browser.close();
const bassOnly = rate > 2.5 && rate < 5.5;
const fullInGame = gameRate > 6;
const ok = before === 0 && during > 8 && more > during && states.includes('running') && bassOnly && fullInGame;
console.log(ok ? '\nOK: title is bass only, after the gesture; the run keeps the full track'
  : `\nFAIL: before=${before} during=${during} later=${more} rate=${rate.toFixed(1)} game=${gameRate.toFixed(1)} states=${states.join(',')}`);
process.exit(ok ? 0 : 1);

// Boot a built zip in a real browser and record what it shows AND what it
// plays.
//
// Sound is the hard half: nothing leaves a headless browser's speakers, so the
// page's AudioContext is replaced before the game boots by one whose
// `destination` is a MediaStreamDestination. Every oscillator the tracker and
// the sfx build connects to it as usual, and the stream it feeds becomes the
// audio track of a MediaRecorder that also carries a 720p canvas the game is
// upscaled into. Chunks are written out as they arrive rather than held in the
// page, so a long take costs no memory.
import { createWriteStream, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { inflateRawSync } from 'node:zlib';
import { chromium } from 'playwright-core';

function unzipSingleFile(zipPath) {
  const archive = readFileSync(zipPath);
  const start = 30 + archive.readUInt16LE(26) + archive.readUInt16LE(28);
  const body = archive.subarray(start, start + archive.readUInt32LE(18));
  return archive.readUInt16LE(8) === 0 ? body : inflateRawSync(body);
}

export async function openGame({ zip, width = 1280, height = 720, fps = 30 }) {
  const stage = mkdtempSync(path.join(tmpdir(), 'capture-'));
  const pagePath = path.join(stage, 'index.html');
  writeFileSync(pagePath, unzipSingleFile(zip));

  const browser = await chromium.launch({
    args: [
      '--enable-unsafe-swiftshader',
      // Headless would otherwise hold the context suspended until it decides a
      // gesture counts, and the opening bars would be missing.
      '--autoplay-policy=no-user-gesture-required',
    ],
  });
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();

  let sink = null;
  await page.exposeBinding('__chunk', async (_source, b64) => {
    if (sink) sink.write(Buffer.from(b64, 'base64'));
  });

  await page.addInitScript(() => {
    // One AudioContext, made before the game asks for one and handed back to
    // it when it does - so the tap into the mix is already in place.
    const Orig = window.AudioContext || window.webkitAudioContext;
    const ac = new Orig();
    const tap = ac.createMediaStreamDestination();
    Object.defineProperty(ac, 'destination', { value: tap, configurable: true });
    // A silent source, connected forever. Without it the tap carries no
    // samples until the game first plays something, and a MediaRecorder
    // started before that - on the title screen, say - waits for an audio
    // track that never speaks and writes a zero-byte file.
    const silence = ac.createConstantSource();
    const mute = ac.createGain();
    mute.gain.value = 0;
    silence.connect(mute).connect(tap);
    silence.start();
    const proxy = new Proxy(Orig, { construct: () => ac });
    window.AudioContext = proxy;
    window.webkitAudioContext = proxy;
    window.__cap = { ac, stream: tap.stream };
  });

  // #nohud keeps the cheat build's beat readout out of frame.
  await page.goto(pathToFileURL(pagePath).href + '#nohud', { waitUntil: 'load' });
  await page.waitForTimeout(1200);

  await page.evaluate(async ([w, h, rate]) => {
    const game = document.querySelector('canvas');
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const g = cv.getContext('2d');
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    // The game is 320x156. Fit it by width and letterbox the remainder, so
    // the frame keeps the game's own aspect inside 16:9 instead of stretching.
    const drawH = Math.round((w * 156) / 320);
    const draw = () => {
      g.fillStyle = '#000';
      g.fillRect(0, 0, w, h);
      g.drawImage(game, 0, (h - drawH) / 2, w, drawH);
      requestAnimationFrame(draw);
    };
    draw();

    await window.__cap.ac.resume();
    const stream = cv.captureStream(rate);
    for (const t of window.__cap.stream.getAudioTracks()) stream.addTrack(t);

    window.__startRec = () => {
      const rec = new MediaRecorder(stream, {
        mimeType: 'video/webm;codecs=vp9,opus',
        videoBitsPerSecond: 6_000_000,
        audioBitsPerSecond: 128_000,
      });
      rec.ondataavailable = async (e) => {
        if (!e.data.size) return;
        const buf = new Uint8Array(await e.data.arrayBuffer());
        let s = '';
        for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
        await window.__chunk(btoa(s));
      };
      rec.start(500);
      window.__rec = rec;
    };
    window.__stopRec = () => new Promise((done) => {
      window.__rec.onstop = () => done();
      window.__rec.stop();
    });
  }, [width, height, fps]);

  // Recording a take: chunks arriving from the page land in `file` until the
  // recorder has stopped and flushed.
  async function record(file, action) {
    const stream = createWriteStream(file);
    sink = stream;
    await page.evaluate(() => window.__startRec());
    await action();
    await page.evaluate(() => window.__stopRec());
    await page.waitForTimeout(600);
    sink = null;
    await new Promise((done) => stream.end(done));
  }

  return { browser, page, record, close: () => browser.close() };
}

// Driving the game from outside. Every wait-for-state helper reads the cheat
// build's `window.__at`, so a shot lands on the beat and phase it was asked
// for rather than on whatever a fixed number of taps happened to reach.
export function driver(page) {
  const wait = (ms) => page.waitForTimeout(ms);
  const at = () => page.evaluate(() => window.__at);

  const press = async (key, ms = 0) => {
    if (!ms) return page.keyboard.press(key);
    await page.keyboard.down(key);
    await wait(ms);
    await page.keyboard.up(key);
  };

  // shift+shift is the cheat build's "next beat", which is why every capture
  // tool builds with --cheats.
  const skip = async () => {
    await page.keyboard.down('ShiftLeft');
    await page.keyboard.down('ShiftRight');
    await wait(140);
    await page.keyboard.up('ShiftRight');
    await page.keyboard.up('ShiftLeft');
    // The arriving beat's black card runs 1.9s.
    await wait(2300);
  };

  const until = async (what, act, done, limit = 24) => {
    for (let i = 0; i < limit; i++) {
      if (done(await at())) return;
      await act();
    }
    throw new Error(`gave up waiting for ${what}; the story is at ${JSON.stringify(await at())}`);
  };

  return {
    wait,
    at,
    press,
    tap: async (n = 1, gap = 2300) => {
      for (let i = 0; i < n; i++) { await page.keyboard.press('Space'); await wait(gap); }
    },
    hold: (key, ms) => press(key, ms),
    start: async () => { await page.keyboard.press('Space'); await wait(2500); },
    // Skip until the named beat is the one on screen.
    skipTo: (beat) => until(`beat ${beat}`, skip, (s) => s.beat === beat),
    // Tap through a beat's dialogue until its mechanic, its choice or the
    // ending screen is up.
    tapToGame: () => until('a mechanic', () => page.keyboard.press('Space').then(() => wait(700)), (s) => s.game),
    tapToChoice: () => until('a choice', () => page.keyboard.press('Space').then(() => wait(700)), (s) => s.choice),
    tapToEnd: () => until('the ending screen', () => page.keyboard.press('Space').then(() => wait(900)), (s) => s.end),
  };
}

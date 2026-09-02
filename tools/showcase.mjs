// The pictures in README.md, rendered from the games themselves.
//
//   node tools/showcase.mjs [--game=all|native|strands|snap|fireball]
//
// Two things come out per game: a couple of stills and one short looping
// GIF. Both are captured from one scripted run, so the still is a frame of
// the same take the GIF is cut from - there is no second, differently-posed
// session to keep in sync.
//
// It borrows the trailer recorders' faked clock (see
// tools/trailer/record-frames.mjs for why): under a software rasteriser a
// frame can take a tenth of a second to draw, and a GIF assembled from
// real-time frames plays back as a slideshow with the pauses baked in.
// Stepping a virtual clock by exactly 1/FPS makes the motion in the file
// the motion in the game, whatever the machine did.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'docs', 'showcase');
const workRoot = path.join(root, 'build', 'showcase');

const FPS = 20;            // capture rate
// Ten frames a second and eighty colours: a GIF has no interframe
// prediction worth the name, so every one of these is a lever on the file
// size directly. Rainbow Surfer is the worst case in the repo - a starfield
// moving over a dark road dithers badly at any setting - and this keeps it
// under a megabyte.
const GIF_FPS = 10;
const GIF_W = 400;
const GIF_COLORS = 80;
// A README is not a video player: four seconds is a loop, and twelve is a
// download. Longer clips are trimmed to their first GIF_MAX seconds.
const GIF_MAX = 4.0;
const STILL_W = 720;

const sh = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

// --- the shot scripts -----------------------------------------------------
// Each is handed the same small vocabulary. `run` pumps AND captures; `skip`
// pumps without capturing (for the seconds nobody needs to see); `still`
// tags the frame just captured, so it reads as "that one" written after the
// run it belongs to; `clip` opens a GIF segment and the next `clip` (or the
// end of the script) closes it.
const SCRIPTS = {
  // A story game photographs badly as a menu, so this walks into the story:
  // the title, the bloom-lit prologue, the faces, and then the first puzzle -
  // creeping up on a unicorn while its head is down, which is four beats in
  // and reachable on SPACE alone.
  //
  // Note this one wants a build WITHOUT --cheats. The others are indifferent
  // (their DEV hooks are telemetry), but The Seventh Color DRAWS its dev
  // banner - the beat id and 'shift+shift = skip' along the bottom edge, over
  // the dialogue panel and into every frame.
  native: async ({ run, tap, skip, still, clip }) => {
    await skip(1.0);
    await clip('title'); await run(2.6); still('title');
    await tap(' '); await skip(0.4);
    // Named for what each SPACE actually lands on - a beat is a card, some
    // faces and a few lines, so a still is tagged by the count of taps that
    // reached it rather than by the beat it was aimed at.
    await clip('council');
    for (let i = 0; i < 5; i++) { await run(1.6); await tap(' '); }
    still('council');
    for (let i = 0; i < 4; i++) { await run(1.4); await tap(' '); }
    still('glade');
    for (let i = 0; i < 11; i++) { await run(1.4); await tap(' '); }
    await clip('stillness');
    await run(1.4);
    for (const hold of [1.6, 1.4, 1.6]) {
      await tap(' '); await run(hold);
    }
    await run(1.6); still('stillness');
  },

  // A coaster only reads as a coaster in motion, and only if it is being
  // driven properly - held forward, steered into the bends, and lit. The
  // steering reads window.__st, which is a --cheats probe: DEV adds
  // telemetry and nothing visual.
  //
  // The shot worth waiting for is BEING the rainbow, so this drives blind
  // until the game says it is, and only then starts capturing. A fixed
  // number of seconds gets you whatever the course happened to be doing.
  strands: async ({ run, skip, tap, still, clip, hold, page }) => {
    await skip(0.8);
    await clip('title'); await run(1.6); still('title');
    await tap(' '); await skip(1.2);
    await tap(' '); await skip(1.4);
    await tap(' '); await skip(0.6);
    await hold('ArrowUp', true);
    let cur = null;
    const step = async (capture) => {
      const st = await page.evaluate(() => {
        const a = window.__st, r = a && a[a.length - 1];
        return r ? [r[7], r[8], r[10], r[2], r[11], r[12], r[5]] : null;
      });
      let want = null;
      if (st && st[4]) want = st[5] > .4 ? 'ArrowRight' : st[5] < -.4 ? 'ArrowLeft' : null;
      else if (st) { const d = st[1] * 2.2 - st[0] * 1.4; want = d > .25 ? 'ArrowLeft' : d < -.25 ? 'ArrowRight' : null; }
      if (want !== cur) { if (cur) await hold(cur, false); if (want) await hold(want, true); cur = want; }
      await (capture ? run(1 / FPS) : skip(1 / FPS));
      return st;
    };
    const drive = async (seconds, capture) => {
      for (let i = 0; i < Math.round(seconds * FPS); i++) await step(capture);
    };
    // A stretch of ordinary driving for the stills, then blind until lit.
    await drive(6, false);
    await clip('ride'); await drive(2.0, true); still('ride');
    let lit = false;
    for (let i = 0; i < 60 * FPS && !lit; i++) lit = !!(await step(false) || [])[6];
    if (lit) { await clip('rainbow'); await drive(4.2, true); still('rainbow'); }
    else { await clip('speed'); await drive(3.0, true); still('speed'); }
  },

  // The subject is the picture here, so the shots are of the animal - and
  // of the studio, which is the half of this game that is not photography.
  // Its title and its paint box are DOM, not canvas, so this drives them the
  // way a player does: by clicking the buttons.
  snap: async ({ run, skip, tap, still, clip, stage }) => {
    await skip(1.4);
    await clip('title'); await run(2.0); still('title');
    await stage(() => [...document.querySelectorAll('button')]
      .find((b) => b.textContent.trim() === 'OPEN THE STUDIO')?.click());
    await skip(1.0);
    await clip('studio');
    for (const [zone, i] of [['MANE', 2], ['TAIL', 6], ['HOOF', 1], ['HORN', 5]]) {
      await stage(({ zone, i }) => {
        document.querySelector(`button[title="${zone}"]`)?.click();
        document.querySelector(`button[data-i="${i}"]`)?.click();
      }, { zone, i });
      await run(0.8);
    }
    await stage(() => document.querySelector('button[title="GLITTER"]')?.click());
    await run(1.4); still('studio');
    await stage(() => [...document.querySelectorAll('button')]
      .find((b) => b.textContent.trim() === 'START THE SHOOT')?.click());
    await skip(1.2);
    // The shoot opens on the game's own tripod, which is deliberately not
    // pointed at anything - finding the animal IS the mechanic. A capture
    // that just sits there photographs an empty corner and a 'too far away'
    // gauge, so this drags the camera the way a player would, through the
    // DEV aim hook: same orbit, same dolly, no rendering the player cannot
    // reach.
    await clip('shoot');
    for (let i = 0; i < 6; i++) {
      await stage((ang) => window.SNAPCAM(2.2 + Math.PI - 0.26, -0.02, 0.74, ang), 2.2 + i * 0.06);
      await run(0.4);
    }
    still('shoot');
    await tap(' '); await run(2.4); still('shot');
  },

  // Fireball's own camera does the work; this only has to give it a herd
  // worth pointing at. The wind-up and the rainbow are the game, so that is
  // what the clip is.
  fireball: async ({ run, skip, tap, still, clip, hold, stage }) => {
    await skip(1.0);
    await clip('title'); await run(2.2); still('title');
    await tap(' '); await tap(' '); await skip(1.0);
    await stage(() => window.FB.reset(0, 0));
    await stage(() => {
      const { units, leaders } = window.FB, P = leaders[0];
      P.x = -20; P.z = 10; P.yaw = 0.2;
      let taken = 0;
      for (const u of units) {
        if (u.lead >= 0 || u.st === 3 || leaders.includes(u)) continue;
        if (taken >= 16) break;
        u.lead = 0; u.col = P.col; u.st = 0; u.daze = 0;
        const a = Math.random() * 7, r = 2.5 + Math.random() * 9;
        u.x = P.x - 6 + Math.cos(a) * r; u.z = P.z + Math.sin(a) * r;
        taken++;
      }
      for (let i = 1; i < leaders.length; i++) {
        const R = leaders[i], a = (i - 1) / 6 * Math.PI * 2;
        R.x = Math.cos(a) * 62; R.z = Math.sin(a) * 62;
      }
    });
    // The plain's rim is fatal and ArrowUp is fifteen units a second: held
    // for the length of this shot it walks straight off the world, and the
    // capture ends on 'THE PLAIN FORGETS YOU'. So the run is steered - only
    // once the rim is actually coming, and the short way round, so it reads
    // as a turn rather than a rail.
    await stage(() => {
      window.__each = (dt) => {
        const P = window.FB.leaders[0];
        const r = Math.hypot(P.x, P.z) || 1, a = Math.atan2(P.z, P.x);
        const outward = (P.x * Math.cos(P.yaw) + P.z * Math.sin(P.yaw)) / r;
        if (r > 40 && outward > -0.2) {
          const side = Math.sign(Math.sin(P.yaw - a)) || 1;
          const want = a + side * (Math.PI / 2 + 0.35);
          const d = Math.atan2(Math.sin(want - P.yaw), Math.cos(want - P.yaw));
          const max = 1.2 * dt;
          P.yaw += Math.max(-max, Math.min(max, d));
        }
      };
    });
    await skip(0.5);
    await hold('ArrowUp', true);
    await clip('herd'); await run(2.6); still('herd');
    // Placed, not hoped for: chargeTime is (2.4 + .08n) seconds, so the
    // charge is handed exactly the head start that lights the rainbow one
    // second into the clip below.
    await stage(() => {
      const P = window.FB.leaders[0];
      P.charge = Math.max(0, Math.min(0.95, 1 - 1.0 / (2.4 + 0.08 * P.n)));
    });
    await hold(' ', true);
    await clip('rainbow'); await run(3.4); still('rainbow');
    await run(1.4);
  },
};

// Where each game's build lives. Nothing is built here - `npm run
// showcase:build` does that, and it is the one place that knows native wants
// a plain build while the other three want their DEV probes.
const GAMES = {
  native: 'native', strands: 'strands', snap: 'snap', fireball: 'fireball',
};
// Which clip becomes the GIF. Named rather than "the longest one", because
// the longest is usually the one with the most dialogue in it, and a game
// that moves deserves a picture that moves.
const HERO = {
  native: 'stillness', strands: 'rainbow', snap: 'shoot', fireball: 'rainbow',
};

const which = (process.argv.find((a) => a.startsWith('--game=')) || '--game=all').split('=')[1];
const list = which === 'all' ? Object.keys(GAMES) : [which];
for (const g of list) if (!GAMES[g]) { console.error(`unknown game '${g}'`); process.exit(1); }
mkdirSync(outDir, { recursive: true });

for (const name of list) await capture(name);

async function capture(name) {
  const work = path.join(workRoot, name);
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });

  // Last run's output for this game, so a renamed shot does not leave its
  // old file behind for README.md to keep pointing at.
  for (const f of readdirSync(outDir)) {
    if (f === `${name}.gif` || f.startsWith(`${name}-`)) rmSync(path.join(outDir, f));
  }

  const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.error(`  PAGE ERROR (${name}):`, e.message));

  await page.addInitScript(() => {
    window.__vnow = 0;
    let pending = [];
    window.requestAnimationFrame = (cb) => { pending.push(cb); return pending.length; };
    window.cancelAnimationFrame = () => {};
    let timers = [], timerId = 1;
    window.setTimeout = (fn, ms, ...args) => {
      const id = timerId++;
      timers.push({ id, at: window.__vnow + (ms || 0), fn, args });
      return id;
    };
    window.clearTimeout = (id) => { timers = timers.filter((t) => t.id !== id); };
    window.__pump = (dtMs) => {
      window.__vnow += dtMs;
      const cbs = pending; pending = [];
      for (const cb of cbs) cb(window.__vnow);
      const due = timers.filter((t) => t.at <= window.__vnow);
      timers = timers.filter((t) => t.at > window.__vnow);
      for (const t of due) t.fn(...t.args);
    };
    performance.now = () => window.__vnow;
    Date.now = () => window.__vnow;
  });
  await page.goto(pathToFileURL(path.join(root, 'build', GAMES[name], 'index.html')).href, { waitUntil: 'load' });
  await page.evaluate(() => window.__pump(16));
  // Re-measured whenever a clip opens rather than once at boot: Unicorn
  // Snap relays out between its title, its studio and its shoot, and a clip
  // box from the title screen crops the shoot.
  let clipBox = null;
  const measure = async () => {
    const b = await page.locator('canvas').first().boundingBox();
    clipBox = { x: b.x, y: b.y, width: Math.min(1280, b.width), height: Math.min(720, b.height) };
  };
  await measure();

  let frame = 0;
  const clips = [];
  const stills = [];
  // A script can install a per-frame hook by assigning window.__each inside
  // a stage() call - Unicorn Fireball needs one, because ArrowUp held for
  // seven seconds walks the player off the edge of a plain that kills.
  const pump = (ms) => page.evaluate((m) => {
    if (window.__each) window.__each(m / 1000);
    window.__pump(m);
  }, ms);
  const helpers = {
    page,
    stage: (fn, arg) => page.evaluate(fn, arg),
    hold: (k, down) => page.evaluate(([k, down]) => {
      dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { key: k, code: k === ' ' ? 'Space' : k, bubbles: true }));
    }, [k, down]),
    tap: async (k) => { await helpers.hold(k, true); await pump(1000 / FPS); await helpers.hold(k, false); },
    // Both shifts at once is The Seventh Color's DEV skip.
    chord: async () => {
      await page.evaluate(() => {
        for (const code of ['ShiftLeft', 'ShiftRight']) dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift', code, bubbles: true }));
        for (const code of ['ShiftLeft', 'ShiftRight']) dispatchEvent(new KeyboardEvent('keyup', { key: 'Shift', code, bubbles: true }));
      });
      await pump(1000 / FPS);
    },
    skip: async (seconds) => { for (let i = 0; i < Math.round(seconds * FPS); i++) await pump(1000 / FPS); },
    run: async (seconds) => {
      for (let i = 0; i < Math.max(1, Math.round(seconds * FPS)); i++) {
        await pump(1000 / FPS);
        await page.screenshot({ path: path.join(work, `f${String(frame).padStart(5, '0')}.png`), clip: clipBox });
        frame++;
      }
    },
    // Tags the frame just captured - `still` is written after the `run` it
    // belongs to, which reads as "that one" rather than "the next one".
    still: (n) => { stills.push({ name: n, frame: Math.max(0, frame - 1) }); },
    clip: async (n) => {
      await measure();
      if (clips.length) clips[clips.length - 1].end = frame;
      clips.push({ name: n, start: frame, end: frame });
    },
  };
  console.log(`showcase: ${name}`);
  await SCRIPTS[name](helpers);
  if (clips.length) clips[clips.length - 1].end = frame;
  await browser.close();

  for (const s of stills) {
    const out = path.join(outDir, `${name}-${s.name}.png`);
    sh('ffmpeg', ['-y', '-i', path.join(work, `f${String(s.frame).padStart(5, '0')}.png`),
      '-vf', `scale=${STILL_W}:-2:flags=lanczos`, out]);
    console.log(`  ${path.relative(root, out)}`);
  }
  // One GIF per game: the clip HERO names, or the longest if that clip did
  // not happen (Rainbow Surfer's depends on the autopilot actually catching
  // the rainbow). Bayer dithering rather than the default error diffusion -
  // error diffusion re-dithers every frame, so a flat sky crawls and the
  // file doubles.
  const usable = clips.filter((c) => c.end > c.start);
  const best = usable.find((c) => c.name === HERO[name])
    || usable.sort((a, b) => (b.end - b.start) - (a.end - a.start))[0];
  if (best) {
    const out = path.join(outDir, `${name}.gif`);
    // -frames:v counts OUTPUT frames, which is after the fps filter has
    // thinned 20 down to 10 - capping it at captured frames quietly doubled
    // every clip's length.
    const n = Math.min(Math.round((best.end - best.start) / FPS * GIF_FPS),
      Math.round(GIF_MAX * GIF_FPS));
    sh('ffmpeg', ['-y', '-framerate', String(FPS), '-start_number', String(best.start),
      '-i', path.join(work, 'f%05d.png'), '-frames:v', String(n),
      '-filter_complex',
      `fps=${GIF_FPS},scale=${GIF_W}:-2:flags=lanczos,split[a][b];`
      + `[a]palettegen=max_colors=${GIF_COLORS}:stats_mode=diff[p];`
      + '[b][p]paletteuse=dither=bayer:bayer_scale=5',
      '-loop', '0', out]);
    const kb = (sh('stat', ['-c', '%s', out]).trim() / 1024).toFixed(0);
    console.log(`  ${path.relative(root, out)}  ${(n / GIF_FPS).toFixed(1)}s, ${kb} KB`);
  }
}

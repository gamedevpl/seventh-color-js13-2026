// Unicorn Fireball's trailer, captured the same frame-stepped way as Snap's
// (see record-frames.mjs for why the clock is faked) but directed very
// differently.
//
// Snap needed a free camera because the camera IS that game's mechanic and
// its own lens sits on a fixed tripod. Fireball's camera is already the shot
// you want - it rides behind the herd, pulls back as the herd grows and
// opens right up when the rainbow lights - so this script does not move the
// camera at all. It plays the game instead: real keydown/keyup, and the
// world staged through the DEV `window.FB` handle between beats.
//
// Staging notes that cost a while to learn:
//   * FB.reset(colour, ai) - the second argument gives the PLAYER an AI
//     brain (it is what the title screen's attract mode uses). Pass 0, or
//     the bot fights your keystrokes and cancels the charge every few
//     frames.
//   * The plain is fatal at its rim, and ArrowUp is 15 units a second. Held
//     down for the nine seconds of the opening beats that is 144 units
//     across a plain 95 half-wide: the player simply runs off the end of
//     the world. `fell()` then takes its hearts, turns every unicorn that
//     wore its colour wild, and `lost()` latches mode='end' - and the very
//     next SPACE, the one meant to start the charge, dismisses the end
//     screen to the title. That is how a whole trailer ends up recorded on
//     the attract loop with a HUD-less title over it. So the guard below
//     STEERS, every frame, and only when the rim is actually coming.
//   * Contact sets a leader's `cool`, and `cool` cancels a charge. The
//     wind-up beats need room.
//   * A rainbow burns out: burnTime is 2.5 + .12n, shorter than the ride
//     beat wants, so the ride tops it up rather than letting it fizzle
//     mid-shot.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const outDir = path.join(root, 'build', 'trailer-fireball');
const framesDir = path.join(outDir, 'frames');
rmSync(framesDir, { recursive: true, force: true });
mkdirSync(framesDir, { recursive: true });
const gamePath = path.join(root, 'build', 'fireball', 'index.html');

const FPS = 30;
const DT_MS = 1000 / FPS;
const PLAYER_COLOUR = 0;

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('pageerror', (e) => console.error('PAGE ERROR:', e.message));
page.on('crash', () => console.error('PAGE CRASHED'));

await page.addInitScript(() => {
  window.__vnow = 0;
  let pending = [];
  window.requestAnimationFrame = (cb) => { pending.push(cb); return pending.length; };
  window.cancelAnimationFrame = () => {};
  // Fireball leans on setTimeout for its own pacing the way Snap did; on the
  // real clock those land at a different point of the captured timeline on
  // every run, purely by machine speed.
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
});

await page.goto(pathToFileURL(gamePath).href, { waitUntil: 'load' });

// --- the instruments ------------------------------------------------------
// One evaluate per frame does all three jobs - narration, guard, step -
// because the guard has to run in the same round trip as the step it is
// protecting. The first version ran it every tenth frame, which is nine
// frames in which the player can be killed and the match latched over.
let frame = 0, vt = 0;
// 'run' steers and protects | 'ride' also keeps the rainbow lit
// 'clash' protects and holds both rainbows, but never steers: the whole
// point of the beat is two headings that oppose.
let guardMode = 'run';
let boomAt = null;

const pump = () => page.evaluate(([dt, narr, mode]) => {
  const n = window.__narr;
  if (n) {
    if (n.textContent !== narr.text) n.textContent = narr.text;
    n.style.opacity = narr.opacity;
  }
  const { leaders } = window.FB;
  const P = leaders[0], sec = dt / 1000;
  let boom = 0;

  // Nobody dies on camera. The player keeps its hearts, and a rival that
  // went to stone is stood back up - `won()` is `alive().length === 1`, and
  // a match that ends mid-beat takes the rest of the trailer with it.
  P.hearts = 3; P.stun = 0;
  if (P.st === 3) { P.st = 0; P.gone = 0; P.spd = 11; }
  for (let i = 1; i < leaders.length; i++) {
    const R = leaders[i];
    if (R.st === 3) { R.st = 0; R.hearts = 3; R.stun = 0; R.gone = 0; R.spd = 11; }
    const d = Math.hypot(R.x, R.z) || 1;
    if (d > 68) { R.x *= 68 / d; R.z *= 68 / d; }
  }

  if (mode === 'run' || mode === 'ride') {
    // Steering, not a rail: the player runs where it is pointed until the
    // rim is genuinely coming, and then curves away from it. The tangent it
    // picks is whichever of the two is nearer its current heading, so the
    // correction is always the short way round and reads as a turn rather
    // than a snap. `.35` past the tangent aims it slightly inward, which is
    // what stops a long lit run from spiralling out at 37 units a second.
    const r = Math.hypot(P.x, P.z) || 1;
    const a = Math.atan2(P.z, P.x);
    const outward = (P.x * Math.cos(P.yaw) + P.z * Math.sin(P.yaw)) / r;
    if (r > 48 && outward > -0.2) {
      const side = Math.sign(Math.sin(P.yaw - a)) || 1;
      const want = a + side * (Math.PI / 2 + 0.35);
      const d = Math.atan2(Math.sin(want - P.yaw), Math.cos(want - P.yaw));
      const max = (r > 74 ? 2.4 : 1.2) * sec;
      P.yaw += Math.max(-max, Math.min(max, d));
    }
    if (r > 84) { P.x *= 84 / r; P.z *= 84 / r; }
  }
  // The rainbow would go out partway through its own beat otherwise.
  if (mode === 'ride' && P.wave) { P.burn = Math.max(P.burn, 1.2); P.cool = 0; }
  if (mode === 'clash') {
    const R = leaders[1];
    if (!window.__boom) {
      if (P.wave && R.wave) {
        window.__lit = 1;
        P.burn = Math.max(P.burn, 1.5); R.burn = Math.max(R.burn, 1.5);
        P.cool = 0; R.cool = 0;
        // Held head-on, both of them, every frame - and SLOW, which is the
        // part that took a probe to find.
        //
        // Two rainbows only explode if their herd CENTROIDS come within the
        // sum of the two footprints; a leader that reaches the other band
        // first is simply run over (breakHerd, a heart, rainbow out) and the
        // pair pass through each other still lit. And a herd's centroid
        // trails its leader by about spd/2.2 - the followers settle where
        // their catch-up speed matches the leader's - so at a lit herd's
        // natural 37 units a second the leader is TEN units in front of its
        // own herd, and the run-over always wins. Pinned to twelve, that lag
        // is six, the footprints are seven and eight, and the centroids meet
        // first. Measured over three runs: 3.0-3.15s from here to the boom.
        P.yaw = Math.atan2(R.z - P.z, R.x - P.x);
        R.yaw = Math.atan2(P.z - R.z, P.x - R.x);
        P.spd = 12; R.spd = 12;
      } else if (window.__lit) {
        // The winner's rainbow going out IS the detonation - clash() sets
        // W.wave = 0. That is the frame the music has to hit.
        window.__boom = 1; boom = 1;
      }
    }
  }

  window.__pump(dt);
  return boom;
}, [DT_MS, narrationAt(vt), guardMode]);

const capture = async () => {
  await page.screenshot({ path: path.join(framesDir, `f${String(frame).padStart(6, '0')}.png`) });
  frame++;
};
const runFor = async (seconds) => {
  const n = Math.round(seconds * FPS);
  for (let i = 0; i < n; i++) {
    const boom = await pump();
    if (boom && boomAt === null) boomAt = vt;
    await capture();
    vt += DT_MS / 1000;
  }
};
const settle = async (seconds) => {
  for (let i = 0; i < Math.round(seconds * FPS); i++) await pump();
};
const key = (k, down) => page.evaluate(([k, down]) => {
  dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { key: k, bubbles: true }));
}, [k, down]);
const stage = (fn, arg) => page.evaluate(fn, arg);
const peek = () => page.evaluate(() => {
  const P = window.FB.leaders[0];
  return {
    mode: window.FB.mode, n: P.n, charge: +P.charge.toFixed(2), wave: P.wave,
    hearts: P.hearts, at: [Math.round(P.x), Math.round(P.z)],
  };
});

// --- the shot list, as durations ------------------------------------------
// Every beat's length lives here once. The narration below is derived from
// these rather than typed as absolute timestamps - the first cut of this
// file hardcoded both, and the cards ended up adrift of the beats they were
// captioning the moment a shot was retimed. The music is derived from them
// too: this script writes beats.json and render-fireball.py reads it, so
// the score and the cut cannot disagree about where the clash is.
const BEAT = {
  title: 3.6,
  plain: 5.2,
  gather: 4.4,
  charge: 5.4,
  ride: 5.6,
  clash: 4.6,
  after: 2.6,
};
const AT = {};
{
  let t = 0;
  for (const [k, d] of Object.entries(BEAT)) { AT[k] = t; t += d; }
  AT.end = t;
}

// --- narration ------------------------------------------------------------
// Cards, not subtitles: one line per beat, held inside that beat so a cut
// never lands mid-sentence, and never in the corner the HUD is using.
const card = (text, beat, lead = 0.6, tail = 0.4) =>
  ({ text, from: AT[beat] + lead, to: AT[beat] + BEAT[beat] - tail });
const NARRATION = [
  card('seven colours loose on one plain', 'plain'),
  card('gather your own', 'gather'),
  card('hold — and the herd BECOMES the rainbow', 'charge'),
  card('two rainbows meet. the bigger fist wins.', 'clash'),
];
function narrationAt(t) {
  for (const cue of NARRATION) {
    if (t < cue.from || t > cue.to) continue;
    const fade = Math.min(1, (t - cue.from) / 0.45, (cue.to - t) / 0.45);
    return { text: cue.text, opacity: Math.max(0, fade) };
  }
  return { text: '', opacity: 0 };
}

// --- staging --------------------------------------------------------------
// Hand the player a trailer-sized herd out of the grazing unicorns nobody
// owns, parked just behind it so the first frame already reads as a herd.
const giveHerd = (count, spread) => stage(({ count, spread }) => {
  const { units, leaders } = window.FB;
  const P = leaders[0];
  let taken = 0;
  for (const u of units) {
    if (u.lead >= 0 || u.st === 3 || leaders.includes(u)) continue;
    if (taken >= count) break;
    u.lead = 0; u.col = P.col; u.st = 0; u.daze = 0;
    const a = Math.random() * Math.PI * 2, r = 2.5 + Math.random() * spread;
    u.x = P.x - Math.cos(P.yaw) * 5 + Math.cos(a) * r;
    u.z = P.z - Math.sin(P.yaw) * 5 + Math.sin(a) * r;
    taken++;
  }
  return taken;
}, { count, spread });

// Rivals get parked on a ring that is roomy but still well inside the arena.
const clearTheField = (radius) => stage((radius) => {
  const { units, leaders } = window.FB;
  for (let i = 1; i < leaders.length; i++) {
    const R = leaders[i], a = (i - 1) / (leaders.length - 1) * Math.PI * 2;
    R.x = Math.cos(a) * radius; R.z = Math.sin(a) * radius;
    for (const u of units) if (u.lead === i && u !== R) {
      u.x = R.x + (Math.random() - .5) * 7; u.z = R.z + (Math.random() - .5) * 7;
    }
  }
}, radius);

const place = (x, z, yaw) => stage(({ x, z, yaw }) => {
  const P = window.FB.leaders[0];
  P.x = x; P.z = z; P.yaw = yaw;
  for (const u of window.FB.units) if (u.lead === 0 && u !== P) {
    u.x = x - Math.cos(yaw) * 6 + (Math.random() - .5) * 9;
    u.z = z - Math.sin(yaw) * 6 + (Math.random() - .5) * 9;
  }
}, { x, z, yaw });

console.log('recording Unicorn Fireball');

// --- 1. the title ---------------------------------------------------------
// The game opens on its own slow orbit of a live plain, which is already a
// better establishing shot than anything staged. It only needs a moment to
// get the camera away from its cold start - and its HUD taken off, because
// the title screen paints 'press SPACE', 'go online - press O' and the
// byline over it, and a trailer that opens on a menu is a screenshot of a
// menu. The plain alone, fading up from black, is the opening; the title is
// the end card's job.
await pump();
await stage(() => {
  // Bottom fifth, not bottom eighth: the game keeps its own line there
  // ('hold SPACE to charge', 'RAINBOW - herd 26') and the charge bar under
  // it, and a card at 12% lands exactly on top of both.
  const n = document.createElement('div');
  n.style.cssText = 'position:fixed;left:0;right:0;bottom:20%;text-align:center;pointer-events:none;'
    + "z-index:99999;opacity:0;font:900 46px 'Arial Black',Arial,sans-serif;color:#fff6ea;"
    + 'text-shadow:0 4px 20px rgba(0,0,0,.75);padding:0 6%;letter-spacing:.5px';
  document.body.appendChild(n);
  window.__narr = n;
  // The second canvas is the 2D overlay: title, HUD, minimap. Hidden rather
  // than removed, because every later beat wants it back.
  window.__hud = document.querySelectorAll('canvas')[1];
  if (window.__hud) window.__hud.style.visibility = 'hidden';
});
await settle(1.2);
await runFor(BEAT.title);
console.log('  title done, frame', frame);

// --- 2. the plain, and a herd that grows ----------------------------------
await stage((c) => {
  if (window.__hud) window.__hud.style.visibility = '';
  window.FB.reset(c, 0);
}, PLAYER_COLOUR);
await clearTheField(66);
await place(-34, 6, 0.15);
await giveHerd(5, 5);
await settle(0.6);
await key('ArrowUp', true);
await runFor(BEAT.plain);
console.log('  plain done, frame', frame, JSON.stringify(await peek()));

// The herd thickens: this is the montage beat, so it is allowed to arrive
// faster than a real gather would.
await giveHerd(9, 8);
await runFor(BEAT.gather);
console.log('  gather done, frame', frame, JSON.stringify(await peek()));

// --- 3. the wind-up -------------------------------------------------------
// Room to charge in: contact would cancel it. The herd is topped up first so
// the fold is worth watching, and the count on the HUD climbs with it.
await giveHerd(12, 9);
await clearTheField(66);
await settle(0.3);
// Ignition is placed, not hoped for. chargeTime is (2.4 + .08n) seconds and
// the herd's size is only known now, so the charge is given exactly the head
// start that lands the rainbow IGNITE_IN seconds later - inside this beat,
// every run, whatever the herd came to. An earlier cut instead topped the
// charge up afterwards if it had not lit, which worked but stretched the
// beat by 0.7s and put every later beat out of step with the music.
const IGNITE_IN = BEAT.charge - 0.9;
console.log('  head start:', await stage((ignIn) => {
  const P = window.FB.leaders[0];
  const chargeTime = 2.4 + 0.08 * P.n;
  P.charge = Math.max(0, Math.min(0.95, 1 - ignIn / chargeTime));
  return `n=${P.n} chargeTime=${chargeTime.toFixed(1)}s charge=${P.charge.toFixed(2)}`;
}, IGNITE_IN));
await key(' ', true);
await runFor(BEAT.charge);
console.log('  charge done, frame', frame, JSON.stringify(await peek()));
guardMode = 'ride';
await runFor(BEAT.ride);
console.log('  ride done, frame', frame, JSON.stringify(await peek()));

// --- 5. the clash ---------------------------------------------------------
// Both rainbows are lit by hand and aimed head-on: clash() only detonates
// when the two headings actually oppose (cos of the difference under -0.4),
// and waiting for the AI to volunteer that is not a thing a shot list can do.
// The gap is what buys the approach - the guard pins both to twelve units a
// second while they are lit, so forty units each side of the middle is about
// three seconds of two rainbows growing in one frame before they meet.
guardMode = 'clash';
await stage(() => {
  const { units, leaders } = window.FB;
  const P = leaders[0];
  P.x = -40; P.z = 0; P.yaw = 0;
  P.charge = 1; P.chg = 1; P.wave = 1 + P.n; P.burn = 6; P.cool = 0; P.spent = 0; P.spd = 18;
  for (const u of units) if (u.lead === 0 && u !== P) {
    u.x = P.x - 6 + (Math.random() - .5) * 8; u.z = P.z + (Math.random() - .5) * 8;
  }
  // The challenger: a smaller herd, so the exchange resolves the way the
  // rules say it should rather than ending the player's run mid-trailer.
  const R = leaders[1];
  R.x = 40; R.z = 0; R.yaw = Math.PI;
  R.st = 0; R.stun = 0; R.cool = 0; R.hearts = 3; R.spd = 18;
  let given = 0;
  for (const u of units) {
    if (u.lead >= 0 || u.st === 3 || leaders.includes(u)) continue;
    if (given >= 12) break;
    u.lead = 1; u.col = R.col; u.st = 0; u.daze = 0;
    u.x = R.x + 6 + (Math.random() - .5) * 7; u.z = R.z + (Math.random() - .5) * 7;
    given++;
  }
  R.n = given;
  R.charge = 1; R.chg = 1; R.wave = 1 + given; R.burn = 6; R.spent = 0;
  // The rival's brain is taken off it for the length of the approach. Left
  // on, it reads the edge eighty-odd units down its own nose - `look` grows
  // with the herd - and LETS THE RAINBOW GO, which is the right instinct in
  // a real match and a fizzle instead of a detonation here. With no brain it
  // holds whatever `chg` it was handed, and the guard above steers it.
  R.__ai = R.ai; R.ai = null;
});
await key('ArrowUp', false);
await runFor(BEAT.clash);
console.log('  clash done, frame', frame, JSON.stringify(await peek()));

// The aftermath is the point of the scatter rule, so it gets a beat - and
// the rival gets its brain back for it.
guardMode = 'run';
await stage(() => { const R = window.FB.leaders[1]; if (R.__ai) { R.ai = R.__ai; R.__ai = null; } });
await key(' ', false);
await runFor(BEAT.after);

await browser.close();

// What the score has to agree with. Written rather than assumed: the clash
// is physics, not a cue, and it lands where the approach puts it.
writeFileSync(path.join(outDir, 'beats.json'),
  JSON.stringify({ fps: FPS, beats: BEAT, at: AT, clashAt: boomAt, duration: frame / FPS }, null, 2));
console.log(`  clash detonated at ${boomAt === null ? 'NEVER' : boomAt.toFixed(2) + 's'}`
  + ` (beat starts ${AT.clash.toFixed(2)}s)`);
console.log(`wrote ${frame} frames to ${path.relative(root, framesDir)} @ ${FPS}fps (${(frame / FPS).toFixed(2)}s)`);

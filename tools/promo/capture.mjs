// Promo film capture. Every prior capture tool photographs the game in real
// time; a film cannot afford that, because SwiftShader renders a 1080p frame
// slower than 16ms and the result would stutter. So time itself is taken
// over: requestAnimationFrame and performance.now are replaced before the
// game boots, and the harness advances the clock 1/60s per captured frame -
// the game believes it runs at a perfect 60 and every frame lands exactly
// where it should. Math.random is seeded for the same reason: a retake of a
// shot must happen on the SAME course.
//
// Needs a --cheats build (the rig, the clean plate and the telemetry are all
// DEV-only):  node tools/native.mjs --game=strands --no-roadroller --cheats
//
// usage: node tools/promo/capture.mjs <outdir> [shot ...] [--seed=7] [--w=1920]
//        shots: title intro orbit deck chase jump catch surf end   (default all)

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const out = args.find((a) => !a.startsWith('--')) || '/tmp/promo';
const wanted = args.filter((a) => !a.startsWith('--')).slice(1);
const SEED = Number(args.find((a) => a.startsWith('--seed='))?.split('=')[1] || 7);
const W = Number(args.find((a) => a.startsWith('--w='))?.split('=')[1] || 1920);
const H = Math.round(W * 9 / 32) * 2; // 16:9, even
const FPS = 60, DT = 1000 / 60;

const html = pathToFileURL(path.join(root, 'build', 'strands', 'index.html')).href;

// Everything the page needs before the game's own script runs: a seeded RNG,
// a virtual clock, and an AudioContext stub whose currentTime rides that
// clock - so the sequencer schedules (and `beat` pulses the title bars and
// the head-nod) without a real audio device in sight.
const boot = (seed) => `(() => {
  let s = ${seed} >>> 0;
  Math.random = () => {
    s = s + 0x6D2B79F5 | 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
  let vt = 0;
  const q = [];
  window.requestAnimationFrame = (cb) => (q.push(cb), q.length);
  window.cancelAnimationFrame = () => {};
  performance.now = () => vt;
  window.__tick = (ms) => { vt += ms; const cbs = q.splice(0); for (const cb of cbs) cb(vt); return q.length; };
  const param = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} });
  window.AudioContext = window.webkitAudioContext = function () {
    return {
      get currentTime() { return vt / 1000; },
      destination: {},
      createOscillator: () => ({ type: '', frequency: param(), connect() {}, start() {}, stop() {} }),
      createGain: () => ({ gain: param(), connect() {} }),
    };
  };
  // Backing-store size on demand: tiny while fast-forwarding (SwiftShader
  // cost is per pixel), full size for the take. Setting canvas.width resets
  // the 2d context, so the HUD transform is re-established here every time.
  window.__size = (w, h) => {
    const cs = document.querySelectorAll('canvas');
    for (const c of cs) { c.width = w; c.height = h; }
    cs[1].getContext('2d').setTransform(w / 640, 0, 0, h / 360, 0, 0);
  };
})();`;

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });

// ---------------------------------------------------------------------------
// One session per shot: fresh page, same seed, so takes are reproducible.
class Take {
  constructor(page, name) { this.page = page; this.name = name; this.keys = {}; this.frame = 0; this.meta = { name, fps: FPS, events: [] }; }
  async tick(ms = DT) { await this.page.evaluate((m) => window.__tick(m), ms); }
  async state() {
    return this.page.evaluate(() => ({
      st: window.__st ? window.__st[window.__st.length - 1] : null,
      mo: window.__mo || null,
    }));
  }
  async key(k, on) {
    if (!!this.keys[k] === !!on) return;
    this.keys[k] = on;
    await (on ? this.page.keyboard.down(k) : this.page.keyboard.up(k));
  }
  async press(k) { await this.page.keyboard.press(k); }
  // The same steering the cover-shot bot uses: into the bend on the deck,
  // back over the centre line in the air. st[7]=lane st[8]=turnRate
  // st[10]=kicker-ahead st[11]=flying st[12]=fly.lat
  async steer(st, spaceKickers) {
    if (!st) return;
    let want = null;
    if (st[11]) want = st[12] > .4 ? 'ArrowRight' : st[12] < -.4 ? 'ArrowLeft' : null;
    else {
      const d = st[8] * 2.2 - st[7] * 1.4;
      want = d > .25 ? 'ArrowLeft' : d < -.25 ? 'ArrowRight' : null;
    }
    for (const k of ['ArrowLeft', 'ArrowRight']) if (want !== k) await this.key(k, false);
    if (want) await this.key(want, true);
    if (spaceKickers && st[10] && !st[11] && this.frame - (this._armF || -99) > 60) { this._armF = this.frame; await this.press(' '); }
  }
  async shoot(dir) {
    await this.page.screenshot({
      path: path.join(dir, String(this.frame).padStart(5, '0') + '.jpg'),
      type: 'jpeg', quality: 92,
      clip: { x: 0, y: 0, width: W, height: H },
      caret: 'initial',
    });
    this.frame++;
  }
  ev(key) { this.meta.events.push({ frame: this.frame, t: this.frame / FPS, key }); }
}

async function session(name) {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  await page.addInitScript(boot(SEED));
  await page.goto(html, { waitUntil: 'load' });
  await page.evaluate(() => window.__size(64, 36));
  return new Take(page, name);
}

// Fast-forward at the sim's dt ceiling (50ms) with a thumbnail-sized buffer;
// steering still runs so the bot keeps the deck. `until` gets (st, mo, simMs).
async function ff(take, { until, maxMs = 200000, drive = true, god = true }) {
  if (god) await take.page.evaluate(() => { window.__god = 2; });
  let sim = 0;
  while (sim < maxMs) {
    await take.tick(50); sim += 50;
    const { st, mo } = await take.state();
    if (drive && mo && mo[0] !== 'title' && mo[0] !== 'intro') { await take.key('ArrowUp', true); await take.steer(st, false); }
    if (until && await until(st, mo, sim)) return sim;
  }
  return sim;
}

// The take itself: full-size buffer, 60fps, a screenshot per tick. `hooks`
// can steer, press keys, watch for events and stop the take early.
async function roll(take, dir, seconds, { drive = false, spaceKickers = false, onFrame = null, stop = null } = {}) {
  mkdirSync(dir, { recursive: true });
  await take.page.evaluate(([w, h]) => window.__size(w, h), [W, H]);
  await take.tick(); // one settle frame at full size before the first shot
  const n = Math.round(seconds * FPS);
  let falls = null, lastMode = null;
  for (let i = 0; i < n; i++) {
    const { st, mo } = await take.state();
    // A fall mid-take usually means the take is a retake; it lands in the
    // meta so the edit can see it without eyeballing every frame. Mode
    // changes land there too - the cut points are made of them.
    if (st) { if (falls !== null && st[3] > falls) take.ev('fall'); falls = st[3]; }
    if (mo && mo[0] !== lastMode) { if (lastMode !== null) take.ev('mode:' + mo[0]); lastMode = mo[0]; }
    if (drive) { await take.key('ArrowUp', true); await take.steer(st, spaceKickers); }
    if (onFrame) await onFrame(take, st, mo, i);
    await take.shoot(dir);
    if (stop && await stop(st, mo, i)) break;
    await take.tick();
  }
  writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(take.meta, null, 1));
  await take.page.close();
  console.log(`  ${take.name}: ${take.frame} frames -> ${dir}`);
}

// A rig shot is photographed from outside the chase, so the chase's own
// centre-zoom blur comes off with it.
const rig = (take, fn) => take.page.evaluate(`window.__rt = 0; window.__noBlur = 1; window.__rig = ${fn};`);
const clean = (take) => take.page.evaluate(() => { window.__cleanHud = 1; });

// Through the front door: wake the title, leave it, skip the intro. Three
// presses, because the first SPACE deliberately only wakes the screen.
async function toRun(t) {
  await ff(t, { drive: false, god: false, until: (s, m, sim) => sim >= 400 });
  await t.press(' '); await t.tick(50);
  await t.press(' '); await t.tick(50);
  await t.press(' '); await t.tick(50);
  await ff(t, { until: (s, m) => m && m[0] === 'run', maxMs: 20000 });
}

// ---------------------------------------------------------------------------
const SHOTS = {
  // The title screen as shipped: logo, rainbow bars breathing on the kick,
  // the attract race running underneath, broadcast towers cutting.
  async title() {
    const t = await session('title');
    await ff(t, { drive: false, god: false, until: (s, m, sim) => sim >= 700 });
    await t.press(' '); // wake: bars start breathing, race keeps running
    await ff(t, { drive: false, god: false, until: (s, m, sim) => sim >= 1200 });
    await roll(t, path.join(out, 'title'), 6);
  },

  // The opening film: held wide on the escaping rainbow, three beats of
  // text (re-set in post), then the swing that reveals the unicorn.
  async intro() {
    const t = await session('intro');
    await ff(t, { drive: false, god: false, until: (s, m, sim) => sim >= 700 });
    await t.press(' '); // wake
    await ff(t, { drive: false, god: false, until: (s, m, sim) => sim >= 1000 });
    await t.press(' '); // leave -> the intro film rolls in full
    await clean(t);
    await roll(t, path.join(out, 'intro'), 7.2, { drive: true });
  },

  // A slow orbit around the unicorn at full tilt - the shot the game's own
  // chase rig can never do.
  async orbit() {
    const t = await session('orbit');
    await toRun(t);
    await ff(t, { until: (s, m, sim) => sim >= 9000 });
    await clean(t);
    await rig(t, `(s) => {
      window.__rt += s.dt;
      const t = window.__rt;
      const a = 2.5 - t * .52, R = 9.5 - t * .55;
      const sd = s.side, up = s.up, T = s.t, p = s.p;
      const cx = Math.cos(a), sx = Math.sin(a);
      const e = [0, 1, 2].map((i) => p[i] + (cx * sd[i] + sx * T[i]) * R + up[i] * (2.6 - t * .12));
      const aim = [0, 1, 2].map((i) => p[i] + up[i] * .9 + T[i] * 1.2);
      return { e, a: aim, up: [up[0] * .75, .25 + up[1] * .75, up[2] * .75], fov: .95, cut: t < .03 };
    }`);
    await roll(t, path.join(out, 'orbit'), 6, { drive: true });
  },

  // A lens lying at the edge of the deck while the unicorn comes through
  // flat out - distance closing is the only thing that reads as speed from
  // a static camera, which is why the attract mode invented this shot.
  async deck() {
    const t = await session('deck');
    await toRun(t);
    await ff(t, { until: (s, m, sim) => sim >= 14000 });
    await clean(t);
    await rig(t, `(s) => {
      window.__rt += s.dt;
      if (!window.__deck) {
        const p = s.p, T = s.t, sd = s.side, up = s.up;
        window.__deck = {
          e: [0, 1, 2].map((i) => p[i] + T[i] * 22 + sd[i] * 3.6 + up[i] * .8),
          up: [...up],
        };
      }
      const d = window.__deck;
      const aim = [0, 1, 2].map((i) => s.p[i] + s.t[i] * 3 + s.up[i] * 1);
      return { e: d.e, a: aim, up: d.up, fov: .95, cut: window.__rt < .03 };
    }`);
    await roll(t, path.join(out, 'deck'), 4.2, { drive: true });
  },

  // Pure gameplay, HUD and all: the promo owes the judges one honest shot
  // of what playing it actually looks like.
  async chase() {
    const t = await session('chase');
    await toRun(t);
    // No cheats here: this is the one shot that has to be the actual game,
    // stardust economy and all - and an ever-full tank catches the rainbow
    // mid-take, which is the other shot's job.
    await t.page.evaluate(() => { window.__god = 0; });
    await ff(t, { god: false, until: (s, m, sim) => sim >= 6000 });
    await roll(t, path.join(out, 'chase'), 9, { drive: true, spaceKickers: false });
  },

  // The kicker: arm it, launch, and let the game's own jump cinematic - the
  // pulled-back, stilled camera - carry the shot through to the landing.
  async jump() {
    const t = await session('jump');
    await toRun(t);
    // run up to the moment a kicker is ahead, on the small buffer
    await ff(t, { until: (s) => s && s[10] === 1 });
    await clean(t);
    let landF = -1;
    await roll(t, path.join(out, 'jump'), 12, {
      drive: true, spaceKickers: true,
      onFrame: async (tk, st, mo, i) => {
        if (st && st[11] && !tk._flew) { tk._flew = 1; tk.ev('launch'); }
        if (st && !st[11] && tk._flew === 1) { tk._flew = 2; landF = i; tk.ev('land'); }
      },
      stop: (st, mo, i) => landF >= 0 && i > landF + 80,
    });
  },

  // The money shot: the gap closes, the screen tears white, and the player
  // BECOMES the thing they were chasing.
  async catch_() {
    const t = await session('catch');
    await toRun(t);
    await ff(t, { until: (s) => s && !s[5] && s[9] > 0 && s[9] < 26, maxMs: 120000 });
    await clean(t);
    let gotF = -1;
    await roll(t, path.join(out, 'catch'), 14, {
      drive: true,
      onFrame: async (tk, st, mo, i) => { if (st && st[5] && gotF < 0) { gotF = i; tk.ev('catch'); } },
      stop: (st, mo, i) => gotF >= 0 && i > gotF + 200,
    });
  },

  // Riding as the rainbow: a trackside travelling shot first, then a cut to
  // dead ahead, the whole burning trail flying straight at the lens.
  async surf() {
    const t = await session('surf');
    await toRun(t);
    await ff(t, { until: (s) => s && s[5] === 1, maxMs: 150000 });
    await ff(t, { until: (s, m, sim) => sim >= 4000 });
    await clean(t);
    await rig(t, `(s) => {
      window.__rt += s.dt;
      const t = window.__rt, p = s.p, T = s.t, sd = s.side, up = s.up;
      if (t < 3.4) {
        // From ahead and to the side, looking back past the rider: the trail
        // is deliberately dimmed at the head and swells a few lengths back,
        // so the shot that sells "you ARE the rainbow" has to face the tail.
        const e = [0, 1, 2].map((i) => p[i] + T[i] * 3.5 + sd[i] * (5.8 - t * .2) + up[i] * 1.6);
        const aim = [0, 1, 2].map((i) => p[i] - T[i] * 2.5 + up[i] * .7);
        return { e, a: aim, up: [up[0] * .6, .4 + up[1] * .6, up[2] * .6], fov: 1.0, cut: t < .03 };
      }
      const e = [0, 1, 2].map((i) => p[i] + T[i] * 9 - sd[i] * .8 + up[i] * 1.7);
      const aim = [0, 1, 2].map((i) => p[i] + up[i] * .6);
      return { e, a: aim, up: [up[0] * .6, .4 + up[1] * .6, up[2] * .6], fov: 1.0, cut: t > 3.4 && t < 3.44 };
    }`);
    await roll(t, path.join(out, 'surf'), 7, { drive: true });
  },

  // The ending as designed: the camera stops, the unicorn does not.
  async end() {
    const t = await session('end');
    await toRun(t);
    await ff(t, { until: (s, m) => m && m[0] === 'end', maxMs: 400000 });
    await clean(t);
    await roll(t, path.join(out, 'end'), 6.5, { drive: false });
  },
};

const list = wanted.length ? wanted : Object.keys(SHOTS);
mkdirSync(out, { recursive: true });
for (const s of list) {
  const key = SHOTS[s] ? s : s === 'catch' ? 'catch_' : s;
  if (!SHOTS[key]) { console.error('unknown shot: ' + s); continue; }
  console.log('shot: ' + s);
  await SHOTS[key]();
}
await browser.close();
console.log('done -> ' + out);

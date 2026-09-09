// The Seventh Color, cut the way fantasy trailers were cut in 1985.
//
//   node tools/trailer/record-native.mjs        (full, 1920x1080)
//   SC_PREVIEW=n   every nth frame, half size - the shape of the cut in minutes
//   SC_DRY=1       re-time and rewrite beats.json without photographing a frame
//   SC_UNTIL=name  stop after that shot
//
// The reference is the original Legend trailer, and the three things that
// make that a different film from a modern one are all here.
//
//   IT DISSOLVES. Almost nothing in this cut is a cut. Every shot fades up
//   through the one before it, because an optical dissolve is what a
//   fairy tale looked like before hard cutting became the house style, and
//   because these images - flat colour, slow drift - bleed into each other
//   beautifully. The trailer keeps ONE hard cut, with two white frames on
//   it, for the frame the horn breaks. A film with one cut in it makes that
//   cut enormous.
//
//   IT WITHHOLDS. The previous pass played the whole story: the light
//   restored, Darkness beaten, the last line of the game and the dawn
//   behind it. A trailer for a forty-minute story cannot spend the story.
//   This one stops at the threat. The light starts down the castle and the
//   film cuts away from it; Darkness's last word is a taunt, not a defeat;
//   nobody says how it ends. Every line past that point is still generated
//   and still in vo.json, unused, because the temptation to put them back
//   is exactly the thing to leave a note about.
//
//   IT IS SLOW. Seventy-five to the minute, four to six beats a shot, and
//   the score is sustained rather than struck - no braams, no hit on every
//   cut. The one impact in the film is the horn.
//
// The rest is as before: `SCH` takes the game's interface off so the
// pictures are clean, `SCX` scales the backing store and the base matrix so
// 320x156 of vector work is crisp at 1080p, four ElevenLabs voices say the
// lines (audio/voice-native.mjs), and vo.json's measured lengths decide how
// long a shot has to be.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const gamePath = path.join(root, 'build', 'native', 'index.html');
const outDir = path.join(root, 'build', 'trailer-native');
const framesDir = path.join(outDir, 'frames');

const FPS = 30, DT = 1 / FPS;
const PREVIEW = Number(process.env.SC_PREVIEW || 0);
const DRY = !!process.env.SC_DRY;
const VW = 320, VH = 156, SCX = 8;
// Seventy-five. Slow enough that a five-beat shot is four seconds, which is
// about as long as one of these images wants to be held, and slow enough
// that a dissolve can be a whole beat without eating the shot.
const BPM = 75, BEAT = 60 / BPM;
const b = (n) => n * BEAT;

const VO = JSON.parse(readFileSync(path.join(outDir, 'audio', 'vo', 'vo.json'), 'utf8'));
const vos = [];

if (!DRY) rmSync(framesDir, { recursive: true, force: true });
mkdirSync(framesDir, { recursive: true });
mkdirSync(path.join(outDir, 'audio'), { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: PREVIEW ? { width: 960, height: 540 } : { width: 1920, height: 1080 } });
page.on('pageerror', (e) => console.error('PAGE ERROR:', e.message));

await page.addInitScript(([SCX]) => {
  window.SCX = SCX;
  window.SCH = 1;
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
  window.setInterval = () => 0;
  window.__pump = (dtMs) => {
    window.__vnow += dtMs;
    const cbs = pending; pending = [];
    for (const cb of cbs) cb(window.__vnow);
    const due = timers.filter((t) => t.at <= window.__vnow);
    timers = timers.filter((t) => t.at > window.__vnow);
    for (const t of due) t.fn(...t.args);
  };
  performance.now = () => window.__vnow;
}, [SCX]);

await page.goto(pathToFileURL(gamePath).href, { waitUntil: 'load' });
await page.evaluate(() => window.__pump(16));

await page.evaluate(() => {
  document.body.style.background = '#000';
  const canvas = document.getElementById('c');
  canvas.style.willChange = 'transform';
  const box = canvas.getBoundingClientRect();
  const bar = Math.round(box.top);
  const el = (css) => { const n = document.createElement('div'); n.style.cssText = css; document.body.appendChild(n); return n; };

  // THE DISSOLVE. A second canvas laid exactly over the first. At the top
  // of a shot the outgoing frame is copied into it and then faded out over
  // the incoming one - which is what an optical dissolve is, with the
  // outgoing side frozen. Frozen is fine here: these images drift rather
  // than move, and the overlay keeps drifting under its own transform while
  // it fades, so both halves are still travelling.
  const prev = document.createElement('canvas');
  prev.width = canvas.width;
  prev.height = canvas.height;
  prev.style.cssText = `position:fixed;left:${box.left}px;top:${box.top}px;`
    + `width:${box.width}px;height:${box.height}px;opacity:0;pointer-events:none;z-index:899`;
  document.body.appendChild(prev);
  const pctx = prev.getContext('2d');

  // THE POLLEN. Half of what makes a 1985 fantasy frame look the way it
  // does is that there is always something drifting through it - dust in a
  // shaft of light, pollen in a forest, ash in a hall. The game does not
  // draw any, so the film does: a few dozen specks on their own slow
  // upward drift with a sine in the horizontal, each a soft dot rather
  // than a hard pixel, over the picture and under the letterbox. Density
  // is per shot, because a throne room does not have pollen in it.
  const dust = document.createElement('canvas');
  dust.width = Math.round(box.width);
  dust.height = Math.round(box.height);
  dust.style.cssText = `position:fixed;left:${box.left}px;top:${box.top}px;`
    + `width:${box.width}px;height:${box.height}px;pointer-events:none;z-index:898`;
  document.body.appendChild(dust);
  const dctx = dust.getContext('2d');
  // One soft dot, drawn once and stamped: a radial gradient per speck per
  // frame is two and a half thousand frames of gradient allocation.
  const DOT = document.createElement('canvas');
  DOT.width = DOT.height = 64;
  {
    const g = DOT.getContext('2d').createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,246,214,1)');
    g.addColorStop(0.35, 'rgba(255,240,200,0.45)');
    g.addColorStop(1, 'rgba(255,236,190,0)');
    const c = DOT.getContext('2d');
    c.fillStyle = g;
    c.fillRect(0, 0, 64, 64);
  }
  const MOTES = [];
  for (let i = 0; i < 110; i++) {
    MOTES.push({
      x: Math.random(), y: Math.random(),
      r: 2 + Math.random() * Math.random() * 12,      // a few big, mostly small
      sp: 0.006 + Math.random() * 0.020,              // screens per second, upward
      sw: 0.004 + Math.random() * 0.014,              // how far it wanders
      ph: Math.random() * 7, a: 0.25 + Math.random() * 0.75,
    });
  }
  const drawDust = (t, amount) => {
    dctx.clearRect(0, 0, dust.width, dust.height);
    if (amount <= 0) return;
    dctx.globalCompositeOperation = 'lighter';
    for (const m of MOTES) {
      const y = (m.y - t * m.sp) % 1;
      const x = m.x + Math.sin(t * 0.35 + m.ph) * m.sw;
      const px = x * dust.width, py = (y < 0 ? y + 1 : y) * dust.height;
      // Fade at the top and bottom edges so nothing pops in or out.
      const edge = Math.min(1, Math.min(py, dust.height - py) / 90);
      dctx.globalAlpha = m.a * amount * edge * (0.5 + 0.5 * Math.sin(t * 0.9 + m.ph * 2));
      dctx.drawImage(DOT, px - m.r * 2, py - m.r * 2, m.r * 4, m.r * 4);
    }
    dctx.globalAlpha = 1;
    dctx.globalCompositeOperation = 'source-over';
  };

  el(`position:fixed;left:0;right:0;top:0;height:${bar}px;background:#000;z-index:900`);
  el(`position:fixed;left:0;right:0;bottom:0;height:${bar}px;background:#000;z-index:900`);
  const scrim = el('position:fixed;inset:0;background:#000;opacity:0;pointer-events:none;z-index:901');
  const white = el('position:fixed;inset:0;background:#fff;opacity:0;pointer-events:none;z-index:903');
  // The one card in the film, and the title of nothing: soft, wide, and
  // faded rather than cut, like everything else here.
  const card = el('position:fixed;inset:0;display:flex;align-items:center;justify-content:center;'
    + 'text-align:center;padding:0 10%;opacity:0;pointer-events:none;z-index:902;'
    + "font-family:system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;"
    + 'font-weight:600;text-transform:uppercase;letter-spacing:.30em;line-height:1.3;'
    + 'color:#f3ead6;text-shadow:0 0 60px rgba(0,0,0,.95)');

  const SC = window.SC;

  const DRIVERS = {
    still: (s, r) => {
      const g = r.g;
      if (!g) return;
      const slip = s.slipAt && s.t > s.slipAt && s.t < s.slipAt + .3;
      SC.hold('act', g.spooked > 0 ? false : slip ? true : window.SCSAFE(g.t));
    },
    crack: (s, r) => {
      const g = r.g;
      if (!g || s.t < (g.__next || 0)) return;
      g.__next = s.t + (s.every ?? .3);
      const target = g.cells.findIndex((c, i) => !c && i < g.n - 1);
      const want = target < 0 ? g.n - 1 : target + 1;
      if (g.sel < want) SC.key('right');
      else if (g.sel > want) SC.key('left');
      else SC.key('act');
    },
    lights: (s, r) => {
      const g = r.g;
      if (!g || s.t < (g.__next || 0)) return;
      g.__next = s.t + (s.every ?? .26);
      const order = g.history.length ? g.secret : g.secret.map((v, i, a) => (i === 0 ? a[1] : i === 1 ? a[0] : v));
      const want = order[g.guess.length];
      if (want === undefined) return;
      if (g.cursor !== want) SC.key(g.cursor < want ? 'right' : 'left');
      else SC.key('act');
    },
    // The light is allowed to start down the castle and no further. `stop`
    // is the sweep the film cuts away at - the trailer never shows it land.
    beam: (s, r) => {
      const g = r.g;
      if (!g) return;
      if (!g.__set) { g.__set = 1; g.mir = s.mir.map((m) => m.slice()); }
      if (!g.open && !g.win && s.t >= s.openAt) { g.t = s.openT; g.alarm = 0; g.open = 1; g.sweep = 0; }
      if (s.stop && g.sweep > s.stop) g.sweep = s.stop;
    },
  };

  window.__tick = (s) => {
    // The snapshot has to happen BEFORE the step: at this instant the canvas
    // still holds the last frame of the shot that just ended.
    if (s.snap) {
      pctx.clearRect(0, 0, prev.width, prev.height);
      pctx.drawImage(canvas, 0, 0);
    }
    prev.style.opacity = s.pop;
    prev.style.transformOrigin = `${s.pox}% ${s.poy}%`;
    prev.style.transform = `scale(${s.ppush})`;
    scrim.style.opacity = s.scrim;
    white.style.opacity = s.white;
    card.textContent = s.text || '';
    card.style.opacity = s.card;
    card.style.fontSize = s.size + 'px';
    card.style.color = s.color;
    canvas.style.transformOrigin = `${s.ox}% ${s.oy}%`;
    canvas.style.transform = `scale(${s.push})`;
    drawDust(s.vt, s.dust);
    if (s.drv) DRIVERS[s.drv](s, SC.r);
    window.__pump(s.dtMs);
    const r = SC.r;
    return { id: r.id, phase: r.phase, sweep: r.g ? +(r.g.sweep ?? -1).toFixed(2) : -1 };
  };
});

// --- the recorder side ----------------------------------------------------
let frame = 0, vt = 0;
const cuts = [], marks = [];
const stage = (fn, arg) => page.evaluate(fn, arg);

const ease = (u, kind) => (kind === 'lin' ? u
  : kind === 'in' ? u * u
    : kind === 'io' ? (u < .5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u))
      : 1 - (1 - u) * (1 - u));
const lerp = (a, b2, k) => a + (b2 - a) * k;

// Where the outgoing shot's camera finished, so the frozen overlay can go
// on travelling in the same direction while it fades.
let out = { ox: 50, oy: 50, push: 1 };

// One shot.
//   beats   length, always a whole number of them
//   dis     seconds of dissolve at the top of it (0 for the one hard cut)
//   focus   [x, y] in the game's own 320x156, what the push is about
//   push    [a, b] scale at the start and the end
//   dip     [in, out] seconds of black at either end, for an act break
async function shoot(s) {
  if (process.env.SC_UNTIL && cuts.some((c) => c.name === process.env.SC_UNTIL)) return;
  const at = +vt.toFixed(4);
  const dis = s.dis ?? 0.85;
  cuts.push({ name: s.name, at, beats: s.beats, dis, kind: s.text ? 'card' : 'shot', ...(s.mark ? { mark: s.mark } : {}) });
  if (s.mark) marks.push({ name: s.mark, at });
  if (s.vo) vos.push({ id: s.vo, at: +(at + (s.voAt ?? 0.2)).toFixed(4), dur: VO[s.vo].dur, who: VO[s.vo].who });
  if (s.stage) await stage(s.stage, s.arg);
  const n = Math.round(b(s.beats) * FPS);
  const f0 = s.focus || [160, 78], f1 = s.focus1 || f0;
  const [p0, p1] = s.push || [1, 1];
  const [dipIn, dipOut] = s.dip || [0, 0];
  const o = out;
  let info = null;
  for (let i = 0; i < n; i++) {
    const t = i * DT, u = n > 1 ? i / (n - 1) : 0, k = ease(u, s.ease);
    const dk = dis > 0 ? Math.min(1, t / dis) : 1;
    info = await page.evaluate((x) => window.__tick(x), {
      dtMs: DT * 1000,
      snap: i === 0,
      // The overlay holds full opacity for nothing and fades on a curve
      // that spends most of its time near the middle, which is what stops a
      // dissolve reading as a wipe of brightness.
      pop: dis > 0 ? Math.max(0, 1 - dk) ** 0.85 : 0,
      pox: o.ox, poy: o.oy, ppush: o.push * (1 + 0.035 * dk),
      scrim: Math.max(dipIn > 0 ? Math.max(0, 1 - t / dipIn) : 0,
        dipOut > 0 ? Math.max(0, (t - (b(s.beats) - dipOut)) / dipOut) : 0),
      white: s.flash ? Math.max(0, 1 - t / (s.flash * DT)) : 0,
      text: s.text || '',
      // A card fades up and down inside its own shot rather than cutting.
      card: s.text ? Math.min(1, t / 0.7, Math.max(0, (b(s.beats) - t) / 0.7)) : 0,
      size: s.size || 54, color: s.color || '#f3ead6',
      ox: lerp(f0[0], f1[0], k) / VW * 100, oy: lerp(f0[1], f1[1], k) / VH * 100,
      push: lerp(p0, p1, k),
      // The pollen runs on the film's own clock, not the shot's, so it
      // drifts continuously across a dissolve instead of restarting.
      vt: vt, dust: s.dust ?? 0.5,
      drv: s.drv || null, t, ...(s.drvArg || {}),
    });
    if (!DRY && (!PREVIEW || frame % PREVIEW === 0)) {
      await page.screenshot({ path: path.join(framesDir, `f${String(frame).padStart(6, '0')}.png`) });
    }
    frame++; vt += DT;
  }
  out = { ox: f1[0] / VW * 100, oy: f1[1] / VH * 100, push: p1 };
  console.log(`  ${(s.text ? '[card] ' + s.text.slice(0, 30) : s.name).padEnd(34)} ${at.toFixed(2)}s +${s.beats}b`
    + `${dis ? ` /${dis}` : '  CUT'}${s.vo ? '  ' + s.vo : ''}`);
}

const put = (id, patch) => stage(([id, patch]) => {
  const bt = window.SC.BEATS.find((x) => x.id === id);
  if (bt.card) { bt.__card = bt.card; delete bt.card; }
  window.SC.hard();
  window.SC.play(id, patch || {});
}, [id, patch]);

const intoGame = (id) => stage(([id]) => {
  const r = window.SC.r, bt = window.SC.BEATS.find((x) => x.id === id);
  r.phase = window.SC.P.GAME;
  r.g = window.SC.GAMES[bt.game].init(bt);
}, [id]);

console.log(`recording The Seventh Color  (${BPM}bpm, one beat = ${BEAT.toFixed(4)}s)`);

// =========================================================================
// I. THE WORLD AS IT WAS
// Fades up out of nothing, and from here to the horn there is not a single
// cut in the film.
// =========================================================================
await put('prologue', { phase: 6, cut: 4.0 });
await shoot({ name: 'bloom', beats: 6, dis: 0, dip: [1.6, 0], vo: 'n1', voAt: 1.1, mark: 'open', dust: 0.45,
  focus: [160, 72], push: [1.3, 1.02], ease: 'out' });

await put('jacks-glade', { phase: 0, line: 4 });
await shoot({ name: 'glade', beats: 5, dis: 1.0, vo: 'n2', dust: 0.95,
  focus: [150, 62], push: [1.22, 1.36], ease: 'lin' });

await put('unicorn-stream', { phase: 0, line: 0 });
await intoGame('unicorn-stream');
await shoot({ name: 'herd', beats: 6, dis: 1.0, vo: 'n3', dust: 0.9, drv: 'still', drvArg: { slipAt: 99 },
  focus: [206, 92], focus1: [232, 92], push: [1.5, 1.32], ease: 'lin' });
// A horn, as close as the film gets to anything.
await shoot({ name: 'horn', beats: 4, dis: 0.9, dust: 1.0, drv: 'still', drvArg: { slipAt: 99 },
  focus: [264, 84], push: [2.5, 2.9], ease: 'lin' });

// =========================================================================
// II. WHAT WANTED IT
// =========================================================================
await put('shadow-council', { phase: 0, line: 0 });
await shoot({ name: 'council', beats: 6, dis: 1.1, vo: 'd1', voAt: 0.75, mark: 'darkness1', dust: 0.25,
  focus: [166, 58], push: [1.12, 1.32], ease: 'out' });

await put('unicorn-stream', { phase: 0, line: 0 });
await intoGame('unicorn-stream');
await shoot({ name: 'creep', beats: 4, dis: 1.0, dust: 0.9, drv: 'still', drvArg: {}, mark: 'creep',
  focus: [150, 96], focus1: [200, 96], push: [1.4, 1.58], ease: 'in' });
await shoot({ name: 'reach', beats: 3, dis: 0.7, dust: 1.0, drv: 'still', drvArg: {},
  focus: [232, 94], push: [1.7, 1.95], ease: 'in' });

// THE ONE CUT IN THE FILM.
await shoot({
  name: 'shatter', beats: 5, dis: 0, flash: 3, mark: 'horn', dust: 0.15,
  stage: () => {
    const bt = window.SC.BEATS.find((x) => x.id === 'unicorn-stream');
    bt.cutscene.hold = 2.6;
    const r = window.SC.r;
    r.phase = window.SC.P.CUT; r.cut = 0; r.g = null;
  },
  focus: [160, 72], push: [1.0, 1.28], ease: 'in',
});
await shoot({
  name: 'snow', beats: 6, dis: 1.2, vo: 'd2', voAt: 0.9, mark: 'winter', dust: 0.1,
  stage: () => {
    const bt = window.SC.BEATS.find((x) => x.id === 'winter-comes');
    bt.cutscene.hold = 3.0;
    window.SC.hard();
    window.SC.play('winter-comes', { phase: window.SC.P.CUT, cut: 5.2 });
  },
  focus: [160, 86], push: [1.28, 1.06], ease: 'out',
});
await put('winter-falls', { phase: 0, line: 1 });
await shoot({ name: 'pond', beats: 4, dis: 1.0, dust: 0.3, focus: [110, 66], push: [1.2, 1.36], ease: 'lin' });
await shoot({ name: 'c1', text: 'she was already gone', beats: 4, dis: 1.0, size: 52, dust: 0, mark: 'gone' });

// =========================================================================
// III. THE ROAD
// Shorter units, but still dissolves - the film gets quicker without ever
// starting to cut.
// =========================================================================
await intoGame('winter-falls');
await shoot({ name: 'ice', beats: 3, dis: 0.75, vo: 'g1', voAt: 0.1, drv: 'crack', drvArg: { every: .26 },
  focus: [160, 110], push: [1.46, 1.32], ease: 'lin', mark: 'road' });
await put('hollow-armory', { phase: 0, line: 1 });
await shoot({ name: 'gump', beats: 3, dis: 0.75, dust: 0.7, focus: [84, 70], push: [1.32, 1.44], ease: 'lin' });
await put('bog-road', { phase: 0, line: 1 });
await intoGame('bog-road');
await shoot({ name: 'bog', beats: 3, dis: 0.75, drv: 'lights', drvArg: { every: .22 },
  focus: [160, 56], push: [1.36, 1.26], ease: 'lin' });
await put('megs-looking-glass', { phase: 0, line: 2 });
await shoot({ name: 'meg', beats: 3, dis: 0.75, dust: 0.6, focus: [274, 52], push: [1.34, 1.48], ease: 'lin' });
await put('root-door', { phase: 0, line: 1 });
await shoot({ name: 'roots', beats: 3, dis: 0.75, dust: 0.5, focus: [160, 74], push: [1.26, 1.38], ease: 'lin' });
await put('gown-that-breathes', { phase: 0, line: 2 });
await shoot({ name: 'hall', beats: 3, dis: 0.8, dust: 0.3, focus: [160, 60], push: [1.2, 1.34], ease: 'lin' });

// =========================================================================
// IV. THE OFFER, AND WHAT IT IS ANSWERED WITH
// Nobody wins anything here. Three people say three things and the film
// leaves it standing.
// =========================================================================
await put('hidden-hand', { phase: 0, line: 0 });
await shoot({ name: 'throne', beats: 6, dis: 1.0, vo: 'd3', voAt: 0.6, mark: 'offer', dust: 0.2,
  focus: [226, 56], push: [1.26, 1.46], ease: 'lin' });
await shoot({ name: 'jack', beats: 5, dis: 0.9, vo: 'j1', voAt: 0.5, dust: 0.2,
  focus: [96, 74], push: [1.36, 1.52], ease: 'lin' });
await put('false-sacrifice', { phase: 0, line: 1 });
await shoot({ name: 'lili', beats: 6, dis: 0.9, vo: 'l1', voAt: 0.5, mark: 'refuse', dust: 0.2,
  focus: [96, 76], push: [1.38, 1.54], ease: 'lin' });

// The route is real, searched for the way it always was - but the film
// opens the shaft and then walks out of the room. `stop` holds the sweep
// short of the wall it would otherwise reach.
const beamPlan = await stage(() => {
  const bt = window.SC.BEATS.find((x) => x.id === 'final-beam');
  const G = window.SC.GAMES.dungeon;
  const cells = [];
  for (let c = 0; c < bt.g.cols; c++) for (let r = 0; r < bt.g.rows; r++) cells.push([c, r]);
  const guards = bt.g.guards;
  bt.g.guards = [];
  let mir = null;
  for (let trial = 0; trial < 60000 && !mir; trial++) {
    const st = G.init(bt);
    const k = 1 + Math.floor(Math.random() * bt.g.mirrors);
    for (let i = 0; i < k; i++) {
      const [c, r] = cells[Math.floor(Math.random() * cells.length)];
      if (st.mir.some((m) => m[0] === c && m[1] === r)) continue;
      st.mir.push([c, r, Math.random() < .5 ? 0 : 1]);
    }
    const keep = st.mir.map((m) => m.slice());
    st.open = 1; st.sweep = 0;
    G.update(st, bt, 2.2, {});
    if (st.win) mir = keep;
  }
  bt.g.guards = guards;
  if (!mir) return null;
  for (let openT = 0; openT < 30; openT += 1 / 30) {
    const st = G.init(bt);
    st.mir = mir.map((m) => m.slice());
    st.t = openT; st.open = 1; st.sweep = 0; st.alarm = 0;
    for (let f = 0; f < 60; f++) {
      G.update(st, bt, 1 / 30, {});
      if (st.win) return { mir, openT: +openT.toFixed(4) };
      if (!st.open) break;
    }
  }
  return { mir, openT: 0 };
});
if (!beamPlan) {
  console.error('no route to Darkness found');
  await browser.close();
  process.exit(1);
}
console.log(`  beam: ${beamPlan.mir.length} bucklers, shaft opens at t=${beamPlan.openT.toFixed(2)}`);

await put('final-beam', { phase: 0, line: 1 });
await intoGame('final-beam');
await shoot({
  name: 'castle', beats: 6, dis: 0.9, vo: 'd4', voAt: 0.55, mark: 'mirrors', dust: 0.18,
  drv: 'beam', drvArg: { mir: beamPlan.mir, openAt: 99, openT: 0, stop: 0 },
  focus: [160, 70], push: [1.3, 1.14], ease: 'lin',
});
// The light starts. The film does not stay to watch it arrive.
await shoot({
  name: 'shaft', beats: 4, dis: 0.8, mark: 'shaft', dust: 0.35,
  drv: 'beam', drvArg: { mir: beamPlan.mir, openAt: 0.05, openT: beamPlan.openT, stop: 0.55 },
  focus: [160, 62], focus1: [130, 74], push: [1.16, 1.44], ease: 'in',
  dip: [0, 1.1],
});

// =========================================================================
// V. THE MONOLOGUE
// The last voice in this kind of trailer is the antagonist's, and what he
// says is appetite rather than outcome. Three lines, all his, over the
// rings the film opened on - so the picture comes back to where it started
// while the words go somewhere the picture never does.
// =========================================================================
await put('prologue', { phase: 6, cut: 5.5 });
await shoot({
  name: 'close1', beats: 7, dis: 0, dip: [1.3, 0], vo: 'd5', voAt: 1.0, mark: 'close',
  focus: [160, 72], push: [1.02, 1.18], ease: 'lin', dust: 0.35,
});
await shoot({
  name: 'close2', beats: 8, dis: 1.6, dip: [0, 1.4], vo: 'd6', voAt: 1.3, mark: 'last',
  focus: [160, 72], push: [1.3, 1.02], ease: 'out', dust: 0.2,
});

await browser.close();
const end = +vt.toFixed(4);
writeFileSync(path.join(outDir, 'beats.json'), JSON.stringify({
  fps: FPS, bpm: BPM, beat: BEAT, cuts, marks, vo: vos, cues: { end }, duration: frame / FPS,
}, null, 2));
console.log(`wrote ${frame} frames to ${path.relative(root, framesDir)} @ ${FPS}fps (${(frame / FPS).toFixed(2)}s, ${cuts.length} shots)`);

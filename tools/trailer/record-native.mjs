// The Seventh Color, cut as a trailer.
//
//   node tools/trailer/record-native.mjs        (full, 1920x1080)
//   SC_PREVIEW=n   every nth frame, half size - the shape of the cut in minutes
//   SC_UNTIL=name  stop after that shot
//
// The grammar is the one a film trailer uses, not the one a game uses.
//
//   THE INTERFACE IS OFF. `SCH` (a DEV hook) stops the game narrating
//   itself - no dialogue panel, no choice list, no status strips over the
//   mechanics. What is left is the picture, and four voices say the lines
//   over it: a narrator, Darkness, Jack and Lili, generated with ElevenLabs
//   by audio/voice-native.mjs. Every word any of them says is a line out of
//   native/src/data.js, trimmed the way a trailer trims a script. Cards are
//   down to four - the one nobody says, and the three the film wants both
//   said AND written.
//
//   THE VOICE SETS THE LENGTHS. audio/vo/vo.json carries each line's
//   measured seconds; every shot below is long enough for the line laid on
//   it, rounded up to the beat. A line may run over a cut - a sentence
//   bridging two images is the oldest trick in the form - but never over a
//   section boundary.
//
//   EVERYTHING IS ON A GRID. One beat is 0.6522s (92bpm) and every shot is
//   a whole number of them, so every cut lands on a beat and the score
//   (audio/render-native.py) can put a hit on every cut. That is the whole
//   difference between a montage and a trailer: the picture and the drum
//   are the same event.
//
//   THE UNITS SHORTEN. Five and six beats through the setup, four and three
//   through the winter, two and three down the road, one and two in the
//   drop. Nothing else makes a cut feel like it is accelerating.
//
//   THREE STOPS. Silence before the horn breaks, silence before "you were
//   never the night", and the black beat between the last two cards. A
//   trailer is mostly loud, so the only way anything in it can be loud is
//   for something to be quiet first.
//
// The resolution trick is the same as the game deserves: `SCX` scales the
// backing store and the base matrix so every painter draws at eight times
// 320x156, and the film is crisp line art rather than a six-times upscale
// of a bitmap. It also means the pushes have real pixels to eat into, and
// with the interface off they can be big - a portrait game photographs as
// portraits, and a trailer frames faces.
//
// Frame-stepped, never real time: rAF, performance.now and setTimeout are a
// virtual clock the recorder pumps. beats.json goes out beside the frames
// with every cut's second, and the score is arranged to those numbers.
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
const VW = 320, VH = 156, SCX = 8;
// 92 to the minute. Chosen because 0.6522s is about as long as a card can
// be on screen and still feel cut rather than held, and four of them is a
// comfortable length for one to be read.
const BPM = 92, BEAT = 60 / BPM;
const b = (n) => n * BEAT;

// What the voices actually came out at. The cut is built on these numbers.
const VO = JSON.parse(readFileSync(path.join(outDir, 'audio', 'vo', 'vo.json'), 'utf8'));
const vos = [];

rmSync(framesDir, { recursive: true, force: true });
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
  const el = (css) => { const n = document.createElement('div'); n.style.cssText = css; document.body.appendChild(n); return n; };
  // Measured off the canvas rather than typed in: 72px at 1080, 36 at a
  // half-size preview, and a preview that crops what the render will not is
  // a preview that sends you fixing things that are not broken.
  const bar = Math.round(canvas.getBoundingClientRect().top);
  el(`position:fixed;left:0;right:0;top:0;height:${bar}px;background:#000;z-index:900`);
  el(`position:fixed;left:0;right:0;bottom:0;height:${bar}px;background:#000;z-index:900`);
  // A scrim for the cards that sit over the picture, black for the ones
  // that do not, and white for the two frames where the light lands.
  const scrim = el('position:fixed;inset:0;background:#000;opacity:0;pointer-events:none;z-index:901');
  const white = el('position:fixed;inset:0;background:#fff;opacity:0;pointer-events:none;z-index:903');
  // The type. Uppercase, heavy, and letter-spaced wide enough to read as a
  // caption on a poster rather than a subtitle on a video - which is the
  // one typographic decision that separates the two kinds of film.
  const card = el('position:fixed;inset:0;display:flex;align-items:center;justify-content:center;'
    + 'text-align:center;padding:0 9%;opacity:0;pointer-events:none;z-index:902;'
    + "font-family:system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;"
    + 'font-weight:700;text-transform:uppercase;letter-spacing:.19em;line-height:1.24;'
    + 'color:#f3ead6;text-shadow:0 3px 40px rgba(0,0,0,.9)');

  const SC = window.SC;

  const DRIVERS = {
    // Hold SPACE only while the heads are down. One scripted slip, because
    // a creep that never nearly fails does not read as a creep.
    still: (s, r) => {
      const g = r.g;
      if (!g) return;
      const slip = s.slipAt && s.t > s.slipAt && s.t < s.slipAt + .3;
      SC.hold('act', g.spooked > 0 ? false : slip ? true : window.SCSAFE(g.t));
    },
    // One-dimensional Lights Out. Sweep left to right and strike whenever
    // the pane behind the cursor is still whole: that fixes it and never
    // touches anything already finished to its left.
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
    // The route was searched for at stage time; the shaft opens at the one
    // moment the patrol allows it, on the clock the search won at.
    beam: (s, r) => {
      const g = r.g;
      if (!g) return;
      if (!g.__set) { g.__set = 1; g.mir = s.mir.map((m) => m.slice()); }
      if (!g.open && !g.win && s.t >= s.openAt) { g.t = s.openT; g.alarm = 0; g.open = 1; g.sweep = 0; }
      // The mechanic hands the scene back a second after it is won, and
      // what it hands back is the throne room with nobody in it. The film
      // wants the frame the light is IN, held: clamped just under the
      // threshold the update returns true on, the whole beam stays lit and
      // Darkness stays ringed for as long as the shot needs.
      if (g.win > 0.9) g.win = 0.9;
    },
    pick: (s, r) => {
      if (r.choiceIndex === s.want || s.t < (r.__next || 0)) return;
      r.__next = s.t + .3;
      SC.key('right');
    },
  };

  window.__tick = (s) => {
    scrim.style.opacity = s.scrim;
    white.style.opacity = s.white;
    card.textContent = s.text || '';
    card.style.opacity = s.card;
    card.style.fontSize = s.size + 'px';
    card.style.color = s.color;
    card.style.transform = `scale(${s.tscale})`;
    // Horizontally the push is about the shot's subject. Vertically it is
    // about the middle now that nothing is written along the bottom edge -
    // this game photographs as portraits and a trailer frames faces.
    canvas.style.transformOrigin = `${s.ox}% ${s.oy}%`;
    canvas.style.transform = `scale(${s.push})`;
    if (s.drv) DRIVERS[s.drv](s, SC.r);
    window.__pump(s.dtMs);
    const r = SC.r;
    return { id: r.id, phase: r.phase, win: r.g ? (r.g.win || 0) : -1, near: r.g ? (r.g.near ?? -1) : -1 };
  };
});

// --- the recorder side ----------------------------------------------------
let frame = 0, vt = 0;
const cuts = [];                    // every cut, for the score to hit
const marks = [];                   // the named ones the score cares about
const stage = (fn, arg) => page.evaluate(fn, arg);

const ease = (u, kind) => (kind === 'lin' ? u
  : kind === 'in' ? u * u
    : kind === 'io' ? (u < .5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u))
      : 1 - (1 - u) * (1 - u));
const lerp = (a, b2, k) => a + (b2 - a) * k;

// One shot. Either a card (`text`) or a picture, both cut hard in and hard
// out; the only thing that ever fades is the head of the film and its tail.
//
//   beats   length, always a whole number of them
//   focus   [x, y] in the game's own 320x156, what the push is about
//   push    [a, b] scale at the start and the end
//   flash   a white frame or two at the top of the shot
async function shoot(s) {
  if (process.env.SC_UNTIL && cuts.some((c) => c.name === process.env.SC_UNTIL)) return;
  const at = +vt.toFixed(4);
  cuts.push({ name: s.name, at, beats: s.beats, kind: s.text ? 'card' : 'shot', ...(s.mark ? { mark: s.mark } : {}) });
  if (s.mark) marks.push({ name: s.mark, at });
  // A line is placed at the cut it belongs to, plus whatever lead-in the
  // shot asks for. The score reads these back and ducks the music under them.
  if (s.vo) vos.push({ id: s.vo, at: +(at + (s.voAt ?? 0.12)).toFixed(4), dur: VO[s.vo].dur, who: VO[s.vo].who });
  if (s.stage) await stage(s.stage, s.arg);
  const n = Math.round(b(s.beats) * FPS);
  const f0 = s.focus || [160, 78], f1 = s.focus1 || f0;
  const [p0, p1] = s.push || [1, 1];
  const [t0, t1] = s.tscale || [1, 1];
  let info = null;
  for (let i = 0; i < n; i++) {
    const t = i * DT, u = n > 1 ? i / (n - 1) : 0, k = ease(u, s.ease);
    info = await page.evaluate((x) => window.__tick(x), {
      dtMs: DT * 1000,
      // A card cuts in over one frame rather than popping, and holds. Its
      // ground is the scrim: full black for the ones between images, a
      // wash for the ones laid over a shot.
      scrim: s.text ? Math.min(1, t / 0.04) * (s.over ?? 1) : (s.scrim ?? 0),
      white: s.flash ? Math.max(0, 1 - t / (s.flash * DT)) : 0,
      text: s.text || '', card: s.text ? Math.min(1, t / 0.10) : 0,
      size: s.size || 62, color: s.color || '#f3ead6',
      tscale: lerp(t0, t1, u),
      ox: lerp(f0[0], f1[0], k) / VW * 100, oy: lerp(f0[1], f1[1], k) / VH * 100,
      push: lerp(p0, p1, k),
      drv: s.drv || null, t, ...(s.drvArg || {}),
    });
    if (!PREVIEW || frame % PREVIEW === 0) {
      await page.screenshot({ path: path.join(framesDir, `f${String(frame).padStart(6, '0')}.png`) });
    }
    frame++; vt += DT;
  }
  console.log(`  ${(s.text ? '[card] ' + s.text.slice(0, 34) : s.name).padEnd(40)} ${at.toFixed(2)}s +${s.beats}b`);
}

// Put the story where a shot needs it. Always a hard arrival - the game's
// own dissolves and location cards are a game's grammar, and this film has
// its own.
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

const card = (name, text, beats, o = {}) => shoot({ name, text, beats, ...o });

console.log(`recording The Seventh Color  (${BPM}bpm, one beat = ${BEAT.toFixed(4)}s)`);

// =========================================================================
// ACT ONE - what there was
// The narrator over four pictures. No cards here: he is saying the words,
// and a card that repeats a line being spoken is a subtitle with ambitions.
// =========================================================================
await put('prologue', { phase: 6, cut: 4.0 });
await shoot({ name: 'bloom', beats: 7, vo: 'n1', voAt: 0.55, mark: 'open',
  focus: [160, 72], push: [1.34, 1.02], ease: 'out' });

await put('jacks-glade', { phase: 0, line: 4 });
await shoot({ name: 'glade', beats: 5, vo: 'n2',
  focus: [150, 62], push: [1.26, 1.4], ease: 'lin' });

await put('unicorn-stream', { phase: 0, line: 0 });
await intoGame('unicorn-stream');
await shoot({ name: 'herd', beats: 7, vo: 'n3', drv: 'still', drvArg: { slipAt: 99 },
  focus: [232, 94], focus1: [200, 94], push: [1.5, 1.3], ease: 'lin' });

// His hall, and the first thing in the film that is enjoying itself.
await put('shadow-council', { phase: 0, line: 0 });
await shoot({ name: 'council', beats: 6, vo: 'd1', mark: 'darkness1',
  focus: [166, 58], push: [1.16, 1.36], ease: 'out' });

// =========================================================================
// THE BREAK
// =========================================================================
await put('unicorn-stream', { phase: 0, line: 0 });
await intoGame('unicorn-stream');
await shoot({ name: 'creep', beats: 4, drv: 'still', drvArg: {}, mark: 'creep',
  focus: [150, 96], focus1: [200, 96], push: [1.42, 1.6], ease: 'in' });
await shoot({ name: 'reach', beats: 3, drv: 'still', drvArg: {},
  focus: [232, 94], push: [1.7, 1.9], ease: 'in' });
await shoot({
  name: 'shatter', beats: 5, flash: 3, mark: 'horn',
  stage: () => {
    const bt = window.SC.BEATS.find((x) => x.id === 'unicorn-stream');
    bt.cutscene.hold = 2.6;
    const r = window.SC.r;
    r.phase = window.SC.P.CUT; r.cut = 0; r.g = null;
  },
  focus: [160, 72], push: [1.0, 1.26], ease: 'in',
});
// And he is still amused about it, over the snow.
await shoot({
  name: 'snow', beats: 7, vo: 'd2', voAt: 0.5, mark: 'winter',
  stage: () => {
    const bt = window.SC.BEATS.find((x) => x.id === 'winter-comes');
    bt.cutscene.hold = 3.0;
    window.SC.hard();
    window.SC.play('winter-comes', { phase: window.SC.P.CUT, cut: 5.2 });
  },
  focus: [160, 86], push: [1.3, 1.06], ease: 'out',
});
await put('winter-falls', { phase: 0, line: 1 });
await shoot({ name: 'pond', beats: 4, focus: [110, 66], push: [1.24, 1.4], ease: 'lin' });
await card('c1', 'she was already gone', 3, { size: 62, mark: 'gone' });

// =========================================================================
// ACT TWO - the road
// =========================================================================
await intoGame('winter-falls');
await shoot({ name: 'ice', beats: 3, vo: 'g1', drv: 'crack', drvArg: { every: .26 },
  focus: [160, 110], push: [1.5, 1.34], ease: 'lin', mark: 'road' });
await put('hollow-armory', { phase: 0, line: 1 });
await shoot({ name: 'gump', beats: 2, focus: [84, 70], push: [1.36, 1.46], ease: 'lin' });
await put('bog-road', { phase: 0, line: 1 });
await intoGame('bog-road');
await shoot({ name: 'bog', beats: 2, drv: 'lights', drvArg: { every: .22 },
  focus: [160, 56], push: [1.4, 1.3], ease: 'lin' });
await put('megs-looking-glass', { phase: 0, line: 2 });
await shoot({ name: 'meg', beats: 2, focus: [274, 52], push: [1.38, 1.5], ease: 'lin' });
await put('root-door', { phase: 0, line: 1 });
await shoot({ name: 'roots', beats: 2, focus: [160, 74], push: [1.3, 1.4], ease: 'lin' });
await put('gown-that-breathes', { phase: 0, line: 2 });
await shoot({ name: 'hall', beats: 2, focus: [160, 60], push: [1.24, 1.36], ease: 'lin' });

// The offer, the refusal, and her answer to the same offer.
await put('hidden-hand', { phase: 0, line: 0 });
await shoot({ name: 'throne', beats: 6, vo: 'd3', mark: 'offer',
  focus: [226, 56], push: [1.3, 1.5], ease: 'lin' });
await shoot({ name: 'jack', beats: 5, vo: 'j1',
  focus: [96, 74], push: [1.4, 1.56], ease: 'lin' });
await card('c2', 'dawn needs no throne', 3, { size: 64, color: '#e8b923', vo: 'j2', mark: 'refuse' });
await put('false-sacrifice', { phase: 0, line: 1 });
await shoot({ name: 'lili', beats: 6, vo: 'l1',
  focus: [96, 76], push: [1.42, 1.58], ease: 'lin' });

// =========================================================================
// THE DROP
// =========================================================================
await put('megs-looking-glass', { phase: 0, line: 2 });
await intoGame('megs-looking-glass');
await shoot({ name: 'mirror', beats: 1, focus: [160, 70], push: [1.34, 1.4], ease: 'lin', mark: 'drop' });
await put('winter-falls', { phase: 0, line: 1 });
await intoGame('winter-falls');
await shoot({ name: 'ice2', beats: 1, drv: 'crack', drvArg: { every: .18 },
  focus: [200, 110], push: [1.66, 1.72], ease: 'lin' });
await put('bog-road', { phase: 0, line: 1 });
await intoGame('bog-road');
await shoot({ name: 'bog2', beats: 1, drv: 'lights', drvArg: { every: .16 },
  focus: [160, 56], push: [1.5, 1.56], ease: 'lin' });
await shoot({
  name: 'causeway', beats: 2,
  stage: () => {
    const bt = window.SC.BEATS.find((x) => x.id === 'edge-of-world');
    bt.cutscene.hold = 3.1;
    if (bt.card) { bt.__card = bt.card; delete bt.card; }
    window.SC.hard();
    window.SC.play('edge-of-world', { phase: window.SC.P.CUT, cut: 3.4 });
  },
  focus: [160, 78], push: [1.2, 1.34], ease: 'lin',
});

// The finale of the game, played. The route is searched for twice - once
// with the patrol off the board for a route that works geometrically, then
// frame by frame from every candidate second until one gets the whole beam
// down before anybody walks into it - and he is mocking the trick right up
// to the frame it works.
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
  name: 'castle', beats: 6, vo: 'd4', drv: 'beam', drvArg: { mir: beamPlan.mir, openAt: 99, openT: 0 },
  focus: [160, 70], push: [1.34, 1.16], ease: 'lin', mark: 'mirrors',
});
await shoot({
  name: 'beam', beats: 3, drv: 'beam',
  drvArg: { mir: beamPlan.mir, openAt: 0.05, openT: beamPlan.openT },
  focus: [160, 60], focus1: [110, 92], push: [1.16, 1.42], ease: 'in', mark: 'shaft',
});
await shoot({
  name: 'land', beats: 4, flash: 4, mark: 'land',
  drv: 'beam', drvArg: { mir: beamPlan.mir, openAt: 1e9, openT: 0 },
  focus: [58, 96], focus1: [80, 88], push: [2.0, 1.55], ease: 'out',
});
await card('c3', 'you were never the night', 4, { size: 62, vo: 'j3a' });
// The one black beat in the film.
await shoot({ name: 'hold', beats: 1, text: ' ', size: 62, mark: 'hold' });
await card('c4', 'you were only its shadow', 4, { size: 62, color: '#e8b923', vo: 'j3b', voAt: 0.2 });

// =========================================================================
// THE DAWN
// =========================================================================
await shoot({
  name: 'dawn', beats: 8, vo: 'n4', voAt: 0.9, mark: 'dawn',
  stage: () => {
    const bt = window.SC.BEATS.find((x) => x.id === 'epilogue');
    bt.cutscene.hold = 3.4;
    window.SC.hard();
    window.SC.play('epilogue', { phase: window.SC.P.CUT, cut: 7.6 });
  },
  focus: [160, 74], push: [1.36, 1.04], ease: 'out',
});
await shoot({
  name: 'last', beats: 7, vo: 'n5', voAt: 0.35, mark: 'named',
  focus: [160, 74], push: [1.04, 1.18], ease: 'lin',
  stage: () => { window.SC.set({ cut: 12.4 }); },
});

await browser.close();
const end = +vt.toFixed(4);
writeFileSync(path.join(outDir, 'beats.json'), JSON.stringify({
  fps: FPS, bpm: BPM, beat: BEAT, cuts, marks, vo: vos, cues: { end }, duration: frame / FPS,
}, null, 2));
console.log(`wrote ${frame} frames to ${path.relative(root, framesDir)} @ ${FPS}fps (${(frame / FPS).toFixed(2)}s, ${cuts.length} cuts)`);

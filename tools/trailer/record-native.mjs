// The Seventh Color, cut into a trailer.
//
//   node tools/trailer/record-native.mjs        (full, 1920x1080)
//   SC_PREVIEW=n   every nth frame, half size - the shape of the cut in minutes
//   SC_UNTIL=name  stop after that shot
//
// This game is not the other two. Fireball and Snap are worlds you point a
// camera at; this is a story told in portraits, painted rooms and prose,
// and its own writing is better than anything a trailer would put on top of
// it. So there is no narration track, no invented copy and no title cards
// but the game's own: every word in the film is a line the game says, and
// the cut's whole job is to choose which ones and hold them for the right
// length of time.
//
// Three things make that watchable rather than a slideshow of subtitles.
//
//   1. RESOLUTION. The game is 320x156 of vector work - flat polygons and
//      system-ui type - and a six-times upscale of that is mush. `SCX` is a
//      DEV hook in native/src/main.js that scales the backing store and the
//      base matrix, so every painter draws at eight times the size and the
//      film is crisp line art rather than a blown-up bitmap.
//   2. MOVEMENT. A portrait scene has no camera, so the trailer gives it
//      one: a slow push on the face that is speaking, done as a CSS
//      transform-origin on the canvas, which is why SCX is 8 and not 6 -
//      the push has real pixels to eat into.
//   3. PACE. The first act breathes (three lines of prologue over eleven
//      seconds); the road after the winter is cut hard and fast, with the
//      game's own location cards suppressed so nothing stops to announce
//      itself; the finale breathes again.
//
// The mechanics are played, not faked. The stillness creep holds SPACE only
// while the herd's heads are down and takes the spook when it gets it
// wrong; the ice is actually solved (it is a one-dimensional Lights Out and
// the solver is eight lines); the bog gets one wrong order and then the
// right one; and the finale's beam is a real route through a real patrol -
// searched for here, twice, because a route that works geometrically still
// has to get past two guards, and finding the moment when it does is
// exactly what that mechanic is about.
//
// Frame-stepped, never real time: requestAnimationFrame, performance.now
// and setTimeout are replaced by a virtual clock the recorder pumps, so a
// screenshot that takes 200ms of wall time is still one 30fps frame of
// story. beats.json goes out beside the frames with every shot's start
// second, and the score (audio/render-native.py) is arranged to those
// numbers rather than the other way round.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
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
// The game is 320x156 - a hair over 2:1 - so at 1920 wide it is 936 tall
// and the frame keeps 72px of black top and bottom. That is not a
// compromise, it is the aspect the game was drawn in, and it reads as
// scope. The bars are drawn over the picture rather than around it so the
// push can overshoot the canvas box without spilling into them.
const VW = 320, VH = 156, SCX = 8;

rmSync(framesDir, { recursive: true, force: true });
mkdirSync(framesDir, { recursive: true });
mkdirSync(path.join(outDir, 'audio'), { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: PREVIEW ? { width: 960, height: 540 } : { width: 1920, height: 1080 } });
page.on('pageerror', (e) => console.error('PAGE ERROR:', e.message));

await page.addInitScript(([SCX]) => {
  window.SCX = SCX;
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
  // The game starts its audio on the first press and never gets one here -
  // but setInterval is the tracker's pump, and leaving a real one running
  // under a virtual clock is a thread doing nothing at forty times a second
  // for the length of a render.
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

// --- the page side --------------------------------------------------------
// Everything the recorder does in a frame goes through one __tick: the
// camera, the fade, the driver that is playing a mechanic, and the step.
// They have to happen in that order inside one round trip, or the frame
// that gets photographed is a mix of two.
await page.evaluate(() => {
  document.body.style.background = '#000';
  const canvas = document.getElementById('c');
  canvas.style.willChange = 'transform';
  const el = (css) => { const n = document.createElement('div'); n.style.cssText = css; document.body.appendChild(n); return n; };
  // Over the picture, not around it: the push scales the canvas about a
  // point and the overshoot has to go somewhere. Measured off the canvas
  // rather than typed in - at 1080 the bars are 72px and at a half-size
  // preview they are 36, and a preview that crops what the render will not
  // is a preview that sends you fixing things that are not broken.
  const box = canvas.getBoundingClientRect();
  const bar = Math.round(box.top);
  el(`position:fixed;left:0;right:0;top:0;height:${bar}px;background:#000;z-index:900`);
  el(`position:fixed;left:0;right:0;bottom:0;height:${bar}px;background:#000;z-index:900`);
  const black = el('position:fixed;inset:0;background:#000;opacity:1;pointer-events:none;z-index:901');

  const SC = window.SC;
  const G = SC.GAMES;

  // --- drivers: one per mechanic, each playing it the way it is meant to
  // be played. None of them writes a win; they press the keys.
  const DRIVERS = {
    // Hold SPACE while the heads are down, and only then. Reading the
    // spook instead - hold, get caught, let go - is a film of somebody
    // learning the rule the hard way for six seconds, and the meter
    // barely climbs. One deliberate mistake is scripted at `slipAt`,
    // because a creep that never nearly fails does not read as a creep.
    still: (s, r) => {
      const g = r.g;
      if (!g) return;
      const slip = s.slipAt && s.t > s.slipAt && s.t < s.slipAt + .3;
      SC.hold('act', g.spooked > 0 ? false : slip ? true : window.SCSAFE(g.t));
    },

    // One-dimensional Lights Out: a strike flips a pane and its two
    // neighbours. Sweep left to right; whenever the pane behind the cursor
    // is still whole, strike - that fixes it and never touches anything
    // already finished to its left. Eight lines, always correct.
    crack: (s, r) => {
      const g = r.g;
      if (!g) return;
      if (s.t < (g.__next || 0)) return;
      g.__next = s.t + (s.every ?? .34);
      const target = g.cells.findIndex((c, i) => !c && i < g.n - 1);
      const want = target < 0 ? g.n - 1 : target + 1;
      if (g.sel < want) SC.key('right');
      else if (g.sel > want) SC.key('left');
      else SC.key('act');
    },

    // The bog answers with how many you placed right, so the film shows a
    // wrong order scored, and then the right one. `secret` is the answer;
    // the first pass deliberately swaps two of it.
    lights: (s, r) => {
      const g = r.g;
      if (!g) return;
      if (s.t < (g.__next || 0)) return;
      g.__next = s.t + (s.every ?? .3);
      const order = g.history.length ? g.secret : g.secret.map((v, i, a) => (i === 0 ? a[1] : i === 1 ? a[0] : v));
      const want = order[g.guess.length];
      if (want === undefined) return;
      if (g.cursor !== want) SC.key(g.cursor < want ? 'right' : 'left');
      else SC.key('act');
    },

    // The beam: the mirrors were searched for at stage time and are placed
    // here so the film can see the route, then the shaft opens at the one
    // moment the patrol allows it. `t` is pinned to the value the search
    // won at, because the guards are a function of it.
    beam: (s, r) => {
      const g = r.g;
      if (!g) return;
      if (!g.__set) { g.__set = 1; g.mir = s.mir.map((m) => m.slice()); }
      if (!g.open && !g.win && s.t >= s.openAt) { g.t = s.openT; g.alarm = 0; g.open = 1; g.sweep = 0; }
    },

    // The choice list: let it sit on the wrong answer long enough to read,
    // then walk down to the one the story takes.
    pick: (s, r) => {
      if (r.choiceIndex === s.want) return;
      if (s.t < (r.__next || 0)) return;
      r.__next = s.t + .42;
      SC.key('right');
    },
  };

  window.__tick = (s) => {
    black.style.opacity = s.black;
    // A push is a scale about a point. Horizontally that point is the shot's
    // subject - the face that is talking, the pane that is breaking. Vertically
    // it is always the bottom edge, because everything this game says is written
    // in the bottom thirty pixels and a push about the middle walks the last
    // line of a choice list straight out under the letterbox.
    canvas.style.transformOrigin = `${s.ox}% 100%`;
    canvas.style.transform = `scale(${s.push})`;
    if (s.drv) DRIVERS[s.drv](s, SC.r);
    window.__pump(s.dtMs);
    const r = SC.r;
    return { id: r.id, phase: r.phase, line: r.line, cut: +r.cut.toFixed(3), win: r.g ? (r.g.win || 0) : -1, near: r.g ? (r.g.near ?? -1) : -1 };
  };
});

// --- the recorder side ----------------------------------------------------
let frame = 0, vt = 0;
const cues = {}, marks = [];
const stage = (fn, arg) => page.evaluate(fn, arg);

const ease = (u, kind) => (kind === 'lin' ? u
  : kind === 'in' ? u * u
    : kind === 'io' ? (u < .5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u))
      : 1 - (1 - u) * (1 - u));
const lerp = (a, b, k) => a + (b - a) * k;

// A shot: a beat put where the film needs it, a length, a push, and
// whichever driver is playing the mechanic underneath.
//
//   focus [x, y]   in the game's own 320x156 coordinates
//   push  [a, b]   scale at the start and the end
//   black (t) =>   the fade, for the two places the film makes its own
async function shoot(shot) {
  if (process.env.SC_UNTIL && cues[process.env.SC_UNTIL] !== undefined) return;
  cues[shot.name] = +vt.toFixed(4);
  if (shot.stage) await stage(shot.stage, shot.arg);
  const n = Math.round(shot.dur * FPS);
  const f0 = shot.focus || [160, 70], f1 = shot.focus1 || f0;
  const [p0, p1] = shot.push || [1, 1];
  let info = null;
  for (let i = 0; i < n; i++) {
    const t = i * DT, u = n > 1 ? i / (n - 1) : 0, k = ease(u, shot.ease);
    for (const m of shot.marks || []) {
      if (t >= m.at && !m.__done) { m.__done = 1; marks.push({ name: m.name, at: +vt.toFixed(4) }); }
    }
    info = await page.evaluate((s) => window.__tick(s), {
      dtMs: DT * 1000, black: shot.black ? shot.black(t) : 0,
      ox: lerp(f0[0], f1[0], k) / VW * 100,
      push: lerp(p0, p1, k),
      drv: shot.drv || null, t, ...(shot.drvArg || {}),
    });
    if (!PREVIEW || frame % PREVIEW === 0) {
      await page.screenshot({ path: path.join(framesDir, `f${String(frame).padStart(6, '0')}.png`) });
    }
    frame++; vt += DT;
  }
  console.log(`  ${shot.name.padEnd(9)} ${cues[shot.name].toFixed(2)}s -> ${vt.toFixed(2)}s  ${JSON.stringify(info)}`);
}

// --- staging helpers ------------------------------------------------------
// Put the story exactly where a shot starts, without pressing space to get
// there. `hard` means arrive on a cut with no dissolve and no card; `card:
// false` keeps the dissolve but drops the location caption, which is how
// the road after the winter stays fast.
const put = (id, patch, opts = {}) => stage(([id, patch, opts]) => {
  const b = window.SC.BEATS.find((x) => x.id === id);
  if (opts.card === false && b.card) { b.__card = b.card; delete b.card; }
  if (opts.card === true && b.__card) b.card = b.__card;
  if (opts.hold) b.cutscene.hold = opts.hold;
  if (opts.hard) window.SC.hard();
  window.SC.play(id, patch);
}, [id, patch, opts]);

// A beat's game phase, entered directly.
const intoGame = (id) => stage(([id]) => {
  const r = window.SC.r, b = window.SC.BEATS.find((x) => x.id === id);
  r.phase = window.SC.P.GAME;
  r.g = window.SC.GAMES[b.game].init(b);
}, [id]);

console.log('recording The Seventh Color');

// =========================================================================
// I. WHAT THE WORLD LOST
// =========================================================================
// The game's own prologue, on its own veil: seven rings breathing outward
// on black while three sentences set up everything the film is about. The
// fourth line - Darkness wanting a night no morning could argue with - is
// deliberately left in the game and not used here; the cut says it instead,
// by putting him on screen.
const HOLD1 = 3.2;
await shoot({
  name: 'open', dur: HOLD1 * 3, ease: 'lin',
  stage: () => {
    const b = window.SC.BEATS.find((x) => x.id === 'prologue');
    b.cutscene.hold = 3.2;
    window.SC.hard();
    window.SC.play('prologue');
  },
  black: (t) => Math.max(0, 1 - t / 1.4),
  focus: [160, 72], focus1: [160, 72], push: [1.06, 1.0],
  marks: [{ at: HOLD1, name: 'open2' }, { at: HOLD1 * 2, name: 'open3' }],
});

// His hall, his card, his one line. The card is the game's own and it is
// the best thing a trailer could have written: a castle that eats its own
// light.
await put('shadow-council', { phase: 0, line: 0 });
await shoot({ name: 'council', dur: 4.9, focus: [166, 60], push: [1.0, 1.14], ease: 'out' });

// =========================================================================
// II. THE NIGHT IT BROKE
// =========================================================================
await put('jacks-glade', { phase: 0, line: 0 });
await shoot({ name: 'glade', dur: 4.4, focus: [150, 66], push: [1.0, 1.1], ease: 'out' });
// `blind: 3` is the line her blindfold goes on, so jumping to it is also
// the moment the gift happens.
await put('jacks-glade', { phase: 0, line: 3 }, { hard: true });
await shoot({ name: 'blind', dur: 2.8, focus: [220, 64], push: [1.16, 1.22], ease: 'lin' });
await put('jacks-glade', { phase: 0, line: 4 }, { hard: true });
await shoot({ name: 'trust', dur: 3.0, focus: [96, 68], push: [1.16, 1.22], ease: 'lin' });

// The stillness creep, played properly: hold while the heads are down,
// take one deliberate mistake, and finish. Straight into the mechanic -
// "keep still, they come to the water at moonrise" is a line the picture
// is already saying.
await put('unicorn-stream', { phase: 0, line: 0 });
await intoGame('unicorn-stream');
await shoot({ name: 'still', dur: 7.4, drv: 'still', drvArg: { slipAt: 1.4 }, focus: [200, 92], focus1: [150, 92], push: [1.12, 1.0], ease: 'io' });
await stage(() => { const r = window.SC.r; r.phase = window.SC.P.SUCCESS; r.line = 0; r.g = null; });
await shoot({ name: 'touch', dur: 2.5, focus: [84, 58], push: [1.14, 1.2], ease: 'lin' });

// THE TURN. Two sentences, and the world the first act built is over.
await shoot({
  name: 'break', dur: 6.0, ease: 'lin',
  stage: () => {
    const b = window.SC.BEATS.find((x) => x.id === 'unicorn-stream');
    b.cutscene.hold = 3.0;
    const r = window.SC.r;
    r.phase = window.SC.P.CUT; r.cut = 0;
  },
  focus: [160, 72], push: [1.0, 1.18], ease: 'in',
  marks: [{ at: 3.0, name: 'horn' }],
});

// Winter, arriving and then not stopping. The veil takes the cutscene's
// own progress, so holding on it is also watching the snow thicken.
await shoot({
  name: 'snow', dur: 5.7, ease: 'lin',
  stage: () => {
    const b = window.SC.BEATS.find((x) => x.id === 'winter-comes');
    b.cutscene.hold = 3.0;
    window.SC.play('winter-comes', { phase: window.SC.P.CUT, cut: 3.0 });
  },
  focus: [160, 78], push: [1.12, 1.0],
  marks: [{ at: 3.0, name: 'gone' }],
});

// =========================================================================
// III. THE ROAD
// =========================================================================
// Fast from here. The location cards come off - three confrontations and
// four rooms should not each stop to announce themselves - and every shot
// is a single line or a single mechanic.
await put('winter-falls', { phase: 0, line: 1 }, { card: false, hard: true });
await shoot({ name: 'frost', dur: 2.7, focus: [74, 62], push: [1.0, 1.12], ease: 'out' });
await intoGame('winter-falls');
await shoot({ name: 'ice', dur: 4.0, drv: 'crack', drvArg: { every: .38 }, focus: [160, 110], push: [1.24, 1.1], ease: 'io' });

await put('rescue-vow', { phase: 0, line: 3 }, { hard: true });
await shoot({ name: 'chain', dur: 3.1, focus: [88, 72], push: [1.06, 1.16], ease: 'out' });

await put('bog-road', { phase: 0, line: 1 }, { card: false });
await intoGame('bog-road');
await shoot({ name: 'lights', dur: 4.3, drv: 'lights', drvArg: { every: .30 }, focus: [160, 60], push: [1.16, 1.04], ease: 'io' });

await put('megs-looking-glass', { phase: 0, line: 0 }, { card: false, hard: true });
await shoot({ name: 'meg', dur: 3.0, focus: [274, 52], push: [1.08, 1.2], ease: 'out' });

// =========================================================================
// IV. THE CASTLE
// =========================================================================
await put('gown-that-breathes', { phase: 0, line: 1 }, { card: false });
await shoot({ name: 'gown', dur: 3.0, focus: [88, 62], push: [1.06, 1.18], ease: 'out' });

await put('hidden-hand', { phase: 0, line: 0 }, { hard: true });
await shoot({ name: 'offer', dur: 3.0, focus: [226, 56], push: [1.04, 1.16], ease: 'out' });
await stage(() => { const r = window.SC.r; r.phase = window.SC.P.CHOICE; r.choiceIndex = 0; });
await shoot({ name: 'choose', dur: 3.2, drv: 'pick', drvArg: { want: 1 }, focus: [160, 110], push: [1.06, 1.0], ease: 'lin', marks: [{ at: 1.5, name: 'chosen' }] });
await stage(() => { const r = window.SC.r; r.phase = window.SC.P.SUCCESS; r.line = 0; });
await shoot({ name: 'dawnneeds', dur: 2.7, focus: [96, 78], push: [1.1, 1.2], ease: 'lin' });

// The finale of the game, played: five bucklers on a route that a real
// tracer says works, and a shaft opened at the one moment two patrols
// allow it.
const beamPlan = await stage(() => {
  const b = window.SC.BEATS.find((x) => x.id === 'final-beam');
  const G = window.SC.GAMES.dungeon;
  const cells = [];
  for (let c = 0; c < b.g.cols; c++) for (let r = 0; r < b.g.rows; r++) cells.push([c, r]);
  const guards = b.g.guards;
  // Pass one: a route that works at all, with the patrol taken off the
  // board. Geometry first - a route that cannot reach him is not a route
  // whose timing is worth solving.
  b.g.guards = [];
  let mir = null;
  for (let trial = 0; trial < 60000 && !mir; trial++) {
    const st = G.init(b);
    const k = 1 + Math.floor(Math.random() * b.g.mirrors);
    for (let i = 0; i < k; i++) {
      const [c, r] = cells[Math.floor(Math.random() * cells.length)];
      if (st.mir.some((m) => m[0] === c && m[1] === r)) continue;
      st.mir.push([c, r, Math.random() < .5 ? 0 : 1]);
    }
    const keep = st.mir.map((m) => m.slice());
    st.open = 1; st.sweep = 0;
    G.update(st, b, 2.2, {});
    if (st.win) mir = keep;
  }
  b.g.guards = guards;
  if (!mir) return null;
  // Pass two: the moment. The guards are a pure function of the clock, so
  // the sweep is simulated frame by frame from each candidate second until
  // one gets the whole beam down before anybody walks into it.
  for (let openT = 0; openT < 30; openT += 1 / 30) {
    const st = G.init(b);
    st.mir = mir.map((m) => m.slice());
    st.t = openT; st.open = 1; st.sweep = 0; st.alarm = 0;
    let ok = 0;
    for (let f = 0; f < 60; f++) {
      G.update(st, b, 1 / 30, {});
      if (st.win) { ok = 1; break; }
      if (!st.open) break;
    }
    if (ok) return { mir, openT: +openT.toFixed(4) };
  }
  return { mir, openT: 0 };
});
if (!beamPlan) { console.error('no route to Darkness found'); await browser.close(); process.exit(1); }
console.log(`  beam: ${beamPlan.mir.length} bucklers, shaft opens at t=${beamPlan.openT.toFixed(2)} of the mechanic's clock`);

await put('final-beam', { phase: 0, line: 0 }, { hard: true });
await shoot({ name: 'mirrors', dur: 2.3, focus: [42, 66], push: [1.06, 1.14], ease: 'out' });
await intoGame('final-beam');
await shoot({
  name: 'beam', dur: 6.4, drv: 'beam',
  drvArg: { mir: beamPlan.mir, openAt: 2.6, openT: beamPlan.openT },
  focus: [160, 70], focus1: [160, 70], push: [1.18, 1.0], ease: 'io',
  marks: [{ at: 2.6, name: 'shaft' }, { at: 4.4, name: 'land' }],
});
await stage(() => { const r = window.SC.r; r.phase = window.SC.P.SUCCESS; r.line = 0; r.g = null; });
await shoot({ name: 'shadow', dur: 3.1, focus: [42, 66], push: [1.12, 1.22], ease: 'lin' });

// The castle brings its own roof down.
await shoot({
  name: 'fall', dur: 5.6, ease: 'lin',
  stage: () => {
    const b = window.SC.BEATS.find((x) => x.id === 'edge-of-world');
    b.cutscene.hold = 2.8;
    if (b.card) { b.__card = b.card; delete b.card; }
    window.SC.play('edge-of-world', { phase: window.SC.P.CUT, cut: 0 });
  },
  focus: [160, 78], push: [1.0, 1.16], ease: 'in',
  marks: [{ at: 2.8, name: 'shut' }],
});

// =========================================================================
// V. DAWN
// =========================================================================
// The veil takes the cutscene's progress, and the colour only arrives near
// the end of it - so this is the one place the film runs the game's own
// clock all the way through rather than jumping to a line.
await shoot({
  name: 'dawn', dur: 12.4, ease: 'lin',
  stage: () => {
    const b = window.SC.BEATS.find((x) => x.id === 'epilogue');
    b.cutscene.hold = 3.1;
    window.SC.play('epilogue', { phase: window.SC.P.CUT, cut: 0 });
  },
  focus: [160, 70], push: [1.1, 1.0],
  marks: [{ at: 3.1, name: 'green' }, { at: 6.2, name: 'named' }, { at: 9.3, name: 'still' }],
  black: (t) => Math.max(0, (t - 11.6) / .8),
});

await browser.close();
cues.end = +vt.toFixed(4);
writeFileSync(path.join(outDir, 'beats.json'), JSON.stringify({ fps: FPS, cues, marks, duration: frame / FPS }, null, 2));
console.log(`wrote ${frame} frames to ${path.relative(root, framesDir)} @ ${FPS}fps (${(frame / FPS).toFixed(2)}s)`);

// Unicorn Fireball's trailer. Captured the frame-stepped way Snap's is (see
// record-frames.mjs for why the clock is faked), but this cut is DIRECTED,
// not captured: a shot list with its own camera, cards on black between
// the movements, the HUD off for the whole length, and the clock itself
// bent - ignition and the clash play at a fraction of speed, which a
// pumped virtual clock gives away for nothing.
//
// The cut is Apocalypse Now, played straight: a man narrating a tour he
// has stopped understanding, over unicorns. The plain is the river, the
// charge is the air cavalry - and the score quotes Ride of the Valkyries
// on the game's own lead sample at the ignition, which is the joke doing
// itself. The narration never once acknowledges what is on screen.
//
// Every cut is a bar of the game's own music (132 BPM, 1.818s), so the
// score can be arranged to the picture: this file writes beats.json with
// the second every shot starts and the frames on which the rainbow lit and
// the clash detonated, and audio/render-fireball.py reads it.
//
// Staging notes that cost a while to learn (all still true):
//   * FB.reset(colour, 0) - the second argument gives the PLAYER an AI
//     brain. Pass 0.
//   * The rim is fatal (95 out) and ArrowUp is 15 units a second: held for
//     long the player runs off the world, fell() takes its hearts, lost()
//     latches mode='end'. The guard steers, every frame, once the rim is
//     coming.
//   * Two rainbows only explode if their herd CENTROIDS meet, and a
//     centroid trails its leader by spd/2.2. Pinned to 12 they meet;
//     at the natural 37 the leader is run over first and they graze.
//   * The rival's brain lets the rainbow go when it reads the edge down
//     its nose, and hunts the player's followers loose the rest of the
//     time. Off with it, for the whole cut.
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
const DT = 1 / FPS;
// FB_PREVIEW=n: capture every nth frame at half size, for looking at a shot
// list in two minutes instead of twenty. Cues and timing are unaffected -
// the clock is pumped for every frame either way.
const PREVIEW = Number(process.env.FB_PREVIEW || 0);
const BPM = 132;
const BAR = 240 / BPM;               // 1.818s - every cut lands on one
const bars = (n) => n * BAR;
const PLAYER = 0;

// The game's own seven, in leader order, for the cards that name them.
const RAINBOW = ['#db4d52', '#e58f42', '#e6d14d', '#70c26b', '#52a8c7', '#6b7ae0', '#ad6bd6'];

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: PREVIEW ? { width: 960, height: 540 } : { width: 1920, height: 1080 } });
page.on('pageerror', (e) => console.error('PAGE ERROR:', e.message));
page.on('crash', () => console.error('PAGE CRASHED'));

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
});

await page.goto(pathToFileURL(gamePath).href, { waitUntil: 'load' });
await page.evaluate(() => window.__pump(16));

// --- the page side: overlay, camera, guard, one tick ---------------------
// Installed once. Everything the recorder does per frame goes through
// window.__tick in ONE evaluate: the overlay, the camera, the guard and the
// step have to happen in the same round trip, in that order.
await page.evaluate(([RAINBOW]) => {
  // The HUD is the second canvas: title, counters, minimap, toasts. Off for
  // the whole cut - this is a film of the plain, not of the interface.
  document.querySelectorAll('canvas')[1].style.visibility = 'hidden';

  const el = (css) => { const n = document.createElement('div'); n.style.cssText = css; document.body.appendChild(n); return n; };
  const HEAVY = "font-family:'Arial Black',Arial,sans-serif;";
  // The cut is deadpan, so the type is too: a plain sans at a reasonable
  // size reads as a caption on a nature programme. Arial Black at 72px
  // reads as a man saying IN A WORLD, which was the first cut's problem.
  const PLAIN = 'font-family:Helvetica,Arial,sans-serif;';
  // Black: the cards' ground and the fade from nothing.
  const black = el('position:fixed;inset:0;background:#000;opacity:1;pointer-events:none;z-index:9000');
  // White: the game's own flash (ignition, the boom) - the HUD used to draw
  // it, and the HUD is off.
  const white = el('position:fixed;inset:0;background:#fff;opacity:0;pointer-events:none;z-index:9001');
  // Cards: one flat line on black, lowercase.
  const card = el('position:fixed;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;'
    + 'opacity:0;pointer-events:none;z-index:9002;color:#fdf6ec;padding:0 8%;letter-spacing:.01em;'
    + PLAIN + 'font-weight:400;font-size:56px');
  // The caption over the picture: the same voice as the cards, lower and
  // smaller, narrating the shot rather than interrupting it.
  const note = el('position:fixed;left:0;right:0;bottom:11%;text-align:center;opacity:0;pointer-events:none;z-index:9002;'
    + PLAIN + 'font-weight:400;font-size:46px;color:#fdf6ec;letter-spacing:.01em;'
    + 'text-shadow:0 2px 18px rgba(0,0,0,.95),0 0 60px rgba(0,0,0,.7)');
  // The one shout in the film. Cream on a heavy shadow, NOT a rainbow
  // gradient - the shot under it is already a rainbow, and the last cut put
  // one on top of the other and lost the words.
  const title = el('position:fixed;left:0;right:0;top:13%;text-align:center;opacity:0;pointer-events:none;z-index:9002;'
    + HEAVY + 'font-weight:900;font-size:118px;letter-spacing:.03em;line-height:1.02;color:#fffaf0;'
    + 'text-shadow:0 6px 34px rgba(0,0,0,.95),0 0 90px rgba(0,0,0,.8)');
  // The running gag: the game's own herd count, large, while the herd is
  // being assembled. It is read off the leader every frame - the joke only
  // works because the number is real.
  const count = el('position:fixed;right:6%;bottom:12%;text-align:right;opacity:0;pointer-events:none;z-index:9002;'
    + HEAVY + 'color:#fffaf0;text-shadow:0 4px 26px rgba(0,0,0,.9)');
  count.innerHTML = `<div style="${PLAIN}font-weight:400;font-size:26px;letter-spacing:.34em;opacity:.75">HERD</div>`
    + '<div id="fbn" style="font-size:150px;line-height:.92">1</div>';
  const countN = count.querySelector('#fbn');

  const ease = (u, kind) => kind === 'in' ? u * u : kind === 'out' ? 1 - (1 - u) * (1 - u)
    : kind === 'lin' ? u : u < .5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u);
  const lerp = (a, b, k) => a + (b - a) * k;
  const lerp3 = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];

  // Who a shot is about. A leader index, 'herd' (the player's centroid) or
  // a fixed point on the plain.
  const subject = (s) => {
    const { leaders } = window.FB;
    if (Array.isArray(s)) return { x: s[0], z: s[1], yaw: 0 };
    if (s === 'herd') { const P = leaders[0]; return { x: P.cx, z: P.cz, yaw: P.yaw }; }
    const L = leaders[s || 0];
    return { x: L.x, z: L.z, yaw: L.yaw };
  };
  // [along, side, up] in the subject's frame -> world.
  const rel = (S, yaw, o) => [S.x + Math.cos(yaw) * o[0] + Math.sin(yaw) * o[1], o[2], S.z + Math.sin(yaw) * o[0] - Math.cos(yaw) * o[1]];

  let camState = { id: -1 };
  const camera = (d, id, u) => {
    if (!d) { window.FBCAM_ = null; return; }
    const S = subject(d.subj);
    if (camState.id !== id) camState = { id, yaw: S.yaw, eye: null };
    const yaw = d.follow ? S.yaw : camState.yaw;
    const k = ease(u, d.ease);
    let e, l;
    if (d.orbit) {
      const o = d.orbit, a = yaw + lerp(o.a0, o.a1, k), r = lerp(o.r0 ?? o.r, o.r1 ?? o.r, k), h = lerp(o.h0 ?? o.h, o.h1 ?? o.h, k);
      e = [S.x + Math.cos(a) * r, h, S.z + Math.sin(a) * r];
      l = rel(S, yaw, d.l0 ? lerp3(d.l0, d.l1 || d.l0, k) : [0, 1.1, 0]);
    } else if (d.world) {
      e = lerp3(d.e0, d.e1 || d.e0, k);
      l = d.l0 ? lerp3(d.l0, d.l1 || d.l0, k) : [S.x, 1.1, S.z];
    } else {
      e = rel(S, yaw, lerp3(d.e0, d.e1 || d.e0, k));
      // A planted tripod: worked out once, where the subject was at the cut,
      // and left there while the subject comes to it.
      if (d.plant) { if (!camState.eye) camState.eye = e; e = camState.eye; }
      l = rel(S, yaw, d.l0 ? lerp3(d.l0, d.l1 || d.l0, k) : [0, 1.1, 0]);
    }
    window.FBCAM_ = { e, l, fov: lerp(d.fov0 ?? .9, d.fov1 ?? d.fov0 ?? .9, k) };
  };

  // Nobody dies on camera, and the player goes where the shot needs it.
  //
  // PREVENTIVE, not corrective. The match ends in the same step that kills
  // the player - hurt() to no hearts, then lost() right after step() - so
  // healing it before the next frame is a frame too late. The second
  // preview of this cut had a charging rival's herd land three horns on the
  // standing player inside one step. So: the player cannot be horned at
  // all (`hit` is the per-pair cooldown the fight loop honours), rivals
  // are held under the charge that makes a horn lethal, and no rival
  // rainbow burns outside the clash.
  const guard = (g, dtGame) => {
    const { leaders } = window.FB;
    const P = leaders[0];
    P.hearts = 3; P.stun = 0; P.hit = 0.4;
    if (P.st === 3) { P.st = 0; P.gone = 0; P.spd = 11; }
    for (let i = 1; i < leaders.length; i++) {
      const R = leaders[i];
      if (R.st === 3) { R.st = 0; R.hearts = 3; R.stun = 0; R.gone = 0; R.spd = 11; }
      const d = Math.hypot(R.x, R.z) || 1;
      if (d > 68) { R.x *= 68 / d; R.z *= 68 / d; }
      if (!g.aim) {
        R.charge = Math.min(R.charge, 0.4);
        if (R.wave) { R.wave = 0; R.chg = 0; R.burn = 0; R.cool = 3; }
      }
      // A rival with no brain still walks (see the steering note) - and
      // walked, it piles up on the clamp ring. Pinned, it stands with its
      // herd ringed round it, which is what set dressing should do.
      if (!R.ai && !g.aim) R.spd = 0;
    }
    // Steering is on unless the shot is the clash: the player WALKS - with
    // an input object and no key held, the game's `want` is eleven units a
    // second, there is no standing still - and eleven units a second for
    // the length of the intro is off the far edge of the plain. The third
    // preview of this cut fell off at [3, -95], during a card.
    if (!g.aim) {
      const r = Math.hypot(P.x, P.z) || 1, a = Math.atan2(P.z, P.x);
      const outward = (P.x * Math.cos(P.yaw) + P.z * Math.sin(P.yaw)) / r;
      if (r > 48 && outward > -0.2) {
        const side = Math.sign(Math.sin(P.yaw - a)) || 1;
        const want = a + side * (Math.PI / 2 + 0.35);
        const dd = Math.atan2(Math.sin(want - P.yaw), Math.cos(want - P.yaw));
        const max = (r > 74 ? 2.4 : 1.2) * dtGame;
        P.yaw += Math.max(-max, Math.min(max, dd));
      }
      if (r > 84) { P.x *= 84 / r; P.z *= 84 / r; }
    }
    if (g.hold && P.wave) { P.burn = Math.max(P.burn, 1.5); P.cool = 0; }
    // `pin: 0` is as near to standing as the game allows - the step still
    // eases toward eleven, so it creeps, which reads as an animal shifting
    // its weight rather than one frozen in place.
    if (g.pin !== undefined) P.spd = g.pin;
    if (g.aim) {
      // Head-on, slow, every frame - see the notes at the top.
      const R = leaders[1];
      if (P.wave && R.wave) {
        P.burn = Math.max(P.burn, 1.5); R.burn = Math.max(R.burn, 1.5); P.cool = 0; R.cool = 0;
        P.yaw = Math.atan2(R.z - P.z, R.x - P.x); R.yaw = Math.atan2(P.z - R.z, P.x - R.x);
        P.spd = g.aim; R.spd = g.aim;
      }
    }
  };

  window.__tick = (s) => {
    black.style.opacity = s.black;
    card.textContent = s.cardText || '';
    card.style.opacity = s.card;
    if (s.cardColor) card.style.color = s.cardColor;
    note.textContent = s.noteText || '';
    note.style.opacity = s.note;
    title.textContent = s.titleText || '';
    title.style.opacity = s.title;
    count.style.opacity = s.count;
    countN.textContent = String(window.FB.leaders[0].n + 1);
    const { leaders } = window.FB;
    const P = leaders[0], R = leaders[1];
    const wasLit = !!P.wave, bothLit = !!(P.wave && R.wave);
    if (s.guard) guard(s.guard, s.dtGame);
    camera(s.cam, s.shotId, s.u);
    window.__pump(s.dtGame * 1000);
    white.style.opacity = Math.min(1, window.FB.flash * 1.2);
    const dCent = Math.hypot(R.cx - P.cx, R.cz - P.cz);
    return {
      ignited: !wasLit && !!P.wave, boom: bothLit && !(P.wave && R.wave), dCent, wave: P.wave, n: P.n, charge: P.charge, mode: window.FB.mode,
      // For the take-failed report below: where the player was and what it had.
      st: P.st, hearts: P.hearts, at: [Math.round(P.x), Math.round(P.z)], alive: leaders.filter((L) => L.st !== 3).length,
    };
  };
}, [RAINBOW]);

// --- the recorder side ----------------------------------------------------
let frame = 0, vt = 0;
const cues = {};
const stage = (fn, arg) => page.evaluate(fn, arg);
const key = (k, down) => page.evaluate(([k, down]) => {
  dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { key: k, code: k === ' ' ? 'Space' : k, bubbles: true }));
}, [k, down]);
// A line may be a string or a function of the shot's own time, so one
// unbroken camera move can carry a setup and its correction.
const text = (v, t) => (typeof v === 'function' ? v(t) : v) || '';
// Fade in from `at` over `dur`, and its mirror.
const fin = (t, at, dur) => Math.max(0, Math.min(1, (t - at) / dur));
const fout = (t, at, dur) => 1 - fin(t, at, dur);

// One shot: `dur` seconds of VIDEO; `scale` is game seconds per video
// second (a number, [from, to] for a ramp, or a function of the tick), and
// the shot may instead run `until` a condition - the clash does, because
// the boom lands where the physics puts it. The guard's protection runs on
// EVERY shot, whatever else it is asked to do: the first preview of this
// cut had the player hunted down and killed during the seven-colour
// montage, while it stood still with a herd of three and nobody watching.
async function shoot(shot) {
  if (process.env.FB_UNTIL && cues[process.env.FB_UNTIL] !== undefined) return;
  cues[shot.name] = +vt.toFixed(4);
  if (shot.stage) await stage(shot.stage, shot.arg);
  if (shot.keys) for (const [k, down] of shot.keys) await key(k, down);
  const n = shot.dur ? Math.round(shot.dur * FPS) : 100000;
  let info = null;
  const state = {};
  for (let i = 0; i < n; i++) {
    const t = i * DT, u = shot.dur ? i / Math.max(1, n - 1) : 0;
    const sc = typeof shot.scale === 'function' ? shot.scale(info, state, t) : Array.isArray(shot.scale) ? shot.scale[0] + (shot.scale[1] - shot.scale[0]) * u : (shot.scale ?? 1);
    const ov = shot.overlay ? shot.overlay(t, u) : {};
    info = await page.evaluate((s) => window.__tick(s), {
      dtGame: DT * sc, cam: shot.cam || null, shotId: shot.id, u, guard: shot.guard || {},
      black: ov.black ?? (shot.card ? 1 : 0), card: ov.card ?? 0, cardText: text(shot.card, t), cardColor: shot.cardColor,
      note: ov.note ?? (shot.note ? 1 : 0), noteText: text(shot.note, t),
      title: ov.title ?? 0, titleText: shot.title || '', count: ov.count ?? 0,
    });
    // A take is over the moment the match is: every later shot is the end
    // screen or the title. Say so at the frame it happened, with the state
    // one frame before - that is the frame that explains it.
    if (info.mode !== 'run' && !state.failed) {
      state.failed = 1;
      console.error(`  TAKE FAILED in '${shot.name}' at ${vt.toFixed(2)}s: ${JSON.stringify(info)}\n    frame before: ${JSON.stringify(state.prev)}`);
      if (process.env.FB_STRICT) { await browser.close(); process.exit(1); }
    }
    state.prev = { st: info.st, hearts: info.hearts, at: info.at, alive: info.alive, n: info.n };
    if (info.ignited && !cues.ignite) cues.ignite = +vt.toFixed(4);
    if (info.boom && !cues.clash) cues.clash = +vt.toFixed(4);
    if (sc < 0.5 && !state.slow) { state.slow = 1; if (shot.slowCue) cues[shot.slowCue] = +vt.toFixed(4); }
    if (!PREVIEW || frame % PREVIEW === 0) await page.screenshot({ path: path.join(framesDir, `f${String(frame).padStart(6, '0')}.png`) });
    frame++; vt += DT;
    if (shot.until && shot.until(info, state, t)) break;
  }
  console.log(`  ${shot.name.padEnd(10)} ${cues[shot.name].toFixed(2)}s -> ${vt.toFixed(2)}s  ${JSON.stringify({ n: info.n, wave: info.wave, charge: +info.charge.toFixed(2), mode: info.mode })}`);
  if (shot.after) await stage(shot.after);
}

// A card: a line on black for a bar, faded in and out. The music keeps
// playing under it - a card is a rest in the picture, not in the score.
const cardShot = (name, text, dur, color) => ({
  name, card: text, cardColor: color, dur, scale: 1,
  overlay: (t) => ({ black: 1, card: Math.min(fin(t, 0.12, 0.45), fout(t, dur - 0.55, 0.4)) }),
});

// --- staging helpers, in page ---------------------------------------------
const giveHerd = (count, spread) => stage(({ count, spread }) => {
  const { units, leaders } = window.FB, P = leaders[0];
  let taken = 0;
  for (const u of units) {
    if (u.lead >= 0 || u.st === 3 || leaders.includes(u)) continue;
    if (taken >= count) break;
    u.lead = 0; u.col = P.col; u.st = 0; u.daze = 0;
    const a = Math.random() * Math.PI * 2, r = 2 + Math.random() * spread;
    u.x = P.x - Math.cos(P.yaw) * 4 + Math.cos(a) * r; u.z = P.z - Math.sin(P.yaw) * 4 + Math.sin(a) * r;
    taken++;
  }
  return taken;
}, { count, spread });
// Grazers of the player's colour strung out along its heading, so a run
// through them is a run that gathers on camera.
const seedPath = (count, from, to, width) => stage(({ count, from, to, width }) => {
  const { units, leaders } = window.FB, P = leaders[0];
  let placed = 0;
  for (const u of units) {
    if (u.lead >= 0 || u.st === 3 || leaders.includes(u)) continue;
    if (placed >= count) break;
    const d = from + (to - from) * (placed + .5) / count, w = (Math.random() - .5) * width;
    u.col = P.col; u.st = 0; u.daze = 0; u.lead = -1;
    u.x = P.x + Math.cos(P.yaw) * d + Math.sin(P.yaw) * w; u.z = P.z + Math.sin(P.yaw) * d - Math.cos(P.yaw) * w;
    placed++;
  }
}, { count, from, to, width });
const clearTheField = (radius) => stage((radius) => {
  const { units, leaders } = window.FB;
  for (let i = 1; i < leaders.length; i++) {
    const R = leaders[i], a = (i - 1) / (leaders.length - 1) * Math.PI * 2;
    R.x = Math.cos(a) * radius; R.z = Math.sin(a) * radius;
    for (const u of units) if (u.lead === i && u !== R) { u.x = R.x + (Math.random() - .5) * 7; u.z = R.z + (Math.random() - .5) * 7; }
  }
}, radius);
const place = (x, z, yaw) => stage(({ x, z, yaw }) => {
  const P = window.FB.leaders[0];
  P.x = x; P.z = z; P.yaw = yaw; P.spd = 0;
  for (const u of window.FB.units) if (u.lead === 0 && u !== P) {
    u.x = x - Math.cos(yaw) * 4 + (Math.random() - .5) * 7; u.z = z - Math.sin(yaw) * 4 + (Math.random() - .5) * 7;
  }
}, { x, z, yaw });

console.log('recording Unicorn Fireball');
await stage((c) => {
  window.FB.reset(c, 0);
  // The rivals are set dressing until the clash: brains off for the whole
  // cut. Left on, they HUNT - a preview had them horn the player's
  // followers loose faster than the gather could add them, and the herd
  // that reached the hold was two.
  for (const L of window.FB.leaders) if (L.ai) L.ai = null;
}, PLAYER);
let id = 0;
const S = (o) => ({ id: id++, ...o });

// --- I. the specimen -------------------------------------------------------
// One animal, tight and low, with the other seventy simply out of frame -
// and then a camera move, not a change of staging, puts them in it. The
// joke only works if nothing is teleported: they were there the whole time.
await stage(() => {
  const { units, leaders } = window.FB, P = leaders[0];
  for (const u of units) if (u !== P && u.col === P.col) {
    const a = Math.random() * Math.PI * 2, r = 11 + Math.random() * 11;
    u.x = P.x + Math.cos(a) * r; u.z = P.z + Math.sin(a) * r;
  }
  // The other six herds ring it at conversational distance.
  for (let i = 1; i < leaders.length; i++) {
    const L = leaders[i], a = (i - 1) / 6 * Math.PI * 2 + 0.5, r = 19 + (i % 3) * 10;
    L.x = P.x + Math.cos(a) * r; L.z = P.z + Math.sin(a) * r;
    for (const u of units) if (u.lead === i && u !== L) { u.x = L.x + (Math.random() - .5) * 13; u.z = L.z + (Math.random() - .5) * 13; }
  }
});
await shoot(S({
  name: 'lone', dur: bars(2), scale: 1, guard: { pin: 0 },
  cam: { subj: 0, orbit: { a0: 2.3, a1: 2.85, r0: 4.5, r1: 3.8, h0: .85, h1: 1.3 }, l0: [.3, 1.25, 0], fov0: .8, ease: 'io' },
  // "Saigon... I'm still only in Saigon." The film opens on a man who has
  // been waiting too long in a place he cannot leave, and so does this.
  note: (t) => (t < bars(1.15) ? 'the plain.' : "i'm still only on the plain."),
  overlay: (t) => ({ black: fout(t, 0, .9), note: Math.min(fin(t, .9, .35), fout(t, bars(2) - .45, .3)) }),
}));
// The reveal, in one move: the line goes up while the frame still holds one
// animal, and is still up when the frame holds seventy.
await shoot(S({
  name: 'reveal', dur: bars(2.25), scale: 1, guard: { pin: 0 },
  cam: { subj: 0, orbit: { a0: 2.85, a1: 3.35, r0: 3.8, r1: 34, h0: 1.3, h1: 9.5 }, l0: [0, 1.2, 0], l1: [0, .5, 0], fov0: .8, fov1: .98, ease: 'in' },
  note: 'seven colours out here.',
  overlay: (t) => ({ note: Math.min(fin(t, .1, .3), fout(t, bars(2.25) - .45, .35)) }),
}));

// --- II. seven of them -----------------------------------------------------
// A cut on every half bar, one colour each, low and close among its own
// grass. The player's colour last, so the card after it lands on red.
for (let i = 1; i <= 7; i++) {
  const who = i % 7;
  await shoot(S({
    name: `colour${i}`, dur: bars(.5), scale: 1,
    cam: { subj: who, e0: [6.0, 3.4 * (i % 2 ? 1 : -1), 1.5], e1: [5.0, 2.8 * (i % 2 ? 1 : -1), 1.6], l0: [0, 1.1, 0], fov0: .8, ease: 'lin' },
    note: i >= 4 ? 'nobody wants the other six on it.' : '',
    overlay: () => ({ note: i >= 4 ? 1 : 0 }),
  }));
}

// --- III. step one ---------------------------------------------------------
await shoot(S(cardShot('cardHerd', 'they gave me a herd.', bars(1))));
await place(-30, 20, .4);
await clearTheField(64);
await seedPath(5, 6, 30, 7);
await shoot(S({
  name: 'gatherA', dur: bars(1.5), scale: 1, keys: [['ArrowUp', true]],
  cam: { subj: 0, e0: [2.5, 7.5, 1.6], e1: [-1.5, 7.5, 1.9], l0: [.5, 1.0, 0], fov0: .82, ease: 'lin' },
  overlay: (t) => ({ count: fin(t, .3, .5) }),
}));
await giveHerd(6, 6);
await seedPath(5, 8, 26, 9);
await shoot(S({
  name: 'gatherB', dur: bars(1.25), scale: 1,
  cam: { subj: 'herd', follow: true, e0: [-10, 4, 5.5], e1: [-13, 5.5, 7], l0: [4, .8, 0], fov0: .9, ease: 'lin' },
  overlay: () => ({ count: 1 }),
}));
await giveHerd(8, 8);
// Planted low in the herd's path, so the punchline arrives at the lens.
await shoot(S({
  name: 'gatherC', dur: bars(1.25), scale: 1,
  cam: { subj: 'herd', plant: true, e0: [26, 3, 1.0], l0: [0, 1.2, 0], fov0: .85, ease: 'lin' },
  note: 'it kept getting bigger.',
  overlay: (t) => ({ count: 1, note: fin(t, .35, .3) }),
}));

// --- IV. step two ----------------------------------------------------------
await shoot(S(cardShot('cardButton', 'then somebody showed me the button.', bars(1))));
// The charge folds the herd tight and fades the unicorns out as it tops,
// and the clock slows with it. Ignition is placed on the FIRST frame of the
// next shot - charge is set to 1 there - so this one is given the head
// start that ends it at .97: the fold complete, the light not yet on.
const HOLD = bars(2.25), HOLD_SCALE = [1, .35];
const holdGame = HOLD * (HOLD_SCALE[0] + HOLD_SCALE[1]) / 2;
await clearTheField(66);
await shoot(S({
  name: 'hold', dur: HOLD, scale: HOLD_SCALE, keys: [[' ', true]],
  stage: (g) => {
    const P = window.FB.leaders[0];
    const chargeTime = 2.4 + 0.08 * P.n;
    P.charge = Math.max(0, 0.97 - g / chargeTime);
    P.cool = 0;
  }, arg: holdGame,
  cam: { subj: 'herd', orbit: { a0: 2.3, a1: 3.7, r0: 15, r1: 9, h0: 12, h1: 7.5 }, l0: [0, .6, 0], fov0: .95, fov1: .85, ease: 'io' },
  overlay: (t) => ({ count: fout(t, HOLD - .5, .4) }),
}));
await shoot(S({
  name: 'ignite', dur: bars(1), scale: .22, guard: { hold: 1 },
  stage: () => { const P = window.FB.leaders[0]; P.charge = 1; P.cool = 0; },
  cam: { subj: 'herd', e0: [-7, 4, 1.2], e1: [-17, 9, 4.8], l0: [5, 1.6, 0], l1: [3, 2.4, 0], fov0: .85, fov1: 1.05, ease: 'out' },
}));
await shoot(S({
  name: 'rideA', dur: bars(1), scale: 1, guard: { hold: 1, pin: 26 },
  cam: { subj: 'herd', follow: true, e0: [-26, -8, 12], e1: [-30, -10, 14], l0: [8, 2.5, 0], fov0: 1.0, ease: 'lin' },
}));
// A rival herd between the band and the lens. The line goes over it.
await shoot(S({
  name: 'rideB', dur: bars(1.5), scale: 1, guard: { hold: 1, pin: 26 },
  stage: () => {
    const { units, leaders } = window.FB, P = leaders[0], R = leaders[3];
    P.x = -20; P.z = 0; P.yaw = 0;
    R.x = 12; R.z = 1; R.yaw = Math.PI / 2; R.st = 0; R.stun = 0;
    let n = 0;
    for (const u of units) {
      if (u.lead >= 0 || u.st === 3 || leaders.includes(u)) continue;
      if (n >= 9) break;
      u.lead = 3; u.col = R.col; u.st = 0; u.daze = 0;
      u.x = R.x + (Math.random() - .5) * 8; u.z = R.z + (Math.random() - .5) * 8; n++;
    }
  },
  cam: { subj: 'herd', plant: true, e0: [46, 5, 1.3], l0: [0, 1.8, 0], fov0: .9, ease: 'lin' },
  // The line, over the shot it belongs to: a rainbow ploughing through
  // somebody else's herd.
  note: 'i love the smell of rainbows in the morning.',
  overlay: (t) => ({ note: Math.min(fin(t, .5, .35), fout(t, bars(1.5) - .45, .35)) }),
}));
await shoot(S({
  name: 'rideC', dur: bars(.75), scale: 1, guard: { hold: 1, pin: 30 },
  cam: { subj: 'herd', e0: [2, 22, 5], e1: [-6, 22, 5.5], l0: [0, 2.5, 0], fov0: .95, ease: 'lin' },
}));

// --- V. step three ---------------------------------------------------------
// The card sets it up and the picture is the punchline.
await shoot(S(cardShot('cardOther', 'somebody else had a herd.', bars(1))));
await shoot(S({
  name: 'approach', until: (info, st, t) => (st.boomAt !== undefined && t - st.boomAt > .9) || t > 7,
  scale: (info, st, t) => {
    if (info && info.boom) st.boomAt = t;
    if (st.boomAt !== undefined) return .18;
    // A fifth of speed from twenty-five units out: about two and a half
    // seconds of two lights closing before they touch.
    return info && info.wave && info.dCent < 25 ? .18 : 1;
  },
  slowCue: 'slowmo',
  guard: { aim: 12 },
  stage: () => {
    const { units, leaders } = window.FB, P = leaders[0], R = leaders[1];
    P.x = -40; P.z = 0; P.yaw = 0; P.charge = 1; P.chg = 1; P.wave = 1 + P.n; P.burn = 6; P.cool = 0; P.spent = 0; P.spd = 12;
    for (const u of units) if (u.lead === 0 && u !== P) { u.x = P.x - 3 + (Math.random() - .5) * 8; u.z = P.z + (Math.random() - .5) * 8; }
    R.x = 40; R.z = 0; R.yaw = Math.PI; R.st = 0; R.stun = 0; R.cool = 0; R.hearts = 3; R.spd = 12;
    let given = 0;
    for (const u of units) {
      if (u.lead >= 0 || u.st === 3 || leaders.includes(u)) continue;
      if (given >= 12) break;
      u.lead = 1; u.col = R.col; u.st = 0; u.daze = 0;
      u.x = R.x + 3 + (Math.random() - .5) * 7; u.z = R.z + (Math.random() - .5) * 7; given++;
    }
    R.n = given; R.charge = 1; R.chg = 1; R.wave = 1 + given; R.burn = 6; R.spent = 0;
    // The other five go to the far side of the plain: the camera is on +z,
    // and a herd of set dressing in its foreground is a herd in the shot.
    for (let i = 2; i < leaders.length; i++) {
      const L = leaders[i], a = Math.PI + ((i - 2) / 4 - 0.5) * 1.6;
      L.x = Math.cos(a + Math.PI / 2) * 64; L.z = -Math.abs(Math.sin(a + Math.PI / 2) * 64) - 20;
      for (const u of units) if (u.lead === i && u !== L) { u.x = L.x + (Math.random() - .5) * 7; u.z = L.z + (Math.random() - .5) * 7; }
    }
  },
  cam: { world: true, e0: [0, 15, 38], e1: [0, 9, 22], l0: [0, 2, 0], l1: [0, 1.5, 0], fov0: 1.0, fov1: .9, ease: 'in' },
  overlay: () => ({}),
}));
// Back to speed on the hit: the ring goes out across the plain and the
// camera goes up with it.
await shoot(S({
  name: 'boom', dur: bars(1.5), scale: 1, keys: [[' ', false], ['ArrowUp', false]],
  cam: { world: true, e0: [0, 5, 24], e1: [0, 22, 40], l0: [0, 1, 0], l1: [0, 0, 0], fov0: .95, fov1: 1.05, ease: 'out' },
  note: 'the horror.',
  overlay: (t) => ({ note: Math.min(fin(t, .7, .4), fout(t, bars(1.5) - .5, .35)) }),
}));

// --- coda: the one unicorn, and now a herd round it --------------------------
// A herd is a ring around its leader - the game re-forms it on the next
// step, so 'leader in front, herd behind' cannot be staged and a camera
// inside the ring sees flanks. From outside, pushing in slowly, it is the
// opening shot answered: the same animal, no longer alone.
await shoot(S({
  name: 'after', dur: bars(2), scale: 1, guard: { pin: 0 },
  stage: () => {
    const { units, leaders } = window.FB, P = leaders[0];
    P.x = 0; P.z = 0; P.yaw = 0; P.spd = 0; P.vx = P.vz = 0;
    for (const u of units) if (u.lead === 0 && u !== P) {
      const a = Math.random() * Math.PI * 2, r = 2.5 + Math.random() * 6;
      u.x = P.x + Math.cos(a) * r; u.z = P.z + Math.sin(a) * r; u.st = 0; u.vx = u.vz = 0; u.daze = 0;
    }
  },
  cam: { subj: 0, orbit: { a0: .7, a1: .35, r0: 17, r1: 11.5, h0: 3.4, h1: 2.1 }, l0: [0, 1.2, 0], fov0: .8, ease: 'io' },
  note: "someday this plain's gonna end.",
  overlay: (t) => ({ note: Math.min(fin(t, .9, .45), fout(t, bars(2) - .5, .35)) }),
}));

await browser.close();
cues.end = +vt.toFixed(4);
writeFileSync(path.join(outDir, 'beats.json'), JSON.stringify({ fps: FPS, bpm: BPM, cues, duration: frame / FPS }, null, 2));
console.log(`  ignite ${cues.ignite?.toFixed(2)}s  slow-mo ${cues.slowmo?.toFixed(2)}s  clash ${cues.clash?.toFixed(2)}s`);
console.log(`wrote ${frame} frames to ${path.relative(root, framesDir)} @ ${FPS}fps (${(frame / FPS).toFixed(2)}s)`);

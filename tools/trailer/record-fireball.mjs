// Unicorn Fireball's trailer. Captured the frame-stepped way Snap's is (see
// record-frames.mjs for why the clock is faked), with its own camera
// (FBCAM_), its own lighting (FBGL: a directional flash, the fog pushed
// out, a gain on every glow) and its own pyrotechnics (FB.boom), all of
// them DEV hooks that compile out of the shipping build byte for byte. The
// HUD is off for the whole length, and the clock is bent where a fall or a
// light wants a moment.
//
// The story is slapstick with a hero. A face in the dark, lit by the
// flashes of a fight it is not in. It sets off, hopeful - and a herd runs
// it down. It lies there, gets up like a hero, shakes it off, sets off
// again - and a RAINBOW runs it down. It stays down. The camera goes
// straight up off it, turning, and the whole plain is at war. Then the
// second half says how: gather a herd, trample the others, become the
// rainbow - and two rainbows meet, and everything goes white.
//
// Every cut is a bar of the game's own music (132 BPM, 1.818s) and this
// file writes beats.json - the second every shot starts and the frames of
// every hit - for audio/render-fireball.py to score against.
//
// Staging notes that cost a while to learn (all still true):
//   * FB.reset(colour, 0) - the second argument gives the PLAYER a brain.
//   * The player never stands still: with an input object and no key held
//     the game's `want` is eleven units a second. Steering is on for every
//     shot; the "standing" shots pin the speed and get a creep.
//   * A leader with no brain still walks - pinned, it stands.
//   * The match ends in the SAME step that kills the player, so protection
//     is preventive: the player cannot be horned unless a shot says
//     `mortal`, and that is exactly the two shots where it gets run down.
//   * Two rainbows only explode if their herd CENTROIDS meet, and a
//     centroid trails its leader by spd/2.2. Pinned to 12 they meet.
//   * `up` is the game's own get-up: pinned at .55 the animal lies on its
//     side, let go it rolls back onto its feet in half a second.
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
  // A colour over the whole frame at low opacity, screened: what a flash
  // does to the air between the lens and the animal, while FBGL's
  // directional flash does what it does to the animal.
  const tint = el('position:fixed;inset:0;opacity:0;pointer-events:none;z-index:9001;mix-blend-mode:screen');

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
  // [along, side, height] in the subject's frame -> world. BOTH the eye and
  // the look point go through this, so a look point is an offset in those
  // same three axes - not [x, y, z]. Every shot in the first cut wrote its
  // look point as [along, height, 0], which aimed the camera at the ground
  // and slid it sideways: harmless at thirty units, and the reason the
  // close-ups sat low and showed so much floor. `world: true` shots are the
  // exception and give real [x, y, z] for both.
  const rel = (S, yaw, o) => [S.x + Math.cos(yaw) * o[0] + Math.sin(yaw) * o[1], o[2], S.z + Math.sin(yaw) * o[0] - Math.cos(yaw) * o[1]];

  let camState = { id: -1 };
  const camera = (d, id, u) => {
    if (!d) { window.FBCAM_ = null; return; }
    const S = subject(d.subj);
    if (camState.id !== id) camState = { id, yaw: S.yaw, eye: null, se: null, sl: null };
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
    // A following shot is eased, in VIDEO frames, not game time: `subject`
    // is the herd's CENTROID, and the centroid steps sideways every time
    // the band spends a unit out of the herd - which at a fifth of speed
    // is a camera that ticks and jerks behind a rainbow that is gliding.
    // The game eases its own camera for exactly this reason; FBCAM_ places
    // the eye instead, so a shot that follows has to do it here.
    if (d.smooth) {
      if (!camState.se) { camState.se = e.slice(); camState.sl = l.slice(); }
      camState.se = lerp3(camState.se, e, d.smooth);
      camState.sl = lerp3(camState.sl, l, d.smooth);
      e = camState.se.slice(); l = camState.sl.slice();
    }
    if (d.shake) { const j = d.shake; e = [e[0] + (Math.random() - .5) * j, e[1] + (Math.random() - .5) * j, e[2] + (Math.random() - .5) * j]; }
    window.FBCAM_ = { e, l, fov: lerp(d.fov0 ?? .9, d.fov1 ?? d.fov0 ?? .9, k) };
  };

  // Nobody dies on camera unless the shot says so, and everyone goes where
  // the shot needs them.
  //
  // PREVENTIVE, not corrective. The match ends in the same step that kills
  // the player - hurt() to no hearts, then lost() right after step() - so
  // healing it before the next frame is a frame too late. So: the player
  // cannot be horned (`hit` is the per-pair cooldown the fight loop
  // honours), rivals are held under the charge that makes a horn lethal,
  // and no rival rainbow burns - EXCEPT in a `mortal` shot, which is the
  // two where the hero gets run down, and there the guard keeps the hearts
  // topped up so the throw happens and the death does not.
  const guard = (g, dtGame) => {
    const { leaders, units } = window.FB;
    const P = leaders[0];
    P.hearts = 3; P.stun = 0;
    // `horns` lets a horn land on the hero; `mortal` lets rivals keep a
    // charge and a rainbow. The first fall is horns; the second is the
    // rainbow alone - a lit leader's horn would throw the hero half a
    // second before its band arrived, and the fall would not be the band's.
    if (!g.horns) P.hit = 0.4;
    if (P.st === 3) { P.st = 0; P.gone = 0; P.spd = 11; }
    for (let i = 1; i < leaders.length; i++) {
      const R = leaders[i];
      if (R.st === 3) { R.st = 0; R.hearts = 3; R.stun = 0; R.gone = 0; R.spd = 11; }
      const d = Math.hypot(R.x, R.z) || 1;
      if (d > 68 && !g.wide) { R.x *= 68 / d; R.z *= 68 / d; }
      const drv = g.drive && g.drive.find((o) => o.i === i);
      const paired = g.pairs && g.pairs.some((pr) => pr.includes(i));
      if (drv) {
        // Driven: a rival sent somewhere at a speed, a herd that crosses
        // the frame on cue. Its brain is off, so this IS its brain.
        if (drv.yaw !== undefined) R.yaw = drv.yaw;
        R.spd = drv.spd; R.stun = 0;
        if (drv.charge !== undefined) { R.charge = drv.charge; R.chg = 1; }
        if (R.wave) { R.burn = Math.max(R.burn, 1.5); R.cool = 0; }
      } else if (!g.aim && !paired) {
        if (!g.mortal) { R.charge = Math.min(R.charge, 0.4); if (R.wave) { R.wave = 0; R.chg = 0; R.burn = 0; R.cool = 3; } }
        // A rival with no brain still walks - pinned, it stands with its
        // herd ringed round it, which is what set dressing should do.
        if (!R.ai) R.spd = 0;
      }
    }
    // Pairs of lit rivals held head-on at the speed that lets their
    // centroids meet (see the notes at the top): the war in the background.
    if (g.pairs) for (const [a, b] of g.pairs) {
      const A = leaders[a], B = leaders[b];
      for (const L of [A, B]) {
        // Lit again the moment the game's own cooldown allows: a war, not
        // one clash. The first crane found both pairs spent and dark by
        // the time the lens was high enough to see them.
        if (!L.wave && L.st === 0 && L.cool <= 0) { L.charge = 1; L.chg = 1; L.wave = 1 + L.n; L.burn = 9; L.spent = 0; }
        if (L.wave) L.burn = Math.max(L.burn, 1.5);
        L.stun = 0;
      }
      A.yaw = Math.atan2(B.z - A.z, B.x - A.x); B.yaw = Math.atan2(A.z - B.z, A.x - B.x);
      A.spd = B.spd = 13;
    }
    // Steering is on unless the shot is the clash: the player WALKS - with
    // an input object and no key held the game's `want` is eleven units a
    // second, and eleven units a second for the length of the intro is off
    // the far edge of the plain.
    if (!g.aim && !g.lie) {
      const r = Math.hypot(P.x, P.z) || 1, a = Math.atan2(P.z, P.x);
      const outward = (P.x * Math.cos(P.yaw) + P.z * Math.sin(P.yaw)) / r;
      if (r > 48 && outward > -0.2 && P.st === 0) {
        const side = Math.sign(Math.sin(P.yaw - a)) || 1;
        const want = a + side * (Math.PI / 2 + 0.35);
        const dd = Math.atan2(Math.sin(want - P.yaw), Math.cos(want - P.yaw));
        const max = (r > 74 ? 2.4 : 1.2) * dtGame;
        P.yaw += Math.max(-max, Math.min(max, dd));
      }
      if (r > 84) { P.x *= 84 / r; P.z *= 84 / r; }
    }
    // Down: the game's own knocked-flat pose, held.
    if (g.lie) { P.st = 0; P.y = 0; P.vy = 0; P.vx = P.vz = 0; P.up = .55; P.spd = 0; P.chg = 0; P.charge = 0; }
    // RUN OVER, not punted. The game's own answer to a rainbow landing on a
    // leader is hurt(), and hurt() is seven of vertical - so every take of
    // this had the hero leave the ground BEFORE the wall reached him and
    // sail off ahead of it, which is a kick, not a trampling. A throw fired
    // off a stopwatch could not beat it; this fires off the geometry, the
    // frame the arch actually covers him, and then holds him down: no lift,
    // ever, and his speed dragged toward the wall's own.
    if (!g.run) window.__ran = 0;
    else {
      const R = leaders[g.run.i];
      if (P.st === 0 && Math.hypot(P.x - R.cx, P.z - R.cz) < R.r * .92) {
        // ONE shove, then friction. Held at the wall's own speed he stays
        // inside it and the shot is a white screen; shoved once he falls
        // behind it, and the band clears frame off a unicorn lying flat -
        // which is the whole point of the beat.
        P.st = 1; P.roll = 0; P.spin = 12; P.up = 0; window.__ran = 1;
        P.vx = Math.cos(R.yaw) * g.run.spd; P.vz = Math.sin(R.yaw) * g.run.spd;
      }
      if (P.st === 1) { P.vy = 0; P.y = Math.min(P.y, .1); }
    }
    if (g.hold && P.wave) { P.burn = Math.max(P.burn, 1.5); P.cool = 0; }
    // KEGLE. Waiting on the game's own fight loop to do this does not work:
    // the same pass that trades horns first pushes overlapping unicorns
    // apart, and between that, the four-tenths hit cooldown and a contact
    // box of one and a bit, three of fifteen victims ever left their feet -
    // the rest slid past each other. So the trailer throws them itself. A
    // tagged victim goes over the frame any charging unit comes within
    // reach, once, thrown along the charge and splayed out from whatever
    // reached it: the whole rank goes down, and it goes down like pins.
    if (g.pins) {
      const P0 = leaders[0], cx = Math.cos(P0.yaw), cz = Math.sin(P0.yaw), R2 = g.pins.reach * g.pins.reach;
      for (const u of units) {
        if (!u.pin || u.pinned || u.st !== 0) continue;
        let by = null;
        for (const o of units) {
          if (o.st !== 0 || (o.lead !== 0 && o !== P0)) continue;
          const ax = u.x - o.x, az = u.z - o.z;
          if (ax * ax + az * az < R2) { by = o; break; }
        }
        if (!by) continue;
        u.pinned = 1; u.st = 1; u.lead = -1; u.daze = 2;
        const dx = u.x - by.x, dz = u.z - by.z, d = Math.hypot(dx, dz) || 1;
        const ox = dx / d * .6 + cx, oz = dz / d * .6 + cz, on = Math.hypot(ox, oz) || 1;
        const sp = g.pins.out * (.75 + Math.random() * .5);
        u.vx = ox / on * sp; u.vz = oz / on * sp; u.vy = g.pins.up * (.75 + Math.random() * .5);
        u.y = Math.max(u.y, .25); u.spin = 12 + Math.random() * 16; u.roll = Math.random() * 6;
      }
    }
    // `pin: 0` is as near to standing as the game allows - the step still
    // eases toward eleven, so it creeps, which reads as an animal shifting
    // its weight rather than one frozen in place.
    if (g.pin !== undefined && P.st === 0) P.spd = g.pin;
    if (g.yaw !== undefined && P.st === 0) P.yaw = g.yaw;
    // A charge held short of ignition: the herd runs hard and its horns
    // count, and nothing lights.
    if (g.charge !== undefined) { P.charge = g.charge; P.chg = 1; P.cool = 0; }
    if (g.aim) {
      const R = leaders[1];
      // Both lit, and KEPT lit. Whatever puts one of them out on the way in
      // - a cooldown left over from the cutaway before, a heart lost - the
      // shot is two rainbows meeting, so either one that is dark and able
      // to light is lit again. The first take of this detected its clash on
      // frame one, because one band went out the instant the shot began.
      for (const L of [P, R]) {
        if (!L.wave && L.st === 0) { L.cool = 0; L.charge = 1; L.chg = 1; L.wave = 1 + L.n; L.burn = 9; L.spent = 0; }
        if (L.wave) { L.burn = Math.max(L.burn, 1.5); L.cool = 0; }
        L.stun = 0;
      }
      P.yaw = Math.atan2(R.z - P.z, R.x - P.x); R.yaw = Math.atan2(P.z - R.z, P.x - R.x);
      P.spd = g.aim; R.spd = g.aim;
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
    if (s.fx) window.FBGL(s.fx);
    // The flash: on the geometry through the shader, and on the air
    // through the tint. Both from the same colour and the same moment.
    const fl = s.flash || { col: [0, 0, 0], k: 0 };
    window.FBGL({ flash: fl.col.map((c) => c * fl.k), dir: fl.dir || [0, 1, 0] });
    tint.style.background = `rgb(${fl.col.map((c) => Math.min(255, c * 160) | 0).join(',')})`;
    tint.style.opacity = Math.min(1, fl.k * (fl.air ?? .5));
    const { leaders } = window.FB;
    const P = leaders[0], R = leaders[1];
    const wasLit = !!P.wave, bothLit = !!(P.wave && R.wave);
    const wasUp = P.st === 0;
    if (s.guard) guard(s.guard, s.dtGame);
    camera(s.cam, s.shotId, s.u);
    window.__pump(s.dtGame * 1000);
    // The white is a flash washing outward from the blast, not a cut to a
    // white card: a disc that grows past the corners while it brightens.
    const wk = Math.max(s.white ?? 0, Math.min(1, window.FB.flash * 1.2));
    const wr = (s.whiteR ?? 1) * 150;
    white.style.background = wr >= 149 ? '#fff'
      : `radial-gradient(circle at 50% 52%, #fff ${wr.toFixed(1)}%, rgba(255,255,255,0) ${(wr * 1.7 + 6).toFixed(1)}%)`;
    white.style.opacity = wk;
    const dCent = Math.hypot(R.cx - P.cx, R.cz - P.cz);
    // A clash is only believed once both bands have burned together for a
    // few frames AND they are actually near each other: on the first frame
    // of a staged shot the two are eighty units apart and anything that
    // reads as a boom there is a staging artefact, not a collision.
    if (P.wave && R.wave) window.__arm = (window.__arm || 0) + 1;
    const armed = (window.__arm || 0) > 5 && dCent < 60;
    // The seam. Two rainbows meeting is, on its own, a ring on the ground
    // and a spark in the gap between them - true to the game and much too
    // small to end a film on. So the moment it happens the trailer lets off
    // its own ordnance along the line where they touched.
    if (armed && bothLit && !(P.wave && R.wave) && !window.__blew) {
      window.__blew = 1;
      const mx = (P.cx + R.cx) / 2, mz = (P.cz + R.cz) / 2;
      const ax = -(R.cz - P.cz), az = R.cx - P.cx, an = Math.hypot(ax, az) || 1;
      window.FB.boom(mx, mz, 34);
      for (let i = 1; i <= 3; i++) for (const sgn of [-1, 1]) {
        window.FB.boom(mx + ax / an * i * 9 * sgn, mz + az / an * i * 9 * sgn, 30 - i * 5);
      }
    }
    return {
      ignited: !wasLit && !!P.wave, boom: armed && bothLit && !(P.wave && R.wave), dCent, wave: P.wave, n: P.n, charge: P.charge, mode: window.FB.mode,
      // For the take-failed report below: where the player was and what it had.
      st: P.st, hearts: P.hearts, at: [Math.round(P.x), Math.round(P.z)], alive: leaders.filter((L) => L.st !== 3).length,
      thrown: (wasUp && P.st === 1) || window.__ran === 1,
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
    // Cues inside a shot: a herd sent across the frame, a fog change, a
    // charge lit by hand. Each fires once, on the first frame past `at`.
    for (const [bi, b] of (shot.beats || []).entries()) {
      if (t >= b.at && !state['beat' + bi]) {
        state['beat' + bi] = 1;
        await (b.send ? b.send() : stage(b.fn, b.arg));
        // A fallback throw fires between frames, where the tick's "left
        // the ground this frame" cannot see it; it is a hit all the same.
        if (b.hit && !cues[shot.name + 'Hit']) cues[shot.name + 'Hit'] = +vt.toFixed(4);
      }
    }
    const sc = typeof shot.scale === 'function' ? shot.scale(info, state, t) : Array.isArray(shot.scale) ? shot.scale[0] + (shot.scale[1] - shot.scale[0]) * u : (shot.scale ?? 1);
    const ov = shot.overlay ? shot.overlay(t, u, info) : {};
    const g = typeof shot.guard === 'function' ? shot.guard(t, info, state) : (shot.guard || {});
    if (info && info.thrown && !cues[shot.name + 'Hit']) cues[shot.name + 'Hit'] = +vt.toFixed(4);
    info = await page.evaluate((s) => window.__tick(s), {
      // An `until` shot has no `u` to ease along - it runs to an event, not
      // to a length - so its camera can only move if the overlay moves it.
      // The finale's lens sat sixty units out for the whole take because of
      // this, and two rainbows meeting read as two white blobs.
      dtGame: DT * sc, cam: shot.cam ? { ...shot.cam, ...(ov.cam || {}), shake: ov.shake ?? shot.cam.shake } : null, shotId: shot.id, u, guard: g,
      fx: ov.fx, flash: ov.flash, white: ov.white,
      black: ov.black ?? (shot.card ? 1 : 0), card: ov.card ?? 0, cardText: text(shot.card, t), cardColor: shot.cardColor,
      note: ov.note ?? (shot.note ? 1 : 0), noteText: text(shot.note, t),
      title: ov.title ?? 0, titleText: shot.title || '', count: ov.count ?? 0, whiteR: ov.whiteR,
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
    // Every unicorn that joins gets a frame, so the score can ring a bell
    // on it: the herd growing is the thing the gather is about, and a
    // number climbing in a corner is not a feeling.
    if (info && state.lastN !== undefined && info.n > state.lastN) {
      for (let k = state.lastN; k < info.n; k++) (cues.joins = cues.joins || []).push(+vt.toFixed(4));
    }
    if (info) state.lastN = info.n;
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
  // The rivals are set dressing, or driven by the guard: brains off for the
  // whole cut. Left on they hunt the hero's followers loose faster than a
  // gather can add them.
  for (const L of window.FB.leaders) if (L.ai) L.ai = null;
}, PLAYER);
// The rainbow, dressed for the camera. The game's arch is seven thin
// shells with a hole down the middle, which is right at a hundred and
// twenty frames a second on a phone and reads as a croissant on a fifty
// inch screen. FBFX fills it: `shells` more of them inside the innermost
// colour running to white, `core` how much, `fist` how much harder the
// newest samples get it - the white plasma punch on the front of the band
// - and `bulge` how much wider the head is than the tail.
await stage((fx) => { window.FBFX = fx; }, process.env.FB_NOFX ? null : { shells: 7, core: .55, fist: 3.4, fistN: 6, bulge: .14 });

let id = 0;
const S = (o) => ({ id: id++, ...o });

// A rival herd sent across the hero's path from one side, at speed, with
// its charge up so its horns count - or lit, so its rainbow does. Aimed at
// where the hero WILL be, `lead` units on, since the hero keeps walking.
// `ang` is where it comes FROM, measured off the hero's own heading. A
// right angle sends it clipping across a frame edge; a hundred and fifteen
// degrees starts it behind the hero's shoulder and runs it forward through
// the middle of the shot, toward the lens, so the hit lands centre frame.
const crossHerd = (i, side, lit, lead, size = 18, ang = 2.0) => stage(({ i, side, lit, lead, size, ang }) => {
  const { units, leaders } = window.FB, P = leaders[0], R = leaders[i];
  const px = Math.cos(P.yaw), pz = Math.sin(P.yaw);
  const a = P.yaw + side * ang;
  const sx = Math.cos(a), sz = Math.sin(a);
  const tx = P.x + px * lead, tz = P.z + pz * lead;
  R.x = tx + sx * 30; R.z = tz + sz * 30; R.yaw = Math.atan2(-sz, -sx);
  R.st = 0; R.stun = 0; R.hearts = 3; R.cool = 0; R.spd = 30; R.charge = .8; R.chg = 1; R.y = 0;
  let n = 0;
  for (const u of units) {
    if (u.lead >= 0 || u.st === 3 || leaders.includes(u)) continue;
    if (n >= size) break;
    u.lead = i; u.col = R.col; u.st = 0; u.daze = 0;
    u.x = R.x - Math.cos(R.yaw) * 3 + (Math.random() - .5) * 10; u.z = R.z - Math.sin(R.yaw) * 3 + (Math.random() - .5) * 10; n++;
  }
  R.n = n;
  if (lit) { R.charge = 1; R.wave = 1 + n; R.burn = 9; R.spent = 0; }
}, { i, side, lit, lead, size, ang });
// Belt and braces for the two falls: if the physics has not thrown the
// hero by the frame it should have, throw it. Same pose, same tumble - the
// game's own - just not left to a horn's dice.
const throwHero = (vx, vz, vy) => stage(([vx, vz, vy]) => {
  const P = window.FB.leaders[0];
  if (P.st === 0) { P.st = 1; P.y = .15; P.vx = vx; P.vz = vz; P.vy = vy; P.roll = 0; P.spin = 4 + Math.random() * 3; P.chg = 0; P.charge = 0; }
}, [vx, vz, vy]);
const RGB = (hex) => [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16) / 255);
const flashes = (list) => (t) => {
  let best = null;
  for (const f of list) {
    const k = t < f.at ? 0 : Math.max(0, 1 - (t - f.at) / f.len) ** 1.6 * f.gain;
    if (k > 0 && (!best || k > best.k)) best = { col: f.col, dir: f.dir, k, air: f.air ?? .4, boom: f.boom };
  }
  return best;
};

// --- I. a face in the dark ---------------------------------------------------
// The hero at the origin facing +x, everything else forty units off. The
// lens is a hand's width from its face. What lights it is a fight it is
// not in: rainbows going off out of frame, one colour at a time, and two
// explosions, white, with the camera flinching.
await stage(() => {
  const { units, leaders } = window.FB, P = leaders[0];
  P.x = 0; P.z = 0; P.yaw = 0; P.spd = 0;
  for (const u of units) if (u !== P && Math.hypot(u.x - P.x, u.z - P.z) < 42) {
    const a = Math.random() * Math.PI * 2, r = 42 + Math.random() * 20;
    u.x = P.x + Math.cos(a) * r; u.z = P.z + Math.sin(a) * r;
  }
});
const WHITE = [1, .96, .9];
const FACE_FLASHES = [
  // Four, not seven. A fight next door is a thing you catch glimpses of;
  // seven in five seconds is a disco.
  { at: 1.15, col: RGB(RAINBOW[4]), dir: [1, .4, 1], len: .45, gain: 1.5, air: .26 },
  { at: 2.55, col: WHITE, dir: [1, .3, .7], len: .8, gain: 1.5, air: .2, boom: 1 },
  { at: 3.9, col: RGB(RAINBOW[0]), dir: [1, .5, -1], len: .45, gain: 1.6, air: .26 },
  { at: 4.85, col: RGB(RAINBOW[6]), dir: [1, .6, 1.2], len: .5, gain: 1.4, air: .24 },
];
const faceFlash = flashes(FACE_FLASHES);
await shoot(S({
  name: 'face', dur: bars(3), scale: 1, guard: { pin: 0, yaw: 0 },
  // Three-quarters, head and neck: the head is a box with a horn and a
  // mane, and a lens on the box alone is a lens on a box. From the front
  // quarter the horn, the jaw and the mane make it an animal.
  cam: { subj: 0, e0: [3.3, 1.4, 1.5], e1: [2.85, 1.15, 1.45], l0: [.8, 0, 1.35], fov0: .55, fov1: .5, ease: 'io' },
  overlay: (t) => { const f = faceFlash(t); return { black: fout(t, 0, 1.2), flash: f, shake: f && f.boom ? f.k * .1 : 0 }; },
}));
cues.faceFlashes = FACE_FLASHES.map((f) => ({ at: +(cues.face + f.at).toFixed(3), boom: !!f.boom }));

// --- II. sets off, hopeful ------------------------------------------------------
// The lens ahead of it, backing away as it comes on. Then a herd.
// Backing away ahead of it, and widening as it goes: by the hit the lens
// is far enough out and open enough to hold the herd arriving AND the hero
// it arrives on, with the impact in the middle of the frame.
const WALK = { subj: 0, e0: [4.2, .5, 1.25], e1: [10.5, 1.9, 2.3], l0: [.7, 0, 1.15], fov0: .7, fov1: .95, ease: 'lin' };
// The ground, felt before the herd is seen: nothing, then a tremor that
// grows over the last second and a quarter into the hit.
const tremor = (t, hit) => Math.max(0, Math.min(1, (t - (hit - 1.25)) / 1.25)) ** 2 * .34;
const HIT1 = bars(2.5) - 1.15;
await shoot(S({
  name: 'walk1', dur: bars(2.5), scale: 1, cam: WALK,
  guard: (t) => (t < HIT1 - 1.0 ? { pin: 5.5, yaw: 0 } : { mortal: 1, horns: 1, pin: 5.5, drive: [{ i: 1, spd: 30, charge: .8 }] }),
  overlay: (t) => ({ shake: tremor(t, HIT1) }),
  beats: [
    { at: HIT1 - 1.0, send: () => crossHerd(1, 1, false, 5.5) },
    { at: HIT1 + .25, hit: 1, fn: ([vx, vz, vy]) => { const P = window.FB.leaders[0]; if (P.st === 0) { P.st = 1; P.y = .15; P.vx = vx; P.vz = vz; P.vy = vy; P.roll = 0; P.spin = 5; } }, arg: [2, -9, 8] },
  ],
}));

// --- III. down. up, like a hero. -------------------------------------------------
// The game's own knocked-flat pose, held for a bar and a half; then let go
// of, at a third of speed, and the game rolls it back onto its feet. Then
// it shakes it off - a wiggle the game does not have, done to its yaw.
const LIE1 = bars(1.5), UP1 = LIE1 + 1.9;
await shoot(S({
  name: 'down1', dur: bars(3), 
  scale: (info, st, t) => (t < LIE1 ? 1 : t < UP1 ? .32 : 1),
  guard: (t) => (t < LIE1 ? { lie: 1 } : t < UP1 ? { pin: 0 } : { pin: 0, yaw: Math.sin((t - UP1) * 26) * .26 * fout(t, UP1 + .1, .7) }),
  cam: { subj: 0, orbit: { a0: 2.55, a1: 2.15, r0: 4.8, r1: 3.7, h0: .5, h1: .85 }, l0: [0, 0, .6], l1: [0, 0, 1.15], fov0: .68, ease: 'io' },
}));

// --- IV. up, and standing ------------------------------------------------------
// It does NOT set off again. It gets up, it stands there, and the lens
// backs away and settles - and the shot waits, holding on an animal with
// nowhere to be, until the rainbow arrives. A second identical walk was
// the joke; a second identical walk is also two of the same shot.
const HITW = bars(2.75) - 1.05;
await shoot(S({
  // Three and a quarter bars, not two and three quarters: the wall reaches
  // him about four and a quarter in and then needs the better part of a
  // second to clear him, and the old length cut while he was still under
  // it.
  name: 'wait', dur: bars(3.25), scale: 1,
  stage: () => { const P = window.FB.leaders[0]; P.yaw = 0; P.up = 0; P.st = 0; P.y = 0; P.spd = 0; },
  guard: (t) => (t < HITW - 1.0 ? { pin: 0, yaw: 0 } : { mortal: 1, pin: 0, drive: [{ i: 2, spd: 30 }], run: { i: 2, spd: 16 } }),
  // Out and up, decelerating: the camera runs out of interest before the
  // rainbow does.
  cam: { subj: 0, e0: [4.6, .6, 1.35], e1: [13, 2.6, 2.7], l0: [.7, 0, 1.2], fov0: .72, fov1: .95, ease: 'out' },
  overlay: (t) => ({ shake: tremor(t, HITW) }),
  // The fall itself is the guard's `run`, off the geometry - no beat here
  // can be early or late, and none can out-race hurt().
  beats: [{ at: HITW - 1.0, send: () => crossHerd(2, -1, true, 8) }],
}));

// --- V. kaput. the crane. ---------------------------------------------------------
// When the explosions go off, in seconds from the top of the shot. The
// score gets these, so each one has a sound.
const CRANE_BOOMS = [.7, 2.2, 3.5, 4.6, 5.7, 6.6, 7.4];
// Flat, and staying flat. The lens goes straight up off it, turning, and
// the fog is pushed out so the top of the move sees the whole plain: two
// pairs of rainbows meeting, two herds trampling across, and explosions.
await shoot(S({
  name: 'crane', dur: bars(4.5), scale: 1,
  guard: { lie: 1, wide: 1, pairs: [[1, 2], [3, 4]], drive: [{ i: 5, spd: 17, charge: .8 }, { i: 6, spd: 17, charge: .8 }] },
  stage: () => {
    const { units, leaders } = window.FB, P = leaders[0];
    window.FBGL({ fog: [60, 700], glow: 1.7 });
    const put = (i, x, z, yaw, n, lit) => {
      const L = leaders[i];
      L.x = P.x + x; L.z = P.z + z; L.yaw = yaw; L.st = 0; L.stun = 0; L.hearts = 3; L.cool = 0; L.y = 0; L.spd = 12;
      let k = 0;
      for (const u of units) {
        if (u.lead >= 0 || u.st === 3 || leaders.includes(u)) continue;
        if (k >= n) break;
        u.lead = i; u.col = L.col; u.st = 0; u.daze = 0; u.x = L.x + (Math.random() - .5) * 7; u.z = L.z + (Math.random() - .5) * 7; k++;
      }
      L.n = k;
      if (lit) { L.charge = 1; L.chg = 1; L.wave = 1 + k; L.burn = 9; L.spent = 0; } else { L.charge = .8; L.chg = 1; L.wave = 0; }
    };
    for (const u of units) if (u.lead >= 0 && !leaders.includes(u)) u.lead = -1;
    put(1, -46, 24, 0, 10, 1); put(2, 6, 24, Math.PI, 10, 1);
    put(3, -8, -34, 0, 9, 1); put(4, 44, -34, Math.PI, 9, 1);
    put(5, -70, 14, 0, 14, 0); put(6, 62, -16, Math.PI, 14, 0);
  },
  beats: CRANE_BOOMS.map((at, i) => ({ at, fn: ([dx, dz, pw]) => { const P = window.FB.leaders[0]; window.FB.boom(P.x + dx, P.z + dz, pw); },
    arg: [[-34, -18, 24], [40, 30, 30], [-20, 48, 26], [22, -52, 34], [-50, -40, 28], [58, 8, 30], [-6, 60, 36]][i] })),
  cam: { subj: 0, orbit: { a0: 2.3, a1: 2.3 + 2.7, r0: 3.4, r1: 16, h0: .8, h1: 86 }, l0: [0, 0, .3], l1: [0, 0, 0], fov0: .68, fov1: 1.0, ease: 'in' },
}));

// --- VI. how ------------------------------------------------------------------
await stage(() => window.FBGL({ fog: [30, 220], glow: 1.35 }));
await shoot(S(cardShot('cardGather', 'gather your herd.', bars(1))));

// Loose unicorns of the hero's colour, sown in a band down its nose. They
// are taken off whatever herd holds them, which is the only way to get
// enough of them: seventy followers exist and six rivals own most.
const sow = (n, from, to, width) => stage(({ n, from, to, width }) => {
  const { units, leaders } = window.FB, P = leaders[0];
  const c = Math.cos(P.yaw), s2 = Math.sin(P.yaw);
  let placed = 0;
  for (const u of units) {
    if (u === P || leaders.includes(u) || u.lead === 0 || u.st === 3) continue;
    if (placed >= n) break;
    u.lead = -1; u.col = P.col; u.st = 0; u.daze = 0; u.y = 0; u.vx = u.vz = 0; u.hit = 0;
    const d = from + (to - from) * (placed + .5) / n, w = (Math.random() - .5) * width;
    u.x = P.x + c * d + s2 * w; u.z = P.z + s2 * d - c * w;
    placed++;
  }
  return placed;
}, { n, from, to, width });

// Six seconds of it, in three looks, and the herd genuinely grows: the
// game's own join rule does the work (a loose one within five of the
// leader, or two and a half of a follower, is taken), and every join is a
// cue the score rings a bell on.
await place(-46, 8, 0);
await clearTheField(70);
await stage(() => {
  const { units, leaders } = window.FB, P = leaders[0];
  for (const u of units) if (u.lead === 0 && u !== P) { u.x = P.x - 3 + (Math.random() - .5) * 6; u.z = P.z + (Math.random() - .5) * 6; }
});
await sow(26, 8, 46, 15);
await shoot(S({
  name: 'gatherA', dur: bars(1.5), scale: 1, keys: [['ArrowUp', true]], guard: { pin: 15 },
  // Over its shoulder, the way the game rides: you see what it is running
  // into, and you see the band behind it thicken.
  cam: { subj: 'herd', follow: true, smooth: .11, e0: [-11, 0, 4.2], e1: [-13, 0, 5.0], l0: [10, 0, 1.4], fov0: .95, ease: 'lin' },
  overlay: (t) => ({ count: fin(t, .25, .45) }),
}));
await sow(20, 14, 44, 16);
await shoot(S({
  name: 'gatherB', dur: bars(1.25), scale: 1, guard: { pin: 15 },
  // Grass height, planted, and the whole thing sweeps over it - loose ones
  // on one side, herd on the other, the join happening between.
  cam: { subj: 'herd', plant: true, e0: [21, 5.5, 1.15], l0: [0, 0, 1.2], fov0: .85, ease: 'lin' },
  overlay: () => ({ count: 1 }),
}));
await sow(18, 12, 40, 14);
await shoot(S({
  name: 'gatherC', dur: bars(1.25), scale: 1, guard: { pin: 15 },
  // And back out: it is a herd now, not an animal with company.
  cam: { subj: 'herd', follow: true, smooth: .1, e0: [-16, -7, 7], e1: [-20, -9, 9], l0: [8, 0, 1.6], fov0: 1.0, ease: 'lin' },
  overlay: () => ({ count: 1 }),
}));

await shoot(S(cardShot('cardTrample', 'trample the rest.', bars(1))));
// Four looks at the same thing. The charge is held short of ignition
// throughout, so the herd runs hard and its horns count and nothing lights.
// A CLEAN STAGE each time. The first pass never put the last shot's
// victims away, so by the third there were forty-five unicorns from three
// dead herds standing in the same spot and a fifty-strong herd ploughed
// into a mush of them - which is why the trampling read as running over
// loose wildlife. Everything that is not ours goes to the far ring first,
// then one herd is built where the lens can see it get hit.
const victims = (i, x, z, n, from) => stage(({ i, x, z, n, from }) => {
  const { units, leaders } = window.FB, P = leaders[0], R = leaders[i];
  for (const u of units) {
    if (u === P || leaders.includes(u) || u.lead === 0) continue;
    u.lead = -1; u.st = 0; u.daze = 0; u.y = 0; u.vx = u.vz = u.vy = 0; u.hit = 0; u.pin = 0; u.pinned = 0;
    const a = Math.random() * Math.PI * 2;
    u.x = Math.cos(a) * 78; u.z = Math.sin(a) * 78;
  }
  for (let k = 1; k < leaders.length; k++) {
    const L = leaders[k];
    L.wave = 0; L.charge = 0; L.chg = 0; L.cool = 0; L.st = 0; L.stun = 0; L.hearts = 3; L.y = 0; L.n = 0;
    if (k !== i) { const a = k / 7 * Math.PI * 2; L.x = Math.cos(a) * 76; L.z = Math.sin(a) * 76; }
  }
  P.x = from; P.z = 0; P.yaw = 0; P.spd = 26; P.st = 0; P.y = 0;
  for (const u of units) if (u.lead === 0 && u !== P) { u.x = P.x - 4 + (Math.random() - .5) * 10; u.z = P.z + (Math.random() - .5) * 10; u.st = 0; u.y = 0; u.hit = 0; }
  R.x = x; R.z = z; R.yaw = Math.PI / 2;
  let k2 = 0;
  for (const u of units) {
    if (u.lead >= 0 || u.st === 3 || leaders.includes(u)) continue;
    if (k2 >= n) break;
    // Dazed on purpose. The fight loop staggers on the first horn and only
    // THROWS on the second, while the first is still reeling - so a herd
    // run down at twenty-six loses a couple of units into the air and the
    // rest just merge, which is what made the trampling read as a crowd.
    // Nine tenths of a second of daze is spent by the time they are
    // reached, and every horn that lands is the second one.
    u.lead = i; u.col = R.col; u.st = 0; u.daze = .85; u.y = 0;
    // Tagged, because scatter() sets `lead` to -1 the moment one is hit and
    // after that there is no way to tell a victim from any other loose
    // unicorn on the plain.
    u.pin = 1; u.pinned = 0;
    u.x = R.x + (Math.random() - .5) * 8; u.z = R.z + (Math.random() - .5) * 8; k2++;
  }
  R.n = k2;
  return k2;
}, { i, x, z, n, from });

await victims(3, 10, 1, 15, -16);
await shoot(S({
  name: 'trampleA', dur: bars(.75), scale: 1, guard: { charge: .75, pin: 26, pins: { out: 15, up: 11, reach: 2.4 } },
  cam: { subj: 'herd', follow: true, smooth: .12, e0: [-13, 0, 4.5], e1: [-11, 0, 4.0], l0: [9, 0, 1.4], fov0: .95, ease: 'lin' },
}));
// BULLET TIME. Down among them, and the clock drops to a quarter just as
// the horns land - the scatter is the game's own, six unicorns leaving the
// ground on their own arcs, and at full speed it was over before it read.
await victims(4, 8, 0, 15, -13);
await shoot(S({
  // The clock drops at four tenths, not seven: the centroids close in
  // under half a second and the old threshold caught the aftermath, which
  // is why a hit between two herds played as a crowd standing still.
  name: 'trampleB', dur: bars(1.75), scale: (info, st, t) => (t < .40 ? 1 : .22), guard: { charge: .75, pin: 26, pins: { out: 17, up: 13, reach: 2.6 } },
  // And up onto a rise, off the shoulder: at grass height inside a
  // fifty-strong herd the lens saw nothing but flanks, and the unicorn
  // actually leaving the ground was behind three that were not. From eight
  // up the wave of them going over reads as a wave.
  cam: { world: true, e0: [14, 5.2, 11.5], e1: [12.4, 4.6, 10.2], l0: [7.5, 1.6, 0], fov0: .95, ease: 'lin' },
}));
await victims(5, 9, 1, 15, -12);
await shoot(S({
  name: 'trampleC', dur: bars(.75), scale: 1, guard: { charge: .75, pin: 26, pins: { out: 15, up: 11, reach: 2.4 } },
  cam: { world: true, e0: [14, 4.6, 10], e1: [13, 4.2, 9.2], l0: [8.5, 1.4, 0], fov0: .95, ease: 'lin' },
}));
// And once more from where the player sits: the game's own third person,
// wide, ploughing straight through a herd that does not move.
await victims(6, 12, 0, 13, -20);
await shoot(S({
  name: 'plough', dur: bars(1.25), scale: 1, guard: { charge: .8, pin: 28, pins: { out: 15, up: 11, reach: 2.4 } },
  cam: { subj: 'herd', follow: true, smooth: .12, e0: [-15, 0, 5.5], e1: [-17, 0, 6.2], l0: [11, 0, 1.6], fov0: 1.0, ease: 'lin' },
}));

await shoot(S(cardShot('cardRainbow', 'become the rainbow.', bars(1))));
const HOLD = bars(2), HOLD_SCALE = [1, .35];
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
  cam: { subj: 'herd', follow: true, e0: [-13, 0, 3.2], e1: [-9, 0, 2.2], l0: [6, 0, 1.2], fov0: .85, fov1: .8, ease: 'io' },
}));
// Ignition on the first frame, at a fifth of speed, the lens low behind
// and pulling back into the arch as it opens.
await shoot(S({
  name: 'ignite', dur: bars(1), scale: .22, guard: { hold: 1 },
  stage: () => { const P = window.FB.leaders[0]; P.charge = 1; P.cool = 0; },
  cam: { subj: 'herd', e0: [-7, 3, 1.2], e1: [-17, 7, 4.8], l0: [5, 0, 1.6], l1: [3, 0, 2.4], fov0: .85, fov1: 1.05, ease: 'out' },
}));
await shoot(S({
  name: 'ride', dur: bars(1), scale: 1, guard: { hold: 1, pin: 26 },
  cam: { subj: 'herd', follow: true, smooth: .1, e0: [-26, -8, 12], e1: [-30, -10, 14], l0: [8, 0, 2.5], fov0: 1.0, ease: 'lin' },
}));

// Three quick ones from where the player sits, with the band lit: this is
// the thing the game is, and until now the trailer only showed a rainbow
// running at another rainbow. A herd is put in its path, the field is
// cleared of everything else, and the game's own chase view watches it go
// through - one herd per cut, half a bar each.
const bandVictims = (i, ahead, side, n) => stage(({ i, ahead, side, n }) => {
  const { units, leaders } = window.FB, P = leaders[0], R = leaders[i];
  for (const u of units) {
    if (u === P || leaders.includes(u) || u.lead === 0) continue;
    u.lead = -1; u.st = 0; u.daze = 0; u.y = 0; u.vx = u.vz = u.vy = 0; u.hit = 0;
    const a = Math.random() * Math.PI * 2;
    u.x = Math.cos(a) * 80; u.z = Math.sin(a) * 80;
  }
  for (let k = 1; k < leaders.length; k++) {
    const L = leaders[k];
    L.wave = 0; L.charge = 0; L.chg = 0; L.cool = 0; L.st = 0; L.stun = 0; L.hearts = 3; L.y = 0; L.n = 0;
    if (k !== i) { const a = k / 7 * Math.PI * 2; L.x = Math.cos(a) * 78; L.z = Math.sin(a) * 78; }
  }
  const c = Math.cos(P.yaw), s2 = Math.sin(P.yaw);
  R.x = P.x + c * ahead + s2 * side; R.z = P.z + s2 * ahead - c * side; R.yaw = P.yaw + Math.PI / 2;
  let g = 0;
  for (const u of units) {
    if (u.lead >= 0 || leaders.includes(u) || u.st === 3) continue;
    if (g >= n) break;
    u.lead = i; u.col = R.col; u.st = 0; u.daze = 0; u.y = 0;
    u.x = R.x + (Math.random() - .5) * 11; u.z = R.z + (Math.random() - .5) * 11; g++;
  }
  R.n = g;
  // Back to the recorder: where they ended up, and which way the band is
  // pointed. A ringside tripod has to be nailed to THEM - a shot that
  // tracks the player's centroid aims itself past the impact as the band
  // runs on through, which is how three cuts came out looking like an
  // empty plain with a herd on the horizon.
  return { x: R.x, z: R.z, yaw: P.yaw };
}, { i, ahead, side, n });

// Lit, the band is a dome of white a dozen units across, and everything it
// runs over is INSIDE that dome - so from behind, from the game's own
// shoulder, the trampling is a glow with a shape in it. The three cuts go
// ringside instead: the tripod is planted beside, in front of and above
// the path, the herd stands clear of the arc until the arc arrives, and
// the glow comes off so the animals read against it.
await stage(() => window.FBGL({ fog: [30, 300], glow: 1.0 }));
// The band's own radius is twelve units and its arch reads twice that, so
// a herd put twenty ahead is already inside the white when the cut opens.
// Twenty-six clears the leading edge: they stand there for a third of a
// second, and then they do not.
// Offsets below are [along, side, height] about the VICTIMS, with `along`
// running the way the band is coming - so every tripod goes at POSITIVE
// along, past them, looking back down the barrel. Put one at negative
// along and the wall spends the cut behind the lens.
//
// `ahead` is measured from the LEADER but the burn is measured from the
// CENTROID, which at thirty a second trails him by fourteen: eighteen
// ahead is a thirty-two unit close, two thirds of a second, and the cut is
// three quarters of a bar so the scatter gets the back half of it.
const BANDS = [
  // grass height, alongside the impact: the wall arrives through frame left
  { i: 2, ahead: 18, e: [9, 14, 2.6], l: [0, 0, 2.2], fov: .95 },
  // head on, twenty past them: they are in the foreground and it is behind.
  // Three units off the axis, no more - much more and it reads as the band
  // running past them rather than into them.
  { i: 3, ahead: 19, e: [20, 3, 2.6], l: [0, 0, 3.2], fov: 1.0 },
  // over the far shoulder, looking down into the moment of contact
  { i: 4, ahead: 18, e: [8, -13, 8], l: [0, 0, 1.4], fov: .9 },
];
for (let k = 0; k < BANDS.length; k++) {
  const b = BANDS[k];
  const V = await bandVictims(b.i, b.ahead, 0, 22);
  const c = Math.cos(V.yaw), sn = Math.sin(V.yaw);
  const W = (o) => [V.x + c * o[0] + sn * o[1], o[2], V.z + sn * o[0] - c * o[1]];
  await shoot(S({
    name: `band${k + 1}`, dur: bars(.75), scale: 1, guard: { hold: 1, pin: 30 },
    cam: { world: true, fov0: b.fov, ease: 'lin', e0: W(b.e), l0: W(b.l) },
  }));
}
await stage(() => window.FBGL({ fog: [30, 220], glow: 1.35 }));

// --- VII. two rainbows ---------------------------------------------------------
// Two shots, because one was a riddle. The first is down the barrel from
// behind our own band - our arch across the bottom of the frame, the OTHER
// one coming on down the plain - and the second is the meeting itself.
//
// Both bands are built by the same hand so they are the same size. Every
// loose unit goes back in the pot first: after three cutaways the free
// ones are all spoken for, and a rival assembled out of what was left came
// out a third of ours - two mismatched white blobs at sixty units, which
// is what "you have to guess what is happening" looks like.
const stageDuel = (sep, rivalN) => stage(({ sep, rivalN }) => {
  const { units, leaders } = window.FB, P = leaders[0], R = leaders[1];
  for (const u of units) {
    if (u === P || u.lead === 0 || leaders.includes(u)) continue;
    u.lead = -1; u.st = 0; u.daze = 0; u.y = 0; u.vx = u.vz = u.vy = 0; u.hit = 0;
  }
  P.x = -sep; P.z = 0; P.yaw = 0; P.charge = 1; P.chg = 1; P.wave = 1 + P.n; P.burn = 9; P.cool = 0; P.spent = 0; P.spd = 12; P.st = 0; P.y = 0;
  for (const u of units) if (u.lead === 0 && u !== P) { u.x = P.x - 3 + (Math.random() - .5) * 8; u.z = P.z + (Math.random() - .5) * 8; u.st = 0; u.y = 0; }
  R.x = sep; R.z = 0; R.yaw = Math.PI; R.st = 0; R.stun = 0; R.cool = 0; R.hearts = 3; R.spd = 12; R.y = 0;
  let given = 0;
  for (const u of units) {
    if (u.lead >= 0 || leaders.includes(u)) continue;
    if (given >= rivalN) break;
    u.lead = 1; u.col = R.col; u.st = 0; u.daze = 0; u.y = 0;
    u.x = R.x + 3 + (Math.random() - .5) * 7; u.z = R.z + (Math.random() - .5) * 7; given++;
  }
  R.n = given; R.charge = 1; R.chg = 1; R.wave = 1 + given; R.burn = 9; R.spent = 0;
  for (let i = 2; i < leaders.length; i++) {
    const L = leaders[i], a = Math.PI + ((i - 2) / 4 - 0.5) * 1.6;
    L.wave = 0; L.charge = 0; L.chg = 0; L.st = 0; L.y = 0; L.n = 0;
    L.x = Math.cos(a + Math.PI / 2) * 64; L.z = -Math.abs(Math.sin(a + Math.PI / 2) * 64) - 20;
  }
  window.__arm = 0; window.__blew = 0;
  return { pn: P.n, rn: given };
}, { sep, rivalN });

// Close up, a rainbow at the glow the cutaways used is a white wall with a
// coloured rim. The finale is the one place the colour has to survive.
await stage(() => window.FBGL({ fog: [30, 260], glow: 1.1 }));
await stageDuel(55, 30);
await shoot(S({
  name: 'duel', dur: bars(1.5), scale: 1, guard: { aim: 14 },
  // Thirty-four back off our own leader - eight clear of our own arch, so
  // it sits across the bottom of the frame instead of over the lens - and
  // aimed forty ahead, where the other one is growing.
  cam: { subj: 0, follow: true, smooth: .18, e0: [-34, 0, 4.2], e1: [-36, 0, 4.6], l0: [40, 0, 6], fov0: 1.0, ease: 'lin' },
}));

// And the meeting. The lens starts back and high, where both bands read as
// bands, and comes down and in as they close - driven off the distance
// between them, because an `until` shot has no `u` to ease along.
const meetCam = (d) => {
  const k = Math.min(1, Math.max(0, (52 - d) / 26));
  // Nine up at the closest, not six: at six the lens grazes the plain's own
  // relief and the tiles cut a hard black staircase out of the bottom of
  // both arches - invisible until the cores went bright.
  return { e0: [0, 20 - 11 * k, 44 - 24 * k], l0: [0, 3 + 2 * k, 0], fov0: 1.0 + .2 * k };
};
let boomT = null;
await stageDuel(26, 30);
await shoot(S({
  name: 'approach', until: (info, st, t) => (st.boomAt !== undefined && t - st.boomAt > 2.6) || t > 9,
  scale: (info, st, t) => {
    if (info && info.boom) st.boomAt = t;
    // Slower still after the hit, and held: the last cut ran the blast off
    // in a third of a second and went to white before it had opened.
    if (st.boomAt !== undefined) return .12;
    // Thirty-four, not twenty-five: two bands of the same size touch at
    // twenty-two, so the old threshold left four tenths of a second of slow
    // motion before the hit.
    return info && info.wave && info.dCent < 34 ? .18 : 1;
  },
  slowCue: 'slowmo',
  guard: { aim: 12 },
  // Side on: both bands in one frame, both already running. The eye is
  // placed by the overlay, frame by frame, off how far apart they are.
  cam: { world: true, ...meetCam(52), ease: 'lin' },
  overlay: (t, u, info) => {
    if (info && info.boom && boomT === null) boomT = t;
    const cam = meetCam(info ? info.dCent : 52);
    // The white comes late, and then SPREADS: a disc opening from the
    // blast, past the corners, over a second and a half. Cutting to a
    // white card in a third of a second is a cut, not a flash.
    if (boomT === null) return { cam, white: 0 };
    const k = fin(t, boomT + 1.1, 1.5);
    return { cam, white: Math.min(1, k * 1.6), whiteR: k * k };
  },
}));

await browser.close();
cues.end = +vt.toFixed(4);
cues.hits = ['walk1Hit', 'waitHit'].map((k) => cues[k]).filter((v) => v !== undefined);
cues.craneBooms = CRANE_BOOMS.map((a) => +(cues.crane + a).toFixed(3));
writeFileSync(path.join(outDir, 'beats.json'), JSON.stringify({ fps: FPS, bpm: BPM, cues, duration: frame / FPS }, null, 2));
console.log(`  ignite ${cues.ignite?.toFixed(2)}s  slow-mo ${cues.slowmo?.toFixed(2)}s  clash ${cues.clash?.toFixed(2)}s`);
console.log(`wrote ${frame} frames to ${path.relative(root, framesDir)} @ ${FPS}fps (${(frame / FPS).toFixed(2)}s)`);

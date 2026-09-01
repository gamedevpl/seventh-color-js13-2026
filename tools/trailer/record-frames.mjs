// Frame-stepped, non-real-time capture: requestAnimationFrame and
// performance.now() are overridden with a virtual clock that only advances
// when we pump it, so every exported frame is exactly 1/FPS of *game* time
// apart no matter how slow the (software, SwiftShader) rendering actually
// is. Immune to CDP/rendering jank by construction - there is no wall clock
// in the loop at all.
//
// The session is cut like a trailer, not driven like one continuous
// gameplay camera: a REVEAL, then alternating POV (the photographer's
// viewfinder) and WIDE (a third-person angle at a different height,
// watching the unicorn perform in front of the flash) segments, with a
// couple of pure-motion SWEEPs between them. Every segment is a hard cut -
// no easing carried over from the last one.
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const framesDir = path.join(root, 'build', 'trailer', 'frames');
rmSync(framesDir, { recursive: true, force: true });
mkdirSync(framesDir, { recursive: true });
// The DEV build, not the shipping zip: every camera hook this script drives
// lives behind `if (DEV)` and is stripped from anything without --cheats.
const gamePath = path.join(root, 'build', 'snap', 'index.html');

const FPS = 30;
const DT_MS = 1000 / FPS;
const TEST = process.argv.includes('--test');

// Every tease shot stays a tight, partial crop - the whole animal is not
// shown until the reveal that opens the session. Angling the horn shot away
// from dead-on (below) turned out not to be enough on its own - one eye and
// a cheek is still a recognizable face at frame zero. The head-adjacent
// shots (horn, mane) now run in the MIDDLE of the tease instead of opening
// it - the very first thing on screen is the coat, which cannot read as a
// face no matter the angle.
const TEASE = [
  { name: 'coat',   bone: 0, ang: Math.PI * 0.55, fov: 0.40, dolly: 2.35, hold: 2.0, deco: ['GLITTER'] },
  { name: 'tail',   bone: 3, ang: Math.PI * 0.92, fov: 0.42, dolly: 2.1, hold: 2.0, deco: ['TAIL', 6] },
  { name: 'hooves', bone: 5, ang: Math.PI * 0.65, fov: 0.42, dolly: 2.0, hold: 2.0, deco: ['HOOF', 1] },
  { name: 'mane',   bone: 1, ang: Math.PI * 0.30, fov: 0.44, dolly: 2.7, hold: 2.0, deco: ['MANE', 2] },
  // ang was 0.10 - nearly dead-on - which framed both eyes symmetrically and
  // read as a full face-forward portrait. Angled now like every other tease
  // shot, and tightened so the crop reads as horn-and-forelock rather than
  // "a unicorn's head" - but it no longer has to carry that alone, since by
  // the time it's on screen three other shots have already played.
  { name: 'horn',   bone: 2, ang: Math.PI * 0.18,  fov: 0.36, dolly: 2.6, hold: 2.0, deco: ['HORN', 5] },
];
// The beat before the drop holds on the eye - still tight, still a held
// breath, never the whole animal.
const ANTICIPATION = { bone: 2, ang: -0.28, fov: 0.42, dolly: 2.9, hold: 1.2 };

// The session's shot list. `pov` is the photographer's aim (tight, ends in
// a shutter click, shows the HUD). `wide` is a third-person angle at a
// different height watching the unicorn work, catching the flash from
// outside. `reveal`/`sweep` carry no shutter and exist to move the eye.
// angOff picks a different point on the tripod circle each cut - the
// point is a new vantage, not a pan.
const SESSION_SHOTS = [
  { type: 'reveal', dur: 2.1, ang: 0.35,  dolly: 4.4, eyeH: 0.8 },
  { type: 'pov',    dur: 1.8, ang: 3.0,   dolly: 4.6, eyeH: 1.15, fireAt: 1.4 },
  { type: 'wide',   dur: 2.0, ang: 1.5,   dolly: 3.6, eyeH: 0.42, fireAt: 0.5 },
  { type: 'sweep',  dur: 1.4, ang: -1.2,  dolly: 3.8, eyeH: 1.5 },
  { type: 'pov',    dur: 1.8, ang: -2.4,  dolly: 4.6, eyeH: 1.15, fireAt: 1.4 },
  { type: 'wide',   dur: 2.0, ang: -3.4,  dolly: 4.0, eyeH: 2.15, fireAt: 0.5 },
  { type: 'pov',    dur: 1.8, ang: 4.2,   dolly: 4.6, eyeH: 1.15, fireAt: 1.4 },
  { type: 'wide',   dur: 2.0, ang: 2.4,   dolly: 3.6, eyeH: 0.4,  fireAt: 0.5 },
  { type: 'sweep',  dur: 1.4, ang: -0.4,  dolly: 3.9, eyeH: 1.7 },
  { type: 'pov',    dur: 1.8, ang: -5.0,  dolly: 4.6, eyeH: 1.15, fireAt: 1.4 },
  { type: 'wide',   dur: 2.0, ang: -4.4,  dolly: 3.9, eyeH: 1.9,  fireAt: 0.5 },
];
const RESULTS_HOLD = 1.6;   // sit on the score before it slides away
const SHEET_EXIT = 0.5;     // the card's own slide-down-and-out
// After the card is gone, phase is 2 - which freezes act()/move(), so
// whatever pose was mid-cycle (a jump, a buck) just replays forever off
// anim.t with no new decision ever made, and it reads as flailing rather
// than posing. window.SNAPPHASE(1) resumes the live actor without calling
// layout(), so the HUD stays exactly as hidden as it already was: pure
// third-person, genuinely dynamic. The closing shot drops the punch-zoom
// and holds longer - a quiet beat to end on rather than another cut.
// The last shot is `approach`: a camera that does NOT move (an earlier cut
// had it chase the subject's nose at a fixed offset, which reads as the
// LENS doing the approaching - corrected per direct feedback: the tripod
// plants itself once, ahead of wherever the subject is facing at that
// instant, and only its height is allowed to drift over the shot; getting
// the animal to visibly close that distance under its own gait needs two
// more DEV hooks (SNAPAIM steers its heading at a fixed world point instead
// of the game's own random wander rate; SNAPGAIT commits it to a real
// locomoting pose and holds that pose for the whole shot) - without them
// the AI might spend the shot standing, grazing, or facing away, and a
// stationary camera earns nothing from a subject that never arrives.
const FINALE_SHOTS = [
  { type: 'wide',    dur: 1.4, ang: 2.0,  dolly: 3.3, eyeH: 0.35, subjectRelative: true },
  { type: 'sweep',   dur: 1.2, ang: -2.6, dolly: 3.6, eyeH: 1.9, subjectRelative: true },
  // GALLOP (2.3 u/s) covers the 3.4-unit dolly in under 1.5s of this 2.8s
  // shot, which left over a second for it to run PAST the planted camera
  // and recede again before the crossfade - confirmed on a render where the
  // subject was closer mid-shot than at the very end. TROT (1.06 u/s) can't
  // outrun the shot's own duration, so it's still visibly closing distance
  // right through to the crossfade instead of overshooting and pulling away.
  { type: 'approach', dur: 2.8, dolly: 3.4, eyeH: 1.3, eyeHEnd: 0.55, gait: 3 /* TROT */, noPunch: true },
];

// Two lines of the game's own tagline, split tease/drop like a real trailer
// card, plus one mechanic-teaser mid-session. Timed against DROP_AT once
// that's known, below.
const NARRATION = [];

const TEASE_TOTAL = TEASE.reduce((s, t) => s + t.hold, 0);
const DROP_AT = TEASE_TOTAL + ANTICIPATION.hold;
const SESSION_TOTAL = SESSION_SHOTS.reduce((s, t) => s + t.dur, 0);
const FINALE_TOTAL = FINALE_SHOTS.reduce((s, t) => s + t.dur, 0);
const TOTAL_SECONDS = DROP_AT + SESSION_TOTAL + RESULTS_HOLD + SHEET_EXIT + FINALE_TOTAL;
const TOTAL_FRAMES = Math.ceil(TOTAL_SECONDS * FPS);
const fireCount = SESSION_SHOTS.filter((s) => s.fireAt !== undefined).length;
console.log(`plan: tease ${TEASE_TOTAL.toFixed(1)}s, drop at ${DROP_AT.toFixed(1)}s, session ${SESSION_TOTAL.toFixed(1)}s (${fireCount} shots), total ${TOTAL_SECONDS.toFixed(1)}s = ${TOTAL_FRAMES} frames @ ${FPS}fps`);
if (fireCount !== 8) console.warn(`WARNING: ${fireCount} shutter clicks scheduled, film holds 8 - the shoot will end early or run out of film mid-shot`);

NARRATION.push(
  { text: 'It knows how good it looks…', from: 0.6, to: DROP_AT - 1.1 },
  { text: '…prove it.', from: DROP_AT, to: DROP_AT + 3.6 },
  { text: 'Frame it. Time it. Snap it.', from: DROP_AT + 9.5, to: DROP_AT + 13.0 },
);
const narrationAt = (vt) => {
  for (const cue of NARRATION) {
    if (vt < cue.from || vt > cue.to) continue;
    const fadeIn = Math.min(1, (vt - cue.from) / 0.5);
    const fadeOut = Math.min(1, (cue.to - vt) / 0.5);
    return { text: cue.text, opacity: Math.min(fadeIn, fadeOut) };
  }
  return { text: '', opacity: 0 };
};

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('pageerror', (e) => console.error('PAGE ERROR:', e.message));

await page.addInitScript(() => {
  window.__vnow = 0;
  let pending = [];
  window.requestAnimationFrame = (cb) => { pending.push(cb); return pending.length; };
  window.cancelAnimationFrame = () => {};
  // The game has exactly one real-wall-clock timer: takeShot() calls
  // setTimeout(endRound, 700) once film runs out, which is what actually
  // shows the results card. Leaving that on the real clock means the
  // results card appears at a real-time moment that depends on how fast
  // THIS run's software rendering happens to be - sometimes mid-session-shot,
  // sometimes well into the results-hold window - which our own real-time
  // polling watchers (armResultsScroll/Highlight) then race against with no
  // guarantee of catching a consistent virtual frame. Routing setTimeout
  // through the same virtual clock as rAF/performance.now makes the card's
  // appearance a deterministic virtual-time event instead of a race.
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
// The DEV window.SNAP* hooks are installed inside frame(), which has not
// run yet - one pump before anything else so they exist.
await page.evaluate((dt) => window.__pump(dt), DT_MS);

// Studio open + hide chrome - no timing pressure, nothing is being
// screenshotted yet.
await page.evaluate(() => {
  [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'OPEN THE STUDIO')?.click();
  const c = document.getElementById('c');
  const r = c.getBoundingClientRect();
  c.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 99, clientX: r.width / 2, clientY: r.height / 2, bubbles: true }));
  document.dispatchEvent(new PointerEvent('pointerup', { pointerId: 99, bubbles: true }));
  // `bar` (the styling controls) and `top` (the SESSION x/3 label) both
  // hide during the tease. Every other overlay (title, viewfinder, sheet,
  // flash) also uses inset:0 - matching on style.top/bottom would catch
  // them too and, worse, `openTheShoot` restoring by the same match would
  // un-hide the title screen along with the label. Match these two
  // specifically instead.
  document.querySelectorAll('div').forEach((d) => {
    if (d.style.touchAction === 'none' || d.textContent.includes('SESSION')) d.style.display = 'none';
  });

  // Trailer-only grading: a touch more contrast/saturation and a vignette,
  // purely cosmetic CSS on top of the canvas - never touches the shipped
  // renderer.
  const canvas = document.getElementById('c');
  canvas.style.filter = 'contrast(1.12) saturate(1.22) brightness(1.03)';
  const vignette = document.createElement('div');
  vignette.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:999998;'
    + 'background:radial-gradient(ellipse at 50% 46%, rgba(0,0,0,0) 52%, rgba(0,0,0,.4) 100%)';
  document.body.appendChild(vignette);

  // The narration card, styled like a trailer's own title cards - bottom
  // third, bold, drop-shadowed.
  const narration = document.createElement('div');
  narration.style.cssText = 'position:fixed;left:0;right:0;bottom:14%;text-align:center;'
    + 'pointer-events:none;z-index:999999;opacity:0;'
    + "font:900 52px 'Arial Black',Arial,sans-serif;color:#fff6dd;"
    + 'text-shadow:0 4px 18px rgba(0,0,0,.65);padding:0 6%';
  document.body.appendChild(narration);
  window.__narration = narration;
});

// Every zone/colour change is applied ONCE, up front, before any tease
// shot's camera is even set - not per-shot. Clicking a zone button starts
// the game's own "wink" flash (a light/dark cycle on that part, over
// ~0.78s of game time) as feedback, which is a nice subtle cue at normal
// zoom and looks like broken geometry in an extreme close-up. Applying
// everything before capture starts, then letting the one lingering wink
// settle in a silent pre-roll, keeps every tease shot's first frame clean.
const applyAllStyling = async () => {
  await page.evaluate(() => {
    const setZone = (zone, i) => {
      document.querySelector(`button[title="${zone}"]`)?.click();
      document.querySelector(`button[data-i="${i}"]`)?.click();
    };
    setZone('MANE', 2);
    setZone('TAIL', 6);
    setZone('HORN', 5);
    setZone('HOOF', 1);
    document.querySelector('button[title="GLITTER"]')?.click();
  });
};

// One in-page camera-driver function per shot, redefined at each cut; every
// pumped frame just calls it (cheap - no per-frame round trip of args).
const setTeaseCam = async (bone, ang, fov0, dolly0, still) => {
  await page.evaluate(([bone, ang, fov0, dolly0, still]) => {
    window.SNAPMOOD(0, 1);
    window.__shotT0 = performance.now();
    window.__camFn = () => {
      const el = (performance.now() - window.__shotT0) / 1000;
      const dolly = Math.max(dolly0 * 0.86, dolly0 - 0.22 * el);
      const fov = Math.max(fov0 * 0.86, fov0 - 0.022 * el);
      // Very little breathing here on purpose - `still` is the pre-drop
      // anticipation hold, which wants to sit still.
      const amp = still ? 0.02 : 0.06;
      const a2 = ang + Math.sin(el * 0.9) * amp;
      const ex = Math.sin(a2) * dolly, ey = 1.15, ez = Math.cos(a2) * dolly;
      const w = window.SNAPBONE(bone);
      let dx = w[0] - ex, dy = w[1] - ey, dz = w[2] - ez;
      const dl = Math.hypot(dx, dy, dz) || 1;
      window.SNAPCAM(Math.atan2(dx / dl, dz / dl),
        Math.max(-0.5, Math.min(0.6, Math.asin(Math.max(-1, Math.min(1, dy / dl))))),
        fov, a2, dolly);
    };
  }, [bone, ang, fov0, dolly0, still]);
};

const openTheShoot = async () => {
  await page.evaluate(() => {
    [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'START THE SHOOT')?.click();
    document.querySelectorAll('div').forEach((d) => { if (d.textContent.includes('SESSION')) d.style.display = ''; });
  });
};

// One hard-cut camera segment. `type` decides the character of the shot:
// pov aims tight and punches in before its shutter click; wide/reveal/sweep
// hold a third-person vantage at their own height and only drift gently.
const setSessionShot = async (shot) => {
  await page.evaluate((shot) => {
    window.__shotT0 = performance.now();
    let a = null, p = null, fov = shot.type === 'pov' ? 1.0 : 0.66;
    let fired = false;
    const AIM_LEAD = 0.75, AIM_TIGHT = 0.4, RELEASE = 0.35;
    window.__camFn = () => {
      const el = (performance.now() - window.__shotT0) / 1000;
      const S = window.SNAP;
      const sx = S && S.sub ? S.sub[0] : 0, sz = S && S.sub ? S.sub[1] : 0;
      let ang, ex, ez, dollyEff;
      if (shot.type === 'approach') {
        // A tripod, planted once. shot.camX/camZ are computed on the very
        // first frame only (ahead of wherever the subject happens to be
        // facing at that instant) and never touched again - the camera does
        // not chase anything after that. SNAPAIM/SNAPGAIT (fired once, same
        // moment) are what make the subject actually close that distance:
        // without them this is a fixed camera pointed at wherever the AI's
        // own random wander happens to leave the animal, which is usually
        // not "walking toward the lens".
        if (shot.camX === undefined) {
          const yaw0 = S ? S.yaw : 0;
          shot.camX = sx + Math.sin(yaw0) * shot.dolly;
          shot.camZ = sz + Math.cos(yaw0) * shot.dolly;
          window.SNAPAIM(shot.camX, shot.camZ);
          window.SNAPGAIT(shot.gait);
        }
        ex = shot.camX; ez = shot.camZ;
        ang = Math.atan2(ex, ez);
        dollyEff = Math.hypot(ex, ez) || 0.01;
      } else {
        const drift = shot.type === 'pov' ? 0.05 * el : 0.12 * Math.sin(el * 0.5);
        ang = shot.ang + drift;
        if (shot.subjectRelative) {
          // wide/sweep normally plant the tripod on a circle around the
          // ORIGIN, at radius `dolly` - camera-to-SUBJECT distance is only
          // `dolly` if the subject happens to be standing at the origin
          // too, and otherwise ranges anywhere from dolly-ROAM to
          // dolly+ROAM depending on luck. That slop is small and easy to
          // miss across a couple of session shots, but the finale's subject
          // has had several continuous seconds of AI-driven movement (not
          // the brief holds between session cuts) to wander well past its
          // usual roam radius by the time these shots start, and a couple
          // of finale renders came out as extreme, geometry-filling
          // close-ups because of exactly that - confirmed by logging the
          // actual camera-to-subject distance, which was far under the
          // configured dolly despite the camera math itself checking out.
          // Anchoring on the subject's OWN current position instead (same
          // trick 'approach' already uses) makes `dolly` the real distance
          // again regardless of where it's wandered.
          ex = sx + Math.sin(ang) * shot.dolly; ez = sz + Math.cos(ang) * shot.dolly;
          dollyEff = Math.hypot(ex, ez) || 0.01;
        } else {
          ex = Math.sin(ang) * shot.dolly; ez = Math.cos(ang) * shot.dolly;
          dollyEff = shot.dolly;
        }
      }
      // The one thing the planted 'approach' tripod is allowed to do on its
      // own: sink slowly toward eyeHEnd over the shot, a small deliberate
      // move rather than the camera doing the approaching.
      const eyeHNow = shot.eyeHEnd === undefined
        ? (shot.eyeH ?? 1.15)
        : shot.eyeH + (shot.eyeHEnd - shot.eyeH) * Math.min(1, el / shot.dur);
      const wantA = Math.atan2(sx - ex, sz - ez);
      const wantP = shot.type === 'pov'
        ? -0.05 + 0.08 * Math.sin(el * 0.3)
        : (eyeHNow < 1 ? 0.15 : eyeHNow > 1.8 ? -0.35 : -0.05);
      if (a === null) { a = wantA; p = wantP; } // hard cut - no carry-over drift
      const until = shot.fireAt !== undefined ? shot.fireAt - el : Infinity;
      const firing = until > -RELEASE && until < AIM_LEAD;
      // wide/sweep punch window, computed here too so the aim itself
      // tightens onto the subject for it - a punch-in with stale aim would
      // just zoom into empty background.
      const pStart = shot.dur * 0.38, pEnd = pStart + 0.3, pRelease = pEnd + 0.35;
      const punching = !shot.noPunch && shot.type !== 'pov' && shot.type !== 'reveal' && el > pStart && el < pRelease;
      const aiming = firing || punching;
      // approach's subject is actively closing distance under its own gait,
      // not just drifting like the fixed-tripod shots - the ambient 0.05
      // rate those use lets a gallop walk the animal clean out of frame
      // before the aim catches up (confirmed on an earlier render). The
      // same drift is also a much bigger angle at the eye as the subject
      // (not the camera, which is now planted) closes in, so the aim
      // tightens further as that subject-to-camera distance shrinks.
      const distToCam = Math.hypot(sx - ex, sz - ez);
      const near = shot.type === 'approach' ? Math.max(0, 1 - distToCam / shot.dolly) : 0;
      const aRate = aiming ? 0.6 : shot.type === 'pov' ? 0.14 : shot.type === 'approach' ? 0.25 + near * 0.45 : 0.05;
      const pRate = aiming ? 0.5 : shot.type === 'approach' ? 0.2 + near * 0.35 : 0.05;
      const da = ((wantA - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      a += da * aRate;
      p += (wantP - p) * pRate;
      p = Math.max(-0.5, Math.min(0.6, p));

      let fovTarget = 0.66, easeRate = 0.05;
      if (shot.type === 'reveal') {
        // A fast push through the reveal.
        fovTarget = Math.max(0.46, 0.72 - 0.16 * el);
        easeRate = 0.08;
      } else if (shot.type === 'pov') {
        fovTarget = until > 0 && until < AIM_LEAD ? AIM_TIGHT
          : until <= 0 && until > -RELEASE ? AIM_TIGHT : 0.88;
        easeRate = firing ? 0.16 : 0.05;
      } else if (shot.noPunch) {
        // The closing beat: no punch, just a slow settle - quiet on
        // purpose, and a touch wider than the other shots so a subject
        // that's actively walking/galloping toward camera has margin to
        // drift in frame before the (deliberately gentle) aim catches up.
        fovTarget = 0.72;
        easeRate = 0.02;
      } else {
        // wide/sweep: a hard punch-in partway through the shot so the cut
        // isn't just a held wide angle - a beat of real zoom energy.
        if (el > pStart && el < pEnd) { fovTarget = 0.32; easeRate = 0.3; }
        else if (el >= pEnd && el < pRelease) { fovTarget = 0.32; easeRate = 0.05; }
        else if (el >= pRelease) { fovTarget = 0.66; easeRate = 0.1; }
      }
      fov += (fovTarget - fov) * easeRate;
      fov = Math.max(0.34, Math.min(1.15, fov));
      window.SNAPCAM(a, p, fov, ang, dollyEff, eyeHNow);
      if (!fired && shot.fireAt !== undefined && el >= shot.fireAt) { window.SNAPFIRE(); fired = true; }
    };
  }, shot);
};

// A real setInterval (an earlier version of both watchers below) polls on
// real wall-clock time, which is exactly the kind of race the virtual-clock
// setTimeout override above was meant to eliminate: showSheet() builds the
// card in one synchronous call, but the interval might not get a turn on
// the main thread again for anywhere from a few to a few hundred real ms
// (software rendering keeps that thread busy), so `start` ends up captured
// at an unpredictable point in the virtual timeline - sometimes right when
// the card appears, sometimes noticeably after, which is what made the
// scroll/pop look instant or already-finished on some runs and not others.
// A MutationObserver fires as a microtask off the actual DOM mutation
// instead, so it resolves within the same pump() call that built the card -
// no polling interval, no real-time slop. But it only sees mutations AFTER
// observe() is called - if endRound()'s virtual timer already fired earlier
// in the session-shots loop (its exact virtual frame depends on where the
// last shutter click landed, which varies by shot list), the card can
// already exist by the time we arm this, and a pure observer would sit
// forever waiting for a mutation that already happened. Each watcher below
// checks synchronously once first, with the observer as a fallback for
// whichever case didn't already apply.
const armResultsScroll = async () => {
  await page.evaluate(() => {
    const findCard = () => [...document.querySelectorAll('div')].find((d) => d.style.overflowY === 'auto');
    const setup = (card) => {
      const start = performance.now(), dur = 550, from = card.scrollTop, to = card.scrollHeight - card.clientHeight;
      window.__scrollStep = () => {
        const now = performance.now();
        const k = Math.min(1, (now - start) / dur);
        card.scrollTop = from + (to - from) * k;
      };
    };
    const already = findCard();
    if (already && already.scrollHeight > already.clientHeight + 4) { setup(already); return; }
    const obs = new MutationObserver(() => {
      const card = findCard();
      if (!card || card.scrollHeight <= card.clientHeight + 4) return;
      obs.disconnect();
      setup(card);
    });
    obs.observe(document.body, { childList: true, subtree: true });
  });
};

// The results card, held plain, reads as a screenshot of app UI rather than
// a payoff - the score and the thumbs verdicts are the entire reward for a
// good session and nothing on screen said so. Per direct feedback, that
// needed a real rendered celebration rather than more CSS: a canvas overlay
// draws an actual confetti burst and expanding shockwave rings out from the
// score the instant the card appears, on top of the DOM text getting the
// same gold pop/glow and thumbs-up/down emphasis as before. The canvas is
// hand-simulated (position = start + velocity*t + gravity*t^2 each frame)
// and driven off the virtual clock exactly like the sheet-exit and
// narration - CSS transitions/keyframes or requestAnimationFrame-driven
// libraries animate on wall-clock time, not capture time, and would come
// out desynced from the frames actually being screenshotted.
const armResultsHighlight = async () => {
  await page.evaluate(() => {
    // Same MutationObserver reasoning as armResultsScroll above (including
    // the already-exists fallback) - a real-time poll here raced against
    // the same card and made the pop/confetti's `el` clock start at an
    // unpredictable virtual moment.
    const setup = (card) => {
      const headline = [...card.children].find((d) => /points|No usable frames/.test(d.textContent));
      card.querySelectorAll('div').forEach((d) => {
        const t = d.textContent;
        if (t.startsWith('\u{1F44D}')) {
          d.style.color = '#a05a10';
          d.style.fontWeight = '900';
          d.style.textShadow = '0 0 10px rgba(245,204,87,.55)';
        } else if (t.startsWith('\u{1F44E}')) {
          d.style.opacity = '0.42';
        }
      });
      if (headline) { headline.style.display = 'inline-block'; headline.style.color = '#a05a10'; }

      // A viewport-fixed canvas (an earlier version of this) drew the burst
      // at the score's on-screen position at the moment it fired - but the
      // card auto-scrolls to the bottom within the first 550ms, so the
      // confetti kept falling in place over whatever photo had scrolled
      // underneath it instead of traveling with the score. Making the
      // canvas an absolutely-positioned CHILD of the card's own scrolling
      // content (not the viewport) means the browser's normal scroll
      // carries it along with the headline, the same way the headline
      // itself moves.
      card.style.position = 'relative';
      const canvas = document.createElement('canvas');
      canvas.width = card.clientWidth; canvas.height = card.scrollHeight;
      canvas.style.cssText = `position:absolute;left:0;top:0;width:100%;height:${card.scrollHeight}px;pointer-events:none;z-index:5`;
      card.appendChild(canvas);
      const ctx = canvas.getContext('2d');
      const ox = headline ? headline.offsetLeft + headline.offsetWidth / 2 : canvas.width / 2;
      const oy = headline ? headline.offsetTop + headline.offsetHeight / 2 : 40;
      const COLORS = ['#f5cc57', '#fff6dd', '#f58cb2', '#7ae0a8', '#6bb2f2', '#b887f2', '#fa8c61'];
      const rng = (() => { let s = 17; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
      const N = 130;
      const bits = Array.from({ length: N }, () => {
        const ang = rng() * Math.PI * 2, spd = 90 + rng() * 260;
        return {
          vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd - 160,
          rot: rng() * Math.PI * 2, vr: (rng() - 0.5) * 14,
          w: 5 + rng() * 5, hgt: 3 + rng() * 4,
          color: COLORS[(rng() * COLORS.length) | 0],
          life: 1.0 + rng() * 0.5,
        };
      });
      const GRAV = 340;
      window.__resultsT0 = performance.now();
      window.__resultsFx = () => {
        const el = (performance.now() - window.__resultsT0) / 1000;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        for (const ringDelay of [0, 0.12]) {
          const rt = el - ringDelay;
          if (rt > 0 && rt < 0.9) {
            ctx.beginPath();
            ctx.arc(ox, oy, rt * 480, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(245,204,87,${Math.max(0, 0.5 - rt * 0.6)})`;
            ctx.lineWidth = 3;
            ctx.stroke();
          }
        }
        for (const b of bits) {
          if (el > b.life) continue;
          const x = ox + b.vx * el, y = oy + b.vy * el + 0.5 * GRAV * el * el;
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(b.rot + b.vr * el);
          ctx.globalAlpha = Math.max(0, 1 - el / b.life);
          ctx.fillStyle = b.color;
          ctx.fillRect(-b.w / 2, -b.hgt / 2, b.w, b.hgt);
          ctx.restore();
        }
        if (headline) {
          const scale = 1 + 0.5 * Math.exp(-el * 6) * Math.cos(el * 18);
          headline.style.transform = `scale(${Math.max(0.9, scale)})`;
          headline.style.textShadow = `0 0 ${Math.max(4, 18 - 12 * el)}px rgba(245,204,87,${Math.max(.2, .9 - el * 0.4)})`;
        }
        const glow = Math.max(0, 0.8 - el / 0.9);
        card.style.boxShadow = `0 0 ${40 + 30 * glow}px ${10 + 10 * glow}px rgba(255,205,90,${glow})`;
        if (el > 1.5) {
          window.__resultsFx = null;
          card.style.boxShadow = '';
          canvas.remove();
        }
      };
    };
    const findCard = () => [...document.querySelectorAll('div')].find((d) => d.style.overflowY === 'auto');
    const already = findCard();
    if (already) { setup(already); return; }
    const obs = new MutationObserver(() => {
      const card = findCard();
      if (!card) return;
      obs.disconnect();
      setup(card);
    });
    obs.observe(document.body, { childList: true, subtree: true });
  });
};

// --- the frame loop ----------------------------------------------------
let frame = 0, vt = 0;
const capture = async () => {
  const file = path.join(framesDir, `f${String(frame).padStart(6, '0')}.png`);
  await page.screenshot({ path: file });
  frame++;
};
const pump = () => page.evaluate(([dt, narr]) => {
  if (window.__camFn) window.__camFn();
  if (window.__scrollStep) window.__scrollStep();
  if (window.__resultsFx) window.__resultsFx();
  if (window.__narration) {
    const n = window.__narration;
    if (n.textContent !== narr.text) n.textContent = narr.text;
    n.style.opacity = narr.opacity;
  }
  if (window.__sheetEl) {
    const k = Math.min(1, (performance.now() - window.__sheetT0) / 500);
    window.__sheetEl.style.transform = `translateY(${k * 60}vh)`;
    window.__sheetEl.style.opacity = 1 - k;
    if (k >= 1) { window.__sheetEl.style.display = 'none'; window.__sheetEl = null; }
  }
  window.__pump(dt);
}, [DT_MS, narrationAt(vt)]);
const startSheetExit = async () => {
  for (let attempt = 0; attempt < 20; attempt++) {
    const found = await page.evaluate(() => {
      const card = [...document.querySelectorAll('div')].find((d) => d.style.overflowY === 'auto');
      let sheet = card;
      while (sheet && sheet.parentElement !== document.body) sheet = sheet.parentElement;
      if (!sheet) return false;
      sheet.style.transition = 'none';
      window.__sheetEl = sheet;
      window.__sheetT0 = performance.now();
      return true;
    });
    if (found) return;
    await new Promise((r) => setTimeout(r, 150));
  }
  console.warn('WARNING: results card never found - skipping the slide-away, finale will cut in under it');
};
const runFor = async (seconds) => {
  const n = Math.round(seconds * FPS);
  for (let i = 0; i < n; i++) { await pump(); await capture(); vt += DT_MS / 1000; }
};

// Style it all up front, then let the last zone's "wink" flash finish
// off-camera before a single frame is captured.
await applyAllStyling();
for (let i = 0; i < Math.round(0.9 * FPS); i++) await pump();
console.log('styling applied and settled');

const teaseList = TEST ? TEASE.slice(2, 4) : TEASE; // coat + tail, the two new/changed ones
for (const shot of teaseList) {
  await setTeaseCam(shot.bone, shot.ang, shot.fov, shot.dolly, false);
  await runFor(TEST ? 1.0 : shot.hold);
  console.log('tease', shot.name, 'done, frame', frame);
}
await setTeaseCam(ANTICIPATION.bone, ANTICIPATION.ang, ANTICIPATION.fov, ANTICIPATION.dolly, true);
await runFor(TEST ? 0.8 : ANTICIPATION.hold);
console.log('anticipation done, frame', frame);

await openTheShoot();
const shotList = TEST ? SESSION_SHOTS.slice(0, 3) : SESSION_SHOTS;
for (const shot of shotList) {
  await setSessionShot(shot);
  await runFor(TEST ? Math.min(shot.dur, 1.3) : shot.dur);
  console.log('session', shot.type, 'done, frame', frame);
}
if (!TEST) {
  // Armed HERE, not before the session loop, as a second line of defence:
  // endRound()'s card-reveal is now virtual-clock-deterministic (see the
  // setTimeout override above), but our own watchers below still poll for
  // it with a real setInterval, so arming late keeps their real-time-vs-
  // virtual-time slack small and bounded rather than accumulating across
  // the whole session-shots loop.
  await armResultsScroll();
  await armResultsHighlight();
  await runFor(RESULTS_HOLD);
  const dbg = await page.evaluate(() => ({
    phase: window.SNAP?.phase,
    hasCard: !![...document.querySelectorAll('div')].find((d) => d.style.overflowY === 'auto'),
    bodyLen: document.body.innerHTML.length,
  }));
  console.log('results hold done, frame', frame, JSON.stringify(dbg));

  await startSheetExit();
  await runFor(SHEET_EXIT);
  console.log('sheet exit done, frame', frame);

  // Resume the live actor for the finale. SNAPPHASE never calls layout(),
  // so the viewfinder overlay (crosshair/gauges/shutter) stays exactly as
  // hidden as it already was - but going back to phase 1 also re-arms two
  // OTHER elements that live outside that overlay and are driven straight
  // off `phase` every frame regardless: the coach hint ("drag to aim the
  // camera") and the SESSION/FILM/score header. Hiding them once here
  // holds, since neither is ever un-hidden by anything but a real layout().
  await page.evaluate(() => window.SNAPPHASE(1));
  await page.evaluate(() => {
    document.querySelectorAll('div').forEach((d) => {
      if (d.style.bottom === '248px' || d.textContent.includes('SESSION')) d.style.display = 'none';
    });
  });

  for (const shot of FINALE_SHOTS) {
    await setSessionShot(shot);
    await runFor(shot.dur);
    console.log('finale', shot.type, 'done, frame', frame);
  }
  const remaining = TOTAL_FRAMES - frame;
  for (let i = 0; i < remaining; i++) { await pump(); await capture(); vt += DT_MS / 1000; }
  console.log('done, frame', frame);
}

await browser.close();
console.log(`wrote ${frame} frames to ${framesDir} @ ${FPS}fps (${(frame / FPS).toFixed(2)}s)`);
console.log(`DROP lands at ${DROP_AT.toFixed(3)}s`);

// Is the shoot winnable WITHOUT playing it?
//
// This is the question Rainbow Surfer asked with --idle, and it caught a
// chase that handed itself over to a player who never touched the throttle.
// The same trap is wide open here and worse, because a job keeps the BEST of
// six frames: a player who never aims still gets six draws from the pose
// table, and if a rear happens on any of them the roll is already good. A
// score can look beautifully itemised and still be a lottery.
//
// Four policies, so a gap can be attributed rather than merely noticed:
//
//   idle     default camera, shutter on a timer - not playing at all
//   framed   aims carefully, shutter on a timer - composition only
//   timed    default camera, waits for a pose worth having - timing only
//   skilled  both, in a look chosen for nothing
//   dressed  skilled, and styled for the brief
//
// `dressed` exists because styling stopped being paint: the look now changes
// which poses the unicorn offers at all. A mechanic that changes the odds
// has to be worth something measurable, or it is decoration with extra
// steps - and nothing else in this probe would have noticed either way.
//
// If idle scores near skilled the game has no skill in it. If framed and
// timed are both near idle, the terms they feed are not worth their weight.
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'build', 'snap', 'index.html');
const JOBS = Number(process.argv.find((a) => /^--jobs=/.test(a))?.split('=')[1] || 6);
const ONLY = process.argv.find((a) => /^--policy=/.test(a))?.split('=')[1];

// Poses worth a photograph, mirroring act.js's SHOWY. A policy is allowed to
// know what a player can see; it is not allowed to read the score it is
// about to get, which would make it an oracle rather than a good player.
const SHOWY = [9, 6, 7, 10, 5];
// The tripod's radius and eye height, mirrored from main.js: the aiming
// policies work out where to point from where the subject actually is,
// which is what a player does by looking at it.
const R = 4.6, EYE_Y = 1.15, ASPECT = 900 / 620;
const THIRD = 1 / 3;

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 900, height: 620 } });
page.on('pageerror', (e) => { console.error('PAGE ERROR:', e.message); process.exitCode = 1; });

const probe = () => page.evaluate(() => window.SNAP);


const fire = () => page.evaluate(() => window.SNAPFIRE());
const setCam = (c) => page.evaluate((v) => window.SNAPCAM(...v), c);
const wait = (ms) => page.waitForTimeout(ms);

// This probe reads and drives the DEV hooks, which a shipping build compiles
// out entirely. Run against one, the first evaluate dies with "SNAPSHOT is
// not a function" and says nothing about why - which cost two runs before it
// was worth a guard.
async function requireDevBuild() {
  await page.goto(pathToFileURL(file).href, { waitUntil: 'load' });
  await wait(500);
  if (await page.evaluate(() => typeof window.SNAPSHOT !== 'function')) {
    console.error('\n  This needs a --cheats build; the packed one has no probes in it.');
    console.error('  Run: npm run snap:dev\n');
    await browser.close();
    process.exit(2);
  }
}
await requireDevBuild();

// The brief changes every job, so the look has to be chosen every job.
async function dress(policy) {
  if (!policy.styles) return;                    // whatever it came with
  const b = (await probe()).brief;
  const swatch = b.warm > 0 ? '6' : '2';         // coral, or sky
  for (const zoneName of ['COAT', 'MANE']) {
    await page.getByRole('button', { name: zoneName }).click();
    await page.locator(`button[data-i="${swatch}"]`).click();
  }
  // GLITTER cycles 0..3, and it starts wherever the last job left it.
  for (let i = 0; i < 4; i++) {
    if ((await probe()).deco.glitter === b.glit) break;
    await page.getByRole('button', { name: /GLITTER/ }).click();
  }
}

async function runJob(policy) {
  await dress(policy);
  await page.getByRole('button', { name: 'START THE SHOOT' }).click();
  await wait(250);

  let shots = 0, waited = 0, settle = 0;
  const qs = [];
  while (shots < 6) {
    settle++;
    const s = await page.evaluate(() => ({ p: window.SNAP, sh: window.SNAPSHOT() }));
    if (s.p.phase !== 1) break;

    if (policy.aims) {
      // Point at where the subject IS - robust even when it has wandered
      // clean out of frame, which a box-only servo cannot recover from -
      // and bias the heading so it lands on a third rather than dead
      // centre. Zoom is servoed on the MEASURED height instead, because
      // that is the quantity the score actually reads.
      const [a0, , f0, ang] = s.p.cam;
      const [sx, sz] = s.p.sub;
      const ex = Math.sin(ang) * R, ez = Math.cos(ang) * R;
      const dist = Math.hypot(sx - ex, sz - ez) || 1;
      const bias = Math.atan(THIRD * Math.tan(f0 / 2) * ASPECT);
      const want = Math.atan2(sx - ex, sz - ez) - bias;
      const a = a0 + ((want - a0 + Math.PI * 3) % (Math.PI * 2) - Math.PI) * .5;
      const pp = Math.atan2(.95 - EYE_Y, dist);
      const h = s.sh.box.h;
      const f = Math.max(.34, Math.min(1.15, f0 + (f0 * (h > .05 ? 1.15 / h : 2) - f0) * -.3 + 0));
      await setCam([a, pp, Math.max(.34, Math.min(1.15, f0 * (h > .05 ? h / 1.15 : .6) * .35 + f0 * .65))]);
    }

    // An aiming policy must be ALLOWED to aim. The first cut fired on every
    // iteration, so the servo got about six steps across a whole job and
    // never converged - it measured a player who intends to compose and
    // then shoots before finishing, which is nobody.
    let take = !policy.aims || settle >= 9;
    if (policy.waits) {
      // Hold out for a pose worth having - but not forever: a real player
      // with two frames left and a bored unicorn takes the shot. Without
      // this the policy stalls and measures patience rather than skill.
      take = take && (SHOWY.includes(s.p.pose) || waited > 34);
    }
    if (take) {
      qs.push(s.sh.q);
      await fire(); shots++; waited = 0; settle = 0; await wait(200);
    } else { waited++; await wait(75); }
  }
  await wait(1400);
  const pts = (await probe()).lastJob;
  jobQ.push(qs.reduce((a, b) => a + b, 0) / (qs.length || 1));
  // Leaving the result sheet is two clicks at a season boundary, not one:
  // NEXT JOB on the third job opens the wrap-up, and the wrap-up's own
  // button is what starts the next season.
  await page.getByRole('button', { name: /NEXT JOB|SHOOT ANOTHER SEASON/ }).click();
  await wait(350);
  if ((await probe()).phase === 3) {
    await page.getByRole('button', { name: 'SHOOT ANOTHER SEASON' }).click();
    await wait(350);
  }
  return pts;
}

const POLICIES = [
  { name: 'idle', aims: 0, waits: 0 },
  { name: 'framed', aims: 1, waits: 0 },
  { name: 'timed', aims: 0, waits: 1 },
  { name: 'skilled', aims: 1, waits: 1 },
  { name: 'dressed', aims: 1, waits: 1, styles: 1 },
];

const results = {};
const jobQ = [];
for (const pol of POLICIES) {
  if (ONLY && pol.name !== ONLY) continue;
  await page.goto(pathToFileURL(file).href, { waitUntil: 'load' });
  await wait(600);
  await page.getByRole('button', { name: 'OPEN THE STUDIO' }).click();
  await wait(300);
  // Every policy but `dressed` wears the same unconsidered look for the whole
  // run - a warm coat and some glitter, chosen once and never revisited - so
  // that what `dressed` earns is the choosing, not the wearing.
  if (!pol.styles) {
    await page.getByRole('button', { name: 'COAT' }).click();
    await page.locator('button[data-i="6"]').click();
    await page.getByRole('button', { name: /GLITTER/ }).click();
    await page.getByRole('button', { name: /GLITTER/ }).click();
  }

  const jobs = [];
  jobQ.length = 0;
  for (let j = 0; j < JOBS; j++) jobs.push(await runJob(pol));
  const mq = jobQ.reduce((a, b) => a + b, 0) / jobQ.length;
  jobs.sort((a, b) => a - b);
  const mean = jobs.reduce((a, b) => a + b, 0) / jobs.length;
  results[pol.name] = { mean, lo: jobs[0], hi: jobs[jobs.length - 1], q: mq };
}

await browser.close();

console.log(`\n  ${JOBS} jobs per policy, identical styling\n`);
// `frame` is the composition multiplier at the moment each shutter fired.
// It is the number that says whether a policy is aiming at all, and without
// it a low score is indistinguishable from a broken servo in the harness.
console.log('  policy      mean job    worst    best   frame   vs idle');
for (const [n, r] of Object.entries(results)) {
  const rel = results.idle ? (r.mean / results.idle.mean).toFixed(2) + 'x' : '-';
  console.log(`  ${n.padEnd(10)} ${r.mean.toFixed(0).padStart(8)} ${String(r.lo).padStart(8)} ${String(r.hi).padStart(7)} ${r.q.toFixed(2).padStart(7)} ${rel.padStart(9)}`);
}

if (results.idle && results.skilled) {
  const ratio = results.skilled.mean / results.idle.mean;
  console.log('');
  // 1.6x is the line: below it a player who never aims is within a bad roll
  // of one who does, and the shutter stops being a decision.
  if (ratio < 1.6) {
    console.error(`  FAIL: skill is worth only ${ratio.toFixed(2)}x - not aiming is nearly as good as aiming`);
    process.exit(1);
  }
  console.log(`  skill is worth ${ratio.toFixed(2)}x`);
}

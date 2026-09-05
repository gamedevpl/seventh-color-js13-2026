// Reproducible balance probe, independent of rendering and audio.
import { readFileSync } from 'node:fs';
const number = (key, fallback) => Number(process.argv.find(a => a.startsWith('--' + key + '='))?.split('=')[1] || fallback);
const start = number('start', 1), count = number('count', 48);
// Trace the actual two-30+ collision branch; total explosion power alone
// would incorrectly count a 50-vs-10 clash as a mega clash. Test-only field.
const source = readFileSync(new URL('../fireball/src/herd.js', import.meta.url), 'utf8')
  .replace("'./uni.js'", JSON.stringify(new URL('../fireball/src/uni.js', import.meta.url).href))
  .replace('pw: A.wave + B.wave', 'pw: A.wave + B.wave, mega');
const { newWorld, leaders, units, step, events, alive } = await import('data:text/javascript,' + encodeURIComponent(source));
const totals = { ended: 0, mega: 0, large: 0, maxHerd: 0, clashes: 0, falls: 0, nan: 0, unequalDuels: 0, comebacks: 0 };
const stalled = [], durations = [], wins = Array(7).fill(0), megaSeeds = [];
const random = Math.random;
try {
  for (let seed = start; seed < start + count; seed++) {
    let state = seed, large = false, pair = null;
    Math.random = () => (state = Math.imul(state, 1664525) + 1013904223 >>> 0) / 4294967296;
    newWorld(0);
    leaders[0].ai = { t: 0, goal: null };
    for (let i = 0; i < 30 * 420; i++) {
      step(1 / 30, {});
      for (const e of events) {
        if (e.k === 'boom') { totals.clashes++; if (e.mega) { totals.mega++; megaSeeds.push(seed); } }
        if (e.k === 'fell') totals.falls++;
      }
      events.length = 0;
      const live = alive();
      if (!pair && live.length === 2) pair = live.map(L => ({ id: L.lead, n: L.n }));
      if (live.filter(L => L.n >= 30).length >= 2) large = true;
      totals.maxHerd = Math.max(totals.maxHerd, ...leaders.map(L => L.n));
      if (units.some(u => !Number.isFinite(u.x + u.z))) { totals.nan++; break; }
      if (live.length <= 1) {
        totals.ended++; durations.push((i + 1) / 30);
        if (live.length) {
          wins[live[0].lead]++;
          if (pair && pair[0].n !== pair[1].n) {
            totals.unequalDuels++;
            if (pair.find(L => L.id === live[0].lead)?.n === Math.min(...pair.map(L => L.n))) totals.comebacks++;
          }
        }
        break;
      }
    }
    if (large) totals.large++;
    if (alive().length > 1) stalled.push({ seed, alive: alive().map(L => ({
      id: L.lead, n: L.n, hearts: L.hearts, x: Math.round(L.x), z: Math.round(L.z),
      charge: L.charge, goal: L.ai.goal,
    })) });
  }
} finally { Math.random = random; }
console.log(JSON.stringify({ start, count, totals, avg: durations.reduce((a, b) => a + b, 0) / durations.length, wins, megaSeeds, stalled }, null, 2));
if (totals.nan) process.exitCode = 1;

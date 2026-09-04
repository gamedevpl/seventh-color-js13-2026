// Reproducible 48-seed balance probe, independent of rendering and audio.
import { newWorld, leaders, units, step, events, alive } from '../fireball/src/herd.js';

const totals = { ended: 0, mega: 0, maxHerd: 0, clashes: 0, falls: 0, nan: 0 };
const stalled = [], durations = [];
const random = Math.random;
try {
  for (let seed = 1; seed <= 48; seed++) {
    let state = seed;
    Math.random = () => (state = Math.imul(state, 1664525) + 1013904223 >>> 0) / 4294967296;
    newWorld(0);
    leaders[0].ai = { t: 0, goal: null };
    for (let i = 0; i < 30 * 420; i++) {
      step(1 / 30, {});
      for (const e of events) {
        if (e.k === 'boom') { totals.clashes++; if (e.pw >= 62) totals.mega++; }
        if (e.k === 'fell') totals.falls++;
      }
      events.length = 0;
      totals.maxHerd = Math.max(totals.maxHerd, ...leaders.map(L => L.n));
      if (units.some(u => !Number.isFinite(u.x + u.z))) { totals.nan++; break; }
      if (alive().length <= 1) { totals.ended++; durations.push((i + 1) / 30); break; }
    }
    if (alive().length > 1) stalled.push({ seed, alive: alive().map(L => ({
      id: L.lead, n: L.n, hearts: L.hearts, x: Math.round(L.x), z: Math.round(L.z),
      charge: L.charge, goal: L.ai.goal,
    })) });
  }
} finally { Math.random = random; }
console.log(JSON.stringify({ totals, avg: durations.reduce((a, b) => a + b, 0) / durations.length, stalled }, null, 2));
if (totals.nan) process.exitCode = 1;

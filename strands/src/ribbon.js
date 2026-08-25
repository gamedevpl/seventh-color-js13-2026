// The rainbow braid - the thing being raced. It rides the same rails as the
// player (track.js's one rider), fleeing by argmax of BFS distance at every
// junction, and its ribbon is the trail of where it actually flowed - so it
// swoops through the same dives and climbs the player must read.

import { makeRider, ride, frame } from './track.js';
import { RAINBOW } from './uni.js';

const d3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

export function makeBraid(g, node) {
  return { r: makeRider(g, node), trail: [], burst: 0 };
}

export function updateBraid(g, br, dists, playerPos, dt, canCatch) {
  // Rubber band, coaster scale: its panic speed sits just above the base
  // top speed, so the braid is uncatchable until the collected colours
  // raise the ceiling - the rainbow is the key, not a bigger engine. When
  // grabbed at without the full rainbow it BURSTS away in a panic sprint.
  const pd = d3(br.r.pos, playerPos);
  br.burst = Math.max(0, br.burst - dt);
  let sp = pd < 12 ? (canCatch ? 21 : 26) : pd > 45 ? 10 : 15;
  if (br.burst > 0) sp = 42;
  ride(g, br.r, sp * dt, (c) => {
    let best = c[0], bd = -1;
    for (const m of c) {
      const d = dists[m[0]][m[1]];
      if (d > bd) { bd = d; best = m; }
    }
    return best;
  });
  // The trail records the track's own frame, not just a point, so the
  // ribbon lies IN the channel through banks and corkscrews instead of
  // floating in world-up like a kite string.
  const last = br.trail[br.trail.length - 1];
  if (!last || d3(br.r.pos, last) > 1.3) {
    const f = br.r.b ? frame(g, br.r.a, br.r.b, br.r.t) : null;
    const p = [...br.r.pos];
    p.s = f ? f[2] : [1, 0, 0];
    p.u = f ? f[3] : [0, 1, 0];
    br.trail.push(p);
    if (br.trail.length > 44) br.trail.shift();  // trail[0] = the tail you catch
  }
}

// The braid drags along the TRACK and glows. Additive layers built from the
// same trail, depth-write off so they sum instead of occluding - that
// summing IS the bloom, no post-process buffer required. All heights are
// offsets from the trail point, because the trail now dives and climbs.
export function braidVerts(br, t) {
  const v = [], tr = br.trail, n = tr.length;
  if (n < 2) return v;
  const P = (x, y, z, c, a) => v.push(x, y, z, 0, 1, 0, c[0], c[1], c[2], a);
  const Q = (q) => { for (const k of [0, 1, 2, 0, 2, 3]) P(...q[k]); };

  // Side and up come from the TRACK's frame at each recorded point, so the
  // ribbon banks and corkscrews with the channel it is flowing down.
  const side = tr.map((p) => p.s || [1, 0, 0]);
  const upv = tr.map((p) => p.u || [0, 1, 0]);
  const off = (i, ws, wu) => [
    tr[i][0] + side[i][0] * ws + upv[i][0] * wu,
    tr[i][1] + side[i][1] * ws + upv[i][1] * wu,
    tr[i][2] + side[i][2] * ws + upv[i][2] * wu,
  ];
  // The oldest end is dissipating; the head is fresh light.
  const fade = (i) => .34 + .66 * (i / (n - 1));

  // --- smear on the road + sheath at rope height -------------------------
  // Every band is bright on its centreline and alpha-zero at both outer
  // edges - a hard-edged quad reads as a rectangle no matter how faint.
  const WHITE = [.86, .84, 1];
  for (const [w, al, dy, mono] of [[.9, .3, .12, 0], [2.8, .14, .07, 1], [.8, .22, .55, 1]]) {
    for (let i = 1; i < n; i++) {
      const c0 = mono ? WHITE : RAINBOW[(i - 1) % 7], c1 = mono ? WHITE : RAINBOW[i % 7];
      const a0 = al * fade(i - 1), a1 = al * fade(i);
      for (const e of [-1, 1]) Q([
        [...off(i - 1, 0, dy), c0, a0],
        [...off(i, 0, dy), c1, a1],
        [...off(i, w * e, dy), c1, 0],
        [...off(i - 1, w * e, dy), c0, 0],
      ]);
    }
  }

  // --- the seven cores ----------------------------------------------------
  // Each strand orbits the shared path: seven phases evenly around a circle,
  // advancing along the trail and turning with time - that is what makes
  // them cross over and under each other like a plait.
  for (let s = 0; s < 7; s++) {
    const c = RAINBOW[s], w = .15;
    const orb = (k, extra) => {
      const ph = s * (Math.PI * 2 / 7) + k * 1.05 - t * 3;
      return off(k, Math.cos(ph) * .38 + extra, .55 + Math.sin(ph) * .38);
    };
    for (let i = 1; i < n; i++) {
      Q([
        [...orb(i - 1, -w), c, fade(i - 1)],
        [...orb(i - 1, w), c, fade(i - 1)],
        [...orb(i, w), c, fade(i)],
        [...orb(i, -w), c, fade(i)],
      ]);
    }
  }

  // --- upright haze cards, standing in the channel's own up --------------
  for (let i = 0; i < n; i += 2) {
    const c = RAINBOW[i % 7];
    const w = 1.5, h = 2.2 + Math.sin(t * 2.2 + i) * .4, a = .2 * fade(i);
    for (const e of [-1, 1]) Q([
      [...off(i, 0, .06), c, a],
      [...off(i, w * e, .06), c, 0],
      [...off(i, w * e, h * .75), c, 0],
      [...off(i, 0, h), c, 0],
    ]);
  }

  // --- the head knot ------------------------------------------------------
  // Where the braid entity actually is, the rope ends in the living light
  // being chased - crossed fans in the TRACK's frame, so the flare lies in
  // the channel it is racing down, not pasted flat on the world.
  const hs = tr[n - 1].s || [1, 0, 0], hu = tr[n - 1].u || [0, 1, 0];
  const hp = br.r.pos, R = 2.6 + Math.sin(t * 6) * .4;
  const hf = (ws, wu) => [hp[0] + hs[0] * ws + hu[0] * wu, hp[1] + hs[1] * ws + hu[1] * wu, hp[2] + hs[2] * ws + hu[2] * wu];
  for (const e of [-1, 1]) {
    Q([[...hf(0, .1), WHITE, .8], [...hf(R * e, .1), WHITE, 0], [...hf(R * e, 2.2), WHITE, 0], [...hf(0, 4), WHITE, 0]]);
    Q([[...hf(0, .1), WHITE, .8], [...hf(0, 4 * (e > 0 ? 1 : 0)), WHITE, 0], [...hf(R * e * .5, 2.6), WHITE, 0], [...hf(-R * e * .5, 2.6), WHITE, 0]]);
  }
  return v;
}

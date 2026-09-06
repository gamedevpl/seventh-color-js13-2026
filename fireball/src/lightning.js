// A channel keeps its shape across the short return-stroke flashes.
// Side leaders taper out before the target; only the main channel connects it.
export function lightning(arcs, put, up, dt) {
  for (let i = arcs.length - 1; i >= 0; i--) {
    const A = arcs[i];
    A.t -= dt;
    if (A.t <= 0) { arcs.splice(i, 1); continue; }
    const seed = A.a[0] + A.b[2],
      pulse = A.t / .15 * (.25 + Math.cos(A.t * 95) ** 8);
    const point = (s) => {
      const f = s / 12, bend = Math.sin(f * Math.PI);
      return A.a.map((v, j) => v + (A.b[j] - v) * f + Math.sin(seed + s * s * 7 + j * 19) * bend * .6);
    };
    for (let s = 1; s <= 12; s++) {
      const p = point(s - 1), q = point(s);
      for (let branch = 0; branch < 2; branch++) {
        if (branch && s % 4) continue;
        const strength = branch ? .4 : 1, end = branch ? q.map((v, j) => v + (v - p[j]) * .8) : q;
        for (const core of [0, 1]) {
          const w = (core ? .04 : .2) * strength;
          for (const k of [0, 1, 2, 0, 2, 3]) {
            const v = k < 2 ? p : end, sign = k === 0 || k === 3 ? -1 : 1;
            put(...v.map((x, j) => x + up[j] * w * sign), core ? [1, 1, 1] : [.3, .4, 1], pulse * (core ? 1 : .15) * strength);
          }
        }
      }
    }
  }
  return put.n;
}

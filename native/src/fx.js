// Screen juice, shared by every mechanic rather than reinvented in each -
// the same "one machine, many callers" rule the story machine follows. A
// mechanic that lands a hit calls kick+burst; it never draws its own
// feedback system. This is the single cheapest thing in the project that
// changes how the game *feels*, which is why it exists at all.

import { ctx, circle } from './draw.js';

let shake = 0, parts = [];

export function kick(amount) { if (amount > shake) shake = amount; }

export function burst(x, y, n, color, speed) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * 6.283, s = speed * (0.4 + Math.random());
    parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, color });
  }
}

export function fxUpdate(dt) {
  shake = Math.max(0, shake - dt * 4.5);
  for (const p of parts) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 90 * dt;
    p.life -= dt * 1.7;
  }
  parts = parts.filter((p) => p.life > 0);
}

// The whole frame is drawn inside the shake transform, so a hit moves the
// scene, the portraits and the mechanic together - a mechanic-only shake
// reads as a glitch, a whole-frame shake reads as impact.
export function fxBegin() {
  ctx.save();
  if (shake > 0) ctx.translate((Math.random() - .5) * shake * 7, (Math.random() - .5) * shake * 7);
}

export function fxEnd() {
  for (const p of parts) circle(p.x, p.y, .6 + p.life * 2, { fill: p.color });
  ctx.restore();
}

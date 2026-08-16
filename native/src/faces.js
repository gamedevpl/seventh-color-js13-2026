import { poly, ellipse, line, circle, withTransform } from './draw.js';

// One portrait per cast member: a packed polygon list + a shared renderer.
// blink and talk are both derived from elapsed time + a per-member phase
// offset (member.name.length in the old ported code; a small integer here)
// so no per-face state is needed - same trick, cheaper data.

export const FACES = {
  darkness: {
    skin: '#8f3037', horn: '#b79557', eye: '#1a0d0f',
    head: [0, -46, 30, -18, 26, 30, -26, 30, -30, -18],
    horns: [[-14, -40, -22, -70, -6, -44], [14, -40, 22, -70, 6, -44]],
    phase: 3,
  },
};

export function paintFace(key, x, y, scale, t, talking) {
  const f = FACES[key];
  withTransform({ x, y, scale }, () => {
    poly(f.head, { fill: f.skin, stroke: '#1a0d0f', lineWidth: 3 });
    for (const h of f.horns) poly(h, { fill: f.horn });
    const blink = Math.floor((t + f.phase) * 3) % 22 === 0;
    if (blink) { line(-13, -6, -5, -6, { stroke: f.eye, lineWidth: 2 }); line(5, -6, 13, -6, { stroke: f.eye, lineWidth: 2 }); }
    else { circle(-9, -6, 3, { fill: f.eye }); circle(9, -6, 3, { fill: f.eye }); }
    const open = talking && Math.floor(t * 8) % 2 === 0;
    ellipse(0, 14, 9, open ? 5 : 2, { fill: f.eye });
  });
}

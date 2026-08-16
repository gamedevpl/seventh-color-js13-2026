import { clear, rect, poly, line } from './draw.js';

export const SCENES = {
  'shadow-council': (t) => {
    clear(320, 156, '#0a0710');
    for (let i = 0; i < 6; i++) {
      const x = 14 + i * 56;
      poly([x, 156, x - 10, 40, x, 8, x + 10, 40], { fill: i % 2 ? '#150c1f' : '#1c1128', stroke: '#2c1a3a', lineWidth: 2 });
    }
    poly([120, 156, 130, 60, 160, 34, 190, 60, 200, 156], { fill: '#0d0716', stroke: '#3a1f2e', lineWidth: 3 });
    for (let i = 0; i < 5; i++) line(160, 34, 160 + Math.cos(i * 1.3 + t * 0.3) * 60, 34 + Math.sin(i * 1.3 + t * 0.3) * 20, { stroke: '#2a1420', lineWidth: 1 });
    rect(0, 140, 320, 16, { fill: '#050308' });
  },
};

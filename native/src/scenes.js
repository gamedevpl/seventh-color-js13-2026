import { clear, rect, circle, poly, line } from './draw.js';

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
  hall: (t) => {
    clear(320, 156, '#0d0a14');
    for (let i = 0; i < 7; i++) {
      const x = 10 + i * 46;
      poly([x, 156, x - 12, 42, x, 14, x + 12, 42], { fill: i % 2 ? '#150f1e' : '#1a1226', stroke: '#2a1e38', lineWidth: 2 });
    }
    rect(0, 138, 320, 18, { fill: '#08060c' });
  },
  forest: (t) => {
    clear(320, 156, '#0f1e18');
    for (let i = 0; i < 8; i++) {
      const x = -10 + i * 44;
      poly([x, 0, x + 22, 0, x + 30, 130, x - 8, 130], { fill: i % 2 ? '#13291f' : '#183626', stroke: '#0a1712', lineWidth: 2 });
    }
    for (let i = 0; i < 20; i++) {
      const x = (i * 53 + t * 6) % 340 - 10, y = 10 + (i * 31) % 110;
      circle(x, y, i % 3 ? 1 : 2, { fill: i % 2 ? '#d6ae55' : '#7bb08a' });
    }
    rect(0, 130, 320, 26, { fill: '#0a1b13' });
  },
};

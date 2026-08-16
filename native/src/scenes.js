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
  pond: (t) => {
    clear(320, 156, '#0f1c28');
    rect(0, 60, 320, 96, { fill: '#1a3244' });
    for (let i = 0; i < 9; i++) {
      const x = i * 40 - 10;
      line(x, 60, x + 26, 156, { stroke: '#2a4a5e', lineWidth: 2 });
    }
    circle(258, 26, 20, { fill: '#cfe0e8' });
    for (let i = 0; i < 14; i++) {
      const x = (i * 47 + t * 4) % 330 - 10, y = 65 + (i * 23) % 85;
      circle(x, y, 1, { fill: '#dff0fa88' });
    }
  },
  bog: (t) => {
    clear(320, 156, '#111d14');
    for (let i = 0; i < 10; i++) {
      const x = -6 + i * 34;
      line(x, 156, x + 6 + Math.sin(i + t * 0.4) * 4, 60, { stroke: '#1c3020', lineWidth: 4 });
    }
    rect(0, 118, 320, 38, { fill: '#0c1a10' });
    for (let i = 0; i < 10; i++) {
      const x = (i * 61 + t * 3) % 330 - 10, y = 122 + (i * 13) % 26;
      circle(x, y, i % 4 ? 1 : 2, { fill: '#3a5a30' });
    }
  },
  cottage: (t) => {
    clear(320, 156, '#0c1712');
    for (let i = 0; i < 6; i++) {
      const x = 6 + i * 54;
      poly([x, 156, x - 8, 30, x, 6, x + 8, 30], { fill: i % 2 ? '#0e2018' : '#122a1e', stroke: '#1c3a28', lineWidth: 2 });
    }
    rect(0, 132, 320, 24, { fill: '#081410' });
  },
  roots: (t) => {
    clear(320, 156, '#160f0a');
    for (let i = 0; i < 5; i++) {
      const x = 20 + i * 70;
      poly([x, 156, x - 24, 60, x - 6, 20, x + 6, 20, x + 24, 60], { fill: i % 2 ? '#241a10' : '#2c2013', stroke: '#120c08', lineWidth: 2 });
    }
    for (let i = 0; i < 6; i++) line(160, 40, 40 + i * 48, 156, { stroke: '#1a120a', lineWidth: 3 });
    rect(0, 140, 320, 16, { fill: '#0a0704' });
  },
  stream: (t) => {
    clear(320, 156, '#132a20');
    for (let i = 0; i < 8; i++) {
      const x = -10 + i * 44;
      poly([x, 0, x + 22, 0, x + 30, 118, x - 8, 118], { fill: i % 2 ? '#173628' : '#1e422f', stroke: '#0a1a12', lineWidth: 2 });
    }
    rect(0, 112, 320, 44, { fill: '#1a3a42' });
    for (let i = 0; i < 10; i++) {
      const x = (i * 53 + t * 12) % 330 - 10, y = 118 + (i * 7) % 30;
      line(x, y, x + 12, y, { stroke: '#4a7a82', lineWidth: 1 });
    }
  },
};

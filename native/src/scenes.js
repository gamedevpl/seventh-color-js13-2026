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
  glade: (t) => {
    clear(320, 156, '#0c1524');
    circle(52, 30, 15, { fill: '#e8e4d0' });
    for (let i = 0; i < 22; i++) circle((i * 71 + 13) % 320, (i * 37) % 58, i % 4 ? 1 : 1.5, { fill: '#cfd8f0aa' });
    for (let i = 0; i < 9; i++) {
      const x = -14 + i * 42, h = 34 + (i % 3) * 16;
      poly([x, 156, x - 16, h, x, h - 22, x + 16, h], { fill: i % 2 ? '#12291f' : '#173324', stroke: '#0a1a12', lineWidth: 2 });
    }
    rect(0, 118, 320, 38, { fill: '#16301f' });
    for (let i = 0; i < 12; i++) {
      const x = (i * 61 + t * 7) % 340 - 10, y = 74 + (i * 29) % 44;
      circle(x, y, i % 3 ? 1 : 1.6, { fill: '#e8c96a99' });
    }
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
  throne: (t) => {
    clear(320, 156, '#100810');
    for (let i = 0; i < 6; i++) {
      const x = 8 + i * 58;
      poly([x, 156, x - 14, 46, x, 12, x + 14, 46], { fill: i % 2 ? '#1c0e1c' : '#241226', stroke: '#3a1a34', lineWidth: 2 });
    }
    poly([130, 156, 138, 66, 160, 44, 182, 66, 190, 156], { fill: '#0c0510', stroke: '#4a1e3a', lineWidth: 3 });
    for (let i = 0; i < 5; i++) line(160, 44, 160 + Math.cos(i * 1.1 + t * 0.35) * 70, 44 + Math.sin(i * 1.1 + t * 0.35) * 24, { stroke: '#3a1428', lineWidth: 1 });
    rect(0, 142, 320, 14, { fill: '#040208' });
  },
  causeway: (t) => {
    clear(320, 156, '#050308');
    for (let i = 0; i < 7; i++) {
      const x = -10 + i * 48;
      poly([x, 0, x + 20, 0, x + 8, 156, x - 22, 156], { fill: i % 2 ? '#0e0812' : '#150c18', stroke: '#040206', lineWidth: 2 });
    }
    poly([0, 118, 70, 108, 140, 122, 210, 106, 320, 120, 320, 156, 0, 156], { fill: '#1a1420', stroke: '#3a2a44', lineWidth: 3 });
    for (let i = 0; i < 6; i++) {
      const x = (i * 61 + t * 20) % 340 - 12;
      line(x, 108 + (i % 3) * 4, x + 8, 156, { stroke: '#0a0610', lineWidth: 3 });
    }
  },
};

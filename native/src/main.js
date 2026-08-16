import { initDraw, clear, circle } from './draw.js';

// Virtual resolution matches the ported game's original canvas convention -
// any face/scene polygon data pulled in later reuses these coordinates as-is.
const VW = 320, VH = 156;

const canvas = document.getElementById('c');
canvas.width = VW;
canvas.height = VH;
initDraw(canvas.getContext('2d'));

function resize() {
  const scale = Math.min(innerWidth / VW, innerHeight / VH);
  canvas.style.width = VW * scale + 'px';
  canvas.style.height = VH * scale + 'px';
}
addEventListener('resize', resize);
resize();

function loop(now) {
  const t = now / 1000;
  clear(VW, VH, '#0b0f14');
  circle(160, 78, 20 + Math.sin(t * 2) * 6, { fill: '#e8b923' });
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

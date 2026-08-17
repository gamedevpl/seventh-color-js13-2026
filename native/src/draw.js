// Thin wrapper over CanvasRenderingContext2D. Canvas already owns a matrix
// stack (save/restore + translate/rotate/scale) - withTransform just gives
// call sites the {x,y,scale,rot,alpha} shape the old GameKit-ported face/scene
// code used, so ported painters stay close to their original form.

export let ctx;

export function initDraw(c) {
  ctx = c;
}

function paint(fill, stroke, lineWidth) {
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.lineWidth = lineWidth || 1; ctx.strokeStyle = stroke; ctx.stroke(); }
}

export function clear(w, h, fill) {
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, w, h);
}

export function rect(x, y, w, h, { fill, stroke, lineWidth } = {}) {
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  paint(fill, stroke, lineWidth);
}

export function circle(x, y, r, { fill, stroke, lineWidth } = {}) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  paint(fill, stroke, lineWidth);
}

export function ellipse(x, y, rx, ry, { fill, stroke, lineWidth } = {}) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  paint(fill, stroke, lineWidth);
}

export function line(x1, y1, x2, y2, { stroke, lineWidth } = {}) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.lineWidth = lineWidth || 1;
  ctx.strokeStyle = stroke;
  ctx.stroke();
}

// pts: flat [x0,y0,x1,y1,...] or [{x,y},...]
export function poly(pts, { fill, stroke, lineWidth } = {}) {
  ctx.beginPath();
  const flat = typeof pts[0] === 'number';
  const n = flat ? pts.length / 2 : pts.length;
  for (let i = 0; i < n; i++) {
    const x = flat ? pts[i * 2] : pts[i].x;
    const y = flat ? pts[i * 2 + 1] : pts[i].y;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  paint(fill, stroke, lineWidth);
}

export function text(str, x, y, { fill, font, align, baseline } = {}) {
  ctx.font = font || '10px system-ui';
  ctx.textAlign = align || 'left';
  ctx.textBaseline = baseline || 'alphabetic';
  ctx.fillStyle = fill || '#fff';
  ctx.fillText(str, x, y);
}

export function withTransform({ x, y, scale, rot, alpha }, fn) {
  ctx.save();
  if (alpha != null) ctx.globalAlpha *= alpha;
  if (x || y) ctx.translate(x || 0, y || 0);
  if (rot) ctx.rotate(rot);
  if (scale != null) ctx.scale(scale, scale);
  fn();
  ctx.restore();
}

// Greedy word wrap against the real font metrics. Prose kept overflowing
// the 320px canvas as lines got written, and trimming sentences to fit is
// a losing game - measure instead, so the writing is free to be as long as
// it needs and the layout copes.
export function wrap(str, max, font) {
  ctx.font = font;
  const out = [];
  let cur = '';
  for (const w of str.split(' ')) {
    const t = cur ? cur + ' ' + w : w;
    if (cur && ctx.measureText(t).width > max) { out.push(cur); cur = w; } else cur = t;
  }
  if (cur) out.push(cur);
  return out;
}

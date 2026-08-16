// Canvas2D draw surface, matching only what the game actually calls:
// clear, rect, circle, ellipse, line, poly, text, with(), width/height.
// No WebGL, no bloom shader, no orientation switching, no scene3d — this
// entry is fixed landscape, fixed 640x400, canvas2d only.
//
// gradients/panel/hud/overlay/star/ship/etc. are gone: `weigh` showed zero
// game-side call sites for any of them once the gallery/editor/director left.
// The one exception is `overlay`, used for the win screen — kept, but as a
// direct paint rather than a delegate, since nothing else reaches for it.

const WIDTH = 640;
const HEIGHT = 400;

function applyShadow(ctx, o) {
  if (!o) return;
  if (o.shadowColor != null) ctx.shadowColor = o.shadowColor;
  if (o.shadowBlur != null) ctx.shadowBlur = o.shadowBlur;
  if (o.shadowOffsetX != null) ctx.shadowOffsetX = o.shadowOffsetX;
  if (o.shadowOffsetY != null) ctx.shadowOffsetY = o.shadowOffsetY;
}

function paintPath(ctx, o) {
  o = o || {};
  applyShadow(ctx, o);
  if (o.fill != null) {
    ctx.fillStyle = o.fill;
    ctx.fill();
  }
  if (o.stroke != null && o.stroke !== 'none') {
    ctx.strokeStyle = o.stroke;
    ctx.lineWidth = o.lineWidth != null ? o.lineWidth : 1;
    ctx.stroke();
  }
}

function createDrawSurface(ctx) {
  const draw = {
    width: WIDTH,
    height: HEIGHT,

    clear(fill) {
      if (fill == null) { ctx.clearRect(0, 0, WIDTH, HEIGHT); return; }
      ctx.fillStyle = fill;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
    },

    rect(x, y, w, h, o) {
      o = o || {};
      ctx.save();
      applyShadow(ctx, o);
      if (o.fill != null) { ctx.fillStyle = o.fill; ctx.fillRect(x, y, w, h); }
      if (o.stroke != null && o.stroke !== 'none') {
        ctx.strokeStyle = o.stroke;
        ctx.lineWidth = o.lineWidth != null ? o.lineWidth : 1;
        ctx.strokeRect(x, y, w, h);
      }
      ctx.restore();
    },

    circle(x, y, r, o) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      paintPath(ctx, o);
      ctx.restore();
    },

    ellipse(x, y, rx, ry, o) {
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, (o && o.rotation) || 0, 0, Math.PI * 2);
      paintPath(ctx, o);
      ctx.restore();
    },

    line(x1, y1, x2, y2, o) {
      o = o || {};
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = o.stroke != null ? o.stroke : '#fff';
      ctx.lineWidth = o.lineWidth != null ? o.lineWidth : 1;
      applyShadow(ctx, o);
      ctx.stroke();
      ctx.restore();
    },

    poly(points, o) {
      if (!points || !points.length) return;
      o = o || {};
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
      if (o.close !== false) ctx.closePath();
      paintPath(ctx, o);
      ctx.restore();
    },

    text(value, x, y, o) {
      o = o || {};
      ctx.save();
      applyShadow(ctx, o);
      if (o.font) ctx.font = o.font;
      ctx.textAlign = o.align || 'start';
      ctx.textBaseline = o.baseline || 'alphabetic';
      if (o.fill != null) { ctx.fillStyle = o.fill; ctx.fillText(String(value), x, y); }
      if (o.stroke != null && o.stroke !== 'none') {
        ctx.strokeStyle = o.stroke;
        ctx.lineWidth = o.lineWidth != null ? o.lineWidth : 1;
        ctx.strokeText(String(value), x, y);
      }
      ctx.restore();
    },

    with(state, fn) {
      const s = state || {};
      ctx.save();
      if (s.alpha != null) ctx.globalAlpha = (ctx.globalAlpha || 1) * s.alpha;
      if (s.x || s.y) ctx.translate(s.x || 0, s.y || 0);
      if (s.rot) ctx.rotate(s.rot);
      const sx = s.scaleX != null ? s.scaleX : s.scale;
      const sy = s.scaleY != null ? s.scaleY : s.scale;
      if (sx != null || sy != null) ctx.scale(sx != null ? sx : 1, sy != null ? sy : 1);
      applyShadow(ctx, s);
      fn();
      ctx.restore();
    },

    // overlay: the win screen only. Not a delegate — nothing else reaches it.
    overlay(w, h, title, subtitle, color) {
      ctx.save();
      ctx.fillStyle = 'rgba(4,6,14,0.82)';
      ctx.fillRect(0, 0, w, h);
      ctx.textAlign = 'center';
      ctx.fillStyle = color || '#fff';
      ctx.font = '800 34px system-ui, sans-serif';
      ctx.fillText(title, w / 2, h / 2 - 8);
      if (subtitle) {
        ctx.fillStyle = '#e7e9f5';
        ctx.font = '400 16px system-ui, sans-serif';
        ctx.fillText(subtitle, w / 2, h / 2 + 22);
      }
      ctx.restore();
    },
  };
  return draw;
}

/**
 * Vignette and bloom are the one WebGL post-pass the game opted into
 * (`.renderer({ effects: ['bloom','vignette'], … })`). Reproducing the GLSL
 * exactly would mean shipping a shader compiler's worth of setup; both read
 * as mood lighting rather than gameplay signal, so they are approximated in
 * 2D instead — a radial-gradient vignette (cheap, close to the shader's
 * smoothstep falloff) and a soft screen-blended glow pass standing in for
 * bloom. Verified by screenshot diff against the WebGL original, not assumed.
 */
export function createRenderer(canvas) {
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const visible = canvas.getContext('2d');

  // The game draws onto a hidden buffer so presentFrame can composite a glow
  // pass over it before it reaches the screen — a plain canvas has no scene
  // texture to blur after the fact once painted straight to the display.
  const buffer = document.createElement('canvas');
  buffer.width = WIDTH;
  buffer.height = HEIGHT;
  const ctx = buffer.getContext('2d');
  const draw = createDrawSurface(ctx);

  const vignette = visible.createRadialGradient(WIDTH / 2, HEIGHT / 2, HEIGHT * 0.3, WIDTH / 2, HEIGHT / 2, HEIGHT * 0.75);
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(0,0,0,0.42)');

  const supportsFilter = 'filter' in visible;

  function presentFrame() {
    visible.clearRect(0, 0, WIDTH, HEIGHT);
    visible.drawImage(buffer, 0, 0);
    if (supportsFilter) {
      visible.save();
      visible.globalCompositeOperation = 'screen';
      visible.globalAlpha = 0.24;
      visible.filter = 'blur(3px) brightness(1.35)';
      visible.drawImage(buffer, 0, 0);
      visible.restore();
    }
    visible.fillStyle = vignette;
    visible.fillRect(0, 0, WIDTH, HEIGHT);
  }

  return { canvas, draw, ctx, width: WIDTH, height: HEIGHT, presentFrame };
}

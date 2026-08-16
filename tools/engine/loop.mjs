// defineGame, scoped to the one shape this entry actually uses: orientation
// fixed landscape (renderer is already fixed 640x400), one particle burst on
// win, no lose state, no HUD, no foreground pass, no editor. The full builder
// supports far more — chrome, multiple end states, managers, ambient/preAmbient
// — because it serves every game on the platform; this serves one.

let activeCtx = null;
export function getRenderContext() { return activeCtx; }

function createParticles(limit) {
  const particles = [];
  const max = limit || 160;
  return {
    burst(x, y, color, count, options) {
      const opts = options || {};
      for (let i = 0; i < count && particles.length < max; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = (opts.minSpeed || 35) + Math.random() * ((opts.maxSpeed || 130) - (opts.minSpeed || 35));
        const life = (opts.minLife || 0.28) + Math.random() * ((opts.maxLife || 0.65) - (opts.minLife || 0.28));
        particles.push({
          x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
          gravity: opts.gravity || 0, life, maxLife: life,
          size: (opts.minSize || 2) + Math.random() * ((opts.maxSize || 5) - (opts.minSize || 2)),
          color,
        });
      }
    },
    update(dt) {
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life -= dt;
        if (p.life <= 0) { particles.splice(i, 1); continue; }
        p.vy += p.gravity * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
    },
    draw(ctx) {
      const c = ctx || activeCtx;
      if (!c) return;
      c.save();
      for (const p of particles) {
        c.globalAlpha = Math.max(0, Math.min(1, p.life / p.maxLife));
        c.fillStyle = p.color;
        c.beginPath();
        c.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        c.fill();
      }
      c.restore();
    },
    clear() { particles.length = 0; },
  };
}

export function defineGame({ createRenderer, createInput, createAudio }) {
  const steps = {};
  const builder = {
    orientation() { return builder; },
    renderer() { return builder; },
    input() { return builder; },
    audio(o) { steps.audio = o || {}; return builder; },
    particles(limit) { steps.particleLimit = limit; return builder; },
    setup(fn) { steps.setup = fn; return builder; },
    init(fn) { steps.init = fn; return builder; },
    restartAnnounce() { return builder; },
    win(config) { steps.win = config; return builder; },
    update(fn) { steps.update = fn; return builder; },
    ambient(fn) { steps.ambient = fn; return builder; },
    render(fn) { steps.render = fn; return builder; },
    snapshot() { return builder; },
    start() {
      const renderer = createRenderer(document.getElementById('game'));
      const { canvas, draw } = renderer;
      activeCtx = renderer.ctx;
      const input = createInput(canvas);
      const audio = createAudio(steps.audio);
      const particles = createParticles(steps.particleLimit);

      let lifecycle = 'playing';
      let pendingEnd = null;
      let frameCount = 0;

      function endSoon(outcome, frames, options) {
        if (lifecycle !== 'playing' || pendingEnd) return;
        pendingEnd = { outcome, framesRemaining: Math.max(1, Math.round(frames)), options, registeredFrame: frameCount };
      }

      function end(outcome, options) {
        if (lifecycle !== 'playing') return;
        lifecycle = outcome;
        pendingEnd = null;
        audio.stopMusic();
        const config = steps.win || {};
        if (config.sfx) audio.play(config.sfx);
        if (config.burst) {
          const at = (options && options.at) || (config.burst.at && config.burst.at(state)) || { x: canvas.width / 2, y: canvas.height / 2 };
          particles.burst(at.x, at.y, config.burst.color, config.burst.count || 24, config.burst.options);
        }
        if (config.onEnd) config.onEnd(state, kit);
      }

      const kit = {
        canvas, draw, width: canvas.width, height: canvas.height,
        input, audio, particles,
        end, endSoon,
        lifecycle: () => lifecycle,
      };

      const persistent = steps.setup ? steps.setup(kit) : undefined;
      let state = steps.init(kit, persistent);
      audio.playMusic();

      let previous = performance.now();
      function frame(now) {
        const dt = Math.min(1 / 20, Math.max(0, (now - previous) / 1000));
        previous = now;
        frameCount++;
        particles.update(dt);
        if (lifecycle === 'playing') {
          steps.update(state, kit, dt);
          if (pendingEnd && lifecycle === 'playing' && pendingEnd.registeredFrame !== frameCount) {
            pendingEnd.framesRemaining--;
            if (pendingEnd.framesRemaining <= 0) {
              const { outcome, options } = pendingEnd;
              pendingEnd = null;
              end(outcome, options);
            }
          }
        }
        if (steps.ambient) steps.ambient(state, kit, dt);

        steps.render(state, kit);
        if (lifecycle === 'won') {
          const config = steps.win || {};
          const accent = typeof config.color === 'function' ? config.color(state) : config.color;
          draw.overlay(canvas.width, canvas.height, resolveTitle(config.title, state), config.subtitle ? resolveTitle(config.subtitle, state) : '', accent || '#65f59a');
        }
        renderer.presentFrame();
        requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    },
  };
  return builder;
}

function resolveTitle(value, state) {
  if (typeof value === 'function') return value(state);
  if (value && typeof value === 'object') return value.en || '';
  return value || '';
}

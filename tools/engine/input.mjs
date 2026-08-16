// Keyboard + click + a two-control touch layer (dpad, one action button).
//
// Scoped down from GameKit's general input module (which also handles look
// joysticks, steering vectors, gamepad bridging, and four-way pads) to what
// this game reads: left/right, one action key, and taps. The DOM structure
// and class names (`gamekit-touch-*`) match the shell CSS already shipping
// in the bundle, so the touch controls render identically for free.

const ACTION_KEYS = [' '];
const LEFT_KEYS = ['arrowleft', 'a'];
const RIGHT_KEYS = ['arrowright', 'd'];

function normalize(key) {
  return String(key).toLowerCase();
}

export function createInput(canvas) {
  const down = Object.create(null);
  const pressed = Object.create(null);
  let clickQueue = null;
  let pointerHeld = false;

  function setKey(key, isDown) {
    key = normalize(key);
    if (isDown && !down[key]) pressed[key] = true;
    down[key] = isDown;
  }

  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    const key = normalize(event.key);
    if (LEFT_KEYS.includes(key) || RIGHT_KEYS.includes(key) || ACTION_KEYS.includes(key)) event.preventDefault();
    setKey(key, true);
  });
  window.addEventListener('keyup', (event) => setKey(normalize(event.key), false));

  function toBitmap(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * canvas.width,
      y: ((clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  canvas.addEventListener('pointerdown', () => { pointerHeld = true; });
  window.addEventListener('pointerup', (event) => {
    pointerHeld = false;
    const rect = canvas.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) return;
    clickQueue = toBitmap(event.clientX, event.clientY);
  });

  buildTouchControls(setKey);

  return {
    down: (...keys) => keys.some((k) => Boolean(down[normalize(k)])),
    consume: (...keys) => {
      for (const key of keys) {
        const k = normalize(key);
        if (pressed[k]) { delete pressed[k]; return true; }
      }
      return false;
    },
    consumeClick: () => {
      const value = clickQueue;
      clickQueue = null;
      return value;
    },
    held: () => pointerHeld,
    clearPressed: () => {
      for (const key of Object.keys(pressed)) delete pressed[key];
    },
  };
}

// The game configures `.input({ touch: {...}, bridge: false })` — GameKit's
// real rule (`explicitTouch && bridgeDisabled`) mounts the on-screen controls
// unconditionally for that shape, not only on detected touch hardware. Mouse
// clicks work the buttons too, so this is a deliberate always-on play option,
// not a mobile-only affordance.
function buildTouchControls(setKey) {
  const root = document.createElement('div');
  root.className = 'gamekit-touch';
  root.setAttribute('aria-hidden', 'true');

  const pad = document.createElement('div');
  pad.className = 'gamekit-touch-pad is-horizontal';
  for (const dir of ['left', 'right']) {
    const mark = document.createElement('span');
    mark.className = `gamekit-touch-dir is-${dir}`;
    mark.textContent = dir === 'left' ? '◀' : '▶';
    pad.appendChild(mark);
  }
  const nub = document.createElement('div');
  nub.className = 'gamekit-touch-nub';
  pad.appendChild(nub);

  let padPointer = null;
  function trackPad(event) {
    const rect = pad.getBoundingClientRect();
    const dx = (event.clientX - (rect.left + rect.width / 2)) / (rect.width / 2);
    setKey('arrowleft', dx < -0.15);
    setKey('arrowright', dx > 0.15);
    nub.style.transform = `translate(${Math.max(-1, Math.min(1, dx)) * 34}%, 0)`;
  }
  pad.addEventListener('pointerdown', (event) => {
    padPointer = event.pointerId;
    pad.setPointerCapture(event.pointerId);
    pad.classList.add('is-active');
    trackPad(event);
    event.preventDefault();
  });
  pad.addEventListener('pointermove', (event) => {
    if (event.pointerId !== padPointer) return;
    trackPad(event);
    event.preventDefault();
  });
  function endPad(event) {
    if (event.pointerId !== padPointer) return;
    padPointer = null;
    pad.classList.remove('is-active');
    nub.style.transform = '';
    setKey('arrowleft', false);
    setKey('arrowright', false);
  }
  pad.addEventListener('pointerup', endPad);
  pad.addEventListener('pointercancel', endPad);
  root.appendChild(pad);

  const coach = document.createElement('p');
  coach.className = 'gamekit-touch-coach';
  coach.textContent = 'Touch to play';
  root.appendChild(coach);

  const rightCluster = document.createElement('div');
  rightCluster.className = 'gamekit-touch-right';
  const buttonRow = document.createElement('div');
  buttonRow.className = 'gamekit-touch-buttons';
  const button = document.createElement('div');
  button.className = 'gamekit-touch-btn';
  button.textContent = 'ACT';
  button.addEventListener('pointerdown', (event) => {
    button.setPointerCapture(event.pointerId);
    button.classList.add('is-active');
    setKey(' ', true);
    event.preventDefault();
  });
  function endButton() {
    button.classList.remove('is-active');
    setKey(' ', false);
  }
  button.addEventListener('pointerup', endButton);
  button.addEventListener('pointercancel', endButton);
  buttonRow.appendChild(button);
  rightCluster.appendChild(buttonRow);
  root.appendChild(rightCluster);

  (document.querySelector('.wrap') || document.body).appendChild(root);
}

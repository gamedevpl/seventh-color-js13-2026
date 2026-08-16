// Keyboard + click/tap. No on-screen D-pad or action button.
//
// This scope's only mode is `dialogue`: pressedAction() advances on Space or
// on a tap anywhere in the dialogue panel (dialogueTap checks the panel's
// y-range, not a specific button), and nothing in scope reads arrow keys —
// story-slice-movement's left/right walking is dead code here, folded out
// with the rest of the modes this build doesn't reach. A physical on-screen
// control would be decoration pointing at nothing.
//
// If scope widens to a scene that walks (mode: 'walk-dialogue') or steers
// (meg-encounter, ring-recovery, spring-restoration, throne-pursuit), this
// needs the D-pad back — touch players have no other way to hold a direction.

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


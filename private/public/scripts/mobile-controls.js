// Mobile Controls for Touch Devices
// Based on forest-orb-master/gamecanvas.js

const preventNativeKeys = ['ArrowUp', 'ArrowDown', 'ArrowRight', 'ArrowLeft', ' ', 'F12'];
const keys = new Map();
const keysDown = new Map();
const canvas = document.getElementById('canvas');
let lastTouchedId;

// Detect touchscreen
const hasTouchscreen = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

/**
 * Simulate a keyboard event on the canvas
 *
 * @param {string} eventType Type of the keyboard event
 * @param {string} key Key to simulate
 * @param {number} keyCode Key code to simulate (deprecated)
 */
function simulateKeyboardEvent(eventType, key, keyCode) {
  const event = new Event(eventType, { bubbles: true });
  event.key = key;
  event.code = key;
  // Deprecated, but necessary for emscripten somehow
  event.keyCode = keyCode;
  event.which = keyCode;

  canvas.dispatchEvent(event);
}

/**
 * Simulate a keyboard input from `keydown` to `keyup`
 *
 * @param {string} key Key to simulate
 * @param {number} keyCode Key code to simulate (deprecated)
 */
function simulateKeyboardInput(key, keyCode) {
  simulateKeyboardEvent('keydown', key, keyCode);
  window.setTimeout(() => {
    simulateKeyboardEvent('keyup', key, keyCode);
  }, 100);
}

/**
 * Bind a node by a specific key to simulate on touch
 *
 * @param {*} node The node to bind a key to
 * @param {string} key Key to simulate
 * @param {number} keyCode Key code to simulate (deprecated)
 */
function bindKey(node, key, keyCode) {
  keys.set(node.id, { key, keyCode });

  node.addEventListener('touchstart', event => {
    if (event.cancelable)
      event.preventDefault();
    simulateKeyboardEvent('keydown', key, keyCode);
    keysDown.set(event.target.id, node.id);
    node.classList.add('active');
  });

  node.addEventListener('touchend', event => {
    if (event.cancelable)
      event.preventDefault();

    const pressedKey = keysDown.get(event.target.id);
    if (pressedKey && keys.has(pressedKey)) {
      const { key, keyCode } = keys.get(pressedKey);
      simulateKeyboardEvent('keyup', key, keyCode);
    }

    keysDown.delete(event.target.id);
    node.classList.remove('active');

    if (lastTouchedId) {
      const lastElement = document.getElementById(lastTouchedId);
      if (lastElement) {
        lastElement.classList.remove('active');
      }
    }
  });

  // Handle touch move for better UX
  node.addEventListener('touchmove', event => {
    const { target, clientX, clientY } = event.changedTouches[0];
    const origTargetId = keysDown.get(target.id);
    const elementAtPoint = document.elementFromPoint(clientX, clientY);
    if (!elementAtPoint) return;
    
    const nextTargetId = elementAtPoint.id;
    if (origTargetId === nextTargetId) return;

    if (origTargetId) {
      const origElement = document.getElementById(origTargetId);
      if (origElement && keys.has(origTargetId)) {
        const { key, keyCode } = keys.get(origTargetId);
        simulateKeyboardEvent('keyup', key, keyCode);
        keysDown.delete(target.id);
        origElement.classList.remove('active');
      }
    }

    if (keys.has(nextTargetId)) {
      const nextElement = document.getElementById(nextTargetId);
      if (nextElement) {
        const { key, keyCode } = keys.get(nextTargetId);
        simulateKeyboardEvent('keydown', key, keyCode);
        keysDown.set(target.id, nextTargetId);
        lastTouchedId = nextTargetId;
        nextElement.classList.add('active');
      }
    }
  });
}

/** @type {{[key: number]: Gamepad}} */
const gamepads = {};
const haveEvents = 'ongamepadconnected' in window;

function addGamepad(gamepad) {
  if (gamepad == undefined)
    return;
  gamepads[gamepad.index] = gamepad;
  updateTouchControlsVisibility();
}

function removeGamepad(gamepad) {
  if (gamepad == undefined)
    return;
  delete gamepads[gamepad.index];
  updateTouchControlsVisibility();
}

/** @returns {Gamepad[]} */
function getGamepads() {
  return navigator.getGamepads ? navigator.getGamepads() : (navigator.webkitGetGamepads ? navigator.webkitGetGamepads() : []);
}

function scanGamePads() {
  const pads = getGamepads();
  for (let i = 0; i < pads.length; i++) {
    if (pads[i]) {
      if (pads[i].index in gamepads)
        gamepads[pads[i].index] = pads[i];
      else
        addGamepad(pads[i]);
    }
  }
}

if (!haveEvents) {
  setInterval(scanGamePads, 500);
}

window.addEventListener('gamepadconnected', e => addGamepad(e.gamepad));
window.addEventListener('gamepaddisconnected', e => removeGamepad(e.gamepad));

function updateTouchControlsVisibility() {
  const dpad = document.getElementById('dpad');
  const apad = document.getElementById('apad');
  
  if (!dpad || !apad) return;
  
  if (hasTouchscreen && !Object.keys(gamepads).length) {
    dpad.style.display = 'block';
    apad.style.display = 'block';
  } else {
    // If we don't have a touch screen, OR any gamepads are connected...
    dpad.style.display = 'none';
    apad.style.display = 'none';
  }
}

// Bind all elements providing a `data-key` attribute with the
// given key on touch-based devices
if (hasTouchscreen) {
  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMobileControls);
  } else {
    initMobileControls();
  }
}

function initMobileControls() {
  // Bind all buttons with data-key attributes
  for (const button of document.querySelectorAll('[data-key]')) {
    const key = button.dataset.key;
    const keyCode = button.dataset.keyCode ? parseInt(button.dataset.keyCode) : getKeyCode(key);
    bindKey(button, key, keyCode);
  }
  
  // Also bind the d-pad paths
  const dpadUp = document.getElementById('dpad-up');
  const dpadDown = document.getElementById('dpad-down');
  const dpadLeft = document.getElementById('dpad-left');
  const dpadRight = document.getElementById('dpad-right');
  
  if (dpadUp) bindKey(dpadUp, 'ArrowUp', 38);
  if (dpadDown) bindKey(dpadDown, 'ArrowDown', 40);
  if (dpadLeft) bindKey(dpadLeft, 'ArrowLeft', 37);
  if (dpadRight) bindKey(dpadRight, 'ArrowRight', 39);
  
  updateTouchControlsVisibility();
}

function getKeyCode(key) {
  const keyCodeMap = {
    'ArrowUp': 38,
    'ArrowDown': 40,
    'ArrowLeft': 37,
    'ArrowRight': 39,
    'Enter': 13,
    'Escape': 27,
    'Space': 32,
    ' ': 32,
    'Shift': 16
  };
  return keyCodeMap[key] || 0;
}

// Prevent scrolling when pressing specific keys on canvas
if (canvas) {
  canvas.addEventListener('keydown', event => {
    if (preventNativeKeys.includes(event.key))
      event.preventDefault();
  });
  
  canvas.addEventListener('contextmenu', event => {
    event.preventDefault();
  });
}

// Make canvas focusable for keyboard input
if (canvas) {
  canvas.addEventListener('mouseenter', () => canvas.focus());
  canvas.addEventListener('click', () => canvas.focus());
}


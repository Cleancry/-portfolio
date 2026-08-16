/* ============================================================
   PENITENT BLADE — engine/input.js
   keyboard input with buffering (for combos) + action mapping
   ============================================================ */
'use strict';
(function () {
  const Game = window.Game;
  const U = Game.U;

  const KEYMAP = {
    left:  ['ArrowLeft', 'KeyA'],
    right: ['ArrowRight', 'KeyD'],
    up:    ['ArrowUp', 'KeyW'],
    down:  ['ArrowDown', 'KeyS'],
    light: ['KeyJ', 'KeyZ'],
    heavy: ['KeyK', 'KeyX'],
    exec:  ['KeyL', 'KeyC'],
    dash:  ['ShiftLeft', 'ShiftRight', 'Space'],
    guard: ['ArrowDown', 'KeyS', 'ControlLeft'],
  };

  /* buffer: name -> {framesLeft, pressed} */
  const buf = {};
  const held = {};
  const pressed = {};

  let lastKey = null;
  let anyKey = false;
  let enabled = false;

  function keyName(e) {
    let n = e.code;
    if (n === 'Space') n = 'Space';
    return n;
  }

  window.addEventListener('keydown', e => {
    const n = keyName(e);
    if (['Space','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.code)) e.preventDefault();
    lastKey = n;
    anyKey = true;
    if (held[n]) return;           // ignore repeat
    held[n] = true;
    pressed[n] = true;
    for (const action in KEYMAP) {
      if (KEYMAP[action].includes(n)) {
        buf[action] = { frames: 8, pressed: true };
      }
    }
  });
  window.addEventListener('keyup', e => { held[keyName(e)] = false; });
  window.addEventListener('blur', () => { for (const k in held) held[k] = false; });

  const I = {
    enable() { enabled = true; },
    disable() { enabled = false; },
    get anyKey() { return anyKey; },

    down(action) {
      if (!enabled) return false;
      return KEYMAP[action].some(k => held[k]);
    },
    rawDown(code) { return !!held[code]; },

    /* pressed-edge, no buffer */
    tapped(action) {
      if (!enabled) return false;
      for (const k of KEYMAP[action]) {
        if (pressed[k]) { pressed[k] = false; return true; }
      }
      return false;
    },

    /* buffered press for combo inputs */
    consume(action) {
      if (!enabled) return false;
      if (buf[action] && buf[action].frames > 0 && buf[action].pressed) {
        buf[action].pressed = false;
        return true;
      }
      return false;
    },
    buffered(action) {
      return !!(buf[action] && buf[action].frames > 0);
    },

    /* direction axis (-1..1) */
    axisX() {
      if (!enabled) return 0;
      return (I.down('right') ? 1 : 0) - (I.down('left') ? 1 : 0);
    },
    axisY() {
      if (!enabled) return 0;
      return (I.down('down') ? 1 : 0) - (I.down('up') ? 1 : 0);
    },

    /* called every frame */
    update() {
      for (const k in pressed) pressed[k] = false;
      for (const a in buf) if (buf[a]) buf[a].frames--;
      if (held['ShiftLeft'] || held['ShiftRight'] || held['Space']) {
        // dash edge handled via consume; ensure buffer decays
      }
    }
  };

  Game.Input = I;
})();

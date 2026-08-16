/* ============================================================
   PENITENT BLADE — engine/util.js
   math, easing, random helpers. Zero-dependency.
   ============================================================ */
'use strict';
window.Game = window.Game || {};

(function () {
  const U = {};

  U.clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.invLerp = (a, b, v) => (v - a) / (b - a);
  U.map = (v, a, b, c, d) => c + (d - c) * U.invLerp(a, b, U.clamp(v, a, b));
  U.rand = (a, b) => a + Math.random() * (b - a);
  U.randInt = (a, b) => Math.floor(U.rand(a, b + 1));
  U.pick = arr => arr[Math.floor(Math.random() * arr.length)];
  U.sign = v => v < 0 ? -1 : (v > 0 ? 1 : 0);
  U.dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
  U.angle = (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax);

  /* frame-rate independent damping: returns smoothed value */
  U.damp = (cur, target, rate, dt) => U.lerp(cur, target, 1 - Math.exp(-rate * dt));

  /* 1D easing for camera / UI */
  U.easeOutCubic = t => 1 - Math.pow(1 - t, 3);
  U.easeInCubic = t => t * t * t;
  U.easeOutQuint = t => 1 - Math.pow(1 - t, 5);
  U.easeOutBack = t => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2);
  U.easeInOutQuad = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

  /* simple seeded rng for stable procedural art */
  U.mulberry32 = function (seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  /* color helpers (hex <-> rgb) */
  U.hex = (r, g, b, a) => 'rgba(' + r + ',' + g + ',' + b + ',' + (a === undefined ? 1 : a) + ')';
  U.shade = (hex, amt) => {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    r = U.clamp(Math.round(r * (1 + amt)), 0, 255);
    g = U.clamp(Math.round(g * (1 + amt)), 0, 255);
    b = U.clamp(Math.round(b * (1 + amt)), 0, 255);
    return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
  };

  /* time helper: track a timed window */
  U.timer = function (seconds, auto = true) {
    return { max: seconds, t: auto ? seconds : 0,
             update(dt) { this.t -= dt; return this.t <= 0; },
             reset() { this.t = this.max; },
             frac() { return U.clamp(this.t / this.max, 0, 1); },
             done() { return this.t <= 0; } };
  };

  U.deg = d => d * Math.PI / 180;

  Game.U = U;
})();

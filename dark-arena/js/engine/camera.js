/* ============================================================
   PENITENT BLADE — engine/camera.js
   world camera: follow, shake, zoom punch, focus targets
   ============================================================ */
'use strict';
(function () {
  const Game = window.Game;
  const U = Game.U;

  class Camera {
    constructor(w, h) {
      this.vw = w; this.vh = h;       // viewport size (world units)
      this.x = 0; this.y = 0;         // top-left of view in world
      this.zoom = 1;
      this.targetZoom = 1;
      this.tx = 0; this.ty = 0;       // follow target
      this.shakeT = 0; this.shakeAmp = 0;
      this.ox = 0; this.oy = 0;       // offset jitter
      this.bounds = null;             // {x, y, w, h} world clamp
      this.zoomPunch = 0;             // quick zoom kick (hit impact)
    }

    setView(w, h) { this.vw = w; this.vh = h; }

    snap(x, y) { this.tx = x; this.ty = y; this.x = x - this.vw / 2; this.y = y - this.vh / 2; }

    shake(amp, dur) { this.shakeAmp = Math.max(this.shakeAmp, amp); this.shakeT = Math.max(this.shakeT, dur); }

    zoomTo(z, dur) { this.targetZoom = Math.max(0.1, z); }
    punch(z) { this.zoomPunch = Math.max(this.zoomPunch, z); }

    update(dt) {
      // smooth follow
      const k = 1 - Math.exp(-8 * dt);
      this.x += (this.tx - this.vw / 2 - this.x) * k;
      this.y += (this.ty - this.vh / 2 - this.y) * k;

      // zoom easing
      this.zoom = U.damp(this.zoom, this.targetZoom, 6, dt);
      if (this.zoomPunch > 0) {
        this.zoomPunch = Math.max(0, this.zoomPunch - dt * 3);
        this.zoom *= 1 + this.zoomPunch * 0.12;
      }

      // shake decay
      if (this.shakeT > 0) {
        this.shakeT -= dt;
        const a = this.shakeAmp * (this.shakeT / Math.max(0.001, this.shakeT + dt)) * U.clamp(this.shakeT * 8, 0, 1);
        this.ox = U.rand(-a, a);
        this.oy = U.rand(-a, a);
        if (this.shakeT <= 0) { this.ox = 0; this.oy = 0; }
      } else { this.ox = 0; this.oy = 0; }

      // clamp to bounds
      if (this.bounds) {
        const vw = this.vw / this.zoom, vh = this.vh / this.zoom;
        if (vw < this.bounds.w) this.x = U.clamp(this.x, this.bounds.x, this.bounds.x + this.bounds.w - vw);
        else this.x = this.bounds.x + (this.bounds.w - vw) / 2;
        if (vh < this.bounds.h) this.y = U.clamp(this.y, this.bounds.y, this.bounds.y + this.bounds.h - vh);
        else this.y = this.bounds.y + (this.bounds.h - vh) / 2;
      }
    }

    /* world -> screen (call before drawing world, then restore) */
    apply(ctx) {
      ctx.save();
      ctx.scale(this.zoom, this.zoom);
      ctx.translate(-(this.x + this.ox), -(this.y + this.oy));
    }
    restore(ctx) { ctx.restore(); }

    /* world -> screen point */
    toScreen(wx, wy) {
      return {
        x: (wx - this.x - this.ox) * this.zoom,
        y: (wy - this.y - this.oy) * this.zoom,
      };
    }
  }

  Game.Camera = Camera;
})();

/* ============================================================
   PENITENT BLADE — engine/anim.js
   frame animation state machine.
   Each animation is its own sheet (auto-cut frames).
   ============================================================ */
'use strict';
(function () {
  const Game = window.Game;
  const U = Game.U;

  class Animator {
    constructor() {
      this.sheet = null;          // SpriteSheet
      this.frames = [];           // indices into sheet.frames
      this.fps = 8;
      this.loop = true;
      this.t = 0;
      this.idx = 0;
      this.playing = false;
      this.onComplete = null;
      this.animName = null;
    }

    /* set sheet + auto use all frames */
    setSheet(sheet, fps = 8, loop = true) {
      this.sheet = sheet;
      this.frames = sheet.frames.map((_, i) => i);
      this.fps = fps;
      this.loop = loop;
      this.animName = sheet.name;
    }

    play(sheet, fps, loop, onComplete) {
      const changed = this.sheet !== sheet || this.animName !== (sheet && sheet.name);
      this.setSheet(sheet, fps, loop);
      this.onComplete = onComplete || null;
      if (changed) { this.t = 0; this.idx = 0; }
      this.playing = true;
    }

    /* explicit frame list control */
    playFrames(sheet, indices, fps, loop, onComplete) {
      const key = indices.join(',');
      const changed = this.sheet !== sheet || this.animName !== sheet.name + '#' + key;
      this.sheet = sheet;
      this.frames = indices;
      this.fps = fps;
      this.loop = loop;
      this.animName = sheet.name + '#' + key;
      this.onComplete = onComplete || null;
      if (changed) { this.t = 0; this.idx = 0; }
      this.playing = true;
    }

    stop() { this.playing = false; }

    update(dt, timeScale = 1) {
      if (!this.playing || !this.sheet || !this.frames.length) return false;
      this.t += dt * this.fps * timeScale;
      const n = this.frames.length;
      if (this.t >= 1) {
        let steps = Math.floor(this.t);
        this.t -= steps;
        this.idx = (this.idx + steps) % n;
        if (!this.loop && this.idx + steps > n) {
          // reached end
        }
        if (!this.loop && (this.idx + steps >= n)) {
          this.idx = n - 1;
          this.playing = false;
          if (this.onComplete) { const cb = this.onComplete; this.onComplete = null; cb(); }
          return true;
        }
      }
      return false;
    }

    /* current frame rect (in sheet space) */
    frame() {
      if (!this.sheet) return null;
      return this.sheet.frames[this.frames[this.idx] % this.sheet.n];
    }

    progress() { return (this.idx + this.t) / this.frames.length; }

    draw(ctx, x, y, opts) {
      if (!this.sheet) return;
      const f = this.frame();
      if (!f) return;
      const o = opts || {};
      const scale = o.scale || 1;
      const flip = !!o.flip;
      const dw = f.w * scale, dh = f.h * scale;
      ctx.save();
      ctx.translate(x, y);
      if (flip) ctx.scale(-1, 1);
      if (o.rot) ctx.rotate(o.rot);
      if (o.alpha !== undefined) ctx.globalAlpha = o.alpha;
      if (o.tint) {
        // tint via composite
        ctx.globalCompositeOperation = 'source-atop';
      }
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(this.sheet.img, f.x, f.y, f.w, f.h, -dw / 2, -dh, dw, dh);
      ctx.restore();
    }

    /* whiten the sprite for hit-flash (via separate canvas) */
    drawFlash(ctx, x, y, opts) {
      if (!this.sheet) return;
      const f = this.frame();
      if (!f) return;
      const o = opts || {};
      const scale = o.scale || 1;
      const flip = !!o.flip;
      const dw = f.w * scale, dh = f.h * scale;
      // draw sprite into temp canvas, then composite as white
      const tcv = document.createElement('canvas');
      tcv.width = Math.max(1, Math.ceil(dw)); tcv.height = Math.max(1, Math.ceil(dh));
      const tcx = tcv.getContext('2d');
      tcx.imageSmoothingEnabled = false;
      tcx.drawImage(this.sheet.img, f.x, f.y, f.w, f.h, 0, 0, dw, dh);
      tcx.globalCompositeOperation = 'source-in';
      tcx.fillStyle = o.flashColor || '#ffffff';
      tcx.fillRect(0, 0, tcv.width, tcv.height);
      ctx.save();
      ctx.translate(x, y);
      if (flip) ctx.scale(-1, 1);
      if (o.alpha !== undefined) ctx.globalAlpha = o.alpha;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(tcv, -dw / 2, -dh);
      ctx.restore();
    }
  }

  Game.Animator = Animator;
})();

/* ============================================================
   PENITENT BLADE — engine/pixelart.js
   sprite-sheet loader with automatic frame cutting (column
   transparency analysis) + procedural pixel sprite helpers.
   ============================================================ */
'use strict';
(function () {
  const Game = window.Game;

  /* ------------------------------------------------------------
     SpriteSheet: image + auto-cut frames + ready-made animations
     ------------------------------------------------------------ */
  class SpriteSheet {
    constructor(name, img) {
      this.name = name;
      this.img = img;
      this.frames = [];   // {x,y,w,h}
      this.rows = [];     // row layout {y,h}
      this.cutFrames();
    }

    /* analyze transparency to find rows and column segments */
    cutFrames() {
      const w = this.img.width, h = this.img.height;
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      const cx = cv.getContext('2d', { willReadFrequently: true });
      cx.drawImage(this.img, 0, 0);
      let data;
      try { data = cx.getImageData(0, 0, w, h).data; } catch (e) {
        // cross-origin or odd image: fall back to whole image as one frame
        this.frames = [{ x: 0, y: 0, w, h }];
        this.rows = [{ y: 0, h }];
        return;
      }
      const alphaAt = (x, y) => data[(y * w + x) * 4 + 3] > 24;

      // rows: any opaque pixel in the row
      const rowEmpty = new Array(h).fill(true);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (alphaAt(x, y)) { rowEmpty[y] = false; break; }
        }
      }
      const rowSegs = this._segments(rowEmpty);
      this.rows = rowSegs.map(s => ({ y: s[0], h: s[1] - s[0] + 1 }));
      if (!this.rows.length) this.rows = [{ y: 0, h }];

      // per row: column segments
      for (const r of this.rows) {
        const colEmpty = new Array(w).fill(true);
        for (let x = 0; x < w; x++) {
          for (let y = r.y; y < r.y + r.h; y++) {
            if (alphaAt(x, y)) { colEmpty[x] = false; break; }
          }
        }
        const segs = this._segments(colEmpty);
        for (const s of segs) {
          this.frames.push({ x: s[0], y: r.y, w: s[1] - s[0] + 1, h: r.h });
        }
      }
      if (!this.frames.length) this.frames = [{ x: 0, y: 0, w, h }];
    }

    _segments(emptyArr) {
      const out = [];
      let inSeg = false, start = 0;
      for (let i = 0; i <= emptyArr.length; i++) {
        const e = i >= emptyArr.length ? true : emptyArr[i];
        if (!inSeg && !e) { inSeg = true; start = i; }
        else if (inSeg && e) { inSeg = false; out.push([start, i - 1]); }
      }
      return out;
    }

    get n() { return this.frames.length; }

    /* return per-frame normalized anchor: bottom-center offset */
    draw(ctx, idx, x, y, opts) {
      const f = this.frames[idx % this.frames.length];
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
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(this.img, f.x, f.y, f.w, f.h, -dw / 2, -dh, dw, dh);
      ctx.restore();
    }
  }

  /* simple cache of loaded sheets */
  const cache = new Map();
  const pending = new Map();

  function loadSheet(name, src) {
    if (cache.has(name)) return Promise.resolve(cache.get(name));
    if (pending.has(name)) return pending.get(name);
    const p = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const sheet = new SpriteSheet(name, img);
        cache.set(name, sheet);
        pending.delete(name);
        resolve(sheet);
      };
      img.onerror = () => { pending.delete(name); reject(new Error('img load fail: ' + src)); };
      img.src = src;
    });
    pending.set(name, p);
    return p;
  }

  /* ------------------------------------------------------------
     Procedural pixel sprites (fallback / deco / effects)
     draw functions for things we generate ourselves
     ------------------------------------------------------------ */
  const PX = {
    /* render a char-matrix pixel sprite into a sheet-like object */
    fromMatrix(rows, palette, scale = 1) {
      const h = rows.length;
      const w = Math.max(...rows.map(r => r.length));
      const cv = document.createElement('canvas');
      cv.width = w * scale; cv.height = h * scale;
      const cx = cv.getContext('2d');
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const ch = rows[y][x];
          if (ch === '.' || ch === ' ') continue;
          const col = palette[ch];
          if (!col) continue;
          cx.fillStyle = col;
          cx.fillRect(x * scale, y * scale, scale, scale);
        }
      }
      const img = new Image();
      img.src = cv.toDataURL();
      return new SpriteSheet('px:' + Math.random().toString(36).slice(2), img);
    },
  };

  Game.Sprites = { loadSheet, SpriteSheet, cache, PX };
})();

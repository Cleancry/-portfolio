/* ============================================================
   PENITENT BLADE 鈥攅ngine/fx.js
   pooled particle system + screen effects (hitstop, slowmo,
   flash, shockwave, afterimages, slash arcs)
   ============================================================ */
'use strict';
(function () {
  const Game = window.Game;
  const U = Game.U;

  const MAX = 900;

  class FxSystem {
    constructor() {
      this.parts = new Array(MAX);
      this.count = 0;
      // screen states
      this.hitstop = 0;
      this.slowmo = 1;
      this.slowmoT = 0;
      this.flashColor = null;
      this.flashAlpha = 0;
      this.flashDur = 0;
      this.flashT = 0;
      this.bloodVignette = 0;   // 0..1
      this.afterimages = [];    // {sheet, anim, x, y, flip, scale, alpha, life, t}
      this.sheetFx = [];        // real sprite effect animations (impact/magic)
      this.timeScale = 1;
    }

    /* ---------------- time control ---------------- */
    freeze(sec) { this.hitstop = Math.max(this.hitstop, sec); }
    setSlowmo(scale, sec) { this.slowmo = scale; this.slowmoT = sec; }
    flash(color, alpha, dur) { this.flashColor = color; this.flashAlpha = alpha; this.flashDur = dur; this.flashT = dur; }
    hurtVignette(amt) { this.bloodVignette = Math.min(1, this.bloodVignette + amt); }

    /* effective time scale applied to world updates */
    get scale() {
      let s = this.slowmo;
      if (this.hitstop > 0) s = 0;
      return s;
    }

    update(dt) {
      if (this.hitstop > 0) this.hitstop -= dt;
      else if (this.slowmoT > 0) { this.slowmoT -= dt; if (this.slowmoT <= 0) this.slowmo = 1; }
      if (this.flashT > 0) { this.flashT -= dt; this.flashAlpha = this.flashAlpha * (this.flashT / this.flashDur); if (this.flashT <= 0) this.flashColor = null; }
      this.bloodVignette = Math.max(0, this.bloodVignette - dt * 0.8);

      // particles
      const P = this.parts;
      for (let i = 0; i < this.count; i++) {
        const p = P[i];
        p.life -= dt;
        if (p.life <= 0) { this.count--; P[i] = P[this.count]; P[this.count] = p; i--; continue; }
        if (p.grav !== 0) p.vy += p.grav * dt;
        if (p.drag) { p.vx *= Math.max(0, 1 - p.drag * dt); p.vy *= Math.max(0, 1 - p.drag * dt); }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.spin * dt;
      }

      // afterimages
      for (let i = this.afterimages.length - 1; i >= 0; i--) {
        const a = this.afterimages[i];
        a.t += dt;
        if (a.t >= a.life) this.afterimages.splice(i, 1);
      }

      // sprite effect animations
      for (let i = this.sheetFx.length - 1; i >= 0; i--) {
        const s = this.sheetFx[i];
        s.t += dt;
        if (s.t >= s.dur || s.frames.length === 0) this.sheetFx.splice(i, 1);
      }
    }

    /* play a real sprite-sheet effect animation at a world position.
       frames: array of {x,y,w,h}; dur: total duration in seconds */
    spawnSheet(img, frames, x, y, opts) {
      if (!img || !frames || !frames.length) return null;
      const o = opts || {};
      this.sheetFx.push({
        img, frames, x, y,
        t: 0,
        dur: o.dur || 0.25,
        loop: !!o.loop,
        scale: o.scale || 1,
        flip: !!o.flip,
        alpha: o.alpha !== undefined ? o.alpha : 1,
        anchorY: o.anchorY !== undefined ? o.anchorY : 0.5,  // 0=top 1=bottom
      });
      return this.sheetFx[this.sheetFx.length - 1];
    }

    /* ---------------- emission ---------------- */
    spawn(o) {
      if (this.count >= MAX) return null;
      const p = this.parts[this.count++] = {
        x: o.x, y: o.y,
        vx: o.vx || 0, vy: o.vy || 0,
        life: o.life ?? 0.5, maxLife: o.life ?? 0.5,
        size: o.size || 3, color: o.color || '#fff',
        grav: o.grav || 0, drag: o.drag || 0,
        rot: o.rot || 0, spin: o.spin || 0,
        type: o.type || 'dot',
        alpha: o.alpha !== undefined ? o.alpha : 1,
        fade: o.fade !== undefined ? o.fade : true,
        base: o.base || null,   // angle base for slash arcs
        arc: o.arc || 1.2,      // arc width
        len: o.len || 1,        // slash length factor
        grow: o.grow || 0,
        wob: o.wob || 0,
      };
      return p;
    }

    burst(x, y, opts) {
      const n = opts.n || 10;
      for (let i = 0; i < n; i++) {
        const a = opts.angle !== undefined
          ? opts.angle + U.rand(-opts.spread || 0.6, opts.spread || 0.6)
          : U.rand(0, Math.PI * 2);
        const sp = U.rand(opts.speedMin || 60, opts.speedMax || 260);
        this.spawn({
          x, y,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (opts.up || 0),
          life: U.rand(opts.lifeMin || 0.2, opts.lifeMax || 0.6),
          size: U.rand(opts.sizeMin || 2, opts.sizeMax || 5),
          color: opts.color || '#fff',
          grav: opts.grav || 0, drag: opts.drag || 3,
          type: opts.type || 'dot',
          alpha: opts.alpha !== undefined ? opts.alpha : 1,
        });
      }
    }

    sparks(x, y, dirX, opts) {
      const n = opts.n || 14;
      for (let i = 0; i < n; i++) {
        const a = U.rand(-1.9, -0.9) + (dirX < 0 ? Math.PI : 0) + U.rand(-0.35, 0.35);
        const sp = U.rand(220, 620);
        this.spawn({
          x, y,
          vx: Math.cos(a) * sp * dirX, vy: Math.sin(a) * sp * 0.7,
          life: U.rand(0.08, 0.28), size: U.rand(1.5, 3.5),
          color: U.pick(['#ffd9a0', '#ffb066', '#fff6e0', '#ff8844']),
          drag: 4, type: 'spark', alpha: 1, spin: U.rand(-8, 8),
        });
      }
    }

    blood(x, y, dirX, opts) {
      const n = opts.n || 12;
      for (let i = 0; i < n; i++) {
        const a = U.rand(0, Math.PI) + (dirX < 0 ? Math.PI : 0);
        const sp = U.rand(40, opts.speed || 220);
        this.spawn({
          x: x + U.rand(-6, 6), y: y + U.rand(-14, 6),
          vx: Math.cos(a) * sp, vy: -U.rand(20, 160),
          life: U.rand(0.3, 0.9),
          size: U.rand(2, 6),
          color: U.pick(['#8e0f0f', '#b01d16', '#5e0a0a', '#a3111a']),
          grav: 420, drag: 1.2, type: 'blood', alpha: 1,
        });
      }
    }

    embers(x, y, n, color) {
      for (let i = 0; i < n; i++) {
        this.spawn({
          x: x + U.rand(-10, 10), y: y + U.rand(-6, 6),
          vx: U.rand(-12, 12), vy: U.rand(-40, -12),
          life: U.rand(0.5, 1.4), size: U.rand(1, 2.6),
          color: color || U.pick(['#ffb066', '#ff8844', '#ffd9a0']),
          grav: -12, drag: 0.6, type: 'ember', alpha: U.rand(0.5, 1), wob: U.rand(2, 6),
        });
      }
    }

    ring(x, y, color, size, life, width) {
      this.spawn({
        x, y, vx: 0, vy: 0, life: life || 0.3, maxLife: life || 0.3,
        size: size || 8, color: color || '#fff', type: 'ring',
        alpha: 1, grow: (size || 8) * 6, base: width || 3,
      });
    }

    /* soft additive light blob (torch flare, magic glow, impact bloom) */
    glow(x, y, color, size, life, alpha) {
      this.spawn({
        x, y, vx: 0, vy: 0,
        life: life || 0.4, maxLife: life || 0.4,
        size: size || 30, color: color || 'rgba(255,180,90,0.5)',
        type: 'glow', alpha: alpha !== undefined ? alpha : 0.5, fade: true,
      });
    }

    slashArc(x, y, angle, color, len, arc, life) {
      this.spawn({
        x, y, vx: 0, vy: 0,
        life: life || 0.16, maxLife: life || 0.16,
        size: 1, color: color || '#ffe9b0', type: 'slash',
        base: angle, arc: arc || 1.6, len: len || 1,
        alpha: 1, fade: true, rot: 0,
      });
    }

    ghost(x, y, color, n) {
      for (let i = 0; i < n; i++) {
        this.spawn({
          x: x + U.rand(-16, 16), y: y + U.rand(-4, 4),
          vx: U.rand(-30, 30), vy: -U.rand(40, 110),
          life: U.rand(0.4, 1.0), size: U.rand(3, 8),
          color: color || '#7a8a9a', type: 'smoke',
          grav: -30, drag: 2, alpha: 0.4,
        });
      }
    }

    /* floating damage number */
    dmgNum(x, y, n, color, big) {
      this.spawn({
        x: x + U.rand(-8, 8), y: y, vx: 0, vy: -64,
        life: 0.62, maxLife: 0.62, size: big ? 19 : 13,
        color: color || '#ffffff', type: 'text', alpha: 1,
        text: String(n),
      });
    }

    addAfterimage(sheet, anim, x, y, flip, scale, life, alpha) {
      this.afterimages.push({ sheet, anim, x, y, flip, scale, life, alpha, t: 0 });
    }

    /* ---------------- render ---------------- */
    draw(ctx) {
      const P = this.parts;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';   // additive pass (sparks etc)
      for (let i = 0; i < this.count; i++) {
        const p = P[i];
        if (p.type === 'dot' || p.type === 'spark' || p.type === 'ember') {
          const a = p.fade ? p.alpha * U.clamp(p.life / (p.maxLife * 0.6), 0, 1) : p.alpha;
          ctx.globalAlpha = a;
          ctx.fillStyle = p.color;
          const s = p.type === 'spark' ? Math.max(1, p.size * (0.4 + p.life / p.maxLife * 0.6)) : p.size;
          if (p.type === 'spark') {
            // stretched spark along velocity
            const ang = Math.atan2(p.vy, p.vx);
            const len = 5 + p.size * 3 * (p.life / p.maxLife);
            ctx.save();
            ctx.translate(p.x, p.y); ctx.rotate(ang);
            ctx.fillRect(-len, -s / 2, len * 2, s);
            ctx.restore();
          } else {
            ctx.beginPath();
            ctx.arc(p.x, p.y, s, 0, Math.PI * 2);
            ctx.fill();
          }
        } else if (p.type === 'glow') {
          // soft additive light blob
          const a = p.fade ? p.alpha * U.clamp(p.life / (p.maxLife * 0.7), 0, 1) : p.alpha;
          ctx.globalAlpha = a;
          const g = ctx.createRadialGradient(p.x, p.y, 0.5, p.x, p.y, Math.max(2, p.size));
          g.addColorStop(0, p.color);
          g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(2, p.size), 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.restore();

      // normal pass
      ctx.save();
      for (let i = 0; i < this.count; i++) {
        const p = P[i];
        const a = p.fade ? p.alpha * U.clamp(p.life / (p.maxLife * 0.7), 0, 1) : p.alpha;
        if (p.type === 'blood') {
          ctx.globalAlpha = a;
          ctx.fillStyle = p.color;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.5 + p.life / p.maxLife * 0.5), 0, Math.PI * 2); ctx.fill();
        } else if (p.type === 'smoke') {
          // two-layer soft smoke: faint outer billow + denser core
          const grow = 1 + (1 - p.life / p.maxLife) * 2.4;
          ctx.globalAlpha = a * 0.22;
          ctx.fillStyle = p.color;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1 + grow), 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = a * 0.5;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.5 + grow * 0.7), 0, Math.PI * 2); ctx.fill();
        } else if (p.type === 'ring') {
          const t = 1 - p.life / p.maxLife;
          ctx.globalAlpha = a;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = p.base || 3;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size + p.grow * t, 0, Math.PI * 2);
          ctx.stroke();
        } else if (p.type === 'slash') {
          const t = 1 - p.life / p.maxLife;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.base + t * 0.5);
          ctx.globalAlpha = a * 0.9;
          const grad = ctx.createRadialGradient(0, 0, 2, 0, 0, 90 * p.len);
          grad.addColorStop(0, p.color);
          grad.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.arc(0, 0, 96 * p.len, -p.arc * 0.35, p.arc * 0.45);
          ctx.closePath();
          ctx.fill();
          ctx.globalCompositeOperation = 'lighter';
          // bright hot core arc
          ctx.strokeStyle = '#fff6e0';
          ctx.globalAlpha = a;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(0, 0, 96 * p.len, -p.arc * 0.2, p.arc * 0.35);
          ctx.stroke();
          // golden outer edge (motion smear)
          ctx.strokeStyle = '#ffb066';
          ctx.globalAlpha = a * 0.55;
          ctx.lineWidth = 7;
          ctx.beginPath();
          ctx.arc(0, 0, 96 * p.len, -p.arc * 0.32, p.arc * 0.44);
          ctx.stroke();
          // trailing glint at the blade tip
          ctx.fillStyle = '#ffe9b0';
          ctx.globalAlpha = a * 0.9;
          ctx.beginPath();
          ctx.arc(96 * p.len * 0.92, 0, 3 + t * 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        } else if (p.type === 'text') {
          // floating damage number
          const t = 1 - p.life / p.maxLife;
          ctx.globalAlpha = a;
          ctx.font = '700 ' + p.size + 'px "Noto Serif SC", "Source Han Serif SC", "Microsoft YaHei", "SimHei", "STZhongsong", "SimSun", Georgia, serif';
          ctx.textAlign = 'center';
          ctx.fillStyle = p.color;
          ctx.shadowColor = 'rgba(0,0,0,0.8)';
          ctx.shadowBlur = 4;
          ctx.fillText(p.text || '', p.x, p.y + t * -14);
          ctx.shadowBlur = 0;
        }
      }
      ctx.restore();

      // afterimages
      for (const a of this.afterimages) {
        ctx.save();
        ctx.globalAlpha = a.alpha * (1 - a.t / a.life);
        ctx.translate(a.x, a.y);
        if (a.flip) ctx.scale(-1, 1);
        ctx.imageSmoothingEnabled = false;
        const f = a.anim ? a.anim.frame() : a.sheet.frames[0];
        if (f) {
          const dw = f.w * a.scale, dh = f.h * a.scale;
          ctx.drawImage(a.sheet.img, f.x, f.y, f.w, f.h, -dw / 2, -dh, dw, dh);
        }
        ctx.restore();
      }

      // real sprite effect animations (impact bursts, magic flashes)
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      for (const s of this.sheetFx) {
        const idx = Math.min(s.frames.length - 1, Math.floor(s.t / s.dur * s.frames.length));
        const f = s.frames[idx];
        if (!f) continue;
        ctx.save();
        ctx.translate(s.x, s.y);
        if (s.flip) ctx.scale(-1, 1);
        ctx.globalAlpha = s.alpha;
        const dw = f.w * s.scale, dh = f.h * s.scale;
        ctx.drawImage(s.img, f.x, f.y, f.w, f.h, -dw / 2, -dh * s.anchorY, dw, dh);
        ctx.restore();
      }
      ctx.restore();
    }
  }

  Game.Fx = new FxSystem();
})();

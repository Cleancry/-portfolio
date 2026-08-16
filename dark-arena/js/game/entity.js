/* ============================================================
   PENITENT BLADE — game/entity.js
   base combatant: physics, hit reactions, animation state
   ============================================================ */
'use strict';
(function () {
  const Game = window.Game;
  const U = Game.U;

  class Entity {
    constructor(o) {
      this.x = o.x || 0;
      this.y = o.y || 0;
      this.vx = 0; this.vy = 0;
      this.w = o.w || 40;            // collision half-width (centered)
      this.h = o.h || 100;           // collision height (above feet)
      this.facing = o.facing || 1;
      this.scale = o.scale || 3;
      this.hp = o.hp || 100;
      this.maxHp = this.hp;
      this.speed = o.speed || 200;
      this.grav = 1400;
      this.onGround = false;
      this.stun = 0;                 // hit stun timer
      this.invuln = 0;               // i-frames
      this.flashT = 0;               // white hit flash
      this.dead = false;
      this.deathT = 0;
      this.frozen = false;
      this.anim = new Game.Animator();
      this.sheets = null;            // set by subclass
      this.tag = 'entity';
      this.knockX = 0; this.knockY = 0;
      this.hitstopT = 0;
      this.skinTint = null;          // color to tint sprite (optional)
      this.alpha = 1;
      this.squashX = 1; this.squashY = 1;   // impact squash
      this.contactDmg = 0;
    }

    get feetY() { return this.y; }               // y is feet position
    get centerX() { return this.x; }
    get box() {
      return { x: this.x - this.w, y: this.y - this.h, w: this.w * 2, h: this.h };
    }

    overlaps(other) {
      const a = this.box, b = other.box;
      return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    }

    /* ---- physics ---- */
    applyPhysics(dt, platforms) {
      if (this.frozen) return;
      this.vy += this.grav * dt;
      this.x += (this.vx + this.knockX) * dt;
      this.y += (this.vy + this.knockY) * dt;
      this.knockX = U.damp(this.knockX, 0, 10, dt);
      this.knockY = U.damp(this.knockY, 0, 10, dt);

      this.onGround = false;
      const feet = this.y;
      for (const p of platforms) {
        const prevFeet = feet - (this.vy + this.knockY) * dt;
        if (this.x > p.x && this.x < p.x + p.w && prevFeet <= p.y && this.y >= p.y) {
          this.y = p.y;
          this.vy = 0;
          this.onGround = true;
        }
      }
      // walls
      if (this.x < Game.World.WORLD_W * 0 + 20) { this.x = 20; this.vx = Math.max(0, this.vx); }
      if (this.x > Game.World.WORLD_W - 20) { this.x = Game.World.WORLD_W - 20; this.vx = Math.min(0, this.vx); }
    }

    /* ---- combat reactions ---- */
    takeHit(dmg, dir, kb, opts) {
      if (this.dead || this.invuln > 0) return false;
      opts = opts || {};
      this.hp -= dmg;
      this.stun = opts.stun !== undefined ? opts.stun : 0.28;
      this.knockX = kb * dir;
      this.knockY = opts.launch ? -kb * 0.8 : 0;
      this.flashT = opts.flash !== undefined ? opts.flash : 0.12;
      this.facing = dir > 0 ? 1 : -1;
      if (this.hp <= 0) {
        this.dead = true;
        this.deathT = 0;
        this.stun = 0;
      }
      return true;
    }

    update(dt) {
      // advance frame animation (all entities: player / enemies / boss)
      if (this.anim) this.anim.update(dt);
      if (this.flashT > 0) this.flashT -= dt;
      if (this.invuln > 0) this.invuln -= dt;
      if (this.stun > 0) this.stun -= dt;
      if (this.hitstopT > 0) this.hitstopT -= dt;
      // squash recovery
      this.squashX = U.damp(this.squashX, 1, 12, dt);
      this.squashY = U.damp(this.squashY, 1, 12, dt);
      // note: deathT is advanced by subclass updateDeath() only (no double count)
    }

    draw(ctx) {
      if (this.alpha <= 0) return;
      const flip = this.facing < 0;
      const x = this.x, y = this.y;
      const flash = this.flashT > 0;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(this.squashX, this.squashY);
      ctx.translate(-x, -y);
      if (flash) {
        this.anim.drawFlash(ctx, x, y, { flip, scale: this.scale, alpha: this.alpha, flashColor: '#fff' });
      } else {
        this.anim.draw(ctx, x, y, { flip, scale: this.scale, alpha: this.alpha });
      }
      ctx.restore();
    }
  }

  Game.Entity = Entity;
})();

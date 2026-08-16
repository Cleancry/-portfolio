/* ============================================================
   PENITENT BLADE —game/enemy.js
   enemy AI (wraith / hellhound / fire skull / demon elite)
   + fireball projectiles
   ============================================================ */
'use strict';
(function () {
  const Game = window.Game;
  const U = Game.U;
  const Entity = Game.Entity;

  class Projectile extends Entity {
    constructor(game, x, y, dir, dmg, speed, from) {
      super({ x, y, w: 10, h: 14, scale: 2, hp: 999 });
      this.game = game;
      this.tag = 'projectile';
      this.dir = dir;
      this.dmg = dmg;
      this.vx = dir * speed;
      this.vy = 0;
      this.from = from;
      this.life = 3.2;
      this.dead = false;
      this.hitT = 0;
      this.alive = true;
    }
    update(dt) {
      this.life -= dt;
      if (this.life <= 0) { this.alive = false; return; }
      this.anim.update(dt);
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      Game.Fx.embers(this.x, this.y, 1, '#ff8844');
      // wall / floor collision
      if (this.y > Game.World.FLOOR_Y - 4) {
        // impact splash damage (meteor landing zone)
        const p = this.game.player;
        if (p && p.alive && Math.abs(p.x - this.x) < 42) {
          p.takeHit(this.dmg, Math.sign(p.x - this.x) || 1, 220, { stun: 0.3 });
        }
        this.alive = false; this.burst();
      }
      if (this.x < 20 || this.x > Game.World.WORLD_W - 20) { this.alive = false; this.burst(); }
      // hit player
      if (this.from === 'enemy' && this.game.player && this.game.player.alive) {
        const p = this.game.player;
        const dx = Math.abs(p.x - this.x), dy = Math.abs(p.y - this.h * 0.5 - this.y);
        if (dx < p.w + 12 && dy < p.h * 0.7) {
          p.takeHit(this.dmg, Math.sign(this.vx) || 1, 260, { stun: 0.3 });
          this.alive = false; this.burst();
        }
      }
    }
    burst() {
      Game.Fx.burst(this.x, this.y, { n: 10, color: '#ff8844', speedMin: 40, speedMax: 160, lifeMin: 0.2, lifeMax: 0.5, type: 'ember', grav: -20 });
      Game.Fx.ring(this.x, this.y, '#ffaa55', 6, 0.2, 3);
    }
    draw(ctx) {
      const s = this.game.sheets && this.game.sheets.fireball;
      if (s) {
        this.anim.play(s, 12, true);
        this.anim.draw(ctx, this.x, this.y, { flip: this.dir < 0, scale: this.scale });
      } else {
        ctx.fillStyle = '#ff8844';
        ctx.beginPath(); ctx.arc(this.x, this.y, 8, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  /* orbit fireball: circles the player then impacts (Fire Skull signature) */
  class OrbitProjectile extends Projectile {
    constructor(game, x, y, target, dmg) {
      super(game, x, y, 1, dmg, 0, 'enemy');
      this.target = target;
      this.orbitT = 0;
      this.orbitDur = 0.9;
      this.radius = 95;
      this.alive = true;
    }
    update(dt) {
      this.orbitT += dt;
      if (!this.target || !this.target.alive) { this.alive = false; return; }
      const a = this.orbitT * 4.2;
      this.x = this.target.x + Math.cos(a) * this.radius;
      this.y = this.target.y - 46 + Math.sin(a) * this.radius * 0.55;
      this.anim.update(dt);
      if (Math.random() < dt * 30) Game.Fx.embers(this.x, this.y, 1, '#ff8844');
      if (this.orbitT >= this.orbitDur) {
        this.target.takeHit(this.dmg, Math.sign(this.target.x - this.x) || 1, 240, { stun: 0.25 });
        this.alive = false;
        this.burst();
      }
    }
  }

  /* ============================================================
     Base enemy AI
     ============================================================ */
  class Enemy extends Entity {
    constructor(game, x, y, o) {
      super(Object.assign({ x, y, facing: -1 }, o));
      this.game = game;
      this.tag = 'enemy';
      this.state = 'spawn';
      this.stateT = 0;
      this.thinkT = U.rand(0.1, 0.5);
      this.attackCd = 0;
      this.range = 70;
      this.aggro = o.aggro || 420;   // chase radius (was never assigned → enemies never chased!)
      this.dmg = 8;
      this.big = false;          // elite / boss: execution close-up on death
      this.windupT = 0;
      this.windupDur = 0.35;
      this.atkActive = false;
      this.attackDone = false;
      this.floating = false;     // ignores gravity
      this.contactDmg = 6;
      this.spawnAnimT = 0.4;
      this.alive = true;
      this.burnColor = null;
    }

    update(dt) {
      super.update(dt);
      if (this.dead) {
        this.updateDeath(dt);
        return;
      }
      const p = this.game.player;
      if (!p || !p.alive) { this.state = 'idle'; this.vx = 0; this._applyMovement(dt); return; }

      // timers
      this.attackCd -= dt;
      this.thinkT -= dt;
      const dx = p.x - this.x;
      const dist = Math.abs(dx);
      const dir = U.sign(dx) || 1;

      switch (this.state) {
        case 'spawn':
          this.spawnAnimT -= dt;
          if (this.spawnAnimT <= 0) this.state = 'idle';
          break;

        case 'idle':
        case 'chase':
          if (dist < this.range && this.attackCd <= 0) {
            this.startAttack(dir);
          } else if (dist < this.aggro) {
            this.state = 'chase';
            this.vx = dir * this.speed * U.clamp(dist / 300, 0.4, 1);
            this.facing = dir;
          } else {
            this.state = 'idle';
            this.vx = 0;
          }
          break;

        case 'windup':
          this.vx = 0;
          this.windupT -= dt;
          this.facing = dir;
          if (this.windupT <= 0) this.fireAttack(dir);
          break;

        case 'attack':
          this.facing = dir;   // always face the player while attacking
          this.updateAttack(dt, dir, dist);
          break;

        case 'hurt':
          if (this.stun <= 0) this.state = 'idle';
          break;
      }
      if (this.state !== 'attack' && this.state !== 'windup') {
        this._applyMovement(dt);
      }
      this.updateAnim();
    }

    /* unified movement: floating entities hover & glide, grounded use physics */
    _applyMovement(dt) {
      if (this.floating) {
        this.x += (this.vx + this.knockX) * dt;
        this.vy = Math.sin(this.game.time * 2 + this.y * 0.01) * 24;
        this.y += this.vy * dt;
        this.onGround = false;
      } else {
        this.applyPhysics(dt, this.game.world.platforms);
      }
    }

    startAttack(dir) {
      this.state = 'windup';
      this.windupT = this.windupDur;
      this.facing = dir;
      this.attackCd = U.rand(this.attackCdMax || 1.4, (this.attackCdMax || 1.4) + 0.8);
    }

    fireAttack(dir) {
      this.state = 'attack';
      this.atkActive = true;
      this.attackDone = false;
      this.attackT = 0;
      this.onFire(dir);
    }

    /* override per type */
    onFire(dir) {}
    updateAttack(dt, dir, dist) {}
    updateDeath(dt) {
      this.deathT += dt;
      this.alpha = Math.max(0, 1 - this.deathT / 0.7);
      if (this.deathT > 0.7) this.alive = false;
    }
    updateAnim() {}

    takeHit(dmg, dir, kb, opts) {
      const ok = super.takeHit(dmg, dir, kb, opts);
      if (ok && !this.dead && this.state !== 'dead') {
        this.state = 'hurt';
        this.vx = 0;
        // impact bloom + spark shatter
        const hy = this.y - this.h * 0.5;
        Game.Fx.glow(this.x, hy, 'rgba(255,200,120,0.65)', 40, 0.22, 0.55);
        Game.Fx.sparks(this.x, hy, dir, { n: 10 });
        // real impact sprite effect (green variant)
        const im = this.game.sheets && (this.game.sheets.impactFx2 || this.game.sheets.impactFx);
        if (im && im.frames.length) {
          Game.Fx.spawnSheet(im.img, im.frames, this.x, hy, { scale: 1.0, dur: 0.2 });
        }
        if (this.hp <= 0) {
          this.onDeath();
        }
      } else if (ok && this.dead && this.state !== 'dead') {
        this.onDeath();
      }
      return ok;
    }

    onDeath() {
      this.state = 'dead';
      this.deathT = 0;
      this.alpha = 1;
      // death bloom: soft light burst as the soul is rent
      Game.Fx.glow(this.x, this.y - this.h * 0.5, 'rgba(200,160,120,0.7)', 70, 0.5, 0.6);
      this.game.onEnemyKilled(this);
    }

    draw(ctx) {
      if (this.alpha <= 0) return;
      if (this.state === 'spawn') {
        // fade in
        const a = 1 - this.spawnAnimT / 0.4;
        ctx.save();
        ctx.globalAlpha = a;
      }
      if (this.state === 'windup') {
        // danger telegraph: pulsing red ring under the enemy
        const t = this.game.time;
        const p = 0.5 + 0.5 * Math.sin(t * 14);
        ctx.save();
        ctx.globalAlpha = 0.25 + 0.3 * p;
        ctx.strokeStyle = '#ff2a20';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(this.x, this.y - this.h * 0.4, 26 + 10 * p, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      super.draw(ctx);
      if (this.state === 'spawn') ctx.restore();
      // elite (big) enemies show a small overhead health bar
      if (this.big && this.alive && !this.dead) {
        const bw = 64, bh = 5;
        const bx = this.x - bw / 2, by = this.y - this.h - 18;
        ctx.fillStyle = 'rgba(8,6,4,0.7)';
        ctx.fillRect(bx, by, bw, bh);
        ctx.fillStyle = '#b03020';
        ctx.fillRect(bx, by, bw * U.clamp(this.hp / this.maxHp, 0, 1), bh);
        ctx.strokeStyle = 'rgba(140,80,50,0.5)';
        ctx.strokeRect(bx, by, bw, bh);
      }
    }
  }

  /* ============================================================
     Wraith —floating ghost, slow, melee lunge
     ============================================================ */
  class Wraith extends Enemy {
    constructor(game, x, y) {
      super(game, x, y, { w: 20, h: 70, scale: 2, hp: 34, speed: 110, dmg: 9, range: 64, aggro: 680, floating: true, contactDmg: 4 });
      this.attackCdMax = 1.6;
    }
    onFire(dir) {
      // lunge forward with a shriek
      this.vx = dir * 330;
      this.attackDur = 0.45;
      Game.Audio.play('dash');
      this.attackT = 0;
      // signature: sometimes summons a spectral ally (capped horde)
      const p = this.game.player;
      const wraiths = this.game.enemies.filter(e => e instanceof Wraith && e.alive).length;
      if (p && wraiths < 6 && Math.random() < 0.35) {
        const nx = U.clamp(p.x + (Math.random() > 0.5 ? 1 : -1) * 240, 60, Game.World.WORLD_W - 60);
        const w = new Wraith(this.game, nx, Game.World.FLOOR_Y - 4);
        this.game.enemies.push(w);
        Game.Fx.ghost(nx, Game.World.FLOOR_Y - 50, '#9aa8b8', 10);
        Game.Fx.ring(nx, Game.World.FLOOR_Y - 6, '#7a8a9a', 12, 0.35, 3);
      }
    }
    updateAttack(dt, dir, dist) {
      this.attackT += dt;
      if (this.attackT >= 0.35) this.atkActive = false;
      if (this.attackT >= this.attackDur) { this.vx = 0; this.state = 'idle'; }
      this.x += this.vx * dt;
    }
    updateAnim() {
      const s = this.game.sheets;
      if (!s) return;
      if (this.state === 'windup') this.anim.play(s.wraithShriek, 10, false);
      else if (this.state === 'attack') this.anim.play(s.wraithShriek, 12, false);
      else if (this.dead) this.anim.play(s.wraithVanish, 10, false);
      else this.anim.play(s.wraithIdle, 6, true);
    }
    updateDeath(dt) {
      super.updateDeath(dt);
      if (Math.random() < dt * 40) Game.Fx.ghost(this.x, this.y - 30, '#9aa8b8', 2);
    }
    draw(ctx) {
      ctx.save();
      ctx.globalAlpha = this.alpha * (this.state === 'spawn' ? 1 - this.spawnAnimT / 0.4 : 1);
      super.draw(ctx);
      ctx.restore();
      if (Game.DEBUG) { const b = this.box; ctx.strokeStyle = 'rgba(255,0,0,.5)'; ctx.strokeRect(b.x, b.y, b.w, b.h); }
    }
  }

  /* ============================================================
     Hellhound —fast charging beast
     ============================================================ */
  class Hellhound extends Enemy {
    constructor(game, x, y) {
      super(game, x, y, { w: 26, h: 40, scale: 2.6, hp: 48, speed: 300, dmg: 11, range: 150, aggro: 700, contactDmg: 4 });
      this.attackCdMax = 1.8;
      this.charging = false;
    }
    onFire(dir) {
      // charge: long windup then fast dash
      this.charging = true;
      this.vx = dir * 620;
      this.attackDur = 0.6;
      this.attackT = 0;
      Game.Audio.play('dash');
    }
    updateAttack(dt, dir, dist) {
      this.attackT += dt;
      if (this.attackT < 0.4) {
        // charge skill: damages while actively charging (not on touch alone)
        this.atkActive = true;
        if (this.game.player && Math.abs(this.game.player.x - this.x) < 50 && Math.abs(this.game.player.y - 20 - this.y) < 60) {
          const p = this.game.player;
          p.takeHit(this.dmg, this.facing, 380, { stun: 0.4 });
          this.atkActive = false;
          this.vx *= -0.4;
        }
      } else {
        this.vx *= 0.85;
        this.atkActive = false;
      }
      if (this.attackT >= this.attackDur) { this.vx = 0; this.state = 'idle'; this.charging = false; }
      // dust trail
      if (this.charging && Math.random() < dt * 30) Game.Fx.ghost(this.x - this.facing * 16, this.y - 6, '#4a4038', 1);
      this.x += this.vx * dt;
    }
    updateAnim() {
      const s = this.game.sheets;
      if (!s) return;
      if (this.state === 'windup') this.anim.play(s.houndIdle, 5, true);
      else if (this.dead) this.anim.play(s.houndIdle, 4, false);
      else this.anim.play(s.houndRun, 14, true);
    }
    updateDeath(dt) {
      super.updateDeath(dt);
      if (Math.random() < dt * 60) Game.Fx.blood(this.x, this.y - 10, U.rand(0, 1) > 0.5 ? 1 : -1, { n: 2, speed: 120 });
    }
    draw(ctx) {
      super.draw(ctx);
      if (this.charging) {
        ctx.save();
        ctx.globalAlpha = 0.5;
        const g = ctx.createRadialGradient(this.x, this.y - 20, 4, this.x, this.y - 20, 60);
        g.addColorStop(0, 'rgba(255,120,40,0.8)'); g.addColorStop(1, 'rgba(255,80,20,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(this.x, this.y - 20, 60, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
    }
  }

  /* ============================================================
     Fire Skull —floating ranged attacker
     ============================================================ */
  class FireSkull extends Enemy {
    constructor(game, x, y) {
      super(game, x, y, { w: 22, h: 60, scale: 1.5, hp: 60, speed: 90, dmg: 0, range: 320, aggro: 700, floating: true, contactDmg: 4 });
      this.attackCdMax = 2.6;
      this.windupDur = 0.5;
    }
    onFire(dir) {
      const p = this.game.player;
      if (!p) return;
      // signature attack: twin orbit fireballs that circle the player
      for (let i = 0; i < 2; i++) {
        const orb = new OrbitProjectile(this.game, this.x, this.y - 34, p, 10);
        orb.orbitT = i * 0.55;   // staggered phases
        this.game.projectiles.push(orb);
      }
      Game.Audio.play('dash');
      Game.Fx.ring(this.x, this.y - 34, '#ffaa55', 10, 0.3, 3);
      this.state = 'idle';
    }
    updateAnim() {
      const s = this.game.sheets;
      if (!s) return;
      if (this.state === 'windup') this.anim.play(s.skullFire, 6, true);
      else if (this.dead) this.anim.play(s.skullFire, 5, false);
      else this.anim.play(s.skullFire, 4, true);
    }
    updateDeath(dt) {
      super.updateDeath(dt);
      if (Math.random() < dt * 50) Game.Fx.embers(this.x, this.y - 30, 2, '#ff8844');
    }
  }

  /* ============================================================
     Demon —big melee elite (execution close-up on death)
     ============================================================ */
  class Demon extends Enemy {
    constructor(game, x, y) {
      super(game, x, y, { w: 34, h: 130, scale: 1.5, hp: 150, speed: 85, dmg: 16, range: 120, aggro: 700, big: true, contactDmg: 7 });
      this.attackCdMax = 2.2;
      this.windupDur = 0.5;
      this.swung = false;
    }
    onFire(dir) {
      this.vx = dir * 180;
      this.attackT = 0;
      this.swung = false;
      this.attackDur = 0.7;
      Game.Audio.play('heavySwing');
      Game.Fx.ring(this.x + dir * 30, this.y - this.h * 0.5, '#ff5540', 10, 0.3, 4);
    }
    updateAttack(dt, dir, dist) {
      this.attackT += dt;
      if (this.attackT > 0.3 && !this.swung) {
        this.swung = true;
        this.atkActive = true;
        const hitBox = { x: this.facing > 0 ? this.x + 20 : this.x - 110, y: this.y - 110, w: 110, h: 110 };
        const p = this.game.player;
        if (p && p.alive) {
          const b = p.box;
          if (hitBox.x < b.x + b.w && hitBox.x + hitBox.w > b.x && hitBox.y < b.y + b.h && hitBox.y + hitBox.h > b.y) {
            p.takeHit(this.dmg, this.facing, 420, { stun: 0.45 });
          }
        }
        Game.Fx.slashArc(this.x + dir * 40, this.y - 80, this.facing > 0 ? -0.9 : 0.9 + Math.PI, '#ff5540', 1.8, 1.7, 0.22);
        Game.CamShake(6, 0.2);
      }
      if (this.attackT > 0.35) this.atkActive = false;
      if (this.attackT >= this.attackDur) { this.vx = 0; this.state = 'idle'; }
      this.x += this.vx * dt;
    }
    updateAnim() {
      const s = this.game.sheets;
      if (!s) return;
      if (this.state === 'windup') this.anim.play(s.demonIdle, 5, true);
      else if (this.state === 'attack') this.anim.play(s.demonAttack, 9, false);
      else if (this.dead) this.anim.play(s.demonIdle, 4, false);
      else this.anim.play(s.demonIdle, 5, true);
    }
    updateDeath(dt) {
      // slower dissolve for elite
      this.deathT += dt;
      this.alpha = Math.max(0, 1 - this.deathT / 1.4);
      if (Math.random() < dt * 40) Game.Fx.blood(this.x, this.y - 60, U.rand(0, 1) > 0.5 ? 1 : -1, { n: 3, speed: 200 });
      if (this.deathT > 1.4) this.alive = false;
    }
  }

  /* ============================================================
     Angel — floating church guardian, holy bolts + dive
     ============================================================ */
  class Angel extends Enemy {
    constructor(game, x, y) {
      super(game, x, y, { w: 26, h: 120, scale: 1.2, hp: 72, speed: 140, dmg: 12, range: 300, aggro: 720, floating: true, contactDmg: 5 });
      this.attackCdMax = 2.3;
      this.windupDur = 0.45;
    }
    onFire(dir) {
      const p = this.game.player;
      if (!p) return;
      // aimed holy bolt
      const a = Math.atan2((p.y - p.h * 0.5) - (this.y - 60), p.x - this.x);
      const pr = new Projectile(this.game, this.x, this.y - 60, Math.cos(a) > 0 ? 1 : -1, 10, 300, 'enemy');
      pr.vx = Math.cos(a) * 300; pr.vy = Math.sin(a) * 300;
      this.game.projectiles.push(pr);
      Game.Fx.ring(this.x, this.y - 60, '#ffe9c0', 12, 0.3, 3);
      Game.Audio.play('dash');
      this.state = 'idle';
    }
    updateAnim() {
      const s = this.game.sheets;
      if (!s) return;
      if (this.state === 'windup') this.anim.play(s.angel, 8, false);
      else if (this.dead) this.anim.play(s.angel, 6, false);
      else this.anim.play(s.angel, 5, true);
    }
    updateDeath(dt) {
      super.updateDeath(dt);
      if (Math.random() < dt * 40) Game.Fx.ghost(this.x, this.y - 40, '#ffe9c0', 2);
    }
  }

  /* ============================================================
     Ghoul — burning corpse, fast pouncing melee
     ============================================================ */
  class Ghoul extends Enemy {
    constructor(game, x, y) {
      super(game, x, y, { w: 18, h: 50, scale: 3, hp: 55, speed: 260, dmg: 10, range: 130, aggro: 700, contactDmg: 6 });
      this.attackCdMax = 1.4;
      this.windupDur = 0.3;
      this.bursting = false;
    }
    onFire(dir) {
      this.vx = dir * 480;
      this.attackDur = 0.5;
      this.attackT = 0;
      this.bursting = true;
      Game.Audio.play('dash');
    }
    updateAttack(dt, dir, dist) {
      this.attackT += dt;
      if (this.attackT < 0.35) {
        // pounce skill: damages only during the lunge (not on touch alone)
        this.atkActive = true;
        const p = this.game.player;
        if (p && Math.abs(p.x - this.x) < 44 && Math.abs(p.y - 20 - this.y) < 50) {
          p.takeHit(this.dmg, this.facing, 320, { stun: 0.3 });
          this.atkActive = false;
        }
      } else { this.atkActive = false; }
      if (this.attackT >= this.attackDur) { this.vx = 0; this.state = 'idle'; this.bursting = false; }
      // ember trail while pouncing
      if (this.bursting && Math.random() < dt * 30) Game.Fx.embers(this.x - this.facing * 14, this.y - 12, 1, '#ff8844');
      this.x += this.vx * dt;
    }
    updateAnim() {
      const s = this.game.sheets;
      if (!s) return;
      if (this.dead) this.anim.play(s.ghoul, 5, false);
      else this.anim.play(s.ghoul, 11, true);
    }
    updateDeath(dt) {
      super.updateDeath(dt);
      if (Math.random() < dt * 50) Game.Fx.embers(this.x, this.y - 14, 2, '#ff8844');
    }
  }

  Game.Enemy = { Enemy, Wraith, Hellhound, FireSkull, Demon, Angel, Ghoul, Projectile, OrbitProjectile };
})();



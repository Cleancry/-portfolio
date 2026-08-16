/* ============================================================
   PENITENT BLADE —game/boss.js
   HELL BEAST —multi-phase boss fight with cinematic finisher
   ============================================================ */
'use strict';
(function () {
  const Game = window.Game;
  const U = Game.U;
  const Entity = Game.Entity;

  class HellBeast extends Entity {
    constructor(game, x, y) {
      super({ x, y, w: 56, h: 210, scale: 4.6, hp: 680, speed: 90 });
      this.game = game;
      this.tag = 'boss';
      this.alive = true;
      this.state = 'intro';       // intro 鈫?idle 鈫?windup 鈫?attack 鈫?recover 鈫?hurt(stagger) 鈫?dead
      this.stateT = 0;
      this.attackCd = 2.2;
      this.pattern = 0;           // which attack next
      this.facing = -1;
      this.phase2 = false;
      this.stagger = 0;           // stagger meter
      this.staggerMax = 34;
      this.staggering = false;
      this.burnColor = null;
      this.flashT = 0;
      this.introDone = false;
      this.deathT = 0;
      this.dead = false;
      this.breathActive = false;
      this.chargeActive = false;
      this.entering = false;   // drop-in entrance (crash landing)
    }

    update(dt) {
      super.update(dt);
      if (this.dead) { this.updateDeath(dt); return; }

      const p = this.game.player;
      const dir = p && p.alive ? (U.sign(p.x - this.x) || this.facing) : this.facing;

      // entrance: plummet from the sky, crash into the floor
      if (this.entering) {
        this.vy += 2600 * dt;
        this.y += this.vy * dt;
        if (this.y >= Game.World.FLOOR_Y) {
          this.entering = false;
          this.y = Game.World.FLOOR_Y;
          this.vy = 0;
          // crash impact: debris + shock + slow-mo + camera slam
          Game.Fx.setSlowmo(0.35, 0.6);
          Game.Fx.flash('#ff4422', 0.4, 0.35);
          Game.CamShake(18, 0.8);
          Game.Fx.ring(this.x, this.y - 10, '#ff8855', 40, 0.5, 10);
          Game.Fx.burst(this.x, this.y - 20, { n: 22, color: '#5a4a3a', speedMin: 120, speedMax: 420, lifeMin: 0.3, lifeMax: 0.8, type: 'blood' });
          Game.Fx.burst(this.x, this.y - 20, { n: 18, color: '#ff8844', speedMin: 60, speedMax: 300, lifeMin: 0.3, lifeMax: 0.7, type: 'ember', grav: 240 });
          Game.Audio.play('bossRoar');
          this.state = 'idle';
          this.stateT = 0;
        }
        this.updateAnim();
        return;
      }

      // phase 2 at half hp: METAMORPHOSIS —form change with a cinematic
      if (!this.phase2 && this.hp <= this.maxHp * 0.5) {
        this.phase2 = true;
        this.transformT = 0;
        // FULL-SCREEN TRANSFORM CINEMA: freeze the fight, close-up on the head,
        // erupt into fire, then resume
        if (this.game.player) {
          this.game.frozen = true;
          this.game.transformCinema = this;
          this.game.transformT = 0;
          this.game.transformPhase = 0;
        }
        if (this.game.player) this.game.execT = { target: this, player: this.game.player, t: 0, dur: 1.1, done: false, boss: true };
        this.game.announce('它苏醒了……', '巨兽燃起怒火', 1.4, 'boss');
        if (this.game.world) this.game.world.setBloodMode(true);
        Game.Fx.flash('#ff3300', 0.45, 0.5);
        Game.Fx.setSlowmo(0.3, 1.0);
        Game.CamShake(14, 0.8);
        Game.CamZoom(1.5, 0.3);
        Game.Audio.play('bossRoar');
        // eruption of embers at the transform point
        for (let i = 0; i < 3; i++) {
          Game.Fx.burst(this.x + U.rand(-70, 70), this.y - U.rand(0, 170), {
            n: 18, color: U.pick(['#ff5533', '#ff8844', '#8e0f0f']),
            speedMin: 80, speedMax: 340, lifeMin: 0.4, lifeMax: 1.2, type: 'ember', grav: 160,
          });
        }
        Game.Fx.ring(this.x, this.y - this.h * 0.5, '#ff4433', 30, 0.5, 8);
        this.stagger = 0;
      }
      switch (this.state) {
        case 'intro': {
          this.stateT += dt;
          this.facing = dir;
          if (this.stateT > 1.2) { this.state = 'idle'; this.stateT = 0; }
          break;
        }
        case 'idle': {
          this.attackCd -= dt;
          this.facing = dir;
          // menacing advance: the beast slowly closes in
          this.vx = dir * this.speed * (this.phase2 ? 0.8 : 0.55);
          if (this.attackCd <= 0) {
            this.pickAttack(dir);
          }
          break;
        }
        case 'windup': {
          this.stateT += dt;
          this.facing = dir;
          if (this.stateT >= this.windupDur) {
            this.fireAttack(dir);
          }
          break;
        }
        case 'attack': {
          this.updateAttack(dt, dir);
          break;
        }
        case 'recover': {
          this.stateT += dt;
          if (this.stateT >= 0.3) {
            this.state = 'idle';
            this.attackCd = this.phase2 ? 0.8 : 1.0;
          }
          break;
        }
        case 'stagger': {
          this.stateT += dt;
          this.vx = 0;
          if (this.stateT >= 1.0) { this.state = 'idle'; this.attackCd = 1.0; }
          break;
        }
      }
      this.applyPhysics(dt, this.game.world.platforms);
      this.updateAnim();
    }

    pickAttack(dir) {
      const count = this.phase2 ? 10 : 8;
      // shuffled deck: every move appears exactly once per round, in
      // random order — balanced frequency, unpredictable rhythm
      if (!this._atkDeck || this._atkDeck.length === 0 || this._atkCount !== count) {
        this._atkCount = count;
        this._atkDeck = [];
        for (let i = 0; i < count; i++) this._atkDeck.push(i);
        for (let i = count - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          const t = this._atkDeck[i]; this._atkDeck[i] = this._atkDeck[j]; this._atkDeck[j] = t;
        }
      }
      const pattern = this._atkDeck.pop();
      if (pattern === 0) this.setWindup('melee', this.phase2 ? 0.4 : 0.5);
      else if (pattern === 1) this.setWindup('breath', this.phase2 ? 0.55 : 0.7);
      else if (pattern === 2) this.setWindup('charge', this.phase2 ? 0.6 : 0.85);
      else if (pattern === 3) this.setWindup('fireballs', 0.5);
      else if (pattern === 4) this.setWindup('leap', 0.55);
      else if (pattern === 5) this.setWindup('tailswipe', 0.5);
      else if (pattern === 6) this.setWindup('roar', 0.55);
      else if (pattern === 7) this.setWindup('firestorm', 0.55);
      else if (pattern === 8) this.setWindup('summon', 0.7);
      else this.setWindup('flameburst', 0.8);
    }

    setWindup(type, dur) {
      this.state = 'windup';
      this.windupType = type;
      this.windupDur = dur;
      this.stateT = 0;
      if (type === 'charge') {
        Game.Fx.ring(this.x, this.y - this.h * 0.5, '#ff8844', 20, 0.4, 5);
      } else if (type === 'melee') {
        // claw raise telegraph
        Game.Fx.ring(this.x, this.y - this.h * 0.6, '#ffdda0', 18, 0.35, 4);
        Game.Fx.sparks(this.x + this.facing * 40, this.y - this.h * 0.6, this.facing, { n: 6 });
      } else if (type === 'summon') {
        // summoning circle glow
        Game.Fx.ring(this.x, this.y - 10, '#c8a0ff', 40, 0.6, 6);
        Game.Audio.play('ultimate');
      } else if (type === 'flameburst') {
        // eruption telegraphs at player's feet
        Game.Fx.ring(this.game.player ? this.game.player.x : this.x, Game.World.FLOOR_Y - 6, '#ff5533', 26, 0.6, 6);
        Game.Audio.play('bossRoar');
      } else if (type === 'leap') {
        // crouch telegraph under the beast
        Game.Fx.ring(this.x, this.y - 10, '#ff8844', 28, 0.45, 5);
        Game.CamShake(3, 0.15);
      } else if (type === 'tailswipe') {
        // tail glow gathering behind
        Game.Fx.ring(this.x - this.facing * 60, this.y - 60, '#ffdda0', 22, 0.4, 4);
      } else if (type === 'roar') {
        // full-arena warning ring at the player's feet
        const px = this.game.player ? this.game.player.x : this.x;
        Game.Fx.ring(px, Game.World.FLOOR_Y - 6, '#ffdda0', 30, 0.6, 6);
        Game.Audio.play('bossRoar');
      } else if (type === 'firestorm') {
        // circle of eruption telegraphs around the beast
        for (const sx of [-200, -120, -40, 40, 120, 200]) {
          Game.Fx.ring(this.x + sx, Game.World.FLOOR_Y - 6, '#ff5533', 20, 0.55, 5);
        }
        Game.Audio.play('bossRoar');
      }
      Game.Audio.play('heavySwing');
    }

    fireAttack(dir) {
      this.state = 'attack';
      this.stateT = 0;
      this.facing = dir;
      this.attackType = this.windupType;
      if (this.attackType === 'melee') {
        this.meleeSwung = false;
        this.meleeSwingType = ((this.meleeSwingType || 0) + 1) % 3;  // cycle 3 swipe variants
        this.meleeT = 0;
        Game.Audio.play('heavySwing');
      } else if (this.attackType === 'breath') {
        this.breathActive = true;
        this.breathT = 0;
        Game.Audio.play('bossRoar');
        Game.CamShake(5, 0.3);
      } else if (this.attackType === 'charge') {
        this.chargeActive = true;
        this.chargeT = 0;
        this.vx = dir * (this.phase2 ? 560 : 440);
        Game.Audio.play('dash');
      } else if (this.attackType === 'summon') {
        // summon minions around the arena
        const types = ['ghoul', 'ghoul', 'wraith'];
        const spots = [this.x + 240, this.x - 240, this.x + 360];
        for (let i = 0; i < types.length; i++) {
          const nx = U.clamp(spots[i], 60, Game.World.WORLD_W - 60);
          let e = null;
          if (types[i] === 'ghoul') e = new Game.Enemy.Ghoul(this.game, nx, Game.World.FLOOR_Y);
          else e = new Game.Enemy.Wraith(this.game, nx, Game.World.FLOOR_Y - 4);
          this.game.enemies.push(e);
          Game.Fx.ring(nx, Game.World.FLOOR_Y - 8, '#c8a0ff', 20, 0.5, 4);
          Game.Fx.ghost(nx, Game.World.FLOOR_Y - 50, '#c8b8d8', 8);
        }
        Game.Fx.setSlowmo(0.6, 0.3);
        this.state = 'recover';
        this.stateT = 0;
      } else if (this.attackType === 'flameburst') {
        // burst of fire pillars under the player, repeated
        this.burstCount = 3;
        this.burstTimer = 0;
        this.burstSpots = [];
        for (let i = 0; i < 3; i++) {
          this.burstSpots.push(this.game.player ? this.game.player.x + U.rand(-80, 80) : this.x);
        }
        Game.Audio.play('bossRoar');
        Game.CamShake(6, 0.2);
      } else if (this.attackType === 'leap') {
        // LEAP SLAM: arc up then dive onto the player's position
        this.leapT = 0;
        this.leaped = false;
        this.leapFromY = this.y;
        this.leapDir = dir;
        this.leapTargetX = this.game.player ? this.game.player.x : this.x + dir * 220;
        Game.Audio.play('dash');
        Game.CamShake(4, 0.2);
      } else if (this.attackType === 'tailswipe') {
        // TAIL SWIPE: wide sweep behind the beast
        this.tailT = 0;
        this.tailSwung = false;
        Game.Audio.play('heavySwing');
      } else if (this.attackType === 'roar') {
        // ROAR: arena-wide shockwave after a charge-up
        this.roarT = 0;
        this.roared = false;
        Game.Audio.play('bossRoar');
      } else if (this.attackType === 'firestorm') {
        // FIRESTORM: ring of fire pillars around the beast
        this.stormT = 0;
        this.stormDone = false;
        Game.Audio.play('bossRoar');
      } else {
        this.ballCount = this.phase2 ? 4 : 3;
        this.ballTimer = 0;
      }
    }

    updateAttack(dt, dir) {
      this.stateT += dt;
      const p = this.game.player;
      if (this.attackType === 'breath') {
        this.breathT += dt;
        // flame cone
        const flameDur = this.phase2 ? 1.6 : 1.2;
        if (this.breathT < flameDur) {
          if (p && p.alive) {
            const px = p.x, py = p.y - p.h * 0.5;
            const bx = this.x + this.facing * 60, by = this.y - 90;
            const dist = U.dist(px, py, bx, by);
            if (dist < (this.phase2 ? 360 : 300)) {
              // cone check: angle roughly toward facing
              const ang = Math.atan2(py - by, px - bx);
              const fAng = this.facing > 0 ? 0 : Math.PI;
              let dAng = Math.abs(ang - fAng);
              if (dAng > Math.PI) dAng = Math.PI * 2 - dAng;
              if (dAng < 0.7) {
                p.takeHit(12, this.facing, 120, { stun: 0.12, flash: 0.06 });
              }
            }
          }
          // flame particles
          if (Math.random() < dt * 60) {
            Game.Fx.spawn({
              x: this.x + this.facing * U.rand(20, 120), y: this.y - U.rand(60, 110),
              vx: this.facing * U.rand(40, 160), vy: U.rand(-60, 30),
              life: U.rand(0.2, 0.5), size: U.rand(4, 10),
              color: U.pick(['#ff8844', '#ffaa55', '#ff5533', '#ffe0a0']),
              type: 'ember', grav: -60, alpha: 0.9,
            });
          }
          Game.CamShake(2, 0.02);
        } else {
          this.breathActive = false;
          this.state = 'recover'; this.stateT = 0;
        }
      } else if (this.attackType === 'charge') {
        this.chargeT += dt;
        this.vx *= (1 - dt * 2.2);
        // charge skill: damages only while actively charging (not on touch alone)
        if (p && p.alive && this.chargeT > 0.15 && this.chargeT < 0.75) {
          if (Math.abs(p.x - this.x) < 70 && p.y - p.h > this.y - 160) {
            p.takeHit(18, this.facing, 620, { stun: 0.5 });
            this.vx *= -0.6;
          }
        }
        if (this.chargeT > 0.75) this.chargeActive = false;
        if (Math.random() < dt * 30) Game.Fx.ghost(this.x - this.facing * 30, this.y - 20, '#6a4a2a', 2);
        if (this.chargeT >= 1.0) { this.vx = 0; this.state = 'recover'; this.stateT = 0; }
      } else if (this.attackType === 'melee') {
        // CLAW SWIPE —the boss's basic attack
        this.meleeT += dt;
        if (!this.meleeSwung && this.meleeT > 0.18) {
          this.meleeSwung = true;
          // swipe hitbox in front
          const hx = this.facing > 0 ? this.x + 40 : this.x - 150;
          const hitBox = { x: hx, y: this.y - 150, w: 150, h: 140 };
          if (p && p.alive) {
            const b = p.box;
            if (hitBox.x < b.x + b.w && hitBox.x + hitBox.w > b.x && hitBox.y < b.y + b.h && hitBox.y + hitBox.h > b.y) {
              p.takeHit(16, this.facing, 420, { stun: 0.4 });
            }
          }
          // claw slash visual — variant slashes
          const st = this.meleeSwingType || 0;
          const bx2 = this.x + this.facing * 60, by2 = this.y - 100;
          if (st === 0) {            // horizontal sweep
            Game.Fx.slashArc(bx2, by2, this.facing > 0 ? -0.7 : 0.7 + Math.PI, '#ffdda0', 1.8, 2.0, 0.2);
            Game.Fx.slashArc(bx2, by2 - 34, this.facing > 0 ? -0.6 : 0.6 + Math.PI, '#ffb860', 1.4, 1.5, 0.16);
          } else if (st === 1) {    // rising uppercut
            Game.Fx.slashArc(bx2, by2, this.facing > 0 ? -1.5 : 1.5 + Math.PI, '#ffe9b0', 1.8, 1.6, 0.2);
            Game.Fx.slashArc(bx2, by2 - 60, this.facing > 0 ? -1.7 : 1.7 + Math.PI, '#ffdda0', 1.5, 1.2, 0.16);
          } else {                  // double claw (two quick strikes)
            Game.Fx.slashArc(bx2, by2, this.facing > 0 ? -0.5 : 0.5 + Math.PI, '#ffc070', 1.5, 1.3, 0.12);
            Game.Fx.slashArc(bx2, by2 - 46, this.facing > 0 ? -1.0 : 1.0 + Math.PI, '#ffdda0', 1.5, 1.3, 0.12);
            Game.Fx.slashArc(bx2, by2 - 92, this.facing > 0 ? -1.4 : 1.4 + Math.PI, '#ffb860', 1.3, 1.2, 0.1);
          }
          Game.CamShake(7, 0.22);
          Game.Audio.play('heavyHit');
        }
        if (this.meleeT >= 0.7) { this.state = 'recover'; this.stateT = 0; }
      } else if (this.attackType === 'flameburst') {
        // fire pillars erupting under the player (a SKILL, not constant)
        this.burstTimer += dt;
        if (this.burstCount > 0 && this.burstTimer > 0.42) {
          this.burstTimer = 0;
          this.burstCount--;
          const bx = this.burstSpots[this.burstCount];
          // eruption pillar
          Game.Fx.spawn({
            x: bx, y: Game.World.FLOOR_Y - 4,
            vx: 0, vy: -340, life: 0.6, size: 26,
            color: '#ff8830', type: 'ember', alpha: 0.9,
          });
          Game.Fx.ring(bx, Game.World.FLOOR_Y - 8, '#ff5533', 30, 0.4, 8);
          Game.Fx.burst(bx, Game.World.FLOOR_Y - 20, { n: 14, color: '#ff8844', speedMin: 60, speedMax: 300, lifeMin: 0.3, lifeMax: 0.7, type: 'ember', grav: 200 });
          Game.CamShake(8, 0.25);
          // damage in the eruption zone
          if (p && p.alive && Math.abs(p.x - bx) < 50 && p.y > this.y - 60) {
            p.takeHit(14, Math.sign(p.x - bx) || 1, 260, { stun: 0.3 });
          }
          Game.Audio.play('heavyHit');
        }
        if (this.burstCount <= 0 && this.burstTimer > 0.3) {
          this.state = 'recover'; this.stateT = 0;
        }
      } else if (this.attackType === 'leap') {
        // LEAP SLAM: arc up, dive onto the target, ground impact
        this.leapT += dt;
        const dur = 0.5;
        const t = Math.min(1, this.leapT / dur);
        const baseY = this.leapFromY !== undefined ? this.leapFromY : Game.World.FLOOR_Y;
        const tx = this.leapTargetX !== undefined ? this.leapTargetX : this.x + this.leapDir * 220;
        if (Math.abs(tx - this.x) > 14 && this.leapDir !== 0) {
          this.x += this.leapDir * 560 * dt;
        } else {
          this.leapDir = 0;
        }
        // parabolic arc
        this.y = baseY - Math.sin(t * Math.PI) * 96;
        if (t >= 1 && !this.leaped) {
          this.leaped = true;
          this.y = Game.World.FLOOR_Y;
          // impact: damage + shake + debris
          if (p && p.alive && Math.abs(p.x - this.x) < 150) {
            p.takeHit(this.phase2 ? 16 : 14, Math.sign(p.x - this.x) || 1, 420, { stun: 0.4 });
          }
          Game.CamShake(16, 0.5);
          Game.Fx.burst(this.x, this.y - 10, { n: 24, color: '#ff8844', speedMin: 80, speedMax: 340, lifeMin: 0.3, lifeMax: 0.8, type: 'ember', grav: 300 });
          Game.Fx.ring(this.x, this.y - 6, '#ff8844', 34, 0.5, 8);
          Game.Audio.play('leapSlam');
        }
        if (this.leapT >= dur + 0.35) { this.state = 'recover'; this.stateT = 0; }
      } else if (this.attackType === 'tailswipe') {
        // TAIL SWIPE: wide sweep behind the beast, strong knockback
        this.tailT += dt;
        if (!this.tailSwung && this.tailT > 0.14) {
          this.tailSwung = true;
          // hitbox behind the beast
          const hx = this.facing > 0 ? this.x - 180 : this.x - 40;
          const hitBox = { x: hx, y: this.y - 140, w: 180, h: 140 };
          if (p && p.alive) {
            const b = p.box;
            if (hitBox.x < b.x + b.w && hitBox.x + hitBox.w > b.x && hitBox.y < b.y + b.h && hitBox.y + hitBox.h > b.y) {
              p.takeHit(12, -this.facing, 500, { stun: 0.45 });
            }
          }
          Game.Fx.slashArc(this.x - this.facing * 40, this.y - 80, this.facing > 0 ? Math.PI * 0.9 : Math.PI * 0.1, '#ff8844', 1.8, 1.6, 0.22);
          Game.CamShake(9, 0.3);
          Game.Audio.play('tailSwipe');
        }
        if (this.tailT >= 0.6) { this.state = 'recover'; this.stateT = 0; }
      } else if (this.attackType === 'roar') {
        // ROAR: charge up, then an arena-wide shockwave (knockback + small dmg)
        this.roarT += dt;
        if (!this.roared && this.roarT > 0.45) {
          this.roared = true;
          if (p && p.alive) {
            p.takeHit(10, Math.sign(p.x - this.x) || 1, 380, { stun: 0.5 });
          }
          Game.CamShake(12, 0.5);
          for (let i = 0; i < 3; i++) {
            Game.Fx.ring(this.x, this.y - this.h * 0.4, '#ff8844', 40 + i * 46, 0.5, 10 - i * 2);
          }
          Game.Fx.flash('#ff5522', 0.25, 0.2);
          Game.Audio.play('shockwave');
        }
        if (this.roarT >= 0.8) { this.state = 'recover'; this.stateT = 0; }
      } else if (this.attackType === 'firestorm') {
        // FIRESTORM: a ring of fire pillars erupts around the beast
        this.stormT += dt;
        if (!this.stormDone && this.stormT > 0.4) {
          this.stormDone = true;
          for (const sx of [-200, -120, -40, 40, 120, 200]) {
            const bx = this.x + sx;
            Game.Fx.spawn({ x: bx, y: Game.World.FLOOR_Y - 4, vx: 0, vy: -360, life: 0.6, size: 24, color: '#ff8830', type: 'ember', alpha: 0.9 });
            Game.Fx.ring(bx, Game.World.FLOOR_Y - 8, '#ff5533', 28, 0.4, 8);
            Game.Fx.burst(bx, Game.World.FLOOR_Y - 20, { n: 10, color: '#ff8844', speedMin: 60, speedMax: 260, lifeMin: 0.3, lifeMax: 0.6, type: 'ember', grav: 220 });
            // real fireball spell sprite on each pillar
            const fb = this.game.sheets && this.game.sheets.fireballSpell;
            if (fb && fb.frames.length) {
              Game.Fx.spawnSheet(fb.img, fb.frames, bx, Game.World.FLOOR_Y - 30, { scale: 1.3, dur: 0.4, alpha: 0.85 });
            }
            if (p && p.alive && Math.abs(p.x - bx) < 55 && p.y > this.y - 60) {
              p.takeHit(12, Math.sign(p.x - bx) || 1, 300, { stun: 0.35 });
            }
          }
          Game.CamShake(10, 0.4);
          Game.Audio.play('fireErupt');
        }
        if (this.stormT >= 0.9) { this.state = 'recover'; this.stateT = 0; }
      } else {
        // fireballs volley 鈫?phase 2 becomes a METEOR RAIN from the sky
        this.ballTimer += dt;
        if (this.ballCount > 0 && this.ballTimer > (this.phase2 ? 0.32 : 0.22)) {
          this.ballTimer = 0;
          this.ballCount--;
          const p = this.game.player;
          if (p && this.phase2) {
            // meteor: plummets onto the player's area with a telegraph ring
            const tx = p.x + U.rand(-170, 170);
            const pr = new Game.Enemy.Projectile(this.game, tx, p.y - 620, 0, 14, 0, 'enemy');
            pr.vy = 950; pr.vx = 0;
            this.game.projectiles.push(pr);
            Game.Fx.ring(tx, Game.World.FLOOR_Y - 6, '#ff8844', 18, 0.55, 4);
          } else if (p) {
            const pr = new Game.Enemy.Projectile(this.game, this.x, this.y - 110, this.facing, 12, 300, 'enemy');
            const spread = (this.ballCount - 1) * 0.28;
            pr.vy = -U.rand(30, 120) + spread * 60;
            this.game.projectiles.push(pr);
          }
          Game.Audio.play('dash');
        }
        if (this.ballCount <= 0 && this.ballTimer > 0.3) {
          this.state = 'recover'; this.stateT = 0;
        }
      }
    }

    takeHit(dmg, dir, kb, opts) {
      if (this.dead || this.state === 'intro') return false;
      // stagger build-up (heavy attacks & launcher give more)
      const staggerDmg = opts.launcher ? 12 : dmg >= 20 ? 9 : 4;
      this.stagger += staggerDmg;
      this.hp -= dmg;
      this.flashT = 0.08;
      this.knockX = kb * dir * 0.25;
      // normal hit: brief flinch
      if (this.state !== 'stagger') {
        this.stun = Math.max(this.stun, 0.08);
        if (this.state === 'attack' || this.state === 'windup') {
          // interrupted
          this.state = 'stagger'; this.stateT = 0;
          this.breathActive = false; this.chargeActive = false;
          this.stagger = 0;
        }
      }
      if (this.stagger >= this.staggerMax) {
        this.stagger = 0;
        this.state = 'stagger';
        this.stateT = 0;
        this.breathActive = false; this.chargeActive = false;
        Game.Fx.ring(this.x, this.y - this.h * 0.5, '#ffdd90', 16, 0.35, 5);
        Game.CamShake(8, 0.3);
        Game.Audio.play('heavyHit');
        Game.Fx.freeze(0.12);
      }
      if (this.hp <= 0) {
        this.dead = true;
        this.onDeath();
      }
      return true;
    }

    onDeath() {
      this.state = 'dead';
      this.deathT = 0;
      this.breathActive = false; this.chargeActive = false;
      this.game.onBossKilled(this);
    }

    updateDeath(dt) {
      this.deathT += dt;
      if (Math.random() < dt * 70) {
        Game.Fx.burst(this.x + U.rand(-60, 60), this.y - U.rand(0, 180), {
          n: 4, color: U.pick(['#ff8844', '#ff5533', '#8e0f0f', '#ffd9a0']),
          speedMin: 60, speedMax: 300, lifeMin: 0.4, lifeMax: 1.2, type: 'ember', grav: 200,
        });
      }
      if (Math.random() < dt * 30) Game.Fx.ghost(this.x, this.y - 100, '#ff8844', 2);
      this.alpha = Math.max(0, 1 - (this.deathT - 2.2) / 1.2);
      if (this.deathT > 3.4) this.alive = false;
    }

    updateAnim() {
      const s = this.game.sheets;
      if (!s) return;
      const idleAnim = this.phase2 ? s.beastBurn : s.beastIdle;   // phase-2: BLAZING FORM
      const idleFps = this.phase2 ? 9 : 4;
      if (this.state === 'windup') this.anim.play(idleAnim, idleFps, false);
      else if (this.state === 'attack' && this.attackType === 'breath') this.anim.play(s.beastBreath, 8, true);
      else if (this.state === 'attack' && this.attackType === 'melee') this.anim.play(s.beastBurn, 12, false);
      else if (this.state === 'attack' && this.attackType === 'charge') this.anim.play(s.beastBurn, 12, true);
      else if (this.state === 'attack' && this.attackType === 'flameburst') this.anim.play(s.beastBurn, 10, true);
      else if (this.state === 'attack' && this.attackType === 'summon') this.anim.play(s.beastBurn, 8, true);
      else if (this.state === 'attack' && this.attackType === 'leap') this.anim.play(s.beastBurn, 14, false);
      else if (this.state === 'attack' && this.attackType === 'tailswipe') this.anim.play(s.beastBurn, 10, false);
      else if (this.state === 'attack' && this.attackType === 'roar') this.anim.play(s.beastBreath, 10, false);
      else if (this.state === 'attack' && this.attackType === 'firestorm') this.anim.play(s.beastBurn, 10, false);
      else if (this.dead) this.anim.play(s.beastIdle, 3, false);
      else if (this.state === 'stagger') this.anim.play(idleAnim, idleFps, true);
      else this.anim.play(idleAnim, idleFps, true);
    }

    draw(ctx) {
      if (this.alpha <= 0) return;
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.scale(this.squashX, this.squashY);
      ctx.translate(-this.x, -this.y);
      // ember aura
      const g = ctx.createRadialGradient(this.x, this.y - this.h * 0.5, 20, this.x, this.y - this.h * 0.5, 140);
      g.addColorStop(0, 'rgba(255,120,40,0.22)');
      g.addColorStop(1, 'rgba(255,80,20,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(this.x, this.y - this.h * 0.5, 140, 0, Math.PI * 2); ctx.fill();
      if (this.breathActive) {
        // flame glow in front
        const fg = ctx.createLinearGradient(this.x + this.facing * 40, 0, this.x + this.facing * 300, 0);
        fg.addColorStop(0, 'rgba(255,150,60,0.5)');
        fg.addColorStop(1, 'rgba(255,80,20,0)');
        ctx.fillStyle = fg;
        ctx.beginPath();
        ctx.moveTo(this.x + this.facing * 40, this.y - 40);
        ctx.lineTo(this.x + this.facing * 300, this.y - U.rand(30, 110));
        ctx.lineTo(this.x + this.facing * 300, this.y - 130);
        ctx.lineTo(this.x + this.facing * 40, this.y - 160);
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();

      if (this.flashT > 0) {
        this.anim.drawFlash(ctx, this.x, this.y, { flip: this.facing < 0, scale: this.scale, alpha: this.alpha });
      } else {
        this.anim.draw(ctx, this.x, this.y, { flip: this.facing < 0, scale: this.scale, alpha: this.alpha });
        // phase-2 BLAZING FORM: molten underglow + glowing eyes + FIRE WINGS
        if (this.phase2) {
          // lava underglow rising from the feet
          const lg = ctx.createRadialGradient(this.x, this.y - 10, 6, this.x, this.y - 10, 130);
          lg.addColorStop(0, 'rgba(255,120,40,0.55)');
          lg.addColorStop(0.5, 'rgba(255,70,20,0.22)');
          lg.addColorStop(1, 'rgba(255,50,10,0)');
          ctx.fillStyle = lg;
          ctx.beginPath(); ctx.arc(this.x, this.y - 10, 130, 0, Math.PI * 2); ctx.fill();
          // burning eyes (two hot points)
          const flick = 0.75 + 0.25 * Math.sin(this.game.time * 13);
          ctx.fillStyle = 'rgba(255,220,120,' + (0.85 * flick) + ')';
          ctx.fillRect(this.x - 14, this.y - this.h * 0.82, 4, 5);
          ctx.fillRect(this.x + 12, this.y - this.h * 0.82, 4, 5);
          ctx.fillStyle = 'rgba(255,120,40,' + (0.9 * flick) + ')';
          ctx.fillRect(this.x - 13, this.y - this.h * 0.8, 2, 2);
          ctx.fillRect(this.x + 13, this.y - this.h * 0.8, 2, 2);
        }
      }
    }

  /* per-skill action pose: windup animations for every attack */
  _drawActionPose(ctx) {
    if (this.state !== 'windup' || this.dead) return;
    const w = this.windupType;
    if (w === 'melee') {
      const cx = this.x + this.facing * 64, cy = this.y - 92;
      const g = ctx.createRadialGradient(cx, cy, 4, cx, cy, 62);
      g.addColorStop(0, 'rgba(255,225,150,0.85)');
      g.addColorStop(1, 'rgba(255,160,60,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cx, cy, 62, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,220,150,0.7)';
      ctx.lineWidth = 4;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(this.x + this.facing * 20, this.y - 60 - i * 24);
        ctx.lineTo(this.x + this.facing * 92, this.y - 74 - i * 22);
        ctx.stroke();
      }
    } else if (w === 'breath') {
      // roaring head: mouth glow gathering + open-jaw silhouette
      const hx = this.x + this.facing * 34, hy = this.y - this.h * 0.82;
      const g = ctx.createRadialGradient(hx, hy, 3, hx, hy, 72);
      g.addColorStop(0, 'rgba(255,120,40,0.9)');
      g.addColorStop(1, 'rgba(255,60,20,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(hx, hy, 72, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(8,4,10,0.9)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(this.x + this.facing * 12, this.y - this.h * 0.76);
      ctx.lineTo(this.x + this.facing * 58, this.y - this.h * 0.7);
      ctx.lineTo(this.x + this.facing * 74, this.y - this.h * 0.8);
      ctx.stroke();
    } else if (w === 'charge') {
      ctx.fillStyle = 'rgba(120,100,80,0.28)';
      ctx.fillRect(this.x - 64, this.y - 8, 128, 8);
      ctx.fillStyle = 'rgba(255,140,60,0.4)';
      ctx.fillRect(this.x + this.facing * 20, this.y - 30, this.facing * 50, 4);
    } else if (w === 'summon') {
      const hx = this.x, hy = this.y - this.h * 0.7;
      const g = ctx.createRadialGradient(hx, hy, 4, hx, hy, 38);
      g.addColorStop(0, 'rgba(210,160,255,0.5)');
      g.addColorStop(1, 'rgba(150,90,220,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(hx, hy, 38, 0, Math.PI * 2); ctx.fill();
    } else if (w === 'flameburst') {
      ctx.strokeStyle = 'rgba(255,90,30,0.7)';
      ctx.lineWidth = 3;
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.moveTo(this.x + U.rand(-52, 52), this.y - 6);
        ctx.lineTo(this.x + U.rand(-62, 62), this.y + 16);
        ctx.stroke();
      }
    } else if (w === 'leap') {
      // crouch: compression glow pooling under the beast before the jump
      const g = ctx.createRadialGradient(this.x, this.y - 8, 4, this.x, this.y - 8, 72);
      g.addColorStop(0, 'rgba(255,170,70,0.75)');
      g.addColorStop(1, 'rgba(255,80,20,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(this.x, this.y - 8, 72, 22, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(120,90,60,0.3)';
      ctx.fillRect(this.x - 60, this.y - 6, 120, 6);
    } else if (w === 'tailswipe') {
      // tail glow gathering behind the beast
      const gx = this.x - this.facing * 70, gy = this.y - 60;
      const g = ctx.createRadialGradient(gx, gy, 4, gx, gy, 52);
      g.addColorStop(0, 'rgba(255,225,150,0.85)');
      g.addColorStop(1, 'rgba(255,120,40,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(gx, gy, 52, 0, Math.PI * 2); ctx.fill();
    } else if (w === 'roar') {
      // head charging the shockwave
      const hx = this.x, hy = this.y - this.h * 0.8;
      const g = ctx.createRadialGradient(hx, hy, 4, hx, hy, 62);
      g.addColorStop(0, 'rgba(255,210,130,0.9)');
      g.addColorStop(1, 'rgba(255,90,30,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(hx, hy, 62, 0, Math.PI * 2); ctx.fill();
    } else if (w === 'firestorm') {
      // body igniting: embers gathering on both flanks
      ctx.fillStyle = 'rgba(255,120,40,0.35)';
      for (const sx of [-70, 70]) {
        ctx.beginPath(); ctx.arc(this.x + sx, this.y - 60, 30, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  }

  Game.Boss = { HellBeast };
})();

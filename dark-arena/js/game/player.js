/* ============================================================
   PENITENT BLADE — game/player.js
   the penitent knight: combo lights, heavy launcher, dash i-frames,
   guard, fury execution with cinematic close-up.
   ============================================================ */
'use strict';
(function () {
  const Game = window.Game;
  const U = Game.U;
  const Entity = Game.Entity;

  const ATK = {
    l1: { dmg: 9, kb: 130, stun: 0.34, total: 0.40, active: [0.14, 0.24], range: 105, h: 60, launcher: 0, fury: 6, sfx: 'hit', name: 'CUT' },
    l2: { dmg: 10, kb: 150, stun: 0.36, total: 0.42, active: [0.14, 0.26], range: 112, h: 64, launcher: 0, fury: 6, sfx: 'hit', name: 'RIP' },
    l3: { dmg: 16, kb: 260, stun: 0.5, total: 0.52, active: [0.2, 0.32], range: 135, h: 70, launcher: 90, fury: 10, sfx: 'heavyHit', name: '哀悼' },
    heavy: { dmg: 24, kb: 420, stun: 0.62, total: 0.72, active: [0.34, 0.46], range: 145, h: 76, launcher: 0, fury: 14, sfx: 'heavyHit', name: '坠落' },
    dashAtk: { dmg: 12, kb: 240, stun: 0.42, total: 0.5, active: [0.1, 0.3], range: 155, h: 56, launcher: 0, fury: 5, sfx: 'hit', name: '奔袭' },
    fury: { dmg: 30, kb: 520, stun: 0.9, total: 1.6, active: [0.5, 1.3], range: 300, h: 200, launcher: 300, fury: 0, sfx: 'ultimate', name: '深渊狂怒' },
  };

  class Player extends Entity {
    constructor(game, x, y) {
      super({ x, y, w: 18, h: 90, scale: 3, hp: 120, speed: 240 });
      this.game = game;
      this.tag = 'player';
      this.fury = 0;
      this.maxFury = 100;
      this.combo = 0;             // 0..2 (light chain step)
      this.comboWindow = 0;
      this.state = 'idle';
      this.stateT = 0;
      this.atk = null;            // current attack config
      this.atkHit = new Set();    // enemies hit by this swing
      this.dashT = 0;
      this.guardT = 0;
      this.furyT = 0;
      this.attacking = false;
      this.kills = 0;
      this.buffered = null;       // buffered action name
      this.vulnerable = true;
      this.animName = 'idle';
      this.comboCount = 0;        // hit combo meter
      this.comboTimer = 0;
    }

    /* called after sheets ready */
    setSheets(s) {
      this.sheets = s;
      this.anim.play(s.idle, 7, true);
    }

    get alive() { return !this.dead; }

    get invincible() { return this.dashT > 0 || this.state === 'fury' || this.invuln > 0; }

    /* ---------------- input & state ---------------- */
    update(dt) {
      super.update(dt);
      if (this.blockSfxT > 0) this.blockSfxT -= dt;
      // combo meter decay
      if (this.comboTimer > 0) {
        this.comboTimer -= dt;
        if (this.comboTimer <= 0) this.comboCount = 0;
      }
      if (this.dead) {
        this.state = 'dead';
        this.anim.play(this.sheets.hurt, 6, false);
        return;
      }
      const I = Game.Input;

      // timers
      if (this.comboWindow > 0) this.comboWindow -= dt;
      if (this.dashT > 0) {
        this.dashT -= dt;
        // afterimages
        if (Math.random() < 0.6) {
          Game.Fx.addAfterimage(this.sheets.run, this.anim, this.x, this.y, this.facing < 0, this.scale, 0.35, 0.5);
        }
      }
      if (this.guardT > 0) this.guardT -= dt;
      if (this.furyT > 0) this.furyT -= dt;

      // dead / hurt lock
      if (this.state === 'hurt') {
        if (this.stun <= 0) this.setState('idle');
        this.applyPhysics(dt, this.game.world.platforms);
        this.updateAnim();
        return;
      }

      const dirX = I.axisX();
      const attacking = this.state === 'attack' || this.state === 'heavy' || this.state === 'dashAtk' || this.state === 'fury' || this.state === 'airAtk';

      // execution cinematic: lock player into finisher pose
      if (this.game.execT && !this.game.execT.done) {
        this.anim.play(this.sheets.attack, 10, false);
        this.vx = 0;
        return;
      }

      if (attacking) {
        this.updateAttack(dt);
        return;
      }
      if (this.state === 'dash') {
        // dash impulse, no player control
        if (this.dashT <= 0) this.setState('idle');
        this.applyPhysics(dt, this.game.world.platforms);
        this.updateAnim();
        return;
      }

      // guard (hold down)
      const guarding = I.down('guard') && this.onGround;
      if (guarding) {
        this.state = 'guard';
        this.guardT = Math.min(0.5, (this.guardT || 0) + dt);   // guard hold time (parry window)
        this.vx = 0;
      } else {
        this.guardT = 0;
        this.state = 'idle';
      }

      // movement
      if (!guarding) {
        if (dirX !== 0) {
          this.facing = dirX;
          this.vx = dirX * this.speed;
          if (this.onGround && this.state !== 'guard') this.state = 'run';
          // footstep dust (scene reacts to the player)
          if (this.onGround && Math.random() < dt * 10) {
            Game.Fx.spawn({
              x: this.x - this.facing * 16, y: this.y - 2,
              vx: -this.facing * 36, vy: -14,
              life: 0.35, size: 2.2, color: '#8a7a68', type: 'smoke', alpha: 0.32,
            });
          }
          if (Math.random() < dt * 6) Game.Audio.play('step');
        } else {
          this.vx = 0;
          if (this.onGround) this.state = 'idle';
        }
      }

      // dash
      if (I.consume('dash') && this.state !== 'dash') {
        this.doDash();
      }

      // air attack: falling slash while airborne (chases launched enemies)
      if (!this.onGround && I.consume('light') && this.state !== 'airAtk') {
        this.startAirAttack();
      }

      // attacks (buffered): a pending dash-attack must not be overwritten
      if (this.buffered !== 'dashAtk') {
        if (I.consume('light')) this.buffered = 'light';
        if (I.consume('heavy')) this.buffered = 'heavy';
        if (I.consume('exec') && this.fury >= this.maxFury) this.buffered = 'fury';
      }

      if (this.buffered) {
        const b = this.buffered;
        this.buffered = null;
        if (b === 'light') this.doLight();
        else if (b === 'heavy') this.doHeavy();
        else if (b === 'dashAtk') this.doDashAttack();
        else if (b === 'fury') this.doFury();
      }

      // jump / air state visuals
      if (!this.onGround && this.state !== 'guard') this.state = 'jump';

      this.applyPhysics(dt, this.game.world.platforms);
      this.updateAnim();
    }

    setState(s) { if (this.state !== s) { this.state = s; this.stateT = 0; } }

    doDash() {
      const dir = this.facing;
      this.state = 'dash';
      this.dashT = 0.22;
      this.vx = dir * 640;
      this.invuln = Math.max(this.invuln, 0.25);
      Game.Fx.ghost(this.x, this.y - 40, '#3a4a5a', 8);
      Game.Audio.play('dash');
      Game.CamShake(3, 0.12);
      // dash attack if light buffered right after
      if (Game.Input.buffered('light')) {
        this.buffered = 'dashAtk';
      }
    }

    doDashAttack() {
      const cfg = ATK.dashAtk;
      this.startAttack('dashAtk', cfg, 'dashAtk');
      // lunge while slashing
      this.vx = this.facing * 300;
    }

    /* airborne falling slash — chases launched enemies into the ground */
    startAirAttack() {
      const cfg = { dmg: 12, kb: 220, stun: 0.4, total: 0.5, active: [0.1, 0.26], range: 120, h: 130, launcher: 0, fury: 5, sfx: 'hit', name: '下落斩' };
      this.startAttack('airAtk', cfg, 'airAtk');
      this.vy = Math.min(this.vy, 240);
    }

    doLight() {
      const step = this.combo % 3;
      const key = step === 0 ? 'l1' : step === 1 ? 'l2' : 'l3';
      const cfg = ATK[key];
      this.startAttack(key, cfg, 'attack');
      if (step === 2) this.combo = 0; else this.combo = step + 1;
    }

    doHeavy() {
      const cfg = ATK.heavy;
      this.startAttack('heavy', cfg, 'heavy');
    }

    doFury() {
      if (this.fury < this.maxFury) return;
      this.fury = 0;
      const cfg = ATK.fury;
      this.startAttack('fury', cfg, 'fury');
      // leap into the air — the jump-attack animation plays during the fury
      this.vy = -620;
      this.leapDir = this.facing;
      // cinematic
      this.game.cinematic('深渊狂怒', '利刃啜饮深渊之血。', 1.5);
      Game.Fx.flash('#fff', 0.85, 0.35);
      Game.Fx.setSlowmo(0.35, 1.1);
      Game.Fx.freeze(0.18);
      Game.CamZoom(1.7, 0.4);
      Game.CamShake(10, 0.6);
      Game.Audio.play('ultimate');
      // real magic sprite: fireball spell bloom around the player
      const fb = this.game.sheets && this.game.sheets.fireballSpell;
      if (fb && fb.frames.length) {
        Game.Fx.spawnSheet(fb.img, fb.frames, this.x, this.y - 60, { scale: 2.4, dur: 0.5, alpha: 0.9 });
        Game.Fx.spawnSheet(fb.img, fb.frames, this.x + 60, this.y - 90, { scale: 1.4, dur: 0.45, flip: true, alpha: 0.8 });
        Game.Fx.spawnSheet(fb.img, fb.frames, this.x - 60, this.y - 90, { scale: 1.4, dur: 0.45, alpha: 0.8 });
      }
    }

    startAttack(key, cfg, state) {
      this.atk = { key, cfg, t: 0, hit: new Set(), done: false };
      this.atkKey = key;
      this.state = state;
      this.comboWindow = 0.28;
      this.vx = 0;
      this.attacking = true;
      Game.Audio.play('swing');
      const fps = key === 'heavy' ? 8 : key === 'fury' ? 8 : 12;
      if (key === 'fury' || key === 'airAtk') this.anim.play(this.sheets.jumpAttack, 8, false);
      else this.anim.play(this.sheets.attack, fps, false);
    }

    updateAttack(dt) {
      const a = this.atk;
      a.t += dt;
      const cfg = a.cfg;
      const total = cfg.total;
      const p = a.t / total;

      // forward step during windup (dash-attack lunges faster)
      const stepV = this.state === 'dashAtk' ? 320 : 120;
      if (a.t < cfg.active[0] && !a.hit.size) {
        this.vx = this.facing * stepV;
      } else {
        this.vx = 0;
      }

      // active window: check hits
      if (a.t >= cfg.active[0] && a.t <= cfg.active[1] && !a.hit.done) {
        this.checkHits(cfg);
      }
      if (a.t > cfg.active[1]) a.hit.done = true;

      // slash fx at active start — SHORT blade-flash (not a guide arc)
      if (a.t >= cfg.active[0] && !a.arcFx) {
        a.arcFx = true;
        const col = cfg.dmg >= 20 ? '#ff5540' : '#ffe9b0';
        Game.Fx.slashArc(this.x + this.facing * 36, this.y - this.h * 0.55,
          this.facing > 0 ? -0.9 : 0.9 + Math.PI, col, 0.65, 1.3, 0.09);
        if (cfg.dmg >= 20) {
          Game.CamShake(6, 0.18);
          Game.Fx.ring(this.x + this.facing * 40, this.y - this.h * 0.55, '#ff5540', 8, 0.2, 4);
        }
      }

      // combo chaining during recovery
      if (a.t > cfg.active[1]) {
        if (Game.Input.consume('light') && this.combo > 0 && this.state === 'attack') {
          this.comboWindow = 0;
          this.doLight();
          return;
        }
      }

      // end
      if (a.t >= total) {
        if (this.atkKey === 'fury') {
          // landing shockwave of the fury leap
          Game.Fx.ring(this.x, this.y - 4, '#ffdda0', 26, 0.4, 6);
          Game.Fx.burst(this.x, this.y - 8, { n: 18, color: '#ffdda0', speedMin: 60, speedMax: 280, lifeMin: 0.2, lifeMax: 0.5, type: 'spark' });
          Game.CamShake(9, 0.35);
          Game.Audio.play('heavyHit');
        }
        this.atk = null;
        this.attacking = false;
        this.setState('idle');
        if (this.comboWindow <= 0) this.combo = 0;
      }
      this.applyPhysics(dt, this.game.world.platforms);
      this.updateAnim();
    }

    checkHits(cfg) {
      const enemies = this.game.enemies;
      const x0 = this.x + this.facing * (this.w + 10);
      const hitBox = {
        x: this.facing > 0 ? x0 : x0 - cfg.range,
        y: this.y - cfg.h,
        w: cfg.range,
        h: cfg.h,
      };
      let hitAny = false;
      for (const e of enemies) {
        if (!e.alive) continue;
        if (this.atk.hit.has(e)) continue;
        const b = e.box;
        const ox = hitBox.x < b.x + b.w && hitBox.x + hitBox.w > b.x;
        const oy = hitBox.y < b.y + b.h && hitBox.y + hitBox.h > b.y;
        if (ox && oy) {
          this.atk.hit.add(e);
          const landed = e.takeHit(cfg.dmg, this.facing, cfg.kb, {
            stun: cfg.stun,
            launch: cfg.launcher,
          });
          if (landed) {
            hitAny = true;
            this.onHitLand(e, cfg);
          }
        }
      }
      // boss is a separate entity — it must also be hittable
      const boss = this.game.boss;
      if (boss && boss.alive && !this.atk.hit.has(boss)) {
        const b = boss.box;
        const ox = hitBox.x < b.x + b.w && hitBox.x + hitBox.w > b.x;
        const oy = hitBox.y < b.y + b.h && hitBox.y + hitBox.h > b.y;
        if (ox && oy) {
          this.atk.hit.add(boss);
          const landed = boss.takeHit(cfg.dmg, this.facing, cfg.kb, {
            stun: cfg.stun,
            launch: cfg.launcher,
          });
          if (landed) {
            hitAny = true;
            this.onHitLand(boss, cfg);
          }
        }
      }
      if (hitAny) { this.squashX = 0.85; this.squashY = 1.15; }
      return hitAny;
    }

    onHitLand(e, cfg) {
      this.fury = Math.min(this.maxFury, this.fury + cfg.fury);
      // combo meter
      this.comboCount++;
      this.comboTimer = 2.5;
      // tiered hit feedback: l1 subtle → l2 medium → l3/heavy/fury cinematic
      const key = this.atkKey || 'l1';
      const hx = e.x, hy = e.y - e.h * 0.5;
      // real impact sprite effect (OpenGameArt metal impact, 5 frames)
      const im = this.game.sheets && this.game.sheets.impactFx;
      if (im && im.frames.length) {
        Game.Fx.spawnSheet(im.img, im.frames, hx, hy, {
          scale: key === 'fury' ? 2.2 : (key === 'l3' || key === 'heavy' ? 1.6 : 1.1),
          dur: 0.22, flip: this.facing < 0,
        });
      }
      // floating damage number
      Game.Fx.dmgNum(hx, hy - 26, cfg.dmg,
        key === 'l3' ? '#ffdda0' : key === 'heavy' ? '#ff8844' : key === 'fury' ? '#fff2b0' : '#ffffff',
        key === 'l3' || key === 'heavy' || key === 'fury');
      if (key === 'l3' || key === 'heavy' || key === 'fury') {
        Game.Fx.freeze(0.1);
        Game.Fx.setSlowmo(0.45, 0.15);          // slow-mo flourish
        Game.Fx.flash('#fff', 0.32, 0.08);      // impact white-flash frame
        Game.Fx.sparks(hx, hy, this.facing, { n: 30 });
        Game.Fx.ring(hx, hy, '#ffdd90', 12, 0.3, 5);
        Game.Fx.glow(hx, hy, key === 'fury' ? 'rgba(255,220,140,0.8)' : 'rgba(255,170,80,0.7)', key === 'fury' ? 90 : 60, 0.3, 0.6);
        Game.CamShake(8, 0.3);
      } else if (key === 'l2') {
        Game.Fx.freeze(0.07);
        Game.Fx.sparks(hx, hy, this.facing, { n: 16 });
        Game.Fx.ring(hx, hy, '#ffe9b0', 8, 0.22, 3);
        Game.Fx.glow(hx, hy, 'rgba(255,200,120,0.6)', 38, 0.2, 0.5);
        Game.CamShake(3, 0.12);
      } else {
        Game.Fx.freeze(0.045);
        Game.Fx.sparks(hx, hy, this.facing, { n: 10 });
        Game.Fx.glow(hx, hy, 'rgba(255,220,150,0.5)', 24, 0.14, 0.45);
      }
      if (cfg.launcher) Game.Fx.ring(hx, hy - 10, '#b0a0ff', 6, 0.3, 3);
      Game.Audio.play(cfg.sfx);
      // execution close-up if enemy near death & stunned
      if (e.big && e.hp <= 0) {
        this.game.executionCamera(e, this);
      }
    }

    takeHit(dmg, dir, kb, opts) {
      if (this.invincible) {
        // perfect guard / dodge through (throttled feedback)
        if ((this.blockSfxT = this.blockSfxT || 0) <= 0) {
          this.blockSfxT = 0.22;
          Game.Audio.play('block');
          Game.Fx.ring(this.x, this.y - this.h * 0.5, '#9fd8ff', 8, 0.25, 3);
        }
        return false;
      }
        if (this.state === 'guard') {
          // PERFECT PARRY: blocking within the first 0.15s of guard bounces the
          // attacker back and staggers it — zero damage, high risk / reward
          if (this.guardT < 0.15 && opts && opts.attacker && opts.attacker.alive) {
          const atk = opts.attacker;
          atk.stun = Math.max(atk.stun, 0.9);
          atk.knockX = dir * 460;
          atk.flashT = 0.18;
          atk.takeHit ? null : null;
          Game.Fx.ring(this.x + dir * 30, this.y - this.h * 0.5, '#ffe9a0', 16, 0.3, 4);
          Game.Fx.sparks(this.x + dir * 26, this.y - this.h * 0.5, -dir, { n: 16 });
          Game.Fx.freeze(0.12);
          Game.Fx.setSlowmo(0.5, 0.2);
          Game.CamShake(6, 0.25);
          Game.Audio.play('heavyHit');
          return true;
        }
        // normal block: reduced damage & knockback (with block i-frames)
        this.hp -= Math.max(1, Math.round(dmg * 0.25));
        this.invuln = Math.max(this.invuln, 0.25);
        this.stun = 0.12;
        this.knockX = kb * dir * 0.3;
        this.flashT = 0.08;
        Game.Fx.sparks(this.x + dir * 20, this.y - this.h * 0.5, -dir, { n: 8 });
        Game.Audio.play('block');
        Game.CamShake(4, 0.15);
        return true;
      }
      const ok = super.takeHit(dmg, dir, kb, opts);
      if (ok) {
        this.invuln = Math.max(this.invuln, 0.55);   // hit i-frames: no multi-hit per frame
        this.setState('hurt');
        this.attacking = false; this.atk = null;
        Game.Fx.blood(this.x, this.y - this.h * 0.6, dir, { n: 10 });
        Game.Audio.play('hurt');
        Game.Fx.hurtVignette(0.6);
        Game.CamShake(9, 0.35);
        Game.Fx.freeze(0.08);
        if (this.hp <= 0) {
          this.game.onPlayerDeath(this);
        }
      }
      return ok;
    }

    heal(amt) { this.hp = Math.min(this.maxHp, this.hp + amt); }

    updateAnim() {
      const s = this.sheets;
      if (!s) return;
      switch (this.state) {
        case 'run': this.anim.play(s.run, 13, true); break;
        case 'jump': this.anim.play(s.jump, 9, true); break;
        case 'guard': this.anim.play(s.crouch, 6, true); break;
        case 'dash': this.anim.play(s.run, 12, true); break;
        case 'hurt': this.anim.play(s.hurt, 10, false); break;
        case 'dead': this.anim.play(s.hurt, 6, false); break;
        case 'attack': case 'heavy':
          this.anim.play(s.attack, this.atkKey === 'heavy' ? 8 : 12, false);
          break;
        case 'fury':
        case 'airAtk':
          this.anim.play(s.jumpAttack, 8, false);
          break;
        default: this.anim.play(s.idle, 7, true); break;
      }
    }

    draw(ctx) {
      // fury aura
      if (this.fury >= this.maxFury) {
        const t = this.game.time;
        ctx.save();
        ctx.globalAlpha = 0.35 + 0.15 * Math.sin(t * 8);
        const grad = ctx.createRadialGradient(this.x, this.y - 50, 10, this.x, this.y - 50, 90);
        grad.addColorStop(0, 'rgba(255,190,90,0.9)');
        grad.addColorStop(1, 'rgba(255,120,30,0)');
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(this.x, this.y - 50, 90, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
      super.draw(ctx);
      if (Game.DEBUG) this.drawBox(ctx);
    }

    drawBox(ctx) {
      const b = this.box;
      ctx.strokeStyle = 'rgba(0,255,0,0.6)';
      ctx.strokeRect(b.x, b.y, b.w, b.h);
    }
  }

  Game.Player = Player;
  Game.PlayerATK = ATK;
})();

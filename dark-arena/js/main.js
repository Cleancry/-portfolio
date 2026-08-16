/* ============================================================
   PENITENT BLADE - main.js
   boot, game loop, state machine, post-processing pipeline
   ============================================================ */
'use strict';
(function () {
  const Game = window.Game;
  const U = Game.U;

  /* global convenience API */
  Game.CamShake = (amp, dur) => { if (Game.camera) Game.camera.shake(amp, dur); };
  Game.CamZoom = (z, dur) => { if (Game.camera) Game.camera.zoomTo(z, dur); };
  Game.DEBUG = false;

  const VW = 1280, VH = 720;

  const SHEETS = {
    idle: 'hero/gothic-hero-idle.png',
    run: 'hero/gothic-hero-run.png',
    attack: 'hero/gothic-hero-attack.png',
    jump: 'hero/gothic-hero-jump.png',
    jumpAttack: 'hero/gothic-hero-jump-attack.png',
    hurt: 'hero/gothic-hero-hurt.png',
    crouch: 'hero/gothic-hero-crouch.png',
    wraithIdle: 'ghost/ghost-idle.png',
    wraithShriek: 'ghost/ghost-shriek.png',
    wraithVanish: 'ghost/ghost-vanish.png',
    houndIdle: 'hound/hell-hound-idle.png',
    houndRun: 'hound/hell-hound-run.png',
    skullFire: 'skull/fire-skull.png',
    demonIdle: 'demon/demon-idle.png',
    demonAttack: 'demon/demon-attack.png',
    beastIdle: 'beast/hell-beast-idle.png',
    beastBreath: 'beast/hell-beast-breath.png',
    beastBurn: 'beast/hell-beast-burn.png',
    fireball: 'beast/fire-ball.png',
    // church interior (5-frame background + floor tiles + columns)
    churchBg: 'church/backgrounds.png',
    churchTiles: 'church/tileset.png',
    churchColumn: 'church/column.png',
    angel: 'church/angel.png',
    ghoul: 'church/ghoul.png',
    chandelier: 'church/chandelier2.png',
    ceilingTex: 'church/ceiling.jpg',
    floorTex2: 'church/floor.jpg',
    banner: 'church/banner.png',
    tombstones: 'church/tombstones.png',
    crosses: 'church/crosses.png',
    banners2: 'church/banners.png',
    tombstoneCem: 'church/tombstone_cem.png',
    impactFx: 'fx/impact_dark.png',
    impactFx2: 'fx/impact_green.png',
    impactFx3: 'fx/impact_dkblue.png',
    fireballSpell: 'fx/fireball1.png',
  };

  class GameApp {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      canvas.width = VW; canvas.height = VH;

      // post-processing offscreen
      this.post = document.createElement('canvas');
      this.post.width = VW; this.post.height = VH;
      this.pctx = this.post.getContext('2d');

      this.camera = new Game.Camera(VW, VH);
      this.camera.bounds = { x: 0, y: 0, w: Game.World.WORLD_W, h: VH };
      this.world = new Game.World.ArenaWorld();
      this.ui = new Game.UI();
      this.fx = Game.Fx;

      this.state = 'boot';
      this.time = 0;
      this.sheets = {};
      this.player = null;
      this.enemies = [];
      this.projectiles = [];
      this.boss = null;
      this.waves = null;
      this.paused = false;
      this.elapsed = 0;
      this.fps = 0; this.fpsT = 0; this.frames = 0;

      this.bootEl = document.getElementById('boot');
      this.bootFill = document.getElementById('bootFill');
      this.bootTip = document.getElementById('bootTip');

      this._bindKeys();
      this._last = performance.now();
      requestAnimationFrame(this._loop.bind(this));
      this._startBoot();
    }

    /* ---------------- boot: load sprites (parallel) ---------------- */
    async _startBoot() {
      const names = Object.keys(SHEETS);
      const tips = ['正在召魂……', '铸炼利刃……', '搅动灰烬……', '聆听钟声……'];
      this.bootTip.textContent = tips[0];
      // sequential loading is rock-solid everywhere (parallel + rAF can race
      // and stall image onload in some environments)
      let loaded = 0;
      for (const n of names) {
        try {
          const sheet = await Promise.race([
            Game.Sprites.loadSheet(n, 'assets/sprites/' + SHEETS[n] + '?v=20240814b'),
            new Promise(r => setTimeout(() => r(null), 6000)),   // never hang the boot
          ]);
          if (sheet) this.sheets[n] = sheet;
        } catch (e) {
          console.warn('sheet fail:', n, e);
        }
        loaded++;
        this.bootFill.style.width = Math.round(loaded / names.length * 100) + '%';
        this.bootTip.textContent = tips[Math.min(tips.length - 1, Math.floor(loaded / names.length * tips.length))];
      }
      // build world background
      try {
        this.world.build(this.sheets);
      } catch (e) {
        console.error('world.build failed:', e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e);
        document.getElementById('overlay').textContent = 'BOOT ERROR: ' + (e && e.message);
        return;
      }
      this.bootFill.style.width = '100%';
      this._finishBoot();
    }

    _finishBoot() {
      this.bootEl.classList.add('gone');
      setTimeout(() => this.bootEl.remove(), 900);
      this.newGame();
    }

    _bindKeys() {
      window.addEventListener('keydown', e => {
        if (this.state === 'boot') return;
        if (e.code === 'Enter' && (this.state === 'over' || this.state === 'victory')) {
          this.newGame();
        }
        if (e.code === 'KeyP') this.paused = !this.paused;
        if (e.code === 'F1') Game.DEBUG = !Game.DEBUG;
        // cheat code: type "tsk1205" to jump straight into the boss fight
        if (e.key && e.key.length === 1) {
          this._cheatBuf = (this._cheatBuf || '') + e.key.toLowerCase();
          if (this._cheatBuf.length > 8) this._cheatBuf = this._cheatBuf.slice(-8);
          if (this._cheatBuf.indexOf('tsk1205') !== -1) {
            this._cheatBuf = '';
            this.startBossCheat();
          }
        }
      });
      // resume audio on first interaction
      window.addEventListener('pointerdown', () => Game.Audio.resume());
      window.addEventListener('keydown', () => Game.Audio.resume());
    }

    /* cheat: "tsk1205" — restart into the boss fight immediately */
    startBossCheat() {
      if (this.state === 'boot') return;
      this.newGame();
      this.waves.bossWave = 1;
      this.waves.wave = 1;
      this.waves.bossActive = true;
      this.boss = new Game.Boss.HellBeast(this, Game.World.WORLD_W / 2 + 200, Game.World.FLOOR_Y);
      this.waves.banner = { title: '第 VII 波 - 深渊巨兽', sub: '作弊码生效——直面巨兽', t: 0, dur: 2.6, kind: 'boss' };
      Game.Audio.play('bossRoar');
      Game.CamShake(10, 0.6);
    }

    /* ---------------- game state ---------------- */
    newGame() {
      Game.Audio.resume();
      Game.Audio.musicStart();
      Game.Input.enable();
      this.state = 'playing';
      this.time = 0;
      this.enemies = [];
      this.projectiles = [];
      this.boss = null;
      this.player = new Game.Player(this, Game.World.WORLD_W / 2, Game.World.FLOOR_Y);
      this.player.setSheets(this.sheets);
      this.waves = new Game.Waves(this);
      this.waves.start();
      this.camera.snap(this.player.x, 360);
      this.camera.zoomTo(1, 0.5);
      this.ui.setVisible(true);
      this.ui.endScreen = null;
      this.fx.afterimages = [];
      this.announce('忏悔之刃', '灰烬与白骨之地 等待着你', 2.2);
      Game.Audio.play('waveStart');

      if (location.search.includes('selftest')) {
        Game.Input.disable();
        let mode = location.search.includes('boss') ? 'boss' : 'wave';
        if (location.search.includes('hurt')) mode = 'hurt';
        if (location.search.includes('all')) mode = 'all';
        if (location.search.includes('full')) mode = 'full';
        this.st = { t: 0, atkT: 0, done: false, mode };
        if (mode === 'boss') {
          // jump straight into the boss fight
          this.waves.bossWave = 1;
          this.waves.wave = 1;
          this.waves.bossActive = true;
          this.boss = new Game.Boss.HellBeast(this, Game.World.WORLD_W / 2 + 200, Game.World.FLOOR_Y);
          this.waves.banner = { title: '第 VII 波 - 深渊巨兽', sub: '它已等候你多时', t: 0, dur: 2.6, kind: 'boss' };
        } else if (mode === 'hurt') {
          // one wraith spawned nearby - it must walk over on its own (i-frame probe)
          const e = new Game.Enemy.Wraith(this, this.player.x + 120, Game.World.FLOOR_Y);
          this.enemies.push(e);
          this.waves.banner = null;
        } else if (mode === 'all') {
          // one of every enemy type (incl. demon elite) spawned around the player
          this.waves.banner = null;
          const mk = [
            () => new Game.Enemy.Wraith(this, this.player.x + 320, Game.World.FLOOR_Y),
            () => new Game.Enemy.Hellhound(this, this.player.x - 320, Game.World.FLOOR_Y),
            () => new Game.Enemy.FireSkull(this, this.player.x + 520, Game.World.FLOOR_Y),
            () => new Game.Enemy.Demon(this, this.player.x - 520, Game.World.FLOOR_Y),
          ];
          for (const f of mk) this.enemies.push(f());
        }
        // synchronous simulation - run immediately (no setTimeout dependency)
        this._runSyncSim();
      }
    }

    /* run a fixed-length synchronous combat simulation, then report */
    _runSyncSim() {
      const st = this.st;
      if (!st || st.done) return;
      const ov = document.getElementById('overlay');
      if (ov) ov.textContent = 'SELFTEST:RUNNING mode=' + st.mode;
      const maxSteps = st.mode === 'hurt' ? 180 : (st.mode === 'full' ? 12000 : (st.mode === 'boss' ? 1800 : 1500));   // 3s / 200s / 30s boss / 25s
      try {
        for (let i = 0; i < maxSteps; i++) {
          const dt = 1 / 60;
          this._selftestStep(dt);
          this.fx.update(dt);
          this.update(dt, dt);
          this.camera.update(dt);
          if (st.done) break;
        }
        this.ui.update(this, 1 / 60);
        this._reportSelf(st, this.player);
        st.done = true;
        // one last paint so the report is visible in a screenshot
        try { this.render(); } catch (e) {}
      } catch (err) {
        const ov = document.getElementById('overlay');
        if (ov) ov.textContent = 'SELFTEST:ERROR ' + (err && err.stack ? err.stack.split('\n').slice(0, 3).join(' | ') : err);
        st.done = true;
      }
    }

    /* automated combat for headless verification (synchronous) */
    _selftestStep(dt) {
      if (!this.st || this.st.done) return;
      const st = this.st;
      st.t += dt;
      st.atkT -= dt;
      const p = this.player;
      if (!p || !p.alive) return;

      // hurt mode: let a wraith freely approach the idle player - verifies
      // enemies actively chase & attack (no pinning)
      if (st.mode === 'hurt') {
        const e = this.enemies[0];
        if (e && e.alive) {
          e.attackCd = 99;   // no lunges, only contact damage while approaching
          st.eX = Math.round(e.x);
          st.eVx = Math.round(e.vx);
          st.eState = e.state;
          st.eMove = (st.eMove || 0) + Math.abs(e.x - (st.ePrevX === undefined ? e.x : st.ePrevX));
          st.ePrevX = e.x;
        }
        if (p.hp < (st.lastHp === undefined ? p.hp : st.lastHp)) { st.hurtCount = (st.hurtCount || 0) + 1; }
        st.lastHp = p.hp;
        if (st.t > 5 && !st.reported) { st.reported = true; this._reportSelf(st, p); }
        return;
      }
      // full-run mode: scripted sweep every 2.5s - verifies the wave state machine
      // (wave 1-7 progression + boss transition + victory) decoupled from combat AI
      if (st.mode === 'full') {
        st.clearT = (st.clearT || 0) + dt;
        if (st.clearT > 2.5) {
          st.clearT = 0;
          for (const e of this.enemies) if (e.alive) e.takeHit(9999, 1, 0, {});
          if (this.boss && this.boss.alive) this.boss.takeHit(9999, 1, 0, {});
        }
        return;
      }
      if (st.mode === 'boss' && this.boss && this.boss.alive) {
        const b = this.boss;
        const dir = b.x > p.x ? 1 : -1;
        p.facing = dir;
        const bd = Math.abs(b.x - p.x);
        if (bd > 120) { p.x += dir * 140 * dt; p.vx = dir * p.speed; p.state = 'run'; }
        else {
          p.vx = 0;
          if (st.atkT <= 0 && !p.attacking) {
            st.atkT = 0.1;
            if (p.fury >= p.maxFury) { st.furied = true; p.doFury(); }
            else { p.doLight(); p.comboWindow = 0.6; }   // keep the chain alive
          }
        }
        return;
      }
      // find nearest enemy
      let best = null, bd = 1e9;
      for (const e of this.enemies) {
        if (!e.alive) continue;
        const d = Math.abs(e.x - p.x);
        if (d < bd) { bd = d; best = e; }
      }
      if (best) {
        const dir = best.x > p.x ? 1 : -1;
        p.facing = dir;
        // full-run harness: pin the target so knockback never breaks the loop
        if (st.mode === 'full' && bd <= 170) {
          best.x = p.x + dir * 42;
          best.y = Game.World.FLOOR_Y;
          bd = 42;   // refresh distance after pinning
        }
        if (bd > 170) { p.x = best.x - dir * 90; }   // teleport-chase (selftest only)
        if (bd > 110) { p.x += dir * 200 * dt; p.vx = dir * p.speed; p.state = 'run'; }
        else {
          p.vx = 0;
          if (st.atkT <= 0 && !p.attacking) {
            st.atkT = 0.1;
            if (p.fury >= p.maxFury) { st.furied = true; p.doFury(); }
            else {
              p.doHeavy();
              p.comboWindow = 0.6;
            }
          }
        }
      } else {
        p.vx = 0;
      }
      // full run mode: player is invincible so the whole campaign can be swept
      if (st.mode === 'full') p.invuln = 999;
      if (p.fury >= p.maxFury && !st.furied) {
        st.furied = true;
        p.doFury();
      }
      // hurt probe: pin an enemy onto the player for 1s, count hit ticks
      if (st.mode === 'wave' && st.t > 1.0 && st.t < 2.1 && this.enemies.length) {
        const e = this.enemies[0];
        if (e && e.alive) {
          e.x = p.x + 12;
          e.y = Game.World.FLOOR_Y;
        }
      }
      if (p.hp < (st.lastHp === undefined ? p.hp : st.lastHp)) { st.hurtCount = (st.hurtCount || 0) + 1; }
      st.lastHp = p.hp;
      if (st.t > 4 && !st.reported) {
        st.reported = true;
        this._reportSelf(st, p);
      }
      // continuous progress (headless: few frames, so report often)
      if (!st.reported && (st.writeTick = (st.writeTick || 0) + 1) % 10 === 1) {
        const ov = document.getElementById('overlay');
        if (ov) ov.textContent = 'SELFTEST:PROGRESS ' + JSON.stringify({
          t: Math.round(st.t * 10) / 10,
          kills: this.waves.totalKills,
          enemies: this.enemies.length,
          spawned: this.waves.spawnedCount || 0,
          hp: Math.round(p.hp), fury: Math.round(p.fury),
        });
      }
      // end condition: full run ends on victory/death or a generous cap
      if (st.mode === 'full') {
        if (this.state !== 'playing' || st.t > 200) st.done = true;
      } else if (st.t > 9) {
        st.done = true;
      }
    }

    _reportSelf(st, p) {
      const rep = {
        selftest: true,
        mode: st.mode,
        kills: this.waves.totalKills,
        enemies: this.enemies.length,
        spawned: this.waves.spawnedCount || 0,
        wstate: this.waves.state,
        wspawnT: Math.round(this.waves.spawnT * 100) / 100,
        wqueue: this.waves.queue.length,
        playerHp: Math.round(p.hp),
        playerFury: Math.round(p.fury),
        playerX: Math.round(p.x),
        wave: this.waves.wave,
        state: this.state,
      };
      if (this.boss) {
        rep.bossHp = Math.round(this.boss.hp);
        rep.bossAlive = this.boss.alive;
        rep.bossState = this.boss.state;
        rep.bossPhase2 = !!this.boss.phase2;
      }
      if (this.enemies.length) {
        const e = this.enemies[0];
        rep.enemy0 = Math.round(e.x) + ',' + Math.round(e.y) + ',' + e.state;
      }
      if (st.mode === 'all') {
        const types = {};
        for (const e of this.enemies) {
          const t = e.constructor.name;
          types[t] = (e.alive ? 'alive' : 'dead') + '(' + Math.round(e.hp) + ')';
        }
        rep.types = types;
      }
      if (p.anim) {
        rep.animIdx = p.anim.idx;
        rep.animName = p.anim.animName;
        rep.animT = Math.round(p.anim.t * 100) / 100;
      }
      rep.hurtCount = st.hurtCount || 0;
      rep.st = Math.round(st.t * 10) / 10;
      if (st.mode === 'hurt') {
        rep.eX = st.eX; rep.eVx = st.eVx; rep.eState = st.eState; rep.eMove = Math.round(st.eMove || 0);
      }
      const ov = document.getElementById('overlay');
      if (ov) ov.textContent = 'SELFTEST:' + JSON.stringify(rep);
      document.title = JSON.stringify(rep);
    }

    onEnemyKilled(e) {
      if (this.waves) this.waves.onKilled(e);
      this.player.kills++;
      // soul particles
      Game.Fx.ghost(e.x, e.y - e.h * 0.5, '#c8b8d8', 10);
      Game.Fx.ring(e.x, e.y - e.h * 0.5, '#c8b8d8', 14, 0.4, 3);
      Game.Fx.freeze(0.05);
      // kill flourish: brief slow-mo + camera punch (cinematic on every kill)
      Game.Fx.setSlowmo(0.55, 0.22);
      Game.CamShake(4, 0.2);
      Game.Audio.play('death');
      // small heal on kill + soul siphon chime
      this.player.heal(1.5);
      Game.Audio.play('soulGain');
      if (e.big) {
        // elite: cinematic execution
        this.executionCamera(e, this.player);
      }
    }

    onBossKilled(boss) {
      this.player.kills++;
      this.waves.totalKills++;
      this.ui.showEnd('victory', this.waves.totalKills, this.waves.wave);
      this.state = 'victory';
      if (this.world) this.world.setBloodMode(false);
      Game.Fx.flash('#fff', 1, 0.6);
      Game.Fx.setSlowmo(0.3, 1.4);
      Game.CamShake(18, 1.2);
      Game.CamZoom(1.3, 0.8);
      Game.Audio.play('execution');
      // cinematic close-up on the beast
      this.execT = { target: boss, player: this.player, t: 0, dur: 2.4, done: false, boss: true };
      Game.CamZoom(1.4, 0.3);
    }

    onPlayerDeath(p) {
      this.state = 'over';
      this.ui.showEnd('death', this.waves ? this.waves.totalKills : 0, this.waves ? this.waves.wave : 0);
      Game.Fx.flash('#ff2200', 0.5, 0.5);
      Game.Fx.setSlowmo(0.4, 1.2);
      Game.CamShake(14, 0.8);
      Game.Audio.play('execution');
    }

    victory() {
      // handled in onBossKilled
    }

    /* cinematic close-up when an elite dies */
    executionCamera(target, player) {
      if (this.execT) return;
      this.execT = { target, player, t: 0, dur: 1.5, done: false };
      Game.Fx.setSlowmo(0.3, 1.2);
      Game.CamZoom(1.55, 0.25);
    }

    announce(title, sub, dur, kind) {
      this.ui.showTitle(title, sub, dur, kind);
    }

    cinematic(title, sub, dur) {
      this.announce(title, sub, dur);
    }

    /* music intensity: idle 0.6 / combat scales with enemies /
       boss phase-1 1.5 / boss phase-2 2.0 (oppressive theme) */
    _gameIntensity() {
      if (this.boss && this.boss.alive) return this.boss.phase2 ? 2.0 : 1.5;
      const alive = this.enemies.filter(e => e.alive).length;
      return 0.6 + Math.min(0.8, alive * 0.12);
    }

    /* cinematic close-up camera: plays during playing AND victory */
    /* full-screen boss transform cinema: head close-up -> fire eruption -> resume */
    updateTransformCinema(dt) {
      const boss = this.transformCinema;
      this.transformT += dt;
      const t = this.transformT;
      const headY = boss.y - boss.h * 0.85;
      if (t < 1.0) {
        // PHASE 1: head close-up, slow drift in — hard-locked on the boss
        this.camera.zoomTo(2.1, 0.4);
        this.camera.tx = boss.x;
        this.camera.ty = headY;
        this.camera.x = boss.x - this.camera.vw / (2 * this.camera.zoom);
        this.camera.y = headY - this.camera.vh / (2 * this.camera.zoom);
        Game.Fx.flash('#ff4422', 0.25, 0.12);
        if (Math.random() < dt * 30) Game.Fx.embers(boss.x + U.rand(-30, 30), headY, 2);
      } else if (t < 1.7) {
        // PHASE 2: erupt into fire — pull back through a pillar of flame
        this.camera.zoomTo(1.25, 0.5);
        this.camera.tx = boss.x;
        this.camera.ty = boss.y - boss.h * 0.3;
        this.camera.x = boss.x - this.camera.vw / (2 * this.camera.zoom);
        this.camera.y = (boss.y - boss.h * 0.3) - this.camera.vh / (2 * this.camera.zoom);
        Game.Fx.flash('#fff', 0.5, 0.15);
        Game.Fx.burst(boss.x, headY, { n: 40, color: '#ff8844', speedMin: 100, speedMax: 480, lifeMin: 0.4, lifeMax: 1.2, type: 'ember', grav: 60 });
        Game.Fx.spawn({ x: boss.x, y: boss.y - 40, vx: 0, vy: -420, life: 0.5, size: 44, color: '#ff8830', type: 'ember', alpha: 0.9 });
        Game.CamShake(12, 0.4);
        Game.Audio.play('bossRoar');
      } else {
        // PHASE 3: resume the fight at normal view
        this.camera.zoomTo(1, 0.6);
        this.camera.tx = this.player.x;
        this.camera.ty = this.player.y - 60;
        if (t > 2.2) {
          this.frozen = false;
          this.transformCinema = null;
          this.execT = null;
        }
      }
    }

    updateCinematicCamera(rawDt, p) {
      if (!this.execT) {
        if (this.player && this.player.alive && this.state === 'playing') {
          this.camera.tx = p.x;
          this.camera.ty = p.y - 60;
        }
        return;
      }
      const ex = this.execT;
      ex.t += rawDt;
      const t = ex.t / ex.dur;
      this.camera.tx = U.lerp(ex.target.x, p.x, Math.min(1, t * 2));
      this.camera.ty = ex.target.y - ex.target.h * 0.5;
      if (!ex.done && t > 0.35) {
        ex.done = true;
        // the finishing blow
        p.anim.play(this.sheets.attack, 10, false);
        Game.Fx.flash('#fff', 0.7, 0.2);
        Game.Fx.blood(ex.target.x, ex.target.y - ex.target.h * 0.5, p.facing, { n: ex.boss ? 40 : 26, speed: 320 });
        Game.Fx.sparks(ex.target.x, ex.target.y - ex.target.h * 0.5, p.facing, { n: 30 });
        Game.Audio.play('heavyHit');
        Game.CamShake(10, 0.4);
        Game.Fx.freeze(0.16);
      }
      if (t >= 1) {
        this.execT = null;
        this.camera.zoomTo(1, 0.6);
        if (this.fx.slowmoT <= 0.2) this.fx.slowmo = 1;
      }
    }

    /* ---------------- main loop ---------------- */
    _loop(now) {
      requestAnimationFrame(this._loop.bind(this));
      let dt = (now - this._last) / 1000;
      this._last = now;
      dt = Math.min(dt, 0.05);

      this.fpsT += dt; this.frames++;
      if (this.fpsT >= 0.5) { this.fps = this.frames / this.fpsT; this.fpsT = 0; this.frames = 0; }

      if (this.state === 'boot') return;

      // global time (unscaled)
      this.time += dt;

      // fx time control
      this.fx.update(dt);
      const s = this.fx.scale;
      const sdt = dt * s;

      if (!this.paused && this.state === 'playing') {
        Game.Audio.musicUpdate(dt, this._gameIntensity());
        Game.Input.update();
        this.update(sdt, dt);
      } else if (this.state === 'over' || this.state === 'victory') {
        // cinematic camera keeps playing (boss execution / death cam)
        this.updateCinematicCamera(dt, this.player);
        this.camera.update(dt);
        this.ui.update(this, dt);
        // world ambience
        this.world.update(dt, this.camera.x);
        // keep boss death animation running until the corpse dissolves
        if (this.boss && this.boss.dead) this.boss.update(dt);
      }

      this.render();
    }

    update(dt, rawDt) {
      const p = this.player;
      if (!p) return;

      // FULL-SCREEN BOSS TRANSFORM CINEMA: freeze the fight while it plays
      if (this.frozen && this.transformCinema) {
        this.updateTransformCinema(dt);
        this.fx.update(dt);
        this.camera.update(dt);
        return;
      }

      // cinematic camera sequence (execution close-ups)
      this.updateCinematicCamera(rawDt, p);

      // player
      p.update(dt);

      // enemies
      for (const e of this.enemies) if (e.alive) e.update(dt);
      this.enemies = this.enemies.filter(e => e.alive);

      // projectiles
      for (const pr of this.projectiles) pr.update(dt);
      this.projectiles = this.projectiles.filter(pr => pr.alive);

      // boss
      if (this.boss) this.boss.update(dt);

      // enemy contact damage on player (restored to the original pre-change setup)
      if (!p.invincible && p.alive) {
        for (const e of this.enemies) {
          if (!e.alive || e.contactDmg <= 0) continue;
          const b = e.box, pb = p.box;
          const overlap = b.x < pb.x + pb.w && b.x + b.w > pb.x && b.y < pb.y + pb.h && b.y + b.h > pb.y;
          if (overlap) {
            p.takeHit(e.contactDmg, e.x > p.x ? 1 : -1, 180, { stun: 0.2, attacker: e });
          }
        }
        if (this.boss && this.boss.alive && this.boss.contactDmg > 0) {
          const b = this.boss.box, pb = p.box;
          const overlap = b.x < pb.x + pb.w && b.x + b.w > pb.x && b.y < pb.y + pb.h && b.y + b.h > pb.y;
          if (overlap) p.takeHit(this.boss.contactDmg, this.boss.x > p.x ? 1 : -1, 260, { stun: 0.3, attacker: this.boss });
        }
      }

      // waves
      if (this.waves) this.waves.update(dt);

      // world ambience
      this.world.update(dt, this.camera.x);

      // camera
      this.camera.update(dt);

      // ui
      this.ui.update(this, dt);
    }

    /* ---------------- render ---------------- */
    render() {
      const ctx = this.ctx;
      const cam = this.camera;

      // 1. background (in screen space with parallax)
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      // base sky fill
      ctx.fillStyle = '#0a0d14';
      ctx.fillRect(0, 0, VW, VH);
      this.world.drawBackground(ctx, cam, this.enemies.filter(e => e.alive).length / 6);
      ctx.restore();

      // 2. world space
      cam.apply(ctx);
      this.world.drawFloor(ctx);
      this.world.drawDeco(ctx);

      // entities: sort by y (painter)
      const drawables = [];
      if (this.player && this.player.alive) drawables.push({ y: this.player.y, draw: () => this.player.draw(ctx) });
      for (const e of this.enemies) drawables.push({ y: e.y, draw: () => e.draw(ctx) });
      if (this.boss && this.boss.alive) drawables.push({ y: this.boss.y, draw: () => this.boss.draw(ctx) });
      for (const pr of this.projectiles) drawables.push({ y: pr.y, draw: () => pr.draw(ctx) });
      drawables.sort((a, b) => a.y - b.y);
      for (const d of drawables) d.draw();

      // top-layer ground decor: corpses, book piles, barrels, statues
      if (this.world) this.world.drawDecoFront(ctx);

      // particles in world space
      this.fx.draw(ctx);
      this.world.drawAsh(ctx);
      cam.restore(ctx);

      // topmost foreground layer (columns hug the screen bottom edge)
      if (this.world) this.world.drawForeground(ctx, this.camera);

      // 3. post-processing
      this.postProcess(ctx);

      // 4. UI overlays (screen space)
      this.ui.draw(ctx, this, VW, VH);
    }

    postProcess(ctx) {
      const pctx = this.pctx;
      // copy scene
      pctx.clearRect(0, 0, VW, VH);
      pctx.drawImage(this.canvas, 0, 0);

      // ambient lift (warm candlelight breathing into the scene)
      const liftA = 0.09 + 0.03 * Math.sin(this.time * 1.3);
      pctx.fillStyle = 'rgba(255,236,210,' + liftA + ')';
      pctx.fillRect(0, 0, VW, VH);

      // soft warm glow around the nave centre (lens-like bloom)
      {
        const gg = pctx.createRadialGradient(VW / 2, VH * 0.52, VH * 0.08, VW / 2, VH * 0.52, VH * 0.8);
        gg.addColorStop(0, 'rgba(255,180,100,0.07)');
        gg.addColorStop(0.6, 'rgba(255,150,70,0.03)');
        gg.addColorStop(1, 'rgba(0,0,0,0)');
        pctx.fillStyle = gg;
        pctx.fillRect(0, 0, VW, VH);
      }

      // vignette (softened)
      const vg = pctx.createRadialGradient(VW / 2, VH / 2, VH * 0.32, VW / 2, VH / 2, VH * 0.95);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(0,0,10,0.30)');
      pctx.fillStyle = vg;
      pctx.fillRect(0, 0, VW, VH);

      // drifting floor mist (two slow fog bands)
      const fg = pctx.createLinearGradient(0, VH * 0.66, 0, VH);
      fg.addColorStop(0, 'rgba(6,8,14,0)');
      fg.addColorStop(1, 'rgba(4,6,12,0.5)');
      pctx.fillStyle = fg;
      pctx.fillRect(0, 0, VW, VH);
      pctx.globalAlpha = 0.10 + 0.05 * Math.sin(this.time * 0.6);
      for (let i = 0; i < 6; i++) {
        const fx = ((i * 240 + this.time * (8 + i * 3)) % (VW + 300)) - 150;
        const fh = 90 + i * 26;
        const fb = pctx.createRadialGradient(fx + 60, VH - fh * 0.4, 10, fx + 60, VH - fh * 0.4, fh);
        fb.addColorStop(0, 'rgba(190,200,220,0.10)');
        fb.addColorStop(1, 'rgba(190,200,220,0)');
        pctx.fillStyle = fb;
        pctx.fillRect(fx, VH - fh, 120, fh);
      }
      pctx.globalAlpha = 1;

      // blood vignette (damage)
      if (this.fx.bloodVignette > 0.01) {
        const bv = this.fx.bloodVignette;
        const bg = pctx.createRadialGradient(VW / 2, VH / 2, VH * 0.4, VW / 2, VH / 2, VH * 0.9);
        bg.addColorStop(0, 'rgba(120,0,0,0)');
        bg.addColorStop(1, `rgba(140,10,5,${0.55 * bv})`);
        pctx.fillStyle = bg;
        pctx.fillRect(0, 0, VW, VH);
      }

      // low-health breathing crimson (below 25% HP)
      if (this.player && this.player.alive && this.player.hp / this.player.maxHp < 0.25) {
        const breathe = 0.12 + 0.1 * Math.sin(this.time * 3.2);
        const bg2 = pctx.createRadialGradient(VW / 2, VH / 2, VH * 0.45, VW / 2, VH / 2, VH * 0.95);
        bg2.addColorStop(0, 'rgba(90,0,0,0)');
        bg2.addColorStop(1, `rgba(150,10,5,${breathe})`);
        pctx.fillStyle = bg2;
        pctx.fillRect(0, 0, VW, VH);
      }

      // flash
      if (this.fx.flashColor) {
        pctx.globalAlpha = U.clamp(this.fx.flashAlpha, 0, 1);
        pctx.fillStyle = this.fx.flashColor;
        pctx.fillRect(0, 0, VW, VH);
        pctx.globalAlpha = 1;
      }

      // grain (subtle film noise)
      if (Math.random() < 0.7) {
        pctx.globalAlpha = 0.05;
        for (let i = 0; i < 70; i++) {
          const x = Math.random() * VW, y = Math.random() * VH;
          pctx.fillStyle = Math.random() > 0.5 ? '#000' : '#fff';
          pctx.fillRect(x, y, 1, 1);
        }
        pctx.globalAlpha = 1;
      }

      // draw post back
      ctx.clearRect(0, 0, VW, VH);
      ctx.drawImage(this.post, 0, 0);
    }
  }

  // init - start immediately (readyState check), not waiting on DOMContentLoaded
  function initGame() {
    const canvas = document.getElementById('game');
    if (!canvas) return;
    Game.app = new GameApp(canvas);
    window.focus();
  }
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', initGame);
  } else {
    initGame();
  }
})();




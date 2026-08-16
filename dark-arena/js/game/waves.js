/* ============================================================
   PENITENT BLADE — game/waves.js
   wave director: spawn queues, banners, boss phase
   ============================================================ */
'use strict';
(function () {
  const Game = window.Game;
  const U = Game.U;

  const WAVE_DEFS = [
    { name: '尸潮',        groups: [['wraith', 4]] },
    { name: '兽群',        groups: [['hound', 3], ['wraith', 2]] },
    { name: '烈焰',        groups: [['ghoul', 3], ['skull', 2]] },
    { name: '深渊之子',     groups: [['ghoul', 3], ['skull', 2], ['wraith', 2]] },
    { name: '圣殿卫士',    groups: [['angel', 2], ['ghoul', 2], ['hound', 2]] },
    { name: '深狱',        groups: [['demon', 1], ['angel', 2], ['ghoul', 2], ['skull', 2]] },
    // wave 7 = boss
  ];

  class Waves {
    constructor(game) {
      this.game = game;
      this.wave = 0;
      this.state = 'prep';        // prep → spawning → fighting → done
      this.queue = [];            // {type, delay}
      this.spawnT = 0;
      this.bannerT = 0;
      this.banner = null;
      this.killed = 0;
      this.totalKills = 0;
      this.bossWave = 7;
      this.bossActive = false;
      this.finished = false;
    }

    start() {
      this.beginWave(1);
    }

    beginWave(n) {
      this.wave = n;
      this.state = 'prep';
      this.spawnT = 0;
      this.bossActive = false;
      if (n === this.bossWave) {
        this.banner = { title: '第 VII 波 — 深渊巨兽', sub: '它已等候你多时', t: 0, dur: 2.6, kind: 'boss' };
      } else {
        const def = WAVE_DEFS[n - 1];
        this.queue = [];
        for (const [type, count] of def.groups) {
          for (let i = 0; i < count; i++) {
            this.queue.push({ type, delay: U.rand(0.4, 1.4) });
          }
        }
        // shuffle-ish: keep simple
        this.queue.sort((a, b) => a.delay - b.delay);
        this.banner = { title: `第 ${this.roman(n)} 波 — ${def.name}`, sub: '', t: 0, dur: 2.2 };
      }
      Game.Audio.play('waveStart');
      Game.Fx.flash('#000', 0.9, 0.6);
    }

    roman(n) {
      const r = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
      return r[n] || n;
    }

    update(dt) {
      if (this.banner) {
        this.banner.t += dt;
        if (this.banner.t >= this.banner.dur) this.banner = null;
      }

      if (this.wave === this.bossWave) {
        this.updateBossWave(dt);
        return;
      }

      if (this.state === 'prep') {
        this.spawnT += dt;
        if (this.spawnT > 1.2) {
          this.state = 'spawning';
          this.spawnT = 0;
        }
      } else if (this.state === 'spawning') {
        const allSpawned = this.queue.every(q => q.delay >= 999);
        if (!allSpawned) this.spawnT += dt;   // only count while something remains
        // spawn due enemies
        const spawned = [];
        for (let i = 0; i < this.queue.length; i++) {
          const q = this.queue[i];
          if (q.delay <= 0) {
            spawned.push(i);
            this.spawnEnemy(q.type);
            q.delay = 999;
          } else if (this.spawnT > q.delay) {
            q.delay = 0;
          }
        }
        // advance queue time
        for (const q of this.queue) if (q.delay < 999) q.delay -= dt;
        // wait until all queued & enemies cleared
        const alive = this.game.enemies.filter(e => e.alive).length;
        if (allSpawned && alive === 0) {
          this.state = 'done';
        }
      }

      if (this.state === 'done') {
        this.state = 'clearing';   // guard against re-entry
        this.onWaveCleared();
      }
    }

    updateBossWave(dt) {
      if (!this.bossActive) {
        this.spawnT += dt;
        if (this.spawnT > 1.6) {
          this.bossActive = true;
          // the beast PLUMMETS in from above (crash-landing entrance)
          const boss = new Game.Boss.HellBeast(this.game, Game.World.WORLD_W / 2 + 200, Game.World.FLOOR_Y - 440);
          boss.entering = true;
          this.game.boss = boss;
          Game.Fx.flash('#ff3300', 0.3, 0.3);
          Game.Audio.play('bossRoar');
        }
        return;
      }
      const boss = this.game.boss;
      if (!boss || !boss.alive) {
        this.state = 'done';
      }
    }

    onWaveCleared() {
      // heal reward
      this.game.player.heal(18);
      this.game.player.fury = Math.min(this.game.player.maxFury, this.game.player.fury + 20);
      const next = this.wave + 1;
      if (next > this.bossWave) {
        this.finished = true;
        this.game.victory();
        return;
      }
      this.spawnT = 0;
      this.beginWave(next);
    }

    spawnEnemy(type) {
      const g = this.game;
      this.spawnedCount = (this.spawnedCount || 0) + 1;
      const side = Math.random() > 0.5 ? 1 : -1;
      const x = g.player.x + side * U.rand(420, 560);
      const cx = U.clamp(x, 60, Game.World.WORLD_W - 60);
      let e = null;
      switch (type) {
        case 'wraith': e = new Game.Enemy.Wraith(g, cx, Game.World.FLOOR_Y - 4); break;
        case 'hound': e = new Game.Enemy.Hellhound(g, cx, Game.World.FLOOR_Y); break;
        case 'skull': e = new Game.Enemy.FireSkull(g, cx, Game.World.FLOOR_Y - 6); break;
        case 'demon': e = new Game.Enemy.Demon(g, cx, Game.World.FLOOR_Y); break;
        case 'angel': e = new Game.Enemy.Angel(g, cx, Game.World.FLOOR_Y - 8); break;
        case 'ghoul': e = new Game.Enemy.Ghoul(g, cx, Game.World.FLOOR_Y); break;
      }
      if (e) {
        g.enemies.push(e);
        // spawn smoke
        Game.Fx.ghost(cx, Game.World.FLOOR_Y - 40, '#2a2030', 12);
        Game.Fx.ring(cx, Game.World.FLOOR_Y - 6, '#7a5a8a', 12, 0.4, 3);
      }
    }

    onKilled(e) {
      this.killed++;
      this.totalKills++;
    }
  }

  Game.Waves = Waves;
})();

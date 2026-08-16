/* ============================================================
   PENITENT BLADE — game/ui.js
   HUD sync (DOM), banners, cinematic titles, end screens
   ============================================================ */
'use strict';
(function () {
  const Game = window.Game;
  const U = Game.U;

  const $ = id => document.getElementById(id);

  class UI {
    constructor() {
      this.hudEl = $('hud');
      this.hpFill = $('hpFill');
      this.furyFill = $('furyFill');
      this.waveEl = $('hudWave');
      this.killsEl = $('hudKills');
      this.furyKey = $('furyKey');
      this.show = false;
      this.title = null;
      this.endScreen = null;
    }

    setVisible(v) {
      this.show = v;
      if (this.hudEl) this.hudEl.classList.toggle('hidden', !v);
    }

    update(game, dt) {
      if (!game.player) return;
      const p = game.player;
      const hpPct = U.clamp(p.hp / p.maxHp, 0, 1) * 100;
      const fyPct = U.clamp(p.fury / p.maxFury, 0, 1) * 100;
      this.hpFill.style.width = hpPct + '%';
      this.furyFill.style.width = fyPct + '%';
      // fury-full glow + L-key indicator
      const furyReady = p.fury >= p.maxFury;
      this.furyFill.classList.toggle('full', furyReady);
      if (this.furyKey) this.furyKey.classList.toggle('ready', furyReady);
      // one-shot audio cue when the meter first fills
      if (furyReady && !p._furyCued) { p._furyCued = true; Game.Audio.play('furyReady'); }
      else if (!furyReady) p._furyCued = false;
      if (game.waves) {
        this.waveEl.textContent = '第 ' + game.waves.roman(game.waves.wave) + ' 波';
        this.killsEl.textContent = '击杀 ' + game.waves.totalKills;
      }
      if (this.title) {
        this.title.t += dt;
        if (this.title.t >= this.title.dur) this.title = null;
      }
      if (this.endScreen) this.endScreen.t += dt;
    }

    showTitle(text, sub, dur, kind) {
      this.title = { text, sub, t: 0, dur: dur || 1.6, kind: kind || 'default' };
    }

    showEnd(type, kills, wave) {
      this.endScreen = { type, t: 0, kills, wave };
    }

    /* ---------- canvas drawing (screen space) ---------- */
    draw(ctx, game, w, h) {
      // visible build marker (hard-refresh check)
      ctx.textAlign = 'left';
      ctx.font = '10px monospace';
      ctx.fillStyle = 'rgba(200,180,140,0.4)';
      ctx.fillText('BUILD-20240813B-FULLCOLUMN', 8, h - 8);

      // boss health bar (top center, carved gilded frame)
      if (game.boss && game.boss.alive && game.state === 'playing') {
        const b = game.boss;
        const bw = 460, bx = w / 2 - bw / 2, by = 76;
        ctx.textAlign = 'center';
        ctx.font = '13px "Noto Serif SC", "Source Han Serif SC", "Microsoft YaHei", "SimHei", "STZhongsong", "SimSun", Georgia, serif';
        ctx.fillStyle = '#e8c877';
        ctx.shadowColor = 'rgba(216,154,74,0.8)';
        ctx.shadowBlur = 8;
        ctx.fillText('深渊巨兽', w / 2, by - 10);
        ctx.shadowBlur = 0;
        // gilded frame
        ctx.fillStyle = 'rgba(8,6,10,0.85)';
        ctx.fillRect(bx - 4, by - 4, bw + 8, 23);
        ctx.strokeStyle = 'rgba(201,160,60,0.65)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(bx - 4, by - 4, bw + 8, 23);
        // boss name plate gem on the left
        ctx.save();
        ctx.translate(bx - 16, by + 6);
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = '#5a1010';
        ctx.fillRect(-5, -5, 10, 10);
        ctx.strokeStyle = 'rgba(224,85,58,0.8)';
        ctx.strokeRect(-5, -5, 10, 10);
        ctx.restore();
        // inner trough
        ctx.fillStyle = 'rgba(10,8,6,0.9)';
        ctx.fillRect(bx, by, bw, 15);
        const pct = U.clamp(b.hp / b.maxHp, 0, 1);
        const hg = ctx.createLinearGradient(0, by, 0, by + 15);
        hg.addColorStop(0, pct > 0.5 ? '#e0553a' : '#ff7040');
        hg.addColorStop(1, pct > 0.5 ? '#5e0d08' : '#8e1a10');
        ctx.fillStyle = hg;
        ctx.fillRect(bx, by, bw * pct, 15);
        // glass highlight
        ctx.fillStyle = 'rgba(255,255,255,0.14)';
        ctx.fillRect(bx, by, bw * pct, 4);
        ctx.strokeStyle = 'rgba(180,140,80,0.55)';
        ctx.strokeRect(bx, by, bw, 15);
        ctx.font = '12px "Noto Serif SC", "Source Han Serif SC", "Microsoft YaHei", "SimHei", "STZhongsong", "SimSun", Georgia, serif';
        ctx.fillStyle = '#f0dfae';
        ctx.fillText(Math.max(0, Math.ceil(b.hp)) + ' / ' + b.maxHp, w / 2, by + 12);
      }

      // first-wave tutorial hint (bottom)
      if (game.waves && game.waves.wave === 1 && game.time < 9 && game.state === 'playing') {
        ctx.textAlign = 'center';
        ctx.font = '14px "Noto Serif SC", "Source Han Serif SC", "Microsoft YaHei", "SimHei", "STZhongsong", "SimSun", Georgia, serif';
        ctx.fillStyle = 'rgba(232,217,176,0.85)';
        ctx.fillText('J 攻击 · K 重击 · Shift 闪避 · S 格挡（刚按下 0.15s 内挡到 = 完美弹反）', w / 2, h - 46);
      }

      // hit combo counter (right side, when active)
      if (game.player && game.player.comboCount >= 2 && game.state === 'playing') {
        const cc = game.player.comboCount;
        ctx.textAlign = 'right';
        ctx.font = '700 26px "Noto Serif SC", "Source Han Serif SC", "Microsoft YaHei", "SimHei", "STZhongsong", "SimSun", Georgia, serif';
        ctx.fillStyle = cc >= 10 ? '#ffd98a' : '#e8d9b0';
        ctx.shadowColor = 'rgba(255,180,80,0.6)';
        ctx.shadowBlur = 8;
        ctx.fillText('连击 x' + cc, w - 26, 96);
        ctx.shadowBlur = 0;
      }

      // fury-ready prompt
      if (game.player && game.player.fury >= game.player.maxFury && game.state === 'playing') {
        const t = game.time;
        ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 5);
        ctx.textAlign = 'center';
        ctx.font = '15px "Noto Serif SC", "Source Han Serif SC", "Microsoft YaHei", "SimHei", "STZhongsong", "SimSun", Georgia, serif';
        ctx.fillStyle = '#ffd98a';
        ctx.fillText('怒气已满 — 按 L 释放「深渊狂怒」', w / 2, 108);
        ctx.globalAlpha = 1;
      }

      this.drawTitle(ctx, w, h);
      this.drawEnd(ctx, w, h);
    }

    drawTitle(ctx, w, h) {
      if (!this.title) return;
      const t = this.title.t / this.title.dur;
      const inT = U.clamp(t * 4, 0, 1);
      const outT = U.clamp((1 - t) * 4, 0, 1);
      const a = Math.min(inT, outT);
      if (a <= 0) return;

      const barH = 90 * a;
      ctx.fillStyle = 'rgba(0,0,0,0.88)';
      ctx.fillRect(0, 0, w, barH);
      ctx.fillRect(0, h - barH, w, barH);
      ctx.fillStyle = 'rgba(180,140,80,0.5)';
      ctx.fillRect(0, barH, w, 1);
      ctx.fillRect(0, h - barH - 1, w, 1);

      const scale = 1 + (1 - inT) * 0.35;
      ctx.save();
      ctx.translate(w / 2, h / 2 - 10);
      ctx.scale(scale, scale);
      ctx.globalAlpha = a;
      const isBoss = this.title.kind === 'boss';
      ctx.font = '700 ' + (isBoss ? 62 : 46) + 'px "Noto Serif SC", "Source Han Serif SC", "Microsoft YaHei", "SimHei", "STZhongsong", "SimSun", Georgia, serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = isBoss ? 'rgba(255,80,30,0.9)' : 'rgba(216,154,74,0.9)';
      ctx.shadowBlur = 30;
      ctx.fillStyle = isBoss ? '#ffd9c0' : '#f0dfae';
      ctx.fillText(this.title.text, 0, 0);
      ctx.shadowBlur = 0;
      if (this.title.sub) {
        ctx.font = 'italic 16px "Noto Serif SC", "Source Han Serif SC", "Microsoft YaHei", "SimHei", "STZhongsong", "SimSun", Georgia, serif';
        ctx.fillStyle = '#9a8462';
        ctx.globalAlpha = a * 0.9;
        ctx.fillText(this.title.sub, 0, 46);
      }
      ctx.restore();

      if (isBoss) {
        ctx.fillStyle = 'rgba(255,40,10,' + (0.25 * a) + ')';
        ctx.fillRect(0, 0, w, 4);
      }
    }

    drawEnd(ctx, w, h) {
      const es = this.endScreen;
      if (!es) return;
      const t = es.t;
      const a = U.clamp(t / 1.2, 0, 1);
      ctx.fillStyle = 'rgba(0,0,0,' + (a * 0.92) + ')';
      ctx.fillRect(0, 0, w, h);

      if (es.type === 'victory') {
        const s = 1 + Math.max(0, 0.4 - t) * 2;
        ctx.save();
        ctx.translate(w / 2, h / 2 - 60);
        ctx.scale(s, s);
        ctx.globalAlpha = a;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '700 74px "Noto Serif SC", "Source Han Serif SC", "Microsoft YaHei", "SimHei", "STZhongsong", "SimSun", Georgia, serif';
        ctx.shadowColor = 'rgba(216,190,120,1)';
        ctx.shadowBlur = 40;
        ctx.fillStyle = '#f4e3b2';
        ctx.fillText('胜利', 0, 0);
        ctx.shadowBlur = 0;
        ctx.font = 'italic 20px "Noto Serif SC", "Source Han Serif SC", "Microsoft YaHei", "SimHei", "STZhongsong", "SimSun", Georgia, serif';
        ctx.fillStyle = '#b49a6a';
        ctx.fillText('巨兽化为灰烬，竞技场重归寂静。', 0, 60);
        ctx.font = '15px "Noto Serif SC", "Source Han Serif SC", "Microsoft YaHei", "SimHei", "STZhongsong", "SimSun", Georgia, serif';
        ctx.fillStyle = '#8a7658';
        ctx.fillText('历经 ' + es.wave + ' 波，共击杀 ' + es.kills + ' 名敌人', 0, 100);
        ctx.restore();
      } else {
        ctx.save();
        ctx.translate(w / 2, h / 2 - 60);
        ctx.globalAlpha = a;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '700 74px "Noto Serif SC", "Source Han Serif SC", "Microsoft YaHei", "SimHei", "STZhongsong", "SimSun", Georgia, serif';
        ctx.shadowColor = 'rgba(255,40,20,0.9)';
        ctx.shadowBlur = 40;
        ctx.fillStyle = '#e0553a';
        ctx.fillText('你已陨落', 0, 0);
        ctx.shadowBlur = 0;
        ctx.font = 'italic 20px "Noto Serif SC", "Source Han Serif SC", "Microsoft YaHei", "SimHei", "STZhongsong", "SimSun", Georgia, serif';
        ctx.fillStyle = '#9a6a5a';
        ctx.fillText('灰烬又夺走了一个灵魂……', 0, 60);
        ctx.restore();
      }

      if (t > 1.6) {
        ctx.globalAlpha = 0.5 + 0.3 * Math.sin(t * 3);
        ctx.textAlign = 'center';
        ctx.font = '14px "Noto Serif SC", "Source Han Serif SC", "Microsoft YaHei", "SimHei", "STZhongsong", "SimSun", Georgia, serif';
        ctx.fillStyle = '#c8b090';
        ctx.fillText('按 回车键 再次起身', w / 2, h - 120);
      }
    }
  }

  Game.UI = UI;
})();

/* ============================================================
 * hud.js — HUD / 菜单 / 小地图 / 播报 / 结算
 * ============================================================ */
'use strict';

const HUD = {
  el: {},
  _init: false,

  init() {
    if (this._init) return;
    this._init = true;
    const $ = id => document.getElementById(id);
    this.el = {
      menu: $('menu'), drop: $('drop-screen'), hud: $('hud'), end: $('end-screen'),
      pause: $('pause-overlay'),
      crosshair: $('crosshair'), chHit: $('ch-hit'), hitmark: $('hitmark'),
      hpFill: $('hp-fill'), hpText: $('hp-text'), shieldFill: $('shield-fill'), shieldText: $('shield-text'),
      wpnName: $('wpn-name'), wpnAttach: $('wpn-attach'), ammoMag: $('ammo-mag'), ammoRes: $('ammo-res'), ammoType: $('ammo-type'), ammoText: $('ammo-text'),
      wpnSlot1: $('wpn-slot-1'), wpnSlot2: $('wpn-slot-2'),
      legendName: $('legend-name'), skillFill: $('skill-fill'), skillKey: $('skill-key'),
      killFeed: $('kill-feed'), announce: $('announce'), centerMsg: $('center-msg'),
      dmgVignette: $('damage-vignette'),
      zoneLabel: $('zone-label'), zoneFill: $('zone-fill'), zoneTime: $('zone-time'),
      alive: $('alive-count'), kills: $('kill-count'), rankInfo: $('rank-info'),
      minimap: $('minimap'), minimapWrap: $('minimap-wrap'),
      dropHint: $('drop-hint'), dropAlt: $('drop-alt'), dropSpeed: $('drop-speed'),
      lootHint: $('loot-hint'), weaponCompare: $('weapon-compare'),
      endTitle: $('end-title'), endSub: $('end-sub'),
      endKills: $('end-kills'), endDmg: $('end-dmg'), endRank: $('end-rank'), endTime: $('end-time'),
    };
    this._buildLegendCards();
    document.querySelectorAll('.size-btn').forEach(b => {
      b.addEventListener('click', () => {
        document.querySelectorAll('.size-btn').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        AudioMgr.uiClick();
      });
    });
    $('btn-start').addEventListener('click', () => this.startGame());
    $('btn-replay').addEventListener('click', () => {
      AudioMgr.uiClick();
      G.br.reset();
      this.startGame();
    });
    $('btn-menu').addEventListener('click', () => {
      AudioMgr.uiClick();
      G.br.reset();
      this.showMenu();
    });
    $('btn-resume').addEventListener('click', () => { this.hidePause(); Input.lock(); AudioMgr.uiClick(); });
    $('btn-quit').addEventListener('click', () => { G.br.reset(); this.showMenu(); });
    // 点击游戏区域恢复锁定
    document.getElementById('game-root').addEventListener('click', () => {
      if (G && G.br && ['playing', 'drop', 'dropship'].includes(G.br.state) && !Input.locked) {
        Input.lock();
        this.hidePause();
      }
    });
  },

  _buildLegendCards() {
    const wrap = document.getElementById('legend-select');
    wrap.innerHTML = '';
    const order = ['wraith', 'bloodhound', 'lifeline'];
    this._legendSel = 'wraith';
    order.forEach(id => {
      const L = LEGENDS[id];
      const card = document.createElement('div');
      card.className = 'legend-card' + (id === this._legendSel ? ' selected' : '');
      card.innerHTML = `<div class="lc-icon">${L.icon}</div>
        <div class="lc-name">${L.name}</div>
        <div class="lc-passive">${L.passive}</div>`;
      card.addEventListener('click', () => {
        document.querySelectorAll('.legend-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        this._legendSel = id;
        AudioMgr.uiClick();
      });
      wrap.appendChild(card);
    });
  },

  startGame() {
    AudioMgr.resume();
    const size = parseInt(document.querySelector('.size-btn.active').dataset.size, 10) || 30;
    G.br.startMatch(size, this._legendSel);
    Input.lock();
  },

  /* ---------- 屏幕切换 ---------- */

  showMenu() {
    this.el.menu.classList.add('active');
    this.el.drop.classList.remove('active');
    this.el.hud.classList.add('hidden');
    this.el.end.classList.remove('active');
    this.hidePause();
  },
  showHUD() {
    this.el.menu.classList.remove('active');
    this.el.drop.classList.remove('active');
    this.el.hud.classList.remove('hidden');
  },
  showDropScreen() {
    this.el.drop.classList.add('active');
    this.el.dropHint.innerHTML = '按 <b>[F]</b> 跳伞';
    this.el.dropAlt.textContent = '高度 300m';
    this.el.dropSpeed.textContent = '速度 0';
  },
  hideDropScreen() { this.el.drop.classList.remove('active'); },
  showPause() { this.el.pause.classList.remove('hidden'); },
  hidePause() { this.el.pause.classList.add('hidden'); },

  showEndScreen(rank, kills, dmg, time, win) {
    this.el.endTitle.textContent = win ? '冠军' : (rank === 2 ? '第二名' : '被淘汰');
    this.el.endSub.textContent = win ? '你成为了 Apex 冠军！' : `你在 ${rank} 名被淘汰`;
    this.el.endKills.textContent = kills;
    this.el.endDmg.textContent = dmg;
    this.el.endRank.textContent = '#' + rank;
    this.el.endTime.textContent = U.fmtTime(time);
    this.el.end.classList.add('active');
    this.el.drop.classList.remove('active');
    this.el.hud.classList.add('hidden');
    Input.unlock();
  },

  reset() {
    this.el.killFeed.innerHTML = '';
    this.el.announce.classList.add('hidden');
    this.el.centerMsg.classList.add('hidden');
    this.el.dmgVignette.style.opacity = 0;
    this.el.lootHint.classList.add('hidden');
    this.el.weaponCompare.classList.add('hidden');
    this.el.chHit.classList.add('hidden');
    this.el.end.classList.remove('active');
    this._lastAlive = -1;
    document.querySelectorAll('.dmg-num').forEach(n => n.remove());
  },

  /* ---------- 文本提示 ---------- */

  announce(text, color) {
    const a = this.el.announce;
    a.textContent = text;
    a.style.color = color || '#ffb05c';
    a.classList.remove('hidden');
    clearTimeout(this._annT);
    this._annT = setTimeout(() => a.classList.add('hidden'), 2600);
  },

  centerMsg(text) {
    const c = this.el.centerMsg;
    c.textContent = text;
    c.classList.remove('hidden');
    clearTimeout(this._cmT);
    this._cmT = setTimeout(() => c.classList.add('hidden'), 4000);
  },

  toast(text, color) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = text;
    t.style.color = color || '#ffd75e';
    t.style.borderColor = (color || '#ffd75e') + '88';
    document.getElementById('game-root').appendChild(t);
    setTimeout(() => t.remove(), 3000);
  },

  zoneNote(text) {
    const t = document.createElement('div');
    t.className = 'zone-note';
    t.textContent = '⚠ ' + text;
    document.getElementById('game-root').appendChild(t);
    setTimeout(() => t.remove(), 3400);
  },

  killFeed(killer, killed, weapon) {
    const el = document.createElement('div');
    el.className = 'kf-item';
    el.innerHTML = `<span class="kf-killer">${killer}</span> 击杀了 <span class="kf-killed">${killed}</span> <span class="kf-weapon">(${weapon})</span>`;
    this.el.killFeed.appendChild(el);
    while (this.el.killFeed.children.length > 5) this.el.killFeed.firstChild.remove();
  },

  /* ---------- 战斗反馈 ---------- */

  playerHitFeedback(dmg, isHead, attacker) {
    // 命中标记
    const h = this.el.hitmark;
    h.classList.remove('hidden');
    clearTimeout(this._hmT);
    this._hmT = setTimeout(() => h.classList.add('hidden'), 160);
  },

  /** 3D 世界伤害数字 */
  spawnDamageNumber(worldPos, dmg, isHead, isPlayer) {
    const G = window.G;
    if (!G) return;
    const v = worldPos.clone().project(G.camera);
    if (v.z > 1) return;
    const x = (v.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-v.y * 0.5 + 0.5) * window.innerHeight;
    const el = document.createElement('div');
    el.className = 'dmg-num ' + (isHead ? 'head' : isPlayer ? 'normal' : 'crit');
    el.textContent = Math.round(dmg);
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    document.getElementById('game-root').appendChild(el);
    setTimeout(() => el.remove(), 850);
  },

  flashZoneWarning() {
    this.el.dmgVignette.style.opacity = 0.35;
    clearTimeout(this._zT);
    this._zT = setTimeout(() => this.el.dmgVignette.style.opacity = 0, 300);
  },

  updateHealProgress(p) {
    if (p == null) {
      this._healFill = null;
      const e = document.getElementById('heal-progress');
      if (e) e.remove();
      return;
    }
    let e = document.getElementById('heal-progress');
    if (!e) {
      e = document.createElement('div');
      e.id = 'heal-progress';
      e.style.cssText = 'position:absolute;bottom:34%;left:50%;transform:translateX(-50%);width:220px;height:8px;background:#ffffff22;border-radius:4px;z-index:10;overflow:hidden;';
      e.innerHTML = '<div style="height:100%;width:0%;background:linear-gradient(90deg,#7ed66a,#4ad66d);"></div>';
      document.getElementById('game-root').appendChild(e);
    }
    e.firstChild.style.width = (p * 100).toFixed(0) + '%';
  },

  flashReloadHint() {
    this.el.ammoText.classList.add('low');
    clearTimeout(this._rlT);
    this._rlT = setTimeout(() => this.el.ammoText.classList.remove('low'), 400);
  },

  /* ---------- 每帧更新 ---------- */

  update(dt, now) {
    if (G.br.state !== 'playing' && G.br.state !== 'dead') return;
    const p = G.player;
    const w = p.currentWeapon();

    // 生命 / 护甲
    this.el.hpFill.style.transform = `scaleX(${p.hp / 100})`;
    this.el.hpText.textContent = Math.ceil(p.hp);
    const maxSh = p.maxShield();
    this.el.shieldFill.style.transform = `scaleX(${maxSh ? p.shield / maxSh : 0})`;
    this.el.shieldText.textContent = Math.ceil(p.shield);

    // 武器
    if (w) {
      this.el.wpnName.textContent = w.def.name;
      this.el.wpnAttach.textContent = w.displayName === w.def.name ? (w.def.desc || '') : w.att.sight.name + (w.att.mag ? ' · ' + w.att.mag.name : '') + (w.att.stock ? ' · ' + w.att.stock.name : '') + (w.att.choke ? ' · ' + w.att.choke.name : '');
      this.el.ammoMag.textContent = w.reloading ? '…' : w.mag;
      this.el.ammoRes.textContent = w.reserve;
      this.el.ammoType.textContent = (AMMO_TYPES[w.def.ammo] ? AMMO_TYPES[w.def.ammo].name : '') + (w.reloading ? ' · 换弹中' : '');
      this.el.ammoText.classList.toggle('low', w.mag <= 0 && w.reserve > 0);
    } else {
      this.el.wpnName.textContent = '无武器';
      this.el.wpnAttach.textContent = '—';
      this.el.ammoMag.textContent = '0';
      this.el.ammoRes.textContent = '0';
      this.el.ammoType.textContent = '按 E 拾取武器';
    }
    this.el.wpnSlot1.classList.toggle('used', !!p.weapons[0]);
    this.el.wpnSlot2.classList.toggle('used', !!p.weapons[1]);
    this.el.wpnSlot1.style.opacity = p.slot === 0 ? 1 : 0.5;
    this.el.wpnSlot2.style.opacity = p.slot === 1 ? 1 : 0.5;

    // 传奇技能
    const L = LEGENDS[p.legend];
    this.el.legendName.textContent = L.name;
    const cdFrac = p.skillCd > 0 ? 1 - p.skillCd / L.cd : 1;
    this.el.skillFill.style.transform = `scaleX(${cdFrac})`;
    this.el.skillFill.style.background = p.skillCd > 0 ? 'linear-gradient(90deg,#666,#999)' : '';

    // 准星扩散
    const spread = w ? w.spread * w.spreadMul : 0.012;
    const px = 6 + Math.min(26, spread * 900);
    const ch = this.el.crosshair;
    ch.querySelector('.ch-t').style.top = (-px) + 'px';
    ch.querySelector('.ch-b').style.top = (px - 1) + 'px';
    ch.querySelector('.ch-l').style.left = (-px) + 'px';
    ch.querySelector('.ch-r').style.left = (px - 1) + 'px';

    // 受击红晕
    const f = p.dmgFlash;
    this.el.dmgVignette.style.opacity = f * 0.7;

    // 顶部信息
    const alive = G.br.alive;
    if (alive !== this._lastAlive) {
      this._lastAlive = alive;
      this.el.alive.textContent = alive;
    }
    this.el.kills.textContent = p.kills;
    this.el.rankInfo.textContent = '#' + Math.max(1, alive);

    // 小地图
    this._drawMinimap(now);

    // 拾取提示
    this._updateLootHint();
  },

  /* ---------- 拾取提示 ---------- */

  _updateLootHint() {
    const p = G.player;
    const near = G.loot.nearest(p.pos.x, p.pos.z, 3);
    const h = this.el.lootHint, c = this.el.weaponCompare;
    if (!near || p.healing || p.dead) { h.classList.add('hidden'); c.classList.add('hidden'); return; }
    if (near.type === 'box') {
      h.classList.remove('hidden');
      h.innerHTML = `按 [E] 打开 ${near.data ? '死亡箱' : '死亡箱'}`;
    } else {
      h.classList.remove('hidden');
      h.innerHTML = `按 [E] 拾取 <b>${near.name}</b>`;
    }
    // 武器对比
    if (near.type === 'weapon') {
      const cur = p.currentWeapon();
      if (cur && cur !== near.data) {
        const nd = near.data;
        c.classList.remove('hidden');
        const curDps = (cur.dmg * cur.def.fireRate).toFixed(0);
        const newDps = (nd.dmg * nd.def.fireRate * (nd.pellets > 1 ? 1.6 : 1)).toFixed(0);
        c.innerHTML = `<b>${nd.def.name}</b> 伤害 ${nd.dmg.toFixed(0)} · DPS ${newDps} &nbsp;|&nbsp; 当前 ${cur.def.name} ${curDps} DPS`;
      } else { c.classList.add('hidden'); }
    } else { c.classList.add('hidden'); }
  },

  /* ---------- 小地图 ---------- */

  _drawMinimap(now) {
    const cv = this.el.minimap;
    const g = cv.getContext('2d');
    const W = 180, H = 180;
    const p = G.player;
    g.clearRect(0, 0, W, H);
    // 背景网格
    g.fillStyle = '#10141a';
    g.fillRect(0, 0, W, H);
    g.strokeStyle = '#1c2330';
    g.lineWidth = 1;
    for (let i = 0; i <= 6; i++) {
      g.beginPath(); g.moveTo(i * 30, 0); g.lineTo(i * 30, H); g.stroke();
      g.beginPath(); g.moveTo(0, i * 30); g.lineTo(W, i * 30); g.stroke();
    }
    // 世界坐标 → 小地图（玩家居中，比例尺）
    const scale = 0.16; // px per meter
    const toMM = (x, z) => [W / 2 + (x - p.pos.x) * scale, H / 2 + (z - p.pos.z) * scale];

    // 安全区
    if (G.br.zone) {
      const z = G.br.zone;
      const [cx, cy] = toMM(z.cx, z.cz);
      g.strokeStyle = '#4fc3f7';
      g.lineWidth = 1.5;
      g.beginPath(); g.arc(cx, cy, z.r * scale, 0, Math.PI * 2); g.stroke();
      g.fillStyle = 'rgba(79,195,247,0.08)';
      g.fill();
    }

    // 战利品（近处小点）
    g.fillStyle = '#ffd75e';
    for (const it of G.loot.items) {
      const [mx, my] = toMM(it.x, it.z);
      if (mx < -5 || mx > W + 5 || my < -5 || my > H + 5) continue;
      g.fillRect(mx - 1, my - 1, 2, 2);
    }

    // 敌人（可见/被扫描）
    for (const e of G.enemies) {
      if (e.dead || e.dropping) continue;
      const d = U.dist(e.pos.x, e.pos.z, p.pos.x, p.pos.z);
      if (d > 260 && e.scanned <= 0) continue;
      const [mx, my] = toMM(e.pos.x, e.pos.z);
      if (mx < -5 || mx > W + 5 || my < -5 || my > H + 5) continue;
      g.fillStyle = e.scanned > 0 ? '#ff5533' : '#c0392b';
      g.beginPath(); g.arc(mx, my, 3, 0, Math.PI * 2); g.fill();
    }

    // 玩家（中心 + 朝向）
    g.fillStyle = '#ffffff';
    g.beginPath(); g.arc(W / 2, H / 2, 3, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#ffffff';
    g.lineWidth = 1.5;
    const fx = Math.sin(p.yaw) * 9, fz = Math.cos(p.yaw) * 9;
    g.beginPath(); g.moveTo(W / 2, H / 2); g.lineTo(W / 2 - fx, H / 2 - fz); g.stroke();
  },

  /* ---------- 跳伞信息 ---------- */

  updateDropInfo(alt, speed) {
    this.el.dropAlt.textContent = '高度 ' + Math.max(0, Math.round(alt)) + 'm';
    this.el.dropSpeed.textContent = '速度 ' + Math.round(speed) + ' km/h';
  },

  /* ---------- 圈 ---------- */

  updateZone(z, now) {
    if (!z) return;
    const ph = G.br.zonePhase;
    const total = ph >= 0 && ZONE_PHASES[ph + 1] ? (z.stage === 'wait' ? ZONE_PHASES[ph + 1].wait : ZONE_PHASES[ph + 1].shrink) : 20;
    const remain = Math.max(0, z.t);
    this.el.zoneFill.style.transform = `scaleX(${U.clamp01(remain / total)})`;
    this.el.zoneTime.textContent = z.stage === 'done' ? '—' : Math.ceil(remain) + 's';
    this.el.zoneLabel.textContent = z.stage === 'wait' ? '安全区 · 等待收缩' : z.stage === 'shrink' ? '安全区 · 收缩中' : '最终圈';
    // 玩家是否在圈外
    const d = U.dist(G.player.pos.x, G.player.pos.z, z.cx, z.cz);
    this.el.zoneTime.style.color = d > z.r ? '#ff5533' : '#dfe5ec';
  },
};

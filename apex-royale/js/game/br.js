/* ============================================================
 * br.js — 大逃杀管理器
 * 状态机：飞机 → 跳伞 → 战斗 → 缩圈 → 结算
 * ============================================================ */
'use strict';

const ZONE_PHASES = [
  { wait: 40, shrink: 60, r: 330, dmg: 1 },
  { wait: 35, shrink: 50, r: 230, dmg: 2 },
  { wait: 30, shrink: 40, r: 140, dmg: 3 },
  { wait: 25, shrink: 35, r: 70,  dmg: 5 },
  { wait: 20, shrink: 30, r: 30,  dmg: 8 },
  { wait: 15, shrink: 20, r: 18,  dmg: 12 },
];

class BattleRoyale {
  constructor(scene, camera, renderer) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.G = null;
    this.state = 'menu';       // menu | dropship | drop | playing | dead | end
    this.enemies = [];
    this.nades = [];
    this.killFeed = [];
    this.time = 0;
    this.matchTime = 0;
    this.alive = 0;
    this.playerCount = 30;
    this.difficulty = 1;
    this.rank = -1;
    this.kills = 0;
    this.damageDealt = 0;
    this.zone = null;          // {phase, cx, cz, r, nextCx, nextCz, nextR, t, stage, dmg}
    this.zonePhase = -1;
    this.zoneT = 0;
    this.shake = 0;
    this.deaths = 0;
    this._plane = null;
    this._planeDir = 1;
    this._buildZoneMesh();
    this._buildPlaneMesh();
  }

  _buildZoneMesh() {
    // 安全区：半透明蓝色圆盘 + 边框
    const ringGeo = new THREE.RingGeometry(0.9, 1, 48);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x3aa0e0, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false });
    this.zoneRing = new THREE.Mesh(ringGeo, ringMat);
    this.zoneRing.rotation.x = -Math.PI / 2;
    this.zoneRing.visible = false;
    this.scene.add(this.zoneRing);
    const lineGeo = new THREE.BufferGeometry();
    const pts = [];
    for (let i = 0; i <= 64; i++) { const a = i / 64 * Math.PI * 2; pts.push(Math.cos(a), 0, Math.sin(a)); }
    lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.zoneLine = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0x4fc3f7, transparent: true, opacity: 0.9 }));
    this.zoneLine.visible = false;
    this.scene.add(this.zoneLine);
  }

  _buildPlaneMesh() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 30, 8), new THREE.MeshLambertMaterial({ color: 0x4a5560 }));
    body.rotation.z = Math.PI / 2;
    const nose = new THREE.Mesh(new THREE.ConeGeometry(4, 10, 8), new THREE.MeshLambertMaterial({ color: 0x5a6570 }));
    nose.rotation.z = -Math.PI / 2;
    nose.position.x = -20;
    const wing1 = new THREE.Mesh(new THREE.BoxGeometry(4, 1, 18), new THREE.MeshLambertMaterial({ color: 0x39424c }));
    wing1.position.set(5, 0, 0); // 沿 z 轴的翅膀
    const tail = new THREE.Mesh(new THREE.BoxGeometry(2, 4, 2), new THREE.MeshLambertMaterial({ color: 0x39424c }));
    tail.position.set(14, 4, 0);
    g.add(body, nose, wing1, tail);
    this.scene.add(g);
    this._plane = g;
  }

  /* ============ 对局开始 ============ */

  startMatch(playerCount, legendId) {
    const G = this.G;
    this.playerCount = playerCount;
    this.alive = playerCount;
    // 清理场景中所有残留敌人 group（防止旧局残留导致"地图上出现孤立模型"；先收集再移除，避免遍历中修改）
    const stale = [];
    this.scene.traverse(o => { if (o._isEnemyGroup) stale.push(o); });
    for (const o of stale) this.scene.remove(o);
    this.enemies.length = 0;   // 保持 G.enemies 引用同一数组
    this.nades.length = 0;
    this.time = 0;
    this.matchTime = 0;
    this.rank = -1;
    this.kills = 0;
    this.damageDealt = 0;
    this.zonePhase = -1;
    this.deaths = 0;

    G.player.legend = legendId;
    G.player.dead = false;
    G.player.hp = 100;
    G.player.shield = 0;
    G.player.armorLv = 0;
    G.player.kills = 0;
    G.player.damageDealt = 0;
    G.player.skillCd = 0;
    G.player.weapons = [null, null];
    G.player.slot = 0;
    G.player.healCount = { syringe: 1, medkit: 0, cell: 1, battery: 0, phoenix: 0 };
    G.player.nadeCount = { frag: 1, arc: 0, thermite: 0 };
    G.player.phaseT = 0; G.player.scanT = 0;
    G.player.healing = null;
    G.player._model.group.visible = false;   // 空手/跳伞阶段不显示枪械模型
    G.player.legend === 'lifeline' && G.player._spawnDrone();

    // 战利品铺货
    G.loot.scatter();

    // 生成敌人
    for (let i = 0; i < playerCount - 1; i++) {
      const e = new Enemy(G.scene, G.world, this, i);
      this.enemies.push(e);
    }

    // 飞机阶段：飞机沿 X 轴飞过
    this.state = 'dropship';
    this._planeDir = Math.random() > 0.5 ? 1 : -1;
    this._planeX = -this._planeDir * (G.world.HALF + 120);
    this._planeAlt = 300;
    this._planeZ = U.rand(-G.world.HALF * 0.4, G.world.HALF * 0.4);
    this._plane.visible = true;
    this._plane.position.set(this._planeX, this._planeAlt, this._planeZ);
    this._plane.rotation.y = this._planeDir > 0 ? Math.PI / 2 : -Math.PI / 2;

    // 玩家站在飞机门边
    G.player.pos.set(this._planeX, this._planeAlt + 1.5, this._planeZ);
    G.player.vel.set(0, 0, 0);
    G.player.pitch = -0.5;
    G.player.yaw = this._planeDir > 0 ? -Math.PI / 2 : Math.PI / 2;

    HUD.reset();
    HUD.showHUD();
    HUD.showDropScreen();
    HUD.announce('准备跳伞');
  }

  /* ============ 状态更新 ============ */

  update(dt, now, input) {
    const G = this.G;
    this.time = now;
    if (this.state === 'menu' || this.state === 'end') return;

    // 手雷物理
    this._updateNades(dt);

    if (this.state === 'dropship') {
      this._planeX += this._planeDir * 62 * dt;
      this._plane.position.x = this._planeX;
      G.player.pos.set(this._planeX, this._planeAlt + 1.5, this._planeZ);
      G.player.vel.set(this._planeDir * 62, 0, 0);
      G.camera.position.copy(G.player.eyePos());
      // 敌人提前落地（不活动，仅落下就位）
      for (const e of this.enemies) e.updateLanding(dt);
      // 强制跳伞
      if (Math.abs(this._planeX) > G.world.HALF + 130) { this.startDrop(); }
      if (input.pressed('KeyF')) this.startDrop();
      return;
    }

    if (this.state === 'drop') {
      const res = G.player.updateDrop(dt, input);
      // 敌人提前落地（不活动）
      for (const e of this.enemies) e.updateLanding(dt);
      // 自由落体 + 开伞
      if (!this._parachute) {
        G.player.vel.y = -58 * (1 - res.dive * 0.25);
        G.player.pos.y += G.player.vel.y * dt;
        if (input.pressed('Space') || G.player.pos.y < 60) this._parachute = true;
      } else {
        G.player.pos.y -= 16 * dt;
        // 落地判定：地形高度 + 建筑/楼板顶（跳伞落在楼顶立即落地，不穿模）
        let groundY = G.world.heightAt(G.player.pos.x, G.player.pos.z);
        const px = G.player.pos.x, pz = G.player.pos.z;
        for (const c of G.world.colliders) {
          if (px > c.minX && px < c.maxX && pz > c.minZ && pz < c.maxZ && c.maxY > groundY && G.player.pos.y <= c.maxY) {
            groundY = c.maxY;
          }
        }
        if (G.player.pos.y <= groundY) {
          G.player.pos.y = groundY;
          G.player.vel.set(0, 0, 0);
          this.state = 'playing';
          this._onLanded();
          return;
        }
      }
      G.camera.position.copy(G.player.eyePos());
      HUD.updateDropInfo(G.player.pos.y, this._parachute ? 16 : Math.abs(G.player.vel.y));
      return;
    }

    // playing / dead
    this.matchTime += dt;
    this._updateZone(dt, now);
    if (this.state === 'playing') {
      this._updateEnemies(dt, now);
      // 防御：对局中敌人意外为空时自动补充（保证场上始终有敌人）
      if (this.enemies.length === 0 && this.matchTime > 5 && this.playerCount > 1) {
        console.warn('[br] 敌人为空，自动补充');
        for (let i = 0; i < this.playerCount - 1; i++) {
          const e = new Enemy(this.scene, this.world, this, this.deaths + i);
          this.enemies.push(e);
        }
        this._pullEnemiesToPlayer();
      }
    }
    this._updateShake(dt);
  }

  startDrop() {
    if (this.state !== 'dropship') return;
    this.state = 'drop';
    this._parachute = false;
    AudioMgr.play('gunshot.wav', { volume: 0.4, rate: 1.2 });
    HUD.hideDropScreen();
    HUD.centerMsg('自由落体！ 按 [空格] 开伞');
  }

  _onLanded() {
    const G = this.G;
    AudioMgr.play('impactGeneric_light_000.ogg', { volume: 0.9 });
    G.fx.dust(G.player.pos.x, G.player.pos.y, G.player.pos.z);
    G.fx.dust(G.player.pos.x + 1, G.player.pos.y, G.player.pos.z + 1);
    G.player.grounded = true;
    // 落地即给 P2020 保底
    if (!G.player.weapons[0]) {
      const w = new Weapon('p2020', {});
      G.player.equipWeapon(w, 0);
      G.player.healCount.syringe++;
    }
    this._startZone();
    this._pullEnemiesToPlayer();
    HUD.centerMsg('安全区开始收缩，快搜刮装备！');
    HUD.toast('按 [E] 拾取 · [1/2] 切枪 · [R] 换弹 · [Q] 技能 · [G] 手雷', '#ffd75e');
  }

  /** 玩家落地后，把部分敌人拉近到 150~300m，保证落地即能遭遇战斗 */
  _pullEnemiesToPlayer() {
    const G = this.G, p = G.player;
    const world = G.world;
    let pulled = 0;
    for (const e of this.enemies) {
      if (e.dead) continue;
      // 仍在空中的敌人直接落地
      if (e.dropping) {
        e.dropping = false;
        e.pos.y = world.heightAt(e.pos.x, e.pos.z);
      }
      if (Math.random() < 0.75 && pulled < 12) {
        const ang = Math.random() * Math.PI * 2;
        const rad = U.rand(150, 300);
        const tx = U.clamp(p.pos.x + Math.cos(ang) * rad, -world.HALF + 5, world.HALF - 5);
        const tz = U.clamp(p.pos.z + Math.sin(ang) * rad, -world.HALF + 5, world.HALF - 5);
        if (world.isWalkable(tx, tz)) {
          e.pos.set(tx, world.heightAt(tx, tz), tz);
          e.moveTarget = null;
          pulled++;
        }
      }
    }
    if (pulled > 0) HUD.toast('侦测到 ' + pulled + ' 名敌人信号', '#ff8a5a');
  }

  /* ============ 缩圈 ============ */

  _startZone() {
    this.zonePhase = 0;
    const ph = ZONE_PHASES[0];
    this.zone = { cx: 0, cz: 0, r: G.world.HALF * 1.06, nextCx: 0, nextCz: 0, nextR: ph.r, t: ph.wait, stage: 'wait', dmg: 0 };
    this.zoneT = 0;
  }

  _nextZone() {
    // 从当前圈生成下一圈（向随机偏移，半径按阶段）
    const ph = ZONE_PHASES[this.zonePhase];
    if (!ph) return;
    const z = this.zone;
    const ang = Math.random() * Math.PI * 2;
    const dist = Math.min(z.r * 0.7, 90);
    z.nextCx = U.clamp(z.cx + Math.cos(ang) * dist, -400, 400);
    z.nextCz = U.clamp(z.cz + Math.sin(ang) * dist, -400, 400);
    z.nextR = ph.r;
    z.stage = 'shrink';
    z.t = ph.shrink;
    z.dmg = ph.dmg;
    HUD.zoneNote('安全区正在收缩');
    AudioMgr.zoneWarn();
  }

  _updateZone(dt, now) {
    const z = this.zone;
    if (!z) return;
    const G = this.G;
    if (z.stage === 'wait') {
      z.t -= dt;
      if (z.t <= 0) this._nextZone();
    } else if (z.stage === 'shrink') {
      z.t -= dt;
      const k = U.clamp01(1 - z.t / ZONE_PHASES[this.zonePhase].shrink);
      z.cx = U.lerp(z.cx, z.nextCx, k);
      z.cz = U.lerp(z.cz, z.nextCz, k);
      z.r = U.lerp(z.r, z.nextR, k);
      if (z.t <= 0) {
        z.cx = z.nextCx; z.cz = z.nextCz; z.r = z.nextR;
        this.zonePhase++;
        const next = ZONE_PHASES[this.zonePhase];
        if (next) {
          z.stage = 'wait'; z.t = next.wait; z.dmg = 0;
          HUD.zoneNote('安全区已确定');
        } else {
          z.stage = 'done'; z.dmg = 12;
          HUD.zoneNote('最终圈！');
        }
      }
    } else if (z.stage === 'done') {
      // 最终圈不断缩小到 0
      z.r = Math.max(0, z.r - 2.5 * dt);
    }

    // 圈外伤害（玩家 + 敌人）
    if (this.state === 'playing') {
      const d = U.dist(G.player.pos.x, G.player.pos.z, z.cx, z.cz);
      if (d > z.r) {
        G.player.takeDamage(z.dmg * dt, null, false, true);   // silent：毒圈掉血无受击音效
        this._zoneTick = (this._zoneTick || 0) + dt;
        HUD.flashZoneWarning();   // 圈外仅红屏警示，无音效
      }
      // 敌人同样受毒圈伤害（silent：无受击音效）
      if (z.dmg > 0) {
        for (const e of this.enemies) {
          if (e.dead || e.dropping) continue;
          const de = U.dist(e.pos.x, e.pos.z, z.cx, z.cz);
          if (de > z.r) e.takeDamage(z.dmg * dt, null, false, this.time, true);
        }
      }
    }

    // 渲染
    this.zoneRing.position.set(z.cx, G.world.heightAt(z.cx, z.cz) + 0.4, z.cz);
    this.zoneRing.scale.set(z.r, z.r, 1);
    this.zoneLine.position.set(z.cx, G.world.heightAt(z.cx, z.cz) + 0.6, z.cz);
    this.zoneLine.scale.set(z.r, z.r, 1);
    this.zoneRing.visible = this.zoneLine.visible = true;

    HUD.updateZone(z, now);
  }

  /* ============ 敌人 ============ */

  _updateEnemies(dt, now) {
    for (const e of this.enemies) {
      if (e.dead) {
        // 尸体下沉
        if (e.deadBodyT !== undefined) {
          e.deadBodyT = (e.deadBodyT || 0) + dt;
          e.group.rotation.x = Math.min(1.5, e.deadBodyT * 2);
          e.group.position.y -= dt * 0.6;
        }
        continue;
      }
      e.update(dt, now, this.G);
    }
    // 清理死亡敌人（保留尸体动画期间）——原地过滤，保持 G.enemies 引用同一数组
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.dead && e.deadBodyT >= 2) {
        this.scene.remove(e.group);
        this.enemies.splice(i, 1);
      }
    }
  }

  scanEnemies() {
    // 血犬扫描：标记 60m 内敌人
    for (const e of this.enemies) {
      if (e.dead || e.dropping) continue;
      if (U.dist(e.pos.x, e.pos.z, this.G.player.pos.x, this.G.player.pos.z) < 60) e.scanned = 4.5;
    }
  }

  /* ============ 手雷 ============ */

  _updateNades(dt) {
    for (const n of this.nades) {
      if (!n.live) continue;
      n.fuse -= dt;
      n.vy -= 16 * dt;
      n.x += n.vx * dt; n.y += n.vy * dt; n.z += n.vz * dt;
      const gh = G.world.heightAt(n.x, n.z);
      if (n.y <= gh) {
        n.y = gh;
        if (Math.abs(n.vy) > 4) { n.vy = -n.vy * 0.4; n.vx *= 0.6; n.vz *= 0.6; }
        else { n.vy = 0; n.vx = 0; n.vz = 0; }
      }
      if (n.fuse <= 0) { n.live = false; this._explodeNade(n); }
    }
    this.nades = this.nades.filter(n => n.live);
  }

  _explodeNade(n) {
    const def = NADES[n.type];
    G.fx.explode(n.x, n.y, n.z, def.color, def.type === 'thermite' ? 0.8 : 1.2);
    AudioMgr.play('shotgun.wav', { volume: 0.9, rate: 0.6 });
    if (n.type === 'thermite') {
      // 燃烧区域：持续伤害由 zone 逻辑处理简化 → 直接范围灼烧
      const g = G.player;
      if (U.dist(n.x, n.z, g.pos.x, g.pos.z) < def.radius) g.takeDamage(def.dmg * 4, null, false);
      for (const e of this.enemies) {
        if (!e.dead && U.dist(n.x, n.z, e.pos.x, e.pos.z) < def.radius) e.takeDamage(def.dmg * 4, null, false, this.time);
      }
      return;
    }
    // 爆炸伤害（距离衰减）
    const dmgAt = (d) => d > def.radius ? 0 : def.dmg * (1 - d / def.radius);
    const g = G.player;
    if (this.state === 'playing' && !g.dead) {
      const d = U.dist(n.x, n.z, g.pos.x, g.pos.z);
      const dd = dmgAt(d);
      if (dd > 0) {
        g.takeDamage(dd, null, false);
        this.shake = Math.max(this.shake, (1 - d / def.radius) * 0.6);
        if (n.type === 'arc') this._arcSlow = 1.2;
      }
    }
    for (const e of this.enemies) {
      if (e.dead || e.dropping) continue;
      const d = U.dist(n.x, n.z, e.pos.x, e.pos.z);
      const dd = dmgAt(d);
      if (dd > 0) e.takeDamage(dd, null, false, this.time);
    }
  }

  /* ============ 击杀 / 播报 / 排名 ============ */

  onPlayerHit(attacker, dmg, isHead) {
    this.damageDealt += dmg;
    HUD.playerHitFeedback(dmg, isHead, attacker);
  }

  onEnemyDeath(enemy, killer, isHead) {
    this.deaths++;
    if (killer === this.G.player) {
      this.kills++;
      this.G.player.kills++;
      this.G.player.damageDealt += 100;
      AudioMgr.killConfirm();
      // 掠影被动：击杀刷新相位冲刺（Q）
      if (this.G.player.legend === 'wraith' && !this.G.player.dead) {
        this.G.player.skillCd = 0;
        HUD.toast('淘汰 ' + enemy.name + ' · 相位冲刺已刷新', '#7f6bff');
      } else {
        HUD.toast('淘汰 ' + enemy.name, '#ff8a5a');
      }
      this.shake = Math.max(this.shake, 0.25);
    }
    const kw = killer && killer.weapon ? killer.weapon.def.name : '毒圈';
    const kname = killer === this.G.player ? '你' : killer ? killer.name : '毒圈';
    HUD.killFeed(kname, enemy.name, kw);
    // 任何敌人死亡（玩家杀/毒圈/手雷/AI 互杀）后统一检查是否吃鸡
    this._checkAlive();
  }

  onAiKill(killer, target) {
    this.onEnemyDeath(target, killer, false);
  }

  onPlayerDeath(killer) {
    this.state = 'dead';
    this.rank = this.alive;
    HUD.showEndScreen(this.rank, this.kills, Math.round(this.damageDealt), this.matchTime, false);
    AudioMgr.play('sniper.wav', { volume: 0.7, rate: 0.7 });
  }

  /** 玩家开火命中敌人（由 main 调用） */
  registerPlayerHit(enemy, dmg, isHead) {
    if (enemy.dead || enemy.dropping) return;
    enemy.takeDamage(dmg, this.G.player, isHead, this.time);
    if (enemy.dead) {
      // 玩家击杀
      this.onEnemyDeath(enemy, this.G.player, isHead);
      // 吃鸡检查已在 onEnemyDeath 内统一处理
    }
  }

  _checkAlive() {
    let aliveCount = 1; // 玩家（若存活）
    for (const e of this.enemies) if (!e.dead) aliveCount++;
    this.alive = aliveCount;
    if (aliveCount <= 1 && this.state === 'playing') {
      this.state = 'end';
      this.rank = 1;
      HUD.showEndScreen(1, this.kills, Math.round(this.damageDealt), this.matchTime, true);
      AudioMgr.killConfirm();
    }
  }

  dropDeathBox(enemy, killer) {
    const contents = {
      weapon: enemy.weapon,
      armorLv: enemy.armorLv,
      heals: enemy.heals,
      nades: enemy.nades,
      ammo: { [enemy.weapon.def.ammo]: enemy.weapon.reserve },
    };
    G.loot.spawnDeathBox(enemy.pos.x, enemy.pos.z, contents, killer === this.G.player);
  }

  /* ============ 相机震屏 ============ */

  _updateShake(dt) {
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 1.5);
      const s = this.shake * this.shake * 0.06;
      G.camera.position.x += U.rand(-s, s);
      G.camera.position.y += U.rand(-s, s) * 0.5;
      G.camera.rotation.z += U.rand(-s, s) * 0.5;
    }
  }

  /* ============ 结束 ============ */

  reset() {
    this.state = 'menu';
    // 清空世界战利品与敌人
    for (const it of G.loot.items.slice()) G.loot.remove(it);
    for (const e of this.enemies) { this.scene.remove(e.group); }
    this.enemies.length = 0;   // 保持 G.enemies 引用（不能重建数组，否则打不到敌人）
    this.nades.length = 0;
    this.zoneRing.visible = this.zoneLine.visible = false;
    this._plane.visible = false;
    G.player._model.group.visible = true;
  }
}

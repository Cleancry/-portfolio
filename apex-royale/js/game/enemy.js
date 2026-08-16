/* ============================================================
 * enemy.js — AI 敌人（跳伞落地 → 搜刮 → 交战 → 治疗 → 死亡）
 * 简化感知：距离 + 视线采样 + 枪声刺激。
 * ============================================================ */
'use strict';

const AI_NAMES = [
  '瑞文', '卡尔', '米拉', '洛克', '薇拉', '阿列克斯', '萨米', '藤井', '奥托', '莉娜',
  '布鲁诺', '诺拉', '赫克托', '伊莱', '阿什', '维罗', '加百列', '菲奥娜', '德克', '梅',
  '索尔', '尹', '玛尔塔', '凯', '里奥', '埃拉', '祖恩', '哈娜', '维克', '多姆',
];

class Enemy {
  constructor(scene, world, br, id) {
    this.scene = scene;
    this.world = world;
    this.br = br;
    this.id = id;
    this.name = AI_NAMES[id % AI_NAMES.length] + '-' + (100 + id);
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = Math.random() * Math.PI * 2;
    this.hp = 100;
    this.armorLv = U.pick([0, 1, 1, 2, 2, 3]);
    this.shield = this.armorLv ? ARMORS[this.armorLv].shield : 0;
    this.weapon = new Weapon(rollWeaponId(), rollAttachments());
    this.nades = { frag: U.randInt(0, 2), arc: U.randInt(0, 1), thermite: 0 };
    this.heals = { syringe: U.randInt(0, 2), medkit: 0, cell: U.randInt(0, 2), battery: 0, phoenix: 0 };
    this.dead = false;
    this.dropT = 2.2;         // 跳伞落地倒计时
    this.dropping = true;
    this.state = 'loot';      // loot | combat | heal | patrol
    this.stateT = 0;
    this.target = null;       // 玩家或敌人
    this.lastShot = 0;
    this.aimT = 0;            // 瞄准时间（越久越准）
    this.healT = 0;
    this.moveTarget = null;
    this.reactT = 0;
    this.dmgFlash = 0;
    this.scanned = 0;         // 血犬扫描可见
    this.shotCd = U.rand(0.3, 1);
    this._nextDecide = 0;
    this._buildMesh();
    this._place();
    scene.add(this.group);
    // 外部士兵模型（加载完成后替换视觉，保留 bodyMesh/headMesh 做命中）
    this.modelMesh = null;
    if (window.ModelStore) {
      const self = this;
      ModelStore.onLoaded(function () { self._setSoldierModel(); });
    }
  }

  /** 用 Soldier.glb 替换程序化身体视觉（命中体保留） */
  _setSoldierModel() {
    try {
      const m = ModelStore.get('soldier');
      if (!m) return;
      m.name = 'soldier-model';
      m.rotation.y = Math.PI;   // 模型默认朝 +z，转向 -z（yaw 前方）
      m.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
      this.group.add(m);
      this.modelMesh = m;
      // 隐藏所有程序化视觉部件（躯干/头/手臂/腿/枪），只留士兵模型；
      // bodyMesh/headMesh 仍参与射线命中（visible=false 不影响 Raycaster）
      this.group.traverse(o => {
        if (o.isMesh && o.userData && o.userData.proc) o.visible = false;
      });
      window.__soldierCount = (window.__soldierCount || 0) + 1;
    } catch (e) {
      // 单实例失败不影响其他敌人（保留程序化人形兜底）
      console.warn('[enemy] 士兵模型挂载失败:', e && e.message);
    }
  }

  _buildMesh() {
    const g = new THREE.Group();
    // 程序化人形（模型加载失败时的兜底外观：头+躯干+手臂+腿，明显人形而非球）
    const bodyMat = new THREE.MeshLambertMaterial({ color: new THREE.Color().setHSL(U.rand(0.05, 0.12), 0.45, 0.35) });
    const headMat = new THREE.MeshLambertMaterial({ color: 0xc9a27e });
    // 躯干（命中体 bodyMesh）
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.72, 0.3), bodyMat);
    body.position.y = 1.12;
    body.castShadow = true;
    body.userData.proc = true;
    // 头（命中体 headMesh）
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 10, 8), headMat);
    head.position.y = 1.72;
    head.castShadow = true;
    head.userData.proc = true;
    // 手臂
    const armMat = new THREE.MeshLambertMaterial({ color: new THREE.Color().setHSL(U.rand(0.05, 0.1), 0.4, 0.3) });
    for (const side of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.055, 0.6, 6), armMat);
      arm.position.set(side * 0.36, 1.28, 0);
      arm.rotation.z = side * -0.35;
      arm.castShadow = true;
      arm.userData.proc = true;
      g.add(arm);
    }
    // 腿
    const legMat = new THREE.MeshLambertMaterial({ color: new THREE.Color().setHSL(U.rand(0.05, 0.1), 0.35, 0.24) });
    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.08, 0.72, 6), legMat);
      leg.position.set(side * 0.15, 0.36, 0);
      leg.castShadow = true;
      leg.userData.proc = true;
      g.add(leg);
    }
    // 枪（示意）
    const gunMat = new THREE.MeshLambertMaterial({ color: 0x2a2e35 });
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.7), gunMat);
    gun.position.set(0.25, 1.3, -0.4);
    gun.rotation.x = -0.2;
    gun.userData.proc = true;
    // 名字标签（HTML overlay 由 HUD 画）
    g.add(body, head, gun);
    this.group = g;
    this.group._isEnemyGroup = true;   // 标记，便于 startMatch 清理残留
    this.bodyMesh = body;
    this.headMesh = head;
    this.armorLv && this._addArmorRing(g, bodyMat);
  }

  _addArmorRing(g) {
    // 头顶小圆环指示护甲等级（不遮挡身体）
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.22, 0.03, 4, 16),
      new THREE.MeshBasicMaterial({ color: ARMORS[this.armorLv].color, transparent: true, opacity: 0.9 })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 1.85;
    g.add(ring);
  }

  _place() {
    // 落点：随机战利品点（建筑/高楼群）附近 → 敌人集中在城镇区域，玩家更容易遭遇
    let x, z, tries = 0;
    const G = this.br.G;
    const pts = this.world.lootPoints;
    do {
      const lp = pts.length ? pts[Math.floor(Math.random() * pts.length)] : { x: 0, z: 0 };
      x = lp.x + U.rand(-14, 14);
      z = lp.z + U.rand(-14, 14);
      tries++;
    } while (G.player && U.dist2(x, z, G.player.pos.x, G.player.pos.z) < 90 * 90 && tries < 40);
    this.pos.set(x, this.world.heightAt(x, z) + 260, z);
    this.group.position.copy(this.pos);   // 同步渲染位置
    this.spawnX = x; this.spawnZ = z;
  }

  /* ============ 感知 ============ */

  /** 视线是否被地形/建筑遮挡 */
  hasLOS(ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const steps = Math.max(4, Math.ceil(dist / 4));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const px = ax + dx * t, py = ay + dy * t, pz = az + dz * t;
      if (py < this.world.heightAt(px, pz) + 0.4) return false;
      if (this.world.inBuilding(px, pz)) return false;
      for (const c of this.world.colliders) {
        if (!c.building && px > c.minX - 0.5 && px < c.maxX + 0.5 && pz > c.minZ - 0.5 && pz < c.maxZ + 0.5 && py < c.maxY) {
          // 掩体可能挡住；粗略判断
          const onPath = Math.abs((bx - ax) * (pz - az) - (bz - az) * (px - ax)) < 1.5;
          if (onPath) return false;
        }
      }
    }
    return true;
  }

  decide(dt, G, now) {
    if (this.dead) return;
    this._nextDecide -= dt;
    if (this._nextDecide > 0) return;
    this._nextDecide = 0.5;

    const eye = { x: this.pos.x, y: this.pos.y + 1.6, z: this.pos.z };

    // 1. 寻找目标：玩家优先，其次其他敌人
    let best = null, bestD = Infinity;
    const candidates = [];
    if (G.player && !G.player.dead) {
      candidates.push({ t: G.player, d: U.dist(this.pos.x, this.pos.z, G.player.pos.x, G.player.pos.z), isPlayer: true });
    }
    for (const e of G.enemies) {
      if (e === this || e.dead || e.dropping) continue;
      const d = U.dist(this.pos.x, this.pos.z, e.pos.x, e.pos.z);
      if (d < 45) candidates.push({ t: e, d, isPlayer: false });   // AI 互战仅近距离，避免提前互耗
    }
    for (const c of candidates) {
      if (c.d < bestD && c.d < 180) { bestD = c.d; best = c; }
    }

    // 受伤反击：最近攻击者
    if (this.lastAttacker && this.lastAttackerT && (now - this.lastAttackerT) < 6) {
      const d = this.lastAttacker.dead ? 1e9 : U.dist(this.pos.x, this.pos.z, this.lastAttacker.pos.x, this.lastAttacker.pos.z);
      if (d < 200 && (!best || d < bestD + 30)) { best = { t: this.lastAttacker, d, isPlayer: this.lastAttacker === G.player }; bestD = d; }
    }

    const canSee = best && this.hasLOS(eye.x, eye.y, eye.z, best.t.pos.x, best.t.pos.y + 1.6, best.t.pos.z);
    this.canSeeTarget = canSee;

    if (best && canSee) {
      this.target = best.t;
      this.state = 'combat';
      this.stateT = 3 + Math.random() * 4;
    } else if (best && !canSee && bestD < 60) {
      // 听到枪声 / 很近 → 追过去
      this.target = best.t;
      this.state = 'combat';
      this.moveTarget = { x: best.t.pos.x, z: best.t.pos.z };
    } else if (this.target && !this.target.dead && this.state === 'combat' && bestD < 220) {
      // 保持追击
      this.moveTarget = { x: this.target.pos.x, z: this.target.pos.z };
    } else {
      // 无目标：毒圈外优先进圈，否则搜刮/向玩家游走
      const zc = G.br.zone;
      const inZone = !zc || zc.dmg <= 0 || U.dist(this.pos.x, this.pos.z, zc.cx, zc.cz) <= zc.r;
      if (!inZone) {
        // 毒圈外 → 向安全区内移动
        const ang = Math.random() * Math.PI * 2;
        const rad = U.rand(0, zc.r * 0.75);
        const tx = U.clamp(zc.cx + Math.cos(ang) * rad, -this.world.HALF + 5, this.world.HALF - 5);
        const tz = U.clamp(zc.cz + Math.sin(ang) * rad, -this.world.HALF + 5, this.world.HALF - 5);
        this.moveTarget = this._walkableNear(tx, tz);
      } else if (!this.moveTarget || U.dist2(this.pos.x, this.pos.z, this.moveTarget.x, this.moveTarget.z) < 6 * 6) {
        const p = G.player;
        const towardPlayer = p && !p.dead && Math.random() < 0.7;   // 玩家存活时大概率向玩家聚集
        if (towardPlayer) {
          this.moveTarget = this._walkableNear(p.pos.x + U.rand(-25, 25), p.pos.z + U.rand(-25, 25));
        } else {
          const lp = this.world.nearestLootPoint(this.pos.x, this.pos.z);
          this.moveTarget = lp && Math.random() < 0.6
            ? this._walkableNear(lp.x + U.rand(-10, 10), lp.z + U.rand(-10, 10))
            : this._walkableNear(U.rand(-this.world.HALF * 0.8, this.world.HALF * 0.8), U.rand(-this.world.HALF * 0.8, this.world.HALF * 0.8));
        }
      }
      this.state = 'loot';
      // 附近有更好武器战利品 → 换（简化：不换，已初始装备）
    }

    // 低血治疗决策
    if ((this.hp < 45 || this.shield === 0) && bestD > 40) {
      if (this.heals.syringe > 0 || this.heals.cell > 0) { this.state = 'heal'; }
    }
  }

  _pickupStart() {
    // 落地后：把初始护甲/弹药设为齐备
    this.weapon.reserve = this.weapon.def.reserve;
  }

  /** 落地动画：跳伞下落 → 落地（飞机/跳伞阶段由 BR 调用，保证玩家落地时敌人已就位） */
  updateLanding(dt) {
    if (this.dead || !this.dropping) return;
    this.dropT -= dt;
    if (this.dropT <= 0) {
      this.dropping = false;
      this.pos.y = this.world.heightAt(this.pos.x, this.pos.z);
      this.group.position.copy(this.pos);   // 同步渲染位置（否则 mesh 停在原点，射线打不到）
      const G = this.br.G;
      if (G && G.fx) G.fx.dust(this.pos.x, this.pos.y, this.pos.z);
      this._pickupStart();
    }
  }

  update(dt, now, G) {
    if (this.dead) return;
    if (this.dropping) { this.updateLanding(dt); return; }
    this.dmgFlash = Math.max(0, this.dmgFlash - dt * 2);
    if (this.scanned > 0) this.scanned -= dt;
    if (this.lastAttackerT && now - this.lastAttackerT > 8) this.lastAttacker = null;

    this.decide(dt, G, now);

    // 卡住检测：连续 ~3 秒几乎没移动且非治疗/战斗 → 强制换目标挣脱（防止贴建筑卡死成"静止模型"）
    if (this._lastX === undefined) { this._lastX = this.pos.x; this._lastZ = this.pos.z; this._stuckT = 0; }
    const moved = Math.abs(this.pos.x - this._lastX) + Math.abs(this.pos.z - this._lastZ);
    if (moved < 0.25) this._stuckT += dt; else this._stuckT = 0;
    this._lastX = this.pos.x; this._lastZ = this.pos.z;
    if (this._stuckT > 3 && this.state !== 'heal' && this.state !== 'combat') {
      this._stuckT = 0;
      this.moveTarget = this._walkableNear(this.pos.x + U.rand(-50, 50), this.pos.z + U.rand(-50, 50));
      this.target = null;
    }

    const toTarget = this.target && !this.target.dead ? this.target : null;

    // 治疗
    if (this.state === 'heal') {
      if (this.heals.cell > 0 && this.shield < this.maxShield()) {
        this.healT += dt;
        if (this.healT >= 2.5) { this.healT = 0; this.shield = Math.min(this.maxShield(), this.shield + 50); this.heals.cell--; G.fx.healRing(this.pos.x, this.pos.y + 1, this.pos.z, 0x4fc3f7); }
      } else if (this.heals.syringe > 0 && this.hp < 100) {
        this.healT += dt;
        if (this.healT >= 2.5) { this.healT = 0; this.hp = Math.min(100, this.hp + 25); this.heals.syringe--; G.fx.healRing(this.pos.x, this.pos.y + 1, this.pos.z, 0x7ed66a); }
      } else {
        this.state = 'loot';
      }
      this.vel.x *= 0.8; this.vel.z *= 0.8;
    } else if (this.state === 'combat' && toTarget) {
      this._combatUpdate(dt, now, G, toTarget);
    } else {
      // 巡逻/搜刮移动
      this._moveTowards(this.moveTarget ? this.moveTarget.x : 0, this.moveTarget ? this.moveTarget.z : 0, 4.0, dt);
    }

    // 物理集成
    this.vel.y -= 24 * dt;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.pos.y += this.vel.y * dt;
    const gh = this.world.heightAt(this.pos.x, this.pos.z);
    if (this.pos.y <= gh) { this.pos.y = gh; this.vel.y = 0; }
    // 简易碰撞（避开 collider 中心）
    for (const c of this.world.colliders) {
      if (this.pos.x > c.minX - 0.5 && this.pos.x < c.maxX + 0.5 && this.pos.z > c.minZ - 0.5 && this.pos.z < c.maxZ + 0.5 && this.pos.y < c.maxY) {
        // 推出
        const dxl = this.pos.x - (c.minX + c.maxX) / 2, dzl = this.pos.z - (c.minZ + c.maxZ) / 2;
        const push = (dxl * dxl > dzl * dzl) ? (dxl > 0 ? 1 : -1) : (dzl > 0 ? 1 : -1);
        if (Math.abs(dxl) > Math.abs(dzl)) this.pos.x = dxl > 0 ? c.maxX + 0.5 : c.minX - 0.5;
        else this.pos.z = dzl > 0 ? c.maxZ + 0.5 : c.minZ - 0.5;
      }
    }
    this.pos.x = U.clamp(this.pos.x, -this.world.HALF + 1, this.world.HALF - 1);
    this.pos.z = U.clamp(this.pos.z, -this.world.HALF + 1, this.world.HALF - 1);

    // 朝向目标/移动方向
    const dirX = toTarget ? toTarget.pos.x - this.pos.x : (this.moveTarget ? this.moveTarget.x - this.pos.x : 0);
    const dirZ = toTarget ? toTarget.pos.z - this.pos.z : (this.moveTarget ? this.moveTarget.z - this.pos.z : 0);
    if (dirX !== 0 || dirZ !== 0) {
      const targetYaw = Math.atan2(-dirX, -dirZ);
      this.yaw += U.angleDiff(this.yaw, targetYaw) * Math.min(1, dt * 6);
    }
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.yaw;
  }

  /** 目标点不可行（在建筑/掩体内）时，就近找可行走点 */
  _walkableNear(x, z) {
    for (let i = 0; i < 12; i++) {
      const tx = x + U.rand(-20, 20), tz = z + U.rand(-20, 20);
      if (this.world.isWalkable(tx, tz)) return { x: tx, z: tz };
    }
    return { x, z };
  }

  _moveTowards(tx, tz, speed, dt) {
    const dx = tx - this.pos.x, dz = tz - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 1) return;
    const step = Math.min(d, speed * dt);
    this.vel.x = (dx / d) * speed;
    this.vel.z = (dz / d) * speed;
    if (this.groundedWalk) {}
  }

  _combatUpdate(dt, now, G, target) {
    const dist = U.dist(this.pos.x, this.pos.z, target.pos.x, target.pos.z);
    const w = this.weapon;
    // 最佳交战距离
    const ideal = w.def.kind === 'sniper' ? 70 : w.def.kind === 'shotgun' ? 14 : w.def.kind === 'smg' ? 18 : 32;
    // 接近或后退
    if (dist > ideal + 6) this._moveTowards(target.pos.x, target.pos.z, 5.2, dt);
    else if (dist < ideal - 6 && w.def.kind !== 'shotgun') this._moveTowards(this.pos.x + (this.pos.x - target.pos.x), this.pos.z + (this.pos.z - target.pos.z), 3.6, dt);
    // 横向走位
    else {
      const strafe = Math.sin(now * 0.7 + this.id) > 0 ? 1 : -1;
      const sx = -(target.pos.z - this.pos.z) * strafe, sz = (target.pos.x - this.pos.x) * strafe;
      const sl = Math.hypot(sx, sz) || 1;
      this._moveTowards(this.pos.x + sx / sl * 6, this.pos.z + sz / sl * 6, 3.4, dt);
    }

    // 射击
    const canHit = this.hasLOS(this.pos.x, this.pos.y + 1.5, this.pos.z, target.pos.x, target.pos.y + 1.5, target.pos.z);
    if (canHit && dist < w.def.range * 0.85) {
      this.shotCd -= dt;
      // 瞄准积累
      if (this.shotCd <= 0) {
        this.shotCd = U.rand(1.2, 2.4) / Math.max(0.6, w.def.fireRate * 0.4);
        this._fireAt(target, dist, now, G);
      }
    } else {
      this.shotCd = U.rand(0.5, 1);
    }
  }

  _fireAt(target, dist, now, G) {
    const w = this.weapon;
    if (w.reloading || w.mag <= 0) {
      if (w.startReload()) { this.reloadAnimT = 1; }
      return;
    }
    const shot = w.tryFire(now);
    if (!shot) return;
    // 精度：距离越远越差，随时间变准
    const distFactor = U.clamp(1 - dist / w.def.range, 0.25, 1);
    const skill = 0.5 + this.br.difficulty * 0.15;
    const hitChance = U.clamp((0.55 + this.aimT * 0.5) * distFactor * skill, 0.08, 0.92);
    this.aimT = Math.min(3, this.aimT + 0.4);
    const rolled = Math.random();
    const isPlayer = target === G.player;
    let dmg = 0;
    if (rolled < hitChance) {
      const headChance = U.clamp((1 - dist / w.def.range) * 0.22, 0.03, 0.3);
      const isHead = Math.random() < headChance;
      dmg = shot.dmg * (isHead ? shot.headMult : 1) * U.rand(0.85, 1.1) * (isPlayer ? 1 : 0.75);
      if (isPlayer) {
        G.player.takeDamage(dmg, this, isHead);
        if (G.br) G.br.onPlayerHit(this, dmg, isHead);
      } else {
        // AI 互战
        target.takeDamage(dmg, this, isHead, now);
        if (target.dead && G.br) G.br.onAiKill(this, target);
      }
    }
    // 音效与特效
    const muzzle = new THREE.Vector3(this.pos.x, this.pos.y + 1.4, this.pos.z);
    AudioMgr.shotAt(shot.kind, this.pos.x, this.pos.z, 1);
    G.fx.muzzle(muzzle.x, muzzle.y + Math.sin(this.yaw) * 0.3, muzzle.z, 0.8);
    this.lastShot = now;
    this.aimT = 0;
  }

  takeDamage(dmg, attacker, isHead, now, silent) {
    if (this.dead || this.dropping) return;
    this.lastAttacker = attacker;
    this.lastAttackerT = now;
    this.aimT = 0;
    if (this.shield > 0) {
      const sd = Math.min(this.shield, dmg);
      this.shield -= sd; dmg -= sd;
      if (!silent) AudioMgr.hitMaterial('metal', 0.5);
    }
    if (dmg > 0) {
      this.hp -= dmg;
      if (!silent) AudioMgr.hitMaterial('flesh', 0.6);
    }
    this.dmgFlash = 0.3;
    if (this.hp <= 0) this.die(attacker, isHead);
  }

  die(killer, isHead) {
    if (this.dead) return;
    this.dead = true;
    this.deathTime = U.now();
    G.fx.blood(this.pos.x, this.pos.y + 1.2, this.pos.z, new THREE.Vector3(0, 0.4, 0), 16);
    // 掉落死亡箱
    if (G.br) {
      G.br.dropDeathBox(this, killer);
      G.br.onEnemyDeath(this, killer, isHead);
    }
    // 尸体倒下（隐藏模型，播放简单动画：下沉）
    this.deadBodyT = 0;
  }

  maxShield() { return this.armorLv ? ARMORS[this.armorLv].shield : 0; }
}

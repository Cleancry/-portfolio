/* ============================================================
 * player.js — 玩家控制器
 * 移动（跑/跳/冲刺/滑铲）、射击手感、开镜、换弹、治疗、
 * 投掷、传奇技能、受击/死亡、第一人称枪械模型。
 * ============================================================ */
'use strict';

const LEGENDS = {
  wraith: {
    name: '掠影', icon: '🌀',
    passive: '危险预警', active: '相位冲刺：1.5s 无敌瞬移', color: '#7f6bff',
    cd: 25, desc: 'Q 相位冲刺 · 被动感应危险',
  },
  bloodhound: {
    name: '猎犬', icon: '🔍',
    passive: '追踪本能', active: '扫描：透视 60m 内敌人', color: '#ff6b4a',
    cd: 30, desc: 'Q 全知之眼 · 透视敌人',
  },
  lifeline: {
    name: '命脉', icon: '✚',
    passive: '战斗医疗', active: '治疗无人机：持续回血', color: '#4ad66d',
    cd: 32, desc: 'Q 治疗无人机 · 治疗加速',
  },
};

class Player {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.pos = new THREE.Vector3(0, 0, 0);   // 脚底位置
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.hp = 100;
    this.shield = 0;
    this.armorLv = 0;          // 0 无甲 1-4
    this.legend = 'wraith';
    this.skillCd = 0;
    this.stamina = 100;
    this.sprinting = false;
    this.slideT = 0;           // 滑铲剩余时间
    this.slideDir = new THREE.Vector2();
    this.phaseT = 0;           // 相位无敌
    this.scanT = 0;
    this.drone = null;         // 命脉无人机
    this.healing = null;       // {type, t, total, id}
    this.nade = 'frag';
    this.nadeCount = { frag: 0, arc: 0, thermite: 0 };
    this.healCount = { syringe: 0, medkit: 0, cell: 0, battery: 0, phoenix: 0 };
    this.weapons = [null, null];
    this.slot = 0;
    this.dead = false;
    this.deathTime = 0;
    this.kills = 0;
    this.damageDealt = 0;
    this.recoilPitch = 0;      // 后座抬升（平滑恢复）
    this.aimPunch = 0;
    this.bobT = 0;
    this.grounded = true;
    this.dmgFlash = 0;
    this.eyeH = 1.62;
    this.fallT = 0;
    this._model = this._buildViewModel();
    camera.add(this._model.group);
    camera.add(this._model.muzzleRef);
    scene.add(camera);
    // 外部枪械模型（加载完成后替换程序化视觉）
    if (window.ModelStore) {
      const self = this;
      ModelStore.onLoaded(function () { self._swapGunModels(); });
    }
  }

  /** 用 Kenney Blaster 模型替换程序化枪械视觉 */
  _swapGunModels() {
    for (const kind of ['pistol', 'smg', 'rifle', 'sniper', 'shotgun', 'energy']) {
      const m = ModelStore.get('gun_' + kind);
      if (!m) continue;
      const holder = this._model.models[kind];
      // 清空程序化模型
      while (holder.children.length) holder.remove(holder.children[0]);
      // 朝向与位置：枪口指向 -z（相机前方），模型略向右下
      m.rotation.y = Math.PI;   // Kenney blaster 默认朝 +z → 转 -z
      m.position.set(0, -0.02, 0.05);
      holder.add(m);
    }
  }

  /* ============ 第一人称模型 ============ */

  _buildViewModel() {
    const g = new THREE.Group();
    const matDark = new THREE.MeshLambertMaterial({ color: 0x262a31 });
    const matGrey = new THREE.MeshLambertMaterial({ color: 0x3d444d });
    const holder = new THREE.Group();
    g.add(holder);
    // 各武器模型挂到 holder，按 kind 切换
    const arms = new THREE.Group();
    const armMat = new THREE.MeshLambertMaterial({ color: 0x2a2118 });
    const lArm = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.05, 0.45, 6), armMat);
    lArm.position.set(-0.26, -0.1, 0.1); lArm.rotation.z = 0.35; lArm.rotation.x = 0.4;
    const rArm = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.05, 0.45, 6), armMat);
    rArm.position.set(0.26, -0.1, 0.1); rArm.rotation.z = -0.35; rArm.rotation.x = 0.4;
    arms.add(lArm); arms.add(rArm);
    g.add(arms);

    const models = {};
    const mk = (id, builder) => {
      const m = new THREE.Group();
      builder(m, matDark, matGrey);
      m.visible = false;
      holder.add(m);
      models[id] = m;
    };

    mk('pistol', (m, dk, gy) => {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.34), dk);
      const slide = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.3), gy); slide.position.y = 0.07; slide.position.z = -0.02;
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.14, 6), dk); barrel.rotation.x = Math.PI / 2; barrel.position.z = -0.24;
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.16, 0.09), dk); grip.position.set(0, -0.14, 0.08); grip.rotation.x = 0.25;
      const sight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.03), gy); sight.position.set(0, 0.11, 0.05);
      m.add(body, slide, barrel, grip, sight);
    });
    mk('smg', (m, dk, gy) => {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.13, 0.5), dk);
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.26, 6), dk); barrel.rotation.x = Math.PI / 2; barrel.position.z = -0.38;
      const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.12), gy); mag.position.set(0, -0.16, 0.05); mag.rotation.x = 0.2;
      const stock = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.09, 0.16), gy); stock.position.z = 0.33;
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.08), dk); grip.position.set(0, -0.1, 0.14); grip.rotation.x = 0.3;
      const sight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.02), gy); sight.position.set(0, 0.1, 0.12);
      m.add(body, barrel, mag, stock, grip, sight);
    });
    mk('rifle', (m, dk, gy) => {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.15, 0.62), dk);
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.34, 6), dk); barrel.rotation.x = Math.PI / 2; barrel.position.z = -0.48;
      const mag = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.22, 0.14), gy); mag.position.set(0, -0.18, 0.06); mag.rotation.x = 0.18;
      const stock = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.11, 0.22), gy); stock.position.z = 0.42;
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.09), dk); grip.position.set(0, -0.11, 0.2); grip.rotation.x = 0.3;
      const sight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.06, 0.03), gy); sight.position.set(0, 0.13, 0.16);
      m.add(body, barrel, mag, stock, grip, sight);
    });
    mk('sniper', (m, dk, gy) => {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.85), dk);
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 6), dk); barrel.rotation.x = Math.PI / 2; barrel.position.z = -0.67;
      const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.3, 8), gy); scope.rotation.x = Math.PI / 2; scope.position.set(0, 0.12, -0.05);
      const scopeLens = new THREE.Mesh(new THREE.CircleGeometry(0.05, 8), new THREE.MeshBasicMaterial({ color: 0x8ae0ff })); scopeLens.position.set(0, 0.12, 0.1);
      const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.1), gy); mag.position.set(0, -0.12, 0.1);
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.08), dk); grip.position.set(0, -0.1, 0.28); grip.rotation.x = 0.35;
      m.add(body, barrel, scope, scopeLens, mag, grip);
    });
    mk('shotgun', (m, dk, gy) => {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.14, 0.55), dk);
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.42, 8), gy); barrel.rotation.x = Math.PI / 2; barrel.position.z = -0.48;
      const pump = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.3), dk); pump.position.set(0, 0.02, -0.3);
      const stock = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.2), gy); stock.position.z = 0.38;
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.08), dk); grip.position.set(0, -0.1, 0.22); grip.rotation.x = 0.3;
      m.add(body, barrel, pump, stock, grip);
    });
    mk('energy', (m, dk, gy) => {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 0.55), new THREE.MeshLambertMaterial({ color: 0x1a2030 }));
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.3, 8), new THREE.MeshLambertMaterial({ color: 0x2a3050 })); barrel.rotation.x = Math.PI / 2; barrel.position.z = -0.42;
      const cell = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.2, 6), new THREE.MeshBasicMaterial({ color: 0xb06bff })); cell.rotation.x = Math.PI / 2; cell.position.set(0, -0.14, 0.1);
      const sight = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.012, 6, 12), new THREE.MeshBasicMaterial({ color: 0x8ae0ff })); sight.position.set(0, 0.12, 0.15);
      m.add(body, barrel, cell, sight);
    });

    const muzzleRef = new THREE.Object3D();
    muzzleRef.position.set(0, 0.02, -0.55);
    holder.add(muzzleRef);

    return { group: g, holder, models, muzzleRef, arms };
  }

  _showModel(kind) {
    for (const k in this._model.models) this._model.models[k].visible = false;
    const id = kind === 'energy' ? 'energy' : kind === 'shotgun' ? 'shotgun' : kind === 'sniper' ? 'sniper' : kind === 'rifle' ? 'rifle' : kind === 'smg' ? 'smg' : 'pistol';
    this._model.models[id].visible = true;
  }

  /* ============ 装备 ============ */

  equipWeapon(weapon, slot) {
    if (slot == null) {
      // 自动选空槽或弱武器槽
      slot = this.weapons[0] == null ? 0 : this.weapons[1] == null ? 1 : this._weakerSlot();
    }
    const old = this.weapons[slot];
    this.weapons[slot] = weapon;
    this.slot = slot;
    this._showModel(weapon.def.kind);
    if (old) return old; // 返回被换下的（供丢弃/地面交换）
    return null;
  }

  _weakerSlot() {
    const a = this.weapons[0], b = this.weapons[1];
    const score = w => w ? (w.dmg * w.def.fireRate) : 0;
    return score(a) <= score(b) ? 0 : 1;
  }

  switchSlot(i) {
    if (i === this.slot || !this.weapons[i]) return;
    this.slot = i;
    const w = this.weapons[i];
    w.equipT = w.def.equip;
    this._showModel(w.def.kind);
    AudioMgr.uiClick();
  }

  /* ============ 传奇技能 ============ */

  useSkill(dt) {
    if (this.skillCd > 0 || this.healing || this.dead) return;
    const L = LEGENDS[this.legend];
    this.skillCd = L.cd;
    if (this.legend === 'wraith') {
      this.phaseT = 1.5;
      const fwd = this._forward();
      this.vel.x += fwd.x * 18; this.vel.z += fwd.z * 18;
      this.vel.y = Math.max(this.vel.y, 6);
      AudioMgr.play('gunshot.wav', { volume: 0.3, rate: 1.8 });
      HUD.toast('相位冲刺！', '#b06bff');
    } else if (this.legend === 'bloodhound') {
      this.scanT = 4.5;
      AudioMgr.play('gunshot.wav', { volume: 0.4, rate: 1.4, filter: { type: 'highpass', freq: 2000 } });
      HUD.toast('全知之眼已开启', '#ff6b4a');
      if (G.br) G.br.scanEnemies();
    } else if (this.legend === 'lifeline') {
      this._spawnDrone();
      HUD.toast('治疗无人机部署', '#4ad66d');
    }
  }

  _spawnDrone() {
    if (this.drone) { G.fx.group.remove(this.drone); this.drone = null; }
    const tex = G.fx._texGlow;
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0x4ad66d, transparent: true, depthWrite: false }));
    spr.scale.setScalar(0.8);
    this.scene.add(spr);
    this.drone = { spr, t: 10 };
  }

  updateSkill(dt) {
    if (this.skillCd > 0) this.skillCd -= dt;
    if (this.phaseT > 0) this.phaseT -= dt;
    if (this.scanT > 0) this.scanT -= dt;
    if (this.drone) {
      this.drone.t -= dt;
      if (this.drone.t <= 0 || this.dead) {
        this.scene.remove(this.drone.spr); this.drone = null;
      } else {
        this.drone.spr.position.set(this.pos.x, this.pos.y + 2.2, this.pos.z);
        if (this.hp < 100) {
          this.hp = Math.min(100, this.hp + 8 * dt);
          G.fx.healRing(this.pos.x, this.pos.y + 1, this.pos.z, 0x4ad66d);
        }
      }
    }
  }

  /* ============ 治疗 ============ */

  tryHeal(kind) {
    if (this.healing || this.dead) return;
    const def = HEALS[kind];
    if (!def || this.healCount[kind] <= 0) { HUD.toast('没有 ' + def.name, '#ff8a5a'); return; }
    if (kind === 'syringe' && this.hp >= 100) { HUD.toast('生命已满', '#8a93a0'); return; }
    if (kind === 'cell' && this.shield >= this.maxShield()) { HUD.toast('护甲已满', '#8a93a0'); return; }
    this.healing = { type: kind, id: kind, t: def.time, total: def.time };
    AudioMgr.reloadSfx();
  }

  healAutoBlood() {
    if (this.hp < 100 && this.healCount.syringe > 0) this.tryHeal('syringe');
    else if (this.hp < 70 && this.healCount.medkit > 0) this.tryHeal('medkit');
    else if (this.healCount.phoenix > 0 && this.hp < 100) this.tryHeal('phoenix');
    else if (this.hp < 100) HUD.toast('没有治疗道具', '#8a93a0');
  }

  healAutoShield() {
    const max = this.maxShield();
    if (this.shield < max && this.healCount.cell > 0) this.tryHeal('cell');
    else if (this.shield < max && this.healCount.battery > 0) this.tryHeal('battery');
    else if (this.healCount.phoenix > 0 && this.shield < max) this.tryHeal('phoenix');
    else if (this.shield < max) HUD.toast('没有护盾电池', '#8a93a0');
  }

  updateHeal(dt) {
    if (!this.healing) return;
    const h = this.healing;
    const def = HEALS[h.type];
    let rate = 1;
    if (this.armorLv === 4) rate = 1.6;         // 金甲治疗加速
    if (this.legend === 'lifeline') rate *= 1.35;
    h.t -= dt * rate;
    if (this.vel.lengthSq() > 4 || this.dead) { this.healing = null; HUD.toast('治疗被打断', '#ff8a5a'); return; }
    if (h.t <= 0) {
      this.healCount[h.type]--;
      if (def.hp) { this.hp = Math.min(100, this.hp + def.hp); G.fx.healRing(this.pos.x, this.pos.y + 1, this.pos.z, 0x7ed66a); }
      if (def.shield) { this.shield = Math.min(this.maxShield(), this.shield + def.shield); G.fx.healRing(this.pos.x, this.pos.y + 1, this.pos.z, 0x4fc3f7); }
      this.healing = null;
      AudioMgr.heal();
      HUD.updateHealProgress(null);
    } else {
      HUD.updateHealProgress(1 - h.t / h.total);
    }
  }

  maxShield() { return this.armorLv ? ARMORS[this.armorLv].shield : 0; }

  /* ============ 投掷 ============ */

  throwNade() {
    if (this.dead || this.nadeCount[this.nade] <= 0 || this.healing) return;
    this.nadeCount[this.nade]--;
    const dir = this._aimDir();
    const eye = this.eyePos();
    const n = {
      type: this.nade, x: eye.x, y: eye.y, z: eye.z,
      vx: dir.x * 20, vy: dir.y * 20 + 7, vz: dir.z * 20,
      fuse: NADES[this.nade].fuse,
      live: true,
    };
    G.br.nades.push(n);
    AudioMgr.play('ui_click.ogg', { volume: 0.8 });
  }

  cycleNade() {
    const order = ['frag', 'arc', 'thermite'];
    const i = order.indexOf(this.nade);
    for (let k = 1; k <= 3; k++) {
      const t = order[(i + k) % 3];
      if (this.nadeCount[t] > 0) { this.nade = t; HUD.toast('手雷：' + NADES[t].name, NADES[t].color); return; }
    }
  }

  /* ============ 移动物理 ============ */

  _forward() {
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    return new THREE.Vector3(-sy, 0, -cy);
  }
  /** 瞄准方向（含 pitch 俯仰），用于射击射线与投掷 */
  _aimDir() {
    const f = this._forward();
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    return new THREE.Vector3(f.x * cp, sp, f.z * cp);
  }
  _right() {
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    return new THREE.Vector3(cy, 0, -sy);
  }
  eyePos() { return new THREE.Vector3(this.pos.x, this.pos.y + this.eyeH, this.pos.z); }

  updateMovement(dt, world, input) {
    if (this.dead || this.healing) {
      // 治疗时不能移动（vel 归零），但保留重力下落
      if (this.healing) this.vel.x = this.vel.z = 0;
    }
    const fwd = this._forward();
    const right = this._right();
    let mx = 0, mz = 0;
    if (input.key('KeyW')) { mx += fwd.x; mz += fwd.z; }
    if (input.key('KeyS')) { mx -= fwd.x; mz -= fwd.z; }
    if (input.key('KeyA')) { mx -= right.x; mz -= right.z; }
    if (input.key('KeyD')) { mx += right.x; mz += right.z; }
    const moving = (mx !== 0 || mz !== 0);
    const len = Math.hypot(mx, mz) || 1;
    mx /= len; mz /= len;

    // 冲刺 / 滑铲
    this.sprinting = input.key('ShiftLeft') && moving && !this.healing && this.stamina > 5;
    let speed = this.sprinting ? 8.2 : 5.6;
    if (this.slideT > 0) { speed = 10.5; this.stamina = Math.max(0, this.stamina - 22 * dt); }
    if (this.phaseT > 0) speed *= 1.25;
    const targetVx = mx * speed, targetVz = mz * speed;
    const accel = this.grounded ? (this.sprinting ? 14 : 26) : 5;
    this.vel.x = U.lerp(this.vel.x, targetVx, Math.min(1, accel * dt));
    this.vel.z = U.lerp(this.vel.z, targetVz, Math.min(1, accel * dt));

    // 冲刺体力
    if (this.sprinting) this.stamina = Math.max(0, this.stamina - 28 * dt);
    else this.stamina = Math.min(100, this.stamina + 24 * dt);

    // 滑铲触发：冲刺中按 Ctrl
    if (input.pressed('ControlLeft') && this.sprinting && this.grounded && this.slideT <= 0) {
      this.slideT = 0.85;
      this.eyeH = 1.0;
      this.stamina = Math.max(0, this.stamina - 15);
    }
    if (this.slideT > 0) {
      this.slideT -= dt;
      if (this.slideT <= 0 || !this.sprinting || !this.grounded) { this.eyeH = U.lerp(this.eyeH, 1.62, Math.min(1, 8 * dt)); }
    } else {
      this.eyeH = U.lerp(this.eyeH, 1.62, Math.min(1, 10 * dt));
    }

    // 跳跃
    if (input.pressed('Space') && this.grounded && !this.healing) {
      this.vel.y = 8.0;
      this.grounded = false;
      AudioMgr.play('ui_click.ogg', { volume: 0.25, rate: 0.8 });
    }

    // 重力
    this.vel.y -= 24 * dt;
    if (this.vel.y < -55) this.vel.y = -55;

    // 集成
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.pos.y += this.vel.y * dt;

    // 碰撞解析（X/Z 分开，避免卡墙）
    this._resolveCollisions(world);

    // 落地
    const gh = world.heightAt(this.pos.x, this.pos.z);
    if (this.pos.y <= gh) {
      const wasAir = !this.grounded;
      this.pos.y = gh;
      this.vel.y = 0;
      this.grounded = true;
      if (wasAir && this.fallT > 0.6) {
        AudioMgr.play('impactGeneric_light_000.ogg', { volume: 0.6 });
        G.fx.dust(this.pos.x, gh, this.pos.z);
      }
      this.fallT = 0;
    } else {
      this.grounded = false;
      this.fallT += dt;
    }

    // 地图边界
    const half = world.HALF - 2;
    this.pos.x = U.clamp(this.pos.x, -half, half);
    this.pos.z = U.clamp(this.pos.z, -half, half);

    // 玩家自己脚步已取消（避免"咚-咚"节奏被误认为缩圈音效/闹钟；敌人脚步保留用于战术听声）

    // 走路摆动
    if (moving && this.grounded) this.bobT += dt * (this.sprinting ? 11 : 8);
  }

  _resolveCollisions(world) {
    const r = 0.55;
    for (const c of world.colliders) {
      if (this.pos.y > c.maxY + 0.2 || this.pos.y + 1.8 < c.minY) continue;
      const ox = this.pos.x, oz = this.pos.z;
      // X 轴
      if (this.pos.x + r > c.minX && this.pos.x - r < c.maxX && this.pos.z + r > c.minZ && this.pos.z - r < c.maxZ) {
        if (ox >= c.maxX) this.pos.x = c.maxX + r;
        else if (ox <= c.minX) this.pos.x = c.minX - r;
      }
      // Z 轴
      if (this.pos.x + r > c.minX && this.pos.x - r < c.maxX && this.pos.z + r > c.minZ && this.pos.z - r < c.maxZ) {
        if (oz >= c.maxZ) this.pos.z = c.maxZ + r;
        else if (oz <= c.minZ) this.pos.z = c.minZ - r;
      }
      // 踩上箱顶
      if (c.maxY - this.pos.y < 1.9 && c.maxY - this.pos.y > 0.4 &&
          this.pos.x + r > c.minX && this.pos.x - r < c.maxX && this.pos.z + r > c.minZ && this.pos.z - r < c.maxZ) {
        if (this.vel.y <= 0) { this.pos.y = c.maxY; this.vel.y = 0; this.grounded = true; }
      }
    }
  }

  /* ============ 射击 ============ */

  currentWeapon() { return this.weapons[this.slot]; }

  tryShoot(input, now) {
    const w = this.currentWeapon();
    if (!w || w.reloading || w.equipT > 0 || this.healing || this.dead) return null;
    if (w.def.auto && input.mouseDown) { return w.tryFire(now); }
    if (!w.def.auto && input.pressed('mouseLeftFired')) { /* 半自动在 input 中处理 */ }
    // 半自动：监听按下事件
    return null;
  }

  /** 主循环调用：处理开火（含半自动按下事件） */
  fire(input, now) {
    const w = this.currentWeapon();
    if (!w) return null;
    if (input.pressed('Mouse0')) { if (w.def.auto) return null; return this._doFire(w, now); }
    if (w.def.auto && input.mouseDown) return this._doFire(w, now);
    return null;
  }

  _doFire(w, now) {
    const shot = w.tryFire(now);
    if (!shot) {
      // 空仓 / 换弹中
      if (w.mag <= 0 && w.reserve > 0 && !w.reloading) { w.startReload(); AudioMgr.reloadSfx(); }
      return null;
    }
    // 后座
    this.recoilPitch += shot.recoil;
    this.aimPunch = Math.min(0.5, this.aimPunch + shot.recoil * 0.35);
    // 音效
    AudioMgr.shot(shot.kind, this.legend === 'wraith' ? 0.9 : 1);
    // 枪口火光与弹壳
    const muzzle = this._model.muzzleRef;
    const mw = new THREE.Vector3();
    muzzle.getWorldPosition(mw);
    G.fx.muzzle(mw.x, mw.y, mw.z, shot.kind === 'sniper' ? 2 : shot.kind === 'shotgun' ? 1.6 : 1);
    const side = Math.sin(now * 30) > 0 ? 1 : -1;
    G.fx.shell(mw.x, mw.y, mw.z, side);
    return shot;
  }

  /** 应用弹道散布，生成射线并命中检测（由 BR 调用） */
  shootRay(shot, dirInfo) {
    const eye = this.eyePos();
    const fwd = this._aimDir();
    const up = new THREE.Vector3(0, 1, 0);
    const right = this._right();
    const hits = [];
    for (let i = 0; i < shot.pellets; i++) {
      // 依据散布角 theta/phi 偏移
      const th = dirInfo.theta, ph = dirInfo.phi;
      const d = fwd.clone()
        .addScaledVector(right, Math.tan(th) )
        .addScaledVector(up, Math.tan(ph))
        .normalize();
      const r = { origin: eye.clone(), dir: d, range: shot.range, dmg: shot.dmg };
      hits.push(r);
    }
    return hits;
  }

  /* ============ 受击 / 死亡 ============ */

  takeDamage(dmg, attacker, isHead, silent) {
    if (this.phaseT > 0 || this.dead) return 0;
    let shieldDmg = 0, hpDmg = 0;
    if (this.shield > 0) {
      shieldDmg = Math.min(this.shield, dmg);
      this.shield -= shieldDmg;
      dmg -= shieldDmg;
      if (!silent) AudioMgr.hitMaterial('metal', 0.7);
    }
    if (dmg > 0) {
      hpDmg = dmg;
      this.hp -= dmg;
      if (!silent) AudioMgr.hitMaterial('flesh', 0.8);
    }
    this.dmgFlash = 0.5;
    const total = shieldDmg + hpDmg;
    if (this.hp <= 0) {
      this.hp = 0;
      this.die(attacker);
    }
    return total;
  }

  die(killer) {
    if (this.dead) return;
    this.dead = true;
    this.deathTime = U.now();
    if (this.drone) { this.scene.remove(this.drone.spr); this.drone = null; }
    if (G.br) G.br.onPlayerDeath(killer);
  }

  /* ============ 每帧 ============ */

  update(dt, now, input) {
    if (this.dead) return;
    const w = this.currentWeapon();
    if (w) {
      w.update(dt, now);
      if (w.needsReload) HUD.flashReloadHint();
      // 开镜
      const ads = input.rmbDown && !w.reloading && !this.healing;
      w.ads = ads;
      const target = ads ? 1 : 0;
      w.adsT = U.lerp(w.adsT, target, Math.min(1, dt * (ads ? 10 : 8)));
      // 换弹
      if (input.pressed('KeyR') && w.mag < w.magSize) {
        if (w.startReload()) { AudioMgr.reloadSfx(); HUD.toast('换弹中…', '#cfd6df'); }
      }
      // 后座恢复
      this.recoilPitch *= Math.pow(0.0001, dt);
      if (this.recoilPitch < 0.0005) this.recoilPitch = 0;
      this.aimPunch = U.lerp(this.aimPunch, 0, Math.min(1, dt * 8));
    }
    this.updateSkill(dt);
    this.updateHeal(dt);
    this.dmgFlash = Math.max(0, this.dmgFlash - dt * 1.8);

    // 治疗/手雷快捷键
    if (input.pressed('Digit4')) this.healAutoBlood();
    if (input.pressed('Digit5')) this.healAutoShield();
    if (input.pressed('Digit6') && this.healCount.phoenix > 0) this.tryHeal('phoenix');
    if (input.pressed('KeyG')) this.throwNade();
    if (input.pressed('KeyX')) this.cycleNade();
    if (input.pressed('KeyQ')) this.useSkill(dt);
    if (input.pressed('KeyC')) { /* 滑铲由 updateMovement 处理 */ }
    // 切枪
    if (input.pressed('Digit1')) this.switchSlot(0);
    if (input.pressed('Digit2')) this.switchSlot(1);
    // 滚轮切枪
    if (input.wheelDelta !== 0) {
      const other = this.slot === 0 ? 1 : 0;
      this.switchSlot(other);
    }

    // 武器模型动画（摆动 / 后座 / 开镜）
    this._updateViewModel(dt, input);
  }

  _updateViewModel(dt, input) {
    const g = this._model.group;
    const w = this.currentWeapon();
    // 无武器时隐藏枪械模型（跳伞/空手状态不遮挡视野）
    if (!w) { g.visible = false; return; }
    // 开镜瞄准时隐藏枪械模型（避免模型挡住视野中心）
    if (w.adsT > 0.5) { g.visible = false; return; }
    g.visible = true;
    // 基础位置（右下）
    let px = 0.32, py = -0.34, pz = -0.5;
    let rx = 0, rz = 0;
    // 走路摆动
    const bob = Math.sin(this.bobT * 1.4) * (this.sprinting ? 0.018 : 0.012);
    const bobY = Math.abs(Math.cos(this.bobT * 1.4)) * (this.sprinting ? 0.02 : 0.012);
    // 开镜：移到屏幕中央
    if (w && w.adsT > 0) {
      const t = w.adsT;
      px = U.lerp(px, 0, t);
      py = U.lerp(py, -0.03, t);
      pz = U.lerp(pz, -0.32, t);
      rz = U.lerp(rz, 0, t);
    }
    // 后座：开火后模型向后下沉
    let kick = 0;
    if (w && w.adsT > 0 && this.aimPunch > 0.01) kick = -this.aimPunch * 0.25;
    // 目标值 + 平滑
    this._vm = this._vm || { px, py, pz, rx, rz };
    const k = Math.min(1, dt * 14);
    this._vm.px = U.lerp(this._vm.px, px, k);
    this._vm.py = U.lerp(this._vm.py, py + bobY + kick, k);
    this._vm.pz = U.lerp(this._vm.pz, pz + bob, k);
    this._vm.rx = U.lerp(this._vm.rx, rx, k);
    this._vm.rz = U.lerp(this._vm.rz, rz, k);
    g.position.set(this._vm.px, this._vm.py, this._vm.pz);
    g.rotation.set(this._vm.rx, 0, this._vm.rz);
    // 换弹动画：简单下沉回弹
    if (w && w.reloading) {
      const phase = 1 - w.reloadT / w.def.reload;
      const dip = Math.sin(phase * Math.PI * 3) * 0.08;
      g.position.y -= dip;
      g.rotation.x -= dip * 2;
    }
  }

  /** 跳伞自由落体/滑翔（BR 调用） */
  updateDrop(dt, input) {
    const half = G.world.HALF - 4;
    const fwd = this._forward();
    // 鼠标俯仰控制俯冲
    const dive = U.clamp(1 - (this.pitch * 0.6), 0.05, 1);
    const speed = 12 + 55 * dive;
    this.pos.x = U.clamp(this.pos.x + fwd.x * speed * dt * 0.7, -half, half);
    this.pos.z = U.clamp(this.pos.z + fwd.z * speed * dt * 0.7, -half, half);
    return { dive, speed };
  }
}

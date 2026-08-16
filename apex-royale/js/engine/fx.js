/* ============================================================
 * fx.js — 粒子特效（枪口火光/弹壳/命中火花/曳光/爆炸/烟雾/血迹）
 * 全部程序化：池化 Mesh + Sprite，零图片。
 * ============================================================ */
'use strict';

class FX {
  constructor(scene) {
    this.scene = scene;
    this.pool = [];            // 粒子对象池
    this.group = new THREE.Group();
    scene.add(this.group);
    this._texGlow = this._makeGlowTexture('#ffd9a0', 64);
    this._texSpark = this._makeGlowTexture('#ffe9c0', 16);
    this._texSmoke = this._makeSmokeTexture(48);
    this._texFire = this._makeGlowTexture('#ff9a3c', 48);
    this.muzzleLight = new THREE.PointLight(0xffb060, 0, 18, 2);
    this.muzzleLight.visible = false;
    scene.add(this.muzzleLight);
  }

  _makeGlowTexture(color, size) {
    const c = document.createElement('canvas'); c.width = c.height = size;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grd.addColorStop(0, '#ffffff');
    grd.addColorStop(0.35, color);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(c);
  }

  _makeSmokeTexture(size) {
    const c = document.createElement('canvas'); c.width = c.height = size;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grd.addColorStop(0, 'rgba(200,200,200,0.9)');
    grd.addColorStop(1, 'rgba(120,120,120,0)');
    g.fillStyle = grd; g.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(c);
  }

  _alloc(type, geo, mat) {
    // 从池中找同类型空闲粒子
    for (const p of this.pool) {
      if (!p.active && p.type === type) return p;
    }
    const mesh = new THREE.Mesh(geo, mat);
    mesh.visible = false;
    this.group.add(mesh);
    const p = { mesh, vel: new THREE.Vector3(), active: false, type, life: 0, maxLife: 1, sprite: null, light: null };
    this.pool.push(p);
    return p;
  }

  _allocSprite(type, tex) {
    for (const p of this.pool) {
      if (!p.active && p.type === type) return p;
    }
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    sprite.visible = false;
    this.group.add(sprite);
    const p = { sprite, vel: new THREE.Vector3(), active: false, type, life: 0, maxLife: 1, mesh: null, light: null };
    this.pool.push(p);
    return p;
  }

  /* ---------- 生成器 ---------- */

  /** 命中火花（墙壁/护甲/肉） */
  sparks(x, y, z, dir, color = 0xffc060, n = 6, speed = 7) {
    const geo = new THREE.BoxGeometry(0.07, 0.07, 0.07);
    const mat = new THREE.MeshBasicMaterial({ color });
    for (let i = 0; i < n; i++) {
      const p = this._alloc('spark', geo, mat.clone());
      p.active = true;
      p.mesh.visible = true;
      p.mesh.position.set(x, y, z);
      p.mesh.scale.setScalar(U.rand(0.8, 1.6));
      const spread = 0.6;
      p.vel.set(
        dir.x + U.rand(-spread, spread),
        dir.y + U.rand(0.1, 0.6),
        dir.z + U.rand(-spread, spread)
      ).normalize().multiplyScalar(speed * U.rand(0.5, 1.3));
      p.life = p.maxLife = U.rand(0.15, 0.4);
    }
  }

  /** 弹壳（从抛壳口飞出） */
  shell(x, y, z, side, up = 1) {
    const geo = new THREE.BoxGeometry(0.06, 0.06, 0.16);
    const mat = new THREE.MeshBasicMaterial({ color: 0xcc9a3c });
    const p = this._alloc('shell', geo, mat);
    p.active = true; p.mesh.visible = true;
    p.mesh.position.set(x, y, z);
    p.vel.set(side * U.rand(2, 3.4), U.rand(2.2, 3.4) * up, U.rand(-0.6, 0.6));
    p.life = p.maxLife = U.rand(0.7, 1.1);
    p.mesh.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
  }

  /** 枪口火光 */
  muzzle(x, y, z, scale = 1) {
    const p = this._allocSprite('muzzle', this._texFire);
    p.active = true; p.sprite.visible = true;
    p.sprite.position.set(x, y, z);
    p.sprite.scale.setScalar(0.5 * scale);
    p.life = p.maxLife = 0.05;
    // 点光源闪烁
    this.muzzleLight.position.set(x, y, z);
    this.muzzleLight.intensity = 2.2 * scale;
    this.muzzleLight.visible = true;
    this._muzzleT = 0.05;
  }

  /** 曳光弹 */
  tracer(x0, y0, z0, x1, y1, z1, color = 0xffe9a0) {
    const geo = new THREE.BoxGeometry(0.03, 0.03, 1);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 });
    const p = this._alloc('tracer', geo, mat);
    p.active = true; p.mesh.visible = true;
    const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.1;
    p.mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    p.mesh.scale.set(1, 1, len);
    p.mesh.lookAt(new THREE.Vector3(x1, y1, z1));
    p.life = p.maxLife = 0.07;
  }

  /** 血雾 */
  blood(x, y, z, dir, n = 10) {
    const geo = new THREE.BoxGeometry(0.06, 0.06, 0.06);
    const mat = new THREE.MeshBasicMaterial({ color: 0x8c1f1f });
    for (let i = 0; i < n; i++) {
      const p = this._alloc('blood', geo, mat.clone());
      p.active = true; p.mesh.visible = true;
      p.mesh.position.set(x, y, z);
      p.vel.set(dir.x + U.rand(-0.5, 0.5), U.rand(0.3, 1.4), dir.z + U.rand(-0.5, 0.5))
        .normalize().multiplyScalar(U.rand(2, 5.5));
      p.life = p.maxLife = U.rand(0.3, 0.8);
    }
  }

  /** 爆炸（手雷/火箭） */
  explode(x, y, z, color = 0xff8c2e, power = 1) {
    // 火球
    const fire = this._allocSprite('fire', this._texFire);
    fire.active = true; fire.sprite.visible = true;
    fire.sprite.position.set(x, y, z);
    fire.sprite.scale.setScalar(1.2 * power);
    fire.life = fire.maxLife = 0.35;
    // 烟雾
    for (let i = 0; i < 4; i++) {
      const sm = this._allocSprite('smoke', this._texSmoke);
      sm.active = true; sm.sprite.visible = true;
      sm.sprite.position.set(x + U.rand(-0.5, 0.5), y + U.rand(0, 0.6), z + U.rand(-0.5, 0.5));
      sm.sprite.scale.setScalar(U.rand(2, 3.5) * power);
      sm.vel.set(U.rand(-2, 2), U.rand(2.5, 4.5), U.rand(-2, 2));
      sm.life = sm.maxLife = U.rand(0.8, 1.4);
      sm.sprite.material.opacity = 0.7;
    }
    // 火花
    this.sparks(x, y, z, new THREE.Vector3(0, 1, 0), color, 18, 13 * power);
    // 地面尘土
    for (let i = 0; i < 6; i++) {
      const sm = this._allocSprite('smoke', this._texSmoke);
      sm.active = true; sm.sprite.visible = true;
      sm.sprite.position.set(x + U.rand(-1, 1), y + 0.2, z + U.rand(-1, 1));
      sm.sprite.scale.setScalar(U.rand(1.5, 2.8) * power);
      sm.vel.set(U.rand(-3, 3), U.rand(1.5, 3), U.rand(-3, 3));
      sm.life = sm.maxLife = U.rand(0.5, 0.9);
      sm.sprite.material.opacity = 0.5;
      sm.sprite.material.color.setHex(0x9a8c74);
    }
  }

  /** 治疗光环 */
  healRing(x, y, z, color = 0x4ad66d) {
    const p = this._allocSprite('heal', this._texGlow);
    p.active = true; p.sprite.visible = true;
    p.sprite.position.set(x, y + 0.3, z);
    p.sprite.scale.setScalar(1.2);
    p.sprite.material.color.setHex(color);
    p.life = p.maxLife = 0.8;
  }

  /** 落地尘土（跳伞） */
  dust(x, y, z) {
    for (let i = 0; i < 8; i++) {
      const sm = this._allocSprite('smoke', this._texSmoke);
      sm.active = true; sm.sprite.visible = true;
      sm.sprite.position.set(x + U.rand(-1.5, 1.5), y + 0.3, z + U.rand(-1.5, 1.5));
      sm.sprite.scale.setScalar(U.rand(1.5, 3));
      sm.vel.set(U.rand(-4, 4), U.rand(1, 3), U.rand(-4, 4));
      sm.life = sm.maxLife = U.rand(0.6, 1);
      sm.sprite.material.opacity = 0.45;
      sm.sprite.material.color.setHex(0x8f8268);
    }
  }

  /* ---------- 更新 ---------- */

  update(dt) {
    if (this._muzzleT) {
      this._muzzleT -= dt;
      if (this._muzzleT <= 0) this.muzzleLight.visible = false;
    }
    for (const p of this.pool) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        if (p.mesh) p.mesh.visible = false;
        if (p.sprite) { p.sprite.visible = false; p.sprite.material.opacity = 1; }
        continue;
      }
      const t = p.life / p.maxLife;
      if (p.mesh) {
        p.mesh.position.addScaledVector(p.vel, dt);
        // 简单重力
        if (p.type === 'shell' || p.type === 'blood' || p.type === 'spark') {
          p.vel.y -= 12 * dt;
          // 弹壳落地弹跳
          if (p.type === 'shell' && p.mesh.position.y < 0.05) {
            p.mesh.position.y = 0.05;
            p.vel.y = Math.abs(p.vel.y) * 0.4;
            p.vel.x *= 0.7; p.vel.z *= 0.7;
          }
        }
        p.mesh.rotation.x += p.vel.y * dt * 4;
        p.mesh.rotation.z += dt * 6;
        if (p.type === 'spark' || p.type === 'blood') p.mesh.scale.multiplyScalar(1 - dt * 2);
      }
      if (p.sprite) {
        p.sprite.position.addScaledVector(p.vel, dt);
        p.sprite.material.opacity = t;
        p.sprite.scale.multiplyScalar(1 + dt * (p.type === 'smoke' ? 1.6 : 0.4));
        if (p.type === 'fire') p.sprite.scale.multiplyScalar(1 + dt * 3);
      }
    }
  }
}

/* ============================================================
 * models.js — 外部 3D 模型加载（GLTFLoader）
 * 素材：Soldier.glb（three.js 官方示例，MIT）、
 *       Blaster Kit 枪械（Kenney，CC0）。
 * 异步预加载；失败时返回 null，调用方保留程序化模型兜底。
 * ============================================================ */
'use strict';

const ModelStore = {
  loader: null,
  cache: new Map(),     // name -> THREE.Group（原始，未克隆）
  failed: [],
  loaded: false,
  listeners: [],

  init() {
    if (!window.THREE || !THREE.GLTFLoader) {
      window.__modelLoadError = (window.__modelLoadError || '') + 'GLTFLoader 未加载; ';
      console.warn('[models] GLTFLoader 未加载，外部模型不可用');
      return;
    }
    this.loader = new THREE.GLTFLoader();
    this._load('soldier', 'assets/models/soldier.glb');
    this._load('gun_pistol', 'assets/models/guns/pistol.glb');
    this._load('gun_smg', 'assets/models/guns/smg.glb');
    this._load('gun_rifle', 'assets/models/guns/rifle.glb');
    this._load('gun_sniper', 'assets/models/guns/sniper.glb');
    this._load('gun_shotgun', 'assets/models/guns/shotgun.glb');
    this._load('gun_energy', 'assets/models/guns/energy.glb');
  },

  _load(name, url, retries = 2) {
    this.loader.load(
      url,
      gltf => {
        const g = gltf.scene;
        // 自适应缩放：士兵 ~1.75m 高；枪械最长轴 ~0.55m
        const box = new THREE.Box3().setFromObject(g);
        const size = new THREE.Vector3();
        box.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        const target = name === 'soldier' ? 1.8 : 0.55;
        const s = target / maxDim;
        g.scale.setScalar(s);
        // 居中到原点（枪械以中心为原点；士兵以脚底为原点）
        box.setFromObject(g);
        const c = new THREE.Vector3();
        box.getCenter(c);
        if (name === 'soldier') {
          g.position.y = -box.min.y;
          g.position.x = -c.x; g.position.z = -c.z;
          // 播放空闲动画（防 T-pose）；无骨骼/动画不可用时静态姿势兜底
          if (gltf.animations && gltf.animations.length) {
            try {
              this.soldierMixer = new THREE.AnimationMixer(g);
              const action = this.soldierMixer.clipAction(gltf.animations[0]);
              action.play();
              this._soldierAnim = true;
            } catch (e) {
              this.soldierMixer = null;
              console.warn('[models] 士兵动画不可用，使用静态姿势');
            }
          }
        } else {
          g.position.sub(c);
        }
        this.cache.set(name, g);
        this._checkAll();
      },
      undefined,
      err => {
        if (retries > 0) {
          // 网络抖动自动重试
          console.warn('[models] 加载失败，重试中:', name);
          setTimeout(() => this._load(name, url, retries - 1), 1500);
          return;
        }
        console.warn('[models] 加载失败(使用程序化模型):', name, err && err.message);
        window.__modelLoadError = (window.__modelLoadError || '') + name + ': ' + (err && err.message) + '; ';
        this.failed.push(name);
        this._checkAll();
      }
    );
  },

  _checkAll() {
    const need = ['soldier', 'gun_pistol', 'gun_smg', 'gun_rifle', 'gun_sniper', 'gun_shotgun', 'gun_energy'];
    // 全部有结果（成功或失败）即视为加载阶段完成
    const done = need.every(n => this.cache.has(n) || this.failed.includes(n));
    if (done && !this.loaded) {
      this.loaded = true;
      console.log('[models] 模型加载阶段完成，成功 ' + this.cache.size + '/' + need.length);
      for (const fn of this.listeners) { try { fn(); } catch (e) { console.error(e); } }
      this.listeners = [];
    }
  },

  onLoaded(fn) {
    if (this.loaded) { fn(); return; }
    this.listeners.push(fn);
  },

  /** 获取模型克隆（soldier | gun_<kind>），未加载返回 null */
  get(name) {
    const orig = this.cache.get(name);
    if (!orig) return null;
    return orig.clone();
  },

  /** 每帧更新动画（士兵 idle，避免 T-pose）+ 手动刷新共享骨骼矩阵（orig 不在渲染场景） */
  update(dt) {
    if (this.soldierMixer) this.soldierMixer.update(dt);
    const soldier = this.cache.get('soldier');
    if (soldier) {
      soldier.updateMatrixWorld(true);
      const sk = soldier.getObjectByProperty('isSkinnedMesh', true);
      if (sk && sk.skeleton) sk.skeleton.update();
    }
  },
};

// 由 main.js 在 init 时调用（需 GLTFLoader 已加载）
window.ModelStore = ModelStore;

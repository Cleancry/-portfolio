/* ============================================================
 * loot.js — 战利品（武器/护甲/医疗/手雷/配件）与死亡箱
 * ============================================================ */
'use strict';

const HEALS = {
  syringe: { name: '注射器',  hp: 25, shield: 0,  time: 3, color: '#7ed66a', desc: '+25 生命 · 3s' },
  medkit:  { name: '医疗包',  hp: 50, shield: 0,  time: 5, color: '#4ad66d', desc: '+50 生命 · 5s' },
  cell:    { name: '护盾电池', hp: 0, shield: 50,  time: 3, color: '#4fc3f7', desc: '+50 护甲 · 3s' },
  battery: { name: '大护盾电池', hp: 0, shield: 100, time: 5, color: '#2f9df0', desc: '+100 护甲 · 5s' },
  phoenix: { name: '凤凰治疗包', hp: 100, shield: 100, time: 8, color: '#ffd75e', desc: '满状态 · 8s' },
};

const ARMORS = {
  1: { name: '白色护甲', shield: 25,  color: '#cfd6df', desc: '25 护甲' },
  2: { name: '蓝色护甲', shield: 50,  color: '#4fc3f7', desc: '50 护甲' },
  3: { name: '紫色护甲', shield: 75,  color: '#b06bff', desc: '75 护甲' },
  4: { name: '金色护甲', shield: 100, color: '#ffd75e', desc: '100 护甲 · 治疗加速', gold: true },
};

const NADES = {
  frag:     { name: '碎片手雷', color: '#ff6b4a', dmg: 85, radius: 9, fuse: 2.2, desc: '范围爆炸 85 伤害' },
  arc:      { name: '电弧星',   color: '#8ae0ff', dmg: 60, radius: 6, fuse: 1.6, desc: '爆炸 + 减速', arc: true },
  thermite: { name: '铝热燃烧瓶', color: '#ff9a3c', dmg: 12, radius: 5, fuse: 0.4, dot: 5, dotDps: 12, desc: '区域持续灼烧' },
};

const RARITY_COLORS = ['#cfd6df', '#4fc3f7', '#b06bff', '#ffd75e'];

class LootItem {
  constructor(opts) {
    this.type = opts.type;       // weapon | armor | heal | ammo | attach | nade | box
    this.data = opts.data;       // 具体数据
    this.x = opts.x; this.z = opts.z;
    this.y = opts.y || 0;
    this.rarity = opts.rarity || 0;   // 0白 1蓝 2紫 3金
    this.taken = false;
    this.group = new THREE.Group();
    this._buildMesh();
  }

  _buildMesh() {
    const color = this.rarityColor();
    const g = this.group;
    // 底座（发光柱）
    const pillarGeo = new THREE.CylinderGeometry(0.14, 0.2, 2.2, 6, 1, true);
    const pillarMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false });
    const pillar = new THREE.Mesh(pillarGeo, pillarMat);
    pillar.position.y = 1.1;
    g.add(pillar);
    // 顶光球
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 }));
    orb.position.y = 2.3;
    g.add(orb);
    // 主体形状
    let body;
    if (this.type === 'weapon') {
      body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.2), new THREE.MeshLambertMaterial({ color: 0x3a3f47 }));
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.7, 6), new THREE.MeshLambertMaterial({ color: 0x22262c }));
      barrel.rotation.x = Math.PI / 2; barrel.position.z = -0.45;
      g.add(barrel);
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.24, 0.1), new THREE.MeshLambertMaterial({ color: 0x2a2e35 }));
      grip.position.set(0, -0.18, 0.15);
      g.add(grip);
    } else if (this.type === 'armor') {
      body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.14), new THREE.MeshLambertMaterial({ color: new THREE.Color(color).multiplyScalar(0.6).getHex() }));
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.05), new THREE.MeshBasicMaterial({ color }));
      plate.position.z = 0.1;
      g.add(plate);
    } else if (this.type === 'heal') {
      body = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.34, 6), new THREE.MeshLambertMaterial({ color: new THREE.Color(color).multiplyScalar(0.55).getHex() }));
    } else if (this.type === 'ammo') {
      body = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.24), new THREE.MeshLambertMaterial({ color: 0x4a3a20 }));
      const tip = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.18), new THREE.MeshBasicMaterial({ color: this.data.color }));
      tip.position.y = 0.16;
      g.add(tip);
    } else if (this.type === 'attach') {
      body = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.18, 0.24), new THREE.MeshLambertMaterial({ color: new THREE.Color(color).multiplyScalar(0.5).getHex() }));
      const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.1, 8), new THREE.MeshBasicMaterial({ color }));
      lens.rotation.x = Math.PI / 2; lens.position.y = 0.12;
      g.add(lens);
    } else if (this.type === 'nade') {
      body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshLambertMaterial({ color: new THREE.Color(color).multiplyScalar(0.5).getHex() }));
      const fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.14, 4), new THREE.MeshBasicMaterial({ color }));
      fuse.position.y = 0.16;
      g.add(fuse);
    } else if (this.type === 'box') {
      // 死亡箱
      body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 0.9), new THREE.MeshLambertMaterial({ color: 0x2b3140 }));
      const rim = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.1, 0.96), new THREE.MeshBasicMaterial({ color: this.rarity === 3 ? 0xffd75e : 0x4fc3f7 }));
      rim.position.y = 0.3;
      g.add(rim);
      pillar.scale.set(0.8, 0.8, 0.8); pillar.position.y = 1.0;
      orb.position.y = 1.6; orb.scale.set(0.7, 0.7, 0.7);
    }
    if (body) { body.position.y = 0.35; g.add(body); }
    this.body = body;
  }

  rarityColor() { return RARITY_COLORS[this.rarity] || '#cfd6df'; }

  get name() {
    switch (this.type) {
      case 'weapon': return this.data.displayName || WEAPONS[this.data].name;
      case 'armor': return ARMORS[this.data].name;
      case 'heal': return HEALS[this.data].name;
      case 'ammo': return this.data.name + ' ×' + this.data.amount;
      case 'attach': return this.data.name;
      case 'nade': return NADES[this.data].name;
      case 'box': return '死亡箱';
    }
    return '?';
  }
}

class LootManager {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.items = [];
    this.group = new THREE.Group();
    scene.add(this.group);
  }

  _groundY(x, z) { return this.world.heightAt(x, z) + 0.3; }

  /** 开局在地图战利品点铺货（总数上限控制，防止建筑暴增导致物件过多） */
  scatter() {
    const pts = this.world.lootPoints;
    const MAX = 320;
    let spawned = 0;
    for (const p of pts) {
      if (spawned >= MAX) break;
      const r = Math.random();
      if (r < 0.30) { this.spawn('weapon', p.x, p.z, null, true); spawned++; }
      else if (r < 0.46) { this.spawn('armor', p.x, p.z); spawned++; }
      else if (r < 0.62) { this.spawn('heal', p.x, p.z); spawned++; }
      else if (r < 0.78) { this.spawn('ammo', p.x, p.z); spawned++; }
      else if (r < 0.88) { this.spawn('attach', p.x, p.z); spawned++; }
      else { this.spawn('nade', p.x, p.z); spawned++; }
    }
    // 额外随机散落（开阔地）
    for (let i = 0; i < 40; i++) {
      if (spawned >= MAX + 30) break;
      const x = U.rand(-this.world.HALF * 0.9, this.world.HALF * 0.9);
      const z = U.rand(-this.world.HALF * 0.9, this.world.HALF * 0.9);
      if (!this.world.isWalkable(x, z)) continue;
      const r = Math.random();
      if (r < 0.2) this.spawn('ammo', x, z);
      else if (r < 0.4) this.spawn('heal', x, z);
      else if (r < 0.6) this.spawn('attach', x, z);
      else if (r < 0.75) this.spawn('nade', x, z);
      else this.spawn('armor', x, z);
    }
  }

  /** 生成一件战利品 */
  spawn(type, x, z, data, weaponAttach = false) {
    let item;
    const rar = () => {
      const r = Math.random();
      return r < 0.55 ? 0 : r < 0.82 ? 1 : r < 0.95 ? 2 : 3;
    };
    if (type === 'weapon') {
      const wid = data || rollWeaponId();
      const att = weaponAttach ? rollAttachments() : {};
      const w = new Weapon(wid, att);
      const r = att.sight || att.mag || att.stock || att.choke ? (att.choke ? 3 : 2) : rar();
      item = new LootItem({ type: 'weapon', data: w, x, z, y: this._groundY(x, z), rarity: r });
    } else if (type === 'armor') {
      const lv = data || (Math.random() < 0.5 ? 1 : Math.random() < 0.72 ? 2 : Math.random() < 0.93 ? 3 : 4);
      item = new LootItem({ type: 'armor', data: lv, x, z, y: this._groundY(x, z), rarity: lv - 1 });
    } else if (type === 'heal') {
      const id = data || (Math.random() < 0.4 ? 'syringe' : Math.random() < 0.65 ? 'cell' : Math.random() < 0.85 ? 'medkit' : 'battery');
      item = new LootItem({ type: 'heal', data: id, x, z, y: this._groundY(x, z), rarity: id === 'phoenix' ? 3 : id === 'battery' || id === 'medkit' ? 1 : 0 });
    } else if (type === 'ammo') {
      const amt = data && data.amount ? data.amount : U.randInt(40, 80);
      const ammoType = data && data.type ? data.type : U.pick(['light', 'heavy', 'light', 'energy', 'shotgun', 'sniper']);
      const def = AMMO_TYPES[ammoType];
      item = new LootItem({ type: 'ammo', data: { type: ammoType, name: def.name, color: def.color, amount: amt }, x, z, y: this._groundY(x, z), rarity: 0 });
    } else if (type === 'attach') {
      const id = data || U.pick(ATTACH_POOL);
      item = new LootItem({ type: 'attach', data: ATTACHMENTS[id], x, z, y: this._groundY(x, z), rarity: id.includes('2') || id === 'choke' ? 2 : 1 });
    } else if (type === 'nade') {
      const id = data || U.pick(['frag', 'frag', 'arc', 'thermite']);
      item = new LootItem({ type: 'nade', data: id, x, z, y: this._groundY(x, z), rarity: id === 'frag' ? 0 : 1 });
    }
    if (!item) return null;
    item.group.position.set(x, item.y, z);
    this.group.add(item.group);
    this.items.push(item);
    return item;
  }

  /** 死亡箱（敌人掉落） */
  spawnDeathBox(x, z, contents, gold = false) {
    const item = new LootItem({ type: 'box', data: contents, x, z, y: this._groundY(x, z), rarity: gold ? 3 : 1 });
    item.group.position.set(x, item.y, z);
    this.group.add(item.group);
    this.items.push(item);
    return item;
  }

  /** 拾取逻辑由外部调用；这里处理移除 */
  remove(item) {
    item.taken = true;
    this.group.remove(item.group);
    const i = this.items.indexOf(item);
    if (i >= 0) this.items.splice(i, 1);
  }

  /** 找到玩家附近最近的可拾取战利品 */
  nearest(x, z, maxDist) {
    let best = null, bd = maxDist * maxDist;
    for (const it of this.items) {
      const d = U.dist2(x, z, it.x, it.z);
      if (d < bd) { bd = d; best = it; }
    }
    return best;
  }

  update(dt, time) {
    for (const it of this.items) {
      // 旋转 + 浮动
      it.group.rotation.y += dt * 1.6;
      it.group.position.y = it.y + Math.sin(time * 2 + it.x) * 0.08;
    }
  }
}

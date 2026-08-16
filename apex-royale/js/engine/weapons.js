/* ============================================================
 * weapons.js — 武器数据与实例（手感核心：后座/散布/射速/换弹）
 * 武器命名致敬 Apex Legends 公开武器名。
 * ============================================================ */
'use strict';

const AMMO_TYPES = {
  light:   { name: '轻型弹药', color: '#ffd75e' },
  heavy:   { name: '重型弹药', color: '#ff8a5a' },
  shotgun: { name: '霰弹',     color: '#ff6b4a' },
  sniper:  { name: '狙击弹药', color: '#8ae0ff' },
  energy:  { name: '能量电池', color: '#b06bff' },
};

const WEAPONS = {
  p2020: {
    name: 'P2020', kind: 'pistol', ammo: 'light', mag: 14, reserve: 60,
    fireRate: 5.5, dmg: 18, headMult: 1.6, auto: false,
    spread: 0.010, spreadGrow: 0.006, spreadMax: 0.035,
    recoil: 0.008, recoilRand: 0.005,
    reload: 1.7, equip: 0.5, range: 200, pellets: 1, tracer: false,
    desc: '半自动手枪 · 落地好伙伴',
  },
  re45: {
    name: 'RE-45 自动手枪', kind: 'smg', ammo: 'light', mag: 20, reserve: 120,
    fireRate: 9.5, dmg: 14, headMult: 1.6, auto: true,
    spread: 0.016, spreadGrow: 0.008, spreadMax: 0.05,
    recoil: 0.009, recoilRand: 0.007,
    reload: 2.0, equip: 0.55, range: 180, pellets: 1, tracer: false,
    desc: '全自动手枪 · 高射速',
  },
  r99: {
    name: 'R-99 冲锋枪', kind: 'smg', ammo: 'light', mag: 26, reserve: 160,
    fireRate: 17, dmg: 12, headMult: 1.6, auto: true,
    spread: 0.028, spreadGrow: 0.012, spreadMax: 0.085,
    recoil: 0.011, recoilRand: 0.009,
    reload: 2.2, equip: 0.6, range: 140, pellets: 1, tracer: false,
    desc: '超高射速冲锋枪 · 近战收割机',
  },
  volt: {
    name: '电能冲锋枪', kind: 'energy', ammo: 'energy', mag: 28, reserve: 140,
    fireRate: 12, dmg: 15, headMult: 1.6, auto: true,
    spread: 0.020, spreadGrow: 0.010, spreadMax: 0.06,
    recoil: 0.010, recoilRand: 0.007,
    reload: 2.3, equip: 0.6, range: 160, pellets: 1, tracer: true,
    desc: '能量冲锋枪 · 弹道带曳光',
  },
  flatline: {
    name: 'VK-47 平行步枪', kind: 'rifle', ammo: 'heavy', mag: 30, reserve: 150,
    fireRate: 8.6, dmg: 19, headMult: 1.7, auto: true,
    spread: 0.014, spreadGrow: 0.007, spreadMax: 0.05,
    recoil: 0.013, recoilRand: 0.008,
    reload: 2.5, equip: 0.7, range: 260, pellets: 1, tracer: true,
    desc: '全自动步枪 · 中距离全能',
  },
  longbow: {
    name: '长弓 DMR', kind: 'sniper', ammo: 'sniper', mag: 10, reserve: 50,
    fireRate: 1.8, dmg: 55, headMult: 2.1, auto: false,
    spread: 0.002, spreadGrow: 0.002, spreadMax: 0.004,
    recoil: 0.030, recoilRand: 0.008,
    reload: 3.0, equip: 0.9, range: 600, pellets: 1, tracer: true,
    desc: '半自动狙击步枪 · 一枪惊人',
  },
  eva8: {
    name: 'EVA-8 霰弹枪', kind: 'shotgun', ammo: 'shotgun', mag: 8, reserve: 40,
    fireRate: 3.2, dmg: 9, headMult: 1.3, auto: true,
    spread: 0.055, spreadGrow: 0.0, spreadMax: 0.055,
    recoil: 0.030, recoilRand: 0.01,
    reload: 2.4, equip: 0.7, range: 60, pellets: 8, tracer: false,
    desc: '全自动霰弹枪 · 8 颗弹丸',
  },
};

const ATTACHMENTS = {
  sight1:  { name: '1x 全息', type: 'sight', sightZoom: 1, spreadMul: 0.85 },
  sight2:  { name: '2x 镜',   type: 'sight', sightZoom: 1.6, spreadMul: 0.7 },
  sight4:  { name: '4x 镜',   type: 'sight', sightZoom: 2.6, spreadMul: 0.5 },
  mag1:    { name: '扩容弹匣 I',  type: 'mag', magMul: 1.3 },
  mag2:    { name: '扩容弹匣 II', type: 'mag', magMul: 1.6 },
  stock1:  { name: '标准枪托',   type: 'stock', recoilMul: 0.85 },
  stock2:  { name: '精良枪托',   type: 'stock', recoilMul: 0.68 },
  choke:   { name: '收束器',     type: 'choke', spreadMul: 0.6, pellets: 1.25 },
};

const ATTACH_POOL = ['sight1', 'sight2', 'mag1', 'mag2', 'stock1', 'stock2', 'choke'];

class Weapon {
  constructor(defId, attachments = {}) {
    this.def = WEAPONS[defId];
    this.id = defId;
    this.att = Object.assign({ sight: null, mag: null, stock: null, choke: null }, attachments);
    this.magSize = Math.round(this.def.mag * (this.att.mag ? this.att.mag.magMul : 1));
    this.mag = this.magSize;
    this.reserve = this.def.reserve;
    this.reloading = false;
    this.reloadT = 0;
    this.fireCd = 0;
    this.spread = this.def.spread;
    this.equipT = 0;
    this.ads = false;
    this.adsT = 0;           // 0..1 开镜平滑
    this._lastFire = 0;
  }

  get displayName() {
    let n = this.def.name;
    if (this.att.sight) n += ' · ' + this.att.sight.name;
    return n;
  }

  get recoilMul() { return this.att.stock ? this.att.stock.recoilMul : 1; }
  get spreadMul() {
    let m = 1;
    if (this.att.sight) m *= this.att.sight.spreadMul;
    if (this.att.choke) m *= this.att.choke.spreadMul;
    if (this.ads) m *= 0.3;
    return m;
  }
  get pellets() { return Math.round(this.def.pellets * (this.att.choke ? this.att.choke.pellets : 1)); }
  get dmg() { return this.def.dmg * (this.att.choke ? 1.15 : 1); }
  get sightZoom() { return this.att.sight ? this.att.sight.sightZoom : 1; }

  tryFire(now) {
    if (this.fireCd > 0 || this.reloading || this.mag <= 0 || this.equipT > 0) return null;
    this.fireCd = 1 / this.def.fireRate;
    this.mag--;
    // 散布增长
    this.spread = Math.min(this.def.spreadMax, this.spread + this.def.spreadGrow * (1 + (this.def.pellets - 1) * 0.2));
    const dir = this._spreadDir();
    return {
      dir,
      dmg: this.dmg,
      headMult: this.def.headMult,
      pellets: this.pellets,
      range: this.def.range,
      kind: this.def.kind,
      recoil: this.def.recoil * this.recoilMul,
      recoilRand: this.def.recoilRand,
      tracer: this.def.tracer,
      weaponId: this.id,
    };
  }

  /** 当前弹道方向（准星方向 + 散布） */
  _spreadDir() {
    const s = this.spread * this.spreadMul;
    // 相对相机正前方的随机偏移（球坐标）
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * s;
    return { theta: r * Math.cos(a), phi: r * Math.sin(a) };
  }

  startReload() {
    if (this.reloading || this.mag >= this.magSize || this.reserve <= 0) return false;
    this.reloading = true;
    this.reloadT = this.def.reload;
    return true;
  }

  updateReload(dt) {
    if (!this.reloading) return;
    this.reloadT -= dt;
    if (this.reloadT <= 0) {
      const need = this.magSize - this.mag;
      const take = Math.min(need, this.reserve);
      this.mag += take;
      this.reserve -= take;
      this.reloading = false;
    }
  }

  /** 每帧更新（恢复散布 / 冷却 / 开镜平滑） */
  update(dt, now) {
    if (this.fireCd > 0) this.fireCd -= dt;
    if (this.equipT > 0) this.equipT -= dt;
    // 散布恢复
    const target = this.def.spread;
    this.spread = target + (this.spread - target) * Math.pow(0.0015, dt);
    if (Math.abs(this.spread - target) < 0.0005) this.spread = target;
    this.updateReload(dt);
  }

  /** 空仓提示 */
  get needsReload() { return this.mag === 0 && this.reserve > 0 && !this.reloading; }
}

/** 根据权重随机生成战利品武器 */
function rollWeaponId() {
  const table = [
    ['p2020', 22], ['re45', 18], ['r99', 14], ['volt', 14],
    ['flatline', 15], ['longbow', 9], ['eva8', 8],
  ];
  let total = 0; for (const [, w] of table) total += w;
  let r = Math.random() * total;
  for (const [id, w] of table) { if ((r -= w) <= 0) return id; }
  return 'p2020';
}

/** 随机生成配件组合（约 35% 概率带配件） */
function rollAttachments() {
  const att = {};
  if (Math.random() < 0.35) att.sight = ATTACHMENTS[U.pick(['sight1', 'sight2'])];
  if (Math.random() < 0.3) att.mag = ATTACHMENTS[U.pick(['mag1', 'mag2'])];
  if (Math.random() < 0.2) att.stock = ATTACHMENTS[U.pick(['stock1', 'stock2'])];
  if (Math.random() < 0.15) att.choke = ATTACHMENTS.choke;
  return att;
}

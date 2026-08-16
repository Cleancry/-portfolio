/* ============================================================
 * util.js — 工具函数
 * ============================================================ */
'use strict';

const U = {
  clamp(v, a, b) { return v < a ? a : v > b ? b : v; },
  lerp(a, b, t) { return a + (b - a) * t; },
  clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; },
  rand(a, b) { return a + Math.random() * (b - a); },
  randInt(a, b) { return Math.floor(U.rand(a, b + 1)); },
  pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; },
  dist2(ax, ay, bx, by) { const dx = bx - ax, dy = by - ay; return dx * dx + dy * dy; },
  dist(ax, ay, bx, by) { return Math.sqrt(U.dist2(ax, ay, bx, by)); },
  angleTo(ax, ay, bx, by) { return Math.atan2(by - ay, bx - ax); },
  /** 角度差（弧度，[-PI,PI]） */
  angleDiff(a, b) {
    let d = (b - a) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  },
  /** 一维 value noise，输入 [0,1]x[0,1] 输出 ~[0,1] */
  noise2(x, y, seed) {
    const s = seed || 1337;
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    const h = (a, b) => {
      let n = a * 374761393 + b * 668265263 + s * 1442695040888963407;
      n = (n ^ (n >> 13)) * 1274126177;
      return ((n ^ (n >> 16)) >>> 0) / 4294967295;
    };
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const v00 = h(ix, iy), v10 = h(ix + 1, iy), v01 = h(ix, iy + 1), v11 = h(ix + 1, iy + 1);
    return U.lerp(U.lerp(v00, v10, sx), U.lerp(v01, v11, sx), sy);
  },
  /** 分形噪声（多层叠加） */
  fbm(x, y, octaves, seed) {
    let v = 0, amp = 1, freq = 1, total = 0;
    for (let i = 0; i < octaves; i++) {
      v += U.noise2(x * freq, y * freq, seed + i * 101) * amp;
      total += amp;
      amp *= 0.5; freq *= 2;
    }
    return v / total;
  },
  now() { return (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000; },
  fmtTime(sec) {
    sec = Math.max(0, Math.floor(sec));
    const m = Math.floor(sec / 60), s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  },
  /** 简易 UUID */
  uid() { return 'id' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36); },
};

/** 全局事件小总线 */
class Emitter {
  constructor() { this._m = {}; }
  on(ev, fn) { (this._m[ev] = this._m[ev] || []).push(fn); return this; }
  off(ev, fn) {
    const l = this._m[ev]; if (!l) return;
    const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1);
  }
  emit(ev, ...args) {
    const l = this._m[ev]; if (!l) return;
    for (const fn of l.slice()) { try { fn(...args); } catch (e) { console.error('[emit]', ev, e); } }
  }
}

/** 简易 3D AABB */
class AABB {
  constructor(minX, minY, minZ, maxX, maxY, maxZ) {
    this.min = new THREE.Vector3(minX, minY, minZ);
    this.max = new THREE.Vector3(maxX, maxY, maxZ);
  }
  containsXZ(x, z, pad = 0) {
    return x >= this.min.x - pad && x <= this.max.x + pad &&
           z >= this.min.z - pad && z <= this.max.z + pad;
  }
  /** 球 vs AABB 最近点距离 */
  distToPoint(px, py, pz) {
    const cx = U.clamp(px, this.min.x, this.max.x);
    const cy = U.clamp(py, this.min.y, this.max.y);
    const cz = U.clamp(pz, this.min.z, this.max.z);
    return Math.sqrt((px - cx) ** 2 + (py - cy) ** 2 + (pz - cz) ** 2);
  }
}

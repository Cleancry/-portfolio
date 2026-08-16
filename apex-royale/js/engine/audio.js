/* ============================================================
 * audio.js — 音频管理器
 * 素材音效（CC0）：枪声来自 The Free Firearm Sound Library，
 * 脚步/命中/UI 来自 Kenney（RPG Audio / Impact Sounds）。
 * 兜底：素材加载失败时用 WebAudio 程序化合成。
 * ============================================================ */
'use strict';

class AudioManager {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.buffers = new Map();   // name -> AudioBuffer
    this.synthCache = new Map();
    this.listener = null;
    this.muted = false;
    this._initCtx();
  }

  _initCtx() {
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.85;
      this.master.connect(this.ctx.destination);
      this.listener = this.ctx.listener;
    } catch (e) {
      console.warn('AudioContext unavailable', e);
      this.ctx = null;
    }
  }

  /** 浏览器要求用户手势后才恢复 context */
  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  async loadAll() {
    if (!this.ctx) return;
    const names = [
      'gunshot.wav', 'pistol.wav', 'rifle.wav', 'sniper.wav', 'shotgun.wav',
      'footstep00.ogg', 'footstep01.ogg', 'footstep02.ogg', 'footstep03.ogg', 'footstep04.ogg',
      'footstep_grass_000.ogg', 'footstep_grass_001.ogg', 'footstep_grass_002.ogg',
      'footstep_concrete_000.ogg', 'footstep_concrete_001.ogg',
      'footstep_wood_000.ogg', 'footstep_wood_001.ogg',
      'impactMetal_light_000.ogg', 'impactMetal_light_001.ogg',
      'impactMetal_heavy_000.ogg', 'impactMetal_heavy_001.ogg',
      'impactGeneric_light_000.ogg', 'impactGeneric_light_001.ogg',
      'impactGlass_light_000.ogg', 'impactGlass_light_001.ogg',
      'impactWood_light_000.ogg', 'impactWood_light_001.ogg',
      'ui_click.ogg', 'ui_coin.ogg', 'armor.ogg', 'reload.ogg',
    ];
    await Promise.all(names.map(n => this._load(n)));
  }

  _load(name) {
    return fetch('assets/sfx/' + name)
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); })
      .then(buf => this.ctx.decodeAudioData(buf))
      .then(audio => { this.buffers.set(name, audio); })
      .catch(e => { console.warn('[audio] 加载失败(将用合成音):', name, e.message); });
  }

  /* ---------- 合成兜底 ---------- */

  _synthGun(type) {
    if (!this.ctx) return null;
    const c = this.synthCache.get(type);
    if (c) return c;
    const ctx = this.ctx;
    const len = ctx.sampleRate * (type === 'sniper' ? 0.5 : type === 'shotgun' ? 0.45 : 0.3);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    const noise = new Array(2048);
    for (let i = 0; i < noise.length; i++) noise[i] = Math.random() * 2 - 1;
    let t = 0;
    const decay = type === 'sniper' ? 0.16 : type === 'shotgun' ? 0.14 : 0.08;
    const base = type === 'sniper' ? 160 : type === 'shotgun' ? 220 : type === 'smg' ? 260 : 200;
    for (let i = 0; i < len; i++, t += 1 / ctx.sampleRate) {
      const env = Math.exp(-t / decay) * Math.min(1, t / 0.002);
      // 噪声 + 低频主体（枪口爆音）
      let v = noise[i % noise.length] * 0.9;
      v += Math.sin(2 * Math.PI * base * t) * 0.5 * Math.exp(-t / (decay * 0.6));
      if (type === 'sniper') v += Math.sin(2 * Math.PI * 70 * t) * 0.7 * Math.exp(-t / 0.25);
      d[i] = v * env;
    }
    this.synthCache.set(type, buf);
    return buf;
  }

  _synthHit() {
    if (!this.ctx) return null;
    if (this.synthCache.has('hit')) return this.synthCache.get('hit');
    const ctx = this.ctx;
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.08, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) {
      const t = i / ctx.sampleRate;
      d[i] = (Math.random() * 2 - 1) * Math.exp(-t / 0.02) * 0.7;
    }
    this.synthCache.set('hit', buf);
    return buf;
  }

  /* ---------- 播放 ---------- */

  _playBuf(buf, opts = {}) {
    if (!this.ctx || !buf || this.muted) return null;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    if (opts.rate) src.playbackRate.value = opts.rate;
    const g = this.ctx.createGain();
    g.gain.value = opts.volume == null ? 1 : opts.volume;
    // 快速淡出：砍掉录音长尾，让枪声干脆无回响
    if (opts.fadeOut) {
      const now = this.ctx.currentTime;
      g.gain.setValueAtTime(g.gain.value, now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + opts.fadeOut);
      src.onended = null;
    }
    let node = src;
    if (opts.filter) {
      const f = this.ctx.createBiquadFilter();
      f.type = opts.filter.type || 'lowpass';
      f.frequency.value = opts.filter.freq || 4000;
      node.connect(f); node = f;
    }
    if (opts.pan) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = opts.pan;
      node.connect(p); node = p;
    }
    node.connect(g);
    g.connect(this.master);
    src.start();
    return src;
  }

  play(name, opts) {
    const buf = this.buffers.get(name);
    if (buf) return this._playBuf(buf, opts);
    // 兜底：按名合成就近音色
    if (name.includes('shot') || name.includes('gun')) {
      const type = name.includes('sniper') ? 'sniper' : name.includes('shotgun') ? 'shotgun' : name.includes('smg') ? 'smg' : 'pistol';
      return this._playBuf(this._synthGun(type), opts);
    }
    if (name.includes('impact')) return this._playBuf(this._synthHit(), opts);
    return null;
  }

  /** 空间播放：根据相机位置距离衰减 + 左右声道 */
  playAt(name, x, y, z, opts = {}) {
    const cam = (window.G && window.G.camera) ? window.G.camera.position : null;
    if (!cam) return this.play(name, opts);
    const lx = cam.x, lz = cam.z;
    const dx = x - lx, dz = z - lz;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const maxD = opts.maxDist || 120;
    const vol = opts.volume == null ? 1 : opts.volume;
    let v = vol * U.clamp(1 - dist / maxD, 0, 1);
    v *= v * 1.4; // 距离平方衰减感
    if (v <= 0.01) return null;
    const pan = U.clamp(dx / (maxD * 0.6), -1, 1) * 0.8;
    return this.play(name, { ...opts, volume: v, pan });
  }

  /* ---------- 游戏语义化音效 ---------- */

  shot(kind, vol = 1) {
    const map = {
      pistol: ['pistol.wav', 1.0, 0.22],
      smg: ['pistol.wav', 1.45, 0.16],
      rifle: ['rifle.wav', 1.0, 0.28],
      shotgun: ['shotgun.wav', 1.0, 0.22],
      sniper: ['sniper.wav', 1.0, 0.5],
      energy: ['gunshot.wav', 1.6, 0.2],
      lmg: ['rifle.wav', 0.85, 0.24],
    };
    const [f, rate, fade] = map[kind] || map.pistol;
    const src = this.play(f, { volume: vol * 0.9, rate, fadeOut: fade });
    if (src && kind === 'smg') src.onended = null;
    return src;
  }

  /** 距离衰减的枪声（敌人开火）——音量低于玩家枪声，避免混响感 */
  shotAt(kind, x, z, vol = 1) {
    return this.playAt(this.kindToFile(kind), x, z, 0, {
      volume: vol * 0.5, rate: this.kindRate(kind), maxDist: 160,
      fadeOut: kind === 'sniper' ? 0.5 : kind === 'rifle' ? 0.28 : 0.2,
    });
  }

  kindToFile(kind) {
    switch (kind) {
      case 'sniper': return 'sniper.wav';
      case 'shotgun': return 'shotgun.wav';
      case 'rifle': case 'lmg': return 'rifle.wav';
      default: return 'pistol.wav';
    }
  }
  kindRate(kind) {
    switch (kind) {
      case 'smg': return 1.45;
      case 'energy': return 1.6;
      case 'rifle': case 'lmg': return 1.0;
      default: return 1.0;
    }
  }

  footstep(surface, x, z, vol = 1) {
    let pool = ['footstep00.ogg', 'footstep01.ogg', 'footstep02.ogg', 'footstep03.ogg'];
    if (surface === 'grass') pool = ['footstep_grass_000.ogg', 'footstep_grass_001.ogg', 'footstep_grass_002.ogg'];
    else if (surface === 'concrete') pool = ['footstep_concrete_000.ogg', 'footstep_concrete_001.ogg'];
    else if (surface === 'wood') pool = ['footstep_wood_000.ogg', 'footstep_wood_001.ogg'];
    return this.playAt(U.pick(pool), x, z, 0, { volume: vol * 0.5, maxDist: 40 });
  }

  hitMaterial(mat, vol = 1) {
    let pool = ['impactGeneric_light_000.ogg', 'impactGeneric_light_001.ogg'];
    if (mat === 'metal') pool = ['impactMetal_light_000.ogg', 'impactMetal_light_001.ogg', 'impactMetal_heavy_000.ogg'];
    else if (mat === 'glass') pool = ['impactGlass_light_000.ogg', 'impactGlass_light_001.ogg'];
    else if (mat === 'wood') pool = ['impactWood_light_000.ogg', 'impactWood_light_001.ogg'];
    return this._playBuf(this.buffers.get(U.pick(pool)) || this._synthHit(), { volume: vol * 0.6 });
  }

  uiClick() { this.play('ui_click.ogg', { volume: 0.7 }); }
  uiCoin() { this.play('ui_coin.ogg', { volume: 0.6 }); }
  armorUp() { this.play('armor.ogg', { volume: 0.9 }); }
  reloadSfx() { this.play('reload.ogg', { volume: 0.8 }); }
  heal() { this.play('ui_coin.ogg', { volume: 0.5 }); }
  /** 柔和缩圈提示音（短促双音"叮"，低音量，仅轻微提醒） */
  _synthZone() {
    if (this.synthCache.has('zone')) return this.synthCache.get('zone');
    const ctx = this.ctx;
    const dur = 0.45;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    const f1 = 587.3, f2 = 740;   // D5 → F#5 轻快上行的提示音
    for (let i = 0; i < len; i++) {
      const t = i / ctx.sampleRate;
      const f = t < 0.22 ? f1 : f2;
      const env = Math.exp(-(t - (t < 0.22 ? 0 : 0.22)) / 0.12) * Math.min(1, t / 0.01);
      d[i] = (Math.sin(2 * Math.PI * f * t) + Math.sin(2 * Math.PI * f * 2 * t) * 0.25) * env * 0.4;
    }
    this.synthCache.set('zone', buf);
    return buf;
  }

  /** 缩圈音效已取消（用户要求静音，改用顶部文字提示） */
  zoneWarn() { /* 静音：不再播放 */ }
  killConfirm() { this._playBuf(this._synthHit(), { volume: 0.8, rate: 1.4, filter: { type: 'highpass', freq: 3000 } }); }

  setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : 0.85; }
  toggleMute() { this.setMuted(!this.muted); return this.muted; }
}

window.AudioMgr = new AudioManager();

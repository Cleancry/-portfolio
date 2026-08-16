/* ============================================================
 * input.js — 键盘 / 鼠标 / 指针锁定
 * ============================================================ */
'use strict';

class InputManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = {};
    this.down = {};        // 本帧按下（消费后清除）
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.mouseDown = false;   // 左键按住（开火）
    this.rmbDown = false;     // 右键按住（开镜）
    this.locked = false;
    this.sensitivity = 1.0;
    this.onLockChange = null;

    window.addEventListener('keydown', e => {
      if (e.repeat) return;
      this.keys[e.code] = true;
      this.down[e.code] = true;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', e => { this.keys[e.code] = false; });
    window.addEventListener('blur', () => { this.keys = {}; });

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) { this.mouseDown = false; this.rmbDown = false; }
      if (this.onLockChange) this.onLockChange(this.locked);
    });
    document.addEventListener('pointerlockerror', () => {
      if (window.HUD) HUD.toast('鼠标锁定失败，请点击游戏画面锁定', '#ff8a5a');
    });

    canvas.addEventListener('mousedown', e => {
      // 开火不依赖 Pointer Lock（未锁定时点击也应记录开火）
      if (e.button === 0) { this.mouseDown = true; this.down['Mouse0'] = true; }
      if (e.button === 2) this.rmbDown = true;
      // 浏览器要求 requestPointerLock 必须在用户手势（事件回调）中调用，
      // 在 rAF 循环里调用会被拒绝 → 这里直接请求锁定（修复右键被当手势）
      if (!this.locked) {
        const G = window.G;
        if (G && G.br && ['playing', 'drop', 'dropship'].includes(G.br.state)) this.lock();
      }
    });
    window.addEventListener('mouseup', e => {
      if (e.button === 0) this.mouseDown = false;
      if (e.button === 2) this.rmbDown = false;
    });
    document.addEventListener('mousemove', e => {
      if (!this.locked) return;
      this.mouseDX += e.movementX * this.sensitivity;
      this.mouseDY += e.movementY * this.sensitivity;
    });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
  }

  lock() {
    if (!this.locked && this.canvas.requestPointerLock) {
      try { this.canvas.requestPointerLock(); } catch (e) {}
    }
  }
  unlock() {
    if (this.locked && document.exitPointerLock) document.exitPointerLock();
  }

  /** 每帧末尾调用，消费累计移动量与按下一帧标记 */
  endFrame() {
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.down = {};
  }

  key(code) { return !!this.keys[code]; }
  pressed(code) { return !!this.down[code]; }
}

window.Input = null;

/* ============================================================
 * main.js — 主入口：场景 / 相机 / 主循环 / 射击 / 拾取 / 自检
 * ============================================================ */
'use strict';

const G = {};

function init() {
  const canvas = document.getElementById('game-canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.shadowMap.enabled = false;
  renderer.setClearColor(0x87a0b8);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x9db4c8, 180, 620);

  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.08, 1200);
  camera.rotation.order = 'YXZ';

  // 灯光
  const hemi = new THREE.HemisphereLight(0xbdd6ff, 0x3d5a30, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2dd, 1.1);
  sun.position.set(220, 320, -140);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0x8ab0ff, 0.35);
  fill.position.set(-180, 120, 200);
  scene.add(fill);

  // 天空（大球渐变）
  const skyGeo = new THREE.SphereGeometry(900, 16, 12);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(0x6fa8dc) },
      bottom: { value: new THREE.Color(0xcfe4f5) },
      sunDir: { value: new THREE.Vector3(0.4, 0.7, -0.3).normalize() },
    },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `
      uniform vec3 top; uniform vec3 bottom; uniform vec3 sunDir; varying vec3 vP;
      void main(){
        float h = normalize(vP).y;
        vec3 col = mix(bottom, top, clamp(h*1.4+0.2, 0.0, 1.0));
        float s = max(dot(normalize(vP), sunDir), 0.0);
        col += vec3(1.0, 0.92, 0.75) * pow(s, 8.0) * 0.6;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  scene.add(new THREE.Mesh(skyGeo, skyMat));

  // 引擎与玩法
  const world = new GameWorld(scene);
  const fx = new FX(scene);
  const loot = new LootManager(scene, world);
  const player = new Player(scene, camera);
  const br = new BattleRoyale(scene, camera, renderer);
  const input = new InputManager(canvas);
  window.Input = input;

  Object.assign(G, { scene, camera, renderer, world, fx, loot, player, br, input });
  window.G = G;
  br.G = G; // 大逃杀管理器反向引用全局
  G.enemies = br.enemies; // 敌人数组统一引用（hud/main/enemy 通过 G.enemies 访问）

  // 输入扩展：滚轮
  input.wheelDelta = 0;
  window.addEventListener('wheel', e => { input.wheelDelta = e.deltaY; });

  // 窗口缩放
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // 指针锁丢失 → 暂停
  input.onLockChange = locked => {
    if (!locked && G.br.state === 'playing' && !G.player.dead) HUD.showPause();
  };

  HUD.init();
  HUD.showMenu();
  ModelStore.init();
  ModelStore.onLoaded(() => {
    if (window.__modelLoadError) {
      HUD.toast('部分模型加载失败，已使用程序化外观', '#ff8a5a');
    }
  });
  AudioMgr.loadAll().then(() => console.log('[audio] 素材加载完成'));

  // 游戏内版本号（便于核对浏览器缓存是否最新）
  const verTag = document.createElement('div');
  verTag.textContent = 'v2.3';
  verTag.style.cssText = 'position:fixed;top:4px;left:50%;transform:translateX(-50%);color:#ffffff55;font-size:11px;z-index:99;pointer-events:none;letter-spacing:1px;';
  document.body.appendChild(verTag);
  // 锁定提示（未锁定且对局中时显示）
  const lockHint = document.createElement('div');
  lockHint.textContent = '🖱 点击画面锁定鼠标';
  lockHint.style.cssText = 'position:fixed;bottom:22%;left:50%;transform:translateX(-50%);color:#ffd75e;background:#000000aa;padding:6px 16px;border-radius:4px;font-size:13px;z-index:98;display:none;letter-spacing:1px;';
  document.body.appendChild(lockHint);
  window.__lockHint = lockHint;

  // 模型状态屏显（诊断用）：显示加载/失败/挂载情况，便于定位用户环境问题
  const modelTag = document.createElement('div');
  modelTag.id = 'model-tag';
  modelTag.style.cssText = 'position:fixed;top:8px;left:50%;transform:translateX(-50%);color:#ffe9a8;font-size:13px;z-index:99;pointer-events:none;letter-spacing:0.5px;background:#00000088;padding:3px 12px;border-radius:4px;border:1px solid #ffd75e66;';
  document.body.appendChild(modelTag);
  function updateModelTag() {
    const ms = window.ModelStore;
    const G = window.G;
    if (!ms || !G) return;
    const loaded = ms.cache.size;
    const failed = ms.failed.length;
    const gltfMissing = !THREE.GLTFLoader ? ' GLTFLoader缺失!' : '';
    const enemyWith = (G.enemies || []).filter(e => e.modelMesh).length;
    const err = window.__modelLoadError ? ' | 失败原因:' + window.__modelLoadError.slice(0, 60) : '';
    modelTag.textContent = `[${G.br ? G.br.state : '?'}] 模型 ${loaded}/7 失败${failed}${gltfMissing} · 敌人 ${enemyWith}/${(G.enemies || []).length}${err}`;
  }
  setInterval(updateModelTag, 1200);
  window.__updateModelTag = updateModelTag;
  // 模型加载阶段完成后：失败则中央大横幅提示原因
  ModelStore.onLoaded(() => {
    if (window.__modelLoadError) {
      const banner = document.createElement('div');
      banner.style.cssText = 'position:fixed;top:18%;left:50%;transform:translateX(-50%);color:#ff6b5a;background:#000000cc;padding:10px 20px;border-radius:6px;font-size:16px;z-index:120;border:1px solid #ff6b5a66;text-align:center;';
      banner.innerHTML = '⚠ 士兵模型加载失败，敌人使用程序模型<br><span style="font-size:12px;color:#ffd75e">' + (window.__modelLoadError || '') + '</span>';
      document.body.appendChild(banner);
      setTimeout(() => banner.remove(), 6000);
    }
  });

  // file:// 协议提示：必须通过 HTTP 服务器访问（音频 fetch 会被 CORS 拦截）
  if (location.protocol === 'file:') {
    const hint = document.querySelector('.menu-hint');
    if (hint) {
      hint.innerHTML = '⚠ 检测到直接打开了本地文件，游戏音效无法加载。<br>请运行根目录的 <b>打开游戏.bat</b>（或 <b>serve.ps1</b>）后访问<br><b>http://localhost:8092/</b>';
    }
  }

  // 自检模式
  if (new URLSearchParams(location.search).has('selftest')) runSelfTest();

  mainLoop(0);
}

/* ============ 主循环 ============ */

let _last = 0;
function mainLoop(t) {
  requestAnimationFrame(mainLoop);
  const now = t / 1000;
  const dt = Math.min(0.05, now - _last || 0.016);
  _last = now;

  const st = G.br.state;
  if (st === 'menu' || st === 'end') {
    // 菜单背景：缓慢旋转相机看地图
    G.camera.position.set(Math.sin(now * 0.05) * 260, 120, Math.cos(now * 0.05) * 260);
    G.camera.lookAt(0, 0, 0);
    G.world.group.visible = true;
    G.fx.update(dt);
    G.loot.update(dt, now);
    G.renderer.render(G.scene, G.camera);
    return;
  }

  const p = G.player;
  const input = G.input;

  // 输入 → 相机旋转（后座/开镜/灵敏度）
  // 未锁定时：按下鼠标键自动请求锁定（修复"右键开镜被浏览器当手势"）
  if (!input.locked && (st === 'playing' || st === 'dropship' || st === 'drop') &&
      (input.mouseDown || input.rmbDown || input.pressed('Mouse0'))) {
    input.lock();
  }
  if (input.locked && st !== 'dropship') {
    const adsSens = p.currentWeapon() && p.currentWeapon().adsT > 0.3 ? 0.55 : 1;
    p.yaw -= input.mouseDX * 0.0021 * adsSens;
    p.pitch -= input.mouseDY * 0.0021 * adsSens;
    p.pitch = U.clamp(p.pitch, -1.5, 1.5);
  }

  // 大逃杀更新
  G.br.update(dt, now, input);

  if (st === 'playing' || st === 'dead') {
    p.updateMovement(dt, G.world, input);
    p.update(dt, now, input);

    // 射击
    if (st === 'playing' && !p.dead) {
      const shot = p.fire(input, now);
      if (shot) {
        processShot(shot, shot.dir);
      }
      // 拾取
      if (input.pressed('KeyE')) tryPickup();
    }

    // 相机应用
    applyCamera(dt);

    // HUD
    HUD.update(dt, now);

    // 相位特效
    if (p.phaseT > 0) {
      p._model.group.visible = (Math.sin(now * 30) > -0.6);
      G.camera.position.y += Math.sin(now * 40) * 0.02;
    } else {
      p._model.group.visible = true;
    }
  } else if (st === 'drop' || st === 'dropship') {
    applyCamera(dt);
    G.camera.rotation.order = 'YXZ';
    p._model.group.visible = false;   // 跳伞阶段收起武器，避免遮挡视野
  }

  G.fx.update(dt);
  G.loot.update(dt, now);
  if (window.ModelStore) ModelStore.update(dt);
  G.renderer.render(G.scene, G.camera);
  if (window.__lockHint) {
    window.__lockHint.style.display = (!input.locked && ['playing', 'drop', 'dropship'].includes(st)) ? 'block' : 'none';
  }
  input.wheelDelta = 0;
  input.endFrame();
}

/* ============ 相机 ============ */

function applyCamera(dt) {
  const p = G.player;
  // 眼睛高度（滑铲/跳跃平滑）
  const eye = p.eyePos();
  G.camera.position.set(eye.x, eye.y, eye.z);
  // 摆动（走路时轻微晃动）
  const bob = p.grounded ? Math.sin(p.bobT * 0.9) * 0.02 : 0;
  G.camera.rotation.set(p.pitch + bob, p.yaw, 0, 'YXZ');
  // 开镜 FOV
  const w = p.currentWeapon();
  const targetFov = w && w.adsT > 0 ? 75 - (w.sightZoom >= 2 ? 45 : 25) : 75;
  G.camera.fov = U.lerp(G.camera.fov, targetFov, Math.min(1, dt * 9));
  G.camera.updateProjectionMatrix();
}

/* ============ 射击处理 ============ */

function processShot(shot, dirInfo) {
  const p = G.player;
  const w = p.currentWeapon();
  const eye = p.eyePos();
  const fwd = p._aimDir();   // 含 pitch 的瞄准方向（否则抬头/低头时子弹水平射出打不中人）
  const right = p._right();
  const up = new THREE.Vector3(0, 1, 0);

  // 命中目标集合
  const targets = [];
  for (const e of G.enemies) {
    if (e.dead || e.dropping) continue;
    targets.push({ mesh: e.bodyMesh, enemy: e, head: false });
    targets.push({ mesh: e.headMesh, enemy: e, head: true });
  }
  const wallMeshes = G.world.colliders.map(c => c.mesh).filter(Boolean);

  const raycaster = new THREE.Raycaster();
  let dealtTo = new Set();

  for (let i = 0; i < shot.pellets; i++) {
    // 散布
    const th = dirInfo.theta, ph = dirInfo.phi;
    const d = fwd.clone()
      .addScaledVector(right, Math.tan(th))
      .addScaledVector(up, Math.tan(ph))
      .normalize();

    raycaster.set(eye, d);
    raycaster.far = shot.range;

    // 敌人
    let bestEnemy = null, bestDist = Infinity;
    const hits = raycaster.intersectObjects(targets.map(t => t.mesh), false);
    for (const h of hits) {
      if (h.distance < bestDist) {
        const t = targets.find(t => t.mesh === h.object);
        if (t && !dealtTo.has(t.enemy.id + t.head)) {
          bestDist = h.distance;
          bestEnemy = t;
        }
      }
    }
    // 建筑
    let bestWall = null;
    const wallHits = wallMeshes.length ? raycaster.intersectObjects(wallMeshes, false) : [];
    if (wallHits.length && wallHits[0].distance < bestDist) {
      bestWall = wallHits[0];
      bestEnemy = null;
    }
    // 地形
    const gh = G.world.heightAt(eye.x + d.x * shot.range, eye.z + d.z * shot.range);
    let groundHit = null;
    {
      const tHit = (gh - eye.y) / d.y;
      if (d.y < -0.01 && tHit > 0 && tHit < shot.range && tHit < bestDist) {
        groundHit = tHit;
        bestEnemy = null; bestWall = null;
      }
    }
    const endDist = bestEnemy ? bestDist : bestWall ? bestWall.distance : groundHit != null ? groundHit : shot.range;
    const endX = eye.x + d.x * endDist, endY = eye.y + d.y * endDist, endZ = eye.z + d.z * endDist;

    // 曳光
    if (shot.tracer) {
      const muzzle = p._model.muzzleRef;
      const mw = new THREE.Vector3();
      muzzle.getWorldPosition(mw);
      G.fx.tracer(mw.x, mw.y, mw.z, endX, endY, endZ, w.def.kind === 'energy' ? 0x8ae0ff : 0xffe9a0);
    }

    if (bestEnemy) {
      const e = bestEnemy.enemy;
      const dmg = shot.dmg * (bestEnemy.head ? shot.headMult : 1);
      // 距离衰减（霰弹/手枪近距离强）
      let final = dmg;
      if (w.def.kind === 'shotgun' || w.def.kind === 'smg') {
        final = dmg * U.clamp(1 - bestDist / w.def.range, 0.3, 1);
      }
      G.br.registerPlayerHit(e, final, bestEnemy.head);
      G.fx.sparks(endX, endY, endZ, d, 0xff5540, 5, 6);
      G.fx.blood(endX, endY, endZ, d, 6);
      AudioMgr.hitMaterial('flesh', 0.8);
      // 伤害数字
      HUD.spawnDamageNumber(new THREE.Vector3(endX, endY, endZ), final, bestEnemy.head, false);
      dealtTo.add(e.id + bestEnemy.head);
      p.damageDealt += final;
    } else if (bestWall) {
      const mat = bestWall.object.userData.mat || 'concrete';
      G.fx.sparks(endX, endY, endZ, d, 0xffc060, 4, 5);
      AudioMgr.hitMaterial(mat, 0.7);
    } else if (groundHit != null) {
      G.fx.sparks(endX, endY, endZ, d, 0x9a8c74, 3, 4);
      AudioMgr.hitMaterial('wood', 0.5);
    }
  }

  // 后座应用（视角上抬 + 随机偏移）
  p.pitch += shot.recoil + U.rand(-shot.recoilRand, shot.recoilRand) * 0.3;
  p.yaw += U.rand(-shot.recoilRand, shot.recoilRand) * 0.5;
}

/* ============ 拾取 ============ */

function tryPickup() {
  const p = G.player;
  const near = G.loot.nearest(p.pos.x, p.pos.z, 3.2);
  if (!near) return;
  if (near.type === 'box') return pickupBox(near);
  if (near.type === 'weapon') {
    const old = p.equipWeapon(near.data);
    p.switchSlot(p.slot);
    G.loot.remove(near);
    AudioMgr.uiCoin();
    HUD.toast('拾取 ' + near.data.def.name + (old ? '（丢弃 ' + old.def.name + '）' : ''), '#ffd75e');
  } else if (near.type === 'armor') {
    const lv = near.data;
    if (lv > p.armorLv) {
      p.armorLv = lv;
      p.shield = p.maxShield();
      G.loot.remove(near);
      AudioMgr.armorUp();
      HUD.toast('装备 ' + ARMORS[lv].name, ARMORS[lv].color);
    } else HUD.toast('当前护甲更好', '#8a93a0');
  } else if (near.type === 'heal') {
    p.healCount[near.data]++;
    G.loot.remove(near);
    AudioMgr.heal();
    HUD.toast('获得 ' + HEALS[near.data].name, HEALS[near.data].color);
  } else if (near.type === 'ammo') {
    const a = near.data;
    // 加入匹配武器后备
    let added = 0;
    for (const w of p.weapons) {
      if (w && w.def.ammo === a.type) { w.reserve += a.amount; added += a.amount; }
    }
    if (!added) p.ammoBag = p.ammoBag || {}, p.ammoBag[a.type] = (p.ammoBag[a.type] || 0) + a.amount;
    G.loot.remove(near);
    AudioMgr.uiCoin();
    HUD.toast('拾取 ' + a.name + ' ×' + a.amount, a.color);
  } else if (near.type === 'attach') {
    const at = near.data;
    const w = p.currentWeapon();
    if (!w) { HUD.toast('先拾取武器', '#8a93a0'); return; }
    w.att[at.type] = at;
    w.magSize = Math.round(w.def.mag * (w.att.mag ? w.att.mag.magMul : 1));
    G.loot.remove(near);
    AudioMgr.armorUp();
    HUD.toast('装备 ' + at.name, '#ffd75e');
  } else if (near.type === 'nade') {
    p.nadeCount[near.data]++;
    G.loot.remove(near);
    AudioMgr.uiCoin();
    HUD.toast('获得 ' + NADES[near.data].name, NADES[near.data].color);
  }
}

function pickupBox(box) {
  const p = G.player;
  const c = box.data;
  const gained = [];
  if (c.weapon) {
    const old = p.equipWeapon(c.weapon);
    p.switchSlot(p.slot);
    gained.push(c.weapon.def.name);
  }
  if (c.armorLv && c.armorLv > p.armorLv) {
    p.armorLv = c.armorLv;
    p.shield = p.maxShield();
    gained.push(ARMORS[c.armorLv].name);
  }
  for (const k in c.heals) {
    if (c.heals[k] > 0) { p.healCount[k] += c.heals[k]; gained.push(HEALS[k].name + '×' + c.heals[k]); }
  }
  for (const k in c.nades) {
    if (c.nades[k] > 0) { p.nadeCount[k] += c.nades[k]; gained.push(NADES[k].name + '×' + c.nades[k]); }
  }
  for (const t in c.ammo) {
    if (c.ammo[t] > 0) {
      let added = false;
      for (const w of p.weapons) {
        if (w && w.def.ammo === t) { w.reserve += c.ammo[t]; added = true; }
      }
      if (!added) { p.ammoBag = p.ammoBag || {}; p.ammoBag[t] = (p.ammoBag[t] || 0) + c.ammo[t]; }
    }
  }
  G.loot.remove(box);
  AudioMgr.uiCoin();
  HUD.toast('搜刮死亡箱：' + (gained.join('、') || '空空如也'), '#ffd75e');
}

/* ============ 自检 ============ */

function runSelfTest() {
  const q = new URLSearchParams(location.search);
  const mode = q.get('selftest') || 'basic';
  const log = [];
  const t0 = performance.now();
  try {
    // 无鼠标锁定：模拟输入
    G.input.locked = true;
    G.br.startMatch(q.get('size') ? parseInt(q.get('size'), 10) : 16, 'wraith');
    // 立即落地
    G.br.state = 'drop';
    G.player.pos.set(0, G.world.heightAt(0, 0) + 2, 0);
    G.br._parachute = true;
    G.br.state = 'playing';
    G.br._onLanded();
    // 模拟武器与敌人
    const w = new Weapon('flatline', rollAttachments());
    G.player.equipWeapon(w, 0);
    G.player.equipWeapon(new Weapon('eva8', {}), 1);
    G.player.nadeCount = { frag: 3, arc: 1, thermite: 1 };
    G.player.healCount = { syringe: 2, medkit: 1, cell: 2, battery: 1, phoenix: 1 };
    G.player.armorLv = 2; G.player.shield = 50;
    // 敌人立即落地，并模拟按住开火
    G.input.mouseDown = true;
    for (const e of G.enemies) {
      e.dropping = false; e.dropT = 0;
      e.pos.y = G.world.heightAt(e.pos.x, e.pos.z);
    }

    const steps = mode === 'full' ? 600 : 240;
    let frames = 0;
    const startNow = _last;
    for (let i = 0; i < steps; i++) {
      const now = startNow + i * 0.016;
      const dt = 0.016;
      _last = now;
      // 玩家绕圈 + 开火
      G.player.pos.x = Math.sin(i * 0.02) * 80;
      G.player.pos.z = Math.cos(i * 0.02) * 80;
      if (i % 3 === 0) G.player.fire(G.input, now);
      // 玩家打最近的敌人
      const near = G.enemies.find(e => !e.dead && !e.dropping);
      if (near && i % 4 === 0) {
        G.player.pos.set(near.pos.x - 5, G.player.pos.y, near.pos.z);
        const shot = new Weapon('flatline', {}).tryFire(now);
        if (shot) G.br.registerPlayerHit(near, shot.dmg, Math.random() < 0.3);
      }
      G.br.update(dt, now, G.input);
      G.player.updateMovement(dt, G.world, G.input);
      G.player.update(dt, now, G.input);
      G.fx.update(dt);
      HUD.update(dt, now);
      frames++;
      if (G.br.state === 'end') break;
    }
    const alive = G.br.alive;
    const enemiesLeft = G.enemies.filter(e => !e.dead).length;
    const result = `SELFTEST ${mode}: OK (${frames} frames, ${(performance.now() - t0).toFixed(0)}ms, alive=${alive}, enemiesLeft=${enemiesLeft}, kills=${G.player.kills}, dmg=${Math.round(G.player.damageDealt)})`;
    log.push(result);
    document.title = result;
    const overlay = document.getElementById('overlay') || (() => {
      const o = document.createElement('div');
      o.id = 'overlay';
      o.style.cssText = 'position:fixed;left:8px;bottom:8px;background:#000c;color:#7eff7e;font:12px monospace;padding:6px 10px;z-index:999;white-space:pre-wrap;';
      document.body.appendChild(o);
      return o;
    })();
    overlay.textContent = log.join('\n');
    console.log(result);
  } catch (e) {
    document.title = 'SELFTEST FAIL: ' + e.message;
    console.error('SELFTEST FAIL', e);
  }
}

/* ============ 启动 ============ */
window.addEventListener('DOMContentLoaded', init);

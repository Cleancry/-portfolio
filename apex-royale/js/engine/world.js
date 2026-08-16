/* ============================================================
 * world.js — 程序化地图（地形 / 建筑 / 掩体 / 碰撞 / 战利品点）
 * 全部几何与纹理程序化生成，零图片资源。
 * ============================================================ */
'use strict';

class GameWorld {
  constructor(scene) {
    this.scene = scene;
    this.SIZE = 1000;          // 地图边长（米）
    this.HALF = this.SIZE / 2;
    this.colliders = [];       // {minX,maxX,minZ,maxZ,minY,maxY,mat,mesh}
    this.trees = [];
    this.rocks = [];
    this.lootPoints = [];      // {x,z} 战利品刷新点
    this.seed = Math.floor(Math.random() * 1e6);
    // 大型山丘（3 座，种子确定性）
    this._hills = [];
    for (let i = 0; i < 3; i++) {
      const ang = U.noise2(i * 13.7, this.seed, 991) * Math.PI * 2;
      const rad = U.noise2(i * 7.3, this.seed, 557) * this.HALF * 0.72 + 100;
      this._hills.push({
        x: Math.cos(ang) * rad,
        z: Math.sin(ang) * rad,
        r: 60 + U.noise2(i, this.seed, 31) * 55,
        strength: 14 + U.noise2(i * 3.1, this.seed, 77) * 18,
      });
    }
    // 峡谷参数
    this._valleyAmp = 60 + U.noise2(this.seed, 1.7, 23) * 80;
    this._valleyDepth = 5 + U.noise2(this.seed, 3.3, 41) * 7;
    this._valleyW = 26 + U.noise2(this.seed, 5.1, 59) * 20;
    this.group = new THREE.Group();
    this.group.name = 'world';
    scene.add(this.group);
    this._build();
  }

  /* ---------------- 高度场 ---------------- */

  heightAt(x, z) {
    if (x < -this.HALF || x > this.HALF || z < -this.HALF || z > this.HALF) return -50;
    // 都市地形：整体平坦，仅保留轻微起伏（不再有山丘/峡谷）
    let h = U.fbm(x * 0.0022 + 3.1, z * 0.0022 + 7.7, 3, this.seed) * 3.2;
    h += U.fbm(x * 0.008 + 91.3, z * 0.008 + 41.7, 2, this.seed) * 0.8;
    h -= 2;
    // 中心略平，边缘微起伏
    const cd = Math.sqrt(x * x + z * z) / this.HALF;
    h *= U.lerp(0.5, 1.0, cd);
    return h;
  }

  /** 地形表面类型 */
  surfaceAt(x, z) {
    for (const c of this.colliders) {
      if (c.mat !== 'concrete' && c.mat !== 'wood') continue;
      if (x >= c.minX && x <= c.maxX && z >= c.minZ && z <= c.maxZ) return c.mat;
    }
    const h = this.heightAt(x, z);
    const detail = U.fbm(x * 0.006 + 5, z * 0.006 + 9, 2, this.seed);
    if (h > 3 && detail > 0.55) return 'concrete'; // 山岩
    return 'grass';
  }

  /** 某点是否在建筑内（用于 AI 判定） */
  inBuilding(x, z) {
    for (const c of this.colliders) {
      if (c.building && x >= c.minX && x <= c.maxX && z >= c.minZ && z <= c.maxZ) return true;
    }
    return false;
  }

  /** 射线求地表高度（子弹用） */
  raycastGround(ox, oy, oz, dx, dy, dz, maxDist) {
    // 步进采样（性能可接受）
    const steps = Math.ceil(maxDist / 2);
    let px = ox, py = oy, pz = oz;
    for (let i = 0; i <= steps; i++) {
      px = ox + dx * (i / steps) * maxDist;
      pz = oz + dz * (i / steps) * maxDist;
      py = oy + dy * (i / steps) * maxDist;
      const gh = this.heightAt(px, pz);
      if (py <= gh) {
        const t = i / steps;
        return { x: px, y: gh, z: pz, mat: this.surfaceAt(px, pz), dist: t * maxDist, hit: true };
      }
    }
    return { hit: false, x: px, y: py, z: pz, dist: maxDist };
  }

  /* ---------------- 纹理生成 ---------------- */

  _texGrass() {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#3d5a30'; g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 900; i++) {
      g.fillStyle = `rgba(${40 + U.randInt(0, 40)},${70 + U.randInt(0, 50)},${35 + U.randInt(0, 30)},0.55)`;
      g.fillRect(U.randInt(0, 127), U.randInt(0, 127), 2, 2);
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(40, 40);
    return t;
  }
  _texRock() {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#6d6a63'; g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 500; i++) {
      g.fillStyle = `rgba(${90 + U.randInt(0, 40)},${86 + U.randInt(0, 40)},${76 + U.randInt(0, 40)},0.5)`;
      g.beginPath(); g.arc(U.randInt(0, 127), U.randInt(0, 127), U.randInt(1, 5), 0, 7); g.fill();
    }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(20, 20);
    return t;
  }
  _texConcrete() {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#7f857f'; g.fillRect(0, 0, 128, 128);
    g.strokeStyle = 'rgba(60,64,60,0.8)'; g.lineWidth = 2;
    g.strokeRect(2, 2, 124, 124); g.strokeRect(64, 2, 62, 62); g.strokeRect(2, 64, 62, 62);
    for (let i = 0; i < 200; i++) { g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(U.randInt(0, 127), U.randInt(0, 127), 3, 2); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 3);
    return t;
  }
  _texCrate() {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#8a6d3b'; g.fillRect(0, 0, 128, 128);
    g.strokeStyle = '#5d4a28'; g.lineWidth = 6;
    g.strokeRect(4, 4, 120, 120); g.strokeRect(64, 4, 2, 120); g.strokeRect(4, 64, 120, 2);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }
  _texMetal() {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#4a5560'; g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 6; i++) {
      g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(0, i * 21, 128, 1);
      g.fillStyle = 'rgba(0,0,0,0.15)'; g.fillRect(0, i * 21 + 1, 128, 1);
    }
    g.strokeStyle = '#2f3740'; g.lineWidth = 2; g.strokeRect(1, 1, 126, 126);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }
  /** 城市建筑立面纹理：窗格 */
  _texWindow() {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#6b7280'; g.fillRect(0, 0, 128, 128);
    // 窗格（每行 4 窗 × 5 行）
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 4; col++) {
        const wx = 8 + col * 30, wy = 6 + row * 24;
        g.fillStyle = Math.random() < 0.6 ? '#1f2937' : '#8fb8d8';   // 暗窗/亮窗
        g.fillRect(wx, wy, 22, 16);
        g.strokeStyle = '#3a3f46'; g.lineWidth = 1.5;
        g.strokeRect(wx, wy, 22, 16);
      }
    }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }

  /* ---------------- 建造 ---------------- */

  _build() {
    this._buildTerrain();
    this._buildRoads();
    this._placeBuildings();
    this._placeTowers();
    this._placeDecor();
  }

  /** 城市路网：中心城区十字网格道路（视觉贴地分段 + 路中线），供建筑/行道树/路灯沿路布置 */
  _buildRoads() {
    this.roads = { xs: [], zs: [] };
    const cityR = 330;                       // 城区半径
    for (let i = -2; i <= 2; i++) {
      const v = i * 135;
      if (Math.abs(v) <= cityR) { this.roads.xs.push(v); this.roads.zs.push(v); }
    }
    const roadMat = new THREE.MeshLambertMaterial({ color: 0x484d54 });
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xd9b84a, transparent: true, opacity: 0.65 });
    const segLen = 42, roadW = 12;
    const roadGeo = new THREE.PlaneGeometry(segLen, roadW);
    roadGeo.rotateX(-Math.PI / 2);
    const lineGeo = new THREE.PlaneGeometry(segLen, 0.35);
    lineGeo.rotateX(-Math.PI / 2);
    const total = (this.roads.xs.length + this.roads.zs.length) * Math.ceil(cityR * 2 / segLen);
    const roadInst = new THREE.InstancedMesh(roadGeo, roadMat, total);
    const lineInst = new THREE.InstancedMesh(lineGeo, lineMat, total);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    let count = 0;
    const addSeg = (cx, cz, horizontal) => {
      const y = this.heightAt(cx, cz) + 0.08;
      m4.compose(new THREE.Vector3(cx, y, cz), q, new THREE.Vector3(1, 1, 1));
      roadInst.setMatrixAt(count, m4);
      m4.compose(new THREE.Vector3(cx, y + 0.02, cz), q, new THREE.Vector3(1, 1, 1));
      lineInst.setMatrixAt(count, m4);
      count++;
    };
    for (const z of this.roads.zs) for (let s = -cityR; s < cityR; s += segLen) addSeg(s + segLen / 2, z, true);
    for (const x of this.roads.xs) for (let s = -cityR; s < cityR; s += segLen) addSeg(x, s + segLen / 2, false);
    roadInst.count = lineInst.count = count;
    roadInst.instanceMatrix.needsUpdate = lineInst.instanceMatrix.needsUpdate = true;
    roadInst.receiveShadow = true;
    this.group.add(roadInst);
    this.group.add(lineInst);
  }

  _buildTerrain() {
    const seg = 96;
    const geo = new THREE.PlaneGeometry(this.SIZE, this.SIZE, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, this.heightAt(pos.getX(i), pos.getZ(i)));
    }
    geo.computeVertexNormals();
    const mat = new THREE.MeshLambertMaterial({ map: this._texGrass(), color: 0xffffff });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    this.group.add(mesh);
    this.terrain = mesh;
  }

  /** 放置建筑与掩体，同时注册碰撞体与战利品点 */
  _placeBuildings() {
    const half = 0.5;
    const windowTex = this._texWindow();
    const placed = [];
    // —— 密集城市建筑（InstancedMesh 批量渲染：墙 + 屋顶，每栋独立颜色）——
    const floorStyles = [2, 2, 3, 3, 4, 5];
    const colors = [0xc2704d, 0xd8c9a3, 0x8fa3b8, 0xa8a8a8, 0x7f9a6d, 0xb0a090, 0x9c8b7a, 0x6b7a8f];
    const bl = [];   // 建筑列表 {x,z,w,d,h,color}
    const bMin = 32; // 建筑最小间距
    const canPlaceB = (x, z) =>
      Math.abs(x) < this.HALF - 10 && Math.abs(z) < this.HALF - 10 &&
      bl.every(b => U.dist2(b.x, b.z, x, z) > bMin * bMin);
    const addB = (x, z) => {
      if (!canPlaceB(x, z)) return;
      const floors = U.pick(floorStyles);
      bl.push({ x, z, w: U.randInt(9, 14), d: U.randInt(9, 13), h: floors * 3.2, color: U.pick(colors) });
    };
    const cityR = 450;
    const spacing = 72;
    const axes = [];
    for (let i = -Math.floor(cityR / spacing); i <= Math.floor(cityR / spacing); i++) axes.push(i * spacing);
    // 沿路两侧（每侧 4 栋，间隔 42m，避开路口）
    for (const rz of axes) {
      for (const side of [-1, 1]) {
        const oz = rz + side * 19;
        for (let k = -2; k <= 2; k++) {
          const x = k * 42 + U.rand(-7, 7);
          if (axes.some(rx => Math.abs(rx - x) < 20)) continue;
          addB(x, oz);
        }
      }
    }
    for (const rx of axes) {
      for (const side of [-1, 1]) {
        const ox = rx + side * 19;
        for (let k = -2; k <= 2; k++) {
          const z = k * 42 + U.rand(-7, 7);
          if (axes.some(rz => Math.abs(rz - z) < 20)) continue;
          addB(ox, z);
        }
      }
    }
    // 街区内部填充
    for (let i = 0; i < 800; i++) {
      const x = U.rand(-cityR, cityR), z = U.rand(-cityR, cityR);
      addB(x, z);
    }
    // 城区边缘
    for (let i = 0; i < 300; i++) {
      const ang = Math.random() * Math.PI * 2;
      const rad = U.rand(cityR + 30, this.HALF * 0.88);
      addB(Math.cos(ang) * rad, Math.sin(ang) * rad);
    }
    // —— InstancedMesh 渲染（2 个 draw call 渲染所有建筑）——
    const wallGeo = new THREE.BoxGeometry(1, 1, 1);
    const roofGeo = new THREE.BoxGeometry(1, 1, 1);
    const wallMat = new THREE.MeshLambertMaterial({ map: windowTex, vertexColors: true });
    const roofMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const wallInst = new THREE.InstancedMesh(wallGeo, wallMat, bl.length);
    const roofInst = new THREE.InstancedMesh(roofGeo, roofMat, bl.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), cc = new THREE.Color();
    bl.forEach((b, i) => {
      const gh = this.heightAt(b.x, b.z);
      m4.compose(new THREE.Vector3(b.x, gh + b.h / 2, b.z), q, new THREE.Vector3(b.w, b.h, b.d));
      wallInst.setMatrixAt(i, m4);
      wallInst.setColorAt(i, cc.setHex(b.color));
      m4.compose(new THREE.Vector3(b.x, gh + b.h + 0.2, b.z), q, new THREE.Vector3(b.w + 0.8, 0.4, b.d + 0.8));
      roofInst.setMatrixAt(i, m4);
      roofInst.setColorAt(i, cc.setHex(0x5a5048));
      this.colliders.push({
        minX: b.x - b.w / 2, maxX: b.x + b.w / 2, minZ: b.z - b.d / 2, maxZ: b.z + b.d / 2,
        minY: gh - 2, maxY: gh + b.h + 0.6, mat: 'concrete', building: true, mesh: null,
      });
      // 战利品：建筑四周（2 点）
      for (let k = 0; k < 2; k++) {
        const a = Math.random() * Math.PI * 2;
        this.lootPoints.push({ x: b.x + Math.cos(a) * (Math.max(b.w, b.d) / 2 + 3), z: b.z + Math.sin(a) * (Math.max(b.w, b.d) / 2 + 3) });
      }
    });
    wallInst.instanceMatrix.needsUpdate = true;
    roofInst.instanceMatrix.needsUpdate = true;
    if (wallInst.instanceColor) wallInst.instanceColor.needsUpdate = true;
    if (roofInst.instanceColor) roofInst.instanceColor.needsUpdate = true;
    wallInst.castShadow = wallInst.receiveShadow = true;
    roofInst.castShadow = true;
    this.group.add(wallInst);
    this.group.add(roofInst);
    this.cityBuildings = bl;
    // 集装箱与箱子掩体
    const crateMat = new THREE.MeshLambertMaterial({ map: this._texCrate(), color: 0xffffff });
    const metalMat = new THREE.MeshLambertMaterial({ map: this._texMetal(), color: 0x8b9aa8 });
    for (let i = 0; i < 10; i++) {
      const x = U.rand(-this.HALF * 0.9, this.HALF * 0.9);
      const z = U.rand(-this.HALF * 0.9, this.HALF * 0.9);
      if (Math.sqrt(x * x + z * z) < 50 || placed.some(p => U.dist2(p.x, p.z, x, z) < 22 * 22)) continue;
      const w = 6, d = 2.5, h = 2.6;
      const gh = this.heightAt(x, z);
      const crate = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), crateMat);
      crate.position.set(x, gh + h / 2, z); crate.rotation.y = Math.floor(Math.random() * 2) * 1.57;
      crate.castShadow = crate.receiveShadow = true;
      this.group.add(crate);
      this.colliders.push({
        minX: x - w / 2 - half, maxX: x + w / 2 + half, minZ: z - d / 2 - half, maxZ: z + d / 2 + half,
        minY: gh - 2, maxY: gh + h, mat: 'metal', building: false, mesh: crate,
      });
      this.lootPoints.push({ x: x + 3, z });
      this.lootPoints.push({ x, z: z + 3 });
    }
    // 石墙掩体
    for (let i = 0; i < 12; i++) {
      const x = U.rand(-this.HALF * 0.88, this.HALF * 0.88);
      const z = U.rand(-this.HALF * 0.88, this.HALF * 0.88);
      if (Math.sqrt(x * x + z * z) < 55) continue;
      const w = U.rand(5, 9), h = U.rand(1.6, 2.4);
      const gh = this.heightAt(x, z);
      const rock = new THREE.Mesh(new THREE.BoxGeometry(w, h, 1.2), new THREE.MeshLambertMaterial({ map: this._texRock(), color: 0x8d8d8d }));
      rock.position.set(x, gh + h / 2, z); rock.rotation.y = Math.random() * Math.PI;
      rock.castShadow = rock.receiveShadow = true;
      this.group.add(rock);
      this.colliders.push({
        minX: x - w / 2 - half, maxX: x + w / 2 + half, minZ: z - 1.2, maxZ: z + 1.2,
        minY: gh - 2, maxY: gh + h, mat: 'concrete', building: false, mesh: rock,
      });
      this.lootPoints.push({ x: x + w / 2 + 2, z });
    }
  }

  /** 开放式框架高楼：四角柱 + 分层楼板（可攀爬登顶），每层与顶部战利品 */
  _placeTowers() {
    const half = 0.5;
    const towerCount = 6;
    const placed = [];
    const concreteTex = this._texConcrete();
    const metalTex = this._texMetal();
    const pillarMat = new THREE.MeshLambertMaterial({ map: concreteTex, color: 0x9aa0a0 });
    const floorMat = new THREE.MeshLambertMaterial({ map: metalTex, color: 0x7d8a99 });
    const beamMat = new THREE.MeshLambertMaterial({ color: 0x4a5560 });

    for (let i = 0; i < towerCount; i++) {
      let x, z, ok = false, tries = 0;
      while (!ok && tries < 90) {
        tries++;
        const ang = Math.random() * Math.PI * 2;
        const rad = U.rand(110, this.HALF * 0.88);
        x = Math.cos(ang) * rad; z = Math.sin(ang) * rad;
        if (Math.sqrt(x * x + z * z) < 100) continue;
        // 避开其它塔与已有建筑
        ok = placed.every(p => U.dist2(p.x, p.z, x, z) > 160 * 160) &&
             this.colliders.every(c => {
               const cx = (c.minX + c.maxX) / 2, cz = (c.minZ + c.maxZ) / 2;
               return U.dist2(cx, cz, x, z) > 60 * 60;
             });
      }
      if (!ok) continue;
      placed.push({ x, z });

      const W = U.randInt(10, 14), D = W, floorH = 4.6;
      const L = U.randInt(5, 7);               // 层数（总高 23~32m）
      const H = L * floorH;
      const gh = this.heightAt(x, z);

      // 四角柱
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const px = x + sx * (W / 2 - 0.5), pz = z + sz * (D / 2 - 0.5);
        const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.9, H, 0.9), pillarMat);
        pillar.position.set(px, gh + H / 2, pz);
        pillar.castShadow = true;
        this.group.add(pillar);
        this.colliders.push({
          minX: px - 1, maxX: px + 1, minZ: pz - 1, maxZ: pz + 1,
          minY: gh - 2, maxY: gh + H, mat: 'concrete', building: true, mesh: pillar,
        });
      }
      // 分层楼板（可站人，跳跃 8m 可逐层登顶）+ 楼顶
      for (let k = 1; k <= L; k++) {
        const fy = gh + floorH * k;
        const floor = new THREE.Mesh(new THREE.BoxGeometry(W, 0.3, D), floorMat);
        floor.position.set(x, fy, z);
        floor.castShadow = floor.receiveShadow = true;
        this.group.add(floor);
        // 楼板边缘横梁（装饰）
        for (const [ex, ez, ew, ed] of [[0, 1, W + 0.8, 0.25], [0, -1, W + 0.8, 0.25], [1, 0, 0.25, D + 0.8], [-1, 0, 0.25, D + 0.8]]) {
          const beam = new THREE.Mesh(new THREE.BoxGeometry(ew, 0.18, ed), beamMat);
          beam.position.set(x + ex * (W / 2 + 0.2), fy + 0.22, z + ez * (D / 2 + 0.2));
          this.group.add(beam);
        }
        // 楼板碰撞（水平面）
        this.colliders.push({
          minX: x - W / 2 - half, maxX: x + W / 2 + half, minZ: z - D / 2 - half, maxZ: z + D / 2 + half,
          minY: fy, maxY: fy + 0.4, mat: 'metal', building: true, mesh: floor,
        });
        // 每层战利品
        if (k < L) this.lootPoints.push({ x: x + U.rand(-2, 2), z: z + U.rand(-2, 2) });
      }
      // 楼顶天线 + 信号灯
      const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 5, 6), beamMat);
      antenna.position.set(x, gh + H + 2.5, z);
      this.group.add(antenna);
      const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff4433 }));
      beacon.position.set(x, gh + H + 5.2, z);
      this.group.add(beacon);
      // 楼顶战利品（富点）
      this.lootPoints.push({ x: x + 2, z, onTower: true });
      this.lootPoints.push({ x: x - 2, z, onTower: true });
      // 塔底战利品
      for (let k = 0; k < 2; k++) {
        const a = Math.random() * Math.PI * 2;
        this.lootPoints.push({ x: x + Math.cos(a) * (W / 2 + 4), z: z + Math.sin(a) * (D / 2 + 4) });
      }
    }
  }

  _placeDecor() {
    // 树（InstancedMesh 节省 draw call）—— 随机树 + 沿路行道树
    const trunkGeo = new THREE.CylinderGeometry(0.3, 0.42, 3.4, 5);
    const leafGeo = new THREE.ConeGeometry(2.2, 4.5, 6);
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x5a4632 });
    const leafMat = new THREE.MeshLambertMaterial({ color: 0x2c6e3f });
    const n = 340;
    const trunkMesh = new THREE.InstancedMesh(trunkGeo, trunkMat, n);
    const leafMesh = new THREE.InstancedMesh(leafGeo, leafMat, n);
    const m4 = new THREE.Matrix4();
    let count = 0;
    const addTree = (x, z, s) => {
      if (count >= n) return;
      if (this.inBuilding(x, z)) return;
      const gh = this.heightAt(x, z);
      if (gh < -4) return;
      m4.compose(new THREE.Vector3(x, gh + 1.7 * s, z), new THREE.Quaternion(), new THREE.Vector3(s, s, s));
      trunkMesh.setMatrixAt(count, m4);
      m4.compose(new THREE.Vector3(x, gh + (3.4 + 2.2) * s, z), new THREE.Quaternion(), new THREE.Vector3(s, s, s));
      leafMesh.setMatrixAt(count, m4);
      this.trees.push({ x, z, r: 2.4 * s, h: 6 * s, gh });
      this.colliders.push({
        minX: x - 0.8, maxX: x + 0.8, minZ: z - 0.8, maxZ: z + 0.8,
        minY: gh - 2, maxY: gh + 1.6, mat: 'wood', building: false, mesh: null,
      });
      count++;
    };
    // 随机树（外围自然区）
    for (let i = 0; i < n * 10 && count < n - 140; i++) {
      const x = U.rand(-this.HALF * 0.95, this.HALF * 0.95);
      const z = U.rand(-this.HALF * 0.95, this.HALF * 0.95);
      if (Math.sqrt(x * x + z * z) < 60) continue;
      addTree(x, z, U.rand(0.8, 1.4));
    }
    // 行道树：沿主路两侧每 ~38m 一棵（交替两侧）
    if (this.roads) {
      const cityR = 330;
      const side = () => (Math.random() < 0.5 ? -1 : 1);
      for (const rz of this.roads.zs) {
        for (let s = -cityR + 20; s < cityR; s += 38) {
          addTree(s + U.rand(-4, 4), rz + side() * (6 + U.rand(3, 9)), U.rand(0.75, 1.1));
        }
      }
      for (const rx of this.roads.xs) {
        for (let s = -cityR + 20; s < cityR; s += 38) {
          addTree(rx + side() * (6 + U.rand(3, 9)), s + U.rand(-4, 4), U.rand(0.75, 1.1));
        }
      }
    }
    trunkMesh.instanceMatrix.needsUpdate = true;
    leafMesh.instanceMatrix.needsUpdate = true;
    trunkMesh.castShadow = leafMesh.castShadow = true;
    this.group.add(trunkMesh); this.group.add(leafMesh);

    // 岩石
    const rockGeo = new THREE.DodecahedronGeometry(1, 0);
    const rockMat = new THREE.MeshLambertMaterial({ map: this._texRock(), color: 0x999999 });
    const rn = 70;
    const rockMesh = new THREE.InstancedMesh(rockGeo, rockMat, rn);
    count = 0;
    for (let i = 0; i < rn * 10 && count < rn; i++) {
      const x = U.rand(-this.HALF * 0.95, this.HALF * 0.95);
      const z = U.rand(-this.HALF * 0.95, this.HALF * 0.95);
      if (Math.sqrt(x * x + z * z) < 50) continue;
      const gh = this.heightAt(x, z);
      const s = U.rand(0.6, 2.2);
      m4.compose(new THREE.Vector3(x, gh + s * 0.5, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random(), Math.random() * 3, Math.random())), new THREE.Vector3(s, s * 0.8, s));
      rockMesh.setMatrixAt(count, m4);
      this.rocks.push({ x, z, r: s, gh });
      this.colliders.push({
        minX: x - s, maxX: x + s, minZ: z - s, maxZ: z + s,
        minY: gh - 2, maxY: gh + s * 0.9, mat: 'concrete', building: false, mesh: null,
      });
      count++;
    }
    rockMesh.instanceMatrix.needsUpdate = true;
    rockMesh.castShadow = rockMesh.receiveShadow = true;
    this.group.add(rockMesh);

    // 零星草丛面片（视觉丰富）
    const grassGeo = new THREE.PlaneGeometry(1.4, 0.5);
    const grassMat = new THREE.MeshLambertMaterial({ color: 0x4a7a3c, side: THREE.DoubleSide, transparent: true, opacity: 0.8 });
    const gn = 350;
    const grassMesh = new THREE.InstancedMesh(grassGeo, grassMat, gn);
    count = 0;
    for (let i = 0; i < gn * 6 && count < gn; i++) {
      const x = U.rand(-this.HALF * 0.95, this.HALF * 0.95);
      const z = U.rand(-this.HALF * 0.95, this.HALF * 0.95);
      if (this.inBuilding(x, z)) continue;
      const gh = this.heightAt(x, z);
      m4.compose(new THREE.Vector3(x, gh + 0.25, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2 + U.rand(-0.2, 0.2), 0, Math.random() * 3)), new THREE.Vector3(1, 1, 1));
      grassMesh.setMatrixAt(count, m4);
      count++;
    }
    grassMesh.instanceMatrix.needsUpdate = true;
    this.group.add(grassMesh);

    // 灌木丛（圆球，深绿）
    const bushGeo = new THREE.DodecahedronGeometry(0.55, 0);
    const bushMat = new THREE.MeshLambertMaterial({ color: 0x2f5e33 });
    const bn = 90;
    const bushMesh = new THREE.InstancedMesh(bushGeo, bushMat, bn);
    count = 0;
    for (let i = 0; i < bn * 8 && count < bn; i++) {
      const x = U.rand(-this.HALF * 0.95, this.HALF * 0.95);
      const z = U.rand(-this.HALF * 0.95, this.HALF * 0.95);
      if (Math.sqrt(x * x + z * z) < 45 || this.inBuilding(x, z)) continue;
      const gh = this.heightAt(x, z);
      if (gh < -2) continue;
      const s = U.rand(0.7, 1.7);
      m4.compose(new THREE.Vector3(x, gh + 0.4 * s, z), new THREE.Quaternion(), new THREE.Vector3(s, s * 0.8, s));
      bushMesh.setMatrixAt(count, m4);
      count++;
    }
    bushMesh.instanceMatrix.needsUpdate = true;
    bushMesh.castShadow = true;
    this.group.add(bushMesh);

    // 小花（彩色小十字面片）
    const flowerGeo = new THREE.PlaneGeometry(0.22, 0.22);
    const fn = 120;
    const flowerMesh = new THREE.InstancedMesh(flowerGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }), fn);
    const flowerColors = [0xffd166, 0xff6b6b, 0xc084fc, 0xffffff, 0xff9a3c, 0x4dd0e1];
    const color = new THREE.Color();
    count = 0;
    for (let i = 0; i < fn * 8 && count < fn; i++) {
      const x = U.rand(-this.HALF * 0.95, this.HALF * 0.95);
      const z = U.rand(-this.HALF * 0.95, this.HALF * 0.95);
      if (this.inBuilding(x, z)) continue;
      const gh = this.heightAt(x, z);
      if (gh < -2) continue;
      m4.compose(new THREE.Vector3(x, gh + 0.12, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2 + U.rand(-0.15, 0.15), 0, Math.random() * 3)), new THREE.Vector3(1, 1, 1));
      flowerMesh.setMatrixAt(count, m4);
      flowerMesh.setColorAt(count, color.setHex(U.pick(flowerColors)));
      count++;
    }
    flowerMesh.instanceMatrix.needsUpdate = true;
    this.group.add(flowerMesh);

    // 路灯：沿主路两侧（柱 + 暖光球）
    if (this.roads) {
      const poleGeo = new THREE.CylinderGeometry(0.07, 0.1, 5.2, 6);
      const lampGeo = new THREE.SphereGeometry(0.32, 8, 6);
      const poleMat = new THREE.MeshLambertMaterial({ color: 0x3a3f46 });
      const lampMat = new THREE.MeshBasicMaterial({ color: 0xffd98a });
      const cityR = 330;
      const lampCount = Math.ceil((cityR * 2 / 85) * (this.roads.zs.length + this.roads.xs.length) * 2);
      const poleInst = new THREE.InstancedMesh(poleGeo, poleMat, lampCount);
      const lampInst = new THREE.InstancedMesh(lampGeo, lampMat, lampCount);
      let lc = 0;
      const addLamp = (x, z, side) => {
        if (lc >= lampCount) return;
        const gh = this.heightAt(x, z);
        const off = side * 9.5;
        m4.compose(new THREE.Vector3(x + off, gh + 2.6, z), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
        poleInst.setMatrixAt(lc, m4);
        m4.compose(new THREE.Vector3(x + off, gh + 5.3, z), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
        lampInst.setMatrixAt(lc, m4);
        lc++;
      };
      for (const rz of this.roads.zs) {
        for (let s = -cityR + 40; s < cityR; s += 85) addLamp(s, rz, s % 2 === 0 ? 1 : -1);
      }
      for (const rx of this.roads.xs) {
        for (let s = -cityR + 40; s < cityR; s += 85) addLamp(rx, s, s % 2 === 0 ? 1 : -1);
      }
      poleInst.count = lampInst.count = lc;
      poleInst.instanceMatrix.needsUpdate = lampInst.instanceMatrix.needsUpdate = true;
      this.group.add(poleInst);
      this.group.add(lampInst);
    }
  }

  /** 地面任意点是否可行走（无碰撞体阻挡） */
  isWalkable(x, z, r = 0.5) {
    for (const c of this.colliders) {
      if (x + r > c.minX && x - r < c.maxX && z + r > c.minZ && z - r < c.maxZ) return false;
    }
    return true;
  }

  /** 找到离给定点最近的战利品刷新点 */
  nearestLootPoint(x, z) {
    let best = null, bd = Infinity;
    for (const p of this.lootPoints) {
      const d = U.dist2(x, z, p.x, p.z);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }
}

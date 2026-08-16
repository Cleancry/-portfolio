/* ============================================================
   PENITENT BLADE —— engine/world.js
   CHURCH INTERIOR: real 5-frame artwork tiled per segment with
   refined pilaster columns, ceiling + parallax foreground columns,
   god rays, tileset floor, columns, decor, torch lights, ash.
   ============================================================ */
'use strict';
(function () {
  const Game = window.Game;
  const U = Game.U;

  const WORLD_W = 2400;
  const FLOOR_Y = 600;
  const FLOOR_H = 120;
  const SEG_W = 480;

  class ArenaWorld {
    constructor() {
      this.w = WORLD_W;
      this.platforms = [{ x: 0, y: FLOOR_Y, w: WORLD_W, h: FLOOR_H }];
      this.walls = { left: 0, right: WORLD_W };
      this.torches = [];
      this.deco = [];
      this.segBgs = null;
      this.floorTex = null;
      this.columnImg = null;
      this.ash = [];
      this.t = 0;
      this.blood = 0;
      this.bloodTarget = 0;
      // decor toggle panel: each flag gates one drawn element; persisted in localStorage
      this.opts = Object.assign({
        chandelier: true, pennant: true, candlestick: true, tombstone: true, cross: true,
        rail: true, pew: true, saint: true, altar: true, bones: true, groundProps: true,
        rug: true, floor: true, ceiling: true, godRays: true, seamLight: true,
        ambient: true, ash: true, columns: true, fgColumns: true, torch: true,
      }, this._loadOpts());
    }

    _loadOpts() {
      try {
        const raw = localStorage.getItem('dark-arena-decor');
        return raw ? JSON.parse(raw) : {};
      } catch (e) { return {}; }
    }

    _saveOpts() {
      try { localStorage.setItem('dark-arena-decor', JSON.stringify(this.opts)); } catch (e) {}
    }

    setOpt(name, on) {
      if (name in this.opts) { this.opts[name] = !!on; this._saveOpts(); }
    }

    setBloodMode(on) { this.bloodTarget = on ? 1 : 0; }

    /* ---------- build ---------- */
    build(sheets) {
      const bgSheet = sheets.churchBg;
      this.segBgs = [];
      if (bgSheet && bgSheet.frames.length) {
        for (let i = 0; i < bgSheet.frames.length; i++) {
          this.segBgs.push(this._makeSeg(bgSheet, bgSheet.frames[i]));
        }
      }
      this.floorTex = sheets.churchTiles ? sheets.churchTiles.img : null;
      // floor: real Gothicvania stone tiles (tileset row2 48x48 bricks),
      // staggered rows + grime/crack/blood overlays
      this.floorCanvas = document.createElement('canvas');
      this.floorCanvas.width = this.w; this.floorCanvas.height = FLOOR_H;
      const fctx = this.floorCanvas.getContext('2d');
      fctx.imageSmoothingEnabled = false;
      const tsrc = this.floorTex;
      const tileRects = tsrc ? [
        { x: 0, y: 160, w: 48, h: 48 },
        { x: 64, y: 160, w: 48, h: 48 },
        { x: 128, y: 160, w: 48, h: 48 },
      ] : null;
      const ts = 48;
      let rowI = 0;
      for (let ty = 0; ty < FLOOR_H; ty += ts, rowI++) {
        const off = (rowI % 2) * (ts / 2);
        for (let wx = -ts; wx < this.w + ts; wx += ts) {
          const tr = tileRects ? tileRects[(rowI * 3 + Math.floor((wx + off + ts) / ts)) % 3] : null;
          if (tr && tsrc) fctx.drawImage(tsrc, tr.x, tr.y, tr.w, tr.h, wx + off, ty, ts, ts);
          else {
            const dark = ((wx / ts | 0) + rowI) % 2 === 0;
            fctx.fillStyle = dark ? '#241c30' : '#2e2440';
            fctx.fillRect(wx + off, ty, ts, ts);
          }
        }
      }
      // stone tile shading: per-tile brightness variation + bevel edge
      {
        let seed = 4242;
        const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
        for (let ty = 0; ty < FLOOR_H; ty += ts) {
          for (let wx = 0; wx < this.w; wx += ts) {
            const v = (rnd() - 0.5) * 26;
            const a = 0.10 + rnd() * 0.14;
            fctx.fillStyle = v > 0 ? 'rgba(255,240,220,' + a + ')' : 'rgba(0,0,0,' + a + ')';
            fctx.fillRect(wx, ty, ts, ts);
            // bevel: light top edge, dark bottom edge
            fctx.fillStyle = 'rgba(255,240,220,0.10)';
            fctx.fillRect(wx, ty, ts, 1);
            fctx.fillStyle = 'rgba(0,0,0,0.28)';
            fctx.fillRect(wx, ty + ts - 1, ts, 1);
          }
        }
      }
      // hairline cracks across the marble (deterministic seeded)
      {
        let seed = 12345;
        const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
        for (let c = 0; c < 26; c++) {
          let cx = rnd() * this.w, cy = FLOOR_H * (0.15 + rnd() * 0.7);
          const len = 26 + rnd() * 90, ang = rnd() * Math.PI * 2;
          fctx.strokeStyle = 'rgba(4,3,8,' + (0.5 + rnd() * 0.4) + ')';
          fctx.lineWidth = 1;
          fctx.beginPath(); fctx.moveTo(cx, cy);
          let px = cx, py = cy;
          for (let s = 0; s < 8; s++) {
            px += Math.cos(ang + (rnd() - 0.5) * 0.9) * len / 8;
            py += Math.sin(ang + (rnd() - 0.5) * 0.9) * len / 8;
            fctx.lineTo(px, py);
          }
          fctx.stroke();
        }
      }
      // dried blood splatters + scorch marks on the floor
      {
        let seed = 777;
        const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
        for (let b = 0; b < 22; b++) {
          const bx = rnd() * this.w, by = FLOOR_H * rnd();
          const r = 4 + rnd() * 14;
          fctx.fillStyle = 'rgba(60,8,10,' + (0.25 + rnd() * 0.35) + ')';
          for (let d = 0; d < 5; d++) {
            fctx.beginPath();
            fctx.arc(bx + (rnd() - 0.5) * r * 2, by + (rnd() - 0.5) * r * 1.4, r * (0.25 + rnd() * 0.5), 0, Math.PI * 2);
            fctx.fill();
          }
        }
        for (let s = 0; s < 9; s++) {
          const sx = rnd() * this.w, sy = FLOOR_H * rnd();
          fctx.fillStyle = 'rgba(8,6,10,' + (0.5 + rnd() * 0.3) + ')';
          fctx.beginPath(); fctx.arc(sx, sy, 10 + rnd() * 22, 0, Math.PI * 2); fctx.fill();
          fctx.fillStyle = 'rgba(16,12,20,0.55)';
          fctx.beginPath(); fctx.arc(sx, sy, 5 + rnd() * 10, 0, Math.PI * 2); fctx.fill();
        }
      }
      this.columnImg = sheets.churchColumn ? sheets.churchColumn.img : null;
      this.ceilingImg = sheets.ceilingTex ? sheets.ceilingTex.img : null;
      this.floorImg2 = sheets.floorTex2 ? sheets.floorTex2.img : null;
      this.bannerImg = sheets.banner ? sheets.banner.img : null;
      this.tombImg = sheets.tombstones ? sheets.tombstones.img : null;
      this.crossImg = sheets.crosses ? sheets.crosses.img : null;
      // real sprite decor (OpenGameArt): pennant banners, cemetery tombstone
      this.banners2 = sheets.banners2 ? sheets.banners2.img : null;
      this.bannerFrames = sheets.banners2 ? sheets.banners2.frames : null;
      this.tombCem = sheets.tombstoneCem ? sheets.tombstoneCem.img : null;

      const torchPos = [180, 540, 900, 1260, 1620, 2000, 2310];
      for (const x of torchPos) {
        this.torches.push({ x, y: FLOOR_Y - 6, phase: U.rand(0, 6), flick: U.rand(0.6, 1.2) });
      }
      // brass candlesticks with warm flames (extra light sources along the nave)
      this.candleLights = [];
      for (const cx of [430, 700, 980, 1340, 1600, 1880, 2140]) {
        this.candleLights.push({ x: cx, phase: U.rand(0, 6), flick: U.rand(0.7, 1.3), h: U.rand(58, 74) });
      }
      const props = [
        { x: 100, kind: 'bones' }, { x: 260, kind: 'rail' }, { x: 800, kind: 'pew' },
        { x: 1110, kind: 'rail' }, { x: 1400, kind: 'rail' }, { x: 1560, kind: 'saint' },
        { x: 1700, kind: 'pew' }, { x: 2050, kind: 'altar' }, { x: 2320, kind: 'bones' },
      ];
      for (const p of props) {
        this.deco.push({ x: p.x, y: FLOOR_Y, kind: p.kind, h: U.rand(60, 110), w: U.rand(24, 50), seed: U.rand(0, 100) });
      }
      for (let i = 0; i < 90; i++) {
        this.ash.push({
          x: U.rand(0, WORLD_W), y: U.rand(0, 720),
          vy: U.rand(8, 26), vx: U.rand(-8, 8),
          size: U.rand(0.8, 2.4), tw: U.rand(0, 6), a: U.rand(0.2, 0.6),
        });
      }
    }

    /* pre-render one segment: church frame 3x tiled, white-stripped,
       refined pilaster columns masking the seams */
    _makeSeg(sheet, frame) {
      const cv = document.createElement('canvas');
      cv.width = 1280; cv.height = 600;
      const ctx = cv.getContext('2d');
      ctx.fillStyle = '#0d0912';
      ctx.fillRect(0, 0, 1280, 600);
      const fw = frame.w, fh = frame.h;
      const scale = 4;  // bigger tiles, fewer repeats
      const dw = fw * scale, dh = fh * scale;
      const n = Math.ceil(1280 / dw);
      // strip white borders
      const tmp = document.createElement('canvas');
      tmp.width = fw; tmp.height = fh;
      const tctx = tmp.getContext('2d');
      tctx.drawImage(sheet.img, frame.x, frame.y, fw, fh, 0, 0, fw, fh);
      const id = tctx.getImageData(0, 0, fw, fh);
      const dd = id.data;
      for (let i = 0; i < dd.length; i += 4) {
        if (dd[i] > 212 && dd[i + 1] > 212 && dd[i + 2] > 212) dd[i + 3] = 0;
      }
      tctx.putImageData(id, 0, 0);
      // the 3rd background frame carries an ochre arch motif near its bottom
      // (frame coords x27-115, y96-186). Paint it out at the source so the
      // tiled wall reads clean —— no arch, no hard patch edges.
      if (frame.x >= 320 && frame.x < 448) {
        const archX = 26, archY = 94, archW = 92, archH = 92;
        // wall fill sampled from the frame's own stonework
        tctx.fillStyle = '#2b2437';
        tctx.fillRect(archX, archY, archW, archH);
        // masonry seams so the patch reads as the same stone wall
        tctx.fillStyle = 'rgba(12,9,18,0.55)';
        for (let sy = archY + 14; sy < archY + archH; sy += 15) tctx.fillRect(archX, sy, archW, 1);
        for (let sx = archX + 20; sx < archX + archW; sx += 26) tctx.fillRect(sx, archY, 1, archH);
        // subtle grime blotches
        tctx.fillStyle = 'rgba(8,6,14,0.25)';
        tctx.fillRect(archX + 14, archY + 34, 30, 22);
        tctx.fillRect(archX + 46, archY + 60, 26, 18);
        // feathered side edges —— no hard rectangle border
        const fadeL = tctx.createLinearGradient(archX, 0, archX + 12, 0);
        fadeL.addColorStop(0, 'rgba(43,36,55,0)');
        fadeL.addColorStop(1, 'rgba(43,36,55,1)');
        tctx.fillStyle = fadeL;
        tctx.fillRect(archX, archY, 12, archH);
        const fadeR = tctx.createLinearGradient(archX + archW, 0, archX + archW - 12, 0);
        fadeR.addColorStop(0, 'rgba(43,36,55,0)');
        fadeR.addColorStop(1, 'rgba(43,36,55,1)');
        tctx.fillStyle = fadeR;
        tctx.fillRect(archX + archW - 12, archY, 12, archH);
        const fadeT = tctx.createLinearGradient(0, archY, 0, archY + 10);
        fadeT.addColorStop(0, 'rgba(43,36,55,0)');
        fadeT.addColorStop(1, 'rgba(43,36,55,1)');
        tctx.fillStyle = fadeT;
        tctx.fillRect(archX, archY, archW, 10);
      }
      ctx.imageSmoothingEnabled = false;
      for (let i = 0; i < n; i++) {
        ctx.drawImage(tmp, 0, 0, fw, fh, i * dw, 0, dw, dh);
      }
      // refined pilaster columns masking the tile seams
      for (let i = 1; i < n; i++) {
        const px = i * dw;
        ctx.fillStyle = '#0d0916';
        ctx.fillRect(px - 26, 0, 52, 600);
        ctx.fillStyle = 'rgba(30,22,44,0.5)';
        ctx.fillRect(px - 20, 0, 10, 600);
        ctx.fillRect(px + 10, 0, 10, 600);
        ctx.fillStyle = '#0a0712';
        ctx.fillRect(px - 32, 0, 64, 22);
        ctx.fillRect(px - 32, 578, 64, 22);
      }
      // vault shadow at the top
      const vg = ctx.createLinearGradient(0, 0, 0, 240);
      vg.addColorStop(0, 'rgba(5,3,10,0.85)');
      vg.addColorStop(1, 'rgba(5,3,10,0)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, 1280, 240);
      // floor pooling shadow
      const fg = ctx.createLinearGradient(0, 470, 0, 600);
      fg.addColorStop(0, 'rgba(0,0,0,0)');
      fg.addColorStop(1, 'rgba(0,0,0,0.6)');
      ctx.fillStyle = fg;
      ctx.fillRect(0, 0, 1280, 600);
      return cv;
    }

    get floorTop() { return FLOOR_Y; }

    update(dt, camX) {
      this.t += dt;
      this.blood += (this.bloodTarget - this.blood) * Math.min(1, dt * 2.2);
      if (Math.abs(this.blood - this.bloodTarget) < 0.01) this.blood = this.bloodTarget;
      for (const t of this.torches) {
        if (Math.random() < dt * 8) Game.Fx.embers(t.x, t.y - 46, 2);
      }
      // candle smoke ribbons
      for (const c of this.candleLights) {
        if (Math.random() < dt * 3) {
          Game.Fx.spawn({
            x: c.x + U.rand(-2, 2), y: FLOOR_Y - c.h - 18,
            vx: U.rand(-4, 4), vy: -U.rand(14, 26),
            life: U.rand(0.9, 1.6), size: U.rand(2.5, 5),
            color: 'rgba(150,138,120,0.55)', type: 'smoke',
            grav: -6, drag: 0.8, alpha: 0.35,
          });
        }
      }
      for (const a of this.ash) {
        a.y -= a.vy * dt;
        a.x += a.vx * dt + Math.sin(this.t * 0.5 + a.tw) * 6 * dt;
        if (a.y < -20) { a.y = 720 + 20; a.x = U.rand(0, WORLD_W); }
        if (a.x < -10) a.x = WORLD_W + 10;
        if (a.x > WORLD_W + 10) a.x = -10;
      }
    }

    /* ---------- background ---------- */
    drawBackground(ctx, cam, combatLevel) {
      const W = cam.vw, H = cam.vh;
      const seg = Math.floor(cam.x / SEG_W) % 5;
      if (this.segBgs && this.segBgs[seg]) {
        ctx.drawImage(this.segBgs[seg], 0, 0);
        const local = cam.x % SEG_W;
        if (local > SEG_W - 160 && this.segBgs[seg + 1]) {
          const a = U.clamp((local - (SEG_W - 160)) / 160, 0, 1);
          ctx.globalAlpha = a;
          ctx.drawImage(this.segBgs[seg + 1], 0, 0);
          ctx.globalAlpha = 1;
        }
      } else {
        ctx.fillStyle = '#18121f';
        ctx.fillRect(0, 0, W, 600);
      }

      // (pennant banners removed per request)

      // ambient candlelight (breathing warm zone along the nave)
      if (this.opts.ambient) {
        const breathe = 1 + 0.06 * Math.sin(this.t * 1.7);
        const az = ctx.createRadialGradient(W / 2, H * 0.5, H * 0.15, W / 2, H * 0.5, H * 0.75);
        az.addColorStop(0, 'rgba(255,190,110,0.085)');
        az.addColorStop(0.5, 'rgba(255,160,80,0.04)');
        az.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = az;
        ctx.globalAlpha = breathe * (1 - this.blood * 0.6);
        ctx.fillRect(0, 0, W, H);
        ctx.globalAlpha = 1;
      }

      // god rays from the clerestory (additive, swaying slowly)
      if (this.opts.godRays) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const rays = 3;
        for (let r = 0; r < rays; r++) {
          const base = (r / rays) * W + (cam.x * 0.02) % 240;
          const sway = Math.sin(this.t * 0.5 + r * 2.1) * 18;
          const x0 = (base + sway + W) % W;
          const x1 = x0 + 60 + Math.sin(this.t * 0.3 + r) * 14;
          const a = 0.05 + 0.03 * Math.sin(this.t * 0.8 + r * 1.7);
          const rg = ctx.createLinearGradient(0, 70, 0, H * 0.92);
          rg.addColorStop(0, 'rgba(255,215,150,' + a + ')');
          rg.addColorStop(1, 'rgba(255,200,120,0)');
          ctx.fillStyle = rg;
          ctx.beginPath();
          ctx.moveTo(x0, 70); ctx.lineTo(x0 + 70, 70);
          ctx.lineTo(x1 + 160, H * 0.92); ctx.lineTo(x1, H * 0.92);
          ctx.closePath(); ctx.fill();
        }
        ctx.restore();
      }

      // vignette light zoning
      const vz = ctx.createRadialGradient(W / 2, H * 0.55, H * 0.22, W / 2, H * 0.55, H * 0.75);
      vz.addColorStop(0, 'rgba(0,0,0,0)');
      vz.addColorStop(1, 'rgba(2,1,6,0.35)');
      ctx.fillStyle = vz;
      ctx.fillRect(0, 0, W, H);
      // boss phase-2 blood mode
      if (this.blood > 0.01) {
        const b = this.blood;
        const bg = ctx.createLinearGradient(0, 0, 0, H);
        bg.addColorStop(0, 'rgba(110,8,16,' + (0.14 * b) + ')');
        bg.addColorStop(0.62, 'rgba(130,12,20,' + (0.10 * b) + ')');
        bg.addColorStop(1, 'rgba(190,34,18,' + (0.30 * b) + ')');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, W, H);
      }
      // combat pressure
      if (combatLevel && combatLevel > 0.05) {
        const c = Math.min(1, combatLevel);
        const eg = ctx.createRadialGradient(W / 2, H / 2, H * 0.42, W / 2, H / 2, H * 0.9);
        eg.addColorStop(0, 'rgba(0,0,0,0)');
        eg.addColorStop(1, 'rgba(110,8,8,' + (0.24 * c) + ')');
        ctx.fillStyle = eg;
        ctx.fillRect(0, 0, W, H);
      }
    }

    /* ---------- topmost foreground: ceiling + parallax columns + god rays ---------- */
    drawForeground(ctx, cam) {
      const W = cam.vw, H = cam.vh;
      // ceiling: dark wall-brick tiles (distinct cold tone vs warm floor), dimmed
      if (this.opts.ceiling) {
      if (this.floorTex) {
        const tsrc = this.floorTex;
        ctx.imageSmoothingEnabled = false;
        for (let ty = 0; ty < 76; ty += 38) {
          const off = (ty / 38 % 2) * 32;
          for (let tx = -32; tx < W + 32; tx += 64) {
            ctx.drawImage(tsrc, 16, 16, 128, 128, tx + off, ty, 64, 38);
          }
        }
        ctx.imageSmoothingEnabled = true;
      } else {
        ctx.fillStyle = '#0b0812';
        ctx.fillRect(0, 0, W, 76);
      }
      // cold blue-violet wash so the ceiling clearly reads apart from the floor
      ctx.fillStyle = 'rgba(28,24,62,0.5)';
      ctx.fillRect(0, 0, W, 76);
      // vault dimming: darker toward the apex (top) and the side walls
      const cdg = ctx.createRadialGradient(W / 2, 76, 20, W / 2, 76, W * 0.72);
      cdg.addColorStop(0, 'rgba(16,20,52,0.16)');
      cdg.addColorStop(1, 'rgba(0,0,0,0.82)');
      ctx.fillStyle = cdg;
      ctx.fillRect(0, 0, W, 76);
      }
      ctx.fillStyle = '#1a1226';
      ctx.fillRect(0, 66, W, 10);
      ctx.fillStyle = 'rgba(216,170,90,0.18)';
      ctx.fillRect(0, 66, W, 2);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(0, 74, W, 2);

      // columns drift with the camera (15% translucent + real stone texture)
      if (this.opts.fgColumns) {
      const off = cam.x * 0.35;
      const cxs = [
        ((-off) % (W + 200) + (W + 200)) % (W + 200) - 100,
        ((-off + 520) % (W + 200) + (W + 200)) % (W + 200) - 100,
        ((-off + 1040) % (W + 200) + (W + 200)) % (W + 200) - 100,
      ];
      for (const cx of cxs) {
        if (cx < -60 || cx > W + 60) continue;
        // plaster shaft (foreground layer): cold grey-blue, translucent,
        // soft blurred edges —— clearly cooler than the warm scene
        ctx.save();
        ctx.globalAlpha = 0.4;
        const pg = ctx.createLinearGradient(cx - 34, 0, cx + 34, 0);
        pg.addColorStop(0, 'rgba(78,84,104,0.5)');
        pg.addColorStop(0.35, 'rgba(100,108,130,0.95)');
        pg.addColorStop(0.65, 'rgba(100,108,130,0.9)');
        pg.addColorStop(1, 'rgba(66,72,90,0.45)');
        ctx.fillStyle = pg;
        ctx.fillRect(cx - 34, 76, 68, Game.World.FLOOR_Y - 76);
        // vertical sheen + soft edge shading (fake depth blur)
        ctx.fillStyle = 'rgba(160,168,192,0.18)';
        ctx.fillRect(cx - 30, 76, 8, Game.World.FLOOR_Y - 76);
        ctx.fillStyle = 'rgba(24,28,38,0.4)';
        ctx.fillRect(cx + 22, 76, 12, Game.World.FLOOR_Y - 76);
        // weathering: crack + grime flecks
        ctx.fillStyle = 'rgba(34,32,42,0.6)';
        ctx.fillRect(cx - 8, 180, 1, 50);
        ctx.fillRect(cx + 14, 320, 1, 36);
        ctx.fillStyle = 'rgba(140,136,130,0.2)';
        ctx.fillRect(cx - 20, 120, 20, 2);
        ctx.fillRect(cx + 4, 260, 14, 2);
        ctx.fillStyle = 'rgba(96,18,20,0.4)';
        ctx.fillRect(cx - 12, Game.World.FLOOR_Y - 34, 5, 4);
        ctx.fillRect(cx + 20, Game.World.FLOOR_Y - 22, 3, 3);
        ctx.restore();
        // capital/base in matching plaster tone
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = 'rgba(82,90,112,0.9)';
        ctx.fillRect(cx - 48, 70, 96, 8);
        ctx.fillRect(cx - 42, 78, 84, 10);
        ctx.fillRect(cx - 48, 88, 96, 6);
        ctx.fillRect(cx - 52, Game.World.FLOOR_Y - 12, 104, 12);
        ctx.fillRect(cx - 44, Game.World.FLOOR_Y - 20, 88, 8);
        ctx.fillRect(cx - 36, Game.World.FLOOR_Y - 26, 72, 6);
        ctx.globalAlpha = 1;
      }
      } // /fgColumns

      // light spilling through the ceiling seams (additive)
      if (this.opts.seamLight) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const seamW = 6;
        for (let sx = 60; sx < W; sx += 340) {
          const sway = Math.sin(this.t * 0.6 + sx * 0.05) * 10;
          const g = ctx.createLinearGradient(sx, 0, sx, 200);
          g.addColorStop(0, 'rgba(255,210,150,0.10)');
          g.addColorStop(1, 'rgba(255,200,120,0)');
          ctx.fillStyle = g;
          ctx.fillRect(sx - seamW / 2 + sway, 0, seamW, 200);
        }
        ctx.restore();
      }
    }

    /* ---------- floor: real tileset floor bricks ---------- */
    drawFloor(ctx) {
      if (this.opts.floor && this.floorCanvas) {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(this.floorCanvas, 0, FLOOR_Y);
      } else {
        ctx.fillStyle = '#0d0a10';
        ctx.fillRect(0, FLOOR_Y, this.w, FLOOR_H);
      }
      // worn pilgrim path
      if (this.opts.floor) {
      const pg = ctx.createLinearGradient(0, FLOOR_Y, 0, FLOOR_Y + FLOOR_H);
      pg.addColorStop(0, 'rgba(220,190,140,0.20)');
      pg.addColorStop(1, 'rgba(220,190,140,0.06)');
      ctx.fillStyle = pg;
      ctx.fillRect(this.w * 0.35, FLOOR_Y, this.w * 0.3, FLOOR_H);
      ctx.fillStyle = 'rgba(200,170,120,0.3)';
      ctx.fillRect(0, FLOOR_Y, this.w, 2);
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, FLOOR_Y + 2, this.w, 4);
      }
    }

    /* ---------- decor: columns, props, torches ---------- */
    drawDeco(ctx) {
      // crimson rug with gold trim running down the nave
      if (this.opts.rug) this._drawRug(ctx);
      // plaster columns (mid-ground): pale grey, solid-ish, fluted,
      // soft edge falloff —— consistent material with the foreground pillars
      if (this.opts.columns) {
        const dh = FLOOR_Y - 76;
        for (const cx of [420, 1020, 1620, 2200]) {
          // grounded shadow
          ctx.fillStyle = 'rgba(0,0,0,0.55)';
          ctx.beginPath(); ctx.ellipse(cx, FLOOR_Y + 3, 78, 6, 0, 0, Math.PI * 2); ctx.fill();
          ctx.save();
          ctx.globalAlpha = 0.85;
          // shaft with horizontal falloff —— cold grey-blue plaster,
          // clearly cooler than the warm floor & walls
          const pg = ctx.createLinearGradient(cx - 64, 0, cx + 64, 0);
          pg.addColorStop(0, 'rgba(72,78,98,0.55)');
          pg.addColorStop(0.3, 'rgba(92,100,124,1)');
          pg.addColorStop(0.7, 'rgba(92,100,124,0.95)');
          pg.addColorStop(1, 'rgba(60,66,84,0.5)');
          ctx.fillStyle = pg;
          ctx.fillRect(cx - 64, 76, 128, dh);
          // flutes (vertical grooves)
          ctx.fillStyle = 'rgba(46,52,70,0.45)';
          for (let fx = -48; fx <= 48; fx += 24) ctx.fillRect(cx + fx, 76, 6, dh);
          // sheen highlight (cold, muted)
          ctx.fillStyle = 'rgba(150,158,182,0.22)';
          ctx.fillRect(cx - 42, 76, 14, dh);
          // weathering: hairline cracks
          ctx.fillStyle = 'rgba(38,36,46,0.85)';
          ctx.fillRect(cx - 30, 120, 1, 60);
          ctx.fillRect(cx + 22, 220, 1, 84);
          ctx.fillRect(cx + 8, 340, 1, 46);
          ctx.fillRect(cx - 44, 420, 1, 32);
          // flaking plaster (light chips)
          ctx.fillStyle = 'rgba(158,154,168,0.7)';
          ctx.fillRect(cx - 40, 176, 8, 6);
          ctx.fillRect(cx + 30, 296, 10, 7);
          ctx.fillRect(cx - 12, 400, 7, 5);
          ctx.fillRect(cx + 44, 130, 6, 4);
          // dust & grime near the top
          ctx.fillStyle = 'rgba(150,146,140,0.22)';
          ctx.fillRect(cx - 42, 108, 34, 2);
          ctx.fillRect(cx + 8, 132, 26, 2);
          ctx.fillRect(cx - 20, 160, 18, 2);
          // blood spatter near the base
          ctx.fillStyle = 'rgba(96,18,20,0.5)';
          ctx.fillRect(cx - 36, FLOOR_Y - 42, 6, 5);
          ctx.fillRect(cx + 16, FLOOR_Y - 30, 4, 4);
          ctx.fillRect(cx - 10, FLOOR_Y - 18, 5, 3);
          ctx.fillRect(cx + 34, FLOOR_Y - 26, 3, 3);
          // capital
          ctx.fillStyle = 'rgba(88,96,118,0.95)';
          ctx.fillRect(cx - 72, 76, 144, 12);
          ctx.fillRect(cx - 66, 88, 132, 8);
          ctx.fillStyle = 'rgba(66,72,90,0.9)';
          ctx.fillRect(cx - 60, 96, 120, 5);
          // base plinth
          ctx.fillStyle = 'rgba(82,90,112,0.95)';
          ctx.fillRect(cx - 72, FLOOR_Y - 14, 144, 14);
          ctx.fillRect(cx - 64, FLOOR_Y - 22, 128, 8);
          ctx.fillStyle = 'rgba(56,62,80,0.9)';
          ctx.fillRect(cx - 58, FLOOR_Y - 6, 116, 6);
          ctx.restore();
        }
      }
      // (procedural decor removed —— using real sprites instead)
      // ornate brass chandeliers hanging from the ceiling (procedural)
      if (this.opts.chandelier) {
        for (const hx of [650, 1250, 1850]) {
          this._drawChandelier(ctx, hx);
        }
      }
      // (banner wall-hangings removed: the rod+chain+banner read as an arch/door)
      // tombstones & crosses (real sprites) along the arena
      if (this.opts.tombstone && (this.tombCem || this.tombImg)) {
        const tw2 = this.tombCem ? 166 * 1.6 : 110 * 1.8;
        const th2 = this.tombCem ? 170 * 1.6 : 108 * 1.8;
        ctx.imageSmoothingEnabled = false;
        for (const tx of [340, 720, 1200, 1900]) {
          // soft grounded shadow under each stone
          ctx.fillStyle = 'rgba(0,0,0,0.5)';
          ctx.beginPath(); ctx.ellipse(tx, FLOOR_Y + 3, tw2 * 0.42, 6, 0, 0, Math.PI * 2); ctx.fill();
          if (this.tombCem) ctx.drawImage(this.tombCem, tx - tw2 / 2, FLOOR_Y - th2, tw2, th2);
          else ctx.drawImage(this.tombImg, tx - tw2 / 2, FLOOR_Y - th2, tw2, th2);
        }
      }
      if (this.opts.cross && this.crossImg) {
        const cw2 = 110 * 1.6, ch2 = 108 * 1.6;
        ctx.imageSmoothingEnabled = false;
        for (const cx of [520, 1050, 1650, 2240]) {
          ctx.fillStyle = 'rgba(0,0,0,0.5)';
          ctx.beginPath(); ctx.ellipse(cx, FLOOR_Y + 3, cw2 * 0.4, 6, 0, 0, Math.PI * 2); ctx.fill();
          ctx.drawImage(this.crossImg, cx - cw2 / 2, FLOOR_Y - ch2, cw2, ch2);
        }
      }
      // torches
      if (this.opts.torch) {
      for (const t of this.torches) {
        const fl = t.flick * (1 + Math.sin(this.t * 9 + t.phase) * 0.18 + Math.sin(this.t * 23 + t.phase * 3) * 0.08);
        const fx = t.x, fy = t.y - 44;
        const grad = ctx.createRadialGradient(fx, fy, 2, fx, fy, 62 * fl);
        grad.addColorStop(0, 'rgba(255,180,80,0.9)');
        grad.addColorStop(0.4, 'rgba(255,120,40,0.35)');
        grad.addColorStop(1, 'rgba(255,80,20,0)');
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(fx, fy, 62 * fl, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffd070';
        ctx.beginPath();
        ctx.ellipse(fx, fy - 4 * fl, 5, 9 * fl, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ff8830';
        ctx.beginPath();
        ctx.ellipse(fx, fy - 2 * fl, 3, 6 * fl, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#2a2018';
        ctx.fillRect(fx - 2, fy + 2, 4, 12);
        ctx.fillRect(fx - 6, fy + 10, 12, 3);
      }
      } // /torch
      // simple candles with live flames along the nave
      // (the downloaded candlestick sprite was a green chained candelabra ——
      //  removed; plain white candles keep the light without the wrong prop)
      if (this.opts.candlestick) {
      for (const c of this.candleLights) {
        const fl = c.flick * (1 + Math.sin(this.t * 8 + c.phase) * 0.15 + Math.sin(this.t * 19 + c.phase * 2) * 0.06);
        const fy = FLOOR_Y - c.h;
        // warm halo around the flame
        const cg = ctx.createRadialGradient(c.x, fy - 14, 2, c.x, fy - 14, 46 * fl);
        cg.addColorStop(0, 'rgba(255,190,110,0.55)');
        cg.addColorStop(0.5, 'rgba(255,150,60,0.2)');
        cg.addColorStop(1, 'rgba(255,120,40,0)');
        ctx.fillStyle = cg;
        ctx.beginPath(); ctx.arc(c.x, fy - 14, 46 * fl, 0, Math.PI * 2); ctx.fill();
        // grounded shadow
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.beginPath(); ctx.ellipse(c.x, FLOOR_Y + 3, 14, 4, 0, 0, Math.PI * 2); ctx.fill();
        // brass base + stem (simple, dark, unobtrusive)
        ctx.fillStyle = '#3d3222';
        ctx.fillRect(c.x - 4, fy, 8, c.h * 0.4);
        ctx.fillRect(c.x - 9, FLOOR_Y - 6, 18, 6);
        ctx.fillStyle = '#5a4a2e';
        ctx.fillRect(c.x - 4, fy, 8, 2);
        // wax candle
        ctx.fillStyle = '#e8dcb8';
        ctx.fillRect(c.x - 3, fy - 12, 6, 13);
        ctx.fillStyle = '#f5eed4';
        ctx.fillRect(c.x - 1, fy - 12, 2, 13);
        // flame
        const fz = 5.5 * fl;
        ctx.fillStyle = '#ffd070';
        ctx.beginPath(); ctx.ellipse(c.x, fy - 16, 2.4, fz, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ff9630';
        ctx.beginPath(); ctx.ellipse(c.x, fy - 14, 1.4, fz * 0.6, 0, 0, Math.PI * 2); ctx.fill();
        // wax drips
        ctx.fillStyle = 'rgba(232,220,184,0.8)';
        ctx.fillRect(c.x - 3, fy - 6, 1, 3);
        ctx.fillRect(c.x + 1, fy - 4, 1, 4);
      }
      } // /candlestick
      // ground props: broken weapons, bones, helmet
      if (this.opts.groundProps) this._drawProps(ctx);
      // church furniture: pews, saint shrine, altar, bone piles
      this._drawDecoProps(ctx);
    }

    /* ---------- top-layer decor: corpses, book piles, barrels, statues ----------
       drawn after entities so they read as the closest ground props; every item
       is grounded on FLOOR_Y */
    drawDecoFront(ctx) {
      // three clustered groups (not scattered): left / mid / right
      // left cluster (near the chancel rail)
      this._drawStatue(ctx, 110);
      this._drawCorpse(ctx, 175);
      this._drawBookpile(ctx, 245);
      // mid cluster (before the crosses & tombstones)
      this._drawBookpile(ctx, 940);
      this._drawBarrel(ctx, 1020);
      this._drawStatue(ctx, 1110);
      // right cluster (before the tombstone row)
      this._drawBarrel(ctx, 1790);
      this._drawBookpile(ctx, 1870);
      this._drawCorpse(ctx, 1990);
    }

    /* fallen corpse lying on its back (dark robes, pale head/hands, blood pool) */
    _drawCorpse(ctx, x) {
      const y = FLOOR_Y;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.beginPath(); ctx.ellipse(x, y + 3, 52, 6, 0, 0, Math.PI * 2); ctx.fill();
      // blood pool under the body
      ctx.fillStyle = 'rgba(90,12,14,0.45)';
      ctx.beginPath(); ctx.ellipse(x - 18, y + 1, 32, 6, 0, 0, Math.PI * 2); ctx.fill();
      // dark robes
      ctx.fillStyle = '#2a2030';
      ctx.fillRect(x - 44, y - 16, 88, 16);
      ctx.fillStyle = '#3a2c40';
      ctx.fillRect(x - 44, y - 16, 88, 4);
      // head (lying sideways)
      ctx.fillStyle = '#c8b8a8';
      ctx.beginPath(); ctx.arc(x + 40, y - 20, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#8a7a6a';
      ctx.fillRect(x + 38, y - 22, 4, 3);
      // arms out
      ctx.fillStyle = '#2a2030';
      ctx.fillRect(x - 46, y - 12, 14, 4);
      ctx.fillRect(x + 32, y - 12, 14, 4);
      ctx.fillStyle = '#c8b8a8';
      ctx.fillRect(x - 48, y - 10, 5, 4);
      ctx.fillRect(x + 44, y - 10, 5, 4);
    }

    /* pile of tomes with an open book on top */
    _drawBookpile(ctx, x) {
      const y = FLOOR_Y;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.beginPath(); ctx.ellipse(x, y + 3, 30, 4, 0, 0, Math.PI * 2); ctx.fill();
      // bottom stack
      ctx.fillStyle = '#3a2c1c';
      ctx.fillRect(x - 26, y - 10, 52, 10);
      ctx.fillStyle = '#5a4a30';
      ctx.fillRect(x - 26, y - 10, 52, 2);
      // second stack (shifted)
      ctx.fillStyle = '#4a3820';
      ctx.fillRect(x - 18, y - 20, 40, 10);
      // third, smaller
      ctx.fillStyle = '#5c4a2a';
      ctx.fillRect(x - 10, y - 28, 26, 8);
      ctx.fillStyle = '#6a5634';
      ctx.fillRect(x - 10, y - 28, 26, 2);
      // open book on top
      ctx.fillStyle = '#e8dcb8';
      ctx.beginPath();
      ctx.moveTo(x - 12, y - 30); ctx.lineTo(x, y - 34); ctx.lineTo(x + 12, y - 30); ctx.lineTo(x, y - 27);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(x - 10, y - 31, 8, 1);
      ctx.fillRect(x + 3, y - 31, 8, 1);
    }

    /* wooden barrel with metal bands */
    _drawBarrel(ctx, x) {
      const y = FLOOR_Y;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.beginPath(); ctx.ellipse(x, y + 3, 22, 5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#4a3520';
      ctx.fillRect(x - 18, y - 34, 36, 34);
      ctx.fillStyle = '#5c4428';
      ctx.fillRect(x - 18, y - 34, 36, 3);
      // bulge shading
      ctx.fillStyle = '#3a2a18';
      ctx.fillRect(x - 18, y - 22, 6, 22);
      ctx.fillRect(x + 12, y - 22, 6, 22);
      // metal bands
      ctx.fillStyle = '#6a5a3a';
      ctx.fillRect(x - 18, y - 26, 36, 4);
      ctx.fillRect(x - 18, y - 10, 36, 4);
      ctx.fillStyle = '#7a6a48';
      ctx.fillRect(x - 18, y - 26, 36, 1);
      // top rim
      ctx.fillStyle = '#6a5434';
      ctx.fillRect(x - 14, y - 36, 28, 4);
      ctx.fillStyle = '#8a7450';
      ctx.fillRect(x - 14, y - 36, 28, 1);
    }

    /* small stone statue on a pedestal (dark stone, in the gothic palette) */
    _drawStatue(ctx, x) {
      const y = FLOOR_Y;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.beginPath(); ctx.ellipse(x, y + 3, 24, 5, 0, 0, Math.PI * 2); ctx.fill();
      // pedestal
      ctx.fillStyle = '#5a5460';
      ctx.fillRect(x - 18, y - 14, 36, 14);
      ctx.fillStyle = '#4a4450';
      ctx.fillRect(x - 22, y - 6, 44, 6);
      // figure
      ctx.fillStyle = '#6a6472';
      ctx.fillRect(x - 5, y - 46, 10, 32);
      ctx.fillStyle = '#7a7480';
      ctx.beginPath(); ctx.arc(x, y - 52, 7, 0, Math.PI * 2); ctx.fill();
      // robe flare
      ctx.fillStyle = '#5a5460';
      ctx.fillRect(x - 9, y - 24, 18, 10);
      ctx.fillStyle = '#4a4450';
      ctx.fillRect(x - 5, y - 38, 10, 4);
    }

    /* ---------- church furniture (all grounded, pixel-art style) ---------- */
    _drawDecoProps(ctx) {
      for (const p of this.deco) {
        switch (p.kind) {
          case 'pew': if (this.opts.pew) this._drawPew(ctx, p); break;
          case 'saint': if (this.opts.saint) this._drawSaint(ctx, p); break;
          case 'altar': if (this.opts.altar) this._drawAltar(ctx, p); break;
          case 'bones': if (this.opts.bones) this._drawBones(ctx, p); break;
          case 'rail': if (this.opts.rail) this._drawRail(ctx, p); break;
        }
      }
    }

    /* stone chancel rail: plinth + balusters + top rail with gilt finials,
       fully grounded on the floor */
    _drawRail(ctx, p) {
      const x = p.x, y = FLOOR_Y;
      // grounded shadow
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.beginPath(); ctx.ellipse(x, y + 3, 86, 6, 0, 0, Math.PI * 2); ctx.fill();
      // base plinth sitting on the floor
      ctx.fillStyle = '#241c30';
      ctx.fillRect(x - 80, y - 10, 160, 10);
      ctx.fillStyle = '#181224';
      ctx.fillRect(x - 80, y - 4, 160, 4);
      // balusters (little pillars)
      ctx.fillStyle = '#2e2440';
      for (let i = -2; i <= 2; i++) {
        const bx = x + i * 30;
        ctx.fillRect(bx - 5, y - 42, 10, 32);
        ctx.fillRect(bx - 7, y - 46, 14, 4);
        ctx.fillRect(bx - 5, y - 14, 10, 4);
      }
      // top rail
      ctx.fillStyle = '#3a2e4c';
      ctx.fillRect(x - 82, y - 52, 164, 7);
      ctx.fillStyle = '#4a3c5e';
      ctx.fillRect(x - 82, y - 52, 164, 2);
      // gilt finials on both ends
      ctx.fillStyle = '#8a6a30';
      ctx.fillRect(x - 85, y - 58, 4, 10);
      ctx.fillRect(x + 81, y - 58, 4, 10);
      ctx.fillStyle = '#b89a4a';
      ctx.fillRect(x - 85, y - 60, 4, 2);
      ctx.fillRect(x + 81, y - 60, 4, 2);
    }

    /* ornate brass chandelier: single chain + central shaft + three tiers of
       candle arms spreading outward (branching fan, reads as a light fixture) */
    _drawChandelier(ctx, x) {
      const t = this.t;
      const flick = (hx) => 1 + 0.12 * Math.sin(t * 7 + hx) + 0.06 * Math.sin(t * 17 + hx * 2);
      // warm halo behind the whole fixture
      const glowR = 100 * (0.85 + 0.15 * Math.sin(t * 3 + x));
      const gg = ctx.createRadialGradient(x, 138, 6, x, 138, glowR);
      gg.addColorStop(0, 'rgba(255,200,120,0.30)');
      gg.addColorStop(0.6, 'rgba(255,160,70,0.12)');
      gg.addColorStop(1, 'rgba(255,140,50,0)');
      ctx.fillStyle = gg;
      ctx.beginPath(); ctx.arc(x, 138, glowR, 0, Math.PI * 2); ctx.fill();
      // hanging chain (single central, fine links)
      ctx.fillStyle = '#5c4820';
      for (let ly = 60; ly < 92; ly += 5) ctx.fillRect(x - 1, ly, 2, 4);
      // top mount disc
      ctx.fillStyle = '#8a6a30';
      ctx.fillRect(x - 8, 90, 16, 5);
      ctx.fillStyle = '#a8823a';
      ctx.fillRect(x - 8, 90, 16, 2);
      // central shaft
      ctx.fillStyle = '#8a6a30';
      ctx.fillRect(x - 2, 95, 4, 72);
      ctx.fillStyle = '#a8823a';
      ctx.fillRect(x - 2, 95, 2, 72);
      // three tiers of arms spreading outward (branching fan, not a door)
      const tiers = [
        { y: 106, spread: 26, n: 2 },
        { y: 128, spread: 58, n: 4 },
        { y: 152, spread: 80, n: 4 },
      ];
      for (const tier of tiers) {
        const step = tier.n > 1 ? (tier.spread * 2) / (tier.n - 1) : 0;
        for (let i = 0; i < tier.n; i++) {
          const ax = x - tier.spread + step * i;
          // curved brass arm from the shaft out to the candle
          const mid = (x + ax) / 2;
          ctx.strokeStyle = '#8a6a30';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(x, tier.y);
          ctx.quadraticCurveTo(mid, tier.y - 7, ax, tier.y);
          ctx.stroke();
          ctx.strokeStyle = '#a8823a';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x, tier.y);
          ctx.quadraticCurveTo(mid, tier.y - 7, ax, tier.y);
          ctx.stroke();
          // candle cup + candle + flickering flame
          ctx.fillStyle = '#a8823a';
          ctx.fillRect(ax - 3, tier.y - 2, 6, 3);
          ctx.fillStyle = '#e8dcb8';
          ctx.fillRect(ax - 2, tier.y - 9, 4, 7);
          const fl = flick(ax * 7);
          ctx.fillStyle = '#ffd070';
          ctx.beginPath(); ctx.ellipse(ax, tier.y - 12, 1.6, 3.6 * fl, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#ff9630';
          ctx.beginPath(); ctx.ellipse(ax, tier.y - 10, 0.9, 2.2 * fl, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = 'rgba(255,190,110,0.22)';
          ctx.beginPath(); ctx.arc(ax, tier.y - 11, 6, 0, Math.PI * 2); ctx.fill();
        }
      }
      // centre bowl + teardrop finial
      ctx.fillStyle = '#b89a4a';
      ctx.fillRect(x - 9, 158, 18, 8);
      ctx.fillStyle = '#d8b86a';
      ctx.fillRect(x - 9, 158, 18, 2);
      ctx.fillStyle = '#d8b86a';
      ctx.fillRect(x - 2, 166, 4, 12);
      ctx.fillRect(x - 1, 178, 2, 6);
      ctx.fillStyle = '#f0d890';
      ctx.fillRect(x - 1, 166, 2, 12);
    }

    /* wooden pilgrim pew: seat + backrest + legs, resting on the floor */
    _drawPew(ctx, p) {
      const x = p.x, y = FLOOR_Y;
      // grounded shadow
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.beginPath(); ctx.ellipse(x, y + 3, 66, 6, 0, 0, Math.PI * 2); ctx.fill();
      // legs
      ctx.fillStyle = '#2a1e12';
      ctx.fillRect(x - 56, y - 42, 11, 42);
      ctx.fillRect(x + 45, y - 42, 11, 42);
      // seat
      ctx.fillStyle = '#4a3620';
      ctx.fillRect(x - 62, y - 42, 124, 10);
      ctx.fillStyle = '#5c4628';
      ctx.fillRect(x - 62, y - 42, 124, 3);
      // backrest (tall slats)
      ctx.fillStyle = '#33251a';
      ctx.fillRect(x - 62, y - 92, 124, 52);
      ctx.fillStyle = '#3d2c1e';
      for (let s = -2; s <= 2; s++) ctx.fillRect(x - 56 + s * 28, y - 90, 14, 48);
      // top rail
      ctx.fillStyle = '#4a3620';
      ctx.fillRect(x - 62, y - 92, 124, 5);
      // armrests
      ctx.fillStyle = '#3d2c1e';
      ctx.fillRect(x - 66, y - 66, 8, 26);
      ctx.fillRect(x + 58, y - 66, 8, 26);
      // kneeling cushion
      ctx.fillStyle = '#5c1320';
      ctx.fillRect(x - 46, y - 12, 92, 12);
      ctx.fillStyle = '#7a1a2a';
      ctx.fillRect(x - 46, y - 12, 92, 3);
    }

    /* saint shrine: stone pedestal + dark figure + gilded halo + candles */
    _drawSaint(ctx, p) {
      const x = p.x, y = FLOOR_Y;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.beginPath(); ctx.ellipse(x, y + 3, 50, 6, 0, 0, Math.PI * 2); ctx.fill();
      // pedestal
      ctx.fillStyle = '#241c30';
      ctx.fillRect(x - 34, y - 44, 68, 44);
      ctx.fillStyle = '#2e2440';
      ctx.fillRect(x - 42, y - 10, 84, 10);
      ctx.fillStyle = '#181224';
      ctx.fillRect(x - 30, y - 44, 60, 5);
      // votive candles on the pedestal top
      for (let i = -1; i <= 1; i++) {
        const cx2 = x + i * 22;
        ctx.fillStyle = '#e8dcb8';
        ctx.fillRect(cx2 - 2, y - 56, 4, 12);
        ctx.fillStyle = '#ffd070';
        ctx.beginPath(); ctx.arc(cx2, y - 60, 2.4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,190,110,0.28)';
        ctx.beginPath(); ctx.arc(cx2, y - 60, 8, 0, Math.PI * 2); ctx.fill();
      }
      // dark figure above the pedestal
      ctx.fillStyle = '#14101e';
      ctx.fillRect(x - 7, y - 102, 14, 46);
      ctx.fillRect(x - 12, y - 84, 24, 5);      // arms
      ctx.fillStyle = '#1c1628';
      ctx.beginPath(); ctx.arc(x, y - 108, 8, 0, Math.PI * 2); ctx.fill();
      // gilded halo
      ctx.fillStyle = 'rgba(216,170,90,0.5)';
      ctx.beginPath(); ctx.arc(x, y - 108, 14, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(216,170,90,0.7)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y - 108, 13, 0, Math.PI * 2); ctx.stroke();
    }

    /* stone altar with cloth + candles + crucifix */
    _drawAltar(ctx, p) {
      const x = p.x, y = FLOOR_Y;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.beginPath(); ctx.ellipse(x, y + 3, 76, 7, 0, 0, Math.PI * 2); ctx.fill();
      // stone base
      ctx.fillStyle = '#2a2234';
      ctx.fillRect(x - 66, y - 56, 132, 56);
      ctx.fillStyle = '#181224';
      ctx.fillRect(x - 66, y - 14, 132, 14);
      ctx.fillStyle = '#362c46';
      ctx.fillRect(x - 66, y - 56, 132, 8);     // top slab
      // altar cloth with gold trim
      ctx.fillStyle = '#5c1320';
      ctx.fillRect(x - 38, y - 48, 76, 26);
      ctx.fillStyle = '#c9a03c';
      ctx.fillRect(x - 38, y - 48, 76, 3);
      ctx.fillRect(x - 38, y - 48, 3, 26);
      ctx.fillRect(x + 35, y - 48, 3, 26);
      // candles
      for (let i = -1; i <= 1; i++) {
        const cx2 = x + i * 20;
        ctx.fillStyle = '#e8dcb8';
        ctx.fillRect(cx2 - 2, y - 74, 4, 26);
        ctx.fillStyle = '#ffd070';
        ctx.beginPath(); ctx.arc(cx2, y - 78, 2.6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,190,110,0.3)';
        ctx.beginPath(); ctx.arc(cx2, y - 78, 9, 0, Math.PI * 2); ctx.fill();
      }
      // gilt crucifix on the altar
      ctx.fillStyle = '#b89a4a';
      ctx.fillRect(x - 2, y - 104, 4, 32);
      ctx.fillRect(x - 13, y - 96, 26, 4);
      ctx.fillStyle = '#d8b86a';
      ctx.fillRect(x - 2, y - 104, 4, 3);
    }

    /* pile of bones with a skull (deterministic scatter) */
    _drawBones(ctx, p) {
      const x = p.x, y = FLOOR_Y;
      let seed = Math.floor(p.seed * 1000) + 7;
      const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.beginPath(); ctx.ellipse(x, y + 3, 40, 6, 0, 0, Math.PI * 2); ctx.fill();
      // scattered long bones
      for (let i = 0; i < 7; i++) {
        const a = rnd() * Math.PI * 2;
        const d = 10 + rnd() * 18;
        const bx = x + Math.cos(a) * d, by = y - 4 - rnd() * 5;
        ctx.save();
        ctx.translate(bx, by);
        ctx.rotate(a * 0.6 + i);
        ctx.fillStyle = '#d8d2c4';
        ctx.fillRect(-11, -2, 22, 4);
        ctx.fillRect(-3, -7, 6, 14);
        ctx.restore();
      }
      // skull on top
      const sx = x + (rnd() - 0.5) * 14;
      const sy = y - 16;
      ctx.fillStyle = '#e0dac8';
      ctx.fillRect(sx - 8, sy - 8, 16, 14);
      ctx.fillRect(sx - 11, sy - 5, 22, 6);
      ctx.fillStyle = '#14101a';
      ctx.fillRect(sx - 4, sy - 6, 4, 5);
      ctx.fillRect(sx + 3, sy - 6, 4, 5);
      ctx.fillRect(sx, sy - 2, 3, 4);
    }

    /* crimson rug with gold trim running down the nave (floor perspective: narrow far, wide near) */
    _drawRug(ctx) {
      const yFar = FLOOR_Y, yNear = FLOOR_Y + FLOOR_H;
      const cx = this.w * 0.42;
      const wFar = 260, wNear = 700;
      const half = (y) => wFar / 2 + (wNear - wFar) / 2 * (y - yFar) / FLOOR_H;
      // outer gold trim (trapezoid lying on the ground plane)
      ctx.fillStyle = '#c9a03c';
      this._trap(ctx, cx, yFar, half(yFar) + 9, cx, yNear, half(yNear) + 12);
      // crimson body
      ctx.fillStyle = '#5c1320';
      this._trap(ctx, cx, yFar, half(yFar), cx, yNear, half(yNear));
      // inner gold edges follow the perspective (left & right bands)
      ctx.fillStyle = '#a8813a';
      for (let t = 0; t < 1.001; t += 0.04) {
        const y = yFar + t * FLOOR_H;
        const hw = half(y);
        const hgt = Math.max(2, FLOOR_H * 0.05);
        ctx.fillRect(cx - hw - 3, y, 6, hgt);
        ctx.fillRect(cx + hw - 3, y, 6, hgt);
      }
      // gold fringe dashes on both long edges (longer when near)
      ctx.fillStyle = '#c9a03c';
      for (let t = 0; t < 1.001; t += 0.05) {
        const y = yFar + t * FLOOR_H;
        const hw = half(y);
        const fl = 3 + t * 7;
        ctx.fillRect(cx - hw - 8, y, 3, fl);
        ctx.fillRect(cx + hw + 5, y, 3, fl);
      }
      // medallions recede with the floor (rows shrink toward the horizon)
      for (let row = 0; row < 4; row++) {
        const t = 0.16 + row * 0.24;
        const y = yFar + t * FLOOR_H;
        const hw = half(y) * 0.78;
        const s = 0.55 + t * 1.0;
        ctx.fillStyle = 'rgba(201,160,60,0.5)';
        ctx.fillRect(cx - 1.5 * s, y - 6 * s, 3 * s, 12 * s);
        ctx.fillRect(cx - 8 * s, y - 3 * s, 16 * s, 6 * s);
        ctx.fillRect(cx - hw - 6 * s, y - 3 * s, 6 * s, 6 * s);
        ctx.fillRect(cx + hw - 2 * s, y - 3 * s, 6 * s, 6 * s);
        ctx.fillRect(cx - hw * 0.5 - 2 * s, y - 2 * s, 4 * s, 4 * s);
        ctx.fillRect(cx + hw * 0.5 - 2 * s, y - 2 * s, 4 * s, 4 * s);
      }
      // worn patches & blood stains (perspective bands)
      ctx.fillStyle = 'rgba(30,6,12,0.4)';
      this._trap(ctx, cx, yFar + 34, half(yFar + 34) * 0.4, cx, yFar + 62, half(yFar + 62) * 0.36);
      this._trap(ctx, cx, yFar + 76, half(yFar + 76) * 0.5, cx, yFar + 104, half(yFar + 104) * 0.46);
      ctx.fillStyle = 'rgba(70,10,14,0.5)';
      this._trap(ctx, cx, yFar + 44, half(yFar + 44) * 0.55, cx, yFar + 68, half(yFar + 68) * 0.6);
      this._trap(ctx, cx, yFar + 88, half(yFar + 88) * 0.62, cx, yFar + 110, half(yFar + 110) * 0.58);
    }

    /* filled trapezoid —— a floor element drawn with perspective */
    _trap(ctx, cxT, yT, hwT, cxB, yB, hwB) {
      ctx.beginPath();
      ctx.moveTo(cxT - hwT, yT);
      ctx.lineTo(cxT + hwT, yT);
      ctx.lineTo(cxB + hwB, yB);
      ctx.lineTo(cxB - hwB, yB);
      ctx.closePath();
      ctx.fill();
    }

    /* litter the floor with broken weapons, bones and a fallen helmet (perspective + ground shadows) */
    _drawProps(ctx) {
      const yFar = FLOOR_Y;
      const depth = (t) => ({ y: yFar + t * FLOOR_H, s: 0.6 + t * 0.85 });
      const shadow = (x, y, s) => {
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.beginPath();
        ctx.ellipse(x, y - 2 * s, 16 * s, 4 * s, 0, 0, Math.PI * 2);
        ctx.fill();
      };

      // broken sword stuck upright in the floor
      const sword = (x, t, lean) => {
        const d = depth(t), s = d.s, base = d.y;
        shadow(x, base, s);
        ctx.fillStyle = '#9a958e';
        ctx.fillRect(x - lean * s, base - 74 * s, 5 * s, 74 * s);
        ctx.fillStyle = '#c6c0b4';
        ctx.fillRect(x - lean * s, base - 74 * s, 2 * s, 74 * s);
        ctx.fillStyle = '#7a4a30';
        ctx.fillRect(x - lean * s + 3 * s, base - 26 * s, 2 * s, 9 * s);
        ctx.fillStyle = '#b4aea2';
        ctx.fillRect(x - lean * s - 3 * s, base - 82 * s, 9 * s, 9 * s);
        ctx.fillStyle = '#8a8478';
        ctx.fillRect(x - lean * s - s, base - 92 * s, 4 * s, 5 * s);
        ctx.fillStyle = '#3d3528';
        ctx.fillRect(x - 9 * s, base - 13 * s, 20 * s, 5 * s);
        ctx.fillRect(x - 5 * s, base - 17 * s, 11 * s, 8 * s);
        ctx.fillStyle = '#4a3520';
        ctx.fillRect(x - 3 * s, base - 7 * s, 7 * s, 7 * s);
      };
      sword(940, 0.3, 9);
      sword(1330, 0.62, -7);

      // broken spear snapped mid-shaft
      const spearX = 1150, sd = depth(0.46), s = sd.s, base = sd.y;
      shadow(spearX, base, s);
      ctx.fillStyle = '#8a8478';
      ctx.fillRect(spearX - 6 * s, base - 66 * s, 5 * s, 66 * s);
      ctx.fillStyle = '#b0aaa0';
      ctx.fillRect(spearX - 10 * s, base - 74 * s, 9 * s, 10 * s);
      ctx.fillStyle = '#6a6458';
      ctx.fillRect(spearX - 8 * s, base - 70 * s, 3 * s, 6 * s);
      ctx.fillStyle = '#7a7468';
      ctx.fillRect(spearX - 9 * s, base - 2 * s, 9 * s, 4 * s);

      // fallen knight helmet half-buried
      const hx = 1460, hd = depth(0.4), hs = hd.s, hb = hd.y;
      shadow(hx, hb, hs);
      ctx.fillStyle = '#6a6258';
      ctx.fillRect(hx, hb - 19 * hs, 22 * hs, 19 * hs);
      ctx.fillStyle = '#8a8278';
      ctx.fillRect(hx + 2 * hs, hb - 24 * hs, 17 * hs, 7 * hs);
      ctx.fillStyle = '#544c42';
      ctx.fillRect(hx + 5 * hs, hb - 21 * hs, 4 * hs, 3 * hs);
      ctx.fillStyle = '#2e2a24';
      ctx.fillRect(hx + 4 * hs, hb - 8 * hs, 7 * hs, 7 * hs);
      ctx.fillRect(hx + 14 * hs, hb - 8 * hs, 4 * hs, 7 * hs);
      ctx.fillStyle = '#3a342c';
      ctx.fillRect(hx + 8 * hs, hb - 27 * hs, 6 * hs, 4 * hs);

      // skulls lying on the floor
      const skull = (x, t) => {
        const d = depth(t), s = d.s, y = d.y;
        shadow(x, y, s);
        ctx.fillStyle = '#d8d2c4';
        ctx.fillRect(x, y - 13 * s, 15 * s, 11 * s);
        ctx.fillRect(x - 3 * s, y - 10 * s, 21 * s, 6 * s);
        ctx.fillStyle = '#1a1410';
        ctx.fillRect(x + 3 * s, y - 10 * s, 4 * s, 5 * s);
        ctx.fillRect(x + 10 * s, y - 10 * s, 4 * s, 5 * s);
        ctx.fillRect(x + 7 * s, y - 6 * s, 3 * s, 4 * s);
        ctx.fillStyle = '#a89e8c';
        ctx.fillRect(x + 7 * s, y - 13 * s, 2 * s, 4 * s);
      };
      skull(760, 0.22);
      skull(1080, 0.38);
      skull(1640, 0.55);

      // femurs
      ctx.fillStyle = '#d8d2c4';
      for (const fx of [790, 1050, 1630, 1690]) {
        const d = depth(0.2 + (fx % 7) * 0.05), s = d.s;
        ctx.fillRect(fx, d.y - 8 * s, 4 * s, 8 * s);
        ctx.fillRect(fx + 4 * s, d.y - 8 * s, 4 * s, 3 * s);
      }

      // scattered rubble & stones
      ctx.fillStyle = '#4a443c';
      for (const st of [[900, 0.28], [1240, 0.5], [1520, 0.58], [1020, 0.34]]) {
        const d = depth(st[1]), s = d.s;
        shadow(st[0], d.y, s * 0.7);
        ctx.fillStyle = '#4a443c';
        ctx.fillRect(st[0], d.y - 16 * s, 14 * s, 16 * s);
        ctx.fillStyle = '#5c564c';
        ctx.fillRect(st[0] + 3 * s, d.y - 14 * s, 6 * s, 5 * s);
        ctx.fillStyle = '#4a443c';
      }
    }
    drawAsh(ctx) {
      if (!this.opts.ash) return;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const a of this.ash) {
        const tw = 0.5 + 0.5 * Math.sin(this.t * 2 + a.tw);
        ctx.globalAlpha = a.a * (0.35 + 0.4 * tw);
        // warm-lit ember dust: warm core + soft halo
        ctx.fillStyle = '#d8b888';
        ctx.beginPath(); ctx.arc(a.x, a.y, a.size, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,190,110,0.35)';
        ctx.beginPath(); ctx.arc(a.x, a.y, a.size * 2.2, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
  }

  Game.World = { ArenaWorld, WORLD_W, FLOOR_Y, SEG_W };
})();





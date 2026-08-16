/* Tag-style resume modal — soft pixel-lanyard + pendulum physics.
   - open: card drops from outside the top with horizontal motion; rope snaps,
     then it swings (all one continuous physics sim, no transition stutter)
   - tilt (perspective) fades out smoothly in physics after the snap
   - hover: freeze ; quick click (<12px, <300ms): freeze + zoom to read, centered
   - drag: unlimited distance, drag velocity feeds the bounce-back energy
   - close: x (pointerdown) / Esc / backdrop */
(function () {
  'use strict';
  var modal = document.querySelector('[data-resume-modal]');
  if (!modal) return;
  var card = modal.querySelector('[data-resume-card]');
  var ropes = modal.querySelectorAll('[data-resume-rope] path');
  if (!card) return;

  var L0 = 360;          // rope natural length (px)
  var k = 45;            // stiffness — soft elastic cord
  var g = 1500;          // gravity (px/s^2)
  var damp = 0.986;      // linear damping — long gentle oscillation
  var maxSpeed = 2600;

  var P0 = { x: 0, y: 0 };
  var P = { x: 0, y: 0 }, V = { x: 0, y: 0 };
  var open = false, paused = false, reading = false;
  var locked = true;     // true during the drop: mouse has no effect
  var tiltX = 30;        // perspective tilt angle, fades after snap
  var raf = null, lastT = 0;
  var dragging = false, moved = false, downTime = 0;
  var startPX = 0, startPY = 0, startCX = 0, startCY = 0;
  var lastMoveT = 0, lastMovePx = 0, lastMovePy = 0;
  var bgs = [], bgState = [], bgT0 = 0, BG_COUNT = 90;
  var hintEl = null;

  function rand(n) { return (Math.random() * 2 - 1) * n; }
  function resize() { P0.x = Math.max(160, (card.offsetWidth / 2) + 24); P0.y = 0; }

  function physics(dt) {
    V.y += g * dt;
    var dx = P.x - P0.x, dy = P.y - P0.y;
    var dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > L0 && dist > 1) {
      var nx = dx / dist, ny = dy / dist;
      var F = k * (dist - L0);
      V.x -= nx * F * dt;
      V.y -= ny * F * dt;
    }
    var d = Math.pow(damp, dt * 60);
    V.x *= d; V.y *= d;
    var sp = Math.sqrt(V.x * V.x + V.y * V.y);
    if (sp > maxSpeed) { V.x *= maxSpeed / sp; V.y *= maxSpeed / sp; }
    P.x += V.x * dt;
    P.y += V.y * dt;
    if (P.y < 0) { P.y = 0; V.y = Math.abs(V.y) * 0.35; }
    var hw = card.offsetWidth / 2 + 10;
    if (P.x < hw) { P.x = hw; V.x = Math.abs(V.x) * 0.4; }
    if (P.x > window.innerWidth - hw) { P.x = window.innerWidth - hw; V.x = -Math.abs(V.x) * 0.4; }
  }

  function render() {
    var cw = card.offsetWidth;
    var tx = P.x - cw / 2;
    var extra = '';
    if (reading) { extra = ''; }
    else if (tiltX > 0.6) { extra = ' perspective(900px) rotateX(' + tiltX.toFixed(1) + 'deg) rotate(2deg)'; }
    card.style.transform = 'translate(' + tx + 'px,' + P.y + 'px)' + extra;
    if (hintEl && hintEl.classList.contains('show')) {
      hintEl.style.left = (P.x + cw / 2 + 30) + 'px';
      hintEl.style.top = (P.y + 30) + 'px';
    }
    if (ropes.length) {
      var x1 = P0.x, y1 = P0.y, x2 = P.x, y2 = P.y;
      var dx = x2 - x1, dy = y2 - y1;
      var dist = Math.sqrt(dx * dx + dy * dy) || 1;
      var sag = dist < L0 ? (L0 - dist) * 0.45 : 0;
      var mx = (x1 + x2) / 2, my = (y1 + y2) / 2 + sag;
      var d = 'M' + x1.toFixed(1) + ' ' + y1.toFixed(1) +
        ' Q' + mx.toFixed(1) + ' ' + my.toFixed(1) + ' ' + x2.toFixed(1) + ' ' + y2.toFixed(1);
      var f = Math.min(1, L0 / dist);
      var widths = [10, 8, 3];
      ropes.forEach(function (p, i) {
        p.setAttribute('d', d);
        var w = Math.max(i === 0 ? 2.5 : 1.5, widths[i] * f);
        p.setAttribute('stroke-width', w.toFixed(2));
      });
    }
  }

  function loop(t) {
    var dt = Math.min((t - lastT) / 1000, 0.05);
    lastT = t;
    if (open && !paused) { physics(dt); }
    if (locked && open && P.y >= L0) { locked = false; }
    if (!locked && tiltX > 0.6) { tiltX *= Math.pow(0.86, dt * 60); }
    try {
      bgTick();
      render();
    } catch (err) {
      try { window.__resumeErr = String(err && err.stack || err); } catch (e2) {}
    }
    raf = requestAnimationFrame(loop);
  }
  function startLoop() { if (raf == null) { lastT = performance.now(); raf = requestAnimationFrame(loop); } }
  function stopLoop() { if (raf != null) { cancelAnimationFrame(raf); raf = null; } }

  function buildBgs() {
    var container = modal.querySelector('[data-resume-bgs]');
    if (!container) return;
    container.innerHTML = '';
    bgs = []; bgState = [];
    var vw = window.innerWidth;
    for (var i = 0; i < BG_COUNT; i++) {
      var wrap = document.createElement('div');
      wrap.className = 'resume-bg-tag';
      var rope = document.createElement('div');
      rope.className = 'resume-bg-rope';
      var cardEl = document.createElement('div');
      cardEl.className = 'resume-bg-card';
      var depth = Math.random();                                   // 0 far .. 1 near
      var ax = 30 + Math.random() * (vw - 60);                     // anchor x
      var len = 100 + Math.random() * 500;                         // drop height: wide range, staggered
      var size = 40 + Math.random() * 210;                         // card width: 40-250, natural variance
      var w = size;
      var h = size * (0.6 + Math.random() * 1.2);                  // varied proportions (tall/short/wide)
      // palette: brown family (65%) + accent colors (35%)
      var warm = [[168,148,116],[148,126,92],[138,111,74],[107,84,52],[160,128,80],[186,160,120],[200,180,140]];
      var c = warm[Math.floor(Math.random() * warm.length)];
      var lum = 0.65 + Math.random() * 0.7;
      cardEl.style.width = w + 'px';
      cardEl.style.height = h + 'px';
      cardEl.style.opacity = (0.55 + depth * 0.4).toFixed(2);
      cardEl.style.background = 'rgba(' + Math.round(c[0] * lum) + ',' + Math.round(c[1] * lum) + ',' + Math.round(c[2] * lum) + ',' + (0.65 + depth * 0.35).toFixed(2) + ')';
      cardEl.style.filter = depth < 0.35 ? 'blur(1px)' : 'none';
      cardEl.style.transform = 'translate(' + (ax - w / 2).toFixed(1) + 'px,' + (-(len + 60)).toFixed(1) + 'px) rotate(0.000rad)';
      rope.style.left = (ax - 1) + 'px';
      rope.style.height = (len + 60) + 'px';
      wrap.appendChild(rope);
      wrap.appendChild(cardEl);
      container.appendChild(wrap);
      bgs.push(cardEl);
      bgState.push({
        card: cardEl, rope: rope,
        ax: ax, len: len, w: w, h: h,
        x: ax, y: -(len + 60),           // start above viewport
        vx: (Math.random() - 0.5) * 12, vy: 0,
        delay: i * 50 + Math.random() * 150,
        depth: depth,
        hit: false,
        fell: false,
        amp: 0.02 + Math.random() * 0.07,
        freq: 0.5 + Math.random() * 0.8,
        phase: Math.random() * 6.28
      });
    }
  }

  function bgTick() {
    if (!open || !bgState.length) return;
    var t = (performance.now() - bgT0) / 1000;
    // resume card rect for collision (computed from physics state)
    var cw = card.offsetWidth, ch = card.offsetHeight;
    var cr = { l: P.x - cw / 2, t: P.y, r: P.x + cw / 2, b: P.y + ch };
    var g2 = 900, k2 = 26, dmp2 = 0.97;   // strong per-frame damping: gentle sway then stop
    for (var i = 0; i < bgState.length; i++) {
      var b = bgState[i];
      var age = t - b.delay / 1000;
      if (age < 0) { continue; }
      if (!b.fell) {
        // falling phase (gravity + snap at len)
        b.vy += g2 * (1 / 60);
        b.x += b.vx * (1 / 60);
        b.y += b.vy * (1 / 60);
        var dy0 = b.y - b.len;
        if (dy0 >= 0 && b.vy > 0) {
          b.y = b.len; b.fell = true; b.vy = 0;
        }
      } else {
        // spring back toward anchor (ax, len) + gentle sway
        var dx = b.x - b.ax, dy = b.y - b.len;
        b.vx -= dx * k2 * (1 / 60) * 4;
        b.vy -= dy * k2 * (1 / 60) * 4;

        b.vx *= dmp2; b.vy *= dmp2;
        b.x += b.vx * (1 / 60);
        b.y += b.vy * (1 / 60);
      }
      // collision with the dragged resume card 鈥?one gentle impulse per entry
      if (b.fell && b.depth > 0.45) {
        var br = { l: b.x - b.w / 2, t: b.y, r: b.x + b.w / 2, b: b.y + b.h };
        var overlap = cr.l < br.r && cr.r > br.l && cr.t < br.b && cr.b > br.t;
        if (overlap) {
          if (!b.hit) { b.hit = true; var dir = (b.x >= P.x) ? 1 : -1; b.vx += dir * 7; b.vy -= 3; }
        } else { b.hit = false; }
      }
      // render
      var ang = Math.atan2(b.x - b.ax, Math.max(1, b.y));
      b.card.style.transform = 'translate(' + (b.x - b.w / 2).toFixed(1) + 'px,' + b.y.toFixed(1) + 'px) rotate(' + ang.toFixed(3) + 'rad)';
      if (b.rope) {
        var rx = b.ax - 1, ry = 0;
        var rdx = b.x - b.ax, rdy = b.y;
        var rlen = Math.sqrt(rdx * rdx + rdy * rdy) || 1;
        b.rope.style.left = rx + 'px';
        b.rope.style.height = rlen + 'px';
        b.rope.style.transform = 'rotate(' + Math.atan2(rdx, rdy).toFixed(3) + 'rad)';
      }
    }
  }  function openR() {
    if (open) return;
    open = true;
    modal.classList.add('open');
    document.documentElement.style.overflow = 'hidden';
    resize();
    var ch = card.offsetHeight || 600;
    P.x = P0.x + rand(90);
    P.y = -(ch + 80);
    V.x = rand(150);
    V.y = 0;
    locked = true;
    tiltX = 30;
    paused = false;
    reading = false;
    card.classList.remove('reading');
    card.style.transition = 'none';
    buildBgs();
    bgT0 = performance.now();
    hintEl = modal.querySelector('[data-resume-hint]');
    var hint = hintEl;
    if (hint) { hint.classList.remove('show'); clearTimeout(window.__hintT); window.__hintT = setTimeout(function () { hint.classList.add('show'); }, 6500); }
    render();
    startLoop();
  }
  function closeR() {
    open = false; paused = false; reading = false; dragging = false; locked = true;
    card.classList.remove('reading');
    var bgc = modal.querySelector('[data-resume-bgs]');
    if (bgc) bgc.innerHTML = '';
    bgs = [];
    modal.classList.remove('open');
    document.documentElement.style.overflow = '';
    stopLoop();
  }

  document.querySelectorAll('[data-resume-open]').forEach(function (b) {
    b.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); openR(); });
  });
  var closeBtn = modal.querySelector('[data-resume-close]');
  if (closeBtn) {
    closeBtn.addEventListener('click', function (e) { e.stopPropagation(); closeR(); });
    closeBtn.addEventListener('pointerdown', function (e) { e.stopPropagation(); closeR(); });
  }
  modal.addEventListener('click', function (e) { if (e.target === modal) closeR(); });
  modal.addEventListener('pointerdown', function () { if (hintEl) hintEl.classList.remove('show'); }, true);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && open) closeR(); });

  /* hover: freeze — never during the drop */
  card.addEventListener('mouseenter', function () {
    if (open && !locked && !dragging && !reading) paused = true;
  });
  card.addEventListener('mouseleave', function () {
    if (open && !locked && !dragging && !reading) paused = false;
  });

  /* drag + quick-click read mode — disabled while locked (dropping) */
  card.addEventListener('pointerdown', function (e) {
    if (!open || locked) return;
    dragging = true; moved = false;
    downTime = performance.now();
    paused = true;
    startPX = e.clientX; startPY = e.clientY;
    startCX = P.x; startCY = P.y;
    lastMoveT = performance.now(); lastMovePx = P.x; lastMovePy = P.y;
    var hintEl = modal.querySelector('[data-resume-hint]'); if (hintEl) hintEl.classList.remove('show');
    document.addEventListener('pointermove', onDragMove);
    document.addEventListener('pointerup', onDragEnd);
    document.addEventListener('pointercancel', onDragEnd);
  });
  function onDragMove(e) {
    if (!dragging) return;
    var dx = e.clientX - startPX, dy = e.clientY - startPY;
    if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;   // drag wins on tiny motion
    P.x = startCX + dx;
    P.y = startCY + dy;                                  // no clamp: unlimited drag
    // track drag velocity (clamped) for bounce-back energy
    var now = performance.now();
    var dtm = Math.max((now - lastMoveT) / 1000, 0.001);
    var vx = (P.x - lastMovePx) / dtm;
    var vy = (P.y - lastMovePy) / dtm;
    var vsp = Math.sqrt(vx * vx + vy * vy);
    if (vsp > 1600) { vx *= 1600 / vsp; vy *= 1600 / vsp; }
    V.x = vx; V.y = vy;
    lastMoveT = now; lastMovePx = P.x; lastMovePy = P.y;
  }
  function onDragEnd(e) {
    document.removeEventListener('pointermove', onDragMove);
    document.removeEventListener('pointerup', onDragEnd);
    document.removeEventListener('pointercancel', onDragEnd);
    if (!dragging) return;
    dragging = false;
    if (!moved && e) {
      var ddx = e.clientX - startPX, ddy = e.clientY - startPY;
      if (Math.abs(ddx) + Math.abs(ddy) > 3) moved = true;   // final-position fallback
    }
    var quickClick = !moved && (performance.now() - downTime) < 500;
    if (quickClick) {
      reading = !reading;
      paused = reading;
      if (reading) {
        card.classList.add('reading');
        void card.offsetHeight;                    // apply new img width first
        P.x = window.innerWidth / 2;
        P.y = Math.max((window.innerHeight - card.offsetHeight) / 2, 60);
        V.x = 0; V.y = 0;
        tiltX = 0;
        card.style.transition = 'transform .45s cubic-bezier(.25,.8,.4,1)';
        render();
        setTimeout(function () { card.style.transition = 'none'; }, 470);
      } else {
        card.classList.remove('reading');
        P.x = P0.x; P.y = L0;                      // snap back under the anchor
        V.x = rand(60); V.y = 40;
        tiltX = 0;
        card.style.transition = 'none';            // instant, no physics conflict
        render();
      }
      return;
    }
    card.style.transition = 'none';   // released after drag: velocity feeds bounce
    paused = false;
    tiltX = 0;
  }


  window.addEventListener('resize', function () { if (open) resize(); });
})();

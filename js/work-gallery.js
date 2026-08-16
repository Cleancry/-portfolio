/* 作品展示 modal — capture 委托拦截加号点击；堆叠式/列表式两种展示 */
(function () {
  'use strict';
  var WORKS = {
    'work-01': {
      title: '广场设计',
      images: [
        'assets/img/work/work-01-detail-01.jpg',
        'assets/img/work/work-01-detail-02.jpg',
        'assets/img/work/work-01-detail-03.jpg',
        'assets/img/work/work-01-detail-04.jpg',
        'assets/img/work/work-01-detail-05.jpg',
        'assets/img/work/work-01-detail-06.jpg',
        'assets/img/work/work-01-detail-07.jpg',
        'assets/img/work/work-01-detail-08.jpg'
      ]
    },
    'work-02': {
      title: '民宿设计',
      images: [
        'assets/img/work/work-02-detail-01.jpg',
        'assets/img/work/work-02-detail-02.jpg',
        'assets/img/work/work-02-detail-03.jpg',
        'assets/img/work/work-02-detail-04.jpg',
        'assets/img/work/work-02-detail-05.jpg',
        'assets/img/work/work-02-detail-06.jpg',
        'assets/img/work/work-02-detail-07.jpg'
      ]
    },
    'work-03': {
      title: '胡同改造设计',
      images: [
        'assets/img/work/work-03-detail-01.jpg',
        'assets/img/work/work-03-detail-02.jpg',
        'assets/img/work/work-03-detail-03.jpg',
        'assets/img/work/work-03-detail-04.jpg',
        'assets/img/work/work-03-detail-05.jpg',
        'assets/img/work/work-03-detail-06.jpg',
        'assets/img/work/work-03-detail-07.jpg'
      ]
    },
    'work-04': {
      title: '咖啡品牌视觉设计',
      images: [
        'assets/img/work/work-04-detail-01.jpg',
        'assets/img/work/work-04-detail-02.jpg',
        'assets/img/work/work-04-detail-03.jpg',
        'assets/img/work/work-04-detail-04.jpg',
        'assets/img/work/work-04-detail-05.jpg',
        'assets/img/work/work-04-detail-06.jpg',
        'assets/img/work/work-04-detail-07.jpg'
      ]
    },
    'work-05': {
      title: 'AI系列套图创作',
      type: 'stack',
      images: [
        'assets/img/work/work-05-detail-01.jpg',
        'assets/img/work/work-05-detail-02.jpg',
        'assets/img/work/work-05-detail-03.jpg',
        'assets/img/work/work-05-detail-04.jpg',
        'assets/img/work/work-05-detail-05.jpg',
        'assets/img/work/work-05-detail-06.jpg',
        'assets/img/work/work-05-detail-07.jpg',
        'assets/img/work/work-05-detail-08.jpg',
        'assets/img/work/work-05-detail-09.jpg'
      ]
    },
    'work-06': {
      title: '中式武侠AI混剪',
      type: 'video',
      video: 'assets/video/work-06-video.mp4'
    },
    'work-07': {
      title: 'AI第一人称射击游戏尝试',
      type: 'game',
      url: 'apex-royale/index.html'
    },
    'work-08': {
      title: 'AI2d银河恶魔城游戏作品',
      type: 'game',
      url: 'dark-arena/index.html'
    },
    'work-09': {
      title: '新作品',
      type: 'grid',
      images: [
        'assets/img/work/work-09-detail-01.jpg',
        'assets/img/work/work-09-detail-02.jpg'
      ]
    }
  };

  function getModal() { return document.querySelector('[data-work-modal]'); }

  function renderList(gallery, images, title) {
    gallery.classList.remove('is-stack', 'is-video', 'is-game', 'is-grid');
    images.forEach(function (src, i) {
      var img = document.createElement('img');
      img.src = src;
      img.loading = 'lazy';
      img.alt = title + ' ' + (i + 1);
      gallery.appendChild(img);
    });
  }

  function renderStack(gallery, images, title) {
    gallery.classList.add('is-stack');
    var hint = document.createElement('div');
    hint.className = 'work-stack-hint';
    gallery.appendChild(hint);
    var stack = document.createElement('div');
    stack.className = 'work-stack';
    images.forEach(function (src, i) {
      var card = document.createElement('div');
      card.className = 'work-stack-card';
      var img = document.createElement('img');
      img.src = src;
      img.loading = 'lazy';
      img.alt = title + ' ' + (i + 1);
      card.appendChild(img);
      stack.appendChild(card);
    });
    gallery.appendChild(stack);
    initStack(stack, hint, images.length);
  }

  function renderVideo(gallery, w) {
    gallery.classList.add('is-video');
    var wrap = document.createElement('div');
    wrap.className = 'work-video';
    var v = document.createElement('video');
    v.src = w.video;
    v.controls = true;
    v.autoplay = true;
    v.loop = true;
    v.playsInline = true;
    v.preload = 'metadata';
    wrap.appendChild(v);
    gallery.appendChild(wrap);
  }

  function renderGame(gallery, w) {
    gallery.classList.add('is-game');
    var wrap = document.createElement('div');
    wrap.className = 'work-game';
    var iframe = document.createElement('iframe');
    iframe.src = w.url;
    iframe.setAttribute('allow', 'autoplay; fullscreen');
    wrap.appendChild(iframe);
    gallery.appendChild(wrap);
    var hint = document.createElement('div');
    hint.className = 'work-game-hint';
    hint.textContent = '点击游戏画面获得焦点后即可操作';
    gallery.appendChild(hint);
  }

  function renderGrid(gallery, images, title) {
    gallery.classList.add('is-grid');
    images.forEach(function (src, i) {
      var img = document.createElement('img');
      img.src = src;
      img.loading = 'lazy';
      img.alt = title + ' ' + (i + 1);
      gallery.appendChild(img);
    });
  }

  function initStack(stack, hint, total) {
    var cards = Array.prototype.slice.call(stack.children);
    var order = cards.map(function (_, i) { return i; });
    var busy = false;

    function updateHint() {
      if (hint) hint.textContent = '点击 / 滚轮翻页 · ' + (order[0] + 1) + ' / ' + total;
    }

    function styleOf(pos) {
      return {
        y: pos * 15,
        rotation: (pos % 2 === 0 ? 1 : -1) * Math.min(pos * 1.25, 5),
        scale: 1 - pos * 0.015
      };
    }

    function shadowOf(pos) {
      return '0 ' + (14 + pos * 6) + 'px ' + (32 + pos * 9) + 'px rgba(0,0,0,' + (0.3 + pos * 0.04).toFixed(2) + ')';
    }

    function applyStatic(card, pos) {
      card.style.zIndex = String(1000 - pos);
      card.style.boxShadow = shadowOf(pos);
      if (pos === 0) card.classList.add('is-top'); else card.classList.remove('is-top');
    }

    function setCard(card, pos) {
      var s = styleOf(pos);
      gsap.set(card, { x: 0, y: s.y, rotation: s.rotation, scale: s.scale });
    }

    function layout() {
      order.forEach(function (cardIdx, pos) {
        var card = cards[cardIdx];
        applyStatic(card, pos);
        setCard(card, pos);
      });
      updateHint();
    }

    function flip(dir) {
      if (busy) return;
      busy = true;
      var topIdx = order[0];
      var topCard = cards[topIdx];

      // 阶段1：抽出（右上浮起 + 放大 + 旋转归正 + 阴影浮起）
      gsap.to(topCard, {
        x: 26, y: -56, rotation: 0, scale: 1.09,
        boxShadow: '0 46px 90px rgba(0,0,0,.55)',
        duration: 0.36, ease: 'Out', overwrite: true,
        onComplete: function () {
          if (dir > 0) order.push(order.shift());
          else order.unshift(order.pop());

          // 阶段2：其余卡片平滑上移
          order.forEach(function (cardIdx, pos) {
            if (cardIdx === topIdx) return;
            var card = cards[cardIdx];
            var s = styleOf(pos);
            applyStatic(card, pos);
            gsap.to(card, {
              x: 0, y: s.y, rotation: s.rotation, scale: s.scale,
              boxShadow: shadowOf(pos),
              duration: 0.6, ease: 'InOut', overwrite: true
            });
          });

          // 阶段3：抽出的卡片飞到底层
          var bottomPos = order.length - 1;
          var bs = styleOf(bottomPos);
          applyStatic(topCard, bottomPos);
          gsap.to(topCard, {
            x: 0, y: bs.y, rotation: bs.rotation, scale: bs.scale,
            boxShadow: shadowOf(bottomPos),
            duration: 0.66, ease: 'InOut', overwrite: true,
            onComplete: function () {
              gsap.set(topCard, { x: 0, y: bs.y, rotation: bs.rotation, scale: bs.scale });
              busy = false;
            }
          });
          updateHint();
        }
      });
    }

    stack.addEventListener('click', function (e) {
      var card = e.target && e.target.closest ? e.target.closest('.work-stack-card') : null;
      if (!card || !stack.contains(card)) return;
      var idx = cards.indexOf(card);
      if (idx !== order[0]) return;
      flip(1);
    });

    var wheelLock = false;
    stack.addEventListener('wheel', function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (wheelLock) return;
      wheelLock = true;
      flip(e.deltaY > 0 ? 1 : -1);
      setTimeout(function () { wheelLock = false; }, 620);
    }, { passive: false, capture: true });

    layout();
  }

  function open(id) {
    var w = WORKS[id];
    if (!w) return;
    var m = getModal();
    if (!m) return;
    var titleEl = m.querySelector('[data-work-title]');
    var gallery = m.querySelector('[data-work-gallery]');
    if (titleEl) titleEl.textContent = w.title;
    if (gallery) {
      gallery.innerHTML = '';
      gallery.scrollTop = 0;
      gallery.classList.remove('is-stack', 'is-video', 'is-game', 'is-grid');
      if (w.type === 'stack') renderStack(gallery, w.images, w.title);
      else if (w.type === 'grid') renderGrid(gallery, w.images, w.title);
      else if (w.type === 'video') renderVideo(gallery, w);
      else if (w.type === 'game') renderGame(gallery, w);
      else if (w.type === 'video') renderVideo(gallery, w);
      else renderList(gallery, w.images, w.title);
    }
    m.classList.add('open');
    m.setAttribute('aria-hidden', 'false');
    document.documentElement.style.overflow = 'hidden';
  }

  function close() {
    var m = getModal();
    if (!m) return;
    var vids = m.querySelectorAll('video');
    for (var i = 0; i < vids.length; i++) {
      vids[i].pause();
      vids[i].removeAttribute('src');
      vids[i].load();
    }
    var iframes = m.querySelectorAll('iframe');
    for (var j = 0; j < iframes.length; j++) {
      iframes[j].src = 'about:blank';
    }
    m.classList.remove('open');
    m.setAttribute('aria-hidden', 'true');
    document.documentElement.style.overflow = '';
  }

  function findTrigger(node) {
    while (node && node !== document) {
      if (node.hasAttribute && node.hasAttribute('data-work-open')) return node;
      node = node.parentNode;
    }
    return null;
  }

  document.addEventListener('click', function (e) {
    var trigger = findTrigger(e.target);
    if (trigger) {
      e.preventDefault();
      e.stopPropagation();
      open(trigger.getAttribute('data-work-open'));
    }
  }, true);

  document.addEventListener('click', function (e) {
    var m = getModal();
    if (!m || !m.classList.contains('open')) return;
    var t = e.target;
    if (t && t.hasAttribute && (t.hasAttribute('data-work-close') || t.hasAttribute('data-work-backdrop'))) {
      close();
    }
  }, true);

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') close();
  });
})();
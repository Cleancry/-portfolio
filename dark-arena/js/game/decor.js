/* ============================================================
   PENITENT BLADE — game/decor.js
   Decor console: toggle every scene element live (F2 to open),
   persisted in localStorage. Lets you strip / keep any prop
   without touching the code.
   ============================================================ */
'use strict';
(function () {
  const Game = window.Game;

  const DEFINITIONS = [
    ['candlestick', '木烛台'],
    ['tombstone', '墓碑'],
    ['cross', '十字架'],
    ['rail', '石护栏'],
    ['pew', '木长凳'],
    ['saint', '圣像台'],
    ['altar', '祭坛'],
    ['bones', '骨堆'],
    ['groundProps', '地面杂物'],
    ['rug', '地毯'],
    ['columns', '立柱'],
    ['floor', '石砖地面'],
    ['ceiling', '天花板'],
    ['fgColumns', '前景柱'],
    ['torch', '火炬'],
    ['ash', '飘灰尘埃'],
    ['ambient', '环境光'],
    ['godRays', '体积光神光'],
    ['seamLight', '天花板光缝'],
  ];

  function build() {
    const box = document.getElementById('decorConsole');
    const grid = document.getElementById('dcGrid');
    if (!box || !grid) return;
    if (grid.dataset.built) return;
    grid.dataset.built = '1';
    for (const [key, label] of DEFINITIONS) {
      const wrap = document.createElement('label');
      wrap.className = 'dc-item';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      const world = Game.app && Game.app.world;
      cb.checked = world ? !!world.opts[key] : true;
      cb.addEventListener('change', () => {
        if (Game.app && Game.app.world) Game.app.world.setOpt(key, cb.checked);
      });
      wrap.appendChild(cb);
      const span = document.createElement('span');
      span.textContent = label;
      wrap.appendChild(span);
      grid.appendChild(wrap);
    }
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.textContent = '全部恢复默认';
    reset.className = 'dc-reset';
    reset.addEventListener('click', () => {
      const world = Game.app && Game.app.world;
      if (!world) return;
      for (const [key] of DEFINITIONS) world.setOpt(key, true);
      const cbs = grid.querySelectorAll('input');
      DEFINITIONS.forEach((d, i) => { if (cbs[i]) cbs[i].checked = true; });
    });
    box.appendChild(reset);
  }

  function toggle() {
    const box = document.getElementById('decorConsole');
    if (!box) return;
    box.classList.toggle('hidden');
    if (!box.classList.contains('hidden')) build();
  }

  window.addEventListener('keydown', (e) => {
    if (e.code === 'F2') { e.preventDefault(); toggle(); }
    if (e.code === 'Escape') {
      const box = document.getElementById('decorConsole');
      if (box && !box.classList.contains('hidden')) box.classList.add('hidden');
    }
  });

  Game.DecorConsole = { toggle, build };
})();

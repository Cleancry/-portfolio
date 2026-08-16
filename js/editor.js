/* TSK in-browser editor — click a text element to open a native textarea popup,
 * edit, confirm, then save the whole page back to index.html via POST /save.
 * Loaded via <script src="js/editor.js"></script> at end of body.
 */
(function () {
  'use strict';
  var TOOLBAR_ID = 'tsk-edit-toolbar';
  var CSS_ID = 'tsk-edit-css';
  var editing = false;
  var modal = null;

  /* ---------- styles ---------- */
  function css() {
    if (document.getElementById(CSS_ID)) return;
    var s = document.createElement('style');
    s.id = CSS_ID;
    s.textContent =
      '#tsk-edit-toolbar{position:fixed;top:14px;right:14px;z-index:2147483647;' +
      'display:flex;flex-direction:column;gap:8px;padding:14px;min-width:160px;' +
      'background:rgba(28,24,20,.94);border:1px solid #a89474;border-radius:4px;' +
      "font-family:'KTF Metro Blueline',Arial,sans-serif;font-size:12px;letter-spacing:.1em;" +
      'color:#a89474;box-shadow:0 8px 30px rgba(0,0,0,.5);user-select:none;' +
      'backdrop-filter:blur(6px)}' +
      '#tsk-edit-toolbar .tb-title{font-size:10px;opacity:.7;margin-bottom:2px;text-transform:uppercase}' +
      '#tsk-edit-toolbar button{background:transparent;border:1px solid #a89474;color:#a89474;' +
      'padding:7px 10px;cursor:pointer;font:inherit;letter-spacing:.12em;text-align:left;' +
      'transition:all .2s}' +
      '#tsk-edit-toolbar button:hover{background:#a89474;color:#2c2824}' +
      '#tsk-edit-toolbar .tb-hint{font-size:10px;opacity:.55;line-height:1.6;margin-top:4px}' +
      '.tsk-editable{outline:1px dashed rgba(168,148,116,.55)!important;outline-offset:2px;' +
      'cursor:pointer!important;transition:background .2s;border-radius:1px}' +
      '.tsk-editable:hover{background:rgba(168,148,116,.12)}' +
      '.tsk-editing .tsk-editable{outline-color:rgba(168,148,116,.9)}' +
      '#tsk-edit-modal{position:fixed;inset:0;z-index:2147483646;background:rgba(0,0,0,.62);' +
      'display:flex;align-items:center;justify-content:center}' +
      '#tsk-edit-modal .tsk-box{background:#2c2824;border:1px solid #a89474;padding:22px;' +
      'width:min(560px,86vw);border-radius:4px;box-shadow:0 12px 40px rgba(0,0,0,.55)}' +
      '#tsk-edit-modal .tsk-box-title{color:#a89474;font-size:11px;letter-spacing:.18em;' +
      'text-transform:uppercase;margin-bottom:10px;font-family:Arial,sans-serif}' +
      '#tsk-edit-modal textarea{width:100%;min-height:130px;background:#1d1a16;color:#e8e0d0;' +
      'border:1px solid #a89474;padding:10px;font-size:14px;line-height:1.6;' +
      'font-family:Arial,sans-serif;resize:vertical;outline:none}' +
      '#tsk-edit-modal textarea:focus{border-color:#d4bf92}' +
      '#tsk-edit-modal .tsk-btns{display:flex;gap:10px;margin-top:14px;justify-content:flex-end}' +
      '#tsk-edit-modal .tsk-btns button{background:transparent;border:1px solid #a89474;color:#a89474;' +
      'padding:8px 18px;cursor:pointer;font-family:Arial,sans-serif;font-size:12px;' +
      'letter-spacing:.12em;text-transform:uppercase;transition:all .2s}' +
      '#tsk-edit-modal .tsk-btns button:hover{background:#a89474;color:#2c2824}' +
      '#tsk-edit-modal .tsk-btns .tsk-ok{background:#a89474;color:#2c2824}';
    document.head.appendChild(s);
  }

  /* ---------- toolbar ---------- */
  function toolbar() {
    var el = document.getElementById(TOOLBAR_ID);
    if (el) return el;
    el = document.createElement('div');
    el.id = TOOLBAR_ID;

    var title = document.createElement('div');
    title.className = 'tb-title';
    title.textContent = 'EDIT MODE';
    el.appendChild(title);

    var bEdit = document.createElement('button');
    bEdit.id = 'tsk-btn-edit';
    bEdit.textContent = '\u270E  ' + (editing ? '完成编辑' : '编辑文字');
    bEdit.addEventListener('click', function () { toggle(); });
    el.appendChild(bEdit);

    var bSave = document.createElement('button');
    bSave.id = 'tsk-btn-save';
    bSave.textContent = '\u{1F4BE}  保存到网页';
    bSave.addEventListener('click', function () { save(); });
    el.appendChild(bSave);

    var bDl = document.createElement('button');
    bDl.id = 'tsk-btn-dl';
    bDl.textContent = '\u2B07  下载 HTML';
    bDl.addEventListener('click', function () { download(getHtml()); });
    el.appendChild(bDl);

    var bReplay = document.createElement('button');
    bReplay.id = 'tsk-btn-replay';
    bReplay.textContent = '\u25B6  重播加载动画';
    bReplay.addEventListener('click', function () {
      try { sessionStorage.removeItem('hasVisited'); } catch (e) {}
      location.reload();
    });
    el.appendChild(bReplay);

    var hint = document.createElement('div');
    hint.className = 'tb-hint';
    hint.textContent = '开启编辑后：点击任意文字弹出编辑框；保存后刷新生效（自动备份）';
    el.appendChild(hint);

    document.body.appendChild(el);
    return el;
  }

  /* ---------- edit mode ---------- */
  function setEditable(on) {
    editing = on;
    // let clicks pass through overlays while editing (hero canvas, videos, iframes)
    document.querySelectorAll('canvas, video, iframe, audio').forEach(function (el) {
      el.style.pointerEvents = on ? 'none' : '';
    });
    var sel = 'p,h1,h2,h3,h4,h5,h6,span,a,li,td,th,figcaption,blockquote,dt,dd,label,div';
    document.querySelectorAll(sel).forEach(function (el) {
      if (el.closest('script,style,canvas,video,iframe,audio')) return;
      if (el.closest('#' + TOOLBAR_ID)) return;
      if (el.closest('#tsk-edit-modal')) return;
      var hasText = Array.prototype.some.call(el.childNodes, function (n) {
        return n.nodeType === 3 && n.textContent.trim().length > 0;
      });
      if (hasText) {
        if (on) { el.classList.add('tsk-editable'); }
        else { el.classList.remove('tsk-editable'); }
      }
    });
    document.body.classList.toggle('tsk-editing', on);
    var btn = document.getElementById('tsk-btn-edit');
    if (btn) btn.textContent = on ? '\u270E  完成编辑' : '\u270E  编辑文字';
    if (!on) { closeModal(); }
  }

  function toggle() { setEditable(!editing); }

  /* ---------- popup editor ---------- */
  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function openEditor(el) {
    if (modal) return;
    if (!editing) return;
    var m = document.createElement('div');
    m.id = 'tsk-edit-modal';
    var box = document.createElement('div');
    box.className = 'tsk-box';
    var t = document.createElement('div');
    t.className = 'tsk-box-title';
    t.textContent = '编辑文字';
    var ta = document.createElement('textarea');
    ta.value = (el.textContent || '').trim();
    var btns = document.createElement('div');
    btns.className = 'tsk-btns';
    var bOk = document.createElement('button');
    bOk.className = 'tsk-ok';
    bOk.textContent = '\u2713 确定';
    var bCancel = document.createElement('button');
    bCancel.textContent = '取消';
    btns.appendChild(bCancel);
    btns.appendChild(bOk);
    box.appendChild(t);
    box.appendChild(ta);
    box.appendChild(btns);
    m.appendChild(box);
    document.body.appendChild(m);
    modal = m;

    function done() {
      var txt = ta.value.replace(/\r\n/g, '\n');
      var html = escapeHtml(txt).replace(/\n/g, '<br>');
      el.innerHTML = html;
      closeModal();
    }
    bOk.addEventListener('click', done);
    bCancel.addEventListener('click', closeModal);
    ta.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { closeModal(); }
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { done(); }
    });
    m.addEventListener('mousedown', function (e) {
      if (e.target === m) { closeModal(); }
    });
    setTimeout(function () { ta.focus(); ta.select(); }, 30);
  }

  function closeModal() {
    if (modal) { modal.remove(); modal = null; }
  }

  // global click delegate (capture phase): in edit mode, clicking an editable
  // text opens the popup editor instead of any page interaction
  document.addEventListener('click', function (e) {
    if (!editing) return;
    var t = e.target;
    if (!t || t.nodeType !== 1) return;
    if (t.closest('#tsk-edit-modal') || t.closest('#' + TOOLBAR_ID)) return;
    var ed = t.closest ? t.closest('.tsk-editable') : null;
    if (ed) {
      e.preventDefault();
      e.stopPropagation();
      openEditor(ed);
    }
  }, true);

  /* ---------- save / download ---------- */
  function cleanRuntime() {
    // collapse SplitText chars/words back into plain text
    document.querySelectorAll('.split-char').forEach(function (el) {
      var t = document.createTextNode(el.textContent);
      el.parentNode.replaceChild(t, el);
    });
    document.querySelectorAll('.split-word').forEach(function (el) {
      var t = document.createTextNode(el.textContent);
      el.parentNode.replaceChild(t, el);
    });
    // each .split-line becomes its text followed by <br> (restores line breaks)
    document.querySelectorAll('.split-line').forEach(function (el) {
      var t = document.createTextNode(el.textContent);
      el.parentNode.insertBefore(t, el);
      el.parentNode.insertBefore(document.createElement('br'), el);
      el.remove();
    });
    // restore menu button state (Menu visible, Close hidden) 鈥?prevents toggled state being saved
    document.querySelectorAll('.menu-btn_label-w .menu-btn_label').forEach(function (lbl) {
      if (lbl.querySelector('a[aria-label="Menu"]')) { lbl.classList.remove('d-none'); }
      if (lbl.querySelector('a[aria-label="Close"]')) { lbl.classList.add('d-none'); }
    });
    // drop runtime d-none the intro applied to the hero static logo
    document.querySelectorAll('[preloader="logo-static"]').forEach(function (el) {
      el.classList.remove('d-none');
    });
    // restore preloader & transition visibility for the next page load
    // (the intro sets display:none on them once finished; must not be saved)
    var pl = document.querySelector('[data-preloader]');
    if (pl) { pl.style.removeProperty('display'); }
    var tr = document.querySelector('.transition');
    if (tr) { tr.style.removeProperty('display'); }
    // if the intro moved the preloader logo into the hero, move it back
    var moved = document.querySelector('[preloader="logo-w-finish"] [data-preloader="logo"]');
    if (moved) {
      var target = document.querySelector('[data-preloader] .preloader_logo');
      if (target && target !== moved.parentNode) { target.appendChild(moved); }
    }
    // strip GSAP/SplitText runtime inline styles so saved HTML stays clean
    document.querySelectorAll('.split-line,.split-word,.split-char').forEach(function (el) {
      el.removeAttribute('style');
    });
    document.querySelectorAll('[style*="transform"], [style*="opacity"]').forEach(function (el) {
      if (el.closest('#' + TOOLBAR_ID)) return;
      el.removeAttribute('style');
    });
  }

  function getHtml() {
    closeModal();
    var tb = document.getElementById(TOOLBAR_ID);
    var cssEl = document.getElementById(CSS_ID);
    if (tb) tb.remove();
    if (cssEl) cssEl.remove();
    document.querySelectorAll('.tsk-editable').forEach(function (el) {
      el.classList.remove('tsk-editable');
    });
    document.body.classList.remove('tsk-editing');
    cleanRuntime();
    var html = '<!DOCTYPE html>' + document.documentElement.outerHTML;
    if (tb) document.body.appendChild(tb);
    if (cssEl) document.head.appendChild(cssEl);
    return html;
  }

  function save() {
    var html = getHtml();
    var btn = document.getElementById('tsk-btn-save');
    if (btn) { btn.textContent = '保存中...'; btn.disabled = true; }
    var path = window.location.pathname.replace(/^\//, '');
    var saveUrl = '/save';
    if (path && path !== 'index.html') { saveUrl += '?file=' + encodeURIComponent(path); }
    fetch(saveUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
      body: html
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      alert('\u2705 已保存！刷新页面即可看到修改。\n（旧版本已自动备份）');
    }).catch(function (e) {
      alert('\u26A0 直接保存失败（' + e.message + '），已改为下载 index.html——请用下载的文件替换工作区里的 index.html');
      download(html);
    }).then(function () {
      if (btn) { btn.textContent = '\u{1F4BE}  保存到网页'; btn.disabled = false; }
    });
  }

  function download(html) {
    var b = new Blob([html], { type: 'text/html;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(b);
    a.download = 'index.html';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  /* ---------- init ---------- */
  function init() {
    css();
    toolbar();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

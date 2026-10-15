/*
 * toolbar.js — 元素面板 + 画笔 + 控制（docs/DESIGN.md §8、docs/ART.md §3 §6）
 *   依赖 DOM 与 YS.I18N。
 */
(function (root) {
  'use strict';

  var Elements = root.YS.Elements;
  var I18N = root.YS.I18N;
  var ELS = Elements.ELEMENTS;

  var refs = {};

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function btn(cls, i18nKey, titleKey, onClick) {
    var b = el('button', cls);
    b.setAttribute('type', 'button');
    if (i18nKey) b.setAttribute('data-i18n', i18nKey);
    if (titleKey) b.setAttribute('data-i18n-title', titleKey);
    if (onClick) b.addEventListener('click', onClick);
    return b;
  }

  /* ---------- 元素面板 ---------- */
  function buildPalette(container, app) {
    container.innerHTML = '';
    var groups = Elements.GROUPS;
    var catKey = { solid: 'cat.solid', powder: 'cat.powder', liquid: 'cat.liquid', gas: 'cat.gas', special: 'cat.special' };
    refs.paletteButtons = {};

    groups.forEach(function (g) {
      var sec = el('div', 'palette-group');
      var head = el('div', 'palette-head');
      var h = el('span', 'palette-head-label');
      h.setAttribute('data-i18n', catKey[g]);
      head.appendChild(h);
      head.addEventListener('click', function () { sec.classList.toggle('collapsed'); });
      sec.appendChild(head);

      var grid = el('div', 'palette-grid');
      Elements.GROUPED[g].forEach(function (e) {
        var b = el('button', 'el-btn');
        b.setAttribute('type', 'button');
        b.setAttribute('data-el', e.id);
        var sw = el('span', 'el-swatch');
        sw.style.background = e.base;
        if (e.emissive !== 'no') sw.classList.add('emissive-' + e.emissive);
        b.appendChild(sw);
        var lb = el('span', 'el-label');
        lb.setAttribute('data-elname', e.key);
        b.appendChild(lb);
        b.addEventListener('click', function () { app.fn.selectElement(e.id); });
        refs.paletteButtons[e.id] = b;
        grid.appendChild(b);
      });
      sec.appendChild(grid);
      container.appendChild(sec);
    });

    refreshElementNames();
    refreshPaletteSelection(app);
  }

  function refreshElementNames() {
    var nodes = document.querySelectorAll('[data-elname]');
    for (var i = 0; i < nodes.length; i++) {
      var key = nodes[i].getAttribute('data-elname');
      nodes[i].textContent = I18N.t('el.' + key);
    }
  }

  function refreshPaletteSelection(app) {
    if (!refs.paletteButtons) return;
    for (var id in refs.paletteButtons) {
      var on = (+id === app.state.element);
      refs.paletteButtons[id].classList.toggle('selected', on);
    }
  }

  /* ---------- 底部控制条 ---------- */
  function buildControls(container, app) {
    container.innerHTML = '';
    refs.toolButtons = {};
    refs.dirButtons = {};

    /* 工具组 */
    var toolGroup = el('div', 'ctl-group');
    refs.toolButtons.brush = btn('tool-btn', 'ui.brush', 'tip.brush', function () { app.fn.setTool('brush'); });
    refs.toolButtons.eraser = btn('tool-btn', 'ui.eraser', 'tip.eraser', function () { app.fn.setTool('eraser'); });
    refs.toolButtons.eyedropper = btn('tool-btn', 'ui.eyedropper', 'tip.eyedropper', function () { app.fn.setTool('eyedropper'); });
    toolGroup.appendChild(refs.toolButtons.brush);
    toolGroup.appendChild(refs.toolButtons.eraser);
    toolGroup.appendChild(refs.toolButtons.eyedropper);
    container.appendChild(toolGroup);

    /* 画笔大小 */
    var sizeGroup = el('div', 'ctl-group');
    var sizeLabel = el('span', 'ctl-label'); sizeLabel.setAttribute('data-i18n', 'ui.brushSize');
    refs.brushValue = el('span', 'ctl-value', '3');
    var sizeSlider = el('input', 'slider');
    sizeSlider.type = 'range'; sizeSlider.min = '1'; sizeSlider.max = '12'; sizeSlider.step = '1'; sizeSlider.value = '3';
    sizeSlider.setAttribute('data-i18n-title', 'tip.slider');
    sizeSlider.addEventListener('input', function () { app.fn.setRadius(+sizeSlider.value); });
    refs.sizeSlider = sizeSlider;
    sizeGroup.appendChild(sizeLabel); sizeGroup.appendChild(sizeSlider); sizeGroup.appendChild(refs.brushValue);
    container.appendChild(sizeGroup);

    /* 播放控制 */
    var playGroup = el('div', 'ctl-group');
    refs.playBtn = btn('icon-btn', 'ui.pause', 'tip.pause', function () { app.fn.togglePlay(); });
    refs.stepBtn = btn('icon-btn', 'ui.step', 'tip.step', function () { app.fn.step(); });
    refs.clearBtn = btn('icon-btn danger', 'ui.clear', 'tip.clear', function () {
      if (root.confirm && !root.confirm(I18N.t('ui.confirmClear'))) return;
      app.fn.clear();
    });
    playGroup.appendChild(refs.playBtn); playGroup.appendChild(refs.stepBtn); playGroup.appendChild(refs.clearBtn);
    container.appendChild(playGroup);

    /* 风力 */
    var windGroup = el('div', 'ctl-group wind-group');
    var windLabel = el('span', 'ctl-label'); windLabel.setAttribute('data-i18n', 'ui.wind');
    refs.windDirLabel = el('span', 'ctl-value');
    windGroup.appendChild(windLabel);
    var compass = el('div', 'compass');
    var dirs = [
      ['NW', -135], ['N', -90], ['NE', -45],
      ['W', 180], ['none', null], ['E', 0],
      ['SW', 135], ['S', 90], ['SE', 45]
    ];
    dirs.forEach(function (d) {
      var b = el('button', 'dir-btn', d[0] === 'none' ? '·' : d[0]);
      b.setAttribute('type', 'button');
      b.setAttribute('data-i18n-title', 'dir.' + d[0]);
      if (d[1] === null) b.classList.add('dir-none');
      b.addEventListener('click', function () {
        if (d[1] === null) app.fn.resetWind();
        else app.fn.setWind(d[1] * Math.PI / 180, Math.max(app.state.windStrength, 0.6));
      });
      refs.dirButtons[d[0]] = b;
      compass.appendChild(b);
    });
    windGroup.appendChild(compass);
    windGroup.appendChild(refs.windDirLabel);
    var ws = el('input', 'slider');
    ws.type = 'range'; ws.min = '0'; ws.max = '1'; ws.step = '0.05'; ws.value = '0';
    ws.setAttribute('data-i18n-title', 'ui.windStrength');
    ws.addEventListener('input', function () { app.fn.setWind(app.state.windAngle, +ws.value, true); });
    refs.windSlider = ws;
    windGroup.appendChild(ws);
    container.appendChild(windGroup);

    /* 存档组 */
    var saveGroup = el('div', 'ctl-group');
    saveGroup.appendChild(btn('icon-btn', 'ui.save', 'tip.save', function () { app.fn.save(); }));
    saveGroup.appendChild(btn('icon-btn', 'ui.load', 'tip.load', function () { app.fn.load(); }));
    saveGroup.appendChild(btn('icon-btn', 'ui.exportPng', null, function () { app.fn.exportPng(); }));
    saveGroup.appendChild(btn('icon-btn', 'ui.exportJson', null, function () { app.fn.exportJson(); }));
    var imp = btn('icon-btn', 'ui.import', null, function () { refs.importInput.click(); });
    saveGroup.appendChild(imp);
    var input = el('input');
    input.type = 'file'; input.accept = '.json,application/json'; input.style.display = 'none';
    input.addEventListener('change', function () { app.fn.importJson(input.files[0]); input.value = ''; });
    refs.importInput = input;
    saveGroup.appendChild(input);
    container.appendChild(saveGroup);

    refreshControls(app);
  }

  function refreshControls(app) {
    if (refs.toolButtons) {
      for (var t in refs.toolButtons) {
        refs.toolButtons[t].classList.toggle('selected', app.state.tool === t);
      }
    }
    if (refs.playBtn) refs.playBtn.setAttribute('data-i18n', app.state.paused ? 'ui.play' : 'ui.pause');
    if (refs.brushValue) refs.brushValue.textContent = String(app.state.radius);
    if (refs.sizeSlider) refs.sizeSlider.value = String(app.state.radius);
    if (refs.windSlider) refs.windSlider.value = String(app.state.windStrength);
    if (refs.windDirLabel) refs.windDirLabel.textContent = windDirName(app.state);
    I18N.applyToDOM(document);
  }

  function windDirName(state) {
    if (!state.windStrength || state.windStrength <= 0) return I18N.t('dir.none');
    var a = state.windAngle * 180 / Math.PI;
    while (a < 0) a += 360; while (a >= 360) a -= 360;
    var names = [
      ['E', 0], ['SE', 45], ['S', 90], ['SW', 135], ['W', 180], ['NW', 225], ['N', 270], ['NE', 315]
    ];
    var best = names[0], bd = 999;
    names.forEach(function (n) {
      var d = Math.abs(((a - n[1] + 540) % 360) - 180);
      if (d < bd) { bd = d; best = n; }
    });
    return I18N.t('dir.' + best[0]);
  }

  /* ---------- 顶栏设置 ---------- */
  function buildTopbar(topbar, app) {
    refs.langBtn = topbar.querySelector('#lang-btn');
    refs.helpBtn = topbar.querySelector('#help-btn');
    refs.settingsBtn = topbar.querySelector('#settings-btn');
    refs.fpsEl = topbar.querySelector('#fps');
    refs.cellsEl = topbar.querySelector('#cells');

    if (refs.langBtn) refs.langBtn.addEventListener('click', function () { I18N.cycle(); refreshAll(app); });
    if (refs.helpBtn) refs.helpBtn.addEventListener('click', function () { root.YS.Help.open(app); });
    if (refs.settingsBtn) refs.settingsBtn.addEventListener('click', function () { toggleSettings(app); });
  }

  var settingsPanel = null;
  function toggleSettings(app) {
    if (settingsPanel) { settingsPanel.remove(); settingsPanel = null; return; }
    settingsPanel = el('div', 'settings-panel');
    var items = [
      ['showHeat', 'ui.heatmap'], ['showFlow', 'ui.airflow'], ['showGrid', 'ui.gridLines'],
      ['highContrast', 'ui.highContrast'], ['reducedMotion', 'ui.reducedMotion'], ['glow', 'ui.glow']
    ];
    items.forEach(function (it) {
      var row = el('label', 'settings-row');
      var cb = el('input'); cb.type = 'checkbox'; cb.checked = !!app.state[it[0]];
      cb.addEventListener('change', function () { app.fn.toggleSetting(it[0], cb.checked); });
      var sp = el('span'); sp.setAttribute('data-i18n', it[1]);
      row.appendChild(cb); row.appendChild(sp);
      settingsPanel.appendChild(row);
    });
    document.body.appendChild(settingsPanel);
    I18N.applyToDOM(settingsPanel);
    setTimeout(function () {
      document.addEventListener('click', function onDoc(e) {
        if (settingsPanel && !settingsPanel.contains(e.target) && e.target !== refs.settingsBtn) {
          settingsPanel.remove(); settingsPanel = null; document.removeEventListener('click', onDoc);
        }
      });
    }, 0);
  }

  function refreshAll(app) {
    refreshElementNames();
    refreshPaletteSelection(app);
    refreshControls(app);
    I18N.applyToDOM(document);
    if (refs.langBtn) refs.langBtn.textContent = I18N.getLang() === 'zh-CN' ? '中文' : (I18N.getLang() === 'ja' ? '日本語' : 'EN');
  }

  var api = {
    buildPalette: buildPalette,
    buildControls: buildControls,
    buildTopbar: buildTopbar,
    refresh: refreshAll,
    refreshControls: refreshControls,
    refreshElementNames: refreshElementNames,
    refs: refs
  };
  root.YS.Toolbar = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

/*
 * main.js — 启动 / 主循环 / 输入（docs/DESIGN.md §8 §9，docs/ART.md §1.4）
 *   浏览器入口。装配 Engine + Renderer + Toolbar + Save + Help。
 */
(function (root) {
  'use strict';

  var YS = root.YS;
  var Balance = YS.Balance;
  var Elements = YS.Elements;
  var I18N = YS.I18N;
  var ID = Elements.ID;
  var P = Balance.PHYS;

  var QUICK = [ID.SAND, ID.WATER, ID.FIRE, ID.STONE, ID.WOOD, ID.OIL, ID.LAVA, ID.ICE, ID.SEED];

  function initialTemp(id) {
    switch (id) {
      case ID.LAVA: return 1200;
      case ID.FIRE: return 600;
      case ID.EMBER: return 900;    // v1.4.0 永燃火种（与 Balance.EMBER.TEMP 一致）
      case ID.LN2: return -196;
      case ID.ICE: return -10;
      case ID.SNOW: return -10;
      default: return P.AMBIENT_T;
    }
  }

  function boot() {
    var canvas = document.getElementById('canvas');
    var engine = YS.Engine.create({ seed: P.SEED });
    var renderer = YS.Renderer.create(canvas, engine.grid.w, engine.grid.h);

    var state = {
      element: ID.SAND,
      radius: 3,
      tool: 'brush',
      paused: false,
      windAngle: 0,
      windStrength: 0,
      showHeat: false,
      showGrid: false,
      highContrast: false,
      reducedMotion: false,
      glow: true
    };

    var app = { engine: engine, renderer: renderer, state: state, fn: {} };

    /* ---------- 画笔 ---------- */
    function paintAt(gx, gy, erase) {
      var g = engine.grid, r = state.radius;
      var id = erase ? 1 : state.element;
      var temp = erase ? P.AMBIENT_T : initialTemp(id);
      for (var dy = -r + 1; dy <= r - 1; dy++) {
        for (var dx = -r + 1; dx <= r - 1; dx++) {
          var x = gx + dx, y = gy + dy;
          if (x < 0 || x >= g.w || y < 0 || y >= g.h) continue;
          if (erase) {
            g.element[y * g.w + x] = 1;
            g.temp[y * g.w + x] = P.AMBIENT_T;
            g.latent[y * g.w + x] = 0;
            g.age[y * g.w + x] = 0;
          } else {
            g.setEl(x, y, id, temp);
          }
        }
      }
    }

    app.fn.paint = function (gx, gy, erase) {
      if (state.tool === 'eyedropper') {
        var e = engine.grid.getEl(gx, gy);
        if (e !== 1) { state.element = e; state.tool = 'brush'; }
        YS.Toolbar.refresh(app);
        return;
      }
      paintAt(gx, gy, erase || state.tool === 'eraser');
    };

    /* ---------- app.fn ---------- */
    app.fn.selectElement = function (id) {
      state.element = id; state.tool = 'brush';
      YS.Toolbar.refresh(app);
    };
    app.fn.setTool = function (t) { state.tool = t; YS.Toolbar.refresh(app); };
    app.fn.setRadius = function (r) {
      r = Math.max(1, Math.min(12, r | 0)); state.radius = r;
      YS.Toolbar.refreshControls(app);
    };
    app.fn.togglePlay = function () {
      state.paused = !state.paused;
      last = (root.performance || Date).now(); accum = 0;
      YS.Toolbar.refreshControls(app);
    };
    app.fn.step = function () { engine.step(); };
    app.fn.clear = function () { engine.clear(); };
    app.fn.setWind = function (angle, strength) {
      state.windAngle = angle; state.windStrength = strength;
      engine.wind.strength = strength; engine.wind.angle = angle;
      engine.wind.x = strength * Math.cos(angle);
      engine.wind.y = strength * Math.sin(angle);
      YS.Toolbar.refreshControls(app);
    };
    app.fn.resetWind = function () {
      state.windStrength = 0; state.windAngle = 0;
      YS.Wind.reset(engine.wind);
      YS.Toolbar.refreshControls(app);
    };
    app.fn.save = function () { YS.Save.save(app); };
    app.fn.load = function () { YS.Save.load(app); };
    app.fn.exportPng = function () { YS.Save.exportPng(app); };
    app.fn.exportJson = function () { YS.Save.exportJson(app); };
    app.fn.importJson = function (f) { YS.Save.importJson(app, f); };
    app.fn.toggleSetting = function (k, v) {
      state[k] = v;
      if (k === 'highContrast') document.body.classList.toggle('high-contrast', v);
    };
    app.fn.afterLoad = function () { YS.Toolbar.refreshControls(app); };

    /* ---------- 初始场景（DESIGN §8.3）：一小片沙 + 一摊水 ---------- */
    (function scene() {
      var g = engine.grid, W = g.w, H = g.h;
      var cx = (W / 2) | 0;
      for (var x = cx - 40; x < cx - 5; x++) {
        for (var y = H - 40; y < H - 26; y++) {
          if ((x + y) % 5 === 0) continue;
          g.setEl(x, y, ID.SAND, P.AMBIENT_T);
        }
      }
      for (var x2 = cx + 4; x2 < cx + 42; x2++) {
        for (var y2 = H - 24; y2 < H - 10; y2++) {
          if ((x2 * 2 + y2) % 7 === 0) continue;
          g.setEl(x2, y2, ID.WATER, P.AMBIENT_T);
        }
      }
    })();

    /* ---------- 装配 UI ---------- */
    var topbar = document.getElementById('topbar');
    YS.Toolbar.buildTopbar(topbar, app);
    YS.Toolbar.buildPalette(document.getElementById('palette'), app);
    YS.Toolbar.buildControls(document.getElementById('bottombar'), app);

    /* ---------- 尺寸 / 响应式 ---------- */
    var wrap = document.getElementById('canvas-wrap');
    function fit() {
      var cw = wrap.clientWidth - 8;
      var ch = wrap.clientHeight - 8;
      renderer.resize(Math.max(cw, 1), Math.max(ch, 1));
    }
    root.addEventListener('resize', fit);
    fit();

    /* ---------- 输入 ---------- */
    var hover = { x: -1, y: -1 };
    var painting = 0;

    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    canvas.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      var p = renderer.toGrid(e.clientX, e.clientY);
      painting = e.button === 2 ? 2 : 1;
      app.fn.paint(p.x, p.y, painting === 2);
    });
    canvas.addEventListener('pointermove', function (e) {
      var p = renderer.toGrid(e.clientX, e.clientY);
      hover.x = p.x; hover.y = p.y;
      if (painting) app.fn.paint(p.x, p.y, painting === 2);
      updateHover();
    });
    canvas.addEventListener('pointerup', function (e) {
      painting = 0;
      try { canvas.releasePointerCapture(e.pointerId); } catch (err) { }
    });
    canvas.addEventListener('pointerleave', function () { hover.x = -1; hover.y = -1; });
    canvas.addEventListener('wheel', function (e) {
      e.preventDefault();
      app.fn.setRadius(state.radius + (e.deltaY < 0 ? 1 : -1));
    }, { passive: false });

    document.addEventListener('keydown', function (e) {
      if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      if (e.code === 'Space') { e.preventDefault(); app.fn.togglePlay(); return; }
      if (e.key === '.') { e.preventDefault(); if (state.paused) engine.step(); return; }
      if (e.key === '[') { app.fn.setRadius(state.radius - 1); return; }
      if (e.key === ']') { app.fn.setRadius(state.radius + 1); return; }
      if (e.key >= '1' && e.key <= '9') { app.fn.selectElement(QUICK[+e.key - 1]); return; }
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); engine.clear(); }
        else if (e.key.toLowerCase() === 's') { e.preventDefault(); YS.Save.save(app); }
        else if (e.key.toLowerCase() === 'o') { e.preventDefault(); YS.Save.load(app); }
      }
    });

    /* ---------- HUD ---------- */
    var hoverEl = document.getElementById('hover');
    function updateHover() {
      if (!hoverEl) return;
      if (hover.x < 0) { hoverEl.textContent = ''; return; }
      var g = engine.grid;
      var id = g.getEl(hover.x, hover.y);
      var t = g.getT(hover.x, hover.y);
      var key = id === 0 ? 'EMPTY' : Elements.get(id).key;
      hoverEl.textContent = '(' + hover.x + ', ' + hover.y + ') ' + I18N.t('el.' + key) + ' · ' + t + '°C';
    }

    var fpsEl = document.getElementById('fps');
    var cellsEl = document.getElementById('cells');
    var fps = 60;

    /* ---------- 主循环（累加器 + 最多 4 子步） ---------- */
    var DT = 1 / P.TICK_HZ;
    var MAXS = P.MAX_SUBSTEPS;
    var last = (root.performance || Date).now();
    var accum = 0;

    function frame(now) {
      var real = (now - last) / 1000; last = now;
      if (real > 0.25) real = 0.25;
      if (!state.paused) {
        accum += real;
        var steps = 0;
        while (accum >= DT && steps < MAXS) { engine.step(); accum -= DT; steps++; }
        if (accum > DT) accum = 0;
      }
      var animT = state.reducedMotion ? 0 : Math.floor(now / 130);
      renderer.render(engine.grid, {
        animTime: animT,
        highContrast: state.highContrast,
        showHeat: state.showHeat,
        glow: state.glow
      });
      if (hover.x >= 0) {
        renderer.drawCursor(hover.x, hover.y, state.radius, state.tool === 'eraser', renderer.scale);
      }
      /* HUD */
      fps = fps * 0.9 + (1 / Math.max(real, 1e-4)) * 0.1;
      if (fpsEl && (now | 0) % 6 === 0) fpsEl.textContent = fps.toFixed(0);
      if (cellsEl && (now | 0) % 6 === 0) cellsEl.textContent = String(engine.countCells());
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    /* ---------- i18n 初始化 ---------- */
    I18N.setLang(I18N.detect());
    YS.Toolbar.refresh(app);

    /* 暴露给调试 */
    root.__yuansu = app;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);

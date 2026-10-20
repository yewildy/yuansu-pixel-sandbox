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

  /* v1.4.1 游戏内版本标识（用户：「在推送游戏内标上版本以及最后修改时间，这样我才知道我玩的是哪一版」）
   * 每次发布前手动同步此处 + index.html 的 ?v= 缓存破坏参数。 */
  /* v1.6.3：built 补上**小时与分钟**（用户要求："版本号后面的更新时间要带上小时和分钟"），
   * 这样打开页面就能确认自己玩的是哪一次构建、什么时候构建的。 */
  /* v1.6.4：闭合对流环流（局部密度参考 + 边界横向铺开，任务 T-2026-1015-B）。 */
  /* v1.6.6：静压头（Plan A 烟囱效应）→ 闭合对流环的第四段「底部回流」驱动源；
   *         版本号与代码注释（air/pressure/balance 已自称 1.6.5/1.6.6）一并对齐，
   *         built 按用户明确要求**带小时和分钟**（此前磁盘上只有日期，属未落实项）。 */
  /* v1.6.7：闭合对流环流的水平两段（贴壁定向输运 + 歧义择向，任务 T-2026-1015-B 收尾）；
   *         flowDir 改为「最近一次位移方向」的覆盖语义；缓存破坏参数同步到 ?v=1.6.7。 */
  /* v1.6.10：竖向六腿蛇形烟道蒸汽贯通（任务 T-SERP-01..06）。
   *          修掉三个实测坑：① 走廊输送的**永久饿死 bug**；② 浮力与抽力对撞；③ 蒸汽在烟道内结露。
   *          built 按用户明确要求**带小时和分钟**。 */
  var VERSION = { v: 'v1.6.10', built: '2026-10-20 22:55' };
  YS.VERSION = VERSION;

  function initialTemp(id) {
    switch (id) {
      case ID.LAVA: return 1200;
      case ID.FIRE: return 600;
      case ID.EMBER: return 900;    // v1.4.0 永燃火种（与 Balance.EMBER.TEMP 一致）
      /* v1.6.0：蒸汽在 1 atm 下只存在于饱和温度（100 °C）附近 —— 旧值让画刷直接画出
       * **20 °C 的水蒸气**，这正是用户看到的"一堆只有 20 度的水蒸气"的来源之一。
       * 顺带：画出的蒸汽还会拿到潜热预算（见 paintAt），否则它一落到 <100 °C 就立刻凝结。 */
      case ID.STEAM: return 100;
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
      showFlow: true,          // v1.6.1 气流可视化（默认开，按 V 或设置面板切换）
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
            /* v1.6.0：画刷画出的蒸汽也要发潜热预算（= 引擎沸腾产出的蒸汽同等对待），
             * 否则手工蒸汽没有潜热、碰到比 100 °C 冷的地方会立刻凝结成水。 */
            if (id === ID.STEAM) g.latent[y * g.w + x] = YS.Balance.STEAM.LATENT_MAX;
            /* v1.6.2：把非水元素**画进水里**时注入水面波纹。
             * 必须单独处理"画入"这条路径：STONE 等静态固体（movable=0）根本不会下落，
             * 用户"从空中放一块石头到水里"实际就是把它画进水里 —— 没有这一步就不会有波纹。 */
            if (YS.Balance.WAVE.ENABLE && YS.Waves && id !== ID.WATER && id !== ID.STEAM) {
              var W = g.w, nIdx = y * W + x;
              var wet = (y > 0 && g.element[nIdx - W] === ID.WATER) ||
                (x > 0 && g.element[nIdx - 1] === ID.WATER) || (x < W - 1 && g.element[nIdx + 1] === ID.WATER);
              if (wet) {
                var dens = (YS.Elements.ELEMENTS[id] || {}).density || 1000;
                YS.Waves.splash(g, x, y, dens > 1500 ? 1 : (dens > 800 ? 0.6 : 0.35));
              }
            }
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
      /* v1.6.1 气流可视化开关（V 键；不劫持 Ctrl/Cmd+V 粘贴）：与设置面板「气流显示」同源 */
      if ((e.key === 'v' || e.key === 'V') && !e.ctrlKey && !e.metaKey) {
        app.fn.toggleSetting('showFlow', !state.showFlow);
        YS.Toolbar.refreshControls(app);
        return;
      }
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
        showFlow: state.showFlow,
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

    /* 版本徽章（顶栏）：版本号 + 最后修改时间 */
    var verBadge = document.getElementById('ver-badge');
    if (verBadge) verBadge.textContent = VERSION.v + ' · ' + VERSION.built;

    /* 暴露给调试 */
    root.__yuansu = app;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);

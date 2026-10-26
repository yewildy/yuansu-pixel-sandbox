/*
 * renderer.js — Canvas2D 像素渲染（docs/ART.md §1.4 / §2.4 / §2.5 / §3）
 *   · 离屏 320×180 ImageData 直写 → 关闭平滑按最大整数倍放大 blit
 *   · 逐格确定性抖动；自发光（strong）加法柔光；高对比模式；热力图叠加
 *   · v1.6.1 新增**气流可视化叠加**（opts.showFlow）：读取 grid.flowDir 的方向位标，
 *     只对"新鲜"（最近 10 tick 内移动过）的气体格及其下游邻格做**极淡**加法提亮，
 *     形成 2 格定向拖影；只动气体像素、幅度 ≤ 满量程 ~8%，不引入新颜色/混合模式、
 *     不遮住元素（详见 render() 内 showFlow 分支注释）。
 *   依赖 DOM。
 *   实测（_diag_p2flow.js，320×180、95% 填充）：showFlow 叠加成本 **+0.15 ms/帧（≈ +9%）**，
 *   仿真+渲染合计 ≈ 13.5 ms ≤ 16.7 ms 预算。
 */
(function (root) {
  'use strict';

  var Elements = root.YS.Elements;
  var Palette = root.YS.Palette;
  var Balance = root.YS.Balance;
  var Tint = root.YS.Tint;            // v1.6.11：温度着色唯一真值来源（src/render/tint.js）
  var ELS = Elements.ELEMENTS;

  var EMISSIVE = new Uint8Array(32);   // v1.4.0：30 → 31 种元素（新增 EMBER），表长 32
  for (var i = 1; i <= 31; i++) {
    var em = ELS[i] ? ELS[i].emissive : 'no';
    EMISSIVE[i] = em === 'strong' ? 2 : (em === 'weak' ? 1 : 0);
  }

  /* v1.6.1 气流可视化叠加参数：
   *   FLOW_FRESH_TICKS —— 位标"新鲜度"窗口（tickId - moveStamp ≤ 该值才渲染，10 tick ≈ 167 ms）；
   *   FLOW_SRC_*       —— 源格的加法提亮量（偏蓝，呼应背景冷色；总量 5+6+9 = 20 ≈ 满量程的 8%）；
   *   FLOW_DST_*       —— 下游拖影格的提亮量（约源格一半）。 */
  var FLOW_FRESH_TICKS = 10;
  var FLOW_SRC_R = 5, FLOW_SRC_G = 6, FLOW_SRC_B = 9;
  var FLOW_DST_R = 2, FLOW_DST_G = 3, FLOW_DST_B = 5;

  /* 预计算三档 RGB 查找（id*3+shade） */
  var R3 = new Uint8Array(32 * 3);
  var G3 = new Uint8Array(32 * 3);
  var B3 = new Uint8Array(32 * 3);
  for (var id = 1; id <= 31; id++) {
    R3[id * 3] = Palette.R[id]; G3[id * 3] = Palette.G[id]; B3[id * 3] = Palette.B[id];
    R3[id * 3 + 1] = Palette.LR[id]; G3[id * 3 + 1] = Palette.LG[id]; B3[id * 3 + 1] = Palette.LB[id];
    R3[id * 3 + 2] = Palette.DR[id]; G3[id * 3 + 2] = Palette.DG[id]; B3[id * 3 + 2] = Palette.DB[id];
  }

  function create(displayCanvas, gw, gh) {
    gw = gw || Balance.PHYS.GRID_W;
    gh = gh || Balance.PHYS.GRID_H;

    var off = document.createElement('canvas');
    off.width = gw; off.height = gh;
    var offCtx = off.getContext('2d');
    var img = offCtx.createImageData(gw, gh);
    var buf = img.data;
    var buf32 = new Uint32Array(buf.buffer);
    var dctx = displayCanvas.getContext('2d');

    var bgR = 11, bgG = 15, bgB = 23;         // #0B0F17
    var bg32 = pack(255, 11, 15, 23);

    function pack(a, r, g, b) { return ((a << 24) | (b << 16) | (g << 8) | r) >>> 0; }

    var api = {
      gw: gw, gh: gh,
      offscreen: off,
      display: displayCanvas,

      /* 计算并应用显示 canvas 的整数倍尺寸（含 dpr），返回缩放倍率 */
      resize: function (cssW, cssH, dpr) {
        dpr = dpr || (root.devicePixelRatio || 1);
        var scale = Math.floor(Math.min(cssW / gw, cssH / gh));
        if (scale < 1) scale = 1;
        var cw = gw * scale, ch = gh * scale;
        displayCanvas.width = Math.round(cw * dpr);
        displayCanvas.height = Math.round(ch * dpr);
        displayCanvas.style.width = cw + 'px';
        displayCanvas.style.height = ch + 'px';
        dctx.imageSmoothingEnabled = false;
        this.scale = scale;
        return scale;
      },

      /* 屏幕坐标 → 网格坐标 */
      toGrid: function (clientX, clientY) {
        var rect = displayCanvas.getBoundingClientRect();
        var x = Math.floor((clientX - rect.left) / rect.width * gw);
        var y = Math.floor((clientY - rect.top) / rect.height * gh);
        if (x < 0) x = 0; else if (x >= gw) x = gw - 1;
        if (y < 0) y = 0; else if (y >= gh) y = gh - 1;
        return { x: x, y: y };
      },

      render: function (grid, opts) {
        opts = opts || {};
        var hc = !!opts.highContrast;
        if (hc) { bgR = 0; bgG = 0; bgB = 0; bg32 = pack(255, 0, 0, 0); }
        var el = grid.element, w = grid.w, h = grid.h, n = grid.n;
        var t = opts.animTime | 0;
        var x, y, p, e, shade, a, sr, sg, sb, inv;

        /* 铺底 */
        for (p = 0; p < n; p++) buf32[p] = bg32;

        for (y = 0; y < h; y++) {
          for (x = 0; x < w; x++) {
            p = y * w + x;
            e = el[p];
            if (e === 1) continue;
            /* v1.4.1 分子色差：液体（WATER/OIL）按 tint 取五档色阶（色号随粒子搬行），
             * 其余元素走原三档确定性抖动。 */
            if (Palette.ION[e]) {
              var k5 = e * 5 + grid.tint[p];
              sr = Palette.ION_R[k5]; sg = Palette.ION_G[k5]; sb = Palette.ION_B[k5];
            } else {
              shade = Palette.shadeIndex(x, y, e, t, hc);
              var k3 = e * 3 + shade;
              sr = R3[k3]; sg = G3[k3]; sb = B3[k3];
            }
            a = Palette.ALPHA[e];
            if (a >= 1) {
              buf32[p] = pack(255, sr, sg, sb);
            } else {
              inv = 1 - a;
              buf32[p] = pack(255,
                (sr * a + bgR * inv) | 0,
                (sg * a + bgG * inv) | 0,
                (sb * a + bgB * inv) | 0);
            }
          }
        }

        /* 自发光（strong）加法柔光（§2.4） */
        if (opts.glow !== false) {
          for (y = 0; y < h; y++) {
            for (x = 0; x < w; x++) {
              p = y * w + x;
              e = el[p];
              if (e === 1 || EMISSIVE[e] !== 2) continue;
              var k3b = e * 3 + 1; /* light 档作光晕色 */
              addGlow(buf32, x, y, w, h, R3[k3b] * 0.4 | 0, G3[k3b] * 0.4 | 0, B3[k3b] * 0.4 | 0);
            }
          }
        }

        /* 热力图叠加（可选，§8.4）
         * v1.6.11：改走 src/render/tint.js（与离屏证据渲染器 _render.js 同一份逻辑），
         * 并按元素的 heatTint 分三路着色 —— 热气体往**白**推（更亮），热固体/液体往**橙**推，
         * 二者不再收敛到同一个颜色（docs/art/steam-visibility.md §4）。
         * 阈值改由 Balance.PHYS.AMBIENT_T 驱动（±BAND 死区），与 _render.js 的 ambient 一致。 */
        if (opts.showHeat && Tint) {          /* Tint 缺失时降级为不着色，而不是抛异常 */
          var temp = grid.temp;
          var amb = (Balance && Balance.PHYS && Balance.PHYS.AMBIENT_T !== undefined)
            ? Balance.PHYS.AMBIENT_T : 20;
          for (p = 0; p < n; p++) {
            var T = temp[p];
            if (T > amb + Tint.BAND || T < amb - Tint.BAND) {
              var v = buf32[p];
              var cr = v & 255, cg = (v >> 8) & 255, cb = (v >> 16) & 255;
              var o = Tint.apply(cr, cg, cb, T, amb, Tint.MODE[el[p]]);
              var nr = o[0] < 0 ? 0 : (o[0] > 255 ? 255 : o[0]) | 0;
              var ng = o[1] < 0 ? 0 : (o[1] > 255 ? 255 : o[1]) | 0;
              var nb = o[2] < 0 ? 0 : (o[2] > 255 ? 255 : o[2]) | 0;
              buf32[p] = (0xff000000 | (nb << 16) | (ng << 8) | nr) >>> 0;
            }
          }
        }

        /* 气流可视化叠加（可选，v1.6.1 Phase 2 / 原设计 C5）：
         * grid.flowDir 位标（1=E 2=W 4=N 8=S）由 air/movement/wind 的气体置换写入，
         * moveStamp 记下该格最近一次移动的 tickId。这里只画"新鲜"（≤ FLOW_FRESH_TICKS=10 tick）
         * 的气体格（含 AIR id 1）：本格极淡提亮，并按方向位给**下游邻格**再提亮一次 →
         * 形成 2 格定向拖影，肉眼可辨气流走向。
         * 克制原则（用户："隐隐约约看到，不能太明显而遮住了其他东西"）：
         *   · 只对气体格做加法提亮，**绝不动固体/液体/粉末像素**（不遮元素）；
         *   · 幅度极淡（源格 ≤ 满量程 ~8%），**不引入新颜色/混合模式**，沿用现成 addPix。 */
        if (opts.showFlow) {
          var fdir = grid.flowDir, mst = grid.moveStamp, tid = grid.tickId;
          for (y = 0; y < h; y++) {
            for (x = 0; x < w; x++) {
              p = y * w + x;
              var fdv = fdir[p];
              if (fdv === 0) continue;
              if (tid - mst[p] > FLOW_FRESH_TICKS) continue;      // 过期位标不再渲染
              if (ELS[el[p]].state !== 'gas') continue;           // 只画气体（含 AIR）
              addPix(buf32, p, FLOW_SRC_R, FLOW_SRC_G, FLOW_SRC_B); // 本格：极淡提亮
              if (fdv & 1) addFlowNeighbor(buf32, el, x + 1, y, w, h);   // 下游（E）
              if (fdv & 2) addFlowNeighbor(buf32, el, x - 1, y, w, h);   // 下游（W）
              if (fdv & 4) addFlowNeighbor(buf32, el, x, y - 1, w, h);   // 下游（N）
              if (fdv & 8) addFlowNeighbor(buf32, el, x, y + 1, w, h);   // 下游（S）
            }
          }
        }

        offCtx.putImageData(img, 0, 0);
        dctx.imageSmoothingEnabled = false;
        dctx.clearRect(0, 0, displayCanvas.width, displayCanvas.height);
        dctx.drawImage(off, 0, 0, displayCanvas.width, displayCanvas.height);
      },

      /* 绘制笔刷光标（在放大的显示层上叠加，双色描边，§6.2） */
      drawCursor: function (gx, gy, radius, eraser, scale, dpr) {
        dpr = dpr || (root.devicePixelRatio || 1);
        var s = (this.scale || scale || 1) * dpr;
        var ctx = dctx;
        var cx = gx * s, cy = gy * s;
        var side = (2 * radius - 1) * s;
        ctx.save();
        ctx.lineWidth = Math.max(1, dpr);
        ctx.strokeStyle = eraser ? '#D93A2B' : '#000000';
        ctx.strokeRect(cx - (radius - 1) * s + 0.5, cy - (radius - 1) * s + 0.5, side, side);
        if (radius === 1) {
          ctx.strokeStyle = '#FFFFFF';
          ctx.beginPath();
          ctx.moveTo(cx, cy); ctx.lineTo(cx + s, cy);
          ctx.moveTo(cx, cy); ctx.lineTo(cx, cy + s);
          ctx.stroke();
        }
        ctx.restore();
      }
    };

    return api;
  }

  function addGlow(buf32, x, y, w, h, ar, ag, ab) {
    for (var dy = -2; dy <= 2; dy++) {
      var yy = y + dy; if (yy < 0 || yy >= h) continue;
      for (var dx = -2; dx <= 2; dx++) {
        var xx = x + dx; if (xx < 0 || xx >= w) continue;
        var d = Math.abs(dx) + Math.abs(dy);
        if (d === 0 || d > 2) continue;
        var f = d === 1 ? 1 : 0.5;
        addPix(buf32, yy * w + xx, (ar * f) | 0, (ag * f) | 0, (ab * f) | 0);
      }
    }
  }

  /* v1.6.1 气流拖影：给下游邻格极淡提亮（仅当该邻格是气体/空气，绝不遮元素） */
  function addFlowNeighbor(buf32, el, x, y, w, h) {
    if (x < 0 || x >= w || y < 0 || y >= h) return;
    var q = y * w + x;
    if (ELS[el[q]].state !== 'gas') return;
    addPix(buf32, q, FLOW_DST_R, FLOW_DST_G, FLOW_DST_B);
  }

  function addPix(buf32, p, ar, ag, ab) {
    var v = buf32[p];
    var r = v & 255, g = (v >> 8) & 255, b = (v >> 16) & 255;
    r += ar; g += ag; b += ab;
    if (r > 255) r = 255; if (g > 255) g = 255; if (b > 255) b = 255;
    buf32[p] = (0xff000000 | (b << 16) | (g << 8) | r) >>> 0;
  }

  function applyOverlay(buf32, p, cr, cg, cb, f) {
    var v = buf32[p];
    var r = v & 255, g = (v >> 8) & 255, b = (v >> 16) & 255;
    r = (r * (1 - f) + cr * f) | 0;
    g = (g * (1 - f) + cg * f) | 0;
    b = (b * (1 - f) + cb * f) | 0;
    buf32[p] = (0xff000000 | (b << 16) | (g << 8) | r) >>> 0;
  }

  var api = { create: create, pack: function (a, r, g, b) { return ((a << 24) | (b << 16) | (g << 8) | r) >>> 0; }, EMISSIVE: EMISSIVE };
  root.YS.Renderer = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

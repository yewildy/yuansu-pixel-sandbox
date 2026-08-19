/*
 * renderer.js — Canvas2D 像素渲染（docs/ART.md §1.4 / §2.4 / §2.5 / §3）
 *   · 离屏 320×180 ImageData 直写 → 关闭平滑按最大整数倍放大 blit
 *   · 逐格确定性抖动；自发光（strong）加法柔光；高对比模式；热力图叠加
 *   依赖 DOM。
 */
(function (root) {
  'use strict';

  var Elements = root.YS.Elements;
  var Palette = root.YS.Palette;
  var Balance = root.YS.Balance;
  var ELS = Elements.ELEMENTS;

  var EMISSIVE = new Uint8Array(31);
  for (var i = 1; i <= 30; i++) {
    var em = ELS[i] ? ELS[i].emissive : 'no';
    EMISSIVE[i] = em === 'strong' ? 2 : (em === 'weak' ? 1 : 0);
  }

  /* 预计算三档 RGB 查找（id*3+shade） */
  var R3 = new Uint8Array(31 * 3);
  var G3 = new Uint8Array(31 * 3);
  var B3 = new Uint8Array(31 * 3);
  for (var id = 1; id <= 30; id++) {
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
            shade = Palette.shadeIndex(x, y, e, t, hc);
            var k3 = e * 3 + shade;
            sr = R3[k3]; sg = G3[k3]; sb = B3[k3];
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

        /* 热力图叠加（可选，§8.4） */
        if (opts.showHeat) {
          var temp = grid.temp;
          for (p = 0; p < n; p++) {
            var T = temp[p];
            if (T > 25) {
              var f = Math.min(1, (T - 25) / 200) * 0.5;
              applyOverlay(buf32, p, 255, 176, 32, f);
            } else if (T < 15) {
              var f2 = Math.min(1, (15 - T) / 200) * 0.5;
              applyOverlay(buf32, p, 30, 111, 184, f2);
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

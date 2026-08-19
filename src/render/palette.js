/*
 * palette.js — 配色 + 抖动权重（docs/ART.md §2.3 / §2.5 / §3）
 *   · 由 Elements 的 hex 颜色派生 RGB 查找表
 *   · 确定性三档抖动（base/light/dark），动画元素加入时间项
 *   无 DOM 依赖（纯数据 + 数学），可在 Node 下测试。
 */
(function (root) {
  'use strict';

  var Elements = root.YS.Elements;
  var RNG = root.YS.RNG;
  var ELS = Elements.ELEMENTS;

  /* §2.3 类别权重 */
  var WEIGHTS = {
    static: { base: 0.58, light: 0.16, dark: 0.26 },
    powder: { base: 0.60, light: 0.18, dark: 0.22 },
    liquid: { base: 0.82, light: 0.09, dark: 0.09 },
    gas: { base: 0.66, light: 0.20, dark: 0.14 },
    special: { base: 0.70, light: 0.15, dark: 0.15 }
  };

  /* 高对比模式权重（§4.2 极值化） */
  var WEIGHTS_HC = {
    static: { base: 0.4, light: 0.3, dark: 0.3 },
    powder: { base: 0.4, light: 0.3, dark: 0.3 },
    liquid: { base: 0.4, light: 0.3, dark: 0.3 },
    gas: { base: 0.4, light: 0.3, dark: 0.3 },
    special: { base: 0.4, light: 0.3, dark: 0.3 }
  };

  var N = 31;
  var R = [null], G = [null], B = [null];           // base
  var LR = [null], LG = [null], LB = [null];        // light
  var DR = [null], DG = [null], DB = [null];        // dark
  var ALPHA = new Float32Array(N);
  var DITHER = new Uint8Array(N);
  var ANIM = new Uint8Array(N);
  var CAT = new Array(N);

  function hexToRgb(hex) {
    var v = parseInt(hex.slice(1), 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }

  for (var id = 1; id < N; id++) {
    var el = ELS[id];
    if (!el) continue;
    var b = hexToRgb(el.base), l = hexToRgb(el.light), d = hexToRgb(el.dark);
    R[id] = b[0]; G[id] = b[1]; B[id] = b[2];
    LR[id] = l[0]; LG[id] = l[1]; LB[id] = l[2];
    DR[id] = d[0]; DG[id] = d[1]; DB[id] = d[2];
    ALPHA[id] = el.alpha;
    DITHER[id] = el.dither ? 1 : 0;
    ANIM[id] = el.anim ? 1 : 0;
    CAT[id] = el.cat;
  }

  /* 返回阴影档位：0=base 1=light 2=dark */
  function shadeIndex(x, y, elId, t, highContrast) {
    if (!DITHER[elId] || elId === 1) return 0;
    var salt = elId * 131 + (ANIM[elId] ? (t * 2246822519 | 0) : 0);
    var r = RNG.hashU32(x, y, salt) / 4294967296;
    var w = (highContrast ? WEIGHTS_HC : WEIGHTS)[CAT[elId]] || WEIGHTS.special;
    if (r < w.base) return 0;
    if (r < w.base + w.light) return 1;
    return 2;
  }

  function shadeHex(x, y, elId, t, highContrast) {
    var s = shadeIndex(x, y, elId, t, highContrast);
    var el = ELS[elId];
    return s === 0 ? el.base : (s === 1 ? el.light : el.dark);
  }

  var api = {
    WEIGHTS: WEIGHTS,
    WEIGHTS_HC: WEIGHTS_HC,
    R: R, G: G, B: B,
    LR: LR, LG: LG, LB: LB,
    DR: DR, DG: DG, DB: DB,
    ALPHA: ALPHA, DITHER: DITHER, ANIM: ANIM, CAT: CAT,
    hexToRgb: hexToRgb,
    shadeIndex: shadeIndex,
    shadeHex: shadeHex
  };
  root.YS = root.YS || {};
  root.YS.Palette = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

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

  var N = 32;                      // v1.4.0：30 → 31 种元素（新增 EMBER），表长 32
  var R = [null], G = [null], B = [null];           // base
  var LR = [null], LG = [null], LB = [null];        // light
  var DR = [null], DG = [null], DB = [null];        // dark
  var ALPHA = new Float32Array(N);
  var DITHER = new Uint8Array(N);
  var ANIM = new Uint8Array(N);
  var CAT = new Array(N);
  /* v1.4.1「分子色差」：液体元素标记。ION=1 的元素在渲染时读 grid.tint（0-4），
   * 从 ION_* 五档色阶里取色 —— 色号随粒子搬行，流动一眼可辨。
   * 目前覆盖 WATER / OIL（用户点名"水分子颜色细微差异"与油面流动）。 */
  var ION = new Uint8Array(N);
  var ION_R = new Uint8Array(N * 5), ION_G = new Uint8Array(N * 5), ION_B = new Uint8Array(N * 5);
  /* v1.4.1 永燃火种专用闪烁权重（anim 开着时三档剧烈轮换，默认 special 档 70% base 太闷） */
  var FLICKER_W = { base: 0.34, light: 0.33, dark: 0.33 };

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
    if (el.key === 'WATER' || el.key === 'OIL') {
      ION[id] = 1;
      /* 五档：0=base 1=light 2=dark 3=dark↔base 中点 4=base↔light 中点（同一色相的细微深浅） */
      ION_R[id * 5] = b[0]; ION_G[id * 5] = b[1]; ION_B[id * 5] = b[2];
      ION_R[id * 5 + 1] = l[0]; ION_G[id * 5 + 1] = l[1]; ION_B[id * 5 + 1] = l[2];
      ION_R[id * 5 + 2] = d[0]; ION_G[id * 5 + 2] = d[1]; ION_B[id * 5 + 2] = d[2];
      ION_R[id * 5 + 3] = (d[0] + b[0]) >> 1; ION_G[id * 5 + 3] = (d[1] + b[1]) >> 1; ION_B[id * 5 + 3] = (d[2] + b[2]) >> 1;
      ION_R[id * 5 + 4] = (b[0] + l[0]) >> 1; ION_G[id * 5 + 4] = (b[1] + l[1]) >> 1; ION_B[id * 5 + 4] = (b[2] + l[2]) >> 1;
    }
  }

  /* 返回阴影档位：0=base 1=light 2=dark（ION 液体改由 renderer 读 tint，不走本函数） */
  function shadeIndex(x, y, elId, t, highContrast) {
    if (!DITHER[elId] || elId === 1) return 0;
    var salt = elId * 131 + (ANIM[elId] ? (t * 2246822519 | 0) : 0);
    var r = RNG.hashU32(x, y, salt) / 4294967296;
    /* EMBER（永燃火种）：三档剧烈闪烁，让"一直在烧"有肉眼可见的动效 */
    var w = (elId === 31) ? FLICKER_W :
      ((highContrast ? WEIGHTS_HC : WEIGHTS)[CAT[elId]] || WEIGHTS.special);
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
    ION: ION, ION_R: ION_R, ION_G: ION_G, ION_B: ION_B,
    hexToRgb: hexToRgb,
    shadeIndex: shadeIndex,
    shadeHex: shadeHex
  };
  root.YS = root.YS || {};
  root.YS.Palette = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

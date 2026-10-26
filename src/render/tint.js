/*
 * tint.js — 温度着色的**唯一真值来源**（docs/art/steam-visibility.md §4）
 *
 * 背景：之前温度着色逻辑在两处各写一遍（离屏证据渲染器 `_render.js` 与游戏内
 * `src/render/renderer.js` 的 showHeat 分支），两边阈值/幅度还不一致（0.5 vs 0.45），
 * 而且**不分物态**：热的东西一律往橙 (255,150,40) 推。
 * 后果：100 ℃ 的蒸汽和被蒸汽烤热的石壁被推向同一个橙色，两者在色域上收敛
 * （实测渲染后亮度 122 vs 125，只差 1.1%）——管道里的蒸汽和管道壁一起消失。
 *
 * 修正：**热表达按元素分三路**，由 elements.js 的 heatTint 字段驱动。
 *   'warm'  热→橙  (255,176,32)   —— 固体/液体/粉末/自发光气体（火、岩浆本来就是橙的）
 *   'white' 热→白  (250,252,255)  —— 非自发光气体（蒸汽、瓦斯）：越热越白越亮
 *   'hold'  热→极弱暖（同 warm 色，幅度砍到 0.18）—— 烟：保持暗灰，受热不变亮
 *
 * 这样"热蒸汽"(→白，更亮) 与"被烤热的石壁"(→橙) 在**色相与明度两个维度**上
 * 同时分离，不再收敛。
 *
 * 冷侧同理：非自发光气体往**淡蓝白** (150,200,240) 推而不是深蓝 (30,111,184)，
 * 保证冷掉的气体不会沉进近黑背景里。
 *
 * 零依赖、无 DOM；Node 与浏览器共用（浏览器读 root.YS.Elements）。
 */
(function (root) {
  'use strict';

  var HOT_WARM = [255, 176, 32];      // 热固体：余热辉光（与原实现一致）
  var HOT_WHITE = [250, 252, 255];    // 热气体：白热
  var COLD_WARM = [30, 111, 184];     // 冷固体：深蓝
  var COLD_WHITE = [150, 200, 240];   // 冷气体：淡蓝白（保底不沉进背景）

  /* 幅度：热侧按模式区分，冷侧统一 */
  var A_HOT = { warm: 0.50, white: 0.65, hold: 0.18 };
  var A_COLD = { warm: 0.50, white: 0.50, hold: 0.50 };

  var HOT_SPAN = 200;                 // 温度差归一化跨度（℃）
  var BAND = 5;                       // 死区：|T-amb| ≤ 5 ℃ 不着色

  /* MODE[id] = 'warm' | 'white' | 'hold' */
  var MODE = new Array(32);
  for (var i = 0; i < 32; i++) MODE[i] = 'warm';
  var ELS = (root.YS && root.YS.Elements) ? root.YS.Elements.ELEMENTS : null;
  if (ELS) {
    for (var id = 1; id <= 31; id++) {
      if (ELS[id] && ELS[id].heatTint) MODE[id] = ELS[id].heatTint;
    }
  }

  var out = new Float64Array(3);      // 复用输出，避免 57600 格/帧的分配

  /* 就地计算温度着色后的 RGB；返回复用的 out（调用方立即取值，勿持有） */
  function apply(r, g, b, T, amb, mode) {
    if (amb === undefined || amb === null) amb = 20;
    var m = A_HOT[mode] ? mode : 'warm';
    var hi = amb + BAND, lo = amb - BAND;
    if (T > hi) {
      var f = (T - hi) / HOT_SPAN; if (f > 1) f = 1;
      f *= A_HOT[m];
      var c = (m === 'white') ? HOT_WHITE : HOT_WARM;
      out[0] = r + (c[0] - r) * f;
      out[1] = g + (c[1] - g) * f;
      out[2] = b + (c[2] - b) * f;
    } else if (T < lo) {
      var f2 = (lo - T) / HOT_SPAN; if (f2 > 1) f2 = 1;
      f2 *= A_COLD[m];
      var c2 = (m === 'white') ? COLD_WHITE : COLD_WARM;
      out[0] = r + (c2[0] - r) * f2;
      out[1] = g + (c2[1] - g) * f2;
      out[2] = b + (c2[2] - b) * f2;
    } else {
      out[0] = r; out[1] = g; out[2] = b;
    }
    return out;
  }

  var api = {
    MODE: MODE,
    apply: apply,
    HOT_WARM: HOT_WARM, HOT_WHITE: HOT_WHITE,
    COLD_WARM: COLD_WARM, COLD_WHITE: COLD_WHITE,
    A_HOT: A_HOT, A_COLD: A_COLD, BAND: BAND, HOT_SPAN: HOT_SPAN
  };
  root.YS = root.YS || {};
  root.YS.Tint = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

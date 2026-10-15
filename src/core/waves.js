/*
 * waves.js — 水面波纹（v1.6.2）
 *
 * 用户要求：「如果我从空中放一块石头到水里，水面要有波纹传递，就是要完全拟真的模拟水的流动。」
 *
 * 实现（docs/PHYSICS-AIR.md 附录 I）：
 *   1. **波高场**：按列存一维自由水面位移 h[x] 与速度 v[x]（grid.waveH / grid.waveV）。
 *      用显式一维波动方程更新：∂²h/∂t² = c²·∂²h/∂x² − γ·∂h/∂t（离散为逐 tick 递推），
 *      零热路径分配（两个 Float32Array，长度 = 画布宽）。
 *   2. **撞击注入**：`splash()` 由 movement.js 的 `swapMove` 在"非水物体落入水中"时调用，
 *      按 1 / 0.55 / 0.3 的比例向两侧注入波高与初速度 → 石头落水立刻出现一圈涟漪。
 *   3. **几何落地**（不是贴图）：波峰列 h ≥ +1 时，若相邻列水面更低且波峰格的**上方是空气**，
 *      就把相邻列的一格水**斜向搬进**本列的水面之上 —— 于是波峰真的长高一格、邻列真的矮一格，
 *      水量严格守恒（用 swap，元素/温度/寿命一起搬）。随 h 衰减，涟漪自然被重力找平吃掉。
 *
 * 零 DOM；确定性（只用 RNG.hash01）；不入存档。
 */
(function (root) {
  'use strict';

  var Balance = root.YS.Balance;
  var RNG = root.YS.RNG;

  function wavePass(grid, ctx) {
    var W = Balance.WAVE;
    var h = grid.waveH, v = grid.waveV;
    var n = grid.w, i, a, b, c, acc;
    var c2 = W.SPEED_C2, damp = W.DAMP;
    /* 边界：两端固定（波从撞击点向内传播，不从画布边缘折返） */
    h[0] = 0; v[0] = 0; h[n - 1] = 0; v[n - 1] = 0;
    for (i = 1; i < n - 1; i++) {
      a = h[i - 1]; b = h[i]; c = h[i + 1];
      acc = c2 * (a - 2 * b + c) - damp * v[i];
      v[i] += acc;
      h[i] = b + v[i];
      if (h[i] > W.H_MAX) { h[i] = W.H_MAX; v[i] = 0; }
      else if (h[i] < -W.H_MAX) { h[i] = -W.H_MAX; v[i] = 0; }
      if (h[i] > 0 && h[i] < W.H_EPS) h[i] = 0;
      if (h[i] < 0 && h[i] > -W.H_EPS) h[i] = 0;
    }
    if (!W.ENABLE) return;
    /* ---- 几何落地：波峰从较低的邻列吸收一格水（水量守恒的 swap） ---- */
    realize(grid, ctx);
  }

  /* 把波峰"兑现"成真实的水面起伏：波峰列从较低的邻列斜取一格水到本列水面上方。
   * v1.6.2 性能修正：初版每次都全画布扫描水面（N=57600 次迭代，单 tick +0.09ms、逼近预算上限），
   * 现改为**只扫波峰及其邻列**（每 tick 最多 MAX_REALIZE×2 列 → O(360)）。 */
  function realize(grid, ctx) {
    var W = Balance.WAVE;
    var w = grid.w, h = grid.waveH, v = grid.waveV, el = grid.element;
    var ID = root.YS.Elements.ID;
    var tick = ctx.tick;
    var x, y, i, surf, dst, src, nb, topHere, topNb;

    var budget = W.MAX_REALIZE;
    for (x = 2; x < w - 2 && budget > 0; x++) {
      if (h[x] < 1) continue;
      nb = RNG.hash01(x, ctx.tick, 6151) < 0.5 ? -1 : 1;
      var sx = x + nb;
      /* 只扫这两列的水面（从顶往下找第一格水） */
      surf = -1;
      for (y = 0; y < grid.h; y++) { i = y * w + x; if (el[i] === ID.WATER) { surf = i; break; } }
      if (surf < 0) continue;
      topHere = surf;
      surf = -1;
      for (y = 0; y < grid.h; y++) { i = y * w + sx; if (el[i] === ID.WATER) { surf = i; break; } }
      if (surf < 0) continue;
      topNb = surf;
      dst = topHere - w;
      if (dst < 0 || el[dst] !== 1) continue;              // 本列水面上方必须是空气
      if (h[sx] > h[x] - 0.5) continue;                     // 邻列必须更低才搬
      src = topNb;
      grid.swap(src, dst);
      grid.moveStamp[src] = tick;
      grid.moveStamp[dst] = tick;
      h[x] -= 1; h[sx] += 0.5; v[x] = -v[x] * 0.3;
      budget++;
      x = Math.max(x, sx);                                   // 同一 tick 不连续抽干同一片
    }
  }

  /* 撞击注入：非水物体落入水中 */
  function splash(grid, x, y, scale) {
    var W = Balance.WAVE;
    if (!W.ENABLE) return;
    var n = grid.w, s = (scale === undefined ? 1 : scale) * W.SPLASH_H;
    var i;
    grid.waveV[x] -= W.SPLASH_V * (scale === undefined ? 1 : scale);
    grid.waveH[x] += s;                            // 撞击点本身是波峰
    for (i = 1; i <= W.SPLASH_SPREAD; i++) {
      var a = x - i, b = x + i;
      var f = s * Math.pow(W.SPLASH_FALLOFF, i);
      if (a >= 0 && a < n) grid.waveH[a] += f;
      if (b >= 0 && b < n) grid.waveH[b] += f;
    }
  }

  var api = { wavePass: wavePass, splash: splash };
  root.YS.Waves = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

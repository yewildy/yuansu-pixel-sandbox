/*
 * thermal.js — 离散导热 + 环境弛豫（docs/PHYSICS.md §6 / docs/PHYSICS-AIR.md §4）
 *   · diffuse: T_i' = T_i + α Σ K_ij (T_j - T_i)，每对只算一次（E/S 邻居）
 *     配对系数 K 采用「双轨制」（PHYSICS-AIR.md §4.1）：
 *       两格皆 AIR → K = AIR.SELF_K (=0.5)；且 |ΔT| < AIR.CONDUCT_EPS 时跳过（近平衡降载）
 *       其余配对   → K = (k_i + k_j)/2（沿用 §6.1）
 *     默认对称温度交换 → 守恒 ΣT（§6.1 标定式，含审查 F01 修正 α=0.005）
 *     opts.energyWeighted=true 时按比热加权 → 守恒 Σ c·T（供单元测试校验，见 ADR-0003）
 *   · relax: 向环境温度 T_amb 弛豫 + 暴露加成（§6.3）；AIR 用 AIR.RELAX（不乘暴露），
 *     顶部 SKY_ROWS 行的 AIR 用 AIR.SKY_RELAX 散热（天空热沉，PHYSICS-AIR.md §4.4）
 *   · clamp: 温度钳制（§13.4）
 * 零 DOM。
 */
(function (root) {
  'use strict';

  var Balance = root.YS.Balance;
  var Elements = root.YS.Elements;

  /* 导热：把结果写入 grid.nextTemp（不修改 grid.temp） */
  function diffuse(grid, opts) {
    opts = opts || {};
    var alpha = opts.alpha !== undefined ? opts.alpha : Balance.PHYS.HEAT_COUPLING;
    var ew = !!opts.energyWeighted;
    var w = grid.w, h = grid.h, n = grid.n;
    var el = grid.element, temp = grid.temp, next = grid.nextTemp;
    var k = Elements.conductivity, c = Elements.specificHeat;
    var selfK = Balance.AIR.SELF_K, eps = Balance.AIR.CONDUCT_EPS;
    var aSelf = alpha * selfK;
    var i, j, x, y, row, ei, ej, K, q, dT;

    for (i = 0; i < n; i++) next[i] = temp[i];

    for (y = 0; y < h; y++) {
      row = y * w;
      for (x = 0; x < w; x++) {
        i = row + x;
        ei = el[i];
        // 东邻居
        if (x + 1 < w) {
          j = i + 1; ej = el[j];
          if (ei === 1 && ej === 1) {
            dT = temp[j] - temp[i];
            if (dT >= eps || dT <= -eps) {          // 近平衡跳过（均匀空气零成本）
              q = aSelf * dT;
              next[i] += q; next[j] -= q;
            }
          } else {
            K = (k[ei] + k[ej]) * 0.5;
            q = alpha * K * (temp[j] - temp[i]);
            if (ew) { next[i] += q / c[ei]; next[j] -= q / c[ej]; }
            else { next[i] += q; next[j] -= q; }
          }
        }
        // 南邻居
        if (y + 1 < h) {
          j = i + w; ej = el[j];
          if (ei === 1 && ej === 1) {
            dT = temp[j] - temp[i];
            if (dT >= eps || dT <= -eps) {
              q = aSelf * dT;
              next[i] += q; next[j] -= q;
            }
          } else {
            K = (k[ei] + k[ej]) * 0.5;
            q = alpha * K * (temp[j] - temp[i]);
            if (ew) { next[i] += q / c[ei]; next[j] -= q / c[ej]; }
            else { next[i] += q; next[j] -= q; }
          }
        }
      }
    }
  }

  /* 环境弛豫 + 钳制（§6.3 / §13.4），就地作用于 nextTemp */
  function relax(grid, ambient) {
    var amb = ambient !== undefined ? ambient : Balance.PHYS.AMBIENT_T;
    var w = grid.w, h = grid.h, n = grid.n;
    var el = grid.element, nt = grid.nextTemp;
    var minT = Balance.PHYS.MIN_TEMP, maxT = Balance.PHYS.MAX_TEMP;
    var mult = Balance.PHYS.EXPOSED_RELAX_MULT;
    var baseAir = Balance.AIR.RELAX;
    var skyRows = Balance.AIR.SKY_ROWS, skyRelax = Balance.AIR.SKY_RELAX;
    var driveDev = Balance.AIR.BUOY_DT > Balance.AIR.COLD_DT ? Balance.AIR.BUOY_DT : Balance.AIR.COLD_DT;
    var baseGas = Balance.PHYS.ENV_RELAX_GAS;
    var baseLiq = Balance.PHYS.ENV_RELAX_LIQUID;
    var baseSol = Balance.PHYS.ENV_RELAX_SOLID;
    var Em = Elements.ELEMENTS;
    var Air = root.YS.Air;
    var i, x, y, row, e, base, r, v, exposed;

    for (y = 0; y < h; y++) {
      row = y * w;
      var rAir = (y < skyRows) ? skyRelax : baseAir;   // 行级常量，避免逐格分支
      for (x = 0; x < w; x++) {
        i = row + x;
        e = el[i];
        if (e === 1) {
          // 空气：恒用 AIR.RELAX（不乘暴露加成）；顶部天空层用 SKY_RELAX 散热
          v = nt[i];
          if (v !== amb) {
            v += rAir * (amb - v);
            if (v < minT) v = minT; else if (v > maxT) v = maxT;
            nt[i] = v;
            // 温差达到运动阈值 → 置位"有待驱动空气"标志，供 air.js 提前退出（空画布零成本）
            var dev = v - amb;
            if (Air && (dev > driveDev || dev < -driveDev)) Air.noteDeviation();
          }
          continue;
        }
        var st = Em[e].state;
        if (st === 'gas') base = baseGas;
        else if (st === 'liquid') base = baseLiq;
        else base = baseSol;
        if (base > 0) {
          // 暴露加成：4 邻域存在 AIR
          exposed = false;
          if (x > 0 && el[i - 1] === 1) exposed = true;
          else if (x < w - 1 && el[i + 1] === 1) exposed = true;
          else if (y > 0 && el[i - w] === 1) exposed = true;
          else if (y < h - 1 && el[i + w] === 1) exposed = true;
          r = exposed ? base * mult : base;
          v = nt[i];
          v += r * (amb - v);
          if (v < minT) v = minT; else if (v > maxT) v = maxT;
          nt[i] = v;
        }
      }
    }
  }

  /* 温度钳制（就地，作用于 nextTemp） */
  function clamp(grid) {
    var nt = grid.nextTemp, n = grid.n;
    var minT = Balance.PHYS.MIN_TEMP, maxT = Balance.PHYS.MAX_TEMP;
    for (var i = 0; i < n; i++) {
      var v = nt[i];
      if (v < minT) nt[i] = minT; else if (v > maxT) nt[i] = maxT;
    }
  }

  var api = { diffuse: diffuse, relax: relax, clamp: clamp };
  root.YS.Thermal = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

/*
 * thermal.js — 离散导热 + 环境弛豫（docs/PHYSICS.md §6）
 *   · diffuse: T_i' = T_i + α Σ (k_i+k_j)/2 (T_j - T_i)，每对只算一次（E/S 邻居）
 *     默认对称温度交换 → 守恒 ΣT（§6.1 标定式，含审查 F01 修正 α=0.005 / 空气 k=0.002）
 *     opts.energyWeighted=true 时按比热加权 → 守恒 Σ c·T（供单元测试校验，见 ADR-0003）
 *   · relax: 向环境温度 T_amb 弛豫 + 暴露加成（§6.3）
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
    var i, j, x, y, row, ei, ej, K, q;

    for (i = 0; i < n; i++) next[i] = temp[i];

    for (y = 0; y < h; y++) {
      row = y * w;
      for (x = 0; x < w; x++) {
        i = row + x;
        ei = el[i];
        // 东邻居
        if (x + 1 < w) {
          j = i + 1; ej = el[j];
          if (!(ei === 1 && ej === 1)) {
            K = (k[ei] + k[ej]) * 0.5;
            q = alpha * K * (temp[j] - temp[i]);
            if (ew) { next[i] += q / c[ei]; next[j] -= q / c[ej]; }
            else { next[i] += q; next[j] -= q; }
          }
        }
        // 南邻居
        if (y + 1 < h) {
          j = i + w; ej = el[j];
          if (!(ei === 1 && ej === 1)) {
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
    var baseEmpty = Balance.PHYS.ENV_RELAX_EMPTY;
    var baseGas = Balance.PHYS.ENV_RELAX_GAS;
    var baseLiq = Balance.PHYS.ENV_RELAX_LIQUID;
    var baseSol = Balance.PHYS.ENV_RELAX_SOLID;
    var Em = Elements.ELEMENTS;
    var i, x, y, row, e, base, r, v, exposed;

    for (y = 0; y < h; y++) {
      row = y * w;
      for (x = 0; x < w; x++) {
        i = row + x;
        e = el[i];
        if (e === 1) base = baseEmpty;
        else {
          var st = Em[e].state;
          if (st === 'gas') base = baseGas;
          else if (st === 'liquid') base = baseLiq;
          else base = baseSol;
        }
        if (base > 0) {
          // 暴露加成：4 邻域存在 EMPTY
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

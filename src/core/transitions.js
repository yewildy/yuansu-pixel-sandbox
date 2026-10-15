/*
 * transitions.js — 相变判定（docs/PHYSICS.md §7 + §6.4 潜热平台）
 *   读 grid.nextTemp（导热结果），写 element / nextTemp / latent。
 *   两道闸串联：① 能量闸（latent ≥ LATENT_TICKS）② 随机闸（rnd < p(T)）。
 *   零 DOM。
 */
(function (root) {
  'use strict';

  var Balance = root.YS.Balance;
  var Elements = root.YS.Elements;
  var RNG = root.YS.RNG;
  var ID = Elements.ID;
  var ELS = Elements.ELEMENTS;
  var P = Balance.PHYS;

  function hasEmpty4(grid, i) {
    var el = grid.element, w = grid.w, h = grid.h;
    var x = i % w, y = (i / w) | 0;
    if (x > 0 && el[i - 1] === 1) return true;
    if (x < w - 1 && el[i + 1] === 1) return true;
    if (y > 0 && el[i - w] === 1) return true;
    if (y < h - 1 && el[i + w] === 1) return true;
    return false;
  }

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  /* 冷凝核探测（v1.2.0「接触成核」，见 docs/CONDENSATION-MODEL.md §3）：
   * 4 邻域存在「非气体元素」且该核温度低于 NUCLEUS_COLD_T → 判为冷核。
   *
   * 为什么必须这样：旧模型只看"蒸汽自身 T<100"，导致蒸汽一离开水面、被空气吹冷一点
   * 就整片变水滴砸下来 —— 用户实测「受冷太快，立刻变成水滴非常不合理」。
   * 现实里水蒸气凝结是**非均相**的：需要凝结核（尘粒、器壁）。Powder Game 也这么做——
   * 它的 STEAM 根本不会变水，变水的是 CLOUD，且必须"碰到 block/固体"才触发。
   * 于是：开阔空气中的蒸汽只以 HOMO_F 的极慢速率均相成核（保持气态、继续上升）；
   * 一旦贴到冷的锅盖/窗玻璃/岩壁，就全速凝结成水珠。 */
  function hasColdNucleus(grid, i) {
    var el = grid.element, t = grid.nextTemp, w = grid.w, h = grid.h;
    var x = i % w, y = (i / w) | 0;
    var cold = Balance.STEAM.NUCLEUS_COLD_T;
    var j, e;
    if (x > 0) { j = i - 1; e = el[j]; if (e !== 1 && ELS[e].state !== 'gas' && t[j] < cold) return true; }
    if (x < w - 1) { j = i + 1; e = el[j]; if (e !== 1 && ELS[e].state !== 'gas' && t[j] < cold) return true; }
    if (y > 0) { j = i - w; e = el[j]; if (e !== 1 && ELS[e].state !== 'gas' && t[j] < cold) return true; }
    if (y < h - 1) { j = i + w; e = el[j]; if (e !== 1 && ELS[e].state !== 'gas' && t[j] < cold) return true; }
    return false;
  }

  var transitions = 0;

  function process(grid, tick) {
    transitions = 0;
    var w = grid.w, h = grid.h;
    var el = grid.element, nt = grid.nextTemp, lat = grid.latent;
    var x, y, i, e, T, p;

    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) {
        i = y * w + x;
        e = el[i];
        if (e === 1) continue;
        T = nt[i];

        switch (e) {
          /* ---- 水 ↔ 汽 / 冰（★核心） ---- */
          case 18: /* WATER */
            if (T >= 100) {
              if (T <= 102) nt[i] = 100;
              if (lat[i] < 255) lat[i]++;
              if (lat[i] >= P.LATENT_TICKS_BOIL) {
                p = Math.min(Balance.WATER.EVAP_P_MAX,
                  Balance.WATER.EVAP_P_AT_100 + Balance.WATER.EVAP_SLOPE * (T - 100));
                if (RNG.hash01(x, y, ID.WATER * 131 + tick) < p) { el[i] = ID.STEAM; lat[i] = 0; transitions++; }
              }
            } else if (T <= Balance.WATER.FREEZE_T) {
              if (T >= Balance.WATER.FREEZE_T - 2) nt[i] = Balance.WATER.FREEZE_T;
              if (lat[i] < 255) lat[i]++;
              if (lat[i] >= P.LATENT_TICKS_ICE) {
                p = Math.min(Balance.WATER.FREEZE_P_MAX, Balance.WATER.FREEZE_P_SLOPE * (-T));
                if (RNG.hash01(x, y, ID.WATER * 131 + tick) < p) { el[i] = ID.ICE; lat[i] = 0; transitions++; }
              }
            } else {
              if (lat[i] > 0) lat[i]--;
              if (T >= Balance.WATER.EVAP_SURF_THRESH && T < 100 && hasEmpty4(grid, i)) {
                p = Balance.WATER.EVAP_SURF_COEF * (T - Balance.WATER.EVAP_SURF_THRESH);
                if (RNG.hash01(x, y, ID.WATER * 131 + tick) < p) { el[i] = ID.STEAM; lat[i] = 0; transitions++; }
              }
            }
            break;

          /* ---- 冰 → 水 ---- */
          case 6: /* ICE */
            if (T >= 0) {
              if (T <= 2) nt[i] = 0;
              if (lat[i] < 255) lat[i]++;
              if (lat[i] >= P.LATENT_TICKS_ICE) {
                p = clamp(Balance.ICE.MELT_P_BASE + Balance.ICE.MELT_P_SLOPE * T, 0, Balance.ICE.MELT_P_MAX);
                if (RNG.hash01(x, y, ID.ICE * 131 + tick) < p) { el[i] = ID.WATER; lat[i] = 0; transitions++; }
              }
            } else if (lat[i] > 0) lat[i]--;
            break;

          /* ---- 雪 → 水 ---- */
          case 13: /* SNOW */
            if (T >= 0) {
              if (T <= 2) nt[i] = 0;
              if (lat[i] < 255) lat[i]++;
              if (lat[i] >= P.LATENT_TICKS_SNOW) {
                p = clamp(Balance.SNOW.MELT_P_BASE + Balance.SNOW.MELT_P_SLOPE * T, 0, Balance.SNOW.MELT_P_MAX);
                if (RNG.hash01(x, y, ID.SNOW * 131 + tick) < p) { el[i] = ID.WATER; lat[i] = 0; transitions++; }
              }
            } else if (lat[i] > 0) lat[i]--;
            break;

          /* ---- 汽 → 水（冷凝，v1.2.0 接触成核） ---- */
          case 23: /* STEAM */
            if (T < 100) {
              if (T >= 98) nt[i] = 100;
              if (lat[i] < 255) lat[i]++;
              if (lat[i] >= P.LATENT_TICKS_COND) {
                p = clamp(Balance.STEAM.COND_COEF * (100 - T), 0, Balance.STEAM.COND_P_MAX);
                /* 无冷核（四周皆气体/真空）→ 只走极慢的均相成核；贴到冷壁面/冷液面 → 全速。
                 * v1.4.3：**深度过冷的蒸汽（T < HOMO_FULL_T）不再打折** —— 物理上过冷蒸汽
                 * 在任何壁面/微粒上都会凝结，只有接近饱和（~100°C）时才需要凝结核慢慢来。
                 * 旧实现让它以 0.2 折扣在 20°C 长期悬浮（用户实测："一堆只有 20 度的水蒸气"），
                 * 既不合理也让人以为"蒸汽是固定时间变回水"。 */
                if (!hasColdNucleus(grid, i) && T > Balance.STEAM.HOMO_FULL_T) p *= Balance.STEAM.HOMO_F;
                if (RNG.hash01(x, y, ID.STEAM * 131 + tick) < p) { el[i] = ID.WATER; lat[i] = 0; transitions++; }
              }
            } else if (lat[i] > 0) lat[i]--;
            break;

          /* ---- 岩浆 → 石头 ---- */
          case 20: /* LAVA */
            if (T <= Balance.LAVA.SOLIDIFY_T) {
              if (T >= Balance.LAVA.SOLIDIFY_T - 2) nt[i] = Balance.LAVA.SOLIDIFY_T;
              if (lat[i] < 255) lat[i]++;
              if (lat[i] >= P.LATENT_TICKS_LAVA) {
                p = clamp(Balance.LAVA.SOLIDIFY_SLOPE * (Balance.LAVA.SOLIDIFY_T - T),
                  Balance.LAVA.SOLIDIFY_P_MIN, Balance.LAVA.SOLIDIFY_P_MAX);
                if (RNG.hash01(x, y, ID.LAVA * 131 + tick) < p) { el[i] = ID.STONE; lat[i] = 0; transitions++; }
              }
            } else if (lat[i] > 0) lat[i]--;
            break;

          /* ---- 石头 → 岩浆 ---- */
          case 3: /* STONE */
            if (T >= Balance.STONE.MELT_T) {
              p = clamp(Balance.STONE.MELT_SLOPE * (T - Balance.STONE.MELT_T), 0, Balance.STONE.MELT_P_MAX);
              if (RNG.hash01(x, y, ID.STONE * 131 + tick) < p) { el[i] = ID.LAVA; transitions++; }
            }
            break;

          /* ---- 沙 → 玻璃 ---- */
          case 9: /* SAND */
            if (T >= Balance.SAND.GLASS_T) {
              if (RNG.hash01(x, y, ID.SAND * 131 + tick) < Balance.SAND.GLASS_P) { el[i] = ID.GLASS; transitions++; }
            }
            break;

          /* ---- 玻璃 → 岩浆 ---- */
          case 4: /* GLASS */
            if (T >= Balance.GLASS.MELT_T) {
              if (RNG.hash01(x, y, ID.GLASS * 131 + tick) < Balance.GLASS.MELT_P) { el[i] = ID.LAVA; transitions++; }
            }
            break;

          /* ---- 金属 → 岩浆 ---- */
          case 5: /* METAL */
            if (T >= Balance.METAL.MELT_T) {
              if (RNG.hash01(x, y, ID.METAL * 131 + tick) < Balance.METAL.MELT_P) { el[i] = ID.LAVA; transitions++; }
            }
            break;

          /* ---- 盐 → 岩浆 ---- */
          case 11: /* SALT */
            if (T >= Balance.SALT.MELT_T) {
              if (RNG.hash01(x, y, ID.SALT * 131 + tick) < Balance.SALT.MELT_P) { el[i] = ID.LAVA; transitions++; }
            }
            break;

          /* ---- 液氮 → 空气（氮气回归大气；见 §7.8，修复"凭空造水"） ---- */
          case 22: /* LN2 */
            if (T >= Balance.LN2.BOIL_T) {
              if (lat[i] < 255) lat[i]++;
              if (lat[i] >= P.LATENT_TICKS_LN2) {
                p = clamp(Balance.LN2.BOIL_SLOPE * (T - Balance.LN2.BOIL_T), 0, Balance.LN2.BOIL_P_MAX);
                /* 产物为 AIR（原地写低温空气格，温度随本格保留）——不再产出 STEAM，
                 * 否则会经 §7.2 冷凝成水 → "倒一片液氮凭空造水"（守恒被破坏）。 */
                if (RNG.hash01(x, y, ID.LN2 * 131 + tick) < p) { el[i] = ID.AIR; lat[i] = 0; transitions++; }
              }
            } else if (lat[i] > 0) lat[i]--;
            break;

          default: break;
        }
      }
    }
  }

  var api = { process: process, count: function () { return transitions; } };
  root.YS.Transitions = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

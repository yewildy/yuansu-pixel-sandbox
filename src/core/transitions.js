/*
 * transitions.js — 相变判定（docs/PHYSICS.md §7 + §6.4 潜热平台 + docs/CONDENSATION-MODEL.md §6）
 *   读 grid.nextTemp（导热结果），写 element / nextTemp / latent。
 *   两道闸串联：① 能量闸（latent ≥ LATENT_TICKS）② 随机闸（rnd < p(T)）。
 *   **例外：蒸汽凝结不走能量闸**（v1.5.1）—— 改为纯温度驱动，见 process() 的 STEAM case。
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
    var x, y, i, e, T, p, sub, spend;

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
                if (RNG.hash01(x, y, ID.WATER * 131 + tick) < p) { el[i] = ID.STEAM; lat[i] = Balance.STEAM.LATENT_MAX; transitions++; }
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
              /* v1.5.1：**删除低于 100 °C 的表面蒸发路径**。
               * 旧代码在这里让 60–99 °C 的水变成同温度的 STEAM（实测 70 °C 水面产出 43.5 °C
               * 的"蒸汽"），违反用户要求的不变式「水蒸气是一百度以上的」，而且那种蒸汽
               * 一生成就低于饱和温度、按温度判据立刻又凝结回去，纯属来回空转。
               * 现在 STEAM 的唯一来源是上面的沸腾分支（T ≥ 100 °C）。
               * 物理上 60 °C 的水确实会蒸发，但那是看不见的水汽（应并入空气湿度场，
               * 本作无湿度场）；STEAM 元素代表可见白汽（沸腾产物），与原版 Powder Game 一致。 */
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

          /* ---- 汽 → 水（冷凝）★v1.5.1 改为**纯温度驱动** ----
           * 用户实测两条：「水变成蒸汽后就是固定时间会回归，而不是等冷却再凝结成水」
           * 与「蒸汽必须是一百度以上的，冷到什么温度才落下去，温度要有连贯性」。
           * 旧实现 = 累积 lat 达 LATENT_TICKS_COND=24 后才掷签 → 观感就是"固定时间自动变水"，
           * 且蒸汽的显热被导热瞬间倒给空气（见 balance.js GAS_GAS_R），于是先掉到 20 °C
           * 再变回 20 °C 的水 —— 上去一趟白干，锅里的水每次都要从 20 °C 重新加热。
           * 新规则（详见 docs/CONDENSATION-MODEL.md §6）：
           *   ① T ≥ COND_T(100) → 过热蒸汽，不凝结（只有冷却能触发相变）；
           *   ② T ∈ [COND_T-3, COND_T) → 潜热平台：凝结放热把温度钉在饱和温度，
           *      故凝出的水就是 ~100 °C，水→汽→水 全程温度连贯；
           *   ③ T < COND_T → p = COND_P_BASE + COND_P_SLOPE × 过冷度，**无 tick 门槛**；
           *   ④ 近饱和窗口内缺凝结核 → 乘 HOMO_F（羽流有时间上升）；深度过冷 → 到处都凝。 */
          case 23: /* STEAM */
            /* ★★v1.7.0：此处曾经有过一个"烟道内不结露"的分支（v1.6.10：
             *   `if (Air.flueCell(i)) { if (lat[i]===0) lat[i]=1; }`），它把烟道里蒸汽的
             *   潜热预算永久钉住 ⇒ 蒸汽永不凝结 ⇒ 跑出了 **37 °C 的"蒸汽"**
             *   （实测温度区间 37~182 °C，中位 100 °C）。
             *   真实物理：**100 °C 以下的水蒸气就是水**，那是造假的数字，不是烟道贯通。
             *   现在已**整段删除** —— 蒸汽该凝结就凝结，能不能走完全程由两件真事决定：
             *     ① 烟道流速（flue.js：Bernoulli 抽力 ⇒ 2~8 格/tick，不再是 1 格/tick）；
             *     ② 气-固换热系数（thermal.js::GAS_SOLID_R，真实烟道每米只降 1~2 °C，
             *        旧值等效几百 °C/米 —— 那个系数才是"蒸汽爬不完"的真凶）。
             *   于是本文件不再依赖 Air.flueCell 之类的烟道状态：相变判据对无烟道/有烟道
             *   完全一致，V24/V25/V38 等判据因此是**同一个物理**下的读数。 */
            /* v1.6.0 ★潜热预算：只要还有预算，蒸汽就把"被空气抽走的显热"用凝结潜热补回来
             * （温度钉回饱和温度），补回来的代价按**热量**记账 —— 于是：
             *   · 空气被实实在在加热（热量来自潜热，不是凭空产生：预算是有限的）；
             *   · 蒸汽自身始终 ≥ ~100 °C，不会变成"20 度的蒸汽"（v1.5.1 的要求保持）；
             *   · 周围越冷 → 每 tick 被抽走的热越多 → 预算耗得越快 → 越早凝结落下来。
             * 这正是用户要的"等冷到什么温度才会落下去"，而且**凝结高度会随上方空气变暖而抬升**
             * （暖柱里每 tick 抽走的热少 → 预算耐久 → 蒸汽升得更高），不再是"一堵固定的冷墙"。 */
            if (lat[i] > 0) {
              if (T < Balance.STEAM.COND_T) {
                spend = (Balance.STEAM.COND_T - T) * Balance.STEAM.LATENT_SPEND;
                lat[i] = (lat[i] > spend) ? lat[i] - spend : 0;
                nt[i] = Balance.STEAM.COND_T;      // 潜热补温：钉回饱和温度
              }
              break;                               // 仍有潜热 → 不凝结
            }
            if (T >= Balance.STEAM.COND_T) {
              if (lat[i] > 0) lat[i]--;
              break;
            }
            if (T >= Balance.STEAM.COND_T - Balance.STEAM.PLATEAU) nt[i] = Balance.STEAM.COND_T;
            sub = Balance.STEAM.COND_T - T;
            p = Balance.STEAM.COND_P_BASE + Balance.STEAM.COND_P_SLOPE * sub;
            if (p > Balance.STEAM.COND_P_MAX) p = Balance.STEAM.COND_P_MAX;
            if (sub < Balance.STEAM.NUCLEUS_WINDOW && !hasColdNucleus(grid, i)) p *= Balance.STEAM.HOMO_F;
            if (RNG.hash01(x, y, ID.STEAM * 131 + tick) < p) { el[i] = ID.WATER; lat[i] = 0; transitions++; }
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

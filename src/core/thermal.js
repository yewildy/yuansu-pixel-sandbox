/*
 * thermal.js — 离散导热 + 环境弛豫（docs/PHYSICS.md §6 / docs/PHYSICS-AIR.md §4）
 *   · diffuse: T_i' = T_i + α Σ K_ij (T_j - T_i)，每对只算一次（E/S 邻居）
 *     配对系数 K 采用「双轨制」（PHYSICS-AIR.md §4.1）：
 *       两格皆 AIR → K = AIR.SELF_K (=0.5)；且 |ΔT| < AIR.CONDUCT_EPS 时跳过（近平衡降载）
 *       其余配对   → K = (k_i + k_j)/2（沿用 §6.1）
 *     默认对称温度交换 → 守恒 ΣT（§6.1 标定式，含审查 F01 修正 α=0.005）
 *     opts.energyWeighted=true 时按比热加权 → 守恒 Σ c·T（供单元测试校验，见 ADR-0003）
 *   · contactFlux（v1.4.0 新增）：火焰接触/辐射 + 热气体对流的离散近似传热
 *     （docs/COMBUSTION-MODEL.md v1.4.0 补记；⚠ 不守恒，modeling 近似）
 *   · relax: 向环境温度 T_amb 弛豫 + 暴露加成（§6.3）；AIR 用 AIR.RELAX（不乘暴露），
 *     顶部 SKY_ROWS 行的 AIR 用 AIR.SKY_RELAX 散热（天空热沉，PHYSICS-AIR.md §4.4）；
 *     **燃烧温度重锚**（v1.4.0）：锚定火焰（latent>0）钳制到燃料 burnTemp，
 *     EMBER 钳制到 EMBER.TEMP —— 火焰/火种温度由化学放热钳定，不由导热平衡决定
 *   · clamp: 温度钳制（§13.4）
 * 零 DOM。
 */
(function (root) {
  'use strict';

  var Balance = root.YS.Balance;
  var Elements = root.YS.Elements;
  var ID = Elements.ID;

  /* Reactions 惰性获取（thermal 先于 reactions 加载，见 index.js 顺序），
   * 避免加载顺序依赖；fuelOf / hasOxygen 已由 reactions.js 导出。 */
  function fuelOf(id) {
    var R = root.YS.Reactions;
    return R ? R.fuelOf(id) : null;
  }
  function hasOxygen(grid, i) {
    var R = root.YS.Reactions;
    return R ? R.hasOxygen(grid, i) : false;
  }

  /* 导热：把结果写入 grid.nextTemp（不修改 grid.temp）
   *
   * v1.2.0：生产路径改为**体积热容加权**（守恒 Σ C·T，C = 比热 × 密度）。
   *   对每一对 (i,j)：
   *     r   = α·K·C_REF·(C_i+C_j)/(C_i·C_j)        —— 松弛因子，钳制 ≤ CONDUCT_R_MAX
   *     ΔT_i = +r·C_j/(C_i+C_j)·(T_j − T_i)
   *     ΔT_j = −r·C_i/(C_i+C_j)·(T_j − T_i)
   *   恒有 C_i·ΔT_i + C_j·ΔT_j = 0（严格守恒），且 r ≤ 0.2 ⇒ 4 邻居也不会越过平衡点。
   *
   *   为什么要换：旧式 ΔT_i = α·K·(T_j−T_i) 等价于"C_i = C_j"，即把 1 格空气和 1 格岩石
   *   的热容当成一样。实测 1 格 1000 ℃ 岩石放进 64×64 空气场，整场只升温不到 0.3 ℃，
   *   岩浆上方稳态也只有 30–40 ℃ —— 用户反馈「空气温度不能传导 / 热空气不往上走」的根因。
   *   换用体积热容后，空气（C≈1.2e3）相对岩石（C≈2.2e6）热容极小，会被热源迅速拉到
   *   接近热源温度，而热源几乎不降温 —— 与真实世界一致。
   *
   *   opts.energyWeighted=true 保留 v1.1 的对称/比热加权公式（对照与旧测试用）。 */
  function diffuse(grid, opts) {
    opts = opts || {};
    var alpha = opts.alpha !== undefined ? opts.alpha : Balance.PHYS.HEAT_COUPLING;
    var ew = !!opts.energyWeighted;
    var volMode = Balance.PHYS.VOLUME_HEAT_CONDUCTION && !ew;
    var w = grid.w, h = grid.h, n = grid.n;
    var el = grid.element, temp = grid.temp, next = grid.nextTemp;
    var k = Elements.conductivity, c = Elements.specificHeat;
    var C = Elements.volHeat, iC = Elements.invVolHeat;
    var CREF = Balance.PHYS.HEAT_CAP_REF, rMax = Balance.PHYS.CONDUCT_R_MAX;
    var selfK = Balance.AIR.SELF_K, selfR = Balance.AIR.SELF_R, eps = Balance.AIR.CONDUCT_EPS;
    var aSelf = alpha * selfK;
    var i, j, x, y, row, ei, ej, K, q, dT, ci, cj, sum, r, f;

    for (i = 0; i < n; i++) next[i] = temp[i];

    for (y = 0; y < h; y++) {
      row = y * w;
      for (x = 0; x < w; x++) {
        i = row + x;
        ei = el[i];
        // 东邻居
        if (x + 1 < w) {
          j = i + 1; ej = el[j];
          if (volMode) {
            dT = temp[j] - temp[i];
            if (!(ei === 1 && ej === 1 && dT < eps && dT > -eps)) {   // 均匀空气近平衡 → 跳过
              ci = C[ei]; cj = C[ej]; sum = ci + cj;
              if (ei === 1 && ej === 1) r = selfR;      // 静止空气是热的不良导体
              else r = alpha * ((k[ei] + k[ej]) * 0.5) * CREF * sum * iC[ei] * iC[ej];
              if (r > rMax) r = rMax;
              f = r / sum;
              next[i] += f * cj * dT;
              next[j] -= f * ci * dT;
            }
          } else if (ei === 1 && ej === 1) {
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
          if (volMode) {
            dT = temp[j] - temp[i];
            if (!(ei === 1 && ej === 1 && dT < eps && dT > -eps)) {
              ci = C[ei]; cj = C[ej]; sum = ci + cj;
              if (ei === 1 && ej === 1) r = selfR;      // 静止空气是热的不良导体
              else r = alpha * ((k[ei] + k[ej]) * 0.5) * CREF * sum * iC[ei] * iC[ej];
              if (r > rMax) r = rMax;
              f = r / sum;
              next[i] += f * cj * dT;
              next[j] -= f * ci * dT;
            }
          } else if (ei === 1 && ej === 1) {
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
        /* ---- 燃烧温度重锚（v1.4.0，A1；docs/COMBUSTION-MODEL.md v1.4.0 补记）----
         * 锚定火焰（FIRE 且 latent>0，燃料驱动燃烧模型 §6.1）与 EMBER 永燃火种（B2）
         * 的温度由**化学放热**钳定，不由导热平衡决定 —— 只要还在烧，温度就必须回到
         * 燃烧温度，否则热源会"死"。
         *
         * 旧实现靠 volHeat[FIRE]=1e6 的"等效放热热容" hack：对空气有效（空气热容极小，
         * 火不会被拉低），但火焰一接触金属/水等大热容物体就被体积热容加权导热拉到
         * 平衡温度且**永不恢复** —— 实测铁锅+柴火烧 600 tick，水温卡在 34.7°C 不再上升，
         * 根因即此（V4 用 1200°C 岩浆能过是因为岩浆热容大且持续，掩盖了火焰的问题）。
         *
         * **氧气条件**（关键，守住缺氧红线）：燃烧是燃料 + 氧气的化学反应，无氧即无放热
         * （任务书原文"只要还有燃料和氧气"）。故仅当该火焰格仍通气（hasOxygen，
         * Chebyshev-2 可达 AIR 且不穿墙）时才钳制；无氧火焰自然冷却 → 密封盒/燃料块
         * 深处的火不会把邻接燃料烤到燃点（热解引燃豁免氧气门槛，见 §9.2），
         * N1-4 密封自熄 / N1-8 无氧不点燃两条红线因此保持成立。
         * EMBER 是游戏性热源（不耗氧、不灭），无条件钳制。
         * 自由火焰（latent==0，瓦斯/爆炸/手绘）不钳制，仍按环境弛豫。 */
        if (e === ID.FIRE) {
          if (grid.latent[i] > 0 && hasOxygen(grid, i)) {
            var fu = fuelOf(grid.latent[i]);
            if (fu) nt[i] = fu.burnTemp;
          }
        } else if (e === ID.EMBER) {
          nt[i] = Balance.EMBER.TEMP;      // 永燃火种：恒 900°C 游戏性热源
        }
      }
    }
  }

  /* ============================================================
   * 接触传热（v1.4.0，A2；docs/COMBUSTION-MODEL.md v1.4.0 补记）
   *   在 diffuse 之后、relax 之前由 engine.step 调用。
   *   两类热源 → 4 邻域**非气体**格（只加热不冷却，源温 ≤ 目标温时跳过）：
   *     · FIRE 格（任意火，含自由火焰）：ΔT = FIRE.CONTACT_K × (T_fire − T_target)
   *       —— 火舌舔舐固体/液体的直接加热（火焰接触/辐射的离散近似）；
   *     · 气体格（state==='gas'，含 AIR/STEAM/SMOKE/GAS）且 T ≥ PHYS.GAS_FLUX_MIN_T：
   *       ΔT = PHYS.GAS_CONTACT_K × (T_gas − T_target)
   *       —— 热气体对流传热：CA 中 1 格气体是"对流团"的代理，持续被火焰/热源补给，
   *         这是锅上方热空气层能把热量压进锅底/锅壁的关键。
   *
   *   **可燃物豁免**（守住缺氧红线）：目标格若为可燃物（flammability>0 且非气态）
   *   则跳过 —— 燃料点火由燃烧模型负责（§9.1 通气判据 + §9.2 热解引燃）；
   *   接触传热若直接把燃料烤到燃点，"无氧也引燃"就会绕过 N1-4 / N1-8 两条红线。
   *
   *   ⚠ 本 pass **不守恒**（modeling 近似）：热量来自火焰化学 reservoir 与持续补给的
   *   热气体，不参与 Σ C·T 账目。公式天然保证"传热永不超过热源温度"
   *   （ΔT = K·(T_src − T_dst) ≤ T_src − T_dst，且源冷时跳过），单 tick 传热亦有界
   *   （K<1 ⇒ |ΔT| < |T_src − T_dst|，不可能越过热源温度）。
   * ============================================================ */
  function contactFlux(grid) {
    var w = grid.w, h = grid.h;
    var el = grid.element, temp = grid.temp, nt = grid.nextTemp;
    var Em = Elements.ELEMENTS;
    var kFire = Balance.FIRE.CONTACT_K;
    var kGas = Balance.PHYS.GAS_CONTACT_K;
    var minGasT = Balance.PHYS.GAS_FLUX_MIN_T;
    var FIRE = ID.FIRE;
    /* 查找表（惰性构建一次；避免热路径字符串比较 state）：
     * isGas[q]     —— q 为气态元素（传热目标必须是"非气体"）；
     * isFuelTgt[q] —— q 为可燃物（flammability>0 且非气态，判据同 movement.js
     *   ::adjFlammableSolid）→ **不作为传热目标**：燃料的点火由燃烧模型负责
     *   （§9.1 通气判据 + §9.2 热解引燃），接触传热若直接把燃料烤到燃点，
     *   就会让"无氧也引燃"绕过密封自熄 / 无氧不点燃红线（N1-4 / N1-8 回归）。 */
    if (!contactFlux._tab || contactFlux._tabLen < 32) {
      var tg = new Uint8Array(32), tf = new Uint8Array(32);
      for (var q = 1; q <= 31; q++) {
        var E = Em[q];
        if (!E) continue;
        if (E.state === 'gas') tg[q] = 1;
        if (E.flammability > 0 && E.state !== 'gas') tf[q] = 1;
      }
      contactFlux._tab = { gas: tg, fuel: tf };
      contactFlux._tabLen = 32;
    }
    var isGas = contactFlux._tab.gas, isFuel = contactFlux._tab.fuel;
    var i, x, y, row, e, Ts, K, j, dT;

    for (y = 0; y < h; y++) {
      row = y * w;
      for (x = 0; x < w; x++) {
        i = row + x;
        e = el[i];
        if (e === FIRE) { K = kFire; }
        else if (isGas[e] && temp[i] >= minGasT) { K = kGas; }
        else continue;
        Ts = temp[i];                       // 源温取已提交温度场（对重锚火焰即燃烧温度）
        /* 4 邻域非气体、非可燃物格加热（越界邻格跳过） */
        if (x > 0) {
          j = i - 1; e = el[j];
          if (!isGas[e] && !isFuel[e]) { dT = Ts - nt[j]; if (dT > 0) nt[j] += K * dT; }
        }
        if (x < w - 1) {
          j = i + 1; e = el[j];
          if (!isGas[e] && !isFuel[e]) { dT = Ts - nt[j]; if (dT > 0) nt[j] += K * dT; }
        }
        if (y > 0) {
          j = i - w; e = el[j];
          if (!isGas[e] && !isFuel[e]) { dT = Ts - nt[j]; if (dT > 0) nt[j] += K * dT; }
        }
        if (y < h - 1) {
          j = i + w; e = el[j];
          if (!isGas[e] && !isFuel[e]) { dT = Ts - nt[j]; if (dT > 0) nt[j] += K * dT; }
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

  var api = { diffuse: diffuse, relax: relax, clamp: clamp, contactFlux: contactFlux };
  root.YS.Thermal = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

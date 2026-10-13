/*
 * movement.js — 物态移动（docs/PHYSICS.md §5）
 *   粉末 / 液体 / 气体移动；自下而上扫描，水平方向逐帧交替；
 *   每格每 tick 至多移动一次（moveStamp 递增 tickId）；移动一律为交换（§13.1 质量守恒）。
 *   气体：风平流（§5.3-1）→ 浮力上升 → 斜上 → 水平扩散；顶边逸出（§13.3）。
 *   零 DOM。
 */
(function (root) {
  'use strict';

  var Balance = root.YS.Balance;
  var Elements = root.YS.Elements;
  var RNG = root.YS.RNG;
  var ELS = Elements.ELEMENTS;
  var ID = Elements.ID;

  function enterableDown(selfDens, target) {
    if (target === 1) return true;
    var E = ELS[target];
    return E.movable && E.density < selfDens;
  }
  function enterableUp(selfDens, target) {
    if (target === 1) return true;
    var E = ELS[target];
    return E.movable && E.density > selfDens;
  }
  function enterableGas(selfDens, target) {
    if (target === 1) return true;
    var E = ELS[target];
    return E.movable && E.density > selfDens;
  }
  function enterableSide(selfDens, target) {
    if (target === 1) return true;
    var E = ELS[target];
    return E.movable && E.state !== 'gas' && E.density < selfDens;
  }

  /* ==========================================================================
   * 浮力 / 介质阻尼 / 热对流（v1.2.0，见 docs/PHYSICS-AIR.md §12）
   *
   * 旧实现把"下沉"做成确定性的一格/tick 交换：只要目标格密度更小就 100% 换过去。
   * 结果水沉入油、沙沉入水的速度与真空自由落体完全一样 —— 用户实测指出的正是这点。
   *
   * 这里补上 Stokes 终速的离散近似：净加速度 a = g·(ρ_self − ρ_med)/ρ_self，
   * 于是"能否移动"不再是布尔量，而是概率 f：
   *   f = |ρ_self − ρ_med| / ρ_self，  目标格为 AIR（真空）时 f = 1（保持原有手感）。
   * 例：水(1000) 沉入油(900) → f=0.10；沙(1600) 沉入水(1000) → f=0.375。
   *
   * 热对流：液体/气体的有效密度随温度膨胀 ρ_eff = ρ·(1 − β·(T − T_amb))，
   * 上下交换判据改用 ρ_eff 比较 → 锅底的热水自动上浮、表层冷水下沉，形成对流环。
   * 同种液体之间不存在"分层"顾虑，给一个更高的下限 SAME_CONVECT_MIN_F 让对流跑得动。
   * ========================================================================== */
  var BUOY = Balance.BUOY;

  /* 有效密度：仅液体/气体随温度膨胀（固体/粉末不参与热对流，且它们本来就不上浮） */
  function effDensity(e, T, amb) {
    var E = ELS[e];
    var st = E.state;
    if (st !== 'liquid' && st !== 'gas') return E.density;
    var dT = T - amb;
    var m = BUOY.CONVECT_MIN_DT;
    if (dT <= m && dT >= -m) return E.density;      // 近环境温 → 不修正，避免逐格抖动
    return E.density * (1 - BUOY.THERMAL_BETA * dT);
  }

  /* 沉降/上浮概率因子：dSelf = 运动格有效密度，dMed = 介质有效密度 */
  function buoyF(dSelf, dMed, sameElement) {
    var diff = dSelf - dMed;
    if (diff < 0) diff = -diff;
    /* 密度完全相等（同种且同温）→ 净浮力为 0，必须返回 0。
     * 若在这里返回 MIN_F，同种同温的液体会无休止地自我搅拌（实测水柱内部乱翻），
     * 且会让"水沉入油"被同元素下限抬速 —— 阻尼比从理论 0.10 退化到 0.65。 */
    if (diff < 1e-6) return 0;
    var f = diff / dSelf;                            // 分母恒为"运动物体自身"（净加速度/自重）
    var lo = sameElement ? BUOY.SAME_CONVECT_MIN_F : BUOY.MIN_F;
    return f < lo ? lo : f;
  }

  /* 目标格为真空（AIR）→ 无阻尼，保持 v1.1 的自由落体手感 */
  function mediumFactor(grid, i, j, dSelf, amb, sameElement) {
    if (!BUOY.ENABLE) return 1;
    var tj = grid.element[j];
    if (tj === 1) return 1;
    return buoyF(dSelf, effDensity(tj, grid.temp[j], amb), sameElement);
  }

  /* 向下进入 j 格的浮力因子；0 = 不可进入。
   * 统一处理三种介质：真空(1) / 流体(按温度修正的有效密度) / 粉末(按标称密度，保留 v1.1 判据)。 */
  function downFactor(grid, j, dSelf, amb, selfId) {
    var tj = grid.element[j];
    if (tj === 1) return 1;
    if (!BUOY.ENABLE) return enterableDown(dSelf, tj) ? 1 : 0;
    var T = ELS[tj];
    if (!T.movable) return 0;
    if (T.state === 'liquid' || T.state === 'gas') {
      var d = effDensity(tj, grid.temp[j], amb);
      return dSelf > d ? buoyF(dSelf, d, tj === selfId) : 0;
    }
    if (T.density < dSelf) return buoyF(dSelf, T.density, false);
    return 0;
  }

  /* 介质阻尼闸门（v1.2.0）：
   * 先按"正下方介质"算出浮力因子 f，再以概率 f 决定本格这一 tick 是否允许移动。
   * 为什么用闸门而不是在每个方向各乘一次 f：后者会让正下(0.10)+斜下(0.09×2)+水平(0.072×2)
   * 叠加回 ~0.36，实测"水沉油"只比真空慢 39%，肉眼看不出差别 —— 正是用户反馈的问题。
   * 闸门方式下整体速度严格 = f × 原速度（水沉油 0.10，肉眼是"明显慢十倍"）。 */
  function mediumGate(grid, i, y, w, h, dEff, amb, selfId) {
    if (!BUOY.ENABLE) return 1;
    if (y >= h - 1) return 1;
    var tj = grid.element[i + w];
    if (tj === 1) return 1;                       // 真空 → 无阻尼
    var T = ELS[tj];
    if (!T.movable) return 1;                     // 下方是固体 → 交给侧向逻辑，不额外阻尼
    var d = (T.state === 'liquid' || T.state === 'gas') ? effDensity(tj, grid.temp[i + w], amb) : T.density;
    var diff = dEff - d;
    if (diff < 0) diff = -diff;
    if (diff < 1e-6) return 0;                    // 同种同温介质 → 净浮力 0，静止
    var f = diff / dEff;
    var lo = (tj === selfId) ? BUOY.SAME_CONVECT_MIN_F : BUOY.MIN_F;
    return f < lo ? lo : f;
  }

  /* 向上交换（上浮）的浮力因子；0 = 不可。只对流体介质成立（不顶穿固体/粉末）。 */
  function upFactor(grid, j, dSelf, amb, selfId) {
    var tj = grid.element[j];
    if (tj === 1) return 0;
    var T = ELS[tj];
    if (!T.movable) return 0;
    if (T.state !== 'liquid' && T.state !== 'gas') return 0;
    if (!BUOY.ENABLE) return T.density > dSelf ? 1 : 0;
    var d = effDensity(tj, grid.temp[j], amb);
    return d > dSelf ? buoyF(dSelf, d, tj === selfId) : 0;
  }

  function swapMove(grid, i, j, tick) {
    grid.swap(i, j);
    grid.moveStamp[i] = tick;
    grid.moveStamp[j] = tick;
  }

  function vent(grid, i, tick, ambient) {
    grid.element[i] = 1;
    grid.temp[i] = ambient;
    grid.latent[i] = 0;
    grid.age[i] = 0;
    grid.moveStamp[i] = tick;
  }

  /* 4 邻域是否存在「可燃物」——火焰贴其上时锚定，以便点燃燃料（见 §7 / ADR-0006）。
   *
   * v1.2.0 修订：判据由「不可移动固体」放宽为「非气体燃料」。
   * 原判据 `!E.movable` 把 DUST（粉末）/ OIL（液体）/ SEED 全部排除在外，
   * 于是手绘火苗贴着一坨油或粉尘时仍然按气态上浮，1 tick 就飘走、来不及点燃 ——
   * 这正是配对实验 23 条 FAIL 中「火离开燃料」一类的根因（DUST/OIL/SEED × FIRE 全军覆没）。
   * 真实物理里油池火与粉尘火同样附着在燃料表面燃烧，故改为：只要邻接可燃物且该物不是气态，
   * 火焰即锚定；GAS（瓦斯）除外 —— 瓦斯火应保持爆燃扩散，否则会钉死在气团里。 */
  function adjFlammableSolid(grid, i) {
    var el = grid.element, w = grid.w, h = grid.h;
    var x = i % w, y = (i / w) | 0, t, E;
    if (x > 0) { t = el[i - 1]; E = ELS[t]; if (t > 1 && E.flammability > 0 && E.state !== 'gas') return true; }
    if (x < w - 1) { t = el[i + 1]; E = ELS[t]; if (t > 1 && E.flammability > 0 && E.state !== 'gas') return true; }
    if (y > 0) { t = el[i - w]; E = ELS[t]; if (t > 1 && E.flammability > 0 && E.state !== 'gas') return true; }
    if (y < h - 1) { t = el[i + w]; E = ELS[t]; if (t > 1 && E.flammability > 0 && E.state !== 'gas') return true; }
    return false;
  }

  function stepCell(grid, ctx, i, x, y) {
    var el = grid.element, tick = ctx.tick, w = grid.w, h = grid.h;
    var e = el[i];
    if (e === 1) return;
    if (grid.moveStamp[i] === tick) return;
    var E = ELS[e];
    if (!E.movable) return;
    var dens = E.density;
    var st = E.state, s, dx, nx, j;
    var amb = ctx.ambient !== undefined ? ctx.ambient : Balance.PHYS.AMBIENT_T;
    /* 有效密度：粉末/固体恒等于标称密度；液体/气体随温度膨胀（热对流驱动量） */
    var dEff = (st === 'liquid' || st === 'gas') ? effDensity(e, grid.temp[i], amb) : dens;

    /* 介质阻尼闸门：浸在另一种流体里时，整格的移动机会按浮力因子缩放（水沉油 → 慢 10 倍）。
     * gate === 0 表示"正下方是同种同温介质"（净浮力 0）→ 禁止下沉/斜下/水平，只留上浮通道。 */
    var gate = mediumGate(grid, i, y, w, h, dEff, amb, e);
    var stalled = (gate <= 0);
    if (!stalled && gate < 1 && RNG.hash01(x, y, e * 179 + tick) >= gate) return;

    if (st === 'powder') {
      if (stalled) return;                                    // 同种同温介质 → 静止
      if (y < h - 1) {
        j = i + w;
        if (downFactor(grid, j, dEff, amb, e) > 0) { swapMove(grid, i, j, tick); return; }
        /* 注意：方向 salt 必须与上面的概率 salt 不同，否则同一次哈希被复用会引入方向偏置 */
        var order = RNG.hash01(x, y, e * 157 + tick) < 0.5 ? -1 : 1;
        for (s = 0; s < 2; s++) {
          dx = s === 0 ? order : -order;
          nx = x + dx;
          if (nx >= 0 && nx < w) {
            j = i + dx + w;
            if (downFactor(grid, j, dEff, amb, e) > 0 &&
              RNG.hash01(x, y, e * 193 + tick + s) < E.repose) {
              swapMove(grid, i, j, tick); return;
            }
          }
        }
      }
      return;
    }

    if (st === 'liquid') {
      /* 1. 正下（判据用有效密度 → 同种液体的"我更热更轻"不会往下钻，反而在第 2 步上浮） */
      if (!stalled && y < h - 1) {
        j = i + w;
        if (downFactor(grid, j, dEff, amb, e) > 0) { swapMove(grid, i, j, tick); return; }
      }
      /* 2. 上浮：上方介质更重（含"同种但更冷"）→ 按浮力因子交换，形成热对流环。
       *    这一步**不受闸门限制** —— 同种同温液体之间的热量搬运正靠它（锅里的水才会循环）。 */
      if (y > 0) {
        j = i - w;
        var fu = upFactor(grid, j, dEff, amb, e);
        if (fu >= 1) { swapMove(grid, i, j, tick); return; }
        if (fu > 0 && RNG.hash01(x, y, e * 101 + tick) < fu) { swapMove(grid, i, j, tick); return; }
      }
      if (stalled) return;                                    // 同种同温：不下沉、不侧移
      /* 3. 斜下 p = mobility */
      if (y < h - 1) {
        var order2 = RNG.hash01(x, y, e * 163 + tick) < 0.5 ? -1 : 1;
        for (s = 0; s < 2; s++) {
          dx = s === 0 ? order2 : -order2;
          nx = x + dx;
          if (nx >= 0 && nx < w) {
            j = i + dx + w;
            if (downFactor(grid, j, dEff, amb, e) > 0 &&
              RNG.hash01(x, y, e * 211 + tick + s) < E.mobility) {
              swapMove(grid, i, j, tick); return;
            }
          }
        }
      }
      /* 4. 水平铺展 p = mobility × 0.8（阻尼已由上方的 mediumGate 统一施加） */
      var orderh = RNG.hash01(x, y, e * 131 + tick) < 0.5 ? -1 : 1;
      for (s = 0; s < 2; s++) {
        dx = s === 0 ? orderh : -orderh;
        nx = x + dx;
        if (nx >= 0 && nx < w) {
          j = i + dx;
          if (enterableSide(dens, el[j]) && RNG.hash01(x, y, e * 307 + tick + s) < E.mobility * 0.8) {
            swapMove(grid, i, j, tick); return;
          }
        }
      }
      return;
    }

    if (st === 'gas') {
      /* 0. 燃料火焰锚定（docs/COMBUSTION-MODEL.md §7 / ADR-0006）：
       *    来自固体/粉末/液体燃料的火焰（latent>0）留在原地、不上升、不受风，
       *    以便烧尽后开出 AIR 通道、成为下一层燃料的相邻火源（解决 N1 根因 R-3 时序死锁）。
       *    自由火焰（latent==0，瓦斯/爆炸/手绘）保持气态行为。 */
      if (e === ID.FIRE && grid.latent[i] > 0) return;
      /* 0b. 自由火焰（手绘/爆炸）紧贴可燃固体时也锚定：否则它在 1 tick 内上浮飘走，
       *     来不及点燃燃料（N1 开放蔓延探针的失败点）。燃料烧尽/离开后即恢复上浮。 */
      if (e === ID.FIRE && adjFlammableSolid(grid, i)) return;
      /* 1. 风平流（§5.3-1 / §11.2） */
      var wind = ctx.wind;
      if (wind && wind.strength > 0) {
        var pw = wind.strength * E.windFactor;
        if (pw > 0 && RNG.hash01(x, y, e * 151 + tick) < pw) {
          var sx = wind.x > 0 ? 1 : (wind.x < 0 ? -1 : 0);
          var sy = wind.y > 0 ? 1 : (wind.y < 0 ? -1 : 0);
          if (sx !== 0 || sy !== 0) {
            nx = x + sx; var ny = y + sy;
            if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
              j = ny * w + nx;
              if (enterableGas(dens, el[j])) { swapMove(grid, i, j, tick); return; }
            } else if (ny < 0) {
              vent(grid, i, tick, ctx.ambient); return;
            }
          }
        }
      }
      /* 2. 浮力上升 p = mobility（+ 热对流加成 §11.3）；顶边逸出 */
      var W = root.YS.Wind;
      var boost = W ? W.convectionBoost(grid, i, y) : 0;
      var pup = E.mobility + boost; if (pup > 1) pup = 1;
      if (y > 0) {
        j = i - w;
        if (enterableGas(dens, el[j]) && RNG.hash01(x, y, e * 313 + tick) < pup) {
          swapMove(grid, i, j, tick); return;
        }
      } else {
        if (RNG.hash01(x, y, e * 313 + tick) < E.mobility) { vent(grid, i, tick, ctx.ambient); return; }
      }
      /* 3. 斜上 */
      if (y > 0) {
        var order3 = RNG.hash01(x, y, e * 97 + tick) < 0.5 ? -1 : 1;
        for (s = 0; s < 2; s++) {
          dx = s === 0 ? order3 : -order3;
          nx = x + dx;
          if (nx >= 0 && nx < w) {
            j = i + dx - w;
            if (enterableGas(dens, el[j]) && RNG.hash01(x, y, e * 401 + tick + s) < pup) {
              swapMove(grid, i, j, tick); return;
            }
          }
        }
      }
      /* 4. 水平随机扩散 p = mobility × 0.5 */
      var orderh2 = RNG.hash01(x, y, e * 131 + tick) < 0.5 ? -1 : 1;
      for (s = 0; s < 2; s++) {
        dx = s === 0 ? orderh2 : -orderh2;
        nx = x + dx;
        if (nx >= 0 && nx < w) {
          j = i + dx;
          if (enterableGas(dens, el[j]) && RNG.hash01(x, y, e * 409 + tick + s) < E.mobility * 0.5) {
            swapMove(grid, i, j, tick); return;
          }
        }
      }
    }
  }

  function movePass(grid, ctx) {
    var w = grid.w, h = grid.h;
    var leftToRight = (ctx.tick & 1) === 0;
    var y, x, row;
    for (y = h - 1; y >= 0; y--) {
      row = y * w;
      if (leftToRight) {
        for (x = 0; x < w; x++) stepCell(grid, ctx, row + x, x, y);
      } else {
        for (x = w - 1; x >= 0; x--) stepCell(grid, ctx, row + x, x, y);
      }
    }
  }

  var api = {
    movePass: movePass,
    enterableDown: enterableDown,
    enterableUp: enterableUp,
    enterableGas: enterableGas,
    enterableSide: enterableSide
  };
  root.YS.Movement = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

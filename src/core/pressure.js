/*
 * pressure.js — 压强系统（v1.6.1，Phase 3；真源 docs/PRESSURE-MODEL.md）
 *
 * 用户诉求：「金属绕一个圈，圈内圈外压强不一样 → 会**慢慢**变形成圆形（现实里先在
 * 某处突出或破掉）；空气流动也可以做成因为压强变化而变化 —— 就是联动。」
 *
 * pressurePass(grid, ctx) 三步：
 *   1 衰减    : press / stress 各乘衰减系数（为 0 时跳过整条循环）。
 *   2 压差流动 : 仅气体格（state==='gas'，含 AIR）。总压 P_i = P0×(T_i+273)/(amb+273) + press[i]。
 *               找 4 邻中**总压最小且可进入（气体）**的邻居 j；P_i−P_j > FLOW_EPS 时以
 *               p=min(1,ΔP×FLOW_K) 与 j 交换（grid.swap + moveStamp 双边置 tick +
 *               **flowDir 双边置方向位**，与 Phase 2 约定一致；冲击压随气体平流 → 冲击波前）。
 *               跳过：本 tick 已移动过、锚定火焰（FIRE 且 latent>0）。MAX_MOVE_BUDGET 护栏。
 *   3 墙体应力/变形 : 候选 = 固体且不可移动格。收集 4 邻气体总压，ΔP=max−min；
 *               ΔP>DEFORM_MIN_DP 时 stress[i] += (ΔP−DEFORM_MIN_DP)×STRESS_RATE。
 *               阈值 = hardness × YIELD_K × (支撑数/4)（脆性 ×BRITTLE_K；IMMUNE 跳过）。
 *               stress > 阈值 且 冷却已过 → 屈服：韧性（METAL）向低压侧蠕动（swap，气体补位）；
 *               脆性（默认）破碎为 AIR。
 *
 * 与物理真源一致的取舍（详见 PRESSURE-MODEL.md）：
 *   · **水的压强不模拟**（用户明确）：液体/粉末不进压强场。
 *   · 热压即时算、不占数组；只有冲击压 press 是独立场。
 *   · step 3 脆性破碎让物质守恒让位于游戏性（同 Powder Game 炸弹把玻璃变粉末的处理）。
 *
 * 性能：零 DOM、零热路径分配、确定性（salt 与既有模块错开）。
 *   等压惰性跳过：step 2 只处理"温度偏离环境（|ΔT|>0.05）或有冲击压"的气体格 →
 *   空画布（全环境温空气）近似零成本；step 3 只处理固体墙格。
 */
(function (root) {
  'use strict';

  var Balance = root.YS.Balance;
  var Elements = root.YS.Elements;
  var RNG = root.YS.RNG;
  var ELS = Elements.ELEMENTS;
  var ID = Elements.ID;

  var P = Balance.PRESSURE;

  /* 确定性 salt 基（与 air / movement / reactions / biology 全部错开） */
  var SALT_FLOW = 6011;
  var SALT_YIELD = 6073;

  /* ---- 元素分类表（模块加载时构建一次，热路径零字符串查找） ---- */
  var IS_GAS = new Uint8Array(32);      // state==='gas'（含 AIR id 1）
  var IS_WALL = new Uint8Array(32);     // state==='solid' && !movable（压强墙候选）
  var IS_DUCTILE = new Uint8Array(32);  // 韧性：屈服时向低压侧蠕动
  var IS_IMMUNE = new Uint8Array(32);   // 完全不变形
  var HARDNESS = new Float32Array(32);
  var BRITTLE = new Uint8Array(32);     // 墙候选 且 非韧性 且 非免疫
  (function () {
    var i, key, e;
    for (i = 1; i <= 31; i++) {
      e = ELS[i];
      IS_GAS[i] = (e.state === 'gas') ? 1 : 0;
      IS_WALL[i] = (e.state === 'solid' && !e.movable) ? 1 : 0;
      HARDNESS[i] = (e.hardness == null) ? 1 : e.hardness;
    }
    for (i = 0; i < P.DUCTILE.length; i++) { key = P.DUCTILE[i]; if (ID[key]) IS_DUCTILE[ID[key]] = 1; }
    for (i = 0; i < P.IMMUNE.length; i++) { key = P.IMMUNE[i]; if (ID[key]) IS_IMMUNE[ID[key]] = 1; }
    for (i = 1; i <= 31; i++) {
      if (IS_WALL[i] && !IS_DUCTILE[i] && !IS_IMMUNE[i]) BRITTLE[i] = 1;
    }
  })();

  /* 是否有冲击压 / 应力需要衰减（无则为空场，跳过衰减循环）。 */
  var anyPress = false;
  var anyStress = false;

  /* 理想气体总压（体积固定 → P ∝ T）：环境温气体 = P0；被加热 → > P0。 */
  function totalP(t, pr, amb) { return P.P0 * (t + 273) / (amb + 273) + pr; }

  var DEV_EPS = 0.05;    // 温度偏离环境的"等压惰性跳过"阈值（远小于 DEFORM_MIN_DP 对应的压差）
  var EPS_IMPULSE = 0.02; // 冲击压驱动流动的最小压差（小，保证冲击波顺畅外传）

  function pressurePass(grid, ctx) {
    if (!P.ENABLE) return;
    var tick = ctx.tick;
    var w = grid.w, h = grid.h, n = grid.n;
    var el = grid.element, temp = grid.temp;
    var press = grid.press, stress = grid.stress, ystamp = grid.yieldStamp;
    var mst = grid.moveStamp;
    var amb = ctx.ambient !== undefined ? ctx.ambient : Balance.PHYS.AMBIENT_T;
    var i, x, y, j;

    /* ---------- 步 1：衰减（有值才跑） ---------- */
    if (anyPress) {
      var kp = P.IMPULSE_DECAY, keepP = false;
      for (i = 0; i < n; i++) {
        var pv = press[i];
        if (pv !== 0) {
          pv *= kp;
          if (pv > -1e-5 && pv < 1e-5) pv = 0;
          press[i] = pv;
          if (pv !== 0) keepP = true;
        }
      }
      anyPress = keepP;
    }
    if (anyStress) {
      var ks = P.STRESS_DECAY, keepS = false;
      for (i = 0; i < n; i++) {
        var sv = stress[i];
        if (sv !== 0) {
          sv *= ks;
          if (sv < 1e-5) sv = 0;
          stress[i] = sv;
          if (sv !== 0) keepS = true;
        }
      }
      anyStress = keepS;
    }

    /* ---------- 步 2：压差驱动气流（联动核心） ---------- */
    var eps = P.FLOW_EPS, fk = P.FLOW_K, budget = P.MAX_MOVE_BUDGET, moved = 0;
    for (y = 0; y < h; y++) {
      var row = y * w;
      for (x = 0; x < w; x++) {
        i = row + x;
        if (!IS_GAS[el[i]]) continue;
        /* 跳过 FIRE（火焰不是被动的空气团，而是持续放热的反应前沿）：
         * 让压强流动推动火焰会破坏已标定的燃烧蔓延/锚定（N1 系列回归），故火焰保持由
         * movement/airPass 既有规则驱动。热压仍照常按温度计入"总压"，供墙体应力与
         * 邻近空气的压强流动使用。 */
        if (el[i] === ID.FIRE) continue;
        /* 等压惰性跳过：全环境温且无冲压的气体不发起流动（空画布零成本） */
        if (press[i] === 0 && temp[i] - amb < DEV_EPS && amb - temp[i] < DEV_EPS) continue;
        if (mst[i] === tick) continue;                 // 本 tick 已被移动过

        var Pi = totalP(temp[i], press[i], amb);
        var best = -1, bestP = Infinity, q;
        if (x > 0) { j = i - 1; if (IS_GAS[el[j]]) { q = totalP(temp[j], press[j], amb); if (q < bestP) { bestP = q; best = j; } } }
        if (x < w - 1) { j = i + 1; if (IS_GAS[el[j]]) { q = totalP(temp[j], press[j], amb); if (q < bestP) { bestP = q; best = j; } } }
        if (y > 0) { j = i - w; if (IS_GAS[el[j]]) { q = totalP(temp[j], press[j], amb); if (q < bestP) { bestP = q; best = j; } } }
        if (y < h - 1) { j = i + w; if (IS_GAS[el[j]]) { q = totalP(temp[j], press[j], amb); if (q < bestP) { bestP = q; best = j; } } }
        if (best < 0) continue;
        var dP = Pi - bestP;
        /* 分两种驱动源、两套阈值（见 balance.PRESSURE 注释）：
         *   · 冲击压（任一侧 press≠0）→ 用很小的 FLOW_EPS_IMPULSE（冲击波必须能顺畅向外传播）；
         *   · 纯热压 → 用较粗的 FLOW_EPS，且仅"垂直被堵"时驱动（保护既有热对流手感，A1）。 */
        var imp = (press[i] !== 0 || press[best] !== 0);
        if (imp) {
          if (dP <= EPS_IMPULSE) continue;
        } else {
          if (dP <= eps) continue;
          var upBlocked = (y === 0) || !IS_GAS[el[i - w]];
          if (!upBlocked) continue;
        }
        if (mst[best] === tick) continue;
        var prob = dP * fk; if (prob > 1) prob = 1;
        if (RNG.hash01(x, y, SALT_FLOW + tick) < prob) {
          grid.swap(i, best);
          /* 冲击压随气体平流 → 冲击波前向外传播（decay 仍在步 1 负责衰减） */
          var tp = press[i]; press[i] = press[best]; press[best] = tp;
          mst[i] = tick; mst[best] = tick;
          grid.markFlow(i, best);
          moved++;
          if (moved >= budget) { y = h; break; }
        }
      }
    }

    /* ---------- 步 3：墙体应力 / 变形（"慢慢"变形的关键） ---------- */
    var minDp = P.DEFORM_MIN_DP, rate = P.STRESS_RATE, yk = P.YIELD_K, bk = P.BRITTLE_K, cool = P.YIELD_COOLDOWN;
    var stressed = false;
    for (y = 0; y < h; y++) {
      var row2 = y * w;
      for (x = 0; x < w; x++) {
        i = row2 + x;
        var e2 = el[i];
        if (!IS_WALL[e2]) continue;
        if (IS_IMMUNE[e2]) continue;

        /* 收集 4 邻气体总压：min / max / 支撑数 */
        var pmin = Infinity, pmax = -Infinity, minIdx = -1, gasCnt = 0, v;
        if (x > 0) { j = i - 1; if (IS_GAS[el[j]]) { v = totalP(temp[j], press[j], amb); if (v < pmin) { pmin = v; minIdx = j; } if (v > pmax) pmax = v; gasCnt++; } }
        if (x < w - 1) { j = i + 1; if (IS_GAS[el[j]]) { v = totalP(temp[j], press[j], amb); if (v < pmin) { pmin = v; minIdx = j; } if (v > pmax) pmax = v; gasCnt++; } }
        if (y > 0) { j = i - w; if (IS_GAS[el[j]]) { v = totalP(temp[j], press[j], amb); if (v < pmin) { pmin = v; minIdx = j; } if (v > pmax) pmax = v; gasCnt++; } }
        if (y < h - 1) { j = i + w; if (IS_GAS[el[j]]) { v = totalP(temp[j], press[j], amb); if (v < pmin) { pmin = v; minIdx = j; } if (v > pmax) pmax = v; gasCnt++; } }
        if (gasCnt < 2) continue;                 // 两侧都有气体才谈"跨壁压差"
        var support = 4 - gasCnt;                 // 非气体（固体）邻数
        /* 孤立块（四邻皆气体，support=0）不是"墙"，不参与应力/变形：
         * 否则阈值 hardness×YIELD_K×(0/4)=0 → 任何热块都会瞬间破碎（A1 回归：1000°C 石块
         * 直接消失）。只有与其它固体连成结构的格才算墙（support≥1）。 */
        if (support < 1) continue;

        /* 跨壁压差：**向大气敞开的一侧以环境基准压 P0 为参考**。
         * 为什么不用局部 min（原稿 ΔP=max−min）：金属导热系数 k=8（为修「金属锅要传热」
         * 而设），会把外壁空气也烤到数百 °C —— 实测金属盒外壁空气 451 °C、内壁 451 °C，
         * 局部 pmax≈pmin → 金属盒**永不变形**。物理上开放世界的外侧压强由大气库决定，
         * 不因局部被烤热而抬高；故参考低压取 min(局部低压侧, P0) —— 只要有一侧接大气，
         * 压差就还原为「封闭侧表压」。 */
        var refLow = pmin < P.P0 ? pmin : P.P0;
        var dPw = pmax - refLow;
        if (dPw > minDp) {
          stress[i] += (dPw - minDp) * rate;
          stressed = true;
        }

        /* 屈服阈值：hardness × YIELD_K × (支撑数/4)（脆性再 ×BRITTLE_K；角部再 ×CORNER_K） */
        var thr = HARDNESS[e2] * yk * (support / 4);
        if (BRITTLE[e2]) thr *= bk;
        /* 角部应力集中：两个互相垂直的固体邻格（左上/上右/右下/下左）→ 更早屈服 */
        var sL = (x > 0) && !IS_GAS[el[i - 1]];
        var sR = (x < w - 1) && !IS_GAS[el[i + 1]];
        var sU = (y > 0) && !IS_GAS[el[i - w]];
        var sD = (y < h - 1) && !IS_GAS[el[i + w]];
        if ((sL && sU) || (sU && sR) || (sR && sD) || (sD && sL)) thr *= P.CORNER_K;

        if (stress[i] > thr && ystamp[i] < tick - cool) {
          if (IS_DUCTILE[e2] && minIdx >= 0) {
            /* 韧性（METAL）：与总压最小的相邻气体格交换 → 墙向低压侧蠕动（突出/外扩），
             * 气体补位 → 环体扩张、趋于圆形。应力随材料带到新位（×0.4 松弛）。 */
            var carry = stress[i] * 0.4;
            grid.swap(i, minIdx);
            stress[i] = 0;                        // 原格现在是气体
            stress[minIdx] = carry;               // 金属带到新位
            ystamp[i] = tick; ystamp[minIdx] = tick;
            mst[i] = tick; mst[minIdx] = tick;
          } else {
            /* 脆性（默认）：破碎 → AIR。
             * 2D CA 近似：裂开后的物质守恒让位于游戏性（同 Powder Game 炸弹把玻璃变粉末）。 */
            el[i] = 1; temp[i] = amb;
            stress[i] = 0; ystamp[i] = tick;
            grid.latent[i] = 0; grid.age[i] = 0;
          }
        }
      }
    }
    if (stressed) anyStress = true;
  }

  /* 爆炸冲压：半径 r 内**气体格** press += power×(1−dist/r)（dist 取欧氏距离）。
   * 欧氏距离（而非切比雪夫）使冲击压呈圆对称衰减，与"冲击波向外"的直觉一致。 */
  function impulse(grid, cx, cy, r, power) {
    if (!P.ENABLE || r <= 0) return;
    var w = grid.w, h = grid.h, el = grid.element, press = grid.press;
    var r2 = r * r;
    var x0 = cx - r; if (x0 < 0) x0 = 0;
    var x1 = cx + r; if (x1 > w - 1) x1 = w - 1;
    var y0 = cy - r; if (y0 < 0) y0 = 0;
    var y1 = cy + r; if (y1 > h - 1) y1 = h - 1;
    var inv = 1 / r;
    for (var y = y0; y <= y1; y++) {
      for (var x = x0; x <= x1; x++) {
        var dx = x - cx, dy = y - cy, d2 = dx * dx + dy * dy;
        if (d2 > r2) continue;
        var i = y * w + x;
        if (!IS_GAS[el[i]]) continue;             // 只给气体格注入（固体/液体不参与）
        var dist = Math.sqrt(d2);
        press[i] += power * (1 - dist * inv);
        anyPress = true;
      }
    }
  }

  var api = { pressurePass: pressurePass, impulse: impulse };
  root.YS.Pressure = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

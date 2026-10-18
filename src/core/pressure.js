/*
 * pressure.js — 压强系统（v1.6.1，Phase 3；v1.6.6 加静压头；真源 docs/PRESSURE-MODEL.md）
 *
 * 用户诉求：「金属绕一个圈，圈内圈外压强不一样 → 会**慢慢**变形成圆形（现实里先在
 * 某处突出或破掉）；空气流动也可以做成因为压强变化而变化 —— 就是联动。」
 *
 * pressurePass(grid, ctx) 三步：
 *   1 衰减    : press / stress 各乘衰减系数（为 0 时跳过整条循环）。
 *   2 压差流动 : 仅气体格（state==='gas'，含 AIR）。总压
 *                 P_i = P0×(T_i+273)/(amb+273) + press[i] + HEAD_K×head[i]（横向分支才加静压头）。
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
 *
 * ★v1.6.6 静压头（HEAD_K）—— 闭合对流环缺失的第四段「底部回流」（规格
 *   docs/CONVECTION-SPEC.md §2.1 C1-d / §5 冲突 5；用户拍板 Plan A）。
 *   物理：重力场里高度 y 处的压强 = 顶部基准压 + 上方气柱重量的积分，
 *        P(y) = P_top + ∫ ρ(y')·g·dy'
 *   于是**同一高度上并列的两根气柱只要密度不同，底部压强就不同** —— 冷柱（ρ 大）在底部
 *   积累更多重量 → 底部压强更高 → 在底部驱动「冷 → 热」的横向流。这就是烟囱效应 / 热虹吸，
 *   也正是「热压只推热→冷、浮力只有竖直分量」所缺的那个驱动源。
 *   反向约束（实现必须成立，否则是 bug）：
 *     · 均匀密度场 → 每根柱子的静压头相同 → **不产生任何横向流**（静水平衡）；
 *     · 竖直方向不应被静压头驱动（它被引力抵消）→ **静压头只进入横向分支的 ΔP**。
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

  /* ============================================================
   * ★ 静压头场 head[i]（v1.6.6，Plan A 烟囱效应）
   *
   * 定义（**表压口径**，这是本实现与"逐列积分字面读法"的唯一实质差别，理由见下）：
   *     ρ_rel(T) = (amb + 273) / (T + 273)          // 环境温空气 ρ=1；热 → <1
   *     head[i]  = Σ_{气柱在 i 正上方} ( ρ_rel − 1 )
   * 即「以**同高度的环境密度气柱**为参考的表压」。为什么减 1（而不是直接累加 ρ_rel）：
   *   · 反向约束①要求"均匀密度场不产生任何横向流"。直接累加 Σρ 时，head = 气柱长度×ρ，
   *     而**气柱长度在不同列是不同的**（天花板/锅底会截断气柱）→ 哪怕全场等温、等密度，
   *     断柱处两侧也会凭空出现 head 差 → 产生纯几何造成的假流。减去 1 后等温场恒为 0，
   *     约束①在所有几何下都严格成立（实测见 _diag_hydro.js 的"均匀场对照"）。
   *   · 减 1 的物理含义：把"参考压"取成同高度环境密度气柱的静压 —— 我们只在**同一行内**
   *     比较 head，同一行的参考压是同一个常数，相减不影响任何横向比较；而它顺带让
   *     "顶到天花板的 1 格气窝"拿到 ≈0（≈环境压），这正是物理上该有的值。
   *
   * 气柱口径（自上而下，行主序，O(n)）：
   *   · 正上方是气体 → head[i] = head[上] + (ρ_rel(上) − 1)（正常累加）；
   *   · 正上方**不是**气体（天花板 / 锅底 / 墙柱）→ 该格不再有自己的气柱，改为**沿本行
   *     气体横向继承**：左→右扫一遍、右→左扫一遍，取两者平均。
   *     为什么必须横向继承：蛇形通道的**底部横通道中段上方是一整根 68 行墙柱**，逐列口径
   *     会让它 head=0，而两侧腿底是数十 → 底部横通道出现 head「空洞」，两条腿底都往空洞里
   *     挤（实测把回流反向短路）。真实流体在连通气腔内是**传压**的：同一高度上、被天花板
   *     截断的那一小段，其压强由两侧气柱沿通道插值决定 —— 双向扫描取平均就是线性插值。
   *     （同口径下顶部横通道两侧气柱在 y=10 处都是 0 → 顶横 head 恒 0 → 不干扰顶部机制。）
   *
   * 存储：**模块私有 Float32Array**（按 w×h 懒扩容），每 tick 整场重写 → 无残留、不影响
   * 确定性、不需要序列化、不占 grid 字段（故存档格式与兼容面完全不变）。
   * 开销：两次 O(n) 扫描 + 一次 O(n) 求平均，HEAD_K=0 时整个函数不执行。
   * ============================================================ */
  var headBuf = null, headBuf2 = null;

  function computeHead(grid, amb, hk) {
    var w = grid.w, h = grid.h, n = grid.n, el = grid.element, temp = grid.temp;
    if (!headBuf || headBuf.length < n) {
      headBuf = new Float32Array(n);
      headBuf2 = new Float32Array(n);
    }
    var a = headBuf, b = headBuf2;
    var base = amb + 273;
    var x, y, i, row;
    /* 第一遍（左→右）：a[i] —— 顶行上方无气柱且左侧无气体 → a=0（即表压 0 = 环境压） */
    for (y = 0; y < h; y++) {
      row = y * w;
      for (x = 0; x < w; x++) {
        i = row + x;
        if (!IS_GAS[el[i]]) { a[i] = 0; continue; }
        if (y > 0 && IS_GAS[el[i - w]]) a[i] = a[i - w] + (base / (temp[i - w] + 273) - 1);
        else if (x > 0 && IS_GAS[el[i - 1]]) a[i] = a[i - 1];      // 被天花板截断 → 横向继承
        else a[i] = 0;
      }
    }
    /* 第二遍（右→左）：b[i] */
    for (y = 0; y < h; y++) {
      row = y * w;
      for (x = w - 1; x >= 0; x--) {
        i = row + x;
        if (!IS_GAS[el[i]]) { b[i] = 0; continue; }
        if (y > 0 && IS_GAS[el[i - w]]) b[i] = b[i - w] + (base / (temp[i - w] + 273) - 1);
        else if (x < w - 1 && IS_GAS[el[i + 1]]) b[i] = b[i + 1];
        else b[i] = 0;
      }
    }
    /* 双向平均（= 沿横通道在两根气柱之间线性插值），并在此处一次性乘上 HEAD_K */
    for (i = 0; i < n; i++) a[i] = (a[i] + b[i]) * 0.5 * hk;
    return a;
  }

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
    /* 静压头场已含 HEAD_K 因子；HEAD_K=0（或未提供）时为 null → 与 v1.6.5 逐位一致。 */
    var hk = P.HEAD_K || 0;
    var hd = hk > 0 ? computeHead(grid, amb, hk) : null;
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
        /* PiF = 含静压头的总压（**只用于"选哪个邻居"与横向分支的 ΔP**；竖直/冲压分支的
         * ΔP 仍用不含静压头的 Pi−bestP —— 静压头在竖直方向被引力抵消，不许驱动竖直流）。 */
        var PiF = hd ? Pi + hd[i] : Pi;
        var best = -1, bestP = Infinity, bestF = Infinity, q, qf;
        if (x > 0) { j = i - 1; if (IS_GAS[el[j]]) { q = totalP(temp[j], press[j], amb); qf = hd ? q + hd[j] : q; if (qf < bestF) { bestF = qf; bestP = q; best = j; } } }
        if (x < w - 1) { j = i + 1; if (IS_GAS[el[j]]) { q = totalP(temp[j], press[j], amb); qf = hd ? q + hd[j] : q; if (qf < bestF) { bestF = qf; bestP = q; best = j; } } }
        if (y > 0) { j = i - w; if (IS_GAS[el[j]]) { q = totalP(temp[j], press[j], amb); qf = hd ? q + hd[j] : q; if (qf < bestF) { bestF = qf; bestP = q; best = j; } } }
        if (y < h - 1) { j = i + w; if (IS_GAS[el[j]]) { q = totalP(temp[j], press[j], amb); qf = hd ? q + hd[j] : q; if (qf < bestF) { bestF = qf; bestP = q; best = j; } } }
        if (best < 0) continue;
        var dP = Pi - bestP;
        /* 分两种驱动源、两套阈值（见 balance.PRESSURE 注释）：
         *   · 冲击压（任一侧 press≠0）→ 用很小的 FLOW_EPS_IMPULSE（冲击波必须能顺畅向外传播）；
         *   · 纯热压 → 用较粗的 FLOW_EPS，且仅"垂直被堵"时驱动（保护既有热对流手感，A1）。
         * v1.6.3 曾试过给"纯热压"加**横向**流动（想做成对流环流的水平段）→ **已回退**：
         *   FLOW_EPS_H=0.02/0.05 两档都让竖直热羽被横向抽走（A3 热空气上移、V24 冷蒸汽占比
         *   两项回归失败），而蛇形通道顶部的横向流动仍是 0 —— 净负收益。
         *   真正的堵点见 balance.js AIR.BUOY 注释：浮力参考是"全局环境温"而非局部密度。 */
        var imp = (press[i] !== 0 || press[best] !== 0);
        var horiz = (best === i - 1) || (best === i + 1);
        if (imp) {
          if (dP <= EPS_IMPULSE) continue;              // 冲击波：四方向 + 极小阈值
        } else if (horiz) {
          /* v1.6.5 竖直被堵场景的横向热压流（任务 T-2026-1015-B；规格 §5 冲突 4）：
           * 门控 —— 仅当本格的**竖直去路被固体挡住**（上方或下方非气体）时才允许横向流动。
           * 覆盖"天花板被堵住"的场景（如玩家密闭盒内的顶部缺口：热空气升到盒顶被堵 →
           * 横向挤向缺口）。门控是安全红线：竖直热羽的上方是 AIR、永不满足门控 →
           * 不会被横向抽走（v1.6.3 无门控调低阈值实测抽干热羽：A3/V24 回归失败、N1-9 超）。
           * 注：规格蛇形的顶横通道**接画布顶部天空层**（唯一热出口），那里的热空气向上逸出、
           * 不满足本门控 —— 该场景的横向过由 airPass 的「顶部边界横向铺开」承担
           * （air.js::TOP_SPREAD_ROWS），两机制各覆盖一类场景，互不重复。 */
          var upBlk = (y === 0) || !IS_GAS[el[i - w]];
          var dnBlk = (y === h - 1) || !IS_GAS[el[i + w]];
          if (!upBlk && !dnBlk) continue;
          /* ★v1.6.6 静压头只在这里进 ΔP（横向分支，含顶横/底横通道与贴地贴顶气层）：
           * 冷柱（ρ 大）底部 head 更高 → 在底部驱动「冷 → 热」的横向流 = 底部回流（C1-d）。
           * 阈值用横向专用低阈值 FLOW_EPS_H。 */
          dP = PiF - bestF;
          if (dP <= P.FLOW_EPS_H) continue;
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

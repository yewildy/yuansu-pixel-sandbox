/*
 * air.js — 空气运动通道（docs/PHYSICS-AIR.md §5/§6）
 *   airPass：温度驱动的浮力置换 + 风平流。air 的 `movable=false`，不经通用移动通道；
 *   本模块是空气"能动性"的唯一来源，与通用移动解耦（性能关键，见 ADR-0005）。
 *
 *   ★v1.6.5 驱动力 = 与**行窗平均**的差（闭合对流环流，任务 T-2026-1015-B；
 *     验收规格 docs/CONVECTION-SPEC.md §2.1 C1-b）：
 *     ref_i = 以本格为中心 ±ROW_REF_R 窗口内**空气格**的平均温度（墙/固体不计入），
 *     Δ = T_i − ref_i
 *     · 旧判据 `Δ = T − 全局环境温(20 °C)`：只要比 20 °C 热就上升、**永远不下沉** ——
 *       蛇形通道冷腿结构上无法参与环流（v1.6.3 实测：冷腿也净上升 +180550）。
 *     · v1.6.4 曾用「四邻紧邻均值 + 环境温钳位」：方向问题解决了，但口径太窄 ——
 *       冷腿格周围仍是同腿冷空气，看不到热腿，"冷腿下沉"只靠底部一点点暖堆，边缘且慢
 *       （规格原文：会原样保留 v1.6.3 的失败模式）。行窗平均（R=30 ≥ 两腿间距含中墙
 *       ≈20–30 格）让冷腿格直接"看见"热腿：行均被热腿拉高 → 冷腿格判冷 → 整腿下沉。
 *     · 未驱动（−COLD_DT ≤ Δ ≤ BUOY_DT）→ 不移动（空画布零成本，A5）
 *     · 热（Δ > BUOY_DT）→ 以 p_up 向上与上方 AIR 交换（grid.swap 连温度一起交换 → 带走热量）；
 *       强热羽（Δ > 2·BUOY_DT）再试斜上。
 *     · 冷（Δ < −COLD_DT）→ 以 p_down 向下沉。
 *     · 风：仅平流"携带热量"的空气格（判据仍用全局温差 |T−amb| > WIND_MIN_DT，保持既有手感）。
 *   ★v1.6.7 横向流动（环路的水平两段）回到本模块，判据从**画布行**换成**几何**：
 *     · 旧判据 `y < TOP_SPREAD_ROWS(=4)` 是画布行判据 —— 蛇形几何的顶横通道在 y=10，
 *       **永远不满足** → 该机制在蛇形里一次都不触发（实测 airPass E 向贡献 0）；下沉分支
 *       更是完全没有横向机制 → 底部回流无源（即规格 §5 冲突 5 的结构缺口 C1-d）。
 *     · 新判据 = **主驱动方向被挡住**：想上升但上方非气体 → 贴顶横向输运（朝更冷的一侧，
 *       即 C1-c「顶部横向越过」）；想下沉但下方非气体 → 贴底横向输运（朝更热的一侧，
 *       即 C1-d「底部回流」）。方向由**行窗平均**判定（复用 preT/preC，O(1)），不是紧邻一格
 *       （紧邻温差仅 2–6 °C，是噪声量级且扩散式 E≈W、没有方向性）。
 *     · 同时新增**歧义择向**（AMBIG_RATIO）：d↑（比环境热）与 d↓（比行窗冷）同时超阈值时
 *       （= 闭合环冷腿的状态）按偏离幅度较大者择向；旧代码一律取上升，导致"热一送到冷腿、
 *       冷腿立刻翻成上升" → 环量归零。
 *     · 顶部边界层（y<4）的旧铺开**保留**（服务 G0 几何：顶横接画布顶部天空层的场景）。
 *   降载：隔帧（PASS_INTERVAL）+ 移动预算（MAX_MOVE_BUDGET）+ 驱动格超阈值时奇偶列分半。
 *   确定性：全部走 RNG.hash01（同种子同结果）。零 DOM、零热路径分配。
 *   成本：入口处按行构建一次 AIR 温度前缀和（O(n)，仅当有待驱动空气时执行 → 空画布零成本），
 *         格内参考值 O(1)（两次查表 + 一次除法）；预筛即判据本身（|Δ|≤带内直接跳过）。
 */
(function (root) {
  'use strict';

  var Balance = root.YS.Balance;
  var RNG = root.YS.RNG;

  var AIR = 1;

  /* 上一次 airPass 的统计（供 A5 性能验收与自适应分半复用） */
  var lastDriven = 0;
  var lastMoved = 0;
  /* "有待驱动空气"标志：由 thermal.relax 在探测到 |Δ| 超阈值时置位。
   * 无热源（空画布）时恒为 false → airPass 直接 O(1) 退出（D1 驱动判据的强化）。 */
  var pendingDrive = false;

  function noteDeviation() { pendingDrive = true; }

  function swapStamp(grid, i, j, tick) {
    grid.swap(i, j);              // 同时交换 element/temp/age/latent → 热量随空气一起搬走
    grid.moveStamp[i] = tick;
    grid.moveStamp[j] = tick;
    grid.markFlow(i, j);          // v1.6.1 气流可视化：记下这次空气置换的方向（i↔j 两格）
  }

  /* 行窗平均的前缀和 scratch（模块级复用，按网格宽度懒扩容；每行入口整体重写 → 无残留、
   * 确定性不受影响；不落 grid 字段是因为它每次 airPass 都重算，无需跨 tick 持久）。 */
  var preT = null, preC = null;

  /* v1.6.7 空腔顶/底判定的扫描 scratch（模块级复用，按网格格数懒扩容）。
   * gasUp[i] = 同一列 y'<y 处是否存在气体；gasDn[i] = 同一列 y'>y 处是否存在气体。
   * 每次 airPass **只算一次**（首次真正需要时惰性触发）→ 没有"被挡住的驱动格"的场景零成本。
   * 快照取在 pass 中途（swap 会搬走气体），但空腔的**几何**由固体决定、本 pass 内不变，
   * 故"有没有气体"的判定是稳定的；不落 grid 字段（不需要序列化、不影响存档格式）。 */
  var gasUp = null, gasDn = null;
  /* 元素 → 是否气体 的查表（模块级，只建一次；元素表是静态的）。 */
  var IS_GAS = null;
  /* "刚性壁"表：非气体**且不参与通用移动通道**的元素（石/墙/金属…）。
   * 为什么不能用"非气体"当壁：水/灰/沙也是非气体，而 V25 的锅里正下着冷凝水滴雨 ——
   * 那串随机散落的水滴把开放空气切成了一堆窄游程，被 ① 步误认成"烟道"（实测 776 格）。
   * 用 movable 区分很干净：水滴 movable=1（会掉），砌出来的墙 movable=0（不动）。 */
  var IS_RIGID = null;

  function ensureGasTable() {
    if (IS_GAS) return;
    var els = root.YS.Elements && root.YS.Elements.ELEMENTS;
    var mv = root.YS.Elements && root.YS.Elements.movable;
    var n = els ? els.length : 0, i, m = n > 64 ? n : 64;
    IS_GAS = new Uint8Array(m);
    IS_RIGID = new Uint8Array(m);
    for (i = 0; i < n; i++) {
      var g = (els[i] && els[i].state === 'gas') ? 1 : 0;
      IS_GAS[i] = g;
      IS_RIGID[i] = (!g && (!mv || !mv[i])) ? 1 : 0;
    }
  }

  function scanCavities(grid) {
    var w = grid.w, h = grid.h, n = grid.n, el = grid.element, x, y, i, row;
    if (!gasUp || gasUp.length < n) { gasUp = new Uint8Array(n); gasDn = new Uint8Array(n); }
    /* 自上而下：gasUp(y) = gasUp(y-1) | isGas(y-1) */
    row = 0;
    for (x = 0; x < w; x++) gasUp[x] = 0;
    for (y = 1; y < h; y++) {
      row = y * w; i = row;
      for (x = 0; x < w; x++, i++) gasUp[i] = gasUp[i - w] | IS_GAS[el[i - w]];
    }
    /* 自下而上：gasDn(y) = gasDn(y+1) | isGas(y+1) */
    row = (h - 1) * w;
    for (x = 0; x < w; x++) gasDn[row + x] = 0;
    for (y = h - 2; y >= 0; y--) {
      row = y * w; i = row;
      for (x = 0; x < w; x++, i++) gasDn[i] = gasDn[i + w] | IS_GAS[el[i + w]];
    }
  }

  /* ============================================================================
   * ★v1.6.8 管道环流（duct circulation）—— 为什么非有它不可
   *
   * 先说一条**这个模型的硬限制**（实测 + 可证）：只要移动全是 grid.swap 的两两交换、
   * 且气团等质量，那么对任意割集，一次 swap 必然"一个气团正向穿过 + 一个反向穿过"，
   * 净通量**恒等于 0**（不是稳态为 0，是每一 tick 都恒等 0）。所以：
   *   · 靠"每格独立掷骰的定向输运"永远造不出环流 —— 交换次数可以暴涨（实测热腿 17.3 万次
   *     交换、净 −385），示踪剂质心却只能做 √t 扩散，绕不过去；
   *   · 顺序更新 + moveStamp 还会把"全体同向"退化成两两转置（4 格环推演：
   *     [A,B,C,D] → 处理 x=0 → [B,A,C,D] → x=1 被 stamp 跳过 → x=2 → [B,A,D,C]，净位移 0）。
   * ⇒ 唯一出路：让**整条环在同一 tick 一起前进一步**（k 元轮换 = k−1 次 swap，保质量、不留洞）。
   *   "每格独立掷骰"会让环里随时出现空隙 → 大环断成链 → 全堵，所以闸门是**整条环一个骰子**。
   *
   * ★★ 方向场为什么必须重写（v1.6.8；首版按"紧邻空腔顶/底"分类的写法必然判反底横）
   *   首版判据：upB = 头顶非气体，dnB = 脚下非气体；`upB && !gasUp` = 空腔顶 → 朝更冷侧；
   *   `dnB && !gasDn` = 空腔底 → 朝更热侧。在蛇形几何里这条**必然错**：底横中段
   *   （x21..35, y79）头顶是墙、脚下也是墙 ⇒ 两个条件**同时成立**，而 if/else-if 永远取前者
   *   → 底横被判成"空腔顶" → 朝更冷侧（东）→ 环反向（这正是前几轮"底横方向反了"的真因）。
   *   而且这不是调参能救的：矩形环的顶横与底横是 **180° 旋转对称**的，任何"逐格/逐列"的
   *   局部量都区分不了它们 —— 唯一的非对称来源是**重力 + 温度**（"热柱上升"这一条）。
   * ⇒ 所以 v1.6.8 改为先在**几何上**把环路的两段水平段找出来（分层），再用**整段统一**的
   *   冷热端定向 —— 整段统一是环能闭合的关键（各格自掷骰子会把环拆成链）。
   *
   * 算法（每 tick，全部 O(n)，只在"有待驱动空气"时执行）：
   *   1) 闭空腔洪泛：气体 4-连通域；**触及画布边界者排除**（开放场景零影响 → 零回归风险）。
   *   2) 列连续气段（run）：每段记 runMean（段内均温）、段高、段所在列。
   *   3) 段升降性：runMean 与**所在空腔均温**比，高出 DUCT_COL_MARGIN → 上升段，低出 → 下沉段，
   *      否则中性（不动）。用整段均值而非逐格 → 同段各格方向一致 → 保证成环。
   *   4) 水平层：一行内"头顶是固体"的最大连续气段 = 顶横层；"脚下是固体"的 = 底横层。
   *      要求段内**至少两根**段高 ≥ DUCT_MIN_LEG_H 的竖腿（否则是 1 格高的孤立横段，
   *      不构成环路，跳过）。 —— 这一步正是"底横中段头顶脚下都是墙"的正确归属：
   *      它跟左右两条腿的顶行/底行连成**同一段**，于是被腿"认领"，不再是孤立案。
   *   5) 层方向（整段统一）：取段内各竖腿的 runMean，最热腿 xHot / 最冷腿 xCold，
   *      冷热差 ≥ DUCT_MIN_DRIVE 才启用。顶横层 = 热腿→冷腿；底横层 = 冷腿→热腿。
   *   6) 出口：沿流向**最远**的那根"该竖向钻"的腿才钻进去（顶横：最远的下沉腿 → 向下；
   *      底横：最远的上升腿 → 向上），其余格一律走层方向 —— 让气流尽量走满整段。
   *   7) 竖腿内部按段升降性走；目标格必须同空腔、是气体、不出界。
   *   8) 环提取：沿 dirF 走路径，走回路径上的点即成环；环长 ≥ DUCT_MIN_CYCLE 时按
   *      **一个骰子**决定本 tick 这条环走不走，走则 k−1 次 swap 完成 k 元轮换。
   *      链（path 撞到 dirF=0 或已访问格）整条不动 —— 符合"前车不动后车不动"。
   *
   * 手推演（V34 几何：热腿 x12..20、冷腿 x36..44、顶横/底横各 1 行 y10 / y79）：
   *   顶横层 = y10 整行 x12..45（头顶全是 y9 的墙）→ 腿 = x12..20(热) + x36..44(冷)
   *   → xHot 在西侧、xCold 在东侧 → 层方向 = 东；出口 = 最远（最东）的下沉腿 x44 → 向下。
   *   底横层 = y79 整行 x12..45（脚下全是 y80 的墙）→ 腿同上 → 层方向 = 西；
   *   出口 = 最远（最西）的上升腿 x12 → 向上。
   *   环： (12,79)↑…(12,10)→(13,10)…→(44,10)↓(44,11)…→(44,79)→(43,79)…→(12,79)  闭合，约 204 格。
   *
   * ★能力上限（如实记录，别当 bug 修）：环是**格点上的简单闭合路径**，所以能同时跑几条
   *   并行"车道"取决于**管道横截面的格数** —— 1 格高的横管物理上只能过 1 格宽的一股流，
   *   上面这条 204 格环就是它的全部运力（≈ 空腔的 15%）。想要整条腿一起动，横管就得有
   *   相应的高度（腿 9 格宽 ⇒ 横管 9 格高才能 9 股并行）。这是模型的几何上限，不是判据错。
   * ========================================================================== */
  var dirF = null, cStk = null, cPos = null, cVis = null;
  var cavId = null, runId = null, queue = null;
  var runSum = null, runCnt = null, runY0 = null, runY1 = null, runX = null, runRise = null;
  var cavSum = null, cavCnt = null, cavOK = null;
  /* 环缓存：把「分析」（洪泛 + 建方向场 + 提环，贵）与「转动」（k−1 次 swap，便宜）拆开。
   * 分析按 DUCT_ANALYZE_INTERVAL 隔帧刷新到 cycBuf，转动**每 tick 照做**（用缓存的环）。
   * 为什么要拆：实测 320×180 开放火场（没有闭合空腔）里，洪泛扫描的纯开销是
   * **1.435 ms/tick**，把 N1-9b 的 ≤6.5 ms 门槛顶穿（5.247 → 6.682）。隔 4 帧后
   * 降到 ≈0.36 ms/tick，而环流速度一点不变（转动仍每帧）。物理上也站得住：
   * 方向场由温度场决定，温度场几帧内几乎不变。 */
  var cycBuf = null, cycOff = null, cycLen = null;
  var cycCount = 0;
  var ductMoved = 0, ductCycles = 0, ductLane = 0, ductOn = 0, _forceAnalyze = 1;
  var _anW = 0, _anH = 0, _anN = 0;

  function ensureDuct(n) {
    if (!dirF || dirF.length < n) {
      dirF = new Uint8Array(n); cStk = new Int32Array(n); cPos = new Int32Array(n);
      cVis = new Uint8Array(n); cavId = new Int32Array(n); runId = new Int32Array(n);
      queue = new Int32Array(n); runRise = new Int8Array(n);
      runSum = new Float64Array(n); runCnt = new Int32Array(n);
      runY0 = new Int32Array(n); runY1 = new Int32Array(n); runX = new Int32Array(n);
      cavSum = new Float64Array(n); cavCnt = new Int32Array(n); cavOK = new Uint8Array(n);
      cycBuf = new Int32Array(n); cycOff = new Int32Array(n); cycLen = new Int32Array(n);
      /* cPos 的哨兵值必须是 −1：Int32Array 是 0 初始化，而 0 是"路径上的第 0 格"这个
       * **合法**下标。漏掉这行 ⇒ 走环第一步就命中 `cPos[cur] >= 0` ⇒ 判定环长 = 0
       * ⇒ 所有环被当成"太短"跳过 ⇒ 整机制静默空转（本分支首轮实测 ductMoved 恒 0，
       * 就是栽在这里）。每次 pass 结束会把走过的格复位成 −1，故只需初始化一次。 */
      cPos.fill(-1);
      return 1;                 // 重新分配过 → 缓存的环一律作废
    }
    return 0;
  }

  /* dirF 的方向编码（1=E 2=W 3=N 4=S）→ grid.flowDir 的方向位（1=E 2=W 4=N 8=S）。
   * 模块级常量数组，索引即 dirF 值，0 号位留 0（dirF=0 不该被写）。 */
  var DUCT_BIT = [0, 1, 2, 4, 8];

  /* _setDir 的模块级上下文（避免每次调用分配闭包 —— 本项目热路径零分配约定） */
  var _w = 0, _h = 0, _cav = null, _dirF = null, _cnt = 0;
  function _setDir(i, d) {
    var j = -1, x = i % _w, y = (i / _w) | 0;
    if (d === 1) { if (x >= _w - 1) d = 0; else j = i + 1; }
    else if (d === 2) { if (x <= 0) d = 0; else j = i - 1; }
    else if (d === 3) { if (y <= 0) d = 0; else j = i - _w; }
    else if (d === 4) { if (y >= _h - 1) d = 0; else j = i + _w; }
    /* 目标必须同空腔（不同空腔之间不串气），否则判据作废 */
    if (d !== 0 && !(_cav[j] > 0 && _cav[j] === _cav[i])) d = 0;
    _dirF[i] = d;
    if (d !== 0) _cnt++;
    return d !== 0;
  }

  /* 调度器：分析隔帧刷新、转动每帧照做（拆分理由见 cycBuf 的注释 + balance.js
   * DUCT_ANALYZE_INTERVAL 的实测）。环缓存跨帧复用，靠"换了网格就作废"来保正确。 */
  function ductFlow(grid, ctx) {
    var A = Balance.AIR;
    var p0 = A.DUCT_FLOW_P;
    /* 防"悬空键"复发：任何非有限数值都等同关闭（而不是静默 no-op 后自以为生效）。
     * 本项目已四次栽在"代码写了、参数键没加"上，这里是最后一道闸。 */
    if (typeof p0 !== 'number' || !isFinite(p0) || p0 <= 0) {
      /* 关闭时把方向场清空（只在**状态翻转**那一次做，不是每 tick 都做）。
       * 为什么必须清：dirF 是模块级复用数组，关掉之后它仍留着上一次的方向 →
       * 任何诊断/断言读到它都会以为机制还开着（V35 的 P=0 对照臂就是这么被骗过去的：
       * 实得 1283 格"有方向"）。清零也让 A/B 对照可以直接对着方向场下断言。 */
      if (ductOn) {
        ductOn = 0;
        if (dirF) dirF.fill(0);
        cycCount = 0; _forceAnalyze = 1;
        /* 连计数器一起清零：它们也是模块级状态，关掉之后仍留着关闭前最后一次转动的值 →
         * V35 的 P=0 对照臂读 ductMoved() 拿到 193，误以为机制还在动。
         * 清零只发生在**状态翻转**那一次，不影响热路径开销。 */
        ductMoved = 0; ductCycles = 0; ductLane = 0;
      }
      return;
    }
    if (!ductOn) _forceAnalyze = 1;                 // 刚从关闭切到开启 → 必须马上分析一次
    ductOn = 1;
    var tick = ctx.tick;
    var w = grid.w, h = grid.h, n = grid.n;
    ensureGasTable();
    if (ensureDuct(n) || _anW !== w || _anH !== h || _anN !== n) {
      cycCount = 0; _anW = w; _anH = h; _anN = n; _forceAnalyze = 1;  // 换了网格 → 环作废
    }
    /* ★节流必须**只看 tick**，不能写成 `cycCount === 0 就分析`：
     * 开放场景（火场）里分析结果永远是"没有闭合空腔" ⇒ cycCount 恒为 0 ⇒ 那样写会退化成
     * 每帧分析，1.435 ms/tick 的开销一点没省 —— 正是要修的那个性能问题。 */
    var anIv = A.DUCT_ANALYZE_INTERVAL;
    if (_forceAnalyze || anIv <= 1 || (tick % anIv) === 0) {
      _forceAnalyze = 0;
      analyzeDuct(grid, ctx);
    }
    if (cycCount > 0) rotateDuct(grid, tick, p0);
  }

  /* 分析：洪泛闭空腔 → 列气段 → 段升降性 → 水平层定向 → 竖段定向 → 提取环存进 cycBuf */
  function analyzeDuct(grid, ctx) {
    var A = Balance.AIR;
    var minCyc = A.DUCT_MIN_CYCLE, margin = A.DUCT_COL_MARGIN;
    var minLegH = A.DUCT_MIN_LEG_H, minDrive = A.DUCT_MIN_DRIVE;

    var w = grid.w, h = grid.h, n = grid.n;
    var el = grid.element, temp = grid.temp, stamp = grid.moveStamp;
    var tick = ctx.tick;
    _w = w; _h = h; _cav = cavId; _dirF = dirF; _cnt = 0;

    var i, j, x, y, row, ii, r, k, xx;

    /* ---- 1) 闭空腔洪泛：cavId 1..ncav；cavOK=1 表示未触及画布边界 ---- */
    cavId.fill(0);
    for (i = 0; i < n; i++) if (!IS_GAS[el[i]]) cavId[i] = -1;
    var ncav = 0, qh, qt, ci, cj, cx, cy, sum, cnt, edge, closed = 0;
    for (i = 0; i < n; i++) {
      if (cavId[i] !== 0) continue;
      ncav++;
      qh = 0; qt = 0; queue[qt++] = i; cavId[i] = ncav;
      sum = 0; cnt = 0; edge = 0;
      while (qh < qt) {
        ci = queue[qh++];
        cy = (ci / w) | 0; cx = ci - cy * w;
        sum += temp[ci]; cnt++;
        if (cx === 0 || cy === 0 || cx === w - 1 || cy === h - 1) edge = 1;
        if (cx > 0) { cj = ci - 1; if (cavId[cj] === 0 && IS_GAS[el[cj]]) { cavId[cj] = ncav; queue[qt++] = cj; } }
        if (cx < w - 1) { cj = ci + 1; if (cavId[cj] === 0 && IS_GAS[el[cj]]) { cavId[cj] = ncav; queue[qt++] = cj; } }
        if (cy > 0) { cj = ci - w; if (cavId[cj] === 0 && IS_GAS[el[cj]]) { cavId[cj] = ncav; queue[qt++] = cj; } }
        if (cy < h - 1) { cj = ci + w; if (cavId[cj] === 0 && IS_GAS[el[cj]]) { cavId[cj] = ncav; queue[qt++] = cj; } }
      }
      cavSum[ncav] = sum; cavCnt[ncav] = cnt;
      cavOK[ncav] = edge ? 0 : 1;
      if (!edge) closed++;
    }
    if (closed === 0) { cycCount = 0; return; }   // 没有闭合空腔 → 开放场景零成本退出

    /* ---- 2) 列连续气段（run） ---- */
    var nr = 0, y0 = -1;
    for (x = 0; x < w; x++) {
      y0 = -1;
      for (y = 0; y <= h; y++) {
        ii = (y < h) ? (y * w + x) : -1;
        var isg = (ii >= 0 && IS_GAS[el[ii]]);
        if (isg && y0 < 0) y0 = y;
        if (!isg && y0 >= 0) {
          sum = 0; cnt = 0;
          for (k = y0; k < y; k++) { ii = k * w + x; sum += temp[ii]; cnt++; runId[ii] = nr; }
          runSum[nr] = sum; runCnt[nr] = cnt;
          runY0[nr] = y0; runY1[nr] = y - 1; runX[nr] = x;
          nr++; y0 = -1;
        }
      }
    }

    /* ---- 3) 段升降性：runMean vs 所在空腔均温 ---- */
    for (r = 0; r < nr; r++) {
      var cid = cavId[runY0[r] * w + runX[r]];
      var cm = (cid > 0 && cavCnt[cid] > 0) ? cavSum[cid] / cavCnt[cid] : 0;
      var rm = runCnt[r] > 0 ? runSum[r] / runCnt[r] : cm;
      if (cid <= 0 || !cavOK[cid]) runRise[r] = 0;
      else if (rm > cm + margin) runRise[r] = 1;
      else if (rm < cm - margin) runRise[r] = -1;
      else runRise[r] = 0;
    }

    /* ---- 4) 水平层定向：pass0 = 顶横（头顶固体），pass1 = 底横（脚下固体） ---- */
    dirF.fill(0);
    var pass, wantUp, x0, x1, legCnt, rmMax, rmMin, xHot, xCold, xExit, layDir, d, hh;

    for (pass = 0; pass < 2; pass++) {
      wantUp = (pass === 0);
      for (y = 1; y < h - 1; y++) {
        row = y * w;
        x = 0;
        while (x < w) {
          ii = row + x;
          if (!(cavId[ii] > 0 && cavOK[cavId[ii]]) ||
              !(wantUp ? !IS_GAS[el[ii - w]] : !IS_GAS[el[ii + w]])) { x++; continue; }
          x0 = x;
          while (x < w) {
            ii = row + x;
            if (!(cavId[ii] > 0 && cavOK[cavId[ii]]) ||
                !(wantUp ? !IS_GAS[el[ii - w]] : !IS_GAS[el[ii + w]])) break;
            x++;
          }
          x1 = x - 1;

          /* 段内竖腿统计：够不够两根腿？最热/最冷腿在哪？ */
          legCnt = 0; rmMax = -1e300; rmMin = 1e300; xHot = -1; xCold = -1; xExit = -1;
          for (xx = x0; xx <= x1; xx++) {
            r = runId[row + xx];
            if (r < 0) continue;
            hh = runY1[r] - runY0[r] + 1;
            if (hh < minLegH) continue;
            legCnt++;
            var rm2 = runSum[r] / runCnt[r];
            if (rm2 > rmMax) { rmMax = rm2; xHot = xx; }
            if (rm2 < rmMin) { rmMin = rm2; xCold = xx; }
          }
          if (legCnt < 2 || xHot < 0 || xCold < 0 || (rmMax - rmMin) < minDrive) continue;

          /* 整段统一方向：顶横 热→冷；底横 冷→热 */
          layDir = ((xHot < xCold) === wantUp) ? 1 : 2;
          /* 出口 = 沿流向最远的那根"该竖向钻"的腿 */
          for (xx = x0; xx <= x1; xx++) {
            r = runId[row + xx];
            if (r < 0) continue;
            hh = runY1[r] - runY0[r] + 1;
            if (hh < minLegH) continue;
            var q = wantUp ? (runRise[r] < 0) : (runRise[r] > 0);
            if (!q) continue;
            if (xExit < 0) xExit = xx;
            else if (layDir === 1) { if (xx > xExit) xExit = xx; }
            else { if (xx < xExit) xExit = xx; }
          }
          /* 落方向（已被 pass0 认领的格 pass1 不再覆盖） */
          for (xx = x0; xx <= x1; xx++) {
            i = row + xx;
            if (dirF[i] !== 0) continue;
            r = runId[i];
            hh = (r >= 0) ? (runY1[r] - runY0[r] + 1) : 1;
            if (hh >= minLegH && xx === xExit) d = wantUp ? 4 : 3;   // 唯一的竖向出口
            else d = layDir;                                          // 其余一律走层方向
            _setDir(i, d);
          }
        }
      }
    }

    /* ---- 5) 竖段内部：整段同向（上升段向上 / 下沉段向下） ---- */
    for (i = 0; i < n; i++) {
      if (dirF[i] !== 0) continue;
      if (!(cavId[i] > 0 && cavOK[cavId[i]])) continue;
      r = runId[i];
      if (r < 0) continue;
      if (runRise[r] > 0) _setDir(i, 3);
      else if (runRise[r] < 0) _setDir(i, 4);
    }
    if (_cnt === 0) { cycCount = 0; return; }
    ductLane = _cnt;

    /* ---- 6) 环提取：只把环**存进 cycBuf**，真正的转动在 rotateDuct（每帧）----
     * 本步不含随机、不含 swap，纯粹是把方向场里的环找出来；存下来后，
     * 后续帧可以直接照着转动，不必每帧重扫一遍全网格。 */
    cycCount = 0;
    var used = 0;
    cVis.fill(0);
    var start = (tick * 7919) % n;                       // 起点随 tick 旋转 → 各列轮流被"先走到"
    for (var s2 = 0; s2 < n; s2++) {
      var i0 = start + s2; if (i0 >= n) i0 -= n;
      if (cVis[i0]) continue;
      if (dirF[i0] === 0) { cVis[i0] = 1; continue; }
      var top = 0, cur = i0;
      while (true) {
        if (cVis[cur]) break;
        if (cPos[cur] >= 0) {                            // 走回自己路径上的点 → 成环
          var len = top - cPos[cur];
          if (len >= minCyc && used + len <= n) {
            cycOff[cycCount] = used; cycLen[cycCount] = len; cycCount++;
            for (var k4 = cPos[cur]; k4 < top; k4++) cycBuf[used++] = cStk[k4];
          }
          break;
        }
        cPos[cur] = top; cStk[top++] = cur;
        var d2 = dirF[cur];
        if (d2 === 0) break;
        cur = d2 === 1 ? cur + 1 : (d2 === 2 ? cur - 1 : (d2 === 3 ? cur - w : cur + w));
      }
      for (var k3 = 0; k3 < top; k3++) { cVis[cStk[k3]] = 1; cPos[cStk[k3]] = -1; }
    }
    if (cycCount === 0) return;

    /* 环存储顺序 = 沿路径推进的顺序（cStk[p] → cStk[p+1] → … → 回到 cStk[p]），
     * 与 dirF 的"向前"一致，rotateDuct 直接按 cycBuf[o+k] → cycBuf[o+k+1] 推即可。 */
  }

  /* 转动：对每条缓存的环掷**一个**骰子，中了就整环前移一格（k 元轮换 = k−1 次 swap）。
   * 每 tick 都调用（与分析解耦），所以环流速度不受分析隔帧影响。 */
  function rotateDuct(grid, tick, p0) {
    var el = grid.element, stamp = grid.moveStamp, fd = grid.flowDir;
    ductMoved = 0; ductCycles = 0;
    for (var c = 0; c < cycCount; c++) {
      var off = cycOff[c], len = cycLen[c];
      /* ★安全门：环是缓存的，玩家可能在这几帧里把墙画进来了。转动前必须确认环上
       * 每一格还是气体 —— 否则会把 WALL 和 AIR 对调（直接破坏世界）。
       * 任一一格变质 → 本条环本帧不动，并把 cycCount 打上"需重分析"的标记。 */
      var alive = 1;
      for (var v = 0; v < len; v++) if (!IS_GAS[el[cycBuf[off + v]]]) { alive = 0; break; }
      if (!alive) { _forceAnalyze = 1; continue; }   // 下一帧重新分析（不是每帧清零）
      var seedX = cycBuf[off] & 255, seedY = (cycBuf[off] >> 8) & 255;
      if (RNG.hash01(seedX, seedY, tick * 3301 + 17) >= p0) continue;
      ductCycles++;
      for (var k2 = len - 1; k2 >= 1; k2--) {            // 逆序 swap = 整环前移一格
        var a1 = cycBuf[off + k2 - 1], b1 = cycBuf[off + k2];
        grid.swap(a1, b1);                               // 温度/age/latent/tint 一起搬
        stamp[a1] = tick; stamp[b1] = tick;
        /* ★为什么不能直接用 grid.markFlow(a1, b1)（v1.6.8 实测踩坑）：
         *   markFlow(i,j) 的语义是「i 记 i→j 的方向，**j 记 j→i 的方向**」—— 对单次
         *   位移是对的（i 是主动搬的那个）。但整环旋转是**一串逆序 swap**，同一格会先
         *   作为某次 swap 的 j（被记成反向），再作为下一次 swap 的 i；由于逆序推进，
         *   最终留下的永远是**最后一次**写入 = 反向。实测后果：顶横 x12..20 九格里
         *   8 格被写成 W，V34 的 E−W 净标记变成 **−3169**（环明明在向东流，
         *   渲染拖影却指向西）。
         *   所以这里两格都直接写**沿环向前**的方向位（dirF 存的就是每格的向前方向），
         *   与 markFlow 的位约定 1=E 2=W 4=N 8=S 对齐（DUCT_BIT 做这次映射）。 */
        fd[a1] = DUCT_BIT[dirF[a1]];
        fd[b1] = DUCT_BIT[dirF[b1]];
        ductMoved++;
      }
    }
  }
  /* ============================================================================
   * ★v1.6.9 开口烟道贯穿流（flueFlow）—— 两端开口的 S 形烟道
   *
   * 与 ductFlow（闭合空腔 → 整环 k 元轮换）是**两套物理**：
   *   · ductFlow：四壁封死的闭合气道。因为 swap 守恒，只能让整条环一起前进一步。
   *   · flueFlow：两端连着大气的开口气道（烟囱 / 烟道）。没有环，但有**边界源汇** ——
   *     物质能真正离开出口、从入口补进，于是可以有净贯穿流。
   *
   * 为什么这是本项目里唯一可行的第二条路（定理复习，见 balance.js FLUE_* 注释）：
   *   满格晶格上任意割集净通量恒为 0 ⇒ 每格独立掷骰的定向输运期望值一律为 0。
   *   所以闸门粒度必须是**整条烟道一个骰子**：同一 tick 内所有车道一起前移一格。
   *
   * "链"上怎么做到整体前移（不像环那样能 k 元轮换）：
   *   顺序 swap 在链上只能做出两两转置（净位移 0）或"末端一格滑到首端"（瞬移，不物理）。
   *   ⇒ 改用 grid.moveTo 的**链式前移 + 边界源汇**：
   *        for k = len−2 … 0:  moveTo(lane[k] → lane[k+1])
   *     moveTo 语义 = "内容搬到目标格，源格重置为环境温 AIR"，于是
   *       通道末端 → 真正推进大气（lane 尾部延伸 FLUE_SINK 格到开放空间 → 烟是冒出去的）；
   *       lane[0]  → 每步由大气补进一格环境温空气。
   *     进出各 1 格严格配平，净效果 = 通道内容整体前移一格 ⇒ 示踪剂真的贯穿。
   *
   * 几何识别（O(n)，只在分析帧跑）：
   *   ① 水平/竖直**气体游程**：任一侧 ≤ FLUE_MAX_W ⇒ 该格是被固体夹住的"窄通道格"。
   *      （S 形烟道：水平段竖直游程 9、竖直段水平游程 9 → 命中；开放空间两个游程都大 → 不命中。）
   *   ② 窄通道 4-连通分量 = 一条烟道（取最大且长度 ≥ FLUE_MIN_LEN 的那条）。
   *   ③ 洞口（mouth）= 通道格且四邻有"通向画布边界的开放气体"—— **大气必须是真大气**：
   *      开放气体区要触及画布边界才算大气。密封房间里的通道因此**不会**被本机制驱动，
   *      这在物理上是对的（密封房间里不可能有净贯穿流，守恒把它锁死了）。
   *   ④ 洞口按连通聚类 → 取"最低的那一簇"= A、"最高的那一簇"= B。
   *   ⑤ 车道 = 分量内 A→B 的 BFS 最短路，逐条把已用格标记掉再找下一条（顶点不相交），
   *      最多 FLUE_MAX_LANES 条；每条尾部再向出口外的开放空间延伸 FLUE_SINK 格。
   *   ⑥ 抽力 drive = ½·(b_A + b_B)·(y_A − y_B)（烟囱效应，见 balance.js FLUE_* 注释）；
   *      drive < 0 时把整条车道反向（冷气从高位洞口倒灌下去）。
   *
   * 性能 / 回归：分析隔帧（FLUE_ANALYZE_INTERVAL）、转动每帧；无热驱动（pendingDrive=false）
   * 且当前没有烟道时整个机制不执行；开放场景在 ① 步之后就以 nCor < FLUE_MIN_LEN 早退。
   * ========================================================================== */
  var narrowH = null, narrowV = null, corM = null, compM = null, compCnt = null;
  var openId = null, openTouch = null, openSum = null, openCnt = null;
  var corQ = null, fQ = null, fPrev = null, fSt = null;
  var mClus = null, mouthQ = null, d2b = null, mNb = null;
  var laneUsed = null, laneBuf = null, laneDir = null, laneOff = null, laneLen = null;
  var laneCount = 0, laneCells = 0;
  var flueMoved = 0, flueLanes = 0, flueOn = 0, flueDrive = 0, _flueForce = 1;
  var _flueW = 0, _flueH = 0;
  var fGen = 0;
  var clusY = new Float64Array(64), clusN = new Int32Array(64);
  var _fireId = -1;
  /* 诊断计数器（只写不读，供 _diag_flue.js / QA 直接下断言；热路径上是几条整数赋值） */
  var dbgCor = 0, dbgComp = 0, dbgBest = 0, dbgMouth = 0, dbgClus = 0, dbgPlen = 0, dbgOpen = 0;
  var dbgTgt = 0, dbgQt = 0, dbgNCor2 = 0, dbgWall = 0, dbgTh = 0, dbgDmax = 0;

  function fireId() {
    if (_fireId < 0) {
      var E = root.YS.Elements && root.YS.Elements.ID;
      _fireId = E ? (E.FIRE || 0) : 0;
    }
    return _fireId;
  }

  function ensureFlue(n) {
    if (!corM || corM.length < n) {
      narrowH = new Uint8Array(n); narrowV = new Uint8Array(n);
      corM = new Uint8Array(n); compM = new Int32Array(n); compCnt = new Int32Array(n);
      openId = new Int32Array(n); openTouch = new Uint8Array(n);
      openSum = new Float64Array(n); openCnt = new Int32Array(n);
      corQ = new Int32Array(n); fQ = new Int32Array(n);
      fPrev = new Int32Array(n); fSt = new Int32Array(n);
      mClus = new Int32Array(n); mouthQ = new Int32Array(n);
      d2b = new Uint8Array(n); mNb = new Uint8Array(n);
      laneUsed = new Uint8Array(n);
      /* 车道缓冲为什么只要 n 格：所有车道**顶点不相交**，总格数 ≤ 通道格数 ≤ n。 */
      laneBuf = new Int32Array(n); laneDir = new Uint8Array(n);
      laneOff = new Int32Array(64); laneLen = new Int32Array(64);
      return 1;
    }
    return 0;
  }

  /* 相对密度（环境温空气 = 1；热 → <1）。用于烟囱抽力，与 pressure.js::computeHead 同口径。 */
  function rhoRel(t, amb) { var d = t + 273; return d > 1 ? (amb + 273) / d : 1; }

  function analyzeFlue(grid, ctx) {
    var A = Balance.AIR;
    var maxW = A.FLUE_MAX_W, minLen = A.FLUE_MIN_LEN;
    var maxLanes = A.FLUE_MAX_LANES, sinkN = A.FLUE_SINK | 0;
    laneCount = 0; laneCells = 0; flueDrive = 0; dbgWall = 0;
    if (!(maxW > 0) || !(minLen > 0)) return;

    var w = grid.w, h = grid.h, n = grid.n;
    var el = grid.element, temp = grid.temp;
    var amb = ctx.ambient !== undefined ? ctx.ambient : Balance.PHYS.AMBIENT_T;
    var fid = fireId();
    var i, j, x, y, row, xx, yy, v, q, qh, qt, ci, cx, cy, cnt, k2;

    /* ---- ① 水平 / 竖直气体游程 → 窄通道标记 ---- */
    narrowH.fill(0); narrowV.fill(0);
    for (y = 0; y < h; y++) {
      row = y * w; x = 0;
      while (x < w) {
        if (!IS_GAS[el[row + x]]) { x++; continue; }
        xx = x;
        while (x < w && IS_GAS[el[row + x]]) x++;
        if (x - xx <= maxW) for (i = row + xx; i < row + x; i++) narrowH[i] = 1;
      }
    }
    for (x = 0; x < w; x++) {
      y = 0;
      while (y < h) {
        if (!IS_GAS[el[y * w + x]]) { y++; continue; }
        yy = y;
        while (y < h && IS_GAS[el[y * w + x]]) y++;
        if (y - yy <= maxW) for (i = yy; i < y; i++) narrowV[i * w + x] = 1;
      }
    }
    var nCor = 0;
    for (i = 0; i < n; i++) {
      /* FIRE 排除：火焰是持续放热的反应前沿，被整条搬运会破坏已标定的燃烧蔓延。 */
      if (IS_GAS[el[i]] && el[i] !== fid && (narrowH[i] || narrowV[i])) { corM[i] = 1; nCor++; }
      else corM[i] = 0;
    }
    dbgCor = nCor; dbgComp = 0; dbgBest = 0; dbgMouth = 0; dbgClus = 0; dbgPlen = 0;
    if (nCor < minLen) return;                     // 开放场景在这里就退出（零副作用）

    /* ---- ② 开放空间（非窄通道气体）洪泛：只有触及画布边界的开放区才算"大气" ----
     *
     * ★为什么还要"吸收密封气窝"（这一条不加，S 形烟道会被识别成 5 段互不相连的碎管）：
     *   "窄通道"判据是"水平游程 ≤ W 或 竖直游程 ≤ W"。在**转角腔**（竖管插进横管的那一块
     *   W×W 方腔）里，横管的长游程与竖管的长游程**叠在一起** → 两个游程都 > W → 判据判成
     *   "不是通道" → 烟道在四个转角处被切成 5 段，最大的一段只有 1386 格、两个洞口还一样高
     *   （抽力 = 0，实测车道数 0）。
     *   但转角腔在几何上是**密封气窝**：它的四邻只有通道格与墙，**不连通大气**（openTouch=0）。
     *   于是判据补一条：不触边、且贴着窄通道、且体积 ≤ W² 的密封气窝 → 整体并入通道。
     *   体积上限 W² 是必要的闸门：比 W² 大的密封区是"房间"而不是"转角腔"（房间不该被当成
     *   管道内壁，否则一整间屋子会被整条搬动）。
     *   跑两遍是为了让"窝贴窝"的级联也能合进来（第二遍把第一遍新并进的格当通道基准）。 */
    var maxPocket = maxW * maxW;
    var nOpen = 0;
    for (var op = 0; op < 2; op++) {
      openId.fill(0); openTouch.fill(0);
      nOpen = 0;
      for (i = 0; i < n; i++) {
        if (!IS_GAS[el[i]] || corM[i] || openId[i] !== 0) continue;
        nOpen++;
        qh = 0; qt = 0; corQ[qt++] = i; openId[i] = nOpen;
        var sO = 0, cO = 0, edge = 0, nbCor = 0;
        while (qh < qt) {
          ci = corQ[qh++]; cy = (ci / w) | 0; cx = ci - cy * w;
          sO += temp[ci]; cO++;
          if (cx === 0 || cy === 0 || cx === w - 1 || cy === h - 1) edge = 1;
          if (cx > 0) { j = ci - 1; if (openId[j] === 0 && IS_GAS[el[j]] && !corM[j]) { openId[j] = nOpen; corQ[qt++] = j; } else if (corM[j]) nbCor = 1; }
          if (cx < w - 1) { j = ci + 1; if (openId[j] === 0 && IS_GAS[el[j]] && !corM[j]) { openId[j] = nOpen; corQ[qt++] = j; } else if (corM[j]) nbCor = 1; }
          if (cy > 0) { j = ci - w; if (openId[j] === 0 && IS_GAS[el[j]] && !corM[j]) { openId[j] = nOpen; corQ[qt++] = j; } else if (corM[j]) nbCor = 1; }
          if (cy < h - 1) { j = ci + w; if (openId[j] === 0 && IS_GAS[el[j]] && !corM[j]) { openId[j] = nOpen; corQ[qt++] = j; } else if (corM[j]) nbCor = 1; }
        }
        openSum[nOpen] = sO; openCnt[nOpen] = cO; openTouch[nOpen] = edge ? 1 : 0;
        if (!edge && nbCor && cO <= maxPocket) {
          for (k2 = 0; k2 < qt; k2++) corM[corQ[k2]] = 1;
          nCor += qt;
        }
      }
    }
    dbgOpen = nOpen;

    /* ---- ③ 窄通道连通分量，取最大且够长的一条 ---- */
    compM.fill(0);
    var nComp = 0, bestComp = 0, bestCnt = 0;
    for (i = 0; i < n; i++) {
      if (!corM[i] || compM[i] !== 0) continue;
      nComp++;
      qh = 0; qt = 0; corQ[qt++] = i; compM[i] = nComp; cnt = 0;
      while (qh < qt) {
        ci = corQ[qh++]; cnt++; cy = (ci / w) | 0; cx = ci - cy * w;
        if (cx > 0) { j = ci - 1; if (corM[j] && compM[j] === 0) { compM[j] = nComp; corQ[qt++] = j; } }
        if (cx < w - 1) { j = ci + 1; if (corM[j] && compM[j] === 0) { compM[j] = nComp; corQ[qt++] = j; } }
        if (cy > 0) { j = ci - w; if (corM[j] && compM[j] === 0) { compM[j] = nComp; corQ[qt++] = j; } }
        if (cy < h - 1) { j = ci + w; if (corM[j] && compM[j] === 0) { compM[j] = nComp; corQ[qt++] = j; } }
      }
      compCnt[nComp] = cnt;
      if (cnt >= minLen && cnt > bestCnt) { bestCnt = cnt; bestComp = nComp; }
    }
    dbgComp = nComp; dbgBest = bestCnt;
    if (bestComp === 0) return;
    /* 重灌一次选中的分量：corQ[0..bestCnt-1] = 它的全部格 */
    qh = 0; qt = 0;
    for (i = 0; i < n; i++) if (compM[i] === bestComp) corQ[qt++] = i;
    cnt = qt;

    /* ---- ③b ★"烟道必须由墙围成"闸门（FLUE_WALL_FRAC）----
     *
     * 为什么必须加：只靠"窄通道 + ≥2 个洞口聚类"会把**开放空气中的上升羽流**也认成烟道
     * （羽流的水平游程 ≤ FLUE_MAX_W，上下都通向大气 ⇒ 判据全过）。实测 V25 的烧水锅上方
     * 就被架起一条 776 格的隐形输送带，凭空改写输运 → 余水 127 → 110（跌破 30% 门槛）。
     * 物理区分很干净：**烟道的边界是墙，羽流的边界是空气**。
     * 统计口径 = 4-邻接接触面（通道格 × 非通道邻格），数其中邻格非气体的占比。
     * 实测：S 形烟道 ≈0.98（贴壁接触面 ≈1000、洞口空气接触面 ≈18）；锅上方羽流 ≈0.05。
     */
    var wallFracMin = A.FLUE_WALL_FRAC;
    if (typeof wallFracMin === 'number' && isFinite(wallFracMin) && wallFracMin > 0) {
      var nbTot = 0, nbSolid = 0;
      for (q = 0; q < cnt; q++) {
        i = corQ[q]; cy = (i / w) | 0; cx = i - cy * w;
        if (cx > 0) { j = i - 1; if (!corM[j]) { nbTot++; if (IS_RIGID[el[j]]) nbSolid++; } }
        if (cx < w - 1) { j = i + 1; if (!corM[j]) { nbTot++; if (IS_RIGID[el[j]]) nbSolid++; } }
        if (cy > 0) { j = i - w; if (!corM[j]) { nbTot++; if (IS_RIGID[el[j]]) nbSolid++; } }
        if (cy < h - 1) { j = i + w; if (!corM[j]) { nbTot++; if (IS_RIGID[el[j]]) nbSolid++; } }
      }
      dbgWall = nbTot > 0 ? (nbSolid * 100 / nbTot) | 0 : 0;
      if (nbTot === 0 || nbSolid < wallFracMin * nbTot) return;
    } else {
      dbgWall = -1;
    }

    /* ---- ④ 洞口（mouth）= 通道格且四邻有"通向画布边界的开放气体" ---- */
    var mCnt = 0;
    mClus.fill(0);
    for (q = 0; q < cnt; q++) {
      i = corQ[q]; cy = (i / w) | 0; cx = i - cy * w;
      var isM = 0;
      if (cx > 0) { j = i - 1; if (IS_GAS[el[j]] && !corM[j] && openTouch[openId[j]]) isM = 1; }
      if (!isM && cx < w - 1) { j = i + 1; if (IS_GAS[el[j]] && !corM[j] && openTouch[openId[j]]) isM = 1; }
      if (!isM && cy > 0) { j = i - w; if (IS_GAS[el[j]] && !corM[j] && openTouch[openId[j]]) isM = 1; }
      if (!isM && cy < h - 1) { j = i + w; if (IS_GAS[el[j]] && !corM[j] && openTouch[openId[j]]) isM = 1; }
      if (isM) { mouthQ[mCnt++] = i; mClus[i] = -1; }   // −1 = 是洞口，尚未归类
    }
    dbgMouth = mCnt;
    if (mCnt < 2) return;

    /* ---- ⑤ 洞口聚类（只在洞口格之间 4-连通）---- */
    var nCl = 0;
    for (q = 0; q < mCnt; q++) {
      i = mouthQ[q];
      if (mClus[i] !== -1) continue;
      nCl++;
      if (nCl >= 64) break;
      qh = 0; qt = 0; corQ[qt++] = i; mClus[i] = nCl;
      while (qh < qt) {
        ci = corQ[qh++]; cy = (ci / w) | 0; cx = ci - cy * w;
        if (cx > 0) { j = ci - 1; if (mClus[j] === -1) { mClus[j] = nCl; corQ[qt++] = j; } }
        if (cx < w - 1) { j = ci + 1; if (mClus[j] === -1) { mClus[j] = nCl; corQ[qt++] = j; } }
        if (cy > 0) { j = ci - w; if (mClus[j] === -1) { mClus[j] = nCl; corQ[qt++] = j; } }
        if (cy < h - 1) { j = ci + w; if (mClus[j] === -1) { mClus[j] = nCl; corQ[qt++] = j; } }
      }
    }
    dbgClus = nCl;
    if (nCl < 2) return;
    var cA = 0, cB = 0, yA = -1e300, yB = 1e300, c;
    for (c = 1; c <= nCl; c++) { clusY[c] = 0; clusN[c] = 0; }
    for (q = 0; q < mCnt; q++) {
      i = mouthQ[q]; var id2 = mClus[i];
      if (id2 <= 0 || id2 > nCl) continue;
      clusY[id2] += (i / w) | 0; clusN[id2]++;
    }
    for (c = 1; c <= nCl; c++) {
      if (clusN[c] === 0) continue;
      var my = clusY[c] / clusN[c];
      clusY[c] = my;
      if (my > yA) { yA = my; cA = c; }            // A = 最低的洞口（y 最大）
      if (my < yB) { yB = my; cB = c; }            // B = 最高的洞口（y 最小）
    }
    if (cA === 0 || cB === 0 || cA === cB) return;

    /* ---- ⑥ 抽力（烟囱效应）：洞口气温 vs 大气气温 ---- */
    var sA = 0, nA = 0, sB = 0, nB = 0;
    var bestRegion = -1, bestRC = 0;
    for (q = 0; q < mCnt; q++) {
      i = mouthQ[q]; cy = (i / w) | 0; cx = i - cy * w;
      if (mClus[i] === cA) { sA += temp[i]; nA++; }
      else if (mClus[i] === cB) { sB += temp[i]; nB++; }
      if (cx > 0) { j = i - 1; if (openId[j] > 0 && openCnt[openId[j]] > bestRC) { bestRC = openCnt[openId[j]]; bestRegion = openId[j]; } }
      if (cx < w - 1) { j = i + 1; if (openId[j] > 0 && openCnt[openId[j]] > bestRC) { bestRC = openCnt[openId[j]]; bestRegion = openId[j]; } }
      if (cy > 0) { j = i - w; if (openId[j] > 0 && openCnt[openId[j]] > bestRC) { bestRC = openCnt[openId[j]]; bestRegion = openId[j]; } }
      if (cy < h - 1) { j = i + w; if (openId[j] > 0 && openCnt[openId[j]] > bestRC) { bestRC = openCnt[openId[j]]; bestRegion = openId[j]; } }
    }
    var Tout = (bestRegion > 0 && openCnt[bestRegion] > 0) ? (openSum[bestRegion] / openCnt[bestRegion]) : amb;
    var TA = nA > 0 ? sA / nA : amb, TB = nB > 0 ? sB / nB : amb;
    var bA = rhoRel(Tout, amb) - rhoRel(TA, amb);
    var bB = rhoRel(Tout, amb) - rhoRel(TB, amb);
    flueDrive = 0.5 * (bA + bB) * (yA - yB);

    /* ---- ⑦ 车道：沿**中轴**的 A→B 通路，逐条标记已用格再找下一条（顶点不相交）----
     *
     * ★★为什么必须"走中轴"（不走中轴就永远只能找到 1 条车道，实测坐实）：
     *   普通 BFS 最短路在转角处一定**抄内角**（内角近、步数少）。抄内角的那条竖段会横跨
     *   整条横管的**整个截面**（S 形里是 9 行全占），于是把横管**拦腰切断** —— 实测：找到
     *   第 1 条车道（513 格）后剩余通道被切成互不相连的两半，入口再也走不到出口
     *   （dbgTgt = −1 → 车道数恒为 1，只有 1/9 截面的物质在动）。
     *   （试过"贴壁格延后一层的 0-1 BFS"：它只会贴着壁内侧走，**照样抄内角**，仍然切断。）
     *   反过来，车道走**中轴**时被挖掉后剩下"两侧各若干行"，仍然连通 ⇒ 可以从中间往外
     *   一层层剥（像削洋葱），把整个截面占满。
     *
     * 实现 = "净空场 + 阈值扫"：
     *   ① d2b[i] = 通道内到最近**刚性壁**的 BFS 距离（多源 O(分量)）—— 这就是截面上的
     *      "离壁净空"，9 格宽的通道里中轴净空 5、贴壁 1。
     *      ★★种子只认**刚性**（IS_RIGID，见 ensureGasTable），不认"任何非通道格"。
     *      为什么（实测踩出来的）：通道里飘着一颗冷凝水滴 / 一粒沙子，它也是"非通道格"，
     *      以它为种子会让周围一圈的净空塌到 1~2 ⇒ 阈值扫一路掉到 2 ⇒ 车道重新贴壁 ⇒
     *      又只剩 1 条（实测：入口注蒸汽后通道里结出的水滴把全通道净空压到 ≤4，车道数恒 1）。
     *      换成"只认刚性壁"后，水滴不参与净空（它本来也不是车道能走的格），中轴净空恢复 5。
     *   ② 车道只允许走 `d2b >= t` 的格；t 从 dmax 往下扫，找到第一条通路就用它。
     *      t 只在全局单调下降 —— 于是车道天然按"中轴 → 次中轴 → … → 贴壁"的顺序剥离。
     *   ③ 洞口（mouth）格净空恒为 1（它旁边就是大气），所以**洞口格及其邻格豁免阈值**，
     *      否则路径在首尾两步进不去/出不来。
     */
    var dmax = 1;
    dbgDmax = 0;
    for (i = 0; i < n; i++) d2b[i] = 0;
    qh = 0; qt = 0;
    for (i = 0; i < n; i++) {
      if (!corM[i]) continue;
      cy = (i / w) | 0; cx = i - cy * w;
      if ((cx === 0 || IS_RIGID[el[i - 1]]) || (cx === w - 1 || IS_RIGID[el[i + 1]]) ||
          (cy === 0 || IS_RIGID[el[i - w]]) || (cy === h - 1 || IS_RIGID[el[i + w]])) { d2b[i] = 1; corQ[qt++] = i; }
    }
    while (qh < qt) {
      ci = corQ[qh++]; cy = (ci / w) | 0; cx = ci - cy * w;
      var dv = d2b[ci] + 1;
      if (dv > 63) dv = 63;
      if (cx > 0) { j = ci - 1; if (corM[j] && d2b[j] === 0) { d2b[j] = dv; corQ[qt++] = j; if (dv > dmax) dmax = dv; } }
      if (cx < w - 1) { j = ci + 1; if (corM[j] && d2b[j] === 0) { d2b[j] = dv; corQ[qt++] = j; if (dv > dmax) dmax = dv; } }
      if (cy > 0) { j = ci - w; if (corM[j] && d2b[j] === 0) { d2b[j] = dv; corQ[qt++] = j; if (dv > dmax) dmax = dv; } }
      if (cy < h - 1) { j = ci + w; if (corM[j] && d2b[j] === 0) { d2b[j] = dv; corQ[qt++] = j; if (dv > dmax) dmax = dv; } }
    }
    dbgDmax = dmax;
    /* 洞口格及其 4 邻豁免净空阈值（首尾各 1~2 步） */
    for (i = 0; i < n; i++) mNb[i] = 0;
    for (q = 0; q < mCnt; q++) {
      i = mouthQ[q]; cy = (i / w) | 0; cx = i - cy * w;
      mNb[i] = 1;
      if (cx > 0) mNb[i - 1] = 1;
      if (cx < w - 1) mNb[i + 1] = 1;
      if (cy > 0) mNb[i - w] = 1;
      if (cy < h - 1) mNb[i + w] = 1;
    }

    laneUsed.fill(0);
    var th = dmax;
    for (var lane = 0; lane < maxLanes; lane++) {
      var target = -1;
      while (target < 0 && th >= 1) {
        fGen++;
        qt = 0; qh = 0;
        for (q = 0; q < mCnt; q++) {
          i = mouthQ[q];
          if (mClus[i] !== cA || laneUsed[i]) continue;
          fQ[qt++] = i; fPrev[i] = -1; fSt[i] = fGen;
        }
        dbgQt = qt;
        if (qt === 0) break;
        while (qh < qt) {
          ci = fQ[qh++];
          if (mClus[ci] === cB) { target = ci; break; }
          cy = (ci / w) | 0; cx = ci - cy * w;
          if (cx > 0) { j = ci - 1; if (corM[j] && !laneUsed[j] && (d2b[j] >= th || mNb[j]) && fSt[j] !== fGen) { fSt[j] = fGen; fPrev[j] = ci; fQ[qt++] = j; } }
          if (cx < w - 1) { j = ci + 1; if (corM[j] && !laneUsed[j] && (d2b[j] >= th || mNb[j]) && fSt[j] !== fGen) { fSt[j] = fGen; fPrev[j] = ci; fQ[qt++] = j; } }
          if (cy > 0) { j = ci - w; if (corM[j] && !laneUsed[j] && (d2b[j] >= th || mNb[j]) && fSt[j] !== fGen) { fSt[j] = fGen; fPrev[j] = ci; fQ[qt++] = j; } }
          if (cy < h - 1) { j = ci + w; if (corM[j] && !laneUsed[j] && (d2b[j] >= th || mNb[j]) && fSt[j] !== fGen) { fSt[j] = fGen; fPrev[j] = ci; fQ[qt++] = j; } }
        }
        if (target < 0) th--;
      }
      dbgTh = th;
      dbgTgt = target;
      if (target < 0) break;
      var plen = 0;
      for (i = target; i >= 0; i = fPrev[i]) plen++;
      dbgPlen = plen;
      if (plen < minLen) break;
      if (laneCells + plen + sinkN + 1 > n) break;

      var st = laneCells;
      var idx = st + plen - 1;
      for (i = target; i >= 0; i = fPrev[i]) { laneBuf[idx--] = i; }

      /* 尾部向出口外的开放空间延伸 FLUE_SINK 格 → 烟真正冒出出口（不是凭空消失）*/
      var lastC = laneBuf[st + plen - 1], preC = laneBuf[st + plen - 2];
      var dxs = (lastC % w) - (preC % w), dys = ((lastC / w) | 0) - ((preC / w) | 0);
      var total = plen, cur = lastC;
      for (var s2 = 0; s2 < sinkN; s2++) {
        var nx2 = (cur % w) + dxs, ny2 = ((cur / w) | 0) + dys;
        if (s2 === 0 && (nx2 < 0 || nx2 >= w || ny2 < 0 || ny2 >= h ||
                         !IS_GAS[el[ny2 * w + nx2]] || laneUsed[ny2 * w + nx2])) {
          /* 直着走不出去（拐角处常见）→ 换一个朝向大气的邻格再直着走 */
          var fx = cur % w, fy = (cur / w) | 0, found = -1;
          if (fx > 0 && canSink(grid, cur - 1)) found = cur - 1;
          else if (fx < w - 1 && canSink(grid, cur + 1)) found = cur + 1;
          else if (fy > 0 && canSink(grid, cur - w)) found = cur - w;
          else if (fy < h - 1 && canSink(grid, cur + w)) found = cur + w;
          if (found < 0) break;
          dxs = (found % w) - fx; dys = ((found / w) | 0) - fy;
          laneBuf[st + total] = found; total++; cur = found;
          continue;
        }
        if (nx2 < 0 || nx2 >= w || ny2 < 0 || ny2 >= h) break;
        j = ny2 * w + nx2;
        if (!IS_GAS[el[j]] || laneUsed[j]) break;
        laneBuf[st + total] = j; total++; cur = j;
      }
      if (total < 2) break;

      /* 方向位（1=E 2=W 4=N 8=S），供渲染拖影；两格都写"沿前进方向" */
      for (v = 0; v < total - 1; v++) {
        var a2 = laneBuf[st + v], b2 = laneBuf[st + v + 1];
        var ax2 = a2 % w, bx2 = b2 % w, ay2 = (a2 / w) | 0, by2 = (b2 / w) | 0;
        laneDir[st + v] = (bx2 > ax2) ? 1 : ((bx2 < ax2) ? 2 : ((by2 < ay2) ? 4 : 8));
      }
      laneDir[st + total - 1] = laneDir[st + total - 2];

      for (v = 0; v < total; v++) laneUsed[laneBuf[st + v]] = 1;
      if (laneCount >= 63) break;
      laneOff[laneCount] = st; laneLen[laneCount] = total; laneCount++;
      laneCells += total;
    }

    /* drive < 0（洞口气体重 → 下沉）→ 整条车道反向：高位洞口进、低位洞口出 */
    if (flueDrive < 0 && laneCount > 0) {
      for (var lc = 0; lc < laneCount; lc++) {
        var o = laneOff[lc], L2 = laneLen[lc];
        for (v = 0; v < (L2 >> 1); v++) {
          var t1 = laneBuf[o + v]; laneBuf[o + v] = laneBuf[o + L2 - 1 - v]; laneBuf[o + L2 - 1 - v] = t1;
        }
        for (v = 0; v < L2 - 1; v++) {
          var a3 = laneBuf[o + v], b3 = laneBuf[o + v + 1];
          var ax3 = a3 % w, bx3 = b3 % w, ay3 = (a3 / w) | 0, by3 = (b3 / w) | 0;
          laneDir[o + v] = (bx3 > ax3) ? 1 : ((bx3 < ax3) ? 2 : ((by3 < ay3) ? 4 : 8));
        }
        laneDir[o + L2 - 1] = laneDir[o + L2 - 2];
      }
    }
  }

  /* 车道尾部的"出口延伸格"候选：必须是**通向大气的开放气体**，且还没被别的车道占用 */
  function canSink(grid, j) {
    return IS_GAS[grid.element[j]] && !corM[j] && !laneUsed[j] && openId[j] > 0 && openTouch[openId[j]] === 1;
  }

  /* 转动：整条烟道**一个**骰子，中了就所有车道一起沿通道前移一格。 */
  function rotateFlue(grid, tick, amb) {
    var A = Balance.AIR;
    var d = flueDrive, ad = d < 0 ? -d : d;
    var p = (ad - A.FLUE_MIN_DRIVE) / A.FLUE_DRIVE_SCALE;
    if (p > A.FLUE_P_MAX) p = A.FLUE_P_MAX;
    if (!(p > 0)) return;
    if (RNG.hash01(23, 89, tick * 7703 + 29) >= p) return;   // ← 整条烟道唯一的那个骰子

    var el = grid.element, fd = grid.flowDir, stamp = grid.moveStamp;
    flueLanes = laneCount; flueMoved = 0;
    for (var c = 0; c < laneCount; c++) {
      var off = laneOff[c], len = laneLen[c];
      /* 安全门：车道是缓存的，玩家可能在这几帧里把墙画进来 / 把出口堵了。
       * 任一一格不再是气体 → 本条车道本帧不动，并打上"需重分析"标记。 */
      var alive = 1;
      for (var v = 0; v < len; v++) if (!IS_GAS[el[laneBuf[off + v]]]) { alive = 0; break; }
      if (!alive) { _flueForce = 1; continue; }
      /* flowDir：目标格写"本步前进方向"（每格只被写一次，不会被逆序覆盖） */
      for (v = 0; v < len - 1; v++) fd[laneBuf[off + v + 1]] = laneDir[off + v];
      fd[laneBuf[off]] = laneDir[off];
      /* ★链式前移：逆序 moveTo。
       * 为什么必须逆序：k 从大到小，moveTo 把 lane[k] 的内容搬到 lane[k+1] 并把 lane[k]
       * 重置为环境温 AIR —— 下一轮（k−1）会立刻把 lane[k−1] 的内容写进 lane[k]，
       * 所以中间那次"重置"被覆盖掉，最终只有 lane[0] 留着重置值 = 大气补气。
       * 正序写会把同一格内容一路复制到底并把整条清空（实测等价"整条变空气"）。 */
      for (var k3 = len - 2; k3 >= 0; k3--) {
        var a1 = laneBuf[off + k3], b1 = laneBuf[off + k3 + 1];
        grid.moveTo(a1, b1, amb);
        stamp[a1] = tick; stamp[b1] = tick;
        flueMoved++;
      }
    }
  }

  function flueFlow(grid, ctx) {
    var A = Balance.AIR;
    var pmax = A.FLUE_P_MAX;
    /* 悬空参数键闸门（本项目第六次栽在这上面）：非有限数值一律等同关闭。 */
    if (typeof pmax !== 'number' || !isFinite(pmax) || pmax <= 0) {
      if (flueOn) {
        flueOn = 0; laneCount = 0; laneCells = 0;
        flueMoved = 0; flueLanes = 0; flueDrive = 0; _flueForce = 1;
      }
      return;
    }
    if (!flueOn) _flueForce = 1;
    flueOn = 1;
    ensureGasTable();
    if (ensureFlue(grid.n) || _flueW !== grid.w || _flueH !== grid.h) {
      laneCount = 0; laneCells = 0; _flueW = grid.w; _flueH = grid.h; _flueForce = 1;
    }
    flueMoved = 0;
    var iv = A.FLUE_ANALYZE_INTERVAL;
    if (_flueForce || iv <= 1 || (ctx.tick % iv) === 0) { _flueForce = 0; analyzeFlue(grid, ctx); }
    if (laneCount > 0) rotateFlue(grid, ctx.tick, ctx.ambient !== undefined ? ctx.ambient : Balance.PHYS.AMBIENT_T);
    /* 自维持闸门：只有"真的找到了烟道"才在下一个 tick 继续自费分析；否则退回
     * "有热驱动才跑"，避免"没有烟道也每 8 帧白扫一遍全网格"。 */
    flueOn = laneCount > 0 ? 1 : 0;
  }

  function airPass(grid, ctx) {
    var A = Balance.AIR;
    var tick = ctx.tick;
    var interval = A.PASS_INTERVAL;
    if (interval > 1 && (tick % interval) !== 0) return;   // 隔帧降载

    var windOn = !!(ctx.wind && ctx.wind.strength > 0);
    if (!pendingDrive && !windOn) { lastDriven = 0; lastMoved = 0; return; }  // 无驱动空气 → 零成本
    /* v1.6.2 只保留顶边界热沉（thermal.js），不加梯度判据 —— 见 balance.js SKY_DEV_SCALE 注释。 */
    pendingDrive = false;

    var prevDriven = lastDriven;
    lastDriven = 0; lastMoved = 0;
    var split = prevDriven > A.HALF_SPLIT_THRESHOLD;       // 自适应：驱动格过多 → 奇偶列分半

    var w = grid.w, h = grid.h;
    var el = grid.element, temp = grid.temp, stamp = grid.moveStamp;
    var wind = ctx.wind;
    var amb = ctx.ambient !== undefined ? ctx.ambient : Balance.PHYS.AMBIENT_T;

    var buoyDt = A.BUOY_DT, negColdDt = -A.COLD_DT, scale = A.BUOY_SCALE, pmax = A.BUOY_P_MAX;
    var budget = A.MAX_MOVE_BUDGET;
    var windF = A.WIND_FACTOR, windMinDt = A.WIND_MIN_DT;
    var splitParity = tick & 1;
    /* v1.6.5 顶部边界横向铺开参数（C1-c）：H_MARGIN = 目标邻格至少凉的幅度；
     * H_SPREAD_F = 铺开概率相对同款竖直概率的折扣。 */
    var hMargin = A.H_MARGIN, hSpreadF = A.H_SPREAD_F, topSpreadRows = A.TOP_SPREAD_ROWS;
    /* v1.6.7 贴壁定向输运（几何判据，取代画布行判据 —— 见 balance.js 同名注释）：
     * 触发条件是「主驱动方向被挡住」，方向由**行窗平均**（复用本函数已构建的 preT/preC）判定。 */
    var wallR = A.WALL_SPREAD_R, wallF = A.WALL_SPREAD_F, wallMargin = A.WALL_SPREAD_MARGIN;
    var wallOn = wallR > 0 && wallF > 0 && hSpreadF > 0;   // H_SPREAD_F=0 = 关闭一切 airPass 横向铺开（V30 对照臂依赖此约定）
    var ambigR = A.AMBIG_RATIO;                            // 0 = 关闭歧义择向（沿用旧行为）
    var wallScan = A.WALL_SCAN;                            // 0 = 关闭空腔扫描（退回首版"按驱动方向"分类，供 A/B）
    var pushOn = A.WALL_PUSH, headScale = A.WALL_HEAD_SCALE, headF = A.WALL_HEAD_F;
    var headScaleInv = 1 / (headScale > 0 ? headScale : 20);
    var scanned = false;                                   // 本 airPass 内是否已扫过空腔（惰性）
    /* 行窗平均半径（规格 C1-b：≥ 两腿间距含中墙 ≈20–30 格；蛇形几何两腿中心距 24、
     * 腿间墙 15 格 → R=30 时冷腿格(最远离热腿的列)的窗口刚好覆盖热腿主体）。 */
    var R = A.ROW_REF_R;
    if (R > w - 1) R = w - 1;

    if (!preT || preT.length < w + 1) { preT = new Float32Array(w + 1); preC = new Float32Array(w + 1); }

    var leftToRight = (tick & 1) === 0;
    var moved = 0, driven = 0;
    var y, x, i, j, d, dDown, p, nx, ny, dx, ti, devG, xa, xb, c, ref, bj, bt;
    var upOK, dnOK, wantDown, cL, cR, mL, mR, diffT, dir, nj, towardHot, corr, hdDir, hdP;

    for (y = h - 1; y >= 1; y--) {                          // y=0 为天空层，不参与运动
      var row = y * w;
      /* 构建本行 AIR 温度/计数前缀和（墙/固体贡献 0 且计数不增 → 自动排除） */
      preT[0] = 0; preC[0] = 0;
      for (x = 0; x < w; x++) {
        i = row + x;
        preT[x + 1] = preT[x] + (el[i] === AIR ? temp[i] : 0);
        preC[x + 1] = preC[x] + (el[i] === AIR ? 1 : 0);
      }
      var x0 = leftToRight ? 0 : w - 1;
      var xend = leftToRight ? w : -1;
      var step = leftToRight ? 1 : -1;
      for (x = x0; x !== xend; x += step) {
        if (split && ((x & 1) !== splitParity)) continue;
        i = row + x;
        if (el[i] !== AIR) continue;
        if (stamp[i] === tick) continue;                   // 本 tick 已被移动过
        ti = temp[i];
        devG = ti - amb;

        /* ---- v1.6.5 局部密度参考 = 行窗平均（对环境温钳位）----
         * 窗口 [x−R, x+R]（截断到画布）内**空气格**的平均温度 mean4（墙/固体不计入 ——
         * 热源正上方的空气必须能上升，否则违反 A1/V1；窗口内无空气时取环境温）。
         * 钳位（v1.6.4 实测教训，见 balance.js AIR 组注释）：
         *   Δ↑ = T − min(mean4, amb)  —— 上升参考不会比环境温更"热"
         *   Δ↓ = T − max(mean4, amb)  —— 下沉参考不会比环境温更"冷"
         * 为什么必须保留 amb 这一侧：纯局部（行窗）参考是**自引用**的 —— 暖区把自己的行均
         * 抬高 → 驱动量趋零 → 热量被困在热源上方（实测 V25：392 格水 1200 tick 内全部汽化
         * 升顶逸出、质量归零；V4 同败）。保留 amb 后暖空气仍能升到顶边界由天空热沉排掉，
         * 蒸汽循环闭合（V24/V25 回归门）。冷腿下沉靠 max 一侧：行均被热腿拉高 → 冷腿格
         * 判冷 → 整腿下沉（规格 C1-b 的"看见另一条腿"）。 */
        xa = x - R; if (xa < 0) xa = 0;
        xb = x + R + 1; if (xb > w) xb = w;
        c = preC[xb] - preC[xa];
        ref = c > 0 ? (preT[xb] - preT[xa]) / c : amb;
        var refUp = ref < amb ? ref : amb;      // min(mean4, amb)
        var refDn = ref > amb ? ref : amb;      // max(mean4, amb)
        d = ti - refUp;                          // Δ↑
        dDown = ti - refDn;                      // Δ↓

        /* ★v1.6.7 空腔几何分类（corr：1=空腔顶 2=空腔底 0=都不是）—— 见 balance.js WALL_SCAN。
         * 只在本轮真的用得到它时才扫（wallScan 或 pushOn 至少一个开着）。 */
        corr = 0;
        if (wallOn && (wallScan || pushOn)) {
          if (!scanned) { ensureGasTable(); scanCavities(grid); scanned = true; }
          if (gasUp[i] === 0 && gasDn[i] === 1) corr = 1;
          else if (gasDn[i] === 0 && gasUp[i] === 1) corr = 2;
        }

        /* ★v1.6.7 水头项（只对空腔通道格，且只在 pushOn 时算）—— 见 balance.js WALL_PUSH：
         * 横通道中段被 WALL(k=0.60) 夹成 1 格高、上下都导热，气团进来几格就被吸到环境温 →
         * 它的"浮力驱动量" d≈0、dDown 也只有几度 → 概率只有 0.1 量级，热永远推不过通道中段。
         * 真热虹吸的横臂不是自己浮起来的，是被两条竖腿的**密度差（水头）推着走**的。本模型没有
         * 可用的压强场（Plan A 静压头实测太弱），就把水头直接写成输运概率：
         *   方向参考行取**往腔内一步**（空腔顶取 y+1、空腔底取 y−1）—— 通道中段因此读到的是两条
         *   **竖腿**的温度（热源一直在 → 不对称是持久的），而不是通道中段自己的等温噪声。 */
        hdDir = 0; hdP = 0;
        if (pushOn && corr) {
          /* ★安全门控：只有**薄横通道**（上下紧邻**都**不是气体，即 1 格高、夹在固体里的通道）
           * 才吃水头推送。为什么必须加这道门：开放场景的贴地空气 gasDn=0（脚下实心到底）会被
           * 判成空腔底，不加门它就会被推向热源 —— 实测 V25 的锅因此被抽干（余水 105/392，
           * 门槛 117.6）。加了门之后贴地空气（上方是气体）不再命中，蛇形两条横通道的中段
           * （上下都是 WALL）照旧命中 —— 而那 15 格中段正是热量推不过去的瓶颈。 */
          var upSolid = (y > 0) ? (IS_GAS[el[i - w]] === 0) : 1;
          var dnSolid = (y < h - 1) ? (IS_GAS[el[i + w]] === 0) : 1;
          if (upSolid && dnSolid) {
            var yr = (corr === 1) ? (y < h - 1 ? y + 1 : y) : (y > 0 ? y - 1 : y);
            var rowr = yr * w, sL = 0, nL = 0, sR = 0, nR = 0, xx, i2;
            var xLa = x - wallR; if (xLa < 0) xLa = 0;
            for (xx = xLa; xx < x; xx++) { i2 = rowr + xx; if (el[i2] === AIR) { sL += temp[i2]; nL++; } }
            var xRb = x + 1 + wallR; if (xRb > w) xRb = w;
            for (xx = x + 1; xx < xRb; xx++) { i2 = rowr + xx; if (el[i2] === AIR) { sR += temp[i2]; nR++; } }
            if (nL > 0 && nR > 0) {
              var df2 = sL / nL - sR / nR;
              if (df2 > wallMargin) hdDir = (corr === 2) ? -1 : 1;    // 空腔底：朝更热侧；空腔顶：朝更冷侧
              else if (df2 < -wallMargin) hdDir = (corr === 2) ? 1 : -1;
              if (hdDir !== 0) {
                hdP = (df2 < 0 ? -df2 : df2) * headScaleInv * headF;
                if (hdP > pmax) hdP = pmax;
              }
            }
          }
        }

        if (d <= buoyDt && dDown >= negColdDt) {
          /* 未驱动（≈ 环境温）的空腔通道格也不是"该静止"：它仍被水头推着走。 */
          if (hdDir) {
            nj = i + hdDir;
            if (el[nj] === AIR && stamp[nj] !== tick && RNG.hash01(x, y, tick * 263 + 10) < hdP) {
              swapStamp(grid, i, nj, tick); moved++;
            }
          }
          continue;                              // 不计入 driven（A5「均匀室温 → 驱动格 0」不受影响）
        }

        if (d > buoyDt) {
          driven++;
          j = i - w;                                       // 正上方
          /* v1.6.0 试验记录（已回退）：这里曾加上"上方必须更冷（temp[j] < temp[i]）"的
           * 严格浮力判据，理由是"热空气不该钻到更热的空气上面"。
           * 实测后果是灾难性的：暖空气升到"上方没有更冷空气"的高度就停住 → 热量再也到不了
           * 顶部边界（顶部只能靠 2 行 SKY_RELAX 散热）→ 整场大气被加热到 **289 °C 且均匀**
           * （_diag_sweep.js）。也就是说，旧实现里这点"不物理的置换"实际承担着**把热输运到
           * 顶部边界排掉**的角色 —— 它就是本模型的"对流散热通道"。
           * 真要修需要重做边界条件（例如顶部无条件把暖空气排出），超出本轮范围，
           * 故保留原判据并在 docs/PHYSICS-AIR.md 附录 G 如实记录该近似。
           * v1.6.5 注：行窗参考已让"均匀暖层内部 Δ≈0 不再搅拌、撤源后停上升"（C2），
           * 而"把热送到顶部边界"由热羽自身承担，故仍不恢复梯度判据。 */

          /* v1.6.5 顶部边界横向铺开（C1-c「顶部横向越过」）——**先于上浮**尝试：
           * 顶部边界层（y < TOP_SPREAD_ROWS，含天空行）内仍处热驱动状态的格，与**更凉的**
           * 水平邻 AIR 交换。规格蛇形的顶横通道接画布顶部天空层（唯一热出口），热空气到顶后
           * 向上逸出与沿边界铺开是两条并列去路（前者排热、后者完成"横向越过"），故铺开不做
           * 上浮失败的后备而是并行首选（后备式在顶横敞开的几何下永远不触发 —— 上方永远是 AIR）。
           * 只限顶部边界层：中段竖直热羽不铺开（v1.6.3 无门控抽干热羽实测：A3/V24 回归失败）。
           * 天花板被固体堵住的场景（玩家密闭盒内的缺口）由压强系统的门控横流覆盖
           * （pressure.js::FLOW_EPS_H，竖直被堵门控）。 */
          if (y < topSpreadRows) {
            bj = -1; bt = ti - hMargin;
            if (x > 0 && el[i - 1] === AIR && stamp[i - 1] !== tick && temp[i - 1] < bt) { bj = i - 1; bt = temp[i - 1]; }
            if (x < w - 1 && el[i + 1] === AIR && stamp[i + 1] !== tick && temp[i + 1] < bt) { bj = i + 1; bt = temp[i + 1]; }
            if (bj >= 0) {
              p = (d - buoyDt) / scale * hSpreadF; if (p > pmax) p = pmax;
              if (RNG.hash01(x, y, tick * 239 + 6) < p) { swapStamp(grid, i, bj, tick); moved++; continue; }
            }
          }
          upOK = (el[j] === AIR && stamp[j] !== tick);                       // 正上方通不通
          dnOK = (y < h - 1) && (el[i + w] === AIR) && (stamp[i + w] !== tick);  // 正下方通不通
          /* ★v1.6.7 歧义择向（balance.js AMBIG_RATIO）：d↑（比环境热）与 d↓（比行窗冷）
           * 可能同时超阈值 —— 闭合环的冷腿正是这种状态（20~40 °C，却被同行热腿把行窗均
           * 拉到 100 °C 以上）。旧代码一律取上升分支，于是"热一送到冷腿、冷腿就翻成上升"，
           * 环量归零。现在：上方已被挡 → 无上升这条路，只要比行窗冷就转向下沉（贴顶下行，
           * 即冷腿下沉）；上方畅通 → 只有"比周围冷"的信号强到 AMBIG_RATIO 倍于"比环境热"
           * 的信号才改为下沉。这不是 v1.6.0 被回退的"上方必须更冷"前提式判据（那条会让
           * 暖空气停在半空、热量到不了顶部边界）。 */
          wantDown = dDown < negColdDt && (!upOK || (ambigR > 0 && (-dDown) > d * ambigR));

          if (wantDown) {
            if (dnOK) {
              p = (negColdDt - dDown) / scale; if (p > pmax) p = pmax;
              if (RNG.hash01(x, y, tick * 251 + 7) < p) { swapStamp(grid, i, i + w, tick); moved++; continue; }
            }
            /* 下方也不通（贴地板 / 本 tick 已动）→ 交给下面的贴壁输运 */
          } else if (upOK) {
            p = (d - buoyDt) / scale; if (p > pmax) p = pmax;
            if (RNG.hash01(x, y, tick * 211 + 1) < p) { swapStamp(grid, i, j, tick); moved++; continue; }
          }
          /* ★v1.6.7 贴壁输运（几何判据版「横向越过 / 底部回流」）：
           * 想去的方向走不通（想升被天花板挡 / 想沉被地板挡）→ 沿壁面**定向**输运。
           * 分类按**几何**（空腔顶 / 空腔底）而不是按冷热 —— 详见 balance.js WALL_SCAN 注释：
           * 按冷热分类时，底横中段被热源烤成 250–390 °C 全是"热格"，全走贴顶分支朝更冷侧
           * = 朝东，与回流应朝西正好相反（QA 实测净 +4412 向东、热格:冷格=4451:39）。
           * 方向由**行窗平均**判定而不是紧邻一格：紧邻温差只有 2–6 °C（噪声量级、且是
           * 扩散式的 E≈W），行窗把整条通道的温度梯度放大成可靠的方向信号。 */
          if (wallOn && !upOK) {
            /* 注意 wantDown（比行窗冷、本想下沉）的格也要走这条：横通道中段上方是墙、下方也是墙，
             * 它**哪儿也去不了**，只能沿壁面走。首版把它排除在外（只放行 !wantDown）实测直接把
             * 顶横的输运掐死到 3.9 次/tick（通道 34 格），热永远推不过中段。SCAN=1 下它的方向由
             * 几何给出（空腔顶 → 朝更冷侧），不会像首版那样被 wantDown 误导成朝更热侧。 */
            towardHot = false;                       // 上方被挡：默认朝更冷侧（= v1.6.7 首版行为）
            if (wallScan) {
              if (!scanned) { ensureGasTable(); scanCavities(grid); scanned = true; }
              if (gasDn[i] === 0 && gasUp[i] === 1) towardHot = true;        // 空腔底 → 朝更热侧（回流）
              else if (gasUp[i] === 0 && gasDn[i] === 1) towardHot = false;  // 空腔顶 → 朝更冷侧（越过）
              /* 既不是空腔顶也不是空腔底（挑檐下方：头顶有实心板、板上方还有气体）→ 保持朝更冷侧，
               * 即"天花板射流"手感（V30 缺口区的水平流靠它）。 */
            }
            xa = x - wallR; if (xa < 0) xa = 0;          // 左窗口 [xa, x-1]
            xb = x + 1 + wallR; if (xb > w) xb = w;      // 右窗口 [x+1, xb-1]
            cL = preC[x] - preC[xa];
            cR = preC[xb] - preC[x + 1];
            if (cL > 0 && cR > 0) {                      // 两侧都得有空气可比（单侧=贴死角，不动）
              mL = (preT[x] - preT[xa]) / cL;
              mR = (preT[xb] - preT[x + 1]) / cR;
              diffT = mL - mR;
              dir = 0;
              if (diffT > wallMargin) dir = towardHot ? -1 : 1;      // 左窗口更热
              else if (diffT < -wallMargin) dir = towardHot ? 1 : -1;
              if (hdDir) { dir = hdDir; }                            // 水头信号更可靠（读的是两条竖腿）
              if (dir !== 0) {
                nj = i + dir;
                if (el[nj] === AIR && stamp[nj] !== tick) {
                  p = (wantDown ? (negColdDt - dDown) : (d - buoyDt)) / scale * wallF * hSpreadF;
                  if (hdP > p) p = hdP;
                  if (p > pmax) p = pmax;
                  if (towardHot) {
                    if (RNG.hash01(x, y, tick * 257 + 9) < p) { swapStamp(grid, i, nj, tick); moved++; continue; }
                  } else {
                    if (RNG.hash01(x, y, tick * 241 + 8) < p) { swapStamp(grid, i, nj, tick); moved++; continue; }
                  }
                }
              }
            }
          }
          if (d > buoyDt * 2) {                            // 斜上（仅强热羽，避免抖动）
            dx = RNG.hash01(x, y, tick * 223 + 2) < 0.5 ? -1 : 1;
            nx = x + dx;
            if (nx >= 0 && nx < w) {
              j = i + dx - w;
              if (el[j] === AIR && stamp[j] !== tick) {
                p = ((d - buoyDt) / scale) * 0.5; if (p > pmax) p = pmax;
                if (RNG.hash01(x, y, tick * 227 + 3) < p) { swapStamp(grid, i, j, tick); moved++; continue; }
              }
            }
          }
        } else {
          driven++;
          d = dDown;
          if (y < h - 1) {                                 // 正下方下沉
            j = i + w;

            if (el[j] === AIR && stamp[j] !== tick) {
              p = (negColdDt - d) / scale; if (p > pmax) p = pmax;
              if (RNG.hash01(x, y, tick * 229 + 4) < p) { swapStamp(grid, i, j, tick); moved++; continue; }
            }
          } else if (wallOn) {
            /* ★v1.6.7 贴底定向输运（C1-d「底部回流」—— v1.6.6 及以前此处是**结构缺口**，
             * 注释里也承认"不在本模块实现"）：想下沉但被地板挡住 → 沿壁面定向输运。
             * 分类同样按**几何**（见上面贴顶分支与 balance.js WALL_SCAN）：坐在空腔底 →
             * 朝更热的一侧（该侧正在上升、底部需要补气）；若几何上其实是空腔顶（例如 1 格高
             * 的横通道，头顶实心到顶）则朝更冷侧。触发条件是几何门控（想去的方向被挡），
             * 开放场景的竖直冷团**永不触发**。 */
            towardHot = true;                        // 下沉被挡：默认朝更热侧
            if (wallScan) {
              if (!scanned) { ensureGasTable(); scanCavities(grid); scanned = true; }
              if (gasUp[i] === 0 && gasDn[i] === 1) towardHot = false;   // 几何上是空腔顶 → 朝更冷侧
            }
            xa = x - wallR; if (xa < 0) xa = 0;
            xb = x + 1 + wallR; if (xb > w) xb = w;
            cL = preC[x] - preC[xa];
            cR = preC[xb] - preC[x + 1];
            if (cL > 0 && cR > 0) {
              mL = (preT[x] - preT[xa]) / cL;
              mR = (preT[xb] - preT[x + 1]) / cR;
              diffT = mL - mR;
              dir = 0;
              if (diffT > wallMargin) dir = towardHot ? -1 : 1;      // 左窗口更热
              else if (diffT < -wallMargin) dir = towardHot ? 1 : -1;
              if (hdDir) { dir = hdDir; }                            // 水头信号更可靠
              if (dir !== 0) {
                nj = i + dir;
                if (el[nj] === AIR && stamp[nj] !== tick) {
                  p = (negColdDt - d) / scale * wallF * hSpreadF;
                  if (hdP > p) p = hdP;
                  if (p > pmax) p = pmax;
                  if (towardHot) {
                    if (RNG.hash01(x, y, tick * 257 + 9) < p) { swapStamp(grid, i, nj, tick); moved++; continue; }
                  } else {
                    if (RNG.hash01(x, y, tick * 241 + 8) < p) { swapStamp(grid, i, nj, tick); moved++; continue; }
                  }
                }
              }
            }
          }
        }

        /* 风平流：只搬运"携带热量"的空气格（纯室温空气不搬运 → 画面等价、成本可控）
         * v1.6.4 起：判据仍用**全局**温差（T−amb），不用局部参考的 Δ —— 风是外部驱动，
         * "哪些气团值得被吹走"看的是它相对环境的热含量，保持 v1.6.3 及以前的手感。 */
        if (windOn && (devG > windMinDt || devG < -windMinDt)) {
          var pw = wind.strength * windF;
          if (RNG.hash01(x, y, tick * 233 + 5) < pw * 0.5) {
            var sx = wind.x > 0 ? 1 : (wind.x < 0 ? -1 : 0);
            var sy = wind.y > 0 ? 1 : (wind.y < 0 ? -1 : 0);
            if (sx !== 0 || sy !== 0) {
              nx = x + sx; ny = y + sy;
              if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
                j = ny * w + nx;
                if (el[j] === AIR && stamp[j] !== tick) { swapStamp(grid, i, j, tick); moved++; continue; }
              }
            }
          }
        }

        if (moved >= budget) { lastDriven = driven; lastMoved = moved; return; }
      }
    }
    lastDriven = driven; lastMoved = moved;
  }

  /* v1.6.8：管道环流挂在 airPass **之后**（先让竖直浮力/贴壁输运/水头推送照旧跑，
   * 再补"整环一步"）。触发条件与 airPass 的驱动门控一致（有待驱动空气 / 有风，
   * 且不在隔帧跳过的帧），空画布与纯室温场景依旧 O(1) 退出。 */
  function airPassWithDuct(grid, ctx) {
    var iv = Balance.AIR.PASS_INTERVAL;
    var gated = (iv > 1 && (ctx.tick % iv) !== 0);
    var had = pendingDrive || !!(ctx.wind && ctx.wind.strength > 0);
    airPass(grid, ctx);
    if (gated) return;
    if (had) ductFlow(grid, ctx);
    /* v1.6.9 开口烟道：与 ductFlow 并列（闭合空腔 → ductFlow；两端开口 → flueFlow）。
     * 启动条件 = 有热驱动空气 **或** 上次分析已经找到烟道（自维持，否则冷烟道永远醒不过来）。
     * 空画布 / 纯室温场景两个条件都不成立 → 完全不执行。 */
    if (had || flueOn) flueFlow(grid, ctx);
  }

  var api = {
    airPass: airPassWithDuct,
    noteDeviation: noteDeviation,
    drivenCount: function () { return lastDriven; },
    movedCount: function () { return lastMoved; },
    /* v1.6.8 诊断接口（仅测量用，不参与仿真） */
    ductMoved: function () { return ductMoved; },
    ductCycles: function () { return ductCycles; },
    ductLane: function () { return ductLane; },
    /* v1.6.9 开口烟道诊断接口（仅测量用，不参与仿真） */
    flueMoved: function () { return flueMoved; },
    flueLanes: function () { return flueLanes; },
    flueDrive: function () { return flueDrive; },
    flueLaneCount: function () { return laneCount; },
    flueLaneCell: function (k) { return (laneBuf && k >= 0 && k < laneCells) ? laneBuf[k] : -1; },
    flueLaneCells: function () { return laneCells; },
    flueClear: function (i) { return (d2b && i >= 0 && i < d2b.length) ? d2b[i] : -1; },
    flueCor: function (i) { return (corM && i >= 0 && i < corM.length) ? corM[i] : -1; },
    flueLaneLen: function (c) { return (c >= 0 && c < laneCount) ? laneLen[c] : 0; },
    flueLaneOff: function (c) { return (c >= 0 && c < laneCount) ? laneOff[c] : 0; },
    /* [窄通道格, 开放区数, 通道分量数, 最大分量格数, 洞口数, 洞口簇数, 首条路径长, 首条终点, 首轮BFS源数, 贴壁率%] */
    flueDbg: function () { return [dbgCor, dbgOpen, dbgComp, dbgBest, dbgMouth, dbgClus, dbgPlen, dbgTgt, dbgQt, dbgWall, dbgDmax, dbgTh]; },
    /* 方向场读取（仅测量/QA 用，让 QA 能直接验证"底横到底朝东还是朝西"，
     * 不必再靠交换计数反推 —— 那个量已被证明恒为 0，是无效证据） */
    ductDir: function (i) { return (dirF && i >= 0 && i < dirF.length) ? dirF[i] : 0; }
  };
  root.YS.Air = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

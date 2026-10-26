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
  /* ==========================================================================
   * ★v1.7.0：开口烟道贯穿流整体迁出到 src/core/flue.js
   *
   * 旧的 ~570 行启发式管线（气游程 → 封闭气穴吸收 ×2 → 最大连通分量 → 触壁率闸门 →
   * 洞口检测 → 洞口聚类 → 死端簇合成 → d2b 车道扫描）已**全部删除**，替换为
   * 「一次多源 BFS 距离场 + 按距离升序的整管塞状流」。
   * 为什么迁出去：旧管线历经约 20 轮调试、每一环都会误判（六版 regression 各有一处），
   * 复杂度已经不可能稳定交付；新实现只有两个几何参数且两者都能直接打印校验。
   * 详见 src/core/flue.js 文件头与 docs/architecture/flue-rewrite.md。
   *
   * 本模块（air.js）只保留：① 一个惰性搬运指派（下面 flue()）；② 诊断接口的转发。
   * ========================================================================== */
  function flue() {
    if (_Flue) return _Flue;
    var F = root.YS.Flue;
    /* Node 下若调用方漏加载 flue.js，这里补一次 require（浏览器里 require 未定义 → 静默）。
     * 这是为了不依赖任何脚本清单的顺序，生产路径（index.html 已显式加载）不会走到这里。 */
    if (!F) { try { require('./flue.js'); F = root.YS.Flue; } catch (e) { F = null; } }
    _Flue = F;
    return F;
  }
  var _Flue = null;

  /* 与 ductFlow 并列的三atcher以及其他样板 */
  function flueFlow(grid, ctx) {
    var F = flue();
    if (!F) return;
    F.flow(grid, ctx);
  }

  /* ★烟道占位锁（见 flue.js::lock 与 engine.js::step 的注释）：只对装着真东西的
   * 核心管格打本 tick 的 moveStamp ⇒ 随后的 movePass / airPass 让路，
   * 浮力不再与抽力对撞（v1.6.10 实测：不加锁时下行腿净位移恒为 0）。
   * 没有烟道时 pipeCount=0 ⇒ 空操作 ⇒ 无烟道场景零影响。 */
  function flueLock(grid, tick) {
    var F = flue();
    return F ? F.lock(grid, tick) : 0;
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
    /* v1.7.0 开口烟道：与 ductFlow 并列（闭合空腔 → ductFlow；两端开口 → Flue.flow）。
     * 启动条件 = 有热驱动空气 **或** 上次分析已经找到烟道（自维持，否则冷烟道永远醒不过来）。
     * 空画布 / 纯室温场景两个条件都不成立 → 完全不执行。 */
    if (had || _flueWasOn) flueFlow(grid, ctx);
    var F = flue();
    _flueWasOn = (F && F.pipeCount() > 0) ? 1 : 0;
  }
  var _flueWasOn = 0;

  var api = {
    airPass: airPassWithDuct,
    noteDeviation: noteDeviation,
    drivenCount: function () { return lastDriven; },
    movedCount: function () { return lastMoved; },
    /* v1.6.8 诊断接口（仅测量用，不参与仿真） */
    ductMoved: function () { return ductMoved; },
    ductCycles: function () { return ductCycles; },
    ductLane: function () { return ductLane; },
    /* v1.7.0 开口烟道诊断接口：实现已迁到 src/core/flue.js，这里只做转发。
     * 保留 flueCor / flueLaneCount / flueDbg / flueDrive / flueMoved 五个旧名字，
     * 供既有探针脚本（_serp5.js 等）与 QA 直接调用 —— 旧名→新名的对照表见
     * docs/architecture/flue-rewrite.md §7。 */
    flueMoved: function () { var F0 = flue(); return F0 ? F0.moved() : 0; },
    flueDrive: function () { var F0 = flue(); return F0 ? F0.drive() : 0; },
    flueSteps: function () { var F0 = flue(); return F0 ? F0.steps() : 0; },
    flueStepStats: function () { var F0 = flue(); return F0 ? F0.stepStats() : []; },
    fluePipeCount: function () { var F0 = flue(); return F0 ? F0.pipeCount() : 0; },
    flueLaneCount: function () { var F0 = flue(); return F0 ? F0.pipeCount() : 0; },   /* 兼容旧名 */
    flueCor: function (i) { var F0 = flue(); return F0 ? F0.isPipe(i) : 0; },          /* 兼容旧名 */
    flueIsCore: function (i) { var F0 = flue(); return F0 ? F0.isCore(i) : 0; },
    flueDist: function (i) { var F0 = flue(); return F0 ? F0.distOf(i) : -1; },
    flueParent: function (i) { var F0 = flue(); return F0 ? F0.parentOf(i) : -1; },
    flueSupplyT: function () { var F0 = flue(); return F0 ? F0.supplyT() : 0; },
    /* ★烟道占位锁（见 flue.js::lock 与 engine.js::step 的注释）。必须在 movePass 之前调用。 */
    flueLock: flueLock,
    /* [场格数, 最大受限连通块, 管网内最大锋面宽度, 核心格数, 管道总格数(含外伸), 逸散点数,
     *  最大行程, 供给端取样格数, 供给端温度, 热柱高度, 抽力, 本 tick 步数] */
    flueDbg: function () { var F0 = flue(); return F0 ? F0.dbg() : []; },
    ductDir: function (i) { return (dirF && i >= 0 && i < dirF.length) ? dirF[i] : 0; }
  };
  root.YS.Air = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

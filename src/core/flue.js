/*
 * flue.js — 开口烟道贯穿流（v1.7.0 全量重写）
 *
 * ★为什么必须有"（PI 必然）存在一个 / 整管一个骰子"的机制：
 *   只要搬运是 **逐格独立掷骰** 的 swap，满格晶格上对任意割集的净通量就**恒等于 0**
 *   （一次跨割集的交换必然"+1 与 −1 同时发生"；有偏也不行 —— 对面格子也会提一次交换，
 *   合成概率恒为 1，只剩纯扩散）。 ⇒ 想要**方向性输运**，闸门粒度必须是"整条管道一个骰子"。
 *   两条逃逸口：① 闭环「整圈一起走一步」（air.js::ductFlow，闭合空腔）；
 *              ② 开放系统边界不守恒（本文件：烟囱/烟道）。
 *
 * ★v1.7.0 相对 v1.6.9 / v1.6.10 的**架构级变更**：
 *   旧实现是一长串启发式串联（气游程 → 封闭气穴吸收 ×2 pass → 最大连通分量 →
 *   触壁率闸门 FLUE_WALL_FRAC → 洞口检测 → 洞口聚类 → 死端簇合成 → d2b 车道扫描）
 *   约 600 行、历经约 20 轮调试、每一环都会误判。新实现只有**两件事**：
 *
 *     ① 一次多源 BFS 得到「到大气（画布边界气体）的最短气距」 `D[]`      —— O(n)，无启发式
 *     ② 每 tick 整条管道按 D 升序各前进一格（不可压缩塞状流 plug flow）  —— O(n)
 *
 *   "哪里是管子"也不再靠启发式，而是从同一棵 BFS 上读出的**流管截面宽度**：
 *   距画布边界同一距离 k 的格子构成一层"锋面"（level set）。开放大气里锋面是几乎绕整个
 *   周长的一条长带（几百格 ⇒ 不是管子）；真管道里锋面只有它的横截面那么多格
 *   （≤ FLUE_CROSS_MAX）。再用"丢弃过短的受限连通块"（< FLUE_MIN_LEN）把石缝/气窝清掉。
 *   **总共只剩两个几何参数**，且都可直接打印校验（flueDbg 第 2/3 项是实测量级）。
 *
 * ★"管道塞状流整体前进"在**链**（不是环）上怎么做到：
 *   顺序 swap 在链上只能做出两两转置（净位移 0）或"末端一格滑到首端"（瞬移，不物理）。
 *   所以用 grid.moveTo 的**链式前移 + 边界源汇**：
 *     for c in 按 key 升序: moveTo(c → parent(c))
 *     · parent(c) 的 key 恒小于 c ⇒ 它刚才已经先被搬空 ⇒ 覆盖它是安全的、不丢东西；
 *     · 最深那一端搬空后即为「烟囱从炉膛抽气」的进气口（由常规物理/新生成补入）；
 *     · 最外那一端（出口外伸链末端）的内容被覆盖 = **逸散到大气** —— 这是本机制唯一的
 *       非守恒点，且它几乎总是 AIR（里面原本就是空气），所以视觉上丢的是空气。
 *
 * ★同一目标格有多个上游竞争者时怎么办（v1.6.10 的**永久饿死 bug** 就在这）：
 *   若赢家固定由遍历顺序决定，输家会每 tick 输一次 ⇒ 蒸汽锋面 400→3000 tick 一步不动。
 *   故每一步都用 `RNG.hashU32(x,y,tick…)` 重掷密钥 ⇒ 赢家每步随机易手，且**每个目标格
 *   至多一个赢家** ⇒ 移动映射是单射 ⇒ 不可能两格写同一目标 ⇒ 不丢包。
 *
 * ★驱动 = 烟囱效应（stack effect），沿用 v1.6.9 的**集总稳态**模型：
 *   Δp = ρ_out·g·h·b，b = 1 − ρ_flue/ρ_out = 相对密度亏损，h = 热柱高度；
 *   ρ_flue 取**供给端**（离排气口最远那几格 = 炉膛/锅腔出口）的烟温，而不是管道均温
 *   （工程上给烟囱定抽力用的就是火箱出口烟气温度）。
 *   流速按 Bernoulli：v = √(2·g·h·b/(1−b)) ⇒ 直接换算成"本 tick 前进几格"，
 *   落在真实烟道 1~5 m/s 的区间（格子 1 cm / 60 Hz ⇒ 1.7~8.3 格/tick，上限 FLUE_V_MAX）。
 *   ⚠ 代价如实记录：流动建立之前管子是冷的，却按"稳态已被热烟气充满"计算 ——
 *     用逐格瞬时温差会永远起不来（chicken-and-egg），这是本模型的已知近似。
 *
 * ★「无烟道时是空操作」的三道门（证明见 docs/architecture/flue-rewrite.md §5）：
 *   ① FLUE_P_MAX ≤ 0 ⇒ 整个机制关闭并复位状态；
 *   ② 流管（锋面窄且足够长的连通块）一个都没有 ⇒ pipeCount = 0 ⇒ 转动回路一次都不执行；
 *   ③ drive < FLUE_MIN_DRIVE（近等温 / 没有热烟气）⇒ 唯一的那个骰子不过 ⇒ 一步都不走。
 *
 * 零 DOM、零热路径分配、只用 RNG.hash01 / RNG.hashU32（确定性可复现）。
 */
(function (root) {
  'use strict';

  var Balance = root.YS.Balance;
  var RNG = root.YS.RNG;

  var AIR = 1;

  /* ---------------- 元素查表（模块级，只建一次） ---------------- */
  var IS_GAS = null;
  var IS_SOLID = null;                            // ★v1.7.2：只有 state==='solid' 才算"管壁"
  var fid = -1;                                   // FIRE 的 id（火焰不参与整条搬运）
  function ensureTables() {
    if (IS_GAS) return;
    var Els = root.YS.Elements;
    var els = Els && Els.ELEMENTS;
    var cnt = els ? els.length : 0, m = cnt > 64 ? cnt : 64;
    IS_GAS = new Uint8Array(m);
    IS_SOLID = new Uint8Array(m);
    for (var i = 0; i < cnt; i++) {
      var e = els[i];
      IS_GAS[i] = (e && e.state === 'gas') ? 1 : 0;
      IS_SOLID[i] = (e && e.state === 'solid') ? 1 : 0;
    }
    fid = (Els && Els.ID) ? (Els.ID.FIRE || 0) : 0;
  }

  /* ---------------- 复用 scratch（按格数懒扩容，热路径零分配） ---------------- */
  var distA = null, parA = null, keyA = null, lvlA = null, pipePar = null, orderA = null;
  var qA = null, fieldA = null, stackA = null;
  var hRun = null, vRun = null;                 /* ★v1.7.2 侧向受限宽度用的行/列气游程 */
  var pipeFlag = null, extA = null, visA = null;
  var ownerGen = null, ownerSrc = null, ownerKey = null, moveGen = null;
  var cntA = null, cntN = 0;
  var _n = 0;
  var _visGen = 0;

  function ensure(n) {
    if (distA && _n >= n) return;
    _n = n;
    distA = new Int32Array(n); parA = new Int32Array(n); keyA = new Int32Array(n);
    lvlA = new Int32Array(n); pipePar = new Int32Array(n); orderA = new Int32Array(n);
    qA = new Int32Array(n); fieldA = new Int32Array(n); stackA = new Int32Array(n);
    pipeFlag = new Uint8Array(n); extA = new Uint8Array(n); visA = new Int32Array(n);
    hRun = new Int32Array(n); vRun = new Int32Array(n);
    ownerGen = new Int32Array(n); ownerSrc = new Int32Array(n);
    ownerKey = new Uint32Array(n); moveGen = new Int32Array(n);
  }
  function ensureCnt(k) {
    if (cntA && cntN >= k) return;
    cntN = k;
    cntA = new Int32Array(k);
  }

  /* 相对密度（环境温空气 = 1；热 → <1）。与 pressure.js::computeHead 同口径。 */
  function rhoRel(t, amb) { var d = t + 273; return d > 1 ? (amb + 273) / d : 1; }

  /* ---------------- 运行期状态 / 诊断读数 ---------------- */
  var pipeCount = 0, coreCount = 0, termCount = 0, fieldCount = 0;
  var flueDrive = 0, flueB = 0, flueH = 0, flueSteps = 0, flueSupplyT = 0, flueSupplyMaxT = 0;
  var pipeMaxKey = 0;      // 管网内最大行程（进气口判据用）
  var flueMoved = 0, stepId = 0, flueOn = 0, _force = 1;
  /* stepOnce 的分原因计数：[候选, 赢家, 被前面堵住, 目标非气体, 抢输] */
  var stGas = 0, stOwner = 0, stBlkFull = 0, stBlkSolid = 0, stBlkLoser = 0, stInlet = 0;
  var _gridW = 0, _gridH = 0, _curGrid = null;
  var dbg = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

  function reset() {
    pipeCount = 0; coreCount = 0; termCount = 0; fieldCount = 0;
    flueDrive = 0; flueB = 0; flueH = 0; flueSteps = 0; flueSupplyT = 0;
    flueMoved = 0; flueOn = 0; _force = 1;
  }

  /* ============================================================
   * 分析：① 多源 BFS 距离场 → ② 锋面宽度 → ③ 长连通块 → ④ 出口外伸 → ⑤ 抽力
   * ========================================================== */
  function analyze(grid, ctx) {
    var A = Balance.AIR;
    pipeCount = 0; coreCount = 0; termCount = 0; fieldCount = 0;
    flueDrive = 0; flueB = 0; flueH = 0; flueSteps = 0; flueSupplyT = 0;
    for (var z = 0; z < 12; z++) dbg[z] = 0;

    var crossMax = A.FLUE_CROSS_MAX;
    var minLen = A.FLUE_MIN_LEN;
    if (!(crossMax > 0) || !(minLen > 0)) return;

    ensureTables();
    var w = grid.w, h = grid.h, n = grid.n, el = grid.element;
    if (!distA || n > _n) ensure(n);
    var i, j, x, y, row, k, d, c, t;

    distA.fill(-1); parA.fill(-1); pipeFlag.fill(0); extA.fill(0);
    pipePar.fill(-1); lvlA.fill(0); visA.fill(0); _visGen = 0;

    /* ---- ① 多源 BFS：源 = 画布边界上的全部气体格（= 真正的大气） ----
     * flood 只穿气体 ⇒ 得到"从边界出发、沿气体走"的最大连通域；走到越深 D 越大，
     * 于是 D 的梯度**恒指向最近的排气口**。管道内部的每格天然被覆盖 ——
     * 不需要"窄通道/触壁率/洞口聚类/死端簇"任何一种几何启发式。 */
    var qh = 0, qt = 0;
    for (x = 0; x < w; x++) {
      i = x; if (IS_GAS[el[i]] && distA[i] < 0) { distA[i] = 0; parA[i] = -1; qA[qt++] = i; }
      i = (h - 1) * w + x; if (IS_GAS[el[i]] && distA[i] < 0) { distA[i] = 0; parA[i] = -1; qA[qt++] = i; }
    }
    for (y = 0; y < h; y++) {
      row = y * w;
      i = row; if (IS_GAS[el[i]] && distA[i] < 0) { distA[i] = 0; parA[i] = -1; qA[qt++] = i; }
      i = row + w - 1; if (IS_GAS[el[i]] && distA[i] < 0) { distA[i] = 0; parA[i] = -1; qA[qt++] = i; }
    }
    var fc = 0;
    while (qh < qt) {
      i = qA[qh++];
      fieldA[fc++] = i;                       // 弹出顺序天然就是 D 的非降序
      d = distA[i] + 1;
      x = i % w; y = (i / w) | 0;
      if (x > 0) { j = i - 1; if (IS_GAS[el[j]] && distA[j] < 0) { distA[j] = d; parA[j] = i; qA[qt++] = j; } }
      if (x < w - 1) { j = i + 1; if (IS_GAS[el[j]] && distA[j] < 0) { distA[j] = d; parA[j] = i; qA[qt++] = j; } }
      if (y > 0) { j = i - w; if (IS_GAS[el[j]] && distA[j] < 0) { distA[j] = d; parA[j] = i; qA[qt++] = j; } }
      if (y < h - 1) { j = i + w; if (IS_GAS[el[j]] && distA[j] < 0) { distA[j] = d; parA[j] = i; qA[qt++] = j; } }
    }
    fieldCount = fc;
    dbg[0] = fc;
    if (fc < minLen) return;                  // 连"连到大气的气体"都没几格 ⇒ 不可能有管道

    /* ---- ② 侧向受限宽度（v1.7.2 判据重写）----
     *
     * ★★为什么必须换掉"锋面宽度"（v1.7.0/1.7.1 的判据）：它有一个**致命的几何漏洞**。
     *   "锋面"= 距大气同一距离 D 的那一层格。开放大气里的锋面确实是一条绕周长的长带
     *   （几百格），看起来判据很安全。**但 D 的等值面在任何区域的最深处都会收缩** ——
     *   最深处就那么几个格，等值面必然只剩几格。实测坐实（V40 开放场景 120×80、
     *   底部是石头所以没有底边界源）：开放大气最深处 (59,59) 的 D=59，那一层只有
     *   2~4 格 ⇒ 锋面宽度 2 ≤ CROSS_MAX(32) ⇒ 被判成"流管"，且连带周围攒出
     *   ≥ MIN_LEN(60) 的一块 ⇒ **开放场景每 tick 认出 1000+ 车道**（V40 实测 499736）。
     *   ⇒ "锋面窄"根本不是管道的判据，它只是"离大气远"的判据。
     *
     * ★新判据：管道 = **侧向被固体夹住**。量法是"**垂直于流向**的那条气体游程有多长"：
     *     · 流向竖直（腿）⇒ 量这一格所在的**水平**气游程 = 走廊宽度（实测 8 格）
     *     · 流向水平（顶/底连接廊）⇒ 量**竖直**气游程 = 廊高（实测 5 格）
     *     · 开放大气里无论往哪个方向量都是几十~上百格 ⇒ 一律不是管道。
     *   这一判据直接对应"管道"的物理定义（流体被壁面横向约束），且**对开放区域恒不成立**，
     *   与"离大气多远"完全无关 —— 正好补上旧判据的漏洞。
     *   实测对照（同一帧、同一参数）：开放场景 车道 499736 → **0**；蛇形六腿管网照旧连通。
     *
     * ★补一条实测教训（"固体"而非"非气体"，v1.7.2 第二版）：上面这个判据按"气体游程"
     *   量宽度时，**一颗飞过来的水珠就能把一整行的气游程切成两段短段** ⇒ 短段 ≤ 32
     *   ⇒ 又被判成管道。实测坐实：V40 开放场景跑到 t≈95（沸腾把水珠甩得满图都是）之后
     *   车道从 0 反弹到 555~2282。水珠**不是墙**，气体可以从它旁边绕过去，它不构成横向约束。
     *   ⇒ 改成只把 **state==='solid'** 的格子（石/墙/金属/冰/炭）当管壁，液体/粉末/气体一律不算。
     *     走到画布边缘仍未碰到固体 ⇒ 开放度 = 跑到边缘的格数 ⇒ 天然远大于 CROSS_MAX（无界）。
     *
     * ★第三版（最终）：两侧都必须**真的碰到固体**，走到画布边缘不算。
     *   实测打脸（第二版 min(横开放, 纵开放)）：迷宫**外面那条 14 格高的空气带**
     *   （下界是迷宫石顶 y=14）纵向开放度只有 14 ⇒ ≤32 ⇒ 整条 257×14 被判成管网，
     *   连左右两条 14 宽的边缝也进来了 ⇒ 核心从 5200 涨到 9448，管网最深点跑到
     *   迷宫外面 ⇒ **进气口一次都没触发**（stInlet=0）⇒ 汽根本进不了管。
     *   "开放天空"和"管道"的区别是：管道**两边都是墙**，天空只有一边（另一边是画布外）。
     *   于是改成：左右（或上下）**都在 CROSS_MAX 以内碰到固体**才算被夹住，
     *   宽度 = 左距 + 右距 + 1；任一侧走到边缘都没碰到固体 ⇒ 视为无界 ⇒ 不是管道。
     *
     * 四遍线性扫描（每行左→右、右→左；每列上→下、下→上）算出，O(n)、热路径零分配。
     * 距离按 CROSS_MAX+1 截断（超过就不可能合格，没必要记真实值）。 */
    var run = 0, cap = crossMax + 1;
    /* ★注意：扫描的**起始值必须是 cap 而不是 0**。踩过的坑：起始值取 0 时，
     * 一个左侧根本没有固体（一路到画布边缘）的格子会被记成"距左侧固体 5 格"
     * —— 那个 5 是**到边缘的距离**，不是到固体的距离 ⇒ 迷宫左外侧那条 14 格宽的
     * 边缝被误判成"两侧都有墙的管道"。起始值取 cap = CROSS_MAX+1 ⇒ 没碰到固体
     * 就是无界，一律不合格。 */
    for (y = 0; y < h; y++) {
      row = y * w; run = cap;
      for (x = 0; x < w; x++) {
        hRun[row + x] = run;                        // 左侧到最近固体的距离（截断）
        if (IS_SOLID[el[row + x]]) run = 0; else if (run < cap) run++;
      }
      run = cap;
      for (x = w - 1; x >= 0; x--) {
        var r2 = run;                               // 右侧到最近固体的距离（截断）
        if (hRun[row + x] <= crossMax && r2 <= crossMax) hRun[row + x] += r2 + 1;
        else hRun[row + x] = cap;                   // 有一侧没碰到固体 ⇒ 无界
        if (IS_SOLID[el[row + x]]) run = 0; else if (run < cap) run++;
      }
    }
    for (x = 0; x < w; x++) {
      run = cap;
      for (y = 0; y < h; y++) {
        vRun[y * w + x] = run;
        if (IS_SOLID[el[y * w + x]]) run = 0; else if (run < cap) run++;
      }
      run = cap;
      for (y = h - 1; y >= 0; y--) {
        var r3 = run;
        if (vRun[y * w + x] <= crossMax && r3 <= crossMax) vRun[y * w + x] += r3 + 1;
        else vRun[y * w + x] = cap;
        if (IS_SOLID[el[y * w + x]]) run = 0; else if (run < cap) run++;
      }
    }
    /* ★宽度 = min(横向开放度, 纵向开放度)：为什么不能"按流向选轴"
     * 上一版按 BFS 父指针判断流向（父格是下游 ⇒ 两格的坐标差就是流向），
     * 实测打脸：蛇形迷宫的**顶廊/底廊全部被判成"不在管内"**（在管内=0），
     * 六条腿变成互不相连的孤岛 ⇒ 汽团走到腿顶就到头，永远进不了下一条腿。
     * 根因：廊里波前是**斜着**传的（BFS 出队序决定父格），x=178 那一列常被
     * 正下方的格子先发现 ⇒ 父格是竖直邻居 ⇒ 去量了 42 格宽的**长轴** ⇒ 超限。
     * ⇒ 流向不可靠，别用它选轴。改用"两轴取小"：
     *     竖腿量到 8（左右是石壁）✓  顶/底廊量到 5（上下是石壁）✓  锅腔量到 60 ✗
     * 转角的"丁字口"怎么办（那里两轴都不窄）？靠 **8-连通的斜角**接上：
     *   腿4 顶(165,22) 与 廊内(166,21) 是斜邻居 ⇒ 同一连通块。实测已通。 */
    for (var s2 = 0; s2 < fc; s2++) {
      i = fieldA[s2];
      var ah = hRun[i], av = vRun[i];
      lvlA[i] = ah < av ? ah : av;
    }

    /* ---- ③ 流管 = 足够长的「侧向受限格」8-连通块 ----
     * 受限 = 侧向游程 ≤ CROSS_MAX（人在管子里）；足够长 = 块 ≥ FLUE_MIN_LEN。
     * 两道门合起来把短石缝、气窝、以及开放大气里的偶然窄带全部丢掉。 */
    var s = 0;
    var gen = ++_visGen;
    var maxComp = 0, maxLvl = 0, nCore = 0;
    for (s = 0; s < fc; s++) {
      i = fieldA[s];
      if (lvlA[i] <= 0 || lvlA[i] > crossMax || visA[i] === gen) continue;
      var sp2 = 0, cur2 = 0;
      stackA[sp2++] = i; visA[i] = gen;
      while (cur2 < sp2) {
        c = stackA[cur2++];
        flood8Conf(c, w, h, visA, stackA, sp2, gen, crossMax, lvlA);
        sp2 = lastSp;
      }
      if (sp2 > maxComp) maxComp = sp2;
      if (sp2 < minLen) continue;
      for (k = 0; k < sp2; k++) {
        c = stackA[k];
        pipeFlag[c] = 1; keyA[c] = distA[c]; pipePar[c] = parA[c];
        if (lvlA[c] > maxLvl) maxLvl = lvlA[c];
        nCore++;
      }
    }
    coreCount = nCore;
    dbg[1] = maxComp; dbg[2] = maxLvl; dbg[3] = nCore;
    if (nCore === 0) return;

    /* ---- ④ 出口外伸链（射流）：给每个"即将排入开放大气"的管格接一条 FLUE_SINK 格直链。
     *     作用有两个：① 烟**看得见地冒出开口**（而不是在管道最后那一格原地消失）；
     *     ② 让"="<?=着我们"We shall"（开放格）也被推着往前走，出口不会被自己堵住。
     *     方向 = 该管格看向它那个开放 parent 的方向再往外延续（直线延续砌射流动量）。
     *     ⚠ 这是本文件里唯一的"非 D 梯度"搬运，长度由 FLUE_SINK 显式控制。 */
    var sinkN = A.FLUE_SINK | 0;
    var off = sinkN + 2;                     // 计数排序的 key 偏移（外伸链 key 可以 < 0）
    if (sinkN > 0) {
      for (s = 0; s < fc; s++) {
        c = fieldA[s];
        if (!pipeFlag[c]) continue;
        var p0 = parA[c];
        if (p0 < 0 || pipeFlag[p0] || !IS_GAS[el[p0]]) continue;
        var dx = (p0 % w) - (c % w);
        var dy = ((p0 / w) | 0) - ((c / w) | 0);
        if ((dx !== 0 && dy !== 0) || (dx === 0 && dy === 0)) continue;   // 必须是单位方向
        var k0 = distA[p0], prevCell = p0, cc = p0, term = p0;
        pipeFlag[p0] = 1; extA[p0] = 1; keyA[p0] = k0;
        for (var q2 = 1; q2 <= sinkN; q2++) {
          var nx2 = (cc % w) + dx, ny2 = ((cc / w) | 0) + dy;
          if (nx2 < 0 || nx2 >= w || ny2 < 0 || ny2 >= h) break;
          var nx = ny2 * w + nx2;
          if (!IS_GAS[el[nx]] || pipeFlag[nx]) break;
          pipeFlag[nx] = 1; extA[nx] = 1; keyA[nx] = k0 - q2;
          pipePar[prevCell] = nx;
          prevCell = nx; cc = nx; term = nx;
        }
        pipePar[term] = -1;                   // 最外端：内容被覆盖 = 逸散入大气
      }
    }
    /* 所有仍在管内的核心格：pipePar 已在 ③ 写好；只有外伸链没接出去的才算逸散点 */

    /* ---- ⑤ 计数排序：把管道格按 key 升序排成一队（O(n + maxKey)） ---- */
    var maxKey = 0;
    for (i = 0; i < n; i++) {
      if (!pipeFlag[i]) continue;
      var kk = keyA[i] + off;
      if (kk < 0) kk = 0;
      if (kk > maxKey) maxKey = kk;
    }
    ensureCnt(maxKey + 2);
    for (k = 0; k <= maxKey; k++) cntA[k] = 0;
    for (i = 0; i < n; i++) {
      if (!pipeFlag[i]) continue;
      var kk2 = keyA[i] + off;
      if (kk2 < 0) kk2 = 0;
      cntA[kk2]++;
    }
    var acc = 0;
    for (k = 0; k <= maxKey; k++) { var cv = cntA[k]; cntA[k] = acc; acc += cv; }
    for (i = 0; i < n; i++) {
      if (!pipeFlag[i]) continue;
      var kk3 = keyA[i] + off;
      if (kk3 < 0) kk3 = 0;
      orderA[cntA[kk3]++] = i;
    }
    pipeCount = acc;
    if (pipeCount === 0) return;
    termCount = 0;
    for (k = 0; k < pipeCount; k++) if (pipePar[orderA[k]] < 0) termCount++;
    dbg[4] = pipeCount; dbg[5] = termCount;

    /* ---- ⑥ 抽力（烟囱效应）：供给端烟温 + 热柱高度 ----
     * 供给端 = 管格里**行程最大**的那几格（离排气口最远 = 炉膛/锅腔一侧）。
     * 高度 H = 核心管网的竖直跨度（格）。b = 相对密度亏损 = 1 − ρ_flue/ρ_out。 */
    var maxD = 0, y0 = 1e9, y1 = -1e9;
    for (k = 0; k < pipeCount; k++) {
      c = orderA[k];
      if (extA[c]) continue;                 // 外伸链不计入热柱几何
      if (distA[c] > maxD) maxD = distA[c];
      var yy = (c / w) | 0;
      if (yy < y0) y0 = yy;
      if (yy > y1) y1 = yy;
    }
    dbg[6] = maxD;
    pipeMaxKey = maxD;
    if (maxD <= 0) { pipeCount = 0; coreCount = 0; termCount = 0; return; }
    var srcDepth = A.FLUE_SRC_DEPTH;
    if (!(srcDepth > 0)) srcDepth = 32;
    var thr = maxD - srcDepth, sT = 0, cT = 0, sMax = -1e9, temp = grid.temp;
    var amb0 = ctx.ambient !== undefined ? ctx.ambient : Balance.PHYS.AMBIENT_T;
    /* ★只统计"热的那部分气体"（v1.7.1）：为什么不能对深处一整片取平均
     * 炉膛/锅腔是个宽腔，几何最深处往往是**远离火源的冷角落**（实测：管网行程 867、
     * 六腿全在管内，但最深处 (310,15x) 只有 28 °C，而同处明明有 101 °C 的蒸汽）
     * ⇒ 一取平均就把热源稀释没了 ⇒ 抽力 0.5 ⇒ 步 0 ⇒ 整个机制停摆。
     * 物理上：烟囱抽力来自**进入烟道的热烟气**（Δρ 由烟温决定），
     * 旁边的冷空气不参与形成压差，把它算进平均是错的。
     * 于是只取"高于环境 +5 °C"的那些格做平均；一个热的都没有 ⇒ 退回环境温 ⇒ 抽力 0
     * （没有热源就没有烟囱效应，这是对的）。 */
    var hotThr = amb0 + 5;
    for (k = 0; k < pipeCount; k++) {
      c = orderA[k];
      if (extA[c] || distA[c] < thr) continue;
      var tc = temp[c];
      if (tc > sMax) sMax = tc;
      if (tc <= hotThr) continue;
      sT += tc; cT++;
    }
    var amb = amb0;
    flueSupplyT = cT > 0 ? sT / cT : amb;
    /* 供给端**最高温**：均值会被同处的大量冷空气拉低（实测均值只有 23~40 °C，
     * 而同处明明有 100 °C 的蒸汽），判"是否真在沸腾"必须看最高温，不能看均值。 */
    flueSupplyMaxT = cT > 0 ? sMax : amb;
    flueH = (y1 - y0 + 1);
    flueB = 1 - rhoRel(flueSupplyT, amb);
    flueDrive = flueB * flueH;
    dbg[7] = cT; dbg[8] = flueSupplyT; dbg[9] = flueH;
    flueSteps = deriveSteps(A);
    dbg[10] = flueDrive; dbg[11] = flueSteps;
  }

  /* 8-连通 flood 的助手（内联到热路径：传 thisOne 上下文避免每次分配对象）。
   * 约定：把新压入的格写进 stackA[sp..]，并把新的 sp 存到模块级 lastSp。 */
  var lastSp = 0;
  function flood8Conf(c, w, h, vis, st, sp, gen, crossMax, lv) {
    var x = c % w, y = (c / w) | 0, nb = 0, v;
    if (x > 0) { nb = c - 1; v = lv[nb]; if (vis[nb] !== gen && v > 0 && v <= crossMax) { vis[nb] = gen; st[sp++] = nb; } }
    if (y > 0) {
      nb = c - w; v = lv[nb]; if (vis[nb] !== gen && v > 0 && v <= crossMax) { vis[nb] = gen; st[sp++] = nb; }
      if (x > 0) { nb = c - w - 1; v = lv[nb]; if (vis[nb] !== gen && v > 0 && v <= crossMax) { vis[nb] = gen; st[sp++] = nb; } }
      if (x < w - 1) { nb = c - w + 1; v = lv[nb]; if (vis[nb] !== gen && v > 0 && v <= crossMax) { vis[nb] = gen; st[sp++] = nb; } }
    }
    if (x < w - 1) { nb = c + 1; v = lv[nb]; if (vis[nb] !== gen && v > 0 && v <= crossMax) { vis[nb] = gen; st[sp++] = nb; } }
    if (y < h - 1) {
      nb = c + w; v = lv[nb]; if (vis[nb] !== gen && v > 0 && v <= crossMax) { vis[nb] = gen; st[sp++] = nb; }
      if (x > 0) { nb = c + w - 1; v = lv[nb]; if (vis[nb] !== gen && v > 0 && v <= crossMax) { vis[nb] = gen; st[sp++] = nb; } }
      if (x < w - 1) { nb = c + w + 1; v = lv[nb]; if (vis[nb] !== gen && v > 0 && v <= crossMax) { vis[nb] = gen; st[sp++] = nb; } }
    }
    lastSp = sp;
  }

  /* 抽力 → 本 tick 前进几格（Bernoulli，上限 FLUE_V_MAX） */
  function deriveSteps(A) {
    if (!(flueB > 0) || !(flueH > 0)) return 0;
    var cellM = A.FLUE_CELL_M;
    if (!(cellM > 0)) cellM = 0.01;
    var b = flueB > 0.9 ? 0.9 : flueB;
    var hm = flueH * cellM;
    /* v = √(2·g·h·b/(1−b))  [m/s]；每 tick 的格数 = v / (60 · cellM) */
    var v = Math.sqrt(2 * 9.81 * hm * b / (1 - b));
    var steps = Math.round(v / (60 * cellM));
    /* ★沸腾期的体积膨胀驱动（v1.7.1）：为什么自然抽力公式不够
     * 上面的 v 是**烟囱自然抽力**（Δp = g·h·Δρ），量级 1~5 m/s —— 那是真实烟囱的
     * 实测流速，没错。但**蒸汽**不是靠自然抽力走的：水变汽体积膨胀约 1600 倍，
     * 工业蒸汽管的流速是 **20~40 m/s**（Troy《Steam Engineering》/SPI 常用设计值），
     * 比自然抽力高一个量级 —— 蒸汽能长距离输送靠的就是这个，不是烟囱效应。
     * 而本作的格子模型里"1 格水 → 1 格蒸汽"是**1:1，没有体积膨胀**，
     * 于是沸腾产生的体积流量被低估了约 1600 倍，抽力只剩自然抽力那一点。
     * （实测后果：腿6 走完约 700 格需 175 帧，而蒸汽潜热预算 255 只够 ~64 帧
     *  ⇒ 蒸汽必然在半路凝完，产物积在管里把烟道堵死。）
     * 补偿办法：供给端确实在沸腾（≥ 饱和温度）时，把速度下限提到 FLUE_V_BOIL。
     * 这是对"1:1 相变缺体积膨胀"这一**建模缺口的显式补偿**，不是凭空加速：
     * 20~40 m/s ⇒ 1 cm/格时 33~67 格/帧，这里取 24（≈14 m/s）是保守值。 */
    var vboil = A.FLUE_V_BOIL;
    /* ★阈值取"饱和温度 − 潜热平台"而不是饱和温度本身：潜热把饱和蒸汽钉在 100 °C，
     * 但供给端取样是"热气体的平均/峰值"，实测常出现 99.x（打印成 100 却比不过 >=100），
     * 于是提速下限整段失效（步数掉回 2~3）。取 COND_T−PLATEAU 即"确实是饱和蒸汽"。 */
    var boilThr = (Balance.STEAM ? Balance.STEAM.COND_T : 100) - (Balance.STEAM ? Balance.STEAM.PLATEAU : 3);
    if (vboil > 0 && flueSupplyMaxT >= boilThr && steps < vboil) steps = vboil;
    var vmax = A.FLUE_V_MAX;
    if (vmax > 0 && steps > vmax) steps = vmax;
    if (steps < 1) steps = 1;
    return steps;
  }

  /* ============================================================
   * 转动：整条管道**一个**骰子；中了就按 key 升序把全体前移一格，重复 steps 次。
   * ========================================================== */
  function stepOnce(grid, tick, amb, salt) {
    var A = Balance.AIR;
    var el = grid.element, fd = grid.flowDir, stamp = grid.moveStamp, tp = grid.temp;
    var w = grid.w, h = grid.h, k, c, t, ec, et, bit, x, y;
    var sid = ++stepId;
    var moved = 0;
    /* 诊断：本步各类"为什么没搬"的计数（见 stats()）。
     * 这几个数是排查"链断在哪"的唯一硬证据 —— 光看 moved 总数分不清是
     * 「没货可搬」「被前面堵住」还是「抢输了」。 */
    stGas = 0; stOwner = 0; stBlkFull = 0; stBlkSolid = 0; stBlkLoser = 0; stInlet = 0;

    /* ★★ 拉取式推进（v1.7.1）：为什么必须改成"拉"，以及旧的"推"错在哪
     *
     * 旧实现：每格沿 BFS 树的**固定父指针**往下游"推"，一个目标格只放行一个赢家。
     * 实测（`_flue_block.js` / `stepStats`）在 serp5 场景下的死因：
     *     候选=545  赢家=473  被堵=437  抢输=72  ⇒ 实搬仅 36 格/步
     * 即 **92% 的赢家被"目标格还满着"堵住**。根因是**阻塞沿树乘性级联**：
     * BFS 树在宽腔里必然收敛（入度 > 1）⇒ 约 1/4 的格子成为输家 ⇒ 输家原地不动
     * ⇒ 它下游整棵子树全被堵 ⇒ 一条链上只要有任何一个祖先是输家就整条停摆。
     * 于是每步只有最前排 ~36 格在动，后面的汽原地不动 —— 看起来"机制在跑、货不动"。
     *
     * 新实现：**由空格发起"拉"**。按行程升序遍历，每个可收货的格 t 从
     * 「行程 = t+1 且贴邻」的格子里挑一个拉过来（RNG 定序，确定性）。
     * 关键在于**被拉走的格子立刻变成空气**，轮到它时它又能向上游拉 ——
     * 于是整条链在同一个 tick 内自行传导到底，**阻塞不再级联**。
     *
     * 单射性（不丢包）由构造保证，不需要额外的占用表：源格被拉走后 `el` 立即变 AIR，
     * 而 AIR 根本不进入候选集 ⇒ 不可能被第二个目标再拉一次；每个目标每步至多拉一次。
     *
     * 收货资格（三选一）：
     *   `el[t] === AIR`        —— 空格，直接收货
     *   `pipePar[t] < 0`       —— 外伸链最外端：覆盖它 = 逸散入大气（开放边界不守恒）
     *   `el[t]` 非气体         —— 水滴/沙/玩家新画的墙：不能覆盖，跳过
     * 其余（格里有气体且没被拉走）= 真的堵着，本步不动（这是**物理上的拥堵**，不是 bug）。 */
    for (k = 0; k < pipeCount; k++) {
      t = orderA[k];
      et = el[t];
      if (et === AIR) { /* 空格：可收货 */ }
      else if (!IS_GAS[et]) { stBlkSolid++; continue; }      // 水滴/沙/墙：不能覆盖
      else if (pipePar[t] < 0) { /* 逸散点：内容被覆盖 = 逸散入大气 */ }
      else { stBlkFull++; continue; }                        // 真堵着
      stGas++;

      /* 从四邻中挑一个"行程 +1 的管内气体"拉过来；进气面（最深几层）还可抽管外炉膛 */
      var kt = keyA[t];
      x = t % w; y = (t / w) | 0;
      var best = -1, bk = 0, bestOut = 0, q2, cc;
      var bIn = -1, bInK = 0;                 // 管内候选（hash 最小者胜）
      var bOut = -1, bOutK = 0, bOutT = -1e9; // 管外候选（温度最高者胜，同温 hash 小者胜）
      for (q2 = 0; q2 < 4; q2++) {
        if (q2 === 0) { if (x <= 0) continue; cc = t - 1; }
        else if (q2 === 1) { if (x >= w - 1) continue; cc = t + 1; }
        else if (q2 === 2) { if (y <= 0) continue; cc = t - w; }
        else { if (y >= h - 1) continue; cc = t + w; }
        if (!pipeFlag[cc]) {
          /* ★管外邻格 = 炉膛/锅腔。★v1.7.3 判据换血：不再看"D 值分层"（FLUE_INLET_BAND），
           * 改看**几何上下游** —— 管外格只要比本格更远离排气口（distA > 本格 D），
           * 它就是上游，抽它是正确的。
           *
           * ★★为什么旧的"最深 BAND 层"会把进气口饿死（实测坐实，_inlet.js t=1200）：
           *   颈口那一行 8 格在几何上**全都是**进气口，但 BFS 是按发现顺序给 D 的，
           *   于是它们被切成 729/730/…/736 好几档。BAND=3 ⇒ 只有 D≥733 的 11 格准抽，
           *   而真正贴着锅腔的只有 y=114 那 4 格 ⇒ **全进气带管外气体邻居总共 4 个、
           *   其中蒸汽 0 个** ⇒ 抽进来的全是空气。锅里有 1933 格蒸汽，管内只有 34 格。
           *   把 BAND 调大也没用：那 8 格本来就只差几档，但整条颈子有 12 行，
           *   BAND 一放大就把上下全是石壁、根本没有管外邻居的中间几行也放进来，
           *   白放开却没货可抽。
           *
           * ★新判据的好处：
           *   · 颈口 8 格**全部**能抽（它们下面的锅腔格 distA 都比它们大）⇒ 进气量
           *     对得上气柱推进量（8 格/步 × 8 步 = 64 格/tick）；
           *   · 出口端**不会倒吸**：出口外的大气 distA 很小（离画布边界近），
           *     比管口格的 D 还小 ⇒ 不满足 distA > D ⇒ 永远不抽（天然防倒灌）；
           *   · 开放大气同理（迷宫上方那条空气带 distA 都很小）⇒ V40 依旧安全。 */
          if (!(distA[cc] > kt)) continue;              // 管外格必须比本格更远离排气口
          var ef = el[cc];
          if (ef === fid || !IS_GAS[ef]) continue;           // 火焰/非气体：不抽
          /* ★v1.7.3 管外候选**优先抽最热的那一格**（同级才按 hash 定序，保确定性）。
           * ★★为什么必须按温度挑（实测坐实，_inlet.js t=1200）：颈口正下方那 8 格
           *   被前面的抽气抽成了**空气泡** —— 锅腔顶 y=115 整层 117/131 格是蒸汽，
           *   唯独 x192..199（颈口正下方）是 0 格蒸汽。抽气一把它抽空，补进来的就是
           *   管里推下来的空气 ⇒ 下一 tick 又只抽到空气 ⇒ **进气口自锁**：
           *   30 格/tick 的进气量，抽进来的全是空气（实测管内汽常年只有 3~35 格，
           *   锅里却有 1963 格蒸汽）。
           * 物理上炉膛抽的本来就是**最热的那股烟气**（热气在上、贴着炉顶被抽走），
           * 不是随机抓一把 ⇒ 按温度挑是对的，不是 hack。
           * 温度相同（比如全是 100 °C 的饱和蒸汽）时退回 hash 定序 ⇒ 确定性不受影响。 */
          var tf = tp[cc];
          var kf = RNG.hashU32(cc % w, (cc / w) | 0, tick * 977 + salt * 131 + 7);
          if (bOut < 0 || tf > bOutT + 0.5 || (tf > bOutT - 0.5 && kf < bOutK)) {
            bOut = cc; bOutK = kf; if (tf > bOutT) bOutT = tf;
          }
          continue;
        }
        if (keyA[cc] !== kt + 1) continue;                   // 必须是"紧邻的下游一格"
        ec = el[cc];
        /* ★v1.7.2：空气**也搬**（整条气柱塞状推进）。为什么必须搬空气
         * 实测坐实（蛇形六腿，一次性烟塞）：烟塞 20 tick 就被抬升 60 格，说明输运没问题；
         * 但它 40~60 tick 就凝光了 —— 潜热 255 以 **3.45 °C/tick** 的速度被抽干
         * （⇒ 只能活 ~74 tick ⇒ 只走 ~170 格，而全程 725 格，差 4.3 倍）。
         * 这 3.45 °C/tick 从哪来？不是管壁（GAS_SOLID_R 已按真实烟道标定），而是
         * **管里塞满了静止的冷空气**：汽团四邻全是 22 °C 的空气，气-气换热把它瞬间淬冷。
         * 真实烟道里**气柱是连续的** —— 一团烟气的四邻是别的烟气，不是冷空气。
         * 我们模型里的"管里全是冷空气"本身就是错的：烟囱一旦抽起来，管内就该被炉膛
         * 来的热烟气**整体置换**。所以把空气一并推进：
         *   · 管内冷空气被整段推到出口排掉，深处补进炉膛/锅腔的热烟气 ⇒ 管内升温；
         *   · 汽团的四邻变成同温烟气 ⇒ 换热骤降 ⇒ 潜热不再被抽干 ⇒ 能走完全程；
         *   · 顺带这才是"看得见"的关键：管内不再是一层静止的透明空气。
         * 物理上这正是不可压缩塞状流（plug flow）的定义，不是提速 hack。
         * 开关 FLUE_MOVE_AIR（默认 1）仅供 A/B 对照。 */
        if (A.FLUE_MOVE_AIR === 0 && ec === AIR) continue;
        if (ec === fid || !IS_GAS[ec]) continue;                 // 火焰/非气体：不搬运
        var kx = RNG.hashU32(cc % w, (cc / w) | 0, tick * 131 + salt * 7717 + 31);
        if (bIn < 0 || kx < bInK) { bIn = cc; bInK = kx; }
      }
      /* 管内/管外怎么仲裁：
       * 管外候选只在"贴着炉膛的进气口"才存在（别处管道被石壁封着，管外不是气体；
       * 出口端又被 distA > kt 挡住不会倒吸），所以**有管外候选就抽管外** ——
       * 这正是烟囱该做的事。否则退回管内按 hash 定序。 */
      if (bOut >= 0) { best = bOut; bestOut = 1; }
      else if (bIn >= 0) { best = bIn; bestOut = 0; }
      if (best < 0) { stBlkLoser++; continue; }              // 上游没货可拉
      if (bestOut) stInlet++;                                // 这货是从管外（炉膛）拉来的
      stOwner++;
      c = best;
      var ax = c % w, ay = (c / w) | 0;
      bit = (x > ax) ? 1 : ((x < ax) ? 2 : ((y < ay) ? 4 : 8));
      fd[c] = bit; fd[t] = bit;
      grid.moveTo(c, t, amb);
      stamp[c] = tick; stamp[t] = tick;
      moved++;
    }
    return moved;
  }

  function rotate(grid, ctx) {
    var A = Balance.AIR;
    flueMoved = 0;
    var ad = flueDrive < 0 ? -flueDrive : flueDrive;
    var p = (ad - A.FLUE_MIN_DRIVE) / A.FLUE_DRIVE_SCALE;
    if (p > A.FLUE_P_MAX) p = A.FLUE_P_MAX;
    if (!(p > 0)) { flueSteps = 0; return; }           // 近等温 ⇒ 整个机制是空操作
    if (RNG.hash01(23, 89, ctx.tick * 7703 + 29) >= p) return;   // ← 整条烟道唯一的那个骰子
    var steps = deriveSteps(A);
    if (steps < 1) steps = 1;
    flueSteps = steps;
    var amb = ctx.ambient !== undefined ? ctx.ambient : Balance.PHYS.AMBIENT_T;
    for (var s = 0; s < steps; s++) flueMoved += stepOnce(grid, ctx.tick, amb, s + 1);
  }

  /* ============================================================
   * 调度：分析隔帧、转动每帧。节流**只看 tick**（写成"pipeCount===0 就分析"会在开放场景
   * 退化成每帧全量分析 —— 那是实测踩过的性能坑）。
   * ========================================================== */
  function flow(grid, ctx) {
    var A = Balance.AIR;
    var pmax = A.FLUE_P_MAX;
    if (typeof pmax !== 'number' || !isFinite(pmax) || pmax <= 0) {
      if (flueOn) reset();
      return;
    }
    flueOn = 1;
    ensureTables();
    /* 换了网格（尺寸变了，或换了一个 engine）⇒ 缓存的管网易主 ⇒ 一律作废重算。
     * 否则两个 engine 交替跑时会拿着上一个网格的管道去戳这一个（隐蔽的串格 bug）。 */
    if (_curGrid !== grid || _gridW !== grid.w || _gridH !== grid.h) {
      _curGrid = grid; _gridW = grid.w; _gridH = grid.h;
      pipeCount = 0; _force = 1;
    }
    if (!distA || grid.n > _n) ensure(grid.n);
    var iv = A.FLUE_ANALYZE_INTERVAL;
    var idleIv = A.FLUE_IDLE_INTERVAL;
    if (typeof idleIv !== 'number' || !isFinite(idleIv) || idleIv < 1) idleIv = iv;
    if (pipeCount === 0) iv = idleIv;         // 没有管道的场景不值得频繁扫全网格
    if (_force || iv <= 1 || (ctx.tick % iv) === 0) { _force = 0; analyze(grid, ctx); }
    if (pipeCount > 0) rotate(grid, ctx);
    flueOn = pipeCount > 0 ? 1 : 0;
  }

  /* ★占位锁（engine.step 在 movePass 之前调用）：只锁**此刻装着真东西**的核心管格。
   * 为什么必须锁：实测过"下行腿里常规浮力每 tick 把蒸汽往上抬 1 格、抽力再往下推 1 格
   * ⇒ 净位移恒为 0"（v1.6.10）。真实烟囱里抽力（压差梯度）本就强于浮力，
   * 所以"管内抽力优先"是正确建模，不是 hack。
   * 为什么只锁**非空**：空着的那一格必须留给常规物理去补 —— 管道最深端内容刚被搬空的
   * 那一格正是"把炉膛里的新烟气吸进来"的进气口；连它也锁上就是"饿死"的另一个版本。
   * 外伸链一律不锁（那是已经出去的部分，让它自由升腾）。 */
  function lock(grid, tick) {
    if (pipeCount <= 0 || !orderA || !grid.moveStamp) return 0;
    var el = grid.element, st = grid.moveStamp, cnt = 0;
    for (var k = 0; k < pipeCount; k++) {
      var c = orderA[k];
      if (extA[c]) continue;
      var e = el[c];
      if (e === AIR || e === fid || !IS_GAS[e]) continue;
      st[c] = tick; cnt++;
    }
    return cnt;
  }

  var api = {
    flow: flow,
    lock: lock,
    reset: reset,
    /* 诊断 / QA 接口（不参与仿真） */
    isPipe: function (i) { return (pipeFlag && i >= 0 && i < _n) ? pipeFlag[i] : 0; },
    isCore: function (i) { return (pipeFlag && extA && i >= 0 && i < _n && pipeFlag[i] && !extA[i]) ? 1 : 0; },
    distOf: function (i) { return (distA && i >= 0 && i < _n) ? distA[i] : -1; },
    parentOf: function (i) { return (pipePar && i >= 0 && i < _n) ? pipePar[i] : -1; },
    drive: function () { return flueDrive; },
    buoyancy: function () { return flueB; },
    headHeight: function () { return flueH; },
    supplyT: function () { return flueSupplyT; },
    supplyMaxT: function () { return flueSupplyMaxT; },
    steps: function () { return flueSteps; },
    moved: function () { return flueMoved; },
    /* 诊断：上一步的 [候选, 赢家, 被前面堵住, 目标非气体, 抢输]。
     * 链是否真的在传导，看 赢家−被堵 这一对：赢家多而被堵少 ⇒ 整条链一起动。 */
    stepStats: function () { return [stGas, stOwner, stBlkFull, stBlkSolid, stBlkLoser, stInlet]; },
    pipeCount: function () { return pipeCount; },
    coreCount: function () { return coreCount; },
    fieldCount: function () { return fieldCount; },
    /* [场格数, 最大受限连通块, 管网内最大锋面宽度, 核心格数, 管道总格数(含外伸),
     *  逸散点数, 最大行程, 供给端取样格数, 供给端温度, 热柱高度, 抽力, 本 tick 步数] */
    dbg: function () { return dbg.slice(0); },
    order: function (k) { return (orderA && k >= 0 && k < pipeCount) ? orderA[k] : -1; }
  };
  root.YS.Flue = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

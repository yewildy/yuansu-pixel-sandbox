/*
 * grid.js — SoA 类型化数组网格（docs/PHYSICS.md §1.1 / §15.1，DESIGN.md §9.2）
 *   320×180，四邻域；零热路径分配。
 *   防重复移动 / 反应：使用递增 tickId 的 stamp 数组，而非每帧清零 flags。
 *   （此为对 §1.1 flags 位的实现级等价优化，见 docs/adr/0001）
 *   v1.6.1：新增 flowDir（气流方向位标，供渲染器画定向拖影；纯 cosmetic，不入存档）。
 */
(function (root) {
  'use strict';

  function create(w, h) {
    var n = w * h;
    var g = {
      w: w,
      h: h,
      n: n,

      element: new Uint8Array(n),
      temp: new Float32Array(n),      // 官方温度场（浮点 °C；见 ADR-0001 / 审查 F17）
      nextTemp: new Float32Array(n),  // 导热工作缓冲（浮点，避免逐 tick 截断漂移；见 ADR-0001）
      age: new Uint16Array(n),
      latent: new Uint8Array(n),
      moveStamp: new Uint32Array(n),
      reactStamp: new Uint32Array(n),
      /* v1.4.1「分子色差」tint：每格 0-4 的色号，**随 swap/moveTo 一起搬行** ——
       * 渲染器对液体（WATER/OIL）用它选 5 档色阶，于是每个"水分子"有细微色差，
       * 流动时色块跟着粒子走，内部对流一眼可辨（用户："每个水分子颜色可以有细微的
       * 差异，这样他们在流动的时候我就能一眼看出来内部是怎么在流动的"）。
       * 纯 cosmetic：不影响任何物理/测试逻辑，不序列化。 */
      tint: new Uint8Array(n),

      /* v1.6.1 气流可视化（Phase 2）：每格一个方向位标（1=E 2=W 4=N 8=S），
       * 由 air/movement/wind 的气体置换写入（i↔j 两格都写）。渲染器据此给最近发生
       * 位移的气体格画极淡的定向拖影。纯 cosmetic：**不入存档**、不参与任何物理逻辑；
       * clear() / 读档时复位为 0。 */
      flowDir: new Uint8Array(n),

      /* v1.6.1 压强系统（Phase 3，docs/PRESSURE-MODEL.md）：三个 SoA 数组
       *   press      —— 冲击压 / 表压（爆炸冲压 + 外部注入；每 tick 指数衰减）
       *   stress     —— 墙体应力累积（跨壁压差驱动，"慢慢"变形的关键量）
       *   yieldStamp —— 屈服冷却戳（记录上次屈服 tick，避免同一格连续屈服）
       * 均为运行时派生量：**不入存档**；clear() / 读档复位为 0。热压不占数组 ——
       * 热压由各格温度按理想气体关系**即时算出**（见 balance.PRESSURE 注释）。 */
      press: new Float32Array(n),
      stress: new Float32Array(n),
      yieldStamp: new Uint32Array(n),

      tickId: 1,

      /* 复用型邻域缓冲区（零分配） */
      nb4: new Int32Array(4),
      nb8: new Int32Array(8)
    };

    g.idx = function (x, y) { return y * this.w + x; };
    g.xOf = function (i) { return i % this.w; };
    g.yOf = function (i) { return (i / this.w) | 0; };
    g.inBounds = function (x, y) { return x >= 0 && x < this.w && y >= 0 && y < this.h; };

    g.getEl = function (x, y) {
      if (x < 0 || x >= this.w || y < 0 || y >= this.h) return 0;
      return this.element[y * this.w + x];
    };
    g.getT = function (x, y) {
      if (x < 0 || x >= this.w || y < 0 || y >= this.h) return 0;
      return this.temp[y * this.w + x];
    };
    g.setEl = function (x, y, el, t) {
      var i = y * this.w + x;
      this.element[i] = el;
      if (t !== undefined) this.temp[i] = t;
      this.latent[i] = 0;
      this.age[i] = 0;
    };

    /* 交换两格的全部物质状态（质量/能量守恒的移动实现，§13.1；tint 随行——分子色差） */
    g.swap = function (i, j) {
      var e = this.element, t = this.temp, a = this.age, l = this.latent, tn = this.tint;
      var te = e[i], tt = t[i], ta = a[i], tl = l[i], ttin = tn[i];
      e[i] = e[j]; t[i] = t[j]; a[i] = a[j]; l[i] = l[j]; tn[i] = tn[j];
      e[j] = te; t[j] = tt; a[j] = ta; l[j] = tl; tn[j] = ttin;
    };

    /* v1.6.1 气流可视化：把 i→j 的气流方向**同时**写在 i 与 j 两格（方向由 (x,y) 坐标算，
     * 不按索引差猜）。位标 1=E 2=W 4=N 8=S（N=向上= y 减小）。相邻四邻置换通常只触发
     * 一组水平或垂直位；对角置换会同时置两方向位。纯 cosmetic，零分配。 */
    g.markFlow = function (i, j) {
      var w = this.w, fd = this.flowDir;
      var xi = i % w, xj = j % w;
      if (xj > xi) { fd[i] |= 1; fd[j] |= 2; }
      else if (xj < xi) { fd[i] |= 2; fd[j] |= 1; }
      var yi = (i / w) | 0, yj = (j / w) | 0;
      if (yj < yi) { fd[i] |= 4; fd[j] |= 8; }
      else if (yj > yi) { fd[i] |= 8; fd[j] |= 4; }
    };

    /* 将 src 移入空位 dst（dst 必须是 EMPTY），源格变为 EMPTY 并归环境温 */
    g.moveTo = function (src, dst, ambient) {
      var e = this.element, t = this.temp, a = this.age, l = this.latent, tn = this.tint;
      e[dst] = e[src]; t[dst] = t[src]; a[dst] = a[src]; l[dst] = l[src]; tn[dst] = tn[src];
      e[src] = 1; t[src] = ambient; a[src] = 0; l[src] = 0; tn[src] = 0;
    };

    /* 填充 4 邻域索引到 g.nb4，越界为 -1；顺序 [W,E,N,S] */
    g.fill4 = function (i) {
      var x = i % this.w, y = (i / this.w) | 0, out = this.nb4, w = this.w, h = this.h;
      out[0] = x > 0 ? i - 1 : -1;
      out[1] = x < w - 1 ? i + 1 : -1;
      out[2] = y > 0 ? i - w : -1;
      out[3] = y < h - 1 ? i + w : -1;
      return out;
    };

    /* 填充 8 邻域索引到 g.nb8，越界为 -1；顺序：TL,T,TR,L,R,BL,B,BR */
    g.fill8 = function (i) {
      var x = i % this.w, y = (i / this.w) | 0, out = this.nb8, w = this.w, h = this.h;
      var xm = x > 0, xp = x < w - 1, ym = y > 0, yp = y < h - 1;
      out[0] = (xm && ym) ? i - w - 1 : -1;
      out[1] = ym ? i - w : -1;
      out[2] = (xp && ym) ? i - w + 1 : -1;
      out[3] = xm ? i - 1 : -1;
      out[4] = xp ? i + 1 : -1;
      out[5] = (xm && yp) ? i + w - 1 : -1;
      out[6] = yp ? i + w : -1;
      out[7] = (xp && yp) ? i + w + 1 : -1;
      return out;
    };

    g.countNonEmpty = function () {
      var e = this.element, c = 0;
      for (var i = 0; i < this.n; i++) if (e[i] !== 1) c++;
      return c;
    };

  /* 全清：全部 EMPTY，温度设为环境温 */
  g.clear = function (ambient) {
    var a = ambient === undefined ? 20 : ambient;
    this.element.fill(1);
    this.temp.fill(a);
    this.nextTemp.fill(a);
    this.age.fill(0);
    this.latent.fill(0);
    this.moveStamp.fill(0);
    this.reactStamp.fill(0);
    this.flowDir.fill(0);          // v1.6.1 气流方向位标：清空
    this.press.fill(0);            // v1.6.1 压强系统：冲击压 / 表压
    this.stress.fill(0);           // v1.6.1 压强系统：墙体应力
    this.yieldStamp.fill(0);       // v1.6.1 压强系统：屈服冷却戳
    /* tint 重洗牌：确定性整数哈希（不依赖 RNG 模块，避免加载顺序耦合）→ 0-4 */
    var tn = this.tint;
    for (var q = 0; q < this.n; q++) {
      var hh = Math.imul(q + 0x9e3779b9, 2654435761) >>> 0;
      hh ^= hh >>> 15;
      tn[q] = hh % 5;
    }
    this.tickId = 1;
  };

    /* 将 nextTemp 提交回官方 temp（四舍五入 + 钳制，§13.4） */
    g.commitTemp = function (minT, maxT) {
      // 只钳制、不取整（审查 F17）：
      // 若在这里四舍五入回整数，每 tick < 0.5°C 的升温会被永久丢弃，
      // 导致冰在空气中永远升不到 0°C（实测 3000 tick 温度纹丝不动卡在 -10）。
      var t = this.temp, nt = this.nextTemp, n = this.n;
      for (var i = 0; i < n; i++) {
        var v = nt[i];
        if (v < minT) v = minT; else if (v > maxT) v = maxT;
        t[i] = v;
      }
    };

    /* 初始化：全部 EMPTY + 环境温 */
    g.clear(20);
    return g;
  }

  var api = { create: create };
  root.YS = root.YS || {};
  root.YS.Grid = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

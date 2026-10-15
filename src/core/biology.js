/*
 * biology.js — 生命 / 植物 / 病毒（docs/PLANT-MODEL.md，替代 docs/PHYSICS.md §10）
 *   严格生态：① 发芽须着地；② 生长须根系连通地面（isRooted，有界 BFS + 节流）；
 *   ③ 生长消耗附近水分；④ 高度由供水能力/毛细极限自然封顶（CAPILLARY_HEAD）；
 *   ⑤ v1.2.0 起：断根/干旱 → **休眠**（停止生长，不死亡、不变 DUST）；
 *   ⑥ v1.4.0 起：横向（藤蔓）生长（VINE_P，对齐 Powder Game 的 Vine——
 *     只向侧上生长、须有支撑，见 docs/PLANT-MODEL.md「横向/藤蔓生长」一节）。
 *
 *   字段复用（不新增数组）：SEED.age = 发芽计时器；PLANT.age = 枯萎计时器；SOIL.age = 含水量。
 *   模块级缓存（rootQ/rootVisit/wiltList/rootedCache/rootedStamp）按 grid.n 惰性分配，零热路径 new。
 *   零 DOM。
 */
(function (root) {
  'use strict';

  var Balance = root.YS.Balance;
  var Elements = root.YS.Elements;
  var RNG = root.YS.RNG;
  var ID = Elements.ID;
  var ELS = Elements.ELEMENTS;

  var SEED = ID.SEED, PLANT = ID.PLANT, WATER = ID.WATER, SOIL = ID.SOIL,
    ASH = ID.ASH, DUST = ID.DUST, AIR = 1;

  /* ---------- 模块级缓存（按 n 惰性分配） ---------- */
  var cachedN = -1;
  var rootQ = new Int32Array(1);
  var rootVisit = new Int32Array(1);
  var wiltList = new Int32Array(1);
  var rootedCache = new Uint8Array(1);
  var rootedStamp = new Int32Array(1);
  var visitId = 0;

  /* 根区搜索临时结果（避免每次分配对象） */
  var foundWater = -1;
  var foundSoil = -1;

  function ensure(n) {
    if (cachedN === n) return;
    rootQ = new Int32Array(n);
    rootVisit = new Int32Array(n);
    rootedCache = new Uint8Array(n);
    rootedStamp = new Int32Array(n);
    wiltList = new Int32Array(Balance.PLANT.MAX_COLONY);
    visitId = 0;
    cachedN = n;
  }

  /* 落脚面：静态固体 / 粉末（不含 PLANT —— 群落内部靠 BFS 继续向下找，见 §3.2） */
  function isGroundSurface(e) {
    if (e === AIR || e === PLANT) return false;
    var E = ELS[e];
    return !!E && (E.state === 'solid' || E.state === 'powder');
  }

  /* 有界 BFS：判该 PLANT 格是否连通到地面（§3.1） */
  function isRooted(grid, start, limit) {
    var el = grid.element, w = grid.w, h = grid.h;
    var q = rootQ;
    visitId++;
    var head = 0, tail = 0, steps = 0;
    q[tail++] = start; rootVisit[start] = visitId;
    while (head < tail) {
      var p = q[head++]; steps++;
      if (steps > limit) return false;                 // 超限 → 保守判为"未连地"
      var py = (p / w) | 0;
      if (py === h - 1) return true;                   // 底行 = 硬地面
      if (isGroundSurface(el[p + w])) return true;     // 正下方是地面
      var px = p % w;
      if (px > 0 && el[p - 1] === PLANT && rootVisit[p - 1] !== visitId) { rootVisit[p - 1] = visitId; q[tail++] = p - 1; }
      if (px < w - 1 && el[p + 1] === PLANT && rootVisit[p + 1] !== visitId) { rootVisit[p + 1] = visitId; q[tail++] = p + 1; }
      if (py > 0 && el[p - w] === PLANT && rootVisit[p - w] !== visitId) { rootVisit[p - w] = visitId; q[tail++] = p - w; }
      if (py < h - 1 && el[p + w] === PLANT && rootVisit[p + w] !== visitId) { rootVisit[p + w] = visitId; q[tail++] = p + w; }
    }
    return false;
  }

  /* 节流缓存版 isRooted：每株每 ROOT_CHECK_INTERVAL tick 最多做一次 BFS（§3.3） */
  function rootedAt(grid, i, x, y, tick) {
    if (rootedStamp[i] === 0 || ((x * 7 + y * 13 + tick) % Balance.PLANT.ROOT_CHECK_INTERVAL) === 0) {
      rootedCache[i] = isRooted(grid, i, Balance.PLANT.ROOT_SEARCH_MAX) ? 1 : 2;
      rootedStamp[i] = tick;
    }
    return rootedCache[i] === 1;
  }

  /* 柱基（该列最下方 PLANT 格）；近似根区锚点 */
  function columnBase(grid, x, y) {
    var el = grid.element, w = grid.w, h = grid.h, cy = y;
    while (cy + 1 < h && el[(cy + 1) * w + x] === PLANT) cy++;
    return cy * w + x;
  }

  /* 柱高（含本格的连续 PLANT 竖向长度） */
  function columnHeight(grid, x, y) {
    var el = grid.element, w = grid.w, h = grid.h, up = 0, dn = 0, cy = y - 1;
    while (cy >= 0 && el[cy * w + x] === PLANT) { up++; cy--; }
    cy = y + 1;
    while (cy < h && el[cy * w + x] === PLANT) { dn++; cy++; }
    return up + dn + 1;
  }

  /* 根区取水：在 base 周围 WATER_REACH 内找最近 WATER / 湿土，写入 foundWater/foundSoil（§4.2） */
  function findWater(grid, base, reach) {
    var el = grid.element, w = grid.w, h = grid.h;
    var bx = base % w, by = (base / w) | 0;
    foundWater = -1; foundSoil = -1;
    var bw = 1e9, bs = 1e9;
    for (var dy = -reach; dy <= reach; dy++) {
      var yy = by + dy; if (yy < 0 || yy >= h) continue;
      for (var dx = -reach; dx <= reach; dx++) {
        var xx = bx + dx; if (xx < 0 || xx >= w) continue;
        var n = yy * w + xx, e = el[n];
        var dist = (dx < 0 ? -dx : dx) + (dy < 0 ? -dy : dy);
        if (e === WATER) { if (dist < bw) { bw = dist; foundWater = n; } }
        else if (e === SOIL && grid.age[n] > 0) { if (dist < bs) { bs = dist; foundSoil = n; } }
      }
    }
  }

  /* 生长耗水（§4.2；v1.4.0 起向上生长与横向藤蔓生长共用同一套逻辑）：
   * 以 WATER_COST_P 概率消耗 1 单位水 —— 优先取水（WATER→AIR），其次抽湿土。
   * 读模块级 foundWater/foundSoil（由 findWater 为本列柱基写入）。 */
  function consumeGrowthWater(grid, x, y, tick, amb) {
    if (RNG.hash01(x, y, tick * 47 + 17) >= Balance.PLANT.WATER_COST_P) return;
    if (foundWater >= 0) {
      grid.element[foundWater] = AIR; grid.temp[foundWater] = amb;
      grid.age[foundWater] = 0; grid.latent[foundWater] = 0;
    } else if (foundSoil >= 0) {
      var sa = grid.age[foundSoil];
      grid.age[foundSoil] = sa > Balance.PLANT.SOIL_DRAW ? sa - Balance.PLANT.SOIL_DRAW : 0;
    }
  }

  /* 整株一次性枯死（一次 BFS 收集 + 统一写，§6.2） */
  function wiltColony(grid, start, tick) {
    var el = grid.element, w = grid.w, h = grid.h, age = grid.age, lat = grid.latent;
    var cap = Balance.PLANT.MAX_COLONY, dustP = Balance.PLANT.DEATH_DUST_P;
    var q = rootQ, list = wiltList;
    visitId++;
    var head = 0, tail = 0, cnt = 0;
    q[tail++] = start; rootVisit[start] = visitId;
    while (head < tail && cnt < cap) {
      var p = q[head++];
      list[cnt++] = p;
      var px = p % w, py = (p / w) | 0;
      if (px > 0 && el[p - 1] === PLANT && rootVisit[p - 1] !== visitId) { rootVisit[p - 1] = visitId; q[tail++] = p - 1; }
      if (px < w - 1 && el[p + 1] === PLANT && rootVisit[p + 1] !== visitId) { rootVisit[p + 1] = visitId; q[tail++] = p + 1; }
      if (py > 0 && el[p - w] === PLANT && rootVisit[p - w] !== visitId) { rootVisit[p - w] = visitId; q[tail++] = p - w; }
      if (py < h - 1 && el[p + w] === PLANT && rootVisit[p + w] !== visitId) { rootVisit[p + w] = visitId; q[tail++] = p + w; }
    }
    for (var c = 0; c < cnt; c++) {
      var ci = list[c], cx = ci % w, cy = (ci / w) | 0;
      el[ci] = (RNG.hash01(cx, cy, tick * 43 + 29) < dustP) ? DUST : AIR;
      age[ci] = 0; lat[ci] = 0;
    }
  }

  /* 群落规模（BFS，带 MAX_COLONY 上限；仅在实际生长前调用，成本可控） */
  function colonySize(grid, start) {
    var el = grid.element, w = grid.w, h = grid.h;
    var cap = Balance.PLANT.MAX_COLONY, q = rootQ;
    visitId++;
    var head = 0, tail = 0, cnt = 0;
    q[tail++] = start; rootVisit[start] = visitId;
    while (head < tail && cnt < cap) {
      var p = q[head++]; cnt++;
      var px = p % w, py = (p / w) | 0;
      if (px > 0 && el[p - 1] === PLANT && rootVisit[p - 1] !== visitId) { rootVisit[p - 1] = visitId; q[tail++] = p - 1; }
      if (px < w - 1 && el[p + 1] === PLANT && rootVisit[p + 1] !== visitId) { rootVisit[p + 1] = visitId; q[tail++] = p + 1; }
      if (py > 0 && el[p - w] === PLANT && rootVisit[p - w] !== visitId) { rootVisit[p - w] = visitId; q[tail++] = p - w; }
      if (py < h - 1 && el[p + w] === PLANT && rootVisit[p + w] !== visitId) { rootVisit[p + w] = visitId; q[tail++] = p + w; }
    }
    return cnt;
  }

  function lifePass(grid, ctx) {
    ensure(grid.n);
    var tick = ctx.tick, w = grid.w, h = grid.h;
    var el = grid.element, age = grid.age, temp = grid.temp, latent = grid.latent;
    var amb = ctx.ambient !== undefined ? ctx.ambient : Balance.PHYS.AMBIENT_T;
    var x, y, i, e, T;

    /* ---- pass A：SOIL 含水量（邻水吸水 / 无水失水，§4.3） ---- */
    for (y = 0; y < h; y++) {
      var row = y * w;
      for (x = 0; x < w; x++) {
        i = row + x;
        if (el[i] !== SOIL) continue;
        var hasW = false;
        if (x > 0 && el[i - 1] === WATER) hasW = true;
        else if (x < w - 1 && el[i + 1] === WATER) hasW = true;
        else if (y > 0 && el[i - w] === WATER) hasW = true;
        else if (y < h - 1 && el[i + w] === WATER) hasW = true;
        if (hasW) { if (age[i] < Balance.SOIL.MOISTURE_MAX) age[i] += Balance.SOIL.MOISTURE_GAIN; }
        else if (age[i] > 0) { age[i] -= Balance.SOIL.DRY_RATE; }
      }
    }

    /* ---- pass B：SEED 发芽 / PLANT 生长枯萎 ---- */
    for (y = 0; y < h; y++) {
      var row2 = y * w;
      for (x = 0; x < w; x++) {
        i = row2 + x;
        e = el[i];
        if (e !== SEED && e !== PLANT) continue;
        T = temp[i];

        /* ===== SEED：四条件（着地 / 湿度 / 温度 / 露头，§2.1） ===== */
        if (e === SEED) {
          if (T > Balance.SEED.DEATH_HOT_T) {
            el[i] = RNG.hash01(x, y, tick * 31 + 5) < 0.5 ? ASH : AIR; age[i] = 0; continue;
          }
          if (T < Balance.SEED.DEATH_COLD_T) { el[i] = AIR; age[i] = 0; continue; }

          var grounded = true;
          if (Balance.SEED.GROUND_REQUIRED) {
            grounded = (y === h - 1) ? true : isGroundSurface(el[i + w]);
          }
          var wet = false;
          var R = Balance.SEED.MOIST_RADIUS;
          for (var dy = -R; dy <= R && !wet; dy++) {
            var yy = y + dy; if (yy < 0 || yy >= h) continue;
            for (var dx = -R; dx <= R; dx++) {
              var xx = x + dx; if (xx < 0 || xx >= w) continue;
              var v = el[yy * w + xx];
              if (v === WATER || (v === SOIL && age[yy * w + xx] > 0)) { wet = true; break; }
            }
          }
          var exposed = false;
          if (y > 0) { var a1 = el[i - w]; if (a1 === AIR || a1 === WATER) exposed = true; }
          if (!exposed && y > 1) { var a2 = el[i - 2 * w]; if (a2 === AIR || a2 === WATER) exposed = true; }
          var tempOK = (T >= Balance.SEED.TEMP_MIN && T <= Balance.SEED.TEMP_MAX);

          if (grounded && wet && tempOK && exposed) { if (age[i] < 65535) age[i]++; }
          else { age[i] = age[i] > 2 ? age[i] - 2 : 0; }

          if (age[i] >= Balance.SEED.GERM_TIMER_REQ &&
            RNG.hash01(x, y, tick * 37 + 7) < Balance.SEED.GERM_P) {
            el[i] = PLANT; age[i] = 0; latent[i] = 0; rootedStamp[i] = 0;
          }
          continue;
        }

        /* ===== PLANT：根系 / 枯萎 / 生长 ===== */
        var base = columnBase(grid, x, y);
        findWater(grid, base, Balance.PLANT.WATER_REACH);
        var hasWater = (foundWater >= 0) || (foundSoil >= 0);
        var rooted = rootedAt(grid, i, x, y, tick);

        /* v1.2.0：植物不再枯死。
         * 用户诉求原文：「植物，你就让他有水就可以一直往上走就可以了，没必要设置一个死亡」。
         * 这与 Powder Game 一致 —— 它的 Vine / Seed-grown 植物压根没有枯萎死亡机制，
         * 只会一直长（Vine 甚至能在火、液体、岩浆表面生长）。
         * 于是断根 / 根区无水改为**休眠**：停止生长、不再累积应激、绝不产生 DUST，
         * 一旦重新接水接地立即恢复生长。旧的 wiltColony（整株变 DUST）保留代码但不再被调用，
         * 以免存档/外部引用断裂（见 docs/PLANT-MODEL.md §7 修订）。 */
        if (!rooted || !hasWater) {
          age[i] = 0;                                    // 休眠：不累积计时
        } else {
          age[i] = age[i] > 2 ? age[i] - 2 : 0;
        }

        /* 生长公共闸门：必须连地（未连地绝不生长，§4.1 —— 守住"空中楼阁"红线）
         * 且根区有水/湿土。v1.4.0 起向上生长与横向（藤蔓）生长并列，
         * 故不再用 continue 早退（一方条件不满足不得连带跳过另一方）。 */
        if (!rooted) continue;
        if (!hasWater) continue;                              // 根区无水无湿土 → 生长暂停（上/横生共用）

        /* ---- 向上生长（§4.1；GROW_P=0.08，受 CAPILLARY_HEAD=80 软上限）----
         * 仅"直立茎"格可向上生长：latent>0 的格是横向蔓延生成的**匍匐蔓**
         * （stolon，贴着基底侧向延伸的器官），不向上抽枝。
         * 为什么必须分开（v1.4.0 实测）：若每枚蔓格都能向上抽枝，群落会以
         * VINE_P/格/tick 指数式铺开，MAX_COLONY=512 在数百 tick 内耗尽、
         * 全部生长（含主柱）冻结；且平行水柱共享根区水源，主柱高度实测
         * 只有 19（V6 红线要求 ≥30）。分开后蔓贴地蔓延、茎依水长高，互不饿死。 */
        if (y > 0 && latent[i] === 0) {
          var up = i - w, ue = el[up];
          if (ue === AIR || ue === WATER) {
            var hh = columnHeight(grid, x, y);
            if (hh < Balance.PLANT.CAPILLARY_HEAD) {          // 毛细供水极限（软墙）
              var pgrow = Balance.PLANT.GROW_P * (1 - hh / Balance.PLANT.CAPILLARY_HEAD);
              if (RNG.hash01(x, y, tick * 43 + 13) < pgrow &&
                colonySize(grid, i) < Balance.PLANT.MAX_COLONY) {
                el[up] = PLANT; temp[up] = T; age[up] = 0; latent[up] = 0; rootedStamp[up] = 0;
                consumeGrowthWater(grid, x, y, tick, amb);    // §4.2 耗水
              }
            }
          }
        }

        /* ---- 横向（藤蔓）生长（v1.4.0，B1；对齐 Powder Game 的 Vine：
         * "only grows sideways and up, never down" —— 只向侧上生长，且可覆盖在各种基底上）----
         * 模型 = **贴地蔓（stolon）**：匍匐茎贴着基底向侧方延伸，本身不再向上抽枝
         * （latent 标记为 1，见上）；要长成新的直立枝条，由该处的直立茎格负责。
         * 闸门：rooted + hasWater + colonySize < MAX_COLONY + **发起格贴地**
         *   （正下方是地面；贴底行时网格底边即地板 —— 守住"空中楼阁"红线，
         *    悬空的植株格不横生）。不受 CAPILLARY_HEAD 限制（那不是垂直吸水）。
         * 目标 = 左/右格为 AIR 或 WATER；左/右方向由 RNG 定序；耗水与向上生长
         * 完全复用（consumeGrowthWater：WATER_COST_P / foundWater / foundSoil）。
         *
         * 支撑条件为何收紧为"贴地"（任务书原文为"地面或 PLANT"，v1.4.0 实测后收紧）：
         * 若允许借助下方 PLANT 格逐层堆叠，蔓层会糊成多行方块（V6 实测 N=310），
         * 把根区水源吃光后主柱高度停在 24（<30，V6 红线 FAIL）。贴地蔓下实测
         * V6 主柱 35/32/27（种子 1337/7/42），且蔓仍可覆盖任何地面基底。
         * 详见 docs/PLANT-MODEL.md「横向/藤蔓生长（v1.4.0）」。 */
        var supported = (y === h - 1) || isGroundSurface(el[i + w]);
        if (supported && RNG.hash01(x, y, tick * 41 + 11) < Balance.PLANT.VINE_P &&
          colonySize(grid, i) < Balance.PLANT.MAX_COLONY) {
          var vd = RNG.hash01(x, y, tick * 53 + 7) < 0.5 ? -1 : 1;   // 左/右定序
          var vn = -1;
          if (x + vd >= 0 && x + vd < w) {
            var ve = el[i + vd];
            if (ve === AIR || ve === WATER) vn = i + vd;
          }
          if (vn < 0 && x - vd >= 0 && x - vd < w) {
            var ve2 = el[i - vd];
            if (ve2 === AIR || ve2 === WATER) vn = i - vd;
          }
          if (vn >= 0) {
            el[vn] = PLANT; temp[vn] = T; age[vn] = 0;
            latent[vn] = 1;                            // 匍匐蔓标记：不再向上抽枝（见上）
            rootedStamp[vn] = 0;
            consumeGrowthWater(grid, x, y, tick, amb);
          }
        }
      }
    }
  }

  var api = { lifePass: lifePass, isRooted: isRooted, isGroundSurface: isGroundSurface };
  root.YS.Biology = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

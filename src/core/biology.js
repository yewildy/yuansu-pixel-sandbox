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
    WOOD = ID.WOOD, ASH = ID.ASH, DUST = ID.DUST, AIR = 1;

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
  /* v1.4.1 茎秆导水源：本格 4 邻域的水（浇在头顶/叶面上，根区够不着时用它） */
  var touchWater = -1;

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

  /* v1.4.1：种子着地判据 —— 下方是地面，**或**下方是同类种子且该种子堆在
   * SEED.CHAIN_MAX 格内连到地面（种子堆本身即基质）。
   * 为什么必须放宽：8×8 种子块贴着水时，顶部种子"湿+露头"但下方是种子（旧判据判未着地），
   * 底部种子"着地+湿"却被同类埋住不露头 —— 整块一粒都不发芽（配对实验 SEED×WATER
   * mid/large 由 PASS 变 FAIL 的直接原因；旧代码靠"种子浮水被水流打散"侥幸通过）。
   * 有界下探（≤CHAIN_MAX 格）保住"空中楼阁"红线：悬空过高的种子照旧不发。 */
  function seedGrounded(grid, x, y) {
    var el = grid.element, w = grid.w, h = grid.h, cy = y + 1, steps = 0;
    while (cy < h && steps < Balance.SEED.CHAIN_MAX) {
      var e = el[cy * w + x];
      if (e === AIR) return false;
      if (isGroundSurface(e)) return true;
      if (e !== SEED) return false;
      cy++; steps++;
    }
    return cy >= h;                                   // 探到网格底边 = 硬地面
  }

  /* 有界 BFS：判该 PLANT 格是否连通到地面（§3.1） */  function isRooted(grid, start, limit) {
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
    } else if (touchWater >= 0) {
      /* v1.4.1：喝叶面上的水（茎秆导水的消耗端）—— 浇在植物头顶的水被生长消耗，
       * 不会出现"头顶泡着水却无限白嫖生长"。 */
      grid.element[touchWater] = AIR; grid.temp[touchWater] = amb;
      grid.age[touchWater] = 0; grid.latent[touchWater] = 0;
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

  /* v1.4.3 ★树生长（docs/PLANT-MODEL.md §14）：
   * 活木格（WOOD + latent 1/2）携带"生长势预算"（存 age）：
   *   · 树干（latent=1）向上长一格并把剩余预算**带上去**（本格随即硬化 latent=0）；
   *   · 按 BRANCH_P 抽枝：斜上方生出一根**树枝**（latent=2），带走一部分预算；
   *   · 树枝（latent=2）沿斜上方继续生长，可按 SUB_BRANCH_P 再抽子枝；
   *   · 每格生长按 LEAF_P 在周围空位撒**树叶**（PLANT latent=2，不生长）；
   *   · 预算耗尽（≤MIN_VIGOR）→ 整棵树硬化成普通 WOOD（惰性、可燃、烧得慢）。
   * 树的大小因此完全由种子吸到的水量决定 —— 与 Powder Toy「size controlled by the amount
   * of water the seed absorbed」一致。 */
  function treeGrow(grid, i, x, y, tick, amb, isTrunk) {
    var el = grid.element, temp = grid.temp, age = grid.age, lat = grid.latent;
    var w = grid.w, T = Balance.TREE;
    var vigor = age[i];
    if (vigor <= T.MIN_VIGOR) { lat[i] = 0; age[i] = 0; return; }        // 长成 → 硬化
    /* 生叶：周围 8 邻域空位长一片叶（不占预算） */
    if (RNG.hash01(x, y, tick * 43 + 31) < T.LEAF_P) {
      var nbs = grid.fill8(i);
      for (var k = 0; k < 8; k++) {
        var n = nbs[k];
        if (n < 0 || el[n] !== 1) continue;
        /* v1.4.3：**树干正上方不长叶** —— 否则叶会堵住树干自己的生长路径
         * （实测：树干被自己头顶的叶子卡死，只长到 2 格就停）。 */
        if (isTrunk && n === i - w) continue;
        el[n] = PLANT; lat[n] = 2; temp[n] = temp[i]; age[n] = 0; rootedStamp[n] = 0;
        break;
      }
    }
    var p = isTrunk ? T.TRUNK_P : T.TRUNK_P * 0.85;
    var up = (y > 0) ? (i - w) : -1;
    if (up >= 0 && el[up] === 1 && RNG.hash01(x, y, tick * 47 + 13) < p) {
      var nv = vigor - T.COST;
      el[up] = WOOD; lat[up] = isTrunk ? 1 : 2; age[up] = nv > 0 ? nv : 0; temp[up] = temp[i];
      var bp = isTrunk ? T.BRANCH_P : T.SUB_BRANCH_P;
      if (nv > T.MIN_VIGOR * 2 && RNG.hash01(x, y, tick * 53 + 17) < bp) {   // 抽枝（斜上一侧）
        var dir = RNG.hash01(x, y, tick * 59 + 19) < 0.5 ? -1 : 1;
        var bx = x + dir;
        if (bx >= 0 && bx < w) {
          var bn = (y - 1) * w + bx;
          if (el[bn] === 1) {
            var bv = Math.floor(nv * T.BRANCH_SHARE);
            el[bn] = WOOD; lat[bn] = 2; age[bn] = bv; temp[bn] = temp[i];
            age[up] = nv - bv;
          }
        }
      }
      lat[i] = 0; age[i] = 0;                                  // 预算上移，本格硬化
      return;
    }
    /* 树枝：斜上方生长（维持"横向铺开"的树冠形态） */
    if (!isTrunk && y > 0) {
      var d2 = RNG.hash01(x, y, tick * 61 + 23) < 0.5 ? -1 : 1;
      for (var s2 = 0; s2 < 2; s2++) {
        var dd = s2 === 0 ? d2 : -d2;
        var nx2 = x + dd;
        if (nx2 < 0 || nx2 >= w) continue;
        var nj = (y - 1) * w + nx2;
        if (el[nj] !== 1) continue;
        if (RNG.hash01(x, y, tick * 67 + 29) < p) {
          var nv2 = vigor - T.COST;
          el[nj] = WOOD; lat[nj] = 2; age[nj] = nv2 > 0 ? nv2 : 0; temp[nj] = temp[i];
          lat[i] = 0; age[i] = 0;
          return;
        }
      }
    }
    /* 被挡住（上方/斜上无空位，例如种子头顶还压着水或土）：**原地等待、不消耗预算**。
     * v1.4.3 实测教训：初版在这里每 tick 扣 1 点预算，种子头顶的水要几十上百 tick 才排开，
     * 树的预算在"等待"期间被白白耗光 → 只长出 1 格木头 5 片叶就硬化（树苗夭折）。
     * 空间一旦腾出即继续生长；预算只由真实生长消耗 —— 与"树的大小由吸水量决定"一致。 */
    return;
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
        var isLiveWood = (e === WOOD && (latent[i] === 1 || latent[i] === 2));
        if (e !== SEED && e !== PLANT && !isLiveWood) continue;
        T = temp[i];

        /* ===== SEED：四条件（着地 / 湿度 / 温度 / 露头，§2.1） ===== */
        if (e === SEED) {
          if (T > Balance.SEED.DEATH_HOT_T) {
            el[i] = RNG.hash01(x, y, tick * 31 + 5) < 0.5 ? ASH : AIR; age[i] = 0; continue;
          }
          if (T < Balance.SEED.DEATH_COLD_T) { el[i] = AIR; age[i] = 0; continue; }

          var grounded = true;
          if (Balance.SEED.GROUND_REQUIRED) {
            grounded = seedGrounded(grid, x, y);
          }
          var wet = false, wetSrc = -1, soilSrc = -1;
          var R = Balance.SEED.MOIST_RADIUS;
          for (var dy = -R; dy <= R; dy++) {
            var yy = y + dy; if (yy < 0 || yy >= h) continue;
            for (var dx = -R; dx <= R; dx++) {
              var xx = x + dx; if (xx < 0 || xx >= w) continue;
              var v = el[yy * w + xx];
              if (v === WATER) { wet = true; wetSrc = yy * w + xx; break; }
              if (v === SOIL && age[yy * w + xx] > 0 && soilSrc < 0) { wet = true; soilSrc = yy * w + xx; }
            }
            if (wetSrc >= 0) break;
          }
          /* v1.4.1 露头判据放宽为"四邻域任一为 AIR/WATER"（即"未被深埋"）：
           * 旧判据只看正上方 1-2 格 → 压在同类种子上的种子（上方是种子）与
           * 底部贴着水膜的种子（上方是同类）统统判为"未露头"，整块种子一粒不发芽
           * （配对实验 SEED×WATER mid/large FAIL 的第二层原因）。
           * 深埋守卫不失效：埋在土/沙/其他固体里的种子四邻皆非空非水 → 照旧不发。 */
          var exposed = false;
          var nbE = grid.fill4(i);
          for (var kE = 0; kE < 4; kE++) {
            var nE = nbE[kE];
            if (nE >= 0) { var vE = el[nE]; if (vE === AIR || vE === WATER) { exposed = true; break; } }
          }
          var tempOK = (T >= Balance.SEED.TEMP_MIN && T <= Balance.SEED.TEMP_MAX);
          /* v1.4.3：体内库存水（含水量 ≥ GERM_WATER）即视为供水 —— 旧逻辑有个自相矛盾的死结：
           * 种子把周围的水吸干后反而被判"缺水"、萌发计时器清零，于是永远发不了芽
           * （G2 实测 age 61→0 循环）。物理上种子吸胀后靠体内水分即可完成萌发。 */
          if (!wet && latent[i] >= Balance.TREE.GERM_WATER) wet = true;

          if (grounded && wet && tempOK && exposed) {
            if (age[i] < 65535) age[i]++;
            /* v1.4.2 吸胀吸水（imbibition）：种子在萌发进程中会真的把邻近的水吸进体内 ——
             * 物理依据就是"种子吸水膨胀"本身（配对实验对 SEED×WATER 的预期原话）。
             * 作用：① 单格水滴不再在表面无限游走（旧实现下 SEED×WATER small 的水滴会飘走，
             * 计时器随之清零 → 永不发芽，跨种子 flaky）；② 给玩家反馈：浇在种子上的水会消失。
             * 概率刻意很低（≈每 250 tick 吸 1 格），保证"先攒满萌发计时、后吸干水源"的次序。 */
            if (RNG.hash01(x, y, tick * 67 + 29) < Balance.SEED.ABSORB_P) {
              /* v1.4.3：吸胀水源 = **湿润半径内的水或湿土**（物理：根区吸水），
               * 不再要求四邻紧贴 —— 旧实现下"隔一堵墙的水"算湿却吸不到，种子永远发不了芽。
               * 吸到的水记为**含水量**（latent），蓄够 GERM_WATER 才能萌发，
               * 且含水量决定长成多大的树（原版：树的大小由种子吸收的水量决定）。 */
              if (wetSrc >= 0 && el[wetSrc] === WATER) {
                el[wetSrc] = AIR; temp[wetSrc] = amb; age[wetSrc] = 0; latent[wetSrc] = 0;
                var na = latent[i] + Balance.TREE.ABSORB_GAIN;
                latent[i] = na > 255 ? 255 : na;
              } else if (soilSrc >= 0) {
                var sa2 = age[soilSrc];
                if (sa2 > 0) {
                  age[soilSrc] = sa2 > 40 ? sa2 - 40 : 0;
                  var na2 = latent[i] + Balance.TREE.ABSORB_GAIN;
                  latent[i] = na2 > 255 ? 255 : na2;
                }
              }
            }
          }
          /* v1.4.2：失水时计时器**缓降**（-1，旧值 -2）—— 生理依据：种子吸胀（imbibition）
           * 一旦开始便不可逆，短暂失水只是让萌发进程缓慢倒退，而不是清零重来。
           * 配合 FILM_SPREAD_F 收紧（孤立水滴被表面张力钉住、不再扩散游走）后，
           * 配对实验 SEED×WATER small 的多颗种子均可发芽。完全无水的种子 age 仍停在 0。 */
          else { age[i] = age[i] > 1 ? age[i] - 1 : 0; }

          if (age[i] >= Balance.SEED.GERM_TIMER_REQ && latent[i] >= Balance.TREE.GERM_WATER &&
            RNG.hash01(x, y, tick * 37 + 7) < Balance.SEED.GERM_P) {
            /* v1.4.3 ★萌发成**树**：树干 = WOOD（latent=1），生长势预算 = 含水量 × VIGOR_PER_W
             * （存在 age —— 静态固体的 age 不参与寿命，可安全复用）。 */
            var vg = latent[i] * Balance.TREE.VIGOR_PER_W;
            el[i] = WOOD; age[i] = vg > 65535 ? 65535 : vg; latent[i] = 1; rootedStamp[i] = 0;
          }
          continue;
        }

        /* ===== WOOD（活木：树干 latent=1 / 树枝 latent=2）===== */
        if (isLiveWood) {
          treeGrow(grid, i, x, y, tick, amb, latent[i] === 1);
          continue;
        }

        /* ===== PLANT：根系 / 枯萎 / 生长 ===== */
        if (latent[i] === 2) continue;                 // 树叶（latent=2）：不生长（v1.4.3）
        var base = columnBase(grid, x, y);
        touchWater = -1;
        findWater(grid, base, Balance.PLANT.WATER_REACH);
        var hasWater = (foundWater >= 0) || (foundSoil >= 0);
        /* v1.4.1 茎秆导水（用户实测：「浇水浇不下去，植物就不长了」）：
         * 水浇在植物身上（窄井/洞穴里浇不进根区，或浇在头顶叶面）→ 4 邻域任一格
         * 有水即算整株供水，该格同时作为消耗水源（见 consumeGrowthWater）。
         * 物理依据：茎秆的毛细导水 —— 浇在叶面的水会沿茎流到根。 */
        if (!hasWater) {
          var nbT = grid.fill4(i);
          for (var kT = 0; kT < 4; kT++) {
            var nT = nbT[kT];
            if (nT >= 0 && el[nT] === WATER) { touchWater = nT; hasWater = true; break; }
          }
        }
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

/*
 * reactions.js — 化学反应（docs/PHYSICS.md §8 反应表 + §9 燃烧 + §9.5 爆炸）
 *   优先级仲裁（§15.4）：爆炸 > 灭火 > 燃烧 > 腐蚀 > 溶解 > 克隆/病毒 > 相变。
 *   反应使用 reactStamp 落锁，防止同一格一帧内触发多条。
 *   零 DOM。
 */
(function (root) {
  'use strict';

  var Balance = root.YS.Balance;
  var Elements = root.YS.Elements;
  var RNG = root.YS.RNG;
  var ID = Elements.ID;
  var ELS = Elements.ELEMENTS;
  var P = Balance.PHYS;

  /* 爆炸 BFS 队列（模块级预分配，零热路径分配） */
  var EQ = new Int32Array(1 << 16);
  var EQD = new Uint8Array(1 << 16);

  /* §9.6 点燃耗氧：把目标格的可达氧（半径 R 内、不可穿墙，见 findOxygen）任一 AIR → SMOKE。
   * 关键：点火所依赖的氧必须被真实扣掉，否则单格 AIR 足以点燃整片燃料 → 密闭盒被烧穿。 */
  function consumeOxygenNear(grid, i, tick) {
    var R = Balance.FIRE.OXY_RADIUS;
    var n = findOxygen(grid, i, R);
    if (n < 0) return false;
    grid.element[n] = ID.SMOKE; grid.temp[n] = 100; grid.age[n] = 0; grid.latent[n] = 0;
    grid.reactStamp[n] = tick;
    return true;
  }

  /* 燃料 id → 参数表（docs/COMBUSTION-MODEL.md §6.1）。
   * latent 存的是元素 id，故惰性建一张 id 索引表，避免热路径字符串查表。 */
  var FUEL_BY_ID = null;
  function fuelOf(id) {
    if (FUEL_BY_ID === null) {
      FUEL_BY_ID = new Array(31);
      for (var k = 1; k <= 30; k++) {
        var key = ELS[k] ? ELS[k].key : null;
        FUEL_BY_ID[k] = (key && Balance.FUEL[key]) ? Balance.FUEL[key] : null;
      }
    }
    return (id >= 1 && id <= 30) ? FUEL_BY_ID[id] : null;
  }

  /* §9.1 条件 3（修订）：目标格半径 R（Chebyshev，默认 2）内存在 AIR(1) 视为通气。**仅 AIR 算氧**。
   * 关键实现细节：搜索**不可穿透 WALL**（BFS 限幅 R，WALL 视为屏障）——否则 1 格厚的密闭盒
   * 会被半径 2 判据「看穿」到盒外大气，使密封盒持续燃烧（N1 红线的直接根因）。
   * 返回第一个找到的 AIR 索引（无则 -1）。R=0/1 时退化为 8/24 邻域直接检查。 */
  var _oxyQ = new Int32Array(256), _oxyD = new Int32Array(256);
  function findOxygen(grid, i, R) {
    var el = grid.element, w = grid.w, h = grid.h;
    if (el[i] === 1) return i;
    if (R < 1) return -1;
    var x = i % w, y = (i / w) | 0;
    /* 快速路径：8 邻域直接命中（开阔空气中的绝大多数情形，避免 BFS 开销） */
    if (x > 0) { if (el[i - 1] === 1) return i - 1; }
    if (x < w - 1) { if (el[i + 1] === 1) return i + 1; }
    var yUp = y > 0, yDn = y < h - 1;
    if (yUp) { if (el[i - w] === 1) return i - w; }
    if (yDn) { if (el[i + w] === 1) return i + w; }
    if (x > 0 && yUp && el[i - w - 1] === 1) return i - w - 1;
    if (x < w - 1 && yUp && el[i - w + 1] === 1) return i - w + 1;
    if (x > 0 && yDn && el[i + w - 1] === 1) return i + w - 1;
    if (x < w - 1 && yDn && el[i + w + 1] === 1) return i + w + 1;
    if (R <= 1) return -1;
    /* 慢路径：BFS 扩到半径 R（WALL 不可穿透） */
    var head = 0, tail = 1;
    _oxyQ[0] = i; _oxyD[0] = 0;
    while (head < tail) {
      var cur = _oxyQ[head], d = _oxyD[head]; head++;
      if (d >= R) continue;
      var cx = cur % w, cy = (cur / w) | 0;
      for (var dy = -1; dy <= 1; dy++) {
        var ny = cy + dy; if (ny < 0 || ny >= h) continue;
        for (var dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          var nx = cx + dx; if (nx < 0 || nx >= w) continue;
          var n = ny * w + nx;
          var e = el[n];
          if (e === 1) return n;          // 找到 AIR
          if (e === ID.WALL) continue;    // 墙不可穿透
          if (tail < _oxyQ.length) { _oxyQ[tail] = n; _oxyD[tail] = d + 1; tail++; }
        }
      }
    }
    return -1;
  }

  function hasOxygen(grid, i, radius) {
    var R = (radius === undefined) ? Balance.FIRE.OXY_RADIUS : radius;
    return findOxygen(grid, i, R) >= 0;
  }

  /* §9.6 耗氧：把一个 AIR 邻格 → SMOKE（燃烧尾气），温度设 100 °C。
   *   force=true  → 持续耗氧模式：**必消耗** 1 格邻接 AIR（每 OXY_CONSUME_INTERVAL tick 调一次）。
   *   force=false → 兼容旧「点燃时一次性消耗」：以 OXY_CONSUME_P 概率消耗（ignite 首帧调用）。 */
  function consumeOxygen(grid, i, tick, force) {
    var A = Balance.AIR;
    var w = grid.w, el = grid.element;
    var x = i % w, y = (i / w) | 0;
    var cand = grid.fill4(i), k, n, cnt = 0;
    for (k = 0; k < 4; k++) { n = cand[k]; if (n >= 0 && el[n] === 1) cnt++; }
    if (cnt === 0) return;                                   // 无 AIR 邻格 → 不消耗
    if (!force && RNG.hash01(x, y, tick * 263 + 7) >= A.OXY_CONSUME_P) return;
    var pick = RNG.hashU32(x, y, tick * 269 + 11) % cnt;
    var seen = 0;
    for (k = 0; k < 4; k++) {
      n = cand[k]; if (n < 0 || el[n] !== 1) continue;
      if (seen === pick) {
        el[n] = ID.SMOKE; grid.temp[n] = 100; grid.age[n] = 0; grid.latent[n] = 0;
        grid.reactStamp[n] = tick;
        return;
      }
      seen++;
    }
  }

  function bumpTemp(grid, i, d) {
    var v = grid.temp[i] + d;
    if (v > P.MAX_TEMP) v = P.MAX_TEMP; else if (v < P.MIN_TEMP) v = P.MIN_TEMP;
    grid.temp[i] = v;
    if (grid.nextTemp[i] < P.MAX_TEMP) grid.nextTemp[i] = v; // 同步导热缓冲，避免被本帧覆盖
  }

  function burnTemp(e) {
    var fu = fuelOf(e);
    if (fu) return fu.burnTemp;             // §6.1 逐燃料燃烧温度（docs/COMBUSTION-MODEL.md）
    if (e === ID.GUNPOWDER) return 900;
    if (e === ID.GAS) return 540;
    var el = ELS[e];
    return (el && el.ignitionTemp) ? el.ignitionTemp : 300;
  }

  /* 性能护栏（docs/COMBUSTION-MODEL.md §6.2）：同时 FIRE 格数 ≤ FIRE.MAX_BURN_CELLS。
   * 惰性计数：本 tick 首次蔓延判定时统计一次全网格 FIRE 数，之后由 ignite() 自增。 */
  var fireTally = -1;
  function fireCapReached(grid) {
    if (fireTally < 0) {
      var c = 0, e = grid.element;
      for (var i = 0, n = grid.n; i < n; i++) if (e[i] === ID.FIRE) c++;
      fireTally = c;
    }
    return fireTally >= Balance.FIRE.MAX_BURN_CELLS;
  }

  /* 点燃一格燃料 → FIRE；对 GUNPOWDER/GAS 做 8 邻真链式传播（§9.4） */
  function ignite(grid, j, tick) {
    var e = grid.element[j];
    grid.element[j] = ID.FIRE;
    grid.temp[j] = burnTemp(e);
    grid.age[j] = 0;
    grid.latent[j] = e;              // 存原始燃料 id → 锚定判据 + agePass 据此决定寿命/残灰（§9.2/§9.3）
    grid.reactStamp[j] = tick;
    consumeOxygenNear(grid, j, tick);  // §9.6 点火耗氧：扣掉半径 2 内 1 格 AIR→SMOKE（氧预算）
    if (grid.latent[j] > 0 && fireTally >= 0) fireTally++;   // 计入性能护栏
    if (e === ID.GUNPOWDER || e === ID.GAS) {
      var nb = grid.fill8(j);
      for (var k = 0; k < 8; k++) {
        var n = nb[k];
        if (n < 0) continue;
        if (grid.element[n] === e && grid.reactStamp[n] !== tick) {
          if (RNG.hash01(n % grid.w, (n / grid.w) | 0, e * 251 + tick) < 0.8) ignite(grid, n, tick);
        }
      }
    }
  }

  /* ---------- §9.5 爆炸 ---------- */
  function explosionPass(grid, ctx) {
    var tick = ctx.tick, w = grid.w, h = grid.h, el = grid.element;
    var R = Balance.TNT.RADIUS;
    var chainMax = Balance.TNT.CHAIN_MAX;
    var cap = P.MAX_EXPLOSION_CELLS;
    var head = 0, tail = 0, processed = 0, i, x, y, e;

    /* 收集触发源：TNT 温度 ≥180 或 邻接 FIRE */
    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) {
        i = y * w + x;
        if (el[i] !== ID.TNT) continue;
        if (grid.reactStamp[i] === tick) continue;
        /* 引爆判据（v1.2.2）：自身达自燃温度，或 4 邻域存在 FIRE / 达自燃温度的热体（岩浆等）。
         * 旧判据只有「自身 ≥180℃」+「邻接 FIRE」，导致 LAVA×TNT 失败——
         * 单格岩浆会随液体流动铺开，与 TNT 的接触只有 1~2 tick，传热量不足以把 TNT 烤到 180℃，
         * 但现实中 1200℃ 的岩浆接触 TNT 必然瞬爆（TNT 自燃温度仅约 160~200℃）。 */
        if (grid.temp[i] >= Balance.TNT.IGNITE_T || adjFire(grid, i) || adjHot(grid, i)) {
          grid.reactStamp[i] = tick;
          EQ[tail] = i; EQD[tail] = 0; tail++;
        }
      }
    }
    if (tail === 0) return;

    while (head < tail) {
      var ci = EQ[head]; var depth = EQD[head]; head++;
      if (processed >= cap) break;
      processed++;
      var cx = ci % w, cy = (ci / w) | 0;

      for (var dy = -R; dy <= R; dy++) {
        var yy = cy + dy; if (yy < 0 || yy >= h) continue;
        for (var dx = -R; dx <= R; dx++) {
          var xx = cx + dx; if (xx < 0 || xx >= w) continue;
          var j = yy * w + xx;
          e = el[j];
          if (e === ID.WALL) continue;
          if (e === 1) { bumpTemp(grid, j, Balance.TNT.TEMP_BOOST); continue; }

          /* 半径内触发链式（TNT / GUNPOWDER / GAS） */
          if ((e === ID.TNT || e === ID.GUNPOWDER || e === ID.GAS) && grid.reactStamp[j] !== tick && depth + 1 <= chainMax) {
            if (e === ID.TNT) {
              grid.reactStamp[j] = tick;
              if (tail < EQ.length) { EQ[tail] = j; EQD[tail] = depth + 1; tail++; }
            } else {
              ignite(grid, j, tick);
            }
          }

          var isStatic = !ELS[e].movable;
          if (isStatic) {
            el[j] = RNG.hash01(xx, yy, tick * 7 + 3) < 0.5 ? 1 : ID.FIRE;
            if (el[j] === ID.FIRE) { grid.temp[j] = 900; grid.age[j] = 0; grid.latent[j] = 0; } // 爆炸火焰=自由火焰
          } else {
            if (RNG.hash01(xx, yy, tick * 7 + 11) < Balance.TNT.P_FIRE) {
              el[j] = ID.FIRE; grid.temp[j] = 900; grid.age[j] = 0; grid.latent[j] = 0;
            } else {
              /* 沿径向抛出 1–3 格 */
              throwCell(grid, cx, cy, j);
            }
          }
          bumpTemp(grid, j, Balance.TNT.TEMP_BOOST);
        }
      }
    }
  }

  function adjFire(grid, i) {
    var el = grid.element, w = grid.w, h = grid.h;
    var x = i % w, y = (i / w) | 0;
    if (x > 0 && el[i - 1] === ID.FIRE) return true;
    if (x < w - 1 && el[i + 1] === ID.FIRE) return true;
    if (y > 0 && el[i - w] === ID.FIRE) return true;
    if (y < h - 1 && el[i + w] === ID.FIRE) return true;
    return false;
  }

  /* 4 邻域是否存在温度达到 TNT 自燃点的热体（岩浆 / 明火 / 炽热金属等） */
  function adjHot(grid, i) {
    var el = grid.element, temp = grid.temp, w = grid.w, h = grid.h;
    var x = i % w, y = (i / w) | 0, t = Balance.TNT.IGNITE_T, j;
    if (x > 0) { j = i - 1; if (el[j] !== 1 && temp[j] >= t) return true; }
    if (x < w - 1) { j = i + 1; if (el[j] !== 1 && temp[j] >= t) return true; }
    if (y > 0) { j = i - w; if (el[j] !== 1 && temp[j] >= t) return true; }
    if (y < h - 1) { j = i + w; if (el[j] !== 1 && temp[j] >= t) return true; }
    return false;
  }

  function throwCell(grid, cx, cy, j) {
    var w = grid.w, h = grid.h, el = grid.element;
    var x = j % w, y = (j / w) | 0;
    var sx = x > cx ? 1 : (x < cx ? -1 : 0);
    var sy = y > cy ? 1 : (y < cy ? -1 : 0);
    if (sx === 0 && sy === 0) return;
    var best = -1;
    for (var k = 1; k <= 3; k++) {
      var nx = x + sx * k, ny = y + sy * k;
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) break;
      var n = ny * w + nx;
      if (el[n] === 1) best = n; else break;
    }
    if (best >= 0) {
      grid.moveTo(j, best, P.AMBIENT_T);
    }
  }

  /* ---------- 常规反应扫描 ---------- */
  function reactionPass(grid, ctx) {
    explosionPass(grid, ctx);
    var tick = ctx.tick, w = grid.w, h = grid.h, el = grid.element;
    var x, y, i, e, nb, k, n, t, p;
    var F = Balance.FIRE;
    var consumeNow = (F.OXY_CONSUME_INTERVAL > 0) && ((tick % F.OXY_CONSUME_INTERVAL) === 0);
    var maxBurn = F.MAX_BURN_CELLS;
    fireTally = -1;                        // 性能护栏：本 tick 惰性重计 FIRE 数

    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) {
        i = y * w + x;
        e = el[i];
        if (e === 1) continue;
        if (grid.reactStamp[i] === tick) continue;

        /* --- FIRE：灭火(R1) 与 燃烧(R2..R7/R18) --- */
        if (e === ID.FIRE) {
          nb = grid.fill4(i);
          /* R1 灭火 */
          var extinguished = false;
          for (k = 0; k < 4; k++) {
            n = nb[k]; if (n < 0) continue;
            if (el[n] === ID.WATER) {
              el[i] = ID.SMOKE; grid.age[i] = 0; grid.temp[i] = 100;
              bumpTemp(grid, n, 55);
              grid.reactStamp[i] = tick;
              extinguished = true;
              break;
            }
          }
          if (extinguished) continue;
          /* §9.6 持续耗氧（仅锚定火焰）：每 OXY_CONSUME_INTERVAL tick 必消耗 1 格邻接 AIR→SMOKE */
          if (consumeNow && grid.latent[i] > 0) consumeOxygen(grid, i, tick, true);
          /* 燃烧邻格燃料（蔓延，§9.2 修订）：目标格需通气（Chebyshev-2 仅 AIR），概率 = FUEL.spreadP×方向偏置 */
          for (k = 0; k < 4; k++) {
            n = nb[k]; if (n < 0) continue;
            t = el[n];
            if (t === 1) continue;
            if (grid.reactStamp[n] === tick) continue;
            var fe = ELS[t];
            if (!(fe.flammability > 0)) continue;
            var needsOxy = !(t === ID.GUNPOWDER || t === ID.GAS);
            /* 热解引燃（v1.2.0，docs/PHYSICS-AIR.md §A10）：
             * 燃料被邻近火焰烤到燃点后会自身热解出可燃气体（pyrolysis），
             * 这一步**不需要外界氧气渗入**，故可豁免 hasOxygen 的前置门槛。
             * 不加这条时，24×24 木堆内部 Chebyshev-2 内永远无 AIR（表面烧掉后留下的是 ASH 而非通道），
             * 火只能在表层烧一圈就自灭 —— 实测仅烧掉 37%，配对实验判 FAIL「火离开燃料」。
             * 氧气约束改由 ignite() 内的 consumeOxygenNear 承担：真缺氧（4 邻无 AIR）时不耗氧，
             * 配合 §9.6 持续耗氧仍可达成密封自熄（测试 N1-8/N1-9 红线）。 */
            var pyro = grid.temp[n] >= fe.ignitionTemp;
            if (needsOxy && !pyro) {
              if (!hasOxygen(grid, n)) continue;                 // §9.1 条件 3（修订）：半径 2 内有 AIR
              if (fireCapReached(grid)) continue;                // 性能护栏：FIRE 格数上限
            }
            var bias = dirBias(x, y, n % w, (n / w) | 0);
            var fu = fuelOf(t);
            var spreadP = fu ? fu.spreadP : fe.flammability;     // §6.1：优先用 FUEL.spreadP
            var pign = pyro ? 1.0 : spreadP * bias;
            if (RNG.hash01(n % w, (n / w) | 0, t * 173 + tick) < pign) ignite(grid, n, tick);
          }
          continue;
        }

        /* --- ACID：腐蚀 R8/R9/R10 --- */
        if (e === ID.ACID) {
          nb = grid.fill4(i);
          for (k = 0; k < 4; k++) {
            n = nb[k]; if (n < 0) continue;
            t = el[n];
            if (t === ID.METAL) {
              if (RNG.hash01(x, y, ID.ACID * 61 + tick) < Balance.ACID.ETCH_METAL_P) {
                el[n] = RNG.hash01(x, y, tick * 13 + 5) < 0.3 ? ID.GAS : 1;
                grid.age[n] = 0; grid.latent[n] = 0; grid.reactStamp[n] = tick;
                bumpTemp(grid, n, 10);
                if (RNG.hash01(x, y, tick * 17 + 9) < 0.5) { el[i] = 1; grid.reactStamp[i] = tick; break; }
              }
            } else if (t === ID.STONE) {
              if (RNG.hash01(x, y, ID.ACID * 67 + tick) < Balance.ACID.ETCH_STONE_P) {
                el[n] = 1; grid.reactStamp[n] = tick;
                if (RNG.hash01(x, y, tick * 19 + 3) < 0.3) { el[i] = 1; grid.reactStamp[i] = tick; break; }
              }
            } else if (t === ID.PLANT) {
              /* S-ACID（新增）：酸腐蚀生物组织 → PLANT 枯萎为 DUST（p=ETCH_PLANT_P） */
              if (RNG.hash01(n % w, (n / w) | 0, ID.ACID * 83 + tick) < Balance.ACID.ETCH_PLANT_P) {
                el[n] = ID.DUST; grid.age[n] = 0; grid.latent[n] = 0; grid.reactStamp[n] = tick;
              }
            }
            /* GLASS 耐酸（R10）：无操作 */
          }
          continue;
        }

        /* --- LAVA：R12/R13 遇水/冰 --- */
        if (e === ID.LAVA) {
          nb = grid.fill4(i);
          for (k = 0; k < 4; k++) {
            n = nb[k]; if (n < 0) continue;
            t = el[n];
            if (t === ID.WATER) {
              el[i] = ID.STONE; grid.reactStamp[i] = tick; grid.latent[i] = 0; grid.age[i] = 0;
              if (RNG.hash01(n % w, (n / w) | 0, tick * 23 + 1) < Balance.LAVA.STEAM_P) {
                el[n] = ID.STEAM; grid.age[n] = 0; grid.latent[n] = 0;
              }
              grid.reactStamp[n] = tick;
              bumpTemp(grid, n, 120);
              break;
            } else if (t === ID.ICE) {
              el[i] = ID.STONE; grid.reactStamp[i] = tick; grid.latent[i] = 0; grid.age[i] = 0;
              el[n] = RNG.hash01(n % w, (n / w) | 0, tick * 29 + 2) < 0.7 ? ID.STEAM : ID.WATER;
              grid.age[n] = 0; grid.latent[n] = 0; grid.reactStamp[n] = tick;
              bumpTemp(grid, n, 120);
              break;
            } else if (t === ID.PLANT) {
              /* S-LAVA（新增）：岩浆同 tick 点燃植物（p=IGNITE_PLANT_P=1.0）并自身凝固 */
              if (RNG.hash01(n % w, (n / w) | 0, tick * 271 + 5) < Balance.LAVA.IGNITE_PLANT_P) {
                ignite(grid, n, tick);
                el[i] = ID.STONE; grid.reactStamp[i] = tick; grid.latent[i] = 0; grid.age[i] = 0;
                break;
              }
            } else if (t === ID.SAND) {
              /* --- R20 接触玻璃化（**主规则**，§7.7） ---
               * LAVA 4 邻接 SAND → SAND 以 p=GLASS_CONTACT_P=0.02/tick 变 GLASS，
               * 同时 LAVA 侧降温 GLASS_CONTACT_COST=20 °C（玻璃化耗能）。
               * 为何用「接触反应」而非温度阈值：沙密度 1600 < 岩浆 2800 → 沙浮于岩浆表面，
               * 「倒岩浆在沙上」只能单面受热，实测封顶约 368 °C，够不到任何合理阈值。
               * 这里不 break：一个 LAVA 格可同时玻璃化多个邻接沙格，各自独立判定。 */
              if (RNG.hash01(n % w, (n / w) | 0, ID.LAVA * 103 + tick) < Balance.SAND.GLASS_CONTACT_P) {
                el[n] = ID.GLASS; grid.age[n] = 0; grid.latent[n] = 0; grid.reactStamp[n] = tick;
                bumpTemp(grid, i, -Balance.SAND.GLASS_CONTACT_COST);
              }
            }
          }
          continue;
        }

        /* --- SALT：R11 溶解 --- */
        if (e === ID.SALT) {
          nb = grid.fill4(i);
          for (k = 0; k < 4; k++) {
            n = nb[k]; if (n < 0) continue;
            if (el[n] === ID.WATER) {
              p = Balance.SALT.DISSOLVE_P * ELS[ID.SALT].solubility;
              if (RNG.hash01(x, y, ID.SALT * 53 + tick) < p) {
                el[i] = 1; grid.reactStamp[i] = tick;
                bumpTemp(grid, n, -2);
              }
              break;
            }
          }
          continue;
        }

        /* --- VIRUS：R15/R16 --- */
        if (e === ID.VIRUS) {
          nb = grid.fill4(i);
          for (k = 0; k < 4; k++) {
            n = nb[k]; if (n < 0) continue;
            t = el[n];
            if (grid.reactStamp[n] === tick) continue;
            if (t === ID.PLANT || t === ID.WOOD) {
              if (RNG.hash01(n % w, (n / w) | 0, ID.VIRUS * 71 + tick) < Balance.VIRUS.INFECT_PLANT_P) {
                el[n] = ID.VIRUS; grid.age[n] = 0; grid.latent[n] = 0; grid.reactStamp[n] = tick;
              }
            } else if (t === ID.SEED) {
              if (RNG.hash01(n % w, (n / w) | 0, ID.VIRUS * 73 + tick) < Balance.VIRUS.INFECT_SEED_P) {
                el[n] = ID.VIRUS; grid.age[n] = 0; grid.latent[n] = 0; grid.reactStamp[n] = tick;
              }
            }
          }
          continue;
        }

        /* --- CLONE：R14 复制 --- */
        if (e === ID.CLONE) {
          if (ctx.cloneCreated >= Balance.CLONE.MAX_CELLS) continue;
          if ((tick % Balance.CLONE.COPY_INTERVAL) !== 0) continue;
          var nb8 = grid.fill8(i);
          /* 选一个非静态的邻居元素作为模板 */
          var tmpl = 0;
          for (k = 0; k < 8; k++) {
            n = nb8[k]; if (n < 0) continue;
            t = el[n];
            if (t !== 1 && ELS[t].movable) { tmpl = t; break; }
          }
          if (tmpl === 0) continue;
          /* 找一个相邻 EMPTY 落点 */
          for (k = 0; k < 8; k++) {
            n = nb8[k]; if (n < 0) continue;
            if (el[n] === 1) {
              el[n] = tmpl; grid.temp[n] = grid.temp[i]; grid.age[n] = 0; grid.latent[n] = 0;
              grid.reactStamp[n] = tick;
              ctx.cloneCreated++;
              break;
            }
          }
          continue;
        }

        /* --- SPRING：R19 持续出水（质量创生例外，与 CLONE 并列，§8.4 / §13.2） ---
         * 每 SPRING.EMIT_INTERVAL tick 向一个相邻 AIR 格生成 WATER（20 °C）；
         * 全局累计产水达 SPRING.MAX_CELLS 后停喷；SPRING 自身不移动、不消耗。 */
        if (e === ID.SPRING) {
          if (ctx.springCreated >= Balance.SPRING.MAX_CELLS) continue;
          if ((tick % Balance.SPRING.EMIT_INTERVAL) !== 0) continue;
          var nbs = grid.fill4(i);
          /* 出水方向优先序：下 → 左 → 右 → 上（让水自然下落/汇聚） */
          var pref = [nbs[3], nbs[0], nbs[1], nbs[2]];
          for (k = 0; k < 4; k++) {
            var sp = pref[k];
            if (sp < 0) continue;
            if (el[sp] === 1) {
              el[sp] = ID.WATER;
              grid.temp[sp] = P.AMBIENT_T; grid.nextTemp[sp] = P.AMBIENT_T;
              grid.age[sp] = 0; grid.latent[sp] = 0; grid.reactStamp[sp] = tick;
              ctx.springCreated++;
              break;
            }
          }
          continue;
        }
      }
    }
  }

  function dirBias(fx, fy, nx, ny) {
    if (ny < fy) return Balance.FIRE.SPREAD_UP_BIAS;
    if (ny > fy) return Balance.FIRE.SPREAD_DOWN_BIAS;
    return 1.0;
  }

  var api = { reactionPass: reactionPass, ignite: ignite, hasOxygen: hasOxygen, explosionPass: explosionPass, fuelOf: fuelOf };
  root.YS.Reactions = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

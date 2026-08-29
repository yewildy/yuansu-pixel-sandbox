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

  function hasOxygen(grid, i) {
    var el = grid.element, w = grid.w, h = grid.h;
    var x = i % w, y = (i / w) | 0, t;
    if (x > 0) { t = el[i - 1]; if (t === 1 || t === 26 || t === 23) return true; }
    if (x < w - 1) { t = el[i + 1]; if (t === 1 || t === 26 || t === 23) return true; }
    if (y > 0) { t = el[i - w]; if (t === 1 || t === 26 || t === 23) return true; }
    if (y < h - 1) { t = el[i + w]; if (t === 1 || t === 26 || t === 23) return true; }
    return false;
  }

  function bumpTemp(grid, i, d) {
    var v = grid.temp[i] + d;
    if (v > P.MAX_TEMP) v = P.MAX_TEMP; else if (v < P.MIN_TEMP) v = P.MIN_TEMP;
    grid.temp[i] = v;
    if (grid.nextTemp[i] < P.MAX_TEMP) grid.nextTemp[i] = v; // 同步导热缓冲，避免被本帧覆盖
  }

  function burnTemp(e) {
    if (e === ID.WOOD) return 600;
    if (e === ID.OIL) return 700;
    if (e === ID.COAL) return 800;
    if (e === ID.GUNPOWDER) return 900;
    if (e === ID.GAS) return 540;
    var el = ELS[e];
    return (el && el.ignitionTemp) ? el.ignitionTemp : 300;
  }

  /* 点燃一格燃料 → FIRE；对 GUNPOWDER/GAS 做 8 邻真链式传播（§9.4） */
  function ignite(grid, j, tick) {
    var e = grid.element[j];
    grid.element[j] = ID.FIRE;
    grid.temp[j] = burnTemp(e);
    grid.age[j] = 0;
    grid.latent[j] = 0;
    grid.reactStamp[j] = tick;
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
        if (grid.temp[i] >= 180 || adjFire(grid, i)) {
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
            if (el[j] === ID.FIRE) { grid.temp[j] = 900; grid.age[j] = 0; }
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
          /* 燃烧邻格燃料 */
          for (k = 0; k < 4; k++) {
            n = nb[k]; if (n < 0) continue;
            t = el[n];
            if (t === 1) continue;
            if (grid.reactStamp[n] === tick) continue;
            var fe = ELS[t];
            if (!(fe.flammability > 0)) continue;
            var needsOxy = !(t === ID.GUNPOWDER || t === ID.GAS);
            if (needsOxy && !hasOxygen(grid, n)) continue;
            var bias = dirBias(x, y, n % w, (n / w) | 0);
            var pign = (grid.temp[n] >= fe.ignitionTemp) ? 1.0 : fe.flammability * bias;
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
      }
    }
  }

  function dirBias(fx, fy, nx, ny) {
    if (ny < fy) return Balance.FIRE.SPREAD_UP_BIAS;
    if (ny > fy) return Balance.FIRE.SPREAD_DOWN_BIAS;
    return 1.0;
  }

  var api = { reactionPass: reactionPass, ignite: ignite, hasOxygen: hasOxygen, explosionPass: explosionPass };
  root.YS.Reactions = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

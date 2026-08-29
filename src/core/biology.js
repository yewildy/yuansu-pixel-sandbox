/*
 * biology.js — 生命 / 植物 / 病毒（docs/PHYSICS.md §10）
 *   种子发芽（三条件 + 计时器）、植物生长与枯萎、极端温度死亡。
 *   age 字段：SEED = 发芽计时器，PLANT = 枯萎计时器（§10）。
 *   零 DOM。
 */
(function (root) {
  'use strict';

  var Balance = root.YS.Balance;
  var Elements = root.YS.Elements;
  var RNG = root.YS.RNG;
  var ID = Elements.ID;

  var SEED = ID.SEED, PLANT = ID.PLANT, WATER = ID.WATER, SOIL = ID.SOIL, ASH = ID.ASH, DUST = ID.DUST;

  function lifePass(grid, ctx) {
    var tick = ctx.tick, w = grid.w, h = grid.h, el = grid.element, age = grid.age, temp = grid.temp;
    var x, y, i, e, T, n, k;

    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) {
        i = y * w + x;
        e = el[i];
        if (e !== SEED && e !== PLANT) continue;
        T = temp[i];

        if (e === SEED) {
          /* 极端温度死亡 */
          if (T > Balance.SEED.DEATH_HOT_T) {
            el[i] = RNG.hash01(x, y, tick * 31 + 5) < 0.5 ? ASH : 1;
            age[i] = 0; continue;
          }
          if (T < Balance.SEED.DEATH_COLD_T) { el[i] = 1; age[i] = 0; continue; }

          /* 湿度：8 邻域 WATER 或 SOIL */
          var nb = grid.fill8(i), moist = false;
          for (k = 0; k < 8; k++) { n = nb[k]; if (n < 0) continue; if (el[n] === WATER || el[n] === SOIL) { moist = true; break; } }
          /* 露头（近似「光」）：正上方 2 格内至少一格 EMPTY 或 WATER */
          var exposed = false;
          if (y > 0) { var a1 = el[i - w]; if (a1 === 1 || a1 === WATER) exposed = true; }
          if (!exposed && y > 1) { var a2 = el[i - 2 * w]; if (a2 === 1 || a2 === WATER) exposed = true; }
          var tempOK = (T >= Balance.SEED.TEMP_MIN && T <= Balance.SEED.TEMP_MAX);

          if (moist && exposed && tempOK) { if (age[i] < 65535) age[i]++; }
          else { age[i] = age[i] > 2 ? age[i] - 2 : 0; }

          if (age[i] >= Balance.SEED.GERM_TIMER_REQ &&
              RNG.hash01(x, y, tick * 37 + 7) < Balance.SEED.GERM_P) {
            el[i] = PLANT; age[i] = 0; grid.latent[i] = 0;
          }
          continue;
        }

        /* PLANT：生长 / 蔓延 / 枯萎 */
        if (e === PLANT) {
          /* 湿度（半径 2 内 WATER/SOIL）→ 记录枯萎计时 */
          var wet = false;
          for (var dyy = -2; dyy <= 2 && !wet; dyy++) {
            var yy = y + dyy; if (yy < 0 || yy >= h) continue;
            for (var dxx = -2; dxx <= 2; dxx++) {
              var xx = x + dxx; if (xx < 0 || xx >= w) continue;
              var v = el[yy * w + xx];
              if (v === WATER || v === SOIL) { wet = true; break; }
            }
          }
          if (wet) age[i] = 0;
          else if (age[i] < 65535) age[i]++;

          if (age[i] >= Balance.PLANT.WILT_TICKS) {
            el[i] = RNG.hash01(x, y, tick * 41 + 11) < 0.5 ? DUST : 1;
            age[i] = 0; continue;
          }

          /* 向上生长（须柱高 < MAX_HEIGHT） */
          if (y > 0) {
            var u = i - w;
            var ue = el[u];
            if (ue === 1 || ue === WATER) {
              /* 量柱高 */
              var hcount = 0, cy = y;
              while (cy >= 0 && el[cy * w + x] === PLANT) { hcount++; cy--; }
              if (hcount < Balance.PLANT.MAX_HEIGHT &&
                  RNG.hash01(x, y, tick * 43 + 13) < Balance.PLANT.GROW_P) {
                el[u] = PLANT; temp[u] = T; age[u] = 0; grid.latent[u] = 0;
                continue;
              }
            }
          }
          /* 向水蔓延：水平邻格 WATER 且其上方 EMPTY */
          if (x > 0) trySpread(grid, i, i - 1, x - 1, y);
          if (x < w - 1) trySpread(grid, i, i + 1, x + 1, y);
          continue;
        }
      }
    }
  }

  function trySpread(grid, i, wj, wx, wy) {
    var el = grid.element;
    if (el[wj] !== WATER) return;
    var up = (wy - 1) * grid.w + wx;
    if (wy - 1 < 0) return;
    if (el[up] !== 1) return;
    var tick = grid.tickId;
    if (RNG.hash01(wx, wy, tick * 47 + 17) < Balance.PLANT.SPREAD_WATER_P) {
      el[wj] = PLANT; grid.age[wj] = 0; grid.latent[wj] = 0;
    }
  }

  var api = { lifePass: lifePass };
  root.YS.Biology = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

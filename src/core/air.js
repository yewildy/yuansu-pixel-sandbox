/*
 * air.js — 空气运动通道（docs/PHYSICS-AIR.md §5/§6）
 *   airPass：温度驱动的浮力置换 + 风平流。air 的 `movable=false`，不经通用移动通道；
 *   本模块是空气"能动性"的唯一来源，与通用移动解耦（性能关键，见 ADR-0005）。
 *
 *   驱动力：Δ = T - AMBIENT
 *     · 未驱动（-COLD_DT ≤ Δ ≤ BUOY_DT）→ 不移动（空画布零成本，A5）
 *     · 热（Δ > BUOY_DT）→ 以 p_up 向上与上方 AIR 交换（grid.swap 连温度一起交换 → 带走热量）
 *     · 冷（Δ < -COLD_DT）→ 以 p_down 向下沉
 *     · 风：仅平流"携带热量"的空气格（|Δ| > WIND_MIN_DT）
 *   降载：隔帧（PASS_INTERVAL）+ 移动预算（MAX_MOVE_BUDGET）+ 驱动格超阈值时奇偶列分半。
 *   确定性：全部走 RNG.hash01（同种子同结果）。零 DOM、零热路径分配。
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
  }

  function airPass(grid, ctx) {
    var A = Balance.AIR;
    var tick = ctx.tick;
    var interval = A.PASS_INTERVAL;
    if (interval > 1 && (tick % interval) !== 0) return;   // 隔帧降载

    var windOn = !!(ctx.wind && ctx.wind.strength > 0);
    if (!pendingDrive && !windOn) { lastDriven = 0; lastMoved = 0; return; }  // 无驱动空气 → 零成本
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

    var leftToRight = (tick & 1) === 0;
    var moved = 0, driven = 0;
    var y, x, i, j, d, p, nx, ny, dx;

    for (y = h - 1; y >= 1; y--) {                          // y=0 为天空层，不参与运动
      var row = y * w;
      var x0 = leftToRight ? 0 : w - 1;
      var xend = leftToRight ? w : -1;
      var step = leftToRight ? 1 : -1;
      for (x = x0; x !== xend; x += step) {
        if (split && ((x & 1) !== splitParity)) continue;
        i = row + x;
        if (el[i] !== AIR) continue;
        if (stamp[i] === tick) continue;                   // 本 tick 已被移动过
        d = temp[i] - amb;

        if (d > buoyDt) {
          driven++;
          j = i - w;                                       // 正上方
          if (el[j] === AIR && stamp[j] !== tick) {
            p = (d - buoyDt) / scale; if (p > pmax) p = pmax;
            if (RNG.hash01(x, y, tick * 211 + 1) < p) { swapStamp(grid, i, j, tick); moved++; continue; }
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
        } else if (d < negColdDt) {
          driven++;
          if (y < h - 1) {                                 // 正下方下沉
            j = i + w;
            if (el[j] === AIR && stamp[j] !== tick) {
              p = (negColdDt - d) / scale; if (p > pmax) p = pmax;
              if (RNG.hash01(x, y, tick * 229 + 4) < p) { swapStamp(grid, i, j, tick); moved++; continue; }
            }
          }
        }

        /* 风平流：只搬运"携带热量"的空气格（纯室温空气不搬运 → 画面等价、成本可控） */
        if (windOn && (d > windMinDt || d < -windMinDt)) {
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

  var api = {
    airPass: airPass,
    noteDeviation: noteDeviation,
    drivenCount: function () { return lastDriven; },
    movedCount: function () { return lastMoved; }
  };
  root.YS.Air = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

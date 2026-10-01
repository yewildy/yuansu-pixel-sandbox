/*
 * movement.js — 物态移动（docs/PHYSICS.md §5）
 *   粉末 / 液体 / 气体移动；自下而上扫描，水平方向逐帧交替；
 *   每格每 tick 至多移动一次（moveStamp 递增 tickId）；移动一律为交换（§13.1 质量守恒）。
 *   气体：风平流（§5.3-1）→ 浮力上升 → 斜上 → 水平扩散；顶边逸出（§13.3）。
 *   零 DOM。
 */
(function (root) {
  'use strict';

  var Balance = root.YS.Balance;
  var Elements = root.YS.Elements;
  var RNG = root.YS.RNG;
  var ELS = Elements.ELEMENTS;
  var ID = Elements.ID;

  function enterableDown(selfDens, target) {
    if (target === 1) return true;
    var E = ELS[target];
    return E.movable && E.density < selfDens;
  }
  function enterableUp(selfDens, target) {
    if (target === 1) return true;
    var E = ELS[target];
    return E.movable && E.density > selfDens;
  }
  function enterableGas(selfDens, target) {
    if (target === 1) return true;
    var E = ELS[target];
    return E.movable && E.density > selfDens;
  }
  function enterableSide(selfDens, target) {
    if (target === 1) return true;
    var E = ELS[target];
    return E.movable && E.state !== 'gas' && E.density < selfDens;
  }

  function swapMove(grid, i, j, tick) {
    grid.swap(i, j);
    grid.moveStamp[i] = tick;
    grid.moveStamp[j] = tick;
  }

  function vent(grid, i, tick, ambient) {
    grid.element[i] = 1;
    grid.temp[i] = ambient;
    grid.latent[i] = 0;
    grid.age[i] = 0;
    grid.moveStamp[i] = tick;
  }

  /* 4 邻域是否存在「可燃固体（不可移动）」——火焰贴其上时锚定，以便点燃燃料（见 §7 / ADR-0006） */
  function adjFlammableSolid(grid, i) {
    var el = grid.element, w = grid.w, h = grid.h;
    var x = i % w, y = (i / w) | 0, t, E;
    if (x > 0) { t = el[i - 1]; E = ELS[t]; if (t > 1 && E.flammability > 0 && !E.movable) return true; }
    if (x < w - 1) { t = el[i + 1]; E = ELS[t]; if (t > 1 && E.flammability > 0 && !E.movable) return true; }
    if (y > 0) { t = el[i - w]; E = ELS[t]; if (t > 1 && E.flammability > 0 && !E.movable) return true; }
    if (y < h - 1) { t = el[i + w]; E = ELS[t]; if (t > 1 && E.flammability > 0 && !E.movable) return true; }
    return false;
  }

  function stepCell(grid, ctx, i, x, y) {
    var el = grid.element, tick = ctx.tick, w = grid.w, h = grid.h;
    var e = el[i];
    if (e === 1) return;
    if (grid.moveStamp[i] === tick) return;
    var E = ELS[e];
    if (!E.movable) return;
    var dens = E.density;
    var st = E.state, s, dx, nx, j;

    if (st === 'powder') {
      if (y < h - 1) {
        j = i + w;
        if (enterableDown(dens, el[j])) { swapMove(grid, i, j, tick); return; }
        var order = RNG.hash01(x, y, e * 97 + tick) < 0.5 ? -1 : 1;
        for (s = 0; s < 2; s++) {
          dx = s === 0 ? order : -order;
          nx = x + dx;
          if (nx >= 0 && nx < w) {
            j = i + dx + w;
            if (enterableDown(dens, el[j]) && RNG.hash01(x, y, e * 193 + tick + s) < E.repose) {
              swapMove(grid, i, j, tick); return;
            }
          }
        }
      }
      return;
    }

    if (st === 'liquid') {
      /* 1. 正下（含沉入更轻液体 → 自然分层） */
      if (y < h - 1) {
        j = i + w;
        if (enterableDown(dens, el[j])) { swapMove(grid, i, j, tick); return; }
      }
      /* 2. 浮力：上方为更重的可移动液体 → 上浮交换 */
      if (y > 0) {
        j = i - w;
        var eu = el[j];
        if (eu !== 1 && ELS[eu].state === 'liquid' && ELS[eu].movable && ELS[eu].density > dens) {
          swapMove(grid, i, j, tick); return;
        }
      }
      /* 3. 斜下 p = mobility */
      if (y < h - 1) {
        var order2 = RNG.hash01(x, y, e * 97 + tick) < 0.5 ? -1 : 1;
        for (s = 0; s < 2; s++) {
          dx = s === 0 ? order2 : -order2;
          nx = x + dx;
          if (nx >= 0 && nx < w) {
            j = i + dx + w;
            if (enterableDown(dens, el[j]) && RNG.hash01(x, y, e * 211 + tick + s) < E.mobility) {
              swapMove(grid, i, j, tick); return;
            }
          }
        }
      }
      /* 4. 水平铺展 p = mobility × 0.8 */
      var orderh = RNG.hash01(x, y, e * 131 + tick) < 0.5 ? -1 : 1;
      for (s = 0; s < 2; s++) {
        dx = s === 0 ? orderh : -orderh;
        nx = x + dx;
        if (nx >= 0 && nx < w) {
          j = i + dx;
          if (enterableSide(dens, el[j]) && RNG.hash01(x, y, e * 307 + tick + s) < E.mobility * 0.8) {
            swapMove(grid, i, j, tick); return;
          }
        }
      }
      return;
    }

    if (st === 'gas') {
      /* 0. 燃料火焰锚定（docs/COMBUSTION-MODEL.md §7 / ADR-0006）：
       *    来自固体/粉末/液体燃料的火焰（latent>0）留在原地、不上升、不受风，
       *    以便烧尽后开出 AIR 通道、成为下一层燃料的相邻火源（解决 N1 根因 R-3 时序死锁）。
       *    自由火焰（latent==0，瓦斯/爆炸/手绘）保持气态行为。 */
      /* TODO(N1): 燃料火焰应与燃料「锚定」、不上浮——否则来不及点燃邻格燃料 */
      /* 1. 风平流（§5.3-1 / §11.2） */
      var wind = ctx.wind;
      if (wind && wind.strength > 0) {
        var pw = wind.strength * E.windFactor;
        if (pw > 0 && RNG.hash01(x, y, e * 151 + tick) < pw) {
          var sx = wind.x > 0 ? 1 : (wind.x < 0 ? -1 : 0);
          var sy = wind.y > 0 ? 1 : (wind.y < 0 ? -1 : 0);
          if (sx !== 0 || sy !== 0) {
            nx = x + sx; var ny = y + sy;
            if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
              j = ny * w + nx;
              if (enterableGas(dens, el[j])) { swapMove(grid, i, j, tick); return; }
            } else if (ny < 0) {
              vent(grid, i, tick, ctx.ambient); return;
            }
          }
        }
      }
      /* 2. 浮力上升 p = mobility（+ 热对流加成 §11.3）；顶边逸出 */
      var W = root.YS.Wind;
      var boost = W ? W.convectionBoost(grid, i, y) : 0;
      var pup = E.mobility + boost; if (pup > 1) pup = 1;
      if (y > 0) {
        j = i - w;
        if (enterableGas(dens, el[j]) && RNG.hash01(x, y, e * 313 + tick) < pup) {
          swapMove(grid, i, j, tick); return;
        }
      } else {
        if (RNG.hash01(x, y, e * 313 + tick) < E.mobility) { vent(grid, i, tick, ctx.ambient); return; }
      }
      /* 3. 斜上 */
      if (y > 0) {
        var order3 = RNG.hash01(x, y, e * 97 + tick) < 0.5 ? -1 : 1;
        for (s = 0; s < 2; s++) {
          dx = s === 0 ? order3 : -order3;
          nx = x + dx;
          if (nx >= 0 && nx < w) {
            j = i + dx - w;
            if (enterableGas(dens, el[j]) && RNG.hash01(x, y, e * 401 + tick + s) < pup) {
              swapMove(grid, i, j, tick); return;
            }
          }
        }
      }
      /* 4. 水平随机扩散 p = mobility × 0.5 */
      var orderh2 = RNG.hash01(x, y, e * 131 + tick) < 0.5 ? -1 : 1;
      for (s = 0; s < 2; s++) {
        dx = s === 0 ? orderh2 : -orderh2;
        nx = x + dx;
        if (nx >= 0 && nx < w) {
          j = i + dx;
          if (enterableGas(dens, el[j]) && RNG.hash01(x, y, e * 409 + tick + s) < E.mobility * 0.5) {
            swapMove(grid, i, j, tick); return;
          }
        }
      }
    }
  }

  function movePass(grid, ctx) {
    var w = grid.w, h = grid.h;
    var leftToRight = (ctx.tick & 1) === 0;
    var y, x, row;
    for (y = h - 1; y >= 0; y--) {
      row = y * w;
      if (leftToRight) {
        for (x = 0; x < w; x++) stepCell(grid, ctx, row + x, x, y);
      } else {
        for (x = w - 1; x >= 0; x--) stepCell(grid, ctx, row + x, x, y);
      }
    }
  }

  var api = {
    movePass: movePass,
    enterableDown: enterableDown,
    enterableUp: enterableUp,
    enterableGas: enterableGas,
    enterableSide: enterableSide
  };
  root.YS.Movement = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

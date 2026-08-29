/*
 * wind.js — 风场 + 对流（docs/PHYSICS.md §11）
 *   · 全局风向量 w = (σcosθ, σsinθ)，σ ∈ [0,1]（§11.1）
 *   · 气体平流在 movement.js 的 gas 分支执行（§5.3-1 优先级）
 *   · 轻质粉末空中漂移在此执行（§11.2）
 *   · 热对流：热空气柱（T>200 的 EMPTY）给正上方气体额外上升推力（§11.3）
 *   零 DOM。
 */
(function (root) {
  'use strict';

  var Balance = root.YS.Balance;
  var Elements = root.YS.Elements;
  var RNG = root.YS.RNG;
  var ELS = Elements.ELEMENTS;

  /* 风状态对象 */
  function create() { return { x: 0, y: 0, strength: 0, angle: 0 }; }

  function setVector(w, dx, dy, strength) {
    var len = Math.sqrt(dx * dx + dy * dy);
    w.strength = Math.max(0, Math.min(Balance.WIND.MAX_STRENGTH, strength === undefined ? len : strength));
    if (len > 1e-6) {
      w.angle = Math.atan2(dy, dx);
      w.x = w.strength * (dx / len);
      w.y = w.strength * (dy / len);
    } else { w.x = 0; w.y = 0; }
    return w;
  }

  function setPolar(w, angle, strength) {
    w.angle = angle;
    w.strength = Math.max(0, Math.min(Balance.WIND.MAX_STRENGTH, strength));
    w.x = w.strength * Math.cos(angle);
    w.y = w.strength * Math.sin(angle);
    return w;
  }

  function reset(w) { w.x = 0; w.y = 0; w.strength = 0; w.angle = 0; return w; }

  /* 热对流上升加成（供 movement 的 gas 分支调用） */
  function convectionBoost(grid, i, y) {
    var h = grid.h;
    if (y >= h - 1) return 0;
    var below = i + grid.w;
    if (grid.element[below] === 1 && grid.temp[below] > Balance.WIND.CONVECT_T_THRESH) {
      return Balance.WIND.CONVECT_T_BOOST;
    }
    return 0;
  }

  /* 轻质粉末（windFactor>0）在空气（正下方 EMPTY）中随风漂移（§11.2） */
  function windPass(grid, ctx) {
    var wind = ctx.wind;
    if (!wind || wind.strength <= 0) return;
    var tick = ctx.tick, w = grid.w, h = grid.h, el = grid.element;
    var sx = wind.x > 0 ? 1 : (wind.x < 0 ? -1 : 0);
    var sy = wind.y > 0 ? 1 : (wind.y < 0 ? -1 : 0);
    if (sx === 0 && sy === 0) return;
    var x, y, i, e;

    for (y = h - 1; y >= 0; y--) {
      var row = y * w;
      for (x = 0; x < w; x++) {
        i = row + x;
        e = el[i];
        if (e === 1) continue;
        var E = ELS[e];
        if (E.state !== 'powder' || E.windFactor <= 0) continue;
        if (grid.moveStamp[i] === tick) continue;
        /* 仅在「空中」——正下方为 EMPTY 时受风 */
        if (y >= h - 1) continue;
        if (el[i + w] !== 1) continue;
        var p = wind.strength * E.windFactor;
        if (RNG.hash01(x, y, e * 401 + tick) >= p) continue;
        var nx = x + sx, ny = y + sy;
        if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
        var j = ny * w + nx;
        var t = el[j];
        if (t === 1 || (ELS[t].movable && ELS[t].density < E.density && ELS[t].state !== 'gas')) {
          grid.swap(i, j);
          grid.moveStamp[i] = tick; grid.moveStamp[j] = tick;
        }
      }
    }
  }

  var api = {
    create: create, setVector: setVector, setPolar: setPolar, reset: reset,
    convectionBoost: convectionBoost, windPass: windPass
  };
  root.YS.Wind = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

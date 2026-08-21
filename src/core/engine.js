/*
 * engine.js — tick 编排 / 守恒计数 / 存档序列化（docs/PHYSICS.md §1.2 更新顺序、§13）
 *   纯逻辑，无 DOM，可在 Node 下 require 运行。
 *
 *   更新顺序（对齐 §1.2，含两处实现级等价调整，见 docs/adr/0003）：
 *     1 movePass      §5
 *     2 reactionPass  §8（内含 §9.5 爆炸）
 *     3 lifePass      §10
 *     4 thermalPass   §6.1（结果写入 nextTemp）
 *     5 phasePass     §7（读 nextTemp）
 *     6 relaxPass     §6.3
 *     7 commitTemp    温度钳制 + 回写（替代「清 flags / swap」）
 *     8 agePass       §4.3（寿命 / decayTo）
 *     9 windPass      §11（轻质粉末漂移；气体平流在 movePass 内按 §5.3-1 执行）
 */
(function (root) {
  'use strict';

  var Balance = root.YS.Balance;
  var Elements = root.YS.Elements;
  var RNG = root.YS.RNG;
  var Grid = root.YS.Grid;
  var Thermal = root.YS.Thermal;
  var Transitions = root.YS.Transitions;
  var Reactions = root.YS.Reactions;
  var Movement = root.YS.Movement;
  var Biology = root.YS.Biology;
  var Wind = root.YS.Wind;
  var ID = Elements.ID;
  var P = Balance.PHYS;

  function create(opts) {
    opts = opts || {};
    var w = opts.w || P.GRID_W;
    var h = opts.h || P.GRID_H;
    var seed = opts.seed !== undefined ? opts.seed : P.SEED;
    RNG.setSeed(seed);

    var grid = Grid.create(w, h);
    grid.clear(P.AMBIENT_T);

    var engine = {
      grid: grid,
      wind: Wind.create(),
      seed: seed,
      ambient: P.AMBIENT_T,
      tick: 0,
      running: true,
      cloneCreated: 0
    };

    /* 单步推进一个 tick */
    engine.step = function () {
      var g = grid;
      this.tick++;
      g.tickId = this.tick;
      var ctx = { tick: this.tick, wind: this.wind, ambient: this.ambient, cloneCreated: this.cloneCreated };

      Movement.movePass(g, ctx);
      Reactions.reactionPass(g, ctx);
      Biology.lifePass(g, ctx);
      Thermal.diffuse(g);
      Transitions.process(g, this.tick);
      Thermal.relax(g, this.ambient);
      g.commitTemp(P.MIN_TEMP, P.MAX_TEMP);
      agePass(g, this.tick);
      Wind.windPass(g, ctx);

      this.cloneCreated = ctx.cloneCreated;
    };

    engine.countCells = function () { return grid.countNonEmpty(); };

    engine.stats = function () {
      return {
        tick: this.tick,
        cells: grid.countNonEmpty(),
        wind: { x: this.wind.x, y: this.wind.y, strength: this.wind.strength, angle: this.wind.angle },
        seed: this.seed,
        cloneCreated: this.cloneCreated
      };
    };

    /* 存档序列化（DESIGN §8.7）：元素 + 温度 + 风 + 种子 */
    engine.toObject = function () {
      var g = grid;
      return {
        version: 1, w: g.w, h: g.h,
        element: Array.prototype.slice.call(g.element),
        temp: Array.prototype.slice.call(g.temp),
        age: Array.prototype.slice.call(g.age),
        wind: { x: this.wind.x, y: this.wind.y, strength: this.wind.strength, angle: this.wind.angle },
        seed: this.seed,
        tick: this.tick
      };
    };

    engine.fromObject = function (o) {
      if (!o || o.w !== grid.w || o.h !== grid.h) throw new Error('incompatible save size');
      grid.element.set(o.element);
      grid.temp.set(o.temp);
      if (o.age) grid.age.set(o.age);
      grid.latent.fill(0);
      this.wind.x = o.wind.x; this.wind.y = o.wind.y;
      this.wind.strength = o.wind.strength; this.wind.angle = o.wind.angle || 0;
      this.seed = o.seed !== undefined ? o.seed : this.seed;
      RNG.setSeed(this.seed);
      this.tick = o.tick || 0;
      return this;
    };

    /* 哈希（用于确定性回归测试） */
    engine.hash = function () {
      var g = grid, hsh = 2166136261 >>> 0;
      var e = g.element, t = g.temp;
      for (var i = 0; i < g.n; i++) {
        hsh ^= e[i]; hsh = Math.imul(hsh, 16777619) >>> 0;
        hsh ^= (t[i] & 0xffff); hsh = Math.imul(hsh, 16777619) >>> 0;
      }
      return hsh >>> 0;
    };

    engine.clear = function () {
      grid.clear(this.ambient);
      Wind.reset(this.wind);
      this.tick = 0;
      this.cloneCreated = 0;
    };

    return engine;
  }

  /* agePass：寿命 / decayTo（§4.3） */
  function agePass(grid, tick) {
    var n = grid.n, el = grid.element, age = grid.age, w = grid.w;
    var Em = Elements.ELEMENTS;
    for (var i = 0; i < n; i++) {
      var e = el[i];
      if (e === 1) continue;
      var life = Em[e].lifetime;
      if (life < 0) continue;
      if (age[i] < 65535) age[i]++;

      if (e === ID.FIRE) {
        var x = i % w, y = (i / w) | 0;
        var Lj = Balance.FIRE.LIFE_BASE +
          Math.round((RNG.hash01(x, y, 7777) - 0.5) * 2 * Balance.FIRE.LIFE_JITTER);
        if (Lj < 1) Lj = 1;
        if (age[i] >= Lj) {
          el[i] = RNG.hash01(x, y, tick * 53 + 19) < Balance.FIRE.SMOKE_P ? ID.SMOKE : 1;
          age[i] = 0; grid.latent[i] = 0;
        }
      } else if (age[i] >= life) {
        var d = Em[e].decayTo;
        el[i] = d ? d : 1;
        age[i] = 0; grid.latent[i] = 0;
      }
    }
  }

  var api = { create: create };
  root.YS.Engine = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

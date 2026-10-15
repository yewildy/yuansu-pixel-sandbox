/*
 * engine.js — tick 编排 / 守恒计数 / 存档序列化（docs/PHYSICS.md §1.2 更新顺序、§13）
 *   纯逻辑，无 DOM，可在 Node 下 require 运行。
 *
 *   更新顺序（对齐 §1.2，含三处实现级等价调整，见 docs/adr/0003 与 ADR-0005）：
 *     1 movePass      §5
 *     2 airPass       §5.4/§6（AIR 专用对流/浮力/风；隔帧执行；见 docs/PHYSICS-AIR.md）
 *     3 reactionPass  §8（内含 §9.5 爆炸 + §9.6 耗氧）
 *     4 lifePass      §10（严格生态，见 docs/PLANT-MODEL.md）
 *     5 thermalPass   §6.1（diffuse 结果写入 nextTemp；含空气-空气双轨配对；
 *                      v1.4.0 起追加 contactFlux 接触传热，见 thermal.js）
 *     6 phasePass     §7（读 nextTemp）
 *     7 relaxPass     §6.3（+ 顶部天空热沉）
 *     8 commitTemp    温度钳制 + 回写（替代「清 flags / swap」）
 *     9 agePass       §4.3（寿命 / decayTo / 燃料残灰）
 *    10 windPass      §11（轻质粉末漂移；气体平流在 movePass 内按 §5.3-1 执行）
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
  var Air = root.YS.Air;
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
      cloneCreated: 0,
      springCreated: 0
    };

    /* 单步推进一个 tick */
    engine.step = function () {
      var g = grid;
      this.tick++;
      g.tickId = this.tick;
      var ctx = { tick: this.tick, wind: this.wind, ambient: this.ambient, cloneCreated: this.cloneCreated, springCreated: this.springCreated };

      Movement.movePass(g, ctx);
      Air.airPass(g, ctx);
      Reactions.reactionPass(g, ctx);
      Biology.lifePass(g, ctx);
      Thermal.diffuse(g);
      Thermal.contactFlux(g);          // v1.4.0 接触传热（火焰接触 + 热气体对流；diffuse 后、relax 前）
      Transitions.process(g, this.tick);
      Thermal.relax(g, this.ambient);
      g.commitTemp(P.MIN_TEMP, P.MAX_TEMP);
      agePass(g, this.tick);
      Wind.windPass(g, ctx);

      this.cloneCreated = ctx.cloneCreated;
      this.springCreated = ctx.springCreated;
    };

    engine.countCells = function () { return grid.countNonEmpty(); };

    engine.stats = function () {
      return {
        tick: this.tick,
        cells: grid.countNonEmpty(),
        wind: { x: this.wind.x, y: this.wind.y, strength: this.wind.strength, angle: this.wind.angle },
        seed: this.seed,
        cloneCreated: this.cloneCreated,
        springCreated: this.springCreated
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
      this.springCreated = 0;
    };

    return engine;
  }

  /* agePass：寿命 / decayTo（§4.3） */
  function agePass(grid, tick) {
    var n = grid.n, el = grid.element, age = grid.age, w = grid.w;
    var Em = Elements.ELEMENTS;
    var FIRE = Balance.FIRE;
    for (var i = 0; i < n; i++) {
      var e = el[i];
      if (e === 1) continue;
      var life = Em[e].lifetime;
      if (life < 0) continue;
      if (age[i] < 65535) age[i]++;

      if (e === ID.FIRE) {
        var x = i % w, y = (i / w) | 0;
        var src = grid.latent[i];               // 原始燃料 id（0 = 自由火焰）
        var thr;
        if (src > 0) {
          /* 锚定火焰：寿命 = FUEL[src].burnTicks（与燃料种类相关，docs/COMBUSTION-MODEL.md §6.1） */
          var fu = Reactions.fuelOf(src);
          thr = fu ? fu.burnTicks : FIRE.LIFE_BASE;
          /* §9.6 维持：不通气 → age 额外快进（smother，寿命缩至 1/(1+SMOTHER_EXTRA)） */
          if (!Reactions.hasOxygen(grid, i)) age[i] += FIRE.SMOTHER_EXTRA;
        } else {
          /* 自由火焰（瓦斯/爆炸/手绘）：寿命 = LIFE_BASE ± jitter */
          thr = FIRE.LIFE_BASE +
            Math.round((RNG.hash01(x, y, 7777) - 0.5) * 2 * FIRE.LIFE_JITTER);
        }
        if (thr < 1) thr = 1;
        if (age[i] >= thr) {
          /* 缺氧窒息而亡（不通气）→ 只留尾气/碳渣，**绝不再造 AIR**。
           * 否则密闭盒里每个熄灭的火焰都重造氧，AIR 计数归零后又被「复活」，
           * 破坏 H-SEAL 自熄保证（见 ADR-0006）。 */
          var vented = Reactions.hasOxygen(grid, i);
          if (src > 0) {
            /* §5.1 残余：通气（正常燃烧）→ 按 CHANNEL_P 开 AIR 通道（让火焰前沿深入）；否则 ASH。 */
            var chP = 0;
            var fu2 = Reactions.fuelOf(src);
            if (fu2) chP = fu2.channelP;
            el[i] = (vented && RNG.hash01(x, y, tick * 53 + 19) < chP) ? 1 : ID.ASH;
          } else if (!vented) {
            /* 自由火焰（瓦斯/爆炸/手绘）缺氧而亡 → 只留 SMOKE */
            el[i] = ID.SMOKE;
          } else {
            /* 自由火焰正常消亡 → 按 SMOKE_P 留烟，否则散为 AIR */
            el[i] = RNG.hash01(x, y, tick * 59 + 23) < FIRE.SMOKE_P ? ID.SMOKE : 1;
          }
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

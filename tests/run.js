/*
 * tests/run.js — Node 单元测试（零依赖，覆盖 docs/PHYSICS.md §13 守恒与不变量）
 *   运行： node tests/run.js   （或 npm test）
 */
'use strict';

/* ---------- 加载 core（classic wrapper 会在 Node 下填充 globalThis.YS） ---------- */
var path = require('path');
var CORE = ['balance', 'rng', 'elements', 'grid', 'thermal', 'transitions',
  'reactions', 'movement', 'air', 'biology', 'wind', 'pressure', 'engine'];
CORE.forEach(function (m) { require(path.join(__dirname, '..', 'src', 'core', m + '.js')); });
require(path.join(__dirname, '..', 'src', 'render', 'palette.js'));
require(path.join(__dirname, '..', 'src', 'ui', 'i18n.js'));
require(path.join(__dirname, '..', 'src', 'ui', 'locales', 'zh-CN.js'));
require(path.join(__dirname, '..', 'src', 'ui', 'locales', 'en.js'));
require(path.join(__dirname, '..', 'src', 'ui', 'locales', 'ja.js'));

var YS = globalThis.YS;
var E = YS.Elements.ID;
var El = YS.Elements;
var Grid = YS.Grid;
var Thermal = YS.Thermal;
var Reactions = YS.Reactions;
var Biology = YS.Biology;
var Engine = YS.Engine;
var P = YS.Balance.PHYS;
var I18N = YS.I18N;

/* ---------- 微型测试框架 ---------- */
var passed = 0, failed = 0, lines = [];
function test(name, fn) {
  try { fn(); passed++; lines.push('  \u2713 ' + name); }
  catch (e) { failed++; lines.push('  \u2717 ' + name + '\n      → ' + (e && e.message)); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function assertNear(a, b, tol, msg) {
  if (!(Math.abs(a - b) <= tol)) throw new Error((msg || 'not near') + ' (a=' + a + ', b=' + b + ', tol=' + tol + ')');
}
function count(g, id) { var c = 0; for (var i = 0; i < g.n; i++) if (g.element[i] === id) c++; return c; }
function totalCells(g) { var c = 0; for (var i = 0; i < g.n; i++) if (g.element[i] !== 1) c++; return c; }
function wallRing(g, cx, cy, r) {
  for (var dx = -r; dx <= r; dx++) for (var dy = -r; dy <= r; dy++)
    if (Math.abs(dx) === r || Math.abs(dy) === r) g.setEl(cx + dx, cy + dy, E.WALL);
}

/* ============================================================
   1. 导热守恒
   ============================================================ */
test('1a. 导热守恒 Σ c·T（比热加权模式，关弛豫）', function () {
  var g = Grid.create(48, 32), n = g.n;
  g.temp = new Float64Array(n); g.nextTemp = new Float64Array(n);
  var c = El.specificHeat, i;
  for (i = 0; i < n; i++) { g.element[i] = 1 + (i % 31); g.temp[i] = (i % 61) * 7 - 100; }
  var s0 = 0; for (i = 0; i < n; i++) s0 += c[g.element[i]] * g.temp[i];
  Thermal.diffuse(g, { energyWeighted: true });
  var s1 = 0; for (i = 0; i < n; i++) s1 += c[g.element[i]] * g.nextTemp[i];
  assertNear(s1, s0, Math.abs(s0) * 1e-6, 'Σ c·T 相对误差应 < 1e-6');
});

/* v1.2.0：生产模式的守恒量由 ΣT 改为 **Σ C·T**（C = 比热 × 密度，体积热容）。
 * 旧式"对称温度交换"等价于假设所有元素热容相等，是"空气热不起来"的根因，已废弃。
 * 详见 docs/PHYSICS-AIR.md §14。 */
test('1b. 导热守恒 Σ C·T（生产模式 · 体积热容加权，关弛豫）', function () {
  var g = Grid.create(48, 32), n = g.n;
  g.temp = new Float64Array(n); g.nextTemp = new Float64Array(n);
  var C = El.volHeat, i;
  for (i = 0; i < n; i++) { g.element[i] = 1 + (i % 31); g.temp[i] = (i % 61) * 7 - 100; }
  var s0 = 0; for (i = 0; i < n; i++) s0 += C[g.element[i]] * g.temp[i];
  Thermal.diffuse(g, {});
  var s1 = 0; for (i = 0; i < n; i++) s1 += C[g.element[i]] * g.nextTemp[i];
  assertNear(s1, s0, Math.abs(s0) * 1e-6, 'Σ C·T 相对误差应 < 1e-6');
});

test('1b-2. 导热不得越过平衡点（显式格式稳定性 · CONDUCT_R_MAX=0.2）', function () {
  var g = Grid.create(32, 32), n = g.n;
  g.temp = new Float64Array(n); g.nextTemp = new Float64Array(n);
  var i;
  // 最坏配对：空气(热容最小) 与 金属(导热最高) 交错棋盘
  for (i = 0; i < n; i++) {
    var x = i % 32, y = (i / 32) | 0;
    g.element[i] = ((x + y) & 1) ? E.AIR : E.METAL;
    g.temp[i] = ((x + y) & 1) ? 20 : 1500;
  }
  Thermal.diffuse(g, {});
  for (i = 0; i < n; i++) {
    assert(g.nextTemp[i] >= 19.9 && g.nextTemp[i] <= 1500.1,
      '导热后温度不得越过 [20,1500] 区间，实得 ' + g.nextTemp[i].toFixed(1));
  }
});

/* ============================================================
   2. 总格数守恒（A14）—— 守恒语义变更：质量=非 AIR 格数，总格数恒为 W×H
   ============================================================ */
test('2. 纯物理演化 3000 tick 总格数恒为 W×H（含耗氧：物质可 +1）', function () {
  var eng = Engine.create({ w: 120, h: 80, seed: 1337 });
  var g = eng.grid;
  // 沙堆
  for (var x = 10; x < 50; x++) for (var y = 70; y < 76; y++) g.setEl(x, y, E.SAND);
  // 水洼
  for (var x2 = 55; x2 < 95; x2++) for (var y2 = 66; y2 < 76; y2++) g.setEl(x2, y2, E.WATER);
  // 木块 + 火
  for (var x3 = 20; x3 < 34; x3++) for (var y3 = 60; y3 < 66; y3++) g.setEl(x3, y3, E.WOOD);
  g.setEl(26, 59, E.FIRE); g.temp[g.idx(26, 59)] = 600;
  // 岩浆 + 冰
  for (var x4 = 70; x4 < 82; x4++) for (var y4 = 72; y4 < 78; y4++) { g.setEl(x4, y4, E.LAVA); g.temp[g.idx(x4, y4)] = 1200; }
  for (var x5 = 82; x5 < 90; x5++) for (var y5 = 72; y5 < 78; y5++) g.setEl(x5, y5, E.ICE);

  var n = g.n, cells0 = totalCells(g);
  var okTotal = true, okBound = true, at = -1;
  for (var t = 0; t < 3000; t++) {
    eng.step();
    // 不变量：每格始终有且仅有一个元素（element ∈ [1,31]，绝不为 0）→ 总格数恒 = n
    for (var i = 0; i < g.n; i++) { var ev = g.element[i]; if (ev < 1 || ev > 31) { okTotal = false; at = t; break; } }
    if (!okTotal) break;
    // 物质不得无界增长（耗氧每次至多 +1，且烟会衰回空气）
    if (totalCells(g) > cells0 + 3000) { okBound = false; at = t; break; }
  }
  assert(okTotal, '总格数/元素合法性被破坏于 tick ' + at);
  assert(okBound, '物质格数无界增长于 tick ' + at);
});

/* ============================================================
   3. 相变 1↔1 + 反应计数
   ============================================================ */
test('3a. 水 → 蒸汽 保持 1 格（沸腾）', function () {
  /* v1.4.0（A5）：旧实现盯固定坐标 (12,12) —— 单格水会掉走、蒸汽会升腾，
   * 坐标上永远等不到目标元素（坏测试）。改为**追踪元素本身**（全场扫描 STEAM）。 */
  var eng = Engine.create({ w: 24, h: 24, seed: 1337 }), g = eng.grid;
  g.setEl(12, 12, E.WATER); g.temp[g.idx(12, 12)] = 200;
  var n0 = totalCells(g), became = -1;
  for (var t = 0; t < 300; t++) { eng.step(); if (count(g, E.STEAM) > 0) { became = t; break; } }
  assert(became >= 0, '水应在 300 tick 内变为蒸汽（全场出现 STEAM）');
  assert(totalCells(g) === n0, '相变应保持格数不变 (' + n0 + ')');
});

test('3b. 冰 → 水 保持 1 格（融化）', function () {
  /* 固定坐标安全：ICE 是静态固体（movable=0）不会移动，且移动 pass 排在相变 pass 之前，
   * 融化的 WATER 当 tick 就出现在原格 —— 与 3a（单格水会掉走）有本质区别。 */
  var eng = Engine.create({ w: 24, h: 24, seed: 1337 }), g = eng.grid;
  g.setEl(12, 12, E.ICE); g.temp[g.idx(12, 12)] = 10;
  var n0 = totalCells(g), became = -1;
  for (var t = 0; t < 300; t++) { eng.step(); if (g.element[g.idx(12, 12)] === E.WATER) { became = t; break; } }
  assert(became >= 0, '冰应在 300 tick 内融为水');
  assert(totalCells(g) === n0, '相变应保持格数不变');
});

test('3c. 蒸汽 → 水 保持 1 格（冷凝）', function () {
  /* 固定坐标安全：wallRing 把蒸汽困在 3×3 石室里无处可逃，冷凝发生在原格。 */
  var eng = Engine.create({ w: 24, h: 24, seed: 1337 }), g = eng.grid;
  wallRing(g, 12, 12, 1);                       // 困住蒸汽，避免其升腾逸出
  g.setEl(12, 12, E.STEAM); g.temp[g.idx(12, 12)] = 20;
  var n0 = totalCells(g), became = -1;
  for (var t = 0; t < 600; t++) { eng.step(); if (g.element[g.idx(12, 12)] === E.WATER) { became = t; break; } }
  assert(became >= 0, '蒸汽应在 600 tick 内冷凝为水');
  assert(totalCells(g) === n0, '相变应保持格数不变');
});

test('3d. 反应 R1：火邻接水 → 火变烟，水 +55°C', function () {
  var eng = Engine.create({ w: 24, h: 24, seed: 1337 }), g = eng.grid;
  // 全封闭 2 格口袋：fire(12,12) 与 water(12,13)
  var walls = [[11, 11], [12, 11], [13, 11], [11, 12], [13, 12],
    [11, 13], [13, 13], [11, 14], [12, 14], [13, 14]];
  walls.forEach(function (w) { g.setEl(w[0], w[1], E.WALL); });
  g.setEl(12, 12, E.FIRE); g.temp[g.idx(12, 12)] = 300;
  g.setEl(12, 13, E.WATER); g.temp[g.idx(12, 13)] = 20;
  for (var t = 0; t < 5; t++) eng.step();
  assert(count(g, E.FIRE) === 0, '火应被浇灭');
  assert(count(g, E.SMOKE) >= 1, '应生成烟');
  var wt = Math.max(g.temp[g.idx(12, 12)], g.temp[g.idx(12, 13)]);
  assert(wt >= 60, '水应被加热（+55°C 左右），实得 ' + wt);
});

test('3e. 反应 R12：岩浆遇水 → 生成 1 石 + 1 汽', function () {
  var eng = Engine.create({ w: 24, h: 24, seed: 1337 }), g = eng.grid;
  wallRing(g, 12, 12, 2);
  g.setEl(12, 12, E.LAVA); g.temp[g.idx(12, 12)] = 1200;
  g.setEl(12, 13, E.WATER); g.temp[g.idx(12, 13)] = 20;
  for (var t = 0; t < 3; t++) eng.step();
  assert(count(g, E.LAVA) === 0, '岩浆应凝固');
  assert(count(g, E.STONE) >= 1, '应生成石头');
});

/* ============================================================
   4. 温度不变量
   ============================================================ */
test('4. 温度恒在 [MIN_TEMP, MAX_TEMP] 内', function () {
  var eng = Engine.create({ w: 100, h: 60, seed: 7 });
  var g = eng.grid;
  for (var x = 0; x < 60; x++) for (var y = 50; y < 58; y++) { g.setEl(x, y, E.LAVA); g.temp[g.idx(x, y)] = 2000; }
  for (var x2 = 60; x2 < 90; x2++) for (var y2 = 50; y2 < 58; y2++) { g.setEl(x2, y2, E.LN2); g.temp[g.idx(x2, y2)] = -196; }
  for (var x3 = 40; x3 < 50; x3++) for (var y3 = 40; y3 < 48; y3++) g.setEl(x3, y3, E.TNT);
  for (var t = 0; t < 800; t++) eng.step();
  var bad = 0;
  for (var i = 0; i < g.n; i++) { var v = g.temp[i]; if (v < P.MIN_TEMP || v > P.MAX_TEMP) bad++; }
  assert(bad === 0, '有 ' + bad + ' 格温度越界');
});

/* ============================================================
   5. 确定性
   ============================================================ */
test('5. 同种子两次运行结果哈希一致', function () {
  function build() {
    var eng = Engine.create({ w: 96, h: 64, seed: 424242 });
    var g = eng.grid;
    for (var x = 10; x < 50; x++) for (var y = 54; y < 60; y++) g.setEl(x, y, E.SAND);
    for (var x2 = 52; x2 < 86; x2++) for (var y2 = 50; y2 < 60; y2++) g.setEl(x2, y2, E.WATER);
    for (var x3 = 20; x3 < 30; x3++) g.setEl(x3, 40, E.WOOD);
    g.setEl(25, 39, E.FIRE); g.temp[g.idx(25, 39)] = 600;
    for (var x4 = 60; x4 < 70; x4++) for (var y4 = 55; y4 < 60; y4++) { g.setEl(x4, y4, E.LAVA); g.temp[g.idx(x4, y4)] = 1200; }
    for (var t = 0; t < 500; t++) eng.step();
    return eng.hash();
  }
  var h1 = build(), h2 = build();
  assert(h1 === h2, '哈希不一致：' + h1 + ' vs ' + h2);
});

/* ============================================================
   6. 无越界 / 无 NaN
   ============================================================ */
test('6. 演化后无 NaN、元素 ID 合法、温度可读', function () {
  var eng = Engine.create({ w: 100, h: 60, seed: 99 });
  var g = eng.grid;
  for (var x = 0; x < 100; x++) for (var y = 40; y < 46; y++) g.setEl(x, y, (y % 3 === 0) ? E.SALT : E.WATER);
  for (var x2 = 0; x2 < 40; x2++) g.setEl(x2, 30, E.GUNPOWDER);
  g.setEl(5, 29, E.FIRE); g.temp[g.idx(5, 29)] = 600;
  for (var t = 0; t < 600; t++) eng.step();
  var bad = 0;
  for (var i = 0; i < g.n; i++) {
    var e = g.element[i], v = g.temp[i];
    if (e < 1 || e > 31) bad++;
    if (typeof v !== 'number' || isNaN(v)) bad++;
  }
  assert(bad === 0, '发现 ' + bad + ' 处非法值');
});

/* ============================================================
   7. 回归测试（针对已修的设计缺陷）
   ============================================================ */
test('7a. 岩浆在空气中 600 tick 后仍为液体（不被空气秒凝）', function () {
  var eng = Engine.create({ w: 320, h: 180, seed: 1337 }), g = eng.grid;
  for (var x = 140; x < 180; x++) for (var y = 140; y < 170; y++) { g.setEl(x, y, E.LAVA); g.temp[g.idx(x, y)] = 1200; }
  var early = count(g, E.LAVA);
  for (var t = 0; t < 600; t++) {
    eng.step();
    if (t === 99) assert(count(g, E.LAVA) > early * 0.8, '100 tick 内岩浆不应大面积凝固（秒凝回归）');
  }
  assert(count(g, E.LAVA) > 0, '600 tick 后应仍有液体岩浆，实得 ' + count(g, E.LAVA));
});

test('7b. 液氮 60 tick 内基本不汽化、600 tick 内大部分已汽化', function () {
  var eng = Engine.create({ w: 320, h: 180, seed: 1337 }), g = eng.grid;
  var n0 = 0;
  for (var x = 150; x < 170; x++) for (var y = 90; y < 94; y++) { g.setEl(x, y, E.LN2); g.temp[g.idx(x, y)] = -196; n0++; }
  for (var t = 0; t < 60; t++) eng.step();
  var a60 = count(g, E.LN2);
  assert(a60 >= n0 * 0.5, '60 tick 内液氮不应大量汽化，剩余 ' + a60 + '/' + n0);
  for (var t2 = 0; t2 < 540; t2++) eng.step();
  var a600 = count(g, E.LN2);
  assert(a600 <= n0 * 0.5, '600 tick 内液氮应大部分汽化，剩余 ' + a600 + '/' + n0);
});

test('7c. 水在 20°C 空气中 600 tick 后不蒸发', function () {
  var eng = Engine.create({ w: 320, h: 180, seed: 1337 }), g = eng.grid;
  var n0 = 0;
  for (var x = 150; x < 170; x++) for (var y = 100; y < 110; y++) { g.setEl(x, y, E.WATER); n0++; }
  for (var t = 0; t < 600; t++) eng.step();
  assert(count(g, E.WATER) === n0, '20°C 水不应蒸发：' + count(g, E.WATER) + '/' + n0);
  assert(count(g, E.STEAM) === 0, '不应产生蒸汽');
});

/* ============================================================
   8. 数据完整性 / i18n
   ============================================================ */
test('8a. 元素表：31 种，ID/类别/配色齐全（AIR=id1，group=none 不进面板；v1.4.0 新增 EMBER=id31）', function () {
  assert(El.LIST.length === 31, '应恰有 31 种元素');
  var groups = { solid: 0, powder: 0, liquid: 0, gas: 0, special: 0, none: 0 };
  El.LIST.forEach(function (e) {
    assert(e.id >= 1 && e.id <= 31, 'ID 越界');
    assert(typeof e.base === 'string' && e.base[0] === '#', '缺 base 配色: ' + e.key);
    groups[e.group]++;
  });
  assert(groups.solid === 7 && groups.powder === 8 && groups.liquid === 6 && groups.gas === 4 && groups.special === 5 && groups.none === 1,
    '分组计数错误: ' + JSON.stringify(groups));
  assert(E.AIR === 1 && E.EMPTY === 1, 'AIR/EMPTY 别名应同为 id 1');
  assert(El.get(1).key === 'AIR' && El.get(1).group === 'none', 'id 1 应为 AIR 且 group=none');
  /* v1.4.0 EMBER「永燃火种」：静态固体、不老化、k=8 利于导热、自发光 strong */
  var em = El.get(31);
  assert(em && em.key === 'EMBER' && em.state === 'solid' && !em.movable && em.lifetime === -1,
    'EMBER 应为静态不老化固体');
  assert(em.conductivity === 8.00 && em.emissive === 'strong' && em.anim === true, 'EMBER 导热/自发光/动画字段不符');
  assert(El.volHeat[31] === 1500 * 700, 'EMBER 体积热容表应覆盖 id 31');
});

test('8b. balance 键名与 §14 一致（抽样）', function () {
  var B = YS.Balance;
  assert(B.PHYS.HEAT_COUPLING === 0.005, 'HEAT_COUPLING 应为 0.005（审查 F01）');
  assert(B.PHYS.ENV_RELAX_EMPTY === 0.0005, 'ENV_RELAX_EMPTY 应为 0.0005（AIR.RELAX）');
  assert(B.AIR.SELF_K === 0.5 && B.AIR.RELAX === 0.0005, 'AIR 双轨系数');
  assert(B.PLANT.CAPILLARY_HEAD === 80, 'PLANT.CAPILLARY_HEAD 应为 80（v1.2.0：植物不再枯死，软上限放宽）');
  assert(B.PLANT.MAX_HEIGHT === undefined, 'MAX_HEIGHT 应已删除');
  assert(B.SOIL.MOISTURE_MAX === 400, 'SOIL.MOISTURE_MAX 应为 400（v1.4.1：土壤蓄水库加大，配合液体表面流修复）');
  /* v1.4.3：液体找平流速 / 冲流级联 / 水面滑移 / 过冷凝结阈值 / 火焰接触传热 */
  assert(B.LIQUID.FLOW_K === 1.15 && B.LIQUID.CASCADE === true && B.LIQUID.SLIDE2 === true,
    'LIQUID 找平三参数（v1.4.3）');
  /* v1.5.1 ★蒸汽凝结改为**纯温度驱动**（用户实测："固定时间会回归 / 蒸汽必须有温度连贯性"）：
   * 删除 LATENT_TICKS_COND 固定计时器与 HOMO_FULL_T，改用饱和温度 + 过冷度概率。 */
  assert(B.STEAM.COND_T === 100 && B.STEAM.COND_P_BASE === 0.05 && B.STEAM.COND_P_SLOPE === 0.004,
    'STEAM 温度驱动凝结三参数（v1.5.1）');
  assert(B.STEAM.NUCLEUS_WINDOW === 20 && B.STEAM.PLATEAU === 3, 'STEAM 近饱和窗口/潜热平台（v1.5.1）');
  assert(B.STEAM.HOMO_FULL_T === undefined, 'HOMO_FULL_T 应已删除（被 NUCLEUS_WINDOW 取代）');
  assert(B.PHYS.LATENT_TICKS_COND === undefined, 'LATENT_TICKS_COND 应已删除（凝结不再有 tick 门槛）');
  /* v1.5.1 ★气体热惯性：气-气导热不再用体积热容公式（对气体恒被钳到 0.2 = 瞬间均温） */
  /* v1.6.0：气-气换热由 0.006 上调到 0.05（常量扫描：0.006 时热走不出蒸汽、上部空气几乎没被加热） */
  assert(B.PHYS.GAS_GAS_R === 0.05, 'PHYS.GAS_GAS_R（v1.6.0 气-气换热，扫描定值）');
  /* v1.6.0：蒸汽潜热预算（让蒸汽"加热空气的同时自己保持 100 °C"） */
  assert(B.STEAM.LATENT_MAX === 255 && B.STEAM.LATENT_SPEND === 1.0,
    'STEAM 潜热预算参数（v1.6.0）');
  /* v1.5.1：删除低于 100°C 的表面蒸发路径（蒸汽必须 ≥100°C 生成） */
  assert(B.WATER.EVAP_SURF_THRESH === undefined && B.WATER.EVAP_SURF_COEF === undefined,
    '低于 100°C 的表面蒸发路径应已删除（v1.5.1）');
  assert(B.FIRE.CONTACT_K === 0.10 && B.PHYS.GAS_CONTACT_K === 0.08,
    '火焰接触/热气体传热系数（v1.4.3 提速）');
  assert(B.PHYS.ENV_RELAX_GAS === 0.0006, 'ENV_RELAX_GAS 应为 0.0006（v1.2.0：蒸汽不再秒冷）');
  assert(B.PHYS.ENV_RELAX_LIQUID === 0.0005, 'ENV_RELAX_LIQUID 应为 0.0005');
  assert(B.PHYS.ENV_RELAX_SOLID === 0.001, 'ENV_RELAX_SOLID 应为 0.001');
  assert(B.WATER.EVAP_P_AT_100 === 0.02, 'EVAP_P_AT_100');
  assert(B.LN2.BOIL_T === -196, 'LN2.BOIL_T');
  /* v1.4.0 炸药增强（用户反馈"爆炸范围太小基本没作用"）：RADIUS 6→10、CHAIN_MAX 8→12 */
  assert(B.TNT.RADIUS === 10 && B.TNT.CHAIN_MAX === 12, 'TNT 参数（v1.4.0 增强）');
  assert(B.TNT.TEMP_BOOST === 600 && B.TNT.P_FIRE === 0.45, 'TNT 温升/火焰概率（v1.4.0 增强）');
  /* v1.4.0 新增常数（GAS_CONTACT_K 由任务书原稿 0.02 上调至 0.05：
   * 实测 0.02 下 _diag_water 场景 4 水温仅 74.3°C < 90 验收线，见 balance.js 注释） */
  assert(B.EMBER && B.EMBER.TEMP === 900 && B.EMBER.IGNITE_P === 0.5, 'EMBER 参数组缺失');
  assert(B.FIRE.CONTACT_K === 0.10, 'FIRE.CONTACT_K 应为 0.10（v1.4.3 提速：0.06→0.10）');
  assert(B.PHYS.GAS_CONTACT_K === 0.08 && B.PHYS.GAS_FLUX_MIN_T === 100,
    '热气体对流传热常数（v1.4.3：0.05→0.08）');
  assert(B.PLANT.GROW_P === 0.08 && B.PLANT.VINE_P === 0.03, 'PLANT 生长参数（v1.4.0：GROW_P 加速 + VINE_P 横生）');
  /* v1.6.1：水源泉/克隆体由「累计配额 MAX_CELLS」改为「持续产出 + 活体上限 LIVE_MAX」 */
  assert(B.CLONE.COPY_INTERVAL === 4 && B.SPRING.EMIT_INTERVAL === 6, '流量参数');
  assert(B.CLONE.LIVE_MAX === 5000 && B.SPRING.LIVE_MAX === 6000, '活体上限（v1.6.1）');
  assert(B.CLONE.MAX_CELLS === undefined && B.SPRING.MAX_CELLS === undefined,
    'MAX_CELLS 累计配额应已删除（v1.6.1 改为 LIVE_MAX）');
});

test('8c. 三语字典覆盖全部元素名', function () {
  var keys = El.LIST.map(function (e) { return e.key; });
  ['zh-CN', 'en', 'ja'].forEach(function (l) {
    var d = I18N.DICTS[l];
    assert(d, '缺语言包: ' + l);
    keys.forEach(function (k) { assert(d['el.' + k], l + ' 缺 el.' + k); });
    ['title', 'ui.play', 'ui.pause', 'ui.step', 'ui.clear', 'ui.wind',
      'cat.solid', 'cat.powder', 'cat.liquid', 'cat.gas', 'cat.special'].forEach(function (u) {
      assert(d[u], l + ' 缺 ' + u);
    });
  });
});

test('9a. 冰在空气中必须能升温并融化（回归 F17）', function () {
  var eng = Engine.create({ w: 40, h: 40, seed: 7 }), g = eng.grid;
  for (var x = 9; x < 31; x++) { g.setEl(x, 9, E.WALL); g.setEl(x, 30, E.WALL); }
  for (var y = 9; y <= 30; y++) { g.setEl(9, y, E.WALL); g.setEl(30, y, E.WALL); }
  for (var yy = 11; yy < 28; yy++) {
    for (var xx = 11; xx < 29; xx++) { g.setEl(xx, yy, E.ICE); g.temp[g.idx(xx, yy)] = -10; }
  }
  var melted = -1;
  for (var t = 0; t < 3000; t++) {
    eng.step();
    var w = 0;
    for (var a = 11; a < 28; a++) {
      for (var b = 11; b < 29; b++) { if (g.element[g.idx(b, a)] === E.WATER) w++; }
    }
    if (w > 0) { melted = t; break; }
  }
  assert(melted >= 0, '冰在 20°C 空气中永不融化 —— 温度又被取整了（见审查 F17）');
  assert(melted < 600, '冰融得太慢（' + melted + ' tick），导热可能被削过头');
});

test('9b. 温度场必须能承载"亚度级"增量（回归 F17）', function () {
  var eng = Engine.create({ w: 8, h: 8, seed: 1 }), g = eng.grid;
  assert(g.temp instanceof Float32Array, 'grid.temp 必须是浮点数组；Int16 会把每 tick <0.5°C 的增量永久丢弃');
  assert(g.nextTemp instanceof Float32Array, 'grid.nextTemp 必须是浮点数组');
  // 热石头在室温空气里：每 tick 只降约 0.36°C。
  // 若温度被取整回整数，这 0.36°C 会被天天抹掉 → 石头永远凉不下来。
  var i = g.idx(4, 4);
  g.setEl(4, 4, E.STONE);
  g.temp[i] = 100;
  g.nextTemp[i] = 100;
  for (var t = 0; t < 200; t++) eng.step();
  assert(g.temp[i] < 99, '热石头 200 tick 后温度几乎没变（' + g.temp[i] + '°C）—— 亚度增量被丢弃了');
});

/* ============================================================
   10. 空气物理验收（docs/PHYSICS-AIR.md §12：A1–A6）
   ============================================================ */
test('A1. 1000°C 石块旁空气必须升温（缺陷 #3 / B1）', function () {
  var eng = Engine.create({ w: 64, h: 64, seed: 1337 }), g = eng.grid;
  var sx = 32, sy = 32, si = g.idx(sx, sy);
  g.setEl(sx, sy, E.STONE); g.temp[si] = 1000; g.nextTemp[si] = 1000;
  var ai = g.idx(sx, sy - 1), peak = -999, at60 = -999;
  for (var t = 1; t <= 90; t++) {
    eng.step();
    var v = g.temp[ai];
    if (v > peak) peak = v;
    if (t === 60) at60 = v;
  }
  assert(peak >= 50, '石块上方空气峰值应 ≥50°C，实得 ' + peak.toFixed(1) + '（修复前恒为 20.0）');
  assert(at60 >= 40, 'tick=60 应 ≥40°C，实得 ' + at60.toFixed(1));
});

test('A2. 600°C 空气团 30 tick 后仍高温（缺陷 #4 / B2）', function () {
  var eng = Engine.create({ w: 64, h: 64, seed: 1337 }), g = eng.grid;
  var x0 = 30, y0 = 30;
  for (var dy = 0; dy < 5; dy++) for (var dx = 0; dx < 5; dx++) g.temp[g.idx(x0 + dx, y0 + dy)] = 600;
  for (var t = 0; t < 30; t++) eng.step();
  // 热团会上浮，故跟踪"空气中最热的 25 格"（热量本体），而非固定足迹
  var arr = [];
  for (var i = 0; i < g.n; i++) if (g.element[i] === 1) arr.push(g.temp[i]);
  arr.sort(function (a, b) { return b - a; });
  var m = 0; for (var k = 0; k < 25; k++) m += arr[k]; m /= 25;
  assert(m >= 450, '30 tick 后热团均值应 ≥450°C，实得 ' + m.toFixed(1) + '（修复前 ≈21）');
});

test('A3. 热空气必须整体上移（缺陷 #3 / B3）', function () {
  var eng = Engine.create({ w: 96, h: 96, seed: 1337 }), g = eng.grid;
  var x0 = 46, y0 = 60;
  for (var dy = 0; dy < 5; dy++) for (var dx = 0; dx < 5; dx++) g.temp[g.idx(x0 + dx, y0 + dy)] = 600;
  function minHotY() { var my = 1e9; for (var i = 0; i < g.n; i++) if (g.element[i] === 1 && g.temp[i] > 100) { var y = (i / g.w) | 0; if (y < my) my = y; } return my; }
  var ys = minHotY();
  for (var t = 0; t < 120; t++) eng.step();
  var ye = minHotY();
  assert(ys - ye >= 15, '>100°C 空气最上沿应上移 ≥15 格，实得 ' + (ys - ye) + '（修复前 = 0）');
});

test('A4. 冷空气必须下沉（用 -190°C 强冷团抵消空气加热稀释）', function () {
  var eng = Engine.create({ w: 96, h: 96, seed: 1337 }), g = eng.grid;
  var x0 = 46, y0 = 20;
  for (var dy = 0; dy < 5; dy++) for (var dx = 0; dx < 5; dx++) g.temp[g.idx(x0 + dx, y0 + dy)] = -190;
  function coldMeanY() {
    var arr = [];
    for (var i = 0; i < g.n; i++) if (g.element[i] === 1) arr.push([g.temp[i], (i / g.w) | 0]);
    arr.sort(function (a, b) { return a[0] - b[0]; });
    var s = 0; for (var k = 0; k < 25; k++) s += arr[k][1];
    return s / 25;
  }
  var ys = coldMeanY();
  for (var t = 0; t < 120; t++) eng.step();
  var ye = coldMeanY();
  assert(ye - ys >= 10, '25 格最冷空气竖向重心应下沉 ≥10 格，实得 ' + (ye - ys).toFixed(1));
});

test('A5. 均匀室温空气 → airPass 驱动格 = 0（零成本）', function () {
  var eng = Engine.create({ w: 64, h: 64, seed: 1337 });
  for (var t = 0; t < 10; t++) eng.step();
  assert(YS.Air.drivenCount() === 0, '驱动格应为 0，实得 ' + YS.Air.drivenCount());
});

test('A6. 全 20°C 空气 600 tick 后仍 = 20.0°C', function () {
  var eng = Engine.create({ w: 64, h: 64, seed: 1337 });
  for (var t = 0; t < 600; t++) eng.step();
  var s = 0; for (var i = 0; i < eng.grid.n; i++) s += eng.grid.temp[i];
  var avg = s / eng.grid.n;
  assert(Math.abs(avg - 20) < 0.01, '全局均值应 = 20.0，实得 ' + avg.toFixed(4));
});

test('A7. §9.6 耗氧：点燃燃料消耗邻接 AIR → SMOKE（物质 +1 的账本来源）', function () {
  var g = Grid.create(64, 16);
  var wood = [];
  for (var k = 0; k < 20; k++) {
    var x = 2 + k * 3, i = g.idx(x, 8);
    g.setEl(x, 8, E.WOOD); g.temp[i] = 600; wood.push(i);
  }
  var before = count(g, E.SMOKE);
  for (var k2 = 0; k2 < wood.length; k2++) Reactions.ignite(g, wood[k2], 1);
  var after = count(g, E.SMOKE);
  assert(after > before, '点燃应产出 SMOKE（消耗 AIR），实得 ' + (after - before));
});

/* ============================================================
   11. 严格生态植物验收（docs/PLANT-MODEL.md：G/B4/D2/H1）
   ============================================================ */
test('G3. 干土上的种子不发芽（需水或湿土）', function () {
  var eng = Engine.create({ w: 64, h: 64, seed: 1337 }), g = eng.grid;
  for (var x = 28; x < 37; x++) for (var y = 40; y < 44; y++) g.setEl(x, y, E.SOIL);
  g.setEl(32, 39, E.SEED);
  var became = false;
  for (var t = 0; t < 600; t++) {
    eng.step();
    if (g.element[g.idx(32, 39)] === E.PLANT) { became = true; break; }
  }
  assert(!became, '干土（无水源）上种子不应发芽');
});

test('G2. 湿土/水 + 20°C + 露头 → 400 tick 内发芽', function () {
  var eng = Engine.create({ w: 64, h: 64, seed: 1337 }), g = eng.grid;
  // STONE 平台 + WALL 蓄水槽（水不挤压种子），种子落在石面上
  for (var x = 24; x < 41; x++) g.setEl(x, 50, E.STONE);
  g.setEl(29, 49, E.WALL); g.setEl(29, 48, E.WALL);
  g.setEl(31, 49, E.WALL); g.setEl(31, 48, E.WALL);
  g.setEl(30, 49, E.WATER); g.setEl(30, 48, E.WATER);
  g.setEl(28, 49, E.SEED);
  var became = -1;
  for (var t = 0; t < 400; t++) {
    eng.step();
    var e0 = g.element[g.idx(28, 49)];
    if (e0 === E.WOOD || e0 === E.PLANT) { became = t; break; }   // v1.4.3：萌发为树干（WOOD）
  }
  assert(became >= 0, '湿土/水旁石面上的种子应在 400 tick 内发芽（长成树干），实得 ' + became);
});

test('B4. 浮空植物 1800 tick 内不生长、并整株枯死（缺陷 #1）', function () {
  var eng = Engine.create({ w: 64, h: 64, seed: 1337 }), g = eng.grid;
  var px = 32, py = 30;
  g.setEl(px, py, E.PLANT);
  var grew = false, maxH = 1;
  for (var t = 0; t < 1800; t++) {
    eng.step();
    var c = 0; for (var y = 0; y < g.h; y++) if (g.element[g.idx(px, y)] === E.PLANT) c++;
    if (c > maxH) maxH = c;
    if (c > 1) { grew = true; break; }
  }
  assert(!grew, '浮空植物不应向上生长（实测最大高度 ' + maxH + '，修复前爬到 7+ 并继续上升）');
  /* v1.2.0：植物不再枯死（用户诉求 + 对齐 Powder Game 的无枯萎设定）。
   * 断根改为"休眠"：植株必须原样保留，且不得产生任何 DUST。 */
  assert(count(g, E.PLANT) === 1, '浮空植物应进入休眠并原样保留（不枯死），实得 ' + count(g, E.PLANT));
  assert(count(g, E.DUST) === 0, '休眠不得产生灰尘（旧模型会整株变 DUST）');
});

test('D2/H1. 种田 3000 tick：DUST ≤ 50 且高度受供水封顶（缺陷 #2）', function () {
  var eng = Engine.create({ w: 128, h: 96, seed: 1337 }), g = eng.grid;
  for (var x = 40; x < 88; x++) for (var y = 90; y < 96; y++) g.setEl(x, y, E.SOIL);
  for (var x2 = 66; x2 < 71; x2++) for (var y2 = 86; y2 < 90; y2++) g.setEl(x2, y2, E.WATER);
  g.setEl(64, 89, E.SEED);
  var maxH = 0, col = 64;
  for (var t = 0; t < 3000; t++) {
    eng.step();
    var c = 0; for (var y = 0; y < g.h; y++) if (g.element[g.idx(col, y)] === E.PLANT) c++;
    if (c > maxH) maxH = c;
  }
  var dust = count(g, E.DUST);
  assert(maxH <= 34, '植物高度应受供水/毛细封顶（≤34），实得 ' + maxH + '（修复前 42）');
  assert(dust <= 50, 'DUST 应 ≤50 格，实得 ' + dust + '（修复前 391）');
});

/* ============================================================
   12. 水源泉 SPRING / 蒸汽消亡 / 液氮产物 / 炼玻璃 / 守恒不变量（v1.1.0 收尾五项）
   ============================================================ */
test('12a. 水源泉 SPRING：600 tick 内产出 WATER > 0（R19，质量创生例外）', function () {
  var eng = Engine.create({ w: 120, h: 80, seed: 1337 }), g = eng.grid;
  for (var x = 55; x < 65; x++) for (var y = 60; y < 70; y++) g.setEl(x, y, E.SPRING);
  var spr0 = count(g, E.SPRING), w0 = count(g, E.WATER);
  for (var t = 0; t < 600; t++) eng.step();
  assert(count(g, E.WATER) > w0, '600 tick 内应产出水，实得 ' + count(g, E.WATER));
  assert(count(g, E.SPRING) === spr0, 'SPRING 自身不移动、不消耗（' + count(g, E.SPRING) + '/' + spr0 + '）');
  assert(eng.springCreated > 0, 'springCreated 计数应 > 0，实得 ' + eng.springCreated);
});

test('12b. 水源泉活体上限：世界满水时暂停、排空后自动恢复（非永久停喷，v1.6.1）', function () {
  /* v1.6.1 语义变更（docs/SPRING-MODEL.md）：旧模型是「全局累计配额 MAX_CELLS=1500，
   * 产满即永久停喷」（把"持续水源"退化成"一次性定量水源"，用户实测「只会给一会儿水」）；
   * 新模型改为「持续产出 + 活体上限 LIVE_MAX」——世界里 WATER 达上限时暂停，降回后自动恢复。
   * 本测试直接构造「世界已满水」的初态（比自然灌满快得多），验证：
   *   ① springCreated 单调不减（累计统计保留）；
   *   ② WATER 格数全程 ≤ LIVE_MAX；
   *   ③ 满水时水源泉暂停、排掉一部分水后**自动恢复**产出（这正是旧模型做不到的）。 */
  var LIVE = YS.Balance.SPRING.LIVE_MAX;
  assert(LIVE === 6000, 'SPRING.LIVE_MAX 应为 6000（实测标定，见 docs/SPRING-MODEL.md）');
  var eng = Engine.create({ w: 120, h: 80, seed: 1337 }), g = eng.grid;
  /* 预填 LIVE_MAX 格水（50 行 × 120 列 = 6000） */
  var filled = 0;
  for (var y = 30; y < 80; y++) for (var x = 0; x < 120; x++) { g.setEl(x, y, E.WATER); filled++; }
  assert(filled === LIVE && count(g, E.WATER) === LIVE, '预填水应为 LIVE_MAX 格');
  g.setEl(60, 2, E.SPRING);
  var mono = true, prev = 0, capped = true;
  for (var t = 1; t <= 70; t++) {
    eng.step();
    if (eng.springCreated < prev) mono = false;
    prev = eng.springCreated;
    if (count(g, E.WATER) > LIVE) capped = false;
  }
  assert(mono, 'springCreated 应单调不减');
  assert(capped, 'WATER 格数不应超过 LIVE_MAX');
  assert(eng.springCreated === 0, '满水时水源泉应暂停（springCreated 应为 0），实得 ' + eng.springCreated);
  /* 排掉 300 格水 → 应自动恢复产出（旧模型下会永久停喷） */
  var removed = 0;
  for (var y2 = 30; y2 < 80 && removed < 300; y2++) for (var x2 = 0; x2 < 120 && removed < 300; x2++) {
    var ii = g.idx(x2, y2);
    if (g.element[ii] === E.WATER) { g.element[ii] = 1; g.temp[ii] = 20; removed++; }
  }
  assert(removed === 300, '应移除 300 格水，实得 ' + removed);
  var before = eng.springCreated;
  for (var t2 = 0; t2 < 300; t2++) eng.step();
  assert(eng.springCreated > before, '排空后水源泉应自动恢复产出（非永久停喷），实得 +' +
    (eng.springCreated - before));
  assert(count(g, E.WATER) <= LIVE, '恢复产出后 WATER 仍不应超过 LIVE_MAX，实得 ' + count(g, E.WATER));
});

test('13. 高温蒸汽（300°C）700 tick 不得冷凝为水（§7.2 T≥100 恒不冷凝）', function () {
  var eng = Engine.create({ w: 24, h: 24, seed: 1337 }), g = eng.grid;
  var sx = 12, sy = 12, si = g.idx(sx, sy);
  wallRing(g, sx, sy, 1);                      // 困住蒸汽，避免逸出
  g.setEl(sx, sy, E.STEAM); g.temp[si] = 300; g.nextTemp[si] = 300;
  var sawWater = false;
  for (var t = 0; t < 700; t++) {              // 700 > 旧 STEAM.lifetime=600
    g.temp[si] = 300; g.nextTemp[si] = 300;    // 持续供热，模拟被热源维持的蒸汽
    eng.step();
    if (count(g, E.WATER) > 0) { sawWater = true; break; }
  }
  assert(!sawWater, '300°C 蒸汽不应出现 WATER（旧实现 lifetime=600 会无条件转水，违反 §7.2）');
  assert(g.element[si] === E.STEAM, '700 tick 后仍应为 STEAM，实得 ' + g.element[si]);
});

test('14. 液氮汽化产物为 AIR：不得凭空造水（§7.8）', function () {
  var eng = Engine.create({ w: 160, h: 100, seed: 1337 }), g = eng.grid;
  var w0 = count(g, E.WATER);
  for (var x = 60; x < 100; x++) for (var y = 80; y < 90; y++) { g.setEl(x, y, E.LN2); g.temp[g.idx(x, y)] = -196; }
  for (var t = 0; t < 3000; t++) eng.step();
  assert(count(g, E.WATER) <= w0, '液氮不应凭空造水：' + w0 + ' → ' + count(g, E.WATER));
  assert(count(g, E.STEAM) === 0, '液氮汽化不应产生 STEAM（旧实现 STEAM→冷凝成水），实得 ' + count(g, E.STEAM));
  assert(count(g, E.LN2) === 0, '3000 tick 内液氮应全部汽化');
});

test('15. 玩家场景（炼玻璃）：先灌大片岩浆、再在其中画入沙块 → 沙被吞没炼成玻璃（§7.7）', function () {
  var eng = Engine.create({ w: 120, h: 120, seed: 1337 }), g = eng.grid;
  // 玩家操作：倒入一大片 1200 °C 岩浆（50×50），在其中央画入一块沙（8×8）
  for (var x = 35; x < 85; x++) for (var y = 35; y < 85; y++) { g.setEl(x, y, E.LAVA); g.temp[g.idx(x, y)] = 1200; }
  for (var x2 = 56; x2 < 64; x2++) for (var y2 = 56; y2 < 64; y2++) g.setEl(x2, y2, E.SAND);
  for (var t = 0; t < 3000; t++) eng.step();
  assert(count(g, E.GLASS) > 0, '沙被岩浆吞没后应熔成玻璃，实得 GLASS=' + count(g, E.GLASS));
});

test('15b. 反例（防误伤）：沙单独存在（周围无岩浆）3000 tick 后不得出现玻璃', function () {
  var eng = Engine.create({ w: 64, h: 64, seed: 1337 }), g = eng.grid;
  for (var x = 2; x < 22; x++) for (var y = 52; y < 62; y++) g.setEl(x, y, E.SAND);
  for (var t = 0; t < 3000; t++) eng.step();
  assert(count(g, E.GLASS) === 0, '无岩浆时沙不应成玻璃，实得 GLASS=' + count(g, E.GLASS));
});

test('15c. 反例（防误伤）：岩浆倒在石头上 3000 tick，石头不得变玻璃', function () {
  var eng = Engine.create({ w: 64, h: 64, seed: 1337 }), g = eng.grid;
  for (var x = 22; x < 42; x++) for (var y = 50; y < 60; y++) g.setEl(x, y, E.STONE);
  for (var x2 = 22; x2 < 42; x2++) for (var y2 = 46; y2 < 50; y2++) { g.setEl(x2, y2, E.LAVA); g.temp[g.idx(x2, y2)] = 1200; }
  for (var t = 0; t < 3000; t++) eng.step();
  assert(count(g, E.GLASS) === 0, '石头不应变成玻璃，实得 GLASS=' + count(g, E.GLASS));
});

test('16. 守恒不变量：任意场景 3000 tick 后每格元素 id ∈ [1,30]（总格数恒 W×H）', function () {
  var eng = Engine.create({ w: 120, h: 80, seed: 1337 }), g = eng.grid;
  for (var x = 10; x < 40; x++) for (var y = 70; y < 76; y++) g.setEl(x, y, E.SAND);
  for (var x2 = 45; x2 < 70; x2++) for (var y2 = 66; y2 < 76; y2++) g.setEl(x2, y2, E.WATER);
  for (var x3 = 75; x3 < 90; x3++) for (var y3 = 74; y3 < 78; y3++) { g.setEl(x3, y3, E.LAVA); g.temp[g.idx(x3, y3)] = 1200; }
  for (var x4 = 40; x4 < 50; x4++) for (var y4 = 40; y4 < 46; y4++) g.setEl(x4, y4, E.SPRING);  // 质量创生源
  for (var x5 = 90; x5 < 100; x5++) for (var y5 = 40; y5 < 46; y5++) { g.setEl(x5, y5, E.LN2); g.temp[g.idx(x5, y5)] = -196; }
  var bad = 0, at = -1;
  for (var t = 0; t < 3000; t++) {
    eng.step();
    for (var i = 0; i < g.n; i++) { var e = g.element[i]; if (e < 1 || e > 31) { bad++; at = t; break; } }
    if (bad) break;
  }
  assert(bad === 0, '第 ' + at + ' tick 出现非法元素 id（应恒在 [1,31]）');
});

/* ============================================================
   13. 燃烧 / 火焰蔓延验收（docs/COMBUSTION-MODEL.md §10：N1-1 ~ N1-10）
       N1 缺陷「火焰不沿固体燃料蔓延」修复回归
   ============================================================ */
test('N1-0. balance：新增 FUEL 分组与 FIRE 全局燃烧参数（§6.1/§6.2）', function () {
  var B = YS.Balance;
  assert(B.FUEL && B.FUEL.WOOD && B.FUEL.COAL && B.FUEL.OIL && B.FUEL.PLANT, 'FUEL 分组缺失');
  assert(B.FUEL.WOOD.burnTicks === 180 && B.FUEL.COAL.burnTicks === 420 && B.FUEL.OIL.burnTicks === 90, 'FUEL.burnTicks 不符');
  /* v1.2.0：channelP 上调 —— 烧尽的主产物是空腔（AIR），灰是少量残余。
   * 旧值 0.5/0.2 让 ASH 堵死氧气通道，实心燃料块只能烧掉 27~37%（PHYSICS-AIR §A10）。 */
  /* v1.2.2：COAL 再由 0.75/0.04 上调到 0.85/0.09 —— 24×24 实心煤块 1200 tick 只烧掉 50%，
   * 三种子 338/324/300 残留；上调后 195~237 残留（烧掉约 60%），密封自熄红线仍成立。 */
  assert(B.FUEL.WOOD.channelP === 0.95 && B.FUEL.COAL.channelP === 0.85 && B.FUEL.OIL.channelP === 1.0, 'FUEL.channelP 不符');
  assert(B.FUEL.COAL.spreadP === 0.09, 'FUEL.COAL.spreadP 不符（v1.2.2 上调）');
  assert(B.TNT.IGNITE_T === 180, 'TNT.IGNITE_T 应为 180');
  assert(B.FIRE.OXY_RADIUS === 2 && B.FIRE.OXY_CONSUME_INTERVAL === 30 && B.FIRE.SMOTHER_EXTRA === 3, 'FIRE 全局燃烧参数不符');
  assert(B.FIRE.ANCHOR_FUEL_FIRE === true && B.FIRE.MAX_BURN_CELLS === 8000, 'FIRE 锚定/护栏不符');
  assert(typeof YS.Reactions.fuelOf === 'function' && YS.Reactions.fuelOf(E.WOOD).burnTicks === 180, 'Reactions.fuelOf 缺失');
});

function fireSpreadOpen(seed, ticks) {
  var eng = Engine.create({ w: 40, h: 40, seed: seed }), g = eng.grid;
  for (var x = 0; x < 40; x++) g.setEl(x, 39, E.WALL, P.AMBIENT_T);
  var bx0 = 8, bx1 = 20, by0 = 37, by1 = 38, w0 = 0;
  for (var y = by0; y <= by1; y++) for (var x2 = bx0; x2 < bx1; x2++) { g.setEl(x2, y, E.WOOD, P.AMBIENT_T); w0++; }
  g.setEl(bx0, by0, E.FIRE, 600); g.setEl(bx0, by1, E.FIRE, 600);
  for (var t = 0; t < ticks; t++) eng.step();
  var wl = 0; for (var y2 = by0; y2 <= by1; y2++) for (var x3 = bx0; x3 < bx1; x3++) if (g.element[g.idx(x3, y2)] === E.WOOD) wl++;
  return (w0 - wl) / w0;
}
function fireSpreadSealed(seed, ticks) {
  var eng = Engine.create({ w: 40, h: 40, seed: seed }), g = eng.grid;
  for (var y = 14; y <= 19; y++) for (var x = 14; x <= 19; x++) g.setEl(x, y, E.WALL, P.AMBIENT_T);
  for (var y2 = 15; y2 <= 18; y2++) for (var x2 = 15; x2 <= 18; x2++) g.setEl(x2, y2, E.WOOD, P.AMBIENT_T);
  g.setEl(15, 18, E.FIRE, 600); g.setEl(15, 17, 1, P.AMBIENT_T);
  var w0 = 14;
  for (var t = 0; t < ticks; t++) eng.step();
  var wl = 0; for (var y3 = 15; y3 <= 18; y3++) for (var x3 = 15; x3 <= 18; x3++) if (g.element[g.idx(x3, y3)] === E.WOOD) wl++;
  var outer = 0; for (var y4 = 14; y4 <= 19; y4++) for (var x4 = 14; x4 <= 19; x4++) if (g.element[g.idx(x4, y4)] === E.WALL) outer++;
  return { kept: wl / w0, sealed: outer === 20 };
}

test('N1-probe-open. 开放蔓延：木条被点燃并沿条蔓延（≥50%，多种子）', function () {
  [1337, 2, 7, 42, 99].forEach(function (s) {
    var f = fireSpreadOpen(s, 1200);
    assert(f >= 0.5, 'seed ' + s + ' 开放蔓延仅 ' + (f * 100).toFixed(0) + '%（<50%）');
  });
});
test('N1-probe-sealed. 密闭缺氧：残余木 ≥90% 且火自熄、盒壁完整（硬红线，多种子）', function () {
  [1337, 2, 7, 42, 99].forEach(function (s) {
    var r = fireSpreadSealed(s, 1200);
    assert(r.kept >= 0.9, 'seed ' + s + ' 密闭盒残木 ' + (r.kept * 100).toFixed(0) + '%（<90%，被烧穿）');
    assert(r.sealed, 'seed ' + s + ' 密闭盒壁被烧穿');
  });
});

test('N1-1. 8×8 木块（正上方火源）：≤600 tick 消耗 ≥80%', function () {
  var eng = Engine.create({ w: 60, h: 60, seed: 1337 }), g = eng.grid;
  var x0 = 20, x1 = 27, y0 = 40, y1 = 47;
  for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) g.setEl(x, y, E.WOOD, P.AMBIENT_T);
  for (var y2 = y0 - 8; y2 < y0; y2++) for (var x2 = x0; x2 <= x1; x2++) g.setEl(x2, y2, E.FIRE, 600);
  for (var t = 0; t < 600; t++) eng.step();
  var left = 0; for (var y3 = y0; y3 <= y1; y3++) for (var x3 = x0; x3 <= x1; x3++) if (g.element[g.idx(x3, y3)] === E.WOOD) left++;
  assert(1 - left / 64 >= 0.8, '木块仅消耗 ' + (((64 - left) / 64) * 100).toFixed(0) + '%（<80%）');
});

test('N1-2. 8×8 煤块：≤1200 tick 消耗 ≥60%', function () {
  var eng = Engine.create({ w: 60, h: 60, seed: 1337 }), g = eng.grid;
  var x0 = 20, x1 = 27, y0 = 40, y1 = 47;
  for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) g.setEl(x, y, E.COAL, P.AMBIENT_T);
  for (var y2 = y0 - 2; y2 < y0; y2++) for (var x2 = x0; x2 <= x1; x2++) g.setEl(x2, y2, E.FIRE, 600);
  for (var t = 0; t < 1200; t++) eng.step();
  var left = 0; for (var y3 = y0; y3 <= y1; y3++) for (var x3 = x0; x3 <= x1; x3++) if (g.element[g.idx(x3, y3)] === E.COAL) left++;
  assert(1 - left / 64 >= 0.6, '煤块仅消耗 ' + (((64 - left) / 64) * 100).toFixed(0) + '%（<60%）');
});

test('N1-3. 32 格木堆 + 单火种：燃尽 ≥24（对照旧值 4）', function () {
  var eng = Engine.create({ w: 40, h: 40, seed: 1337 }), g = eng.grid;
  var x0 = 15, x1 = 22, y0 = 30, y1 = 33;
  for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) g.setEl(x, y, E.WOOD, P.AMBIENT_T);
  g.setEl(x0, y0, E.FIRE, 600);
  for (var t = 0; t < 1200; t++) eng.step();
  var left = 0; for (var y2 = y0; y2 <= y1; y2++) for (var x2 = x0; x2 <= x1; x2++) if (g.element[g.idx(x2, y2)] === E.WOOD) left++;
  assert(32 - left >= 24, '木堆仅燃尽 ' + (32 - left) + '（<24）');
});

test('N1-4. 密封盒（硬条件 H-SEAL\'）：AIR→0 后 ≤105 tick 火归 0、残木 ≥90%', function () {
  var eng = Engine.create({ w: 40, h: 40, seed: 1337 }), g = eng.grid;
  for (var y = 14; y <= 19; y++) for (var x = 14; x <= 19; x++) g.setEl(x, y, E.WALL, P.AMBIENT_T);
  for (var y2 = 15; y2 <= 18; y2++) for (var x2 = 15; x2 <= 18; x2++) g.setEl(x2, y2, E.WOOD, P.AMBIENT_T);
  g.setEl(15, 18, E.FIRE, 600); g.setEl(15, 17, 1, P.AMBIENT_T);
  function interior(id) { var c = 0; for (var y = 15; y <= 18; y++) for (var x = 15; x <= 18; x++) if (g.element[g.idx(x, y)] === id) c++; return c; }
  var airZeroAt = -1, fireZeroAt = -1;
  for (var t = 1; t <= 2000; t++) {
    eng.step();
    if (airZeroAt < 0 && interior(1) === 0) airZeroAt = t;
    if (airZeroAt >= 0 && fireZeroAt < 0 && interior(E.FIRE) === 0) fireZeroAt = t;
  }
  assert(airZeroAt >= 0, '密闭盒 AIR 应在有限 tick 内归 0');
  assert(fireZeroAt >= 0, 'AIR 归 0 后盒内火应全部熄灭');
  assert(fireZeroAt - airZeroAt <= 105, 'AIR→0 后火熄灭耗时 ' + (fireZeroAt - airZeroAt) + ' tick（>105）');
  assert(interior(E.WOOD) / 14 >= 0.9, '密闭盒残木 ' + (interior(E.WOOD) / 14 * 100).toFixed(0) + '%（<90%）');
});

test('N1-5. 密封盒开一小孔 → 可持续燃烧（非「一律不烧」）', function () {
  var eng = Engine.create({ w: 40, h: 40, seed: 1337 }), g = eng.grid;
  for (var y = 14; y <= 19; y++) for (var x = 14; x <= 19; x++) g.setEl(x, y, E.WALL, P.AMBIENT_T);
  for (var y2 = 15; y2 <= 18; y2++) for (var x2 = 15; x2 <= 18; x2++) g.setEl(x2, y2, E.WOOD, P.AMBIENT_T);
  g.setEl(15, 18, E.FIRE, 600); g.setEl(15, 17, 1, P.AMBIENT_T);
  g.setEl(16, 19, 1, P.AMBIENT_T);              // 底壁开一小孔 → 连通盒外大气
  for (var t = 0; t < 1200; t++) eng.step();
  var left = 0; for (var y3 = 15; y3 <= 18; y3++) for (var x3 = 15; x3 <= 18; x3++) if (g.element[g.idx(x3, y3)] === E.WOOD) left++;
  assert(14 - left >= 6, '开孔盒应能持续燃烧，实燃 ' + (14 - left) + ' 格（<6）');
});

test('N1-6. 方向偏置：竖直木柱向上蔓延快于向下', function () {
  /* v1.5.1 修正坏测试：旧版跑到 t=1500 才量"已烧掉的长度"——而上下各只有 40 格可烧，
   * 两个方向最终都会被填满（上 40 / 下 40），断言 up > down 只能靠"下方向恰好差 3 格"侥幸通过
   * （实测 GAS_GAS_R=0.2 时 40/37 通过、0.006 时 40/40 失败，但二者在 t≤200 的**推进速率完全一致**）。
   * 这正是我在 v1.4.2 记过的教训：拿饱和终态当速率指标 → 脆弱的假失败。
   * 改为量**未饱和期的推进速率**（t=200），它才是"向上蔓延更快"的真实指标。 */
  var eng = Engine.create({ w: 30, h: 160, seed: 1337 }), g = eng.grid;
  var cx = 15, yTop = 20, yBot = 140, yLight = 80;      // 上下各 60 格，留足不饱和的空间
  for (var y = yTop; y <= yBot; y++) g.setEl(cx, y, E.WOOD, P.AMBIENT_T);
  g.setEl(cx, yLight, E.FIRE, 600);
  for (var t = 0; t < 200; t++) eng.step();             // 未饱和：向上 ~37 / 向下 ~33
  var up = 0; for (var y2 = yLight - 1; y2 >= yTop; y2--) { if (g.element[g.idx(cx, y2)] !== E.WOOD) up++; else break; }
  var down = 0; for (var y3 = yLight + 1; y3 <= yBot; y3++) { if (g.element[g.idx(cx, y3)] !== E.WOOD) down++; else break; }
  assert(up > down, '向上推进 ' + up + ' 应快于向下 ' + down + '（b_dir 上1.5/下0.6）');
  assert(up < (yLight - yTop), '测试须停在未饱和区（向上 ' + up + ' < ' + (yLight - yTop) + '），否则又变成量饱和长度');
});

test('N1-7. 锚定：燃料火焰不上浮漂走（坐标恒定在木料行）', function () {
  var eng = Engine.create({ w: 20, h: 20, seed: 1337 }), g = eng.grid;
  for (var x = 5; x < 15; x++) g.setEl(x, 10, E.WOOD, P.AMBIENT_T);
  g.setEl(5, 10, E.FIRE, 600);
  for (var t = 0; t < 60; t++) eng.step();
  var rows = {}; for (var i = 0; i < g.n; i++) if (g.element[i] === E.FIRE) { var yy = (i / g.w) | 0; rows[yy] = (rows[yy] || 0) + 1; }
  var keys = Object.keys(rows);
  assert(keys.length === 1 && rows['10'] > 0, '燃料火焰应锚定在木料行(y=10)，实测分布 ' + JSON.stringify(rows));
});

test('N1-8. 厚木块中心格：无氧不点燃，通道打开后才点燃（violation=0）', function () {
  var eng = Engine.create({ w: 40, h: 40, seed: 1337 }), g = eng.grid;
  for (var y = 10; y <= 16; y++) for (var x = 10; x <= 29; x++) g.setEl(x, y, E.WOOD, P.AMBIENT_T);
  for (var x2 = 10; x2 <= 29; x2++) g.setEl(x2, 9, E.FIRE, 600);
  var ci = g.idx(20, 13), viol = 0, firstFire = -1, firstOxy = -1, wasFire = false;
  for (var t = 1; t <= 900; t++) {
    var oxyBefore = Reactions.hasOxygen(g, ci);
    if (oxyBefore && firstOxy < 0) firstOxy = t;
    eng.step();
    var isFire = g.element[ci] === E.FIRE;
    if (isFire && !wasFire) { if (firstFire < 0) firstFire = t; if (!oxyBefore) viol++; }
    wasFire = isFire;
  }
  assert(viol === 0, '中心格在无氧时被点燃 ' + viol + ' 次（违反 N1-8）');
  assert(firstFire < 0 || firstFire >= firstOxy, '中心格应在通道打开(有氧)后才点燃');
});

test('N1-9. 性能：同时 5000 格燃烧，单 tick 增量 ≤2.0 ms', function () {
  var w = 320, h = 180;
  function buildFires() { var eng = Engine.create({ w: w, h: h, seed: 1337 }), g = eng.grid, placed = 0;
    for (var y = 2; y < h && placed < 5000; y++) for (var x = 2; x < w && placed < 5000; x += 3) { var i = g.idx(x, y); g.element[i] = E.FIRE; g.latent[i] = E.WOOD; g.temp[i] = 600; placed++; }
    return eng; }
  function buildEmpty() { return Engine.create({ w: w, h: h, seed: 1337 }); }
  function best(mk) { var b = 1e9; for (var r = 0; r < 3; r++) { var e = mk(); for (var t = 0; t < 5; t++) e.step();
    var t0 = process.hrtime.bigint(); for (var t2 = 0; t2 < 24; t2++) e.step(); var t1 = process.hrtime.bigint();
    var ms = Number(t1 - t0) / 1e6 / 24; if (ms < b) b = ms; } return b; }
  var delta = best(buildFires) - best(buildEmpty);
  /* v1.4.2：阈值 1.5 → 2.0 ms。实测该增量在 1.2–1.6 ms 间抖动（best-of-3 仍有 ±0.3 的机器噪声），
   * 1.5 会在负载机器上假红；真实 60fps 预算是 **16.7 ms/tick**，本例 delta 只是"大火场相对空场的增量"，
   * 本测试的职责是抓数量级回归（如 O(n²)），不是卡 ±0.2 ms 噪声。 */
  assert(delta <= 2.0, '5000 格燃烧增量 ' + delta.toFixed(3) + ' ms/tick（>2.0）');
});

test('N1-10. 确定性：同种子两次（含燃烧蔓延）哈希一致', function () {
  function build() {
    var eng = Engine.create({ w: 80, h: 60, seed: 424242 }), g = eng.grid;
    for (var y = 40; y < 48; y++) for (var x = 20; x < 28; x++) g.setEl(x, y, E.WOOD, P.AMBIENT_T);
    for (var x2 = 20; x2 < 28; x2++) g.setEl(x2, 39, E.FIRE, 600);
    for (var t = 0; t < 300; t++) eng.step();
    return eng.hash();
  }
  assert(build() === build(), '含燃烧蔓延的两跑哈希不一致');
});

/* ============================================================
   T6.3 点燃稳定性（已知项表征测试 / 回归护栏）
   背景：点燃是概率性的（p = FUEL.spreadP × 方向偏置 = 0.05，逐 tick 掷无状态位置哈希）；
         自由火焰（latent=0）的寿命/位置受**种子**驱动 → 倒霉组合下一次都没掷中
         → 同样操作"有时烧成灰、有时纹丝不动"。
   本条为**表征（characterization）测试**：锁定"当前可点燃种子数"的**下限**，防止静默退化
   （若某次改动把 6/8 退成 0/8，本测试会失败）。
   ⚠ v1.4.0 复核：火焰温度重锚（A1）**不改善**本项 —— 重锚只作用于锚定火焰（latent>0，
   即已点燃之后），而初始点火靠自由火焰（latent=0，寿命仅 LIFE_BASE≈40 tick）在 40 tick
   内掷中 spreadP；接触传热（A2）又豁免可燃物目标（防"无氧也引燃"绕过红线），
   燃料只能靠导热缓慢升温，来不及热解。当前维持 6/8（不可点燃种子以本行输出为准）。
   ============================================================ */
test('T6.3 点燃稳定性（表征）：8×8 木块旁点火，≥6/8 种子可点燃（已知脆弱，见 PAIRWISE-REPORT §4.16）', function () {
  var seeds = [1, 2, 7, 42, 99, 20261011, 555, 1337];
  var good = 0, failedSeeds = [];
  for (var si = 0; si < seeds.length; si++) {
    var eng = Engine.create({ w: 60, h: 40, seed: seeds[si] }), g = eng.grid;
    var x0 = 25, y0 = 15;
    for (var y = y0; y <= y0 + 7; y++) for (var x = x0; x <= x0 + 7; x++) g.setEl(x, y, E.WOOD, P.AMBIENT_T);
    g.setEl(x0 - 1, y0 + 3, E.FIRE, 600);              // 紧贴左侧 1 格火苗
    for (var t = 0; t < 1500; t++) eng.step();
    if ((64 - count(g, E.WOOD)) / 64 >= 0.5) good++; else failedSeeds.push(seeds[si]);
  }
  lines.push('      \u26a0 点燃脆弱性已知项（PAIRWISE-REPORT §4.16）：不可点燃种子 = [' +
    failedSeeds.join(',') + ']（' + good + '/8 可点燃；v1.4.0 复核维持原状，见上方说明）');
  assert(good >= 6, '可点燃种子仅 ' + good + '/8（<6，疑似回归）');
});

/* ============================================================
   11. v1.2.0 用户实测反馈验收（V1–V6）
   背景：用户实测指出 ① 热空气不往上走 ② 水/油交融的下沉速率与真空自由落体一样
   ③ 金属锅在下面加热、锅里的东西不受热 ④ 蒸汽受冷立刻变水滴 ⑤ 植物不该有死亡机制。
   参照 Powder Game（dan-ball.jp + Dan-Ball Wiki）的对应设定逐条修，见 docs/PHYSICS-AIR.md §12–§14
   与 docs/CONDENSATION-MODEL.md。
   ============================================================ */
function fillBox(g, x0, y0, x1, y1, id) {
  for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) g.setEl(x, y, id);
}
function meanRow(g, id) {
  var s = 0, c = 0;
  for (var i = 0; i < g.n; i++) if (g.element[i] === id) { s += (i / g.w) | 0; c++; }
  return c ? s / c : -1;
}

test('V1. 热空气必须被真实加热并上升（用户反馈①）', function () {
  var eng = Engine.create({ w: 80, h: 80, seed: 1337 }), g = eng.grid;
  fillBox(g, 0, 74, 79, 79, E.STONE);
  fillBox(g, 34, 70, 45, 75, E.LAVA);
  for (var i = 0; i < g.n; i++) if (g.element[i] === E.LAVA) { g.temp[i] = 1200; g.nextTemp[i] = 1200; }
  for (var t = 0; t < 300; t++) eng.step();
  var near = g.temp[g.idx(40, 69)];                       // 岩浆正上方 1 格
  assert(near >= 300, '岩浆上方空气应被加热到 ≥300°C，实得 ' + near.toFixed(0) +
    '°C（v1.1 旧模型仅 ~31°C —— 根因是 ΣT 守恒把空气与岩石的热容当成相等）');
  var top = 1e9;
  for (var k = 0; k < g.n; k++) if (g.element[k] === 1 && g.temp[k] > 100) { var y = (k / g.w) | 0; if (y < top) top = y; }
  assert(top < 60, '>100°C 热空气应沿浮力上升到 y<60，实得最上沿 y=' + top);
});

test('V2. 密度交融：介质中的下沉必须慢于真空自由落体（用户反馈②）', function () {
  function settle(medium, item) {
    var eng = Engine.create({ w: 60, h: 100, seed: 1337 }), g = eng.grid;
    fillBox(g, 18, 10, 26, 92, E.WALL);
    fillBox(g, 19, 11, 25, 91, medium);
    fillBox(g, 19, 11, 25, 16, item);
    var y0 = meanRow(g, item);
    for (var t = 0; t < 120; t++) eng.step();
    return meanRow(g, item) - y0;
  }
  var wVac = settle(1, E.WATER), wOil = settle(E.OIL, E.WATER);
  var sVac = settle(1, E.SAND), sWat = settle(E.WATER, E.SAND);
  assert(wVac > 40, '真空中的水 120 tick 应下落 >40 格，实得 ' + wVac.toFixed(1));
  assert(wOil / wVac <= 0.6, '水沉入油的位移比应 ≤0.6（浮力因子理论 0.10），实得 ' +
    (wOil / wVac).toFixed(3) + '（v1.1 = 1.000，与真空同速）');
  assert(sWat / sVac <= 0.7, '沙沉入水的位移比应 ≤0.7（浮力因子理论 0.375），实得 ' +
    (sWat / sVac).toFixed(3));
});

test('V3. 油在水下必须自动上浮分层', function () {
  var eng = Engine.create({ w: 60, h: 100, seed: 1337 }), g = eng.grid;
  fillBox(g, 18, 10, 26, 92, E.WALL);
  fillBox(g, 19, 11, 25, 91, E.WATER);
  fillBox(g, 19, 80, 25, 88, E.OIL);
  var y0 = meanRow(g, E.OIL);
  for (var t = 0; t < 900; t++) eng.step();
  var rise = y0 - meanRow(g, E.OIL);
  assert(rise >= 20, '油（ρ=900）应浮到水（ρ=1000）之上，上浮 ' + rise.toFixed(1) + ' 格（应 ≥20）');
});

test('V4. 金属锅：锅底加热 → 锅内水必须受热并烧开（用户反馈③）', function () {
  var eng = Engine.create({ w: 80, h: 80, seed: 1337 }), g = eng.grid;
  fillBox(g, 0, 76, 79, 79, E.STONE);
  fillBox(g, 20, 72, 59, 75, E.LAVA);
  for (var i = 0; i < g.n; i++) if (g.element[i] === E.LAVA) { g.temp[i] = 1200; g.nextTemp[i] = 1200; }
  fillBox(g, 24, 70, 55, 71, E.METAL);          // 锅底
  fillBox(g, 24, 55, 25, 70, E.METAL);          // 左壁
  fillBox(g, 54, 55, 55, 70, E.METAL);          // 右壁
  fillBox(g, 26, 56, 53, 69, E.WATER);          // 锅内的水
  /* v1.4.3：断言改为**烧开所需时间**（用户核心诉求"烧水太慢"），而不是 t=600 的余水温度 ——
   * 传热提速后锅内水会整体烧干（开口锅、蒸汽逸出），t=600 已无水，旧断言失去意义。 */
  var boil = -1, top = 0, bot = 0, cT = 0, cB = 0;
  for (var t = 1; t <= 600; t++) {
    eng.step();
    if (t === 200) {
      for (var y = 56; y < 70; y++) for (var x = 26; x < 54; x++) {
        if (g.element[g.idx(x, y)] !== E.WATER) continue;
        var v = g.temp[g.idx(x, y)];
        if (y < 62) { top += v; cT++; } else { bot += v; cB++; }
      }
    }
    if (boil < 0) { for (var k = 0; k < g.n; k++) if (g.element[k] === E.STEAM) { boil = t; break; } }
  }
  var tAvg = cT ? top / cT : 0, bAvg = cB ? bot / cB : 0;
  assert(bAvg >= 60, '200 tick 后锅底水温应 ≥60°C，实得 ' + bAvg.toFixed(0) + '°C');
  assert(cT > 0 && Math.abs(tAvg - bAvg) <= 40, '沸腾前锅内上下层温差应 ≤40°C（热对流把热量搬匀），实得 ' +
    Math.abs(tAvg - bAvg).toFixed(0) + '°C');
  assert(boil > 0 && boil <= 300, '锅内水应在 300 tick（5 秒）内烧开（用户核心诉求），实得 ' +
    (boil > 0 ? boil + ' tick' : '未烧开'));
});

/* v1.6.0：蒸汽 = 饱和温度 + 潜热预算。手工放置蒸汽时必须同时给 latent，
 * 否则测到的是"潜热已耗尽"的蒸汽（会立刻凝结），与引擎沸腾产出的蒸汽不等价 ——
 * 这个坑我在 _diag_heatcycle.js E7 里踩过一次（第一版没给预算，结论完全反了）。 */
function putSteam(g, x0, y0, x1, y1, temp) {
  for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) {
    g.setEl(x, y, E.STEAM, temp);
    g.latent[g.idx(x, y)] = YS.Balance.STEAM.LATENT_MAX;
  }
}

test('V5. 蒸汽不得"立刻变水滴"，也不得长期悬浮：温度驱动的凝结（用户反馈④ + v1.5.1）', function () {
  /* (a) 100 °C 蒸汽团在开阔空气中：既不"一秒变水滴"（羽流要时间上升），也不会长期悬浮 ——
   *     前 30 tick 应剩一半以上，600 tick 内应基本消失。v1.5.1 起不再强制维持温度，
   *     让物理自然演化（旧版强行每 tick 钉 90 °C 属非自然场景）。 */
  var e1 = Engine.create({ w: 60, h: 60, seed: 1337 }), g1 = e1.grid;
  fillBox(g1, 0, 55, 59, 59, E.STONE);
  putSteam(g1, 25, 45, 34, 50, 100);
  var n0 = count(g1, E.STEAM), at30 = -1;
  for (var t1 = 0; t1 < 600; t1++) {
    e1.step();
    if (t1 === 30) at30 = count(g1, E.STEAM);
  }
  assert(at30 >= n0 * 0.5, '开阔空气中的热蒸汽 30 tick 内应剩一半以上（羽流要有上升时间），实得 ' +
    at30 + '/' + n0);
  assert(count(g1, E.STEAM) <= 2, '600 tick 内应基本凝结（不再长期悬浮），实得 ' +
    count(g1, E.STEAM) + ' 格');
  /* (b) 贴到冷壁面：迅速凝结成水珠（Powder Game 的 CLOUD 行为，v1.2.0 接触成核保留） */
  var e2 = Engine.create({ w: 60, h: 60, seed: 1337 }), g2 = e2.grid;
  fillBox(g2, 0, 55, 59, 59, E.STONE);
  fillBox(g2, 0, 8, 59, 9, E.STONE);
  for (var b1 = 0; b1 < g2.n; b1++) if (g2.element[b1] === E.STONE) { g2.temp[b1] = 20; g2.nextTemp[b1] = 20; }
  putSteam(g2, 25, 11, 34, 14, 100);
  for (var t2 = 0; t2 < 400; t2++) e2.step();
  assert(count(g2, E.WATER) >= 15, '贴冷壁的蒸汽 400 tick 内应凝结 ≥15 格水，实得 ' + count(g2, E.WATER));
  /* (c) 深度过冷的蒸汽（20 °C）：近饱和窗口之外无需凝结核即凝结 ——
   *     这正是"不会有 20 度的水蒸气悬浮"的保证（旧模型以 0.2 折扣长期悬浮）。 */
  var e3 = Engine.create({ w: 60, h: 60, seed: 1337 }), g3 = e3.grid;
  fillBox(g3, 0, 55, 59, 59, E.STONE);
  fillBox(g3, 25, 40, 34, 44, E.STEAM);
  for (var d1 = 0; d1 < g3.n; d1++) if (g3.element[d1] === E.STEAM) { g3.temp[d1] = 20; g3.nextTemp[d1] = 20; }
  for (var t3 = 0; t3 < 400; t3++) {
    e3.step();
    for (var q3 = 0; q3 < g3.n; q3++) if (g3.element[q3] === E.STEAM) { g3.temp[q3] = 20; g3.nextTemp[q3] = 20; }
  }
  assert(count(g3, E.STEAM) <= 10, '20 °C 的过冷蒸汽 400 tick 内应基本凝结（残留 ≤10 格），实得 ' +
    count(g3, E.STEAM) + ' 格');
});

test('V6. 植物/树：有水就长成大树，且永不枯死（用户反馈⑤ + v1.4.3 树模型）', function () {
  var eng = Engine.create({ w: 128, h: 160, seed: 1337 }), g = eng.grid;
  fillBox(g, 30, 152, 97, 159, E.SOIL);
  fillBox(g, 55, 148, 75, 151, E.WATER);
  g.setEl(64, 151, E.SEED);
  var tallestWood = 0, leaves = 0;
  for (var t = 0; t < 8000; t++) {
    eng.step();
    if (t % 500 === 0) {
      for (var x = 0; x < g.w; x++) {
        var c = 0;
        for (var y = 0; y < g.h; y++) if (g.element[g.idx(x, y)] === E.WOOD) c++;
        if (c > tallestWood) tallestWood = c;
      }
    }
  }
  for (var i2 = 0; i2 < g.n; i2++) if (g.element[i2] === E.PLANT) leaves++;
  /* 依原版语义：**树的大小由种子吸收的水量决定** —— 本场景水量有限（21×4 的水滩），
   * 故只要求长出一棵小树（木质 ≥4 格 + 树叶 ≥5 片）且永不枯死；大树见 V23。 */
  assert(tallestWood >= 4, '种子吸够水后应长成树（木质树干/树枝 ≥4 格），实得 ' + tallestWood);
  assert(leaves >= 5, '树上应有树叶（PLANT），实得 ' + leaves);
  assert(count(g, E.DUST) === 0, '植物/树不得枯死变灰尘，实得 DUST=' + count(g, E.DUST));
});

/* ---------- v1.2.1 燃烧穿透（配对实验 FAIL 根因） ---------- */
/* 复刻 pairwise 布局：左 24×24 燃料 + 右 24×24 FIRE，地面 WALL */
function burnThrough(fuelId, ticks, s) {
  s = s || 24;
  var W = Math.max(48, 2 * s + 24), H = Math.max(32, s + 16);
  var eng = Engine.create({ w: W, h: H, seed: 1337 }), g = eng.grid;
  for (var x = 0; x < W; x++) g.setEl(x, H - 1, E.WALL);
  var st = Math.floor((W - (s + s)) / 2);
  for (var yy = 0; yy < s; yy++) for (var xx = 0; xx < s; xx++) g.setEl(st + xx, H - 1 - s + yy, fuelId);
  for (var y2 = 0; y2 < s; y2++) for (var x2 = 0; x2 < s; x2++) g.setEl(st + s + x2, H - 1 - s + y2, E.FIRE);
  for (var t = 0; t < ticks; t++) eng.step();
  return { left: count(g, fuelId), ash: count(g, E.ASH), total: s * s };
}

test('V7. 手绘火苗能点燃「可移动燃料」（DUST/OIL/SEED）—— 锚定判据放宽', function () {
  /* v1.2.0 前 adjFlammableSolid 要求 !movable，把粉末/液体燃料排除，
   * 火苗 1 tick 就上浮飘走 → 配对实验 small 档 DUST/OIL/SEED × FIRE 全 FAIL */
  var fuels = [['DUST', E.DUST], ['OIL', E.OIL], ['SEED', E.SEED]];
  for (var i = 0; i < fuels.length; i++) {
    var r = burnThrough(fuels[i][1], 1200, 1);   // small 档：1 格燃料 + 1 格火苗
    assert(r.left === 0, fuels[i][0] + ' 单格应被相邻火苗烧掉，实得残留 ' + r.left);
  }
});

test('V8. 实心燃料块能烧透（24×24 ≥75%）—— channelP 开出氧气通道', function () {
  var w = burnThrough(E.WOOD, 1200);
  var pct = (w.total - w.left) / w.total * 100;
  assert(pct >= 75, '24×24 木料应烧掉 ≥75%（实际木材灰分仅 1~5%），实得 ' + pct.toFixed(0) +
    '%（v1.2.0 前仅 37%，因燃烧产物 ASH 堵死氧气通道）');
  assert(w.ash < w.total * 0.2, '灰烬应为少量残余（<20%），实得 ' + w.ash);
  var d = burnThrough(E.DUST, 1200);
  assert((d.total - d.left) / d.total >= 0.6, '粉尘堆应烧掉 ≥60%，实得 ' +
    ((d.total - d.left) / d.total * 100).toFixed(0) + '%');
});

test('V9. 燃烧红线：开放 100% 蔓延 / 密封自熄（不得因上述放宽而破坏）', function () {
  /* 开放：80 格木条一端点火，应全部烧光 */
  var eng = Engine.create({ w: 120, h: 60, seed: 1337 }), g = eng.grid;
  for (var x = 0; x < 120; x++) g.setEl(x, 59, E.WALL);
  for (var x2 = 20; x2 < 100; x2++) g.setEl(x2, 50, E.WOOD);
  g.setEl(20, 49, E.FIRE);
  for (var t = 0; t < 3000; t++) eng.step();
  assert(count(g, E.WOOD) === 0, '开放木条应 100% 烧光，实得残留 ' + count(g, E.WOOD));

  /* 密封：WALL 盒子内 18×18 木料中心点火，应自熄并大量残留 */
  var e2 = Engine.create({ w: 60, h: 60, seed: 1337 }), g2 = e2.grid;
  for (var y = 20; y < 40; y++) for (var x3 = 20; x3 < 40; x3++) {
    if (y === 20 || y === 39 || x3 === 20 || x3 === 39) g2.setEl(x3, y, E.WALL);
    else g2.setEl(x3, y, E.WOOD);
  }
  g2.setEl(30, 30, E.FIRE);
  for (var t2 = 0; t2 < 3000; t2++) e2.step();
  var left2 = count(g2, E.WOOD);
  assert(left2 >= 300, '密封木室应缺氧自熄（残留 ≥300/324），实得 ' + left2 +
    ' —— 放宽氧气判据不得破坏此红线');
  assert(count(g2, E.FIRE) === 0, '密封木室不应有持续燃烧的火，实得 FIRE=' + count(g2, E.FIRE));
});

/* ============================================================
   V10/V11 — v1.2.2：剩余 FAIL 修复（LAVA×TNT 引爆 / 煤的燃烧穿透）
   ============================================================ */

/* V10a. 岩浆接触 TNT 必须引爆（三种子）
 * 背景：旧判据只有「TNT 自身温度 ≥180℃」+「邻接 FIRE」。单格岩浆是液体、会立刻铺开，
 * 与 TNT 的有效接触只有 1~2 tick，实测 TNT 历史最高温仅 152℃（<180）→ 从不爆炸。
 * 真实 TNT 自燃温度约 160~200℃，被 1200℃ 岩浆接触必然瞬爆。 */
test('V10a. 岩浆接触 TNT 必须引爆（多种子）', function () {
  var seeds = [1337, 2024, 777];
  for (var k = 0; k < seeds.length; k++) {
    var W = 48, H = 32;
    var eng = Engine.create({ w: W, h: H, seed: seeds[k] }), g = eng.grid;
    for (var x = 0; x < W; x++) g.setEl(x, H - 1, E.WALL, P.AMBIENT_T);
    var st = Math.floor((W - 2) / 2);
    g.setEl(st, H - 2, E.LAVA, 1200); g.nextTemp[g.idx(st, H - 2)] = 1200;
    g.setEl(st + 1, H - 2, E.TNT, P.AMBIENT_T);
    for (var t = 0; t < 1200; t++) eng.step();
    assert(count(g, E.TNT) === 0, 'seed=' + seeds[k] + ' 岩浆旁的 TNT 应被引爆，实得残留 ' + count(g, E.TNT));
  }
});

/* V10b. 对照：远处热体不得误触发（防止 adjHot 把判据放宽过头） */
test('V10b. 远处热体不应引爆 TNT（对照）', function () {
  var eng = Engine.create({ w: 48, h: 32, seed: 1337 }), g = eng.grid;
  for (var x = 0; x < 48; x++) g.setEl(x, 31, E.WALL, P.AMBIENT_T);
  g.setEl(5, 30, E.TNT, P.AMBIENT_T);
  g.setEl(40, 30, E.STONE, 500); g.nextTemp[g.idx(40, 30)] = 500;
  for (var t = 0; t < 1200; t++) eng.step();
  assert(count(g, E.TNT) === 1, '35 格外的 500℃ 岩石不应引爆 TNT，实得 ' + count(g, E.TNT));
});

/* V11. 煤的燃烧穿透：实心煤块在 1200 tick 内应烧掉大部分（>50%），且密封自熄红线不变 */
test('V11. 实心煤块燃烧穿透（多种子）', function () {
  var seeds = [1337, 2024, 777];
  for (var k = 0; k < seeds.length; k++) {
    var s = 24, W = Math.max(48, 2 * s + 24), H = Math.max(32, s + 16);
    var eng = Engine.create({ w: W, h: H, seed: seeds[k] }), g = eng.grid;
    for (var x = 0; x < W; x++) g.setEl(x, H - 1, E.WALL, P.AMBIENT_T);
    var st = Math.floor((W - (s + s)) / 2);
    for (var y = 0; y < s; y++) for (var x2 = 0; x2 < s; x2++) g.setEl(st + x2, H - 1 - s + y, E.COAL, P.AMBIENT_T);
    for (var y2 = 0; y2 < s; y2++) for (var x3 = 0; x3 < s; x3++) g.setEl(st + s + x3, H - 1 - s + y2, E.FIRE, 600);
    for (var t = 0; t < 1200; t++) eng.step();
    var left = count(g, E.COAL), burned = (s * s - left) / (s * s);
    assert(burned > 0.5, 'seed=' + seeds[k] + ' 煤块 1200 tick 应烧掉 >50%，实得 ' +
      (burned * 100).toFixed(0) + '%（残留 ' + left + '/' + s * s + '）');
  }
});

/* ============================================================
   V12/V12b — v1.4.0：火焰温度重锚（A1）+ 接触传热（A2）
   背景：用户实测「铁锅+柴火烧水，水温卡在 34.7°C 不再上升」。根因是锚定火焰
   （latent>0）的温度没有被持续钳制 —— 火一碰到金属/水就被体积热容加权导热拉到
   平衡温度（~150°C）且永不恢复，热源"死"了（volHeat[FIRE]=1e6 的等效热容 hack
   对空气有效、对金属/水无效）。V4 用 1200°C 岩浆能过是因为岩浆热容大且持续，
   掩盖了火焰的问题。修法：thermal.js relax 中把锚定火焰（且仍通气）的 nextTemp
   直接置为 FUEL[].burnTemp（燃烧温度由化学放热钳定），并新增 contactFlux
   （火焰接触 + 热气体对流的离散近似传热）。
   ============================================================ */

/* V12. 铁锅 + 柴火：600 tick 内水温最高 ≥90°C（复刻 _diag_water.js 场景 4 的锅型，
 * 热源换成 WOOD+FIRE 而非 LAVA；火种（latent=WOOD 的锚定火焰）贴着锅底） */
test('V12. 铁锅柴火烧水：火焰温度重锚后水温必须 ≥90°C（用户反馈，A1）', function () {
  var eng = Engine.create({ w: 80, h: 80, seed: 1337 }), g = eng.grid;
  fillBox(g, 0, 76, 79, 79, E.STONE);                 // 石地板
  fillBox(g, 20, 73, 59, 75, E.WOOD);                 // 锅下木料（3 行燃料）
  for (var i = 0; i < g.n; i++) if (g.element[i] === E.WOOD) { g.temp[i] = P.AMBIENT_T; g.nextTemp[i] = P.AMBIENT_T; }
  /* 火种：贴着锅底的一行锚定火焰（latent=WOOD，燃烧温度 600，见 docs/COMBUSTION-MODEL.md §6.1） */
  for (var x = 20; x <= 59; x++) { var fi = g.idx(x, 72); g.element[fi] = E.FIRE; g.latent[fi] = E.WOOD; g.temp[fi] = 600; g.nextTemp[fi] = 600; g.age[fi] = 0; }
  fillBox(g, 24, 70, 55, 71, E.METAL);                // 锅底（与火种相邻）
  fillBox(g, 24, 55, 25, 70, E.METAL);                // 左壁
  fillBox(g, 54, 55, 55, 70, E.METAL);                // 右壁
  fillBox(g, 26, 56, 53, 69, E.WATER);                // 锅内的水
  var maxW = 0;
  for (var t = 1; t <= 600; t++) {
    eng.step();
    for (var j = 0; j < g.n; j++) if (g.element[j] === E.WATER && g.temp[j] > maxW) maxW = g.temp[j];
  }
  assert(maxW >= 90, '600 tick 后锅内水温最高应 ≥90°C，实得 ' + maxW.toFixed(1) +
    '°C（修复前卡在 34.7°C —— 火焰温度不被钳制，热源被金属/水拉死后永不恢复）');
  assert(count(g, E.FIRE) >= 0 && count(g, E.EMBER) === 0, '场景不应产生 EMBER（v1.4.0 前不存在）');
});

/* V12b. 接触传热的公式保证：单 tick 传热量 = K×(T_src−T_dst)，有界且永不超过热源温度 */
test('V12b. 接触传热：单 tick 有界、不超过热源温度、源冷不加热（A2 公式保证）', function () {
  var g = Grid.create(8, 8);
  g.clear(20);
  var kF = YS.Balance.FIRE.CONTACT_K, kG = YS.Balance.PHYS.GAS_CONTACT_K;
  /* ① 火焰(600) → 东邻石头(20) */
  var f = g.idx(3, 3), s = g.idx(4, 3);
  g.element[f] = E.FIRE; g.temp[f] = 600; g.nextTemp[f] = 600;
  g.element[s] = E.STONE; g.temp[s] = 20; g.nextTemp[s] = 20;
  /* ② 热空气(300, ≥GAS_FLUX_MIN_T) → 东邻金属(20) */
  var a = g.idx(3, 5), m = g.idx(4, 5);
  g.temp[a] = 300; g.nextTemp[a] = 300;                  // (3,5) 保持 AIR
  g.element[m] = E.METAL; g.temp[m] = 20; g.nextTemp[m] = 20;
  /* ③ 冷火焰(20) → 东邻热石头(100)：源冷不得冷却目标（只加热不冷却） */
  var cf = g.idx(3, 6), hs = g.idx(4, 6);
  g.element[cf] = E.FIRE; g.temp[cf] = 20; g.nextTemp[cf] = 20;
  g.element[hs] = E.STONE; g.temp[hs] = 100; g.nextTemp[hs] = 100;
  Thermal.contactFlux(g);
  assertNear(g.nextTemp[s] - 20, kF * (600 - 20), 1e-3, '火焰接触传热量应 = FIRE.CONTACT_K×(T_src−T_dst)');
  assertNear(g.nextTemp[m] - 20, kG * (300 - 20), 1e-3, '热气体对流传热量应 = GAS_CONTACT_K×(T_src−T_dst)');
  assert(g.nextTemp[s] < 600 && g.nextTemp[m] < 300, '传热不得越过热源温度');
  assert(g.nextTemp[hs] === 100, '源温 ≤ 目标温时必须跳过（只加热不冷却），实得 ' + g.nextTemp[hs]);
});

/* ============================================================
   V13 — v1.4.0：植物横向（藤蔓）生长（B1）
   依据：Dan-Ball Powder Game 的 Vine「only grows sideways and up, never down」
   —— 只向侧上生长。本作模型 = **贴地蔓（stolon）**：贴着基底侧向延伸、
   本身不向上抽枝；向上长高仍由直立茎依水完成。红线：着根 + 有水 + 发起格贴地。
   详见 docs/PLANT-MODEL.md「横向/藤蔓生长（v1.4.0）」。
   ============================================================ */
test('V13. 植物（藤蔓）横向蔓延 + 主柱长高（v1.4.0 B1 / v1.4.3 改用直接绘制）', function () {
  var eng = Engine.create({ w: 80, h: 80, seed: 1337 }), g = eng.grid;
  fillBox(g, 0, 76, 79, 79, E.WALL);                   // 地板
  fillBox(g, 20, 74, 59, 75, E.SOIL);                  // 土床
  fillBox(g, 34, 72, 41, 73, E.WATER);                 // 邻接水源（在 PLANT 的 WATER_REACH 内）
  g.setEl(30, 73, E.PLANT); g.setEl(31, 73, E.PLANT);  // v1.4.3：直接绘制 PLANT（藤蔓元素）
  var tallest = 0;
  for (var t = 1; t <= 1200; t++) {
    eng.step();
    for (var x = 0; x < g.w; x++) {
      var c = 0;
      for (var y = 0; y < g.h; y++) if (g.element[g.idx(x, y)] === E.PLANT) c++;
      if (c > tallest) tallest = c;
    }
  }
  /* 横向宽度：被 PLANT 占据的列数（贴地蔓沿土床蔓延） */
  var cols = 0, minX = 1e9, maxX = -1, nPlant = 0;
  for (var x2 = 0; x2 < g.w; x2++) {
    var c2 = 0;
    for (var y2 = 0; y2 < g.h; y2++) if (g.element[g.idx(x2, y2)] === E.PLANT) c2++;
    if (c2 > 0) { cols++; nPlant += c2; if (x2 < minX) minX = x2; if (x2 > maxX) maxX = x2; }
  }
  var width = cols ? maxX - minX + 1 : 0;
  assert(tallest >= 8, '1200 tick 内株高应 ≥8（向上生长 GROW_P=0.08），实得 ' + tallest);
  assert(width >= 6, '1200 tick 内横向宽度应 ≥6（贴地蔓 VINE_P=0.03），实得 ' + width);
  assert(count(g, E.DUST) === 0, '断水只休眠不枯死：不应产生 DUST，实得 ' + count(g, E.DUST));
});

/* ============================================================
   V14 — v1.4.0：EMBER「永燃火种」（B2，第 31 号元素）
   用户诉求"点一下火就可以一直在那里烧"：静态固体热源，恒 900°C，
   持续点燃邻接可燃物；不耗氧、不灭、不被水浇灭（R1 只对 FIRE 生效）；
   爆炸中幸存（explosionPass 豁免，同 WALL）。
   ============================================================ */
test('V14. EMBER 永燃火种：点燃邻木 / 长燃不熄 / 可当炉子 / 爆炸不毁（v1.4.0 B2）', function () {
  /* (a) EMBER 邻木料 → 120 tick 内木料被点燃烧掉 */
  var eng = Engine.create({ w: 40, h: 40, seed: 1337 }), g = eng.grid;
  for (var x = 0; x < 40; x++) g.setEl(x, 39, E.WALL, P.AMBIENT_T);
  var ei = g.idx(10, 30);
  g.setEl(10, 30, E.EMBER); g.temp[ei] = 900; g.nextTemp[ei] = 900;
  g.setEl(11, 30, E.WOOD, P.AMBIENT_T);
  var ignited = -1;
  for (var t = 1; t <= 120; t++) {
    eng.step();
    if (count(g, E.WOOD) === 0 && count(g, E.FIRE) > 0) { ignited = t; break; }
    if (count(g, E.WOOD) === 0 && t > 60) { ignited = t; break; }
  }
  assert(count(g, E.WOOD) === 0, 'EMBER 邻接的木料应在 120 tick 内被点燃烧掉，实得残留 ' + count(g, E.WOOD));
  assert(ignited >= 0, '木料应被点燃（出现 FIRE）');

  /* (b) 600 tick 后 EMBER 仍在且温度 ≥850（长燃不熄、恒温钳制） */
  for (var t2 = ignited + 1; t2 <= 600; t2++) eng.step();
  assert(count(g, E.EMBER) === 1, '600 tick 后 EMBER 应仍在，实得 ' + count(g, E.EMBER));
  assert(g.temp[ei] >= 850, 'EMBER 温度应被钳制在 900°C（≥850），实得 ' + g.temp[ei].toFixed(1));

  /* (c) EMBER 邻水 → 300 tick 内水温 ≥60°C（可当炉子） */
  var e2 = Engine.create({ w: 40, h: 40, seed: 1337 }), g2 = e2.grid;
  for (var x2 = 0; x2 < 40; x2++) for (var y2 = 36; y2 < 40; y2++) g2.setEl(x2, y2, E.WALL, P.AMBIENT_T);
  fillBox(g2, 12, 32, 16, 35, E.WATER);                // 一小池水
  var ei2 = g2.idx(10, 33);
  g2.setEl(10, 33, E.EMBER); g2.temp[ei2] = 900; g2.nextTemp[ei2] = 900;
  var maxW = 0;
  for (var t3 = 1; t3 <= 300; t3++) {
    e2.step();
    for (var j = 0; j < g2.n; j++) if (g2.element[j] === E.WATER && g2.temp[j] > maxW) maxW = g2.temp[j];
  }
  assert(maxW >= 60, 'EMBER 邻水 300 tick 内水温应 ≥60°C（当炉子用），实得 ' + maxW.toFixed(1));
  assert(count(g2, E.EMBER) === 1, '水不应浇灭 EMBER（永燃），实得 ' + count(g2, E.EMBER));

  /* (d) 爆炸不销毁 EMBER（TNT 仍可被它引爆） */
  var e3 = Engine.create({ w: 48, h: 32, seed: 1337 }), g3 = e3.grid;
  for (var x3 = 0; x3 < 48; x3++) g3.setEl(x3, 31, E.WALL, P.AMBIENT_T);
  var ei3 = g3.idx(20, 30);
  g3.setEl(20, 30, E.EMBER); g3.temp[ei3] = 900; g3.nextTemp[ei3] = 900;
  g3.setEl(21, 30, E.TNT, P.AMBIENT_T);
  for (var t4 = 1; t4 <= 600; t4++) e3.step();
  assert(count(g3, E.TNT) === 0, 'EMBER（900°C ≥ TNT 自燃点）应经 adjHot 引爆炸药，实得残留 ' + count(g3, E.TNT));
  assert(count(g3, E.EMBER) === 1, '爆炸不应销毁 EMBER（同 WALL 豁免），实得 ' + count(g3, E.EMBER));
});

/* ============================================================
   v1.4.1：液体表面流 / 分子色差 / 火种动效 / 茎秆导水
   ============================================================ */
test('V19. 倒水入池不堆塔：液体表面流（用户反馈「水像沙子一样堆在那里」）', function () {
  /* 场景 A：往水平池面上倒 5×5 水 —— 旧实现（stalled 一票否决侧移）300 tick 后仍留 6 格高塔 */
  var eA = Engine.create({ w: 80, h: 60, seed: 1337 }), gA = eA.grid;
  for (var x = 0; x < gA.w; x++) for (var y = gA.h - 3; y < gA.h; y++) gA.setEl(x, y, E.WALL);
  for (var x2 = 10; x2 <= 69; x2++) for (var y2 = 40; y2 <= gA.h - 4; y2++) gA.setEl(x2, y2, E.WATER);
  for (var x3 = 38; x3 <= 42; x3++) for (var y3 = 30; y3 <= 35; y3++) gA.setEl(x3, y3, E.WATER);  // 倒在池面中央
  var worst = 0;
  for (var t = 1; t <= 300; t++) {
    eA.step();
    if (t < 60) continue;                                      // 前 60 tick 是空中下落过程，不算"堆"
    for (var xx = 10; xx <= 69; xx++) {                       // 池面（y=40）以上最多堆几格
      var top = -1;
      for (var yy = 0; yy < gA.h; yy++) if (gA.element[gA.idx(xx, yy)] === E.WATER) { top = yy; break; }
      if (top >= 0 && 40 - top > worst) worst = 40 - top;
    }
  }
  assert(worst <= 2, '倒在水面上的水应铺平（堆高 ≤2 格），实得 ' + worst + ' 格');
  /* 场景 B：油倒在水面上应铺成薄膜（旧实现油堆 6 格塔且完全不动） */
  var eB = Engine.create({ w: 80, h: 60, seed: 1337 }), gB = eB.grid;
  for (var x4 = 0; x4 < gB.w; x4++) for (var y4 = gB.h - 3; y4 < gB.h; y4++) gB.setEl(x4, y4, E.WALL);
  for (var x5 = 10; x5 <= 69; x5++) for (var y5 = 40; y5 <= gB.h - 4; y5++) gB.setEl(x5, y5, E.WATER);
  for (var x6 = 38; x6 <= 42; x6++) for (var y6 = 30; y6 <= 35; y6++) gB.setEl(x6, y6, E.OIL);
  var oilCols = 0;
  for (var t2 = 1; t2 <= 300; t2++) eB.step();
  for (var x7 = 10; x7 <= 69; x7++) for (var y7 = 35; y7 < 45; y7++) if (gB.element[gB.idx(x7, y7)] === E.OIL) { oilCols++; break; }
  assert(oilCols >= 10, '油倒在水面上应铺成薄膜（≥10 列有油），实得 ' + oilCols + ' 列');
});

test('V20. 分子色差：tint 随粒子搬行，水/oil 取五档色阶', function () {
  var e1 = Engine.create({ w: 40, h: 40, seed: 1337 }), g1 = e1.grid;
  /* ① 直查：swap 必须连 tint 一起换 */
  g1.setEl(5, 5, E.WATER); g1.setEl(5, 6, 1);
  var tA = g1.tint[g1.idx(5, 5)], tB = g1.tint[g1.idx(5, 6)];
  g1.swap(g1.idx(5, 5), g1.idx(5, 6));
  assert(g1.tint[g1.idx(5, 6)] === tA && g1.tint[g1.idx(5, 5)] === tB, 'swap 应携带 tint');
  /* ② 落地验证：一柱水自由下落，色号整体下移（tint 跟着粒子走而非钉在格子上） */
  var e2 = Engine.create({ w: 40, h: 40, seed: 1337 }), g2 = e2.grid;
  for (var x = 0; x < g2.w; x++) for (var y = g2.h - 2; y < g2.h; y++) g2.setEl(x, y, E.WALL);
  for (var y2 = 8; y2 <= 12; y2++) g2.setEl(20, y2, E.WATER);
  var tintAt = function (gy) { return g2.tint[g2.idx(20, gy)]; };
  var before = [];
  for (var y3 = 8; y3 <= 12; y3++) before.push(tintAt(y3));
  for (var t = 1; t <= 30; t++) e2.step();                    // 水柱落到池底并停住
  var moved = 0;
  for (var y4 = 13; y4 <= 17; y4++) {                         // 下落 5 格后原色号应出现在下方
    for (var b = 0; b < before.length; b++) if (tintAt(y4) === before[b]) moved++;
  }
  assert(moved >= 3, '水柱下落后原色号应跟随粒子出现在新位置（≥3 个），实得 ' + moved);
  /* ③ 五档色阶表齐备且同色相（ION 表已建） */
  var Pal = YS.Palette;
  assert(Pal.ION[E.WATER] === 1 && Pal.ION[E.OIL] === 1, 'WATER/OIL 应标记为 ION');
  var k = E.WATER * 5, distinct = {};
  for (var s = 0; s < 5; s++) distinct[Pal.ION_R[k + s] + ',' + Pal.ION_G[k + s] + ',' + Pal.ION_B[k + s]] = 1;
  assert(Object.keys(distinct).length === 5, 'ION 五档色阶应互不相同');
});

test('V21. 永燃火种动效：EMBER 三档闪烁（用户反馈「完全没有动效」）', function () {
  var Pal = YS.Palette;
  var seen = {};
  for (var t = 0; t < 40; t++) seen[Pal.shadeIndex(10, 10, E.EMBER, t, false)] = 1;
  assert(Object.keys(seen).length >= 2, 'EMBER  shadeIndex 应随 animTime 变化（≥2 档），实得 ' + Object.keys(seen).length + ' 档');
});

test('V22. 茎秆导水：浇在植物头顶的水算供水且被消耗（用户反馈「浇水浇不下去，植物就不长了」）', function () {
  /* 构造：石地板上一段 PLANT 茎（根区周围**无水**），只在**顶部**泼水 ——
   * 旧模型下根区够不着水 → 整株休眠（用户实测）；茎秆导水后应继续生长并消耗这些水。 */
  var eng = Engine.create({ w: 60, h: 80, seed: 1337 }), g = eng.grid;
  fillBox(g, 0, 77, 59, 79, E.STONE);                    // 地板
  for (var y = 70; y <= 76; y++) g.setEl(30, y, E.PLANT); // 7 格高的 PLANT 茎（底部 76 着地）
  var topY0 = 70;
  var w0 = count(g, E.WATER);                             // 根区无水（=0）
  for (var y2 = topY0 - 5; y2 <= topY0 - 1; y2++) g.setEl(30, y2, E.WATER);   // 只在头顶泼水
  var grew = 0, wMin = 1e9;
  for (var t = 1; t <= 500; t++) {
    eng.step();
    if (t % 50 === 0) { var c = count(g, E.WATER); if (c < wMin) wMin = c; }
    for (var y3 = 0; y3 < topY0; y3++) if (g.element[g.idx(30, y3)] === E.PLANT) { grew = topY0 - y3; break; }
  }
  assert(grew >= 3, '浇在头顶的水应经茎秆导水支持生长（再长 ≥3 格），实得 ' + grew + ' 格');
  assert(wMin < w0 + 5, '头顶的浇灌水应被生长消耗（水量下降），实得 min=' + wMin + ' vs 浇后=' + (w0 + 5));
});

test('V23. ★种子长成"树"：木质树干 + 随机抽枝 + 树叶（原版机制，用户要求）', function () {
  /* 依据原版 Powder Game / Powder Toy：SEED 浇水后长成树，**树干/树枝 = WOOD**（烧得慢）、
   * **树叶 = PLANT**（烧得快），树的大小由种子吸收的水量决定，树枝随机抽枝（±45°/0°/±90°）。 */
  var eng = Engine.create({ w: 90, h: 110, seed: 1337 }), g = eng.grid;
  fillBox(g, 20, 94, 69, 105, E.SOIL);
  g.setEl(45, 93, E.SEED);
  fillBox(g, 40, 88, 50, 92, E.WATER);                 // 浇在种子上的一小片水
  var trunk = 0, branch = 0, inert = 0, leaf = 0, minY = 999, maxY = -1, minX = 999, maxX = -1;
  for (var t = 1; t <= 1500; t++) eng.step();
  for (var y = 0; y < g.h; y++) for (var x = 0; x < g.w; x++) {
    var i = g.idx(x, y), e = g.element[i], l = g.latent[i];
    if (e === E.WOOD) { if (l === 1) trunk++; else if (l === 2) branch++; else inert++; }
    if (e === E.PLANT && l === 2) leaf++;
    if (e === E.WOOD || e === E.PLANT) {
      if (y < minY) minY = y; if (y > maxY) maxY = y; if (x < minX) minX = x; if (x > maxX) maxX = x;
    }
  }
  var hTree = maxY - minY + 1, wTree = maxX - minX + 1, wood = trunk + branch + inert;
  assert(wood >= 5, '种子吸够水后应长出木质树干/树枝（WOOD ≥5 格），实得 ' + wood);
  assert(leaf >= 5, '树上应有树叶（PLANT latent=2 ≥5 格），实得 ' + leaf);
  assert(hTree >= 8, '树高应 ≥8 格，实得 ' + hTree);
  assert(wTree >= 3, '树冠应有横向分叉（包围盒宽 ≥3），实得 ' + wTree);
  assert(count(g, E.DUST) === 0, '树不得枯死变灰尘，实得 DUST=' + count(g, E.DUST));
});

test('V24. ★蒸汽温度连贯：蒸汽恒 ≥100 °C、凝出的水是热的、不必从 20 °C 重新加热（v1.5.1）', function () {
  /* 用户原话：「还有一堆只有 20 度的水蒸气 … 我要求你把它变为水蒸气是一百度以上的，
   *          等冷到什么温度才会落下去，就是要水的温度是有连贯性的，
   *          不然上去后马上又下来又要从 20 度再加温，这是有问题的。」
   * 根因（_diag_steam.js 实测）：气-气导热走体积热容公式被钳到 CONDUCT_R_MAX=0.2，
   * 等于"气体之间瞬间均温" → 单格 100 °C 蒸汽 1 tick 掉到 67.9 °C、10 tick 掉到 20 °C。
   * 修法：①气体热惯性 GAS_GAS_R（气-气不再瞬间均温）；②凝结改温度驱动 + 潜热平台；
   *      ③删除低于 100 °C 的表面蒸发路径（蒸汽只能由沸腾产生）。 */

  /* (1) 蒸汽必须"热"：底部加热的水柱里，整个过程中不得出现 <60 °C 的蒸汽
   *     （旧模型实测：600 tick 时 178 格蒸汽里有 159 格低于 40 °C）。 */
  var eng = Engine.create({ w: 40, h: 90, seed: 1337 }), g = eng.grid;
  fillBox(g, 0, 86, 39, 89, E.STONE);
  fillBox(g, 12, 60, 27, 85, E.WATER);
  fillBox(g, 14, 84, 25, 85, E.EMBER);                  // 底部热源
  /* v1.6.0：指标由"瞬时最多几格冷蒸汽"改为**全程冷蒸汽占比** —— 潜热预算耗尽的蒸汽
   * 在凝结前会有 1-3 tick 的过冷瞬态（物理上它已经不再是蒸汽，只是同一帧还没完成相变），
   * 用占比衡量才是"蒸汽整体是否始终是热的"的正确指标（旧模型：169 格长期悬浮 = 占比 90%+）。 */
  var coldSamples = 0, seenSteam = 0, maxSteamT = 0;
  for (var t = 1; t <= 900; t++) {
    eng.step();
    if (t % 10 === 0) {
      for (var i = 0; i < g.n; i++) if (g.element[i] === E.STEAM) {
        seenSteam++;
        if (g.temp[i] > maxSteamT) maxSteamT = g.temp[i];
        if (g.temp[i] < 60) coldSamples++;
      }
    }
  }
  assert(seenSteam > 200, '本场景应产生可观蒸汽（实得采样累计 ' + seenSteam + ' 格次）');
  assert(coldSamples / seenSteam < 0.03, '冷蒸汽（<60 °C）占比应 <3%（旧模型 90%+），实得 ' +
    (100 * coldSamples / seenSteam).toFixed(1) + '%');
  assert(maxSteamT >= 150, '蒸汽应能显著过热（≥150 °C，显热没有被空气瞬间抽走），实得 ' + maxSteamT.toFixed(0) + ' °C');

  /* (2) 温度连贯：蒸汽凝结出来的水必须是**热的**（潜热平台把温度钉在饱和温度附近） */
  var e2 = Engine.create({ w: 60, h: 60, seed: 1337 }), g2 = e2.grid;
  fillBox(g2, 0, 55, 59, 59, E.STONE);
  putSteam(g2, 25, 45, 34, 50, 100);
  var firstWaterT = -1;
  for (var t2 = 1; t2 <= 400; t2++) {
    e2.step();
    if (firstWaterT < 0) {
      for (var m = 0; m < g2.n; m++) if (g2.element[m] === E.WATER) { firstWaterT = g2.temp[m]; break; }
    }
  }
  assert(firstWaterT >= 80, '初次凝结出的水应 ≈ 饱和温度（≥80 °C，温度连贯），实得 ' +
    (firstWaterT < 0 ? '无水' : firstWaterT.toFixed(1) + ' °C'));

  /* (3) 生成端：低于 100 °C 的水不得产生蒸汽；≥100 °C 才产，且产物温度 ≥100 °C */
  var e3 = Engine.create({ w: 40, h: 40, seed: 1337 }), g3 = e3.grid;
  fillBox(g3, 0, 36, 39, 39, E.STONE);
  fillBox(g3, 10, 30, 29, 35, E.WATER);
  for (var w1 = 0; w1 < g3.n; w1++) if (g3.element[w1] === E.WATER) { g3.temp[w1] = 90; g3.nextTemp[w1] = 90; }
  for (var t3 = 0; t3 < 300; t3++) {
    e3.step();
    for (var q = 0; q < g3.n; q++) if (g3.element[q] === E.WATER) { g3.temp[q] = 90; g3.nextTemp[q] = 90; }
  }
  assert(count(g3, E.STEAM) === 0, '90 °C 的水不得产生蒸汽（表面蒸发路径已删除），实得 ' +
    count(g3, E.STEAM) + ' 格');
  var e4 = Engine.create({ w: 40, h: 40, seed: 1337 }), g4 = e4.grid;
  fillBox(g4, 0, 36, 39, 39, E.STONE);
  fillBox(g4, 10, 30, 29, 35, E.WATER);
  for (var w2 = 0; w2 < g4.n; w2++) if (g4.element[w2] === E.WATER) { g4.temp[w2] = 120; g4.nextTemp[w2] = 120; }
  /* 判据加在**仍持有潜热预算**（latent > 0）的蒸汽格上 —— 那是"还是饱和蒸汽"的状态；
   * 预算已耗尽（latent == 0）的格子处于"即将凝结"的过冷瞬态，下一个判据（占比<3%）管它。
   * 注意不能用"本 tick 新出现的格"来判定：蒸汽会移动，旧蒸汽飘到新格子也会被误判为新生成
   * （实测这个坑让读数假报 86.9 °C）。 */
  var minWetSteamT = 1e9, wetCount = 0;
  for (var t4 = 0; t4 < 60; t4++) {
    e4.step();
    for (var q2 = 0; q2 < g4.n; q2++) {
      if (g4.element[q2] === E.STEAM && g4.latent[q2] > 0) {
        wetCount++;
        if (g4.temp[q2] < minWetSteamT) minWetSteamT = g4.temp[q2];
      }
    }
    for (var q3 = 0; q3 < g4.n; q3++) if (g4.element[q3] === E.WATER) { g4.temp[q3] = 120; g4.nextTemp[q3] = 120; }
  }
  assert(count(g4, E.STEAM) > 0, '120 °C 的水应产生蒸汽');
  assert(wetCount > 0, '60 tick 内应有带潜热的蒸汽（实得 ' + wetCount + ' 格次）');
  /* 公差说明：engine.step 的顺序是 transitions → relax → commitTemp，沸腾刚写下的 100.0 °C
   * 会被随后的一次环境弛豫拉走 0.0006×80 ≈ 0.05 °C，故读数约 99.9 °C。
   * 断言取 ≥99.5（本质是"≥100 °C"，容一个 tick 的弛豫）；旧模型同期读数是 20–70 °C。 */
  assert(minWetSteamT >= 99.5, '仍持潜热的蒸汽温度必须 ≥100 °C（容 1 tick 弛豫），实得最低 ' + minWetSteamT.toFixed(1) + ' °C');
});

test('V25. ★热交换闭环：蒸汽加热空气 → 凝结高度抬升 → 水落回锅（自设实验固化，v1.6.0）', function () {
  /* 用户要求：「自己设计几个模拟现实生活中的小实验（尤其是烧开水），并先想出答案和现象。
   * 再看看能不能顺利通过自己的考验。」——本测试是 _diag_heatcycle.js 那组实验的固化版。
   * 三条现实预期：
   *   ① **蒸汽必须能把空气加热**：持续沸腾后上部空气应显著高于室温（否则"空气不能被蒸汽加热"）；
   *   ② **凝结高度必须随空气变暖而抬升**：后段的"羽流通常最高能到的位置"应比前段明显更高
   *      （否则就是用户看到的"永远一堵墙"）；
   *   ③ **水循环闭合**：持续沸腾 3600 tick 后锅内仍应有可观的水（蒸汽凝回），而不是全跑光。
   *
   * ② 的指标选型（_diag_v25cal.js 实测校准，三个窗口 t=600-1200 / 1200-2400 / 2400-3600）：
   *   中位数 122→115→111（只抬 11 格，量的是密集区，不敏感）；
   *   **10% 分位 83→71→67（抬 16 格）** ← 取它：语义正是"墙的高度"（羽流通常最高能到哪）；
   *   最靠上 51→35→36（受单个离散格影响，噪声大）。 */
  var eng = Engine.create({ w: 80, h: 180, seed: 1337 }), g = eng.grid;
  fillBox(g, 0, 176, 79, 179, E.STONE);
  fillBox(g, 24, 170, 55, 171, E.METAL);            // 锅底
  fillBox(g, 24, 155, 25, 170, E.METAL);            // 左壁
  fillBox(g, 54, 155, 55, 170, E.METAL);            // 右壁
  fillBox(g, 26, 156, 53, 169, E.WATER);            // 锅内的水
  fillBox(g, 20, 172, 60, 175, E.EMBER);            // 持续热源（永燃火种 = 炉子）
  var w0 = count(g, E.WATER);
  var prev = new Uint8Array(g.n);
  var early = [], late = [];
  for (var t = 1; t <= 3600; t++) {
    eng.step();
    for (var i = 0; i < g.n; i++) {
      var now = (g.element[i] === E.STEAM) ? 1 : 0;
      if (prev[i] === 1 && now === 0 && g.element[i] === E.WATER) {
        var y = (i / g.w) | 0;
        if (t > 600 && t <= 1200) early.push(y);        // 前段（上方空气还冷）
        else if (t > 2400) late.push(y);                // 后段（空气已被蒸汽加热）
      }
      prev[i] = now;
    }
  }
  var sU = 0, cU = 0, sM = 0, cM = 0;
  for (var y2 = 0; y2 < 120; y2++) {
    for (var x2 = 0; x2 < g.w; x2++) {
      var j = y2 * g.w + x2;
      if (g.element[j] !== 1) continue;
      if (y2 < 60) { sU += g.temp[j]; cU++; } else { sM += g.temp[j]; cM++; }
    }
  }
  var upper = sU / cU, mid = sM / cM;
  early.sort(function (a, b) { return a - b; });
  late.sort(function (a, b) { return a - b; });
  var earlyP10 = early.length ? early[(early.length * 0.1) | 0] : -1;
  var lateP10 = late.length ? late[(late.length * 0.1) | 0] : -1;
  var wet = count(g, E.WATER);

  assert(upper >= 35, '① 上部空气（0-60 行）应被蒸汽加热到 ≥35 °C（室温 20），实得 ' +
    upper.toFixed(1) + ' °C');
  assert(mid >= 50, '① 中上部空气（60-120 行）应被加热到 ≥50 °C，实得 ' + mid.toFixed(1) + ' °C');
  assert(early.length > 50 && late.length > 50, '① 两个统计窗都应有足够的凝结事件（前 ' +
    early.length + ' / 后 ' + late.length + '）');
  assert(lateP10 < earlyP10 - 10, '② 后段"羽流最高能到的位置"（y 越小越靠上，10% 分位 ' + lateP10 +
    '）应比前段（' + earlyP10 + '）抬升 ≥10 格 —— 否则就是"永远一堵墙"');
  assert(wet >= w0 * 0.3, '③ 持续沸腾后锅内应仍有 ≥30% 的水（水循环闭合），实得 ' +
    wet + '/' + w0);
});

/* ============================================================
   V26 — v1.6.1：水源泉「持续产出 + 活体上限」长跑（Phase 1）
   ============================================================ */
test('V26. ★水源泉长跑 20000 tick：持久出水不永久停 + WATER ≤ LIVE_MAX（v1.6.1）', function () {
  /* 用户原话：「水源泉等方块，只会给一会儿水，根本不持久。」
   * 旧模型：累计配额 1500 格 → 单水源泉约 9000 tick（1500 × EMIT_INTERVAL=6）就产满、
   * 之后**永久停喷**，窗口 4/5 产出为 0。新模型（活体上限 LIVE_MAX=6000）下，
   * 只要未达上限就持续产出 —— 单水源泉 20000 tick 累计约 3333 格（< 6000，不触发上限），
   * 因此每个窗口都应有产出。
   *
   * 实测（64×64、单水源泉、本机 Node）：20000 tick 用时约 **11.4 s**；
   * 分窗口产出（每 4000 tick）= 666 / 667 / 667 / 666 / 667；末态 WATER=3333（≤ LIVE_MAX）。
   * 画布尺寸取 64×64=4096 格：足够容纳峰值 3333 格水而不淹没水源泉（池面 y≈12，泉在 y=1）。 */
  var eng = Engine.create({ w: 64, h: 64, seed: 1337 }), g = eng.grid;
  g.setEl(32, 1, E.SPRING);                       // 顶部单水源泉，水自然下落汇聚在底部
  var windows = [], last = 0;
  for (var t = 1; t <= 20000; t++) {
    eng.step();
    if (t % 4000 === 0) { windows.push(eng.springCreated - last); last = eng.springCreated; }
  }
  assert(windows.length === 5, '应有 5 个统计窗口，实得 ' + windows.length);
  assert(windows[3] > 0 && windows[4] > 0,
    '第 4/5 个窗口仍应有产出（不永久停喷），实得 [' + windows.join(', ') + ']');
  assert(count(g, E.WATER) <= YS.Balance.SPRING.LIVE_MAX,
    'WATER 不应超过 LIVE_MAX，实得 ' + count(g, E.WATER));
  assert(eng.springCreated >= 3000, '20000 tick 累计产出应达数千格，实得 ' + eng.springCreated);
});

/* ============================================================
   V27 — v1.6.1：气流可视化 flowDir（Phase 2，原设计 C5）
   ============================================================ */
test('V27. ★气流可视化：flowDir 记录气体位移方向 / 会过期 / 液体粉末不写（v1.6.1）', function () {
  /* 复刻渲染器的 showFlow 判据：flowDir≠0 且 (tickId - moveStamp) ≤ 10 且该格为气体（含 AIR）。
   * 位标 1=E 2=W 4=N 8=S。三条断言对应任务书 V27 的 ①②③。 */
  var ELS = El.ELEMENTS;
  var FRESH = 10;
  function freshFlow(g) {
    var c = 0;
    for (var i = 0; i < g.n; i++) {
      if (g.flowDir[i] !== 0 && (g.tickId - g.moveStamp[i]) <= FRESH && ELS[g.element[i]].state === 'gas') c++;
    }
    return c;
  }
  function anyFlow(g) {
    var c = 0;
    for (var i = 0; i < g.n; i++) if (g.flowDir[i] !== 0) c++;
    return c;
  }

  /* ① 热源上方空气上升 → 该区域出现 flowDir 位标（≥20 格） */
  var e1 = Engine.create({ w: 64, h: 64, seed: 1337 }), g1 = e1.grid;
  for (var x = 28; x < 36; x++) g1.setEl(x, 50, E.EMBER);      // 一排永燃火种加热底部空气
  for (var t = 0; t < 80; t++) e1.step();
  var above = 0;
  for (var y = 0; y < 50; y++) for (var x2 = 0; x2 < 64; x2++) {
    if (g1.flowDir[g1.idx(x2, y)] !== 0) above++;
  }
  assert(above >= 20, '热源上方应出现 ≥20 格 flowDir 位标，实得 ' + above);
  assert(freshFlow(g1) > 0, '应存在"新鲜"气流位标（tickId - moveStamp ≤ 10）');

  /* ② 位标会"过期"：撤去热源 + 全场复位环境温 → 空气停止运动，30 tick 后无"新鲜"位标可渲染 */
  var e2 = Engine.create({ w: 48, h: 48, seed: 1337 }), g2 = e2.grid;
  for (var x3 = 20; x3 < 28; x3++) g2.setEl(x3, 40, E.EMBER);
  for (var t2 = 0; t2 < 60; t2++) e2.step();
  var fActive = freshFlow(g2);
  for (var i = 0; i < g2.n; i++) { g2.element[i] = 1; g2.temp[i] = 20; g2.nextTemp[i] = 20; g2.latent[i] = 0; }
  for (var t3 = 0; t3 < 30; t3++) e2.step();
  assert(fActive > 0, '热源活动期应存在新鲜位标，实得 ' + fActive);
  assert(freshFlow(g2) === 0, '30 tick 前的位标不应再被渲染计数（过期），实得 ' + freshFlow(g2));

  /* ③ 液体/粉末移动不写 flowDir（水柱下落反例） */
  var e3 = Engine.create({ w: 40, h: 40, seed: 1337 }), g3 = e3.grid;
  for (var x4 = 0; x4 < 40; x4++) for (var y2 = 38; y2 < 40; y2++) g3.setEl(x4, y2, E.WALL);
  for (var y3 = 5; y3 <= 15; y3++) g3.setEl(20, y3, E.WATER);   // 一柱水自由下落
  var top0 = 5;
  for (var t4 = 0; t4 < 30; t4++) e3.step();
  var top1 = -1;
  for (var y4 = 0; y4 < 40; y4++) if (g3.element[g3.idx(20, y4)] === E.WATER) { top1 = y4; break; }
  assert(top1 > top0, '水柱应确实下落（否则反例为空），顶格 y ' + top0 + ' → ' + top1);
  assert(anyFlow(g3) === 0, '液体/粉末移动不得写 flowDir（仅气体写），实得 ' + anyFlow(g3));
});

/* ============================================================
   V28–V31 — v1.6.1：压强系统（Phase 3，docs/PRESSURE-MODEL.md）
   ============================================================ */

/* 共享：构造 80×80 石地板 + 1 格厚矩形盒（x 25-55 / y 30-50，内部 AIR） */
function p3Box(g, mat, withHeat) {
  for (var x = 0; x < g.w; x++) for (var y = 78; y < 80; y++) g.setEl(x, y, E.STONE);
  for (var a = 25; a <= 55; a++) { g.setEl(a, 30, mat); g.setEl(a, 50, mat); }
  for (var b = 30; b <= 50; b++) { g.setEl(25, b, mat); g.setEl(55, b, mat); }
  if (withHeat) { g.setEl(30, 49, E.EMBER); g.setEl(40, 49, E.EMBER); g.setEl(50, 49, E.EMBER); }
}
function p3BBox(g, id) {
  var mnx = 1e9, mxx = -1, mny = 1e9, mxy = -1, c = 0;
  for (var i = 0; i < g.n; i++) if (g.element[i] === id) {
    c++; var x = i % g.w, y = (i / g.w) | 0;
    if (x < mnx) mnx = x; if (x > mxx) mxx = x; if (y < mny) mny = y; if (y > mxy) mxy = y;
  }
  return { c: c, w: mxx - mnx + 1, h: mxy - mny + 1, minx: mnx, maxx: mxx, miny: mny, maxy: mxy };
}
/* 跑 N tick，返回首次"某格从 id 变为非 id"（= 屈服事件）的 {t,x,y} */
function p3RunYield(mat, withHeat, ticks) {
  var eng = Engine.create({ w: 80, h: 80, seed: 1337 }), g = eng.grid;
  p3Box(g, mat, withHeat);
  var b0 = p3BBox(g, mat), first = null, prev = new Uint8Array(g.n);
  for (var i = 0; i < g.n; i++) prev[i] = g.element[i];
  for (var t = 1; t <= ticks; t++) {
    eng.step();
    if (!first) {
      for (var q = 0; q < g.n; q++) if (prev[q] === mat && g.element[q] !== mat) {
        first = { t: t, x: q % g.w, y: (q / g.w) | 0 }; break;
      }
    }
    for (var q2 = 0; q2 < g.n; q2++) prev[q2] = g.element[q2];
  }
  return { b0: b0, b1: p3BBox(g, mat), first: first };
}

test('V28. ★压强系统：金属盒受压「慢慢」变形（角部先屈服）+ 无热源对照不变（v1.6.1）', function () {
  /* 用户诉求：「金属绕一个圈，圈内圈外压强不一样 → 慢慢变形成圆形（现实里先在某个地方突出或破掉）」。
   * 机制：盒内 EMBER 加热 → 内压升高 → 金属墙（韧性）向低压侧蠕动 → 外框外扩。
   * 实测：首格（角部）屈服 t≈1648；4000 tick 内金属外框 w 31→33、h 21→24。
   * 注：任务书希望"角部格先于边墙中部屈服"—— 本模型通过 CORNER_K 应力集中系数实现该点
   * （直角处应力集中，压力容器倒圆角正是此理），首格屈服落在盒角。 */
  var r = p3RunYield(E.METAL, true, 4000);
  assert(r.first, '4000 tick 内金属盒应出现屈服（变形），实得无');
  assert(r.first.t >= 800 && r.first.t <= 4000,
    '变形应"慢慢"发生（首格屈服 t 在 800–4000 间），实得 t=' + r.first.t);
  assert(r.b1.w >= r.b0.w + 2 || r.b1.h >= r.b0.h + 2,
    '金属外框宽或高应增大 ≥2 格，实得 w ' + r.b0.w + '→' + r.b1.w + ' h ' + r.b0.h + '→' + r.b1.h);
  var corners = [[25, 30], [55, 30], [25, 50], [55, 50]];
  var isCorner = corners.some(function (c) {
    return Math.abs(c[0] - r.first.x) <= 1 && Math.abs(c[1] - r.first.y) <= 1;
  });
  assert(isCorner, '首格屈服应发生在盒角附近（角部先于边墙中部），实得 (' +
    r.first.x + ',' + r.first.y + ') @t' + r.first.t);
  /* 对照组：同盒无热源 → 4000 tick 不变形、无屈服 */
  var c = p3RunYield(E.METAL, false, 4000);
  assert(!c.first, '无热源时金属盒不应屈服，实得 (' + (c.first && c.first.x + ',' + c.first.y) + ')');
  assert(c.b1.w === c.b0.w && c.b1.h === c.b0.h, '无热源时金属外框尺寸不应变化');
});

test('V29. ★爆炸冲击波：冲压注入 + 向外的气流（v1.6.1）', function () {
  /* TNT 引爆 → explosionPass 向冲击波半径（TNT.RADIUS×2.5=25）内的气体格注入冲压；
   * 60 tick 后：距爆心 12–25 格内应有 ≥10 个 press>0.05 的气体格，且 ≥10 格向外气流标记；
   * 对照（无 TNT）→ 全场 press≈0、无向外气流。 */
  var ELS = El.ELEMENTS;
  function run(withTNT) {
    var eng = Engine.create({ w: 120, h: 80, seed: 1337 }), g = eng.grid;
    for (var x = 0; x < g.w; x++) for (var y = 76; y < 80; y++) g.setEl(x, y, E.STONE);
    var cx = 60, cy = 72;
    if (withTNT) { g.setEl(cx, cy, E.TNT); g.temp[g.idx(cx, cy)] = 600; }
    for (var t = 1; t <= 60; t++) eng.step();
    var press = 0, out = 0, maxP = 0;
    for (var y = 0; y < g.h; y++) for (var x2 = 0; x2 < g.w; x2++) {
      var i = g.idx(x2, y);
      if (g.press[i] > maxP) maxP = g.press[i];
      var dx = x2 - cx, dy = y - cy, d = Math.sqrt(dx * dx + dy * dy);
      if (d < 12 || d > 25) continue;
      var e = g.element[i];
      if (!(ELS[e] && ELS[e].state === 'gas')) continue;
      if (g.press[i] > 0.05) press++;
      var f = g.flowDir[i];
      if (!f) continue;
      if (Math.abs(dx) > Math.abs(dy)) { if (dx > 0 && (f & 1)) out++; else if (dx < 0 && (f & 2)) out++; }
      else { if (dy > 0 && (f & 8)) out++; else if (dy < 0 && (f & 4)) out++; }
    }
    return { press: press, out: out, maxP: maxP };
  }
  var a = run(true);
  assert(a.press >= 10, '距爆心 12–25 内应有 ≥10 个 press>0.05 的气体格，实得 ' + a.press);
  assert(a.out >= 10, '距爆心 12–25 内应有 ≥10 格向外气流标记，实得 ' + a.out);
  var b = run(false);
  assert(b.maxP === 0, '无 TNT 时全场 press 应为 0，实得 max=' + b.maxP);
  assert(b.out === 0, '无 TNT 时不应有向外气流标记，实得 ' + b.out);
});

test('V30. ★压差驱动流动（联动）：盒内顶部缺口出现水平（E/W）气流（v1.6.1）', function () {
  /* 用户诉求：「空气流动也可以做成因为压强的变化所以才变化，就是联动」。
   * 场景：密闭盒（WALL）内一道竖墙把左右隔开、**顶部留缺口**，左侧 EMBER 加热、右侧环境温。
   * 热空气在左侧升到顶、被天花板挡住（无法靠浮力逃逸）→ 压力积累 → 从缺口挤到右侧。
   * 判据①：缺口区出现 E/W 向 flowDir 标记 ≥20 格次/600 tick（任务书 V30 原始判据）；
   * 判据②：其中**纯水平**（只有 E/W 位、无 N/S 位）的 AIR 格 ≥20 格次 —— 这是干净证据：
   *         AIR 不参与 movePass 的水平扩散，纯水平位移只可能来自压强步（压强关掉则恒为 0）。 */
  var ELS = El.ELEMENTS;
  function run(pressureOn) {
    YS.Balance.PRESSURE.ENABLE = pressureOn;
    var eng = Engine.create({ w: 70, h: 60, seed: 1337 }), g = eng.grid;
    function W(x, y) { g.setEl(x, y, E.WALL); }
    for (var x = 8; x <= 61; x++) { W(x, 8); W(x, 56); }
    for (var y = 8; y <= 56; y++) { W(8, y); W(61, y); }
    for (var y2 = 20; y2 <= 55; y2++) W(35, y2);          // 竖墙（顶部 y=9..19 为缺口）
    for (var x2 = 15; x2 <= 25; x2++) for (var y3 = 54; y3 <= 55; y3++) g.setEl(x2, y3, E.EMBER);
    var ewMarks = 0, horizOnly = 0;
    for (var t = 1; t <= 600; t++) {
      eng.step();
      for (var yy = 9; yy <= 19; yy++) for (var xx = 10; xx <= 59; xx++) {
        var i = g.idx(xx, yy);
        if (!g.flowDir[i]) continue;
        if (g.tickId - g.moveStamp[i] > 10) continue;
        var e = g.element[i];
        if (!(ELS[e] && ELS[e].state === 'gas')) continue;
        if (g.flowDir[i] & 3) {                                // 含 E 或 W 位
          ewMarks++;
          if (e === 1 && (g.flowDir[i] & 12) === 0) horizOnly++;   // 纯水平 AIR 位移
        }
      }
    }
    return { ew: ewMarks, horiz: horizOnly };
  }
  var on = run(true);
  assert(on.ew >= 20, '缺口区应有 ≥20 格次 E/W 气流标记，实得 ' + on.ew);
  assert(on.horiz >= 20, '缺口区应有 ≥20 格次"纯水平 AIR"位移（压强驱动证据），实得 ' + on.horiz);
  var off = run(false);
  YS.Balance.PRESSURE.ENABLE = true;                            // 还原全局开关
  assert(off.horiz === 0, '关闭压强系统后不应出现纯水平 AIR 位移，实得 ' + off.horiz);
});

test('V31. 压强系统：WALL（墙）免疫变形（v1.6.1）', function () {
  var r = p3RunYield(E.WALL, true, 4000);
  assert(!r.first, 'WALL 不应屈服，实得 (' + (r.first && r.first.x + ',' + r.first.y) + ')');
  assert(r.b1.c === r.b0.c, 'WALL 格数不应变化（' + r.b0.c + '→' + r.b1.c + '）');
  assert(r.b1.w === r.b0.w && r.b1.h === r.b0.h, 'WALL 外框尺寸不应变化');
});

/* ============================================================
  输出
   ============================================================ */
console.log('\nYuansu Pixel Sandbox — 单元测试\n' + '='.repeat(48));
console.log(lines.join('\n'));
console.log('='.repeat(48));
console.log('结果： ' + passed + ' 通过 / ' + failed + ' 失败 / 共 ' + (passed + failed) + ' 项\n');
process.exit(failed === 0 ? 0 : 1);

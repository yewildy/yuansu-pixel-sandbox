/*
 * tests/run.js — Node 单元测试（零依赖，覆盖 docs/PHYSICS.md §13 守恒与不变量）
 *   运行： node tests/run.js   （或 npm test）
 */
'use strict';

/* ---------- 加载 core（classic wrapper 会在 Node 下填充 globalThis.YS） ---------- */
var path = require('path');
var CORE = ['balance', 'rng', 'elements', 'grid', 'thermal', 'transitions',
  'reactions', 'movement', 'air', 'biology', 'wind', 'engine'];
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
  for (i = 0; i < n; i++) { g.element[i] = 1 + (i % 30); g.temp[i] = (i % 61) * 7 - 100; }
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
  for (i = 0; i < n; i++) { g.element[i] = 1 + (i % 30); g.temp[i] = (i % 61) * 7 - 100; }
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
    // 不变量：每格始终有且仅有一个元素（element ∈ [1,30]，绝不为 0）→ 总格数恒 = n
    for (var i = 0; i < g.n; i++) { var ev = g.element[i]; if (ev < 1 || ev > 30) { okTotal = false; at = t; break; } }
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
  var eng = Engine.create({ w: 24, h: 24, seed: 1337 }), g = eng.grid;
  g.setEl(12, 12, E.WATER); g.temp[g.idx(12, 12)] = 200;
  var n0 = totalCells(g), became = -1;
  for (var t = 0; t < 300; t++) { eng.step(); if (g.element[g.idx(12, 12)] === E.STEAM) { became = t; break; } }
  assert(became >= 0, '水应在 300 tick 内变为蒸汽');
  assert(totalCells(g) === n0, '相变应保持格数不变 (' + n0 + ')');
});

test('3b. 冰 → 水 保持 1 格（融化）', function () {
  var eng = Engine.create({ w: 24, h: 24, seed: 1337 }), g = eng.grid;
  g.setEl(12, 12, E.ICE); g.temp[g.idx(12, 12)] = 10;
  var n0 = totalCells(g), became = -1;
  for (var t = 0; t < 300; t++) { eng.step(); if (g.element[g.idx(12, 12)] === E.WATER) { became = t; break; } }
  assert(became >= 0, '冰应在 300 tick 内融为水');
  assert(totalCells(g) === n0, '相变应保持格数不变');
});

test('3c. 蒸汽 → 水 保持 1 格（冷凝）', function () {
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
    if (e < 1 || e > 30) bad++;
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
test('8a. 元素表：30 种，ID/类别/配色齐全（AIR=id1，group=none 不进面板）', function () {
  assert(El.LIST.length === 30, '应恰有 30 种元素');
  var groups = { solid: 0, powder: 0, liquid: 0, gas: 0, special: 0, none: 0 };
  El.LIST.forEach(function (e) {
    assert(e.id >= 1 && e.id <= 30, 'ID 越界');
    assert(typeof e.base === 'string' && e.base[0] === '#', '缺 base 配色: ' + e.key);
    groups[e.group]++;
  });
  assert(groups.solid === 7 && groups.powder === 8 && groups.liquid === 6 && groups.gas === 4 && groups.special === 4 && groups.none === 1,
    '分组计数错误: ' + JSON.stringify(groups));
  assert(E.AIR === 1 && E.EMPTY === 1, 'AIR/EMPTY 别名应同为 id 1');
  assert(El.get(1).key === 'AIR' && El.get(1).group === 'none', 'id 1 应为 AIR 且 group=none');
});

test('8b. balance 键名与 §14 一致（抽样）', function () {
  var B = YS.Balance;
  assert(B.PHYS.HEAT_COUPLING === 0.005, 'HEAT_COUPLING 应为 0.005（审查 F01）');
  assert(B.PHYS.ENV_RELAX_EMPTY === 0.0005, 'ENV_RELAX_EMPTY 应为 0.0005（AIR.RELAX）');
  assert(B.AIR.SELF_K === 0.5 && B.AIR.RELAX === 0.0005, 'AIR 双轨系数');
  assert(B.PLANT.CAPILLARY_HEAD === 80, 'PLANT.CAPILLARY_HEAD 应为 80（v1.2.0：植物不再枯死，软上限放宽）');
  assert(B.PLANT.MAX_HEIGHT === undefined, 'MAX_HEIGHT 应已删除');
  assert(B.SOIL.MOISTURE_MAX === 200, 'SOIL.MOISTURE_MAX');
  assert(B.PHYS.ENV_RELAX_GAS === 0.0006, 'ENV_RELAX_GAS 应为 0.0006（v1.2.0：蒸汽不再秒冷）');
  assert(B.PHYS.ENV_RELAX_LIQUID === 0.0005, 'ENV_RELAX_LIQUID 应为 0.0005');
  assert(B.PHYS.ENV_RELAX_SOLID === 0.001, 'ENV_RELAX_SOLID 应为 0.001');
  assert(B.WATER.EVAP_P_AT_100 === 0.02, 'EVAP_P_AT_100');
  assert(B.LN2.BOIL_T === -196, 'LN2.BOIL_T');
  assert(B.TNT.RADIUS === 6 && B.TNT.CHAIN_MAX === 8, 'TNT 参数');
  assert(B.CLONE.COPY_INTERVAL === 4 && B.SPRING.EMIT_INTERVAL === 6, '流量参数');
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
  for (var t = 0; t < 400; t++) { eng.step(); if (g.element[g.idx(28, 49)] === E.PLANT) { became = t; break; } }
  assert(became >= 0, '湿土/水旁石面上的种子应在 400 tick 内发芽，实得 ' + became);
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

test('12b. 水源泉配额：累计产水受 SPRING.MAX_CELLS=1500 限制并停喷', function () {
  var eng = Engine.create({ w: 120, h: 60, seed: 1337 }), g = eng.grid;
  for (var x = 0; x < 120; x++) g.setEl(x, 30, E.SPRING);
  for (var t = 0; t < 6000; t++) eng.step();
  var cap = YS.Balance.SPRING.MAX_CELLS;
  assert(eng.springCreated <= cap, '累计产水越过配额：' + eng.springCreated + ' > ' + cap);
  assert(eng.springCreated >= cap * 0.9, '充足场地下应接近配额，实得 ' + eng.springCreated);
  assert(count(g, E.WATER) <= cap, 'WATER 格数不应超过配额');
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
    for (var i = 0; i < g.n; i++) { var e = g.element[i]; if (e < 1 || e > 30) { bad++; at = t; break; } }
    if (bad) break;
  }
  assert(bad === 0, '第 ' + at + ' tick 出现非法元素 id（应恒在 [1,30]）');
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
  var eng = Engine.create({ w: 30, h: 120, seed: 1337 }), g = eng.grid;
  var cx = 15, yTop = 20, yBot = 100, yLight = 60;
  for (var y = yTop; y <= yBot; y++) g.setEl(cx, y, E.WOOD, P.AMBIENT_T);
  g.setEl(cx, yLight, E.FIRE, 600);
  for (var t = 0; t < 1500; t++) eng.step();
  var up = 0; for (var y2 = yLight - 1; y2 >= yTop; y2--) { if (g.element[g.idx(cx, y2)] !== E.WOOD) up++; else break; }
  var down = 0; for (var y3 = yLight + 1; y3 <= yBot; y3++) { if (g.element[g.idx(cx, y3)] !== E.WOOD) down++; else break; }
  assert(up > down, '向上推进 ' + up + ' 应快于向下 ' + down + '（b_dir 上1.5/下0.6）');
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

test('N1-9. 性能：同时 5000 格燃烧，单 tick 增量 ≤1.5 ms', function () {
  var w = 320, h = 180;
  function buildFires() { var eng = Engine.create({ w: w, h: h, seed: 1337 }), g = eng.grid, placed = 0;
    for (var y = 2; y < h && placed < 5000; y++) for (var x = 2; x < w && placed < 5000; x += 3) { var i = g.idx(x, y); g.element[i] = E.FIRE; g.latent[i] = E.WOOD; g.temp[i] = 600; placed++; }
    return eng; }
  function buildEmpty() { return Engine.create({ w: w, h: h, seed: 1337 }); }
  function best(mk) { var b = 1e9; for (var r = 0; r < 3; r++) { var e = mk(); for (var t = 0; t < 5; t++) e.step();
    var t0 = process.hrtime.bigint(); for (var t2 = 0; t2 < 24; t2++) e.step(); var t1 = process.hrtime.bigint();
    var ms = Number(t1 - t0) / 1e6 / 24; if (ms < b) b = ms; } return b; }
  var delta = best(buildFires) - best(buildEmpty);
  assert(delta <= 1.5, '5000 格燃烧增量 ' + delta.toFixed(3) + ' ms/tick（>1.5）');
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
   ⚠ 已知缺陷：默认种子 1337 亦为 0%（见 docs/PAIRWISE-REPORT.md §4.16，Major，待用户决策修复）。
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
    failedSeeds.join(',') + ']（' + good + '/8 可点燃；默认 1337 在列）');
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

test('V4. 金属锅：锅底加热 → 锅内水必须受热（用户反馈③）', function () {
  var eng = Engine.create({ w: 80, h: 80, seed: 1337 }), g = eng.grid;
  fillBox(g, 0, 76, 79, 79, E.STONE);
  fillBox(g, 20, 72, 59, 75, E.LAVA);
  for (var i = 0; i < g.n; i++) if (g.element[i] === E.LAVA) { g.temp[i] = 1200; g.nextTemp[i] = 1200; }
  fillBox(g, 24, 70, 55, 71, E.METAL);          // 锅底
  fillBox(g, 24, 55, 25, 70, E.METAL);          // 左壁
  fillBox(g, 54, 55, 55, 70, E.METAL);          // 右壁
  fillBox(g, 26, 56, 53, 69, E.WATER);          // 锅内的水
  var top = 0, bot = 0, cT = 0, cB = 0;
  for (var t = 1; t <= 600; t++) {
    eng.step();
    if (t === 600) {
      for (var y = 56; y < 70; y++) for (var x = 26; x < 54; x++) {
        var v = g.temp[g.idx(x, y)];
        if (y < 62) { top += v; cT++; } else { bot += v; cB++; }
      }
    }
  }
  var tAvg = top / cT, bAvg = bot / cB;
  assert(bAvg >= 60, '600 tick 后锅底水温应 ≥60°C，实得 ' + bAvg.toFixed(0) +
    '°C（v1.1 恒为 20°C —— 金属导热系数 0.9 与空气热容失真共同导致）');
  assert(Math.abs(tAvg - bAvg) <= 30, '锅内上下层温差应 ≤30°C（热对流把热量搬匀），实得 ' +
    Math.abs(tAvg - bAvg).toFixed(0) + '°C');
});

test('V5. 蒸汽不得"立刻变水滴"：接触成核（用户反馈④）', function () {
  /* (a) 开阔空气中：只会极慢地均相成核，大部分蒸汽保持气态或升到顶部逸出 */
  var e1 = Engine.create({ w: 60, h: 60, seed: 1337 }), g1 = e1.grid;
  fillBox(g1, 0, 55, 59, 59, E.STONE);
  fillBox(g1, 25, 50, 34, 54, E.STEAM);
  for (var a = 0; a < g1.n; a++) if (g1.element[a] === E.STEAM) { g1.temp[a] = 40; g1.nextTemp[a] = 40; }
  for (var t1 = 0; t1 < 400; t1++) e1.step();
  assert(count(g1, E.WATER) <= 12, '开阔空气中的蒸汽 400 tick 内凝结成水应 ≤12 格，实得 ' +
    count(g1, E.WATER) + '（v1.1 会在 1 秒内整片变成水滴砸下来）');
  /* (b) 贴到冷壁面：应当迅速凝结成水珠（Powder Game 的 CLOUD 行为） */
  var e2 = Engine.create({ w: 60, h: 60, seed: 1337 }), g2 = e2.grid;
  fillBox(g2, 0, 55, 59, 59, E.STONE);
  fillBox(g2, 0, 8, 59, 9, E.STONE);            // 冷天花板
  for (var b = 0; b < g2.n; b++) if (g2.element[b] === E.STONE) { g2.temp[b] = 20; g2.nextTemp[b] = 20; }
  fillBox(g2, 25, 11, 34, 14, E.STEAM);
  for (var c = 0; c < g2.n; c++) if (g2.element[c] === E.STEAM) { g2.temp[c] = 40; g2.nextTemp[c] = 40; }
  for (var t2 = 0; t2 < 400; t2++) e2.step();
  assert(count(g2, E.WATER) >= 15, '贴冷壁的蒸汽 400 tick 内应凝结 ≥15 格水，实得 ' + count(g2, E.WATER));
});

test('V6. 植物：有水就持续生长，且永不枯死（用户反馈⑤）', function () {
  var eng = Engine.create({ w: 128, h: 160, seed: 1337 }), g = eng.grid;
  fillBox(g, 30, 152, 97, 159, E.SOIL);
  fillBox(g, 55, 148, 75, 151, E.WATER);
  g.setEl(64, 151, E.SEED);
  var tallest = 0;
  for (var t = 0; t < 12000; t++) {
    eng.step();
    if (t % 500 === 0) {
      for (var x = 0; x < g.w; x++) {
        var c = 0;
        for (var y = 0; y < g.h; y++) if (g.element[g.idx(x, y)] === E.PLANT) c++;
        if (c > tallest) tallest = c;
      }
    }
  }
  assert(tallest >= 30, '供水充足时植物应持续向上生长 ≥30 格，实得 ' + tallest +
    '（v1.1 因 CAPILLARY_HEAD=30 被硬封顶）');
  assert(count(g, E.DUST) === 0, '植物不得枯死变灰尘，实得 DUST=' + count(g, E.DUST));
  assert(count(g, E.PLANT) >= 30, '12000 tick 后植株应保留，实得 PLANT=' + count(g, E.PLANT));
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
   输出
   ============================================================ */
console.log('\nYuansu Pixel Sandbox — 单元测试\n' + '='.repeat(48));
console.log(lines.join('\n'));
console.log('='.repeat(48));
console.log('结果： ' + passed + ' 通过 / ' + failed + ' 失败 / 共 ' + (passed + failed) + ' 项\n');
process.exit(failed === 0 ? 0 : 1);

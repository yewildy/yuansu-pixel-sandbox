/*
 * tests/run.js — Node 单元测试（零依赖，覆盖 docs/PHYSICS.md §13 守恒与不变量）
 *   运行： node tests/run.js   （或 npm test）
 */
'use strict';

/* ---------- 加载 core（classic wrapper 会在 Node 下填充 globalThis.YS） ---------- */
var path = require('path');
var CORE = ['balance', 'rng', 'elements', 'grid', 'thermal', 'transitions',
  'reactions', 'movement', 'biology', 'wind', 'engine'];
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

test('1b. 导热守恒 Σ T（生产模式，关弛豫）', function () {
  var g = Grid.create(48, 32), n = g.n;
  g.temp = new Float64Array(n); g.nextTemp = new Float64Array(n);
  var i;
  for (i = 0; i < n; i++) { g.element[i] = 1 + (i % 30); g.temp[i] = (i % 61) * 7 - 100; }
  var s0 = 0; for (i = 0; i < n; i++) s0 += g.temp[i];
  Thermal.diffuse(g, {});
  var s1 = 0; for (i = 0; i < n; i++) s1 += g.nextTemp[i];
  assertNear(s1, s0, Math.abs(s0) * 1e-6, 'Σ T 相对误差应 < 1e-6');
});

/* ============================================================
   2. 物质格数单调不增（不含 CLONE / SPRING）
   ============================================================ */
test('2. 纯物理演化 3000 tick 物质格数单调不增', function () {
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

  var prev = totalCells(g), ok = true, at = -1, cur = prev;
  for (var t = 0; t < 3000; t++) {
    eng.step();
    cur = totalCells(g);
    if (cur > prev) { ok = false; at = t; break; }
    prev = cur;
  }
  assert(ok, '物质格数在 tick ' + at + ' 增加（' + prev + ' → ' + cur + '）');
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
test('8a. 元素表：30 种，ID/类别/配色齐全', function () {
  assert(El.LIST.length === 30, '应恰有 30 种元素');
  var groups = { solid: 0, powder: 0, liquid: 0, gas: 0, special: 0 };
  El.LIST.forEach(function (e) {
    assert(e.id >= 1 && e.id <= 30, 'ID 越界');
    assert(typeof e.base === 'string' && e.base[0] === '#', '缺 base 配色: ' + e.key);
    groups[e.group]++;
  });
  assert(groups.solid === 7 && groups.powder === 8 && groups.liquid === 6 && groups.gas === 4 && groups.special === 5,
    '分组计数错误: ' + JSON.stringify(groups));
});

test('8b. balance 键名与 §14 一致（抽样）', function () {
  var B = YS.Balance;
  assert(B.PHYS.HEAT_COUPLING === 0.005, 'HEAT_COUPLING 应为 0.005（审查 F01）');
  assert(B.PHYS.ENV_RELAX_GAS === 0.004, 'ENV_RELAX_GAS 应为 0.004');
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
   输出
   ============================================================ */
console.log('\nYuansu Pixel Sandbox — 单元测试\n' + '='.repeat(48));
console.log(lines.join('\n'));
console.log('='.repeat(48));
console.log('结果： ' + passed + ' 通过 / ' + failed + ' 失败 / 共 ' + (passed + failed) + ' 项\n');
process.exit(failed === 0 ? 0 : 1);

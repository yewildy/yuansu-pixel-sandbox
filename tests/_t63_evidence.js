/*
 * tests/_t63_evidence.js — T6.3 收口复核的证据脚本（严守真 / QA）
 * 用途：独立复现 docs/PAIRWISE-REPORT.md 本轮更新所引用的全部数字。
 * 运行： node tests/_t63_evidence.js
 * 不改动 src/ 与任何既有测试。仅打印数据。
 */
'use strict';
var path = require('path');
var CORE = ['balance', 'rng', 'elements', 'grid', 'thermal', 'transitions',
  'reactions', 'movement', 'air', 'biology', 'wind', 'engine'];
CORE.forEach(function (m) { require(path.join(__dirname, '..', 'src', 'core', m + '.js')); });
var YS = globalThis.YS;
var E = YS.Elements.ID;
var P = YS.Balance.PHYS;
var Engine = YS.Engine;

function fill(g, x0, y0, x1, y1, el, t) {
  for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) g.setEl(x, y, el, t === undefined ? P.AMBIENT_T : t);
}
function cnt(g, id) { var c = 0; for (var i = 0; i < g.n; i++) if (g.element[i] === id) c++; return c; }
function box(w, h, seed) { return Engine.create({ w: w, h: h, seed: seed }); }

console.log('================ T6.3 证据复核 ================\n');

/* ---------- A. 沙→玻璃：接触反应 R20 ---------- */
console.log('== A. 沙→玻璃链（R20 接触反应）==');
(function () {
  // A1 主场景：30×4 沙层 + 30×6 岩浆（岩浆压在沙上）
  var eng = box(48, 40, 1337), g = eng.grid;
  fill(g, 9, 30, 38, 35, E.LAVA, 1200);   // 30 宽 × 6 高 岩浆
  fill(g, 9, 26, 38, 29, E.SAND, 20);     // 30 宽 × 4 高 沙层（在岩浆下方？先试叠放）
  // 注：沙密度 1600 < 岩浆 2800 → 会下沉交换，这里只是初值；真实接触由 4 邻接 R20 驱动
  var t0 = cnt(g, E.SAND);
  for (var t = 0; t < 2000; t++) eng.step();
  console.log('  A1 沙层+岩浆 2000tick：SAND ' + t0 + '→' + cnt(g, E.SAND) +
    '  GLASS=' + cnt(g, E.GLASS) + '  LAVA=' + cnt(g, E.LAVA) + '  STONE=' + cnt(g, E.STONE));

  // A2 反例：沙单独
  var e2 = box(48, 40, 1337), g2 = e2.grid;
  fill(g2, 9, 26, 38, 29, E.SAND, 20);
  for (var t2 = 0; t2 < 2000; t2++) e2.step();
  console.log('  A2 沙单独 2000tick：GLASS=' + cnt(g2, E.GLASS) + '（期望 0）');

  // A3 反例：沙 + 水（水压在沙上）
  var e3 = box(48, 40, 1337), g3 = e3.grid;
  fill(g3, 9, 30, 38, 35, E.WATER, 20);
  fill(g3, 9, 26, 38, 29, E.SAND, 20);
  for (var t3 = 0; t3 < 2000; t3++) e3.step();
  console.log('  A3 沙+水 2000tick：GLASS=' + cnt(g3, E.GLASS) + '（期望 0）');

  // A4 侧向接触（更直接的 R20 触发面）：沙块左侧紧贴岩浆
  var e4 = box(48, 40, 1337), g4 = e4.grid;
  fill(g4, 6, 20, 20, 35, E.SAND, 20);
  fill(g4, 21, 20, 35, 35, E.LAVA, 1200);
  for (var t4 = 0; t4 < 2000; t4++) e4.step();
  console.log('  A4 沙块|岩浆(侧向) 2000tick：GLASS=' + cnt(g4, E.GLASS) + '  SAND剩=' + cnt(g4, E.SAND));

  // A5 阈值兜底路线为何走不通：单面受热封顶温度（沙在岩浆上）
  var e5 = box(48, 40, 1337), g5 = e5.grid;
  fill(g5, 9, 30, 38, 35, E.LAVA, 1200);
  fill(g5, 9, 28, 38, 29, E.SAND, 20);   // 沙浮于岩浆上，只底面受热
  var maxSandT = -1e9;
  for (var t5 = 0; t5 < 2000; t5++) {
    e5.step();
    for (var i = 0; i < g5.n; i++) if (g5.element[i] === E.SAND && g5.temp[i] > maxSandT) maxSandT = g5.temp[i];
  }
  console.log('  A5 沙浮岩浆上：沙经历最高温 = ' + maxSandT.toFixed(1) + ' °C（GLASS_T 阈值=1100，判定阈值路线是否可达）');
})();

/* ---------- B. 竖直木柱：火焰窜顶 ---------- */
console.log('\n== B. 竖直木柱蔓延（N1 修复）==');
(function () {
  var eng = box(30, 120, 1337), g = eng.grid;
  var cx = 15, yTop = 10, yBot = 100, yLight = 90;
  for (var y = yTop; y <= yBot; y++) g.setEl(cx, y, E.WOOD, P.AMBIENT_T);
  g.setEl(cx, yLight, E.FIRE, 600);
  var reached = yLight;
  for (var t = 0; t < 2000; t++) {
    eng.step();
    for (var yy = yBot; yy >= yTop; yy--) if (g.element[g.idx(cx, yy)] === E.FIRE) { if (yy < reached) reached = yy; break; }
  }
  console.log('  竖直木柱(30 格)底部点火：火焰最高窜到 y=' + reached + '（yTop=' + yTop + '；越接近 yTop 越"窜顶"）');
  console.log('  剩余 WOOD=' + cnt(g, E.WOOD) + '（起始 91）');
})();

/* ---------- C. 密封盒 ×5 种子：残木≥90% + 火自熄 ---------- */
console.log('\n== C. 密封盒自熄（N1 修复）==');
(function () {
  var seeds = [1337, 2, 7, 42, 99];
  var allOk = true;
  seeds.forEach(function (s) {
    var eng = box(40, 40, s), g = eng.grid;
    // 外壁
    for (var x = 13; x <= 26; x++) { g.setEl(x, 13, E.WALL); g.setEl(x, 26, E.WALL); }
    for (var y = 13; y <= 26; y++) { g.setEl(13, y, E.WALL); g.setEl(26, y, E.WALL); }
    // 内部 14..25 的木块（12×12）
    fill(g, 14, 14, 25, 25, E.WOOD, P.AMBIENT_T);
    // 在木块顶部下 1 格放火种（挖掉一格木头放火）
    g.setEl(20, 20, E.FIRE, 600);
    for (var t = 0; t < 3000; t++) eng.step();
    var woodLeft = cnt(g, E.WOOD), fire = cnt(g, E.FIRE), air = cnt(g, 1);
    var wood0 = 12 * 12 - 1;
    var pct = (woodLeft / wood0 * 100).toFixed(1);
    var ok = woodLeft / wood0 >= 0.9 && fire === 0;
    if (!ok) allOk = false;
    console.log('  seed=' + s + '：残木 ' + woodLeft + '/' + wood0 + ' = ' + pct + '%  结束FIRE=' + fire + '  AIR=' + air + (ok ? '  ✓' : '  ✗'));
  });
  console.log('  判定：' + (allOk ? '5/5 ✓（残木≥90% 且火自熄）' : '存在不满足'));
})();

/* ---------- D. 煤块 100% 燃尽 ---------- */
console.log('\n== D. 煤块燃尽 ==');
(function () {
  var eng = box(40, 40, 1337), g = eng.grid;
  fill(g, 15, 15, 22, 22, E.COAL, P.AMBIENT_T);
  for (var x = 15; x <= 22; x++) g.setEl(x, 14, E.FIRE, 800);   // 顶部一排火
  var t;
  for (t = 0; t < 2000; t++) { eng.step(); if (cnt(g, E.COAL) === 0 && cnt(g, E.FIRE) === 0) break; }
  console.log('  8×8 煤块(顶部点火)：COAL 剩=' + cnt(g, E.COAL) + '/64，t=' + t + '（燃尽 tick）');
})();

/* ---------- E. 点燃的种子/位置脆弱性 ---------- */
console.log('\n== E. 点燃种子/位置脆弱性（新发现 Major）==');
(function () {
  // E1：8×8 木块 + 紧贴左侧 1 格火苗，跨 8 种子
  var seeds = [1, 2, 7, 42, 99, 20261011, 555, 1337];
  console.log('  E1. 8×8 木块，紧贴左侧 1 格火苗（火源 y=块中部），跨 8 种子：');
  var results = [];
  seeds.forEach(function (s) {
    var eng = box(60, 40, s), g = eng.grid;
    var x0 = 25, y0 = 15;
    fill(g, x0, y0, x0 + 7, y0 + 7, E.WOOD, P.AMBIENT_T);   // 8×8 木块
    g.setEl(x0 - 1, y0 + 3, E.FIRE, 600);                    // 紧贴左侧 1 格火苗
    for (var t = 0; t < 1500; t++) eng.step();
    var burned = 64 - cnt(g, E.WOOD);
    var pct = (burned / 64 * 100).toFixed(0);
    results.push({ s: s, pct: +pct });
    console.log('     seed=' + s + ' → 烧毁 ' + burned + '/64 = ' + pct + '%');
  });
  if (typeof globalThis.__json === 'boolean' ? globalThis.__json : false) {}
  var good = results.filter(function (r) { return r.pct >= 50; }).length;
  console.log('     可点燃种子：' + good + '/' + seeds.length);

  // E2：默认种子 1337 下，改变火源 y 坐标（木块随之移动），测位置脆弱性
  console.log('  E2. 默认种子 1337，改变火源所在 y（木块随之平移）：');
  [40, 80, 120, 150, 174].forEach(function (fy) {
    var eng = box(320, 180, 1337), g = eng.grid;
    var x0 = 150, y0 = fy - 3;
    if (y0 < 1 || y0 + 7 > 178) { console.log('     y=' + fy + ' → 越界，跳过'); return; }
    fill(g, x0, y0, x0 + 7, y0 + 7, E.WOOD, P.AMBIENT_T);
    g.setEl(x0 - 1, fy, E.FIRE, 600);
    for (var t = 0; t < 1500; t++) eng.step();
    var burned = 64 - cnt(g, E.WOOD);
    console.log('     y=' + fy + ' → 烧毁 ' + burned + '/64 = ' + (burned / 64 * 100).toFixed(0) + '%');
  });
})();

/* ---------- F. 火×木块（正上方火源）燃尽 ≥80%（N1-1 对照） ---------- */
console.log('\n== F. 8×8 木块（正上方火源）==');
(function () {
  var eng = box(40, 40, 1337), g = eng.grid;
  fill(g, 15, 16, 22, 23, E.WOOD, P.AMBIENT_T);
  for (var x = 15; x <= 22; x++) g.setEl(x, 15, E.FIRE, 600);
  var t;
  for (t = 0; t < 600; t++) { eng.step(); if (64 - cnt(g, E.WOOD) >= 64 * 0.8) break; }
  console.log('  顶部点火 8×8 木：' + t + ' tick 内烧毁 ' + (64 - cnt(g, E.WOOD)) + '/64 = ' +
    ((64 - cnt(g, E.WOOD)) / 64 * 100).toFixed(0) + '%');
})();

/* ---------- G. 点燃脆弱性机制量化（有效判定次数 vs 二项尾） ---------- */
console.log('\n== G. 点燃脆弱性机制量化 ==');
(function () {
  [2, 555, 1337].forEach(function (seed) {
    var eng = box(60, 40, seed), g = eng.grid, x0 = 25, y0 = 15;
    fill(g, x0, y0, x0 + 7, y0 + 7, E.WOOD, P.AMBIENT_T);
    g.setEl(x0 - 1, y0 + 3, E.FIRE, 600);
    var contact = 0, fireSeen = 0;
    for (var t = 0; t < 1500; t++) {
      var adj = false;
      for (var yy = y0; yy <= y0 + 7; yy++) if (g.element[g.idx(x0 - 1, yy)] === E.FIRE) adj = true;
      if (adj) contact++;
      eng.step();
      for (var i = 0; i < g.n; i++) if (g.element[i] === E.FIRE) { fireSeen++; break; }
    }
    var burned = 64 - cnt(g, E.WOOD);
    console.log('  seed=' + seed + '：火焰存活 tick=' + fireSeen + '  紧贴木块列 tick=' + contact +
      '  烧毁=' + burned + '/64');
  });
  var p = 0.05, n = 33;
  console.log('  机制：单次命中率 p=0.05，约 ' + n + ' 次判定 → P(全不中)=0.95^' + n + '≈' +
    (Math.pow(1 - p, n) * 100).toFixed(0) + '%（二项尾；因引擎确定性而稳定重现）');
})();

console.log('\n================ 复核结束 ================');

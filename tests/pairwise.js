/*
 * tests/pairwise.js — 元素两两配对实验骨架（30×30，用量分档，多次重复）
 *   配套文档：docs/PAIRWISE-MATRIX.md（矩阵定义 / 用量分档 / 现实预期参考表 / 判定规则）
 *   基线记录：tests/BASELINE.md
 *
 *   运行方式（Node 零依赖，沿用 tests/run.js 的加载方式）：
 *     node tests/pairwise.js                                  # 全量矩阵（30×30 有序对）汇总；慢，AIR 实装后再跑
 *     node tests/pairwise.js --pair=FIRE:WATER --amount=mid --repeats=3 --ticks=1200
 *     node tests/pairwise.js --pairs=FIRE:WATER,LAVA:WATER,SALT:WATER --ticks=600
 *     node tests/pairwise.js --pair=LAVA:AIR --amount=large --ticks=1200 --json
 *     node tests/pairwise.js --list                           # 只打印矩阵分类 + 有意义组合计数
 *     node tests/pairwise.js --dump                           # 输出全部无序对分类清单（Markdown，供可审计附录）
 *     node tests/pairwise.js --probe=air-conduct              # 定向缺陷探针（air-conduct/hot-air-rises/plant-root/plant-air/fire-spread-open/fire-spread-sealed）
 *     node tests/pairwise.js --pair=WATER:FIRE --sides=1:24   # 非对称用量（A=1×1，B=24×24）
 *     node tests/pairwise.js --only=REACTION --amount=small --ticks=600   # 只跑某一类
 *     node tests/pairwise.js --rejudge=tests/_out/matrix-mid.json         # 对已保存结果重判规则（不重跑仿真）
 *
 *   参数：
 *     --pair=A:B        单组：元素 A 与元素 B（用英文 key，如 FIRE:WATER）
 *     --pairs=A:B,C:D   多组逗号分隔
 *     --amount=small|mid|large   用量档（默认 mid）
 *     --repeats=N       重复次数/种子数（默认 3）
 *     --ticks=N         每组 tick 数（默认 1200）
 *     --seed=N          首种子（默认 1337；repeats>1 时取 [1337,2,7,11,13,...] 序列）
 *     --grid=WxH        强制网格尺寸（默认按用量自适应）
 *     --only=KIND       只跑某一类：REACTION/PHASE/THERMAL/MIX/LIFE/AIR/STRUCT/FLOW/SELF/NONE
 *     --sample=full|loose  快照密度（loose = 早期 8tick + 每 60tick，全量跑矩阵时降载）
 *     --out=FILE        把结果落盘为紧凑 JSON（供批量聚合与出报告）
 *     --list            只打印分类
 *     --json            以 JSON 输出结果（便于工具消费）
 *     --quiet           只打印汇总
 *
 *   退出一码：0 = 无 FAIL；1 = 有 FAIL（便于 CI 门控）。
 *
 *   注意（元素 id 1 命名）：本文件按 AIR「空气」命名元素 1。
 *   当前代码 id 1 = EMPTY「空」；即将升级为 AIR「空气」（可移动气体，世界默认充满）。
 *   两者在代码里是同一个 id，故本骨架在 AIR 实装前后都可直接运行。
 */
'use strict';

/* ---------- 加载 core（与 tests/run.js 完全一致：classic wrapper 填充 globalThis.YS） ---------- */
var path = require('path');
var fs = require('fs');
/* 注意：'air' 必须在 'movement' 之后、'biology' 之前 —— engine.js 依赖 root.YS.Air（ADR-0005） */
var CORE = ['balance', 'rng', 'elements', 'grid', 'thermal', 'transitions',
  'reactions', 'movement', 'air', 'biology', 'wind', 'pressure', 'engine'];
CORE.forEach(function (m) { require(path.join(__dirname, '..', 'src', 'core', m + '.js')); });

var YS = globalThis.YS;
var ID = YS.Elements.ID;
var El = YS.Elements;
var Engine = YS.Engine;
var P = YS.Balance.PHYS;

/* ---------- 元素 id 常量（按 key 解析，兼容 EMPTY→AIR 改名） ---------- */
function idOf(key) {
  if (ID[key] !== undefined) return ID[key];
  if (key === 'AIR' && ID.EMPTY !== undefined) return ID.EMPTY; // 兼容旧名
  return undefined;
}
var AIR = idOf('AIR');            // = 1（当前 EMPTY，将升级为 AIR）
var WALL = idOf('WALL');

/* ---------- 用量分档（对齐 docs/PAIRWISE-MATRIX.md §3） ---------- */
var AMOUNTS = { small: 1, mid: 8, large: 24 };

/* ---------- 初始温度（对齐 PHYSICS.md §4 / §8 的反应发生温度） ---------- */
var INIT_T = {};
INIT_T[idOf('LAVA')] = 1200;
INIT_T[idOf('FIRE')] = 600;
INIT_T[idOf('LN2')] = -196;
INIT_T[idOf('ICE')] = -10;
INIT_T[idOf('SNOW')] = -5;
function initTemp(id) { return INIT_T[id] !== undefined ? INIT_T[id] : P.AMBIENT_T; }

var SEED_SEQ = [1337, 2, 7, 11, 13, 17, 19, 23, 29, 31];

/* 采样密度：全量跑矩阵时用 loose（早期 8 tick + 每 60 tick）以降载 */
var LOOSE_SAMPLE = false;

/* ============================================================
 * 1. 分类：判断一组配对"是否有意义"，供可审计统计 + --list
 * ============================================================ */
var IMMOVABLE = [];   // 运行时填充
var REACT_LABELS = [
  'FIRE+WATER', 'FIRE+WOOD', 'FIRE+OIL', 'FIRE+COAL', 'FIRE+GUNPOWDER',
  'FIRE+GAS', 'FIRE+PLANT', 'FIRE+SEED', 'FIRE+DUST', 'FIRE+VIRUS',
  'ACID+METAL', 'ACID+STONE', 'ACID+PLANT', 'SALT+WATER', 'LAVA+WATER', 'LAVA+ICE',
  'LAVA+PLANT', 'VIRUS+PLANT', 'VIRUS+WOOD', 'VIRUS+SEED', 'TNT+FIRE', 'TNT+LAVA', 'TNT+TNT'
];
/* CLONE 可复制任意可移动邻居 → 与所有 movable 元素构成"反应" */
var HEAT_SRC = [idOf('FIRE'), idOf('LAVA')];
var COLD_SRC = [idOf('LN2')];
/* 受热可相变者（与热/冷源配对即有热作用）——熔/沸/凝固阈值 */
var PHASE_BY_HEAT = [idOf('ICE'), idOf('SNOW'), idOf('WATER'), idOf('SALT'), idOf('SAND'),
  idOf('METAL'), idOf('GLASS'), idOf('STONE')];

function key(id) {
  if (id === AIR) return 'AIR';                       // id 1 统一显示为 AIR（原 EMPTY）
  return El.ELEMENTS[id] ? El.ELEMENTS[id].key : ('#' + id);
}
function isImmovable(id) { return !El.ELEMENTS[id].movable; }

function isReactPair(a, b) {
  var ka = key(a), kb = key(b);
  for (var i = 0; i < REACT_LABELS.length; i++) {
    var parts = REACT_LABELS[i].split('+');
    if ((parts[0] === ka && parts[1] === kb) || (parts[0] === kb && parts[1] === ka)) return true;
  }
  return false;
}
function inList(list, id) { return list.indexOf(id) >= 0; }

function classify(a, b) {
  if (a === AIR && b === AIR) return { kind: 'NONE', why: '空气×空气（同一介质，无离散交互）' };
  if (a === AIR || b === AIR) return { kind: 'AIR', why: '某元素置于空气中（环境热库 / 浮力 / 供氧背景）' };
  if (a === b) {
    if (a === idOf('TNT')) return { kind: 'REACTION', why: 'TNT 相邻 → 链式爆炸（R17）' };
    return { kind: 'SELF', why: '同种物质相邻：仅合并/流动，无反应（N/A）' };
  }
  if (isReactPair(a, b)) return { kind: 'REACTION', why: '§8 反应表命中' };
  /* 克隆体复制任意可移动邻居 */
  if ((a === idOf('CLONE') && El.ELEMENTS[b].movable) || (b === idOf('CLONE') && El.ELEMENTS[a].movable))
    return { kind: 'REACTION', why: 'CLONE 复制可移动邻居（R14）' };
  /* 热/冷源 → 相变 */
  var heat = (inList(HEAT_SRC, a) || inList(HEAT_SRC, b));
  var cold = (inList(COLD_SRC, a) || inList(COLD_SRC, b));
  var partner = inList(HEAT_SRC, a) ? b : a;
  if ((heat || cold) && inList(PHASE_BY_HEAT, partner)) return { kind: 'PHASE', why: '热/冷源相邻 → 相变（§7）' };
  if (heat || cold) return { kind: 'THERMAL', why: '热/冷源相邻 → 仅导热，无相变' };
  /* 生命 / 植物：湿度驱动（§10） */
  var LIFE_EL = [idOf('SEED'), idOf('PLANT')], MOIST = [idOf('WATER'), idOf('SOIL')];
  if ((inList(LIFE_EL, a) && inList(MOIST, b)) || (inList(LIFE_EL, b) && inList(MOIST, a)))
    return { kind: 'LIFE', why: '生命/植物：湿度驱动发芽/生长（§10）' };
  /* 都是静态固体且无反应 → N/A */
  if (isImmovable(a) && isImmovable(b)) return { kind: 'NONE', why: '两者皆为静态固体，无反应（N/A）' };
  /* 一静一动 → 结构（绕流/堆积） */
  if (isImmovable(a) || isImmovable(b)) return { kind: 'STRUCT', why: '流体绕流 / 粉末堆积于静态固体旁（无化学）' };
  /* 都是可移动 → 混合/分层/流动 */
  var sa = El.ELEMENTS[a].state, sb = El.ELEMENTS[b].state;
  if (sa === 'gas' || sb === 'gas') return { kind: 'FLOW', why: '气体与物质混合（浮力 / 密度分层）' };
  return { kind: 'MIX', why: '两种可移动流体：密度分层 / 互不反应' };
}

/* ============================================================
 * 2. 场景构建：A 块与 B 块相邻，置于 WALL 托盘上，其余为 AIR
 * ============================================================ */
function gridSizeFor(s) {
  var W = Math.max(48, 2 * s + 24);
  var H = Math.max(32, s + 16);
  return { w: W, h: H };
}

function placeBlock(g, x0, y0, s, id) {
  if (id === AIR) return;                 // AIR 即背景，无需绘制
  var t = initTemp(id);
  for (var yy = 0; yy < s; yy++)
    for (var xx = 0; xx < s; xx++)
      g.setEl(x0 + xx, y0 + yy, id, t);
}

function buildScenario(engine, aId, bId, sA, sB) {
  var g = engine.grid, W = g.w, H = g.h, x;
  for (x = 0; x < W; x++) g.setEl(x, H - 1, WALL, P.AMBIENT_T);  // 托盘
  var start = Math.floor((W - (sA + sB)) / 2);
  placeBlock(g, start, H - 1 - sA, sA, aId);
  if (aId !== bId) placeBlock(g, start + sA, H - 1 - sB, sB, bId);
  return g;
}

/* ============================================================
 * 3. 统计与运行
 * ============================================================ */
function countAll(g) {
  var c = new Int32Array(31);
  for (var i = 0; i < g.n; i++) { var e = g.element[i]; if (e >= 1 && e <= 30) c[e]++; }
  return c;
}
function tempStats(g) {
  var min = Infinity, max = -Infinity, sum = 0, n = 0;
  for (var i = 0; i < g.n; i++) {
    var v = g.temp[i];
    if (v < min) min = v; if (v > max) max = v; sum += v; n++;
  }
  return { min: min, max: max, mean: +(sum / n).toFixed(2) };
}

function runOnce(aId, bId, sA, sB, seed, ticks, gridOverride) {
  var smax = Math.max(sA, sB);
  var size = gridOverride || gridSizeFor(smax);
  var eng = Engine.create({ w: size.w, h: size.h, seed: seed });
  var g = buildScenario(eng, aId, bId, sA, sB);
  var before = countAll(g);
  var checkpoints = {}, checkTimes = [];
  for (var t = 1; t <= ticks; t++) {
    eng.step();
    if (LOOSE_SAMPLE ? (t <= 8 || t % 60 === 0) : (t <= 60 || t % 30 === 0)) {
      checkpoints[t] = countAll(g); checkTimes.push(t);
    }
  }
  var after = countAll(g);
  var newEls = [], goneEls = [], everSeen = [];
  var ever = new Int32Array(31);
  [before, after].forEach(function (c) { for (var id = 1; id <= 30; id++) ever[id] = Math.max(ever[id], c[id]); });
  Object.keys(checkpoints).forEach(function (t) {
    var c = checkpoints[t];
    for (var id = 1; id <= 30; id++) ever[id] = Math.max(ever[id], c[id]);
  });
  for (var id2 = 1; id2 <= 30; id2++) {
    if (ever[id2] > 0 && id2 !== 1 && id2 !== WALL) everSeen.push(id2);   // 全程曾出现（含中途产物如 SMOKE）
    if (id2 === 1 || id2 === WALL) continue;                             // 背景/托盘不算"新物质"
    if (before[id2] === 0 && after[id2] > 0) newEls.push(id2);
    if (before[id2] > 0 && after[id2] === 0) goneEls.push(id2);
  }
  return {
    a: key(aId), b: key(bId), aId: aId, bId: bId, amount: null, sA: sA, sB: sB, s: smax, seed: seed, ticks: ticks,
    grid: size.w + 'x' + size.h,
    before: before, after: after, checkpoints: checkpoints, everSeen: everSeen,
    newElements: newEls, goneElements: goneEls,
    temp: tempStats(g),
    hash: eng.hash()
  };
}

/* ============================================================
 * 3b. 定向探针：量化用户点名的三个缺陷（空气不导热 / 热空气不上升 / 植物无根乱长）
 *     判据在探针内**由实测值计算**（改造前=缺陷复现；改造后=应转为"已修复"）。
 * ============================================================ */
function runProbe(name, ticks, seed, s) {
  s = s || 8;
  var eng, g, x, y, i;

  if (name === 'air-conduct') {
    /* 热源 LAVA 与 水 之间隔着 1 格 AIR：测水能否被"隔着空气"加热 */
    var size = { w: 56, h: 40 };
    eng = Engine.create({ w: size.w, h: size.h, seed: seed }); g = eng.grid;
    for (x = 0; x < g.w; x++) g.setEl(x, g.h - 1, WALL, P.AMBIENT_T);
    var y0 = g.h - 1 - s;
    var xL = 8, xA = xL + s, xW = xA + 1;                 // LAVA | AIR(1列) | WATER
    for (y = 0; y < s; y++) for (x = 0; x < s; x++) g.setEl(xL + x, y0 + y, idOf('LAVA'), 1200);
    for (y = 0; y < s; y++) for (x = 0; x < s; x++) g.setEl(xW + x, y0 + y, idOf('WATER'), 20);
    var waterCol = xW, probeY = y0 + (s >> 1);
    var w0 = g.temp[g.idx(waterCol, probeY)];
    for (i = 0; i < ticks; i++) eng.step();
    var rise = g.temp[g.idx(waterCol, probeY)] - w0;
    return {
      probe: name, seed: seed, ticks: ticks, grid: size.w + 'x' + size.h,
      waterTempStart: +w0.toFixed(2), waterTempEnd: +g.temp[g.idx(waterCol, probeY)].toFixed(2),
      waterTempRise: +rise.toFixed(2), gapAirTempEnd: +g.temp[g.idx(xA, probeY)].toFixed(2),
      conclusion: (rise >= 20 ? 'PASS' : 'FAIL'),
      verdict: (rise >= 20
        ? '与热源隔着 1 格空气的水升温 +' + rise.toFixed(1) + '°C → 空气能导热（B1 已修复）'
        : '隔 1 格空气的水几乎不升温（+' + rise.toFixed(2) + '°C）→ 空气不导热（B1 缺陷）')
    };
  }

  if (name === 'hot-air-rises') {
    /* WALL 盒内底部一坨 800°C 热空气：用"热加权重心"上移量判定是否上升（ΔY<0 = 上升） */
    var size2 = { w: 32, h: 44 };
    eng = Engine.create({ w: size2.w, h: size2.h, seed: seed }); g = eng.grid;
    var bx0 = 3, bx1 = g.w - 4, by0 = 4, by1 = g.h - 4;   // 盒内区
    for (x = 2; x < g.w - 2; x++) { g.setEl(x, 3, WALL, 20); g.setEl(x, g.h - 3, WALL, 20); }
    for (y = 3; y < g.h - 2; y++) { g.setEl(2, y, WALL, 20); g.setEl(g.w - 3, y, WALL, 20); }
    var topStart = g.h - 4 - s;
    for (y = topStart; y < g.h - 4; y++) for (x = 12; x < 12 + s; x++) g.setEl(x, y, AIR, 800);
    var amb = P.AMBIENT_T;
    function heatCentroid() {
      var sum = 0, wsum = 0;
      for (var yy = by0; yy <= by1; yy++) for (var xx = bx0; xx <= bx1; xx++) {
        var j = g.idx(xx, yy); if (g.element[j] !== AIR) continue;
        var e = g.temp[j] - amb; if (e > 0) { sum += yy * e; wsum += e; }
      }
      return wsum > 0 ? (sum / wsum) : -1;
    }
    var c0 = heatCentroid();
    for (i = 0; i < 60; i++) eng.step();  var c60 = heatCentroid();
    for (i = 60; i < ticks; i++) eng.step(); var cEnd = heatCentroid();
    var delta = cEnd - c0;
    return {
      probe: name, seed: seed, ticks: ticks, grid: size2.w + 'x' + size2.h,
      hotCentroidStart: +c0.toFixed(2), hotCentroidAt60: +c60.toFixed(2), hotCentroidEnd: +cEnd.toFixed(2),
      deltaY: +delta.toFixed(2),
      conclusion: (delta <= -0.5 ? 'PASS' : 'FAIL'),
      verdict: (delta <= -0.5
        ? '热加权重心上移 ΔY=' + delta.toFixed(2) + '（行号减小=上升）→ 热空气会上升（B2 已修复）'
        : '热加权重心几乎未上移 ΔY=' + delta.toFixed(2) + ' → 热空气不上升（B2 缺陷）')
    };
  }

  if (name === 'plant-root') {
    /* 花盆场景：湿土苗床 + WALL 隔断的深水塘（水在种子左 2 格、同一水平线）。
     * 检验"着地 + 根区有水 → 发芽、必须连地、只向上生长、不出现向下的根"。
     *
     * 设计要点（均为避开与"连地"无关的物理干扰项，非绕过被测逻辑）：
     *   ① 水塘与土壤之间用不可动 WALL 隔开：土壤（密度 1300）会沿对角塌入水（密度 1000），
     *      若水土直接相邻，土壤会被水侵蚀、苗床塌陷、种子落水（实测 10 tick 内水土边界蚀退 3 格）。
     *   ② 水塘又宽又深（8×43）：植物每生长一次有 50% 概率取走最近一格水，窄水塘会被抽成
     *      以基座为心的空洞、水超出根区 reach=4 后误判"干旱枯死"。宽水塘使供水前沿远离基座。
     *   ③ 苗床被 WALL 三面围住 → 土壤不塌、种子不沉不滚。
     * 经 8 个种子 × 5000 tick 验证稳定通过（只向上长、down=0）。 */
    var size3 = { w: 48, h: 56 };
    eng = Engine.create({ w: size3.w, h: size3.h, seed: seed }); g = eng.grid;
    for (x = 0; x < g.w; x++) g.setEl(x, g.h - 1, WALL, 20);
    for (y = 10; y < g.h - 1; y++) { g.setEl(9, y, WALL, 20); g.setEl(18, y, WALL, 20); }   // 水塘两侧隔断
    for (y = 12; y < g.h - 1; y++) for (x = 10; x < 18; x++) g.setEl(x, y, idOf('WATER'), 20); // 宽深水塘
    for (y = 30; y < g.h - 1; y++) for (x = 19; x < 45; x++) g.setEl(x, y, idOf('SOIL'), 20);  // 苗床
    for (y = 30; y < g.h - 1; y++) g.setEl(45, y, WALL, 20);                                    // 苗床右壁
    var sx = 19, sy = 29;                                                                        // 种子：苗床表层、水塘右 2 格
    g.setEl(sx, sy, idOf('SEED'), 20);
    for (i = 0; i < ticks; i++) eng.step();
    var plantTop = -1, plantBottom = -1, plantCount = 0;
    for (var yy2 = 0; yy2 < g.h; yy2++) for (var xx2 = 0; xx2 < g.w; xx2++) {
      if (g.element[g.idx(xx2, yy2)] === idOf('PLANT')) {
        plantCount++;
        if (plantTop < 0 || yy2 < plantTop) plantTop = yy2;
        if (yy2 > plantBottom) plantBottom = yy2;
      }
    }
    var seedAlive = g.element[g.idx(sx, sy)] === idOf('SEED');
    var grew = plantTop >= 0 && sy - plantTop > 0;
    var grewDown = plantBottom > sy;
    return {
      probe: name, seed: seed, ticks: ticks, grid: size3.w + 'x' + size3.h,
      plantCount: plantCount, plantTopRow: plantTop, plantBottomRow: plantBottom, seedRow: sy, seedCol: sx,
      grewDownward: grewDown, heightGrown: grew ? (sy - plantTop) : 0,
      conclusion: (grew && !grewDown ? 'PASS' : 'FAIL'),
      verdict: (grew && !grewDown
        ? ('着地 + 根区有水的种子发芽并向上长出 ' + (sy - plantTop) + ' 格、未出现向下乱长的根 → 连地生长正常（B3 已修复）')
        : (plantCount === 0
          ? ('未存活（最终 0 格植物；seedAlive=' + seedAlive + '）—— 检查着地/湿度/温度/露头条件')
          : ('植物未向上生长或出现向下乱长（plantCount=' + plantCount + '，grew=' + grew + '，grewDownward=' + grewDown + '）')))
    };
  }

  if (name === 'plant-air') {
    /* 悬空单株植物 + 2 格内一小格水：严格生态下"无根"应导致整株枯死 */
    var size4 = { w: 32, h: 56 };
    eng = Engine.create({ w: size4.w, h: size4.h, seed: seed }); g = eng.grid;
    for (x = 0; x < g.w; x++) g.setEl(x, g.h - 1, WALL, 20);
    var px = 16, py = g.h - 12;                 // 悬空起点
    g.setEl(px, py, idOf('PLANT'), 20);
    g.setEl(px + 2, py + 1, idOf('WATER'), 20); // 2 格内供水（无土壤 / 无根）
    var alive60 = 0;
    for (i = 0; i < ticks; i++) { eng.step(); if (i === 60 && g.element[g.idx(px, py)] === idOf('PLANT')) alive60 = 1; }
    var top = -1, cnt = 0;
    for (var yy3 = 0; yy3 < g.h; yy3++) for (var xx3 = 0; xx3 < g.w; xx3++) {
      if (g.element[g.idx(xx3, yy3)] === idOf('PLANT')) { cnt++; if (top < 0 || yy3 < top) top = yy3; }
    }
    return {
      probe: name, seed: seed, ticks: ticks, grid: size4.w + 'x' + size4.h,
      startRow: py, plantTopRow: top, plantCount: cnt, aliveAt60: !!alive60,
      grewUpInAir: top >= 0 && top < py ? (py - top) : 0,
      conclusion: (cnt === 0 ? 'PASS' : 'FAIL'),
      verdict: (cnt === 0
        ? '悬空无根植物在断根宽限内整株枯死（t=1200 剩 0 格）→ 无根不再乱长（B3 已修复）'
        : '悬空无根植物仍在生长（t=1200 剩 ' + cnt + ' 格，长到 ' + (py - top) + ' 格）→ 无根乱长（B3 缺陷）')
    };
  }

  if (name === 'fire-spread-open') {
    /* 开放蔓延（暴露空气）：12×2 木条置于托盘，左端 2 格火 → 检验火势能沿可燃物显著蔓延。
     * 现实：木条会被点燃并沿条蔓延。
     * 阈值 T1（**草案，待 design-strategist 核定**）：1200 tick 后 ≥50% 木格被消耗（不再是 WOOD）。 */
    var FO = { w: 40, h: 40 };
    eng = Engine.create({ w: FO.w, h: FO.h, seed: seed }); g = eng.grid;
    for (x = 0; x < g.w; x++) g.setEl(x, g.h - 1, WALL, P.AMBIENT_T);
    var bx0 = 8, bx1 = 20, by0 = g.h - 3, by1 = g.h - 2;      // 12 宽 × 2 高
    var woodO = 0;
    for (y = by0; y <= by1; y++) for (x = bx0; x < bx1; x++) { g.setEl(x, y, idOf('WOOD'), P.AMBIENT_T); woodO++; }
    g.setEl(bx0, by0, idOf('FIRE'), 600);                      // 左端 2 格火（上下两格）
    g.setEl(bx0, by1, idOf('FIRE'), 600);
    for (i = 0; i < ticks; i++) eng.step();
    var woodL = 0, reachX = -1;
    for (y = by0; y <= by1; y++) for (x = bx0; x < bx1; x++) {
      if (g.element[g.idx(x, y)] === idOf('WOOD')) woodL++;
      else if (x > reachX) reachX = x;                          // 火到达过的最右列（近似蔓延距离）
    }
    var cons = woodO - woodL, fracO = cons / woodO;
    return {
      probe: name, seed: seed, ticks: ticks, grid: FO.w + 'x' + FO.h,
      woodStart: woodO, woodEnd: woodL, consumed: cons, fractionConsumed: +fracO.toFixed(3),
      spreadReachX: reachX, barFromX: bx0,
      threshold: '≥50% 木格被消耗（草案）',
      conclusion: (fracO >= 0.5 ? 'PASS' : 'FAIL'),
      verdict: (fracO >= 0.5
        ? ('火势沿木条蔓延：消耗 ' + cons + '/' + woodO + ' = ' + (fracO * 100).toFixed(0) + '%（≥50%）')
        : ('火势未蔓延：仅消耗 ' + cons + '/' + woodO + ' = ' + (fracO * 100).toFixed(0) + '%（<50%）→ 卡在表层（N1 缺陷）'))
    };
  }

  if (name === 'fire-spread-sealed') {
    /* 密闭缺氧：WALL 全包盒内 4×4 木 + 1 格火 + 1 格初始空气 → 检验缺氧自熄、**不透烧**。
     * 现实：密闭无新鲜氧气，火应熄灭。
     * 阈值 T2（**硬红线，engineering-lead 提供**）：1200 tick 后残余木 ≥90%（即 ≤10% 被烧）。
     *   注：原型方案 P2（燃料邻接 FIRE 即点燃、忽略氧）在此会烧穿 13/16 → 直接 FAIL。 */
    var FSE = { w: 40, h: 40 };
    eng = Engine.create({ w: FSE.w, h: FSE.h, seed: seed }); g = eng.grid;
    for (y = 14; y <= 19; y++) for (x = 14; x <= 19; x++) g.setEl(x, y, WALL, P.AMBIENT_T); // 6×6 WALL 外盒
    for (y = 15; y <= 18; y++) for (x = 15; x <= 18; x++) g.setEl(x, y, idOf('WOOD'), P.AMBIENT_T); // 4×4 内部
    g.setEl(15, 18, idOf('FIRE'), 600);      // 内部 1 格火（左下角）
    g.setEl(15, 17, AIR, P.AMBIENT_T);       // 紧邻火的 1 格初始氧化剂
    var wood0S = 0;
    for (y = 15; y <= 18; y++) for (x = 15; x <= 18; x++) if (g.element[g.idx(x, y)] === idOf('WOOD')) wood0S++;
    for (i = 0; i < ticks; i++) eng.step();
    var woodLS = 0, fireLS = 0;
    for (y = 15; y <= 18; y++) for (x = 15; x <= 18; x++) {
      var es = g.element[g.idx(x, y)];
      if (es === idOf('WOOD')) woodLS++;
      if (es === idOf('FIRE')) fireLS++;
    }
    var kept = wood0S > 0 ? woodLS / wood0S : 1;
    /* 密封性核对：外盒不得被烧穿（WALL 墙格数全程不变） */
    var wallOuter = 0;
    for (y = 14; y <= 19; y++) for (x = 14; x <= 19; x++) if (g.element[g.idx(x, y)] === WALL) wallOuter++;
    var sealed = (wallOuter === 20);          // 6×6 外圈 = 20 格
    return {
      probe: name, seed: seed, ticks: ticks, grid: FSE.w + 'x' + FSE.h,
      woodStart: wood0S, woodEnd: woodLS, keptFraction: +kept.toFixed(3), fireRemain: fireLS, wallRingIntact: sealed,
      threshold: '残余木 ≥90% 且火自熄、盒壁完整（硬红线）',
      conclusion: ((kept >= 0.9 && sealed) ? 'PASS' : 'FAIL'),
      verdict: ((kept >= 0.9 && sealed)
        ? ('密闭缺氧自熄：残余木 ' + woodLS + '/' + wood0S + ' = ' + (kept * 100).toFixed(0) + '%（≥90%）、盒壁完整 → 未透烧')
        : ('密闭盒被烧穿或未自熄：残余木 ' + woodLS + '/' + wood0S + ' = ' + (kept * 100).toFixed(0) + '%、盒壁完整=' + sealed + ' → 违反硬红线'))
    };
  }

  return { probe: name, error: '未知探针: ' + name + '（可用 air-conduct / hot-air-rises / plant-root / plant-air / fire-spread-open / fire-spread-sealed）' };
}

/* ============================================================
 * 4. 自动判定规则（可编码）—— 只覆盖"现实预期明确"的组合；
 *    未覆盖者标记 UNJUDGED（需人工判读），绝不臆造。
 *    规则键为 "KEY_A:KEY_B"（有序；未命中则尝试反向）。
 * ============================================================ */
var RULES = {
  // ---- 水火（§8 R1） ----
  'FIRE:WATER': { gone: ['FIRE'], minRemain: { WATER: 1 }, note: '火被水浇灭→SMOKE；水吸热（+55°C/邻接）' },
  // ---- 岩浆遇水/冰（§8 R12/R13） ----
  // 注：不要求 LAVA 全消失 —— 现实里少量水浇不冷一大片岩浆（用量相关，见报告 §判据局限）；
  //     核心可编码判据 = "接触处必须淬出 STONE"。
  'LAVA:WATER': { appear: ['STONE'], allowProducts: ['STONE', 'STEAM', 'SMOKE'], note: '岩浆遇水淬固为石、水产汽（是否整体凝固 / 水是否全汽化取决于水火比）' },
  'LAVA:ICE': { appear: ['STONE'], allowProducts: ['STONE', 'WATER', 'STEAM'], note: '岩浆淬固为石，冰→水/汽（是否整体凝固取决于用量）' },
  'LAVA:PLANT': { allowProducts: ['STONE', 'FIRE', 'SMOKE', 'ASH', 'DUST'], note: 'S-LAVA：岩浆同 tick 点燃植物并自身凝固' },
  // ---- 燃烧（§8 R2–R7 / §9） ----
  'FIRE:WOOD': { allowProducts: ['SMOKE', 'ASH', 'FIRE'], note: '木被点燃→FIRE→灰；允许产烟/灰' },
  'FIRE:COAL': { allowProducts: ['SMOKE', 'ASH', 'FIRE'], note: '煤被点燃→灰' },
  'FIRE:OIL': { allowProducts: ['SMOKE', 'FIRE', 'ASH'], note: '油被点燃；引擎按 RESIDUE_ASH.OIL=0.2 有 20% 概率留灰（现实轻油几乎无渣，属轻微偏离，见不合理清单）' },
  'FIRE:GUNPOWDER': { allowProducts: ['SMOKE', 'FIRE', 'ASH'], note: '火药速燃 + 8 邻链式爆燃（燃后留残灰，符合现实）' },
  'FIRE:GAS': { allowProducts: ['SMOKE', 'FIRE'], note: '瓦斯爆燃' },
  'FIRE:PLANT': { allowProducts: ['SMOKE', 'ASH', 'DUST', 'FIRE'], note: '植物被点燃；未燃部分会缺水枯萎成 DUST' },
  // ---- 腐蚀（§8 R8/R9/R10） ----
  'ACID:METAL': { allowProducts: ['GAS', 'SMOKE'], note: '金属被酸蚀（可能产瓦斯）' },
  'ACID:STONE': { allowProducts: ['SMOKE'], note: '岩石被酸蚀' },
  'ACID:PLANT': { allowProducts: ['DUST', 'SMOKE'], note: 'S-ACID：酸腐蚀植物组织→DUST' },
  'ACID:GLASS': { unchanged: ['ACID', 'GLASS'], note: '玻璃耐酸（R10 明确不反应）' },
  // ---- 溶解（§8 R11） ----
  'SALT:WATER': { allowProducts: ['SMOKE'], note: '盐溶于水→EMPTY（★盐未进入水相，见不合理清单#1）' },
  // ---- 病毒（§8 R15/R16） ----
  'VIRUS:PLANT': { allowProducts: ['VIRUS', 'DUST'], note: '植物被感染→病毒；叶/株缺水会同时枯萎成 DUST' },
  'VIRUS:WOOD': { allowProducts: ['VIRUS'], note: '木材被感染→病毒' },
  'VIRUS:SEED': { allowProducts: ['VIRUS'], note: '种子被感染→病毒（演绎化设定，现实病毒一般不侵染种子）' },
  // ---- 爆炸（§9.5） ----
  'TNT:TNT': { unchanged: ['TNT'], allowProducts: ['FIRE', 'SMOKE'], note: 'TNT 相邻但无火源/高温 → 不触发（正确）；链式爆炸需外部引爆' },
  'TNT:FIRE': { allowProducts: ['FIRE', 'SMOKE'], note: '火焰引爆 TNT（半径 6 内全毁）' },
  'TNT:LAVA': { allowProducts: ['STONE', 'FIRE', 'SMOKE', 'TNT'], note: '高温岩浆引爆 TNT（中/大用量）并自身凝固；1×1 极小时岩浆被环境迅速冷却凝固、来不及升温至 180°C（用量相关）' },
  'TNT:GUNPOWDER': { unchanged: ['TNT', 'GUNPOWDER'], allowProducts: ['FIRE', 'SMOKE', 'ASH'], note: '无火源/起爆药时 TNT 与火药均不引爆（现实：需引发剂）—— 规格 §5.5 的"殉爆"描述不准确' },
  'TNT:GAS': { unchanged: ['TNT'], allowProducts: ['FIRE', 'SMOKE'], note: '无火源时 TNT 不引爆；瓦斯比空气轻会上浮逸出顶边（正常，非产物）—— 规格 §5.5 的"殉爆"描述不准确' },
  // ---- 生命（§10） ----
  // 注：用 appearDuring（全程曾出现）而非 appear（结束仍在）—— 幼苗可能长高后脱离水源枯萎，
  //     结束时刻已不在场，但"发芽"这一现实预期确已发生（见报告 §判据局限）。
  'SEED:WATER': { appearDuring: ['PLANT'], allowProducts: ['PLANT', 'DUST'], note: '种子遇水+室温+露头 → 发芽（幼苗后续可能枯萎成 DUST）' },
  'SEED:SOIL': { allowProducts: ['PLANT', 'DUST'], note: '种子置于土上：本裸场景无自由水，引擎的 SOIL 仅由"邻接 WATER"变湿 → 干土不发芽（现实亦需先吸水）' },
  'WATER:ICE': { allowProducts: ['WATER'], note: '冰（-10°C）在 20°C 水中吸热融化→水' },
  // ---- 空气（元素 1 = 当前 EMPTY，将升级为 AIR） ----
  'LAVA:AIR': { allowProducts: ['STONE', 'SMOKE'], note: '岩浆在空气中散热，应缓慢凝固→STONE' },
  'FIRE:AIR': { gone: ['FIRE'], allowProducts: ['SMOKE'], note: '孤立火焰（无燃料）寿命耗尽→烟/空' },
  'WATER:AIR': { unchanged: ['WATER'], note: '20°C 水在空气中不蒸发（R-03）' },
  'WATER:LN2': { gone: ['LN2'], allowProducts: ['ICE', 'STEAM', 'WATER'], note: '液氮气化→STEAM（非真氮气，近似）；水可能结冰（★见不合理清单：倒液氮会凭空造水）' },
  'LAVA:SAND': { unchanged: ['SAND'], allowProducts: ['STONE', 'SMOKE'], note: '沙需 1700°C 才成玻璃，岩浆最高 1200°C → 玻璃链不可达' },
  'FIRE:SNOW': { appear: ['WATER'], allowProducts: ['WATER', 'SMOKE', 'STEAM'], note: '火的热量使雪融化→水' },
  'CLONE:WATER': { allowProducts: ['WATER', 'ICE'], note: '克隆体复制水（配额 2000，属有意的质量创生）' },
  'SPRING:WATER': { unchanged: ['SPRING'], allowProducts: ['WATER'], note: '★SPRING 无出水逻辑（src/core 无实现）——元素 29 当前为"死元素"' },
  'PLANT:WATER': { appearDuring: ['PLANT'], allowProducts: ['PLANT', 'DUST'], note: '植物近水生长；缺水枯萎成 DUST' }
};

function judgeRule(res) {
  var rule = RULES[res.a + ':' + res.b] || RULES[res.b + ':' + res.a];
  if (!rule) {
    /* 分类兜底规则（仅覆盖"现实预期无争议"的类别，绝不臆造具体反应）：
     *   STRUCT（流体绕流/粉末堆积于静态固体旁）/ NONE（两者皆静态固体）/ MIX（两种可移动流体互不反应）
     *   / SELF（同种物质相邻，仅合并或流动）/ FLOW（含气体的混合：上浮/扩散/分层）
     *   —— 现实与引擎都不应产生"新物质"（仅允许下列有现实依据的环境自发转变）。凡出现其它新元素即 UNEXPECTED。
     *
     * 环境自发转变白名单（有现实依据，非"新化学反应"）：
     *   · PLANT 无水会按严格生态枯萎 → DUST（§10.2）；
     *   · STEAM / ICE / SNOW 在室温下相变 → WATER（冷凝 / 融化，§7）；若旁有 SEED 则被浸湿发芽 → PLANT/DUST；
     *   · LAVA 散热凝固 → STONE（§7.7）；FIRE 燃尽 → SMOKE（§9.1）。
     * 说明：LAVA/FIRE/LN2 等热冷源旁边的"非相变"物质在 classify 中已归入 THERMAL/PHASE，不会落到本兜底；
     *       THERMAL / PHASE / AIR 三类涉及真实热力学，不设兜底，一律 UNJUDGED 交人工（见报告）。 */
    var c = classify(res.aId, res.bId);
    if (c.kind === 'STRUCT' || c.kind === 'NONE' || c.kind === 'MIX' || c.kind === 'SELF' || c.kind === 'FLOW') {
      var near = [res.aId, res.bId];
      var has = function (n) { return near.indexOf(idOf(n)) >= 0; };
      var extra = [];
      if (has('PLANT')) extra.push('DUST');
      var waterSrc = false;
      ['STEAM', 'ICE', 'SNOW'].forEach(function (n) { if (has(n)) { extra.push('WATER'); waterSrc = true; } });
      if (has('SEED') && waterSrc) extra.push('PLANT', 'DUST');
      if (has('LAVA')) extra.push('STONE');                       // 岩浆散热凝固（SELF 时即 LAVA×LAVA）
      if (has('LN2')) extra.push('STEAM', 'WATER', 'ICE');        // ★已知偏离 #3：倒液氮会经 STEAM 凭空造水/冰（此处容许，另列清单）
      if (has('FIRE')) extra.push('SMOKE');                       // 火焰燃尽（SELF 时即 FIRE×FIRE）
      rule = { allowProducts: extra, autoKind: c.kind, note: '无显著交互（' + c.kind + '）：现实与引擎均不应产生新物质' + (extra.length ? '；仅允许环境自发转变 ' + extra.join('/') : '') };
    }
  }
  if (!rule) { res.status = 'UNJUDGED'; return res; }
  var fails = [];
  (rule.gone || []).forEach(function (n) { var id = idOf(n); if (res.after[id] !== 0) fails.push('期望 ' + n + ' 消失，实剩 ' + res.after[id]); });
  (rule.appear || []).forEach(function (n) { var id = idOf(n); if (res.after[id] <= 0) fails.push('期望出现 ' + n + '，实为 0'); });
  (rule.appearDuring || []).forEach(function (n) { var id = idOf(n); if (res.everSeen.indexOf(id) < 0) fails.push('期望全程出现过 ' + n + '，未出现'); });
  Object.keys(rule.minRemain || {}).forEach(function (n) { var id = idOf(n); if (res.after[id] < rule.minRemain[n]) fails.push('期望 ' + n + ' ≥ ' + rule.minRemain[n] + '，实得 ' + res.after[id]); });
  (rule.unchanged || []).forEach(function (n) { var id = idOf(n); if (res.after[id] !== res.before[id]) fails.push('期望 ' + n + ' 不变(' + res.before[id] + ')，实得 ' + res.after[id]); });
  // 意外产物检测
  var allowed = {}; allowed[AIR] = 1; allowed[WALL] = 1; allowed[res.aId] = 1; allowed[res.bId] = 1;
  (rule.allowProducts || []).forEach(function (n) { var id = idOf(n); if (id !== undefined) allowed[id] = 1; });
  (rule.appear || []).forEach(function (n) { var id = idOf(n); if (id !== undefined) allowed[id] = 1; });
  (rule.appearDuring || []).forEach(function (n) { var id = idOf(n); if (id !== undefined) allowed[id] = 1; });
  var unexpected = [];
  res.newElements.forEach(function (id) { if (!allowed[id]) unexpected.push(key(id)); });

  if (fails.length) { res.status = 'FAIL'; res.failures = fails; }
  else if (unexpected.length) { res.status = 'UNEXPECTED'; res.unexpected = unexpected; }
  else res.status = 'PASS';
  res.ruleNote = rule.note;
  return res;
}

/* ============================================================
 * 5. 命令解析
 * ============================================================ */
function parseArgs(argv) {
  var o = { amount: 'mid', repeats: 3, ticks: 1200, seed: 1337, grid: null, sides: null, only: null, probe: null, list: false, dump: false, json: false, quiet: false, out: null, sample: 'full', pairs: [], rejudge: null };
  for (var i = 0; i < argv.length; i++) {
    var a = argv[i];
    if (a.indexOf('--pair=') === 0) o.pairs.push(a.slice(7));
    else if (a.indexOf('--pairs=') === 0) o.pairs = o.pairs.concat(a.slice(8).split(','));
    else if (a.indexOf('--probe=') === 0) o.probe = a.slice(8);
    else if (a.indexOf('--sides=') === 0) { var q = a.slice(8).split(':'); o.sides = [parseInt(q[0], 10), parseInt(q[1], 10)]; }
    else if (a.indexOf('--out=') === 0) o.out = a.slice(6);
    else if (a.indexOf('--sample=') === 0) o.sample = a.slice(9);
    else if (a.indexOf('--amount=') === 0) o.amount = a.slice(9);
    else if (a.indexOf('--repeats=') === 0) o.repeats = parseInt(a.slice(10), 10);
    else if (a.indexOf('--ticks=') === 0) o.ticks = parseInt(a.slice(8), 10);
    else if (a.indexOf('--seed=') === 0) o.seed = parseInt(a.slice(7), 10);
    else if (a.indexOf('--grid=') === 0) { var m = a.slice(7).split('x'); o.grid = { w: parseInt(m[0], 10), h: parseInt(m[1], 10) }; }
    else if (a.indexOf('--only=') === 0) o.only = a.slice(7).toUpperCase();
    else if (a.indexOf('--rejudge=') === 0) o.rejudge = a.slice(10);
    else if (a === '--list') o.list = true;
    else if (a === '--dump') o.dump = true;
    else if (a === '--json') o.json = true;
    else if (a === '--quiet') o.quiet = true;
  }
  return o;
}
function resolveId(name) {
  var k = String(name).trim().toUpperCase();
  var id = idOf(k);
  if (id === undefined) throw new Error('未知元素: ' + name + '（可用英文 key，如 FIRE / WATER / AIR）');
  return id;
}

/* ============================================================
 * 6. 主流程
 * ============================================================ */
function main() {
  for (var i = 1; i <= 30; i++) if (isImmovable(i)) IMMOVABLE.push(i);
  var opt = parseArgs(process.argv.slice(2));
  if (opt.sample === 'loose') LOOSE_SAMPLE = true;

  /* ---- --rejudge=FILE[,…]：对已保存的矩阵结果重新套用判定规则，无需重跑仿真 ---- */
  if (opt.rejudge) {
    opt.rejudge.split(',').forEach(function (f) {
      var payload;
      try { payload = JSON.parse(fs.readFileSync(f, 'utf8')); }
      catch (e) { console.error('读取失败: ' + f + ' — ' + e.message); return; }
      var results = payload.results || [];
      results.forEach(function (res) {
        if (res.aId === undefined) res.aId = idOf(res.a);
        if (res.bId === undefined) res.bId = idOf(res.b);
        if (!res.newElements) res.newElements = res.appeared || [];
        judgeRule(res);
      });
      var summary = {};
      var byKind = {};
      results.forEach(function (res) {
        summary[res.status] = (summary[res.status] || 0) + 1;
        var k = classify(res.aId, res.bId).kind;
        byKind[k] = byKind[k] || {};
        byKind[k][res.status] = (byKind[k][res.status] || 0) + 1;
      });
      payload.summary = summary;
      payload.byKind = byKind;
      try { fs.writeFileSync(f, JSON.stringify(payload)); console.log('重判完成: ' + f + '  ' + JSON.stringify(summary) + '\n  分类: ' + JSON.stringify(byKind)); }
      catch (e) { console.error('写盘失败: ' + e.message); }
    });
    return 0;
  }

  /* ---- --list：只统计分类 ---- */
  if (opt.list) {
    var counts = {}, naPairs = [], meaningful = 0, total = 0;
    for (var a = 1; a <= 30; a++) for (var b = 1; b <= 30; b++) {
      total++;
      var c = classify(a, b);
      counts[c.kind] = (counts[c.kind] || 0) + 1;
      if (c.kind === 'NONE' || c.kind === 'SELF') naPairs.push(key(a) + ':' + key(b));
      else meaningful++;
    }
    console.log('元素对总数（有序 30×30）: ' + total);
    console.log('有意义组合: ' + meaningful + '    标记 N/A: ' + (total - meaningful));
    console.log('分类计数: ' + JSON.stringify(counts, null, 0));
    console.log('N/A 组合（前 40）: ' + naPairs.slice(0, 40).join(', ') + (naPairs.length > 40 ? ' … (共 ' + naPairs.length + ')' : ''));
    return 0;
  }

  /* ---- --dump：输出全部无序对（a≤b）的分类清单（Markdown，供可审计附录） ---- */
  if (opt.dump) {
    var order = ['REACTION', 'PHASE', 'THERMAL', 'AIR', 'LIFE', 'MIX', 'FLOW', 'STRUCT', 'SELF', 'NONE'];
    var groups = {}; order.forEach(function (k) { groups[k] = []; });
    var un = 0;
    for (var aa = 1; aa <= 30; aa++) for (var bb = aa; bb <= 30; bb++) {
      un++;
      var cc = classify(aa, bb);
      groups[cc.kind].push('| ' + key(aa) + ' × ' + key(bb) + ' | ' + cc.kind + ' | ' + cc.why + ' |');
    }
    var totalUn = 30 * 31 / 2;
    console.log('# 无序对分类清单（a ≤ b，共 ' + totalUn + ' 组）');
    order.forEach(function (k) {
      if (!groups[k] || !groups[k].length) return;
      console.log('\n## ' + k + '（' + groups[k].length + ' 组）\n| 组合 | 类 | 依据 |\n|---|---|---|');
      groups[k].forEach(function (ln) { console.log(ln); });
    });
    return 0;
  }

  var s = AMOUNTS[opt.amount];
  if (!s) { console.error('未知用量档: ' + opt.amount + '（可 small/mid/large）'); return 2; }
  if (opt.sides && (isNaN(opt.sides[0]) || isNaN(opt.sides[1]))) { console.error('--sides=A:B 需为两个整数，如 --sides=1:24'); return 2; }
  var sA = opt.sides ? opt.sides[0] : s;
  var sB = opt.sides ? opt.sides[1] : s;

  /* ---- --probe：定向缺陷探针 ---- */
  if (opt.probe) {
    var pres = runProbe(opt.probe, opt.ticks, opt.seed, s);
    console.log(JSON.stringify(pres, null, 2));
    return 0;
  }

  /* ---- 组装待跑列表 ---- */
  var pairs = [];
  if (opt.pairs.length) {
    opt.pairs.forEach(function (p) { var q = p.split(':'); pairs.push([resolveId(q[0]), resolveId(q[1])]); });
  } else {
    for (var a = 1; a <= 30; a++) for (var b = 1; b <= 30; b++) {
      if (opt.only && classify(a, b).kind !== opt.only) continue;
      pairs.push([a, b]);
    }
  }

  var results = [], summary = {}, seedList = [];
  for (var r = 0; r < opt.repeats; r++) seedList.push(r === 0 ? opt.seed : (SEED_SEQ[r] !== undefined ? SEED_SEQ[r] : opt.seed + r));

  pairs.forEach(function (pr) {
    seedList.forEach(function (sd) {
      var res = runOnce(pr[0], pr[1], sA, sB, sd, opt.ticks, opt.grid);
      res.amount = opt.sides ? ('sides ' + sA + ':' + sB) : opt.amount;
      judgeRule(res);
      results.push(res);
    });
  });

  results.forEach(function (res) { summary[res.status] = (summary[res.status] || 0) + 1; });

  /* ---- --out=FILE：把结果落盘（紧凑 JSON，供批量聚合） ---- */
  if (opt.out) {
    var slim = results.map(function (res) {
      return {
        a: res.a, b: res.b, amount: res.amount, seed: res.seed, sA: res.sA, sB: res.sB,
        status: res.status, before: Array.prototype.slice.call(res.before), after: Array.prototype.slice.call(res.after),
        everSeen: res.everSeen, gone: res.goneElements, appeared: res.newElements,
        temp: res.temp, note: res.ruleNote || '', failures: res.failures || null, unexpected: res.unexpected || null
      };
    });
    var payload = { opt: opt, summary: summary, results: slim };
    try { fs.writeFileSync(opt.out, JSON.stringify(payload)); console.log('已写盘: ' + opt.out + '（' + slim.length + ' 条）'); }
    catch (e) { console.error('写盘失败: ' + e.message); return 3; }
    if (opt.quiet) return (summary.FAIL ? 1 : 0);
  }

  if (opt.json) {
    console.log(JSON.stringify({ opt: opt, summary: summary, results: results }, function (k, v) {
      return (v instanceof Int32Array) ? Array.prototype.slice.call(v) : v;
    }, 2));
    return (summary.FAIL ? 1 : 0);
  }

  /* ---- 可读输出 ---- */
  if (results.length === 1 || pairs.length <= 40) {
    results.forEach(printOne);
  } else {
    console.log('配对实验：' + pairs.length + ' 组 × ' + seedList.length + ' 种子（用量=' + opt.amount + '=' + sA + '×' + sB + '，' + opt.ticks + ' tick）');
    console.log('状态汇总: ' + JSON.stringify(summary));
    results.forEach(function (res) { if (res.status === 'FAIL' || res.status === 'UNEXPECTED') printOne(res); });
  }
  console.log('\n状态汇总: ' + JSON.stringify(summary) + '  组合数=' + pairs.length + ' 种子数=' + seedList.length);
  return (summary.FAIL ? 1 : 0);
}

function fmtCounts(arr, ids) {
  var parts = [];
  ids.forEach(function (id) { if (arr[id] > 0) parts.push(key(id) + '=' + arr[id]); });
  return parts.length ? parts.join(' ') : '(空)';
}

function printOne(res) {
  console.log('\n── ' + res.a + ' × ' + res.b + '  [用量=' + res.amount + ' A=' + res.sA + '×' + res.sA + ' B=' + res.sB + '×' + res.sB + ', 种子=' + res.seed + ', ' + res.ticks + 'tick, 网格=' + res.grid + ']');
  console.log('   判定: ' + res.status + (res.ruleNote ? '   // ' + res.ruleNote : ''));
  console.log('   起始计: ' + fmtCounts(res.before, range(2, 30)));
  console.log('   结束计: ' + fmtCounts(res.after, range(2, 30)));
  console.log('   全程曾出现: ' + (res.everSeen && res.everSeen.length ? res.everSeen.map(key).join(',') : '无'));
  console.log('   新出现: ' + (res.newElements.length ? res.newElements.map(key).join(',') : '无') +
    '   消失: ' + (res.goneElements.length ? res.goneElements.map(key).join(',') : '无'));
  console.log('   温度: min=' + res.temp.min.toFixed(1) + ' max=' + res.temp.max.toFixed(1) + ' mean=' + res.temp.mean);
  if (res.failures) res.failures.forEach(function (f) { console.log('   ✗ ' + f); });
  if (res.unexpected) console.log('   ! 未预期的产物: ' + res.unexpected.join(', '));
}
function range(a, b) { var out = []; for (var i = a; i <= b; i++) out.push(i); return out; }

var code = main();
process.exit(code);

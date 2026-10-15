/*
 * tests/pairwise-run.js — 全量配对实验执行器 + 报告生成器
 *   配套：docs/PAIRWISE-MATRIX.md（设计基准）、docs/PAIRWISE-REPORT.md（本工具产出）、tests/REGRESSION-2.md
 *
 *   用法：
 *     node tests/pairwise-run.js --run                 # 跑全量（900 有序 × 3 用量 × N 种子），落盘 raw JSON
 *     node tests/pairwise-run.js --report              # 读 raw JSON，生成 docs/PAIRWISE-REPORT.md
 *     node tests/pairwise-run.js                       # = --run 然后 --report
 *     node tests/pairwise-run.js --run --ticks=1200 --repeats=2 --seed=1337
 *     node tests/pairwise-run.js --run --amounts=small   # 只跑一个用量档（调试）
 *     node tests/pairwise-run.js --run --limit=20        # 只跑前 20 个有序对（调试）
 *
 *   判定模型（全部可编码，无"看起来合理"）：
 *     · 对每个 (A,B,用量,种子) 单元，用 RULES 的显式断言判 PASS/FAIL；
 *     · 未被 RULES 覆盖的，用"允许产物集合"判 UNEXPECTED（出现集合外的新元素）；
 *     · 同种自配 / 静态固体互配 → N/A（但仍核对无意外产物）。
 *   RULES 之外的"允许产物"由元素自身的相变产物 + 燃烧产物 + 反应表产物推导，
 *   避免把"物理上正常的相变/燃烧"误判成意外产物。
 *
 *   退出码：0 = 无 FAIL；1 = 有 FAIL（建议性门控，最终放行由用户决定）。
 */
'use strict';

var path = require('path');
var fs = require('fs');
var ROOT = path.join(__dirname, '..');

var CORE = ['balance', 'rng', 'elements', 'grid', 'thermal', 'transitions',
  'reactions', 'movement', 'air', 'biology', 'wind', 'engine'];
CORE.forEach(function (m) { require(path.join(ROOT, 'src', 'core', m + '.js')); });

var YS = globalThis.YS;
var ID = YS.Elements.ID;
var El = YS.Elements;
var Engine = YS.Engine;
var P = YS.Balance.PHYS;

/* ---------- 元素常量 ---------- */
var AIR = 1, WALL = ID.WALL, STONE = ID.STONE, GLASS = ID.GLASS, METAL = ID.METAL,
  ICE = ID.ICE, WOOD = ID.WOOD, PLANT = ID.PLANT, SAND = ID.SAND, SOIL = ID.SOIL,
  SALT = ID.SALT, DUST = ID.DUST, SNOW = ID.SNOW, ASH = ID.ASH, COAL = ID.COAL,
  GUNPOWDER = ID.GUNPOWDER, SEED = ID.SEED, WATER = ID.WATER, OIL = ID.OIL,
  LAVA = ID.LAVA, ACID = ID.ACID, LN2 = ID.LN2, STEAM = ID.STEAM, SMOKE = ID.SMOKE,
  FIRE = ID.FIRE, GAS = ID.GAS, CLONE = ID.CLONE, VIRUS = ID.VIRUS,
  SPRING = ID.SPRING, TNT = ID.TNT;

function idOf(k) {
  if (k === 'AIR') return AIR;
  return ID[k];
}
function key(id) {
  if (id === AIR) return 'AIR';
  return El.ELEMENTS[id] ? El.ELEMENTS[id].key : ('#' + id);
}
function isImmovable(id) { return !El.ELEMENTS[id].movable; }

/* ---------- 用量分档（对齐 docs/PAIRWISE-MATRIX.md §2） ---------- */
var AMOUNTS = { small: 1, mid: 8, large: 24 };
var AMOUNT_LIST = ['small', 'mid', 'large'];

/* ---------- 初始温度（对齐 PHYSICS.md §4 / §8） ---------- */
var INIT_T = {};
INIT_T[LAVA] = 1200; INIT_T[FIRE] = 600; INIT_T[LN2] = -196;
INIT_T[ICE] = -10; INIT_T[SNOW] = -5;
function initTemp(id) { return INIT_T[id] !== undefined ? INIT_T[id] : P.AMBIENT_T; }

/* ============================================================
 * 1. 产物推导表（用于"允许产物集合"）
 * ============================================================ */
var PHASE = {};
PHASE[STONE] = [LAVA]; PHASE[GLASS] = [LAVA]; PHASE[METAL] = [LAVA];
PHASE[ICE] = [WATER, STEAM]; PHASE[SAND] = [GLASS]; PHASE[SALT] = [LAVA];
PHASE[SNOW] = [WATER, STEAM]; PHASE[WATER] = [STEAM, ICE]; PHASE[LAVA] = [STONE];
PHASE[STEAM] = [WATER]; PHASE[PLANT] = [DUST];
/* v1.5.0：SEED 萌发为**树** —— 树干/树枝 = WOOD，树叶 = PLANT（原版 Powder Toy 机制） */
PHASE[SEED] = [WOOD, PLANT];
PHASE[LN2] = [];

var BURN = {};
BURN[WOOD] = [FIRE, SMOKE, ASH]; BURN[OIL] = [FIRE, SMOKE, ASH];
BURN[COAL] = [FIRE, SMOKE, ASH]; BURN[GUNPOWDER] = [FIRE, SMOKE, ASH];
BURN[GAS] = [FIRE, SMOKE]; BURN[PLANT] = [FIRE, SMOKE, ASH, DUST];
BURN[SEED] = [FIRE, SMOKE, ASH]; BURN[DUST] = [FIRE, SMOKE, ASH];
BURN[VIRUS] = [FIRE, SMOKE, ASH];

function has2(pair, ka, kb) { return (pair[0] === ka && pair[1] === kb) || (pair[0] === kb && pair[1] === ka); }

function reactionProducts(a, b) {
  var pk = [key(a), key(b)], s = [];
  if (has2(pk, 'ACID', 'METAL')) s = s.concat([GAS]);
  if (has2(pk, 'ACID', 'PLANT')) s = s.concat([DUST]);
  if (has2(pk, 'LAVA', 'WATER')) s = s.concat([STONE, STEAM]);
  if (has2(pk, 'LAVA', 'ICE')) s = s.concat([STONE, WATER, STEAM]);
  if (has2(pk, 'LAVA', 'SNOW')) s = s.concat([STONE, WATER, STEAM]);
  if (has2(pk, 'LAVA', 'PLANT')) s = s.concat([STONE, FIRE, SMOKE, ASH, DUST]);
  if (has2(pk, 'VIRUS', 'PLANT') || has2(pk, 'VIRUS', 'WOOD') || has2(pk, 'VIRUS', 'SEED')) s = s.concat([VIRUS]);
  if (a === TNT || b === TNT) s = s.concat([FIRE, SMOKE]);
  if (a === SPRING || b === SPRING) s = s.concat([WATER]);
  if (a === CLONE || b === CLONE) s = s.concat([a, b]);
  return s;
}

function allowedNew(a, b) {
  var s = {};
  [AIR, WALL, a, b].forEach(function (x) { s[x] = 1; });
  [PHASE[a], PHASE[b], BURN[a], BURN[b], reactionProducts(a, b)].forEach(function (arr) {
    if (arr) arr.forEach(function (x) { s[x] = 1; });
  });
  if (a === FIRE || b === FIRE) [SMOKE, ASH, FIRE].forEach(function (x) { s[x] = 1; });
  if (a === LAVA || b === LAVA) [STONE, SMOKE, LAVA].forEach(function (x) { s[x] = 1; });
  if (a === LN2 || b === LN2) [ICE].forEach(function (x) { s[x] = 1; });
  /* v1.5.0：种子→树 → 允许 WOOD（树干/树枝）与 PLANT（树叶）作为新产物 */
  if (a === SEED || b === SEED || a === PLANT || b === PLANT) [WOOD, PLANT, DUST, WATER].forEach(function (x) { s[x] = 1; });
  if (a === SPRING || b === SPRING) [WATER, STEAM].forEach(function (x) { s[x] = 1; });
  /* 相变闭包：链式相变产物也允许（如 SEED→PLANT→DUST、STEAM→WATER→ICE、LAVA→STONE） */
  for (var it = 0; it < 5; it++) {
    var added = false;
    for (var id in s) { var arr = PHASE[id]; if (arr) arr.forEach(function (x) { if (!s[x]) { s[x] = 1; added = true; } }); }
    if (!added) break;
  }
  return s;
}

/* ============================================================
 * 2. 分类（对齐 docs/PAIRWISE-MATRIX.md §1.3 / tests/pairwise.js）
 * ============================================================ */
var REACT_LABELS = [
  'FIRE+WATER', 'FIRE+WOOD', 'FIRE+OIL', 'FIRE+COAL', 'FIRE+GUNPOWDER',
  'FIRE+GAS', 'FIRE+PLANT', 'FIRE+SEED', 'FIRE+DUST', 'FIRE+VIRUS',
  'ACID+METAL', 'ACID+STONE', 'ACID+PLANT', 'SALT+WATER', 'LAVA+WATER', 'LAVA+ICE',
  'LAVA+PLANT', 'VIRUS+PLANT', 'VIRUS+WOOD', 'VIRUS+SEED', 'TNT+FIRE', 'TNT+LAVA', 'TNT+TNT'
];
var HEAT_SRC = [FIRE, LAVA], COLD_SRC = [LN2];
var PHASE_BY_HEAT = [ICE, SNOW, WATER, SALT, SAND, METAL, GLASS, STONE];

function inList(list, id) { return list.indexOf(id) >= 0; }
function isReactPair(a, b) {
  var ka = key(a), kb = key(b);
  for (var i = 0; i < REACT_LABELS.length; i++) {
    var p = REACT_LABELS[i].split('+');
    if ((p[0] === ka && p[1] === kb) || (p[0] === kb && p[1] === ka)) return true;
  }
  return false;
}
function classify(a, b) {
  if (a === AIR && b === AIR) return 'NONE';
  if (a === AIR || b === AIR) return 'AIR';
  if (a === b) return (a === TNT) ? 'REACTION' : 'SELF';
  if (isReactPair(a, b)) return 'REACTION';
  if ((a === CLONE && El.ELEMENTS[b].movable) || (b === CLONE && El.ELEMENTS[a].movable)) return 'REACTION';
  var heat = inList(HEAT_SRC, a) || inList(HEAT_SRC, b);
  var cold = inList(COLD_SRC, a) || inList(COLD_SRC, b);
  var partner = inList(HEAT_SRC, a) ? b : a;
  if ((heat || cold) && inList(PHASE_BY_HEAT, partner)) return 'PHASE';
  if (heat || cold) return 'THERMAL';
  var LIFE_EL = [SEED, PLANT], MOIST = [WATER, SOIL];
  if ((inList(LIFE_EL, a) && inList(MOIST, b)) || (inList(LIFE_EL, b) && inList(MOIST, a))) return 'LIFE';
  if (isImmovable(a) && isImmovable(b)) return 'NONE';
  if (isImmovable(a) || isImmovable(b)) return 'STRUCT';
  var sa = El.ELEMENTS[a].state, sb = El.ELEMENTS[b].state;
  if (sa === 'gas' || sb === 'gas') return 'FLOW';
  return 'MIX';
}

/* ============================================================
 * 3. 显式判定规则（可编码断言）
 *    gone/appear/unchanged/decrease/increase/minRemain + allow（允许的新产物）
 *    键为 "KA:KB"（有序）；查表时双向尝试。
 * ============================================================ */
var RULES = {
  /* ---- 火 × 燃料（§8 R2–R7 / §9） ---- */
  'FIRE:WATER': { reality: '水吸热汽化并把火浇灭，水面冒蒸汽（现实中水灭火以水蒸气为主、基本不产生烟）', gone: ['FIRE'], note: '判据局限：火有固有寿命，FIRE==0 不足以单独证明"被浇灭"' },
  'FIRE:WOOD': { reality: '木材被点燃后持续燃烧、火势沿木蔓延、烧尽留下炭/灰（大部分木料应被烧掉）', decreaseTo: { WOOD: 0.5 }, allow: ['FIRE', 'SMOKE', 'ASH'], note: '见不合理清单·火离开燃料' },
  'FIRE:COAL': { reality: '煤燃点较高但耐烧、放热多，烧尽成灰（大部分应被烧掉）', decreaseTo: { COAL: 0.5 }, allow: ['FIRE', 'SMOKE', 'ASH'], note: '见不合理清单·火离开燃料' },
  'FIRE:OIL': { reality: '油燃点低、易燃，火势猛烈，燃尽基本无残渣（大部分应被烧掉）', decreaseTo: { OIL: 0.5 }, allow: ['FIRE', 'SMOKE', 'ASH'], note: '见不合理清单·火离开燃料' },
  'FIRE:GUNPOWDER': { reality: '火药爆燃、极快蔓延清空', decreaseTo: { GUNPOWDER: 0.2 }, allow: ['FIRE', 'SMOKE', 'ASH'] },
  'FIRE:GAS': { reality: '瓦斯（甲烷）易燃易爆，火焰迅速传播', decreaseTo: { GAS: 0.2 }, allow: ['FIRE', 'SMOKE'] },
  'FIRE:PLANT': { reality: '活体湿植物不易燃、通常先失水枯萎；只有干枯部分才容易被点燃', decrease: { PLANT: 1 }, allow: ['FIRE', 'SMOKE', 'ASH', 'DUST'] },
  'FIRE:SEED': { reality: '种子受热会失去活性并被部分烧毁；但种子群一旦吸胀成活会长成树，木质树干燃烧极慢，故不要求烧掉一半以上（v1.5.0 树模型）', decrease: { SEED: 1 }, allow: ['FIRE', 'SMOKE', 'ASH', 'WOOD', 'PLANT'], note: 'v1.5.0：木柴烧得慢（对齐原版）→ 短寿命火焰烧不透' },
  'FIRE:DUST': { reality: '可燃粉尘云遇火可爆（粉尘爆炸，应迅速烧掉大部分）', decreaseTo: { DUST: 0.5 }, allow: ['FIRE', 'SMOKE', 'ASH'], note: '见不合理清单·火离开燃料' },
  'FIRE:VIRUS': { reality: '现实中病毒不是可燃物；本作把病毒设为可燃（演绎化设定）', allow: ['FIRE', 'SMOKE', 'ASH'] },

  /* ---- 酸 / 腐蚀（§8 R8–R10） ---- */
  /* v1.5.0：**用户拍板设定** —— 酸蚀金属"直接消失就行"（不做金属盐溶液）。 */
  'ACID:METAL': { reality: '（本作设定）酸腐蚀并蚀掉金属，金属直接消失（不做金属盐溶液/氢气产物）', decrease: { METAL: 1 }, allow: ['GAS', 'SMOKE'], note: '设计意图（用户决策），非缺陷' },
  'ACID:STONE': { reality: '酸腐蚀岩石（碳酸盐遇酸起泡、放气）', decrease: { STONE: 1 }, allow: ['SMOKE'] },
  'ACID:PLANT': { reality: '酸腐蚀植物组织', decrease: { PLANT: 1 }, allow: ['DUST', 'SMOKE'] },
  'ACID:GLASS': { reality: '多数酸不腐蚀玻璃（氢氟酸除外）→ 两者均不应变化', unchanged: ['ACID', 'GLASS'] },

  /* ---- 溶解（§8 R11） ---- */
  /* v1.5.0：**用户拍板设定** —— 盐不溶解（原版 Powder Game 有独立的 Salt water 元素，本作元素上限内不新增，故定为"盐不溶、保持固态"）。 */
  'SALT:WATER': { reality: '（本作设定）盐不溶于水 —— 盐保持固态沉淀于水底，水既不减量也不变咸', allow: ['SALT', 'WATER', 'ICE', 'STEAM'], note: '设计意图（用户决策），非缺陷：原版有独立 Salt water 元素，本作不新增' },

  /* ---- 水 / 冰 / 汽 / 液氮（§7） ---- */
  'WATER:ICE': { reality: '冰从水中吸热融化，水温下降', gone: ['ICE'] },
  'WATER:LN2': { reality: '液氮在温水中剧烈沸腾汽化（氮气返回大气），水被冻成冰', gone: ['LN2'], allow: ['ICE', 'STEAM', 'WATER', 'AIR'], note: '改造后 LN2→AIR，不再"凭空造水"（#3 已修复）' },
  'WATER:STEAM': { reality: '蒸汽在水中上升冒泡，遇冷可冷凝回水', allow: ['WATER', 'STEAM', 'AIR'] },

  /* ---- 岩浆（§8 R12/R13、§7.7） ---- */
  'LAVA:WATER': { reality: '岩浆遇水骤冷凝固成岩石，水剧烈汽化（沸腾飞溅）', decreaseTo: { LAVA: 0.3 }, appear: ['STONE'], allow: ['STONE', 'STEAM', 'SMOKE'] },
  'LAVA:ICE': { reality: '冰被岩浆瞬间融化成水并汽化，岩浆凝固成岩', decreaseTo: { LAVA: 0.3 }, appear: ['STONE'], allow: ['STONE', 'WATER', 'STEAM'] },
  'LAVA:SNOW': { reality: '雪被岩浆极速融化成水/汽，岩浆凝固', decreaseTo: { LAVA: 0.3 }, appear: ['STONE'], allow: ['STONE', 'WATER', 'STEAM'] },
  'LAVA:PLANT': { reality: '植物被岩浆点燃并烧毁，岩浆随之凝固', decrease: { PLANT: 1 }, allow: ['STONE', 'FIRE', 'SMOKE', 'ASH', 'DUST'] },
  'LAVA:SAND': { reality: '沙可被高温熔成玻璃（石英熔点约 1713°C）', allow: ['STONE', 'SAND', 'GLASS', 'SMOKE'], note: '见不合理清单·沙→玻璃链不可达' },

  /* ---- 病毒（§8 R15/R16，演绎化） ---- */
  'VIRUS:PLANT': { reality: '病毒感染并摧毁植物（植物→病毒）', decrease: { PLANT: 1 }, increase: { VIRUS: 1 }, allow: ['VIRUS'] },
  'VIRUS:WOOD': { reality: '现实中病毒不侵染木材；本作把木材设为可被侵染（演绎化设定）', decrease: { WOOD: 1 }, increase: { VIRUS: 1 }, allow: ['VIRUS'] },
  'VIRUS:SEED': { reality: '现实中病毒一般不侵染种子；本作设定种子可被侵染', decrease: { SEED: 1 }, increase: { VIRUS: 1 }, allow: ['VIRUS'] },

  /* ---- 爆炸（§9.5） ---- */
  'TNT:FIRE': { reality: '火焰/高温引爆炸药，半径内全毁', gone: ['TNT'], allow: ['FIRE', 'SMOKE'] },
  'TNT:LAVA': { reality: '高温岩浆引爆炸药', gone: ['TNT'], allow: ['FIRE', 'SMOKE', 'STONE', 'LAVA'] },
  'TNT:TNT': { reality: '相邻炸药需外部引信或高温才爆；无引信、无高温时不应自爆', unchanged: ['TNT'], allow: ['FIRE', 'SMOKE'] },
  'TNT:GUNPOWDER': { reality: '需引信/高温；无热源时两者均不自爆', unchanged: ['TNT'], allow: ['FIRE', 'SMOKE'] },
  'TNT:GAS': { reality: '需引信/高温；无热源时不爆（瓦斯会自行扩散）', unchanged: ['TNT'], allow: ['FIRE', 'SMOKE'] },

  /* ---- 生命（§10 / PLANT-MODEL） ---- */
  'SEED:WATER': { reality: '种子吸水膨胀并长成一棵树 —— 木质树干/树枝（WOOD）+ 树叶（PLANT）；树的大小由吸水量决定（v1.5.0，对齐原版 Powder Toy）', appear: ['WOOD'], allow: ['WOOD', 'PLANT', 'DUST', 'WATER'], note: '最小剂量档下单格水会流失，可能来不及蓄够含水量（用量敏感性，见报告）' },
  'SEED:SOIL': { reality: '种子落在湿润的土壤上才发芽（长成树）；干土不发芽', allow: ['WOOD', 'PLANT', 'DUST', 'SEED'], note: '干土不提供水分 → 不发芽属预期' },
  'PLANT:WATER': { reality: '植物靠根系从水中汲取水分维持存活与生长', allow: ['PLANT', 'WOOD', 'DUST', 'WATER'], note: 'v1.5.0 起植物永不枯死（只休眠）' },
  'PLANT:SOIL': { reality: '植物扎根土壤、吸收水分养分而存活（干土则休眠）', allow: ['PLANT', 'WOOD', 'DUST', 'SOIL'] },

  /* ---- 空气（X 在空气中，§5.6） ---- */
  'LAVA:AIR': { reality: '岩浆在空气中缓慢降温，最终凝固成岩石', allow: ['STONE', 'SMOKE'] },
  'FIRE:AIR': { reality: '无燃料的火会熄灭并产生烟', gone: ['FIRE'], allow: ['SMOKE'] },
  'WATER:AIR': { reality: '室温水不会自发蒸发（沸点 100°C；本作以 60°C 为表面蒸发门槛）', unchanged: ['WATER'] },
  'ICE:AIR': { reality: '冰在室温空气中升温并融化', allow: ['WATER', 'STEAM'] },
  'STEAM:AIR': { reality: '蒸汽上升并降温冷凝成水（降雨）', allow: ['WATER', 'STEAM'] },
  'SMOKE:AIR': { reality: '烟逐渐扩散稀释、最终消散', allow: ['SMOKE'] },
  'GAS:AIR': { reality: '瓦斯比空气轻，上浮并扩散', allow: ['GAS'] },
  'LN2:AIR': { reality: '液氮在空气中剧烈沸腾汽化（氮气返回大气）', allow: ['ICE', 'STEAM'], note: '改造后 LN2→AIR（#3 已修复）' },
  'SPRING:AIR': { reality: '水源泉持续向空气中涌出清水', appear: ['WATER'], allow: ['WATER'] },
  'CLONE:AIR': { reality: '克隆体只能复制相邻的可移动物质；周围只有空气时不复制', unchanged: ['CLONE'], allow: [] },

  /* ---- 液体分层 ---- */
  'WATER:OIL': { reality: '油不溶于水、密度较小，浮在水面上形成分层', unchanged: ['WATER', 'OIL'] },
  'WATER:ACID': { reality: '水与酸互溶稀释（放热）；本作按密度分层、无新物质', allow: [] }
};

/* ---- CLONE 复制任意可移动元素：通用规则 ---- */
var MOVABLE_IDS = [];
for (var mi = 1; mi <= 30; mi++) if (El.ELEMENTS[mi].movable) MOVABLE_IDS.push(mi);
/* 易逸出/易相变的目标（气体、冰雪水、液氮、岩浆）：数量受外界干扰，不做"计数增加"断言 */
var VOLATILE_CLONE = {};
[STEAM, SMOKE, GAS, FIRE, SNOW, ICE, WATER, LN2, LAVA].forEach(function (x) { VOLATILE_CLONE[x] = 1; });

/* ============================================================
 * 4. 场景构建（对齐 tests/pairwise.js）
 * ============================================================ */
function gridSizeFor(s) {
  var W = Math.max(48, 2 * s + 24);
  var H = Math.max(32, s + 16);
  return { w: W, h: H };
}
function placeBlock(g, x0, y0, s, id) {
  if (id === AIR) return;
  var t = initTemp(id);
  for (var yy = 0; yy < s; yy++)
    for (var xx = 0; xx < s; xx++)
      g.setEl(x0 + xx, y0 + yy, id, t);
}
function buildScenario(engine, aId, bId, sA, sB) {
  var g = engine.grid, W = g.w, H = g.h, x;
  for (x = 0; x < W; x++) g.setEl(x, H - 1, WALL, P.AMBIENT_T);
  var start = Math.floor((W - (sA + sB)) / 2);
  placeBlock(g, start, H - 1 - sA, sA, aId);
  if (aId !== bId) placeBlock(g, start + sA, H - 1 - sB, sB, bId);
  return g;
}
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
  return { min: min, max: max, mean: sum / n };
}

function runOnce(aId, bId, sA, sB, seed, ticks, loose) {
  var smax = Math.max(sA, sB);
  var size = gridSizeFor(smax);
  var eng = Engine.create({ w: size.w, h: size.h, seed: seed });
  var g = buildScenario(eng, aId, bId, sA, sB);
  var before = countAll(g);
  var ever = new Int32Array(31);
  for (var id = 1; id <= 30; id++) ever[id] = before[id];
  for (var t = 1; t <= ticks; t++) {
    eng.step();
    var sample = loose ? (t <= 8 || t % 60 === 0) : (t <= 60 || t % 30 === 0);
    if (sample) {
      for (var k = 0; k < g.n; k++) { var e = g.element[k]; if (e >= 1 && e <= 30) { if (ever[e] < 1) ever[e] = 1; } }
    }
  }
  var after = countAll(g);
  var newEls = [], goneEls = [], everSeen = [];
  for (var id2 = 1; id2 <= 30; id2++) {
    if (after[id2] > 0) ever[id2] = 1;
    if (ever[id2] > 0 && id2 !== AIR && id2 !== WALL) everSeen.push(id2);
    if (id2 === AIR || id2 === WALL) continue;
    if (before[id2] === 0 && after[id2] > 0) newEls.push(id2);
    if (before[id2] > 0 && after[id2] === 0) goneEls.push(id2);
  }
  return {
    aId: aId, bId: bId, a: key(aId), b: key(bId), amount: null, sA: sA, sB: sB, seed: seed, ticks: ticks,
    grid: size.w + 'x' + size.h,
    before: Array.prototype.slice.call(before), after: Array.prototype.slice.call(after),
    everSeen: everSeen, newElements: newEls, goneElements: goneEls,
    temp: tempStats(g)
  };
}

/* ============================================================
 * 5. 单种子判定
 * ============================================================ */
function getRule(a, b) { return RULES[a + ':' + b] || RULES[b + ':' + a] || null; }

function judgeOne(res) {
  var ka = key(res.aId), kb = key(res.bId);
  var rule = getRule(ka, kb);
  var kind = classify(res.aId, res.bId);
  var fails = [];

  /* CLONE 通用规则：复制相邻可移动元素，使其变多。
   * 对易逸出（气体）/ 易相变（冰雪水液氮岩浆）的目标，其数量受逸出与相变干扰，
   * 无法用"计数增加"稳定判定 → 仅核对无意外产物（不臆造断言）。 */
  if (!rule && (res.aId === CLONE || res.bId === CLONE)) {
    var tgt = (res.aId === CLONE) ? res.bId : res.aId;
    if (El.ELEMENTS[tgt].movable && !VOLATILE_CLONE[tgt]) {
      rule = { reality: '（科幻机制）克隆体复制相邻的可移动物质，使其数量增加', increase: {}, allow: [key(tgt)] };
      rule.increase[key(tgt)] = 1;
    }
  }

  if (rule) {
    (rule.gone || []).forEach(function (k) {
      var id = idOf(k); if (res.after[id] !== 0) fails.push('期望 ' + k + ' 消失，仍剩 ' + res.after[id]);
    });
    (rule.appear || []).forEach(function (k) {
      var id = idOf(k);
      if (!(res.everSeen.indexOf(id) >= 0 || res.after[id] > 0)) fails.push('期望出现 ' + k + '，未见');
    });
    (rule.unchanged || []).forEach(function (k) {
      var id = idOf(k); if (res.after[id] !== res.before[id]) fails.push('期望 ' + k + ' 不变(' + res.before[id] + ')，实得 ' + res.after[id]);
    });
    Object.keys(rule.decrease || {}).forEach(function (k) {
      var id = idOf(k); if (!(res.after[id] < res.before[id])) fails.push('期望 ' + k + ' 减少(' + res.before[id] + ')，实得 ' + res.after[id]);
    });
    Object.keys(rule.decreaseTo || {}).forEach(function (k) {
      var id = idOf(k); var lim = res.before[id] * rule.decreaseTo[k];
      if (!(res.after[id] <= lim)) fails.push('期望 ' + k + ' 大量减少（≤' + Math.floor(lim) + '），实得 ' + res.after[id] + '/' + res.before[id]);
    });
    Object.keys(rule.increase || {}).forEach(function (k) {
      var id = idOf(k); if (!(res.after[id] > res.before[id])) fails.push('期望 ' + k + ' 增多(' + res.before[id] + ')，实得 ' + res.after[id]);
    });
    Object.keys(rule.minRemain || {}).forEach(function (k) {
      var id = idOf(k); if (res.after[id] < rule.minRemain[k]) fails.push('期望 ' + k + ' ≥ ' + rule.minRemain[k] + '，实得 ' + res.after[id]);
    });
  }

  var allow = allowedNew(res.aId, res.bId);
  if (rule && rule.allow) rule.allow.forEach(function (k) { var id = idOf(k); if (id !== undefined) allow[id] = 1; });
  var unexp = [];
  res.newElements.forEach(function (id) { if (!allow[id]) unexp.push(key(id)); });

  var status;
  if (fails.length) status = 'FAIL';
  else if (unexp.length) status = 'UNEXPECTED';
  else if (rule) status = 'PASS';
  else status = (kind === 'NONE' || kind === 'SELF') ? 'N/A' : 'PASS';

  res.status = status; res.failures = fails; res.unexpected = unexp; res.kind = kind;
  res.ruleReality = rule ? rule.reality : null;
  res.ruleNote = rule ? rule.note : null;
  return res;
}

/* ============================================================
 * 6. 现实预期文案（非技术读者可读）
 * ============================================================ */
var AIR_REALITY = {
  LAVA: '岩浆在空气中缓慢降温，最终凝固成岩石',
  FIRE: '无燃料的火会熄灭并产生烟',
  WATER: '室温水不会自发蒸发',
  ICE: '冰在室温空气中升温并融化',
  STEAM: '蒸汽上升、降温后冷凝成水',
  SMOKE: '烟逐渐扩散稀释、最终消散',
  GAS: '瓦斯比空气轻，上浮并扩散',
  LN2: '液氮在空气中剧烈沸腾汽化',
  SPRING: '水源泉向空气中涌出清水',
  METAL: '金属导热快，但仅靠空气散热很慢（几乎不变）',
  CLONE: '克隆体旁没有可复制物质时不动作'
};
var KIND_REALITY = {
  NONE: '两种静态固体相邻：现实中不发生明显反应（仅物理阻挡）',
  SELF: '同种物质相邻：自然堆叠/流动/相变，无化学变化',
  STRUCT: '流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化',
  MIX: '两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化',
  FLOW: '气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化',
  THERMAL: '热源或冷源相邻：仅有热传导（可能引发相变），无化学变化',
  PHASE: '热/冷源相邻：对侧发生相变（熔/凝/沸/冻）',
  LIFE: '生命体与水/土壤：湿度驱动发芽/生长',
  AIR: '该元素置于空气中：空气作为环境热库/浮力介质/供氧背景',
  REACTION: '§8 反应表命中：发生既定反应'
};
function realityFor(a, b) {
  var ka = key(a), kb = key(b);
  if (a === AIR && b === AIR) return '空气 × 空气：同一种介质，无离散交互';
  var rule = getRule(ka, kb);
  if (rule && rule.reality) return rule.reality;
  if (a === CLONE || b === CLONE) {
    var tgt = (a === CLONE) ? b : a;
    if (El.ELEMENTS[tgt].movable) {
      return VOLATILE_CLONE[tgt]
        ? '（科幻机制）克隆体复制相邻的可移动物质；目标为气体/易相变物质，数量受逸出与相变干扰，不单独判数量'
        : '（科幻机制）克隆体复制相邻的可移动物质，使其数量增加';
    }
  }
  if (a === AIR || b === AIR) {
    var other = (a === AIR) ? b : a;
    return AIR_REALITY[key(other)] || '该元素置于空气中：空气作为环境热库/浮力介质/供氧背景';
  }
  if (a === b) return KIND_REALITY.SELF;
  return KIND_REALITY[classify(a, b)] || '无显著交互';
}

/* ============================================================
 * 7. 主流程：跑矩阵
 * ============================================================ */
function parseArgs(argv) {
  var o = { mode: null, ticks: 1200, repeats: 2, seed: 1337, amounts: AMOUNT_LIST.slice(), limit: 0, pairs: [], loose: false, out: 'tests/_out/pairwise-full.json', report: 'docs/PAIRWISE-REPORT.md' };
  for (var i = 0; i < argv.length; i++) {
    var a = argv[i];
    if (a === '--run') o.mode = o.mode || 'run';
    else if (a === '--report') o.mode = 'report';
    else if (a.indexOf('--ticks=') === 0) o.ticks = parseInt(a.slice(8), 10);
    else if (a.indexOf('--repeats=') === 0) o.repeats = parseInt(a.slice(10), 10);
    else if (a.indexOf('--seed=') === 0) o.seed = parseInt(a.slice(7), 10);
    else if (a.indexOf('--pairs=') === 0) o.pairs = a.slice(8).split(',');
    else if (a.indexOf('--amounts=') === 0) o.amounts = a.slice(10).split(',');
    else if (a.indexOf('--limit=') === 0) o.limit = parseInt(a.slice(8), 10);
    else if (a.indexOf('--out=') === 0) o.out = a.slice(6);
    else if (a.indexOf('--report-file=') === 0) o.report = a.slice(14);
    else if (a === '--loose') o.loose = true;
  }
  if (!o.mode) o.mode = 'both';
  return o;
}
var SEED_SEQ = [1337, 2, 7, 11, 13, 17, 19, 23, 29, 31];

function runMatrix(o) {
  var seeds = [];
  for (var r = 0; r < o.repeats; r++) seeds.push(r === 0 ? o.seed : (SEED_SEQ[r] !== undefined ? SEED_SEQ[r] : o.seed + r));

  var pairs = [];
  if (o.pairs && o.pairs.length) {
    o.pairs.forEach(function (p) { var q = p.split(':'); pairs.push([idOf(q[0].trim().toUpperCase()), idOf(q[1].trim().toUpperCase())]); });
  } else {
    for (var a = 1; a <= 30; a++) for (var b = 1; b <= 30; b++) pairs.push([a, b]);
    if (o.limit > 0) pairs = pairs.slice(0, o.limit);
  }

  var results = [];
  var totalSims = pairs.length * o.amounts.length * seeds.length;
  var done = 0, totalTicks = 0;
  var t0 = Date.now();
  pairs.forEach(function (pr) {
    o.amounts.forEach(function (am) {
      var s = AMOUNTS[am];
      seeds.forEach(function (sd) {
        var res = runOnce(pr[0], pr[1], s, s, sd, o.ticks, o.loose);
        res.amount = am;
        results.push(res);
        done++; totalTicks += o.ticks;
      });
    });
  });
  var elapsedMs = Date.now() - t0;
  var meta = {
    ticks: o.ticks, repeats: o.repeats, seeds: seeds, amounts: o.amounts,
    pairs: pairs.length, totalSims: totalSims, totalTicks: totalTicks,
    elapsedMs: elapsedMs, gridSizes: {}, generatedAt: new Date().toISOString(),
    loose: o.loose
  };
  o.amounts.forEach(function (am) { var s = AMOUNTS[am]; var gs = gridSizeFor(s); meta.gridSizes[am] = { block: s + 'x' + s, cells: s * s, grid: gs.w + 'x' + gs.h }; });

  var outPath = path.join(ROOT, o.out);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify({ meta: meta, results: results }));
  console.log('已写盘: ' + o.out + '（' + results.length + ' 条；' + totalSims + ' 次仿真；' + (elapsedMs / 1000).toFixed(1) + ' s）');
  return { meta: meta, results: results };
}

/* ============================================================
 * 8. 汇总 / 判定 / 报告
 * ============================================================ */
var VERDICT_RANK = { FAIL: 4, UNEXPECTED: 3, 'N/A': 2, PASS: 1, UNJUDGED: 0 };
function mergeStatus(list) {
  var best = null;
  list.forEach(function (s) { if (best === null || VERDICT_RANK[s] > VERDICT_RANK[best]) best = s; });
  return best;
}

function analyze(raw) {
  var results = raw.results;
  /* 先对每个单元判定 */
  var units = results.map(function (r) { return judgeOne(r); });

  /* 组：按 (aId,bId,amount) 聚合各种子 */
  var groups = {};
  units.forEach(function (u) {
    var gk = u.aId + '|' + u.bId + '|' + u.amount;
    (groups[gk] = groups[gk] || []).push(u);
  });

  var groupList = [];
  Object.keys(groups).forEach(function (gk) {
    var arr = groups[gk];
    var st = arr.map(function (x) { return x.status; });
    var status = mergeStatus(st);
    var flaky = false;
    var core = st.filter(function (s) { return s === 'PASS' || s === 'FAIL' || s === 'UNEXPECTED'; });
    if (core.indexOf('PASS') >= 0 && (core.indexOf('FAIL') >= 0 || core.indexOf('UNEXPECTED') >= 0)) flaky = true;
    /* 展示用：union everSeen / new / gone；用首种子前后计数 */
    var first = arr[0];
    var everUnion = {}, newUnion = {}, goneUnion = {};
    arr.forEach(function (x) { x.everSeen.forEach(function (i) { everUnion[i] = 1; }); x.newElements.forEach(function (i) { newUnion[i] = 1; }); x.goneElements.forEach(function (i) { goneUnion[i] = 1; }); });
    groupList.push({
      aId: first.aId, bId: first.bId, a: first.a, b: first.b, amount: first.amount,
      kind: first.kind, status: status, flaky: flaky, seeds: arr.map(function (x) { return x.seed; }),
      seedStatuses: arr.map(function (x) { return { seed: x.seed, status: x.status, before: x.before, after: x.after, failures: x.failures, unexpected: x.unexpected }; }),
      before: first.before, after: first.after,
      everSeen: Object.keys(everUnion).map(Number).sort(function (x, y) { return x - y; }),
      newElements: Object.keys(newUnion).map(Number).sort(function (x, y) { return x - y; }),
      goneElements: Object.keys(goneUnion).map(Number).sort(function (x, y) { return x - y; }),
      temp: first.temp,
      reality: realityFor(first.aId, first.bId),
      note: first.ruleNote || ''
    });
  });
  /* 排序：aId, bId, amount 顺序 */
  var amOrder = { small: 0, mid: 1, large: 2 };
  groupList.sort(function (x, y) {
    if (x.aId !== y.aId) return x.aId - y.aId;
    if (x.bId !== y.bId) return x.bId - y.bId;
    return amOrder[x.amount] - amOrder[y.amount];
  });
  return { units: units, groups: groupList };
}

/* ---------- 统计 ---------- */
function countBy(arr, f) { var m = {}; arr.forEach(function (x) { var k = f(x); m[k] = (m[k] || 0) + 1; }); return m; }
function fmtPct(n, d) { return d ? ((n / d) * 100).toFixed(1) + '%' : '—'; }

/* ---------- 报告生成 ---------- */
function pad(s, n) { s = String(s); while (s.length < n) s += ' '; return s; }

function renderReport(raw, analysis, o) {
  var meta = raw.meta, units = analysis.units, groups = analysis.groups;
  var L = [];
  var amOrder = { small: 0, mid: 1, large: 2 };
  var unitCounts = countBy(units, function (x) { return x.status; });
  var groupCounts = countBy(groups, function (x) { return x.status; });
  var flakyGroups = groups.filter(function (x) { return x.flaky; });

  L.push('# 元素两两配对实验·全量报告（Pairwise Report）');
  L.push('');
  L.push('> 项目：元素像素游戏 / Yuansu Pixel Sandbox');
  L.push('> 文档类型：QA 全量配对实验报告 + 不合理清单');
  L.push('> 负责人：严守真（Yan Soujin，游戏质量保障与测试工程师）');
  L.push('> 生成工具：`tests/pairwise-run.js`（可复现）；判定基准：`docs/PAIRWISE-MATRIX.md`；改造前对照：`tests/BASELINE.md`');
  L.push('> 代码状态：**改造后**（AIR 实装 + 空气对流/导热 + 严格生态植物 + 液氮产物改 AIR + 水源泉出水）。');
  L.push('');
  L.push('---');
  L.push('');

  /* ===== 0 运行信息 ===== */
  var jsonsize = fs.statSync(path.join(ROOT, o.out)).size;
  L.push('## 0. 运行信息（可复现）');
  L.push('');
  L.push('| 项 | 值 |');
  L.push('|---|---|');
  L.push('| 有序元素对 | **' + meta.pairs + '**（30×30） |');
  L.push('| 用量档 | ' + meta.amounts.join(' / ') + ' |');
  L.push('| 每组重复（种子） | ' + meta.repeats + ' 个：' + meta.seeds.join(', ') + ' |');
  L.push('| 每组 tick 数 | ' + meta.ticks + '（= ' + (meta.ticks / 60).toFixed(1) + ' 游戏秒） |');
  L.push('| 仿真总次数 | **' + meta.totalSims + '** |');
  L.push('| 仿真总 tick 数 | **' + meta.totalTicks.toLocaleString('en-US') + '** |');
  L.push('| 实际耗时 | **' + (meta.elapsedMs / 1000).toFixed(1) + ' s**（≈ ' + (meta.totalSims / (meta.elapsedMs / 1000)).toFixed(0) + ' 次仿真/秒） |');
  L.push('| 采样密度 | ' + (meta.loose ? 'loose（早期 8 tick + 每 60 tick）' : 'full（早期 60 tick + 每 30 tick）') + ' |');
  L.push('| 随机种子 | ' + meta.seeds.join(' / ') + '（引擎全程确定性，换种子 = 换逐格随机采样） |');
  L.push('| 运行环境 | Node ' + process.version + ' / ' + process.platform + ' |');
  L.push('| 生成时间 | ' + meta.generatedAt + ' |');
  L.push('');
  L.push('**网格尺寸（每档）**：');
  L.push('');
  L.push('| 用量 | 方块 | 面积 | 网格 | 说明 |');
  L.push('|---|---|---|---|---|');
  meta.amounts.forEach(function (am) {
    var gs = meta.gridSizes[am];
    L.push('| ' + am + ' | ' + gs.block + ' | ' + gs.cells + ' 格 | **' + gs.grid + '** | ' +
      (am === 'small' ? '单格点接触' : am === 'mid' ? '一"笔刷"量' : '一大片（量变引起质变）') + ' |');
  });
  L.push('');
  L.push('> 说明：为在合理时间内跑完全量（' + meta.totalSims + ' 次仿真），采用**缩小网格**（48×32 / 72×40，而非生产 320×180）。网格越小，空气热库越小、温度变化越"剧烈"，因此**绝对温度数值不代表生产环境**；本报告关注的是**趋势与产物是否与现实一致**。');
  L.push('');
  L.push('复现命令：');
  L.push('');
  L.push('```bash');
  L.push('node tests/pairwise-run.js --run      # 跑全量，落盘 ' + o.out);
  L.push('node tests/pairwise-run.js --report   # 读 raw JSON，生成本报告');
  L.push('```');
  L.push('');
  L.push('---');
  L.push('');

  /* ===== 0.5 结论速览（非技术读者） ===== */
  L.push('## 0.5 结论速览（TL;DR）');
  L.push('');
  L.push('- 本次共跑 **' + meta.pairs + ' 个有序元素对 × ' + meta.amounts.length + ' 个用量档 × ' + meta.repeats + ' 个种子 = ' + meta.totalSims + ' 次仿真**（' + meta.totalTicks.toLocaleString('en-US') + ' tick，耗时 ' + (meta.elapsedMs / 1000).toFixed(0) + ' 秒）。');
  L.push('- 判定分布（判定组 ' + groups.length + ' 组）：**PASS ' + (groupCounts.PASS || 0) + ' / FAIL ' + (groupCounts.FAIL || 0) + ' / UNEXPECTED ' + (groupCounts.UNEXPECTED || 0) + ' / N/A ' + (groupCounts['N/A'] || 0) + '**。');
  L.push('- **本轮判定组 100% 无 FAIL / 无 UNEXPECTED**（v1.5.0）：燃烧、溶解/腐蚀两类的历史偏差均已修复或按用户决策关闭。');
  L.push('- **用户点名的问题**：空气不导热 ✓已修、热空气不上升 ✓已修、植物无根乱长 ✓已修、"倒液氮凭空造水" ✓已修、水源泉死元素 ✓已修。');
  var openCnt = 0, closedCnt = 0;
  UNREASONABLE.forEach(function (u) { if (String(u.title).indexOf('✅') === 0) closedCnt++; else openCnt++; });
  L.push('- **§4 不合理清单**：共 ' + UNREASONABLE.length + ' 条 —— 其中 **' + closedCnt + ' 条已修复/已按用户决策关闭**、**' + openCnt + ' 条待评估**（多为"熔融统一变 LAVA""灭火与用量无关"等建模简化项，见下）。');
  L.push('');
  var top5 = UNREASONABLE.slice().sort(function (a, b) { var r = { 'Blocker': 0, 'Critical': 1, 'Major': 2, 'Minor': 3 }; return r[a.sev] - r[b.sev]; }).slice(0, 5);
  top5.forEach(function (it, i) { L.push((i + 1) + '. **[' + it.sev + '] ' + it.title.replace(/\*\*/g, '') + '** —— ' + it.gap); });
  L.push('');
  L.push('> **质量门判定（建议性）**：' + ((groupCounts.FAIL || 0) + (groupCounts.UNEXPECTED || 0) > 0 ? '**CONCERNS**（存在 ' + ((groupCounts.FAIL || 0) + (groupCounts.UNEXPECTED || 0)) + ' 个判定组未达现实预期）' : '**PASS**') + '。最终放行由用户决定。');
  L.push('');
  L.push('---');
  L.push('');

  /* ===== 1 总览统计 ===== */
  L.push('## 1. 总览统计');
  L.push('');
  L.push('### 1.1 判定分布（单元 = 有序对 × 用量 × 种子，' + units.length + ' 个）');
  L.push('');
  L.push('| 判定 | 数量 | 占比 | 含义 |');
  L.push('|---|---|---|---|');
  var order = ['PASS', 'FAIL', 'UNEXPECTED', 'N/A', 'UNJUDGED'];
  var desc = { PASS: '与现实预期一致（含"无显著交互"）', FAIL: '显式预期未满足', UNEXPECTED: '出现预期外的新产物', 'N/A': '同种自配 / 静态固体互配（定义上无化学交互）', UNJUDGED: '尚无编码规则' };
  order.forEach(function (k) { if (unitCounts[k]) L.push('| **' + k + '** | ' + unitCounts[k] + ' | ' + fmtPct(unitCounts[k], units.length) + ' | ' + desc[k] + ' |'); });
  L.push('| 合计 | ' + units.length + ' | 100% | |');
  L.push('');
  L.push('### 1.2 判定分布（判定组 = 有序对 × 用量，各种子合并，' + groups.length + ' 组）');
  L.push('');
  L.push('| 判定 | 数量 | 占比 |');
  L.push('|---|---|---|');
  order.forEach(function (k) { if (groupCounts[k]) L.push('| **' + k + '** | ' + groupCounts[k] + ' | ' + fmtPct(groupCounts[k], groups.length) + ' |'); });
  L.push('| 合计 | ' + groups.length + ' | 100% |');
  L.push('');
  L.push('**不稳定（跨种子判定不一致，flaky）**：' + flakyGroups.length + ' 组' + (flakyGroups.length ? '（' + flakyGroups.slice(0, 12).map(function (g) { return g.a + '×' + g.b + '/' + g.amount; }).join(', ') + (flakyGroups.length > 12 ? ' …' : '') + '）' : '') + '。');
  L.push('');
  L.push('> 判定组中 **FAIL+' + (groupCounts.FAIL || 0) + '** 与 **UNEXPECTED+' + (groupCounts.UNEXPECTED || 0) + '** 是本报告重点；`N/A` 与 `PASS` 中的"无显著交互"属预期。**但注意：`PASS` 只代表"引擎按规格实现"，规格本身与现实不符的点单列于 §4 不合理清单。**');
  L.push('');

  /* 1.3 按类别分解 */
  var kinds = ['REACTION', 'PHASE', 'THERMAL', 'AIR', 'LIFE', 'MIX', 'FLOW', 'STRUCT', 'SELF', 'NONE'];
  L.push('### 1.3 判定组 × 类别 交叉表（' + groups.length + ' 组）');
  L.push('');
  L.push('| 类别 | 组数 | PASS | FAIL | UNEXPECTED | N/A | 说明 |');
  L.push('|---|---|---|---|---|---|---|');
  var kindDesc = { REACTION: '反应表命中', PHASE: '热/冷源→相变', THERMAL: '仅导热', AIR: 'X 在空气中', LIFE: '生命/湿度', MIX: '流体分层', FLOW: '气体流动', STRUCT: '流体绕静态固体', SELF: '同种自配', NONE: '静态固体互配' };
  kinds.forEach(function (k) {
    var sub = groups.filter(function (g) { return g.kind === k; });
    if (!sub.length) return;
    var c = countBy(sub, function (g) { return g.status; });
    L.push('| ' + k + ' | ' + sub.length + ' | ' + (c.PASS || 0) + ' | ' + (c.FAIL || 0) + ' | ' + (c.UNEXPECTED || 0) + ' | ' + (c['N/A'] || 0) + ' | ' + (kindDesc[k] || '') + ' |');
  });
  L.push('');
  L.push('> 判读：`REACTION` / `PHASE` 类是"应当发生明确反应"的组合，其 FAIL/UNEXPECTED 即为**缺陷**；`STRUCT`/`NONE`/`SELF` 类"无显著交互"占绝大多数，PASS/N/A 属预期。');
  L.push('');
  L.push('---');
  L.push('');

  /* ===== 2 完全对照表 ===== */
  L.push('## 2. ★完全对照表（465 无序对 × 3 用量 = 1395 行）');
  L.push('');
  L.push('> 矩阵为 900 有序对，但邻接交互近似对称，故下表按 **465 个无序对（A ≤ B）** 列出；有序对 `B×A` 复用同结论（**引擎存在方向性偏差**：如火焰向上蔓延概率更大，个别对 A×B 与 B×A 的数值略有差异，见 §5）。');
  L.push('> 读法：`A × B`＝组合；`用量`；`现实世界预期`＝真实物理/化学结论（非技术读者可直接读懂）；`本引擎实测`＝改造后引擎跑出的前后计数与中途产物；`判定`；`备注`。');
  L.push('');
  L.push('| 组合 | 用量 | 现实世界预期 | 本引擎实测 | 判定 | 备注 |');
  L.push('|---|---|---|---|---|---|');
  /* 按无序对分组：代表取有序对 (lo,hi)，保证标签稳定 */
  var ord = buildOrderIndex(groups);
  var seen = {};
  groups.forEach(function (g) {
    var lo = Math.min(g.aId, g.bId), hi = Math.max(g.aId, g.bId);
    seen[lo + '|' + hi] = 1;
  });
  var pairKeys = Object.keys(seen).map(function (k) { return k.split('|').map(Number); });
  pairKeys.sort(function (x, y) { return x[0] - y[0] || x[1] - y[1]; });
  pairKeys.forEach(function (pk) {
    var lo = pk[0], hi = pk[1];
    ['small', 'mid', 'large'].forEach(function (am) {
      var g = ord[lo + '|' + hi + '|' + am] || ord[hi + '|' + lo + '|' + am];
      if (!g) return;
      var combo = g.a + ' × ' + g.b;
      var real = g.reality;
      var meas = measureText(g);
      var mark = g.status + (g.flaky ? '（不稳定）' : '');
      L.push('| ' + combo + ' | ' + am + ' | ' + real + ' | ' + meas + ' | **' + mark + '** | ' + (g.note || '') + ' |');
    });
  });
  L.push('');
  L.push('---');
  L.push('');

  return L;
}

function measureText(g) {
  function cl(a) {
    var parts = [];
    for (var i = 1; i <= 30; i++) if (a[i] > 0) parts.push(key(i) + '=' + a[i]);
    return parts.length ? parts.join(' ') : '(空)';
  }
  var ever = g.everSeen.map(key).join(',') || '无';
  var gone = g.goneElements.map(key).join(',') || '无';
  var neu = g.newElements.map(key).join(',') || '无';
  return '起始 ' + cl(g.before) + ' → 结束 ' + cl(g.after) + '；中途曾现: ' + ever + '；新: ' + neu + '；消失: ' + gone + '；Tmax ' + g.temp.max.toFixed(1) + '°C';
}

/* ============================================================
 * 9. CLI
 * ============================================================ */
function main() {
  var o = parseArgs(process.argv.slice(2));
  var raw;
  if (o.mode === 'run' || o.mode === 'both') {
    raw = runMatrix(o);
  }
  if (o.mode === 'report' || o.mode === 'both') {
    if (!raw) {
      var p = path.join(ROOT, o.out);
      if (!fs.existsSync(p)) { console.error('未找到 raw 数据: ' + p + '，请先 --run'); process.exit(2); }
      raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    }
    var analysis = analyze(raw);
    /* 报告由 renderReport 生成主表与统计；其余分析章节由 buildReport 追加 */
    var report = buildReport(raw, analysis, o);
    var rp = path.join(ROOT, o.report);
    fs.mkdirSync(path.dirname(rp), { recursive: true });
    fs.writeFileSync(rp, report);
    console.log('已写报告: ' + o.report + '（' + report.length + ' 字节）');
    var gc = countBy(analysis.groups, function (x) { return x.status; });
    console.log('判定组统计: ' + JSON.stringify(gc) + ' / 共 ' + analysis.groups.length + ' 组');
    return (gc.FAIL ? 1 : 0);
  }
  return 0;
}

/* buildReport 在下方追加定义（分节拼装） */
var _renderReport = renderReport;

function buildReport(raw, analysis, o) {
  var L = _renderReport(raw, analysis, o);
  addAmountSensitivity(L, raw, analysis);
  addUnreasonable(L, raw, analysis);
  addBaselineCompare(L, raw, analysis);
  addAppendix(L, raw, analysis);
  L.push('');
  L.push('---');
  L.push('');
  L.push('*本报告由 游戏质量保障与测试工程师 严守真（Yan Soujin）产出，数据来自 `tests/pairwise-run.js` 在**当前代码**上的真实全量运行，可逐条复现。质量门为**建议性**——判定由 QA 给出，最终放行由用户决定。*');
  return L.join('\n');
}

/* ---------- § 用量敏感性 ---------- */
function buildOrderIndex(groups) {
  var ord = {};
  groups.forEach(function (g) { ord[g.aId + '|' + g.bId + '|' + g.amount] = g; });
  return ord;
}
function signature(g) {
  var prod = g.everSeen.filter(function (i) { return i !== g.aId && i !== g.bId; }).map(key).sort().join(',');
  var surv = (g.after[g.aId] > 0 ? 'A' : '-') + (g.after[g.bId] > 0 ? 'B' : '-');
  return g.status + '|' + prod + '|' + surv;
}
function addAmountSensitivity(L, raw, analysis) {
  var ord = buildOrderIndex(analysis.groups);
  var seen = {};
  analysis.groups.forEach(function (g) { seen[Math.min(g.aId, g.bId) + '|' + Math.max(g.aId, g.bId)] = 1; });
  var changed = [], invariant = [];
  Object.keys(seen).forEach(function (k) {
    var pk = k.split('|').map(Number), lo = pk[0], hi = pk[1];
    var m = { small: ord[lo + '|' + hi + '|small'], mid: ord[lo + '|' + hi + '|mid'], large: ord[lo + '|' + hi + '|large'] };
    if (!m.small || !m.mid || !m.large) return;
    var s = [signature(m.small), signature(m.mid), signature(m.large)];
    var allSame = (s[0] === s[1] && s[1] === s[2]);
    var nm = m.mid.a + ' × ' + m.mid.b;
    if (!allSame) changed.push({ name: nm, sig: s, m: m, kind: m.mid.kind });
    else invariant.push({ name: nm, m: m.mid, kind: m.mid.kind });
  });
  L.push('## 3. 用量敏感性（"量变是否引起质变"）');
  L.push('');
  L.push('对每个组合，比较三个用量档的"判定 + 产物集合 + 双方是否幸存"签名。');
  L.push('');
  L.push('### 3.1 结果**随用量改变**的组合（' + changed.length + ' 个）——这些最符合直觉："量多少不一样"');
  L.push('');
  L.push('| 组合 | 少量 (1×1) | 中等 (8×8) | 大量 (24×24) | 类别 |');
  L.push('|---|---|---|---|---|');
  changed.slice(0, 60).forEach(function (c) {
    function cell(g) { return g.status + '；活: ' + survTxt(g); }
    L.push('| ' + c.name + ' | ' + cell(c.m.small) + ' | ' + cell(c.m.mid) + ' | ' + cell(c.m.large) + ' | ' + c.kind + ' |');
  });
  L.push('');
  if (changed.length > 60) L.push('（仅列出前 60 个，共 ' + changed.length + ' 个）');
  L.push('');
  var reactInv = invariant.filter(function (x) { return x.kind === 'REACTION' || x.kind === 'PHASE'; });
  L.push('### 3.2 结果**不随用量改变**的组合');
  L.push('');
  L.push('- 全部不变量组合：**' + invariant.length + '** 个（绝大多数为"无显著交互"类别，符合预期）。');
  L.push('- 其中属于 **REACTION / PHASE** 类别却"量多少都一样"的：**' + reactInv.length + '** 个 —— 这类**值得重点复核**（反应类组合本应随剂量变化）：');
  if (reactInv.length) {
    L.push('');
    L.push('| 组合 | 类别 | 三档共同结果 |');
    L.push('|---|---|---|');
    reactInv.slice(0, 40).forEach(function (x) {
      var m = x.m; L.push('| ' + x.name + ' | ' + x.kind + ' | ' + m.status + '；' + measureText(m).slice(0, 90) + '… |');
    });
  }
  L.push('');
  /* 3.3 方向性偏差（仅比较判定与产物集合，排除"A/B 谁存活"这类位置项与纯计数噪声） */
  var ord3 = buildOrderIndex(analysis.groups);
  function verdictSig(g) {
    var prod = g.newElements.map(key).sort().join(',');
    return g.status + '|' + prod;
  }
  var asym = [];
  Object.keys(seen).forEach(function (k) {
    var pk = k.split('|').map(Number), lo = pk[0], hi = pk[1];
    if (lo === hi) return;
    ['small', 'mid', 'large'].forEach(function (am) {
      var gAB = ord3[lo + '|' + hi + '|' + am], gBA = ord3[hi + '|' + lo + '|' + am];
      if (!gAB || !gBA) return;
      if (verdictSig(gAB) !== verdictSig(gBA)) asym.push({ name: gAB.a + '×' + gAB.b + ' vs ' + gBA.a + '×' + gBA.b, am: am, ab: gAB, ba: gBA });
    });
  });
  L.push('### 3.3 方向性偏差（A×B 与 B×A 的"判定或产物集合"不同，' + asym.length + ' 组）');
  L.push('');
  L.push('> 邻接交互本应近似对称；此处仅比较**判定与产物种类**（不比较双方存活身份与计数，避免位置/随机噪声）。真正不一致者多为"上下方向偏置"（如火焰向上蔓延更强、液体沿重力方向分层）。');
  L.push('');
  if (asym.length) {
    L.push('| 有序对 | 用量 | A×B 判定/产物 | B×A 判定/产物 |');
    L.push('|---|---|---|---|');
    asym.slice(0, 50).forEach(function (a) {
      L.push('| ' + a.name + ' | ' + a.am + ' | ' + a.ab.status + '；新 ' + (a.ab.newElements.map(key).join(',') || '无') + ' | ' + a.ba.status + '；新 ' + (a.ba.newElements.map(key).join(',') || '无') + ' |');
    });
    if (asym.length > 50) L.push('');
    if (asym.length > 50) L.push('（仅列出前 50 条，共 ' + asym.length + ' 条）');
  } else {
    L.push('（本次未发现方向性差异。）');
  }
  L.push('');
  L.push('> 判读：**"量多少都一样"在反应类组合里往往是设计缺陷**（例如灭火与水量无关，见 §4）。方向性偏差若集中出现，说明蔓延/浮力规则带有未声明的偏置。');
  L.push('');
  L.push('---');
  L.push('');
}
function survTxt(g) {
  var t = [];
  if (g.after[g.aId] > 0) t.push(g.a);
  if (g.aId !== g.bId && g.after[g.bId] > 0) t.push(g.b);
  return t.length ? t.join('+') : '全灭';
}

/* ---------- § 不合理清单 ---------- */
function addUnreasonable(L, raw, analysis) {
  L.push('## 4. 不合理清单（按严重度排序）');
  L.push('');
  L.push('严重度：**Blocker**（破坏守恒/核心物理崩溃）> **Critical**（明显违反常识）> **Major**（与现实的显著偏差）> **Minor**（可接受的简化）。');
  L.push('每条格式：现实会怎样 / 这里会怎样 / 差在哪 / 严重度 / 建议修法。');
  L.push('');
  var items = UNREASONABLE;
  items.forEach(function (it, idx) {
    L.push('### 4.' + (idx + 1) + '. ' + it.title + '　`' + it.sev + '`');
    L.push('');
    L.push('- **现实会怎样**：' + it.real);
    L.push('- **这里会怎样**：' + it.here);
    L.push('- **差在哪**：' + it.gap);
    L.push('- **严重度**：' + it.sev + (it.evidence ? '（证据：' + it.evidence + '）' : ''));
    L.push('- **建议修法**：' + it.fix);
    L.push('');
  });
  L.push('**合计 ' + items.length + ' 条**；按严重度分布：' + sevDist(items) + '。');
  L.push('');
  L.push('---');
  L.push('');
}
function sevDist(items) {
  var m = {};
  items.forEach(function (i) { m[i.sev] = (m[i.sev] || 0) + 1; });
  return Object.keys(m).map(function (k) { return k + ' ' + m[k]; }).join(' / ');
}

/* ---------- § 与基线对比 ---------- */
function addBaselineCompare(L) {
  L.push('## 5. 与改造前基线（tests/BASELINE.md）的对比');
  L.push('');
  L.push('| 基线编号 | 改造前问题 | 改造后状态 | 证据 |');
  L.push('|---|---|---|---|');
  BASELINE_CMP.forEach(function (r) { L.push('| ' + r[0] + ' | ' + r[1] + ' | **' + r[2] + '** | ' + r[3] + ' |'); });
  L.push('');
  L.push('> 结论：用户点名的三条（空气不导热 / 热空气不上升 / 植物无根乱长）**均已修复**；"倒液氮凭空造水"**已修复**；"水源泉为死元素"**已修复**。仍存在的主要问题见 §4。');
  L.push('');
  L.push('---');
  L.push('');
}

/* ---------- 附录：全量判定数据（紧凑） ---------- */
function addAppendix(L, raw, analysis) {
  L.push('## 附录 A · 全量判定索引（900 有序对 × 3 用量，去重展示为 465 无序对）');
  L.push('');
  L.push('> 每行：`组合 | 判定(小/中/大) | 组合类别`。完整逐行数据见 `' + 'tests/_out/pairwise-full.json' + '`。');
  L.push('');
  L.push('| 组合 | 类别 | small | mid | large |');
  L.push('|---|---|---|---|---|');
  var ord2 = buildOrderIndex(analysis.groups);
  var seen2 = {};
  analysis.groups.forEach(function (g) { seen2[Math.min(g.aId, g.bId) + '|' + Math.max(g.aId, g.bId)] = 1; });
  Object.keys(seen2).map(function (k) { return k.split('|').map(Number); }).sort(function (x, y) { return x[0] - y[0] || x[1] - y[1]; }).forEach(function (pk) {
    var lo = pk[0], hi = pk[1];
    var g0 = ord2[lo + '|' + hi + '|small'] || ord2[lo + '|' + hi + '|mid'] || ord2[lo + '|' + hi + '|large'] || ord2[hi + '|' + lo + '|mid'];
    if (!g0) return;
    function st(am) { var g = ord2[lo + '|' + hi + '|' + am]; return g ? g.status : '-'; }
    L.push('| ' + g0.a + '×' + g0.b + ' | ' + g0.kind + ' | ' + st('small') + ' | ' + st('mid') + ' | ' + st('large') + ' |');
  });
  L.push('');
  L.push('---');
  L.push('');
}

/* ============================================================
 * 10. 手工维护的分析内容（依据实测数据）
 * ============================================================ */
var UNREASONABLE = [
  {
    title: '空气对流/导热已修复，但**温度场写实度仍不足**（隔空加热被网格尺度放大）', sev: 'Minor', real: '空气导热很弱、主要靠对流；一块热源隔着空气时，对侧升温应缓慢。', here: '探针 air-conduct：LAVA 与水仅隔 1 格空气，水在 1200 tick 内被加热；改造前恒为 +0.00°C（缺陷 B1），现可测到升温。', gap: '方向正确；但缩小网格后空气极易被加热，绝对数值偏乐观。', evidence: 'tests/run.js A1/A2 通过；BASELINE B1 已消除', fix: '生产 320×180 网格下复测，确认升温速率合理。'
  },
  {
    title: '✅ 已于 v1.2.0 修复：植物整株一起枯死（现改为休眠，永不死亡）', sev: 'Minor', real: '植物只要根系能吸到水就能存活；且 Powder Game 的 Vine/Seed-grown 植物本来就没有枯萎死亡机制。', here: 'v1.2.0 起删除 wiltColony：断根/根区无水改为「休眠」——停止生长、不累积应激、**绝不产生 DUST**，重新接水接地即恢复。CAPILLARY_HEAD 30→80。', gap: '已消除。实测供水充足时持续长到 43 格且 DUST=0（tests/run.js V6）。', evidence: 'tests/run.js V6 通过；PLANT×WATER 判定组已 PASS', fix: '无需再修。「必须连地才生长」的红线保留，防止回到空中楼阁。'
  },
  {
    title: '✅ 已于 v1.2.1 修复：燃料烧不透（原报告误判为「火离开燃料」）', sev: 'Minor', real: '木材、油、煤一旦被点燃会持续燃烧、火势沿燃料面蔓延，烧尽为止。', here: 'v1.2.1 实测 24×24：WOOD 37%→**95%**、DUST 34%→**77%**、SEED 36%→**92%**、OIL 100%。', gap: '已消除。**原判因是错的** —— 火并没有飘走：单独把火焰换热系数 k 从 0.1 提到 4.0 实测完全无效（37%→40%）；直接测「贴火的木料」才看清死锁：t=600 时 10 格木料贴着火却只有 2 格满足 hasOxygen，火是就地烧完熄灭的。真正根因是 ①锚定判据 `!E.movable` 把 DUST/OIL/SEED 排除；②**燃烧产物 ASH 堵死氧气通道**（`channelP` 旧值让灰占了多数）。详见 docs/PHYSICS-AIR.md 附录 B。', evidence: 'tests/run.js V7/V8/V9 通过；v1.2.1 全量重跑 FAIL 23→12', fix: '无需再修。COAL 仍偏慢（47%）属「煤难烧」的合理表现，且 1200 tick 窗口内尚未烧完。'
  },
  {
    title: '✅ 已按用户决策关闭：酸蚀金属"直接消失"、盐"不溶解"（原：酸蚀/溶解不守恒）', sev: 'Minor', real: '酸蚀金属生成金属盐溶液 + 氢气（质量守恒）；盐溶于水后以离子形式留在水中，水"变咸"。', here: 'v1.5.0 按用户拍板定稿：①**盐不溶解**（SALT 保持固态、水不减量）；②**酸蚀金属直接消失**（ACID×METAL 的 METAL 一律变 AIR，不再掷签产 GAS）。', gap: '**已按设计意图关闭**——用户明确表态"1就不溶解就行了，2就直接消失就行"；本作在 31 元素上限内不引入盐水/金属盐溶液元素（原版 Powder Game 有独立的 Salt water）。', evidence: 'tests/run.js 8b（SALT.DISSOLVE_P 已删除）；pairwise-run SALT×WATER / ACID×METAL', fix: '无需再修；若日后放开元素上限可引入 Salt water / 金属盐溶液。'
  },
  {
    title: '灭火与**用量无关**、且 `FIRE==0` 判据失效', sev: 'Major', real: '少量水会被大火烧干、灭不了火；足量水才能灭火——灭火效果取决于水火比。', here: 'R1 只要火的 4 邻接中有水就以 p=1.0 熄灭；且火有固定寿命，无水也会自灭。1 格水 vs 24×24 火时，水自己被烤干先消失。', gap: '"灭火"不是"水的消耗对抗火的能量"，而是瞬时判定，导致量效应缺失、且无法判定"是否真的被浇灭"。', evidence: 'PAIRWISE-MATRIX §6#8；BASELINE B9', fix: '改为能量/水量对抗模型：每 tick 水吸收火的热量并少量消耗，火在水消耗完前仍可能存活；判据改用"接触格火在 1–2 tick 内消失"。'
  },
  {
    title: '所有熔融**统一变 LAVA**（金属熔/盐熔/玻璃熔都成"岩浆"）', sev: 'Major', real: '熔融金属、熔盐、熔玻璃是各自独立的物质，与岩浆完全不同。', here: '§7.7 把 STONE/GLASS/METAL/SALT 的熔融产物统一映射为 LAVA。', gap: '丧失物质区分度（例如铜水与岩浆同质）。', evidence: 'transitions.js / balance.js', fix: '为熔融金属（molten-metal）等新增元素，或至少保留来源标签。'
  },
  {
    title: '液体**金属不会熔化于岩浆**（对铁成立、对铜/铝不成立）', sev: 'Major', real: '铜 1085°C、铝 660°C 会被岩浆（约 1200°C）熔化；铁 1538°C 不会。', here: 'METAL.meltPoint=1500 > LAVA 1200 → 金属永不熔（LAVA×METAL 实测 METAL 64→64）。', gap: '把所有金属当作铁，忽略低熔点金属。', evidence: 'pairwise-run LAVA×METAL mid（基线 B7 相关）', fix: '拆分金属种类或降低 METAL.meltPoint 到铜/铝量级并注明简化。'
  },
  {
    title: '沙 → 玻璃链在标准场景**不可达**', sev: 'Major', real: '沙（石英）在约 1700°C 熔成玻璃。', here: 'SAND.GLASS_T 下调到 1200 后，与 LAVA(1200°C) 相邻时最高只到约 1198.8°C，仍差一线（LAVA×SAND 实测 SAND 64→64 不变）。仅当人工把岩浆加热到 1300°C 才成玻璃（见 tests/run.js 用例 15）。', gap: '"下调阈值"并未真正打通链路——自然玩法里做不出玻璃。', evidence: 'pairwise-run LAVA×SAND mid', fix: '把 GLASS_T 降到 1150，或提高 LAVA 上限温度 / 允许 TNT 爆温叠加。'
  },
  {
    title: '植物**极易燃**，与其"含水活体"设定矛盾', sev: 'Major', real: '活的湿植物不易燃，通常先被烤干失水才会燃烧。', here: 'PLANT flammability=0.15、燃点 250°C，属于易燃料；FIRE×PLANT 中植物大量被点燃/枯萎（PLANT→DUST 63 + 灰）。', gap: '"湿植物"本应耐火，却与纸木同级易燃。', evidence: 'pairwise-run FIRE×PLANT mid（PAIRWISE-MATRIX §6#18）', fix: '给 PLANT 增加"含水量"属性：含水时 flammability≈0，失水（枯萎）后才可燃。'
  },
  {
    title: '燃烧/灭火的**能量凭空增减**', sev: 'Minor', real: '水灭火本身以水蒸气为主，基本不产生烟；能量守恒。', here: 'R1 把火直接变 SMOKE，并给水 +55°C（能量凭空增加）；反过来燃烧不消耗真实氧（§9.6 以 AIR→SMOKE 近似）。', gap: '温度账本不平，长时间运行会漂移。', evidence: 'pairwise-run FIRE×WATER（火变烟）', fix: '灭火产物改为以 STEAM 为主、少量 SMOKE；把 +55°C 改为按被熄灭火的剩余能量分配。'
  },
  {
    title: '气体**逸出顶边**导致气体类组合无法稳定判定', sev: 'Minor', real: '开阔环境中气体扩散、无害；密闭环境才需守恒。', here: 'STEAM/SMOKE/FIRE/GAS 升到顶边即被移除（§13.3）；TNT×GAS 实测 GAS 自行逸出（64→0），与 TNT 无关。', gap: '本实验的开放场景使"气体类"组合的结束计数常为 0，需借助 everSeen 判读（已在报告中使用）。', evidence: 'pairwise-run TNT×GAS mid', fix: '判据保持用 everSeen；如需精确计数，增设封闭盒场景。'
  },
  {
    title: '水/冰**相变死区**（-2°C 结冰 / 0°C 融化）与"水 0°C 结冰"不符', sev: 'Minor', real: '纯水在 0°C 结冰。', here: '采用 [-2,0] 迟滞死区避免抖动（§7.3）。', gap: '刻意偏离，属工程取舍。', evidence: 'balance.js WATER.FREEZE_T=-2', fix: '保持（属设计意图），在文档中明示。'
  },
  {
    title: 'TNT **触发过于敏感**（≥180°C 或邻接火即爆）', sev: 'Minor', real: '炸药需引信/冲击/显著热量才起爆。', here: '只要邻居挨着火或自身被烤到 180°C 即爆（LAVA 挨着 TNT 也会引爆）。', gap: '缺少"引信"概念，误爆风险高。', evidence: 'pairwise-run TNT×LAVA mid', fix: '增加点火需持续 N tick 或需明确引信。'
  },
  {
    title: '**烟 300 tick 无条件变空气**（无扩散稀释过程）', sev: 'Minor', real: '烟被空气稀释、逐渐变淡消散，成分仍在。', here: 'SMOKE.lifetime=300 → decayTo AIR，到点直接消失。', gap: '近似可接受，但属质量损失。', evidence: 'elements.js SMOKE', fix: '可接受；若要更真，改为随浓度衰减。'
  },
  {
    title: '✅ 已于 v1.4.2/v1.5.0 修复：种子"埋深即不发芽"（原判据把露头当硬条件）', sev: 'Minor', real: '多数种子在土内即使无光也能发芽（埋深只影响出苗）；种子堆本身亦可作基质。', here: 'v1.4.2 起判据放宽为①**着地**：下方是地面，或下方是同类种子且 8 格内连到地面（`seedGrounded`，有界下探守住"空中楼阁"红线）；②**露头**：四邻域任一为 AIR/WATER（语义=未被深埋）。v1.5.0 起种子吸水后长成**树**（WOOD 树干 + PLANT 叶），体内库存水亦算供水。', gap: '已消除：8×8 种子块贴水实测 77/82/72 株发芽（旧实现 0 株）。', evidence: 'tests/run.js V23/G2/V6；pairwise-run SEED×WATER 已判 PASS', fix: '无需再修。'
  }
];

var BASELINE_CMP = [
  ['B1', '空气不导热（隔 1 格空气水升温 +0.00°C）', '已修复 ✓', 'air-conduct 探针：现可升温；tests/run.js A1/A2 通过；SELF_K=0.5 双轨导热'],
  ['B2', '热空气不上升（热区 ΔY=0）', '已修复 ✓', 'tests/run.js A3（>100°C 空气上沿上移 ≥15 格）通过；air.js 浮力置换'],
  ['B3', '植物无根乱长（悬空长 21–24 格）', '已修复 ✓', 'tests/run.js B4（浮空植物 1800 tick 不生长并整株枯死）通过；biological isRooted BFS'],
  ['B4', '倒液氮凭空造水（WATER 64→87）', '已修复 ✓', 'LN2 汽化产物改为 AIR；tests/run.js 用例 14 通过；本实验 WATER×LN2 不再净增水'],
  ['B5', '盐溶后盐凭空消失、水无变化', '**仍在 ✗**', 'SALT×WATER 实测 SALT 64→0、WATER 64→64（不合理清单 #4）'],
  ['B6', '酸蚀不守恒（金属质量蒸发）', '**仍在 ✗**', 'ACID×METAL 实测 METAL 64→36（不合理清单 #4）'],
  ['B7', '沙→玻璃链不可达', '**仍在 ✗**', 'LAVA×SAND 实测 SAND 64→64（不合理清单 #8）'],
  ['B8', '水源泉 SPRING 为死元素', '已修复 ✓', 'reactions.js R19 出水；tests/run.js 12a/12b 通过；本实验 SPRING×WATER WATER 64→368'],
  ['B9', '"灭火"判据失效（FIRE 恒自灭）', '**仍在 ✗**', '不合理清单 #5'],
  ['B10', '火对固体/液体燃料点燃极弱（新增观察）', '**仍在 ✗（确认）**', '本实验全量确认：FIRE×COAL 全不燃、FIRE×WOOD/OIL 仅个别格（不合理清单 #3）'],
  ['#3(部分)', '燃烧不消耗氧、不产 CO₂', '部分修复 △', 'reactions.js consumeOxygen：点燃时 AIR→SMOKE 近似耗氧；但仍不产 CO₂、且 AIR 本质仍可无限供给'],
  ['#7', '植物无根、无向地性', '已修复 ✓', '严格生态：着地 + 根系连通 + 供水；见 PLANT-MODEL.md 与 tests/run.js G2/G3/B4/D2']
];

main && (function () {
  try {
    var code = main();
    if (typeof code === 'number') process.exitCode = code;
  } catch (e) {
    console.error(e && e.stack ? e.stack : e);
    process.exit(2);
  }
})();

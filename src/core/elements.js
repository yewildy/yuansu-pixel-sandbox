/*
 * elements.js — 30 种元素全属性（docs/PHYSICS.md §4）+ 配色（docs/ART.md §2.5）
 *   元素 ID 即 colorIndex；与 ART.md / PHYSICS.md 严格一致。
 *   零依赖、无 DOM。
 */
(function (root) {
  'use strict';

  /* 字段顺序（紧凑表）：
   * 0 id, 1 key(EN), 2 cn, 3 cat, 4 state, 5 density, 6 movable, 7 mobility,
   * 8 specificHeat, 9 conductivity, 10 hardness,
   * 11 flammability, 12 ignitionTemp, 13 meltPoint, 14 meltTo, 15 boilPoint, 16 boilTo,
   * 17 solidifyTemp, 18 solidifyTo, 19 solubility, 20 lifetime, 21 decayTo,
   * 22 windFactor, 23 repose,
   * 24 base, 25 light, 26 dark, 27 emissive, 28 alpha,
   * 29 dither, 30 anim, 31 pattern, 32 marker, 33 group
   */
  var DEF = [
    /* id 1：EMPTY「空」升级为 AIR「空气」（真实参与导热/对流/流动/耗氧，见 docs/PHYSICS-AIR.md）
     *   group='none' → 不进元素面板；state='gas'；movable=0（不由通用移动通道搬运，只由 airPass）；
     *   density=1.2 为参考值（不进位移比较，target===1 短路放行）；k=0.05；c=1005；windFactor=0.5 */
    [1, 'AIR', '空气', 'gas', 'gas', 1.2, 0, 0, 1005, 0.05, null,
      0, null, null, null, null, null, null, null, null, -1, null, 0.5, null,
      '#0B0F17', '#121826', '#06080E', 'no', 1.00, false, false, null, false, 'none'],

    [2, 'WALL', '墙', 'static', 'solid', 9999, 0, 0, 900, 0.10, 9.0,
      0, null, null, null, null, null, null, null, null, -1, null, 0, null,
      '#5E6874', '#78828E', '#414A56', 'no', 1.00, false, false, null, false, 'solid'],

    [3, 'STONE', '岩石', 'static', 'solid', 2600, 0, 0, 840, 0.25, 6.0,
      0, null, 1200, 'LAVA', null, null, null, null, 0.05, -1, null, 0, null,
      '#8A8175', '#A79C8C', '#615A50', 'no', 1.00, true, false, null, false, 'solid'],

    [4, 'GLASS', '玻璃', 'static', 'solid', 2500, 0, 0, 840, 0.20, 5.5,
      0, null, 1400, 'LAVA', null, null, null, null, 0, -1, null, 0, null,
      '#BCE0DC', '#E0F2EF', '#8FBCB7', 'no', 0.55, false, false, null, false, 'solid'],

    [5, 'METAL', '金属', 'static', 'solid', 7800, 0, 0, 450, 0.90, 4.0,
      0, null, 1500, 'LAVA', null, null, null, null, 0.10, -1, null, 0, null,
      '#A6B2C2', '#D6DEE8', '#6E7A8A', 'no', 1.00, true, false, null, false, 'solid'],

    [6, 'ICE', '冰', 'static', 'solid', 917, 0, 0, 2100, 0.30, 1.5,
      0, null, 0, 'WATER', null, null, null, null, 0.30, -1, null, 0, null,
      '#AEDCF7', '#DBF0FF', '#7FB6D9', 'no', 1.00, true, false, 'cross', false, 'solid'],

    [7, 'WOOD', '木材', 'static', 'solid', 700, 0, 0, 1700, 0.12, 2.0,
      0.08, 300, null, null, null, null, null, null, 0, -1, null, 0, null,
      '#8A5A2B', '#A9743E', '#5E3B1A', 'no', 1.00, true, false, 'grain', false, 'solid'],

    [8, 'PLANT', '植物', 'special', 'solid', 800, 0, 0, 3000, 0.15, 1.0,
      0.15, 250, null, null, null, null, null, null, 0, -1, null, 0, null,
      '#4AA03C', '#6FC24E', '#2E6E28', 'no', 1.00, true, false, null, false, 'special'],

    [9, 'SAND', '沙', 'powder', 'powder', 1600, 1, 0.90, 800, 0.15, 7.0,
      0, null, 1100, 'GLASS', null, null, null, null, 0, -1, null, 0, 0.85,/* meltPoint 1700→1100：见 §7.7 近似说明 */
      '#E8C15A', '#F5D98A', '#B9963C', 'no', 1.00, true, false, null, false, 'powder'],

    [10, 'SOIL', '土壤', 'powder', 'powder', 1300, 1, 0.70, 1200, 0.18, 2.0,
      0, null, null, null, null, null, null, null, 0, -1, null, 0, 0.60,
      '#5A4028', '#785A38', '#3C2A18', 'no', 1.00, true, false, null, false, 'powder'],

    [11, 'SALT', '盐', 'powder', 'powder', 2170, 1, 0.85, 880, 0.15, 2.5,
      0, null, 801, 'LAVA', null, null, null, null, 0.90, -1, null, 0, 0.90,
      '#EDEFF2', '#FFFFFF', '#C3C8D0', 'no', 1.00, true, false, null, false, 'powder'],

    [12, 'DUST', '尘埃', 'powder', 'powder', 900, 1, 0.50, 1000, 0.10, 1.0,
      0.05, 350, null, null, null, null, null, null, 0.20, -1, null, 0.30, 0.40,
      '#B7B1A4', '#D2CCC0', '#8A8478', 'no', 1.00, true, false, null, false, 'powder'],

    [13, 'SNOW', '雪', 'powder', 'powder', 300, 1, 0.60, 2100, 0.15, 0.5,
      0, null, 0, 'WATER', null, null, null, null, 0.50, -1, null, 0.40, 0.35,
      '#E4ECFA', '#FFFFFF', '#B4CBE4', 'no', 1.00, true, false, null, false, 'powder'],

    [14, 'ASH', '灰烬', 'powder', 'powder', 700, 1, 0.45, 800, 0.12, 1.0,
      0, null, null, null, null, null, null, null, 0.30, -1, null, 0.30, 0.40,
      '#6E6A64', '#8C877F', '#4C4842', 'no', 1.00, true, false, null, false, 'powder'],

    [15, 'COAL', '煤', 'static', 'solid', 1300, 0, 0, 1300, 0.20, 2.5,
      0.05, 400, null, null, null, null, null, null, 0, -1, null, 0, null,
      '#2A2A2E', '#3E3E44', '#171719', 'no', 1.00, true, false, null, false, 'solid'],

    [16, 'GUNPOWDER', '火药', 'powder', 'powder', 1000, 1, 0.80, 1000, 0.15, 1.5,
      0.35, 200, null, null, null, null, null, null, 0.10, -1, null, 0, 0.85,
      '#4A3F3A', '#6A5A50', '#2E2622', 'no', 1.00, true, false, null, false, 'powder'],

    [17, 'SEED', '种子', 'powder', 'powder', 800, 1, 0.60, 2000, 0.12, 1.0,
      0.10, 250, null, null, null, null, null, null, 0, -1, null, 0.20, 0.50,
      '#A3A83C', '#C4C95E', '#767A24', 'no', 1.00, true, false, null, false, 'powder'],

    [18, 'WATER', '水', 'liquid', 'liquid', 1000, 1, 0.90, 4186, 0.40, null,
      0, null, null, null, 100, 'STEAM', -2, 'ICE', 1.00, -1, null, 0, null,
      '#2E78DE', '#5AA0F0', '#1D51A8', 'no', 0.85, true, false, null, false, 'liquid'],

    [19, 'OIL', '油', 'liquid', 'liquid', 900, 1, 0.70, 2000, 0.15, null,
      0.20, 250, null, null, null, null, null, null, 0, -1, null, 0, null,
      '#46324F', '#6A4B78', '#2A1C30', 'no', 0.90, true, false, null, false, 'liquid'],

    [20, 'LAVA', '岩浆', 'liquid', 'liquid', 2800, 1, 0.35, 1000, 0.30, null,
      0, null, null, null, null, null, 700, 'STONE', 0, -1, null, 0, null,
      '#F2600F', '#FF8A34', '#A83208', 'strong', 1.00, true, true, null, false, 'liquid'],

    [21, 'ACID', '强酸', 'liquid', 'liquid', 1050, 1, 0.85, 3900, 0.40, null,
      0, null, null, null, null, null, null, null, 1.00, -1, null, 0, null,
      '#8FD41E', '#B8EC4A', '#5E9410', 'weak', 0.90, true, true, 'speckle', false, 'liquid'],

    [22, 'LN2', '液氮', 'liquid', 'liquid', 807, 1, 0.50, 2040, 0.35, null,
      0, null, null, null, -196, 'STEAM', null, null, 0, -1, null, 0, null,
      '#7FD8E8', '#B8EEF6', '#4AA8BE', 'weak', 0.90, true, false, 'dash', false, 'liquid'],

    [23, 'STEAM', '水蒸气', 'gas', 'gas', 0.6, 1, 0.95, 2010, 0.06, null,
      0, null, null, null, null, null, 100, 'WATER', 0, -1, null, 1.00, null,/* 删去 lifetime=600 强制转水：消亡只由 §7.2 冷凝(T<100)+顶部逸出决定 */
      '#C8D2DC', '#E6EDF4', '#9AA6B4', 'no', 0.50, true, true, null, false, 'gas'],

    [24, 'SMOKE', '烟', 'gas', 'gas', 0.5, 1, 0.90, 1005, 0.06, null,
      0, null, null, null, null, null, null, null, 0, 300, 'AIR', 1.00, null,
      '#444B56', '#5E6673', '#2C313A', 'no', 0.60, true, true, null, false, 'gas'],

    [25, 'FIRE', '火', 'gas', 'gas', 0.3, 1, 0.80, 1100, 0.10, null,
      0, null, null, null, null, null, null, null, 0, 40, 'SMOKE', 0.50, null,
      '#FFB020', '#FFD64A', '#E24A0E', 'strong', 0.95, true, true, null, false, 'gas'],

    [26, 'GAS', '瓦斯', 'gas', 'gas', 0.7, 1, 0.95, 2200, 0.06, null,
      0.40, 540, null, null, null, null, null, null, 0, -1, null, 1.00, null,
      '#CBCB78', '#E8E8A8', '#9E9E4C', 'no', 0.35, true, true, null, false, 'gas'],

    [27, 'CLONE', '克隆体', 'static', 'solid', 2000, 0, 0, 2000, 0.15, 3.0,
      0, null, null, null, null, null, null, null, 0, -1, null, 0, null,
      '#C24BD8', '#E57FEF', '#8A2BA0', 'weak', 1.00, true, true, null, false, 'special'],

    [28, 'VIRUS', '病毒', 'static', 'solid', 950, 0, 0, 2000, 0.10, 1.0,
      0.05, 300, null, null, null, null, null, null, 0, -1, null, 0, null,
      '#EC3E6E', '#FF6AA0', '#A81E54', 'weak', 1.00, true, true, 'speckle', false, 'special'],

    [29, 'SPRING', '水源泉', 'liquid', 'liquid', 1000, 0, 0, 4186, 0.40, null,
      0, null, null, null, null, null, null, null, 0, -1, null, 0, null,
      '#3FA9F5', '#7CC8FF', '#1E6FB8', 'no', 0.90, true, false, null, true, 'liquid'],

    [30, 'TNT', '炸药', 'static', 'solid', 1300, 0, 0, 1300, 0.20, 2.0,
      1.00, 180, null, null, null, null, null, null, 0, -1, null, 0, null,
      '#C0272D', '#E04A3A', '#8A1518', 'no', 1.00, true, false, 'stripe', false, 'special']
  ];

  var ELEMENTS = new Array(31);
  var ID = {};
  var LIST = [];
  var byKey = {};

  function hexToInt(hex) {
    return parseInt(hex.slice(1), 16);
  }

  for (var k = 0; k < DEF.length; k++) {
    var d = DEF[k];
    var el = {
      id: d[0], key: d[1], cn: d[2], cat: d[3], state: d[4], group: d[33],
      density: d[5], movable: !!d[6], mobility: d[7],
      specificHeat: d[8], conductivity: d[9], hardness: d[10],
      flammability: d[11], ignitionTemp: d[12],
      // 以下四个先存英文名（字符串）或 null，稍后统一解析为 ID
      meltPoint: d[13], meltTo: d[14],
      boilPoint: d[15], boilTo: d[16],
      solidifyTemp: d[17], solidifyTo: d[18],
      solubility: d[19], lifetime: d[20], decayTo: d[21],
      windFactor: d[22], repose: d[23],
      base: d[24], light: d[25], dark: d[26], emissive: d[27], alpha: d[28],
      dither: d[29], anim: d[30], pattern: d[31], marker: d[32],
      colorIndex: d[0],
      baseInt: hexToInt(d[24]), lightInt: hexToInt(d[25]), darkInt: hexToInt(d[26])
    };
    ELEMENTS[el.id] = el;
    ID[el.key] = el.id;
    byKey[el.key] = el;
    LIST.push(el);
  }

  // 名称 → ID 解析（供物理表 meltTo/boilTo/solidifyTo/decayTo 用字符串引用时）
  for (var m = 1; m <= 30; m++) {
    var e2 = ELEMENTS[m];
    e2.meltTo = e2.meltTo ? ID[e2.meltTo] : 0;
    e2.boilTo = e2.boilTo ? ID[e2.boilTo] : 0;
    e2.solidifyTo = e2.solidifyTo ? ID[e2.solidifyTo] : 0;
    e2.decayTo = e2.decayTo ? ID[e2.decayTo] : 0;
  }

  /* 向后兼容别名：id 1 既叫 AIR 也叫 EMPTY（旧代码/反应表/存档仍写 EMPTY，解析后同为 1） */
  ID.EMPTY = 1;
  byKey.EMPTY = ELEMENTS[1];

  /* 空气专项标记（供 thermal / air 读取）：air=true 表示"背景介质"，skySink=true 表示顶部散热 */
  ELEMENTS[1].air = true;
  ELEMENTS[1].skySink = true;

  // 按 UI 分组：solid/powder/liquid/gas/special（none = 不进面板的空气）
  var GROUPS = ['solid', 'powder', 'liquid', 'gas', 'special'];
  var GROUPED = { none: [] };
  GROUPS.forEach(function (g) { GROUPED[g] = []; });
  LIST.forEach(function (el) { (GROUPED[el.group] || GROUPED.none).push(el); });

  // 快速查找数组
  var conductivityTable = new Float32Array(31);
  var specificHeatTable = new Float32Array(31);
  var densityTable = new Float32Array(31);
  var movableTable = new Uint8Array(31);
  for (var q = 1; q <= 30; q++) {
    var e3 = ELEMENTS[q];
    conductivityTable[q] = e3.conductivity;
    specificHeatTable[q] = e3.specificHeat;
    densityTable[q] = e3.density;
    movableTable[q] = e3.movable ? 1 : 0;
  }

  var api = {
    ELEMENTS: ELEMENTS,
    LIST: LIST,
    ID: ID,
    GROUPS: GROUPS,
    GROUPED: GROUPED,
    conductivity: conductivityTable,
    specificHeat: specificHeatTable,
    density: densityTable,
    movable: movableTable,
    get: function (id) { return ELEMENTS[id]; },
    byKey: function (key) { return byKey[key]; }
  };

  root.YS = root.YS || {};
  root.YS.Elements = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

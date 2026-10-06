/*
 * balance.js — 全部可调参数（唯一真源：docs/PHYSICS.md §14）
 * 键名与 §14 各表一一对应。零依赖、无 DOM。
 */
(function (root) {
  'use strict';

  /* §14.1 全局 / 网格 */
  var PHYS = {
    GRID_W: 320,
    GRID_H: 180,
    TICK_HZ: 60,
    MAX_SUBSTEPS: 4,
    SEED: 1337,
    NUM_MAX_PARTICLES: 57600,

    /* §14.2 热学 */
    AMBIENT_T: 20,
    MIN_TEMP: -200,
    MAX_TEMP: 2000,
    HEAT_COUPLING: 0.005,     // α —— 已按审查 F01 修正（勿改大）
    ENV_RELAX_EMPTY: 0.0005,  // = AIR.RELAX（键名保留向后兼容）；0.10 → 0.0005 修复 B2
    ENV_RELAX_GAS: 0.004,
    ENV_RELAX_LIQUID: 0.0005,
    ENV_RELAX_SOLID: 0.001,
    EXPOSED_RELAX_MULT: 2.0,
    LATENT_TICKS_ICE: 12,
    LATENT_TICKS_BOIL: 8,
    LATENT_TICKS_COND: 6,
    LATENT_TICKS_LAVA: 10,
    LATENT_TICKS_SNOW: 4,
    LATENT_TICKS_LN2: 6,
    MAX_EXPLOSION_CELLS: 2000,

    /* 热学能量守恒模式开关（见 docs/adr/0003）：
     * false = 采用 §6.1 标定式（对称温度交换，守恒 ΣT）
     * true  = 比热加权（守恒 Σ c·T），仅供测试/校验，不用于正式玩法 */
    ENERGY_WEIGHTED_CONDUCTION: false
  };

  /* §14.3 相变 */
  var WATER = {
    EVAP_SURF_THRESH: 60,
    EVAP_SURF_COEF: 0.0003,
    EVAP_P_AT_100: 0.02,
    EVAP_SLOPE: 0.001,
    EVAP_P_MAX: 0.50,
    FREEZE_T: -2,
    FREEZE_P_SLOPE: 0.025,
    FREEZE_P_MAX: 0.40
  };
  var STEAM = { COND_COEF: 0.00015, COND_P_MAX: 0.02 };
  var ICE = { MELT_P_BASE: 0.05, MELT_P_SLOPE: 0.005, MELT_P_MAX: 0.50 };
  var SNOW = { MELT_P_BASE: 0.08, MELT_P_SLOPE: 0.005, MELT_P_MAX: 0.50 };
  var LAVA = {
    SOLIDIFY_T: 700,
    SOLIDIFY_SLOPE: 0.01,
    SOLIDIFY_P_MIN: 0.02,
    SOLIDIFY_P_MAX: 0.50,
    STEAM_P: 0.80,
    IGNITE_PLANT_P: 1.0        // S-LAVA（新增）：岩浆同 tick 点燃植物
  };
  var STONE = { MELT_T: 1200, MELT_SLOPE: 0.005, MELT_P_MAX: 0.30 };
  var GLASS = { MELT_T: 1400, MELT_P: 0.02 };
  var METAL = { MELT_T: 1500, MELT_P: 0.02 };
  var SALT = { MELT_T: 801, MELT_P: 0.02, DISSOLVE_P: 0.02 };
  /* SAND 的玻璃化（v1.1.0，见 docs/PHYSICS.md §7.7）：
   *  · GLASS_CONTACT_P / GLASS_CONTACT_COST —— **主规则：接触反应 R20**。
   *    LAVA 4 邻接 SAND → SAND 以 p=0.02/tick 变 GLASS，同时 LAVA 侧 −20 °C（玻璃化耗能）。
   *    原因：沙（密度 1600）浮于岩浆（2800），「倒岩浆在沙上」只能单面受热，实测封顶仅
   *    ≈370–530 °C，**够不到任何合理阈值** → 不能依赖温度阈值。
   *  · GLASS_T / GLASS_P —— **辅路径（兜底）**：沙自身 T ≥ 1100 °C 直接玻璃化（§7.7）。
   *  真实石英熔点 1713 °C、钠钙玻璃软化约 600–800 °C；1100 为**设计近似**。 */
  var SAND = {
    GLASS_T: 1100, GLASS_P: 0.03,
    GLASS_CONTACT_P: 0.02, GLASS_CONTACT_COST: 20
  };
  var LN2 = { BOIL_T: -196, BOIL_SLOPE: 0.0005, BOIL_P_MAX: 0.50 };

  /* §14.4 燃烧 / 反应（燃料驱动燃烧模型，见 docs/COMBUSTION-MODEL.md / ADR-0006） */
  var FIRE = {
    LIFE_BASE: 40,             // 仅用于 latent==0 的「自由火焰」（瓦斯/爆炸/手绘）
    LIFE_JITTER: 10,           // 同上：自由火焰寿命抖动
    SPREAD_UP_BIAS: 1.5,       // 向上蔓延加成（沿用）
    SPREAD_DOWN_BIAS: 0.6,     // 向下蔓延衰减（沿用）
    SMOKE_P: 0.5,              // 自由火焰消亡时留烟概率
    /* --- N1「火焰沿固体燃料蔓延」修复新增（docs/COMBUSTION-MODEL.md §6.2） --- */
    OXY_RADIUS: 2,             // 通气判据切比雪夫半径（仅 AIR 算氧）
    OXY_CONSUME_INTERVAL: 30,  // 锚定火焰每 N tick 消耗 1 格邻接 AIR→SMOKE（持续耗氧）
    SMOTHER_EXTRA: 3,          // 不通气时 age 额外增速（寿命缩至 1/(1+该值)）
    ANCHOR_FUEL_FIRE: true,    // latent>0 的 FIRE 是否锚定（不上升/不受风）
    MAX_BURN_CELLS: 8000,      // 同时 FIRE 格数上限（性能护栏）
    /* 兼容保留：旧「一次性耗氧」残余灰概率表（新模型改由 FUEL.channelP 决定，此项不再被 agePass 使用） */
    RESIDUE_ASH: { WOOD: 0.6, PLANT: 0.3, COAL: 0.5, OIL: 0.2, GUNPOWDER: 0.1, GAS: 0.0 }
  };

  /* §6.1 逐燃料燃烧参数（docs/COMBUSTION-MODEL.md §6.1）：
   *   burnTicks —— 锚定火焰寿命（tick）；burnTemp —— 燃烧温度；channelP —— 烧尽后开 AIR 通道概率（否则 ASH）；
   *   spreadP   —— 蔓延到邻接该燃料的概率（×方向偏置）。latent 存的是元素 id，运行时经 Reactions.fuelOf(id) 取名表。 */
  var FUEL = {
    WOOD:  { burnTicks: 180, burnTemp: 600, channelP: 0.50, spreadP: 0.05 },
    COAL:  { burnTicks: 420, burnTemp: 800, channelP: 0.20, spreadP: 0.03 },
    OIL:   { burnTicks:  90, burnTemp: 700, channelP: 1.00, spreadP: 0.20 },
    PLANT: { burnTicks:  45, burnTemp: 300, channelP: 0.70, spreadP: 0.15 },
    DUST:  { burnTicks:  60, burnTemp: 350, channelP: 0.80, spreadP: 0.05 },
    SEED:  { burnTicks:  45, burnTemp: 250, channelP: 0.70, spreadP: 0.10 },
    VIRUS: { burnTicks:  60, burnTemp: 300, channelP: 0.80, spreadP: 0.05 }
  };
  var ACID = { ETCH_METAL_P: 0.05, ETCH_STONE_P: 0.02, ETCH_PLANT_P: 0.02 };  // ETCH_PLANT_P = S-ACID（新增）
  var TNT = { RADIUS: 6, CHAIN_MAX: 8, TEMP_BOOST: 400, P_FIRE: 0.6 };

  /* §14.5 生命 / 流量 / 风（严格生态：见 docs/PLANT-MODEL.md） */
  var SEED = {
    GERM_TIMER_REQ: 90,
    GERM_P: 0.05,
    TEMP_MIN: 5,
    TEMP_MAX: 40,
    DEATH_HOT_T: 60,
    DEATH_COLD_T: -10,
    GROUND_REQUIRED: true,     // 新增：发芽必须着地（B4 第一道闸）
    MOIST_RADIUS: 2            // 新增：湿度检测半径
  };
  var PLANT = {
    GROW_P: 0.02,              // h=0 时的向上生长概率
    CAPILLARY_HEAD: 30,        // 取代 MAX_HEIGHT=40（毛细供水极限 / 软上限）
    WILT_TICKS: 300,           // 干旱枯萎计时（群落级）
    ROOT_LOSS_GRACE: 90,       // 断根后枯萎宽限
    ROOT_SEARCH_MAX: 128,      // 根系连通性 BFS 上限
    ROOT_CHECK_INTERVAL: 15,   // 根系检测节流间隔
    ROOT_ZONE_H: 3,            // 根区高度
    WATER_REACH: 4,            // 根区可汲取水源半径
    WATER_COST_P: 0.5,         // 每次生长消耗 1 单位水的概率
    SOIL_DRAW: 20,             // 从湿土抽取的含水量/次
    DEATH_DUST_P: 1.0,         // 枯死整株变 DUST 概率（<1 = 部分变 AIR）
    MAX_COLONY: 512,           // 单株规模上限
    SPREAD_WATER_P: 0.01       // 保留（向水面蔓延概率；已不产生新植物，见 biology.js）
  };
  var SOIL = { MOISTURE_MAX: 200, MOISTURE_GAIN: 2, DRY_RATE: 1 };
  var VIRUS = { INFECT_PLANT_P: 0.05, INFECT_SEED_P: 0.03 };
  var CLONE = { COPY_INTERVAL: 4, MAX_CELLS: 2000 };
  var SPRING = { EMIT_INTERVAL: 6, MAX_CELLS: 1500 };
  var WIND = { MAX_STRENGTH: 1.0, CONVECT_T_BOOST: 0.3, CONVECT_T_THRESH: 200 };

  /* §14.2b AIR（空气专项，见 docs/PHYSICS-AIR.md §11） */
  var AIR = {
    DENSITY: 1.2,              // 参考密度（不参与通用位移，见 §1.2）
    SPECIFIC_HEAT: 1005,       // 参考比热
    CONDUCTIVITY: 0.05,        // 空气 k（含微对流增强，近似）
    SELF_K: 0.5,               // 空气-空气专用配对系数（与固-气解耦）
    RELAX: 0.0005,             // 空气向环境温弛豫（= PHYS.ENV_RELAX_EMPTY）
    CONDUCT_EPS: 0.25,         // 双空气对温差 < 此值则跳过导热（性能）
    BUOY_DT: 40,               // 热空气上升的最小温差
    COLD_DT: 40,               // 冷空气下沉的最小温差
    BUOY_SCALE: 250,           // 浮力概率饱和尺度
    BUOY_P_MAX: 0.6,           // 单次 airPass 最大上/下移概率
    PASS_INTERVAL: 2,          // airPass 执行间隔（隔帧）
    SKY_ROWS: 2,               // 顶部天空层行数
    SKY_RELAX: 0.02,           // 天空层散热率
    WIND_FACTOR: 0.5,          // 空气受风敏感度
    WIND_MIN_DT: 1.0,          // 空气被风搬运的最小温差
    WIND_ALL: false,           // true = 全部空气随风漂移（贵）
    OXY_CONSUME_P: 0.5,        // 点燃时消耗邻接 AIR 的概率
    MAX_MOVE_BUDGET: 12000,    // 单 tick 空气移动上限
    HALF_SPLIT_THRESHOLD: 8000 // 超过此驱动格数 → 奇偶列分半
  };

  var api = {
    PHYS: PHYS, AIR: AIR,
    WATER: WATER, STEAM: STEAM, ICE: ICE, SNOW: SNOW, LAVA: LAVA, STONE: STONE,
    GLASS: GLASS, METAL: METAL, SALT: SALT, SAND: SAND, LN2: LN2,
    FIRE: FIRE, FUEL: FUEL, ACID: ACID, TNT: TNT,
    SEED: SEED, PLANT: PLANT, SOIL: SOIL, VIRUS: VIRUS, CLONE: CLONE, SPRING: SPRING, WIND: WIND
  };

  root.YS = root.YS || {};
  root.YS.Balance = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

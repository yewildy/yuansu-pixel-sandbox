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
    ENV_RELAX_EMPTY: 0.10,
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
    EVAP_P_AT_100: 0.025,
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
    STEAM_P: 0.80
  };
  var STONE = { MELT_T: 1200, MELT_SLOPE: 0.005, MELT_P_MAX: 0.30 };
  var GLASS = { MELT_T: 1400, MELT_P: 0.02 };
  var METAL = { MELT_T: 1500, MELT_P: 0.02 };
  var SALT = { MELT_T: 801, MELT_P: 0.02, DISSOLVE_P: 0.02 };
  var SAND = { GLASS_T: 1700, GLASS_P: 0.03 };
  var LN2 = { BOIL_T: -196, BOIL_SLOPE: 0.0005, BOIL_P_MAX: 0.50 };

  /* §14.4 燃烧 / 反应 */
  var FIRE = {
    LIFE_BASE: 40,
    LIFE_JITTER: 10,
    SPREAD_UP_BIAS: 1.5,
    SPREAD_DOWN_BIAS: 0.6,
    SMOKE_P: 0.5
  };
  var ACID = { ETCH_METAL_P: 0.05, ETCH_STONE_P: 0.02 };
  var TNT = { RADIUS: 6, CHAIN_MAX: 8, TEMP_BOOST: 400, P_FIRE: 0.6 };

  /* §14.5 生命 / 流量 / 风 */
  var SEED = {
    GERM_TIMER_REQ: 90,
    GERM_P: 0.05,
    TEMP_MIN: 5,
    TEMP_MAX: 40,
    DEATH_HOT_T: 60,
    DEATH_COLD_T: -10
  };
  var PLANT = { GROW_P: 0.02, MAX_HEIGHT: 40, WILT_TICKS: 300, SPREAD_WATER_P: 0.01 };
  var VIRUS = { INFECT_PLANT_P: 0.05, INFECT_SEED_P: 0.03 };
  var CLONE = { COPY_INTERVAL: 4, MAX_CELLS: 2000 };
  var SPRING = { EMIT_INTERVAL: 6, MAX_CELLS: 1500 };
  var WIND = { MAX_STRENGTH: 1.0, CONVECT_T_BOOST: 0.3, CONVECT_T_THRESH: 200 };

  var api = {
    PHYS: PHYS,
    WATER: WATER, STEAM: STEAM, ICE: ICE, SNOW: SNOW, LAVA: LAVA, STONE: STONE,
    GLASS: GLASS, METAL: METAL, SALT: SALT, SAND: SAND, LN2: LN2,
    FIRE: FIRE, ACID: ACID, TNT: TNT,
    SEED: SEED, PLANT: PLANT, VIRUS: VIRUS, CLONE: CLONE, SPRING: SPRING, WIND: WIND
  };

  root.YS = root.YS || {};
  root.YS.Balance = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

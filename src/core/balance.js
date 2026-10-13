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
    /* 气体向环境弛豫：0.004 → 0.0006。旧值意味着蒸汽每秒失掉 ~21% 温差（半衰期约 3 tick），
     * 蒸汽刚离开水面就被"吹冷"，正是"立刻变水滴落下来"的主因之一。空气本身是热的不良导体，
     * 悬浮蒸汽的散热理应慢得多（见 docs/CONDENSATION-MODEL.md §2）。 */
    ENV_RELAX_GAS: 0.0006,
    ENV_RELAX_LIQUID: 0.0005,
    ENV_RELAX_SOLID: 0.001,
    EXPOSED_RELAX_MULT: 2.0,
    LATENT_TICKS_ICE: 12,
    LATENT_TICKS_BOIL: 8,
    LATENT_TICKS_COND: 24,     // 6 → 24（潜热平台）
    LATENT_TICKS_LAVA: 10,
    LATENT_TICKS_SNOW: 4,
    LATENT_TICKS_LN2: 6,
    MAX_EXPLOSION_CELLS: 2000,

    /* §14.2b 导热模型（v1.2.0 重写，见 docs/PHYSICS-AIR.md §14）
     * 旧模型 = 对称温度交换（守恒 ΣT），等价于"所有格子热容相等"：
     *   实测把 1 格 1000 ℃ 岩石放进 64×64 空气场，整场空气升温不足 0.3 ℃ ——
     *   这就是用户反馈的「空气温度似乎不能传导 / 热空气不往上走」的根因。
     * 新模型 = **体积热容加权**（守恒 Σ C·T，C = 比热 × 密度）：
     *   ΔT_i = r · C_j/(C_i+C_j) · (T_j − T_i)，  ΔT_j = −r · C_i/(C_i+C_j) · (T_j − T_i)
     *   r = α·K·C_REF·(C_i+C_j)/(C_i·C_j)，并钳制 r ≤ CONDUCT_R_MAX 保证显式格式不过冲。
     * 取 C_REF = 水的体积热容 → 水-水配对的速度与旧模型完全一致（无缝标定）。
     * 稳定性：单格最多 4 个邻居，4 × CONDUCT_R_MAX = 0.8 < 1 → 不会越过平衡点。 */
    VOLUME_HEAT_CONDUCTION: true,
    HEAT_CAP_REF: 4186000,     // C_REF = volHeat[WATER] = 4186 × 1000
    CONDUCT_R_MAX: 0.2,        // 单配对最大松弛因子（4 邻居上限 0.8 < 1）
    /* 兼容开关（见 docs/adr/0003）：
     * false = 生产模式（体积热容加权，守恒 Σ C·T）
     * true  = 严格守恒校验模式（同一公式但去掉 r 钳制前的舍入差异，供单元测试） */
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
  /* 汽 → 水（冷凝），v1.2.0 重做为「接触成核」，对齐 Powder Game 的 Steam/Cloud 分离
   * （见 docs/CONDENSATION-MODEL.md）：
   *   · 空中均相成核极慢（HOMO_F=0.12），蒸汽可长时间保持气态并上升 → 不再"一秒变水滴"；
   *   · 碰到冷凝核（4 邻域有非气体元素 / 画面顶部）→ 全速凝结，形成"锅盖水珠""窗上雾滴"；
   *   · LATENT_TICKS_COND 由 6 提到 24：潜热平台，给蒸汽一段必须"放热"的时间。 */
  var STEAM = {
    /* COND_COEF 是「贴到冷核时」的凝结系数（p = COEF·(100−T)，T=20℃ → 0.012，半衰期约 1 s）；
     * 开阔空气中的蒸汽再乘 HOMO_F=0.2 → 等效 0.0024，半衰期约 5 s，足够飘到画面顶部。 */
    COND_COEF: 0.00015,      // 有核凝结系数
    COND_P_MAX: 0.02,
    HOMO_F: 0.2,             // 无核（四周皆气体/真空）→ 均相成核折扣，等效 0.00003
    NUCLEUS_COLD_T: 95       // 冷凝核温度低于此值才算"冷核"（热水面 ≥95℃ 不成核）
  };
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
    /* v1.2.0 修订（docs/PHYSICS-AIR.md §A10）：channelP 普遍上调。
     * 原值（0.2~0.8）让烧尽的格子多半变成 ASH —— ASH 是固体占位，会把氧气堵在外面，
     * 24×24 实心燃料块因此只能烧掉表层 27~37% 就自灭（配对实验「火离开燃料」FAIL 的真正瓶颈，
     * 与火焰上浮无关 —— 单纯提高火焰换热系数 k 实测无效）。
     * 物理依据：木材燃烧绝大部分质量变成 CO2 / 水蒸气逸出，灰分仅占干重 1~5%，
     * 故"烧完留下空腔"才是正确的主产物，灰是少量残余。
     * 煤灰分（5~15%）高于木材，故 COAL 的 channelP 低于 WOOD，但已从 0.20 提到 0.75 以打开通道。 */
    WOOD:  { burnTicks: 180, burnTemp: 600, channelP: 0.95, spreadP: 0.05 },
    COAL:  { burnTicks: 420, burnTemp: 800, channelP: 0.85, spreadP: 0.09 },
    OIL:   { burnTicks:  90, burnTemp: 700, channelP: 1.00, spreadP: 0.20 },
    PLANT: { burnTicks:  45, burnTemp: 300, channelP: 0.95, spreadP: 0.15 },
    DUST:  { burnTicks:  60, burnTemp: 350, channelP: 0.95, spreadP: 0.05 },
    SEED:  { burnTicks:  45, burnTemp: 250, channelP: 0.95, spreadP: 0.10 },
    VIRUS: { burnTicks:  60, burnTemp: 300, channelP: 0.90, spreadP: 0.05 }
  };
  var ACID = { ETCH_METAL_P: 0.05, ETCH_STONE_P: 0.02, ETCH_PLANT_P: 0.02 };  // ETCH_PLANT_P = S-ACID（新增）
  /* IGNITE_T：TNT 自燃温度（真实值约 160~200℃，取 180）。
   * 引爆 = 自身达此温度 **或** 4 邻域存在 FIRE / 达此温度的热体（岩浆）。见 PHYSICS-AIR.md 附录 C。 */
  var TNT = { RADIUS: 6, CHAIN_MAX: 8, TEMP_BOOST: 400, P_FIRE: 0.6, IGNITE_T: 180 };

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
    /* v1.2.0：CAPILLARY_HEAD 30 → 80。用户诉求「有水就可以一直往上走，没必要设置一个死亡」，
     * 且 Powder Game 的 Vine/Seed 本就没有枯萎死亡机制（见 docs/PLANT-MODEL.md §7 修订）。
     * 80 格的软上限仅为性能护栏（画面高 180），正常玩法由"根区有没有水"这一条自然封顶。 */
    CAPILLARY_HEAD: 80,        // 毛细供水极限 / 软上限（30 → 80）
    WILT_TICKS: 300,           // 已废弃：不再触发枯死，保留字段仅供存档兼容
    ROOT_LOSS_GRACE: 90,       // 已废弃：不再触发枯死，保留字段仅供存档兼容
    ROOT_SEARCH_MAX: 128,      // 根系连通性 BFS 上限
    ROOT_CHECK_INTERVAL: 15,   // 根系检测节流间隔
    ROOT_ZONE_H: 3,            // 根区高度
    WATER_REACH: 4,            // 根区可汲取水源半径
    WATER_COST_P: 0.5,         // 每次生长消耗 1 单位水的概率
    SOIL_DRAW: 20,             // 从湿土抽取的含水量/次
    DEATH_DUST_P: 1.0,         // 已废弃（v1.2.0 起植物不再枯死，见 §7 修订 / docs/PLANT-MODEL.md）
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
    /* 空气-空气导热。v1.2.0：改用体积热容加权后，若沿用 SELF_K=0.5 会把松弛因子 r 顶到
     * CONDUCT_R_MAX=0.2 的上限，等于让空气内部"瞬间均温"，热团 30 tick 就被摊平（A2 失效）。
     * 物理上静止空气是**热的不良导体**（k≈0.026，羽绒服/双层玻璃的原理），
     * 空气侧的热量搬运主要靠**对流**（airPass 的物质位移），而不是分子导热。
     * 所以这里直接给一个很小的松弛因子：单邻居 ΔT≈0.00075·dT，时间常数约 330 tick。 */
    SELF_K: 0.5,               // 仅旧（ΣT）模式使用
    SELF_R: 0.0015,            // v1.2.0：空气-空气导热松弛因子（体积热容模式）
    RELAX: 0.0005,             // 空气向环境温弛豫（= PHYS.ENV_RELAX_EMPTY）
    CONDUCT_EPS: 0.25,         // 双空气对温差 < 此值则跳过导热（性能）
    /* v1.2.0 重标定：旧值 BUOY_DT=40 / BUOY_SCALE=250 意味着空气要被加热到 60 ℃ 才开始动，
     * 且 ΔT=60 时概率仅 0.08 —— 实际观感就是"热空气不往上走"。真实空气 ΔT≈1 ℃ 即有可测浮力。
     * 新值：1.5 ℃ 起浮，20 ℃ 温差即接近饱和（p≈0.93），每帧执行（见 docs/PHYSICS-AIR.md §11）。 */
    BUOY_DT: 1.5,              // 热空气上升的最小温差（40 → 1.5）
    COLD_DT: 1.5,              // 冷空气下沉的最小温差（40 → 1.5）
    BUOY_SCALE: 20,            // 浮力概率饱和尺度（250 → 20）
    BUOY_P_MAX: 0.95,          // 单次 airPass 最大上/下移概率（0.6 → 0.95）
    PASS_INTERVAL: 1,          // airPass 执行间隔（隔帧 2 → 每帧 1）
    SKY_ROWS: 2,               // 顶部天空层行数
    SKY_RELAX: 0.02,           // 天空层散热率
    WIND_FACTOR: 0.5,          // 空气受风敏感度
    WIND_MIN_DT: 1.0,          // 空气被风搬运的最小温差
    WIND_ALL: false,           // true = 全部空气随风漂移（贵）
    OXY_CONSUME_P: 0.5,        // 点燃时消耗邻接 AIR 的概率
    MAX_MOVE_BUDGET: 12000,    // 单 tick 空气移动上限
    HALF_SPLIT_THRESHOLD: 8000 // 超过此驱动格数 → 奇偶列分半
  };

  /* §14.6 浮力 / 介质阻尼 / 热对流（v1.2.0 新增，见 docs/PHYSICS-AIR.md §12）
   * 问题：旧实现里"下沉"是一格/tick 的确定性交换，水中下沉与真空自由落体完全同速 ——
   *   用户实测「水和油混到一起，下降速率和直接重力加速度一样」。
   * 模型（Stokes 终速的离散近似）：在介质中的沉降概率 ∝ 净浮力 / 自重 = (ρ_self − ρ_med)/ρ_self。
   *   · 目标格为 AIR（真空）→ 因子 1，保持原有手感，不受影响；
   *   · 水(1000) 沉入油(900) → 0.10，约 10 倍慢，肉眼可见的缓慢分层；
   *   · 沙(1600) 沉入水(1000) → 0.375，明显慢于空中下落（对齐 Powder Game：粉末沉入液体但更慢）。
   * 热对流：液体/气体的"有效密度"随温度膨胀 ρ_eff = ρ·(1 − β·(T − T_amb))，
   *   用 ρ_eff 参与上/下比较 → 锅底热水自动上浮、冷水下沉，形成对流环（解决"锅里东西不受热"）。
   *   β=0.0012 为**放大值**（真实水 0.0002），目的是让 80 K 温差产生约 10% 密度差，
   *   在 320×180 网格上可见；仍保证 100 ℃ 水(≈904) 重于油(900)，不破坏油水分层。 */
  var BUOY = {
    ENABLE: true,
    MIN_F: 0.04,               // 浮力因子下限：密度极接近时仍会极缓分层，不会永久卡死
    SAME_CONVECT_MIN_F: 0.25,  // **同种**液体之间的热对流下限（无分层顾虑，可快一些）
    THERMAL_BETA: 0.0012,      // 热膨胀系数 β（每 ℃ 的相对密度变化，放大值）
    CONVECT_MIN_DT: 3.0        // 触发热对流的最小温差（℃，避免逐格抖动）
  };

  var api = {
    PHYS: PHYS, AIR: AIR, BUOY: BUOY,
    WATER: WATER, STEAM: STEAM, ICE: ICE, SNOW: SNOW, LAVA: LAVA, STONE: STONE,
    GLASS: GLASS, METAL: METAL, SALT: SALT, SAND: SAND, LN2: LN2,
    FIRE: FIRE, FUEL: FUEL, ACID: ACID, TNT: TNT,
    SEED: SEED, PLANT: PLANT, SOIL: SOIL, VIRUS: VIRUS, CLONE: CLONE, SPRING: SPRING, WIND: WIND
  };

  root.YS = root.YS || {};
  root.YS.Balance = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

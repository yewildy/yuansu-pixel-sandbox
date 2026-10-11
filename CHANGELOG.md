# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 与 [语义化版本](https://semver.org/lang/zh-CN/)。

## [1.1.0] — 2026-10-11

「空气即元素」+「严格植物生态」。修复用户实测暴露的四个硬伤，**元素数、ID 映射、配色、存档版本全部不变**。

### 修复

- **火焰不沿固体燃料蔓延（N1，任务 #22，T6.2 实测 Major）**：「燃料驱动燃烧模型」——燃料点燃后变为**锚定火焰**（原地不动、不飘走，`latent>0` 即锚定），寿命由**燃料种类**决定（`FUEL[].burnTicks`），火焰只向**通气**（Chebyshev 半径 2 内可达 `AIR`、不穿墙）的燃料格推进，烧尽后按 `CHANNEL_P` 开 `AIR` 通道使前沿逐层深入；同时**持续耗氧**保证密闭盒缺氧自熄。修复三因叠加根因（R-1 `LIFE_BASE` 写死、R-2 氧判据 4 邻域、R-3 时序死锁+火焰上浮）。实测：开放木条 1200 tick 消耗率 **8% → 100%**、8×8 木块 ≤600 tick 消耗 **98%**；密闭盒仍**缺氧自熄**（残木 ≥93%、盒壁完整，10 种子稳定）。详见 `docs/COMBUSTION-MODEL.md` / `docs/adr/0006-fuel-driven-combustion.md`
- **热空气不再瞬间被抽干**：`AIR` 弛豫率 `ENV_RELAX_EMPTY` 由 0.10 降至 0.0005 → 600 °C 空气团 30 tick 后仍 ≥450 °C（原 30 tick 内被压回 21 °C）
- **空气能导热了**：新增空气-空气双轨配对系数 `AIR.SELF_K=0.5`（其余配对仍 `(k_i+k_j)/2`）→ 1000 °C 石块旁空气 60 tick 内升至 ≥40 °C（原恒为 20.0 °C、石头热量凭空消失）
- **热空气会上升、冷空气会下沉**：新增 `src/core/air.js::airPass`（温度驱动置换，`movePass` 之后执行）
- **浮空植物不再疯长**：植物需接地 + 供水，`MAX_HEIGHT=40` 硬帽删除，改为 `CAPILLARY_HEAD` 软帽
- **种田不再下灰尘雨**：植物整簇同时枯萎（单次 BFS），死亡产出 DUST ≤50
- 补齐 §9.3 燃料残余成 ASH（`latent` 复用作原始燃料 id）
- **水源泉 `SPRING` 真的会出水了**：此前 `src/core` 无任何代码引用 `SPRING`（实测 10×10 水源泉跑 600 tick 产水 **0 格**），现落地为反应 **R19**（`reactions.js`）：每 `SPRING.EMIT_INTERVAL=6` tick 向相邻 `AIR` 格生成 `WATER`（20 °C），全局累计产水达 `SPRING.MAX_CELLS=1500` 停喷；`SPRING` 自身不移动、不消耗（与 `CLONE` 并列的质量创生例外，标「∞」）
- **蒸汽不再被「强制寿命」无条件转水**：删除 `STEAM.lifetime=600`（→ -1、`decayTo` → null）。旧实现到期**无论温度**一律变 `WATER`，300 °C 也冷凝，违反 §7.2「$T\ge100$ 恒不冷凝」；现蒸汽只由 §7.2 冷凝概率（仅 $T<100$）+ 顶部逸出决定
- **液氮汽化不再「凭空造水」**：`transitions.js` LN2 汽化产物由 `STEAM` 改为 **`AIR`**（氮气回归大气）。旧实现 LN2→STEAM→冷凝成水，实测「倒一片液氮 WATER $0\to148$ 格」；改后 WATER 计数不再增加（§7.8）
- **「炼玻璃」不再死链**：`SAND.GLASS_T` 由 **1700 → 1100**（真实石英熔点 1713 °C、钠钙玻璃软化约 600–800 °C；取 1100 是为在「最高热源岩浆 1200 °C + 对称导热（格温不超热源）」约束下留出约 100 °C 窗口，属**设计近似**）。此前阈值 1700 > 最高热源 1200，沙**永不**成玻璃。**注**：因沙（密度 1600）**浮于**岩浆（2800），「把岩浆倒在沙上」只能让沙**单面受热**（峰值 ≈528 °C，不成玻璃）；须让沙**被岩浆吞没（多面受热）**——「先灌大片岩浆，再在其中画沙」，实测 8×8 沙块没入 50×50 岩浆池 → GLASS=38（§7.7）

### 新增

- **`FUEL` 逐燃料燃烧参数组**（`balance.js`）：`WOOD{burnTicks:180,…}` / `COAL{420}` / `OIL{90}` / `PLANT{45}` / `DUST{60}` / `SEED{45}` / `VIRUS{60}`，含 `burnTemp/channelP/spreadP`；新增 `FIRE.OXY_RADIUS=2`、`FIRE.OXY_CONSUME_INTERVAL=30`、`FIRE.SMOTHER_EXTRA=3`、`FIRE.ANCHOR_FUEL_FIRE=true`、`FIRE.MAX_BURN_CELLS=8000`
- **`AIR` 真实元素**：id 1 由 `EMPTY` 升级为 `AIR`（空气）：`cat=gas`、`density=1.2`、`c=1005`、`k=0.05`、`movable=false`、`group='none'`（不进元素面板）；`ID.EMPTY=1` 为同值别名，存档兼容
- **`airPass` 对流/浮力/风**：仅 `|ΔT|>40` 的空气参与运动（隔帧 `PASS_INTERVAL=2`），移动即 `grid.swap`（热量随空气被搬运）；风只搬运携带热量的空气（`WIND_FACTOR=0.5`）
- **天空热沉**：顶部 `SKY_ROWS=2` 行按 `SKY_RELAX=0.02` 散热，给弛豫压低后的热量一个出口
- **燃烧耗氧（§9.6）**：点燃时以 `OXY_CONSUME_P=0.5` 把邻接 `AIR` 转为 `SMOKE`
- **植物严格生态**：接地要求、有界 BFS 寻根（`ROOT_CHECK_INTERVAL=15`）、`CAPILLARY_HEAD` 软帽、供水消耗、整簇同死（`WILT_TICKS=300` / `ROOT_LOSS_GRACE=90`）
- **酸蚀植物 / 岩浆引燃植物**：`S-ACID`（`PLANT→DUST`）、`S-LAVA`（引燃 + `LAVA→STONE`）
- ADR：`docs/adr/0005-air-as-real-element.md`

### 性能

- 空画布 airPass 新增开销 **0.178 ms/tick**（预算 ≤0.3）；95% 填充 **7.3–7.8 ms/tick**（预算 ≤10）；1/2 画布 600 °C 空气 **≈2.3 ms/tick**（预算 ≤12）
- `pendingDrive` 全局标志使无热源时 `airPass` **O(1) 早退**；空气-空气近平衡跳过使均匀空气导热成本 ≈0；`MAX_MOVE_BUDGET=12000` 截断满屏热尖峰
- 燃烧：同时 **5000 格燃烧**单 tick 增量 **≈0.5–0.7 ms**（预算 ≤1.5，N1-9）；`FIRE.MAX_BURN_CELLS=8000` 护栏 + `findOxygen` 8 邻接快速路径使开阔空气氧判据 O(1)

### 文档

- `docs/PHYSICS.md` 应用 24 处修订（4 处语义 + 20 处 `EMPTY→AIR` 重命名）；新增 §5.4 / §9.6；收尾五项修订：§7.2 蒸汽消亡、§7.7 `SAND→GLASS` 阈值与近似、§7.8 LN2 产物、§8 R19（水源泉，由「仅文档」改为「已实现」）、§13.2/§13.1 守恒清单
- `docs/PHYSICS.md` §9 燃烧模型按 `docs/COMBUSTION-MODEL.md §11` 修订：§9.1 条件 3（→ Chebyshev-2 仅 `AIR`、不穿墙）、§9.2（锚定+燃料寿命+`spreadP`）、§9.3（残灰概率表，缺氧窒息不造氧）、§9.6（**行为变更**：点燃耗氧+持续耗氧+提前窒息）；§8 反应表 R2/R3/R4/R7 概率与条件同步
- `docs/ARCHITECTURE.md` 同步 `agePass`/`reactions` 燃烧变更点；`docs/COMBUSTION-MODEL.md`（燃烧唯一真源）、`docs/adr/0006-fuel-driven-combustion.md` 新增
- `docs/ARCHITECTURE.md` 步进顺序更新为 10 步（含 `airPass`）；`docs/adr/0005-air-as-real-element.md` 新增，并补 LN2→`AIR` 修订记录
- 测试：`tests/run.js` 新增 A1–A7 空气验收 + G/B4/D2/H1 植物验收 + 12/13/14/15/16 收尾五项验收 + N1-0/N1-probe/N1-1~N1-10 燃烧蔓延验收（共 51 例全绿）

## [1.0.0] — 2026-09-30

第一个正式版本。

### 新增

- **30 种元素**：墙 / 岩石 / 玻璃 / 金属 / 冰 / 木材 / 煤 · 沙 / 土壤 / 盐 / 尘埃 / 雪 / 灰烬 / 火药 / 种子 · 水 / 油 / 岩浆 / 强酸 / 液氮 · 水蒸气 / 烟 / 火 / 瓦斯 · 植物 / 克隆体 / 病毒 / 水源泉 / TNT
- **温度场与相变**：水↔汽↔冰、岩浆↔岩石、液氮汽化，全部带滞回死区，不会在阈值附近抖动
- **燃烧与爆炸**：火焰向上蔓延、燃料残余成灰、火药/瓦斯/TNT 的引信与连锁爆炸
- **植物生态**：种子在"水 + 5–40 °C + 未深埋"条件下发芽，向上生长，离水太远自动停止
- **风场**：全局风向与强度，热对流用气体浮力表达
- **三语界面**：简体中文（默认）/ English / 日本語，支持 `?lang=` 覆盖
- **存档**：localStorage 自动保存 + JSON 导出/导入 + 导出 PNG
- **元素图鉴**：内置 30 种元素的行为说明与交互规则速查
- **无障碍**：色盲友好纹样、高对比模式、`prefers-reduced-motion` 适配

### 性能

- 320×180 网格稳定 60 FPS；TypedArray + `ImageData` 直写像素
- 时间戳防重复移动（免去每帧清零开销）
- 单帧仿真预算 6 ms，超预算自动降级到 30 UPS 并提示

### 文档

- `docs/DESIGN.md` 游戏设计 · `docs/PHYSICS.md` 物理规范（数值冻结）· `docs/ART.md` 美术规范 · `docs/DESIGN-REVIEW.md` 设计审查记录

---

## [0.4.0] — 2026-09-17

### 新增

- 界面视觉落地（深色实验室主题、元素配色抖动）
- 内置元素图鉴与规则速查

## [0.3.0] — 2026-09-07

### 新增

- 元素面板与工具栏、画笔尺寸控制、暂停/单步/清屏
- 全局风场与热对流
- 温度探针（悬停显示格子的元素与温度）
- 存档 / 读档

## [0.2.0] — 2026-08-29

### 新增

- 液体扩散与黏度、气体浮力
- 离散导热与温度弛豫、潜热平台
- 相变系统（蒸发 / 冷凝 / 结冰 / 融化）
- 反应系统与燃烧模型

### 修复

- 导热耦合系数过大，导致岩浆在空气中 0.1 秒凝固

## [0.1.0] — 2026-08-15

### 新增

- 首个可运行原型：网格数据结构、固定步长主循环、粉末下落与堆积
- Canvas2D 像素渲染管线、画笔绘制

---

[1.1.0]: https://github.com/yewildy/yuansu-pixel-sandbox/releases/tag/v1.1.0
[1.0.0]: https://github.com/yewildy/yuansu-pixel-sandbox/releases/tag/v1.0.0

<!-- v1.1.0 发布说明：空气即元素 + 严格植物生态，元素/配色/存档不变 -->
<!-- v1.0.0 发布说明定稿 -->

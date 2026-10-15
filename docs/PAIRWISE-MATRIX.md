# 元素两两配对实验设计与现实对照基准（Pairwise Matrix）

> 项目：元素像素游戏 / Yuansu Pixel Sandbox
> 文档类型：QA 实验设计 + 现实对照基准（评分尺）
> 负责人：严守真（Yan Soujin，游戏质量保障与测试工程师）
> 配套：`tests/pairwise.js`（可执行骨架）、`tests/BASELINE.md`（改造前基线）
> 依据真源：`docs/PHYSICS.md`（§4 元素属性 / §7 相变 / §8 反应 / §9 燃烧 / §10 植物 / §11 风）、`docs/DESIGN.md` §7、`docs/ART.md` §2.1
> 目标：把"两两配对是否与现实一致、是否合理"从主观印象，变成 **逐条可编码、可复现、可审计** 的判据。

---

## 0. 结论速览（TL;DR）

| 项 | 值 |
|---|---|
| 元素对总数（有序 30×30） | **900** |
| 无序对（对称可复用） | **465** |
| **有意义组合（有序）** | **743** |
| 标记 N/A（无意义，用 `N/A` 标出而非跳过） | **157**（含 28 同种自配 + 129 静态固体互不作用） |
| 用量档 | 少量 `1×1` / 中等 `8×8` / 大量 `24×24` |
| 每组 tick 数 | 默认 **1200**（= 20 游戏秒）；快速反应另有 1–60 tick 早期快照 |
| 重复 | 默认 **3 个种子**（1337 / 2 / 7）——引擎确定性，故"重复"= 换种子采样，而非同种子重跑 |
| 自动判定 | `PASS` / `FAIL` / `UNEXPECTED` / `UNJUDGED` 四态，判据全部可编码 |
| 已从规格/代码看出的"不合理点" | **22 条**（见 §6；2026-10-12 修订后：**已修复 7 / 实测确认仍在 11 / 未覆盖 1 / 设计意图或简化 2 / 规格误述 1**，逐条状态见 §6 末表） |

---

## 1. 矩阵定义

### 1.1 元素 id 命名（重要）

- **元素 id 1 即将由 `EMPTY「空」` 升级为 `AIR「空气」`**（可移动气体，世界默认充满）。
- 本文与 `tests/pairwise.js` **一律按 `AIR` 命名**，并在文字里注明"这会替换原来的『空』"。
- 代码层面 `AIR` 与旧 `EMPTY` 是同一个 id（= 1），因此本实验骨架在升级前后都能直接运行（`pairwise.js` 用 `ID.AIR || ID.EMPTY` 兼容解析）。

### 1.2 31 种元素清单（id / key / 中文 / 类别 / 可移动；v1.4.0 新增 31 EMBER）

| id | key | 中文 | group | movable | id | key | 中文 | group | movable |
|---|---|---|---|---|---|---|---|---|---|
| 1 | **AIR**（原 EMPTY） | 空气（原"空"） | special | 否 | 16 | GUNPOWDER | 火药 | powder | 是 |
| 2 | WALL | 墙 | solid | 否 | 17 | SEED | 种子 | powder | 是 |
| 3 | STONE | 岩石 | solid | 否 | 18 | WATER | 水 | liquid | 是 |
| 4 | GLASS | 玻璃 | solid | 否 | 19 | OIL | 油 | liquid | 是 |
| 5 | METAL | 金属 | solid | 否 | 20 | LAVA | 岩浆 | liquid | 是 |
| 6 | ICE | 冰 | solid | 否 | 21 | ACID | 强酸 | liquid | 是 |
| 7 | WOOD | 木材 | solid | 否 | 22 | LN2 | 液氮 | liquid | 是 |
| 8 | PLANT | 植物 | special | 否 | 23 | STEAM | 水蒸气 | gas | 是 |
| 9 | SAND | 沙 | powder | 是 | 24 | SMOKE | 烟 | gas | 是 |
| 10 | SOIL | 土壤 | powder | 是 | 25 | FIRE | 火 | gas | 是 |
| 11 | SALT | 盐 | powder | 是 | 26 | GAS | 瓦斯 | gas | 是 |
| 12 | DUST | 尘埃 | powder | 是 | 27 | CLONE | 克隆体 | special | 否 |
| 13 | SNOW | 雪 | powder | 是 | 28 | VIRUS | 病毒 | special | 否 |
| 14 | ASH | 灰烬 | powder | 是 | 29 | SPRING | 水源泉 | liquid | 否 |
| 15 | COAL | 煤 | solid | 否 | 30 | TNT | 炸药 | special | 否 |
|  |  |  |  |  | **31** | **EMBER** | **永燃火种** | **special** | **否** |

### 1.3 组合分类口径（"有意义"如何判定）

矩阵为 **30×30 有序对 = 900**。由于本引擎的邻接交互基本对称（A 邻 B ⇔ B 邻 A），**对称对复用同一份结果**，但**产物里必须写清**（例如只写 `FIRE × WATER`，并注明 `WATER × FIRE` 同结论）。无序对为 **465**。

> v1.4.0 注：元素总数已增至 **31**（新增 `EMBER`），但 `tests/pairwise*.js` 的扫描范围仍为 id 1–30
> （本次任务书明确不改动 pairwise 脚本），故 EMBER 暂未纳入配对矩阵；其行为由 `V14` 专项测试覆盖
> （点燃邻木 / 长燃不熄 / 当炉子 / 爆炸不毁 / 水浇不灭）。

用 `node tests/pairwise.js --list` 可复现下列分类计数：

| 类 | 含义 | 有序 | 无序 |
|---|---|---|---|
| `REACTION` | §8 反应表命中 / CLONE 复制可移动邻居 / TNT 触发 | 75 | 38 |
| `PHASE` | 热/冷源相邻 → 触发相变（§7） | 34 | 21 |
| `THERMAL` | 热/冷源相邻 → 仅导热，无相变 | 94 | 43 |
| `AIR` | 某元素置于空气中（环境热库 / 浮力 / 供氧背景） | 58 | 29 |
| `LIFE` | 种子/植物 与 水/土壤 的湿度驱动（§10） | 8 | 4 |
| `MIX` | 两种可移动流体：密度分层 / 互不反应 | 104 | 52 |
| `FLOW` | 气体与物质混合（浮力 / 分层） | 72 | 36 |
| `STRUCT` | 流体绕流 / 粉末堆积于静态固体旁（无化学） | 298 | 149 |
| `SELF` | 同种物质相邻（除 TNT 外）：仅合并 / 流动，无反应 | 28 | 28 |
| `NONE` | 两者皆为静态固体且无反应（含 AIR×AIR） | 129 | 65 |

- **有意义 = 743 有序 / 372 无序**（上表除 `SELF` 与 `NONE`）。
- **N/A = 157 有序 / 93 无序**：`NONE` + `SELF`。典型 N/A：`WALL × WALL`、`WALL × STONE`、`GLASS × GLASS`、`STONE × METAL`、`ICE × WOOD`、`AIR × AIR`、`WATER × WATER`。
- **关键规则：无意义组合用 `N/A` 显式标记，不跳过**——保证 900 个格子全部有落点、可审计。全量无序对分类见 **附录 A**（由 `--dump` 生成）。
- `STRUCT`（149）/`SELF`（28）/`NONE`（65）三类共 **242 个无序对属于"无显著交互"**，统一预期为「现实中两者不发生明显反应 / 只是物理阻挡」→ 判 `PASS`（若无意外产物）或 `N/A`。

---

## 2. 用量分档（Amount Tiers）

| 档 | 代号 | 方格 | 说明 |
|---|---|---|---|
| 少量 | `small` | **1×1（1 格）** | 单格点接触，检验"最小剂量"行为 |
| 中等 | `mid` | **8×8（64 格）** | 一"笔刷"量，检验常规交互 |
| 大量 | `large` | **24×24（576 格）** | 一大片，检验"量变引起质变"与守恒/性能 |

**量为什么必须进入矩阵**：同一对组合在不同用量下可能得出相反结论。可编码的差异判据包括：

1. **接触面积**：`A` 与 `B` 相邻的格子数随用量增长 → 参与反应的格数不同。
2. **热容/热惯性**：`c·V`（比热 × 体积）随用量增长 → 相同热源下升温速度不同（例：1 格水 vs 576 格水被同一片火加热，前者迅速被烧干汽化，后者整体温升很小）。
3. **接触后是否"幸存"**：小剂量的一方可能被烧干/蚀穿/熔没，大剂量的一方幸存。**这正对应用户直觉里"少量水浇不灭大火"。**
4. **批处理阈值**：某些量足够大时才会触发的现象（如锅炉式水汽、整片液氮的冷爆、成片火药链爆）。

### 2.1 非对称用量（补充档）

对称分档（A、B 同档）不足以回答"少量水 vs 大火"，因此 `pairwise.js` 另提供 **`--sides=A:B`** 显式指定两侧用量：

```
node tests/pairwise.js --pair=WATER:FIRE --sides=1:24 --ticks=1800
```

- 例：`WATER:FIRE --sides=1:24` = **1 格水** 对 **24×24 火** → 用于验证"少量水浇不灭大火"。
- **实测（基线）**：1 格水最终被大火 +55°C/邻格 烤到汽化、整格消失；而 24×24 火在接触水的火格瞬间熄灭、其余靠自身寿命烧尽。→ 说明"灭火"与"量"的耦合需要单独判读（详见 §5.4 判据局限）。

---

## 3. 实验时长与重复

| 参数 | 默认 | 取值依据 |
|---|---|---|
| `--ticks` | **1200**（20 游戏秒） | 覆盖最慢的相变/燃烧/生命过程：冰融化 ~135 tick、岩浆凝固 ~100–160 tick、种子发芽 ≥110 tick、木燃烧 ~120 tick、液氮汽化 ~420 tick |
| 早期快照 | **t=1..60 每 tick + 每 30 tick** | 捕捉瞬时产物（火在 1 tick 内变烟、蒸汽上浮逸出）——否则会漏判 |
| `--repeats` | **3** | 见下 |
| 种子 | **1337 / 2 / 7**（可 `--seed=` 指定首种子） | 引擎全程确定性（`rng.js` 无 `Math.random`，`hash01(x,y,salt)` 混入全局 SEED） |

**如何消除随机性影响**：

- 引擎是**完全确定性**的：相同初始状态 + 相同种子 → 状态哈希逐位相同（回归 R-08）。因此"同种子重跑 N 次"结果必然一致，没有统计意义。
- 真正需要采样的是**不同种子**：`hash01` 的逐格随机判定随种子改变。默认跑 **3 个种子**，若某组合在不同种子下判定不一致 → 标记为 **不稳定（flaky）**，必须人工复核，且**不得并入基线**。
- 报告必须写明用了哪些种子，保证可复现。

---

## 4. 自动判定规则（可编码）

### 4.1 四态判定

| 状态 | 触发条件 | 含义 |
|---|---|---|
| **PASS** | 所有 `mustGone` / `mustAppear` / `minRemain` / `unchanged` 通过 **且** 无未预期产物 | 与现实预期一致 |
| **FAIL** | 任一显式断言不满足 | 预期行为未实现（含"该灭没灭""该生成没生成"） |
| **UNEXPECTED** | 出现了不在允许产物集合内的新元素 | 有未预料的产物 → 需人工归因 |
| **UNJUDGED** | 该组合尚无编码规则 | 不臆造，转入人工/后续补规则 |

### 4.2 判据的数据形态（全部可编码，无"看起来合理"）

每组合采样以下**量化字段**，规则只对这些字段做布尔/比较运算：

- `before[id]` / `after[id]`：起始 / 结束的各元素格数（`id` = 1..30）。
- `newElements` / `goneElements`：结束后 0→>0 / >0→0 的元素集合（`AIR`、`WALL` 背景/托盘除外）。
- `everSeen`：**全程曾出现**的元素（含中途产物，如 `SMOKE`、`STEAM`）——由早期快照与周期快照合并。
- `temp.{min,max,mean}`：结束时全场温度极值/均值。
- `hash`：结束状态哈希（用于确定性核对）。

规则字段（`pairwise.js` 的 `RULES`）：

| 字段 | 判据式 | 示例 |
|---|---|---|
| `gone: [E]` | `after[E] === 0` | `FIRE:WATER → gone:['FIRE']`（火应被浇灭） |
| `appear: [E]` | `after[E] > 0` | `LAVA:WATER → appear:['STONE']` |
| `minRemain: {E:n}` | `after[E] >= n` | `FIRE:WATER → minRemain:{WATER:1}`（水应基本留存） |
| `unchanged: [E]` | `after[E] === before[E]` | `ACID:GLASS → unchanged:['ACID','GLASS']`（玻璃耐酸） |
| `allowProducts: [E]` | 不在集合内的新产物 → `UNEXPECTED` | `FIRE:WOOD → allow:['SMOKE','ASH','FIRE']` |

文字化的等价判据示例（供非技术读者）：
- 「火×水」→ 现实：水吸热汽化、火被浇灭、水面产生蒸汽 → 引擎预期：**结束时 `FIRE==0`**；水应基本留存、温度上升。
- 「火×金属（铁）」→ 现实：金属导热快、把热迅速带走，短时间不燃；铁 1538°C 才熔 → 引擎预期：**金属不燃、仅升温；`T≥1500°C` 才变 `LAVA`**（本引擎 `METAL.meltPoint=1500`）。

### 4.3 ★判据局限（必须写清楚，避免假通过）

1. **`FIRE==0` 不是"被水浇灭"的有效证据**：火焰有固有寿命（`FIRE.lifetime≈40±10 tick`），**无论有没有水最终都会变成 `SMOKE`/`AIR`**。因此"火×水"的判别应看：① 与水相邻的火格是否**在 1 tick 内**消失（远快于寿命）；② 水是否被加热（`max 水温`上升）；③ `everSeen` 里是否出现 `STEAM`/`SMOKE`。仅凭结束 `FIRE==0` 无法区分"灭火"与"自灭"。**该局限已记入 §6 不合理清单 #8。**
2. **气体类产物常"消失"**：`STEAM`/`SMOKE` 上浮到顶边会被移除（§13.3），到 1200 tick 时可能已不在场。故判据必须使用 `everSeen`，或改小 `--ticks`。
3. **背景 `AIR` 与托盘 `WALL` 不计入产物**：为固定场景会铺设一排 `WALL` 作托盘（防止粉末/液体掉出画框），故 `WALL` 恒为背景，不参与"新物质"判定。
4. **同种自配 / 静态固体互配**：定义上即 `N/A`，不做反应判据，只核对"无意外产物"。

---

## 5. ★现实世界预期参考表

> 读法：**现实**＝真实物理/化学中会发生什么；**引擎**＝本规格/当前实现预期会怎样。二者用同一句话对照。
> `▲` 标记"引擎与现实的偏离点"，编号对应 §6 不合理清单。不确定处标注 **[需核实]**。

### 5.1 火 / 燃烧类

| 组合 | 现实（真实世界） | 引擎（这里） | 判据 |
|---|---|---|---|
| 火 × 水 | 水吸热汽化、把火浇灭，水面冒蒸汽 | `FIRE→SMOKE`，`WATER +55°C` 并可能汽化（R1） | `gone:['FIRE']`；水留存、升温 |
| 火 × 木材 | 木被点燃、持续燃烧、留炭/灰，火势沿木蔓延 | `WOOD` 按 `FUEL.WOOD`（`burnTicks=180, spreadP=0.05`）被点燃→`FIRE`→灰/空（R2、§9.3、COMBUSTION-MODEL）。**▲N1 已修复**（2026-10-12）：新增"燃料驱动火焰寿命 + 火焰锚定 + Chebyshev-2 供氧 + 持续耗氧"；实测 8×8 木块顶火 **81% 燃尽**、竖直木柱**窜顶**、密封盒**自熄** | 木格减少；出现 `SMOKE`/`ASH`/`FIRE`（现满足"持续/蔓延"） |
| 火 × 煤 | 煤燃点高、耐烧、放热多，烧后成灰 | `COAL` `FUEL.COAL`（`burnTicks=420, spreadP=0.03`）点燃（R4），烧尽按 `channelP` 开通道或留 `ASH`。**▲N1 已修复**：实测 8×8 煤块顶部点火 **1005 tick 全燃尽（0/64）** | 允许 `SMOKE`/`ASH`/`FIRE` |
| 火 × 油 | 油燃点低、易燃、火势猛烈，燃尽无渣 | `OIL` `p=0.20` 点燃（R3），燃尽→空（§9.3） | 允许 `SMOKE`/`FIRE` |
| 火 × 火药 | 火药爆燃、极快蔓延 | `GUNPOWDER` `p=0.35` 点燃 + 8 邻 `p=0.8` 链式（R5、§9.4） | 火药迅速清空 |
| 火 × 瓦斯 | 甲烷易燃易爆，火焰迅速传播 | `GAS` `p=0.40` 点燃 + 连爆（R6/R18） | 允许 `SMOKE`/`FIRE` |
| 火 × 植物 | **湿植物不易燃**；干枯部分才易着 ▲#18 | `PLANT` `p=0.15` 点燃；未燃部分**缺水枯萎成 `DUST`**（§10.2） | 允许 `SMOKE`/`ASH`/`DUST`/`FIRE` |
| 火 × 种子 | 种子受热可失去活性 / 被烧 | `SEED` `p=0.10` 点燃（R7） | 允许 `SMOKE`/`ASH`/`FIRE` |
| 火 × 尘埃 | 粉尘可爆（粉尘爆炸） | `DUST` `p=0.05` 点燃（R7） | 允许 `SMOKE`/`ASH`/`FIRE` |
| 火 × 病毒 | 无现实对应（病毒非可燃物） | `VIRUS` 可燃，`p=0.05` 点燃（R7） | 允许 `SMOKE`/`FIRE` |
| 火 × 火 | 两团火焰合并、继续燃烧（需燃料） | 无直接反应；各自按寿命消亡（`SELF`） | `everSeen` 出现 `SMOKE`；结束 `FIRE==0` |
| 火 × 冰 | 冰被加热融化→水/汽，火被削弱 | 冰升温融化（§7.3），`FIRE` 靠寿命消亡 | 出现 `WATER`/`STEAM`；火格减少 |
| 火 × 雪 | 雪迅速融化→水 | 雪 `T≥0` 融化（§7.4） | 出现 `WATER` |
| 火 × 金属（铁） | 金属导热快、迅速把热带走，短时不燃；铁 1538°C 才熔 | `METAL` 不燃、仅升温；`T≥1500°C` 才熔为 `LAVA`（§7.7） | 允许 `STONE`/`SMOKE`；金属不应大量消失 |
| 火 × 岩石 | 岩石不燃，仅升温 | `STONE` 不燃；`T≥1200` 才熔（本场景达不到） | 无产物变化 |
| 火 × 玻璃 | 玻璃不燃，仅升温 | `GLASS` 不燃；`T≥1400` 才熔 | 无产物变化 |
| 火 × 沙 | 沙不燃，仅升温 | `SAND` 不燃；`T≥1700` 才成玻璃（达不到 ▲#12） | 无产物变化 |
| 火 × 土壤 | 土壤（无机部分）不燃 | `SOIL` 不燃 | 无产物变化 |
| ▲#21 火 × 水（产物） | 水灭火基本不产生烟（以水蒸气为主） | R1 把火直接变 **`SMOKE`**，并给水 **+55°C**（能量凭空增加） | 观察 `everSeen` 是否含 `SMOKE` |
| ▲#22 火在水面 1 格上方 | 开阔水面上方火焰可短暂存在 | 只要 4 邻接 `WATER` 即 `p=1.0` 熄灭 → 水面正上方无法维持火焰 | 观察火是否"贴水面即灭" |

### 5.2 水 / 岩浆 / 相变类

| 组合 | 现实（真实世界） | 引擎（这里） | 判据 |
|---|---|---|---|
| 岩浆 × 水 | 岩浆骤冷凝固成岩、水剧烈汽化，沸腾飞溅 | `LAVA→STONE`（`p=1.0`）、水产汽（`p=0.8`，R12），邻域 `+120°C` | `gone:['LAVA']`,`appear:['STONE']` |
| 岩浆 × 冰 | 冰瞬间化水、再汽化，岩浆凝固 | `LAVA→STONE`；冰→`WATER`/`STEAM`（R13） | `gone:['LAVA']`,`appear:['STONE']` |
| 岩浆 × 雪 | 雪极速融化→水→汽 | 雪融化（§7.4）+ 岩浆凝固 | 出现 `WATER`/`STONE` |
| 岩浆 × 沙 | **沙可被高温熔成玻璃**（~1700°C） | **▲#12 已修复**（接触反应 R20）：`LAVA` 4 邻接 `SAND` → 沙以 `p=0.02/tick` 变 `GLASS`（阈值路线因沙浮于岩浆、单面受热封顶 ~286–528 °C 而不可达）；辅路径 `GLASS_T=1100` 兜底 | `appear:['GLASS']`；实测 GLASS=53–59、反例=0 |
| 岩浆 × 岩石 | 岩石熔点约 1000–1200°C，可被岩浆软化/熔融 | `STONE` 需 `T≥1200°C` 且 `p=0.005(T-1200)`；恰好 1200 时 `p=0`，且岩浆正在放热降温 → **通常不熔** | 观察 `STONE` 是否减少 |
| 岩浆 × 金属 | 铜 1085°C、铝 660°C 会被熔；铁 1538°C 不会 | 统一 `METAL` 熔点 1500 > 岩浆 1200 → **总不熔** ▲#13 | 金属减少与否 |
| 岩浆 × 玻璃 | 玻璃 1400°C 软化 | 需 `T≥1400` → 达不到 → 不熔 | 无产物变化 |
| 岩浆 × 盐 | 盐熔点 801°C，会被熔成熔盐 | 盐 `T≥801` 熔为 `LAVA`（近似归并）▲#11 | 观察 `SALT` 是否减少 |
| 水 × 冰 | 冰吸热融化，水温下降 | `ICE→WATER`（§7.3） | `gone:['ICE']`，`WATER` 增加 |
| 水 × 雪 | 雪融化，水温降 | 雪融化（§7.4） | `SNOW` 减少、`WATER` 增加 |
| 水 × 液氮 | 液氮沸腾汽化（氮气），水被冻成冰 | `LN2` 汽化→`STEAM`（**非氮气**）▲#3；水可能结冰为 `ICE` | `gone:['LN2']`；允许 `ICE`/`STEAM`/`WATER` |
| 液氮 × 岩浆 | 极冷与极热剧烈交换，岩浆骤冷 | 强导热（`k=0.35`）→ 岩浆快速凝固 | 观察 `LAVA` 减少 |
| 液氮 × 蒸汽/烟 | 冷雾使蒸汽冷凝 | `LN2` 抽热 → `STEAM` 冷凝为水 | 观察 `STEAM` 减少 |

### 5.3 酸 / 溶解 / 腐蚀

| 组合 | 现实（真实世界） | 引擎（这里） | 判据 |
|---|---|---|---|
| 酸 × 金属 | 酸蚀金属，放出氢气、生成金属盐溶液（质量守恒） | `METAL→AIR`（金属"消失"）、`p=0.3` 生成 `GAS`、酸被消耗（R8）▲#2 | 允许 `GAS`/`SMOKE`；**金属凭空减少**（记为偏离） |
| 酸 × 岩石 | 酸蚀岩石（如碳酸盐遇酸起泡） | `STONE→AIR`、酸部分消耗（R9） | 观察 `STONE` 减少 |
| 酸 × 玻璃 | **多数酸不蚀玻璃**（氢氟酸除外） | `ACID` 对 `GLASS` 明确不发生反应（R10） | `unchanged:['ACID','GLASS']` |
| 酸 × 沙 / 土 / 冰 | 一般不反应（沙/土耐酸，冰被酸加速化） | 引擎无对应反应 → 无变化 | 无产物变化 |
| 盐 × 水 | 盐溶解为盐水（离子留存），有轻微吸热 | `SALT→AIR`（**盐彻底消失**），水不变、`-2°C`（R11）▲#1 | `gone:['SALT']`；水不变（偏离点） |
| 水 × 油 | 不相溶、油浮于水面，分层 | 密度分层：`OIL(900)` 浮于 `WATER(1000)`（§5.2） | 两者均留存、分层 |
| 水 × 酸 | 稀释、放热（无新物质） | 引擎无对应反应；因密度 `ACID 1050 > WATER 1000` 会分层 | 无产物变化 |

### 5.4 生命 / 病毒 / 克隆 / 源泉

| 组合 | 现实（真实世界） | 引擎（这里） | 判据 |
|---|---|---|---|
| 种子 × 水 | 吸水膨胀、发芽（需温度适宜） | 湿+温+露头 累积 90 tick → `PLANT`（§10.1） | `appear:['PLANT']` |
| 种子 × 土壤 | 土壤提供湿度与支撑，发芽 | 同上（`SOIL` 计入"湿度"） | `appear:['PLANT']` |
| 植物 × 水 | 植物靠根吸水生长 | **▲#7 已修复**：严格生态——着地 + 根系连通 + 根区供水才生长，断根即枯（`biology.js`；`tests/run.js` D2/B4） | 出现更多 `PLANT` |
| 植物 × 土壤 | 根固定于土壤、吸收养分 | **▲#7 已修复**：`SOIL` 计入"根区湿度"来源；无根/断根则不生长 | 植物可生长；需连地 |
| 病毒 × 植物 | 病毒感染并摧毁植物 | `PLANT→VIRUS` `p=0.05`（R15） | `PLANT` 减少、`VIRUS` 增加 |
| 病毒 × 木材 | 现实中病毒不侵染木材 | `WOOD→VIRUS` `p=0.05`（R15）—— 演绎化设定 | `WOOD` 减少、`VIRUS` 增加 |
| 病毒 × 种子 | 现实中病毒一般不侵染种子 | `SEED→VIRUS` `p=0.03`（R16）—— 演绎化设定 | `SEED` 减少 |
| 克隆体 × 任意可移动元素 | 无现实对应（科幻机制） | 每 4 tick 复制一个相邻可移动元素（R14），配额 2000 | 目标元素格数增加 |
| 水源泉 × 空 | 无现实对应（无限水源机制） | **▲#16 已修复**：`reactions.js` R19 已实装出水（`SPRING.EMIT_INTERVAL=6`、配额 `MAX_CELLS=1500`；`tests/run.js` 12a/12b） | `SPRING` 不变、持续产出 `WATER` |

### 5.5 爆炸

| 组合 | 现实（真实世界） | 引擎（这里） | 判据 |
|---|---|---|---|
| 炸药 × 火 | 火焰/高温引爆 | `T≥180°C` 或邻接 `FIRE` → 引爆（#17） | 半径 6 内毁灭；`TNT` 清空 |
| 炸药 × 岩浆 | 高温引爆 | `LAVA` 高温同样满足触发条件 | 出现爆炸效应 |
| 炸药 × 炸药 | 相邻炸药连锁殉爆 | 引爆源存在时链式（`CHAIN_MAX=8`）；**无火源时不自爆** | 无火源：`unchanged:['TNT']`；有火源：清空 |
| 炸药 × 火药 | **有引爆源时**殉爆；无引发剂/冲击则不爆 | 半径内 `GUNPOWDER` 被点燃（§9.5）。**实测订正**：无火源时二者**均不引爆**（`TNT` 64→64 不变）→ 引擎行为正确 | 有引爆源：清空；无火源：`unchanged:['TNT','GUNPOWDER']` |
| 炸药 × 瓦斯 | **有引爆源时**殉爆；无引发剂/冲击则不爆 | 半径内 `GAS` 被点燃。**实测订正**：无火源时 `TNT` **不引爆**；瓦斯比空气轻会上浮逸出顶边（正常） | 有引爆源：清空；无火源：`unchanged:['TNT']` |

### 5.6 空气（`AIR × 全部`，29 组）

> 元素 1（当前 `EMPTY`，将升级 `AIR`）是世界默认背景，故"X × 空气"= "X 在空气中"。统一预期：空气为弱导热介质 + 供氧背景 + 气体上浮的通道。

| 组合 | 现实（真实世界） | 引擎（这里） | 判据 |
|---|---|---|---|
| 火 × 空气 | 无燃料的火会熄灭，产生烟 | `FIRE` 寿命耗尽→`SMOKE`/`AIR` | `gone:['FIRE']` |
| 岩浆 × 空气 | 岩浆在空气中缓慢降温、最终凝固 | 散热→`STONE`（§6.1 标定 ~2.2s） | 观察 `LAVA→STONE` |
| 水 × 空气 | **室温水不会自发蒸发** | `T<60°C` 不蒸发（§7.1、回归 R-03） | `unchanged:['WATER']` |
| 冰 × 空气 | 冰在室温空气中融化 | 冰升温融化（回归 R-04） | `ICE` 减少 |
| 蒸汽 × 空气 | 蒸汽上升、降温冷凝成水（雨） | 上升 + `T<100` 冷凝（§7.2） | 出现 `WATER` |
| 烟 × 空气 | 烟扩散稀释、逐渐消散 | 上升 + 300 tick 寿命后→`AIR` ▲#10 | `SMOKE` 减少 |
| 瓦斯 × 空气 | 甲烷比空气轻，上浮、扩散 | 上浮 + 扩散（§5.3） | `GAS` 位移、可逸出顶边 |
| 液氮 × 空气 | 液氮在空气中剧烈沸腾、结霜 | 吸热汽化（但映射为 `STEAM`）▲#3 | `LN2` 减少 |
| 金属 × 空气 | 金属导热快，但仅靠空气散热很慢 | 弱导热 + 慢弛豫（§6） | 几乎不变 |
| ~~▲#5~~ 任意热源 × 空气（**已修复**） | 空气对流把热迅速带走 | **#5 已修复**：空气双轨导热（`AIR.SELF_K=0.5`）+ 浮力置换；探针 `air-conduct` 实测隔 1 格空气的水 **+27.9 °C** | 见 §6.1 状态表 #5 |
| 其余（静态固体 × 空气等） | 无显著交互 | 无反应 | 无产物变化 |

### 5.7 混合 / 分层（`MIX`，52 组，无化学反应）

| 组合 | 现实（真实世界） | 引擎（这里） | 判据 |
|---|---|---|---|
| 水 × 油 | 油浮于水面、分层 | 密度分层 | 两者留存、分层 |
| 沙 × 水 | 沙沉入水、被水浸没 | 沙下沉、水绕流 | 无新产物 |
| 沙 × 盐 / 尘 / 雪 / 灰 / 火药 / 种子 | 干燥混合物、可分层/混合 | 各自按粉末规则堆积、按 `repose` 成坡 | 无新产物 |
| 水 × 酸 | 互溶稀释 | 密度分层（无反应） | 无新产物 |
| 其余粉/液两两 | 无显著化学交互 | 仅流动/堆积 | 无新产物 |

### 5.8 气体流动（`FLOW`，36 组）

| 组合 | 现实（真实世界） | 引擎（这里） | 判据 |
|---|---|---|---|
| 蒸汽 × 水 | 蒸汽在水中上升、冒泡，遇冷冷凝 | 气体上浮 + 冷凝（§5.3/§7.2） | 出现 `WATER`/`SMOKE` 等 |
| 烟 / 瓦斯 × 粉/液 | 气体穿过/托起松散物，随风流飘散 | 上浮 + 风化漂移（§11） | 气体位移 |
| 蒸汽 × 烟 / 瓦斯 | 气体混合、密度分层 | 密度略异、整体上浮 | 无新产物 |

### 5.9 结构（`STRUCT`，149 组）——"无显著交互"

| 组合 | 现实（真实世界） | 引擎（这里） | 判据 |
|---|---|---|---|
| 墙 / 静态固体 × 水/油/酸/沙/雪… | 流体被挡住、绕流；粉末堆在固体上 | 静态固体不可移动，流体绕行、粉末成坡（§5.1） | 静态固体不变；无新产物 |
| 冰 × 岩浆类以外的静态固体 | 两者相邻无明显反应（近冰者可能结霜，本作忽略） | 无反应 | 无产物变化 |

### 5.10 同种自配（`SELF`，28）/ 无交互（`NONE`，65）——`N/A`

| 组合 | 现实（真实世界） | 引擎（这里） | 判据 |
|---|---|---|---|
| 同种物质相邻（除 `TNT×TNT`） | 合并/堆叠，无化学反应 | 仅合并/流动 | `N/A`（核对无意外产物） |
| 两种静态固体（如 `STONE × GLASS`、`WALL × METAL`、`ICE × WOOD`） | 无显著交互 | 无反应 | `N/A` |
| `AIR × AIR` | 单一介质 | 无交互 | `N/A` |
| `TNT × TNT`（例外） | 需外部引信，否则不爆 | 无火源/高温→不触发（正确） | `unchanged:['TNT']` |

---

## 6. 不合理清单（预期）——从规格与代码已能看出

> 这些是**在跑全量矩阵之前**、仅凭阅读 `docs/PHYSICS.md` 与 `src/core/*` 就能判定的"与现实不符 / 内部矛盾"点。标记 `【已实测】` 者已在 `tests/BASELINE.md` 复现。
>
> **★ 逐条实测状态见本节末「6.1 本轮逐条实测状态」表**（2026-10-12 修订）；全量实测版清单见**唯一真源** `docs/PAIRWISE-REPORT.md`（编号索引见其 §6.7）。本表为"跑之前的预判"，两表编号不一一对应。

| # | 不合理点 | 现实对照 | 证据/位置 | 状态 |
|---|---|---|---|---|
| 1 | **盐溶于水后盐直接消失**：`SALT→AIR`，水无任何"变咸"痕迹（水量、密度、凝固点均不变） | 盐以离子形式留在水中 | `reactions.js` R11；基线 `SALT×WATER`：`SALT 64→0`，`WATER 64→64` | 【已实测】 |
| 2 | **酸蚀不守恒**：`ACID+METAL → METAL→AIR`（金属质量蒸发），非"溶解入液" | 生成金属盐溶液 + H₂，质量守恒 | `reactions.js` R8 | 待实测确认 |
| 3 | **倒液氮会凭空造水**：`LN2` 汽化映射为 `STEAM`，蒸汽再冷凝为 `WATER` | 氮气 ≠ 水 | `transitions.js` P8 + `§7.8`；基线 `WATER×LN2`：`WATER 64→87` | 【已实测】 |
| 4 | **燃烧不消耗氧、不产 CO₂**：以"存在 `EMPTY` 邻格"近似供氧，`EMPTY` 永不减少 | O₂ 被消耗、密闭空间会熄灭 | `reactions.js hasOxygen`；`§9.1`/`§15.6` | 待实测确认 |
| 5 | **空气几乎不导热**：`k=0.002`，且导热跳过 `AIR–AIR` 对 | 空气导热弱但非零，且靠对流强传热 | `thermal.js`（`ei===1&&ej===1` 跳过）；探针 `air-conduct`：水升温 **0.00°C/600tick** | 【已实测】（用户点名） |
| 6 | **热空气不上升**：`AIR.movable=false`，热空气原地散热、不产生上升气流 | 热空气上浮、形成对流 | `elements.js`（`movable=0`）；探针 `hot-air-rises`：热空气不位移、直接冷却消失 | 【已实测】（用户点名） |
| 7 | **植物无根、无向地性**：生长仅"向上 1 格"，无根系、无向光/向肥；悬空单株靠 2 格外的水即可长 24 格 | 植物有根、向地/向光生长 | `biology.js`；探针 `plant-root`/`plant-air` | 【已实测】（用户点名） |
| 8 | **"灭火"与用量无关 + `FIRE==0` 判据失效**：R1 只要 4 邻接 `p=1.0`；且火有固定寿命、无水也会自灭 | 灭火效果应取决于水量与水火比 | `reactions.js` R1 + `engine.js agePass`；`WATER:FIRE --sides=1:24` 中水被烧干 | 【已实测】 |
| 9 | **蒸汽 600 tick 强制变水**（`lifetime=600`，`decayTo=WATER`），即使 `T>100°C` | 高温蒸汽不会自行冷凝 | `elements.js` STEAM；`§4.3` | 待实测确认 |
| 10 | **烟 300 tick 直接变 AIR**：无扩散稀释过程 | 烟逐渐稀释（近似可接受，但属质量损失） | `elements.js` SMOKE | 待实测确认 |
| 11 | **所有熔融统一映射为 `LAVA`**：金属熔/盐熔/玻璃熔都成"岩浆" | 熔融金属/熔盐/玻璃各自独立 | `§7.7` | 待实测确认 |
| 12 | **沙→玻璃链实际不可达**：需 1700°C，最强热源 `LAVA` 仅 1200°C（TNT +400 → 1600 仍不足） | 沙可由高温成玻璃 | `balance.js SAND.GLASS_T=1700`；基线 `LAVA×SAND`：`SAND` 不变 | 【已实测】 |
| 13 | **金属不熔于岩浆**：`METAL.meltPoint=1500 > LAVA 1200` → 永不熔（对铁成立，对铜/铝不成立） | 铜 1085°C、铝 660°C 会被熔 | `balance.js METAL` | 待实测确认 |
| 14 | **水冰死区 `[-2,0]`**：水在 -2°C 才结冰、冰在 0°C 才融化 | 水 0°C 即结冰 | `§7.3`（刻意的迟滞，非物理） | 设计意图，标记 |
| 15 | **玻璃"耐酸"但对沙/土/冰也不蚀** | 氢氟酸腐蚀玻璃；沙/土可被强酸部分蚀 | `reactions.js` R10 | 设计简化 |
| 16 | **水源泉 `SPRING` 无出水实现**：`src/core` 无任何 SPRING 代码，配额参数存在但未使用 → 元素 29 为"死元素" | 应持续出水 | `balance.js` 有 `SPRING.EMIT_INTERVAL`；全仓无调用；基线 `SPRING×WATER` 无变化 | 【已实测】 |
| 17 | **密闭空间燃烧不合理**：只要 1 格 `AIR` 邻接即可持续点燃，且 `AIR` 不消耗 | O₂ 耗尽即熄 | `reactions.js` needsOxy | 待实测确认 |
| 18 | **植物含水却极易燃**：`PLANT` `flammability 0.15`、燃点 250°C | 活体湿植物不易燃 | `elements.js` PLANT | 待实测确认 |
| 19 | **种子以"上方 2 格有空气/水"近似"光"** | 多数种子在土内无光也能发芽 | `§10.1` | 设计近似，标记 |
| 20 | **TNT 触发过于敏感**：`T≥180°C` 或邻接火/爆炸即爆 | 需引爆器/冲击 | `§9.5` | 待实测确认 |
| 21 | **火被水灭后变 `SMOKE` 而非消失**，并给水 `+55°C`（能量凭空增加） | 水灭火以水蒸气为主、基本不产生烟 | `reactions.js` R1 | 待实测确认 |
| 22 | **火在水面 1 格上方无法燃烧**：4 邻接 `WATER` 即熄灭 | 开阔水面上方火焰可短暂存在 | `reactions.js` R1 | 待实测确认 |

> 统计：**22 条**，其中 **7 条已实测复现**（#1 #3 #5 #6 #7 #8 #12 #16 —— 实为 8 条）。

### 6.1 本轮逐条实测状态（2026-10-12 · T6.3 收口）

> 判据：**已修复** = 有本轮实测/回归证据支撑；**实测确认仍在** = 现象复现且仍偏离现实；**未覆盖** = 本矩阵场景测不到、需专项探针（不臆断）；**设计意图/简化** = 刻意取舍；**规格误述** = 引擎对、文档错。
> 回指列为**唯一真源** `docs/PAIRWISE-REPORT.md` 的对应小节。

| # | 不合理点（摘要） | 本轮实测状态 | 回指 |
|---|---|---|---|
| 1 | 盐溶于水后盐直接消失 | **实测确认仍在**（Minor） | REPORT §4.4 |
| 2 | 酸蚀不守恒（金属质量蒸发） | **实测确认仍在**（Major） | REPORT §4.4 |
| 3 | 倒液氮凭空造水（LN2→STEAM→水） | **✅ 已修复**（LN2 汽化产物改 AIR） | REPORT §5 B4 |
| 4 | 燃烧不消耗氧、不产 CO₂ | **◐ 部分修复**（N1 已加"持续耗氧"；仍不产 CO₂） | REPORT §6.3 |
| 5 | 空气几乎不导热（k=0.002 且跳过 AIR–AIR） | **✅ 已修复**（探针 +27.9 °C） | REPORT §5 B1 |
| 6 | 热空气不上升（`AIR.movable=false`） | **✅ 已修复**（探针 ΔY=−17 格） | REPORT §5 B2 |
| 7 | 植物无根、无向地性、悬空疯长 | **✅ 已修复**（严格生态：着地+根系+供水） | REPORT §4.2 相关 |
| 8 | "灭火"与用量无关 + `FIRE==0` 判据失效 | **实测确认仍在**（Major） | REPORT §4.5 |
| 9 | 蒸汽 600 tick 强制变水（T>100 也冷凝） | **○ 未覆盖**（矩阵场景测不到；`run.js` 用例 13 已单独验证 T≥100 恒不冷凝） | REPORT §6.6 |
| 10 | 烟 300 tick 直接变 AIR（无稀释过程） | **实测确认仍在**（Minor，近似可接受） | REPORT §4.14 |
| 11 | 所有熔融统一映射为 LAVA | **实测确认仍在**（Major，设计简化） | REPORT §4.6 |
| 12 | 沙→玻璃链实际不可达 | **✅ 已修复（R20 接触反应）** | REPORT §4.8 |
| 13 | 金属不熔于岩浆（铜/铝也不熔） | **实测确认仍在**（Major） | REPORT §4.7 |
| 14 | 水冰死区 [-2,0] | **设计意图**（刻意迟滞，保留） | REPORT §4.12 |
| 15 | 玻璃"耐酸"但对沙/土/冰也不蚀 | **实测确认**（Minor，可接受简化；酸×玻璃不变=正确） | REPORT §6.4 |
| 16 | 水源泉 SPRING 无出水实现 | **✅ 已修复**（R19 出水，配额 1500） | REPORT §5 B8 |
| 17 | 密闭空间燃烧不合理（1 格 AIR 可续燃） | **✅ 已修复**（N1 密封盒 ×5 种子自熄、残木 100%） | REPORT §4.3 |
| 18 | 植物含水却极易燃 | **实测确认仍在**（Major） | REPORT §4.9 |
| 19 | 种子以"上方 2 格空气"近似"光" | **实测确认仍在**（Minor，设计近似） | REPORT §4.15 |
| 20 | TNT 触发过于敏感 | **规格误述**（无火源不炸 → 引擎正确，文档 §5.5 已订正） | REPORT §6.4 |
| 21 | 火被水灭后变 SMOKE 并给水 +55 °C | **实测确认仍在**（Minor） | REPORT §4.10 |
| 22 | 火在水面 1 格上方无法燃烧 | **实测确认现象存在**（Minor） | REPORT §6.6 |

**计数**：已修复 **7**（#3 #5 #6 #7 #12 #16 #17）/ 实测确认仍在 **11**（#1 #2 #4(部分) #8 #10 #11 #13 #15 #18 #19 #21 #22 —— 含部分修复与可接受简化）/ 未覆盖 **1**（#9）/ 设计意图 **1**（#14）/ 规格误述 **1**（#20）。合计 **22**。

> 另：**本轮新增未修项** —— 「**点燃的种子/位置脆弱性**」（Major）见 REPORT §4.16；「**火焰不能沿燃料蔓延**」已修复（REPORT §4.3）。

---

## 7. 报告模板（最终产出长什么样）

逐组一行，非技术读者每行一句话即可读懂"现实会怎样 / 这里会怎样"：

| 组合 | 用量 | 现实预期 | 实测结果 | 判定 | 备注 |
|---|---|---|---|---|---|
| FIRE × WATER | mid (8×8) | 水吸热汽化、火被浇灭、冒蒸汽 | FIRE 64→0，WATER 64→60，曾现 STEAM/SMOKE | **PASS** | "FIRE==0"不足以证明灭火（火会自灭），需看接触格与升温 |
| SALT × WATER | mid | 盐溶于水（水变咸、质量守恒） | SALT 64→**0**，WATER 64→64 不变 | **FAIL** | 盐凭空消失、水无变化 → 不合理 #1 |
| … | … | … | … | … | … |

**字段定义**：
- **组合**：`A × B`（有序；对称对复用结果并注明）。
- **用量**：`small/mid/large` 或非对称 `sides A:B`。
- **现实预期**：一句话真实物理/化学结论；无显著交互写"无显著交互"。
- **实测结果**：`tests/pairwise.js` 输出的前后格数、`everSeen`、温度极值。
- **判定**：`PASS` / `FAIL` / `UNEXPECTED` / `UNJUDGED` / `N/A`。
- **备注**：对应 §6 不合理清单编号、种子、是否 flaky。

---

## 附录 A · 全量无序对分类清单（465 组，可审计）

> 由 `node tests/pairwise.js --dump` 生成。等价于把 900 个有序格按"对称复用"折叠为 465 行，**无一对被跳过**。
> 注：元素 id 1 现名为 `EMPTY`，本表统一按升级后的 `AIR` 书写；工具输出中会显示 `EMPTY`（同一 id）。

**REACTION（38）**
`STONE×ACID, METAL×ACID, ICE×LAVA, WOOD×FIRE, WOOD×VIRUS, PLANT×FIRE, PLANT×VIRUS, SAND×CLONE, SOIL×CLONE, SALT×WATER, SALT×CLONE, DUST×FIRE, DUST×CLONE, SNOW×CLONE, ASH×CLONE, COAL×FIRE, GUNPOWDER×FIRE, GUNPOWDER×CLONE, SEED×FIRE, SEED×CLONE, SEED×VIRUS, WATER×LAVA, WATER×FIRE, WATER×CLONE, OIL×FIRE, OIL×CLONE, LAVA×CLONE, LAVA×TNT, ACID×CLONE, LN2×CLONE, STEAM×CLONE, SMOKE×CLONE, FIRE×GAS, FIRE×CLONE, FIRE×VIRUS, FIRE×TNT, GAS×CLONE, TNT×TNT`

**PHASE（21）**
`STONE×LAVA, STONE×LN2, STONE×FIRE, GLASS×LAVA, GLASS×LN2, GLASS×FIRE, METAL×LAVA, METAL×LN2, METAL×FIRE, ICE×LN2, ICE×FIRE, SAND×LAVA, SAND×LN2, SAND×FIRE, SALT×LAVA, SALT×LN2, SALT×FIRE, SNOW×LAVA, SNOW×LN2, SNOW×FIRE, WATER×LN2`

**THERMAL（43）**
`WALL×LAVA, WALL×LN2, WALL×FIRE, WOOD×LAVA, WOOD×LN2, PLANT×LAVA, PLANT×LN2, SOIL×LAVA, SOIL×LN2, SOIL×FIRE, DUST×LAVA, DUST×LN2, ASH×LAVA, ASH×LN2, ASH×FIRE, COAL×LAVA, COAL×LN2, GUNPOWDER×LAVA, GUNPOWDER×LN2, SEED×LAVA, SEED×LN2, OIL×LAVA, OIL×LN2, LAVA×ACID, LAVA×LN2, LAVA×STEAM, LAVA×SMOKE, LAVA×FIRE, LAVA×GAS, LAVA×VIRUS, LAVA×SPRING, ACID×LN2, ACID×FIRE, LN2×STEAM, LN2×SMOKE, LN2×FIRE, LN2×GAS, LN2×VIRUS, LN2×SPRING, LN2×TNT, STEAM×FIRE, SMOKE×FIRE, FIRE×SPRING`

**AIR（29）** — 即"X 在空气中"（`AIR` 为元素 1）
`AIR×WALL, AIR×STONE, AIR×GLASS, AIR×METAL, AIR×ICE, AIR×WOOD, AIR×PLANT, AIR×SAND, AIR×SOIL, AIR×SALT, AIR×DUST, AIR×SNOW, AIR×ASH, AIR×COAL, AIR×GUNPOWDER, AIR×SEED, AIR×WATER, AIR×OIL, AIR×LAVA, AIR×ACID, AIR×LN2, AIR×STEAM, AIR×SMOKE, AIR×FIRE, AIR×GAS, AIR×CLONE, AIR×VIRUS, AIR×SPRING, AIR×TNT`

**LIFE（4）**
`PLANT×SOIL, PLANT×WATER, SOIL×SEED, SEED×WATER`

**MIX（52）**
`SAND×SOIL, SAND×SALT, SAND×DUST, SAND×SNOW, SAND×ASH, SAND×GUNPOWDER, SAND×SEED, SAND×WATER, SAND×OIL, SAND×ACID, SOIL×SALT, SOIL×DUST, SOIL×SNOW, SOIL×ASH, SOIL×GUNPOWDER, SOIL×WATER, SOIL×OIL, SOIL×ACID, SALT×DUST, SALT×SNOW, SALT×ASH, SALT×GUNPOWDER, SALT×SEED, SALT×OIL, SALT×ACID, DUST×SNOW, DUST×ASH, DUST×GUNPOWDER, DUST×SEED, DUST×WATER, DUST×OIL, DUST×ACID, SNOW×ASH, SNOW×GUNPOWDER, SNOW×SEED, SNOW×WATER, SNOW×OIL, SNOW×ACID, ASH×GUNPOWDER, ASH×SEED, ASH×WATER, ASH×OIL, ASH×ACID, GUNPOWDER×SEED, GUNPOWDER×WATER, GUNPOWDER×OIL, GUNPOWDER×ACID, SEED×OIL, SEED×ACID, WATER×OIL, WATER×ACID, OIL×ACID`

**FLOW（36）**
`SAND×STEAM, SAND×SMOKE, SAND×GAS, SOIL×STEAM, SOIL×SMOKE, SOIL×GAS, SALT×STEAM, SALT×SMOKE, SALT×GAS, DUST×STEAM, DUST×SMOKE, DUST×GAS, SNOW×STEAM, SNOW×SMOKE, SNOW×GAS, ASH×STEAM, ASH×SMOKE, ASH×GAS, GUNPOWDER×STEAM, GUNPOWDER×SMOKE, GUNPOWDER×GAS, SEED×STEAM, SEED×SMOKE, SEED×GAS, WATER×STEAM, WATER×SMOKE, WATER×GAS, OIL×STEAM, OIL×SMOKE, OIL×GAS, ACID×STEAM, ACID×SMOKE, ACID×GAS, STEAM×SMOKE, STEAM×GAS, SMOKE×GAS`

**STRUCT（149）** — 一静一动的"无化学"组合（完整）
`WALL×SAND, WALL×SOIL, WALL×SALT, WALL×DUST, WALL×SNOW, WALL×ASH, WALL×GUNPOWDER, WALL×SEED, WALL×WATER, WALL×OIL, WALL×ACID, WALL×STEAM, WALL×SMOKE, WALL×GAS, STONE×SAND, STONE×SOIL, STONE×SALT, STONE×DUST, STONE×SNOW, STONE×ASH, STONE×GUNPOWDER, STONE×SEED, STONE×WATER, STONE×OIL, STONE×STEAM, STONE×SMOKE, STONE×GAS, GLASS×SAND, GLASS×SOIL, GLASS×SALT, GLASS×DUST, GLASS×SNOW, GLASS×ASH, GLASS×GUNPOWDER, GLASS×SEED, GLASS×WATER, GLASS×OIL, GLASS×ACID, GLASS×STEAM, GLASS×SMOKE, GLASS×GAS, METAL×SAND, METAL×SOIL, METAL×SALT, METAL×DUST, METAL×SNOW, METAL×ASH, METAL×GUNPOWDER, METAL×SEED, METAL×WATER, METAL×OIL, METAL×STEAM, METAL×SMOKE, METAL×GAS, ICE×SAND, ICE×SOIL, ICE×SALT, ICE×DUST, ICE×SNOW, ICE×ASH, ICE×GUNPOWDER, ICE×SEED, ICE×WATER, ICE×OIL, ICE×ACID, ICE×STEAM, ICE×SMOKE, ICE×GAS, WOOD×SAND, WOOD×SOIL, WOOD×SALT, WOOD×DUST, WOOD×SNOW, WOOD×ASH, WOOD×GUNPOWDER, WOOD×SEED, WOOD×WATER, WOOD×OIL, WOOD×ACID, WOOD×STEAM, WOOD×SMOKE, WOOD×GAS, PLANT×SAND, PLANT×SALT, PLANT×DUST, PLANT×SNOW, PLANT×ASH, PLANT×GUNPOWDER, PLANT×SEED, PLANT×OIL, PLANT×ACID, PLANT×STEAM, PLANT×SMOKE, PLANT×GAS, SAND×COAL, SAND×VIRUS, SAND×SPRING, SAND×TNT, SOIL×COAL, SOIL×VIRUS, SOIL×SPRING, SOIL×TNT, SALT×COAL, SALT×VIRUS, SALT×SPRING, SALT×TNT, DUST×COAL, DUST×VIRUS, DUST×SPRING, DUST×TNT, SNOW×COAL, SNOW×VIRUS, SNOW×SPRING, SNOW×TNT, ASH×COAL, ASH×VIRUS, ASH×SPRING, ASH×TNT, COAL×GUNPOWDER, COAL×SEED, COAL×WATER, COAL×OIL, COAL×ACID, COAL×STEAM, COAL×SMOKE, COAL×GAS, GUNPOWDER×VIRUS, GUNPOWDER×SPRING, GUNPOWDER×TNT, SEED×SPRING, SEED×TNT, WATER×VIRUS, WATER×SPRING, WATER×TNT, OIL×VIRUS, OIL×SPRING, OIL×TNT, ACID×VIRUS, ACID×SPRING, ACID×TNT, STEAM×VIRUS, STEAM×SPRING, STEAM×TNT, SMOKE×VIRUS, SMOKE×SPRING, SMOKE×TNT, GAS×VIRUS, GAS×SPRING, GAS×TNT`

**SELF（28）** — 同种相邻（完整）
`WALL×WALL, STONE×STONE, GLASS×GLASS, METAL×METAL, ICE×ICE, WOOD×WOOD, PLANT×PLANT, SAND×SAND, SOIL×SOIL, SALT×SALT, DUST×DUST, SNOW×SNOW, ASH×ASH, COAL×COAL, GUNPOWDER×GUNPOWDER, SEED×SEED, WATER×WATER, OIL×OIL, LAVA×LAVA, ACID×ACID, LN2×LN2, STEAM×STEAM, SMOKE×SMOKE, FIRE×FIRE, GAS×GAS, CLONE×CLONE, VIRUS×VIRUS, SPRING×SPRING`（`TNT×TNT` 归 REACTION）

**NONE（65）** — 静态固体互不作用（完整；`AIR×AIR` 即 `EMPTY×EMPTY`）
`AIR×AIR, WALL×STONE, WALL×GLASS, WALL×METAL, WALL×ICE, WALL×WOOD, WALL×PLANT, WALL×COAL, WALL×CLONE, WALL×VIRUS, WALL×SPRING, WALL×TNT, STONE×GLASS, STONE×METAL, STONE×ICE, STONE×WOOD, STONE×PLANT, STONE×COAL, STONE×CLONE, STONE×VIRUS, STONE×SPRING, STONE×TNT, GLASS×METAL, GLASS×ICE, GLASS×WOOD, GLASS×PLANT, GLASS×COAL, GLASS×CLONE, GLASS×VIRUS, GLASS×SPRING, GLASS×TNT, METAL×ICE, METAL×WOOD, METAL×PLANT, METAL×COAL, METAL×CLONE, METAL×VIRUS, METAL×SPRING, METAL×TNT, ICE×WOOD, ICE×PLANT, ICE×COAL, ICE×CLONE, ICE×VIRUS, ICE×SPRING, ICE×TNT, WOOD×PLANT, WOOD×COAL, WOOD×CLONE, WOOD×SPRING, WOOD×TNT, PLANT×COAL, PLANT×CLONE, PLANT×SPRING, PLANT×TNT, COAL×CLONE, COAL×VIRUS, COAL×SPRING, COAL×TNT, CLONE×VIRUS, CLONE×SPRING, CLONE×TNT, VIRUS×SPRING, VIRUS×TNT, SPRING×TNT`

**合计**：38+21+43+29+4+52+36+149+28+65 = **465** ✓

---

## 附录 B · 运行方式（复现本文所有结论）

```bash
# 全量矩阵（900 有序对；AIR 实装后再跑，预计较慢）
node tests/pairwise.js

# 单组调试
node tests/pairwise.js --pair=FIRE:WATER --amount=mid --repeats=3 --ticks=1200
node tests/pairwise.js --pair=WATER:FIRE --sides=1:24 --ticks=1800   # 非对称用量
node tests/pairwise.js --pairs=SALT:WATER,LAVA:WATER --ticks=600

# 分类与清单
node tests/pairwise.js --list       # 有意义/N-A 计数
node tests/pairwise.js --dump       # 465 无序对分类清单（Markdown）

# 定向缺陷探针（用户点名三条 + 补充）
node tests/pairwise.js --probe=air-conduct    --ticks=600
node tests/pairwise.js --probe=hot-air-rises  --ticks=600
node tests/pairwise.js --probe=plant-root     --ticks=1200
node tests/pairwise.js --probe=plant-air      --ticks=1200

# 只跑某一类 + JSON
node tests/pairwise.js --only=REACTION --amount=small --ticks=600
node tests/pairwise.js --pair=SALT:WATER --json
```

退出码：`0` = 无 `FAIL`；`1` = 有 `FAIL`（可作 CI 门控）。质量门为**建议性**——判定由 QA 给出，最终放行由用户决定。

---

*本文档由 游戏质量保障与测试工程师 严守真（Yan Soujin）产出。现实物理/化学结论以常识为准，凡不确定处已标注 **[需核实]**；引擎行为以 `docs/PHYSICS.md` 与 `src/core/*` 现实现为准。*

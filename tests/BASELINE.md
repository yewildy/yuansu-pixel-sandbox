# 改造前基线（Pre-change Baseline）— 元素配对实验

> 项目：元素像素游戏 / Yuansu Pixel Sandbox
> 文档类型：QA 基线记录（改造前对照）
> 负责人：严守真（Yan Soujin，游戏质量保障与测试工程师）
> 关联：`docs/PAIRWISE-MATRIX.md`（设计与现实对照基准）、`tests/pairwise.js`（实验骨架）
> 目的：在 **AIR（元素 1）实装之前** 固定一份可复现的实测基线，既作为"改造后"的对照，也用于**直接暴露用户抱怨的空气/植物缺陷**。

---

## 0. 基线的代码快照

| 项 | 值 |
|---|---|
| 代码版本 | **commit `634f45d8`**（当前 main；由主理人游承峰提供） |
| 备注 | 本地工作副本**无 `.git` 目录**（`git rev-parse` 报 "not a git repository"），故无法用 `git rev-parse` 复核哈希；改以**源文件 sha256 指纹**固定快照（见下表），确保任何改动都能被检出。 |
| 运行环境 | Node **v22.22.2**（Windows / Git Bash） |
| 记录命令 | `node tests/pairwise.js …`（见 §4） |

**源文件指纹（sha256 前 12 位）**

| 文件 | sha256[:12] | 文件 | sha256[:12] |
|---|---|---|---|
| `src/core/balance.js` | `1c73ce7b4a44` | `src/core/reactions.js` | `6a45ad68ea53` |
| `src/core/biology.js` | `7240eb99bd7b` | `src/core/rng.js` | `b70a490ddd06` |
| `src/core/elements.js` | `114c10c3203c` | `src/core/thermal.js` | `88b61cb3de48` |
| `src/core/engine.js` | `62e68665ed7f` | `src/core/transitions.js` | `5a96b8f5f52e` |
| `src/core/grid.js` | `77f57222cd4d` | `src/core/wind.js` | `fbf4c2bf875e` |
| `src/core/movement.js` | `49df22f38ed9` | `tests/run.js` | `fc67f85262e1` |
| | | `docs/PHYSICS.md` | `1c8b0d804def` |

> 改造前单元测试现状：`node tests/run.js` → **19 通过 / 0 失败**（全部现有回归项通过）。因此本次基线暴露的问题**不是**现有单测能覆盖的——它们需要配对实验与定向探针才能发现。

---

## 1. 定向探针：直接量化用户点名的三个缺陷

> 探针命令：`node tests/pairwise.js --probe=<名> --ticks=1200`（种子 1337）。以下为**实测原始数值**。

### 探针 1 · `air-conduct`（空气不导热）

| 量 | 实测值 |
|---|---|
| 场景 | `LAVA(1200°C)` 与 `WATER(20°C)` 之间**只隔 1 格 AIR** |
| 水侧温度变化（600 / 1200 tick） | **+0.00 °C**（`20 → 20`） |
| 间隙空气温度（600 tick） | `21.89 °C` |
| 结论 | 隔着一格空气，热源几乎**完全无法**加热对侧 → **空气不导热**（用户抱怨复现） |

**根因（代码级）**：`thermal.js` 中 `if (!(ei===1 && ej===1))` 会**跳过 AIR–AIR 热交换**；且 `EMPTY/AIR` 的 `conductivity=0.002`（近乎绝热）。空气既不参与自身导热，也无法把热传递给隔着它的水。

### 探针 2 · `hot-air-rises`（热空气不上升）

| 量 | 实测值 |
|---|---|
| 场景 | WALL 盒内底部一坨 `AIR = 800°C`（8×8） |
| 热区重心（t=0） | 行 `32.50` |
| 热区重心（t=3，仍 >100°C） | 行 `32.50`（**ΔY = 0.00**） |
| 高温格数（t=3 / t=1200） | `64 / 0` |
| 结论 | 热空气**原地不动**、约 6 tick 内散热至 <100°C，最终全部冷却 → **热空气不上升、不产生对流**（用户抱怨复现） |

**根因（代码级）**：`elements.js` 中 `EMPTY/AIR` 的 `movable = 0` → `movement.js` 直接 `return`，空气永不移动；`§11.3` 的"热空气柱"只给**正上方的气体格**加上升推力，空气本身不流动，因此形不成烟囱效应。附带现象：全空气区域的弛豫率为 `0.10 × 暴露加成 2.0 = 0.20/tick`，热空气约 6 tick 即散尽。

### 探针 3 · `plant-root`（植物无根乱长 — 有土场景）

| 量 | 实测值 |
|---|---|
| 场景 | `SOIL` 土床 + 两侧 `WATER` + 顶上一格 `SEED` |
| `PLANT` 格数 | `18` |
| 生长高度 | 从行 `41` 长到行 `20` → **21 格高** |
| 是否向下长（根） | **否**（`grewDownward = false`，无任何低于种子行的植物格） |
| 横向跨度 | `1` 格（单列竖直向上，无分枝/无根） |
| 结论 | 植物只"向上抽条"、**无根系、无横向蔓延** → **植物无根乱长**（用户抱怨复现） |

### 探针 4 · `plant-air`（植物无根乱长 — 悬空场景，更能说明问题）

| 量 | 实测值 |
|---|---|
| 场景 | **半空中单株 `PLANT`**，仅 2 格外的水里放 1 格 `WATER`，**无土壤** |
| 向上生长 | **24 格**（行 `44 → 20`） |
| 结论 | 一株**悬空、无根、无土**的植物，仅凭 2 格外的水就能凭空向上长 24 格 → **无根乱长**（用户抱怨复现） |

**根因（代码级）**：`biology.js` 的生长只判断"正上方是否为 `EMPTY/WATER`"且柱高 <40，**不要求下方有土/根**；湿度判定用"半径 2 内存在 `WATER/SOIL`"，与"是否有根"无关。

> **三缺陷小结**：用户点名的 **空气不导热 / 热空气不上升 / 植物无根乱长** 三条，**全部在改造前复现**，并已定位到代码行。

---

## 2. 配对基线表（≥20 组）

> 命令：`node tests/pairwise.js --pairs=… --amount=mid --repeats=2 --ticks=1200`（下表取种子 1337；种子 2 见括号）。用量 `mid = 8×8 = 64 格`。
> 判定列说明：`PASS`=引擎按规格完成预期；`UNJUDGED`=尚无编码规则（`无变化` 多为"现实中即无显著交互"，符合预期）；备注列对应 `PAIRWISE-MATRIX.md §6` 不合理清单编号。

| # | 组合 | 现实预期（真实世界） | 实测结果（seed=1337） | 判定 | 备注 |
|---|---|---|---|---|---|
| 1 | FIRE × WATER | 水吸热汽化、火被浇灭、冒蒸汽 | FIRE 64→**0**；WATER 64→60；曾现 STEAM/SMOKE/FIRE | PASS | #8 判据局限：火会自灭 |
| 2 | LAVA × WATER | 岩浆凝石、水剧烈汽化 | LAVA 64→0；STONE 64；WATER 64→44 | PASS | |
| 3 | LAVA × ICE | 岩浆凝石、冰→水/汽 | LAVA、ICE→0；STONE 64；WATER 48 | PASS | |
| 4 | WATER × ICE | 冰吸热融成水 | ICE 64→0；WATER 64→**128** | PASS | |
| 5 | WATER × LN2 | 液氮汽化（氮气）、水结冰 | LN2 64→0；WATER 64→**87**（净 **+23 水**）；曾现 ICE/STEAM | PASS | **#3 凭空造水** |
| 6 | WATER × OIL | 油浮于水面、分层 | 无变化（各 64） | UNJUDGED | 无反应（符合"无显著交互"） |
| 7 | WATER × STONE | 水绕流石头 | 无变化 | UNJUDGED | 无反应（符合） |
| 8 | LAVA × SAND | 沙可被高温熔成玻璃 | SAND 64→**64 不变**；LAVA→STONE | PASS | **#12 玻璃链不可达** |
| 9 | LAVA × AIR | 岩浆在空气中缓慢凝固 | LAVA 64→0；STONE 64 | PASS | |
| 10 | FIRE × AIR | 无燃料的火熄灭、产生烟 | FIRE 64→0；曾现 SMOKE | PASS | |
| 11 | WATER × AIR | 室温水不蒸发 | WATER 64→64 | PASS | 回归 R-03 通过 |
| 12 | FIRE × WOOD | 木点燃、烧成灰 | WOOD 64→61（seed2 →63）；曾现 SMOKE/FIRE | PASS | 观察：仅约 3 格被烧，火先上浮离开 |
| 13 | FIRE × COAL | 煤耐烧、最终成灰 | COAL 64→**64 不变** | PASS（规则） | ⚠观察：煤未被点燃 |
| 14 | FIRE × OIL | 油猛烈燃烧 | OIL 64→64（seed2 →61） | PASS（规则） | ⚠观察：油几乎未被点燃 |
| 15 | FIRE × GUNPOWDER | 火药爆燃、极快蔓延 | GUNPOWDER 64→0；FIRE→0 | PASS | |
| 16 | FIRE × GAS | 瓦斯爆燃 | GAS、FIRE→0 | PASS | |
| 17 | FIRE × PLANT | 湿植物不易燃，干部分才着 | PLANT 64→34；出现 **DUST 97** | PASS | #18；实为"缺水枯萎成尘"多于燃烧 |
| 18 | FIRE × SNOW | 雪迅速融成水 | SNOW 64→0；WATER 64（新出现） | PASS | |
| 19 | ACID × METAL | 酸蚀金属、放氢、生成盐溶液 | METAL 64→36；ACID 64→53；GAS 1 | PASS | **#2 金属"消失"、不守恒** |
| 20 | ACID × STONE | 酸蚀岩石（起泡） | STONE 64→39；ACID 64→57 | PASS | 岩石"消失" |
| 21 | ACID × GLASS | 多数酸不蚀玻璃 | 无变化（各 64） | PASS | R10 明确不反应 |
| 22 | SALT × WATER | 盐溶为盐水（离子留存） | SALT 64→**0**；WATER 64→**64 不变** | PASS（规则） | **#1 盐凭空消失、水无变化** |
| 23 | VIRUS × PLANT | 病毒摧毁植物 | PLANT 64→0；VIRUS 64→140 | PASS | |
| 24 | VIRUS × WOOD | 现实中病毒**不**侵染木材 | WOOD 64→0；VIRUS →128 | PASS | 演绎化设定（非写实） |
| 25 | TNT × FIRE | 火焰引爆炸药 | FIRE、TNT→**0**（半径 6 全毁） | PASS | |
| 26 | TNT × TNT | 需引信，否则不爆 | TNT 64→64 不变 | PASS | 无火源不自爆（正确） |
| 27 | SEED × WATER | 种子发芽长成植物 | SEED 64→56；**PLANT 107**；DUST 58 | PASS | #7：长高后缺水枯萎成尘 |
| 28 | CLONE × WATER | （科幻）克隆体复制水 | WATER 64→**368** | PASS | 有意的质量创生（配额 2000） |
| 29 | SPRING × WATER | 水源泉持续出水 | 无变化（SPRING 64→64，无水产生） | PASS（规则） | **#16 SPRING 无实现（死元素）** |
| 30 | FIRE × FIRE | 两团火合并后继续烧 | FIRE 64→0；曾现 SMOKE | N/A（SELF） | 无直接反应（符合） |

**符合/偏离统计（本批 30 组 × 2 种子）**：`PASS 48 / UNJUDGED 12`（无 `FAIL`/`UNEXPECTED`）。但注意——**"判定 PASS"并不等于"与现实一致"**：第 5、8、19、22、29 行虽 `PASS`（引擎按规格实现），却因规格本身与现实不符而应记入不合理清单。

### 2.1 用量分档实测（回答"量变是否引起质变"）

| 组合 | 用量 | 实测结果 | 解读 |
|---|---|---|---|
| FIRE × WATER | `small` 1×1 | WATER 1→1；FIRE 1→0 | 1 格水灭 1 格火 |
| FIRE × WATER | `mid` 8×8 | WATER 64→60；FIRE 64→0 | 水基本留存、火灭 |
| FIRE × WATER | `large` 24×24 | WATER 576→551；FIRE 576→0 | 大片水几乎全存 |
| **WATER × FIRE** | **`--sides=1:24`**（1 格水 vs 24×24 火） | WATER 1→**0**；FIRE 576→0 | **1 格水被大火烤干汽化、自身不保** → 与 `mid` 结论相反，**"量"确实改变结果** |
| LAVA × WATER | `small` 1×1 | WATER 1→0；LAVA 1→0；STONE 1 | 单格剧烈反应 |
| LAVA × WATER | `large` 24×24 | WATER 576→449；LAVA 576→0 | 大片水汽化 127 格 |

> **重要观察**：无论有无水，`FIRE` 最终都会变 0（火焰固有寿命）。故 **`FIRE==0` 不能作为"被水浇灭"的证据**——必须结合"与水接触的火格是否在 1 tick 内消失"与"水是否升温"。该局限已记入 `PAIRWISE-MATRIX.md §4.3` 与不合理清单 #8。

---

## 3. 本基线暴露 / 确认的关键问题清单

| 编号 | 问题 | 证据 | 来源 |
|---|---|---|---|
| B1 | **空气不导热** | 探针 `air-conduct`：水隔着 1 格空气升温 **+0.00°C** | 用户点名 · 实测 |
| B2 | **热空气不上升** | 探针 `hot-air-rises`：热区 ΔY=0，6 tick 内冷却消失 | 用户点名 · 实测 |
| B3 | **植物无根乱长** | 探针 `plant-root`/`plant-air`：无根向上长 21 / 24 格 | 用户点名 · 实测 |
| B4 | **倒液氮凭空造水** | `WATER×LN2`：WATER 64→87（净 +23），LN2 全消失 | 实测 |
| B5 | **盐溶后盐凭空消失、水无变化** | `SALT×WATER`：SALT 64→0，WATER 64→64 | 实测 |
| B6 | **酸蚀不守恒** | `ACID×METAL`：METAL 64→36（质量蒸发） | 实测 |
| B7 | **沙→玻璃链不可达** | `LAVA×SAND`：SAND 64→64 不变（需 1700°C，岩浆仅 1200°C） | 实测 |
| B8 | **水源泉 SPRING 为死元素** | `SPRING×WATER`：SPRING 64→64，无水产生；全仓无 SPRING 逻辑 | 实测 |
| B9 | **"灭火"判据失效** | `FIRE` 无论有水都会自灭；`FIRE==0` 无区分度 | 实测 + 代码 |
| B10 | ⚠ **火对固体/液体燃料的点燃极弱** | `FIRE×COAL`：COAL 全不燃；`FIRE×OIL`：仅少数被点燃 | 实测（待确认是否场景/机制问题） |

> B1–B9 与 `PAIRWISE-MATRIX.md §6` 的 #5/#6/#7/#3/#1/#2/#12/#16/#8 一一对应。B10 为本次新增观察项，建议在 AIR 实装后以"火贴在燃料上"的贴近场景复测。

---

## 4. 复现命令（逐条可跑）

```bash
# 探针（用户点名三缺陷 + 补充）
node tests/pairwise.js --probe=air-conduct   --ticks=1200
node tests/pairwise.js --probe=hot-air-rises --ticks=1200
node tests/pairwise.js --probe=plant-root    --ticks=1200
node tests/pairwise.js --probe=plant-air     --ticks=1200

# 30 组配对基线
node tests/pairwise.js --pairs=FIRE:WATER,LAVA:WATER,LAVA:ICE,WATER:ICE,WATER:LN2,WATER:OIL,WATER:STONE,LAVA:SAND,LAVA:AIR,FIRE:AIR,WATER:AIR,FIRE:WOOD,FIRE:COAL,FIRE:OIL,FIRE:GUNPOWDER,FIRE:GAS,FIRE:PLANT,FIRE:SNOW,ACID:METAL,ACID:STONE,ACID:GLASS,SALT:WATER,VIRUS:PLANT,VIRUS:WOOD,TNT:FIRE,TNT:TNT,SEED:WATER,CLONE:WATER,SPRING:WATER,FIRE:FIRE --amount=mid --repeats=2 --ticks=1200

# 用量分档 / 非对称
node tests/pairwise.js --pair=FIRE:WATER --amount=small --ticks=1800
node tests/pairwise.js --pair=FIRE:WATER --amount=large --ticks=1800
node tests/pairwise.js --pair=WATER:FIRE --sides=1:24 --ticks=1800
```

> 复现时若 `src/core/*` 任一文件的 sha256 与 §0 不符，则本基线**不适用**，需重新采样。

---

## 5. 基线的用途与局限

- **用途**：AIR（元素 1）实装、规格修订（空气/植物条款）之后，逐条比对本文 §1/§2，判定缺陷是否真正修复、是否引入回归。
- **局限**：
  1. 基线在**当前引擎**（`EMPTY` 不可移动、空气近乎绝热）上采集；AIR 实装后**同场景数值预期会变化**，比对时应关注"缺陷是否消失"，而非数值是否相同。
  2. 场景为"两块相邻"的受控布局（含一排 `WALL` 托盘），与玩家自由绘制场景存在差异。
  3. 全量 900 组矩阵**未在本次执行**（按主理人要求，等 AIR 实装后再跑）；本基线为 **30 组代表组合 + 4 项定向探针**。

---

*本文档由 游戏质量保障与测试工程师 严守真（Yan Soujin）产出。所有数值来自 `tests/pairwise.js` 真实运行，可逐条复现。质量门为**建议性**，最终放行由用户决定。*

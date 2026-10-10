# 元素两两配对实验·全量报告（Pairwise Report）

> 项目：元素像素游戏 / Yuansu Pixel Sandbox
> 文档类型：QA 全量配对实验报告 + 不合理清单
> 负责人：严守真（Yan Soujin，游戏质量保障与测试工程师）
> 生成工具：`tests/pairwise-run.js`（可复现）；判定基准：`docs/PAIRWISE-MATRIX.md`；改造前对照：`tests/BASELINE.md`
> 代码状态：**改造后**（AIR 实装 + 空气对流/导热 + 严格生态植物 + 液氮产物改 AIR + 水源泉出水 + **燃料驱动燃烧 N1** + **沙→玻璃接触反应 R20**）。
> 修订：**2026-10-12（T6.3 收口）**——① 合并批次 B（`tests/PAIRWISE-REPORT.md`）独有内容，该文件已改为指针页；② §4.3（火离开燃料）、§4.8（沙→玻璃）改为 **已修复**；③ 新增 §4.16（点燃种子/位置脆弱性，Major）；④ 新增 §6（跨批次补充与编号索引）。**本文件为唯一真源。**

---

## 0. 运行信息（可复现）

| 项 | 值 |
|---|---|
| 有序元素对 | **900**（30×30） |
| 用量档 | small / mid / large |
| 每组重复（种子） | 2 个：1337, 2 |
| 每组 tick 数 | 1200（= 20.0 游戏秒） |
| 仿真总次数 | **5400** |
| 仿真总 tick 数 | **6,480,000** |
| 实际耗时 | **841.7 s**（≈ 6 次仿真/秒） |
| 采样密度 | full（早期 60 tick + 每 30 tick） |
| 随机种子 | 1337 / 2（引擎全程确定性，换种子 = 换逐格随机采样） |
| 运行环境 | Node v22.22.2 / win32 |
| 生成时间 | 2026-10-11T12:52:30.241Z |

**网格尺寸（每档）**：

| 用量 | 方块 | 面积 | 网格 | 说明 |
|---|---|---|---|---|
| small | 1x1 | 1 格 | **48x32** | 单格点接触 |
| mid | 8x8 | 64 格 | **48x32** | 一"笔刷"量 |
| large | 24x24 | 576 格 | **72x40** | 一大片（量变引起质变） |

> 说明：为在合理时间内跑完全量（5400 次仿真），采用**缩小网格**（48×32 / 72×40，而非生产 320×180）。网格越小，空气热库越小、温度变化越"剧烈"，因此**绝对温度数值不代表生产环境**；本报告关注的是**趋势与产物是否与现实一致**。

复现命令：

```bash
node tests/pairwise-run.js --run      # 跑全量，落盘 tests/_out/pairwise-full.json
node tests/pairwise-run.js --report   # 读 raw JSON，生成本报告
```

---

## 0.5 结论速览（TL;DR）

> **2026-10-12 修订（T6.3 收口）**：把 `tests/PAIRWISE-REPORT.md`（批次 B，8100 次仿真）的**独有结论**并入本报告作为唯一真源，并纳入引擎后续改动后的**独立复测**。原文 §4.3（火离开燃料）与 §4.8（沙→玻璃不可达）**已由后续实现修复**，状态改为"已修复"；另**新增一条未修项 §4.16**（点燃的种子/位置脆弱性，Major）。详见 §4 与新增 §6。

- **判定批次 A（本报告主体）**：900 有序对 × 3 用量 × 2 种子 = **5400 次**；判定分布（2700 判定组）：**PASS 2190 / FAIL 39 / UNEXPECTED 0 / N/A 471**。
- **判定批次 B（`tests/` 摘要批）**：900 有序对 × 3 用量 × 3 种子 = **8100 次**；判定分布：**PASS 76.2%～76.4% / FAIL 6（仅在 small，同一根因）/ UNEXPECTED 0 / UNJUDGED 636**；**0 个组合跨种子判定不一致（判定层无 flaky）**。
- 绝大多数组合（含全部"无显著交互"的固体/流体对）**行为与现实相符**。
- **用户点名的问题**：空气不导热 ✓已修、热空气不上升 ✓已修、植物无根乱长 ✓已修、"倒液氮凭空造水" ✓已修、水源泉死元素 ✓已修。
- **本轮新修复**：火沿燃料蔓延（原 §4.3）✓、沙→玻璃链（原 §4.8）✓。
- **仍存在的问题**：共 **14 条**登记于 §4（另 2 条已修复归档：§4.3、§4.8）；按严重度 **Critical 1 / Major 6 / Minor 7**。最值得优先修的 5 条如下（完整优先级表见 §4.0）。

| 优先 | 条目 | 严重度 | 一句话 |
|---|---|---|---|
| P0 | **§4.16 点燃的种子/位置脆弱性** | Major | 同样"木块旁点火"，换种子/换位置时**有时烧成灰、有时纹丝不动**（默认种子 1337 即 0%）——不是"不合理"，而是"不可预期" |
| P1 | **§4.2 植物整株连坐枯死** | Critical | 大片植物仅一侧临水时，远离水的一侧拖垮整株 |
| P1 | **§4.5 灭火与用量无关** | Major | 灭不了大火；缺"水量对抗火力"的量效应 |
| P2 | **§4.9 湿植物极易燃** | Major | 与"含水活体"设定矛盾 |
| P2 | **§4.4 溶解/酸蚀不守恒** | Major | 金属凭空消失、盐溶于水无痕迹，破坏守恒世界观 |

> **质量门判定（建议性）**：**CONCERNS** —— 仍有未达现实预期的判定组，且遗留 1 条 **Major 玩法稳定性**缺陷（§4.16）。最终放行由用户决定。

---

## 1. 总览统计

### 1.1 判定分布（单元 = 有序对 × 用量 × 种子，5400 个）

| 判定 | 数量 | 占比 | 含义 |
|---|---|---|---|
| **PASS** | 4381 | 81.1% | 与现实预期一致（含"无显著交互"） |
| **FAIL** | 77 | 1.4% | 显式预期未满足 |
| **N/A** | 942 | 17.4% | 同种自配 / 静态固体互配（定义上无化学交互） |
| 合计 | 5400 | 100% | |

### 1.2 判定分布（判定组 = 有序对 × 用量，各种子合并，2700 组）

| 判定 | 数量 | 占比 |
|---|---|---|
| **PASS** | 2190 | 81.1% |
| **FAIL** | 39 | 1.4% |
| **N/A** | 471 | 17.4% |
| 合计 | 2700 | 100% |

**不稳定（跨种子判定不一致，flaky）**：1 组（TNT×FIRE/small）。

> 判定组中 **FAIL+39** 与 **UNEXPECTED+0** 是本报告重点；`N/A` 与 `PASS` 中的"无显著交互"属预期。**但注意：`PASS` 只代表"引擎按规格实现"，规格本身与现实不符的点单列于 §4 不合理清单。**

### 1.3 判定组 × 类别 交叉表（2700 组）

| 类别 | 组数 | PASS | FAIL | UNEXPECTED | N/A | 说明 |
|---|---|---|---|---|---|---|
| REACTION | 237 | 200 | 37 | 0 | 0 | 反应表命中 |
| PHASE | 102 | 102 | 0 | 0 | 0 | 热/冷源→相变 |
| THERMAL | 276 | 276 | 0 | 0 | 0 | 仅导热 |
| AIR | 174 | 174 | 0 | 0 | 0 | X 在空气中 |
| LIFE | 24 | 22 | 2 | 0 | 0 | 生命/湿度 |
| MIX | 312 | 312 | 0 | 0 | 0 | 流体分层 |
| FLOW | 216 | 216 | 0 | 0 | 0 | 气体流动 |
| STRUCT | 888 | 888 | 0 | 0 | 0 | 流体绕静态固体 |
| SELF | 84 | 0 | 0 | 0 | 84 | 同种自配 |
| NONE | 387 | 0 | 0 | 0 | 387 | 静态固体互配 |

> 判读：`REACTION` / `PHASE` 类是"应当发生明确反应"的组合，其 FAIL/UNEXPECTED 即为**缺陷**；`STRUCT`/`NONE`/`SELF` 类"无显著交互"占绝大多数，PASS/N/A 属预期。

---

## 2. ★完全对照表（465 无序对 × 3 用量 = 1395 行）

> 矩阵为 900 有序对，但邻接交互近似对称，故下表按 **465 个无序对（A ≤ B）** 列出；有序对 `B×A` 复用同结论（**引擎存在方向性偏差**：如火焰向上蔓延概率更大，个别对 A×B 与 B×A 的数值略有差异，见 §5）。
> 读法：`A × B`＝组合；`用量`；`现实世界预期`＝真实物理/化学结论（非技术读者可直接读懂）；`本引擎实测`＝改造后引擎跑出的前后计数与中途产物；`判定`；`备注`。

| 组合 | 用量 | 现实世界预期 | 本引擎实测 | 判定 | 备注 |
|---|---|---|---|---|---|
| AIR × AIR | small | 空气 × 空气：同一种介质，无离散交互 | 起始 AIR=1488 WALL=48 → 结束 AIR=1488 WALL=48；中途曾现: 无；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| AIR × AIR | mid | 空气 × 空气：同一种介质，无离散交互 | 起始 AIR=1488 WALL=48 → 结束 AIR=1488 WALL=48；中途曾现: 无；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| AIR × AIR | large | 空气 × 空气：同一种介质，无离散交互 | 起始 AIR=2808 WALL=72 → 结束 AIR=2808 WALL=72；中途曾现: 无；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| AIR × WALL | small | 该元素置于空气中：空气作为环境热库/浮力介质/供氧背景 | 起始 AIR=1487 WALL=49 → 结束 AIR=1487 WALL=49；中途曾现: 无；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| AIR × WALL | mid | 该元素置于空气中：空气作为环境热库/浮力介质/供氧背景 | 起始 AIR=1424 WALL=112 → 结束 AIR=1424 WALL=112；中途曾现: 无；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| AIR × WALL | large | 该元素置于空气中：空气作为环境热库/浮力介质/供氧背景 | 起始 AIR=2232 WALL=648 → 结束 AIR=2232 WALL=648；中途曾现: 无；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| AIR × STONE | small | 该元素置于空气中：空气作为环境热库/浮力介质/供氧背景 | 起始 AIR=1487 WALL=48 STONE=1 → 结束 AIR=1487 WALL=48 STONE=1；中途曾现: STONE；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| AIR × STONE | mid | 该元素置于空气中：空气作为环境热库/浮力介质/供氧背景 | 起始 AIR=1424 WALL=48 STONE=64 → 结束 AIR=1424 WALL=48 STONE=64；中途曾现: STONE；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| AIR × STONE | large | 该元素置于空气中：空气作为环境热库/浮力介质/供氧背景 | 起始 AIR=2232 WALL=72 STONE=576 → 结束 AIR=2232 WALL=72 STONE=576；中途曾现: STONE；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| AIR × GLASS | small | 该元素置于空气中：空气作为环境热库/浮力介质/供氧背景 | 起始 AIR=1487 WALL=48 GLASS=1 → 结束 AIR=1487 WALL=48 GLASS=1；中途曾现: GLASS；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| AIR × GLASS | mid | 该元素置于空气中：空气作为环境热库/浮力介质/供氧背景 | 起始 AIR=1424 WALL=48 GLASS=64 → 结束 AIR=1424 WALL=48 GLASS=64；中途曾现: GLASS；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| AIR × GLASS | large | 该元素置于空气中：空气作为环境热库/浮力介质/供氧背景 | 起始 AIR=2232 WALL=72 GLASS=576 → 结束 AIR=2232 WALL=72 GLASS=576；中途曾现: GLASS；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| AIR × METAL | small | 金属导热快，但仅靠空气散热很慢（几乎不变） | 起始 AIR=1487 WALL=48 METAL=1 → 结束 AIR=1487 WALL=48 METAL=1；中途曾现: METAL；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| AIR × METAL | mid | 金属导热快，但仅靠空气散热很慢（几乎不变） | 起始 AIR=1424 WALL=48 METAL=64 → 结束 AIR=1424 WALL=48 METAL=64；中途曾现: METAL；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| AIR × METAL | large | 金属导热快，但仅靠空气散热很慢（几乎不变） | 起始 AIR=2232 WALL=72 METAL=576 → 结束 AIR=2232 WALL=72 METAL=576；中途曾现: METAL；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| AIR × ICE | small | 冰在室温空气中升温并融化 | 起始 AIR=1487 WALL=48 ICE=1 → 结束 AIR=1487 WALL=48 WATER=1；中途曾现: ICE,WATER；新: WATER；消失: ICE；Tmax 20.0°C | **PASS** |  |
| AIR × ICE | mid | 冰在室温空气中升温并融化 | 起始 AIR=1424 WALL=48 ICE=64 → 结束 AIR=1424 WALL=48 WATER=64；中途曾现: ICE,WATER；新: WATER；消失: ICE；Tmax 20.0°C | **PASS** |  |
| AIR × ICE | large | 冰在室温空气中升温并融化 | 起始 AIR=2232 WALL=72 ICE=576 → 结束 AIR=2232 WALL=72 WATER=576；中途曾现: ICE,WATER；新: WATER；消失: ICE；Tmax 20.0°C | **PASS** |  |
| AIR × WOOD | small | 该元素置于空气中：空气作为环境热库/浮力介质/供氧背景 | 起始 AIR=1487 WALL=48 WOOD=1 → 结束 AIR=1487 WALL=48 WOOD=1；中途曾现: WOOD；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| AIR × WOOD | mid | 该元素置于空气中：空气作为环境热库/浮力介质/供氧背景 | 起始 AIR=1424 WALL=48 WOOD=64 → 结束 AIR=1424 WALL=48 WOOD=64；中途曾现: WOOD；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| AIR × WOOD | large | 该元素置于空气中：空气作为环境热库/浮力介质/供氧背景 | 起始 AIR=2232 WALL=72 WOOD=576 → 结束 AIR=2232 WALL=72 WOOD=576；中途曾现: WOOD；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| AIR × PLANT | small | 该元素置于空气中：空气作为环境热库/浮力介质/供氧背景 | 起始 AIR=1487 WALL=48 PLANT=1 → 结束 AIR=1487 WALL=48 DUST=1；中途曾现: PLANT,DUST；新: DUST；消失: PLANT；Tmax 20.0°C | **PASS** |  |
| AIR × PLANT | mid | 该元素置于空气中：空气作为环境热库/浮力介质/供氧背景 | 起始 AIR=1424 WALL=48 PLANT=64 → 结束 AIR=1424 WALL=48 DUST=64；中途曾现: PLANT,DUST；新: DUST；消失: PLANT；Tmax 20.0°C | **PASS** |  |
| AIR × PLANT | large | 该元素置于空气中：空气作为环境热库/浮力介质/供氧背景 | 起始 AIR=2232 WALL=72 PLANT=576 → 结束 AIR=2232 WALL=72 DUST=576；中途曾现: PLANT,DUST；新: DUST；消失: PLANT；Tmax 20.0°C | **PASS** |  |
| AIR × SAND | small | 该元素置于空气中：空气作为环境热库/浮力介质/供氧背景 | 起始 AIR=1487 WALL=48 SAND=1 → 结束 AIR=1487 WALL=48 SAND=1；中途曾现: SAND；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| AIR × SAND | mid | 该元素置于空气中：空气作为环境热库/浮力介质/供氧背景 | 起始 AIR=1424 WALL=48 SAND=64 → 结束 AIR=1424 WALL=48 SAND=64；中途曾现: SAND；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| AIR × SAND | large | 该元素置于空气中：空气作为环境热库/浮力介质/供氧背景 | 起始 AIR=2232 WALL=72 SAND=576 → 结束 AIR=2232 WALL=72 SAND=576；中途曾现: SAND；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| AIR × SOIL | small | 该元素置于空气中：空气作为环境热库/浮力介质/供氧背景 | 起始 AIR=1487 WALL=48 SOIL=1 → 结束 AIR=1487 WALL=48 SOIL=1；中途曾现: SOIL；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| AIR × SOIL | mid | 该元素置于空气中：空气作为环境热库/浮力介质/供氧背景 | 起始 AIR=1424 WALL=48 SOIL=64 → 结束 AIR=1424 WALL=48 SOIL=64；中途曾现: SOIL；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| AIR × SOIL | large | 该元素置于空气中：空气作为环境热库/浮力介质/供氧背景 | 起始 AIR=2232 WALL=72 SOIL=576 → 结束 AIR=2232 WALL=72 SOIL=576；中途曾现: SOIL；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| AIR × SALT | small | 该元素置于空气中：空气作为环境热库/浮力介质/供氧背景 | 起始 AIR=1487 WALL=48 SALT=1 → 结束 AIR=1487 WALL=48 SALT=1；中途曾现: SALT；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| AIR × SALT | mid | 该元素置于空气中：空气作为环境热库/浮力介质/供氧背景 | 起始 AIR=1424 WALL=48 SALT=64 → 结束 AIR=1424 WALL=48 SALT=64；中途曾现: SALT；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| AIR × SALT | large | 该元素置于空气中：空气作为环境热库/浮力介质/供氧背景 | 起始 AIR=2232 WALL=72 SALT=576 → 结束 AIR=2232 WALL=72 SALT=576；中途曾现: SALT；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| AIR × DUST | small | 该元素置于空气中：空气作为环境热库/浮力介质/供氧背景 | 起始 AIR=1487 WALL=48 DUST=1 → 结束 AIR=1487 WALL=48 DUST=1；中途曾现: DUST；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| AIR × DUST | mid | 该元素置于空气中：空气作为环境热库/浮力介质/供氧背景 | 起始 AIR=1424 WALL=48 DUST=64 → 结束 AIR=1424 WALL=48 DUST=64；中途曾现: DUST；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| AIR × DUST | large | 该元素置于空气中：空气作为环境热库/浮力介质/供氧背景 | 起始 AIR=2232 WALL=72 DUST=576 → 结束 AIR=2232 WALL=72 DUST=576；中途曾现: DUST；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| AIR × SNOW | small | 该元素置于空气中：空气作为环境热库/浮力介质/供氧背景 | 起始 AIR=1487 WALL=48 SNOW=1 → 结束 AIR=1487 WALL=48 WATER=1；中途曾现: SNOW,WATER；新: WATER；消失: SNOW；Tmax 20.0°C | **PASS** |  |
| AIR × SNOW | mid | 该元素置于空气中：空气作为环境热库/浮力介质/供氧背景 | 起始 AIR=1424 WALL=48 SNOW=64 → 结束 AIR=1424 WALL=48 WATER=64；中途曾现: SNOW,WATER；新: WATER；消失: SNOW；Tmax 20.0°C | **PASS** |  |
| AIR × SNOW | large | 该元素置于空气中：空气作为环境热库/浮力介质/供氧背景 | 起始 AIR=2232 WALL=72 SNOW=576 → 结束 AIR=2232 WALL=72 WATER=576；中途曾现: SNOW,WATER；新: WATER；消失: SNOW；Tmax 20.0°C | **PASS** |  |
| AIR × ASH | small | 该元素置于空气中：空气作为环境热库/浮力介质/供氧背景 | 起始 AIR=1487 WALL=48 ASH=1 → 结束 AIR=1487 WALL=48 ASH=1；中途曾现: ASH；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| AIR × ASH | mid | 该元素置于空气中：空气作为环境热库/浮力介质/供氧背景 | 起始 AIR=1424 WALL=48 ASH=64 → 结束 AIR=1424 WALL=48 ASH=64；中途曾现: ASH；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| AIR × ASH | large | 该元素置于空气中：空气作为环境热库/浮力介质/供氧背景 | 起始 AIR=2232 WALL=72 ASH=576 → 结束 AIR=2232 WALL=72 ASH=576；中途曾现: ASH；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| AIR × COAL | small | 该元素置于空气中：空气作为环境热库/浮力介质/供氧背景 | 起始 AIR=1487 WALL=48 COAL=1 → 结束 AIR=1487 WALL=48 COAL=1；中途曾现: COAL；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| AIR × COAL | mid | 该元素置于空气中：空气作为环境热库/浮力介质/供氧背景 | 起始 AIR=1424 WALL=48 COAL=64 → 结束 AIR=1424 WALL=48 COAL=64；中途曾现: COAL；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| AIR × COAL | large | 该元素置于空气中：空气作为环境热库/浮力介质/供氧背景 | 起始 AIR=2232 WALL=72 COAL=576 → 结束 AIR=2232 WALL=72 COAL=576；中途曾现: COAL；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| AIR × GUNPOWDER | small | 该元素置于空气中：空气作为环境热库/浮力介质/供氧背景 | 起始 AIR=1487 WALL=48 GUNPOWDER=1 → 结束 AIR=1487 WALL=48 GUNPOWDER=1；中途曾现: GUNPOWDER；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| AIR × GUNPOWDER | mid | 该元素置于空气中：空气作为环境热库/浮力介质/供氧背景 | 起始 AIR=1424 WALL=48 GUNPOWDER=64 → 结束 AIR=1424 WALL=48 GUNPOWDER=64；中途曾现: GUNPOWDER；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| AIR × GUNPOWDER | large | 该元素置于空气中：空气作为环境热库/浮力介质/供氧背景 | 起始 AIR=2232 WALL=72 GUNPOWDER=576 → 结束 AIR=2232 WALL=72 GUNPOWDER=576；中途曾现: GUNPOWDER；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| AIR × SEED | small | 该元素置于空气中：空气作为环境热库/浮力介质/供氧背景 | 起始 AIR=1487 WALL=48 SEED=1 → 结束 AIR=1487 WALL=48 SEED=1；中途曾现: SEED；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| AIR × SEED | mid | 该元素置于空气中：空气作为环境热库/浮力介质/供氧背景 | 起始 AIR=1424 WALL=48 SEED=64 → 结束 AIR=1424 WALL=48 SEED=64；中途曾现: SEED；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| AIR × SEED | large | 该元素置于空气中：空气作为环境热库/浮力介质/供氧背景 | 起始 AIR=2232 WALL=72 SEED=576 → 结束 AIR=2232 WALL=72 SEED=576；中途曾现: SEED；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| AIR × WATER | small | 室温水不会自发蒸发（沸点 100°C；本作以 60°C 为表面蒸发门槛） | 起始 AIR=1487 WALL=48 WATER=1 → 结束 AIR=1487 WALL=48 WATER=1；中途曾现: WATER；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| AIR × WATER | mid | 室温水不会自发蒸发（沸点 100°C；本作以 60°C 为表面蒸发门槛） | 起始 AIR=1424 WALL=48 WATER=64 → 结束 AIR=1424 WALL=48 WATER=64；中途曾现: WATER；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| AIR × WATER | large | 室温水不会自发蒸发（沸点 100°C；本作以 60°C 为表面蒸发门槛） | 起始 AIR=2232 WALL=72 WATER=576 → 结束 AIR=2232 WALL=72 WATER=576；中途曾现: WATER；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| AIR × OIL | small | 该元素置于空气中：空气作为环境热库/浮力介质/供氧背景 | 起始 AIR=1487 WALL=48 OIL=1 → 结束 AIR=1487 WALL=48 OIL=1；中途曾现: OIL；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| AIR × OIL | mid | 该元素置于空气中：空气作为环境热库/浮力介质/供氧背景 | 起始 AIR=1424 WALL=48 OIL=64 → 结束 AIR=1424 WALL=48 OIL=64；中途曾现: OIL；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| AIR × OIL | large | 该元素置于空气中：空气作为环境热库/浮力介质/供氧背景 | 起始 AIR=2232 WALL=72 OIL=576 → 结束 AIR=2232 WALL=72 OIL=576；中途曾现: OIL；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| AIR × LAVA | small | 岩浆在空气中缓慢降温，最终凝固成岩石 | 起始 AIR=1487 WALL=48 LAVA=1 → 结束 AIR=1487 WALL=48 STONE=1；中途曾现: STONE,LAVA；新: STONE；消失: LAVA；Tmax 40.7°C | **PASS** |  |
| AIR × LAVA | mid | 岩浆在空气中缓慢降温，最终凝固成岩石 | 起始 AIR=1424 WALL=48 LAVA=64 → 结束 AIR=1424 WALL=48 STONE=64；中途曾现: STONE,LAVA；新: STONE；消失: LAVA；Tmax 240.9°C | **PASS** |  |
| AIR × LAVA | large | 岩浆在空气中缓慢降温，最终凝固成岩石 | 起始 AIR=2232 WALL=72 LAVA=576 → 结束 AIR=2232 WALL=72 STONE=554 LAVA=22；中途曾现: STONE,LAVA；新: STONE；消失: 无；Tmax 699.7°C | **PASS** |  |
| AIR × ACID | small | 该元素置于空气中：空气作为环境热库/浮力介质/供氧背景 | 起始 AIR=1487 WALL=48 ACID=1 → 结束 AIR=1487 WALL=48 ACID=1；中途曾现: ACID；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| AIR × ACID | mid | 该元素置于空气中：空气作为环境热库/浮力介质/供氧背景 | 起始 AIR=1424 WALL=48 ACID=64 → 结束 AIR=1424 WALL=48 ACID=64；中途曾现: ACID；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| AIR × ACID | large | 该元素置于空气中：空气作为环境热库/浮力介质/供氧背景 | 起始 AIR=2232 WALL=72 ACID=576 → 结束 AIR=2232 WALL=72 ACID=576；中途曾现: ACID；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| AIR × LN2 | small | 液氮在空气中剧烈沸腾汽化（氮气返回大气） | 起始 AIR=1487 WALL=48 LN2=1 → 结束 AIR=1488 WALL=48；中途曾现: LN2；新: 无；消失: LN2；Tmax 20.0°C | **PASS** | 改造后 LN2→AIR（#3 已修复） |
| AIR × LN2 | mid | 液氮在空气中剧烈沸腾汽化（氮气返回大气） | 起始 AIR=1424 WALL=48 LN2=64 → 结束 AIR=1488 WALL=48；中途曾现: LN2；新: 无；消失: LN2；Tmax 20.0°C | **PASS** | 改造后 LN2→AIR（#3 已修复） |
| AIR × LN2 | large | 液氮在空气中剧烈沸腾汽化（氮气返回大气） | 起始 AIR=2232 WALL=72 LN2=576 → 结束 AIR=2808 WALL=72；中途曾现: LN2；新: 无；消失: LN2；Tmax 20.0°C | **PASS** | 改造后 LN2→AIR（#3 已修复） |
| AIR × STEAM | small | 蒸汽上升并降温冷凝成水（降雨） | 起始 AIR=1487 WALL=48 STEAM=1 → 结束 AIR=1488 WALL=48；中途曾现: STEAM；新: 无；消失: STEAM；Tmax 20.0°C | **PASS** |  |
| AIR × STEAM | mid | 蒸汽上升并降温冷凝成水（降雨） | 起始 AIR=1424 WALL=48 STEAM=64 → 结束 AIR=1476 WALL=48 WATER=12；中途曾现: WATER,STEAM；新: WATER；消失: STEAM；Tmax 20.0°C | **PASS** |  |
| AIR × STEAM | large | 蒸汽上升并降温冷凝成水（降雨） | 起始 AIR=2232 WALL=72 STEAM=576 → 结束 AIR=2638 WALL=72 WATER=170；中途曾现: WATER,STEAM；新: WATER；消失: STEAM；Tmax 20.0°C | **PASS** |  |
| AIR × SMOKE | small | 烟逐渐扩散稀释、最终消散 | 起始 AIR=1487 WALL=48 SMOKE=1 → 结束 AIR=1488 WALL=48；中途曾现: SMOKE；新: 无；消失: SMOKE；Tmax 20.0°C | **PASS** |  |
| AIR × SMOKE | mid | 烟逐渐扩散稀释、最终消散 | 起始 AIR=1424 WALL=48 SMOKE=64 → 结束 AIR=1488 WALL=48；中途曾现: SMOKE；新: 无；消失: SMOKE；Tmax 20.0°C | **PASS** |  |
| AIR × SMOKE | large | 烟逐渐扩散稀释、最终消散 | 起始 AIR=2232 WALL=72 SMOKE=576 → 结束 AIR=2808 WALL=72；中途曾现: SMOKE；新: 无；消失: SMOKE；Tmax 20.0°C | **PASS** |  |
| AIR × FIRE | small | 无燃料的火会熄灭并产生烟 | 起始 AIR=1487 WALL=48 FIRE=1 → 结束 AIR=1488 WALL=48；中途曾现: FIRE；新: 无；消失: FIRE；Tmax 20.2°C | **PASS** |  |
| AIR × FIRE | mid | 无燃料的火会熄灭并产生烟 | 起始 AIR=1424 WALL=48 FIRE=64 → 结束 AIR=1488 WALL=48；中途曾现: SMOKE,FIRE；新: 无；消失: FIRE；Tmax 24.3°C | **PASS** |  |
| AIR × FIRE | large | 无燃料的火会熄灭并产生烟 | 起始 AIR=2232 WALL=72 FIRE=576 → 结束 AIR=2808 WALL=72；中途曾现: SMOKE,FIRE；新: 无；消失: FIRE；Tmax 58.0°C | **PASS** |  |
| AIR × GAS | small | 瓦斯比空气轻，上浮并扩散 | 起始 AIR=1487 WALL=48 GAS=1 → 结束 AIR=1488 WALL=48；中途曾现: GAS；新: 无；消失: GAS；Tmax 20.0°C | **PASS** |  |
| AIR × GAS | mid | 瓦斯比空气轻，上浮并扩散 | 起始 AIR=1424 WALL=48 GAS=64 → 结束 AIR=1488 WALL=48；中途曾现: GAS；新: 无；消失: GAS；Tmax 20.0°C | **PASS** |  |
| AIR × GAS | large | 瓦斯比空气轻，上浮并扩散 | 起始 AIR=2232 WALL=72 GAS=576 → 结束 AIR=2808 WALL=72；中途曾现: GAS；新: 无；消失: GAS；Tmax 20.0°C | **PASS** |  |
| AIR × CLONE | small | 克隆体只能复制相邻的可移动物质；周围只有空气时不复制 | 起始 AIR=1487 WALL=48 CLONE=1 → 结束 AIR=1487 WALL=48 CLONE=1；中途曾现: CLONE；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| AIR × CLONE | mid | 克隆体只能复制相邻的可移动物质；周围只有空气时不复制 | 起始 AIR=1424 WALL=48 CLONE=64 → 结束 AIR=1424 WALL=48 CLONE=64；中途曾现: CLONE；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| AIR × CLONE | large | 克隆体只能复制相邻的可移动物质；周围只有空气时不复制 | 起始 AIR=2232 WALL=72 CLONE=576 → 结束 AIR=2232 WALL=72 CLONE=576；中途曾现: CLONE；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| AIR × VIRUS | small | 该元素置于空气中：空气作为环境热库/浮力介质/供氧背景 | 起始 AIR=1487 WALL=48 VIRUS=1 → 结束 AIR=1487 WALL=48 VIRUS=1；中途曾现: VIRUS；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| AIR × VIRUS | mid | 该元素置于空气中：空气作为环境热库/浮力介质/供氧背景 | 起始 AIR=1424 WALL=48 VIRUS=64 → 结束 AIR=1424 WALL=48 VIRUS=64；中途曾现: VIRUS；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| AIR × VIRUS | large | 该元素置于空气中：空气作为环境热库/浮力介质/供氧背景 | 起始 AIR=2232 WALL=72 VIRUS=576 → 结束 AIR=2232 WALL=72 VIRUS=576；中途曾现: VIRUS；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| AIR × SPRING | small | 水源泉持续向空气中涌出清水 | 起始 AIR=1487 WALL=48 SPRING=1 → 结束 AIR=1398 WALL=48 WATER=89 SPRING=1；中途曾现: WATER,SPRING；新: WATER；消失: 无；Tmax 20.0°C | **PASS** |  |
| AIR × SPRING | mid | 水源泉持续向空气中涌出清水 | 起始 AIR=1424 WALL=48 SPRING=64 → 结束 AIR=1056 WALL=48 WATER=368 SPRING=64；中途曾现: WATER,SPRING；新: WATER；消失: 无；Tmax 20.0°C | **PASS** |  |
| AIR × SPRING | large | 水源泉持续向空气中涌出清水 | 起始 AIR=2232 WALL=72 SPRING=576 → 结束 AIR=1097 WALL=72 WATER=1135 SPRING=576；中途曾现: WATER,SPRING；新: WATER；消失: 无；Tmax 20.0°C | **PASS** |  |
| AIR × TNT | small | 该元素置于空气中：空气作为环境热库/浮力介质/供氧背景 | 起始 AIR=1487 WALL=48 TNT=1 → 结束 AIR=1487 WALL=48 TNT=1；中途曾现: TNT；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| AIR × TNT | mid | 该元素置于空气中：空气作为环境热库/浮力介质/供氧背景 | 起始 AIR=1424 WALL=48 TNT=64 → 结束 AIR=1424 WALL=48 TNT=64；中途曾现: TNT；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| AIR × TNT | large | 该元素置于空气中：空气作为环境热库/浮力介质/供氧背景 | 起始 AIR=2232 WALL=72 TNT=576 → 结束 AIR=2232 WALL=72 TNT=576；中途曾现: TNT；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| WALL × WALL | small | 同种物质相邻：自然堆叠/流动/相变，无化学变化 | 起始 AIR=1487 WALL=49 → 结束 AIR=1487 WALL=49；中途曾现: 无；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| WALL × WALL | mid | 同种物质相邻：自然堆叠/流动/相变，无化学变化 | 起始 AIR=1424 WALL=112 → 结束 AIR=1424 WALL=112；中途曾现: 无；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| WALL × WALL | large | 同种物质相邻：自然堆叠/流动/相变，无化学变化 | 起始 AIR=2232 WALL=648 → 结束 AIR=2232 WALL=648；中途曾现: 无；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| WALL × STONE | small | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1486 WALL=49 STONE=1 → 结束 AIR=1486 WALL=49 STONE=1；中途曾现: STONE；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| WALL × STONE | mid | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1360 WALL=112 STONE=64 → 结束 AIR=1360 WALL=112 STONE=64；中途曾现: STONE；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| WALL × STONE | large | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1656 WALL=648 STONE=576 → 结束 AIR=1656 WALL=648 STONE=576；中途曾现: STONE；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| WALL × GLASS | small | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1486 WALL=49 GLASS=1 → 结束 AIR=1486 WALL=49 GLASS=1；中途曾现: GLASS；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| WALL × GLASS | mid | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1360 WALL=112 GLASS=64 → 结束 AIR=1360 WALL=112 GLASS=64；中途曾现: GLASS；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| WALL × GLASS | large | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1656 WALL=648 GLASS=576 → 结束 AIR=1656 WALL=648 GLASS=576；中途曾现: GLASS；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| WALL × METAL | small | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1486 WALL=49 METAL=1 → 结束 AIR=1486 WALL=49 METAL=1；中途曾现: METAL；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| WALL × METAL | mid | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1360 WALL=112 METAL=64 → 结束 AIR=1360 WALL=112 METAL=64；中途曾现: METAL；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| WALL × METAL | large | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1656 WALL=648 METAL=576 → 结束 AIR=1656 WALL=648 METAL=576；中途曾现: METAL；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| WALL × ICE | small | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1486 WALL=49 ICE=1 → 结束 AIR=1486 WALL=49 WATER=1；中途曾现: ICE,WATER；新: WATER；消失: ICE；Tmax 20.0°C | **N/A** |  |
| WALL × ICE | mid | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1360 WALL=112 ICE=64 → 结束 AIR=1360 WALL=112 WATER=64；中途曾现: ICE,WATER；新: WATER；消失: ICE；Tmax 20.0°C | **N/A** |  |
| WALL × ICE | large | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1656 WALL=648 ICE=576 → 结束 AIR=1656 WALL=648 WATER=576；中途曾现: ICE,WATER；新: WATER；消失: ICE；Tmax 20.0°C | **N/A** |  |
| WALL × WOOD | small | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1486 WALL=49 WOOD=1 → 结束 AIR=1486 WALL=49 WOOD=1；中途曾现: WOOD；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| WALL × WOOD | mid | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1360 WALL=112 WOOD=64 → 结束 AIR=1360 WALL=112 WOOD=64；中途曾现: WOOD；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| WALL × WOOD | large | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1656 WALL=648 WOOD=576 → 结束 AIR=1656 WALL=648 WOOD=576；中途曾现: WOOD；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| WALL × PLANT | small | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1486 WALL=49 PLANT=1 → 结束 AIR=1486 WALL=49 DUST=1；中途曾现: PLANT,DUST；新: DUST；消失: PLANT；Tmax 20.0°C | **N/A** |  |
| WALL × PLANT | mid | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1360 WALL=112 PLANT=64 → 结束 AIR=1360 WALL=112 DUST=64；中途曾现: PLANT,DUST；新: DUST；消失: PLANT；Tmax 20.0°C | **N/A** |  |
| WALL × PLANT | large | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1656 WALL=648 PLANT=576 → 结束 AIR=1656 WALL=648 DUST=576；中途曾现: PLANT,DUST；新: DUST；消失: PLANT；Tmax 20.0°C | **N/A** |  |
| WALL × SAND | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=49 SAND=1 → 结束 AIR=1486 WALL=49 SAND=1；中途曾现: SAND；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| WALL × SAND | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=112 SAND=64 → 结束 AIR=1360 WALL=112 SAND=64；中途曾现: SAND；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| WALL × SAND | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=648 SAND=576 → 结束 AIR=1656 WALL=648 SAND=576；中途曾现: SAND；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| WALL × SOIL | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=49 SOIL=1 → 结束 AIR=1486 WALL=49 SOIL=1；中途曾现: SOIL；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| WALL × SOIL | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=112 SOIL=64 → 结束 AIR=1360 WALL=112 SOIL=64；中途曾现: SOIL；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| WALL × SOIL | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=648 SOIL=576 → 结束 AIR=1656 WALL=648 SOIL=576；中途曾现: SOIL；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| WALL × SALT | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=49 SALT=1 → 结束 AIR=1486 WALL=49 SALT=1；中途曾现: SALT；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| WALL × SALT | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=112 SALT=64 → 结束 AIR=1360 WALL=112 SALT=64；中途曾现: SALT；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| WALL × SALT | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=648 SALT=576 → 结束 AIR=1656 WALL=648 SALT=576；中途曾现: SALT；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| WALL × DUST | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=49 DUST=1 → 结束 AIR=1486 WALL=49 DUST=1；中途曾现: DUST；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| WALL × DUST | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=112 DUST=64 → 结束 AIR=1360 WALL=112 DUST=64；中途曾现: DUST；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| WALL × DUST | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=648 DUST=576 → 结束 AIR=1656 WALL=648 DUST=576；中途曾现: DUST；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| WALL × SNOW | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=49 SNOW=1 → 结束 AIR=1486 WALL=49 WATER=1；中途曾现: SNOW,WATER；新: WATER；消失: SNOW；Tmax 20.0°C | **PASS** |  |
| WALL × SNOW | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=112 SNOW=64 → 结束 AIR=1360 WALL=112 WATER=64；中途曾现: SNOW,WATER；新: WATER；消失: SNOW；Tmax 20.0°C | **PASS** |  |
| WALL × SNOW | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=648 SNOW=576 → 结束 AIR=1656 WALL=648 WATER=576；中途曾现: SNOW,WATER；新: WATER；消失: SNOW；Tmax 20.0°C | **PASS** |  |
| WALL × ASH | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=49 ASH=1 → 结束 AIR=1486 WALL=49 ASH=1；中途曾现: ASH；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| WALL × ASH | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=112 ASH=64 → 结束 AIR=1360 WALL=112 ASH=64；中途曾现: ASH；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| WALL × ASH | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=648 ASH=576 → 结束 AIR=1656 WALL=648 ASH=576；中途曾现: ASH；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| WALL × COAL | small | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1486 WALL=49 COAL=1 → 结束 AIR=1486 WALL=49 COAL=1；中途曾现: COAL；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| WALL × COAL | mid | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1360 WALL=112 COAL=64 → 结束 AIR=1360 WALL=112 COAL=64；中途曾现: COAL；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| WALL × COAL | large | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1656 WALL=648 COAL=576 → 结束 AIR=1656 WALL=648 COAL=576；中途曾现: COAL；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| WALL × GUNPOWDER | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=49 GUNPOWDER=1 → 结束 AIR=1486 WALL=49 GUNPOWDER=1；中途曾现: GUNPOWDER；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| WALL × GUNPOWDER | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=112 GUNPOWDER=64 → 结束 AIR=1360 WALL=112 GUNPOWDER=64；中途曾现: GUNPOWDER；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| WALL × GUNPOWDER | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=648 GUNPOWDER=576 → 结束 AIR=1656 WALL=648 GUNPOWDER=576；中途曾现: GUNPOWDER；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| WALL × SEED | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=49 SEED=1 → 结束 AIR=1486 WALL=49 SEED=1；中途曾现: SEED；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| WALL × SEED | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=112 SEED=64 → 结束 AIR=1360 WALL=112 SEED=64；中途曾现: SEED；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| WALL × SEED | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=648 SEED=576 → 结束 AIR=1656 WALL=648 SEED=576；中途曾现: SEED；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| WALL × WATER | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=49 WATER=1 → 结束 AIR=1486 WALL=49 WATER=1；中途曾现: WATER；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| WALL × WATER | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=112 WATER=64 → 结束 AIR=1360 WALL=112 WATER=64；中途曾现: WATER；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| WALL × WATER | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=648 WATER=576 → 结束 AIR=1656 WALL=648 WATER=576；中途曾现: WATER；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| WALL × OIL | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=49 OIL=1 → 结束 AIR=1486 WALL=49 OIL=1；中途曾现: OIL；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| WALL × OIL | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=112 OIL=64 → 结束 AIR=1360 WALL=112 OIL=64；中途曾现: OIL；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| WALL × OIL | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=648 OIL=576 → 结束 AIR=1656 WALL=648 OIL=576；中途曾现: OIL；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| WALL × LAVA | small | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1486 WALL=49 LAVA=1 → 结束 AIR=1486 WALL=49 STONE=1；中途曾现: STONE,LAVA；新: STONE；消失: LAVA；Tmax 40.7°C | **PASS** |  |
| WALL × LAVA | mid | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1360 WALL=112 LAVA=64 → 结束 AIR=1360 WALL=112 STONE=64；中途曾现: STONE,LAVA；新: STONE；消失: LAVA；Tmax 393.5°C | **PASS** |  |
| WALL × LAVA | large | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1656 WALL=648 LAVA=576 → 结束 AIR=1656 WALL=648 STONE=545 LAVA=31；中途曾现: STONE,LAVA；新: STONE；消失: 无；Tmax 699.7°C | **PASS** |  |
| WALL × ACID | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=49 ACID=1 → 结束 AIR=1486 WALL=49 ACID=1；中途曾现: ACID；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| WALL × ACID | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=112 ACID=64 → 结束 AIR=1360 WALL=112 ACID=64；中途曾现: ACID；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| WALL × ACID | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=648 ACID=576 → 结束 AIR=1656 WALL=648 ACID=576；中途曾现: ACID；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| WALL × LN2 | small | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1486 WALL=49 LN2=1 → 结束 AIR=1487 WALL=49；中途曾现: LN2；新: 无；消失: LN2；Tmax 20.0°C | **PASS** |  |
| WALL × LN2 | mid | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1360 WALL=112 LN2=64 → 结束 AIR=1424 WALL=112；中途曾现: LN2；新: 无；消失: LN2；Tmax 20.0°C | **PASS** |  |
| WALL × LN2 | large | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1656 WALL=648 LN2=576 → 结束 AIR=2232 WALL=648；中途曾现: LN2；新: 无；消失: LN2；Tmax 20.0°C | **PASS** |  |
| WALL × STEAM | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=49 STEAM=1 → 结束 AIR=1487 WALL=49；中途曾现: STEAM；新: 无；消失: STEAM；Tmax 20.0°C | **PASS** |  |
| WALL × STEAM | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=112 STEAM=64 → 结束 AIR=1413 WALL=112 WATER=11；中途曾现: WATER,STEAM；新: WATER；消失: STEAM；Tmax 20.0°C | **PASS** |  |
| WALL × STEAM | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=648 STEAM=576 → 结束 AIR=2055 WALL=648 WATER=177；中途曾现: WATER,STEAM；新: WATER；消失: STEAM；Tmax 20.0°C | **PASS** |  |
| WALL × SMOKE | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=49 SMOKE=1 → 结束 AIR=1487 WALL=49；中途曾现: SMOKE；新: 无；消失: SMOKE；Tmax 20.0°C | **PASS** |  |
| WALL × SMOKE | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=112 SMOKE=64 → 结束 AIR=1424 WALL=112；中途曾现: SMOKE；新: 无；消失: SMOKE；Tmax 20.0°C | **PASS** |  |
| WALL × SMOKE | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=648 SMOKE=576 → 结束 AIR=2232 WALL=648；中途曾现: SMOKE；新: 无；消失: SMOKE；Tmax 20.0°C | **PASS** |  |
| WALL × FIRE | small | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1486 WALL=49 FIRE=1 → 结束 AIR=1487 WALL=49；中途曾现: FIRE；新: 无；消失: FIRE；Tmax 20.2°C | **PASS** |  |
| WALL × FIRE | mid | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1360 WALL=112 FIRE=64 → 结束 AIR=1424 WALL=112；中途曾现: SMOKE,FIRE；新: 无；消失: FIRE；Tmax 23.3°C | **PASS** |  |
| WALL × FIRE | large | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1656 WALL=648 FIRE=576 → 结束 AIR=2232 WALL=648；中途曾现: SMOKE,FIRE；新: 无；消失: FIRE；Tmax 59.8°C | **PASS** |  |
| WALL × GAS | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=49 GAS=1 → 结束 AIR=1487 WALL=49；中途曾现: GAS；新: 无；消失: GAS；Tmax 20.0°C | **PASS** |  |
| WALL × GAS | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=112 GAS=64 → 结束 AIR=1424 WALL=112；中途曾现: GAS；新: 无；消失: GAS；Tmax 20.0°C | **PASS** |  |
| WALL × GAS | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=648 GAS=576 → 结束 AIR=2232 WALL=648；中途曾现: GAS；新: 无；消失: GAS；Tmax 20.0°C | **PASS** |  |
| WALL × CLONE | small | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1486 WALL=49 CLONE=1 → 结束 AIR=1486 WALL=49 CLONE=1；中途曾现: CLONE；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| WALL × CLONE | mid | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1360 WALL=112 CLONE=64 → 结束 AIR=1360 WALL=112 CLONE=64；中途曾现: CLONE；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| WALL × CLONE | large | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1656 WALL=648 CLONE=576 → 结束 AIR=1656 WALL=648 CLONE=576；中途曾现: CLONE；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| WALL × VIRUS | small | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1486 WALL=49 VIRUS=1 → 结束 AIR=1486 WALL=49 VIRUS=1；中途曾现: VIRUS；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| WALL × VIRUS | mid | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1360 WALL=112 VIRUS=64 → 结束 AIR=1360 WALL=112 VIRUS=64；中途曾现: VIRUS；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| WALL × VIRUS | large | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1656 WALL=648 VIRUS=576 → 结束 AIR=1656 WALL=648 VIRUS=576；中途曾现: VIRUS；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| WALL × SPRING | small | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1486 WALL=49 SPRING=1 → 结束 AIR=1398 WALL=49 WATER=88 SPRING=1；中途曾现: WATER,SPRING；新: WATER；消失: 无；Tmax 20.0°C | **N/A** |  |
| WALL × SPRING | mid | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1360 WALL=112 SPRING=64 → 结束 AIR=1097 WALL=112 WATER=263 SPRING=64；中途曾现: WATER,SPRING；新: WATER；消失: 无；Tmax 20.0°C | **N/A** |  |
| WALL × SPRING | large | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1656 WALL=648 SPRING=576 → 结束 AIR=1291 WALL=648 WATER=365 SPRING=576；中途曾现: WATER,SPRING；新: WATER；消失: 无；Tmax 20.0°C | **N/A** |  |
| WALL × TNT | small | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1486 WALL=49 TNT=1 → 结束 AIR=1486 WALL=49 TNT=1；中途曾现: TNT；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| WALL × TNT | mid | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1360 WALL=112 TNT=64 → 结束 AIR=1360 WALL=112 TNT=64；中途曾现: TNT；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| WALL × TNT | large | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1656 WALL=648 TNT=576 → 结束 AIR=1656 WALL=648 TNT=576；中途曾现: TNT；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| STONE × STONE | small | 同种物质相邻：自然堆叠/流动/相变，无化学变化 | 起始 AIR=1487 WALL=48 STONE=1 → 结束 AIR=1487 WALL=48 STONE=1；中途曾现: STONE；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| STONE × STONE | mid | 同种物质相邻：自然堆叠/流动/相变，无化学变化 | 起始 AIR=1424 WALL=48 STONE=64 → 结束 AIR=1424 WALL=48 STONE=64；中途曾现: STONE；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| STONE × STONE | large | 同种物质相邻：自然堆叠/流动/相变，无化学变化 | 起始 AIR=2232 WALL=72 STONE=576 → 结束 AIR=2232 WALL=72 STONE=576；中途曾现: STONE；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| STONE × GLASS | small | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1486 WALL=48 STONE=1 GLASS=1 → 结束 AIR=1486 WALL=48 STONE=1 GLASS=1；中途曾现: STONE,GLASS；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| STONE × GLASS | mid | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1360 WALL=48 STONE=64 GLASS=64 → 结束 AIR=1360 WALL=48 STONE=64 GLASS=64；中途曾现: STONE,GLASS；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| STONE × GLASS | large | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1656 WALL=72 STONE=576 GLASS=576 → 结束 AIR=1656 WALL=72 STONE=576 GLASS=576；中途曾现: STONE,GLASS；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| STONE × METAL | small | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1486 WALL=48 STONE=1 METAL=1 → 结束 AIR=1486 WALL=48 STONE=1 METAL=1；中途曾现: STONE,METAL；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| STONE × METAL | mid | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1360 WALL=48 STONE=64 METAL=64 → 结束 AIR=1360 WALL=48 STONE=64 METAL=64；中途曾现: STONE,METAL；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| STONE × METAL | large | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1656 WALL=72 STONE=576 METAL=576 → 结束 AIR=1656 WALL=72 STONE=576 METAL=576；中途曾现: STONE,METAL；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| STONE × ICE | small | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1486 WALL=48 STONE=1 ICE=1 → 结束 AIR=1486 WALL=48 STONE=1 WATER=1；中途曾现: STONE,ICE,WATER；新: WATER；消失: ICE；Tmax 20.0°C | **N/A** |  |
| STONE × ICE | mid | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1360 WALL=48 STONE=64 ICE=64 → 结束 AIR=1360 WALL=48 STONE=64 WATER=64；中途曾现: STONE,ICE,WATER；新: WATER；消失: ICE；Tmax 20.0°C | **N/A** |  |
| STONE × ICE | large | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1656 WALL=72 STONE=576 ICE=576 → 结束 AIR=1656 WALL=72 STONE=576 WATER=576；中途曾现: STONE,ICE,WATER；新: WATER；消失: ICE；Tmax 20.0°C | **N/A** |  |
| STONE × WOOD | small | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1486 WALL=48 STONE=1 WOOD=1 → 结束 AIR=1486 WALL=48 STONE=1 WOOD=1；中途曾现: STONE,WOOD；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| STONE × WOOD | mid | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1360 WALL=48 STONE=64 WOOD=64 → 结束 AIR=1360 WALL=48 STONE=64 WOOD=64；中途曾现: STONE,WOOD；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| STONE × WOOD | large | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1656 WALL=72 STONE=576 WOOD=576 → 结束 AIR=1656 WALL=72 STONE=576 WOOD=576；中途曾现: STONE,WOOD；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| STONE × PLANT | small | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1486 WALL=48 STONE=1 PLANT=1 → 结束 AIR=1486 WALL=48 STONE=1 DUST=1；中途曾现: STONE,PLANT,DUST；新: DUST；消失: PLANT；Tmax 20.0°C | **N/A** |  |
| STONE × PLANT | mid | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1360 WALL=48 STONE=64 PLANT=64 → 结束 AIR=1360 WALL=48 STONE=64 DUST=64；中途曾现: STONE,PLANT,DUST；新: DUST；消失: PLANT；Tmax 20.0°C | **N/A** |  |
| STONE × PLANT | large | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1656 WALL=72 STONE=576 PLANT=576 → 结束 AIR=1656 WALL=72 STONE=576 DUST=576；中途曾现: STONE,PLANT,DUST；新: DUST；消失: PLANT；Tmax 20.0°C | **N/A** |  |
| STONE × SAND | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 STONE=1 SAND=1 → 结束 AIR=1486 WALL=48 STONE=1 SAND=1；中途曾现: STONE,SAND；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| STONE × SAND | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 STONE=64 SAND=64 → 结束 AIR=1360 WALL=48 STONE=64 SAND=64；中途曾现: STONE,SAND；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| STONE × SAND | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 STONE=576 SAND=576 → 结束 AIR=1656 WALL=72 STONE=576 SAND=576；中途曾现: STONE,SAND；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| STONE × SOIL | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 STONE=1 SOIL=1 → 结束 AIR=1486 WALL=48 STONE=1 SOIL=1；中途曾现: STONE,SOIL；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| STONE × SOIL | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 STONE=64 SOIL=64 → 结束 AIR=1360 WALL=48 STONE=64 SOIL=64；中途曾现: STONE,SOIL；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| STONE × SOIL | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 STONE=576 SOIL=576 → 结束 AIR=1656 WALL=72 STONE=576 SOIL=576；中途曾现: STONE,SOIL；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| STONE × SALT | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 STONE=1 SALT=1 → 结束 AIR=1486 WALL=48 STONE=1 SALT=1；中途曾现: STONE,SALT；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| STONE × SALT | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 STONE=64 SALT=64 → 结束 AIR=1360 WALL=48 STONE=64 SALT=64；中途曾现: STONE,SALT；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| STONE × SALT | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 STONE=576 SALT=576 → 结束 AIR=1656 WALL=72 STONE=576 SALT=576；中途曾现: STONE,SALT；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| STONE × DUST | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 STONE=1 DUST=1 → 结束 AIR=1486 WALL=48 STONE=1 DUST=1；中途曾现: STONE,DUST；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| STONE × DUST | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 STONE=64 DUST=64 → 结束 AIR=1360 WALL=48 STONE=64 DUST=64；中途曾现: STONE,DUST；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| STONE × DUST | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 STONE=576 DUST=576 → 结束 AIR=1656 WALL=72 STONE=576 DUST=576；中途曾现: STONE,DUST；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| STONE × SNOW | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 STONE=1 SNOW=1 → 结束 AIR=1486 WALL=48 STONE=1 WATER=1；中途曾现: STONE,SNOW,WATER；新: WATER；消失: SNOW；Tmax 20.0°C | **PASS** |  |
| STONE × SNOW | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 STONE=64 SNOW=64 → 结束 AIR=1360 WALL=48 STONE=64 WATER=64；中途曾现: STONE,SNOW,WATER；新: WATER；消失: SNOW；Tmax 20.0°C | **PASS** |  |
| STONE × SNOW | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 STONE=576 SNOW=576 → 结束 AIR=1656 WALL=72 STONE=576 WATER=576；中途曾现: STONE,SNOW,WATER；新: WATER；消失: SNOW；Tmax 20.0°C | **PASS** |  |
| STONE × ASH | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 STONE=1 ASH=1 → 结束 AIR=1486 WALL=48 STONE=1 ASH=1；中途曾现: STONE,ASH；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| STONE × ASH | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 STONE=64 ASH=64 → 结束 AIR=1360 WALL=48 STONE=64 ASH=64；中途曾现: STONE,ASH；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| STONE × ASH | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 STONE=576 ASH=576 → 结束 AIR=1656 WALL=72 STONE=576 ASH=576；中途曾现: STONE,ASH；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| STONE × COAL | small | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1486 WALL=48 STONE=1 COAL=1 → 结束 AIR=1486 WALL=48 STONE=1 COAL=1；中途曾现: STONE,COAL；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| STONE × COAL | mid | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1360 WALL=48 STONE=64 COAL=64 → 结束 AIR=1360 WALL=48 STONE=64 COAL=64；中途曾现: STONE,COAL；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| STONE × COAL | large | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1656 WALL=72 STONE=576 COAL=576 → 结束 AIR=1656 WALL=72 STONE=576 COAL=576；中途曾现: STONE,COAL；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| STONE × GUNPOWDER | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 STONE=1 GUNPOWDER=1 → 结束 AIR=1486 WALL=48 STONE=1 GUNPOWDER=1；中途曾现: STONE,GUNPOWDER；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| STONE × GUNPOWDER | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 STONE=64 GUNPOWDER=64 → 结束 AIR=1360 WALL=48 STONE=64 GUNPOWDER=64；中途曾现: STONE,GUNPOWDER；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| STONE × GUNPOWDER | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 STONE=576 GUNPOWDER=576 → 结束 AIR=1656 WALL=72 STONE=576 GUNPOWDER=576；中途曾现: STONE,GUNPOWDER；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| STONE × SEED | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 STONE=1 SEED=1 → 结束 AIR=1486 WALL=48 STONE=1 SEED=1；中途曾现: STONE,SEED；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| STONE × SEED | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 STONE=64 SEED=64 → 结束 AIR=1360 WALL=48 STONE=64 SEED=64；中途曾现: STONE,SEED；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| STONE × SEED | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 STONE=576 SEED=576 → 结束 AIR=1656 WALL=72 STONE=576 SEED=576；中途曾现: STONE,SEED；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| STONE × WATER | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 STONE=1 WATER=1 → 结束 AIR=1486 WALL=48 STONE=1 WATER=1；中途曾现: STONE,WATER；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| STONE × WATER | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 STONE=64 WATER=64 → 结束 AIR=1360 WALL=48 STONE=64 WATER=64；中途曾现: STONE,WATER；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| STONE × WATER | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 STONE=576 WATER=576 → 结束 AIR=1656 WALL=72 STONE=576 WATER=576；中途曾现: STONE,WATER；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| STONE × OIL | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 STONE=1 OIL=1 → 结束 AIR=1486 WALL=48 STONE=1 OIL=1；中途曾现: STONE,OIL；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| STONE × OIL | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 STONE=64 OIL=64 → 结束 AIR=1360 WALL=48 STONE=64 OIL=64；中途曾现: STONE,OIL；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| STONE × OIL | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 STONE=576 OIL=576 → 结束 AIR=1656 WALL=72 STONE=576 OIL=576；中途曾现: STONE,OIL；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| STONE × LAVA | small | 热/冷源相邻：对侧发生相变（熔/凝/沸/冻） | 起始 AIR=1486 WALL=48 STONE=1 LAVA=1 → 结束 AIR=1486 WALL=48 STONE=2；中途曾现: STONE,LAVA；新: 无；消失: LAVA；Tmax 40.6°C | **PASS** |  |
| STONE × LAVA | mid | 热/冷源相邻：对侧发生相变（熔/凝/沸/冻） | 起始 AIR=1360 WALL=48 STONE=64 LAVA=64 → 结束 AIR=1360 WALL=48 STONE=128；中途曾现: STONE,LAVA；新: 无；消失: LAVA；Tmax 388.4°C | **PASS** |  |
| STONE × LAVA | large | 热/冷源相邻：对侧发生相变（熔/凝/沸/冻） | 起始 AIR=1656 WALL=72 STONE=576 LAVA=576 → 结束 AIR=1656 WALL=72 STONE=1121 LAVA=31；中途曾现: STONE,LAVA；新: 无；消失: 无；Tmax 699.7°C | **PASS** |  |
| STONE × ACID | small | 酸腐蚀岩石（碳酸盐遇酸起泡、放气） | 起始 AIR=1486 WALL=48 STONE=1 ACID=1 → 结束 AIR=1487 WALL=48 ACID=1；中途曾现: STONE,ACID；新: 无；消失: STONE；Tmax 20.0°C | **PASS** |  |
| STONE × ACID | mid | 酸腐蚀岩石（碳酸盐遇酸起泡、放气） | 起始 AIR=1360 WALL=48 STONE=64 ACID=64 → 结束 AIR=1391 WALL=48 STONE=38 ACID=59；中途曾现: STONE,ACID；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| STONE × ACID | large | 酸腐蚀岩石（碳酸盐遇酸起泡、放气） | 起始 AIR=1656 WALL=72 STONE=576 ACID=576 → 结束 AIR=1968 WALL=72 STONE=331 ACID=509；中途曾现: STONE,ACID；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| STONE × LN2 | small | 热/冷源相邻：对侧发生相变（熔/凝/沸/冻） | 起始 AIR=1486 WALL=48 STONE=1 LN2=1 → 结束 AIR=1487 WALL=48 STONE=1；中途曾现: STONE,LN2；新: 无；消失: LN2；Tmax 20.0°C | **PASS** |  |
| STONE × LN2 | mid | 热/冷源相邻：对侧发生相变（熔/凝/沸/冻） | 起始 AIR=1360 WALL=48 STONE=64 LN2=64 → 结束 AIR=1424 WALL=48 STONE=64；中途曾现: STONE,LN2；新: 无；消失: LN2；Tmax 20.0°C | **PASS** |  |
| STONE × LN2 | large | 热/冷源相邻：对侧发生相变（熔/凝/沸/冻） | 起始 AIR=1656 WALL=72 STONE=576 LN2=576 → 结束 AIR=2232 WALL=72 STONE=576；中途曾现: STONE,LN2；新: 无；消失: LN2；Tmax 20.0°C | **PASS** |  |
| STONE × STEAM | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 STONE=1 STEAM=1 → 结束 AIR=1487 WALL=48 STONE=1；中途曾现: STONE,STEAM；新: 无；消失: STEAM；Tmax 20.0°C | **PASS** |  |
| STONE × STEAM | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 STONE=64 STEAM=64 → 结束 AIR=1413 WALL=48 STONE=64 WATER=11；中途曾现: STONE,WATER,STEAM；新: WATER；消失: STEAM；Tmax 20.0°C | **PASS** |  |
| STONE × STEAM | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 STONE=576 STEAM=576 → 结束 AIR=2055 WALL=72 STONE=576 WATER=177；中途曾现: STONE,WATER,STEAM；新: WATER；消失: STEAM；Tmax 20.0°C | **PASS** |  |
| STONE × SMOKE | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 STONE=1 SMOKE=1 → 结束 AIR=1487 WALL=48 STONE=1；中途曾现: STONE,SMOKE；新: 无；消失: SMOKE；Tmax 20.0°C | **PASS** |  |
| STONE × SMOKE | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 STONE=64 SMOKE=64 → 结束 AIR=1424 WALL=48 STONE=64；中途曾现: STONE,SMOKE；新: 无；消失: SMOKE；Tmax 20.0°C | **PASS** |  |
| STONE × SMOKE | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 STONE=576 SMOKE=576 → 结束 AIR=2232 WALL=72 STONE=576；中途曾现: STONE,SMOKE；新: 无；消失: SMOKE；Tmax 20.0°C | **PASS** |  |
| STONE × FIRE | small | 热/冷源相邻：对侧发生相变（熔/凝/沸/冻） | 起始 AIR=1486 WALL=48 STONE=1 FIRE=1 → 结束 AIR=1487 WALL=48 STONE=1；中途曾现: STONE,FIRE；新: 无；消失: FIRE；Tmax 20.2°C | **PASS** |  |
| STONE × FIRE | mid | 热/冷源相邻：对侧发生相变（熔/凝/沸/冻） | 起始 AIR=1360 WALL=48 STONE=64 FIRE=64 → 结束 AIR=1424 WALL=48 STONE=64；中途曾现: STONE,SMOKE,FIRE；新: 无；消失: FIRE；Tmax 23.3°C | **PASS** |  |
| STONE × FIRE | large | 热/冷源相邻：对侧发生相变（熔/凝/沸/冻） | 起始 AIR=1656 WALL=72 STONE=576 FIRE=576 → 结束 AIR=2232 WALL=72 STONE=576；中途曾现: STONE,SMOKE,FIRE；新: 无；消失: FIRE；Tmax 59.7°C | **PASS** |  |
| STONE × GAS | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 STONE=1 GAS=1 → 结束 AIR=1487 WALL=48 STONE=1；中途曾现: STONE,GAS；新: 无；消失: GAS；Tmax 20.0°C | **PASS** |  |
| STONE × GAS | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 STONE=64 GAS=64 → 结束 AIR=1424 WALL=48 STONE=64；中途曾现: STONE,GAS；新: 无；消失: GAS；Tmax 20.0°C | **PASS** |  |
| STONE × GAS | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 STONE=576 GAS=576 → 结束 AIR=2232 WALL=72 STONE=576；中途曾现: STONE,GAS；新: 无；消失: GAS；Tmax 20.0°C | **PASS** |  |
| STONE × CLONE | small | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1486 WALL=48 STONE=1 CLONE=1 → 结束 AIR=1486 WALL=48 STONE=1 CLONE=1；中途曾现: STONE,CLONE；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| STONE × CLONE | mid | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1360 WALL=48 STONE=64 CLONE=64 → 结束 AIR=1360 WALL=48 STONE=64 CLONE=64；中途曾现: STONE,CLONE；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| STONE × CLONE | large | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1656 WALL=72 STONE=576 CLONE=576 → 结束 AIR=1656 WALL=72 STONE=576 CLONE=576；中途曾现: STONE,CLONE；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| STONE × VIRUS | small | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1486 WALL=48 STONE=1 VIRUS=1 → 结束 AIR=1486 WALL=48 STONE=1 VIRUS=1；中途曾现: STONE,VIRUS；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| STONE × VIRUS | mid | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1360 WALL=48 STONE=64 VIRUS=64 → 结束 AIR=1360 WALL=48 STONE=64 VIRUS=64；中途曾现: STONE,VIRUS；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| STONE × VIRUS | large | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1656 WALL=72 STONE=576 VIRUS=576 → 结束 AIR=1656 WALL=72 STONE=576 VIRUS=576；中途曾现: STONE,VIRUS；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| STONE × SPRING | small | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1486 WALL=48 STONE=1 SPRING=1 → 结束 AIR=1398 WALL=48 STONE=1 WATER=88 SPRING=1；中途曾现: STONE,WATER,SPRING；新: WATER；消失: 无；Tmax 20.0°C | **N/A** |  |
| STONE × SPRING | mid | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1360 WALL=48 STONE=64 SPRING=64 → 结束 AIR=1097 WALL=48 STONE=64 WATER=263 SPRING=64；中途曾现: STONE,WATER,SPRING；新: WATER；消失: 无；Tmax 20.0°C | **N/A** |  |
| STONE × SPRING | large | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1656 WALL=72 STONE=576 SPRING=576 → 结束 AIR=1291 WALL=72 STONE=576 WATER=365 SPRING=576；中途曾现: STONE,WATER,SPRING；新: WATER；消失: 无；Tmax 20.0°C | **N/A** |  |
| STONE × TNT | small | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1486 WALL=48 STONE=1 TNT=1 → 结束 AIR=1486 WALL=48 STONE=1 TNT=1；中途曾现: STONE,TNT；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| STONE × TNT | mid | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1360 WALL=48 STONE=64 TNT=64 → 结束 AIR=1360 WALL=48 STONE=64 TNT=64；中途曾现: STONE,TNT；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| STONE × TNT | large | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1656 WALL=72 STONE=576 TNT=576 → 结束 AIR=1656 WALL=72 STONE=576 TNT=576；中途曾现: STONE,TNT；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| GLASS × GLASS | small | 同种物质相邻：自然堆叠/流动/相变，无化学变化 | 起始 AIR=1487 WALL=48 GLASS=1 → 结束 AIR=1487 WALL=48 GLASS=1；中途曾现: GLASS；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| GLASS × GLASS | mid | 同种物质相邻：自然堆叠/流动/相变，无化学变化 | 起始 AIR=1424 WALL=48 GLASS=64 → 结束 AIR=1424 WALL=48 GLASS=64；中途曾现: GLASS；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| GLASS × GLASS | large | 同种物质相邻：自然堆叠/流动/相变，无化学变化 | 起始 AIR=2232 WALL=72 GLASS=576 → 结束 AIR=2232 WALL=72 GLASS=576；中途曾现: GLASS；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| GLASS × METAL | small | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1486 WALL=48 GLASS=1 METAL=1 → 结束 AIR=1486 WALL=48 GLASS=1 METAL=1；中途曾现: GLASS,METAL；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| GLASS × METAL | mid | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1360 WALL=48 GLASS=64 METAL=64 → 结束 AIR=1360 WALL=48 GLASS=64 METAL=64；中途曾现: GLASS,METAL；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| GLASS × METAL | large | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1656 WALL=72 GLASS=576 METAL=576 → 结束 AIR=1656 WALL=72 GLASS=576 METAL=576；中途曾现: GLASS,METAL；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| GLASS × ICE | small | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1486 WALL=48 GLASS=1 ICE=1 → 结束 AIR=1486 WALL=48 GLASS=1 WATER=1；中途曾现: GLASS,ICE,WATER；新: WATER；消失: ICE；Tmax 20.0°C | **N/A** |  |
| GLASS × ICE | mid | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1360 WALL=48 GLASS=64 ICE=64 → 结束 AIR=1360 WALL=48 GLASS=64 WATER=64；中途曾现: GLASS,ICE,WATER；新: WATER；消失: ICE；Tmax 20.0°C | **N/A** |  |
| GLASS × ICE | large | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1656 WALL=72 GLASS=576 ICE=576 → 结束 AIR=1656 WALL=72 GLASS=576 WATER=576；中途曾现: GLASS,ICE,WATER；新: WATER；消失: ICE；Tmax 20.0°C | **N/A** |  |
| GLASS × WOOD | small | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1486 WALL=48 GLASS=1 WOOD=1 → 结束 AIR=1486 WALL=48 GLASS=1 WOOD=1；中途曾现: GLASS,WOOD；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| GLASS × WOOD | mid | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1360 WALL=48 GLASS=64 WOOD=64 → 结束 AIR=1360 WALL=48 GLASS=64 WOOD=64；中途曾现: GLASS,WOOD；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| GLASS × WOOD | large | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1656 WALL=72 GLASS=576 WOOD=576 → 结束 AIR=1656 WALL=72 GLASS=576 WOOD=576；中途曾现: GLASS,WOOD；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| GLASS × PLANT | small | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1486 WALL=48 GLASS=1 PLANT=1 → 结束 AIR=1486 WALL=48 GLASS=1 DUST=1；中途曾现: GLASS,PLANT,DUST；新: DUST；消失: PLANT；Tmax 20.0°C | **N/A** |  |
| GLASS × PLANT | mid | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1360 WALL=48 GLASS=64 PLANT=64 → 结束 AIR=1360 WALL=48 GLASS=64 DUST=64；中途曾现: GLASS,PLANT,DUST；新: DUST；消失: PLANT；Tmax 20.0°C | **N/A** |  |
| GLASS × PLANT | large | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1656 WALL=72 GLASS=576 PLANT=576 → 结束 AIR=1656 WALL=72 GLASS=576 DUST=576；中途曾现: GLASS,PLANT,DUST；新: DUST；消失: PLANT；Tmax 20.0°C | **N/A** |  |
| GLASS × SAND | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 GLASS=1 SAND=1 → 结束 AIR=1486 WALL=48 GLASS=1 SAND=1；中途曾现: GLASS,SAND；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| GLASS × SAND | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 GLASS=64 SAND=64 → 结束 AIR=1360 WALL=48 GLASS=64 SAND=64；中途曾现: GLASS,SAND；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| GLASS × SAND | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 GLASS=576 SAND=576 → 结束 AIR=1656 WALL=72 GLASS=576 SAND=576；中途曾现: GLASS,SAND；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| GLASS × SOIL | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 GLASS=1 SOIL=1 → 结束 AIR=1486 WALL=48 GLASS=1 SOIL=1；中途曾现: GLASS,SOIL；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| GLASS × SOIL | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 GLASS=64 SOIL=64 → 结束 AIR=1360 WALL=48 GLASS=64 SOIL=64；中途曾现: GLASS,SOIL；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| GLASS × SOIL | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 GLASS=576 SOIL=576 → 结束 AIR=1656 WALL=72 GLASS=576 SOIL=576；中途曾现: GLASS,SOIL；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| GLASS × SALT | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 GLASS=1 SALT=1 → 结束 AIR=1486 WALL=48 GLASS=1 SALT=1；中途曾现: GLASS,SALT；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| GLASS × SALT | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 GLASS=64 SALT=64 → 结束 AIR=1360 WALL=48 GLASS=64 SALT=64；中途曾现: GLASS,SALT；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| GLASS × SALT | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 GLASS=576 SALT=576 → 结束 AIR=1656 WALL=72 GLASS=576 SALT=576；中途曾现: GLASS,SALT；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| GLASS × DUST | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 GLASS=1 DUST=1 → 结束 AIR=1486 WALL=48 GLASS=1 DUST=1；中途曾现: GLASS,DUST；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| GLASS × DUST | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 GLASS=64 DUST=64 → 结束 AIR=1360 WALL=48 GLASS=64 DUST=64；中途曾现: GLASS,DUST；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| GLASS × DUST | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 GLASS=576 DUST=576 → 结束 AIR=1656 WALL=72 GLASS=576 DUST=576；中途曾现: GLASS,DUST；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| GLASS × SNOW | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 GLASS=1 SNOW=1 → 结束 AIR=1486 WALL=48 GLASS=1 WATER=1；中途曾现: GLASS,SNOW,WATER；新: WATER；消失: SNOW；Tmax 20.0°C | **PASS** |  |
| GLASS × SNOW | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 GLASS=64 SNOW=64 → 结束 AIR=1360 WALL=48 GLASS=64 WATER=64；中途曾现: GLASS,SNOW,WATER；新: WATER；消失: SNOW；Tmax 20.0°C | **PASS** |  |
| GLASS × SNOW | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 GLASS=576 SNOW=576 → 结束 AIR=1656 WALL=72 GLASS=576 WATER=576；中途曾现: GLASS,SNOW,WATER；新: WATER；消失: SNOW；Tmax 20.0°C | **PASS** |  |
| GLASS × ASH | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 GLASS=1 ASH=1 → 结束 AIR=1486 WALL=48 GLASS=1 ASH=1；中途曾现: GLASS,ASH；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| GLASS × ASH | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 GLASS=64 ASH=64 → 结束 AIR=1360 WALL=48 GLASS=64 ASH=64；中途曾现: GLASS,ASH；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| GLASS × ASH | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 GLASS=576 ASH=576 → 结束 AIR=1656 WALL=72 GLASS=576 ASH=576；中途曾现: GLASS,ASH；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| GLASS × COAL | small | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1486 WALL=48 GLASS=1 COAL=1 → 结束 AIR=1486 WALL=48 GLASS=1 COAL=1；中途曾现: GLASS,COAL；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| GLASS × COAL | mid | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1360 WALL=48 GLASS=64 COAL=64 → 结束 AIR=1360 WALL=48 GLASS=64 COAL=64；中途曾现: GLASS,COAL；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| GLASS × COAL | large | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1656 WALL=72 GLASS=576 COAL=576 → 结束 AIR=1656 WALL=72 GLASS=576 COAL=576；中途曾现: GLASS,COAL；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| GLASS × GUNPOWDER | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 GLASS=1 GUNPOWDER=1 → 结束 AIR=1486 WALL=48 GLASS=1 GUNPOWDER=1；中途曾现: GLASS,GUNPOWDER；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| GLASS × GUNPOWDER | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 GLASS=64 GUNPOWDER=64 → 结束 AIR=1360 WALL=48 GLASS=64 GUNPOWDER=64；中途曾现: GLASS,GUNPOWDER；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| GLASS × GUNPOWDER | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 GLASS=576 GUNPOWDER=576 → 结束 AIR=1656 WALL=72 GLASS=576 GUNPOWDER=576；中途曾现: GLASS,GUNPOWDER；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| GLASS × SEED | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 GLASS=1 SEED=1 → 结束 AIR=1486 WALL=48 GLASS=1 SEED=1；中途曾现: GLASS,SEED；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| GLASS × SEED | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 GLASS=64 SEED=64 → 结束 AIR=1360 WALL=48 GLASS=64 SEED=64；中途曾现: GLASS,SEED；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| GLASS × SEED | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 GLASS=576 SEED=576 → 结束 AIR=1656 WALL=72 GLASS=576 SEED=576；中途曾现: GLASS,SEED；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| GLASS × WATER | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 GLASS=1 WATER=1 → 结束 AIR=1486 WALL=48 GLASS=1 WATER=1；中途曾现: GLASS,WATER；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| GLASS × WATER | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 GLASS=64 WATER=64 → 结束 AIR=1360 WALL=48 GLASS=64 WATER=64；中途曾现: GLASS,WATER；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| GLASS × WATER | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 GLASS=576 WATER=576 → 结束 AIR=1656 WALL=72 GLASS=576 WATER=576；中途曾现: GLASS,WATER；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| GLASS × OIL | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 GLASS=1 OIL=1 → 结束 AIR=1486 WALL=48 GLASS=1 OIL=1；中途曾现: GLASS,OIL；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| GLASS × OIL | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 GLASS=64 OIL=64 → 结束 AIR=1360 WALL=48 GLASS=64 OIL=64；中途曾现: GLASS,OIL；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| GLASS × OIL | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 GLASS=576 OIL=576 → 结束 AIR=1656 WALL=72 GLASS=576 OIL=576；中途曾现: GLASS,OIL；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| GLASS × LAVA | small | 热/冷源相邻：对侧发生相变（熔/凝/沸/冻） | 起始 AIR=1486 WALL=48 GLASS=1 LAVA=1 → 结束 AIR=1486 WALL=48 STONE=1 GLASS=1；中途曾现: STONE,GLASS,LAVA；新: STONE；消失: LAVA；Tmax 40.6°C | **PASS** |  |
| GLASS × LAVA | mid | 热/冷源相邻：对侧发生相变（熔/凝/沸/冻） | 起始 AIR=1360 WALL=48 GLASS=64 LAVA=64 → 结束 AIR=1360 WALL=48 STONE=64 GLASS=64；中途曾现: STONE,GLASS,LAVA；新: STONE；消失: LAVA；Tmax 368.8°C | **PASS** |  |
| GLASS × LAVA | large | 热/冷源相邻：对侧发生相变（熔/凝/沸/冻） | 起始 AIR=1656 WALL=72 GLASS=576 LAVA=576 → 结束 AIR=1656 WALL=72 STONE=545 GLASS=576 LAVA=31；中途曾现: STONE,GLASS,LAVA；新: STONE；消失: 无；Tmax 699.7°C | **PASS** |  |
| GLASS × ACID | small | 多数酸不腐蚀玻璃（氢氟酸除外）→ 两者均不应变化 | 起始 AIR=1486 WALL=48 GLASS=1 ACID=1 → 结束 AIR=1486 WALL=48 GLASS=1 ACID=1；中途曾现: GLASS,ACID；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| GLASS × ACID | mid | 多数酸不腐蚀玻璃（氢氟酸除外）→ 两者均不应变化 | 起始 AIR=1360 WALL=48 GLASS=64 ACID=64 → 结束 AIR=1360 WALL=48 GLASS=64 ACID=64；中途曾现: GLASS,ACID；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| GLASS × ACID | large | 多数酸不腐蚀玻璃（氢氟酸除外）→ 两者均不应变化 | 起始 AIR=1656 WALL=72 GLASS=576 ACID=576 → 结束 AIR=1656 WALL=72 GLASS=576 ACID=576；中途曾现: GLASS,ACID；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| GLASS × LN2 | small | 热/冷源相邻：对侧发生相变（熔/凝/沸/冻） | 起始 AIR=1486 WALL=48 GLASS=1 LN2=1 → 结束 AIR=1487 WALL=48 GLASS=1；中途曾现: GLASS,LN2；新: 无；消失: LN2；Tmax 20.0°C | **PASS** |  |
| GLASS × LN2 | mid | 热/冷源相邻：对侧发生相变（熔/凝/沸/冻） | 起始 AIR=1360 WALL=48 GLASS=64 LN2=64 → 结束 AIR=1424 WALL=48 GLASS=64；中途曾现: GLASS,LN2；新: 无；消失: LN2；Tmax 20.0°C | **PASS** |  |
| GLASS × LN2 | large | 热/冷源相邻：对侧发生相变（熔/凝/沸/冻） | 起始 AIR=1656 WALL=72 GLASS=576 LN2=576 → 结束 AIR=2232 WALL=72 GLASS=576；中途曾现: GLASS,LN2；新: 无；消失: LN2；Tmax 20.0°C | **PASS** |  |
| GLASS × STEAM | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 GLASS=1 STEAM=1 → 结束 AIR=1487 WALL=48 GLASS=1；中途曾现: GLASS,STEAM；新: 无；消失: STEAM；Tmax 20.0°C | **PASS** |  |
| GLASS × STEAM | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 GLASS=64 STEAM=64 → 结束 AIR=1413 WALL=48 GLASS=64 WATER=11；中途曾现: GLASS,WATER,STEAM；新: WATER；消失: STEAM；Tmax 20.0°C | **PASS** |  |
| GLASS × STEAM | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 GLASS=576 STEAM=576 → 结束 AIR=2055 WALL=72 GLASS=576 WATER=177；中途曾现: GLASS,WATER,STEAM；新: WATER；消失: STEAM；Tmax 20.0°C | **PASS** |  |
| GLASS × SMOKE | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 GLASS=1 SMOKE=1 → 结束 AIR=1487 WALL=48 GLASS=1；中途曾现: GLASS,SMOKE；新: 无；消失: SMOKE；Tmax 20.0°C | **PASS** |  |
| GLASS × SMOKE | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 GLASS=64 SMOKE=64 → 结束 AIR=1424 WALL=48 GLASS=64；中途曾现: GLASS,SMOKE；新: 无；消失: SMOKE；Tmax 20.0°C | **PASS** |  |
| GLASS × SMOKE | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 GLASS=576 SMOKE=576 → 结束 AIR=2232 WALL=72 GLASS=576；中途曾现: GLASS,SMOKE；新: 无；消失: SMOKE；Tmax 20.0°C | **PASS** |  |
| GLASS × FIRE | small | 热/冷源相邻：对侧发生相变（熔/凝/沸/冻） | 起始 AIR=1486 WALL=48 GLASS=1 FIRE=1 → 结束 AIR=1487 WALL=48 GLASS=1；中途曾现: GLASS,FIRE；新: 无；消失: FIRE；Tmax 20.2°C | **PASS** |  |
| GLASS × FIRE | mid | 热/冷源相邻：对侧发生相变（熔/凝/沸/冻） | 起始 AIR=1360 WALL=48 GLASS=64 FIRE=64 → 结束 AIR=1424 WALL=48 GLASS=64；中途曾现: GLASS,SMOKE,FIRE；新: 无；消失: FIRE；Tmax 23.3°C | **PASS** |  |
| GLASS × FIRE | large | 热/冷源相邻：对侧发生相变（熔/凝/沸/冻） | 起始 AIR=1656 WALL=72 GLASS=576 FIRE=576 → 结束 AIR=2232 WALL=72 GLASS=576；中途曾现: GLASS,SMOKE,FIRE；新: 无；消失: FIRE；Tmax 59.9°C | **PASS** |  |
| GLASS × GAS | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 GLASS=1 GAS=1 → 结束 AIR=1487 WALL=48 GLASS=1；中途曾现: GLASS,GAS；新: 无；消失: GAS；Tmax 20.0°C | **PASS** |  |
| GLASS × GAS | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 GLASS=64 GAS=64 → 结束 AIR=1424 WALL=48 GLASS=64；中途曾现: GLASS,GAS；新: 无；消失: GAS；Tmax 20.0°C | **PASS** |  |
| GLASS × GAS | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 GLASS=576 GAS=576 → 结束 AIR=2232 WALL=72 GLASS=576；中途曾现: GLASS,GAS；新: 无；消失: GAS；Tmax 20.0°C | **PASS** |  |
| GLASS × CLONE | small | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1486 WALL=48 GLASS=1 CLONE=1 → 结束 AIR=1486 WALL=48 GLASS=1 CLONE=1；中途曾现: GLASS,CLONE；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| GLASS × CLONE | mid | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1360 WALL=48 GLASS=64 CLONE=64 → 结束 AIR=1360 WALL=48 GLASS=64 CLONE=64；中途曾现: GLASS,CLONE；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| GLASS × CLONE | large | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1656 WALL=72 GLASS=576 CLONE=576 → 结束 AIR=1656 WALL=72 GLASS=576 CLONE=576；中途曾现: GLASS,CLONE；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| GLASS × VIRUS | small | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1486 WALL=48 GLASS=1 VIRUS=1 → 结束 AIR=1486 WALL=48 GLASS=1 VIRUS=1；中途曾现: GLASS,VIRUS；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| GLASS × VIRUS | mid | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1360 WALL=48 GLASS=64 VIRUS=64 → 结束 AIR=1360 WALL=48 GLASS=64 VIRUS=64；中途曾现: GLASS,VIRUS；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| GLASS × VIRUS | large | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1656 WALL=72 GLASS=576 VIRUS=576 → 结束 AIR=1656 WALL=72 GLASS=576 VIRUS=576；中途曾现: GLASS,VIRUS；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| GLASS × SPRING | small | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1486 WALL=48 GLASS=1 SPRING=1 → 结束 AIR=1398 WALL=48 GLASS=1 WATER=88 SPRING=1；中途曾现: GLASS,WATER,SPRING；新: WATER；消失: 无；Tmax 20.0°C | **N/A** |  |
| GLASS × SPRING | mid | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1360 WALL=48 GLASS=64 SPRING=64 → 结束 AIR=1097 WALL=48 GLASS=64 WATER=263 SPRING=64；中途曾现: GLASS,WATER,SPRING；新: WATER；消失: 无；Tmax 20.0°C | **N/A** |  |
| GLASS × SPRING | large | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1656 WALL=72 GLASS=576 SPRING=576 → 结束 AIR=1291 WALL=72 GLASS=576 WATER=365 SPRING=576；中途曾现: GLASS,WATER,SPRING；新: WATER；消失: 无；Tmax 20.0°C | **N/A** |  |
| GLASS × TNT | small | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1486 WALL=48 GLASS=1 TNT=1 → 结束 AIR=1486 WALL=48 GLASS=1 TNT=1；中途曾现: GLASS,TNT；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| GLASS × TNT | mid | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1360 WALL=48 GLASS=64 TNT=64 → 结束 AIR=1360 WALL=48 GLASS=64 TNT=64；中途曾现: GLASS,TNT；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| GLASS × TNT | large | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1656 WALL=72 GLASS=576 TNT=576 → 结束 AIR=1656 WALL=72 GLASS=576 TNT=576；中途曾现: GLASS,TNT；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| METAL × METAL | small | 同种物质相邻：自然堆叠/流动/相变，无化学变化 | 起始 AIR=1487 WALL=48 METAL=1 → 结束 AIR=1487 WALL=48 METAL=1；中途曾现: METAL；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| METAL × METAL | mid | 同种物质相邻：自然堆叠/流动/相变，无化学变化 | 起始 AIR=1424 WALL=48 METAL=64 → 结束 AIR=1424 WALL=48 METAL=64；中途曾现: METAL；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| METAL × METAL | large | 同种物质相邻：自然堆叠/流动/相变，无化学变化 | 起始 AIR=2232 WALL=72 METAL=576 → 结束 AIR=2232 WALL=72 METAL=576；中途曾现: METAL；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| METAL × ICE | small | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1486 WALL=48 METAL=1 ICE=1 → 结束 AIR=1486 WALL=48 METAL=1 WATER=1；中途曾现: METAL,ICE,WATER；新: WATER；消失: ICE；Tmax 20.0°C | **N/A** |  |
| METAL × ICE | mid | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1360 WALL=48 METAL=64 ICE=64 → 结束 AIR=1360 WALL=48 METAL=64 WATER=64；中途曾现: METAL,ICE,WATER；新: WATER；消失: ICE；Tmax 20.0°C | **N/A** |  |
| METAL × ICE | large | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1656 WALL=72 METAL=576 ICE=576 → 结束 AIR=1656 WALL=72 METAL=576 WATER=576；中途曾现: METAL,ICE,WATER；新: WATER；消失: ICE；Tmax 20.0°C | **N/A** |  |
| METAL × WOOD | small | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1486 WALL=48 METAL=1 WOOD=1 → 结束 AIR=1486 WALL=48 METAL=1 WOOD=1；中途曾现: METAL,WOOD；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| METAL × WOOD | mid | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1360 WALL=48 METAL=64 WOOD=64 → 结束 AIR=1360 WALL=48 METAL=64 WOOD=64；中途曾现: METAL,WOOD；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| METAL × WOOD | large | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1656 WALL=72 METAL=576 WOOD=576 → 结束 AIR=1656 WALL=72 METAL=576 WOOD=576；中途曾现: METAL,WOOD；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| METAL × PLANT | small | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1486 WALL=48 METAL=1 PLANT=1 → 结束 AIR=1486 WALL=48 METAL=1 DUST=1；中途曾现: METAL,PLANT,DUST；新: DUST；消失: PLANT；Tmax 20.0°C | **N/A** |  |
| METAL × PLANT | mid | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1360 WALL=48 METAL=64 PLANT=64 → 结束 AIR=1360 WALL=48 METAL=64 DUST=64；中途曾现: METAL,PLANT,DUST；新: DUST；消失: PLANT；Tmax 20.0°C | **N/A** |  |
| METAL × PLANT | large | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1656 WALL=72 METAL=576 PLANT=576 → 结束 AIR=1656 WALL=72 METAL=576 DUST=576；中途曾现: METAL,PLANT,DUST；新: DUST；消失: PLANT；Tmax 20.0°C | **N/A** |  |
| METAL × SAND | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 METAL=1 SAND=1 → 结束 AIR=1486 WALL=48 METAL=1 SAND=1；中途曾现: METAL,SAND；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| METAL × SAND | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 METAL=64 SAND=64 → 结束 AIR=1360 WALL=48 METAL=64 SAND=64；中途曾现: METAL,SAND；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| METAL × SAND | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 METAL=576 SAND=576 → 结束 AIR=1656 WALL=72 METAL=576 SAND=576；中途曾现: METAL,SAND；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| METAL × SOIL | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 METAL=1 SOIL=1 → 结束 AIR=1486 WALL=48 METAL=1 SOIL=1；中途曾现: METAL,SOIL；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| METAL × SOIL | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 METAL=64 SOIL=64 → 结束 AIR=1360 WALL=48 METAL=64 SOIL=64；中途曾现: METAL,SOIL；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| METAL × SOIL | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 METAL=576 SOIL=576 → 结束 AIR=1656 WALL=72 METAL=576 SOIL=576；中途曾现: METAL,SOIL；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| METAL × SALT | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 METAL=1 SALT=1 → 结束 AIR=1486 WALL=48 METAL=1 SALT=1；中途曾现: METAL,SALT；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| METAL × SALT | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 METAL=64 SALT=64 → 结束 AIR=1360 WALL=48 METAL=64 SALT=64；中途曾现: METAL,SALT；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| METAL × SALT | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 METAL=576 SALT=576 → 结束 AIR=1656 WALL=72 METAL=576 SALT=576；中途曾现: METAL,SALT；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| METAL × DUST | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 METAL=1 DUST=1 → 结束 AIR=1486 WALL=48 METAL=1 DUST=1；中途曾现: METAL,DUST；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| METAL × DUST | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 METAL=64 DUST=64 → 结束 AIR=1360 WALL=48 METAL=64 DUST=64；中途曾现: METAL,DUST；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| METAL × DUST | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 METAL=576 DUST=576 → 结束 AIR=1656 WALL=72 METAL=576 DUST=576；中途曾现: METAL,DUST；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| METAL × SNOW | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 METAL=1 SNOW=1 → 结束 AIR=1486 WALL=48 METAL=1 WATER=1；中途曾现: METAL,SNOW,WATER；新: WATER；消失: SNOW；Tmax 20.0°C | **PASS** |  |
| METAL × SNOW | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 METAL=64 SNOW=64 → 结束 AIR=1360 WALL=48 METAL=64 WATER=64；中途曾现: METAL,SNOW,WATER；新: WATER；消失: SNOW；Tmax 20.0°C | **PASS** |  |
| METAL × SNOW | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 METAL=576 SNOW=576 → 结束 AIR=1656 WALL=72 METAL=576 WATER=576；中途曾现: METAL,SNOW,WATER；新: WATER；消失: SNOW；Tmax 20.0°C | **PASS** |  |
| METAL × ASH | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 METAL=1 ASH=1 → 结束 AIR=1486 WALL=48 METAL=1 ASH=1；中途曾现: METAL,ASH；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| METAL × ASH | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 METAL=64 ASH=64 → 结束 AIR=1360 WALL=48 METAL=64 ASH=64；中途曾现: METAL,ASH；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| METAL × ASH | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 METAL=576 ASH=576 → 结束 AIR=1656 WALL=72 METAL=576 ASH=576；中途曾现: METAL,ASH；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| METAL × COAL | small | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1486 WALL=48 METAL=1 COAL=1 → 结束 AIR=1486 WALL=48 METAL=1 COAL=1；中途曾现: METAL,COAL；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| METAL × COAL | mid | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1360 WALL=48 METAL=64 COAL=64 → 结束 AIR=1360 WALL=48 METAL=64 COAL=64；中途曾现: METAL,COAL；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| METAL × COAL | large | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1656 WALL=72 METAL=576 COAL=576 → 结束 AIR=1656 WALL=72 METAL=576 COAL=576；中途曾现: METAL,COAL；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| METAL × GUNPOWDER | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 METAL=1 GUNPOWDER=1 → 结束 AIR=1486 WALL=48 METAL=1 GUNPOWDER=1；中途曾现: METAL,GUNPOWDER；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| METAL × GUNPOWDER | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 METAL=64 GUNPOWDER=64 → 结束 AIR=1360 WALL=48 METAL=64 GUNPOWDER=64；中途曾现: METAL,GUNPOWDER；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| METAL × GUNPOWDER | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 METAL=576 GUNPOWDER=576 → 结束 AIR=1656 WALL=72 METAL=576 GUNPOWDER=576；中途曾现: METAL,GUNPOWDER；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| METAL × SEED | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 METAL=1 SEED=1 → 结束 AIR=1486 WALL=48 METAL=1 SEED=1；中途曾现: METAL,SEED；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| METAL × SEED | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 METAL=64 SEED=64 → 结束 AIR=1360 WALL=48 METAL=64 SEED=64；中途曾现: METAL,SEED；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| METAL × SEED | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 METAL=576 SEED=576 → 结束 AIR=1656 WALL=72 METAL=576 SEED=576；中途曾现: METAL,SEED；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| METAL × WATER | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 METAL=1 WATER=1 → 结束 AIR=1486 WALL=48 METAL=1 WATER=1；中途曾现: METAL,WATER；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| METAL × WATER | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 METAL=64 WATER=64 → 结束 AIR=1360 WALL=48 METAL=64 WATER=64；中途曾现: METAL,WATER；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| METAL × WATER | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 METAL=576 WATER=576 → 结束 AIR=1656 WALL=72 METAL=576 WATER=576；中途曾现: METAL,WATER；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| METAL × OIL | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 METAL=1 OIL=1 → 结束 AIR=1486 WALL=48 METAL=1 OIL=1；中途曾现: METAL,OIL；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| METAL × OIL | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 METAL=64 OIL=64 → 结束 AIR=1360 WALL=48 METAL=64 OIL=64；中途曾现: METAL,OIL；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| METAL × OIL | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 METAL=576 OIL=576 → 结束 AIR=1656 WALL=72 METAL=576 OIL=576；中途曾现: METAL,OIL；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| METAL × LAVA | small | 热/冷源相邻：对侧发生相变（熔/凝/沸/冻） | 起始 AIR=1486 WALL=48 METAL=1 LAVA=1 → 结束 AIR=1486 WALL=48 STONE=1 METAL=1；中途曾现: STONE,METAL,LAVA；新: STONE；消失: LAVA；Tmax 40.2°C | **PASS** |  |
| METAL × LAVA | mid | 热/冷源相邻：对侧发生相变（熔/凝/沸/冻） | 起始 AIR=1360 WALL=48 METAL=64 LAVA=64 → 结束 AIR=1360 WALL=48 STONE=64 METAL=64；中途曾现: STONE,METAL,LAVA；新: STONE；消失: LAVA；Tmax 392.8°C | **PASS** |  |
| METAL × LAVA | large | 热/冷源相邻：对侧发生相变（熔/凝/沸/冻） | 起始 AIR=1656 WALL=72 METAL=576 LAVA=576 → 结束 AIR=1656 WALL=72 STONE=548 METAL=576 LAVA=28；中途曾现: STONE,METAL,LAVA；新: STONE；消失: 无；Tmax 699.7°C | **PASS** |  |
| METAL × ACID | small | 酸腐蚀金属、放出氢气、生成金属盐溶液（质量守恒：金属应"溶入液体"而非凭空消失） | 起始 AIR=1486 WALL=48 METAL=1 ACID=1 → 结束 AIR=1488 WALL=48；中途曾现: METAL,ACID,GAS；新: 无；消失: METAL,ACID；Tmax 20.6°C | **PASS** | 见不合理清单·酸蚀/溶解不守恒 |
| METAL × ACID | mid | 酸腐蚀金属、放出氢气、生成金属盐溶液（质量守恒：金属应"溶入液体"而非凭空消失） | 起始 AIR=1360 WALL=48 METAL=64 ACID=64 → 结束 AIR=1397 WALL=48 METAL=39 ACID=52；中途曾现: METAL,ACID,GAS；新: 无；消失: 无；Tmax 21.1°C | **PASS** | 见不合理清单·酸蚀/溶解不守恒 |
| METAL × ACID | large | 酸腐蚀金属、放出氢气、生成金属盐溶液（质量守恒：金属应"溶入液体"而非凭空消失） | 起始 AIR=1656 WALL=72 METAL=576 ACID=576 → 结束 AIR=1980 WALL=72 METAL=338 ACID=488 GAS=2；中途曾现: METAL,ACID,GAS；新: GAS；消失: 无；Tmax 31.0°C | **PASS** | 见不合理清单·酸蚀/溶解不守恒 |
| METAL × LN2 | small | 热/冷源相邻：对侧发生相变（熔/凝/沸/冻） | 起始 AIR=1486 WALL=48 METAL=1 LN2=1 → 结束 AIR=1487 WALL=48 METAL=1；中途曾现: METAL,LN2；新: 无；消失: LN2；Tmax 20.0°C | **PASS** |  |
| METAL × LN2 | mid | 热/冷源相邻：对侧发生相变（熔/凝/沸/冻） | 起始 AIR=1360 WALL=48 METAL=64 LN2=64 → 结束 AIR=1424 WALL=48 METAL=64；中途曾现: METAL,LN2；新: 无；消失: LN2；Tmax 20.0°C | **PASS** |  |
| METAL × LN2 | large | 热/冷源相邻：对侧发生相变（熔/凝/沸/冻） | 起始 AIR=1656 WALL=72 METAL=576 LN2=576 → 结束 AIR=2232 WALL=72 METAL=576；中途曾现: METAL,LN2；新: 无；消失: LN2；Tmax 20.0°C | **PASS** |  |
| METAL × STEAM | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 METAL=1 STEAM=1 → 结束 AIR=1487 WALL=48 METAL=1；中途曾现: METAL,STEAM；新: 无；消失: STEAM；Tmax 20.0°C | **PASS** |  |
| METAL × STEAM | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 METAL=64 STEAM=64 → 结束 AIR=1413 WALL=48 METAL=64 WATER=11；中途曾现: METAL,WATER,STEAM；新: WATER；消失: STEAM；Tmax 20.0°C | **PASS** |  |
| METAL × STEAM | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 METAL=576 STEAM=576 → 结束 AIR=2055 WALL=72 METAL=576 WATER=177；中途曾现: METAL,WATER,STEAM；新: WATER；消失: STEAM；Tmax 20.0°C | **PASS** |  |
| METAL × SMOKE | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 METAL=1 SMOKE=1 → 结束 AIR=1487 WALL=48 METAL=1；中途曾现: METAL,SMOKE；新: 无；消失: SMOKE；Tmax 20.0°C | **PASS** |  |
| METAL × SMOKE | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 METAL=64 SMOKE=64 → 结束 AIR=1424 WALL=48 METAL=64；中途曾现: METAL,SMOKE；新: 无；消失: SMOKE；Tmax 20.0°C | **PASS** |  |
| METAL × SMOKE | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 METAL=576 SMOKE=576 → 结束 AIR=2232 WALL=72 METAL=576；中途曾现: METAL,SMOKE；新: 无；消失: SMOKE；Tmax 20.0°C | **PASS** |  |
| METAL × FIRE | small | 热/冷源相邻：对侧发生相变（熔/凝/沸/冻） | 起始 AIR=1486 WALL=48 METAL=1 FIRE=1 → 结束 AIR=1487 WALL=48 METAL=1；中途曾现: METAL,FIRE；新: 无；消失: FIRE；Tmax 20.2°C | **PASS** |  |
| METAL × FIRE | mid | 热/冷源相邻：对侧发生相变（熔/凝/沸/冻） | 起始 AIR=1360 WALL=48 METAL=64 FIRE=64 → 结束 AIR=1424 WALL=48 METAL=64；中途曾现: METAL,SMOKE,FIRE；新: 无；消失: FIRE；Tmax 23.3°C | **PASS** |  |
| METAL × FIRE | large | 热/冷源相邻：对侧发生相变（熔/凝/沸/冻） | 起始 AIR=1656 WALL=72 METAL=576 FIRE=576 → 结束 AIR=2232 WALL=72 METAL=576；中途曾现: METAL,SMOKE,FIRE；新: 无；消失: FIRE；Tmax 60.0°C | **PASS** |  |
| METAL × GAS | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 METAL=1 GAS=1 → 结束 AIR=1487 WALL=48 METAL=1；中途曾现: METAL,GAS；新: 无；消失: GAS；Tmax 20.0°C | **PASS** |  |
| METAL × GAS | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 METAL=64 GAS=64 → 结束 AIR=1424 WALL=48 METAL=64；中途曾现: METAL,GAS；新: 无；消失: GAS；Tmax 20.0°C | **PASS** |  |
| METAL × GAS | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 METAL=576 GAS=576 → 结束 AIR=2232 WALL=72 METAL=576；中途曾现: METAL,GAS；新: 无；消失: GAS；Tmax 20.0°C | **PASS** |  |
| METAL × CLONE | small | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1486 WALL=48 METAL=1 CLONE=1 → 结束 AIR=1486 WALL=48 METAL=1 CLONE=1；中途曾现: METAL,CLONE；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| METAL × CLONE | mid | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1360 WALL=48 METAL=64 CLONE=64 → 结束 AIR=1360 WALL=48 METAL=64 CLONE=64；中途曾现: METAL,CLONE；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| METAL × CLONE | large | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1656 WALL=72 METAL=576 CLONE=576 → 结束 AIR=1656 WALL=72 METAL=576 CLONE=576；中途曾现: METAL,CLONE；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| METAL × VIRUS | small | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1486 WALL=48 METAL=1 VIRUS=1 → 结束 AIR=1486 WALL=48 METAL=1 VIRUS=1；中途曾现: METAL,VIRUS；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| METAL × VIRUS | mid | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1360 WALL=48 METAL=64 VIRUS=64 → 结束 AIR=1360 WALL=48 METAL=64 VIRUS=64；中途曾现: METAL,VIRUS；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| METAL × VIRUS | large | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1656 WALL=72 METAL=576 VIRUS=576 → 结束 AIR=1656 WALL=72 METAL=576 VIRUS=576；中途曾现: METAL,VIRUS；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| METAL × SPRING | small | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1486 WALL=48 METAL=1 SPRING=1 → 结束 AIR=1398 WALL=48 METAL=1 WATER=88 SPRING=1；中途曾现: METAL,WATER,SPRING；新: WATER；消失: 无；Tmax 20.0°C | **N/A** |  |
| METAL × SPRING | mid | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1360 WALL=48 METAL=64 SPRING=64 → 结束 AIR=1097 WALL=48 METAL=64 WATER=263 SPRING=64；中途曾现: METAL,WATER,SPRING；新: WATER；消失: 无；Tmax 20.0°C | **N/A** |  |
| METAL × SPRING | large | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1656 WALL=72 METAL=576 SPRING=576 → 结束 AIR=1291 WALL=72 METAL=576 WATER=365 SPRING=576；中途曾现: METAL,WATER,SPRING；新: WATER；消失: 无；Tmax 20.0°C | **N/A** |  |
| METAL × TNT | small | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1486 WALL=48 METAL=1 TNT=1 → 结束 AIR=1486 WALL=48 METAL=1 TNT=1；中途曾现: METAL,TNT；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| METAL × TNT | mid | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1360 WALL=48 METAL=64 TNT=64 → 结束 AIR=1360 WALL=48 METAL=64 TNT=64；中途曾现: METAL,TNT；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| METAL × TNT | large | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1656 WALL=72 METAL=576 TNT=576 → 结束 AIR=1656 WALL=72 METAL=576 TNT=576；中途曾现: METAL,TNT；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| ICE × ICE | small | 同种物质相邻：自然堆叠/流动/相变，无化学变化 | 起始 AIR=1487 WALL=48 ICE=1 → 结束 AIR=1487 WALL=48 WATER=1；中途曾现: ICE,WATER；新: WATER；消失: ICE；Tmax 20.0°C | **N/A** |  |
| ICE × ICE | mid | 同种物质相邻：自然堆叠/流动/相变，无化学变化 | 起始 AIR=1424 WALL=48 ICE=64 → 结束 AIR=1424 WALL=48 WATER=64；中途曾现: ICE,WATER；新: WATER；消失: ICE；Tmax 20.0°C | **N/A** |  |
| ICE × ICE | large | 同种物质相邻：自然堆叠/流动/相变，无化学变化 | 起始 AIR=2232 WALL=72 ICE=576 → 结束 AIR=2232 WALL=72 WATER=576；中途曾现: ICE,WATER；新: WATER；消失: ICE；Tmax 20.0°C | **N/A** |  |
| ICE × WOOD | small | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1486 WALL=48 ICE=1 WOOD=1 → 结束 AIR=1486 WALL=48 WOOD=1 WATER=1；中途曾现: ICE,WOOD,WATER；新: WATER；消失: ICE；Tmax 20.0°C | **N/A** |  |
| ICE × WOOD | mid | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1360 WALL=48 ICE=64 WOOD=64 → 结束 AIR=1360 WALL=48 WOOD=64 WATER=64；中途曾现: ICE,WOOD,WATER；新: WATER；消失: ICE；Tmax 20.0°C | **N/A** |  |
| ICE × WOOD | large | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1656 WALL=72 ICE=576 WOOD=576 → 结束 AIR=1656 WALL=72 WOOD=576 WATER=576；中途曾现: ICE,WOOD,WATER；新: WATER；消失: ICE；Tmax 20.0°C | **N/A** |  |
| ICE × PLANT | small | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1486 WALL=48 ICE=1 PLANT=1 → 结束 AIR=1486 WALL=48 DUST=2；中途曾现: ICE,PLANT,DUST,WATER；新: DUST；消失: ICE,PLANT；Tmax 20.0°C | **N/A** |  |
| ICE × PLANT | mid | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1360 WALL=48 ICE=64 PLANT=64 → 结束 AIR=1359 WALL=48 DUST=69 WATER=60；中途曾现: ICE,PLANT,DUST,WATER；新: DUST,WATER；消失: ICE,PLANT；Tmax 20.0°C | **N/A** |  |
| ICE × PLANT | large | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1656 WALL=72 ICE=576 PLANT=576 → 结束 AIR=1656 WALL=72 DUST=576 WATER=576；中途曾现: ICE,PLANT,DUST,WATER；新: DUST,WATER；消失: ICE,PLANT；Tmax 20.0°C | **N/A** |  |
| ICE × SAND | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 ICE=1 SAND=1 → 结束 AIR=1486 WALL=48 SAND=1 WATER=1；中途曾现: ICE,SAND,WATER；新: WATER；消失: ICE；Tmax 20.0°C | **PASS** |  |
| ICE × SAND | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 ICE=64 SAND=64 → 结束 AIR=1360 WALL=48 SAND=64 WATER=64；中途曾现: ICE,SAND,WATER；新: WATER；消失: ICE；Tmax 20.0°C | **PASS** |  |
| ICE × SAND | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 ICE=576 SAND=576 → 结束 AIR=1656 WALL=72 SAND=576 WATER=576；中途曾现: ICE,SAND,WATER；新: WATER；消失: ICE；Tmax 20.0°C | **PASS** |  |
| ICE × SOIL | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 ICE=1 SOIL=1 → 结束 AIR=1486 WALL=48 SOIL=1 WATER=1；中途曾现: ICE,SOIL,WATER；新: WATER；消失: ICE；Tmax 20.0°C | **PASS** |  |
| ICE × SOIL | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 ICE=64 SOIL=64 → 结束 AIR=1360 WALL=48 SOIL=64 WATER=64；中途曾现: ICE,SOIL,WATER；新: WATER；消失: ICE；Tmax 20.0°C | **PASS** |  |
| ICE × SOIL | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 ICE=576 SOIL=576 → 结束 AIR=1656 WALL=72 SOIL=576 WATER=576；中途曾现: ICE,SOIL,WATER；新: WATER；消失: ICE；Tmax 20.0°C | **PASS** |  |
| ICE × SALT | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 ICE=1 SALT=1 → 结束 AIR=1487 WALL=48 WATER=1；中途曾现: ICE,SALT,WATER；新: WATER；消失: ICE,SALT；Tmax 20.0°C | **PASS** |  |
| ICE × SALT | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 ICE=64 SALT=64 → 结束 AIR=1424 WALL=48 WATER=64；中途曾现: ICE,SALT,WATER；新: WATER；消失: ICE,SALT；Tmax 20.0°C | **PASS** |  |
| ICE × SALT | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 ICE=576 SALT=576 → 结束 AIR=2202 WALL=72 SALT=30 WATER=576；中途曾现: ICE,SALT,WATER；新: WATER；消失: ICE；Tmax 20.0°C | **PASS** |  |
| ICE × DUST | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 ICE=1 DUST=1 → 结束 AIR=1486 WALL=48 DUST=1 WATER=1；中途曾现: ICE,DUST,WATER；新: WATER；消失: ICE；Tmax 20.0°C | **PASS** |  |
| ICE × DUST | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 ICE=64 DUST=64 → 结束 AIR=1360 WALL=48 DUST=64 WATER=64；中途曾现: ICE,DUST,WATER；新: WATER；消失: ICE；Tmax 20.0°C | **PASS** |  |
| ICE × DUST | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 ICE=576 DUST=576 → 结束 AIR=1656 WALL=72 DUST=576 WATER=576；中途曾现: ICE,DUST,WATER；新: WATER；消失: ICE；Tmax 20.0°C | **PASS** |  |
| ICE × SNOW | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 ICE=1 SNOW=1 → 结束 AIR=1486 WALL=48 WATER=2；中途曾现: ICE,SNOW,WATER；新: WATER；消失: ICE,SNOW；Tmax 20.0°C | **PASS** |  |
| ICE × SNOW | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 ICE=64 SNOW=64 → 结束 AIR=1360 WALL=48 WATER=128；中途曾现: ICE,SNOW,WATER；新: WATER；消失: ICE,SNOW；Tmax 20.0°C | **PASS** |  |
| ICE × SNOW | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 ICE=576 SNOW=576 → 结束 AIR=1656 WALL=72 WATER=1152；中途曾现: ICE,SNOW,WATER；新: WATER；消失: ICE,SNOW；Tmax 20.0°C | **PASS** |  |
| ICE × ASH | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 ICE=1 ASH=1 → 结束 AIR=1486 WALL=48 ASH=1 WATER=1；中途曾现: ICE,ASH,WATER；新: WATER；消失: ICE；Tmax 20.0°C | **PASS** |  |
| ICE × ASH | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 ICE=64 ASH=64 → 结束 AIR=1360 WALL=48 ASH=64 WATER=64；中途曾现: ICE,ASH,WATER；新: WATER；消失: ICE；Tmax 20.0°C | **PASS** |  |
| ICE × ASH | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 ICE=576 ASH=576 → 结束 AIR=1656 WALL=72 ASH=576 WATER=576；中途曾现: ICE,ASH,WATER；新: WATER；消失: ICE；Tmax 20.0°C | **PASS** |  |
| ICE × COAL | small | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1486 WALL=48 ICE=1 COAL=1 → 结束 AIR=1486 WALL=48 COAL=1 WATER=1；中途曾现: ICE,COAL,WATER；新: WATER；消失: ICE；Tmax 20.0°C | **N/A** |  |
| ICE × COAL | mid | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1360 WALL=48 ICE=64 COAL=64 → 结束 AIR=1360 WALL=48 COAL=64 WATER=64；中途曾现: ICE,COAL,WATER；新: WATER；消失: ICE；Tmax 20.0°C | **N/A** |  |
| ICE × COAL | large | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1656 WALL=72 ICE=576 COAL=576 → 结束 AIR=1656 WALL=72 COAL=576 WATER=576；中途曾现: ICE,COAL,WATER；新: WATER；消失: ICE；Tmax 20.0°C | **N/A** |  |
| ICE × GUNPOWDER | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 ICE=1 GUNPOWDER=1 → 结束 AIR=1486 WALL=48 GUNPOWDER=1 WATER=1；中途曾现: ICE,GUNPOWDER,WATER；新: WATER；消失: ICE；Tmax 20.0°C | **PASS** |  |
| ICE × GUNPOWDER | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 ICE=64 GUNPOWDER=64 → 结束 AIR=1360 WALL=48 GUNPOWDER=64 WATER=64；中途曾现: ICE,GUNPOWDER,WATER；新: WATER；消失: ICE；Tmax 20.0°C | **PASS** |  |
| ICE × GUNPOWDER | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 ICE=576 GUNPOWDER=576 → 结束 AIR=1656 WALL=72 GUNPOWDER=576 WATER=576；中途曾现: ICE,GUNPOWDER,WATER；新: WATER；消失: ICE；Tmax 20.0°C | **PASS** |  |
| ICE × SEED | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 ICE=1 SEED=1 → 结束 AIR=1486 WALL=48 SEED=1 WATER=1；中途曾现: ICE,SEED,WATER；新: WATER；消失: ICE；Tmax 20.0°C | **PASS** |  |
| ICE × SEED | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 ICE=64 SEED=64 → 结束 AIR=1339 WALL=48 PLANT=36 DUST=25 SEED=55 WATER=33；中途曾现: ICE,PLANT,DUST,SEED,WATER；新: PLANT,DUST,WATER；消失: ICE；Tmax 20.0°C | **PASS** |  |
| ICE × SEED | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 ICE=576 SEED=576 → 结束 AIR=1631 WALL=72 PLANT=59 DUST=19 SEED=555 WATER=544；中途曾现: ICE,PLANT,DUST,SEED,WATER；新: PLANT,DUST,WATER；消失: ICE；Tmax 20.0°C | **PASS** |  |
| ICE × WATER | small | 冰从水中吸热融化，水温下降 | 起始 AIR=1486 WALL=48 ICE=1 WATER=1 → 结束 AIR=1486 WALL=48 WATER=2；中途曾现: ICE,WATER；新: 无；消失: ICE；Tmax 20.0°C | **PASS** |  |
| ICE × WATER | mid | 冰从水中吸热融化，水温下降 | 起始 AIR=1360 WALL=48 ICE=64 WATER=64 → 结束 AIR=1360 WALL=48 WATER=128；中途曾现: ICE,WATER；新: 无；消失: ICE；Tmax 20.0°C | **PASS** |  |
| ICE × WATER | large | 冰从水中吸热融化，水温下降 | 起始 AIR=1656 WALL=72 ICE=576 WATER=576 → 结束 AIR=1656 WALL=72 WATER=1152；中途曾现: ICE,WATER；新: 无；消失: ICE；Tmax 20.0°C | **PASS** |  |
| ICE × OIL | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 ICE=1 OIL=1 → 结束 AIR=1486 WALL=48 WATER=1 OIL=1；中途曾现: ICE,WATER,OIL；新: WATER；消失: ICE；Tmax 20.0°C | **PASS** |  |
| ICE × OIL | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 ICE=64 OIL=64 → 结束 AIR=1360 WALL=48 WATER=64 OIL=64；中途曾现: ICE,WATER,OIL；新: WATER；消失: ICE；Tmax 20.0°C | **PASS** |  |
| ICE × OIL | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 ICE=576 OIL=576 → 结束 AIR=1656 WALL=72 WATER=576 OIL=576；中途曾现: ICE,WATER,OIL；新: WATER；消失: ICE；Tmax 20.0°C | **PASS** |  |
| ICE × LAVA | small | 冰被岩浆瞬间融化成水并汽化，岩浆凝固成岩 | 起始 AIR=1486 WALL=48 ICE=1 LAVA=1 → 结束 AIR=1487 WALL=48 STONE=1；中途曾现: STONE,ICE,LAVA,STEAM；新: STONE；消失: ICE,LAVA；Tmax 43.0°C | **PASS** |  |
| ICE × LAVA | mid | 冰被岩浆瞬间融化成水并汽化，岩浆凝固成岩 | 起始 AIR=1360 WALL=48 ICE=64 LAVA=64 → 结束 AIR=1380 WALL=48 STONE=64 WATER=44；中途曾现: STONE,ICE,WATER,LAVA,STEAM；新: STONE,WATER；消失: ICE,LAVA；Tmax 376.9°C | **PASS** |  |
| ICE × LAVA | large | 冰被岩浆瞬间融化成水并汽化，岩浆凝固成岩 | 起始 AIR=1656 WALL=72 ICE=576 LAVA=576 → 结束 AIR=1743 WALL=72 STONE=547 WATER=489 LAVA=29；中途曾现: STONE,ICE,WATER,LAVA,STEAM；新: STONE,WATER；消失: ICE；Tmax 699.7°C | **PASS** |  |
| ICE × ACID | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 ICE=1 ACID=1 → 结束 AIR=1486 WALL=48 WATER=1 ACID=1；中途曾现: ICE,WATER,ACID；新: WATER；消失: ICE；Tmax 20.0°C | **PASS** |  |
| ICE × ACID | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 ICE=64 ACID=64 → 结束 AIR=1360 WALL=48 WATER=64 ACID=64；中途曾现: ICE,WATER,ACID；新: WATER；消失: ICE；Tmax 20.0°C | **PASS** |  |
| ICE × ACID | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 ICE=576 ACID=576 → 结束 AIR=1656 WALL=72 WATER=576 ACID=576；中途曾现: ICE,WATER,ACID；新: WATER；消失: ICE；Tmax 20.0°C | **PASS** |  |
| ICE × LN2 | small | 热/冷源相邻：对侧发生相变（熔/凝/沸/冻） | 起始 AIR=1486 WALL=48 ICE=1 LN2=1 → 结束 AIR=1487 WALL=48 WATER=1；中途曾现: ICE,WATER,LN2；新: WATER；消失: ICE,LN2；Tmax 20.0°C | **PASS** |  |
| ICE × LN2 | mid | 热/冷源相邻：对侧发生相变（熔/凝/沸/冻） | 起始 AIR=1360 WALL=48 ICE=64 LN2=64 → 结束 AIR=1424 WALL=48 ICE=3 WATER=61；中途曾现: ICE,WATER,LN2；新: WATER；消失: LN2；Tmax 20.0°C | **PASS** |  |
| ICE × LN2 | large | 热/冷源相邻：对侧发生相变（熔/凝/沸/冻） | 起始 AIR=1656 WALL=72 ICE=576 LN2=576 → 结束 AIR=2232 WALL=72 ICE=24 WATER=552；中途曾现: ICE,WATER,LN2；新: WATER；消失: LN2；Tmax 20.0°C | **PASS** |  |
| ICE × STEAM | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 ICE=1 STEAM=1 → 结束 AIR=1487 WALL=48 WATER=1；中途曾现: ICE,WATER,STEAM；新: WATER；消失: ICE,STEAM；Tmax 20.0°C | **PASS** |  |
| ICE × STEAM | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 ICE=64 STEAM=64 → 结束 AIR=1413 WALL=48 WATER=75；中途曾现: ICE,WATER,STEAM；新: WATER；消失: ICE,STEAM；Tmax 20.0°C | **PASS** |  |
| ICE × STEAM | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 ICE=576 STEAM=576 → 结束 AIR=2054 WALL=72 WATER=754；中途曾现: ICE,WATER,STEAM；新: WATER；消失: ICE,STEAM；Tmax 20.0°C | **PASS** |  |
| ICE × SMOKE | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 ICE=1 SMOKE=1 → 结束 AIR=1487 WALL=48 WATER=1；中途曾现: ICE,WATER,SMOKE；新: WATER；消失: ICE,SMOKE；Tmax 20.0°C | **PASS** |  |
| ICE × SMOKE | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 ICE=64 SMOKE=64 → 结束 AIR=1424 WALL=48 WATER=64；中途曾现: ICE,WATER,SMOKE；新: WATER；消失: ICE,SMOKE；Tmax 20.0°C | **PASS** |  |
| ICE × SMOKE | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 ICE=576 SMOKE=576 → 结束 AIR=2232 WALL=72 WATER=576；中途曾现: ICE,WATER,SMOKE；新: WATER；消失: ICE,SMOKE；Tmax 20.0°C | **PASS** |  |
| ICE × FIRE | small | 热/冷源相邻：对侧发生相变（熔/凝/沸/冻） | 起始 AIR=1486 WALL=48 ICE=1 FIRE=1 → 结束 AIR=1487 WALL=48 WATER=1；中途曾现: ICE,WATER,FIRE；新: WATER；消失: ICE,FIRE；Tmax 20.2°C | **PASS** |  |
| ICE × FIRE | mid | 热/冷源相邻：对侧发生相变（熔/凝/沸/冻） | 起始 AIR=1360 WALL=48 ICE=64 FIRE=64 → 结束 AIR=1424 WALL=48 WATER=64；中途曾现: ICE,WATER,SMOKE,FIRE；新: WATER；消失: ICE,FIRE；Tmax 23.3°C | **PASS** |  |
| ICE × FIRE | large | 热/冷源相邻：对侧发生相变（熔/凝/沸/冻） | 起始 AIR=1656 WALL=72 ICE=576 FIRE=576 → 结束 AIR=2235 WALL=72 WATER=573；中途曾现: ICE,WATER,STEAM,SMOKE,FIRE；新: WATER；消失: ICE,FIRE；Tmax 60.6°C | **PASS** |  |
| ICE × GAS | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 ICE=1 GAS=1 → 结束 AIR=1487 WALL=48 WATER=1；中途曾现: ICE,WATER,GAS；新: WATER；消失: ICE,GAS；Tmax 20.0°C | **PASS** |  |
| ICE × GAS | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 ICE=64 GAS=64 → 结束 AIR=1424 WALL=48 WATER=64；中途曾现: ICE,WATER,GAS；新: WATER；消失: ICE,GAS；Tmax 20.0°C | **PASS** |  |
| ICE × GAS | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 ICE=576 GAS=576 → 结束 AIR=2232 WALL=72 WATER=576；中途曾现: ICE,WATER,GAS；新: WATER；消失: ICE,GAS；Tmax 20.0°C | **PASS** |  |
| ICE × CLONE | small | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1486 WALL=48 ICE=1 CLONE=1 → 结束 AIR=1392 WALL=48 WATER=95 CLONE=1；中途曾现: ICE,WATER,CLONE；新: WATER；消失: ICE；Tmax 20.0°C | **N/A** |  |
| ICE × CLONE | mid | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1360 WALL=48 ICE=64 CLONE=64 → 结束 AIR=1057 WALL=48 WATER=367 CLONE=64；中途曾现: ICE,WATER,CLONE；新: WATER；消失: ICE；Tmax 20.0°C | **N/A** |  |
| ICE × CLONE | large | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1656 WALL=72 ICE=576 CLONE=576 → 结束 AIR=1064 WALL=72 WATER=1168 CLONE=576；中途曾现: ICE,WATER,CLONE；新: WATER；消失: ICE；Tmax 20.0°C | **N/A** |  |
| ICE × VIRUS | small | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1486 WALL=48 ICE=1 VIRUS=1 → 结束 AIR=1486 WALL=48 WATER=1 VIRUS=1；中途曾现: ICE,WATER,VIRUS；新: WATER；消失: ICE；Tmax 20.0°C | **N/A** |  |
| ICE × VIRUS | mid | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1360 WALL=48 ICE=64 VIRUS=64 → 结束 AIR=1360 WALL=48 WATER=64 VIRUS=64；中途曾现: ICE,WATER,VIRUS；新: WATER；消失: ICE；Tmax 20.0°C | **N/A** |  |
| ICE × VIRUS | large | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1656 WALL=72 ICE=576 VIRUS=576 → 结束 AIR=1656 WALL=72 WATER=576 VIRUS=576；中途曾现: ICE,WATER,VIRUS；新: WATER；消失: ICE；Tmax 20.0°C | **N/A** |  |
| ICE × SPRING | small | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1486 WALL=48 ICE=1 SPRING=1 → 结束 AIR=1398 WALL=48 WATER=89 SPRING=1；中途曾现: ICE,WATER,SPRING；新: WATER；消失: ICE；Tmax 20.0°C | **N/A** |  |
| ICE × SPRING | mid | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1360 WALL=48 ICE=64 SPRING=64 → 结束 AIR=1057 WALL=48 WATER=367 SPRING=64；中途曾现: ICE,WATER,SPRING；新: WATER；消失: ICE；Tmax 20.0°C | **N/A** |  |
| ICE × SPRING | large | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1656 WALL=72 ICE=576 SPRING=576 → 结束 AIR=1072 WALL=72 WATER=1160 SPRING=576；中途曾现: ICE,WATER,SPRING；新: WATER；消失: ICE；Tmax 20.0°C | **N/A** |  |
| ICE × TNT | small | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1486 WALL=48 ICE=1 TNT=1 → 结束 AIR=1486 WALL=48 WATER=1 TNT=1；中途曾现: ICE,WATER,TNT；新: WATER；消失: ICE；Tmax 20.0°C | **N/A** |  |
| ICE × TNT | mid | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1360 WALL=48 ICE=64 TNT=64 → 结束 AIR=1360 WALL=48 WATER=64 TNT=64；中途曾现: ICE,WATER,TNT；新: WATER；消失: ICE；Tmax 20.0°C | **N/A** |  |
| ICE × TNT | large | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1656 WALL=72 ICE=576 TNT=576 → 结束 AIR=1656 WALL=72 WATER=576 TNT=576；中途曾现: ICE,WATER,TNT；新: WATER；消失: ICE；Tmax 20.0°C | **N/A** |  |
| WOOD × WOOD | small | 同种物质相邻：自然堆叠/流动/相变，无化学变化 | 起始 AIR=1487 WALL=48 WOOD=1 → 结束 AIR=1487 WALL=48 WOOD=1；中途曾现: WOOD；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| WOOD × WOOD | mid | 同种物质相邻：自然堆叠/流动/相变，无化学变化 | 起始 AIR=1424 WALL=48 WOOD=64 → 结束 AIR=1424 WALL=48 WOOD=64；中途曾现: WOOD；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| WOOD × WOOD | large | 同种物质相邻：自然堆叠/流动/相变，无化学变化 | 起始 AIR=2232 WALL=72 WOOD=576 → 结束 AIR=2232 WALL=72 WOOD=576；中途曾现: WOOD；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| WOOD × PLANT | small | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1486 WALL=48 WOOD=1 PLANT=1 → 结束 AIR=1486 WALL=48 WOOD=1 DUST=1；中途曾现: WOOD,PLANT,DUST；新: DUST；消失: PLANT；Tmax 20.0°C | **N/A** |  |
| WOOD × PLANT | mid | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1360 WALL=48 WOOD=64 PLANT=64 → 结束 AIR=1360 WALL=48 WOOD=64 DUST=64；中途曾现: WOOD,PLANT,DUST；新: DUST；消失: PLANT；Tmax 20.0°C | **N/A** |  |
| WOOD × PLANT | large | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1656 WALL=72 WOOD=576 PLANT=576 → 结束 AIR=1656 WALL=72 WOOD=576 DUST=576；中途曾现: WOOD,PLANT,DUST；新: DUST；消失: PLANT；Tmax 20.0°C | **N/A** |  |
| WOOD × SAND | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 WOOD=1 SAND=1 → 结束 AIR=1486 WALL=48 WOOD=1 SAND=1；中途曾现: WOOD,SAND；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| WOOD × SAND | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 WOOD=64 SAND=64 → 结束 AIR=1360 WALL=48 WOOD=64 SAND=64；中途曾现: WOOD,SAND；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| WOOD × SAND | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 WOOD=576 SAND=576 → 结束 AIR=1656 WALL=72 WOOD=576 SAND=576；中途曾现: WOOD,SAND；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| WOOD × SOIL | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 WOOD=1 SOIL=1 → 结束 AIR=1486 WALL=48 WOOD=1 SOIL=1；中途曾现: WOOD,SOIL；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| WOOD × SOIL | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 WOOD=64 SOIL=64 → 结束 AIR=1360 WALL=48 WOOD=64 SOIL=64；中途曾现: WOOD,SOIL；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| WOOD × SOIL | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 WOOD=576 SOIL=576 → 结束 AIR=1656 WALL=72 WOOD=576 SOIL=576；中途曾现: WOOD,SOIL；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| WOOD × SALT | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 WOOD=1 SALT=1 → 结束 AIR=1486 WALL=48 WOOD=1 SALT=1；中途曾现: WOOD,SALT；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| WOOD × SALT | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 WOOD=64 SALT=64 → 结束 AIR=1360 WALL=48 WOOD=64 SALT=64；中途曾现: WOOD,SALT；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| WOOD × SALT | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 WOOD=576 SALT=576 → 结束 AIR=1656 WALL=72 WOOD=576 SALT=576；中途曾现: WOOD,SALT；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| WOOD × DUST | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 WOOD=1 DUST=1 → 结束 AIR=1486 WALL=48 WOOD=1 DUST=1；中途曾现: WOOD,DUST；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| WOOD × DUST | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 WOOD=64 DUST=64 → 结束 AIR=1360 WALL=48 WOOD=64 DUST=64；中途曾现: WOOD,DUST；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| WOOD × DUST | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 WOOD=576 DUST=576 → 结束 AIR=1656 WALL=72 WOOD=576 DUST=576；中途曾现: WOOD,DUST；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| WOOD × SNOW | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 WOOD=1 SNOW=1 → 结束 AIR=1486 WALL=48 WOOD=1 WATER=1；中途曾现: WOOD,SNOW,WATER；新: WATER；消失: SNOW；Tmax 20.0°C | **PASS** |  |
| WOOD × SNOW | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 WOOD=64 SNOW=64 → 结束 AIR=1360 WALL=48 WOOD=64 WATER=64；中途曾现: WOOD,SNOW,WATER；新: WATER；消失: SNOW；Tmax 20.0°C | **PASS** |  |
| WOOD × SNOW | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 WOOD=576 SNOW=576 → 结束 AIR=1656 WALL=72 WOOD=576 WATER=576；中途曾现: WOOD,SNOW,WATER；新: WATER；消失: SNOW；Tmax 20.0°C | **PASS** |  |
| WOOD × ASH | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 WOOD=1 ASH=1 → 结束 AIR=1486 WALL=48 WOOD=1 ASH=1；中途曾现: WOOD,ASH；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| WOOD × ASH | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 WOOD=64 ASH=64 → 结束 AIR=1360 WALL=48 WOOD=64 ASH=64；中途曾现: WOOD,ASH；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| WOOD × ASH | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 WOOD=576 ASH=576 → 结束 AIR=1656 WALL=72 WOOD=576 ASH=576；中途曾现: WOOD,ASH；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| WOOD × COAL | small | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1486 WALL=48 WOOD=1 COAL=1 → 结束 AIR=1486 WALL=48 WOOD=1 COAL=1；中途曾现: WOOD,COAL；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| WOOD × COAL | mid | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1360 WALL=48 WOOD=64 COAL=64 → 结束 AIR=1360 WALL=48 WOOD=64 COAL=64；中途曾现: WOOD,COAL；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| WOOD × COAL | large | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1656 WALL=72 WOOD=576 COAL=576 → 结束 AIR=1656 WALL=72 WOOD=576 COAL=576；中途曾现: WOOD,COAL；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| WOOD × GUNPOWDER | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 WOOD=1 GUNPOWDER=1 → 结束 AIR=1486 WALL=48 WOOD=1 GUNPOWDER=1；中途曾现: WOOD,GUNPOWDER；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| WOOD × GUNPOWDER | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 WOOD=64 GUNPOWDER=64 → 结束 AIR=1360 WALL=48 WOOD=64 GUNPOWDER=64；中途曾现: WOOD,GUNPOWDER；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| WOOD × GUNPOWDER | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 WOOD=576 GUNPOWDER=576 → 结束 AIR=1656 WALL=72 WOOD=576 GUNPOWDER=576；中途曾现: WOOD,GUNPOWDER；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| WOOD × SEED | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 WOOD=1 SEED=1 → 结束 AIR=1486 WALL=48 WOOD=1 SEED=1；中途曾现: WOOD,SEED；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| WOOD × SEED | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 WOOD=64 SEED=64 → 结束 AIR=1360 WALL=48 WOOD=64 SEED=64；中途曾现: WOOD,SEED；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| WOOD × SEED | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 WOOD=576 SEED=576 → 结束 AIR=1656 WALL=72 WOOD=576 SEED=576；中途曾现: WOOD,SEED；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| WOOD × WATER | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 WOOD=1 WATER=1 → 结束 AIR=1486 WALL=48 WOOD=1 WATER=1；中途曾现: WOOD,WATER；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| WOOD × WATER | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 WOOD=64 WATER=64 → 结束 AIR=1360 WALL=48 WOOD=64 WATER=64；中途曾现: WOOD,WATER；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| WOOD × WATER | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 WOOD=576 WATER=576 → 结束 AIR=1656 WALL=72 WOOD=576 WATER=576；中途曾现: WOOD,WATER；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| WOOD × OIL | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 WOOD=1 OIL=1 → 结束 AIR=1486 WALL=48 WOOD=1 OIL=1；中途曾现: WOOD,OIL；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| WOOD × OIL | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 WOOD=64 OIL=64 → 结束 AIR=1360 WALL=48 WOOD=64 OIL=64；中途曾现: WOOD,OIL；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| WOOD × OIL | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 WOOD=576 OIL=576 → 结束 AIR=1656 WALL=72 WOOD=576 OIL=576；中途曾现: WOOD,OIL；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| WOOD × LAVA | small | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1486 WALL=48 WOOD=1 LAVA=1 → 结束 AIR=1486 WALL=48 STONE=1 WOOD=1；中途曾现: STONE,WOOD,LAVA；新: STONE；消失: LAVA；Tmax 40.6°C | **PASS** |  |
| WOOD × LAVA | mid | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1360 WALL=48 WOOD=64 LAVA=64 → 结束 AIR=1360 WALL=48 STONE=64 WOOD=64；中途曾现: STONE,WOOD,LAVA；新: STONE；消失: LAVA；Tmax 393.4°C | **PASS** |  |
| WOOD × LAVA | large | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1656 WALL=72 WOOD=576 LAVA=576 → 结束 AIR=1656 WALL=72 STONE=545 WOOD=576 LAVA=31；中途曾现: STONE,WOOD,LAVA；新: STONE；消失: 无；Tmax 699.7°C | **PASS** |  |
| WOOD × ACID | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 WOOD=1 ACID=1 → 结束 AIR=1486 WALL=48 WOOD=1 ACID=1；中途曾现: WOOD,ACID；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| WOOD × ACID | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 WOOD=64 ACID=64 → 结束 AIR=1360 WALL=48 WOOD=64 ACID=64；中途曾现: WOOD,ACID；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| WOOD × ACID | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 WOOD=576 ACID=576 → 结束 AIR=1656 WALL=72 WOOD=576 ACID=576；中途曾现: WOOD,ACID；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| WOOD × LN2 | small | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1486 WALL=48 WOOD=1 LN2=1 → 结束 AIR=1487 WALL=48 WOOD=1；中途曾现: WOOD,LN2；新: 无；消失: LN2；Tmax 20.0°C | **PASS** |  |
| WOOD × LN2 | mid | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1360 WALL=48 WOOD=64 LN2=64 → 结束 AIR=1424 WALL=48 WOOD=64；中途曾现: WOOD,LN2；新: 无；消失: LN2；Tmax 20.0°C | **PASS** |  |
| WOOD × LN2 | large | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1656 WALL=72 WOOD=576 LN2=576 → 结束 AIR=2232 WALL=72 WOOD=576；中途曾现: WOOD,LN2；新: 无；消失: LN2；Tmax 20.0°C | **PASS** |  |
| WOOD × STEAM | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 WOOD=1 STEAM=1 → 结束 AIR=1487 WALL=48 WOOD=1；中途曾现: WOOD,STEAM；新: 无；消失: STEAM；Tmax 20.0°C | **PASS** |  |
| WOOD × STEAM | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 WOOD=64 STEAM=64 → 结束 AIR=1413 WALL=48 WOOD=64 WATER=11；中途曾现: WOOD,WATER,STEAM；新: WATER；消失: STEAM；Tmax 20.0°C | **PASS** |  |
| WOOD × STEAM | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 WOOD=576 STEAM=576 → 结束 AIR=2055 WALL=72 WOOD=576 WATER=177；中途曾现: WOOD,WATER,STEAM；新: WATER；消失: STEAM；Tmax 20.0°C | **PASS** |  |
| WOOD × SMOKE | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 WOOD=1 SMOKE=1 → 结束 AIR=1487 WALL=48 WOOD=1；中途曾现: WOOD,SMOKE；新: 无；消失: SMOKE；Tmax 20.0°C | **PASS** |  |
| WOOD × SMOKE | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 WOOD=64 SMOKE=64 → 结束 AIR=1424 WALL=48 WOOD=64；中途曾现: WOOD,SMOKE；新: 无；消失: SMOKE；Tmax 20.0°C | **PASS** |  |
| WOOD × SMOKE | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 WOOD=576 SMOKE=576 → 结束 AIR=2232 WALL=72 WOOD=576；中途曾现: WOOD,SMOKE；新: 无；消失: SMOKE；Tmax 20.0°C | **PASS** |  |
| WOOD × FIRE | small | 木材被点燃后持续燃烧、火势沿木蔓延、烧尽留下炭/灰（大部分木料应被烧掉） | 起始 AIR=1486 WALL=48 WOOD=1 FIRE=1 → 结束 AIR=1487 WALL=48 WOOD=1；中途曾现: WOOD,FIRE；新: 无；消失: FIRE；Tmax 20.2°C | **FAIL** | 见不合理清单·火离开燃料 |
| WOOD × FIRE | mid | 木材被点燃后持续燃烧、火势沿木蔓延、烧尽留下炭/灰（大部分木料应被烧掉） | 起始 AIR=1360 WALL=48 WOOD=64 FIRE=64 → 结束 AIR=1424 WALL=48 WOOD=64；中途曾现: WOOD,SMOKE,FIRE；新: 无；消失: FIRE；Tmax 23.3°C | **FAIL** | 见不合理清单·火离开燃料 |
| WOOD × FIRE | large | 木材被点燃后持续燃烧、火势沿木蔓延、烧尽留下炭/灰（大部分木料应被烧掉） | 起始 AIR=1656 WALL=72 WOOD=576 FIRE=576 → 结束 AIR=2233 WALL=72 WOOD=575；中途曾现: WOOD,SMOKE,FIRE；新: 无；消失: FIRE；Tmax 61.2°C | **FAIL** | 见不合理清单·火离开燃料 |
| WOOD × GAS | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 WOOD=1 GAS=1 → 结束 AIR=1487 WALL=48 WOOD=1；中途曾现: WOOD,GAS；新: 无；消失: GAS；Tmax 20.0°C | **PASS** |  |
| WOOD × GAS | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 WOOD=64 GAS=64 → 结束 AIR=1424 WALL=48 WOOD=64；中途曾现: WOOD,GAS；新: 无；消失: GAS；Tmax 20.0°C | **PASS** |  |
| WOOD × GAS | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 WOOD=576 GAS=576 → 结束 AIR=2232 WALL=72 WOOD=576；中途曾现: WOOD,GAS；新: 无；消失: GAS；Tmax 20.0°C | **PASS** |  |
| WOOD × CLONE | small | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1486 WALL=48 WOOD=1 CLONE=1 → 结束 AIR=1486 WALL=48 WOOD=1 CLONE=1；中途曾现: WOOD,CLONE；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| WOOD × CLONE | mid | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1360 WALL=48 WOOD=64 CLONE=64 → 结束 AIR=1360 WALL=48 WOOD=64 CLONE=64；中途曾现: WOOD,CLONE；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| WOOD × CLONE | large | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1656 WALL=72 WOOD=576 CLONE=576 → 结束 AIR=1656 WALL=72 WOOD=576 CLONE=576；中途曾现: WOOD,CLONE；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| WOOD × VIRUS | small | 现实中病毒不侵染木材；本作把木材设为可被侵染（演绎化设定） | 起始 AIR=1486 WALL=48 WOOD=1 VIRUS=1 → 结束 AIR=1486 WALL=48 VIRUS=2；中途曾现: WOOD,VIRUS；新: 无；消失: WOOD；Tmax 20.0°C | **PASS** |  |
| WOOD × VIRUS | mid | 现实中病毒不侵染木材；本作把木材设为可被侵染（演绎化设定） | 起始 AIR=1360 WALL=48 WOOD=64 VIRUS=64 → 结束 AIR=1360 WALL=48 VIRUS=128；中途曾现: WOOD,VIRUS；新: 无；消失: WOOD；Tmax 20.0°C | **PASS** |  |
| WOOD × VIRUS | large | 现实中病毒不侵染木材；本作把木材设为可被侵染（演绎化设定） | 起始 AIR=1656 WALL=72 WOOD=576 VIRUS=576 → 结束 AIR=1656 WALL=72 VIRUS=1152；中途曾现: WOOD,VIRUS；新: 无；消失: WOOD；Tmax 20.0°C | **PASS** |  |
| WOOD × SPRING | small | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1486 WALL=48 WOOD=1 SPRING=1 → 结束 AIR=1398 WALL=48 WOOD=1 WATER=88 SPRING=1；中途曾现: WOOD,WATER,SPRING；新: WATER；消失: 无；Tmax 20.0°C | **N/A** |  |
| WOOD × SPRING | mid | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1360 WALL=48 WOOD=64 SPRING=64 → 结束 AIR=1097 WALL=48 WOOD=64 WATER=263 SPRING=64；中途曾现: WOOD,WATER,SPRING；新: WATER；消失: 无；Tmax 20.0°C | **N/A** |  |
| WOOD × SPRING | large | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1656 WALL=72 WOOD=576 SPRING=576 → 结束 AIR=1291 WALL=72 WOOD=576 WATER=365 SPRING=576；中途曾现: WOOD,WATER,SPRING；新: WATER；消失: 无；Tmax 20.0°C | **N/A** |  |
| WOOD × TNT | small | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1486 WALL=48 WOOD=1 TNT=1 → 结束 AIR=1486 WALL=48 WOOD=1 TNT=1；中途曾现: WOOD,TNT；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| WOOD × TNT | mid | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1360 WALL=48 WOOD=64 TNT=64 → 结束 AIR=1360 WALL=48 WOOD=64 TNT=64；中途曾现: WOOD,TNT；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| WOOD × TNT | large | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1656 WALL=72 WOOD=576 TNT=576 → 结束 AIR=1656 WALL=72 WOOD=576 TNT=576；中途曾现: WOOD,TNT；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| PLANT × PLANT | small | 同种物质相邻：自然堆叠/流动/相变，无化学变化 | 起始 AIR=1487 WALL=48 PLANT=1 → 结束 AIR=1487 WALL=48 DUST=1；中途曾现: PLANT,DUST；新: DUST；消失: PLANT；Tmax 20.0°C | **N/A** |  |
| PLANT × PLANT | mid | 同种物质相邻：自然堆叠/流动/相变，无化学变化 | 起始 AIR=1424 WALL=48 PLANT=64 → 结束 AIR=1424 WALL=48 DUST=64；中途曾现: PLANT,DUST；新: DUST；消失: PLANT；Tmax 20.0°C | **N/A** |  |
| PLANT × PLANT | large | 同种物质相邻：自然堆叠/流动/相变，无化学变化 | 起始 AIR=2232 WALL=72 PLANT=576 → 结束 AIR=2232 WALL=72 DUST=576；中途曾现: PLANT,DUST；新: DUST；消失: PLANT；Tmax 20.0°C | **N/A** |  |
| PLANT × SAND | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 PLANT=1 SAND=1 → 结束 AIR=1486 WALL=48 SAND=1 DUST=1；中途曾现: PLANT,SAND,DUST；新: DUST；消失: PLANT；Tmax 20.0°C | **PASS** |  |
| PLANT × SAND | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 PLANT=64 SAND=64 → 结束 AIR=1360 WALL=48 SAND=64 DUST=64；中途曾现: PLANT,SAND,DUST；新: DUST；消失: PLANT；Tmax 20.0°C | **PASS** |  |
| PLANT × SAND | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 PLANT=576 SAND=576 → 结束 AIR=1656 WALL=72 SAND=576 DUST=576；中途曾现: PLANT,SAND,DUST；新: DUST；消失: PLANT；Tmax 20.0°C | **PASS** |  |
| PLANT × SOIL | small | 植物扎根土壤、吸收水分养分而存活（干土则枯萎） | 起始 AIR=1486 WALL=48 PLANT=1 SOIL=1 → 结束 AIR=1486 WALL=48 SOIL=1 DUST=1；中途曾现: PLANT,SOIL,DUST；新: DUST；消失: PLANT；Tmax 20.0°C | **PASS** |  |
| PLANT × SOIL | mid | 植物扎根土壤、吸收水分养分而存活（干土则枯萎） | 起始 AIR=1360 WALL=48 PLANT=64 SOIL=64 → 结束 AIR=1360 WALL=48 SOIL=64 DUST=64；中途曾现: PLANT,SOIL,DUST；新: DUST；消失: PLANT；Tmax 20.0°C | **PASS** |  |
| PLANT × SOIL | large | 植物扎根土壤、吸收水分养分而存活（干土则枯萎） | 起始 AIR=1656 WALL=72 PLANT=576 SOIL=576 → 结束 AIR=1656 WALL=72 SOIL=576 DUST=576；中途曾现: PLANT,SOIL,DUST；新: DUST；消失: PLANT；Tmax 20.0°C | **PASS** |  |
| PLANT × SALT | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 PLANT=1 SALT=1 → 结束 AIR=1486 WALL=48 SALT=1 DUST=1；中途曾现: PLANT,SALT,DUST；新: DUST；消失: PLANT；Tmax 20.0°C | **PASS** |  |
| PLANT × SALT | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 PLANT=64 SALT=64 → 结束 AIR=1360 WALL=48 SALT=64 DUST=64；中途曾现: PLANT,SALT,DUST；新: DUST；消失: PLANT；Tmax 20.0°C | **PASS** |  |
| PLANT × SALT | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 PLANT=576 SALT=576 → 结束 AIR=1656 WALL=72 SALT=576 DUST=576；中途曾现: PLANT,SALT,DUST；新: DUST；消失: PLANT；Tmax 20.0°C | **PASS** |  |
| PLANT × DUST | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 PLANT=1 DUST=1 → 结束 AIR=1486 WALL=48 DUST=2；中途曾现: PLANT,DUST；新: 无；消失: PLANT；Tmax 20.0°C | **PASS** |  |
| PLANT × DUST | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 PLANT=64 DUST=64 → 结束 AIR=1360 WALL=48 DUST=128；中途曾现: PLANT,DUST；新: 无；消失: PLANT；Tmax 20.0°C | **PASS** |  |
| PLANT × DUST | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 PLANT=576 DUST=576 → 结束 AIR=1656 WALL=72 DUST=1152；中途曾现: PLANT,DUST；新: 无；消失: PLANT；Tmax 20.0°C | **PASS** |  |
| PLANT × SNOW | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 PLANT=1 SNOW=1 → 结束 AIR=1486 WALL=48 DUST=2；中途曾现: PLANT,DUST,SNOW,WATER；新: DUST；消失: PLANT,SNOW；Tmax 20.0°C | **PASS** |  |
| PLANT × SNOW | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 PLANT=64 SNOW=64 → 结束 AIR=1350 WALL=48 DUST=77 WATER=61；中途曾现: PLANT,DUST,SNOW,WATER；新: DUST,WATER；消失: PLANT,SNOW；Tmax 20.0°C | **PASS** |  |
| PLANT × SNOW | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 PLANT=576 SNOW=576 → 结束 AIR=1671 WALL=72 DUST=603 WATER=534；中途曾现: PLANT,DUST,SNOW,WATER；新: DUST,WATER；消失: PLANT,SNOW；Tmax 20.0°C | **PASS** |  |
| PLANT × ASH | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 PLANT=1 ASH=1 → 结束 AIR=1486 WALL=48 DUST=1 ASH=1；中途曾现: PLANT,DUST,ASH；新: DUST；消失: PLANT；Tmax 20.0°C | **PASS** |  |
| PLANT × ASH | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 PLANT=64 ASH=64 → 结束 AIR=1360 WALL=48 DUST=64 ASH=64；中途曾现: PLANT,DUST,ASH；新: DUST；消失: PLANT；Tmax 20.0°C | **PASS** |  |
| PLANT × ASH | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 PLANT=576 ASH=576 → 结束 AIR=1656 WALL=72 DUST=576 ASH=576；中途曾现: PLANT,DUST,ASH；新: DUST；消失: PLANT；Tmax 20.0°C | **PASS** |  |
| PLANT × COAL | small | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1486 WALL=48 PLANT=1 COAL=1 → 结束 AIR=1486 WALL=48 DUST=1 COAL=1；中途曾现: PLANT,DUST,COAL；新: DUST；消失: PLANT；Tmax 20.0°C | **N/A** |  |
| PLANT × COAL | mid | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1360 WALL=48 PLANT=64 COAL=64 → 结束 AIR=1360 WALL=48 DUST=64 COAL=64；中途曾现: PLANT,DUST,COAL；新: DUST；消失: PLANT；Tmax 20.0°C | **N/A** |  |
| PLANT × COAL | large | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1656 WALL=72 PLANT=576 COAL=576 → 结束 AIR=1656 WALL=72 DUST=576 COAL=576；中途曾现: PLANT,DUST,COAL；新: DUST；消失: PLANT；Tmax 20.0°C | **N/A** |  |
| PLANT × GUNPOWDER | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 PLANT=1 GUNPOWDER=1 → 结束 AIR=1486 WALL=48 DUST=1 GUNPOWDER=1；中途曾现: PLANT,DUST,GUNPOWDER；新: DUST；消失: PLANT；Tmax 20.0°C | **PASS** |  |
| PLANT × GUNPOWDER | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 PLANT=64 GUNPOWDER=64 → 结束 AIR=1360 WALL=48 DUST=64 GUNPOWDER=64；中途曾现: PLANT,DUST,GUNPOWDER；新: DUST；消失: PLANT；Tmax 20.0°C | **PASS** |  |
| PLANT × GUNPOWDER | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 PLANT=576 GUNPOWDER=576 → 结束 AIR=1656 WALL=72 DUST=576 GUNPOWDER=576；中途曾现: PLANT,DUST,GUNPOWDER；新: DUST；消失: PLANT；Tmax 20.0°C | **PASS** |  |
| PLANT × SEED | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 PLANT=1 SEED=1 → 结束 AIR=1486 WALL=48 DUST=1 SEED=1；中途曾现: PLANT,DUST,SEED；新: DUST；消失: PLANT；Tmax 20.0°C | **PASS** |  |
| PLANT × SEED | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 PLANT=64 SEED=64 → 结束 AIR=1360 WALL=48 DUST=64 SEED=64；中途曾现: PLANT,DUST,SEED；新: DUST；消失: PLANT；Tmax 20.0°C | **PASS** |  |
| PLANT × SEED | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 PLANT=576 SEED=576 → 结束 AIR=1656 WALL=72 DUST=576 SEED=576；中途曾现: PLANT,DUST,SEED；新: DUST；消失: PLANT；Tmax 20.0°C | **PASS** |  |
| PLANT × WATER | small | 植物靠根系从水中汲取水分维持存活与生长 | 起始 AIR=1486 WALL=48 PLANT=1 WATER=1 → 结束 AIR=1486 WALL=48 DUST=1 WATER=1；中途曾现: PLANT,DUST,WATER；新: DUST；消失: PLANT；Tmax 20.0°C | **PASS** | 见不合理清单·植物整株枯死 |
| PLANT × WATER | mid | 植物靠根系从水中汲取水分维持存活与生长 | 起始 AIR=1360 WALL=48 PLANT=64 WATER=64 → 结束 AIR=1351 WALL=48 DUST=81 WATER=56；中途曾现: PLANT,DUST,WATER；新: DUST；消失: PLANT；Tmax 20.0°C | **PASS** | 见不合理清单·植物整株枯死 |
| PLANT × WATER | large | 植物靠根系从水中汲取水分维持存活与生长 | 起始 AIR=1656 WALL=72 PLANT=576 WATER=576 → 结束 AIR=1677 WALL=72 DUST=604 WATER=527；中途曾现: PLANT,DUST,WATER；新: DUST；消失: PLANT；Tmax 20.0°C | **PASS** | 见不合理清单·植物整株枯死 |
| PLANT × OIL | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 PLANT=1 OIL=1 → 结束 AIR=1486 WALL=48 DUST=1 OIL=1；中途曾现: PLANT,DUST,OIL；新: DUST；消失: PLANT；Tmax 20.0°C | **PASS** |  |
| PLANT × OIL | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 PLANT=64 OIL=64 → 结束 AIR=1360 WALL=48 DUST=64 OIL=64；中途曾现: PLANT,DUST,OIL；新: DUST；消失: PLANT；Tmax 20.0°C | **PASS** |  |
| PLANT × OIL | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 PLANT=576 OIL=576 → 结束 AIR=1656 WALL=72 DUST=576 OIL=576；中途曾现: PLANT,DUST,OIL；新: DUST；消失: PLANT；Tmax 20.0°C | **PASS** |  |
| PLANT × LAVA | small | 植物被岩浆点燃并烧毁，岩浆随之凝固 | 起始 AIR=1486 WALL=48 PLANT=1 LAVA=1 → 结束 AIR=1487 WALL=48 STONE=1；中途曾现: STONE,PLANT,LAVA,SMOKE,FIRE；新: STONE；消失: PLANT,LAVA；Tmax 43.0°C | **PASS** |  |
| PLANT × LAVA | mid | 植物被岩浆点燃并烧毁，岩浆随之凝固 | 起始 AIR=1360 WALL=48 PLANT=64 LAVA=64 → 结束 AIR=1369 WALL=48 STONE=64 DUST=55；中途曾现: STONE,PLANT,DUST,ASH,LAVA,SMOKE,FIRE；新: STONE,DUST,ASH；消失: PLANT,LAVA；Tmax 377.0°C | **PASS** |  |
| PLANT × LAVA | large | 植物被岩浆点燃并烧毁，岩浆随之凝固 | 起始 AIR=1656 WALL=72 PLANT=576 LAVA=576 → 结束 AIR=1674 WALL=72 STONE=546 DUST=552 ASH=6 LAVA=30；中途曾现: STONE,PLANT,DUST,ASH,LAVA,SMOKE,FIRE；新: STONE,DUST,ASH；消失: PLANT；Tmax 699.7°C | **PASS** |  |
| PLANT × ACID | small | 酸腐蚀植物组织 | 起始 AIR=1486 WALL=48 PLANT=1 ACID=1 → 结束 AIR=1486 WALL=48 DUST=1 ACID=1；中途曾现: PLANT,DUST,ACID；新: DUST；消失: PLANT；Tmax 20.0°C | **PASS** |  |
| PLANT × ACID | mid | 酸腐蚀植物组织 | 起始 AIR=1360 WALL=48 PLANT=64 ACID=64 → 结束 AIR=1360 WALL=48 DUST=64 ACID=64；中途曾现: PLANT,DUST,ACID；新: DUST；消失: PLANT；Tmax 20.0°C | **PASS** |  |
| PLANT × ACID | large | 酸腐蚀植物组织 | 起始 AIR=1656 WALL=72 PLANT=576 ACID=576 → 结束 AIR=1656 WALL=72 DUST=576 ACID=576；中途曾现: PLANT,DUST,ACID；新: DUST；消失: PLANT；Tmax 20.0°C | **PASS** |  |
| PLANT × LN2 | small | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1486 WALL=48 PLANT=1 LN2=1 → 结束 AIR=1487 WALL=48 DUST=1；中途曾现: PLANT,DUST,LN2；新: DUST；消失: PLANT,LN2；Tmax 20.0°C | **PASS** |  |
| PLANT × LN2 | mid | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1360 WALL=48 PLANT=64 LN2=64 → 结束 AIR=1424 WALL=48 DUST=64；中途曾现: PLANT,DUST,LN2；新: DUST；消失: PLANT,LN2；Tmax 20.0°C | **PASS** |  |
| PLANT × LN2 | large | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1656 WALL=72 PLANT=576 LN2=576 → 结束 AIR=2232 WALL=72 DUST=576；中途曾现: PLANT,DUST,LN2；新: DUST；消失: PLANT,LN2；Tmax 20.0°C | **PASS** |  |
| PLANT × STEAM | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 PLANT=1 STEAM=1 → 结束 AIR=1487 WALL=48 DUST=1；中途曾现: PLANT,DUST,STEAM；新: DUST；消失: PLANT,STEAM；Tmax 20.0°C | **PASS** |  |
| PLANT × STEAM | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 PLANT=64 STEAM=64 → 结束 AIR=1404 WALL=48 DUST=76 WATER=8；中途曾现: PLANT,DUST,WATER,STEAM；新: DUST,WATER；消失: PLANT,STEAM；Tmax 20.0°C | **PASS** |  |
| PLANT × STEAM | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 PLANT=576 STEAM=576 → 结束 AIR=2055 WALL=72 DUST=576 WATER=177；中途曾现: PLANT,DUST,WATER,STEAM；新: DUST,WATER；消失: PLANT,STEAM；Tmax 20.0°C | **PASS** |  |
| PLANT × SMOKE | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 PLANT=1 SMOKE=1 → 结束 AIR=1487 WALL=48 DUST=1；中途曾现: PLANT,DUST,SMOKE；新: DUST；消失: PLANT,SMOKE；Tmax 20.0°C | **PASS** |  |
| PLANT × SMOKE | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 PLANT=64 SMOKE=64 → 结束 AIR=1424 WALL=48 DUST=64；中途曾现: PLANT,DUST,SMOKE；新: DUST；消失: PLANT,SMOKE；Tmax 20.0°C | **PASS** |  |
| PLANT × SMOKE | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 PLANT=576 SMOKE=576 → 结束 AIR=2232 WALL=72 DUST=576；中途曾现: PLANT,DUST,SMOKE；新: DUST；消失: PLANT,SMOKE；Tmax 20.0°C | **PASS** |  |
| PLANT × FIRE | small | 活体湿植物不易燃、通常先失水枯萎；只有干枯部分才容易被点燃 | 起始 AIR=1486 WALL=48 PLANT=1 FIRE=1 → 结束 AIR=1487 WALL=48 DUST=1；中途曾现: PLANT,DUST,FIRE；新: DUST；消失: PLANT,FIRE；Tmax 20.2°C | **PASS** |  |
| PLANT × FIRE | mid | 活体湿植物不易燃、通常先失水枯萎；只有干枯部分才容易被点燃 | 起始 AIR=1360 WALL=48 PLANT=64 FIRE=64 → 结束 AIR=1426 WALL=48 DUST=62；中途曾现: PLANT,DUST,SMOKE,FIRE；新: DUST；消失: PLANT,FIRE；Tmax 24.1°C | **PASS** |  |
| PLANT × FIRE | large | 活体湿植物不易燃、通常先失水枯萎；只有干枯部分才容易被点燃 | 起始 AIR=1656 WALL=72 PLANT=576 FIRE=576 → 结束 AIR=2234 WALL=72 DUST=574；中途曾现: PLANT,DUST,SMOKE,FIRE；新: DUST；消失: PLANT,FIRE；Tmax 60.0°C | **PASS** |  |
| PLANT × GAS | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 PLANT=1 GAS=1 → 结束 AIR=1487 WALL=48 DUST=1；中途曾现: PLANT,DUST,GAS；新: DUST；消失: PLANT,GAS；Tmax 20.0°C | **PASS** |  |
| PLANT × GAS | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 PLANT=64 GAS=64 → 结束 AIR=1424 WALL=48 DUST=64；中途曾现: PLANT,DUST,GAS；新: DUST；消失: PLANT,GAS；Tmax 20.0°C | **PASS** |  |
| PLANT × GAS | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 PLANT=576 GAS=576 → 结束 AIR=2232 WALL=72 DUST=576；中途曾现: PLANT,DUST,GAS；新: DUST；消失: PLANT,GAS；Tmax 20.0°C | **PASS** |  |
| PLANT × CLONE | small | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1486 WALL=48 PLANT=1 CLONE=1 → 结束 AIR=1480 WALL=48 DUST=7 CLONE=1；中途曾现: PLANT,DUST,CLONE；新: DUST；消失: PLANT；Tmax 20.0°C | **N/A** |  |
| PLANT × CLONE | mid | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1360 WALL=48 PLANT=64 CLONE=64 → 结束 AIR=1306 WALL=48 DUST=118 CLONE=64；中途曾现: PLANT,DUST,CLONE；新: DUST；消失: PLANT；Tmax 20.0°C | **N/A** |  |
| PLANT × CLONE | large | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1656 WALL=72 PLANT=576 CLONE=576 → 结束 AIR=1397 WALL=72 DUST=835 CLONE=576；中途曾现: PLANT,DUST,CLONE；新: DUST；消失: PLANT；Tmax 20.0°C | **N/A** |  |
| PLANT × VIRUS | small | 病毒感染并摧毁植物（植物→病毒） | 起始 AIR=1486 WALL=48 PLANT=1 VIRUS=1 → 结束 AIR=1486 WALL=48 VIRUS=2；中途曾现: PLANT,VIRUS；新: 无；消失: PLANT；Tmax 20.0°C | **PASS** |  |
| PLANT × VIRUS | mid | 病毒感染并摧毁植物（植物→病毒） | 起始 AIR=1360 WALL=48 PLANT=64 VIRUS=64 → 结束 AIR=1360 WALL=48 VIRUS=128；中途曾现: PLANT,VIRUS；新: 无；消失: PLANT；Tmax 20.0°C | **PASS** |  |
| PLANT × VIRUS | large | 病毒感染并摧毁植物（植物→病毒） | 起始 AIR=1656 WALL=72 PLANT=576 VIRUS=576 → 结束 AIR=1656 WALL=72 DUST=385 VIRUS=767；中途曾现: PLANT,DUST,VIRUS；新: DUST；消失: PLANT；Tmax 20.0°C | **PASS** |  |
| PLANT × SPRING | small | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1486 WALL=48 PLANT=1 SPRING=1 → 结束 AIR=1416 WALL=48 PLANT=19 WATER=52 SPRING=1；中途曾现: PLANT,WATER,SPRING；新: WATER；消失: 无；Tmax 20.0°C | **N/A** |  |
| PLANT × SPRING | mid | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1360 WALL=48 PLANT=64 SPRING=64 → 结束 AIR=1211 WALL=48 DUST=68 WATER=145 SPRING=64；中途曾现: PLANT,DUST,WATER,SPRING；新: DUST,WATER；消失: PLANT；Tmax 20.0°C | **N/A** |  |
| PLANT × SPRING | large | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1656 WALL=72 PLANT=576 SPRING=576 → 结束 AIR=1327 WALL=72 DUST=577 WATER=328 SPRING=576；中途曾现: PLANT,DUST,WATER,SPRING；新: DUST,WATER；消失: PLANT；Tmax 20.0°C | **N/A** |  |
| PLANT × TNT | small | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1486 WALL=48 PLANT=1 TNT=1 → 结束 AIR=1486 WALL=48 DUST=1 TNT=1；中途曾现: PLANT,DUST,TNT；新: DUST；消失: PLANT；Tmax 20.0°C | **N/A** |  |
| PLANT × TNT | mid | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1360 WALL=48 PLANT=64 TNT=64 → 结束 AIR=1360 WALL=48 DUST=64 TNT=64；中途曾现: PLANT,DUST,TNT；新: DUST；消失: PLANT；Tmax 20.0°C | **N/A** |  |
| PLANT × TNT | large | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1656 WALL=72 PLANT=576 TNT=576 → 结束 AIR=1656 WALL=72 DUST=576 TNT=576；中途曾现: PLANT,DUST,TNT；新: DUST；消失: PLANT；Tmax 20.0°C | **N/A** |  |
| SAND × SAND | small | 同种物质相邻：自然堆叠/流动/相变，无化学变化 | 起始 AIR=1487 WALL=48 SAND=1 → 结束 AIR=1487 WALL=48 SAND=1；中途曾现: SAND；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| SAND × SAND | mid | 同种物质相邻：自然堆叠/流动/相变，无化学变化 | 起始 AIR=1424 WALL=48 SAND=64 → 结束 AIR=1424 WALL=48 SAND=64；中途曾现: SAND；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| SAND × SAND | large | 同种物质相邻：自然堆叠/流动/相变，无化学变化 | 起始 AIR=2232 WALL=72 SAND=576 → 结束 AIR=2232 WALL=72 SAND=576；中途曾现: SAND；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| SAND × SOIL | small | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1486 WALL=48 SAND=1 SOIL=1 → 结束 AIR=1486 WALL=48 SAND=1 SOIL=1；中途曾现: SAND,SOIL；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SAND × SOIL | mid | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1360 WALL=48 SAND=64 SOIL=64 → 结束 AIR=1360 WALL=48 SAND=64 SOIL=64；中途曾现: SAND,SOIL；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SAND × SOIL | large | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1656 WALL=72 SAND=576 SOIL=576 → 结束 AIR=1656 WALL=72 SAND=576 SOIL=576；中途曾现: SAND,SOIL；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SAND × SALT | small | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1486 WALL=48 SAND=1 SALT=1 → 结束 AIR=1486 WALL=48 SAND=1 SALT=1；中途曾现: SAND,SALT；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SAND × SALT | mid | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1360 WALL=48 SAND=64 SALT=64 → 结束 AIR=1360 WALL=48 SAND=64 SALT=64；中途曾现: SAND,SALT；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SAND × SALT | large | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1656 WALL=72 SAND=576 SALT=576 → 结束 AIR=1656 WALL=72 SAND=576 SALT=576；中途曾现: SAND,SALT；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SAND × DUST | small | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1486 WALL=48 SAND=1 DUST=1 → 结束 AIR=1486 WALL=48 SAND=1 DUST=1；中途曾现: SAND,DUST；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SAND × DUST | mid | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1360 WALL=48 SAND=64 DUST=64 → 结束 AIR=1360 WALL=48 SAND=64 DUST=64；中途曾现: SAND,DUST；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SAND × DUST | large | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1656 WALL=72 SAND=576 DUST=576 → 结束 AIR=1656 WALL=72 SAND=576 DUST=576；中途曾现: SAND,DUST；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SAND × SNOW | small | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1486 WALL=48 SAND=1 SNOW=1 → 结束 AIR=1486 WALL=48 SAND=1 WATER=1；中途曾现: SAND,SNOW,WATER；新: WATER；消失: SNOW；Tmax 20.0°C | **PASS** |  |
| SAND × SNOW | mid | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1360 WALL=48 SAND=64 SNOW=64 → 结束 AIR=1360 WALL=48 SAND=64 WATER=64；中途曾现: SAND,SNOW,WATER；新: WATER；消失: SNOW；Tmax 20.0°C | **PASS** |  |
| SAND × SNOW | large | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1656 WALL=72 SAND=576 SNOW=576 → 结束 AIR=1656 WALL=72 SAND=576 WATER=576；中途曾现: SAND,SNOW,WATER；新: WATER；消失: SNOW；Tmax 20.0°C | **PASS** |  |
| SAND × ASH | small | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1486 WALL=48 SAND=1 ASH=1 → 结束 AIR=1486 WALL=48 SAND=1 ASH=1；中途曾现: SAND,ASH；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SAND × ASH | mid | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1360 WALL=48 SAND=64 ASH=64 → 结束 AIR=1360 WALL=48 SAND=64 ASH=64；中途曾现: SAND,ASH；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SAND × ASH | large | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1656 WALL=72 SAND=576 ASH=576 → 结束 AIR=1656 WALL=72 SAND=576 ASH=576；中途曾现: SAND,ASH；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SAND × COAL | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 SAND=1 COAL=1 → 结束 AIR=1486 WALL=48 SAND=1 COAL=1；中途曾现: SAND,COAL；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SAND × COAL | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 SAND=64 COAL=64 → 结束 AIR=1360 WALL=48 SAND=64 COAL=64；中途曾现: SAND,COAL；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SAND × COAL | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 SAND=576 COAL=576 → 结束 AIR=1656 WALL=72 SAND=576 COAL=576；中途曾现: SAND,COAL；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SAND × GUNPOWDER | small | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1486 WALL=48 SAND=1 GUNPOWDER=1 → 结束 AIR=1486 WALL=48 SAND=1 GUNPOWDER=1；中途曾现: SAND,GUNPOWDER；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SAND × GUNPOWDER | mid | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1360 WALL=48 SAND=64 GUNPOWDER=64 → 结束 AIR=1360 WALL=48 SAND=64 GUNPOWDER=64；中途曾现: SAND,GUNPOWDER；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SAND × GUNPOWDER | large | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1656 WALL=72 SAND=576 GUNPOWDER=576 → 结束 AIR=1656 WALL=72 SAND=576 GUNPOWDER=576；中途曾现: SAND,GUNPOWDER；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SAND × SEED | small | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1486 WALL=48 SAND=1 SEED=1 → 结束 AIR=1486 WALL=48 SAND=1 SEED=1；中途曾现: SAND,SEED；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SAND × SEED | mid | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1360 WALL=48 SAND=64 SEED=64 → 结束 AIR=1360 WALL=48 SAND=64 SEED=64；中途曾现: SAND,SEED；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SAND × SEED | large | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1656 WALL=72 SAND=576 SEED=576 → 结束 AIR=1656 WALL=72 SAND=576 SEED=576；中途曾现: SAND,SEED；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SAND × WATER | small | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1486 WALL=48 SAND=1 WATER=1 → 结束 AIR=1486 WALL=48 SAND=1 WATER=1；中途曾现: SAND,WATER；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SAND × WATER | mid | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1360 WALL=48 SAND=64 WATER=64 → 结束 AIR=1360 WALL=48 SAND=64 WATER=64；中途曾现: SAND,WATER；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SAND × WATER | large | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1656 WALL=72 SAND=576 WATER=576 → 结束 AIR=1656 WALL=72 SAND=576 WATER=576；中途曾现: SAND,WATER；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SAND × OIL | small | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1486 WALL=48 SAND=1 OIL=1 → 结束 AIR=1486 WALL=48 SAND=1 OIL=1；中途曾现: SAND,OIL；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SAND × OIL | mid | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1360 WALL=48 SAND=64 OIL=64 → 结束 AIR=1360 WALL=48 SAND=64 OIL=64；中途曾现: SAND,OIL；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SAND × OIL | large | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1656 WALL=72 SAND=576 OIL=576 → 结束 AIR=1656 WALL=72 SAND=576 OIL=576；中途曾现: SAND,OIL；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SAND × LAVA | small | 沙可被高温熔成玻璃（石英熔点约 1713°C） | 起始 AIR=1486 WALL=48 SAND=1 LAVA=1 → 结束 AIR=1486 WALL=48 STONE=1 SAND=1；中途曾现: STONE,SAND,LAVA；新: STONE；消失: LAVA；Tmax 40.6°C | **PASS** | 见不合理清单·沙→玻璃链不可达 |
| SAND × LAVA | mid | 沙可被高温熔成玻璃（石英熔点约 1713°C） | 起始 AIR=1360 WALL=48 SAND=64 LAVA=64 → 结束 AIR=1360 WALL=48 STONE=64 SAND=64；中途曾现: STONE,SAND,LAVA；新: STONE；消失: LAVA；Tmax 276.4°C | **PASS** | 见不合理清单·沙→玻璃链不可达 |
| SAND × LAVA | large | 沙可被高温熔成玻璃（石英熔点约 1713°C） | 起始 AIR=1656 WALL=72 SAND=576 LAVA=576 → 结束 AIR=1656 WALL=72 STONE=553 SAND=576 LAVA=23；中途曾现: STONE,SAND,LAVA；新: STONE；消失: 无；Tmax 699.7°C | **PASS** | 见不合理清单·沙→玻璃链不可达 |
| SAND × ACID | small | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1486 WALL=48 SAND=1 ACID=1 → 结束 AIR=1486 WALL=48 SAND=1 ACID=1；中途曾现: SAND,ACID；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SAND × ACID | mid | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1360 WALL=48 SAND=64 ACID=64 → 结束 AIR=1360 WALL=48 SAND=64 ACID=64；中途曾现: SAND,ACID；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SAND × ACID | large | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1656 WALL=72 SAND=576 ACID=576 → 结束 AIR=1656 WALL=72 SAND=576 ACID=576；中途曾现: SAND,ACID；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SAND × LN2 | small | 热/冷源相邻：对侧发生相变（熔/凝/沸/冻） | 起始 AIR=1486 WALL=48 SAND=1 LN2=1 → 结束 AIR=1487 WALL=48 SAND=1；中途曾现: SAND,LN2；新: 无；消失: LN2；Tmax 20.0°C | **PASS** |  |
| SAND × LN2 | mid | 热/冷源相邻：对侧发生相变（熔/凝/沸/冻） | 起始 AIR=1360 WALL=48 SAND=64 LN2=64 → 结束 AIR=1424 WALL=48 SAND=64；中途曾现: SAND,LN2；新: 无；消失: LN2；Tmax 20.0°C | **PASS** |  |
| SAND × LN2 | large | 热/冷源相邻：对侧发生相变（熔/凝/沸/冻） | 起始 AIR=1656 WALL=72 SAND=576 LN2=576 → 结束 AIR=2232 WALL=72 SAND=576；中途曾现: SAND,LN2；新: 无；消失: LN2；Tmax 20.0°C | **PASS** |  |
| SAND × STEAM | small | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1486 WALL=48 SAND=1 STEAM=1 → 结束 AIR=1487 WALL=48 SAND=1；中途曾现: SAND,STEAM；新: 无；消失: STEAM；Tmax 20.0°C | **PASS** |  |
| SAND × STEAM | mid | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1360 WALL=48 SAND=64 STEAM=64 → 结束 AIR=1414 WALL=48 SAND=64 WATER=10；中途曾现: SAND,WATER,STEAM；新: WATER；消失: STEAM；Tmax 20.0°C | **PASS** |  |
| SAND × STEAM | large | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1656 WALL=72 SAND=576 STEAM=576 → 结束 AIR=2068 WALL=72 SAND=576 WATER=164；中途曾现: SAND,WATER,STEAM；新: WATER；消失: STEAM；Tmax 20.0°C | **PASS** |  |
| SAND × SMOKE | small | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1486 WALL=48 SAND=1 SMOKE=1 → 结束 AIR=1487 WALL=48 SAND=1；中途曾现: SAND,SMOKE；新: 无；消失: SMOKE；Tmax 20.0°C | **PASS** |  |
| SAND × SMOKE | mid | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1360 WALL=48 SAND=64 SMOKE=64 → 结束 AIR=1424 WALL=48 SAND=64；中途曾现: SAND,SMOKE；新: 无；消失: SMOKE；Tmax 20.0°C | **PASS** |  |
| SAND × SMOKE | large | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1656 WALL=72 SAND=576 SMOKE=576 → 结束 AIR=2232 WALL=72 SAND=576；中途曾现: SAND,SMOKE；新: 无；消失: SMOKE；Tmax 20.0°C | **PASS** |  |
| SAND × FIRE | small | 热/冷源相邻：对侧发生相变（熔/凝/沸/冻） | 起始 AIR=1486 WALL=48 SAND=1 FIRE=1 → 结束 AIR=1487 WALL=48 SAND=1；中途曾现: SAND,FIRE；新: 无；消失: FIRE；Tmax 20.2°C | **PASS** |  |
| SAND × FIRE | mid | 热/冷源相邻：对侧发生相变（熔/凝/沸/冻） | 起始 AIR=1360 WALL=48 SAND=64 FIRE=64 → 结束 AIR=1424 WALL=48 SAND=64；中途曾现: SAND,SMOKE,FIRE；新: 无；消失: FIRE；Tmax 22.1°C | **PASS** |  |
| SAND × FIRE | large | 热/冷源相邻：对侧发生相变（熔/凝/沸/冻） | 起始 AIR=1656 WALL=72 SAND=576 FIRE=576 → 结束 AIR=2232 WALL=72 SAND=576；中途曾现: SAND,SMOKE,FIRE；新: 无；消失: FIRE；Tmax 57.6°C | **PASS** |  |
| SAND × GAS | small | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1486 WALL=48 SAND=1 GAS=1 → 结束 AIR=1487 WALL=48 SAND=1；中途曾现: SAND,GAS；新: 无；消失: GAS；Tmax 20.0°C | **PASS** |  |
| SAND × GAS | mid | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1360 WALL=48 SAND=64 GAS=64 → 结束 AIR=1424 WALL=48 SAND=64；中途曾现: SAND,GAS；新: 无；消失: GAS；Tmax 20.0°C | **PASS** |  |
| SAND × GAS | large | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1656 WALL=72 SAND=576 GAS=576 → 结束 AIR=2232 WALL=72 SAND=576；中途曾现: SAND,GAS；新: 无；消失: GAS；Tmax 20.0°C | **PASS** |  |
| SAND × CLONE | small | （科幻机制）克隆体复制相邻的可移动物质，使其数量增加 | 起始 AIR=1486 WALL=48 SAND=1 CLONE=1 → 结束 AIR=1480 WALL=48 SAND=7 CLONE=1；中途曾现: SAND,CLONE；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SAND × CLONE | mid | （科幻机制）克隆体复制相邻的可移动物质，使其数量增加 | 起始 AIR=1360 WALL=48 SAND=64 CLONE=64 → 结束 AIR=1306 WALL=48 SAND=118 CLONE=64；中途曾现: SAND,CLONE；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SAND × CLONE | large | （科幻机制）克隆体复制相邻的可移动物质，使其数量增加 | 起始 AIR=1656 WALL=72 SAND=576 CLONE=576 → 结束 AIR=1397 WALL=72 SAND=835 CLONE=576；中途曾现: SAND,CLONE；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SAND × VIRUS | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 SAND=1 VIRUS=1 → 结束 AIR=1486 WALL=48 SAND=1 VIRUS=1；中途曾现: SAND,VIRUS；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SAND × VIRUS | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 SAND=64 VIRUS=64 → 结束 AIR=1360 WALL=48 SAND=64 VIRUS=64；中途曾现: SAND,VIRUS；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SAND × VIRUS | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 SAND=576 VIRUS=576 → 结束 AIR=1656 WALL=72 SAND=576 VIRUS=576；中途曾现: SAND,VIRUS；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SAND × SPRING | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 SAND=1 SPRING=1 → 结束 AIR=1398 WALL=48 SAND=1 WATER=88 SPRING=1；中途曾现: SAND,WATER,SPRING；新: WATER；消失: 无；Tmax 20.0°C | **PASS** |  |
| SAND × SPRING | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 SAND=64 SPRING=64 → 结束 AIR=1057 WALL=48 SAND=64 WATER=303 SPRING=64；中途曾现: SAND,WATER,SPRING；新: WATER；消失: 无；Tmax 20.0°C | **PASS** |  |
| SAND × SPRING | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 SAND=576 SPRING=576 → 结束 AIR=1198 WALL=72 SAND=576 WATER=458 SPRING=576；中途曾现: SAND,WATER,SPRING；新: WATER；消失: 无；Tmax 20.0°C | **PASS** |  |
| SAND × TNT | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 SAND=1 TNT=1 → 结束 AIR=1486 WALL=48 SAND=1 TNT=1；中途曾现: SAND,TNT；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SAND × TNT | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 SAND=64 TNT=64 → 结束 AIR=1360 WALL=48 SAND=64 TNT=64；中途曾现: SAND,TNT；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SAND × TNT | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 SAND=576 TNT=576 → 结束 AIR=1656 WALL=72 SAND=576 TNT=576；中途曾现: SAND,TNT；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SOIL × SOIL | small | 同种物质相邻：自然堆叠/流动/相变，无化学变化 | 起始 AIR=1487 WALL=48 SOIL=1 → 结束 AIR=1487 WALL=48 SOIL=1；中途曾现: SOIL；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| SOIL × SOIL | mid | 同种物质相邻：自然堆叠/流动/相变，无化学变化 | 起始 AIR=1424 WALL=48 SOIL=64 → 结束 AIR=1424 WALL=48 SOIL=64；中途曾现: SOIL；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| SOIL × SOIL | large | 同种物质相邻：自然堆叠/流动/相变，无化学变化 | 起始 AIR=2232 WALL=72 SOIL=576 → 结束 AIR=2232 WALL=72 SOIL=576；中途曾现: SOIL；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| SOIL × SALT | small | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1486 WALL=48 SOIL=1 SALT=1 → 结束 AIR=1486 WALL=48 SOIL=1 SALT=1；中途曾现: SOIL,SALT；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SOIL × SALT | mid | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1360 WALL=48 SOIL=64 SALT=64 → 结束 AIR=1360 WALL=48 SOIL=64 SALT=64；中途曾现: SOIL,SALT；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SOIL × SALT | large | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1656 WALL=72 SOIL=576 SALT=576 → 结束 AIR=1656 WALL=72 SOIL=576 SALT=576；中途曾现: SOIL,SALT；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SOIL × DUST | small | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1486 WALL=48 SOIL=1 DUST=1 → 结束 AIR=1486 WALL=48 SOIL=1 DUST=1；中途曾现: SOIL,DUST；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SOIL × DUST | mid | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1360 WALL=48 SOIL=64 DUST=64 → 结束 AIR=1360 WALL=48 SOIL=64 DUST=64；中途曾现: SOIL,DUST；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SOIL × DUST | large | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1656 WALL=72 SOIL=576 DUST=576 → 结束 AIR=1656 WALL=72 SOIL=576 DUST=576；中途曾现: SOIL,DUST；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SOIL × SNOW | small | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1486 WALL=48 SOIL=1 SNOW=1 → 结束 AIR=1486 WALL=48 SOIL=1 WATER=1；中途曾现: SOIL,SNOW,WATER；新: WATER；消失: SNOW；Tmax 20.0°C | **PASS** |  |
| SOIL × SNOW | mid | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1360 WALL=48 SOIL=64 SNOW=64 → 结束 AIR=1360 WALL=48 SOIL=64 WATER=64；中途曾现: SOIL,SNOW,WATER；新: WATER；消失: SNOW；Tmax 20.0°C | **PASS** |  |
| SOIL × SNOW | large | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1656 WALL=72 SOIL=576 SNOW=576 → 结束 AIR=1656 WALL=72 SOIL=576 WATER=576；中途曾现: SOIL,SNOW,WATER；新: WATER；消失: SNOW；Tmax 20.0°C | **PASS** |  |
| SOIL × ASH | small | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1486 WALL=48 SOIL=1 ASH=1 → 结束 AIR=1486 WALL=48 SOIL=1 ASH=1；中途曾现: SOIL,ASH；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SOIL × ASH | mid | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1360 WALL=48 SOIL=64 ASH=64 → 结束 AIR=1360 WALL=48 SOIL=64 ASH=64；中途曾现: SOIL,ASH；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SOIL × ASH | large | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1656 WALL=72 SOIL=576 ASH=576 → 结束 AIR=1656 WALL=72 SOIL=576 ASH=576；中途曾现: SOIL,ASH；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SOIL × COAL | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 SOIL=1 COAL=1 → 结束 AIR=1486 WALL=48 SOIL=1 COAL=1；中途曾现: SOIL,COAL；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SOIL × COAL | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 SOIL=64 COAL=64 → 结束 AIR=1360 WALL=48 SOIL=64 COAL=64；中途曾现: SOIL,COAL；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SOIL × COAL | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 SOIL=576 COAL=576 → 结束 AIR=1656 WALL=72 SOIL=576 COAL=576；中途曾现: SOIL,COAL；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SOIL × GUNPOWDER | small | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1486 WALL=48 SOIL=1 GUNPOWDER=1 → 结束 AIR=1486 WALL=48 SOIL=1 GUNPOWDER=1；中途曾现: SOIL,GUNPOWDER；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SOIL × GUNPOWDER | mid | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1360 WALL=48 SOIL=64 GUNPOWDER=64 → 结束 AIR=1360 WALL=48 SOIL=64 GUNPOWDER=64；中途曾现: SOIL,GUNPOWDER；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SOIL × GUNPOWDER | large | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1656 WALL=72 SOIL=576 GUNPOWDER=576 → 结束 AIR=1656 WALL=72 SOIL=576 GUNPOWDER=576；中途曾现: SOIL,GUNPOWDER；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SOIL × SEED | small | 种子落在湿润的土壤上才发芽；干土不发芽 | 起始 AIR=1486 WALL=48 SOIL=1 SEED=1 → 结束 AIR=1486 WALL=48 SOIL=1 SEED=1；中途曾现: SOIL,SEED；新: 无；消失: 无；Tmax 20.0°C | **PASS** | 干土不提供水分 → 不发芽属预期 |
| SOIL × SEED | mid | 种子落在湿润的土壤上才发芽；干土不发芽 | 起始 AIR=1360 WALL=48 SOIL=64 SEED=64 → 结束 AIR=1360 WALL=48 SOIL=64 SEED=64；中途曾现: SOIL,SEED；新: 无；消失: 无；Tmax 20.0°C | **PASS** | 干土不提供水分 → 不发芽属预期 |
| SOIL × SEED | large | 种子落在湿润的土壤上才发芽；干土不发芽 | 起始 AIR=1656 WALL=72 SOIL=576 SEED=576 → 结束 AIR=1656 WALL=72 SOIL=576 SEED=576；中途曾现: SOIL,SEED；新: 无；消失: 无；Tmax 20.0°C | **PASS** | 干土不提供水分 → 不发芽属预期 |
| SOIL × WATER | small | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1486 WALL=48 SOIL=1 WATER=1 → 结束 AIR=1486 WALL=48 SOIL=1 WATER=1；中途曾现: SOIL,WATER；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SOIL × WATER | mid | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1360 WALL=48 SOIL=64 WATER=64 → 结束 AIR=1360 WALL=48 SOIL=64 WATER=64；中途曾现: SOIL,WATER；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SOIL × WATER | large | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1656 WALL=72 SOIL=576 WATER=576 → 结束 AIR=1656 WALL=72 SOIL=576 WATER=576；中途曾现: SOIL,WATER；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SOIL × OIL | small | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1486 WALL=48 SOIL=1 OIL=1 → 结束 AIR=1486 WALL=48 SOIL=1 OIL=1；中途曾现: SOIL,OIL；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SOIL × OIL | mid | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1360 WALL=48 SOIL=64 OIL=64 → 结束 AIR=1360 WALL=48 SOIL=64 OIL=64；中途曾现: SOIL,OIL；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SOIL × OIL | large | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1656 WALL=72 SOIL=576 OIL=576 → 结束 AIR=1656 WALL=72 SOIL=576 OIL=576；中途曾现: SOIL,OIL；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SOIL × LAVA | small | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1486 WALL=48 SOIL=1 LAVA=1 → 结束 AIR=1486 WALL=48 STONE=1 SOIL=1；中途曾现: STONE,SOIL,LAVA；新: STONE；消失: LAVA；Tmax 40.6°C | **PASS** |  |
| SOIL × LAVA | mid | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1360 WALL=48 SOIL=64 LAVA=64 → 结束 AIR=1360 WALL=48 STONE=64 SOIL=64；中途曾现: STONE,SOIL,LAVA；新: STONE；消失: LAVA；Tmax 287.9°C | **PASS** |  |
| SOIL × LAVA | large | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1656 WALL=72 SOIL=576 LAVA=576 → 结束 AIR=1656 WALL=72 STONE=554 SOIL=576 LAVA=22；中途曾现: STONE,SOIL,LAVA；新: STONE；消失: 无；Tmax 699.7°C | **PASS** |  |
| SOIL × ACID | small | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1486 WALL=48 SOIL=1 ACID=1 → 结束 AIR=1486 WALL=48 SOIL=1 ACID=1；中途曾现: SOIL,ACID；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SOIL × ACID | mid | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1360 WALL=48 SOIL=64 ACID=64 → 结束 AIR=1360 WALL=48 SOIL=64 ACID=64；中途曾现: SOIL,ACID；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SOIL × ACID | large | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1656 WALL=72 SOIL=576 ACID=576 → 结束 AIR=1656 WALL=72 SOIL=576 ACID=576；中途曾现: SOIL,ACID；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SOIL × LN2 | small | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1486 WALL=48 SOIL=1 LN2=1 → 结束 AIR=1487 WALL=48 SOIL=1；中途曾现: SOIL,LN2；新: 无；消失: LN2；Tmax 20.0°C | **PASS** |  |
| SOIL × LN2 | mid | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1360 WALL=48 SOIL=64 LN2=64 → 结束 AIR=1424 WALL=48 SOIL=64；中途曾现: SOIL,LN2；新: 无；消失: LN2；Tmax 20.0°C | **PASS** |  |
| SOIL × LN2 | large | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1656 WALL=72 SOIL=576 LN2=576 → 结束 AIR=2232 WALL=72 SOIL=576；中途曾现: SOIL,LN2；新: 无；消失: LN2；Tmax 20.0°C | **PASS** |  |
| SOIL × STEAM | small | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1486 WALL=48 SOIL=1 STEAM=1 → 结束 AIR=1487 WALL=48 SOIL=1；中途曾现: SOIL,STEAM；新: 无；消失: STEAM；Tmax 20.0°C | **PASS** |  |
| SOIL × STEAM | mid | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1360 WALL=48 SOIL=64 STEAM=64 → 结束 AIR=1415 WALL=48 SOIL=64 WATER=9；中途曾现: SOIL,WATER,STEAM；新: WATER；消失: STEAM；Tmax 20.0°C | **PASS** |  |
| SOIL × STEAM | large | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1656 WALL=72 SOIL=576 STEAM=576 → 结束 AIR=2056 WALL=72 SOIL=576 WATER=176；中途曾现: SOIL,WATER,STEAM；新: WATER；消失: STEAM；Tmax 20.0°C | **PASS** |  |
| SOIL × SMOKE | small | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1486 WALL=48 SOIL=1 SMOKE=1 → 结束 AIR=1487 WALL=48 SOIL=1；中途曾现: SOIL,SMOKE；新: 无；消失: SMOKE；Tmax 20.0°C | **PASS** |  |
| SOIL × SMOKE | mid | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1360 WALL=48 SOIL=64 SMOKE=64 → 结束 AIR=1424 WALL=48 SOIL=64；中途曾现: SOIL,SMOKE；新: 无；消失: SMOKE；Tmax 20.0°C | **PASS** |  |
| SOIL × SMOKE | large | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1656 WALL=72 SOIL=576 SMOKE=576 → 结束 AIR=2232 WALL=72 SOIL=576；中途曾现: SOIL,SMOKE；新: 无；消失: SMOKE；Tmax 20.0°C | **PASS** |  |
| SOIL × FIRE | small | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1486 WALL=48 SOIL=1 FIRE=1 → 结束 AIR=1487 WALL=48 SOIL=1；中途曾现: SOIL,FIRE；新: 无；消失: FIRE；Tmax 20.2°C | **PASS** |  |
| SOIL × FIRE | mid | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1360 WALL=48 SOIL=64 FIRE=64 → 结束 AIR=1424 WALL=48 SOIL=64；中途曾现: SOIL,SMOKE,FIRE；新: 无；消失: FIRE；Tmax 22.5°C | **PASS** |  |
| SOIL × FIRE | large | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1656 WALL=72 SOIL=576 FIRE=576 → 结束 AIR=2232 WALL=72 SOIL=576；中途曾现: SOIL,SMOKE,FIRE；新: 无；消失: FIRE；Tmax 55.4°C | **PASS** |  |
| SOIL × GAS | small | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1486 WALL=48 SOIL=1 GAS=1 → 结束 AIR=1487 WALL=48 SOIL=1；中途曾现: SOIL,GAS；新: 无；消失: GAS；Tmax 20.0°C | **PASS** |  |
| SOIL × GAS | mid | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1360 WALL=48 SOIL=64 GAS=64 → 结束 AIR=1424 WALL=48 SOIL=64；中途曾现: SOIL,GAS；新: 无；消失: GAS；Tmax 20.0°C | **PASS** |  |
| SOIL × GAS | large | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1656 WALL=72 SOIL=576 GAS=576 → 结束 AIR=2232 WALL=72 SOIL=576；中途曾现: SOIL,GAS；新: 无；消失: GAS；Tmax 20.0°C | **PASS** |  |
| SOIL × CLONE | small | （科幻机制）克隆体复制相邻的可移动物质，使其数量增加 | 起始 AIR=1486 WALL=48 SOIL=1 CLONE=1 → 结束 AIR=1480 WALL=48 SOIL=7 CLONE=1；中途曾现: SOIL,CLONE；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SOIL × CLONE | mid | （科幻机制）克隆体复制相邻的可移动物质，使其数量增加 | 起始 AIR=1360 WALL=48 SOIL=64 CLONE=64 → 结束 AIR=1306 WALL=48 SOIL=118 CLONE=64；中途曾现: SOIL,CLONE；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SOIL × CLONE | large | （科幻机制）克隆体复制相邻的可移动物质，使其数量增加 | 起始 AIR=1656 WALL=72 SOIL=576 CLONE=576 → 结束 AIR=1397 WALL=72 SOIL=835 CLONE=576；中途曾现: SOIL,CLONE；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SOIL × VIRUS | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 SOIL=1 VIRUS=1 → 结束 AIR=1486 WALL=48 SOIL=1 VIRUS=1；中途曾现: SOIL,VIRUS；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SOIL × VIRUS | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 SOIL=64 VIRUS=64 → 结束 AIR=1360 WALL=48 SOIL=64 VIRUS=64；中途曾现: SOIL,VIRUS；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SOIL × VIRUS | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 SOIL=576 VIRUS=576 → 结束 AIR=1656 WALL=72 SOIL=576 VIRUS=576；中途曾现: SOIL,VIRUS；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SOIL × SPRING | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 SOIL=1 SPRING=1 → 结束 AIR=1398 WALL=48 SOIL=1 WATER=88 SPRING=1；中途曾现: SOIL,WATER,SPRING；新: WATER；消失: 无；Tmax 20.0°C | **PASS** |  |
| SOIL × SPRING | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 SOIL=64 SPRING=64 → 结束 AIR=1063 WALL=48 SOIL=64 WATER=297 SPRING=64；中途曾现: SOIL,WATER,SPRING；新: WATER；消失: 无；Tmax 20.0°C | **PASS** |  |
| SOIL × SPRING | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 SOIL=576 SPRING=576 → 结束 AIR=1225 WALL=72 SOIL=576 WATER=431 SPRING=576；中途曾现: SOIL,WATER,SPRING；新: WATER；消失: 无；Tmax 20.0°C | **PASS** |  |
| SOIL × TNT | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 SOIL=1 TNT=1 → 结束 AIR=1486 WALL=48 SOIL=1 TNT=1；中途曾现: SOIL,TNT；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SOIL × TNT | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 SOIL=64 TNT=64 → 结束 AIR=1360 WALL=48 SOIL=64 TNT=64；中途曾现: SOIL,TNT；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SOIL × TNT | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 SOIL=576 TNT=576 → 结束 AIR=1656 WALL=72 SOIL=576 TNT=576；中途曾现: SOIL,TNT；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SALT × SALT | small | 同种物质相邻：自然堆叠/流动/相变，无化学变化 | 起始 AIR=1487 WALL=48 SALT=1 → 结束 AIR=1487 WALL=48 SALT=1；中途曾现: SALT；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| SALT × SALT | mid | 同种物质相邻：自然堆叠/流动/相变，无化学变化 | 起始 AIR=1424 WALL=48 SALT=64 → 结束 AIR=1424 WALL=48 SALT=64；中途曾现: SALT；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| SALT × SALT | large | 同种物质相邻：自然堆叠/流动/相变，无化学变化 | 起始 AIR=2232 WALL=72 SALT=576 → 结束 AIR=2232 WALL=72 SALT=576；中途曾现: SALT；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| SALT × DUST | small | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1486 WALL=48 SALT=1 DUST=1 → 结束 AIR=1486 WALL=48 SALT=1 DUST=1；中途曾现: SALT,DUST；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SALT × DUST | mid | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1360 WALL=48 SALT=64 DUST=64 → 结束 AIR=1360 WALL=48 SALT=64 DUST=64；中途曾现: SALT,DUST；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SALT × DUST | large | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1656 WALL=72 SALT=576 DUST=576 → 结束 AIR=1656 WALL=72 SALT=576 DUST=576；中途曾现: SALT,DUST；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SALT × SNOW | small | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1486 WALL=48 SALT=1 SNOW=1 → 结束 AIR=1486 WALL=48 SALT=1 WATER=1；中途曾现: SALT,SNOW,WATER；新: WATER；消失: SNOW；Tmax 20.0°C | **PASS** |  |
| SALT × SNOW | mid | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1360 WALL=48 SALT=64 SNOW=64 → 结束 AIR=1424 WALL=48 WATER=64；中途曾现: SALT,SNOW,WATER；新: WATER；消失: SALT,SNOW；Tmax 20.0°C | **PASS** |  |
| SALT × SNOW | large | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1656 WALL=72 SALT=576 SNOW=576 → 结束 AIR=2197 WALL=72 SALT=35 WATER=576；中途曾现: SALT,SNOW,WATER；新: WATER；消失: SNOW；Tmax 20.0°C | **PASS** |  |
| SALT × ASH | small | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1486 WALL=48 SALT=1 ASH=1 → 结束 AIR=1486 WALL=48 SALT=1 ASH=1；中途曾现: SALT,ASH；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SALT × ASH | mid | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1360 WALL=48 SALT=64 ASH=64 → 结束 AIR=1360 WALL=48 SALT=64 ASH=64；中途曾现: SALT,ASH；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SALT × ASH | large | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1656 WALL=72 SALT=576 ASH=576 → 结束 AIR=1656 WALL=72 SALT=576 ASH=576；中途曾现: SALT,ASH；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SALT × COAL | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 SALT=1 COAL=1 → 结束 AIR=1486 WALL=48 SALT=1 COAL=1；中途曾现: SALT,COAL；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SALT × COAL | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 SALT=64 COAL=64 → 结束 AIR=1360 WALL=48 SALT=64 COAL=64；中途曾现: SALT,COAL；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SALT × COAL | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 SALT=576 COAL=576 → 结束 AIR=1656 WALL=72 SALT=576 COAL=576；中途曾现: SALT,COAL；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SALT × GUNPOWDER | small | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1486 WALL=48 SALT=1 GUNPOWDER=1 → 结束 AIR=1486 WALL=48 SALT=1 GUNPOWDER=1；中途曾现: SALT,GUNPOWDER；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SALT × GUNPOWDER | mid | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1360 WALL=48 SALT=64 GUNPOWDER=64 → 结束 AIR=1360 WALL=48 SALT=64 GUNPOWDER=64；中途曾现: SALT,GUNPOWDER；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SALT × GUNPOWDER | large | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1656 WALL=72 SALT=576 GUNPOWDER=576 → 结束 AIR=1656 WALL=72 SALT=576 GUNPOWDER=576；中途曾现: SALT,GUNPOWDER；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SALT × SEED | small | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1486 WALL=48 SALT=1 SEED=1 → 结束 AIR=1486 WALL=48 SALT=1 SEED=1；中途曾现: SALT,SEED；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SALT × SEED | mid | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1360 WALL=48 SALT=64 SEED=64 → 结束 AIR=1360 WALL=48 SALT=64 SEED=64；中途曾现: SALT,SEED；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SALT × SEED | large | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1656 WALL=72 SALT=576 SEED=576 → 结束 AIR=1656 WALL=72 SALT=576 SEED=576；中途曾现: SALT,SEED；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SALT × WATER | small | 盐溶解为盐水：盐以离子形式留在水中（水不应减少，也不应"变轻"） | 起始 AIR=1486 WALL=48 SALT=1 WATER=1 → 结束 AIR=1486 WALL=48 SALT=1 WATER=1；中途曾现: SALT,WATER；新: 无；消失: 无；Tmax 20.0°C | **FAIL** | 见不合理清单·酸蚀/溶解不守恒 |
| SALT × WATER | mid | 盐溶解为盐水：盐以离子形式留在水中（水不应减少，也不应"变轻"） | 起始 AIR=1360 WALL=48 SALT=64 WATER=64 → 结束 AIR=1424 WALL=48 WATER=64；中途曾现: SALT,WATER；新: 无；消失: SALT；Tmax 20.0°C | **PASS** | 见不合理清单·酸蚀/溶解不守恒 |
| SALT × WATER | large | 盐溶解为盐水：盐以离子形式留在水中（水不应减少，也不应"变轻"） | 起始 AIR=1656 WALL=72 SALT=576 WATER=576 → 结束 AIR=2222 WALL=72 SALT=10 WATER=576；中途曾现: SALT,WATER；新: 无；消失: 无；Tmax 20.0°C | **PASS** | 见不合理清单·酸蚀/溶解不守恒 |
| SALT × OIL | small | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1486 WALL=48 SALT=1 OIL=1 → 结束 AIR=1486 WALL=48 SALT=1 OIL=1；中途曾现: SALT,OIL；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SALT × OIL | mid | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1360 WALL=48 SALT=64 OIL=64 → 结束 AIR=1360 WALL=48 SALT=64 OIL=64；中途曾现: SALT,OIL；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SALT × OIL | large | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1656 WALL=72 SALT=576 OIL=576 → 结束 AIR=1656 WALL=72 SALT=576 OIL=576；中途曾现: SALT,OIL；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SALT × LAVA | small | 热/冷源相邻：对侧发生相变（熔/凝/沸/冻） | 起始 AIR=1486 WALL=48 SALT=1 LAVA=1 → 结束 AIR=1486 WALL=48 STONE=1 SALT=1；中途曾现: STONE,SALT,LAVA；新: STONE；消失: LAVA；Tmax 40.6°C | **PASS** |  |
| SALT × LAVA | mid | 热/冷源相邻：对侧发生相变（熔/凝/沸/冻） | 起始 AIR=1360 WALL=48 SALT=64 LAVA=64 → 结束 AIR=1360 WALL=48 STONE=64 SALT=64；中途曾现: STONE,SALT,LAVA；新: STONE；消失: LAVA；Tmax 276.4°C | **PASS** |  |
| SALT × LAVA | large | 热/冷源相邻：对侧发生相变（熔/凝/沸/冻） | 起始 AIR=1656 WALL=72 SALT=576 LAVA=576 → 结束 AIR=1656 WALL=72 STONE=553 SALT=576 LAVA=23；中途曾现: STONE,SALT,LAVA；新: STONE；消失: 无；Tmax 699.7°C | **PASS** |  |
| SALT × ACID | small | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1486 WALL=48 SALT=1 ACID=1 → 结束 AIR=1486 WALL=48 SALT=1 ACID=1；中途曾现: SALT,ACID；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SALT × ACID | mid | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1360 WALL=48 SALT=64 ACID=64 → 结束 AIR=1360 WALL=48 SALT=64 ACID=64；中途曾现: SALT,ACID；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SALT × ACID | large | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1656 WALL=72 SALT=576 ACID=576 → 结束 AIR=1656 WALL=72 SALT=576 ACID=576；中途曾现: SALT,ACID；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SALT × LN2 | small | 热/冷源相邻：对侧发生相变（熔/凝/沸/冻） | 起始 AIR=1486 WALL=48 SALT=1 LN2=1 → 结束 AIR=1487 WALL=48 SALT=1；中途曾现: SALT,LN2；新: 无；消失: LN2；Tmax 20.0°C | **PASS** |  |
| SALT × LN2 | mid | 热/冷源相邻：对侧发生相变（熔/凝/沸/冻） | 起始 AIR=1360 WALL=48 SALT=64 LN2=64 → 结束 AIR=1424 WALL=48 SALT=64；中途曾现: SALT,LN2；新: 无；消失: LN2；Tmax 20.0°C | **PASS** |  |
| SALT × LN2 | large | 热/冷源相邻：对侧发生相变（熔/凝/沸/冻） | 起始 AIR=1656 WALL=72 SALT=576 LN2=576 → 结束 AIR=2232 WALL=72 SALT=576；中途曾现: SALT,LN2；新: 无；消失: LN2；Tmax 20.0°C | **PASS** |  |
| SALT × STEAM | small | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1486 WALL=48 SALT=1 STEAM=1 → 结束 AIR=1487 WALL=48 SALT=1；中途曾现: SALT,STEAM；新: 无；消失: STEAM；Tmax 20.0°C | **PASS** |  |
| SALT × STEAM | mid | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1360 WALL=48 SALT=64 STEAM=64 → 结束 AIR=1426 WALL=48 SALT=50 WATER=12；中途曾现: SALT,WATER,STEAM；新: WATER；消失: STEAM；Tmax 20.0°C | **PASS** |  |
| SALT × STEAM | large | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1656 WALL=72 SALT=576 STEAM=576 → 结束 AIR=2258 WALL=72 SALT=387 WATER=163；中途曾现: SALT,WATER,STEAM；新: WATER；消失: STEAM；Tmax 20.0°C | **PASS** |  |
| SALT × SMOKE | small | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1486 WALL=48 SALT=1 SMOKE=1 → 结束 AIR=1487 WALL=48 SALT=1；中途曾现: SALT,SMOKE；新: 无；消失: SMOKE；Tmax 20.0°C | **PASS** |  |
| SALT × SMOKE | mid | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1360 WALL=48 SALT=64 SMOKE=64 → 结束 AIR=1424 WALL=48 SALT=64；中途曾现: SALT,SMOKE；新: 无；消失: SMOKE；Tmax 20.0°C | **PASS** |  |
| SALT × SMOKE | large | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1656 WALL=72 SALT=576 SMOKE=576 → 结束 AIR=2232 WALL=72 SALT=576；中途曾现: SALT,SMOKE；新: 无；消失: SMOKE；Tmax 20.0°C | **PASS** |  |
| SALT × FIRE | small | 热/冷源相邻：对侧发生相变（熔/凝/沸/冻） | 起始 AIR=1486 WALL=48 SALT=1 FIRE=1 → 结束 AIR=1487 WALL=48 SALT=1；中途曾现: SALT,FIRE；新: 无；消失: FIRE；Tmax 20.2°C | **PASS** |  |
| SALT × FIRE | mid | 热/冷源相邻：对侧发生相变（熔/凝/沸/冻） | 起始 AIR=1360 WALL=48 SALT=64 FIRE=64 → 结束 AIR=1424 WALL=48 SALT=64；中途曾现: SALT,SMOKE,FIRE；新: 无；消失: FIRE；Tmax 22.1°C | **PASS** |  |
| SALT × FIRE | large | 热/冷源相邻：对侧发生相变（熔/凝/沸/冻） | 起始 AIR=1656 WALL=72 SALT=576 FIRE=576 → 结束 AIR=2232 WALL=72 SALT=576；中途曾现: SALT,SMOKE,FIRE；新: 无；消失: FIRE；Tmax 55.9°C | **PASS** |  |
| SALT × GAS | small | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1486 WALL=48 SALT=1 GAS=1 → 结束 AIR=1487 WALL=48 SALT=1；中途曾现: SALT,GAS；新: 无；消失: GAS；Tmax 20.0°C | **PASS** |  |
| SALT × GAS | mid | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1360 WALL=48 SALT=64 GAS=64 → 结束 AIR=1424 WALL=48 SALT=64；中途曾现: SALT,GAS；新: 无；消失: GAS；Tmax 20.0°C | **PASS** |  |
| SALT × GAS | large | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1656 WALL=72 SALT=576 GAS=576 → 结束 AIR=2232 WALL=72 SALT=576；中途曾现: SALT,GAS；新: 无；消失: GAS；Tmax 20.0°C | **PASS** |  |
| SALT × CLONE | small | （科幻机制）克隆体复制相邻的可移动物质，使其数量增加 | 起始 AIR=1486 WALL=48 SALT=1 CLONE=1 → 结束 AIR=1480 WALL=48 SALT=7 CLONE=1；中途曾现: SALT,CLONE；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SALT × CLONE | mid | （科幻机制）克隆体复制相邻的可移动物质，使其数量增加 | 起始 AIR=1360 WALL=48 SALT=64 CLONE=64 → 结束 AIR=1305 WALL=48 SALT=119 CLONE=64；中途曾现: SALT,CLONE；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SALT × CLONE | large | （科幻机制）克隆体复制相邻的可移动物质，使其数量增加 | 起始 AIR=1656 WALL=72 SALT=576 CLONE=576 → 结束 AIR=1397 WALL=72 SALT=835 CLONE=576；中途曾现: SALT,CLONE；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SALT × VIRUS | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 SALT=1 VIRUS=1 → 结束 AIR=1486 WALL=48 SALT=1 VIRUS=1；中途曾现: SALT,VIRUS；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SALT × VIRUS | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 SALT=64 VIRUS=64 → 结束 AIR=1360 WALL=48 SALT=64 VIRUS=64；中途曾现: SALT,VIRUS；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SALT × VIRUS | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 SALT=576 VIRUS=576 → 结束 AIR=1656 WALL=72 SALT=576 VIRUS=576；中途曾现: SALT,VIRUS；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SALT × SPRING | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 SALT=1 SPRING=1 → 结束 AIR=1398 WALL=48 WATER=89 SPRING=1；中途曾现: SALT,WATER,SPRING；新: WATER；消失: SALT；Tmax 20.0°C | **PASS** |  |
| SALT × SPRING | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 SALT=64 SPRING=64 → 结束 AIR=1057 WALL=48 WATER=367 SPRING=64；中途曾现: SALT,WATER,SPRING；新: WATER；消失: SALT；Tmax 20.0°C | **PASS** |  |
| SALT × SPRING | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 SALT=576 SPRING=576 → 结束 AIR=1190 WALL=72 SALT=23 WATER=1019 SPRING=576；中途曾现: SALT,WATER,SPRING；新: WATER；消失: 无；Tmax 20.0°C | **PASS** |  |
| SALT × TNT | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 SALT=1 TNT=1 → 结束 AIR=1486 WALL=48 SALT=1 TNT=1；中途曾现: SALT,TNT；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SALT × TNT | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 SALT=64 TNT=64 → 结束 AIR=1360 WALL=48 SALT=64 TNT=64；中途曾现: SALT,TNT；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SALT × TNT | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 SALT=576 TNT=576 → 结束 AIR=1656 WALL=72 SALT=576 TNT=576；中途曾现: SALT,TNT；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| DUST × DUST | small | 同种物质相邻：自然堆叠/流动/相变，无化学变化 | 起始 AIR=1487 WALL=48 DUST=1 → 结束 AIR=1487 WALL=48 DUST=1；中途曾现: DUST；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| DUST × DUST | mid | 同种物质相邻：自然堆叠/流动/相变，无化学变化 | 起始 AIR=1424 WALL=48 DUST=64 → 结束 AIR=1424 WALL=48 DUST=64；中途曾现: DUST；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| DUST × DUST | large | 同种物质相邻：自然堆叠/流动/相变，无化学变化 | 起始 AIR=2232 WALL=72 DUST=576 → 结束 AIR=2232 WALL=72 DUST=576；中途曾现: DUST；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| DUST × SNOW | small | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1486 WALL=48 DUST=1 SNOW=1 → 结束 AIR=1486 WALL=48 DUST=1 WATER=1；中途曾现: DUST,SNOW,WATER；新: WATER；消失: SNOW；Tmax 20.0°C | **PASS** |  |
| DUST × SNOW | mid | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1360 WALL=48 DUST=64 SNOW=64 → 结束 AIR=1360 WALL=48 DUST=64 WATER=64；中途曾现: DUST,SNOW,WATER；新: WATER；消失: SNOW；Tmax 20.0°C | **PASS** |  |
| DUST × SNOW | large | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1656 WALL=72 DUST=576 SNOW=576 → 结束 AIR=1656 WALL=72 DUST=576 WATER=576；中途曾现: DUST,SNOW,WATER；新: WATER；消失: SNOW；Tmax 20.0°C | **PASS** |  |
| DUST × ASH | small | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1486 WALL=48 DUST=1 ASH=1 → 结束 AIR=1486 WALL=48 DUST=1 ASH=1；中途曾现: DUST,ASH；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| DUST × ASH | mid | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1360 WALL=48 DUST=64 ASH=64 → 结束 AIR=1360 WALL=48 DUST=64 ASH=64；中途曾现: DUST,ASH；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| DUST × ASH | large | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1656 WALL=72 DUST=576 ASH=576 → 结束 AIR=1656 WALL=72 DUST=576 ASH=576；中途曾现: DUST,ASH；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| DUST × COAL | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 DUST=1 COAL=1 → 结束 AIR=1486 WALL=48 DUST=1 COAL=1；中途曾现: DUST,COAL；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| DUST × COAL | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 DUST=64 COAL=64 → 结束 AIR=1360 WALL=48 DUST=64 COAL=64；中途曾现: DUST,COAL；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| DUST × COAL | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 DUST=576 COAL=576 → 结束 AIR=1656 WALL=72 DUST=576 COAL=576；中途曾现: DUST,COAL；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| DUST × GUNPOWDER | small | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1486 WALL=48 DUST=1 GUNPOWDER=1 → 结束 AIR=1486 WALL=48 DUST=1 GUNPOWDER=1；中途曾现: DUST,GUNPOWDER；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| DUST × GUNPOWDER | mid | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1360 WALL=48 DUST=64 GUNPOWDER=64 → 结束 AIR=1360 WALL=48 DUST=64 GUNPOWDER=64；中途曾现: DUST,GUNPOWDER；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| DUST × GUNPOWDER | large | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1656 WALL=72 DUST=576 GUNPOWDER=576 → 结束 AIR=1656 WALL=72 DUST=576 GUNPOWDER=576；中途曾现: DUST,GUNPOWDER；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| DUST × SEED | small | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1486 WALL=48 DUST=1 SEED=1 → 结束 AIR=1486 WALL=48 DUST=1 SEED=1；中途曾现: DUST,SEED；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| DUST × SEED | mid | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1360 WALL=48 DUST=64 SEED=64 → 结束 AIR=1360 WALL=48 DUST=64 SEED=64；中途曾现: DUST,SEED；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| DUST × SEED | large | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1656 WALL=72 DUST=576 SEED=576 → 结束 AIR=1656 WALL=72 DUST=576 SEED=576；中途曾现: DUST,SEED；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| DUST × WATER | small | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1486 WALL=48 DUST=1 WATER=1 → 结束 AIR=1486 WALL=48 DUST=1 WATER=1；中途曾现: DUST,WATER；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| DUST × WATER | mid | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1360 WALL=48 DUST=64 WATER=64 → 结束 AIR=1360 WALL=48 DUST=64 WATER=64；中途曾现: DUST,WATER；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| DUST × WATER | large | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1656 WALL=72 DUST=576 WATER=576 → 结束 AIR=1656 WALL=72 DUST=576 WATER=576；中途曾现: DUST,WATER；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| DUST × OIL | small | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1486 WALL=48 DUST=1 OIL=1 → 结束 AIR=1486 WALL=48 DUST=1 OIL=1；中途曾现: DUST,OIL；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| DUST × OIL | mid | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1360 WALL=48 DUST=64 OIL=64 → 结束 AIR=1360 WALL=48 DUST=64 OIL=64；中途曾现: DUST,OIL；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| DUST × OIL | large | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1656 WALL=72 DUST=576 OIL=576 → 结束 AIR=1656 WALL=72 DUST=576 OIL=576；中途曾现: DUST,OIL；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| DUST × LAVA | small | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1486 WALL=48 DUST=1 LAVA=1 → 结束 AIR=1486 WALL=48 STONE=1 DUST=1；中途曾现: STONE,DUST,LAVA；新: STONE；消失: LAVA；Tmax 40.7°C | **PASS** |  |
| DUST × LAVA | mid | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1360 WALL=48 DUST=64 LAVA=64 → 结束 AIR=1360 WALL=48 STONE=64 DUST=64；中途曾现: STONE,DUST,LAVA；新: STONE；消失: LAVA；Tmax 280.9°C | **PASS** |  |
| DUST × LAVA | large | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1656 WALL=72 DUST=576 LAVA=576 → 结束 AIR=1656 WALL=72 STONE=553 DUST=576 LAVA=23；中途曾现: STONE,DUST,LAVA；新: STONE；消失: 无；Tmax 699.7°C | **PASS** |  |
| DUST × ACID | small | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1486 WALL=48 DUST=1 ACID=1 → 结束 AIR=1486 WALL=48 DUST=1 ACID=1；中途曾现: DUST,ACID；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| DUST × ACID | mid | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1360 WALL=48 DUST=64 ACID=64 → 结束 AIR=1360 WALL=48 DUST=64 ACID=64；中途曾现: DUST,ACID；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| DUST × ACID | large | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1656 WALL=72 DUST=576 ACID=576 → 结束 AIR=1656 WALL=72 DUST=576 ACID=576；中途曾现: DUST,ACID；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| DUST × LN2 | small | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1486 WALL=48 DUST=1 LN2=1 → 结束 AIR=1487 WALL=48 DUST=1；中途曾现: DUST,LN2；新: 无；消失: LN2；Tmax 20.0°C | **PASS** |  |
| DUST × LN2 | mid | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1360 WALL=48 DUST=64 LN2=64 → 结束 AIR=1424 WALL=48 DUST=64；中途曾现: DUST,LN2；新: 无；消失: LN2；Tmax 20.0°C | **PASS** |  |
| DUST × LN2 | large | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1656 WALL=72 DUST=576 LN2=576 → 结束 AIR=2232 WALL=72 DUST=576；中途曾现: DUST,LN2；新: 无；消失: LN2；Tmax 20.0°C | **PASS** |  |
| DUST × STEAM | small | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1486 WALL=48 DUST=1 STEAM=1 → 结束 AIR=1487 WALL=48 DUST=1；中途曾现: DUST,STEAM；新: 无；消失: STEAM；Tmax 20.0°C | **PASS** |  |
| DUST × STEAM | mid | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1360 WALL=48 DUST=64 STEAM=64 → 结束 AIR=1412 WALL=48 DUST=64 WATER=12；中途曾现: DUST,WATER,STEAM；新: WATER；消失: STEAM；Tmax 20.0°C | **PASS** |  |
| DUST × STEAM | large | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1656 WALL=72 DUST=576 STEAM=576 → 结束 AIR=2064 WALL=72 DUST=576 WATER=168；中途曾现: DUST,WATER,STEAM；新: WATER；消失: STEAM；Tmax 20.0°C | **PASS** |  |
| DUST × SMOKE | small | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1486 WALL=48 DUST=1 SMOKE=1 → 结束 AIR=1487 WALL=48 DUST=1；中途曾现: DUST,SMOKE；新: 无；消失: SMOKE；Tmax 20.0°C | **PASS** |  |
| DUST × SMOKE | mid | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1360 WALL=48 DUST=64 SMOKE=64 → 结束 AIR=1424 WALL=48 DUST=64；中途曾现: DUST,SMOKE；新: 无；消失: SMOKE；Tmax 20.0°C | **PASS** |  |
| DUST × SMOKE | large | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1656 WALL=72 DUST=576 SMOKE=576 → 结束 AIR=2232 WALL=72 DUST=576；中途曾现: DUST,SMOKE；新: 无；消失: SMOKE；Tmax 20.0°C | **PASS** |  |
| DUST × FIRE | small | 可燃粉尘云遇火可爆（粉尘爆炸，应迅速烧掉大部分） | 起始 AIR=1486 WALL=48 DUST=1 FIRE=1 → 结束 AIR=1487 WALL=48 DUST=1；中途曾现: DUST,FIRE；新: 无；消失: FIRE；Tmax 20.2°C | **FAIL** | 见不合理清单·火离开燃料 |
| DUST × FIRE | mid | 可燃粉尘云遇火可爆（粉尘爆炸，应迅速烧掉大部分） | 起始 AIR=1360 WALL=48 DUST=64 FIRE=64 → 结束 AIR=1427 WALL=48 DUST=61；中途曾现: DUST,SMOKE,FIRE；新: 无；消失: FIRE；Tmax 22.9°C | **FAIL** | 见不合理清单·火离开燃料 |
| DUST × FIRE | large | 可燃粉尘云遇火可爆（粉尘爆炸，应迅速烧掉大部分） | 起始 AIR=1656 WALL=72 DUST=576 FIRE=576 → 结束 AIR=2236 WALL=72 DUST=572；中途曾现: DUST,SMOKE,FIRE；新: 无；消失: FIRE；Tmax 56.0°C | **FAIL** | 见不合理清单·火离开燃料 |
| DUST × GAS | small | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1486 WALL=48 DUST=1 GAS=1 → 结束 AIR=1487 WALL=48 DUST=1；中途曾现: DUST,GAS；新: 无；消失: GAS；Tmax 20.0°C | **PASS** |  |
| DUST × GAS | mid | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1360 WALL=48 DUST=64 GAS=64 → 结束 AIR=1424 WALL=48 DUST=64；中途曾现: DUST,GAS；新: 无；消失: GAS；Tmax 20.0°C | **PASS** |  |
| DUST × GAS | large | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1656 WALL=72 DUST=576 GAS=576 → 结束 AIR=2232 WALL=72 DUST=576；中途曾现: DUST,GAS；新: 无；消失: GAS；Tmax 20.0°C | **PASS** |  |
| DUST × CLONE | small | （科幻机制）克隆体复制相邻的可移动物质，使其数量增加 | 起始 AIR=1486 WALL=48 DUST=1 CLONE=1 → 结束 AIR=1480 WALL=48 DUST=7 CLONE=1；中途曾现: DUST,CLONE；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| DUST × CLONE | mid | （科幻机制）克隆体复制相邻的可移动物质，使其数量增加 | 起始 AIR=1360 WALL=48 DUST=64 CLONE=64 → 结束 AIR=1306 WALL=48 DUST=118 CLONE=64；中途曾现: DUST,CLONE；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| DUST × CLONE | large | （科幻机制）克隆体复制相邻的可移动物质，使其数量增加 | 起始 AIR=1656 WALL=72 DUST=576 CLONE=576 → 结束 AIR=1397 WALL=72 DUST=835 CLONE=576；中途曾现: DUST,CLONE；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| DUST × VIRUS | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 DUST=1 VIRUS=1 → 结束 AIR=1486 WALL=48 DUST=1 VIRUS=1；中途曾现: DUST,VIRUS；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| DUST × VIRUS | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 DUST=64 VIRUS=64 → 结束 AIR=1360 WALL=48 DUST=64 VIRUS=64；中途曾现: DUST,VIRUS；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| DUST × VIRUS | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 DUST=576 VIRUS=576 → 结束 AIR=1656 WALL=72 DUST=576 VIRUS=576；中途曾现: DUST,VIRUS；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| DUST × SPRING | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 DUST=1 SPRING=1 → 结束 AIR=1409 WALL=48 DUST=1 WATER=77 SPRING=1；中途曾现: DUST,WATER,SPRING；新: WATER；消失: 无；Tmax 20.0°C | **PASS** |  |
| DUST × SPRING | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 DUST=64 SPRING=64 → 结束 AIR=1223 WALL=48 DUST=64 WATER=137 SPRING=64；中途曾现: DUST,WATER,SPRING；新: WATER；消失: 无；Tmax 20.0°C | **PASS** |  |
| DUST × SPRING | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 DUST=576 SPRING=576 → 结束 AIR=1336 WALL=72 DUST=576 WATER=320 SPRING=576；中途曾现: DUST,WATER,SPRING；新: WATER；消失: 无；Tmax 20.0°C | **PASS** |  |
| DUST × TNT | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 DUST=1 TNT=1 → 结束 AIR=1486 WALL=48 DUST=1 TNT=1；中途曾现: DUST,TNT；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| DUST × TNT | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 DUST=64 TNT=64 → 结束 AIR=1360 WALL=48 DUST=64 TNT=64；中途曾现: DUST,TNT；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| DUST × TNT | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 DUST=576 TNT=576 → 结束 AIR=1656 WALL=72 DUST=576 TNT=576；中途曾现: DUST,TNT；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SNOW × SNOW | small | 同种物质相邻：自然堆叠/流动/相变，无化学变化 | 起始 AIR=1487 WALL=48 SNOW=1 → 结束 AIR=1487 WALL=48 WATER=1；中途曾现: SNOW,WATER；新: WATER；消失: SNOW；Tmax 20.0°C | **N/A** |  |
| SNOW × SNOW | mid | 同种物质相邻：自然堆叠/流动/相变，无化学变化 | 起始 AIR=1424 WALL=48 SNOW=64 → 结束 AIR=1424 WALL=48 WATER=64；中途曾现: SNOW,WATER；新: WATER；消失: SNOW；Tmax 20.0°C | **N/A** |  |
| SNOW × SNOW | large | 同种物质相邻：自然堆叠/流动/相变，无化学变化 | 起始 AIR=2232 WALL=72 SNOW=576 → 结束 AIR=2232 WALL=72 WATER=576；中途曾现: SNOW,WATER；新: WATER；消失: SNOW；Tmax 20.0°C | **N/A** |  |
| SNOW × ASH | small | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1486 WALL=48 SNOW=1 ASH=1 → 结束 AIR=1486 WALL=48 ASH=1 WATER=1；中途曾现: SNOW,ASH,WATER；新: WATER；消失: SNOW；Tmax 20.0°C | **PASS** |  |
| SNOW × ASH | mid | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1360 WALL=48 SNOW=64 ASH=64 → 结束 AIR=1360 WALL=48 ASH=64 WATER=64；中途曾现: SNOW,ASH,WATER；新: WATER；消失: SNOW；Tmax 20.0°C | **PASS** |  |
| SNOW × ASH | large | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1656 WALL=72 SNOW=576 ASH=576 → 结束 AIR=1656 WALL=72 ASH=576 WATER=576；中途曾现: SNOW,ASH,WATER；新: WATER；消失: SNOW；Tmax 20.0°C | **PASS** |  |
| SNOW × COAL | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 SNOW=1 COAL=1 → 结束 AIR=1486 WALL=48 COAL=1 WATER=1；中途曾现: SNOW,COAL,WATER；新: WATER；消失: SNOW；Tmax 20.0°C | **PASS** |  |
| SNOW × COAL | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 SNOW=64 COAL=64 → 结束 AIR=1360 WALL=48 COAL=64 WATER=64；中途曾现: SNOW,COAL,WATER；新: WATER；消失: SNOW；Tmax 20.0°C | **PASS** |  |
| SNOW × COAL | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 SNOW=576 COAL=576 → 结束 AIR=1656 WALL=72 COAL=576 WATER=576；中途曾现: SNOW,COAL,WATER；新: WATER；消失: SNOW；Tmax 20.0°C | **PASS** |  |
| SNOW × GUNPOWDER | small | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1486 WALL=48 SNOW=1 GUNPOWDER=1 → 结束 AIR=1486 WALL=48 GUNPOWDER=1 WATER=1；中途曾现: SNOW,GUNPOWDER,WATER；新: WATER；消失: SNOW；Tmax 20.0°C | **PASS** |  |
| SNOW × GUNPOWDER | mid | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1360 WALL=48 SNOW=64 GUNPOWDER=64 → 结束 AIR=1360 WALL=48 GUNPOWDER=64 WATER=64；中途曾现: SNOW,GUNPOWDER,WATER；新: WATER；消失: SNOW；Tmax 20.0°C | **PASS** |  |
| SNOW × GUNPOWDER | large | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1656 WALL=72 SNOW=576 GUNPOWDER=576 → 结束 AIR=1656 WALL=72 GUNPOWDER=576 WATER=576；中途曾现: SNOW,GUNPOWDER,WATER；新: WATER；消失: SNOW；Tmax 20.0°C | **PASS** |  |
| SNOW × SEED | small | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1486 WALL=48 SNOW=1 SEED=1 → 结束 AIR=1486 WALL=48 SEED=1 WATER=1；中途曾现: SNOW,SEED,WATER；新: WATER；消失: SNOW；Tmax 20.0°C | **PASS** |  |
| SNOW × SEED | mid | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1360 WALL=48 SNOW=64 SEED=64 → 结束 AIR=1344 WALL=48 PLANT=36 DUST=5 SEED=55 WATER=48；中途曾现: PLANT,DUST,SNOW,SEED,WATER；新: PLANT,DUST,WATER；消失: SNOW；Tmax 20.0°C | **PASS** |  |
| SNOW × SEED | large | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1656 WALL=72 SNOW=576 SEED=576 → 结束 AIR=1620 WALL=72 PLANT=87 DUST=7 SEED=557 WATER=537；中途曾现: PLANT,DUST,SNOW,SEED,WATER；新: PLANT,DUST,WATER；消失: SNOW；Tmax 20.0°C | **PASS** |  |
| SNOW × WATER | small | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1486 WALL=48 SNOW=1 WATER=1 → 结束 AIR=1486 WALL=48 WATER=2；中途曾现: SNOW,WATER；新: 无；消失: SNOW；Tmax 20.0°C | **PASS** |  |
| SNOW × WATER | mid | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1360 WALL=48 SNOW=64 WATER=64 → 结束 AIR=1360 WALL=48 WATER=128；中途曾现: SNOW,WATER；新: 无；消失: SNOW；Tmax 20.0°C | **PASS** |  |
| SNOW × WATER | large | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1656 WALL=72 SNOW=576 WATER=576 → 结束 AIR=1656 WALL=72 WATER=1152；中途曾现: SNOW,WATER；新: 无；消失: SNOW；Tmax 20.0°C | **PASS** |  |
| SNOW × OIL | small | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1486 WALL=48 SNOW=1 OIL=1 → 结束 AIR=1486 WALL=48 WATER=1 OIL=1；中途曾现: SNOW,WATER,OIL；新: WATER；消失: SNOW；Tmax 20.0°C | **PASS** |  |
| SNOW × OIL | mid | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1360 WALL=48 SNOW=64 OIL=64 → 结束 AIR=1360 WALL=48 WATER=64 OIL=64；中途曾现: SNOW,WATER,OIL；新: WATER；消失: SNOW；Tmax 20.0°C | **PASS** |  |
| SNOW × OIL | large | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1656 WALL=72 SNOW=576 OIL=576 → 结束 AIR=1656 WALL=72 WATER=576 OIL=576；中途曾现: SNOW,WATER,OIL；新: WATER；消失: SNOW；Tmax 20.0°C | **PASS** |  |
| SNOW × LAVA | small | 雪被岩浆极速融化成水/汽，岩浆凝固 | 起始 AIR=1486 WALL=48 SNOW=1 LAVA=1 → 结束 AIR=1487 WALL=48 STONE=1；中途曾现: STONE,SNOW,WATER,LAVA,STEAM；新: STONE；消失: SNOW,LAVA；Tmax 40.9°C | **PASS** |  |
| SNOW × LAVA | mid | 雪被岩浆极速融化成水/汽，岩浆凝固 | 起始 AIR=1360 WALL=48 SNOW=64 LAVA=64 → 结束 AIR=1389 WALL=48 STONE=64 WATER=35；中途曾现: STONE,SNOW,WATER,LAVA,STEAM；新: STONE,WATER,STEAM；消失: SNOW,LAVA；Tmax 373.5°C | **PASS** |  |
| SNOW × LAVA | large | 雪被岩浆极速融化成水/汽，岩浆凝固 | 起始 AIR=1656 WALL=72 SNOW=576 LAVA=576 → 结束 AIR=1772 WALL=72 STONE=548 WATER=459 LAVA=28 STEAM=1；中途曾现: STONE,SNOW,WATER,LAVA,STEAM；新: STONE,WATER,STEAM；消失: SNOW；Tmax 699.7°C | **PASS** |  |
| SNOW × ACID | small | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1486 WALL=48 SNOW=1 ACID=1 → 结束 AIR=1486 WALL=48 WATER=1 ACID=1；中途曾现: SNOW,WATER,ACID；新: WATER；消失: SNOW；Tmax 20.0°C | **PASS** |  |
| SNOW × ACID | mid | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1360 WALL=48 SNOW=64 ACID=64 → 结束 AIR=1360 WALL=48 WATER=64 ACID=64；中途曾现: SNOW,WATER,ACID；新: WATER；消失: SNOW；Tmax 20.0°C | **PASS** |  |
| SNOW × ACID | large | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1656 WALL=72 SNOW=576 ACID=576 → 结束 AIR=1656 WALL=72 WATER=576 ACID=576；中途曾现: SNOW,WATER,ACID；新: WATER；消失: SNOW；Tmax 20.0°C | **PASS** |  |
| SNOW × LN2 | small | 热/冷源相邻：对侧发生相变（熔/凝/沸/冻） | 起始 AIR=1486 WALL=48 SNOW=1 LN2=1 → 结束 AIR=1487 WALL=48 WATER=1；中途曾现: SNOW,WATER,LN2；新: WATER；消失: SNOW,LN2；Tmax 20.0°C | **PASS** |  |
| SNOW × LN2 | mid | 热/冷源相邻：对侧发生相变（熔/凝/沸/冻） | 起始 AIR=1360 WALL=48 SNOW=64 LN2=64 → 结束 AIR=1424 WALL=48 WATER=64；中途曾现: ICE,SNOW,WATER,LN2；新: WATER；消失: SNOW,LN2；Tmax 20.0°C | **PASS** |  |
| SNOW × LN2 | large | 热/冷源相邻：对侧发生相变（熔/凝/沸/冻） | 起始 AIR=1656 WALL=72 SNOW=576 LN2=576 → 结束 AIR=2232 WALL=72 ICE=58 SNOW=15 WATER=503；中途曾现: ICE,SNOW,WATER,LN2；新: ICE,WATER；消失: LN2；Tmax 20.0°C | **PASS** |  |
| SNOW × STEAM | small | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1486 WALL=48 SNOW=1 STEAM=1 → 结束 AIR=1487 WALL=48 WATER=1；中途曾现: SNOW,WATER,STEAM；新: WATER；消失: SNOW,STEAM；Tmax 20.0°C | **PASS** |  |
| SNOW × STEAM | mid | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1360 WALL=48 SNOW=64 STEAM=64 → 结束 AIR=1412 WALL=48 WATER=76；中途曾现: SNOW,WATER,STEAM；新: WATER；消失: SNOW,STEAM；Tmax 20.0°C | **PASS** |  |
| SNOW × STEAM | large | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1656 WALL=72 SNOW=576 STEAM=576 → 结束 AIR=2059 WALL=72 WATER=749；中途曾现: SNOW,WATER,STEAM；新: WATER；消失: SNOW,STEAM；Tmax 20.0°C | **PASS** |  |
| SNOW × SMOKE | small | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1486 WALL=48 SNOW=1 SMOKE=1 → 结束 AIR=1487 WALL=48 WATER=1；中途曾现: SNOW,WATER,SMOKE；新: WATER；消失: SNOW,SMOKE；Tmax 20.0°C | **PASS** |  |
| SNOW × SMOKE | mid | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1360 WALL=48 SNOW=64 SMOKE=64 → 结束 AIR=1424 WALL=48 WATER=64；中途曾现: SNOW,WATER,SMOKE；新: WATER；消失: SNOW,SMOKE；Tmax 20.0°C | **PASS** |  |
| SNOW × SMOKE | large | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1656 WALL=72 SNOW=576 SMOKE=576 → 结束 AIR=2232 WALL=72 WATER=576；中途曾现: SNOW,WATER,SMOKE；新: WATER；消失: SNOW,SMOKE；Tmax 20.0°C | **PASS** |  |
| SNOW × FIRE | small | 热/冷源相邻：对侧发生相变（熔/凝/沸/冻） | 起始 AIR=1486 WALL=48 SNOW=1 FIRE=1 → 结束 AIR=1487 WALL=48 WATER=1；中途曾现: SNOW,WATER,FIRE；新: WATER；消失: SNOW,FIRE；Tmax 20.2°C | **PASS** |  |
| SNOW × FIRE | mid | 热/冷源相邻：对侧发生相变（熔/凝/沸/冻） | 起始 AIR=1360 WALL=48 SNOW=64 FIRE=64 → 结束 AIR=1424 WALL=48 WATER=64；中途曾现: SNOW,WATER,SMOKE,FIRE；新: WATER；消失: SNOW,FIRE；Tmax 22.4°C | **PASS** |  |
| SNOW × FIRE | large | 热/冷源相邻：对侧发生相变（熔/凝/沸/冻） | 起始 AIR=1656 WALL=72 SNOW=576 FIRE=576 → 结束 AIR=2237 WALL=72 WATER=571；中途曾现: SNOW,WATER,STEAM,SMOKE,FIRE；新: WATER；消失: SNOW,FIRE；Tmax 56.4°C | **PASS** |  |
| SNOW × GAS | small | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1486 WALL=48 SNOW=1 GAS=1 → 结束 AIR=1487 WALL=48 WATER=1；中途曾现: SNOW,WATER,GAS；新: WATER；消失: SNOW,GAS；Tmax 20.0°C | **PASS** |  |
| SNOW × GAS | mid | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1360 WALL=48 SNOW=64 GAS=64 → 结束 AIR=1424 WALL=48 WATER=64；中途曾现: SNOW,WATER,GAS；新: WATER；消失: SNOW,GAS；Tmax 20.0°C | **PASS** |  |
| SNOW × GAS | large | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1656 WALL=72 SNOW=576 GAS=576 → 结束 AIR=2232 WALL=72 WATER=576；中途曾现: SNOW,WATER,GAS；新: WATER；消失: SNOW,GAS；Tmax 20.0°C | **PASS** |  |
| SNOW × CLONE | small | （科幻机制）克隆体复制相邻的可移动物质；目标为气体/易相变物质，数量受逸出与相变干扰，不单独判数量 | 起始 AIR=1486 WALL=48 SNOW=1 CLONE=1 → 结束 AIR=1392 WALL=48 WATER=95 CLONE=1；中途曾现: SNOW,WATER,CLONE；新: WATER；消失: SNOW；Tmax 20.0°C | **PASS** |  |
| SNOW × CLONE | mid | （科幻机制）克隆体复制相邻的可移动物质；目标为气体/易相变物质，数量受逸出与相变干扰，不单独判数量 | 起始 AIR=1360 WALL=48 SNOW=64 CLONE=64 → 结束 AIR=1056 WALL=48 WATER=368 CLONE=64；中途曾现: SNOW,WATER,CLONE；新: WATER；消失: SNOW；Tmax 20.0°C | **PASS** |  |
| SNOW × CLONE | large | （科幻机制）克隆体复制相邻的可移动物质；目标为气体/易相变物质，数量受逸出与相变干扰，不单独判数量 | 起始 AIR=1656 WALL=72 SNOW=576 CLONE=576 → 结束 AIR=1044 WALL=72 WATER=1188 CLONE=576；中途曾现: SNOW,WATER,CLONE；新: WATER；消失: SNOW；Tmax 20.0°C | **PASS** |  |
| SNOW × VIRUS | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 SNOW=1 VIRUS=1 → 结束 AIR=1486 WALL=48 WATER=1 VIRUS=1；中途曾现: SNOW,WATER,VIRUS；新: WATER；消失: SNOW；Tmax 20.0°C | **PASS** |  |
| SNOW × VIRUS | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 SNOW=64 VIRUS=64 → 结束 AIR=1360 WALL=48 WATER=64 VIRUS=64；中途曾现: SNOW,WATER,VIRUS；新: WATER；消失: SNOW；Tmax 20.0°C | **PASS** |  |
| SNOW × VIRUS | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 SNOW=576 VIRUS=576 → 结束 AIR=1656 WALL=72 WATER=576 VIRUS=576；中途曾现: SNOW,WATER,VIRUS；新: WATER；消失: SNOW；Tmax 20.0°C | **PASS** |  |
| SNOW × SPRING | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 SNOW=1 SPRING=1 → 结束 AIR=1398 WALL=48 WATER=89 SPRING=1；中途曾现: SNOW,WATER,SPRING；新: WATER；消失: SNOW；Tmax 20.0°C | **PASS** |  |
| SNOW × SPRING | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 SNOW=64 SPRING=64 → 结束 AIR=1057 WALL=48 WATER=367 SPRING=64；中途曾现: SNOW,WATER,SPRING；新: WATER；消失: SNOW；Tmax 20.0°C | **PASS** |  |
| SNOW × SPRING | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 SNOW=576 SPRING=576 → 结束 AIR=1059 WALL=72 WATER=1173 SPRING=576；中途曾现: SNOW,WATER,SPRING；新: WATER；消失: SNOW；Tmax 20.0°C | **PASS** |  |
| SNOW × TNT | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 SNOW=1 TNT=1 → 结束 AIR=1486 WALL=48 WATER=1 TNT=1；中途曾现: SNOW,WATER,TNT；新: WATER；消失: SNOW；Tmax 20.0°C | **PASS** |  |
| SNOW × TNT | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 SNOW=64 TNT=64 → 结束 AIR=1360 WALL=48 WATER=64 TNT=64；中途曾现: SNOW,WATER,TNT；新: WATER；消失: SNOW；Tmax 20.0°C | **PASS** |  |
| SNOW × TNT | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 SNOW=576 TNT=576 → 结束 AIR=1656 WALL=72 WATER=576 TNT=576；中途曾现: SNOW,WATER,TNT；新: WATER；消失: SNOW；Tmax 20.0°C | **PASS** |  |
| ASH × ASH | small | 同种物质相邻：自然堆叠/流动/相变，无化学变化 | 起始 AIR=1487 WALL=48 ASH=1 → 结束 AIR=1487 WALL=48 ASH=1；中途曾现: ASH；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| ASH × ASH | mid | 同种物质相邻：自然堆叠/流动/相变，无化学变化 | 起始 AIR=1424 WALL=48 ASH=64 → 结束 AIR=1424 WALL=48 ASH=64；中途曾现: ASH；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| ASH × ASH | large | 同种物质相邻：自然堆叠/流动/相变，无化学变化 | 起始 AIR=2232 WALL=72 ASH=576 → 结束 AIR=2232 WALL=72 ASH=576；中途曾现: ASH；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| ASH × COAL | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 ASH=1 COAL=1 → 结束 AIR=1486 WALL=48 ASH=1 COAL=1；中途曾现: ASH,COAL；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| ASH × COAL | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 ASH=64 COAL=64 → 结束 AIR=1360 WALL=48 ASH=64 COAL=64；中途曾现: ASH,COAL；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| ASH × COAL | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 ASH=576 COAL=576 → 结束 AIR=1656 WALL=72 ASH=576 COAL=576；中途曾现: ASH,COAL；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| ASH × GUNPOWDER | small | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1486 WALL=48 ASH=1 GUNPOWDER=1 → 结束 AIR=1486 WALL=48 ASH=1 GUNPOWDER=1；中途曾现: ASH,GUNPOWDER；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| ASH × GUNPOWDER | mid | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1360 WALL=48 ASH=64 GUNPOWDER=64 → 结束 AIR=1360 WALL=48 ASH=64 GUNPOWDER=64；中途曾现: ASH,GUNPOWDER；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| ASH × GUNPOWDER | large | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1656 WALL=72 ASH=576 GUNPOWDER=576 → 结束 AIR=1656 WALL=72 ASH=576 GUNPOWDER=576；中途曾现: ASH,GUNPOWDER；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| ASH × SEED | small | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1486 WALL=48 ASH=1 SEED=1 → 结束 AIR=1486 WALL=48 ASH=1 SEED=1；中途曾现: ASH,SEED；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| ASH × SEED | mid | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1360 WALL=48 ASH=64 SEED=64 → 结束 AIR=1360 WALL=48 ASH=64 SEED=64；中途曾现: ASH,SEED；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| ASH × SEED | large | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1656 WALL=72 ASH=576 SEED=576 → 结束 AIR=1656 WALL=72 ASH=576 SEED=576；中途曾现: ASH,SEED；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| ASH × WATER | small | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1486 WALL=48 ASH=1 WATER=1 → 结束 AIR=1486 WALL=48 ASH=1 WATER=1；中途曾现: ASH,WATER；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| ASH × WATER | mid | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1360 WALL=48 ASH=64 WATER=64 → 结束 AIR=1360 WALL=48 ASH=64 WATER=64；中途曾现: ASH,WATER；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| ASH × WATER | large | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1656 WALL=72 ASH=576 WATER=576 → 结束 AIR=1656 WALL=72 ASH=576 WATER=576；中途曾现: ASH,WATER；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| ASH × OIL | small | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1486 WALL=48 ASH=1 OIL=1 → 结束 AIR=1486 WALL=48 ASH=1 OIL=1；中途曾现: ASH,OIL；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| ASH × OIL | mid | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1360 WALL=48 ASH=64 OIL=64 → 结束 AIR=1360 WALL=48 ASH=64 OIL=64；中途曾现: ASH,OIL；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| ASH × OIL | large | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1656 WALL=72 ASH=576 OIL=576 → 结束 AIR=1656 WALL=72 ASH=576 OIL=576；中途曾现: ASH,OIL；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| ASH × LAVA | small | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1486 WALL=48 ASH=1 LAVA=1 → 结束 AIR=1486 WALL=48 STONE=1 ASH=1；中途曾现: STONE,ASH,LAVA；新: STONE；消失: LAVA；Tmax 40.6°C | **PASS** |  |
| ASH × LAVA | mid | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1360 WALL=48 ASH=64 LAVA=64 → 结束 AIR=1360 WALL=48 STONE=64 ASH=64；中途曾现: STONE,ASH,LAVA；新: STONE；消失: LAVA；Tmax 277.6°C | **PASS** |  |
| ASH × LAVA | large | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1656 WALL=72 ASH=576 LAVA=576 → 结束 AIR=1656 WALL=72 STONE=553 ASH=576 LAVA=23；中途曾现: STONE,ASH,LAVA；新: STONE；消失: 无；Tmax 699.7°C | **PASS** |  |
| ASH × ACID | small | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1486 WALL=48 ASH=1 ACID=1 → 结束 AIR=1486 WALL=48 ASH=1 ACID=1；中途曾现: ASH,ACID；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| ASH × ACID | mid | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1360 WALL=48 ASH=64 ACID=64 → 结束 AIR=1360 WALL=48 ASH=64 ACID=64；中途曾现: ASH,ACID；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| ASH × ACID | large | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1656 WALL=72 ASH=576 ACID=576 → 结束 AIR=1656 WALL=72 ASH=576 ACID=576；中途曾现: ASH,ACID；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| ASH × LN2 | small | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1486 WALL=48 ASH=1 LN2=1 → 结束 AIR=1487 WALL=48 ASH=1；中途曾现: ASH,LN2；新: 无；消失: LN2；Tmax 20.0°C | **PASS** |  |
| ASH × LN2 | mid | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1360 WALL=48 ASH=64 LN2=64 → 结束 AIR=1424 WALL=48 ASH=64；中途曾现: ASH,LN2；新: 无；消失: LN2；Tmax 20.0°C | **PASS** |  |
| ASH × LN2 | large | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1656 WALL=72 ASH=576 LN2=576 → 结束 AIR=2232 WALL=72 ASH=576；中途曾现: ASH,LN2；新: 无；消失: LN2；Tmax 20.0°C | **PASS** |  |
| ASH × STEAM | small | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1486 WALL=48 ASH=1 STEAM=1 → 结束 AIR=1487 WALL=48 ASH=1；中途曾现: ASH,STEAM；新: 无；消失: STEAM；Tmax 20.0°C | **PASS** |  |
| ASH × STEAM | mid | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1360 WALL=48 ASH=64 STEAM=64 → 结束 AIR=1415 WALL=48 ASH=64 WATER=9；中途曾现: ASH,WATER,STEAM；新: WATER；消失: STEAM；Tmax 20.0°C | **PASS** |  |
| ASH × STEAM | large | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1656 WALL=72 ASH=576 STEAM=576 → 结束 AIR=2064 WALL=72 ASH=576 WATER=168；中途曾现: ASH,WATER,STEAM；新: WATER；消失: STEAM；Tmax 20.0°C | **PASS** |  |
| ASH × SMOKE | small | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1486 WALL=48 ASH=1 SMOKE=1 → 结束 AIR=1487 WALL=48 ASH=1；中途曾现: ASH,SMOKE；新: 无；消失: SMOKE；Tmax 20.0°C | **PASS** |  |
| ASH × SMOKE | mid | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1360 WALL=48 ASH=64 SMOKE=64 → 结束 AIR=1424 WALL=48 ASH=64；中途曾现: ASH,SMOKE；新: 无；消失: SMOKE；Tmax 20.0°C | **PASS** |  |
| ASH × SMOKE | large | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1656 WALL=72 ASH=576 SMOKE=576 → 结束 AIR=2232 WALL=72 ASH=576；中途曾现: ASH,SMOKE；新: 无；消失: SMOKE；Tmax 20.0°C | **PASS** |  |
| ASH × FIRE | small | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1486 WALL=48 ASH=1 FIRE=1 → 结束 AIR=1487 WALL=48 ASH=1；中途曾现: ASH,FIRE；新: 无；消失: FIRE；Tmax 20.2°C | **PASS** |  |
| ASH × FIRE | mid | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1360 WALL=48 ASH=64 FIRE=64 → 结束 AIR=1424 WALL=48 ASH=64；中途曾现: ASH,SMOKE,FIRE；新: 无；消失: FIRE；Tmax 23.0°C | **PASS** |  |
| ASH × FIRE | large | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1656 WALL=72 ASH=576 FIRE=576 → 结束 AIR=2232 WALL=72 ASH=576；中途曾现: ASH,SMOKE,FIRE；新: 无；消失: FIRE；Tmax 57.2°C | **PASS** |  |
| ASH × GAS | small | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1486 WALL=48 ASH=1 GAS=1 → 结束 AIR=1487 WALL=48 ASH=1；中途曾现: ASH,GAS；新: 无；消失: GAS；Tmax 20.0°C | **PASS** |  |
| ASH × GAS | mid | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1360 WALL=48 ASH=64 GAS=64 → 结束 AIR=1424 WALL=48 ASH=64；中途曾现: ASH,GAS；新: 无；消失: GAS；Tmax 20.0°C | **PASS** |  |
| ASH × GAS | large | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1656 WALL=72 ASH=576 GAS=576 → 结束 AIR=2232 WALL=72 ASH=576；中途曾现: ASH,GAS；新: 无；消失: GAS；Tmax 20.0°C | **PASS** |  |
| ASH × CLONE | small | （科幻机制）克隆体复制相邻的可移动物质，使其数量增加 | 起始 AIR=1486 WALL=48 ASH=1 CLONE=1 → 结束 AIR=1480 WALL=48 ASH=7 CLONE=1；中途曾现: ASH,CLONE；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| ASH × CLONE | mid | （科幻机制）克隆体复制相邻的可移动物质，使其数量增加 | 起始 AIR=1360 WALL=48 ASH=64 CLONE=64 → 结束 AIR=1306 WALL=48 ASH=118 CLONE=64；中途曾现: ASH,CLONE；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| ASH × CLONE | large | （科幻机制）克隆体复制相邻的可移动物质，使其数量增加 | 起始 AIR=1656 WALL=72 ASH=576 CLONE=576 → 结束 AIR=1397 WALL=72 ASH=835 CLONE=576；中途曾现: ASH,CLONE；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| ASH × VIRUS | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 ASH=1 VIRUS=1 → 结束 AIR=1486 WALL=48 ASH=1 VIRUS=1；中途曾现: ASH,VIRUS；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| ASH × VIRUS | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 ASH=64 VIRUS=64 → 结束 AIR=1360 WALL=48 ASH=64 VIRUS=64；中途曾现: ASH,VIRUS；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| ASH × VIRUS | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 ASH=576 VIRUS=576 → 结束 AIR=1656 WALL=72 ASH=576 VIRUS=576；中途曾现: ASH,VIRUS；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| ASH × SPRING | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 ASH=1 SPRING=1 → 结束 AIR=1439 WALL=48 ASH=1 WATER=47 SPRING=1；中途曾现: ASH,WATER,SPRING；新: WATER；消失: 无；Tmax 20.0°C | **PASS** |  |
| ASH × SPRING | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 ASH=64 SPRING=64 → 结束 AIR=1226 WALL=48 ASH=64 WATER=134 SPRING=64；中途曾现: ASH,WATER,SPRING；新: WATER；消失: 无；Tmax 20.0°C | **PASS** |  |
| ASH × SPRING | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 ASH=576 SPRING=576 → 结束 AIR=1336 WALL=72 ASH=576 WATER=320 SPRING=576；中途曾现: ASH,WATER,SPRING；新: WATER；消失: 无；Tmax 20.0°C | **PASS** |  |
| ASH × TNT | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 ASH=1 TNT=1 → 结束 AIR=1486 WALL=48 ASH=1 TNT=1；中途曾现: ASH,TNT；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| ASH × TNT | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 ASH=64 TNT=64 → 结束 AIR=1360 WALL=48 ASH=64 TNT=64；中途曾现: ASH,TNT；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| ASH × TNT | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 ASH=576 TNT=576 → 结束 AIR=1656 WALL=72 ASH=576 TNT=576；中途曾现: ASH,TNT；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| COAL × COAL | small | 同种物质相邻：自然堆叠/流动/相变，无化学变化 | 起始 AIR=1487 WALL=48 COAL=1 → 结束 AIR=1487 WALL=48 COAL=1；中途曾现: COAL；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| COAL × COAL | mid | 同种物质相邻：自然堆叠/流动/相变，无化学变化 | 起始 AIR=1424 WALL=48 COAL=64 → 结束 AIR=1424 WALL=48 COAL=64；中途曾现: COAL；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| COAL × COAL | large | 同种物质相邻：自然堆叠/流动/相变，无化学变化 | 起始 AIR=2232 WALL=72 COAL=576 → 结束 AIR=2232 WALL=72 COAL=576；中途曾现: COAL；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| COAL × GUNPOWDER | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 COAL=1 GUNPOWDER=1 → 结束 AIR=1486 WALL=48 COAL=1 GUNPOWDER=1；中途曾现: COAL,GUNPOWDER；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| COAL × GUNPOWDER | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 COAL=64 GUNPOWDER=64 → 结束 AIR=1360 WALL=48 COAL=64 GUNPOWDER=64；中途曾现: COAL,GUNPOWDER；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| COAL × GUNPOWDER | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 COAL=576 GUNPOWDER=576 → 结束 AIR=1656 WALL=72 COAL=576 GUNPOWDER=576；中途曾现: COAL,GUNPOWDER；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| COAL × SEED | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 COAL=1 SEED=1 → 结束 AIR=1486 WALL=48 COAL=1 SEED=1；中途曾现: COAL,SEED；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| COAL × SEED | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 COAL=64 SEED=64 → 结束 AIR=1360 WALL=48 COAL=64 SEED=64；中途曾现: COAL,SEED；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| COAL × SEED | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 COAL=576 SEED=576 → 结束 AIR=1656 WALL=72 COAL=576 SEED=576；中途曾现: COAL,SEED；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| COAL × WATER | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 COAL=1 WATER=1 → 结束 AIR=1486 WALL=48 COAL=1 WATER=1；中途曾现: COAL,WATER；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| COAL × WATER | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 COAL=64 WATER=64 → 结束 AIR=1360 WALL=48 COAL=64 WATER=64；中途曾现: COAL,WATER；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| COAL × WATER | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 COAL=576 WATER=576 → 结束 AIR=1656 WALL=72 COAL=576 WATER=576；中途曾现: COAL,WATER；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| COAL × OIL | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 COAL=1 OIL=1 → 结束 AIR=1486 WALL=48 COAL=1 OIL=1；中途曾现: COAL,OIL；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| COAL × OIL | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 COAL=64 OIL=64 → 结束 AIR=1360 WALL=48 COAL=64 OIL=64；中途曾现: COAL,OIL；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| COAL × OIL | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 COAL=576 OIL=576 → 结束 AIR=1656 WALL=72 COAL=576 OIL=576；中途曾现: COAL,OIL；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| COAL × LAVA | small | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1486 WALL=48 COAL=1 LAVA=1 → 结束 AIR=1486 WALL=48 STONE=1 COAL=1；中途曾现: STONE,COAL,LAVA；新: STONE；消失: LAVA；Tmax 40.6°C | **PASS** |  |
| COAL × LAVA | mid | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1360 WALL=48 COAL=64 LAVA=64 → 结束 AIR=1360 WALL=48 STONE=64 COAL=64；中途曾现: STONE,COAL,LAVA；新: STONE；消失: LAVA；Tmax 368.8°C | **PASS** |  |
| COAL × LAVA | large | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1656 WALL=72 COAL=576 LAVA=576 → 结束 AIR=1656 WALL=72 STONE=545 COAL=576 LAVA=31；中途曾现: STONE,COAL,LAVA；新: STONE；消失: 无；Tmax 699.7°C | **PASS** |  |
| COAL × ACID | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 COAL=1 ACID=1 → 结束 AIR=1486 WALL=48 COAL=1 ACID=1；中途曾现: COAL,ACID；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| COAL × ACID | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 COAL=64 ACID=64 → 结束 AIR=1360 WALL=48 COAL=64 ACID=64；中途曾现: COAL,ACID；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| COAL × ACID | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 COAL=576 ACID=576 → 结束 AIR=1656 WALL=72 COAL=576 ACID=576；中途曾现: COAL,ACID；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| COAL × LN2 | small | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1486 WALL=48 COAL=1 LN2=1 → 结束 AIR=1487 WALL=48 COAL=1；中途曾现: COAL,LN2；新: 无；消失: LN2；Tmax 20.0°C | **PASS** |  |
| COAL × LN2 | mid | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1360 WALL=48 COAL=64 LN2=64 → 结束 AIR=1424 WALL=48 COAL=64；中途曾现: COAL,LN2；新: 无；消失: LN2；Tmax 20.0°C | **PASS** |  |
| COAL × LN2 | large | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1656 WALL=72 COAL=576 LN2=576 → 结束 AIR=2232 WALL=72 COAL=576；中途曾现: COAL,LN2；新: 无；消失: LN2；Tmax 20.0°C | **PASS** |  |
| COAL × STEAM | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 COAL=1 STEAM=1 → 结束 AIR=1487 WALL=48 COAL=1；中途曾现: COAL,STEAM；新: 无；消失: STEAM；Tmax 20.0°C | **PASS** |  |
| COAL × STEAM | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 COAL=64 STEAM=64 → 结束 AIR=1413 WALL=48 COAL=64 WATER=11；中途曾现: COAL,WATER,STEAM；新: WATER；消失: STEAM；Tmax 20.0°C | **PASS** |  |
| COAL × STEAM | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 COAL=576 STEAM=576 → 结束 AIR=2055 WALL=72 COAL=576 WATER=177；中途曾现: COAL,WATER,STEAM；新: WATER；消失: STEAM；Tmax 20.0°C | **PASS** |  |
| COAL × SMOKE | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 COAL=1 SMOKE=1 → 结束 AIR=1487 WALL=48 COAL=1；中途曾现: COAL,SMOKE；新: 无；消失: SMOKE；Tmax 20.0°C | **PASS** |  |
| COAL × SMOKE | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 COAL=64 SMOKE=64 → 结束 AIR=1424 WALL=48 COAL=64；中途曾现: COAL,SMOKE；新: 无；消失: SMOKE；Tmax 20.0°C | **PASS** |  |
| COAL × SMOKE | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 COAL=576 SMOKE=576 → 结束 AIR=2232 WALL=72 COAL=576；中途曾现: COAL,SMOKE；新: 无；消失: SMOKE；Tmax 20.0°C | **PASS** |  |
| COAL × FIRE | small | 煤燃点较高但耐烧、放热多，烧尽成灰（大部分应被烧掉） | 起始 AIR=1486 WALL=48 COAL=1 FIRE=1 → 结束 AIR=1487 WALL=48 COAL=1；中途曾现: COAL,FIRE；新: 无；消失: FIRE；Tmax 20.2°C | **FAIL** | 见不合理清单·火离开燃料 |
| COAL × FIRE | mid | 煤燃点较高但耐烧、放热多，烧尽成灰（大部分应被烧掉） | 起始 AIR=1360 WALL=48 COAL=64 FIRE=64 → 结束 AIR=1424 WALL=48 COAL=64；中途曾现: COAL,SMOKE,FIRE；新: 无；消失: FIRE；Tmax 23.3°C | **FAIL** | 见不合理清单·火离开燃料 |
| COAL × FIRE | large | 煤燃点较高但耐烧、放热多，烧尽成灰（大部分应被烧掉） | 起始 AIR=1656 WALL=72 COAL=576 FIRE=576 → 结束 AIR=2233 WALL=72 COAL=575；中途曾现: COAL,SMOKE,FIRE；新: 无；消失: FIRE；Tmax 61.8°C | **FAIL** | 见不合理清单·火离开燃料 |
| COAL × GAS | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 COAL=1 GAS=1 → 结束 AIR=1487 WALL=48 COAL=1；中途曾现: COAL,GAS；新: 无；消失: GAS；Tmax 20.0°C | **PASS** |  |
| COAL × GAS | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 COAL=64 GAS=64 → 结束 AIR=1424 WALL=48 COAL=64；中途曾现: COAL,GAS；新: 无；消失: GAS；Tmax 20.0°C | **PASS** |  |
| COAL × GAS | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 COAL=576 GAS=576 → 结束 AIR=2232 WALL=72 COAL=576；中途曾现: COAL,GAS；新: 无；消失: GAS；Tmax 20.0°C | **PASS** |  |
| COAL × CLONE | small | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1486 WALL=48 COAL=1 CLONE=1 → 结束 AIR=1486 WALL=48 COAL=1 CLONE=1；中途曾现: COAL,CLONE；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| COAL × CLONE | mid | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1360 WALL=48 COAL=64 CLONE=64 → 结束 AIR=1360 WALL=48 COAL=64 CLONE=64；中途曾现: COAL,CLONE；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| COAL × CLONE | large | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1656 WALL=72 COAL=576 CLONE=576 → 结束 AIR=1656 WALL=72 COAL=576 CLONE=576；中途曾现: COAL,CLONE；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| COAL × VIRUS | small | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1486 WALL=48 COAL=1 VIRUS=1 → 结束 AIR=1486 WALL=48 COAL=1 VIRUS=1；中途曾现: COAL,VIRUS；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| COAL × VIRUS | mid | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1360 WALL=48 COAL=64 VIRUS=64 → 结束 AIR=1360 WALL=48 COAL=64 VIRUS=64；中途曾现: COAL,VIRUS；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| COAL × VIRUS | large | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1656 WALL=72 COAL=576 VIRUS=576 → 结束 AIR=1656 WALL=72 COAL=576 VIRUS=576；中途曾现: COAL,VIRUS；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| COAL × SPRING | small | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1486 WALL=48 COAL=1 SPRING=1 → 结束 AIR=1398 WALL=48 COAL=1 WATER=88 SPRING=1；中途曾现: COAL,WATER,SPRING；新: WATER；消失: 无；Tmax 20.0°C | **N/A** |  |
| COAL × SPRING | mid | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1360 WALL=48 COAL=64 SPRING=64 → 结束 AIR=1097 WALL=48 COAL=64 WATER=263 SPRING=64；中途曾现: COAL,WATER,SPRING；新: WATER；消失: 无；Tmax 20.0°C | **N/A** |  |
| COAL × SPRING | large | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1656 WALL=72 COAL=576 SPRING=576 → 结束 AIR=1291 WALL=72 COAL=576 WATER=365 SPRING=576；中途曾现: COAL,WATER,SPRING；新: WATER；消失: 无；Tmax 20.0°C | **N/A** |  |
| COAL × TNT | small | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1486 WALL=48 COAL=1 TNT=1 → 结束 AIR=1486 WALL=48 COAL=1 TNT=1；中途曾现: COAL,TNT；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| COAL × TNT | mid | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1360 WALL=48 COAL=64 TNT=64 → 结束 AIR=1360 WALL=48 COAL=64 TNT=64；中途曾现: COAL,TNT；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| COAL × TNT | large | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1656 WALL=72 COAL=576 TNT=576 → 结束 AIR=1656 WALL=72 COAL=576 TNT=576；中途曾现: COAL,TNT；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| GUNPOWDER × GUNPOWDER | small | 同种物质相邻：自然堆叠/流动/相变，无化学变化 | 起始 AIR=1487 WALL=48 GUNPOWDER=1 → 结束 AIR=1487 WALL=48 GUNPOWDER=1；中途曾现: GUNPOWDER；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| GUNPOWDER × GUNPOWDER | mid | 同种物质相邻：自然堆叠/流动/相变，无化学变化 | 起始 AIR=1424 WALL=48 GUNPOWDER=64 → 结束 AIR=1424 WALL=48 GUNPOWDER=64；中途曾现: GUNPOWDER；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| GUNPOWDER × GUNPOWDER | large | 同种物质相邻：自然堆叠/流动/相变，无化学变化 | 起始 AIR=2232 WALL=72 GUNPOWDER=576 → 结束 AIR=2232 WALL=72 GUNPOWDER=576；中途曾现: GUNPOWDER；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| GUNPOWDER × SEED | small | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1486 WALL=48 GUNPOWDER=1 SEED=1 → 结束 AIR=1486 WALL=48 GUNPOWDER=1 SEED=1；中途曾现: GUNPOWDER,SEED；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| GUNPOWDER × SEED | mid | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1360 WALL=48 GUNPOWDER=64 SEED=64 → 结束 AIR=1360 WALL=48 GUNPOWDER=64 SEED=64；中途曾现: GUNPOWDER,SEED；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| GUNPOWDER × SEED | large | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1656 WALL=72 GUNPOWDER=576 SEED=576 → 结束 AIR=1656 WALL=72 GUNPOWDER=576 SEED=576；中途曾现: GUNPOWDER,SEED；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| GUNPOWDER × WATER | small | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1486 WALL=48 GUNPOWDER=1 WATER=1 → 结束 AIR=1486 WALL=48 GUNPOWDER=1 WATER=1；中途曾现: GUNPOWDER,WATER；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| GUNPOWDER × WATER | mid | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1360 WALL=48 GUNPOWDER=64 WATER=64 → 结束 AIR=1360 WALL=48 GUNPOWDER=64 WATER=64；中途曾现: GUNPOWDER,WATER；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| GUNPOWDER × WATER | large | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1656 WALL=72 GUNPOWDER=576 WATER=576 → 结束 AIR=1656 WALL=72 GUNPOWDER=576 WATER=576；中途曾现: GUNPOWDER,WATER；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| GUNPOWDER × OIL | small | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1486 WALL=48 GUNPOWDER=1 OIL=1 → 结束 AIR=1486 WALL=48 GUNPOWDER=1 OIL=1；中途曾现: GUNPOWDER,OIL；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| GUNPOWDER × OIL | mid | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1360 WALL=48 GUNPOWDER=64 OIL=64 → 结束 AIR=1360 WALL=48 GUNPOWDER=64 OIL=64；中途曾现: GUNPOWDER,OIL；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| GUNPOWDER × OIL | large | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1656 WALL=72 GUNPOWDER=576 OIL=576 → 结束 AIR=1656 WALL=72 GUNPOWDER=576 OIL=576；中途曾现: GUNPOWDER,OIL；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| GUNPOWDER × LAVA | small | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1486 WALL=48 GUNPOWDER=1 LAVA=1 → 结束 AIR=1486 WALL=48 STONE=1 GUNPOWDER=1；中途曾现: STONE,GUNPOWDER,LAVA；新: STONE；消失: LAVA；Tmax 40.6°C | **PASS** |  |
| GUNPOWDER × LAVA | mid | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1360 WALL=48 GUNPOWDER=64 LAVA=64 → 结束 AIR=1360 WALL=48 STONE=64 GUNPOWDER=64；中途曾现: STONE,GUNPOWDER,LAVA；新: STONE；消失: LAVA；Tmax 276.4°C | **PASS** |  |
| GUNPOWDER × LAVA | large | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1656 WALL=72 GUNPOWDER=576 LAVA=576 → 结束 AIR=1656 WALL=72 STONE=553 GUNPOWDER=576 LAVA=23；中途曾现: STONE,GUNPOWDER,LAVA；新: STONE；消失: 无；Tmax 699.7°C | **PASS** |  |
| GUNPOWDER × ACID | small | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1486 WALL=48 GUNPOWDER=1 ACID=1 → 结束 AIR=1486 WALL=48 GUNPOWDER=1 ACID=1；中途曾现: GUNPOWDER,ACID；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| GUNPOWDER × ACID | mid | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1360 WALL=48 GUNPOWDER=64 ACID=64 → 结束 AIR=1360 WALL=48 GUNPOWDER=64 ACID=64；中途曾现: GUNPOWDER,ACID；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| GUNPOWDER × ACID | large | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1656 WALL=72 GUNPOWDER=576 ACID=576 → 结束 AIR=1656 WALL=72 GUNPOWDER=576 ACID=576；中途曾现: GUNPOWDER,ACID；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| GUNPOWDER × LN2 | small | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1486 WALL=48 GUNPOWDER=1 LN2=1 → 结束 AIR=1487 WALL=48 GUNPOWDER=1；中途曾现: GUNPOWDER,LN2；新: 无；消失: LN2；Tmax 20.0°C | **PASS** |  |
| GUNPOWDER × LN2 | mid | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1360 WALL=48 GUNPOWDER=64 LN2=64 → 结束 AIR=1424 WALL=48 GUNPOWDER=64；中途曾现: GUNPOWDER,LN2；新: 无；消失: LN2；Tmax 20.0°C | **PASS** |  |
| GUNPOWDER × LN2 | large | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1656 WALL=72 GUNPOWDER=576 LN2=576 → 结束 AIR=2232 WALL=72 GUNPOWDER=576；中途曾现: GUNPOWDER,LN2；新: 无；消失: LN2；Tmax 20.0°C | **PASS** |  |
| GUNPOWDER × STEAM | small | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1486 WALL=48 GUNPOWDER=1 STEAM=1 → 结束 AIR=1487 WALL=48 GUNPOWDER=1；中途曾现: GUNPOWDER,STEAM；新: 无；消失: STEAM；Tmax 20.0°C | **PASS** |  |
| GUNPOWDER × STEAM | mid | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1360 WALL=48 GUNPOWDER=64 STEAM=64 → 结束 AIR=1414 WALL=48 GUNPOWDER=64 WATER=10；中途曾现: GUNPOWDER,WATER,STEAM；新: WATER；消失: STEAM；Tmax 20.0°C | **PASS** |  |
| GUNPOWDER × STEAM | large | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1656 WALL=72 GUNPOWDER=576 STEAM=576 → 结束 AIR=2066 WALL=72 GUNPOWDER=576 WATER=166；中途曾现: GUNPOWDER,WATER,STEAM；新: WATER；消失: STEAM；Tmax 20.0°C | **PASS** |  |
| GUNPOWDER × SMOKE | small | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1486 WALL=48 GUNPOWDER=1 SMOKE=1 → 结束 AIR=1487 WALL=48 GUNPOWDER=1；中途曾现: GUNPOWDER,SMOKE；新: 无；消失: SMOKE；Tmax 20.0°C | **PASS** |  |
| GUNPOWDER × SMOKE | mid | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1360 WALL=48 GUNPOWDER=64 SMOKE=64 → 结束 AIR=1424 WALL=48 GUNPOWDER=64；中途曾现: GUNPOWDER,SMOKE；新: 无；消失: SMOKE；Tmax 20.0°C | **PASS** |  |
| GUNPOWDER × SMOKE | large | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1656 WALL=72 GUNPOWDER=576 SMOKE=576 → 结束 AIR=2232 WALL=72 GUNPOWDER=576；中途曾现: GUNPOWDER,SMOKE；新: 无；消失: SMOKE；Tmax 20.0°C | **PASS** |  |
| GUNPOWDER × FIRE | small | 火药爆燃、极快蔓延清空 | 起始 AIR=1486 WALL=48 GUNPOWDER=1 FIRE=1 → 结束 AIR=1487 WALL=48 GUNPOWDER=1；中途曾现: GUNPOWDER,FIRE；新: 无；消失: FIRE；Tmax 20.2°C | **FAIL** |  |
| GUNPOWDER × FIRE | mid | 火药爆燃、极快蔓延清空 | 起始 AIR=1360 WALL=48 GUNPOWDER=64 FIRE=64 → 结束 AIR=1484 WALL=48 ASH=2 GUNPOWDER=2；中途曾现: ASH,GUNPOWDER,SMOKE,FIRE；新: ASH；消失: GUNPOWDER,FIRE；Tmax 35.0°C | **PASS** |  |
| GUNPOWDER × FIRE | large | 火药爆燃、极快蔓延清空 | 起始 AIR=1656 WALL=72 GUNPOWDER=576 FIRE=576 → 结束 AIR=2766 WALL=72 ASH=42；中途曾现: ASH,GUNPOWDER,SMOKE,FIRE；新: ASH；消失: GUNPOWDER,FIRE；Tmax 122.1°C | **PASS** |  |
| GUNPOWDER × GAS | small | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1486 WALL=48 GUNPOWDER=1 GAS=1 → 结束 AIR=1487 WALL=48 GUNPOWDER=1；中途曾现: GUNPOWDER,GAS；新: 无；消失: GAS；Tmax 20.0°C | **PASS** |  |
| GUNPOWDER × GAS | mid | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1360 WALL=48 GUNPOWDER=64 GAS=64 → 结束 AIR=1424 WALL=48 GUNPOWDER=64；中途曾现: GUNPOWDER,GAS；新: 无；消失: GAS；Tmax 20.0°C | **PASS** |  |
| GUNPOWDER × GAS | large | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1656 WALL=72 GUNPOWDER=576 GAS=576 → 结束 AIR=2232 WALL=72 GUNPOWDER=576；中途曾现: GUNPOWDER,GAS；新: 无；消失: GAS；Tmax 20.0°C | **PASS** |  |
| GUNPOWDER × CLONE | small | （科幻机制）克隆体复制相邻的可移动物质，使其数量增加 | 起始 AIR=1486 WALL=48 GUNPOWDER=1 CLONE=1 → 结束 AIR=1480 WALL=48 GUNPOWDER=7 CLONE=1；中途曾现: GUNPOWDER,CLONE；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| GUNPOWDER × CLONE | mid | （科幻机制）克隆体复制相邻的可移动物质，使其数量增加 | 起始 AIR=1360 WALL=48 GUNPOWDER=64 CLONE=64 → 结束 AIR=1305 WALL=48 GUNPOWDER=119 CLONE=64；中途曾现: GUNPOWDER,CLONE；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| GUNPOWDER × CLONE | large | （科幻机制）克隆体复制相邻的可移动物质，使其数量增加 | 起始 AIR=1656 WALL=72 GUNPOWDER=576 CLONE=576 → 结束 AIR=1397 WALL=72 GUNPOWDER=835 CLONE=576；中途曾现: GUNPOWDER,CLONE；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| GUNPOWDER × VIRUS | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 GUNPOWDER=1 VIRUS=1 → 结束 AIR=1486 WALL=48 GUNPOWDER=1 VIRUS=1；中途曾现: GUNPOWDER,VIRUS；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| GUNPOWDER × VIRUS | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 GUNPOWDER=64 VIRUS=64 → 结束 AIR=1360 WALL=48 GUNPOWDER=64 VIRUS=64；中途曾现: GUNPOWDER,VIRUS；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| GUNPOWDER × VIRUS | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 GUNPOWDER=576 VIRUS=576 → 结束 AIR=1656 WALL=72 GUNPOWDER=576 VIRUS=576；中途曾现: GUNPOWDER,VIRUS；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| GUNPOWDER × SPRING | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 GUNPOWDER=1 SPRING=1 → 结束 AIR=1398 WALL=48 GUNPOWDER=1 WATER=88 SPRING=1；中途曾现: GUNPOWDER,WATER,SPRING；新: WATER；消失: 无；Tmax 20.0°C | **PASS** |  |
| GUNPOWDER × SPRING | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 GUNPOWDER=64 SPRING=64 → 结束 AIR=1058 WALL=48 GUNPOWDER=64 WATER=302 SPRING=64；中途曾现: GUNPOWDER,WATER,SPRING；新: WATER；消失: 无；Tmax 20.0°C | **PASS** |  |
| GUNPOWDER × SPRING | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 GUNPOWDER=576 SPRING=576 → 结束 AIR=1192 WALL=72 GUNPOWDER=576 WATER=464 SPRING=576；中途曾现: GUNPOWDER,WATER,SPRING；新: WATER；消失: 无；Tmax 20.0°C | **PASS** |  |
| GUNPOWDER × TNT | small | 需引信/高温；无热源时两者均不自爆 | 起始 AIR=1486 WALL=48 GUNPOWDER=1 TNT=1 → 结束 AIR=1486 WALL=48 GUNPOWDER=1 TNT=1；中途曾现: GUNPOWDER,TNT；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| GUNPOWDER × TNT | mid | 需引信/高温；无热源时两者均不自爆 | 起始 AIR=1360 WALL=48 GUNPOWDER=64 TNT=64 → 结束 AIR=1360 WALL=48 GUNPOWDER=64 TNT=64；中途曾现: GUNPOWDER,TNT；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| GUNPOWDER × TNT | large | 需引信/高温；无热源时两者均不自爆 | 起始 AIR=1656 WALL=72 GUNPOWDER=576 TNT=576 → 结束 AIR=1656 WALL=72 GUNPOWDER=576 TNT=576；中途曾现: GUNPOWDER,TNT；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SEED × SEED | small | 同种物质相邻：自然堆叠/流动/相变，无化学变化 | 起始 AIR=1487 WALL=48 SEED=1 → 结束 AIR=1487 WALL=48 SEED=1；中途曾现: SEED；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| SEED × SEED | mid | 同种物质相邻：自然堆叠/流动/相变，无化学变化 | 起始 AIR=1424 WALL=48 SEED=64 → 结束 AIR=1424 WALL=48 SEED=64；中途曾现: SEED；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| SEED × SEED | large | 同种物质相邻：自然堆叠/流动/相变，无化学变化 | 起始 AIR=2232 WALL=72 SEED=576 → 结束 AIR=2232 WALL=72 SEED=576；中途曾现: SEED；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| SEED × WATER | small | 种子吸水膨胀并发芽（需温度适宜、着地、露头） | 起始 AIR=1486 WALL=48 SEED=1 WATER=1 → 结束 AIR=1486 WALL=48 SEED=1 WATER=1；中途曾现: SEED,WATER；新: 无；消失: 无；Tmax 20.0°C | **FAIL** | 最小剂量档下单格水会流失，可能无法复现发芽（用量敏感性，见报告） |
| SEED × WATER | mid | 种子吸水膨胀并发芽（需温度适宜、着地、露头） | 起始 AIR=1360 WALL=48 SEED=64 WATER=64 → 结束 AIR=1337 WALL=48 PLANT=65 SEED=52 WATER=34；中途曾现: PLANT,SEED,WATER；新: PLANT；消失: 无；Tmax 20.0°C | **PASS** | 最小剂量档下单格水会流失，可能无法复现发芽（用量敏感性，见报告） |
| SEED × WATER | large | 种子吸水膨胀并发芽（需温度适宜、着地、露头） | 起始 AIR=1656 WALL=72 SEED=576 WATER=576 → 结束 AIR=1619 WALL=72 PLANT=26 DUST=82 SEED=551 WATER=530；中途曾现: PLANT,DUST,SEED,WATER；新: PLANT,DUST；消失: 无；Tmax 20.0°C | **PASS** | 最小剂量档下单格水会流失，可能无法复现发芽（用量敏感性，见报告） |
| SEED × OIL | small | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1486 WALL=48 SEED=1 OIL=1 → 结束 AIR=1486 WALL=48 SEED=1 OIL=1；中途曾现: SEED,OIL；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SEED × OIL | mid | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1360 WALL=48 SEED=64 OIL=64 → 结束 AIR=1360 WALL=48 SEED=64 OIL=64；中途曾现: SEED,OIL；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SEED × OIL | large | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1656 WALL=72 SEED=576 OIL=576 → 结束 AIR=1656 WALL=72 SEED=576 OIL=576；中途曾现: SEED,OIL；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SEED × LAVA | small | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1486 WALL=48 SEED=1 LAVA=1 → 结束 AIR=1486 WALL=48 STONE=1 SEED=1；中途曾现: STONE,SEED,LAVA；新: STONE；消失: LAVA；Tmax 40.6°C | **PASS** |  |
| SEED × LAVA | mid | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1360 WALL=48 SEED=64 LAVA=64 → 结束 AIR=1391 WALL=48 STONE=64 ASH=33；中途曾现: STONE,ASH,SEED,LAVA；新: STONE,ASH；消失: SEED,LAVA；Tmax 275.3°C | **PASS** |  |
| SEED × LAVA | large | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1656 WALL=72 SEED=576 LAVA=576 → 结束 AIR=1922 WALL=72 STONE=554 ASH=277 SEED=33 LAVA=22；中途曾现: STONE,ASH,SEED,LAVA；新: STONE,ASH；消失: 无；Tmax 699.7°C | **PASS** |  |
| SEED × ACID | small | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1486 WALL=48 SEED=1 ACID=1 → 结束 AIR=1486 WALL=48 SEED=1 ACID=1；中途曾现: SEED,ACID；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SEED × ACID | mid | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1360 WALL=48 SEED=64 ACID=64 → 结束 AIR=1360 WALL=48 SEED=64 ACID=64；中途曾现: SEED,ACID；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SEED × ACID | large | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1656 WALL=72 SEED=576 ACID=576 → 结束 AIR=1656 WALL=72 SEED=576 ACID=576；中途曾现: SEED,ACID；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SEED × LN2 | small | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1486 WALL=48 SEED=1 LN2=1 → 结束 AIR=1487 WALL=48 SEED=1；中途曾现: SEED,LN2；新: 无；消失: LN2；Tmax 20.0°C | **PASS** |  |
| SEED × LN2 | mid | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1360 WALL=48 SEED=64 LN2=64 → 结束 AIR=1431 WALL=48 SEED=57；中途曾现: SEED,LN2；新: 无；消失: LN2；Tmax 20.0°C | **PASS** |  |
| SEED × LN2 | large | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1656 WALL=72 SEED=576 LN2=576 → 结束 AIR=2289 WALL=72 SEED=519；中途曾现: SEED,LN2；新: 无；消失: LN2；Tmax 20.0°C | **PASS** |  |
| SEED × STEAM | small | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1486 WALL=48 SEED=1 STEAM=1 → 结束 AIR=1487 WALL=48 SEED=1；中途曾现: SEED,STEAM；新: 无；消失: STEAM；Tmax 20.0°C | **PASS** |  |
| SEED × STEAM | mid | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1360 WALL=48 SEED=64 STEAM=64 → 结束 AIR=1403 WALL=48 DUST=30 SEED=55；中途曾现: PLANT,DUST,SEED,WATER,STEAM；新: PLANT,DUST,WATER；消失: STEAM；Tmax 20.0°C | **PASS** |  |
| SEED × STEAM | large | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1656 WALL=72 SEED=576 STEAM=576 → 结束 AIR=2049 WALL=72 PLANT=33 DUST=4 SEED=569 WATER=153；中途曾现: PLANT,DUST,SEED,WATER,STEAM；新: PLANT,DUST,WATER；消失: STEAM；Tmax 20.0°C | **PASS** |  |
| SEED × SMOKE | small | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1486 WALL=48 SEED=1 SMOKE=1 → 结束 AIR=1487 WALL=48 SEED=1；中途曾现: SEED,SMOKE；新: 无；消失: SMOKE；Tmax 20.0°C | **PASS** |  |
| SEED × SMOKE | mid | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1360 WALL=48 SEED=64 SMOKE=64 → 结束 AIR=1424 WALL=48 SEED=64；中途曾现: SEED,SMOKE；新: 无；消失: SMOKE；Tmax 20.0°C | **PASS** |  |
| SEED × SMOKE | large | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1656 WALL=72 SEED=576 SMOKE=576 → 结束 AIR=2232 WALL=72 SEED=576；中途曾现: SEED,SMOKE；新: 无；消失: SMOKE；Tmax 20.0°C | **PASS** |  |
| SEED × FIRE | small | 种子受热会失去活性或被烧毁（种子堆应被烧掉大部分） | 起始 AIR=1486 WALL=48 SEED=1 FIRE=1 → 结束 AIR=1487 WALL=48 SEED=1；中途曾现: SEED,FIRE；新: 无；消失: FIRE；Tmax 20.2°C | **FAIL** | 见不合理清单·火离开燃料 |
| SEED × FIRE | mid | 种子受热会失去活性或被烧毁（种子堆应被烧掉大部分） | 起始 AIR=1360 WALL=48 SEED=64 FIRE=64 → 结束 AIR=1426 WALL=48 SEED=62；中途曾现: SEED,SMOKE,FIRE；新: 无；消失: FIRE；Tmax 21.9°C | **FAIL** | 见不合理清单·火离开燃料 |
| SEED × FIRE | large | 种子受热会失去活性或被烧毁（种子堆应被烧掉大部分） | 起始 AIR=1656 WALL=72 SEED=576 FIRE=576 → 结束 AIR=2241 WALL=72 SEED=567；中途曾现: SEED,SMOKE,FIRE；新: 无；消失: FIRE；Tmax 56.8°C | **FAIL** | 见不合理清单·火离开燃料 |
| SEED × GAS | small | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1486 WALL=48 SEED=1 GAS=1 → 结束 AIR=1487 WALL=48 SEED=1；中途曾现: SEED,GAS；新: 无；消失: GAS；Tmax 20.0°C | **PASS** |  |
| SEED × GAS | mid | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1360 WALL=48 SEED=64 GAS=64 → 结束 AIR=1424 WALL=48 SEED=64；中途曾现: SEED,GAS；新: 无；消失: GAS；Tmax 20.0°C | **PASS** |  |
| SEED × GAS | large | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1656 WALL=72 SEED=576 GAS=576 → 结束 AIR=2232 WALL=72 SEED=576；中途曾现: SEED,GAS；新: 无；消失: GAS；Tmax 20.0°C | **PASS** |  |
| SEED × CLONE | small | （科幻机制）克隆体复制相邻的可移动物质，使其数量增加 | 起始 AIR=1486 WALL=48 SEED=1 CLONE=1 → 结束 AIR=1480 WALL=48 SEED=7 CLONE=1；中途曾现: SEED,CLONE；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SEED × CLONE | mid | （科幻机制）克隆体复制相邻的可移动物质，使其数量增加 | 起始 AIR=1360 WALL=48 SEED=64 CLONE=64 → 结束 AIR=1306 WALL=48 SEED=118 CLONE=64；中途曾现: SEED,CLONE；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SEED × CLONE | large | （科幻机制）克隆体复制相邻的可移动物质，使其数量增加 | 起始 AIR=1656 WALL=72 SEED=576 CLONE=576 → 结束 AIR=1397 WALL=72 SEED=835 CLONE=576；中途曾现: SEED,CLONE；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SEED × VIRUS | small | 现实中病毒一般不侵染种子；本作设定种子可被侵染 | 起始 AIR=1486 WALL=48 SEED=1 VIRUS=1 → 结束 AIR=1486 WALL=48 VIRUS=2；中途曾现: SEED,VIRUS；新: 无；消失: SEED；Tmax 20.0°C | **PASS** |  |
| SEED × VIRUS | mid | 现实中病毒一般不侵染种子；本作设定种子可被侵染 | 起始 AIR=1360 WALL=48 SEED=64 VIRUS=64 → 结束 AIR=1360 WALL=48 VIRUS=128；中途曾现: SEED,VIRUS；新: 无；消失: SEED；Tmax 20.0°C | **PASS** |  |
| SEED × VIRUS | large | 现实中病毒一般不侵染种子；本作设定种子可被侵染 | 起始 AIR=1656 WALL=72 SEED=576 VIRUS=576 → 结束 AIR=1656 WALL=72 VIRUS=1152；中途曾现: SEED,VIRUS；新: 无；消失: SEED；Tmax 20.0°C | **PASS** |  |
| SEED × SPRING | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 SEED=1 SPRING=1 → 结束 AIR=1407 WALL=48 SEED=1 WATER=79 SPRING=1；中途曾现: SEED,WATER,SPRING；新: WATER；消失: 无；Tmax 20.0°C | **PASS** |  |
| SEED × SPRING | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 SEED=64 SPRING=64 → 结束 AIR=1207 WALL=48 PLANT=33 SEED=59 WATER=125 SPRING=64；中途曾现: PLANT,DUST,SEED,WATER,SPRING；新: PLANT,DUST,WATER；消失: 无；Tmax 20.0°C | **PASS** |  |
| SEED × SPRING | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 SEED=576 SPRING=576 → 结束 AIR=1330 WALL=72 PLANT=12 SEED=573 WATER=317 SPRING=576；中途曾现: PLANT,SEED,WATER,SPRING；新: PLANT,WATER；消失: 无；Tmax 20.0°C | **PASS** |  |
| SEED × TNT | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 SEED=1 TNT=1 → 结束 AIR=1486 WALL=48 SEED=1 TNT=1；中途曾现: SEED,TNT；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SEED × TNT | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 SEED=64 TNT=64 → 结束 AIR=1360 WALL=48 SEED=64 TNT=64；中途曾现: SEED,TNT；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| SEED × TNT | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 SEED=576 TNT=576 → 结束 AIR=1656 WALL=72 SEED=576 TNT=576；中途曾现: SEED,TNT；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| WATER × WATER | small | 同种物质相邻：自然堆叠/流动/相变，无化学变化 | 起始 AIR=1487 WALL=48 WATER=1 → 结束 AIR=1487 WALL=48 WATER=1；中途曾现: WATER；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| WATER × WATER | mid | 同种物质相邻：自然堆叠/流动/相变，无化学变化 | 起始 AIR=1424 WALL=48 WATER=64 → 结束 AIR=1424 WALL=48 WATER=64；中途曾现: WATER；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| WATER × WATER | large | 同种物质相邻：自然堆叠/流动/相变，无化学变化 | 起始 AIR=2232 WALL=72 WATER=576 → 结束 AIR=2232 WALL=72 WATER=576；中途曾现: WATER；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| WATER × OIL | small | 油不溶于水、密度较小，浮在水面上形成分层 | 起始 AIR=1486 WALL=48 WATER=1 OIL=1 → 结束 AIR=1486 WALL=48 WATER=1 OIL=1；中途曾现: WATER,OIL；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| WATER × OIL | mid | 油不溶于水、密度较小，浮在水面上形成分层 | 起始 AIR=1360 WALL=48 WATER=64 OIL=64 → 结束 AIR=1360 WALL=48 WATER=64 OIL=64；中途曾现: WATER,OIL；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| WATER × OIL | large | 油不溶于水、密度较小，浮在水面上形成分层 | 起始 AIR=1656 WALL=72 WATER=576 OIL=576 → 结束 AIR=1656 WALL=72 WATER=576 OIL=576；中途曾现: WATER,OIL；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| WATER × LAVA | small | 岩浆遇水骤冷凝固成岩石，水剧烈汽化（沸腾飞溅） | 起始 AIR=1486 WALL=48 WATER=1 LAVA=1 → 结束 AIR=1487 WALL=48 STONE=1；中途曾现: STONE,WATER,LAVA,STEAM；新: STONE；消失: WATER,LAVA；Tmax 43.0°C | **PASS** |  |
| WATER × LAVA | mid | 岩浆遇水骤冷凝固成岩石，水剧烈汽化（沸腾飞溅） | 起始 AIR=1360 WALL=48 WATER=64 LAVA=64 → 结束 AIR=1382 WALL=48 STONE=64 WATER=42；中途曾现: STONE,WATER,LAVA,STEAM；新: STONE；消失: LAVA；Tmax 281.3°C | **PASS** |  |
| WATER × LAVA | large | 岩浆遇水骤冷凝固成岩石，水剧烈汽化（沸腾飞溅） | 起始 AIR=1656 WALL=72 WATER=576 LAVA=576 → 结束 AIR=1773 WALL=72 STONE=548 WATER=459 LAVA=28；中途曾现: STONE,WATER,LAVA,STEAM；新: STONE,STEAM；消失: 无；Tmax 699.7°C | **PASS** |  |
| WATER × ACID | small | 水与酸互溶稀释（放热）；本作按密度分层、无新物质 | 起始 AIR=1486 WALL=48 WATER=1 ACID=1 → 结束 AIR=1486 WALL=48 WATER=1 ACID=1；中途曾现: WATER,ACID；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| WATER × ACID | mid | 水与酸互溶稀释（放热）；本作按密度分层、无新物质 | 起始 AIR=1360 WALL=48 WATER=64 ACID=64 → 结束 AIR=1360 WALL=48 WATER=64 ACID=64；中途曾现: WATER,ACID；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| WATER × ACID | large | 水与酸互溶稀释（放热）；本作按密度分层、无新物质 | 起始 AIR=1656 WALL=72 WATER=576 ACID=576 → 结束 AIR=1656 WALL=72 WATER=576 ACID=576；中途曾现: WATER,ACID；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| WATER × LN2 | small | 液氮在温水中剧烈沸腾汽化（氮气返回大气），水被冻成冰 | 起始 AIR=1486 WALL=48 WATER=1 LN2=1 → 结束 AIR=1487 WALL=48 WATER=1；中途曾现: WATER,LN2；新: 无；消失: LN2；Tmax 20.0°C | **PASS** | 改造后 LN2→AIR，不再"凭空造水"（#3 已修复） |
| WATER × LN2 | mid | 液氮在温水中剧烈沸腾汽化（氮气返回大气），水被冻成冰 | 起始 AIR=1360 WALL=48 WATER=64 LN2=64 → 结束 AIR=1424 WALL=48 ICE=5 WATER=59；中途曾现: ICE,WATER,LN2；新: ICE；消失: LN2；Tmax 20.0°C | **PASS** | 改造后 LN2→AIR，不再"凭空造水"（#3 已修复） |
| WATER × LN2 | large | 液氮在温水中剧烈沸腾汽化（氮气返回大气），水被冻成冰 | 起始 AIR=1656 WALL=72 WATER=576 LN2=576 → 结束 AIR=2232 WALL=72 ICE=64 WATER=512；中途曾现: ICE,WATER,LN2；新: ICE；消失: LN2；Tmax 20.0°C | **PASS** | 改造后 LN2→AIR，不再"凭空造水"（#3 已修复） |
| WATER × STEAM | small | 蒸汽在水中上升冒泡，遇冷可冷凝回水 | 起始 AIR=1486 WALL=48 WATER=1 STEAM=1 → 结束 AIR=1487 WALL=48 WATER=1；中途曾现: WATER,STEAM；新: 无；消失: STEAM；Tmax 20.0°C | **PASS** |  |
| WATER × STEAM | mid | 蒸汽在水中上升冒泡，遇冷可冷凝回水 | 起始 AIR=1360 WALL=48 WATER=64 STEAM=64 → 结束 AIR=1412 WALL=48 WATER=76；中途曾现: WATER,STEAM；新: 无；消失: STEAM；Tmax 20.0°C | **PASS** |  |
| WATER × STEAM | large | 蒸汽在水中上升冒泡，遇冷可冷凝回水 | 起始 AIR=1656 WALL=72 WATER=576 STEAM=576 → 结束 AIR=2067 WALL=72 WATER=741；中途曾现: WATER,STEAM；新: 无；消失: STEAM；Tmax 20.0°C | **PASS** |  |
| WATER × SMOKE | small | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1486 WALL=48 WATER=1 SMOKE=1 → 结束 AIR=1487 WALL=48 WATER=1；中途曾现: WATER,SMOKE；新: 无；消失: SMOKE；Tmax 20.0°C | **PASS** |  |
| WATER × SMOKE | mid | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1360 WALL=48 WATER=64 SMOKE=64 → 结束 AIR=1424 WALL=48 WATER=64；中途曾现: WATER,SMOKE；新: 无；消失: SMOKE；Tmax 20.0°C | **PASS** |  |
| WATER × SMOKE | large | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1656 WALL=72 WATER=576 SMOKE=576 → 结束 AIR=2232 WALL=72 WATER=576；中途曾现: WATER,SMOKE；新: 无；消失: SMOKE；Tmax 20.0°C | **PASS** |  |
| WATER × FIRE | small | 水吸热汽化并把火浇灭，水面冒蒸汽（现实中水灭火以水蒸气为主、基本不产生烟） | 起始 AIR=1486 WALL=48 WATER=1 FIRE=1 → 结束 AIR=1487 WALL=48 WATER=1；中途曾现: WATER,FIRE；新: 无；消失: FIRE；Tmax 20.2°C | **PASS** | 判据局限：火有固有寿命，FIRE==0 不足以单独证明"被浇灭" |
| WATER × FIRE | mid | 水吸热汽化并把火浇灭，水面冒蒸汽（现实中水灭火以水蒸气为主、基本不产生烟） | 起始 AIR=1360 WALL=48 WATER=64 FIRE=64 → 结束 AIR=1430 WALL=48 WATER=58；中途曾现: WATER,STEAM,SMOKE,FIRE；新: 无；消失: FIRE；Tmax 22.4°C | **PASS** | 判据局限：火有固有寿命，FIRE==0 不足以单独证明"被浇灭" |
| WATER × FIRE | large | 水吸热汽化并把火浇灭，水面冒蒸汽（现实中水灭火以水蒸气为主、基本不产生烟） | 起始 AIR=1656 WALL=72 WATER=576 FIRE=576 → 结束 AIR=2257 WALL=72 WATER=551；中途曾现: WATER,STEAM,SMOKE,FIRE；新: 无；消失: FIRE；Tmax 54.6°C | **PASS** | 判据局限：火有固有寿命，FIRE==0 不足以单独证明"被浇灭" |
| WATER × GAS | small | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1486 WALL=48 WATER=1 GAS=1 → 结束 AIR=1487 WALL=48 WATER=1；中途曾现: WATER,GAS；新: 无；消失: GAS；Tmax 20.0°C | **PASS** |  |
| WATER × GAS | mid | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1360 WALL=48 WATER=64 GAS=64 → 结束 AIR=1424 WALL=48 WATER=64；中途曾现: WATER,GAS；新: 无；消失: GAS；Tmax 20.0°C | **PASS** |  |
| WATER × GAS | large | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1656 WALL=72 WATER=576 GAS=576 → 结束 AIR=2232 WALL=72 WATER=576；中途曾现: WATER,GAS；新: 无；消失: GAS；Tmax 20.0°C | **PASS** |  |
| WATER × CLONE | small | （科幻机制）克隆体复制相邻的可移动物质；目标为气体/易相变物质，数量受逸出与相变干扰，不单独判数量 | 起始 AIR=1486 WALL=48 WATER=1 CLONE=1 → 结束 AIR=1392 WALL=48 WATER=95 CLONE=1；中途曾现: WATER,CLONE；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| WATER × CLONE | mid | （科幻机制）克隆体复制相邻的可移动物质；目标为气体/易相变物质，数量受逸出与相变干扰，不单独判数量 | 起始 AIR=1360 WALL=48 WATER=64 CLONE=64 → 结束 AIR=1056 WALL=48 WATER=368 CLONE=64；中途曾现: WATER,CLONE；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| WATER × CLONE | large | （科幻机制）克隆体复制相邻的可移动物质；目标为气体/易相变物质，数量受逸出与相变干扰，不单独判数量 | 起始 AIR=1656 WALL=72 WATER=576 CLONE=576 → 结束 AIR=1040 WALL=72 WATER=1192 CLONE=576；中途曾现: WATER,CLONE；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| WATER × VIRUS | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 WATER=1 VIRUS=1 → 结束 AIR=1486 WALL=48 WATER=1 VIRUS=1；中途曾现: WATER,VIRUS；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| WATER × VIRUS | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 WATER=64 VIRUS=64 → 结束 AIR=1360 WALL=48 WATER=64 VIRUS=64；中途曾现: WATER,VIRUS；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| WATER × VIRUS | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 WATER=576 VIRUS=576 → 结束 AIR=1656 WALL=72 WATER=576 VIRUS=576；中途曾现: WATER,VIRUS；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| WATER × SPRING | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 WATER=1 SPRING=1 → 结束 AIR=1398 WALL=48 WATER=89 SPRING=1；中途曾现: WATER,SPRING；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| WATER × SPRING | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 WATER=64 SPRING=64 → 结束 AIR=1056 WALL=48 WATER=368 SPRING=64；中途曾现: WATER,SPRING；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| WATER × SPRING | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 WATER=576 SPRING=576 → 结束 AIR=1042 WALL=72 WATER=1190 SPRING=576；中途曾现: WATER,SPRING；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| WATER × TNT | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 WATER=1 TNT=1 → 结束 AIR=1486 WALL=48 WATER=1 TNT=1；中途曾现: WATER,TNT；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| WATER × TNT | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 WATER=64 TNT=64 → 结束 AIR=1360 WALL=48 WATER=64 TNT=64；中途曾现: WATER,TNT；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| WATER × TNT | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 WATER=576 TNT=576 → 结束 AIR=1656 WALL=72 WATER=576 TNT=576；中途曾现: WATER,TNT；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| OIL × OIL | small | 同种物质相邻：自然堆叠/流动/相变，无化学变化 | 起始 AIR=1487 WALL=48 OIL=1 → 结束 AIR=1487 WALL=48 OIL=1；中途曾现: OIL；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| OIL × OIL | mid | 同种物质相邻：自然堆叠/流动/相变，无化学变化 | 起始 AIR=1424 WALL=48 OIL=64 → 结束 AIR=1424 WALL=48 OIL=64；中途曾现: OIL；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| OIL × OIL | large | 同种物质相邻：自然堆叠/流动/相变，无化学变化 | 起始 AIR=2232 WALL=72 OIL=576 → 结束 AIR=2232 WALL=72 OIL=576；中途曾现: OIL；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| OIL × LAVA | small | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1486 WALL=48 OIL=1 LAVA=1 → 结束 AIR=1486 WALL=48 STONE=1 OIL=1；中途曾现: STONE,OIL,LAVA；新: STONE；消失: LAVA；Tmax 40.4°C | **PASS** |  |
| OIL × LAVA | mid | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1360 WALL=48 OIL=64 LAVA=64 → 结束 AIR=1360 WALL=48 STONE=64 OIL=64；中途曾现: STONE,OIL,LAVA；新: STONE；消失: LAVA；Tmax 267.3°C | **PASS** |  |
| OIL × LAVA | large | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1656 WALL=72 OIL=576 LAVA=576 → 结束 AIR=1656 WALL=72 STONE=554 OIL=576 LAVA=22；中途曾现: STONE,OIL,LAVA；新: STONE；消失: 无；Tmax 699.7°C | **PASS** |  |
| OIL × ACID | small | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1486 WALL=48 OIL=1 ACID=1 → 结束 AIR=1486 WALL=48 OIL=1 ACID=1；中途曾现: OIL,ACID；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| OIL × ACID | mid | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1360 WALL=48 OIL=64 ACID=64 → 结束 AIR=1360 WALL=48 OIL=64 ACID=64；中途曾现: OIL,ACID；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| OIL × ACID | large | 两种可移动物质（粉末/液体）相邻：按密度分层/混合，无化学变化 | 起始 AIR=1656 WALL=72 OIL=576 ACID=576 → 结束 AIR=1656 WALL=72 OIL=576 ACID=576；中途曾现: OIL,ACID；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| OIL × LN2 | small | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1486 WALL=48 OIL=1 LN2=1 → 结束 AIR=1487 WALL=48 OIL=1；中途曾现: OIL,LN2；新: 无；消失: LN2；Tmax 20.0°C | **PASS** |  |
| OIL × LN2 | mid | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1360 WALL=48 OIL=64 LN2=64 → 结束 AIR=1424 WALL=48 OIL=64；中途曾现: OIL,LN2；新: 无；消失: LN2；Tmax 20.0°C | **PASS** |  |
| OIL × LN2 | large | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1656 WALL=72 OIL=576 LN2=576 → 结束 AIR=2232 WALL=72 OIL=576；中途曾现: OIL,LN2；新: 无；消失: LN2；Tmax 20.0°C | **PASS** |  |
| OIL × STEAM | small | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1486 WALL=48 OIL=1 STEAM=1 → 结束 AIR=1487 WALL=48 OIL=1；中途曾现: OIL,STEAM；新: 无；消失: STEAM；Tmax 20.0°C | **PASS** |  |
| OIL × STEAM | mid | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1360 WALL=48 OIL=64 STEAM=64 → 结束 AIR=1415 WALL=48 WATER=9 OIL=64；中途曾现: WATER,OIL,STEAM；新: WATER；消失: STEAM；Tmax 20.0°C | **PASS** |  |
| OIL × STEAM | large | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1656 WALL=72 OIL=576 STEAM=576 → 结束 AIR=2065 WALL=72 WATER=167 OIL=576；中途曾现: WATER,OIL,STEAM；新: WATER；消失: STEAM；Tmax 20.0°C | **PASS** |  |
| OIL × SMOKE | small | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1486 WALL=48 OIL=1 SMOKE=1 → 结束 AIR=1487 WALL=48 OIL=1；中途曾现: OIL,SMOKE；新: 无；消失: SMOKE；Tmax 20.0°C | **PASS** |  |
| OIL × SMOKE | mid | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1360 WALL=48 OIL=64 SMOKE=64 → 结束 AIR=1424 WALL=48 OIL=64；中途曾现: OIL,SMOKE；新: 无；消失: SMOKE；Tmax 20.0°C | **PASS** |  |
| OIL × SMOKE | large | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1656 WALL=72 OIL=576 SMOKE=576 → 结束 AIR=2232 WALL=72 OIL=576；中途曾现: OIL,SMOKE；新: 无；消失: SMOKE；Tmax 20.0°C | **PASS** |  |
| OIL × FIRE | small | 油燃点低、易燃，火势猛烈，燃尽基本无残渣（大部分应被烧掉） | 起始 AIR=1486 WALL=48 OIL=1 FIRE=1 → 结束 AIR=1487 WALL=48 OIL=1；中途曾现: OIL,FIRE；新: 无；消失: FIRE；Tmax 20.2°C | **FAIL** | 见不合理清单·火离开燃料 |
| OIL × FIRE | mid | 油燃点低、易燃，火势猛烈，燃尽基本无残渣（大部分应被烧掉） | 起始 AIR=1360 WALL=48 OIL=64 FIRE=64 → 结束 AIR=1427 WALL=48 OIL=61；中途曾现: OIL,SMOKE,FIRE；新: 无；消失: FIRE；Tmax 22.8°C | **FAIL** | 见不合理清单·火离开燃料 |
| OIL × FIRE | large | 油燃点低、易燃，火势猛烈，燃尽基本无残渣（大部分应被烧掉） | 起始 AIR=1656 WALL=72 OIL=576 FIRE=576 → 结束 AIR=2258 WALL=72 OIL=550；中途曾现: ASH,OIL,SMOKE,FIRE；新: ASH；消失: FIRE；Tmax 57.6°C | **FAIL** | 见不合理清单·火离开燃料 |
| OIL × GAS | small | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1486 WALL=48 OIL=1 GAS=1 → 结束 AIR=1487 WALL=48 OIL=1；中途曾现: OIL,GAS；新: 无；消失: GAS；Tmax 20.0°C | **PASS** |  |
| OIL × GAS | mid | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1360 WALL=48 OIL=64 GAS=64 → 结束 AIR=1424 WALL=48 OIL=64；中途曾现: OIL,GAS；新: 无；消失: GAS；Tmax 20.0°C | **PASS** |  |
| OIL × GAS | large | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1656 WALL=72 OIL=576 GAS=576 → 结束 AIR=2232 WALL=72 OIL=576；中途曾现: OIL,GAS；新: 无；消失: GAS；Tmax 20.0°C | **PASS** |  |
| OIL × CLONE | small | （科幻机制）克隆体复制相邻的可移动物质，使其数量增加 | 起始 AIR=1486 WALL=48 OIL=1 CLONE=1 → 结束 AIR=1397 WALL=48 OIL=90 CLONE=1；中途曾现: OIL,CLONE；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| OIL × CLONE | mid | （科幻机制）克隆体复制相邻的可移动物质，使其数量增加 | 起始 AIR=1360 WALL=48 OIL=64 CLONE=64 → 结束 AIR=1062 WALL=48 OIL=362 CLONE=64；中途曾现: OIL,CLONE；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| OIL × CLONE | large | （科幻机制）克隆体复制相邻的可移动物质，使其数量增加 | 起始 AIR=1656 WALL=72 OIL=576 CLONE=576 → 结束 AIR=1070 WALL=72 OIL=1162 CLONE=576；中途曾现: OIL,CLONE；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| OIL × VIRUS | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 OIL=1 VIRUS=1 → 结束 AIR=1486 WALL=48 OIL=1 VIRUS=1；中途曾现: OIL,VIRUS；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| OIL × VIRUS | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 OIL=64 VIRUS=64 → 结束 AIR=1360 WALL=48 OIL=64 VIRUS=64；中途曾现: OIL,VIRUS；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| OIL × VIRUS | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 OIL=576 VIRUS=576 → 结束 AIR=1656 WALL=72 OIL=576 VIRUS=576；中途曾现: OIL,VIRUS；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| OIL × SPRING | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 OIL=1 SPRING=1 → 结束 AIR=1401 WALL=48 WATER=85 OIL=1 SPRING=1；中途曾现: WATER,OIL,SPRING；新: WATER；消失: 无；Tmax 20.0°C | **PASS** |  |
| OIL × SPRING | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 OIL=64 SPRING=64 → 结束 AIR=1067 WALL=48 WATER=293 OIL=64 SPRING=64；中途曾现: WATER,OIL,SPRING；新: WATER；消失: 无；Tmax 20.0°C | **PASS** |  |
| OIL × SPRING | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 OIL=576 SPRING=576 → 结束 AIR=1079 WALL=72 WATER=577 OIL=576 SPRING=576；中途曾现: WATER,OIL,SPRING；新: WATER；消失: 无；Tmax 20.0°C | **PASS** |  |
| OIL × TNT | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 OIL=1 TNT=1 → 结束 AIR=1486 WALL=48 OIL=1 TNT=1；中途曾现: OIL,TNT；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| OIL × TNT | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 OIL=64 TNT=64 → 结束 AIR=1360 WALL=48 OIL=64 TNT=64；中途曾现: OIL,TNT；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| OIL × TNT | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 OIL=576 TNT=576 → 结束 AIR=1656 WALL=72 OIL=576 TNT=576；中途曾现: OIL,TNT；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| LAVA × LAVA | small | 同种物质相邻：自然堆叠/流动/相变，无化学变化 | 起始 AIR=1487 WALL=48 LAVA=1 → 结束 AIR=1487 WALL=48 STONE=1；中途曾现: STONE,LAVA；新: STONE；消失: LAVA；Tmax 37.2°C | **N/A** |  |
| LAVA × LAVA | mid | 同种物质相邻：自然堆叠/流动/相变，无化学变化 | 起始 AIR=1424 WALL=48 LAVA=64 → 结束 AIR=1424 WALL=48 STONE=64；中途曾现: STONE,LAVA；新: STONE；消失: LAVA；Tmax 265.1°C | **N/A** |  |
| LAVA × LAVA | large | 同种物质相邻：自然堆叠/流动/相变，无化学变化 | 起始 AIR=2232 WALL=72 LAVA=576 → 结束 AIR=2232 WALL=72 STONE=553 LAVA=23；中途曾现: STONE,LAVA；新: STONE；消失: 无；Tmax 699.7°C | **N/A** |  |
| LAVA × ACID | small | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1486 WALL=48 LAVA=1 ACID=1 → 结束 AIR=1487 WALL=48 ACID=1；中途曾现: STONE,LAVA,ACID；新: 无；消失: LAVA；Tmax 32.9°C | **PASS** |  |
| LAVA × ACID | mid | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1360 WALL=48 LAVA=64 ACID=64 → 结束 AIR=1440 WALL=48 ACID=48；中途曾现: STONE,LAVA,ACID；新: 无；消失: LAVA；Tmax 129.6°C | **PASS** |  |
| LAVA × ACID | large | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1656 WALL=72 LAVA=576 ACID=576 → 结束 AIR=2291 WALL=72 STONE=72 ACID=445；中途曾现: STONE,LAVA,ACID；新: STONE；消失: LAVA；Tmax 678.8°C | **PASS** |  |
| LAVA × LN2 | small | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1486 WALL=48 LAVA=1 LN2=1 → 结束 AIR=1487 WALL=48 STONE=1；中途曾现: STONE,LAVA,LN2；新: STONE；消失: LAVA,LN2；Tmax 37.3°C | **PASS** |  |
| LAVA × LN2 | mid | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1360 WALL=48 LAVA=64 LN2=64 → 结束 AIR=1424 WALL=48 STONE=64；中途曾现: STONE,LAVA,LN2；新: STONE；消失: LAVA,LN2；Tmax 242.0°C | **PASS** |  |
| LAVA × LN2 | large | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1656 WALL=72 LAVA=576 LN2=576 → 结束 AIR=2232 WALL=72 STONE=551 LAVA=25；中途曾现: STONE,LAVA,LN2；新: STONE；消失: LN2；Tmax 699.7°C | **PASS** |  |
| LAVA × STEAM | small | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1486 WALL=48 LAVA=1 STEAM=1 → 结束 AIR=1487 WALL=48 STONE=1；中途曾现: STONE,LAVA,STEAM；新: STONE；消失: LAVA,STEAM；Tmax 37.2°C | **PASS** |  |
| LAVA × STEAM | mid | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1360 WALL=48 LAVA=64 STEAM=64 → 结束 AIR=1422 WALL=48 STONE=64 WATER=2；中途曾现: STONE,WATER,LAVA,STEAM；新: STONE,WATER；消失: LAVA,STEAM；Tmax 285.9°C | **PASS** |  |
| LAVA × STEAM | large | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1656 WALL=72 LAVA=576 STEAM=576 → 结束 AIR=2170 WALL=72 STONE=543 WATER=60 LAVA=33 STEAM=2；中途曾现: STONE,WATER,LAVA,STEAM；新: STONE,WATER；消失: STEAM；Tmax 699.7°C | **PASS** |  |
| LAVA × SMOKE | small | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1486 WALL=48 LAVA=1 SMOKE=1 → 结束 AIR=1487 WALL=48 STONE=1；中途曾现: STONE,LAVA,SMOKE；新: STONE；消失: LAVA,SMOKE；Tmax 37.2°C | **PASS** |  |
| LAVA × SMOKE | mid | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1360 WALL=48 LAVA=64 SMOKE=64 → 结束 AIR=1424 WALL=48 STONE=64；中途曾现: STONE,LAVA,SMOKE；新: STONE；消失: LAVA,SMOKE；Tmax 265.2°C | **PASS** |  |
| LAVA × SMOKE | large | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1656 WALL=72 LAVA=576 SMOKE=576 → 结束 AIR=2232 WALL=72 STONE=554 LAVA=22；中途曾现: STONE,LAVA,SMOKE；新: STONE；消失: SMOKE；Tmax 699.7°C | **PASS** |  |
| LAVA × FIRE | small | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1486 WALL=48 LAVA=1 FIRE=1 → 结束 AIR=1487 WALL=48 STONE=1；中途曾现: STONE,LAVA,FIRE；新: STONE；消失: LAVA,FIRE；Tmax 37.2°C | **PASS** |  |
| LAVA × FIRE | mid | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1360 WALL=48 LAVA=64 FIRE=64 → 结束 AIR=1424 WALL=48 STONE=64；中途曾现: STONE,LAVA,SMOKE,FIRE；新: STONE；消失: LAVA,FIRE；Tmax 265.3°C | **PASS** |  |
| LAVA × FIRE | large | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1656 WALL=72 LAVA=576 FIRE=576 → 结束 AIR=2232 WALL=72 STONE=550 LAVA=26；中途曾现: STONE,LAVA,SMOKE,FIRE；新: STONE；消失: FIRE；Tmax 699.7°C | **PASS** |  |
| LAVA × GAS | small | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1486 WALL=48 LAVA=1 GAS=1 → 结束 AIR=1487 WALL=48 STONE=1；中途曾现: STONE,LAVA,GAS；新: STONE；消失: LAVA,GAS；Tmax 37.2°C | **PASS** |  |
| LAVA × GAS | mid | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1360 WALL=48 LAVA=64 GAS=64 → 结束 AIR=1424 WALL=48 STONE=64；中途曾现: STONE,LAVA,GAS；新: STONE；消失: LAVA,GAS；Tmax 243.0°C | **PASS** |  |
| LAVA × GAS | large | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1656 WALL=72 LAVA=576 GAS=576 → 结束 AIR=2232 WALL=72 STONE=552 LAVA=24；中途曾现: STONE,LAVA,GAS；新: STONE；消失: GAS；Tmax 699.7°C | **PASS** |  |
| LAVA × CLONE | small | （科幻机制）克隆体复制相邻的可移动物质；目标为气体/易相变物质，数量受逸出与相变干扰，不单独判数量 | 起始 AIR=1486 WALL=48 LAVA=1 CLONE=1 → 结束 AIR=1480 WALL=48 STONE=7 CLONE=1；中途曾现: STONE,LAVA,CLONE；新: STONE；消失: LAVA；Tmax 40.1°C | **PASS** |  |
| LAVA × CLONE | mid | （科幻机制）克隆体复制相邻的可移动物质；目标为气体/易相变物质，数量受逸出与相变干扰，不单独判数量 | 起始 AIR=1360 WALL=48 LAVA=64 CLONE=64 → 结束 AIR=1319 WALL=48 STONE=105 CLONE=64；中途曾现: STONE,LAVA,CLONE；新: STONE；消失: LAVA；Tmax 366.1°C | **PASS** |  |
| LAVA × CLONE | large | （科幻机制）克隆体复制相邻的可移动物质；目标为气体/易相变物质，数量受逸出与相变干扰，不单独判数量 | 起始 AIR=1656 WALL=72 LAVA=576 CLONE=576 → 结束 AIR=1559 WALL=72 STONE=638 LAVA=35 CLONE=576；中途曾现: STONE,LAVA,CLONE；新: STONE；消失: 无；Tmax 699.7°C | **PASS** |  |
| LAVA × VIRUS | small | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1486 WALL=48 LAVA=1 VIRUS=1 → 结束 AIR=1486 WALL=48 STONE=1 VIRUS=1；中途曾现: STONE,LAVA,VIRUS；新: STONE；消失: LAVA；Tmax 41.5°C | **PASS** |  |
| LAVA × VIRUS | mid | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1360 WALL=48 LAVA=64 VIRUS=64 → 结束 AIR=1360 WALL=48 STONE=64 VIRUS=64；中途曾现: STONE,LAVA,VIRUS；新: STONE；消失: LAVA；Tmax 360.1°C | **PASS** |  |
| LAVA × VIRUS | large | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1656 WALL=72 LAVA=576 VIRUS=576 → 结束 AIR=1656 WALL=72 STONE=538 LAVA=38 VIRUS=576；中途曾现: STONE,LAVA,VIRUS；新: STONE；消失: 无；Tmax 699.7°C | **PASS** |  |
| LAVA × SPRING | small | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1486 WALL=48 LAVA=1 SPRING=1 → 结束 AIR=1401 WALL=48 STONE=1 WATER=85 SPRING=1；中途曾现: STONE,WATER,LAVA,STEAM,SPRING；新: STONE,WATER；消失: LAVA；Tmax 36.2°C | **PASS** |  |
| LAVA × SPRING | mid | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1360 WALL=48 LAVA=64 SPRING=64 → 结束 AIR=1070 WALL=48 STONE=64 WATER=290 SPRING=64；中途曾现: STONE,WATER,LAVA,STEAM,SPRING；新: STONE,WATER；消失: LAVA；Tmax 504.0°C | **PASS** |  |
| LAVA × SPRING | large | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1656 WALL=72 LAVA=576 SPRING=576 → 结束 AIR=1301 WALL=72 STONE=541 WATER=352 LAVA=35 STEAM=3 SPRING=576；中途曾现: STONE,WATER,LAVA,STEAM,SPRING；新: STONE,WATER,STEAM；消失: 无；Tmax 699.7°C | **PASS** |  |
| LAVA × TNT | small | 高温岩浆引爆炸药 | 起始 AIR=1486 WALL=48 LAVA=1 TNT=1 → 结束 AIR=1486 WALL=48 STONE=1 TNT=1；中途曾现: STONE,LAVA,TNT；新: STONE；消失: LAVA；Tmax 41.3°C | **FAIL** |  |
| LAVA × TNT | mid | 高温岩浆引爆炸药 | 起始 AIR=1360 WALL=48 LAVA=64 TNT=64 → 结束 AIR=1440 WALL=48 STONE=48；中途曾现: STONE,LAVA,FIRE,TNT；新: STONE；消失: LAVA,TNT；Tmax 301.8°C | **PASS** |  |
| LAVA × TNT | large | 高温岩浆引爆炸药 | 起始 AIR=1656 WALL=72 LAVA=576 TNT=576 → 结束 AIR=2319 WALL=72 STONE=400 LAVA=89；中途曾现: STONE,LAVA,FIRE,TNT；新: STONE；消失: TNT；Tmax 1037.2°C | **PASS** |  |
| ACID × ACID | small | 同种物质相邻：自然堆叠/流动/相变，无化学变化 | 起始 AIR=1487 WALL=48 ACID=1 → 结束 AIR=1487 WALL=48 ACID=1；中途曾现: ACID；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| ACID × ACID | mid | 同种物质相邻：自然堆叠/流动/相变，无化学变化 | 起始 AIR=1424 WALL=48 ACID=64 → 结束 AIR=1424 WALL=48 ACID=64；中途曾现: ACID；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| ACID × ACID | large | 同种物质相邻：自然堆叠/流动/相变，无化学变化 | 起始 AIR=2232 WALL=72 ACID=576 → 结束 AIR=2232 WALL=72 ACID=576；中途曾现: ACID；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| ACID × LN2 | small | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1486 WALL=48 ACID=1 LN2=1 → 结束 AIR=1487 WALL=48 ACID=1；中途曾现: ACID,LN2；新: 无；消失: LN2；Tmax 20.0°C | **PASS** |  |
| ACID × LN2 | mid | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1360 WALL=48 ACID=64 LN2=64 → 结束 AIR=1424 WALL=48 ACID=64；中途曾现: ACID,LN2；新: 无；消失: LN2；Tmax 20.0°C | **PASS** |  |
| ACID × LN2 | large | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1656 WALL=72 ACID=576 LN2=576 → 结束 AIR=2232 WALL=72 ACID=576；中途曾现: ACID,LN2；新: 无；消失: LN2；Tmax 20.0°C | **PASS** |  |
| ACID × STEAM | small | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1486 WALL=48 ACID=1 STEAM=1 → 结束 AIR=1487 WALL=48 ACID=1；中途曾现: ACID,STEAM；新: 无；消失: STEAM；Tmax 20.0°C | **PASS** |  |
| ACID × STEAM | mid | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1360 WALL=48 ACID=64 STEAM=64 → 结束 AIR=1413 WALL=48 WATER=11 ACID=64；中途曾现: WATER,ACID,STEAM；新: WATER；消失: STEAM；Tmax 20.0°C | **PASS** |  |
| ACID × STEAM | large | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1656 WALL=72 ACID=576 STEAM=576 → 结束 AIR=2073 WALL=72 WATER=159 ACID=576；中途曾现: WATER,ACID,STEAM；新: WATER；消失: STEAM；Tmax 20.0°C | **PASS** |  |
| ACID × SMOKE | small | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1486 WALL=48 ACID=1 SMOKE=1 → 结束 AIR=1487 WALL=48 ACID=1；中途曾现: ACID,SMOKE；新: 无；消失: SMOKE；Tmax 20.0°C | **PASS** |  |
| ACID × SMOKE | mid | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1360 WALL=48 ACID=64 SMOKE=64 → 结束 AIR=1424 WALL=48 ACID=64；中途曾现: ACID,SMOKE；新: 无；消失: SMOKE；Tmax 20.0°C | **PASS** |  |
| ACID × SMOKE | large | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1656 WALL=72 ACID=576 SMOKE=576 → 结束 AIR=2232 WALL=72 ACID=576；中途曾现: ACID,SMOKE；新: 无；消失: SMOKE；Tmax 20.0°C | **PASS** |  |
| ACID × FIRE | small | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1486 WALL=48 ACID=1 FIRE=1 → 结束 AIR=1487 WALL=48 ACID=1；中途曾现: ACID,FIRE；新: 无；消失: FIRE；Tmax 20.2°C | **PASS** |  |
| ACID × FIRE | mid | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1360 WALL=48 ACID=64 FIRE=64 → 结束 AIR=1424 WALL=48 ACID=64；中途曾现: ACID,SMOKE,FIRE；新: 无；消失: FIRE；Tmax 22.1°C | **PASS** |  |
| ACID × FIRE | large | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1656 WALL=72 ACID=576 FIRE=576 → 结束 AIR=2232 WALL=72 ACID=576；中途曾现: ACID,SMOKE,FIRE；新: 无；消失: FIRE；Tmax 55.8°C | **PASS** |  |
| ACID × GAS | small | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1486 WALL=48 ACID=1 GAS=1 → 结束 AIR=1487 WALL=48 ACID=1；中途曾现: ACID,GAS；新: 无；消失: GAS；Tmax 20.0°C | **PASS** |  |
| ACID × GAS | mid | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1360 WALL=48 ACID=64 GAS=64 → 结束 AIR=1424 WALL=48 ACID=64；中途曾现: ACID,GAS；新: 无；消失: GAS；Tmax 20.0°C | **PASS** |  |
| ACID × GAS | large | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1656 WALL=72 ACID=576 GAS=576 → 结束 AIR=2232 WALL=72 ACID=576；中途曾现: ACID,GAS；新: 无；消失: GAS；Tmax 20.0°C | **PASS** |  |
| ACID × CLONE | small | （科幻机制）克隆体复制相邻的可移动物质，使其数量增加 | 起始 AIR=1486 WALL=48 ACID=1 CLONE=1 → 结束 AIR=1392 WALL=48 ACID=95 CLONE=1；中途曾现: ACID,CLONE；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| ACID × CLONE | mid | （科幻机制）克隆体复制相邻的可移动物质，使其数量增加 | 起始 AIR=1360 WALL=48 ACID=64 CLONE=64 → 结束 AIR=1056 WALL=48 ACID=368 CLONE=64；中途曾现: ACID,CLONE；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| ACID × CLONE | large | （科幻机制）克隆体复制相邻的可移动物质，使其数量增加 | 起始 AIR=1656 WALL=72 ACID=576 CLONE=576 → 结束 AIR=1045 WALL=72 ACID=1187 CLONE=576；中途曾现: ACID,CLONE；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| ACID × VIRUS | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 ACID=1 VIRUS=1 → 结束 AIR=1486 WALL=48 ACID=1 VIRUS=1；中途曾现: ACID,VIRUS；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| ACID × VIRUS | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 ACID=64 VIRUS=64 → 结束 AIR=1360 WALL=48 ACID=64 VIRUS=64；中途曾现: ACID,VIRUS；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| ACID × VIRUS | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 ACID=576 VIRUS=576 → 结束 AIR=1656 WALL=72 ACID=576 VIRUS=576；中途曾现: ACID,VIRUS；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| ACID × SPRING | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 ACID=1 SPRING=1 → 结束 AIR=1401 WALL=48 WATER=85 ACID=1 SPRING=1；中途曾现: WATER,ACID,SPRING；新: WATER；消失: 无；Tmax 20.0°C | **PASS** |  |
| ACID × SPRING | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 ACID=64 SPRING=64 → 结束 AIR=1056 WALL=48 WATER=304 ACID=64 SPRING=64；中途曾现: WATER,ACID,SPRING；新: WATER；消失: 无；Tmax 20.0°C | **PASS** |  |
| ACID × SPRING | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 ACID=576 SPRING=576 → 结束 AIR=1042 WALL=72 WATER=614 ACID=576 SPRING=576；中途曾现: WATER,ACID,SPRING；新: WATER；消失: 无；Tmax 20.0°C | **PASS** |  |
| ACID × TNT | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 ACID=1 TNT=1 → 结束 AIR=1486 WALL=48 ACID=1 TNT=1；中途曾现: ACID,TNT；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| ACID × TNT | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 ACID=64 TNT=64 → 结束 AIR=1360 WALL=48 ACID=64 TNT=64；中途曾现: ACID,TNT；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| ACID × TNT | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 ACID=576 TNT=576 → 结束 AIR=1656 WALL=72 ACID=576 TNT=576；中途曾现: ACID,TNT；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| LN2 × LN2 | small | 同种物质相邻：自然堆叠/流动/相变，无化学变化 | 起始 AIR=1487 WALL=48 LN2=1 → 结束 AIR=1488 WALL=48；中途曾现: LN2；新: 无；消失: LN2；Tmax 20.0°C | **N/A** |  |
| LN2 × LN2 | mid | 同种物质相邻：自然堆叠/流动/相变，无化学变化 | 起始 AIR=1424 WALL=48 LN2=64 → 结束 AIR=1488 WALL=48；中途曾现: LN2；新: 无；消失: LN2；Tmax 20.0°C | **N/A** |  |
| LN2 × LN2 | large | 同种物质相邻：自然堆叠/流动/相变，无化学变化 | 起始 AIR=2232 WALL=72 LN2=576 → 结束 AIR=2808 WALL=72；中途曾现: LN2；新: 无；消失: LN2；Tmax 20.0°C | **N/A** |  |
| LN2 × STEAM | small | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1486 WALL=48 LN2=1 STEAM=1 → 结束 AIR=1488 WALL=48；中途曾现: LN2,STEAM；新: 无；消失: LN2,STEAM；Tmax 20.0°C | **PASS** |  |
| LN2 × STEAM | mid | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1360 WALL=48 LN2=64 STEAM=64 → 结束 AIR=1477 WALL=48 ICE=4 WATER=7；中途曾现: ICE,WATER,LN2,STEAM；新: ICE,WATER；消失: LN2,STEAM；Tmax 20.0°C | **PASS** |  |
| LN2 × STEAM | large | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1656 WALL=72 LN2=576 STEAM=576 → 结束 AIR=2643 WALL=72 ICE=33 WATER=132；中途曾现: ICE,WATER,LN2,STEAM；新: ICE,WATER；消失: LN2,STEAM；Tmax 20.0°C | **PASS** |  |
| LN2 × SMOKE | small | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1486 WALL=48 LN2=1 SMOKE=1 → 结束 AIR=1488 WALL=48；中途曾现: LN2,SMOKE；新: 无；消失: LN2,SMOKE；Tmax 20.0°C | **PASS** |  |
| LN2 × SMOKE | mid | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1360 WALL=48 LN2=64 SMOKE=64 → 结束 AIR=1488 WALL=48；中途曾现: LN2,SMOKE；新: 无；消失: LN2,SMOKE；Tmax 20.0°C | **PASS** |  |
| LN2 × SMOKE | large | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1656 WALL=72 LN2=576 SMOKE=576 → 结束 AIR=2808 WALL=72；中途曾现: LN2,SMOKE；新: 无；消失: LN2,SMOKE；Tmax 20.0°C | **PASS** |  |
| LN2 × FIRE | small | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1486 WALL=48 LN2=1 FIRE=1 → 结束 AIR=1488 WALL=48；中途曾现: LN2,FIRE；新: 无；消失: LN2,FIRE；Tmax 20.2°C | **PASS** |  |
| LN2 × FIRE | mid | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1360 WALL=48 LN2=64 FIRE=64 → 结束 AIR=1488 WALL=48；中途曾现: LN2,SMOKE,FIRE；新: 无；消失: LN2,FIRE；Tmax 22.4°C | **PASS** |  |
| LN2 × FIRE | large | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1656 WALL=72 LN2=576 FIRE=576 → 结束 AIR=2808 WALL=72；中途曾现: LN2,SMOKE,FIRE；新: 无；消失: LN2,FIRE；Tmax 56.9°C | **PASS** |  |
| LN2 × GAS | small | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1486 WALL=48 LN2=1 GAS=1 → 结束 AIR=1488 WALL=48；中途曾现: LN2,GAS；新: 无；消失: LN2,GAS；Tmax 20.0°C | **PASS** |  |
| LN2 × GAS | mid | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1360 WALL=48 LN2=64 GAS=64 → 结束 AIR=1488 WALL=48；中途曾现: LN2,GAS；新: 无；消失: LN2,GAS；Tmax 20.0°C | **PASS** |  |
| LN2 × GAS | large | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1656 WALL=72 LN2=576 GAS=576 → 结束 AIR=2808 WALL=72；中途曾现: LN2,GAS；新: 无；消失: LN2,GAS；Tmax 20.0°C | **PASS** |  |
| LN2 × CLONE | small | （科幻机制）克隆体复制相邻的可移动物质；目标为气体/易相变物质，数量受逸出与相变干扰，不单独判数量 | 起始 AIR=1486 WALL=48 LN2=1 CLONE=1 → 结束 AIR=1487 WALL=48 CLONE=1；中途曾现: LN2,CLONE；新: 无；消失: LN2；Tmax 20.0°C | **PASS** |  |
| LN2 × CLONE | mid | （科幻机制）克隆体复制相邻的可移动物质；目标为气体/易相变物质，数量受逸出与相变干扰，不单独判数量 | 起始 AIR=1360 WALL=48 LN2=64 CLONE=64 → 结束 AIR=1424 WALL=48 CLONE=64；中途曾现: LN2,CLONE；新: 无；消失: LN2；Tmax 20.0°C | **PASS** |  |
| LN2 × CLONE | large | （科幻机制）克隆体复制相邻的可移动物质；目标为气体/易相变物质，数量受逸出与相变干扰，不单独判数量 | 起始 AIR=1656 WALL=72 LN2=576 CLONE=576 → 结束 AIR=2232 WALL=72 CLONE=576；中途曾现: LN2,CLONE；新: 无；消失: LN2；Tmax 20.0°C | **PASS** |  |
| LN2 × VIRUS | small | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1486 WALL=48 LN2=1 VIRUS=1 → 结束 AIR=1487 WALL=48 VIRUS=1；中途曾现: LN2,VIRUS；新: 无；消失: LN2；Tmax 20.0°C | **PASS** |  |
| LN2 × VIRUS | mid | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1360 WALL=48 LN2=64 VIRUS=64 → 结束 AIR=1424 WALL=48 VIRUS=64；中途曾现: LN2,VIRUS；新: 无；消失: LN2；Tmax 20.0°C | **PASS** |  |
| LN2 × VIRUS | large | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1656 WALL=72 LN2=576 VIRUS=576 → 结束 AIR=2232 WALL=72 VIRUS=576；中途曾现: LN2,VIRUS；新: 无；消失: LN2；Tmax 20.0°C | **PASS** |  |
| LN2 × SPRING | small | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1486 WALL=48 LN2=1 SPRING=1 → 结束 AIR=1398 WALL=48 WATER=89 SPRING=1；中途曾现: WATER,LN2,SPRING；新: WATER；消失: LN2；Tmax 20.0°C | **PASS** |  |
| LN2 × SPRING | mid | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1360 WALL=48 LN2=64 SPRING=64 → 结束 AIR=1057 WALL=48 WATER=367 SPRING=64；中途曾现: ICE,WATER,LN2,SPRING；新: WATER；消失: LN2；Tmax 20.0°C | **PASS** |  |
| LN2 × SPRING | large | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1656 WALL=72 LN2=576 SPRING=576 → 结束 AIR=1138 WALL=72 WATER=1094 SPRING=576；中途曾现: ICE,WATER,LN2,SPRING；新: WATER；消失: LN2；Tmax 20.0°C | **PASS** |  |
| LN2 × TNT | small | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1486 WALL=48 LN2=1 TNT=1 → 结束 AIR=1487 WALL=48 TNT=1；中途曾现: LN2,TNT；新: 无；消失: LN2；Tmax 20.0°C | **PASS** |  |
| LN2 × TNT | mid | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1360 WALL=48 LN2=64 TNT=64 → 结束 AIR=1424 WALL=48 TNT=64；中途曾现: LN2,TNT；新: 无；消失: LN2；Tmax 20.0°C | **PASS** |  |
| LN2 × TNT | large | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1656 WALL=72 LN2=576 TNT=576 → 结束 AIR=2232 WALL=72 TNT=576；中途曾现: LN2,TNT；新: 无；消失: LN2；Tmax 20.0°C | **PASS** |  |
| STEAM × STEAM | small | 同种物质相邻：自然堆叠/流动/相变，无化学变化 | 起始 AIR=1487 WALL=48 STEAM=1 → 结束 AIR=1488 WALL=48；中途曾现: STEAM；新: 无；消失: STEAM；Tmax 20.0°C | **N/A** |  |
| STEAM × STEAM | mid | 同种物质相邻：自然堆叠/流动/相变，无化学变化 | 起始 AIR=1424 WALL=48 STEAM=64 → 结束 AIR=1478 WALL=48 WATER=10；中途曾现: WATER,STEAM；新: WATER；消失: STEAM；Tmax 20.0°C | **N/A** |  |
| STEAM × STEAM | large | 同种物质相邻：自然堆叠/流动/相变，无化学变化 | 起始 AIR=2232 WALL=72 STEAM=576 → 结束 AIR=2658 WALL=72 WATER=150；中途曾现: WATER,STEAM；新: WATER；消失: STEAM；Tmax 20.0°C | **N/A** |  |
| STEAM × SMOKE | small | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1486 WALL=48 STEAM=1 SMOKE=1 → 结束 AIR=1488 WALL=48；中途曾现: STEAM,SMOKE；新: 无；消失: STEAM,SMOKE；Tmax 20.0°C | **PASS** |  |
| STEAM × SMOKE | mid | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1360 WALL=48 STEAM=64 SMOKE=64 → 结束 AIR=1474 WALL=48 WATER=14；中途曾现: WATER,STEAM,SMOKE；新: WATER；消失: STEAM,SMOKE；Tmax 20.0°C | **PASS** |  |
| STEAM × SMOKE | large | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1656 WALL=72 STEAM=576 SMOKE=576 → 结束 AIR=2626 WALL=72 WATER=182；中途曾现: WATER,STEAM,SMOKE；新: WATER；消失: STEAM,SMOKE；Tmax 20.0°C | **PASS** |  |
| STEAM × FIRE | small | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1486 WALL=48 STEAM=1 FIRE=1 → 结束 AIR=1488 WALL=48；中途曾现: STEAM,FIRE；新: 无；消失: STEAM,FIRE；Tmax 20.2°C | **PASS** |  |
| STEAM × FIRE | mid | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1360 WALL=48 STEAM=64 FIRE=64 → 结束 AIR=1474 WALL=48 WATER=14；中途曾现: WATER,STEAM,SMOKE,FIRE；新: WATER；消失: STEAM,FIRE；Tmax 24.1°C | **PASS** |  |
| STEAM × FIRE | large | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1656 WALL=72 STEAM=576 FIRE=576 → 结束 AIR=2630 WALL=72 WATER=178；中途曾现: WATER,STEAM,SMOKE,FIRE；新: WATER；消失: STEAM,FIRE；Tmax 55.5°C | **PASS** |  |
| STEAM × GAS | small | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1486 WALL=48 STEAM=1 GAS=1 → 结束 AIR=1488 WALL=48；中途曾现: STEAM,GAS；新: 无；消失: STEAM,GAS；Tmax 20.0°C | **PASS** |  |
| STEAM × GAS | mid | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1360 WALL=48 STEAM=64 GAS=64 → 结束 AIR=1478 WALL=48 WATER=10；中途曾现: WATER,STEAM,GAS；新: WATER；消失: STEAM,GAS；Tmax 20.0°C | **PASS** |  |
| STEAM × GAS | large | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1656 WALL=72 STEAM=576 GAS=576 → 结束 AIR=2660 WALL=72 WATER=148；中途曾现: WATER,STEAM,GAS；新: WATER；消失: STEAM,GAS；Tmax 20.0°C | **PASS** |  |
| STEAM × CLONE | small | （科幻机制）克隆体复制相邻的可移动物质；目标为气体/易相变物质，数量受逸出与相变干扰，不单独判数量 | 起始 AIR=1486 WALL=48 STEAM=1 CLONE=1 → 结束 AIR=1487 WALL=48 CLONE=1；中途曾现: STEAM,CLONE；新: 无；消失: STEAM；Tmax 20.0°C | **PASS** |  |
| STEAM × CLONE | mid | （科幻机制）克隆体复制相邻的可移动物质；目标为气体/易相变物质，数量受逸出与相变干扰，不单独判数量 | 起始 AIR=1360 WALL=48 STEAM=64 CLONE=64 → 结束 AIR=1056 WALL=48 WATER=368 CLONE=64；中途曾现: WATER,STEAM,CLONE；新: WATER；消失: STEAM；Tmax 20.0°C | **PASS** |  |
| STEAM × CLONE | large | （科幻机制）克隆体复制相邻的可移动物质；目标为气体/易相变物质，数量受逸出与相变干扰，不单独判数量 | 起始 AIR=1656 WALL=72 STEAM=576 CLONE=576 → 结束 AIR=1057 WALL=72 WATER=1175 CLONE=576；中途曾现: WATER,STEAM,CLONE；新: WATER；消失: STEAM；Tmax 20.0°C | **PASS** |  |
| STEAM × VIRUS | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 STEAM=1 VIRUS=1 → 结束 AIR=1487 WALL=48 VIRUS=1；中途曾现: STEAM,VIRUS；新: 无；消失: STEAM；Tmax 20.0°C | **PASS** |  |
| STEAM × VIRUS | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 STEAM=64 VIRUS=64 → 结束 AIR=1412 WALL=48 WATER=12 VIRUS=64；中途曾现: WATER,STEAM,VIRUS；新: WATER；消失: STEAM；Tmax 20.0°C | **PASS** |  |
| STEAM × VIRUS | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 STEAM=576 VIRUS=576 → 结束 AIR=2078 WALL=72 WATER=154 VIRUS=576；中途曾现: WATER,STEAM,VIRUS；新: WATER；消失: STEAM；Tmax 20.0°C | **PASS** |  |
| STEAM × SPRING | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 STEAM=1 SPRING=1 → 结束 AIR=1398 WALL=48 WATER=89 SPRING=1；中途曾现: WATER,STEAM,SPRING；新: WATER；消失: STEAM；Tmax 20.0°C | **PASS** |  |
| STEAM × SPRING | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 STEAM=64 SPRING=64 → 结束 AIR=1056 WALL=48 WATER=368 SPRING=64；中途曾现: WATER,STEAM,SPRING；新: WATER；消失: STEAM；Tmax 20.0°C | **PASS** |  |
| STEAM × SPRING | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 STEAM=576 SPRING=576 → 结束 AIR=1077 WALL=72 WATER=1155 SPRING=576；中途曾现: WATER,STEAM,SPRING；新: WATER；消失: STEAM；Tmax 20.0°C | **PASS** |  |
| STEAM × TNT | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 STEAM=1 TNT=1 → 结束 AIR=1487 WALL=48 TNT=1；中途曾现: STEAM,TNT；新: 无；消失: STEAM；Tmax 20.0°C | **PASS** |  |
| STEAM × TNT | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 STEAM=64 TNT=64 → 结束 AIR=1412 WALL=48 WATER=12 TNT=64；中途曾现: WATER,STEAM,TNT；新: WATER；消失: STEAM；Tmax 20.0°C | **PASS** |  |
| STEAM × TNT | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 STEAM=576 TNT=576 → 结束 AIR=2078 WALL=72 WATER=154 TNT=576；中途曾现: WATER,STEAM,TNT；新: WATER；消失: STEAM；Tmax 20.0°C | **PASS** |  |
| SMOKE × SMOKE | small | 同种物质相邻：自然堆叠/流动/相变，无化学变化 | 起始 AIR=1487 WALL=48 SMOKE=1 → 结束 AIR=1488 WALL=48；中途曾现: SMOKE；新: 无；消失: SMOKE；Tmax 20.0°C | **N/A** |  |
| SMOKE × SMOKE | mid | 同种物质相邻：自然堆叠/流动/相变，无化学变化 | 起始 AIR=1424 WALL=48 SMOKE=64 → 结束 AIR=1488 WALL=48；中途曾现: SMOKE；新: 无；消失: SMOKE；Tmax 20.0°C | **N/A** |  |
| SMOKE × SMOKE | large | 同种物质相邻：自然堆叠/流动/相变，无化学变化 | 起始 AIR=2232 WALL=72 SMOKE=576 → 结束 AIR=2808 WALL=72；中途曾现: SMOKE；新: 无；消失: SMOKE；Tmax 20.0°C | **N/A** |  |
| SMOKE × FIRE | small | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1486 WALL=48 SMOKE=1 FIRE=1 → 结束 AIR=1488 WALL=48；中途曾现: SMOKE,FIRE；新: 无；消失: SMOKE,FIRE；Tmax 20.2°C | **PASS** |  |
| SMOKE × FIRE | mid | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1360 WALL=48 SMOKE=64 FIRE=64 → 结束 AIR=1488 WALL=48；中途曾现: SMOKE,FIRE；新: 无；消失: SMOKE,FIRE；Tmax 24.2°C | **PASS** |  |
| SMOKE × FIRE | large | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1656 WALL=72 SMOKE=576 FIRE=576 → 结束 AIR=2808 WALL=72；中途曾现: SMOKE,FIRE；新: 无；消失: SMOKE,FIRE；Tmax 57.4°C | **PASS** |  |
| SMOKE × GAS | small | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1486 WALL=48 SMOKE=1 GAS=1 → 结束 AIR=1488 WALL=48；中途曾现: SMOKE,GAS；新: 无；消失: SMOKE,GAS；Tmax 20.0°C | **PASS** |  |
| SMOKE × GAS | mid | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1360 WALL=48 SMOKE=64 GAS=64 → 结束 AIR=1488 WALL=48；中途曾现: SMOKE,GAS；新: 无；消失: SMOKE,GAS；Tmax 20.0°C | **PASS** |  |
| SMOKE × GAS | large | 气体与物质相邻：气体上浮/穿过/随风飘散，无化学变化 | 起始 AIR=1656 WALL=72 SMOKE=576 GAS=576 → 结束 AIR=2808 WALL=72；中途曾现: SMOKE,GAS；新: 无；消失: SMOKE,GAS；Tmax 20.0°C | **PASS** |  |
| SMOKE × CLONE | small | （科幻机制）克隆体复制相邻的可移动物质；目标为气体/易相变物质，数量受逸出与相变干扰，不单独判数量 | 起始 AIR=1486 WALL=48 SMOKE=1 CLONE=1 → 结束 AIR=1487 WALL=48 CLONE=1；中途曾现: SMOKE,CLONE；新: 无；消失: SMOKE；Tmax 20.0°C | **PASS** |  |
| SMOKE × CLONE | mid | （科幻机制）克隆体复制相邻的可移动物质；目标为气体/易相变物质，数量受逸出与相变干扰，不单独判数量 | 起始 AIR=1360 WALL=48 SMOKE=64 CLONE=64 → 结束 AIR=1424 WALL=48 CLONE=64；中途曾现: SMOKE,CLONE；新: 无；消失: SMOKE；Tmax 20.0°C | **PASS** |  |
| SMOKE × CLONE | large | （科幻机制）克隆体复制相邻的可移动物质；目标为气体/易相变物质，数量受逸出与相变干扰，不单独判数量 | 起始 AIR=1656 WALL=72 SMOKE=576 CLONE=576 → 结束 AIR=2232 WALL=72 CLONE=576；中途曾现: SMOKE,CLONE；新: 无；消失: SMOKE；Tmax 20.0°C | **PASS** |  |
| SMOKE × VIRUS | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 SMOKE=1 VIRUS=1 → 结束 AIR=1487 WALL=48 VIRUS=1；中途曾现: SMOKE,VIRUS；新: 无；消失: SMOKE；Tmax 20.0°C | **PASS** |  |
| SMOKE × VIRUS | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 SMOKE=64 VIRUS=64 → 结束 AIR=1424 WALL=48 VIRUS=64；中途曾现: SMOKE,VIRUS；新: 无；消失: SMOKE；Tmax 20.0°C | **PASS** |  |
| SMOKE × VIRUS | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 SMOKE=576 VIRUS=576 → 结束 AIR=2232 WALL=72 VIRUS=576；中途曾现: SMOKE,VIRUS；新: 无；消失: SMOKE；Tmax 20.0°C | **PASS** |  |
| SMOKE × SPRING | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 SMOKE=1 SPRING=1 → 结束 AIR=1398 WALL=48 WATER=89 SPRING=1；中途曾现: WATER,SMOKE,SPRING；新: WATER；消失: SMOKE；Tmax 20.0°C | **PASS** |  |
| SMOKE × SPRING | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 SMOKE=64 SPRING=64 → 结束 AIR=1056 WALL=48 WATER=368 SPRING=64；中途曾现: WATER,SMOKE,SPRING；新: WATER；消失: SMOKE；Tmax 20.0°C | **PASS** |  |
| SMOKE × SPRING | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 SMOKE=576 SPRING=576 → 结束 AIR=1099 WALL=72 WATER=1133 SPRING=576；中途曾现: WATER,SMOKE,SPRING；新: WATER；消失: SMOKE；Tmax 20.0°C | **PASS** |  |
| SMOKE × TNT | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 SMOKE=1 TNT=1 → 结束 AIR=1487 WALL=48 TNT=1；中途曾现: SMOKE,TNT；新: 无；消失: SMOKE；Tmax 20.0°C | **PASS** |  |
| SMOKE × TNT | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 SMOKE=64 TNT=64 → 结束 AIR=1424 WALL=48 TNT=64；中途曾现: SMOKE,TNT；新: 无；消失: SMOKE；Tmax 20.0°C | **PASS** |  |
| SMOKE × TNT | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 SMOKE=576 TNT=576 → 结束 AIR=2232 WALL=72 TNT=576；中途曾现: SMOKE,TNT；新: 无；消失: SMOKE；Tmax 20.0°C | **PASS** |  |
| FIRE × FIRE | small | 同种物质相邻：自然堆叠/流动/相变，无化学变化 | 起始 AIR=1487 WALL=48 FIRE=1 → 结束 AIR=1488 WALL=48；中途曾现: FIRE；新: 无；消失: FIRE；Tmax 20.2°C | **N/A** |  |
| FIRE × FIRE | mid | 同种物质相邻：自然堆叠/流动/相变，无化学变化 | 起始 AIR=1424 WALL=48 FIRE=64 → 结束 AIR=1488 WALL=48；中途曾现: SMOKE,FIRE；新: 无；消失: FIRE；Tmax 24.5°C | **N/A** |  |
| FIRE × FIRE | large | 同种物质相邻：自然堆叠/流动/相变，无化学变化 | 起始 AIR=2232 WALL=72 FIRE=576 → 结束 AIR=2808 WALL=72；中途曾现: SMOKE,FIRE；新: 无；消失: FIRE；Tmax 61.4°C | **N/A** |  |
| FIRE × GAS | small | 瓦斯（甲烷）易燃易爆，火焰迅速传播 | 起始 AIR=1486 WALL=48 FIRE=1 GAS=1 → 结束 AIR=1488 WALL=48；中途曾现: SMOKE,FIRE,GAS；新: 无；消失: FIRE,GAS；Tmax 20.3°C | **PASS** |  |
| FIRE × GAS | mid | 瓦斯（甲烷）易燃易爆，火焰迅速传播 | 起始 AIR=1360 WALL=48 FIRE=64 GAS=64 → 结束 AIR=1488 WALL=48；中途曾现: SMOKE,FIRE,GAS；新: 无；消失: FIRE,GAS；Tmax 27.2°C | **PASS** |  |
| FIRE × GAS | large | 瓦斯（甲烷）易燃易爆，火焰迅速传播 | 起始 AIR=1656 WALL=72 FIRE=576 GAS=576 → 结束 AIR=2808 WALL=72；中途曾现: SMOKE,FIRE,GAS；新: 无；消失: FIRE,GAS；Tmax 66.2°C | **PASS** |  |
| FIRE × CLONE | small | （科幻机制）克隆体复制相邻的可移动物质；目标为气体/易相变物质，数量受逸出与相变干扰，不单独判数量 | 起始 AIR=1486 WALL=48 FIRE=1 CLONE=1 → 结束 AIR=1487 WALL=48 CLONE=1；中途曾现: FIRE,CLONE；新: 无；消失: FIRE；Tmax 20.2°C | **PASS** |  |
| FIRE × CLONE | mid | （科幻机制）克隆体复制相邻的可移动物质；目标为气体/易相变物质，数量受逸出与相变干扰，不单独判数量 | 起始 AIR=1360 WALL=48 FIRE=64 CLONE=64 → 结束 AIR=1424 WALL=48 CLONE=64；中途曾现: SMOKE,FIRE,CLONE；新: 无；消失: FIRE；Tmax 25.0°C | **PASS** |  |
| FIRE × CLONE | large | （科幻机制）克隆体复制相邻的可移动物质；目标为气体/易相变物质，数量受逸出与相变干扰，不单独判数量 | 起始 AIR=1656 WALL=72 FIRE=576 CLONE=576 → 结束 AIR=2232 WALL=72 CLONE=576；中途曾现: SMOKE,FIRE,CLONE；新: 无；消失: FIRE；Tmax 58.9°C | **PASS** |  |
| FIRE × VIRUS | small | 现实中病毒不是可燃物；本作把病毒设为可燃（演绎化设定） | 起始 AIR=1486 WALL=48 FIRE=1 VIRUS=1 → 结束 AIR=1487 WALL=48 VIRUS=1；中途曾现: FIRE,VIRUS；新: 无；消失: FIRE；Tmax 20.2°C | **PASS** |  |
| FIRE × VIRUS | mid | 现实中病毒不是可燃物；本作把病毒设为可燃（演绎化设定） | 起始 AIR=1360 WALL=48 FIRE=64 VIRUS=64 → 结束 AIR=1424 WALL=48 VIRUS=64；中途曾现: SMOKE,FIRE,VIRUS；新: 无；消失: FIRE；Tmax 24.9°C | **PASS** |  |
| FIRE × VIRUS | large | 现实中病毒不是可燃物；本作把病毒设为可燃（演绎化设定） | 起始 AIR=1656 WALL=72 FIRE=576 VIRUS=576 → 结束 AIR=2232 WALL=72 VIRUS=576；中途曾现: SMOKE,FIRE,VIRUS；新: 无；消失: FIRE；Tmax 66.0°C | **PASS** |  |
| FIRE × SPRING | small | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1486 WALL=48 FIRE=1 SPRING=1 → 结束 AIR=1398 WALL=48 WATER=89 SPRING=1；中途曾现: WATER,FIRE,SPRING；新: WATER；消失: FIRE；Tmax 20.2°C | **PASS** |  |
| FIRE × SPRING | mid | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1360 WALL=48 FIRE=64 SPRING=64 → 结束 AIR=1056 WALL=48 WATER=368 SPRING=64；中途曾现: WATER,STEAM,SMOKE,FIRE,SPRING；新: WATER；消失: FIRE；Tmax 23.0°C | **PASS** |  |
| FIRE × SPRING | large | 热源或冷源相邻：仅有热传导（可能引发相变），无化学变化 | 起始 AIR=1656 WALL=72 FIRE=576 SPRING=576 → 结束 AIR=1103 WALL=72 WATER=1129 SPRING=576；中途曾现: WATER,STEAM,SMOKE,FIRE,SPRING；新: WATER；消失: FIRE；Tmax 59.7°C | **PASS** |  |
| FIRE × TNT | small | 火焰/高温引爆炸药，半径内全毁 | 起始 AIR=1486 WALL=48 FIRE=1 TNT=1 → 结束 AIR=1487 WALL=48 TNT=1；中途曾现: FIRE,TNT；新: 无；消失: FIRE；Tmax 20.2°C | **FAIL** |  |
| FIRE × TNT | mid | 火焰/高温引爆炸药，半径内全毁 | 起始 AIR=1360 WALL=48 FIRE=64 TNT=64 → 结束 AIR=1488 WALL=48；中途曾现: SMOKE,FIRE,TNT；新: 无；消失: FIRE,TNT；Tmax 187.3°C | **PASS** |  |
| FIRE × TNT | large | 火焰/高温引爆炸药，半径内全毁 | 起始 AIR=1656 WALL=72 FIRE=576 TNT=576 → 结束 AIR=2808 WALL=72；中途曾现: SMOKE,FIRE,TNT；新: 无；消失: FIRE,TNT；Tmax 543.8°C | **PASS** |  |
| GAS × GAS | small | 同种物质相邻：自然堆叠/流动/相变，无化学变化 | 起始 AIR=1487 WALL=48 GAS=1 → 结束 AIR=1488 WALL=48；中途曾现: GAS；新: 无；消失: GAS；Tmax 20.0°C | **N/A** |  |
| GAS × GAS | mid | 同种物质相邻：自然堆叠/流动/相变，无化学变化 | 起始 AIR=1424 WALL=48 GAS=64 → 结束 AIR=1488 WALL=48；中途曾现: GAS；新: 无；消失: GAS；Tmax 20.0°C | **N/A** |  |
| GAS × GAS | large | 同种物质相邻：自然堆叠/流动/相变，无化学变化 | 起始 AIR=2232 WALL=72 GAS=576 → 结束 AIR=2808 WALL=72；中途曾现: GAS；新: 无；消失: GAS；Tmax 20.0°C | **N/A** |  |
| GAS × CLONE | small | （科幻机制）克隆体复制相邻的可移动物质；目标为气体/易相变物质，数量受逸出与相变干扰，不单独判数量 | 起始 AIR=1486 WALL=48 GAS=1 CLONE=1 → 结束 AIR=1487 WALL=48 CLONE=1；中途曾现: GAS,CLONE；新: 无；消失: GAS；Tmax 20.0°C | **PASS** |  |
| GAS × CLONE | mid | （科幻机制）克隆体复制相邻的可移动物质；目标为气体/易相变物质，数量受逸出与相变干扰，不单独判数量 | 起始 AIR=1360 WALL=48 GAS=64 CLONE=64 → 结束 AIR=1424 WALL=48 CLONE=64；中途曾现: GAS,CLONE；新: 无；消失: GAS；Tmax 20.0°C | **PASS** |  |
| GAS × CLONE | large | （科幻机制）克隆体复制相邻的可移动物质；目标为气体/易相变物质，数量受逸出与相变干扰，不单独判数量 | 起始 AIR=1656 WALL=72 GAS=576 CLONE=576 → 结束 AIR=2232 WALL=72 CLONE=576；中途曾现: GAS,CLONE；新: 无；消失: GAS；Tmax 20.0°C | **PASS** |  |
| GAS × VIRUS | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 GAS=1 VIRUS=1 → 结束 AIR=1487 WALL=48 VIRUS=1；中途曾现: GAS,VIRUS；新: 无；消失: GAS；Tmax 20.0°C | **PASS** |  |
| GAS × VIRUS | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 GAS=64 VIRUS=64 → 结束 AIR=1424 WALL=48 VIRUS=64；中途曾现: GAS,VIRUS；新: 无；消失: GAS；Tmax 20.0°C | **PASS** |  |
| GAS × VIRUS | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 GAS=576 VIRUS=576 → 结束 AIR=2232 WALL=72 VIRUS=576；中途曾现: GAS,VIRUS；新: 无；消失: GAS；Tmax 20.0°C | **PASS** |  |
| GAS × SPRING | small | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1486 WALL=48 GAS=1 SPRING=1 → 结束 AIR=1398 WALL=48 WATER=89 SPRING=1；中途曾现: WATER,GAS,SPRING；新: WATER；消失: GAS；Tmax 20.0°C | **PASS** |  |
| GAS × SPRING | mid | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1360 WALL=48 GAS=64 SPRING=64 → 结束 AIR=1056 WALL=48 WATER=368 SPRING=64；中途曾现: WATER,GAS,SPRING；新: WATER；消失: GAS；Tmax 20.0°C | **PASS** |  |
| GAS × SPRING | large | 流体/粉末与静态固体相邻：被阻挡、绕流、堆积，无化学变化 | 起始 AIR=1656 WALL=72 GAS=576 SPRING=576 → 结束 AIR=1101 WALL=72 WATER=1131 SPRING=576；中途曾现: WATER,GAS,SPRING；新: WATER；消失: GAS；Tmax 20.0°C | **PASS** |  |
| GAS × TNT | small | 需引信/高温；无热源时不爆（瓦斯会自行扩散） | 起始 AIR=1486 WALL=48 GAS=1 TNT=1 → 结束 AIR=1487 WALL=48 TNT=1；中途曾现: GAS,TNT；新: 无；消失: GAS；Tmax 20.0°C | **PASS** |  |
| GAS × TNT | mid | 需引信/高温；无热源时不爆（瓦斯会自行扩散） | 起始 AIR=1360 WALL=48 GAS=64 TNT=64 → 结束 AIR=1424 WALL=48 TNT=64；中途曾现: GAS,TNT；新: 无；消失: GAS；Tmax 20.0°C | **PASS** |  |
| GAS × TNT | large | 需引信/高温；无热源时不爆（瓦斯会自行扩散） | 起始 AIR=1656 WALL=72 GAS=576 TNT=576 → 结束 AIR=2232 WALL=72 TNT=576；中途曾现: GAS,TNT；新: 无；消失: GAS；Tmax 20.0°C | **PASS** |  |
| CLONE × CLONE | small | 同种物质相邻：自然堆叠/流动/相变，无化学变化 | 起始 AIR=1487 WALL=48 CLONE=1 → 结束 AIR=1487 WALL=48 CLONE=1；中途曾现: CLONE；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| CLONE × CLONE | mid | 同种物质相邻：自然堆叠/流动/相变，无化学变化 | 起始 AIR=1424 WALL=48 CLONE=64 → 结束 AIR=1424 WALL=48 CLONE=64；中途曾现: CLONE；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| CLONE × CLONE | large | 同种物质相邻：自然堆叠/流动/相变，无化学变化 | 起始 AIR=2232 WALL=72 CLONE=576 → 结束 AIR=2232 WALL=72 CLONE=576；中途曾现: CLONE；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| CLONE × VIRUS | small | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1486 WALL=48 CLONE=1 VIRUS=1 → 结束 AIR=1486 WALL=48 CLONE=1 VIRUS=1；中途曾现: CLONE,VIRUS；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| CLONE × VIRUS | mid | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1360 WALL=48 CLONE=64 VIRUS=64 → 结束 AIR=1360 WALL=48 CLONE=64 VIRUS=64；中途曾现: CLONE,VIRUS；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| CLONE × VIRUS | large | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1656 WALL=72 CLONE=576 VIRUS=576 → 结束 AIR=1656 WALL=72 CLONE=576 VIRUS=576；中途曾现: CLONE,VIRUS；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| CLONE × SPRING | small | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1486 WALL=48 CLONE=1 SPRING=1 → 结束 AIR=1392 WALL=48 WATER=94 CLONE=1 SPRING=1；中途曾现: WATER,CLONE,SPRING；新: WATER；消失: 无；Tmax 20.0°C | **N/A** |  |
| CLONE × SPRING | mid | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1360 WALL=48 CLONE=64 SPRING=64 → 结束 AIR=1056 WALL=48 WATER=304 CLONE=64 SPRING=64；中途曾现: WATER,CLONE,SPRING；新: WATER；消失: 无；Tmax 20.0°C | **N/A** |  |
| CLONE × SPRING | large | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1656 WALL=72 CLONE=576 SPRING=576 → 结束 AIR=1008 WALL=72 WATER=648 CLONE=576 SPRING=576；中途曾现: WATER,CLONE,SPRING；新: WATER；消失: 无；Tmax 20.0°C | **N/A** |  |
| CLONE × TNT | small | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1486 WALL=48 CLONE=1 TNT=1 → 结束 AIR=1486 WALL=48 CLONE=1 TNT=1；中途曾现: CLONE,TNT；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| CLONE × TNT | mid | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1360 WALL=48 CLONE=64 TNT=64 → 结束 AIR=1360 WALL=48 CLONE=64 TNT=64；中途曾现: CLONE,TNT；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| CLONE × TNT | large | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1656 WALL=72 CLONE=576 TNT=576 → 结束 AIR=1656 WALL=72 CLONE=576 TNT=576；中途曾现: CLONE,TNT；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| VIRUS × VIRUS | small | 同种物质相邻：自然堆叠/流动/相变，无化学变化 | 起始 AIR=1487 WALL=48 VIRUS=1 → 结束 AIR=1487 WALL=48 VIRUS=1；中途曾现: VIRUS；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| VIRUS × VIRUS | mid | 同种物质相邻：自然堆叠/流动/相变，无化学变化 | 起始 AIR=1424 WALL=48 VIRUS=64 → 结束 AIR=1424 WALL=48 VIRUS=64；中途曾现: VIRUS；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| VIRUS × VIRUS | large | 同种物质相邻：自然堆叠/流动/相变，无化学变化 | 起始 AIR=2232 WALL=72 VIRUS=576 → 结束 AIR=2232 WALL=72 VIRUS=576；中途曾现: VIRUS；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| VIRUS × SPRING | small | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1486 WALL=48 VIRUS=1 SPRING=1 → 结束 AIR=1398 WALL=48 WATER=88 VIRUS=1 SPRING=1；中途曾现: WATER,VIRUS,SPRING；新: WATER；消失: 无；Tmax 20.0°C | **N/A** |  |
| VIRUS × SPRING | mid | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1360 WALL=48 VIRUS=64 SPRING=64 → 结束 AIR=1097 WALL=48 WATER=263 VIRUS=64 SPRING=64；中途曾现: WATER,VIRUS,SPRING；新: WATER；消失: 无；Tmax 20.0°C | **N/A** |  |
| VIRUS × SPRING | large | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1656 WALL=72 VIRUS=576 SPRING=576 → 结束 AIR=1291 WALL=72 WATER=365 VIRUS=576 SPRING=576；中途曾现: WATER,VIRUS,SPRING；新: WATER；消失: 无；Tmax 20.0°C | **N/A** |  |
| VIRUS × TNT | small | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1486 WALL=48 VIRUS=1 TNT=1 → 结束 AIR=1486 WALL=48 VIRUS=1 TNT=1；中途曾现: VIRUS,TNT；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| VIRUS × TNT | mid | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1360 WALL=48 VIRUS=64 TNT=64 → 结束 AIR=1360 WALL=48 VIRUS=64 TNT=64；中途曾现: VIRUS,TNT；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| VIRUS × TNT | large | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1656 WALL=72 VIRUS=576 TNT=576 → 结束 AIR=1656 WALL=72 VIRUS=576 TNT=576；中途曾现: VIRUS,TNT；新: 无；消失: 无；Tmax 20.0°C | **N/A** |  |
| SPRING × SPRING | small | 同种物质相邻：自然堆叠/流动/相变，无化学变化 | 起始 AIR=1487 WALL=48 SPRING=1 → 结束 AIR=1399 WALL=48 WATER=88 SPRING=1；中途曾现: WATER,SPRING；新: WATER；消失: 无；Tmax 20.0°C | **N/A** |  |
| SPRING × SPRING | mid | 同种物质相邻：自然堆叠/流动/相变，无化学变化 | 起始 AIR=1424 WALL=48 SPRING=64 → 结束 AIR=1057 WALL=48 WATER=367 SPRING=64；中途曾现: WATER,SPRING；新: WATER；消失: 无；Tmax 20.0°C | **N/A** |  |
| SPRING × SPRING | large | 同种物质相邻：自然堆叠/流动/相变，无化学变化 | 起始 AIR=2232 WALL=72 SPRING=576 → 结束 AIR=1098 WALL=72 WATER=1134 SPRING=576；中途曾现: WATER,SPRING；新: WATER；消失: 无；Tmax 20.0°C | **N/A** |  |
| SPRING × TNT | small | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1486 WALL=48 SPRING=1 TNT=1 → 结束 AIR=1399 WALL=48 WATER=87 SPRING=1 TNT=1；中途曾现: WATER,SPRING,TNT；新: WATER；消失: 无；Tmax 20.0°C | **N/A** |  |
| SPRING × TNT | mid | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1360 WALL=48 SPRING=64 TNT=64 → 结束 AIR=1095 WALL=48 WATER=265 SPRING=64 TNT=64；中途曾现: WATER,SPRING,TNT；新: WATER；消失: 无；Tmax 20.0°C | **N/A** |  |
| SPRING × TNT | large | 两种静态固体相邻：现实中不发生明显反应（仅物理阻挡） | 起始 AIR=1656 WALL=72 SPRING=576 TNT=576 → 结束 AIR=1273 WALL=72 WATER=383 SPRING=576 TNT=576；中途曾现: WATER,SPRING,TNT；新: WATER；消失: 无；Tmax 20.0°C | **N/A** |  |
| TNT × TNT | small | 相邻炸药需外部引信或高温才爆；无引信、无高温时不应自爆 | 起始 AIR=1487 WALL=48 TNT=1 → 结束 AIR=1487 WALL=48 TNT=1；中途曾现: TNT；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| TNT × TNT | mid | 相邻炸药需外部引信或高温才爆；无引信、无高温时不应自爆 | 起始 AIR=1424 WALL=48 TNT=64 → 结束 AIR=1424 WALL=48 TNT=64；中途曾现: TNT；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |
| TNT × TNT | large | 相邻炸药需外部引信或高温才爆；无引信、无高温时不应自爆 | 起始 AIR=2232 WALL=72 TNT=576 → 结束 AIR=2232 WALL=72 TNT=576；中途曾现: TNT；新: 无；消失: 无；Tmax 20.0°C | **PASS** |  |

---

## 3. 用量敏感性（"量变是否引起质变"）

对每个组合，比较三个用量档的"判定 + 产物集合 + 双方是否幸存"签名。

### 3.1 结果**随用量改变**的组合（96 个）——这些最符合直觉："量多少不一样"

| 组合 | 少量 (1×1) | 中等 (8×8) | 大量 (24×24) | 类别 |
|---|---|---|---|---|
| AIR × LAVA | PASS；活: AIR | PASS；活: AIR | PASS；活: AIR+LAVA | AIR |
| AIR × STEAM | PASS；活: AIR | PASS；活: AIR | PASS；活: AIR | AIR |
| AIR × FIRE | PASS；活: AIR | PASS；活: AIR | PASS；活: AIR | AIR |
| WALL × LAVA | PASS；活: WALL | PASS；活: WALL | PASS；活: WALL+LAVA | THERMAL |
| WALL × STEAM | PASS；活: WALL | PASS；活: WALL | PASS；活: WALL | STRUCT |
| WALL × FIRE | PASS；活: WALL | PASS；活: WALL | PASS；活: WALL | THERMAL |
| STONE × LAVA | PASS；活: STONE | PASS；活: STONE | PASS；活: STONE+LAVA | PHASE |
| STONE × ACID | PASS；活: ACID | PASS；活: STONE+ACID | PASS；活: STONE+ACID | REACTION |
| STONE × STEAM | PASS；活: STONE | PASS；活: STONE | PASS；活: STONE | STRUCT |
| STONE × FIRE | PASS；活: STONE | PASS；活: STONE | PASS；活: STONE | PHASE |
| GLASS × LAVA | PASS；活: GLASS | PASS；活: GLASS | PASS；活: GLASS+LAVA | PHASE |
| GLASS × STEAM | PASS；活: GLASS | PASS；活: GLASS | PASS；活: GLASS | STRUCT |
| GLASS × FIRE | PASS；活: GLASS | PASS；活: GLASS | PASS；活: GLASS | PHASE |
| METAL × LAVA | PASS；活: METAL | PASS；活: METAL | PASS；活: METAL+LAVA | PHASE |
| METAL × ACID | PASS；活: 全灭 | PASS；活: METAL+ACID | PASS；活: METAL+ACID | REACTION |
| METAL × STEAM | PASS；活: METAL | PASS；活: METAL | PASS；活: METAL | STRUCT |
| METAL × FIRE | PASS；活: METAL | PASS；活: METAL | PASS；活: METAL | PHASE |
| ICE × SALT | PASS；活: 全灭 | PASS；活: 全灭 | PASS；活: SALT | STRUCT |
| ICE × SEED | PASS；活: SEED | PASS；活: SEED | PASS；活: SEED | STRUCT |
| ICE × LAVA | PASS；活: 全灭 | PASS；活: 全灭 | PASS；活: LAVA | REACTION |
| ICE × LN2 | PASS；活: 全灭 | PASS；活: ICE | PASS；活: ICE | PHASE |
| ICE × FIRE | PASS；活: 全灭 | PASS；活: 全灭 | PASS；活: 全灭 | PHASE |
| WOOD × LAVA | PASS；活: WOOD | PASS；活: WOOD | PASS；活: WOOD+LAVA | THERMAL |
| WOOD × STEAM | PASS；活: WOOD | PASS；活: WOOD | PASS；活: WOOD | STRUCT |
| WOOD × FIRE | FAIL；活: WOOD | FAIL；活: WOOD | FAIL；活: WOOD | REACTION |
| PLANT × LAVA | PASS；活: 全灭 | PASS；活: 全灭 | PASS；活: LAVA | REACTION |
| PLANT × STEAM | PASS；活: 全灭 | PASS；活: 全灭 | PASS；活: 全灭 | STRUCT |
| PLANT × FIRE | PASS；活: 全灭 | PASS；活: 全灭 | PASS；活: 全灭 | REACTION |
| PLANT × VIRUS | PASS；活: VIRUS | PASS；活: VIRUS | PASS；活: VIRUS | REACTION |
| PLANT × SPRING | N/A；活: PLANT+SPRING | N/A；活: SPRING | N/A；活: SPRING | NONE |
| SAND × LAVA | PASS；活: SAND | PASS；活: SAND | PASS；活: SAND+LAVA | PHASE |
| SAND × STEAM | PASS；活: SAND | PASS；活: SAND | PASS；活: SAND | FLOW |
| SAND × FIRE | PASS；活: SAND | PASS；活: SAND | PASS；活: SAND | PHASE |
| SOIL × LAVA | PASS；活: SOIL | PASS；活: SOIL | PASS；活: SOIL+LAVA | THERMAL |
| SOIL × STEAM | PASS；活: SOIL | PASS；活: SOIL | PASS；活: SOIL | FLOW |
| SOIL × FIRE | PASS；活: SOIL | PASS；活: SOIL | PASS；活: SOIL | THERMAL |
| SALT × SNOW | PASS；活: SALT | PASS；活: 全灭 | PASS；活: SALT | MIX |
| SALT × WATER | FAIL；活: SALT+WATER | PASS；活: WATER | PASS；活: SALT+WATER | REACTION |
| SALT × LAVA | PASS；活: SALT | PASS；活: SALT | PASS；活: SALT+LAVA | PHASE |
| SALT × STEAM | PASS；活: SALT | PASS；活: SALT | PASS；活: SALT | FLOW |
| SALT × FIRE | PASS；活: SALT | PASS；活: SALT | PASS；活: SALT | PHASE |
| SALT × SPRING | PASS；活: SPRING | PASS；活: SPRING | PASS；活: SALT+SPRING | STRUCT |
| DUST × LAVA | PASS；活: DUST | PASS；活: DUST | PASS；活: DUST+LAVA | THERMAL |
| DUST × STEAM | PASS；活: DUST | PASS；活: DUST | PASS；活: DUST | FLOW |
| DUST × FIRE | FAIL；活: DUST | FAIL；活: DUST | FAIL；活: DUST | REACTION |
| SNOW × SEED | PASS；活: SEED | PASS；活: SEED | PASS；活: SEED | MIX |
| SNOW × LAVA | PASS；活: 全灭 | PASS；活: 全灭 | PASS；活: LAVA | PHASE |
| SNOW × LN2 | PASS；活: 全灭 | PASS；活: 全灭 | PASS；活: SNOW | PHASE |
| SNOW × FIRE | PASS；活: 全灭 | PASS；活: 全灭 | PASS；活: 全灭 | PHASE |
| ASH × LAVA | PASS；活: ASH | PASS；活: ASH | PASS；活: ASH+LAVA | THERMAL |
| ASH × STEAM | PASS；活: ASH | PASS；活: ASH | PASS；活: ASH | FLOW |
| ASH × FIRE | PASS；活: ASH | PASS；活: ASH | PASS；活: ASH | THERMAL |
| COAL × LAVA | PASS；活: COAL | PASS；活: COAL | PASS；活: COAL+LAVA | THERMAL |
| COAL × STEAM | PASS；活: COAL | PASS；活: COAL | PASS；活: COAL | STRUCT |
| COAL × FIRE | FAIL；活: COAL | FAIL；活: COAL | FAIL；活: COAL | REACTION |
| GUNPOWDER × LAVA | PASS；活: GUNPOWDER | PASS；活: GUNPOWDER | PASS；活: GUNPOWDER+LAVA | THERMAL |
| GUNPOWDER × STEAM | PASS；活: GUNPOWDER | PASS；活: GUNPOWDER | PASS；活: GUNPOWDER | FLOW |
| GUNPOWDER × FIRE | FAIL；活: GUNPOWDER | PASS；活: GUNPOWDER | PASS；活: 全灭 | REACTION |
| SEED × WATER | FAIL；活: SEED+WATER | PASS；活: SEED+WATER | PASS；活: SEED+WATER | LIFE |
| SEED × LAVA | PASS；活: SEED | PASS；活: 全灭 | PASS；活: SEED+LAVA | THERMAL |

（仅列出前 60 个，共 96 个）

### 3.2 结果**不随用量改变**的组合

- 全部不变量组合：**369** 个（绝大多数为"无显著交互"类别，符合预期）。
- 其中属于 **REACTION / PHASE** 类别却"量多少都一样"的：**24** 个 —— 这类**值得重点复核**（反应类组合本应随剂量变化）：

| 组合 | 类别 | 三档共同结果 |
|---|---|---|
| STONE × LN2 | PHASE | PASS；起始 AIR=1360 WALL=48 STONE=64 LN2=64 → 结束 AIR=1424 WALL=48 STONE=64；中途曾现: STONE,LN2；新: 无；消失… |
| GLASS × LN2 | PHASE | PASS；起始 AIR=1360 WALL=48 GLASS=64 LN2=64 → 结束 AIR=1424 WALL=48 GLASS=64；中途曾现: GLASS,LN2；新: 无；消失… |
| METAL × LN2 | PHASE | PASS；起始 AIR=1360 WALL=48 METAL=64 LN2=64 → 结束 AIR=1424 WALL=48 METAL=64；中途曾现: METAL,LN2；新: 无；消失… |
| WOOD × VIRUS | REACTION | PASS；起始 AIR=1360 WALL=48 WOOD=64 VIRUS=64 → 结束 AIR=1360 WALL=48 VIRUS=128；中途曾现: WOOD,VIRUS；新: 无… |
| PLANT × ACID | REACTION | PASS；起始 AIR=1360 WALL=48 PLANT=64 ACID=64 → 结束 AIR=1360 WALL=48 DUST=64 ACID=64；中途曾现: PLANT,DUS… |
| SAND × LN2 | PHASE | PASS；起始 AIR=1360 WALL=48 SAND=64 LN2=64 → 结束 AIR=1424 WALL=48 SAND=64；中途曾现: SAND,LN2；新: 无；消失: L… |
| SAND × CLONE | REACTION | PASS；起始 AIR=1360 WALL=48 SAND=64 CLONE=64 → 结束 AIR=1306 WALL=48 SAND=118 CLONE=64；中途曾现: SAND,CL… |
| SOIL × CLONE | REACTION | PASS；起始 AIR=1360 WALL=48 SOIL=64 CLONE=64 → 结束 AIR=1306 WALL=48 SOIL=118 CLONE=64；中途曾现: SOIL,CL… |
| SALT × LN2 | PHASE | PASS；起始 AIR=1360 WALL=48 SALT=64 LN2=64 → 结束 AIR=1424 WALL=48 SALT=64；中途曾现: SALT,LN2；新: 无；消失: L… |
| SALT × CLONE | REACTION | PASS；起始 AIR=1360 WALL=48 SALT=64 CLONE=64 → 结束 AIR=1305 WALL=48 SALT=119 CLONE=64；中途曾现: SALT,CL… |
| DUST × CLONE | REACTION | PASS；起始 AIR=1360 WALL=48 DUST=64 CLONE=64 → 结束 AIR=1306 WALL=48 DUST=118 CLONE=64；中途曾现: DUST,CL… |
| SNOW × CLONE | REACTION | PASS；起始 AIR=1360 WALL=48 SNOW=64 CLONE=64 → 结束 AIR=1056 WALL=48 WATER=368 CLONE=64；中途曾现: SNOW,W… |
| ASH × CLONE | REACTION | PASS；起始 AIR=1360 WALL=48 ASH=64 CLONE=64 → 结束 AIR=1306 WALL=48 ASH=118 CLONE=64；中途曾现: ASH,CLONE… |
| GUNPOWDER × CLONE | REACTION | PASS；起始 AIR=1360 WALL=48 GUNPOWDER=64 CLONE=64 → 结束 AIR=1305 WALL=48 GUNPOWDER=119 CLONE=64；中途曾… |
| SEED × CLONE | REACTION | PASS；起始 AIR=1360 WALL=48 SEED=64 CLONE=64 → 结束 AIR=1306 WALL=48 SEED=118 CLONE=64；中途曾现: SEED,CL… |
| SEED × VIRUS | REACTION | PASS；起始 AIR=1360 WALL=48 SEED=64 VIRUS=64 → 结束 AIR=1360 WALL=48 VIRUS=128；中途曾现: SEED,VIRUS；新: 无… |
| WATER × CLONE | REACTION | PASS；起始 AIR=1360 WALL=48 WATER=64 CLONE=64 → 结束 AIR=1056 WALL=48 WATER=368 CLONE=64；中途曾现: WATER… |
| OIL × CLONE | REACTION | PASS；起始 AIR=1360 WALL=48 OIL=64 CLONE=64 → 结束 AIR=1062 WALL=48 OIL=362 CLONE=64；中途曾现: OIL,CLONE… |
| ACID × CLONE | REACTION | PASS；起始 AIR=1360 WALL=48 ACID=64 CLONE=64 → 结束 AIR=1056 WALL=48 ACID=368 CLONE=64；中途曾现: ACID,CL… |
| LN2 × CLONE | REACTION | PASS；起始 AIR=1360 WALL=48 LN2=64 CLONE=64 → 结束 AIR=1424 WALL=48 CLONE=64；中途曾现: LN2,CLONE；新: 无；消失… |
| SMOKE × CLONE | REACTION | PASS；起始 AIR=1360 WALL=48 SMOKE=64 CLONE=64 → 结束 AIR=1424 WALL=48 CLONE=64；中途曾现: SMOKE,CLONE；新: … |
| FIRE × GAS | REACTION | PASS；起始 AIR=1360 WALL=48 FIRE=64 GAS=64 → 结束 AIR=1488 WALL=48；中途曾现: SMOKE,FIRE,GAS；新: 无；消失: FIR… |
| GAS × CLONE | REACTION | PASS；起始 AIR=1360 WALL=48 GAS=64 CLONE=64 → 结束 AIR=1424 WALL=48 CLONE=64；中途曾现: GAS,CLONE；新: 无；消失… |
| TNT × TNT | REACTION | PASS；起始 AIR=1424 WALL=48 TNT=64 → 结束 AIR=1424 WALL=48 TNT=64；中途曾现: TNT；新: 无；消失: 无；Tmax 20.0°C… |

### 3.3 方向性偏差（A×B 与 B×A 的"判定或产物集合"不同，10 组）

> 邻接交互本应近似对称；此处仅比较**判定与产物种类**（不比较双方存活身份与计数，避免位置/随机噪声）。真正不一致者多为"上下方向偏置"（如火焰向上蔓延更强、液体沿重力方向分层）。

| 有序对 | 用量 | A×B 判定/产物 | B×A 判定/产物 |
|---|---|---|---|
| METAL×ACID vs ACID×METAL | mid | PASS；新 无 | PASS；新 GAS |
| METAL×ACID vs ACID×METAL | large | PASS；新 GAS | PASS；新 无 |
| SALT×WATER vs WATER×SALT | small | FAIL；新 无 | PASS；新 无 |
| SNOW×SEED vs SEED×SNOW | mid | PASS；新 PLANT,DUST,WATER | PASS；新 PLANT,WATER |
| SNOW×LAVA vs LAVA×SNOW | mid | PASS；新 STONE,WATER,STEAM | PASS；新 STONE,WATER |
| SNOW×LN2 vs LN2×SNOW | mid | PASS；新 WATER | PASS；新 ICE,WATER |
| SEED×WATER vs WATER×SEED | mid | PASS；新 PLANT | PASS；新 PLANT,DUST |
| OIL×FIRE vs FIRE×OIL | mid | FAIL；新 无 | FAIL；新 ASH |
| LAVA×SPRING vs SPRING×LAVA | mid | PASS；新 STONE,WATER | PASS；新 STONE,WATER,STEAM |
| STEAM×SMOKE vs SMOKE×STEAM | small | PASS；新 无 | PASS；新 WATER |

> 判读：**"量多少都一样"在反应类组合里往往是设计缺陷**（例如灭火与水量无关，见 §4）。方向性偏差若集中出现，说明蔓延/浮力规则带有未声明的偏置。

---

## 4. 不合理清单（按严重度排序，附修复优先级）

严重度：**Blocker**（破坏守恒/核心物理崩溃）> **Critical**（明显违反常识）> **Major**（与现实的显著偏差）> **Minor**（可接受的简化）。
每条格式：现实会怎样 / 这里会怎样 / 差在哪 / 严重度 / 建议修法。

> **2026-10-12 修订（T6.3）**：§4.3 与 §4.8 **已修复**（保留编号归档）；**新增 §4.16**。
> **编号保持不变**（便于与 `docs/PAIRWISE-MATRIX.md` §6、`tests/PAIRWISE-REPORT.md` §6 追溯）；**建议修复优先级**见下 §4.0（供用户决策，非承诺）。

### 4.0 修复优先级表（供用户决策）

| 优先级 | 条目 | 严重度 | 建议修法摘要 | 需动模块 | 工作量粗估 |
|---|---|---|---|---|---|
| **P0** | §4.16 点燃种子/位置脆弱性 | Major | 给"持续接触"确定性兜底：燃料被 FIRE 连续贴附 N tick（如 20）后必燃；或改累积"受热量" | `reactions.js` + `engine.js(agePass)` | S–M（≈0.5–1 天） |
| **P1** | §4.2 植物整株连坐枯死 | Critical | 枯萎粒度改为"每株 / 每根锚簇"，而非整块连坐 | `biology.js` | M（≈1–1.5 天） |
| **P1** | §4.5 灭火与用量无关 | Major | 引入"水量 ↔ 火能量"对抗模型 | `reactions.js` R1 | M（≈1 天） |
| **P2** | §4.9 湿植物极易燃 | Major | PLANT 增加"含水量"属性，失水后才可燃 | `elements.js` + `reactions.js` | S–M（≈0.5 天） |
| **P2** | §4.4 溶解/酸蚀不守恒 | Major | 引入"盐水/金属盐溶液"或给水加 salinity 属性 | `reactions.js` + `elements.js` | L（≈2 天+，需新元素/属性） |
| **P3** | §4.7 金属不熔于岩浆 | Major | 拆分金属种类，或下调 `METAL.meltPoint` 至铜/铝量级 | `balance.js` | S（≈0.3 天） |
| **P3** | §4.6 熔融统一变 LAVA | Major | 新增 molten-metal / molten-salt 等元素 | `transitions.js` + `elements.js` | M–L（≈1.5 天+） |
| **P4** | §4.13 TNT 触发敏感 | Minor | 增加引信 / 需持续 N tick 才起爆 | `reactions.js` | S |
| **P4** | §4.15 种子"露头"硬条件 | Minor | 露头降为加速项（仅完全封死才禁发芽） | `biology.js` | S |
| **P4** | §4.14 烟 300tick 无条件变 AIR | Minor | 改为随浓度衰减 | `elements.js` | S |
| **P5** | §4.1 温度场写实度不足 | Minor | 生产 320×180 网格复测确认 | 测试（`tests/`） | S |
| **P5** | §4.11 气体逸出顶边难判定 | Minor | 增设封闭盒场景 | 测试（`tests/`） | S |
| — | §4.12 水/冰死区 | Minor | 设计意图，保留并在文档注明 | 文档 | 0 |
| — | §4.3 火离开燃料 | — | **已修复**（归档） | — | — |
| — | §4.8 沙→玻璃链 | — | **已修复**（归档） | — | — |

> 工作量口径（相对本仓规模的经验值，非承诺）：**S** ≈ 2–4 小时，**M** ≈ 半天–1 天，**L** ≈ ≥2 天。

### 4.1. 空气对流/导热已修复，但**温度场写实度仍不足**（隔空加热被网格尺度放大）　`Minor`

- **现实会怎样**：空气导热很弱、主要靠对流；一块热源隔着空气时，对侧升温应缓慢。
- **这里会怎样**：探针 air-conduct：LAVA 与水仅隔 1 格空气，水在 1200 tick 内被加热；改造前恒为 +0.00°C（缺陷 B1），现可测到升温。
- **差在哪**：方向正确；但缩小网格后空气极易被加热，绝对数值偏乐观。
- **严重度**：Minor（证据：tests/run.js A1/A2 通过；BASELINE B1 已消除）
- **建议修法**：生产 320×180 网格下复测，确认升温速率合理。

### 4.2. 植物**整株一起枯死**：大片植物只有一侧临水时，远离水的一侧拖垮整株　`Critical`

- **现实会怎样**：植物只要根系能吸到水就能存活，不会因树冠远离水源而整株死亡。
- **这里会怎样**：PLANT×WATER（mid）实测：64 格植物最终全部变成 81 格 DUST。原因是枯萎以"整个连通群落"为单位触发，区块内任一格根区取不到水（>4 格）即整株枯死。
- **差在哪**：存活判定与实际植物生理不符——应当"逐株/逐枝"判定，而不是"整块连坐"。
- **严重度**：Critical（证据：pairwise-run PLANT×WATER mid/large）
- **建议修法**：枯萎粒度改为"每株（按根锚点分簇）"，或让水在土中扩散、增大 WATER_REACH；至少把"群落级连坐"限制在同一根系的范围内。

### 4.3. 火**离开燃料**：火焰上升速度快于点燃速度，木/油/煤大面积烧不着　`✅ 已修复（2026-10-12）`

- **现实会怎样**：木材、油、煤一旦被点燃会持续燃烧、火势沿燃料面蔓延，烧尽为止。
- **这里会怎样（修复前）**：FIRE×WOOD（mid）仅约 3 格被烧（WOOD 64→61/63）；FIRE×COAL 完全未燃（COAL 64→64）；FIRE×OIL 仅个别格被点燃。
- **根因（三因叠加，均为 v1.0 既有；engineering-lead 独立复现，原文存档于本节/§6）**：
  1. `balance.js FIRE.LIFE_BASE=40 / LIFE_JITTER=10` —— 火焰寿命写死、与燃料量**无关**，木材被点燃后不会"续命"；
  2. `reactions.js` 点燃要求被燃燃料邻接 `AIR/GAS/STEAM`（§9.1 条件③）—— 固体燃料内部无空气 → 内部不点燃，只烧到表层一列；
  3. **时序死锁**：空气通道只在火格消亡（`FIRE→AIR`）后才出现，那一刻火已不在 → 无相邻火源点燃新暴露的燃料层。**故仅延长寿命或提高蔓延概率仍会卡在表层。**
- **修复方案**（按 `docs/COMBUSTION-MODEL.md` / ADR-0006）：新增 `FUEL` 分组（**燃料驱动火焰寿命**）、火焰锚定（`latent>0` 不上浮）、氧源改 Chebyshev-2 仅 AIR、持续耗氧、残灰。
- **修复后实测**（QA 独立复测，证据脚本 `tests/_t63_evidence.js` §B/C/D/F）：

| 场景 | 实测结果 | 判定 |
|---|---|---|
| 8×8 木块，正上方点火 | 213 tick 内烧毁 **52/64 = 81%**（≥80%） | ✓ |
| 竖直木柱（30 格）底部点火 | 火焰窜至柱顶 **y=10**；91 格木剩 2 | ✓ |
| 密封盒（12×12 木 + 内置火种）× 5 种子 | **5/5**：残木 **100%**、结束 FIRE=0（火自熄、无外部氧） | ✓ |
| 8×8 煤块，顶部点火 | 1005 tick 燃尽 **COAL 剩 0/64** | ✓ |
| 回归套件 `node tests/run.js` | **51 / 51 通过**（原 38 + N1 系列 13 条） | ✓ |

  （主理人实测与上表一致：8×8 木块 ≥80% 燃尽、76 格竖直木柱窜顶 y=100、密封盒 ×5 种子 5/5、煤块 100%。）
- **严重度**：原 Critical → **已修复**（证据：上表 + §6.3）。
- **残留**：点燃仍具**概率性** → 见 §4.16（种子/位置脆弱性）。

### 4.4. 酸蚀/溶解**不守恒**：金属凭空消失、盐溶于水后毫无痕迹　`Major`

- **现实会怎样**：酸蚀金属生成金属盐溶液 + 氢气（质量守恒）；盐溶于水后以离子形式留在水中，水"变咸"。
- **这里会怎样**：ACID×METAL：METAL 64→36（凭空减少，仅 0.3 概率产 GAS）；SALT×WATER：SALT 64→0、WATER 64→64（水无任何变化）。
- **差在哪**：溶解产物未进入液相，破坏质量守恒的世界观一致性。
- **严重度**：Major（证据：pairwise-run ACID×METAL、SALT×WATER mid（基线 B5/B6 仍在））
- **建议修法**：引入"盐水/金属盐溶液"状态或给水加 salinity 属性；酸蚀至少保证 METAL→(GAS+溶液) 总数守恒。

### 4.5. 灭火与**用量无关**、且 `FIRE==0` 判据失效　`Major`

- **现实会怎样**：少量水会被大火烧干、灭不了火；足量水才能灭火——灭火效果取决于水火比。
- **这里会怎样**：R1 只要火的 4 邻接中有水就以 p=1.0 熄灭；且火有固定寿命，无水也会自灭。1 格水 vs 24×24 火时，水自己被烤干先消失。
- **差在哪**："灭火"不是"水的消耗对抗火的能量"，而是瞬时判定，导致量效应缺失、且无法判定"是否真的被浇灭"。
- **严重度**：Major（证据：PAIRWISE-MATRIX §6#8；BASELINE B9）
- **建议修法**：改为能量/水量对抗模型：每 tick 水吸收火的热量并少量消耗，火在水消耗完前仍可能存活；判据改用"接触格火在 1–2 tick 内消失"。

### 4.6. 所有熔融**统一变 LAVA**（金属熔/盐熔/玻璃熔都成"岩浆"）　`Major`

- **现实会怎样**：熔融金属、熔盐、熔玻璃是各自独立的物质，与岩浆完全不同。
- **这里会怎样**：§7.7 把 STONE/GLASS/METAL/SALT 的熔融产物统一映射为 LAVA。
- **差在哪**：丧失物质区分度（例如铜水与岩浆同质）。
- **严重度**：Major（证据：transitions.js / balance.js）
- **建议修法**：为熔融金属（molten-metal）等新增元素，或至少保留来源标签。

### 4.7. 液体**金属不会熔化于岩浆**（对铁成立、对铜/铝不成立）　`Major`

- **现实会怎样**：铜 1085°C、铝 660°C 会被岩浆（约 1200°C）熔化；铁 1538°C 不会。
- **这里会怎样**：METAL.meltPoint=1500 > LAVA 1200 → 金属永不熔（LAVA×METAL 实测 METAL 64→64）。
- **差在哪**：把所有金属当作铁，忽略低熔点金属。
- **严重度**：Major（证据：pairwise-run LAVA×METAL mid（基线 B7 相关））
- **建议修法**：拆分金属种类或降低 METAL.meltPoint 到铜/铝量级并注明简化。

### 4.8. 沙 → 玻璃链在标准场景**不可达**　`✅ 已修复（接触反应 R20，2026-10-12）`

- **现实会怎样**：沙（石英）在约 1700°C 熔成玻璃。
- **为何"阈值路线"走不通**（关键证据）：沙密度 **1600** 而岩浆密度 **2800** → 沙**浮于岩浆之上**，"倒岩浆在沙上"只能**单面受热**。QA 独立实测：沙格所经历**最高温仅 286.4 °C**（主理人实测 368–528 °C；两套几何都**远够不到任何合理阈值**）。故把 `GLASS_T` 从 1700 降到 1200、甚至 1100 都**无法自然触发**。
- **最终方案**：改为**接触反应 R20** —— `LAVA` 4 邻接 `SAND` → 沙以 `p = GLASS_CONTACT_P = 0.02/tick` 直接变 `GLASS`，同时岩浆侧 −20 °C（玻璃化耗能）；辅路径 `GLASS_T = 1100` 作为**兜底**保留（`balance.js` / `reactions.js`）。
- **修复后实测**（QA 独立复测，证据脚本 `tests/_t63_evidence.js` §A）：

| 场景 | 实测 | 判定 |
|---|---|---|
| 30×4 沙层 + 30×6 岩浆，2000 tick | **GLASS = 53**（主理人实测 54） | ✓ |
| 沙块 ‖ 岩浆（侧向接触），2000 tick | **GLASS = 59** | ✓ |
| 反例：沙单独，2000 tick | **GLASS = 0** | ✓ |
| 反例：沙 + 水，2000 tick | **GLASS = 0** | ✓ |

- **严重度**：原 Major → **已修复**（证据：上表 + `tests/run.js` 用例 15 / 15b / 15c）。

### 4.9. 植物**极易燃**，与其"含水活体"设定矛盾　`Major`

- **现实会怎样**：活的湿植物不易燃，通常先被烤干失水才会燃烧。
- **这里会怎样**：PLANT flammability=0.15、燃点 250°C，属于易燃料；FIRE×PLANT 中植物大量被点燃/枯萎（PLANT→DUST 63 + 灰）。
- **差在哪**："湿植物"本应耐火，却与纸木同级易燃。
- **严重度**：Major（证据：pairwise-run FIRE×PLANT mid（PAIRWISE-MATRIX §6#18））
- **建议修法**：给 PLANT 增加"含水量"属性：含水时 flammability≈0，失水（枯萎）后才可燃。

### 4.10. 燃烧/灭火的**能量凭空增减**　`Minor`

- **现实会怎样**：水灭火本身以水蒸气为主，基本不产生烟；能量守恒。
- **这里会怎样**：R1 把火直接变 SMOKE，并给水 +55°C（能量凭空增加）；反过来燃烧不消耗真实氧（§9.6 以 AIR→SMOKE 近似）。
- **差在哪**：温度账本不平，长时间运行会漂移。
- **严重度**：Minor（证据：pairwise-run FIRE×WATER（火变烟））
- **建议修法**：灭火产物改为以 STEAM 为主、少量 SMOKE；把 +55°C 改为按被熄灭火的剩余能量分配。

### 4.11. 气体**逸出顶边**导致气体类组合无法稳定判定　`Minor`

- **现实会怎样**：开阔环境中气体扩散、无害；密闭环境才需守恒。
- **这里会怎样**：STEAM/SMOKE/FIRE/GAS 升到顶边即被移除（§13.3）；TNT×GAS 实测 GAS 自行逸出（64→0），与 TNT 无关。
- **差在哪**：本实验的开放场景使"气体类"组合的结束计数常为 0，需借助 everSeen 判读（已在报告中使用）。
- **严重度**：Minor（证据：pairwise-run TNT×GAS mid）
- **建议修法**：判据保持用 everSeen；如需精确计数，增设封闭盒场景。

### 4.12. 水/冰**相变死区**（-2°C 结冰 / 0°C 融化）与"水 0°C 结冰"不符　`Minor`

- **现实会怎样**：纯水在 0°C 结冰。
- **这里会怎样**：采用 [-2,0] 迟滞死区避免抖动（§7.3）。
- **差在哪**：刻意偏离，属工程取舍。
- **严重度**：Minor（证据：balance.js WATER.FREEZE_T=-2）
- **建议修法**：保持（属设计意图），在文档中明示。

### 4.13. TNT **触发过于敏感**（≥180°C 或邻接火即爆）　`Minor`

- **现实会怎样**：炸药需引信/冲击/显著热量才起爆。
- **这里会怎样**：只要邻居挨着火或自身被烤到 180°C 即爆（LAVA 挨着 TNT 也会引爆）。
- **差在哪**：缺少"引信"概念，误爆风险高。
- **严重度**：Minor（证据：pairwise-run TNT×LAVA mid）
- **建议修法**：增加点火需持续 N tick 或需明确引信。

### 4.14. **烟 300 tick 无条件变空气**（无扩散稀释过程）　`Minor`

- **现实会怎样**：烟被空气稀释、逐渐变淡消散，成分仍在。
- **这里会怎样**：SMOKE.lifetime=300 → decayTo AIR，到点直接消失。
- **差在哪**：近似可接受，但属质量损失。
- **严重度**：Minor（证据：elements.js SMOKE）
- **建议修法**：可接受；若要更真，改为随浓度衰减。

### 4.15. 种子发芽用"上方 2 格有空气/水"近似"露头/见光"，**埋深即不发芽**　`Minor`

- **现实会怎样**：多数种子在土内即使无光也能发芽（埋深只影响出苗）。
- **这里会怎样**：SEED 需"着地 + 湿度 + 适温 + 露头（上方 1–2 格为 AIR/WATER）"四条件同时满足才累计发芽计时。
- **差在哪**：把"光/露头"当作硬条件，导致被覆盖的湿种子永不发芽。
- **严重度**：Minor（证据：biology.js SEED 分支；PAIRWISE-MATRIX §6#19）
- **建议修法**：把"露头"从硬条件降为加速项，或仅在完全被静态固体封死时才禁止。

### 4.16. **点燃的种子/位置脆弱性**：同样的"木块旁点火"，换个种子/位置就可能完全不燃　`Major`（本轮新发现）

- **现实会怎样**：把火苗放到干木材旁，木材应当**必然**被引燃（只差时间）。
- **这里会怎样**：点燃是**概率性**的（`p = FUEL.spreadP × 方向偏置 = 0.05`），逐 tick 掷骰，掷骰用**无状态位置哈希** `RNG.hash01(x, y, salt+tick)`；而自由火焰（手绘火，`latent=0`）的寿命/位置受**种子**驱动 → "有效判定次数"与骰子序列随种子改变，倒霉组合下一次都掷不中。
- **实测证据**（QA 独立复测，8×8 木块 + 紧贴左侧 1 格火苗，1500 tick；证据脚本 `tests/_t63_evidence.js` §E）：

| 维度 | 实测 |
|---|---|
| 跨 8 种子（1 / 2 / 7 / 42 / 99 / 20261011 / 555 / 1337） | **6/8 可点燃**；**seed=555、seed=1337（默认！）→ 0%** |
| 默认种子 1337，改变火源 y（木块随之平移） | y=40/80/120/150 → 95–100%；**y=174 → 0%** |

  （主理人实测同现象：默认种子 1337 → 0%；y=40/80/120/150 → 100%，y=174 → 0%。**注**：具体"中招"的种子集随几何微变——主理人几何中 seed=555 可点燃，本几何中 seed=555 不可；这恰恰佐证"位置/几何敏感"，故以**现象复现**为准，不锁死具体种子表。）
- **机制量化**（QA 补充探针）：同场景下"火焰 4 邻接木块列的 tick 数"约 **33–36**（三种子相近），单次命中率 `p=0.05` → **P(33 次全不中) ≈ 0.95³³ ≈ 18%**。即失败是约 1/5 的二项尾概率，且因引擎**确定性**而**稳定重现**（不是偶发抖动，而是"这个种子永远点不燃"）。
- **判定**：**Major（玩法稳定性）**——不是"物理不合理"，而是"**不可预期**"：同样操作有时烧成灰、有时纹丝不动。
- **建议修法**（供参考，最终由主理人/用户定）：给"持续接触"一个**确定性兜底**——燃料被 `FIRE` 连续贴附 N tick（如 20）后**必燃**；或改为累积"受热量"而非逐 tick 独立掷骰（消除二项尾）。

**合计 16 条**（含 2 条已修复归档：§4.3、§4.8）。**仍存在 14 条**：按严重度 **Critical 1 / Major 6 / Minor 7**。

---

## 5. 与改造前基线（tests/BASELINE.md）的对比

| 基线编号 | 改造前问题 | 改造后状态 | 证据 |
|---|---|---|---|
| B1 | 空气不导热（隔 1 格空气水升温 +0.00°C） | **已修复 ✓** | air-conduct 探针：现可升温；tests/run.js A1/A2 通过；SELF_K=0.5 双轨导热 |
| B2 | 热空气不上升（热区 ΔY=0） | **已修复 ✓** | tests/run.js A3（>100°C 空气上沿上移 ≥15 格）通过；air.js 浮力置换 |
| B3 | 植物无根乱长（悬空长 21–24 格） | **已修复 ✓** | tests/run.js B4（浮空植物 1800 tick 不生长并整株枯死）通过；biological isRooted BFS |
| B4 | 倒液氮凭空造水（WATER 64→87） | **已修复 ✓** | LN2 汽化产物改为 AIR；tests/run.js 用例 14 通过；本实验 WATER×LN2 不再净增水 |
| B5 | 盐溶后盐凭空消失、水无变化 | ****仍在 ✗**** | SALT×WATER 实测 SALT 64→0、WATER 64→64（不合理清单 #4） |
| B6 | 酸蚀不守恒（金属质量蒸发） | ****仍在 ✗**** | ACID×METAL 实测 METAL 64→36（不合理清单 #4） |
| B7 | 沙→玻璃链不可达 | **已修复 ✓** | R20 接触玻璃化；QA 复测 GLASS=53–59、反例（沙单独 / 沙+水）=0（不合理清单 §4.8） |
| B8 | 水源泉 SPRING 为死元素 | **已修复 ✓** | reactions.js R19 出水；tests/run.js 12a/12b 通过；本实验 SPRING×WATER WATER 64→368 |
| B9 | "灭火"判据失效（FIRE 恒自灭） | ****仍在 ✗**** | 不合理清单 #5 |
| B10 | 火对固体/液体燃料点燃极弱（新增观察） | **已修复 ✓** | N1 修复：8×8 木 81% 燃尽、煤 100%、竖直木柱窜顶、密封盒 ×5 种子自熄（不合理清单 §4.3） |
| #3(部分) | 燃烧不消耗氧、不产 CO₂ | **部分修复 △** | reactions.js consumeOxygen：点燃时 AIR→SMOKE 近似耗氧；但仍不产 CO₂、且 AIR 本质仍可无限供给 |
| #7 | 植物无根、无向地性 | **已修复 ✓** | 严格生态：着地 + 根系连通 + 供水；见 PLANT-MODEL.md 与 tests/run.js G2/G3/B4/D2 |

> 结论：用户点名的三条（空气不导热 / 热空气不上升 / 植物无根乱长）**均已修复**；"倒液氮凭空造水"**已修复**；"水源泉为死元素"**已修复**；本轮**新增修复**"火离开燃料"（B10，§4.3）与"沙→玻璃链不可达"（B7，§4.8）。仍存在的主要问题见 §4（14 条）。

---

## 6. 跨批次补充与编号索引（合并自 `tests/PAIRWISE-REPORT.md`）

> 本节承接批次 B（`tests/pairwise.js`，8100 次仿真）的**独有内容**，并入本报告作为唯一真源。`tests/PAIRWISE-REPORT.md` 已收敛为**指针页**（保留可追溯性，不再单独维护）。
> 说明：批次 A（本报告主体，`tests/pairwise-run.js`，5400 次）与批次 B 是**两套不同工具/规模**的实验，结论互证；本文以批次 A 的 §2 全量对照表为主，批次 B 的方法学与稳健性结论并入本节。

### 6.1 判定规则的两处改进（批次 B）

1. **分类兜底规则**：对 STRUCT / NONE / MIX / SELF / FLOW 五类（现实预期"不产生新物质"），自动核对是否凭空出现新元素，并把有现实依据的**环境自发转变**列入白名单（植物无水枯萎成灰、冰/雪融化、蒸汽冷凝、岩浆凝固、火焰燃尽、液氮汽化）。共 **1887 条**由"人工判读"升级为"自动判定"。
2. **全程曾出现判据 `appearDuring`**：用于"种子发芽"——幼苗可能在结束前已枯萎，只看末态会误判"没发芽"。
3. **`--rejudge` 模式**：只重算判定、不重跑仿真；改规则后秒级刷新全量结论。

### 6.2 用户点名三缺陷的定向探针（批次 B）

| 缺陷 | 探针 | 改造前 | 改造后（实测） | 结论 |
|---|---|---|---|---|
| B1 空气不导热 | `air-conduct` | +0.00 °C | **+27.9 °C** | ✅ 已修复 |
| B2 热空气不上升 | `hot-air-rises` | ΔY = 0.0 | **ΔY = −17.0 格** | ✅ 已修复 |
| B3 植物无根乱长（正例） | `plant-root` | 无根疯长 | 着地+有水向上 **19 格** | ✅ 已修复 |
| B3 植物无根乱长（反例） | `plant-air` | 悬空长 24 格 | 悬空整株枯死（**0 格**） | ✅ 已修复 |

### 6.3 稳健性与确定性（QA 稳定性）

| 检查 | 方法 | 结果 |
|---|---|---|
| 可复现性 | 同参数连跑两次逐条比对 | ✅ 完全一致 |
| 种子敏感性（**判定层** flaky） | 同组合 3 种子判定是否一致 | ✅ **0 个组合**不一致 |
| 跨用量一致性 | 同组合 small / mid / large 判定是否一致 | ✅ 仅 2 组不同（种子×水，受 §6.5 影响） |
| 回归套件 | `node tests/run.js` | ✅ **51 / 51 通过**（原 38 + N1 系列 13 条） |
| 随机源 | 全仓 `grep Math.random` | ✅ 引擎内无 `Math.random`，全走确定性哈希 RNG |
| 点燃稳定性（**本轮新增已知项**） | 8×8 木块旁点火 × 8 种子 | ⚠️ 仅 **6/8** 可点燃（见 §4.16，Major） |

> ⚠️ **注意区分**：判定层"0 flaky"指**矩阵判定结果**跨种子一致；§4.16 的脆弱性发生在**更细的玩法维度**（同一操作是否引燃）——两者不矛盾，但后者更贴近玩家手感。

### 6.4 规格文档有误（✗ 已订正）

| # | 规格处 | 说明 |
|---|---|---|
| N2 | `docs/PAIRWISE-MATRIX.md` §5.5「炸药 × 火药 → 殉爆」「炸药 × 瓦斯 → 殉爆」 | 实测**无火源时三者皆不引爆**（炸药不变）；现实里炸药需引发剂，**引擎行为正确、文档描述有误**。✅ 已把 §5.5 限定为"有引爆源时"，并同步更新 §5.1 火×木 / 火×煤 批注（N1 已修复）。 |

### 6.5 残余 FAIL 的唯一根因（批次 B：6 条，全在 small 档）

| 组合 | 用量 | 失败断言 | 根因（已定位） |
|---|---|---|---|
| 种子 × 水 / 水 × 种子 | small(1×1) | 期望出现过"植物"，未出现 | **1 格水在平坦托盘上"随机漫步"**（400 帧内 x:24→8），无法在种子周围维持湿度；种子需"连续 90 帧湿润"才发芽。mid/large 水量充足 → 全部通过。 |

- **归因**：引擎的真实（轻微）局限——**水无内聚力/表面张力**（= 新增项 N3），非脚本误报、非回归。
- **影响面**：仅"极小用量的种子 + 单格水"这一边缘场景；**不阻塞发布**。

### 6.6 本轮未覆盖 / 新增轻微项

**（a）未覆盖、需专项探针（○，不臆断）** —— 依赖"受限空间 / 极端温差 / 单点触发"场景，本矩阵的"并排方块 + 开放空气"场景覆盖不到：

- 蒸汽 600 tick 强制变水（§4.12 相关的温度线，矩阵层未覆盖；`tests/run.js` 用例 13 已实测 T≥100 恒不冷凝）
- 所有熔融统一映射为 LAVA（§4.6，已在代码层确认）
- 金属不熔于岩浆（§4.7，已在矩阵确认）
- 水/冰死区（§4.12，设计意图）
- 密闭空间燃烧（已由 N1-4 / N1-5 覆盖）
- 火焰贴水面 1 格（现象存在，§4 预判 #22）

**（b）新增轻微项（Minor，源自批次 B）**：

| # | 问题 | 实测 | 严重度 |
|---|---|---|---|
| N3 | 液体**无内聚力/表面张力**，单格水在平坦面随机游走、不聚成液滴 | small `种子×水`：水 400 帧内 x:24→8 → 种子无法持续浸润、不发芽（§6.5 的根因） | Minor |
| N4 | 油燃尽设定 **20%** 概率留灰（`FIRE.RESIDUE_ASH.OIL=0.2`） | large `火×油`：出现灰 1 | Minor |
| N5 | 火焰寿命偏短导致燃烧过程偏短 | 已随 N1 修复改善（现由 `FUEL.burnTicks` 驱动，见 §4.3） | Minor（已改善） |
| N6 | 火焰贴水面即灭（4 邻接 WATER 即 p=1.0） | 现象存在（= 预判 #22） | Minor |

### 6.7 编号索引（三方映射）

> 仅作**参考**，非严格一一对应（三份清单的可判定粒度不同）。
> - `A` = 本文 `docs/PAIRWISE-REPORT.md` §4
> - `M` = `docs/PAIRWISE-MATRIX.md` §6（22 条预判）
> - `B` = 批次 B（原 `tests/PAIRWISE-REPORT.md` §6）

| 项 | A | M | B |
|---|---|---|---|
| 空气导热/温度场 | 4.1 | #5 | 6.2 |
| 植物整株连坐枯死 | 4.2 | #7 | — |
| 火离开燃料（**已修复**） | 4.3 | §5.1 N1 | 6.1 |
| 溶解/酸蚀不守恒 | 4.4 | #1 #2 | 6.3 |
| 灭火与用量无关 | 4.5 | #8 | 6.3 |
| 熔融统一变 LAVA | 4.6 | #11 | 6.6 |
| 金属不熔于岩浆 | 4.7 | #13 | 6.6 |
| 沙→玻璃（**已修复**） | 4.8 | #12 | — |
| 湿植物易燃 | 4.9 | #18 | 6.6 |
| 灭火能量不平 | 4.10 | #21 | 6.3 |
| 气体逸出顶边 | 4.11 | — | 6.4 |
| 水/冰死区 | 4.12 | #14 | 6.6 |
| TNT 触发 | 4.13 | #20 | 6.4 |
| 烟 300tick 变 AIR | 4.14 | #10 | 6.4 |
| 种子"露头"硬条件 | 4.15 | #19 | 6.6 |
| 点燃种子/位置脆弱性（**本轮新发现**） | 4.16 | — | — |

---

## 附录 A · 全量判定索引（900 有序对 × 3 用量，去重展示为 465 无序对）

> 每行：`组合 | 判定(小/中/大) | 组合类别`。完整逐行数据见 `tests/_out/pairwise-full.json`。

| 组合 | 类别 | small | mid | large |
|---|---|---|---|---|
| AIR×AIR | NONE | N/A | N/A | N/A |
| AIR×WALL | AIR | PASS | PASS | PASS |
| AIR×STONE | AIR | PASS | PASS | PASS |
| AIR×GLASS | AIR | PASS | PASS | PASS |
| AIR×METAL | AIR | PASS | PASS | PASS |
| AIR×ICE | AIR | PASS | PASS | PASS |
| AIR×WOOD | AIR | PASS | PASS | PASS |
| AIR×PLANT | AIR | PASS | PASS | PASS |
| AIR×SAND | AIR | PASS | PASS | PASS |
| AIR×SOIL | AIR | PASS | PASS | PASS |
| AIR×SALT | AIR | PASS | PASS | PASS |
| AIR×DUST | AIR | PASS | PASS | PASS |
| AIR×SNOW | AIR | PASS | PASS | PASS |
| AIR×ASH | AIR | PASS | PASS | PASS |
| AIR×COAL | AIR | PASS | PASS | PASS |
| AIR×GUNPOWDER | AIR | PASS | PASS | PASS |
| AIR×SEED | AIR | PASS | PASS | PASS |
| AIR×WATER | AIR | PASS | PASS | PASS |
| AIR×OIL | AIR | PASS | PASS | PASS |
| AIR×LAVA | AIR | PASS | PASS | PASS |
| AIR×ACID | AIR | PASS | PASS | PASS |
| AIR×LN2 | AIR | PASS | PASS | PASS |
| AIR×STEAM | AIR | PASS | PASS | PASS |
| AIR×SMOKE | AIR | PASS | PASS | PASS |
| AIR×FIRE | AIR | PASS | PASS | PASS |
| AIR×GAS | AIR | PASS | PASS | PASS |
| AIR×CLONE | AIR | PASS | PASS | PASS |
| AIR×VIRUS | AIR | PASS | PASS | PASS |
| AIR×SPRING | AIR | PASS | PASS | PASS |
| AIR×TNT | AIR | PASS | PASS | PASS |
| WALL×WALL | SELF | N/A | N/A | N/A |
| WALL×STONE | NONE | N/A | N/A | N/A |
| WALL×GLASS | NONE | N/A | N/A | N/A |
| WALL×METAL | NONE | N/A | N/A | N/A |
| WALL×ICE | NONE | N/A | N/A | N/A |
| WALL×WOOD | NONE | N/A | N/A | N/A |
| WALL×PLANT | NONE | N/A | N/A | N/A |
| WALL×SAND | STRUCT | PASS | PASS | PASS |
| WALL×SOIL | STRUCT | PASS | PASS | PASS |
| WALL×SALT | STRUCT | PASS | PASS | PASS |
| WALL×DUST | STRUCT | PASS | PASS | PASS |
| WALL×SNOW | STRUCT | PASS | PASS | PASS |
| WALL×ASH | STRUCT | PASS | PASS | PASS |
| WALL×COAL | NONE | N/A | N/A | N/A |
| WALL×GUNPOWDER | STRUCT | PASS | PASS | PASS |
| WALL×SEED | STRUCT | PASS | PASS | PASS |
| WALL×WATER | STRUCT | PASS | PASS | PASS |
| WALL×OIL | STRUCT | PASS | PASS | PASS |
| WALL×LAVA | THERMAL | PASS | PASS | PASS |
| WALL×ACID | STRUCT | PASS | PASS | PASS |
| WALL×LN2 | THERMAL | PASS | PASS | PASS |
| WALL×STEAM | STRUCT | PASS | PASS | PASS |
| WALL×SMOKE | STRUCT | PASS | PASS | PASS |
| WALL×FIRE | THERMAL | PASS | PASS | PASS |
| WALL×GAS | STRUCT | PASS | PASS | PASS |
| WALL×CLONE | NONE | N/A | N/A | N/A |
| WALL×VIRUS | NONE | N/A | N/A | N/A |
| WALL×SPRING | NONE | N/A | N/A | N/A |
| WALL×TNT | NONE | N/A | N/A | N/A |
| STONE×STONE | SELF | N/A | N/A | N/A |
| STONE×GLASS | NONE | N/A | N/A | N/A |
| STONE×METAL | NONE | N/A | N/A | N/A |
| STONE×ICE | NONE | N/A | N/A | N/A |
| STONE×WOOD | NONE | N/A | N/A | N/A |
| STONE×PLANT | NONE | N/A | N/A | N/A |
| STONE×SAND | STRUCT | PASS | PASS | PASS |
| STONE×SOIL | STRUCT | PASS | PASS | PASS |
| STONE×SALT | STRUCT | PASS | PASS | PASS |
| STONE×DUST | STRUCT | PASS | PASS | PASS |
| STONE×SNOW | STRUCT | PASS | PASS | PASS |
| STONE×ASH | STRUCT | PASS | PASS | PASS |
| STONE×COAL | NONE | N/A | N/A | N/A |
| STONE×GUNPOWDER | STRUCT | PASS | PASS | PASS |
| STONE×SEED | STRUCT | PASS | PASS | PASS |
| STONE×WATER | STRUCT | PASS | PASS | PASS |
| STONE×OIL | STRUCT | PASS | PASS | PASS |
| STONE×LAVA | PHASE | PASS | PASS | PASS |
| STONE×ACID | REACTION | PASS | PASS | PASS |
| STONE×LN2 | PHASE | PASS | PASS | PASS |
| STONE×STEAM | STRUCT | PASS | PASS | PASS |
| STONE×SMOKE | STRUCT | PASS | PASS | PASS |
| STONE×FIRE | PHASE | PASS | PASS | PASS |
| STONE×GAS | STRUCT | PASS | PASS | PASS |
| STONE×CLONE | NONE | N/A | N/A | N/A |
| STONE×VIRUS | NONE | N/A | N/A | N/A |
| STONE×SPRING | NONE | N/A | N/A | N/A |
| STONE×TNT | NONE | N/A | N/A | N/A |
| GLASS×GLASS | SELF | N/A | N/A | N/A |
| GLASS×METAL | NONE | N/A | N/A | N/A |
| GLASS×ICE | NONE | N/A | N/A | N/A |
| GLASS×WOOD | NONE | N/A | N/A | N/A |
| GLASS×PLANT | NONE | N/A | N/A | N/A |
| GLASS×SAND | STRUCT | PASS | PASS | PASS |
| GLASS×SOIL | STRUCT | PASS | PASS | PASS |
| GLASS×SALT | STRUCT | PASS | PASS | PASS |
| GLASS×DUST | STRUCT | PASS | PASS | PASS |
| GLASS×SNOW | STRUCT | PASS | PASS | PASS |
| GLASS×ASH | STRUCT | PASS | PASS | PASS |
| GLASS×COAL | NONE | N/A | N/A | N/A |
| GLASS×GUNPOWDER | STRUCT | PASS | PASS | PASS |
| GLASS×SEED | STRUCT | PASS | PASS | PASS |
| GLASS×WATER | STRUCT | PASS | PASS | PASS |
| GLASS×OIL | STRUCT | PASS | PASS | PASS |
| GLASS×LAVA | PHASE | PASS | PASS | PASS |
| GLASS×ACID | STRUCT | PASS | PASS | PASS |
| GLASS×LN2 | PHASE | PASS | PASS | PASS |
| GLASS×STEAM | STRUCT | PASS | PASS | PASS |
| GLASS×SMOKE | STRUCT | PASS | PASS | PASS |
| GLASS×FIRE | PHASE | PASS | PASS | PASS |
| GLASS×GAS | STRUCT | PASS | PASS | PASS |
| GLASS×CLONE | NONE | N/A | N/A | N/A |
| GLASS×VIRUS | NONE | N/A | N/A | N/A |
| GLASS×SPRING | NONE | N/A | N/A | N/A |
| GLASS×TNT | NONE | N/A | N/A | N/A |
| METAL×METAL | SELF | N/A | N/A | N/A |
| METAL×ICE | NONE | N/A | N/A | N/A |
| METAL×WOOD | NONE | N/A | N/A | N/A |
| METAL×PLANT | NONE | N/A | N/A | N/A |
| METAL×SAND | STRUCT | PASS | PASS | PASS |
| METAL×SOIL | STRUCT | PASS | PASS | PASS |
| METAL×SALT | STRUCT | PASS | PASS | PASS |
| METAL×DUST | STRUCT | PASS | PASS | PASS |
| METAL×SNOW | STRUCT | PASS | PASS | PASS |
| METAL×ASH | STRUCT | PASS | PASS | PASS |
| METAL×COAL | NONE | N/A | N/A | N/A |
| METAL×GUNPOWDER | STRUCT | PASS | PASS | PASS |
| METAL×SEED | STRUCT | PASS | PASS | PASS |
| METAL×WATER | STRUCT | PASS | PASS | PASS |
| METAL×OIL | STRUCT | PASS | PASS | PASS |
| METAL×LAVA | PHASE | PASS | PASS | PASS |
| METAL×ACID | REACTION | PASS | PASS | PASS |
| METAL×LN2 | PHASE | PASS | PASS | PASS |
| METAL×STEAM | STRUCT | PASS | PASS | PASS |
| METAL×SMOKE | STRUCT | PASS | PASS | PASS |
| METAL×FIRE | PHASE | PASS | PASS | PASS |
| METAL×GAS | STRUCT | PASS | PASS | PASS |
| METAL×CLONE | NONE | N/A | N/A | N/A |
| METAL×VIRUS | NONE | N/A | N/A | N/A |
| METAL×SPRING | NONE | N/A | N/A | N/A |
| METAL×TNT | NONE | N/A | N/A | N/A |
| ICE×ICE | SELF | N/A | N/A | N/A |
| ICE×WOOD | NONE | N/A | N/A | N/A |
| ICE×PLANT | NONE | N/A | N/A | N/A |
| ICE×SAND | STRUCT | PASS | PASS | PASS |
| ICE×SOIL | STRUCT | PASS | PASS | PASS |
| ICE×SALT | STRUCT | PASS | PASS | PASS |
| ICE×DUST | STRUCT | PASS | PASS | PASS |
| ICE×SNOW | STRUCT | PASS | PASS | PASS |
| ICE×ASH | STRUCT | PASS | PASS | PASS |
| ICE×COAL | NONE | N/A | N/A | N/A |
| ICE×GUNPOWDER | STRUCT | PASS | PASS | PASS |
| ICE×SEED | STRUCT | PASS | PASS | PASS |
| ICE×WATER | STRUCT | PASS | PASS | PASS |
| ICE×OIL | STRUCT | PASS | PASS | PASS |
| ICE×LAVA | REACTION | PASS | PASS | PASS |
| ICE×ACID | STRUCT | PASS | PASS | PASS |
| ICE×LN2 | PHASE | PASS | PASS | PASS |
| ICE×STEAM | STRUCT | PASS | PASS | PASS |
| ICE×SMOKE | STRUCT | PASS | PASS | PASS |
| ICE×FIRE | PHASE | PASS | PASS | PASS |
| ICE×GAS | STRUCT | PASS | PASS | PASS |
| ICE×CLONE | NONE | N/A | N/A | N/A |
| ICE×VIRUS | NONE | N/A | N/A | N/A |
| ICE×SPRING | NONE | N/A | N/A | N/A |
| ICE×TNT | NONE | N/A | N/A | N/A |
| WOOD×WOOD | SELF | N/A | N/A | N/A |
| WOOD×PLANT | NONE | N/A | N/A | N/A |
| WOOD×SAND | STRUCT | PASS | PASS | PASS |
| WOOD×SOIL | STRUCT | PASS | PASS | PASS |
| WOOD×SALT | STRUCT | PASS | PASS | PASS |
| WOOD×DUST | STRUCT | PASS | PASS | PASS |
| WOOD×SNOW | STRUCT | PASS | PASS | PASS |
| WOOD×ASH | STRUCT | PASS | PASS | PASS |
| WOOD×COAL | NONE | N/A | N/A | N/A |
| WOOD×GUNPOWDER | STRUCT | PASS | PASS | PASS |
| WOOD×SEED | STRUCT | PASS | PASS | PASS |
| WOOD×WATER | STRUCT | PASS | PASS | PASS |
| WOOD×OIL | STRUCT | PASS | PASS | PASS |
| WOOD×LAVA | THERMAL | PASS | PASS | PASS |
| WOOD×ACID | STRUCT | PASS | PASS | PASS |
| WOOD×LN2 | THERMAL | PASS | PASS | PASS |
| WOOD×STEAM | STRUCT | PASS | PASS | PASS |
| WOOD×SMOKE | STRUCT | PASS | PASS | PASS |
| WOOD×FIRE | REACTION | FAIL | FAIL | FAIL |
| WOOD×GAS | STRUCT | PASS | PASS | PASS |
| WOOD×CLONE | NONE | N/A | N/A | N/A |
| WOOD×VIRUS | REACTION | PASS | PASS | PASS |
| WOOD×SPRING | NONE | N/A | N/A | N/A |
| WOOD×TNT | NONE | N/A | N/A | N/A |
| PLANT×PLANT | SELF | N/A | N/A | N/A |
| PLANT×SAND | STRUCT | PASS | PASS | PASS |
| PLANT×SOIL | LIFE | PASS | PASS | PASS |
| PLANT×SALT | STRUCT | PASS | PASS | PASS |
| PLANT×DUST | STRUCT | PASS | PASS | PASS |
| PLANT×SNOW | STRUCT | PASS | PASS | PASS |
| PLANT×ASH | STRUCT | PASS | PASS | PASS |
| PLANT×COAL | NONE | N/A | N/A | N/A |
| PLANT×GUNPOWDER | STRUCT | PASS | PASS | PASS |
| PLANT×SEED | STRUCT | PASS | PASS | PASS |
| PLANT×WATER | LIFE | PASS | PASS | PASS |
| PLANT×OIL | STRUCT | PASS | PASS | PASS |
| PLANT×LAVA | REACTION | PASS | PASS | PASS |
| PLANT×ACID | REACTION | PASS | PASS | PASS |
| PLANT×LN2 | THERMAL | PASS | PASS | PASS |
| PLANT×STEAM | STRUCT | PASS | PASS | PASS |
| PLANT×SMOKE | STRUCT | PASS | PASS | PASS |
| PLANT×FIRE | REACTION | PASS | PASS | PASS |
| PLANT×GAS | STRUCT | PASS | PASS | PASS |
| PLANT×CLONE | NONE | N/A | N/A | N/A |
| PLANT×VIRUS | REACTION | PASS | PASS | PASS |
| PLANT×SPRING | NONE | N/A | N/A | N/A |
| PLANT×TNT | NONE | N/A | N/A | N/A |
| SAND×SAND | SELF | N/A | N/A | N/A |
| SAND×SOIL | MIX | PASS | PASS | PASS |
| SAND×SALT | MIX | PASS | PASS | PASS |
| SAND×DUST | MIX | PASS | PASS | PASS |
| SAND×SNOW | MIX | PASS | PASS | PASS |
| SAND×ASH | MIX | PASS | PASS | PASS |
| SAND×COAL | STRUCT | PASS | PASS | PASS |
| SAND×GUNPOWDER | MIX | PASS | PASS | PASS |
| SAND×SEED | MIX | PASS | PASS | PASS |
| SAND×WATER | MIX | PASS | PASS | PASS |
| SAND×OIL | MIX | PASS | PASS | PASS |
| SAND×LAVA | PHASE | PASS | PASS | PASS |
| SAND×ACID | MIX | PASS | PASS | PASS |
| SAND×LN2 | PHASE | PASS | PASS | PASS |
| SAND×STEAM | FLOW | PASS | PASS | PASS |
| SAND×SMOKE | FLOW | PASS | PASS | PASS |
| SAND×FIRE | PHASE | PASS | PASS | PASS |
| SAND×GAS | FLOW | PASS | PASS | PASS |
| SAND×CLONE | REACTION | PASS | PASS | PASS |
| SAND×VIRUS | STRUCT | PASS | PASS | PASS |
| SAND×SPRING | STRUCT | PASS | PASS | PASS |
| SAND×TNT | STRUCT | PASS | PASS | PASS |
| SOIL×SOIL | SELF | N/A | N/A | N/A |
| SOIL×SALT | MIX | PASS | PASS | PASS |
| SOIL×DUST | MIX | PASS | PASS | PASS |
| SOIL×SNOW | MIX | PASS | PASS | PASS |
| SOIL×ASH | MIX | PASS | PASS | PASS |
| SOIL×COAL | STRUCT | PASS | PASS | PASS |
| SOIL×GUNPOWDER | MIX | PASS | PASS | PASS |
| SOIL×SEED | LIFE | PASS | PASS | PASS |
| SOIL×WATER | MIX | PASS | PASS | PASS |
| SOIL×OIL | MIX | PASS | PASS | PASS |
| SOIL×LAVA | THERMAL | PASS | PASS | PASS |
| SOIL×ACID | MIX | PASS | PASS | PASS |
| SOIL×LN2 | THERMAL | PASS | PASS | PASS |
| SOIL×STEAM | FLOW | PASS | PASS | PASS |
| SOIL×SMOKE | FLOW | PASS | PASS | PASS |
| SOIL×FIRE | THERMAL | PASS | PASS | PASS |
| SOIL×GAS | FLOW | PASS | PASS | PASS |
| SOIL×CLONE | REACTION | PASS | PASS | PASS |
| SOIL×VIRUS | STRUCT | PASS | PASS | PASS |
| SOIL×SPRING | STRUCT | PASS | PASS | PASS |
| SOIL×TNT | STRUCT | PASS | PASS | PASS |
| SALT×SALT | SELF | N/A | N/A | N/A |
| SALT×DUST | MIX | PASS | PASS | PASS |
| SALT×SNOW | MIX | PASS | PASS | PASS |
| SALT×ASH | MIX | PASS | PASS | PASS |
| SALT×COAL | STRUCT | PASS | PASS | PASS |
| SALT×GUNPOWDER | MIX | PASS | PASS | PASS |
| SALT×SEED | MIX | PASS | PASS | PASS |
| SALT×WATER | REACTION | FAIL | PASS | PASS |
| SALT×OIL | MIX | PASS | PASS | PASS |
| SALT×LAVA | PHASE | PASS | PASS | PASS |
| SALT×ACID | MIX | PASS | PASS | PASS |
| SALT×LN2 | PHASE | PASS | PASS | PASS |
| SALT×STEAM | FLOW | PASS | PASS | PASS |
| SALT×SMOKE | FLOW | PASS | PASS | PASS |
| SALT×FIRE | PHASE | PASS | PASS | PASS |
| SALT×GAS | FLOW | PASS | PASS | PASS |
| SALT×CLONE | REACTION | PASS | PASS | PASS |
| SALT×VIRUS | STRUCT | PASS | PASS | PASS |
| SALT×SPRING | STRUCT | PASS | PASS | PASS |
| SALT×TNT | STRUCT | PASS | PASS | PASS |
| DUST×DUST | SELF | N/A | N/A | N/A |
| DUST×SNOW | MIX | PASS | PASS | PASS |
| DUST×ASH | MIX | PASS | PASS | PASS |
| DUST×COAL | STRUCT | PASS | PASS | PASS |
| DUST×GUNPOWDER | MIX | PASS | PASS | PASS |
| DUST×SEED | MIX | PASS | PASS | PASS |
| DUST×WATER | MIX | PASS | PASS | PASS |
| DUST×OIL | MIX | PASS | PASS | PASS |
| DUST×LAVA | THERMAL | PASS | PASS | PASS |
| DUST×ACID | MIX | PASS | PASS | PASS |
| DUST×LN2 | THERMAL | PASS | PASS | PASS |
| DUST×STEAM | FLOW | PASS | PASS | PASS |
| DUST×SMOKE | FLOW | PASS | PASS | PASS |
| DUST×FIRE | REACTION | FAIL | FAIL | FAIL |
| DUST×GAS | FLOW | PASS | PASS | PASS |
| DUST×CLONE | REACTION | PASS | PASS | PASS |
| DUST×VIRUS | STRUCT | PASS | PASS | PASS |
| DUST×SPRING | STRUCT | PASS | PASS | PASS |
| DUST×TNT | STRUCT | PASS | PASS | PASS |
| SNOW×SNOW | SELF | N/A | N/A | N/A |
| SNOW×ASH | MIX | PASS | PASS | PASS |
| SNOW×COAL | STRUCT | PASS | PASS | PASS |
| SNOW×GUNPOWDER | MIX | PASS | PASS | PASS |
| SNOW×SEED | MIX | PASS | PASS | PASS |
| SNOW×WATER | MIX | PASS | PASS | PASS |
| SNOW×OIL | MIX | PASS | PASS | PASS |
| SNOW×LAVA | PHASE | PASS | PASS | PASS |
| SNOW×ACID | MIX | PASS | PASS | PASS |
| SNOW×LN2 | PHASE | PASS | PASS | PASS |
| SNOW×STEAM | FLOW | PASS | PASS | PASS |
| SNOW×SMOKE | FLOW | PASS | PASS | PASS |
| SNOW×FIRE | PHASE | PASS | PASS | PASS |
| SNOW×GAS | FLOW | PASS | PASS | PASS |
| SNOW×CLONE | REACTION | PASS | PASS | PASS |
| SNOW×VIRUS | STRUCT | PASS | PASS | PASS |
| SNOW×SPRING | STRUCT | PASS | PASS | PASS |
| SNOW×TNT | STRUCT | PASS | PASS | PASS |
| ASH×ASH | SELF | N/A | N/A | N/A |
| ASH×COAL | STRUCT | PASS | PASS | PASS |
| ASH×GUNPOWDER | MIX | PASS | PASS | PASS |
| ASH×SEED | MIX | PASS | PASS | PASS |
| ASH×WATER | MIX | PASS | PASS | PASS |
| ASH×OIL | MIX | PASS | PASS | PASS |
| ASH×LAVA | THERMAL | PASS | PASS | PASS |
| ASH×ACID | MIX | PASS | PASS | PASS |
| ASH×LN2 | THERMAL | PASS | PASS | PASS |
| ASH×STEAM | FLOW | PASS | PASS | PASS |
| ASH×SMOKE | FLOW | PASS | PASS | PASS |
| ASH×FIRE | THERMAL | PASS | PASS | PASS |
| ASH×GAS | FLOW | PASS | PASS | PASS |
| ASH×CLONE | REACTION | PASS | PASS | PASS |
| ASH×VIRUS | STRUCT | PASS | PASS | PASS |
| ASH×SPRING | STRUCT | PASS | PASS | PASS |
| ASH×TNT | STRUCT | PASS | PASS | PASS |
| COAL×COAL | SELF | N/A | N/A | N/A |
| COAL×GUNPOWDER | STRUCT | PASS | PASS | PASS |
| COAL×SEED | STRUCT | PASS | PASS | PASS |
| COAL×WATER | STRUCT | PASS | PASS | PASS |
| COAL×OIL | STRUCT | PASS | PASS | PASS |
| COAL×LAVA | THERMAL | PASS | PASS | PASS |
| COAL×ACID | STRUCT | PASS | PASS | PASS |
| COAL×LN2 | THERMAL | PASS | PASS | PASS |
| COAL×STEAM | STRUCT | PASS | PASS | PASS |
| COAL×SMOKE | STRUCT | PASS | PASS | PASS |
| COAL×FIRE | REACTION | FAIL | FAIL | FAIL |
| COAL×GAS | STRUCT | PASS | PASS | PASS |
| COAL×CLONE | NONE | N/A | N/A | N/A |
| COAL×VIRUS | NONE | N/A | N/A | N/A |
| COAL×SPRING | NONE | N/A | N/A | N/A |
| COAL×TNT | NONE | N/A | N/A | N/A |
| GUNPOWDER×GUNPOWDER | SELF | N/A | N/A | N/A |
| GUNPOWDER×SEED | MIX | PASS | PASS | PASS |
| GUNPOWDER×WATER | MIX | PASS | PASS | PASS |
| GUNPOWDER×OIL | MIX | PASS | PASS | PASS |
| GUNPOWDER×LAVA | THERMAL | PASS | PASS | PASS |
| GUNPOWDER×ACID | MIX | PASS | PASS | PASS |
| GUNPOWDER×LN2 | THERMAL | PASS | PASS | PASS |
| GUNPOWDER×STEAM | FLOW | PASS | PASS | PASS |
| GUNPOWDER×SMOKE | FLOW | PASS | PASS | PASS |
| GUNPOWDER×FIRE | REACTION | FAIL | PASS | PASS |
| GUNPOWDER×GAS | FLOW | PASS | PASS | PASS |
| GUNPOWDER×CLONE | REACTION | PASS | PASS | PASS |
| GUNPOWDER×VIRUS | STRUCT | PASS | PASS | PASS |
| GUNPOWDER×SPRING | STRUCT | PASS | PASS | PASS |
| GUNPOWDER×TNT | STRUCT | PASS | PASS | PASS |
| SEED×SEED | SELF | N/A | N/A | N/A |
| SEED×WATER | LIFE | FAIL | PASS | PASS |
| SEED×OIL | MIX | PASS | PASS | PASS |
| SEED×LAVA | THERMAL | PASS | PASS | PASS |
| SEED×ACID | MIX | PASS | PASS | PASS |
| SEED×LN2 | THERMAL | PASS | PASS | PASS |
| SEED×STEAM | FLOW | PASS | PASS | PASS |
| SEED×SMOKE | FLOW | PASS | PASS | PASS |
| SEED×FIRE | REACTION | FAIL | FAIL | FAIL |
| SEED×GAS | FLOW | PASS | PASS | PASS |
| SEED×CLONE | REACTION | PASS | PASS | PASS |
| SEED×VIRUS | REACTION | PASS | PASS | PASS |
| SEED×SPRING | STRUCT | PASS | PASS | PASS |
| SEED×TNT | STRUCT | PASS | PASS | PASS |
| WATER×WATER | SELF | N/A | N/A | N/A |
| WATER×OIL | MIX | PASS | PASS | PASS |
| WATER×LAVA | REACTION | PASS | PASS | PASS |
| WATER×ACID | MIX | PASS | PASS | PASS |
| WATER×LN2 | PHASE | PASS | PASS | PASS |
| WATER×STEAM | FLOW | PASS | PASS | PASS |
| WATER×SMOKE | FLOW | PASS | PASS | PASS |
| WATER×FIRE | REACTION | PASS | PASS | PASS |
| WATER×GAS | FLOW | PASS | PASS | PASS |
| WATER×CLONE | REACTION | PASS | PASS | PASS |
| WATER×VIRUS | STRUCT | PASS | PASS | PASS |
| WATER×SPRING | STRUCT | PASS | PASS | PASS |
| WATER×TNT | STRUCT | PASS | PASS | PASS |
| OIL×OIL | SELF | N/A | N/A | N/A |
| OIL×LAVA | THERMAL | PASS | PASS | PASS |
| OIL×ACID | MIX | PASS | PASS | PASS |
| OIL×LN2 | THERMAL | PASS | PASS | PASS |
| OIL×STEAM | FLOW | PASS | PASS | PASS |
| OIL×SMOKE | FLOW | PASS | PASS | PASS |
| OIL×FIRE | REACTION | FAIL | FAIL | FAIL |
| OIL×GAS | FLOW | PASS | PASS | PASS |
| OIL×CLONE | REACTION | PASS | PASS | PASS |
| OIL×VIRUS | STRUCT | PASS | PASS | PASS |
| OIL×SPRING | STRUCT | PASS | PASS | PASS |
| OIL×TNT | STRUCT | PASS | PASS | PASS |
| LAVA×LAVA | SELF | N/A | N/A | N/A |
| LAVA×ACID | THERMAL | PASS | PASS | PASS |
| LAVA×LN2 | THERMAL | PASS | PASS | PASS |
| LAVA×STEAM | THERMAL | PASS | PASS | PASS |
| LAVA×SMOKE | THERMAL | PASS | PASS | PASS |
| LAVA×FIRE | THERMAL | PASS | PASS | PASS |
| LAVA×GAS | THERMAL | PASS | PASS | PASS |
| LAVA×CLONE | REACTION | PASS | PASS | PASS |
| LAVA×VIRUS | THERMAL | PASS | PASS | PASS |
| LAVA×SPRING | THERMAL | PASS | PASS | PASS |
| LAVA×TNT | REACTION | FAIL | PASS | PASS |
| ACID×ACID | SELF | N/A | N/A | N/A |
| ACID×LN2 | THERMAL | PASS | PASS | PASS |
| ACID×STEAM | FLOW | PASS | PASS | PASS |
| ACID×SMOKE | FLOW | PASS | PASS | PASS |
| ACID×FIRE | THERMAL | PASS | PASS | PASS |
| ACID×GAS | FLOW | PASS | PASS | PASS |
| ACID×CLONE | REACTION | PASS | PASS | PASS |
| ACID×VIRUS | STRUCT | PASS | PASS | PASS |
| ACID×SPRING | STRUCT | PASS | PASS | PASS |
| ACID×TNT | STRUCT | PASS | PASS | PASS |
| LN2×LN2 | SELF | N/A | N/A | N/A |
| LN2×STEAM | THERMAL | PASS | PASS | PASS |
| LN2×SMOKE | THERMAL | PASS | PASS | PASS |
| LN2×FIRE | THERMAL | PASS | PASS | PASS |
| LN2×GAS | THERMAL | PASS | PASS | PASS |
| LN2×CLONE | REACTION | PASS | PASS | PASS |
| LN2×VIRUS | THERMAL | PASS | PASS | PASS |
| LN2×SPRING | THERMAL | PASS | PASS | PASS |
| LN2×TNT | THERMAL | PASS | PASS | PASS |
| STEAM×STEAM | SELF | N/A | N/A | N/A |
| STEAM×SMOKE | FLOW | PASS | PASS | PASS |
| STEAM×FIRE | THERMAL | PASS | PASS | PASS |
| STEAM×GAS | FLOW | PASS | PASS | PASS |
| STEAM×CLONE | REACTION | PASS | PASS | PASS |
| STEAM×VIRUS | STRUCT | PASS | PASS | PASS |
| STEAM×SPRING | STRUCT | PASS | PASS | PASS |
| STEAM×TNT | STRUCT | PASS | PASS | PASS |
| SMOKE×SMOKE | SELF | N/A | N/A | N/A |
| SMOKE×FIRE | THERMAL | PASS | PASS | PASS |
| SMOKE×GAS | FLOW | PASS | PASS | PASS |
| SMOKE×CLONE | REACTION | PASS | PASS | PASS |
| SMOKE×VIRUS | STRUCT | PASS | PASS | PASS |
| SMOKE×SPRING | STRUCT | PASS | PASS | PASS |
| SMOKE×TNT | STRUCT | PASS | PASS | PASS |
| FIRE×FIRE | SELF | N/A | N/A | N/A |
| FIRE×GAS | REACTION | PASS | PASS | PASS |
| FIRE×CLONE | REACTION | PASS | PASS | PASS |
| FIRE×VIRUS | REACTION | PASS | PASS | PASS |
| FIRE×SPRING | THERMAL | PASS | PASS | PASS |
| FIRE×TNT | REACTION | FAIL | PASS | PASS |
| GAS×GAS | SELF | N/A | N/A | N/A |
| GAS×CLONE | REACTION | PASS | PASS | PASS |
| GAS×VIRUS | STRUCT | PASS | PASS | PASS |
| GAS×SPRING | STRUCT | PASS | PASS | PASS |
| GAS×TNT | STRUCT | PASS | PASS | PASS |
| CLONE×CLONE | SELF | N/A | N/A | N/A |
| CLONE×VIRUS | NONE | N/A | N/A | N/A |
| CLONE×SPRING | NONE | N/A | N/A | N/A |
| CLONE×TNT | NONE | N/A | N/A | N/A |
| VIRUS×VIRUS | SELF | N/A | N/A | N/A |
| VIRUS×SPRING | NONE | N/A | N/A | N/A |
| VIRUS×TNT | NONE | N/A | N/A | N/A |
| SPRING×SPRING | SELF | N/A | N/A | N/A |
| SPRING×TNT | NONE | N/A | N/A | N/A |
| TNT×TNT | REACTION | PASS | PASS | PASS |

---


---

*本报告由 游戏质量保障与测试工程师 严守真（Yan Soujin）产出，数据来自 `tests/pairwise-run.js` 在**当前代码**上的真实全量运行，可逐条复现。质量门为**建议性**——判定由 QA 给出，最终放行由用户决定。*
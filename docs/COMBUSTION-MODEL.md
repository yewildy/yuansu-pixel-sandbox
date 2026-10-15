# Yuansu Pixel Sandbox — Combustion & Flame Propagation Model（燃烧与火焰蔓延模型）

> 项目：元素像素游戏 / Yuansu Pixel Sandbox
> 文档类型：Combustion Spec（燃烧唯一真源 · 修订 `docs/PHYSICS.md §9.1/§9.2/§9.3/§9.6`）
> 版本：**v1.1**（已对齐合并后的 `PHYSICS.md §9` 与 `reactions.js` 现状）· 负责人：文策渊（Vince Coyer，策划与系统设计）
> 关联真源：`docs/PHYSICS-AIR.md`（空气/氧接口）、`docs/PHYSICS.md §9`（被本文修订）、`docs/ART.md`（配色）
> 触发：N1 缺陷 —— 「火焰不沿固体燃料蔓延」（任务 #22，T6.2 实测 Major）
> 语言：标题英文，正文中文。所有数值可直接编码。

---

## 0. N1 缺陷复述与根因确认

**实测**：火×木 64→61（仅烧 3 格）、火×煤 64→63（1 格）、木堆 32→28（4 格）。规格要求"木被点燃、持续燃烧、火势沿木蔓延"，当前实现不满足。

**根因（源码已核对，三者叠加）**：

| # | 根因 | 代码位置 |
|---|---|---|
| R-1 | `FIRE.LIFE_BASE = 40` 写死、与燃料无关 | `agePass`（`engine.js`）对 FIRE 统一用 `LIFE_BASE±jitter` |
| R-2 | §9.1 氧源要求 **4 邻接 AIR**，而固体燃料内部无空气 → 内部永不点燃 | `reactions.js hasOxygen()`（4 邻域） |
| R-3 | **时序死锁**：AIR 通道只在火格消亡（`FIRE→AIR`）后才出现，而那一刻火已不在；且 **FIRE 是气体会上升飘走**，不再与下一层燃料相邻 → 无火源点燃新暴露层 | `ignite()` + `agePass` + `movement.js`（FIRE 上浮） |

> **已合并的现状（v1.1 基线）**：`reactions.js ignite()` 已改为 `element=FIRE` + **`latent[j] = 原始燃料 id`**（供 `agePass` 判残灰）＋ 调用一次性 `consumeOxygen()`。本规格**基于此现状扩展**，不推翻它。**新增的核心修复 = "锚定（anchored）" + "通气前沿" + "按燃料寿命"。**

---

## 1. 模型总览（一句话）

> **燃料被点燃后变为 `FIRE`，但该火焰是"锚定"的——原地不动、不飘走（`latent` 非 0 即锚定）；它烧多久由燃料种类决定；火焰只能向"通气（半径 2 内有 AIR）"的燃料格推进，而烧尽后的残余会开出 AIR 通道，让前沿一层层向内吃。**

**"锚定"是解决 R-3 的关键**：燃料变成的火焰**留在原位**，因此当它烧尽、转为 AIR 通道时，它**仍然是下一层燃料的相邻火源**——死锁被打开。

同时满足两个此前冲突的约束：

| 约束 | 本模型如何满足 |
|---|---|
| **A. 火要能沿固体燃料蔓延**（N1） | 锚定火焰 = 稳定不动的热源；前沿按 `P_SPREAD` 逐格推进；残余开 AIR 通道 → 前沿持续深入 |
| **B. 密封盒必须缺氧自熄**（§9.6） | 点燃需通气 + 燃烧**持续耗氧**（净氧为负）→ 封闭系统 AIR 单调下降 → 必然自熄（§4） |

---

## 2. 数据表示（对齐已合并实现，零新增内存）

| 字段 | 语义 | 现有/新增 |
|---|---|---|
| `element` | 燃料点燃后 = **`FIRE`** | 现有（`ignite()` 已如此） |
| `latent` | **原始燃料 id（1–30）**；在 FIRE 上 `latent>0` 表示"来自燃料、**需锚定**、按燃料寿命/残灰处理" | **现有**（`ignite()` 已写入，本规格扩展其语义） |
| `age` | FIRE 寿命计数（0→阈值）。阈值 = `latent>0 ? burnTicks(latent) : LIFE_BASE±jitter` | 现有一致，仅改"阈值来源" |
| `temp` | 燃烧温度（`burnTemp(latent)`） | 现有 |

**判定速记**：
- `isFuelFire(i) = (element[i]===FIRE && latent[i]>0)` —— 来自燃料的锚定火焰。
- `isGasFire(i) = (element[i]===FIRE && latent[i]===0)` —— 瓦斯/爆炸产生的**自由火焰**（会飘、用 `LIFE_BASE`）。

> **零新增内存**：全部复用既有 `element/latent/age/temp`，不改 SoA 布局（对齐 `DESIGN.md §9.2` 零 GC）。

---

## 3. 点火规则（修订 §9.1 条件 3）

### 3.1 通气判据（唯一氧源 = AIR）

$$
\texttt{oxygen}(i)=\exists j:\ |x_j-x_i|\le \texttt{OXY\_RADIUS}\ \wedge\ |y_j-y_i|\le \texttt{OXY\_RADIUS}\ \wedge\ \texttt{element}[j]=\text{AIR}
$$

- `OXY_RADIUS = 2`（切比雪夫，5×5 邻域）。
- **仅 `AIR`(1) 算氧**；`GAS`/`STEAM`/`SMOKE` **均不算**（改自旧 §9.1 的"EMPTY/GAS/STEAM"）。

### 3.2 点火三要素（修订版）

| # | 条件 | 判据 |
|---|---|---|
| ① | **可燃** | `flammability(f) > 0` |
| ② | **有火源** | 4 邻域存在 `FIRE`（任意）或 `LAVA` |
| ③ | **通气** | `oxygen(f) == true` |

$$p_{ign} = \texttt{FuelSpreadP}[f]\times b_{dir},\qquad b_{dir}=\{上1.5,\ 平1.0,\ 下0.6\}$$

- **特例（自燃阈值）**：若 $T \ge \texttt{ignitionTemp}(f)$，则 $p_{ign}=1.0$ —— **但仍需条件 ③ 通气**（无氧即使高温也不燃，保证密封安全）。
- 点燃即调 `ignite()`：`element=FIRE`、`latent=f`、`age=0`、`temp=burnTemp(f)`、并触发 §9.6 耗氧。

> **相对已合并 §9.1 的差异**：条件 ③ 由"4 邻接 `AIR/GAS/STEAM`" → **"半径 2 内有 `AIR`（仅 AIR）"**。这是 R-2 的修复点。

---

## 4. 密封判据与自熄证明（engineering-lead Q3）

### 4.1 通气是点燃与维持的双重要求

| 环节 | 要求 | 不满足时 |
|---|---|---|
| **点燃** | `oxygen(f) == true` | 不点火 |
| **维持** | 每 tick 检查 `oxygen(self)` | **smother**：`age` 加速推进（`age += SMOTHER_EXTRA`），火焰更快烧尽/熄灭 |

**实现（零新增字段）**：不通气的锚定火焰，`agePass` 里 `age += (1 + SMOTHER_EXTRA)`；`SMOTHER_EXTRA=3` ⇒ 不通气时寿命缩短为标称的 **1/4**（木 180→45 tick、煤 420→105 tick）。

### 4.2 密封盒硬条件（可写入回归测试）

> **硬条件 H-SEAL**：若封闭区 $R$ 内 `count(element==AIR)==0`，则 $\forall i\in R,\ \texttt{oxygen}(i)=\text{false}$ ⇒ **$R$ 内任意燃料格既不可点燃、也无法正常维持燃烧** ⇒ $R$ 内火焰必在标称寿命 1/4 内全部烧尽（`→SMOKE/AIR`）。

> **H-SEAL'（可自动化）**：封闭盒内点火后，**当盒内 `AIR` 计数降到 0 时，≤ `SLOW`（见下）内盒内 `FIRE` 格数归 0 且**不再新增**（无新点燃）。

### 4.3 净氧账本（为什么封闭系统必然自熄）

每燃尽 1 格燃料：

$$
\Delta \text{AIR} = \underbrace{\texttt{CHANNEL\_P}(f)}_{\text{残余开通道}} \;-\; \underbrace{\left\lceil \texttt{burnTicks}(f)/\texttt{OXY\_CONSUME\_INTERVAL}\right\rceil}_{\text{燃烧期持续消耗}}
$$

| 燃料 | CHANNEL_P | burnTicks | 消耗（÷30） | **净 ΔAIR** |
|---|---|---|---|---|
| WOOD | 0.50 | 180 | 6 | **−5.5** |
| COAL | 0.20 | 420 | 14 | **−13.8** |
| OIL | 1.00 | 90 | 3 | **−2.0** |
| PLANT | 0.70 | 45 | 2 | **−1.3** |
| DUST | 0.80 | 60 | 2 | **−1.2** |
| SEED | 0.70 | 45 | 2 | **−1.3** |
| VIRUS | 0.80 | 60 | 2 | **−1.2** |

> **所有燃料净 ΔAIR < 0** ⇒ 封闭系统中 AIR 单调下降 ⇒ 燃烧必然终止。**这就是"密封盒完全不自持燃烧"的可证明保证**（取代早期"点燃一次性消耗"草案——后者净氧≈0，可能缓慢烧穿）。

> ⚠️ **注意**：这要求把已合并的 §9.6 **从"点燃一次性消耗"改为"燃烧期持续消耗"**（每 30 tick 1 格）。这是本规格对已合并文档的**唯一实质性行为变更**，其余为参数化。

---

## 5. 表面通道语义（engineering-lead Q2）

### 5.1 残余物规则（开通道 or 留灰）

火焰烧尽时按 `CHANNEL_P(f)` 决定该格变为 AIR（开通道）还是 ASH（残渣）：

$$
\text{element}(i)\leftarrow \begin{cases}\text{AIR} & r<\texttt{CHANNEL\_P}(f)\\ \text{ASH} & \text{否则}\end{cases}
$$

> 已合并的 `agePass` 已用 `latent` 判残灰，本规格只**替换其概率表**（见 §6.1）。

### 5.2 关键回答："是否允许火焰在燃料体内部推进而不需要逐格空气？"

> **不允许。** 前沿推进**始终要求目标格半径 2 内有 AIR**（§3.1）。
> 火之所以能深入燃料体，**不是因为免除了空气，而是因为烧尽后的残余把 AIR 通道一层层挖开**——"逐格空气"是被**燃烧自己创造**的，而非被忽略。

**推进时序（开放空气中 5 层厚木块，`P_SPREAD=0.05`）**：

| tick | 事件 | 通气来源 |
|---|---|---|
| 0 | 层1 点燃（外部火源） | 上方大气 AIR |
| 20 | 层2 点燃 | 大气 AIR 在半径 2 内 |
| — | 层3 **等待**（大气 AIR 距它 3 格） | — |
| 180 | 层1 烧尽 → 50% 变 AIR | **开通道** |
| 180 | 层3 变通气 → 点燃（火源=仍在烧的层2） | 层1 残余 AIR |
| 200 | 层2 烧尽 → 开通道 | — |
| 200 | 层4 点燃 | 层2 残余 AIR |
| … | 前沿以"≈2 层 / 180 tick"的节奏向内吃 | 自造通道 |

> **结论**：`OXY_RADIUS=2` 保证前沿只在有空气处燃烧（密封安全）；`CHANNEL_P` 保证前沿持续获得新空气（可蔓延）。

---

## 6. 燃料参数表（engineering-lead Q1）

### 6.1 逐燃料表（`balance.js`：新增 `FUEL` 分组）

```js
var FUEL = {   // id → 参数
  WOOD:  { burnTicks: 180, burnTemp: 600, channelP: 0.50, spreadP: 0.05 },
  COAL:  { burnTicks: 420, burnTemp: 800, channelP: 0.20, spreadP: 0.03 },
  OIL:   { burnTicks:  90, burnTemp: 700, channelP: 1.00, spreadP: 0.20 },
  PLANT: { burnTicks:  45, burnTemp: 300, channelP: 0.70, spreadP: 0.15 },
  DUST:  { burnTicks:  60, burnTemp: 350, channelP: 0.80, spreadP: 0.05 },
  SEED:  { burnTicks:  45, burnTemp: 250, channelP: 0.70, spreadP: 0.10 },
  VIRUS: { burnTicks:  60, burnTemp: 300, channelP: 0.80, spreadP: 0.05 }
};
```

| 燃料 | id | **burnTicks** | 秒 | burnTemp | 残余 AIR/ASH | P_SPREAD | 点火延迟 | **蔓延速度** |
|---|---|---|---|---|---|---|---|---|
| WOOD | 7 | **180** | 3.00 | 600 | 0.50 / 0.50 | 0.05 | 20 tick | 3.0 格/s |
| COAL | 15 | **420** | 7.00 | 800 | 0.20 / 0.80 | 0.03 | 33 tick | 1.8 格/s |
| OIL | 19 | **90** | 1.50 | 700 | 1.00 / 0.00 | 0.20 | 5 tick | 12.0 格/s |
| PLANT | 8 | **45** | 0.75 | 300 | 0.70 / 0.30 | 0.15 | 7 tick | 9.0 格/s |
| DUST | 12 | **60** | 1.00 | 350 | 0.80 / 0.20 | 0.05 | 20 tick | 3.0 格/s |
| SEED | 17 | **45** | 0.75 | 250 | 0.70 / 0.30 | 0.10 | 10 tick | 6.0 格/s |
| VIRUS | 28 | **60** | 1.00 | 300 | 0.80 / 0.20 | 0.05 | 20 tick | 3.0 格/s |
| GUNPOWDER | 16 | *§9.4* | — | 900 | SMOKE/AIR 0.5 | 0.8 链 | — | 快 |
| GAS | 26 | *§9.4* | — | 540 | AIR 1.0 | 0.4 链 | — | 快 |
| TNT | 30 | *§9.5* | — | — | 爆炸 | — | — | — |

**"燃料量"概念**：**不引入**。**1 格燃料 = 固定热值（按种类）**，燃烧时长只由 `burnTicks(种类)` 决定；不做"余量/热值累积"字段（避免新增状态，守恒 1 格 1 质）。

> **测试提示**：木块"完全烧尽"≈ `层数×20 tick`(点燃) `+ 180`(燃尽) `+ 前沿深入延迟`。8 层厚木块约需 **≤ 600 tick**。若回归用例时长 < 300 tick，请下调 `burnTicks` 或延长用例——`burnTicks` 是唯一调参旋钮。

### 6.2 全局燃烧参数（`balance.js FIRE.*`）

| 键名 | 默认 | 范围 | 单位 | 说明 |
|---|---|---|---|---|
| `FIRE.OXY_RADIUS` | **2** | 1–4 | 格 | 通气判据切比雪夫半径（仅 AIR 算氧） |
| `FIRE.OXY_CONSUME_INTERVAL` | **30** | 5–120 | tick | 燃烧期每 N tick 消耗 1 格邻接 AIR→SMOKE |
| `FIRE.SMOTHER_EXTRA` | **3** | 0–10 | ×/tick | 不通气时 `age` 额外增速（寿命缩至 1/(1+此值)） |
| `FIRE.ANCHOR_FUEL_FIRE` | **true** | bool | — | `latent>0` 的 FIRE 是否锚定（不上升/不受风） |
| `FIRE.SPREAD_UP_BIAS` | 1.5 | 1–3 | × | 向上蔓延加成（沿用） |
| `FIRE.SPREAD_DOWN_BIAS` | 0.6 | 0.1–1 | × | 向下蔓延衰减（沿用） |
| `FIRE.LIFE_BASE` | 40 | 10–120 | tick | **仅用于 `latent==0` 的自由火焰**（瓦斯/爆炸） |
| `FIRE.LIFE_JITTER` | 10 | 0–30 | tick | 同上 |
| `FIRE.MAX_BURN_CELLS` | **8000** | 1000–20000 | 格 | 同时 `FIRE` 格数上限（性能护栏） |
| `AIR.OXY_CONSUME_P` | 0.5 | 0–1 | — | **仅在"一次性耗氧"兼容模式下使用**；连续模式改为每 `OXY_CONSUME_INTERVAL` 必消耗 |

---

## 7. 每 tick 燃烧流程（伪代码，插入现有 pass）

**锚定**（`movement.js`）：gas 分支首行加：
```js
if (e === ID.FIRE && grid.latent[i] > 0) return;   // 燃料火焰锚定：不上升、不受风
```
（同时 `windPass` 的轻质粉末分支不涉及 FIRE，无需改。）

**寿命与残灰**（`engine.js agePass`）：
```js
if (e === ID.FIRE) {
  var src = grid.latent[i];                       // 原始燃料 id（0=自由火焰）
  var life = src > 0 ? FUEL[src].burnTicks
                     : (FIRE.LIFE_BASE + round((hash01-0.5)*2*FIRE.LIFE_JITTER));
  // 通气加速/减速：不通气 → age 快进（smother）
  if (src > 0 && !oxygen(grid, i, FIRE.OXY_RADIUS)) age[i] += FIRE.SMOTHER_EXTRA;
  if (age[i] >= life) {
    if (src > 0) el[i] = (hash01 < FUEL[src].channelP) ? AIR : ASH;   // §9.3 残灰
    else         el[i] = (hash01 < FIRE.SMOKE_P) ? SMOKE : AIR;       // 自由火焰
    age[i]=0; latent[i]=0;
  }
}
```

**点火 + 持续耗氧**（`reactions.js`）：
```js
// 条件 3：氧源判定改为 Chebyshev-2 仅 AIR
function hasOxygen(grid, i) { /* 5×5 内找 element==AIR */ }

// ignite()：保持现有（element=FIRE; latent=e; consumeOxygen 首帧）
// 新增：持续耗氧 —— 在 agePass 或 reactions 内对每个 latent>0 的 FIRE：
if (latent[i] > 0 && (tick % FIRE.OXY_CONSUME_INTERVAL) === 0) consumeOxygen(grid, i, tick);
```

**蔓延**（`reactions.js`，FIRE 处理段）：
```js
for each neighbor n of a FIRE cell i:
  if flammability(el[n]) > 0 and reactStamp[n] !== tick and hasOxygen(grid, n):
     p = FuelSpreadP[el[n]] * dirBias(...)      // 或 el[n].flammability（见下）
     if hash01 < p: ignite(grid, n, tick)
```

> **`spreadP` 与 `flammability` 的关系**：为最小改动，可直接复用既有 `element.flammability` 作为 `spreadP`（§8 表里两者量级相近：木 0.05~0.08、油 0.20、植物 0.15），**建议**改成读 `FUEL[id].spreadP` 以精细控制（本文默认值已给出）。

---

## 8. 模块改动清单（engineering-lead 实现路径）

| 模块 | 改动 | 规模 |
|---|---|---|
| `movement.js` | gas 分支加"锚定 FIRE 跳过移动"（**1 行**） | 极小 |
| `engine.js agePass` | FIRE 寿命阈值改为 `FUEL[latent].burnTicks`；残灰改 `CHANNEL_P`；不通气 `age += SMOTHER_EXTRA` | 小 |
| `reactions.js` | `hasOxygen()` → Chebyshev-2 仅 AIR；`consumeOxygen` 由"一次性"改"每 30 tick 持续"；蔓延用 `spreadP` | 小 |
| `balance.js` | 新增 `FUEL` 分组 + `FIRE.OXY_RADIUS/OXY_CONSUME_INTERVAL/SMOTHER_EXTRA/ANCHOR_FUEL_FIRE/MAX_BURN_CELLS` | 极小 |
| `renderer.js` | **无必需改动**（燃烧格已是 FIRE，自动显示火焰色） | 无 |
| `grid.js` | **无改动** | 无 |

**合计**：约 1 个 Story（与 engineering-lead 估计一致）。

---

## 9. 替代方案评估（为何选本模型）

| 方案 | 蔓延 | 密封自熄 | 成本 | 结论 |
|---|---|---|---|---|
| (a) 邻接 FIRE 即可点燃（无氧判据） | ✅ | ❌ 密封盒烧穿 | 低 | ❌（已否决） |
| (b) 氧源扩到 8 邻域 | ⚠️只多渗一层 | ✅ | 低 | ❌（非完整修复） |
| **(c) 锚定火焰 + 通气前沿（本文）** | ✅ | ✅（净氧为负） | 中（+锚定 1 行 + agePass） | ✅ **采用** |
| (d) 燃料"保持元素"原地烧（不改 element） | ✅ | ✅ | 中（需改渲染判据） | ⚪ 备选：视觉更"木在原地"，但改动比 (c) 大 |
| (e) 气压场驱动火焰前沿 | ✅ | ✅ | 极高 | ❌（超预算，Backlog） |

**为何选 (c) 而非 (d)**：已合并实现已经是"燃料→FIRE + `latent=燃料id`"，(c) 只需**给 FIRE 加一个"锚定"判据**即可复用全部既有残灰/寿命机制；而 (d) 要改元素的移动/渲染判据，改动面更大。两者物理等价，选改动小的。

---

## 10. 验收测试（交 quality-lead）

| ID | 场景 | 断言 |
|---|---|---|
| **N1-1** | 单火源 + 8×8 木块（开放空气） | **≥ 80% 木格在 ≤ 600 tick 内消失或变 ASH** |
| **N1-2** | 8×8 煤块 | 燃尽率 ≥ 60%，≤ 1200 tick |
| **N1-3** | 32 格木堆，单一火种 | 燃尽数 ≥ 24（对照旧值 4） |
| **N1-4（密封）** | `WALL` 盒塞满木 + 少量 AIR，内部点火 | 盒内 AIR 归 0 后 **≤ 105 tick** 内 `FIRE` 格数归 0（H-SEAL'） |
| **N1-5（密封反例）** | 同上但开一小孔 | **可持续燃烧**（证明不是"一律不烧"） |
| **N1-6（方向）** | 竖直木柱底部点火 | 向上蔓延**快于**向下（1.5 vs 0.6） |
| **N1-7（锚定）** | 燃料火焰 | `movement` 后位置**不变**（坐标恒定直到烧尽） |
| **N1-8（不透气内部）** | 3 层厚木块中心格 | 通道打开前**不点燃**（`oxygen==false`） |
| **N1-9（性能）** | 同时 5000 格燃烧 | 单 tick 增量 ≤ 1.5 ms |
| **N1-10（确定性）** | 同种子两次 | 燃尽后 `engine.hash()` 一致 |

---

## 11. 文档改动授权（engineering-lead Q4）

> **授权**：允许按本文修订 `docs/PHYSICS.md`。以下为**替换文本**（注意 §9.6 有行为变更）。

### 11.1 §9.1 条件 3 替换

> 3. **有氧 / 通气**：满足 `oxygen(F)=true`，即 **Chebyshev 半径 2 内存在 `AIR`（仅 `AIR` 算氧）**。`GAS/STEAM/SMOKE` 不算氧。

### 11.2 §9.2 替换（点燃概率与火焰寿命）

> $$p_{ign}=\texttt{FuelSpreadP}[F]\times b_{dir},\quad b_{dir}=\{上1.5/平1.0/下0.6\}$$
> - **固/粉/液燃料**点燃后 `element=FIRE`、`latent=燃料id`、`age=0`；**该火焰被"锚定"**（不上升、不受风，`movement` 跳过），寿命 = `FUEL[latent].burnTicks`（见 `COMBUSTION-MODEL.md §6`），**不使用 `LIFE_BASE`**。
> - **自由火焰**（`latent==0`，来自瓦斯/火药/爆炸）：寿命 = `FIRE.LIFE_BASE ± jitter`，会上升、受风。
> - 燃尽后：锚定火焰按 `CHANNEL_P` 判 AIR/ASH；自由火焰按 `SMOKE_P` 判 SMOKE/AIR。

### 11.3 §9.3 替换（燃料残余 · 替换概率表）

> | 燃料 / 自由火焰 | 开通道 `AIR` | 残渣 `ASH`／`SMOKE` |
> |---|---|---|
> | WOOD | 0.50 | 0.50 (ASH) |
> | COAL | 0.20 | 0.80 (ASH) |
> | OIL | 1.00 | 0.00 |
> | PLANT | 0.70 | 0.30 (ASH) |
> | DUST | 0.80 | 0.20 (ASH) |
> | SEED | 0.70 | 0.30 (ASH) |
> | VIRUS | 0.80 | 0.20 (ASH) |
> | GUNPOWDER | 0.50 | 0.50 (SMOKE) |
> | 自由火焰（`latent==0`） | 0.50 | 0.50 (SMOKE) |
>
> （注：相对旧表下调 ASH 比例——**保证 AIR 通道**，使火焰前沿可深入，N1 修复的必要条件。）

### 11.4 §9.6 替换（耗氧 · **行为变更**）

> **9.6 耗氧与维持**
> - **点火需通气**（§9.1 条件 3）。
> - **持续耗氧**：每个"锚定火焰"每 `OXY_CONSUME_INTERVAL=30` tick，用确定性哈希选 1 个邻接 `AIR` → `SMOKE`（尾气 100 °C）。
> - **不通气加速熄灭**：锚定火焰不通气时 `age` 每 tick 额外 +`SMOTHER_EXTRA=3`（寿命缩至 1/4）。
> - **封闭硬条件**：封闭区内 `AIR` 计数 = 0 ⇒ 无火可点燃/维持 ⇒ 必然自熄。净氧账本见 `COMBUSTION-MODEL.md §4.3`（**所有燃料净 ΔAIR<0**）。
> - **守恒**：`AIR→SMOKE` 仍是"物质格数 +1"的唯一合法路径（§13.1）。

---

## 13. 火焰温度钳制 + 接触传热（v1.4.0，A1/A2）

> 背景（用户实测）：**铁锅 + 柴火烧水 600 tick，水温卡在 34.7 °C 不再上升**。
> V4（岩浆锅）能过是因为 1200 °C 岩浆热容大且持续，掩盖了火焰的问题。

### 13.1 根因：火焰温度不被钳制，"热源会死"

`volHeat[FIRE] = 1.0e6` 的"等效放热热容" hack（§8）只对**空气**有效 —— 空气体积热容
≈1.2e3，火焰不会被拉低。但火焰一接触**金属 / 水**等大热容物体，就被体积热容加权导热
拉到两者平衡温度（火–金属平衡 ≈149 °C、火–水 ≈140 °C）且**永不恢复**：锅底摸不到火候，
整锅水停在 34.7 °C。

### 13.2 修法 A1：燃烧温度重锚（`thermal.js::relax`）

锚定火焰（`e === FIRE && latent > 0`，§6.1 燃料驱动模型）在 `relax()` 每格循环末尾：
**且该火焰格仍通气**（`Reactions.hasOxygen`，Chebyshev-2 可达 AIR 且不穿墙）时，
直接把 `nextTemp` 置为 `Reactions.fuelOf(latent).burnTemp`（WOOD 600 / COAL 800 /
OIL 700 / PLANT 300 …）。EMBER 永燃火种（v1.4.0 新增，id 31）无条件钳制到
`Balance.EMBER.TEMP = 900`。自由火焰（`latent==0`，瓦斯/爆炸/手绘）不钳制。

- **物理依据**：真实燃烧中火焰温度由燃料化学放热钳定 —— 任务书原文"只要还有燃料**和氧气**"。
  无氧即无燃烧放热，火焰自然冷却，这与 §9.6 的缺氧逻辑一致。
- **红线保持**（温度钳制不创造氧气）：N1-4 密封自熄、N1-8 厚木中心无氧不点燃、
  N1-probe-sealed 全部仍过。关键正在于**氧气条件**：若无条件钳制，火焰会把邻接燃料
  烤到燃点、经 §9.2 热解引燃（豁免氧气门槛）烧穿密封盒（实测残木 0%）。
- 副作用（有益）：T6.3 点燃脆弱性已知项（PAIRWISE-REPORT §4.16，默认种子 1337 点不着）
  因此缓解 —— 锚定火焰恒保持 600 °C，邻接燃料稳定达到热解温度，当前 8/8 种子可点燃。

### 13.3 修法 A2：接触传热（`thermal.js::contactFlux`，v1.4.0 新增）

`diffuse` 之后、`relax` 之前由 `engine.step` 调用。两类热源 → 4 邻域**非气体**格，
只加热不冷却（源温 ≤ 目标温时跳过）：

| 热源 | 系数 | 物理含义 |
|---|---|---|
| FIRE 格（任意火） | `FIRE.CONTACT_K = 0.06` | 火舌舔舐固体/液体的直接加热（火焰接触/辐射的离散近似） |
| 气体格（`state==='gas'`，含 AIR）且 `T ≥ PHYS.GAS_FLUX_MIN_T = 100` | `PHYS.GAS_CONTACT_K = 0.05` | 热气体对流传热 —— CA 中 1 格气体是"对流团"的代理，持续被火焰/热源补给；**这是火隔着气层把热量压进锅底的关键通道** |

**可燃物豁免**：目标格若为可燃物（`flammability>0` 且非气态，判据同
`movement.js::adjFlammableSolid`）则跳过 —— 燃料点火由燃烧模型负责（§9.1 通气判据 +
§9.2 热解引燃）；接触传热若直接把燃料烤到燃点，"无氧也引燃"会绕过 N1-4 / N1-8 红线
（实测残木 0%、中心格无氧点燃 4 次，均为不豁免时的回归）。

**⚠ 不守恒声明**：本 pass **不参与 Σ C·T 账目** —— 这是 modeling 近似而非能量记账。
热量来自两处化学/几何 reservoir：① 火焰的燃烧放热（13.2 的重锚本身就为火焰注入了
"用之不竭"的化学能）；② 被火焰/热源持续补给的"对流团"代理气体。若要求本 pass守恒，
则必须给每个热源配一份有限的能量账本，与燃料驱动模型（1 格燃料 = 固定热值，§14 N1-A2）
冲突。公式天然保证**传热永不超过热源温度**（ΔT = K·(T_src−T_dst) ≤ T_src−T_dst，
且源冷时跳过）与**单 tick 传热有界**（K<1 ⇒ 不可能越过热源温度）；测试 V12b 逐条断言。

### 13.4 实测（种子 1337）

| 场景 | v1.3.0 | v1.4.0 |
|---|---|---|
| `_diag_water.js` 场景 4（铁锅+柴火，火距锅底 3 格气层） | 34.7 °C（卡死） | **116.2 °C** |
| V12（铁锅+柴火，火种贴锅底，600 tick） | —（新测试） | **153.9 °C** |
| N1-4 密封盒残木 / N1-8 无氧点燃违规 | ≥90% / 0 | ≥90% / **0**（保持） |
| V4 岩浆锅（回归） | 过 | **过**（锅底均温 ≥60，上下温差 ≤30） |

`GAS_CONTACT_K` 由任务书原稿 0.02 上调至 **0.05**：实测 0.02 下场景 4 只有 74.3 °C
（<90 验收线）—— 该布局下热气体对流是唯一传热通道，0.02 太弱；0.05 时间常数约 20 tick，
与"对流团持续拍打表面"的离散近似相符。

---

## 14. 未决 / 近似项

| # | 项 | 类型 | 理由 |
|---|---|---|---|
| N1-A1 | 不通气只是"加速烧尽"，不是"复原为燃料" | **近似** | 已合并实现为 `FIRE`；复原燃料会与"元素已变"冲突。加速熄灭在实践中等价于"缺氧自熄" |
| N1-A2 | 1 格燃料 = 固定热值，无"燃料量" | **设计决策** | 避免新增字段；守恒 1 格 1 质 |
| N1-A3 | 通气用半径 2 近似真实氧扩散 | **近似** | 格级无法解扩散方程 |
| N1-A4 | 锚定火焰不上升（视觉上火焰"贴着燃料"） | 设计决策 | 换取向内蔓延的可靠性；自由火焰仍会飘（瓦斯/爆炸） |
| N1-A5 | 可省 `FUEL.spreadP`，直接用 `element.flammability` | 备选 | 量级相近，但精细控制推荐 `FUEL.spreadP` |

---

*本文档由策划与系统设计 文策渊（Vince Coyer）产出，为燃烧/火焰蔓延唯一真源，修订 `docs/PHYSICS.md §9.1/§9.2/§9.3/§9.6`。空气/氧接口以 `docs/PHYSICS-AIR.md` 为准。*

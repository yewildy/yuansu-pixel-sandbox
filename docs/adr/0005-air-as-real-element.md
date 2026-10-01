# ADR-0005：把空气建模为真实元素（AIR）

- 状态：已采纳（Accepted）
- 日期：2026-10-11（v1.1.0）
- 决策人：程基岩（技术方向与主程序）
- 关联：`docs/PHYSICS-AIR.md`（空气唯一真源）· `docs/PLANT-MODEL.md` · `docs/PHYSICS.md` §4/§5/§6/§9/§13 · `docs/adr/0001`、`0003`、`0004`
- 取代：`PHYSICS.md` §4.1/§6.1 中「id 1 = EMPTY（占位符、导热跳过、强弛豫热库）」的旧近似

## 上下文（Context）

v1.0 把 id 1 当作「占位空位」：`EMPTY`，`special` 类别，density 0，`movable=false`，导热 $k=0.002$，
并在 `thermal.js` 里对「双 EMPTY 对」直接 `continue` 跳过、弛豫率 `ENV_RELAX_EMPTY = 0.10`（暴露 ×2 = 0.20/tick）。

用户实测暴露四个硬伤（已复现）：

| # | 现象 | 根因 |
|---|---|---|
| B1 | 1000 °C 石块旁第 1 格空气**恒为 20.0 °C**，石头热量凭空消失 | 双空气对导热被跳过 → 空气内部无法传热；且弛豫太强把到达的热抽干 |
| B2 | 一片 600 °C 空气 **30 tick 内被压回 21 °C** | `(1-0.2)^{30} ≈ 0.0012`，正是弛豫 0.20/tick 的精确后果 |
| B3 | 热空气不上升、无对流 | 空气 `movable=false` 且无任何"针对空气自身"的运动通道 |
| B4/B5 | 浮空植物疯长、种田灰尘雨 | 见 `PLANT-MODEL.md`（不属本 ADR） |

设计侧（文策渊）给出 `docs/PHYSICS-AIR.md`，拍板**三条**：① 空气按真实元素建模；② 植物严格生态；③ 配对实验全量 900 组。
本 ADR 只记录**技术决策**：如何在"真实建模"与"60 FPS 预算"之间落地。

## 决策 1：不新增元素，把 id 1 从 `EMPTY` 升级为 `AIR`

- 30 种元素、ID 映射、`ART.md` 配色**全部不变**（用户硬约束）。
- `AIR` 属性：`cat=gas`、`state=gas`、`group='none'`（**不进元素面板**）、`density=1.2`、`movable=false`、`mobility=0`、`c=1005`、`k=0.05`、`lifetime=-1`、`windFactor=0.5`。
- **命名兼容**：`ID.AIR = 1`，同时保留 `ID.EMPTY = 1` 别名；反应表 `decayTo:'EMPTY'` 解析后仍 = 1；存档 `version` **不升版**。
- **视觉零变化**：渲染继续 `if (e===1) continue`；橡皮擦/清屏 = 涂 AIR；世界初始化 = 全 AIR @ 20 °C。

**为什么 `density=1.2` 不改变任何既有位移**：`enterableDown/Up/Gas/Side` 四个判定**第一行**都对 `target===1` 短路放行，
故空气的 density 数值根本不进入位移比较。`movable=false` 又让通用 `stepCell` 对空气直接返回。
→ **空气的"能动性"完全由决策 2 的 `airPass` 提供，与通用移动通道解耦**。这是"真实建模 + 不拖垮性能"的关键。

## 决策 2：空气运动独立成 `airPass`，温度驱动置换（不做气压场）

新增 `src/core/air.js::airPass`，插在 `Engine.step` 的 `movePass` **之后**、`reactionPass` **之前**：

- **驱动判据**：$\Delta = T - T_{amb}$。仅 $|\Delta| > \texttt{AIR.BUOY\_DT}(40)$ 的空气参与运动；否则完全不动。
- **上浮/下沉**：与正上/正下的 AIR 以概率 $p = \mathrm{clamp}((|\Delta|-40)/250, 0, 0.6)$ 交换。
- **移动 = `grid.swap`**：同时交换 element 与 temp → 热空气上浮**顺带把热量带走**，无需任何额外热量搬运代码（这就是"对流换热"的全部实现）。
- **隔帧**（`PASS_INTERVAL=2`）→ 最大速度 0.3 格/tick（≈18 格/s）。
- **风平流**：只搬运"携带热量（$|\Delta|>1$°C）"的空气格，`WIND_FACTOR=0.5`；纯室温空气不搬运（画面等价、成本可控）。

**明确不做**（记为近似 P1/P2，`PHYSICS-AIR.md §7`）：独立气压场 / Navier–Stokes / 真空元素。
理由：真实气压场需每格 `pressure:Float32` + 每帧 Poisson 求解，代价与"900 组配对实验判定"的收益严重不匹配；
用户要的是"热上升、冷下沉、风作用于空气本体"这三个**可观察**结果，格级置换即可给出。

## 决策 3：导热改为「双轨配对系数」，弛豫降到 0.0005

- 配对系数（`thermal.js`）：

$$K_{ij} = \begin{cases} \texttt{AIR.SELF\_K} = 0.5, & \text{两格皆 AIR}\\ \dfrac{k_i + k_j}{2}, & \text{其余}\end{cases}$$

  这解决了"空气要能横向导热（B1）"与"岩浆不许被空气秒抽干（F01）"这对矛盾：固-气/液-气配对几乎不变
  （岩浆-空气 $K$ 仅从 0.151 → 0.175，+16%），只有空气-空气单独加强。
- **性能安全阀**：双空气对 $\lvert\Delta T\rvert < \texttt{AIR.CONDUCT\_EPS}(0.25)$ 时跳过 → 均匀空气零成本。
- **弛豫**：`AIR.RELAX = 0.0005`（原 0.10），且**空气不乘暴露加成**。
- **唯一热出口**：顶部 `SKY_ROWS=2` 行的 AIR 按 `SKY_RELAX=0.02` 散热（天空热沉）——弛豫压低后热量必须有出口，否则长期挂机无限累积。
- **稳定性**：$\alpha\cdot4\cdot K_{max} = 0.005\times4\times0.5 = 0.01 \ll 0.5$，显式差分绝不发散。

## 决策 4：燃烧耗氧落地为"消耗邻接 AIR → SMOKE"

`reactions.js::ignite()` 在点燃燃料时以 `AIR.OXY_CONSUME_P=0.5` 把 1 个 `AIR` 邻格转为 `SMOKE`（尾气，T=100）。
判据 `hasOxygen` 数值不变（仍判 `t===1||t===26||t===23`），语义由"存在空位"升级为"存在空气"。
顺带补齐 `§9.3` 燃料残余成 ASH（`ignite()` 把燃料 id 存入 `latent`，`agePass` 据此判灰）——主理人批准。

## 性能取舍（关键）

| 手段 | 作用 |
|---|---|
| D1 驱动判据 + **`pendingDrive` 全局标志** | `thermal.relax` 探测到 $|\Delta|>40$ 时置位；airPass 无驱动则 **O(1) 退出**。空画布 airPass 成本 ≈0 |
| D2 隔帧（`PASS_INTERVAL=2`） | 运动总成本 ÷2 |
| D3 空气-空气"近平衡跳过"（0.25 °C） | 均匀空气导热成本 ≈0 |
| D4 `MAX_MOVE_BUDGET=12000` | 极端满屏热时截断尖峰 |
| D5 复用 `moveStamp` | 零额外内存 |
| D6 `HALF_SPLIT_THRESHOLD=8000` 奇偶列分半 | 自适应降载 |

实测（Node/V8，320×180，best-of-7）：**空画布新增开销 0.178 ms/tick**（预算 ≤0.3）；95% 填充 ≈7.3–7.8 ms/tick（预算 ≤10）；
1/2 画布 600 °C 空气 ≈2.3 ms/tick（预算 ≤12）。

## 后果（Consequences）

**正面**
- B1/B2/B3 全部修复（A1–A6 验收通过：石块旁空气 60 tick 内 ≥40 °C、600 °C 空气团 30 tick 后仍 ≥450 °C、热空气整体上移）。
- 视觉零变化、元素数不变、存档兼容、旧标定（F01 岩浆 2.2 s 凝固 / F15 冰 2.25 s 融化 / 水 20 °C 不蒸发）全部保留。
- 与通用移动解耦，性能可预测。

**负面 / 代价**
- 温度场多了一份"空气导热"开销（≈0.18 ms/tick 空场，见上）。
- 新增 `latent` 被 `FIRE` 复用为"原始燃料 id"（此前 FIRE 的 latent 未被使用）；已在 ADR 与 `PHYSICS.md §9.3` 记录。
- 空气的运动是"温度驱动置换"近似，**不做气压场**——不会出现"抽真空→内爆""活塞"等现象（记为近似）。

**跟进 / 知识缺口**
- 真机浏览器性能需复测（Node 无法覆盖 canvas/ImageData）。
- `PASS_INTERVAL`、`SKY_RELAX`、`SELF_K` 的体感调参留给真机。
- 若未来要加气压场，`airPass` 已是天然扩展点（Backlog：`ROADMAP.md` v1.2）。

## 修订记录（v1.1.0 收尾）

> 空气既然已是**真实元素**，以下表述随之更新（同属「空气即元素」决策的直接推论）：

1. **LN2 汽化产物：`STEAM` → `AIR`（采纳本 ADR 决策 1 的推论）**。原 §7.8 把 LN2 汽化映射为 `STEAM`（并记为 Backlog「LN2 → AIR」）；但 `AIR` 成为真实元素后，氮气**回归大气**最自然，且**修复守恒漏洞**——旧路径 LN2→`STEAM`→`§7.2 冷凝`→`WATER` 会「凭空造水」（实测 WATER $0\to148$）。**该 Backlog 项现转为正式决策**。`transitions.js` LN2 分支写 `el[i]=ID.AIR`（保留原格低温）。备份/文档同步：`PHYSICS.md §7.8/§4.2/§7.9`、`elements.js` LN2 `boilTo`。
2. **`STEAM` 删除强制寿命 `lifetime=600`**：与 §7.2「$T\ge100$ 恒不冷凝」冲突（到期无条件转水）。蒸汽消亡改由 §7.2 冷凝 + 顶部逸出决定。
3. **`SAND.GLASS_T` 1700 → 1100**：配合「空气即元素」后仍存在的元素集热源上限（LAVA 1200）打通炼玻璃链（近似，见 `PHYSICS.md §7.7`）。注意沙浮于岩浆，须“被岩浆吞没”方能成玻璃。
4. **`SPRING`（水源泉）出水落地为 R19**（`reactions.js`）：与 `CLONE` 并列的第二处「质量创生例外」，图鉴标「∞」。

> 以上均**不改变** 30 元素数、ID 映射、配色与存档版本——本 ADR 的硬约束保持不变。

# Yuansu Pixel Sandbox — Strict-Ecology Plant Model（严格生态植物模型）

> 项目：元素像素游戏 / Yuansu Pixel Sandbox
> 文档类型：Plant & Life Specification（植物/生命唯一真源 · 替代 `docs/PHYSICS.md §10`）
> 版本：v1.0 · 负责人：文策渊（Vince Coyer，策划与系统设计）
> 关联真源：`docs/PHYSICS.md §10`（被本文替换）、`docs/PHYSICS-AIR.md`（空气/水/热接口）、`docs/ART.md`（配色）
> 语言：标题英文，正文中文（遵循项目 i18n 约定）
> 目标：**所有数值可直接编码**；凡近似处显式标注「近似」与理由。

---

## 0. 改造动机（两条已复现缺陷）

| # | 缺陷现象（主理人实测） | 根因（`biology.js`） | 本文修法 |
|---|---|---|---|
| B4 | **浮空单株植物 1800 tick 自己爬到 7 格高并继续上升** | 生长只判「正上方为空/水」+「半径 2 内有 WATER/SOIL」，**完全不检查是否连着地面**；`MAX_HEIGHT=40` 只是高度计数，浮空柱照样长到 40 | §3 根系连通性判定 + §5 供水高度封顶 |
| B5 | **正常种田植物长到地表上方 42 格，并产生 391 格灰尘（顶端反复枯死坠落）** | ① `MAX_HEIGHT=40` 是写死的常数而非物理量；② **每格植物独立按湿度枯萎、独立变 DUST**，顶端先枯→落尘→下方继续长→再枯，形成"灰尘雨" | §5 高度由供水能力封顶；§6 **整株一次性枯死**，杜绝逐格循环 |

**用户拍板的「严格生态」三要求**：
1. **必须落在土壤/地面上才能发芽**；
2. **生长必须有"根"连通地面（断根即枯）**；
3. **生长消耗附近水分**；枯死时**整株一起坠落**。

---

## 1. 术语与状态

| 术语 | 定义 |
|---|---|
| **株 / 群落（colony）** | 由 4 邻域相连的一整片 `PLANT` 格组成的连通块（含由同一颗种子长出的主干与侧枝） |
| **着地点（ground contact）** | 一个 `PLANT` 格，其**正下方**格为"地面"（见 §3.2）或该格位于**底行** $y=H-1$ |
| **根区（root zone）** | 群落中位于着地点上方 0–`ROOT_ZONE_H` 行内的 `PLANT` 格集合（吸水入口） |
| **柱高 $h$** | 某 `PLANT` 格沿竖直方向到其"着地点"的格数 |
| **露头（exposure）** | 正上方 2 格内存在 `AIR` 或 `WATER`（沿用"光"的近似） |

**字段复用**（沿用 `grid.js` 既有 SoA，**不新增数组**）：

| 字段 | SEED 语义 | PLANT 语义 | SOIL 语义（新增用途） |
|---|---|---|---|
| `age` | 发芽计时器（0–`GERM_TIMER_REQ`） | **枯萎计时器**（0–`WILT_TICKS`） | **含水量 moisture**（0–`MOISTURE_MAX`） |

---

## 2. 发芽（SEED → PLANT）

> 替换 `PHYSICS.md §10.1`。**四条件必须同时满足**，满足时累积，否则衰减。

### 2.1 四条件（量化）

| # | 条件 | 判据 | 阈值（键名） |
|---|---|---|---|
| ① | **着地**（新增，严格生态核心） | **正下方一格** `(x, y+1)` 为"地面"（§3.2），**或**该格位于底行 $y=H-1$ | `SEED.GROUND_REQUIRED = true` |
| ② | **湿度** | Moore 邻域（半径 `SEED.MOIST_RADIUS = 2`）内存在 `WATER`，**或**半径 2 内有含水量 > 0 的 `SOIL` | ≥ 1 |
| ③ | **温度** | 该格温度 | `SEED.TEMP_MIN = 5` ≤ T ≤ `SEED.TEMP_MAX = 40` °C |
| ④ | **露头**（"光"的近似） | 正上方 2 格内至少一格为 `AIR` 或 `WATER` | 未深埋 |

- **计时器**：四条件全满足 → `age++`；任一不满足 → `age = max(0, age - 2)`（衰减）。
- **发芽判定**：`age ≥ SEED.GERM_TIMER_REQ (=90)`（连续满足 ≥ 1.5 s）后，每 tick 以 `SEED.GERM_P = 0.05` 判定 → `SEED → PLANT`（平均再等 20 tick ≈ 0.33 s）。
- **极端温度**：$T > 60$ °C → 死亡（`ASH` p=0.5 / `AIR`）；$T < -10$ °C → 死亡（`AIR`）。
- **浮空种子**：因条件 ① 不满足，`age` 持续衰减到 0，**永不发芽**（B4 修复的第一道闸）。

> **说明（对照旧规则）**：旧 `§10.1` 把 `SOIL` 直接当作"湿度"，导致"干土也能发芽"（旧审查 F08）。新规则区分「**土壤提供落脚点**」与「**水分提供湿度**」：土壤只有在**吸水后（`age>0`）**才算湿度来源。

### 2.2 发芽验收

> **G1**：种子悬空（下方为 `AIR`）→ 跑 600 tick → **仍是 SEED，绝不变 PLANT**。
> **G2**：种子落在 `SOIL` 上、旁有水、20 °C、露头 → **≤ 180 tick 变为 PLANT**（旧基线 ≈ 1.8 s）。
> **G3**：种子落在 `SOIL` 上但**无任何水**、且 `SOIL` 含水量 = 0 → **不发芽**。
> **G4**：种子落在 `SOIL` 上、`SOIL` 含水量 > 0（湿土）→ **发芽**。

---

## 3. 根系连通性判定（Root Connectivity）

> **这是 B4 的第二道闸**：即使发芽成功，**生长也必须以"连着地面"为前提**。

### 3.1 判定算法（算法级描述，可直接编码）

对某个 `PLANT` 格 $i$，判断它是否"还连着地面"：

```
isRooted(grid, i):
    # 有界 DFS，搜索上限 ROOT_SEARCH_MAX 格，防止在巨型群落上 O(n)
    visited = set()                       # 实现：用 reactStamp 或局部队列
    queue   = [i]
    steps   = 0
    while queue not empty:
        p = queue.pop()
        if p in visited: continue
        visited.add(p); steps++
        if steps > PLANT.ROOT_SEARCH_MAX: return FALSE   # 超限 → 保守判为"未连地"
        # 检查着地点：正下方是地面，或已在底行
        if p is on bottom row (y == H-1): return TRUE
        below = p + W
        if isGround(element[below]): return TRUE
        # 扩展：4 邻域中的 PLANT
        for n in 4 neighbors of p:
            if element[n] == PLANT and n not in visited: queue.push(n)
    return FALSE
```

其中 `isGround(e)`（§3.2）判"是否为落脚面"。

### 3.2 "地面"的定义（`isGround`）

| 元素类别 | 是否算地面 | 说明 |
|---|---|---|
| 静态固体（`state==='solid'`：WALL/STONE/GLASS/METAL/ICE/WOOD/COAL/CLONE/VIRUS/TNT） | ✅ | 任何静态固体都是落脚面 |
| 粉末（`state==='powder'`：SAND/SOIL/SALT/DUST/SNOW/ASH/GUNPOWDER/SEED） | ✅ | 粉末堆是地面（沙地/土地） |
| `PLANT` 自身 | ✅ | 下方是植物 → 属于群落内部（继续向下找） |
| 液体（`state==='liquid'`） | ❌ | **水面不是地面**（杜绝"浮萍"式无限水上生长） |
| 气体 / `AIR` | ❌ | 空气/气体不是地面 |
| 底行 $y=H-1$ | ✅（特例） | 网格底边是硬地面（§15.1） |

### 3.3 检测时机与节流（性能）

- 生长判定：**每株每 `PLANT.ROOT_CHECK_INTERVAL (=15)` tick 最多做一次** `isRooted`（用 `(x*7+y*13+tick) % 15` 的错峰哈希把负载摊开，避免同一 tick 全株集中计算）。
- 断根响应：若某次检测 `isRooted==FALSE`，该格 `age`（枯萎计时器）开始累积（§6）。

> **成本**：`ROOT_SEARCH_MAX = 128` 格上限 × 每格每 15 tick 一次 → 单株成本被硬性封顶，不会随植物长大而爆炸。

### 3.4 验收

| ID | 场景 | 断言 |
|---|---|---|
| **R1** | 种子长成 3 格植物，紧贴地面 | `isRooted == TRUE` |
| **R2** | 把该植物**下方地面替换为 AIR**（悬空） | ≤ `ROOT_LOSS_GRACE` tick 后**整株枯死**（§6） |
| **R3** | 植物从水面（下方为 WATER）长出的侧枝 | 该侧枝 `isRooted == FALSE` → 不向上生长、随后枯萎 |
| **R4** | 单株植物悬空（人为造出，如移除土壤） | **永不向上生长**（B4 现象消失） |

---

## 4. 生长与水分预算（Growth & Water Budget）

### 4.1 向上生长规则

某 `PLANT` 格 $(x,y)$ 每 tick 尝试向上生长，**必须同时满足**：

| # | 条件 | 判据 |
|---|---|---|
| ① | **连地** | 该格 `isRooted == TRUE`（§3，节流检测） |
| ② | **上方可长** | 正上方 `(x, y-1)` 为 `AIR` 或 `WATER` |
| ③ | **未超供水高度** | 柱高 $h < \texttt{PLANT.CAPILLARY\_HEAD}$（§5） |
| ④ | **根区有水** | 根区半径 `PLANT.WATER_REACH = 4` 内存在 `WATER`，或含水量 > 0 的 `SOIL` |
| ⑤ | **未超群落上限** | 群落规模 < `PLANT.MAX_COLONY (=512)` |

满足后按概率生长（软上限 + 供水衰减）：

$$p_{grow}(h) = \texttt{PLANT.GROW\_P}\times\left(1 - \frac{h}{\texttt{PLANT.CAPILLARY\_HEAD}}\right)$$

- `GROW_P = 0.02`；$h=0$ 时 $p=0.02$（平均 1.7 s 长一格）；$h \to \texttt{CAPILLARY\_HEAD}$ 时 $p \to 0$（**自然封顶**）。
- 生长成功：`(x,y-1)` 写为 `PLANT`，温度继承母格，`age=0`，`latent=0`。

### 4.2 水分消耗（严格生态要求 ③）

生长**必须消耗水分**，实现为"从根区取水"：

```
tryConsumeWater(base):
    if rng < PLANT.WATER_COST_P:               # WATER_COST_P = 0.5
        # 优先取水：根区 WATER 格 → AIR（"被喝掉"）
        w = nearestCellWithElement(base, WATER, WATER_REACH)
        if w exists: element[w] = AIR; temp[w] = AMBIENT; return TRUE
        # 其次取湿土：SOIL.age -= PLANT.SOIL_DRAW
        s = nearestCellWithElement(base, SOIL, WATER_REACH, age > 0)
        if s exists: age[s] = max(0, age[s] - PLANT.SOIL_DRAW); return TRUE
    return TRUE   # 未触发消耗的那次生长不扣水（期望 0.5 单位/次）
```

- **效果**：植物越长，周围的水越少、土壤越干 → **自发停止**。这正是"生长消耗附近水分"的可观察表达。
- 当条件 ④ 不再满足（根区无水无湿土）→ **生长暂停**（不是立即死，见 §6）。

### 4.3 `SOIL` 含水量模型（"湿土"的实现）

| 事件 | 规则 |
|---|---|
| 吸水 | `SOIL` 格若 4 邻域内有 `WATER` → `age += SOIL.MOISTURE_GAIN (2)`/tick（上限 `MOISTURE_MAX = 200`） |
| 失水 | 若 4 邻域内无 `WATER` → `age -= 1`/tick（下限 0） |
| 供水 | 植物从 `SOIL.age` 抽取（`SOIL_DRAW = 20`/次），归零后该土变"干土" |

> **说明**：`SOIL.age` 的语义从"无用"升级为"含水量"。这**不新增内存**（`age` 已存在），且让"浇水→湿土→植物生长→土变干"形成闭环。

### 4.4 验收

| ID | 场景 | 断言 |
|---|---|---|
| **W1** | 湿土上的种子长成植物 | 生长过程中，根区 `WATER` 格数量**单调下降**（被消耗） |
| **W2** | 给足水 vs 给少量水 | 给水量少 → 植物**更矮**（水耗尽即停） |
| **W3** | 无水无湿土 | 生长**完全停止**（高度不变），但不立即死（进入 §6 干旱计时） |
| **W4** | 5000 tick 生长 | 单株规模 ≤ `MAX_COLONY = 512` |

---

## 5. 高度上限的物理来源（取代写死的 `MAX_HEIGHT=40`）

> **不再使用常数 `MAX_HEIGHT`。** 高度由两个物理量共同封顶：

### 5.1 双封顶机制

$$
h_{max} = \min\Bigl(\underbrace{\texttt{PLANT.CAPILLARY\_HEAD}}_{\text{根压/毛细供水极限}},\;\; \underbrace{f^{-1}(\text{根区总水量})}_{\text{可持续供水量}}\Bigr)
$$

| 封顶因素 | 机制 | 默认值 |
|---|---|---|
| **① 毛细供水极限** | 水靠根压/毛细作用向上输送，超过 `CAPILLARY_HEAD` 行后**水柱无法维持**。体现在 $p_{grow}(h)\to 0$（§4.1）。 | `CAPILLARY_HEAD = 30` 格 |
| **② 可持续供水量** | 每格生长消耗 0.5 单位水（§4.2）。根区总水量 $Q$ 只能支撑约 $2Q$ 格生长。水尽则停。 | 由环境涌现 |

**推导（写进文档，便于调参）**：设根区可用水为 $Q$ 单位、每格生长均摊耗水 $c=0.5$，则可持续高度
$$h_{water} \approx \frac{Q}{c\cdot W_{col}}\quad(W_{col}=\text{平均枝宽})$$
对单列植物（$W_{col}=1$）：$h_{water}\approx 2Q$。故**一桶水（Q=30）≈ 支撑 60 格生长**，与毛细极限 30 格共同作用 → 实际高度通常落在 **≤30 格**区间。

### 5.2 与旧值的对照

| 项 | 旧（`§10.2`） | 新 |
|---|---|---|
| 上限形式 | `MAX_HEIGHT = 40`（写死常数） | `min(CAPILLARY_HEAD, f(水量))`（物理量） |
| 生长概率 | 固定 `p=0.02` | $p=0.02(1-h/30)$（越高越慢） |
| 超限行为 | 直接拒绝生长（硬墙） | 概率平滑趋 0（软墙，视觉自然） |
| 实测 42 格顶端 | 会长到 40~42 | **封顶 ~30 格** |

### 5.3 验收

> **H1**：无限供水 + 无限空间 → 植物高度**收敛到 ≈ `CAPILLARY_HEAD`（30±2）格**，不再出现 40+ 格。
> **H2**：$h$ 越大 → 相邻两格生长间隔越长（$p$ 递减）。
> **H3**：把 `CAPILLARY_HEAD` 调成 12 → 植物封顶 ≈ 12 格（参数有效）。

---

## 6. 枯死与坠落（Whole-Colony Wilt & Fall）★缺陷 B5 修复

> 旧实现：**每格植物独立**按"半径 2 无水土"计时枯萎、独立变 `DUST` → 顶端先枯落尘、下方继续长 → **"灰尘雨"（391 格灰尘）**。
> 新实现：**整株一次性枯死**。

### 6.1 两个枯死触发（在群落级评估）

| 触发 | 条件 | 计时字段 | 计时上限 |
|---|---|---|---|
| **断根**（快速） | `isRooted == FALSE`（连不到地面） | `age`++ | `PLANT.ROOT_LOSS_GRACE = 90` tick（1.5 s） |
| **干旱**（慢速） | 根区半径 `WATER_REACH` 内无水、无湿土 | `age`++ | `PLANT.WILT_TICKS = 300` tick（5 s） |

- 任一触发计时达到上限 → **该群落标记为"枯死"**。
- **恢复**：断根修复（重新连地）或重新供水 → `age` 每 tick `-2`（可逆，给玩家挽救窗口）。

### 6.2 整株枯死（原子操作）

> 当群落被标记枯死时，在**同一 tick 内一次性**把**整个群落**的所有 `PLANT` 格转换为 `DUST`（`PLANT.DEATH_DUST_P = 1.0`，可调为 <1 让部分变 AIR）。

```
wiltColony(rootCell):
    cells = collectConnected(rootCell, PLANT, cap = MAX_COLONY)   # 一次 BFS 收集整株
    for c in cells:
        element[c] = (rng < DEATH_DUST_P) ? DUST : AIR
        temp[c]    = fitField temp
        age[c] = 0; latent[c] = 0
```

**为什么这样能消灭"灰尘雨"**：

1. 整株**一次性**变 `DUST` → 不存在"顶端先枯、下方再长、再枯"的循环；
2. 种子已在上次发芽时被消耗（种子格已成 `PLANT`），**没有残留种子**自动重播；
3. 原植物格全部变为惰性 `DUST`；`DUST` 无寿命（`lifetime=-1`），但**不再制造新的植物**；
4. 于是"灰尘"总量 = **该群落规模（一次）**，不会持续增长到 391+。

### 6.3 坠落方式（"整株一起坠落"的落地）

| 方案 | 描述 | 采用 |
|---|---|---|
| (a) **整株一次性变 DUST**（粉末） | 同一 tick 全部转 `DUST`，随后按 §5.1 粉末规则**同时坍塌**成堆 | ✅ **采用** |
| (b) 整株作为刚体下落 | 需要"多格刚体"物理，远超格级 CA 能力 | ❌ |
| (c) 逐格变 DUST | 旧实现，产生灰尘雨 | ❌ |

> **(a) 的实现即"整株一起坠落"**：因为所有格在**同一 tick** 变粉末，它们在**同一帧开始下落**，视觉上就是"整株瞬间失去支撑、一起塌落"。这既满足用户要求的"一起坠落"，又不需要刚体物理。

### 6.4 验收

| ID | 场景 | 断言 |
|---|---|---|
| **D1** | 长到 20 格的健康植物，一次性移除下方土壤 | ≤ 90 tick 后**整株同时**变为 DUST；下落 300 tick 后地面形成**一堆** |
| **D2** | 上述场景跑 3000 tick | **`DUST` 总格数不再增长**（无灰尘雨；B5 修复证据） |
| **D3** | 正常种田（湿土 + 水充足） | 植物稳定生长到 ~30 格并**持续存活**，不随机枯萎 |
| **D4** | 生长中途抽走水 | 进入干旱计时，300 tick 后整株枯死（若中途补水中途恢复则不枯） |

---

## 7. 与火 / 病毒 / 酸 / 岩浆的交互

| 交互 | 规则 | 参数 | 说明 |
|---|---|---|---|
| **火 / 燃烧** | `PLANT` 可燃（`flammability=0.15`，`ignitionTemp=250`）。邻接 `FIRE`/`LAVA` 时按 `§9.2` 概率点燃 → `FIRE`；烧尽残余 `ASH`（p=0.3，否则 `AIR`） | 沿用 `§4.2`/`§9` | 与旧规则一致；新增：燃烧前的 `PLANT` 会被 `hasOxygen` 检查（需邻接 AIR，见 `PHYSICS-AIR.md §8`） |
| **病毒** | `VIRUS` 4 邻接 `PLANT` → `PLANT → VIRUS`，p = `VIRUS.INFECT_PLANT_P = 0.05` | 沿用 R15 | 被感染的植物格脱离群落 → 该处 `isRooted` 断链 → 若整株被感染则枯萎 |
| **酸** | **新增规则 S-ACID**：`ACID` 4 邻接 `PLANT` → `PLANT` 枯萎为 `DUST`，p = `ACID.ETCH_PLANT_P = 0.02` | `ETCH_PLANT_P = 0.02` | 旧表酸只蚀金属/岩石；新规则补上"酸能腐蚀生物组织"（近似）。玻璃仍耐酸不变 |
| **岩浆** | **新增规则 S-LAVA**：`LAVA` 4 邻接 `PLANT` → `PLANT → FIRE`（p=1.0）、`LAVA → STONE`（p=1.0） | — | 明确"被岩浆烧"，不必等导热到 250 °C（避免慢热导致植物在岩浆边存活过久） |
| **呼吸 / 生长** | 生长消耗根区水（§4.2），与 `PHYSICS-AIR.md` 的空气系统**无直接耦合**（植物不产氧、不消耗空气） | — | 简化：MVP 不做植物产氧（Backlog） |

### 7.1 验收

| ID | 场景 | 断言 |
|---|---|---|
| **L1** | 火接触植物 | 植物按 `flammability=0.15` 概率点燃、蔓延 |
| **L2** | 岩浆接触植物 | **同 tick** 植物 → FIRE（不等慢热） |
| **L3** | 酸接触植物 | 植物缓慢变 DUST（p=0.02/tick） |
| **L4** | 病毒接触植物 | 按 p=0.05 感染；被感染者不再生长 |

---

## 8. 可调参数表（Tuning Parameters → `balance.js`）

### 8.1 `PLANT`（新增/变更）

| 键名 | 默认 | 范围 | 单位 | 说明 |
|---|---|---|---|---|
| `PLANT.GROW_P` | 0.02 | 0–0.2 | /tick | 基准向上生长概率（$h=0$ 时） |
| `PLANT.CAPILLARY_HEAD` | **30** | 5–120 | 格 | 毛细供水极限（取代 `MAX_HEIGHT=40`） |
| `PLANT.WILT_TICKS` | 300 | 60–1200 | tick | 干旱枯萎计时 |
| `PLANT.ROOT_LOSS_GRACE` | **90** | 10–600 | tick | 断根后枯萎宽限 |
| `PLANT.ROOT_SEARCH_MAX` | **128** | 16–1024 | 格 | 根系连通性 BFS 上限 |
| `PLANT.ROOT_CHECK_INTERVAL` | **15** | 1–60 | tick | 根系检测节流间隔 |
| `PLANT.ROOT_ZONE_H` | **3** | 1–10 | 格 | 根区高度（吸水入口范围） |
| `PLANT.WATER_REACH` | **4** | 1–12 | 格 | 从根区可汲取水源的半径 |
| `PLANT.WATER_COST_P` | **0.5** | 0–1 | — | 每次生长消耗 1 单位水的概率 |
| `PLANT.SOIL_DRAW` | **20** | 1–100 | — | 从湿土抽取的含水量/次 |
| `PLANT.DEATH_DUST_P` | **1.0** | 0–1 | — | 枯死整株变 DUST 的概率（<1 = 部分变 AIR） |
| `PLANT.MAX_COLONY` | **512** | 64–4096 | 格 | 单株规模上限（防爆） |
| `PLANT.SPREAD_WATER_P` | 0.01 | 0–0.1 | /tick | 向水面蔓延概率（保留） |

### 8.2 `SEED`（变更）

| 键名 | 旧默认 | 新默认 | 说明 |
|---|---|---|---|
| `SEED.GROUND_REQUIRED` | — | **true**（新增） | 是否要求着地 |
| `SEED.MOIST_RADIUS` | — | **2**（新增） | 湿度检测半径 |
| `SEED.GERM_TIMER_REQ` | 90 | 90（不变） | 发芽累积时长 |
| `SEED.GERM_P` | 0.05 | 0.05（不变） | 达标后发芽概率 |
| `SEED.TEMP_MIN/MAX` | 5 / 40 | 5 / 40（不变） | 温度区间 |
| `SEED.DEATH_HOT_T/COLD_T` | 60 / −10 | 60 / −10（不变） | 极端温度死亡 |

### 8.3 `SOIL`（新增）

| 键名 | 默认 | 范围 | 单位 | 说明 |
|---|---|---|---|---|
| `SOIL.MOISTURE_MAX` | **200** | 0–255 | — | 土壤含水量上限（存 `age`） |
| `SOIL.MOISTURE_GAIN` | **2** | 1–10 | /tick | 邻接水时吸水速率 |
| `SOIL.DRY_RATE` | **1** | 1–5 | /tick | 无水时失水速率 |

### 8.4 其它（新增反应）

| 键名 | 默认 | 范围 | 单位 | 说明 |
|---|---|---|---|---|
| `ACID.ETCH_PLANT_P` | **0.02** | 0–0.2 | /tick | 酸蚀植物概率（新规则 S-ACID） |
| `LAVA.IGNITE_PLANT_P` | **1.0** | 0–1 | — | 岩浆点燃植物概率（新规则 S-LAVA） |

---

## 9. 实现要点与陷阱（供程基岩对齐）

1. **`isRooted` 必须放在 `lifePass` 内、生长判定之前**，且用 `ROOT_CHECK_INTERVAL` 节流；否则每株每 tick 做 BFS 会拖垮 `lifePass`。
2. **整株枯死必须用一次 BFS 收集全部成员再统一写元素**，绝不能边扫边改（否则同一群落会被处理多次、产生半株）。
3. **`DUST` 无寿命**：不要用"给 DUST 加寿命"来消灭灰尘（会改坏 `§9` 燃烧残余）；靠"整株一次性 + 无残留种子"从源头消灭灰尘雨。
4. **生长写格时同步 `latent=0`、`age=0`**，与 `grid.setEl` 一致。
5. **`SOIL.age` 语义变更**：旧代码把 `age` 当"寿命"用于 `agePass`（`lifetime` 遍历）。`SOIL.lifetime = -1`，故 `agePass` 会 `continue` 跳过 SOIL → **不冲突**。但需在 `agePass` 确认 SOIL 被 `lifetime<0` 分支跳过（当前确实如此）。
6. **确定性**：所有随机用 `rng_hash(x, y, seed)`（`PHYSICS.md §1.5`），同种子同结果。

---

## 10. 未决 / 近似项

| # | 项 | 类型 | 理由 |
|---|---|---|---|
| M1 | 光用"露头"近似 | **近似**（沿用旧 `§10.1`） | 无光模型，列入 Backlog |
| M2 | 酸蚀植物为新增近似规则 | **近似** | 旧表无此条；为"腐蚀"要求补齐 |
| M3 | 植物不产氧、不耗氧 | 设计决策 | 简化；与空气系统解耦 |
| M4 | 毛细供水用"概率随高度衰减"近似真实根压 | **近似** | 格级无法解水势方程 |
| M5 | 向水面蔓延（`SPREAD_WATER_P`）保留 | 保留旧行为 | 侧枝不连地 → 不生长、会枯（§3.3 R3） |

---

*本文档由策划与系统设计 文策渊（Vince Coyer）产出，替代 `docs/PHYSICS.md §10`。与空气系统的接口以 `docs/PHYSICS-AIR.md` 为准；元素 ID / 配色以 `docs/ART.md` 为准。修订对照见 `docs/PHYSICS-REVISION.md`。*

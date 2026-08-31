# Yuansu Pixel Sandbox — 主架构文档

> 项目：元素像素沙盒 / Yuansu Pixel Sandbox
> 文档类型：Architecture Document（技术实现真源）
> 负责人：程基岩（Cheng Jiyan，技术方向与主程序）
> 关联真源：`docs/PHYSICS.md`（物理/数值，唯一真源）、`docs/ART.md`（视觉/配色，唯一真源）、`docs/DESIGN.md`（概念/UX）
> 语言：标题英文，正文中文

---

## 1. 目标与硬约束

| 约束 | 决策 | 理由 |
|---|---|---|
| 零依赖、无构建 | 不用打包器、不用 npm 运行时依赖 | 双击 `index.html` 可在 `file://` 打开即玩；GitHub Pages 直接部署 |
| 禁用 ES Module | 全部用 **classic script 顺序加载**，挂到全局命名空间 `window.YS` | `file://` 下 `import` 会被 CORS 拦截 |
| 同源可测 | 每个模块用统一 IIFE 包装，同时支持 `module.exports` | `src/core/**` 可在 Node 下 `require` 跑单元测试 |
| 仿真/渲染解耦 | 固定步长 60 UPS + 累加器（最多 4 子步） | 掉帧时丢步而非卡死；物理与帧率无关 |
| 确定性 | 无 `Math.random()`；全部随机走 `YS.RNG`（xorshift32 序列 + 逐格哈希） | 同种子 → 同结果（支柱 1 / R4） |
| core 无 DOM | `src/core/**` 完全不碰 DOM | Node 可测；逻辑与展示分离 |

**统一模块包装（所有模块一致）：**
```js
(function (root) {
  'use strict';
  /* ... */
  var api = { /* ... */ };
  root.YS = root.YS || {};
  root.YS.ModuleName = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
```
> 关键点：**无论浏览器还是 Node 都填充 `root.YS`**（浏览器下 `root` = `window`；Node 下 = `globalThis`），因此模块间可通过 `root.YS.X` 相互引用；同时 `module.exports` 让 Node 可直接 `require`。加载顺序由 `index.html` 与 `tests/run.js` 保证。

---

## 2. 分层与依赖

```
                 ┌───────────────────────────────────────────┐
   UI 层 (DOM)   │ toolbar.js  save.js  help.js  main.js       │
                 └───────────────┬───────────────────────────┘
                                 │
              ┌──────────────────┴──────────────────┐
渲染层 (DOM)  │ palette.js (纯数据)   renderer.js      │
              └──────────────────┬──────────────────┘
                                 │
   ┌─────────────────────────────┴─────────────────────────────┐
   │ Core 层（纯逻辑，无 DOM，Node 可测）                         │
   │   engine.js  ← 编排 tick / 守恒计数 / 存档序列化             │
   │     ├─ movement.js    ├─ reactions.js   ├─ biology.js       │
   │     ├─ thermal.js     ├─ transitions.js ├─ wind.js          │
   │     └─ grid.js                                                 │
   │   elements.js  ← 数据（30 元素属性 + 配色）                    │
   │   balance.js   ← 数据（§14 全部可调参数）                      │
   │   rng.js       ← 确定性随机                                    │
   └──────────────────────────────────────────────────────────────┘
```

- **向下依赖单向**：UI → Render → Core →（数据）。Core 永不 import/require Render/UI。
- `palette.js` 属渲染层但为纯数据/数学（无 DOM），便于在 Node 测试颜色与抖动。
- `renderer.js` / `toolbar.js` / `save.js` / `help.js` / `main.js` 允许碰 DOM。

### 加载顺序
`balance → rng → elements → grid → thermal → transitions → reactions → movement → biology → wind → engine → palette → renderer → i18n → locales(zh-CN,en,ja) → toolbar → save → help → main`

> `movement.js` 在运行时通过 `root.YS.Wind` 惰性访问对流加成，故 `wind` 只需在首次 tick 前加载（engine 之前即可）。

---

## 3. 数据模型（§1.1 / §9.2）

Structure-of-Arrays，全部为预分配类型化数组（`320×180 = 57,600` 格），主循环零 `new`：

| 数组 | 类型 | 说明 |
|---|---|---|
| `element` | `Uint8Array` | 元素 ID 1–30（1 = EMPTY） |
| `temp` | `Float32Array` | **官方温度场**（浮点 °C，[-200, 2000]，§13.4；**必须浮点**，见审查 F15） |
| `nextTemp` | `Float32Array` | 导热工作缓冲（浮点，避免逐 tick 取整漂移，见 ADR-0001） |
| `age` | `Uint16Array` | 寿命/计时器（语义随元素） |
| `latent` | `Uint8Array` | 相变潜热平台累计 tick（§6.4） |
| `moveStamp` | `Uint32Array` | 本 tick 已移动标记（存 tickId，不每帧清零） |
| `reactStamp` | `Uint32Array` | 本 tick 已反应标记 |

- 索引：`i = y * W + x`。
- **移动一律为交换**（`grid.swap`）：`A↔B` 交换 element/temp/age/latent，天然守恒质量与热量（§13.1）。
- **防重复移动/反应**：`moveStamp[i] === tickId` 即本 tick 已处理——用递增 `tickId` 取代每帧清零 `flags`（§1.4 的实现级等价，见 ADR-0001）。
- `grid.commitTemp()`：把 `nextTemp` 四舍五入 + 钳制后回写 `temp`（§13.4）。

---

## 4. tick 流水线（§1.2 更新顺序）

`Engine.step()` 每个 tick 执行：

```
tickId = ++tick
1  Movement.movePass      §5   粉末/液体/气体移动（气体含风平流；自下而上 + 左右逐帧交替）
2  Reactions.reactionPass §8   爆炸→灭火→燃烧→腐蚀→溶解→克隆/病毒（§15.4 优先级）
3  Biology.lifePass       §10  种子发芽 / 植物生长 / 枯萎 / 病毒
4  Thermal.diffuse        §6.1 导热 → 写入 nextTemp
5  Transitions.process    §7   相变（读 nextTemp；潜热平台 §6.4）
6  Thermal.relax          §6.3 向环境温度弛豫 + 暴露加成
7  grid.commitTemp        温度钳制 + 回写 temp（替代 §1.2 的 clearFlags / swap）
8  agePass                §4.3 寿命 / decayTo（FIRE/SMOKE/STEAM）
9  Wind.windPass          §11  轻质粉末空中漂移（+ 对流已在 movePass 内叠加）
```

**与 §1.2 的两处实现级差异**（等价或更优，见 ADR-0003）：
1. 原第 1 步 `clearFlags()` 与第 8 步 `swap temp↔nextTemp`：改为 `moveStamp/reactStamp`（递增 tickId）+ `commitTemp()` 回写。效果等价，省去每帧 57,600 次清零 / 交换。
2. §5.3 规定气体移动优先级为「风平流 → 浮力 → 扩散」，故气体风平流并入 `movePass`（保证「每格每 tick 只动一次」的优先级正确）；`windPass` 保留 §11.2 轻质粉末漂移。

**每帧主循环（main.js）**：累加器 + `MAX_SUBSTEPS = 4`，`real` 上限 0.25 s 防螺旋死亡。

---

## 5. 确定性（§1.5）

- `RNG` 提供两类：
  - `RNG.Stream`：带种子的 **xorshift32** 序列（顺序性随机；API 完备）。
  - `RNG.hash01(x,y,salt)` / `hashU32`：**无状态整数哈希**（逐格判定），salt 内混入全局 `SEED` 与元素 ID / tick。
- 所有移动/相变/反应/生命判定都走 `hash01(x, y, f(element, tick))` → 同格同 tick 结果稳定，且**不依赖调用顺序**。
- `SEED` 默认 1337（`PHYS.SEED`），`Engine.create({seed})` / `RNG.setSeed()` 可更换整局序列。
- **全局禁止 `Math.random()`**（自检脚本可校验）。

---

## 6. 守恒与不变量（§13）

| 不变量 | 保证方式 |
|---|---|
| 质量（格数）守恒（移动/相变） | 移动 = 交换；相变 1↔1 |
| 质量创生仅 CLONE / SPRING | 配额 `MAX_CLONE_CELLS=2000` / `MAX_SPRING_CELLS=1500` |
| 唯一合法减项：气体逸出顶边 | `Movement.vent()` 置 EMPTY（温度不保留） |
| 温度 ∈ [MIN_TEMP, MAX_TEMP] | `commitTemp` 钳制（§13.4） |
| 导热不创生/消灭能量 | §6.1 对称交换 → 守恒 ΣT（比热加权模式守恒 ΣcT，见 ADR-0003） |

`Engine.countCells()` = 非 EMPTY 格数；`Engine.hash()` = element+temp 的 FNV 哈希（确定性回归用）。

---

## 7. 渲染管线（ART §1.4 / §2.3 / §2.4）

1. **离屏**：`document.createElement('canvas')` 320×180，`createImageData` → `Uint8ClampedArray`（`Uint32Array` 视图直写，ABGR 小端）。
2. **铺底**：全缓冲填充 `EMPTY` 色 `#0B0F17`（高对比模式 `#000000`）。
3. **逐格上色**：每格唯一元素，按 `Palette.shadeIndex` 在 base/light/dark 三档确定性抖动取色；`alpha<1` 与底色混合。
4. **自发光透光晕**：strong（LAVA/FIRE）在邻域做加法柔光（§2.4）。
5. **热力图叠加**（可选）：温度 → 色带半透明叠加（§8.4）。
6. **blit**：`imageSmoothingEnabled=false`，按**最大整数倍 × devicePixelRatio** 放大到显示 canvas（最近邻，§1.4）。
7. **光标叠加**：显示层上绘制双色描边笔刷框（§6.2）。

- 抖动由 `(x, y, 元素)` 确定性哈希决定；动画元素（`anim`）额外混入 `floor(now/130)` 时间项（≈7.7Hz 换相，≤5Hz 可见变化）；`prefers-reduced-motion` 时时间项恒 0。

---

## 8. i18n（DESIGN §10）

- `YS.I18N`：零依赖字典 + `t(key)`；`data-i18n` / `data-i18n-title` / `data-i18n-aria` 节点统一重写。
- 语言优先级：`?lang=` > `localStorage(yuansu.lang)` > `navigator.language` > `zh-CN`。
- 元素名以 **key**（英文常量名）存储在 `elements.js`，UI 一律经 `I18N.t('el.'+key)` 查表——**UI 代码零硬编码中文**。
- 字典：`zh-CN`（默认、最全）/ `en` / `ja`。

---

## 9. 存档格式（DESIGN §8.7）

```json
{ "version": 1, "w": 320, "h": 180,
  "element": [...57600], "temp": [...57600], "age": [...57600],
  "wind": {"x":0,"y":0,"strength":0,"angle":0},
  "seed": 1337, "tick": 0 }
```
- `localStorage` key：`yuansu.save.<slot>`；导出/导入 JSON 文件；导出 PNG（离屏 × 整数倍）。
- `version` 预留迁移；尺寸不匹配抛出而非静默失败。

---

## 10. 性能预算与措施（DESIGN §9）

| 措施 | 说明 |
|---|---|
| SoA + 类型化数组 | 零对象数组、零 GC |
| 空场快速跳过 | EMPTY 格不参与移动/反应 |
| EMPTY-EMPTY 导热对跳过 | 省去大半导热配对 |
| 温度场仅 nextTemp 计算 | 单缓冲计算 + 一次回写 |
| 扫描方向逐帧交替 | 消除液体方向偏置（免费且确定） |
| 累加器 + 最多 4 子步 | 掉帧丢步，不卡死 |
| 自适应降级（v1.0） | 帧率不足时降子步/降刷新率（预留） |

预算目标：仿真 ≤ 6 ms、渲染 ≤ 6 ms、UI ≤ 1.5 ms、合计 ≤ 16.67 ms（60 FPS）。

---

## 11. 与设计稿的偏离清单（须人工确认）

| # | 偏离 | 类型 | 理由 |
|---|---|---|---|
| D1 | ~~`temp` 用 `Int16Array` + 四舍五入回写~~ | **已废弃**（审查 F15） | 该方案会把每 tick <0.5 °C 的**升温**也一并丢弃 → 冰在空气中永不融化。现改为 **`temp` 与 `nextTemp` 同为 `Float32Array`**，`commitTemp` 只钳制、不取整 |
| D2 | 用 `moveStamp/reactStamp`（递增 tickId）替代每帧 `flags` 位清零 | 实现等价 | §1.4 语义一致，省 2×57600 次写/帧 |
| D3 | 气体风平流并入 `movePass`；`windPass` 只做轻质粉末漂移与对流 | 顺序微调 | 服从 §5.3 的气体移动优先级，保证「每格每 tick 只动一次」 |
| D4 | 导热提供 `energyWeighted` 选项：默认守恒 ΣT（§6.1 标定式），测试用守恒 ΣcT | 新增测试能力 | §6.1 标定数值（岩浆加热水 ≈ +2.1°C/tick）与「守恒 ΣcT」在数学上不可兼得（详见 ADR-0003）；二者以开关并存 |
| D5 | 液体浮力按「正下方为更轻可移动液体 → 下沉交换」实现（§5.2.4 原文表述有歧义） | 语义澄清 | 该实现自然产生正确分层（油浮水、液氮浮一切） |
| D6 | `Uint32Array` 直写像素假设小端字节序 | 平台假设 | 所有主流浏览器/设备均为小端 |
| D7 | 首帧未做「温度惰性跳过」与脏矩形（v1.0 计划内） | 范围 | MVP 先用全量导热/全量渲染，性能预算内 |

---

## 12. 待人工验证 / 知识缺口

- 真机浏览器（Chrome/Edge/Safari/Firefox）下 `file://` 直接双击运行、canvas 显示与鼠标反算坐标准确性（Node 无法覆盖）。
- 满屏复杂反应时的实际 FPS（性能预算需在真机实测）。
- 触控（pointer events）在移动端的可用性（v1.0 增补）。
- 高 DPI 屏下整数倍放大的观感（已按 `× dpr` 处理，需目视确认）。
- iOS Safari 的 `ImageData` / `toBlob` 行为差异（DESIGN R6）。

---

*本文档由技术方向与主程序 程基岩产出。物理数值以 `docs/PHYSICS.md` 为准，视觉以 `docs/ART.md` 为准，概念以 `docs/DESIGN.md` 为准。任何偏离已在上表显式标注并待评审。*

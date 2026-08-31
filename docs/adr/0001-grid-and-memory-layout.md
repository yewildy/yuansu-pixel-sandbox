# ADR-0001：网格与内存布局

- 状态：**部分被取代**（Partially Superseded）
- 日期：项目 v1.0
- 决策人：程基岩（技术方向与主程序）
- 关联：`docs/PHYSICS.md` §1.1/§1.4/§9.2/§13；`docs/adr/0003`

> ⚠️ **本 ADR 中「`temp` 用 `Int16Array` + 四舍五入回写」的部分已被
> [ADR-0004（温度场改用浮点存储）](0004-float-temperature-field.md) 取代。**
> 原因是该方案只验算了降温侧，忽略了升温侧 —— 导致冰在空气中永不停留在 −10 °C 而不融化（审查 F15）。
> 网格布局、`stamp` 防重复标记、`Float32Array nextTemp` 工作缓冲等其余决策**仍然有效**。

## 上下文（Context）

仿真为 320×180 = 57,600 格的四邻域元胞自动机，目标 60 UPS（即每帧最多 4 子步）。每格需要：元素 ID、温度、年龄、潜热累计，以及「本 tick 是否已移动/已反应」的防重复标记（§1.4）。主流笔电必须在满屏反应时守住 60 FPS（DESIGN §9），因此主循环必须**零分配、零 GC**。

问题聚焦三点：
1. 用 AoS（对象数组）还是 SoA（类型化数组）？
2. 温度用 `Int16Array`（§1.1 规定）如何避免逐 tick 取整带来的物理漂移？
3. 防重复标记用每帧清零的 `flags` 位（§1.1），还是别的？

## 备选方案（Options）

**A. AoS：`[{element,temp,age,...}]`**
- 优：可读性好。
- 劣：每格一个对象 → 巨量 GC 压力、缓存不友好、类型推断差。**否决**。

**B. SoA + 每帧 `flags.fill(0)` 清零**
- 优：类型化数组快；与 §1.1 字面一致。
- 劣：每帧写 57,600 字节；温度仍为 Int16 整数。

**C. SoA + 递增 `stamp`（tickId）+ 浮点工作缓冲（采纳）**
- 用 `Uint32Array moveStamp/reactStamp` 存「本 tick 编号」；`stamp[i] === tickId` 表示本 tick 已处理。**无需每帧清零**，只递增一个标量。
- `temp` 保留 `Int16Array` 作为官方温度场（满足 §1.1/§13.4 的整数语义与内存预算）；导热用 `Float32Array nextTemp` 累计，最后 `Math.round` 回写。

## 决定（Decision）

采用 **方案 C**：

```
element : Uint8Array(57600)
temp    : Int16Array(57600)     // 官方温度场（整数 °C）
nextTemp: Float32Array(57600)   // 导热/弛豫工作缓冲
age     : Uint16Array(57600)
latent  : Uint8Array(57600)
moveStamp/reactStamp : Uint32Array(57600)
```

- 移动一律为**交换**（`grid.swap`），天然守恒质量与伴随热量（§13.1）。
- `grid.commitTemp(minT,maxT)`：`nextTemp → round + clamp → temp`（§13.4）。

### 为何引入 Float32 工作缓冲（对 §1.1 的实现级细化）

若导热结果直接写回 `Int16Array`，`ToInt16` 采用**向零截断**：一个本应每 tick 降 0.4°C 的格子会被截成降 1°C（1199.6 → 1199），使岩浆/液氮/冰的散热速率显著快于 §6.1 的标定值（会破坏审查 F01/F02/F09 的修正意图）。改用 Float32 累计 + 四舍五入回写，既保留了「对外为整数温度」的契约，又让冷却速率忠实于标定。

## 后果（Consequences）

**正面**
- 主循环零分配；`stamp` 取代每帧两次 57,600 元素清零，省 ~460 KB/s 内存写。
- 冷却/升温速率忠实 §6.1 标定；温度对外仍为整数 °C。
- `stamp` 方案天然可重入、可确定性复现。

**负面 / 代价**
- 内存由 6 B/格升至 8 B/格（多出 Float32 缓冲）：网格 ≈ 460 KB，仍远低于 2 MB 预算（DESIGN §9.5）。
- 增加一次回写遍历（57,600 次/帧），在预算内。
- `stamp` 依赖 `tickId` 单调递增且不重复；`Engine.clear()` 需重置 `tickId = 1` 并清零 stamp。
- `Uint32Array` 直写像素假设小端（详见 ADR-0002）。

**跟进**
- 若未来温度需要更高精度，可将 `temp` 直接升级为 `Float32Array`（决策点已记录，暂不做）。

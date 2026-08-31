# ADR-0002：渲染管线

- 状态：已采纳（Accepted）
- 日期：项目 v1.0
- 决策人：程基岩（技术方向与主程序）
- 关联：`docs/ART.md` §1.4/§2.3/§2.4/§3/§6.2；`docs/DESIGN.md` §9.1；`docs/adr/0001`

## 上下文（Context）

视觉真源要求：320×180 逻辑网格、**1 格 = 1 像素**、**只允许整数倍放大**、最近邻、深色画布、逐格确定性抖动、自发光加法柔光、UI 隐形（ART §1）。性能预算给渲染 ≤ 6 ms/帧（DESIGN §9.1）。同时要满足 `file://` 零依赖、跨浏览器（含 Safari，DESIGN R6）。

问题：
1. 用什么后端？
2. 如何在 JS 里高效直写 57,600 像素？
3. 如何保证整数倍放大与高分屏（devicePixelRatio）都不糊？

## 备选方案（Options）

**A. WebGL / WebGL2**
- 优：极快。
- 劣：零依赖下自建管线成本高；Safari/低端机兼容与上下文丢失处理复杂；MVP 不需要。**列入 Backlog（DESIGN §5.3 技术重估项），暂不做。**

**B. Canvas2D `fillRect` 逐格**
- 优：简单。
- 劣：57,600 次 draw call/帧，开销远超预算。**否决**。

**C. Canvas2D + 离屏 ImageData 直写 + 整数倍 blit（采纳）**
- 离屏 canvas（320×180）用 `ImageData` 逐像素直写，再以最大整数倍 `drawImage` blit 到显示 canvas，全程 `imageSmoothingEnabled = false`。

## 决定（Decision）

采用 **方案 C**：

1. **离屏直写**：`createImageData(w,h)` → 以 `Uint32Array` 视图一次性写像素（每格写 1 次，因网格每格仅一个元素，半透明元素直接与底色混合即正确）。
2. **像素打包**：`0xAABBGGRR`（小端）。`EMPTY` = `#0B0F17`（高对比 = `#000000`）。
3. **整数倍放大**：`scale = floor(min(cssW/gw, cssH/gh))`（下限 1）；显示 canvas backing = `gw*scale*dpr × gh*scale*dpr`，CSS 尺寸 = `gw*scale px`，`drawImage` 全程最近邻。
4. **抖动**：`Palette.shadeIndex(x,y,el,t,highContrast)` 由确定性哈希在三档取色；动画元素混入 `floor(now/130)` 时间项；`reducedMotion` 时时间项为 0；`WALL/GLASS/EMPTY` 关闭抖动（ART §2.3 例外）。
5. **自发光**：strong（LAVA/FIRE）在 3×3 邻域做加法柔光；weak 仅提亮。
6. **光标**：在显示层叠加双色描边框（ART §6.2），不进入离屏层。
7. **热力图**：可选后处理叠加（ART/DESIGN §8.4）。
8. **鼠标反算**：`(clientX - rect.left)/rect.width*gw`，钳制到网格内。

## 后果（Consequences）

**正面**
- 零依赖、跨浏览器一致；渲染成本随像素数线性、无 draw-call 爆炸。
- 输出为纯色块，天然满足「像素诚实」调性。
- 离屏 canvas 可直接用于导出 PNG（× 整数倍）。

**负面 / 代价**
- **小端假设**：`Uint32Array` 视图按小端解释 ABGR。所有主流浏览器/设备是小端，已在 ARCHITECTURE §11 标注；如需绝对可移植，可改为逐字节 `Uint8ClampedArray` 写入（略慢）。
- **半透明只与底色混合**：因网格每格唯一元素，视觉正确；但若未来引入「多层/叠加元素」需重写为分层合成。
- 逐帧全量重绘（未做脏矩形）；在空场/静止场景仍有 57,600 次写，预算内但可优化（v1.0）。
- 发光为 3×3 box 近似，非真正径向高斯（ART §2.4 允许「近似」）。

**跟进**
- v1.0：脏矩形渲染、自适应降级（帧率不足时降叠加层刷新率）。
- 若 Canvas2D 触顶：重估 WebGL 后端（DESIGN §5.3）。

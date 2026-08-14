# ART BIBLE — Yuansu Pixel Sandbox 视觉身份与配色规范

> 项目：元素像素游戏 / Yuansu Pixel Sandbox
> 平台：纯前端 Web（零依赖 · Canvas2D · 320×180 网格，1 格 = 1 像素，整数倍放大显示）
> 版本：v1.0 · 负责人：林绘澄（Lin Wayson，美术总监）
> 适用范围：本文件是唯一视觉真源。任何渲染、UI、图标、配色的实现必须引用此规范；偏离处必须显式标注。

---

## 1. Visual Identity

### 1.1 一页话调性（Tone in one paragraph）
我们做的是一块**「实验室里的发光沙盘」**：深色画布像一间关灯的物理实验室，所有元素是丢弃在暗台上的彩色粒子。视觉主角永远是**元素本身**——它们的颜色、颗粒、流动、发光。界面必须退居其次，像实验仪器的刻度一样克制、精确、几乎无存在感。整体气质是**冷静的科学感 + 一点玩火的危险感**：岩石/金属/冰是低饱和的工业灰与冷色，而岩浆/火/酸/克隆体是会自己发光的能量体。我们拒绝「手游糖果风」，也拒绝「复古像素怀旧风」的过度装饰；我们要的是**干净、高辨识、可持续长时间注视**的像素沙盒。

### 1.2 视觉锚点（Visual Anchors）
| 锚点 | 说明 |
|---|---|
| 单格单像素 | 每个网格 = 1 个逻辑像素；不做抗锯齿、不做矢量曲线。所有元素都是「方块的诚实呈现」。 |
| 深色画布 | 画布底色 `#0B0F17`（近黑冷蓝，**非纯黑**）。让高饱和液体与自发光元素自然跳出来。 |
| 颗粒抖动 | 同元素相邻格在 base/light/dark 三档间随机取色，制造「砂砾质感」，避免呆板色块。见 §2.3。 |
| 发光即状态 | 自发光 = 「这个元素能量/危险/特殊」。发光元素在暗画布上做加法混合的柔光晕。见 §2.4。 |
| 界面隐形 | UI 面板低饱和、低对比、深色；只有选中态与危险操作使用高饱和强调色。 |

### 1.3 深色画布理由（Why dark canvas）
1. **辨识度**：本作本质是「假彩色物理模拟」。深底让橙色岩浆、亮绿强酸、青色液氮、洋红克隆体等高饱和元素对比最大化，一眼可辨。
2. **发光语义**：只有深底才能让「自发光元素发光」这个语义成立——能量体自然成为画面焦点。
3. **长时间注视不累**：深底 + 低饱和 UI 显著降低长时间模拟/搭建时的视觉疲劳；相比纯黑，冷蓝色底（`#0B0F17`）降低了与白色 UI 文字的极端对比，减少眩光与拖影（OLED 也不易出现纯黑涂抹感）。
4. **调性**：暗色实验台 → 科学感、专注感。

### 1.4 显示与放大倍率（Display & Scaling）——最近邻
- **逻辑网格**：`320 × 180`（16:9）。渲染时先在离屏 canvas 上以 **1 格 = 1 设备像素** 绘制，再整数倍放大 blit 到屏幕。
- **只允许整数倍放大**：推荐 `2× / 3× / 4× / 5× / 6× / 8×`。
  - `4×` = 1280×720（默认，适配绝大多数窗口）
  - `6×` = 1920×1080（1080p 满屏）
  - 提供「自动适应窗口」时取**能放下的最大整数倍**，下限 `2×`。
- **最近邻强制**：
  - `ctx.imageSmoothingEnabled = false`
  - 离屏 canvas 放大 blit 时同样关闭平滑
  - CSS：`image-rendering: pixelated;`（同时给 `crisp-edges` 兜底）
- **禁止非整数倍缩放**（如 1.7×）：会导致像素块大小不均匀、出现摩尔纹。若因「适应窗口」被迫非整数，须在右下角提示用户切换整数倍。
- **高分屏（devicePixelRatio）**：最终显示 canvas 的 backing store 尺寸 = `displayCssSize × devicePixelRatio`，离屏 320×180 再按 `scale × dpr` 整数放大绘制，全程最近邻。避免「一个格子跨半像素」导致的模糊。
- **网格辅助线**（可选开关）：以 1 设备像素、颜色 `#121826` 每 16 格画淡点线，帮助对位；默认关闭以免干扰。

---

## 2. Element Color Palette

> 表内所有颜色均为 hex，可直接复制为代码常量。完整代码块见 §2.5。
> `base` = 主色；`light` = 明变体（受光/高光抖动用）；`dark` = 暗变体（阴影/颗粒抖动用）。
> `emissive`：`yes` 强自发光 / `weak` 弱自发光 / `no` 不发光。`alpha`：渲染不透明度。
> `cat`：`static` 静态固体 · `powder` 粉末 · `liquid` 液体 · `gas` 气体 · `special` 特殊。

### 2.1 元素配色总表（30 种）

| # | 英文 | 中文 | cat | base | light | dark | emissive | alpha |
|---|---|---|---|---|---|---|---|---|
| 1 | EMPTY | 空 | special | `#0B0F17` | `#121826` | `#06080E` | no | 1.00 |
| 2 | WALL | 墙 | static | `#5E6874` | `#78828E` | `#414A56` | no | 1.00 |
| 3 | STONE | 岩石 | static | `#8A8175` | `#A79C8C` | `#615A50` | no | 1.00 |
| 4 | GLASS | 玻璃 | static | `#BCE0DC` | `#E0F2EF` | `#8FBCB7` | no | 0.55 |
| 5 | METAL | 金属 | static | `#A6B2C2` | `#D6DEE8` | `#6E7A8A` | no | 1.00 |
| 6 | ICE | 冰 | static | `#AEDCF7` | `#DBF0FF` | `#7FB6D9` | no | 1.00 |
| 7 | WOOD | 木材 | static | `#8A5A2B` | `#A9743E` | `#5E3B1A` | no | 1.00 |
| 8 | PLANT | 植物 | special | `#4AA03C` | `#6FC24E` | `#2E6E28` | no | 1.00 |
| 9 | SAND | 沙 | powder | `#E8C15A` | `#F5D98A` | `#B9963C` | no | 1.00 |
| 10 | SOIL | 土壤 | powder | `#5A4028` | `#785A38` | `#3C2A18` | no | 1.00 |
| 11 | SALT | 盐 | powder | `#EDEFF2` | `#FFFFFF` | `#C3C8D0` | no | 1.00 |
| 12 | DUST | 尘埃 | powder | `#B7B1A4` | `#D2CCC0` | `#8A8478` | no | 1.00 |
| 13 | SNOW | 雪 | powder | `#E4ECFA` | `#FFFFFF` | `#B4CBE4` | no | 1.00 |
| 14 | ASH | 灰烬 | powder | `#6E6A64` | `#8C877F` | `#4C4842` | no | 1.00 |
| 15 | COAL | 煤 | static | `#2A2A2E` | `#3E3E44` | `#171719` | no | 1.00 |
| 16 | GUNPOWDER | 火药 | powder | `#4A3F3A` | `#6A5A50` | `#2E2622` | no | 1.00 |
| 17 | SEED | 种子 | powder | `#A3A83C` | `#C4C95E` | `#767A24` | no | 1.00 |
| 18 | WATER | 水 | liquid | `#2E78DE` | `#5AA0F0` | `#1D51A8` | no | 0.85 |
| 19 | OIL | 油 | liquid | `#46324F` | `#6A4B78` | `#2A1C30` | no | 0.90 |
| 20 | LAVA | 岩浆 | liquid | `#F2600F` | `#FF8A34` | `#A83208` | **yes** | 1.00 |
| 21 | ACID | 强酸 | liquid | `#8FD41E` | `#B8EC4A` | `#5E9410` | weak | 0.90 |
| 22 | LN2 | 液氮 | liquid | `#7FD8E8` | `#B8EEF6` | `#4AA8BE` | weak | 0.90 |
| 23 | STEAM | 水蒸气 | gas | `#C8D2DC` | `#E6EDF4` | `#9AA6B4` | no | 0.50 |
| 24 | SMOKE | 烟 | gas | `#444B56` | `#5E6673` | `#2C313A` | no | 0.60 |
| 25 | FIRE | 火 | gas | `#FFB020` | `#FFD64A` | `#E24A0E` | **yes** | 0.95 |
| 26 | GAS | 瓦斯 | gas | `#CBCB78` | `#E8E8A8` | `#9E9E4C` | no | 0.35 |
| 27 | CLONE | 克隆体 | static | `#C24BD8` | `#E57FEF` | `#8A2BA0` | weak | 1.00 |
| 28 | VIRUS | 病毒 | static | `#EC3E6E` | `#FF6AA0` | `#A81E54` | weak | 1.00 |
| 29 | SPRING | 水源泉 | liquid | `#3FA9F5` | `#7CC8FF` | `#1E6FB8` | no | 0.90 |
| 30 | TNT | 炸药 | static | `#C0272D` | `#E04A3A` | `#8A1518` | no | 1.00 |

### 2.2 易混色组区分策略（Critical Differentiation）

**A. 水 / 液氮 / 冰**（蓝青色系三连）
- `WATER #2E78DE` 饱和中蓝、中明度、平滑无纹理（hue≈216）。
- `LN2 #7FD8E8` 淡青、高明度、**水平虚线纹（霜纹）**（hue≈188），冷得发白。
- `ICE #AEDCF7` 淡蓝白、更高明度、**十字结晶纹**（hue≈205）。
- 三重区分：**色相微移（188/205/216）+ 明度阶梯（LN2 最亮、ICE 次亮、WATER 最暗）+ 纹样（虚线/十字/无）**。

**B. 岩浆 / 火 / TNT**（红橙系三连）
- `LAVA #F2600F` 橙红、**液体**、强发光、缓慢流动（hue≈22）。
- `FIRE #FFB020` 亮黄橙、**气态**、强发光、高频闪烁（hue≈42）。
- `TNT #C0272D` 深绯红、**静态固体块**、不发光、带**横向亮带条纹**（hue≈356）。
- 三重区分：**色相（22/42/356）+ 物质态（液/气/固）+ 动效（流动/闪烁/静止）+ TNT 专属条纹**。

**C. 烟 / 尘 / 灰**（中性灰系三连）
- `SMOKE #444B56` **暗**冷灰、半透明、上升。
- `ASH #6E6A64` **中**暖灰、不透明。
- `DUST #B7B1A4` **亮**暖灰、不透明。
- 三重区分：**明度阶梯（暗/中/亮）**——这是对色盲最友好的区分方式，同时暖冷微差 + 透明度差异。

**其他需注意的相邻色**
- `STEAM #C8D2DC`（亮冷半透明） vs `SMOKE #444B56`（暗冷半透明）：靠明度拉开，均为上升气体。
- `COAL #2A2A2E`（近黑固体） vs `EMPTY #0B0F17`（画布） vs `GUNPOWDER #4A3F3A`（偏暖深褐）：煤的明度略高于画布且偏冷，火药偏暖褐。
- `SEED #A3A83C`（橄榄） vs `GAS #CBCB78`（硫黄，低透明） vs `PLANT #4AA03C`（真绿） vs `ACID #8FD41E`（亮柠檬）：色相 60/72/128/82，靠色相 + 明度 + 透明度 + 动效区分。
- `CLONE #C24BD8`（紫洋红，hue≈290） vs `VIRUS #EC3E6E`（玫红，hue≈340）：色相拉开 + 二者均带**脉冲斑点动效**（克隆脉冲外扩、病毒高频抖动）。

### 2.3 逐格随机色抖动规则（Per-Cell Dithering）

**目的**：同一元素的相邻格在 `base / light / dark` 三档间确定性随机取色，避免整片呆板色块，营造颗粒/岩面质感。

**规则**
1. 用**确定性哈希**由 `(x, y, elementId)` 生成 `r ∈ [0,1)`，**同一格每帧取色相同**（否则会全屏噪点闪烁）。
2. 按权重在三档中取值——不同类别权重不同：

| cat | base | light | dark | 效果 |
|---|---|---|---|---|
| static | 0.58 | 0.16 | 0.26 | 明显岩面颗粒感 |
| powder | 0.60 | 0.18 | 0.22 | 砂砾感 |
| liquid | 0.82 | 0.09 | 0.09 | 轻微流动光泽，避免碎斑 |
| gas | 0.66 | 0.20 | 0.14 | 云雾感 |

3. **例外**：`WALL`、`GLASS` 关闭抖动（平板/玻璃要平滑干净）；`EMPTY` 不抖动。
4. **动画元素**（`FIRE / SMOKE / LAVA / ACID / STEAM / GAS / VIRUS / SPRING` 记号）在哈希里加入**时间项** `t = floor(now / 130)`（约 7.7Hz 换相，视觉上≈每秒 4–5 次可见变化），使光晕/斑点缓慢流动。**振幅要小**，只换档不换色相。
5. **`prefers-reduced-motion: reduce` 时**：时间项恒为 0（退回静态抖动），并关闭发光脉冲。**动效频率上限 ≤ 5Hz**，禁止每帧闪烁（防光敏性癫痫）。

**参考实现**
```js
// 确定性哈希 → 三档取色
function pickShade(x, y, el, t = 0) {
  let h = (x * 374761393 + y * 668265263) ^ (el.id * 69069) ^ (t * 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  const r = (h >>> 0) / 4294967296;          // [0,1)
  const w = el.weights || WEIGHTS[el.cat];   // {base, light, dark}
  if (r < w.base)                    return el.base;
  if (r < w.base + w.light)          return el.light;
  return el.dark;
}
const WEIGHTS = {
  static: { base: 0.58, light: 0.16, dark: 0.26 },
  powder: { base: 0.60, light: 0.18, dark: 0.22 },
  liquid: { base: 0.82, light: 0.09, dark: 0.09 },
  gas:    { base: 0.66, light: 0.20, dark: 0.14 },
  special:{ base: 0.70, light: 0.15, dark: 0.15 },
};
```

### 2.4 自发光渲染（Emissive）
- **strong（`LAVA / FIRE`）**：以 base 为芯色绘制实心格，叠加**加法混合（`globalCompositeOperation='lighter'`）**的一层径向柔光晕（半径 2–3 格，透明度 0.25→0，颜色取 light）。
- **weak（`ACID / LN2 / CLONE / VIRUS`）**：仅绘制「更亮的 base」+ 极淡内发光（半径 1 格，透明度 0.12），表现为「会呼吸的发光体」。`VIRUS / CLONE` 的 pulse 频率 ≤ 2Hz。
- `SPRING`：不整体发光，但在格中心绘制 1 像素的**高频亮芯**（每 500ms 在 `light` 与 `#FFFFFF` 间切换）作为「无限源」记号。
- 发光是用**状态**表达语义：危险/能量/特殊。非发光元素绝不参与发光层，避免画面“满屏放光”。

### 2.5 可直接复制进代码的常量块
```js
// ===== 元素配色常量（Yuansu Pixel Sandbox v1.0）=====
export const PALETTE = {
  EMPTY:     { id: 1,  cn:'空',    cat:'special', base:'#0B0F17', light:'#121826', dark:'#06080E', emissive:'no',   alpha:1.00 },
  WALL:      { id: 2,  cn:'墙',    cat:'static',  base:'#5E6874', light:'#78828E', dark:'#414A56', emissive:'no',   alpha:1.00, dither:false },
  STONE:     { id: 3,  cn:'岩石',  cat:'static',  base:'#8A8175', light:'#A79C8C', dark:'#615A50', emissive:'no',   alpha:1.00 },
  GLASS:     { id: 4,  cn:'玻璃',  cat:'static',  base:'#BCE0DC', light:'#E0F2EF', dark:'#8FBCB7', emissive:'no',   alpha:0.55, dither:false },
  METAL:     { id: 5,  cn:'金属',  cat:'static',  base:'#A6B2C2', light:'#D6DEE8', dark:'#6E7A8A', emissive:'no',   alpha:1.00, sheen:true },
  ICE:       { id: 6,  cn:'冰',    cat:'static',  base:'#AEDCF7', light:'#DBF0FF', dark:'#7FB6D9', emissive:'no',   alpha:1.00, pattern:'cross' },
  WOOD:      { id: 7,  cn:'木材',  cat:'static',  base:'#8A5A2B', light:'#A9743E', dark:'#5E3B1A', emissive:'no',   alpha:1.00, pattern:'grain' },
  PLANT:     { id: 8,  cn:'植物',  cat:'special', base:'#4AA03C', light:'#6FC24E', dark:'#2E6E28', emissive:'no',   alpha:1.00 },
  SAND:      { id: 9,  cn:'沙',    cat:'powder',  base:'#E8C15A', light:'#F5D98A', dark:'#B9963C', emissive:'no',   alpha:1.00 },
  SOIL:      { id: 10, cn:'土壤',  cat:'powder',  base:'#5A4028', light:'#785A38', dark:'#3C2A18', emissive:'no',   alpha:1.00 },
  SALT:      { id: 11, cn:'盐',    cat:'powder',  base:'#EDEFF2', light:'#FFFFFF', dark:'#C3C8D0', emissive:'no',   alpha:1.00 },
  DUST:      { id: 12, cn:'尘埃',  cat:'powder',  base:'#B7B1A4', light:'#D2CCC0', dark:'#8A8478', emissive:'no',   alpha:1.00 },
  SNOW:      { id: 13, cn:'雪',    cat:'powder',  base:'#E4ECFA', light:'#FFFFFF', dark:'#B4CBE4', emissive:'no',   alpha:1.00 },
  ASH:       { id: 14, cn:'灰烬',  cat:'powder',  base:'#6E6A64', light:'#8C877F', dark:'#4C4842', emissive:'no',   alpha:1.00 },
  COAL:      { id: 15, cn:'煤',    cat:'static',  base:'#2A2A2E', light:'#3E3E44', dark:'#171719', emissive:'no',   alpha:1.00 },
  GUNPOWDER: { id: 16, cn:'火药',  cat:'powder',  base:'#4A3F3A', light:'#6A5A50', dark:'#2E2622', emissive:'no',   alpha:1.00, fleck:'#C0392B' },
  SEED:      { id: 17, cn:'种子',  cat:'powder',  base:'#A3A83C', light:'#C4C95E', dark:'#767A24', emissive:'no',   alpha:1.00 },
  WATER:     { id: 18, cn:'水',    cat:'liquid',  base:'#2E78DE', light:'#5AA0F0', dark:'#1D51A8', emissive:'no',   alpha:0.85 },
  OIL:       { id: 19, cn:'油',    cat:'liquid',  base:'#46324F', light:'#6A4B78', dark:'#2A1C30', emissive:'no',   alpha:0.90 },
  LAVA:      { id: 20, cn:'岩浆',  cat:'liquid',  base:'#F2600F', light:'#FF8A34', dark:'#A83208', emissive:'strong', alpha:1.00, anim:true },
  ACID:      { id: 21, cn:'强酸',  cat:'liquid',  base:'#8FD41E', light:'#B8EC4A', dark:'#5E9410', emissive:'weak', alpha:0.90, anim:true, pattern:'speckle' },
  LN2:       { id: 22, cn:'液氮',  cat:'liquid',  base:'#7FD8E8', light:'#B8EEF6', dark:'#4AA8BE', emissive:'weak', alpha:0.90, pattern:'dash' },
  STEAM:     { id: 23, cn:'水蒸气',cat:'gas',     base:'#C8D2DC', light:'#E6EDF4', dark:'#9AA6B4', emissive:'no',   alpha:0.50, anim:true },
  SMOKE:     { id: 24, cn:'烟',    cat:'gas',     base:'#444B56', light:'#5E6673', dark:'#2C313A', emissive:'no',   alpha:0.60, anim:true },
  FIRE:      { id: 25, cn:'火',    cat:'gas',     base:'#FFB020', light:'#FFD64A', dark:'#E24A0E', emissive:'strong', alpha:0.95, anim:true },
  GAS:       { id: 26, cn:'瓦斯',  cat:'gas',     base:'#CBCB78', light:'#E8E8A8', dark:'#9E9E4C', emissive:'no',   alpha:0.35, anim:true },
  CLONE:     { id: 27, cn:'克隆体',cat:'static',  base:'#C24BD8', light:'#E57FEF', dark:'#8A2BA0', emissive:'weak', alpha:1.00, anim:true },
  VIRUS:     { id: 28, cn:'病毒',  cat:'static',  base:'#EC3E6E', light:'#FF6AA0', dark:'#A81E54', emissive:'weak', alpha:1.00, anim:true, pattern:'speckle' },
  SPRING:    { id: 29, cn:'水源泉',cat:'liquid',  base:'#3FA9F5', light:'#7CC8FF', dark:'#1E6FB8', emissive:'no',   alpha:0.90, marker:true },
  TNT:       { id: 30, cn:'炸药',  cat:'static',  base:'#C0272D', light:'#E04A3A', dark:'#8A1518', emissive:'no',   alpha:1.00, pattern:'stripe' },
};
```

---

## 3. UI Color Spec

> 目标：低饱和深色界面，长时间注视不累；强调色克制使用；危险操作有明确色语义。

| Token | Hex | 用途 |
|---|---|---|
| `bgCanvas` | `#0B0F17` | 画布底色（= EMPTY） |
| `bgToolbar` | `#12161F` | 顶部/侧边工具栏底 |
| `bgPanel` | `#141824` | 面板/抽屉底色 |
| `bgPanelAlt` | `#1B2030` | 面板内的分组/次级容器 |
| `hover` | `#222A3A` | 列表项/按钮 hover 底 |
| `selected` | `#2A3852` | 选中项底（配 accent 左条） |
| `border` | `#2A3244` | 常规描边/分隔线 |
| `borderStrong` | `#3A4457` | 强调描边/聚焦框静态态 |
| `textPrimary` | `#E6EAF2` | 主文字（**非纯白**，护眼） |
| `textSecondary` | `#A6B0C0` | 次级说明/单位 |
| `textDisabled` | `#6B7688` | 禁用态 |
| `accent` | `#FFB020` | 强调色（选中工具外环、当前值） |
| `accentHover` | `#FFC44D` | 强调 hover |
| `primary` | `#2E78DE` | 主按钮填充（提交/应用） |
| `primaryHover` | `#3F8AF0` | 主按钮 hover |
| `primaryActive` | `#1D51A8` | 主按钮按下 |
| `onPrimary` | `#FFFFFF` | 主按钮文字 |
| `danger` | `#D93A2B` | 危险按钮（清空画布/重置） |
| `dangerHover` | `#F26855` | 危险 hover |
| `dangerActive` | `#9E1F14` | 危险按下 |
| `onDanger` | `#FFFFFF` | 危险按钮文字 |
| `success` | `#4AA03C` | 成功/已保存提示 |
| `warning` | `#FFB020` | 警告（复用 accent，语境区分） |
| `info` | `#3FA9F5` | 信息提示/链接 |
| `focusRing` | `#7CC8FF` | 键盘聚焦轮廓（可访问性必备） |
| `gridDot` | `#121826` | 网格辅助点 |

**使用原则**
- **强调色（amber `#FFB020`）只出现在「当前选中/当前值/焦点」**，一屏内同时出现不超过 2 处。
- **危险色（`#D93A2B`）仅用于破坏性操作**（清空、重置、删除），绝不用于普通按钮。
- 面板与画布间用 `border #2A3244` 的 1px 实线分隔，不用阴影。
- 所有颜色对比度需满足 WCAG AA（正文 ≥4.5:1，大字 ≥3:1）：`#E6EAF2` on `#141824` ≈ 12:1 ✅。

---

## 4. Accessibility

### 4.1 色盲友好方案（Colorblind-Friendly）
本作是纯色编码的模拟，**绝不能只靠颜色**传达元素身份。措施：
1. **明度优先**：所有易混组（§2.2）都用明度阶梯拉开，保证红绿色盲/蓝黄色盲也能靠明暗区分。
2. **纹样/形态编码**（可选开关「色盲友好纹样」，默认随高对比模式开启）：
   - 液体：`LN2` 水平虚线 · `ACID` 动态斑点 · 其它液体保留平滑。
   - 固体：`ICE` 十字结晶纹 · `WOOD` 竖纹理 · `TNT` 横亮带 · `GLASS` 保留对角反光暗角。
   - 粉末：`SALT` 高对比白点 · `DUST` 微斑点。
   - 气体：保持半透明+上升动势即可与固体区分。
   - `CLONE` 外扩脉冲环 · `VIRUS` 高频抖动斑点（分别用「圆环」与「尖点」形态区分，不依赖洋红/玫红）。
3. **UI 不靠颜色单独表意**：工具按钮 = 图标 + 文字标签；危险操作 = 红色 + 图标（垃圾桶/感叹号）+ 文案「清空」。

### 4.2 高对比模式（High-Contrast Mode）
- 画布底色加深为 `#000000`，网格点关闭。
- 所有元素 `base/light/dark` 抖动权重改为「极值化」：base 0.4 / light 0.3 / dark 0.3，提升单元素内部对比。
- UI 面板底 `#000000`、描边 `#FFFFFF`（2px）、主文字 `#FFFFFF`、次级 `#D6DCE6`。
- 聚焦轮廓加粗为 2px `#FFFF00`。
- 开关位置：设置面板，遵循 `prefers-contrast: more` 自动开启。

### 4.3 触控与点击尺寸（Target Size）
- **最小可点击区域 44×44 CSS px**（WCAG 2.5.5 / 移动端触摸）。
- **桌面鼠标最小 32×32 px**；工具栏按钮推荐 **40×40 px**（图标 24px + 内边距）。
- 相邻可点元素间距 ≥ 8px，防止误触（尤其「清空」与「暂停」不相邻）。
- 笔刷在画布上的拖拽不设最小限制（画布本身就是目标），但工具栏选择器按钮须达标。

### 4.4 字号与可达性
- **UI 字号下限 12px**（仅限非关键徽标），**正文/标签 ≥ 13px**，正文推荐 14px。
- 支持浏览器缩放至 200% 不破版；布局用相对单位。
- 键盘可达：全部工具可 Tab 聚焦、Enter/Space 激活；画布支持键盘光标。
- 提供「减少动效」开关，尊重 `prefers-reduced-motion`（见 §2.3 第 5 条）。

---

## 5. Typography

### 5.1 字体栈（中/英/日 三语回退）
```js
export const FONT = {
  // UI / 正文：先拉丁，再中文，再日文；覆盖 Win / macOS / Android
  ui: [
    'system-ui', '-apple-system', '"Segoe UI"', 'Roboto', '"Helvetica Neue"', 'Arial',
    '"PingFang SC"', '"Microsoft YaHei"', '"Hiragino Sans GB"',
    '"Hiragino Kaku Gothic ProN"', '"Yu Gothic"', 'Meiryo',
    '"Noto Sans SC"', '"Noto Sans JP"', '"Source Han Sans SC"',
    'sans-serif'
  ].join(', '),
  // 等宽：调试面板 / 坐标 / FPS
  mono: 'ui-monospace, "SFMono-Regular", Consolas, "Liberation Mono", Menlo, "Courier New", monospace',
};
```
- 该栈保证**中文汉字**（PingFang SC / 微软雅黑 / 思源黑体）与**日文假名/汉字**（Hiragino Kaku Gothic / Yu Gothic / Meiryo / Noto Sans JP）在 Windows / macOS / Android 上都能正常渲染，且拉丁字母优先走系统 UI 字体（更精致）。
- **不使用像素字体做正文字体**（可读性差）。若品牌需要，仅允许标题/Logo 使用像素字体（如 `"Press Start 2P"`），且仅英文大写短标题。

### 5.2 字号层级（Font Scale）
| Layer | size / line-height | weight | 用途 |
|---|---|---|---|
| H1 标题 | 22px / 1.3 | 700 | 弹窗标题、Logo 区 |
| H2 小节 | 16px / 1.35 | 600 | 面板分组标题 |
| Body | 14px / 1.5 | 400 | 正文、说明 |
| UI Label | 13px / 1.4 | 500 | 按钮、标签、工具名 |
| Caption | 12px / 1.4 | 400 | 单位、辅助说明（**下限**） |
| Mono | 12px / 1.5 | 400 | FPS / 坐标 / 调试 |

- 行高 ≥ 1.4；段间距取字号 ×0.75。
- 数字（FPS、粒子数、坐标）用等宽字体避免跳动。

---

## 6. Icon & Tool Visual Spec

### 6.1 图标风格
- **线条线性图标**：描边 ≥ 2 设备像素（在 24×24 基准网格上），**对齐像素网格**，**关闭抗锯齿**（图标也走 `image-rendering: pixelated`），保证像素清晰。
- **基准网格 24×24**，仅使用 2 的倍数路径（像素对齐）；高分屏导出 24/48 两套。禁止 45° 斜线（会产生锯齿），需要斜线时用像素阶梯近似。
- **配色**：默认单色（取 `textSecondary #A6B0C0`），hover → `textPrimary #E6EAF2`，选中 → `accent #FFB020` 描边 + `selected` 底。危险图标（清空）→ `danger #D93A2B`。
- 图标必须**配文字标签**（可访问性，见 §4.1），不单独依赖图形。

### 6.2 画笔光标（Brush Cursor）
- **尺寸 1（单格）**：以 1 设备像素十字准星绘制，采用**双色描边**（外圈 `#000000` 1px + 内圈 `#FFFFFF` 1px），确保在浅色与深色元素上都可见。
- **尺寸 > 1**：以 1px 描边绘制正方形轮廓（边长 = 笔刷格数 × 缩放倍率），同样双色描边；轮廓内部以所选元素 `base` 色的 **50% alpha** 填充预览。
- **橡皮擦**：轮廓同形，但改用 `danger #D93A2B` 描边 + 内部对角斜杠，明确「擦除」语义。
- **吸管/取色工具**：以 1px 准星 + 右下角小色块（当前取到的元素色）表示。
- 光标跟随须**吸附到格心**（cursor 落在格内即预览该格），不出现半格偏移。

### 6.3 工具栏布局建议
- 分组：**[笔刷类] · [元素调色板] · [模拟控制（暂停/单步/复位）] · [设置]**。
- 元素调色板用**网格按钮**，每格 = 元素色块 + 图标占位 + Tooltip 显示中英文名；选中外环 `accent`。
- 危险操作（清空画布）放在最右，与其它按钮间距 ≥ 16px，配色 `danger`。

---

## 7. Design Principles (Do / Don't)

### ✅ Do
- **Do** 让元素成为唯一主角：UI 低饱和、低对比、深色，永远不抢画布视觉焦点。
- **Do** 用「base/light/dark 三档确定性抖动」制造颗粒质感——这是本项目最核心的视觉手法。
- **Do** 用**明度阶梯 + 纹样**区分易混元素，保证色盲用户可读。
- **Do** 自发光只留给能量/危险/特殊元素，且用加法混合的柔光，克制使用。
- **Do** 整数倍缩放 + 最近邻，保证每个格子边缘锐利、大小均匀。
- **Do** 所有颜色写进常量表（§2.5 / §3），实现直接引用，不散落魔法值。
- **Do** 图标线性、2px、像素对齐、配文字标签、可键盘聚焦。
- **Do** 保证 WCAG AA 对比度与 44px 最小点击尺寸。

### ❌ Don't
- **Don't** 使用纯黑 `#000000` 画布（默认态）或纯白 `#FFFFFF` 正文——刺眼、易疲劳。
- **Don't** 使用抗锯齿、渐变、阴影、圆角软描边——破坏像素调性。
- **Don't** 用非整数倍缩放（1.5×/1.7×），会出现像素块大小不一的摩尔纹。
- **Don't** 让整帧随机抖动——抖动必须由 `(x,y,元素)` 确定性哈希决定，否则画面噪点闪烁。
- **Don't** 每秒闪烁超过 5Hz，或让动画元素全屏高频闪烁（光敏风险）。
- **Don't** 让 UI 面板使用高饱和色块，或让强调色在一屏出现多处。
- **Don't** 只靠颜色区分元素/状态——必须叠加形态、纹样或文字。
- **Don't** 让「清空/重置」等危险按钮与常用按钮相邻或使用同色。
- **Don't** 引入糖果色、霓虹渐变、拟物化装饰——偏离「冷科学实验室沙盘」调性。

---

## 附：待用户拍板项（Open Questions）
1. **调性方向**：确认「冷科学实验室沙盘」调性是否采纳，或希望更偏「复古像素街机」（影响是否引入像素字体 Logo）。
2. **默认放大倍率**：默认 `4×（1280×720）` vs `6×（1080p 满屏）`——建议默认「适应窗口取最大整数倍」。
3. **色盲纹样是否默认开启**：建议默认关闭、随高对比模式自动开启；亦可默认开启以更友好。
4. **元素色可选备选**：`VIRUS` 玫红 `#EC3E6E` 与 `CLONE` 洋红 `#C24BD8` 属粉紫色系，如用户更习惯「病毒=病态绿」，可提供备选（需重新拉开与 `ACID/PLANT` 的距离）。
5. **`GAS` 透明度**：默认 `0.35` 近乎看不见（真实瓦斯特性）——是否需要更明显以便游戏操作？

---

*本规范由美术总监 林绘澄（Lin Wayson）产出。任何偏离须显式标注并回传评审。技术实现若与 Canvas2D / 渲染管线能力冲突，请经主理人与程基岩（技术实现）核对。*

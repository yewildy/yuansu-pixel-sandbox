# Yuansu Pixel Sandbox · 元素像素游戏

> 一个打开网页就能玩的**落沙物理沙盒**。撒下沙子、倒进岩浆、点着一片森林 —— 31 种元素按一套**写得明明白白的物理规则**自己演化。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Play Online](https://img.shields.io/badge/Play-Online-success.svg)](https://yewildy.github.io/yuansu-pixel-sandbox/)

**[▶ 在线试玩](https://yewildy.github.io/yuansu-pixel-sandbox/)** · 无需安装、无需登录、零依赖

---

## 这是什么

同类游戏（比如经典的 *Powder Game*）最好玩的地方是"自己试出规则"，最难受的地方也是**规则不透明** —— 为什么水没变成蒸汽？为什么种子没发芽？没人告诉你。

这个项目想解决的就是这件事：**每条交互规则都写进文档、也做进游戏内的元素图鉴**。你随时能查到"水的蒸发速率与温度的关系表""种子发芽需要什么条件"，而不是靠玄学试。

---

## 特性

- **真物理，不是特效** —— 温度场驱动的相变（水↔汽↔冰）、密度驱动的沉浮（油浮水、沙沉底）、连锁燃烧、爆炸引信
- **中文优先** —— 简体中文是第一语言，不是翻译；另附完整 English / 日本語
- **60 FPS，320×180 网格** —— TypedArray + `ImageData` 直写像素，帧预算 10 ms
- **零依赖、零构建** —— 双击 `index.html` 就能玩；也能直接挂 GitHub Pages
- **可复现** —— 自带种子的确定性随机数，同一存档 + 同一种子 = 同一场演化
- **可存档** —— localStorage 自动保存，也能导出/导入 JSON

---

## 怎么玩

| 操作 | 功能 |
|---|---|
| 左键拖拽 | 绘制当前元素 |
| 右键拖拽 | 擦除 |
| 滚轮 | 调整画笔大小（1–12） |
| 空格 | 播放 / 暂停 |
| `1`–`9` | 快速切换常用元素 |
| 悬停 | 查看该格的元素名与温度 |
| 底部罗盘 | 设定全局风向与强度 |

### 几个值得先试的组合

1. **岩浆淬水** —— 倒一池水，再从上方倒岩浆。水会瞬间翻滚成蒸汽，岩浆冷成岩石。
2. **燎原** —— 种一排植物，从底部点火，看着火沿着枝叶往上爬。
3. **种田** —— 铺一层土壤，浇水，撒种子。约 1.5 秒后发芽，之后向上生长（但离水太远就停止）。
4. **粉尘爆炸** —— 在密闭空间铺满瓦斯，点火。
5. **造雨** —— 让风把蒸汽吹到画布上方放冰的区域，看它冷凝成水落下来。

---

## 元素表（30 种）

| 类别 | 元素 |
|---|---|
| **固体 / 静态** | 墙 · 岩石 · 玻璃 · 金属 · 冰 · 木材 · 煤 |
| **粉末** | 沙 · 土壤 · 盐 · 尘埃 · 雪 · 灰烬 · 火药 · 种子 |
| **液体** | 水 · 油 · 岩浆 · 强酸 · 液氮 |
| **气体** | 水蒸气 · 烟 · 火 · 瓦斯 |
| **特殊** | 植物 · 克隆体 · 病毒 · 水源泉 · TNT |

---

## 物理规则（摘要）

完整的数值规范在 **[`docs/PHYSICS.md`](docs/PHYSICS.md)**，这里只列几条最有感的：

### 水火关系

| 现象 | 规则 |
|---|---|
| 水灭火 | 火一碰到水就熄（水是天然防火墙） |
| 火煮水 | 热量逐格传导；水的比热最大（以水为 1.00 归一化），所以**升温很慢** —— 一桶水真能压住一堆火 |
| 水变汽 | **低于 100 °C 不蒸发**；100 °C 起按概率汽化，温度越高越快 |

### 水多久变蒸汽？与温度的关系

`p` = 每 tick 的汽化概率（60 tick/秒）：

| 水温 | 100 °C | 120 °C | 150 °C | 200 °C | 300 °C | ≥600 °C |
|---|---|---|---|---|---|---|
| 平均耗时 | ~0.83 s | ~0.42 s | ~0.24 s | ~0.14 s | ~0.08 s | ~0.03 s |

> **规律**：100 °C 附近会"犹豫"约 0.8 秒，之后**温度越高驱逐越暴力**，到 600 °C 封顶（每 2 tick 走一格）。

### 植物发芽条件

三个条件**同时**满足，并持续 90 tick（1.5 秒）：

1. **湿度** —— 8 邻域内有水（或土壤）；
2. **温度** —— 5–40 °C（高于 60 °C 直接热死）；
3. **暴露** —— 上方 2 格内有空气或水（没被深埋）。

发芽后向上生长，但需要 5 格内有水 —— 所以植物**自然会长到一定高度就停**。

### 气流

- 全局风矢量（方向 + 强度 0–1），可用底部罗盘或风工具设定；
- 蒸汽 / 烟 / 瓦斯全额受风；雪 / 尘 / 种子仅在**悬空**时受风；
- 热对流用"气体浮力"表达：热的猛升、冷的缓升、冷却后几乎不升（于是落下）。

---

## 项目结构

```
index.html              入口（classic script 顺序加载，无构建）
style.css
src/
  core/                 纯逻辑，零 DOM，可在 Node 下跑单测
    balance.js          全部可调参数
    elements.js         31 种元素属性
    rng.js              确定性随机数
    grid.js             网格与内存布局
    thermal.js          导热 / 弛豫 / 潜热平台
    transitions.js      相变表
    reactions.js        反应表（含爆炸）
    movement.js         粉末 / 液体 / 气体移动
    biology.js          种子 / 植物 / 病毒
    wind.js             风场与对流
    engine.js           tick 编排与守恒校验
  render/               渲染（Canvas2D + ImageData）
  ui/                   界面、i18n、存档、图鉴
tests/run.js            Node 单元测试（守恒 / 相变 / 确定性）
docs/                   设计文档、物理规范、美术规范、审查记录、ADR
```

---

## 本地运行

```bash
# 方式一：直接双击 index.html（确实是能跑的，因为没用 ES Module）

# 方式二：起个静态服务器
python -m http.server 8080
# 然后打开 http://localhost:8080
```

## 跑测试

```bash
node tests/run.js
```

---

## 多语言

| 语言 | 代码 | 状态 |
|---|---|---|
| 简体中文 | `zh-CN` | ✅ 默认 · 最完整 |
| English | `en` | ✅ 完整 |
| 日本語 | `ja` | ✅ 完整 |

切换方式：右上角语言选择器，或在 URL 后加 `?lang=zh-CN` / `?lang=en` / `?lang=ja`。

---

## 路线图

- [x] 核心落沙引擎（powder / liquid / gas）
- [x] 温度场与相变
- [x] 燃烧与爆炸
- [x] 植物生态
- [x] 风场
- [x] 中 / 英 / 日三语
- [x] 存档与读取
- [ ] 电路与逻辑门
- [ ] 蚂蚁 / 鸟等生物
- [ ] 自定义元素与规则编辑器
- [ ] WebGL 渲染后端、Web Worker 并行仿真

---

## 文档

| 文档 | 内容 |
|---|---|
| [`docs/DESIGN.md`](docs/DESIGN.md) | 游戏设计：支柱、MDA、范围分层、UX |
| [`docs/PHYSICS.md`](docs/PHYSICS.md) | **物理规范**：30 元素全属性、相变概率、反应表、守恒 |
| [`docs/DESIGN-REVIEW.md`](docs/DESIGN-REVIEW.md) | 设计审查记录：自己试玩找出的 6 个缺陷与修法 |
| [`docs/ART.md`](docs/ART.md) | 美术规范：元素配色、UI 配色、可访问性 |

---

## English

**Yuansu Pixel Sandbox** ("Element Pixel Game") is a browser-based falling-sand physics sandbox. 31 elements interact under an explicitly documented physics model — temperature-driven phase changes, density-driven stratification, chain combustion, and wind.

- No install, no build, no dependencies. Open `index.html` and play.
- Languages: 简体中文 (default) · English · 日本語
- The full numeric physics spec lives in [`docs/PHYSICS.md`](docs/PHYSICS.md).

---

## License

[MIT](LICENSE) © 2026 yewildy

<!-- v1.0.0 · 2026-09-30 · 文档与玩法说明定稿 -->

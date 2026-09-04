/* zh-CN.js — 简体中文（默认语言，最完整） */
(function (root) {
  'use strict';
  var I18N = root.YS.I18N;
  I18N.register('zh-CN', {
    'lang.zh-CN': '中文', 'lang.en': 'EN', 'lang.ja': '日本語',

    'title': '元素像素沙盒',
    'subtitle': '一页标签页里的物理实验室',

    'ui.play': '播放', 'ui.pause': '暂停', 'ui.step': '单步', 'ui.clear': '清空',
    'ui.resetWind': '复位风', 'ui.wind': '风力', 'ui.brushSize': '画笔大小',
    'ui.eraser': '橡皮擦', 'ui.eyedropper': '吸管', 'ui.brush': '画笔',
    'ui.save': '存档', 'ui.load': '读档', 'ui.exportPng': '导出 PNG',
    'ui.exportJson': '导出 JSON', 'ui.import': '导入 JSON',
    'ui.language': '语言', 'ui.help': '图鉴与规则', 'ui.close': '关闭',
    'ui.settings': '设置', 'ui.fps': '帧率', 'ui.cells': '粒子数',
    'ui.windStrength': '风强度', 'ui.windDirection': '风向',
    'ui.tool': '工具', 'ui.element': '元素', 'ui.category': '类别',
    'ui.slot': '存档位', 'ui.slotN': '存档位 {n}', 'ui.empty': '空',
    'ui.confirmClear': '确定清空整个画布？',
    'ui.saved': '已存档', 'ui.loaded': '已读档', 'ui.importFail': '导入失败：文件格式不正确',
    'ui.heatmap': '热力图', 'ui.gridLines': '网格线', 'ui.highContrast': '高对比',
    'ui.reducedMotion': '减少动效', 'ui.glow': '自发光光晕',
    'ui.tempLabel': '温度', 'ui.paused': '已暂停', 'ui.running': '运行中',
    'ui.hoverHint': '悬停查看格坐标与温度', 'ui.toolbar': '工具栏',

    'dir.none': '无风', 'dir.N': '北', 'dir.NE': '东北', 'dir.E': '东', 'dir.SE': '东南',
    'dir.S': '南', 'dir.SW': '西南', 'dir.W': '西', 'dir.NW': '西北',

    'cat.solid': '固体', 'cat.powder': '粉末', 'cat.liquid': '液体',
    'cat.gas': '气体', 'cat.special': '特殊',

    'tip.brush': '左键绘制，右键擦除',
    'tip.eraser': '拖拽清除为空白',
    'tip.eyedropper': '单击取色为当前元素',
    'tip.wind': '拖拽定义风向与强度，或点罗盘',
    'tip.pause': '空格切换播放/暂停',
    'tip.step': '暂停时推进 1 tick',
    'tip.clear': '清空画布并复位温度（危险）',
    'tip.save': '保存到浏览器本地存储',
    'tip.load': '从本地存储读取',
    'tip.slider': '滚轮或滑杆调整画笔半径（1–12）',

    'help.title': '元素图鉴 & 规则速查',
    'help.intro': '在 320×180 的像素沙盘上倾倒元素，观察它们遵循可预测的物理规则自行反应、燃烧、流动、生长。',
    'help.basicsTitle': '基本操作',
    'help.basic1': '左键绘制 / 右键擦除；滚轮调画笔半径（1–12）；空格暂停；1–9 快捷选元素；悬停显示坐标与温度。',
    'help.basic2': '底部控制：播放/暂停/单步/清屏；风力罗盘 + 强度滑杆；画笔大小滑杆。',
    'help.rulesTitle': '核心规则',
    'help.rule1': '水灭火：火邻接水立即熄灭（变烟），水吸热升温。',
    'help.rule2': '火煮水：水到 100°C 开始沸腾变蒸汽，蒸汽遇冷又冷凝成水（成雨）。',
    'help.rule3': '岩浆淬水：岩浆遇水立刻凝固成石并激起蒸汽（最剧烈的水火交互）。',
    'help.rule4': '种子发芽：给种子水或土壤、保持 5–40°C、别埋太深，约 1.8 秒后发芽。',
    'help.rule5': '风：全局风推动气体与轻质粉末；热空气柱（>200°C）制造上升烟柱。',
    'help.rule6': '克隆体每 4 tick 复制相邻元素；水源泉每 6 tick 产出水（均受配额限制）。',
    'help.elementsTitle': '元素一览',
    'help.closeBtn': '知道了',

    'el.EMPTY': '空', 'el.WALL': '墙', 'el.STONE': '岩石', 'el.GLASS': '玻璃',
    'el.METAL': '金属', 'el.ICE': '冰', 'el.WOOD': '木材', 'el.PLANT': '植物',
    'el.SAND': '沙', 'el.SOIL': '土壤', 'el.SALT': '盐', 'el.DUST': '尘埃',
    'el.SNOW': '雪', 'el.ASH': '灰烬', 'el.COAL': '煤', 'el.GUNPOWDER': '火药',
    'el.SEED': '种子', 'el.WATER': '水', 'el.OIL': '油', 'el.LAVA': '岩浆',
    'el.ACID': '强酸', 'el.LN2': '液氮', 'el.STEAM': '水蒸气', 'el.SMOKE': '烟',
    'el.FIRE': '火', 'el.GAS': '瓦斯', 'el.CLONE': '克隆体', 'el.VIRUS': '病毒',
    'el.SPRING': '水源泉', 'el.TNT': '炸药'
  });
  if (typeof module === 'object' && module.exports) module.exports = I18N.DICTS['zh-CN'];
})(typeof globalThis !== 'undefined' ? globalThis : this);

/* ja.js — 日本語 */
(function (root) {
  'use strict';
  var I18N = root.YS.I18N;
  I18N.register('ja', {
    'lang.zh-CN': '中文', 'lang.en': 'EN', 'lang.ja': '日本語',

    'title': '元素ピクセルサンドボックス',
    'subtitle': 'ブラウザのタブの中の物理実験室',

    'ui.play': '再生', 'ui.pause': '一時停止', 'ui.step': '1ステップ', 'ui.clear': 'クリア',
    'ui.resetWind': '風リセット', 'ui.wind': '風', 'ui.brushSize': 'ブラシサイズ',
    'ui.eraser': '消しゴム', 'ui.eyedropper': 'スポイト', 'ui.brush': 'ブラシ',
    'ui.save': '保存', 'ui.load': '読込', 'ui.exportPng': 'PNG 書き出し',
    'ui.exportJson': 'JSON 書き出し', 'ui.import': 'JSON 読込',
    'ui.language': '言語', 'ui.help': '図鑑とルール', 'ui.close': '閉じる',
    'ui.settings': '設定', 'ui.fps': 'FPS', 'ui.cells': '粒子数',
    'ui.windStrength': '風の強さ', 'ui.windDirection': '風向き',
    'ui.tool': 'ツール', 'ui.element': '元素', 'ui.category': '分類',
    'ui.slot': 'スロット', 'ui.slotN': 'スロット {n}', 'ui.empty': '空',
    'ui.confirmClear': 'キャンバスを全部消しますか？',
    'ui.saved': '保存しました', 'ui.loaded': '読み込みました', 'ui.importFail': '読込失敗：形式が正しくありません',
    'ui.heatmap': 'ヒートマップ', 'ui.gridLines': 'グリッド', 'ui.highContrast': '高コントラスト',
    'ui.reducedMotion': 'アニメ低減', 'ui.glow': '発光グロー',
    'ui.tempLabel': '温度', 'ui.paused': '一時停止中', 'ui.running': '動作中',
    'ui.hoverHint': 'カーソルで座標と温度を表示', 'ui.toolbar': 'ツールバー',

    'dir.none': '無風', 'dir.N': '北', 'dir.NE': '北東', 'dir.E': '東', 'dir.SE': '南東',
    'dir.S': '南', 'dir.SW': '南西', 'dir.W': '西', 'dir.NW': '北西',

    'cat.solid': '固体', 'cat.powder': '粉末', 'cat.liquid': '液体',
    'cat.gas': '気体', 'cat.special': '特殊',

    'tip.brush': '左ドラッグで描画、右ドラッグで消去',
    'tip.eraser': 'ドラッグで空白に消去',
    'tip.eyedropper': 'クリックでその元素を取得',
    'tip.wind': 'キャンバスでドラッグして風を設定、またはコンパス',
    'tip.pause': 'スペースで再生/一時停止',
    'tip.step': '一時停止中に 1 tick 進める',
    'tip.clear': 'キャンバスを消去して温度をリセット（危険）',
    'tip.save': 'ブラウザに保存',
    'tip.load': 'ブラウザから読込',
    'tip.slider': 'ホイールまたはスライダーでブラシ半径（1–12）',

    'help.title': '元素図鑑とルール早見',
    'help.intro': '320×180 のピクセル砂盤に元素を注ぎ、予測可能な物理ルールで反応・燃焼・流動・成長する様子を観察します。',
    'help.basicsTitle': '基本操作',
    'help.basic1': '左ドラッグ描画 / 右ドラッグ消去；ホイールでブラシ半径（1–12）；スペースで一時停止；1–9 で元素選択；カーソルで座標と温度。',
    'help.basic2': '下部バー：再生/一時停止/ステップ/クリア；風コンパス＋強さスライダー；ブラシサイズスライダー。',
    'help.rulesTitle': '主要ルール',
    'help.rule1': '水は火を消す：火が水に隣接すると即座に煙になり、水は熱を吸収。',
    'help.rule2': '火は水を沸かす：100°C で水は蒸気に；冷えた蒸気は再び水に凝結（雨）。',
    'help.rule3': '溶岩と水：溶岩は即座に石へ凝固し、水は蒸気に変わる（最も激しい水火反応）。',
    'help.rule4': '種の発芽：水か土を与え、5–40°C を保ち、深く埋めなければ約 1.8 秒で発芽。',
    'help.rule5': '風：全体の風が気体と軽い粉末を流す；高温の空気柱（>200°C）が上昇気流を作る。',
    'help.rule6': 'クローンは 4 tick ごとに隣を複製；水源は 6 tick ごとに水を出す（いずれも上限あり）。',
    'help.rule7': '永燃の火種：消えない熱源。周囲の可燃物を燃やし続け、水でも消えない。',
    'help.elementsTitle': '元素一覧',
    'help.closeBtn': '了解',

    'el.AIR': '空気', 'el.EMPTY': '空', 'el.WALL': '壁', 'el.STONE': '岩', 'el.GLASS': 'ガラス',
    'el.METAL': '金属', 'el.ICE': '氷', 'el.WOOD': '木材', 'el.PLANT': '植物',
    'el.SAND': '砂', 'el.SOIL': '土', 'el.SALT': '塩', 'el.DUST': 'ほこり',
    'el.SNOW': '雪', 'el.ASH': '灰', 'el.COAL': '石炭', 'el.GUNPOWDER': '火薬',
    'el.SEED': '種', 'el.WATER': '水', 'el.OIL': '油', 'el.LAVA': '溶岩',
    'el.ACID': '酸', 'el.LN2': '液体窒素', 'el.STEAM': '蒸気', 'el.SMOKE': '煙',
    'el.FIRE': '火', 'el.GAS': 'メタンガス', 'el.CLONE': 'クローン', 'el.VIRUS': 'ウイルス',
    'el.SPRING': '水源', 'el.TNT': '爆薬', 'el.EMBER': '永燃の火種'
  });
  if (typeof module === 'object' && module.exports) module.exports = I18N.DICTS['ja'];
})(typeof globalThis !== 'undefined' ? globalThis : this);

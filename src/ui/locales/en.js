/* en.js — English */
(function (root) {
  'use strict';
  var I18N = root.YS.I18N;
  I18N.register('en', {
    'lang.zh-CN': '中文', 'lang.en': 'EN', 'lang.ja': '日本語',

    'title': 'Yuansu Pixel Sandbox',
    'subtitle': 'A physics lab in a browser tab',

    'ui.play': 'Play', 'ui.pause': 'Pause', 'ui.step': 'Step', 'ui.clear': 'Clear',
    'ui.resetWind': 'Reset Wind', 'ui.wind': 'Wind', 'ui.brushSize': 'Brush Size',
    'ui.eraser': 'Eraser', 'ui.eyedropper': 'Eyedropper', 'ui.brush': 'Brush',
    'ui.save': 'Save', 'ui.load': 'Load', 'ui.exportPng': 'Export PNG',
    'ui.exportJson': 'Export JSON', 'ui.import': 'Import JSON',
    'ui.language': 'Language', 'ui.help': 'Codex & Rules', 'ui.close': 'Close',
    'ui.settings': 'Settings', 'ui.fps': 'FPS', 'ui.cells': 'Particles',
    'ui.windStrength': 'Wind Strength', 'ui.windDirection': 'Wind Direction',
    'ui.tool': 'Tool', 'ui.element': 'Element', 'ui.category': 'Category',
    'ui.slot': 'Slot', 'ui.slotN': 'Slot {n}', 'ui.empty': 'Empty',
    'ui.confirmClear': 'Clear the whole canvas?',
    'ui.saved': 'Saved', 'ui.loaded': 'Loaded', 'ui.importFail': 'Import failed: bad file format',
    'ui.heatmap': 'Heatmap', 'ui.gridLines': 'Grid', 'ui.highContrast': 'High Contrast',
    'ui.reducedMotion': 'Reduce Motion', 'ui.glow': 'Emissive Glow',
    'ui.tempLabel': 'Temp', 'ui.paused': 'Paused', 'ui.running': 'Running',
    'ui.hoverHint': 'Hover to read cell coords & temperature', 'ui.toolbar': 'Toolbar',

    'dir.none': 'No wind', 'dir.N': 'N', 'dir.NE': 'NE', 'dir.E': 'E', 'dir.SE': 'SE',
    'dir.S': 'S', 'dir.SW': 'SW', 'dir.W': 'W', 'dir.NW': 'NW',

    'cat.solid': 'Solid', 'cat.powder': 'Powder', 'cat.liquid': 'Liquid',
    'cat.gas': 'Gas', 'cat.special': 'Special',

    'tip.brush': 'Left-drag to paint, right-drag to erase',
    'tip.eraser': 'Drag to erase to empty',
    'tip.eyedropper': 'Click to pick the cell element',
    'tip.wind': 'Drag on canvas to set wind, or tap the compass',
    'tip.pause': 'Space toggles play/pause',
    'tip.step': 'Advance 1 tick while paused',
    'tip.clear': 'Clear canvas and reset temperature (danger)',
    'tip.save': 'Save to browser local storage',
    'tip.load': 'Load from local storage',
    'tip.slider': 'Wheel or slider adjusts brush radius (1–12)',

    'help.title': 'Element Codex & Quick Rules',
    'help.intro': 'Pour elements onto a 320×180 pixel tray and watch them react, burn, flow and grow by predictable physics rules.',
    'help.basicsTitle': 'Basics',
    'help.basic1': 'Left-drag paints / right-drag erases; wheel changes brush radius (1–12); Space pauses; 1–9 select elements; hover reads coords & temp.',
    'help.basic2': 'Bottom bar: play/pause/step/clear; wind compass + strength slider; brush-size slider.',
    'help.rulesTitle': 'Core Rules',
    'help.rule1': 'Water puts out fire: fire next to water turns to smoke instantly; water absorbs heat.',
    'help.rule2': 'Fire boils water: at 100°C water boils into steam; cooling steam condenses back into rain.',
    'help.rule3': 'Lava quenched by water: lava instantly solidifies to stone and flashes water to steam.',
    'help.rule4': 'Seed germination: give it water or soil, keep 5–40°C, don’t bury it deep — sprouts in ~1.8s.',
    'help.rule5': 'Wind: global wind advects gases and light powders; hot air columns (>200°C) drive updrafts.',
    'help.rule6': 'Clone copies a neighbour every 4 ticks; Spring emits water every 6 ticks (both quota-capped).',
    'help.elementsTitle': 'All Elements',
    'help.closeBtn': 'Got it',

    'el.AIR': 'Air', 'el.EMPTY': 'Empty', 'el.WALL': 'Wall', 'el.STONE': 'Stone', 'el.GLASS': 'Glass',
    'el.METAL': 'Metal', 'el.ICE': 'Ice', 'el.WOOD': 'Wood', 'el.PLANT': 'Plant',
    'el.SAND': 'Sand', 'el.SOIL': 'Soil', 'el.SALT': 'Salt', 'el.DUST': 'Dust',
    'el.SNOW': 'Snow', 'el.ASH': 'Ash', 'el.COAL': 'Coal', 'el.GUNPOWDER': 'Gunpowder',
    'el.SEED': 'Seed', 'el.WATER': 'Water', 'el.OIL': 'Oil', 'el.LAVA': 'Lava',
    'el.ACID': 'Acid', 'el.LN2': 'Liquid Nitrogen', 'el.STEAM': 'Steam', 'el.SMOKE': 'Smoke',
    'el.FIRE': 'Fire', 'el.GAS': 'Gas', 'el.CLONE': 'Clone', 'el.VIRUS': 'Virus',
    'el.SPRING': 'Spring', 'el.TNT': 'TNT'
  });
  if (typeof module === 'object' && module.exports) module.exports = I18N.DICTS['en'];
})(typeof globalThis !== 'undefined' ? globalThis : this);

/*
 * help.js — 元素图鉴 + 规则速查（docs/DESIGN.md §8、docs/PHYSICS.md §12）
 *   依赖 DOM 与 YS.I18N。
 */
(function (root) {
  'use strict';

  var Elements = root.YS.Elements;
  var I18N = root.YS.I18N;
  var ELS = Elements.ELEMENTS;

  var overlay = null;

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function build(app) {
    overlay = el('div', 'modal-overlay');
    var modal = el('div', 'modal');
    overlay.appendChild(modal);

    var head = el('div', 'modal-head');
    var h = el('h1'); h.setAttribute('data-i18n', 'help.title');
    var close = el('button', 'modal-close', '×');
    close.setAttribute('type', 'button');
    close.setAttribute('data-i18n-title', 'ui.close');
    close.addEventListener('click', closeModal);
    head.appendChild(h); head.appendChild(close);
    modal.appendChild(head);

    var body = el('div', 'modal-body');

    var intro = el('p', 'modal-intro'); intro.setAttribute('data-i18n', 'help.intro');
    body.appendChild(intro);

    var basicsTitle = el('h2'); basicsTitle.setAttribute('data-i18n', 'help.basicsTitle');
    body.appendChild(basicsTitle);
    ['help.basic1', 'help.basic2'].forEach(function (k) {
      var p = el('p'); p.setAttribute('data-i18n', k); body.appendChild(p);
    });

    var rulesTitle = el('h2'); rulesTitle.setAttribute('data-i18n', 'help.rulesTitle');
    body.appendChild(rulesTitle);
    var ul = el('ul', 'rules-list');
    /* v1.4.0：rules 列表新增 help.rule7（永燃火种 EMBER） */
    ['help.rule1', 'help.rule2', 'help.rule3', 'help.rule4', 'help.rule5', 'help.rule6', 'help.rule7'].forEach(function (k) {
      var li = el('li'); li.setAttribute('data-i18n', k); ul.appendChild(li);
    });
    body.appendChild(ul);

    var elTitle = el('h2'); elTitle.setAttribute('data-i18n', 'help.elementsTitle');
    body.appendChild(elTitle);
    var grid = el('div', 'codex-grid');
    Elements.LIST.forEach(function (e) {
      var card = el('div', 'codex-card');
      var sw = el('span', 'el-swatch'); sw.style.background = e.base;
      var name = el('div', 'codex-name');
      var cn = el('span', 'codex-cn'); cn.setAttribute('data-elname', e.key);
      var en = el('span', 'codex-en', e.key);
      name.appendChild(cn); name.appendChild(en);
      var meta = el('div', 'codex-meta');
      var cat = el('span', 'codex-cat'); cat.setAttribute('data-i18n', 'cat.' + e.cat);
      meta.appendChild(cat);
      card.appendChild(sw); card.appendChild(name); card.appendChild(meta);
      grid.appendChild(card);
    });
    body.appendChild(grid);

    modal.appendChild(body);
    var foot = el('div', 'modal-foot');
    var ok = el('button', 'primary-btn'); ok.setAttribute('data-i18n', 'help.closeBtn');
    ok.addEventListener('click', closeModal);
    foot.appendChild(ok);
    modal.appendChild(foot);
  }

  function open(app) {
    if (!overlay) build(app);
    I18N.applyToDOM(overlay);
    var nodes = overlay.querySelectorAll('[data-elname]');
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].textContent = I18N.t('el.' + nodes[i].getAttribute('data-elname'));
    }
    document.body.appendChild(overlay);
    overlay.classList.add('show');
  }

  function closeModal() {
    if (overlay) { overlay.classList.remove('show'); if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }
  }

  var api = { open: open, close: closeModal };
  root.YS.Help = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

/*
 * i18n.js — 轻量多语言框架（docs/DESIGN.md §10）
 *   优先级：URL ?lang= > localStorage 记忆 > navigator.language > 默认 zh-CN
 *   零依赖；切换语言不刷新（遍历 data-i18n 节点重写文本）。
 *   浏览器路径使用；Node 下 require 仅用于读取字典/自测（无 DOM）。
 */
(function (root) {
  'use strict';

  var DICTS = {};
  var SUPPORTED = ['zh-CN', 'en', 'ja'];
  var DEFAULT = 'zh-CN';
  var lang = DEFAULT;
  var listeners = [];
  var LS_KEY = 'yuansu.lang';

  function register(l, dict) {
    DICTS[l] = dict;
  }

  function has(l) { return !!DICTS[l]; }

  function normalize(tag) {
    if (!tag) return null;
    tag = String(tag);
    if (DICTS[tag]) return tag;
    var low = tag.toLowerCase();
    if (low.indexOf('zh') === 0) return 'zh-CN';
    if (low.indexOf('ja') === 0) return 'ja';
    if (low.indexOf('en') === 0) return 'en';
    return null;
  }

  function detect() {
    var picked = null;
    try {
      if (typeof location !== 'undefined' && location.search) {
        var m = /[?&]lang=([^&]+)/.exec(location.search);
        if (m) picked = normalize(decodeURIComponent(m[1]));
      }
    } catch (e) { /* ignore */ }
    if (!picked) {
      try {
        if (typeof localStorage !== 'undefined') {
          picked = normalize(localStorage.getItem(LS_KEY));
        }
      } catch (e2) { /* ignore */ }
    }
    if (!picked && typeof navigator !== 'undefined') {
      picked = normalize(navigator.language || (navigator.languages && navigator.languages[0]));
    }
    return picked || DEFAULT;
  }

  function t(key, vars) {
    var d = DICTS[lang] || DICTS[DEFAULT] || {};
    var s = d[key];
    if (s === undefined) s = (DICTS[DEFAULT] || {})[key];
    if (s === undefined) return key;
    if (vars) {
      s = s.replace(/\{(\w+)\}/g, function (_, k) { return vars[k] !== undefined ? vars[k] : '{' + k + '}'; });
    }
    return s;
  }

  function applyToDOM(scopeEl) {
    var scope = scopeEl || (typeof document !== 'undefined' ? document : null);
    if (!scope || !scope.querySelectorAll) return;
    var nodes = scope.querySelectorAll('[data-i18n]');
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      n.textContent = t(n.getAttribute('data-i18n'));
    }
    var tnodes = scope.querySelectorAll('[data-i18n-title]');
    for (var j = 0; j < tnodes.length; j++) {
      tnodes[j].setAttribute('title', t(tnodes[j].getAttribute('data-i18n-title')));
    }
    var pnodes = scope.querySelectorAll('[data-i18n-aria]');
    for (var k = 0; k < pnodes.length; k++) {
      pnodes[k].setAttribute('aria-label', t(pnodes[k].getAttribute('data-i18n-aria')));
    }
  }

  function setLang(l) {
    var n = normalize(l);
    if (!n) n = DEFAULT;
    lang = n;
    try { if (typeof localStorage !== 'undefined') localStorage.setItem(LS_KEY, n); } catch (e) { }
    if (typeof document !== 'undefined') {
      try { document.documentElement.setAttribute('lang', n); } catch (e2) { }
      applyToDOM(document);
    }
    for (var i = 0; i < listeners.length; i++) listeners[i](n);
    return n;
  }

  function cycle() {
    var i = SUPPORTED.indexOf(lang);
    return setLang(SUPPORTED[(i + 1) % SUPPORTED.length]);
  }

  function onChange(cb) { listeners.push(cb); }
  function getLang() { return lang; }
  function label(l) { return t('lang.' + l); }

  var api = {
    register: register, has: has, t: t, setLang: setLang, getLang: getLang,
    detect: detect, applyToDOM: applyToDOM, onChange: onChange, cycle: cycle, label: label,
    SUPPORTED: SUPPORTED, DEFAULT: DEFAULT, DICTS: DICTS
  };

  root.YS = root.YS || {};
  root.YS.I18N = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

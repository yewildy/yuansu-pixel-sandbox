/*
 * save.js — 存档 / 读档 / 导出 PNG / 导入导出 JSON（docs/DESIGN.md §8.7）
 *   依赖 DOM；localStorage key: yuansu.save.<slot>
 */
(function (root) {
  'use strict';

  var I18N = root.YS.I18N;

  function key(slot) { return 'yuansu.save.' + (slot || 1); }

  function toast(msg) {
    var t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.classList.remove('show'); }, 1800);
  }

  function save(app) {
    try {
      var obj = app.engine.toObject();
      root.localStorage.setItem(key(1), JSON.stringify(obj));
      toast(I18N.t('ui.saved'));
      return true;
    } catch (e) {
      toast(I18N.t('ui.importFail'));
      return false;
    }
  }

  function load(app) {
    try {
      var raw = root.localStorage.getItem(key(1));
      if (!raw) return false;
      var obj = JSON.parse(raw);
      app.engine.fromObject(obj);
      app.fn.afterLoad && app.fn.afterLoad();
      toast(I18N.t('ui.loaded'));
      return true;
    } catch (e) {
      toast(I18N.t('ui.importFail'));
      return false;
    }
  }

  function download(filename, blob) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
  }

  function exportJson(app) {
    var obj = app.engine.toObject();
    var blob = new Blob([JSON.stringify(obj)], { type: 'application/json' });
    download('yuansu-save.json', blob);
  }

  function importJson(app, file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var obj = JSON.parse(reader.result);
        app.engine.fromObject(obj);
        app.fn.afterLoad && app.fn.afterLoad();
        toast(I18N.t('ui.loaded'));
      } catch (e) {
        toast(I18N.t('ui.importFail'));
      }
    };
    reader.readAsText(file);
  }

  function exportPng(app) {
    try {
      var off = app.renderer.offscreen;
      var scale = Math.max(1, app.renderer.scale || 1);
      var big = document.createElement('canvas');
      big.width = off.width * scale;
      big.height = off.height * scale;
      var ctx = big.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(off, 0, 0, big.width, big.height);
      big.toBlob(function (blob) { download('yuansu.png', blob); }, 'image/png');
    } catch (e) {
      toast(I18N.t('ui.importFail'));
    }
  }

  var api = { save: save, load: load, exportJson: exportJson, importJson: importJson, exportPng: exportPng, toast: toast };
  root.YS.Save = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

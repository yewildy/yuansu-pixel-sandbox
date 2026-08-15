/*
 * rng.js — 确定性随机（docs/PHYSICS.md §1.5）
 *   · 带种子的 xorshift32 序列（用于顺序性随机：爆炸散射、斜向优先序等）
 *   · 无状态整数哈希 hash01(x,y,salt)（用于逐格判定，保证同格同 tick 同结果）
 * 禁止在仿真中调用 Math.random()。
 */
(function (root) {
  'use strict';

  function xorshift32(s) {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s >>> 0;
  }

  function Stream(seed) {
    // 种子为 0 时 xorshift 会退化为 0，强制非零
    this.s = (seed >>> 0) || 0x9E3779B9;
  }
  Stream.prototype.nextU32 = function () {
    this.s = xorshift32(this.s);
    return this.s;
  };
  Stream.prototype.next01 = function () {
    return this.nextU32() / 4294967296;
  };
  Stream.prototype.nextInt = function (n) {
    return this.nextU32() % n;
  };
  Stream.prototype.reset = function (seed) {
    this.s = (seed >>> 0) || 0x9E3779B9;
  };

  /* 模块级全局种子：参与所有逐格哈希，改种子即改整局随机序列（§1.5） */
  var SEED = 1337;
  function setSeed(s) { SEED = (s >>> 0) || 0x9E3779B9; }
  function getSeed() { return SEED; }

  /* 无状态整数哈希 → [0,1)（对齐 ART.md §2.3 参考实现，混入全局种子） */
  function hash01(x, y, salt) {
    var s = (salt ^ Math.imul(SEED, 2654435761)) | 0;
    var h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s, 69069)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  /* 整数哈希（用于阴影选择等） */
  function hashU32(x, y, salt) {
    var s = (salt ^ Math.imul(SEED, 2654435761)) | 0;
    var h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s, 69069)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return h >>> 0;
  }

  var api = {
    Stream: Stream,
    hash01: hash01,
    hashU32: hashU32,
    setSeed: setSeed,
    getSeed: getSeed,
    create: function (seed) { return new Stream(seed); }
  };

  root.YS = root.YS || {};
  root.YS.RNG = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

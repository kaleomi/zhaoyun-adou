/* 通用工具 */
(function (root) {
  'use strict';
  var G = root.G = root.G || {};

  // 可复现随机数（mulberry32）
  G.makeRng = function (seed) {
    var a = (seed >>> 0) || 1;
    var rng = function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    rng.int = function (n) { return Math.floor(rng() * n); };
    rng.pick = function (arr) { return arr[Math.floor(rng() * arr.length)]; };
    rng.chance = function (p) { return rng() < p; };
    rng.range = function (a, b) { return a + (b - a) * rng(); };
    rng.weighted = function (weights) {
      var sum = 0, i;
      for (i = 0; i < weights.length; i++) sum += Math.max(0, weights[i]);
      if (sum <= 0) return 0;
      var r = rng() * sum;
      for (i = 0; i < weights.length; i++) { r -= Math.max(0, weights[i]); if (r < 0) return i; }
      return weights.length - 1;
    };
    rng.shuffle = function (arr) {
      for (var i = arr.length - 1; i > 0; i--) { var j = Math.floor(rng() * (i + 1)); var t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
      return arr;
    };
    return rng;
  };

  // 手机震动反馈（安卓浏览器支持；iOS 没有这个接口就什么也不做）
  G.hapticOn = true;
  G.haptic = function (pattern) {
    if (!G.hapticOn) return;
    try { if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(pattern); } catch (e) { /* 忽略 */ }
  };

  G.clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  G.lerp = function (a, b, t) { return a + (b - a) * t; };
  G.dist = function (ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return Math.sqrt(dx * dx + dy * dy); };
  G.easeOutBack = function (t) { var c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
  G.easeOutCubic = function (t) { return 1 - Math.pow(1 - t, 3); };
  G.easeInOut = function (t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; };

  var CN = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  // 1~999 写成中文数字：12 → 十二，35 → 三十五
  G.cnNum = function (n) {
    n = Math.floor(n);
    if (n < 0 || n > 999) return String(n);
    if (n < 10) return CN[n];
    if (n < 20) return '十' + (n % 10 ? CN[n % 10] : '');
    if (n < 100) return CN[Math.floor(n / 10)] + '十' + (n % 10 ? CN[n % 10] : '');
    var r = n % 100;
    return CN[Math.floor(n / 100)] + '百' + (r === 0 ? '' : (r < 10 ? '零' + CN[r] : (r < 20 ? '一' + G.cnNum(r) : G.cnNum(r))));
  };
  G.fmt = function (n) {
    n = Math.round(n);
    if (n >= 100000000) return (n / 100000000).toFixed(1) + '亿';
    if (n >= 10000) return (n / 10000).toFixed(n >= 100000 ? 0 : 1) + '万';
    return String(n);
  };
})(typeof window !== 'undefined' ? window : globalThis);

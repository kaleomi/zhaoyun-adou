/* 启动：加载毛笔字体、注册离线缓存、进入标题 */
(function () {
  'use strict';
  var G = window.G;

  function boot() {
    var app = document.getElementById('app');
    var done = false;
    var go = function () { if (done) return; done = true; document.body.classList.add('ready'); G.App.init(app); };
    // 字体最多等 2.5 秒，加载不到就先用系统楷体
    try {
      if (window.FontFace && document.fonts) {
        var f = new FontFace('ZYBrush', 'url(' + (window.ZY_FONT_URL || 'fonts/brush.woff2') + ') format("woff2")', { display: 'swap' });
        document.fonts.add(f);
        f.load().then(go, go);
        setTimeout(go, 2500);
      } else go();
    } catch (e) { go(); }
    // 禁止双指缩放、双击放大
    document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
    document.addEventListener('dblclick', function (e) { e.preventDefault(); }, { passive: false });
    if ('serviceWorker' in navigator && location.protocol === 'https:') {
      navigator.serviceWorker.register('sw.js').catch(function () { /* 离线缓存不是必须的 */ });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

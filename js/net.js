/* 每日挑战排行榜：调用同站点的 /api/scores（Cloudflare Pages Functions + KV）。
 * 没部署接口（本地打开、没绑 KV）时返回 null，界面会提示“排行榜还没开通”。 */
(function (root) {
  'use strict';
  var G = root.G = root.G || {};

  function available() { return /^https?:$/.test(location.protocol); }

  function req(method, url, body) {
    if (!available()) return Promise.resolve(null);
    var opts = { method: method, headers: { 'content-type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    var ctrl = root.AbortController ? new AbortController() : null;
    if (ctrl) { opts.signal = ctrl.signal; setTimeout(function () { ctrl.abort(); }, 8000); }
    return fetch(url, opts).then(function (r) {
      if (!r.ok) return null;
      return r.json();
    }).catch(function () { return null; });
  }

  G.Board = {
    // board: 'today' | 'all'
    list: function (board, pid) {
      return req('GET', 'api/scores?board=' + encodeURIComponent(board || 'today') + '&pid=' + encodeURIComponent(pid || ''));
    },
    submit: function (o) {
      return req('POST', 'api/scores', { name: o.name, score: o.score, wave: o.wave, day: o.day, pid: o.pid });
    }
  };
})(window);

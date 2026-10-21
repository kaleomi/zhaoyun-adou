/* 赵云与阿斗 · 对手 AI
 * 用和玩家完全相同的接口（recruit / act）操作上半场。
 * difficulty 0~3：反应速度、失误率、会不会精打细算。
 */
(function (root) {
  'use strict';
  var G = root.G = root.G || {};

  var DELAY = [1.2, 0.95, 0.7, 0.45];
  var MISTAKE = [0.22, 0.14, 0.07, 0.02];

  function AI(battle, sideIdx, difficulty, seed) {
    this.b = battle;
    this.side = battle.sides[sideIdx];
    this.d = G.clamp(difficulty | 0, 0, 3);
    this.rng = G.makeRng(seed || 7);
    this.t = 1 + this.rng() * 1.5;
    this.covCache = {};
  }
  G.AI = AI;
  var A = AI.prototype;

  A.update = function (dt) {
    if (this.b.state === 'over') return;
    this.t -= dt;
    if (this.t > 0) return;
    this.t = DELAY[this.d] * (0.7 + this.rng() * 0.6);
    var n = this.d >= 2 ? 2 : 1; // 高难度一次多做几件事
    for (var i = 0; i < n; i++) if (!this.think()) break;
  };

  // 某格放某射程能覆盖多少段路
  A.coverage = function (x, y, range) {
    var key = x + ',' + y + ',' + range.toFixed(2);
    if (this.covCache[key] != null) return this.covCache[key];
    var lane = this.b.lanes[this.side.idx], c = 0;
    for (var d = 0; d <= lane.len; d += 0.25) {
      var p = lane.pos(d);
      var dx = p.x - (x + 0.5), dy = p.y - (y + 0.5);
      if (dx * dx + dy * dy <= range * range) c += 1 + d / lane.len; // 越靠近终点越重要
    }
    return (this.covCache[key] = c);
  };

  A.rangeOf = function (item) {
    if (item.kind === 'soldier') return G.SOLDIERS[item.key].range;
    if (item.kind === 'part' || item.kind === 'general') return G.GEN_BASE[G.GEN[item.gen].type].range;
    return 0;
  };

  A.bestCell = function (item, cells) {
    var self = this, r = this.rangeOf(item);
    if (item.kind === 'farmer') {
      // 农夫放在最没用的格子
      return cells.slice().sort(function (a, b) { return self.coverage(a.x, a.y, 1.6) - self.coverage(b.x, b.y, 1.6); })[0];
    }
    return cells.slice().sort(function (a, b) { return self.coverage(b.x, b.y, r) - self.coverage(a.x, a.y, r); })[0];
  };

  A.act = function (from, to) { return this.b.act(this.side, from, to); };

  A.think = function () {
    var b = this.b, side = this.side, rng = this.rng, self = this;
    if (b.state === 'over') return false;
    if (rng.chance(MISTAKE[this.d])) return false; // 发呆

    // 1. 场上能合的先合
    var pairs = b.mergePairs(side);
    if (pairs.length && (this.d > 0 || rng.chance(0.6))) {
      pairs.sort(function (p, q) { return pri(p) - pri(q); });
      var pr = pairs[0];
      var a = pr[0], c = pr[1];
      // 留下覆盖更好的那个位置
      var ra = this.rangeOf(a) || 1.6;
      var keepA = this.coverage(a.x, a.y, ra) >= this.coverage(c.x, c.y, ra);
      var mover = keepA ? c : a, target = keepA ? a : c;
      if (this.act({ cell: [mover.x, mover.y] }, { cell: [target.x, target.y] })) return true;
    }

    // 2. 营地里的东西
    var empties = b.emptyCells(side);
    var order = [0, 1, 2, 3, 4].sort(function (i, j) { return itemPri(side.camp[j]) - itemPri(side.camp[i]); });
    for (var k = 0; k < order.length; k++) {
      var i = order[k], it = side.camp[i];
      if (!it) continue;
      if (it.kind === 'prop') { if (this.useProp(i, it)) return true; continue; }
      // 能合进场上的单位
      var tgt = null;
      for (var u = 0; u < side.units.length; u++) {
        var un = side.units[u];
        var ck = b.combineKind(it, un);
        if (ck) { if (!tgt || un.lvl > tgt.lvl || ck === 'form') tgt = un; }
      }
      if (tgt) { if (this.act({ camp: i }, { cell: [tgt.x, tgt.y] })) return true; }
      if (empties.length) {
        if (!this.wantPlace(it)) continue;
        var sloppy = [0.35, 0.2, 0.06, 0][this.d];
        var cell = rng.chance(sloppy) ? rng.pick(empties) : this.bestCell(it, empties);
        if (cell && this.act({ camp: i }, { cell: [cell.x, cell.y] })) return true;
      } else if (this.d >= 1 && this.campHasPair(it)) {
        // 满员但营地里有能配对的：腾出最弱的一格当“工作台”
        var weakest = this.weakestLoner();
        if (weakest) { this.act({ cell: [weakest.x, weakest.y] }, { dismiss: true }); return true; }
      }
    }

    // 3. 征兵
    var cost = b.recruitCost(side);
    var campUseless = side.camp.every(function (x) { return !x; }) || !side.camp.some(function (x) { return x && self.usable(x); });
    if (side.buns >= cost && campUseless) {
      // 低难度乱花钱，高难度会留点余量等合成
      b.recruit(side);
      return true;
    }
    return false;

    function pri(p) {
      var kind = p[2];
      if (kind === 'form' || kind === 'genup' || kind === 'genmerge') return -10;
      return p[0].lvl;
    }
    function itemPri(x) {
      if (!x) return -1;
      if (x.kind === 'prop') return 5;
      if (x.kind === 'part') return 4;
      if (x.kind === 'farmer') return 1;
      return 2 + (x.lvl || 1) * 0.1;
    }
  };

  // 营地里还有另一件能和 it 合体的东西
  A.campHasPair = function (it) {
    var b = this.b, n = 0;
    for (var i = 0; i < 5; i++) {
      var o = this.side.camp[i];
      if (!o || o === it || o.kind === 'prop') continue;
      if (b.combineKind(it, o) || b.combineKind(o, it)) return true;
    }
    return false;
  };

  // 场上最弱、又没有搭档的兵
  A.weakestLoner = function () {
    var b = this.b, us = this.side.units;
    var cands = us.filter(function (u) {
      if (u.kind === 'general') return false;
      return !us.some(function (o) { return o !== u && b.combineKind(o, u); });
    });
    cands.sort(function (p, q) { return b.unitPower(p) - b.unitPower(q); });
    var w = cands[0];
    if (!w) return null;
    if (w.kind === 'soldier' && w.lvl > 2) return null;
    return w;
  };

  A.wantPlace = function (it) {
    var side = this.side;
    if (it.kind !== 'farmer') return true;
    var farmers = side.units.filter(function (x) { return x.kind === 'farmer'; }).length;
    var fighters = side.units.length - farmers;
    return this.b.wave <= 14 && farmers < 2 && fighters >= 4;
  };

  A.usable = function (it) {
    var b = this.b, side = this.side;
    if (it.kind === 'prop') return this.propTarget(it) != null;
    if (b.emptyCells(side).length && this.wantPlace(it)) return true;
    for (var u = 0; u < side.units.length; u++) if (b.combineKind(it, side.units[u])) return true;
    return false;
  };

  A.propTarget = function (it) {
    var b = this.b, side = this.side, self = this;
    var cells = [];
    for (var y = 0; y < 10; y++) for (var x = 0; x < 8; x++) cells.push(b.grid[y][x]);
    switch (it.key) {
      case 'shovel':
        var gs = cells.filter(function (c) { return c.t === 'G' && c.side === side.idx; });
        if (!gs.length) return null;
        gs.sort(function (p, q) { return self.coverage(q.x, q.y, 2) - self.coverage(p.x, p.y, 2); });
        return gs[0];
      case 'promote':
        var us = side.units.filter(function (u) { return (u.kind === 'general' && u.lvl < G.MAX_GEN_LVL) || (u.kind === 'soldier' && u.lvl < G.MAX_LVL); });
        if (!us.length) return null;
        us.sort(function (p, q) { return b.unitPower(q) - b.unitPower(p); });
        return b.cellAt(us[0].x, us[0].y);
      case 'ink':
        var ss = side.units.filter(function (u) { return u.kind === 'soldier'; });
        if (!ss.length) return null;
        // 找一个落单的兵去碰运气
        var lonely = ss.filter(function (u) { return !ss.some(function (o) { return o !== u && o.key === u.key && o.lvl === u.lvl; }); });
        if (!lonely.length) return null;
        return b.cellAt(lonely[0].x, lonely[0].y);
      case 'mine':
        var lane = b.lanes[side.idx];
        var rs = cells.filter(function (c) { return c.t === 'R' && c.side === side.idx && c.ld > lane.len * 0.45 && c.ld < lane.len * 0.85; });
        return rs.length ? self.rng.pick(rs) : null;
      case 'drum':
        return side.enemies.length >= 5 ? cells[0] : null;
      case 'pill':
        return side.hearts < side.maxHearts ? cells[0] : null;
    }
    return null;
  };

  A.useProp = function (i, it) {
    var c = this.propTarget(it);
    if (!c) return false;
    return !!this.act({ camp: i }, { cell: [c.x, c.y] });
  };

  // 为 AI 配一套武将与兵器
  G.makeAILoadout = function (rankIdx, rng) {
    var rank = G.RANKS[rankIdx];
    var pool = G.GENERALS.filter(function (g) { return g.unlock.rank != null ? g.unlock.rank <= rankIdx : rankIdx >= 35; });
    var deck = rng.shuffle(pool.slice()).slice(0, G.DECK_SIZE).map(function (g) { return g.id; });
    if (deck.indexOf('zhaoyun') < 0 && rng.chance(0.5)) deck[0] = 'zhaoyun';
    var weapons = {};
    deck.forEach(function (gid) {
      var type = G.GEN[gid].type;
      var rar = rng.weighted(rank.aiWeapon);
      var cands = G.WEAPONS.filter(function (w) { return w.type === type && w.rarity === rar; });
      if (!cands.length) cands = G.WEAPONS.filter(function (w) { return w.type === type && w.rarity <= rar; });
      var w = rng.pick(cands);
      weapons[gid] = { id: w.id, star: 1 + Math.min(4, Math.floor(rankIdx / 12)) };
    });
    return { deck: deck, weapons: weapons };
  };
})(typeof window !== 'undefined' ? window : globalThis);

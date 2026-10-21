/* 存档：段位、铜钱、武将、兵器、军需。保存在浏览器 localStorage。 */
(function (root) {
  'use strict';
  var G = root.G = root.G || {};
  var KEY = 'zhaoyun-adou-save-v1';

  function fresh() {
    var weapons = {};
    [0, 10, 20, 31].forEach(function (id) { weapons[id] = { frag: 0, star: 1 }; });
    return {
      v: 1,
      gold: 300,
      stars: 0,
      wins: 0, losses: 0, streak: 0, loseStreak: 0,
      best: 0,
      weapons: weapons,
      equip: { zhaoyun: 10 },
      deck: ['zhaoyun'],
      souls: {},
      unlockedGens: ['zhaoyun'],
      supplies: {},
      use: {},
      settings: { music: 0.6, sfx: 0.85, dmg: true, speed: 1, vibrate: true },
      cards: ['kongcheng', 'huogong'],
      campaign: {},
      daily: { day: '', best: 0, plays: 0, rewarded: '' },
      pid: '',
      tutorialDone: false,
      seenNotice: '',
      name: '',
      created: Date.now(),
      stats: { games: 0, kills: 0, bossKills: 0, bestWave: 0 }
    };
  }

  var P = {
    data: null,
    load: function () {
      var d = null;
      try { d = JSON.parse(root.localStorage.getItem(KEY) || 'null'); } catch (e) { d = null; }
      var f = fresh();
      if (!d || d.v !== 1) d = f;
      // 补全新字段
      Object.keys(f).forEach(function (k) { if (d[k] === undefined) d[k] = f[k]; });
      Object.keys(f.settings).forEach(function (k) { if (d.settings[k] === undefined) d.settings[k] = f.settings[k]; });
      Object.keys(f.stats).forEach(function (k) { if (d.stats[k] === undefined) d.stats[k] = f.stats[k]; });
      Object.keys(f.daily).forEach(function (k) { if (d.daily[k] === undefined) d.daily[k] = f.daily[k]; });
      if (!d.pid) d.pid = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
      this.data = d;
      this.syncUnlocks();
      G.hapticOn = d.settings.vibrate !== false;
      return d;
    },

    // ── 存档码：导出 / 导入 ──
    exportCode: function () {
      var json = JSON.stringify(this.data);
      return 'ZYAD1:' + btoa(unescape(encodeURIComponent(json)));
    },
    importCode: function (code) {
      code = String(code || '').trim().replace(/\s+/g, '');
      if (code.indexOf('ZYAD1:') !== 0) return '这不是赵云与阿斗的存档码';
      var d;
      try { d = JSON.parse(decodeURIComponent(escape(atob(code.slice(6))))); } catch (e) { return '存档码不完整或已损坏'; }
      if (!d || d.v !== 1 || typeof d.stars !== 'number') return '存档码格式不对';
      try { root.localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) { return '浏览器不允许保存'; }
      this.load();
      return null;
    },

    // ── 锦囊 ──
    cardUnlocked: function (id) {
      var c = G.CARD[id];
      if (!c) return false;
      if (c.unlock.rank != null) return this.rankIdx() >= c.unlock.rank;
      if (c.unlock.camp) return (this.data.campaign[c.unlock.camp] || 0) > 0;
      return false;
    },
    toggleCard: function (id) {
      var d = this.data, i = d.cards.indexOf(id);
      if (i >= 0) { d.cards.splice(i, 1); this.save(); return true; }
      if (!this.cardUnlocked(id)) return false;
      if (d.cards.length >= G.CARD_SLOTS) d.cards.shift();
      d.cards.push(id);
      this.save();
      return true;
    },
    activeCards: function () {
      var self = this;
      return this.data.cards.filter(function (id) { return self.cardUnlocked(id); }).slice(0, G.CARD_SLOTS);
    },

    // ── 战役 ──
    campUnlocked: function (idx) { return idx === 0 || (this.data.campaign[G.CAMPAIGN[idx - 1].id] || 0) > 0; },
    applyCampaign: function (lv, summary, rng) {
      var d = this.data, out = { win: summary.winner === 0, stars: 0, gold: 0, frags: [], souls: [], newGens: [], card: null, first: false };
      d.stats.games++;
      d.stats.kills += summary.kills || 0;
      if (out.win) {
        var lost = summary.maxHearts - summary.hearts;
        out.stars = lost === 0 ? 3 : (lost <= 1 ? 2 : 1);
        var prev = d.campaign[lv.id] || 0;
        out.first = prev === 0;
        if (out.stars > prev) d.campaign[lv.id] = out.stars;
        if (out.first) {
          out.gold = lv.reward.gold;
          if (lv.reward.frags) out.frags = this.drawFragments(lv.reward.frags, rng, 0.6);
          if (lv.reward.card) out.card = lv.reward.card;
          var souls = lv.reward.souls || {};
          Object.keys(souls).forEach(function (g) { d.souls[g] = (d.souls[g] || 0) + souls[g]; for (var i = 0; i < souls[g]; i++) out.souls.push(g); });
        } else out.gold = 50;
      } else out.gold = 20;
      d.gold += out.gold;
      (summary.drops || []).forEach(function (gid) { d.souls[gid] = (d.souls[gid] || 0) + 1; out.souls.push(gid); });
      out.newGens = this.syncUnlocks();
      this.consumeSupplies();
      this.save();
      return out;
    },
    campStars: function () {
      var d = this.data;
      return G.CAMPAIGN.reduce(function (a, c) { return a + (d.campaign[c.id] || 0); }, 0);
    },

    // ── 每日挑战 ──
    applyDaily: function (day, summary, rng) {
      var d = this.data, out = { score: summary.score, best: false, gold: 0, frags: [], souls: [], newGens: [] };
      if (d.daily.day !== day) { d.daily.day = day; d.daily.best = 0; d.daily.plays = 0; }
      d.daily.plays++;
      if (summary.score > d.daily.best) { d.daily.best = summary.score; out.best = true; }
      if (d.daily.rewarded !== day) {
        d.daily.rewarded = day;
        out.gold = 150;
        out.frags = this.drawFragments(2, rng, 0.8);
      }
      d.gold += out.gold;
      d.stats.games++;
      d.stats.kills += summary.kills || 0;
      out.newGens = this.syncUnlocks();
      this.save();
      return out;
    },
    save: function () {
      try { root.localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { /* 隐私模式等 */ }
    },
    reset: function () {
      try { root.localStorage.removeItem(KEY); } catch (e) { /* */ }
      this.data = null;
      this.load();
    },

    // ── 段位 ──
    rankIdx: function () { return Math.min(G.RANKS.length - 1, Math.floor(this.data.stars / 5)); },
    rank: function () { return G.RANKS[this.rankIdx()]; },
    subStars: function () {
      var i = this.rankIdx();
      return this.data.stars - i * 5;
    },
    starsNeeded: function () { return this.rank().stars; },

    // ── 武将 ──
    genUnlocked: function (id) { return this.data.unlockedGens.indexOf(id) >= 0; },
    syncUnlocks: function () {
      var d = this.data, ri = this.rankIdx(), fresh = [];
      G.GENERALS.forEach(function (g) {
        if (d.unlockedGens.indexOf(g.id) >= 0) return;
        var ok = (g.unlock.rank != null && ri >= g.unlock.rank) || (g.unlock.frag && (d.souls[g.id] || 0) >= g.unlock.frag);
        if (ok) {
          d.unlockedGens.push(g.id); fresh.push(g.id);
          if (d.deck.length < G.DECK_SIZE) d.deck.push(g.id);
        }
      });
      return fresh;
    },
    toggleDeck: function (id) {
      var d = this.data, i = d.deck.indexOf(id);
      if (i >= 0) { if (d.deck.length > 1) d.deck.splice(i, 1); else return false; }
      else { if (d.deck.length >= G.DECK_SIZE || !this.genUnlocked(id)) return false; d.deck.push(id); }
      this.save();
      return true;
    },

    // ── 兵器 ──
    weapon: function (id) { return this.data.weapons[id] || { frag: 0, star: 0 }; },
    addFrag: function (id, n) {
      var w = this.data.weapons[id] || (this.data.weapons[id] = { frag: 0, star: 0 });
      w.frag += n;
    },
    canUnlock: function (id) { var w = this.weapon(id); return w.star === 0 && w.frag >= G.WEAPON[id].frag; },
    canUpgrade: function (id) { var w = this.weapon(id); return w.star > 0 && w.star < G.WEAPON_MAX_STAR && w.frag >= G.weaponStarCost(G.WEAPON[id], w.star); },
    unlockWeapon: function (id) {
      var w = this.weapon(id), def = G.WEAPON[id];
      if (this.canUnlock(id)) { w.frag -= def.frag; w.star = 1; this.data.weapons[id] = w; this.save(); return true; }
      if (this.canUpgrade(id)) { w.frag -= G.weaponStarCost(def, w.star); w.star++; this.save(); return true; }
      return false;
    },
    equipWeapon: function (genId, wid) {
      var g = G.GEN[genId], w = G.WEAPON[wid];
      if (!g || !w || w.type !== g.type || this.weapon(wid).star <= 0) return false;
      // 一件兵器只能给一个武将
      var eq = this.data.equip;
      Object.keys(eq).forEach(function (k) { if (eq[k] === wid) delete eq[k]; });
      eq[genId] = wid;
      this.save();
      return true;
    },
    loadout: function () {
      var d = this.data, out = {};
      d.deck.forEach(function (gid) {
        var wid = d.equip[gid];
        if (wid != null && d.weapons[wid] && d.weapons[wid].star > 0) out[gid] = { id: wid, star: d.weapons[wid].star };
      });
      return { deck: d.deck.slice(), weapons: out };
    },

    // 抽兵器碎片：品质按段位权重；boost 越大越容易出好东西
    drawFragments: function (n, rng, boost) {
      var rank = this.rank(), res = [];
      var wts = rank.aiWeapon.slice();
      // 低段位也给一点点好东西的盼头
      wts = wts.map(function (w, i) { return w + (i <= 2 ? 0.6 : 0.25) ; });
      if (boost) wts = wts.map(function (w, i) { return w * Math.pow(1 + boost, i); });
      for (var i = 0; i < n; i++) {
        var rar = rng.weighted(wts);
        var pool = G.WEAPONS.filter(function (w) { return w.rarity === rar; });
        var w = rng.pick(pool);
        this.addFrag(w.id, 1);
        res.push(w.id);
      }
      this.save();
      return res;
    },

    // ── 对局结算 ──
    applyResult: function (win, summary, rng) {
      var d = this.data, out = { win: win, oldStars: d.stars, oldRank: this.rankIdx(), frags: [], gold: 0, souls: [], newGens: [] };
      var rank = this.rank();
      d.stats.games++;
      d.stats.kills += summary.kills || 0;
      d.stats.bossKills += (summary.bossKills || []).length;
      if (win) {
        d.wins++; d.streak++; d.loseStreak = 0;
        var add = d.streak >= 3 ? 2 : 1;
        d.stars += add;
        out.starDelta = add;
        out.gold = rank.reward + Math.floor((summary.kills || 0) / 2);
        out.frags = this.drawFragments(2, rng, 0);
      } else {
        d.losses++; d.streak = 0; d.loseStreak++;
        var protect = this.rankIdx() < 10 && this.subStars() === 0;
        if (!protect && d.stars > 0) { d.stars--; out.starDelta = -1; } else out.starDelta = 0;
        out.protect = protect;
        out.gold = Math.round(rank.reward / 3) + Math.min(60, (summary.wave || 0) * 3);
        if (summary.wave >= 8) out.frags = this.drawFragments(1, rng, 0);
      }
      d.gold += out.gold;
      (summary.drops || []).forEach(function (gid) { d.souls[gid] = (d.souls[gid] || 0) + 1; out.souls.push(gid); });
      out.newGens = this.syncUnlocks();
      out.newStars = d.stars;
      out.newRank = this.rankIdx();
      this.consumeSupplies();
      this.save();
      return out;
    },
    applyEndless: function (summary, rng) {
      var d = this.data, out = { wave: summary.wave, best: false, gold: 0, frags: [], souls: [], newGens: [] };
      if (summary.wave > d.best) { d.best = summary.wave; out.best = true; }
      d.stats.games++;
      d.stats.kills += summary.kills || 0;
      out.gold = summary.wave * 6;
      d.gold += out.gold;
      if (summary.wave >= 10) out.frags = this.drawFragments(Math.min(4, Math.floor(summary.wave / 10)), rng, 0.3);
      (summary.drops || []).forEach(function (gid) { d.souls[gid] = (d.souls[gid] || 0) + 1; out.souls.push(gid); });
      out.newGens = this.syncUnlocks();
      this.consumeSupplies();
      this.save();
      return out;
    },

    // ── 军需 ──
    buySupply: function (id) {
      var s = G.SUPPLIES.filter(function (x) { return x.id === id; })[0];
      if (!s || this.data.gold < s.price) return false;
      this.data.gold -= s.price;
      this.data.supplies[id] = (this.data.supplies[id] || 0) + 1;
      this.data.use[id] = true;
      this.save();
      return true;
    },
    activeSupplies: function () {
      var d = this.data, out = {};
      G.SUPPLIES.forEach(function (s) { if (d.use[s.id] && (d.supplies[s.id] || 0) > 0) out[s.id] = true; });
      return out;
    },
    consumeSupplies: function () {
      var d = this.data;
      Object.keys(this.activeSupplies()).forEach(function (id) {
        d.supplies[id]--;
        if (d.supplies[id] <= 0) { d.supplies[id] = 0; d.use[id] = false; }
      });
    },
    buyChest: function (id, rng) {
      var c = G.CHESTS.filter(function (x) { return x.id === id; })[0];
      if (!c || this.data.gold < c.price) return null;
      this.data.gold -= c.price;
      return this.drawFragments(c.draws, rng, c.boost);
    }
  };
  G.Profile = P;
})(typeof window !== 'undefined' ? window : globalThis);

/* 赵云与阿斗 · 界面（主城、匹配、武将、兵器、军需、段位、结算）
 * 菜单用 DOM 写，战斗在 canvas 里。
 */
(function (root) {
  'use strict';
  var G = root.G;
  var P = G.Profile;
  var A = G.Audio;
  var $ = function (sel, el) { return (el || document).querySelector(sel); };

  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'text') el.textContent = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else if (k === 'style') el.setAttribute('style', v);
      else el.setAttribute(k, v);
    });
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c == null || c === false) continue;
      if (Array.isArray(c)) c.forEach(function (cc) { if (cc) el.appendChild(typeof cc === 'string' ? document.createTextNode(cc) : cc); });
      else el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return el;
  }
  G.h = h;

  function starsHtml(n, total) {
    var s = '';
    for (var i = 0; i < total; i++) s += '<i class="star' + (i < n ? ' on' : '') + '">★</i>';
    return s;
  }
  function rankLabel(r) { return r.sub ? r.tier + '·' + r.sub : r.tier; }

  var App = {
    root: null,
    screen: null,
    battle: null,
    view: null,
    rng: G.makeRng(Date.now() & 0xffffff),

    init: function (rootEl) {
      this.root = rootEl;
      P.load();
      A.setVolumes(P.data.settings.music, P.data.settings.sfx);
      this.toastEl = h('div', { class: 'toast' });
      document.body.appendChild(this.toastEl);
      this.showTitle();
      var self = this;
      root.addEventListener('resize', function () { if (self.view) self.view.resize(); });
      document.addEventListener('visibilitychange', function () {
        if (document.hidden) {
          A.suspend();
          if (self.view && !self.view.paused && self.battle && self.battle.state !== 'over') { self.view.setPaused(true); self.showPause(); }
        } else A.resume();
      });
    },

    toast: function (msg) {
      var t = this.toastEl;
      t.innerHTML = msg;
      t.classList.add('show');
      clearTimeout(this._toastT);
      this._toastT = setTimeout(function () { t.classList.remove('show'); }, 2200);
    },

    setScreen: function (el, name) {
      this.closeSidePanels();
      if (this.view) { this.view.destroy(); this.view = null; this.battle = null; }
      this.root.innerHTML = '';
      this.root.appendChild(el);
      this.screen = name;
    },

    modal: function (title, body, buttons, o) {
      o = o || {};
      var self = this;
      var wrap = h('div', { class: 'modal-wrap' + (o.cls ? ' ' + o.cls : '') });
      var close = function () { wrap.remove(); if (o.onClose) o.onClose(); };
      var box = h('div', { class: 'modal' },
        title ? h('div', { class: 'modal-title' }, title) : null,
        o.noX ? null : h('button', { class: 'modal-x', 'aria-label': '关闭', onclick: function () { A.play('click'); close(); } }, '×'),
        h('div', { class: 'modal-body' }, body),
        buttons && buttons.length ? h('div', { class: 'modal-btns' }, buttons.map(function (b) {
          return h('button', { class: 'btn ' + (b.cls || ''), onclick: function () { A.play('click'); var keep = b.fn && b.fn(close); if (!keep) close(); } }, b.text);
        })) : null
      );
      wrap.appendChild(box);
      var born = performance.now();
      // 触屏上 pointerup 之后还会补发一次 click，别让它把刚打开的弹窗点掉
      wrap.addEventListener('click', function (e) { if (e.target === wrap && !o.noX && performance.now() - born > 450) close(); });
      (o.parent || self.root).appendChild(wrap);
      return { el: wrap, close: close, body: box };
    },

    // ───────────────── 标题 ─────────────────
    showTitle: function () {
      var self = this;
      var el = h('div', { class: 'screen title-screen' },
        h('div', { class: 'title-art' },
          h('div', { class: 'title-logo' }, '赵云与阿斗'),
          h('div', { class: 'title-sub' }, '文字塔防 · 排兵布阵'),
          h('div', { class: 'title-hero' },
            h('div', { class: 'hero-adou' }, h('span', { class: 'crown' }), '斗'),
            h('div', { class: 'hero-zy' }, '赵云')
          )
        ),
        h('div', { class: 'title-tap' }, '点击任意处开始'),
        h('div', { class: 'title-foot' }, '单机游戏 · 进度保存在本机浏览器')
      );
      el.addEventListener('click', function () {
        A.init(); A.play('go');
        A.music('menu');
        self.showHome();
      });
      this.setScreen(el, 'title');
    },

    // ───────────────── 主城 ─────────────────
    showHome: function () {
      var self = this, d = P.data, rank = P.rank();
      A.music('menu');
      var newGens = P.syncUnlocks();
      var top = h('div', { class: 'topbar' },
        h('button', { class: 'icon-btn', 'aria-label': '设置', onclick: function () { A.play('click'); self.showSettings(); } }, '⚙'),
        h('div', { class: 'gold-pill' }, h('i', { class: 'coin' }, '刀'), h('span', { id: 'gold' }, G.fmt(d.gold))),
        h('button', { class: 'icon-btn', 'aria-label': '玩法', onclick: function () { A.play('click'); self.showHelp(); } }, '?')
      );
      var subStars = P.subStars(), need = P.starsNeeded();
      var rankBox = h('div', { class: 'rank-box', onclick: function () { A.play('click'); self.showRanks(); } },
        h('div', { class: 'rank-name' }, rankLabel(rank)),
        h('div', { class: 'stars', html: rank.tier === '大帝' ? '<i class="star on">★</i> × ' + subStars : starsHtml(subStars, need) }),
        h('div', { class: 'rank-sub' }, '战场：' + G.MAPS[rank.map].name + ' · 胜 ' + d.wins + ' / 负 ' + d.losses + (d.streak >= 2 ? ' · ' + d.streak + '连胜' : ''))
      );
      var deckChars = d.deck.map(function (gid) { return h('span', { class: 'mini-gen' }, G.GEN[gid].name); });
      var stage = h('div', { class: 'stage' },
        h('div', { class: 'stage-board' },
          h('div', { class: 'cellp' }), h('div', { class: 'cellp' }), h('div', { class: 'cellp' }),
          h('div', { class: 'cellp' }), h('div', { class: 'cellp mat' }), h('div', { class: 'cellp' })
        ),
        h('div', { class: 'stage-adou' }, h('span', { class: 'crown' }), '斗'),
        h('div', { class: 'stage-zy' }, '赵云'),
        h('div', { class: 'stage-deck' }, h('span', { class: 'lbl' }, '出战武将'), deckChars)
      );
      var startBtn = h('button', { class: 'btn big red start-btn', onclick: function () { A.play('click'); self.startMatch(); } }, '开始游戏');
      var dailyNew = d.daily.rewarded !== G.cnDay();
      var modes = h('div', { class: 'mode-row' },
        h('button', { class: 'btn ghost mode', onclick: function () { A.play('click'); self.showCampaign(); } }, '战役', h('small', null, P.campStars() + '/' + G.CAMPAIGN.length * 3 + '★')),
        h('button', { class: 'btn ghost mode', onclick: function () { A.play('click'); self.showDaily(); } }, '每日', h('small', null, dailyNew ? '新题' : '已挑战'), dailyNew ? h('i', { class: 'dot' }) : null),
        h('button', { class: 'btn ghost mode', onclick: function () { A.play('click'); self.startEndless(); } }, '无尽', h('small', null, d.best ? '最佳' + d.best + '波' : '')));
      var endless = modes;
      var supplies = P.activeSupplies(), supNames = G.SUPPLIES.filter(function (s) { return supplies[s.id]; }).map(function (s) { return s.name; });
      var supLine = supNames.length ? h('div', { class: 'sup-line' }, '本局军需：' + supNames.join('、')) : null;
      var nav = h('div', { class: 'nav' },
        navBtn('将', '武将', function () { self.showGenerals(); }, P.data.unlockedGens.length > 1 && !P.data.seenGens),
        navBtn('兵', '兵器', function () { self.showWeapons(); }, G.WEAPONS.some(function (w) { return P.canUnlock(w.id) || P.canUpgrade(w.id); })),
        navBtn('令', '锦囊军令', function () { self.showCards(); }, G.CARDS.some(function (c) { return P.cardUnlocked(c.id) && !(d.seenCards || {})[c.id]; }) || G.SKILLS.some(function (k) { return P.skillUnlocked(k.id) && !(d.seenSkills || {})[k.id]; })),
        navBtn('军', '军需', function () { self.showShop(); }),
        navBtn('段', '段位', function () { self.showRanks(); })
      );
      var el = h('div', { class: 'screen home' }, top,
        h('div', { class: 'home-title' }, '赵云与阿斗'),
        rankBox, stage,
        h('div', { class: 'home-btns' }, startBtn, endless, supLine),
        nav);
      this.setScreen(el, 'home');
      if (newGens.length) this.announceGenerals(newGens);
      else if (!d.tutorialDone && !this._askedTut) {
        this._askedTut = true;
        this.modal('欢迎，子龙！', h('div', { class: 'help-text', html: '长坂坡上贼兵四起，阿斗就交给你了。<br><br>点<b>征兵</b>招来写着“刀、枪、弓、骑”的士兵，把字<b>拖到白色营地</b>上；两个<b>相同的字叠在一起</b>就能升级；把“<b>赵</b>”“<b>云</b>”拼在一起，常山赵子龙亲自上阵！<br><br>对手也在守他的阿斗，谁先把三颗心全丢光谁就输。' }),
          [{ text: '新手教学局', cls: 'red', fn: function () { self.startMatch({ tutorial: true }); } }, { text: '我会玩', cls: 'ghost', fn: function () { P.data.tutorialDone = true; P.save(); } }]);
      }
      function navBtn(ch, label, fn, dot) {
        return h('button', { class: 'nav-btn', onclick: function () { A.play('click'); fn(); } },
          h('span', { class: 'nav-ch' }, ch), h('span', { class: 'nav-lbl' }, label), dot ? h('i', { class: 'dot' }) : null);
      }
    },

    announceGenerals: function (ids) {
      A.play('unlock');
      var body = h('div', { class: 'gen-announce' }, ids.map(function (id) {
        var g = G.GEN[id];
        return h('div', { class: 'gen-card big unlocked' }, h('div', { class: 'gen-chars' }, g.name), h('div', { class: 'gen-title' }, g.title), h('div', { class: 'gen-skill' }, g.skill + '：' + g.desc));
      }));
      this.modal('新武将来投！', body, [{ text: '好', cls: 'red' }]);
    },

    // ───────────────── 匹配 → 战斗 ─────────────────
    randomWeather: function () {
      return G.WEATHERS[this.rng.weighted(G.WEATHERS.map(function (w) { return w.w; }))].id;
    },

    startMatch: function (o) {
      o = o || {};
      var self = this, d = P.data;
      var rankIdx = P.rankIdx(), rank = G.RANKS[rankIdx];
      var tutorial = !!o.tutorial;
      // 对手难度：按段位权重，连败时放水
      var diff = this.rng.weighted(rank.aiDiff);
      if (d.loseStreak >= 2) diff = Math.max(0, diff - 1);
      if (d.loseStreak >= 4) diff = 0;
      if (d.streak >= 4) diff = Math.min(3, diff + 1);
      if (tutorial || (d.wins + d.losses < 2)) diff = 0;
      var aiLoad = G.makeAILoadout(rankIdx, this.rng);
      if (tutorial) { aiLoad.weapons = {}; aiLoad.cards = []; }
      var weather = (tutorial || d.wins + d.losses < 3) ? 'clear' : this.randomWeather();
      var wd = G.WEATHER[weather];
      var oppName = this.rng.pick(G.AI_NAMES);
      var oppRankIdx = G.clamp(rankIdx + this.rng.int(3) - 1, 0, G.RANKS.length - 1);
      var winRate = (30 + diff * 9 + this.rng() * 18).toFixed(1);
      var myRate = d.wins + d.losses ? (d.wins / (d.wins + d.losses) * 100).toFixed(1) : '0.0';
      var el = h('div', { class: 'screen match' },
        h('div', { class: 'match-title' }, '匹配中'),
        h('div', { class: 'flag blue' },
          h('div', { class: 'flag-av' }, oppName.charAt(0)),
          h('div', { class: 'flag-info' }, h('div', { class: 'flag-name' }, oppName), h('div', null, rankLabel(G.RANKS[oppRankIdx])), h('div', { class: 'flag-rate' }, '胜率 ' + winRate + '%'))
        ),
        h('div', { class: 'vs' }, '⚔'),
        h('div', { class: 'flag red' },
          h('div', { class: 'flag-info' }, h('div', { class: 'flag-name' }, d.name || '常山赵子龙'), h('div', null, rankLabel(rank)), h('div', { class: 'flag-rate' }, '胜率 ' + myRate + '%')),
          h('div', { class: 'flag-av' }, '我')
        ),
        h('div', { class: 'match-map' }, '战场 · ' + G.MAPS[rank.map].name + ' — ' + G.MAPS[rank.map].sub,
          weather !== 'clear' ? h('div', { class: 'match-weather' }, '天气：' + wd.name + ' — ' + wd.desc) : null)
      );
      this.setScreen(el, 'match');
      A.music(null);
      A.play('recruit');
      var go = function () {
        if (self.screen !== 'match') return;
        self.startBattle({
          mode: 'pvp', mapId: rank.map, rankIdx: rankIdx, tutorial: tutorial, weather: weather,
          ai: { difficulty: diff, deck: aiLoad.deck, weapons: aiLoad.weapons, cards: aiLoad.cards, skills: tutorial ? ['arrows'] : aiLoad.skills, name: oppName },
          ranked: !tutorial
        });
      };
      var t1 = setTimeout(function () { var mt = $('.match-title', el); if (mt) { mt.textContent = '匹配完成'; mt.classList.add('done'); } A.play('boss'); }, 1200);
      var t2 = setTimeout(go, 2800);
      el.addEventListener('click', function () { clearTimeout(t1); clearTimeout(t2); go(); }, { once: true });
    },

    startEndless: function () {
      var rankIdx = P.rankIdx();
      this.startBattle({ mode: 'endless', mapId: this.rng.int(G.LADDER_MAPS), rankIdx: Math.min(rankIdx, 10), weather: this.randomWeather(),
        soloTitle: '无尽守城', soloSub: P.data.best ? '最佳 · 第' + G.cnNum(P.data.best) + '波' : '' });
    },

    startCampaign: function (lv) {
      var d = P.data, deck = lv.rules.deck;
      var o = { mode: 'campaign', mapId: lv.map, rankIdx: 0, waves: lv.waves, hpMult: lv.hp, rules: lv.rules, weather: lv.rules.weather || this.randomWeather(),
        campaign: lv, events: false, soloTitle: lv.name, soloSub: '守住 ' + lv.waves + ' 波' };
      if (deck) {
        var weapons = {};
        deck.forEach(function (gid) {
          var wid = d.equip[gid];
          if (wid != null && d.weapons[wid] && d.weapons[wid].star > 0) weapons[gid] = { id: wid, star: d.weapons[wid].star };
        });
        o.deck = deck; o.weapons = weapons;
      }
      this.startBattle(o);
    },

    startDaily: function () {
      var cfg = G.dailyConfig(G.cnDay());
      this.startBattle({ mode: 'daily', mapId: cfg.map, rankIdx: cfg.rankIdx, weather: cfg.weather, deck: cfg.deck, weapons: cfg.weapons, cards: cfg.cards, skills: cfg.skills,
        seed: cfg.seed, daily: cfg, noSupplies: true, soloTitle: '每日挑战', soloSub: cfg.day.slice(5).replace('-', '月') + '日' });
    },

    startBattle: function (o) {
      var self = this, d = P.data;
      var load = P.loadout();
      var sup = o.noSupplies ? {} : P.activeSupplies();
      var dm = [0.72, 0.85, 0.96, 1.05];
      var cfg = {
        seed: o.seed != null ? o.seed : (Date.now() ^ (this.rng() * 1e9)) >>> 0,
        mode: o.mode, mapId: o.mapId, rankIdx: o.rankIdx, tutorial: !!o.tutorial,
        weather: o.weather || 'clear', waves: o.waves, hpMult: o.hpMult, rules: o.rules, events: o.events,
        dmgNumbers: d.settings.dmg,
        sides: [
          { name: d.name || '我', deck: o.deck || load.deck, weapons: o.weapons || load.weapons, supplies: sup, cards: o.cards || P.activeCards(), skills: o.skills || P.activeSkills() },
          o.ai ? { name: o.ai.name, isAI: true, difficulty: o.ai.difficulty, deck: o.ai.deck, weapons: o.ai.weapons, cards: o.ai.cards, skills: o.ai.skills, dmgMult: dm[o.ai.difficulty] * (o.tutorial ? 0.8 : 1) } : null
        ]
      };
      var b = new G.Battle(cfg);
      var tip = h('div', { class: 'tip' });
      var cv = h('canvas', { class: 'battle-cv' });
      var el = h('div', { class: 'screen battle' }, cv, tip);
      this.setScreen(el, 'battle');
      this.battle = b;
      this.battleOpts = o;
      var ais = o.ai ? [new G.AI(b, 1, o.ai.difficulty, cfg.seed + 99)] : [];
      if (/autoplay/.test(location.search)) ais.push(new G.AI(b, 0, 3, cfg.seed + 7)); // 调试：让 AI 替我方下棋
      this.view = new G.BattleView(cv, b, {
        ais: ais, tipEl: tip, settings: d.settings, tutorial: !!o.tutorial, oppName: o.ai ? o.ai.name : '',
        soloTitle: o.soloTitle, soloSub: o.soloSub,
        onPause: function () { self.showPause(); },
        onHelp: function () { self.showHelp(function () { if (self.view) self.view.setPaused(false); }); },
        onSpeed: function (s) { d.settings.speed = s; P.save(); },
        onEnd: function (sum) { self.endBattle(sum); }
      });
      A.music('battle');
      this.loop();
      this.openSidePanels();
      tip.addEventListener('click', function () { tip.classList.remove('show'); });
    },

    loop: function () {
      var self = this, last = performance.now();
      cancelAnimationFrame(this._raf);
      var tick = function (now) {
        if (!self.view) return;
        var dt = (now - last) / 1000; last = now;
        self.view.frame(dt);
        self._raf = requestAnimationFrame(tick);
      };
      this._raf = requestAnimationFrame(tick);
    },

    // ───────────────── 宽屏两侧信息栏 ─────────────────
    openSidePanels: function () {
      this.closeSidePanels();
      var self = this;
      var L = h('aside', { class: 'side-panel left' }), R = h('aside', { class: 'side-panel right' });
      document.body.appendChild(L); document.body.appendChild(R);
      this.panels = [L, R];
      var render = function () {
        if (!self.battle || !self.panels) return;
        var b = self.battle, o = self.battleOpts || {};
        // 左：对手（单人模式显示关卡信息）
        var lh = '';
        if (!b.solo && b.sides[1]) {
          var s1 = b.sides[1];
          lh += '<h3>对手 · ' + esc(o.ai ? o.ai.name : '') + '</h3>';
          lh += '<div class="sp-row">心 ' + '♥'.repeat(Math.max(0, s1.hearts)) + '<span class="sp-dim">' + '♥'.repeat(Math.max(0, s1.maxHearts - s1.hearts)) + '</span> · 击杀 ' + s1.kills + ' · 馒头 ' + Math.floor(s1.buns) + '</div>';
          lh += '<h4>阵容</h4><div class="sp-units">' + unitsHtml(s1.units) + '</div>';
          lh += '<h4>军令</h4><div>' + (s1.skills.length ? s1.skills.map(function (k) { return '<span class="sp-card skill' + (k.cd > 0 ? ' used' : '') + '">' + G.SKILL[k.id].name + (k.cd > 0 ? ' ' + Math.ceil(k.cd) + '秒' : '') + '</span>'; }).join('') : '—') + '</div>';
          lh += '<h4>锦囊</h4><div>' + (s1.cards.length ? s1.cards.map(function (c) { return '<span class="sp-card' + (c.used ? ' used' : '') + '">' + G.CARD[c.id].name + '</span>'; }).join('') : '—') + '</div>';
          lh += '<h4>羁绊</h4><div>' + bondsHtml(s1.bonds) + '</div>';
        } else {
          lh += '<h3>' + esc(o.soloTitle || '') + '</h3>';
          if (o.campaign) lh += '<p class="sp-story">' + esc(o.campaign.story) + '</p><p class="sp-tip">' + esc(o.campaign.tip) + '</p>';
          if (o.daily) lh += '<p class="sp-tip">所有人今天打的都是同一局。坚持的波数越多、杀敌越多，分数越高。</p>';
          if (b.mode === 'endless') lh += '<p class="sp-tip">一个人守到撑不住为止。</p>';
        }
        // 右：敌情与我方
        var info = b.nextWaveInfo(), w = G.WEATHER[b.weather];
        var rh = '<h3>敌情</h3>';
        rh += '<div class="sp-row">第' + G.cnNum(Math.max(1, b.wave)) + '波 · 场上 ' + b.sides[0].enemies.length + ' 敌</div>';
        if (info) {
          rh += '<h4>下一波</h4><div class="sp-units">' + Object.keys(info.counts).map(function (k) { return '<span class="sp-u">' + G.ENEMIES[k].ch + '<small>×' + info.counts[k] + '</small></span>'; }).join('') + '</div>';
          if (info.boss) rh += '<div class="sp-boss"><b>Boss：' + G.BOSSES[info.boss].name + '</b><br>' + G.BOSSES[info.boss].desc + '</div>';
        }
        rh += '<h4>天气 · ' + w.name + '</h4><div class="sp-dim2">' + w.desc + '</div>';
        rh += '<h4>我方羁绊</h4><div>' + bondsHtml(b.sides[0].bonds) + '</div>';
        if (L.innerHTML !== lh) L.innerHTML = lh;
        if (R.innerHTML !== rh) R.innerHTML = rh;
      };
      render();
      this._panelT = setInterval(render, 600);
      function esc(t) { return String(t || '').replace(/[<>&]/g, ''); }
      function unitsHtml(us) {
        if (!us.length) return '<span class="sp-dim2">还没布阵</span>';
        return us.slice().sort(function (a, b) { return (b.kind === 'general') - (a.kind === 'general') || b.lvl - a.lvl; }).map(function (u) {
          var ch = u.kind === 'general' ? G.GEN[u.gen].name : (u.kind === 'part' ? G.GEN[u.gen].parts[u.part] : (u.kind === 'farmer' ? '农' : G.SOLDIERS[u.key].ch));
          return '<span class="sp-u' + (u.kind === 'general' ? ' gen' : '') + '">' + ch + '<small>' + (u.kind === 'general' ? u.lvl + '★' : (u.kind === 'part' ? '' : u.lvl)) + '</small></span>';
        }).join('');
      }
      function bondsHtml(bs) {
        if (!bs.length) return '<span class="sp-dim2">暂无</span>';
        var seen = {};
        return bs.filter(function (x) { if (seen[x.name]) { seen[x.name]++; return false; } seen[x.name] = 1; return true; })
          .map(function (x) { return '<div class="sp-bond ' + x.kind + '"><b>' + x.name + (seen[x.name] > 1 ? ' ×' + seen[x.name] : '') + '</b> ' + x.desc.replace(/^[^：]*：/, '') + '</div>'; }).join('');
      }
    },
    closeSidePanels: function () {
      clearInterval(this._panelT);
      (this.panels || []).forEach(function (p) { p.remove(); });
      this.panels = null;
    },

    showPause: function () {
      var self = this;
      var s = P.data.settings;
      var body = h('div', { class: 'pause-body' },
        volRow('音乐', 'music'), volRow('音效', 'sfx'),
        h('label', { class: 'chk' }, h('input', { type: 'checkbox', id: 'opt-dmg-p', checked: s.dmg ? 'checked' : null, onchange: function (e) { s.dmg = e.target.checked; P.save(); if (self.view) self.view.dmgNumbers = s.dmg; } }), ' 显示伤害数字')
      );
      function volRow(label, key) {
        return h('div', { class: 'vol-row' }, h('span', null, label), h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: s[key], oninput: function (e) { s[key] = +e.target.value; A.setVolumes(s.music, s.sfx); P.save(); } }));
      }
      var keepPaused = false;
      var solo = self.battle && self.battle.solo;
      var m = this.modal('暂停', body, [
        { text: '继续作战', cls: 'red', fn: function () { if (self.view) self.view.setPaused(false); } },
        { text: solo ? '结束本局' : '认输', cls: 'ghost', fn: function (close) {
          keepPaused = true;
          close();
          if (!self.battle) return true;
          self.confirm(solo ? '结束本局并结算？' : '认输会算作一场败仗，确定吗？', function () {
            if (self.view) self.view.setPaused(false);
            if (self.battle.solo) self.battle.sides[0].hearts = 0;
            else self.battle.end(1);
          }, function () { if (self.view) self.view.setPaused(false); });
          return true;
        } }
      ], { onClose: function () { if (self.view && !keepPaused) self.view.setPaused(false); } });
      return m;
    },

    confirm: function (msg, yes, no) {
      var decided = false;
      this.modal('确认', h('div', { class: 'help-text' }, msg), [
        { text: '确定', cls: 'red', fn: function () { decided = true; yes && yes(); } },
        { text: '取消', cls: 'ghost', fn: function () { decided = true; no && no(); } }
      ], { onClose: function () { if (!decided && no) no(); } });
    },

    // ───────────────── 结算 ─────────────────
    endBattle: function (sum) {
      var self = this, o = this.battleOpts || {}, b = this.battle;
      var res, title, win = null, rows = [], again, againText = '再来一局';
      this.closeSidePanels();
      A.music(null);
      if (b.mode === 'campaign') {
        res = P.applyCampaign(o.campaign, sum, this.rng);
        win = res.win;
        title = win ? '过关' : '败走';
        rows.push(h('div', { class: 'res-rank' }, o.campaign.name, h('div', { class: 'stars', html: starsHtml(res.stars, 3) })));
        if (win && res.first) rows.push(h('div', { class: 'res-up' }, '首次通关！'));
        if (res.card) rows.push(h('div', { class: 'res-up' }, '获得锦囊：' + G.CARD[res.card].name));
        again = function () { self.startCampaign(o.campaign); };
        againText = win ? '再打一次' : '重新挑战';
        var nextLv = G.CAMPAIGN[o.campaign.idx + 1];
        if (win && nextLv) { var nl = nextLv; this._next = function () { self.campDetail(nl.idx); }; }
      } else if (b.mode === 'daily') {
        res = P.applyDaily(o.daily.day, sum, this.rng);
        title = '挑战结束';
        rows.push(h('div', { class: 'res-big' }, G.fmt(sum.score) + ' 分' + (res.best ? '（今日最佳）' : '')));
        rows.push(h('div', { class: 'res-line' }, '今日最佳 ' + G.fmt(P.data.daily.best) + ' 分 · 今天第 ' + P.data.daily.plays + ' 次'));
        var boardLine = h('div', { class: 'res-line board-line' }, '正在上传成绩…');
        rows.push(boardLine);
        G.Board.submit({ name: P.data.name || '常山赵子龙', score: sum.score, wave: sum.wave, day: o.daily.day, pid: P.data.pid }).then(function (r) {
          if (!r) boardLine.textContent = '排行榜还没开通（成绩只保存在本机）';
          else boardLine.textContent = '今日排名：' + (r.today ? '第 ' + r.today + ' 名' : '未进前 100') + ' · 总榜：' + (r.all ? '第 ' + r.all + ' 名' : '未进前 100');
        });
        again = function () { self.startDaily(); };
        againText = '再挑战';
      } else if (b.mode === 'endless') {
        res = P.applyEndless(sum, this.rng);
        title = '守城结束';
        rows.push(h('div', { class: 'res-big' }, '坚守到第 ' + sum.wave + ' 波' + (res.best ? '（新纪录！）' : '')));
        again = function () { self.startEndless(); };
        againText = '再守一次';
      } else if (o.tutorial) {
        P.data.tutorialDone = true;
        res = { win: sum.winner === 0, gold: 100, frags: [], souls: [], newGens: [], starDelta: 0, tutorial: true };
        P.data.gold += 100; P.save();
        win = res.win;
        title = win ? '大获全胜' : '惜败';
        again = function () { self.startMatch(); };
      } else {
        res = P.applyResult(sum.winner === 0, sum, this.rng);
        win = res.win;
        title = win ? '大获全胜' : '惜败';
        var rk = G.RANKS[res.newRank];
        var line = res.starDelta > 0 ? '★ +' + res.starDelta + (res.starDelta > 1 ? '（连胜奖励）' : '') : (res.starDelta < 0 ? '★ -1' : (res.protect ? '段位保护，不掉星' : ''));
        rows.push(h('div', { class: 'res-rank' }, rankLabel(rk), h('div', { class: 'stars', html: rk.tier === '大帝' ? '<i class="star on">★</i> × ' + P.subStars() : starsHtml(P.subStars(), rk.stars) }), h('div', { class: 'res-delta ' + (res.starDelta > 0 ? 'up' : 'down') }, line)));
        if (res.newRank > res.oldRank) rows.push(h('div', { class: 'res-up' }, '晋升！' + rankLabel(rk)));
        again = function () { self.startMatch(); };
      }
      rows.push(h('div', { class: 'res-line' }, '击杀 ' + sum.kills + ' · 第 ' + sum.wave + ' 波 · 用时 ' + Math.floor(sum.time / 60) + '分' + Math.floor(sum.time % 60) + '秒'));
      var rew = h('div', { class: 'rewards' });
      if (res.gold) rew.appendChild(h('div', { class: 'rw gold' }, h('i', { class: 'coin' }, '刀'), '+' + res.gold));
      (res.frags || []).forEach(function (id) { var w = G.WEAPON[id]; rew.appendChild(h('div', { class: 'rw frag', style: 'border-color:' + G.RARITY_COLOR[w.rarity] + ';color:' + G.RARITY_COLOR[w.rarity] }, w.name + ' 碎片')); });
      (res.souls || []).forEach(function (gid) { rew.appendChild(h('div', { class: 'rw soul' }, G.GEN[gid].name + ' 将魂 ' + (P.data.souls[gid] || 0) + '/' + G.GEN[gid].unlock.frag)); });
      rows.push(rew);
      if (sum.top && sum.top.length) {
        rows.push(h('div', { class: 'mvp-title' }, '本局输出'));
        var maxD = Math.max.apply(null, sum.top.map(function (u) { return u.dmgDone; })) || 1;
        rows.push(h('div', { class: 'mvp' }, sum.top.map(function (u) {
          var name = u.kind === 'general' ? G.GEN[u.gen].name + ' ' + u.lvl + '星' : (u.kind === 'part' ? G.GEN[u.gen].parts[u.part] : (u.kind === 'farmer' ? '农' : G.SOLDIERS[u.key].ch) + ' ' + u.lvl + '级');
          return h('div', { class: 'mvp-row' }, h('span', { class: 'mvp-name' }, name), h('span', { class: 'mvp-bar' }, h('i', { style: 'width:' + Math.round(u.dmgDone / maxD * 100) + '%' })), h('span', { class: 'mvp-n' }, G.fmt(u.dmgDone)));
        })));
      }
      var btns = [h('button', { class: 'btn red', onclick: function () { A.play('click'); again(); } }, againText)];
      if (b.mode === 'campaign' && this._next && win) {
        var nx = this._next; this._next = null;
        btns.unshift(h('button', { class: 'btn red', onclick: function () { A.play('click'); self.showCampaign(); nx(); } }, '下一关'));
        btns[1].className = 'btn ghost';
      }
      btns.push(h('button', { class: 'btn ghost', onclick: function () { A.play('click'); if (b.mode === 'campaign') self.showCampaign(); else if (b.mode === 'daily') self.showDaily(); else self.showHome(); } }, b.mode === 'campaign' ? '返回战役' : (b.mode === 'daily' ? '看排行' : '返回主城')));
      var box = h('div', { class: 'result ' + (win === false ? 'lose' : 'win') },
        h('div', { class: 'res-title' }, title), rows,
        h('div', { class: 'modal-btns' }, btns)
      );
      var wrap = h('div', { class: 'modal-wrap result-wrap' }, box);
      this.root.appendChild(wrap);
      if (res.newGens && res.newGens.length) setTimeout(function () { self.announceGenerals(res.newGens); }, 600);
    },

    // ───────────────── 锦囊 ─────────────────
    showCards: function () {
      var self = this, d = P.data;
      d.seenCards = d.seenCards || {};
      G.CARDS.forEach(function (c) { if (P.cardUnlocked(c.id)) d.seenCards[c.id] = 1; });
      d.seenSkills = d.seenSkills || {};
      G.SKILLS.forEach(function (k) { if (P.skillUnlocked(k.id)) d.seenSkills[k.id] = 1; });
      P.save();
      var list = h('div', { class: 'card-list' }, G.CARDS.map(function (c) {
        var un = P.cardUnlocked(c.id), on = d.cards.indexOf(c.id) >= 0 && un;
        var lock = c.unlock.rank != null ? '达到「' + rankLabel(G.RANKS[c.unlock.rank]) + '」解锁' : '通关战役「' + G.CAMP[c.unlock.camp].name + '」解锁';
        return h('div', { class: 'card-item' + (un ? '' : ' locked') + (on ? ' on' : ''), onclick: function () {
          if (!un) { self.toast(lock); return; }
          A.play('click'); P.toggleCard(c.id); self.showCards();
        } },
          h('div', { class: 'ci-pouch' }, c.ch),
          h('div', { class: 'ci-main' }, h('b', null, c.name), h('div', { class: 'ci-desc' }, c.desc), un ? null : h('div', { class: 'ci-lock' }, lock)),
          on ? h('i', { class: 'deck-badge' }, '携带') : null);
      }));
      var skills = h('div', { class: 'card-list' }, G.SKILLS.map(function (k) {
        var un = P.skillUnlocked(k.id), on = d.skills.indexOf(k.id) >= 0 && un;
        var lock = k.unlock.rank != null ? '达到「' + rankLabel(G.RANKS[k.unlock.rank]) + '」解锁' : '通关战役「' + G.CAMP[k.unlock.camp].name + '」解锁';
        return h('div', { class: 'card-item skill' + (un ? '' : ' locked') + (on ? ' on' : ''), onclick: function () {
          if (!un) { self.toast(lock); return; }
          A.play('click'); P.toggleSkill(k.id); self.showCards();
        } },
          h('div', { class: 'ci-orb' }, k.ch),
          h('div', { class: 'ci-main' }, h('b', null, k.name, h('span', { class: 'ci-cd' }, '冷却 ' + k.cd + ' 秒')), h('div', { class: 'ci-desc' }, k.desc), un ? null : h('div', { class: 'ci-lock' }, lock)),
          on ? h('i', { class: 'deck-badge' }, '携带') : null);
      }));
      var el = this.page('锦囊军令', h('div', null,
        h('div', { class: 'page-sub' }, '军令', h('small', null, '可以反复使用，冷却好了再放 · 已选 ' + P.activeSkills().length + '/' + G.SKILL_SLOTS)),
        h('div', { class: 'page-tip' }, '左下角两个圆按钮。点一下，再点我方路上的位置就能施放；电脑上按 Z / X。'),
        skills,
        h('div', { class: 'page-sub' }, '锦囊', h('small', null, '每局各用一次 · 已选 ' + P.activeCards().length + '/' + G.CARD_SLOTS)),
        h('div', { class: 'page-tip' }, '右下角的锦囊袋。点一下看说明，再点一下发动；电脑上按 Q / E。'),
        list));
      this.setScreen(el, 'cards');
    },

    // ───────────────── 长坂坡战役 ─────────────────
    showCampaign: function () {
      var self = this, d = P.data;
      var list = h('div', { class: 'camp-list' }, G.CAMPAIGN.map(function (lv, i) {
        var un = P.campUnlocked(i), st = d.campaign[lv.id] || 0;
        return h('div', { class: 'camp-item' + (un ? '' : ' locked') + (st ? ' done' : ''), onclick: function () {
          if (!un) { self.toast('先通关上一关'); return; }
          A.play('click'); self.campDetail(i);
        } },
          h('div', { class: 'camp-no' }, '第' + G.cnNum(i + 1) + '回'),
          h('div', { class: 'camp-main' }, h('div', { class: 'camp-name' }, lv.name), h('div', { class: 'camp-sub' }, G.MAPS[lv.map].name + ' · 守 ' + lv.waves + ' 波' + (lv.rules.deck ? ' · ' + lv.rules.deck.map(function (g) { return G.GEN[g].name; }).join('') : ''))),
          h('div', { class: 'stars small', html: un ? starsHtml(st, 3) : '<span class="lock-ic">锁</span>' }));
      }));
      var el = this.page('长坂坡', h('div', null,
        h('div', { class: 'page-tip' }, '按三国故事一回一回打下去，每回都有特别的规矩。不丢心三星，最多丢一颗心两星。已得 ' + P.campStars() + ' / ' + G.CAMPAIGN.length * 3 + ' 星。'),
        list));
      this.setScreen(el, 'camp');
    },

    campDetail: function (i) {
      var self = this, lv = G.CAMPAIGN[i], r = lv.rules;
      var rulesTxt = [];
      if (r.deck) rulesTxt.push('出战武将：' + r.deck.map(function (g) { return G.GEN[g].name; }).join('、') + '（用你给他们装的兵器）');
      else rulesTxt.push('出战武将：你自己的出战阵容');
      if (r.soldiers) rulesTxt.push('只招：' + r.soldiers.map(function (k) { return G.SOLDIERS[k].ch; }).join('、'));
      if (r.hearts) rulesTxt.push('阿斗只有 ' + r.hearts + ' 颗心');
      if (r.weather) rulesTxt.push('天气：' + G.WEATHER[r.weather].name);
      if (r.bosses) rulesTxt.push('Boss：' + Object.keys(r.bosses).map(function (w) { return '第' + w + '波 ' + G.BOSSES[r.bosses[w]].name; }).join('，'));
      var rw = lv.reward, rwTxt = ['铜钱 ' + rw.gold];
      if (rw.frags) rwTxt.push('兵器碎片 ×' + rw.frags);
      if (rw.card) rwTxt.push('锦囊「' + G.CARD[rw.card].name + '」');
      if (rw.souls) Object.keys(rw.souls).forEach(function (g) { rwTxt.push(G.GEN[g].name + '将魂 ×' + rw.souls[g]); });
      var body = h('div', { class: 'camp-detail' },
        h('p', { class: 'cd-story' }, lv.story),
        h('ul', { class: 'cd-rules' }, rulesTxt.map(function (t) { return h('li', null, t); })),
        h('p', { class: 'cd-tip' }, '提示：' + lv.tip),
        h('p', { class: 'cd-reward' }, '首次通关：' + rwTxt.join('、')));
      this.modal('第' + G.cnNum(i + 1) + '回 · ' + lv.name, body, [{ text: '出征', cls: 'red', fn: function () { self.startCampaign(lv); } }]);
    },

    // ───────────────── 每日挑战 ─────────────────
    showDaily: function (board) {
      var self = this, d = P.data, cfg = G.dailyConfig(G.cnDay());
      board = board || 'today';
      var w = G.WEATHER[cfg.weather];
      var mine = d.daily.day === cfg.day ? d.daily.best : 0;
      var lb = h('div', { class: 'lb' }, h('div', { class: 'lb-loading' }, '正在读取排行榜…'));
      var head = h('div', { class: 'daily-head' },
        h('div', { class: 'dh-date' }, cfg.day.slice(5).replace('-', '月') + '日 · ' + G.MAPS[cfg.map].name),
        h('div', { class: 'dh-row' }, '天气：' + w.name + ' — ' + w.desc),
        h('div', { class: 'dh-gens' }, cfg.deck.map(function (gid) {
          var wp = G.WEAPON[cfg.weapons[gid].id];
          return h('span', { class: 'mini-gen big' }, G.GEN[gid].name, h('small', { style: 'color:' + G.RARITY_COLOR[wp.rarity] }, wp.name));
        })),
        h('div', { class: 'dh-row' }, '军令：' + cfg.skills.map(function (c) { return G.SKILL[c].name; }).join('、') + ' · 锦囊：' + cfg.cards.map(function (c) { return G.CARD[c].name; }).join('、')),
        h('div', { class: 'dh-row' }, '今日最佳：' + (mine ? G.fmt(mine) + ' 分' : '还没挑战') + (d.daily.rewarded === cfg.day ? '' : ' · 首次挑战送 150 铜钱和 2 块碎片')),
        h('button', { class: 'btn big red', onclick: function () { A.play('click'); self.startDaily(); } }, '开始挑战'));
      var tabs = h('div', { class: 'tabs' },
        h('button', { class: 'tab' + (board === 'today' ? ' on' : ''), onclick: function () { self.showDaily('today'); } }, '今日榜'),
        h('button', { class: 'tab' + (board === 'all' ? ' on' : ''), onclick: function () { self.showDaily('all'); } }, '总榜'));
      var el = this.page('每日挑战', h('div', null,
        h('div', { class: 'page-tip' }, '每天北京时间 0 点换题：所有人同一张图、同一套武将兵器、同一种天气。守的波数越多、杀敌越多分越高。'),
        head, tabs, lb));
      this.setScreen(el, 'daily');
      G.Board.list(board, d.pid).then(function (r) {
        if (self.screen !== 'daily') return;
        lb.innerHTML = '';
        if (!r) { lb.appendChild(h('div', { class: 'lb-loading' }, '排行榜还没开通。部署到 Cloudflare 并绑定 KV 后就有全球排行（见 README）。')); return; }
        if (!r.list.length) { lb.appendChild(h('div', { class: 'lb-loading' }, '还没有人上榜，快来当第一个！')); return; }
        r.list.forEach(function (e) {
          lb.appendChild(h('div', { class: 'lb-row' + (e.me ? ' me' : '') },
            h('span', { class: 'lb-rank' + (e.rank <= 3 ? ' top' : '') }, String(e.rank)),
            h('span', { class: 'lb-name' }, e.name), h('span', { class: 'lb-wave' }, '第' + e.wave + '波'), h('span', { class: 'lb-score' }, G.fmt(e.score))));
        });
        if (r.mine && r.mine.rank > 50) lb.appendChild(h('div', { class: 'lb-row me' }, h('span', { class: 'lb-rank' }, String(r.mine.rank)), h('span', { class: 'lb-name' }, '我'), h('span', { class: 'lb-wave' }, ''), h('span', { class: 'lb-score' }, G.fmt(r.mine.score))));
      });
    },

    // ───────────────── 武将 ─────────────────
    showGenerals: function () {
      var self = this, d = P.data;
      d.seenGens = true; P.save();
      var grid = h('div', { class: 'gen-grid' }, G.GENERALS.map(function (g) {
        var un = P.genUnlocked(g.id), inDeck = d.deck.indexOf(g.id) >= 0;
        var wid = d.equip[g.id], w = wid != null ? G.WEAPON[wid] : null;
        var lock = !un ? (g.unlock.rank != null ? rankLabel(G.RANKS[g.unlock.rank]) + ' 解锁' : '将魂 ' + (d.souls[g.id] || 0) + '/' + g.unlock.frag) : '';
        return h('div', { class: 'gen-card' + (un ? ' unlocked' : ' locked') + (inDeck ? ' in-deck' : ''), onclick: function () { A.play('click'); self.genDetail(g.id); } },
          inDeck ? h('i', { class: 'deck-badge' }, '出战') : null,
          h('div', { class: 'gen-chars' }, g.name),
          h('div', { class: 'gen-type' }, G.WTYPE[g.type]),
          un ? h('div', { class: 'gen-w', style: w ? 'color:' + G.RARITY_COLOR[w.rarity] : '' }, w ? w.name : '无兵器') : h('div', { class: 'gen-lock' }, lock)
        );
      }));
      var el = this.page('武将', h('div', null,
        h('div', { class: 'page-tip' }, '最多带 ' + G.DECK_SIZE + ' 名武将出战（已选 ' + d.deck.length + '）。只有出战武将的名字会在征兵时出现。'),
        grid));
      this.setScreen(el, 'gens');
    },

    genDetail: function (id) {
      var self = this, d = P.data, g = G.GEN[id];
      var un = P.genUnlocked(id), inDeck = d.deck.indexOf(id) >= 0;
      var wid = d.equip[id];
      var owned = G.WEAPONS.filter(function (w) { return w.type === g.type && P.weapon(w.id).star > 0; });
      var wlist = h('div', { class: 'w-pick' }, owned.length ? owned.map(function (w) {
        var holder = Object.keys(d.equip).filter(function (k) { return d.equip[k] === w.id && k !== id; })[0];
        return h('button', { class: 'w-opt' + (wid === w.id ? ' on' : ''), style: 'border-color:' + G.RARITY_COLOR[w.rarity], onclick: function () {
          if (!un) return;
          A.play('click');
          P.equipWeapon(id, w.id); m.close(); self.genDetail(id);
        } }, h('b', { style: 'color:' + G.RARITY_COLOR[w.rarity] }, w.name + ' ' + '★'.repeat(P.weapon(w.id).star)), h('small', null, (w.ex === id ? '【专属】' : '') + w.desc + (holder ? '（' + G.GEN[holder].name + '在用）' : '')));
      }) : h('div', { class: 'muted' }, '还没有' + G.WTYPE[g.type] + '类兵器'));
      var lockTxt = g.unlock.rank != null ? '达到「' + rankLabel(G.RANKS[g.unlock.rank]) + '」解锁' : '收集 ' + g.unlock.frag + ' 个将魂解锁（当前 ' + (d.souls[id] || 0) + '）';
      var body = h('div', { class: 'gen-detail' },
        h('div', { class: 'gd-head' }, h('div', { class: 'gd-chars' }, g.name), h('div', null, h('div', { class: 'gd-title' }, g.title), h('div', { class: 'gd-type' }, '兵器：' + G.WTYPE[g.type] + ' · 名字：' + g.parts.join(' + ')))),
        h('div', { class: 'gd-skill' }, h('b', null, g.skill), '：' + g.desc),
        un ? null : h('div', { class: 'gd-lock' }, lockTxt),
        h('div', { class: 'gd-sub' }, '兵器（只能装' + G.WTYPE[g.type] + '）'),
        wlist
      );
      var btns = [];
      if (un) btns.push({ text: inDeck ? '下阵' : '出战', cls: inDeck ? 'ghost' : 'red', fn: function () {
        if (!P.toggleDeck(id)) self.toast(inDeck ? '至少要留一名武将' : '出战武将已满（' + G.DECK_SIZE + '名）');
        self.showGenerals();
      } });
      var m = this.modal(g.name, body, btns);
    },

    // ───────────────── 兵器 ─────────────────
    showWeapons: function (type) {
      var self = this, d = P.data;
      type = type || 0;
      var tabs = h('div', { class: 'tabs' }, G.WTYPE.map(function (t, i) {
        var dot = G.WEAPONS.some(function (w) { return w.type === i && (P.canUnlock(w.id) || P.canUpgrade(w.id)); });
        return h('button', { class: 'tab' + (i === type ? ' on' : ''), onclick: function () { A.play('click'); self.showWeapons(i); } }, t, dot ? h('i', { class: 'dot' }) : null);
      }));
      var list = h('div', { class: 'w-list' }, G.WEAPONS.filter(function (w) { return w.type === type; }).sort(function (a, b) { return a.rarity - b.rarity || a.id - b.id; }).map(function (w) {
        var st = P.weapon(w.id);
        var need = st.star === 0 ? w.frag : (st.star < G.WEAPON_MAX_STAR ? G.weaponStarCost(w, st.star) : 0);
        var holder = Object.keys(d.equip).filter(function (k) { return d.equip[k] === w.id; })[0];
        var can = P.canUnlock(w.id) || P.canUpgrade(w.id);
        return h('div', { class: 'w-item' + (st.star ? ' owned' : '') },
          h('div', { class: 'w-icon', style: 'background:' + G.RARITY_COLOR[w.rarity] }, w.name.charAt(0)),
          h('div', { class: 'w-main' },
            h('div', { class: 'w-name' }, h('b', { style: 'color:' + G.RARITY_COLOR[w.rarity] }, w.name), ' ', h('span', { class: 'rar' }, G.RARITY[w.rarity]), st.star ? h('span', { class: 'wstar' }, '★'.repeat(st.star)) : null, w.ex ? h('span', { class: 'ex' }, '专属·' + G.GEN[w.ex].name) : null),
            h('div', { class: 'w-desc' }, w.desc),
            h('div', { class: 'w-meta' }, '攻击 +' + Math.round(G.weaponAtk(w, Math.max(1, st.star))) + (holder ? ' · ' + G.GEN[holder].name + '佩戴中' : '')),
            need ? h('div', { class: 'frag-bar' }, h('i', { style: 'width:' + Math.min(100, st.frag / need * 100) + '%' }), h('span', null, '碎片 ' + st.frag + '/' + need)) : h('div', { class: 'w-meta' }, '已满星（碎片 ' + st.frag + '）')
          ),
          can ? h('button', { class: 'btn small red', onclick: function () {
            if (P.unlockWeapon(w.id)) { A.play('unlock'); self.toast((st.star ? '升星成功：' : '合成成功：') + w.name); self.showWeapons(type); }
          } }, st.star ? '升星' : '合成') : null
        );
      }));
      var el = this.page('兵器', h('div', null, h('div', { class: 'page-tip' }, '打赢对局、开宝箱可以得到兵器碎片。碎片凑齐合成兵器，再给对应的武将装上。'), tabs, list));
      this.setScreen(el, 'arms');
    },

    // ───────────────── 军需 ─────────────────
    showShop: function () {
      var self = this, d = P.data;
      var sup = h('div', { class: 'shop-list' }, G.SUPPLIES.map(function (s) {
        var own = d.supplies[s.id] || 0;
        return h('div', { class: 'shop-item' },
          h('div', { class: 'si-icon' }, s.ch),
          h('div', { class: 'si-main' }, h('b', null, s.name), h('div', { class: 'si-desc' }, s.desc),
            h('label', { class: 'chk small' }, h('input', { type: 'checkbox', disabled: own ? null : 'disabled', checked: d.use[s.id] && own ? 'checked' : null, onchange: function (e) { d.use[s.id] = e.target.checked; P.save(); } }), ' 下局带上（库存 ' + own + '）')),
          h('button', { class: 'btn small gold', onclick: function () {
            if (P.buySupply(s.id)) { A.play('coin'); self.showShop(); } else { A.play('error'); self.toast('铜钱不够'); }
          } }, h('i', { class: 'coin' }, '刀'), String(s.price))
        );
      }));
      var chests = h('div', { class: 'shop-list' }, G.CHESTS.map(function (c) {
        return h('div', { class: 'shop-item chest' },
          h('div', { class: 'si-icon box' }, '匣'),
          h('div', { class: 'si-main' }, h('b', null, c.name), h('div', { class: 'si-desc' }, c.desc)),
          h('button', { class: 'btn small gold', onclick: function () {
            var got = P.buyChest(c.id, self.rng);
            if (!got) { A.play('error'); self.toast('铜钱不够'); return; }
            A.play('unlock');
            self.modal('开箱', h('div', { class: 'rewards' }, got.map(function (id) { var w = G.WEAPON[id]; return h('div', { class: 'rw frag', style: 'border-color:' + G.RARITY_COLOR[w.rarity] + ';color:' + G.RARITY_COLOR[w.rarity] }, w.name + ' 碎片'); })), [{ text: '收下', cls: 'red' }], { onClose: function () { self.showShop(); } });
          } }, h('i', { class: 'coin' }, '刀'), String(c.price))
        );
      }));
      var el = this.page('军需', h('div', null,
        h('div', { class: 'page-gold' }, '铜钱 ', h('i', { class: 'coin' }, '刀'), G.fmt(d.gold)),
        h('div', { class: 'page-sub' }, '出征补给', h('small', null, '勾选后下一局自动使用，用完即止')), sup,
        h('div', { class: 'page-sub' }, '兵器宝箱'), chests));
      this.setScreen(el, 'shop');
    },

    // ───────────────── 段位 ─────────────────
    showRanks: function () {
      var self = this, cur = P.rankIdx();
      var tiers = G.TIERS.map(function (t) {
        var rs = G.RANKS.filter(function (r) { return r.tier === t; });
        var first = rs[0];
        var gens = G.GENERALS.filter(function (g) { return g.unlock.rank != null && rs.some(function (r) { return r.idx === g.unlock.rank; }); });
        var here = rs.some(function (r) { return r.idx === cur; });
        var done = rs[rs.length - 1].idx < cur;
        return h('div', { class: 'tier' + (here ? ' here' : '') + (done ? ' done' : '') },
          h('div', { class: 'tier-name' }, t),
          h('div', { class: 'tier-info' },
            h('div', null, '战场：' + uniq(rs.map(function (r) { return G.MAPS[r.map].name; })).join(' / ') + ' · 胜利奖励 ' + first.reward + '+ 铜钱'),
            gens.length ? h('div', { class: 'tier-gen' }, '解锁武将：' + gens.map(function (g) { return g.name; }).join('、')) : null,
            here ? h('div', { class: 'tier-here' }, '你在这里：' + rankLabel(G.RANKS[cur])) : null)
        );
      });
      var el = this.page('段位', h('div', null,
        h('div', { class: 'page-tip' }, '赢一局得一颗星，三连胜起每局得两颗；输了掉一颗星（军士、校尉每个小段的第一颗星不会掉）。段位越高，对手越强，贼兵越多血。'),
        h('div', { class: 'tiers' }, tiers.reverse())));
      this.setScreen(el, 'ranks');
      function uniq(a) { return a.filter(function (x, i) { return a.indexOf(x) === i; }); }
    },

    page: function (title, body) {
      var self = this;
      return h('div', { class: 'screen page' },
        h('div', { class: 'page-head' }, h('button', { class: 'back', onclick: function () { A.play('click'); self.showHome(); } }, '‹ 返回'), h('div', { class: 'page-title' }, title)),
        h('div', { class: 'page-body' }, body));
    },

    // ───────────────── 设置与帮助 ─────────────────
    showSettings: function () {
      var self = this, s = P.data.settings;
      var nameIn = h('input', { type: 'text', maxlength: 8, value: P.data.name || '', placeholder: '常山赵子龙', onchange: function (e) { P.data.name = e.target.value.trim().slice(0, 8); P.save(); } });
      var body = h('div', { class: 'pause-body' },
        h('div', { class: 'vol-row' }, h('span', null, '名号'), nameIn),
        volRow('音乐', 'music'), volRow('音效', 'sfx'),
        h('label', { class: 'chk' }, h('input', { type: 'checkbox', id: 'opt-dmg', checked: s.dmg ? 'checked' : null, onchange: function (e) { s.dmg = e.target.checked; P.save(); } }), ' 显示伤害数字'),
        h('label', { class: 'chk' }, h('input', { type: 'checkbox', id: 'opt-vib', checked: s.vibrate !== false ? 'checked' : null, onchange: function (e) { s.vibrate = e.target.checked; G.hapticOn = s.vibrate; P.save(); G.haptic(20); } }), ' 震动反馈（部分安卓手机）'),
        h('div', { class: 'save-row' },
          h('button', { class: 'btn small ghost', onclick: function () { A.play('click'); self.showExport(); } }, '导出存档码'),
          h('button', { class: 'btn small ghost', onclick: function () { A.play('click'); self.showImport(); } }, '导入存档码')),
        h('div', { class: 'muted small' }, '电脑上：空格 征兵 · 1~5 选营里的兵 · Q/E 锦囊 · F 倍速 · Esc 暂停'),
        h('div', { class: 'muted small' }, '版本 ' + G.VERSION + ' · 字体：马善政毛笔楷书（SIL OFL）'),
        h('button', { class: 'btn ghost small danger', onclick: function () {
          self.confirm('清空所有进度（段位、兵器、铜钱）？此操作无法撤销。', function () { P.reset(); self.showHome(); });
        } }, '清空存档')
      );
      function volRow(label, key) {
        return h('div', { class: 'vol-row' }, h('span', null, label), h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: s[key], oninput: function (e) { s[key] = +e.target.value; A.setVolumes(s.music, s.sfx); P.save(); } }));
      }
      this.modal('设置', body, [{ text: '好', cls: 'red' }]);
    },

    showExport: function () {
      var self = this, code = P.exportCode();
      var ta = h('textarea', { class: 'save-code', id: 'save-export', readonly: 'readonly', rows: 6 });
      ta.value = code;
      this.modal('导出存档', h('div', null, h('p', { class: 'help-text' }, '把这串存档码保存好（比如发给自己）。换手机、清了浏览器缓存后，用「导入存档码」就能恢复进度。'), ta), [
        { text: '复制', cls: 'red', fn: function () {
          var ok = function () { self.toast('已复制存档码'); };
          var fallback = function () { ta.focus(); ta.select(); try { document.execCommand('copy'); ok(); } catch (e) { self.toast('请长按文本框手动复制'); } };
          if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(code).then(ok, fallback); else fallback();
          return true;
        } },
        { text: '关闭', cls: 'ghost' }
      ]);
    },
    showImport: function () {
      var self = this;
      var ta = h('textarea', { class: 'save-code', id: 'save-import', rows: 6, placeholder: '把 ZYAD1: 开头的存档码粘贴到这里' });
      var err = h('div', { class: 'save-err' });
      this.modal('导入存档', h('div', null, h('p', { class: 'help-text' }, '导入会覆盖本机现在的进度。'), ta, err), [
        { text: '导入', cls: 'red', fn: function () {
          var e = P.importCode(ta.value);
          if (e) { err.textContent = e; A.play('error'); return true; }
          A.setVolumes(P.data.settings.music, P.data.settings.sfx);
          self.toast('存档已恢复');
          self.showHome();
        } },
        { text: '取消', cls: 'ghost' }
      ]);
    },

    showHelp: function (onClose) {
      var html = [
        '<h4>怎么赢</h4>双方各守一个阿斗（头顶三颗心）。贼兵沿红色箭头出发，走到阿斗跟前就会让他掉一颗心，Boss 掉两颗。<b>先把对手的心打光</b>的一方获胜。',
        '<h4>征兵</h4>点<b>征兵</b>花馒头招来 5 个字，放在下方的“营”里。再征一次会把营里没用掉的字全部换掉，所以先挑有用的拖上场。每征一次价格会涨。',
        '<h4>排兵布阵</h4>把字拖到<b>白色营地</b>上。拖动时会显示射程圈：<b>刀、骑</b>只能打身边一圈，<b>枪</b>远一点，<b>弓</b>最远。场上的兵可以随时拖动换位。',
        '<h4>合成</h4>两个<b>相同等级、相同的字</b>叠在一起会升一级，伤害翻倍还腾出一块地。<b>武将</b>由两个字组成：把“赵”和“云”拼起来，赵子龙就来了；再拼上“赵”或“云”还能继续升星。',
        '<h4>馒头</h4>打死贼兵、每波开始都会得馒头。<b>农</b>夫不会打仗，但会定时蒸馒头，而且可以直接种在草地上，不占营地。把用不上的兵拖回“营”能换回一些馒头。',
        '<h4>道具</h4>营里会刷出红色的道具：<b>铲</b>可以把我方草地挖成营地（经常出，没用完的会收进右边的军需栏），<b>令</b>直接升一级，<b>砚</b>把兵变成别的兵，<b>雷</b>埋在路上，<b>鼓</b>全军加速，<b>丹</b>给阿斗回一颗心。',
        '<h4>贼兵</h4><b>寇</b>跑得快，<b>匪</b>血厚，<b>甲</b>穿重甲（枪可以无视），<b>巫</b>会给同伙回血，<b>盗</b>身上揣着馒头。每 5 波来一个 Boss。',
        '<h4>字阵羁绊</h4>相邻的两个字连成词有加成：<b>刀枪</b>伤害、<b>弓骑</b>攻速、<b>枪骑</b>冲锋更快、<b>农</b>挨着兵会<b>屯田</b>多产馒头。三个同种兵连成一线是<b>长蛇阵</b>，刀枪弓骑围成田字是<b>四象阵</b>。武将也有羁绊：刘关张同场<b>桃园结义</b>、五虎到三位<b>五虎上将</b>……场上会画出连线。点顶部的波次可以查看我方羁绊和下一波敌情。',
        '<h4>军令（可反复使用）</h4>左下角两个圆按钮：箭雨、落石、拒马、擂鼓、天雷、阿斗大哭……点一下，再点我方路上的位置施放，冷却好了还能再放。',
        '<h4>锦囊</h4>每局带两个锦囊（空城计、火攻、草船借箭……），右下角点一下看说明、再点一下发动，每个只能用一次。对手也会用，小心「借刀杀人」把贼兵丢到你这边。',
        '<h4>天气与事件</h4>每局天气不同：大雾射程变短、东风火势更旺、暴雨贼兵变慢、夜袭贼多馒头也多。每隔几波还会有随机事件，比如天降粮草、流民投军、疫病流行。',
        '<h4>养成</h4>赢了升段位、拿铜钱和兵器碎片。在<b>兵器</b>里合成兵器，在<b>武将</b>里给武将装上，并挑最多 4 名武将出战。',
        '<h4>更多玩法</h4><b>战役</b>：按长坂坡的故事一回一回打，每回规矩不同，通关送锦囊。<b>每日挑战</b>：每天所有人打同一局，比分数上全球排行。<b>无尽守城</b>：一个人能守多少波。'
      ].join('');
      this.modal('玩法说明', h('div', { class: 'help-text', html: html }), [{ text: '明白了', cls: 'red' }], { onClose: onClose, cls: 'tall' });
    }
  };

  G.App = App;
})(window);

/* 赵云与阿斗 · 战斗模拟
 * 纯逻辑，不碰 DOM。坐标单位是“格”，(0,0) 在地图左上角。
 * side 0 = 我方（下半场），side 1 = 对手（上半场，地图旋转 180°）。
 */
(function (root) {
  'use strict';
  var G = root.G = root.G || {};
  var W = 8, H = 10;
  var CAMP = 5;

  function rot(p) { return [W - 1 - p[0], H - 1 - p[1]]; }
  function d2(ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }

  // ───────────────────────── 行军路线 ─────────────────────────
  function Lane(waypoints) {
    this.pts = waypoints.map(function (p) { return { x: p[0] + 0.5, y: p[1] + 0.5 }; });
    this.cum = [0];
    for (var i = 1; i < this.pts.length; i++) {
      var a = this.pts[i - 1], b = this.pts[i];
      this.cum.push(this.cum[i - 1] + Math.abs(b.x - a.x) + Math.abs(b.y - a.y));
    }
    this.len = this.cum[this.cum.length - 1];
    // 路线经过的格子
    this.cells = [];
    var seen = {};
    for (i = 1; i < this.pts.length; i++) {
      var p0 = waypoints[i - 1], p1 = waypoints[i];
      var dx = Math.sign(p1[0] - p0[0]), dy = Math.sign(p1[1] - p0[1]);
      var x = p0[0], y = p0[1];
      for (;;) {
        var k = x + ',' + y;
        if (!seen[k]) { seen[k] = 1; this.cells.push([x, y, this.distOfCell(x, y, i - 1)]); }
        if (x === p1[0] && y === p1[1]) break;
        x += dx; y += dy;
      }
    }
  }
  Lane.prototype.distOfCell = function (x, y, seg) {
    var a = this.pts[seg];
    return this.cum[seg] + Math.abs(x + 0.5 - a.x) + Math.abs(y + 0.5 - a.y);
  };
  Lane.prototype.pos = function (d, lat) {
    if (d <= 0) d = 0;
    if (d >= this.len) d = this.len;
    var i = 1;
    while (i < this.cum.length - 1 && this.cum[i] < d) i++;
    var a = this.pts[i - 1], b = this.pts[i];
    var segLen = this.cum[i] - this.cum[i - 1] || 1;
    var t = (d - this.cum[i - 1]) / segLen;
    var dx = (b.x - a.x) / segLen, dy = (b.y - a.y) / segLen;
    var x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
    if (lat) { x += -dy * lat; y += dx * lat; }
    return { x: x, y: y, dx: dx, dy: dy };
  };
  // 离某点最近的路线位置
  Lane.prototype.nearestDist = function (x, y) {
    var best = 0, bd = 1e9;
    for (var d = 0; d <= this.len; d += 0.25) {
      var p = this.pos(d);
      var dd = d2(p.x, p.y, x, y);
      if (dd < bd) { bd = dd; best = d; }
    }
    return best;
  };

  // ───────────────────────── 战斗 ─────────────────────────
  function Battle(cfg) {
    this.cfg = cfg;
    this.mode = cfg.mode || 'pvp';
    this.rng = G.makeRng(cfg.seed || (Date.now() & 0xffffffff));
    this.map = G.MAPS[cfg.mapId || 0];
    this.rank = G.RANKS[cfg.rankIdx || 0];
    this.t = 0;
    this.state = 'intro';
    this.introT = cfg.introT != null ? cfg.introT : 3;
    this.wave = 0;
    this.waveT = 0;
    this.waveDur = 0;
    this.waveSpawns = [];
    this.nextId = 1;
    this.ev = [];
    this.projs = [];
    this.sweeps = [];
    this.zones = [];
    this.blasts = [];
    this.snakes = [];
    this.mines = [];
    this.barriers = [];
    this.winner = -1;
    this.drops = [];
    this.bossKills = [];
    this.tutorial = !!cfg.tutorial;
    this.rules = cfg.rules || {};
    this.solo = this.mode !== 'pvp';
    this.targetWaves = cfg.waves || 0;
    this.weather = cfg.weather || 'clear';
    this.eventsOn = cfg.events != null ? !!cfg.events : (this.mode === 'pvp' || this.mode === 'endless' || this.mode === 'daily');
    this.lastEventWave = 0;
    this.upcoming = null;
    this.lanes = [new Lane(this.map.path), new Lane(this.map.path.map(rot))];
    this.buildGrid();
    this.sides = [];
    var n = this.solo ? 1 : 2;
    for (var s = 0; s < n; s++) this.sides.push(this.makeSide(s, cfg.sides[s] || {}));
    this.hpMult = 1 + (this.rank.hpAdd || 0) * 0.6;   // 段位加血，前几波慢慢生效
    this.levelHp = cfg.hpMult || 1;                     // 关卡难度，从第一波起就生效
    if (this.tutorial) this.levelHp *= 0.75;
  }
  G.Battle = Battle;
  G.Lane = Lane;
  var B = Battle.prototype;

  B.buildGrid = function () {
    var g = [];
    for (var y = 0; y < H; y++) {
      g.push([]);
      for (var x = 0; x < W; x++) g[y].push({ x: x, y: y, t: 'G', side: y >= 5 ? 0 : 1, unit: null });
    }
    var self = this;
    this.lanes.forEach(function (lane, s) {
      lane.cells.forEach(function (c) { g[c[1]][c[0]].t = 'R'; g[c[1]][c[0]].side = s; g[c[1]][c[0]].ld = c[2]; });
    });
    this.map.build.forEach(function (p) {
      g[p[1]][p[0]].t = 'S';
      var r = rot(p); g[r[1]][r[0]].t = 'S';
    });
    this.grid = g;
    // 墙：两条路线相邻的格边
    var walls = [];
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
      var c = g[y][x];
      if (c.t !== 'R' || c.side !== 0) continue;
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
        var nx = x + d[0], ny = y + d[1];
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) return;
        var o = g[ny][nx];
        if (o.t === 'R' && o.side === 1) walls.push([x, y, nx, ny]);
      });
    }
    this.walls = walls;
    self.gridVersion = 1;
  };

  B.makeSide = function (s, c) {
    var sup = c.supplies || {};
    var side = {
      idx: s,
      name: c.name || (s === 0 ? '我' : '对手'),
      isAI: !!c.isAI,
      difficulty: c.difficulty || 0,
      dmgMult: c.dmgMult || 1,
      deck: (c.deck || ['zhaoyun']).slice(0, G.DECK_SIZE),
      weapons: c.weapons || {},          // genId -> {id, star}
      hearts: (this.rules.hearts || 3) + (sup.heart ? 1 : 0),
      maxHearts: (this.rules.hearts || 3) + (sup.heart ? 1 : 0),
      buns: (this.rules.buns || 20) + (sup.buns ? 40 : 0),
      cards: (c.cards || []).slice(0, G.CARD_SLOTS).map(function (id) { return { id: id, used: false }; }),
      skills: (c.skills || []).slice(0, G.SKILL_SLOTS).map(function (id) { return { id: id, cd: 0, uses: 0 }; }),
      dmgBuffs: [],
      linkT: 0,
      boardVer: 1, bondVer: 0, bonds: [], flags: {},
      recruits: 0,
      freeRecruits: sup.recruit ? 3 : 0,
      camp: [null, null, null, null, null],
      bar: [],                           // 军需栏（不会被征兵刷新掉）
      units: [],
      enemies: [],
      kills: 0, dmg: 0, leaked: 0,
      buffs: [],
      hurtT: -9,
      dangerT: 0,
      bunsEarned: 0
    };
    if (sup.promote) side.bar.push({ kind: 'prop', key: 'promote' });
    if (sup.shovel) {
      // 预先挖开两块与营地相邻的草地
      var dug = 0, self = this;
      for (var pass = 0; pass < 3 && dug < 2; pass++) {
        for (var y = 0; y < H && dug < 2; y++) for (var x = 0; x < W && dug < 2; x++) {
          var cell = this.grid[y][x];
          if (cell.t !== 'G' || cell.side !== s) continue;
          if (this.neighborsOf(x, y).some(function (n) { return self.grid[n[1]][n[0]].t === 'S'; })) { cell.t = 'S'; dug++; }
        }
      }
      this.gridVersion++;
    }
    return side;
  };

  B.neighborsOf = function (x, y) {
    var out = [];
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
      var nx = x + d[0], ny = y + d[1];
      if (nx >= 0 && ny >= 0 && nx < W && ny < H) out.push([nx, ny]);
    });
    return out;
  };

  B.emit = function (e) { if (this.ev.length < 400) this.ev.push(e); };

  // ───────────────────────── 波次 ─────────────────────────
  B.isBossWave = function (n) {
    if (this.rules.bosses) return !!this.rules.bosses[n];
    return n > 0 && n % 5 === 0;
  };
  B.bossFor = function (n) {
    if (this.rules.bosses && this.rules.bosses[n]) return this.rules.bosses[n];
    var k = n / 5 - 1;
    if (this.cfg.rankIdx >= 35 && n % 10 === 0) return G.SPECIAL_BOSSES[(this.rng.int(3))];
    if (this.map.id === 2 && n === 10) return 'lvbu';
    return G.BOSS_ORDER[k % G.BOSS_ORDER.length];
  };
  B.hpScale = function (n) {
    var early = n <= 1 ? 0.5 : n === 2 ? 0.65 : n === 3 ? 0.82 : 1;
    var rankM = 1 + (this.hpMult - 1) * Math.min(1, n / 8);   // 段位加血在前几波慢慢生效
    var late = Math.pow(1.13, Math.max(0, n - 9));            // 后期加压，避免对局拖太久
    return 46 * early * Math.pow(1.19, n - 1) * (1 + 0.03 * n) * rankM * late * this.levelHp;
  };

  B.genWave = function (n) {
    var rng = this.rng;
    var list = [];
    var count = Math.min(30, Math.floor(4.5 + n * 1.0));
    if (n % 3 === 0) count = Math.round(count * 1.25);
    if (this.tutorial && n <= 2) count = Math.max(4, count - 2);
    if (this.rules.countMult) count = Math.round(count * this.rules.countMult);
    if (this.weather === 'night') count = Math.round(count * 1.2);
    var mix = this.rules.mix;
    var weights = mix ? Object.assign({}, mix) : function () {
      var w = { zei: 10, kou: 0, fei: 0, dao: 0, wu: 0, jia: 0 };
      if (n >= 3) w.kou = 3;
      if (n >= 4) w.fei = 2;
      if (n >= 6) w.dao = 1.2;
      if (n >= 7) w.jia = 1.5 + n * 0.05;
      if (n >= 8) w.wu = 1;
      if (n >= 12) { w.fei += 1; w.kou += 1; }
      return w;
    }();
    var keys = Object.keys(weights);
    var wv = keys.map(function (k) { return weights[k]; });
    var t = 0.6;
    var boss = null;
    if (this.targetWaves && n > this.targetWaves) return { list: [], dur: 999, boss: null };
    if (this.isBossWave(n)) {
      boss = this.bossFor(n);
      list.push({ t: 1.5, boss: boss });
      count = Math.round(count * 0.6);
      t = 4;
    }
    // 偶尔来一小撮同种兵
    var pace = Math.max(0.55, 1 - n * 0.022); // 越往后出兵越密
    for (var i = 0; i < count; i++) {
      var key = keys[rng.weighted(wv)];
      list.push({ t: t, type: key });
      t += (key === 'kou' ? 0.55 : (key === 'fei' ? 1.1 : 0.85)) * pace;
      if (rng.chance(0.12)) t += 1.2 * pace;
    }
    var dur = Math.max(14, t + 5) + (boss ? 10 : 0);
    if (this.tutorial && n <= 3) dur += 6;
    return { list: list, dur: dur, boss: boss };
  };

  B.startWave = function () {
    this.wave++;
    var wv = (this.upcoming && this.upcoming.n === this.wave) ? this.upcoming : this.genWave(this.wave);
    this.upcoming = this.genWave(this.wave + 1);
    this.upcoming.n = this.wave + 1;
    this.waveT = 0;
    this.waveDur = wv.dur;
    this.waveSpawns = this.sides.map(function () { return wv.list.slice(); });
    var bonus = this.wave === 1 ? 0 : 10 + 2 * this.wave;
    this.sides.forEach(function (s) { s.buns += bonus; s.bunsEarned += bonus; });
    this.emit({ k: 'wave', n: this.wave, boss: wv.boss });
    // 随机事件：每隔几波来一次，双方同时生效
    if (this.eventsOn && this.wave >= 3 && !wv.boss && this.wave - this.lastEventWave >= 4 && this.rng.chance(0.6)) {
      this.lastEventWave = this.wave;
      this.applyEvent(this.rng.pick(G.EVENTS).id);
    }
  };

  // 下一波预告
  B.nextWaveInfo = function () {
    var u = this.upcoming;
    if (!u || !u.list.length) return null;
    var counts = {};
    u.list.forEach(function (sp) { if (sp.type) counts[sp.type] = (counts[sp.type] || 0) + 1; });
    return { n: u.n, counts: counts, boss: u.boss };
  };

  B.applyEvent = function (id) {
    var self = this;
    this.sides.forEach(function (side) {
      switch (id) {
        case 'grain': side.buns += 30; side.bunsEarned += 30; break;
        case 'volunteer':
          var cells = self.emptyCells(side);
          if (cells.length) {
            var c = self.rng.pick(cells);
            var u = self.newUnit(side, { kind: 'soldier', key: self.rng.pick(['dao', 'qiang', 'gong', 'qi']), lvl: 2 }, c.x, c.y);
            c.unit = u; side.units.push(u); side.boardVer++;
          } else { side.buns += 15; }
          break;
        case 'plague':
          side.enemies.forEach(function (e) { e.hp = Math.max(1, e.hp * (e.boss ? 0.9 : 0.7)); });
          break;
        case 'spy':
          self.rng.shuffle(side.units.filter(function (u) { return u.kind !== 'farmer'; })).slice(0, 2).forEach(function (u) { u.chaosT = 4; });
          break;
        case 'levy':
          var filled = false;
          for (var i = 0; i < 5; i++) if (!side.camp[i]) { side.camp[i] = self.drawItem(side); filled = true; }
          if (!filled) side.buns += 10;
          break;
        case 'cheer': side.buffs.push({ m: 0.25, t: 15 }); break;
      }
    });
    this.emit({ k: 'event', id: id });
  };

  B.spawnEnemy = function (side, sp) {
    var e;
    var scale = this.hpScale(this.wave);
    if (sp.boss) {
      var bd = G.BOSSES[sp.boss];
      var cyc = Math.floor((this.wave - 1) / 20);
      e = this.makeEnemy(side, { ch: bd.name, hp: bd.hp * (1 + cyc * 0.5), spd: bd.spd, bun: 15 }, scale);
      e.boss = sp.boss;
      e.abilityT = 2.5;
      e.lat = 0;
    } else {
      var ed = G.ENEMIES[sp.type];
      e = this.makeEnemy(side, ed, scale);
      e.type = sp.type;
    }
    side.enemies.push(e);
    return e;
  };

  B.makeEnemy = function (side, d, scale) {
    var hp = Math.max(8, Math.round(d.hp * scale));
    var e = {
      id: this.nextId++, side: side.idx, ch: d.ch, maxHp: hp, hp: hp, spd: d.spd,
      bun: d.bun || 1, armor: d.armor || 0, heal: d.heal || 0,
      dist: 0, lat: (this.rng() - 0.5) * 0.34, x: 0, y: 0,
      stunT: 0, slowT: 0, slowMult: 1, charmT: 0, auraSlow: 1,
      burnT: 0, burnDps: 0, poisonT: 0, poisonDps: 0,
      markT: 0, markDmg: 0, markSrc: null,
      hitBy: {}, lastHurtT: -9, invisT: 0, dashT: 0, dead: false, born: this.t, hurtFx: 0
    };
    var p = this.lanes[side.idx].pos(0, e.lat);
    e.x = p.x; e.y = p.y;
    return e;
  };

  // ───────────────────────── 主循环 ─────────────────────────
  B.update = function (dt) {
    if (this.state === 'over') return;
    this.t += dt;
    if (this.state === 'intro') {
      this.introT -= dt;
      if (this.introT <= 0) { this.state = 'run'; this.startWave(); }
      this.tickUnitsIdle(dt);
      return;
    }
    // 波次推进
    this.waveT += dt;
    for (var s = 0; s < this.sides.length; s++) {
      var side = this.sides[s], q = this.waveSpawns[s];
      while (q.length && q[0].t <= this.waveT) this.spawnEnemy(side, q.shift());
    }
    if (this.waveT >= this.waveDur && !(this.targetWaves && this.wave >= this.targetWaves)) this.startWave();

    for (s = 0; s < this.sides.length; s++) this.tickSide(this.sides[s], dt);
    // 闯关：最后一波清完就过关
    if (this.targetWaves && this.wave >= this.targetWaves && !this.waveSpawns[0].length && !this.sides[0].enemies.length && this.sides[0].hearts > 0) {
      this.end(0);
      return;
    }
    this.tickProjectiles(dt);
    this.tickSweeps(dt);
    this.tickZones(dt);
    this.tickBlasts(dt);
    this.tickSnakes(dt);
    for (var bi = this.barriers.length - 1; bi >= 0; bi--) { this.barriers[bi].t -= dt; if (this.barriers[bi].t <= 0) this.barriers.splice(bi, 1); }
    this.checkEnd();
  };

  B.tickUnitsIdle = function (dt) {
    for (var s = 0; s < this.sides.length; s++) {
      var side = this.sides[s];
      for (var i = 0; i < side.units.length; i++) this.tickFarmer(side, side.units[i], dt);
    }
  };

  B.checkEnd = function () {
    if (this.solo) {
      if (this.sides[0].hearts <= 0) this.end(-1);
      return;
    }
    var a = this.sides[0].hearts <= 0, b = this.sides[1].hearts <= 0;
    if (a && b) this.end(this.sides[0].kills >= this.sides[1].kills ? 0 : 1);
    else if (a) this.end(1);
    else if (b) this.end(0);
  };

  B.end = function (winner) {
    if (this.state === 'over') return;
    this.state = 'over';
    this.winner = winner;
    this.emit({ k: 'end', winner: winner });
  };

  B.sideBuffMult = function (side) {
    var m = 0;
    for (var i = side.buffs.length - 1; i >= 0; i--) m += side.buffs[i].m;
    return m;
  };

  B.tickSide = function (side, dt) {
    var i, e, lane = this.lanes[side.idx];
    // 全军增益
    for (i = side.buffs.length - 1; i >= 0; i--) { side.buffs[i].t -= dt; if (side.buffs[i].t <= 0) side.buffs.splice(i, 1); }
    for (i = side.dmgBuffs.length - 1; i >= 0; i--) { side.dmgBuffs[i].t -= dt; if (side.dmgBuffs[i].t <= 0) side.dmgBuffs.splice(i, 1); }
    if (side.linkT > 0) side.linkT -= dt;
    for (i = 0; i < side.skills.length; i++) if (side.skills[i].cd > 0) side.skills[i].cd -= dt;
    if (side.bondVer !== side.boardVer) this.refreshBonds(side);
    // 曹操减速光环
    var auras = [];
    for (i = 0; i < side.units.length; i++) {
      var uu = side.units[i];
      if (uu.kind === 'general' && uu.gen === 'caocao') auras.push(uu);
    }
    // 敌人
    var nearEnd = false;
    for (i = side.enemies.length - 1; i >= 0; i--) {
      e = side.enemies[i];
      if (e.dead) { side.enemies.splice(i, 1); continue; }
      this.tickEnemy(side, e, dt, lane, auras);
      if (e.dist >= lane.len) {
        // 冲到阿斗面前
        e.dead = true;
        side.enemies.splice(i, 1);
        var loss = e.boss ? 2 : 1;
        side.hearts = Math.max(0, side.hearts - loss);
        side.leaked++;
        side.hurtT = this.t;
        this.emit({ k: 'leak', side: side.idx, boss: !!e.boss, hearts: side.hearts });
        continue;
      }
      if (lane.len - e.dist < 3.2) nearEnd = true;
    }
    if (nearEnd && this.t - side.dangerT > 6) { side.dangerT = this.t; this.emit({ k: 'danger', side: side.idx }); }
    // 兵
    for (i = 0; i < side.units.length; i++) this.tickUnit(side, side.units[i], dt);
  };

  B.tickEnemy = function (side, e, dt, lane, auras) {
    if (e.hurtFx > 0) e.hurtFx -= dt;
    // 灼烧 / 中毒
    if (e.burnT > 0) { e.burnT -= dt; this.hurt(side, e, e.burnDps * dt, e.burnSrc, { dot: true, pierceArmor: true }); }
    if (e.poisonT > 0) { e.poisonT -= dt; this.hurt(side, e, e.poisonDps * dt, e.poisonSrc, { dot: true, pierceArmor: true }); }
    if (e.dead) return;
    if (e.markT > 0) {
      e.markT -= dt;
      if (e.markT <= 0) { this.hurt(side, e, e.markDmg, e.markSrc, { pierceArmor: true }); this.emit({ k: 'moon', side: side.idx, x: e.x, y: e.y }); if (e.dead) return; }
    }
    // 妖巫回血
    if (e.heal) {
      e.healT = (e.healT || 0) + dt;
      if (e.healT >= 1) {
        e.healT = 0;
        for (var j = 0; j < side.enemies.length; j++) {
          var o = side.enemies[j];
          if (o.dead || o === e || o.boss) continue;
          if (Math.abs(o.dist - e.dist) < 1.4) { o.hp = Math.min(o.maxHp, o.hp + o.maxHp * e.heal * 2); }
        }
        this.emit({ k: 'heal', side: side.idx, x: e.x, y: e.y });
      }
    }
    if (e.boss) this.tickBoss(side, e, dt, lane);
    if (e.stunT > 0) { e.stunT -= dt; }
    if (e.slowT > 0) { e.slowT -= dt; if (e.slowT <= 0) e.slowMult = 1; }
    if (e.invisT > 0) e.invisT -= dt;
    var aura = 1;
    for (var a = 0; a < auras.length; a++) {
      var u = auras[a];
      if (d2(u.x + 0.5, u.y + 0.5, e.x, e.y) <= Math.pow(this.unitStats(u).range, 2)) { aura = side.flags.huwei ? 0.6 : 0.75; break; }
    }
    if (this.weather === 'rain') aura *= 0.85;
    if (this.rules.enemySpd) aura *= this.rules.enemySpd;
    if (e.armorT > 0) e.armorT -= dt;
    if (e.stunT <= 0) {
      var spd = e.spd * e.slowMult * aura;
      if (e.dashT > 0) { e.dashT -= dt; spd = 5; }
      if (e.charmT > 0) { e.charmT -= dt; spd = -0.6 * e.spd; }
      var nd = Math.max(0, e.dist + spd * dt);
      // 拒马：普通敌人过不去，Boss 被拖慢
      for (var bi = 0; bi < this.barriers.length; bi++) {
        var br = this.barriers[bi];
        if (br.side !== side.idx || e.dist > br.dist) continue;
        if (nd > br.dist - 0.35) {
          if (e.boss) nd = e.dist + (nd - e.dist) * 0.4;
          else nd = Math.max(e.dist, br.dist - 0.35);
          br.hold = true;
        }
      }
      e.dist = nd;
    }
    var p = lane.pos(e.dist, e.lat);
    e.x = p.x; e.y = p.y; e.dir = p;
  };

  B.tickBoss = function (side, e, dt, lane) {
    e.abilityT -= dt;
    var self = this;
    var near = function (r) {
      return side.units.filter(function (u) { return d2(u.x + 0.5, u.y + 0.5, e.x, e.y) <= r * r && u.kind !== 'farmer'; });
    };
    switch (e.boss) {
      case 'huaxiong':
        if (e.abilityT <= 0) {
          e.abilityT = 6;
          var us = near(2.6);
          if (us.length) {
            us.sort(function (a, b) { return self.unitPower(b) - self.unitPower(a); });
            us[0].lockT = 3;
            this.emit({ k: 'lock', side: side.idx, x: us[0].x + 0.5, y: us[0].y + 0.5, by: '斩' });
          }
        }
        break;
      case 'zhangjiao':
        if (e.abilityT <= 0) {
          e.abilityT = 7;
          var cand = near(3.2);
          if (cand.length) {
            var c = this.rng.pick(cand);
            this.zones.push({ side: side.idx, kind: 'cloud', x: c.x + 0.5, y: c.y + 0.5, r: 1.3, t: 5, max: 5 });
          }
          for (var k = 0; k < 2; k++) {
            var m = this.makeEnemy(side, { ch: '巾', hp: 0.6, spd: 1.1, bun: 1 }, this.hpScale(this.wave));
            m.dist = Math.max(0, e.dist - 0.4 - k * 0.4);
            side.enemies.push(m);
          }
          this.emit({ k: 'summon', side: side.idx, x: e.x, y: e.y });
        }
        break;
      case 'dongzhuo':
        if (this.t - e.lastHurtT > 2) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.04 * dt);
        if (e.abilityT <= 0) {
          e.abilityT = 8;
          var ch = this.rng.shuffle(near(3.2)).slice(0, 2);
          ch.forEach(function (u) { u.lockT = 3; self.emit({ k: 'lock', side: side.idx, x: u.x + 0.5, y: u.y + 0.5, by: '链' }); });
        }
        break;
      case 'caoren':
        if (e.abilityT <= 0) {
          e.abilityT = 7;
          side.enemies.forEach(function (o) { if (!o.dead && Math.abs(o.dist - e.dist) < 1.8) o.armorT = 4; });
          this.emit({ k: 'skill', side: side.idx, x: e.x, y: e.y, name: '八门金锁', enemy: true });
        }
        break;
      case 'lvbu':
        e.stunT = 0; e.slowMult = 1; e.charmT = 0;
        if (e.abilityT <= 0) { e.abilityT = 6; e.dashT = 0.4; this.emit({ k: 'dash', side: side.idx, x: e.x, y: e.y }); }
        break;
      case 'shangxiang':
        if (e.abilityT <= 0) {
          e.abilityT = 5;
          var t = near(3.6);
          if (t.length) { var u = this.rng.pick(t); u.lockT = 2; this.emit({ k: 'lock', side: side.idx, x: u.x + 0.5, y: u.y + 0.5, by: '箭' }); }
        }
        break;
      case 'zhenfu':
        if (e.abilityT <= 0) { e.abilityT = 6; e.invisT = 1.5; this.emit({ k: 'vanish', side: side.idx, x: e.x, y: e.y }); }
        break;
      case 'diaochan':
        if (e.abilityT <= 0) {
          e.abilityT = 5;
          var c2 = near(3.2);
          if (c2.length) { var u2 = this.rng.pick(c2); u2.chaosT = 3; this.emit({ k: 'charm', side: side.idx, x: u2.x + 0.5, y: u2.y + 0.5 }); }
        }
        break;
    }
  };

  // ───────────────────────── 兵与武将 ─────────────────────────
  B.newUnit = function (side, item, x, y) {
    var u = {
      id: this.nextId++, side: side.idx, x: x, y: y,
      kind: item.kind, key: item.key || null, gen: item.gen || null, part: item.part != null ? item.part : null,
      lvl: item.lvl || 1, cd: 0.3 + this.rng() * 0.3, atkN: 0, ramp: 0, lastTarget: null,
      buffs: [], lockT: 0, chaosT: 0, cloudT: 0, skillT: 0, farmT: 0, kills: 0, dmgDone: 0,
      placeT: this.t, fxT: -9, aim: null, swordN: 0, killN: 0, duguN: 0, duguCd: 0, berserkT: 0
    };
    if (u.kind === 'general') this.equipWeapon(side, u);
    return u;
  };

  B.equipWeapon = function (side, u) {
    var w = side.weapons[u.gen];
    if (w && G.WEAPON[w.id] && G.WEAPON[w.id].type === G.GEN[u.gen].type) {
      u.weapon = G.WEAPON[w.id]; u.wstar = w.star || 1;
      u.ex = u.weapon.ex === u.gen;
    } else { u.weapon = null; u.ex = false; }
  };

  B.unitPower = function (u) { var s = this.unitStats(u); return s.dmg / s.cd; };

  B.unitStats = function (u) {
    var s, base, side = this.sides[u.side];
    if (u.kind === 'farmer') return { dmg: 0, cd: 99, range: 0, atk: 'none' };
    var out;
    if (u.kind === 'soldier') {
      s = G.SOLDIERS[u.key];
      out = { dmg: s.dmg * G.lvlMult(u.lvl) * side.dmgMult, cd: s.cd * Math.pow(0.96, u.lvl - 1), range: s.range, atk: s.atk, type: s.type };
    } else if (u.kind === 'part') {
      var gp = G.GEN[u.gen], bp = G.GEN_BASE[gp.type];
      out = { dmg: bp.dmg * 0.45 * side.dmgMult, cd: bp.cd * 1.1, range: bp.range, atk: G.WTYPE_ATK[gp.type], type: gp.type };
    } else out = this.genStats(side, u);
    return this.modStats(side, u, out);
  };

  // 羁绊、天气、全军增益对属性的修正
  B.modStats = function (side, u, st) {
    var dm = 1 + (u.bDmg || 0);
    for (var i = 0; i < side.dmgBuffs.length; i++) dm += side.dmgBuffs[i].m;
    st.dmg *= dm;
    st.range += (u.bRange || 0);
    if (this.weather === 'fog') st.range *= 0.8;
    if (this.weather === 'wind' && st.type === 0) st.range += 0.5;
    return st;
  };

  B.genStats = function (side, u) {
    var g = G.GEN[u.gen], base = G.GEN_BASE[g.type];
    var dmg = base.dmg + (u.weapon ? G.weaponAtk(u.weapon, u.wstar) : 0);
    dmg *= G.genLvlMult(u.lvl) * side.dmgMult;
    var range = base.range;
    if (u.weapon) {
      var wid = u.weapon.id;
      if (wid === 1 || wid === 11 || wid === 21 || wid === 32) range += 0.5;
      if (wid === 13) range += 1;
      if (wid === 8) range *= 2;
    }
    if (u.gen === 'huangzhong') range += 1.5;
    return { dmg: dmg, cd: base.cd, range: range, atk: G.WTYPE_ATK[g.type], type: g.type };
  };

  B.speedMult = function (side, u) {
    var m = 1 + this.sideBuffMult(side);
    for (var i = u.buffs.length - 1; i >= 0; i--) m += u.buffs[i].m;
    if (u.berserkT > 0) m += 1;
    // 刘备光环
    for (var j = 0; j < side.units.length; j++) {
      var o = side.units[j];
      if (o !== u && o.kind === 'general' && o.gen === 'liubei' && Math.abs(o.x - u.x) <= 1 && Math.abs(o.y - u.y) <= 1) { m += 0.25; break; }
    }
    if (u.ramp) m += u.ramp;
    m += (u.bSpd || 0);
    if (this.weather === 'heat') m *= 0.9;
    return m;
  };

  B.tickFarmer = function (side, u, dt) {
    if (u.kind !== 'farmer') return;
    u.farmT += dt;
    if (u.farmT >= 10) {
      u.farmT = 0;
      var y = Math.round(G.farmerYield(u.lvl) * (1 + 0.25 * (u.tuntian || 0)) * (this.weather === 'heat' ? 2 : 1));
      side.buns += y; side.bunsEarned += y;
      this.emit({ k: 'farm', side: side.idx, x: u.x + 0.5, y: u.y + 0.5, n: y });
    }
  };

  B.findTarget = function (side, u, range, exclude) {
    var best = null, bd = -1, r2 = range * range, cx = u.x + 0.5, cy = u.y + 0.5;
    var en = side.enemies;
    for (var i = 0; i < en.length; i++) {
      var e = en[i];
      if (e.dead || e.invisT > 0 || e === exclude) continue;
      if (d2(cx, cy, e.x, e.y) > r2) continue;
      if (e.dist > bd) { bd = e.dist; best = e; }
    }
    return best;
  };

  B.enemiesNear = function (side, x, y, r, excl) {
    var out = [], r2 = r * r;
    for (var i = 0; i < side.enemies.length; i++) {
      var e = side.enemies[i];
      if (!e.dead && e !== excl && e.invisT <= 0 && d2(x, y, e.x, e.y) <= r2) out.push(e);
    }
    return out;
  };

  B.tickUnit = function (side, u, dt) {
    if (u.kind === 'farmer') { this.tickFarmer(side, u, dt); return; }
    for (var i = u.buffs.length - 1; i >= 0; i--) { u.buffs[i].t -= dt; if (u.buffs[i].t <= 0) u.buffs.splice(i, 1); }
    if (u.lockT > 0) { u.lockT -= dt; return; }
    if (u.chaosT > 0) { u.chaosT -= dt; return; }
    if (u.berserkT > 0) u.berserkT -= dt;
    if (u.duguCd > 0) u.duguCd -= dt;
    var st = this.unitStats(u);
    var range = st.range;
    // 黑云
    var inCloud = false;
    for (i = 0; i < this.zones.length; i++) {
      var z = this.zones[i];
      if (z.kind === 'cloud' && z.side === side.idx && d2(z.x, z.y, u.x + 0.5, u.y + 0.5) <= z.r * z.r) { inCloud = true; break; }
    }
    u.inCloud = inCloud;
    if (inCloud) range *= 0.55;
    if (u.kind === 'general') this.tickGeneralSkill(side, u, st, dt);
    var spd = this.speedMult(side, u);
    if (u.weapon && u.weapon.id === 45 && u.lastTarget && !u.lastTarget.dead && d2(u.x + 0.5, u.y + 0.5, u.lastTarget.x, u.lastTarget.y) < 2.4) spd *= 1.5;
    u.cd -= dt * spd;
    if (u.cd > 0) return;
    var target = this.findTarget(side, u, range);
    if (!target) { u.cd = 0; u.ramp = 0; return; }
    u.cd = st.cd;
    u.atkN++;
    u.aim = { x: target.x, y: target.y, t: this.t };
    this.attack(side, u, st, target);
  };

  B.tickGeneralSkill = function (side, u, st, dt) {
    u.skillT += dt;
    var self = this, cx = u.x + 0.5, cy = u.y + 0.5;
    var anyEnemy = side.enemies.length > 0;
    switch (u.gen) {
      case 'zhaoyun':
        if (u.skillT >= (this.rules.zyBoost ? 5 : 9) && anyEnemy) {
          u.skillT = 0;
          this.addSweep(side, u, { kind: 'zhaoyun', ch: '云', dmg: st.dmg * 3, spd: 10, r: 0.65 });
          this.emit({ k: 'skill', side: side.idx, x: cx, y: cy, name: '七进七出' });
        }
        break;
      case 'zhangfei':
        if (u.skillT >= 10) {
          var es = this.enemiesNear(side, cx, cy, 2.5);
          if (es.length) {
            u.skillT = 0;
            es.forEach(function (e) { self.stun(e, 1.5); self.hurt(side, e, st.dmg * 2, u, { pierceArmor: true }); });
            this.emit({ k: 'roar', side: side.idx, x: cx, y: cy, r: 2.5, name: '当阳怒吼' });
            if (u.weapon && u.weapon.id === 18 && u.ex) this.snakes.forEach(function (sn) { if (sn.src === u) sn.hasteT = 6; });
          }
        }
        break;
      case 'xuchu':
        if (u.skillT >= 12 && anyEnemy) {
          u.skillT = 0; u.berserkT = 4;
          side.units.forEach(function (o) { if (o !== u && Math.abs(o.x - u.x) <= 1 && Math.abs(o.y - u.y) <= 1) o.buffs.push({ m: 0.2, t: 4 }); });
          this.emit({ k: 'skill', side: side.idx, x: cx, y: cy, name: '裸衣' });
        }
        break;
      case 'kongming':
        if (u.skillT >= (side.flags.sangu ? 9 : 15) && anyEnemy) {
          u.skillT = 0;
          side.buffs.push({ m: 0.3, t: 5 });
          this.emit({ k: 'wind', side: side.idx, x: cx, y: cy, name: '借东风' });
        }
        break;
      case 'zhenfu':
        if (u.skillT >= (side.flags.tongque ? 5 : 8) && anyEnemy) {
          u.skillT = 0;
          this.addSweep(side, u, { kind: 'water', ch: '波', dmg: st.dmg * 1.5, spd: 6, r: 0.7, slow: 0.6, slowT: 3 });
          this.emit({ k: 'skill', side: side.idx, x: cx, y: cy, name: '凌波' });
        }
        break;
    }
    // 丈八蛇矛：保持灵蛇数量
    if (u.weapon && u.weapon.id === 18) {
      var mine = this.snakes.filter(function (s) { return s.src === u; });
      if (mine.length < u.lvl) this.addSnake(side, u, mine.length);
    }
  };

  B.addSnake = function (side, u, n) {
    var lane = this.lanes[side.idx];
    var d0 = lane.nearestDist(u.x + 0.5, u.y + 0.5);
    var d = G.clamp(d0 + (n % 2 ? 1 : -1) * Math.ceil(n / 2) * 0.9, 0.5, lane.len - 0.5);
    var p = lane.pos(d);
    this.snakes.push({ side: side.idx, src: u, dist: d, x: p.x, y: p.y, cd: 0, hasteT: 0 });
  };

  B.stun = function (e, t) { if (e.boss === 'lvbu') return; e.stunT = Math.max(e.stunT, e.boss ? t * 0.4 : t); };
  B.slow = function (e, m, t) { if (e.boss === 'lvbu') return; e.slowMult = Math.min(e.slowMult, m); e.slowT = Math.max(e.slowT, t); };
  B.knock = function (e, d) { if (e.boss) d *= 0.25; if (e.boss === 'lvbu') return; e.dist = Math.max(0, e.dist - d); };

  // 攻击
  B.attack = function (side, u, st, target) {
    var self = this, cx = u.x + 0.5, cy = u.y + 0.5;
    var dmg = st.dmg;
    var w = u.weapon ? u.weapon.id : -1;
    var first = !target.hitBy[u.id];
    target.hitBy[u.id] = 1;
    // 连击加速类
    if (w === 3 || w === 6 || w === 22) {
      var step = w === 6 ? 0.15 : 0.05;
      u.ramp = (u.lastTarget === target) ? Math.min(w === 6 ? 2 : 1, u.ramp + step) : 0;
    }
    u.lastTarget = target;
    var opts = { pierceArmor: st.atk === 'thrust' || (u.gen === 'caocao' && w === 38 && u.ex) };
    var g = u.kind === 'general' ? u.gen : null;

    // 武将普攻修正
    if (g === 'huangzhong') {
      var critP = (w === 5 && u.ex) ? 0.5 : 0.25;
      if (this.rng.chance(critP)) { dmg *= 3; opts.crit = true; }
    }
    if (w === 8) dmg *= 1 + Math.sqrt(d2(cx, cy, target.x, target.y)) / st.range;
    if (w === 45) { target.markT = 5; target.markDmg = st.dmg * 3; target.markSrc = u; }

    switch (st.atk) {
      case 'arrow':
        var n = g === 'kongming' ? 3 : 1;
        var targets = [target];
        if (n > 1) {
          var others = this.enemiesNear(side, cx, cy, st.range, target);
          others.sort(function (a, b) { return b.dist - a.dist; });
          targets = targets.concat(others.slice(0, n - 1));
        }
        targets.forEach(function (t) {
          self.projs.push({ side: side.idx, kind: 'arrow', x: cx, y: cy - 0.1, target: t, tx: t.x, ty: t.y, spd: 14, dmg: dmg, src: u, opts: Object.assign({}, opts), bounce: g === 'shangxiang' ? 2 : (w === 7 ? (self.rng.chance(0.5) ? 1 : 0) : 0) });
        });
        break;
      case 'thrust':
        this.hurt(side, target, dmg, u, opts);
        var pierce = g === 'zhaoyun' ? 2 : 1;
        var behind = this.enemiesNear(side, target.x, target.y, 0.95, target).filter(function (e) { return e.dist < target.dist; });
        behind.sort(function (a, b) { return b.dist - a.dist; });
        behind.slice(0, pierce).forEach(function (e) { self.hurt(side, e, dmg * 0.7, u, opts); });
        this.emit({ k: 'thrust', side: side.idx, x: cx, y: cy, tx: target.x, ty: target.y, gen: !!g });
        break;
      case 'slash':
        if (g === 'guanyu' && u.atkN % 3 === 0) {
          var aoe = this.enemiesNear(side, target.x, target.y, 1.3);
          aoe.forEach(function (e) { self.hurt(side, e, dmg * 3, u, opts); });
          this.emit({ k: 'qinglong', side: side.idx, x: target.x, y: target.y, fx: cx, fy: cy });
          if (w === 29 && u.ex) this.qiBolts(side, u, 3, dmg * 1.5);
        } else if (g === 'dianwei') {
          var two = [target].concat(this.enemiesNear(side, cx, cy, st.range, target).slice(0, 1));
          two.forEach(function (e) { self.hurt(side, e, dmg, u, opts); self.knock(e, 0.25); });
          this.emit({ k: 'slash', side: side.idx, x: target.x, y: target.y, fx: cx, fy: cy, gen: true, big: true });
        } else {
          this.hurt(side, target, dmg, u, opts);
          this.enemiesNear(side, target.x, target.y, 0.75, target).forEach(function (e) { self.hurt(side, e, dmg * 0.5, u, opts); });
          this.emit({ k: 'slash', side: side.idx, x: target.x, y: target.y, fx: cx, fy: cy, gen: !!g });
        }
        break;
      case 'charge':
        if (u.atkN % (u.lancer ? 2 : 3) === 0) {
          this.hurt(side, target, dmg * 2.5, u, opts);
          this.knock(target, 0.35);
          this.emit({ k: 'charge', side: side.idx, x: target.x, y: target.y, fx: cx, fy: cy });
        } else {
          this.hurt(side, target, dmg, u, opts);
          this.emit({ k: 'slash', side: side.idx, x: target.x, y: target.y, fx: cx, fy: cy, small: true });
        }
        break;
      case 'sword':
        if (g === 'zhouyu' && u.atkN % (side.flags.jisheng ? 2 : 3) === 0) {
          this.addFire(side, target, 0.75, 4, dmg * 0.8, u);
        }
        this.hurt(side, target, dmg, u, opts);
        if (g === 'diaochan' && !target.boss && this.rng.chance(side.flags.lianhuan ? 0.3 : 0.15)) { target.charmT = 2; this.emit({ k: 'charmE', side: side.idx, x: target.x, y: target.y }); }
        this.emit({ k: 'sword', side: side.idx, x: target.x, y: target.y, fx: cx, fy: cy, gen: !!g });
        break;
    }

    // 武将技能触发
    if (g === 'machao' && this.rng.chance(0.2)) this.pikes(side, u, target, 1, dmg * 2, true);
    if (g === 'lvbu' || w === 30) {
      var p = (g === 'lvbu' ? 0.15 : 0) + (w === 30 ? (u.ex ? 0.24 : 0.12) : 0);
      if (this.rng.chance(p)) this.throwEnemy(side, u, target, dmg);
    }

    // 兵器特效
    if (w >= 0) this.weaponOnAttack(side, u, st, target, dmg, first);
  };

  B.weaponOnAttack = function (side, u, st, target, dmg, first) {
    var w = u.weapon.id, self = this, rng = this.rng;
    switch (w) {
      case 2: if (rng.chance(0.1)) this.knock(target, 0.5); break;
      case 4: if (rng.chance(0.1)) this.addSweep(side, u, { kind: 'eagle', ch: '鹰', dmg: dmg * 2, spd: 4, r: 0.6 }); break;
      case 5: if (rng.chance(0.1)) { this.addFire(side, target, 1.2, 4, dmg, u); this.emit({ k: 'dragon', side: side.idx, x: target.x, y: target.y }); } break;
      case 9:
        u.swordN++;
        if (u.swordN >= 10) {
          u.swordN = 0;
          var nArrows = (u.ex ? 20 : 10);
          for (var i = 0; i < nArrows; i++) {
            var t = side.enemies.length ? rng.pick(side.enemies) : null;
            if (t && !t.dead) this.projs.push({ side: side.idx, kind: 'fire', x: u.x + 0.5, y: u.y + 0.4, target: t, tx: t.x, ty: t.y, spd: 9 + rng() * 4, dmg: dmg * 0.8, src: u, opts: { burn: dmg * 0.3 }, bounce: 0, delay: i * 0.05 });
          }
        }
        break;
      case 12: if (first && rng.chance(0.2)) this.pikes(side, u, target, 1, dmg * 1.5); break;
      case 14: if (first && rng.chance(0.2)) { this.stun(target, 1); this.emit({ k: 'trip', side: side.idx, x: target.x, y: target.y }); } break;
      case 17: if (first && rng.chance(0.2)) this.pikes(side, u, target, u.gen === 'machao' ? 5 : 3, dmg * 1.5); break;
      case 19:
        if (rng.chance(0.1)) {
          var mult = u.ex ? 2.4 : 1.2;
          side.enemies.slice().forEach(function (e) { self.hurt(side, e, dmg * mult, u, { pierceArmor: true }); });
          this.emit({ k: 'flyspear', side: side.idx, x: u.x + 0.5, y: u.y + 0.5 });
        }
        break;
      case 23: if (rng.chance(0.1)) this.howl(side, u, 1.5, 0.2, '狼'); break;
      case 27: if (rng.chance(0.1)) this.howl(side, u, u.ex ? 3 : 1.5, 0.3, '虎'); break;
      case 24:
        u.swordN++;
        if (u.swordN >= 10) { u.swordN = 0; this.addSweep(side, u, { kind: 'qi', ch: '气', dmg: dmg * 2, spd: 8, r: 0.6 }); }
        break;
      case 25: if (rng.chance(0.1)) { this.stun(target, 1); this.emit({ k: 'stunE', side: side.idx, x: target.x, y: target.y }); } break;
      case 26: if (first) { side.buns += 1; side.bunsEarned += 1; this.emit({ k: 'coin', side: side.idx, x: target.x, y: target.y }); } break;
      case 28:
        if (rng.chance(0.1)) {
          for (var m = 0; m < 5; m++) {
            var tt = side.enemies.length ? rng.pick(side.enemies) : null;
            if (tt) this.blasts.push({ side: side.idx, kind: 'meteor', t: 0.5 + m * 0.18, x: tt.x + (rng() - 0.5) * 0.4, y: tt.y + (rng() - 0.5) * 0.4, r: 0.75, dmg: dmg * 1.5, src: u });
          }
        }
        break;
      default:
        if (w >= 34 && w <= 42) {
          u.swordN++;
          var every = (w === 37 && u.ex) ? 5 : 10;
          if (u.swordN >= every) {
            u.swordN = 0;
            var power = { 34: 1.5, 35: 1.8, 36: 2.1, 37: 2.1, 38: 2.3, 39: 2.6, 40: 3, 41: 3, 42: 3 }[w];
            if (rng.chance(0.5)) {
              this.enemiesNear(side, u.x + 0.5, u.y + 0.5, st.range + 0.5).forEach(function (e) { self.hurt(side, e, dmg * power, u, { pierceArmor: u.ex && w === 38 }); });
              this.emit({ k: 'junzi', side: side.idx, x: u.x + 0.5, y: u.y + 0.5, r: st.range + 0.5 });
            } else {
              target.poisonT = 4; target.poisonDps = dmg * power * 0.6; target.poisonSrc = u;
              this.slow(target, 0.7, 4);
              this.emit({ k: 'xiaoren', side: side.idx, x: target.x, y: target.y });
            }
          }
        }
    }
  };

  B.onKillHooks = function (side, u, e) {
    if (!u || u.kind !== 'general') return;
    var w = u.weapon ? u.weapon.id : -1, self = this;
    u.killN++;
    if (u.gen === 'caocao' && u.killN % 5 === 0) { side.buns += 3; side.bunsEarned += 3; this.emit({ k: 'coin', side: side.idx, x: u.x + 0.5, y: u.y + 0.5, n: 3 }); }
    switch (w) {
      case 15: u.buffs.push({ m: 0.5, t: 2 }); break;
      case 16:
        for (var i = 0; i < 8; i++) {
          var t = side.enemies.length ? this.rng.pick(side.enemies) : null;
          if (t && !t.dead) this.projs.push({ side: side.idx, kind: 'petal', x: e.x, y: e.y, target: t, tx: t.x, ty: t.y, spd: 6 + this.rng() * 3, dmg: this.unitStats(u).dmg * 0.8, src: u, opts: {}, bounce: 0 });
        }
        break;
      case 29: this.qiBolts(side, u, 3, this.unitStats(u).dmg * 1.5); break;
      case 43:
        if (u.killN % 5 === 0) this.addSweep(side, u, { kind: 'holy', ch: '剑', dmg: this.unitStats(u).dmg * 4, spd: 9, r: 0.7, insta: 0.1 });
        break;
      case 44:
        if (u.duguCd <= 0) {
          this.addSweep(side, u, { kind: 'dugu', ch: '剑', dmg: this.unitStats(u).dmg * 2, spd: 11, r: 0.6 });
          u.duguN++;
          if (u.duguN >= 9) { u.duguN = 0; u.duguCd = 10; }
        }
        break;
    }
  };

  B.fireDur = function (side, t) {
    if (this.weather === 'wind') t *= 2;
    if (this.weather === 'rain') t *= 0.5;
    if (side.flags.jisheng) t *= 2;
    return t;
  };
  B.addFire = function (side, at, r, t, dps, src) {
    t = this.fireDur(side, t);
    this.zones.push({ side: side.idx, kind: 'fire', dist: at.dist, x: at.x, y: at.y, r: r, t: t, max: t, dps: dps, src: src });
  };

  B.qiBolts = function (side, u, n, dmg) {
    for (var i = 0; i < n; i++) {
      var t = side.enemies.length ? this.rng.pick(side.enemies) : null;
      if (t && !t.dead) this.projs.push({ side: side.idx, kind: 'qi', x: u.x + 0.5, y: u.y + 0.5, target: t, tx: t.x, ty: t.y, spd: 10, dmg: dmg, src: u, opts: { pierceArmor: true }, bounce: 0, delay: i * 0.08 });
    }
  };

  B.pikes = function (side, u, target, n, dmg, slow) {
    for (var i = 0; i < n; i++) {
      var a = (i / n) * Math.PI * 2, r = n > 1 ? 0.55 : 0;
      this.blasts.push({ side: side.idx, kind: 'pike', t: 0.15 + i * 0.07, x: target.x + Math.cos(a) * r, y: target.y + Math.sin(a) * r, r: 0.85, dmg: dmg, src: u, slow: slow });
    }
  };

  B.throwEnemy = function (side, u, target, dmg) {
    var self = this;
    this.hurt(side, target, dmg * (target.boss ? 3 : 5), u, { pierceArmor: true });
    this.enemiesNear(side, target.x, target.y, 0.9, target).forEach(function (e) { self.stun(e, 1); self.hurt(side, e, dmg, u, {}); });
    this.emit({ k: 'throw', side: side.idx, x: target.x, y: target.y });
  };

  B.howl = function (side, u, r, m, ch) {
    side.units.forEach(function (o) {
      if (Math.abs(o.x - u.x) <= r && Math.abs(o.y - u.y) <= r) o.buffs.push({ m: m, t: 10 });
    });
    this.emit({ k: 'howl', side: side.idx, x: u.x + 0.5, y: u.y + 0.5, r: r, ch: ch });
  };

  B.addSweep = function (side, u, o) {
    var lane = this.lanes[side.idx];
    o.side = side.idx; o.src = u; o.dist = lane.len; o.hit = {};
    var p = lane.pos(o.dist); o.x = p.x; o.y = p.y;
    this.sweeps.push(o);
  };

  // 伤害结算
  B.hurt = function (side, e, dmg, src, o) {
    if (e.dead || dmg <= 0) return 0;
    o = o || {};
    var armor = Math.max(e.armor || 0, e.armorT > 0 ? 0.5 : 0);
    if (armor && !o.pierceArmor) dmg *= (1 - armor);
    // 连环计：伤害传给其他敌人
    if (side.linkT > 0 && !o.link && !o.dot) {
      var others = side.enemies.filter(function (x) { return x !== e && !x.dead; }).slice(0, 8);
      for (var li = 0; li < others.length; li++) this.hurt(side, others[li], dmg * 0.1, src, { link: true, pierceArmor: true, dot: true });
    }
    var before = e.hp;
    e.hp -= dmg;
    e.lastHurtT = this.t;
    if (!o.dot) e.hurtFx = 0.12;
    var dealt = Math.min(dmg, before);
    side.dmg += dealt;
    if (src) src.dmgDone += dealt;
    if (!o.dot && this.cfg.dmgNumbers !== false) this.emit({ k: 'dmg', side: side.idx, x: e.x, y: e.y, n: dmg, crit: !!o.crit });
    if (e.hp <= 0) this.kill(side, e, src);
    return dealt;
  };

  B.kill = function (side, e, src) {
    if (e.dead) return;
    e.dead = true;
    var bun = e.bun + (this.weather === 'night' ? 1 : 0);
    // 刘备：射程内击杀多给馒头
    for (var i = 0; i < side.units.length; i++) {
      var u = side.units[i];
      if (u.kind === 'general' && u.gen === 'liubei' && d2(u.x + 0.5, u.y + 0.5, e.x, e.y) <= Math.pow(this.unitStats(u).range, 2)) { bun += 1; break; }
    }
    side.buns += bun; side.bunsEarned += bun;
    side.kills++;
    if (src) src.kills++;
    this.emit({ k: 'die', side: side.idx, x: e.x, y: e.y, ch: e.ch, boss: !!e.boss, bun: bun });
    if (e.boss) {
      if (side.idx === 0) {
        this.bossKills.push(e.boss);
        var drop = G.BOSSES[e.boss].drop || (e.boss === 'lvbu' ? 'lvbu' : null);
        if (drop) this.drops.push(drop);
      }
      this.emit({ k: 'bossDie', side: side.idx, name: e.ch });
    }
    this.onKillHooks(side, src, e);
  };

  // ───────────────────────── 飞行物、刀气、区域 ─────────────────────────
  B.tickProjectiles = function (dt) {
    for (var i = this.projs.length - 1; i >= 0; i--) {
      var p = this.projs[i];
      if (p.delay > 0) { p.delay -= dt; continue; }
      var side = this.sides[p.side];
      if (p.target && !p.target.dead) { p.tx = p.target.x; p.ty = p.target.y; }
      var dx = p.tx - p.x, dy = p.ty - p.y, d = Math.sqrt(dx * dx + dy * dy);
      var step = p.spd * dt;
      p.ang = Math.atan2(dy, dx);
      if (d <= step + 0.05) {
        this.projs.splice(i, 1);
        if (p.target && !p.target.dead) {
          var t = p.target;
          this.hurt(side, t, p.dmg, p.src, p.opts);
          if (p.opts && p.opts.burn) { t.burnT = 2; t.burnDps = p.opts.burn; t.burnSrc = p.src; }
          if (p.kind === 'arrow') this.emit({ k: 'arrowHit', side: p.side, x: t.x, y: t.y });
          if (p.bounce > 0) {
            var nx = this.enemiesNear(side, t.x, t.y, 2.2, t);
            if (nx.length) {
              var n = this.rng.pick(nx);
              this.projs.push({ side: p.side, kind: p.kind, x: t.x, y: t.y, target: n, tx: n.x, ty: n.y, spd: p.spd, dmg: p.dmg * 0.8, src: p.src, opts: p.opts, bounce: p.bounce - 1 });
            }
          }
        }
        continue;
      }
      p.x += dx / d * step; p.y += dy / d * step;
    }
  };

  B.tickSweeps = function (dt) {
    for (var i = this.sweeps.length - 1; i >= 0; i--) {
      var s = this.sweeps[i];
      var side = this.sides[s.side], lane = this.lanes[s.side];
      s.dist -= s.spd * dt;
      var p = lane.pos(Math.max(0, s.dist)); s.x = p.x; s.y = p.y; s.dir = p;
      for (var j = 0; j < side.enemies.length; j++) {
        var e = side.enemies[j];
        if (e.dead || s.hit[e.id]) continue;
        if (Math.abs(e.dist - s.dist) <= s.r) {
          s.hit[e.id] = 1;
          if (s.insta && !e.boss && this.rng.chance(s.insta)) this.hurt(side, e, e.hp + 1, s.src, { pierceArmor: true, crit: true });
          else this.hurt(side, e, s.dmg, s.src, { pierceArmor: true });
          if (s.slow) this.slow(e, s.slow, s.slowT || 2);
        }
      }
      if (s.dist <= 0) this.sweeps.splice(i, 1);
    }
  };

  B.tickZones = function (dt) {
    for (var i = this.zones.length - 1; i >= 0; i--) {
      var z = this.zones[i];
      z.t -= dt;
      if (z.kind === 'fire') {
        var side = this.sides[z.side];
        for (var j = 0; j < side.enemies.length; j++) {
          var e = side.enemies[j];
          if (!e.dead && d2(z.x, z.y, e.x, e.y) <= z.r * z.r) this.hurt(side, e, z.dps * dt, z.src, { dot: true, pierceArmor: true });
        }
      } else if (z.kind === 'arrows') {
        var sa = this.sides[z.side];
        for (var ai = 0; ai < sa.enemies.length; ai++) {
          var ea = sa.enemies[ai];
          if (!ea.dead && d2(z.x, z.y, ea.x, ea.y) <= z.r * z.r) this.hurt(sa, ea, z.dps * dt, null, { dot: true, pierceArmor: true });
        }
      } else if (z.kind === 'lanefire') {
        var sd = this.sides[z.side];
        for (var k = 0; k < sd.enemies.length; k++) if (!sd.enemies[k].dead) this.hurt(sd, sd.enemies[k], z.dps * dt, null, { dot: true, pierceArmor: true });
      }
      if (z.t <= 0) this.zones.splice(i, 1);
    }
  };

  B.tickBlasts = function (dt) {
    for (var i = this.blasts.length - 1; i >= 0; i--) {
      var b = this.blasts[i];
      b.t -= dt;
      if (b.t > 0) continue;
      this.blasts.splice(i, 1);
      var side = this.sides[b.side], self = this;
      this.enemiesNear(side, b.x, b.y, b.r).forEach(function (e) {
        self.hurt(side, e, b.dmg, b.src, { pierceArmor: true });
        if (b.slow) self.slow(e, 0.6, 2);
        if (b.kind === 'mine') self.stun(e, 0.8);
        if (b.stun) self.stun(e, b.stun);
      });
      this.emit({ k: b.kind, side: b.side, x: b.x, y: b.y, r: b.r });
    }
    // 地雷
    for (i = this.mines.length - 1; i >= 0; i--) {
      var m = this.mines[i];
      var sd = this.sides[m.side];
      var hit = sd.enemies.some(function (e) { return !e.dead && Math.abs(e.dist - m.dist) < 0.35; });
      if (hit) {
        this.mines.splice(i, 1);
        this.blasts.push({ side: m.side, kind: 'mine', t: 0, x: m.x, y: m.y, r: 1.25, dmg: m.dmg, src: null });
      }
    }
  };

  B.tickSnakes = function (dt) {
    for (var i = this.snakes.length - 1; i >= 0; i--) {
      var s = this.snakes[i];
      var side = this.sides[s.side];
      if (side.units.indexOf(s.src) < 0 || !s.src.weapon || s.src.weapon.id !== 18) { this.snakes.splice(i, 1); continue; }
      if (s.hasteT > 0) s.hasteT -= dt;
      s.cd -= dt * (s.hasteT > 0 ? 2 : 1);
      if (s.cd > 0) continue;
      var es = this.enemiesNear(side, s.x, s.y, 0.75);
      if (es.length) {
        s.cd = 0.6;
        var e = es[0];
        this.hurt(side, e, this.unitStats(s.src).dmg * 0.5, s.src, { pierceArmor: true });
        s.biteT = this.t; s.bx = e.x; s.by = e.y;
      }
    }
  };

  // ───────────────────────── 征兵与布阵（玩家与 AI 共用） ─────────────────────────
  B.recruitCost = function (side) {
    if (side.freeRecruits > 0) return 0;
    return Math.min(60, 10 + side.recruits * 2);
  };

  B.drawItem = function (side) {
    var rng = this.rng;
    var allowed = this.rules.soldiers;
    var soldierW = G.SOLDIER_KEYS.map(function (k) { return (!allowed || allowed.indexOf(k) >= 0) ? G.SOLDIERS[k].w : 0; });
    var sumS = soldierW.reduce(function (a, b) { return a + b; }, 0);
    var partW = 12 * side.deck.length; // 每名出战武将固定权重：多带武将不会稀释每个人的碎片
    var propW = 10;
    var r = rng() * (sumS + partW + propW);
    if (r < sumS) {
      var key = G.SOLDIER_KEYS[rng.weighted(soldierW)];
      var lvl = 1;
      var p2 = Math.min(0.3, Math.max(0, (this.wave - 6) * 0.025));
      if (rng.chance(p2)) lvl = 2;
      return { kind: key === 'nong' ? 'farmer' : 'soldier', key: key, lvl: lvl };
    }
    if (r < sumS + partW) {
      var gen = rng.pick(side.deck);
      return { kind: 'part', gen: gen, part: rng.int(2) };
    }
    var pk = G.PROP_KEYS[rng.weighted(G.PROP_KEYS.map(function (k) { return G.PROPS[k].w; }))];
    if (pk === 'pill' && side.hearts >= side.maxHearts) pk = 'shovel';
    return { kind: 'prop', key: pk };
  };

  B.recruit = function (side) {
    if (this.state === 'over') return false;
    var cost = this.recruitCost(side);
    if (side.buns < cost) return false;
    side.buns -= cost;
    if (side.freeRecruits > 0) side.freeRecruits--; else side.recruits++;
    // 没用完的铲子收进军需栏，不会被刷掉
    for (var k = 0; k < CAMP; k++) {
      var old = side.camp[k];
      if (old && old.kind === 'prop' && old.key === 'shovel' && side.bar.length < 6) side.bar.push(old);
    }
    for (var i = 0; i < CAMP; i++) side.camp[i] = this.drawItem(side);
    // 铲子保底：连续两次征兵没出铲子，这次一定给一把（还有草地可挖时）
    var hasShovel = side.camp.some(function (c) { return c.kind === 'prop' && c.key === 'shovel'; });
    if (hasShovel) side.sinceShovel = 0;
    else {
      side.sinceShovel = (side.sinceShovel || 0) + 1;
      if (side.sinceShovel >= 3 && this.grassCells(side).length) {
        for (k = CAMP - 1; k >= 0; k--) {
          var c = side.camp[k];
          if (c.kind === 'farmer' || (c.kind === 'soldier' && c.lvl === 1) || c.kind === 'prop') { side.camp[k] = { kind: 'prop', key: 'shovel' }; break; }
        }
        side.sinceShovel = 0;
      }
    }
    // 第一次征兵至少给三个能打的兵
    if (side.recruits + side.freeRecruits <= 1 || (side.recruits === 1 && side.units.length === 0)) {
      var fighters = side.camp.filter(function (c) { return c.kind === 'soldier'; }).length;
      for (i = 0; i < CAMP && fighters < 3; i++) {
        if (side.camp[i].kind !== 'soldier') { side.camp[i] = { kind: 'soldier', key: this.rng.pick((this.rules.soldiers || ['dao', 'qiang', 'gong', 'qi']).filter(function (k) { return k !== 'nong'; })), lvl: 1 }; fighters++; }
      }
    }
    // 保证新手第一次征兵有得用
    if (this.tutorial && side.idx === 0 && side.recruits <= 1 && side.units.length === 0) {
      side.camp = [
        { kind: 'soldier', key: 'dao', lvl: 1 }, { kind: 'soldier', key: 'dao', lvl: 1 },
        { kind: 'soldier', key: 'gong', lvl: 1 }, { kind: 'part', gen: side.deck[0], part: 0 }, { kind: 'part', gen: side.deck[0], part: 1 }
      ];
    }
    this.emit({ k: 'recruit', side: side.idx, cost: cost });
    return true;
  };

  B.cellAt = function (x, y) { return (x >= 0 && y >= 0 && x < W && y < H) ? this.grid[y][x] : null; };
  B.unitAt = function (x, y) { var c = this.cellAt(x, y); return c ? c.unit : null; };

  // 取出“源”：营地第 i 格、军需栏第 i 格、或场上某格的兵
  B.getSource = function (side, from) {
    if (from.camp != null) return side.camp[from.camp] ? { item: side.camp[from.camp], where: 'camp' } : null;
    if (from.bar != null) return side.bar[from.bar] ? { item: side.bar[from.bar], where: 'bar' } : null;
    if (from.cell) {
      var u = this.unitAt(from.cell[0], from.cell[1]);
      return (u && u.side === side.idx) ? { item: u, where: 'board', unit: u } : null;
    }
    return null;
  };

  // 两个单位能否合体
  B.combineKind = function (a, b) {
    if (!a || !b) return null;
    if ((a.kind === 'soldier' || a.kind === 'farmer') && a.kind === b.kind && a.key === b.key && a.lvl === b.lvl && b.lvl < G.MAX_LVL) return 'merge';
    if (a.kind === 'part' && b.kind === 'part' && a.gen === b.gen && a.part !== b.part) return 'form';
    if (a.kind === 'part' && b.kind === 'general' && a.gen === b.gen && b.lvl < G.MAX_GEN_LVL) return 'genup';
    if (a.kind === 'general' && b.kind === 'part' && a.gen === b.gen && a.lvl < G.MAX_GEN_LVL) return 'genup';
    if (a.kind === 'general' && b.kind === 'general' && a.gen === b.gen && Math.max(a.lvl, b.lvl) < G.MAX_GEN_LVL) return 'genmerge';
    return null;
  };

  // 预判一次拖放会发生什么（不改状态）。返回 {kind, ...} 或 null
  B.resolve = function (side, from, to) {
    if (this.state === 'over') return null;
    var src = this.getSource(side, from);
    if (!src) return null;
    var it = src.item;
    if (to.dismiss) {
      if (src.where === 'board') return { kind: 'dismiss' };
      if (src.where === 'camp') return { kind: 'discard' };
      return null;
    }
    if (!to.cell) return null;
    var x = to.cell[0], y = to.cell[1];
    var cell = this.cellAt(x, y);
    if (!cell) return null;
    if (it.kind === 'prop') return this.resolveProp(side, it, cell);
    if (cell.side !== side.idx) return null;
    // 营地谁都能站；草地只有农夫能种
    if (!(cell.t === 'S' || (cell.t === 'G' && it.kind === 'farmer'))) return null;
    var tu = cell.unit;
    if (src.where === 'board' && tu === src.unit) return null;
    if (!tu) return { kind: src.where === 'board' ? 'move' : 'place' };
    var ck = this.combineKind(it, tu);
    if (ck) return { kind: ck };
    if (src.where === 'board') {
      // 互换时，对方也得能站到我原来的格子
      var from0 = this.cellAt(src.unit.x, src.unit.y);
      if (from0.t === 'G' && tu.kind !== 'farmer') return null;
      return { kind: 'swap' };
    }
    return null;
  };

  B.resolveProp = function (side, it, cell) {
    var p = G.PROPS[it.key];
    var u = cell.unit;
    switch (p.target) {
      case 'grass': return (cell.t === 'G' && cell.side === side.idx) ? { kind: 'prop' } : null;
      case 'unit':
        if (!u || u.side !== side.idx) return null;
        if ((u.kind === 'soldier' || u.kind === 'farmer') && u.lvl < G.MAX_LVL) return { kind: 'prop' };
        if (u.kind === 'general' && u.lvl < G.MAX_GEN_LVL) return { kind: 'prop' };
        return null;
      case 'soldier': return (u && u.side === side.idx && u.kind === 'soldier') ? { kind: 'prop' } : null;
      case 'road': return (cell.t === 'R' && cell.side === side.idx && !this.mines.some(function (m) { return m.cx === cell.x && m.cy === cell.y; })) ? { kind: 'prop' } : null;
      case 'any':
        if (it.key === 'pill' && side.hearts >= side.maxHearts) return null;
        return { kind: 'prop' };
    }
    return null;
  };

  B.takeSource = function (side, from) {
    if (from.camp != null) side.camp[from.camp] = null;
    else if (from.bar != null) side.bar.splice(from.bar, 1);
  };

  // 执行拖放
  B.act = function (side, from, to) {
    var plan = this.resolve(side, from, to);
    if (!plan) return null;
    var src = this.getSource(side, from);
    var it = src.item;
    var x = to.cell ? to.cell[0] : 0, y = to.cell ? to.cell[1] : 0;
    var cell = to.cell ? this.cellAt(x, y) : null;
    var tu = cell ? cell.unit : null;
    var res = { kind: plan.kind, x: x, y: y };
    var self = this;
    switch (plan.kind) {
      case 'place':
        this.takeSource(side, from);
        var nu = this.newUnit(side, it, x, y);
        cell.unit = nu; side.units.push(nu);
        res.unit = nu;
        break;
      case 'move':
        this.cellAt(src.unit.x, src.unit.y).unit = null;
        src.unit.x = x; src.unit.y = y; cell.unit = src.unit; src.unit.placeT = this.t;
        res.unit = src.unit;
        break;
      case 'swap':
        var a = src.unit, ax = a.x, ay = a.y;
        a.x = x; a.y = y; tu.x = ax; tu.y = ay;
        cell.unit = a; this.cellAt(ax, ay).unit = tu;
        a.placeT = tu.placeT = this.t;
        res.unit = a;
        break;
      case 'merge':
        this.consume(side, from, src);
        tu.lvl++;
        tu.mergeT = this.t;
        res.unit = tu;
        break;
      case 'form':
        this.consume(side, from, src);
        this.replaceUnit(side, tu, { kind: 'general', gen: tu.gen, lvl: 1 });
        res.unit = cell.unit;
        break;
      case 'genup':
        this.consume(side, from, src);
        if (tu.kind === 'general') { tu.lvl++; tu.mergeT = this.t; res.unit = tu; }
        else { this.replaceUnit(side, tu, { kind: 'general', gen: it.gen, lvl: it.lvl + 1 }); res.unit = cell.unit; }
        break;
      case 'genmerge':
        this.consume(side, from, src);
        tu.lvl = Math.min(G.MAX_GEN_LVL, tu.lvl + it.lvl);
        tu.mergeT = this.t;
        res.unit = tu;
        break;
      case 'dismiss':
        var refund = this.refundOf(src.unit);
        this.removeUnit(side, src.unit);
        side.buns += refund;
        res.refund = refund;
        break;
      case 'discard':
        this.takeSource(side, from);
        break;
      case 'prop':
        this.takeSource(side, from);
        this.applyProp(side, it.key, cell, res);
        break;
    }
    res.side = side.idx;
    side.boardVer++;
    this.emit({ k: 'act', side: side.idx, kind: plan.kind, x: x, y: y, prop: it.kind === 'prop' ? it.key : null });
    return res;
  };

  B.refundOf = function (u) {
    if (u.kind === 'general') return 6 * (u.lvl + 1);
    if (u.kind === 'part') return 3;
    return 3 * Math.pow(2, u.lvl - 1);
  };

  B.consume = function (side, from, src) {
    if (src.where === 'board') this.removeUnit(side, src.unit);
    else this.takeSource(side, from);
  };

  B.removeUnit = function (side, u) {
    side.boardVer++;
    var c = this.cellAt(u.x, u.y);
    if (c && c.unit === u) c.unit = null;
    var i = side.units.indexOf(u);
    if (i >= 0) side.units.splice(i, 1);
  };

  B.replaceUnit = function (side, old, item) {
    var x = old.x, y = old.y;
    this.removeUnit(side, old);
    var nu = this.newUnit(side, item, x, y);
    nu.mergeT = this.t;
    nu.dmgDone = old.dmgDone; nu.kills = old.kills;
    this.cellAt(x, y).unit = nu;
    side.units.push(nu);
    return nu;
  };

  B.applyProp = function (side, key, cell, res) {
    var u = cell.unit, self = this;
    switch (key) {
      case 'shovel':
        cell.t = 'S'; this.gridVersion++;
        break;
      case 'promote':
        u.lvl++; u.mergeT = this.t;
        if (u.kind === 'general') this.equipWeapon(side, u);
        break;
      case 'ink':
        var opts = ['dao', 'qiang', 'gong', 'qi'].filter(function (k) { return k !== u.key; });
        u.key = this.rng.pick(opts); u.mergeT = this.t;
        break;
      case 'mine':
        var lane = this.lanes[side.idx];
        this.mines.push({ side: side.idx, cx: cell.x, cy: cell.y, dist: cell.ld != null ? cell.ld : lane.nearestDist(cell.x + 0.5, cell.y + 0.5), x: cell.x + 0.5, y: cell.y + 0.5, dmg: this.hpScale(Math.max(1, this.wave)) * 3.2 });
        break;
      case 'drum':
        side.buffs.push({ m: 0.4, t: 8 });
        this.emit({ k: 'drum', side: side.idx });
        break;
      case 'pill':
        side.hearts = Math.min(side.maxHearts, side.hearts + 1);
        this.emit({ k: 'healHeart', side: side.idx });
        break;
    }
  };

  // 场上可以合成的一对（给 AI 和提示用）
  B.mergePairs = function (side) {
    var out = [], us = side.units;
    for (var i = 0; i < us.length; i++) for (var j = i + 1; j < us.length; j++) {
      var k = this.combineKind(us[i], us[j]);
      if (k) out.push([us[i], us[j], k]);
    }
    return out;
  };

  // 我方还空着的草地（农夫能种、铁铲能挖）
  B.grassCells = function (side, emptyOnly) {
    var out = [];
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      var c = this.grid[y][x];
      if (c.side === side.idx && c.t === 'G' && (!emptyOnly || !c.unit)) out.push(c);
    }
    return out;
  };

  B.emptyCells = function (side) {
    var out = [];
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      var c = this.grid[y][x];
      if (c.side === side.idx && c.t === 'S' && !c.unit) out.push(c);
    }
    return out;
  };

  B.summary = function () {
    var s0 = this.sides[0];
    var units = s0.units.slice().sort(function (a, b) { return b.dmgDone - a.dmgDone; });
    var cleared = Math.max(0, this.wave - 1);
    return {
      winner: this.winner, wave: this.wave, time: this.t, mode: this.mode,
      kills: s0.kills, dmg: s0.dmg, leaked: s0.leaked, hearts: s0.hearts, maxHearts: s0.maxHearts,
      top: units.slice(0, 3), drops: this.drops.slice(), bossKills: this.bossKills.slice(),
      score: cleared * 1000 + s0.kills * 5 + this.bossKills.length * 500
    };
  };

  // ───────────────────────── 字阵羁绊 ─────────────────────────
  var WORD_INDEX = {};
  G.WORD_BONDS.forEach(function (w) { WORD_INDEX[w.a + '|' + w.b] = w; WORD_INDEX[w.b + '|' + w.a] = w; });

  B.refreshBonds = function (side) {
    var self = this, us = side.units, i, j, u;
    var old = {};
    side.bonds.forEach(function (b) { old[b.name] = 1; });
    side.bonds = [];
    side.flags = {};
    for (i = 0; i < us.length; i++) { u = us[i]; u.bDmg = 0; u.bSpd = 0; u.bRange = 0; u.lancer = false; u.tuntian = 0; }
    var at = function (x, y) { var c = self.cellAt(x, y); return c && c.unit && c.unit.side === side.idx ? c.unit : null; };
    var isS = function (x) { return x && (x.kind === 'soldier' || x.kind === 'farmer'); };
    // 相邻成词
    for (i = 0; i < us.length; i++) {
      u = us[i];
      if (!isS(u)) continue;
      [[1, 0], [0, 1]].forEach(function (d) {
        var v = at(u.x + d[0], u.y + d[1]);
        if (!isS(v)) return;
        var w = WORD_INDEX[u.key + '|' + v.key];
        if (!w && (u.key === 'nong') !== (v.key === 'nong')) w = WORD_INDEX['nong|*'];
        if (!w) return;
        var pair = [u, v];
        if (w.dmg) pair.forEach(function (p) { p.bDmg += w.dmg; });
        if (w.spd) pair.forEach(function (p) { p.bSpd += w.spd; });
        if (w.lancer) pair.forEach(function (p) { if (p.key === 'qi') p.lancer = true; else p.bRange += 0.3; });
        if (w.tuntian) pair.forEach(function (p) { if (p.key === 'nong') p.tuntian++; });
        side.bonds.push({ kind: 'word', name: w.name, desc: w.desc, cells: [[u.x, u.y], [v.x, v.y]] });
      });
    }
    // 长蛇阵：同种兵三个以上连成直线
    var inSnake = {};
    [[1, 0], [0, 1]].forEach(function (d) {
      for (var y = 0; y < 10; y++) for (var x = 0; x < 8; x++) {
        var a = at(x, y);
        if (!a || a.kind !== 'soldier') continue;
        var prev = at(x - d[0], y - d[1]);
        if (prev && prev.kind === 'soldier' && prev.key === a.key) continue; // 不是起点
        var run = [a], nx = x + d[0], ny = y + d[1];
        for (;;) { var b = at(nx, ny); if (b && b.kind === 'soldier' && b.key === a.key) { run.push(b); nx += d[0]; ny += d[1]; } else break; }
        if (run.length >= 3) {
          run.forEach(function (r) { if (!inSnake[r.id]) { inSnake[r.id] = 1; r.bDmg += 0.25; } });
          side.bonds.push({ kind: 'form', name: '长蛇阵', desc: G.FORMATIONS[0].desc, cells: run.map(function (r) { return [r.x, r.y]; }) });
        }
      }
    });
    // 四象阵：刀枪弓骑围成田字
    for (var y2 = 0; y2 < 9; y2++) for (var x2 = 0; x2 < 7; x2++) {
      var q = [at(x2, y2), at(x2 + 1, y2), at(x2, y2 + 1), at(x2 + 1, y2 + 1)];
      if (q.some(function (z) { return !z || z.kind !== 'soldier'; })) continue;
      var keys = {}; q.forEach(function (z) { keys[z.key] = 1; });
      if (keys.dao && keys.qiang && keys.gong && keys.qi) {
        q.forEach(function (z) { z.bDmg += 0.2; z.bSpd += 0.2; });
        side.bonds.push({ kind: 'form', name: '四象阵', desc: G.FORMATIONS[1].desc, cells: q.map(function (z) { return [z.x, z.y]; }) });
      }
    }
    // 武将羁绊
    var gens = {};
    us.forEach(function (x) { if (x.kind === 'general') (gens[x.gen] = gens[x.gen] || []).push(x); });
    G.GEN_BONDS.forEach(function (gb) {
      var members = gb.gens.filter(function (g) { return gens[g]; });
      if (members.length < gb.need || (gb.req && !gens[gb.req])) return;
      var mu = [];
      members.forEach(function (g) { mu = mu.concat(gens[g]); });
      side.flags[gb.id] = true;
      switch (gb.id) {
        case 'wuhu': mu.forEach(function (x) { x.bSpd += members.length >= 5 ? gb.spd5 : gb.spd; }); break;
        case 'lianhuan': (gens.lvbu || []).forEach(function (x) { x.bDmg += gb.dmg; }); break;
        case 'huwei': mu.forEach(function (x) { if (x.gen !== 'caocao') x.bDmg += gb.dmg; }); break;
        default:
          mu.forEach(function (x) { if (gb.dmg) x.bDmg += gb.dmg; if (gb.spd) x.bSpd += gb.spd; });
      }
      side.bonds.push({ kind: 'gen', name: gb.name, desc: gb.desc, cells: mu.map(function (x) { return [x.x, x.y]; }) });
    });
    side.bondVer = side.boardVer;
    side.bonds.forEach(function (b) {
      if (!old[b.name]) { old[b.name] = 1; self.emit({ k: 'bond', side: side.idx, name: b.name, kind: b.kind, cells: b.cells }); }
    });
  };

  // ───────────────────────── 军令（可反复使用） ─────────────────────────
  B.canUseSkill = function (side, i) {
    var k = side.skills[i];
    return !!k && k.cd <= 0 && this.state === 'run';
  };

  // 点在路线附近的位置 → 路线上的落点；离路线太远返回 null
  B.laneTarget = function (side, x, y) {
    var lane = this.lanes[side.idx];
    var d = lane.nearestDist(x, y), p = lane.pos(d);
    if (d2(p.x, p.y, x, y) > 1.6 * 1.6) return null;
    return { dist: d, x: p.x, y: p.y };
  };

  B.useSkill = function (side, i, at) {
    if (!this.canUseSkill(side, i)) return false;
    var k = side.skills[i], def = G.SKILL[k.id], self = this;
    var lane = this.lanes[side.idx];
    var hp = this.hpScale(Math.max(1, this.wave));
    var tgt = null;
    if (def.target === 'lane') {
      tgt = at ? this.laneTarget(side, at.x, at.y) : null;
      if (!tgt) return false;
    }
    switch (k.id) {
      case 'arrows':
        this.zones.push({ side: side.idx, kind: 'arrows', x: tgt.x, y: tgt.y, r: 1.35, t: 2.5, max: 2.5, dps: hp * 0.55 });
        break;
      case 'rocks':
        this.blasts.push({ side: side.idx, kind: 'rock', t: 0.55, x: tgt.x, y: tgt.y, r: 1.05, dmg: hp * 1.1, stun: 1.5, src: null });
        break;
      case 'jvma':
        this.barriers.push({ side: side.idx, dist: tgt.dist, x: tgt.x, y: tgt.y, t: 5, max: 5 });
        break;
      case 'drum':
        side.buffs.push({ m: 0.35, t: 6 });
        break;
      case 'thunder':
        var cands = this.enemiesNear(side, tgt.x, tgt.y, 1.8);
        if (cands.length) {
          cands.sort(function (a, b) { return b.hp - a.hp; });
          var victim = cands[0];
          this.hurt(side, victim, hp * 3.2, null, { pierceArmor: true, crit: true });
          tgt = { x: victim.x, y: victim.y, dist: victim.dist };
        }
        break;
      case 'cry':
        side.enemies.forEach(function (e) {
          if (!e.dead && lane.len - e.dist < 3) { self.knock(e, e.boss ? 0.5 * 4 : 1.5); self.slow(e, 0.5, 3); }
        });
        break;
    }
    k.cd = def.cd;
    k.uses++;
    this.emit({ k: 'order', side: side.idx, id: k.id, x: tgt ? tgt.x : null, y: tgt ? tgt.y : null });
    return true;
  };

  // ───────────────────────── 锦囊 ─────────────────────────
  B.canUseCard = function (side, i) {
    var c = side.cards[i];
    if (!c || c.used || this.state !== 'run') return false;
    if (c.id === 'kurou' && side.hearts <= 1) return false;
    return true;
  };

  B.useCard = function (side, i) {
    if (!this.canUseCard(side, i)) return false;
    var c = side.cards[i], self = this, en = side.enemies.filter(function (e) { return !e.dead; });
    var other = this.solo ? null : this.sides[1 - side.idx];
    switch (c.id) {
      case 'kongcheng':
        en.forEach(function (e) { if (e.boss) { if (e.boss !== 'lvbu') self.slow(e, 0.5, 5); } else e.stunT = Math.max(e.stunT, 5); });
        break;
      case 'huogong':
        var t = this.fireDur(side, 6);
        this.zones.push({ side: side.idx, kind: 'lanefire', t: t, max: t, dps: this.hpScale(Math.max(1, this.wave)) * 0.2 });
        break;
      case 'caochuan':
        side.units.forEach(function (u) {
          var bow = (u.kind === 'soldier' && u.key === 'gong') || ((u.kind === 'general' || u.kind === 'part') && G.GEN[u.gen].type === 0);
          if (bow) u.buffs.push({ m: 1, t: 10 });
        });
        side.buns += 20; side.bunsEarned += 20;
        break;
      case 'kurou':
        side.hearts = Math.max(1, side.hearts - 1);
        side.buns += 80; side.bunsEarned += 80;
        side.dmgBuffs.push({ m: 0.4, t: 15 });
        break;
      case 'jiedao':
        var victims = en.filter(function (e) { return !e.boss; }).sort(function (a, b) { return b.hp - a.hp; }).slice(0, 4);
        victims.forEach(function (e) {
          if (other) {
            side.enemies.splice(side.enemies.indexOf(e), 1);
            e.side = other.idx; e.dist = 0; e.hitBy = {}; e.born = self.t;
            var p = self.lanes[other.idx].pos(0, e.lat); e.x = p.x; e.y = p.y;
            other.enemies.push(e);
          } else self.hurt(side, e, e.hp + 1, null, { pierceArmor: true });
        });
        break;
      case 'diaohu':
        en.sort(function (a, b) { return b.dist - a.dist; }).slice(0, 3).forEach(function (e) { e.dist = 0; e.hitBy = {}; });
        break;
      case 'lianhuan':
        side.linkT = 10;
        break;
      case 'andu':
        for (var k = 0; k < 5; k++) {
          var it = this.drawItem(side);
          if (it.kind === 'soldier' || it.kind === 'farmer') it.lvl = 2;
          side.camp[k] = it;
        }
        break;
    }
    c.used = true;
    this.emit({ k: 'card', side: side.idx, id: c.id, name: G.CARD[c.id].name });
    return true;
  };
})(typeof window !== 'undefined' ? window : globalThis);

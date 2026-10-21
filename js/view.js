/* 赵云与阿斗 · 战场绘制与操作
 * 设计分辨率宽 640，地图 8×10 格、每格 80。全部用 Canvas 2D 程序化绘制。
 */
(function (root) {
  'use strict';
  var G = root.G = root.G || {};
  var CELL = 80, DW = 640, MIN_DH = 1240;
  var FONT = '"ZYBrush", "STKaiti", "KaiTi", "Kaiti SC", "Noto Serif CJK SC", serif';
  var SANS = '"PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';
  G.FONT = FONT; G.SANS = SANS;

  var LVL_COLOR = ['#1d1a17', '#1d1a17', '#1f5c2e', '#1b4f8f', '#6b2fa3', '#b3261e', '#c98a00', '#c98a00'];
  var LVL_NUM = ['#333', '#333', '#2e8b3e', '#2f74c0', '#9b3fd1', '#d64535', '#e0a100', '#e0a100'];
  var INK = '#1d1a17';

  function BattleView(canvas, battle, opts) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.b = battle;
    this.o = opts || {};
    this.ais = opts.ais || (opts.ai ? [opts.ai] : []);
    this.speed = (opts.settings && opts.settings.speed) || 1;
    this.paused = false;
    this.glyphs = {}; this.glyphCount = 0;
    this.parts = [];
    this.floaters = [];
    this.banners = [];
    this.drag = null;
    this.sel = null;
    this.hover = null;
    this.time = 0;
    this.acc = 0;
    this.endT = -1;
    this.staticVer = -1;
    this.adou = [{ shake: 0, say: null, sayT: 0, nextIdle: 8 }, { shake: 0, say: null, sayT: 0, nextIdle: 12 }];
    this.hintDone = {};
    this.dmgNumbers = !opts.settings || opts.settings.dmg !== false;
    this.tipEl = opts.tipEl || null;
    this.bindInput();
    this.resize();
  }
  G.BattleView = BattleView;
  var V = BattleView.prototype;

  // ───────────────────────── 尺寸 ─────────────────────────
  V.resize = function () {
    var r = this.cv.getBoundingClientRect();
    var w = Math.max(200, r.width), h = Math.max(300, r.height);
    this.dpr = Math.min(root.devicePixelRatio || 1, 2.5);
    this.cv.width = Math.round(w * this.dpr);
    this.cv.height = Math.round(h * this.dpr);
    this.cssW = w; this.cssH = h;
    this.s = Math.min(w / DW, h / MIN_DH);
    this.DH = h / this.s;
    this.ox = (w - DW * this.s) / 2;
    this.oy = 0;
    var extra = this.DH - MIN_DH;
    this.top = Math.min(80, extra * 0.45);
    this.MAP_Y = 150 + this.top;
    this.CAMP_Y = this.MAP_Y + 800 + 22;
    this.BTN_Y = this.CAMP_Y + 110;
    this.glyphs = {}; this.glyphCount = 0;
    this.staticVer = -1;
    this.layout();
  };

  V.layout = function () {
    var cy = this.CAMP_Y;
    this.R = {
      pause: { x: 16, y: this.top + 18, w: 70, h: 70 },
      speed: { x: 560, y: this.top + 22, w: 66, h: 56 },
      ying: { x: 6, y: cy - 4, w: 88, h: 94 },
      camp: [0, 1, 2, 3, 4].map(function (i) { return { x: 98 + i * 86, y: cy, w: 80, h: 86 }; }),
      recruit: { x: 190, y: this.BTN_Y, w: 260, h: 100 },
      bar: [{ x: 532, y: cy, w: 100, h: 86 }],
      skills: [{ x: 18, y: this.BTN_Y + 4, w: 80, h: 92 }, { x: 104, y: this.BTN_Y + 4, w: 80, h: 92 }],
      cards: [{ x: 462, y: this.BTN_Y + 4, w: 80, h: 92 }, { x: 550, y: this.BTN_Y + 4, w: 80, h: 92 }],
      help: { x: 98, y: this.top + 26, w: 54, h: 54 },
      wave: { x: 236, y: this.top + 70, w: 168, h: 66 }
    };
  };

  V.toDesign = function (cx, cy) {
    return { x: (cx - this.ox) / this.s, y: (cy - this.oy) / this.s };
  };
  V.cellCenter = function (x, y) { return { x: (x + 0.5) * CELL, y: this.MAP_Y + (y + 0.5) * CELL }; };
  V.posOf = function (gx, gy) { return { x: gx * CELL, y: this.MAP_Y + gy * CELL }; };
  V.cellAtPoint = function (x, y) {
    var cx = Math.floor(x / CELL), cy = Math.floor((y - this.MAP_Y) / CELL);
    if (cx < 0 || cy < 0 || cx > 7 || cy > 9) return null;
    return [cx, cy];
  };
  function inR(p, r) { return r && p.x >= r.x && p.y >= r.y && p.x <= r.x + r.w && p.y <= r.y + r.h; }

  // ───────────────────────── 字形缓存 ─────────────────────────
  V.glyph = function (text, size, color, o) {
    o = o || {};
    var key = text + '|' + size + '|' + color + '|' + (o.stroke || '') + '|' + (o.sw || 0) + '|' + (o.font || '') + '|' + (o.bold ? 1 : 0);
    var g = this.glyphs[key];
    if (g) return g;
    if (++this.glyphCount > 900) { this.glyphs = {}; this.glyphCount = 0; }
    var k = this.s * this.dpr;
    var font = (o.bold ? 'bold ' : '') + Math.round(size * k) + 'px ' + (o.font === 'sans' ? SANS : FONT);
    var c = document.createElement('canvas');
    var cx = c.getContext('2d');
    cx.font = font;
    var w = Math.ceil(cx.measureText(text).width + (o.sw || 0) * 2 * k + size * k * 0.3);
    var h = Math.ceil(size * k * 1.45 + (o.sw || 0) * 2 * k);
    c.width = Math.max(2, w); c.height = Math.max(2, h);
    cx.font = font;
    cx.textAlign = 'center'; cx.textBaseline = 'middle';
    if (o.stroke) { cx.lineJoin = 'round'; cx.strokeStyle = o.stroke; cx.lineWidth = (o.sw || 3) * 2 * k; cx.strokeText(text, w / 2, h / 2 + size * k * 0.04); }
    cx.fillStyle = color;
    cx.fillText(text, w / 2, h / 2 + size * k * 0.04);
    g = { c: c, w: w / k, h: h / k };
    this.glyphs[key] = g;
    return g;
  };
  V.drawGlyph = function (text, size, color, x, y, o) {
    var g = this.glyph(text, size, color, o);
    var sc = (o && o.scale) || 1;
    this.ctx.drawImage(g.c, x - g.w * sc / 2, y - g.h * sc / 2, g.w * sc, g.h * sc);
    return g;
  };

  // 会变的数字直接画，不进缓存
  V.num = function (text, size, color, x, y, stroke, sw) {
    var c = this.ctx;
    c.font = 'bold ' + size + 'px ' + SANS;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    if (stroke) { c.lineJoin = 'round'; c.strokeStyle = stroke; c.lineWidth = (sw || 3) * 2; c.strokeText(text, x, y); }
    c.fillStyle = color; c.fillText(text, x, y);
  };

  // ───────────────────────── 静态层：地图 ─────────────────────────
  V.buildStatic = function () {
    var b = this.b, map = b.map, col = map.colors;
    var k = this.s * this.dpr;
    var c = this.staticCv || (this.staticCv = document.createElement('canvas'));
    c.width = this.cv.width; c.height = this.cv.height;
    var x = c.getContext('2d');
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.fillStyle = col.bg; x.fillRect(0, 0, c.width, c.height);
    x.setTransform(k, 0, 0, k, this.ox * this.dpr, this.oy * this.dpr);
    var rng = G.makeRng(map.id * 101 + 7);
    var MY = this.MAP_Y;

    // 顶部天空与远山
    var sky = x.createLinearGradient(0, -this.oy, 0, MY);
    sky.addColorStop(0, col.sky); sky.addColorStop(1, col.bg);
    x.fillStyle = sky; x.fillRect(-this.ox / this.s, -10, DW + 2 * this.ox / this.s, MY + 10);
    drawMountains(x, rng, MY, map.theme);
    // 底部面板
    x.fillStyle = shade(col.bg, -4);
    x.fillRect(-this.ox / this.s, MY + 806, DW + 2 * this.ox / this.s, this.DH - MY - 806 + 10);
    x.fillStyle = 'rgba(0,0,0,0.08)'; x.fillRect(-this.ox / this.s, MY + 806, DW + 2 * this.ox / this.s, 3);

    // 格子
    for (var gy = 0; gy < 10; gy++) for (var gx = 0; gx < 8; gx++) {
      var cell = b.grid[gy][gx], px = gx * CELL, py = MY + gy * CELL;
      if (cell.t === 'R') drawRoad(x, px, py, col, rng, map.theme);
      else if (cell.t === 'G') drawGrass(x, px, py, col, rng, map.theme);
      else drawBuild(x, px, py, col);
    }
    // 高地描边（草地/营地与道路交界）
    x.strokeStyle = '#2b2622'; x.lineWidth = 2.6; x.lineCap = 'round';
    x.beginPath();
    for (gy = 0; gy < 10; gy++) for (gx = 0; gx < 8; gx++) {
      var c0 = b.grid[gy][gx];
      if (c0.t === 'R') continue;
      var px2 = gx * CELL, py2 = MY + gy * CELL;
      [[0, -1, px2, py2, px2 + CELL, py2], [0, 1, px2, py2 + CELL, px2 + CELL, py2 + CELL], [-1, 0, px2, py2, px2, py2 + CELL], [1, 0, px2 + CELL, py2, px2 + CELL, py2 + CELL]].forEach(function (d) {
        var n = b.cellAt(gx + d[0], gy + d[1]);
        if (n && n.t === 'R') { x.moveTo(d[2], d[3]); x.lineTo(d[4], d[5]); }
      });
    }
    x.stroke();
    // 两军之间的乱石墙
    var walls = b.walls;
    x.fillStyle = col.wall;
    walls.forEach(function (w) {
      var ax, ay, bx, by;
      if (w[0] === w[2]) { // 上下相邻：横墙
        var yy = MY + Math.max(w[1], w[3]) * CELL;
        ax = w[0] * CELL; bx = ax + CELL; ay = by = yy;
      } else {
        var xx = Math.max(w[0], w[2]) * CELL;
        ay = MY + w[1] * CELL; by = ay + CELL; ax = bx = xx;
      }
      drawRocks(x, ax, ay, bx, by, rng);
    });
    // 外框
    x.strokeStyle = '#1d1a17'; x.lineWidth = 4;
    x.strokeRect(1, MY + 1, DW - 2, 800 - 2);
    // 出兵口的灌木
    for (var s = 0; s < 2; s++) {
      var lp = b.lanes[s].pts[0];
      drawBush(x, lp.x * CELL, MY + lp.y * CELL, rng);
    }
    this.staticVer = b.gridVersion;
  };

  function shade(hex, amt) {
    var n = parseInt(hex.slice(1), 16);
    var r = G.clamp((n >> 16) + amt, 0, 255), g = G.clamp(((n >> 8) & 255) + amt, 0, 255), bb = G.clamp((n & 255) + amt, 0, 255);
    return 'rgb(' + r + ',' + g + ',' + bb + ')';
  }

  function drawMountains(x, rng, MY, theme) {
    x.save();
    var layers = theme === 'river' ? 2 : 3;
    for (var l = 0; l < layers; l++) {
      x.fillStyle = 'rgba(60,55,50,' + (0.07 + l * 0.05) + ')';
      x.beginPath();
      var base = MY - 8 - (layers - l) * 6;
      x.moveTo(-40, MY);
      var px = -40;
      while (px < DW + 40) {
        var w = 60 + rng() * 90, h = 20 + rng() * (55 - l * 10);
        x.quadraticCurveTo(px + w * 0.5, base - h * 2 + l * 18, px + w, base - rng() * 8 + l * 6);
        px += w;
      }
      x.lineTo(DW + 40, MY); x.closePath(); x.fill();
    }
    if (theme === 'river') {
      x.strokeStyle = 'rgba(40,70,90,0.25)'; x.lineWidth = 2;
      for (var i = 0; i < 8; i++) {
        var yy = MY - 30 + rng() * 26, xx = rng() * DW;
        x.beginPath(); x.moveTo(xx, yy); x.quadraticCurveTo(xx + 15, yy - 6, xx + 30, yy); x.quadraticCurveTo(xx + 45, yy + 6, xx + 60, yy); x.stroke();
      }
      // 船帆
      for (i = 0; i < 3; i++) {
        var sx = 80 + i * 200 + rng() * 60, sy = MY - 36;
        x.fillStyle = 'rgba(60,40,30,0.35)';
        x.beginPath(); x.moveTo(sx - 30, sy + 14); x.lineTo(sx + 30, sy + 14); x.lineTo(sx + 22, sy + 24); x.lineTo(sx - 22, sy + 24); x.fill();
        x.fillStyle = 'rgba(160,50,30,0.35)';
        x.beginPath(); x.moveTo(sx, sy - 34); x.lineTo(sx + 18, sy + 8); x.lineTo(sx, sy + 10); x.fill();
      }
    }
    if (theme === 'pass') {
      x.fillStyle = 'rgba(60,50,45,0.28)';
      x.fillRect(220, MY - 64, 200, 56);
      for (var j = 0; j < 10; j++) x.fillRect(220 + j * 20, MY - 74, 12, 12);
      x.fillStyle = 'rgba(40,30,25,0.35)';
      x.beginPath(); x.arc(320, MY - 8, 22, Math.PI, 0); x.fill();
    }
    x.restore();
  }

  function drawRoad(x, px, py, col, rng, theme) {
    x.fillStyle = col.road; x.fillRect(px, py, CELL, CELL);
    x.strokeStyle = col.road2; x.lineWidth = 1.4;
    if (theme === 'river') {
      for (var i = 0; i < 4; i++) { x.beginPath(); x.moveTo(px, py + i * 20 + 10); x.lineTo(px + CELL, py + i * 20 + 10); x.stroke(); }
      x.fillStyle = col.road2;
      x.fillRect(px + 8, py + 4, 3, 3); x.fillRect(px + 60, py + 46, 3, 3);
      return;
    }
    x.beginPath();
    for (var r = 0; r < 2; r++) {
      var yy = py + r * 40;
      x.moveTo(px, yy + 40); x.lineTo(px + CELL, yy + 40);
      var off = r % 2 ? 0 : 40;
      x.moveTo(px + off + 0.5, yy); x.lineTo(px + off + 0.5, yy + 40);
    }
    x.stroke();
    x.fillStyle = 'rgba(0,0,0,0.05)';
    for (i = 0; i < 6; i++) x.fillRect(px + rng() * 76, py + rng() * 76, 2 + rng() * 3, 2);
  }

  function drawGrass(x, px, py, col, rng, theme) {
    x.fillStyle = rng() < 0.5 ? col.grass : shade(col.grass, -6);
    x.fillRect(px, py, CELL, CELL);
    x.strokeStyle = 'rgba(255,255,255,0.18)'; x.lineWidth = 1;
    x.strokeRect(px + 0.5, py + 0.5, CELL - 1, CELL - 1);
    x.strokeStyle = shade(col.grass, -38); x.lineWidth = 1.6; x.lineCap = 'round';
    var n = 3;
    for (var i = 0; i < n; i++) {
      var tx = px + 12 + rng() * 56, ty = py + 16 + rng() * 52;
      x.beginPath();
      if (theme === 'river') {
        x.moveTo(tx - 8, ty); x.quadraticCurveTo(tx - 4, ty - 4, tx, ty); x.quadraticCurveTo(tx + 4, ty + 4, tx + 8, ty);
      } else if (theme === 'pass') {
        x.ellipse(tx, ty, 5 + rng() * 3, 3.5, 0, 0, Math.PI * 2);
      } else if (theme === 'marsh' && rng() < 0.4) {
        x.moveTo(tx, ty + 6); x.lineTo(tx - 2, ty - 10); x.moveTo(tx + 3, ty + 6); x.lineTo(tx + 5, ty - 8);
      } else {
        x.moveTo(tx - 5, ty - 4); x.lineTo(tx - 2, ty + 2); x.lineTo(tx, ty - 6); x.lineTo(tx + 2, ty + 2); x.lineTo(tx + 5, ty - 3);
      }
      x.stroke();
    }
  }

  function drawBuild(x, px, py, col) {
    x.fillStyle = col.build; x.fillRect(px, py, CELL, CELL);
    x.strokeStyle = 'rgba(80,70,60,0.18)'; x.lineWidth = 1.5;
    x.strokeRect(px + 3, py + 3, CELL - 6, CELL - 6);
    x.fillStyle = 'rgba(120,100,80,0.07)'; x.fillRect(px + 3, py + CELL - 9, CELL - 6, 6);
  }

  function drawRocks(x, ax, ay, bx, by, rng) {
    var len = Math.abs(bx - ax) + Math.abs(by - ay);
    var n = Math.round(len / 13);
    for (var i = 0; i <= n; i++) {
      var t = i / n, cx = ax + (bx - ax) * t, cy = ay + (by - ay) * t;
      var s = 6 + rng() * 4;
      x.beginPath();
      if (ay === by) { x.moveTo(cx - s, cy + 3); x.lineTo(cx, cy - s - 1); x.lineTo(cx + s, cy + 3); }
      else { x.moveTo(cx - 3, cy - s); x.lineTo(cx + s + 1, cy); x.lineTo(cx - 3, cy + s); x.moveTo(cx + 3, cy - s); x.lineTo(cx - s - 1, cy); x.lineTo(cx + 3, cy + s); }
      x.closePath(); x.fill();
    }
  }

  function drawBush(x, cx, cy, rng) {
    x.save();
    x.fillStyle = '#2b2a28';
    for (var i = 0; i < 9; i++) {
      var a = -Math.PI + (i / 8) * Math.PI;
      x.beginPath();
      x.ellipse(cx + Math.cos(a) * 18, cy + 10 + Math.sin(a) * 6, 6, 16 + rng() * 6, a + Math.PI / 2, 0, Math.PI * 2);
      x.fill();
    }
    x.fillStyle = '#4a4744';
    x.beginPath(); x.ellipse(cx, cy + 18, 30, 12, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#f4f0e8';
    x.beginPath(); x.arc(cx + 3, cy - 12, 4, 0, Math.PI * 2); x.fill();
    x.restore();
  }

  // ───────────────────────── 每帧 ─────────────────────────
  V.frame = function (dtReal) {
    dtReal = Math.min(0.1, dtReal);
    this.time += dtReal;
    var b = this.b;
    // 长按：显示说明，不触发选中
    var dg = this.drag;
    if (dg && dg.from && !dg.active && !dg.long && this.time - this.downT > 0.45) {
      dg.long = true;
      this.showTipFor(dg.from);
      G.haptic(10);
    }
    var frozen = this.tutFrozen();
    if (!this.paused) {
      var step = 1 / 60;
      this.acc += dtReal * this.speed;
      if (frozen) this.acc = 0;
      var n = 0;
      while (this.acc >= step && n < 10) {
        this.acc -= step; n++;
        for (var ai = 0; ai < this.ais.length; ai++) this.ais[ai].update(step);
        b.update(step);
      }
      if (n >= 10) this.acc = Math.min(this.acc, step * 4);
      this.tickFx(dtReal * this.speed);
      this.handleEvents();
      if (b.state === 'over') {
        if (this.endT < 0) this.endT = this.time;
        if (this.time - this.endT > 1.8 && !this.endCalled) {
          this.endCalled = true;
          if (this.o.onEnd) this.o.onEnd(b.summary());
        }
      }
    }
    this.draw();
  };

  V.tickFx = function (dt) {
    var i;
    for (i = this.parts.length - 1; i >= 0; i--) {
      var p = this.parts[i];
      p.t += dt;
      if (p.vx) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += (p.g || 0) * dt; }
      if (p.t >= p.max) this.parts.splice(i, 1);
    }
    for (i = this.banners.length - 1; i >= 0; i--) { this.banners[i].t += dt; if (this.banners[i].t >= this.banners[i].max) this.banners.splice(i, 1); }
    for (var s = 0; s < this.adou.length; s++) {
      var a = this.adou[s];
      if (a.shake > 0) a.shake -= dt;
      if (a.sayT > 0) { a.sayT -= dt; if (a.sayT <= 0) a.say = null; }
      a.nextIdle -= dt;
      if (a.nextIdle <= 0) { a.nextIdle = 14 + Math.random() * 12; if (!a.say) this.say(s, G.ADOU_LINES.idle); }
    }
  };

  V.say = function (s, lines, force) {
    var a = this.adou[s];
    if (!a || (a.say && !force)) return;
    a.say = typeof lines === 'string' ? lines : lines[Math.floor(Math.random() * lines.length)];
    a.sayT = 2.2;
  };

  V.add = function (p) { if (this.parts.length < 500) { p.t = p.t || 0; this.parts.push(p); } return p; };
  V.text = function (txt, x, y, color, size, o) {
    o = o || {};
    this.add({ type: 'text', txt: txt, x: x, y: y, vx: o.vx || 0.0001, vy: o.vy != null ? o.vy : -50, g: o.g || 0, max: o.max || 0.9, color: color, size: size || 26, stroke: o.stroke || '#fff', font: o.font, pop: o.pop });
  };
  V.banner = function (txt, sub, o) {
    o = o || {};
    if (o.side === 1) this.banners = this.banners.filter(function (b) { return b.side !== 1; });
    else this.banners = this.banners.filter(function (b) { return b.side === 1; });
    this.banners.push({ txt: txt, sub: sub || '', t: 0, max: o.max || 1.8, color: o.color || '#1d1a17', boss: !!o.boss, side: o.side, event: !!o.event });
  };

  // ───────────────────────── 战斗事件 → 特效与音效 ─────────────────────────
  V.handleEvents = function () {
    var b = this.b, A = G.Audio, self = this;
    var evs = b.ev;
    for (var i = 0; i < evs.length; i++) {
      var e = evs[i];
      var mine = e.side === 0;
      var P = e.x != null ? this.posOf(e.x, e.y) : null;
      switch (e.k) {
        case 'wave':
          if (e.boss) {
            var bd = G.BOSSES[e.boss];
            this.banner('Boss 来袭', bd.name + ' · ' + bd.desc, { boss: true, max: 3.2, color: '#9e1b16' });
            A.play('boss');
            this.say(0, G.ADOU_LINES.boss, true);
          } else {
            this.banner('第' + G.cnNum(e.n) + '波', '', { max: 1.4 });
            A.play('wave');
          }
          break;
        case 'recruit': if (mine) A.play('recruit'); break;
        case 'bond':
          var bc = e.cells[0], bcc = this.cellCenter(bc[0], bc[1]);
          if (e.kind === 'gen') {
            if (mine) { A.play('unlock'); G.haptic([20, 40, 20]); }
            this.text(e.name + '！', 320, this.MAP_Y + (e.side === 0 ? 560 : 240), '#b3261e', mine ? 46 : 34, { pop: true, max: 1.8, vy: -16 });
          } else {
            if (mine) A.play('skill');
            this.text(e.name, bcc.x, bcc.y - 46, e.kind === 'form' ? '#b3261e' : '#2f74c0', 30, { pop: true, max: 1.2 });
          }
          break;
        case 'card':
          var cd = G.CARD[e.id];
          if (mine) { A.play('boss'); G.haptic(30); this.banner(cd.name, cd.desc, { max: 2.2, color: '#9e1b16' }); }
          else { A.play('skill'); this.banner('对手：' + cd.name, cd.desc, { max: 2, side: 1 }); }
          this.cardFx(e);
          break;
        case 'order':
          this.orderFx(e);
          break;
        case 'rock':
          if (mine) { A.play('boom'); G.haptic(15); }
          this.add({ type: 'boom', x: P.x, y: P.y, r: e.r * CELL, max: 0.45, color: '#8a7a6a' });
          this.dust(P); this.dust({ x: P.x + 20, y: P.y - 10 });
          break;
        case 'event':
          var ev = G.EVENT[e.id];
          A.play('wave');
          this.banner(ev.name, ev.desc, { max: 2.6, event: true });
          break;
        case 'act':
          if (!mine) { if (e.kind === 'form' || e.kind === 'genup') this.burst(this.cellCenter(e.x, e.y), '#e0a100', 10); break; }
          var cc = this.cellCenter(e.x, e.y);
          if (e.kind === 'merge') { A.play('merge'); G.haptic(12); this.burst(cc, '#e0a100', 14); this.text('升级!', cc.x, cc.y - 30, '#b3261e', 30, { pop: true }); }
          else if (e.kind === 'form') { A.play('general'); G.haptic([25, 30, 25]); this.burst(cc, '#e0a100', 22); this.text('武将登场!', cc.x, cc.y - 34, '#b3261e', 32, { pop: true, max: 1.3 }); }
          else if (e.kind === 'genup' || e.kind === 'genmerge') { A.play('merge'); this.burst(cc, '#e0a100', 16); this.text('武将升级!', cc.x, cc.y - 30, '#b3261e', 30, { pop: true }); }
          else if (e.kind === 'prop') {
            if (e.prop === 'shovel') { A.play('shovel'); this.dust(cc); }
            else if (e.prop === 'promote') { A.play('merge'); this.burst(cc, '#b3261e', 14); this.text('晋升!', cc.x, cc.y - 30, '#b3261e', 30, { pop: true }); }
            else if (e.prop === 'ink') { A.play('place'); this.inkSplash(cc.x, cc.y, 30, '#1d1a17'); }
            else if (e.prop === 'mine') A.play('place');
          }
          else if (e.kind === 'dismiss') { A.play('coin'); }
          else A.play('place');
          break;
        case 'dmg':
          if (this.dmgNumbers && (mine || e.crit)) {
            this.add({ type: 'dmg', n: e.n, x: P.x + (Math.random() - 0.5) * 20, y: P.y - 20, vx: 0.0001, vy: -60, max: 0.6, crit: e.crit, side: e.side });
          }
          break;
        case 'die':
          this.inkSplash(P.x, P.y, e.boss ? 60 : 24, mine ? '#1d1a17' : '#3a3633');
          this.add({ type: 'fall', ch: e.ch, x: P.x, y: P.y, max: 0.5, boss: e.boss });
          if (mine) { A.play('die'); this.text('+' + e.bun, P.x + 14, P.y - 24, '#c98a00', 24, { max: 0.8 }); }
          break;
        case 'leak':
          A.play(mine ? 'leak' : 'coin');
          this.adou[e.side].shake = 0.6;
          this.say(e.side, G.ADOU_LINES.hurt, true);
          if (mine) { this.flashRed = 0.6; G.haptic([60, 40, 60]); }
          break;
        case 'danger': this.say(e.side, G.ADOU_LINES.danger); break;
        case 'slash': if (mine) A.play('slash'); this.add({ type: 'slash', x: P.x, y: P.y, fx: e.fx * CELL, fy: this.MAP_Y + e.fy * CELL, max: 0.22, big: e.big || e.gen, small: e.small }); break;
        case 'thrust': if (mine) A.play('thrust'); this.add({ type: 'thrust', x: e.x * CELL, y: this.MAP_Y + e.y * CELL, tx: e.tx * CELL, ty: this.MAP_Y + e.ty * CELL, max: 0.2, gen: e.gen }); break;
        case 'sword': if (mine) A.play('slash'); this.add({ type: 'sword', x: P.x, y: P.y, max: 0.2, gen: e.gen }); break;
        case 'charge': if (mine) A.play('clash'); this.add({ type: 'ring', x: P.x, y: P.y, r: 40, max: 0.3, color: 'rgba(30,25,20,0.6)', w: 5 }); this.dust(P); break;
        case 'arrowHit': if (mine) A.play('hit'); break;
        case 'qinglong': if (mine) A.play('clash'); this.add({ type: 'crescent', x: P.x, y: P.y, max: 0.45, r: 1.3 * CELL, color: '#1f7a4a' }); this.text('青龙斩', P.x, P.y - 50, '#1f7a4a', 28, { pop: true }); break;
        case 'roar': if (mine) A.play('roar'); this.add({ type: 'ring', x: P.x, y: P.y, r: e.r * CELL, max: 0.6, color: 'rgba(179,38,30,0.6)', w: 10 }); this.text(e.name, P.x, P.y - 50, '#b3261e', 30, { pop: true, max: 1.2 }); break;
        case 'skill': if (mine) A.play('skill'); this.text(e.name, P.x, P.y - 48, '#b3261e', 28, { pop: true, max: 1.2 }); break;
        case 'wind': if (mine) A.play('skill'); this.text(e.name, P.x, P.y - 48, '#2f74c0', 30, { pop: true, max: 1.4 }); this.add({ type: 'wind', side: e.side, max: 1.4 }); break;
        case 'howl': if (mine) A.play('roar'); this.add({ type: 'ring', x: P.x, y: P.y, r: e.r * CELL + 40, max: 0.5, color: 'rgba(200,120,20,0.6)', w: 8 }); this.text(e.ch + '啸', P.x, P.y - 46, '#c06a00', 28, { pop: true }); break;
        case 'pike': if (mine) A.play('thrust'); this.add({ type: 'pike', x: P.x, y: P.y, max: 0.45 }); break;
        case 'meteor': if (mine) A.play('boom'); this.add({ type: 'boom', x: P.x, y: P.y, r: e.r * CELL, max: 0.45, color: '#e0661a' }); break;
        case 'mine': A.play('boom'); this.add({ type: 'boom', x: P.x, y: P.y, r: e.r * CELL, max: 0.55, color: '#5a4a3a' }); this.inkSplash(P.x, P.y, 50, '#3a2a1a'); break;
        case 'throw': if (mine) A.play('boom'); this.add({ type: 'boom', x: P.x, y: P.y, r: 70, max: 0.4, color: '#8a2a1a' }); this.text('无双', P.x, P.y - 50, '#8a2a1a', 28, { pop: true }); break;
        case 'junzi': if (mine) A.play('skill'); this.add({ type: 'ring', x: P.x, y: P.y, r: e.r * CELL, max: 0.4, color: 'rgba(40,110,200,0.6)', w: 8 }); this.text('君子剑', P.x, P.y - 46, '#2f74c0', 26, { pop: true }); break;
        case 'xiaoren': this.text('小人剑', P.x, P.y - 40, '#4a7a1a', 24, { pop: true }); break;
        case 'flyspear': if (mine) A.play('skill'); this.text('飞枪!', P.x, P.y - 46, '#2f74c0', 30, { pop: true }); this.add({ type: 'flash', side: e.side, max: 0.3, color: 'rgba(200,220,255,0.35)' }); break;
        case 'dragon': this.text('火龙', P.x, P.y - 40, '#d6451a', 26, { pop: true }); break;
        case 'moon': this.add({ type: 'moon', x: P.x, y: P.y, max: 0.5 }); break;
        case 'trip': case 'stunE': this.add({ type: 'stars', x: P.x, y: P.y - 26, max: 0.8 }); break;
        case 'charmE': this.text('♥', P.x, P.y - 34, '#e0508a', 26); break;
        case 'coin': if (mine) A.play('coin'); this.text('+' + (e.n || 1), P.x, P.y - 30, '#c98a00', 22); break;
        case 'farm': if (mine) A.play('farm'); this.text('+' + e.n, P.x, P.y - 30, '#c98a00', 28, { max: 1.1 }); this.add({ type: 'bun', x: P.x, y: P.y - 10, max: 0.8 }); break;
        case 'heal': this.add({ type: 'ring', x: P.x, y: P.y, r: 1.4 * CELL, max: 0.5, color: 'rgba(60,170,80,0.45)', w: 4 }); break;
        case 'lock': if (mine) A.play('lock'); this.text(e.by || '锁', P.x, P.y - 40, '#5a5550', 32, { pop: true }); break;
        case 'charm': if (mine) A.play('lock'); this.text('魅惑', P.x, P.y - 40, '#e0508a', 28, { pop: true }); break;
        case 'summon': this.inkSplash(P.x, P.y, 40, '#c9a227'); break;
        case 'dash': this.dust(P); break;
        case 'vanish': this.inkSplash(P.x, P.y, 30, '#7fa6c8'); break;
        case 'drum': if (mine) { A.play('wave'); this.text('擂鼓!', 320, this.MAP_Y + 560, '#b3261e', 40, { pop: true, max: 1.2 }); } break;
        case 'healHeart': if (mine) { A.play('heal'); this.say(0, '谢谢子龙！', true); } break;
        case 'bossDie':
          if (mine) { this.text('击败 ' + e.name + '!', 320, this.MAP_Y + 600, '#b3261e', 40, { pop: true, max: 1.8, vy: -20 }); A.play('unlock'); }
          break;
        case 'end':
          if (b.mode === 'endless') A.play('lose');
          else A.play(e.winner === 0 ? 'win' : 'lose');
          this.say(0, e.winner === 0 ? G.ADOU_LINES.win : G.ADOU_LINES.hurt, true);
          break;
      }
    }
    evs.length = 0;
  };

  V.burst = function (c, color, n) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, sp = 80 + Math.random() * 140;
      this.add({ type: 'spark', x: c.x, y: c.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 120, max: 0.5 + Math.random() * 0.3, color: color });
    }
    this.add({ type: 'ring', x: c.x, y: c.y, r: 60, max: 0.4, color: color, w: 6 });
  };
  V.dust = function (c) {
    for (var i = 0; i < 8; i++) {
      var a = Math.random() * Math.PI * 2;
      this.add({ type: 'puff', x: c.x, y: c.y + 10, vx: Math.cos(a) * 60, vy: Math.sin(a) * 30 - 20, max: 0.6, r: 8 + Math.random() * 8 });
    }
  };
  V.inkSplash = function (x, y, size, color) {
    var dots = [];
    for (var i = 0; i < 7; i++) dots.push({ a: Math.random() * Math.PI * 2, d: Math.random() * size * 0.7, r: size * (0.08 + Math.random() * 0.16) });
    this.add({ type: 'ink', x: x, y: y, dots: dots, max: 0.7, color: color, size: size });
  };

  // ───────────────────────── 绘制 ─────────────────────────
  V.draw = function () {
    var x = this.ctx, b = this.b;
    var k = this.s * this.dpr;
    if (this.staticVer !== b.gridVersion) this.buildStatic();
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.drawImage(this.staticCv, 0, 0);
    x.setTransform(k, 0, 0, k, this.ox * this.dpr, this.oy * this.dpr);
    if (b.solo) {
      x.fillStyle = 'rgba(40,32,26,0.28)';
      x.fillRect(0, this.MAP_Y, DW, 400);
      this.drawGlyph(this.o.soloTitle || '无尽守城', 60, 'rgba(255,248,235,0.78)', 320, this.MAP_Y + 160);
      if (this.o.soloSub) this.drawGlyph(this.o.soloSub, 28, 'rgba(255,248,235,0.72)', 320, this.MAP_Y + 228);
    }
    this.drawSpawnArrows();
    this.drawZones();
    this.drawMines();
    this.drawHighlights();
    this.drawBonds();
    this.drawSnakes();
    for (var s = 0; s < b.lanes.length; s++) this.drawAdou(s);
    this.drawUnits();
    this.drawEnemies();
    this.drawBondLabels();
    this.drawProjectiles();
    this.drawSweeps();
    this.drawParts();
    this.drawWeather();
    this.drawRangeRing();
    this.drawHUD();
    this.drawBottom();
    this.drawHints();
    this.drawAim();
    this.drawBanners();
    this.drawDrag();
    if (this.flashRed > 0) {
      this.flashRed -= 0.016;
      x.fillStyle = 'rgba(200,30,20,' + (this.flashRed * 0.35) + ')';
      x.fillRect(-this.ox / this.s, 0, DW + 2 * this.ox / this.s, this.DH);
    }
    if (this.paused) {
      x.fillStyle = 'rgba(20,15,10,0.25)';
      x.fillRect(-this.ox / this.s, 0, DW + 2 * this.ox / this.s, this.DH);
    }
  };

  V.drawSpawnArrows = function () {
    var x = this.ctx, b = this.b;
    for (var s = 0; s < b.lanes.length; s++) {
      if (b.solo && s === 1) continue;
      var L = b.lanes[s], p0 = L.pts[0], p1 = L.pts[1];
      var dx = Math.sign(p1.x - p0.x), dy = Math.sign(p1.y - p0.y);
      for (var i = 0; i < 3; i++) {
        var a = 0.25 + 0.75 * Math.max(0, Math.sin(this.time * 4 - i * 0.9));
        var cx = (p0.x + dx * (0.55 + i * 0.32)) * CELL, cy = this.MAP_Y + (p0.y + dy * (0.55 + i * 0.32)) * CELL;
        x.save(); x.translate(cx, cy); x.rotate(Math.atan2(dy, dx) + Math.PI / 2);
        x.strokeStyle = 'rgba(190,40,30,' + a + ')'; x.lineWidth = 6; x.lineCap = 'round'; x.lineJoin = 'round';
        x.beginPath(); x.moveTo(-14, 6); x.lineTo(0, -8); x.lineTo(14, 6); x.stroke();
        x.restore();
      }
    }
  };

  V.drawZones = function () {
    var x = this.ctx, b = this.b;
    if (!b.zones.length) return;
    x.save();
    x.beginPath(); x.rect(0, this.MAP_Y, DW, 800); x.clip();
    for (var i = 0; i < b.zones.length; i++) {
      var z = b.zones[i], P = this.posOf(z.x, z.y), a = Math.min(1, z.t / 0.6) * Math.min(1, (z.max - z.t) / 0.3 + 0.3);
      if (z.kind === 'fire') {
        for (var j = 0; j < 6; j++) {
          var ang = this.time * 2 + j, rr = z.r * CELL * (0.3 + 0.5 * ((j * 37) % 10) / 10);
          var fx = P.x + Math.cos(ang) * rr, fy = P.y + Math.sin(ang * 1.3) * rr * 0.6;
          var fl = 14 + 8 * Math.sin(this.time * 12 + j);
          x.fillStyle = 'rgba(230,' + (90 + j * 15) + ',30,' + (0.55 * a) + ')';
          x.beginPath(); x.moveTo(fx - 9, fy + 6); x.quadraticCurveTo(fx, fy - fl * 2, fx + 9, fy + 6); x.fill();
        }
        x.fillStyle = 'rgba(220,80,20,' + 0.18 * a + ')';
        x.beginPath(); x.ellipse(P.x, P.y, z.r * CELL, z.r * CELL * 0.7, 0, 0, Math.PI * 2); x.fill();
      } else if (z.kind === 'arrows') {
        x.fillStyle = 'rgba(60,50,40,' + 0.12 * a + ')';
        x.beginPath(); x.arc(P.x, P.y, z.r * CELL, 0, Math.PI * 2); x.fill();
        x.strokeStyle = 'rgba(40,32,26,' + 0.85 * a + ')'; x.lineWidth = 2.5;
        x.beginPath();
        for (var ar = 0; ar < 16; ar++) {
          var ang2 = ar * 2.39996, rad = z.r * CELL * Math.sqrt(((ar * 0.618) % 1));
          var ph = ((this.time * 3 + ar * 0.37) % 1);
          var axp = P.x + Math.cos(ang2) * rad, ayp = P.y + Math.sin(ang2) * rad - 60 * (1 - ph);
          x.moveTo(axp + 6, ayp - 18); x.lineTo(axp, ayp);
        }
        x.stroke();
      } else if (z.kind === 'lanefire') {
        var L = b.lanes[z.side];
        for (var d = 0.3; d < L.len; d += 0.55) {
          var q = L.pos(d), Q = this.posOf(q.x, q.y);
          var fl2 = 18 + 10 * Math.sin(this.time * 11 + d * 3);
          x.fillStyle = 'rgba(235,' + Math.round(100 + 60 * Math.sin(d * 5)) + ',30,' + (0.6 * a) + ')';
          x.beginPath(); x.moveTo(Q.x - 14, Q.y + 14); x.quadraticCurveTo(Q.x + Math.sin(this.time * 7 + d) * 6, Q.y - fl2 * 1.6, Q.x + 14, Q.y + 14); x.fill();
        }
      } else if (z.kind === 'cloud') {
        x.fillStyle = 'rgba(30,30,35,' + 0.45 * a + ')';
        for (j = 0; j < 5; j++) {
          x.beginPath(); x.arc(P.x + Math.cos(j * 1.3 + this.time * 0.6) * 34, P.y - 20 + Math.sin(j * 2.1) * 16, 34 + j * 3, 0, Math.PI * 2); x.fill();
        }
      }
    }
    x.restore();
  };

  V.drawMines = function () {
    var x = this.ctx, b = this.b;
    // 拒马
    for (var bi = 0; bi < b.barriers.length; bi++) {
      var br = b.barriers[bi], BP = this.posOf(br.x, br.y);
      x.globalAlpha = Math.min(1, br.t / 0.5);
      x.strokeStyle = '#6a4a2a'; x.lineWidth = 7; x.lineCap = 'round';
      x.beginPath();
      for (var q = -1; q <= 1; q++) { x.moveTo(BP.x + q * 22 - 12, BP.y - 22); x.lineTo(BP.x + q * 22 + 12, BP.y + 22); x.moveTo(BP.x + q * 22 + 12, BP.y - 22); x.lineTo(BP.x + q * 22 - 12, BP.y + 22); }
      x.stroke();
      x.strokeStyle = '#8a6a3a'; x.lineWidth = 6;
      x.beginPath(); x.moveTo(BP.x - 36, BP.y); x.lineTo(BP.x + 36, BP.y); x.stroke();
      x.globalAlpha = 1;
    }
    // 落石预警
    for (var ri = 0; ri < b.blasts.length; ri++) {
      var bl = b.blasts[ri];
      if (bl.kind !== 'rock') continue;
      var RP = this.posOf(bl.x, bl.y), kk = 1 - bl.t / 0.55;
      x.fillStyle = 'rgba(40,30,20,' + (0.15 + 0.25 * kk) + ')';
      x.beginPath(); x.ellipse(RP.x, RP.y + 10, bl.r * CELL * (0.4 + 0.6 * kk), bl.r * CELL * 0.5 * (0.4 + 0.6 * kk), 0, 0, Math.PI * 2); x.fill();
    }
    for (var i = 0; i < b.mines.length; i++) {
      var m = b.mines[i];
      if (m.side !== 0 && b.mode !== 'endless') { /* 对手的雷也画出来，但淡一些 */ }
      var P = this.posOf(m.x, m.y);
      x.globalAlpha = m.side === 0 ? 1 : 0.6;
      x.fillStyle = '#4a3a2a';
      x.beginPath(); x.ellipse(P.x, P.y + 12, 18, 8, 0, 0, Math.PI * 2); x.fill();
      this.drawGlyph('雷', 26, '#b3261e', P.x, P.y + 4, { stroke: '#fff', sw: 3 });
      x.globalAlpha = 1;
    }
  };

  V.drawSnakes = function () {
    var x = this.ctx, b = this.b;
    for (var i = 0; i < b.snakes.length; i++) {
      var s = b.snakes[i], P = this.posOf(s.x, s.y);
      var bite = s.biteT && b.t - s.biteT < 0.2;
      x.strokeStyle = '#3c6e2a'; x.lineWidth = 7; x.lineCap = 'round';
      x.beginPath();
      for (var j = 0; j <= 10; j++) {
        var tt = j / 10, px = P.x - 24 + tt * 48, py = P.y + 8 + Math.sin(tt * 9 + this.time * 6) * 6;
        if (j === 0) x.moveTo(px, py); else x.lineTo(px, py);
      }
      x.stroke();
      x.fillStyle = '#2a5a1a';
      x.beginPath(); x.arc(P.x + 26 + (bite ? 6 : 0), P.y + 6, 7, 0, Math.PI * 2); x.fill();
    }
  };

  V.drawAdou = function (s) {
    var b = this.b, x = this.ctx;
    if (b.solo && s === 1) return;
    var L = b.lanes[s], end = L.pts[L.pts.length - 1];
    var side = b.sides[s];
    var P = this.posOf(end.x, end.y);
    var a = this.adou[s];
    var sh = a.shake > 0 ? Math.sin(this.time * 60) * 6 * a.shake : 0;
    var bob = Math.sin(this.time * 2.2 + s) * 2;
    var cx = P.x + sh, cy = P.y + bob + 4;
    // 影子
    x.fillStyle = 'rgba(0,0,0,0.18)';
    x.beginPath(); x.ellipse(P.x, P.y + 30, 24, 8, 0, 0, Math.PI * 2); x.fill();
    // 斗
    var hurt = a.shake > 0.3;
    this.drawGlyph('斗', 58, hurt ? '#b3261e' : INK, cx, cy + 6, { stroke: '#fff', sw: 2 });
    // 小皇冠
    x.save(); x.translate(cx + 2, cy - 26);
    x.fillStyle = '#e0a100'; x.strokeStyle = '#7a5200'; x.lineWidth = 2;
    x.beginPath(); x.moveTo(-16, 6); x.lineTo(-14, -6); x.lineTo(-7, 1); x.lineTo(0, -10); x.lineTo(7, 1); x.lineTo(14, -6); x.lineTo(16, 6); x.closePath();
    x.fill(); x.stroke();
    x.fillStyle = '#b3261e'; x.beginPath(); x.arc(0, 1, 2.5, 0, Math.PI * 2); x.fill();
    x.strokeStyle = '#e0a100'; x.lineWidth = 1.5;
    for (var f = -1; f <= 1; f += 2) { x.beginPath(); x.moveTo(f * 14, 6); x.lineTo(f * 15, 16); x.stroke(); }
    x.restore();
    // 心（贴着地图上沿时画在脚下）
    var hy = end.y < 1 ? cy + 44 : cy - 52;
    var max = side.maxHearts;
    for (var i = 0; i < max; i++) {
      var hx = cx + (i - (max - 1) / 2) * 24;
      drawHeart(x, hx, hy, 10, i < side.hearts ? '#d62f2f' : 'rgba(80,70,60,0.35)');
    }
    // 危
    var near = side.enemies.some(function (e) { return L.len - e.dist < 2.5; });
    if (near) {
      var al = 0.5 + 0.5 * Math.sin(this.time * 10);
      x.globalAlpha = al;
      var dx = end.x < 4 ? 46 : -46;
      x.fillStyle = '#b3261e';
      x.beginPath(); x.arc(cx + dx, cy - 4, 22, 0, Math.PI * 2); x.fill();
      this.drawGlyph('危', 30, '#fff', cx + dx, cy - 4);
      x.globalAlpha = 1;
    }
    // 说话
    if (a.say) {
      var bx = end.x < 4 ? cx + 30 : cx - 30, by = cy - 78;
      if (by < this.MAP_Y + 20) by = cy + 50;
      var g = this.glyph(a.say, 20, INK, { font: 'sans' });
      var w = g.w + 6, h = 36;
      var left = end.x < 4 ? bx : bx - w;
      x.fillStyle = 'rgba(255,255,255,0.95)'; x.strokeStyle = INK; x.lineWidth = 2;
      roundRect(x, left, by - h / 2, w, h, 14); x.fill(); x.stroke();
      x.drawImage(g.c, left + 3, by - g.h / 2, g.w, g.h);
    }
  };

  function drawHeart(x, cx, cy, r, color) {
    x.fillStyle = color;
    x.beginPath();
    x.moveTo(cx, cy + r * 0.9);
    x.bezierCurveTo(cx - r * 1.6, cy - r * 0.2, cx - r * 0.7, cy - r * 1.3, cx, cy - r * 0.45);
    x.bezierCurveTo(cx + r * 0.7, cy - r * 1.3, cx + r * 1.6, cy - r * 0.2, cx, cy + r * 0.9);
    x.fill();
  }
  G.drawHeart = drawHeart;

  function roundRect(x, l, t, w, h, r) {
    x.beginPath();
    x.moveTo(l + r, t); x.lineTo(l + w - r, t); x.quadraticCurveTo(l + w, t, l + w, t + r);
    x.lineTo(l + w, t + h - r); x.quadraticCurveTo(l + w, t + h, l + w - r, t + h);
    x.lineTo(l + r, t + h); x.quadraticCurveTo(l, t + h, l, t + h - r);
    x.lineTo(l, t + r); x.quadraticCurveTo(l, t, l + r, t);
    x.closePath();
  }
  G.roundRect = roundRect;

  V.drawUnits = function () {
    var b = this.b;
    for (var s = 0; s < b.sides.length; s++) {
      var us = b.sides[s].units;
      for (var i = 0; i < us.length; i++) {
        var u = us[i];
        if (this.drag && this.drag.active && this.drag.from.cell && this.drag.from.cell[0] === u.x && this.drag.from.cell[1] === u.y && s === 0) {
          this.ctx.globalAlpha = 0.3; this.drawUnit(u); this.ctx.globalAlpha = 1;
          continue;
        }
        this.drawUnit(u);
      }
    }
  };

  V.drawUnit = function (u) {
    var x = this.ctx, b = this.b;
    var c = this.cellCenter(u.x, u.y);
    var cx = c.x, cy = c.y;
    // 出手前倾
    if (u.aim && b.t - u.aim.t < 0.16) {
      var k = 1 - (b.t - u.aim.t) / 0.16;
      var ax = u.aim.x * CELL - cx, ay = this.MAP_Y + u.aim.y * CELL - cy, d = Math.sqrt(ax * ax + ay * ay) || 1;
      cx += ax / d * 8 * k; cy += ay / d * 8 * k;
    }
    var pop = 1;
    var since = b.t - Math.max(u.placeT || -9, u.mergeT || -9);
    if (since < 0.35 && since >= 0) pop = 0.6 + 0.4 * G.easeOutBack(since / 0.35);
    // 影子
    x.fillStyle = 'rgba(0,0,0,0.13)';
    x.beginPath(); x.ellipse(c.x, c.y + 28, 24, 7, 0, 0, Math.PI * 2); x.fill();
    var sel = this.sel && this.sel.from.cell && this.sel.from.cell[0] === u.x && this.sel.from.cell[1] === u.y && u.side === 0;
    if (sel) {
      x.strokeStyle = '#e0a100'; x.lineWidth = 4;
      roundRect(x, c.x - 37, c.y - 37, 74, 74, 10); x.stroke();
    }
    if (u.berserkT > 0) {
      x.fillStyle = 'rgba(220,40,20,' + (0.18 + 0.1 * Math.sin(this.time * 14)) + ')';
      x.beginPath(); x.arc(c.x, c.y, 38, 0, Math.PI * 2); x.fill();
    }
    if (u.kind === 'general') this.drawGeneral(u, cx, cy, pop);
    else if (u.kind === 'part') {
      var gch = G.GEN[u.gen].parts[u.part];
      this.drawGlyph(gch, 56, '#c8781a', cx, cy, { stroke: '#fff7e0', sw: 3, scale: pop });
      x.strokeStyle = 'rgba(200,120,26,0.55)'; x.setLineDash([5, 5]); x.lineWidth = 2;
      x.beginPath(); x.arc(c.x, c.y, 33, 0, Math.PI * 2); x.stroke(); x.setLineDash([]);
    } else if (u.kind === 'farmer') {
      var fc = b.cellAt(u.x, u.y);
      if (fc && fc.t === 'G') {
        // 种在草地上：画一块田
        x.fillStyle = '#9a7a52';
        roundRect(x, c.x - 34, c.y - 30, 68, 62, 8); x.fill();
        x.strokeStyle = '#7a5a36'; x.lineWidth = 3;
        x.beginPath();
        for (var fl = 0; fl < 4; fl++) { x.moveTo(c.x - 28, c.y - 20 + fl * 15); x.lineTo(c.x + 28, c.y - 20 + fl * 15); }
        x.stroke();
        x.fillStyle = '#5f9a3a';
        for (var sp = 0; sp < 6; sp++) { x.beginPath(); x.ellipse(c.x - 22 + (sp % 3) * 22, c.y - 14 + Math.floor(sp / 3) * 30, 4, 7, 0.4, 0, Math.PI * 2); x.fill(); }
      }
      this.drawGlyph('农', 54, '#7a4a1a', cx, cy, { stroke: '#fff', sw: 2, scale: pop });
      x.strokeStyle = '#c98a00'; x.lineWidth = 4;
      x.beginPath(); x.arc(c.x, c.y, 34, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (u.farmT / 10)); x.stroke();
      this.drawLevel(u.lvl, c.x + 25, c.y - 25);
    } else {
      var col = LVL_COLOR[u.lvl] || INK;
      this.drawGlyph(G.SOLDIERS[u.key].ch, 58, col, cx, cy, { stroke: u.lvl >= 5 ? '#ffe9a8' : '#fff', sw: u.lvl >= 5 ? 4 : 2, scale: pop });
      this.drawLevel(u.lvl, c.x + 25, c.y - 25);
    }
    // 状态
    if (u.lockT > 0) {
      x.strokeStyle = '#555'; x.lineWidth = 4;
      x.beginPath(); x.moveTo(c.x - 30, c.y - 30); x.lineTo(c.x + 30, c.y + 30); x.moveTo(c.x + 30, c.y - 30); x.lineTo(c.x - 30, c.y + 30); x.stroke();
      for (var i = -2; i <= 2; i++) { x.strokeStyle = '#777'; x.lineWidth = 3; x.beginPath(); x.ellipse(c.x + i * 12, c.y + i * 12, 6, 4, Math.PI / 4, 0, Math.PI * 2); x.stroke(); }
    }
    if (u.chaosT > 0) {
      x.fillStyle = '#e0508a';
      x.globalAlpha = 0.8;
      this.drawGlyph('♥', 22, '#e0508a', c.x + Math.cos(this.time * 5) * 22, c.y - 30 + Math.sin(this.time * 5) * 6);
      x.globalAlpha = 1;
    }
    if (u.inCloud) {
      x.fillStyle = 'rgba(40,40,45,0.25)';
      x.beginPath(); x.arc(c.x, c.y, 36, 0, Math.PI * 2); x.fill();
    }
    if (u.side === 0 && b.speedMult(b.sides[0], u) > 1.05 && u.kind !== 'farmer') {
      var yy = c.y + 22 - ((this.time * 40 + u.id * 7) % 30);
      x.strokeStyle = 'rgba(200,40,20,0.7)'; x.lineWidth = 3;
      x.beginPath(); x.moveTo(c.x - 30, yy + 6); x.lineTo(c.x - 25, yy); x.lineTo(c.x - 20, yy + 6); x.stroke();
    }
  };

  V.drawLevel = function (lvl, x, y) {
    this.drawGlyph(String(lvl), 22, LVL_NUM[lvl] || '#333', x, y, { font: 'sans', bold: true, stroke: '#fff', sw: 3 });
  };

  V.drawGeneral = function (u, cx, cy, pop) {
    var x = this.ctx, g = G.GEN[u.gen];
    var w = 70 * pop, h = 70 * pop;
    x.fillStyle = '#fff4d6';
    x.strokeStyle = '#b3261e'; x.lineWidth = 3;
    roundRect(x, cx - w / 2, cy - h / 2, w, h, 9); x.fill(); x.stroke();
    x.strokeStyle = 'rgba(179,38,30,0.35)'; x.lineWidth = 1.5;
    roundRect(x, cx - w / 2 + 5, cy - h / 2 + 5, w - 10, h - 10, 6); x.stroke();
    this.drawGlyph(g.parts[0], 32, '#7a3e00', cx - 15 * pop, cy - 6 * pop, { scale: pop });
    this.drawGlyph(g.parts[1], 32, '#7a3e00', cx + 15 * pop, cy - 6 * pop, { scale: pop });
    // 星级
    for (var i = 0; i < u.lvl; i++) {
      var sx = cx + (i - (u.lvl - 1) / 2) * 12, sy = cy + 22 * pop;
      drawStar(x, sx, sy, 6, '#e0a100');
    }
    // 兵器
    if (u.weapon) {
      var wc = G.RARITY_COLOR[u.weapon.rarity];
      x.fillStyle = wc;
      x.beginPath(); x.arc(cx - w / 2 + 4, cy - h / 2 + 4, 12, 0, Math.PI * 2); x.fill();
      this.drawGlyph(G.WTYPE[u.weapon.type], 16, '#fff', cx - w / 2 + 4, cy - h / 2 + 4);
    }
    // 技能冷却光
    if (u.skillT != null && ({ zhaoyun: 9, zhangfei: 10, xuchu: 12, kongming: 15, zhenfu: 8 })[u.gen]) {
      var cd = ({ zhaoyun: 9, zhangfei: 10, xuchu: 12, kongming: 15, zhenfu: 8 })[u.gen];
      x.strokeStyle = 'rgba(224,161,0,0.8)'; x.lineWidth = 3;
      x.beginPath(); x.arc(cx, cy, 40, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, u.skillT / cd)); x.stroke();
    }
  };

  function drawStar(x, cx, cy, r, color) {
    x.fillStyle = color;
    x.beginPath();
    for (var i = 0; i < 10; i++) {
      var a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r;
      x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    x.closePath(); x.fill();
  }
  G.drawStar = drawStar;

  V.drawEnemies = function () {
    var x = this.ctx, b = this.b;
    for (var s = 0; s < b.sides.length; s++) {
      var en = b.sides[s].enemies;
      for (var i = 0; i < en.length; i++) {
        var e = en[i];
        if (e.dead) continue;
        var P = this.posOf(e.x, e.y);
        var bob = Math.abs(Math.sin(b.t * 8 + e.id)) * -4;
        var born = Math.min(1, (b.t - e.born) / 0.3);
        x.globalAlpha = (e.invisT > 0 ? 0.3 : 1) * born;
        x.fillStyle = 'rgba(0,0,0,0.16)';
        x.beginPath(); x.ellipse(P.x, P.y + (e.boss ? 26 : 20), e.boss ? 34 : 18, e.boss ? 9 : 6, 0, 0, Math.PI * 2); x.fill();
        var color = e.hurtFx > 0 ? '#d63a2a' : (e.slowT > 0 ? '#2f5f8a' : (e.boss ? '#5a0e0a' : INK));
        if (e.charmT > 0) color = '#c0407a';
        if (e.boss) {
          var len = e.ch.length;
          var sz = len >= 3 ? 34 : 42;
          this.drawGlyph(e.ch, sz, color, P.x, P.y + bob - 2, { stroke: '#f3d27a', sw: 3 });
        } else {
          this.drawGlyph(e.ch, 44, color, P.x, P.y + bob, { stroke: 'rgba(255,255,255,0.8)', sw: 2 });
        }
        if (e.burnT > 0) {
          x.fillStyle = 'rgba(230,110,20,0.6)';
          x.beginPath(); x.moveTo(P.x - 10, P.y + 14); x.quadraticCurveTo(P.x, P.y - 10 - 6 * Math.sin(b.t * 20), P.x + 10, P.y + 14); x.fill();
        }
        if (e.poisonT > 0) { x.fillStyle = 'rgba(90,150,30,0.5)'; x.beginPath(); x.arc(P.x + 14, P.y - 8 - (b.t * 30 % 14), 4, 0, Math.PI * 2); x.fill(); }
        // 血条
        var bw = e.boss ? 110 : 52, bh = e.boss ? 10 : 6, by = P.y - (e.boss ? 46 : 34);
        x.fillStyle = 'rgba(30,20,15,0.75)';
        x.fillRect(P.x - bw / 2 - 1, by - 1, bw + 2, bh + 2);
        x.fillStyle = e.boss ? '#d6301f' : (s === 0 ? '#d6301f' : '#b04a3a');
        x.fillRect(P.x - bw / 2, by, bw * Math.max(0, e.hp / e.maxHp), bh);
        if (e.boss) {
          this.num(G.fmt(Math.max(0, e.hp)), 15, '#fff', P.x, by + 5, '#000', 2);
        }
        if (e.stunT > 0) {
          for (var k = 0; k < 3; k++) {
            var a = b.t * 6 + k * 2.1;
            drawStar(x, P.x + Math.cos(a) * 16, by - 8 + Math.sin(a) * 4, 5, '#e0a100');
          }
        }
        if (e.armorT > 0) {
          x.strokeStyle = '#6a6a7a'; x.lineWidth = 3;
          x.beginPath(); x.moveTo(P.x - 20, by - 4); x.lineTo(P.x - 12, by - 8); x.lineTo(P.x - 4, by - 4); x.lineTo(P.x - 6, by + 6); x.lineTo(P.x - 12, by + 10); x.lineTo(P.x - 18, by + 6); x.closePath(); x.stroke();
        }
        if (e.markT > 0) {
          x.fillStyle = 'rgba(240,220,120,0.85)';
          x.beginPath(); x.arc(P.x + 20, by - 6, 7, 0.4, Math.PI * 1.6 + 0.4); x.arc(P.x + 23, by - 8, 6, Math.PI * 1.6 + 0.4, 0.4, true); x.fill();
        }
        x.globalAlpha = 1;
      }
    }
  };

  V.drawLinks = function () {
    var x = this.ctx, b = this.b;
    for (var s = 0; s < b.sides.length; s++) {
      var side = b.sides[s];
      if (!(side.linkT > 0)) continue;
      var en = side.enemies.filter(function (e) { return !e.dead; });
      x.strokeStyle = 'rgba(90,90,110,0.55)'; x.lineWidth = 3; x.setLineDash([6, 5]);
      x.beginPath();
      for (var i = 1; i < en.length; i++) {
        var a = this.posOf(en[i - 1].x, en[i - 1].y), c = this.posOf(en[i].x, en[i].y);
        x.moveTo(a.x, a.y); x.lineTo(c.x, c.y);
      }
      x.stroke(); x.setLineDash([]);
    }
  };

  V.drawProjectiles = function () {
    this.drawLinks();
    var x = this.ctx, b = this.b;
    for (var i = 0; i < b.projs.length; i++) {
      var p = b.projs[i];
      if (p.delay > 0) continue;
      var P = this.posOf(p.x, p.y), a = p.ang || 0;
      x.save(); x.translate(P.x, P.y); x.rotate(a);
      if (p.kind === 'arrow' || p.kind === 'fire') {
        x.strokeStyle = p.kind === 'fire' ? '#e0661a' : '#2b2622'; x.lineWidth = 2.5;
        x.beginPath(); x.moveTo(-22, 0); x.lineTo(6, 0); x.stroke();
        x.fillStyle = x.strokeStyle;
        x.beginPath(); x.moveTo(10, 0); x.lineTo(2, -4); x.lineTo(2, 4); x.fill();
        x.strokeStyle = p.kind === 'fire' ? '#f5b041' : '#8a7a6a'; x.lineWidth = 2;
        x.beginPath(); x.moveTo(-22, 0); x.lineTo(-28, -5); x.moveTo(-22, 0); x.lineTo(-28, 5); x.stroke();
        if (p.kind === 'fire') { x.fillStyle = 'rgba(240,120,30,0.5)'; x.beginPath(); x.arc(8, 0, 6, 0, Math.PI * 2); x.fill(); }
      } else if (p.kind === 'petal') {
        x.fillStyle = '#f2a7c4'; x.rotate(b.t * 12);
        for (var k = 0; k < 5; k++) { x.rotate(Math.PI * 2 / 5); x.beginPath(); x.ellipse(5, 0, 6, 3, 0, 0, Math.PI * 2); x.fill(); }
      } else if (p.kind === 'qi') {
        x.strokeStyle = '#2f74c0'; x.lineWidth = 4;
        x.beginPath(); x.arc(-6, 0, 14, -1.2, 1.2); x.stroke();
      }
      x.restore();
    }
  };

  V.drawSweeps = function () {
    var x = this.ctx, b = this.b;
    for (var i = 0; i < b.sweeps.length; i++) {
      var s = b.sweeps[i], P = this.posOf(s.x, s.y);
      var col = { zhaoyun: '#2f74c0', water: '#3d8fb8', eagle: '#5a4a3a', qi: '#1f7a4a', holy: '#c98a00', dugu: '#6b6b8a' }[s.kind] || '#333';
      // 拖尾
      var L = b.lanes[s.side];
      x.strokeStyle = col; x.lineCap = 'round';
      for (var k = 1; k <= 5; k++) {
        var q = L.pos(Math.min(L.len, s.dist + k * 0.25));
        var Q = this.posOf(q.x, q.y);
        x.globalAlpha = 0.35 * (1 - k / 6); x.lineWidth = 14 - k * 2;
        x.beginPath(); x.moveTo(P.x, P.y); x.lineTo(Q.x, Q.y); x.stroke();
      }
      x.globalAlpha = 1;
      if (s.kind === 'water') {
        x.fillStyle = 'rgba(61,143,184,0.45)';
        x.beginPath(); x.ellipse(P.x, P.y, 46, 30, 0, 0, Math.PI * 2); x.fill();
      }
      this.drawGlyph(s.ch, s.kind === 'zhaoyun' ? 50 : 40, col, P.x, P.y, { stroke: '#fff', sw: 3 });
    }
  };

  V.drawParts = function () {
    var x = this.ctx;
    for (var i = 0; i < this.parts.length; i++) {
      var p = this.parts[i], k = p.t / p.max;
      switch (p.type) {
        case 'text':
          var sc = p.pop ? (k < 0.2 ? 0.5 + 2.5 * k : 1) : 1;
          x.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
          this.drawGlyph(p.txt, p.size, p.color, p.x, p.y, { stroke: p.stroke, sw: 4, scale: sc });
          x.globalAlpha = 1;
          break;
        case 'dmg':
          x.globalAlpha = k > 0.6 ? (1 - k) / 0.4 : 1;
          this.num(G.fmt(p.n), p.crit ? 24 : 17, p.crit ? '#ffb347' : (p.side === 0 ? '#fff' : '#ddd'), p.x, p.y, p.crit ? '#5a1a00' : '#3a1a10', 2.5);
          x.globalAlpha = 1;
          break;
        case 'spark':
          x.globalAlpha = 1 - k; x.fillStyle = p.color;
          x.beginPath(); x.arc(p.x, p.y, 4 * (1 - k) + 1, 0, Math.PI * 2); x.fill(); x.globalAlpha = 1;
          break;
        case 'ring':
          x.globalAlpha = 1 - k; x.strokeStyle = p.color; x.lineWidth = p.w * (1 - k) + 1;
          x.beginPath(); x.arc(p.x, p.y, p.r * G.easeOutCubic(k), 0, Math.PI * 2); x.stroke(); x.globalAlpha = 1;
          break;
        case 'puff':
          x.globalAlpha = 0.5 * (1 - k); x.fillStyle = '#b8a890';
          x.beginPath(); x.arc(p.x, p.y, p.r * (1 + k), 0, Math.PI * 2); x.fill(); x.globalAlpha = 1;
          break;
        case 'ink':
          x.globalAlpha = 0.75 * (1 - k * k); x.fillStyle = p.color;
          for (var j = 0; j < p.dots.length; j++) {
            var d = p.dots[j];
            x.beginPath(); x.arc(p.x + Math.cos(d.a) * d.d * (0.6 + k), p.y + Math.sin(d.a) * d.d * (0.6 + k), d.r * (1 - k * 0.5), 0, Math.PI * 2); x.fill();
          }
          x.globalAlpha = 1;
          break;
        case 'fall':
          x.globalAlpha = 1 - k;
          x.save(); x.translate(p.x, p.y + k * 10); x.rotate(k * 1.2);
          this.drawGlyph(p.ch, p.boss ? 40 : 44, '#555', 0, 0);
          x.restore(); x.globalAlpha = 1;
          break;
        case 'slash':
          var ang = Math.atan2(p.y - p.fy, p.x - p.fx);
          x.globalAlpha = 1 - k;
          x.strokeStyle = p.big ? '#1f4a6a' : INK; x.lineWidth = (p.big ? 7 : p.small ? 3 : 5) * (1 - k * 0.5); x.lineCap = 'round';
          x.beginPath(); x.arc(p.x - Math.cos(ang) * 18, p.y - Math.sin(ang) * 18, p.big ? 34 : 26, ang - 1.1 + k * 0.6, ang + 1.1 + k * 0.6); x.stroke();
          x.globalAlpha = 1;
          break;
        case 'thrust':
          x.globalAlpha = 1 - k;
          var dx = p.tx - p.x, dy = p.ty - p.y, dl = Math.sqrt(dx * dx + dy * dy) || 1;
          var ext = 26;
          x.strokeStyle = p.gen ? '#2f74c0' : '#4a4038'; x.lineWidth = p.gen ? 5 : 3.5;
          x.beginPath(); x.moveTo(p.x + dx / dl * 20, p.y + dy / dl * 20); x.lineTo(p.tx + dx / dl * ext, p.ty + dy / dl * ext); x.stroke();
          x.fillStyle = x.strokeStyle;
          var hx = p.tx + dx / dl * ext, hy = p.ty + dy / dl * ext;
          x.beginPath(); x.moveTo(hx + dx / dl * 12, hy + dy / dl * 12); x.lineTo(hx - dy / dl * 6, hy + dx / dl * 6); x.lineTo(hx + dy / dl * 6, hy - dx / dl * 6); x.fill();
          x.globalAlpha = 1;
          break;
        case 'sword':
          x.globalAlpha = 1 - k; x.strokeStyle = p.gen ? '#6b2fa3' : INK; x.lineWidth = 4;
          x.beginPath(); x.moveTo(p.x - 24 + k * 10, p.y - 24); x.lineTo(p.x + 24 + k * 10, p.y + 24); x.stroke();
          x.globalAlpha = 1;
          break;
        case 'crescent':
          x.globalAlpha = 1 - k; x.strokeStyle = p.color; x.lineWidth = 12 * (1 - k) + 2;
          x.beginPath(); x.arc(p.x, p.y, p.r * (0.4 + 0.6 * k), -2.6 + k * 2, -0.4 + k * 2); x.stroke(); x.globalAlpha = 1;
          break;
        case 'pike':
          x.fillStyle = '#4a4038';
          var hgt = 36 * Math.sin(Math.min(1, k * 2.2) * Math.PI / 2) * (k > 0.7 ? (1 - k) / 0.3 : 1);
          for (var q = -1; q <= 1; q++) {
            x.beginPath(); x.moveTo(p.x + q * 12 - 4, p.y + 14); x.lineTo(p.x + q * 12, p.y + 14 - hgt - (q === 0 ? 10 : 0)); x.lineTo(p.x + q * 12 + 4, p.y + 14); x.fill();
          }
          break;
        case 'boom':
          x.globalAlpha = 1 - k; x.fillStyle = p.color;
          x.beginPath(); x.arc(p.x, p.y, p.r * G.easeOutCubic(k), 0, Math.PI * 2); x.fill();
          x.strokeStyle = '#2b2622'; x.lineWidth = 3; x.stroke(); x.globalAlpha = 1;
          break;
        case 'falling':
          var fy = p.y - 260 * (1 - k);
          x.fillStyle = '#6a5a4a';
          for (var fr = 0; fr < 4; fr++) { x.beginPath(); x.arc(p.x + (fr - 1.5) * 22, fy - (fr % 2) * 30, 14 - fr, 0, Math.PI * 2); x.fill(); }
          break;
        case 'bolt':
          x.globalAlpha = 1 - k; x.strokeStyle = '#fff6b0'; x.lineWidth = 6; x.lineJoin = 'miter';
          x.beginPath();
          var bx = p.x + 30, byy = this.MAP_Y - 20;
          x.moveTo(bx, byy);
          for (var seg = 1; seg <= 7; seg++) { bx = p.x + (seg < 7 ? (((p.seed * 997 + seg * 37) % 60) - 30) : 0); byy = this.MAP_Y - 20 + (p.y - this.MAP_Y + 20) * seg / 7; x.lineTo(bx, byy); }
          x.stroke();
          x.strokeStyle = '#e0a100'; x.lineWidth = 2; x.stroke();
          x.globalAlpha = 1;
          break;
        case 'stars':
          for (var st = 0; st < 3; st++) { var aa = this.time * 6 + st * 2.1; drawStar(x, p.x + Math.cos(aa) * 14, p.y + Math.sin(aa) * 4, 5, '#e0a100'); }
          break;
        case 'moon':
          x.globalAlpha = 1 - k; x.strokeStyle = '#e6c84a'; x.lineWidth = 8;
          x.beginPath(); x.arc(p.x, p.y, 30, -0.5 + k * 3, 2 + k * 3); x.stroke(); x.globalAlpha = 1;
          break;
        case 'bun':
          x.globalAlpha = 1 - k; drawBun(x, p.x, p.y - k * 30, 12); x.globalAlpha = 1;
          break;
        case 'flash':
          x.fillStyle = p.color; x.globalAlpha = 1 - k;
          x.fillRect(0, this.MAP_Y + (p.side === 0 ? 400 : 0), DW, 400); x.globalAlpha = 1;
          break;
        case 'wind':
          x.globalAlpha = 0.6 * (1 - k); x.strokeStyle = '#7fb0d8'; x.lineWidth = 3;
          for (var w = 0; w < 5; w++) {
            var yy = this.MAP_Y + (p.side === 0 ? 420 : 20) + w * 75, xx = ((this.time * 400 + w * 130) % 760) - 60;
            x.beginPath(); x.moveTo(xx, yy); x.quadraticCurveTo(xx + 40, yy - 18, xx + 90, yy); x.stroke();
          }
          x.globalAlpha = 1;
          break;
      }
    }
  };

  function drawBun(x, cx, cy, r) {
    var g = x.createRadialGradient(cx - r * 0.3, cy - r * 0.4, r * 0.1, cx, cy, r * 1.2);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.7, '#f1ead8'); g.addColorStop(1, '#cfc2a2');
    x.fillStyle = g;
    x.beginPath(); x.ellipse(cx, cy, r * 1.15, r * 0.85, 0, 0, Math.PI * 2); x.fill();
    x.strokeStyle = 'rgba(120,100,70,0.6)'; x.lineWidth = Math.max(1, r * 0.12);
    x.beginPath(); x.arc(cx, cy - r * 0.15, r * 0.35, Math.PI * 1.1, Math.PI * 1.9); x.stroke();
  }
  G.drawBun = drawBun;

  // ───────────────────────── HUD ─────────────────────────
  V.drawHUD = function () {
    var x = this.ctx, b = this.b, side = b.sides[0], T = this.top;
    // 暂停
    var R = this.R.pause;
    x.fillStyle = 'rgba(60,55,50,0.85)';
    x.beginPath(); x.arc(R.x + 35, R.y + 35, 32, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#f4ecdc'; x.fillRect(R.x + 23, R.y + 20, 8, 30); x.fillRect(R.x + 39, R.y + 20, 8, 30);
    // 馒头
    var by = T + 100;
    x.fillStyle = '#2b2622';
    x.beginPath(); x.moveTo(40, by); x.quadraticCurveTo(140, by - 12, 230, by + 4); x.quadraticCurveTo(240, by + 20, 230, by + 36); x.quadraticCurveTo(140, by + 46, 40, by + 38); x.closePath(); x.fill();
    drawBun(x, 52, by + 18, 22);
    this.num(String(Math.floor(side.buns)), 28, '#f3d27a', 132, by + 19);
    // 帮助
    var Hp = this.R.help;
    x.fillStyle = 'rgba(60,55,50,0.8)';
    x.beginPath(); x.arc(Hp.x + Hp.w / 2, Hp.y + Hp.h / 2, 24, 0, Math.PI * 2); x.fill();
    this.drawGlyph('?', 28, '#fff', Hp.x + Hp.w / 2, Hp.y + Hp.h / 2, { font: 'sans', bold: true });
    // 地图名与波次
    this.drawGlyph(b.map.name, 44, '#3a2a20', 320, T + 46, { stroke: '#f4ecdc', sw: 3 });
    var wtxt = (b.mode === 'endless' ? '无尽 · ' : '') + '第' + G.cnNum(Math.max(1, b.wave)) + '波' + (b.targetWaves ? ' / ' + G.cnNum(b.targetWaves) : '');
    this.drawGlyph(wtxt, 32, '#fff', 320, T + 96, { stroke: '#2b2622', sw: 5 });
    // 天气
    var wd = G.WEATHER[b.weather];
    if (wd && wd.id !== 'clear') {
      var wx = 320 + this.glyph(b.map.name, 44, '#3a2a20', { stroke: '#f4ecdc', sw: 3 }).w / 2 + 20;
      x.fillStyle = { fog: '#8a8f96', wind: '#4f8fb0', rain: '#3d6a9a', night: '#2a3460', heat: '#c8662a' }[wd.id] || '#666';
      x.beginPath(); x.arc(wx, T + 46, 20, 0, Math.PI * 2); x.fill();
      this.drawGlyph(wd.ch, 24, '#fff', wx, T + 46);
    }
    if (b.state === 'run') {
      var left = Math.max(0, b.waveDur - b.waveT);
      x.fillStyle = 'rgba(43,38,34,0.25)'; x.fillRect(260, T + 126, 120, 5);
      x.fillStyle = '#b3261e'; x.fillRect(260, T + 126, 120 * (1 - left / b.waveDur), 5);
    }
    // 对手
    if (!b.solo && b.sides[1]) {
      var o = b.sides[1];
      x.fillStyle = 'rgba(40,60,110,0.85)';
      roundRect(x, 436, T + 92, 190, 44, 10); x.fill();
      this.drawGlyph(this.o.oppName || '对手', 20, '#fff', 520, T + 104, { font: 'sans', bold: true });
      for (var i = 0; i < o.maxHearts; i++) drawHeart(x, 470 + i * 22, T + 124, 7, i < o.hearts ? '#ff6b6b' : 'rgba(255,255,255,0.3)');
      this.num('×' + o.kills, 15, '#cfe0ff', 590, T + 124);
    }
    // 倍速
    var S = this.R.speed;
    x.fillStyle = this.speed > 1 ? '#b3261e' : 'rgba(60,55,50,0.85)';
    roundRect(x, S.x, S.y, S.w, S.h, 12); x.fill();
    this.drawGlyph('×' + this.speed, 26, '#fff', S.x + S.w / 2, S.y + S.h / 2, { font: 'sans', bold: true });
    // 开场倒计时
    if (b.state === 'intro' && !this.tutStep()) {
      var n = Math.ceil(b.introT);
      var fr = b.introT - Math.floor(b.introT);
      if (n !== this.lastCount) { this.lastCount = n; G.Audio.play('countdown'); }
      this.drawGlyph(String(n), 120, '#b3261e', 320, this.MAP_Y + 400, { stroke: '#fff', sw: 6, scale: 0.8 + fr * 0.4 });
      this.drawGlyph('布阵准备', 34, '#3a2a20', 320, this.MAP_Y + 490, { stroke: '#fff', sw: 4 });
    }
  };

  V.itemGlyph = function (it, cx, cy, size, alpha) {
    var x = this.ctx;
    x.globalAlpha = alpha == null ? 1 : alpha;
    if (it.kind === 'soldier') {
      this.drawGlyph(G.SOLDIERS[it.key].ch, size, LVL_COLOR[it.lvl] || INK, cx, cy, { stroke: '#fff', sw: 2 });
      if (it.lvl > 1) this.drawLevel(it.lvl, cx + size * 0.42, cy - size * 0.42);
    } else if (it.kind === 'farmer') {
      this.drawGlyph('农', size, '#7a4a1a', cx, cy, { stroke: '#fff', sw: 2 });
    } else if (it.kind === 'part') {
      this.drawGlyph(G.GEN[it.gen].parts[it.part], size, '#c8781a', cx, cy, { stroke: '#fff7e0', sw: 3 });
    } else if (it.kind === 'general') {
      var g = G.GEN[it.gen];
      this.drawGlyph(g.name, size * 0.55, '#7a3e00', cx, cy, { stroke: '#fff4d6', sw: 3 });
    } else if (it.kind === 'prop') {
      x.fillStyle = '#b3261e';
      x.beginPath(); x.arc(cx, cy - 4, size * 0.48, 0, Math.PI * 2); x.fill();
      this.drawGlyph(G.PROPS[it.key].ch, size * 0.62, '#fff', cx, cy - 4);
      this.drawGlyph(G.PROPS[it.key].name, 15, '#5a2a20', cx, cy + size * 0.55, { font: 'sans', bold: true });
    }
    x.globalAlpha = 1;
  };

  V.drawBottom = function () {
    var x = this.ctx, b = this.b, side = b.sides[0];
    // 营
    var Y = this.R.ying;
    var dragBoard = this.drag && this.drag.active && (this.drag.from.cell || this.drag.from.camp != null);
    var overY = dragBoard && this.drag.overYing;
    x.save(); x.translate(Y.x + Y.w / 2, Y.y + Y.h / 2 + 6);
    if (overY) x.scale(1.12, 1.12);
    x.fillStyle = '#4a3a30';
    x.fillRect(-28, -14, 56, 46);
    x.fillStyle = '#9e3a22';
    x.beginPath(); x.moveTo(-42, -10); x.quadraticCurveTo(0, -46, 42, -10); x.lineTo(34, -6); x.quadraticCurveTo(0, -34, -34, -6); x.closePath(); x.fill();
    x.restore();
    this.drawGlyph('营', 34, '#fff', Y.x + Y.w / 2, Y.y + Y.h / 2 + 18);
    if (dragBoard) {
      var lbl = this.drag.from.cell ? ('遣散+' + (this.drag.refund || 0)) : '丢弃';
      this.drawGlyph(lbl, 18, overY ? '#b3261e' : '#7a6a5a', Y.x + Y.w / 2, Y.y - 12, { font: 'sans', bold: true, stroke: '#fff', sw: 3 });
    }
    // 营地槽
    for (var i = 0; i < 5; i++) {
      var r = this.R.camp[i];
      var it = side.camp[i];
      var selc = this.sel && this.sel.from.camp === i;
      x.fillStyle = selc ? '#fff3c4' : '#f7f1e3';
      x.strokeStyle = selc ? '#e0a100' : '#a89a86'; x.lineWidth = selc ? 4 : 2;
      roundRect(x, r.x, r.y, r.w, r.h, 8); x.fill(); x.stroke();
      if (it) {
        var dragging = this.drag && this.drag.active && this.drag.from.camp === i;
        this.itemGlyph(it, r.x + r.w / 2, r.y + r.h / 2, 54, dragging ? 0.25 : 1);
        // 能直接合成的提示
        if (!dragging && this.campCanMerge(it)) {
          x.strokeStyle = 'rgba(224,161,0,' + (0.5 + 0.5 * Math.sin(this.time * 6)) + ')'; x.lineWidth = 3;
          roundRect(x, r.x + 3, r.y + 3, r.w - 6, r.h - 6, 6); x.stroke();
        }
      }
    }
    // 征兵按钮
    var B = this.R.recruit;
    var cost = b.recruitCost(side);
    var can = side.buns >= cost && b.state !== 'over';
    var press = this.pressBtn === 'recruit' ? 4 : 0;
    x.fillStyle = can ? '#8a2e1c' : '#6a625a';
    roundRect(x, B.x, B.y + 8, B.w, B.h - 4, 16); x.fill();
    x.fillStyle = can ? '#d4663f' : '#9a9088';
    roundRect(x, B.x, B.y + press, B.w, B.h - 10, 16); x.fill();
    x.strokeStyle = can ? '#5a1a10' : '#4a4038'; x.lineWidth = 3;
    roundRect(x, B.x, B.y + press, B.w, B.h - 10, 16); x.stroke();
    this.drawGlyph('征兵', 44, '#fff', B.x + B.w / 2, B.y + 32 + press, { stroke: '#5a1a10', sw: 4 });
    if (cost === 0) this.drawGlyph('免费', 24, '#ffe58a', B.x + B.w / 2, B.y + 70 + press, { font: 'sans', bold: true, stroke: '#5a1a10', sw: 3 });
    else {
      drawBun(x, B.x + B.w / 2 - 22, B.y + 70 + press, 11);
      this.num(String(cost), 23, side.buns >= cost ? '#fff' : '#ffb0a0', B.x + B.w / 2 + 14, B.y + 70 + press, '#5a1a10', 3);
    }
    // 军需栏（叠放）
    var rb = this.R.bar[0], itb = side.bar[0];
    x.fillStyle = itb ? '#f7f1e3' : 'rgba(247,241,227,0.45)'; x.strokeStyle = itb ? '#b3261e' : 'rgba(168,154,134,0.6)'; x.lineWidth = 2;
    x.setLineDash(itb ? [] : [6, 5]);
    roundRect(x, rb.x, rb.y, rb.w, rb.h, 8); x.fill(); x.stroke(); x.setLineDash([]);
    if (itb) {
      this.itemGlyph(itb, rb.x + rb.w / 2, rb.y + rb.h / 2 - 4, 46, this.drag && this.drag.active && this.drag.from.bar === 0 ? 0.25 : 1);
      var same = side.bar.filter(function (z) { return z.key === itb.key; }).length;
      if (side.bar.length > 1) {
        x.fillStyle = '#2b2622'; x.beginPath(); x.arc(rb.x + rb.w - 12, rb.y + 12, 14, 0, Math.PI * 2); x.fill();
        this.num('×' + side.bar.length, 15, '#fff', rb.x + rb.w - 12, rb.y + 12);
      }
      void same;
    } else this.drawGlyph('军需', 22, 'rgba(120,100,80,0.55)', rb.x + rb.w / 2, rb.y + rb.h / 2);
    // 军令（可反复使用）
    for (i = 0; i < 2; i++) {
      var rs = this.R.skills[i], sk = side.skills[i];
      if (!sk) continue;
      var sd = G.SKILL[sk.id];
      var scx = rs.x + rs.w / 2, scy = rs.y + 40, rr = 34;
      var aiming = this.aim && this.aim.i === i;
      x.save();
      if (aiming) { x.shadowColor = '#ffcf3f'; x.shadowBlur = 20; }
      x.fillStyle = '#2f4f8f';
      x.beginPath(); x.arc(scx, scy, rr, 0, Math.PI * 2); x.fill();
      x.restore();
      x.strokeStyle = aiming ? '#ffcf3f' : '#e0a100'; x.lineWidth = aiming ? 5 : 3;
      x.beginPath(); x.arc(scx, scy, rr, 0, Math.PI * 2); x.stroke();
      this.drawGlyph(sd.ch, 34, '#fff4d6', scx, scy);
      if (sk.cd > 0) {
        var frac = Math.min(1, sk.cd / sd.cd);
        x.fillStyle = 'rgba(20,15,10,0.62)';
        x.beginPath(); x.moveTo(scx, scy); x.arc(scx, scy, rr, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac); x.closePath(); x.fill();
        this.num(String(Math.ceil(sk.cd)), 24, '#fff', scx, scy, '#000', 3);
      }
      this.drawGlyph(sd.name, 15, '#fff', scx, rs.y + rs.h + 2, { font: 'sans', bold: true, stroke: '#1d2a50', sw: 3 });
    }
    // 锦囊
    for (i = 0; i < 2; i++) {
      var rc = this.R.cards[i], cd = side.cards[i];
      if (!cd) continue;
      var def = G.CARD[cd.id];
      var armed = this.cardArm === i && this.time - this.cardArmT < 3 && !cd.used;
      var cx2 = rc.x + rc.w / 2;
      x.save();
      if (armed) { x.shadowColor = '#ffcf3f'; x.shadowBlur = 18; }
      // 锦囊袋
      x.fillStyle = cd.used ? '#8a827a' : '#b3261e';
      x.beginPath();
      x.moveTo(rc.x + 10, rc.y + 24); x.quadraticCurveTo(rc.x + 2, rc.y + rc.h - 4, cx2, rc.y + rc.h);
      x.quadraticCurveTo(rc.x + rc.w - 2, rc.y + rc.h - 4, rc.x + rc.w - 10, rc.y + 24); x.closePath(); x.fill();
      x.fillStyle = cd.used ? '#a8a098' : '#d4663f';
      x.beginPath(); x.moveTo(rc.x + 14, rc.y + 24); x.lineTo(cx2 - 8, rc.y + 6); x.lineTo(cx2 + 8, rc.y + 6); x.lineTo(rc.x + rc.w - 14, rc.y + 24); x.closePath(); x.fill();
      x.restore();
      x.fillStyle = cd.used ? '#c8c0b8' : '#e0a100';
      x.fillRect(cx2 - 18, rc.y + 22, 36, 6);
      this.drawGlyph(def.ch, 36, cd.used ? '#d8d0c8' : '#fff4d6', cx2, rc.y + 54);
      this.drawGlyph(cd.used ? '已用' : (armed ? '再点' : def.name), 15, '#fff', cx2, rc.y + rc.h + 12, { font: 'sans', bold: true, stroke: '#3a2a20', sw: 3 });
    }
  };

  V.campCanMerge = function (it) {
    if (!it || it.kind === 'prop') return false;
    var us = this.b.sides[0].units;
    for (var i = 0; i < us.length; i++) if (this.b.combineKind(it, us[i])) return true;
    return false;
  };

  // 拖动时的高亮
  V.drawHighlights = function () {
    var x = this.ctx, b = this.b;
    var d = (this.drag && this.drag.active) ? this.drag : this.sel;
    if (!d) return;
    var side = b.sides[0];
    for (var gy = 0; gy < 10; gy++) for (var gx = 0; gx < 8; gx++) {
      var plan = b.resolve(side, d.from, { cell: [gx, gy] });
      if (!plan) continue;
      var c = this.cellCenter(gx, gy);
      var hov = this.drag && this.drag.cell && this.drag.cell[0] === gx && this.drag.cell[1] === gy;
      var col = (plan.kind === 'merge' || plan.kind === 'form' || plan.kind === 'genup' || plan.kind === 'genmerge') ? '224,161,0' : (plan.kind === 'prop' ? '179,38,30' : '60,140,80');
      var a = hov ? 0.55 : 0.18 + 0.1 * Math.sin(this.time * 6);
      x.fillStyle = 'rgba(' + col + ',' + a + ')';
      x.fillRect(c.x - 38, c.y - 38, 76, 76);
      if (plan.kind !== 'move' && plan.kind !== 'place' && plan.kind !== 'swap') {
        x.strokeStyle = 'rgba(' + col + ',0.9)'; x.lineWidth = 3;
        x.strokeRect(c.x - 37, c.y - 37, 74, 74);
      }
    }
  };

  V.drawRangeRing = function () {
    var x = this.ctx, b = this.b, d = (this.drag && this.drag.active) ? this.drag : this.sel;
    if (!d) return;
    var src = b.getSource(b.sides[0], d.from);
    if (!src) return;
    var it = src.item, range = 0;
    if (it.kind === 'soldier') range = G.SOLDIERS[it.key].range;
    else if (it.kind === 'part') range = G.GEN_BASE[G.GEN[it.gen].type].range;
    else if (it.kind === 'general') range = b.unitStats(it).range;
    if (!range) return;
    var c;
    if (this.drag && this.drag.active && this.drag.cell) c = this.cellCenter(this.drag.cell[0], this.drag.cell[1]);
    else if (src.unit) c = this.cellCenter(src.unit.x, src.unit.y);
    if (!c) return;
    x.strokeStyle = 'rgba(179,38,30,0.7)'; x.lineWidth = 3; x.setLineDash([10, 8]);
    x.beginPath(); x.arc(c.x, c.y, range * CELL, 0, Math.PI * 2); x.stroke(); x.setLineDash([]);
    x.fillStyle = 'rgba(179,38,30,0.06)'; x.fill();
  };

  V.drawDrag = function () {
    var d = this.drag;
    if (!d || !d.active) return;
    var src = this.b.getSource(this.b.sides[0], d.from);
    if (!src) return;
    var x = this.ctx;
    x.save();
    x.globalAlpha = 0.92;
    x.fillStyle = 'rgba(255,250,240,0.85)';
    x.beginPath(); x.arc(d.gx, d.gy, 40, 0, Math.PI * 2); x.fill();
    x.strokeStyle = '#b3261e'; x.lineWidth = 2; x.stroke();
    if (src.unit && src.unit.kind === 'general') this.drawGeneral(src.unit, d.gx, d.gy, 0.9);
    else this.itemGlyph(src.item, d.gx, d.gy, 58);
    x.restore();
    if (d.plan) {
      var label = { place: '', move: '', swap: '互换', merge: '合成', form: '武将登场', genup: '武将升级', genmerge: '武将合体', prop: '使用' }[d.plan.kind];
      if (label) this.drawGlyph(label, 24, '#b3261e', d.gx, d.gy - 58, { font: 'sans', bold: true, stroke: '#fff', sw: 4 });
    }
  };

  V.drawBanners = function () {
    var x = this.ctx;
    for (var i = 0; i < this.banners.length; i++) {
      var bn = this.banners[i], k = bn.t / bn.max;
      var a = k < 0.15 ? k / 0.15 : (k > 0.8 ? (1 - k) / 0.2 : 1);
      var cy = this.MAP_Y + (bn.side === 1 ? 200 : 400);
      x.globalAlpha = a;
      x.fillStyle = bn.boss ? 'rgba(90,10,8,0.85)' : (bn.event ? 'rgba(110,74,16,0.85)' : (bn.side === 1 ? 'rgba(30,45,90,0.8)' : 'rgba(30,25,20,0.78)'));
      var w = 640 * Math.min(1, k / 0.15);
      x.beginPath();
      x.moveTo(320 - w / 2, cy - 54); x.quadraticCurveTo(320, cy - 66, 320 + w / 2, cy - 50);
      x.lineTo(320 + w / 2 - 10, cy + (bn.sub ? 70 : 46)); x.quadraticCurveTo(320, cy + (bn.sub ? 82 : 58), 320 - w / 2 + 6, cy + (bn.sub ? 66 : 44));
      x.closePath(); x.fill();
      this.drawGlyph(bn.txt, bn.boss ? 64 : 58, bn.boss ? '#ffd27a' : '#fff', 320, cy - 4);
      if (bn.sub) this.drawGlyph(bn.sub.length > 26 ? bn.sub.slice(0, 26) + '…' : bn.sub, 20, '#f3e3c8', 320, cy + 44, { font: 'sans' });
      x.globalAlpha = 1;
    }
  };

  // 新手提示
  // ───────────────────────── 新手教学（分步，未完成前贼兵不出发） ─────────────────────────
  V.tutCell = function (kind) {
    var b = this.b, side = b.sides[0], lane = b.lanes[0];
    var cells = b.emptyCells(side);
    if (!cells.length) return null;
    var dist = function (c) {
      var best = 9;
      for (var i = 0; i < lane.cells.length; i++) { var lc = lane.cells[i]; best = Math.min(best, Math.abs(lc[0] - c.x) + Math.abs(lc[1] - c.y)); }
      return best;
    };
    cells.sort(function (a, c) { return kind === 'back' ? dist(c) - dist(a) : dist(a) - dist(c); });
    return [cells[0].x, cells[0].y];
  };

  V.tutStep = function () {
    if (!this.o.tutorial || this.tutReady) return null;
    var b = this.b, side = b.sides[0], camp = side.camp, units = side.units;
    var ci = function (pred) { for (var i = 0; i < 5; i++) if (camp[i] && pred(camp[i])) return i; return -1; };
    if (side.recruits === 0 && !units.length && camp.every(function (c) { return !c; })) return { k: 'btn', rect: this.R.recruit, text: '第一步：点「征兵」，招来五个兵' };
    var dao = units.filter(function (u) { return u.kind === 'soldier' && u.key === 'dao'; });
    var iDao = ci(function (c) { return c.kind === 'soldier' && c.key === 'dao'; });
    if (!dao.length && iDao >= 0) return { k: 'drag', from: iDao, to: this.tutCell('front'), text: '把「刀」拖到挨着路的白色营地上' };
    if (iDao >= 0 && dao.length && !units.some(function (u) { return u.key === 'dao' && u.lvl >= 2; })) return { k: 'drag', from: iDao, to: [dao[0].x, dao[0].y], text: '两个相同的字叠在一起：合成 2 级刀兵' };
    var iGong = ci(function (c) { return c.kind === 'soldier' && c.key === 'gong'; });
    if (iGong >= 0) return { k: 'drag', from: iGong, to: this.tutCell('back'), text: '「弓」射得远，放在后排也打得到' };
    var iPart = ci(function (c) { return c.kind === 'part'; });
    var parts = units.filter(function (u) { return u.kind === 'part'; });
    if (iPart >= 0 && !units.some(function (u) { return u.kind === 'general'; })) {
      if (!parts.length) return { k: 'drag', from: iPart, to: this.tutCell('front'), text: '这是武将名字里的字，先放上营地' };
      return { k: 'drag', from: iPart, to: [parts[0].x, parts[0].y], text: '把「赵」「云」拼在一起，召唤常山赵子龙！' };
    }
    return { k: 'go', text: '布阵完毕！点一下开战，别让贼兵碰到阿斗' };
  };
  V.tutFrozen = function () { return !!this.tutStep(); };

  V.drawHints = function () {
    var b = this.b, x = this.ctx;
    if (b.state === 'over') return;
    var st = this.tutStep();
    if (st) {
      // 聚光：压暗其余部分
      var holes = [];
      if (st.k === 'btn') holes.push(st.rect);
      if (st.k === 'drag') {
        holes.push(this.R.camp[st.from]);
        if (st.to) { var tc = this.cellCenter(st.to[0], st.to[1]); holes.push({ x: tc.x - 42, y: tc.y - 42, w: 84, h: 84 }); }
      }
      x.save();
      x.beginPath();
      x.rect(-this.ox / this.s, 0, DW + 2 * this.ox / this.s, this.DH);
      holes.forEach(function (r) { x.rect(r.x + r.w, r.y, -r.w, r.h); });
      x.fillStyle = 'rgba(15,10,5,' + (st.k === 'go' ? 0.35 : 0.5) + ')';
      x.fill('evenodd');
      holes.forEach(function (r) {
        x.strokeStyle = 'rgba(255,207,63,' + (0.6 + 0.4 * Math.sin(this.time * 6)) + ')'; x.lineWidth = 4;
        roundRect(x, r.x - 3, r.y - 3, r.w + 6, r.h + 6, 10); x.stroke();
      }, this);
      x.restore();
      var ty = this.MAP_Y + 330;
      x.fillStyle = 'rgba(40,25,10,0.88)';
      roundRect(x, 28, ty - 32, 584, 64, 14); x.fill();
      this.drawGlyph(st.text, 28, '#ffcf3f', 320, ty, { font: 'sans', bold: true });
      if (st.k === 'btn') drawHand(x, st.rect.x + st.rect.w + 18, st.rect.y + 56 + Math.sin(this.time * 6) * 8);
      if (st.k === 'drag' && st.to) {
        var from = this.R.camp[st.from], to = this.cellCenter(st.to[0], st.to[1]);
        var k = (this.time % 1.6) / 1.6;
        drawHand(x, G.lerp(from.x + 43, to.x, G.easeInOut(k)) + 10, G.lerp(from.y + 43, to.y, G.easeInOut(k)) + 20);
      }
      if (st.k === 'go') {
        var pulse = 1 + 0.05 * Math.sin(this.time * 5);
        x.fillStyle = '#b3261e';
        roundRect(x, 200, this.MAP_Y + 400, 240, 90, 18); x.fill();
        this.drawGlyph('开 战', 50, '#fff', 320, this.MAP_Y + 445, { scale: pulse });
      }
      return;
    }
    if (!this.o.tutorial) return;
    // 开战后的提示
    var side = b.sides[0], hint = null;
    if (b.mergePairs(side).length && !this.hintDone.merge) hint = '场上有能合成的一对，叠在一起！';
    else if (b.wave === 2) hint = '贼兵走到阿斗跟前，阿斗就会掉一颗心';
    else if (b.wave === 3 && side.skills.length) hint = '左下角是军令：点一下，再点路上施放；冷却好了还能再放';
    else if (side.camp.some(function (c) { return c && c.kind === 'farmer'; })) hint = '农夫可以直接种在草地上，不占营地';
    else if (b.wave === 6 && side.cards.some(function (c) { return !c.used; })) hint = '右下角是锦囊：点一下看说明，再点一下发动';
    else if (b.wave === 4) hint = '相邻的字能连成词：刀挨着枪、弓挨着骑都有加成';
    else if (b.wave === 5) hint = '把没用的兵拖回「营」能换回馒头';
    if (side.units.some(function (u) { return u.lvl >= 2 && u.kind === 'soldier'; }) && b.wave >= 2) this.hintDone.merge = true;
    if (!hint) return;
    x.globalAlpha = 0.85 + 0.15 * Math.sin(this.time * 4);
    this.drawGlyph(hint, 26, '#ffcf3f', 320, this.MAP_Y + 330, { font: 'sans', bold: true, stroke: '#5a2a10', sw: 5 });
    x.globalAlpha = 1;
  };

  function drawHand(x, cx, cy) {
    x.save(); x.translate(cx, cy); x.rotate(-0.4);
    x.fillStyle = '#fff'; x.strokeStyle = '#2b2622'; x.lineWidth = 3;
    x.beginPath();
    x.moveTo(-6, -30); x.quadraticCurveTo(0, -38, 6, -30); x.lineTo(6, -6); x.lineTo(20, -2); x.quadraticCurveTo(26, 10, 18, 26); x.lineTo(-10, 26); x.quadraticCurveTo(-20, 10, -16, -4); x.lineTo(-6, -2); x.closePath();
    x.fill(); x.stroke();
    x.restore();
  }

  // ───────────────────────── 输入 ─────────────────────────
  V.bindInput = function () {
    var self = this, cv = this.cv;
    this._down = function (e) { self.onDown(e); };
    this._move = function (e) { self.onMove(e); };
    this._up = function (e) { self.onUp(e); };
    this._key = function (e) { self.onKey(e); };
    cv.addEventListener('pointerdown', this._down);
    root.addEventListener('pointermove', this._move);
    root.addEventListener('pointerup', this._up);
    root.addEventListener('pointercancel', this._up);
    root.addEventListener('keydown', this._key);
  };
  V.destroy = function () {
    var cv = this.cv;
    cv.removeEventListener('pointerdown', this._down);
    root.removeEventListener('pointermove', this._move);
    root.removeEventListener('pointerup', this._up);
    root.removeEventListener('pointercancel', this._up);
    root.removeEventListener('keydown', this._key);
    this.hideTip();
  };

  V.evPoint = function (e) {
    var r = this.cv.getBoundingClientRect();
    return this.toDesign(e.clientX - r.left, e.clientY - r.top);
  };

  V.onDown = function (e) {
    if (this.paused) return;
    G.Audio.init();
    var p = this.evPoint(e), b = this.b, R = this.R;
    var ts = this.tutStep();
    if (ts && ts.k === 'go') { this.tutReady = true; G.Audio.play('go'); return; }
    this.downP = p; this.downT = this.time;
    this.touch = e.pointerType === 'touch' || e.pointerType === 'pen';
    try { this.cv.setPointerCapture(e.pointerId); } catch (er) { /* */ }
    if (inR(p, R.pause)) { this.pressBtn = 'pause'; return; }
    if (inR(p, R.speed)) { this.pressBtn = 'speed'; return; }
    if (inR(p, R.recruit)) { this.pressBtn = 'recruit'; return; }
    if (inR(p, R.help)) { this.pressBtn = 'help'; return; }
    if (inR(p, R.wave)) { this.pressBtn = 'wave'; return; }
    for (var si = 0; si < 2; si++) if (inR(p, R.skills[si]) && b.sides[0].skills[si]) { this.pressBtn = 'skill' + si; return; }
    // 军令瞄准中：点地图施放
    if (this.aim) {
      var aimI = this.aim.i;
      this.aim = null;
      if (p.y >= this.MAP_Y && p.y <= this.MAP_Y + 800) {
        if (!b.useSkill(b.sides[0], aimI, { x: p.x / CELL, y: (p.y - this.MAP_Y) / CELL })) {
          G.Audio.play('error');
          this.text('要点在我方路上', p.x, p.y - 20, '#b3261e', 24, { font: 'sans' });
        }
      }
      return;
    }
    for (var ci = 0; ci < 2; ci++) if (inR(p, R.cards[ci]) && b.sides[0].cards[ci]) { this.pressBtn = 'card' + ci; return; }
    var side = b.sides[0];
    for (var i = 0; i < 5; i++) if (inR(p, R.camp[i]) && side.camp[i]) { this.startDrag({ camp: i }, p); return; }
    if (inR(p, R.bar[0]) && side.bar[0]) { this.startDrag({ bar: 0 }, p); return; }
    var cell = this.cellAtPoint(p.x, p.y);
    if (cell) {
      var u = b.unitAt(cell[0], cell[1]);
      if (u && u.side === 0) { this.startDrag({ cell: cell }, p); return; }
      this.drag = { from: null, cell: cell, tapOnly: true, start: p };
      return;
    }
    this.drag = { from: null, tapOnly: true, start: p };
  };

  V.startDrag = function (from, p) {
    this.drag = { from: from, start: p, active: false, gx: p.x, gy: p.y };
    var src = this.b.getSource(this.b.sides[0], from);
    if (src && src.unit) this.drag.refund = this.b.refundOf(src.unit);
  };

  V.onMove = function (e) {
    if (this.aim) this.hoverP = this.evPoint(e);
    var d = this.drag;
    if (!d || !d.from) return;
    var p = this.evPoint(e);
    if (!d.active) {
      if (G.dist(p.x, p.y, d.start.x, d.start.y) > 10) { d.active = true; this.hideTip(); this.sel = null; }
      else return;
    }
    var off = this.touch ? 56 : 0;
    d.gx = p.x; d.gy = p.y - off;
    d.cell = this.cellAtPoint(d.gx, d.gy);
    d.overYing = inR({ x: d.gx, y: d.gy }, this.R.ying) || inR(p, this.R.ying);
    d.plan = d.cell ? this.b.resolve(this.b.sides[0], d.from, { cell: d.cell }) : null;
  };

  V.onUp = function (e) {
    var b = this.b, R = this.R;
    if (this.pressBtn) {
      var p = this.evPoint(e), btn = this.pressBtn;
      this.pressBtn = null;
      if (btn === 'pause' && inR(p, R.pause)) { G.Audio.play('click'); this.setPaused(true); if (this.o.onPause) this.o.onPause(); }
      else if (btn === 'speed' && inR(p, R.speed)) { this.speed = this.speed === 1 ? 2 : 1; G.Audio.play('click'); if (this.o.onSpeed) this.o.onSpeed(this.speed); }
      else if (btn === 'recruit' && inR(p, R.recruit)) this.doRecruit();
      else if (btn === 'help' && inR(p, R.help)) { G.Audio.play('click'); if (this.o.onHelp) { this.setPaused(true); this.o.onHelp(); } }
      else if (btn === 'wave' && inR(p, R.wave)) { G.Audio.play('tap'); this.showWaveTip(); }
      else if (btn.slice(0, 4) === 'card') { var ci = +btn.slice(4); if (inR(p, R.cards[ci])) this.tapCard(ci); }
      else if (btn.slice(0, 5) === 'skill') { var sk2 = +btn.slice(5); if (inR(p, R.skills[sk2])) this.tapSkill(sk2); }
      return;
    }
    var d = this.drag;
    this.drag = null;
    if (!d) return;
    if (d.long && !d.active) return;
    if (d.active) {
      var res = null;
      if (d.overYing && d.from.cell) res = b.act(b.sides[0], d.from, { dismiss: true });
      else if (d.overYing && d.from.camp != null) res = b.act(b.sides[0], d.from, { dismiss: true });
      else if (d.cell) res = b.act(b.sides[0], d.from, { cell: d.cell });
      if (res && res.kind === 'dismiss') { var yc = this.R.ying; this.text('+' + res.refund, yc.x + 44, yc.y - 20, '#c98a00', 28); }
      if (!res && d.cell) { G.Audio.play('error'); this.cantText(d); }
      return;
    }
    // 轻点
    this.onTap(d);
  };

  V.cantText = function (d) {
    var b = this.b, c = b.cellAt(d.cell[0], d.cell[1]);
    var msg = '放不下';
    if (c.side !== 0) msg = '那是对手的地盘';
    else if (c.t === 'R') msg = '路上不能站人';
    else if (c.t === 'G') msg = '草地要先用铁铲挖开（农夫可以直接种）';
    else if (c.unit) msg = '不能合成';
    var cc = this.cellCenter(d.cell[0], d.cell[1]);
    this.text(msg, cc.x, cc.y - 20, '#b3261e', 24, { max: 1, font: 'sans' });
  };

  V.onTap = function (d) {
    var b = this.b, side = b.sides[0];
    if (d.from) {
      // 点的是一个可选对象
      if (this.sel && sameFrom(this.sel.from, d.from)) { this.sel = null; this.hideTip(); return; }
      if (this.sel) {
        // 已选中别的 → 把选中的放到这里
        if (d.from.cell) {
          var res = b.act(side, this.sel.from, { cell: d.from.cell });
          if (res) { this.sel = null; this.hideTip(); return; }
        }
      }
      this.sel = { from: d.from };
      G.Audio.play('tap');
      this.showTipFor(d.from);
      return;
    }
    if (d.cell) {
      if (this.sel) {
        var r2 = b.act(side, this.sel.from, { cell: d.cell });
        if (!r2) { G.Audio.play('error'); this.cantText({ cell: d.cell }); }
        this.sel = null; this.hideTip();
        return;
      }
      // 看看对手的兵或敌人
      var u = b.unitAt(d.cell[0], d.cell[1]);
      if (u) { this.showUnitTip(u); return; }
      var en = this.enemyNear(d.start);
      if (en) { this.showEnemyTip(en); return; }
    }
    this.sel = null; this.hideTip();
  };

  function sameFrom(a, b) {
    if (!a || !b) return false;
    if (a.camp != null) return a.camp === b.camp;
    if (a.bar != null) return a.bar === b.bar;
    if (a.cell && b.cell) return a.cell[0] === b.cell[0] && a.cell[1] === b.cell[1];
    return false;
  }

  V.enemyNear = function (p) {
    var b = this.b, best = null, bd = 50 * 50;
    b.sides.forEach(function (s) {
      s.enemies.forEach(function (e) {
        var ex = e.x * CELL, ey = this.MAP_Y + e.y * CELL;
        var d = (ex - p.x) * (ex - p.x) + (ey - p.y) * (ey - p.y);
        if (d < bd) { bd = d; best = e; }
      }, this);
    }, this);
    return best;
  };

  V.onKey = function (e) {
    if (e.target && /input|textarea/i.test(e.target.tagName)) return;
    var k = e.key;
    if (k === ' ' || k === 'r' || k === 'R') { if (!this.paused) { this.doRecruit(); e.preventDefault(); } }
    else if (k === 'Escape' || k === 'p' || k === 'P') { if (!this.paused) { this.setPaused(true); if (this.o.onPause) this.o.onPause(); } }
    else if (k === 'f' || k === 'F') { this.speed = this.speed === 1 ? 2 : 1; }
    else if (k === 'q' || k === 'Q') { this.tapCard(0, true); }
    else if (k === 'z' || k === 'Z') { this.tapSkill(0); }
    else if (k === 'x' || k === 'X') { this.tapSkill(1); }
    else if (k === 'e' || k === 'E') { this.tapCard(1, true); }
    else if (k >= '1' && k <= '5') {
      var i = +k - 1;
      if (this.b.sides[0].camp[i]) { this.sel = { from: { camp: i } }; this.showTipFor(this.sel.from); }
    }
  };

  V.tapSkill = function (i) {
    var b = this.b, side = b.sides[0], k = side.skills[i];
    if (!k) return;
    var def = G.SKILL[k.id];
    if (this.aim && this.aim.i === i) { this.aim = null; this.hideTip(); return; }
    if (b.state !== 'run') { G.Audio.play('error'); this.text('开战后才能用', this.R.skills[i].x + 40, this.R.skills[i].y - 16, '#b3261e', 22, { font: 'sans' }); return; }
    if (k.cd > 0) { G.Audio.play('error'); this.tip('军令 · ' + def.name + '（冷却中 ' + Math.ceil(k.cd) + ' 秒）', def.desc + '<br>冷却 ' + def.cd + ' 秒，可以反复使用。'); return; }
    if (def.target === 'none') { b.useSkill(side, i, null); this.hideTip(); return; }
    this.aim = { i: i };
    this.hoverP = null;
    G.Audio.play('tap');
    this.hideTip();
  };

  V.drawAim = function () {
    if (!this.aim) return;
    var x = this.ctx, b = this.b, lane = b.lanes[0], def = G.SKILL[b.sides[0].skills[this.aim.i].id];
    var a = 0.25 + 0.15 * Math.sin(this.time * 6);
    x.fillStyle = 'rgba(255,207,63,' + a + ')';
    for (var i = 0; i < lane.cells.length; i++) { var c = lane.cells[i]; x.fillRect(c[0] * CELL + 2, this.MAP_Y + c[1] * CELL + 2, CELL - 4, CELL - 4); }
    if (this.hoverP) {
      var t = b.laneTarget(b.sides[0], this.hoverP.x / CELL, (this.hoverP.y - this.MAP_Y) / CELL);
      if (t) {
        var P = this.posOf(t.x, t.y), r = ({ arrows: 1.35, rocks: 1.05, thunder: 1.8, jvma: 0.5 })[def.id] || 1;
        x.strokeStyle = '#b3261e'; x.lineWidth = 3; x.setLineDash([8, 6]);
        x.beginPath(); x.arc(P.x, P.y, r * CELL, 0, Math.PI * 2); x.stroke(); x.setLineDash([]);
      }
    }
    x.fillStyle = 'rgba(30,45,90,0.88)';
    roundRect(x, 70, this.MAP_Y + 410, 500, 56, 14); x.fill();
    this.drawGlyph('点我方路上的位置，施放「' + def.name + '」', 24, '#ffe9a8', 320, this.MAP_Y + 438, { font: 'sans', bold: true });
  };

  V.tapCard = function (i, direct) {
    var b = this.b, side = b.sides[0], c = side.cards[i];
    if (!c) return;
    var def = G.CARD[c.id];
    if (c.used) { this.tip(def.name + '（已用）', def.desc); return; }
    if (direct || (this.cardArm === i && this.time - this.cardArmT < 3)) {
      this.cardArm = null; this.hideTip();
      if (!b.useCard(side, i)) { G.Audio.play('error'); this.text(b.state !== 'run' ? '开战后才能用' : '现在用不了', this.R.cards[i].x + 40, this.R.cards[i].y - 16, '#b3261e', 22, { font: 'sans' }); }
      return;
    }
    this.cardArm = i; this.cardArmT = this.time;
    G.Audio.play('tap');
    this.tip('锦囊 · ' + def.name, def.desc + '<br><b>再点一次发动</b>（每局只能用一次）');
  };

  V.showWaveTip = function () {
    var b = this.b, info = b.nextWaveInfo(), w = G.WEATHER[b.weather] || G.WEATHER.clear;
    var html = '';
    if (info) {
      var parts = Object.keys(info.counts).map(function (k) { return G.ENEMIES[k].ch + '×' + info.counts[k]; });
      html += '下一波（第' + G.cnNum(info.n) + '波）：' + (parts.join('、') || '—');
      if (info.boss) html += '<br><b style="color:#9e1b16">Boss：' + G.BOSSES[info.boss].name + '</b> — ' + G.BOSSES[info.boss].desc;
    } else html += '这是最后一波，清完就过关！';
    html += '<br>天气：' + w.name + ' — ' + w.desc;
    var bonds = b.sides[0].bonds;
    if (bonds.length) {
      var cnt = {};
      bonds.forEach(function (x) { cnt[x.name] = (cnt[x.name] || 0) + 1; });
      html += '<br>我方羁绊：' + Object.keys(cnt).map(function (k) { return k + (cnt[k] > 1 ? '×' + cnt[k] : ''); }).join('、');
    } else html += '<br>我方羁绊：暂无（相邻的字连成词、刘关张同场等都会触发）';
    this.tip('敌情', html);
  };

  V.orderFx = function (e) {
    var b = this.b, mine = e.side === 0, A = G.Audio;
    var P = e.x != null ? this.posOf(e.x, e.y) : null;
    var def = G.SKILL[e.id];
    if (mine) G.haptic(12);
    switch (e.id) {
      case 'arrows': if (mine) A.play('arrow'); break;
      case 'rocks': if (mine) A.play('thrust'); this.add({ type: 'falling', x: P.x, y: P.y, max: 0.55, ch: '石' }); break;
      case 'jvma': if (mine) A.play('place'); break;
      case 'drum':
        if (mine) A.play('wave');
        var L = b.lanes[e.side], end = L.pts[L.pts.length - 1];
        this.add({ type: 'ring', x: 320, y: this.MAP_Y + (e.side === 0 ? 600 : 200), r: 300, max: 0.6, color: 'rgba(179,38,30,0.5)', w: 12 });
        void end;
        break;
      case 'thunder':
        if (mine) A.play('boom');
        this.add({ type: 'bolt', x: P.x, y: P.y, max: 0.35, seed: Math.random() });
        this.add({ type: 'flash', side: e.side, max: 0.25, color: 'rgba(255,255,230,0.45)' });
        break;
      case 'cry':
        if (mine) A.play('roar');
        var L2 = b.lanes[e.side], end2 = L2.pts[L2.pts.length - 1], Pe = this.posOf(end2.x, end2.y);
        this.add({ type: 'ring', x: Pe.x, y: Pe.y, r: 3 * CELL, max: 0.6, color: 'rgba(60,120,200,0.55)', w: 10 });
        this.say(e.side, '哇——！', true);
        this.adou[e.side].shake = 0.5;
        break;
    }
    if (mine) this.text(def.name, P ? P.x : 320, (P ? P.y : this.MAP_Y + 600) - 50, '#2f4f8f', 30, { pop: true, max: 1 });
  };

  V.cardFx = function (e) {
    var b = this.b, mid = e.side === 0 ? this.MAP_Y + 600 : this.MAP_Y + 200;
    switch (e.id) {
      case 'kongcheng': this.text('空', 320, mid, 'rgba(60,60,80,0.8)', 160, { pop: true, max: 1.6, vy: -10 }); break;
      case 'huogong': this.add({ type: 'flash', side: e.side, max: 0.5, color: 'rgba(240,120,30,0.35)' }); break;
      case 'caochuan':
        for (var i = 0; i < 24; i++) this.add({ type: 'spark', x: 40 + Math.random() * 560, y: mid - 300, vx: 0.0001, vy: 600 + Math.random() * 200, max: 0.5, color: '#4a4038' });
        this.text('借箭!', 320, mid, '#2f74c0', 50, { pop: true, max: 1.2 });
        break;
      case 'kurou': this.adou[e.side].shake = 0.8; break;
      case 'jiedao': this.add({ type: 'flash', side: 1 - e.side, max: 0.4, color: 'rgba(180,40,30,0.3)' }); this.text('借刀!', 320, e.side === 0 ? this.MAP_Y + 200 : this.MAP_Y + 600, '#b3261e', 48, { pop: true, max: 1.2 }); break;
      case 'diaohu': var L = b.lanes[e.side], p0 = L.pts[0]; this.dust(this.posOf(p0.x, p0.y)); this.text('调虎离山', 320, mid, '#7a4a1a', 44, { pop: true, max: 1.2 }); break;
      case 'lianhuan': this.text('连环', 320, mid, '#5a5a6a', 50, { pop: true, max: 1.2 }); break;
      case 'andu': if (e.side === 0) this.burst({ x: 330, y: this.CAMP_Y + 40 }, '#e0a100', 16); break;
    }
  };

  V.drawBonds = function () {
    var x = this.ctx, b = this.b, self = this;
    for (var s = 0; s < b.sides.length; s++) {
      var bonds = b.sides[s].bonds;
      if (!bonds.length) continue;
      x.globalAlpha = s === 0 ? 1 : 0.55;
      for (var i = 0; i < bonds.length; i++) {
        var bd = bonds[i];
        var cs = bd.cells.map(function (c) { return self.cellCenter(c[0], c[1]); });
        if (bd.kind === 'word') {
          x.strokeStyle = 'rgba(47,116,192,0.35)'; x.lineWidth = 20; x.lineCap = 'round';
          x.beginPath(); x.moveTo(cs[0].x, cs[0].y); x.lineTo(cs[1].x, cs[1].y); x.stroke();
        } else if (bd.kind === 'form') {
          x.strokeStyle = 'rgba(179,38,30,0.55)'; x.lineWidth = 3; x.setLineDash([8, 6]);
          cs.forEach(function (c) { roundRect(x, c.x - 38, c.y - 38, 76, 76, 10); x.stroke(); });
          x.setLineDash([]);
        } else {
          x.strokeStyle = 'rgba(224,161,0,' + (0.45 + 0.2 * Math.sin(this.time * 3)) + ')'; x.lineWidth = 6; x.lineCap = 'round';
          x.beginPath();
          cs.forEach(function (c, j) { if (j) x.lineTo(c.x, c.y); else x.moveTo(c.x, c.y); });
          x.stroke();
        }
      }
      x.globalAlpha = 1;
    }
  };

  // 羁绊名称贴在单位上层
  V.drawBondLabels = function () {
    var x = this.ctx, b = this.b, self = this;
    for (var s = 0; s < b.sides.length; s++) {
      var bonds = b.sides[s].bonds, seen = {};
      x.globalAlpha = s === 0 ? 1 : 0.6;
      for (var i = 0; i < bonds.length; i++) {
        var bd = bonds[i];
        var cs = bd.cells.map(function (c) { return self.cellCenter(c[0], c[1]); });
        var lx, ly, col;
        if (bd.kind === 'word') { lx = (cs[0].x + cs[1].x) / 2; ly = (cs[0].y + cs[1].y) / 2 + (cs[0].y === cs[1].y ? 30 : 0); col = '#2f74c0'; }
        else {
          if (seen[bd.name]) continue; seen[bd.name] = 1;
          var top = cs.reduce(function (a, c) { return c.y < a.y ? c : a; }, cs[0]);
          lx = top.x; ly = top.y - 40; col = bd.kind === 'form' ? '#b3261e' : '#a06a00';
        }
        var g = this.glyph(bd.name, 17, '#fff', { font: 'sans', bold: true });
        x.fillStyle = col;
        roundRect(x, lx - g.w / 2 + 2, ly - 12, g.w - 4, 24, 12); x.fill();
        x.drawImage(g.c, lx - g.w / 2, ly - g.h / 2, g.w, g.h);
      }
      x.globalAlpha = 1;
    }
  };

  V.drawWeather = function () {
    var w = this.b.weather;
    if (!w || w === 'clear') return;
    var x = this.ctx, t = this.time, MY = this.MAP_Y, i;
    x.save();
    x.beginPath(); x.rect(0, MY, DW, 800); x.clip();
    if (w === 'fog') {
      for (i = 0; i < 6; i++) {
        var fx = ((i * 173 + t * (12 + i * 3)) % 900) - 130, fy = MY + 60 + i * 130;
        var gr = x.createRadialGradient(fx, fy, 10, fx, fy, 220);
        gr.addColorStop(0, 'rgba(250,248,240,0.38)'); gr.addColorStop(1, 'rgba(250,248,240,0)');
        x.fillStyle = gr; x.fillRect(fx - 230, fy - 230, 460, 460);
      }
    } else if (w === 'rain') {
      x.strokeStyle = 'rgba(110,140,180,0.45)'; x.lineWidth = 2;
      x.beginPath();
      for (i = 0; i < 70; i++) {
        var rx = ((i * 97 + t * 90) % 720) - 40, ry = MY + ((i * 53 + t * 760) % 820);
        x.moveTo(rx, ry); x.lineTo(rx - 7, ry + 22);
      }
      x.stroke();
      x.fillStyle = 'rgba(60,80,110,0.08)'; x.fillRect(0, MY, DW, 800);
    } else if (w === 'night') {
      x.fillStyle = 'rgba(15,25,60,0.3)'; x.fillRect(0, MY, DW, 800);
      var vg = x.createRadialGradient(320, MY + 400, 200, 320, MY + 400, 560);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(5,10,30,0.4)');
      x.fillStyle = vg; x.fillRect(0, MY, DW, 800);
    } else if (w === 'wind') {
      x.strokeStyle = 'rgba(255,255,255,0.45)'; x.lineWidth = 2.5; x.lineCap = 'round';
      for (i = 0; i < 9; i++) {
        var wx = ((i * 211 + t * 260) % 900) - 120, wy = MY + 50 + ((i * 89) % 720);
        x.beginPath(); x.moveTo(wx, wy); x.quadraticCurveTo(wx + 40, wy - 14, wx + 90, wy); x.quadraticCurveTo(wx + 120, wy + 8, wx + 140, wy - 4); x.stroke();
      }
    } else if (w === 'heat') {
      x.fillStyle = 'rgba(255,150,40,0.08)'; x.fillRect(0, MY, DW, 800);
      x.strokeStyle = 'rgba(255,200,120,0.25)'; x.lineWidth = 2;
      for (i = 0; i < 6; i++) {
        var hy = MY + ((i * 140 + t * 40) % 800);
        x.beginPath();
        for (var hx = 0; hx <= DW; hx += 20) x.lineTo(hx, hy + Math.sin(hx * 0.05 + t * 3 + i) * 4);
        x.stroke();
      }
    }
    x.restore();
  };

  V.doRecruit = function () {
    var b = this.b;
    if (b.recruit(b.sides[0])) { this.sel = null; this.hideTip(); this.burst({ x: 320, y: this.CAMP_Y + 40 }, '#d4663f', 6); }
    else G.Audio.play('error');
  };

  V.setPaused = function (p) {
    this.paused = p;
    if (p) { this.drag = null; this.hideTip(); }
  };

  // ───────────────────────── 说明浮窗 ─────────────────────────
  V.showTipFor = function (from) {
    var b = this.b, src = b.getSource(b.sides[0], from);
    if (!src) return;
    if (src.unit) return this.showUnitTip(src.unit);
    var it = src.item;
    if (it.kind === 'prop') return this.tip(G.PROPS[it.key].name, G.PROPS[it.key].desc);
    if (it.kind === 'part') {
      var g = G.GEN[it.gen];
      return this.tip('武将碎片 · ' + g.parts[it.part], '把“' + g.parts[0] + '”和“' + g.parts[1] + '”拼在一起，召唤' + g.name + '（' + G.WTYPE[g.type] + '）。<br>单独上场也能凑合着打。<br><b>' + g.skill + '</b>：' + g.desc);
    }
    var s = G.SOLDIERS[it.key];
    this.tip(s.name + (it.lvl > 1 ? ' · ' + it.lvl + '级' : ''), s.desc + '<br>两个相同等级的' + s.ch + '叠在一起合成升级。');
  };

  V.showUnitTip = function (u) {
    var b = this.b, st = b.unitStats(u);
    var who = u.side === 0 ? '' : '（对手）';
    if (u.kind === 'farmer') return this.tip('农夫 · ' + u.lvl + '级' + who, '每 10 秒产出 ' + G.farmerYield(u.lvl) + ' 个馒头。');
    var line = '攻击 ' + G.fmt(st.dmg) + ' · 间隔 ' + st.cd.toFixed(2) + 's · 射程 ' + st.range.toFixed(1) + ' 格';
    var extra = '<br>已造成伤害 ' + G.fmt(u.dmgDone) + '，击杀 ' + u.kills;
    if (u.kind === 'general') {
      var g = G.GEN[u.gen];
      var wtxt = u.weapon ? '<br>兵器：<span style="color:' + G.RARITY_COLOR[u.weapon.rarity] + '">' + u.weapon.name + '</span> ' + u.weapon.desc : '<br>未佩戴兵器';
      return this.tip(g.name + ' · ' + u.lvl + '星' + who, line + '<br><b>' + g.skill + '</b>：' + g.desc + wtxt + extra);
    }
    if (u.kind === 'part') {
      var g2 = G.GEN[u.gen];
      return this.tip('武将碎片 · ' + g2.parts[u.part] + who, line + '<br>再拼上“' + g2.parts[1 - u.part] + '”就能召唤' + g2.name + '。' + extra);
    }
    var s = G.SOLDIERS[u.key];
    this.tip(s.name + ' · ' + u.lvl + '级' + who, line + '<br>' + s.desc + extra);
  };

  V.showEnemyTip = function (e) {
    if (e.boss) { var bd = G.BOSSES[e.boss]; return this.tip(bd.name + '（Boss）', '血量 ' + G.fmt(e.hp) + ' / ' + G.fmt(e.maxHp) + '<br>' + bd.desc + '<br>放跑 Boss 会掉两颗心。'); }
    var d = G.ENEMIES[e.type] || { name: e.ch, desc: '' };
    this.tip(d.name, '血量 ' + G.fmt(e.hp) + ' / ' + G.fmt(e.maxHp) + '<br>' + d.desc);
  };

  V.tip = function (title, html) {
    if (!this.tipEl) return;
    this.tipEl.innerHTML = '<b class="tip-title">' + title + '</b><div>' + html + '</div>';
    this.tipEl.classList.add('show');
  };
  V.hideTip = function () { if (this.tipEl) this.tipEl.classList.remove('show'); };
})(typeof window !== 'undefined' ? window : globalThis);

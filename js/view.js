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
      camp: [0, 1, 2, 3, 4].map(function (i) { return { x: 100 + i * 92, y: cy, w: 86, h: 86 }; }),
      recruit: { x: 190, y: this.BTN_Y, w: 260, h: 100 },
      bar: [{ x: 20, y: this.BTN_Y + 10, w: 78, h: 80 }, { x: 104, y: this.BTN_Y + 10, w: 78, h: 80 }],
      help: { x: 556, y: this.BTN_Y + 14, w: 70, h: 70 }
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
    if (!this.paused) {
      var step = 1 / 60;
      this.acc += dtReal * this.speed;
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
    this.banners.push({ txt: txt, sub: sub || '', t: 0, max: o.max || 1.8, color: o.color || '#1d1a17', boss: !!o.boss, side: o.side });
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
        case 'act':
          if (!mine) { if (e.kind === 'form' || e.kind === 'genup') this.burst(this.cellCenter(e.x, e.y), '#e0a100', 10); break; }
          var cc = this.cellCenter(e.x, e.y);
          if (e.kind === 'merge') { A.play('merge'); this.burst(cc, '#e0a100', 14); this.text('升级!', cc.x, cc.y - 30, '#b3261e', 30, { pop: true }); }
          else if (e.kind === 'form') { A.play('general'); this.burst(cc, '#e0a100', 22); this.text('武将登场!', cc.x, cc.y - 34, '#b3261e', 32, { pop: true, max: 1.3 }); }
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
          if (mine) this.flashRed = 0.6;
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
    if (b.mode === 'endless') {
      x.fillStyle = 'rgba(40,32,26,0.28)';
      x.fillRect(0, this.MAP_Y, DW, 400);
      this.drawGlyph('无尽守城', 64, 'rgba(255,248,235,0.75)', 320, this.MAP_Y + 170);
      if (this.o.best) this.drawGlyph('最佳 · 第' + G.cnNum(this.o.best) + '波', 30, 'rgba(255,248,235,0.7)', 320, this.MAP_Y + 240);
    }
    this.drawSpawnArrows();
    this.drawZones();
    this.drawMines();
    this.drawHighlights();
    this.drawSnakes();
    for (var s = 0; s < b.lanes.length; s++) this.drawAdou(s);
    this.drawUnits();
    this.drawEnemies();
    this.drawProjectiles();
    this.drawSweeps();
    this.drawParts();
    this.drawRangeRing();
    this.drawHUD();
    this.drawBottom();
    this.drawHints();
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
      if (b.mode === 'endless' && s === 1) continue;
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
      } else if (z.kind === 'cloud') {
        x.fillStyle = 'rgba(30,30,35,' + 0.45 * a + ')';
        for (j = 0; j < 5; j++) {
          x.beginPath(); x.arc(P.x + Math.cos(j * 1.3 + this.time * 0.6) * 34, P.y - 20 + Math.sin(j * 2.1) * 16, 34 + j * 3, 0, Math.PI * 2); x.fill();
        }
      }
    }
  };

  V.drawMines = function () {
    var x = this.ctx, b = this.b;
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
    if (b.mode === 'endless' && s === 1) return;
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
        if (e.markT > 0) {
          x.fillStyle = 'rgba(240,220,120,0.85)';
          x.beginPath(); x.arc(P.x + 20, by - 6, 7, 0.4, Math.PI * 1.6 + 0.4); x.arc(P.x + 23, by - 8, 6, Math.PI * 1.6 + 0.4, 0.4, true); x.fill();
        }
        x.globalAlpha = 1;
      }
    }
  };

  V.drawProjectiles = function () {
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
    // 地图名与波次
    this.drawGlyph(b.map.name, 44, '#3a2a20', 320, T + 46, { stroke: '#f4ecdc', sw: 3 });
    var wtxt = (b.mode === 'endless' ? '无尽 · ' : '') + '第' + G.cnNum(Math.max(1, b.wave)) + '波';
    this.drawGlyph(wtxt, 32, '#fff', 320, T + 96, { stroke: '#2b2622', sw: 5 });
    if (b.state === 'run') {
      var left = Math.max(0, b.waveDur - b.waveT);
      x.fillStyle = 'rgba(43,38,34,0.25)'; x.fillRect(260, T + 126, 120, 5);
      x.fillStyle = '#b3261e'; x.fillRect(260, T + 126, 120 * (1 - left / b.waveDur), 5);
    }
    // 对手
    if (b.mode !== 'endless' && b.sides[1]) {
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
    if (b.state === 'intro') {
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
    // 军需栏
    for (i = 0; i < 2; i++) {
      var rb = this.R.bar[i], itb = side.bar[i];
      if (!itb) continue;
      x.fillStyle = '#f7f1e3'; x.strokeStyle = '#b3261e'; x.lineWidth = 2;
      roundRect(x, rb.x, rb.y, rb.w, rb.h, 8); x.fill(); x.stroke();
      this.itemGlyph(itb, rb.x + rb.w / 2, rb.y + rb.h / 2 - 4, 40, this.drag && this.drag.active && this.drag.from.bar === i ? 0.25 : 1);
    }
    // 帮助
    var H = this.R.help;
    x.fillStyle = 'rgba(60,55,50,0.8)';
    x.beginPath(); x.arc(H.x + H.w / 2, H.y + H.h / 2, 30, 0, Math.PI * 2); x.fill();
    this.drawGlyph('?', 36, '#fff', H.x + H.w / 2, H.y + H.h / 2, { font: 'sans', bold: true });
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
      var cy = this.MAP_Y + 400;
      x.globalAlpha = a;
      x.fillStyle = bn.boss ? 'rgba(90,10,8,0.85)' : 'rgba(30,25,20,0.78)';
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
  V.drawHints = function () {
    var b = this.b;
    if (!this.o.tutorial || b.state === 'over') return;
    var side = b.sides[0];
    var hint = null, arrow = null;
    var campItems = side.camp.filter(Boolean);
    var pairOnBoard = b.mergePairs(side).length > 0;
    if (!side.units.length && !campItems.length) { hint = '点击下方红色按钮，征召士兵'; arrow = this.R.recruit; }
    else if (side.units.length < 3 && campItems.length) { hint = '把营里的字拖到白色营地上，排兵布阵'; arrow = 'drag'; }
    else if (pairOnBoard && !this.hintDone.merge) { hint = '两个相同的字叠在一起，就能合成升级！'; }
    else if (side.units.some(function (u) { return u.kind === 'part'; }) && !side.units.some(function (u) { return u.kind === 'general'; })) { hint = '把“赵”“云”拼在一起，召唤武将赵云！'; }
    else if (b.wave <= 2 && !this.hintDone.adou) { hint = '贼兵走到阿斗跟前，阿斗就会掉一颗心'; }
    else if (b.wave >= 3 && b.wave <= 4 && !this.hintDone.recycle) { hint = '把没用的兵拖回“营”可以换回馒头'; }
    if (pairOnBoard && b.sides[0].units.some(function (u) { return u.lvl >= 2; })) this.hintDone.merge = true;
    if (b.wave >= 3) this.hintDone.adou = true;
    if (!hint) return;
    var y = this.MAP_Y + 330;
    var a = 0.85 + 0.15 * Math.sin(this.time * 4);
    this.ctx.globalAlpha = a;
    this.drawGlyph(hint, 28, '#ffcf3f', 320, y, { font: 'sans', bold: true, stroke: '#5a2a10', sw: 5 });
    this.ctx.globalAlpha = 1;
    var x = this.ctx;
    if (arrow === 'drag') {
      var from = this.R.camp[side.camp.findIndex(function (c) { return c; })];
      var cells = b.emptyCells(side);
      if (from && cells.length) {
        var to = this.cellCenter(cells[0].x, cells[0].y);
        var k = (this.time % 1.6) / 1.6;
        var hx = G.lerp(from.x + 43, to.x, G.easeInOut(k)), hy = G.lerp(from.y + 43, to.y, G.easeInOut(k));
        drawHand(x, hx + 10, hy + 20);
      }
    } else if (arrow) {
      drawHand(x, arrow.x + arrow.w + 18, arrow.y + 56 + Math.sin(this.time * 6) * 8);
    }
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
    this.downP = p; this.downT = this.time;
    this.touch = e.pointerType === 'touch' || e.pointerType === 'pen';
    try { this.cv.setPointerCapture(e.pointerId); } catch (er) { /* */ }
    if (inR(p, R.pause)) { this.pressBtn = 'pause'; return; }
    if (inR(p, R.speed)) { this.pressBtn = 'speed'; return; }
    if (inR(p, R.recruit)) { this.pressBtn = 'recruit'; return; }
    if (inR(p, R.help)) { this.pressBtn = 'help'; return; }
    var side = b.sides[0];
    for (var i = 0; i < 5; i++) if (inR(p, R.camp[i]) && side.camp[i]) { this.startDrag({ camp: i }, p); return; }
    for (i = 0; i < 2; i++) if (inR(p, R.bar[i]) && side.bar[i]) { this.startDrag({ bar: i }, p); return; }
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
      return;
    }
    var d = this.drag;
    this.drag = null;
    if (!d) return;
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
    else if (c.t === 'G') msg = '草地要先用铁铲挖开';
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
    else if (k >= '1' && k <= '5') {
      var i = +k - 1;
      if (this.b.sides[0].camp[i]) { this.sel = { from: { camp: i } }; this.showTipFor(this.sel.from); }
    }
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

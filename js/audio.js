/* 音效与配乐：全部用 WebAudio 现场合成，仓库里没有任何音频文件。 */
(function (root) {
  'use strict';
  var G = root.G = root.G || {};
  var ctx = null, master = null, sfxBus = null, musicBus = null, noiseBuf = null;
  var settings = { music: 0.55, sfx: 0.8 };
  var lastPlay = {};
  var music = null;

  function ensure() {
    if (ctx) return ctx;
    var AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
    var comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 4;
    comp.connect(master);
    sfxBus = ctx.createGain(); sfxBus.gain.value = settings.sfx; sfxBus.connect(comp);
    musicBus = ctx.createGain(); musicBus.gain.value = settings.music * 0.5; musicBus.connect(comp);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate);
    var d = noiseBuf.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return ctx;
  }

  function now() { return ctx.currentTime; }

  function env(g, t, a, peak, dec, sus) {
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, sus || 0.0001), t + a + dec);
  }

  function tone(freq, dur, o) {
    o = o || {};
    var t = now() + (o.delay || 0);
    var osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (o.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq * o.slide), t + dur);
    env(g, t, o.attack || 0.005, o.vol || 0.3, dur);
    osc.connect(g);
    var out = g;
    if (o.filter) {
      var f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.filter;
      g.connect(f); out = f;
    }
    out.connect(o.bus || sfxBus);
    osc.start(t); osc.stop(t + dur + 0.05);
  }

  function noise(dur, o) {
    o = o || {};
    var t = now() + (o.delay || 0);
    var src = ctx.createBufferSource(); src.buffer = noiseBuf;
    var f = ctx.createBiquadFilter(); f.type = o.ftype || 'bandpass';
    f.frequency.setValueAtTime(o.freq || 1200, t);
    if (o.sweep) f.frequency.exponentialRampToValueAtTime(o.sweep, t + dur);
    f.Q.value = o.q || 1;
    var g = ctx.createGain();
    env(g, t, o.attack || 0.003, o.vol || 0.3, dur);
    src.connect(f); f.connect(g); g.connect(o.bus || sfxBus);
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
  }

  // 拨弦（类似古筝）
  function pluck(freq, dur, vol, bus, delay) {
    var t = now() + (delay || 0);
    var o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    o1.type = 'triangle'; o2.type = 'sine';
    o1.frequency.setValueAtTime(freq * 1.004, t); o1.frequency.exponentialRampToValueAtTime(freq, t + 0.08);
    o2.frequency.value = freq * 2;
    f.type = 'lowpass'; f.frequency.setValueAtTime(freq * 6, t); f.frequency.exponentialRampToValueAtTime(freq * 1.5, t + dur);
    var g2 = ctx.createGain(); g2.gain.value = 0.25;
    o1.connect(g); o2.connect(g2); g2.connect(g); g.connect(f); f.connect(bus || sfxBus);
    env(g, t, 0.004, vol || 0.2, dur);
    o1.start(t); o2.start(t); o1.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
  }

  function drum(vol, freq, delay, bus) {
    var t = now() + (delay || 0);
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq || 120, t);
    o.frequency.exponentialRampToValueAtTime((freq || 120) * 0.4, t + 0.25);
    env(g, t, 0.002, vol || 0.6, 0.35);
    o.connect(g); g.connect(bus || sfxBus);
    o.start(t); o.stop(t + 0.4);
    noise(0.06, { freq: 900, vol: (vol || 0.6) * 0.25, delay: delay, bus: bus });
  }

  function gong(vol, delay) {
    [130, 196.5, 262, 347].forEach(function (f, i) {
      tone(f, 2.4 - i * 0.4, { type: 'sine', vol: (vol || 0.25) / (i + 1), delay: delay, slide: 0.985, attack: 0.01 });
    });
    noise(0.4, { freq: 600, vol: (vol || 0.25) * 0.4, delay: delay });
  }

  var PENTA = [0, 2, 4, 7, 9];
  function noteFreq(base, step) {
    var oct = Math.floor(step / 5), k = ((step % 5) + 5) % 5;
    return base * Math.pow(2, oct + PENTA[k] / 12);
  }

  function throttle(name, gap) {
    var t = now();
    if (lastPlay[name] && t - lastPlay[name] < gap) return false;
    lastPlay[name] = t;
    return true;
  }

  var SFX = {
    click: function () { tone(880, 0.06, { type: 'triangle', vol: 0.15 }); },
    tap: function () { tone(660, 0.05, { type: 'triangle', vol: 0.12 }); },
    recruit: function () {
      noise(0.18, { freq: 3000, sweep: 800, vol: 0.18, ftype: 'highpass' });
      drum(0.45, 110); drum(0.35, 140, 0.11);
    },
    place: function () { tone(320, 0.09, { type: 'square', vol: 0.12, filter: 1400, slide: 0.6 }); noise(0.04, { freq: 2200, vol: 0.12 }); },
    merge: function () { [0, 2, 4, 7].forEach(function (s, i) { pluck(noteFreq(523, s), 0.5, 0.18, null, i * 0.06); }); },
    general: function () { gong(0.22); [0, 4, 7, 9].forEach(function (s, i) { pluck(noteFreq(392, s + 5), 0.7, 0.2, null, 0.1 + i * 0.08); }); },
    slash: function () { if (!throttle('slash', 0.07)) return; noise(0.09, { freq: 2600, sweep: 900, vol: 0.12, q: 2 }); },
    thrust: function () { if (!throttle('thrust', 0.08)) return; noise(0.07, { freq: 1600, sweep: 3000, vol: 0.1, q: 3 }); },
    arrow: function () { if (!throttle('arrow', 0.06)) return; noise(0.08, { freq: 5000, sweep: 2000, vol: 0.06, q: 4 }); },
    hit: function () { if (!throttle('hit', 0.05)) return; tone(160, 0.06, { type: 'triangle', vol: 0.12, slide: 0.5 }); },
    clash: function () { if (!throttle('clash', 0.12)) return; tone(1800, 0.25, { type: 'square', vol: 0.05, filter: 4000, slide: 0.98 }); tone(2400, 0.2, { type: 'sine', vol: 0.06 }); noise(0.08, { freq: 4000, vol: 0.1 }); },
    die: function () { if (!throttle('die', 0.06)) return; tone(300, 0.12, { type: 'sine', vol: 0.12, slide: 0.4 }); },
    coin: function () { if (!throttle('coin', 0.08)) return; tone(1320, 0.06, { type: 'square', vol: 0.05, filter: 3000 }); tone(1760, 0.09, { type: 'square', vol: 0.05, filter: 3000, delay: 0.05 }); },
    boss: function () { gong(0.35); drum(0.6, 90, 0.2); drum(0.6, 90, 0.45); drum(0.7, 80, 0.7); },
    wave: function () { drum(0.5, 100); drum(0.4, 130, 0.15); },
    leak: function () { drum(0.7, 70); tone(220, 0.4, { type: 'sawtooth', vol: 0.08, filter: 800, slide: 0.5 }); },
    roar: function () { noise(0.6, { freq: 300, sweep: 120, vol: 0.4, ftype: 'lowpass' }); tone(90, 0.5, { type: 'sawtooth', vol: 0.12, filter: 500, slide: 0.7 }); },
    skill: function () { if (!throttle('skill', 0.2)) return; [7, 9, 12].forEach(function (s, i) { pluck(noteFreq(392, s), 0.4, 0.14, null, i * 0.05); }); },
    boom: function () { if (!throttle('boom', 0.1)) return; noise(0.5, { freq: 500, sweep: 80, vol: 0.4, ftype: 'lowpass' }); drum(0.5, 70); },
    shovel: function () { noise(0.15, { freq: 700, vol: 0.25 }); tone(200, 0.1, { type: 'triangle', vol: 0.12, delay: 0.08 }); },
    error: function () { tone(220, 0.12, { type: 'square', vol: 0.08, filter: 900 }); tone(180, 0.15, { type: 'square', vol: 0.08, filter: 900, delay: 0.1 }); },
    heal: function () { [0, 4, 7].forEach(function (s, i) { pluck(noteFreq(660, s), 0.4, 0.12, null, i * 0.07); }); },
    farm: function () { if (!throttle('farm', 0.3)) return; pluck(784, 0.25, 0.1); pluck(988, 0.3, 0.1, null, 0.06); },
    lock: function () { if (!throttle('lock', 0.2)) return; noise(0.25, { freq: 3000, vol: 0.12, q: 6 }); tone(500, 0.2, { type: 'square', vol: 0.05, filter: 1200 }); },
    win: function () {
      gong(0.3);
      [0, 2, 4, 5, 7, 9, 10].forEach(function (s, i) { pluck(noteFreq(392, s), 0.8, 0.22, null, 0.2 + i * 0.11); });
      drum(0.6, 100, 0.2); drum(0.6, 100, 0.55); drum(0.7, 90, 0.95);
    },
    lose: function () { [7, 5, 4, 2, 0].forEach(function (s, i) { pluck(noteFreq(262, s), 0.9, 0.2, null, i * 0.18); }); drum(0.5, 70, 0.9); },
    star: function () { tone(1046, 0.15, { type: 'triangle', vol: 0.15 }); tone(1568, 0.25, { type: 'triangle', vol: 0.12, delay: 0.08 }); },
    unlock: function () { gong(0.2); [0, 4, 7, 12].forEach(function (s, i) { pluck(noteFreq(523, s), 0.6, 0.18, null, i * 0.09); }); },
    countdown: function () { drum(0.5, 140); },
    go: function () { gong(0.25); drum(0.7, 90); drum(0.6, 110, 0.12); }
  };

  G.Audio = {
    init: function () {
      var c = ensure();
      if (c && c.state === 'suspended') c.resume();
    },
    setVolumes: function (m, s) {
      settings.music = m; settings.sfx = s;
      if (!ctx) return;
      musicBus.gain.value = m * 0.5; sfxBus.gain.value = s;
    },
    play: function (name) {
      if (!ctx || ctx.state !== 'running' || settings.sfx <= 0) return;
      var f = SFX[name];
      if (f) try { f(); } catch (e) { /* 忽略 */ }
    },
    // 生成式配乐：mode = 'menu' | 'battle' | null
    music: function (mode) {
      if (music && music.mode === mode) return;
      if (music) { clearInterval(music.timer); music = null; }
      if (!mode || !ensure()) return;
      var step = 0;
      var base = mode === 'battle' ? 196 : 220;
      var bpm = mode === 'battle' ? 112 : 76;
      var beat = 60 / bpm / 2;
      var phrase = [];
      var rnd = Math.random;
      function newPhrase() {
        phrase = [];
        var cur = 5;
        for (var i = 0; i < 16; i++) {
          cur += [-2, -1, -1, 0, 1, 1, 2][Math.floor(rnd() * 7)];
          cur = Math.max(2, Math.min(11, cur));
          phrase.push(rnd() < (mode === 'battle' ? 0.62 : 0.45) ? cur : null);
        }
      }
      newPhrase();
      music = { mode: mode, timer: setInterval(function () {
        if (!ctx || ctx.state !== 'running' || settings.music <= 0) { step++; return; }
        var i = step % 16;
        if (i === 0 && step % 64 === 0) newPhrase();
        var n = phrase[i];
        if (n != null) pluck(noteFreq(base, n), mode === 'battle' ? 0.5 : 1.1, 0.13, musicBus);
        if (i % 8 === 0) pluck(noteFreq(base / 2, [0, 3, 4, 2][Math.floor(step / 16) % 4]), 2.2, 0.16, musicBus);
        if (mode === 'battle') {
          if (i % 4 === 0) drum(i % 8 === 0 ? 0.32 : 0.2, 95, 0, musicBus);
          if (i % 8 === 6) drum(0.14, 150, 0, musicBus);
        }
        step++;
      }, beat * 1000) };
    },
    suspend: function () { if (ctx && ctx.state === 'running') ctx.suspend(); },
    resume: function () { if (ctx && ctx.state === 'suspended') ctx.resume(); }
  };
})(typeof window !== 'undefined' ? window : globalThis);

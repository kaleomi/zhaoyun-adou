// 无头对战模拟：node tools/sim.js [局数] [段位] [我方难度] [对手难度]
// 用来调数值：看对局时长、谁赢、打到第几波
const path = require('path');
const root = path.join(__dirname, '..', 'js');
['util.js', 'data.js', 'battle.js', 'ai.js'].forEach(f => require(path.join(root, f)));
const G = globalThis.G;

function play(seed, rankIdx, d0, d1, opts = {}) {
  const rng = G.makeRng(seed * 7 + 3);
  const L0 = opts.l0 || G.makeAILoadout(rankIdx, rng);
  const L1 = G.makeAILoadout(rankIdx, rng);
  const dm = [0.65, 0.8, 0.95, 1.05];
  const b = new G.Battle({
    seed, mapId: opts.map != null ? opts.map : G.RANKS[rankIdx].map, rankIdx, mode: opts.mode || 'pvp', introT: 0.5, dmgNumbers: false, weather: opts.weather || G.WEATHERS[seed % G.WEATHERS.length].id,
    sides: [
      { name: 'P', isAI: true, difficulty: d0, deck: L0.deck, weapons: L0.weapons, cards: L0.cards, skills: L0.skills, dmgMult: opts.pm || 1 },
      { name: 'AI', isAI: true, difficulty: d1, deck: L1.deck, weapons: L1.weapons, cards: L1.cards, skills: L1.skills, dmgMult: dm[d1] }
    ]
  });
  const ais = [new G.AI(b, 0, d0, seed + 11)];
  if (b.sides[1]) ais.push(new G.AI(b, 1, d1, seed + 29));
  const dt = 1 / 30;
  let steps = 0;
  while (b.state !== 'over' && steps < 30 * 60 * 20) {
    ais.forEach(a => a.update(dt));
    b.update(dt);
    b.ev.length = 0;
    steps++;
  }
  const s0 = b.sides[0], s1 = b.sides[1];
  return { winner: b.winner, wave: b.wave, time: Math.round(b.t), h0: s0.hearts, h1: s1 ? s1.hearts : null,
    u0: s0.units.map(u => (u.kind === 'general' ? G.GEN[u.gen].name : (u.kind === 'part' ? G.GEN[u.gen].parts[u.part] : G.SOLDIERS[u.key].ch)) + u.lvl).join(' '),
    rec: s0.recruits, buns: Math.round(s0.buns) };
}
module.exports = { play };
if (require.main === module) {
  const n = +process.argv[2] || 10, rank = +process.argv[3] || 0, d0 = +(process.argv[4] || 3), d1 = +(process.argv[5] || 0);
  let wins = 0, waves = 0, times = 0;
  for (let i = 0; i < n; i++) {
    const r = play(i + 1, rank, d0, d1);
    if (r.winner === 0) wins++;
    waves += r.wave; times += r.time;
    if (i < 4) console.log(JSON.stringify(r));
  }
  console.log(`rank ${rank} d${d0} vs d${d1}: win ${wins}/${n}, avg wave ${(waves / n).toFixed(1)}, avg time ${(times / n / 60).toFixed(1)}min`);
}

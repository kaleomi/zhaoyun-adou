// 战役每关用 AI 打几遍，看通关率
const path = require('path');
['util.js', 'data.js', 'battle.js', 'ai.js'].forEach(f => require(path.join(__dirname, '..', 'js', f)));
const G = globalThis.G;
function midWeapons(deck, rar) {
  const w = {};
  deck.forEach(g => { const c = G.WEAPONS.filter(x => x.type === G.GEN[g].type && x.rarity === rar); w[g] = { id: c[0].id, star: 2 }; });
  return w;
}
const N = +(process.argv[2] || 6), rar = +(process.argv[3] || 1), diff = +(process.argv[4] || 3);
for (const lv of G.CAMPAIGN) {
  let wins = 0, waves = [];
  for (let i = 0; i < N; i++) {
    const deck = lv.rules.deck || ['zhaoyun', 'guanyu', 'zhangfei', 'liubei'];
    const b = new G.Battle({ seed: i * 17 + 3, mode: 'campaign', mapId: lv.map, rankIdx: 0, waves: lv.waves, hpMult: lv.hp * (+process.env.HPX || 1), rules: lv.rules, weather: lv.rules.weather || 'clear', introT: 0.3, dmgNumbers: false,
      sides: [{ isAI: true, deck, weapons: midWeapons(deck, rar), cards: ['kongcheng', 'huogong'] }] });
    const ai = new G.AI(b, 0, diff, i + 5);
    let st = 0;
    while (b.state !== 'over' && st < 30 * 60 * 20) { ai.update(1 / 30); b.update(1 / 30); b.ev.length = 0; st++; }
    if (b.winner === 0) wins++;
    waves.push(b.wave + (b.winner === 0 ? 'w' : 'L') + (b.winner === 0 ? b.sides[0].hearts : ''));
  }
  console.log(lv.id, lv.name.padEnd(6), 'wins', wins + '/' + N, waves.join(' '));
}

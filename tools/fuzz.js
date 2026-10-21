// 把每个武将配上每件同类兵器，各打一局，检查有没有报错、有没有 NaN
const path = require('path');
['util.js', 'data.js', 'battle.js', 'ai.js'].forEach(f => require(path.join(__dirname, '..', 'js', f)));
const G = globalThis.G;
let games = 0, errors = 0;
const gens = G.GENERALS.map(g => g.id);
for (const gid of gens) {
  const type = G.GEN[gid].type;
  const ws = G.WEAPONS.filter(w => w.type === type);
  for (const w of ws) {
    const deck = [gid];
    const weapons = { [gid]: { id: w.id, star: 3 } };
    const seed = games * 13 + 5;
    const b = new G.Battle({ seed, mapId: games % 4, rankIdx: 40, introT: 0.2, dmgNumbers: false,
      sides: [{ isAI: true, difficulty: 3, deck, weapons, supplies: { heart: 1, shovel: 1, promote: 1, buns: 1 }, cards: [G.CARDS[games % 8].id, G.CARDS[(games + 3) % 8].id], skills: [G.SKILLS[games % 6].id, G.SKILLS[(games + 2) % 6].id] },
              { isAI: true, difficulty: 2, deck: ['zhaoyun', 'guanyu', 'lvbu', 'diaochan'], weapons: {}, cards: ['jiedao', 'lianhuan'], skills: ['thunder', 'jvma'] }], weather: G.WEATHERS[games % 6].id });
    const ais = [new G.AI(b, 0, 3, seed), new G.AI(b, 1, 2, seed + 1)];
    let steps = 0, maxGen = 0;
    try {
      while (b.state !== 'over' && steps < 30 * 60 * 12) {
        ais.forEach(a => a.update(1 / 30)); b.update(1 / 30); b.ev.length = 0; steps++;
        for (const s of b.sides) for (const e of s.enemies) if (!isFinite(e.hp) || !isFinite(e.dist)) throw new Error('NaN enemy ' + JSON.stringify({ hp: e.hp, d: e.dist, ch: e.ch }));
        const g = b.sides[0].units.find(u => u.kind === 'general'); if (g) maxGen = Math.max(maxGen, g.lvl);
      }
    } catch (e) { errors++; console.log('ERR', gid, w.name, e.stack.split('\n').slice(0, 3).join(' | ')); }
    games++;
    if (games % 25 === 0) console.log(games, 'games ok; last', gid, w.name, 'wave', b.wave, 'genLvl', maxGen);
  }
}
console.log('done', games, 'games', errors, 'errors');

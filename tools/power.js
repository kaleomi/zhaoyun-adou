// 无尽模式下比较不同养成程度能撑几波
const path = require('path');
['util.js', 'data.js', 'battle.js', 'ai.js'].forEach(f => require(path.join(__dirname, '..', 'js', f)));
const G = globalThis.G;
function endless(deck, weapons, seed, rank, map) {
  const b = new G.Battle({ seed, mapId: map, rankIdx: rank, mode: 'endless', introT: 0.2, dmgNumbers: false, sides: [{ isAI: true, difficulty: 3, deck, weapons }] });
  const ai = new G.AI(b, 0, 3, seed + 3);
  let steps = 0;
  while (b.state !== 'over' && steps < 30 * 60 * 30) { ai.update(1 / 30); b.update(1 / 30); b.ev.length = 0; steps++; }
  return b.wave;
}
const decks = {
  'zy only, no weapon': [['zhaoyun'], {}],
  'zy + 短枪': [['zhaoyun'], { zhaoyun: { id: 10, star: 1 } }],
  '4 gens no weapons': [['zhaoyun', 'zhangfei', 'guanyu', 'liubei'], {}],
  '4 gens common': [['zhaoyun', 'zhangfei', 'guanyu', 'liubei'], { zhaoyun: { id: 10, star: 1 }, zhangfei: { id: 11, star: 1 }, guanyu: { id: 20, star: 1 }, liubei: { id: 31, star: 1 } }],
  '4 gens epic s3': [['zhaoyun', 'zhangfei', 'guanyu', 'liubei'], { zhaoyun: { id: 15, star: 3 }, zhangfei: { id: 16, star: 3 }, guanyu: { id: 28, star: 3 }, liubei: { id: 37, star: 3 } }],
  '4 gens legend s5': [['zhaoyun', 'zhangfei', 'guanyu', 'liubei'], { zhaoyun: { id: 19, star: 5 }, zhangfei: { id: 18, star: 5 }, guanyu: { id: 29, star: 5 }, liubei: { id: 40, star: 5 } }],
};
const rank = +(process.argv[2] || 0), N = +(process.argv[3] || 6);
for (const [name, [deck, w]] of Object.entries(decks)) {
  const ws = []; for (let i = 0; i < N; i++) ws.push(endless(deck, w, i * 31 + 1, rank, i % 4));
  console.log(name.padEnd(22), 'avg wave', (ws.reduce((a, b) => a + b) / N).toFixed(1), ws.join(','));
}

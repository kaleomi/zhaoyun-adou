/* 赵云与阿斗 · 游戏数据表
 * 纯数据，不依赖 DOM（战斗模拟在 node 里也能跑）。
 */
(function (root) {
  'use strict';
  var G = root.G = root.G || {};

  G.VERSION = '1.1.0';

  // ───────────────────────── 段位 ─────────────────────────
  // [名称, 胜利铜钱, 敌兵加血%, 对手兵器品质权重[5], 对手难度权重[4], 地图, 升段所需星]
  var RANK_ROWS = [
    ["军士.一",10,0,[5,1,0,0,0],[5,1,1,0],0,5],
    ["军士.二",14,0,[5,1,0,0,0],[4,2,2,1],0,5],
    ["军士.三",18,0,[5,1,0,0,0],[4,2,2,1],0,5],
    ["军士.四",22,0,[5,1,0,0,0],[4,2,2,1],0,5],
    ["军士.五",26,0,[5,1,0,0,0],[3,3,2,2],0,5],
    ["校尉.一",30,25,[4,4,2,0,0],[3,3,2,1],0,5],
    ["校尉.二",34,25,[4,4,2,0,0],[3,3,2,1],0,5],
    ["校尉.三",38,25,[4,4,2,0,0],[3,3,2,1],0,5],
    ["校尉.四",42,25,[4,4,2,0,0],[3,3,2,1],0,5],
    ["校尉.五",46,25,[4,4,2,0,0],[3,3,2,3],0,5],
    ["少将.一",50,50,[3,3,3,2,0],[3,4,2,1],1,5],
    ["少将.二",54,50,[3,3,3,2,0],[3,4,2,1],1,5],
    ["少将.三",58,50,[3,3,3,2,0],[3,4,2,1],1,5],
    ["少将.四",62,50,[3,3,3,2,0],[3,4,2,1],1,5],
    ["少将.五",66,50,[3,3,3,2,0],[3,2,3,3],1,5],
    ["中将.一",70,75,[0,3,4,2,2],[3,4,2,1],1,5],
    ["中将.二",74,75,[0,3,4,2,2],[3,4,2,1],1,5],
    ["中将.三",78,75,[0,3,4,2,2],[3,4,2,1],1,5],
    ["中将.四",82,75,[0,3,4,2,2],[3,4,2,1],1,5],
    ["中将.五",86,75,[0,3,4,2,2],[2,3,3,3],1,5],
    ["上将.一",90,100,[0,2,4,3,2],[3,4,2,1],2,5],
    ["上将.二",94,100,[0,2,4,3,2],[3,4,2,1],2,5],
    ["上将.三",98,100,[0,2,4,3,2],[3,4,2,1],2,5],
    ["上将.四",102,100,[0,2,4,3,2],[3,4,2,1],2,5],
    ["上将.五",106,100,[0,2,4,3,2],[2,2,4,3],2,5],
    ["大将.一",110,125,[0,1,4,4,2],[3,4,2,1],2,5],
    ["大将.二",114,125,[0,1,4,4,2],[3,4,2,1],2,5],
    ["大将.三",118,125,[0,1,4,4,2],[3,4,2,1],2,5],
    ["大将.四",122,125,[0,1,4,4,2],[3,4,2,1],2,5],
    ["大将.五",126,125,[0,1,4,4,2],[1,2,5,3],2,5],
    ["都督.一",130,150,[0,0,3,5,3],[2,4,2,2],3,5],
    ["都督.二",134,150,[0,0,3,5,3],[2,4,2,2],3,5],
    ["都督.三",138,150,[0,0,3,5,3],[2,4,2,2],3,5],
    ["都督.四",142,150,[0,0,3,5,3],[2,4,2,2],3,5],
    ["都督.五",146,150,[0,0,3,5,3],[1,2,5,3],3,5],
    ["诸侯.一",150,175,[0,0,2,5,4],[2,2,4,2],3,5],
    ["诸侯.二",154,175,[0,0,2,5,4],[2,2,4,2],3,5],
    ["诸侯.三",158,175,[0,0,2,5,4],[2,2,4,2],3,5],
    ["诸侯.四",162,175,[0,0,2,5,4],[2,2,4,2],3,5],
    ["诸侯.五",166,175,[0,0,2,5,4],[1,2,5,3],3,5],
    ["霸主.一",170,200,[0,0,0,6,5],[1,2,4,3],0,5],
    ["霸主.二",174,200,[0,0,0,6,5],[1,2,4,3],0,5],
    ["霸主.三",178,200,[0,0,0,6,5],[1,2,4,3],1,5],
    ["霸主.四",182,200,[0,0,0,6,5],[1,2,4,3],1,5],
    ["霸主.五",186,200,[0,0,0,6,5],[1,2,4,3],2,5],
    ["君主.一",190,225,[0,0,0,4,7],[1,2,3,4],2,5],
    ["君主.二",194,225,[0,0,0,4,7],[1,2,3,4],3,5],
    ["君主.三",198,225,[0,0,0,4,7],[1,2,3,4],3,5],
    ["君主.四",202,225,[0,0,0,4,7],[1,2,3,4],0,5],
    ["君主.五",206,225,[0,0,0,4,7],[1,1,2,6],0,5],
    ["大帝",250,250,[0,0,0,2,9],[1,1,2,6],1,25]
  ];
  G.RANKS = RANK_ROWS.map(function (r, i) {
    var parts = r[0].split('.');
    return {
      idx: i, name: r[0], tier: parts[0], sub: parts[1] || '',
      reward: r[1] * 5, hpAdd: r[2] / 100, aiWeapon: r[3], aiDiff: r[4],
      map: r[5], stars: r[6]
    };
  });
  G.TIERS = ['军士', '校尉', '少将', '中将', '上将', '大将', '都督', '诸侯', '霸主', '君主', '大帝'];

  // ───────────────────────── 地图 ─────────────────────────
  // 8 列 × 10 行。只写我方（下半场）的行军路线与初始营地，
  // 对手的一半由 180° 旋转得到：(x, y) → (7 - x, 9 - y)。
  G.MAP_W = 8; G.MAP_H = 10;
  G.MAPS = [
    {
      id: 0, name: '巨鹿', sub: '黄巾初起', theme: 'plain',
      path: [[0, 9], [0, 6], [4, 6], [4, 4], [7, 4], [7, 9]],
      build: [[2, 7], [3, 7], [4, 7], [2, 8], [3, 8], [4, 8]],
      colors: { bg: '#efe4d0', grass: '#7fae9a', grass2: '#6f9e8a', road: '#c8aa92', road2: '#b9997f', build: '#fbf8f1', wall: '#5a5550', sky: '#e9dcc3' }
    },
    {
      id: 1, name: '云梦泽', sub: '烟波浩渺', theme: 'marsh',
      path: [[0, 9], [0, 5], [3, 5], [3, 7], [5, 7], [5, 5], [7, 5], [7, 9]],
      build: [[1, 7], [2, 7], [4, 5], [4, 6], [6, 6], [6, 7]],
      colors: { bg: '#eae6d6', grass: '#9cbf93', grass2: '#86ab80', road: '#cdb48f', road2: '#bea27c', build: '#fbf8f1', wall: '#4f5a55', sky: '#e3e6d8' }
    },
    {
      id: 2, name: '虎牢关', sub: '三英战吕布', theme: 'pass',
      path: [[0, 9], [0, 5], [5, 5], [5, 7], [2, 7], [2, 9], [7, 9]],
      build: [[2, 6], [3, 6], [4, 6], [3, 8], [4, 8], [5, 8]],
      colors: { bg: '#ece0cc', grass: '#a59c7c', grass2: '#948b6c', road: '#bfb0a0', road2: '#ab9c8c', build: '#fbf8f1', wall: '#4c4440', sky: '#e8d8bd' }
    },
    {
      id: 3, name: '赤壁', sub: '火烧连营', theme: 'river',
      path: [[0, 5], [4, 5], [4, 7], [1, 7], [1, 9], [7, 9]],
      build: [[1, 6], [2, 6], [3, 6], [2, 8], [3, 8], [4, 8]],
      colors: { bg: '#efe2cf', grass: '#7ea5b6', grass2: '#6d94a6', road: '#b9906a', road2: '#a67d58', build: '#fbf8f1', wall: '#463a34', sky: '#f0d6bd' }
    },
    {
      id: 4, name: '长坂坡', sub: '单骑救主', theme: 'slope',
      path: [[0, 5], [6, 5], [6, 7], [1, 7], [1, 9], [7, 9]],
      build: [[2, 6], [3, 6], [4, 6], [3, 8], [4, 8], [5, 8]],
      colors: { bg: '#ede0c6', grass: '#a3b07a', grass2: '#8f9d68', road: '#c9a782', road2: '#b5926c', build: '#fbf8f1', wall: '#4e4232', sky: '#efd9b4' }
    }
  ];
  G.LADDER_MAPS = 4; // 天梯只用前四张图

  // ───────────────────────── 兵种 ─────────────────────────
  // type: 0 弓 1 枪 2 刀 3 剑；骑兵 -1；农夫无攻击
  G.SOLDIERS = {
    dao:   { ch: '刀', name: '刀兵', atk: 'slash',  type: 2, dmg: 12, cd: 1.0,  range: 1.55, w: 24, desc: '近身劈砍，刀风会波及目标身旁的敌人。' },
    qiang: { ch: '枪', name: '枪兵', atk: 'thrust', type: 1, dmg: 13, cd: 1.1,  range: 2.05, w: 22, desc: '长枪突刺，可刺穿目标身后的敌人，无视甲胄。' },
    gong:  { ch: '弓', name: '弓兵', atk: 'arrow',  type: 0, dmg: 8,  cd: 0.8,  range: 3.0,  w: 22, desc: '射程最远，出手最快。' },
    qi:    { ch: '骑', name: '骑兵', atk: 'charge', type: -1, dmg: 11, cd: 0.85, range: 1.65, w: 20, desc: '每第三击发起冲锋，造成 2.5 倍伤害并把敌人撞退。' },
    nong:  { ch: '农', name: '农夫', atk: 'none', farmer: true, w: 6, desc: '不会打仗，但每 10 秒能蒸出一笼馒头。等级越高产量越大。' }
  };
  G.SOLDIER_KEYS = ['dao', 'qiang', 'gong', 'qi', 'nong'];
  G.MAX_LVL = 7;
  G.MAX_GEN_LVL = 5;
  G.lvlMult = function (lvl) { return Math.pow(2.1, lvl - 1); };
  G.genLvlMult = function (lvl) { return Math.pow(1.85, lvl - 1); };
  G.farmerYield = function (lvl) { return [0, 2, 3, 6, 12, 24, 40, 64][lvl] || 2; };

  G.WTYPE = ['弓', '枪', '刀', '剑'];
  G.WTYPE_ATK = ['arrow', 'thrust', 'slash', 'sword'];
  // 武将基础属性（按兵器类型）
  G.GEN_BASE = [
    { dmg: 22, cd: 0.72, range: 3.2 },  // 弓
    { dmg: 30, cd: 0.95, range: 2.15 }, // 枪
    { dmg: 34, cd: 1.0,  range: 1.65 }, // 刀
    { dmg: 26, cd: 0.7,  range: 1.9 }   // 剑
  ];

  // ───────────────────────── 武将 ─────────────────────────
  // unlock: {rank: 段位序号} 或 {frag: 需要的将魂数}
  G.GENERALS = [
    { id: 'zhaoyun', name: '赵云', parts: ['赵', '云'], type: 1, unlock: { rank: 0 }, title: '常山赵子龙',
      skill: '七进七出', desc: '每 9 秒化作银枪，逆着行军路线冲杀一遍，对沿途所有敌人造成 3 倍伤害。普攻可刺穿两名敌人。' },
    { id: 'zhangfei', name: '张飞', parts: ['张', '飞'], type: 1, unlock: { rank: 2 }, title: '燕人张翼德',
      skill: '当阳怒吼', desc: '每 10 秒一声断喝，震晕 2.5 格内的敌人 1.5 秒，并造成 2 倍伤害。' },
    { id: 'guanyu', name: '关羽', parts: ['关', '羽'], type: 2, unlock: { rank: 5 }, title: '美髯公',
      skill: '青龙斩', desc: '每第三击跃起劈斩，对 1.3 格范围造成 3 倍伤害。' },
    { id: 'liubei', name: '刘备', parts: ['刘', '备'], type: 3, unlock: { rank: 7 }, title: '仁德之君',
      skill: '仁德', desc: '周围一圈友军攻速 +25%。射程内每击杀一名敌人额外得 1 个馒头。' },
    { id: 'huangzhong', name: '黄忠', parts: ['黄', '忠'], type: 0, unlock: { rank: 10 }, title: '老当益壮',
      skill: '百步穿杨', desc: '射程 +1.5 格，25% 几率暴击造成 3 倍伤害。' },
    { id: 'machao', name: '马超', parts: ['马', '超'], type: 1, unlock: { rank: 12 }, title: '锦马超',
      skill: '西凉铁骑', desc: '20% 几率从地下戳出枪阵，对目标周围造成 2 倍伤害并减速。' },
    { id: 'xuchu', name: '许褚', parts: ['许', '褚'], type: 2, unlock: { rank: 15 }, title: '虎痴',
      skill: '裸衣', desc: '每 12 秒脱甲狂战 4 秒，攻速翻倍，并为身边友军提速 20%。' },
    { id: 'dianwei', name: '典韦', parts: ['典', '韦'], type: 2, unlock: { rank: 17 }, title: '古之恶来',
      skill: '双戟', desc: '每次攻击同时劈中两名敌人，并把它们击退。' },
    { id: 'caocao', name: '曹操', parts: ['曹', '操'], type: 3, unlock: { rank: 20 }, title: '乱世奸雄',
      skill: '挟令', desc: '射程内的敌人移动速度 -25%。每击杀 5 名敌人得 3 个馒头。' },
    { id: 'kongming', name: '孔明', parts: ['孔', '明'], type: 0, unlock: { rank: 23 }, title: '卧龙',
      skill: '借东风', desc: '每次射出 3 支箭。每 15 秒借来东风，全体友军攻速 +30%，持续 5 秒。' },
    { id: 'lvbu', name: '吕布', parts: ['吕', '布'], type: 2, unlock: { frag: 8 }, title: '人中吕布',
      skill: '无双', desc: '15% 几率把敌人挑起摔下，造成 5 倍伤害并震晕周围敌人。击败 Boss 吕布可获得将魂。' },
    { id: 'zhouyu', name: '周瑜', parts: ['周', '瑜'], type: 3, unlock: { rank: 30 }, title: '美周郎',
      skill: '火烧连营', desc: '每第三击点燃目标脚下的道路，烈火持续 4 秒灼烧经过的敌人。' },
    { id: 'shangxiang', name: '尚香', parts: ['尚', '香'], type: 0, unlock: { frag: 5 }, title: '弓腰姬',
      skill: '枭姬', desc: '箭矢命中后会弹射两次。击败 Boss 孙尚香可获得将魂。' },
    { id: 'zhenfu', name: '甄宓', parts: ['甄', '宓'], type: 3, unlock: { frag: 6 }, title: '洛神',
      skill: '凌波', desc: '每 8 秒掀起一道水波沿路线冲刷，造成伤害并减速 40%。击败 Boss 甄宓可获得将魂。' },
    { id: 'diaochan', name: '貂蝉', parts: ['貂', '蝉'], type: 3, unlock: { frag: 9 }, title: '闭月',
      skill: '离间', desc: '攻击有 15% 几率魅惑敌人，使其掉头倒退 2 秒。击败 Boss 貂蝉可获得将魂。' }
  ];
  G.GEN = {};
  G.GENERALS.forEach(function (g, i) { g.idx = i; G.GEN[g.id] = g; });
  G.DECK_SIZE = 4;

  // ───────────────────────── 兵器 ─────────────────────────
  // id, 类型, 名称, 品质, 攻击加成, 专属武将, 碎片数, 说明
  var W = [
    [0, 0, '短弓', 0, 1, '', 1, '一把朴实无华的短弓。'],
    [1, 0, '长弓', 1, 2, '', 2, '射程 +0.5 格。'],
    [2, 0, '铁弓', 1, 2, '', 2, '10% 几率把敌人击退。'],
    [3, 0, '角弓', 2, 3, '', 3, '连续射同一个敌人时，每射一箭攻速 +5%。'],
    [4, 0, '射雕弓', 3, 4, '', 4, '10% 几率放出一只苍鹰，沿路线低飞，啄伤沿途敌人。'],
    [5, 0, '铁胎弓', 3, 5, 'huangzhong', 4, '10% 几率射出火龙，点燃一段道路。专属：黄忠的暴击率翻倍。'],
    [6, 0, '神臂弓', 3, 5, '', 4, '连续射同一个敌人时，每射一箭攻速 +15%。'],
    [7, 0, '霸王弓', 4, 6, '', 5, '箭矢命中后有 50% 几率弹射到另一名敌人。'],
    [8, 0, '落日弓', 4, 6, '', 5, '射程翻倍，目标越远伤害越高。'],
    [9, 0, '诸葛连弩', 4, 6, 'kongming', 5, '每射 10 箭，追加 10 支火箭随机射向敌人。专属：孔明的火箭翻倍。'],
    [10, 1, '短枪', 0, 1, '', 1, '一把朴实无华的短枪。'],
    [11, 1, '长枪', 1, 2, '', 2, '射程 +0.5 格。'],
    [12, 1, '铁枪', 1, 3, '', 2, '初次攻击某个敌人时，20% 几率从地下戳出一个枪阵。'],
    [13, 1, '大戟', 2, 4, '', 3, '射程 +1 格。'],
    [14, 1, '钩镰枪', 2, 4, '', 3, '初次攻击某个敌人时，20% 几率把它勾倒在地 1 秒。'],
    [15, 1, '点钢枪', 3, 5, '', 4, '每击杀一个敌人，攻速 +50%，持续 2 秒。'],
    [16, 1, '梨花枪', 3, 6, '', 4, '每击杀一个敌人，飞出 8 朵梨花随机打击敌人。'],
    [17, 1, '虎头湛金枪', 3, 6, 'machao', 4, '初次攻击某个敌人时，20% 几率戳出 3 个枪阵。专属：马超可戳出 5 个。'],
    [18, 1, '丈八蛇矛', 4, 9, 'zhangfei', 5, '在路上盘踞灵蛇撕咬敌人，武将每升一级多一条。专属：张飞怒吼后灵蛇攻速翻倍 6 秒。'],
    [19, 1, '龙胆亮银枪', 4, 10, 'zhaoyun', 5, '每次攻击 10% 几率召唤飞枪，打击我方路线上所有敌人。专属：赵云的飞枪伤害翻倍。'],
    [20, 2, '短刀', 0, 1, '', 1, '一把朴实无华的短刀。'],
    [21, 2, '长刀', 1, 2, '', 2, '射程 +0.5 格。'],
    [22, 2, '铁刀', 1, 3, '', 2, '连续砍同一个敌人时，每一刀攻速 +5%。'],
    [23, 2, '狼牙棒', 2, 4, '', 3, '10% 几率发出狼嚎，周围友军攻速 +20%，持续 10 秒。'],
    [24, 2, '三尖刀', 2, 4, '', 3, '每砍 10 刀，劈出一道沿路线飞行的刀气。'],
    [25, 2, '铁蒺藜骨朵', 2, 5, '', 3, '10% 几率把敌人砸晕 1 秒。'],
    [26, 2, '古锭刀', 3, 6, '', 4, '初次砍中某个敌人时，得 1 个馒头。'],
    [27, 2, '虎啸战刀', 3, 7, 'xuchu', 4, '10% 几率发出虎啸，周围友军攻速 +30%，持续 10 秒。专属：许褚的虎啸范围翻倍。'],
    [28, 2, '七星刀', 3, 8, '', 4, '10% 几率引来流星雨。'],
    [29, 2, '青龙偃月刀', 4, 10, 'guanyu', 5, '武将每斩杀一个敌人，放出数团刀气无差别攻击敌人。专属：关羽每次青龙斩都会放出刀气。'],
    [30, 2, '方天画戟', 4, 10, 'lvbu', 5, '12% 几率把敌人挑起摔下，造成 5 倍伤害并砸倒一片。专属：吕布的几率翻倍。'],
    [31, 3, '短剑', 0, 1, '', 1, '一把朴实无华的短剑。'],
    [32, 3, '长剑', 1, 2, '', 2, '射程 +0.5 格。'],
    [33, 3, '铁剑', 1, 3, '', 2, '攻击力额外 +3。'],
    [34, 3, '巨阙剑', 2, 4, '', 3, '每出 10 剑触发君子剑（剑气扫过范围内所有敌人）或小人剑（剧毒）。'],
    [35, 3, '龙泉剑', 2, 5, '', 3, '每出 10 剑触发君子剑或小人剑，威力更强。'],
    [36, 3, '龙渊剑', 3, 6, '', 4, '每出 10 剑触发君子剑或小人剑，威力更强。'],
    [37, 3, '双股剑', 3, 6, 'liubei', 4, '每出 10 剑触发君子剑或小人剑。专属：刘备每 5 剑触发一次。'],
    [38, 3, '青釭剑', 3, 7, 'caocao', 4, '每出 10 剑触发君子剑或小人剑。专属：曹操的剑气无视甲胄。'],
    [39, 3, '七星剑', 3, 8, '', 4, '每出 10 剑触发君子剑或小人剑，威力极强。'],
    [40, 3, '倚天剑', 4, 9, '', 5, '每出 10 剑触发君子剑或小人剑，威力极强。'],
    [41, 3, '莫邪', 4, 9, '', 5, '每出 10 剑触发君子剑或小人剑，威力极强。'],
    [42, 3, '干将', 4, 9, '', 5, '每出 10 剑触发君子剑或小人剑，威力极强。'],
    [43, 3, '轩辕剑', 4, 10, '', 5, '每击杀 5 名敌人，召唤圣剑飞越战场，有几率秒杀非 Boss 敌人。'],
    [44, 3, '独孤九剑', 4, 9, '', 5, '每次击杀召唤一柄飞剑在路上穿行，九剑之后冷却 10 秒。'],
    [45, 0, '落月弓', 3, 4, '', 4, '被射中的敌人笼罩月光，5 秒后遭月牙处决。目标越近，射速越快。']
  ];
  G.WEAPONS = W.map(function (r) {
    return { id: r[0], type: r[1], name: r[2], rarity: r[3], atk: r[4], ex: r[5], frag: r[6], desc: r[7] };
  });
  G.WEAPON = {};
  G.WEAPONS.forEach(function (w) { G.WEAPON[w.id] = w; });
  G.RARITY = ['普通', '优秀', '精良', '卓越', '传说'];
  G.RARITY_COLOR = ['#8a8a8a', '#3f9b4a', '#2f74c0', '#9b3fd1', '#e0861a'];
  G.weaponAtk = function (w, star) { return (w.atk + (w.id === 33 ? 3 : 0)) * 5 * (1 + 0.15 * ((star || 1) - 1)); };
  G.WEAPON_MAX_STAR = 5;
  G.weaponStarCost = function (w, star) { return w.frag * star; }; // 升到 star+1 所需碎片

  // ───────────────────────── 敌军 ─────────────────────────
  G.ENEMIES = {
    zei: { ch: '贼', name: '山贼', hp: 1.0, spd: 1.0, bun: 1, desc: '最常见的毛贼。' },
    kou: { ch: '寇', name: '流寇', hp: 0.6, spd: 1.6, bun: 1, desc: '跑得飞快。' },
    fei: { ch: '匪', name: '悍匪', hp: 2.6, spd: 0.68, bun: 2, desc: '皮糙肉厚，走得慢。' },
    dao: { ch: '盗', name: '飞盗', hp: 0.9, spd: 1.35, bun: 3, desc: '身上揣着馒头，打死掉 3 个。' },
    wu:  { ch: '巫', name: '妖巫', hp: 1.2, spd: 0.9, bun: 2, heal: 0.03, desc: '不停给身边的同伙回血，优先除掉。' },
    jia: { ch: '甲', name: '甲士', hp: 1.6, spd: 0.85, bun: 2, armor: 0.4, desc: '身披重甲，伤害减免 40%，枪兵与武将的枪可以无视。' },
    jin: { ch: '巾', name: '黄巾', hp: 0.75, spd: 1.15, bun: 1, desc: '头裹黄巾的乱民，人多势众。' }
  };
  G.BOSSES = {
    huaxiong: { name: '华雄', hp: 16, spd: 0.55, desc: '每 6 秒斩将：把射程内最强的兵定身 3 秒。' },
    zhangjiao: { name: '张角', hp: 19, spd: 0.5, desc: '每 7 秒召来黑云，云下的兵射程大减；还会召唤黄巾贼。' },
    dongzhuo: { name: '董卓', hp: 26, spd: 0.42, desc: '肥硕难缠，不挨打时快速回血；每 8 秒用铁链锁住两个兵。' },
    lvbu: { name: '吕布', hp: 22, spd: 0.6, desc: '无视晕眩与减速，每 6 秒策马冲出两格。' },
    shangxiang: { name: '孙尚香', hp: 20, spd: 0.6, desc: '每 5 秒放箭射晕一个兵 2 秒。击败可获得将魂。', drop: 'shangxiang' },
    zhenfu: { name: '甄宓', hp: 20, spd: 0.62, desc: '凌波微步，时不时隐去身形无法被选中。击败可获得将魂。', drop: 'zhenfu' },
    diaochan: { name: '貂蝉', hp: 20, spd: 0.65, desc: '每 5 秒魅惑一个兵，使其 3 秒内无法出手。击败可获得将魂。', drop: 'diaochan' },
    caoren: { name: '曹仁', hp: 24, spd: 0.48, desc: '八门金锁阵：每 7 秒给身边的贼兵套上铁甲，伤害减半 4 秒。' }
  };
  G.BOSS_ORDER = ['huaxiong', 'zhangjiao', 'dongzhuo', 'lvbu'];
  G.SPECIAL_BOSSES = ['shangxiang', 'zhenfu', 'diaochan'];

  // ───────────────────────── 战场道具（征兵时可能刷出） ─────────────────────────
  G.PROPS = {
    shovel:  { ch: '铲', name: '铁铲', target: 'grass', w: 40, desc: '拖到我方草地上，挖出一块新营地。' },
    promote: { ch: '令', name: '晋升令', target: 'unit', w: 18, desc: '拖到一个兵或武将身上，直接升一级。' },
    ink:     { ch: '砚', name: '砚台', target: 'soldier', w: 16, desc: '把兵泡进墨里，变成另一种兵，等级不变。' },
    mine:    { ch: '雷', name: '地雷', target: 'road', w: 14, desc: '埋在我方路上，炸翻第一个踩上去的敌人和周围一圈。' },
    drum:    { ch: '鼓', name: '战鼓', target: 'any', w: 9, desc: '擂响战鼓，全军攻速 +40%，持续 8 秒。' },
    pill:    { ch: '丹', name: '续命丹', target: 'any', w: 3, desc: '阿斗吃下，回复一颗心。' }
  };
  G.PROP_KEYS = Object.keys(G.PROPS);

  // ───────────────────────── 商店 ─────────────────────────
  // 出战前可以带入战斗的军需
  G.SUPPLIES = [
    { id: 'heart', ch: '丹', name: '续命金丹', price: 240, desc: '阿斗开局多一颗心（4 颗）。' },
    { id: 'buns', ch: '馍', name: '大补馒头', price: 120, desc: '开局多 40 个馒头。' },
    { id: 'shovel', ch: '铲', name: '工兵铲', price: 150, desc: '开局多挖两块营地。' },
    { id: 'recruit', ch: '募', name: '征兵令', price: 140, desc: '前 3 次征兵免费。' },
    { id: 'promote', ch: '令', name: '晋升令', price: 160, desc: '开局获得一张晋升令（放在军需栏，随时可用）。' }
  ];
  G.CHESTS = [
    { id: 'small', name: '兵器匣', price: 300, draws: 3, boost: 0, desc: '3 块兵器碎片' },
    { id: 'big', name: '神兵宝箱', price: 1200, draws: 6, boost: 1.5, desc: '6 块碎片，高品质几率大增' }
  ];

  // ───────────────────────── 字阵羁绊 ─────────────────────────
  // 相邻两字（横读、竖读都算）连成词
  G.WORD_BONDS = [
    { a: 'dao', b: 'qiang', name: '刀枪', desc: '刀枪齐备：两者伤害 +20%', dmg: 0.2 },
    { a: 'gong', b: 'qi', name: '弓骑', desc: '弓骑并进：两者攻速 +20%', spd: 0.2 },
    { a: 'qiang', b: 'qi', name: '枪骑', desc: '长枪铁骑：骑兵每两击就冲锋一次，枪兵射程 +0.3', lancer: true },
    { a: 'nong', b: '*', name: '屯田', desc: '兵农合一：农夫身边每多一个兵，产量 +25%', tuntian: true }
  ];
  G.FORMATIONS = [
    { id: 'snake', name: '长蛇阵', desc: '三个以上同种兵连成一条直线：伤害 +25%', dmg: 0.25 },
    { id: 'four', name: '四象阵', desc: '刀枪弓骑四种兵围成田字：伤害与攻速各 +20%', dmg: 0.2, spd: 0.2 }
  ];
  // 武将同时在场（不必相邻）
  G.GEN_BONDS = [
    { id: 'taoyuan', name: '桃园结义', gens: ['liubei', 'guanyu', 'zhangfei'], need: 3, desc: '刘关张同在：三人伤害 +35%', dmg: 0.35 },
    { id: 'wuhu', name: '五虎上将', gens: ['guanyu', 'zhangfei', 'zhaoyun', 'machao', 'huangzhong'], need: 3, desc: '五虎到三位：在场的五虎攻速 +20%；五位齐聚 +45%', spd: 0.2, spd5: 0.45 },
    { id: 'sangu', name: '三顾茅庐', gens: ['liubei', 'kongming'], need: 2, desc: '刘备与孔明：借东风冷却缩短到 9 秒，两人攻速 +15%', spd: 0.15 },
    { id: 'lianhuan', name: '连环计', gens: ['lvbu', 'diaochan'], need: 2, desc: '吕布与貂蝉：吕布伤害 +50%，貂蝉魅惑几率翻倍', dmg: 0.5, only: 'lvbu' },
    { id: 'huwei', name: '虎卫', gens: ['caocao', 'dianwei', 'xuchu'], need: 2, req: 'caocao', desc: '曹操带着典韦或许褚：护卫伤害 +30%，曹操减速光环加强到 40%', dmg: 0.3 },
    { id: 'lianyin', name: '孙刘联姻', gens: ['shangxiang', 'liubei'], need: 2, desc: '尚香与刘备：两人攻速 +25%', spd: 0.25 },
    { id: 'jisheng', name: '既生瑜', gens: ['zhouyu', 'kongming'], need: 2, desc: '周瑜与孔明：火焰持续时间翻倍，周瑜每两击就点火', dmg: 0.1 },
    { id: 'tongque', name: '铜雀春深', gens: ['zhenfu', 'caocao'], need: 2, desc: '甄宓与曹操：凌波冷却缩短到 5 秒', dmg: 0.1 }
  ];

  // ───────────────────────── 天气与随机事件 ─────────────────────────
  G.WEATHERS = [
    { id: 'clear', name: '晴', ch: '晴', w: 3, desc: '风和日丽，没有特殊效果。' },
    { id: 'fog', name: '大雾', ch: '雾', w: 2, desc: '大雾弥漫：所有兵射程 -20%。' },
    { id: 'wind', name: '东风', ch: '风', w: 2, desc: '东风骤起：弓兵与弓类武将射程 +0.5，火焰持续时间翻倍。' },
    { id: 'rain', name: '暴雨', ch: '雨', w: 2, desc: '大雨滂沱：贼兵移动速度 -15%，火焰持续时间减半。' },
    { id: 'night', name: '夜袭', ch: '夜', w: 2, desc: '夜色掩护：每波贼兵多两成，但每打死一个多给 1 个馒头。' },
    { id: 'heat', name: '酷暑', ch: '暑', w: 1, desc: '烈日当头：兵的攻速 -10%，农夫产量翻倍。' }
  ];
  G.WEATHER = {};
  G.WEATHERS.forEach(function (w) { G.WEATHER[w.id] = w; });
  G.EVENTS = [
    { id: 'grain', name: '天降粮草', desc: '双方各得 30 个馒头。' },
    { id: 'volunteer', name: '流民投军', desc: '双方各有一名 2 级兵自己站上空营地。' },
    { id: 'plague', name: '疫病流行', desc: '场上所有贼兵失去三成血量。' },
    { id: 'spy', name: '奸细作乱', desc: '双方各有两个兵被扰乱 4 秒。' },
    { id: 'levy', name: '朝廷征兵', desc: '双方各免费征兵一次。' },
    { id: 'cheer', name: '将士用命', desc: '双方全军攻速 +25%，持续 15 秒。' }
  ];
  G.EVENT = {};
  G.EVENTS.forEach(function (e) { G.EVENT[e.id] = e; });

  // ───────────────────────── 锦囊 ─────────────────────────
  G.CARD_SLOTS = 2;
  G.CARDS = [
    { id: 'kongcheng', name: '空城计', ch: '空', unlock: { rank: 0 }, desc: '我方路上的敌人原地发呆 5 秒（Boss 只减速一半）。' },
    { id: 'huogong', name: '火攻', ch: '火', unlock: { rank: 0 }, desc: '我方整条路燃起大火 6 秒，灼烧路上所有敌人。' },
    { id: 'caochuan', name: '草船借箭', ch: '箭', unlock: { rank: 5 }, desc: '弓兵和弓类武将攻速翻倍 10 秒，再白得 20 个馒头。' },
    { id: 'kurou', name: '苦肉计', ch: '苦', unlock: { camp: 'c2' }, desc: '阿斗掉一颗心（至少留一颗），换来 80 个馒头和全军伤害 +40%（15 秒）。' },
    { id: 'jiedao', name: '借刀杀人', ch: '借', unlock: { rank: 15 }, desc: '把我方路上血最多的 4 个贼兵（不含 Boss）丢到对手路上；单人模式下直接消灭。' },
    { id: 'diaohu', name: '调虎离山', ch: '调', unlock: { camp: 'c5' }, desc: '把我方路上走得最远的 3 个敌人（含 Boss）赶回起点。' },
    { id: 'lianhuan', name: '连环计', ch: '环', unlock: { camp: 'c7' }, desc: '10 秒内，打在任一敌人身上的伤害，会有一成传给其他每个敌人（最多 8 个）。' },
    { id: 'andu', name: '暗度陈仓', ch: '陈', unlock: { camp: 'c8' }, desc: '立刻免费征兵一次，这次的 5 个字都是 2 级。' }
  ];
  G.CARD = {};
  G.CARDS.forEach(function (c) { G.CARD[c.id] = c; });

  // ───────────────────────── 长坂坡战役 ─────────────────────────
  // 单人闯关：守住 waves 波即过关。rules 覆盖默认设置。
  G.CAMPAIGN = [
    { id: 'c1', name: '桃园结义', map: 0, waves: 6, hp: 1.1,
      story: '涿郡桃园，刘关张焚香结拜。黄巾贼已到城外，兄弟三人第一次并肩御敌。',
      tip: '三兄弟同时在场会触发「桃园结义」，三人伤害大增。',
      rules: { deck: ['liubei', 'guanyu', 'zhangfei'], buns: 30, weather: 'clear' },
      reward: { gold: 200, frags: 2 } },
    { id: 'c2', name: '黄巾之乱', map: 0, waves: 8, hp: 1.0,
      story: '张角自称天公将军，三十六方同时起事。巨鹿城下，黄巾贼漫山遍野。',
      tip: '黄巾跑得快、数量多，多放刀兵波及成群的敌人。',
      rules: { mix: { jin: 8, zei: 2 }, bosses: { 8: 'zhangjiao' }, weather: 'clear' },
      reward: { gold: 260, frags: 2, card: 'kurou' } },
    { id: 'c3', name: '温酒斩华雄', map: 2, waves: 5, hp: 2.2,
      story: '华雄连斩联军数将，关羽请战：「酒且斟下，某去便来。」',
      tip: '只能召唤关羽。华雄会在第三波和第五波出现，阿斗只有两颗心。',
      rules: { deck: ['guanyu'], hearts: 2, bosses: { 3: 'huaxiong', 5: 'huaxiong' } },
      reward: { gold: 300, frags: 3 } },
    { id: 'c4', name: '三英战吕布', map: 2, waves: 10, hp: 1.4,
      story: '虎牢关前，吕布方天画戟所向无敌。刘关张三人联手，与他大战五十回合。',
      tip: '吕布无视控制、还会冲锋。凑齐桃园结义，集中火力。',
      rules: { deck: ['liubei', 'guanyu', 'zhangfei'], bosses: { 5: 'lvbu', 10: 'lvbu' }, bossHp: 1.4 },
      reward: { gold: 360, frags: 3, souls: { lvbu: 3 } } },
    { id: 'c5', name: '单骑救主', map: 4, waves: 10, hp: 1.3,
      story: '长坂坡上曹军百万，赵子龙怀抱阿斗，七进七出，杀出重围。',
      tip: '只有赵云出战，阿斗只剩一口气。七进七出的冷却缩短了。',
      rules: { deck: ['zhaoyun'], hearts: 1, zyBoost: true, weather: 'clear' },
      reward: { gold: 420, frags: 3, card: 'diaohu' } },
    { id: 'c6', name: '当阳桥', map: 4, waves: 8, hp: 3.5,
      story: '张飞据水断桥，横矛立马：「燕人张翼德在此，谁敢来决一死战！」',
      tip: '只能召唤张飞。贼兵多出六成，但走得慢。',
      rules: { deck: ['zhangfei'], countMult: 1.6, enemySpd: 0.85 },
      reward: { gold: 420, frags: 3 } },
    { id: 'c7', name: '草船借箭', map: 3, waves: 8, hp: 5,
      story: '江上大雾，孔明扎草人于船上，擂鼓呐喊，一夜借得十万支箭。',
      tip: '大雾天，只能招弓兵和农夫。孔明的连弩是主力。',
      rules: { deck: ['kongming'], soldiers: ['gong', 'nong'], weather: 'fog' },
      reward: { gold: 480, frags: 4, card: 'lianhuan' } },
    { id: 'c8', name: '火烧赤壁', map: 3, waves: 12, hp: 2.8,
      story: '曹军铁索连舟，东风一起，黄盖火船冲入，赤壁一片火海。',
      tip: '东风天里火焰更持久。周瑜和孔明同在会触发「既生瑜」。',
      rules: { deck: ['zhouyu', 'kongming', 'huangzhong'], weather: 'wind', bosses: { 6: 'caoren', 12: 'caoren' } },
      reward: { gold: 560, frags: 4, card: 'andu' } },
    { id: 'c9', name: '七进七出', map: 4, waves: 15, hp: 1.6,
      story: '最后一战。带上你最强的武将与兵器，杀穿曹营，护送阿斗回到主公身边。',
      tip: '用你自己的出战武将与兵器。每五波一个 Boss，越往后越强。',
      rules: { bosses: { 5: 'huaxiong', 10: 'dongzhuo', 15: 'lvbu' }, bossHp: 1.3 },
      reward: { gold: 900, frags: 6, souls: { lvbu: 2 } } }
  ];
  G.CAMP = {};
  G.CAMPAIGN.forEach(function (c, i) { c.idx = i; G.CAMP[c.id] = c; });

  // ───────────────────────── 每日挑战 ─────────────────────────
  // 按北京时间的日期生成：所有人同一张图、同一套武将兵器、同一种天气
  G.cnDay = function (t) { return new Date((t || Date.now()) + 8 * 3600 * 1000).toISOString().slice(0, 10); };
  G.dailyConfig = function (day) {
    var seed = 0;
    for (var i = 0; i < day.length; i++) seed = (seed * 31 + day.charCodeAt(i)) >>> 0;
    var rng = G.makeRng(seed ^ 0x5eed);
    var gens = rng.shuffle(G.GENERALS.map(function (g) { return g.id; })).slice(0, 4);
    var weapons = {};
    gens.forEach(function (gid) {
      var type = G.GEN[gid].type;
      var rar = 2 + rng.int(3);
      var cands = G.WEAPONS.filter(function (w) { return w.type === type && w.rarity === rar; });
      if (!cands.length) cands = G.WEAPONS.filter(function (w) { return w.type === type; });
      weapons[gid] = { id: rng.pick(cands).id, star: 3 };
    });
    var cards = rng.shuffle(G.CARDS.map(function (c) { return c.id; }).filter(function (id) { return id !== 'jiedao'; })).slice(0, 2);
    var weather = G.WEATHERS[1 + rng.int(G.WEATHERS.length - 1)].id;
    return { day: day, seed: seed, map: rng.int(5), deck: gens, weapons: weapons, cards: cards, weather: weather, rankIdx: 15 };
  };

  // ───────────────────────── 阿斗语录 ─────────────────────────
  G.ADOU_LINES = {
    danger: ['护驾！护驾！', '子龙救我！', '别过来！', '他们来啦！'],
    hurt: ['哎哟！', '我快不行了…', '疼疼疼', '子龙你在哪'],
    idle: ['俺不饿', '此间乐，不思蜀', '馒头真香', '好困…', '加油加油'],
    win: ['赢啦！', '子龙最棒'],
    boss: ['好大的家伙！', '快跑啊！']
  };

  // 对手昵称
  G.AI_NAMES = ['常山少年', '江东小霸王', '卧龙岗散人', '涿郡卖履郎', '许昌城外', '洛阳纸贵', '五丈原', '长坂坡下',
    '西凉马儿', '汝南袁家', '荆州牧童', '白帝城', '建业吴侯', '汉中米仓', '襄阳月下', '定军山客', '赤兔追风', '铜雀春深',
    '桃园三结义', '官渡粮仓', '麦城旧事', '凤雏未鸣', '东吴大都督', '虎痴', '老黄忠', '北地枪王'];
})(typeof window !== 'undefined' ? window : globalThis);

['util.js','data.js','battle.js','ai.js'].forEach(f=>require('../js/'+f));
const G=globalThis.G;
function run(seed, rank, d0, d1, verbose){
  const rng=G.makeRng(seed*7+3);const L0=G.makeAILoadout(rank,rng);const L1=G.makeAILoadout(rank,rng);
  const dm=[0.8,0.9,1,1.08];
  const b=new G.Battle({seed,mapId:G.RANKS[rank].map,rankIdx:rank,introT:0.5,dmgNumbers:false,sides:[{isAI:true,difficulty:d0,deck:L0.deck,weapons:L0.weapons},{isAI:true,difficulty:d1,deck:L1.deck,weapons:L1.weapons,dmgMult:dm[d1]}]});
  const ais=[new G.AI(b,0,d0,seed+11),new G.AI(b,1,d1,seed+29)];
  const leaks=[[],[]]; const waveInfo=[];
  for(let i=0;i<30*60*15&&b.state!=='over';i++){ais.forEach(a=>a.update(1/30));b.update(1/30);
    for(const e of b.ev){ if(e.k==='leak') leaks[e.side].push('w'+b.wave+(e.boss?'B':'')); if(e.k==='wave'){ waveInfo.push(b.sides.map(s=>Math.round(s.units.reduce((a,u)=>a+(u.kind==='farmer'?0:b.unitPower(u)),0))).join('/')); } }
    b.ev.length=0;}
  if(verbose) console.log('seed',seed,'winner',b.winner,'wave',b.wave,'leaks0',leaks[0].join(' '),'leaks1',leaks[1].join(' '),'\n   power by wave', waveInfo.join(' '));
  return b;
}
module.exports={run};
if(require.main===module){ const [n,rank,d0,d1]=process.argv.slice(2).map(Number); for(let s=1;s<=n;s++) run(s,rank,d0,d1,true); }

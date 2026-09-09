import {build} from 'esbuild';
import assert from 'node:assert/strict';
import fs from 'node:fs';
// Scripted player inputs, not another AI brain. Optional baseline source path.
const versions={...(process.argv[2]?{before:fs.readFileSync(process.argv[2],'utf8')}:{}),after:fs.readFileSync('fireball/src/herd.js','utf8')};
const random=Math.random;
try {
for(const [version,src] of Object.entries(versions)) {
 const {outputFiles}=await build({stdin:{contents:src+'\nexport function clock(t){time=t}',resolveDir:process.cwd()+'/fireball/src'},bundle:true,write:false,format:'esm'});
 for(const tactic of ['park','circle','charge']) {
 let damage=0,ignitions=0,falls=0,wins=0;
 for(let seed=1;seed<=16;seed++) {
 let rng=seed;const math=Object.create(Math);math.random=()=>((rng=Math.imul(rng,1664525)+1013904223>>>0)/4294967296);
 Math.random=math.random;const g=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
 g.newWorld(0);g.clock(150);for(const u of g.units){u.st=3;u.lead=-1;}
 const [p,b]=g.leaders;const a=seed*Math.PI/8;
 for(const [l,id,n,sign] of [[p,0,30,1],[b,1,20,-1]]) {
 Object.assign(l,{st:0,lead:id,x:Math.cos(a)*30*sign,z:Math.sin(a)*30*sign,yaw:a+(sign>0?Math.PI:0)});
 const pool=g.units.filter(u=>!u.hearts&&u.st===3).slice(0,n);
 pool.forEach((u,i)=>Object.assign(u,{st:0,lead:id,col:l.col,x:l.x-Math.cos(l.yaw)*(3+i/4)+Math.sin(l.yaw)*(i%4-1.5),z:l.z-Math.sin(l.yaw)*(3+i/4)-Math.cos(l.yaw)*(i%4-1.5),yaw:l.yaw}));
 }
 for(let i=0;i<1800&&p.st!==3&&b.st!==3;i++) {
 const angle=tactic==='circle'?Math.atan2(p.z,p.x)+Math.PI/2+.4:Math.atan2(b.z-p.z,b.x-p.x);
 p.in={t:Math.max(-1,Math.min(1,g.wrapA(angle-p.yaw)*3)),b:tactic==='park',f:0};
 g.charge(p,tactic==='charge'&&!g.edgeDanger(p));g.step(1/30,{});
 for(const e of g.events){if(e.k==='ignite'&&e.L===b)ignitions++;if(e.k==='fell'&&e.L===b)falls++;}
 g.events.length=0;
 }
 damage+=3-p.hearts;wins+=p.st===3;
 }
 console.log({version,tactic,damage,ignitions,falls,wins});
 if(version==='after'){
 assert.ok(damage>0,`${tactic}: no pressure on a player with a larger herd`);
 // Baseline produces at most three ignitions per 16 duels; require clear pressure.
 assert.ok(ignitions>=8,`${tactic}: rainbow use too rare`);
 assert.ok(falls<=2,`${tactic}: aggression causes repeated edge deaths`);
 }
 }
}

} finally {Math.random=random;}

// AI decisions and collection under the same movement/recruiting rules as players.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as g from '../fireball/src/herd.js';
const src=readFileSync('fireball/src/herd.js','utf8');
const brain=src.slice(src.indexOf('function think('),src.indexOf('// --- the step'));
function decide(recruits, rival={x:35,z:0,n:8,hearts:3}, incoming=false) {
 const L={ai:{t:0},x:0,z:0,yaw:0,n:10,col:0,spd:11,charge:0,wave:0};
 const rivals=(Array.isArray(rival)?rival:[rival]).map(r=>({vx:0,vz:0,hearts:3,...r}));
 if(incoming)L.threat=rivals[0];
 const ctx={units:recruits,alive:()=>[L,...rivals],time:40,WILD:7,meadows:[[0,0]],nearEdge:g.nearEdge,wrapA:g.wrapA,charge:(l,c)=>l.chg=c};
 vm.createContext(ctx);vm.runInContext(brain,ctx);ctx.think(L,1/30);return L;
}
const recruit=(x,daze=0)=>({x,z:0,lead:-1,st:0,col:7,daze});
assert.equal(decide([recruit(40)]).ai.goal[0],40,'distant wild herd beats premature attack');
assert.equal(decide([recruit(5,4),recruit(20)]).ai.goal[0],20,'ignore unrecruitable dazed unit');
assert.equal(decide([], {x:35,z:0,n:25,hearts:3}).chg,false,'do not volunteer for a lopsided fight');
const wounded=decide([], [{x:30,z:0,n:8,hearts:3},{x:50,z:0,n:8,hearts:1}]);
assert.equal(wounded.ai.goal[0],50,'finish a wounded rival before picking a fresh fight');
const dodge=decide([], {x:20,z:0,n:25},true);
assert.equal(dodge.chg,false);assert.notEqual(dodge.ai.goal[1],0,'sidestep a stronger close threat');
const random=Math.random;
try {
 for(let s=1;s<=6;s++) {
  let seed=s;Math.random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
  g.newWorld(0);for(const u of g.units){u.st=3;u.lead=-1;}
  const L=g.leaders[1];Object.assign(L,{x:0,z:0,lead:1,st:0,yaw:Math.PI,n:0,ai:{t:0}});
  let n=0;for(const u of g.units.filter(u=>!u.hearts).slice(0,30)) {
   const a=n++*2.4,r=10+n*.7;Object.assign(u,{x:Math.cos(a)*r,z:Math.sin(a)*r,st:0,col:7,lead:-1});
  }
  for(let i=0;i<45*30;i++){g.step(1/30,{});g.events.length=0;}
  assert.ok(L.n>=20,`seed ${s}: gathered only ${L.n}`);
  assert.equal(L.hearts,3);assert.equal(g.units.length,77);
 }
}finally{Math.random=random}
console.log('PASS distant recruits, daze filter, opponent selection and 20+ collection in six layouts');

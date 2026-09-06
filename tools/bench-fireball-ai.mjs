// Fixed seeds, seven AI riders, up to 420 simulated seconds per match.
import{writeFileSync}from'node:fs';
import{resolve}from'node:path';import{pathToFileURL}from'node:url';
const g=await import(pathToFileURL(resolve(process.argv[2]||'fireball/src/herd.js')).href),out=[];
for(let s=1;s<=24;s++){
 let seed=s;Math.random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
 g.newWorld(s%7);g.leaders[0].ai={t:0,goal:null};let max=0,first20=null,falls=0,ignites=0,empty=0,t=0;
 const peaks=Array(7).fill(0);
 for(;t<420&&g.alive().length>1;t+=1/30){g.step(1/30,{});for(const L of g.leaders){peaks[L.lead]=Math.max(peaks[L.lead],L.n);max=Math.max(max,L.n);if(L.n>=20&&first20===null)first20=Math.round(t)}for(const e of g.events){if(e.k==='fell')falls++;if(e.k==='ignite'){ignites++;if(e.L.n<5)empty++}}g.events.length=0;}
 out.push({seed:s,max,first20,falls,ignites,empty,time:Math.round(t),alive:g.alive().length,winner:g.alive().length===1?g.alive()[0].lead:null,peaks});
}
console.log(JSON.stringify(out));if(process.argv[3])writeFileSync(process.argv[3],JSON.stringify(out,null,2));

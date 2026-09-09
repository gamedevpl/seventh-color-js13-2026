import{build}from'esbuild';import vm from'node:vm';import assert from'node:assert/strict';import{compactEvents}from'./lib/fireball-pack.mjs';
const raw=(await build({entryPoints:['fireball/src/herd.js'],bundle:true,write:false,format:'iife',globalName:'H'})).outputFiles[0].text;
const run=src=>{const c=vm.createContext({Math:Object.assign(Object.create(Math),{random:()=>.45})});vm.runInContext(src,c);c.H.newWorld(0);const events=[];for(let i=0;i<6000;i++){c.H.step(1/30,{});events.push(...c.H.events.map(e=>e.k));c.H.events.length=0;}return {units:JSON.stringify(c.H.units),events}};
const a=run(raw),b=run(compactEvents(raw)),tags=['join','knock','horn','graze','ignite','spend','lost','fell','blast','hurt','dead','boom'];assert.equal(a.units,b.units);assert.deepEqual(a.events.filter(k=>!['rise','chg','fizzle'].includes(k)),b.events.map(k=>tags[k]));console.log('PASS compact event encoding: identical 200s simulation,',b.events.length,'visible events');
const states=`let mode='title';if(mode==='title')mode='run';if(mode!=='end')mode='end';globalThis.result=mode;`;
const c=vm.createContext({});vm.runInContext(compactEvents(states),c);assert.equal(c.result,2);
assert.ok(compactEvents("const e={k:'join'}; const word='join';").includes("word='join'"),'unrelated strings remain intact');

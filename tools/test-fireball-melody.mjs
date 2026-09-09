import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
const src=readFileSync('fireball/src/snd.js','utf8').replace(/export /g,'');
const notes=[];const c={notes};vm.createContext(c);
vm.runInContext(src+`;ac={currentTime:0};space={pan:{setTargetAtTime(){}}};tone=(...args)=>notes.push(args);hit=()=>{};music(0,0,1);`,c);
assert.ok(notes.some(([f,d,type,g])=>f===880&&type==='triangle'&&g===.04));
const main=readFileSync('fireball/src/main.js','utf8');
const start=main.indexOf('    let magic = 0, pan = 0;'),end=main.indexOf('    const local =',start);
assert.ok(start>=0&&end>start);
for(const [distance,wave,charge,min,max] of [[14,1,0,.79,.81],[80,1,0,0,0],[0,0,1,.39,.41]]){
 let level=-1;vm.runInNewContext(main.slice(start,end),{P:{x:0,z:0},leaders:[{st:0,cx:distance,cz:0,wave,charge}],camR:[1,0,0],heat:0,music:(h,b,m)=>level=m});
 assert.ok(level>=min&&level<=max);
}
console.log('PASS octave motif, nearby rival rainbow and distance falloff');
for(let x=-100;x<=100;x++){
 let pan;vm.runInNewContext(main.slice(start,end),{P:{x:0,z:0},leaders:Array.from({length:7},()=>({st:0,cx:x,cz:0,wave:1,charge:1})),camR:[1,0,0],heat:0,music:(h,b,m,p)=>pan=p});
 assert.ok(Math.abs(pan)<1,'seven overlapping sources keep the panner in range');
 if(Math.abs(x)<70&&x)assert.equal(Math.sign(pan),Math.sign(x));
}
console.log('PASS stereo direction and seven-source bounds');

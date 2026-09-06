// Exercise the actual renderer light pass without opening a browser.
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
const source=readFileSync('fireball/src/main.js','utf8');
const start=source.indexOf('    let dx = 0, dz = 0, light = 1;'),end=source.indexOf('    const M = modelTR',start);
assert.ok(start >= 0 && end > start, 'shadow pass not found');
function shadow(lights){const ctx={x:0,z:0,leaders:lights,shadow:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],set:{shadow:null},alphas:[],setDim(v){this.alphas.push(v)},drawMesh(){}};ctx.setDim=v=>ctx.alphas.push(v);vm.runInNewContext(source.slice(start,end),ctx);return {matrix:ctx.shadow,alpha:ctx.alphas[0]};}
const left={cx:-10,cz:0,r:10,wave:1},right={cx:10,cz:0,r:10,wave:1};
assert.deepEqual(shadow([left,right]),shadow([right,left]));
assert.ok(shadow([left]).matrix[12]>0&&shadow([right]).matrix[12]<0);
assert.equal(shadow([left,right]).matrix[12],0);
assert.ok(shadow([left,right]).alpha<shadow([left]).alpha);
assert.equal(shadow([{...left,wave:0}]).alpha,1);
console.log('PASS shadow direction, opposing lights, order invariance and burnout');

// Full charge must never create a floating endpoint above the herd.
const chargeStart=source.indexOf('function drawCharge('),chargeEnd=source.indexOf('  if (!wave) return;',chargeStart);
assert.ok(chargeStart>=0&&chargeEnd>chargeStart);
const L={x:1,z:2,st:0,lead:0,n:1,charge:1,wave:0};
const other={x:4,z:5,st:0,lead:0};
const arcs=[];
const values=[0,0,.75,0];
vm.runInNewContext(source.slice(chargeStart,chargeEnd)+'}\ndrawCharge(L,0,1);',{
  L,units:[L,other],ARCS:arcs,ARCMAX:60,RAINBOW:[[1,1,1]],
  rnd:(n=1)=>(values.shift()??0)*n,spawnP(){}
});
assert.equal(arcs.length,1);
assert.deepEqual(Array.from(arcs[0].a),[1,.9,2]);
assert.deepEqual(Array.from(arcs[0].b),[4,.9,5]);
console.log('PASS full-charge lightning connects unicorns');

// A whole herd swept in one frame produces one strong impact, not N voices.
const eventStart=source.indexOf('  let impactSound = 0;'),eventEnd=source.indexOf('  events.length = 0;',eventStart);
assert.ok(eventStart>=0&&eventEnd>eventStart);
for(const [kind,count,power] of [['knock',1,1],['blast',30,2]]){
  const sounds=[];
  vm.runInNewContext(source.slice(eventStart,eventEnd),{
    events:Array.from({length:count},()=>({k:kind,x:0,z:0,col:0})),
    P:{},COL:[[1,0,0]],burst(){},thud:p=>sounds.push(p)
  });
  assert.deepEqual(sounds,[power]);
}
console.log('PASS knock and grouped rainbow impact audio');

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

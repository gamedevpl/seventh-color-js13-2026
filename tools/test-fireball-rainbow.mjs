import{readFileSync}from'node:fs';import vm from'node:vm';import assert from'node:assert/strict';
const src=readFileSync('fireball/src/main.js','utf8'),a=src.indexOf('function trailVerts('),b=src.indexOf('// The arcs:',a);
const leader={x:20,z:0,yaw:0,r:11,wave:1},points=[],samples=[{x:0,z:0,yaw:0,r:12,t:.8},{x:3,z:0,yaw:0,r:12,t:0},{x:6,z:0,yaw:0,r:12,t:0}];
const ctx={ARCH:9,TBUF:new Float32Array(200000),TRAIL:new Map([[leader,{s:samples}]]),RAINBOW:Array(7).fill([1,1,1]),now:()=>0,vertexWriter:()=>{const put=(...p)=>{points.push(p);put.n+=10};put.n=0;return put}};
vm.createContext(ctx);vm.runInContext(src.slice(a,b),ctx);ctx.trailVerts(0,[0,5,-50]);
const height=x=>Math.max(...points.filter(p=>p[0]===x).map(p=>p[1]));
assert.ok(height(3)>12,'main arch remains tall');assert.ok(height(0)<height(3)*.4,'old tail rounds down');assert.ok(height(20)<2,'nose still meets the leader');
assert.ok(points.every(p=>p.slice(0,3).every(Number.isFinite)));assert.equal(leader.x,20);assert.equal(leader.r,11);
console.log('PASS tall arch, rounded tail, tapered leader tip and unchanged simulation');

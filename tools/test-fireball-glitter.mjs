import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source=readFileSync('fireball/src/main.js','utf8');
assert.ok(source.includes(readFileSync('tools/workbench/glitter-effect.txt','utf8').trim()),'game and workbench share the approved effect');
const start=source.indexOf('function vertexWriter('),end=source.indexOf('// --- the charge,',start);
assert.ok(start>=0&&end>start);
const ctx={PBUF:new Float32Array(9436*120),PMAX:220,glitterTick:0,PART:[],RAINBOW:Array(7).fill([1,1,1]),ARENA:95,units:[],time:0,eye:[0,4,-12],camR:[1,0,0],player:{x:0,z:0}};
ctx.who=()=>ctx.player;ctx.now=()=>ctx.time;
vm.createContext(ctx);vm.runInContext(source.slice(start,end),ctx);
const run=dt=>{ctx.glitterTick=3;return ctx.particleVerts(dt)};
run(0);
assert.equal(ctx.PART.length,9436);
const dust=ctx.PART[220], [x,,z]=dust.p;
ctx.units=[{x,z,sp:10,st:0}];run(0);
assert.equal(dust.life,1,'running unicorn lifts nearby dust');
ctx.units=[];run(.5);
assert.ok(Math.abs(dust.life-Math.exp(-1))<1e-6,'wake decays after passage');
dust.life=0;ctx.units=[{x:x+5,z,sp:37,st:0,wave:1,r:8}];run(0);
assert.ok(dust.life>2,'rainbow lifts dust beyond ordinary hoof radius');
ctx.units[0].wave=0;dust.life=0;run(0);assert.equal(dust.life,0);
ctx.units=[];
for(let i=0;i<600;i++){
 ctx.time=i/10;ctx.player.x=Math.sin(i/40)*90;ctx.player.z=Math.cos(i/40)*90;
 const n=run(.1);assert.ok(n<=ctx.PBUF.length);assert.equal(ctx.PART.length,9436);
 for(const p of ctx.PART.slice(220)){
  assert.ok(p.p.every(Number.isFinite));assert.ok(p.p[1]>=.08);
  assert.ok(Math.abs(p.p[0]-ctx.player.x)<=42&&Math.abs(p.p[2]-ctx.player.z)<=42);
 }
}
console.log('PASS glitter lift, rainbow radius, settling, recycling and buffer bounds');
ctx.time=0;ctx.player={x:0,z:0};
ctx.camR=[Math.cos(220),0,Math.sin(220)];run(0);const facing=ctx.PBUF[9];
ctx.camR=[-Math.sin(220),0,Math.cos(220)];run(0);const edgeOn=ctx.PBUF[9];
assert.ok(facing>edgeOn*20,'rotating away from the camera extinguishes the glint');
ctx.camR=[Math.cos(220),0,Math.sin(220)];ctx.PART[220].col=[1,.1,0];
let peak=0,peakTime=0;
for(let i=0;i<360;i++){ctx.time=i/30;run(0);if(ctx.PBUF[9]>peak){peak=ctx.PBUF[9];peakTime=ctx.time;}}
assert.ok(peak>1,'rare specular point becomes bright');
ctx.time=peakTime;run(0);assert.ok(ctx.PBUF[7]>1,'reflection peak is white');
const width=o=>Math.hypot(ctx.PBUF[o]-ctx.PBUF[o+10],ctx.PBUF[o+2]-ctx.PBUF[o+12]);
assert.ok(Math.abs(width(60)/width(0)-3)<.01,'subtle halo surrounds the unchanged flake');
assert.ok(ctx.PBUF[69]<ctx.PBUF[9]*.3,'halo stays much dimmer than point');
ctx.time=peakTime+.4;run(0);assert.ok(ctx.PBUF[9]<peak*.5,'reflection quickly fades');
ctx.time=0;run(0);assert.ok(ctx.PBUF[7]<.3,'ordinary glitter retains its colour');
console.log('PASS coloured flakes, short white reflection and soft halo without star rays');
ctx.units=[{x:0,z:0,sp:10,st:0}];ctx.player={x:0,z:0};ctx.glitterTick=0;
for(const p of ctx.PART.slice(220,228)){p.p=[0,.08,0];p.life=0;}
for(let i=0;i<8;i++)ctx.particleVerts(0);
assert.ok(ctx.PART.slice(220,228).every(p=>p.life===1),'all staggered groups update within eight frames');
console.log('PASS complete staggered wake update cycle');
ctx.units=[];ctx.time=0;ctx.player={x:0,z:0};ctx.eye=[.2,1,0];
ctx.PART[220].p=[0,0,0];ctx.PART[220].life=0;run(0);
const halfWidth=Math.hypot(ctx.PBUF[0]-ctx.PBUF[10],ctx.PBUF[2]-ctx.PBUF[12])/2;
assert.ok(halfWidth<=.000201,'near-camera flakes keep a small projected width');
assert.ok(ctx.PART.slice(220).some(p=>p.p[1]>50),'falling field extends high above the arena');
console.log('PASS near-camera size cap and high-altitude glitter');

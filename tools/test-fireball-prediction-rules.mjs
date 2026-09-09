import assert from 'node:assert/strict';
import {test} from 'node:test';
import {newWorld,units,leaders} from '../fireball/src/herd.js';
import {net,open,close,tick,ghost} from '../fireball/src/net.js';
let socket, sent;
globalThis.WebSocket=class{constructor(){socket=this;this.readyState=1;}send(b){if(b instanceof Uint8Array)sent=b;}close(){}};
const idle={t:0,f:0,b:0,c:0},right={...idle,t:1},dt=1/60;
function snapshot({x=0,yaw=0,st=0,stun=0,hearts=3,wave=0,ack=sent?.[3]||0}={}){
 const v=new DataView(new ArrayBuffer(4+units.length*7+7*7));v.setUint8(0,1);v.setUint8(3,2);let o=4;
 for(const u of units){v.setInt16(o,u===leaders[1]?x*128:u.x*128);o+=2;v.setInt16(o,u===leaders[1]?0:u.z*128);o+=2;v.setUint8(o++,yaw/(Math.PI*2)*256);v.setUint8(o++,(u===leaders[1]?st:u.st)|((u.lead<0?7:u.lead)<<2)|(u.col<<5));v.setUint8(o++,0);}
 for(const L of leaders){v.setUint8(o++,L===leaders[1]?stun*20:0);v.setUint8(o++,0);v.setUint8(o++,wave?255:0);v.setUint8(o++,wave);v.setUint8(o++,wave?100:0);v.setUint8(o++,ack);v.setUint8(o++,hearts|(st<<2)|64);}
 socket.onmessage({data:v.buffer});
}
function setup(){newWorld(0);for(const u of units){u.st=3;u.lead=-1;}Object.assign(leaders[1],{st:0,lead:1,x:0,z:0,yaw:0,spd:11,stun:0,cool:0,charge:0,chg:0,wave:0});open('ws://test');socket.onopen();socket.onmessage({data:'@z'});socket.onmessage({data:'ha'});socket.onmessage({data:'ra|z|||||'});tick(1.21,idle);snapshot();}
function frame(q=right){tick(dt,q);ghost(dt,q);}
test('prediction responds before a snapshot and never creates combat results',()=>{try{setup();const L=leaders[1];frame();assert.ok(L.yaw>.03);for(let i=0;i<30;i++)frame({...idle,c:1});assert.ok(L.charge>0);assert.equal(L.wave,0);assert.equal(L.hearts,3);}finally{close();}});
test('stun, death and respawn override outstanding input',()=>{try{setup();frame();snapshot({stun:2});const L=leaders[1],yaw=L.yaw;frame();assert.ok(L.yaw<=yaw);snapshot({st:3,hearts:0});frame();assert.equal(L.st,3);assert.equal(L.hearts,0);snapshot({x:50});for(let i=0;i<30;i++)frame(idle);assert.ok(Math.abs(L.x-50)<1);}finally{close();}});
test('prediction stops under stale snapshots',()=>{try{setup();for(let i=0;i<100;i++)frame();const y=leaders[1].yaw;for(let i=0;i<10;i++)frame();assert.ok(Math.abs(leaders[1].yaw-y)<.001);}finally{close();}});

test('acknowledged turns are not replayed, including sequence wrap',()=>{try{setup();let yaw=0;const L=leaders[1];for(let i=0;i<300;i++){frame(right);yaw+=dt*2.6;snapshot({yaw});assert.ok(Math.abs(Math.atan2(Math.sin(L.tyaw-yaw),Math.cos(L.tyaw-yaw)))<.025);}snapshot({yaw,stun:1});assert.ok(Math.abs(Math.atan2(Math.sin(L.tyaw-yaw),Math.cos(L.tyaw-yaw)))<.025);}finally{close();}});
test('an old snapshot preserves unacknowledged opposite steering',()=>{try{setup();const L=leaders[1];frame(right);const ack=sent[3];const yaw=L.yaw;frame({...idle,t:-1});frame({...idle,t:-1});snapshot({yaw,ack});assert.ok(L.tyaw<yaw-.07,'pending left turns must survive the old right-turn snapshot');}finally{close();}});

test('stale frames overwrite ring slots before reconnection',()=>{try{setup();for(let i=0;i<350;i++){socket.onmessage({data:'ha'});frame();}snapshot({yaw:0,ack:(sent[3]-4)&255});assert.equal(leaders[1].tyaw,0,'old turns must not reappear after sequence wrap while disconnected');}finally{close();}});

for(const speed of [11,37])test(`steady ${speed} unit/s travel stays steady between 20 Hz snapshots`,()=>{try{
 setup();const L=leaders[1],speeds=[];let previous=L.x;
 for(let i=1;i<=180;i++){
  if(i%3===0)snapshot({x:speed*i*dt,wave:speed===37?21:0});
  frame(idle);
  if(i>120)speeds.push((L.x-previous)/dt);
  previous=L.x;
 }
 const spread=Math.max(...speeds)-Math.min(...speeds);
 assert.ok(spread<speed*.15,`snapshot speed ripple ${spread} must stay below 15% of ${speed}`);
 assert.ok(Math.abs(speeds.reduce((a,b)=>a+b)/speeds.length-speed)<.2,'smoothing must preserve average travel speed');
}finally{close();}});

test('zero-time guest frame keeps render velocities finite',()=>{try{
 setup();ghost(0,idle);for(const u of units)assert.ok(Number.isFinite(u.vx)&&Number.isFinite(u.vz));
}finally{close();}});

for(const own of [true,false])test(`${own?'own':'remote'} herd does not hop backwards with uneven packet spacing`,()=>{try{
 setup();if(!own)net.me=-1;
 const L=leaders[1],speeds=[];let previous=L.x,next=1,gap=0;
 for(let i=1;i<=240;i++){
  if(i===next){snapshot({x:11*i*dt});next+=[1,5][gap++%2];}
  frame(idle);if(i>180)speeds.push((L.x-previous)/dt);previous=L.x;
 }
 assert.ok(Math.min(...speeds)>0,'straight travel must never recoil');
 assert.ok(Math.max(...speeds)-Math.min(...speeds)<11*.4,'arrival jitter must not turn into large speed pulses');
}finally{close();}});

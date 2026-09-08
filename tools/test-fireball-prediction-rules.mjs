import assert from 'node:assert/strict';
import {test} from 'node:test';
import {newWorld,units,leaders} from '../fireball/src/herd.js';
import {net,open,close,tick,ghost} from '../fireball/src/net.js';
let socket;
globalThis.WebSocket=class{constructor(){socket=this;this.readyState=1;}send(){}close(){}};
const idle={t:0,f:0,b:0,c:0},right={...idle,t:1},dt=1/60;
function snapshot({x=0,yaw=0,st=0,stun=0,hearts=3,wave=0}={}){
 const v=new DataView(new ArrayBuffer(5+units.length*7+7*6));v.setUint8(0,1);v.setUint8(4,2);let o=5;
 for(const u of units){v.setInt16(o,u===leaders[1]?x*128:u.x*128);o+=2;v.setInt16(o,u===leaders[1]?0:u.z*128);o+=2;v.setUint8(o++,yaw/(Math.PI*2)*256);v.setUint8(o++,(u===leaders[1]?st:u.st)|((u.lead<0?7:u.lead)<<2)|(u.col<<5));v.setUint8(o++,0);}
 for(const L of leaders){v.setUint8(o++,L===leaders[1]?stun*20:0);v.setUint8(o++,0);v.setUint8(o++,wave?255:0);v.setUint8(o++,wave);v.setUint8(o++,wave?100:0);v.setUint8(o++,hearts|(st<<2)|64);}
 socket.onmessage({data:v.buffer});
}
function setup(){newWorld(0);for(const u of units){u.st=3;u.lead=-1;}Object.assign(leaders[1],{st:0,lead:1,x:0,z:0,yaw:0,spd:11,stun:0,cool:0,charge:0,chg:0,wave:0});open('ws://test');socket.onopen();socket.onmessage({data:'@z'});socket.onmessage({data:'ha'});socket.onmessage({data:'ra|z|||||'});tick(1.21,idle);snapshot();}
function frame(q=right){tick(dt,q);ghost(dt,q);}
test('prediction responds before a snapshot and never creates combat results',()=>{try{setup();const L=leaders[1];frame();assert.ok(L.yaw>.03);for(let i=0;i<30;i++)frame({...idle,c:1});assert.ok(L.charge>0);assert.equal(L.wave,0);assert.equal(L.hearts,3);}finally{close();}});
test('stun, death and respawn override outstanding input',()=>{try{setup();frame();snapshot({stun:2});const L=leaders[1],yaw=L.yaw;frame();assert.ok(L.yaw<=yaw);snapshot({st:3,hearts:0});frame();assert.equal(L.st,3);assert.equal(L.hearts,0);snapshot({x:50});for(let i=0;i<30;i++)frame(idle);assert.ok(Math.abs(L.x-50)<1);}finally{close();}});
test('prediction stops under stale snapshots',()=>{try{setup();for(let i=0;i<100;i++)frame();const y=leaders[1].yaw;for(let i=0;i<10;i++)frame();assert.ok(Math.abs(leaders[1].yaw-y)<.001);}finally{close();}});

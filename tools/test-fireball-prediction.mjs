// Real input-to-frame latency with 100 ms in each network direction.
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {writeFileSync,mkdirSync} from 'node:fs';
import {chromium} from 'playwright-core';
import {startRelay} from './lib/relay.mjs';
const root=process.cwd(),dir=root+'/.cache/prediction';mkdirSync(dir,{recursive:true});
const out=await build({entryPoints:['fireball/src/main.js'],bundle:true,write:false,format:'iife',define:{DEV:'true'}});
const file=dir+'/after.html';writeFileSync(file,'<style>body{margin:0}</style><canvas id=c></canvas><script>'+out.outputFiles[0].text+'</script>');
const relay=await startRelay(),browsers=[],pages=[],errors=[];
try{
 for(let i=0;i<2;i++){
  const b=await chromium.launch({channel:'chrome',headless:false,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});browsers.push(b);
  const p=await b.newPage({viewport:{width:640,height:360}});pages.push(p);p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(()=>{const WS=WebSocket;window.lag=0;window.WebSocket=class extends WS{send(data){const copy=typeof data==='string'?data:data.slice(0);setTimeout(()=>{if(this.readyState===1)super.send(copy)},window.lag)}set onmessage(fn){super.onmessage=e=>setTimeout(()=>fn(e),window.lag)}}});
  await p.goto('file://'+file);await p.waitForFunction(()=>window.FB);await p.evaluate(r=>FB.goOnline(r),relay.url+'/prediction');
 }
 await Promise.all(pages.map(p=>p.waitForFunction(()=>FB.net.seats===2&&FB.net.me>=0,null,{timeout:30000})));
 const host=await pages[0].evaluate(()=>FB.net.host)?pages[0]:pages[1],guest=pages.find(p=>p!==host),seat=await guest.evaluate(()=>FB.net.me);
 await guest.evaluate(()=>lag=100);
 const results=[];
 for(const wave of [0,21]){
  await host.evaluate(([s,w])=>{for(const u of FB.units){u.st=3;u.lead=-1;}for(const i of[FB.net.me,s])Object.assign(FB.leaders[i],{st:0,lead:i,x:-40,z:i*20,yaw:0,vx:w?37:11,vz:0,spd:w?37:11,stun:0,charge:w?1:0,chg:!!w,wave:w,burn:20,cool:0,hearts:3});if(w)FB.units.filter(u=>!u.hearts).slice(0,20).forEach((u,i)=>Object.assign(u,{st:0,lead:s,col:FB.leaders[s].col,x:-44-i*.4,z:s*20}));},[seat,wave]);
  await guest.waitForTimeout(500);await guest.bringToFront();
  await guest.evaluate(()=>{const L=FB.leaders[FB.net.me],y=L.yaw;window.response=null;addEventListener('keydown',function key(e){if(e.key!=='ArrowRight')return;removeEventListener('keydown',key);const start=performance.now();function sample(){if(Math.abs(L.yaw-y)>.04)response=performance.now()-start;else requestAnimationFrame(sample)}requestAnimationFrame(sample)});});
  await guest.keyboard.down('ArrowRight');await guest.waitForFunction(()=>response!==null,null,{polling:10});
  const ms=await guest.evaluate(()=>response);await guest.waitForTimeout(500);await guest.keyboard.up('ArrowRight');await guest.waitForTimeout(450);
  const a=await host.evaluate(s=>({x:FB.leaders[s].x,z:FB.leaders[s].z,yaw:FB.leaders[s].yaw}),seat),c=await guest.evaluate(()=>{const L=FB.leaders[FB.net.me];return{x:L.x,z:L.z,yaw:L.yaw}});
  const err=Math.abs(Math.atan2(Math.sin(a.yaw-c.yaw),Math.cos(a.yaw-c.yaw)));
  results.push({wave,inputMs:ms,headingError:err,positionError:Math.hypot(a.x-c.x,a.z-c.z)});
  {assert.ok(ms<100,'local steering should respond before the round trip');assert.ok(err<.3,'heading must reconcile after release');}
 }
 // Death must override held input immediately on receipt; no local resurrection.
 await host.evaluate(s=>{FB.leaders[s].st=3;FB.leaders[s].hearts=0},seat);
 await guest.waitForFunction(()=>FB.leaders[FB.net.me].st===3);
 await guest.keyboard.down('ArrowRight');await guest.waitForTimeout(250);assert.equal(await guest.evaluate(()=>FB.leaders[FB.net.me].st),3);await guest.keyboard.up('ArrowRight');
 assert.deepEqual(errors,[]);console.log(JSON.stringify(results,null,2));writeFileSync(dir+'/results.json',JSON.stringify(results,null,2));
}finally{for(const b of browsers)await b.close();relay.close()}

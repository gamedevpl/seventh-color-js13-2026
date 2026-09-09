// Real input-to-frame latency with 100 ms in each network direction.
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {chromium} from 'playwright-core';
import {startRelay} from './lib/relay.mjs';
const root=process.cwd(),dir=root+'/.cache/client-view';mkdirSync(dir,{recursive:true});
const source=readFileSync('fireball/src/main.js','utf8')+`
if(DEV)window.VIEW={settle(){camYaw=0;eye=look=null},get time(){return now()},get camera(){return Math.atan2(look[2]-eye[2],look[0]-eye[0])},dust:()=>PART.slice(PMAX).map(p=>p&&[p.p[1],p.life])};`;
const out=await build({stdin:{contents:source,resolveDir:root+'/fireball/src'},bundle:true,write:false,format:'iife',define:{DEV:'true'}});
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
 const beforeDust=await guest.evaluate(()=>{const dust=VIEW.dust(),i=dust.findIndex(p=>p&&p[0]>20&&p[0]<45&&p[1]<.001);return {i,y:dust[i][0],time:VIEW.time}});
 await guest.waitForTimeout(450);
 const afterDust=await guest.evaluate(i=>({y:VIEW.dust()[i][0],time:VIEW.time}),beforeDust.i);
 const dust={clock:afterDust.time-beforeDust.time,fall:beforeDust.y-afterDust.y};
 {assert.ok(dust.clock>.3,'client visual clock must advance');assert.ok(dust.fall>.5,'airborne glitter must fall with a stationary camera');}
 const results=[];
 for(const wave of [0,21]){
  await host.evaluate(([s,w])=>{for(const u of FB.units){u.st=3;u.lead=-1;}for(const i of[FB.net.me,s])Object.assign(FB.leaders[i],{st:0,lead:i,x:-40,z:i*20,yaw:0,vx:w?37:11,vz:0,spd:w?37:11,stun:0,charge:w?1:0,chg:!!w,wave:w,burn:20,cool:0,hearts:3});if(w)FB.units.filter(u=>!u.hearts).slice(0,20).forEach((u,i)=>Object.assign(u,{st:0,lead:s,col:FB.leaders[s].col,x:-44-i*.4,z:s*20}));},[seat,wave]);
  await guest.waitForTimeout(500);await guest.evaluate(()=>VIEW.settle());await guest.waitForTimeout(200);await guest.bringToFront();
  await guest.evaluate(()=>{const L=FB.leaders[FB.net.me],y=L.yaw,c=VIEW.camera;window.response=null;window.viewResponse=null;addEventListener('keydown',function key(e){if(e.key!=='ArrowRight')return;removeEventListener('keydown',key);const start=performance.now();function sample(){if(response===null&&Math.abs(L.yaw-y)>.04)response=performance.now()-start;if(viewResponse===null&&Math.abs(Math.atan2(Math.sin(VIEW.camera-c),Math.cos(VIEW.camera-c)))>.04)viewResponse=performance.now()-start;if(response===null||viewResponse===null)requestAnimationFrame(sample)}requestAnimationFrame(sample)});});
  await guest.keyboard.down('ArrowRight');await guest.waitForFunction(()=>response!==null&&viewResponse!==null,null,{polling:10});
  const ms=await guest.evaluate(()=>response);await guest.waitForTimeout(350);
  await guest.keyboard.up('ArrowRight');
  await guest.evaluate(()=>{window.reverse=null;window.maxJump=0;const start=performance.now(),initial=VIEW.camera;let previous=initial;function sample(){const c=VIEW.camera,delta=Math.atan2(Math.sin(c-previous),Math.cos(c-previous));maxJump=Math.max(maxJump,Math.abs(delta));previous=c;if(reverse===null&&Math.atan2(Math.sin(c-initial),Math.cos(c-initial))<-.04)reverse=performance.now()-start;if(performance.now()-start<900)requestAnimationFrame(sample)}requestAnimationFrame(sample)});
  await guest.keyboard.down('ArrowLeft');await guest.waitForFunction(()=>reverse!==null,null,{timeout:2000,polling:10});
  await guest.waitForTimeout(350);await guest.keyboard.up('ArrowLeft');await guest.waitForTimeout(450);
  const a=await host.evaluate(s=>({x:FB.leaders[s].x,z:FB.leaders[s].z,yaw:FB.leaders[s].yaw}),seat),c=await guest.evaluate(()=>{const L=FB.leaders[FB.net.me];return{x:L.x,z:L.z,yaw:L.yaw}});
  const err=Math.abs(Math.atan2(Math.sin(a.yaw-c.yaw),Math.cos(a.yaw-c.yaw)));
  results.push({wave,inputMs:ms,viewMs:await guest.evaluate(()=>viewResponse),headingError:err,positionError:Math.hypot(a.x-c.x,a.z-c.z),...await guest.evaluate(()=>({reverseMs:reverse,maxJump}))});
  {assert.ok(ms<120,'local steering should respond before the round trip');assert.ok(results.at(-1).viewMs<150,'camera must react before the round trip');assert.ok(results.at(-1).reverseMs<180,'camera must respond to reversing the turn');assert.ok(results.at(-1).maxJump<.15,'snapshot corrections must not snap the camera');assert.ok(err<.3,'heading must reconcile after release');}
 }
 // Death must override held input immediately on receipt; no local resurrection.
 await host.evaluate(s=>{FB.leaders[s].st=3;FB.leaders[s].hearts=0},seat);
 await guest.waitForFunction(()=>FB.leaders[FB.net.me].st===3);
 await guest.keyboard.down('ArrowRight');await guest.waitForTimeout(250);assert.equal(await guest.evaluate(()=>FB.leaders[FB.net.me].st),3);await guest.keyboard.up('ArrowRight');
 assert.deepEqual(errors,[]);console.log(JSON.stringify({dust,results},null,2));writeFileSync(dir+'/results.json',JSON.stringify({dust,results},null,2));
}finally{for(const b of browsers)await b.close();relay.close()}

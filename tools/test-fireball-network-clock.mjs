// Two real browser processes; deliberately throttle rendering, never the test clock.
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {writeFileSync,mkdirSync} from 'node:fs';
import {chromium} from 'playwright-core';
import {startRelay} from './lib/relay.mjs';
const root=process.cwd();mkdirSync(root+'/.cache/network-lag',{recursive:true});
const out=await build({entryPoints:['fireball/src/main.js'],bundle:true,write:false,format:'iife',define:{DEV:'true'}});
writeFileSync(root+'/.cache/network-lag/index.html','<style>body{margin:0;display:grid;place-items:center;height:100vh;background:black}canvas{display:block}</style><canvas id=c></canvas><script>'+out.outputFiles[0].text+'</script>');
const relay=await startRelay(),browsers=[];
try {
const pages=[];
for(let i=0;i<2;i++){
 const b=await chromium.launch({channel:'chrome',headless:false,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows',`--window-position=${i*650},0`,'--window-size=640,480']});browsers.push(b);
 const p=await b.newPage({viewport:{width:640,height:360}});pages.push(p);p.on('pageerror',e=>console.log('ERROR',e.message));
 await p.addInitScript(()=>{const raf=requestAnimationFrame.bind(window);window.delay=0;window.frames=0;window.lastFrame=0;window.requestAnimationFrame=cb=>raf(function next(t){if(t-lastFrame<delay)return raf(next);lastFrame=t;frames++;cb(t);});});
 await p.goto('file://'+root+'/.cache/network-lag/index.html');await p.waitForFunction(()=>window.FB);await p.evaluate(r=>FB.goOnline(r),relay.url+'/lag-probe');
}
await Promise.all(pages.map(p=>p.waitForFunction(()=>FB.net.seats===2&&FB.net.me>=0,null,{timeout:20000})));
const host=await pages[0].evaluate(()=>FB.net.host)?pages[0]:pages[1],guest=pages.find(p=>p!==host),seat=await guest.evaluate(()=>FB.net.me);
const results=[];
for(const [name,h,g] of [['normal',0,0],['slow-host',100,0],['slow-guest',0,100]]){
 await host.evaluate(v=>delay=v,h);await guest.evaluate(v=>delay=v,g);
 await host.evaluate(s=>{for(const u of FB.units){u.st=3;u.lead=-1;}for(const i of [FB.net.me,s])Object.assign(FB.leaders[i],{st:0,lead:i,x:-30,z:i*15,yaw:0,vx:11,vz:0,spd:11,stun:0,charge:0,chg:0,wave:0,cool:0,hearts:3});},seat);
 await guest.waitForTimeout(500);
 const before=await host.evaluate(s=>({x:FB.leaders[s].x,t:FB.spy().t,wall:performance.now(),frames}),seat);
 await guest.waitForTimeout(1500);
 const after=await host.evaluate(s=>({x:FB.leaders[s].x,t:FB.spy().t,wall:performance.now(),frames}),seat);
 const yaw=await host.evaluate(s=>FB.leaders[s].yaw,seat);

 const began=Date.now();await guest.bringToFront();await guest.keyboard.down('ArrowRight');
 await host.waitForFunction(([s,y])=>Math.abs(FB.leaders[s].yaw-y)>.08,[seat,yaw],{timeout:5000,polling:20});const hostMs=Date.now()-began;
 await guest.waitForFunction(([s,y])=>Math.abs(FB.leaders[s].yaw-y)>.08,[seat,yaw],{timeout:5000,polling:20});const guestMs=Date.now()-began;await guest.keyboard.up('ArrowRight');await guest.waitForTimeout(250);
 const wall=(after.wall-before.wall)/1000;
 assert.ok(Math.abs((after.t-before.t)/wall-1)<.2,`${name}: network clock slowed with FPS`);
 assert.ok(Math.abs((after.x-before.x)/wall-11)<2,`${name}: simulation slowed with FPS`);
 assert.ok(hostMs<500&&guestMs<600,`${name}: input stalled`);
 results.push({name,hostMs,guestMs,wall,clock:after.t-before.t,travel:after.x-before.x,frames:after.frames-before.frames});
}
console.log(JSON.stringify(results,null,2));writeFileSync(root+'/.cache/network-lag/'+'verified'+'.json',JSON.stringify(results,null,2));
}finally{for(const b of browsers)await b.close();relay.close();}

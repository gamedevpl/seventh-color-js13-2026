import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {build} from 'esbuild';
import {writeFileSync,mkdirSync} from 'node:fs';
const dir=process.cwd()+'/.cache/mobile-audit';
mkdirSync(dir,{recursive:true});
const code=await build({entryPoints:['fireball/src/main.js'],bundle:true,write:false,format:'iife',define:{DEV:'true'}});
// Expose the input before networking: online fixtures do not contact the relay.
writeFileSync(dir+'/index.html','<!doctype html><meta name=viewport content="width=device-width,maximum-scale=1,user-scalable=no,viewport-fit=cover"><style>body{margin:0;background:#000;overflow:hidden;height:100vh;display:grid;place-items:center}canvas{display:block}html{touch-action:none;overscroll-behavior:none}</style><canvas id=c></canvas><script>'+code.outputFiles[0].text.replace('const mine = tick(realDt, local);','window.auditInput = local; const mine = net.on ? 0 : tick(realDt, local);')+'</script>');
const browser=await chromium.launch(process.argv.includes('--gpu') ? {channel:'chrome',headless:false} : {args:['--enable-unsafe-swiftshader']});
try{
 const desktop=await browser.newPage({viewport:{width:700,height:1000},hasTouch:false});
 await desktop.goto('file://'+dir+'/index.html');await desktop.waitForFunction(()=>window.FB);
 await desktop.keyboard.press('Space');await desktop.waitForFunction(()=>FB.mode==='run');
 const desktopTime=await desktop.evaluate(()=>FB.timer);await desktop.waitForTimeout(250);
 assert.ok(await desktop.evaluate(()=>FB.timer)>desktopTime,'tall desktop window must keep running');
 await desktop.close();
 const p=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:3});
 const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.addInitScript(()=>{const A=window.AudioContext;window.AudioContext=class extends A{constructor(...args){super(...args);window.auditAudio=this;}};});
 const cdp=await p.context().newCDPSession(p);
 const url='file://'+dir+'/index.html';
 async function load(){await p.goto(url);await p.waitForFunction(()=>window.FB);}
 async function point(x,y,id=1){const r=await p.locator('canvas').last().boundingBox();const rotated=await p.evaluate(()=>innerHeight>innerWidth);return rotated?{x:r.x+(1-y/360)*r.width,y:r.y+x*r.height/640,id}:{x:r.x+x*r.width/640,y:r.y+y*r.height/360,id};}
 async function touch(points){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:await Promise.all(points.map(([x,y],i)=>point(x,y,i+1)))});await p.waitForTimeout(80);return p.evaluate(()=>({mode:FB.mode,input:FB.leaders[0].in}));}
 async function release(){await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await p.waitForTimeout(50);}
 const out={};
 await load();const firstBox=await p.locator('canvas').last().boundingBox();assert.ok(Math.abs(firstBox.height/firstBox.width-16/9)<.01,'cold portrait load rotates immediately');assert.ok(Math.abs(firstBox.x+firstBox.width/2-195)<2&&Math.abs(firstBox.y+firstBox.height/2-422)<2,'rotated canvas stays centred and inside viewport');
 await p.setViewportSize({width:844,height:390});
 await load();out.colourText=await touch([[390,268]]);await release();
 await load();out.colourDot=await touch([[330,234]]);await release();
 await p.evaluate(()=>FB.reset(0,false));
 async function move(points){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:await Promise.all(points.map(([x,y],i)=>point(x,y,i+1)))});await p.waitForTimeout(60);return p.evaluate(()=>window.auditInput);}
 out.left=await touch([[160,230]]);assert.equal(out.left.input.t,-1);await release();
 out.right=await touch([[500,230]]);assert.equal(out.right.input.t,1);await release();
 out.charge=await touch([[160,230],[500,240]]);assert.deepEqual(out.charge.input,{t:0,f:0,b:0,c:1});
 out.oneThumb=await move([[130,230],[500,240]]);assert.deepEqual(out.oneThumb,{t:-1,f:0,b:0,c:1});
 out.bothThumbs=await move([[190,230],[530,240]]);assert.deepEqual(out.bothThumbs,{t:1,f:0,b:0,c:1});
 out.neutral=await move([[160,230],[500,240]]);assert.deepEqual(out.neutral,{t:0,f:0,b:0,c:1});await release();
 out.topSingle=await touch([[160,80]]);assert.deepEqual(out.topSingle.input,{t:-1,f:1,b:0,c:0});await release();
 await touch([[160,230],[500,230]]);
 out.sprint=await move([[130,100],[500,100]]);assert.deepEqual(out.sprint,{t:-1,f:1,b:0,c:0});
 out.brake=await move([[190,330],[500,330]]);assert.deepEqual(out.brake,{t:1,f:0,b:1,c:0});
 out.resumeCharge=await move([[160,230],[500,230]]);assert.deepEqual(out.resumeCharge,{t:0,f:0,b:0,c:1});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[await point(500,230,2)]});await p.waitForTimeout(100);
 assert.deepEqual(await p.evaluate(()=>FB.leaders[0].in),{t:-1,f:0,b:0,c:0});await release();
 assert.deepEqual(await p.evaluate(()=>FB.leaders[0].in),{t:0,f:0,b:0,c:0});
 await touch([[160,230]]);
 await p.setViewportSize({width:800,height:390});await p.waitForTimeout(100);
 assert.deepEqual(await p.evaluate(()=>FB.leaders[0].in),{t:0,f:0,b:0,c:0});await release();
 assert.equal(out.colourText.mode,'title');assert.equal(out.colourDot.mode,'title');
 await p.evaluate(()=>{FB.reset(0,false);Object.assign(FB.leaders[0],{x:0,z:0,yaw:0});FB.units.filter(u=>u.lead===0).forEach((u,i)=>{u.x=-i;u.z=0;});});
 await touch([[160,230],[500,230]]);await p.waitForFunction(()=>FB.leaders[0].wave>0);
 out.ignited=await p.evaluate(()=>FB.leaders[0].wave);
 await move([[160,330],[500,330]]);assert.ok(await p.evaluate(()=>FB.leaders[0].wave>0));await release();
 await p.screenshot({path:dir+'/landscape.png'});
 await p.setViewportSize({width:390,height:844});await p.waitForTimeout(100);const start=await p.evaluate(()=>FB.timer);await p.waitForTimeout(600);out.portrait={before:start,after:await p.evaluate(()=>FB.timer)};
 await load();await touch([[450,318]]);await release();
 assert.equal(await p.evaluate(()=>FB.mode),'run','portrait menu accepts touch');
 const portraitBox=await p.locator('canvas').last().boundingBox();
 assert.ok(Math.abs(portraitBox.height/portraitBox.width-16/9)<.01,'portrait rotates the landscape canvas');
 await touch([[160,230],[500,230]]);assert.equal((await p.evaluate(()=>window.auditInput)).c,1,'portrait two-thumb charge');
 assert.equal((await move([[130,230],[500,230]])).t,-1,'portrait charge steering');await release();
 await p.screenshot({path:dir+'/portrait.png'});
 await p.setViewportSize({width:844,height:390});
 await load();await touch([[450,318]]);await release();await p.waitForTimeout(200);out.audioBefore=await p.evaluate(()=>auditAudio.state);await p.evaluate(()=>auditAudio.suspend());await touch([[100,240]]);await release();out.audioAfterTouch=await p.evaluate(()=>auditAudio.state);
 await p.evaluate(()=>{FB.net.on=1;FB.net.host=1;FB.net.me=0;});await p.setViewportSize({width:390,height:844});await touch([[160,230],[500,230]]);out.onlinePortrait=await move([[120,200],[500,230]]);assert.equal(out.onlinePortrait.c,1);assert.equal(out.onlinePortrait.t,-1);await release();await p.setViewportSize({width:844,height:390});out.onlineTopCentre=await touch([[320,25]]);await release();
 assert.equal(out.audioAfterTouch,'running');assert.equal(out.onlineTopCentre.mode,'title');assert.ok(out.portrait.after>out.portrait.before,'portrait play keeps advancing');assert.deepEqual(errors,[]);
 out.errors=errors;writeFileSync(dir+'/results.json',JSON.stringify(out,null,2));console.log(JSON.stringify(out,null,2));
}finally{await browser.close()}

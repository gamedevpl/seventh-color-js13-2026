import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {build} from 'esbuild';
import {writeFileSync,mkdirSync} from 'node:fs';
const dir=process.cwd()+'/.cache/mobile-audit';
mkdirSync(dir,{recursive:true});
const code=await build({entryPoints:['fireball/src/main.js'],bundle:true,write:false,format:'iife',define:{DEV:'true'}});
// Expose the input before networking: online fixtures do not contact the relay.
writeFileSync(dir+'/index.html','<!doctype html><meta name="viewport" content="width=device-width"><style>body{margin:0;background:#000;overflow:hidden;height:100vh;display:grid;place-items:center}canvas{display:block}html{touch-action:none;overscroll-behavior:none}</style><canvas id=c></canvas><script>'+code.outputFiles[0].text.replace('const mine = tick(dt, local);','window.auditInput = local; const mine = net.on ? 0 : tick(dt, local);')+'</script>');
const browser=await chromium.launch(process.argv.includes('--gpu') ? {channel:'chrome',headless:false} : {args:['--enable-unsafe-swiftshader']});
try{
 const p=await browser.newPage({viewport:{width:844,height:390},isMobile:true,hasTouch:true,deviceScaleFactor:3});
 const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.addInitScript(()=>{const A=window.AudioContext;window.AudioContext=class extends A{constructor(...args){super(...args);window.auditAudio=this;}};});
 const cdp=await p.context().newCDPSession(p);
 const url='file://'+dir+'/index.html';
 async function load(){await p.goto(url);await p.waitForFunction(()=>window.FB);}
 async function point(x,y,id=1){const r=await p.locator('canvas').last().boundingBox();return {x:r.x+x*r.width/640,y:r.y+y*r.height/360,id};}
 async function touch(points){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:await Promise.all(points.map(([x,y],i)=>point(x,y,i+1)))});await p.waitForTimeout(80);return p.evaluate(()=>({mode:FB.mode,input:FB.leaders[0].in}));}
 async function release(){await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await p.waitForTimeout(50);}
 const out={};
 await load();out.colourText=await touch([[390,268]]);await release();
 await load();out.colourDot=await touch([[330,234]]);await release();
 await p.evaluate(()=>FB.reset(0,false));
 async function move(points){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:await Promise.all(points.map(([x,y],i)=>point(x,y,i+1)))});await p.waitForTimeout(60);return p.evaluate(()=>window.auditInput);}
 out.left=await touch([[160,230]]);assert.equal(out.left.input.t,-1);await release();
 out.right=await touch([[500,230]]);assert.equal(out.right.input.t,1);await release();
 out.sprint=await touch([[160,230],[500,240]]);assert.deepEqual(out.sprint.input,{t:0,f:1,b:0,c:0});
 out.oneThumb=await move([[130,230],[500,240]]);assert.deepEqual(out.oneThumb,{t:-1,f:1,b:0,c:0});
 out.bothThumbs=await move([[190,230],[530,240]]);assert.deepEqual(out.bothThumbs,{t:1,f:1,b:0,c:0});
 out.neutral=await move([[160,230],[500,240]]);assert.deepEqual(out.neutral,{t:0,f:1,b:0,c:0});await release();
 out.chargeLeft=await touch([[160,230],[500,80]]);assert.deepEqual(out.chargeLeft.input,{t:-1,f:0,b:0,c:1});await release();
 out.brake=await touch([[320,330]]);assert.equal(out.brake.input.b,1);await release();
 assert.deepEqual(await p.evaluate(()=>FB.leaders[0].in),{t:0,f:0,b:0,c:0});
 await touch([[160,230]]);
 await p.setViewportSize({width:800,height:390});await p.waitForTimeout(100);
 assert.deepEqual(await p.evaluate(()=>FB.leaders[0].in),{t:0,f:0,b:0,c:0});await release();
 assert.equal(out.colourText.mode,'title');assert.equal(out.colourDot.mode,'title');
 await p.screenshot({path:dir+'/landscape.png'});
 await p.setViewportSize({width:390,height:844});await p.waitForTimeout(100);const start=await p.evaluate(()=>FB.timer);await p.waitForTimeout(600);out.portrait={before:start,after:await p.evaluate(()=>FB.timer)};
 await p.setViewportSize({width:844,height:390});
 await load();await touch([[450,318]]);await release();await p.waitForTimeout(200);out.audioBefore=await p.evaluate(()=>auditAudio.state);await p.evaluate(()=>auditAudio.suspend());await touch([[100,240]]);await release();out.audioAfterTouch=await p.evaluate(()=>auditAudio.state);
 await p.evaluate(()=>{FB.net.on=1;FB.net.host=1;FB.net.me=0;});await p.setViewportSize({width:390,height:844});await touch([[160,230],[500,80]]);out.onlinePortrait=await move([[120,200],[500,80]]);assert.equal(out.onlinePortrait.c,1);assert.equal(out.onlinePortrait.t,-1);await release();await p.setViewportSize({width:844,height:390});out.onlineTopCentre=await touch([[320,25]]);await release();
 assert.equal(out.audioAfterTouch,'running');assert.equal(out.onlineTopCentre.mode,'title');assert.equal(out.portrait.before,out.portrait.after);assert.deepEqual(errors,[]);
 out.errors=errors;writeFileSync(dir+'/results.json',JSON.stringify(out,null,2));console.log(JSON.stringify(out,null,2));
}finally{await browser.close()}

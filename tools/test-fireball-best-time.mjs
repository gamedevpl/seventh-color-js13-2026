import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {chromium} from 'playwright-core';
const dir=process.cwd()+'/.cache/best-time';mkdirSync(dir,{recursive:true});
const source=readFileSync('fireball/src/main.js','utf8')+`
if(DEV) window.timeProbe={finish(t,win){newRun();mode='run';timer=t;for(const u of units)u.st=3;if(win)leaders[0].st=0;},get best(){return best;}};
`;
const {outputFiles}=await build({stdin:{contents:source,resolveDir:process.cwd()+'/fireball/src'},bundle:true,write:false,format:'iife',define:{DEV:'true'}});
writeFileSync(dir+'/test.html','<!doctype html><style>body{margin:0;display:grid;place-items:center;height:100vh;background:#000}canvas{display:block}</style><canvas id=c></canvas><script>'+outputFiles[0].text+'</script>');
const browser=await chromium.launch({args:['--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:960,height:540}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('file://'+dir+'/test.html');await page.waitForFunction(()=>window.timeProbe);
 await page.evaluate(()=>localStorage.removeItem('ufTime'));
 async function finish(time,win){await page.evaluate(([t,w])=>timeProbe.finish(t,w),[time,win]);await page.waitForFunction(()=>FB.mode==='end');return page.evaluate(()=>({timer:FB.timer,best:timeProbe.best,stored:+localStorage.ufTime||0}));}
 const first=await finish(90,true);assert.ok(first.best>=90&&first.best<92);assert.equal(first.best,first.stored);
 await page.waitForTimeout(500);assert.equal(await page.evaluate(()=>FB.timer),first.timer,'aftermath must not add time');
 assert.equal((await finish(120,true)).best,first.best,'slower win cannot replace the best');
 const fast=await finish(60,true);assert.ok(fast.best>=60&&fast.best<62);assert.equal(fast.stored,fast.best);
 assert.equal((await finish(10,false)).stored,fast.best,'defeat cannot improve best');
 await page.reload();await page.waitForFunction(()=>window.timeProbe);
 assert.equal((await finish(20,false)).best,fast.best,'best survives reload');
 await page.evaluate(()=>{timeProbe.finish(1,true);FB.net.on=1;FB.net.host=0;FB.net.me=0;});await page.waitForTimeout(250);
 assert.equal(await page.evaluate(()=>FB.mode),'run','multiplayer has no solo result');
 assert.equal(await page.evaluate(()=>+localStorage.ufTime),fast.best,'multiplayer cannot write best');
 await page.evaluate(()=>FB.net.on=0);
 await finish(50,true);await page.waitForTimeout(2000);await page.screenshot({path:dir+'/victory.png'});
 await page.evaluate(()=>Object.defineProperty(window,'localStorage',{get(){throw Error('storage disabled')}}));
 await page.evaluate(()=>timeProbe.finish(30,true));await page.waitForFunction(()=>FB.mode==='end');
 assert.deepEqual(errors,[]);console.log('PASS win-only minimum, stable finish time, persistence, multiplayer exclusion and blocked storage');
}finally{await browser.close()}

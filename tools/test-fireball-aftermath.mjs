import{chromium}from'playwright-core';import{build}from'esbuild';import{writeFileSync,mkdirSync}from'node:fs';import assert from'node:assert/strict';
const dir='.cache/fireball-aftermath';mkdirSync(dir,{recursive:true});
const code=await build({entryPoints:['fireball/src/main.js'],bundle:true,write:false,format:'iife',define:{DEV:'true'}});
writeFileSync(dir+'/index.html','<!doctype html><style>body{margin:0;background:#000;display:grid;place-items:center;height:100vh}canvas{display:block}</style><canvas id=c></canvas><script>'+code.outputFiles[0].text+'</script>');
const b=await chromium.launch(process.argv.includes('--gpu')?{channel:'chrome',headless:false}:{args:['--enable-unsafe-swiftshader']});try{
 const p=await b.newPage({viewport:{width:960,height:540},recordVideo:{dir:dir+'/video',size:{width:960,height:540}}}),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto('file://'+process.cwd()+'/'+dir+'/index.html');
 await p.evaluate(()=>{FB.reset(0,false);for(const u of FB.units)u.st=3;for(const L of FB.leaders)L.ai=null;const[P,R]=FB.leaders;Object.assign(P,{st:0,x:0,z:0,yaw:0,spd:37,wave:21,charge:1,chg:1,burn:5});Object.assign(R,{st:0,x:2,z:0,hearts:1});const all=FB.units.filter(u=>!u.hearts),q=all[0];Object.assign(q,{st:0,lead:1,col:R.col,x:1,z:0});window.Q=q;all.slice(1,21).forEach((u,i)=>Object.assign(u,{st:0,lead:0,col:P.col,x:-2,z:(i%5-2)*.6}));});
 await p.waitForFunction(()=>FB.mode==='end');
 const a=await p.evaluate(()=>({victory:FB.victory,wave:FB.leaders[0].wave,y:Q.y,x:Q.x,burn:FB.leaders[0].burn}));assert.ok(a.victory&&a.wave);
 await p.keyboard.press('Space');await p.waitForTimeout(400);assert.equal(await p.evaluate(()=>FB.mode),'end');
 const c=await p.evaluate(()=>({x:Q.x,y:Q.y,burn:FB.leaders[0].burn}));assert.ok(c.x!==a.x||c.y!==a.y);assert.ok(c.burn<a.burn);await p.screenshot({path:dir+'/victory-motion.png'});
 await p.waitForTimeout(5500);assert.ok(await p.evaluate(()=>FB.victory&&FB.leaders[0].st===0&&!FB.leaders[0].wave));
 await p.evaluate(()=>{FB.reset(0,false);FB.leaders[0].st=3;for(const L of FB.leaders.slice(1))Object.assign(L,{wave:11,charge:1,chg:1,burn:2,hearts:3});});await p.waitForFunction(()=>FB.mode==='end');assert.equal(await p.evaluate(()=>FB.victory),false);
 await p.waitForTimeout(2600);assert.ok(await p.evaluate(()=>!FB.victory&&FB.leaders[0].st===3&&FB.leaders.slice(1).every(L=>L.ai===null&&L.hearts===3&&!L.wave)));
 await p.screenshot({path:dir+'/defeat.png'});assert.deepEqual(errors,[]);const video=p.video();await p.close();await video.saveAs(dir+'/aftermath.webm');console.log('PASS victory debris, rainbow burnout, stable result, restart guard and no post-defeat AI combat');
}finally{await b.close()}

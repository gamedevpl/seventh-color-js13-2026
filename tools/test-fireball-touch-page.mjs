import{chromium}from'playwright-core';import{readFileSync,mkdirSync}from'node:fs';import assert from'node:assert/strict';
const path=process.cwd()+'/build/fireball/index.html';
assert.ok(readFileSync(path,'utf8').includes('-webkit-touch-callout:none'));
const browser=await chromium.launch({args:['--enable-unsafe-swiftshader']});
try{
 const p=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),errors=[];
 p.on('pageerror',e=>errors.push(e.message));
 await p.goto('file://'+path);await p.waitForSelector('canvas + canvas');
 const rotatedBox=await p.locator('canvas').last().boundingBox();
 assert.ok(Math.abs(rotatedBox.height/rotatedBox.width-16/9)<.01,'production cold portrait load rotates');
 assert.ok(Math.abs(rotatedBox.x+rotatedBox.width/2-195)<2&&Math.abs(rotatedBox.y+rotatedBox.height/2-422)<2,'production rotation is centred');
 await p.setViewportSize({width:844,height:390});await p.waitForTimeout(100);
 const hud=p.locator('canvas').last(),box=await hud.boundingBox();
 assert.equal(await hud.evaluate(c=>getComputedStyle(c).userSelect),'none');
 assert.equal(await hud.evaluate(c=>c.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}))),false);
 await hud.evaluate(c=>c.addEventListener('pointerdown',e=>window.touchPrevented=e.defaultPrevented));
 await p.touchscreen.tap(box.x+box.width*.5,box.y+box.height*318/360);await p.waitForTimeout(200);
 assert.equal(await p.evaluate(()=>touchPrevented),true);
 const cdp=await p.context().newCDPSession(p);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width*.2,y:box.y+box.height*.7,id:1}]});
 await p.waitForTimeout(1200);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 assert.equal(await p.evaluate(()=>getSelection().toString()),'');assert.deepEqual(errors,[]);
 mkdirSync('.cache/spatial',{recursive:true});await p.screenshot({path:'.cache/spatial/phone.png'});
 console.log('PASS production touch: selection, context menu, default gestures, long press and no runtime errors');
}finally{await browser.close()}
